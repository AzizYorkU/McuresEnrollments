"""Builds the dashboard page (docs/index.json) and the store writes (docs/writes.json) for the York-vs-peers dashboard.

Usage: python gen.py '{"dash/meta": 1, "files/index.html": 3, ...}'
The optional JSON maps store documents to the version last read, so each write is pinned (if_version).
"""
import json, os, sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "docs")
os.makedirs(OUT, exist_ok=True)
VERSIONS = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

# Uploaded asset ids, one per CSV in scripts/out
BLOBS = {
    "status": "d43b798f47ec029d5fabe0465965bc65", "age": "660ebe85ec35434adf86a0949da38afc",
    "country": "ef6338b961b6e6ea21305c69cbcd94f1", "credential": "5ee8bd0601319ac7a231fa765715a66f",
    "gender": "24e8d17d4190003e50eeed89426b30bd", "studyyear": "95f2dc413de6f94aac44102b5dacde38",
    "tongue": "ad69eec14c41ca8ad6ec1a02b8e8d0d1", "cip2": "a1f6ae4b1aa9d56d7a31b24e7bcbf724",
    "peer_groups": "7faded20eef6fb6fee7bac811118c8ff",
}
REMOVED = ["cip", "program", "campus"]  # datasets the York-vs-peers page no longer uses (files kept in the repo)

# id, tab label, column header, note under the table
DIMS = [
    ("cip2", "Field of study", "Field of study (CIP series)", "Detailed CIP codes rolled up to their 2-digit series."),
    ("country", "Citizenship", "Country of citizenship", ""),
    ("age", "Age", "Age group", ""),
    ("gender", "Gender", "Gender group", ""),
    ("tongue", "Mother tongue", "Mother tongue", ""),
    ("credential", "Credential", "Credential", ""),
    ("studyyear", "Year of study", "Year of study", "Reported for undergraduates only."),
]

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def w(op, collection, doc_id, **kw):
    e = {"op": op, "collection": collection, "doc_id": doc_id, **kw}
    v = VERSIONS.get(f"{collection}/{doc_id}")
    if v:
        e["if_version"] = v
    return e


writes = [
    w("update", "dash", "meta", data={"title": "York University vs Ontario Peers"}),
    w("set", "dash", "params", data={"group": "Large universities", "level": "All levels", "year": "2024-2025", "dim": "cip2", "metric": "change_base"}),
    w("set", "datasets", "cip2", data={
        "title": "Headcount by field of study",
        "description": "Headcount for each institution, study level and fiscal year (2012-13 to 2024-25) by 2-digit CIP series, rolled up from cip.sas7bdat's "
                       "detailed codes. The slice column is institution|level|year; All institutions and All levels totals added; zero counts dropped.",
        "source": {"kind": "file", "url": f"/_blob/{BLOBS['cip2']}", "name": "cip2.csv", "format": "csv"},
        "updated": {"at": now, "by": "Claude, rolled up from cip.sas7bdat"}, "fixed": True}),
    w("set", "datasets", "peer_groups", data={
        "title": "Comparison groups",
        "description": "Which institutions make up each group York is compared with: Large universities (over 20,000 students in 2024-25), "
                       "GTA universities, and all other Ontario universities. Edit this file to change a group.",
        "source": {"kind": "file", "url": f"/_blob/{BLOBS['peer_groups']}", "name": "peer_groups.csv", "format": "csv"},
        "updated": {"at": now, "by": "Claude, chosen from 2024-25 headcounts"}}),
] + [w("delete", "datasets", d) for d in REMOVED]

