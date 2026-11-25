"""Fetches CUDO K3 retention rates (first-time, full-time first-year students returning the next fall) for every Ontario
university from COU's public customized-reports form, and writes out/retention.csv (institution, cohort, retention).
cohort = the fall the students started (Waterloo's own published rates match this reading). Run: python cudo.py"""
import os, re, csv, html, urllib.request, urllib.parse, http.cookiejar

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
URL = "https://couprodpublicreports.tgtsolutions.com/customized-reports-cudo.aspx"
P = "ctl00$Content$usrCtrlDynamicFilter1$"
NAMES = {"Algoma University": "Algoma", "Brock University": "Brock", "Carleton University": "Carleton", "Lakehead University": "Lakehead",
         "Laurentian University": "Laurentian", "McMaster University": "McMaster", "Nipissing University": "Nipissing", "OCAD University": "OCADU",
         "Ontario Tech University": "Ontario Tech", "Queen's University": "Queen's", "Toronto Metropolitan University": "Metropolitan",
         "Trent University": "Trent", "University of Guelph": "Guelph", "University of Ottawa": "Ottawa", "University of Toronto": "Toronto",
         "University of Waterloo": "Waterloo", "University of Windsor": "Windsor", "Western - Main Campus": "Western",
         "Wilfrid Laurier University": "Wilfrid Laurier", "York University": "York"}

op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
op.addheaders = [("User-Agent", "Mozilla/5.0")]


def fetch(data=None):
    body = urllib.parse.urlencode(data).encode() if data else None
    return op.open(URL, body, timeout=60).read().decode("utf-8", "replace")


def form(page):
    """The form's current values: hidden/text inputs, checked boxes, selected options (as a browser would post them)."""
    f = {}
    for m in re.finditer(r"<input([^>]*)>", page):
        a = m.group(1)
        name = re.search(r'name="([^"]+)"', a)
        if not name:
            continue
        t = (re.search(r'type="([^"]+)"', a) or [None, "text"])[1]
        v = html.unescape((re.search(r'value="([^"]*)"', a) or [None, "on"])[1])
        if t in ("hidden", "text") or (t in ("checkbox", "radio") and "checked" in a):
            f[name.group(1)] = v
    for m in re.finditer(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>', page, re.S):
        opts = re.findall(r'<option([^>]*)value="([^"]*)"', m.group(2))
        sel = [o for o in opts if "selected" in o[0]] or opts[:1]
        if sel:
            f[m.group(1)] = html.unescape(sel[0][1])
    return f


def options(page, name):
    m = re.search(r'<select[^>]*name="' + re.escape(name) + r'"[^>]*>(.*?)</select>', page, re.S)
    return [(html.unescape(v), html.unescape(re.sub("<[^>]+>", "", t)).strip())
            for v, t in re.findall(r'<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>', m.group(1), re.S)]


def boxes(page, listname):
    return re.findall(r'type="checkbox" name="(' + re.escape(P + listname) + r'\$\d+)"', page)


def post(page, changes, target=""):
    f = form(page)
    f.update(changes)
    f["__EVENTTARGET"], f["__EVENTARGUMENT"] = target, ""
    return fetch(f)


# Topic K (Other Useful Information) -> subtopic K3 (Retention Rates) -> every year and institution -> Run Report.
p = fetch()
k = next(v for v, t in options(p, P + "drpDwnLstTopicName") if t.startswith("K."))
p = post(p, {P + "drpDwnLstTopicName": k}, P + "drpDwnLstTopicName")
k3 = next(v for v, t in options(p, P + "DropDownDataGroup") if t.startswith("K3"))
p = post(p, {P + "drpDwnLstTopicName": k, P + "DropDownDataGroup": k3}, P + "DropDownDataGroup")
years, orgs = boxes(p, "chkLstYears"), boxes(p, "chkLstOrgs")
run = {P + "drpDwnLstTopicName": k, P + "DropDownDataGroup": k3, P + "drpDwnLstYearPos": "1", P + "drpDwnLstOrgPos": "2",
       P + "chkLstColumns$0": "on", P + "chkLstRows$0": "on", P + "btnReload": "Run Report",
       P + "txtChkOrg": "".join(f"{i}," for i in range(len(orgs))), P + "txtChkYear": "".join(f"{i}," for i in range(len(years))),
       P + "txtChkFund": "0,", P + "txtChkSource": "0,"}
run.update({n: "on" for n in years + orgs})
p = post(p, run)

# The report table: a header row of years, then one row per institution.
rows = [[html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", p, re.S)]
hdr = next(r for r in rows if len(r) >= 5 and all(re.fullmatch(r"20\d\d", c) for c in r))
out = []
for r in rows:
    name = next((c for c in r if c in NAMES), None)
    if not name:
        continue
    vals = r[r.index(name) + 1:]
    if len(vals) != len(hdr):  # the name also appears in the page's filter lists; only the report rows carry a value per year
        continue
    for yr, v in zip(hdr, vals):
        if not v:
            continue
        x = float(v)
        if x < 50:  # a few cells are entered as a fraction rounded to 0.9 (Toronto 2021 and 2022), so the rate is unknown
            print("skipped", NAMES[name], yr, v)
            continue
        out.append((NAMES[name], int(yr), round(x / 100, 4)))
out.sort()
assert {"York", "Toronto", "Western", "Waterloo"} <= {o[0] for o in out}, "report rows not found"
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "retention.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh, lineterminator="\n")
    w.writerow(["institution", "cohort", "retention"])
    w.writerows(out)
print("retention rows:", len(out), "institutions:", len({o[0] for o in out}), "cohorts:", min(o[1] for o in out), "-", max(o[1] for o in out))
