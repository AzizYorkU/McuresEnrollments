import json, os
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "docs")
os.makedirs(OUT, exist_ok=True)

BLOBS = {
    "status": "d43b798f47ec029d5fabe0465965bc65", "age": "660ebe85ec35434adf86a0949da38afc",
    "campus": "73fd16248886fc0efc034ee3616707b9", "cip": "a6d7ddcbda812e649787895674d247ab",
    "country": "ef6338b961b6e6ea21305c69cbcd94f1", "credential": "5ee8bd0601319ac7a231fa765715a66f",
    "gender": "24e8d17d4190003e50eeed89426b30bd", "program": "b21bd00c6d1f2187e6bdd3a5c44ab498",
    "studyyear": "95f2dc413de6f94aac44102b5dacde38", "tongue": "ad69eec14c41ca8ad6ec1a02b8e8d0d1",
}
# id, tab label, column header, dataset title, what the category is, extra note
DIMS = [
    ("cip", "Field of study", "Field of study (CIP)", "Headcount by field of study", "CIP code and English title", ""),
    ("program", "Program", "Program", "Headcount by program", "program name as each institution reports it",
     "Program names are each institution's own."),
    ("country", "Citizenship", "Country of citizenship", "Headcount by citizenship", "country of citizenship", ""),
    ("status", "Domestic / international", "Immigration status", "Headcount by immigration status", "domestic or international", ""),
    ("age", "Age", "Age group", "Headcount by age group", "age group", ""),
    ("gender", "Gender", "Gender group", "Headcount by gender", "gender group", ""),
    ("tongue", "Mother tongue", "Mother tongue", "Headcount by mother tongue", "mother tongue group", ""),
    ("credential", "Credential", "Credential", "Headcount by credential", "credential type", ""),
    ("studyyear", "Year of study", "Year of study", "Headcount by year of study", "year of study",
     "Reported for undergraduates only."),
    ("campus", "Campus", "Campus", "Headcount by campus", "campus", "Reported for undergraduates only."),
]

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
writes = [{"op": "set", "collection": "dash", "doc_id": "meta", "data": {"title": "Ontario University Enrolment"}},
          {"op": "set", "collection": "dash", "doc_id": "params",
           "data": {"inst": "York", "level": "All levels", "year": "2024-2025", "dim": "cip"}}]
for d, _, _, title, what, _ in DIMS:
    rollup = "All institutions and All levels totals added" if d != "program" else "All levels totals added (no all-institution total, since program names differ by institution)"
    writes.append({"op": "set", "collection": "datasets", "doc_id": d, "data": {
        "title": title,
        "description": f"Headcount for each institution, study level and fiscal year (2012-13 to 2024-25) by {what}, from {d}.sas7bdat. "
                       f"The slice column is institution|level|year; {rollup}; zero counts dropped.",
        "source": {"kind": "file", "url": f"/_blob/{BLOBS[d]}", "name": f"{d}.csv", "format": "csv"},
        "updated": {"at": now, "by": f"Claude, converted from {d}.sas7bdat"},
    }})

SHARE_FN = """dash.calc('share_{d}', {{
  inputs: ['{d}'],
  title: 'Share and change, {low}',
  description: 'Each group as a share of its slice total, and its change since 2012-13.',
  fn: ({d}) => {{
    const total = new Map();
    for (const r of {d}) total.set(r.slice, (total.get(r.slice) ?? 0) + Number(r.headcount));
    const count = new Map({d}.map((r) => [r.slice + '\\n' + r.category, Number(r.headcount)]));
    return {d}.map((r) => {{
      const n = Number(r.headcount);
      const [inst, level, year] = r.slice.split('|');
      const base = count.get(`${{inst}}|${{level}}|2012-2013\\n${{r.category}}`);
      return {{
        slice: r.slice,
        category: r.category,
        share: n / total.get(r.slice),
        change_base: base && year !== '2012-2013' ? n / base - 1 : null,
      }};
    }});
  }},
}});
"""

def section(d, tab, col, title, what, note):
    note_html = f'\n      <p class="ux-note">{note}</p>' if note else ""
    need = ('\n    <p class="ux-need-inst ux-msg" hidden>Programs are named by each institution, so pick one institution to see them.</p>'
            if d == "program" else "")
    return f"""
  <section class="ux-dim" data-dim="{d}" id="by-{d}" hidden>{need}
    <p class="ux-empty ux-msg" hidden>No {col.lower()} headcounts are reported for this selection.</p>
    <div class="ux-dim-body">
      <div class="ux-grid">
        <div class="ux-card" id="{d}-top">
          <h3>Largest groups</h3>
          <p class="ux-note">Top 15 in the selected year, with share of headcount. Thin bar: the same group in 2012-13.</p>
          <div class="ux-bars dash-skeleton" data-draw="bars" data-source="{d} share_{d}"></div>
        </div>
        <div class="ux-card" id="{d}-mix">
          <h3>Share over time</h3>
          <p class="ux-note">The six largest groups in the selected year, as a share of headcount each year.</p>
          <div class="ux-chart dash-skeleton" data-draw="mix" data-source="{d} share_{d}"></div>
        </div>
      </div>
      <div class="ux-card" id="{d}-table">
        <div class="ux-card-head">
          <h3>All groups</h3>
          <input class="ux-search" id="search-{d}" type="search" placeholder="Search" aria-label="Search {col.lower()}">
        </div>{note_html}
        <div class="ux-scroll">
          <table class="ux-table" id="table-{d}" data-rows="dim-rows" data-source="{d}" data-row-key="slice,category">
            <thead><tr>
              <th data-field="category"><button class="ux-sort" data-sort="category">{col}</button></th>
              <th class="ux-num" data-field="headcount"><button class="ux-sort" data-sort="headcount">Headcount</button></th>
              <th class="ux-num" data-source="share_{d}" data-field="share"><button class="ux-sort" data-sort="share">Share</button></th>
              <th class="ux-num" data-source="share_{d}" data-field="change_base"><button class="ux-sort" data-sort="change_base">Since 2012-13</button></th>
            </tr></thead>
            <tbody data-draw="dim-rows"></tbody>
          </table>
        </div>
      </div>
    </div>
  </section>"""

