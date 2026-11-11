"""Content upgrade (docs/DATA_FORMAT.md "Peer intelligence", "Story threads", "sources[]", "Regulation lifecycle",
"Week review"). Additive to export_json.py; the same file ships in nbfc-guru (private) and nbfc-brief (public).

export_json.export() calls apply(X, days, extras, data_dir, private, generated) after cards_export(), where X is the
export_json module itself (its link/date/plain-text helpers are reused, so both editions parse the same way).
Every block is wrapped "never fatal": on an exception it logs to stderr and the rest of the export still ships.

Rules kept here:
  * a figure is only ever copied from a filing (seed entry or the edition's own Peer Intelligence table); nothing is
    computed unless both values are on the same basis, and then `computed: true` is set;
  * Muthoot Fincorp (MFL) is never a peer; Muthoot Microfin (group company) gets no peer_intel entries;
  * the public edition never carries impact_deep, blind_spots or lessons;
  * absent optional keys are omitted, never written as "".
"""
import datetime as _dt
import json
import re
import sys
from pathlib import Path

IMPACT_LABEL = "Possible impact on Muthoot Fincorp"
PEERS = {  # Sai, 11 Nov 2026: keep the current 5 (hubs.js PEERORD)
    "muthoot-finance": "Muthoot Finance", "manappuram": "Manappuram Finance", "iifl-finance": "IIFL Finance",
    "shriram-finance": "Shriram Finance", "bajaj-finance": "Bajaj Finance",
}
NOT_PEERS = {"muthoot-fincorp", "mfl", "muthoot-microfin"}
METRIC_KEYS = ("aum", "gold_aum", "disbursements", "yield", "cof", "nim", "spread", "opex_ratio", "credit_cost",
               "gnpa", "nnpa", "pcr", "crar", "roa", "roe", "pat", "branches", "gold_tonnes", "avg_ticket")
METRIC_LABELS = {"aum": "AUM", "gold_aum": "Gold loan AUM", "disbursements": "Disbursements", "yield": "Yield",
                 "cof": "Cost of funds", "nim": "NIM", "spread": "Spread", "opex_ratio": "Opex ratio",
                 "credit_cost": "Credit cost", "gnpa": "GNPA", "nnpa": "NNPA", "pcr": "PCR", "crar": "CRAR",
                 "roa": "ROA", "roe": "ROE", "pat": "PAT", "branches": "Branches", "gold_tonnes": "Gold held",
                 "avg_ticket": "Average ticket size"}
EVENT_TYPES = ("results", "investor-deck", "call-transcript", "call-recording", "rating-rationale", "annual-report")
BASES = ("consolidated", "standalone")
PEER_PRIVATE_KEYS = ("blind_spots", "impact_deep")
PRIVATE_KEYS = ("impact_deep", "blind_spots", "lessons")
PEER_LATEST_DAYS = 21
PEER_SEED = "peer_intel_seed.json"
PEER_FILE = "peer_intel.json"
QUOTE_MAX_WORDS = 25
QUOTES_MAX = 3
# public voice: third person, no advice, no solicitation (DUAL-EDITION.md + plan §7)
VOICE_BAD = re.compile(r"\b(?:we|our|us|you|your|sai|achu|subscribe|attractive|invest now|apply|buy|should)\b", re.I)

TIER1_HOSTS = ("rbi.org.in", "sebi.gov.in", "ibbi.gov.in", "nhb.org.in", "fiuindia.gov.in", "mca.gov.in", "pib.gov.in",
               "finmin.gov.in", "finmin.nic.in", "dea.gov.in", "financialservices.gov.in", "nseindia.com", "bseindia.com",
               "crisil.com", "crisilratings.com", "icra.in", "icra.co.in", "careratings.com", "careedge.in",
               "indiaratings.co.in", "brickworkratings.com", "acuite.in", "infomerics.com", "fbil.org.in", "ccilindia.com",
               "fimmda.org", "ibjarates.com", "gold.org", "agloc.org", "muthootfincorp.com", "muthootfinance.com",
               "manappuram.com", "iifl.com", "iiflfinance.com", "nbfciiflprodstg.blob.core.windows.net",
               "shriramfinance.in", "bajajfinserv.in", "bajajfinance.in", "aboutbajajfinserv.com", "muthootmicrofin.com")
