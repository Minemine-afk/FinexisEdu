"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { University } from "@/lib/schema";

/**
 * A university's name as a link to its website, with a small card on hover
 * (mouse only), keyboard focus or tap that says what the university is and why
 * it is in the calculator. On a touch screen the first tap opens the card and
 * a second tap follows the link; Escape closes the card.
 */
export default function UniversityName({ university: u, className = "" }: { university: University; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  // iOS Safari gives neither buttons nor links focus on a tap, so blur never
  // fires there; a tap anywhere else closes the card instead.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const hasCard = !!(u.description || u.whyIncluded);
  // What kind of pointer pressed the link last, so a click can tell a tap from a mouse click.
  const pointer = useRef<string | null>(null);
  const isMouse = (e: React.PointerEvent) => e.pointerType === "mouse";

  return (
    <span
      ref={root}
      className="relative inline-block max-w-full"
      onPointerEnter={(e) => isMouse(e) && setOpen(true)}
      onPointerLeave={(e) => isMouse(e) && setOpen(false)}
    >
      <a
        href={u.website}
        target="_blank"
        rel="noreferrer"
        aria-describedby={hasCard ? id : undefined}
        className={`underline decoration-accent/50 decoration-dotted underline-offset-4 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-accent ${className}`}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
        }}
        // Keyboard focus opens the card; focus from a tap leaves it to the click below.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        // On touch screens the first tap opens the card; a second tap follows the link.
        onClick={(e) => {
          const touch = pointer.current !== null && pointer.current !== "mouse";
          pointer.current = null;
          if (hasCard && !open && touch) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {u.name}
      </a>
      {hasCard && (
        <span
          id={id}
          role="tooltip"
          className={`absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[85vw] rounded-lg border border-border bg-surface p-3 text-left text-xs font-normal normal-case tracking-normal text-foreground shadow-lg ${open ? "block" : "hidden"}`}
        >
          {u.description && <span className="block">{u.description}</span>}
          {u.whyIncluded && (
            <span className="mt-1.5 block text-muted">
              <span className="font-medium text-foreground">Why it&apos;s here: </span>
              {u.whyIncluded}
            </span>
          )}
          <span className="mt-1.5 block text-accent">Open website ↗</span>
        </span>
      )}
    </span>
  );
}
