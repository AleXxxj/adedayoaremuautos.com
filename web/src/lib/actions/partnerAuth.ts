"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { partnerByAgreementToken } from "@/lib/partner";

export interface AuthResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Turns an accepted agreement into an account.
 *
 * The agreement token is what authorises this, which is why there is no email
 * field on the form: the address comes from the application the partner filled
 * in and the owner approved. A form that accepted an email would let whoever
 * holds the link attach the account to an address of their choosing, and the
 * token travels by email precisely so that holding it proves control of that
 * inbox.
 *
 * Created with `email_confirm: true` rather than sending a confirmation. The
 * partner has already proved they read that inbox — the link they are standing
 * on arrived in it — and a second round trip is one more thing to go missing.
 *
 * Ten characters, the same floor as staff. These accounts see customer-facing
 * figures and a partner's own earnings; six letters is not a password for that.
 */
export async function createPartnerAccount(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const partner = await partnerByAgreementToken(token);
  if (!partner) {
    return { error: "This link is no longer valid. Please contact us." };
  }
  if (partner.status !== "active" || !partner.agreedAt) {
    return { error: "The agreement has not been accepted yet." };
  }
  if (!partner.email) {
    return { error: "There is no email address on your account. Please call us." };
  }
  if (partner.userId) {
    return {
      error: "You already have an account. Sign in with your email and password.",
    };
  }

  if (password.length < 10) {
    return { fieldErrors: { password: ["Use at least 10 characters."] } };
  }
  if (password !== confirm) {
    return { fieldErrors: { confirm: ["Those two passwords do not match."] } };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: partner.email,
    password,
    email_confirm: true,
    user_metadata: { partner_code: partner.code },
  });

  if (error || !data.user) {
    // The likeliest cause by far: this email is already a Supabase user —
    // a member of staff, or a partner who applied twice under one address.
    console.error("[partner] account creation failed", error);
    return {
      error:
        "Could not create the account with that email address. Please call us and we will set it up.",
    };
  }

  try {
    await db
      .update(referralPartners)
      .set({
        userId: data.user.id,
        accountCreatedAt: new Date(),
        // Spent. The agreement link has done both of its jobs — showing the
        // terms and opening the account — and leaving a working bearer token
        // in an old email is a credential nobody is watching.
        agreementToken: null,
      })
      .where(eq(referralPartners.id, partner.id));
  } catch (e) {
    /*
     * The auth user exists and the link does not. Rather than leave an
     * orphaned account that blocks every future attempt with this address,
     * the account is removed so the partner can try again.
     */
    console.error("[partner] could not link account, removing auth user", e);
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { error: "Could not finish setting up your account. Please try again." };
  }

  // Signed in straight away. Asking somebody to type the password they just
  // chose into a login form is a step that exists for the system's benefit.
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: partner.email, password });

  revalidatePath("/partner", "layout");
  redirect("/partner");
}

export async function partnerSignIn(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague, as on the staff side: distinguishing "no such user"
    // from "wrong password" lets somebody enumerate which addresses have
    // accounts.
    return { error: "Incorrect email or password." };
  }

  revalidatePath("/partner", "layout");
  redirect("/partner");
}

export async function partnerSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/partner", "layout");
  redirect("/partner/login");
}
