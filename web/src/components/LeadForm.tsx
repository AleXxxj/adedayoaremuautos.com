"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitLead, type LeadResult } from "@/lib/actions/leads";
import type { MarketConfig } from "@/lib/market";

const TYPE_LABELS: Record<string, string> = {
  contact: "General enquiry",
  test_drive: "Book a test drive",
  finance: "Financing enquiry",
  trade_in: "Value my trade-in",
  rental: "Rental enquiry",
};

export function LeadForm({
  market,
  defaultType = "contact",
  vehicleSlug,
  vehicleLabel,
  phone,
}: {
  market: MarketConfig;
  defaultType?: string;
  vehicleSlug?: string;
  vehicleLabel?: string;
  phone?: string | null;
}) {
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(
    submitLead,
    null,
  );
  const [renderedAt, setRenderedAt] = useState<number>(0);
  const landingPath = useRef<string>("");

  // Set on the client only, so the timestamp reflects when the visitor actually
  // saw the form rather than when the page was rendered or cached.
  useEffect(() => {
    setRenderedAt(Date.now());
    landingPath.current = window.location.pathname + window.location.search;
  }, []);

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-[var(--success)]/40 bg-[var(--success)]/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-[var(--success)]">
          Thank you — we have your enquiry.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
          Someone will be in touch shortly. If it is urgent, calling is fastest
          {phone ? (
            <>
              {" "}
              —{" "}
              <a href={`tel:${phone}`} className="text-[var(--link)] hover:underline">
                {phone}
              </a>
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="marketCode" value={market.code} />
      <input type="hidden" name="renderedAt" value={renderedAt} />
      <input type="hidden" name="landingPath" value={landingPath.current} />
      {vehicleSlug && <input type="hidden" name="vehicleSlug" value={vehicleSlug} />}

      {/* Honeypot. Hidden from people, irresistible to bots. Not display:none —
          some bots skip those; off-screen positioning catches more. */}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      {vehicleLabel && (
        <p className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 text-sm">
          Enquiring about{" "}
          <span className="font-semibold">{vehicleLabel}</span>
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          What can we help with?
        </span>
        <select name="type" defaultValue={defaultType} className={input}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Your name</span>
          <input name="name" required autoComplete="name" className={input} />
          {err("name") && <Err>{err("name")}</Err>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Phone</span>
          <input
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder={market.code === "us" ? "(336) 555-0100" : "0801 234 5678"}
            className={input}
          />
          {err("phone") && <Err>{err("phone")}</Err>}
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Email <span className="text-[var(--text-muted)]">(optional)</span>
        </span>
        <input name="email" type="email" autoComplete="email" className={input} />
        {err("email") && <Err>{err("email")}</Err>}
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          How should we reach you?
        </legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["phone", "whatsapp", "email"] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 capitalize">
              <input
                type="radio"
                name="preferredContact"
                value={opt}
                defaultChecked={opt === "phone"}
                className="size-4"
              />
              {opt}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Anything else? <span className="text-[var(--text-muted)]">(optional)</span>
        </span>
        <textarea name="message" rows={4} className={input} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--cta-bg)] py-3 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending ? "Sending…" : "Send enquiry"}
      </button>

      <p className="text-xs text-[var(--text-muted)]">
        We use your details only to respond to this enquiry.
      </p>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2.5 outline-none focus:border-[var(--focus)]";

function Err({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-sm text-[var(--danger)]">{children}</span>;
}
