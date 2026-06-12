import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { workspace: slug } = await params;
  const { q } = await searchParams;
  const { workspace } = await requireMemberPage(slug);

  const query = (q ?? "").trim();
  let results: Array<{
    artifactId: string;
    slug: string;
    title: string;
    versionNumber: number;
    rank: number;
  }> = [];

  if (query) {
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
      WHERE a.workspace_id = ${workspace.id}
        AND v.search_tsv @@ plainto_tsquery('simple', ${query})
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

      <form method="get" className="flex gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder="acme brief…"
          className="h-11"
          autoFocus
        />
        <Button type="submit">Buscar</Button>
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
