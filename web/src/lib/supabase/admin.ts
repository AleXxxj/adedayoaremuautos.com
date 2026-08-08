import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses row-level security entirely.
 *
 * `server-only` makes importing this from a Client Component a BUILD error
 * rather than a runtime leak — the service role key must never reach a browser
 * bundle. Use this strictly for staff-authorised operations that have already
 * been permission-checked (photo upload, admin user creation).
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const VEHICLE_BUCKET = "vehicles";
