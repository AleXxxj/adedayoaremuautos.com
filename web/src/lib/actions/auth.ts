"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signIn(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin/vehicles");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: distinguishing "no such user" from "wrong password"
    // lets an attacker enumerate which emails have accounts.
    return { error: "Incorrect email or password." };
  }

  revalidatePath("/admin", "layout");
  redirect(next.startsWith("/admin") ? next : "/admin/vehicles");
}

/**
 * Sets the password on an account that arrived through an invitation.
 *
 * Requires an existing session — the invite route establishes one by verifying
 * the token — so this cannot be used to change a stranger's password: without
 * the token there is no session, and Supabase applies the change to whoever
 * the session belongs to rather than to an email named in the form.
 *
 * Ten characters rather than Supabase's default six. Every one of these
 * accounts can see customer names, phone numbers and finance applications, so
 * the floor should not be four letters and a digit.
 */
export async function setPassword(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    return { error: "Use at least 10 characters." };
  }
  if (password !== confirm) {
    return { error: "Those two passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // The likeliest cause is a session that expired while the form sat open,
    // which needs a fresh link rather than another attempt.
    return {
      error:
        error.message ||
        "Could not set the password. Ask for a fresh invitation link.",
    };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}
