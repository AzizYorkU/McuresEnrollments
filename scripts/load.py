import os, pyreadstat, pandas as pd
DATA = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the SAS files sit one level up
NAMES = ["age","campus","cip","country","credential","gender","program","status","studyyear","tongue"]
def load(name):
    enc = "latin1" if name == "program" else "cp1252"
    df, _ = pyreadstat.read_sas7bdat(os.path.join(DATA, name + ".sas7bdat"), encoding=enc)
    # campus uses different column names
    df = df.rename(columns={"Institution_Name__D_": "Institution", "Study_Level_1_Desc": "Study_Level"})
    return df
