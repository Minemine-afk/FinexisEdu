# Fee data schema

One JSON file per university at `data/universities/<country>/<id>.json`.
Country codes: `sg`, `uk`, `au`, `us`, `de`, `ca`, `nz`, `ch`, `jp`, `ie`.

```jsonc
{
  "id": "nus",                                   // lowercase slug, same as filename
  "name": "National University of Singapore",
  "country": "sg",
  "city": "Singapore",
  "currency": "SGD",                             // ISO 4217 code fees are quoted in
  "website": "https://www.nus.edu.sg",
  "description": "Singapore's oldest and largest ...",   // 1–2 factual sentences, shown on hover over the name
  "whyIncluded": "MOE-funded Autonomous University ...", // why it is in the calculator (evidence of Singaporean demand)
  "partners": [                                  // optional; only for institutions that teach other universities' degrees (SIM)
    { "id": "uol", "name": "University of London", "country": "United Kingdom", "website": "https://www.london.ac.uk", "description": "..." }
  ],
  "programmes": [
    {
      "partner": "uol",                          // required when the university has "partners": id of the awarding partner
      "level": "bachelor",                       // "bachelor" | "master"
      "field": "computing",                      // "engineering" | "computing" | "business" | "sciences" | "arts" | "law" | "medicine" | "psychology" | "nursing"
      "name": "Bachelor of Computing (Computer Science)",
      "majors": ["Finance", "Marketing"],         // optional; majors offered within this one degree at the same fee
      "durationYears": 4,                        // may be fractional, e.g. 1.5
      "feeYear": 2025,                           // calendar year the academic year STARTS in
      "fees": {
        // "international" is required. "citizen" (Singapore Citizen) and "pr"
        // (Singapore PR) only exist for Singapore universities.
        "citizen":       { "annualTuition": 8250,  "annualCompulsoryFees": 400, "oneOffFees": 0 },
        "pr":            { "annualTuition": 11550, "annualCompulsoryFees": 400, "oneOffFees": 0 },
        "international": { "annualTuition": 17550, "annualCompulsoryFees": 400, "oneOffFees": 0 }
      },
      "sourceUrl": "https://...",                // page the figure was read from
      "lastVerified": "2026-09-23",              // ISO date the figure was last checked
      "sourceType": "official",                  // "official" (university/government site) | "secondary" (aggregator, news)
      "cohortLocked": true,                      // true if the fee is fixed for the whole programme once you enrol
      "internationalEligible": true,             // optional; false if the programme is closed to international students
      "summary": "Yearly tuition after the MOE Tuition Grant, fixed for your whole degree.",  // shown on the site: 1-2 plain sentences for parents, max 280 chars
      "notes": "Tuition Grant rates; excludes GST",   // optional; detailed source/method notes for maintainers, not shown
      "feeHistory": [                            // fees for EARLIER intakes/years; see below
        {
          "feeYear": 2024,
          "tier": "international",
          "annualTuition": 17000,
          "annualCompulsoryFees": 400,           // optional; current value is used if omitted
          "oneOffFees": 0,                       // optional; current value is used if omitted
          "sourceUrl": "https://..."             // optional but strongly preferred
        }
      ],
      "laterYears": [                            // optional; years of study charged a different fee, see below
        { "fromYear": 2, "annualTuition": 86561, "estimate": false }
      ]
    }
  ]
}
```

Definitions:
- `annualTuition` — tuition charged per academic year, in `currency`.
  If a university quotes a total programme fee (common for Master's),
  divide it by `durationYears` and say so in `notes`.
- `annualCompulsoryFees` — other fees every student must pay each year
  (student services fee, amenities fee, ICT fee). 0 if none or unknown.
- `oneOffFees` — compulsory fees paid once (e.g. Japanese entrance/admission fee,
  non-refundable enrolment fee). Not deposits that are later credited to tuition.
- `cohortLocked` — NUS/NTU/SMU and most UK universities fix fees for an intake
  cohort; many US/AU/CA universities raise them every year. When it is true the
  calculator does not apply yearly increases after the start year.
- `laterYears` — for programmes where later years of study cost a different
  amount from the first year (clinical years of medicine, a JD with a lighter
  credit load after year 1). `fromYear` is the 1-based year of study the figure
  applies from, until the next entry; `tier` limits an entry to one residency
  tier (omit for all); `annualCompulsoryFees` defaults to the current value;
  `estimate: true` marks a figure derived from a published programme total
  rather than quoted per year. The calculator charges each year its own fee
  and projects later years from the same `feeYear` as `fees`. Without this,
  the first-year fee is charged every year, so always add it where the
  university publishes higher later-year fees, and say so in `summary`.
- `partners` / `partner` — for an institution such as SIM Global Education whose
  degrees are awarded by partner universities. The calculator then asks for the
  partner after the university, and the yearly increase is estimated from that
  partner's programmes first.
- US public universities: use the non-resident (out-of-state/international) rate.
- Singaporeans studying abroad are international students, so only `international`
  matters outside Singapore.

Fee history:
- One entry per earlier `feeYear` **and tier**. For a Singapore university, a 2024
  entry for citizens needs its own `{"feeYear": 2024, "tier": "citizen", ...}` row,
  and likewise for `pr` and `international`.
- The calculator shows start years 2024–2028. A 2024 or 2025 start uses these
  entries and nothing else: if the needed year/tier has no entry, the programme is
  shown as "No published fee on file" rather than estimated.
- For cohort-locked programmes (fees fixed per intake), the entry is the fee for the
  cohort that started in `feeYear`. For others it is that academic year's fee.
- Only add figures you actually found in a source. Never back-calculate.

Living costs (optional, universities outside Singapore only):
```jsonc
"livingCosts": {
  "year": 2026,                 // year the estimate is for (academic year it starts in)
  "months": 9,                  // months per academic year the estimate covers
  "monthly": {                  // per month, in the university's currency
    "housing": 1500,            // rent / accommodation incl. utilities
    "food": 600,                // groceries and meals
    "transport": 100,           // local transport
    "personal": 300             // books, phone, clothing, personal and other
  },
  "sourceUrl": "https://...",   // the university's own cost-of-living / cost-of-attendance page
  "lastVerified": "2026-09-23",
  "sourceType": "official",
  "summary": "The university's own estimate for a 9-month year; excludes flights and visas.",  // shown on the site
  "notes": "Undergraduate cost of attendance, off-campus; annual $X over 9 months"
}
```
- Put it at the top level of the university file, next to `programmes`.
- Use the university's own published estimate. If it gives yearly amounts, divide by
  the number of months it covers and record the original figures in `notes`.
- Map its categories onto the four above (e.g. "housing and food" split only if the
  page splits it; otherwise put the combined figure in housing and say so).
- Exclude tuition, fees, health insurance, visa costs and flights.
