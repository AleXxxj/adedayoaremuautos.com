import Link from "next/link";
import { Icon } from "@/components/Icon";
import { mediaUrl } from "@/lib/media";
import { formatMoney, money, monthlyPayment } from "@/lib/money";
import { formatDistance, type MarketConfig } from "@/lib/market";

export interface ShowcaseVehicle {
  id: string;
  slug: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  condition: string;
  mileage: number | null;
  transmission: string | null;
  fuelType: string | null;
  priceMinor: number | null;
  primaryImage?: string | null;
}

/**
 * The listing card.
 *
 * Details sit on a scrim over the photograph rather than in a panel beneath it,
 * so the card is mostly car — which is what a buyer is actually shopping for.
 * The indicative monthly figure appears on hover only: it is a secondary
 * consideration until someone is interested, and putting it on the resting
 * state makes every card shout at once.
 */
export function VehicleShowcase({
  v,
  market,
  index,
  size = "regular",
}: {
  v: ShowcaseVehicle;
  market: MarketConfig;
  index: number;
  size?: "regular" | "feature";
}) {
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const feature = size === "feature";
  const href = `/${market.code}/inventory/${v.slug}`;

  const price = v.priceMinor != null ? money(v.priceMinor, market.currency) : null;
  // Indicative only, on the market's shortest term. Never presented as an offer.
  const perMonth =
    price && !market.financing.quotesApr
      ? monthlyPayment(price, 0, market.financing.termMonths.at(-1)!)
      : null;

  return (
    <article
      className={`reveal-scale group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] transition-[transform,border-color,box-shadow] duration-500 hover:-translate-y-1.5 hover:border-[var(--brand-500)]/40 hover:shadow-[var(--shadow-lg)] ${
        feature ? "lg:col-span-7 lg:row-span-2" : "lg:col-span-5"
      }`}
    >
      <Link href={href} className="block">
        <div
          className={`vignette relative overflow-hidden bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface-1)] ${
            feature ? "aspect-[16/12]" : "aspect-[16/9]"
          }`}
        >
          {v.primaryImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl(v.primaryImage)}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.06]"
              loading={feature ? "eager" : "lazy"}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              Photography coming soon
            </div>
          )}

          {/* Index — a small editorial signal that this is a curated set. */}
          <span className="display-sans pointer-events-none absolute left-5 top-4 text-[2.75rem] leading-none text-white/20 tnum">
            {String(index).padStart(2, "0")}
          </span>

          <span className="absolute right-4 top-4 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/90 backdrop-blur-md">
            {v.condition}
          </span>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-5 pt-20">
            <h3 className={`font-semibold leading-tight text-white ${feature ? "text-2xl sm:text-3xl" : "text-lg"}`}>
              {title}
            </h3>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-white/60">
              {v.mileage != null && (
                <span className="inline-flex items-center gap-1.5 tnum">
                  <Icon name="gauge" className="size-4" />
                  {formatDistance(v.mileage, market)}
                </span>
              )}
              {v.transmission && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="spark" className="size-4" />
                  {v.transmission}
                </span>
              )}
              {v.fuelType && <span>{v.fuelType}</span>}
            </div>

            <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/10 pt-3.5">
              <div>
                {price ? (
                  <>
                    <span className={`block font-bold text-white tnum ${feature ? "text-3xl" : "text-xl"}`}>
                      {formatMoney(price, market.locale)}
                    </span>
                    {perMonth && (
                      <span className="mt-0.5 block text-xs text-white/45 tnum opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                        from {formatMoney(perMonth, market.locale)}/mo over{" "}
                        {market.financing.termMonths.at(-1)} months
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-lg font-semibold text-white/80">Price on request</span>
                )}
              </div>

              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 text-white transition-all duration-500 group-hover:border-transparent group-hover:bg-[var(--cta-bg)] group-hover:text-[var(--cta-fg)]">
                <Icon name="arrow" className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
