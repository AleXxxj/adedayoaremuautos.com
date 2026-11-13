import { PartnerShell, Panel } from "./PartnerShell";
import { PartnerHeader } from "./PartnerHeader";
import { ShareLink } from "./ShareLink";
import { ShareCar } from "./ShareCar";
import { TermsUpdate } from "./TermsUpdate";
import { PayoutRequest } from "./PayoutRequest";
import { card, cardTitle, display, fine } from "./ui";

/**
 * Everything the dashboard shows, already worked out and formatted.
 *
 * app/partner/page.tsx reads the database and fills this in; the view only
 * lays it out. Kept apart so the page can be looked at, at every width,
 * without a partner's login.
 */
export interface DashboardData {
  partner: {
    name: string;
    code: string;
    /** "5%" */
    rentalRate: string;
    /** null where sale commissions are paused (saleCommissionsOn). */
    saleRate: string | null;
    /** "United States" */
    market: string;
    /** The public site for their market: "/us". */
    home: string;
  };
  /** The current terms, when the partner accepted an older version. */
  termsUpdate: { n: number; heading: string; body: string }[] | null;
  share: {
    link: string;
    /** What Share sends: the link and the line saying they are paid. */
    message: string;
  };
  money: {
    /** Earned on finished rentals, paid or not: all time. */
    earned: string;
    available: string;
    availableMinor: number;
    pending: string;
    requested: string;
    requestedMinor: number;
    paid: string;
    currencySymbol: string;
  };
  cars: {
    id: string;
    car: string;
    image: string | null;
    price: string;
    earn: string;
    unit: "week" | "day";
    message: string;
  }[];
  inquiries: { total: number; open: number; won: number };
  rentals: { id: string; car: string; amount: string; status: string; date: string }[];
  sales: { id: string; amount: string; status: string; date: string }[];
  earnings: {
    id: string;
    /** "Car rental", "Vehicle sale" */
    title: string;
    /** "5% of $350.00" */
    basis: string;
    amount: string;
    state: string;
    date: string;
    note: string | null;
  }[];
  payouts: {
    id: string;
    amount: string;
    state: string;
    date: string;
    reference: string | null;
    rejectReason: string | null;
  }[];
}

/**
 * The partner dashboard, phone first.
 *
 * The top of the screen answers the two questions a partner opens it with:
 * what have I earned, and what can I ask for now. Then sharing — the link
 * with big Copy and Share buttons, and every car ready to send — because
 * that is the job. Then the record: earnings in full, what they have sent,
 * and every payout request, as one card per row on a phone and as rows from
 * 640px up. Nothing on it is wider than a 320px screen.
 */
