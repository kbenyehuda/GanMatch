"use client";

import { useEffect } from "react";
import { startInstallCapture } from "@/lib/install-prompt";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    startInstallCapture(); // catch Chrome's one-time install offer for the home-screen banner
    if (!("serviceWorker" in navigator)) return;

    // Avoid aggressive caching surprises during local dev.
    if (process.env.NODE_ENV !== "production") return;

    // updateViaCache "none" + update(): a new sw.js is picked up on the next visit, never a stale one
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => reg.update().catch(() => {}))
      .catch((err) => console.warn("[GanMatch] service worker registration failed", err));
  }, []);

  return null;
}

