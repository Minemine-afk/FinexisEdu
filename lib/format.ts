import type { Partner, Programme, University } from "./schema";

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
  if (amount < 0) return `-${formatCompactSgd(-amount)}`;
  // Each unit with its decimals: millions and billions keep two (S$1.27M), thousands one (S$34.2K).
  const units: [number, string, number][] = [
    [1, "", 0],
    [1e3, "K", 1],
    [1e6, "M", 2],
    [1e9, "B", 2],
  ];
  // toPrecision clears float noise, so 9,995,000 rounds up to S$10M, not down to S$9.99M.
  const round = (x: number, places: number) =>
    Math.round(Number((x * 10 ** places).toPrecision(12))) / 10 ** places;
  // The smallest unit whose rounded figure stays under 1,000, so 999,960 reads S$1M rather than S$1000K.
  let i = 0;
  while (i < units.length - 1 && round(amount / units[i][0], units[i][2]) >= 1000) i++;
  const [size, suffix, places] = units[i];
  const text = round(amount / size, places).toFixed(places).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `S$${text}${suffix}`;
}

export const LEVEL_LABELS = { bachelor: "Bachelor's", master: "Master's" } as const;

export const FIELD_LABELS = {
  engineering: "Engineering",
  computing: "Computing / IT",
  business: "Business",
  sciences: "Sciences",
  arts: "Arts & Humanities",
  law: "Law",
  medicine: "Medicine",
  psychology: "Psychology",
  nursing: "Nursing",
} as const;

export const RESIDENCY_LABELS = {
  citizen: "Singapore Citizen",
  pr: "Singapore PR",
  international: "International student",
} as const;

/**
 * The awarding partner of a programme taught by an institution such as SIM, or
 * the institute within a university (NIE at NTU) that runs it.
 */
export function partnerOf(u: University, p: Programme): Partner | undefined {
  return p.partner ? u.partners?.find((x) => x.id === p.partner) : undefined;
}

/** Picker value for a university's own programmes, next to its partners' or institutes'. */
export const OWN = "";

/**
 * The entries of the partner/institute picker for a university: its partners
 * that have programmes among `options`, led by the university itself when it
 * also teaches programmes of its own (NTU beside NIE). Empty when the
 * university has no partners, so no picker is shown.
 */
export function partnerChoices(
  u: University,
  options: { programme: Programme }[],
): Partner[] {
  if (!u.partners?.length) return [];
  const partners = u.partners.filter((p) =>
    options.some((o) => o.programme.partner === p.id),
  );
  const own = options.some((o) => !o.programme.partner);
  return own
    ? [{ id: OWN, name: u.name, country: u.country }, ...partners]
    : partners;
}

/**
 * Label of that picker: "Partner university" where another university awards
 * the degrees (SIM), "Institute" where the choice is between a university and
 * an institute of its own (NTU and NIE).
 */
export function partnerPickerLabel(u: University): string {
  return u.programmes.some((p) => !p.partner) ? "Institute" : "Partner university";
}

/** The programme name, led by its awarding partner where there is one. */
export function programmeLabel(u: University, p: Programme): string {
  const partner = partnerOf(u, p);
  return partner ? `${partner.name} · ${p.name}` : p.name;
}

/** Short suffix for programme lists: " · SILE listed" or " · not on SMC list". */
export function recognitionTag(p: Programme): string {
  const r = p.sgRecognition;
  if (!r) return "";
  return r.listed ? ` · ${r.body} listed` : ` · not on ${r.body} list`;
}

/**
 * The institution as a short label: the awarding partner first where there is
 * one, e.g. "University of London · Singapore Institute of Management", so two
 * SIM programmes with different partners can be told apart.
 */
export function institutionLabel(u: University, p: Programme): string {
  const partner = partnerOf(u, p);
  return partner ? `${partner.name} · ${u.name}` : u.name;
}
