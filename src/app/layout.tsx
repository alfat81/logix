import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

/* Брендбук §1.2: IBM Plex Sans, веса 400/500/700, подмножества
   latin + cyrillic, display: swap. Привязка к --font-sans — в
   globals.css; fallback — system-ui. */
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-ibm-plex",
});

export const metadata: Metadata = {
  title: "Logix — платформа мультимодальной логистики",
  description: "Платформа мультимодальной логистики — рабочее место менеджера, воронка запросов, заявки, этапы и порталы для клиентов, подрядчиков и брокеров",
  openGraph: {
    title: "Logix — платформа мультимодальной логистики",
    description: "Платформа мультимодальной логистики — рабочее место менеджера, воронка запросов, заявки, этапы и порталы для клиентов, подрядчиков и брокеров",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={ibmPlexSans.variable}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
