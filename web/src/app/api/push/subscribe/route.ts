import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { isMarketCode, type MarketCode } from "@/lib/market";

export const dynamic = "force-dynamic";

/**
 * Registers a browser for notifications.
 *
 * Open to the public by design — granting notification permission is
 * something an anonymous visitor does, and requiring an account or an email
 * first would lose almost everyone. What that means is that the contents are
 * attacker-controlled, so nothing here is trusted: every field is validated,
 * the endpoint must belong to a push service rather than be any URL somebody
 * fancies, and the row carries no free text beyond a truncated user agent.
 */

/**
 * The push services in use by the browsers that matter. An endpoint is a URL
 * this server will later send authenticated requests to, so it is checked
 * against a list rather than accepted as given — otherwise this table becomes
 * a way to point the server at arbitrary hosts.
 */
const ALLOWED_HOSTS = [
  /\.googleapis\.com$/,            // Chrome, Edge, Android
  /\.mozilla\.com$/,               // Firefox
  /\.push\.apple\.com$/,           // Safari, iOS home-screen apps
  /\.windows\.com$/,               // older Edge
  /\.microsoft\.com$/,
];

const schema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(500),
    }),
  }),
  market: z.string().optional(),
  replaces: z.string().url().max(1000).nullish(),
});

function endpointAllowed(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return ALLOWED_HOSTS.some((re) => re.test(url.hostname));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { subscription, replaces } = parsed.data;
  if (!endpointAllowed(subscription.endpoint)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const candidate = parsed.data.market ?? "";
  const market: MarketCode = isMarketCode(candidate) ? candidate : "us";

  // Truncated, and only for knowing later how much of the audience is on iOS.
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300) || null;

  try {
    // The browser may hand back an endpoint already on file — the same person
    // visiting again, or permission re-granted. Upsert rather than insert, so
    // returning does not fail and does not duplicate.
    await db
      .insert(pushSubscriptions)
      .values({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        marketCode: market,
        userAgent,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          marketCode: market,
          userAgent,
          failureCount: 0,
          lastSeenAt: new Date(),
        },
      });

    // A browser rotating its own subscription tells us which one it replaced.
    if (replaces && replaces !== subscription.endpoint) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, replaces));
    }
  } catch (e) {
    console.error("[push] subscribe failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Turning notifications off from the page that turned them on. */
export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));
  return NextResponse.json({ ok: true });
}
