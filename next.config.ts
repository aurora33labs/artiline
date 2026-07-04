import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        // Default: block clickjacking across the app.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        // Public artifact embeds are meant to be framed from any origin.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        // Multiple CSP headers get intersected by the browser (most restrictive
        // wins), so the raw content route must be excluded from the default
        // 'self' rule above — it's the innermost iframe of an /embed page that
        // may itself be framed by a third-party site. The route handler also
        // sets this directly; kept consistent here so the two never diverge.
        source: "/api/artifacts/raw/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
