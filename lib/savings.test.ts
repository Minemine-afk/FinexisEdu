import { describe, expect, it } from "vitest";
import {
  growTo,
  lumpSum,
  monthlySaving,
  monthsBetween,
  neededAtStart,
  simulate,
  solveTvm,
  type Tvm,
} from "./savings";

// Manchester BSc Computer Science from 2034 with living costs, in SGD.
const MANCHESTER = [125789, 131484, 137446];
const TODAY = { year: 2026, month: 9 }; // October 2026
const MONTHS = monthsBetween(TODAY, { year: 2034, month: 8 }); // to September 2034

describe("savings planner", () => {
  it("counts months from today to the first fees", () => {
    expect(MONTHS).toBe(95);
    expect(monthsBetween(TODAY, { year: 2026, month: 3 })).toBe(0);
  });

  it("discounts later years when costs are paid as they fall due", () => {
    expect(neededAtStart(MANCHESTER, 4, "start")).toBe(394719);
    expect(neededAtStart(MANCHESTER, 4, "yearly")).toBeCloseTo(379021, -1);
    expect(neededAtStart(MANCHESTER, 0, "yearly")).toBe(394719);
  });

  it("finds the monthly saving at 4% and at 2%", () => {
    const at4 = monthlySaving(neededAtStart(MANCHESTER, 4, "yearly"), 0, 4, MONTHS);
    const at2 = monthlySaving(neededAtStart(MANCHESTER, 2, "yearly"), 0, 2, MONTHS);
    expect(Math.round(at4)).toBe(3398);
    expect(Math.round(at2)).toBe(3760);
  });

  it("needs nothing more when savings already cover the cost", () => {
    expect(monthlySaving(1000, 2000, 4, 12)).toBe(0);
    expect(lumpSum(1000, 2000, 4, 12)).toBe(0);
    expect(monthlySaving(1000, 0, 4, 0)).toBe(Infinity);
  });

  it("pays every cost and ends at zero when saving the planned amount", () => {
    const need = neededAtStart(MANCHESTER, 4, "yearly");
    const monthly = monthlySaving(need, 0, 4, MONTHS);
    const plan = simulate({
      start: 0,
      monthly,
      months: MONTHS,
      ratePct: 4,
      yearCosts: MANCHESTER,
      today: TODAY,
    });
    const last = plan.points[plan.points.length - 1];
    expect(last.balance).toBeCloseTo(0, 2);
    expect(plan.paidIn + plan.interest).toBeCloseTo(394719, 2);
    expect(plan.years.reduce((s, y) => s + y.costs, 0)).toBeCloseTo(394719, 2);
    expect(plan.years[0].year).toBe(2026);
    expect(plan.years[plan.years.length - 1].year).toBe(2036);
  });

  it("matches growTo for a plan with no costs", () => {
    const plan = simulate({ start: 5000, monthly: 200, months: 60, ratePct: 4, today: TODAY });
    expect(plan.points[60].balance).toBeCloseTo(growTo(5000, 200, 4, 60), 6);
  });

  it("works out any one of the five boxes from the other four", () => {
    const t: Tvm = { months: 95, rate: 4, start: 1000, monthly: 3000, end: 0, startOfMonth: false };
    t.end = solveTvm(t, "end");
    expect(solveTvm(t, "monthly")).toBeCloseTo(3000, 6);
    expect(solveTvm(t, "start")).toBeCloseTo(1000, 6);
    expect(solveTvm(t, "months")).toBeCloseTo(95, 6);
    expect(solveTvm(t, "rate")).toBeCloseTo(4, 4);
    const begin = { ...t, startOfMonth: true };
    expect(solveTvm(begin, "end")).toBeGreaterThan(t.end);
    expect(solveTvm({ ...t, rate: 0 }, "end")).toBe(1000 + 3000 * 95);
  });

  it("takes the first year's fees out today when there is no time to save", () => {
    const costs = [100000, 100000, 100000];
    const lump = lumpSum(neededAtStart(costs, 4, "yearly"), 0, 4, 0);
    const plan = simulate({ start: lump, monthly: 0, months: 0, ratePct: 4, yearCosts: costs, today: TODAY });
    expect(plan.years[0].costs).toBe(100000);
    expect(plan.years.reduce((s, y) => s + y.costs, 0)).toBe(300000);
    expect(plan.points[plan.points.length - 1].balance).toBeCloseTo(0, 2);
  });

  it("answers zero, not a negative amount, when what's there already covers the end amount", () => {
    const t: Tvm = { months: 24, rate: 4, start: 300000, monthly: 0, end: 200000, startOfMonth: false };
    expect(solveTvm(t, "monthly")).toBe(0);
    expect(solveTvm({ ...t, monthly: 10000, end: 100000 }, "start")).toBe(0);
    expect(solveTvm(t, "months")).toBe(0);
    expect(solveTvm({ ...t, rate: 0 }, "months")).toBe(0);
  });

  it("never asks for infinite months and needs no interest when 0% already gets there", () => {
    expect(solveTvm({ months: 0, rate: 4, start: 0, monthly: 0, end: 1000, startOfMonth: false }, "months")).toBeNaN();
    expect(solveTvm({ months: 24, rate: 4, start: 0, monthly: 1000, end: 23000, startOfMonth: false }, "rate")).toBe(0);
  });

  it("answers NaN, never a rate of 60%, when any other box is blank", () => {
    const full: Tvm = { months: 24, rate: 4, start: 1000, monthly: 500, end: 14000, startOfMonth: false };
    const fields = ["months", "rate", "start", "monthly", "end"] as const;
    for (const solve of fields) {
      for (const blank of fields) {
        if (blank === solve) continue;
        expect(solveTvm({ ...full, [blank]: NaN }, solve), `${solve} with ${blank} blank`).toBeNaN();
      }
    }
    // "Clear form" then "Solve" on the rate: every other box is blank.
    expect(solveTvm({ months: NaN, rate: NaN, start: NaN, monthly: NaN, end: NaN, startOfMonth: false }, "rate")).toBeNaN();
    // A blank box being solved is fine: it is the one being filled in.
    expect(solveTvm({ ...full, end: NaN }, "end")).toBeGreaterThan(full.start);
  });

  it("needs the whole end amount today when the fees are due now (no months to save)", () => {
    const due: Tvm = { months: 0, rate: 4, start: NaN, monthly: 0, end: 394719, startOfMonth: false };
    expect(solveTvm(due, "start")).toBe(394719);
    expect(solveTvm({ ...due, monthly: 3000 }, "start")).toBe(394719);
    expect(solveTvm({ ...due, rate: 2 }, "start")).toBe(394719);
    expect(solveTvm({ ...due, start: 394719 }, "end")).toBe(394719);
    // The same today when starting from the beginning of the month.
    expect(solveTvm({ ...due, startOfMonth: true }, "start")).toBe(394719);
  });

  it("keeps the year-by-year rows consistent without a costs column", () => {
    const plan = simulate({ start: 1000, monthly: 500, months: 30, ratePct: 4, today: TODAY });
    const paidIn = plan.years.reduce((s, y) => s + y.paidIn, 0);
    const interest = plan.years.reduce((s, y) => s + y.interest, 0);
    expect(paidIn).toBeCloseTo(1000 + 500 * 30, 6);
    expect(paidIn).toBeCloseTo(plan.paidIn, 6);
    expect(interest).toBeCloseTo(plan.interest, 6);
    // Each year's balance is the previous balance plus that year's money in and interest.
    let balance = 0;
    for (const y of plan.years) {
      balance += y.paidIn + y.interest;
      expect(y.costs).toBe(0);
      expect(y.balance).toBeCloseTo(balance, 6);
    }
    expect(plan.years[plan.years.length - 1].balance).toBeCloseTo(growTo(1000, 500, 4, 30), 6);
  });

  it("finds no rate when nothing is put in or there is no time", () => {
    expect(solveTvm({ months: 24, rate: 4, start: 0, monthly: 0, end: 0, startOfMonth: false }, "rate")).toBeNaN();
    expect(solveTvm({ months: 0, rate: 4, start: 1000, monthly: 0, end: 1000, startOfMonth: false }, "rate")).toBeNaN();
    expect(solveTvm({ months: 24, rate: 4, start: 0, monthly: 0, end: 1000, startOfMonth: false }, "rate")).toBeNaN();
  });
});
