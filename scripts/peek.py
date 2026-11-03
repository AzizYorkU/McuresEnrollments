import pandas as pd
from load import load, NAMES
# Print each dataset's shape, columns and first rows.
for n in NAMES:
    df = load(n)
    print(f"== {n}: {df.shape[0]} rows x {df.shape[1]} cols")
    print(df.head(3).to_string(index=False)); print()
