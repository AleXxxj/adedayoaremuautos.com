import { GuidesSkeleton } from "@/components/app/Skeletons";

/**
 * For the guides list. The page is built ahead of time, so this is seen only
 * on a slow connection, before the page has been fetched in the background.
 *
 * In a `(list)` folder so it does not also wrap each guide: with a loading
 * screen above it, an address for a guide that does not exist answered
 * "200 OK" instead of 404 (measured). The reasons are in
 * inventory/(list)/loading.tsx. Each guide is also built ahead of time and
 * opens without a loading screen.
 */
export default function Loading() {
  return <GuidesSkeleton />;
}
