import type { NextConfig } from "next";

// Security-заголовки на все ответы (E0-04). 'unsafe-inline' для
// скриптов нужен Next без nonce-конфигурации; внешних источников
// приложение не использует — всё 'self'. Исключение — DF-11
// (0.8.1): при настроенном S3 (D32/D36 — провайдер из env, не код)
// браузер сам отправляет файл по presigned PUT на эндпоинт
// хранилища, поэтому его origin добавляется в connect-src из env
// при сборке. Просмотр и скачивание — top-level навигация
// (target="_blank" → 302), connect-src её не регулирует. Без S3_*
// дополнений нет: локальный драйвер работает на same-origin
// /api/storage/local.
function s3ConnectOrigins(): string {
  const endpoint = process.env.S3_ENDPOINT?.trim().replace(/\/+$/, "")
  const bucket = process.env.S3_BUCKET?.trim()
  if (!endpoint || !bucket) return ""
  try {
    const host = new URL(endpoint).host
    // Ключ — только origin эндпоинта; wildcard по поддоменам страхует
    // virtual-hosted адресацию бакета, если path-style не включён.
    return ` https://${host} https://*.${host}`
  } catch {
    return ""
  }
}
const s3Origins = s3ConnectOrigins()

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'" + s3Origins,
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
  serverExternalPackages: ["@prisma/client"],
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
