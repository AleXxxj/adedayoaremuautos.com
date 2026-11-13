import { ANDROID_CERT_FINGERPRINTS, ANDROID_PACKAGE } from "@/lib/app/androidApp";

/**
 * Digital Asset Links: the site saying "this Android app is ours".
 *
 * Android fetches this address, on the exact host the app opens
 * (www.adedayoaremuautos.com), when the app is installed and when it starts.
 * If the app's package name and signing fingerprint are listed here, the app
 * opens the site full screen. If not, it still works, but with a browser
 * address bar across the top.
 *
 * A route rather than a file in /public because JSON cannot hold comments,
 * and which fingerprint is the debug key matters: the values and their notes
 * are in src/lib/app/androidApp.ts. Built once, served as a static file. It
 * must answer 200 with JSON and no redirect, which is why it has a file
 * extension: the proxy's host redirect skips paths with one.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: ANDROID_CERT_FINGERPRINTS,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