TIER2_HOSTS = ("thehindubusinessline.com", "thehindu.com", "economictimes.indiatimes.com", "indiatimes.com",
               "livemint.com", "business-standard.com", "moneycontrol.com", "cnbctv18.com", "financialexpress.com",
               "ndtvprofit.com", "bqprime.com", "reuters.com", "bloomberg.com", "businesstoday.in", "hindustantimes.com",
               "chittorgarh.com")
BANNED_HOSTS = ("exa.ai", "stockfin.ai", "trackliveprice.com", "makro.live", "stockwatch.live", "hdfcsky.com",
                "alphastreet.com")


def _log(msg):
    print(f"content_upgrade: {msg}", file=sys.stderr)


def _host(url):
    m = re.match(r"^https?://([^/:?#]+)", (url or "").strip(), re.I)
    h = (m.group(1).lower() if m else "")
    return h[4:] if h.startswith("www.") else h


def _on(h, doms):
    return any(h == d or h.endswith("." + d) for d in doms)


def banned(url):
    return _on(_host(url), BANNED_HOSTS)


def tier(url):
    """1 official / exchange / rating agency / company IR, 2 trusted press, 3 any other host."""
    h = _host(url)
    if _on(h, TIER1_HOSTS):
        return 1
    if _on(h, TIER2_HOSTS):
        return 2
    return 3


def src_obj(s, name_fn=None):
    """Normalise a {name,url[,page,role]} source; adds tier. None when there is no usable url."""
    if isinstance(s, str):
        s = {"url": s}
    if not isinstance(s, dict) or not str(s.get("url") or "").startswith("http") or banned(s["url"]):
        return None
    out = {"name": s.get("name") or (name_fn(s["url"]) if name_fn else _host(s["url"])), "url": s["url"],
           "tier": tier(s["url"])}
    if s.get("page") not in (None, ""):
        out["page"] = s["page"]
    if s.get("role") in ("primary", "data", "context", "analysis"):
        out["role"] = s["role"]
    if s.get("fallback") is True:
        out["fallback"] = True
    return out


def _num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return v if v == v and abs(v) != float("inf") else None
    t = re.sub(r"[₹,%\s]|cr\b|crore|mt\b|tonnes?|lakh", "", str(v), flags=re.I)
    try:
        return float(t)
    except ValueError:
        return None


def voice_ok(text):
    return not VOICE_BAD.search(text or "")


def _period_rank(p):
    m = re.match(r"^Q([1-4])\s*FY(\d{2})$", (p or "").strip(), re.I)
    return (int(m.group(2)), int(m.group(1))) if m else (0, 0)


# ---------------------------------------------------------------------------------------------- peer intelligence
def norm_metric(m, problems, where):
    if not isinstance(m, dict) or m.get("key") not in METRIC_KEYS:
        problems.append(f"{where}: unknown metric {m.get('key') if isinstance(m, dict) else m!r}")
        return None
    disclosed = m.get("disclosed", True) is not False
    val = _num(m.get("value")) if disclosed else None
    src = src_obj(m.get("source"))
    if disclosed and val is not None and not src:
        problems.append(f"{where}: metric {m['key']} has a value but no source; dropped")
        return None
    out = {"key": m["key"], "label": m.get("label") or METRIC_LABELS[m["key"]], "unit": m.get("unit") or "",
           "value": val, "prev_value": _num(m.get("prev_value")), "prev_period": m.get("prev_period"),
           "qoq_pct": _num(m.get("qoq_pct")), "yoy_pct": _num(m.get("yoy_pct")), "computed": False,
           "disclosed": disclosed}
    # QoQ is computed only for amounts (never for ratios) and only when the company gave both on the same basis
    if (out["qoq_pct"] is None and val is not None and out["prev_value"] and out["unit"] != "%"
            and m.get("prev_same_basis", True) and m.get("prev_kind", "qoq") == "qoq"):
        out["qoq_pct"] = round((val / out["prev_value"] - 1) * 100, 1)
        out["computed"] = True
    if m.get("computed") is True:
        out["computed"] = True
    for k in ("note", "last_disclosed_period"):
        if m.get(k):
            out[k] = m[k]
    if src:
        out["source"] = {k: src[k] for k in ("name", "url", "page") if k in src}
    return {k: v for k, v in out.items() if not (k == "prev_period" and v is None)}


