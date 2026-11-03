#!/usr/bin/env python3
"""NBFC Brief: write the public JSON contract (docs/DATA_FORMAT.md) next to data.js.

    python3 export_json.py [--site DIR]   (publish.py also calls export(ROOT) after writing data.js)

Reads DIR/data.js (window.BRIEFING = {...}, written by publish.py) and, when present, each
DIR/days/<id>/structured.json sidecar. Writes DIR/data/<id>.json for every day and DIR/data/latest.json.

Rules kept here:
  * a figure is copied only from that day's own report; a day without it is a gap (null), never carried over;
  * value_num from the sidecar wins, even when null (= ambiguous);
  * Muthoot Finance (key "muthoot") is a listed peer; Muthoot Fincorp items live only in mfl_market;
  * nothing here invents a sentiment, an impact note, an issuer or a date: absent stays absent;
  * optional seed: DIR/data/history.json = { "<item key>": { "YYYY-MM-DD": number|null } } adds older
    figures to `series` for dates that are NOT live editions. A live edition always wins (even its gap),
    a bad or missing seed is ignored, and nothing is carried forward: a date without a figure stays null.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SCHEMA = "nbfc-brief"
SCHEMA_VERSION = 1
SERIES_DAYS = 30
REPORT_KEYS = ("01-daily-watch", "02-regulation", "03-weekly-analysis")
SENTIMENTS = {"positive", "negative", "neutral", "watch"}
APPLIES = (True, False, "unclear")
MFL_KINDS = {"ncd", "rating", "news", "watch"}


def _num(value):
    if value is None:
        return None
    s = str(value).replace("\u2212", "-").replace("\u2013", "-").replace(",", "")
    m = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def _clean_num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if v == v and abs(v) != float("inf") else None
    return None


def series_value(item: dict):
    if "value_num" in item:
        return _clean_num(item["value_num"])
    return _num(item.get("value"))


def load_payload(site: Path) -> dict:
    txt = (site / "data.js").read_text(encoding="utf-8")
    start = txt.index("{")
    end = txt.rstrip().rstrip(";").rstrip()
    return json.loads(end[start:])


def _sidecar(site: Path, day_id: str) -> dict:
    p = site / "days" / day_id / "structured.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:  # a bad sidecar never stops publishing
        print(f"export_json: ignored {p}: {exc}", file=sys.stderr)
        return {}


def _src(s):
    if isinstance(s, str):
        return {"label": None, "url": s}
    if isinstance(s, dict) and s.get("url"):
        return {"label": s.get("label"), "url": s["url"]}
    return None


def public_day(day: dict, extra: dict) -> dict:
    reports = [
        {k: r.get(k) for k in ("id", "key", "section", "kind", "title", "when", "expected", "missing",
                               "content", "words", "sources") if k in r}
        for r in day.get("reports", []) if r.get("key") in REPORT_KEYS
    ]
    kn = dict(day.get("key_numbers") or {})
    watch = kn.pop("watchlist", None) or []
    items = []
    srcs, nums = extra.get("items_sources"), extra.get("items_value_num")
    for it in kn.get("items", []):
        it = dict(it)
        if isinstance(srcs, dict) and it.get("key") in srcs:
            it["sources"] = srcs[it["key"]]
        if isinstance(nums, dict) and it.get("key") in nums:
            it["value_num"] = _clean_num(nums[it["key"]])
        items.append(it)
    kn["items"] = items
    out = {
        "id": day["id"], "label": day["label"], "weekday": day["weekday"], "is_monday": day["is_monday"],
        "due": sum(1 for r in reports if r.get("expected")),
        "filed": sum(1 for r in reports if not r.get("missing")),
        "reports": reports,
        "key_numbers": kn,
    }
    # Muthoot Fincorp in the market: sidecar list wins, else the report's MFL watchlist table
    mm = extra.get("mfl_market") if isinstance(extra.get("mfl_market"), list) else watch
    out["mfl_market"] = [
        {k: v for k, v in {
            "kind": x.get("kind") if x.get("kind") in MFL_KINDS else None,
            "name": x.get("name"), "value": x.get("value"),
            "asof": x.get("asof"), "asof_label": x.get("asof_label"),
            "source": _src(x.get("source")),
        }.items() if v is not None}
        for x in mm if isinstance(x, dict) and x.get("name")
    ]
    if isinstance(extra.get("stories"), list):
        out["stories"] = []
        for s in extra["stories"]:
            if not isinstance(s, dict) or not s.get("title"):
                continue
            st = {"title": s["title"], "dek": s.get("dek", ""),
                  "mfl_impact": s.get("mfl_impact", s.get("why", "")) or "",
                  "tag": s.get("tag", ""),
                  "sources": [x for x in (_src(y) for y in s.get("sources", [])) if x]}
            if s.get("sentiment") in SENTIMENTS:
                st["sentiment"] = s["sentiment"]
            out["stories"].append(st)
    if isinstance(extra.get("rules"), list):
        out["rules"] = [
            {**{k: r.get(k) for k in ("issuer", "ref", "date", "title", "tag", "effective", "url") if r.get(k) is not None},
             "applies_to_mfl": r.get("applies_to_mfl") if r.get("applies_to_mfl") in APPLIES else "unclear"}
            for r in extra["rules"] if isinstance(r, dict) and r.get("title")
        ]
    if isinstance(extra.get("rules_note"), str) and extra["rules_note"].strip():
        out["rules_note"] = extra["rules_note"].strip()
    if isinstance(extra.get("reg_calendar"), list):
        out["reg_calendar"] = [
            {"date": c["date"], "issuer": c.get("issuer"), "item": c["item"],
             "applies_to": c.get("applies_to"), "source": _src(c.get("source"))}
            for c in extra["reg_calendar"]
            if isinstance(c, dict) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(c.get("date", ""))) and c.get("item")
        ]
    return out


# ---------------------------------------------------------------------------------------------
# Story tags for search (additive; see docs/DATA_FORMAT.md "Story tags"). Never fatal.
# ---------------------------------------------------------------------------------------------
TAG_REPORTS = ("01-daily-watch", "02-regulation", "03-weekly-analysis")
TAG_KEYS = ("companies", "regulators", "topics")
TAG_COMMENT = re.compile(r"^\s*<!--\s*tags:(.*?)-->\s*$", re.I)
_I = re.I

def _rx(*pats, flags=_I):
    return re.compile("|".join(pats), flags)

# Muthoot Finance (listed peer) and Muthoot Fincorp (MFL) are separate companies and separate slugs.
TAG_COMPANIES = {
    "muthoot-fincorp": [_rx(r"\bMuthoot\s+Fincorp\b"), re.compile(r"\bMFL\b")],
    "muthoot-finance": [_rx(r"\bMuthoot\s+Finance\b")],
    "muthoot-microfin": [_rx(r"\bMuthoot\s+Microfin\b")],
    "manappuram": [_rx(r"\bManappuram\b")],
    "bajaj-finance": [_rx(r"\bBajaj\s+Finance\b")],
    "bajaj-housing-finance": [_rx(r"\bBajaj\s+Housing\s+Finance\b")],
    "shriram-finance": [_rx(r"\bShriram\s+Finance\b")],
    "iifl-finance": [_rx(r"\bIIFL\s+Finance\b"), re.compile(r"\bIIFL\b(?!\s+(?:Home|Samasta|Securities|Wealth|Capital))")],
    "lic-housing-finance": [_rx(r"\bLIC\s+Housing\b", r"\bLIC\s+HFL\b")],
    "cholamandalam": [_rx(r"\bCholamandalam\b", r"\bChola\b")],
    "poonawalla-fincorp": [_rx(r"\bPoonawalla\s+Fincorp\b")],
    "l-and-t-finance": [_rx(r"\bL&T\s+Finance\b"), re.compile(r"\bLTF\b")],
    "hdb-financial": [_rx(r"\bHDB\s+Financial\b")],
    "tata-capital": [_rx(r"\bTata\s+Capital\b")],
    "aditya-birla-capital": [_rx(r"\bAditya\s+Birla\s+(?:Capital|Finance)\b")],
    "piramal-finance": [_rx(r"\bPiramal\b")],
    "mahindra-finance": [_rx(r"\bMahindra\s+(?:&\s+Mahindra\s+)?Financ", r"\bM&M\s+Financ")],
    "pnb-housing-finance": [_rx(r"\bPNB\s+Housing\b")],
    "equitas-sfb": [_rx(r"\bEquitas\b")],
    "navi-finserv": [_rx(r"\bNavi\s+Finserv\b")],
    "sbi": [re.compile(r"\bSBI\b"), _rx(r"\bState\s+Bank\s+of\s+India\b")],
    "hdfc-bank": [_rx(r"\bHDFC\s+Bank\b")],
    "icici-bank": [_rx(r"\bICICI\s+Bank\b")],
    "axis-bank": [_rx(r"\bAxis\s+Bank\b")],
    "kotak-mahindra-bank": [_rx(r"\bKotak\b")],
}
TAG_REGULATORS = {
    "rbi": [re.compile(r"\bRBI\b"), _rx(r"\bReserve\s+Bank\b")],
    "sebi": [re.compile(r"\bSEBI\b|\bSebi\b")],
    "ibbi": [re.compile(r"\bIBBI\b"), _rx(r"\bInsolvency\s+and\s+Bankruptcy\s+Board\b")],
    "mca": [re.compile(r"\bMCA\b"), _rx(r"\bMinistry\s+of\s+Corporate\s+Affairs\b")],
    "nhb": [re.compile(r"\bNHB\b"), _rx(r"\bNational\s+Housing\s+Bank\b")],
    "irdai": [re.compile(r"\bIRDAI?\b")],
    "govt": [_rx(r"\bgovernment\b", r"\bgovt\b", r"\bFinance\s+Ministry\b", r"\bMinistry\s+of\s+Finance\b",
                 r"\bUnion\s+Budget\b", r"\bCBDT\b", r"\bGST\s+Council\b"), re.compile(r"\bPIB\b|\bDFS\b")],
}
TAG_TOPICS = {
    "gold-loan": [_rx(r"\bgold[- ]loans?\b", r"\bgold[- ]lend", r"\bgold[- ]backed\b", r"\bgold\s+financ", r"\bloans?\s+against\s+gold\b")],
    "ncd": [re.compile(r"\bNCDs?\b"), _rx(r"\bnon-convertible\s+debentures?\b", r"\bdebentures?\b")],
    "rating": [_rx(r"\bratings?\b", r"\brated\b", r"\bupgrade[sd]?\b", r"\bdowngrade[sd]?\b", r"\bCareEdge\b",
                   r"\bIndia\s+Ratings\b", r"\bInd-Ra\b", r"\bBrickwork\b", r"\bAcuit[eé]\b"),
               re.compile(r"\bCRISIL\b|\bCrisil\b|\bICRA\b|\bCARE\b")],
    "results": [re.compile(r"\bQ[1-4]\b|\bH[12]\s?FY|\bPAT\b"), _rx(r"\bresults\b", r"\bnet\s+profit\b", r"\bearnings\b", r"\bbusiness\s+update\b")],
    "circular": [_rx(r"\bcirculars?\b", r"\bnotifications?\b", r"\bmaster\s+directions?\b", r"\bamendment\b",
                     r"\bdraft\s+(?:directions?|guidelines|circular|framework)\b", r"\bguidelines\b")],
    "funding": [_rx(r"\bfunding\b", r"\bborrowings?\b", r"\bbank\s+(?:credit|lending|lines?|loans?)\s+to\b", r"\bbank\s+lines?\b",
                    r"\bcapital\s+rais", r"\braised?\s+₹", r"\bcommercial\s+paper\b", r"\bliquidity\b", r"\bcost\s+of\s+funds\b"),
                re.compile(r"\bQIP\b|\bECBs?\b")],
    "rates": [_rx(r"\brepo\b", r"\binterest\s+rates?\b", r"\brate\s+(?:hike|cut)s?\b", r"\bbps?\b", r"\byields?\b",
                  r"\bG-?secs?\b", r"\bMCLR\b", r"\blending\s+rates?\b", r"\bT-bills?\b", r"\bpolicy\s+rate\b"),
              re.compile(r"\bMPC\b")],
    "gold-price": [_rx(r"\bgold\s+(?:price|prices|rate|rates)\b", r"\bgold\s+(?:rose|fell|steadied|traded|hit|climbed|slipped|eased|gained|jumped|dropped)\b",
                       r"\bspot\s+gold\b", r"\bbullion\b", r"\bWorld\s+Gold\s+Council\b", r"\bper\s+(?:ounce|10\s?g|gram)\b", r"/oz\b"),
                   re.compile(r"\bIBJA\b")],
    "markets": [re.compile(r"\bSensex\b|\bNifty\b|\bFPIs?\b|\bFIIs?\b|\bBrent\b"),
                _rx(r"\bstocks?\b", r"\bshares?\b", r"\bbhavcopy\b", r"\brupee\b", r"\bstock\s+market\b")],
    "asset-quality": [re.compile(r"\bG?NPAs?\b|\bNNPA\b|\bPAR\s?\d"),
                      _rx(r"\bStage\s+[23]\b", r"\basset\s+quality\b", r"\bdelinquenc", r"\bwrite-?offs?\b", r"\bslippages?\b",
                          r"\boverdue\b", r"\bdefaults?\b", r"\bstress\b", r"\bcredit\s+costs?\b", r"\bbad\s+loans?\b")],
    "microfinance": [re.compile(r"\bMFIs?\b|\bMFIN\b|\bSHGs?\b|\bJLG\b|\bCGFMU\b"),
                     _rx(r"\bmicro-?financ", r"\bmicro-?loans?\b", r"\bSa-Dhan\b", r"\bMicrofin\b")],
    "digital-lending": [_rx(r"\bdigital\s+lend", r"\bfintechs?\b", r"\bdigital\s+loans?\b", r"\bloan\s+apps?\b",
                            r"\baccount\s+aggregators?\b", r"\bNBFC-AA\b"), re.compile(r"\bDLGs?\b|\bFLDG\b|\bLSPs?\b")],
    "ipo": [re.compile(r"\bIPOs?\b|\bDRHP\b|\bRHP\b"), _rx(r"\binitial\s+public\s+offer", r"\banchor\s+investors?\b")],
    "m-and-a": [re.compile(r"\bM&A\b"), _rx(r"\bacquisitions?\b", r"\bacquire[sd]?\b", r"\bmergers?\b", r"\bamalgamation\b",
                                           r"\bstake\s+(?:sale|buy|purchase)\b", r"\bbuyouts?\b", r"\bdivest")],
    "enforcement": [_rx(r"\bpenalt(?:y|ies)\b", r"\bpenalis(?:ed|es)\b", r"\bpenaliz(?:ed|es)\b", r"\bfined\b", r"\bcancell?ed\s+(?:the\s+)?(?:registration|CoR|licen)",
                        r"\bbusiness\s+restrictions?\b", r"\bbarred\b", r"\bdebarred\b", r"\bshow[- ]cause\b", r"\benforcement\b",
                        r"\bcease\s+and\s+desist\b", r"\bbanned\b")],
    "macro": [re.compile(r"\bGDP\b|\bCPI\b|\bWPI\b|\bPMI\b|\bIIP\b"),
              _rx(r"\binflation\b", r"\bmonsoon\b", r"\bfiscal\s+deficit\b", r"\bcurrent\s+account\b", r"\bcrude\b", r"\boil\s+prices?\b",
                  r"\brecession\b", r"\bjobs\s+data\b", r"\beconomy\b")],
    "housing-finance": [re.compile(r"\bHFCs?\b|\bNHB\b|\bLAP\b"),
                        _rx(r"\bhousing\s+financ", r"\bhome\s+loans?\b", r"\bmortgages?\b", r"\baffordable\s+housing\b")],
    "vehicle-finance": [_rx(r"\bvehicle\s+(?:financ|loans?)", r"\bauto\s+loans?\b", r"\btwo-wheelers?\b", r"\btractors?\b",
                            r"\bcommercial\s+vehicles?\b", r"\bused\s+vehicles?\b")],
    "policy": [re.compile(r"\bMPC\b"), _rx(r"\bmonetary\s+policy\b", r"\bpolicy\s+rate\b", r"\bUnion\s+Budget\b", r"\bscheme\b",
                                          r"\bconsultation\b", r"\bframework\b", r"\bregulatory\s+(?:change|reform)s?\b")],
}
TAG_MAPS = {"companies": TAG_COMPANIES, "regulators": TAG_REGULATORS, "topics": TAG_TOPICS}
TAG_LABELS = {
    "muthoot-fincorp": "Muthoot Fincorp", "muthoot-finance": "Muthoot Finance", "muthoot-microfin": "Muthoot Microfin",
    "manappuram": "Manappuram Finance", "bajaj-finance": "Bajaj Finance", "bajaj-housing-finance": "Bajaj Housing Finance",
    "shriram-finance": "Shriram Finance", "iifl-finance": "IIFL Finance", "lic-housing-finance": "LIC Housing Finance",
    "cholamandalam": "Cholamandalam Finance", "poonawalla-fincorp": "Poonawalla Fincorp", "l-and-t-finance": "L&T Finance",
    "hdb-financial": "HDB Financial Services", "tata-capital": "Tata Capital", "aditya-birla-capital": "Aditya Birla Capital",
    "piramal-finance": "Piramal Finance", "mahindra-finance": "Mahindra Finance", "pnb-housing-finance": "PNB Housing Finance", "equitas-sfb": "Equitas Small Finance Bank",
    "navi-finserv": "Navi Finserv", "sbi": "SBI", "hdfc-bank": "HDFC Bank",
    "icici-bank": "ICICI Bank", "axis-bank": "Axis Bank", "kotak-mahindra-bank": "Kotak Mahindra Bank",
    "rbi": "RBI", "sebi": "SEBI", "ibbi": "IBBI", "mca": "MCA", "nhb": "NHB", "irdai": "IRDAI", "govt": "Government",
    "gold-loan": "Gold loans", "ncd": "NCD", "rating": "Rating", "results": "Results", "circular": "Circular",
    "funding": "Funding", "rates": "Rates", "gold-price": "Gold price", "markets": "Markets", "asset-quality": "Asset quality",
    "microfinance": "Microfinance", "digital-lending": "Digital lending", "ipo": "IPO", "m-and-a": "M&A",
    "enforcement": "Enforcement", "macro": "Macro", "housing-finance": "Housing finance", "vehicle-finance": "Vehicle finance",
    "policy": "Policy",
}
_URL = re.compile(r"\(\s*https?://[^)\s]*\s*\)|<https?://[^>\s]*>|https?://\S+")
_IMPACT = re.compile(r"why it matters|possible impact on", re.I)
_SKIP_SECTIONS = re.compile(r"key numbers|source links|\bsources\b", re.I)
_NO_NEWS = re.compile(r"^(?:no significant developments|no new\b|nothing (?:new|has been)|more detail on)", re.I)
_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _plain(s: str) -> str:
    s = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = _URL.sub(" ", s)
    s = re.sub(r"[*_`>#|]+", " ", s)
    s = re.sub(r"^[^\w(₹$]+", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


def empty_tags() -> dict:
    return {k: [] for k in TAG_KEYS}


def derive_tags(text: str) -> dict:
    """Keyword-map tags for one story. URLs are stripped first so a link alone never adds a tag."""
    t = _URL.sub(" ", text or "")
    out = {}
    for key in TAG_KEYS:
        out[key] = sorted(slug for slug, pats in TAG_MAPS[key].items() if any(p.search(t) for p in pats))
    return out


def parse_override(line: str):
    m = TAG_COMMENT.match(line or "")
    if not m:
        return None
    ov = {}
    for part in m.group(1).split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k = k.strip().lower()
        if k in TAG_KEYS:
            ov[k] = sorted({x.strip().lower() for x in v.split(",") if _SLUG.match(x.strip().lower())})
    return ov


def strip_tag_comments(text: str) -> str:
    """Remove override comment lines (used by publish.py so they never reach data.js or the page)."""
    return "\n".join(l for l in (text or "").split("\n") if not TAG_COMMENT.match(l))


def _clip(s: str, n: int = 160) -> str:
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def _title_of(block: str) -> str:
    first = block.strip().split("\n", 1)[0]
    first = re.sub(r"^\s*(?:[-*]|\d+[.)])\s+", "", first)
    first = re.sub(r"^\s*\*\*\s*\d+\.\s+", "**", first)  # "**1. Title**" -> "**Title**"
    m = re.match(r"\s*\*\*(.+?)\*\*", first)
    if m and len(_plain(m.group(1))) >= 25:
        return _clip(_plain(m.group(1)))
    if first.lstrip().startswith("|"):
        cells = [c for c in (x.strip() for x in first.strip().strip("|").split("|")) if c]
        first = cells[0] if cells else first
    p = _plain(first)
    m = re.match(r"(.+?[.!?])(?:\s|$)", p)
    return _clip(m.group(1) if m and len(m.group(1)) > 20 else p)


def _units(report_key: str, text: str) -> list:
    """Split one report into story units at the granularity the app shows."""
    units, sec_head, cur, pending = [], None, None, []

    def start(kind, section, title, body_line):
        nonlocal cur
        cur = {"kind": kind, "section": section, "title": title, "lines": [body_line], "ov": list(pending)}
        pending.clear()
        units.append(cur)

    sec_lines = []
    sections = []
    for line in (text or "").split("\n"):
        if re.match(r"^##\s", line):
            sections.append((sec_head, sec_lines))
            sec_head, sec_lines = _plain(line[2:]), []
        else:
            sec_lines.append(line)
    sections.append((sec_head, sec_lines))

    for head, lines in sections:
        if head is None or _SKIP_SECTIONS.search(head):
            continue
        cur, pending[:] = None, []
        hl = head.lower()
        if report_key == "03-weekly-analysis":
            start("analysis", head, head, "")
            for l in lines:
                ov = parse_override(l)
                if ov is not None:
                    cur["ov"].append(ov)
                elif not re.match(r"^###\s", l):
                    cur["lines"].append(l)
            continue
        if report_key == "02-regulation" and "calendar" in hl:
            kind = "calendar"
        elif report_key == "02-regulation" and ("new regulatory" in hl or "circular" in hl):
            kind = "circular"
        elif "urgent" in hl or "high impact" in hl:
            kind = "story"
        else:
            kind = "item"
        has_numbered = any(re.match(r"^\s*\*\*\d+\.\s", l) for l in lines)
        has_sub = any(re.match(r"^###\s", l) for l in lines)
        gap, mode, skip, not_circ = True, ("num" if has_numbered else "rows"), False, False
        for l in lines:
            ov = parse_override(l)
            if ov is not None:
                (cur["ov"] if cur else pending).append(ov)
                continue
            s = l.strip()
            if not s or re.match(r"^-{3,}$", s):
                gap = True
                continue
            if re.match(r"^\|?\s*:?-{2,}:?\s*(\||$)", s):
                continue  # table separator row
            if mode == "num":
                if re.match(r"^\*\*\d+\.\s", s):
                    start(kind, head, _title_of(s), s)
                elif cur:
                    cur["lines"].append(s)
                gap = False
                continue
            if has_sub and re.match(r"^###\s", s):
                sub = _plain(s[3:])
                skip, gap = False, True
                if re.search(r"\bnot\b.*\bcircular", sub, re.I):
                    mode, cur, not_circ = "rows", None, True  # a list of market items, not one circular: one unit per row
                else:
                    mode = "sub"
                    start(kind, head, _clip(sub), s[3:])
                continue
            if mode == "sub":
                if cur:
                    cur["lines"].append(s)
                continue
            # rows mode: bullets, paragraphs and table rows, one unit each;
            # quote and sub-bullet lines belong to the unit above
            if re.match(r"^\W*(?:primary\s+)?sources\s+checked", s, re.I):
                skip, cur = True, None  # a checklist of sources, not stories
                continue
            if skip:
                continue
            new_item = bool(re.match(r"^(?:[-*]|\d+[.)]|\|)\s?", s))
            row_kind = "item" if (not_circ and kind == "circular") else kind
            if cur and (s.startswith(">") or re.match(r"^\s{2,}[-*]\s", l) or (not gap and not new_item)):
                cur["lines"].append(s)
            elif s.startswith("|") and re.match(r"^\|\s*(?:item|status|what|issuer|date|company|event)\b", s, re.I):
                pass  # table header row
            else:
                start(row_kind, head, _title_of(s), s)
            gap = False
    out = []
    for u in units:
        body = [l for l in u["lines"] if not _IMPACT.search(l) and not l.lstrip().startswith(">")]
        joined = "\n".join(body)
        plain = _plain(joined)
        if u["kind"] != "analysis" and (len(plain.split()) < 6 or _NO_NEWS.match(plain)):
            continue
        if u["kind"] == "analysis" and len(plain.split()) < 6:
            continue
        tags = derive_tags(u["title"] + "\n" + joined)
        if u["kind"] != "analysis":  # a company or topic named in the section heading applies to its items
            ht = derive_tags(re.sub(r"\bMFL\b", " ", u["section"]))  # "Deadlines for MFL" is relevance, not subject
            for k in ("companies", "topics"):
                tags[k] = sorted(set(tags[k]) | set(ht[k]))
        if u["kind"] == "circular" and "circular" not in tags["topics"] and tags["regulators"]:
            tags["topics"] = sorted(set(tags["topics"]) | {"circular"})
        for ov in u["ov"]:
            for k, v in ov.items():
                tags[k] = v
        out.append({"report": report_key, "section": u["section"], "kind": u["kind"], "title": u["title"], "tags": tags})
    return out


def _union(tag_list) -> dict:
    out = empty_tags()
    for t in tag_list:
        for k in TAG_KEYS:
            out[k] = sorted(set(out[k]) | set((t or {}).get(k, [])))
    return out


def labels_for(*tag_dicts) -> dict:
    used = sorted({s for t in tag_dicts for k in TAG_KEYS for s in (t or {}).get(k, [])})
    return {s: TAG_LABELS.get(s, s.replace("-", " ").title()) for s in used}


def tag_day(day: dict, raw_dir=None) -> dict:
    """Return a copy of `day` with story_tags, day-level tags and tag_labels added. On any error the day
    comes back unchanged (with a warning), so tagging can never break publishing."""
    try:
        out = dict(day)
        units = []
        for r in day.get("reports", []):
            if r.get("key") not in TAG_REPORTS or r.get("missing"):
                continue
            text = None
            if raw_dir is not None:  # raw file keeps override comments; same text as content otherwise
                p = Path(raw_dir) / f"{r['key']}.md"
                if p.exists():
                    text = p.read_text(encoding="utf-8")
            if text is None:
                text = r.get("content") or ""
            units.extend(_units(r["key"], text))
        for i, u in enumerate(units):
            u["n"] = i + 1
        out["story_tags"] = [{k: u[k] for k in ("n", "report", "section", "kind", "title", "tags")} for u in units]
        structured = []
        for key, fields in (("stories", ("title", "dek", "mfl_impact")), ("rules", ("issuer", "title", "ref")),
                            ("reg_calendar", ("issuer", "item", "applies_to"))):
            if isinstance(day.get(key), list):
                lst = []
                for s in day[key]:
                    if isinstance(s, dict):
                        s = dict(s)
                        txt = "\n".join(str(s.get(f) or "") for f in fields if f != "mfl_impact")
                        t = derive_tags(txt)
                        if key == "rules" and t["regulators"] and "circular" not in t["topics"]:
                            t["topics"] = sorted(set(t["topics"]) | {"circular"})
                        if isinstance(s.get("tags"), dict):  # explicit tags in the sidecar win, per key
                            for k in TAG_KEYS:
                                v = s["tags"].get(k)
                                if isinstance(v, list):
                                    t[k] = sorted({str(x).lower() for x in v if _SLUG.match(str(x).lower())})
                        s["tags"] = t
                        structured.append(t)
                    lst.append(s)
                out[key] = lst
        out["tags"] = _union([u["tags"] for u in units] + structured)
        out["tag_labels"] = labels_for(out["tags"])
        return out
    except Exception as exc:  # a tagging problem must never stop publishing
        print(f"export_json: tags skipped for {day.get('id')}: {exc}", file=sys.stderr)
        return day


ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SEED_FILE = "history.json"


def load_seed(site: Path) -> dict:
    """{key: {date: float|None}} from data/history.json; {} when absent or unreadable (never fatal)."""
    p = site / "data" / SEED_FILE
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("top level is not an object")
        out = {}
        for k, ser in raw.items():
            if k.startswith("_") or not isinstance(ser, dict):
                continue  # "_meta" and friends are notes for people, not figures
            out[k] = {d: _clean_num(v) for d, v in ser.items() if isinstance(d, str) and ISO.match(d)}
        return out
    except Exception as exc:  # a bad seed never stops publishing
        print(f"export_json: ignored {p}: {exc}", file=sys.stderr)
        return {}


def build_series(days: list, seed: dict, limit: int = SERIES_DAYS) -> dict:
    """Last `limit` dates up to the newest edition. Live editions win; seed fills only non-edition dates."""
    by_id = {d["id"]: d for d in days}
    newest = max(by_id)
    seed_dates = {dt for ser in seed.values() for dt in ser if dt < newest and dt not in by_id}
    dates = sorted(set(by_id) | seed_dates)[-limit:]
    keys = sorted({it["key"] for d in days for it in d["key_numbers"].get("items", [])} | set(seed))
    series = {}
    for k in keys:
        series[k] = {}
        for i in dates:
            if i in by_id:
                hit = [it for it in by_id[i]["key_numbers"].get("items", []) if it["key"] == k]
                series[k][i] = series_value(hit[0]) if hit else None
            else:
                series[k][i] = seed.get(k, {}).get(i)
    return series


def _index_entry(d: dict) -> dict:
    return {
        "id": d["id"], "label": d["label"], "weekday": d["weekday"], "is_monday": d["is_monday"],
        "due": d["due"], "filed": d["filed"], "core_found": d["key_numbers"].get("core_found", 0),
        **({"tags": d["tags"]} if isinstance(d.get("tags"), dict) else {}),
        "reports": [{"key": r["key"], "section": r.get("section"), "title": r.get("title"), "missing": r.get("missing"),
                     "expected": r.get("expected"), "words": r.get("words", 0), "sources": r.get("sources", 0)}
                    for r in d["reports"]],
    }


def export(site: Path) -> Path:
    payload = load_payload(site)
    days = sorted((public_day(d, _sidecar(site, d["id"])) for d in payload["days"]), key=lambda d: d["id"], reverse=True)
    days = [tag_day(d, site / "days" / d["id"]) for d in days]  # additive search tags; never fatal
    if not days:
        raise SystemExit("export_json: data.js has no days")
    data = site / "data"
    data.mkdir(exist_ok=True)
    for d in days:
        (data / f"{d['id']}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    seed = load_seed(site)
    series = build_series(days, seed)
    latest = {"schema": SCHEMA, "schema_version": SCHEMA_VERSION, "generated": payload["generated"],
              "latest": days[0]["id"], "days": [_index_entry(d) for d in days], "series": series, "today": days[0]}
    try:
        latest["tag_labels"] = labels_for(*(d.get("tags") for d in days))
    except Exception as exc:  # never fatal
        print(f"export_json: tag_labels skipped: {exc}", file=sys.stderr)
    seeded = sorted({dt for ser in series.values() for dt in ser} - {d["id"] for d in days})
    if seeded:  # tells the app a seed exists, so the data.js path fetches it and the JSON path need not
        latest["series_seed"] = {"file": f"data/{SEED_FILE}", "dates": len(seeded), "first": seeded[0], "last": seeded[-1]}
    (data / "latest.json").write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")
    print(f"export_json: {len(days)} day file(s) + data/latest.json ({SCHEMA} v{SCHEMA_VERSION})"
          + (f", series seeded with {len(seeded)} earlier date(s) from data/{SEED_FILE}" if seeded else ""))
    return data


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=str(Path(__file__).resolve().parent))
    export(Path(ap.parse_args().site))
