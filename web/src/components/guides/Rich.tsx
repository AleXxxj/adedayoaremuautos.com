import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { MARKS } from "@/content/guides/format";

/**
 * Guide text with its two marks drawn: **bold** and [a link](/us/rentals).
 *
 * Built as React elements, never as an HTML string, and a link is drawn only
 * for a path on this site: the text is written in code, but nothing here
 * should be able to turn a string into markup or point off the site.
 */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(MARKS)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, bold, label, href] = m;
    if (bold != null) out.push(<strong key={key++}>{bold}</strong>);
    else if (href.startsWith("/") && !href.startsWith("//")) {
      out.push(
        <Link key={key++} href={href} className="gd-a">
          {label}
        </Link>,
      );
    } else out.push(label);
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
