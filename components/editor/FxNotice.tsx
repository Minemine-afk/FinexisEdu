import fallback from "@/data/fx-fallback.json";
import { Notice } from "@/components/editor/shared";
import { loadCountries } from "@/lib/data";
import { checkFrankfurter, fxCurrencies } from "@/lib/fx";
import { SETTINGS } from "@/lib/settings";

/** Warns editors when Frankfurter is the chosen source for currencies the ECB lacks but isn't answering. */
export default async function FxNotice() {
  if (SETTINGS.otherExchangeRates !== "frankfurter") return null;
  const { up, dependent } = await checkFrankfurter(fxCurrencies(loadCountries()));
  if (up) return null;
  const affected =
    dependent === undefined
      ? "The ECB's rates can't be read right now either, so the calculator is using its saved exchange rates"
      : dependent.length
        ? `${dependent.join(", ")} ${dependent.length === 1 ? "isn't" : "aren't"} published by the ECB, so the calculator is using the saved rate${dependent.length === 1 ? "" : "s"} for ${dependent.length === 1 ? "it" : "them"}`
        : "None of the site's currencies need it right now, but a country whose currency the ECB doesn't publish can't be added until it's back";
  return (
    <div className="mb-6" role="status">
      <Notice tone="warn">
        <strong>Frankfurter isn&apos;t responding.</strong> It supplies exchange rates for currencies the European Central
        Bank (ECB) doesn&apos;t publish. {affected}
        {dependent === undefined || dependent.length ? ` (saved on ${fallback.date}).` : "."} If this lasts, you can switch to IMF
        month-end rates in Site settings.
      </Notice>
    </div>
  );
}
