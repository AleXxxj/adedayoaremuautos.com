import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and gates /admin.
 *
 * This is the `proxy` file convention — Next.js renamed `middleware` to `proxy`
 * and deprecated the old name. Same execution model, new filename and export.
 *
 * The redirect here is a first line of defence for user experience, not the
 * security boundary — proxy runs separately from render code and can be
 * bypassed in some deployment topologies. Every admin page and every server
 * action independently calls requireStaff().
 */
/**
 * Sends every visitor to one address.
 *
 * A site reachable at three hostnames is three sites as far as a search engine
 * is concerned, and the ranking earned is split between them. The vercel.app
 * address cannot be switched off — it is how Vercel addresses the deployment —
 * so the redirect has to happen here.
 *
 * Deliberately opt-in. If the canonical host is not actually resolving, this
 * turns a working site into a dead one for everybody at once, so it stays off
 * until CANONICAL_HOST_REDIRECT is set — after the DNS has been confirmed.
 *
 * Preview deployments are never redirected: each has its own hostname, and
 * sending them to production would make it impossible to review a branch.
 */
function canonicalRedirect(request: NextRequest): NextResponse | null {
  if (process.env.CANONICAL_HOST_REDIRECT !== "1") return null;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return null;

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return null;

  let canonical: URL;
  try {
    canonical = new URL(configured);
  } catch {
    return null;
  }

  // The host header carries the port; the canonical usually does not.
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!host || host === canonical.hostname.toLowerCase()) return null;
  if (host === "localhost" || host.endsWith(".local")) return null;

  const url = new URL(request.url);
  url.protocol = canonical.protocol;
  url.host = canonical.host;
  // 308 rather than 302: permanent, and it preserves the method, so a form
  // POST that lands on the wrong host is not silently turned into a GET.
  return NextResponse.redirect(url, 308);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cheap, and first — before any network call.
  const redirected = canonicalRedirect(request);
  if (redirected) return redirected;

  // The matcher now covers the whole site so the host check can run on every
  // request, but the session lookup is a round trip to Supabase and has no
  // business happening on a public page.
  if (!pathname.startsWith("/admin")) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() only reads the
  // cookie and can be spoofed, so it must not be used for an auth decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/admin/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except build output and files with an extension. The host check
  // has to see every request; /admin is still the only path that costs a
  // session lookup.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
