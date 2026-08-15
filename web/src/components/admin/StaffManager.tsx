"use client";

import { useActionState, useState } from "react";
import {
  inviteStaff,
  updateStaff,
  setStaffActive,
  resendInvite,
  type StaffResult,
} from "@/lib/actions/staff";

export interface StaffRow {
  id: string;
  email: string;
  fullName: string | null;
  role: "owner" | "manager" | "sales";
  marketScope: "us" | "ng" | null;
  isActive: boolean;
}

const ROLE_NOTE: Record<string, string> = {
  owner: "Everything, including staff access and pricing",
  manager: "Everything except who can sign in",
  sales: "Inventory, enquiries, deals and rentals",
};

/** The link is shown once and never stored, so copying it is the whole job. */
function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-4">
      <p className="text-sm font-semibold text-[var(--success)]">
        Invitation ready — send this link to them
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        It lets them set their own password. Nobody else ever sees it, so send
        it by WhatsApp or email and do not post it anywhere shared. It works
        once.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-xs">
          {link}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              /* Shown on screen either way. */
            }
          }}
          className="rounded-lg bg-[var(--cta-bg)] px-4 py-2 text-sm font-semibold text-[var(--cta-fg)]"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

function InviteForm() {
  const [state, action, pending] = useActionState<StaffResult | null, FormData>(
    inviteStaff,
    null,
  );
  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <section className="mb-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <h2 className="mb-1 text-lg font-semibold">Invite someone</h2>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        They set their own password from the link. You never handle it.
      </p>

      {state?.error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      {state?.ok && state.inviteLink && <InviteLink link={state.inviteLink} />}

      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Full name</span>
          <input name="fullName" required className={input} placeholder="Chidi Okafor" />
          {err("fullName") && <Err>{err("fullName")}</Err>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input name="email" type="email" required className={input} />
          {err("email") && <Err>{err("email")}</Err>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Role</span>
          <select name="role" defaultValue="sales" className={input}>
            <option value="sales">Sales</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            Sales: {ROLE_NOTE.sales}.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Market</span>
          <select name="marketScope" defaultValue="all" className={input}>
            <option value="all">Both markets</option>
            <option value="us">United States only</option>
            <option value="ng">Nigeria only</option>
          </select>
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--cta-bg)] px-6 py-2.5 font-semibold text-[var(--cta-fg)] disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create invitation"}
          </button>
        </div>
      </form>
    </section>
  );
}

function StaffCard({ person, isSelf }: { person: StaffRow; isSelf: boolean }) {
  const [toggleState, toggle, toggling] = useActionState<StaffResult | null, FormData>(
    setStaffActive,
    null,
  );
  const [roleState, changeRole, changing] = useActionState<StaffResult | null, FormData>(
    updateStaff,
    null,
  );
  const [linkState, resend, resending] = useActionState<StaffResult | null, FormData>(
    resendInvite,
    null,
  );

  const error = toggleState?.error ?? roleState?.error ?? linkState?.error;

  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong>{person.fullName ?? person.email}</strong>
        {isSelf && <span className="text-xs text-[var(--text-muted)]">(you)</span>}
        <span
          className={`ml-auto text-xs font-semibold uppercase tracking-wide ${
            person.isActive ? "text-[var(--success)]" : "text-[var(--text-muted)]"
          }`}
        >
          {person.isActive ? "Active" : "Switched off"}
        </span>
      </div>

      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {person.email} · {person.marketScope ? person.marketScope.toUpperCase() : "Both markets"}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{ROLE_NOTE[person.role]}</p>

      {error && (
        <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {linkState?.ok && linkState.inviteLink && (
        <div className="mt-3">
          <InviteLink link={linkState.inviteLink} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={changeRole} className="flex items-center gap-2">
          <input type="hidden" name="id" value={person.id} />
          <select
            name="role"
            defaultValue={person.role}
            disabled={isSelf || changing}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="sales">Sales</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
          <button
            type="submit"
            disabled={isSelf || changing}
            className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm disabled:opacity-60"
          >
            Save role
          </button>
        </form>

        <form action={resend}>
          <input type="hidden" name="email" value={person.email} />
          <button
            type="submit"
            disabled={resending}
            className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm disabled:opacity-60"
          >
            {resending ? "Creating…" : "New password link"}
          </button>
        </form>

        <form action={toggle}>
          <input type="hidden" name="id" value={person.id} />
          <input type="hidden" name="active" value={person.isActive ? "false" : "true"} />
          <button
            type="submit"
            disabled={isSelf || toggling}
            className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-60 ${
              person.isActive
                ? "border-[var(--danger)]/50 text-[var(--danger)]"
                : "border-[var(--success)]/50 text-[var(--success)]"
            }`}
          >
            {person.isActive ? "Switch off access" : "Switch access back on"}
          </button>
        </form>
      </div>
    </article>
  );
}

export function StaffManager({
  people,
  selfId,
}: {
  people: StaffRow[];
  selfId: string;
}) {
  return (
    <>
      <InviteForm />
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Everyone with access
      </h2>
      <div className="space-y-3">
        {people.map((p) => (
          <StaffCard key={p.id} person={p} isSelf={p.id === selfId} />
        ))}
      </div>
    </>
  );
}

const input =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]";

function Err({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-sm text-[var(--danger)]">{children}</span>;
}
