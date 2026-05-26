import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/license";

export const runtime = "nodejs";

/**
 * SP-initiated SAML login. Validates the workspace has SSO enabled and the
 * feature gate passes, then redirects the browser to the customer's IdP.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  const { workspace } = await params;
  const origin = req.nextUrl.origin;
  const loginFallback = new URL("/login", origin);

  const { resolveWorkspaceSso } = await import("@/lib/cloud/sso");
  const sso = await resolveWorkspaceSso(workspace);
  if (!sso || !sso.enabled) return NextResponse.redirect(loginFallback);

  if (!(await isFeatureEnabled("sso_saml", { workspaceId: sso.workspace.id }))) {
    return NextResponse.redirect(loginFallback);
  }

  const ep = {
    spEntityID: `${origin}/api/sso/${workspace}/metadata`,
    acsUrl: `${origin}/api/sso/${workspace}/callback`,
  };

  const { getLoginRedirectUrl } = await import("@/lib/cloud/saml");
  const url = await getLoginRedirectUrl(sso.config, ep, `/${workspace}`);
  return NextResponse.redirect(url);
}
