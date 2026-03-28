import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeMap } from "@/app/page";
import { getCachedGanById } from "@/lib/server/fetch-gan-by-id";
import { getGanShareUrl, getSiteUrl } from "@/lib/site-url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;
  if (!UUID_RE.test(id)) {
    return { title: "GanMatch" };
  }

  const gan = await getCachedGanById(id);
  if (!gan) {
    return {
      title: "גן לא נמצא | GanMatch",
      description: "הקישור אינו תקין או שהגן הוסר.",
    };
  }

  const title = `${gan.name_he} | GanMatch`;
  const parts = [gan.city, gan.address].filter(Boolean);
  const description = parts.length
    ? `${gan.name_he} — ${parts.join(" · ")}`
    : gan.name_he;

  const url = getGanShareUrl(gan.id);
  const site = getSiteUrl();

  return {
    title,
    description,
    alternates: { canonical: url },
    metadataBase: new URL(site),
    openGraph: {
      title,
      description,
      url,
      siteName: "GanMatch",
      locale: "he_IL",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function GanSharePage({ params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) notFound();

  const gan = await getCachedGanById(id);
  if (!gan) notFound();

  return <HomeMap seedGan={gan} />;
}
