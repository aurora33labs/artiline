import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { resolveCurrentArtifact } from "@/lib/artifact-resolve";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { recordView, extractIp, bumpViewsThrottled } from "@/lib/tracking";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { FloatingActionCard } from "@/components/floating-action-card";
import { CommentsSection } from "@/components/comments-section";
import { ReactionsBar } from "@/components/reactions-bar";

export default async function ArtifactInternalView({
  params,
}: {
  params: Promise<{ workspace: string; slug: string }>;
}) {
  const { workspace, slug } = await params;
  const { workspace: ws, session, role } = await requireMemberPage(workspace);

  const resolved = await resolveCurrentArtifact(slug);
  if (!resolved || resolved.artifact.workspaceId !== ws.id) notFound();
  const { artifact, version } = resolved;

  const isPublic =
    artifact.visibility === "public" || artifact.visibility === "public_pw";
  const publicPath = isPublic ? `/a/${artifact.slug}` : null;
  const canEdit =
    artifact.authorUserId === session.user.id ||
    role === "owner" ||
    role === "admin";

  const reqHeaders = await headers();
  await bumpViewsThrottled(
    artifact.id,
    extractIp(reqHeaders),
    reqHeaders.get("user-agent"),
  );

  await recordView({
    artifactId: artifact.id,
    versionId: version.id,
    ip: extractIp(reqHeaders),
    userAgent: reqHeaders.get("user-agent"),
    referrer: reqHeaders.get("referer"),
    userId: session.user.id,
  }).catch(() => {
    /* tracking failures should never block render */
  });

  const [{ count: commentsCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.comments)
    .where(eq(schema.comments.artifactId, artifact.id));

  // HTML streams via the iframe src; markdown/code render server-side. The edit
  // dialog lazy-loads raw content from the same route, so the page never inlines
  // a (possibly multi-MB) payload.
  const isHtml = version.type === "html";
  const rawSrc = rawContentPath({ slug });
  const content = isHtml ? null : await getContent(version);

  return (
    <main className="fixed inset-0 bg-background overflow-auto">
      <ArtifactViewer
        artifact={{
          type: version.type,
          language: version.language,
          contentSrc: isHtml ? rawSrc : null,
          content,
        }}
        fullscreen
      />
      <FloatingActionCard
        title={version.title}
        type={version.type}
        visibility={artifact.visibility}
        views={artifact.views}
        commentsCount={commentsCount}
        artifactId={artifact.id}
        publicPath={publicPath}
        canExport={version.type === "html"}
        canEdit={canEdit}
        canDelete={canEdit}
        hasPassword={!!artifact.passwordHash}
        workspaceSlug={workspace}
        artifactSlug={artifact.slug}
        reviewStatus={version.reviewStatus}
        backHref={`/${workspace}`}
        commentsSlot={
          <CommentsSection
            artifactId={artifact.id}
            versionId={version.id}
            currentUserId={session.user.id}
            workspaceSlug={workspace}
            slug={artifact.slug}
          />
        }
        reactionsSlot={
          <ReactionsBar
            artifactId={artifact.id}
            currentUserId={session.user.id}
            workspaceSlug={workspace}
            slug={artifact.slug}
          />
        }
      />
    </main>
  );
}
