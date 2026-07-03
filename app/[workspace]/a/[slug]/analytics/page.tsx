import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { isFeatureEnabled } from "@/lib/license";

export default async function ArtifactAnalyticsPage({
  params,
}: {
  params: Promise<{ workspace: string; slug: string }>;
}) {
  const { workspace: wsSlug, slug } = await params;
  const { workspace } = await requireMemberPage(wsSlug);

  const enabled = await isFeatureEnabled("tracking_advanced", {
    workspaceId: workspace.id,
  });
  if (!enabled) notFound();

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(and(eq(schema.artifacts.workspaceId, workspace.id), eq(schema.artifacts.slug, slug)))
    .limit(1);
  if (!artifact) notFound();

  const t = await getTranslations("analytics");

  const [totals] = await db
    .execute<{
      views: number;
      viewers: number;
      sessions: number;
      avgDwellMs: number | null;
      avgScrollDepth: number | null;
    }>(sql`
      SELECT
        count(*)::int AS views,
        count(DISTINCT viewer_hash)::int AS viewers,
        count(DISTINCT session_id)::int FILTER (WHERE session_id IS NOT NULL) AS sessions,
        avg(dwell_ms) FILTER (WHERE dwell_ms IS NOT NULL) AS "avgDwellMs",
        avg(scroll_depth) FILTER (WHERE scroll_depth IS NOT NULL) AS "avgScrollDepth"
      FROM view_events
      WHERE artifact_id = ${artifact.id}
        AND created_at >= now() - interval '30 days'
    `)
    .then((r) => r.rows);

  const daily = await db
    .execute<{ day: string; views: number }>(sql`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             count(*)::int AS views
      FROM view_events
      WHERE artifact_id = ${artifact.id}
        AND created_at >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `)
    .then((r) => r.rows);

  const countries = await db
    .execute<{ country: string | null; views: number }>(sql`
      SELECT country, count(*)::int AS views
      FROM view_events
      WHERE artifact_id = ${artifact.id}
        AND created_at >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 10
    `)
    .then((r) => r.rows);

  const scrollBuckets = await db
    .execute<{ bucket: string; n: number }>(sql`
      SELECT
        CASE
          WHEN scroll_depth < 25 THEN '0-25'
          WHEN scroll_depth < 50 THEN '25-50'
          WHEN scroll_depth < 75 THEN '50-75'
          ELSE '75-100'
        END AS bucket,
        count(*)::int AS n
      FROM view_events
      WHERE artifact_id = ${artifact.id}
        AND scroll_depth IS NOT NULL
        AND created_at >= now() - interval '30 days'
      GROUP BY 1
    `)
    .then((r) => r.rows);

  const byVersion = await db
    .execute<{ versionNumber: number; views: number; avgDwellMs: number | null }>(sql`
      SELECT v.version_number AS "versionNumber",
             count(e.*)::int AS views,
             avg(e.dwell_ms) FILTER (WHERE e.dwell_ms IS NOT NULL) AS "avgDwellMs"
      FROM view_events e
      INNER JOIN artifact_versions v ON v.id = e.version_id
      WHERE e.artifact_id = ${artifact.id}
      GROUP BY v.version_number
      ORDER BY v.version_number DESC
      LIMIT 20
    `)
    .then((r) => r.rows);

  const referrers = await db
    .execute<{ referrer: string | null; views: number }>(sql`
      SELECT referrer, count(*)::int AS views
      FROM view_events
      WHERE artifact_id = ${artifact.id}
        AND created_at >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 10
    `)
    .then((r) => r.rows);

  const maxDaily = Math.max(1, ...daily.map((d) => d.views));
  const scrollOrder = ["0-25", "25-50", "50-75", "75-100"];

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">{t("crumb", { slug: artifact.slug })}</div>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
        <Stat label={t("views30d")} value={totals?.views ?? 0} />
        <Stat label={t("uniqueViewers")} value={totals?.viewers ?? 0} />
        <Stat label={t("sessions")} value={totals?.sessions ?? 0} />
        <Stat
          label={t("avgDwell")}
          value={
            totals?.avgDwellMs != null ? `${Math.round(totals.avgDwellMs / 1000)}s` : "—"
          }
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("dailyViews")}
        </h2>
        {daily.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noData")}</p>
        ) : (
          <div className="border border-border bg-surface p-4 space-y-1">
            {daily.map((d) => (
              <div key={d.day} className="flex items-center gap-2">
                <span className="meta w-20 shrink-0">{d.day.slice(5)}</span>
                <div className="flex-1 h-3 bg-border/40">
                  <div
                    className="h-3 bg-primary"
                    style={{ width: `${(d.views / maxDaily) * 100}%` }}
                  />
                </div>
                <span className="meta w-10 text-right">{d.views}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid sm:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            {t("topCountries")}
          </h2>
          {countries.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noData")}</p>
          ) : (
            <ol className="border border-border bg-surface divide-y divide-border">
              {countries.map((c) => (
                <li key={c.country ?? "—"} className="px-4 py-2 flex justify-between text-sm">
                  <span>{c.country ?? "—"}</span>
                  <span className="meta">{c.views}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            {t("scrollDepth")}
          </h2>
          {scrollBuckets.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noData")}</p>
          ) : (
            <div className="border border-border bg-surface p-4 space-y-2">
              {scrollOrder.map((bucket) => {
                const found = scrollBuckets.find((b) => b.bucket === bucket);
                const n = found?.n ?? 0;
                const max = Math.max(1, ...scrollBuckets.map((b) => b.n));
                return (
                  <div key={bucket} className="flex items-center gap-2">
                    <span className="meta w-16 shrink-0">{bucket}%</span>
                    <div className="flex-1 h-3 bg-border/40">
                      <div className="h-3 bg-primary" style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                    <span className="meta w-10 text-right">{n}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("byVersion")}
        </h2>
        <ol className="border border-border bg-surface divide-y divide-border">
          {byVersion.map((v) => (
            <li key={v.versionNumber} className="px-6 py-3 flex flex-wrap items-center gap-3">
              <span className="font-display font-bold tracking-[0.06em]">
                V{String(v.versionNumber).padStart(3, "0")}
              </span>
              <span className="meta ml-auto">
                {v.views} {t("views")}
                {v.avgDwellMs != null ? ` · ${Math.round(v.avgDwellMs / 1000)}s ${t("avgDwellShort")}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("topReferrers")}
        </h2>
        {referrers.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noData")}</p>
        ) : (
          <ol className="border border-border bg-surface divide-y divide-border">
            {referrers.map((r, i) => (
              <li key={i} className="px-4 py-2 flex justify-between text-sm">
                <span className="truncate">{r.referrer ?? t("direct")}</span>
                <span className="meta">{r.views}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface p-4 space-y-1">
      <div className="meta text-muted-foreground">{label}</div>
      <div className="text-2xl font-display font-bold">{value}</div>
    </div>
  );
}
