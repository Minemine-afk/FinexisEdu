import { FIELDS, LEVELS, TIERS } from "@/lib/schema";
import { GLOSSARY_TERMS } from "@/lib/settings";

/**
 * Describes each data file as a form: labels, input types and how list items
 * are named and matched. The edit screens draw their forms from this, and the
 * Approvals screen uses the same labels to describe what changed.
 */

type Json = unknown;
type Obj = Record<string, Json>;

interface Base {
  key: string;
  label: string;
  help?: string;
  /** Leaving it empty removes it from the file. */
  optional?: boolean;
  /** Leaving it empty stores null (the field must stay in the file). */
  nullable?: boolean;
  /** Shown to visitors, or kept for maintainers only. */
  audience?: "visitors" | "maintainers";
}

export type FieldSpec =
  | (Base & { kind: "text" | "longtext" | "url" | "date"; maxLength?: number })
  | (Base & { kind: "int" | "number" | "money" })
  | (Base & { kind: "percent" })
  | (Base & { kind: "bool"; defaultValue: boolean })
  | (Base & { kind: "select"; options: readonly { value: string; label: string }[] })
  | (Base & { kind: "month" })
  | (Base & { kind: "strings"; itemLabel: string })
  | (Base & { kind: "object"; fields: FieldSpec[] })
  | (Base & {
      kind: "list";
      fields: FieldSpec[];
      itemLabel: string;
      /** Names an item in the form and in change lists. */
      title: (item: Obj) => string;
      /** Matches an item before and after a change; defaults to its position. */
      identity?: (item: Obj) => string;
      /** False for lists whose items are added and removed elsewhere (programmes). */
      addRemove: boolean;
      /** A new item's starting values. */
      blank?: () => Obj;
      collapsed?: boolean;
    })
  | (Base & {
      kind: "record";
      /** Each entry's value. */
      value: FieldSpec;
      /** Labels for known keys; entries can be added and removed when `addRemove`. */
      keyLabel: (key: string) => string;
      addRemove: boolean;
      keyOptions?: () => { value: string; label: string }[];
    });

const level = (v: Json) => (v === "bachelor" ? "Bachelor's" : v === "master" ? "Master's" : String(v ?? ""));
const TIER_LABEL: Record<string, string> = { citizen: "Citizen", pr: "PR", international: "International" };
const tier = (v: Json) => (v ? (TIER_LABEL[String(v)] ?? String(v)) : "All tiers");
const sourceType = {
  kind: "select" as const,
  key: "sourceType",
  label: "Source type",
  optional: true,
  options: [
    { value: "official", label: "University's own page" },
    { value: "secondary", label: "Unofficial source (shows a badge)" },
  ],
};

const FEE_TIER: FieldSpec[] = [
  { key: "annualTuition", label: "Yearly tuition", kind: "money" },
  { key: "annualCompulsoryFees", label: "Yearly compulsory fees", kind: "money", optional: true },
  { key: "oneOffFees", label: "One-off fees", kind: "money", optional: true },
];

const LATER_YEAR: FieldSpec[] = [
  { key: "fromYear", label: "From year of study", kind: "int", help: "2 for the second year, and so on." },
  {
    key: "tier",
    label: "Tier",
    kind: "select",
    optional: true,
    options: TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })),
    help: "Leave empty when it applies to every tier.",
  },
  { key: "annualTuition", label: "Yearly tuition", kind: "money" },
  { key: "annualCompulsoryFees", label: "Yearly compulsory fees", kind: "money", optional: true },
  { key: "estimate", label: "Worked out from a published total", kind: "bool", defaultValue: false },
];

const laterYears = (label: string): FieldSpec => ({
  key: "laterYears",
  label,
  kind: "list",
  optional: true,
  itemLabel: "later-year fee",
  addRemove: true,
  fields: LATER_YEAR,
  title: (i) => `From year ${i.fromYear ?? "?"}, ${tier(i.tier)}`,
  identity: (i) => `${i.fromYear}|${i.tier ?? ""}`,
  blank: () => ({ fromYear: 2, annualTuition: 0 }),
});

const FEE_HISTORY: FieldSpec[] = [
  { key: "feeYear", label: "Fee year", kind: "int" },
  { key: "tier", label: "Tier", kind: "select", options: TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })) },
  ...FEE_TIER,
  { key: "sourceUrl", label: "Source", kind: "url", optional: true },
  sourceType,
  laterYears("This intake's own later-year fees"),
];

