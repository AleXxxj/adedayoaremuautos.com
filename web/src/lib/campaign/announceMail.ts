/**
 * The guide announcement email.
 *
 * Short on purpose: one line from the business, the guide's title, its one
 * line, and one button. It opens and closes with the same band and the same
 * footer as every other campaign (mailOpen and mailClose in render.ts), so the
 * postal address and the unsubscribe link are the campaign ones, not copies.
 *
 * Tables and inline styles only, for the reasons given at the top of
 * render.ts. One column, so there is nothing to rearrange on a phone.
 */
import { escapeHtml, mailClose, mailOpen, GREEN, INK, MUTED } from "./render";
import type { AnnounceDraft } from "./announceDraft";

export interface AnnounceMailOptions {
  draft: AnnounceDraft;
  unsubscribeUrl: string;
  address: string;
  siteBase: string;
}

export function renderAnnouncementHtml(o: AnnounceMailOptions): string {
  const d = o.draft;
  const href = escapeHtml(d.url);

  return `${mailOpen(o.siteBase)}

  <tr><td style="padding:32px 28px 32px">
    <p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:${MUTED}">${escapeHtml(d.intro)}</p>
    <p style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:800;color:${INK}">${escapeHtml(d.title)}</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${INK}">${escapeHtml(d.promise)}</p>
    <a href="${href}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 28px;border-radius:8px">
      ${escapeHtml(d.button)}
    </a>
  </td></tr>

${mailClose(o.address, o.unsubscribeUrl)}`;
}

/** The plain-text part. Same words, same order. */
export function renderAnnouncementText(o: AnnounceMailOptions): string {
  const d = o.draft;
  return [
    "ADEDAYO AREMU AUTOS",
    "",
    d.intro,
    "",
    d.title,
    d.promise,
    "",
    `${d.button}: ${d.url}`,
    "",
    "---",
    o.address,
    `Unsubscribe: ${o.unsubscribeUrl}`,
  ].join("\n");
}
