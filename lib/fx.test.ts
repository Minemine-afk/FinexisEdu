import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFrankfurter, getEcbRates, getFrankfurterRates, getImfRates, getRates, imfCountry, monthEnd, parseEcbXml } from "./fx";

// 1.25 SGD, 0.7375 GBP per euro: 0.8 EUR and 0.59 GBP per SGD.
const ecbXml = `<gesmes:Envelope><Cube><Cube time='2026-10-26'>
  <Cube currency='USD' rate='1.0'/><Cube currency='GBP' rate='0.7375'/><Cube currency='SGD' rate='1.25'/>
</Cube></Cube></gesmes:Envelope>`;

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
      if (url.includes("ecb.europa.eu")) return new Response(ecbXml);
      return new Response(csv(["ER,SGP,XDC_USD,EOP_RT,M,2026-M09,1.25", "ER,G758,XDC_USD,EOP_RT,M,2026-M08,560", "ER,SGP,XDC_USD,EOP_RT,M,2026-M08,1.25"]));
    });
    expect(await getRates(["GBP", "EUR"], {}, new Date(), "imf")).toEqual({ base: "SGD", date: "2026-10-26", rates: { GBP: 0.59, EUR: 0.8 } });
    expect(asked).toHaveLength(1);
    expect(await getRates(["EUR", "XOF"], {}, new Date("2026-10-26"), "imf")).toEqual({
      base: "SGD",
      date: "2026-10-26",
      rates: { EUR: 0.8, XOF: 448 },
      monthEnd: { XOF: "2026-08" },
    });
    expect(asked.at(-1)).toContain("/IMF.STA,ER/SGP+G758.");
  });

  it("gives the last day of a month", () => {
    expect([monthEnd("2026-02"), monthEnd("2028-02"), monthEnd("2026-12")]).toEqual(["2026-02-28", "2028-02-29", "2026-12-31"]);
  });
});

describe("ECB exchange rates", () => {
  it("reads the ECB's file and converts it to Singapore dollars", async () => {
    expect(parseEcbXml(ecbXml)).toEqual({ date: "2026-10-26", perEuro: { EUR: 1, USD: 1, GBP: 0.7375, SGD: 1.25 } });
    vi.stubGlobal("fetch", async () => new Response(ecbXml));
    expect(await getEcbRates()).toEqual({ date: "2026-10-26", rates: { EUR: 0.8, USD: 0.8, GBP: 0.59 } });
  });

  it("reads Frankfurter's copy if the ECB's file can't be read", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("ecb.europa.eu") ? new Response("", { status: 503 }) : Response.json({ date: "2026-10-26", rates: { EUR: 0.7 } }),
    );
    expect(await getEcbRates()).toEqual({ date: "2026-10-26", rates: { EUR: 0.7 } });
  });
});

describe("Central-bank rates through Frankfurter", () => {
  const providers = [
    { key: "MAS", name: "Monetary Authority of Singapore", pivot_currency: "SGD" },
    { key: "BOE", name: "Bank of England", pivot_currency: "GBP" },
    { key: "IMF", name: "International Monetary Fund", pivot_currency: "USD" },
    { key: "CBK", name: "Central Bank of Kenya", pivot_currency: "KES" },
    { key: "BOJA", name: "Bank of Jamaica", pivot_currency: "JMD" },
  ];
  const rows = [
    // MAS first, and the Bank of England agrees within 2%.
    { quote: "KRW", providers: [{ key: "BOE", date: "2026-10-26", rate: 1050 }, { key: "MAS", date: "2026-10-27", rate: 1045.53 }] },
    // Only the home central bank and a minor one; the minor bank is ignored.
    { quote: "KES", providers: [{ key: "BOJA", date: "2026-10-27", rate: 120 }, { key: "CBK", date: "2026-10-27", rate: 99.5 }] },
    // MAS is more than a week old, so the IMF is used.
    { quote: "MYR", providers: [{ key: "MAS", date: "2026-10-01", rate: 3.1 }, { key: "IMF", date: "2026-10-27", rate: 3.18 }] },
    // The two major banks disagree by over 2%.
    { quote: "TRY", providers: [{ key: "MAS", date: "2026-10-27", rate: 38 }, { key: "BOE", date: "2026-10-27", rate: 40 }] },
    // No named bank: only a blended rate.
    { quote: "BND", rate: 1 },
  ];

  it("picks a fresh rate from a major central bank, else the currency's own", async () => {
    let asked = "";
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/v2/providers")) return Response.json(providers);
      asked = url;
      return Response.json(rows);
    });
    const fx = await getFrankfurterRates(["KRW", "KES", "MYR", "TRY", "BND"], {}, new Date("2026-10-28"));
    expect(asked).toBe("https://api.frankfurter.dev/v2/rates?base=SGD&quotes=KRW,KES,MYR,TRY,BND&expand=providers");
    expect(fx).toEqual({
      rates: { KRW: 1045.5, KES: 99.5, MYR: 3.18 },
      sources: {
        KRW: { name: "Monetary Authority of Singapore", date: "2026-10-27" },
        KES: { name: "Central Bank of Kenya", date: "2026-10-27" },
        MYR: { name: "International Monetary Fund", date: "2026-10-27" },
      },
    });
  });

  it("uses Frankfurter for currencies the ECB lacks unless the IMF is chosen", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (url.includes("ecb.europa.eu")) return new Response(ecbXml);
      if (url.endsWith("/v2/providers")) return Response.json(providers);
      return Response.json(rows);
    });
    expect(await getRates(["GBP", "KRW"], {}, new Date("2026-10-28"), "frankfurter")).toEqual({
      base: "SGD",
      date: "2026-10-26",
      rates: { GBP: 0.59, KRW: 1045.5 },
      sources: { KRW: { name: "Monetary Authority of Singapore", date: "2026-10-27" } },
    });
    expect(asked.some((u) => u.includes("imf.org"))).toBe(false);
  });

  it("reports whether Frankfurter answers and which currencies need it", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("ecb.europa.eu")) return new Response(ecbXml);
      return new Response("", { status: 502 });
    });
    expect(await checkFrankfurter(["GBP", "KRW"])).toEqual({ up: false, dependent: ["KRW"] });
    vi.stubGlobal("fetch", async (url: string) => (url.includes("ecb.europa.eu") ? new Response(ecbXml) : Response.json([])));
    expect(await checkFrankfurter(["GBP"])).toEqual({ up: true, dependent: [] });
  });
});
