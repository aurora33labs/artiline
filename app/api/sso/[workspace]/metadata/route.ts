import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * SP metadata XML. The customer registers this in their IdP (entityID + ACS).
 * Public, non-sensitive: it only describes our SP endpoints.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  const { workspace } = await params;
  const origin = req.nextUrl.origin;

  const { resolveWorkspaceSso } = await import("@/lib/cloud/sso");
  const sso = await resolveWorkspaceSso(workspace);
  if (!sso) return new NextResponse("Not found", { status: 404 });

  const ep = {
    spEntityID: `${origin}/api/sso/${workspace}/metadata`,
    acsUrl: `${origin}/api/sso/${workspace}/callback`,
  };

  const { spMetadata } = await import("@/lib/cloud/saml");
  return new NextResponse(spMetadata(ep), {
    headers: { "content-type": "application/xml" },
  });
}
