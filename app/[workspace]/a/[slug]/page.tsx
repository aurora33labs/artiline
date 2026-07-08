import { eq, sql, desc, asc, and, isNull, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { listWorkspaceMembers } from "@/lib/members";
import { isFeatureEnabled } from "@/lib/license";
import { getAiEditModels } from "@/lib/ai/openrouter";
import { resolveCurrentArtifact } from "@/lib/artifact-resolve";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { isReactRenderable } from "@/lib/detect-artifact";
import { recordView, extractIp, bumpViewsThrottled } from "@/lib/tracking";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { FloatingActionCard } from "@/components/floating-action-card";
import { ReactionsBar } from "@/components/reactions-bar";
import { AnnotationWrapper } from "@/components/annotation-wrapper";
import type { AnnotationData } from "@/components/annotation-wrapper";
import { ExternalSitePanel, type ExternalPage } from "@/components/external-site-panel";

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

  if (version.type === "external") {
    return (
      <ExternalArtifactView
        workspaceSlug={workspace}
        artifactId={artifact.id}
        title={version.title}
        canManage={canEdit}
      />
    );
  }

  const reqHeaders = await headers();
  await bumpViewsThrottled(
    artifact.id,
    extractIp(reqHeaders),
    reqHeaders.get("user-agent"),
  );

  await recordView({
    artifactId: artifact.id,
    versionId: version.id,
    workspaceId: artifact.workspaceId,
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

  // Only needed when this viewer can propose (assign-a-reviewer picker).
  const members = !canEdit ? await listWorkspaceMembers(ws.id) : [];
  const analyticsEnabled = canEdit
    ? await isFeatureEnabled("tracking_advanced", { workspaceId: ws.id })
    : false;

  // Pending proposals awaiting review — surfaced to author/admin on the card.
  const [{ count: pendingProposals }] = canEdit
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.artifactVersions)
        .where(
          and(
            eq(schema.artifactVersions.artifactId, artifact.id),
            eq(schema.artifactVersions.reviewStatus, "pending"),
          ),
        )
    : [{ count: 0 }];

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
  // Version the iframe URL so a new approved version busts the browser/CDN cache
  // (a stable URL served the old cached HTML until the cache was cleared).
  const rawSrc = rawContentPath({ slug, versionNumber: version.versionNumber });
  const content = isHtml ? null : await getContent(version);

  return (
    <main
      className={`fixed inset-0 overflow-auto ${
        version.type === "html" ? "bg-white" : "bg-background"
      }`}
    >
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
          canPropose={!canEdit}
          pendingProposals={pendingProposals}
          members={members}
          analyticsEnabled={analyticsEnabled}
          aiEditModels={canEdit ? getAiEditModels() : []}
          cleanShare={artifact.cleanShare}
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

async function ExternalArtifactView({
  workspaceSlug,
  artifactId,
  title,
  canManage,
}: {
  workspaceSlug: string;
  artifactId: string;
  title: string;
  canManage: boolean;
}) {
  const [site] = await db
    .select()
    .from(schema.externalSites)
    .where(eq(schema.externalSites.artifactId, artifactId))
    .limit(1);
  if (!site) notFound();

  const pageRows = await db
    .select()
    .from(schema.externalPages)
    .where(eq(schema.externalPages.artifactId, artifactId))
    .orderBy(desc(schema.externalPages.lastSeenAt));

  const countRows = await db
    .select({
      pageUrl: schema.comments.pageUrl,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.comments)
    .where(and(eq(schema.comments.artifactId, artifactId), isNull(schema.comments.parentCommentId)))
    .groupBy(schema.comments.pageUrl);
  const countByPage = new Map(countRows.map((r) => [r.pageUrl, r.n]));

  const staleRows = await db
    .select({ pageUrl: schema.comments.pageUrl })
    .from(schema.comments)
    .innerJoin(schema.annotations, eq(schema.annotations.commentId, schema.comments.id))
    .where(and(eq(schema.comments.artifactId, artifactId), sql`${schema.annotations.staleAt} IS NOT NULL`));
  const staleByPage = new Set(staleRows.map((r) => r.pageUrl));

  const pages: ExternalPage[] = pageRows.map((p) => ({
    path: p.path,
    title: p.title,
    commentCount: countByPage.get(p.path) ?? 0,
    stale: staleByPage.has(p.path),
    lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
  }));

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      <header className="space-y-1 border-b border-border pb-4">
        <div className="meta text-muted-foreground">EXTERNAL SITE</div>
        <h1 className="text-3xl">{title}</h1>
      </header>
      <ExternalSitePanel
        workspaceSlug={workspaceSlug}
        artifactId={artifactId}
        origin={site.origin}
        publicKey={site.publicKey}
        enabled={site.enabled}
        canManage={canManage}
        pages={pages}
      />
    </div>
  );
}
