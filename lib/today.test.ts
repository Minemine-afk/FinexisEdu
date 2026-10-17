import { describe, expect, it } from "vitest";
import { singaporeToday } from "./today";

describe("singaporeToday", () => {
  it("is already the next day in Singapore late in the UTC evening", () => {
    expect(singaporeToday(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
  });
  it("matches the UTC date in the Singapore afternoon", () => {
    expect(singaporeToday(new Date("2026-10-16T06:00:00Z"))).toBe("2026-10-16");
  });
});
