import Link from "next/link";

/** The site owner as written on the legal pages (user, 2026-10-30; ask the lawyer whether it's enough). */
export const SITE_OWNER = "קרן ב.";

/** Shared layout for /privacy, /terms and /accessibility. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "#F6F9FE" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
        <Link href="/about" className="font-hebrew" style={{ fontSize: 13, color: "#1F5BB5", display: "inline-block", marginBottom: 20 }}>
          → חזרה לאודות
        </Link>
        <h1 className="font-hebrew" style={{ fontSize: 26, fontWeight: 800, color: "#0A2B6B", marginBottom: 8 }}>{title}</h1>
        <p className="font-hebrew" style={{ fontSize: 13, color: "#8A95A8", marginBottom: 28 }}>עודכן לאחרונה: {updated}</p>
        <div className="font-hebrew" style={{ fontSize: 14, color: "#374151", lineHeight: 1.9 }}>{children}</div>
        <LegalLinks />
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="font-hebrew" style={{ fontSize: 18, fontWeight: 800, color: "#0A2B6B", marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul style={{ paddingInlineStart: 20, listStyle: "disc", marginBottom: 10 }}>{children}</ul>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 10 }}>{children}</p>;
}

/** "מדיניות פרטיות · תנאי שימוש · הצהרת נגישות" — bottom of the about page and the legal pages. */
export function LegalLinks() {
  const link = { color: "#1F5BB5", fontWeight: 600 } as const;
  return (
    <nav aria-label="מסמכים" className="font-hebrew flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
      style={{ fontSize: 13, color: "#8A95A8", marginTop: 32, paddingTop: 16, borderTop: "1px solid #E5E9F0" }}>
      <Link href="/privacy" style={link}>מדיניות פרטיות</Link>
      <span aria-hidden>·</span>
      <Link href="/terms" style={link}>תנאי שימוש</Link>
      <span aria-hidden>·</span>
      <Link href="/accessibility" style={link}>הצהרת נגישות</Link>
    </nav>
  );
}
