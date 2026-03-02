"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/useSession";
import { publicEnv } from "@/lib/env/public";

function contactEnabledPublic() {
  return publicEnv.NEXT_PUBLIC_CONTACT_REVIEWER_ENABLED;
}

function isEmailLike(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function ContactReviewerModal({
  reviewId,
  ganName,
  onClose,
}: {
  reviewId: string;
  ganName?: string | null;
  onClose: () => void;
}) {
  const { user, session } = useSession();
  const enabled = contactEnabledPublic();

  const initialEmail = useMemo(() => user?.email ?? "", [user?.email]);
  const [senderEmail, setSenderEmail] = useState(initialEmail);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSenderEmail((prev) => (prev.trim() ? prev : initialEmail));
  }, [initialEmail]);

  if (!user) return null;
  const accessToken = session?.access_token ?? null;

  const submit = async () => {
    setError(null);
    setSuccess(false);
    if (!accessToken) {
      setError("אנא המתן… ההתחברות עדיין נטענת.");
      return;
    }
    if (!enabled) {
      setError("אפשרות יצירת קשר אינה זמינה כרגע.");
      return;
    }

    const email = senderEmail.trim();
    const msg = messageText.trim();

    if (!email || !isEmailLike(email)) {
      setError("נא להזין אימייל תקין.");
      return;
    }
    if (!msg) {
      setError("נא לכתוב הודעה.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/contact-reviewer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reviewId, senderEmail: email, messageText: msg }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const m = typeof data?.error === "string" ? data.error : "שגיאה בשליחת ההודעה.";
        throw new Error(m);
      }
      setSuccess(true);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "שגיאה בשליחת ההודעה.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-3">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
          <div className="min-w-0">
            <CardTitle className="font-hebrew text-base">
              שלח הודעה לממליץ{ganName ? ` על ${ganName}` : ""}
            </CardTitle>
            <div className="mt-1 text-xs text-gray-600 font-hebrew">
              הממליץ יקבל אימייל ויוכל להשיב ישירות לאימייל שתכתבו כאן.
            </div>
            {!enabled ? (
              <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 font-hebrew">
                אפשרות יצירת קשר אינה זמינה כרגע.
              </div>
            ) : null}
          {!accessToken ? (
            <div className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2 font-hebrew">
              טוען נתוני התחברות…
            </div>
          ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">
              האימייל שלך (נשלח כ-Reply-To)
            </label>
            <input
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              type="email"
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew focus:outline-none focus:ring-2 focus:ring-gan-primary/40"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">הודעה</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew focus:outline-none focus:ring-2 focus:ring-gan-primary/40"
              placeholder="כתבו שאלה / פרטים…"
            />
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 font-hebrew">
              ההודעה נשלחה.
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              ביטול
            </Button>
            <Button onClick={submit} disabled={sending || !enabled || !accessToken}>
              {sending ? "שולח..." : "שלח"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

