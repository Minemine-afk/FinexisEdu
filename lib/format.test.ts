import { describe, expect, it } from "vitest";
import { formatCompactSgd } from "./format";

describe("formatCompactSgd", () => {
  it("rounds before picking the unit", () => {
    expect(formatCompactSgd(999960)).toBe("S$1M");
    expect(formatCompactSgd(949000)).toBe("S$949K");
    expect(formatCompactSgd(34210)).toBe("S$34.2K");
    expect(formatCompactSgd(999.6)).toBe("S$1K");
    expect(formatCompactSgd(950)).toBe("S$950");
    expect(formatCompactSgd(0)).toBe("S$0");
    expect(formatCompactSgd(2_500_000)).toBe("S$2.5M");
  });
});
