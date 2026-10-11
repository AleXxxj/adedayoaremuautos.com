import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  return {
    title: "Referral Programme",
    description:
      "Refer customers to Adedayo Aremu Autos and earn 5% commission on every completed car hire and 1.5% on every vehicle sale. Apply in a couple of minutes and track your referrals from your own partner account.",
    alternates: {
      canonical: `/${market}/referral`,
      languages: { "en-US": "/us/referral", "en-NG": "/ng/referral" },
    },
  };
}

/*
 * The steps as they now actually are.
 *
 * This list used to open with "Sign up and you are given a code and a link
 * immediately. Nothing to wait for." That was true of the old programme, where
 * a code only tagged an enquiry and anyone could mint one. It stopped being
 * true the moment partners started being owed commission under an agreement,
 * and a page promising an instant link in front of a form that opens a
 * one-working-day review is how an applicant decides the site is broken.
 */
const STEPS = [
  {
    icon: "fas fa-file-pen",
    title: "Apply",
    body: "Tell us who you are and how you plan to refer people. It takes a couple of minutes.",
  },
  {
    icon: "fas fa-phone",
    title: "We come back to you",
    body: "Within one working day, by email or phone. We read every application properly.",
  },
  {
    icon: "fas fa-handshake",
    title: "Agree the terms",
    body: "We email you a short agreement in plain English. Your code goes live the moment you accept it.",
  },
  {
    icon: "fas fa-share-nodes",
    title: "Share your link",
    body: "Send the link, or just tell someone your code — we can enter it by hand when they call.",
  },
  {
    icon: "fas fa-hand-holding-usd",
    title: "You get paid",
    body: "5% on every car hire you introduce and 1.5% on every vehicle sale, once it completes and the money has cleared.",
  },
];

/**
 * The referral programme, made real.
 *
 * The homepage has advertised commission and "track your referrals
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
      ? { hire: "$900", hireEarn: "$45", car: "$30,000", carEarn: "$450" }
      : {
          hire: "₦300,000",
          hireEarn: "₦15,000",
          car: "₦10,000,000",
          carEarn: "₦150,000",
        };

  return (
    <>
      <div className="page-header page-header--referral">
        <div className="page-header-content">
          <h1>
            Referral <span>Programme</span>
          </h1>
          <p>
            Know someone looking for a vehicle? Send them our way and earn on
            every completed sale and hire.
          </p>
        </div>
      </div>

      <div className="referral-page">
        <div className="referral-page-container">
          <div className="referral-page-grid">
            <div className="referral-explain">
              <div className="referral-headline">
                5% <small>of every car hire you refer</small>
              </div>
              <p className="referral-example">
                A {example.hire} week&rsquo;s hire earns you{" "}
                <strong>{example.hireEarn}</strong>. And{" "}
                <strong>1.5%</strong> on vehicle sales — a {example.car} car
                earns you <strong>{example.carEarn}</strong>.
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
                    Commission is paid on <strong>completed</strong> hires and
                    sales only — not on enquiries, and not on anything cancelled
                    or refunded.
                  </li>
                  <li>
                    Car hire pays <strong>5%</strong> and vehicle sales pay{" "}
                    <strong>1.5%</strong>, both calculated on what the customer
                    actually pays us — not including deposits you get back or
                    taxes.
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
