"use client";

import { useLayout } from "./useLayout";

/**
 * The way into the editor: a faint symbol that only computers get. Phones and
 * tablets (including an iPad with a keyboard or trackpad) never have it in the
 * page at all, using the same test the calculator uses to pick its touch layout.
 */
export default function EditorLink() {
  if (useLayout() !== "desktop") return null;
  return (
    <a
      href="/admin"
      aria-label="Editor login"
      className="rounded px-1.5 py-1 text-on-accent-muted opacity-30 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <rect x="1" y="1" width="2" height="12" rx="1" />
        <rect x="6" y="1" width="2" height="12" rx="1" />
        <rect x="11" y="1" width="2" height="12" rx="1" />
      </svg>
    </a>
  );
}
