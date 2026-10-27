import { afterEach, describe, expect, it, vi } from "vitest";
import { getImfRates, getRates, imfCountry, monthEnd } from "./fx";

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
    expect(fx).toEqual({ rates: { GBP: 0.6, EUR: 0.67, USD: 0.8 }, months: { GBP: "2026-09", EUR: "2026-08", USD: "2026-09" } });
  });

  it("takes ECB rates first and only asks the IMF for the rest", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (url.includes("frankfurter")) return Response.json({ base: "SGD", date: "2026-10-26", rates: { EUR: 0.698, GBP: 0.59 } });
      return new Response(csv(["ER,SGP,XDC_USD,EOP_RT,M,2026-M09,1.25", "ER,G758,XDC_USD,EOP_RT,M,2026-M08,560", "ER,SGP,XDC_USD,EOP_RT,M,2026-M08,1.25"]));
    });
    expect(await getRates(["GBP", "EUR"])).toEqual({ base: "SGD", date: "2026-10-26", rates: { GBP: 0.59, EUR: 0.698 } });
    expect(asked).toHaveLength(1);
    expect(await getRates(["EUR", "XOF"], {}, new Date("2026-10-26"))).toEqual({
      base: "SGD",
      date: "2026-10-26",
      rates: { EUR: 0.698, XOF: 448 },
      monthEnd: { XOF: "2026-08" },
    });
    expect(asked.at(-1)).toContain("/IMF.STA,ER/SGP+G758.");
  });

  it("gives the last day of a month", () => {
    expect([monthEnd("2026-02"), monthEnd("2028-02"), monthEnd("2026-12")]).toEqual(["2026-02-28", "2028-02-29", "2026-12-31"]);
  });
});
