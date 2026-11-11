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
REG_NEW = {"lifecycle", "comments_due", "first_covered", "story_id", "deadline", "deadline_near", "superseded_by"}  # content upgrade
STORY_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
NCD_KEYS = {"issue", "open", "close", "size_cr", "rating", "coupon_range", "bids", "status", "source"}
EXCLUDED = re.compile(r"exa\.ai|stockfin|trackliveprice|makro\.live|stockwatch\.live", re.I)
PRIVATE_KEYS = {"lessons", "lesson", "quiz", "teaching"}
INDEX_URL = re.compile(r"^https?://(www\.)?rbi\.org\.in/Scripts/(NotificationUser|BS_CircularIndexDisplay|BS_PressReleaseDisplay|BS_ViewMasDirections)\.aspx$", re.I)
AS_OF_DISPLAY = re.compile(r"^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec), \d{2}:\d{2} [A-Z]{2,4}$")

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
    for s_ in c.get("sources") or []:
        if s_.get("tier") not in (1, 2, 3) or not str(s_.get("url", "")).startswith("http") or EXCLUDED.search(s_.get("url") or ""): err(f"{w}: sources entry {s_}")
    if c.get("sources") and src and src.get("url") != c["sources"][0].get("url"): err(f"{w}: source != sources[0]")
    if len(c.get("sources") or []) > 6: err(f"{w}: more than 6 sources")
    if c.get("impact") and c.get("impact_label") not in (None, "Possible impact on Muthoot Fincorp"): err(f"{w}: impact_label")
    if "story_id" in c:
        if not (isinstance(c["story_id"], str) and STORY_ID.match(c["story_id"]) and len(c["story_id"]) <= 60): err(f"{w}: story_id {c['story_id']!r}")
        if not isinstance(c.get("thread_seq"), int) or c["thread_seq"] < 1: err(f"{w}: thread_seq")
    if "reg" in c:
        r = c["reg"]
        if not (REG_KEYS <= set(r) <= REG_KEYS | REG_NEW): err(f"{w}: reg keys {sorted(r)}")
        if r.get("lifecycle") not in (None, "draft", "final", "effective", "superseded", "withdrawn"): err(f"{w}: lifecycle {r.get('lifecycle')}")
        dl_ = r.get("deadline")
        if dl_ is not None and (not ISO.match(str(dl_.get("date"))) or dl_.get("kind") not in ("comments", "effective", "compliance", "other")): err(f"{w}: reg.deadline {dl_}")
        fc = r.get("first_covered")
        if fc is not None and set(fc) != {"date", "card_id", "report", "title"}: err(f"{w}: first_covered {fc}")
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
        if not ({"date", "title", "regulator", "ref_no", "url", "status", "date_text"} <= set(x) <= {"date", "title", "regulator", "ref_no", "url", "status", "date_text", "story_id", "kind"}): err(f"deadline keys {sorted(x)}")
        if x.get("kind") not in (None, "comments", "effective", "compliance", "other"): err(f"deadline kind {x.get('kind')}")
        if not ISO.match(str(x.get("date"))) or not x.get("title"): err(f"deadline row {x}")
        if x.get("date_text") is not None and not isinstance(x["date_text"], str): err(f"deadline date_text {x}")
        if INDEX_URL.match(x.get("url") or ""): err(f"deadline links an index page, not the circular: {x.get('url')}")
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
# gold.spot.as_of_display: present whenever the raw as_of is, formatted like '2 Nov, 18:49 GMT'
for i in ids:
    p = D / f"{i}.json"
    if not p.exists(): continue
    sp_ = ((json.loads(p.read_text(encoding="utf-8")).get("gold") or {}).get("spot") or {})
    if sp_:
        if "as_of_display" not in sp_: err(f"{i}: gold.spot.as_of_display missing")
        elif sp_.get("as_of_display") is not None and not AS_OF_DISPLAY.match(sp_["as_of_display"]): err(f"{i}: as_of_display {sp_['as_of_display']!r}")

