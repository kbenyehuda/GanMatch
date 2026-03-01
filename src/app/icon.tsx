import { ImageResponse } from "next/og";

export const runtime = "edge";

export function generateImageMetadata() {
  return [
    {
      id: "192",
      size: { width: 192, height: 192 },
      contentType: "image/png",
    },
    {
      id: "512",
      size: { width: 512, height: 512 },
      contentType: "image/png",
    },
    {
      id: "maskable",
      size: { width: 512, height: 512 },
      contentType: "image/png",
    },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const iconId = String(await id);
  const isMaskable = iconId === "maskable";

  const bg = "#2D6A4F";
  const fg = "#FFFFFF";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          color: fg,
          borderRadius: isMaskable ? 0 : 96,
        }}
      >
        <div
          style={{
            width: isMaskable ? "78%" : "86%",
            height: isMaskable ? "78%" : "86%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1B4332",
            borderRadius: 9999,
            fontSize: iconId === "192" ? 88 : 240,
            fontWeight: 800,
            letterSpacing: -6,
            lineHeight: 1,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
          }}
        >
          GM
        </div>
      </div>
    ),
    {
      width: iconId === "192" ? 192 : 512,
      height: iconId === "192" ? 192 : 512,
    }
  );
}

