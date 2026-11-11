/**
 * Whether a photo can go through Next's image resizer.
 *
 * Only this site's own files and the Supabase vehicles bucket are allowed
 * (images.remotePatterns in next.config.ts). Anything else — an absolute URL
 * carried over from the old site, say — is shown as it is rather than
 * refused, because a refused photo is a broken picture on a listing.
 */
export function canResize(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return !src.includes("?");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    !!base &&
    src.startsWith(`${base}/storage/v1/object/public/vehicles/`) &&
    !src.includes("?")
  );
}
