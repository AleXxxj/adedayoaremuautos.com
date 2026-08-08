#!/usr/bin/env node
/**
 * Reports what actually exists on the connected database, and proves the
 * booking constraint works there — not just in the local WASM test.
 *
 * The live double-booking check runs inside a transaction that is ALWAYS rolled
 * back, so this leaves no rows behind. Safe to run against production.
 *
 *   node --env-file=.env.local scripts/inspect-db.mjs
 */

import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No DIRECT_URL / DATABASE_URL set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  // Never print the credential; confirm where we landed instead.
  const [{ current_database, current_user, version }] = await sql`
    SELECT current_database(), current_user, version()`;
  console.log(
    `\nConnected to "${current_database}" as "${current_user}"\n${version.split(",")[0]}\n`,
  );

  const tables = await sql`
    SELECT c.relname AS name, c.reltuples::bigint AS est_rows,
           (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS indexes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`;

  console.log(`Tables (${tables.length}):`);
  for (const t of tables) {
    console.log(`  ${t.name.padEnd(24)} ${String(t.indexes).padStart(2)} indexes`);
  }

  const constraints = await sql`
    SELECT conname, contype
    FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public' AND contype IN ('x', 'c')
      AND conname NOT LIKE '%_not_null'
    ORDER BY contype DESC, conname`;

  console.log(`\nBusiness-rule constraints (${constraints.length}):`);
  for (const c of constraints) {
    const kind = c.contype === "x" ? "EXCLUDE" : "CHECK  ";
    console.log(`  ${kind}  ${c.conname}`);
  }

  const [gist] = await sql`
    SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'btree_gist'`;
  console.log(
    `\nbtree_gist extension: ${gist.n ? "installed" : "MISSING — booking constraint cannot work"}`,
  );

  const triggers = await sql`
    SELECT tgname FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY tgname`;
  console.log(`\nTriggers (${triggers.length}): ${triggers.map((t) => t.tgname).join(", ")}`);

  // ── Live proof, fully rolled back ────────────────────────────────────────
  console.log("\nLive double-booking test (rolled back, no data retained):");
  let firstAccepted = false;
  let secondRejected = false;
  let rejectionReason = "";

  try {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO markets (code, name, currency, locale, timezone, distance_unit)
               VALUES ('us','United States','USD','en-US','America/New_York','mi')
               ON CONFLICT (code) DO NOTHING`;

      await tx`INSERT INTO vehicles
                 (id, market_code, vin, make, model, year, mileage_unit, condition,
                  price_minor, currency, status, slug)
               VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','us','1HGBH41JXMN109186',
                       'Test','Vehicle',2020,'mi','Used',100000,'USD','draft','tmp-probe')`;

      await tx`INSERT INTO rental_bookings
                 (vehicle_id, market_code, period, customer_name, customer_phone,
                  status, total_minor, currency)
               VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','us',
                       tstzrange('2026-09-01','2026-09-08','[)'),
                       'Probe A','+13365550100','confirmed',50000,'USD')`;
      firstAccepted = true;

      try {
        await tx`INSERT INTO rental_bookings
                   (vehicle_id, market_code, period, customer_name, customer_phone,
                    status, total_minor, currency)
                 VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','us',
                         tstzrange('2026-09-05','2026-09-12','[)'),
                         'Probe B','+13365550101','confirmed',50000,'USD')`;
      } catch (e) {
        secondRejected = true;
        rejectionReason = e.constraint_name ?? e.message.split("\n")[0];
      }

      // Undo everything regardless of outcome.
      throw new Error("__rollback__");
    });
  } catch (e) {
    if (!e.message.includes("__rollback__")) throw e;
  }

  console.log(`  first booking accepted:  ${firstAccepted ? "yes" : "NO"}`);
  console.log(
    `  overlapping one rejected: ${secondRejected ? `yes (${rejectionReason})` : "NO — CONSTRAINT NOT WORKING"}`,
  );

  const [{ n: leftovers }] = await sql`
    SELECT count(*)::int AS n FROM vehicles WHERE slug = 'tmp-probe'`;
  console.log(`  rows left behind: ${leftovers}`);

  const healthy = firstAccepted && secondRejected && leftovers === 0 && gist.n > 0;
  console.log(
    healthy
      ? "\n\x1b[32mDatabase verified.\x1b[0m\n"
      : "\n\x1b[31mDatabase NOT verified.\x1b[0m\n",
  );
  process.exitCode = healthy ? 0 : 1;
} finally {
  await sql.end();
}
