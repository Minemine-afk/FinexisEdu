/** Plain-language explanations shown on hover over terms in the calculator. */
export const GLOSSARY = {
  residency:
    "Singapore universities charge three rates. Singapore Citizens and Permanent Residents (PRs) pay subsidised fees under the Ministry of Education's Tuition Grant; international students pay more, or the full unsubsidised fee at some programmes. Outside Singapore, a Singaporean is an international student and pays the international rate whatever their residency.",
  citizenRate:
    "The fee for Singapore Citizens, subsidised by the Ministry of Education's Tuition Grant. Citizens need not serve a bond for it.",
  prRate:
    "The fee for Singapore Permanent Residents, subsidised by the Ministry of Education's Tuition Grant. PR and international recipients must work in a Singapore-based company for three years after graduating.",
  internationalRate:
    "The fee charged to students who are not citizens or permanent residents of the host country. Singaporeans studying abroad pay this rate.",
  startYear:
    "The year the first academic year begins, from 2026 onwards. The fee tables are the universities' latest published ones (2026, or 2027 where already announced); for a start year after that the calculator projects from the latest published fee using the university's own rate of increase.",
  published:
    "A fee the university published for that academic year. No estimate is involved.",
  projected:
    "An estimate: the latest published fee grown by the yearly increase for each year after the published fee year. Universities have not announced these figures yet.",
  feeIncrease:
    "Fees are taken from each university's latest published fee table. For years after that, the calculator grows the fee by that university's own historical rate of increase (see % inflation below); you can set your own rate instead. Where a fee is fixed for your cohort, the increase only sets the entry-year fee when you start after the latest published year.",
  universityIncrease:
    "This university's yearly fee increase, worked out from its own published fees: for every programme with two or more years on file, the compound yearly rise from the earliest to the latest published fee, then the median across programmes (per residency tier in Singapore). Where a university has fewer than two such programmes, its country's typical rate is used instead.",
  noTuition:
    "This public university charges no tuition, including to international students. You pay only the compulsory semester contribution (student services and usually a public transport ticket), shown as other fees.",
  cohortLocked:
    "The university fixes the fee for the whole degree at the rate of the year you enrol, so later years do not rise. Common at Singapore universities and many UK universities.",
  compulsoryFees:
    "Fees every student must pay each year on top of tuition, such as student services, amenities, laboratory, registration or student-union fees. Deposits and optional charges are excluded.",
  oneOffFees:
    "Compulsory fees paid once, usually at admission, such as a Japanese entrance fee, an enrolment or orientation fee, or an application fee. Refundable deposits are excluded.",
  laterYears:
    "Later years of this programme have their own published fee, usually higher (for example the clinical years of a medicine degree), so each year is priced at its own rate rather than the first year's.",
  laterYearsEstimated:
    "The university publishes a total for the whole programme rather than a fee for each later year, so the later-year figure is the amount that makes the years add up to that total.",
  otherFeesCurrent:
    "The published fee table for the earlier year listed tuition only, so this year's compulsory and one-off fees are taken from the current rates.",
  unofficialSource:
    "The university's own page blocks automated reading, so this figure was read through a third-party rendering or a credible secondary source and may lag the official page. The source link shows where it came from.",
  outdated:
    "This figure was last verified against its source more than a year ago, so the university may have changed it since. Check the source link before relying on it.",
  livingCosts:
    "An estimate of housing, food, transport and personal costs while studying, using each overseas university's own published figure for a student year. Visas, flights and health insurance are not included, and Singapore universities are excluded.",
  lifestyle:
    "Moderate is the university's own estimate. Frugal is 20% less and Comfortable 30% more, to show the range a student's habits make. You can also enter your own monthly budget in the details.",
  perYear:
    "The total divided by the length of the degree, for a yearly budget. The monthly figure divides that by 12, including months outside term.",
  totalSgd:
    "Everything converted to Singapore dollars at the latest exchange rate shown in the footer. Exchange rates move, so a 10% change in the rate changes the overseas totals by about 10%.",
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
