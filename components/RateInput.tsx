"use client";

import { useState } from "react";
import { FOCUS } from "./ResultDetail";

export const MAX_CUSTOM_RATE = 20;

/**
 * The "use my own rate" percentage box. Keeps what the user is typing as text,
 * so the field can be cleared or hold "3." while editing, and applies a value
 * between 0 and 20% once it is a number; leaving the field tidies it up.
 */
export default function RateInput({
  value,
  onChange,
  className = "",
}: {
  /** The applied rate as a fraction, e.g. 0.03. */
  value: number;
  onChange: (rate: number) => void;
  className?: string;
}) {
  const shown = String(+(value * 100).toFixed(1));
  const [text, setText] = useState(shown);
  // Follow outside changes (another control, a reset) without fighting the user's typing.
  const [applied, setApplied] = useState(value);
  if (applied !== value) {
    setApplied(value);
    setText(shown);
  }
  const clamp = (n: number) => Math.min(MAX_CUSTOM_RATE, Math.max(0, n));
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={MAX_CUSTOM_RATE}
      step={0.5}
      aria-label="Yearly fee increase in percent"
      className={`rounded-md border border-border bg-surface px-2 text-right tabular-nums${FOCUS} ${className}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) {
          const rate = clamp(n) / 100;
          setApplied(rate);
          onChange(rate);
        }
      }}
      onBlur={() => setText(String(+(value * 100).toFixed(1)))}
    />
  );
}
