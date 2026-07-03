import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { isReactRenderable } from "@/lib/detect-artifact";
import { VersionDiff } from "@/components/version-diff";
import { VersionRowActions } from "@/components/version-row-actions";
import { Button } from "@/components/ui/button";

export default async function VersionsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; slug: string }>;
  searchParams: Promise<{ diff?: string; view?: string }>;
}) {
  const { workspace, slug } = await params;
  const { diff, view } = await searchParams;
  const { workspace: ws, session, role } = await requireMemberPage(workspace);
  const t = await getTranslations("versions");
  const fmt = await getFormatter();

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(
      and(
        eq(schema.artifacts.workspaceId, ws.id),
        eq(schema.artifacts.slug, slug),
      ),
    )
    .limit(1);
  if (!artifact) notFound();

  const canEdit =
    artifact.authorUserId === session.user.id ||
    role === "owner" ||
    role === "admin";

  const reviewers = alias(schema.users, "reviewers");
  const versions = await db
    .select({
      version: schema.artifactVersions,
      author: { id: schema.users.id, name: schema.users.name, email: schema.users.email },
      reviewer: { id: reviewers.id, name: reviewers.name, email: reviewers.email },
    })
    .from(schema.artifactVersions)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.artifactVersions.authorUserId),
    )
    .leftJoin(
      reviewers,
      eq(reviewers.id, schema.artifactVersions.assignedReviewerId),
    )
    .where(eq(schema.artifactVersions.artifactId, artifact.id))
    .orderBy(desc(schema.artifactVersions.versionNumber));

  const diffTarget = diff ? Number.parseInt(diff, 10) : null;
  const focused =
    diffTarget && Number.isFinite(diffTarget)
      ? versions.find((v) => v.version.versionNumber === diffTarget)
      : null;
  const previous = focused
    ? versions.find(
        (v) => v.version.versionNumber === focused.version.versionNumber - 1,
      )
    : null;

  const isRenderable = (v: typeof schema.artifactVersions.$inferSelect) =>
    v.type === "html" || isReactRenderable(v.type, v.language);
  const canRenderVisual =
    !!focused && !!previous && isRenderable(focused.version) && isRenderable(previous.version);
  const diffView: "visual" | "text" =
    view === "text" ? "text" : canRenderVisual ? "visual" : "text";

  // Text diff needs full content of both versions — resolve from DB or object
  // storage. Skip the fetch entirely when showing the visual (iframe) diff.
  const diffContent =
    focused && previous && diffView === "text"
      ? {
          old: await getContent(previous.version),
          new: await getContent(focused.version),
        }
      : null;

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="space-y-2 border-b border-border pb-6">
        <div className="meta">{t("crumb", { slug: artifact.slug })}</div>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("description", { count: versions.length })}
        </p>
      </div>

      {focused && previous && (
        <section className="space-y-3">
          <header className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
              {t("diffHeading", {
                from: previous.version.versionNumber,
                to: focused.version.versionNumber,
              })}
            </h2>
            <div className="flex items-center gap-2">
              {canRenderVisual && (
                <div className="flex border border-border rounded-sm overflow-hidden">
                  <Button
                    asChild
                    variant={diffView === "visual" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                  >
                    <Link href={`/${workspace}/a/${slug}/versions?diff=${diff}&view=visual`}>
                      {t("diffVisual")}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={diffView === "text" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                  >
                    <Link href={`/${workspace}/a/${slug}/versions?diff=${diff}&view=text`}>
                      {t("diffText")}
                    </Link>
                  </Button>
                </div>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${workspace}/a/${slug}/versions`}>
                  {t("closeDiff")}
                </Link>
              </Button>
            </div>
          </header>
          {diffView === "visual" && canRenderVisual ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border border border-border">
              {[previous, focused].map(({ version }) => (
                <div key={version.id} className="bg-surface">
                  <div className="meta px-4 py-2 border-b border-border">
                    V{String(version.versionNumber).padStart(3, "0")} · {version.title}
                  </div>
                  <iframe
                    src={rawContentPath({ slug, versionNumber: version.versionNumber })}
                    sandbox="allow-scripts"
                    className="w-full h-[70vh] bg-white"
                  />
                </div>
              ))}
            </div>
          ) : diffContent ? (
            <VersionDiff
              oldContent={diffContent.old}
              newContent={diffContent.new}
              oldLabel={`V${previous.version.versionNumber} · ${previous.version.title}`}
              newLabel={`V${focused.version.versionNumber} · ${focused.version.title}`}
            />
          ) : null}
        </section>
      )}

      <ol className="border border-border bg-surface divide-y divide-border">
        {versions.map(({ version, author, reviewer }) => {
          const isCurrent = artifact.currentVersionId === version.id;
          return (
            <li
              key={version.id}
              className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-display font-bold tracking-[0.06em]">
                    V{String(version.versionNumber).padStart(3, "0")}
                  </span>
                  <span className="text-base font-sans font-medium normal-case tracking-normal">
                    {version.title}
                  </span>
                  {isCurrent && (
                    <span className="meta text-primary border border-primary px-2 py-0.5">
                      {t("currentPill")}
                    </span>
                  )}
                  <span
                    className={`meta border px-2 py-0.5 ${statusClass(version.reviewStatus)}`}
                  >
                    {t(`status.${version.reviewStatus}`)}
                  </span>
                  {version.reviewStatus === "pending" && reviewer && (
                    <span className="meta text-muted-foreground border border-border px-2 py-0.5">
                      {t("reviewerBadge", { name: (reviewer.name ?? reviewer.email).toUpperCase() })}
                    </span>
                  )}
                </div>
                <div className="meta text-muted-foreground">
                  {(author.name ?? author.email).toUpperCase()} ·{" "}
                  {fmt
                    .dateTime(version.createdAt, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                    .toUpperCase()}
                  {version.message && ` · ${version.message}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/${workspace}/a/${slug}/v/${version.versionNumber}`}
                  >
                    {t("view")}
                  </Link>
                </Button>
                {version.versionNumber > 1 && (
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      href={`/${workspace}/a/${slug}/versions?diff=${version.versionNumber}`}
                    >
                      {t("diff")}
                    </Link>
                  </Button>
                )}
                <VersionRowActions
                  workspaceSlug={workspace}
                  artifactId={artifact.id}
                  versionId={version.id}
                  versionNumber={version.versionNumber}
                  reviewStatus={version.reviewStatus}
                  isCurrent={isCurrent}
                  canEdit={canEdit}
                  canDiscard={
                    (canEdit ||
                      version.authorUserId === session.user.id) &&
                    (version.reviewStatus === "pending" ||
                      version.reviewStatus === "changes_requested") &&
                    !isCurrent
                  }
                  canDirectRollback={role === "owner" || role === "admin"}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function statusClass(s: string): string {
  if (s === "approved") return "text-success border-success";
  if (s === "pending") return "text-warning border-warning";
  if (s === "changes_requested") return "text-destructive border-destructive";
  return "text-muted-foreground border-border";
}
