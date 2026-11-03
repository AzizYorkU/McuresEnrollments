import pandas as pd
from load import load
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 200)
st = load("status"); sy = load("studyyear"); g = load("gender")
print("studyyear levels:", sy.groupby("Study_Level").headcount.sum().astype(int).to_dict(),
      "| status levels:", st.groupby("Study_Level").headcount.sum().astype(int).to_dict())
print("headcount values: min", st.headcount.min(), "non-integer?", (st.headcount % 1 != 0).any())
y0, y1 = "2012-2013", "2024-2025"
inst = st.pivot_table(index="Institution", columns="Fiscal_Year", values="headcount", aggfunc="sum")
out = pd.DataFrame({"2012-13": inst[y0], "2024-25": inst[y1]})
out["growth_%"] = (out["2024-25"] / out["2012-13"] - 1) * 100
intl = st[st.Fiscal_Year == y1].pivot_table(index="Institution", columns="Immigration_Status", values="headcount", aggfunc="sum")
out["intl_share_%_24-25"] = intl["International"] / intl.sum(axis=1) * 100
print("\nBy institution:"); print(out.sort_values("2024-25", ascending=False).round(1).to_string())
lv = st.pivot_table(index="Fiscal_Year", columns=["Study_Level", "Immigration_Status"], values="headcount", aggfunc="sum")
print("\nSystem by level & status:"); print(lv.astype(int).to_string())
gs = g[g.Fiscal_Year == y1].groupby("Gender_Group").headcount.sum()
print("\nGender 2024-25:", (gs / gs.sum() * 100).round(1).to_dict())
