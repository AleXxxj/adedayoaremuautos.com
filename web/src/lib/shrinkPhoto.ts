/**
 * Makes a phone photo small enough to send, in the browser, before it leaves.
 *
 * Why this exists: Vercel refuses any request body over 4.5 MB, and it does so
 * before our code runs — `serverActions.bodySizeLimit` in next.config.ts cannot
 * raise it, and no server-side check ever sees the file. Measured on the live
 * site in November 2026: a 4 MB request reached the app, a 5 MB one came back
 * `413 FUNCTION_PAYLOAD_TOO_LARGE`. The rental form sends a license photo and,
 * by default, an insurance photo in one request; the two real license photos
 * on file were 2.4 MB and 3.4 MB. So a renter's two ordinary photos added up to
 * more than the platform accepts, Next.js threw on the client, and the renter
 * landed on an error page with the form wiped — every time they retried.
 *
 * What it does: decodes the image (applying its EXIF rotation, because the
 * canvas drops the tag and a sideways license is no use to anyone), scales it
 * to at most `maxPixels`, and re-encodes it as JPEG. A 12-megapixel photo comes
 * out around 0.3–0.6 MB with its text still readable, and HEIC from an iPhone
 * becomes a JPEG staff can open in any browser.
 *
 * What it never does: touch a PDF, or fail. It does not make a file bigger
 * either, except to turn a type the server refuses into a JPEG it accepts.
 * Anything it cannot decode (HEIC in Chrome, a corrupt file, a phone too short
 * of memory for a huge image) comes back unchanged, and the caller's size
 * check decides.
 *
 * Browser only: it needs a canvas. Import it from client components.
 */

/** What one request may carry in total, leaving headroom under Vercel's 4.5 MB. */
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

/** The limit as people read it; the server's own messages say "4 MB" too. */
export const UPLOAD_LIMIT_LABEL = "4 MB";

export interface ShrinkOptions {
  /** Width × height ceiling. Area rather than a long edge, so a tall phone
   *  screenshot keeps the width its text needs. */
  maxPixels: number;
  /** JPEG quality, 0–1. */
  quality: number;
  /** Already-small JPEG/PNG/WebP files below this are sent as they are. */
  leaveBelowBytes: number;
  /**
   * Types the server takes as they are. Only these may be sent unconverted
   * when the JPEG copy would come out larger; anything else (a small AVIF or
   * GIF screenshot, say) is sent as the JPEG, because the original would be
   * refused.
   */
  acceptedAsIs: ReadonlySet<string>;
}

/** Licenses and insurance cards: readable text, about 4 megapixels. */
export const DOCUMENT_PHOTO: ShrinkOptions = {
  maxPixels: 4_000_000,
  quality: 0.85,
  leaveBelowBytes: 700 * 1024,
  // What storeLicence in src/lib/licence.ts recognizes by its bytes.
  acceptedAsIs: new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
};

/** Listing photos: shown large in the gallery, so a little more detail. */
export const LISTING_PHOTO: ShrinkOptions = {
  maxPixels: 6_000_000,
  quality: 0.86,
  leaveBelowBytes: 1_500 * 1024,
  acceptedAsIs: new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]),
};

/** Types every browser can show as they are, so small ones are left alone. */
const WEB_READY = new Set(["image/jpeg", "image/png", "image/webp"]);

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: no createImageBitmap for this file or option. An <img>
    // applies EXIF rotation by default and decodes what the browser can show.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function shrinkPhoto(
  file: File,
  options: ShrinkOptions = DOCUMENT_PHOTO,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file; // PDFs and anything else
  if (WEB_READY.has(file.type) && file.size <= options.leaveBelowBytes) return file;

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    return file;
  }

  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!width || !height) return file;

  const scale = Math.min(1, Math.sqrt(options.maxPixels / (width * height)));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  // JPEG has no transparency; without a fill a transparent PNG turns black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", options.quality),
  );
  if (!blob) return file;
  // Never send something bigger than what the person chose — unless what
  // they chose is a type the server would refuse, when the JPEG is the only
  // version that can get through.
  if (blob.size >= file.size && options.acceptedAsIs.has(file.type)) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

/**
 * "3.4 MB" — for messages, not for storage.
 *
 * Rounded up, so a file just over the limit never prints the same as the
 * limit ("4.0 MB is over the 4 MB limit" reads as a contradiction).
 */
export function megabytes(bytes: number): string {
  return `${(Math.ceil((bytes / (1024 * 1024)) * 10) / 10).toFixed(1)} MB`;
}
