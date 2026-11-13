import type { Metadata, Viewport } from "next";
import { inter, fraunces, spaceGrotesk } from "@/lib/fonts";
import { siteUrl } from "@/lib/siteUrl";
import { AppSplash } from "@/components/app/AppSplash";
import { NavProgress } from "@/components/app/NavProgress";
import { ServiceWorker } from "@/components/app/ServiceWorker";
import "./globals.css";

/**
 * `metadataBase` is load-bearing, not decoration.
 *
 * Without it Next emits every canonical as a relative path — the live site was
 * serving `<link rel="canonical" href="/us">`. A canonical URL is a statement
 * about which absolute address is the real one, so a relative one answers the
 * wrong question, and a search engine resolving it against whichever host it
 * happened to crawl is exactly the ambiguity the tag exists to remove. It also
 * silently broke every Open Graph image URL, which must be absolute to render
 * in a link preview.
 *
 * The title template puts the business name on every result in a search page
 * rather than only on the homepage, which is what a person scanning for
 * "Adedayo Aremu Autos" is looking for.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Adedayo Aremu Autos | Buy, Rent, Rent-to-Own & Finance Cars",
    template: "%s | Adedayo Aremu Autos",
  },
  description:
    "Adedayo Aremu Autos sells, rents and finances quality vehicles in Greensboro, North Carolina and across Nigeria. Browse stock, book a rental, or apply for rent-to-own.",
  applicationName: "Adedayo Aremu Autos",
  keywords: [
    "Adedayo Aremu Autos",
    "Adedayo Aremu",
    "Aremu Autos",
    "Adedayo Autos",
    "car dealership Greensboro NC",
    "car rental Greensboro",
    "rent to own cars",
    "cars for sale Nigeria",
  ],
  openGraph: {
    siteName: "Adedayo Aremu Autos",
    type: "website",
  },
  // For an iPhone's "Add to Home Screen": the name under the icon, and the
  // page drawn under the status bar as in an app. Android reads the manifest
  // (manifest.ts) instead.
  appleWebApp: {
    capable: true,
    title: "Adedayo Autos",
    statusBarStyle: "black-translucent",
  },
};

/**
 * The color of the phone's status bar and of the installed app's title area:
 * the page background (--surface-0), so the header runs to the top edge with
 * no band of another color above it.
 */
export const viewport: Viewport = { themeColor: "#070C0A" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Dark is the default theme; the toggle swaps this attribute.
    // suppressHydrationWarning: the splash script (AppSplash) sets an
    // attribute on this element before React starts. It covers this one
    // element's attributes only, nothing inside it.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${spaceGrotesk.variable}`}
    >
      <body>
        {/* First, so it is on screen before anything else is parsed. */}
        <AppSplash />
        <NavProgress />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
