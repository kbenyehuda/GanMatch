"use client";

import { useEffect } from "react";
import { startAnalytics, track, SIGNING_IN_KEY } from "@/lib/analytics";
import { useSession } from "@/lib/useSession";

/** Mounted once in the root layout: counts the visit, listens for marked clicks, notes sign-ins. */
export function AnalyticsTracker() {
  const { user } = useSession();

  useEffect(() => { startAnalytics(); }, []);

  // Back from the Google redirect with a session → one "signed_in" event.
  useEffect(() => {
    if (!user?.id) return;
    try {
      if (window.sessionStorage.getItem(SIGNING_IN_KEY) !== "1") return;
      window.sessionStorage.removeItem(SIGNING_IN_KEY);
    } catch { return; }
    track("signed_in", undefined, null);
  }, [user?.id]);

  return null;
}
