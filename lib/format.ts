// en-SG writes SGD as a bare "$"; spell it S$ so it can't be mistaken for USD.
function withSgdPrefix(formatted: string, currency: string): string {
  return currency === "SGD" ? formatted.replace("$", "S$") : formatted;
}

export function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
  return withSgdPrefix(formatted, currency);
}

/**
 * Short SGD amount such as "S$34.2K". Built by hand because Intl's compact
 * notation differs between Node and browsers, which breaks hydration.
 */
export function formatCompactSgd(amount: number): string {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(amount) >= size) {
      return `S$${(amount / size).toFixed(1).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return `S$${Math.round(amount)}`;
}

export const LEVEL_LABELS = { bachelor: "Bachelor's", master: "Master's" } as const;

export const FIELD_LABELS = {
  engineering: "Engineering",
  computing: "Computing / IT",
  business: "Business",
  sciences: "Sciences",
  arts: "Arts & Humanities",
} as const;

export const RESIDENCY_LABELS = {
  citizen: "Singapore Citizen",
  pr: "Singapore PR",
  international: "International student",
} as const;
