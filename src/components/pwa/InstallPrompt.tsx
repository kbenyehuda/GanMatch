"use client";

import { useEffect, useState } from "react";
import { X, Share, SquarePlus, MoreVertical, ExternalLink } from "lucide-react";
import { track } from "@/lib/analytics";
import {
  canPromptInstall, onInstallAvailabilityChange, promptInstall,
  phoneKind, isInstalled, isInAppBrowser, addedFromThisBrowser, checkAlreadyInstalled, type PhoneKind,
} from "@/lib/install-prompt";

const VISITS_KEY = "gmt_visits";
const VISIT_COUNTED_KEY = "gmt_visit_counted"; // sessionStorage: this visit was already counted
const DISMISSED_KEY = "gmt_install_dismissed_at";
const INAPP_DISMISSED_KEY = "gmt_inapp_note_dismissed"; // sessionStorage: once per visit
const HIDE_FOR_MS = 7 * 24 * 60 * 60 * 1000;

// Count "shown" once per page load (the banner remounts when switching tabs).
const shownOnce = new Set<string>();
function trackShownOnce(event: string, props: Record<string, unknown>) {
  if (shownOnce.has(event)) return;
  shownOnce.add(event);
  track(event, props, null);
}

/** Counts visits once per browser session; returns the count including this one. */
function countVisit(): number {
  try {
    let n = Number(window.localStorage.getItem(VISITS_KEY) || "0");
    if (!window.sessionStorage.getItem(VISIT_COUNTED_KEY)) {
      n += 1;
      window.localStorage.setItem(VISITS_KEY, String(n));
      window.sessionStorage.setItem(VISIT_COUNTED_KEY, "1");
    }
    return n;
  } catch {
    return 1;
  }
}

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY) || "0");
    return at > 0 && Date.now() - at < HIDE_FOR_MS;
  } catch {
    return false;
  }
}

/** Android in-app browsers can hand the page to Chrome with an intent link. */
function chromeIntentUrl() {
  const { host, pathname, search } = window.location;
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
}

const bannerStyle: React.CSSProperties = {
  bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", insetInline: 12, marginInline: "auto", maxWidth: 440,
  background: "#0A2B6B", color: "#fff", borderRadius: 18, padding: "12px 14px",
  boxShadow: "0 12px 30px rgba(10,43,107,.35)",
};

