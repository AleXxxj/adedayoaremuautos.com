import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  partnerEarnings,
  partnerPayouts,
  leads,
  rentalBookings,
  deals,
  vehicles,
} from "@/db/schema";
import { requirePartner } from "@/lib/auth";
import { partnerTotals } from "@/lib/partnerEarnings";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import {
  formatBps,
  referralLink,
  rentalReferralLink,
  rentalShareMessage,
  commissionOn,
  governingLaw,
  saleCommissionsOn,
} from "@/lib/referral";
import { siteUrl } from "@/lib/feeds/inventory";
import { listFleet } from "@/lib/repositories/rentals";
import { listLocations } from "@/lib/repositories/locations";
import { numberedPartnerClauses, PARTNER_TERMS_VERSION } from "@/content/partnerTerms";
import { PartnerShell, Panel } from "@/components/partner/PartnerShell";
import { PartnerHeader } from "@/components/partner/PartnerHeader";
import { ShareLink } from "@/components/partner/ShareLink";
import { ShareCar } from "@/components/partner/ShareCar";
import { TermsUpdate } from "@/components/partner/TermsUpdate";
import { PayoutRequest } from "@/components/partner/PayoutRequest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner dashboard",
  robots: { index: false, follow: false },
};

/**
 * What a partner came here to see.
 *
 * The homepage has advertised "track your referrals easily" since the original
 * build with nothing at all behind it, so the bar is not high — but the thing
 * a partner actually wants is a short list: what have I sent, what has
 * happened to it, and what am I owed. Those are the first three panels.
 *
 * Every figure comes from the earnings rows rather than being recomputed from
 * current rates, so what this page says a partner earned last month is what
 * they were actually told at the time.
 *
 * Live stock is here because it is the thing a partner needs in order to do
 * the job: somebody being asked "what have you got?" on the phone should not
 * have to browse the public site and guess what has sold.
 */