def norm_compare(r, metrics, period, problems, where, private):
    if not isinstance(r, dict) or r.get("key") not in METRIC_KEYS:
        return None
    pm = next((m for m in metrics if m["key"] == r["key"]), None)
    mv = _num(r.get("mfl_value"))
    src = src_obj(r.get("source"))
    if mv is not None and not src:
        problems.append(f"{where}: mfl_compare {r['key']} has an MFL value but no source; value removed")
        mv = None
    note = r.get("note") or ("" if mv is not None else f"Not yet published for {r.get('mfl_period') or period}")
    if note and not voice_ok(note):
        problems.append(f"{where}: mfl_compare note wording {note!r}; dropped")
        note = ""
    out = {"key": r["key"], "label": r.get("label") or (pm or {}).get("label") or METRIC_LABELS[r["key"]],
           "unit": r.get("unit") or (pm or {}).get("unit") or "",
           "peer_value": pm.get("value") if pm else _num(r.get("peer_value")),
           "peer_period": r.get("peer_period") or period, "mfl_value": mv,
           "mfl_period": r.get("mfl_period") or period, "same_basis": bool(r.get("same_basis")) and mv is not None,
           "source": ({k: src[k] for k in ("name", "url", "page") if k in src} if (src and mv is not None) else None)}
    if note:
        out["note"] = note
    return out


def norm_peer(e, private, problems):
    """Validated copy of one PeerIntel entry, or None. Public copies never carry blind_spots / impact_deep."""
    where = f"peer_intel {e.get('id') if isinstance(e, dict) else e!r}"
    if not isinstance(e, dict) or not e.get("id") or not e.get("period"):
        problems.append(f"{where}: needs id and period")
        return None
    co = (e.get("company") or "").strip().lower()
    if co in NOT_PEERS or co not in PEERS:
        problems.append(f"{where}: company {co!r} is not one of the 5 peers (MFL and Muthoot Microfin never are)")
        return None
    out = {"id": e["id"], "story_id": e.get("story_id") or f"{co}-{re.sub(r'[^a-z0-9]', '', e['period'].lower())}-results",
           "company": co, "company_name": PEERS[co], "period": e["period"],
           "basis": e.get("basis") if e.get("basis") in BASES else "consolidated"}
    evs = []
    for ev in e.get("events") or []:
        s = src_obj((ev or {}).get("source"))
        if ev.get("type") in EVENT_TYPES and re.match(r"^\d{4}-\d{2}-\d{2}$", str(ev.get("date"))) and s:
            evs.append({"type": ev["type"], "date": ev["date"], "source": s})
        else:
            problems.append(f"{where}: bad event {ev!r}")
    if not evs:
        problems.append(f"{where}: no filing event with an official source; entry dropped")
        return None
    if not any(x["source"]["tier"] == 1 for x in evs):
        problems.append(f"{where}: no Tier-1 filing among events; entry dropped (press alone never triggers)")
        return None
    out["events"] = sorted(evs, key=lambda x: (x["date"], EVENT_TYPES.index(x["type"])))
    out["metrics"] = [m for m in (norm_metric(m, problems, where) for m in e.get("metrics") or []) if m]
    out["guidance"] = [{"text": g["text"], "source": src_obj(g.get("source"))} for g in e.get("guidance") or []
                       if isinstance(g, dict) and g.get("text") and src_obj(g.get("source"))]
    qs = []
    for q in e.get("quotes") or []:
        s = src_obj((q or {}).get("source"))
        if not (q.get("text") and q.get("speaker") and q.get("role") and s):
            problems.append(f"{where}: quote needs text, speaker, role and a source url")
            continue
        if len(q["text"].split()) > QUOTE_MAX_WORDS:
            problems.append(f"{where}: quote over {QUOTE_MAX_WORDS} words")
            continue
        qs.append({"text": q["text"], "speaker": q["speaker"], "role": q["role"], "source": s})
    out["quotes"] = qs[:QUOTES_MAX]
    out["non_disclosures"] = [{"key": n["key"], "text": n["text"]} for n in e.get("non_disclosures") or []
                              if isinstance(n, dict) and n.get("key") and n.get("text")]
    out["mfl_compare"] = [r for r in (norm_compare(r, out["metrics"], e["period"], problems, where, private)
                                      for r in e.get("mfl_compare") or []) if r]
    if e.get("impact"):
        out["impact"] = e["impact"]
        out["impact_label"] = IMPACT_LABEL
    if e.get("card_ids"):
        out["card_ids"] = list(e["card_ids"])
    if private:
        if e.get("blind_spots"):
            out["blind_spots"] = [b for b in e["blind_spots"] if isinstance(b, dict) and b.get("text") and b.get("basis")]
        if e.get("impact_deep"):
            out["impact_deep"] = e["impact_deep"]
    else:
        for t in [out.get("impact") or ""] + [g["text"] for g in out["guidance"]] + [n["text"] for n in out["non_disclosures"]]:
            if t and not voice_ok(t):
                problems.append(f"{where}: public wording {t[:60]!r}")
    for k in ("guidance", "quotes", "non_disclosures", "mfl_compare"):
        if not out[k]:
            out.pop(k)
    out["updated"] = e.get("updated") or out["events"][-1]["date"]
    return out


