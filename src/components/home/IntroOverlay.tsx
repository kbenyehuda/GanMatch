"use client";

export const INTRO_SEEN_STORAGE_KEY = "gmt_seen_intro";

export function IntroOverlay({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col"
      dir="rtl"
      style={{ background: "linear-gradient(160deg, #0A2B6B 0%, #1F5BB5 60%, #3E7BD9 100%)" }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(500px 400px at 80% 10%, rgba(200,162,75,.25), transparent 70%)" }}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/app-icon.png"
            alt="GiveMyTime"
            style={{ width: 120, height: 120, borderRadius: 32, boxShadow: "0 12px 36px rgba(10,43,107,.4)", marginBottom: 20, objectFit: "cover" }}
          />
          <h1 className="font-hebrew" style={{ fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 6 }}>
            GiveMyTime
          </h1>
          <p className="font-hebrew" style={{ fontSize: 14, color: "rgba(255,255,255,.75)", textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
            כל המקומות הכי טובים בגבעתיים — ישר מהשכנים שלכם 👋
          </p>
        </div>

        <div
          className="w-full"
          style={{ maxWidth: 380, background: "rgba(255,255,255,.97)", borderRadius: 24, padding: "28px 24px", boxShadow: "0 24px 60px rgba(10,43,107,.3)" }}
        >
          <IntroBullet
            emoji="📍"
            title="כל מה שקורה בגבעתיים"
            text="גנים ומעונות, רופאים, קוסמטיקה ועוד — הכל על מפה אחת, בלי לגלול בקבוצות ווטסאפ."
          />
          <IntroBullet
            emoji="🤝"
            title="לא עוד ניחושים"
            text="מידע רשמי, משולב בביקורות אמיתיות מתושבים כמוכם — לא פרסומות, לא דירוגים מפוברקים."
          />
          <IntroBullet
            emoji="✍️"
            title="יאללה, תספרו איך היה"
            text="כתבו המלצה על מקום שהכרתם — זה עוזר לשכנים שלכם להחליט מהר יותר."
            last
          />

          <button
            type="button"
            onClick={onContinue}
            className="w-full font-hebrew"
            style={{
              marginTop: 8,
              padding: "14px 20px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(10,43,107,.35)",
            }}
          >
            יאללה, מתחילים
          </button>
        </div>
      </div>
    </div>
  );
}

function IntroBullet({
  emoji,
  title,
  text,
  last = false,
}: {
  emoji: string;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <div className="flex items-start gap-3" style={{ marginBottom: last ? 22 : 18 }}>
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 38, height: 38, borderRadius: 12, background: "#F6F9FE", fontSize: 18 }}
      >
        {emoji}
      </div>
      <div>
        <h3 className="font-hebrew" style={{ fontSize: 14, fontWeight: 800, color: "#0A2B6B", marginBottom: 2 }}>
          {title}
        </h3>
        <p className="font-hebrew" style={{ fontSize: 13, color: "#5A6472", lineHeight: 1.6 }}>
          {text}
        </p>
      </div>
    </div>
  );
}
