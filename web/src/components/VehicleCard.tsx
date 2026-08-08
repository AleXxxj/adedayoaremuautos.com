import Link from "next/link";
import { money } from "@/lib/money";
import { formatDistance, type MarketConfig } from "@/lib/market";
import { PaymentDisplay } from "./PaymentDisplay";
import { mediaUrl } from "@/lib/media";
import type { Vehicle } from "@/db/schema";

interface Props {
  vehicle: Vehicle & { primaryImage?: string | null };
  market: MarketConfig;
}

export function VehicleCard({ vehicle, market }: Props) {
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

  return (
    <article className="group overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] transition-colors hover:bg-[var(--surface-2)]">
      <Link href={`/${market.code}/inventory/${vehicle.slug}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-2)]">
          {vehicle.primaryImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl(vehicle.primaryImage)}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              Photography coming soon
            </div>
          )}

          <span className="absolute left-3 top-3 rounded bg-[var(--accent-500)] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--surface-0)]">
            {vehicle.condition}
          </span>

          {vehicle.status === "pending" && (
            <span className="absolute right-3 top-3 rounded bg-[var(--surface-0)]/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--warning)]">
              Sale pending
            </span>
          )}
        </div>
      </Link>

      <div className="space-y-3 p-5">
        <h3 className="font-semibold leading-snug">
          <Link
            href={`/${market.code}/inventory/${vehicle.slug}`}
            className="hover:text-[var(--link)]"
          >
            {title}
          </Link>
        </h3>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
          {vehicle.mileage != null && (
            <span>{formatDistance(vehicle.mileage, market)}</span>
          )}
          {vehicle.transmission && <span>{vehicle.transmission}</span>}
          {vehicle.fuelType && <span>{vehicle.fuelType}</span>}
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-3">
          {vehicle.priceMinor != null ? (
            <PaymentDisplay
              price={money(vehicle.priceMinor, market.currency)}
              market={market}
            />
          ) : (
            <span className="text-lg font-semibold text-[var(--text-secondary)]">
              Price on request
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
