# FinexisEdu

A web calculator for the **total university fees**, in Singapore dollars, of a
Bachelor's or Master's degree in Singapore and in nine of the countries where
Singaporeans most often study: Australia, the UK, the US, Germany, Canada,
New Zealand, Switzerland, Japan and Ireland (ranked by UNESCO's counts of
Singaporean students abroad). It is built for Singaporean students and families.

It covers tuition plus compulsory university fees (student services fees,
Japanese admission fees, and so on), and optionally living costs for studying
abroad. Visas, flights and health insurance are out of scope.

## How it works

```
             monthly GitHub Action                       every request (cached 24h)
 university ──► scrapers/ (Python) ──► PR with data/ ──► Next.js site ◄── Frankfurter FX API
 fee pages                             changes, reviewed    (Vercel)        (ECB rates)
                                       by a human
```

| Data | Where it comes from | How it stays current |
|---|---|---|
| Tuition and compulsory fees, per university, level and field | Each university's published fee page (HTML, PDF or JavaScript page) | `scrapers/` re-reads the pages monthly and opens a PR |
| Exchange rates to SGD | [Frankfurter](https://frankfurter.dev) (European Central Bank reference rates, free, no key) | Fetched live and cached for a day; `data/fx-fallback.json` is used if the API is down |
| Yearly fee increase used for future years | Each university's own rate: the median compound yearly rise across its programmes' published fee histories (per residency tier in Singapore), computed in `lib/increase.ts`. A per-country default in `data/countries/` is used where a university has fewer than two programmes with history | Country defaults recomputed by the same monthly run; university rates follow the data |

There is no public API for university tuition anywhere, so fees are scraped
from each university's own pages. Pages change layout from time to time, so
every scraped change goes through a pull request:

- changes over 25% are flagged at the top of the PR;
- a page that fails to scrape keeps its old value and is listed in the PR, and
  the workflow run is marked failed so GitHub notifies you;
- entries not verified for 11 months are listed as needing a manual check;
- the website shows a "Data may be outdated" badge on entries older than a year,
  and an "Unofficial source" badge on figures not taken from the university itself.

## Coverage (checked 8 Oct 2026)

109 universities, 1,388 programmes: five to sixteen universities in each of the
10 countries, plus SIM Global Education in Singapore, across nine fields (engineering,
computing, business, sciences, arts and humanities, law, medicine, psychology,
nursing). Psychology covers the main bachelor's and one taught master's at
every university that offers them (Imperial, SIT, TUM, ETH, EPFL and St. Gallen
have none; most US universities and several others teach psychology master's
only as research degrees, so they have the bachelor's only). MIT is listed with
Brain and Cognitive Sciences, its nearest equivalent. Law and medicine cover the universities on the
Singapore Institute of Legal Education's approved list and the Singapore
Medical Council's recognised list respectively, plus the local schools;
undergraduate-entry degrees (LLB, MBBS) sit under Bachelor's and graduate-entry
ones (JD, LLM, graduate-entry MD) under Master's. Where later years of a
programme cost more (the clinical years of medicine, say), each year is priced
at its own published fee (`laterYears` in the data; see `data/SCHEMA.md`).
Every current figure was checked against the university's own fee page or PDF
where the page is readable, and 2024/2025 figures come from the universities'
published fee tables for those years.

| Country | Universities | Scraped automatically |
|---|---|---|
| Singapore | NUS, NTU, SMU, SIT, SUSS, SIM (9 partner universities) | NUS, NTU, SIT; SMU, SUSS and SIM are manual |
| Australia | ANU, Melbourne, Monash, UNSW, Sydney, RMIT, Deakin, Queensland, Adelaide University | ANU, UNSW, Sydney; Melbourne and Monash are manual (Cloudflare); RMIT, Deakin, Queensland and Adelaide University are manual |
| UK | Cambridge (MBA), Imperial, LSE, Oxford, UCL, Glasgow, Manchester, Warwick, Hertfordshire, Coventry, East London, King's College London, Bristol, Birmingham | Cambridge, Imperial, LSE, UCL; Oxford is manual; the last nine are manual |
| US | Berkeley, CMU, Harvard, MIT, Stanford, ASU, UIUC, Purdue, Northeastern, USC, UCLA, Columbia, NYU, Boston University, Johns Hopkins, North Texas | First five: all; the other eleven are manual |
| Germany | TUM, LMU Munich, Heidelberg, RWTH Aachen, HU Berlin, TU Darmstadt, Duisburg-Essen, Bonn, Goethe Frankfurt, FU Berlin, OVGU Magdeburg | TUM, LMU Munich, Heidelberg and RWTH Aachen; HU Berlin (semester-fee page blocks bots) and the six newer universities are checked by hand |
| Canada | McGill, McMaster, Toronto, UBC, Waterloo, York, Concordia, Simon Fraser, Alberta, Western | First five: all (McMaster's tuition spreadsheet and UBC compulsory fees are manual); the other five are manual |
| New Zealand | Auckland, Canterbury, Massey, Otago, Victoria Wellington, Waikato, Lincoln, EIT, Unitec | All except Otago (bot-protected); Waikato, Lincoln, EIT and Unitec are manual |
| Switzerland | ETH Zurich, EPFL, Zurich, Geneva, St. Gallen, Lausanne, Basel, Bern, Neuchâtel, Fribourg, USI | All of the first five; Lausanne, Basel, Bern, Neuchâtel, Fribourg and USI are manual |
| Japan | Keio, Kyoto, Osaka, UTokyo, Waseda, APU, Ritsumeikan, Sophia, Kyushu, Nagoya, Tohoku, Institute of Science Tokyo, Tsukuba | First five: all (Waseda's lab/health fee is manual); the other eight are manual |
| Ireland | Trinity College Dublin, UCD, UCC, Galway, DCU, TU Dublin, Limerick, Maynooth, RCSI, Griffith College | First five: all (UCD's living-cost page is manual); TU Dublin, Limerick, Maynooth, RCSI and Griffith are manual |

Why these countries: Singapore's MOE does not track students who study
overseas, so the list follows the host countries' own counts of Singaporean
students as compiled by UNESCO UIS (2023–24): Australia ~6,800, UK ~6,100,
US ~3,800, then Germany, Canada, New Zealand, Switzerland, Japan and Ireland at
250–650 each. Malaysia (about 550) is left out because most Singaporeans there
take Singapore-delivered or branch-campus degrees.

**Manual** sources are listed in `scrapers/registry.yaml` and
`scrapers/registry.d/*.yaml` with the reason. They are pages that block
automated access (SMU, SUSS, Oxford, Melbourne, Monash, Otago, UCL's central
site, some NUS programme sites) or that show a fee spread across rows. Figures
from those sites carry an "Unofficial source" badge where the university's own
page could not be read.

SIM Global Education teaches 86 bachelor's and master's degrees awarded by
University of London, University at Buffalo, Birmingham, Wollongong, RMIT,
Stirling, Cardiff, Sydney and Alberta. Its fees appear only on each programme
page (GST-inclusive, Singaporeans & PRs vs international), so every page is a
manual source; 2024 to 2026 figures come from archived copies of those pages,
and programmes with no archived copy say so in their notes.

A few earlier-year figures are an official per-credit or per-course rate
multiplied by a standard full-time load (UNSW, UBC, Auckland), the same way the
current figures are built; their notes say so.

## Comparing up to three universities

The sidebar on the left holds the student settings (level, residency, start
year, fee increase, living costs) and the comparison slots. One university is
shown at first; "Compare another university" adds a second and a third slot,
each with a "remove" link. Each slot has a country dropdown, then a dropdown of
that country's universities, then the field of study offered at that
university (and a programme dropdown where it has more than one in that field).
SIM Global Education teaches degrees awarded by partner universities, so for
SIM a "Partner university" dropdown (University of London, Buffalo,
Birmingham and so on) comes between the university and the field, and the
partner is named on the tile, chart and details.
Because the field is chosen per slot, the same university can be compared
across two of its own courses, or two universities across different courses.
The results show a headline tile for each selection (programme, total in SGD
and how much more it costs than the cheapest), then vertical bars on a common
baseline. "Compare" switches the bars between the total and one part of it
(tuition, other fees, one-off fees, living costs); the total is stacked by
part. The year-by-year fees, living-cost breakdown, badges and source links for
each university sit in the details panel below the chart, all converted to
SGD, with the local-currency figure shown once in the heading.

Every university name is a link to its website; hovering (or tapping) it shows
a short description and why the university is in the calculator (`description`
and `whyIncluded` in its data file). For Singapore universities the details
also list the Citizen, PR and international fee per year side by side.

## Living costs (optional)

Switch on "Include living costs" to add each overseas university's own
published estimate of a student's living costs (housing, food, transport and
personal/books), stored as monthly amounts in `livingCosts` in its data file.

- **Lifestyle:** Moderate is the university's estimate; Frugal is 20% less and
  Comfortable 30% more. Each university's details section also has "Customise
  this budget" to enter your own monthly amounts.
- **Months:** the estimate covers the months the university states (e.g. 9 for
  a US academic year, 12 for Australia), charged pro rata for part years.
- **Later years** grow by the country's latest official CPI inflation
  (`livingCostIncrease` in `data/countries/`).
- **Not included for Singapore universities.** McGill publishes no estimate.
  Melbourne's figure is the Australian student-visa minimum (its own pages
  block automated access). Kyoto and Waseda use JASSO's official student
  survey. UCL's figure is its US-loan budget. The details say which source is used.
- The monthly scraper keeps these estimates updated like the fees.

## On phones

The site is responsive and can be installed as an app. In Safari, choose
**Share → Add to Home Screen**; in Chrome on Android, **⋮ → Install app**.
It then opens full-screen with its own icon (`app/manifest.ts`,
`public/icons/`). On small screens a bottom bar links from the options to the
results, chart bars open their breakdown on tap, and form fields are sized so
iOS doesn't zoom in.

## The calculation

The start year is typed in and must be 2026 or later; earlier years are refused with a prompt saying so. For each year of study:

- **Years up to the latest published fee year** use published figures only: the
  current fee, or for earlier years the programme's `feeHistory`. If a needed
  year has no published figure, the programme is shown as "No published fee on
  file"; the past is never estimated. Earlier years' fees (2024, 2025) stay in
  the data because the per-university increase is computed from them.
- **Later years** are projected:

  ```
  fee(year) = (annual tuition + annual compulsory fees) × (1 + yearly increase) ^ (years after the published fee year)
  ```

One-off fees are added in the first year, and everything is converted to SGD at
the latest rate.

The yearly increase is automatic and specific to the university chosen. The
sidebar box "Rates based on … figures" names the published fee year the
projections start from, takes the start year, and lists each selected
university's "% inflation": the median compound rise across that university's
programmes between their earliest and latest published fees, per residency tier
in Singapore. A university with fewer than two programmes carrying history falls
back to its country's typical rate, and the box says so. "Use my own rate
instead" applies one rate to every university.

- **Cohort-locked** programmes (NUS, NTU, SMU and many UK universities) keep the
  fee you start with for the whole degree, so only the gap between the
  published year and your start year is projected.
- Singapore universities have separate **Citizen / PR / international** rates
  (MOE Tuition Grant). Abroad, Singaporeans pay international rates.
- A partial final year (e.g. a 1.5-year Master's) is charged pro rata.

The engine is `lib/calc.ts`, with tests in `lib/calc.test.ts`.

## Project layout

```
app/, components/     Next.js site (App Router, Tailwind)
lib/                  fee engine, zod schema, data loader, exchange rates
data/                 all fee data as JSON; format described in data/SCHEMA.md
scrapers/             Python scraper pipeline
  registry.yaml       which page and regex feeds which fee figure
  registry.d/         one more registry file per newer university, merged in by run.py
  run.py              runs the registry, validates, writes data/, writes the PR summary
.github/workflows/    ci.yml (tests + build), refresh-data.yml (monthly scrape → PR)
```

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # fee engine + validation of every data file
npm run lint && npm run typecheck

python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest                               # scraper tests (offline fixtures)
.venv/bin/python -m scrapers.run --dry-run     # live scrape, prints the diff, writes nothing
```

For `parser: browser` sources, also run `pip install -e ".[browser]"` and
`python -m playwright install chromium`.

## Adding or fixing a university

1. Add or edit `data/universities/<country>/<id>.json` (see `data/SCHEMA.md`).
   Every programme needs a `sourceUrl`.
2. To keep it updated automatically, add a source to `scrapers/registry.yaml`
   with a regex whose first capture group is the amount. Test it with
   `python -m scrapers.run --dry-run --only <id>`.
3. If the page can't be scraped reliably, add it with `manual: true`. The
   monthly PR will remind you when it needs re-checking.

## Deploying

Import this repo into [Vercel](https://vercel.com/new) with **Add New → Project →
Import Git Repository** (not "Clone Template", which creates a separate, empty
repo). Vercel detects Next.js automatically; no settings or secrets are needed.
Production deploys from `main`. The page re-renders daily for fresh exchange
rates, and every merge into `main` (including approved data PRs) redeploys it.

For the monthly data PRs, go to **Settings → Actions → General** and allow
GitHub Actions to create pull requests.

## Limits

Figures are estimates for planning. Scholarships, bursaries, MOE service
obligations and fee changes a university hasn't published yet are not
included. Always confirm with the university.
