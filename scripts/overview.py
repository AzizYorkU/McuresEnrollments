import pandas as pd
from load import load, NAMES
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30); pd.set_option("display.max_rows", 200)
dfs = {n: load(n) for n in NAMES}
g = dfs["gender"]
print("Institutions:", g.Institution.nunique()); print(sorted(g.Institution.unique()))
print("Years:", sorted(g.Fiscal_Year.unique()))
print("Study levels:", g.Study_Level.unique())
# consistency: total headcount per year across files
tot = pd.DataFrame({n: d.groupby("Fiscal_Year").headcount.sum() for n, d in dfs.items()})
print("\nTotal headcount by year per file:"); print(tot.astype("Int64"))
