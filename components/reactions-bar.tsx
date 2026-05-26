import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ReactionsBarClient } from "./reactions-bar-client";

const ALLOWED = ["👍", "❤️", "🎉", "🚀", "😂"] as const;

export async function ReactionsBar({
  artifactId,
  currentUserId,
  password,
  workspaceSlug,
  slug,
}: {
  artifactId: string;
  currentUserId: string | null;
  password?: string;
  workspaceSlug?: string;
  slug?: string;
}) {
  const rows = await db
    .select()
    .from(schema.reactions)
    .where(eq(schema.reactions.artifactId, artifactId));

  const counts: Record<string, number> = {};
  const mine = new Set<string>();
  for (const r of rows) {
    counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    if (currentUserId && r.userId === currentUserId) mine.add(r.emoji);
  }

  return (
    <ReactionsBarClient
      artifactId={artifactId}
      emojis={[...ALLOWED]}
      counts={counts}
      mine={[...mine]}
      canReact={!!currentUserId}
      password={password}
      workspaceSlug={workspaceSlug}
      slug={slug}
    />
  );
}
