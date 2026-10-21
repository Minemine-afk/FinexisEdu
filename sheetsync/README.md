# Editors' sheet

A spreadsheet that lets non-technical editors change existing fees, living costs and descriptions
without touching the code. It cannot add or remove universities, programmes or rows.

```
data/*.json  ──build──►  Google Sheet  ──editors change cells──►  apply  ──►  PR with data/ changes
```

## Tabs

| Tab | One row per | Editors can change |
|---|---|---|
| Fees | programme, tier and year (current, earlier, later-year fees) | tuition, compulsory and one-off fees, source type, source URL, last verified |
| Living costs | university outside Singapore | year, months, the four monthly amounts, source, last verified |
| University text | university | description, why included, how fees are priced |
| Programme text | programme | summary, "how this fee was worked out", fee basis, notes |

Grey columns are locked. Each row has a `Key` that ties it to its place in `data/`; editors must not change it.

## Commands

```bash
pip install -e ".[dev]"
python -m sheetsync.build . finexisedu-fee-sheet.xlsx        # write the workbook from data/
python -m sheetsync.apply finexisedu-fee-sheet.xlsx --dry-run # list what an edited workbook would change
python -m sheetsync.apply finexisedu-fee-sheet.xlsx           # write the changes into data/
```

`apply` is all or nothing. If any row has a problem (a negative fee, a bad date, a deleted or moved row, a
`feeChoice` over 160 characters or with an amount in it, two rows of one programme disagreeing on the source)
no file is changed and the report lists each problem with its sheet and row. Only cells whose value changed
are checked against the writing rules, so existing text is never rejected for being old. A sheet built from
unchanged data applies with no changes (tested).

## Setting it up

1. Run `build`, upload the `.xlsx` to Google Drive and open it as a Google Sheet. Share it with the editors by email.
2. Share the sheet so anyone with the link can **view** it, copy its id from the address, and add the repository
   secret `SHEET_EXPORT_URL` = `https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx`.
3. When editors have finished, run the **Sync editors' sheet** workflow (Actions tab). It opens a pull request;
   merge it and Vercel deploys as usual.

Google does not always keep an imported file's locked columns and dropdowns. After the first import, check them
and re-apply protection to the grey columns (Data > Protect sheets and ranges) if needed.

## Keeping the sheet and the monthly scraper from clashing

The monthly refresh (`refresh-data.yml`) also writes fees into `data/`. The sheet is a snapshot of `data/` taken
when it was built, so after the refresh PR is merged, rebuild the sheet from the new data before the next round
of edits. Otherwise the next sync would write the old scraped values back over the new ones, and the report would
list them as changes to check.
