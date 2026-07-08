import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { getContent, rawContentPath } from "@/lib/artifact-content";
import { isReactRenderable } from "@/lib/detect-artifact";
import { VersionDiff } from "@/components/version-diff";
import { VersionRowActions } from "@/components/version-row-actions";
import { Button } from "@/components/ui/button";

type VersionRow = {
  version: typeof schema.artifactVersions.$inferSelect;
  author: { id: string; name: string | null; email: string };
  reviewer: { id: string; name: string | null; email: string } | null;
};

export default async function VersionsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; slug: string }>;
  searchParams: Promise<{
    diff?: string;
    against?: string;
    view?: string;
    full?: string;
  }>;
}) {
  const { workspace, slug } = await params;
  const { diff, against: againstParam, view, full } = await searchParams;
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
  const versions: VersionRow[] = await db
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

  // Two possible comparison partners for the focused version: the one right
  // before it by number (changelog-style, "what did this step change") or the
  // live version (review/rollback-style, "how does this differ from what's
  // published now"). "Current" isn't a valid target when focused IS current
  // (nothing to compare against itself); "previous" isn't valid for V1.
  const previousByNumber = focused
    ? versions.find(
        (v) => v.version.versionNumber === focused.version.versionNumber - 1,
      )
    : null;
  const currentRow =
    versions.find((v) => v.version.id === artifact.currentVersionId) ?? null;
  const focusedIsCurrent = focused?.version.id === artifact.currentVersionId;

  const canDiffVsCurrent = !!focused && !focusedIsCurrent && !!currentRow;
  const canDiffVsPrevious = !!previousByNumber;
  const showAgainstToggle = canDiffVsCurrent && canDiffVsPrevious;

  // Default to "current" (the common case: review a proposal or check drift
  // from what's live) unless it isn't valid for this row, or the caller
  // explicitly asked for "previous".
  const against: "current" | "previous" =
    againstParam === "previous" && canDiffVsPrevious
      ? "previous"
      : canDiffVsCurrent
        ? "current"
        : "previous";

  const compareTarget = against === "current" ? currentRow : previousByNumber;

  // Chronological order for display — independent of which one is "focused"
  // vs "compareTarget". Diffing an old row against current (e.g. V1 vs
  // current V3) must still read "V1 → V3", not backwards.
  const olderRow =
    focused && compareTarget
      ? focused.version.versionNumber <= compareTarget.version.versionNumber
        ? focused
        : compareTarget
      : null;
  const newerRow =
    focused && compareTarget
      ? focused.version.versionNumber <= compareTarget.version.versionNumber
        ? compareTarget
        : focused
      : null;

  function diffHref(overrides: {
    against?: "current" | "previous";
    view?: "visual" | "text";
    full?: boolean;
  } = {}): string {
    const params = new URLSearchParams();
    params.set("diff", String(diff));
    params.set("against", overrides.against ?? against);
    params.set("view", overrides.view ?? diffView);
    if (overrides.full) params.set("full", "1");
    return `/${workspace}/a/${slug}/versions?${params.toString()}`;
  }

  const isRenderable = (v: typeof schema.artifactVersions.$inferSelect) =>
    v.type === "html" || isReactRenderable(v.type, v.language);
  const canRenderVisual =
    !!focused &&
    !!compareTarget &&
    isRenderable(focused.version) &&
    isRenderable(compareTarget.version);
  const diffView: "visual" | "text" =
    view === "text" ? "text" : canRenderVisual ? "visual" : "text";
  const isFull = full === "1" && diffView === "visual" && canRenderVisual;

  // Text diff needs full content of both versions — resolve from DB or object
  // storage. Skip the fetch entirely when showing the visual (iframe) diff.
  const diffContent =
    olderRow && newerRow && diffView === "text"
      ? {
          old: await getContent(olderRow.version),
          new: await getContent(newerRow.version),
        }
      : null;

  if (isFull && olderRow && newerRow) {
    return (
      <div className="hidden sm:flex fixed inset-0 z-50 bg-background flex-col">
        <header className="flex items-center justify-between gap-3 px-4 h-14 border-b border-border shrink-0">
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            {t("diffHeading", {
              from: olderRow.version.versionNumber,
              to: newerRow.version.versionNumber,
            })}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href={diffHref({ view: "visual" })}>
              <Minimize2 className="size-4" />
              {t("diffCollapse")}
            </Link>
          </Button>
        </header>
        <div className="grid grid-cols-2 gap-px bg-border flex-1 min-h-0">
          {[olderRow, newerRow].map(({ version }) => (
            <div key={version.id} className="bg-surface flex flex-col min-h-0">
              <div className="meta px-4 py-2 border-b border-border shrink-0">
                V{String(version.versionNumber).padStart(3, "0")} · {version.title}
              </div>
              <iframe
                src={rawContentPath({ slug, versionNumber: version.versionNumber })}
                sandbox="allow-scripts"
                className="w-full flex-1 bg-white"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="space-y-2 border-b border-border pb-6">
        <div className="meta">{t("crumb", { slug: artifact.slug })}</div>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("description", { count: versions.length })}
        </p>
      </div>

      {olderRow && newerRow && (
        <section className="hidden sm:block space-y-3">
          <header className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
              {t("diffHeading", {
                from: olderRow.version.versionNumber,
                to: newerRow.version.versionNumber,
              })}
            </h2>
            <div className="flex items-center gap-2">
              {showAgainstToggle && (
                <div className="flex border border-border rounded-sm overflow-hidden">
                  <Button
                    asChild
                    variant={against === "current" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                  >
                    <Link href={diffHref({ against: "current" })}>
                      {t("diffAgainstCurrent")}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={against === "previous" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                  >
                    <Link href={diffHref({ against: "previous" })}>
                      {t("diffAgainstPrevious")}
                    </Link>
                  </Button>
                </div>
              )}
              {canRenderVisual && (
                <div className="flex border border-border rounded-sm overflow-hidden">
                  <Button
                    asChild
                    variant={diffView === "visual" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                  >
                    <Link href={diffHref({ view: "visual" })}>
                      {t("diffVisual")}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={diffView === "text" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                  >
                    <Link href={diffHref({ view: "text" })}>
                      {t("diffText")}
                    </Link>
                  </Button>
                </div>
              )}
              {diffView === "visual" && canRenderVisual && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={diffHref({ view: "visual", full: true })}>
                    <Maximize2 className="size-4" />
                    {t("diffFullscreen")}
                  </Link>
                </Button>
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
              {[olderRow, newerRow].map(({ version }) => (
                <div key={version.id} className="bg-surface">
                  <div className="meta px-4 py-2 border-b border-border">
                    V{String(version.versionNumber).padStart(3, "0")} · {version.title}
                  </div>
                  <iframe
                    src={rawContentPath({ slug, versionNumber: version.versionNumber })}
                    sandbox="allow-scripts"
                    className="w-full bg-white h-[70vh]"
                  />
                </div>
              ))}
            </div>
          ) : diffContent ? (
            <VersionDiff
              oldContent={diffContent.old}
              newContent={diffContent.new}
              oldLabel={`V${olderRow.version.versionNumber} · ${olderRow.version.title}`}
              newLabel={`V${newerRow.version.versionNumber} · ${newerRow.version.title}`}
            />
          ) : null}
        </section>
      )}

      <ol className="border border-border bg-surface divide-y divide-border">
        {versions.map(({ version, author, reviewer }) => {
          const isCurrent = artifact.currentVersionId === version.id;
          // A version has something to diff against unless it's the only one
          // in the artifact's history (current AND the sole version).
          const hasDiffTarget = versions.length > 1;
          return (
            <li
              key={version.id}
              className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
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
                <div className="meta text-muted-foreground line-clamp-2">
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
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/${workspace}/a/${slug}/v/${version.versionNumber}`}
                  >
                    {t("view")}
                  </Link>
                </Button>
                {hasDiffTarget && (
                  <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
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
