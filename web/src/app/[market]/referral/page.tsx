import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { ReferralSignup } from "@/components/ReferralSignup";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  return {
    title: "Referral Programme — Adedayo Aremu Autos",
    description:
      "Refer a buyer and earn 1.5% commission on every completed sale. Get your own link and track what you have sent.",
    alternates: {
      canonical: `/${market}/referral`,
      languages: { "en-US": "/us/referral", "en-NG": "/ng/referral" },
    },
  };
}

const STEPS = [
  {
    icon: "fas fa-link",
    title: "Get your link",
    body: "Sign up and you are given a code and a link immediately. Nothing to wait for.",
  },
  {
    icon: "fas fa-share-nodes",
    title: "Share it",
    body: "Send the link, or just tell someone your code — we can enter it by hand when they call.",
  },
  {
    icon: "fas fa-car",
    title: "They buy",
    body: "Anyone who opens your link is recorded against your name for 90 days, whichever page they enquire from.",
  },
  {
    icon: "fas fa-hand-holding-usd",
    title: "You get paid",
    body: "1.5% of the sale price, once the sale completes and we have confirmed it.",
  },
];

/**
 * The referral programme, made real.
 *
 * The homepage has advertised 1.5% commission and "track your referrals
 * easily" since the original site, and both CTAs pointed at a general contact
 * form — which did not even offer "referral" as an option, so every would-be
 * partner was filed as a car buyer. There was no code, no link and no
 * attribution: a commission could only ever be settled from memory.
 */
export default async function ReferralPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const example =
    code === "us"
      ? { car: "$30,000", earn: "$450" }
      : { car: "₦10,000,000", earn: "₦150,000" };

  return (
    <>
      <div className="page-header page-header--referral">
        <div className="page-header-content">
          <h1>
            Referral <span>Programme</span>
          </h1>
          <p>
            Know someone looking for a vehicle? Send them our way and earn on
            every completed sale.
          </p>
        </div>
      </div>

      <div className="referral-page">
        <div className="referral-page-container">
          <div className="referral-page-grid">
            <div className="referral-explain">
              <div className="referral-headline">
                1.5% <small>of every sale you refer</small>
              </div>
              <p className="referral-example">
                Refer a {example.car} car and you earn{" "}
                <strong>{example.earn}</strong>.
              </p>

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
                <h3>The rules, plainly</h3>
                <ul>
                  <li>
                    Attribution lasts <strong>90 days</strong> from the first
                    time someone opens your link.
                  </li>
                  <li>
                    First link wins. If two partners refer the same buyer, it is
                    credited to whoever introduced them first.
                  </li>
                  <li>
                    Commission is paid on <strong>completed</strong> sales only —
                    not on enquiries, and not on cancelled deals.
                  </li>
                  <li>
                    You cannot refer yourself, and staff are not eligible.
                  </li>
                  <li>
                    We arrange payment with you directly. This website never
                    collects bank details.
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
