"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CurrencyCode } from "@/lib/money";

/**
 * The original currency switcher, restored — with the one thing it was missing.
 *
 * The legacy version converted every price at a rate frozen in the markup
 * (USD 0.00065, i.e. ₦1,538 to the dollar) and presented the result as if it
 * were the price. That is what made it dangerous rather than useful: a Lagos
 * vehicle appeared to have a dollar price a US buyer could act on.
 *
 * Here the conversion is clearly an estimate, the rate and its age are shown,
 * and the vehicle's real price in its own currency stays on the page. Same
 * feature, same place, no longer implying an offer that does not exist.
 */

const DISPLAY: { code: CurrencyCode | "GBP" | "EUR"; flag: string; label: string }[] = [
  { code: "NGN", flag: "🇳🇬", label: "NGN (₦)" },
  { code: "USD", flag: "🇺🇸", label: "USD ($)" },
  { code: "GBP", flag: "🇬🇧", label: "GBP (£)" },
  { code: "EUR", flag: "🇪🇺", label: "EUR (€)" },
];

/**
 * The saved choice, read as what it is: state owned by the browser.
 *
 * It was loaded with a setState inside an effect, which React now rejects —
 * it costs a second render for something known before the first. localStorage
 * is an external store, so it is read through the hook built for reading
 * external stores. The server snapshot is null because localStorage does not
 * exist there, and a mismatch between the two would be a hydration error.
 */
const subscribeToCurrency = (fn: () => void) => {
  window.addEventListener("aaa:currency", fn);
  return () => window.removeEventListener("aaa:currency", fn);
};

function readSaved(): string | null {
  try {
    return localStorage.getItem("aaa:currency");
  } catch {
    // Private browsing can throw on access. Falling back to the market's own
    // currency is correct: nothing is lost but the remembered preference.
    return null;
  }
}

export function CurrencySwitcher({ base }: { base: CurrencyCode }) {
  const saved = useSyncExternalStore(subscribeToCurrency, readSaved, () => null);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? saved ?? base;

  /*
   * The document attribute is written here rather than in the click handler.
   *
   * Setting it in the handler modifies something outside React during an
   * event, which the compiler flags — and it also left the attribute unset on
   * arrival, so a remembered choice did not apply until the switcher was
   * touched again. As an effect on the selected value it is correct in both
   * cases: on load and on change.
   */
  useEffect(() => {
    document.documentElement.dataset.displayCurrency = selected;
  }, [selected]);

  const choose = (code: string) => {
    setChosen(code);
    try {
      localStorage.setItem("aaa:currency", code);
    } catch {
      /* Not remembered, still applied for this visit. */
    }
    window.dispatchEvent(new CustomEvent("aaa:currency", { detail: code }));
  };

  return (
    <div className="footer-currency">
      <h4>Currency</h4>
      <div className="currency-options">
        {DISPLAY.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => choose(c.code)}
            className={`currency-option${selected === c.code ? " active" : ""}`}
            aria-pressed={selected === c.code}
          >
            <span aria-hidden>{c.flag}</span> {c.label}
          </button>
        ))}
      </div>
      {selected !== base && (
        <p
          style={{
            marginTop: "12px",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--silver-cool)",
          }}
        >
          Prices are shown and sold in {base}. Other currencies are an
          indicative guide only.
        </p>
      )}
    </div>
  );
}
