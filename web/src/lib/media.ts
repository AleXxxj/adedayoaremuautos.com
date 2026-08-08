/**
 * Resolves a stored media key to a URL.
 *
 * Keys beginning with "/" are local files in public/ (useful before Supabase
 * Storage is wired up). Everything else is treated as a Storage object path.
 */
const BUCKET = "vehicles";

export function mediaUrl(storageKey: string): string {
  if (storageKey.startsWith("/") || storageKey.startsWith("http")) {
    return storageKey;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return storageKey;

  return `${base}/storage/v1/object/public/${BUCKET}/${storageKey}`;
}
