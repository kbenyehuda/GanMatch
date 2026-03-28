import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeMapPage } from "@/components/app/HomeMapPage";
import { fetchGanById } from "@/lib/ganim-server";
import { getSiteBaseUrl } from "@/lib/site-url";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gan = await fetchGanById(params.id);
  const base = getSiteBaseUrl();
  if (!gan) {
    return {
      title: "גן לא נמצא | GanMatch",
      robots: { index: false, follow: false },
    };
  }
  const parts = [gan.name_he, gan.city?.trim(), gan.address?.trim()].filter(Boolean);
  const description = parts.join(" · ");
  const url = `${base}/gan/${params.id}`;
  return {
    title: `${gan.name_he} | GanMatch`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: gan.name_he,
      description,
      type: "website",
      url,
      locale: "he_IL",
      siteName: "GanMatch",
    },
    twitter: {
      card: "summary_large_image",
      title: gan.name_he,
      description,
    },
  };
}

export default async function GanSharePage({ params }: Props) {
  const gan = await fetchGanById(params.id);
  if (!gan) notFound();
  return <HomeMapPage seedGan={gan} />;
}
