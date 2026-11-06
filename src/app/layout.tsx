import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { site, siteUrl } from "@/lib/site";

import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: site.title, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-scroll-behavior: the page scrolls smoothly to in-page links, but Next.js
    // must jump instantly on route changes, or a page can open part-way down.
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
