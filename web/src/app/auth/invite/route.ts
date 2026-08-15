import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Consumes an invitation or password-reset token.
 *
 * The obvious approach — hand out the `action_link` Supabase returns — sends
 * the new colleague to Supabase's own `/auth/v1/verify` endpoint, which then
 * bounces them to whatever the project's Site URL happens to be. That was
 * still `http://localhost:3000`, so every invitation landed on the public
 * homepage having quietly signed the person in with nowhere to set a password.
 *
 * This route takes the `hashed_token` instead and verifies it here, so the
 * destination is decided by this application rather than by a dashboard field
 * that nobody remembers to change. Nothing in the Supabase URL configuration
 * has to be right for an invitation to work.
 *
 * It sits outside /admin on purpose: the proxy sends unauthenticated /admin
 * traffic to the login page, and the whole point of this request is that the
 * session does not exist yet.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/admin/login?error=${reason}`, origin));

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return fail("bad_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  // These links are single-use and time-limited. Expired is the common case —
  // an owner sends one, it sits in a WhatsApp thread for a week — so it is
  // worth telling people that rather than showing a generic failure.
  if (error) return fail("link_expired");

  return NextResponse.redirect(new URL("/admin/set-password", origin));
}
