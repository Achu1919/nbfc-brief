#!/usr/bin/env python3
"""Validate a data/ folder against docs/DATA_FORMAT.md.  python3 tests/test_contract.py [data_dir]"""
import json, re, sys
from pathlib import Path

D = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SOLICIT = re.compile(r"\b(subscribe now|apply now|invest now|book your|limited window|don't miss|grab)\b", re.I)
errs = []

def err(m): errs.append(m)

def check_day(d, where):
    for k in ("id", "label", "weekday", "is_monday", "due", "filed", "reports", "key_numbers", "mfl_market"):
        if k not in d: err(f"{where}: missing {k}")
    if not ISO.match(str(d.get("id", ""))): err(f"{where}: bad id")
    for r in d.get("reports", []):
        if r.get("key") not in ("01-daily-watch", "02-regulation", "03-weekly-analysis"): err(f"{where}: report key {r.get('key')}")
    for it in d.get("key_numbers", {}).get("items", []):
        if "value_num" in it and it["value_num"] is not None and not isinstance(it["value_num"], (int, float)): err(f"{where}: value_num {it.get('key')}")
        if it.get("key") in ("mfl", "muthoot_fincorp"): err(f"{where}: MFL item in peer/market set")
    for m in d.get("mfl_market", []):
        if m.get("kind") not in (None, "ncd", "rating", "news", "watch"): err(f"{where}: mfl_market kind {m.get('kind')}")
        if not m.get("name"): err(f"{where}: mfl_market row without name")
    for s in d.get("stories", []) or []:
        if s.get("sentiment") not in (None, "positive", "negative", "watch", "neutral"): err(f"{where}: sentiment {s.get('sentiment')}")
        t = s.get("mfl_impact") or ""
        if SOLICIT.search(t): err(f"{where}: solicitation wording in mfl_impact: {t[:80]}")
        if re.search(r"\b(we|our|you|your)\b", t, re.I): err(f"{where}: mfl_impact not third person: {t[:80]}")
    for r in d.get("rules", []) or []:
        if r.get("applies_to_mfl") not in (True, False, "unclear"): err(f"{where}: applies_to_mfl {r.get('applies_to_mfl')}")
    for c in d.get("reg_calendar", []) or []:
        if not ISO.match(str(c.get("date", ""))) or not c.get("item"): err(f"{where}: reg_calendar row {c}")

j = json.loads((D / "latest.json").read_text(encoding="utf-8"))
if j.get("schema") != "nbfc-brief" or j.get("schema_version") != 1: err("latest.json: schema/schema_version")
if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", str(j.get("generated", ""))): err("latest.json: generated")
if not j.get("today") or j["today"].get("id") != j.get("latest"): err("latest.json: today/latest mismatch")
else: check_day(j["today"], "latest.json today")
ids = [x["id"] for x in j.get("days", [])]
if ids != sorted(ids, reverse=True): err("latest.json: days not newest-first")
for i in ids:
    p = D / f"{i}.json"
    if not p.exists(): err(f"missing {p.name}"); continue
    check_day(json.loads(p.read_text(encoding="utf-8")), p.name)
for k, ser in (j.get("series") or {}).items():
    for day, v in ser.items():
        if v is not None and not isinstance(v, (int, float)): err(f"series {k} {day}")
print(f"{len(ids)} day(s) checked, {len(errs)} problem(s)")
for e in errs[:50]: print(" -", e)
sys.exit(1 if errs else 0)
