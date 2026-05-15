import { redirect } from "next/navigation";

// Legacy route — redirects to /place/[id]
export default function GanSharePage({ params }: { params: { id: string } }) {
  redirect(`/place/${params.id}`);
}
