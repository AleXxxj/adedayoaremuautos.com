import { formatMoney, monthlyPayment, type Money } from "@/lib/money";
import { paymentDisclosure, type PaymentTerms } from "@/lib/compliance/disclosures";
import type { MarketConfig } from "@/lib/market";

interface Props {
  price: Money;
  market: MarketConfig;
  /**
   * Financing terms. OPTIONAL BY DESIGN.
   *
   * When absent, no monthly figure is shown at all. There is no default APR,
   * because inventing a plausible-looking rate to make the UI look complete is
   * how you end up advertising credit terms the business never agreed to.
   * Supply real terms or show the price alone.
   */
  terms?: Omit<PaymentTerms, "price">;
  size?: "card" | "detail";
}

/**
 * Price, and — only where terms genuinely exist — an estimated monthly payment
 * with its legally required disclosure.
 *
 * The disclosure is not a sibling element a developer might forget to add. It
 * is emitted by the same component that emits the figure, so in markets that
 * require it, a payment cannot reach the page unaccompanied.
 */
export function PaymentDisplay({ price, market, terms, size = "card" }: Props) {
  const isDetail = size === "detail";

  if (!terms) {
    return (
      <span
        className={isDetail ? "text-4xl font-bold" : "text-2xl font-bold"}
      >
        {formatMoney(price, market.locale)}
      </span>
    );
  }

  const perMonth = monthlyPayment(price, terms.aprPercent, terms.termMonths);
  const disclosure = paymentDisclosure(market, { ...terms, price });

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <span className={isDetail ? "text-4xl font-bold" : "text-2xl font-bold"}>
          {formatMoney(price, market.locale)}
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          {formatMoney(perMonth, market.locale)}/mo
          <span className="text-[var(--text-muted)]"> est.</span>
        </span>
      </div>

      {disclosure && (
        <p className="text-[11px] leading-snug text-[var(--text-muted)]">
          {disclosure.text}
        </p>
      )}
    </div>
  );
}
