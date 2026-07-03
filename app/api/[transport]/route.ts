import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  resolveAccessToken,
  resolveApiKey,
  type AuthContext,
} from "@/lib/tenant";
import { ACCESS_TOKEN_PREFIX } from "@/lib/oauth";
import { createArtifact } from "@/lib/artifacts/create";
import { publishVersion } from "@/lib/artifacts/publish-version";
import { resolveCurrentArtifact } from "@/lib/artifact-resolve";
import { getContent } from "@/lib/artifact-content";

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

type ToolText = { content: { type: "text"; text: string }[]; isError?: boolean };
function textResult(text: string): ToolText {
  return { content: [{ type: "text", text }] };
}
function textError(text: string): ToolText {
  return { isError: true, content: [{ type: "text", text }] };
}
function ctxOf(extra: { authInfo?: { extra?: { ctx?: unknown } } }): AuthContext | undefined {
  return extra.authInfo?.extra?.ctx as AuthContext | undefined;
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

    server.registerTool(
      "list_artifacts",
      {
        title: "List Artiline artifacts",
        description:
          "List artifacts in this workspace (newest first) with slug, title, " +
          "type and URL. Use this to find an artifact's slug before reading or " +
          "editing it.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max items (default 50)"),
        },
      },
      async (args, extra) => {
        const ctx = ctxOf(extra);
        if (!ctx) return textError("Not authenticated.");
        const rows = await db
          .select({
            slug: schema.artifacts.slug,
            visibility: schema.artifacts.visibility,
            title: schema.artifactVersions.title,
            type: schema.artifactVersions.type,
            language: schema.artifactVersions.language,
          })
          .from(schema.artifacts)
          .innerJoin(
            schema.artifactVersions,
            eq(schema.artifactVersions.id, schema.artifacts.currentVersionId),
          )
          .where(eq(schema.artifacts.workspaceId, ctx.workspace.id))
          .orderBy(desc(schema.artifacts.updatedAt))
          .limit(args.limit ?? 50);
        if (rows.length === 0)
          return textResult(`No artifacts in workspace ${ctx.workspace.slug}.`);
        const lines = rows.map(
          (r) =>
            `- ${r.slug} · ${r.title} · ${r.type}${r.language ? `/${r.language}` : ""} · ${r.visibility} · ${artifactUrl(r.slug)}`,
        );
        return textResult(
          `Artifacts in ${ctx.workspace.slug} (${rows.length}):\n${lines.join("\n")}`,
        );
      },
    );

    server.registerTool(
      "get_artifact",
      {
        title: "Read an Artiline artifact",
        description:
          "Read an artifact's current content by slug so you can edit it. " +
          "Returns its type, title, language, version number and FULL source. " +
          "After editing, call publish_version with the modified content.",
        inputSchema: {
          slug: z
            .string()
            .min(1)
            .describe("Artifact slug (from list_artifacts or the /a/<slug> URL)"),
        },
      },
      async (args, extra) => {
        const ctx = ctxOf(extra);
        if (!ctx) return textError("Not authenticated.");
        const resolved = await resolveCurrentArtifact(args.slug);
        if (!resolved || resolved.artifact.workspaceId !== ctx.workspace.id)
          return textError("Artifact not found.");
        const v = resolved.version;
        const content = await getContent(v);
        const header =
          `slug: ${args.slug}\ntitle: ${v.title}\ntype: ${v.type}` +
          (v.language ? `\nlanguage: ${v.language}` : "") +
          `\nversion: ${v.versionNumber}\nurl: ${artifactUrl(args.slug)}\n\n--- content ---\n`;
        return textResult(header + content);
      },
    );

    server.registerTool(
      "publish_version",
      {
        title: "Publish a new artifact version",
        description:
          "Edit an existing Artiline artifact by publishing a new version. Pass " +
          "the FULL updated source in `content` (no need to save a local file " +
          "first). type/title/language default to the current version if omitted. " +
          "The new version goes live immediately.",
        inputSchema: {
          slug: z.string().min(1).describe("Artifact slug to update"),
          content: z.string().min(1).describe("Full updated source"),
          title: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe("New title (defaults to current)"),
          type: z
            .enum(["html", "markdown", "code"])
            .optional()
            .describe("Defaults to current"),
          language: z.string().max(50).optional().describe("For type=code"),
          message: z
            .string()
            .max(500)
            .optional()
            .describe("Version note / changelog"),
        },
      },
      async (args, extra) => {
        const ctx = ctxOf(extra);
        if (!ctx) return textError("Not authenticated.");
        const resolved = await resolveCurrentArtifact(args.slug);
        if (!resolved || resolved.artifact.workspaceId !== ctx.workspace.id)
          return textError("Artifact not found.");
        if (!args.type && resolved.version.type === "external")
          return textError("This artifact is an external site — pass an explicit type to publish content to it.");
        try {
          const { versionNumber } = await publishVersion(
            ctx,
            resolved.artifact.id,
            {
              type: args.type ?? (resolved.version.type as "html" | "markdown" | "code"),
              title: args.title ?? resolved.version.title,
              content: args.content,
              language: args.language ?? resolved.version.language,
              message: args.message ?? null,
            },
          );
          return textResult(
            `Published version ${versionNumber} of "${args.slug}": ${artifactUrl(args.slug)}`,
          );
        } catch (e) {
          const msg = (e as Error)?.message ?? "ERR_INTERNAL";
          const human: Record<string, string> = {
            ERR_CONTENT_TOO_LARGE: "Content exceeds the 12 MB limit.",
            NOT_FOUND: "Artifact not found.",
            FORBIDDEN:
              "You can only edit artifacts you created (or you must be a workspace admin/owner).",
          };
          return textError(human[msg] ?? `Failed: ${msg}`);
        }
      },
    );

    server.registerTool(
      "list_versions",
      {
        title: "List artifact versions",
        description:
          "List an artifact's version history (newest first): version number, " +
          "title, date and review status.",
        inputSchema: {
          slug: z.string().min(1).describe("Artifact slug"),
        },
      },
      async (args, extra) => {
        const ctx = ctxOf(extra);
        if (!ctx) return textError("Not authenticated.");
        const resolved = await resolveCurrentArtifact(args.slug);
        if (!resolved || resolved.artifact.workspaceId !== ctx.workspace.id)
          return textError("Artifact not found.");
        const versions = await db
          .select({
            versionNumber: schema.artifactVersions.versionNumber,
            title: schema.artifactVersions.title,
            createdAt: schema.artifactVersions.createdAt,
            reviewStatus: schema.artifactVersions.reviewStatus,
            id: schema.artifactVersions.id,
          })
          .from(schema.artifactVersions)
          .where(eq(schema.artifactVersions.artifactId, resolved.artifact.id))
          .orderBy(desc(schema.artifactVersions.versionNumber));
        const cur = resolved.artifact.currentVersionId;
        const lines = versions.map(
          (v) =>
            `- v${v.versionNumber}${v.id === cur ? " (current)" : ""} · ${v.title} · ${v.reviewStatus} · ${v.createdAt.toISOString()}`,
        );
        return textResult(
          `Versions of "${args.slug}" (${versions.length}):\n${lines.join("\n")}`,
        );
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
  if (!bearerToken) return undefined;
  try {
    // OAuth access token (Claude.ai web connector).
    if (bearerToken.startsWith(ACCESS_TOKEN_PREFIX)) {
      const r = await resolveAccessToken(bearerToken);
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
    return {
      token: bearerToken,
      scopes: [],
      clientId: ctx.workspace.id,
      extra: { ctx },
    };
  } catch {
    return undefined;
  }
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

// Claude's MCP client is server-side (python-httpx), so no CORS is needed here —
// and re-wrapping mcp-handler's streamed response would risk mangling the
// Streamable HTTP / SSE body. Pass the handler through untouched.
export { authHandler as GET, authHandler as POST };
