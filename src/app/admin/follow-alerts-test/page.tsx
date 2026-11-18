"use client";

import { useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

// Admin only: sends one sample "update" email to yourself, built from the last 7 days of real changes.
export default function FollowAlertsTestPage() {
  const { user, loading } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setBusy(true); setMsg(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error("יש להתחבר");
      const res = await fetch("/api/admin/follow-alerts-test", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "נכשל");
      setMsg(data.sent ? `נשלח אל ${data.to}` : data.failed ? "השליחה נכשלה (בדקו את משתני Resend ב-Vercel)" : "לא היו שינויים בשבוע האחרון, אז לא נשלח מייל");
    } catch (e: any) {
      setMsg(e?.message ?? "נכשל");
    } finally { setBusy(false); }
  }

  if (loading) return null;
  if (!user) return <p dir="rtl" className="p-6 font-hebrew">יש להתחבר כמנהלת.</p>;
  return (
    <main dir="rtl" className="p-6 font-hebrew max-w-md">
      <h1 className="text-xl font-bold mb-2">בדיקת מייל עדכונים</h1>
      <p className="mb-4 text-sm">שולח אליכן בלבד מייל לדוגמה, שנבנה מהשינויים האמיתיים של 7 הימים האחרונים. אף אחד אחר לא מקבל מייל.</p>
      <button onClick={send} disabled={busy} className="px-4 py-2 rounded-lg bg-[#0A2B6B] text-white disabled:opacity-50">
        {busy ? "שולח…" : "שלחו לי מייל לדוגמה"}
      </button>
      {msg && <p className="mt-4">{msg}</p>}
    </main>
  );
}