CMP_FN = """dash.calc('cmp___D__', {
  inputs: ['__D__', 'peer_groups'],
  title: 'York vs comparison groups, __LOW__',
  description: 'For each comparison group: York’s and the group’s headcount and share by category, York’s share of York plus the group, and change since 2012-13.',
  fn: (__D__, peer_groups) => {
    const groupsOf = new Map();
    for (const g of peer_groups) groupsOf.set(g.institution, [...(groupsOf.get(g.institution) ?? []), g.group]);
    const york = new Map(), peers = new Map(), yorkTotal = new Map(), peerTotal = new Map();
    const add = (m, k, n) => m.set(k, (m.get(k) ?? 0) + n);
    for (const r of __D__) {
      const [inst, level, year] = r.slice.split('|');
      const n = Number(r.headcount);
      const ly = level + '|' + year;
      if (inst === 'York') {
        add(york, ly + '|' + r.category, n);
        add(yorkTotal, ly, n);
      } else {
        for (const g of groupsOf.get(inst) ?? []) {
          add(peers, g + '|' + ly + '|' + r.category, n);
          add(peerTotal, g + '|' + ly, n);
        }
      }
    }
    const rows = [];
    for (const group of new Set(peer_groups.map((g) => g.group))) {
      const keys = new Set(york.keys());
      for (const k of peers.keys()) if (k.startsWith(group + '|')) keys.add(k.slice(group.length + 1));
      for (const k of keys) {
        const parts = k.split('|');
        const [level, year] = parts;
        const category = parts.slice(2).join('|');
        const yt = yorkTotal.get(level + '|' + year), pt = peerTotal.get(group + '|' + level + '|' + year);
        const y = york.get(k) ?? 0, p = peers.get(group + '|' + k) ?? 0;
        const bk = level + '|2012-2013|' + category;
        const yb = york.get(bk) ?? 0, pb = peers.get(group + '|' + bk) ?? 0;
        const field = y + p ? y / (y + p) : null;
        const fieldBase = yb + pb ? yb / (yb + pb) : null;
        const later = year !== '2012-2013';
        rows.push({
          key: group + '|' + k, group, level, year, category, york: y, peers: p,
          york_share: yt ? y / yt : null,
          peer_share: pt ? p / pt : null,
          gap: yt && pt ? (y / yt - p / pt) * 100 : null,
          field_share: field,
          field_change: later && field != null && fieldBase != null ? (field - fieldBase) * 100 : null,
          york_change: later && yb ? y / yb - 1 : null,
          peer_change: later && pb ? p / pb - 1 : null,
        });
      }
    }
    return rows;
  },
});
"""


def section(d, tab, col, note):
    note_html = f'\n        <p class="ux-note">{note}</p>' if note else ""
    low = col.lower()
    return f"""
  <section class="ux-dim" data-dim="{d}" id="by-{d}" hidden>
    <p class="ux-empty ux-msg" hidden>No {low} headcounts are reported for York in this selection.</p>
    <div class="ux-dim-body">
      <div class="ux-grid">
        <div class="ux-card" id="{d}-mix">
          <h3>York’s mix against <span data-draw="sel-group">—</span></h3>
          <p class="ux-note">Share of each one’s students in the 12 largest groups, selected year.</p>
          <div class="ux-legend-static"><span class="ux-key"><i class="ux-sw" data-i="0"></i>York</span><span class="ux-key"><i class="ux-sw" data-i="1"></i>Peers combined</span></div>
          <div class="ux-bars dash-skeleton" data-draw="mix-bars" data-source="cmp_{d}"></div>
        </div>
        <div class="ux-card" id="{d}-field">
          <h3>Where York gained or lost ground</h3>
          <p class="ux-note">York’s share of the students in each group (York ÷ York + peers), change since 2012-13 in percentage points.</p>
          <p class="ux-note ux-first-year" hidden>Pick a year after 2012-13 to see the change.</p>
          <div class="ux-hbars dash-skeleton" data-draw="field-bars" data-source="cmp_{d}"></div>
        </div>
      </div>
      <div class="ux-card" id="{d}-table">
        <div class="ux-card-head">
          <h3>All groups</h3>
          <input class="ux-search" id="search-{d}" type="search" placeholder="Search" aria-label="Search {low}">
        </div>
        <p class="ux-note">Gap: York’s share minus the peers’ share, in points. York’s share of group: York ÷ York + peers.</p>{note_html}
        <div class="ux-scroll">
          <table class="ux-table" id="table-{d}" data-rows="dim-rows" data-source="cmp_{d}" data-row-key="key" data-default-sort="york">
            <thead><tr>
              <th data-field="category"><button class="ux-sort" data-sort="category">{col}</button></th>
              <th class="ux-num" data-field="york"><button class="ux-sort" data-sort="york">York</button></th>
              <th class="ux-num" data-field="york_share"><button class="ux-sort" data-sort="york_share">York share</button></th>
              <th class="ux-num" data-field="peer_share"><button class="ux-sort" data-sort="peer_share">Peer share</button></th>
              <th class="ux-num ux-hide-narrow" data-field="gap"><button class="ux-sort" data-sort="gap">Gap</button></th>
              <th class="ux-num" data-field="field_share"><button class="ux-sort" data-sort="field_share">York’s share of group</button></th>
              <th class="ux-num" data-field="field_change"><button class="ux-sort" data-sort="field_change">Change</button></th>
              <th class="ux-num ux-hide-narrow" data-field="york_change"><button class="ux-sort" data-sort="york_change">York since 2012-13</button></th>
              <th class="ux-num ux-hide-narrow" data-field="peer_change"><button class="ux-sort" data-sort="peer_change">Peers since 2012-13</button></th>
            </tr></thead>
            <tbody data-draw="dim-rows"></tbody>
          </table>
        </div>
      </div>
    </div>
  </section>"""


