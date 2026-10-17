import { describe, expect, it } from "vitest";
import { stepYear } from "./useCalculator";

describe("stepYear", () => {
  it("moves the start year by one in either direction", () => {
    expect(stepYear(2027, 1, 2026, 2090)).toBe(2028);
    expect(stepYear(2027, -1, 2026, 2090)).toBe(2026);
  });
  it("stays within the earliest and latest start years", () => {
    expect(stepYear(2026, -1, 2026, 2090)).toBe(2026);
    expect(stepYear(2090, 1, 2026, 2090)).toBe(2090);
    expect(stepYear(2027, -1, 2027, 2090)).toBe(2027);
  });
});
