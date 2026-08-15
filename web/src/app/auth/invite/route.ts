import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Consumes an invitation or password-reset token.
 *
 * The obvious approach — hand out the `action_link` Supabase returns — sends
 * the new colleague to Supabase's own `/auth/v1/verify` endpoint, which then
 * bounces them to whatever the project's Site URL happens to be. That was
 * still `http://localhost:3000`, so every invitation landed on the public
 * homepage having quietly signed the person in with nowhere to set a password.
 *
 * Taking the `hashed_token` and verifying it here makes the destination this
 * application's decision. Nothing in the Supabase URL configuration has to be
 * right for an invitation to work.
 *
 * The route sits outside /admin on purpose: the proxy sends unauthenticated
 * /admin traffic to the login page, and the whole point of this request is
 * that the session does not exist yet.
 *
 * Cookies are written onto the response object rather than through
 * `cookies()`. That distinction is the whole bug in the first attempt:
 * mutations made through `cookies()` are merged into the response Next.js
 * builds for you, not into a `NextResponse.redirect()` you construct yourself.
 * The session was verified correctly and then thrown away one line later, so
 * /admin/set-password saw no session, the proxy sent it to /admin/login, and
 * the owner's own still-valid cookie meant the proxy bounced that to /admin —
 * landing on Inventory with no error anywhere. Hence "it just goes back to the
 * dashboard".
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const problem = (reason: string, detail?: string) => {
    const url = new URL("/auth/link-problem", origin);
    url.searchParams.set("reason", reason);
    if (detail) url.searchParams.set("detail", detail);
    return NextResponse.redirect(url);
  };

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return problem("bad_link");
  }

  // Built up front so the Supabase client can attach the new session to it.
  let response = NextResponse.redirect(new URL("/admin/set-password", origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    // Single-use and time-limited, so an expired or already-redeemed link is
    // the ordinary case — an owner sends one and it sits in a WhatsApp thread
    // for a week. The message is carried through rather than flattened into a
    // generic failure, because "already used" and "not valid" need different
    // responses from whoever is holding the link.
    console.error("[auth] invite verify failed", error.message);
    return problem("rejected", error.message);
  }

  return response;
}
