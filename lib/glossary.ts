import { SETTINGS, type GlossaryTerm } from "./settings";

/** Plain-language explanations shown on hover over terms in the calculator (wording in data/settings.json). */
export const GLOSSARY: Record<GlossaryTerm, string> = SETTINGS.glossary;

export type { GlossaryTerm };
