import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/tenant";
import { VersionDiff } from "@/components/version-diff";
import { VersionRowActions } from "@/components/version-row-actions";
import { Button } from "@/components/ui/button";

export default async function VersionsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; slug: string }>;
  searchParams: Promise<{ diff?: string }>;
}) {
  const { workspace, slug } = await params;
  const { diff } = await searchParams;
  const { workspace: ws, session, role } = await requireMember(workspace);
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

  const versions = await db
    .select({
      version: schema.artifactVersions,
      author: { id: schema.users.id, name: schema.users.name, email: schema.users.email },
    })
    .from(schema.artifactVersions)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.artifactVersions.authorUserId),
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
          <header className="flex items-center justify-between">
            <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
              {t("diffHeading", {
                from: previous.version.versionNumber,
                to: focused.version.versionNumber,
              })}
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/${workspace}/a/${slug}/versions`}>
                {t("closeDiff")}
              </Link>
            </Button>
          </header>
          <VersionDiff
            oldContent={previous.version.content}
            newContent={focused.version.content}
            oldLabel={`V${previous.version.versionNumber} · ${previous.version.title}`}
            newLabel={`V${focused.version.versionNumber} · ${focused.version.title}`}
          />
        </section>
      )}

      <ol className="border border-border bg-surface divide-y divide-border">
        {versions.map(({ version, author }) => {
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
