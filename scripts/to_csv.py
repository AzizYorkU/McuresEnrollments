"""Convert each SAS file to a raw CSV in data/ (all original columns, UTF-8)."""
import os
from load import load, NAMES, DATA
OUT = os.path.join(DATA, "data"); os.makedirs(OUT, exist_ok=True)
for n in NAMES:
    d = load(n)
    for c in d.select_dtypes("float"):
        if (d[c].dropna() % 1 == 0).all():
            d[c] = d[c].astype("Int64")  # whole numbers, keep blanks blank
    p = os.path.join(OUT, f"{n}.csv")
    d.to_csv(p, index=False, encoding="utf-8", lineterminator="\n")
    print(f"{n:11s} rows={len(d):7d} cols={len(d.columns)} {os.path.getsize(p)/1e6:6.2f}MB {list(d.columns)}")
