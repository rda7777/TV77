import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeSync } from "@/components/ThemeSync";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TradingView Gratis — Crypto charts open source",
  description:
    "Plataforma de charts crypto en vivo. Alternativa gratis a TradingView. Powered by Binance + lightweight-charts.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TV Gratis",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#131722",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-tv-bg text-tv-text">
        <ThemeSync />
        <PwaRegister />
        <TooltipProvider delay={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
