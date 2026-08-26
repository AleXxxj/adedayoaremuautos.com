import type { Metadata } from "next";
import { inter, fraunces, spaceGrotesk } from "@/lib/fonts";
import { siteUrl } from "@/lib/siteUrl";
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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Dark is the default theme; the toggle swaps this attribute.
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${fraunces.variable} ${spaceGrotesk.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
