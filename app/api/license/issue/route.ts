import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { currentEdition } from "@/lib/license";
import { requireMember, requireRole } from "@/lib/tenant";

export const runtime = "nodejs";

const ACTIVE = new Set(["trialing", "active", "past_due"]);

/**
 * Issue a license JWT for a paid workspace. Self-host customers who pay for
 * hosted features get a JWT to set as LICENSE_KEY on their own deployment.
 *
 * Implementation: stub until ES256 signing keypair is provisioned (placeholder
 * key in lib/license/keys.ts). Once the prod private key is available, sign
 * with `jose` (or Web Crypto) over a payload like:
 *   { sub: workspaceId, tier, exp: now + 30d, iat, iss: "artiline.app" }
 */
export async function POST(req: Request) {
  if (currentEdition() !== "cloud") {
    return NextResponse.json({ error: "OSS_EDITION" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    workspaceSlug?: string;
  };
  if (!body.workspaceSlug) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const { workspace, role } = await requireMember(body.workspaceSlug);
  requireRole(role, ["owner"]);

  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.workspaceId, workspace.id))
    .limit(1);

  if (!sub || !ACTIVE.has(sub.status)) {
    return NextResponse.json(
      { error: "NO_ACTIVE_SUBSCRIPTION" },
      { status: 402 },
    );
  }

  // TODO(license): sign real JWT once private key is provisioned. For now,
  // return a development-bypass token compatible with verifyLicenseJWT in
  // dev mode (LICENSE_DEV_BYPASS=1).
  const devToken = `dev:${sub.tier}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return NextResponse.json({
    license_key: devToken,
    tier: sub.tier,
    expires_at: expiresAt.toISOString(),
    note: "Dev token. Real ES256 JWT signing pending key provisioning.",
  });
}
