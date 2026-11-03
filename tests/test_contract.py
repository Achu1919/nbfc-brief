#!/usr/bin/env python3
"""Validate a data/ folder against docs/DATA_FORMAT.md.  python3 tests/test_contract.py [data_dir]"""
import json, re, sys
from pathlib import Path

D = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SOLICIT = re.compile(r"\b(subscribe now|apply now|invest now|book your|limited window|don't miss|grab)\b", re.I)
errs = []

def err(m): errs.append(m)

KINDS = {"story", "item", "circular", "calendar", "analysis"}
CATS = {"regulation", "muthoot-fincorp", "peers", "gold", "markets", "results", "ratings", "deals", "asset-quality"}
REG_KEYS = {"ref_no", "regulator", "applies_to", "issued", "effective", "status", "url"}
NCD_KEYS = {"issue", "open", "close", "size_cr", "rating", "coupon_range", "bids", "status", "source"}
EXCLUDED = re.compile(r"exa\.ai|stockfin|trackliveprice|makro\.live|stockwatch\.live", re.I)
PRIVATE_KEYS = {"lessons", "lesson", "quiz", "teaching"}

def no_private(o, where):
    """Public data never carries lessons, quizzes or teaching (keys or category)."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k.lower() in PRIVATE_KEYS: err(f"{where}: private key {k}")
            if k == "category" and v == "teaching": err(f"{where}: teaching category")
            no_private(v, where)
    elif isinstance(o, list):
        for v in o: no_private(v, where)

def check_card(c, where):
    w = f"{where} card {c.get('id')}"
    for k in ("id", "date", "report", "section", "kind", "category", "title", "summary", "impact", "source", "tags"):
        if k not in c: err(f"{w}: missing {k}")
    if c.get("report") not in ("news", "rules", "weekly"): err(f"{w}: report {c.get('report')}")
    if c.get("kind") not in KINDS: err(f"{w}: kind {c.get('kind')}")
    if c.get("category") not in CATS: err(f"{w}: category {c.get('category')}")
    if not c.get("title"): err(f"{w}: empty title")
    if not ISO.match(str(c.get("date", ""))): err(f"{w}: date")
    src = c.get("source")
    if src is not None and (set(src) != {"name", "url"} or EXCLUDED.search(src.get("url") or "")): err(f"{w}: source {src}")
    if set(c.get("tags") or {}) != {"companies", "regulators", "topics"}: err(f"{w}: tags")
    if "<!--" in (c.get("title") or "") + (c.get("summary") or "") + (c.get("impact") or ""): err(f"{w}: comment leaked")
    t = c.get("impact") or ""
    if SOLICIT.search(t) or re.search(r"\b(we|our|you|your)\b", t, re.I): err(f"{w}: impact wording")
    if "reg" in c:
        r = c["reg"]
        if set(r) != REG_KEYS: err(f"{w}: reg keys {sorted(r)}")
        if r.get("status") not in (None, "new", "draft", "in-force", "deadline"): err(f"{w}: reg status")
        for k in ("issued", "effective"):
            if r.get(k) is not None and not ISO.match(str(r[k])): err(f"{w}: reg {k}")
        if r.get("applies_to") is not None and not isinstance(r["applies_to"], list): err(f"{w}: applies_to")

def check_ncd(n, where):
    if n is None: return
    if set(n) != NCD_KEYS: err(f"{where}: mfl_ncd keys {sorted(n)}")
    if n.get("status") not in ("open", "closed", "upcoming", None): err(f"{where}: mfl_ncd status")
    for b in n.get("bids") or []:
        if set(b) != {"date", "times_subscribed"} or not ISO.match(str(b.get("date"))): err(f"{where}: mfl_ncd bid {b}")
        if b.get("times_subscribed") is not None and not isinstance(b["times_subscribed"], (int, float)): err(f"{where}: bid value")
    if n.get("source") is not None and set(n["source"]) != {"name", "url"}: err(f"{where}: mfl_ncd source")
    if "muthoot finance" in json.dumps(n).lower(): err(f"{where}: mfl_ncd mentions Muthoot Finance")

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
    if "cards" not in d: err(f"{where}: missing cards")
    ids = [c.get("id") for c in d.get("cards") or []]
    if len(ids) != len(set(ids)): err(f"{where}: duplicate card ids")
    for c in d.get("cards") or []: check_card(c, where)
    if "mfl_ncd" not in d: err(f"{where}: missing mfl_ncd")
    check_ncd(d.get("mfl_ncd"), where)
    no_private(d, where)

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
no_private(j, "latest.json")
check_ncd(j.get("mfl_ncd"), "latest.json")
lc = j.get("latest_circulars")
if not isinstance(lc, list): err("latest.json: latest_circulars missing")
else:
    for c in lc:
        check_card(c, "latest_circulars")
        r = c.get("reg") or {}
        if not r: err(f"latest_circulars {c.get('id')}: no reg")
        elif not (r.get("ref_no") or r.get("url")): err(f"latest_circulars {c.get('id')}: no ref_no or url")
    order = [(c.get("reg") or {}).get("issued") or c.get("date") for c in lc]
    if order != sorted(order, reverse=True): err("latest_circulars: not newest first")
dl = j.get("deadlines")
if not isinstance(dl, list): err("latest.json: deadlines missing")
else:
    for x in dl:
        if set(x) != {"date", "title", "regulator", "ref_no", "url", "status"}: err(f"deadline keys {sorted(x)}")
        if not ISO.match(str(x.get("date"))) or not x.get("title"): err(f"deadline row {x}")
        if EXCLUDED.search(x.get("url") or ""): err(f"deadline url {x.get('url')}")
sp = D / "circulars_seed.json"
if sp.exists():
    sd = json.loads(sp.read_text(encoding="utf-8"))
    no_private(sd, "circulars_seed.json")
    for s in sd.get("circulars", []):
        if not (s.get("url") and s.get("ref_no") and ISO.match(str(s.get("issued", "")))): err(f"seed entry incomplete {s.get('ref_no')}")
        if not re.match(r"^https://(www\.)?(rbi\.org\.in|sebi\.gov\.in|ibbi\.gov\.in|nhb\.org\.in|fiuindia\.gov\.in)/", s.get("url") or ""):
            err(f"seed url not official {s.get('url')}")
for k, ser in (j.get("series") or {}).items():
    for day, v in ser.items():
        if v is not None and not isinstance(v, (int, float)): err(f"series {k} {day}")
hp = D / "history.json"
if hp.exists():
    h = json.loads(hp.read_text(encoding="utf-8"))
    if not isinstance(h, dict): err("history.json: not an object")
    else:
        for k, ser in h.items():
            if k.startswith("_"): continue
            if not isinstance(ser, dict): err(f"history.json {k}: not an object"); continue
            for day, v in ser.items():
                if not ISO.match(day): err(f"history.json {k}: bad date {day}")
                if v is not None and (isinstance(v, bool) or not isinstance(v, (int, float))): err(f"history.json {k} {day}: not a number")
print(f"{len(ids)} day(s) checked, {len(errs)} problem(s)")
for e in errs[:50]: print(" -", e)
sys.exit(1 if errs else 0)
