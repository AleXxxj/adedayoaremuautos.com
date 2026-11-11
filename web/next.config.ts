import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
