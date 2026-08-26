import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A licence photo from a phone is routinely 3–5MB and the default cap for
    // a server action is 1MB, which would reject them with a stack trace
    // rather than a message. The upload itself refuses anything over 8MB with
    // an explanation, so this only has to be large enough to reach that check.
    serverActions: { bodySizeLimit: "10mb" },
  },
  /* config options here */
};

export default nextConfig;
