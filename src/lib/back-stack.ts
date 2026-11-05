"use client";

import { useEffect, useRef } from "react";

// Phone Back closes what's open (a place, a list, filters, a tab) instead of leaving the app.
// Each open layer owns one history entry. Back pops the newest layer; closing a layer
// from the UI (✕) quietly removes its entry, so Back never "closes" something already gone.

type Layer = { id: number; close: () => void };

const stack: Layer[] = [];
let nextId = 1;
let pendingPops = 0; // entries of layers closed from the UI, removed together on the next tick
let ignorePops = 0; // popstate events we caused ourselves
let popTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function onPopState() {
  if (ignorePops > 0) { ignorePops--; return; }
  const top = stack.pop();
  top?.close();
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", onPopState);
}

function entryState() {
  // Keep Next.js's own history state on the entry; it reads it on popstate.
  const cur = window.history.state;
  return { ...(cur && typeof cur === "object" ? cur : {}), gmtLayer: stack.length };
}

function openLayer(close: () => void): number {
  listen();
  const layer = { id: nextId++, close };
  stack.push(layer);
  try {
    if (pendingPops > 0) {
      // Something closed in the same moment this opened (e.g. list → place): reuse its entry.
      pendingPops--;
      window.history.replaceState(entryState(), "");
    } else {
      window.history.pushState(entryState(), "");
    }
  } catch {}
  return layer.id;
}

function closeLayer(id: number) {
  const i = stack.findIndex((l) => l.id === id);
  if (i === -1) return; // already removed by Back
  stack.splice(i, 1);
  pendingPops++;
  if (popTimer) return;
  popTimer = setTimeout(() => {
    popTimer = null;
    const n = pendingPops;
    pendingPops = 0;
    if (n <= 0) return;
    ignorePops++;
    try { window.history.go(-n); } catch { ignorePops--; }
  }, 0);
}

/** While `open` is true, phone/browser Back calls `close` instead of leaving the page. */
export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const id = openLayer(() => closeRef.current());
    return () => closeLayer(id);
  }, [open]);
}
