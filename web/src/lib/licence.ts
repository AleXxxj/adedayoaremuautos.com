import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const LICENCE_BUCKET = "licences";

/** Generous enough for a phone photo, small enough to refuse a video. */
export const MAX_LICENCE_BYTES = 8 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/**
 * The first bytes of a file, which is what it actually is.
 *
 * A browser's reported MIME type comes from the file extension and is trivially
 * wrong — rename anything to .jpg and it arrives as image/jpeg. Checking the
 * signature means an executable renamed to look like a photograph is refused
 * on the way in rather than sitting in the bucket waiting to be opened.
 */
const SIGNATURES: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]],
  // RIFF….WEBP — the container is checked, then the format tag at offset 8.
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
];

function sniff(bytes: Uint8Array): string | null {
  for (const [type, sig] of SIGNATURES) {
    if (sig.every((b, i) => bytes[i] === b)) {
      if (type === "image/webp") {
        const tag = String.fromCharCode(...bytes.slice(8, 12));
        return tag === "WEBP" ? "image/webp" : null;
      }
      return type;
    }
  }
  // HEIC/HEIF carry "ftyp" at offset 4 with a brand that varies by encoder.
  const ftyp = String.fromCharCode(...bytes.slice(4, 8));
  if (ftyp === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (/^(heic|heix|hevc|mif1|msf1|heim|hei)/.test(brand)) return "image/heic";
  }
  return null;
}

export interface LicenceUpload {
  ok: boolean;
  key?: string;
  error?: string;
}

/**
 * Stores a licence image in the private bucket.
 *
 * The filename the visitor supplied is discarded entirely. It is attacker-
 * controlled text that would otherwise become a storage path, and it commonly
 * carries the person's own name — which does not belong in a key that appears
 * in logs.
 */
export async function storeLicence(file: File): Promise<LicenceUpload> {
  if (file.size === 0) return { ok: false, error: "That file appears to be empty." };
  if (file.size > MAX_LICENCE_BYTES) {
    return { ok: false, error: "That file is too large — please keep it under 8MB." };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const actual = sniff(buffer.slice(0, 16));

  if (!actual || !ALLOWED.has(actual)) {
    return {
      ok: false,
      error: "Please upload a photo (JPG, PNG, WEBP or HEIC) or a PDF.",
    };
  }

  const ext = actual === "application/pdf" ? "pdf" : actual.split("/")[1];
  // Random, opaque, and dated only to the month — enough to find things when
  // deleting old files, not enough to enumerate a day's renters.
  const stamp = new Date().toISOString().slice(0, 7);
  const key = `${stamp}/${randomBytes(16).toString("hex")}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(LICENCE_BUCKET)
    .upload(key, buffer, { contentType: actual, upsert: false });

  if (error) {
    console.error("[licence] upload failed", error.message);
    return { ok: false, error: "We could not save that file. Please try again." };
  }

  return { ok: true, key };
}

/**
 * A link a member of staff can open, valid for a few minutes.
 *
 * Deliberately short. A signed URL is a bearer token for someone's identity
 * document: anyone holding it can open the file, so it should expire long
 * before it can be forwarded, pasted into a chat, or left in a browser history
 * that somebody else reads.
 */
export async function signedLicenceUrl(
  key: string,
  seconds = 180,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(LICENCE_BUCKET)
    .createSignedUrl(key, seconds);
  if (error) {
    console.error("[licence] signing failed", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
