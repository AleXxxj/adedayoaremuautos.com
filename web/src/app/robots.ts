import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/feeds/inventory";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The admin is behind auth anyway, but keeping it out of the index
        // avoids advertising the login page to credential-stuffing bots.
        // /preview holds unreleased design directions.
        disallow: ["/admin", "/api/", "/preview", "/style"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
