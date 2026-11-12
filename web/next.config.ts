import type { NextConfig } from "next";

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  /*
   * Listing photos, resized to the size they are shown at.
   *
   * They are stored as uploaded — up to 6 megapixels, a few megabytes each —
   * and Supabase's own resizing is not on this plan, so the rental list was
   * sending 13 MB of photos to fill eleven 112-pixel thumbnails (measured
   * November 2026). Only the vehicles bucket, and no query strings, so the
   * resizer can't be pointed at anything else.
   *
   * Cached for a month: a changed photo is stored under a new random name, so
   * a long cache can never show an old one. The bucket itself sends
   * "no-cache", which would otherwise make every visit download them again.
   */
  images: {
    remotePatterns: [
      ...(supabase
        ? [
            {
              protocol: "https" as const,
              hostname: new URL(supabase).hostname,
              port: "",
              pathname: "/storage/v1/object/public/vehicles/**",
              search: "",
            },
          ]
        : []),
      /*
       * The car check's photo of a model, from Wikimedia Commons
       * (src/lib/vin/photo.ts): 960-pixel thumbnails, and an original when
       * it is smaller than that. Resized here, so a visitor's browser never
       * contacts Wikimedia. No query strings, so nothing else on those hosts
       * can be pulled through the resizer.
       */
      {
        protocol: "https",
        hostname: "thumb.wikimedia.org",
        port: "",
        pathname: "/wikipedia/commons/thumb/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        port: "",
        pathname: "/wikipedia/commons/**",
        search: "",
      },
    ],
    minimumCacheTTL: 2678400,
  },
  experimental: {
    // Matches the hosting platform, so local development fails where the live
    // site would. Vercel refuses any request body over 4.5 MB before the app
    // runs, whatever this says: it was "10mb" here while the live site was
    // turning away two-photo bookings with a 413 (measured November 2026).
    // Uploads are shrunk in the browser to fit (src/lib/shrinkPhoto.ts), and
    // the default of 1 MB would still be too small for a license plus an
    // insurance card.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  /* config options here */
};

export default nextConfig;
