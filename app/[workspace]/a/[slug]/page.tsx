import { eq, sql, desc, asc, and, isNull, isNotNull } from "drizzle-orm";
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
import { ReactionsBar } from "@/components/reactions-bar";
import { AnnotationWrapper } from "@/components/annotation-wrapper";
import type { AnnotationData } from "@/components/annotation-wrapper";

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

  // Fetch annotations with comments
  const annotationRows = await db
    .select({
      commentId: schema.comments.id,
      x: schema.annotations.x,
      y: schema.annotations.y,
      width: schema.annotations.width,
      height: schema.annotations.height,
      targetType: schema.annotations.targetType,
      iframeX: schema.annotations.iframeX,
      iframeY: schema.annotations.iframeY,
      selectedText: schema.annotations.selectedText,
      anchorXPath: schema.annotations.anchorXPath,
      anchorOffset: schema.annotations.anchorOffset,
      anchorEndXPath: schema.annotations.anchorEndXPath,
      anchorEndOffset: schema.annotations.anchorEndOffset,
      body: schema.comments.body,
      authorName: schema.comments.authorName,
      userName: schema.users.name,
      userEmail: schema.users.email,
      createdAt: schema.comments.createdAt,
      resolved: schema.comments.resolved,
    })
    .from(schema.comments)
    .leftJoin(schema.annotations, eq(schema.annotations.commentId, schema.comments.id))
    .leftJoin(schema.users, eq(schema.users.id, schema.comments.userId))
    .where(and(eq(schema.comments.artifactId, artifact.id), isNull(schema.comments.parentCommentId)))
    .orderBy(desc(schema.comments.createdAt));

  const topLevelIds = annotationRows.map((r) => r.commentId);
  const replyRows = topLevelIds.length > 0
    ? await db
        .select({
          id: schema.comments.id,
          parentCommentId: schema.comments.parentCommentId,
          body: schema.comments.body,
          authorName: schema.comments.authorName,
          userName: schema.users.name,
          userEmail: schema.users.email,
          createdAt: schema.comments.createdAt,
        })
        .from(schema.comments)
        .leftJoin(schema.users, eq(schema.users.id, schema.comments.userId))
        .where(
          and(
            eq(schema.comments.artifactId, artifact.id),
            isNotNull(schema.comments.parentCommentId),
          ),
        )
        .orderBy(asc(schema.comments.createdAt))
    : [];

  const initialAnnotations: AnnotationData[] = annotationRows
    .filter((r) => r.x !== null && r.y !== null)
    .map((r) => ({
      id: r.commentId,
      commentId: r.commentId,
      x: r.x!,
      y: r.y!,
      width: r.width,
      height: r.height,
      targetType: r.targetType ?? "point",
      iframeX: r.iframeX,
      iframeY: r.iframeY,
      selectedText: r.selectedText,
      anchorXPath: r.anchorXPath,
      anchorOffset: r.anchorOffset,
      anchorEndXPath: r.anchorEndXPath,
      anchorEndOffset: r.anchorEndOffset,
      body: r.body,
      authorName: r.authorName,
      userName: r.userName,
      userEmail: r.userEmail,
      createdAt: r.createdAt.toISOString(),
      resolved: r.resolved ?? false,
      replies: replyRows
        .filter((rr) => rr.parentCommentId === r.commentId)
        .map((rr) => ({
          id: rr.id,
          body: rr.body,
          authorName: rr.authorName,
          userName: rr.userName,
          userEmail: rr.userEmail,
          createdAt: rr.createdAt.toISOString(),
        })),
    }));

  const isHtml = version.type === "html";
  const usesIframe =
    isHtml || isReactRenderable(version.type, version.language);
  const rawSrc = rawContentPath({ slug });
  const content = isHtml ? null : await getContent(version);

  return (
    <main className="fixed inset-0 bg-background overflow-auto">
      <AnnotationWrapper
        artifactId={artifact.id}
        versionId={version.id}
        artifactType={version.type}
        workspaceSlug={workspace}
        slug={artifact.slug}
        initialAnnotations={initialAnnotations}
      >
        <ArtifactViewer
          artifact={{
            type: version.type,
            language: version.language,
            contentSrc: usesIframe ? rawSrc : null,
            content,
          }}
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
          reactionsSlot={
            <ReactionsBar
              artifactId={artifact.id}
              currentUserId={session.user.id}
              workspaceSlug={workspace}
              slug={artifact.slug}
            />
          }
        />
      </AnnotationWrapper>
    </main>
  );
}
