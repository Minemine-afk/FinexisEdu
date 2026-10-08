"use client";

import { useSyncExternalStore } from "react";

export type Layout = "phone" | "tablet" | "desktop";

// Phones get the tabbed layout; tablets get a sidebar with touch-sized
// controls; everything else gets the desktop layout. A wide touch screen up to
// an iPad Pro in landscape (1366px) counts as a tablet.
const PHONE = "(max-width: 767px)";
const NARROW = "(max-width: 1023px)";
const WIDE_TOUCH = "(max-width: 1366px) and (pointer: coarse)";

function current(): Layout {
  if (window.matchMedia(PHONE).matches) return "phone";
  if (window.matchMedia(NARROW).matches) return "tablet";
  if (
    window.matchMedia(WIDE_TOUCH).matches ||
    (window.innerWidth <= 1366 && navigator.maxTouchPoints > 0)
  )
    return "tablet";
  return "desktop";
}

function subscribe(onChange: () => void) {
  const lists = [PHONE, NARROW, WIDE_TOUCH].map((q) => window.matchMedia(q));
  window.addEventListener("resize", onChange);
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => {
    window.removeEventListener("resize", onChange);
    lists.forEach((l) => l.removeEventListener("change", onChange));
  };
}

/** Which layout fits the screen. The server (and the first client render) assume desktop. */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, current, () => "desktop");
}
