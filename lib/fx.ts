import fallback from "@/data/fx-fallback.json";
import codes from "./fx-imf.json";
import { FxRates } from "./schema";
import { SETTINGS, type OtherRatesSource } from "./settings";

// The currencies the site started with, in their original order; others follow A to Z.
const FIRST_CURRENCIES = ["GBP", "AUD", "USD", "EUR", "CAD", "NZD", "CHF", "JPY"];
const ONE_HOUR = 60 * 60;
// Rates older than this many months are treated as missing (the IMF keeps series for currencies that no longer exist).
const MAX_AGE_MONTHS = 12;
// Central-bank rates from Frankfurter older than this many days are treated as missing.
const MAX_AGE_DAYS = 7;
// Two central banks' rates for the same currency further apart than this are treated as unreliable.
const MAX_GAP = 0.02;
// Frankfurter's sources tried in this order for a currency the ECB lacks, before the currency's own central bank.
const MAJOR_BANKS = ["MAS", "BOE", "BOC", "RBA", "IMF"];
const FRANKFURTER = "https://api.frankfurter.dev";

const AREA: Record<string, string> = codes.area;
const ISO3: Record<string, string> = codes.iso3;

export interface FxResult extends FxRates {
  source: "live" | "fallback";
}

/** How exchange-rate requests are cached: hourly for the site, never for the editor. */
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

/** Rounds to five significant figures, as the ECB and Frankfurter publish. */
const sig5 = (n: number) => Number(n.toPrecision(5));

/** The ECB's daily reference rates (units per euro) and their date, from its eurofxref-daily.xml file. */
export function parseEcbXml(xml: string): { date: string; perEuro: Record<string, number> } {
  const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!date) throw new Error("No date in the ECB file");
  const perEuro: Record<string, number> = { EUR: 1 };
  for (const [, currency, rate] of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) perEuro[currency] = Number(rate);
  return { date, perEuro };
}

/**
 * Units of each currency per Singapore dollar from the European Central Bank's daily reference rates,
 * read from the ECB itself, or from Frankfurter's copy of them if the ECB's file can't be read.
 */
