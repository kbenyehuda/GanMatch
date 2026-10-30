"use client";

import { supabase } from "@/lib/supabase";

/**
 * Google sign-in that comes back to the page the user started on.
 *
 * OAuth always returns to the site origin (Supabase only allows listed redirect URLs,
 * and a path like /place/<id> may not be on that list), so the page to return to is
 * kept in sessionStorage and HomeMap navigates there once the session exists.
 */
const RETURN_KEY = "gmt_return_to";

/** @param returnTo page to come back to; defaults to the current page. */
export async function signInWithGoogle(returnTo?: string): Promise<void> {
  if (!supabase || typeof window === "undefined") return;
  const here = typeof returnTo === "string" ? returnTo : window.location.pathname + window.location.search;
  try {
    if (here !== "/") window.sessionStorage.setItem(RETURN_KEY, here);
  } catch {}
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
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
