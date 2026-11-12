"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export interface ListSelect {
  /** The query-string key: "make", "price". */
  key: string;
  /** What the menu chooses, for a screen reader: "Make". */
  label: string;
  /** The "no filter" choice, and what the closed menu reads: "Any make". */
  anyLabel: string;
  options: { value: string; label: string }[];
}

/**
 * A list's menus: make, price and sort, and a search box behind a button.
 *
 * Nothing here is typed unless someone opens the search: each menu is the
 * phone's own picker and applies the moment a choice is made. The body-type
 * chips above it (ListChrome.tsx) are plain links.
 *
 * It is a real GET form. With scripts running, a change goes to the new
 * address without reloading the page; without them an Apply button appears
 * and the browser submits the form itself, to the same address. Every
 * filtered view is a link someone can send.
 *
 * `values` and `carry` come from the page, which has already read the
 * address: `values` fill the menus, `carry` are the other filters in force
 * (a body type, a year from an older link), sent along so a change here
 * keeps them. The page number is never sent, so a change starts at page 1.
 */
export function ListToolbar({
  action,
  selects,
  sort,
  values,
  carry,
  search,
}: {
  /** The list's own path: "/us/inventory". */
  action: string;
  selects: ListSelect[];
  sort: { options: { value: string; label: string }[]; defaultValue: string };
  values: Record<string, string | undefined>;
  carry: Record<string, string | undefined>;
  /** Give the list a search box (`q`). */
  search?: { placeholder: string };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  // Open when there is a search in force; after that, whatever was tapped.
  const [tapped, setTapped] = useState<boolean | null>(null);
  const open = tapped ?? Boolean(values.q);

  const hrefFor = (form: HTMLFormElement) => {
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value !== "string") continue;
      const v = value.trim();
      if (!v || (key === "sort" && v === sort.defaultValue)) continue;
      next.set(key, v);
    }
    const query = next.toString();
    return query ? `${action}?${query}` : action;
  };

  const apply = (form: HTMLFormElement | null) => {
    if (form) router.push(hrefFor(form), { scroll: false });
  };

  // A menu changed before the page woke up was never applied: apply it now.
  const shown = useRef({ values, carry, defaultSort: sort.defaultValue });
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const { values: v, carry: c, defaultSort } = shown.current;
    const data = new FormData(form);
    const changed = [...data.keys()].some((key) => {
      if (key in c) return false;
      const now = String(data.get(key) ?? "").trim();
      const was = v[key] ?? (key === "sort" ? defaultSort : "");
      return now !== was;
    });
    if (changed) router.push(hrefFor(form), { scroll: false });
    // Once, when the page wakes. Later changes go through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tapped) boxRef.current?.focus();
  }, [tapped]);

  // A filter from an older link that the menu no longer offers (a make typed
  // in full, say) still shows as chosen instead of reading "Any make".
  const withChosen = (s: ListSelect) => {
    const chosen = values[s.key];
    return chosen && !s.options.some((o) => o.value === chosen)
      ? [{ value: chosen, label: chosen }, ...s.options]
      : s.options;
  };

  // A menu with one choice or none filters nothing.
  const useful = selects.filter((s) => s.options.length > 1 || values[s.key]);
  // Two to a row on a phone: with an odd number, the last one takes the row.
  const odd = (useful.length + 1 + (search ? 1 : 0)) % 2 === 1;

  return (
    <form
      ref={formRef}
      className={odd ? "cl-tools cl-tools--odd" : "cl-tools"}
      method="get"
      action={action}
      // The address decides what the menus show, not what a browser remembers
      // from the last visit.
      autoComplete="off"
      role="search"
      aria-label="Filter and sort"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      {Object.entries(carry).map(
        ([key, value]) => value && <input key={key} type="hidden" name={key} value={value} />,
      )}

      {useful.map((s) => (
        <label key={s.key} className="cl-select">
          <span className="cl-sr">{s.label}</span>
          {/* Keyed by its value, so it follows the address after a chip or
              the back button changes it. */}
          <select
            key={values[s.key] ?? ""}
            name={s.key}
            defaultValue={values[s.key] ?? ""}
            onChange={(e) => apply(e.currentTarget.form)}
          >
            <option value="">{s.anyLabel}</option>
            {withChosen(s).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <label className={search ? "cl-select" : "cl-select cl-tools-last"}>
        <span className="cl-sr">Sort</span>
        <select
          key={values.sort ?? sort.defaultValue}
          name="sort"
          defaultValue={values.sort ?? sort.defaultValue}
          onChange={(e) => apply(e.currentTarget.form)}
        >
          {sort.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {search && (
        <>
          <button
            type="button"
            className="cl-search-btn cl-tools-last"
            aria-expanded={open}
            aria-controls={searchId}
            onClick={() => setTapped(!open)}
          >
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            Search
          </button>
          <div className="cl-search" id={searchId} data-open={open}>
            <label className="cl-sr" htmlFor={`${searchId}-box`}>
              Search by make or model
            </label>
            <input
              key={values.q ?? ""}
              ref={boxRef}
              id={`${searchId}-box`}
              type="search"
              name="q"
              defaultValue={values.q ?? ""}
              placeholder={search.placeholder}
              enterKeyHint="search"
              autoComplete="off"
              maxLength={60}
            />
            <button type="submit" className="cl-search-go" aria-label="Search">
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {/* Without scripts: the menus need a button, and the search box shows. */}
      <button type="submit" className="cl-apply">
        Apply
      </button>
      <noscript>
        <style>{`.legacy-theme .cl-apply{display:inline-flex}.legacy-theme .cl-search{display:flex}.legacy-theme .cl-search-btn{display:none}`}</style>
      </noscript>
    </form>
  );
}
