"use client";

import { useSyncExternalStore } from "react";

export type Layout = "phone" | "tablet" | "desktop";
/** The layout before the client has measured the screen (server render and first client render). */
export type MaybeLayout = Layout | "pending";

// Phones get the tabbed layout; tablets get a sidebar with touch-sized
// controls; everything else gets the desktop layout. A wide touch screen up to
// an iPad Pro in landscape (1366px) counts as a tablet, as does a narrower
// touch screen whose short side is at least 600px (a small Android tablet such
// as a Galaxy Tab S4 in portrait, 712px wide), which a phone's never is.
const PHONE = "(max-width: 767px)";
const NARROW = "(max-width: 1023px)";
const COARSE = "(pointer: coarse)";
const WIDE_TOUCH = `(max-width: 1366px) and ${COARSE}`;
const TABLET_SHORT_SIDE = 600;

function current(): Layout {
  const touch = window.matchMedia(COARSE).matches || navigator.maxTouchPoints > 0;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  if (window.matchMedia(PHONE).matches) {
    return touch && shortSide >= TABLET_SHORT_SIDE ? "tablet" : "phone";
  }
  if (window.matchMedia(NARROW).matches) return "tablet";
  if (window.matchMedia(WIDE_TOUCH).matches || (window.innerWidth <= 1366 && touch)) return "tablet";
  return "desktop";
}

function subscribe(onChange: () => void) {
  const lists = [PHONE, NARROW, COARSE, WIDE_TOUCH].map((q) => window.matchMedia(q));
  window.addEventListener("resize", onChange);
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => {
    window.removeEventListener("resize", onChange);
    lists.forEach((l) => l.removeEventListener("change", onChange));
  };
}

/** Which layout fits the screen; "pending" until the client has measured it. */
export function useLayout(): MaybeLayout {
  return useSyncExternalStore<MaybeLayout>(subscribe, current, () => "pending");
}
