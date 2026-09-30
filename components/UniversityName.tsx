"use client";

import { useId, useState } from "react";
import type { University } from "@/lib/schema";

/**
 * A university's name as a link to its website, with a small card on hover, focus
 * or tap that says what the university is and why it is in the calculator.
 */
export default function UniversityName({ university: u, className = "" }: { university: University; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const hasCard = !!(u.description || u.whyIncluded);

  return (
    <span
      className="relative inline-block max-w-full"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <a
        href={u.website}
        target="_blank"
        rel="noreferrer"
        aria-describedby={hasCard ? id : undefined}
        className={`underline decoration-accent/50 decoration-dotted underline-offset-4 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-accent ${className}`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // On touch screens the first tap opens the card; a second tap follows the link.
        onClick={(e) => {
          if (hasCard && !open && window.matchMedia("(hover: none)").matches) {
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