_PEER_ROW_KEYS = (  # table label -> metric key (plan §8 Peer Intelligence block)
    (r"^gold\s*(?:loan)?\s*aum", "gold_aum"), (r"^(?:total\s+|loan\s+)?aum", "aum"), (r"^disburse", "disbursements"),
    (r"^(?:portfolio\s+)?yield", "yield"), (r"^(?:cost of (?:funds|borrowing)|cof)", "cof"), (r"^nim|net interest margin", "nim"),
    (r"^spread", "spread"), (r"^opex", "opex_ratio"), (r"^credit cost", "credit_cost"), (r"^(?:gnpa|gross (?:npa|stage))", "gnpa"),
    (r"^(?:nnpa|net (?:npa|stage))", "nnpa"), (r"^pcr|provision coverage", "pcr"), (r"^(?:crar|capital adequacy)", "crar"),
    (r"^roa", "roa"), (r"^roe", "roe"), (r"^(?:pat|profit after tax|net profit)", "pat"), (r"^branch", "branches"),
    (r"^gold\s*(?:held|tonn|holding)", "gold_tonnes"), (r"^(?:avg|average)\.?\s*ticket", "avg_ticket"),
)


def _row_key(label):
    l = (label or "").strip().lower()
    for pat, key in _PEER_ROW_KEYS:
        if re.search(pat, l):
            return key
    return None