css = open(os.path.join(HERE, "page.css"), encoding="utf-8").read()
js = open(os.path.join(HERE, "page.js"), encoding="utf-8").read()
calcs = "".join(SHARE_FN.format(d=d, low=tab.lower()) for d, tab, *_ in DIMS)
tabs = "\n".join(f'      <button class="ux-tab" data-dim="{d}" aria-pressed="false">{tab}</button>' for d, tab, *_ in DIMS)
sections = "".join(section(*x) for x in DIMS)

html = f"""<meta name="dash-one-writer">
<style>
{css}
</style>
<div class="ux">
  <header class="ux-head" id="overview">
    <h1>Ontario university enrolment</h1>
    <p class="ux-lede"><span data-draw="sel-inst">—</span> · <span data-draw="sel-level">—</span>: <b data-draw="lede-total" data-source="totals">—</b> students in <span data-draw="sel-year">—</span>, <b data-draw="lede-change" data-source="totals">—</b> since 2012-13.</p>
  </header>

  <div class="ux-filters" id="filters">
    <label class="ux-field">Institution <select id="f-inst" data-draw="inst-select" data-source="totals"></select></label>
    <label class="ux-field">Study level
      <select id="f-level" class="ux-level">
        <option>All levels</option>
        <option>Undergraduate</option>
        <option>Graduate</option>
      </select>
    </label>
    <label class="ux-field">Year <select id="f-year" data-draw="year-select" data-source="totals"></select></label>
    <button class="ux-btn ux-reset" type="button">Reset</button>
  </div>

  <div class="ux-tiles" id="figures">
    <div class="ux-tile"><span class="ux-tile-l">Headcount</span><span class="ux-tile-v dash-skeleton" data-draw="tile-headcount" data-source="totals">—</span><span class="ux-note">In the selected year</span></div>
    <div class="ux-tile"><span class="ux-tile-l">From previous year</span><span class="ux-tile-v dash-skeleton" data-draw="tile-prev" data-source="totals">—</span><span class="ux-note">Change in headcount</span></div>
    <div class="ux-tile"><span class="ux-tile-l">Since 2012-13</span><span class="ux-tile-v dash-skeleton" data-draw="tile-base" data-source="totals">—</span><span class="ux-note">Change in headcount</span></div>
    <div class="ux-tile"><span class="ux-tile-l">International share</span><span class="ux-tile-v dash-skeleton" data-draw="tile-intl" data-source="totals">—</span><span class="ux-note">Of headcount in the selected year</span></div>
  </div>

  <div class="ux-grid">
    <div class="ux-card" id="trend">
      <h3>Enrolment by year</h3>
      <p class="ux-note">Domestic and international headcount. Click a bar to pick that year.</p>
      <div class="ux-legend-static"><span class="ux-key"><i class="ux-sw" data-i="0"></i>Domestic</span><span class="ux-key"><i class="ux-sw" data-i="1"></i>International</span></div>
      <div class="ux-chart dash-skeleton" data-draw="trend" data-source="totals"></div>
    </div>
    <div class="ux-card" id="institutions">
      <h3>Institutions</h3>
      <p class="ux-note">Selected year and study level. Click a name to focus on it.</p>
      <div class="ux-scroll ux-scroll-short">
        <table class="ux-table ux-inst-table" id="table-inst" data-rows="inst-rows" data-source="totals" data-row-key="slice">
          <thead><tr>
            <th data-field="institution"><button class="ux-sort" data-sort="institution">Institution</button></th>
            <th class="ux-num" data-field="headcount"><button class="ux-sort" data-sort="headcount">Headcount</button></th>
            <th class="ux-num ux-hide-narrow" data-field="change_prev"><button class="ux-sort" data-sort="change_prev">1 yr</button></th>
            <th class="ux-num" data-field="change_base"><button class="ux-sort" data-sort="change_base">Since 2012-13</button></th>
            <th class="ux-num" data-field="intl_share"><button class="ux-sort" data-sort="intl_share">Intl</button></th>
          </tr></thead>
          <tbody data-draw="inst-rows"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="ux-break" id="breakdown">
    <h2>Breakdown</h2>
    <div class="ux-tabs" role="group" aria-label="Break down by">
{tabs}
    </div>
  </div>
{sections}

  <p class="ux-note ux-foot">Source: ten SAS files of Ontario university headcounts, one per breakdown. Figures, the yearly chart and the institution table use the domestic/international file. Each breakdown's shares use that file's own total, which can run up to about 2% lower where a group isn't reported.</p>
</div>
<script>
{calcs}
{js}
</script>
"""
with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump({"text": html}, f, ensure_ascii=False)
writes.append({"op": "set", "collection": "files", "doc_id": "index.html", "file_path": os.path.abspath(os.path.join(OUT, "index.json"))})
with open(os.path.join(OUT, "writes.json"), "w", encoding="utf-8") as f:
    json.dump(writes, f, ensure_ascii=False, indent=1)
print("page bytes:", len(html.encode()), "writes:", len(writes))
