import { NextResponse, type NextRequest } from "next/server";

/**
 * Custom-domain rewriter. When a request lands on a host that is registered
 * to a workspace via workspace_domains, rewrite the URL to inject the
 * workspace slug as the first path segment. Production hosting must use the
 * canonical `app.artiline.app` domain for all non-custom-domain requests.
 *
 * Note (Next 16): middleware was renamed to "proxy" in some sources but
 * middleware.ts still works on the edge runtime for path rewrites.
 *
 * Lookup table is hydrated lazily via fetch to a small internal route to
 * avoid importing the full Drizzle bundle into the edge runtime.
 */

const APP_HOST =
  process.env.NEXT_PUBLIC_ARTILINE_HOST ??
  process.env.AUTH_URL?.replace(/^https?:\/\//, "") ??
  "localhost:1355";

function isAppHost(host: string): boolean {
  const stripped = host.toLowerCase().replace(/:\d+$/, "");
  const app = APP_HOST.toLowerCase().replace(/:\d+$/, "");
  return (
    stripped === app ||
    stripped === "localhost" ||
    stripped.endsWith(".vercel.app") ||
    stripped.endsWith(".railway.app")
  );
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  if (!host) return NextResponse.next();
  if (isAppHost(host)) return NextResponse.next();

  // Custom domain candidate. Lookup workspace slug from internal API.
  try {
    const lookup = await fetch(
      new URL(`/api/internal/host-lookup?host=${encodeURIComponent(host)}`, req.url),
      { cache: "no-store" },
    );
    if (!lookup.ok) return NextResponse.next();
    const { slug } = (await lookup.json()) as { slug?: string };
    if (!slug) return NextResponse.next();

    const url = req.nextUrl.clone();
    if (!url.pathname.startsWith(`/${slug}`)) {
      url.pathname = `/${slug}${url.pathname}`;
    }
    return NextResponse.rewrite(url);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\.[a-zA-Z0-9]+).*)"],
};
