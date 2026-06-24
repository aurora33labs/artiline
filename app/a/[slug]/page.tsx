import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Lock, FileX, Ban, AlertTriangle } from "lucide-react";
import { eq, sql, desc, asc, and, isNull, isNotNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { evaluateAccess } from "@/lib/visibility";
import { resolveCurrentArtifact } from "@/lib/artifact-resolve";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { isReactRenderable } from "@/lib/detect-artifact";
import { recordView, extractIp, bumpViewsThrottled } from "@/lib/tracking";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReactionsBar } from "@/components/reactions-bar";
import { FloatingActionCard } from "@/components/floating-action-card";
import { BrandLogo } from "@/components/brand-logo";
import { PublicFooter } from "@/components/public-footer";
import { AnnotationWrapper } from "@/components/annotation-wrapper";
import type { AnnotationData } from "@/components/annotation-wrapper";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveCurrentArtifact(slug);
  if (!resolved) return { title: "Artiline" };
  const isPublic =
    resolved.artifact.visibility === "public" ||
    resolved.artifact.visibility === "public_pw";
  return {
    title: `${resolved.version.title} — Artiline`,
    description: resolved.version.message ?? undefined,
    robots: isPublic ? undefined : { index: false, follow: false },
    openGraph: {
      title: resolved.version.title,
      description: resolved.version.message ?? undefined,
      type: "article",
      url: `/a/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: resolved.version.title,
      description: resolved.version.message ?? undefined,
    },
  };
}

export default async function PublicArtifact({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pw?: string }>;
}) {
  const { slug } = await params;
  const { pw } = await searchParams;
  const t = await getTranslations("viewer");

  const resolved = await resolveCurrentArtifact(slug);
  const artifact = resolved?.artifact ?? null;
  const version = resolved?.version ?? null;

  const session = await auth();
  const access = await evaluateAccess(artifact, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: pw ?? null,
  });

  if (access.kind === "not_found") {
    return (
      <Gate
        Icon={FileX}
        title={t("notFoundTitle")}
        message={t("notFoundMsg")}
      />
    );
  }
  if (access.kind === "expired") {
    return (
      <Gate
        Icon={AlertTriangle}
        title={t("expiredTitle")}
        message={t("expiredMsg")}
      />
    );
  }
  if (access.kind === "needs_login") {
    return (
      <Gate
        Icon={Lock}
        title={t("teamOnlyTitle")}
        message={t("teamOnlyMsg")}
      >
        <Button asChild>
          <Link href={`/login`}>{t("loginBtn")}</Link>
        </Button>
      </Gate>
    );
  }
  if (access.kind === "not_member") {
    return (
      <Gate
        Icon={Ban}
        title={t("noAccessTitle")}
        message={t("noAccessMsg")}
      />
    );
  }
  if (access.kind === "needs_password") {
    return <PasswordPrompt slug={slug} hasAttempt={!!pw} />;
  }

  const reqHeaders = await headers();
  await bumpViewsThrottled(
    artifact!.id,
    extractIp(reqHeaders),
    reqHeaders.get("user-agent"),
  );

  await recordView({
    artifactId: artifact!.id,
    versionId: version!.id,
    ip: extractIp(reqHeaders),
    userAgent: reqHeaders.get("user-agent"),
    referrer: reqHeaders.get("referer"),
    userId: session?.user?.id ?? null,
  }).catch(() => {
    /* tracking failures should never block render */
  });

  const [{ count: commentsCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.comments)
    .where(eq(schema.comments.artifactId, artifact!.id));

  const [{ count: versionCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.artifactVersions)
    .where(eq(schema.artifactVersions.artifactId, artifact!.id));

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
    .where(and(eq(schema.comments.artifactId, artifact!.id), isNull(schema.comments.parentCommentId)))
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
            eq(schema.comments.artifactId, artifact!.id),
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

  const isHtml = version!.type === "html";
  const usesIframe =
    isHtml || isReactRenderable(version!.type, version!.language);
  const content = isHtml ? null : await getContent(version!);

  return (
    <main className="fixed inset-0 bg-background overflow-auto">
      <AnnotationWrapper
        artifactId={artifact!.id}
        versionId={version!.id}
        artifactType={version!.type}
        slug={artifact!.slug}
        initialAnnotations={initialAnnotations}
      >
        <ArtifactViewer
          artifact={{
            type: version!.type,
            language: version!.language,
            contentSrc: usesIframe ? rawContentPath({ slug, pw }) : null,
            content,
          }}
        />
        <PublicFooter />
        <FloatingActionCard
          title={version!.title}
          type={version!.type}
          visibility={artifact!.visibility}
          commentsCount={commentsCount}
          artifactId={artifact!.id}
          publishedAt={artifact!.createdAt}
          updatedAt={version!.createdAt}
          versionCount={versionCount}
          shareHref={`/a/${artifact!.slug}`}
          canExport={usesIframe}
          canEdit={false}
          hasPassword={!!artifact!.passwordHash}
          backHref="/"
          reactionsSlot={
            <ReactionsBar
              artifactId={artifact!.id}
              currentUserId={session?.user?.id ?? null}
              password={pw}
              slug={slug}
            />
          }
        />
      </AnnotationWrapper>
    </main>
  );
}

async function Gate({
  Icon,
  title,
  message,
  children,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("viewer");
  return (
    <main className="flex-1 min-h-screen flex flex-col">
      <header className="px-6 py-5 border-b border-border">
        <BrandLogo size="md" />
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="size-12 rounded-sm border border-border-strong bg-surface-2 flex items-center justify-center">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="space-y-2">
            <div className="meta">{t("accessDenied")}</div>
            <h1 className="text-2xl">{title}</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

async function PasswordPrompt({
  slug,
  hasAttempt,
}: {
  slug: string;
  hasAttempt: boolean;
}) {
  const t = await getTranslations("viewer");
  const tc = await getTranslations("common");
  return (
    <main className="flex-1 min-h-screen flex flex-col">
      <header className="px-6 py-5 border-b border-border">
        <BrandLogo size="md" />
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-3">
            <div className="size-12 rounded-sm border border-border-strong bg-surface-2 flex items-center justify-center">
              <Lock className="size-5 text-primary" />
            </div>
            <div className="meta">{t("passwordRequiredMeta")}</div>
            <h1 className="text-2xl">{t("passwordRequiredTitle")}</h1>
            <p className="text-muted-foreground text-sm">{t("passwordAsk")}</p>
          </div>
          <form
            action={`/a/${slug}`}
            method="get"
            className="space-y-3 border border-border bg-surface p-6"
          >
            <div className="space-y-1.5">
              <Label htmlFor="pw">{tc("password")}</Label>
              <Input
                id="pw"
                name="pw"
                type="password"
                required
                autoFocus
                className="h-11"
              />
            </div>
            {hasAttempt && (
              <p className="meta text-destructive">{t("passwordWrong")}</p>
            )}
            <Button type="submit" className="w-full h-11">
              {t("enter")}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
