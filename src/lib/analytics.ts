"use client";

import { supabase } from "@/lib/supabase";

// Visitor analytics. Guests get an anonymous id in localStorage; a visit (session) lasts until the tab closes.
// Every call is best-effort: storage or network failures never reach the UI.

const VISITOR_KEY = "gmt_vid";
const SESSION_KEY = "gmt_sid";
const SRC_KEY = "gmt_src";
export const SIGNING_IN_KEY = "gmt_signing_in"; // set before the Google redirect, read when the visitor comes back signed in
const IGNORE_KEY = "gmt_analytics_ignore"; // set on an admin's device so her own clicks aren't counted

let current: { placeId: string | null; placeName: string | null; category: string | null } = {
  placeId: null, placeName: null, category: null,
};

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function stored(storage: () => Storage, key: string): string {
  try {
    const s = storage();
    let v = s.getItem(key);
    if (!v) { v = newId(); s.setItem(key, v); }
    return v;
  } catch {
    return (memIds[key] ??= newId());
  }
}
const memIds: Record<string, string> = {};

function ignored() {
  try { return window.localStorage.getItem(IGNORE_KEY) === "1"; } catch { return false; }
}

/** Whether this browser is excluded from the counts (it was used by an admin). */
export function isBrowserExcluded() {
  return typeof window !== "undefined" && ignored();
}

/** Count this browser again (e.g. to test as a guest after signing out). */
export function includeThisBrowser() {
  try { window.localStorage.removeItem(IGNORE_KEY); } catch {}
}

/** The place whose window is open, so clicks inside it are tied to that place. */
export function setAnalyticsPlace(p: { id: string; name?: string | null; category?: string | null } | null) {
  current = { placeId: p?.id ?? null, placeName: p?.name ?? null, category: p?.category ?? null };
}

export function track(event: string, props?: Record<string, unknown>, entityId?: string | null) {
  if (typeof window === "undefined" || ignored()) return;
  if (window.location.pathname.startsWith("/admin")) return;
  const body = JSON.stringify({
    event,
    visitor_id: stored(() => window.localStorage, VISITOR_KEY),
    session_id: stored(() => window.sessionStorage, SESSION_KEY),
    entity_id: entityId === undefined ? current.placeId : entityId,
    props,
  });
  void (async () => {
    try {
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
      const res = await fetch("/api/telemetry/collect", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body,
      });
      const data = await res.json().catch(() => null);
      if (data?.ignore) { try { window.localStorage.setItem(IGNORE_KEY, "1"); } catch {} }
    } catch {}
  })();
}

/** Clicks on anything marked data-track="<event>" (inside a place window they carry that place). */
function onDocumentClick(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest?.("[data-track]");
  if (!el) return;
  const event = el.getAttribute("data-track");
  if (!event) return;
  track(event, current.placeId ? { name: current.placeName, category: current.category } : undefined);
}

let started = false;

/** Once per page load: count the visit (with the link's ?src= tag) and start listening for clicks. */
export function startAnalytics() {
  if (started || typeof window === "undefined") return;
  started = true;
  document.addEventListener("click", onDocumentClick, { capture: true });

  const url = new URL(window.location.href);
  const tag = url.searchParams.get("src") || url.searchParams.get("utm_source");
  let src: string | null = null;
  try {
    if (tag) window.sessionStorage.setItem(SRC_KEY, tag.slice(0, 60));
    src = window.sessionStorage.getItem(SRC_KEY);
  } catch { src = tag; }
  // Drop the tag from the address bar so a re-shared link isn't counted as the same source.
  if (tag) {
    url.searchParams.delete("src");
    url.searchParams.delete("utm_source");
    try { window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash); } catch {}
  }

  let isNewVisit = true;
  try { isNewVisit = !window.sessionStorage.getItem(SESSION_KEY); } catch {}
  if (!isNewVisit) return; // a reload inside the same visit

  let ref: string | null = null;
  try {
    const r = document.referrer ? new URL(document.referrer).hostname : "";
    ref = r && r !== window.location.hostname ? r.replace(/^www\./, "") : null;
  } catch {}

  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  track("app_open", {
    src,
    ref,
    page: window.location.pathname,
    device: window.matchMedia?.("(max-width: 767px)").matches ? "mobile" : "desktop",
    installed: standalone,
  }, null);
}
