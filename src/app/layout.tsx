import type { Metadata, Viewport } from "next";
import { Inter, Heebo, Plus_Jakarta_Sans } from "next/font/google";
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

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "GiveMyTime | גבעתיים",
  description: "גלו מקומות, שירותים ועסקים מומלצים בגבעתיים.",
  applicationName: "GiveMyTime",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "GiveMyTime",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A2B6B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${inter.variable} ${heebo.variable} ${jakartaSans.variable}`}>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
