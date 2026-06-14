import "server-only";
import { lookup } from "node:dns/promises";
import type { Page } from "playwright";

/**
 * SSRF guard for headless Chromium that renders user-supplied artifact HTML.
 * Without this, an artifact could embed `<img src="http://169.254.169.254/…">`
 * (or any internal host) and the server-side render would happily fetch it,
 * leaking cloud metadata / probing the private network. We intercept every
 * sub-resource request and block non-web schemes and private/metadata hosts.
 *
 * data:/blob: are allowed (inline, no network — artifacts legitimately embed
 * base64 fonts/images). Public http(s) hosts are allowed (CDN assets); only
 * private, loopback, link-local, ULA and metadata targets are denied.
 */

function ipv4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = p;
  if (a === 0 || a === 127) return true; // this-network / loopback
  if (a === 10) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function ipv6Blocked(ip: string): boolean {
  const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (x === "::1" || x === "::") return true; // loopback / unspecified
  if (x.startsWith("fe80")) return true; // link-local
  if (x.startsWith("fc") || x.startsWith("fd")) return true; // ULA fc00::/7
  const mapped = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]);
  return false;
}

const METADATA_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

async function isBlockedHost(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (METADATA_HOSTS.has(h)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return ipv4Blocked(h);
  if (h.includes(":")) return ipv6Blocked(h);
  // Resolve the name and reject if ANY address is private/metadata (defends
  // against DNS rebinding to an internal IP). Fail closed on resolution errors.
  try {
    const addrs = await lookup(h, { all: true });
    return addrs.some((a) =>
      a.family === 6 ? ipv6Blocked(a.address) : ipv4Blocked(a.address),
    );
  } catch {
    return true;
  }
}

/** Attach the SSRF request filter to a page before loading user HTML. */
export async function guardPageRequests(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    try {
      const u = new URL(route.request().url());
      const scheme = u.protocol;
      if (scheme === "data:" || scheme === "blob:" || scheme === "about:") {
        return route.continue();
      }
      if (scheme !== "http:" && scheme !== "https:") {
        return route.abort(); // file:, ftp:, chrome:, etc.
      }
      if (await isBlockedHost(u.hostname)) return route.abort();
      return route.continue();
    } catch {
      return route.abort();
    }
  });
}
