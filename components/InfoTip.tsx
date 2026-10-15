"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

/**
 * A small ⓘ marker after a term that explains it on hover (mouse only), on
 * keyboard focus or on a tap, which toggles it. Escape closes it.
 * Wrap the term's text in `children` so the whole phrase is the hover target.
 */
export default function InfoTip({
  term,
  children,
  align = "left",
}: {
  term: GlossaryTerm;
  children?: React.ReactNode;
  /** Which edge of the card lines up with the term. */
  align?: "left" | "right";
}) {
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
  // Only a mouse opens on hover: a finger's tap also fires enter/leave, which
  // used to open and then close the tip in one go.
  const isMouse = (e: React.PointerEvent) => e.pointerType === "mouse";
  return (
    <span
      ref={root}
      className="relative inline"
      onPointerEnter={(e) => isMouse(e) && setOpen(true)}
      onPointerLeave={(e) => isMouse(e) && setOpen(false)}
    >
      {children}
      <button
        type="button"
        aria-label="What does this mean?"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        // Keyboard focus opens; focus from a tap or click leaves it to the click, which toggles.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="relative ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current align-text-top text-[10px] font-semibold leading-none text-muted outline-none after:absolute after:-inset-3.5 after:content-[''] hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute top-full z-30 mt-1.5 w-72 max-w-[85vw] rounded-lg border border-border bg-surface p-3 text-left text-xs font-normal normal-case tracking-normal text-foreground shadow-lg ${align === "right" ? "right-0" : "left-0"} ${open ? "block" : "hidden"}`}
      >
        {GLOSSARY[term]}
      </span>
    </span>
  );
}
