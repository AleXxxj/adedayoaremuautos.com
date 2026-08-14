import { asc } from "drizzle-orm";
import { db } from "@/db";
import { rentalTiers } from "@/db/schema";
import { assertSection } from "@/lib/adminNav";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { TierList, type TierRow } from "@/components/admin/TierList";

export const dynamic = "force-dynamic";

/**
 * Rent-to-own categories.
 *
 * The prices here are the ones the public site publishes and the ones a
 * rental-purchase agreement will state, so the screen shows the consequence of
 * every change — how long a customer hires before the vehicle is theirs —
 * beside the rates rather than leaving it to be worked out.
 */
export default async function AdminTiersPage() {
  const user = await requireStaff();
  assertSection(user.role, "/admin/tiers");
  const markets = allowedMarkets(user);

  const rows = await db
    .select()
    .from(rentalTiers)
    .orderBy(asc(rentalTiers.marketCode), asc(rentalTiers.position));

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Rent to Own categories</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Rates and the total rent at which a vehicle becomes the customer&rsquo;s.
            Changes appear on the public site immediately.
          </p>
        </div>

        {markets.map((m) => (
          <TierList
            key={m}
            market={m}
            tiers={rows.filter((r) => r.marketCode === m) as TierRow[]}
          />
        ))}
      </div>
    </AdminChrome>
  );
}
