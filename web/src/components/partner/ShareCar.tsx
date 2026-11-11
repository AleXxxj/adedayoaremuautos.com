"use client";

import { useState } from "react";
import Image from "next/image";
import { canResize } from "@/lib/photo";

/**
 * One car a partner can send someone, ready to share from a phone.
 *
 * The message is written for them — the car, the price, a link that lands
 * on that car's page with their code attached, and the line saying they are
 * paid for referrals (src/lib/referral.ts). WhatsApp and Text open the
 * phone's own app with it filled in; Copy is there for everything else.
 * Nothing is sent from this site: the partner chooses who gets it.
 */
export function ShareCar({
  car,
  image,
  price,
  earn,
  message,
}: {
  car: string;
  image: string | null;
  /** "$300 a week" */
  price: string;
  /** "You earn $15 for each week they rent it" */
  earn: string;
  message: string;
}) {
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

  return (
    <li className="overflow-hidden rounded-xl border border-[#262626] bg-[#0d0d0d]">
      <div className="flex gap-3 p-3">
        {image ? (
          <Image
            src={image}
            alt=""
            width={96}
            height={80}
            unoptimized={!canResize(image)}
            className="h-20 w-24 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-[#1a1a1a] text-[#555]">
            <i className="fas fa-car" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{car}</p>
          <p className="mt-0.5 text-sm text-[#b4b4b4]">{price}</p>
          <p className="mt-1 text-sm font-medium text-[#4e9d76]">{earn}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-[#262626] text-sm">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] items-center justify-center gap-1.5 text-[#d4d4d4]"
        >
          <i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp
        </a>
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          className="flex min-h-[44px] items-center justify-center gap-1.5 border-x border-[#262626] text-[#d4d4d4]"
        >
          <i className="fas fa-comment-sms" aria-hidden="true" /> Text
        </a>
        <button
          type="button"
          onClick={copyMessage}
          className="flex min-h-[44px] items-center justify-center gap-1.5 text-[#d4d4d4]"
        >
          <i className="fas fa-copy" aria-hidden="true" /> {copy === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Read out by screen readers when it changes; the button's own label
          change is not announced. */}
      <p aria-live="polite" className={copy === "refused" ? "px-3 pb-3 text-xs text-[#e2c463]" : "sr-only"}>
        {copy === "copied"
          ? `Message about the ${car} copied.`
          : copy === "refused"
            ? "This browser won't let us copy. Use WhatsApp or Text instead."
            : ""}
      </p>
    </li>
  );
}
