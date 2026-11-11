import { and, asc, desc, eq, gt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, vehicleMedia, rentalRates, rentalBookings } from "@/db/schema";
import { MARKETS, type MarketCode } from "@/lib/market";
import { mediaUrl } from "@/lib/media";
import type { RentalTariff } from "@/lib/rental";

/** A vehicle offered for hire, with its tariff and primary image. */
export interface FleetVehicle {
  id: string;
  slug: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: string | null;
  transmission: string | null;
  fuelType: string | null;
  seats: number | null;
  image: string | null;
  tariff: RentalTariff;
}

/** Exported so the rental agreement can reprice a booking from the same
 *  tariff shape the booking engine used, rather than defining a second one. */
export function toTariff(r: typeof rentalRates.$inferSelect): RentalTariff {
  return {
    dailyMinor: r.dailyMinor,
    weeklyMinor: r.weeklyMinor,
    monthlyMinor: r.monthlyMinor,
    depositMinor: r.depositMinor,
    currency: r.currency,
    minDays: r.minDays,
    maxDays: r.maxDays,
    withDriverAvailable: r.withDriverAvailable,
    driverDailyMinor: r.driverDailyMinor,
    injuryCoverDailyMinor: r.injuryCoverDailyMinor,
  };
}

/**
 * The hire fleet for a market.
 *
 * A vehicle appears only when it is flagged for rental AND has a tariff. A car
 * listed for hire with no price is worse than not listing it — the customer
 * asks, and someone has to invent a number.
 */
export async function listFleet(market: MarketCode): Promise<FleetVehicle[]> {
  const rows = await db
    .select({ v: vehicles, r: rentalRates })
    .from(vehicles)
    .innerJoin(rentalRates, eq(rentalRates.vehicleId, vehicles.id))
    .where(
      and(
        eq(vehicles.marketCode, market),
        or(eq(vehicles.listingKind, "rental"), eq(vehicles.listingKind, "both")),
        or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
      ),
    )
    .orderBy(asc(rentalRates.dailyMinor));

  if (rows.length === 0) return [];

  const media = await db
    .select()
    .from(vehicleMedia)
    .where(eq(vehicleMedia.isPrimary, true));

  const imageFor = new Map(media.map((m) => [m.vehicleId, mediaUrl(m.storageKey)]));

  return rows.map(({ v, r }) => ({
    id: v.id,
    slug: v.slug,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    bodyStyle: v.bodyStyle,
    transmission: v.transmission,
    fuelType: v.fuelType,
    seats: v.seats,
    image: imageFor.get(v.id) ?? null,
    tariff: toTariff(r),
  }));
}

/**
 * One car's rental page.
 *
 * A car never offered for rent has no rental page: it has no rates, so the
 * join finds nothing. A car that was offered and no longer is (sold, or taken
 * off rental, which keeps its rates) keeps its page — a partner's link or a
 * bookmark still lands somewhere — but `bookable` is false, so the page says
 * so instead of showing a form the booking would refuse: the same test as
 * the rental list and requestRental.
 */
export async function getFleetVehicle(
  market: MarketCode,
  slug: string,
): Promise<(FleetVehicle & { bookable: boolean }) | null> {
  const [row] = await db
    .select({ v: vehicles, r: rentalRates })
    .from(vehicles)
    .innerJoin(rentalRates, eq(rentalRates.vehicleId, vehicles.id))
    .where(and(eq(vehicles.marketCode, market), eq(vehicles.slug, slug)))
    .limit(1);

  if (!row) return null;
  if (row.v.status === "draft" || row.v.status === "unlisted") return null;

  const images = await db
    .select()
    .from(vehicleMedia)
    .where(eq(vehicleMedia.vehicleId, row.v.id))
    .orderBy(desc(vehicleMedia.isPrimary), asc(vehicleMedia.position));

  return {
    id: row.v.id,
    slug: row.v.slug,
    year: row.v.year,
    make: row.v.make,
    model: row.v.model,
    trim: row.v.trim,
    bodyStyle: row.v.bodyStyle,
    transmission: row.v.transmission,
    fuelType: row.v.fuelType,
    seats: row.v.seats,
    image: images[0] ? mediaUrl(images[0].storageKey) : null,
    tariff: toTariff(row.r),
    bookable:
      (row.v.listingKind === "rental" || row.v.listingKind === "both") &&
      (row.v.status === "available" || row.v.status === "pending"),
  };
}

