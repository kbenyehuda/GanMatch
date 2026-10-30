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

// Link previews need absolute image URLs. NEXT_PUBLIC_SITE_URL wins; on Vercel the
// production domain is exposed as VERCEL_PROJECT_PRODUCTION_URL.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "GiveMyTime | גבעתיים",
  description: "גלו מקומות, שירותים ועסקים מומלצים בגבעתיים.",
  openGraph: {
    title: "GiveMyTime | גבעתיים",
    description: "גלו מקומות, שירותים ועסקים מומלצים בגבעתיים.",
    locale: "he_IL",
    type: "website",
    images: [{ url: "/og/kids", width: 1200, height: 630 }],
  },
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
