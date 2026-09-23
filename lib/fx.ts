import fallback from "@/data/fx-fallback.json";
import { FxRates } from "./schema";

export const FX_CURRENCIES = ["GBP", "AUD", "USD", "CAD", "NZD", "JPY"];
const FRANKFURTER_URL = `https://api.frankfurter.dev/v1/latest?base=SGD&symbols=${FX_CURRENCIES.join(",")}`;
const ONE_DAY = 60 * 60 * 24;

export interface FxResult extends FxRates {
  source: "live" | "fallback";
}

/**
 * Latest ECB reference rates from Frankfurter, cached for a day. Falls back to
 * data/fx-fallback.json (refreshed by the data pipeline) if the API is down.
 */
export async function getFxRates(): Promise<FxResult> {
  try {
    const res = await fetch(FRANKFURTER_URL, {
      next: { revalidate: ONE_DAY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);
    const rates = FxRates.parse(await res.json());
    if (FX_CURRENCIES.some((c) => !rates.rates[c])) throw new Error("Missing currencies");
    return { ...rates, source: "live" };
  } catch (err) {
    console.warn(`Using fallback exchange rates: ${err}`);
    return { ...FxRates.parse(fallback), source: "fallback" };
  }
}
