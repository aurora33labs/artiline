import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/license";
import { createUserSession, setSessionCookie } from "@/lib/auth-session";

export const runtime = "nodejs";

/**
 * Assertion Consumer Service. Receives the IdP's signed SAML response, resolves
 * the identity, applies the domain allowlist + JIT provisioning, then issues a
 * database session and redirects into the workspace.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  const { workspace } = await params;
  const origin = req.nextUrl.origin;
  // 303 so the browser converts the IdP's POST into a GET on the target.
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/sso/${workspace}?error=${reason}`, origin),
      303,
    );

  const { resolveWorkspaceSso } = await import("@/lib/cloud/sso");
  const sso = await resolveWorkspaceSso(workspace);
  if (!sso || !sso.enabled) return fail("disabled");
  if (!(await isFeatureEnabled("sso_saml", { workspaceId: sso.workspace.id }))) {
    return fail("disabled");
  }

  let samlResponse: FormDataEntryValue | null = null;
  try {
    const form = await req.formData();
    samlResponse = form.get("SAMLResponse");
  } catch {
    return fail("invalid");
  }
  if (typeof samlResponse !== "string") return fail("invalid");

  const ep = {
    spEntityID: `${origin}/api/sso/${workspace}/metadata`,
    acsUrl: `${origin}/api/sso/${workspace}/callback`,
  };

  let identity: { email: string; name: string | null };
  try {
    const { validateResponse } = await import("@/lib/cloud/saml");
    identity = await validateResponse(sso.config, ep, samlResponse);
  } catch {
    return fail("assertion");
  }

  const domain = identity.email.split("@")[1] ?? "";
  const domainOk =
    sso.config.allowedDomains.length > 0 &&
    sso.config.allowedDomains.includes(domain);

  // Find or JIT-create the user.
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, identity.email))
    .limit(1);

  // Existing members always pass; otherwise the domain must be allowlisted.
  const member = user
    ? await db
        .select({ userId: schema.workspaceMembers.userId })
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, sso.workspace.id),
            eq(schema.workspaceMembers.userId, user.id),
          ),
        )
        .limit(1)
        .then((r) => r[0])
    : undefined;

  if (!member && !domainOk) return fail("domain");

  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({
        email: identity.email,
        name: identity.name,
        emailVerified: new Date(),
      })
      .returning();
  }

  if (!member) {
    await db
      .insert(schema.workspaceMembers)
      .values({
        workspaceId: sso.workspace.id,
        userId: user.id,
        role: "member",
      })
      .onConflictDoNothing();
  }

  const { sessionToken, expires } = await createUserSession(user.id);
  await setSessionCookie(sessionToken, expires);

  return NextResponse.redirect(new URL(`/${workspace}`, origin), 303);
}
