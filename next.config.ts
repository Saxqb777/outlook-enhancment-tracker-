import type { NextConfig } from "next";

// SANDBOX_MODE=1: the home page shows the no-login demo (public/sandbox.html)
// to anyone who isn't signed in. /login and /setup keep working as normal.
const sandbox = process.env.SANDBOX_MODE === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Full email threads can be long; let them through (Vercel's own limit is 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async rewrites() {
    if (!sandbox) return [];
    return {
      beforeFiles: [
        {
          source: "/",
          missing: [{ type: "cookie", key: "ae_session" }],
          destination: "/sandbox.html",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
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
    ];
  },
};

export default nextConfig;
