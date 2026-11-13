import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { canResize } from "@/lib/photo";
import { listInventory } from "@/lib/repositories/vehicles";
import { mediaUrl } from "@/lib/media";
import { listFleet } from "@/lib/repositories/rentals";
import {
  DEFAULT_RENTAL_COMMISSION_BPS,
  PAID_REFERRAL_DISCLOSURE,
  formatBps,
  referralLink,
  weeklyExamples,
} from "@/lib/referral";
import { siteUrl } from "@/lib/siteUrl";
import { ReferralSignup } from "@/components/ReferralSignup";
import "@/styles/referral.css";

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
 * The steps as they actually are, three to a phone screen.
 *
 * Applying opens a review — there is no instant code — because a partner is
 * owed money under an agreement, and the agreement comes before the code.
 */
const STEPS = [
  {
    icon: "fa-file-pen",
    title: "Apply in 2 minutes",
    body: "Tell us who you are. We reply within 1 business day.",
  },
  {
    icon: "fa-handshake",
    title: "Accept the agreement",
    body: "Short and in plain English. Your code goes live when you accept.",
  },
  {
    icon: "fa-share-nodes",
    title: "Share cars, get paid",
    body: `Send cars by WhatsApp or text. Earn ${RATE} of each week your renter pays for.`,
  },
];

/*
 * The rules, word for word as they were written, each under its own title.
 *
 * Folded to their titles so a phone shows all six at once; each opens to its
 * full wording, and nothing is left off the page. The first two start open:
 * they are what a new partner asks first. "Your renter stays yours" is not
 * titled "for 90 days": the 90 days are the link's, and a renter who has
 * rented stays the partner's for as long as they keep renting.
 */
