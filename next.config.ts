import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Строго включено с первого дня — не повторяем историю APEX Moto,
  // где ignoreBuildErrors: true стояло до v1.0.6 и маскировало реальные
  // ошибки типов (включая один реальный баг с несуществующей опцией
  // у requireEmployee).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;