css = open(os.path.join(HERE, "page.css"), encoding="utf-8").read()
js = open(os.path.join(HERE, "page.js"), encoding="utf-8").read()
calcs = "".join(CMP_FN.replace("__D__", d).replace("__LOW__", tab.lower()) for d, tab, *_ in DIMS)
tabs = "\n".join(f'      <button class="ux-tab ux-dimtab" data-dim="{d}" aria-pressed="false">{tab}</button>' for d, tab, *_ in DIMS)
sections = "".join(section(*x) for x in DIMS)

html = f"""<meta name="dash-one-writer">
<style>
{css}
</style>
<div class="ux">
  <header class="ux-head" id="overview">
    <h1>York University against its Ontario peers</h1>
    <p class="ux-lede">In <span data-draw="sel-year">—</span>, York had <b data-draw="lede-york" data-source="totals">—</b> students (<span data-draw="sel-level">—</span>), <b data-draw="lede-york-chg" data-source="totals">—</b> since 2012-13. Its comparison group, <span data-draw="sel-group">—</span>, changed by <b data-draw="lede-peer-chg" data-source="group_totals">—</b> combined.</p>
  </header>

  <div class="ux-filters" id="filters">
    <label class="ux-field">Compare with <select id="f-group" data-draw="group-select" data-source="peer_groups"></select></label>
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
  <p class="ux-members">In the group: <span data-draw="members" data-source="peer_groups">—</span></p>

  <div class="ux-tiles" id="figures">
    <div class="ux-tile"><span class="ux-tile-l">York headcount</span><span class="ux-tile-v dash-skeleton" data-draw="t-headcount" data-source="totals">—</span>
      <span class="ux-sub"><span>Rank by size <b data-draw="r-headcount" data-source="york_standing">—</b></span></span></div>
    <div class="ux-tile"><span class="ux-tile-l">Growth since 2012-13</span><span class="ux-tile-v dash-skeleton" data-draw="t-base" data-source="totals">—</span>
      <span class="ux-sub"><span>Peers <b data-draw="g-base" data-source="group_totals">—</b></span><span>Rank <b data-draw="r-change_base" data-source="york_standing">—</b></span></span></div>
    <div class="ux-tile"><span class="ux-tile-l">From previous year</span><span class="ux-tile-v dash-skeleton" data-draw="t-prev" data-source="totals">—</span>
      <span class="ux-sub"><span>Peers <b data-draw="g-prev" data-source="group_totals">—</b></span><span>Rank <b data-draw="r-change_prev" data-source="york_standing">—</b></span></span></div>
    <div class="ux-tile"><span class="ux-tile-l">International share</span><span class="ux-tile-v dash-skeleton" data-draw="t-intl" data-source="totals">—</span>
      <span class="ux-sub"><span>Peers <b data-draw="g-intl" data-source="group_totals">—</b></span><span>Rank <b data-draw="r-intl_share" data-source="york_standing">—</b></span></span></div>
    <div class="ux-tile"><span class="ux-tile-l">York’s share of Ontario</span><span class="ux-tile-v dash-skeleton" data-draw="t-ont" data-source="york_ontario">—</span>
      <span class="ux-sub"><span>Since 2012-13 <b data-draw="o-base" data-source="york_ontario">—</b></span></span></div>
  </div>

  <div class="ux-grid">
    <div class="ux-card" id="growth">
      <h3>Growth since 2012-13</h3>
      <p class="ux-note">Headcount indexed to 2012-13 = 100, so institutions of any size compare. Hover a grey line to name the peer.</p>
      <div class="ux-legend-static"><span class="ux-key"><i class="ux-sw" data-i="0"></i>York</span><span class="ux-key"><i class="ux-sw" data-i="1"></i>Peers combined</span><span class="ux-key"><i class="ux-sw" data-muted></i>Each peer</span></div>
      <div class="ux-chart dash-skeleton" data-draw="growth" data-source="totals group_totals peer_groups"></div>
      <p class="ux-note">The scale stops near the fastest-growing peers; a small institution growing from a low base can run off the top.</p>
    </div>
    <div class="ux-card" id="share">
      <h3>York’s share of Ontario students</h3>
      <p class="ux-note">York’s headcount as a share of all Ontario universities combined, each year.</p>
      <div class="ux-chart dash-skeleton" data-draw="share" data-source="york_ontario"></div>
    </div>
  </div>

  <div class="ux-section" id="ranking">
    <h2>How York ranks</h2>
    <div class="ux-grid">
      <div class="ux-card" id="rank-chart">
        <div class="ux-card-head">
          <h3>York and <span data-draw="sel-group">—</span></h3>
        </div>
        <div class="ux-tabs" role="group" aria-label="Rank by">
          <button class="ux-tab ux-metric" data-metric="change_base" aria-pressed="false">Since 2012-13</button>
          <button class="ux-tab ux-metric" data-metric="change_prev" aria-pressed="false">Previous year</button>
          <button class="ux-tab ux-metric" data-metric="headcount" aria-pressed="false">Headcount</button>
          <button class="ux-tab ux-metric" data-metric="intl_share" aria-pressed="false">International share</button>
        </div>
        <p class="ux-note">Selected year and study level. A › marks a bar cut short to keep the others readable.</p>
        <div class="ux-hbars dash-skeleton" data-draw="rank-bars" data-source="totals group_totals peer_groups"></div>
      </div>
      <div class="ux-card" id="institutions">
        <h3>Institutions in the comparison</h3>
        <p class="ux-note">Selected year and study level.</p>
        <div class="ux-scroll ux-scroll-short">
          <table class="ux-table ux-inst-table" id="table-inst" data-rows="inst-rows" data-source="totals peer_groups" data-row-key="slice">
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
  </div>

  <div class="ux-break" id="breakdown">
    <h2>Where York differs from its peers</h2>
    <div class="ux-tabs" role="group" aria-label="Break down by">
{tabs}
    </div>
  </div>
{sections}

  <p class="ux-note ux-foot">Source: Ontario university headcounts, 2012-13 to 2024-25, one file per breakdown. Figures, growth, ranks and the institution table use the domestic/international file. Peers combined adds up every member of the chosen group; ranks count York and the group’s members (1 = highest). Large universities are those with more than 20,000 students in 2024-25; the groups are an editable file in Sources. Breakdown shares use each file’s own total, which can run up to about 2% lower where a group isn’t reported.</p>
</div>
<script>
{calcs}
{js}
</script>
"""
with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump({"text": html}, f, ensure_ascii=False)
writes.append(w("set", "files", "index.html", file_path=os.path.abspath(os.path.join(OUT, "index.json"))))
with open(os.path.join(OUT, "writes.json"), "w", encoding="utf-8") as f:
    json.dump(writes, f, ensure_ascii=False, indent=1)
