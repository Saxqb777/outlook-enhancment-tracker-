import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Full email threads can be long; let them through (Vercel's own limit is 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async rewrites() {
    // The no-login demo lives at /demo. Signed-out visitors to / go to sign-in.
    return { beforeFiles: [{ source: "/demo", destination: "/sandbox.html" }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Original email PDFs open inside the app's full-size reader.
      { source: "/files/:id", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
