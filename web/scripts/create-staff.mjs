#!/usr/bin/env node
/**
 * Creates a staff account: a Supabase auth user plus the matching `staff` row.
 *
 * Both are required. Having a Supabase account does NOT grant admin access —
 * requireStaff() checks for an active `staff` row as a separate gate, so a
 * stray signup can never reach the admin panel.
 *
 * You supply the password via the environment so it is never written into a
 * file, never committed, and never passed as a command argument (arguments are
 * visible to other processes via `ps` and land in your shell history).
 *
 *   STAFF_EMAIL="you@example.com" \
 *   STAFF_PASSWORD='...' \
 *   STAFF_ROLE=owner \
 *   npm run staff:create
 *
 * STAFF_ROLE: owner | manager | sales      (default: owner)
 * STAFF_MARKET: us | ng | all              (default: all)
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const email = process.env.STAFF_EMAIL?.trim();
const password = process.env.STAFF_PASSWORD;
const role = (process.env.STAFF_ROLE ?? "owner").trim();
const marketRaw = (process.env.STAFF_MARKET ?? "all").trim();
const fullName = process.env.STAFF_NAME?.trim() ?? null;

if (!email || !password) {
  console.error(
    "Set STAFF_EMAIL and STAFF_PASSWORD.\n\n" +
      "  STAFF_EMAIL='you@example.com' STAFF_PASSWORD='...' npm run staff:create\n",
  );
  process.exit(1);
}
if (password.length < 12) {
  console.error("Use a password of at least 12 characters — this account can edit live inventory.");
  process.exit(1);
}
if (!["owner", "manager", "sales"].includes(role)) {
  console.error(`STAFF_ROLE must be owner, manager or sales (got "${role}").`);
  process.exit(1);
}
if (!["us", "ng", "all"].includes(marketRaw)) {
  console.error(`STAFF_MARKET must be us, ng or all (got "${marketRaw}").`);
  process.exit(1);
}
const marketScope = marketRaw === "all" ? null : marketRaw;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL, { max: 1 });

try {
  // Reuse the auth user if it already exists, so re-running is safe.
  let userId;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no inbox round-trip needed for an internal account
  });

  if (error) {
    if (!/already/i.test(error.message)) throw error;
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existing = list.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!existing) throw new Error(`Could not find existing auth user ${email}`);
    userId = existing.id;
    console.log(`Auth user already existed — reusing it.`);
  } else {
    userId = created.user.id;
    console.log(`Auth user created.`);
  }

  await sql`
    INSERT INTO staff (id, email, full_name, role, market_scope, is_active)
    VALUES (${userId}, ${email}, ${fullName}, ${role}, ${marketScope}, true)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email, full_name = EXCLUDED.full_name,
      role = EXCLUDED.role, market_scope = EXCLUDED.market_scope,
      is_active = true`;

  const [row] = await sql`
    SELECT email, role, market_scope, is_active FROM staff WHERE id = ${userId}`;

  console.log(
    `\nStaff record ready:\n` +
      `  email   ${row.email}\n` +
      `  role    ${row.role}\n` +
      `  markets ${row.market_scope ?? "all"}\n` +
      `  active  ${row.is_active}\n\n` +
      `Sign in at /admin/login\n`,
  );
} catch (e) {
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
