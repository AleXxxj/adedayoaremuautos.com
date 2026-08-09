"use client";

import { useActionState, useEffect, useState } from "react";
import { submitLead, type LeadResult } from "@/lib/actions/leads";
import { LegacyCalculator } from "@/components/LegacyCarDetail";
import type { MarketConfig } from "@/lib/market";

export interface SpecRow {
  label: string;
  value: string;
}

/**
 * The original tabbed panel: Overview / Specifications / Features / Finance
 * Calculator, with the same class names.
 *
 * All four panels are rendered and toggled with `.active` rather than being
 * mounted on demand — the original did the same, and it means the content is
 * in the HTML for search engines even though only one panel is visible.
 */
export function LegacyCarTabs({
  market,
  overview,
  specs,
  features,
  priceMajor,
}: {
  market: MarketConfig;
  overview: string | null;
  specs: SpecRow[];
  features: string[];
  priceMajor: number | null;
}) {
  const [tab, setTab] = useState<"overview" | "specs" | "features" | "finance">(
    overview ? "overview" : "specs",
  );

  const tabs = [
    { id: "overview", label: "Overview", show: Boolean(overview) },
    { id: "specs", label: "Specifications", show: specs.length > 0 },
    { id: "features", label: "Features", show: features.length > 0 },
    { id: "finance", label: "Finance Calculator", show: priceMajor != null },
  ] as const;

  const visible = tabs.filter((t) => t.show);

  return (
    <div className="car-tabs">
      <div className="tab-headers" role="tablist">
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab-header${tab === t.id ? " active" : ""}`}
            data-tab={t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {overview && (
        <div className={`tab-content${tab === "overview" ? " active" : ""}`} id="overview">
          <h3>Vehicle Overview</h3>
          {overview.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {specs.length > 0 && (
        <div className={`tab-content${tab === "specs" ? " active" : ""}`} id="specs">
          <h3>Technical Specifications</h3>
          <table className="specs-table">
            <tbody>
              {specs.map((s) => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {features.length > 0 && (
        <div className={`tab-content${tab === "features" ? " active" : ""}`} id="features">
          <h3>Features &amp; Functions</h3>
          <ul className="features-list">
            {features.map((f) => (
              <li key={f}>
                <i className="fas fa-check-circle" /> {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {priceMajor != null && (
        <div className={`tab-content${tab === "finance" ? " active" : ""}`} id="finance">
          <LegacyCalculator market={market} priceMajor={priceMajor} />
        </div>
      )}
    </div>
  );
}

/**
 * Request Test Drive — the original's inline sidebar form.
 *
 * The legacy version caught the submit, showed an alert promising contact
 * within 24 hours, and discarded the data. This one writes a typed
 * `test_drive` lead against the vehicle and alerts staff, so the promise the
 * customer is shown is one the business can actually keep.
 */
export function LegacyTestDriveForm({
  market,
  vehicleSlug,
}: {
  market: string;
  vehicleSlug: string;
}) {
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(
    submitLead,
    null,
  );
  const [renderedAt, setRenderedAt] = useState(0);
  useEffect(() => setRenderedAt(Date.now()), []);

  if (state?.ok) {
    return (
      <div className="inspection-request">
        <h3>Request Test Drive</h3>
        <p style={{ color: "var(--green-accent)" }}>
          <i className="fas fa-check-circle" /> Received — we will call you to
          arrange a time.
        </p>
      </div>
    );
  }

  return (
    <div className="inspection-request">
      <h3>Request Test Drive</h3>
      <form className="inspection-form" action={action}>
        <input type="hidden" name="marketCode" value={market} />
        <input type="hidden" name="type" value="test_drive" />
        <input type="hidden" name="vehicleSlug" value={vehicleSlug} />
        <input type="hidden" name="renderedAt" value={renderedAt} />
        <div aria-hidden style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <input type="text" name="name" placeholder="Your Name" required />
        <input type="tel" name="phone" placeholder="Phone Number" required />

        {state?.error && (
          <p style={{ color: "var(--illustration-copper)", fontSize: 13 }}>{state.error}</p>
        )}
        {state?.fieldErrors?.phone && (
          <p style={{ color: "var(--illustration-copper)", fontSize: 13 }}>
            {state.fieldErrors.phone[0]}
          </p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Schedule Test Drive"}
        </button>
      </form>
    </div>
  );
}
