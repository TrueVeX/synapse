import type { MetadataRoute } from "next";

const SITE = "https://synapse-humanform.vercel.app";

// Public pages search engines can show (chats need sign-in and are private).
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/signup", "/login", "/pricing"].map((path) => ({ url: `${SITE}${path}` }));
}
