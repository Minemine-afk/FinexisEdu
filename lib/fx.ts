import fallback from "@/data/fx-fallback.json";
import codes from "./fx-imf.json";
import { FxRates } from "./schema";

// The currencies the site started with, in their original order; others follow A to Z.
const FIRST_CURRENCIES = ["GBP", "AUD", "USD", "EUR", "CAD", "NZD", "CHF", "JPY"];
const ONE_DAY = 60 * 60 * 24;
// Rates older than this many months are treated as missing (the IMF keeps series for currencies that no longer exist).
const MAX_AGE_MONTHS = 12;

const AREA: Record<string, string> = codes.area;
const ISO3: Record<string, string> = codes.iso3;

export interface FxResult extends FxRates {
  source: "live" | "fallback";
}

/** How exchange-rate requests are cached: daily for the site, never for the editor. */
export type FxFetchOptions = Pick<RequestInit, "cache"> & { next?: { revalidate: number } };

/** The currencies to convert to SGD: every country's currency except SGD itself. */
export function fxCurrencies(countries: { currency: string }[]): string[] {
  const used = new Set(countries.map((c) => c.currency).filter((c) => c !== "SGD"));
  return [...FIRST_CURRENCIES.filter((c) => used.has(c)), ...[...used].filter((c) => !FIRST_CURRENCIES.includes(c)).sort()];
}

/** The IMF country code whose exchange rate stands for a currency, e.g. GBR for GBP and G163 (euro area) for EUR. */
export function imfCountry(currency: string): string | undefined {
  return AREA[currency] ?? ISO3[currency.slice(0, 2)];
}

/** Units of each IMF country's currency per US dollar at each month end ("2026-09"), from SDMX-CSV. */
export function parseImfCsv(csv: string): Map<string, Map<string, number>> {
  const [header, ...rows] = csv.trim().split(/\r?\n/).map((r) => r.split(","));
  const [country, period, value] = ["COUNTRY", "TIME_PERIOD", "OBS_VALUE"].map((h) => header.indexOf(h));
  const series = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const v = Number(r[value]);
    if (!r[value] || !(v > 0)) continue;
    if (!series.has(r[country])) series.set(r[country], new Map());
    series.get(r[country])!.set(r[period].replace("-M", "-"), v);
  }
  return series;
}

/**
 * Units of each currency per Singapore dollar, from the latest month-end rates in the International
 * Monetary Fund's exchange-rate dataset (both currencies against the US dollar on the same month end),
 * with the month ("2026-09") each comes from. Currencies the IMF has no recent rate for are left out.
 */
export async function getImfRates(currencies: string[], opts: FxFetchOptions = {}, today = new Date()) {
  const want = new Map(currencies.flatMap((c) => (imfCountry(c) ? [[imfCountry(c)!, c] as const] : [])));
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - MAX_AGE_MONTHS, 1)).toISOString().slice(0, 7);
  const url = `https://api.imf.org/external/sdmx/2.1/data/IMF.STA,ER/${["SGP", ...want.keys()].join("+")}.XDC_USD.EOP_RT.M?startPeriod=${start}`;
  const res = await fetch(url, { ...opts, headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`IMF returned ${res.status}`);
  const series = parseImfCsv(await res.text());
  const sgd = series.get("SGP");
  if (!sgd?.size) throw new Error("No IMF rate for the Singapore dollar");

  const rates: Record<string, number> = {};
  const months: Record<string, string> = {};
  for (const [code, currency] of want) {
    const own = series.get(code);
    const month = [...(own?.keys() ?? [])].filter((m) => sgd.has(m)).sort().pop();
    if (!month) continue;
    rates[currency] = Number((own!.get(month)! / sgd.get(month)!).toPrecision(5));
    months[currency] = month;
  }
  return { rates, months };
}

/**
 * Units of each currency per Singapore dollar: the European Central Bank's daily reference rate
 * (via Frankfurter) where it publishes one, otherwise the IMF's latest month-end rate.
 * Currencies neither has are left out.
 */
export async function getRates(currencies: string[], opts: FxFetchOptions = {}, today = new Date()): Promise<FxRates> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=SGD", { ...opts, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);
  const ecb = (await res.json()) as { date: string; rates: Record<string, number> };
  const rates = Object.fromEntries(currencies.filter((c) => ecb.rates[c] > 0).map((c) => [c, ecb.rates[c]]));
  const missing = currencies.filter((c) => !(c in rates));
  if (!missing.length) return { base: "SGD", date: ecb.date, rates };
  const imf = await getImfRates(missing, opts, today);
  return { base: "SGD", date: ecb.date, rates: { ...rates, ...imf.rates }, monthEnd: imf.months };
}

/** The last day of a month: "2026-09" becomes "2026-09-30". */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Latest ECB and IMF rates, cached for a day. Falls back to data/fx-fallback.json
 * (refreshed by the data pipeline) if either is unreachable or a currency is missing.
 */
export async function getFxRates(currencies: string[]): Promise<FxResult> {
  try {
    const rates = FxRates.parse(await getRates(currencies, { next: { revalidate: ONE_DAY } }));
    if (currencies.some((c) => !rates.rates[c])) throw new Error("Missing currencies");
    return { ...rates, source: "live" };
  } catch (err) {
    console.warn(`Using fallback exchange rates: ${err}`);
    return { ...FxRates.parse(fallback), source: "fallback" };
  }
}
