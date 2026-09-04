import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, PencilLine, ShieldCheck, Baby, Stethoscope, Sparkles, Mail, MessageCircle } from "lucide-react";
import { PLACE_CATEGORY_COLORS } from "@/types/places";

export const metadata: Metadata = {
  title: "אודות | GiveMyTime",
  description: "מה זה GiveMyTime, מאיפה המידע מגיע, ואיך אפשר לעזור.",
};

const CATEGORY_CHIPS = [
  { key: "kids", label: "גנים ומעונות", Icon: Baby },
  { key: "doctor", label: "רופאים", Icon: Stethoscope },
  { key: "cosmetics", label: "קוסמטיקה", Icon: Sparkles },
] as const;

const STEPS = [
  {
    Icon: MapPin,
    title: "פותחים מפה, לא עשר לשוניות",
    text: "כל המקומות בגבעתיים על מפה אחת — עם דירוגים ופרטים אמיתיים. בלי לגלול בקבוצות ווטסאפ בשעה 23:00.",
  },
  {
    Icon: PencilLine,
    title: "מספרים איך היה",
    text: "מתחברים עם Google בשנייה, מדרגים, וכותבים כמה מילים על החוויה — בעילום שם אם בא לכם.",
  },
  {
    Icon: ShieldCheck,
    title: "עובר בדיקת שכנות",
    text: "כל ביקורת עוברת בדיקה קצרה לפני שהיא עולה, ככה שאפשר לסמוך על מה שכתוב שם.",
  },
];