const PROGRAMME: FieldSpec[] = [
  { key: "name", label: "Name", kind: "text", audience: "visitors" },
  { key: "partner", label: "Awarding partner id", kind: "text", optional: true, help: "Only for universities with partners." },
  { key: "level", label: "Level", kind: "select", options: LEVELS.map((l) => ({ value: l, label: level(l) })) },
  { key: "field", label: "Field", kind: "select", options: FIELDS.map((f) => ({ value: f, label: f })) },
  { key: "majors", label: "Majors", kind: "strings", optional: true, itemLabel: "major" },
  { key: "durationYears", label: "Length in years", kind: "number" },
  { key: "feeYear", label: "Fee year", kind: "int" },
  { key: "sourceUrl", label: "Fee source", kind: "url" },
  { key: "lastVerified", label: "Last checked", kind: "date" },
  sourceType,
  { key: "cohortLocked", label: "Fee fixed for the whole course", kind: "bool", defaultValue: false },
  { key: "internationalEligible", label: "Open to international students", kind: "bool", defaultValue: true },
  { key: "summary", label: "Summary", kind: "longtext", maxLength: 240, audience: "visitors" },
  {
    key: "feeChoice",
    label: "How this fee was worked out",
    kind: "longtext",
    maxLength: 160,
    audience: "visitors",
    help: "One sentence, no amounts or links.",
  },
  { key: "feeBasis", label: "Fee basis", kind: "longtext", maxLength: 240, audience: "maintainers" },
  { key: "notes", label: "Notes", kind: "longtext", optional: true, audience: "maintainers" },
  {
    key: "fees",
    label: "Fees",
    kind: "object",
    fields: [
      { key: "international", label: "International", kind: "object", fields: FEE_TIER },
      { key: "citizen", label: "Citizen (Singapore only)", kind: "object", optional: true, fields: FEE_TIER },
      { key: "pr", label: "PR (Singapore only)", kind: "object", optional: true, fields: FEE_TIER },
    ],
  },
  laterYears("Different fees in later years of study"),
  {
    key: "feeHistory",
    label: "Fee history",
    kind: "list",
    optional: true,
    itemLabel: "past year",
    addRemove: true,
    collapsed: true,
    fields: FEE_HISTORY,
    title: (i) => `${i.feeYear ?? "?"} ${tier(i.tier)}`,
    identity: (i) => `${i.feeYear}|${i.tier}`,
    blank: () => ({ feeYear: new Date().getFullYear() - 1, tier: "international", annualTuition: 0 }),
  },
  {
    key: "sgRecognition",
    label: "Singapore recognition (law and medicine)",
    kind: "object",
    optional: true,
    fields: [
      {
        key: "body",
        label: "List",
        kind: "select",
        options: [
          { value: "SILE", label: "SILE (law)" },
          { value: "SMC", label: "SMC (medicine)" },
        ],
      },
      { key: "listed", label: "On the list", kind: "bool", defaultValue: false },
      { key: "note", label: "Condition", kind: "text", optional: true, maxLength: 120 },
      { key: "sourceUrl", label: "Source", kind: "url", optional: true },
      { key: "lastVerified", label: "Last checked", kind: "date", optional: true },
    ],
  },
];

export const programmeTitle = (p: Obj) => `${p.name ?? "Untitled"} (${level(p.level)}${p.partner ? `, ${p.partner}` : ""})`;

export const UNIVERSITY: FieldSpec[] = [
  { key: "name", label: "Name", kind: "text", audience: "visitors" },
  { key: "city", label: "City", kind: "text" },
  { key: "website", label: "Website", kind: "url" },
  { key: "description", label: "Description (shown on hover)", kind: "longtext", audience: "visitors" },
  { key: "whyIncluded", label: "Why it is included", kind: "longtext", maxLength: 400, audience: "visitors" },
  { key: "feeMethod", label: "How it prices degrees", kind: "longtext", maxLength: 220, audience: "maintainers" },
  {
    key: "feeIncrease",
    label: "Yearly fee increase set by hand",
    kind: "object",
    optional: true,
    help: "Only when the fee history has a one-off jump that should not repeat every year.",
    fields: [
      { key: "rate", label: "Rate", kind: "percent" },
      { key: "reason", label: "Reason (shown in the tip)", kind: "longtext" },
    ],
  },
  {
    key: "livingCosts",
    label: "Living costs",
    kind: "object",
    optional: true,
    fields: [
      { key: "year", label: "Year of the estimate", kind: "int" },
      { key: "months", label: "Months a year", kind: "number" },
      {
        key: "monthly",
        label: "Monthly amounts",
        kind: "object",
        fields: [
          { key: "housing", label: "Housing", kind: "money" },
          { key: "food", label: "Food", kind: "money" },
          { key: "transport", label: "Transport", kind: "money" },
          { key: "personal", label: "Personal", kind: "money" },
        ],
      },
      { key: "sourceUrl", label: "Source", kind: "url" },
      { key: "lastVerified", label: "Last checked", kind: "date" },
      sourceType,
      { key: "summary", label: "Summary", kind: "longtext", maxLength: 280, audience: "visitors" },
      { key: "notes", label: "Notes", kind: "longtext", optional: true, audience: "maintainers" },
    ],
  },
  {
    key: "partners",
    label: "Partner universities",
    kind: "list",
    optional: true,
    itemLabel: "partner",
    addRemove: false,
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "country", label: "Country", kind: "text" },
      { key: "website", label: "Website", kind: "url", optional: true },
      { key: "description", label: "Description", kind: "longtext", optional: true },
      { key: "feeMethod", label: "How it prices degrees", kind: "longtext", optional: true, maxLength: 220, audience: "maintainers" },
    ],
    title: (i) => String(i.name ?? i.id),
    identity: (i) => String(i.id),
  },
  {
    key: "programmes",
    label: "Programmes",
    kind: "list",
    itemLabel: "programme",
    addRemove: false,
    collapsed: true,
    fields: PROGRAMME,
    title: programmeTitle,
    identity: (p) => `${p.partner ?? ""}|${p.level}|${p.name}`,
  },
];

