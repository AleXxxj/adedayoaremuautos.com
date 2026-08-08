#!/usr/bin/env node
/**
 * Applies pending migrations. Uses DIRECT_URL (session pooler, port 5432) —
 * DDL cannot run through the transaction pooler.
 *
 *   node --env-file=.env.local scripts/migrate.mjs
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_URL (or DATABASE_URL) before running migrations.");
  process.exit(1);
}

const client = postgres(url, { max: 1 });

try {
  await migrate(drizzle(client), { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations applied.");
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
