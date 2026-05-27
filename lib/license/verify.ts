import "server-only";
import { TIER_ORDER, type LicenseTier } from "@/lib/features";
import { LICENSE_PUBLIC_KEY_PEM } from "./keys";

export type VerifyResult =
  | { ok: true; tier: LicenseTier; expiresAt?: Date; sub: string }
  | { ok: false; reason: string };

function b64urlToBytes(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = Buffer.from(b64, "base64");
  const out = new ArrayBuffer(bin.length);
  new Uint8Array(out).set(bin);
  return out;
}

function pemToBytes(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = Buffer.from(body, "base64");
  const out = new ArrayBuffer(bin.length);
  new Uint8Array(out).set(bin);
  return out;
}

function isTier(v: unknown): v is LicenseTier {
  return typeof v === "string" && (TIER_ORDER as readonly string[]).includes(v);
}

let publicKeyPromise: Promise<CryptoKey> | null = null;

async function getPublicKey(): Promise<CryptoKey> {
  if (publicKeyPromise) return publicKeyPromise;
  publicKeyPromise = crypto.subtle.importKey(
    "spki",
    pemToBytes(LICENSE_PUBLIC_KEY_PEM),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return publicKeyPromise;
}

/**
 * Verify a license JWT signed with ECDSA P-256 (ES256).
 *
 * Dev bypass: a local-development and CI convenience so paid features can be
 * exercised without a signed key. It is hard-disabled when NODE_ENV is
 * "production", so it has no effect on a deployed instance — production always
 * goes through full signature verification.
 */
export async function verifyLicenseJWT(token: string): Promise<VerifyResult> {
  const devBypassAllowed =
    process.env.LICENSE_DEV_BYPASS === "1" &&
    process.env.NODE_ENV !== "production";
  if (devBypassAllowed) {
    if (token.startsWith("dev:")) {
      const tier = token.slice(4);
      if (!isTier(tier)) return { ok: false, reason: "invalid_dev_tier" };
      return { ok: true, tier, sub: "dev" };
    }
  }

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [h, p, s] = parts;

  let header: { alg?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (header.alg !== "ES256") return { ok: false, reason: "wrong_alg" };

  const signedRaw = new TextEncoder().encode(`${h}.${p}`);
  const signed = new ArrayBuffer(signedRaw.length);
  new Uint8Array(signed).set(signedRaw);
  const sig = b64urlToBytes(s);

  let verified = false;
  try {
    const key = await getPublicKey();
    verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig,
      signed,
    );
  } catch (e) {
    return { ok: false, reason: `verify_error:${(e as Error).message}` };
  }
  if (!verified) return { ok: false, reason: "bad_signature" };

  const tier = payload.tier;
  if (!isTier(tier)) return { ok: false, reason: "invalid_tier" };
  const sub = typeof payload.sub === "string" ? payload.sub : "unknown";

  let expiresAt: Date | undefined;
  if (typeof payload.exp === "number") {
    expiresAt = new Date(payload.exp * 1000);
    if (expiresAt < new Date()) return { ok: false, reason: "expired" };
  }

  return { ok: true, tier, expiresAt, sub };
}