const RULES: { title: React.ReactNode; body: React.ReactNode; open?: boolean }[] = [
  {
    title: "Free to join",
    body: <>You never pay us anything.</>,
    open: true,
  },
  {
    title: "Paid on completed rentals",
    body: (
      <>
        Once the renter has paid and the car is back. Not on inquiries, and not
        on anything canceled or refunded. Refundable deposits and taxes
        don&rsquo;t count.
      </>
    ),
    open: true,
  },
  {
    title: "Your renter stays yours",
    body: (
      <>
        Your link records someone for 90 days. Once they rent, every later
        rental they book with the same phone number counts for you. If two
        partners refer the same person, the first introduction wins. Someone
        who has rented from us before isn&rsquo;t a new referral.
      </>
    ),
  },
  {
    title: <>Say you&rsquo;re paid</>,
    body: (
      <>
        Every message your partner page writes includes &ldquo;
        {PAID_REFERRAL_DISCLOSURE}&rdquo; Keep that line.
      </>
    ),
  },
  {
    title: "No recruiting",
    body: (
      <>
        You earn only from renters you send, never from signing up other
        partners. You can&rsquo;t refer yourself or your household, and staff
        aren&rsquo;t eligible.
      </>
    ),
  },
  {
    title: "No bank details here",
    body: (
      <>
        We arrange payment with you directly. This website never asks for
        them.
      </>
    ),
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
 *
 * Built for a phone (styles/referral.css): the hero's two buttons go to the
 * form and to the partner log in, the examples are a row to swipe, and the
 * form asks for its four required fields first.
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
  const examples = weeklyExamples(fleet, 3);
  // The examples carry the car's id; its photo comes from the same list.
  const photo = new Map(fleet.map((v) => [v.id, v.image]));

  // The hero's picture of the idea, from the first example: the same car,
  // rate and amount as the first card under it.
  const lead = examples[0];
  const leadPhoto = lead ? (photo.get(lead.id) ?? null) : null;
  // Behind the words: a real car from the lot, so the top of the page isn't a blank dark panel. It is dimmed in
  // the stylesheet until the headline passes contrast on a bright photo.
  // The newest car for sale's main photo: those are outdoor shots of the whole
  // car, where a rental car's first photo is sometimes its interior.
  const { vehicles: newest } = await listInventory(code, { limit: 4, sort: "newest" });
  const outdoor = newest.find((v) => v.primaryImage)?.primaryImage;
  const backdrop = outdoor ? mediaUrl(outdoor) : (leadPhoto ?? "/img/hero-wide.png");
  // A partner's link as it is written, with a stand-in for the code.
  const sampleLink = referralLink(siteUrl(), "YOURCODE").replace(/^https?:\/\/(www\.)?/, "");

  return (
    <div className="rf">
      <section className="rf-hero" aria-labelledby="rf-title">
        <div className="rf-hero-bg" aria-hidden="true">
          <Image
            src={backdrop}
            alt=""
            fill
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            unoptimized={!canResize(backdrop)}
          />
        </div>
        <div className="rf-wrap rf-hero-grid">
          <div className="rf-hero-copy">
            <p className="rf-eyebrow">Referral program</p>
            <h1 id="rf-title" className="rf-title">
              Send a renter. <span>Earn {RATE}.</span>
            </h1>
            <p className="rf-lead">
              You get {RATE} of what they pay, every week they keep renting.
            </p>
            <div className="rf-actions">
              <a href="#apply" className="rf-btn rf-btn--primary">
                Apply now
              </a>
              <Link href="/partner/login" className="rf-btn rf-btn--ghost">
                Partner log in
              </Link>
            </div>
          </div>

          {/* The idea in one look: a message to a friend, the car they rent,
              what that week earns. Built from real things: a partner's link
              as it is written, the disclosure every shared message carries,
              and the first example's car, rate and amount, all computed.
              Hidden from screen readers: the words beside it and the cards
              below say all of it. */}
          {lead && (
            <div className="rf-flow" aria-hidden="true">
              <div className="rf-flow-msg">
                <p className="rf-flow-text">Need a car? Try these guys</p>
                <p className="rf-flow-url">{sampleLink}</p>
                <p className="rf-flow-fee">{PAID_REFERRAL_DISCLOSURE}</p>
              </div>
              <span className="rf-flow-step rf-flow-step--rent">
                <i className="fas fa-arrow-down" />
              </span>
              <div className="rf-flow-car">
                <span className="rf-flow-photo">
                  {leadPhoto ? (
                    <Image
                      src={leadPhoto}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 380px, 80vw"
                      loading="eager"
                      unoptimized={!canResize(leadPhoto)}
                    />
                  ) : (
                    <span className="rf-car-nophoto">
                      <i className="fas fa-car" />
                    </span>
                  )}
                </span>
                <span className="rf-flow-carline">
                  <span className="rf-flow-name">{lead.car}</span>
                  <span className="rf-flow-rate">{fmt(lead.weekMinor)} a week</span>
                </span>
              </div>
              <p className="rf-flow-earn">
                <i className="fas fa-coins" />
                You earn {fmt(lead.earnMinor)}
              </p>
            </div>
          )}
        </div>
      </section>

      {examples.length > 0 && (
        <section className="rf-section" aria-labelledby="rf-examples">
          <div className="rf-wrap">
            <p className="rf-eyebrow">Real cars, real rates</p>
            <h2 id="rf-examples" className="rf-h2">
              What one week earns you
            </h2>
            <p className="rf-sub">
              On cars for rent today: the math on one week, not a promise of
              what you will earn.
            </p>
            <div
              className="rf-cars-scroll"
              role="region"
              aria-label="Examples on cars for rent today"
              tabIndex={0}
            >
              <ul className="rf-cars">
                {examples.map((e) => {
                  const image = photo.get(e.id) ?? null;
                  return (
                    <li key={e.id} className="rf-car">
                      <span className="rf-car-photo">
                        {image ? (
                          // About 250 pixels wide on a phone, a third of the
                          // row on a wide screen.
                          <Image
                            src={image}
                            alt=""
                            fill
                            sizes="(min-width: 768px) 384px, 250px"
                            unoptimized={!canResize(image)}
                          />
                        ) : (
                          <span className="rf-car-nophoto">
                            <i className="fas fa-car" aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="rf-car-body">
                        <h3 className="rf-car-name">{e.car}</h3>
                        <span className="rf-car-rate">
                          Rents for {fmt(e.weekMinor)} a week
                        </span>
                        <span className="rf-car-earn">You earn {fmt(e.earnMinor)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="rf-section" aria-labelledby="rf-how">
        <div className="rf-wrap">
          <h2 id="rf-how" className="rf-h2">
            How it works
          </h2>
          <ol className="rf-steps">
            {STEPS.map((s) => (
              <li key={s.title} className="rf-step">
                <span className="rf-step-icon">
                  <i className={`fas ${s.icon}`} aria-hidden="true" />
                </span>
                <h3 className="rf-step-title">{s.title}</h3>
                <p className="rf-step-text">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="rf-section rf-end">
        <div className="rf-wrap rf-split">
          {/* The rules stated before signing up, not after a dispute. */}
          <section aria-labelledby="rf-rules">
            <h2 id="rf-rules" className="rf-h2">
              The rules
            </h2>
            <div className="rf-rules">
              {RULES.map((r, i) => (
                <details key={i} className="rf-rule" open={r.open}>
                  <summary>
                    <span>{r.title}</span>
                    <i className="fas fa-chevron-down" aria-hidden="true" />
                  </summary>
                  <p>{r.body}</p>
                </details>
              ))}
            </div>
          </section>

          <section id="apply" className="rf-apply" aria-labelledby="rf-apply-title">
            <ReferralSignup market={market} />
          </section>
        </div>
      </div>
    </div>
  );
}
