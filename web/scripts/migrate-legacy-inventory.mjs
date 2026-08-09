#!/usr/bin/env node
/**
 * Migrates the four vehicles that are live on the legacy site right now into
 * the platform, uploading their photography to Supabase Storage.
 *
 * These are not invented listings — they are currently advertised at these
 * exact prices on alexxxj.github.io/adedayoaremuautos.com, so publishing them
 * here makes no claim that is not already public. Any that have since sold
 * should be set to Sold in the admin.
 *
 * Idempotent: re-running updates the rows rather than duplicating them.
 *
 *   node --env-file=.env.local scripts/migrate-legacy-inventory.mjs
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const LEGACY = join(process.cwd(), "..", "images", "cars");

/** Naira → kobo. */
const kobo = (naira) => naira * 100;

const VEHICLES = [
  {
    id: "aa000000-0000-4000-8000-000000000001",
    slug: "2001-mercedes-benz-s430",
    make: "Mercedes-Benz", model: "S430", year: 2001,
    mileage: 145_371, priceNaira: 6_800_000,
    chassis: "LEGACY-S430-2001",
    file: "benz-2001-thmbnail.PNG", mime: "image/png",
    body: "Sedan",
    description:
      "A well-kept S-Class from the W220 generation, imported and inspected. Comfortable long-distance saloon with the 4.3 litre V8.",
  },
  {
    id: "aa000000-0000-4000-8000-000000000002",
    slug: "2011-toyota-camry",
    make: "Toyota", model: "Camry", year: 2011,
    mileage: 35_000, priceNaira: 12_500_000,
    chassis: "LEGACY-CAMRY-2011",
    file: "toyota-camry-thumbnail.JPEG", mime: "image/jpeg",
    body: "Sedan",
    description:
      "Low-mileage Camry, the default choice for buyers who want something that simply does not break. Foreign used and fully documented.",
  },
  {
    id: "aa000000-0000-4000-8000-000000000003",
    slug: "2013-nissan-rogue",
    make: "Nissan", model: "Rogue", year: 2013,
    mileage: 90_000, priceNaira: 15_000_000,
    chassis: "LEGACY-ROGUE-2013",
    file: "nissan-rogue-thmbnail.PNG", mime: "image/png",
    body: "SUV",
    description:
      "Compact SUV with the ground clearance to cope with poor roads and running costs closer to a saloon. Foreign used.",
  },
  {
    id: "aa000000-0000-4000-8000-000000000004",
    slug: "2012-mercedes-benz-glk",
    make: "Mercedes-Benz", model: "GLK", year: 2012,
    mileage: 45_000, priceNaira: 16_500_000,
    chassis: "LEGACY-GLK-2012",
    file: "glk-2012-thmbnail.PNG", mime: "image/png",
    body: "SUV",
    description:
      "The GLK pairs a compact footprint with genuine Mercedes build. Low mileage for its year, foreign used and inspected.",
  },
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL, { max: 1 });

try {
  for (const v of VEHICLES) {
    await sql`
      INSERT INTO vehicles (
        id, market_code, chassis_no, make, model, year, body_style,
        mileage, mileage_unit, transmission, fuel_type, condition,
        price_minor, currency, status, slug, description, published_at,
        listing_kind
      ) VALUES (
        ${v.id}, 'ng', ${v.chassis}, ${v.make}, ${v.model}, ${v.year}, ${v.body},
        ${v.mileage}, 'km', 'Automatic', 'Petrol', 'Foreign Used',
        ${kobo(v.priceNaira)}, 'NGN', 'available', ${v.slug}, ${v.description}, now(),
        'sale'
      )
      ON CONFLICT (id) DO UPDATE SET
        make = EXCLUDED.make, model = EXCLUDED.model, year = EXCLUDED.year,
        mileage = EXCLUDED.mileage, price_minor = EXCLUDED.price_minor,
        description = EXCLUDED.description, body_style = EXCLUDED.body_style`;

    const [existing] = await sql`
      SELECT count(*)::int AS n FROM vehicle_media WHERE vehicle_id = ${v.id}`;

    if (existing.n === 0) {
      const bytes = readFileSync(join(LEGACY, v.file));
      const key = `${v.id}/${randomUUID()}.${v.mime === "image/jpeg" ? "jpg" : "png"}`;

      const { error } = await supabase.storage
        .from("vehicles")
        .upload(key, bytes, { contentType: v.mime, upsert: false });
      if (error) throw new Error(`${v.slug}: upload failed — ${error.message}`);

      await sql`
        INSERT INTO vehicle_media (vehicle_id, storage_key, alt, position, is_primary)
        VALUES (${v.id}, ${key}, ${`${v.year} ${v.make} ${v.model}`}, 0, true)`;

      console.log(`  ${v.slug.padEnd(26)} inserted + photo uploaded`);
    } else {
      console.log(`  ${v.slug.padEnd(26)} updated (photo already present)`);
    }
  }

  const rows = await sql`
    SELECT v.slug, v.price_minor, count(m.id)::int AS photos
    FROM vehicles v LEFT JOIN vehicle_media m ON m.vehicle_id = v.id
    WHERE v.market_code = 'ng' GROUP BY v.slug, v.price_minor ORDER BY v.price_minor`;

  console.log("\nNigeria inventory:");
  for (const r of rows) {
    console.log(`  ₦${(Number(r.price_minor) / 100).toLocaleString()}  ${r.slug}  (${r.photos} photo)`);
  }
} catch (e) {
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
