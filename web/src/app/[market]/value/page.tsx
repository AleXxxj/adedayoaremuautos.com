import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { isMarketCode } from "@/lib/market";
import { listLocations } from "@/lib/repositories/locations";
import { mayEstimate, valueAccess } from "@/lib/vin/marketcheck";
import { isStaffSession } from "@/lib/vin/valueEstimate";
import { readZip } from "@/components/valueSteps";
import { ValueCheck } from "@/components/ValueCheck";
import { ValueUnavailable } from "@/components/ValueUnavailable";
import "@/styles/value.css";

/**
 * The estimate's server action makes up to two calls to MarketCheck, 8 and 5
 * seconds at most, after a database write and a cached NHTSA lookup. Thirty
 * seconds is room for all of it on any hosting plan.
 */
export const maxDuration = 30;

/** Cached like the other public pages; the only thing read is the showroom's ZIP. */
export const revalidate = 300;

/**
 * What's my car worth: a dealer-price estimate for any US car, by VIN, miles
 * and ZIP, from MarketCheck.
 *
 * US only: MarketCheck prices US cars by VIN, and Nigeria goes by chassis
 * number. Never a US price converted to naira.
 *
 * Off until it is switched on, in two steps (src/lib/vin/marketcheck.ts):
 *   - MARKETCHECK_API_KEY alone: the tool works for signed-in staff, so the
 *     founder can try it, and everyone else sees "not available yet".
 *   - with VALUE_CHECK_PUBLIC=1 as well: it works for every visitor.
 * Until that second step the page asks search engines not to list it.
 *
 * A session is read only in the staff-only state, where the page is
 * rendered for each request. Before there is a key, and once it is public,
 * it is served from cache.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (market !== "us") return {};
  return {
    title: "What's My Car Worth? Free Price Estimate",
    description:
      "A free price estimate for your car by VIN, miles and ZIP: what independent dealers near you ask for a car like yours. From Adedayo Aremu Autos in Greensboro, NC.",
    alternates: { canonical: "/us/value" },
    // Not listed while visitors would only find "not available yet".
    ...(valueAccess() === "public" ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ValuePage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code) || code !== "us") notFound();

  const access = valueAccess();
  const staffOnly = access === "staff";
  // Staff-only means a different page for different people: never one built
  // ahead of time and handed to everyone.
  if (staffOnly) await connection();
  const open = mayEstimate(access, staffOnly ? await isStaffSession() : false);

  const sellHref = `/${code}/sell`;
  const checkHref = `/${code}/check`;

  // The ZIP the estimate starts from: the showroom's, which is where most
  // visitors' cars are. One tap changes it.
  const site = open ? (await listLocations(code)).find((s) => readZip(s.postalCode)) : undefined;

  return (
    <div className="val-page">
      <div className="val-wrap">
        <div className="val-intro">
          <p className="val-eyebrow">Price estimate</p>
          <h1 className="val-title">What&rsquo;s my car worth?</h1>
          {/* While it is off, the panel says so: one message, not two. */}
          {open && (
            <>
              <p className="val-lead">Type the VIN. See what dealers ask for a car like yours.</p>
              <ul className="val-points" aria-label="Good to know">
                <li>
                  <i className="fas fa-circle-check" aria-hidden="true" /> Free
                </li>
                <li>
                  <i className="fas fa-user-slash" aria-hidden="true" /> No sign-up
                </li>
                <li>
                  <i className="fas fa-list-ol" aria-hidden="true" /> 3 steps
                </li>
              </ul>
            </>
          )}
        </div>

        {open ? (
          <ValueCheck
            homeZip={site?.postalCode ?? ""}
            homePlace={site ? [site.city, site.region].filter(Boolean).join(", ") : null}
            sellHref={sellHref}
            checkHref={checkHref}
            staffPreview={staffOnly}
          />
        ) : (
          <div className="val-tool">
            <ValueUnavailable sellHref={sellHref} checkHref={checkHref} />
          </div>
        )}
      </div>
    </div>
  );
}
