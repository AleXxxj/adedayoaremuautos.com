import "server-only";
import { and, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  rentalBookings,
  rentalExtensionReminders,
  rentalExtensionRequests,
  rentalRates,
  vehicles,
} from "@/db/schema";
import { violates } from "@/lib/dbError";
import { todayIn } from "@/lib/localDate";
import { MARKETS, type MarketCode } from "@/lib/market";
import { parseTstzRange } from "@/lib/pgRange";
import { rentalDays, RentalError } from "@/lib/rental";
import { toTariff } from "@/lib/repositories/rentals";
import {
  addDays,
  extensionWindow,
  extensionsEnabled,
  MAX_REQUESTS_PER_BOOKING,
  quoteExtension,
  REMINDER_DAYS_BEFORE,
  type ExtendBlock,
  type ExtensionQuote,
} from "./pricing";

/**
 * "Keep it another week": reading and writing the requests.
 *
 * The shape chosen is a request staff approve, not a second booking row for
 * the added days. A second row would be a second thing to mark active and
 * returned for one car in one person's hands, a second total to collect, and
 * a join the pricing could not see across (3 weeks + 1 week is a month). So
 * approval lengthens the booking itself, in one UPDATE, and the database's
 * `rental_bookings_no_overlap` constraint judges that UPDATE. Nothing in this
 * file decides who has the car.
 *
 * Every function takes the database as a parameter so
 * scripts/verify-extensions.mts can run them against a throwaway Postgres.
 *
 * Before migration 0035 is applied the tables do not exist. Reads treat that
 * as "feature off"; writes refuse with an ordinary sentence.
 */

type Database = typeof db;
type Booking = typeof rentalBookings.$inferSelect;

/** Postgres 42P01 (no such table) or 42703 (no such column), anywhere in the chain. */
export function isMissingSchema(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (e.code === "42P01" || e.code === "42703") return true;
    current = e.cause;
  }
  return false;
}

/** A tappable token: the same test the reserved page applies. */
export function validToken(token: string | null | undefined): token is string {
  return Boolean(token && token.length >= 20 && !/[^A-Za-z0-9_-]/.test(token));
}

export interface ExtensionRequestSummary {
  id: string;
  status: "pending" | "approved" | "declined";
  /** "2026-11-27" */
  newEnd: string;
  addedDays: number;
  addedMinor: number;
  newTotalMinor: number;
}

export interface ExtensionOption extends ExtensionQuote {
  /** "2026-11-27" */
  newEnd: string;
}