export function DashboardView({
  partner,
  termsUpdate,
  share,
  money,
  cars,
  inquiries,
  rentals,
  sales,
  earnings,
  payouts,
}: DashboardData) {
  return (
    <PartnerShell wide>
      <PartnerHeader
        name={partner.name}
        code={partner.code}
        hireRate={partner.rentalRate}
        saleRate={partner.saleRate}
        market={partner.market}
        home={partner.home}
      />

      <div className="mt-7 grid gap-4 lg:grid-cols-2 lg:items-start">
        {termsUpdate && (
          <div className="lg:col-span-2">
            <TermsUpdate clauses={termsUpdate} />
          </div>
        )}

        {/* ── What you have earned, and what you can ask for ─────────── */}
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="money-title">
          <h2 id="money-title" className="sr-only">
            Earned so far
          </h2>
          {/* Side by side; on the narrowest phones, long amounts stack
              rather than squeeze ("$0.00" and "$350" always fit). */}
          <dl
            className={`grid gap-x-4 gap-y-5 ${
              money.earned.length <= 7 && money.available.length <= 7
                ? "grid-cols-2"
                : "grid-cols-[repeat(auto-fit,minmax(128px,1fr))]"
            }`}
          >
            <Big label="Total earned" value={money.earned} hint="All time" />
            <Big label="Available" value={money.available} hint="Ready to request" gold />
          </dl>

          <PayoutRequest
            availableMinor={money.availableMinor}
            available={money.available}
            currencySymbol={money.currencySymbol}
            outstanding={money.requestedMinor > 0 ? money.requested : undefined}
          />
        </section>

        {/* ── Your link ─────────────────────────────────────────────── */}
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="share-title">
          <h2 id="share-title" className={`${cardTitle} mb-4`}>
            Share your link
          </h2>
          <ShareLink link={share.link} code={partner.code} message={share.message} />
          <p className={`mt-4 ${fine}`}>
            Anyone who opens your link is recorded against your name for 90
            days, whichever page they contact us from. If they call
            instead, give them your code and we will enter it by hand.
          </p>
        </section>
      </div>

      <div className="mt-4 space-y-4">
        {/* ── Cars to share ─────────────────────────────────────────────
            Each card's message carries the car, its price, a link to that
            car with their code attached, and the line saying they are
            paid. */}
        <Panel title="Cars to share">
          {cars.length === 0 ? (
            <p className="text-[15px] leading-relaxed text-text-secondary">
              No cars are listed for rent right now. Your link still works:
              anyone who rents through it later is recorded as yours.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cars.map((c) => (
                <ShareCar
                  key={c.id}
                  car={c.car}
                  image={c.image}
                  price={c.price}
                  earn={c.earn}
                  unit={c.unit}
                  message={c.message}
                />
              ))}
            </ul>
          )}
          <p className={`mt-4 ${fine}`}>
            Once someone you referred rents, every later rental they book with the same
            phone number is yours too: each week they keep a car earns you{" "}
            {partner.rentalRate} of what they pay. Keep the line that
            says you get a referral fee.
          </p>
        </Panel>

        {/* ── Your earnings, in full ─────────────────────────────────── */}
        <Panel title="Your earnings">
          <dl className="grid grid-cols-3 gap-3">
            <Small label="Still to come" value={money.pending} hint="Rentals not finished yet" />
            <Small label="Requested" value={money.requested} hint="Waiting on us" />
            <Small label="Paid to you" value={money.paid} hint="All time" />
          </dl>

          <p className={`mt-4 ${fine}`}>
            &ldquo;Available&rdquo; is already net of anything you have asked
            for and not yet been paid, so you cannot request the same earnings
            twice. We never hold money on your behalf — this is a record of what
            we owe you.
          </p>

          {/* Every earning, itemized. */}
          {earnings.length > 0 && (
            <Rows title="Earnings history">
              {earnings.map((e) => (
                <Row
                  key={e.id}
                  title={e.title}
                  detail={e.basis}
                  amount={e.amount}
                  date={e.date}
                  status={e.state}
                  struck={e.state === "cancelled"}
                  // The reason, where there is one. A commission that
                  // silently shrinks is how a partner concludes they are
                  // being short-changed.
                  note={e.note}
                />
              ))}
            </Rows>
          )}
        </Panel>

        {/* ── What you have sent ────────────────────────────────────── */}
        <Panel title="What you have sent us">
          <dl className="grid grid-cols-3 gap-3">
            <Small label="Inquiries" value={String(inquiries.total)} />
            <Small label="Still open" value={String(inquiries.open)} />
            <Small label="Completed" value={String(inquiries.won)} />
          </dl>

          {rentals.length > 0 && (
            <Rows title="Rentals">
              {rentals.map((b) => (
                <Row
                  key={b.id}
                  title={b.car}
                  amount={b.amount}
                  caption="Rental total"
                  date={b.date}
                  status={b.status}
                />
              ))}
            </Rows>
          )}

          {sales.length > 0 && (
            <Rows title="Sales">
              {sales.map((d) => (
                <Row
                  key={d.id}
                  title="Vehicle sale"
                  amount={d.amount}
                  caption="Sale price"
                  date={d.date}
                  status={d.status}
                />
              ))}
            </Rows>
          )}

          {inquiries.total === 0 && rentals.length === 0 && sales.length === 0 && (
            <p className="mt-5 text-[15px] leading-relaxed text-text-secondary">
              Nothing yet. Share your link above and anyone who contacts us through
              it appears here, with its status, as it moves along.
            </p>
          )}
        </Panel>

        {payouts.length > 0 && (
          <Panel title="Your payout requests">
            <ul className="grid gap-2.5 sm:block">
              {payouts.map((p) => (
                <Row
                  key={p.id}
                  title="Payout request"
                  detail={p.reference ? `Ref ${p.reference}` : undefined}
                  amount={p.amount}
                  date={p.date}
                  status={p.state}
                  note={p.rejectReason}
                  noteTone="bad"
                />
              ))}
            </ul>
          </Panel>
        )}

        {/* The sale-stock list that was here is gone: the program is built
            around rentals now ("Cars to share", above), and sale referrals
            wait on a North Carolina lawyer's view of G.S. 20-306. */}
        {partner.saleRate === null && (
          <Panel title="Car sale referrals">
            <p className="text-[15px] leading-relaxed text-text-secondary">
              <strong className="text-text-primary">Coming soon.</strong> Today you earn on
              rentals only. When referrals for cars we sell open up, they will show here on
              this same page, and we will email you first.
            </p>
          </Panel>
        )}
      </div>
    </PartnerShell>
  );
}

/**
 * One of the two big figures. Long amounts step down a size so that two of
 * them still sit side by side on a 360px phone; below that they stack.
 */
