"use client";

import { useState } from "react";
import Image from "next/image";
import { canResize } from "@/lib/photo";
import { shareText, useCanShare } from "./ShareLink";

/**
 * One car a partner can send someone, ready to share from a phone.
 *
 * The message is written for them — the car, the price, a link that lands
 * on that car's page with their code attached, and the line saying they are
 * paid for referrals (src/lib/referral.ts). WhatsApp and Text open the
 * phone's own app with it filled in; Share opens the phone's share sheet
 * where there is one; Copy is there for everything else. Nothing is sent
 * from this site: the partner chooses who gets it.
 */
export function ShareCar({
  car,
  image,
  price,
  earn,
  unit,
  message,
}: {
  car: string;
  image: string | null;
  /** "$300 a week" */
  price: string;
  /** What one unit of this car earns the partner: "$15.00". */
  earn: string;
  /** What the price is per: "week", or "day" where there is no weekly rate. */
  unit: "week" | "day";
  message: string;
}) {
  const canShare = useCanShare();
  const [copy, setCopy] = useState<"idle" | "copied" | "refused">("idle");

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopy("copied");
      window.setTimeout(() => setCopy("idle"), 2000);
    } catch {
      // Refused — an in-app browser, say. Said, so the button doesn't look
      // broken, with the two ways that still work.
      setCopy("refused");
    }
  };

  const action =
    "flex min-h-[60px] flex-col items-center justify-center gap-1 text-[13px] font-semibold text-text-secondary transition-colors duration-200 ease-out hover:bg-surface-2 hover:text-text-primary motion-reduce:transition-none";

  return (
    <li className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-0">
      <div className="flex gap-3 p-3">
        {image ? (
          <Image
            src={image}
            alt=""
            width={112}
            height={84}
            sizes="112px"
            unoptimized={!canResize(image)}
            className="h-[84px] w-24 shrink-0 rounded-xl object-cover sm:w-28"
          />
        ) : (
          <div className="flex h-[84px] w-24 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl text-text-muted sm:w-28">
            <i className="fas fa-car" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="line-clamp-2 break-words text-base font-bold leading-snug text-text-primary">
            {car}
          </h3>
          <p className="mt-0.5 text-[15px] text-text-secondary">{price}</p>
          <p className="mt-1 text-[15px] leading-snug text-text-secondary">
            You earn{" "}
            <strong className="font-bold tabular-nums text-accent-400">{earn}</strong> for
            each {unit} they rent it
          </p>
        </div>
      </div>
      <div
        className={`grid border-t border-border-subtle ${canShare ? "grid-cols-4" : "grid-cols-3"}`}
      >
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={action}
        >
          <i className="fab fa-whatsapp text-lg" aria-hidden="true" /> WhatsApp
        </a>
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          className={`${action} border-l border-border-subtle`}
        >
          <i className="fas fa-comment-sms text-lg" aria-hidden="true" /> Text
        </a>
        {canShare && (
          <button
            type="button"
            onClick={() => void shareText(message)}
            className={`${action} border-l border-border-subtle`}
          >
            <i className="fas fa-share-nodes text-lg" aria-hidden="true" /> Share
          </button>
        )}
        <button
          type="button"
          onClick={copyMessage}
          className={`${action} border-l border-border-subtle`}
        >
          <i
            className={`fas ${copy === "copied" ? "fa-check" : "fa-copy"} text-lg`}
            aria-hidden="true"
          />{" "}
          {copy === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Read out by screen readers when it changes; the button's own label
          change is not announced. */}
      <p
        aria-live="polite"
        className={copy === "refused" ? "px-3 pb-3 text-sm text-warning" : "sr-only"}
      >
        {copy === "copied"
          ? `Message about the ${car} copied.`
          : copy === "refused"
            ? "This browser won't let us copy. Use WhatsApp or Text instead."
            : ""}
      </p>
    </li>
  );
}
