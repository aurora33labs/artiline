import { zipSync, strToU8 } from "fflate";
import { getPublicUrl } from "mcp-handler";

export const runtime = "nodejs";

/**
 * Serves a Claude Desktop Extension (`.mcpb`) that connects Claude Desktop to
 * this Artiline instance's MCP server with one click. The bundle bridges to
 * `<origin>/api/mcp` via `mcp-remote`, sending the user's static `artl_` API
 * token as a Bearer header — this avoids the Claude web/Desktop OAuth-connector
 * bug (Anthropic issues #155/#271/#335) where the token is never attached.
 *
 * The token is NOT embedded (only hashes are stored server-side): it's declared
 * as a `sensitive` `user_config` field, so Claude Desktop prompts for it on
 * install and stores it in the OS keychain, substituting `${user_config.token}`
 * at launch. The server URL is baked per-instance from the request origin, so
 * both the cloud and self-host deployments produce a correct bundle.
 */
function buildManifest(origin: string): string {
  const manifest = {
    manifest_version: "0.3",
    name: "artiline",
    display_name: "Artiline",
    version: "1.0.0",
    description: "Guarda artifacts en Artiline desde Claude.",
    author: { name: "Artiline" },
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: {
        command: "npx",
        args: [
          "-y",
          "mcp-remote",
          `${origin}/api/mcp`,
          "--header",
          "Authorization: Bearer ${user_config.token}",
          "--transport",
          "http-only",
        ],
      },
    },
    user_config: {
      token: {
        type: "string",
        title: "Artiline API token",
        description: "Tu token artl_ de Settings → API keys en Artiline.",
        sensitive: true,
        required: true,
      },
    },
  };
  return JSON.stringify(manifest, null, 2);
}

// Fallback entry point. Claude Desktop launches `mcp_config.command` (npx), but
// the manifest schema requires an `entry_point`; running this directly also
// works — it execs the same mcp-remote bridge using the token from the env that
// Claude injects.
const ENTRY_STUB = `#!/usr/bin/env node
// Artiline MCP bridge. Claude Desktop normally runs the npx command in the
// manifest's mcp_config; this file is the schema-required entry_point fallback.
const { spawn } = require("node:child_process");
const url = process.env.ARTILINE_MCP_URL;
const token = process.env.ARTILINE_TOKEN;
const args = ["-y", "mcp-remote"];
if (url) args.push(url);
if (token) args.push("--header", "Authorization: Bearer " + token);
args.push("--transport", "http-only");
const child = spawn("npx", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
`;

export function GET(req: Request) {
  const origin = getPublicUrl(req).origin;
  const zipped = zipSync({
    "manifest.json": strToU8(buildManifest(origin)),
    "server/index.js": strToU8(ENTRY_STUB),
  });
  // Copy into a standalone ArrayBuffer for the Response body.
  const body = zipped.slice();
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="artiline.mcpb"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