# exporter rules (unit checks against export_json.py in the repo root)
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import export_json as X
    tg = lambda **k: {"companies": k.get("c", []), "topics": k.get("t", []), "regulators": k.get("r", [])}
    for title, tags, want in (
        ("Oil fell 7.6% on Iran-deal hopes, and the rupee closed flat", tg(t=["markets"], r=["rbi"]), "markets"),
        ("FII outflows top ₹23,000 crore in September; RBI under 'tightening pressure'", tg(t=["markets"], r=["rbi"]), "markets"),
        ("RBI issues gold loan Directions", tg(t=["circular", "gold-loan"], r=["rbi"]), "regulation"),
        ("MFIN asks RBI to revise the household income cap (inflation)", tg(t=["macro"], r=["rbi"]), "regulation"),
    ):
        got = X._cat_from_tags(tags, title)
        if got != want: err(f"category rule: {title!r} -> {got}, want {want}")
    if X._range_end("2–4 Dec 2026", "2026-11-04") != "2026-12-04": err("date range 2–4 Dec 2026 must end 2026-12-04")
    if X._range_end("28 Nov–2 Dec 2026", "2026-11-04") != "2026-12-02": err("cross-month date range")
    if X._range_end("4 Dec 2026", "2026-11-04") is not None: err("single date is not a range")
    if X.as_of_display("2026-11-02 1849 GMT (2026-11-03 00:19 IST)") != "2 Nov, 18:49 GMT": err("as_of_display format")
    if X.as_of_display(None) is not None: err("as_of_display(None)")
except ImportError as e:
    err(f"export_json import failed: {e}")
mpc = [x for x in (dl or []) if x.get("date_text")]
for x in mpc:
    if not re.search(r"\d", x["date_text"]): err(f"date_text {x['date_text']!r}")


# ---- content upgrade (docs/DATA_FORMAT.md "Peer intelligence"; content_upgrade.py) ----
LEAK_KEYS = {"impact_deep", "blind_spots", "lessons"}
LEAK_TEXT = re.compile(r"MFL view|Blind spots|Deeper impact", re.I)
VOICE = re.compile(r"\b(we|our|us|you|your|sai|achu|subscribe|attractive|invest now|apply|buy|should)\b", re.I)
PEER_SLUGS = {"muthoot-finance", "manappuram", "iifl-finance", "shriram-finance", "bajaj-finance"}
METRIC_KEYS = {"aum", "gold_aum", "disbursements", "yield", "cof", "nim", "spread", "opex_ratio", "credit_cost", "gnpa",
               "nnpa", "pcr", "crar", "roa", "roe", "pat", "branches", "gold_tonnes", "avg_ticket"}
EVENT_TYPES = {"results", "investor-deck", "call-transcript", "call-recording", "rating-rationale", "annual-report"}
CMP_KEYS = {"key", "label", "unit", "peer_value", "peer_period", "mfl_value", "mfl_period", "same_basis", "source"}

def no_leak(o, where):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in LEAK_KEYS: err(f"{where}: private key {k} in public data")
            no_leak(v, where)
    elif isinstance(o, list):
        for v in o: no_leak(v, where)
    elif isinstance(o, str) and LEAK_TEXT.search(o): err(f"{where}: private text {o[:60]!r}")

def check_peer(e, where):
    w = f"{where} {e.get('id')}"
    if e.get("company") not in PEER_SLUGS: err(f"{w}: company {e.get('company')} is not a peer")
    if e.get("basis") not in ("consolidated", "standalone"): err(f"{w}: basis")
    evs = e.get("events") or []
    if not evs or not any((x.get("source") or {}).get("tier") == 1 for x in evs): err(f"{w}: needs a Tier-1 filing event")
    for x in evs:
        if x.get("type") not in EVENT_TYPES or not ISO.match(str(x.get("date"))): err(f"{w}: event {x}")
    for m in e.get("metrics") or []:
        if m.get("key") not in METRIC_KEYS: err(f"{w}: metric {m.get('key')}")
        if m.get("value") is not None and not (m.get("source") or {}).get("url"): err(f"{w}: {m.get('key')} value without source")
        if m.get("disclosed") is False and m.get("value") is not None: err(f"{w}: undisclosed metric with value")
    for q in e.get("quotes") or []:
        if len((q.get("text") or "").split()) > 25 or not q.get("speaker") or not (q.get("source") or {}).get("url"): err(f"{w}: quote {q}")
    for r in e.get("mfl_compare") or []:
        if not CMP_KEYS <= set(r): err(f"{w}: mfl_compare keys {sorted(r)}")
        if r.get("mfl_value") is not None and not r.get("source"): err(f"{w}: mfl_value without source")
        if VOICE.search(r.get("note") or ""): err(f"{w}: mfl_compare note wording")
    for t in [e.get("impact") or ""] + [g.get("text", "") for g in e.get("guidance") or []] + [n.get("text", "") for n in e.get("non_disclosures") or []]:
        if VOICE.search(t) or SOLICIT.search(t): err(f"{w}: wording {t[:60]!r}")
    if e.get("impact") and e.get("impact_label") != "Possible impact on Muthoot Fincorp": err(f"{w}: impact_label")
    for k, v in e.items():
        if v == "": err(f"{w}: empty string for {k} (omit absent keys)")