function Big({
  label,
  value,
  hint,
  gold = false,
}: {
  label: string;
  value: string;
  hint: string;
  gold?: boolean;
}) {
  const size =
    value.length > 12
      ? "text-[length:clamp(20px,5.4vw,30px)]"
      : value.length > 9
        ? "text-[length:clamp(22px,6.4vw,34px)]"
        : "text-[length:clamp(24px,7vw,40px)]";
  return (
    <div className="min-w-0">
      <dt className="text-[15px] font-semibold text-text-secondary">{label}</dt>
      <dd
        className={`${display} mt-1.5 ${size} leading-none tabular-nums ${
          gold ? "text-accent-400" : "text-text-primary"
        }`}
      >
        {value}
      </dd>
      <dd className="mt-2 text-sm text-text-muted">{hint}</dd>
    </div>
  );
}

/** A smaller figure, three to a row. The hint shows from 640px up. */
function Small({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-semibold leading-tight text-text-secondary">{label}</dt>
      <dd className="mt-1 break-words text-base font-bold tabular-nums text-text-primary sm:text-lg">
        {value}
      </dd>
      {hint && <dd className="mt-0.5 hidden text-[13px] text-text-muted sm:block">{hint}</dd>}
    </div>
  );
}

function Rows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2.5 text-base font-bold text-text-primary">{title}</h3>
      <ul className="grid gap-2.5 sm:block">{children}</ul>
    </div>
  );
}

/**
 * A row of a list: a card of its own on a phone, with the amount large on
 * the right and the date and status small under the title; a plain row from
 * 640px up, where there is room for it to read as a table.
 */
function Row({
  title,
  detail,
  amount,
  caption,
  date,
  status,
  struck = false,
  note,
  noteTone = "muted",
}: {
  title: string;
  detail?: string;
  amount: string;
  /** What the amount is, where it is not the partner's own money. */
  caption?: string;
  date: string;
  status: string;
  struck?: boolean;
  note?: string | null;
  noteTone?: "muted" | "bad";
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-2xl border border-border-subtle bg-surface-0 p-4 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:px-0 sm:py-3.5 sm:last:border-b-0">
      <p className="break-words pt-0.5 text-base font-semibold text-text-primary">{title}</p>
      <p className="text-right">
        <span
          className={`${display} block text-xl tabular-nums sm:text-2xl ${
            struck ? "text-text-muted line-through" : "text-text-primary"
          }`}
        >
          {amount}
        </span>
        {caption && <span className="mt-0.5 block text-xs text-text-muted">{caption}</span>}
      </p>
      {/* Under both, the full width: the date and what it was, then the
          status, which moves to its own line when they do not fit. */}
      <p className="col-span-2 mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-text-muted">
        <span>
          {date}
          {detail && ` · ${detail}`}
        </span>
        <Status value={status} />
      </p>
      {note && (
        <p
          className={`col-span-2 mt-2 text-sm leading-relaxed ${
            noteTone === "bad" ? "text-danger" : "text-text-secondary"
          }`}
        >
          {note}
        </p>
      )}
    </li>
  );
}

/**
 * A status, in the partner's words rather than the database's.
 *
 * `returned`, `delivered` and `won` are perfectly clear inside the business
 * and mean nothing to somebody looking at their own earnings — and "pending"
 * on a commission reads as a problem when it only means the rental is still
 * running.
 */
const WORDS: Record<string, { text: string; tone: Tone }> = {
  quote: { text: "Awaiting payment", tone: "muted" },
  confirmed: { text: "Confirmed", tone: "good" },
  active: { text: "Rental in progress", tone: "good" },
  returned: { text: "Completed", tone: "good" },
  cancelled: { text: "Canceled", tone: "muted" },
  pending: { text: "Not yet earned", tone: "wait" },
  paid: { text: "Paid to you", tone: "good" },
  requested: { text: "Requested", tone: "wait" },
  approved: { text: "Approved", tone: "wait" },
  rejected: { text: "Declined", tone: "bad" },
  draft: { text: "In progress", tone: "muted" },
  negotiating: { text: "In progress", tone: "muted" },
  agreed: { text: "Agreed", tone: "muted" },
  financing: { text: "Awaiting financing", tone: "muted" },
  contracted: { text: "Signed", tone: "muted" },
  delivered: { text: "Completed", tone: "good" },
  lost: { text: "Did not complete", tone: "muted" },
};

type Tone = "good" | "wait" | "muted" | "bad";

const TONES: Record<Tone, string> = {
  good: "border-brand-300/40 text-brand-300",
  wait: "border-warning/45 text-warning",
  muted: "border-border-default text-text-muted",
  bad: "border-danger/50 text-danger",
};

function Status({ value }: { value: string }) {
  const w = WORDS[value] ?? { text: value, tone: "muted" as const };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${TONES[w.tone]}`}
    >
      {w.text}
    </span>
  );
}
