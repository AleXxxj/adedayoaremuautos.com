import type { MetadataRoute } from "next";

/**
 * The web app manifest: what a phone needs to install the site as an app.
 *
 * It has three readers. Safari, which only delivers notifications to a site
 * added to the Home Screen and only offers that properly for a site with a
 * manifest. Chrome on Android, which uses it for "Install app": the name,
 * the icons, the splash colors, the shortcuts on a long press and the
 * pictures in the install sheet. And the Android app in mobile/android,
 * which is this same site in a full-screen window and takes its name, colors
 * and icons from the same values (mobile/android/twa-manifest.json).
 *
 * `start_url` points at the US market because a manifest is a single static
 * document and cannot vary by visitor. Anyone who lands on the wrong one is
 * offered the other by the country notice, exactly as on the web. The
 * `source=pwa` marker only tells an installed-app visit apart from a browser
 * visit in the server logs; no page reads it.
 *
 * `id` is the app's identity and must never change: a phone treats a
 * different id as a different app and stops updating the installed one.
 *
 * Colors are --surface-0, the page background, so the splash, the status bar
 * and the header are one color. Icons are written by scripts/build-icons.mjs
 * and the screenshots by scripts/build-screenshots.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Adedayo Aremu Autos",
    short_name: "Adedayo Autos",
    description: "Buy, rent, rent to own and finance cars in Greensboro, NC.",
    lang: "en-US",
    dir: "ltr",
    start_url: "/us?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#070C0A",
    theme_color: "#070C0A",
    orientation: "portrait",
    categories: ["shopping", "business", "auto"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/badge-96.png", sizes: "96x96", type: "image/png", purpose: "monochrome" },
    ],
    // A long press on the app's icon. The same four things as the tab bar.
    shortcuts: [
      {
        name: "Rent a car",
        short_name: "Rent",
        url: "/us/rentals?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Buy a car",
        short_name: "Buy",
        url: "/us/inventory?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Check a car by VIN",
        short_name: "Check a car",
        url: "/us/check?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Sell your car",
        short_name: "Sell",
        url: "/us/sell?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    // Shown in Chrome's install sheet. Pictures of the real site, taken by
    // scripts/build-screenshots.mjs; retake them when the look changes.
    screenshots: [
      {
        src: "/screenshots/phone-home.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "Home",
      },
      {
        src: "/screenshots/phone-check.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "Check a car by VIN",
      },
      {
        src: "/screenshots/phone-guides.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "Guides",
      },
      {
        src: "/screenshots/wide-home.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "Home",
      },
    ],
  };
}