for p in sorted(D.glob("*.json")):
    try:
        no_leak(json.loads(p.read_text(encoding="utf-8")), p.name)
    except ValueError:
        err(f"{p.name}: not JSON")
for sub in sorted((D / "stories").glob("*.json")) if (D / "stories").exists() else []:
    no_leak(json.loads(sub.read_text(encoding="utf-8")), f"stories/{sub.name}")
pi = D / "peer_intel.json"
if pi.exists():
    pj = json.loads(pi.read_text(encoding="utf-8"))
    if pj.get("generated") != j.get("generated"): err("peer_intel.json: generated differs from latest.json")
    for e in (pj.get("entries") or {}).values(): check_peer(e, "peer_intel.json")
    for e in j.get("peer_intel") or []:
        check_peer(e, "latest.json peer_intel")
        if e.get("id") not in (pj.get("entries") or {}): err(f"latest peer_intel {e.get('id')} missing from peer_intel.json")
try:
    import content_upgrade as CU
    _e = {"id": "pi-t", "company": "iifl-finance", "period": "Q2 FY27",
          "events": [{"type": "results", "date": "2026-10-15", "source": {"url": "https://nsearchives.nseindia.com/x.pdf"}}],
          "blind_spots": [{"text": "x", "basis": "y"}], "impact_deep": "x"}
    _pub = CU.norm_peer(_e, False, [])
    if not _pub or "blind_spots" in _pub or "impact_deep" in _pub: err("content_upgrade: public peer entry keeps private keys")
    if CU.norm_peer(dict(_e, company="muthoot-fincorp"), False, []) is not None: err("content_upgrade: MFL accepted as a peer")
    if CU.norm_peer(dict(_e, company="muthoot-microfin"), False, []) is not None: err("content_upgrade: Muthoot Microfin accepted as a peer")
except ImportError as e:
    err(f"content_upgrade import failed: {e}")


# reg regression (bugs found 11 Nov 2026): a "D Mon YYYY: <REG> <ref>: ..." row carries its own ref, never a neighbour's,
# and an issue date is never after the edition. Full checks: python3 -m unittest tests.test_regfix
ROW = re.compile(r"^\d{1,2} [A-Z][a-z]{2} \d{4}: (RBI|SEBI|IBBI|NHB)\b")
def reg_rows(cards, where):
    for c in cards or []:
        r = c.get("reg") or {}
        if not r: continue
        if r.get("issued") and c.get("date") and r["issued"] > c["date"] and not c["id"].startswith("seed-"):
            err(f"{where} {c['id']}: issued {r['issued']} after edition {c['date']}")
        m = ROW.match(c.get("title") or "")
        if m and r.get("regulator") and r["regulator"] != m.group(1): err(f"{where} {c['id']}: regulator {r['regulator']} on a {m.group(1)} row")
        if m and r.get("ref_no") and r["ref_no"].startswith("HO/") and r["ref_no"] not in c["title"]: err(f"{where} {c['id']}: neighbour ref {r['ref_no']}")
for i in ids:
    p_ = D / f"{i}.json"
    if p_.exists(): reg_rows(json.loads(p_.read_text(encoding="utf-8")).get("cards"), i)
reg_rows(j.get("latest_circulars"), "latest_circulars")


# story threads (docs/DATA_FORMAT.md "Story threads")
stp = D / "stories.json"
if stp.exists():
    sj = json.loads(stp.read_text(encoding="utf-8"))
    if sj.get("generated") != j.get("generated"): err("stories.json: generated differs from latest.json")
    for sid, st in (sj.get("stories") or {}).items():
        if not STORY_ID.match(sid) or len(sid) > 60: err(f"stories.json: bad id {sid}")
        if st.get("status") not in ("open", "dormant", "closed"): err(f"stories.json {sid}: status")
        if (st.get("opened") or "") < "2026-10-01": err(f"stories.json {sid}: opened before 1 Oct")
        ds = [u.get("date") for u in st.get("updates") or []]
        if ds != sorted(ds): err(f"stories.json {sid}: updates not oldest first")
        for x in st.get("continues") or []:
            if x not in sj["stories"] and x not in (sj.get("aliases") or {}) and x not in (sj.get("archived") or {}): err(f"stories.json {sid}: continues unknown {x}")
    si = j.get("story_index") or {}
    if si.get("generated") != j.get("generated") or si.get("file") != "data/stories.json": err("story_index pointer")
    cs = j.get("continuing_stories") or []
    if len(cs) > 8: err("continuing_stories: more than 8")
    for r in cs:
        if r.get("story_id") in ("gold-price-weekly", "markets-daily-close", "mfl-gold-ltv"): err("continuing_stories: evergreen thread")
        if r.get("story_id") not in (si.get("refs") or {}): err(f"story_index.refs missing {r.get('story_id')}")
        if (r.get("latest") or {}).get("kind") not in ("update", "status"): err(f"continuing {r.get('story_id')}: latest.kind")
        t = ((r.get("latest") or {}).get("summary") or "")
        if SOLICIT.search(t): err(f"continuing {r.get('story_id')}: wording")
    lu = [r.get("last_update") for r in cs]
    if lu != sorted(lu, reverse=True): err("continuing_stories: not newest first")
    for c in (j.get("today") or {}).get("cards") or []:
        if c.get("story_id") and c["story_id"] not in (si.get("refs") or {}): err(f"story_index.refs missing card id {c['story_id']}")
