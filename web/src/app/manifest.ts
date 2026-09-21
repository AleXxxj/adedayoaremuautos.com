import type { MetadataRoute } from "next";

/**
 * The web app manifest.
 *
 * Its real job here is notifications on iPhones. Apple will not deliver web
 * push to a site open in a Safari tab — only to one the person has added to
 * their Home Screen — and Safari only offers a proper Home Screen app for a
 * site that ships a manifest. Without this, the iOS half of the audience has
 * no route to notifications at all.
 *
 * `start_url` points at the US market because a manifest is a single static
 * document and cannot vary by visitor. Anyone who lands on the wrong one is
 * offered the other by the country notice, exactly as on the web.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Adedayo Aremu Autos",
    short_name: "AAA Autos",
    description:
      "Buy, rent, rent-to-own and finance vehicles with Adedayo Aremu Autos.",
    start_url: "/us",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait",
    categories: ["shopping", "business"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
