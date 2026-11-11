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
PEER_PRIVATE = "peer_intel_private.json"  # private repo only
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
    pv = pm.get("value") if pm else None
    if pv is None:
        problems.append(f"{where}: mfl_compare {r['key']} has no sourced peer figure in metrics; row dropped")
        return None
    note = r.get("note") or ("" if mv is not None else f"Not yet published for {r.get('mfl_period') or period}")
    if note and not voice_ok(note):
        problems.append(f"{where}: mfl_compare note wording {note!r}; dropped")
        note = ""
    out = {"key": r["key"], "label": r.get("label") or (pm or {}).get("label") or METRIC_LABELS[r["key"]],
           "unit": r.get("unit") or (pm or {}).get("unit") or "",
           "peer_value": pv, "peer_period": period, "peer_source": pm.get("source"), "mfl_value": mv,
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
            if cur and prev:  # a prior column that is not the immediately preceding quarter never yields a computed QoQ
                rc, rp = _period_rank(cur.replace(" ", "")), _period_rank(prev.replace(" ", ""))
                if rc[0] * 4 + rc[1] - (rp[0] * 4 + rp[1]) != 1:
                    e["metrics"][-1]["prev_kind"] = "yoy" if rc[0] - rp[0] == 1 and rc[1] == rp[1] else "other"
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
    over = {}
    if private:  # private-only notes (blind_spots, impact_deep) live in their own file so the shared seed stays public-safe
        try:
            over = json.loads((Path(data_dir) / PEER_PRIVATE).read_text(encoding="utf-8")).get("entries") or {}
        except (OSError, ValueError, AttributeError):
            over = {}
    for raw in (seed.get("entries") if isinstance(seed, dict) else None) or []:
        if private and isinstance(raw, dict) and isinstance(over.get(raw.get("id")), dict):
            raw = dict(raw, **{k: v for k, v in over[raw["id"]].items() if k in ("blind_spots", "impact_deep")})
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


# ---------------------------------------------------------------------------------------------- sources[]
SOURCES_MAX = 6
_DEEP = re.compile(r"^\W*(?:mfl view|deeper impact)\s*:\s*", re.I)
_PRIVATE_LINE = re.compile(r"^\W*(?:mfl view|deeper impact|blind spots?\s*\(private\)|mfl comparison)\b", re.I)
_IMPACT_LINE = re.compile(r"why it matters|possible impact on", re.I)


def _norm_url(u):
    """Dedupe key: scheme, www., fragment, utm_* params, case of host and a trailing slash never make a new source."""
    u = re.sub(r"#.*$", "", (u or "").strip())
    u = re.sub(r"([?&])utm_[^=&]+=[^&]*", r"\1", u).rstrip("?&")
    m = re.match(r"^(?:https?)://(?:www\.)?([^/]+)(.*)$", u, re.I)
    return (m.group(1).lower() + (m.group(2).rstrip("/") or "")) if m else u.rstrip("/")


def _distinct_names(X, out, labels):
    """Two different documents from one publisher must not both read 'BSE': use the writer's link text when it
    says more than the publisher name, else number them ('BSE', 'BSE (2)')."""
    seen = {}
    for s, lab in zip(out, labels):
        n = s["name"]
        if n in seen:
            t = X._plain(lab or "").strip()
            if t and t.lower() != n.lower() and len(t) <= 60 and t not in seen:
                s["name"] = t
            else:
                k = 2
                while f"{n} ({k})" in seen:
                    k += 1
                s["name"] = f"{n} ({k})"
        seen[s["name"]] = True
    return out


def card_sources(X, lines):
    """All links in the unit (not the impact / MFL view lines), de-duplicated, Tier 1 first, capped at 6.
    Returns (sources, banned_urls, dropped_count)."""
    out, seen, bad, labels = [], set(), [], []
    for l in lines or []:
        if _IMPACT_LINE.search(l) or _PRIVATE_LINE.match(l) or X.ANY_COMMENT.match(l):
            continue
        fb = bool(re.search(r"\(fallback:", l, re.I))
        for m in X._LINK.finditer(l):
            url = (m.group(2) or m.group(3) or m.group(4) or "").rstrip(".,;:")
            if not url:
                continue
            if banned(url) or X._excluded(url):
                bad.append(url)
                continue
            k = _norm_url(url)
            if k in seen:
                continue
            seen.add(k)
            s = {"name": X.source_name(url, (m.group(1) or "").strip()), "url": url, "tier": tier(url)}
            if fb:
                s["fallback"] = True
            out.append(s)
            labels.append((m.group(1) or "").strip())
    order = sorted(range(len(out)), key=lambda i: out[i]["tier"])  # stable: the writer's order is kept within a tier
    out, labels = [out[i] for i in order], [labels[i] for i in order]
    _distinct_names(X, out, labels)
    dropped = max(0, len(out) - SOURCES_MAX)
    return out[:SOURCES_MAX], bad, dropped


_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{2,}")
_SKIP_COL = re.compile(r"^(?:as of|source|sources|link|date checked|checked|#|no\.?|sr\.? ?no\.?|s\.? ?no\.?)$", re.I)


def _cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _looks_head(cells):
    """A header row with its |---| separator already stripped: short, digit-free, link-free labels."""
    return len(cells) >= 2 and all(c and len(c.split()) <= 4 and not re.search(r"\d|\]\(|\*\*", c) for c in cells)


def table_prose(X, lines):
    """'| Field | Value | As of |' tables -> 'Field: value.' sentences (header, separator and as-of/source columns dropped)."""
    out, head = [], None
    rows = [l for l in lines if l.strip().startswith("|")]
    for i, l in enumerate(rows):
        if _TABLE_SEP.match(l):
            continue
        cells = _cells(l)
        if (i + 1 < len(rows) and _TABLE_SEP.match(rows[i + 1])) or (head is None and i == 0 and _looks_head(cells)):
            head = cells
            continue
        keep = [(head[k] if head and k < len(head) else "", X._plain(c)) for k, c in enumerate(cells)]
        keep = [(h, v) for h, v in keep if v and not _SKIP_COL.match(h or "")]
        if not keep:
            continue
        lab, val = keep[0][1], [v for h, v in keep[1:]]
        extra = [f"{h} {v}" if h else v for h, v in keep[2:]]
        text = f"{lab}: {val[0]}" if val else lab
        if extra:
            text += " (" + "; ".join(extra) + ")"
        out.append(text.rstrip(".") + ".")
    return " ".join(out)


def fix_table_summary(X, c):
    """A unit whose body is a markdown table used to get a summary made of flattened cells
    ('Field Value As of Status Closed …'). Prose written before the table wins; otherwise rows become sentences."""
    lines = (c.get("_u") or {}).get("_lines") or []
    trows = [l for l in lines if l.strip().startswith("|")]
    has_head = any(_TABLE_SEP.match(l) for l in lines) or (trows and _looks_head(_cells(trows[0])))
    if len(trows) < 2 or not has_head or not c.get("summary") or (lines and lines[0].strip().startswith("|")):
        return False  # a single table row as its own unit already gets a cell-based summary
    title = (c.get("title") or "").rstrip("…").strip()
    pre = []
    for l in lines:
        if l.strip().startswith("|"):
            break
        if (not l.strip() or _IMPACT_LINE.search(l) or _PRIVATE_LINE.match(l) or X.ANY_COMMENT.match(l)
                or l.lstrip().startswith(">") or re.match(r"^\W*sources?\s*:", l, re.I)):
            continue
        p = X._plain(l).strip()
        na, nt = re.sub(r"\W+", "", p.lower().rstrip("…")), re.sub(r"\W+", "", title.lower())
        if p and na and not (na in nt or nt in na):
            pre.append(p)
    text = " ".join(pre)
    if len(text.split()) < 6:
        text = table_prose(X, lines)
    text = re.sub(r"\s{2,}", " ", text).strip()
    if not text:
        return False
    c["summary"] = X._clip(X._sentences(text, 2), 480)
    return True


def sources_ok(card, srcs, waiver):
    k = card.get("kind")
    if k in ("story", "circular"):
        if k == "circular" and card.get("reg") and (not srcs or srcs[0]["tier"] != 1):
            return False
        if len(srcs) >= 2:
            return any(s["tier"] in (1, 2) for s in srcs)
        return bool(waiver) and len(srcs) == 1 and srcs[0]["tier"] == 1
    if k == "analysis":
        return len(srcs) >= 1
    return not srcs or any(s["tier"] in (1, 2) for s in srcs)


# ---------------------------------------------------------------------------------------------- story threads
STORY_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EVERGREEN = ("gold-price-weekly", "markets-daily-close", "mfl-gold-ltv")
TERMINAL = ("listing", "completed", "withdrawn")
_STATUS_TITLE = re.compile(r"(?:^\s*(?:update\s*[:\-–—]\s*)?status\s*[:\-–—]|\bstatus\s*$)", re.I)


def is_status_card(c, ov):
    """A card whose only news is a status change: `kind=status` in its story comment / story_map entry, or a
    status block ('… NCD status', 'Status: …')."""
    if (ov or {}).get("kind") == "status":
        return True
    if (ov or {}).get("kind") == "update":
        return False
    return bool(_STATUS_TITLE.search(c.get("title") or ""))
OPEN_DAYS, DORMANT_DAYS = 7, 21
CONTINUING_MAX = 8
CIRCULAR_DEADLINE_DAYS, CIRCULAR_CHANGE_DAYS, DEADLINE_NEAR_DAYS = 30, 7, 14
STORY_MAP = "story_map.json"
STORIES_FILE = "stories.json"
STORIES_MAX_BYTES = 250_000
GO_LIVE = "2026-11-11"  # day files carry continuing_stories from this edition on; sources_ok is enforced from here
THREAD_FROM = "2026-10-01"  # Sai, 11 Nov: backfill scope A; no thread opens before 1 Oct 2026
REPORT_LONG = {"news": "01-daily-watch", "rules": "02-regulation", "weekly": "03-weekly-analysis"}
_LIST_SECTION = re.compile(r"latest circulars|calendar|deadlines", re.I)
_STOP = set("the a an and or of to in on for by with at from as is are was were be its it this that update updates new "
            "into over under after before than per via vs mfl's".split())
LIFECYCLES = ("draft", "final", "effective", "superseded", "withdrawn")


def slug(s, n=60):
    t = re.sub(r"[^a-z0-9]+", "-", re.sub(r"['’]", "", (s or "").lower())).strip("-")
    return t[:n].rstrip("-")


def _tokens(title):
    t = re.sub(r"^\s*update\s*[:\-–—]\s*", "", (title or "").lower())
    return {w for w in re.findall(r"[a-z0-9₹.%]+", t) if len(w) > 2 and w not in _STOP}


def _jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def reg_story_id(reg, card_id=""):
    """reg-<regulator>-<ref slug>; from the official URL id when there is no ref no."""
    rg = slug(reg.get("regulator") or "x", 10) or "x"
    ref = (reg.get("ref_no") or "").strip()
    if ref:
        first = ref.split(" ")[0]
        base = first if re.search(r"\d", first) and len(re.sub(r"[^A-Za-z0-9]", "", first)) >= 6 else ref
        return f"reg-{rg}-{slug(base, 60 - 5 - len(rg))}"
    url = reg.get("url") or ""
    m = re.search(r"[?&](prid|id)=(\d+)", url, re.I) or re.search(r"_(\d{4,})\.html", url)
    if m:
        return f"reg-{rg}-{(m.group(1).lower() + '-' + m.group(2)) if m.lastindex == 2 else m.group(1)}"
    if url:
        import hashlib
        return f"reg-{rg}-{hashlib.sha1(url.encode()).hexdigest()[:8]}"
    return None


def title_hash(title):
    import hashlib
    return hashlib.sha1((title or "").encode("utf-8")).hexdigest()[:8]


def parse_next(v):
    if not v or v is True:
        return None
    m = re.match(r"^\s*(\d{4}-\d{2}-\d{2})?\s*:\s*(.*)$", str(v))
    if not m:
        return {"date": None, "date_text": None, "what": str(v).strip()}
    return {"date": m.group(1), "date_text": None, "what": m.group(2).strip()}


def _days(a, b):
    return (_dt.date.fromisoformat(a) - _dt.date.fromisoformat(b)).days


_COMMENTS = re.compile(r"\bcomments?\s+(?:are\s+)?(?:due\s+)?(?:by|till|until|on or before|due)\s*:?\s*", re.I)


def reg_extra(X, card, raw_lines, ov, edition):
    """lifecycle (as at the edition), comments_due, effective -> dict for card['reg']."""
    reg = card["reg"]
    text = "\n".join(l for l in raw_lines or [] if not X.ANY_COMMENT.match(l))
    comments = None
    m = _COMMENTS.search(text)
    if m:
        ds = X._dates(text[m.end():m.end() + 30], edition, forward=True)
        comments = ds[0][1] if ds else None
    for o in ov:
        if o.get("comments"):
            comments = X._iso_or_none(o["comments"]) or comments
    lc = None
    for o in ov:
        if (o.get("lifecycle") or "").strip().lower() in LIFECYCLES:
            lc = o["lifecycle"].strip().lower()
    if not lc:
        if reg.get("status") == "draft" or re.search(r"\[DRAFT\]|\bdraft\b|consultation paper", text, re.I) and not re.search(r"\[NEW\]", text):
            lc = "draft"
        else:
            lc = "final"
    sup = next((o.get("superseded_by") for o in ov if o.get("superseded_by")), None)
    return {"base": lc, "comments_due": comments, "superseded_by": sup}


def lifecycle_at(base, effective, asof, text_immediate=False):
    if base in ("draft", "superseded", "withdrawn"):
        return base
    if text_immediate or (effective and effective <= asof):
        return "effective"
    return "final"


def _deadline_at(comments_due, effective, lifecycle, asof, extra=()):
    cands = []
    if comments_due and comments_due >= asof and lifecycle == "draft":
        cands.append((comments_due, "comments", None))
    if effective and effective >= asof:
        cands.append((effective, "effective", None))
    for d, kind, dt in extra:
        if d and d >= asof:
            cands.append((d, kind, dt))
    if not cands:
        return None, False
    d, kind, dt = sorted(cands)[0]
    return {"date": d, "date_text": dt, "kind": kind}, _days(d, asof) <= DEADLINE_NEAR_DAYS


def _story_ov(c):
    o = {}
    for ov in (c.get("_u") or {}).get("_ext") or []:
        if "_story" in ov:
            o.update(ov["_story"])
    return o


def _reg_ovs(c):
    return list((c.get("_u") or {}).get("_reg") or [])


class Thread:
    def __init__(self, sid):
        self.id = sid
        self.cards = []      # (edition, card) every card carrying the id, oldest first
        self.updates = []    # primary update cards (no dup, no relist)
        self.ovs = []        # (edition, story override dict)
        self.reg = None      # circular threads: {"ref_no","regulator","effective","url","base","comments_due",...}
        self.lc_history = []


def stories_export(X, days, data_dir, private, problems, deadlines=None, latest_circulars=None, generated=None):
    """Assigns story ids and per-card thread fields in place; returns (stories_obj, continuing_by_day, threads)."""
    data_dir = Path(data_dir)
    try:
        smap = json.loads((data_dir / STORY_MAP).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        smap = {}
    aliases = dict(smap.get("_aliases") or {}) if isinstance(smap, dict) else {}
    cmap = {k: v for k, v in (smap.items() if isinstance(smap, dict) else []) if not k.startswith("_") and isinstance(v, dict)}

    def resolve(sid):
        seen = set()
        while sid in aliases and sid not in seen:
            seen.add(sid)
            sid = aliases[sid]
        return sid

    threads = {}
    order = sorted(days, key=lambda d: d["id"])
    editions = [d["id"] for d in order if d["id"] >= THREAD_FROM]
    for d in order:
        ed = d["id"]
        today = {}
        if ed < THREAD_FROM:  # sources[] still apply to every edition; threads start on 1 Oct
            for c in d.get("cards") or []:
                srcs, _, _ = card_sources(X, (c.get("_u") or {}).get("_lines"))
                c["sources"] = srcs or ([src_obj(c["source"], X.source_name)] if c.get("source") and src_obj(c["source"], X.source_name) else [])
                if srcs:
                    c["source"] = {"name": srcs[0]["name"], "url": srcs[0]["url"]}
                c["sources_ok"] = sources_ok(c, c["sources"], False)
                if c.get("impact") or c.get("kind") == "circular":
                    c["impact_label"] = IMPACT_LABEL
                if private:
                    deep = next((X._plain(_DEEP.sub("", l)) for l in (c.get("_u") or {}).get("_lines") or [] if _DEEP.match(l)), None)
                    if deep:
                        c["impact_deep"] = deep
            continue
        for c in d.get("cards") or []:
            u = c.get("_u") or {}
            lines = u.get("_lines") or []
            ov = _story_ov(c)
            mp = cmap.get(c["id"])
            if mp and mp.get("title_hash") and mp["title_hash"] != title_hash(c["title"]):
                problems.append(f"story_map {c['id']}: title_hash mismatch; mapping skipped")
                mp = None
            if mp and "story_id" in mp and mp["story_id"] is None:  # mapped out: never threaded
                ov, mp = dict(ov, _none=True), None
            if mp:
                ov = dict({k: v for k, v in mp.items() if k not in ("title_hash", "story_id")}, **ov)
                ov.setdefault("id", mp.get("story_id"))
                if isinstance(ov.get("continues"), list):
                    ov["continues"] = ",".join(ov["continues"])
            # --- sources[] (both editions)
            srcs, bad, dropped = card_sources(X, lines)
            for b in bad:
                problems.append(f"{c['id']}: banned source {b}")
            if dropped and c.get("kind") in ("story", "circular"):
                problems.append(f"{c['id']}: {dropped} extra source(s) dropped (cap {SOURCES_MAX})")
            if srcs:
                c["sources"] = srcs
                c["source"] = {"name": srcs[0]["name"], "url": srcs[0]["url"]}
            elif c.get("source"):
                c["sources"] = [src_obj(c["source"], X.source_name)] if src_obj(c["source"], X.source_name) else []
            else:
                c["sources"] = []
            c["sources_ok"] = sources_ok(c, c["sources"], ov.get("single_source"))
            if c.get("impact") or c.get("kind") == "circular":
                c["impact_label"] = IMPACT_LABEL
            if private:
                deep = next((X._plain(_DEEP.sub("", l)) for l in lines if _DEEP.match(l)), None)
                if deep:
                    c["impact_deep"] = deep
            # --- story id
            sid = None
            if ov.get("id") and ov["id"] is not True:
                sid = resolve(str(ov["id"]).strip().lower())
                if not STORY_ID.match(sid) or len(sid) > 60:
                    problems.append(f"{c['id']}: bad story id {sid!r}")
                    sid = None
            if ov.get("_none"):
                continue
            if not sid and c.get("reg") and (c["reg"].get("ref_no") or _reg_ovs(c)):  # inferred, ref-less reg rows are not threads
                sid = reg_story_id(c["reg"], c["id"])
            auto = False
            # regulation-report notes without a reg comment (quiet-day notes, watchlist sweeps) are threaded only by override or map
            if not sid and c.get("kind") in ("story", "circular") and not (c.get("report") in ("rules", "02-regulation") and not (c.get("reg") or {}).get("ref_no") and not _reg_ovs(c)):
                sid, auto = f"{ed}-{slug(' '.join(re.sub(r'^\s*update\s*[:\-–—]\s*', '', c['title'], flags=re.I).split()[:5]), 49)}", True
            if not sid:
                continue
            if auto:  # automatic join: same company/regulator, a shared topic, an open thread, title overlap >= 0.5
                tk = _tokens(c["title"])
                subj = set(c["tags"].get("companies") or []) or set(c["tags"].get("regulators") or [])
                best = None
                for t in threads.values():
                    if not t.updates or t.id in EVERGREEN:
                        continue
                    last_ed, last = t.updates[-1]
                    if _days(ed, last_ed) > OPEN_DAYS or last_ed == ed:
                        continue
                    lsubj = set(last["tags"].get("companies") or []) or set(last["tags"].get("regulators") or [])
                    if not (subj & lsubj) or not (set(c["tags"].get("topics") or []) & set(last["tags"].get("topics") or [])):
                        continue
                    j = max(_jaccard(tk, _tokens(x["title"])) for _, x in t.updates[-3:])
                    if j >= 0.5 and (best is None or j > best[0]):
                        best = (j, t.id)
                if best:
                    sid = best[1]
                    c["_auto_joined"] = True
            c["story_id"] = sid
            if is_status_card(c, ov):
                c["_status_only"] = True
            c["continues"] = [resolve(x.strip()) for x in str(ov.get("continues") or "").split(",") if x.strip()] if ov.get("continues") not in (None, True) else []
            today.setdefault(sid, []).append((c, ov))
        # --- primary / dup / relist per edition
        for sid, items in today.items():
            t = threads.setdefault(sid, Thread(sid))
            rank = lambda ci: ({"story": 0, "circular": 1, "analysis": 2}.get(ci[0]["kind"], 3),
                               1 if _LIST_SECTION.search(ci[0].get("section") or "") else 0,
                               1 if ci[1].get("dup") else 0, ci[0].get("n") or 0)
            items.sort(key=rank)
            prim, pov = items[0]
            relist = bool(_LIST_SECTION.search(prim.get("section") or "")) and bool(t.updates) and not pov.get("milestone")
            for c, ov in items:
                t.cards.append((ed, c))
                if ov:
                    t.ovs.append((ed, ov, c["id"]))
                if c.get("reg") and (t.reg is None or not _LIST_SECTION.search(c.get("section") or "")):
                    t.reg = dict(c["reg"], **reg_extra(X, c, (c.get("_u") or {}).get("_lines"), _reg_ovs(c), ed),
                                 _text="\n".join((c.get("_u") or {}).get("_lines") or []))
            if not relist:
                prev = t.updates[-1][1]["id"] if t.updates else None
                t.updates.append((ed, prim))
                prim["prev_card"] = prev
            seq = len(t.updates) if t.updates else 1
            for c, ov in items:
                c["thread_seq"] = seq
                c["is_update"] = bool(re.match(r"^\s*update\s*[:\-–—]", c["title"], re.I)) or seq > 1
                c["dup_of"] = prim["id"] if c is not prim else None
                if c is prim and relist:
                    c["prev_card"] = t.updates[-1][1]["id"]
                if c is not prim:
                    c["prev_card"] = prim.get("prev_card")
    # --- regulation lifecycle per card (as at its edition) + thread history
    imm = re.compile(r"with immediate effect", re.I)
    for t in threads.values():
        if not t.reg:
            continue
        first_ed, first = t.cards[0]
        fc = {"date": first_ed, "card_id": first["id"], "report": REPORT_LONG.get(first["report"], first["report"]),
              "title": first["title"]}
        t.first_covered = fc
        eff = t.reg.get("effective")
        eff_known = None  # as-of semantics: a card only knows the effective date published by its own edition
        for ed, c in t.cards:
            if not c.get("reg"):
                continue
            eff_known = c["reg"].get("effective") or eff_known
            eff = eff_known
            ex = reg_extra(X, c, (c.get("_u") or {}).get("_lines"), _reg_ovs(c), ed)
            base = ex["base"] if ex["base"] != "final" or t.reg["base"] != "draft" else "final"
            lc = lifecycle_at(base, c["reg"].get("effective") or eff, ed, bool(imm.search(t.reg.get("_text") or "")))
            dl, near = _deadline_at(ex["comments_due"] or t.reg.get("comments_due"), c["reg"].get("effective") or eff, lc, ed)
            c["reg"].update({"lifecycle": lc, "comments_due": ex["comments_due"] or t.reg.get("comments_due"),
                             "first_covered": fc, "story_id": t.id, "deadline": dl, "deadline_near": near})
            if ex.get("superseded_by"):
                c["reg"]["superseded_by"] = ex["superseded_by"]
        for ed in editions:
            if ed < first_ed:
                continue
            last = [c for e, c in t.cards if e <= ed and c.get("reg")][-1]
            lc = lifecycle_at(last["reg"]["lifecycle"] if last["reg"]["lifecycle"] in ("draft", "superseded", "withdrawn") else "final",
                              last["reg"].get("effective") or eff, ed, bool(imm.search(t.reg.get("_text") or "")))
            if not t.lc_history or t.lc_history[-1]["lifecycle"] != lc:
                t.lc_history.append({"date": ed, "lifecycle": lc, "card_id": last["id"]})
    # --- story objects
    by_id = {}
    for t in threads.values():
        by_id[t.id] = t
    continued_by = {}
    for t in threads.values():
        for ed, c in t.cards:
            for x in c.get("continues") or []:
                if x not in by_id:
                    problems.append(f"{c['id']}: continues unknown story {x}")
                elif t.id not in continued_by.setdefault(x, []):
                    continued_by[x].append(t.id)
    newest = editions[-1] if editions else None
    stories = {}
    for t in sorted(threads.values(), key=lambda t: t.id):
        stories[t.id] = thread_obj(t, newest, continued_by.get(t.id, []), deadlines if newest else None)
    # --- continuing_stories per edition (from GO_LIVE) and for latest
    cont = {}
    for ed in editions:
        if ed >= GO_LIVE or ed == newest:
            cont[ed] = continuing_at(threads, ed, continued_by, deadlines if ed == newest else None)
    return {"stories": stories, "aliases": aliases}, cont, threads


def thread_meta(t):
    title = None
    cats = None
    for ed, ov, cid in t.ovs:
        if ov.get("title") and ov["title"] is not True:
            title = ov["title"]
    first = t.updates[0][1] if t.updates else t.cards[0][1]
    title = title or (t.reg and first.get("title")) or re.sub(r"^\s*update\s*[:\-–—]\s*", "", first["title"], flags=re.I)
    comp, top, regs = set(), set(), set()
    for ed, c in t.cards:
        comp |= set(c["tags"].get("companies") or [])
        top |= set(c["tags"].get("topics") or [])
        regs |= set(c["tags"].get("regulators") or [])
    return title, first.get("category"), sorted(comp), sorted(top), sorted(regs)


def _ov_until(t, asof):
    """(status_override, next, milestone_of_last_update, continues) from overrides up to asof."""
    st, nxt, cont = None, None, []
    for ed, ov, cid in t.ovs:
        if ed > asof:
            break
        if ov.get("status") in ("open", "closed", "dormant"):
            st = (ed, ov["status"])
        elif st and st[1] == "closed" and ed > st[0]:
            st = None  # a later card reopens a closed thread
        if "next" in ov:
            nxt = parse_next(ov["next"])
    return st, nxt


def status_at(t, asof):
    ups = [(e, c) for e, c in t.updates if e <= asof]
    if not ups:
        return None, None, None
    last_ed = ups[-1][0]
    st, nxt = _ov_until(t, asof)
    lc = [h for h in t.lc_history if h["date"] <= asof]
    last_change = lc[-1]["date"] if lc else None
    last_any = max(last_ed, last_change) if last_change else last_ed
    if st and st[1] == "closed" and st[0] >= last_ed:
        return "closed", st[0], nxt
    if nxt and nxt.get("date") and nxt["date"] >= asof:
        return "open", None, nxt
    ms = [ov.get("milestone") for e, ov, cid in t.ovs if e == last_ed and ov.get("milestone")]
    if ms and ms[-1] in TERMINAL and not nxt:
        return "closed", last_ed, nxt
    if t.reg and lc and lc[-1]["lifecycle"] == "effective":
        eff = lc[-1]["date"]
        if _days(asof, eff) > 30 and not any(x for x in [t.reg.get("comments_due")] if x and x >= asof):
            return "closed", (_dt.date.fromisoformat(eff) + _dt.timedelta(days=30)).isoformat(), nxt
    gap = _days(asof, last_any)
    if gap <= OPEN_DAYS:
        return "open", None, nxt
    if gap <= DORMANT_DAYS:
        return "dormant", None, nxt
    return "closed", (_dt.date.fromisoformat(last_any) + _dt.timedelta(days=DORMANT_DAYS + 1)).isoformat(), nxt


def _upd(ed, c, milestone=None, kind=None):
    kind = kind or ("status" if c.get("_status_only") else None)
    u = {"date": ed, "card_id": c["id"], "report": REPORT_LONG.get(c["report"], c["report"]), "title": c["title"],
         "milestone": milestone}
    if c.get("sources"):
        u["source"] = {"name": c["sources"][0]["name"], "tier": c["sources"][0]["tier"]}
    if kind:
        u["kind"] = kind
    return u


def thread_updates(t, asof):
    ms = {cid: ov.get("milestone") for e, ov, cid in t.ovs if ov.get("milestone") and ov.get("milestone") is not True}
    out = [_upd(ed, c, ms.get(c["id"])) for ed, c in t.updates if ed <= asof]
    have = {u["date"] for u in out}
    for h in t.lc_history[1:]:  # status-only changes (lifecycle moved with no card that day) count as updates
        if h["date"] <= asof and h["date"] not in have:
            c = next(c for e, c in t.cards if c["id"] == h["card_id"])
            u = _upd(h["date"], c, None, "status")
            u["title"] = f"Status: {h['lifecycle']}"
            u["lifecycle"] = h["lifecycle"]
            out.append(u)
    return sorted(out, key=lambda u: (u["date"], u["card_id"]))


def thread_obj(t, asof, continued_by, deadlines=None):
    title, cat, comp, top, regs = thread_meta(t)
    status, closed, nxt = status_at(t, asof)
    ups = thread_updates(t, asof)
    conts = sorted({x for e, c in t.cards for x in c.get("continues") or []})
    o = {"title": title, "category": cat, "companies": comp, "topics": top, "regulators": regs, "status": status,
         "opened": t.cards[0][0], "last_update": ups[-1]["date"] if ups else t.cards[-1][0], "closed": closed,
         "continues": conts, "continued_by": sorted(continued_by), "next": nxt, "updates": ups,
         "card_count": len(t.cards), "editions": len({e for e, c in t.cards})}
    if t.id in EVERGREEN:
        o["evergreen"] = True
    if any(c.get("_auto_joined") for e, c in t.cards):
        o["auto_joined"] = True
    if t.reg:
        last = [c for e, c in t.cards if c.get("reg") and e <= asof][-1]
        hist = [h for h in t.lc_history if h["date"] <= asof]
        o["reg"] = {"ref_no": t.reg.get("ref_no"), "regulator": t.reg.get("regulator"),
                    "lifecycle": hist[-1]["lifecycle"] if hist else last["reg"].get("lifecycle"),
                    "lifecycle_history": hist, "first_covered": t.first_covered,
                    "comments_due": last["reg"].get("comments_due"), "effective": last["reg"].get("effective") or t.reg.get("effective"),
                    "url": t.reg.get("url")}
    return o


def continuing_at(threads, asof, continued_by, deadlines=None):
    rows = []
    for t in threads.values():
        if t.id in EVERGREEN or not any(e <= asof for e, c in t.updates):
            continue
        status, closed, nxt = status_at(t, asof)
        if status != "open":
            continue
        ups = thread_updates(t, asof)
        eds = len({e for e, c in t.cards if e <= asof})
        today_cards = [c for e, c in t.cards if e == asof]
        if today_cards and all(c.get("dup_of") for c in today_cards) and not any(e == asof for e, c in t.updates):
            pass
        future_next = bool(nxt and nxt.get("date") and nxt["date"] >= asof)
        if t.reg:
            hist = [h for h in t.lc_history if h["date"] <= asof]
            changed = bool(len(hist) > 1 and _days(asof, hist[-1]["date"]) <= CIRCULAR_CHANGE_DAYS)
            last = [c for e, c in t.cards if c.get("reg") and e <= asof][-1]
            dl = last["reg"].get("deadline")
            dl_now, near = _deadline_at(last["reg"].get("comments_due"), last["reg"].get("effective") or t.reg.get("effective"),
                                        hist[-1]["lifecycle"] if hist else last["reg"].get("lifecycle"), asof)
            soon = bool(dl_now and _days(dl_now["date"], asof) <= CIRCULAR_DEADLINE_DAYS)
            if not (soon or changed):
                continue
        elif not (len(ups) >= 2 or eds >= 2 or future_next):
            continue
        title, cat, comp, top, regs = thread_meta(t)
        lu = ups[-1]
        lc_card = next(c for e, c in t.cards if c["id"] == lu["card_id"])
        latest = {"date": lu["date"], "card_id": lu["card_id"], "report": lu["report"],
                  "kind": "status" if lu.get("kind") == "status" else "update", "title": lu["title"],
                  "summary": (lc_card.get("summary") or "")[:200] or None,
                  "source": ({k: lc_card["sources"][0][k] for k in ("name", "url", "tier")} if lc_card.get("sources") else None),
                  "lifecycle_change": None}
        hist_lc = [h for h in t.lc_history if h["date"] <= asof]
        if lu.get("kind") == "status" and lu.get("lifecycle") and hist_lc:
            hist = hist_lc
            latest["lifecycle_change"] = {"from": hist[-2]["lifecycle"] if len(hist) > 1 else None,
                                          "to": hist[-1]["lifecycle"], "date": hist[-1]["date"]}
        row = {"story_id": t.id, "title": title, "category": cat, "companies": comp, "status": status,
               "opened": t.cards[0][0], "last_update": lu["date"], "update_count": len(ups), "latest": latest,
               "recent": [{k: u[k] for k in ("date", "card_id", "report", "title")} for u in ups[-4:-1]][::-1],
               "next": nxt}
        if t.reg:
            row["reg"] = {"regulator": t.reg.get("regulator"), "lifecycle": hist[-1]["lifecycle"] if hist else None,
                          "comments_due": last["reg"].get("comments_due"),
                          "effective": last["reg"].get("effective") or t.reg.get("effective"), "deadline_near": near}
        rows.append((lu["date"], len(t.cards), row))
    rows.sort(key=lambda r: (r[0], r[1], r[2]["story_id"]), reverse=True)
    return [r[2] for r in rows[:CONTINUING_MAX]]


def _clean(o):
    """Omit absent optional keys (None / "" / [] for the keys the contract marks optional)."""
    return o


def story_index(stories_obj, latest_obj, generated, size, archives):
    refs_ids = set()

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("story_id",) and isinstance(v, str):
                    refs_ids.add(v)
                elif k == "story_ids" and isinstance(v, list):
                    refs_ids.update(x for x in v if isinstance(x, str))
                elif k == "stories_ref" and isinstance(v, list):
                    refs_ids.update(x for x in v if isinstance(x, str))
                else:
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk({k: v for k, v in latest_obj.items() if k != "days"})
    st = stories_obj["stories"]
    hop = set()
    for i in refs_ids:
        s = st.get(i)
        if s:
            hop |= set(s.get("continues") or []) | set(s.get("continued_by") or [])
    refs = {}
    for i in sorted(refs_ids | hop):
        s = st.get(i)
        if not s:
            continue
        refs[i] = {"title": s["title"], "category": s["category"], "status": s["status"], "opened": s["opened"],
                   "last_update": s["last_update"], "update_count": len(s["updates"]), "continues": s["continues"],
                   "continued_by": s["continued_by"], "next": s["next"]}
    return {"file": "data/stories.json", "generated": generated, "threads": len(st),
            "open": sum(1 for s in st.values() if s["status"] == "open"), "bytes": size, "archives": archives,
            "refs": refs}


def split_stories(obj, newest):
    """One file up to 250 KB raw; past that a hot file (open, dormant, closed <= 45 days) + monthly archives."""
    raw = json.dumps(obj, ensure_ascii=False)
    if len(raw.encode("utf-8")) <= STORIES_MAX_BYTES:
        return obj, {}
    hot, arch = {}, {}
    floor = (_dt.date.fromisoformat(newest) - _dt.timedelta(days=45)).isoformat()
    for k, s in obj["stories"].items():
        if s["status"] != "closed" or (s.get("closed") or newest) >= floor:
            hot[k] = s
        else:
            arch.setdefault(s["closed"][:7], {})[k] = s
    files = {f"stories/archive-{m}.json": {"schema_version": 1, "generated": obj["generated"], "stories": v}
             for m, v in sorted(arch.items())}
    out = dict(obj, stories=hot, archives=[f"data/{n}" for n in files],
               archived={k: m for m, v in arch.items() for k in v})
    return out, files


# ---------------------------------------------------------------------------------------------- entry point
def _enrich_circulars(X, lcs, cards_by_id, threads, newest):
    for c in lcs or []:
        r = c.get("reg") or {}
        day = cards_by_id.get(c.get("id"))
        sid = (day or {}).get("story_id") or (reg_story_id(r) if r else None)
        if not sid:
            continue
        c["story_id"] = sid
        if day:
            for k in ("sources", "sources_ok", "impact_label", "impact_deep", "thread_seq", "is_update", "continues"):
                if k in day:
                    c[k] = day[k]
        t = threads.get(sid)
        if t and t.reg:
            last = [x for e, x in t.cards if x.get("reg") and e <= newest][-1]
            hist = [h for h in t.lc_history if h["date"] <= newest]
            lc = hist[-1]["lifecycle"] if hist else last["reg"].get("lifecycle")
            dl, near = _deadline_at(last["reg"].get("comments_due"), r.get("effective") or last["reg"].get("effective"), lc, newest)
            r.update({"lifecycle": lc, "comments_due": last["reg"].get("comments_due"), "first_covered": t.first_covered,
                      "story_id": sid, "deadline": dl, "deadline_near": near})
        elif r:
            lc = lifecycle_at("draft" if r.get("status") == "draft" else "final", r.get("effective"), newest)
            dl, near = _deadline_at(None, r.get("effective"), lc, newest)
            r.update({"lifecycle": lc, "comments_due": None, "first_covered": None, "story_id": sid,
                      "deadline": dl, "deadline_near": near})


_MONS = "jan feb mar apr may jun jul aug sep oct nov dec".split()
_RANGE_TXT = re.compile(r"\b(\d{1,2})(?:\s+([A-Za-z]{3,9})\.?)?(?:,?\s+(\d{4}))?\s*(?:[–—-]|to)\s*(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?")
_WINDOW = re.compile(r"\b(\d{1,3})[- ]day (?:window|period) (?:from|starting|beginning) (\d{1,2} [A-Za-z]{3,9}\.? \d{4})", re.I)
_MONTH_SPAN = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*[–—-]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+(\d{4}))?\b")


def _fmt_d(iso):
    d = _dt.date.fromisoformat(iso)
    return f"{d.day} {_MONS[d.month - 1].title()} {d.year}"


def range_text(title, date):
    """date_text for a deadline that is really a window: '23 Oct – 5 Nov 2026', '7 Nov 2026 – 5 Feb 2027'
    ('90-day window from 7 Nov 2026'). None when the row is a single day."""
    t = title or ""
    m = _RANGE_TXT.search(t)
    if m and (m.group(2) or m.group(5)) and m.group(5)[:3].lower() in _MONS and (not m.group(2) or m.group(2)[:3].lower() in _MONS):
        return re.sub(r"\s*(?:-|—|to)\s*", " – ", m.group(0), count=1).strip()
    m = _WINDOW.search(t)
    if m and date:
        return f"{m.group(2)} – {_fmt_d(date)}"
    return None


def _enrich_deadlines(X, rows, threads):
    keys = {}
    for t in threads.values():
        if t.reg:
            if t.reg.get("ref_no"):
                keys[X._ref_key(t.reg["ref_no"])] = t.id
            if t.reg.get("url"):
                keys[_norm_url(t.reg["url"])] = t.id
    for x in rows or []:
        sid = keys.get(X._ref_key(x.get("ref_no"))) if x.get("ref_no") else None
        sid = sid or (keys.get(_norm_url(x["url"])) if x.get("url") else None)
        if sid:
            x["story_id"] = sid
        t = x.get("title") or ""
        if not x.get("date_text"):
            rt = range_text(t, x.get("date"))
            if rt:
                x["date_text"] = rt
        x["kind"] = ("comments" if x.get("status") == "draft" or re.search(r"\bcomments?\b|consultation", t, re.I) else
                     "effective" if re.search(r"\(effective\)|\beffective\b|comes into force|in force", t, re.I) else
                     "compliance" if re.search(r"\bdue\b|deadline|compl|submit|filing|report|returns?\b|disclos|results", t, re.I) else
                     "other")


def apply(X, days, extras, data_dir, private, generated):
    """Mutates days/extras in place. Returns {filename: object} for the caller to write (same `generated` as
    latest.json); finalize() adds story_index once latest.json is assembled."""
    problems = []
    files = {}
    newest = max(d["id"] for d in days) if days else None
    threads = {}
    try:
        sobj, cont, threads = stories_export(X, days, data_dir, private, problems, extras.get("deadlines"),
                                             extras.get("latest_circulars"), generated)
        for d in days:
            if d["id"] in cont and (d["id"] >= GO_LIVE):
                d["continuing_stories"] = cont[d["id"]]
        extras["continuing_stories"] = cont.get(newest, [])
        cards_by_id = {c["id"]: c for d in days for c in d.get("cards") or []}
        _enrich_circulars(X, extras.get("latest_circulars"), cards_by_id, threads, newest)
        _enrich_deadlines(X, extras.get("deadlines"), threads)
        files[STORIES_FILE] = {"schema_version": 1, "generated": generated, "aliases": sobj["aliases"], "archives": [],
                               "stories": sobj["stories"]}
    except Exception as exc:  # never fatal
        import traceback
        traceback.print_exc()
        _log(f"stories skipped: {exc!r}")
    try:
        entries, latest = peer_export(X, days, data_dir, private, problems)
        extras["peer_intel"] = latest
        files[PEER_FILE] = {"schema_version": 1, "generated": generated,
                            "entries": {k: _public_shape(v) for k, v in sorted(entries.items())}}
    except Exception as exc:  # never fatal
        _log(f"peer_intel skipped: {exc!r}")
    try:
        wr = week_review_export(X, days, threads, problems, data_dir)
        for d in days:
            if d["id"] in wr:
                d["week_review"] = wr[d["id"]]
        mondays = sorted(wr)
        if mondays and newest and _days(newest, mondays[-1]) < 7:  # latest.json carries it until the next weekly
            extras["week_review"] = wr[mondays[-1]]
    except Exception as exc:  # never fatal
        _log(f"week_review skipped: {exc!r}")
    fixed = set()
    for d in days:
        for c in d.get("cards") or []:
            try:
                if fix_table_summary(X, c):
                    fixed.add(c["id"])
            except Exception as exc:  # never fatal
                _log(f"{c.get('id')}: summary fix skipped: {exc!r}")
            if c.get("impact") or c.get("kind") == "circular":
                c["impact_label"] = IMPACT_LABEL
    cards_by_id = {c["id"]: c for d in days for c in d.get("cards") or []}
    for c in extras.get("latest_circulars") or []:
        if c.get("id") in fixed:
            c["summary"] = cards_by_id[c["id"]]["summary"]
        c["impact_label"] = IMPACT_LABEL
    for d in days:
        for c in d.get("cards") or []:
            c.pop("_u", None)
            c.pop("_auto_joined", None)
            c.pop("_status_only", None)
            if not private:
                for k in PRIVATE_KEYS:
                    c.pop(k, None)
    if not private:
        for c in extras.get("latest_circulars") or []:
            for k in PRIVATE_KEYS:
                c.pop(k, None)
    for p in problems:
        _log(p)
    extras["_problems"] = problems
    files["_newest"] = newest
    return files


def finalize(latest, files):
    """Called by export_json just before writing: story_index (+ split) with latest.json's own `generated`."""
    newest = files.pop("_newest", None)
    pf = files.get(PEER_FILE)
    if pf:
        pf["generated"] = latest["generated"]
        latest["peer_intel_index"] = {"file": "data/" + PEER_FILE, "generated": latest["generated"],
                                      "count": len(pf.get("entries") or {})}
    so = files.get(STORIES_FILE)
    if not so:
        return files
    so["generated"] = latest["generated"]
    hot, arch = split_stories(so, newest or latest.get("latest"))
    files[STORIES_FILE] = hot
    files.update(arch)
    size = len(json.dumps(hot, ensure_ascii=False).encode("utf-8"))
    latest["story_index"] = story_index(hot, latest, latest["generated"], size, hot.get("archives") or [])
    return files


def week_review_export(X, days, threads, problems, data_dir):
    """Monday weekly: `<!-- stories: ids=a,b -->` under a `##` section (or a story_map entry with stories_ref)
    -> card.stories_ref; plus one week_review object per weekly edition (plan section 1.6, review point 9)."""
    try:
        smap = json.loads((Path(data_dir) / STORY_MAP).read_text(encoding="utf-8"))
    except Exception:
        smap = {}
    aliases = dict(smap.get("_aliases") or {}) if isinstance(smap, dict) else {}

    def resolve(i):
        seen = set()
        while i in aliases and i not in seen:
            seen.add(i)
            i = aliases[i]
        return i
    out = {}
    for d in sorted(days, key=lambda x: x["id"]):
        ed = d["id"]
        weekly = [c for c in d.get("cards") or [] if c.get("report") in ("weekly", "03-weekly-analysis")]
        if not weekly or ed < THREAD_FROM:
            continue
        ws = (_dt.date.fromisoformat(ed) - _dt.timedelta(days=7)).isoformat()
        we = (_dt.date.fromisoformat(ed) - _dt.timedelta(days=1)).isoformat()
        sections, all_ids = [], []
        for c in weekly:
            ids = None
            for ov in (c.get("_u") or {}).get("_ext") or []:
                if "_stories" in ov and ov["_stories"].get("ids") not in (None, True):
                    ids = [x.strip().lower() for x in str(ov["_stories"]["ids"]).split(",") if x.strip()]
            mp = smap.get(c["id"]) if isinstance(smap, dict) else None
            if ids is None and isinstance(mp, dict) and isinstance(mp.get("stories_ref"), list):
                if mp.get("title_hash") and mp["title_hash"] != title_hash(c["title"]):
                    problems.append(f"story_map {c['id']}: title_hash mismatch; stories_ref skipped")
                else:
                    ids = list(mp["stories_ref"])
            if ids is None:
                continue
            good = []
            for i in (resolve(x) for x in ids):
                if i not in threads:
                    problems.append(f"{c['id']}: stories_ref unknown story {i}")
                elif i not in good:
                    good.append(i)
            c["stories_ref"] = good
            if good:
                sections.append({"card_id": c["id"], "title": c.get("section") or c["title"], "story_ids": good})
                all_ids += [i for i in good if i not in all_ids]
        mentioned = set(all_ids)
        wt = []
        for t in threads.values():
            if t.id in EVERGREEN:
                continue
            n = sum(1 for e, c in t.updates if ws <= e <= we)
            if n:
                wt.append({"story_id": t.id, "cards_in_week": n, "mentioned_in_review": t.id in mentioned})
        wt.sort(key=lambda r: (-r["cards_in_week"], r["story_id"]))
        out[ed] = {"id": ws, "published": ed, "week_start": ws, "week_end": we,
                   "report_card_prefix": f"{ed}-weekly", "story_ids": all_ids, "sections": sections, "week_threads": wt}
    return out