export function InstallPrompt({ engaged }: { engaged: boolean }) {
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<PhoneKind>("other");
  const [inApp, setInApp] = useState(false);
  const [visits, setVisits] = useState(1);
  const [hidden, setHidden] = useState(true);
  const [inAppHidden, setInAppHidden] = useState(true);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const phone = window.matchMedia?.("(max-width: 767px)").matches ?? false;
    if (!phone || isInstalled()) return;
    setKind(phoneKind());
    setInApp(isInAppBrowser());
    setVisits(countVisit());
    setHidden(dismissedRecently() || addedFromThisBrowser());
    try { setInAppHidden(window.sessionStorage.getItem(INAPP_DISMISSED_KEY) === "1"); } catch { setInAppHidden(false); }
    setCanPrompt(canPromptInstall());
    setReady(true);
    void checkAlreadyInstalled().then((yes) => { if (yes) setHidden(true); });
    return onInstallAvailabilityChange(() => {
      setCanPrompt(canPromptInstall());
      if (isInstalled() || addedFromThisBrowser()) setHidden(true);
    });
  }, []);

  const showInApp = ready && inApp && !inAppHidden;
  const showInstall = ready && !inApp && !hidden && (engaged || visits >= 2);

  useEffect(() => {
    if (showInApp) trackShownOnce("inapp_note_shown", { kind });
  }, [showInApp, kind]);
  useEffect(() => {
    if (showInstall) trackShownOnce("install_banner_shown", { kind, prompt: canPromptInstall() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInstall]);

  if (showInApp) {
    return (
      <div className="md:hidden fixed z-[450] font-hebrew" style={bannerStyle} dir="rtl" role="status">
        <div className="flex items-start gap-2.5">
          <ExternalLink style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>פתחו בדפדפן כדי להישאר מחוברים</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, opacity: 0.85, marginTop: 2 }}>
              {kind === "ios"
                ? "בתפריט (⋯) בחרו ״פתיחה ב-Safari״. שם תוכלו גם להוסיף את האפליקציה למסך הבית."
                : "בתפריט (⋮) בחרו ״פתיחה בדפדפן״. שם תוכלו גם להוסיף את האפליקציה למסך הבית."}
            </div>
            {kind === "android" && (
              <a
                href={chromeIntentUrl()}
                onClick={() => track("open_in_browser_click", { kind }, null)}
                className="inline-block font-bold"
                style={{ marginTop: 8, background: "#fff", color: "#0A2B6B", borderRadius: 10, padding: "7px 12px", fontSize: 13, textDecoration: "none" }}
              >
                פתיחה ב-Chrome
              </a>
            )}
          </div>
          <button
            type="button"
            aria-label="סגירה"
            onClick={() => {
              try { window.sessionStorage.setItem(INAPP_DISMISSED_KEY, "1"); } catch {}
              setInAppHidden(true);
            }}
            style={{ background: "none", border: 0, color: "rgba(255,255,255,.75)", cursor: "pointer", padding: 2, lineHeight: 0 }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>
    );
  }

  if (!showInstall) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
    track("install_dismissed", { kind }, null);
    setHidden(true);
  };

  const onAdd = async () => {
    track("install_click", { kind, prompt: canPrompt }, null);
    if (canPrompt) {
      const accepted = await promptInstall();
      setCanPrompt(false);
      if (accepted) { setHidden(true); return; }
    }
    setShowSteps(true);
  };

  return (
    <div className="md:hidden fixed z-[450] font-hebrew" style={bannerStyle} dir="rtl" role="dialog" aria-label="הוספה למסך הבית">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 11, flexShrink: 0, background: "#fff" }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>הוסיפו את GiveMyTime למסך הבית</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.4, opacity: 0.85, marginTop: 1 }}>נפתח כמו אפליקציה, בלחיצה אחת, ונשארים מחוברים</div>
        </div>
        <button
          type="button"
          aria-label="סגירה"
          onClick={dismiss}
          style={{ background: "none", border: 0, color: "rgba(255,255,255,.75)", cursor: "pointer", padding: 2, lineHeight: 0, alignSelf: "flex-start" }}
        >
          <X style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {showSteps ? (
        <ol style={{ margin: "10px 0 0", padding: 0, listStyle: "none", fontSize: 13.5, lineHeight: 1.5 }}>
          {kind === "ios" ? (
            <>
              <li className="flex items-center gap-2">
                <StepNum n={1} /> לחצו על כפתור השיתוף
                <Share style={{ width: 17, height: 17 }} aria-label="שיתוף" />
                <span style={{ opacity: 0.8, fontSize: 12 }}>(בתחתית המסך או ליד הכתובת)</span>
              </li>
              <li className="flex items-center gap-2" style={{ marginTop: 6 }}>
                <StepNum n={2} /> גללו ובחרו ״הוספה למסך הבית״
                <SquarePlus style={{ width: 17, height: 17 }} aria-hidden />
              </li>
            </>
          ) : (
            <>
              <li className="flex items-center gap-2">
                <StepNum n={1} /> לחצו על התפריט
                <MoreVertical style={{ width: 17, height: 17 }} aria-label="תפריט" />
                <span style={{ opacity: 0.8, fontSize: 12 }}>(למעלה בפינה)</span>
              </li>
              <li className="flex items-center gap-2" style={{ marginTop: 6 }}>
                <StepNum n={2} /> בחרו ״הוספה למסך הבית״ או ״התקנת אפליקציה״
              </li>
            </>
          )}
        </ol>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="w-full font-bold"
          style={{ marginTop: 10, background: "#fff", color: "#0A2B6B", border: 0, borderRadius: 12, padding: "10px 12px", fontSize: 14.5, cursor: "pointer" }}
        >
          {canPrompt ? "הוספה למסך הבית" : "איך מוסיפים?"}
        </button>
      )}
    </div>
  );
}

function StepNum({ n }: { n: number }) {
  return (
    <span
      className="flex items-center justify-center shrink-0"
      style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", color: "#0A2B6B", fontSize: 12, fontWeight: 800 }}
    >
      {n}
    </span>
  );
}
