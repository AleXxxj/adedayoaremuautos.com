import { redirect } from "next/navigation";

/**
 * The root has no content of its own — every real page lives under a market.
 *
 * Defaulting to the US market rather than geolocating: the Greensboro office is
 * the primary business, and a wrong guess that silently redirects is worse than
 * a predictable default the visitor can change from the header.
 */
export default function RootPage() {
  redirect("/us");
}
