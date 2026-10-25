import fallback from "@/data/fx-fallback.json";
import { FxRates } from "./schema";

// The currencies the site started with, in their original order; others follow A to Z.
const FIRST_CURRENCIES = ["GBP", "AUD", "USD", "EUR", "CAD", "NZD", "CHF", "JPY"];
const ONE_DAY = 60 * 60 * 24;

export interface FxResult extends FxRates {
  source: "live" | "fallback";
}

/** The currencies to convert to SGD: every country's currency except SGD itself. */
export function fxCurrencies(countries: { currency: string }[]): string[] {
  const used = new Set(countries.map((c) => c.currency).filter((c) => c !== "SGD"));
  return [...FIRST_CURRENCIES.filter((c) => used.has(c)), ...[...used].filter((c) => !FIRST_CURRENCIES.includes(c)).sort()];
}

/**
 * Latest ECB reference rates from Frankfurter, cached for a day. Falls back to
 * data/fx-fallback.json (refreshed by the data pipeline) if the API is down.
 */
export async function getFxRates(currencies: string[]): Promise<FxResult> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=SGD&symbols=${currencies.join(",")}`, {
      next: { revalidate: ONE_DAY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);
    const rates = FxRates.parse(await res.json());
    if (currencies.some((c) => !rates.rates[c])) throw new Error("Missing currencies");
    return { ...rates, source: "live" };
  } catch (err) {
    console.warn(`Using fallback exchange rates: ${err}`);
    return { ...FxRates.parse(fallback), source: "fallback" };
  }
}
