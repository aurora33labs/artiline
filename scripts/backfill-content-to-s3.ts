import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import * as schema from "@/drizzle/schema";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Moves existing inline artifact content (DB) into object storage, setting
 * `content_key` and clearing `content`. Idempotent and safe to re-run: it only
 * touches rows that still have inline content and no key. Requires an S3-compatible
 * backend (R2_*). No-op without one — existing rows keep working via dual-read.
 *
 *   pnpm tsx scripts/backfill-content-to-s3.ts
 */
async function main() {
  // Import after dotenv so lib/r2's module-level env reads see the values.
  const { r2Configured, uploadObject } = await import("@/lib/r2");
  if (!r2Configured()) {
    console.error("[backfill-s3] R2 not configured — nothing to do.");
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema, casing: "snake_case" });

  const rows = await db
    .select({
      id: schema.artifactVersions.id,
      type: schema.artifactVersions.type,
      content: schema.artifactVersions.content,
      snippet: schema.artifactVersions.contentSnippet,
      bytes: schema.artifactVersions.contentBytes,
    })
    .from(schema.artifactVersions)
    .where(
      and(
        isNotNull(schema.artifactVersions.content),
        isNull(schema.artifactVersions.contentKey),
      ),
    );

  console.log(`[backfill-s3] ${rows.length} version(s) to move`);
  let done = 0;
  for (const r of rows) {
    if (r.content == null) continue;
    const key = `artifacts/${r.id}`;
    const contentType =
      r.type === "html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
    await uploadObject(key, Buffer.from(r.content, "utf8"), contentType);
    await db
      .update(schema.artifactVersions)
      .set({
        contentKey: key,
        content: null,
        contentSnippet: r.snippet ?? r.content.slice(0, 4096),
        contentBytes: r.bytes ?? Buffer.byteLength(r.content, "utf8"),
      })
      .where(eq(schema.artifactVersions.id, r.id));
    done += 1;
    if (done % 25 === 0) console.log(`[backfill-s3] ${done}/${rows.length}`);
  }

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.artifactVersions)
    .where(
      and(
        isNotNull(schema.artifactVersions.content),
        isNull(schema.artifactVersions.contentKey),
      ),
    );
  console.log(`[backfill-s3] done: ${done} moved, ${n} still inline`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