function InfoCard({
  Icon,
  title,
  children,
}: {
  Icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E9F0",
        borderRadius: 18,
        padding: "20px 18px",
        boxShadow: "0 4px 16px rgba(10,43,107,.06)",
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "linear-gradient(135deg,#0A2B6B,#1F5BB5)",
          color: "#fff",
          marginBottom: 12,
        }}
      >
        <Icon style={{ width: 20, height: 20 }} />
      </div>
      <h3 className="font-hebrew" style={{ fontSize: 15, fontWeight: 800, color: "#0F1A2E", marginBottom: 6 }}>
        {title}
      </h3>
      <div className="font-hebrew" style={{ fontSize: 13.5, color: "#5A6472", lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "#F6F9FE" }}>
      {/* Hero */}
      <div
        className="relative"
        style={{
          background: "linear-gradient(160deg, #0A2B6B 0%, #1F5BB5 60%, #3E7BD9 100%)",
          padding: "20px 20px 64px",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(480px 320px at 85% 0%, rgba(200,162,75,.28), transparent 65%)" }}
        />
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
          <Link
            href="/"
            className="font-hebrew"
            style={{ fontSize: 13, color: "rgba(255,255,255,.8)", display: "inline-block", marginBottom: 28 }}
          >
            → חזרה למפה
          </Link>

          <div className="flex flex-col items-center text-center" style={{ padding: "0 8px" }}>
            <img
              src="/app-icon.png"
              alt="GiveMyTime"
              style={{ width: 76, height: 76, borderRadius: 20, objectFit: "cover", boxShadow: "0 12px 28px rgba(10,43,107,.4)", marginBottom: 18 }}
            />
            <h1 className="font-hebrew" style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
              GiveMyTime
            </h1>
            <p className="font-hebrew" style={{ fontSize: 14, color: "rgba(255,255,255,.75)", maxWidth: 340, lineHeight: 1.7 }}>
              כל המקומות הכי טובים בגבעתיים — ישר מהשכנים שלכם 👋
            </p>
          </div>
        </div>

        {/* Floating category chips */}
        <div
          className="absolute flex flex-wrap items-center justify-center gap-2"
          style={{ left: 20, right: 20, bottom: -26, maxWidth: 680, margin: "0 auto" }}
        >
          {CATEGORY_CHIPS.map(({ key, label, Icon }) => {
            const color = PLACE_CATEGORY_COLORS[key];
            return (
              <div
                key={key}
                className="flex items-center gap-2 font-hebrew"
                style={{
                  background: "#fff",
                  borderRadius: 999,
                  padding: "10px 16px",
                  boxShadow: "0 12px 24px rgba(10,43,107,.18)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0F1A2E",
                }}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 24, height: 24, borderRadius: "50%", background: color, color: "#fff" }}
                >
                  <Icon style={{ width: 13, height: 13 }} />
                </span>
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "58px 20px 80px" }}>
        <p
          className="font-hebrew text-center"
          style={{ fontSize: 14, color: "#5A6472", lineHeight: 1.85, maxWidth: 560, margin: "0 auto 40px" }}
        >
          הבסיס זה מידע רשמי — למשל רשימות גנים ומעונות מאושרים. אבל הדבר הכי שימושי מגיע מכם: איך המקום
          באמת מרגיש, אם היה שווה את זה, אם הייתם ממליצים לחברה הכי טובה. ככל שיותר שכנים מספרים —
          כולם יוצאים מרוויחים 🙌
        </p>

        <h2 className="font-hebrew text-center" style={{ fontSize: 13, fontWeight: 800, color: "#8A95A8", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 16 }}>
          ככה זה עובד
        </h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 40 }}>
          {STEPS.map((step) => (
            <InfoCard key={step.title} Icon={step.Icon} title={step.title}>
              {step.text}
            </InfoCard>
          ))}
        </div>

        <div
          className="relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #0A2B6B 0%, #1F5BB5 100%)",
            borderRadius: 20,
            padding: "26px 24px",
            marginBottom: 40,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(320px 200px at 90% 0%, rgba(200,162,75,.35), transparent 65%)" }}
          />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(135deg,#E59A2C,#C8A24B)",
                color: "#fff",
              }}
            >
              <MessageCircle style={{ width: 24, height: 24 }} />
            </div>
            <div>
              <div
                className="font-hebrew inline-block"
                style={{ fontSize: 11, fontWeight: 800, color: "#FCE7B2", background: "rgba(200,162,75,.2)", padding: "3px 9px", borderRadius: 999, marginBottom: 8 }}
              >
                הפיצ&apos;ר שהכי אוהבים אצלנו
              </div>
              <h3 className="font-hebrew" style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
                יש שאלה לממליץ/ה? פשוט תשאלו 💬
              </h3>
              <p className="font-hebrew" style={{ fontSize: 13.5, color: "rgba(255,255,255,.8)", lineHeight: 1.75 }}>
                ראיתם ביקורת ומתלבטים על משהו ספציפי? אפשר לשלוח הודעה ישירה למי שכתב/ה אותה — דרך המערכת,
                בלי שאף אחד חושף את כתובת האימייל שלו. ככה מקבלים תשובה אמיתית משכן/ה, לא רק כוכבים.
              </p>
            </div>
          </div>
        </div>

        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-start"
          style={{
            background: "#fff",
            border: "1px solid #E5E9F0",
            borderRadius: 18,
            padding: "20px 22px",
            marginBottom: 16,
          }}
        >
          <div>
            <h3 className="font-hebrew" style={{ fontSize: 14, fontWeight: 800, color: "#0F1A2E", marginBottom: 4 }}>
              פרטיות, בלי אותיות קטנות מפחידות
            </h3>
            <p className="font-hebrew" style={{ fontSize: 13, color: "#8A95A8" }}>
              מה קורה עם המידע שלכם, כתוב בעברית פשוטה — לא בשפת עורכי דין
            </p>
          </div>
          <Link
            href="/privacy"
            className="font-hebrew shrink-0"
            style={{
              background: "#F6F9FE",
              color: "#1F5BB5",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid #E5E9F0",
            }}
          >
            לקרוא (זה קצר, מבטיחים)
          </Link>
        </div>

        <div
          className="flex items-center justify-center gap-2 font-hebrew"
          style={{ fontSize: 13, color: "#8A95A8", padding: "8px 0" }}
        >
          <Mail style={{ width: 14, height: 14 }} />
          יש רעיון? מצאתם באג? יאללה תכתבו:{" "}
          <a href="mailto:kbenyehuda2@gmail.com" style={{ color: "#1F5BB5", fontWeight: 700 }}>
            kbenyehuda2@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
