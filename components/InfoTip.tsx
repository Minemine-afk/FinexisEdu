"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

/**
 * A small ⓘ marker after a term that explains it on hover (mouse only), on
 * keyboard focus or on a tap, which toggles it. Escape closes it.
 * Wrap the term's text in `children` so the whole phrase is the hover target.
 */
export default function InfoTip({
  term,
  text,
  children,
  align = "left",
}: {
  term: GlossaryTerm;
  /** Text to show in place of the glossary entry for `term`. */
  text?: string;
  children?: React.ReactNode;
  /** Which edge of the card lines up with the term. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLSpanElement>(null);
  // The card is fixed to the screen, so a scrolling table cannot clip it. It
  // sits under the term, slides sideways to stay in view, and opens upwards
  // when there is no room below (near the bottom, or above a phone's tab bar).
  useLayoutEffect(() => {
    const el = card.current;
    if (!open || !root.current || !el) return;
    const place = () => {
      const r = root.current!.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const bar = document.querySelector('nav[aria-label="Calculator sections"]')?.getBoundingClientRect().top;
      const floor = Math.min(window.innerHeight, bar ?? Infinity);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = align === "right" ? r.right - w : r.left;
      const x = Math.max(MARGIN, Math.min(left, width - w - MARGIN));
      const up = r.bottom + GAP + h > floor && r.top - GAP - h > 0;
      const y = up ? r.top - GAP - h : r.bottom + GAP;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      // Inside a transformed parent (a centred dialog) "fixed" is relative to that parent; correct by the difference.
      const at = el.getBoundingClientRect();
      if (Math.abs(at.left - x) > 0.5 || Math.abs(at.top - y) > 0.5) {
        el.style.left = `${2 * x - at.left}px`;
        el.style.top = `${2 * y - at.top}px`;
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);
  // What kind of pointer pressed the marker last: a mouse click pins a tip
  // that hover opened (clicking it must not close it), a tap toggles.
  const pointer = useRef<string | null>(null);
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
  // The term's last word is glued to the marker so the marker never wraps alone.
  const [head, tail] = splitLastWord(children);
  return (
    <span
      ref={root}
      className="relative inline"
      onPointerEnter={(e) => isMouse(e) && setOpen(true)}
      onPointerLeave={(e) => isMouse(e) && setOpen(false)}
    >
      {head}
      <span className={tail === null ? undefined : "whitespace-nowrap"}>
        {tail}
      <button
          type="button"
          aria-label="What does this mean?"
          aria-describedby={id}
          aria-expanded={open}
          onPointerDown={(e) => {
            pointer.current = e.pointerType;
          }}
          onClick={() => {
            const mouse = pointer.current === "mouse";
            pointer.current = null;
            setOpen((o) => (mouse ? true : !o));
          }}
          // Keyboard focus opens; focus from a tap or click leaves it to the click, which toggles.
          onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="relative ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current align-text-top text-[10px] font-semibold leading-none text-muted outline-none after:absolute after:-inset-3.5 after:content-[''] pointer-fine:after:-inset-y-1 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
        >
          i
        </button>
      </span>
      <span
        id={id}
        ref={card}
        role="tooltip"
        className={`fixed left-0 top-0 z-50 w-72 max-w-[85vw] rounded-lg border border-border bg-surface p-3 text-left text-xs font-normal normal-case tracking-normal text-foreground shadow-lg ${open ? "block" : "hidden"}`}
      >
        {text ?? GLOSSARY[term]}
      </span>
    </span>
  );
}

const MARGIN = 8;
const GAP = 6;

/** [everything before the last word, the last word] of text children; [children, null] otherwise. */
function splitLastWord(children: React.ReactNode): [React.ReactNode, React.ReactNode] {
  const parts = Array.isArray(children) ? children : [children];
  const last = parts[parts.length - 1];
  if (typeof last !== "string" || !last.trim()) return [children, null];
  const at = last.trimEnd().lastIndexOf(" ") + 1;
  const before = parts.slice(0, -1).map((c, i) => <Fragment key={i}>{c}</Fragment>);
  const head = at > 0 || before.length ? <>{before}{last.slice(0, at)}</> : null;
  return [head, last.slice(at)];
}
