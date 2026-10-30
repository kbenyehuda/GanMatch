import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { PLACE_CATEGORY_COLORS, type PlaceCategory } from "@/types/places";

// Edge: the Node build of the image renderer can't find its bundled font on Windows (local dev).
export const runtime = "edge";

// GET /og/<category> — 1200×630 link-preview image: the app icon on the category color.
// No text: the image renderer has no Hebrew font, and WhatsApp shows the title beside it.
export async function GET(req: NextRequest, { params }: { params: { category: string } }) {
  const color = PLACE_CATEGORY_COLORS[params.category as PlaceCategory] ?? "#1F5BB5";
  const icon = `${new URL(req.url).origin}/app-icon.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, #0A2B6B 0%, ${color} 100%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} width={360} height={360} style={{ borderRadius: 80, boxShadow: "0 24px 60px rgba(0,0,0,.3)" }} alt="" />
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