export default async function PartnerDashboard() {
  const partner = await requirePartner();
  const market = MARKETS[partner.marketCode];
  const fmt = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale);

  const [totals, earnings, payouts, introduced, bookings, sales, fleet, sites] =
    await Promise.all([
      partnerTotals(partner.id),

      db
        .select()
        .from(partnerEarnings)
        .where(eq(partnerEarnings.partnerId, partner.id))
        .orderBy(desc(partnerEarnings.createdAt))
        .limit(50),

      db
        .select()
        .from(partnerPayouts)
        .where(eq(partnerPayouts.partnerId, partner.id))
        .orderBy(desc(partnerPayouts.requestedAt))
        .limit(20),

      /*
       * Enquiries introduced.
       *
       * Deliberately counts and statuses only — no customer names, no phone
       * numbers, no email addresses. The partner introduced these people to
       * the dealership; that does not make the dealership's customer list
       * theirs to read, and the agreement they signed says as much.
       */
      db
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${leads.status} in ('new','contacted','qualified'))::int`,
          won: sql<number>`count(*) filter (where ${leads.status} = 'won')::int`,
        })
        .from(leads)
        .where(eq(leads.referralPartnerId, partner.id)),

      db
        .select({
          id: rentalBookings.id,
          status: rentalBookings.status,
          totalMinor: rentalBookings.totalMinor,
          currency: rentalBookings.currency,
          createdAt: rentalBookings.createdAt,
          make: vehicles.make,
          model: vehicles.model,
          year: vehicles.year,
        })
        .from(rentalBookings)
        .leftJoin(vehicles, eq(rentalBookings.vehicleId, vehicles.id))
        .where(eq(rentalBookings.referralPartnerId, partner.id))
        .orderBy(desc(rentalBookings.createdAt))
        .limit(25),

      db
        .select({
          id: deals.id,
          status: deals.status,
          priceMinor: deals.vehiclePriceMinor,
          createdAt: deals.createdAt,
        })
        .from(deals)
        .leftJoin(leads, eq(deals.leadId, leads.id))
        .where(eq(leads.referralPartnerId, partner.id))
        .orderBy(desc(deals.createdAt))
        .limit(25),

      // The cars a partner can actually send someone to rent, with rates.
      listFleet(partner.marketCode),
      listLocations(partner.marketCode),
    ]);

  const counts = introduced[0] ?? { total: 0, open: 0, won: 0 };
  const base = siteUrl();
  const link = referralLink(base, partner.code);
  const site = sites[0];
  const place = site ? [site.city, site.region].filter(Boolean).join(", ") : market.name;

  /*
   * Each car with its share message and what one rental earns.
   *
   * By the week where the car has a weekly rate — that is how the renters
   * worth referring rent, and how the partner keeps earning — and by the day
   * otherwise. The math, never a promise of income: what one week (or day)
   * of this car pays them, at their own rate.
   */
  const toShare = fleet.map((v) => {
    const car = [v.year, v.make, v.model].filter(Boolean).join(" ");
    const weekly = v.tariff.weeklyMinor;
    const unitMinor = weekly ?? v.tariff.dailyMinor;
    const unit = weekly != null ? "week" : "day";
    const price = `${fmt(unitMinor)} a ${unit}`;
    return {
      id: v.id,
      car,
      image: v.image,
      price,
      earn: `You earn ${fmt(commissionOn(unitMinor, partner.rentalCommissionBps))} for each ${unit} they rent it`,
      message: rentalShareMessage(car, price, place, rentalReferralLink(base, partner.code, v.slug)),
    };
  });

  return (
    <PartnerShell wide>
      <PartnerHeader
        name={partner.fullName}
        code={partner.code}
        hireRate={formatBps(partner.rentalCommissionBps)}
        saleRate={
          saleCommissionsOn(partner.marketCode) ? formatBps(partner.commissionBps) : null
        }
        market={market.name}
      />

      <div className="mt-6 space-y-5">
        {partner.agreementVersion !== PARTNER_TERMS_VERSION && (
          <TermsUpdate clauses={numberedPartnerClauses(governingLaw(partner.marketCode))} />
        )}

        {/* ── Cars to share ─────────────────────────────────────────────
            First, because it is what a partner opens this page to do. Each
            card's message carries the car, its price, a link to that car
            with their code attached, and the line saying they are paid. */}
        <Panel title="Cars to share">
          {toShare.length === 0 ? (
            <p className="text-sm text-[#9b9b9b]">
              No cars are listed for rent right now. Your link still works:
              anyone who rents through it later is recorded as yours.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {toShare.map((c) => (
                <ShareCar
                  key={c.id}
                  car={c.car}
                  image={c.image}
                  price={c.price}
                  earn={c.earn}
                  message={c.message}
                />
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-[#9b9b9b]">
            Once someone you referred rents, every later rental they book with the same
            phone number is yours too: each week they keep a car earns you{" "}
            {formatBps(partner.rentalCommissionBps)} of what they pay. Keep the line that
            says you get a referral fee.
          </p>
        </Panel>

        {/* ── What you are owed ─────────────────────────────────────── */}
        <Panel title="Your earnings">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure
              label="Available"
              value={fmt(totals.availableMinor)}
              strong
              hint="Earned and ready to request"
            />
            <Figure
              label="Still to come"
              value={fmt(totals.pendingMinor)}
              hint="Rentals not finished yet"
            />
            <Figure
              label="Requested"
              value={fmt(totals.requestedMinor)}
              hint="Waiting on us"
            />
            <Figure
              label="Paid to you"
              value={fmt(totals.paidMinor)}
              hint="All time"
            />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[#6f6f6f]">
            &ldquo;Available&rdquo; is already net of anything you have asked
            for and not yet been paid, so you cannot request the same earnings
            twice. We never hold money on your behalf — this is a record of what
            we owe you.
          </p>

          <PayoutRequest
            availableMinor={totals.availableMinor}
            available={fmt(totals.availableMinor)}
            currencySymbol={market.currency === "USD" ? "$" : "₦"}
            outstanding={
              totals.requestedMinor > 0 ? fmt(totals.requestedMinor) : undefined
            }
          />
        </Panel>

        {/* ── Your link ─────────────────────────────────────────────── */}
        <Panel title="Your link and code">
          <ShareLink link={link} code={partner.code} />
          <p className="mt-3 text-xs leading-relaxed text-[#6f6f6f]">
            Anyone who opens your link is recorded against your name for 90
            days, whichever page they contact us from. If they call
            instead, give them your code and we will enter it by hand.
          </p>
        </Panel>

        {/* ── What you have sent ────────────────────────────────────── */}
        <Panel title="What you have sent us">
          <div className="grid grid-cols-3 gap-4">
            <Figure label="Inquiries" value={String(counts.total)} />
            <Figure label="Still open" value={String(counts.open)} />
            <Figure label="Completed" value={String(counts.won)} />
          </div>

          {bookings.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7d7d7d]">
                Rentals
              </h3>
              <ul className="mt-2 divide-y divide-[#1f1f1f]">
                {bookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    <span className="text-[#d4d4d4]">
                      {b.year} {b.make} {b.model}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums text-[#9b9b9b]">
                        {formatMoney(
                          money(b.totalMinor, b.currency),
                          market.locale,
                        )}
                      </span>
                      <Status value={b.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sales.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7d7d7d]">
                Sales
              </h3>
              <ul className="mt-2 divide-y divide-[#1f1f1f]">
                {sales.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    <span className="tabular-nums text-[#d4d4d4]">
                      {fmt(Number(d.priceMinor ?? 0))}
                    </span>
                    <Status value={d.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {counts.total === 0 && bookings.length === 0 && sales.length === 0 && (
            <p className="mt-5 text-sm leading-relaxed text-[#9b9b9b]">
              Nothing yet. Share your link above and anyone who contacts us through
              it appears here, with its status, as it moves along.
            </p>
          )}
        </Panel>

        {/* ── Every commission, itemised ────────────────────────────── */}
        {earnings.length > 0 && (
          <Panel title="Every commission">
            <ul className="divide-y divide-[#1f1f1f]">
              {earnings.map((e) => (
                <li key={e.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-[#d4d4d4]">
                      {e.source === "rental" ? "Car rental" : "Vehicle sale"}
                      <span className="ml-2 text-xs text-[#6f6f6f]">
                        {formatBps(e.commissionBps)} of{" "}
                        {formatMoney(
                          money(e.basisMinor, e.currency),
                          market.locale,
                        )}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={`tabular-nums text-sm font-semibold ${
                          e.state === "cancelled"
                            ? "text-[#6f6f6f] line-through"
                            : "text-white"
                        }`}
                      >
                        {formatMoney(
                          money(e.amountMinor, e.currency),
                          market.locale,
                        )}
                      </span>
                      <Status value={e.state} />
                    </span>
                  </div>
                  {/* The reason, where there is one. A commission that silently
                      shrinks is how a partner concludes they are being
                      short-changed. */}
                  {e.note && (
                    <p className="mt-1 text-xs text-[#8a8a8a]">{e.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {payouts.length > 0 && (
          <Panel title="Your payouts">
            <ul className="divide-y divide-[#1f1f1f]">
              {payouts.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span>
                    <span className="tabular-nums font-semibold text-white">
                      {formatMoney(money(p.amountMinor, p.currency), market.locale)}
                    </span>
                    <span className="ml-2 text-xs text-[#6f6f6f]">
                      {p.requestedAt.toLocaleDateString(market.locale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {p.reference && (
                      <span className="ml-2 text-xs text-[#6f6f6f]">
                        ref {p.reference}
                      </span>
                    )}
                    {p.rejectReason && (
                      <span className="mt-1 block text-xs text-[#f0a0a0]">
                        {p.rejectReason}
                      </span>
                    )}
                  </span>
                  <Status value={p.state} />
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* The sale-stock list that was here is gone: the program is built
            around rentals now ("Cars to share", above), and sale referrals
            wait on a North Carolina lawyer's view of G.S. 20-306. */}
      </div>
    </PartnerShell>
  );
}

function Figure({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7d7d7d]">
        {label}
      </div>
      <div
        className={`mt-1 tabular-nums font-bold ${
          strong ? "text-2xl text-white" : "text-lg text-[#d4d4d4]"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-[#6f6f6f]">{hint}</div>}
    </div>
  );
}

/**
 * A status, in the partner's words rather than the database's.
 *
 * `returned`, `delivered` and `won` are perfectly clear inside the business
 * and mean nothing to somebody looking at their own earnings — and "pending"
 * on a commission reads as a problem when it only means the hire is still
 * running.
 */
const WORDS: Record<string, { text: string; tone: string }> = {
  quote: { text: "Awaiting payment", tone: "#9b9b9b" },
  confirmed: { text: "Confirmed", tone: "#4e9d76" },
  active: { text: "Rental in progress", tone: "#4e9d76" },
  returned: { text: "Completed", tone: "#4e9d76" },
  cancelled: { text: "Cancelled", tone: "#8a8a8a" },
  pending: { text: "Not yet earned", tone: "#c8a94e" },
  paid: { text: "Paid to you", tone: "#4e9d76" },
  requested: { text: "Requested", tone: "#c8a94e" },
  approved: { text: "Approved", tone: "#c8a94e" },
  rejected: { text: "Declined", tone: "#d08080" },
  draft: { text: "In progress", tone: "#9b9b9b" },
  negotiating: { text: "In progress", tone: "#9b9b9b" },
  agreed: { text: "Agreed", tone: "#9b9b9b" },
  financing: { text: "Awaiting finance", tone: "#9b9b9b" },
  contracted: { text: "Signed", tone: "#9b9b9b" },
  delivered: { text: "Completed", tone: "#4e9d76" },
  lost: { text: "Did not complete", tone: "#8a8a8a" },
};

function Status({ value }: { value: string }) {
  const w = WORDS[value] ?? { text: value, tone: "#9b9b9b" };
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
      style={{ color: w.tone, borderColor: `${w.tone}55` }}
    >
      {w.text}
    </span>
  );
}
