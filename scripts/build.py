import json, os, pandas as pd
from load import load, NAMES
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"); os.makedirs(OUT, exist_ok=True)
CAT = {"age": "Age_Group", "campus": "University_Campus_En_Desc", "cip": "CIP_e__title", "country": "Country_of_Citizenship",
       "credential": "Credential", "gender": "Gender_Group", "program": "Program_Name", "status": "Immigration_Status",
       "studyyear": "Study_Year", "tongue": "Mother_Tongue_Group"}
# 2-digit CIP series titles (CIP Canada 2021), used to roll detailed codes up for comparison across institutions
CIP2 = {"01": "Agriculture and veterinary sciences", "03": "Natural resources and conservation", "04": "Architecture",
        "05": "Area, ethnic, cultural and gender studies", "09": "Communication and journalism", "10": "Communications technologies",
        "11": "Computer and information sciences", "12": "Personal and culinary services", "13": "Education", "14": "Engineering", "15": "Engineering technologies",
        "16": "Languages, literatures and linguistics", "19": "Family and consumer sciences", "22": "Legal professions and studies",
        "23": "English language and literature", "24": "Liberal arts and humanities, general", "25": "Library science",
        "26": "Biological and biomedical sciences", "27": "Mathematics and statistics", "30": "Multidisciplinary studies",
        "31": "Parks, recreation and kinesiology", "36": "Leisure and recreational activities", "38": "Philosophy and religious studies", "39": "Theology",
        "40": "Physical sciences", "41": "Science technologies", "42": "Psychology", "43": "Security and protection services",
        "44": "Public administration and social services", "45": "Social sciences", "49": "Transportation",
        "50": "Visual and performing arts", "51": "Health professions", "52": "Business and management",
        "53": "Secondary and preparatory programs", "54": "History", "55": "French language and literature",
        "60": "Residency programs", "61": "Medical residency and fellowship programs", "89": "Not reported or not classified"}
GROUPS = [("Top 5 universities", ["Toronto", "Western", "Ottawa", "Waterloo"]),  # largest by 2024-25 headcount; York, 2nd, is the fifth
          ("Large universities", ["Toronto", "Western", "Ottawa", "Waterloo", "McMaster", "Metropolitan", "Guelph", "Queen's", "Carleton"]),
          ("GTA universities", ["Toronto", "Metropolitan", "Ontario Tech", "OCADU"]),
          ("All other Ontario universities", None)]  # None: every institution but York

def cip2(d):
    d = d.copy()
    code = d["CIP"].astype(str).str.split(".").str[0].str.zfill(2)
    d["CIP2"] = code + " " + code.map(CIP2).fillna("Series " + code)
    return d

for n in NAMES + ["cip2"]:
    d = cip2(load("cip")) if n == "cip2" else load(n)
    c = "CIP2" if n == "cip2" else CAT[n]
    if n == "studyyear":
        d[c] = d[c].map(lambda v: "Not reported" if pd.isna(v) else f"Year {int(v)}")
    if n == "cip":
        d[c] = d["CIP"] + " " + d[c]  # keep the code so same-titled CIPs stay distinct
    d = d.rename(columns={c: "category"})[["Institution", "Study_Level", "Fiscal_Year", "category", "headcount"]]
    d["category"] = d["category"].fillna("Not reported").astype(str).str.strip()
    parts = [d]
    if n != "program":
        parts.append(d.assign(Institution="All institutions"))
    allv = pd.concat(parts)
    allv = pd.concat([allv, allv.assign(Study_Level="All levels")])
    g = allv.groupby(["Institution", "Study_Level", "Fiscal_Year", "category"], as_index=False).headcount.sum()
    g = g[g.headcount > 0]
    g["slice"] = g.Institution + "|" + g.Study_Level + "|" + g.Fiscal_Year
    g["headcount"] = g.headcount.astype(int)
    path = os.path.join(OUT, f"{n}.csv")
    g[["slice", "category", "headcount"]].to_csv(path, index=False, encoding="utf-8", lineterminator="\n")
    print(f"{n:11s} rows={len(g):7d} size={os.path.getsize(path)/1e6:.2f}MB cats={g.category.nunique()} sample={sorted(g.category.unique())[:4]}")

NL = chr(10)
insts = sorted(set(load("status").Institution) - {"York"})
rows = [(i, g, m) for i, (g, ms) in enumerate(GROUPS, 1) for m in (ms or insts)]
pd.DataFrame(rows, columns=["order", "group", "institution"]).to_csv(os.path.join(OUT, "peer_groups.csv"), index=False, lineterminator=NL)
print("peer_groups", len(rows))
