import Link from "next/link";
import { signOut } from "@/lib/actions/auth";

export const metadata = { title: "Admin — Adedayo Aremu Autos" };

/**
 * The login page renders inside this layout too, so the guard cannot live here
 * — it would redirect-loop. Each admin page calls requireStaff() itself, which
 * is the stronger arrangement anyway: authorisation sits next to the data
 * access it protects rather than in a wrapper someone might route around.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[var(--surface-0)]">{children}</div>;
}

export function AdminChrome({
  email,
  role,
  children,
}: {
  email: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/admin/vehicles" className="text-sm font-semibold">
            AAA <span className="text-[var(--brand-400)]">Admin</span>
          </Link>

          <nav className="flex gap-4 text-sm text-[var(--text-secondary)]">
            <Link href="/admin/vehicles" className="hover:text-[var(--text-primary)]">
              Inventory
            </Link>
            <Link href="/admin/leads" className="hover:text-[var(--text-primary)]">
              Leads
            </Link>
            <Link href="/admin/deals" className="hover:text-[var(--text-primary)]">
              Deals
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-[var(--text-muted)]">
              {email} · {role}
            </span>
            <Link
              href="/us"
              className="text-[var(--link)] hover:underline"
              target="_blank"
            >
              View site
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 hover:bg-[var(--surface-2)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
