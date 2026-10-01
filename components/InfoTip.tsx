"use client";

import { useId, useState } from "react";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

/**
 * A small ⓘ marker after a term that explains it on hover, keyboard focus or tap.
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
  return (
    <span className="relative inline" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      <button
        type="button"
        aria-label="What does this mean?"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current align-text-top text-[10px] font-semibold leading-none text-muted outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
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
