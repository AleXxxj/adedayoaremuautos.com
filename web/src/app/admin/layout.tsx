import Link from "next/link";
import "@/styles/admin.css";
import { signOut } from "@/lib/actions/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { navFor } from "@/lib/adminNav";
import type { Staff } from "@/lib/auth";

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
  const items = navFor(role as Staff["role"]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-inner">
          <Link href="/admin" className="admin-brand">
            AAA <span>Admin</span>
          </Link>

          <AdminNav items={items} email={email} role={role} />

          <div className="admin-header-end">
            <span className="admin-who admin-who--wide">
              {email} · {role}
            </span>
            <Link href="/us" className="admin-view-site" target="_blank">
              <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
              <span>View site</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className="admin-signout">
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
