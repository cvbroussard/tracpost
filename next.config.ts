import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.tracpost.com" },
    ],
  },
  // Externalize native + ESM-only modules so they load at runtime instead of being bundled.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdf-to-img",
    "pdfjs-dist",
    "pdf-lib",
    "ffmpeg-static",
    "fluent-ffmpeg",
  ],
  // Force-include the linux canvas binary so Vercel deploys it.
  // Next.js's dependency tracer misses dynamic requires of platform-specific binaries.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/pdfjs-dist/build/**/*",
      "./node_modules/pdf-to-img/**/*",
      "./node_modules/pdf-lib/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
  // TracPost blog and projects always route through the tenant engine
  // regardless of which marketing shell wraps them. The marketing-
  // specific rewrites (/, /about, /work, /contact) are now handled
  // in middleware so they can be hostname-conditioned (tracpost.com
  // serves current tenant template; next.tracpost.com serves the
  // new marketing route group).
  // Blog and projects rewrites moved to middleware so they can be
  // hostname-conditioned. tracpost.com serves tenant-shell blog;
  // next.tracpost.com serves marketing-shell blog. Projects follow
  // the same pattern.
  async rewrites() {
    return [];
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, s-maxage=604800" },
        ],
      },
      {
        source: "/icon.png",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
      {
        source: "/icon.svg",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
