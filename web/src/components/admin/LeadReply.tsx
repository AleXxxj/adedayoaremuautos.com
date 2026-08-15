"use client";

import { useState } from "react";

/**
 * One-tap replies.
 *
 * A phone number written on screen is not a reply: to answer someone who asked
 * for WhatsApp, a member of staff had to copy the number, save it as a
 * contact, open WhatsApp and find them. Enquiries were being lost to that
 * friction.
 *
 * These open the conversation directly. WhatsApp's wa.me link works on a
 * number that has never been saved, which is the whole point.
 */
export function LeadReply({
  name,
  phone,
  email,
  marketCode,
  vehicle,
  preferred,
}: {
  name: string;
  phone: string | null;
  email: string | null;
  marketCode: string;
  vehicle?: string | null;
  preferred?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  // wa.me needs digits only, in full international form and without a plus.
  // A Nigerian number written 080… is the same line as +23480…, and sending to
  // the local form silently fails, so the leading zero is swapped for the
  // country code of the market the enquiry came from.
  const waNumber = (() => {
    if (!phone) return null;
    let d = phone.replace(/[^\d+]/g, "");
    if (d.startsWith("+")) return d.slice(1);
    d = d.replace(/\D/g, "");
    if (marketCode === "ng") {
      if (d.startsWith("0")) return `234${d.slice(1)}`;
      if (d.startsWith("234")) return d;
      return `234${d}`;
    }
    if (d.length === 10) return `1${d}`;
    return d;
  })();

  const firstName = name.trim().split(/\s+/)[0] ?? name;
  const about = vehicle ? ` about the ${vehicle}` : "";
  const greeting =
    `Hello ${firstName}, this is Adedayo Aremu Autos following up on your ` +
    `enquiry${about}. How can we help?`;

  const wa = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(greeting)}`
    : null;
  const sms = phone ? `sms:${phone}?&body=${encodeURIComponent(greeting)}` : null;
  const mail = email
    ? `mailto:${email}?subject=${encodeURIComponent(
        `Adedayo Aremu Autos — your enquiry${about}`,
      )}&body=${encodeURIComponent(`${greeting}\n\n`)}`
    : null;

  const copy = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard can be refused; the number is on screen to read either way. */
    }
  };

  const isPreferred = (channel: string) =>
    preferred?.toLowerCase() === channel ? " lead-reply--preferred" : "";

  return (
    <div className="lead-reply">
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={`lead-reply-btn lead-reply--wa${isPreferred("whatsapp")}`}
        >
          <i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp
        </a>
      )}

      {phone && (
        <a href={`tel:${phone}`} className={`lead-reply-btn${isPreferred("phone")}`}>
          <i className="fas fa-phone" aria-hidden="true" /> Call
        </a>
      )}

      {sms && (
        <a href={sms} className="lead-reply-btn lead-reply--sms">
          <i className="fas fa-comment-sms" aria-hidden="true" /> Text
        </a>
      )}

      {mail && (
        <a href={mail} className={`lead-reply-btn${isPreferred("email")}`}>
          <i className="fas fa-envelope" aria-hidden="true" /> Email
        </a>
      )}

      {phone && (
        <button type="button" onClick={copy} className="lead-reply-btn">
          <i className={copied ? "fas fa-check" : "fas fa-copy"} aria-hidden="true" />
          {copied ? "Copied" : "Copy number"}
        </button>
      )}
    </div>
  );
}
