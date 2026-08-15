import { requireStaff } from "@/lib/auth";
import { SetPasswordForm } from "@/components/admin/SetPasswordForm";

export const dynamic = "force-dynamic";

/**
 * Where an invitation actually lands.
 *
 * requireStaff() is the gate rather than a bare session check: verifying the
 * token signs someone in, but access to the admin still depends on an active
 * `staff` row. Anyone who reaches here with a valid token but no such row is
 * signed straight back out, exactly as on every other admin screen.
 */
export default async function SetPasswordPage() {
  const user = await requireStaff();

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight">
            {user.fullName ? `Welcome, ${user.fullName.split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Choose a password for <strong>{user.email}</strong>. You will use it
            with this address every time you sign in.
          </p>
        </div>
        <SetPasswordForm />
      </div>
    </div>
  );
}
