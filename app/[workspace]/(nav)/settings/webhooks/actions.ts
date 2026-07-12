"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMemberPage, requireRolePage } from "@/lib/tenant";
import { ALL_EVENTS } from "@/lib/webhooks/emit";

const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  url: z.url().max(500),
  events: z.array(z.string()).min(1),
  format: z.enum(["raw", "slack"]).default("raw"),
});

export type CreateWebhookState =
  | { ok: true; secret: string }
  | { ok: false; error: string }
  | null;

/**
 * Mint a webhook. The raw HMAC secret is returned exactly once in the action
 * state so the page can show a copy-once banner (same pattern as API keys);
 * afterwards only the row (with its full secret, used server-side to sign
 * deliveries) lives in the DB — nothing re-reveals it in the UI.
 */
export async function createWebhook(
  _prev: CreateWebhookState,
  formData: FormData,
): Promise<CreateWebhookState> {
  const url = formData.get("url");
  const events = formData.getAll("events").map(String);
  const data = createSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    url,
    events,
    format: formData.get("format") || "raw",
  });

  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);

  const validEvents = data.events.filter((e) =>
    (ALL_EVENTS as readonly string[]).includes(e),
  );
  if (validEvents.length === 0) {
    return { ok: false, error: "ERR_NO_VALID_EVENTS" };
  }

  const secret = randomBytes(32).toString("hex");
  await db.insert(schema.webhooks).values({
    workspaceId: workspace.id,
    url: data.url,
    secret,
    events: validEvents,
    enabled: true,
    format: data.format,
  });

  revalidatePath(`/${data.workspaceSlug}/settings/webhooks`);
  return { ok: true, secret };
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

  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);

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

  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);

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

const retrySchema = z.object({
  workspaceSlug: z.string().min(1),
  deliveryId: z.string().min(1),
});

/** Owner/admin: reset a failed delivery to pending so the cron picks it up again. */
export async function retryDelivery(formData: FormData) {
  const data = retrySchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    deliveryId: formData.get("deliveryId"),
  });

  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);

  // Ownership check via join — a delivery id from another workspace 404s
  // silently rather than being reset.
  const [row] = await db
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .innerJoin(
      schema.webhooks,
      eq(schema.webhooks.id, schema.webhookDeliveries.webhookId),
    )
    .where(
      and(
        eq(schema.webhookDeliveries.id, data.deliveryId),
        eq(schema.webhooks.workspaceId, workspace.id),
      ),
    )
    .limit(1);
  if (!row) throw new Error("NOT_FOUND");

  await db
    .update(schema.webhookDeliveries)
    .set({
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    })
    .where(eq(schema.webhookDeliveries.id, data.deliveryId));

  revalidatePath(`/${data.workspaceSlug}/settings/webhooks`);
}
