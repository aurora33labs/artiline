import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AuthContext } from "@/lib/tenant";
import { getContent } from "@/lib/artifact-content";
import { generateArtifactEdit, AiEditError } from "@/lib/ai/openrouter";
import { publishVersion } from "@/lib/artifacts/publish-version";

export type AiEditError_ =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NOT_CONFIGURED"
  | "ERR_UPSTREAM"
  | "ERR_RATE_LIMITED"
  | "ERR_EMPTY_RESPONSE"
  | "ERR_CONTENT_TOO_LARGE";

/**
 * Edit an artifact's current version with an LLM instruction, then publish the
 * result as a new live version — mirrors `publishVersion` in every way except
 * the content comes from OpenRouter instead of a re-uploaded file. Restricted
 * to the same callers as publish (author or workspace manager): unlike
 * `proposeVersion`, this goes live immediately, so it's not opened to any
 * member.
 */
export async function aiEditArtifact(
  ctx: AuthContext,
  artifactId: string,
  input: { instruction: string; model: string },
): Promise<{ slug: string; versionNumber: number }> {
  const { workspace, session, role } = ctx;

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, artifactId))
    .limit(1);
  if (!artifact || artifact.workspaceId !== workspace.id) {
    throw new Error("NOT_FOUND");
  }

  const isAuthor = artifact.authorUserId === session.user.id;
  const isManager = role === "owner" || role === "admin";
  if (!isAuthor && !isManager) throw new Error("FORBIDDEN");

  if (!artifact.currentVersionId) throw new Error("NOT_FOUND");
  const [version] = await db
    .select()
    .from(schema.artifactVersions)
    .where(eq(schema.artifactVersions.id, artifact.currentVersionId))
    .limit(1);
  if (!version) throw new Error("NOT_FOUND");
  if (version.type === "external") throw new Error("FORBIDDEN");

  const currentContent = await getContent(version);

  let nextContent: string;
  try {
    nextContent = await generateArtifactEdit({
      model: input.model,
      type: version.type,
      language: version.language,
      content: currentContent,
      instruction: input.instruction,
    });
  } catch (e) {
    const code = e instanceof AiEditError ? e.message : "ERR_UPSTREAM";
    console.error("[ai-edit] generation failed", {
      artifactId,
      model: input.model,
      code,
      error: e instanceof Error ? e.message : String(e),
    });
    throw new Error(code);
  }

  return publishVersion(ctx, artifactId, {
    type: version.type,
    title: version.title,
    content: nextContent,
    language: version.language,
    message: `AI edit (${input.model}): ${input.instruction.slice(0, 400)}`,
  });
}
