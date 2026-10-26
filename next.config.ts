import type { NextConfig } from "next";

// Security-заголовки на все ответы (E0-04). 'unsafe-inline' для
// скриптов нужен Next без nonce-конфигурации; внешних источников
// приложение не использует — всё 'self'.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors *",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// Кабинеты и API — служебная система, в поиске им не место
const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/admin/:path*", "/client/:path*", "/broker/:path*", "/contractor/:path*", "/api/:path*", "/admin", "/client", "/broker", "/contractor"].map(
        (source) => ({ source, headers: noindex })
      ),
    ];
  },
};

export default nextConfig;
