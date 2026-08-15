"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff, auditLog } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/feeds/inventory";

/**
 * Builds the link an owner actually hands over.
 *
 * Not the `action_link` Supabase returns. That one points at Supabase's own
 * verify endpoint, which redirects to the project's Site URL — a dashboard
 * field that said `http://localhost:3000`, so invitations arrived at the
 * public homepage with no way to choose a password. The token is the useful
 * part; where it is redeemed is this application's decision.
 */
function inviteLinkFor(
  hashedToken: string,
  type: "invite" | "recovery",
): string {
  const url = new URL("/auth/invite", siteUrl());
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", type);
  return url.toString();
}

export interface StaffResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** The one-time link to hand to the new colleague. Never stored. */
  inviteLink?: string;
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("That email does not look right"),
  fullName: z.string().trim().min(2, "Give their name").max(120),
  role: z.enum(["owner", "manager", "sales"], { message: "Choose a role" }),
  marketScope: z.enum(["all", "us", "ng"]),
});

/**
 * Only an owner may change who can get in.
 *
 * Managers run the day; they do not decide who has keys. Keeping this to one
 * role means a compromised manager account cannot quietly grant itself help.
 */
async function requireOwner() {
  const user = await requireStaff();
  if (user.role !== "owner") {
    throw new Error("Only an owner can manage staff access.");
  }
  return user;
}

/**
 * Invites a colleague.
 *
 * Two records are needed and both are created here: a Supabase auth user, and
 * the `staff` row that actually grants access. Having an auth account alone
 * does nothing — requireStaff() checks for an active staff row as a separate
 * gate — which is what stops a stray signup ever reaching the admin.
 *
 * No password is chosen for them and none is ever displayed. Supabase returns
 * a one-time link, the new person sets their own password through it, and
 * nobody else ever knows it. The link is handed back to the owner to pass on
 * rather than emailed, so this works whether or not the project has SMTP
 * configured — and the owner can send it by whatever channel they already
 * trust.
 */
export async function inviteStaff(
  _prev: StaffResult | null,
  formData: FormData,
): Promise<StaffResult> {
  const actor = await requireOwner();

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const v = parsed.data;

  const [existing] = await db.select().from(staff).where(eq(staff.email, v.email));
  if (existing) {
    return {
      ok: false,
      fieldErrors: {
        email: [
          existing.isActive
            ? "That address already has access."
            : "That address exists but is switched off — turn it back on below.",
        ],
      },
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email: v.email,
  });

  if (error || !data?.user) {
    // A duplicate here means an auth account exists without a staff row — the
    // state left behind if a previous invite half-completed.
    console.error("[staff] invite failed", error);
    return {
      ok: false,
      error:
        error?.message?.includes("already been registered")
          ? "That address already has a login but no access. Ask them to sign in once, then invite again."
          : "Could not create the invitation. Please try again.",
    };
  }

  try {
    await db.insert(staff).values({
      id: data.user.id,
      email: v.email,
      fullName: v.fullName,
      role: v.role,
      marketScope: v.marketScope === "all" ? null : v.marketScope,
      isActive: true,
    });
  } catch (e) {
    // Leaving an auth user with no staff row would be a login that goes
    // nowhere, so it is removed rather than left dangling.
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
    console.error("[staff] staff row failed", e);
    return { ok: false, error: "Could not save the staff record. Nothing was changed." };
  }

  await db.insert(auditLog).values({
    actorId: actor.id,
    actorEmail: actor.email,
    entity: "staff",
    entityId: data.user.id,
    action: "invite",
    diff: { email: v.email, role: v.role, marketScope: v.marketScope } as never,
  });

  revalidatePath("/admin/staff");
  const hashed = data.properties?.hashed_token;
  return {
    ok: true,
    inviteLink: hashed ? inviteLinkFor(hashed, "invite") : undefined,
  };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["owner", "manager", "sales"]).optional(),
  marketScope: z.enum(["all", "us", "ng"]).optional(),
});

export async function updateStaff(
  _prev: StaffResult | null,
  formData: FormData,
): Promise<StaffResult> {
  const actor = await requireOwner();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Nothing to change." };
  const v = parsed.data;

  const [target] = await db.select().from(staff).where(eq(staff.id, v.id));
  if (!target) return { ok: false, error: "That person no longer exists." };

  // An owner demoting themselves could leave the business with nobody able to
  // manage access at all.
  if (target.id === actor.id && v.role && v.role !== "owner") {
    return { ok: false, error: "You cannot change your own role." };
  }

  await db
    .update(staff)
    .set({
      ...(v.role ? { role: v.role } : {}),
      ...(v.marketScope
        ? { marketScope: v.marketScope === "all" ? null : v.marketScope }
        : {}),
    })
    .where(eq(staff.id, v.id));

  await db.insert(auditLog).values({
    actorId: actor.id,
    actorEmail: actor.email,
    entity: "staff",
    entityId: v.id,
    action: "update",
    diff: { role: v.role, marketScope: v.marketScope } as never,
  });

  revalidatePath("/admin/staff");
  return { ok: true };
}

/**
 * Switches access on or off.
 *
 * Deactivating rather than deleting: the person appears on deals, audit rows
 * and recorded payments, and removing them would leave that history pointing
 * at nobody. An inactive row fails requireStaff() on the next request, so
 * access ends immediately either way.
 */
export async function setStaffActive(
  _prev: StaffResult | null,
  formData: FormData,
): Promise<StaffResult> {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return { ok: false, error: "Nothing to do." };

  if (id === actor.id && !active) {
    return { ok: false, error: "You cannot switch off your own access." };
  }

  const [target] = await db.select().from(staff).where(eq(staff.id, id));
  if (!target) return { ok: false, error: "That person no longer exists." };

  // The last active owner must keep access, or nobody can ever restore anyone.
  if (!active && target.role === "owner") {
    const owners = await db.select().from(staff).where(eq(staff.role, "owner"));
    if (owners.filter((o) => o.isActive).length <= 1) {
      return { ok: false, error: "This is the last active owner. Promote someone else first." };
    }
  }

  await db.update(staff).set({ isActive: active }).where(eq(staff.id, id));

  await db.insert(auditLog).values({
    actorId: actor.id,
    actorEmail: actor.email,
    entity: "staff",
    entityId: id,
    action: active ? "reactivate" : "deactivate",
    diff: { email: target.email } as never,
  });

  revalidatePath("/admin/staff");
  return { ok: true };
}

/** A fresh one-time link, for when the first was lost or has expired. */
export async function resendInvite(
  _prev: StaffResult | null,
  formData: FormData,
): Promise<StaffResult> {
  await requireOwner();
  const email = String(formData.get("email") ?? "");
  if (!email) return { ok: false, error: "Nothing to do." };

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("[staff] link failed", error);
    return { ok: false, error: "Could not create a new link." };
  }

  return { ok: true, inviteLink: inviteLinkFor(data.properties.hashed_token, "recovery") };
}