def _cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_peer_unit(X, lines, ov, edition):
    """A '### <Peer> Q2 FY27 results' unit with a <!-- peer: ... --> comment -> raw PeerIntel dict (before norm_peer)."""
    e = {"id": ov.get("id"), "company": ov.get("company"), "period": ov.get("period"), "basis": ov.get("basis"),
         "story_id": ov.get("story"), "metrics": [], "guidance": [], "quotes": [], "non_disclosures": [],
         "mfl_compare": [], "blind_spots": [], "events": []}
    for t in ("results", "investor-deck", "call-transcript", "call-recording", "rating-rationale", "annual-report"):
        v = ov.get(t.replace("-", "_"))
        if v:  # results=2026-11-12:https://...
            m = re.match(r"^(\d{4}-\d{2}-\d{2})\s*:\s*(https?://\S+)$", v)
            if m:
                e["events"].append({"type": t, "date": m.group(1), "source": {"url": m.group(2), "name": X.source_name(m.group(2))}})
    table, cols = None, []
    for raw in lines:
        s = raw.strip()
        low = s.lower()
        if s.startswith("|"):
            cells = _cells(s)
            if re.match(r"^\|?\s*:?-{2,}", s):
                continue
            if cells and cells[0].lower() in ("metric", "item"):
                cols = [c.lower() for c in cells]
                table = "mfl" if any("mfl" in c for c in cols) else "peer"
                continue
            if not cols:
                continue
            row = dict(zip(cols, cells))
            key = _row_key(re.sub(r"\(.*?\)", "", cells[0]))
            if not key:
                continue
            unit = (re.search(r"\(([^)]*)\)", cells[0]) or [None, ""])[1]
            links = X._links(s)
            src = {"url": links[-1][1], "name": X.source_name(links[-1][1], links[-1][0])} if links else None
            if src:
                pm = re.search(r"\bp(?:age|\.)\s*(\d+)", links[-1][0] or "", re.I)
                if pm:
                    src["page"] = int(pm.group(1))
            if table == "mfl":
                mcol = next((c for c in cols if c.startswith("mfl") and "period" not in c), None)
                pcol = next((c for c in cols if "period" in c), None)
                e["mfl_compare"].append({"key": key, "mfl_value": _num(row.get(mcol)) if mcol else None,
                                         "mfl_period": row.get(pcol) if pcol else None, "source": src,
                                         "same_basis": bool(re.search(r"same basis", s, re.I))})
                continue
            vals = [c for c in cols[1:] if re.match(r"^q[1-4]\s*fy\d{2}$", c)]
            cur, prev = (vals + [None, None])[:2]
            v = row.get(cur, "") if cur else ""
            nd = bool(re.search(r"not disclosed", v, re.I))
            qcol = next((c for c in cols if c in ("qoq", "qoq %", "qoq%")), None)
            ycol = next((c for c in cols if c in ("yoy", "yoy %", "yoy%")), None)
            e["metrics"].append({"key": key, "unit": unit, "value": None if nd else _num(v), "disclosed": not nd,
                                 "prev_value": _num(row.get(prev)) if prev else None,
                                 "prev_period": prev.upper().replace("FY", " FY").replace("  ", " ") if prev else None,
                                 "qoq_pct": _num(row.get(qcol)) if qcol else None,
                                 "yoy_pct": _num(row.get(ycol)) if ycol else None, "source": src})
            continue
        cols = [] if not s.startswith("|") else cols
        links = X._links(s)
        first = {"url": links[0][1], "name": X.source_name(links[0][1], links[0][0])} if links else None
        if re.match(r"^guidance\s*:", low) and first:
            e["guidance"].append({"text": X._plain(re.sub(r"\(\[[^\]]*\]\([^)]*\)\)", "", s.split(":", 1)[1])).strip(), "source": first})
        elif s.startswith(">") and first:
            m = re.match(r'^>\s*["“](.+?)["”]\s*[—–-]\s*([^,]+),\s*([^(]+)', s)
            if m:
                e["quotes"].append({"text": m.group(1).strip(), "speaker": m.group(2).strip(), "role": m.group(3).strip(), "source": first})
        elif re.match(r"^not disclosed this quarter\s*:", low):
            body = s.split(":", 1)[1].strip()
            for part in re.split(r";\s*", body):
                k = _row_key(part)
                if k:
                    e["non_disclosures"].append({"key": k, "text": f"{X._plain(part).rstrip('.')}: not disclosed this quarter."})
        elif re.match(r"^blind spots?\s*\(private\)\s*:", low):
            bm = re.search(r"\(basis:\s*([^,)]+)", s)
            e["blind_spots"].append({"text": X._plain(re.sub(r"\(basis:.*$", "", s.split(":", 1)[1])).strip(),
                                     "basis": bm.group(1).strip() if bm else "", "source": first})
        elif re.match(r"^possible impact on muthoot fincorp\s*:", low):
            e["impact"] = X._plain(s.split(":", 1)[1]).strip()
        elif re.match(r"^(?:mfl view|deeper impact)\s*:", low):
            e["impact_deep"] = X._plain(s.split(":", 1)[1]).strip()
        elif re.match(r"^sources?\s*:", low):
            for text, url in links:
                if not any(ev["source"]["url"] == url for ev in e["events"]):
                    ty = ("call-transcript" if re.search(r"transcript", text, re.I) else
                          "call-recording" if re.search(r"recording|audio|webcast", text, re.I) else
                          "investor-deck" if re.search(r"deck|presentation", text, re.I) else
                          "annual-report" if re.search(r"annual report", text, re.I) else
                          "rating-rationale" if re.search(r"rating|rationale", text, re.I) else "results")
                    e["events"].append({"type": ty, "date": edition, "source": {"url": url, "name": X.source_name(url, text)}})
    return e


