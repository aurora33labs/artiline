import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Salt rotates daily. Hashing `ip + user-agent + salt` produces a stable
 * viewer identifier within a day, but the identifier rotates daily — making
 * the data pseudonymous for GDPR purposes.
 *
 * The salt is persisted in `tracking_salts(date primary key)`. First viewer
 * of the day inserts; subsequent reads hit the row.
 */
let memCache: { date: string; salt: string } | null = null;

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function getDailySalt(): Promise<string> {
  const date = todayKey();
  if (memCache && memCache.date === date) return memCache.salt;

  const [existing] = await db
    .select()
    .from(schema.trackingSalts)
    .where(eq(schema.trackingSalts.date, date))
    .limit(1);

  if (existing) {
    memCache = { date, salt: existing.salt };
    return existing.salt;
  }

  const salt = randomBytes(32).toString("hex");
  await db
    .insert(schema.trackingSalts)
    .values({ date, salt })
    .onConflictDoNothing();

  // Re-read in case of race (another request beat us)
  const [winner] = await db
    .select()
    .from(schema.trackingSalts)
    .where(eq(schema.trackingSalts.date, date))
    .limit(1);

  const finalSalt = winner?.salt ?? salt;
  memCache = { date, salt: finalSalt };
  return finalSalt;
}

export function hashViewer(
  ip: string | null,
  userAgent: string | null,
  salt: string,
): string {
  const h = createHash("sha256");
  h.update(`${ip ?? ""}|${userAgent ?? ""}|${salt}`);
  return h.digest("hex");
}

export function extractIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}

export async function recordView({
  artifactId,
  versionId,
  ip,
  userAgent,
  referrer,
  userId,
}: {
  artifactId: string;
  versionId: string;
  ip: string | null;
  userAgent: string | null;
  referrer: string | null;
  userId: string | null;
}): Promise<void> {
  const salt = await getDailySalt();
  const viewerHash = hashViewer(ip, userAgent, salt);
  await db.insert(schema.viewEvents).values({
    artifactId,
    versionId,
    viewerHash,
    userId,
    referrer,
  });
}
