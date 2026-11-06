import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// This folder is its own project inside a larger repository. Pin the root so
// Next.js never walks up and treats a parent folder as the workspace.
const projectRoot = path.resolve(__dirname);

// Next.js inlines small scripts for hydration, so script-src needs
// 'unsafe-inline' unless every page is rendered with a nonce. Everything else
// is locked to this origin. Downloads are top-level navigations to GitHub's
// signed URL, which CSP doesn't restrict.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Listed last so these win: a download redirect is never cached, and
      // GitHub isn't told which page it came from.
      {
        source: "/api/download/:platform",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, private" },
        ],
      },
    ];
  },
};

export default nextConfig;
