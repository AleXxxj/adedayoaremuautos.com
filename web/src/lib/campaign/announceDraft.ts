/**
 * The words of a guide announcement.
 *
 * Pure: no database, no registry, no React. The Broadcasts screen runs this in
 * the browser to draw the preview, the server runs it again to send, and the
 * test suite (scripts/verify-announce.mts) checks the two cannot differ.
 *
 * Everything a subscriber reads is the guide's own title, its one-line promise
 * and its address. Staff may change one thing: the short line above the title.
 */
import type { MarketCode } from "@/lib/market";

export type AnnounceKind = "guide" | "article";

/** Something on the site that can be announced. */
export interface Announceable {
  kind: AnnounceKind;
  market: MarketCode;
  slug: string;
  /** The page's own headline. */
  title: string;
  /** The page's own one-line promise. */
  promise: string;
  /** Site-relative address, e.g. /us/guides/weekly-car-rental. */
  path: string;
  /** ISO date it was published, when known. */
  published: string | null;
}

export interface AnnounceDraft {
  subject: string;
  intro: string;
  title: string;
  promise: string;
  /** Absolute address of the page. */
  url: string;
  /** The words on the email's one button. */
  button: string;
  /**
   * The whole message as plain writing. Stored on the campaign, so the
   * history shows what was sent and the message still makes sense if it is
   * ever drawn by the ordinary campaign template.
   */
  body: string;
  push: { title: string; body: string; url: string; tag: string };
}

/** Long enough for a sentence, short enough to stay one line on a phone. */
export const INTRO_MAX = 140;

const WORD: Record<AnnounceKind, string> = { guide: "guide", article: "article" };

export const kindWord = (kind: AnnounceKind): string => WORD[kind];

export const defaultIntro = (kind: AnnounceKind): string =>
  `We just published a new ${WORD[kind]}.`;

/** One line, trimmed and capped. An empty line falls back to the default. */
export function cleanIntro(raw: string | null | undefined, kind: AnnounceKind): string {
  const line = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, INTRO_MAX).trim();
  return line || defaultIntro(kind);
}

export function draftFor(
  item: Announceable,
  siteBase: string,
  intro?: string | null,
): AnnounceDraft {
  const line = cleanIntro(intro, item.kind);
  const url = `${siteBase.replace(/\/+$/, "")}${item.path}`;
  const word = WORD[item.kind];

  return {
    subject: `New ${word}: ${item.title}`,
    intro: line,
    title: item.title,
    promise: item.promise,
    url,
    button: item.kind === "guide" ? "Open the guide" : "Read the article",
    body: [line, "", item.title, item.promise, "", url].join("\n"),
    push: {
      title: item.title,
      body: item.promise,
      // Site-relative: the push sender makes it absolute, and only ever to
      // this site.
      url: item.path,
      // One tag per kind, so two announcements in a day replace each other
      // on the lock screen instead of stacking.
      tag: `new-${word}`,
    },
  };
}
