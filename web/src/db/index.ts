import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

/**
 * Serverless functions each open their own connection and are frequently torn
 * down, so a large pool here would exhaust Postgres' connection slots. Point
 * DATABASE_URL at Supabase's transaction pooler (port 6543) and keep the local
 * pool small; the pooler does the real multiplexing.
 *
 * `prepare: false` is required — the transaction pooler cannot support prepared
 * statements, and leaving it on produces intermittent errors under load rather
 * than an obvious failure.
 */
const client = postgres(url, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  /*
   * Fail fast when the database cannot be reached.
   *
   * Without a limit here a connection attempt to an unreachable backend hangs
   * until the serverless function itself is killed. Every request in flight
   * holds its slot for that whole time, new requests pile up behind them, and
   * a backend that is briefly unwell produces an outage far longer than the
   * problem that started it — which is how a short blip became fifteen minutes
   * of a completely dead site.
   *
   * Ten seconds is longer than a healthy connection ever takes and short
   * enough that the error boundary gets to render something useful.
   */
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };
