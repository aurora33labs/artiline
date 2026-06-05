import "server-only";
import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * True when no users exist yet — a fresh self-hosted instance that still needs
 * its first (owner) account. Used by the self-host home to show the first-run
 * setup screen instead of the sign-in menu.
 */
export async function isFirstRun(): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(schema.users);
  return (row?.n ?? 0) === 0;
}
