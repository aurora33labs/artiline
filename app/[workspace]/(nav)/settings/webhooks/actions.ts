"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember, requireRole } from "@/lib/tenant";
import { ALL_EVENTS } from "@/lib/webhooks/emit";

const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  url: z.url().max(500),
  events: z.array(z.string()).min(1),
});

export async function createWebhook(formData: FormData) {
  const url = formData.get("url");
  const events = formData.getAll("events").map(String);
  const data = createSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    url,
    events,
  });

  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  const validEvents = data.events.filter((e) =>
    (ALL_EVENTS as readonly string[]).includes(e),
  );
  if (validEvents.length === 0) throw new Error("ERR_NO_VALID_EVENTS");

  await db.insert(schema.webhooks).values({
    workspaceId: workspace.id,
    url: data.url,
    secret: randomBytes(32).toString("hex"),
    events: validEvents,
    enabled: true,
  });

  revalidatePath(`/${data.workspaceSlug}/settings/webhooks`);
}

const toggleSchema = z.object({
  workspaceSlug: z.string().min(1),
  webhookId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

export async function toggleWebhook(formData: FormData) {
  const data = toggleSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    webhookId: formData.get("webhookId"),
    enabled: formData.get("enabled"),
  });

  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  await db
    .update(schema.webhooks)
    .set({ enabled: data.enabled === "true" })
    .where(
      and(
        eq(schema.webhooks.id, data.webhookId),
        eq(schema.webhooks.workspaceId, workspace.id),
      ),
    );

  revalidatePath(`/${data.workspaceSlug}/settings/webhooks`);
}

const deleteSchema = z.object({
  workspaceSlug: z.string().min(1),
  webhookId: z.string().min(1),
});

export async function deleteWebhook(formData: FormData) {
  const data = deleteSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    webhookId: formData.get("webhookId"),
  });

  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  await db
    .delete(schema.webhooks)
    .where(
      and(
        eq(schema.webhooks.id, data.webhookId),
        eq(schema.webhooks.workspaceId, workspace.id),
      ),
    );

  revalidatePath(`/${data.workspaceSlug}/settings/webhooks`);
}