elif (j.get("story_index")): err("story_index without data/stories.json")


# week_review (Monday weekly; plan section 1.6, review point 9)
wr = j.get("week_review")
if wr is not None:
    if set(wr) != {"id", "published", "week_start", "week_end", "report_card_prefix", "story_ids", "sections", "week_threads"}: err(f"week_review keys {sorted(wr)}")
    if wr.get("id") != wr.get("week_start") or not ISO.match(str(wr.get("published"))): err("week_review id/published")
    for sid in wr.get("story_ids") or []:
        if sid not in ((j.get("story_index") or {}).get("refs") or {}): err(f"week_review: story_index.refs missing {sid}")
    for sec in wr.get("sections") or []:
        if not str(sec.get("card_id", "")).startswith(wr.get("report_card_prefix", "?")): err(f"week_review section {sec.get('card_id')}")
        if SOLICIT.search(sec.get("title") or ""): err("week_review section wording")


# Site Builder follow-up (11 Nov 2026)
if (D / "peer_intel_private.json").exists(): err("data/peer_intel_private.json must never exist in the public repo")
LABEL = "Possible impact on Muthoot Fincorp"
FLAT = re.compile(r"^(field|metric|item|#)\s+(value|number|figure|status|item)\b", re.I)
pi_path = D / "peer_intel.json"
if pi_path.exists():
    pj = json.loads(pi_path.read_text(encoding="utf-8"))
    if j.get("peer_intel_index") != {"file": "data/peer_intel.json", "generated": j.get("generated"), "count": len(pj.get("entries") or {})}:
        err(f"peer_intel_index {j.get('peer_intel_index')}")
    if pj.get("generated") != j.get("generated"): err("peer_intel.json: generated differs from latest.json")
    for e in (pj.get("entries") or {}).values():
        for r in e.get("mfl_compare") or []:
            if r.get("peer_value") is None or not r.get("peer_period") or not (r.get("peer_source") or {}).get("url"):
                err(f"{e.get('id')}: mfl_compare {r.get('key')} lacks peer_value/peer_period/peer_source")
for f in sorted(D.glob("2026-*.json")) + [D / "latest.json"]:
    jj = json.loads(f.read_text(encoding="utf-8"))
    cs = (jj.get("cards") or ((jj.get("today") or {}).get("cards")) or []) + (jj.get("latest_circulars") or [])
    for c in cs:
        w = f"{f.name} {c.get('id')}"
        sm = c.get("summary") or ""
        if FLAT.match(sm) or re.search(r"\|\s|-{3}", sm): err(f"{w}: flattened table summary")
        nm = [x.get("name") for x in c.get("sources") or []]
        if len(nm) != len(set(nm)): err(f"{w}: duplicate source names {nm}")
        if (c.get("impact") or c.get("kind") == "circular") and c.get("impact_label") != LABEL: err(f"{w}: impact_label")
for r in j.get("continuing_stories") or []:
    lt = r.get("latest") or {}
    if not lt.get("card_id"): err(f"continuing {r.get('story_id')}: latest.card_id")
    if re.search(r"\bstatus\s*$", lt.get("title") or "", re.I) and lt.get("kind") != "status": err(f"continuing {r.get('story_id')}: status card not kind status")
WINDOW = re.compile(r"\b\d{1,3}[- ]day (?:window|period) from|\b\d{1,2}(?:\s+[A-Za-z]{3,9})?\s*[–—-]\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)", re.I)
for x in j.get("deadlines") or []:
    if WINDOW.search(x.get("title") or "") and not x.get("date_text"): err(f"deadline {x.get('date')}: range without date_text")

print(f"{len(ids)} day(s) checked, {len(errs)} problem(s)")
for e in errs[:50]: print(" -", e)
sys.exit(1 if errs else 0)
