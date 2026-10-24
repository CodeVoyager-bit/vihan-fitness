import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every app screen is per-user and reads the session, so the classic
  // dynamic rendering model is simpler than Cache Components here.
  poweredByHeader: false,
  // Photo uploads (MAX_PHOTO_BYTES in src/lib/format.ts, plus multipart overhead); Vercel caps requests at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
