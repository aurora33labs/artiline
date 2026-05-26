import "server-only";

/**
 * Cloudflare for SaaS custom-hostname provisioning.
 *
 * Stub implementation. Real integration uses:
 * - POST /zones/{zone_id}/custom_hostnames with `{ hostname, ssl: { method: "txt" } }`
 * - Returns hostname_id + TXT record to instruct DNS for ownership verification
 * - Poll status until SSL active
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ZONE_ID
 *
 * Returns the Cloudflare hostname ID + provisioning status.
 */
export interface ProvisionResult {
  hostnameId: string;
  status: "pending" | "active" | "failed";
  ownershipRecord?: { type: "TXT" | "CNAME"; name: string; value: string };
  error?: string;
}

export async function provisionDomain(hostname: string): Promise<ProvisionResult> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    // Dev/CI stub: return a fake pending hostname so the rest of the flow can be tested
    return {
      hostnameId: `stub_${hostname.replace(/\W/g, "_")}`,
      status: "pending",
      ownershipRecord: {
        type: "TXT",
        name: `_cf-custom-hostname.${hostname}`,
        value: "STUB_VERIFICATION_TOKEN",
      },
    };
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        hostname,
        ssl: { method: "txt", type: "dv" },
      }),
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { errors?: unknown };
    return {
      hostnameId: "",
      status: "failed",
      error: JSON.stringify(body.errors ?? body),
    };
  }

  const json = (await res.json()) as {
    result: {
      id: string;
      ownership_verification?: { type: string; name: string; value: string };
      status: string;
    };
  };

  return {
    hostnameId: json.result.id,
    status: json.result.status === "active" ? "active" : "pending",
    ownershipRecord: json.result.ownership_verification
      ? {
          type: json.result.ownership_verification.type as "TXT" | "CNAME",
          name: json.result.ownership_verification.name,
          value: json.result.ownership_verification.value,
        }
      : undefined,
  };
}

export async function deleteDomain(hostnameId: string): Promise<boolean> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId || hostnameId.startsWith("stub_")) return true;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/${hostnameId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    },
  );
  return res.ok;
}
