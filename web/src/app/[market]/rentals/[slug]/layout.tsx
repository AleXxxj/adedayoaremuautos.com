import { notFound } from "next/navigation";
import { isMarketCode } from "@/lib/market";
import { getFleetVehicle } from "@/lib/repositories/rentals";

/**
 * Checks the rental car exists before anything is sent, so a car that is
 * gone still answers with a real 404 even though this folder has a loading
 * screen. The reasons are in inventory/[slug]/layout.tsx.
 */
export default async function RentalCarGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market, slug } = await params;
  if (!isMarketCode(market)) notFound();
  if (!(await getFleetVehicle(market, slug))) notFound();
  return children;
}
