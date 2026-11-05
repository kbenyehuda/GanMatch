"use client";

import { track } from "@/lib/analytics";

// Chrome on Android fires `beforeinstallprompt` once, early, when the site can be installed.
// Keep it so the banner can open the real install dialog later with one tap.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
let started = false;

export function startInstallCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own banner instead of Chrome's mini-bar
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    track("app_installed", undefined, null);
    listeners.forEach((l) => l());
  });
}

export function canPromptInstall() {
  return deferred !== null;
}

export function onInstallAvailabilityChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Opens Chrome's install dialog. Returns true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // each event can be used once
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === "accepted";
}

export type PhoneKind = "ios" | "android" | "other";

export function phoneKind(): PhoneKind {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Opened from the home screen already. */
export function isInstalled() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Instagram / Facebook / WhatsApp / other built-in browsers: separate storage, can't add to home screen. */
export function isInAppBrowser() {
  const ua = navigator.userAgent;
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i.test(ua);
}