/**
 * The bookings that keep a car from being booked again.
 *
 * Confirmed and active hires, and reservations whose hold is still running —
 * the same set the database's no-overlap constraint protects. This used to
 * leave reservations out, so a reserved car showed as free right up until a
 * second customer had filled in the whole form, photos and all, only to be
 * told the dates were taken. Expired holds are excluded by time rather than by
 * waiting for the sweep, so a reservation nobody came back for stops showing
 * the moment it ends.
 */
function blocksTheCar(now: Date) {
  return or(
    eq(rentalBookings.status, "confirmed"),
    eq(rentalBookings.status, "active"),
    and(eq(rentalBookings.status, "quote"), gt(rentalBookings.paymentHoldUntil, now)),
  );
}

/**
 * Whether a vehicle is free for a window.
 *
 * This is a courtesy check for the UI, NOT the guarantee. Between this query
 * and the insert, another booking can land — which is exactly why the database
 * carries an exclusion constraint. Treat a `true` here as "worth showing the
 * form", never as "the booking will succeed".
 */
export async function isAvailable(
  vehicleId: string,
  from: Date,
  to: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rentalBookings)
    .where(
      and(
        eq(rentalBookings.vehicleId, vehicleId),
        blocksTheCar(new Date()),
        sql`${rentalBookings.period} && tstzrange(${from.toISOString()}, ${to.toISOString()}, '[)')`,
      ),
    );

  return Number(row.n) === 0;
}

/**
 * Taken and held windows ahead, so the UI can show which dates are gone.
 *
 * Each comes with its hold's end, because the page that lists them is cached
 * and a hold ends by the clock: the browser drops reservations that have run
 * out since the page was rendered. Only meaningful while status is "quote";
 * a confirmed hire can keep an old hold time that no longer means anything.
 */
export async function bookedWindows(vehicleId: string, fromDate: Date) {
  return db
    .select({
      period: rentalBookings.period,
      status: rentalBookings.status,
      heldUntil: rentalBookings.paymentHoldUntil,
    })
    .from(rentalBookings)
    .where(
      and(
        eq(rentalBookings.vehicleId, vehicleId),
        blocksTheCar(fromDate),
        sql`upper(${rentalBookings.period}) >= ${fromDate.toISOString()}`,
      ),
    );
}

/** Admin view: bookings for a market, soonest first. */
export async function listBookings(markets: MarketCode[]) {
  return db
    .select({
      booking: rentalBookings,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      slug: vehicles.slug,
      // Everything cleared against the booking, online or at the counter.
      // bigint arrives as a string from postgres.js; the page converts it.
      paidMinor: sql<string>`(
        select coalesce(sum(p.amount_minor), 0)::bigint from rental_payments p
        where p.booking_id = ${rentalBookings.id} and p.status = 'paid'
      )`,
    })
    .from(rentalBookings)
    .leftJoin(vehicles, eq(rentalBookings.vehicleId, vehicles.id))
    .where(
      markets.length === 1
        ? eq(rentalBookings.marketCode, markets[0])
        : sql`${rentalBookings.marketCode} = ANY(${sql.raw(
            `ARRAY['${markets.join("','")}']::market_code[]`,
          )})`,
    )
    .orderBy(desc(rentalBookings.createdAt))
    .limit(200);
}

export const marketOf = (code: MarketCode) => MARKETS[code];
