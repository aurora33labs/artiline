import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/drizzle/schema";

declare global {
  var __pgPool: Pool | undefined;
}

const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export { schema };
