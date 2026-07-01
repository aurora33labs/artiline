import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import {
  resolveAccessToken,
  resolveApiKey,
  type AuthContext,
} from "@/lib/tenant";
import { ACCESS_TOKEN_PREFIX } from "@/lib/oauth";
import { withCors, corsPreflight } from "@/lib/cors";
import { createArtifact } from "@/lib/artifacts/create";

export const runtime = "nodejs";

/**
 * Remote MCP server (Streamable HTTP) so Claude — including the Claude.ai app via
 * a custom connector, plus Claude Desktop and Claude Code — can create Artiline
 * artifacts directly. Authenticated by a workspace-scoped Bearer API token
 * (`artl_...`) minted in workspace settings; the workspace is implicit in the
 * token, so tools never take a workspace argument.
 *
 * Lives at `app/api/[transport]/route.ts` with `basePath: "/api"`, so the
 * Streamable HTTP endpoint is `/api/mcp`. Static `/api/*` routes take priority
 * over this dynamic segment, so existing endpoints are unaffected.
 */
function artifactUrl(slug: string): string {
  const base = process.env.AUTH_URL ?? "";
  return `${base}/a/${slug}`;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "create_artifact",
      {
        title: "Create Artiline artifact",
        description:
          "Save the current artifact's source code into Artiline and get a " +
          "shareable link. Pass the FULL source (HTML, Markdown, or code) as " +
          "`content`. Use this when the user asks to save/publish/upload an " +
          "artifact to Artiline.",
        inputSchema: {
          title: z.string().min(1).max(200).describe("Human title"),
          type: z
            .enum(["html", "markdown", "code"])
            .describe("html for web pages, markdown for docs, code otherwise"),
          content: z.string().min(1).describe("Full raw source"),
          language: z
            .string()
            .max(50)
            .optional()
            .describe("For type=code, e.g. tsx, python"),
          visibility: z
            .enum(["internal_pw", "internal", "public_pw", "public"])
            .default("internal")
            .describe("internal = workspace only; public = anyone with the link"),
          password: z
            .string()
            .optional()
            .describe("Required when visibility ends in _pw (min 4 chars)"),
        },
      },
      async (args, extra) => {
        const ctx = extra.authInfo?.extra?.ctx as AuthContext | undefined;
        if (!ctx) {
          return {
            isError: true,
            content: [{ type: "text", text: "Not authenticated." }],
          };
        }
        try {
          const { slug } = await createArtifact(ctx, {
            type: args.type,
            title: args.title,
            content: args.content,
            language: args.language ?? null,
            visibility: args.visibility,
            password: args.password ?? null,
          });
          return {
            content: [
              {
                type: "text",
                text: `Created artifact "${args.title}" in workspace ${ctx.workspace.slug}: ${artifactUrl(slug)}`,
              },
            ],
          };
        } catch (e) {
          const msg = (e as Error)?.message ?? "ERR_INTERNAL";
          const human: Record<string, string> = {
            ERR_CONTENT_TOO_LARGE: "Content exceeds the 12 MB limit.",
            ERR_PASSWORD_TOO_SHORT:
              "A password of at least 4 characters is required for this visibility.",
            LIMIT_ARTIFACTS: "This workspace has reached its artifact quota.",
          };
          return {
            isError: true,
            content: [{ type: "text", text: human[msg] ?? `Failed: ${msg}` }],
          };
        }
      },
    );
  },
  {
    serverInfo: { name: "artiline", version: "1.0.0" },
    capabilities: { tools: {} },
  },
  { basePath: "/api" },
);

/** Resolve the Bearer token to an Artiline AuthContext, stashed for the tools. */
const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) {
    console.log("[mcp-auth] no bearer token");
    return undefined;
  }
  // Diagnostic: log only the token *kind* prefix (not the secret) + outcome.
  const kind = bearerToken.slice(0, 7);
  try {
    // OAuth access token (Claude.ai web connector).
    if (bearerToken.startsWith(ACCESS_TOKEN_PREFIX)) {
      const r = await resolveAccessToken(bearerToken);
      console.log(`[mcp-auth] ok oauth kind=${kind} ws=${r.workspace.slug} role=${r.role}`);
      return {
        token: bearerToken,
        scopes: r.scopes,
        clientId: r.clientId,
        expiresAt: Math.floor(r.expiresAt.getTime() / 1000),
        extra: {
          ctx: { session: r.session, workspace: r.workspace, role: r.role },
        },
      };
    }
    // Static API key (`artl_`, Claude Desktop via mcp-remote).
    const ctx = await resolveApiKey(bearerToken);
    console.log(`[mcp-auth] ok apikey kind=${kind} ws=${ctx.workspace.slug}`);
    return {
      token: bearerToken,
      scopes: [],
      clientId: ctx.workspace.id,
      extra: { ctx },
    };
  } catch (e) {
    console.log(
      `[mcp-auth] reject kind=${kind} reason=${(e as Error)?.message ?? "unknown"}`,
    );
    return undefined;
  }
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

// The Claude.ai web connector fetches this cross-origin, so responses (incl. the
// 401 OAuth challenge) need CORS with WWW-Authenticate exposed, plus a preflight.
export async function GET(req: Request) {
  return withCors(await authHandler(req));
}
export async function POST(req: Request) {
  return withCors(await authHandler(req));
}
export function OPTIONS() {
  return corsPreflight();
}
