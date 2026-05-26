import "server-only";
import { createHmac } from "node:crypto";

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * Header format: `t=<unix-seconds>,v1=<hex>`
 * Receiver computes HMAC over `${t}.${rawBody}` and compares constant-time.
 */
export function signPayload(secret: string, payload: string): string {
  const t = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${mac}`;
}
