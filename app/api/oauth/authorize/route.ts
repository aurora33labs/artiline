import { NextResponse } from "next/server";
import { getPublicUrl } from "mcp-handler";
import { auth } from "@/auth";
import {
  validateAuthorize,
  errorRedirectUrl,
  type AuthorizeInput,
} from "@/lib/oauth-authorize";

export const runtime = "nodejs";

/**
 * OAuth authorization endpoint (GET). Validates the request, then either:
 * - renders an error page (bad client / unregistered redirect_uri — never
 *   redirect to an unvalidated URI),
 * - redirects the error back to the client (post-redirect_uri validation),
 * - bounces an unauthenticated user to /login?callbackUrl=<this url>, or
 * - forwards a logged-in user to the consent page /oauth/authorize with the
 *   validated params.
 */
function errorPage(message: string): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Authorization error</title></head><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>No se pudo autorizar</h1><p>${message}</p></body></html>`;
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const url = getPublicUrl(req);
  const origin = url.origin;
  const p = url.searchParams;
  const input: AuthorizeInput = {
    client_id: p.get("client_id"),
    redirect_uri: p.get("redirect_uri"),
    response_type: p.get("response_type"),
    code_challenge: p.get("code_challenge"),
    code_challenge_method: p.get("code_challenge_method"),
    state: p.get("state"),
    scope: p.get("scope"),
    resource: p.get("resource"),
  };

  const v = await validateAuthorize(input, origin);
  if (v.kind === "hard_error") return errorPage(v.message);
  if (v.kind === "redirect_error") {
    return NextResponse.redirect(
      errorRedirectUrl(v.redirectUri, v.error, v.state),
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    // Bounce through login, returning to this exact authorize URL afterwards.
    const callbackUrl = url.pathname + url.search;
    const login = new URL("/login", origin);
    login.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(login.toString());
  }

  // Logged in → hand off to the consent page with the validated params.
  const consent = new URL("/oauth/authorize", origin);
  consent.searchParams.set("client_id", v.value.client.id);
  consent.searchParams.set("redirect_uri", v.value.redirectUri);
  consent.searchParams.set("code_challenge", v.value.codeChallenge);
  consent.searchParams.set("code_challenge_method", "S256");
  if (v.value.state) consent.searchParams.set("state", v.value.state);
  consent.searchParams.set("scope", v.value.scopes.join(" "));
  if (v.value.resource) consent.searchParams.set("resource", v.value.resource);
  return NextResponse.redirect(consent.toString());
}
