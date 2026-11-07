import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Friendly and common URLs that people (or old links) may use.
  async redirects() {
    return [
      { source: "/upgrade", destination: "/pricing", permanent: false },
      { source: "/plans", destination: "/pricing", permanent: false },
      { source: "/billing", destination: "/pricing", permanent: false },
      { source: "/subscribe", destination: "/pricing", permanent: false },
      { source: "/subscription", destination: "/pricing", permanent: false },
      { source: "/sign-in", destination: "/login", permanent: false },
      { source: "/signin", destination: "/login", permanent: false },
      { source: "/sign-up", destination: "/signup", permanent: false },
      { source: "/register", destination: "/signup", permanent: false },
      { source: "/new", destination: "/", permanent: false },
      { source: "/chat", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
