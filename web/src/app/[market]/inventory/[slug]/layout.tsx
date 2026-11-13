import { notFound } from "next/navigation";
import { isMarketCode } from "@/lib/market";
import { getVehicleBySlug } from "@/lib/repositories/vehicles";

/**
 * Checks the car exists before anything is sent.
 *
 * This folder has a loading screen (loading.tsx). Once a loading screen has
 * been sent the response is already "200 OK", so the page's own "no such car"
 * could no longer be a real 404: search engines would be told a deleted car's
 * address is a working page. A layout runs before its loading screen, so the
 * check here keeps the 404. The page looks the car up again for its details;
 * that is one extra small query per view.
 */
export default async function CarGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market, slug } = await params;
  if (!isMarketCode(market)) notFound();
  if (!(await getVehicleBySlug(market, slug))) notFound();
  return children;
}
