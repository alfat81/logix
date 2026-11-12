import type { Metadata } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import {
  THEME_BOOT_SCRIPT,
  THEME_COOKIE_NAME,
  parseThemeMode,
} from "@/lib/theme";

/* TU-01.2 (V-1/D79): IBM Plex Sans (400/500/600/700) и IBM Plex Mono
   (400/500/600) подключаются через next/font/local из src/fonts/
   (woff2, latin + cyrillic, лицензия OFL — src/fonts/OFL-IBMPlex.txt).
   Production-сборка не зависит от доступности Google Fonts: файлы
   шрифтов коммитятся в репозиторий. Fallback-стек — в globals.css
   (--font-sans/--font-mono). */
const ibmPlexSans = localFont({
  src: [
    { path: "../fonts/IBMPlexSans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexSans-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/IBMPlexSans-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-ibm-plex-sans",
});

const ibmPlexMono = localFont({
  src: [
    { path: "../fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Logix — платформа мультимодальной логистики",
  description: "Платформа мультимодальной логистики — рабочее место менеджера, воронка запросов, заявки, этапы и порталы для клиентов, подрядчиков и брокеров",
  openGraph: {
    title: "Logix — платформа мультимодальной логистики",
    description: "Платформа мультимодальной логистики — рабочее место менеджера, воронка запросов, заявки, этапы и порталы для клиентов, подрядчиков и брокеров",
  },
};

/* Начальный режим — из cookie (V-3/D79): сервер рендерит <html> с корректным
   классом, boot-скрипт перед первой отрисовкой страхует режим System
   (prefers-color-scheme) — FOUC исключён (V-4). suppressHydrationWarning
   гасит несоответствие класса <html>, изменяемого на клиенте. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialMode = parseThemeMode(cookieStore.get(THEME_COOKIE_NAME)?.value);
  return (
    <html
      lang="ru"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <ThemeProvider initialMode={initialMode}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
