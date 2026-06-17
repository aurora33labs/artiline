import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { resolveCurrentArtifact } from "@/lib/artifact-resolve";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { isReactRenderable } from "@/lib/detect-artifact";
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
  // Shareable URL always exists: public artifacts share the short public path,
  // private ones share the workspace-internal URL (access is gated on open).
  const shareHref = isPublic
    ? `/a/${artifact.slug}`
    : `/${workspace}/a/${artifact.slug}`;
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

  const [{ count: versionCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.artifactVersions)
    .where(eq(schema.artifactVersions.artifactId, artifact.id));

  // HTML streams via the iframe src; markdown/code render server-side. The edit
  // dialog lazy-loads raw content from the same route, so the page never inlines
  // a (possibly multi-MB) payload.
  const isHtml = version.type === "html";
  // React artifacts also stream through the iframe (the wrapper doc), but still
  // load `content` so the viewer's Source toggle can highlight it.
  const usesIframe =
    isHtml || isReactRenderable(version.type, version.language);
  const rawSrc = rawContentPath({ slug });
  const content = isHtml ? null : await getContent(version);

  return (
    <main className="fixed inset-0 bg-background overflow-auto">
      <ArtifactViewer
        artifact={{
          type: version.type,
          language: version.language,
          contentSrc: usesIframe ? rawSrc : null,
          content,
        }}
        fullscreen
      />
      <FloatingActionCard
        title={version.title}
        type={version.type}
        visibility={artifact.visibility}
        commentsCount={commentsCount}
        artifactId={artifact.id}
        shareHref={shareHref}
        downloadHref={rawContentPath({ slug: artifact.slug, download: true })}
        canExport={usesIframe}
        canEdit={canEdit}
        canDelete={canEdit}
        hasPassword={!!artifact.passwordHash}
        workspaceSlug={workspace}
        artifactSlug={artifact.slug}
        publishedAt={artifact.createdAt}
        updatedAt={version.createdAt}
        versionCount={versionCount}
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