export async function getEcbRates(opts: FxFetchOptions = {}): Promise<{ date: string; rates: Record<string, number> }> {
  try {
    const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { ...opts, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ECB returned ${res.status}`);
    const { date, perEuro } = parseEcbXml(await res.text());
    const sgd = perEuro.SGD;
    if (!(sgd > 0)) throw new Error("No SGD rate in the ECB file");
    const rates = Object.fromEntries(Object.entries(perEuro).filter(([c]) => c !== "SGD").map(([c, r]) => [c, sig5(r / sgd)]));
    return { date, rates };
  } catch (err) {
    console.warn(`Reading ECB rates through Frankfurter: ${err}`);
    const res = await fetch(`${FRANKFURTER}/v1/latest?base=SGD`, { ...opts, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);
    return (await res.json()) as { date: string; rates: Record<string, number> };
  }
}

interface FrankfurterRow {
  quote: string;
  providers?: { key: string; date: string; rate: number }[];
}
interface FrankfurterProvider {
  key: string;
  name: string;
  pivot_currency: string;
}

/**
 * Units of each currency per Singapore dollar from a named central bank, through Frankfurter: the
 * Monetary Authority of Singapore, Bank of England, Bank of Canada, Reserve Bank of Australia or IMF
 * (in that order), else the currency's own central bank. A rate counts only if it is at most a week old
 * and, where a second of those banks has one too, within 2% of it. Currencies without one are left out.
 */
export async function getFrankfurterRates(currencies: string[], opts: FxFetchOptions = {}, today = new Date()) {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${FRANKFURTER}${path}`, { ...opts, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);
    return (await res.json()) as T;
  };
  const [rows, providers] = await Promise.all([
    get<FrankfurterRow[]>(`/v2/rates?base=SGD&quotes=${currencies.join(",")}&expand=providers`),
    get<FrankfurterProvider[]>("/v2/providers"),
  ]);
  const name = new Map(providers.map((p) => [p.key, p.name]));
  const oldest = new Date(today.getTime() - MAX_AGE_DAYS * 86400000).toISOString().slice(0, 10);

  const rates: Record<string, number> = {};
  const sources: Record<string, { name: string; date: string }> = {};
  for (const row of rows) {
    if (!currencies.includes(row.quote)) continue;
    const home = providers.filter((p) => p.pivot_currency === row.quote).map((p) => p.key);
    const fresh = [...MAJOR_BANKS, ...home].flatMap((key) =>
      (row.providers ?? []).filter((p) => p.key === key && p.date >= oldest && p.rate > 0),
    );
    const [best, second] = fresh;
    if (!best) continue;
    if (second && Math.abs(best.rate / second.rate - 1) > MAX_GAP) {
      console.warn(`${row.quote}: ${best.key} (${best.rate}) and ${second.key} (${second.rate}) disagree`);
      continue;
    }
    rates[row.quote] = sig5(best.rate);
    sources[row.quote] = { name: name.get(best.key) ?? best.key, date: best.date };
  }
  return { rates, sources };
}

/**
 * Units of each currency per Singapore dollar: the European Central Bank's daily reference rate where it
 * publishes one, otherwise a rate from the other source chosen in Site settings (Frankfurter's
 * central-bank rates or the IMF's latest month-end rate). Currencies with no rate are left out.
 */
export async function getRates(
  currencies: string[],
  opts: FxFetchOptions = {},
  today = new Date(),
  other: OtherRatesSource = SETTINGS.otherExchangeRates,
): Promise<FxRates> {
  const ecb = await getEcbRates(opts);
  const rates = Object.fromEntries(currencies.filter((c) => ecb.rates[c] > 0).map((c) => [c, ecb.rates[c]]));
  const missing = currencies.filter((c) => !(c in rates));
  if (!missing.length) return { base: "SGD", date: ecb.date, rates };
  if (other === "imf") {
    const imf = await getImfRates(missing, opts, today);
    return { base: "SGD", date: ecb.date, rates: { ...rates, ...imf.rates }, monthEnd: imf.months };
  }
  const banks = await getFrankfurterRates(missing, opts, today);
  return { base: "SGD", date: ecb.date, rates: { ...rates, ...banks.rates }, sources: banks.sources };
}

/**
 * Whether Frankfurter is answering, and which currencies rely on it (those the ECB doesn't publish;
 * undefined if the ECB's rates can't be read either). Checked fresh each time, for the editor.
 */
export async function checkFrankfurter(currencies: string[]): Promise<{ up: boolean; dependent?: string[] }> {
  const [up, ecb] = await Promise.all([
    fetch(`${FRANKFURTER}/v2/rates?base=SGD&quotes=USD&expand=providers`, { cache: "no-store", signal: AbortSignal.timeout(6000) })
      .then(async (res) => res.ok && Array.isArray(await res.json()))
      .catch(() => false),
    getEcbRates({ next: { revalidate: ONE_HOUR } }).catch(() => undefined),
  ]);
  return { up, dependent: ecb && currencies.filter((c) => !(ecb.rates[c] > 0)) };
}

/** The last day of a month: "2026-09" becomes "2026-09-30". */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Latest ECB rates, and the other source's for the rest, cached for an hour. Falls back to data/fx-fallback.json
 * (refreshed by the data pipeline) if either is unreachable or a currency is missing.
 */
export async function getFxRates(currencies: string[]): Promise<FxResult> {
  try {
    const rates = FxRates.parse(await getRates(currencies, { next: { revalidate: ONE_HOUR } }));
    if (currencies.some((c) => !rates.rates[c])) throw new Error("Missing currencies");
    return { ...rates, source: "live" };
  } catch (err) {
    console.warn(`Using fallback exchange rates: ${err}`);
    return { ...FxRates.parse(fallback), source: "fallback" };
  }
}
