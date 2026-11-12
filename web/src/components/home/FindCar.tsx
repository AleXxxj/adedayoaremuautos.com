"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { searchParamsFor, type StockCar } from "./homeData";

export interface FindChip {
  label: string;
  href: string;
}

/**
 * "Find your car": one box and a row of chips, just under the hero.
 *
 * The box is a plain GET form to the sale list, so it works before the page's
 * script has loaded (the words go to `q`). Once it has, a budget or a year is
 * sent as the list's own filter instead: "10k" is `price=0-10000`, not a
 * search for the text "10k", which matches nothing. Words the list would not
 * find as typed are tried against the cars listed (homeData.ts).
 *
 * The chips are computed on the server from the cars listed (homeData.ts), so
 * every one of them leads to at least one car.
 */
export function FindCar({
  action,
  stock,
  chips,
  nextYear,
}: {
  /** "/us/inventory" */
  action: string;
  /** The cars listed for sale, for finding typed words the way the list does. */
  stock: StockCar[];
  chips: FindChip[];
  nextYear: number;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const inputId = useId();

  return (
    <section className="find" aria-labelledby={`${inputId}-title`}>
      <h2 className="find-title" id={`${inputId}-title`}>
        Find your car
      </h2>
      <form
        className="find-form"
        action={action}
        method="get"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const query = searchParamsFor(text, { stock, nextYear }).toString();
          router.push(query ? `${action}?${query}` : action);
        }}
      >
        <label htmlFor={inputId} className="home-sr">
          Search cars for sale
        </label>
        <i className="fas fa-magnifying-glass find-icon" aria-hidden="true" />
        <input
          id={inputId}
          name="q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Type a make, model or budget"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="find-go" aria-label="Search">
          <i className="fas fa-arrow-right" aria-hidden="true" />
        </button>
      </form>

      {chips.length > 0 && (
        <ul className="find-chips" aria-label="Quick searches">
          {chips.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="find-chip">
                {c.label}
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
