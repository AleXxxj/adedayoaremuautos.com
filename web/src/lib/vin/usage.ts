import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { vinCheckUsage } from "@/db/schema";

/**
 * Lookups one visitor may run in a day. Checking a car costs two — "Is this
 * the car?" and then the results — so this is thirty cars: far more than a
 * shopper needs, far fewer than a script would want.
 */
export const DAILY_LOOKUPS = 60;

/**
 * The address a limit applies to.
 *
 * An IPv4 address as it is. An IPv6 address by its /64 network: a single
 * home or phone is usually handed a whole /64 and can pick a new address in
 * it at will, so counting single IPv6 addresses would count nothing. An IPv4
 * address written the IPv6 way ("::ffff:203.0.113.7") is treated as IPv4.
 */
export function networkOf(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;

  const [head, tail = ""] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/**
 * Today's key for a visitor: an HMAC of their network under a key that
 * changes every month.
 *
 * A plain hash of an IP address protects nothing — there are only four
 * billion IPv4 addresses and a laptop hashes them all in minutes. Keyed with
 * a server-side secret, the stored value can't be turned back into an
 * address without that secret, and a new key each month means this month's
 * values can't be matched to last month's.
 */
export function visitorKey(ip: string, now: Date, secret: string): string {
  const month = now.toISOString().slice(0, 7);
  const monthKey = createHmac("sha256", secret).update(`vin-check-visitor:${month}`).digest();
  return createHmac("sha256", monthKey).update(networkOf(ip)).digest("base64url").slice(0, 22);
}

/**
 * The secret behind visitorKey: VISITOR_HASH_SECRET if one is set, otherwise
 * the Supabase service key, which every deployment has and which never
 * leaves the server. The label inside visitorKey means what is derived from
 * it is good for this count and nothing else.
 */
function hashSecret(): string | null {
  return process.env.VISITOR_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Uses one of today's lookups for whoever is asking; false once they are
 * spent.
 *
 * Fails open: if the count can't be reached the check goes ahead. The tool
 * is free and NHTSA's answers are cached, and turning away a genuine visitor
 * because our own database hiccupped is the worse outcome.
 */
export async function spendLookup(
  // For scripts/verify-vin-usage.mts: no request, so no headers.
  test?: { database: typeof db; ip: string; now: Date; secret: string },
): Promise<boolean> {
  const database = test?.database ?? db;
  const now = test?.now ?? new Date();
  const secret = test?.secret ?? hashSecret();
  if (!secret) {
    console.warn("[vin] no secret to key the daily limit with; checks are not being counted");
    return true;
  }

  let ip = test?.ip;
  if (!ip) {
    // Set by Vercel's edge, which replaces anything the visitor sent.
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  }

  const visitor = visitorKey(ip, now, secret);
  const day = isoDay(now);
  try {
    const [row] = await database
      .insert(vinCheckUsage)
      .values({ visitor, day, lookups: 1 })
      .onConflictDoUpdate({
        target: [vinCheckUsage.visitor, vinCheckUsage.day],
        set: { lookups: sql`${vinCheckUsage.lookups} + 1` },
      })
      .returning({ lookups: vinCheckUsage.lookups });

    // Old days are no use to anyone. Cleared when a visitor starts a new
    // day, which is often enough to keep the table to a few days of rows.
    if (row?.lookups === 1) {
      const cutoff = isoDay(new Date(now.getTime() - 2 * 86_400_000));
      await database.delete(vinCheckUsage).where(lt(vinCheckUsage.day, cutoff));
    }
    return (row?.lookups ?? 0) <= DAILY_LOOKUPS;
  } catch (e) {
    console.error("[vin] daily count unavailable; letting the check through", e);
    return true;
  }
}
