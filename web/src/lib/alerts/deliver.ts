import "server-only";
import { db as realDb } from "@/db";
import { formatMoney, money } from "@/lib/money";
import { MARKETS } from "@/lib/market";
import { renderAlertConfirm, renderPriceDrop } from "@/lib/mail/priceAlert";
import { siteUrl } from "@/lib/siteUrl";
import {
  carName,
  dropMessage,
  dropPush,
  isDropWorthChecking,
  priceAlertsEnabled,
  type AlertCar,
  type PriceState,
} from "./rules";
import {
  claimDrop,
  countFailures,
  forgetBrowsers,
  isMissingAlertsTable,
  safeReason,
  sweepAlerts,
  type ConfirmToSend,
  type Db,
} from "./store";
import { liveTransports, type AlertTransports } from "./transports";

/**
 * Price-drop alerts: sending.
 *
 * Called after a car is saved in the admin (src/lib/actions/vehicles.ts,
 * inside `after()`), so the save has already succeeded and returned. Nothing
 * here can fail it, and nothing here throws.
 */

/** The page that confirms or stops one alert. The token is random, not personal. */
export const alertLink = (kind: "confirm" | "stop", token: string) =>
  `${siteUrl()}/alerts?${kind}=${token}`;

export interface DropResult {
  /** Watchers owed a message at this price. */
  owed: number;
  sent: number;
  failed: number;
  /** Browsers the push service said are gone; their rows were deleted. */
  gone: number;
}

const NOTHING: DropResult = { owed: 0, sent: 0, failed: 0, gone: 0 };

/** How many messages to have in flight at once. */
const CONCURRENCY = 10;

/**
 * Tells each watcher of one car, once, that its price is now lower.
 * The caller has already decided the change is worth checking.
 */
export async function sendPriceDrop(
  car: AlertCar & { id: string },
  newPriceMinor: number,
  db: Db = realDb,
  transports: AlertTransports = liveTransports,
): Promise<DropResult> {
  const owed = await claimDrop(car.id, newPriceMinor, db);
  if (owed.length === 0) return NOTHING;

  const failedIds: string[] = [];
  const goneEndpoints: string[] = [];
  let sent = 0;

  for (let i = 0; i < owed.length; i += CONCURRENCY) {
    await Promise.all(
      owed.slice(i, i + CONCURRENCY).map(async (w) => {
        const message = dropMessage(car, w.oldPriceMinor, newPriceMinor);
        try {
          if (w.channel === "push" && w.push) {
            const result = await transports.push(w.push, dropPush(message, car.slug));
            if (result === "sent") sent++;
            else if (result === "gone") goneEndpoints.push(w.push.endpoint);
            else failedIds.push(w.id);
          } else if (w.channel === "email" && w.email) {
            const ok = await transports.mail(
              w.email,
              renderPriceDrop({
                carName: message.name,
                oldPrice: message.oldPrice,
                newPrice: message.newPrice,
                carUrl: `${siteUrl()}${message.path}`,
                stopUrl: alertLink("stop", w.stopToken),
              }),
            );
            if (ok) sent++;
            else failedIds.push(w.id);
          }
        } catch {
          failedIds.push(w.id);
        }
      }),
    );
  }

  await forgetBrowsers(goneEndpoints, db);
  await countFailures(failedIds, db);

  return { owed: owed.length, sent, failed: failedIds.length, gone: goneEndpoints.length };
}

/**
 * Everything price alerts do when staff save a car. With the switch off this
 * does nothing at all, not even a query.
 */
export async function afterVehicleSaved(
  car: AlertCar & { id: string },
  before: PriceState,
  after: PriceState,
  db: Db = realDb,
  transports: AlertTransports = liveTransports,
): Promise<DropResult> {
  if (!priceAlertsEnabled()) return NOTHING;
  try {
    // First, so a car saved as sold ends its watchers before anything else,
    // and a car put back on sale has them again before the drop is judged.
    await sweepAlerts(db);
    if (!isDropWorthChecking(before, after)) return NOTHING;

    const result = await sendPriceDrop(car, after.priceMinor!, db, transports);
    if (result.owed > 0) {
      // Counts and the car only. Never an address or an endpoint.
      console.log(
        `[alerts] price drop on ${car.marketCode}/${car.slug}: sent ${result.sent}, failed ${result.failed}, gone ${result.gone}`,
      );
    }
    return result;
  } catch (e) {
    if (isMissingAlertsTable(e)) {
      console.warn("[alerts] PRICE_ALERTS_ENABLED is on but migration 0033 is not applied. Nothing sent.");
    } else {
      console.error("[alerts] after-save failed:", safeReason(e));
    }
    return NOTHING;
  }
}

/** Sends the one confirmation link. False when it could not be sent. */
export async function sendAlertConfirm(
  c: ConfirmToSend,
  transports: AlertTransports = liveTransports,
): Promise<boolean> {
  const cfg = MARKETS[c.car.marketCode];
  try {
    return await transports.mail(
      c.to,
      renderAlertConfirm({
        carName: carName(c.car),
        price: formatMoney(money(c.priceMinor, cfg.currency), cfg.locale),
        confirmUrl: alertLink("confirm", c.confirmToken),
        stopUrl: alertLink("stop", c.stopToken),
      }),
    );
  } catch {
    return false;
  }
}
