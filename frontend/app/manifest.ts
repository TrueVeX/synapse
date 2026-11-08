import type { MetadataRoute } from "next";

// Lets phones "Add to Home screen" with the SYNAPSE name and icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SYNAPSE — AI Research",
    short_name: "SYNAPSE",
    description: "A focused AI research workspace by HumanForm Studios",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
