# FinexisEdu

A web calculator for the **total university fees**, in Singapore dollars, of a
Bachelor's or Master's degree in Singapore, the UK, Australia, the US, Canada,
New Zealand and Japan. It is built for Singaporean students and families.

It covers tuition plus compulsory university fees (student services fees,
Japanese admission fees, and so on). Living costs, visas and flights are
deliberately out of scope.

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
| Yearly fee increase used for future years | Per-country default in `data/countries/`; replaced with the median observed increase once 5+ years of history exist | Recomputed by the same monthly run |

There is no public API for university tuition anywhere, so fees are scraped
from each university's own pages. Pages change layout from time to time, so
every scraped change goes through a pull request:

- changes over 25% are flagged at the top of the PR;
- a page that fails to scrape keeps its old value and is listed in the PR, and
  the workflow run is marked failed so GitHub notifies you;
- entries not verified for 11 months are listed as needing a manual check;
- the website shows a "Data may be outdated" badge on entries older than a year,
  and an "Unofficial source" badge on figures not taken from the university itself.

## The calculation

For each year of study:

```
fee(year) = (annual tuition + annual compulsory fees) × (1 + yearly increase) ^ (years after the published fee year)
```

plus one-off fees in the first year, converted to SGD at the latest rate.

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
