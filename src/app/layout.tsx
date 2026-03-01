import type { Metadata, Viewport } from "next";
import { Inter, Heebo } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const heebo = Heebo({
  subsets: ["latin", "hebrew"],
  variable: "--font-assistant",
});

export const metadata: Metadata = {
  title: "GanMatch | גן מתאים - Find Your Daycare",
  description:
    "Map-centric discovery platform for Israeli daycares (ages 0-3). Find licensed daycares based on location and community reviews.",
  applicationName: "GanMatch",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "GanMatch",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2D6A4F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${inter.variable} ${heebo.variable}`}>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
