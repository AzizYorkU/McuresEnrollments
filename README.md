# McuresEnrollments

How York University's enrolment compares with other Ontario universities, fiscal years 2012-13 to 2024-25. The data covers 24 institutions at the undergraduate and graduate levels.

**Website:** https://azizyorku.github.io/McuresEnrollments/ (GitHub Pages, served from `docs/` on `main`). To run it locally instead, double-click `serve.cmd`.

**Local copy:** a static copy of the dashboard in `docs/`. Double-click `serve.cmd` (needs Python) to open it at http://127.0.0.1:8000, reachable only from your own computer. It works offline: d3 v7.9.0 is bundled in `docs/d3.min.js`.

**Claude dashboard:** https://claude.ai/artifact/74HZbzDpJKKZejBnGEivkX

## What the dashboard shows

- **Comparison group** (switchable): large universities (over 20,000 students in 2024-25), GTA universities, or all other Ontario universities. The groups are defined in `scripts/out/peer_groups.csv`, produced by `build.py`.
- **Headline figures:** York's headcount, growth since 2012-13, change from the previous year, international share and share of all Ontario students, each with the peers' combined value and York's rank in the group.
- **Growth since 2012-13:** York, peers combined and each peer, indexed to 2012-13 = 100.
- **York's share of Ontario students** over time.
- **Ranking** of York and its peers on growth, headcount or international share, plus a table of the institutions.
- **Breakdowns** by field of study (2-digit CIP series), citizenship, age, gender, mother tongue, credential and year of study. Each compares York's mix with the peers' mix and shows where York's share of the students in a category rose or fell since 2012-13.

Filters: study level and year.

## Data

The source is ten SAS datasets (`age`, `campus`, `cip`, `country`, `credential`, `gender`, `program`, `status`, `studyyear`, `tongue`.sas7bdat). The repository has them as CSVs in `data/`: UTF-8, every original column, headcounts as whole numbers, one row per institution × fiscal year × study level × category. `scripts/to_csv.py` regenerates the CSVs. The `.sas7bdat` originals are not committed; put them in the repo root to rebuild.

Notes on the data:
- Use `cp1252` encoding to read the files, except `program`, which needs `latin1`.
- `campus` uses different column names (`Institution_Name__D_`, `Study_Level_1_Desc`). The loader renames them.
- `studyyear` and `campus` cover undergraduates only.
- `program` and `country` totals run about 1.5-2% below the other files.

## Scripts (`scripts/`)

| File | Purpose |
|---|---|
| `load.py` | Shared loader: reads a SAS file with the right encoding and normalizes column names |
| `to_csv.py` | Converts each SAS file to a raw CSV in `data/` |
| `build.py` | Converts each SAS file to `scripts/out/<dim>.csv` (`slice` = `institution\|level\|year`, `category`, `headcount`), adds "All institutions" / "All levels" rollups, rolls CIP codes up to 2-digit series (`cip2.csv`) and writes the comparison groups (`peer_groups.csv`) |
| `gen.py` | Combines `page.css` + `page.js` with the per-breakdown York-vs-peers calculations into the dashboard page, and writes the dashboard store updates (`scripts/docs/`) |
| `page.css`, `page.js` | Dashboard page source |
| `site/dash.js`, `site/theme.css` | Stand-in for the dashboard runtime and theme, so the same page runs as the static site in `docs/` |
| `peek.py`, `overview.py`, `headlines.py` | First-look analysis of the raw files |

## Rebuild

```sh
pip install -r requirements.txt
cd scripts
python build.py   # SAS -> CSV
python gen.py     # dashboard page + static site in docs/
```
