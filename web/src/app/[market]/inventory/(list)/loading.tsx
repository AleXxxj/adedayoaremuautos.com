import { ListSkeleton } from "@/components/app/Skeletons";

/**
 * Shown the moment "Buy" is tapped, until the list arrives.
 *
 * The list page lives in the `(list)` folder so this covers the list and
 * nothing else. A loading file directly in `inventory/` would also wrap each
 * car's page, and a page that starts by sending a loading screen can no
 * longer answer "404 Not Found" for a car that does not exist (the status is
 * sent before the car is looked up). The parentheses keep the folder out of
 * the address: this is still /us/inventory.
 */
export default function Loading() {
  return <ListSkeleton />;
}
