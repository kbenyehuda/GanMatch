import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeMap } from "@/components/home/HomeMap";
import { getCachedPlaceById } from "@/lib/server/fetch-place-by-id";
import { PLACE_CATEGORY_LABELS } from "@/types/places";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;
  if (!UUID_RE.test(id)) return { title: "Give My Time" };

  const place = await getCachedPlaceById(id);
  if (!place) {
    return {
      title: "מקום לא נמצא | Give My Time",
      description: "הקישור אינו תקין או שהמקום הוסר.",
    };
  }

  const categoryLabel = PLACE_CATEGORY_LABELS[place.place_category];
  const title = `${place.name} | Give My Time`;
  const description = [categoryLabel, place.address, place.description]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 160);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
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

export default async function PlaceSharePage({ params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) notFound();

  const place = await getCachedPlaceById(id);
  if (!place) notFound();

  return <HomeMap seedPlace={place} />;
}
