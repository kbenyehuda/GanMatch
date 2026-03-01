"use client";

import { useMemo, useState } from "react";
import { Baby, LogIn, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

export const SKIP_LOGIN_STORAGE_KEY = "ganmatch_skip_login";

export function ConnectionGate({
  onSkip,
  loading = false,
}: {
  onSkip?: () => void;
  loading?: boolean;
}) {
  const [signingIn, setSigningIn] = useState(false);

  const canAuth = !!supabase;
  const disabled = loading || signingIn;

  const signIn = async () => {
    if (!supabase) return;
    setSigningIn(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
    } finally {
      setSigningIn(false);
    }
  };

  const subtitle = useMemo(() => {
    if (loading) return "טוען התחברות…";
    return "התחברו כדי לכתוב המלצות, להוסיף גנים ולפתוח יכולות נוספות.";
  }, [loading]);

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-gan-muted/40 via-white to-white" dir="rtl">
      <div className="mx-auto flex min-h-[100dvh] max-w-2xl items-center justify-center px-4 py-10">
        <Card className="w-full overflow-hidden">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-gan-primary/10 flex items-center justify-center">
                  <Baby className="h-6 w-6 text-gan-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="font-hebrew text-xl text-gan-dark truncate">
                    GanMatch — התחברות
                  </CardTitle>
                  <div className="text-xs text-gray-500 font-hebrew mt-0.5 truncate">
                    {subtitle}
                  </div>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2 text-[11px] text-gray-500 font-hebrew">
                <UserRoundX className="h-4 w-4" />
                אפשר להמשיך כאורח
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 pt-2 space-y-4">
            {!canAuth ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 font-hebrew">
                Supabase לא מוגדר (חסרים משתני סביבה). אפשר להמשיך כאורח.
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                onClick={signIn}
                disabled={disabled || !canAuth}
                className="gap-2"
              >
                <LogIn className="h-4 w-4" />
                {signingIn ? "פותח התחברות…" : "התחברות עם Google"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={onSkip}
                disabled={disabled || !onSkip}
              >
                המשך כאורח (דלג)
              </Button>
            </div>

            <div className="text-xs text-gray-600 font-hebrew space-y-1">
              <div>במצב אורח חלק מהפעולות יהיו מוגבלות (לדוגמה: הוספת גן ופרסום המלצה).</div>
              <div>אפשר להתחבר בכל רגע דרך כפתור ההתחברות למעלה.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

