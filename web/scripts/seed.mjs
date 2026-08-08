#!/usr/bin/env node
/**
 * Seeds configuration rows only — the two markets.
 *
 * Deliberately does NOT seed locations, vehicles or staff. Those need real
 * business data (the actual Greensboro address, real inventory, real VINs).
 * Inventing plausible-looking placeholders is how "123 Auto Avenue, Victoria
 * Island, Lagos" ended up on a live website for months.
 *
 * Idempotent — safe to re-run.
 *
 *   node --env-file=.env.local scripts/seed.mjs
 */

import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No DIRECT_URL / DATABASE_URL set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  await sql`
    INSERT INTO markets (code, name, currency, locale, timezone, distance_unit, is_active)
    VALUES
      ('us', 'United States', 'USD', 'en-US', 'America/New_York', 'mi', true),
      ('ng', 'Nigeria',       'NGN', 'en-NG', 'Africa/Lagos',     'km', true)
    ON CONFLICT (code) DO UPDATE SET
      name          = EXCLUDED.name,
      currency      = EXCLUDED.currency,
      locale        = EXCLUDED.locale,
      timezone      = EXCLUDED.timezone,
      distance_unit = EXCLUDED.distance_unit`;

  const rows = await sql`
    SELECT code, name, currency, distance_unit, timezone FROM markets ORDER BY code`;

  console.log("\nMarkets seeded:");
  for (const r of rows) {
    console.log(
      `  ${r.code}  ${r.name.padEnd(14)} ${r.currency}  ${r.distance_unit.padEnd(2)}  ${r.timezone}`,
    );
  }

  // ── Locations ────────────────────────────────────────────────────────────
  // Real business data, supplied by the owner. Mon–Sat 06:00–18:00; closed
  // Sunday. ISO weekday numbering: 1 = Monday.
  const hours = [1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: "06:00",
    close: "18:00",
  }));

  await sql`
    INSERT INTO locations
      (id, market_code, name, address_line1, city, region, postal_code,
       country, phone, hours, is_active)
    VALUES
      ('00000000-0000-4000-8000-000000000001', 'us', 'Greensboro',
       '507 Gillespie St', 'Greensboro', 'NC', '27401',
       'US', '+13362076521', ${JSON.stringify(hours)}::jsonb, true)
    ON CONFLICT (id) DO UPDATE SET
      name          = EXCLUDED.name,
      address_line1 = EXCLUDED.address_line1,
      city          = EXCLUDED.city,
      region        = EXCLUDED.region,
      postal_code   = EXCLUDED.postal_code,
      country       = EXCLUDED.country,
      phone         = EXCLUDED.phone,
      hours         = EXCLUDED.hours,
      is_active     = EXCLUDED.is_active`;

  const locs = await sql`
    SELECT market_code, name, address_line1, city, region, postal_code, phone
    FROM locations ORDER BY market_code, name`;

  console.log("\nLocations seeded:");
  for (const l of locs) {
    console.log(
      `  ${l.market_code}  ${l.name} — ${l.address_line1}, ${l.city} ${l.region} ${l.postal_code}  ${l.phone}`,
    );
  }
  console.log("");
} finally {
  await sql.end();
}
