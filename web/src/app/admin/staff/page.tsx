import { redirect } from "next/navigation";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { landingFor } from "@/lib/adminNav";
import { AdminChrome } from "../layout";
import { StaffManager, type StaffRow } from "@/components/admin/StaffManager";

export const dynamic = "force-dynamic";

/**
 * Who can sign in.
 *
 * Owner only, checked here rather than relying on the navigation hiding it —
 * this is the screen that hands out access, so it is the last place to trust a
 * menu. A manager who reaches for it is sent to their own landing page rather
 * than shown an error; they have done nothing wrong.
 */
export default async function AdminStaffPage() {
  const user = await requireStaff();
  if (user.role !== "owner") redirect(landingFor(user.role));

  const rows = await db
    .select()
    .from(staff)
    .orderBy(desc(staff.isActive), asc(staff.email));

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Staff access</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Signing in needs both a login and an active record here, so removing
            someone&rsquo;s access takes effect on their next click.
          </p>
        </div>

        <StaffManager people={rows as StaffRow[]} selfId={user.id} />
      </div>
    </AdminChrome>
  );
}
