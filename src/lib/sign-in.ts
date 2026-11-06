"use client";

import { supabase } from "@/lib/supabase";
import { publicEnv } from "@/lib/env/public";
import { track, SIGNING_IN_KEY } from "@/lib/analytics";

/**
 * Google sign-in.
 *
 * Preferred path: Google's own sign-in (Google Identity Services) on our page. Google's
 * window then says "continue to givemytimeapp.com", and the ID token it returns is handed
 * to Supabase with signInWithIdToken, so the visitor never leaves the page and never sees
 * the <ref>.supabase.co address.
 *
 * Fallback: the old Supabase redirect (signInWithOAuth), used when the client ID is not
 * configured, Google's script fails to load, or Google won't show its window.
 * The redirect always returns to the site origin, so the page to return to is kept in
 * sessionStorage and HomeMap navigates there once the session exists.
 */
const RETURN_KEY = "gmt_return_to";
const GIS_SRC = "https://accounts.google.com/gsi/client";

/* ---------- Google Identity Services (minimal typing) ---------- */

type GisCredentialResponse = { credential?: string };
type GisPromptNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  getSkippedReason?: () => string;
};
type GisId = {
  initialize: (cfg: Record<string, unknown>) => void;
  prompt: (cb?: (n: GisPromptNotification) => void) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
  cancel: () => void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GisId } };
  }
}

let gisPromise: Promise<GisId | null> | null = null;

/** Loads Google's sign-in script once. Resolves null when not configured or it fails. */
export function loadGoogleSignIn(): Promise<GisId | null> {
  if (typeof window === "undefined" || !publicEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID || !supabase) {
    return Promise.resolve(null);
  }
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google?.accounts?.id ?? null);
    s.onerror = () => {
      gisPromise = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sets Google up for one sign-in attempt. Google gets the hashed nonce, Supabase the raw
 * one, so a token can't be replayed. Call before prompt() / renderButton().
 */
async function initGoogle(gis: GisId, onError?: () => void): Promise<void> {
  const raw = crypto.randomUUID() + crypto.randomUUID();
  const hashed = await sha256Hex(raw);
  gis.initialize({
    client_id: publicEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    nonce: hashed,
    ux_mode: "popup",
    auto_select: false,
    cancel_on_tap_outside: true,
    itp_support: true,
    use_fedcm_for_prompt: true,
    callback: async (resp: GisCredentialResponse) => {
      if (!supabase || !resp.credential) return;
      markSigningIn();
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: resp.credential,
        nonce: raw,
      });
      if (error) {
        console.error("[sign-in] signInWithIdToken failed", error);
        onError?.();
      }
    },
  });
}

function markSigningIn() {
  try {
    window.sessionStorage.setItem(SIGNING_IN_KEY, "1");
  } catch {}
}

/** The old full-page redirect through Supabase. */
async function redirectSignIn(returnTo?: string): Promise<void> {
  if (!supabase) return;
  const here = typeof returnTo === "string" ? returnTo : window.location.pathname + window.location.search;
  try {
    if (here !== "/") window.sessionStorage.setItem(RETURN_KEY, here);
  } catch {}
  markSigningIn();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

/**
 * Sign in from any of our own buttons. Opens Google's window on our page; if Google
 * won't show it, falls back to the redirect.
 * @param returnTo page to come back to after a redirect; defaults to the current page.
 */
export async function signInWithGoogle(returnTo?: string): Promise<void> {
  if (!supabase || typeof window === "undefined") return;
  track("sign_in_click", undefined, null);

  const gis = await loadGoogleSignIn();
  if (!gis) return redirectSignIn(returnTo);

  await initGoogle(gis, () => void redirectSignIn(returnTo));
  gis.prompt((n) => {
    // The visitor closing Google's window is a choice, not a failure: don't redirect.
    const reason = n.getSkippedReason?.();
    const userClosed = reason === "user_cancel" || reason === "tap_outside";
    if (n.isNotDisplayed?.() || (n.isSkippedMoment?.() && !userClosed)) {
      void redirectSignIn(returnTo);
    }
  });
}

/**
 * Renders Google's official sign-in button into `el`. Resolves false when Google's
 * sign-in isn't available (caller then shows its own button).
 */
export async function renderGoogleButton(el: HTMLElement, opts?: { width?: number }): Promise<boolean> {
  const gis = await loadGoogleSignIn();
  if (!gis) return false;
  await initGoogle(gis, () => void redirectSignIn());
  gis.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
    logo_alignment: "center",
    locale: "he",
    width: Math.min(400, Math.max(200, Math.round(opts?.width ?? 300))),
    click_listener: () => track("sign_in_click", undefined, null),
  });
  return true;
}

/** The page to go back to after sign-in, once. Only same-site paths. */
export function takeReturnPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(RETURN_KEY);
    window.sessionStorage.removeItem(RETURN_KEY);
    return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}
