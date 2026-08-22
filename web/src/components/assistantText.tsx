import { Fragment, type ReactNode } from "react";

/**
 * Turns links in an assistant reply into links.
 *
 * The model answers with the page for a vehicle, and that arrived as bare text
 * — "(/us/inventory/2013-hyundai-sonata)" — which a customer has to read,
 * remember and retype. The single most useful thing the assistant produces was
 * the one thing they could not act on.
 *
 * Three shapes are recognised, because the model produces all three depending
 * on how the question was asked: a markdown link, a full URL, and a
 * site-relative path.
 *
 * Built as React elements rather than an HTML string. The text comes from a
 * model, which is influenced by whatever a visitor typed, so it is untrusted
 * by definition — `dangerouslySetInnerHTML` here would turn a chat window into
 * a cross-site scripting hole. React escapes every text node it renders, and
 * the only attribute set is `href`, from a pattern that cannot match
 * `javascript:`.
 */

// Markdown link, full URL, or a path beginning with a known market segment.
const PATTERN =
  /\[([^\]]+)\]\((\/(?:us|ng)\/[^\s)]*|https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])|(\/(?:us|ng)\/[A-Za-z0-9\-_/?=&%.]*[A-Za-z0-9\-_/])/g;

/** Trailing punctuation belongs to the sentence, not the address. */
function trimTrailing(href: string): string {
  return href.replace(/[.,;:!?]+$/, "");
}

export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const m of text.matchAll(PATTERN)) {
    const index = m.index ?? 0;
    if (index > last) out.push(text.slice(last, index));

    const [full, mdLabel, mdHref, rawUrl, rawPath] = m;
    const href = trimTrailing(mdHref ?? rawUrl ?? rawPath ?? "");
    const label = mdLabel ?? href;

    if (href) {
      const external = href.startsWith("http");
      out.push(
        <a
          key={`l${key++}`}
          href={href}
          className="assistant-link"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {label}
        </a>,
      );
    } else {
      out.push(full);
    }

    last = index + full.length;
  }

  if (last < text.length) out.push(text.slice(last));

  return out.map((n, i) =>
    typeof n === "string" ? <Fragment key={`t${i}`}>{n}</Fragment> : n,
  );
}
