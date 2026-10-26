import type { University } from "@/lib/schema";

/** A rule a value breaks, and where (the path into the file, as in a zod issue). */
export interface Problem {
  at: (string | number)[];
  message: string;
}

const NOTE_WORDS = /https?:|capture|proxy|jina|wayback|crawl|CC-MAIN|—/i;
const AMOUNTS = /https?:\/\/|[$£€¥]|\d{4}|\d,\d|\b(?:AUD|CAD|CHF|EUR|GBP|JPY|NZD|SGD|USD|S\$|A\$|C\$|NZ\$)\b/;
const REASON_WORDS = /judgement|not verified|budget|retrieved|shortlist research|—/i;

/**
 * The rules lib/data.test.ts applies to every university file, checked as
 * editors type so a change does not fail only after it is sent. The tests
 * still run on every change before it can be approved.
 */
export function checkUniversity(u: University): Problem[] {
  const out: Problem[] = [];
  const add = (at: (string | number)[], message: string) => out.push({ at, message });

  if (!u.website) add(["website"], "Add the university's website.");
  if (!u.description) add(["description"], "Add a description.");
  if (!u.whyIncluded) add(["whyIncluded"], "Say why it is included.");
  else if (REASON_WORDS.test(u.whyIncluded)) add(["whyIncluded"], "Keep research notes (and long dashes) out of this text.");
  if (!u.feeMethod) add(["feeMethod"], "Say how the university prices its degrees.");
  else if (/https?:\/\//.test(u.feeMethod)) add(["feeMethod"], "No links here.");

  if (u.country !== "sg" && !u.livingCosts) add(["livingCosts"], "Universities outside Singapore need a living-cost estimate.");
  if (u.livingCosts) {
    if (!u.livingCosts.summary) add(["livingCosts", "summary"], "Add a short summary.");
    else if (NOTE_WORDS.test(u.livingCosts.summary)) add(["livingCosts", "summary"], "No links, research notes or long dashes.");
  }

  const partnerIds = new Set((u.partners ?? []).map((p) => p.id));
  u.programmes.forEach((p, i) => {
    const at = (...rest: (string | number)[]) => ["programmes", i, ...rest];
    if (!p.summary) add(at("summary"), "Add a short summary.");
    else {
      if (p.summary.length > 240) add(at("summary"), "Keep the summary to 240 characters.");
      if (NOTE_WORDS.test(p.summary)) add(at("summary"), "No links, research notes or long dashes.");
    }
    if (!p.feeBasis) add(at("feeBasis"), "Say how this figure was chosen.");
    else if (/https?:\/\//.test(p.feeBasis)) add(at("feeBasis"), "No links here.");
    if (!p.feeChoice) add(at("feeChoice"), "Say how this fee was worked out.");
    else {
      if (AMOUNTS.test(p.feeChoice)) add(at("feeChoice"), "No amounts, currencies, years or links here.");
      if (!/^[A-Z].*\.$/.test(p.feeChoice)) add(at("feeChoice"), "Start with a capital letter and end with a full stop.");
    }
    if (p.field === "law" && p.sgRecognition?.body !== "SILE") add(at("sgRecognition"), "Law degrees need their SILE status.");
    else if (p.field === "medicine" && p.sgRecognition?.body !== "SMC") add(at("sgRecognition"), "Medicine degrees need their SMC status.");
    else if (p.field !== "law" && p.field !== "medicine" && p.sgRecognition) add(at("sgRecognition"), "Only law and medicine have this.");
    if (p.partner !== undefined && !partnerIds.has(p.partner)) add(at("partner"), "This partner id is not one of the university's partners.");
    if (p.majors && (p.majors.length === 0 || new Set(p.majors).size !== p.majors.length)) add(at("majors"), "List each major once.");
    if (u.country !== "sg" && (p.fees.citizen || p.fees.pr)) add(at("fees"), "Citizen and PR rates are only for Singapore universities.");

    const seen = new Set<string>();
    p.feeHistory.forEach((h, j) => {
      const hat = at("feeHistory", j);
      const key = `${h.feeYear}:${h.tier}`;
      if (seen.has(key)) add(hat, `${h.feeYear} ${h.tier} is listed twice.`);
      seen.add(key);
      if (h.feeYear >= p.feeYear) add([...hat, "feeYear"], "Past years must be before the current fee year.");
      if (u.country !== "sg" && h.tier !== "international") add([...hat, "tier"], "Only international rates outside Singapore.");
      if (h.sourceType === "secondary" && !h.sourceUrl) add([...hat, "sourceUrl"], "Unofficial figures need a source.");
    });
  });
  for (const partner of u.partners ?? []) {
    if (!u.programmes.some((p) => p.partner === partner.id)) add(["partners"], `${partner.name} has no programmes.`);
  }
  return out;
}