export const COUNTRY: FieldSpec[] = [
  { key: "name", label: "Name", kind: "text", audience: "visitors" },
  { key: "currency", label: "Currency code", kind: "text", help: "Three letters, e.g. AUD." },
  {
    key: "defaultFeeIncrease",
    label: "Typical yearly fee increase",
    kind: "percent",
    help: "Used when a university has too little fee history of its own.",
  },
  {
    key: "feeIncreaseByTier",
    label: "Typical increase by tier",
    kind: "record",
    optional: true,
    addRemove: true,
    value: { key: "", label: "Rate", kind: "percent" },
    keyLabel: (k) => TIER_LABEL[k] ?? k,
    keyOptions: () => TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })),
  },
  {
    key: "livingCostIncrease",
    label: "Yearly living-cost increase",
    kind: "percent",
    optional: true,
    help: "Latest official inflation. Leave empty to use the site default.",
  },
];

export function settingsSpec(countries: { value: string; label: string }[]): FieldSpec[] {
  const name = (code: string) => countries.find((c) => c.value === code)?.label ?? code;
  return [
    { key: "maxFeeIncrease", label: "Highest yearly fee increase", kind: "percent" },
    { key: "fallbackFeeIncrease", label: "Fee increase when nothing else is known", kind: "percent" },
    { key: "fallbackLivingCostIncrease", label: "Living-cost increase when a country has none", kind: "percent" },
    { key: "maxStartYear", label: "Latest start year", kind: "int" },
    {
      key: "lifestyleMultiplier",
      label: "Lifestyle (times the university's estimate)",
      kind: "record",
      addRemove: false,
      value: { key: "", label: "Multiplier", kind: "number" },
      keyLabel: (k) => ({ frugal: "Frugal", moderate: "Moderate", comfortable: "Comfortable" })[k] ?? k,
    },
    {
      key: "countryOrder",
      label: "Country order",
      kind: "strings",
      itemLabel: "country code",
      help: "Two-letter codes, one per line, in the order the calculator lists them. Countries not listed come after, A to Z.",
    },
    { key: "defaultIntakeMonth", label: "Usual intake month", kind: "month" },
    {
      key: "intakeMonth",
      label: "Countries with a different intake month",
      kind: "record",
      addRemove: true,
      value: { key: "", label: "Month", kind: "month" },
      keyLabel: name,
      keyOptions: () => countries,
    },
    {
      key: "glossary",
      label: "Hover explanations",
      kind: "record",
      addRemove: false,
      value: { key: "", label: "Explanation", kind: "longtext", maxLength: 1000 },
      keyLabel: (k) => k,
      keyOptions: () => GLOSSARY_TERMS.map((t) => ({ value: t, label: t })),
    },
  ];
}

export const COURSES: FieldSpec[] = [
  {
    key: "",
    label: "Why these courses?",
    kind: "list",
    itemLabel: "field",
    addRemove: false,
    fields: [
      { key: "includes", label: "Shown under the name", kind: "text", optional: true },
      { key: "reason", label: "Reason", kind: "longtext", maxLength: 160 },
      { key: "figure", label: "Figure", kind: "text", maxLength: 80 },
      { key: "sourceLabel", label: "Source name", kind: "text", maxLength: 30 },
      { key: "sourceUrl", label: "Source", kind: "url" },
    ],
    title: (i) => String(i.field),
    identity: (i) => String(i.field),
  },
];

export function rationaleSpec(universities: { value: string; label: string }[]): FieldSpec[] {
  return [
    {
      key: "",
      label: "Shortlist places",
      kind: "record",
      addRemove: true,
      keyLabel: (k) => universities.find((u) => u.value === k)?.label ?? k,
      keyOptions: () => universities,
      value: {
        key: "",
        label: "Shortlist",
        kind: "object",
        fields: [
          {
            key: "ranks",
            label: "Places",
            kind: "list",
            itemLabel: "place",
            addRemove: true,
            fields: [
              { key: "level", label: "Level", kind: "select", options: LEVELS.map((l) => ({ value: l, label: level(l) })) },
              { key: "rank", label: "Place (1-10)", kind: "int" },
            ],
            title: (i) => `${level(i.level)} #${i.rank ?? "?"}`,
            identity: (i) => String(i.level),
            blank: () => ({ level: "bachelor", rank: 10 }),
          },
          { key: "source", label: "Source for the Singapore link", kind: "url", nullable: true },
        ],
      },
    },
  ];
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
