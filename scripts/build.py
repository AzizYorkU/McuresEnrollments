import json, os, pandas as pd
from load import load, NAMES
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"); os.makedirs(OUT, exist_ok=True)
CAT = {"age": "Age_Group", "campus": "University_Campus_En_Desc", "cip": "CIP_e__title", "country": "Country_of_Citizenship",
       "credential": "Credential", "gender": "Gender_Group", "program": "Program_Name", "status": "Immigration_Status",
       "studyyear": "Study_Year", "tongue": "Mother_Tongue_Group"}
for n in NAMES:
    d = load(n)
    c = CAT[n]
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
