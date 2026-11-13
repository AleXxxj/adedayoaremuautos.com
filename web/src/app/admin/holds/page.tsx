import { requireSection, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { listSaleHolds, sweepSaleHolds } from "@/lib/saleHolds/core";
import {
  HOLD_HOURS,
  formatHoldEnd,
  holdReference,
  saleHoldEnabled,
  timeLeft,
} from "@/lib/saleHolds/settings";
import { stripeKeyMode, stripePaymentUrl } from "@/lib/saleHolds/stripe";
import { SaleHoldRow, type SaleHoldView } from "@/components/admin/SaleHoldRow";

export const dynamic = "force-dynamic";

/**
 * Cars held with a deposit.
 *
 * Open to every member of staff whether the switch is on or off: a hold paid
 * for while it was on still needs looking after once it is off.
 *
 * Reading this page is also what ends a hold whose time is up (and so does
 * the car's own page): there is no scheduler.
 */
export default async function AdminHoldsPage() {
  const user = await requireSection("/admin/holds");
  await sweepSaleHolds();
  const rows = await listSaleHolds(allowedMarkets(user));

  const now = new Date();
  const views: SaleHoldView[] = (rows ?? []).map(({ hold, car }) => {
    const cfg = MARKETS[hold.marketCode as MarketCode];
    return {
      id: hold.id,
      reference: holdReference(hold.id),
      status: hold.status,
      deposit: hold.depositState,
      car: car ? `${car.year} ${car.make} ${car.model}` : "Vehicle removed",
      carAdminHref: car ? `/admin/vehicles/${car.id}` : null,
      buyerName: hold.buyerName,
      buyerPhone: hold.buyerPhone,
      buyerEmail: hold.buyerEmail,
      amount: formatMoney(money(hold.amountMinor, cfg.currency), cfg.locale),
      until: hold.heldUntil ? formatHoldEnd(hold.heldUntil, cfg.locale, cfg.timezone) : null,
      left: hold.status === "active" && hold.heldUntil ? timeLeft(hold.heldUntil, now) : null,
      paidAt: hold.paidAt ? formatHoldEnd(hold.paidAt, cfg.locale, cfg.timezone) : "",
      stripeUrl: hold.paymentRef ? stripePaymentUrl(hold.paymentRef, hold.livemode) : null,
      testPayment: hold.livemode === false,
    };
  });

  const running = views.filter((v) => v.status === "active");
  const owed = views.filter((v) => v.status !== "active" && v.deposit === "held");
  const done = views.filter((v) => v.status !== "active" && v.deposit !== "held");
  const mode = stripeKeyMode();

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Holds</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Cars held for {HOLD_HOURS} hours with a refundable deposit.
          </p>
        </div>

        <p className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          {rows === null
            ? "Holds are not set up yet: the database change for them has not been applied."
            : !saleHoldEnabled()
              ? "Holds are switched off. Buyers do not see the option."
              : mode === "none"
                ? "Holds are switched on, but Stripe has no key, so buyers do not see the option."
                : mode === "test"
                  ? "Holds are on, with Stripe in test mode. Buyers see the option but cannot pay. Signed-in staff can try it with a Stripe test card."
                  : "Holds are on. Buyers can pay a deposit by card."}{" "}
          This site never refunds a deposit. Refund it in Stripe, then mark it here.
        </p>

        {views.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">No holds yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
              When a buyer pays a deposit, the car shows as Sale pending and the hold appears here
              with the time left.
            </p>
          </div>
        ) : (
          <div className="grid gap-8">
            <Section title="Holding now" holds={running} />
            <Section title="Deposit to refund or apply" holds={owed} />
            <Section title="Finished" holds={done} />
          </div>
        )}
      </div>
    </AdminChrome>
  );
}

function Section({ title, holds }: { title: string; holds: SaleHoldView[] }) {
  if (holds.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {title} · {holds.length}
      </h2>
      <ul className="grid gap-3">
        {holds.map((h) => (
          <SaleHoldRow key={h.id} hold={h} />
        ))}
      </ul>
    </section>
  );
}
