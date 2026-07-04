import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { listWorkspaceMembers } from "@/lib/members";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ARTIFACT_TYPES = ["html", "markdown", "code"] as const;
const VISIBILITIES = ["internal", "internal_pw", "public", "public_pw"] as const;

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    visibility?: string;
    author?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { workspace: slug } = await params;
  const { q, type, visibility, author, from, to } = await searchParams;
  const { workspace } = await requireMemberPage(slug);

  const query = (q ?? "").trim();
  const members = await listWorkspaceMembers(workspace.id);

  let results: Array<{
    artifactId: string;
    slug: string;
    title: string;
    versionNumber: number;
    rank: number;
  }> = [];

  if (query) {
    const conditions = [
      sql`a.workspace_id = ${workspace.id}`,
      sql`v.search_tsv @@ plainto_tsquery('simple', ${query})`,
    ];
    if (type && (ARTIFACT_TYPES as readonly string[]).includes(type)) {
      conditions.push(sql`v.type = ${type}`);
    }
    if (visibility && (VISIBILITIES as readonly string[]).includes(visibility)) {
      conditions.push(sql`a.visibility = ${visibility}`);
    }
    if (author) {
      conditions.push(sql`v.author_user_id = ${author}`);
    }
    if (from) {
      conditions.push(sql`v.created_at >= ${from}::date`);
    }
    if (to) {
      conditions.push(sql`v.created_at < (${to}::date + interval '1 day')`);
    }
    const whereClause = sql.join(conditions, sql` AND `);

    results = await db.execute<{
      artifactId: string;
      slug: string;
      title: string;
      versionNumber: number;
      rank: number;
    }>(sql`
      SELECT a.id AS "artifactId",
             a.slug,
             v.title,
             v.version_number AS "versionNumber",
             ts_rank(v.search_tsv, plainto_tsquery('simple', ${query})) AS rank
      FROM artifact_versions v
      INNER JOIN artifacts a ON a.id = v.artifact_id
      WHERE ${whereClause}
      ORDER BY rank DESC, v.created_at DESC
      LIMIT 50
    `).then((r) => r.rows ?? []);
  }

  // Deduplicate to latest version per artifact, keep top rank
  const dedup = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    const prev = dedup.get(r.artifactId);
    if (!prev || r.rank > prev.rank) dedup.set(r.artifactId, r);
  }
  const list = Array.from(dedup.values());

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">WORKSPACE · {workspace.name.toUpperCase()}</div>
        <h1 className="text-3xl">Search</h1>
        <p className="text-muted-foreground text-sm">
          Full-text search sobre title + content de cada versión.
        </p>
      </header>

      <form method="get" className="space-y-3">
        <div className="flex gap-2">
          <Input
            name="q"
            defaultValue={query}
            placeholder="acme brief…"
            className="h-11"
            autoFocus
          />
          <Button type="submit">Buscar</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            name="type"
            defaultValue={type ?? ""}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="">Tipo: todos</option>
            {ARTIFACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            name="visibility"
            defaultValue={visibility ?? ""}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="">Visibilidad: todas</option>
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            name="author"
            defaultValue={author ?? ""}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="">Autor: todos</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          />
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          />
        </div>
      </form>

      {query && (
        <section className="space-y-2">
          <div className="meta">
            {list.length} {list.length === 1 ? "RESULTADO" : "RESULTADOS"}
          </div>
          {list.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin coincidencias.</p>
          ) : (
            <ol className="border border-border bg-surface divide-y divide-border">
              {list.map((r) => (
                <li
                  key={r.artifactId}
                  className="px-6 py-4 flex flex-wrap items-center gap-3"
                >
                  <span className="font-display font-bold tracking-[0.06em]">
                    V{String(r.versionNumber).padStart(3, "0")}
                  </span>
                  <Link
                    href={`/${slug}/a/${r.slug}`}
                    className="text-base font-sans font-medium normal-case tracking-normal hover:text-primary transition-colors"
                  >
                    {r.title}
                  </Link>
                  <span className="meta ml-auto">
                    {r.slug.toUpperCase()} · rank {r.rank.toFixed(3)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
