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
    "peer_groups": "7faded20eef6fb6fee7bac811118c8ff", "cip": "e640b3f10b687ffd4b22d4cb6d315782",
}
REMOVED = ["program", "campus"]  # datasets the York-vs-peers page no longer uses (files kept in the repo)

# id, tab label, column header, note under the table
DIMS = [
    ("cip2", "Field of study", "Field of study (CIP series)", "Detailed CIP codes rolled up to their 2-digit series."),
    ("cip", "Detailed programs", "Program (6-digit CIP)", "York share and Peer share are shares of the program’s field of study, not of all students."),
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
    w("set", "dash", "params", data={"group": "Large universities", "level": "All levels", "year": "2024-2025", "dim": "cip2", "metric": "change_base", "page": "overview", "field": "All fields", "rview": "bars"}),
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
    w("set", "datasets", "cip", data={
        "title": "Headcount by detailed program",
        "description": "Headcount for each institution, study level and fiscal year (2012-13 to 2024-25) by 6-digit CIP code and title, from cip.sas7bdat. "
                       "The slice column is institution|level|year; All institutions and All levels totals added; zero counts dropped.",
        "source": {"kind": "file", "url": f"/_blob/{BLOBS['cip']}", "name": "cip.csv", "format": "csv"},
        "updated": {"at": now, "by": "Claude, converted from cip.sas7bdat"}, "fixed": True}),
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
    const tk = (ly, category) => (__WITHIN__ ? ly + '|' + category.slice(0, 2) : ly);
    for (const r of __D__) {
      const [inst, level, year] = r.slice.split('|');
      const n = Number(r.headcount);
      const ly = level + '|' + year;
      if (inst === 'York') {
        add(york, ly + '|' + r.category, n);
        add(yorkTotal, tk(ly, r.category), n);
      } else {
        for (const g of groupsOf.get(inst) ?? []) {
          add(peers, g + '|' + ly + '|' + r.category, n);
          add(peerTotal, g + '|' + tk(ly, r.category), n);
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
        const yt = yorkTotal.get(tk(level + '|' + year, category)), pt = peerTotal.get(group + '|' + tk(level + '|' + year, category));
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
    note_html = f'\n          <p class="ux-note">{note}</p>' if note else ""
    low = col.lower()
    mixnote = ('Share of each one’s students in the field, for its 12 largest programs, selected year.' if d == 'cip'
               else 'Share of each one’s students in the 12 largest groups, selected year.')
    pick = ('\n      <p class="ux-msg ux-pick-field" hidden>Pick a field of study in the filters to see the programs within it. Showing the largest programs across all fields.</p>'
            if d == "cip" else "")
    return f"""
    <div class="ux-dim" data-dim="{d}" id="by-{d}" hidden>
      <p class="ux-empty ux-msg" hidden>No {low} headcounts are reported for York in this selection.</p>{pick}
      <div class="ux-dim-body">
        <div class="ux-card" id="{d}-mix" data-view="mix">
          <h3>{tab}: York against <span data-draw="sel-group">—</span></h3>
          <p class="ux-note">{mixnote}</p>
          <div class="ux-legend-static"><span class="ux-key"><i class="ux-sw" data-i="0"></i>York</span><span class="ux-key"><i class="ux-sw" data-i="1"></i>Peers combined</span></div>
          <div class="ux-bars dash-skeleton" data-draw="mix-bars" data-source="cmp_{d}"></div>
        </div>
        <div class="ux-card" id="{d}-field" data-view="gains">
          <h3>{tab}: change in York’s share since 2012-13</h3>
          <p class="ux-note">York’s share of the students in each group (York ÷ York + peers), change since 2012-13 in percentage points. The 12 largest groups.</p>
          <p class="ux-note ux-first-year" hidden>Pick a year after 2012-13 to see the change.</p>
          <div class="ux-hbars dash-skeleton" data-draw="field-bars" data-source="cmp_{d}"></div>
        </div>
        <div class="ux-card" id="{d}-table" data-view="table">
          <div class="ux-card-head">
            <h3>{tab}: all groups</h3>
            <input class="ux-search" id="search-{d}" type="search" placeholder="Search" aria-label="Search {low}">
          </div>
          <p class="ux-note">Gap: York’s share minus the peers’ share, in points. York’s share of group: York ÷ York + peers.</p>{note_html}
          <div class="ux-scroll ux-scroll-tall">
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
    </div>"""


css = open(os.path.join(HERE, "page.css"), encoding="utf-8").read()
js = open(os.path.join(HERE, "page.js"), encoding="utf-8").read()
calcs = "".join(CMP_FN.replace("__D__", d).replace("__LOW__", tab.lower()).replace("__WITHIN__", "true" if d == "cip" else "false")
                .replace("York’s and the group’s headcount and share by category", "York’s and the group’s headcount and share of the field of study by program" if d == "cip" else "York’s and the group’s headcount and share by category")
                for d, tab, *_ in DIMS)
tabs = "\n".join(f'          <button class="ux-tab ux-dimtab" data-dim="{d}" aria-pressed="false">{tab}</button>' for d, tab, *_ in DIMS)
sections = "".join(section(*x) for x in DIMS)

html = f"""<meta name="dash-one-writer">
<style>
{css}
</style>
<div class="ux">
<div class="ux-app">
  <nav class="ux-nav" aria-label="Pages">
    <p class="ux-nav-h">York overall</p>
    <button class="ux-navlink" type="button" data-page="overview">Overview</button>
    <button class="ux-navlink" type="button" data-page="growth">Growth since 2012-13</button>
    <button class="ux-navlink" type="button" data-page="share">Share of Ontario</button>
    <p class="ux-nav-h">Against the group</p>
    <button class="ux-navlink" type="button" data-page="ranking">Ranking</button>
    <button class="ux-navlink" type="button" data-page="institutions">Institutions</button>
    <p class="ux-nav-h">Breakdowns</p>
    <button class="ux-navlink" type="button" data-page="mix">York’s mix</button>
    <button class="ux-navlink" type="button" data-page="gains">Gains and losses</button>
    <button class="ux-navlink" type="button" data-page="table">Breakdown table</button>
  </nav>

  <div class="ux-main">
    <header class="ux-head">
      <h1>York University against its Ontario peers</h1>
    </header>

    <div class="ux-filters" id="filters">
      <div class="ux-frow" role="group" aria-labelledby="fh-view">
        <p class="ux-frow-h" id="fh-view">View</p>
        <label class="ux-field">Year <select id="f-year" data-draw="year-select" data-source="totals"></select></label>
        <label class="ux-field">Compare with <select id="f-group" data-draw="group-select" data-source="peer_groups"></select></label>
        <div class="ux-field ux-reset-cell"><button class="ux-btn ux-reset" type="button">Reset</button></div>
      </div>
      <div class="ux-frow" role="group" aria-labelledby="fh-program">
        <p class="ux-frow-h" id="fh-program">Program</p>
        <label class="ux-field">Study level
          <select id="f-level" class="ux-level">
            <option>All levels</option>
            <option>Undergraduate</option>
            <option>Graduate</option>
          </select>
        </label>
        <label class="ux-field">Credential <select id="f-credential" class="ux-subset" data-draw="subset-select" data-subset="credential" data-source="totals"></select></label>
        <label class="ux-field">Year of study <select id="f-studyyear" class="ux-subset" data-draw="subset-select" data-subset="studyyear" data-source="totals"></select></label>
        <label class="ux-field ux-field-wide">Field of study <select id="f-field" class="ux-field-select" data-draw="field-select" data-source="totals group_totals"></select></label>
      </div>
      <div class="ux-frow" role="group" aria-labelledby="fh-student">
        <p class="ux-frow-h" id="fh-student">Student</p>
        <label class="ux-field">Citizenship <select id="f-citizen" class="ux-subset" data-draw="subset-select" data-subset="citizen" data-source="totals"></select></label>
        <label class="ux-field">Gender <select id="f-gender" class="ux-subset" data-draw="subset-select" data-subset="gender" data-source="totals"></select></label>
      </div>
    </div>
    <p class="ux-note ux-filter-note">Year, comparison group and study level always apply. Credential, field of study, year of study, citizenship and gender come from separate files that aren’t cross-tabulated, so only one of those five applies at a time: picking one clears the others. Year of study is reported for undergraduates only.</p>

    <section class="ux-page" data-page="overview" id="overview" hidden>
      <div class="ux-lists" id="figures">
        <div class="ux-card ux-list-card" id="list-headcount">
          <p class="ux-list-l">Headcount</p>
          <h3 class="ux-rank">York ranks <b data-draw="r-headcount" data-source="york_standing">—</b></h3>
          <ol class="ux-list dash-skeleton" data-draw="ov-list" data-field="headcount" data-source="totals group_totals peer_groups"></ol>
          <div class="ux-spark dash-skeleton" data-draw="ov-spark" data-field="headcount" data-source="totals group_totals"></div>
        </div>
        <div class="ux-card ux-list-card" id="list-change_base">
          <p class="ux-list-l">Growth since 2012-13</p>
          <h3 class="ux-rank">York ranks <b data-draw="r-change_base" data-source="york_standing">—</b></h3>
          <ol class="ux-list dash-skeleton" data-draw="ov-list" data-field="change_base" data-source="totals group_totals peer_groups"></ol>
          <div class="ux-spark dash-skeleton" data-draw="ov-spark" data-field="change_base" data-source="totals group_totals"></div>
        </div>
        <div class="ux-card ux-list-card" id="list-intl_share">
          <p class="ux-list-l">International share</p>
          <h3 class="ux-rank">York ranks <b data-draw="r-intl_share" data-source="york_standing">—</b></h3>
          <p class="ux-note ux-no-intl" hidden>Only available for all students. Clear the filters to see it.</p>
          <ol class="ux-list dash-skeleton" data-draw="ov-list" data-field="intl_share" data-source="totals group_totals peer_groups"></ol>
          <div class="ux-spark dash-skeleton" data-draw="ov-spark" data-field="intl_share" data-source="totals group_totals"></div>
        </div>
        <div class="ux-card ux-list-card" id="list-ontario_share">
          <p class="ux-list-l">Share of Ontario students</p>
          <h3 class="ux-rank">York ranks <b data-draw="r-ontario_share" data-source="york_standing">—</b></h3>
          <ol class="ux-list dash-skeleton" data-draw="ov-list" data-field="ontario_share" data-source="totals group_totals peer_groups"></ol>
          <p class="ux-note">York since 2012-13: <b data-draw="o-base" data-source="york_ontario">—</b></p>
          <div class="ux-spark dash-skeleton" data-draw="ov-spark" data-field="ontario_share" data-source="totals group_totals"></div>
        </div>
      </div>
      <p class="ux-note">Selected year and study level, highest first. York is highlighted. Peers: the group’s members added together, not ranked. Small charts: York (and peers combined, where comparable) each year from 2012-13. In the Field of study list, each field shows York’s headcount and its growth in that field since 2012-13 against the comparison group’s combined growth: green where York grew faster, red where slower. Each chart has its own page in the menu.</p>
    </section>

    <section class="ux-page" data-page="growth" id="growth" hidden>
      <div class="ux-card" id="growth-card">
        <h2>Growth since 2012-13</h2>
        <p class="ux-note">Headcount indexed to 2012-13 = 100, so institutions of any size compare. Hover a grey line to name the peer.</p>
        <div class="ux-legend-static"><span class="ux-key"><i class="ux-sw" data-i="0"></i>York</span><span class="ux-key"><i class="ux-sw" data-i="1"></i>Peers combined</span><span class="ux-key"><i class="ux-sw" data-muted></i>Each peer</span></div>
        <div class="ux-chart ux-chart-big dash-skeleton" data-draw="growth" data-source="totals group_totals peer_groups"></div>
        <p class="ux-note">The scale stops near the fastest-growing peers; a small institution growing from a low base can run off the top.</p>
      </div>
    </section>

    <section class="ux-page" data-page="share" id="share" hidden>
      <div class="ux-card" id="share-card">
        <h2>York’s share of Ontario students</h2>
        <p class="ux-note">York’s headcount as a share of all Ontario universities combined, each year.</p>
        <div class="ux-chart ux-chart-big dash-skeleton" data-draw="share" data-source="york_ontario"></div>
      </div>
    </section>

    <section class="ux-page" data-page="ranking" id="ranking" hidden>
      <div class="ux-rank-controls">
        <div class="ux-tabs ux-rview-tabs" role="group" aria-label="Chart">
          <button class="ux-tab ux-rviewtab" data-rview="bars" aria-pressed="true">2D</button>
          <button class="ux-tab ux-rviewtab" data-rview="3d" aria-pressed="false">3D</button>
        </div>
        <div class="ux-tabs" role="group" aria-label="Rank by">
          <button class="ux-tab ux-metric" data-metric="change_base" aria-pressed="false">Since 2012-13</button>
          <button class="ux-tab ux-metric" data-metric="change_prev" aria-pressed="false">Previous year</button>
          <button class="ux-tab ux-metric" data-metric="headcount" aria-pressed="false">Headcount</button>
          <button class="ux-tab ux-metric" data-metric="intl_share" aria-pressed="false">International share</button>
        </div>
      </div>
      <p class="ux-note ux-no-intl" hidden>International share is only available for all students; clear the filters to rank on it.</p>
      <div class="ux-card" id="rank-card" data-rview-panel="bars">
        <h2>How York ranks against <span data-draw="sel-group">—</span>: <span data-draw="sel-metric">—</span></h2>
        <p class="ux-note">Selected year and study level. A › marks a bar cut short to keep the others readable.</p>
        <div class="ux-hbars dash-skeleton" data-draw="rank-bars" data-source="totals group_totals peer_groups"></div>
      </div>
      <div class="ux-card" id="rank3d-card" data-rview-panel="3d" hidden>
        <h2><span data-draw="sel-metric">—</span> by year, in 3D</h2>
        <p class="ux-note">York and each member of <span data-draw="sel-group">—</span>, from the year you pick here to the Year filter, for the selected study level and filter. Drag the chart or use the arrow keys to rotate it; hover a bar for its figures and a dashed line at its height on the back walls. Bars rise from the 0 level, or drop below it for a fall. Bars further back start higher on the screen, so their tops can look taller than they are; compare them against the dashed line. Growth since 2012-13 starts in 2013-14. Each university has its own colour, matching its name; York is orange and in bold.</p>
        <div class="ux-3d-box dash-skeleton" data-draw="bars3d" data-source="totals peer_groups"></div>
      </div>
    </section>

    <section class="ux-page" data-page="institutions" id="institutions" hidden>
      <div class="ux-card" id="inst-card">
        <h2>Institutions in the comparison</h2>
        <p class="ux-note">Selected year and study level. York is highlighted.</p>
        <div class="ux-scroll ux-scroll-tall">
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
    </section>

    <section class="ux-page" data-page="mix gains table" id="breakdown" hidden>
      <div class="ux-break">
        <p class="ux-msg ux-field-off" hidden>The filters above (other than study level and comparison group) don’t apply to the breakdowns, which aren’t cross-tabulated. The one exception: a field of study narrows the Detailed programs tab to that field.</p>
        <div class="ux-tabs" role="group" aria-label="Break down by">
{tabs}
        </div>
      </div>
{sections}
    </section>

    <p class="ux-note ux-foot">Source: Ontario university headcounts, 2012-13 to 2024-25, one file per breakdown. With no filter, figures, growth, ranks and the institution table use the domestic/international file; with a field of study, gender, citizenship, credential or year of study picked they use that file, whose totals can run slightly lower. Peers combined adds up every member of the chosen group; ranks count York and the group’s members (1 = highest). Large universities are those with more than 20,000 students in 2024-25; the groups are an editable file in Sources. Breakdown shares use each file’s own total, which can run up to about 2% lower where a group isn’t reported.</p>
  </div>
</div>
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
