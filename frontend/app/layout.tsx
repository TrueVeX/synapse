import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { LiveBackground } from "@/components/chat/live-background";

// Sans-serif for the interface, serif for the greeting and AI answers.
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  title: "SYNAPSE — AI Research",
  description: "A focused AI research workspace",
  // Google Search Console ownership check.
  verification: { google: "7g5JZI04aYb2aEU2x2Tzd5oRYhu4O_zGuJpKiL6gwS8" },
};

// Phones: fill the screen edge to edge (notches handled with safe-area padding)
// and shrink the page when the keyboard opens so the input box stays visible.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#121110",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <LiveBackground />
        {children}
      </body>
    </html>
  );
}
