import { ListSkeleton } from "@/components/app/Skeletons";

/**
 * Shown the moment "Rent" is tapped, until the list arrives. Why the list
 * page sits in a `(list)` folder: see inventory/(list)/loading.tsx.
 */
export default function Loading() {
  return <ListSkeleton />;
}
