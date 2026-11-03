# McuresEnrollments

An interactive explorer of Ontario university enrolment headcounts, fiscal years 2012-13 to 2024-25. It covers 24 institutions at the undergraduate and graduate levels.

**Live dashboard:** https://claude.ai/artifact/74HZbzDpJKKZejBnGEivkX

## What the dashboard shows

- Filters for institution, study level and fiscal year (defaults: York, all levels, 2024-25)
- Four headline figures and stacked domestic/international bars by year
- A sortable table of institutions
- Ten breakdown tabs: field of study (CIP), program, country of citizenship, immigration status, age, gender, mother tongue, credential, year of study and campus. Each tab has a top-15 bar chart compared with 2012-13, share-over-time lines for the top six categories, and a searchable table.

## Data

The source is ten SAS datasets (`age`, `campus`, `cip`, `country`, `credential`, `gender`, `program`, `status`, `studyyear`, `tongue`.sas7bdat). They are **not included in this repository**. Put them in the repo root to rebuild.

Notes on the data:
- Use `cp1252` encoding to read the files, except `program`, which needs `latin1`.
- `campus` uses different column names (`Institution_Name__D_`, `Study_Level_1_Desc`). The loader renames them.
- `studyyear` and `campus` cover undergraduates only.
- `program` and `country` totals run about 1.5-2% below the other files.

## Scripts (`scripts/`)

| File | Purpose |
|---|---|
| `load.py` | Shared loader: reads a SAS file with the right encoding and normalizes column names |
| `build.py` | Converts each SAS file to `scripts/out/<dim>.csv` (`slice` = `institution\|level\|year`, `category`, `headcount`) and adds "All institutions" / "All levels" rollups |
| `gen.py` | Combines `page.css` + `page.js` into the dashboard page and the dataset docs (`scripts/docs/`) |
| `page.css`, `page.js` | Dashboard page source |
| `peek.py`, `overview.py`, `headlines.py` | First-look analysis of the raw files |

## Rebuild

```sh
pip install -r requirements.txt
cd scripts
python build.py   # SAS -> CSV
python gen.py     # page + dataset docs
```
