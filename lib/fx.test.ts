import { afterEach, describe, expect, it, vi } from "vitest";
import { getImfRates, imfCountry, monthEnd } from "./fx";

const csv = (rows: string[]) => ["DATAFLOW,COUNTRY,INDICATOR,TYPE_OF_TRANSFORMATION,FREQUENCY,TIME_PERIOD,OBS_VALUE", ...rows].join("\n");

afterEach(() => vi.unstubAllGlobals());

describe("IMF exchange rates", () => {
  it("maps currencies to IMF country codes", () => {
    expect(["GBP", "USD", "EUR", "JPY", "HKD", "XOF", "ZZZ"].map(imfCountry)).toEqual(["GBR", "USA", "G163", "JPN", "HKG", "G758", undefined]);
  });

  it("crosses each currency with the Singapore dollar on the same month end", async () => {
    let asked = "";
    vi.stubGlobal("fetch", async (url: string) => {
      asked = url;
      return new Response(
        csv([
          "ER,SGP,XDC_USD,EOP_RT,M,2026-M08,1.30",
          "ER,SGP,XDC_USD,EOP_RT,M,2026-M09,1.25",
          "ER,GBR,XDC_USD,EOP_RT,M,2026-M09,0.75",
          "ER,G163,XDC_USD,EOP_RT,M,2026-M08,0.871",
          "ER,USA,XDC_USD,EOP_RT,M,2026-M09,1",
        ]),
      );
    });
    const fx = await getImfRates(["GBP", "EUR", "USD", "ZZZ"], {}, new Date("2026-10-26"));
    expect(asked).toContain("/IMF.STA,ER/SGP+GBR+G163+USA.XDC_USD.EOP_RT.M?startPeriod=2025-10");
    expect(fx).toEqual({ base: "SGD", date: "2026-09-30", rates: { GBP: 0.6, EUR: 0.67, USD: 0.8 }, earlier: { EUR: "2026-08" } });
  });

  it("gives the last day of a month", () => {
    expect([monthEnd("2026-02"), monthEnd("2028-02"), monthEnd("2026-12")]).toEqual(["2026-02-28", "2028-02-29", "2026-12-31"]);
  });
});
