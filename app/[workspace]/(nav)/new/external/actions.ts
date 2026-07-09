"use server";

import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { assertCanCreateArtifact } from "@/lib/limits";
import { newVersionId } from "@/lib/artifact-content";
import { recordEvent } from "@/lib/activity";
import { emitEvent } from "@/lib/webhooks/emit";

const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  url: z.url(),
});

/**
 * Register an external site for review: creates an artifact of type
 * "external" (visibility internal — comments come in through the widget's own
 * public-key auth, not the normal artifact viewer) with a single stub version
 * so every list/join that expects `currentVersionId` keeps working unchanged.
 */
export async function createExternalSite(formData: FormData) {
  const data = createSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    name: formData.get("name"),
    url: formData.get("url"),
  });

  const { workspace, session } = await requireMemberPage(data.workspaceSlug);
  await assertCanCreateArtifact(workspace.id);

  const origin = new URL(data.url).origin;
  const versionId = newVersionId();
  const publicKey = `arev_${randomBytes(16).toString("hex")}`;

  const artifact = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.artifacts)
      .values({
        workspaceId: workspace.id,
        authorUserId: session.user.id,
        slug: nanoid(10),
        visibility: "internal",
      })
      .returning();

    await tx.insert(schema.artifactVersions).values({
      id: versionId,
      artifactId: created.id,
      versionNumber: 1,
      type: "external",
      title: data.name,
      authorUserId: session.user.id,
      reviewStatus: "approved",
      reviewedByUserId: session.user.id,
      reviewedAt: new Date(),
    });

    await tx
      .update(schema.artifacts)
      .set({ currentVersionId: versionId })
      .where(eq(schema.artifacts.id, created.id));

    await tx.insert(schema.externalSites).values({
      artifactId: created.id,
      origin,
      publicKey,
      enabled: true,
    });

    return created;
  });

  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "external.site_created",
    subjectType: "artifact",
    subjectId: artifact.id,
    payload: { slug: artifact.slug, name: data.name, origin },
  }).catch(() => {});

  await emitEvent(workspace.id, "artifact.created", {
    artifactId: artifact.id,
    slug: artifact.slug,
    title: data.name,
    type: "external",
    visibility: "internal",
    actorName: session.user.name ?? session.user.email,
  }).catch(() => {});

  redirect(`/${data.workspaceSlug}/a/${artifact.slug}`);
}

const rotateSchema = z.object({
  workspaceSlug: z.string().min(1),
  artifactId: z.string().min(1),
});

export async function rotateExternalKey(formData: FormData) {
  const data = rotateSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    artifactId: formData.get("artifactId"),
  });
  const { workspace, role, session } = await requireMemberPage(data.workspaceSlug);
  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, data.artifactId))
    .limit(1);
  if (!artifact || artifact.workspaceId !== workspace.id) throw new Error("NOT_FOUND");
  const isManager = role === "owner" || role === "admin";
  const isAuthor = artifact.authorUserId === session.user.id;
  if (!isManager && !isAuthor) throw new Error("FORBIDDEN");

  await db
    .update(schema.externalSites)
    .set({ publicKey: `arev_${randomBytes(16).toString("hex")}` })
    .where(eq(schema.externalSites.artifactId, data.artifactId));
}

const toggleSchema = z.object({
  workspaceSlug: z.string().min(1),
  artifactId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

export async function toggleExternalSite(formData: FormData) {
  const data = toggleSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    artifactId: formData.get("artifactId"),
    enabled: formData.get("enabled"),
  });
  const { workspace, role, session } = await requireMemberPage(data.workspaceSlug);
  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, data.artifactId))
    .limit(1);
  if (!artifact || artifact.workspaceId !== workspace.id) throw new Error("NOT_FOUND");
  const isManager = role === "owner" || role === "admin";
  const isAuthor = artifact.authorUserId === session.user.id;
  if (!isManager && !isAuthor) throw new Error("FORBIDDEN");

  await db
    .update(schema.externalSites)
    .set({ enabled: data.enabled === "true" })
    .where(eq(schema.externalSites.artifactId, data.artifactId));
}
