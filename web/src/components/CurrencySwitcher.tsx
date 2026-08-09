"use client";

import { useEffect, useState } from "react";
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

export function CurrencySwitcher({ base }: { base: CurrencyCode }) {
  const [selected, setSelected] = useState<string>(base);

  // Persisted so the choice survives navigation, as the original did.
  useEffect(() => {
    const saved = localStorage.getItem("aaa:currency");
    if (saved) setSelected(saved);
  }, []);

  const choose = (code: string) => {
    setSelected(code);
    localStorage.setItem("aaa:currency", code);
    document.documentElement.dataset.displayCurrency = code;
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
