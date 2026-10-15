"use client";

import { useLayoutEffect, type RefObject } from "react";

const MARGIN = 8;

/**
 * Slides a floating card sideways (a transform set straight on the element) so
 * it stays inside the viewport with a small margin, measured each time it
 * opens or the window resizes. Closed cards keep no shift.
 */
export function useClampX(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!open) {
      el.style.transform = "";
      return;
    }
    const measure = () => {
      // Measure the card where it would sit unshifted.
      el.style.transform = "";
      const r = el.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      let shift = 0;
      if (r.right > width - MARGIN) shift = width - MARGIN - r.right;
      if (r.left + shift < MARGIN) shift = MARGIN - r.left;
      el.style.transform = shift ? `translateX(${shift}px)` : "";
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, open]);
}
