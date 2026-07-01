"use server";

import { randomBytes, createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMemberPage, requireRolePage } from "@/lib/tenant";

export type CreateKeyState =
  | { ok: true; token: string; name: string }
  | { ok: false; error: string }
  | null;

/**
 * Mint a workspace API token. The raw token (`artl_<hex>`) is returned exactly
 * once in the action state so the page can show a copy-once banner; only its
 * sha256 hash + a short prefix are stored. Shaped for `useActionState`.
 */
export async function createApiKey(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const { workspace, role, session } = await requireMemberPage(workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);

  if (name.length < 1 || name.length > 80) {
    return { ok: false, error: "El nombre debe tener entre 1 y 80 caracteres." };
  }

  const rawToken = `artl_${randomBytes(32).toString("hex")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const tokenPrefix = rawToken.slice(0, 12);

  await db.insert(schema.apiKeys).values({
    workspaceId: workspace.id,
    userId: session.user.id,
    name,
    tokenHash,
    tokenPrefix,
    role: "member",
  });

  revalidatePath(`/${workspaceSlug}/settings/api-keys`);
  return { ok: true, token: rawToken, name };
}

/**
 * Revoke a key (soft delete via `revokedAt`) so it stops authenticating while
 * its name/last-used history stay visible. Scoped to the workspace.
 */
export async function revokeApiKey(formData: FormData) {
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "");
  const keyId = String(formData.get("keyId") ?? "");

  const { workspace, role } = await requireMemberPage(workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);

  await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.apiKeys.id, keyId),
        eq(schema.apiKeys.workspaceId, workspace.id),
      ),
    );

  revalidatePath(`/${workspaceSlug}/settings/api-keys`);
}
