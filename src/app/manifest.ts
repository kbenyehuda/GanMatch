import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GiveMyTime | גבעתיים",
    short_name: "GiveMyTime",
    description: "גלו מקומות, שירותים ועסקים מומלצים בגבעתיים.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0A2B6B",
    theme_color: "#0A2B6B",
    dir: "rtl",
    lang: "he",
    // Lets Chrome on Android tell the site it's already installed (navigator.getInstalledRelatedApps).
    related_applications: [{ platform: "webapp", url: "https://www.givemytimeapp.com/manifest.webmanifest" }],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
