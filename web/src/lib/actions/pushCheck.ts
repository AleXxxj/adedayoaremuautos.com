"use server";

import { createECDH } from "node:crypto";
import webpush from "web-push";
import { requireStaff } from "@/lib/auth";

export interface KeyReport {
  name: string;
  present: boolean;
  /** Length after cleaning, against what the key should be. */
  length: number;
  expected: number;
  /** What is wrong with it, in words an owner can act on. */
  problem?: string;
}

export interface PushCheckResult {
  ok: boolean;
  keys: KeyReport[];
  /** Whether the two keys are actually a matching pair. */
  pairValid?: boolean;
  pairError?: string;
  advice?: string;
}

/**
 * The same tidy-up the browser does, so both ends agree about what the key is.
 * A value pasted into a hosting dashboard arrives with a trailing newline, or
 * quotes, or the variable name in front of it more often than it arrives clean.
 */
function clean(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^[A-Z0-9_]+=/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");
}

function inspect(name: string, raw: string | undefined, expected: number): KeyReport {
  const original = raw ?? "";
  const value = clean(raw);
  const report: KeyReport = {
    name,
    present: value.length > 0,
    length: value.length,
    expected,
  };

  if (!report.present) {
    report.problem = "Not set on the server at all.";
    return report;
  }
  // Reported even though both ends now cope with it, because the person
  // looking at this screen can fix the cause in a minute and should.
  if (original !== value) {
    report.problem =
      "Has extra characters around it — a newline, quotes, or the variable name pasted with the value. It still works, but it is worth re-pasting cleanly.";
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    report.problem = "Contains characters that are not part of a key.";
  } else if (value.length !== expected) {
    report.problem =
      value.length < expected
        ? `Too short — ${value.length} characters where a key is ${expected}. It was probably cut off when copied.`
        : `Too long — ${value.length} characters where a key is ${expected}.`;
  }
  return report;
}

/**
 * Checks the notification keys and says precisely what is wrong.
 *
 * The same idea as the lead-alert and assistant checks: a customer-facing
 * failure here is deliberately quiet — a visitor just sees a button that does
 * not work — so the business needs somewhere to ask the question directly.
 *
 * The pair test is the part that matters. Two keys can each look perfectly
 * well formed and still not belong together, and nothing reveals that until a
 * real send is refused by Google with a 401.
 */
export async function checkPushKeys(): Promise<PushCheckResult> {
  await requireStaff();

  const publicKey = inspect(
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    87,
  );
  const privateKey = inspect("VAPID_PRIVATE_KEY", process.env.VAPID_PRIVATE_KEY, 43);
  const keys = [publicKey, privateKey];

  if (!publicKey.present || !privateKey.present) {
    return {
      ok: false,
      keys,
      advice:
        "Add the missing value in Vercel under Settings → Environment Variables, then redeploy. The public key is built into the pages, so adding it alone is not enough.",
    };
  }

  /*
   * Whether the two keys actually belong together.
   *
   * web-push's own setVapidDetails is not the test for this. It checks that
   * each key is the right length and shape and nothing more — handed a public
   * key from one pair and a private key from another it raises no objection,
   * which was confirmed rather than assumed. A checker that reported "matching
   * pair" on the strength of it would be stating something it had not looked
   * at, and mismatched keys are a real way to arrive here: generate a fresh
   * pair, paste one of the two, leave the other.
   *
   * So the public key is derived from the private one and compared. On P-256
   * the private key is a scalar and the public key is that scalar times the
   * curve's base point, so this either matches or the keys are unrelated.
   */
  let pairValid = true;
  let pairError: string | undefined;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(clean(process.env.VAPID_PRIVATE_KEY), "base64url"));
    const derived = ecdh.getPublicKey("base64url");
    if (derived !== clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)) {
      pairValid = false;
      pairError =
        "The public key does not correspond to the private key — they are from different pairs.";
    }
  } catch (e) {
    pairValid = false;
    pairError = e instanceof Error ? e.message : String(e);
  }

  // Shape check too, since a key can fail this while deriving fine.
  if (pairValid) {
    try {
      webpush.setVapidDetails(
        `mailto:${process.env.PUSH_CONTACT_EMAIL?.trim() || "info@adedayoaremuautos.com"}`,
        clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
        clean(process.env.VAPID_PRIVATE_KEY),
      );
    } catch (e) {
      pairValid = false;
      pairError = e instanceof Error ? e.message : String(e);
    }
  }

  const badKey = keys.find((k) => k.problem && k.length !== k.expected);

  return {
    ok: pairValid && !badKey,
    keys,
    pairValid,
    pairError,
    advice: !pairValid
      ? "These two are not a matching pair. Re-paste both from the same source — a public key from one pair and a private key from another will never work together."
      : badKey
        ? "Re-copy that value and paste it again in Vercel, then redeploy."
        : undefined,
  };
}
