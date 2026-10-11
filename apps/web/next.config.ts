import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["@ptas/ui"]
  },
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/sign-in",
        permanent: true
      },
      {
        source: "/admin",
        destination: "/admin/user-management",
        permanent: true
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" }
        ]
      }
    ];
  }
};

export default nextConfig;
