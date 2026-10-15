// Independent check of the Time Value of Money maths: every solved box, fed back
// into a plain month-by-month loop, must reproduce the end amount.
import { describe, expect, it } from "vitest";
import { solveTvm, simulate, type Tvm, type TvmField } from "./savings";
// Brute-force month-by-month growth, independent of the closed forms.
function brute(t: Tvm): number {
  const i = t.rate / 1200; let b = t.start;
  for (let m = 0; m < Math.round(t.months * 1e6) / 1e6; m++) { if (t.startOfMonth) b += t.monthly; b *= 1 + i; if (!t.startOfMonth) b += t.monthly; }
  return b;
}
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
describe("TVM cross-check", () => {
  it("every solved box reproduces the end amount under brute-force growth", () => {
    let n = 0;
    for (let k = 0; k < 500; k++) {
      const t: Tvm = { months: Math.floor(rnd() * 240) + 1, rate: rnd() < 0.1 ? 0 : rnd() * 15, start: rnd() < 0.3 ? 0 : rnd() * 100000, monthly: rnd() < 0.3 ? 0 : rnd() * 5000, end: 0, startOfMonth: rnd() < 0.5 };
      if (t.start === 0 && t.monthly === 0) continue;
      t.end = brute(t);
      expect(solveTvm(t, "end")).toBeCloseTo(t.end, 4);
      for (const f of ["start", "monthly", "months", "rate"] as TvmField[]) {
        if (f === "rate" && (t.rate === 0 || t.rate > 15)) continue;
        if (f === "start" && t.start === 0) continue;
        if (f === "monthly" && t.monthly === 0) continue;
        const v = solveTvm({ ...t, [f]: NaN }, f);
        expect(Number.isFinite(v), `${f} ${JSON.stringify(t)}`).toBe(true);
        const back = brute({ ...t, [f]: v });
        expect(back / t.end, `${f} ${JSON.stringify(t)} -> ${v}`).toBeCloseTo(1, 5);
        n++;
      }
      // simulate agrees with brute
      const p = simulate({ start: t.start, monthly: t.monthly, months: t.months, ratePct: t.rate, startOfMonth: t.startOfMonth, today: { year: 2026, month: 9 } });
      expect(p.points[t.months].balance / t.end).toBeCloseTo(1, 8);
      expect(p.paidIn).toBeCloseTo(t.start + t.monthly * t.months, 6);
      expect(p.paidIn + p.interest).toBeCloseTo(t.end, 4);
    }
  });
});
