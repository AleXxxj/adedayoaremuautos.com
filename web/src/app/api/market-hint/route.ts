import { NextResponse, type NextRequest } from "next/server";
import { isMarketCode } from "@/lib/market";
import { suggestMarket } from "@/lib/geo";

/**
 * The visitor's country, for the "you appear to be visiting from…" notice.
 *
 * This is a route rather than something the layout works out, and the reason
 * is the whole public site's resilience.
 *
 * Reading request headers anywhere in a layout opts that layout and every page
 * beneath it out of caching permanently. The market layout did exactly that,
 * so all twenty public pages were rebuilt from the database on every single
 * request — no cached copy existed anywhere, and a backend that was briefly
 * unreachable took the entire site down with it rather than serving the last
 * good render.
 *
 * The notice is a dismissible banner that already rendered nothing at all on
 * the server, so moving its one server-side input here costs nothing visible
 * and buys back caching for everything else.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const current = request.nextUrl.searchParams.get("market");
  if (!current || !isMarketCode(current)) {
    return NextResponse.json({ suggested: null });
  }

  const suggested = await suggestMarket(current);

  // Private: the answer depends on the caller's IP, so a shared cache holding
  // it would show one visitor's country to the next.
  return NextResponse.json(
    { suggested },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
