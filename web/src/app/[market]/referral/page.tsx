import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { listFleet } from "@/lib/repositories/rentals";
import {
  DEFAULT_RENTAL_COMMISSION_BPS,
  PAID_REFERRAL_DISCLOSURE,
  commissionOn,
  formatBps,
} from "@/lib/referral";
import { ReferralSignup } from "@/components/ReferralSignup";

/**
 * Cached and revalidated, not rebuilt per visitor.
 *
 * Every public page was `force-dynamic`, so each view needed a live database
 * round trip and a brief backend problem produced a dead site rather than a
 * slightly stale one. The admin calls `revalidatePath` when the underlying
 * records change, so edits still appear immediately; this window only governs
 * how long a cached copy keeps serving when nothing has changed — and what
 * the page falls back on when the database cannot be reached at all.
 */
export const revalidate = 300;

const RATE = formatBps(DEFAULT_RENTAL_COMMISSION_BPS);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  return {
    title: "Earn by Referring Renters",
    description: `Send renters to Adedayo Aremu Autos and earn ${RATE} of every rental they pay for — every week they keep renting. Free to join, no recruiting.`,
    alternates: {
      canonical: `/${market}/referral`,
      languages: { "en-US": "/us/referral", "en-NG": "/ng/referral" },
    },
  };
}

/*
 * The steps as they actually are.
 *
 * Applying opens a review — there is no instant code — because a partner is
 * owed money under an agreement, and the agreement comes before the code.
 */
const STEPS = [
  {
    icon: "fas fa-file-pen",
    title: "Apply",
    body: "Tell us who you are and who you know that needs a car. It takes a couple of minutes.",
  },
  {
    icon: "fas fa-phone",
    title: "We get back to you",
    body: "Within one business day, by email or phone. We read every application.",
  },
  {
    icon: "fas fa-handshake",
    title: "Accept the agreement",
    body: "A short agreement in plain English. Your code goes live as soon as you accept it.",
  },
  {
    icon: "fas fa-share-nodes",
    title: "Share cars",
    body: "Your partner page lists every car for rent, each with a message ready to send by WhatsApp or text.",
  },
  {
    icon: "fas fa-hand-holding-usd",
    title: "Get paid, week after week",
    body: `${RATE} of what your renter pays for each rental, once it is paid and the car is back — and again for every week they keep renting.`,
  },
];

/**
 * The referral program, built around rentals.
 *
 * Rentals because that is where the business's repeat customers are — weekly
 * drivers — and because paying an unlicensed person for referring vehicle
 * *sales* is restricted in North Carolina (G.S. 20-306); sale referrals wait
 * for a lawyer's answer.
 *
 * The examples are real cars and their published weekly rates, showing the
 * arithmetic of one rental — never a promise of what anyone will earn, which
 * the FTC treats as an earnings claim that has to be backed up.
 */
export default async function ReferralPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const fleet = await listFleet(code);
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);
  const examples = fleet
    .filter((v) => v.tariff.weeklyMinor != null)
    .slice(0, 3)
    .map((v) => ({
      id: v.id,
      car: [v.year, v.make, v.model].filter(Boolean).join(" "),
      week: fmt(v.tariff.weeklyMinor!),
      earn: fmt(commissionOn(v.tariff.weeklyMinor!, DEFAULT_RENTAL_COMMISSION_BPS)),
    }));

  return (
    <>
      <div className="page-header page-header--referral">
        <div className="page-header-content">
          <h1>
            Send a renter. <span>Earn {RATE}.</span>
          </h1>
          <p>
            Know someone who needs a car? Send them our way and earn on every
            week they rent.
          </p>
        </div>
      </div>

      <div className="referral-page">
        <div className="referral-page-container">
          <div className="referral-page-grid">
            <div className="referral-explain">
              <div className="referral-headline">
                {RATE} <small>of every rental your renter pays for — every week they rent</small>
              </div>

              {examples.length > 0 && (
                <>
                  <p className="referral-example">What one week earns you, on cars for rent today:</p>
                  <ul className="referral-cars">
                    {examples.map((e) => (
                      <li key={e.id}>
                        <span className="referral-car">{e.car}</span>
                        <span className="referral-car-math">
                          Rents for {e.week} a week · <strong>you earn {e.earn}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <ol className="referral-steps">
                {STEPS.map((s, i) => (
                  <li key={s.title}>
                    <span className="referral-step-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>
                        <i className={s.icon} /> {s.title}
                      </h3>
                      <p>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="referral-terms">
                <h3>The rules</h3>
                <ul>
                  <li>
                    <strong>Free to join.</strong> You never pay us anything.
                  </li>
                  <li>
                    <strong>Paid on completed rentals</strong> — once the renter has
                    paid and the car is back. Not on inquiries, and not on anything
                    canceled or refunded. Refundable deposits and taxes don&rsquo;t count.
                  </li>
                  <li>
                    <strong>Your renter stays yours.</strong> Your link records someone
                    for 90 days. Once they rent, every later rental they book with the same
                    phone number counts for you. If two partners refer the same person, the
                    first introduction wins. Someone who has rented from us before
                    isn&rsquo;t a new referral.
                  </li>
                  <li>
                    <strong>Say you&rsquo;re paid.</strong> Every message your partner page
                    writes includes &ldquo;{PAID_REFERRAL_DISCLOSURE}&rdquo; Keep that line.
                  </li>
                  <li>
                    <strong>No recruiting.</strong> You earn only from renters you send,
                    never from signing up other partners. You can&rsquo;t refer yourself or
                    your household, and staff aren&rsquo;t eligible.
                  </li>
                  <li>
                    <strong>No bank details here.</strong> We arrange payment with you
                    directly. This website never asks for them.
                  </li>
                </ul>
              </div>
            </div>

            <ReferralSignup market={market} />
          </div>
        </div>
      </div>
    </>
  );
}
