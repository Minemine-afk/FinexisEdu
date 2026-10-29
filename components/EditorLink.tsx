"use client";

import { useSyncExternalStore } from "react";

// A computer has a mouse or trackpad as its main pointer and a window wide enough for the desktop layout.
const COMPUTER = "(pointer: fine) and (hover: hover) and (min-width: 1024px)";

function onComputer(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android|Mobi/i.test(ua)) return false;
  // iPadOS Safari presents itself as a Mac, but a real Mac has no touch screen.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return false;
  return window.matchMedia(COMPUTER).matches;
}

function subscribe(onChange: () => void) {
  const list = window.matchMedia(COMPUTER);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * The way into the editor: a faint symbol that only computers get, touch
 * laptops included. Phones and tablets (including an iPad with a keyboard or
 * trackpad) never have it in the page at all.
 */
export default function EditorLink() {
  if (!useSyncExternalStore(subscribe, onComputer, () => false)) return null;
  return (
    <a
      href="/admin"
      aria-label="Editor login"
      className="rounded px-1.5 py-1 text-on-accent-muted opacity-[0.12] transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <rect x="1" y="1" width="2" height="12" rx="1" />
        <rect x="6" y="1" width="2" height="12" rx="1" />
        <rect x="11" y="1" width="2" height="12" rx="1" />
      </svg>
    </a>
  );
}
