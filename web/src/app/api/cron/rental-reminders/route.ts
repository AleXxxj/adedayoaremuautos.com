import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { MARKETS, MARKET_CODES } from "@/lib/market";
import { extensionsEnabled } from "@/lib/extensions/pricing";
import { runExtensionReminders } from "@/lib/extensions/store";
import { sendExtensionReminder } from "@/lib/mail/extensionReminder";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily "due back in 2 days" reminder, one run per market.
 *
 * Locked to the scheduler the same way the weekly digest is: Vercel sends
 * `Authorization: Bearer $CRON_SECRET`, and with no secret set the route
 * refuses everything. It does nothing at all unless RENTAL_EXTENSIONS_ENABLED
 * is on, and nothing before migration 0035 is applied.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!extensionsEnabled()) {
    return NextResponse.json({ ok: true, skipped: "RENTAL_EXTENSIONS_ENABLED is off" });
  }

  const results = [];
  for (const market of MARKET_CODES) {
    try {
      const cfg = MARKETS[market];
      let businessPhone: string | null = null;
      try {
        const sites = await listLocations(market);
        businessPhone = formatPhone(sites.find((s) => s.phone)?.phone ?? null);
      } catch (e) {
        console.error("[extensions] showroom phone lookup failed", e);
      }
      const day = new Intl.DateTimeFormat(cfg.locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        // The return date is a calendar day stored as a UTC midnight.
        timeZone: "UTC",
      });

      results.push(
        await runExtensionReminders(market, (t) =>
          sendExtensionReminder({
            to: t.to,
            name: t.name,
            vehicle: t.vehicle,
            returnDay: day.format(new Date(`${t.returnDate}T00:00:00Z`)),
            url: `${siteUrl()}/${market}/rentals/reserved/${t.token}`,
            businessPhone,
          }),
        ),
      );
    } catch (e) {
      console.error(`[extensions] reminders for ${market} threw`, e);
      results.push({ market, due: 0, sent: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