export interface ExtensionView {
  /** The newest request, whatever became of it. */
  latest: ExtensionRequestSummary | null;
  /** Whether a new request can be filed right now. */
  canAsk: boolean;
  /** Why not, when the dates or the rules are the reason. */
  block: ExtendBlock | "no-rate" | "too-many" | null;
  /** A sentence from the pricing rules when no length could be priced. */
  blockMessage: string | null;
  /** The current return date, "2026-11-20". */
  endDate: string;
  /** The day another booking starts, when one follows. The car is free until then. */
  bookedFrom: string | null;
  /** One entry per day count that can be asked for, shortest first. */
  options: ExtensionOption[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function summary(r: typeof rentalExtensionRequests.$inferSelect): ExtensionRequestSummary {
  return {
    id: r.id,
    status: r.status as ExtensionRequestSummary["status"],
    newEnd: iso(r.newEnd),
    addedDays: r.addedDays,
    addedMinor: r.addedMinor,
    newTotalMinor: r.newTotalMinor,
  };
}

/**
 * How many days after `end` the car is free of other bookings, or null when
 * nothing follows.
 *
 * The same test a new request applies: confirmed and active bookings, and
 * quotes whose hold is still running. Advice for what to offer, not the
 * guarantee; the guarantee is the constraint at approval.
 */
async function freeDaysAfter(
  database: Database,
  b: Pick<Booking, "id" | "vehicleId">,
  end: Date,
  now: Date,
): Promise<number | null> {
  const [next] = await database
    // As seconds, so no timestamp text has to be parsed.
    .select({
      starts: sql<number | null>`extract(epoch from min(lower(${rentalBookings.period})))::float8`,
    })
    .from(rentalBookings)
    .where(
      and(
        eq(rentalBookings.vehicleId, b.vehicleId),
        ne(rentalBookings.id, b.id),
        sql`upper(${rentalBookings.period}) > ${end.toISOString()}::timestamptz`,
        or(
          inArray(rentalBookings.status, ["confirmed", "active"]),
          and(eq(rentalBookings.status, "quote"), gt(rentalBookings.paymentHoldUntil, now)),
        ),
      ),
    );
  if (next?.starts == null) return null;
  const starts = Number(next.starts) * 1000;
  if (!Number.isFinite(starts)) return 0;
  return Math.max(0, Math.floor((starts - end.getTime()) / 86_400_000));
}

interface Offer {
  endDate: string;
  bookedFrom: string | null;
  end: Date;
  block: ExtensionView["block"];
  blockMessage: string | null;
  options: ExtensionOption[];
}

/** Everything that can be asked for on this booking right now, priced. */
async function offerFor(database: Database, b: Booking, now: Date): Promise<Offer | null> {
  const range = parseTstzRange(b.period as unknown as string);
  if (!range) return null;
  const endDate = iso(range.end);
  const base = {
    endDate,
    end: range.end,
    bookedFrom: null as string | null,
    options: [] as ExtensionOption[],
    blockMessage: null,
  };

  const market = MARKETS[b.marketCode as MarketCode];
  const currentDays = rentalDays(range.start, range.end);

  const [rate] = await database
    .select()
    .from(rentalRates)
    .where(eq(rentalRates.vehicleId, b.vehicleId))
    .limit(1);
  // Taken off rental since: nothing to price with, so it is a phone call.
  if (!rate || rate.currency !== b.currency) return { ...base, block: "no-rate" };
  const tariff = toTariff(rate);

  const freeDays = await freeDaysAfter(database, b, range.end, now);
  base.bookedFrom = freeDays == null ? null : addDays(endDate, freeDays);
  const window = extensionWindow({
    status: b.status,
    endDate,
    today: todayIn(market.timezone, now),
    currentDays,
    tariffMaxDays: tariff.maxDays,
    freeDays,
  });
  if (window.block) return { ...base, block: window.block };

  const options: ExtensionOption[] = [];
  let blockMessage: string | null = null;
  for (let days = window.minDays; days <= window.maxDays; days++) {
    try {
      options.push({
        ...quoteExtension(
          tariff,
          {
            currentDays,
            totalMinor: b.totalMinor,
            withDriver: b.withDriver,
            injuryCover: b.insuranceChoice === "company",
            injuryCoverDailyMinor: b.injuryCoverDailyMinor,
          },
          days,
        ),
        newEnd: addDays(endDate, days),
      });
    } catch (e) {
      if (!(e instanceof RentalError)) throw e;
      blockMessage = e.message;
      break;
    }
  }
  return {
    ...base,
    options,
    block: options.length === 0 ? "no-rate" : null,
    blockMessage: options.length === 0 ? blockMessage : null,
  };
}

/**
 * What the renter's page shows. Null means "show nothing": the switch is off,
 * the migration has not been applied, or the booking is not one that can be
 * extended and never asked to be.
 */
export async function extensionViewFor(
  b: Booking,
  opts: { database?: Database; now?: Date; enabled?: boolean } = {},
): Promise<ExtensionView | null> {
  const database = opts.database ?? db;
  const now = opts.now ?? new Date();
  if (!(opts.enabled ?? extensionsEnabled())) return null;

  try {
    const rows = await database
      .select()
      .from(rentalExtensionRequests)
      .where(eq(rentalExtensionRequests.bookingId, b.id))
      .orderBy(desc(rentalExtensionRequests.createdAt));
    const latest = rows[0] ? summary(rows[0]) : null;

    const extendable = b.status === "confirmed" || b.status === "active";
    if (!extendable && !latest) return null;

    const offer = extendable ? await offerFor(database, b, now) : null;
    if (!offer) {
      if (!latest) return null;
      const range = parseTstzRange(b.period as unknown as string);
      return {
        latest,
        canAsk: false,
        block: "status",
        blockMessage: null,
        endDate: range ? iso(range.end) : latest.newEnd,
        bookedFrom: null,
        options: [],
      };
    }

    const tooMany = rows.length >= MAX_REQUESTS_PER_BOOKING;
    const pending = latest?.status === "pending";
    return {
      latest,
      canAsk: !pending && !tooMany && offer.options.length > 0,
      block: offer.block ?? (tooMany && !pending ? "too-many" : null),
      blockMessage: offer.blockMessage,
      endDate: offer.endDate,
      bookedFrom: offer.bookedFrom,
      options: pending ? [] : offer.options,
    };
  } catch (e) {
    if (isMissingSchema(e)) return null;
    throw e;
  }
}

export interface FileResult {
  ok: boolean;
  error?: string;
  request?: ExtensionRequestSummary;
  /** For the staff alert. Never sent to the browser. */
  booking?: Booking;
  vehicle?: string;
}

const CALL_US = "Please call us and we will sort it out.";

/**
 * Files a request from the renter's own page.
 *
 * The token is the only credential, exactly as on the page it comes from. The
 * price is worked out here, from the booking and the tariff; the browser
 * sends a number of days and nothing else.
 *
 * No hold is taken and no money moves. If another renter books the days in
 * the meantime, approval is refused by the constraint and staff say so.
 */
export async function fileExtensionRequest(
  q: { token: string; marketCode: string; addedDays: number },
  opts: { database?: Database; now?: Date; enabled?: boolean } = {},
): Promise<FileResult> {
  const database = opts.database ?? db;
  const now = opts.now ?? new Date();
  if (!(opts.enabled ?? extensionsEnabled())) {
    return { ok: false, error: `Extra days can't be requested online right now. ${CALL_US}` };
  }
  if (!validToken(q.token)) return { ok: false, error: "This link is not valid." };

  const [row] = await database
    .select({ b: rentalBookings, v: vehicles })
    .from(rentalBookings)
    .leftJoin(vehicles, eq(vehicles.id, rentalBookings.vehicleId))
    .where(
      and(
        eq(rentalBookings.reservationToken, q.token),
        sql`${rentalBookings.marketCode}::text = ${q.marketCode}`,
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "This link is not valid." };
  const b = row.b;

  if (b.status !== "confirmed" && b.status !== "active") {
    return { ok: false, error: `This booking can't be extended online. ${CALL_US}` };
  }

  try {
    const offer = await offerFor(database, b, now);
    const pick = offer?.options.find((o) => o.addedDays === q.addedDays);
    if (!offer || !pick) {
      return {
        ok: false,
        error:
          offer?.block === "booked-next" || (offer && offer.options.length > 0)
            ? "The car is not free for all of those days. Choose a shorter stay or call us."
            : (offer?.blockMessage ?? `Those days can't be added online. ${CALL_US}`),
      };
    }

    const [count] = await database
      .select({ n: sql<number>`count(*)::int` })
      .from(rentalExtensionRequests)
      .where(eq(rentalExtensionRequests.bookingId, b.id));
    if ((count?.n ?? 0) >= MAX_REQUESTS_PER_BOOKING) {
      return { ok: false, error: `You have asked a few times already. ${CALL_US}` };
    }

    const [saved] = await database
      .insert(rentalExtensionRequests)
      .values({
        bookingId: b.id,
        marketCode: b.marketCode,
        fromEnd: offer.end,
        newEnd: new Date(`${pick.newEnd}T00:00:00Z`),
        addedDays: pick.addedDays,
        addedMinor: pick.addedMinor,
        addedCoverMinor: pick.addedCoverMinor,
        newTotalMinor: pick.newTotalMinor,
        currency: b.currency,
      })
      .returning();

    return {
      ok: true,
      request: summary(saved),
      booking: b,
      vehicle: row.v ? [row.v.year, row.v.make, row.v.model].filter(Boolean).join(" ") : undefined,
    };
  } catch (e) {
    if (violates(e, "rental_extension_requests_one_pending_idx")) {
      return { ok: false, error: "You already asked. We are looking at it." };
    }
    if (isMissingSchema(e)) {
      return { ok: false, error: `Extra days can't be requested online right now. ${CALL_US}` };
    }
    throw e;
  }
}

export interface DecideResult {
  ok: boolean;
  error?: string;
  bookingId?: string;
}

/** The request and its booking's market, for the permission check. */
export async function findExtensionRequest(id: string, database: Database = db) {
  try {
    const [r] = await database
      .select()
      .from(rentalExtensionRequests)
      .where(eq(rentalExtensionRequests.id, id))
      .limit(1);
    return r ?? null;
  } catch (e) {
    if (isMissingSchema(e)) return null;
    throw e;
  }
}

/**
 * Staff approve or decline.
 *
 * Approving is one transaction: lengthen the booking, then mark the request.
 * The UPDATE of the booking is where `rental_bookings_no_overlap` runs. If
 * another booking has those days, Postgres refuses, the whole transaction
 * rolls back, and the request is still pending for staff to decline.
 *
 * The booking is only touched if it is still confirmed or active and still
 * ends when it did when the renter asked. A request priced against dates the
 * booking no longer has is never applied.
 *
 * Works whatever the switch says, so a request filed before the switch was
 * turned off can still be answered.
 */
export async function decideExtension(
  q: { id: string; decision: "approve" | "decline"; staffEmail: string },
  database: Database = db,
): Promise<DecideResult> {
  try {
    return await database.transaction(async (tx) => {
      const [r] = await tx
        .select()
        .from(rentalExtensionRequests)
        .where(eq(rentalExtensionRequests.id, q.id))
        .for("update");
      if (!r) return { ok: false, error: "Request not found." };
      if (r.status !== "pending") {
        return { ok: false, error: `That request was already ${r.status}.` };
      }

      if (q.decision === "approve") {
        const changed = await tx
          .update(rentalBookings)
          .set({
            period: sql`tstzrange(lower(${rentalBookings.period}), ${r.newEnd.toISOString()}::timestamptz, '[)')`,
            totalMinor: sql`${rentalBookings.totalMinor} + ${r.addedMinor}`,
            injuryCoverTotalMinor: sql`${rentalBookings.injuryCoverTotalMinor} + ${r.addedCoverMinor}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(rentalBookings.id, r.bookingId),
              inArray(rentalBookings.status, ["confirmed", "active"]),
              sql`upper(${rentalBookings.period}) = ${r.fromEnd.toISOString()}::timestamptz`,
            ),
          )
          .returning({ id: rentalBookings.id });
        if (changed.length === 0) {
          return {
            ok: false,
            error:
              "This booking has changed since they asked. Decline the request and agree new dates with the renter.",
          };
        }
      }

      await tx
        .update(rentalExtensionRequests)
        .set({
          status: q.decision === "approve" ? "approved" : "declined",
          decidedAt: new Date(),
          decidedByEmail: q.staffEmail,
        })
        .where(eq(rentalExtensionRequests.id, r.id));
      return { ok: true, bookingId: r.bookingId };
    });
  } catch (e) {
    if (violates(e, "rental_bookings_no_overlap")) {
      return {
        ok: false,
        error:
          "Can't approve: another booking already covers some of those days for this vehicle. Decline it, or move the other booking first.",
      };
    }
    if (isMissingSchema(e)) return { ok: false, error: "Extensions are not set up yet." };
    throw e;
  }
}

/** What the answer email needs. Amounts in minor units, dates as "YYYY-MM-DD". */
export interface DecisionNotice {
  requestId: string;
  marketCode: MarketCode;
  to: string;
  name: string;
  vehicle: string;
  approved: boolean;
  /** The booking's return date as it now stands: new if approved, unchanged if not. */
  returnDate: string;
  addedMinor: number;
  /** The booking's total as it now stands. */
  totalMinor: number;
  currency: Booking["currency"];
  /** The renter's private link, when the booking has one. */
  token: string | null;
}

/**
 * Tells the renter the answer, after it has been saved.
 *
 * Runs after decideExtension has committed and can't reach back into it: any
 * failure here, in the lookup or in the mail, is logged and reported as "not
 * sent", and the decision stands. Nothing goes out with the switch off, for a
 * request still waiting, or for a booking with no email address.
 *
 * `send` is a parameter: the action passes the real mailer, the test suite a
 * recorder.
 */
export async function notifyExtensionDecision(
  requestId: string,
  send: (n: DecisionNotice) => Promise<void>,
  opts: { database?: Database; enabled?: boolean } = {},
): Promise<boolean> {
  if (!(opts.enabled ?? extensionsEnabled())) return false;
  try {
    const [row] = await (opts.database ?? db)
      .select({ r: rentalExtensionRequests, b: rentalBookings, v: vehicles })
      .from(rentalExtensionRequests)
      .innerJoin(rentalBookings, eq(rentalBookings.id, rentalExtensionRequests.bookingId))
      .leftJoin(vehicles, eq(vehicles.id, rentalBookings.vehicleId))
      .where(eq(rentalExtensionRequests.id, requestId))
      .limit(1);
    if (!row || row.r.status === "pending") return false;
    const to = row.b.customerEmail?.trim();
    if (!to) return false;
    const range = parseTstzRange(row.b.period as unknown as string);
    if (!range) return false;

    await send({
      requestId,
      marketCode: row.b.marketCode as MarketCode,
      to,
      name: row.b.customerName,
      vehicle: row.v ? [row.v.year, row.v.make, row.v.model].filter(Boolean).join(" ") : "vehicle",
      approved: row.r.status === "approved",
      returnDate: iso(range.end),
      addedMinor: row.r.addedMinor,
      totalMinor: row.b.totalMinor,
      currency: row.b.currency,
      token: validToken(row.b.reservationToken) ? row.b.reservationToken : null,
    });
    return true;
  } catch (e) {
    // Before migration 0035 there is nothing to tell anyone about.
    if (!isMissingSchema(e)) {
      console.error("[extensions] answer email not sent for request", requestId, e);
    }
    return false;
  }
}

/** Open requests for the admin list, by booking. Empty when the feature is off. */
export async function pendingExtensions(
  bookingIds: string[],
  opts: { database?: Database; enabled?: boolean } = {},
): Promise<Map<string, ExtensionRequestSummary>> {
  const out = new Map<string, ExtensionRequestSummary>();
  if (bookingIds.length === 0 || !(opts.enabled ?? extensionsEnabled())) return out;
  try {
    const rows = await (opts.database ?? db)
      .select()
      .from(rentalExtensionRequests)
      .where(
        and(
          eq(rentalExtensionRequests.status, "pending"),
          inArray(rentalExtensionRequests.bookingId, bookingIds),
        ),
      );
    for (const r of rows) out.set(r.bookingId, summary(r));
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
  }
  return out;
}

/* ── The reminder ──────────────────────────────────────────────────────── */

export interface ReminderTarget {
  bookingId: string;
  marketCode: MarketCode;
  to: string;
  name: string;
  vehicle: string;
  /** "2026-11-20" */
  returnDate: string;
  token: string;
}

export interface ReminderOutcome {
  market: MarketCode;
  due: number;
  sent: number;
  skipped?: string;
}

/**
 * Emails renters whose car is due back in two days, once per return date.
 *
 * Only a rental that is out (status active), with an email address, a private
 * link, and no request already waiting. The ledger row is written before the
 * mail is attempted and the mail is skipped if the row already existed: a
 * failed send costs one reminder, where the other order could send the same
 * one every time the scheduler runs.
 *
 * `send` is a parameter. The scheduled route passes the real mailer; the test
 * suite passes a recorder, so nothing is ever mailed from a test.
 */
export async function runExtensionReminders(
  market: MarketCode,
  send: (t: ReminderTarget) => Promise<void>,
  opts: { database?: Database; now?: Date; enabled?: boolean } = {},
): Promise<ReminderOutcome> {
  const database = opts.database ?? db;
  const now = opts.now ?? new Date();
  if (!(opts.enabled ?? extensionsEnabled())) {
    return { market, due: 0, sent: 0, skipped: "RENTAL_EXTENSIONS_ENABLED is off" };
  }

  const returnDate = addDays(todayIn(MARKETS[market].timezone, now), REMINDER_DAYS_BEFORE);
  try {
    const rows = await database
      .select({ b: rentalBookings, v: vehicles })
      .from(rentalBookings)
      .leftJoin(vehicles, eq(vehicles.id, rentalBookings.vehicleId))
      .where(
        and(
          sql`${rentalBookings.marketCode}::text = ${market}`,
          eq(rentalBookings.status, "active"),
          sql`upper(${rentalBookings.period}) = ${`${returnDate}T00:00:00Z`}::timestamptz`,
          sql`not exists (select 1 from rental_extension_requests x
                where x.booking_id = ${rentalBookings.id} and x.status = 'pending')`,
        ),
      );

    let sent = 0;
    let due = 0;
    for (const { b, v } of rows) {
      const to = b.customerEmail?.trim();
      if (!to || !validToken(b.reservationToken)) continue;
      due++;
      const claimed = await database
        .insert(rentalExtensionReminders)
        .values({ bookingId: b.id, returnDate })
        .onConflictDoNothing()
        .returning({ bookingId: rentalExtensionReminders.bookingId });
      if (claimed.length === 0) continue;
      try {
        await send({
          bookingId: b.id,
          marketCode: market,
          to,
          name: b.customerName,
          vehicle: v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "your vehicle",
          returnDate,
          token: b.reservationToken,
        });
        sent++;
      } catch (e) {
        console.error("[extensions] reminder failed for booking", b.id, e);
      }
    }
    return { market, due, sent };
  } catch (e) {
    if (isMissingSchema(e)) return { market, due: 0, sent: 0, skipped: "migration 0035 not applied" };
    throw e;
  }
}
