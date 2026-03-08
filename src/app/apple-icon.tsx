import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export function generateImageMetadata() {
  return [
    {
      id: "180",
      size: { width: 180, height: 180 },
      contentType: "image/png",
    },
  ];
}

export default async function AppleIcon({ id }: { id: Promise<string | number> }) {
  await id;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2D6A4F",
          color: "#FFFFFF",
        }}
      >
        <div
          style={{
            width: "86%",
            height: "86%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1B4332",
            borderRadius: 36,
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: -4,
            lineHeight: 1,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
          }}
        >
          GM
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}

