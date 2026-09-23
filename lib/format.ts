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

export function formatCompactSgd(amount: number): string {
  const formatted = new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
  return withSgdPrefix(formatted, "SGD");
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
