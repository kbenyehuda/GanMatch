import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GanMatch | גן מתאים",
    short_name: "GanMatch",
    description:
      "Map-centric discovery platform for Israeli daycares (ages 0–3). Find licensed daycares based on location and community reviews.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F9FAFB",
    theme_color: "#2D6A4F",
    dir: "rtl",
    lang: "he",
    icons: [
      {
        src: "/icon/192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