def peer_export(X, days, data_dir, private, problems):
    """Builds every PeerIntel entry (seed + each edition's Peer Intelligence units). Mutates days (day files get
    peer_intel[] for entries created that day; cards get peer_intel_id). Returns (all_entries_by_id, latest_list)."""
    entries = {}
    seed = {}
    try:
        seed = json.loads((Path(data_dir) / PEER_SEED).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        seed = {}
    for raw in (seed.get("entries") if isinstance(seed, dict) else None) or []:
        e = norm_peer(raw, private, problems)
        if e:
            entries[e["id"]] = e
    by_day = {}
    for d in sorted(days, key=lambda x: x["id"]):
        for c in d.get("cards") or []:
            u = c.get("_u") or {}
            pov = next((ov["_peer"] for ov in u.get("_ext") or [] if "_peer" in ov), None)
            if not pov:
                continue
            raw = parse_peer_unit(X, u.get("_lines") or [], pov, d["id"])
            e = norm_peer(raw, private, problems)
            if not e:
                continue
            e["updated"] = d["id"]
            prev = entries.get(e["id"])
            if prev:  # a later edition updates the entry: new events/metrics win, earlier events are kept
                ev = {(x["type"], x["source"]["url"]): x for x in prev.get("events", []) + e["events"]}
                e["events"] = sorted(ev.values(), key=lambda x: (x["date"], EVENT_TYPES.index(x["type"])))
                for k, v in prev.items():
                    e.setdefault(k, v)
            e.setdefault("card_ids", [])
            if c["id"] not in e["card_ids"]:
                e["card_ids"].append(c["id"])
            entries[e["id"]] = e
            by_day.setdefault(d["id"], {})[e["id"]] = e
    card_to_peer = {cid: e["id"] for e in entries.values() for cid in e.get("card_ids") or []}
    for d in days:
        for c in d.get("cards") or []:
            if c["id"] in card_to_peer:
                c["peer_intel_id"] = card_to_peer[c["id"]]
        if by_day.get(d["id"]):
            d["peer_intel"] = [_public_shape(e) for e in by_day[d["id"]].values()]
    newest = max(d["id"] for d in days)
    floor = (_dt.date.fromisoformat(newest) - _dt.timedelta(days=PEER_LATEST_DAYS)).isoformat()
    latest = sorted((e for e in entries.values() if e["events"][-1]["date"] >= floor),
                    key=lambda e: (e["events"][-1]["date"], e["id"]), reverse=True)
    return entries, [_public_shape(e) for e in latest]


def _public_shape(e):
    return {k: v for k, v in e.items() if k != "card_ids"}


# ---------------------------------------------------------------------------------------------- entry point
def apply(X, days, extras, data_dir, private, generated):
    """Mutates days/extras in place; writes data/peer_intel.json. Returns {filename: object} for the caller to write
    (same `generated` as latest.json)."""
    problems = []
    files = {}
    try:
        entries, latest = peer_export(X, days, data_dir, private, problems)
        extras["peer_intel"] = latest
        files[PEER_FILE] = {"schema_version": 1, "generated": generated,
                            "entries": {k: _public_shape(v) for k, v in sorted(entries.items())}}
    except Exception as exc:  # never fatal
        _log(f"peer_intel skipped: {exc!r}")
    for d in days:
        for c in d.get("cards") or []:
            c.pop("_u", None)
    for p in problems:
        _log(p)
    extras["_problems"] = problems
    return files
