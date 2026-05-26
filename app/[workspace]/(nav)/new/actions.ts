"use server";

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/tenant";
import { recordEvent } from "@/lib/activity";

const schemaInput = z.object({
  workspaceSlug: z.string().min(1),
  type: z.enum(["html", "markdown", "code"]),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  language: z.string().max(50).optional().nullable(),
  visibility: z.enum(["internal_pw", "internal", "public_pw", "public"]),
  password: z.string().optional().nullable(),
});

export async function createArtifact(formData: FormData) {
  const raw = {
    workspaceSlug: formData.get("workspaceSlug"),
    type: formData.get("type"),
    title: formData.get("title"),
    content: formData.get("content"),
    language: formData.get("language") || null,
    visibility: formData.get("visibility"),
    password: formData.get("password") || null,
  };
  const data = schemaInput.parse(raw);

  const { session, workspace } = await requireMember(data.workspaceSlug);

  const needsPw =
    data.visibility === "internal_pw" || data.visibility === "public_pw";
  if (needsPw && (!data.password || data.password.length < 4)) {
    throw new Error("ERR_PASSWORD_TOO_SHORT");
  }

  const passwordHash =
    needsPw && data.password ? await bcrypt.hash(data.password, 10) : null;

  const created = await db.transaction(async (tx) => {
    const [artifact] = await tx
      .insert(schema.artifacts)
      .values({
        workspaceId: workspace.id,
        authorUserId: session.user.id,
        slug: nanoid(10),
        visibility: data.visibility,
        passwordHash,
      })
      .returning();

    const [v1] = await tx
      .insert(schema.artifactVersions)
      .values({
        artifactId: artifact.id,
        versionNumber: 1,
        type: data.type,
        content: data.content,
        language: data.language,
        title: data.title,
        message: null,
        authorUserId: session.user.id,
        reviewStatus: "approved",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
      })
      .returning({ id: schema.artifactVersions.id });

    await tx
      .update(schema.artifacts)
      .set({ currentVersionId: v1.id })
      .where(eq(schema.artifacts.id, artifact.id));

    return artifact;
  });

  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "artifact.created",
    subjectType: "artifact",
    subjectId: created.id,
    payload: { slug: created.slug, title: data.title, type: data.type },
  }).catch(() => {});

  revalidatePath(`/${workspace.slug}`);
  redirect(`/${workspace.slug}/a/${created.slug}`);
}
