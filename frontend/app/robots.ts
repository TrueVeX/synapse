import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/chat/"] },
    sitemap: "https://synapse-humanform.vercel.app/sitemap.xml",
  };
}