print("page bytes:", len(html.encode()), "writes:", len(writes))

# Static site for GitHub Pages (repo-root docs/): same page, a small runtime stand-in (site/dash.js), CSVs alongside.
import shutil
SITE = os.path.join(os.path.dirname(HERE), "docs")
os.makedirs(os.path.join(SITE, "data"), exist_ok=True)
ids = ["status", "peer_groups"] + [d for d, *_ in DIMS]
for i in ids:
    shutil.copyfile(os.path.join(HERE, "out", f"{i}.csv"), os.path.join(SITE, "data", f"{i}.csv"))
for f in ["dash.js", "theme.css", "d3.min.js"]:
    shutil.copyfile(os.path.join(HERE, "site", f), os.path.join(SITE, f))
open(os.path.join(SITE, ".nojekyll"), "w").close()
params = next(e["data"] for e in writes if e["collection"] == "dash" and e["doc_id"] == "params")
body = html.replace('<meta name="dash-one-writer">\n', "").replace("the groups are an editable file in Sources", "the groups are listed in data/peer_groups.csv")
page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>York University vs Ontario Peers</title>
<meta name="description" content="How York University's enrolment compares with other Ontario universities, 2012-13 to 2024-25.">
<link rel="stylesheet" href="theme.css">
<script src="d3.min.js"></script>
<script>
window.DASH_SOURCES = {json.dumps({i: f"data/{i}.csv" for i in ids})};
window.DASH_PARAMS = {json.dumps(params)};
</script>
<script src="dash.js"></script>
</head>
<body>
<main class="site">
{body}
<footer class="site-foot">Data: Ontario university headcounts by institution, 2012-13 to 2024-25. Source code and data: <a href="https://github.com/AzizYorkU/McuresEnrollments">github.com/AzizYorkU/McuresEnrollments</a>.</footer>
</main>
</body>
</html>
"""
with open(os.path.join(SITE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page)
print("site:", SITE, "files:", sorted(os.listdir(SITE)))
