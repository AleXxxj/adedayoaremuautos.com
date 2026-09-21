import "server-only";
import { pushToMarket } from "@/lib/push/send";
import { formatMoney, money } from "@/lib/money";
import { MARKETS, type MarketCode } from "@/lib/market";

/**
 * The notifications the site sends by itself.
 *
 * Separate from send.ts so the wording of what customers receive lives in one
 * readable place rather than being assembled inside a database action.
 *
 * Every one of these is fire-and-forget. A notification that fails must never
 * fail the thing that triggered it: publishing a vehicle has to succeed
 * whether or not a push service is reachable, the same rule the lead alerts
 * already follow.
 */

/** Runs the send without letting it reach the caller, whatever happens. */
function detach(what: string, run: Promise<unknown>): void {
  void run.catch((e) => {
    console.error(`[push] ${what} failed`, e);
  });
}

export function announceVehicle(vehicle: {
  marketCode: MarketCode;
  slug: string;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  priceMinor: number | null;
}): void {
  const cfg = MARKETS[vehicle.marketCode];
  const name = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

  const price =
    vehicle.priceMinor != null
      ? formatMoney(money(vehicle.priceMinor, cfg.currency), cfg.locale)
      : null;

  detach(
    "vehicle",
    pushToMarket(vehicle.marketCode, {
      title: "Just arrived",
      body: price ? `${name} — ${price}` : name,
      url: `/${vehicle.marketCode}/inventory/${vehicle.slug}`,
      /*
       * One tag for all stock announcements, so they replace each other.
       *
       * Staff photograph and list several cars in a sitting. Without this,
       * eight cars is eight notifications in one afternoon, and the reliable
       * result of that is people revoking permission — which costs the
       * business the channel permanently, for every future message.
       */
      tag: "new-stock",
    }),
  );
}

/** A manual message: an offer, an announcement, a new article. */
export function announceCustom(
  market: MarketCode,
  message: { title: string; body: string; url: string },
): void {
  detach(
    "broadcast",
    pushToMarket(market, {
      ...message,
      // No tag: a deliberate message from the business should never silently
      // replace the last one.
    }),
  );
}
