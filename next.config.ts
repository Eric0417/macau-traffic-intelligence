import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Only the map tiles and the official camera streams are loaded by
// the browser; every other source is fetched by the server.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "font-src 'self' data:",
  `connect-src 'self' https://tiles.openfreemap.org https://*.dsatmacau.com${
    isProduction ? "" : " ws: wss:"
  }`,
  "media-src 'self' blob: https://*.dsatmacau.com",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // The dashboard is often opened as 127.0.0.1 during local testing. Without
  // this entry Next 16 blocks dev assets for that hostname and the map never
  // initializes.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["ioredis"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
