# Fee data schema

One JSON file per university at `data/universities/<country>/<id>.json`.
Country codes: `sg`, `uk`, `au`, `us`, `ca`, `nz`, `jp`.

```jsonc
{
  "id": "nus",                                   // lowercase slug, same as filename
  "name": "National University of Singapore",
  "country": "sg",
  "city": "Singapore",
  "currency": "SGD",                             // ISO 4217 code fees are quoted in
  "website": "https://www.nus.edu.sg",
  "programmes": [
    {
      "level": "bachelor",                       // "bachelor" | "master"
      "field": "computing",                      // "engineering" | "computing" | "business" | "sciences" | "arts"
      "name": "Bachelor of Computing (Computer Science)",
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
      "notes": "Tuition Grant rates; excludes GST",   // optional
      "feeHistory": [                            // fees for EARLIER intakes/years; see below
        {
          "feeYear": 2024,
          "tier": "international",
          "annualTuition": 17000,
          "annualCompulsoryFees": 400,           // optional; current value is used if omitted
          "oneOffFees": 0,                       // optional; current value is used if omitted
          "sourceUrl": "https://..."             // optional but strongly preferred
        }
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
