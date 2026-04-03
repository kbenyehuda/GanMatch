export type NativeShareOutcome = "shared" | "aborted" | "unavailable";

function canTryShare(data: ShareData): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return true;
  try {
    return navigator.canShare(data);
  } catch {
    return false;
  }
}

/**
 * Opens the OS / browser share sheet when supported (common on mobile).
 * Tries a few ShareData shapes because platform support differs (e.g. url-only on some WebViews).
 */
export async function tryNavigatorShare(options: {
  title: string;
  text: string;
  url: string;
}): Promise<NativeShareOutcome> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unavailable";
  }

  const { title, text, url } = options;
  const candidates: ShareData[] = [
    { title, text, url },
    { text: `${text}\n\n${url}` },
    { title, url },
    { url },
  ];

  for (const data of candidates) {
    if (!canTryShare(data)) continue;
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "aborted";
    }
  }

  return "unavailable";
}
