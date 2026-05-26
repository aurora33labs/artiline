import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, isNull, sql } from "drizzle-orm";
import * as schema from "@/drizzle/schema";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema, casing: "snake_case" });

  console.log("[backfill] scanning artifacts without currentVersionId…");
  const rows = await db
    .select()
    .from(schema.artifacts)
    .where(isNull(schema.artifacts.currentVersionId));

  console.log(`[backfill] ${rows.length} artifact(s) need a v1`);

  let done = 0;
  for (const a of rows) {
    if (!a.type || !a.content || !a.title) {
      console.warn(`[backfill] skip ${a.id}: missing legacy content fields`);
      continue;
    }
    await db.transaction(async (tx) => {
      const [v1] = await tx
        .insert(schema.artifactVersions)
        .values({
          artifactId: a.id,
          versionNumber: 1,
          type: a.type!,
          content: a.content!,
          language: a.language ?? null,
          title: a.title!,
          message: "Initial version (backfilled)",
          authorUserId: a.authorUserId,
          reviewStatus: "approved",
          reviewedByUserId: a.authorUserId,
          reviewedAt: a.createdAt,
        })
        .returning({ id: schema.artifactVersions.id });
      await tx
        .update(schema.artifacts)
        .set({ currentVersionId: v1.id })
        .where(eq(schema.artifacts.id, a.id));
    });
    done += 1;
  }

  console.log(`[backfill] ${done}/${rows.length} backfilled`);

  const remaining = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.artifacts)
    .where(isNull(schema.artifacts.currentVersionId));
  console.log(`[backfill] remaining without currentVersionId: ${remaining[0].n}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
