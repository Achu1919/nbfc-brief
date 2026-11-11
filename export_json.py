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
import datetime as _dt
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse as _urlparse

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
    # '>' is markdown only as a line-start blockquote marker; inside text it is a comparison ("> ₹5 lakh") and is kept.
    s = re.sub(r"(?m)^[ \t]*(?:>[ \t]?)+", "", s)
    s = re.sub(r"[*_`#|]+", " ", s)
    # leading punctuation goes, but a leading comparison or sign before a figure ("> ₹5 lakh", "−1.8%") stays
    s = re.sub(r"^(?:(?![<>≤≥−+]\s?[₹$\d])[^\w(₹$])+", "", s.strip())
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
    m = REG_COMMENT.match(line or "")
    if m:
        return {"_reg": _kv(m.group(1))}
    if NCD_COMMENT.match(line or ""):
        return {}  # day-level; read by parse_ncd
    m = EXT_COMMENT.match(line or "")
    if m:  # <!-- story: id=...; ... -->, <!-- stories: ids=a,b -->, <!-- peer: id=...; ... --> (content_upgrade.py)
        body = m.group(2).strip()
        kv = _kv(body)
        for flag in (x.strip().lower() for x in body.split(";") if x.strip() and "=" not in x):
            kv[flag] = True
        return {"_" + m.group(1).lower(): kv}
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
        elif k == "category":
            ov["_category"] = v.strip().lower()
    return ov


def strip_tag_comments(text: str) -> str:
    """Remove override comment lines (used by publish.py so they never reach data.js or the page)."""
    return "\n".join(l for l in (text or "").split("\n") if not ANY_COMMENT.match(l))


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
        for li, l in enumerate(lines):
            ov = parse_override(l)
            if ov is not None:
                nxt = next((x.strip() for x in lines[li + 1:] if x.strip() and parse_override(x) is None), "")
                # rows mode: a comment between two list rows/table rows belongs to the NEXT row (the convention
                # the editions use: `<!-- reg: ... -->` on the line above `- 6 Nov 2026: SEBI ...`)
                to_next = mode == "rows" and bool(re.match(r"^(?:[-*]|\d+[.)]|\|)\s?", nxt)) and not re.match(r"^###\s", nxt)
                (cur["ov"] if (cur and not to_next) else pending).append(ov)
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
            if cur and (s.startswith(">") or re.match(r"^\s{2,}[-*]\s", l) or (not gap and not new_item)
                        or not _plain(_BRACKET_TAGS.sub("", s.replace("*", "")))):
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
        card = {}
        for ov in u["ov"]:
            for k, v in ov.items():
                if k in TAG_KEYS:
                    tags[k] = v
                elif k == "_category":
                    card["category"] = v
        out.append({"report": report_key, "section": u["section"], "kind": u["kind"], "title": u["title"], "tags": tags,
                    "_lines": u["lines"], "_reg": [ov["_reg"] for ov in u["ov"] if "_reg" in ov], "_card": card,
                    "_ext": [ov for ov in u["ov"] if any(k in ov for k in ("_story", "_stories", "_peer"))]})
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


# ---- cards, reg, latest_circulars, deadlines, mfl_ncd, lessons (docs/DATA_FORMAT.md "Cards"); additive, never fatal ----
REG_COMMENT = re.compile(r"^\s*<!--\s*reg:(.*?)-->\s*$", re.I)
NCD_COMMENT = re.compile(r"^\s*<!--\s*ncd:(.*?)-->\s*$", re.I)
ANY_COMMENT = re.compile(r"^\s*<!--\s*(?:tags|reg|ncd|story|stories|peer)\s*:.*-->\s*$", re.I)
EXT_COMMENT = re.compile(r"^\s*<!--\s*(story|stories|peer)\s*:(.*?)-->\s*$", re.I)  # content upgrade (content_upgrade.py)
_DEEP_LINE = re.compile(r"^\W*(?:mfl view|deeper impact|blind spots?\s*\(private\)|mfl comparison)\b", re.I)
CIRCULAR_SEED = "circulars_seed.json"
CIRCULAR_WINDOW = 10  # days, newest edition inclusive
DEADLINE_PAST = 30  # drop deadlines more than this many days before the newest edition
REPORT_SHORT = {"01-daily-watch": "news", "02-regulation": "rules", "03-weekly-analysis": "weekly"}
CATEGORIES = ("regulation", "muthoot-fincorp", "peers", "gold", "markets", "results", "ratings", "deals",
              "asset-quality", "teaching")
REG_STATUS = ("new", "draft", "in-force", "deadline")
SOURCE_NAMES = (
    ("rbi.org.in", "RBI"), ("sebi.gov.in", "SEBI"), ("ibbi.gov.in", "IBBI"), ("nhb.org.in", "NHB"),
    ("fiuindia.gov.in", "FIU-IND"), ("mca.gov.in", "MCA"), ("egazette.gov.in", "e-Gazette"), ("nclt.gov.in", "NCLT"),
    ("pib.gov.in", "PIB"), ("finmin.nic.in", "Ministry of Finance"), ("irdai.gov.in", "IRDAI"),
    ("nseindia.com", "NSE"), ("nsearchives.nseindia.com", "NSE"), ("bseindia.com", "BSE"),
    ("bfsi.economictimes.indiatimes.com", "ETBFSI"), ("economictimes.indiatimes.com", "Economic Times"),
    ("m.economictimes.com", "Economic Times"), ("thehindubusinessline.com", "BusinessLine"), ("thehindu.com", "The Hindu"),
    ("livemint.com", "Mint"), ("business-standard.com", "Business Standard"), ("moneycontrol.com", "Moneycontrol"),
    ("cnbctv18.com", "CNBC-TV18"), ("financialexpress.com", "Financial Express"), ("ndtvprofit.com", "NDTV Profit"),
    ("reuters.com", "Reuters"), ("bloomberg.com", "Bloomberg"), ("businesstoday.in", "Business Today"),
    ("hindustantimes.com", "Hindustan Times"), ("timesofindia.indiatimes.com", "Times of India"),
    ("newindianexpress.com", "New Indian Express"), ("indianexpress.com", "Indian Express"),
    ("deccanherald.com", "Deccan Herald"), ("zeebiz.com", "Zee Business"), ("outlookbusiness.com", "Outlook Business"),
    ("chittorgarh.com", "Chittorgarh"), ("groww.in", "Groww"), ("nuvama.com", "Nuvama"),
    ("crisilratings.com", "CRISIL Ratings"), ("crisil.com", "CRISIL"), ("icra.in", "ICRA"), ("icra.co.in", "ICRA"),
    ("careratings.com", "CARE Ratings"), ("careedge.in", "CareEdge"), ("indiaratings.co.in", "India Ratings"),
    ("brickworkratings.com", "Brickwork Ratings"), ("acuite.in", "Acuité"), ("ibjarates.com", "IBJA"),
    ("ibja.co", "IBJA"), ("agloc.org", "AGLOC"), ("gold.org", "World Gold Council"), ("fbil.org.in", "FBIL"),
    ("ccilindia.com", "CCIL"), ("muthootfincorp.com", "Muthoot Fincorp"), ("muthootfinance.com", "Muthoot Finance"),
    ("tradingeconomics.com", "Trading Economics"), ("investing.com", "Investing.com"), ("goodreturns.in", "Goodreturns"),
    ("screener.in", "Screener"), ("trendlyne.com", "Trendlyne"), ("fidcindia.org.in", "FIDC"),
    ("sa-dhan.net", "Sa-Dhan"), ("mfinindia.org", "MFIN"), ("cibil.com", "TransUnion CIBIL"),
)
EXCLUDED_HOSTS = ("exa.ai", "stockfin.ai", "trackliveprice.com", "makro.live", "stockwatch.live")
OFFICIAL_HOSTS = ("rbi.org.in", "sebi.gov.in", "ibbi.gov.in", "nhb.org.in", "fiuindia.gov.in", "mca.gov.in",
                  "egazette.gov.in", "nclt.gov.in")
_LINK = re.compile(r"\[([^\]]*)\]\((https?://[^)\s]+)\)|<(https?://[^>\s]+)>|(https?://[^\s)|>\]]+)")
_BRACKET_TAGS = re.compile(r"\[(?:NEW|NEW_REG|CIRCULAR|DRAFT|ENFORCEMENT|CONTEXT|DEADLINE|IN[- ]FORCE|EFFECTIVE:[^\]]*)\]\s*", re.I)
_ABBR = re.compile(r"(?:\b(?:Rs|No|Nos|vs|Ltd|Co|Pvt|Dr|Mr|Ms|Mrs|St|approx|cf|para|paras|Sr|Jr|Inc|Govt|Dept|Fig|Sec|Cl|Reg|Art|viz|cr|bn|mn|Rev|Ch|Vol|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)|\be\.g|\bi\.e|\b[A-Z])\.$")
_MON = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
_DMY = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?\b"
                  r"|\b(\d{4})-(\d{2})-(\d{2})\b", re.I)
_REF_RX = (
    ("RBI", re.compile(r"\bRBI/(?:[A-Za-z]+/)?\d{4}-\d{2}/\d+")),
    ("RBI", re.compile(r"\b(?:DoR|DOR|DoS|DOS|DPSS|CO\.DPSS|FIDD|DCM|FMRD|FED|DNBR|DNBS|DGBA|DoRA|DOC|DoC|CEPD|FMOD|IDMD)"
                       r"\.[A-Za-z0-9.()]+(?:\s?No\.?\s?\d+)?(?:/[\w.()-]+)*/\d{4}-\d{2}\b")),
    ("SEBI", re.compile(r"\bSEBI/HO/[\w()./-]*\d")),
    ("SEBI", re.compile(r"\bHO/[\w()./-]*?\d{4}-[A-Z][\w()./-]*\d")),
    ("IBBI", re.compile(r"\bIBBI/(?:[A-Z]+/\d+/\d{4}|\d{4}-\d{2}/GN/REG\d+)\b")),
    ("NHB", re.compile(r"\bNHB/[A-Za-z]+[\w./()-]*\d")),
    ("FIU-IND", re.compile(r"\bF\.\s?No\.?\s?[\w./-]*FIU[\w./-]*\d")),
)
_APPLIES = (
    ("banks", r"\b(?:commercial |scheduled )?banks\b"), ("nbfcs", r"\bNBFCs?\b(?!-MFI)|non-banking financial compan"), ("hfcs", r"\bHFCs?\b|housing finance compan"),
    ("arcs", r"\bARCs?\b|asset reconstruction"), ("aifis", r"\bAIFIs?\b|all india financial institutions"),
    ("cooperative-banks", r"co-?operative banks|\bUCBs?\b|\bStCBs?\b|\bDCCBs?\b"), ("sfbs", r"small finance banks?|\bSFBs?\b"),
    ("payment-banks", r"payments? banks?"), ("rrbs", r"regional rural banks?|\bRRBs?\b"), ("nbfc-mfis", r"\bNBFC-MFIs?\b|microfinance institutions"),
    ("cics", r"\bCICs?\b|core investment compan"), ("debt-issuers", r"issuers? of (?:listed )?(?:debt|non-convertible)|debt (?:securities )?issuers?"),
    ("listed-entities", r"listed entit"), ("intermediaries", r"intermediar"), ("debenture-trustees", r"debenture trustees?"),
    ("exchanges", r"(?:stock )?exchanges\b"), ("depositories", r"depositor(?:y|ies)\b(?! receipt)"), ("fpis", r"\bFPIs?\b|foreign portfolio"),
    ("mutual-funds", r"mutual funds?|\bAMCs?\b"), ("research-analysts", r"research analysts?"), ("investment-advisers", r"investment advis[eo]rs?"),
    ("insolvency-professionals", r"insolvency professionals?|resolution professionals?|\bIPAs?\b"),
    ("regulated-entities", r"regulated entities|\bREs\b"), ("reporting-entities", r"reporting entities"),
)
_APPLIES = tuple((k, re.compile(p, re.I)) for k, p in _APPLIES)
_SCOPE = re.compile(r"\b(?:addressed to|applies to|applicable to|issued to|directed to|meant for|for all)\b([^.;\n]{3,200})", re.I)
_SEC_CATS = (
    (re.compile(r"teach|lesson|quiz|curriculum|refresher", re.I), "teaching"),
    (re.compile(r"muthoot fincorp|\bMFL\b", re.I), "muthoot-fincorp"),
    (re.compile(r"gold and ltv|gold price", re.I), "gold"),
    (re.compile(r"financial results|\bresults\b|earnings", re.I), "results"),
    (re.compile(r"credit rating|\bratings?\b", re.I), "ratings"),
    (re.compile(r"\bdeals?\b|m&a|fund-?rais|capital rais", re.I), "deals"),
    (re.compile(r"\bnpa\b|asset quality", re.I), "asset-quality"),
    (re.compile(r"\bmarket|\bstock|industry trends|credit data|sector(?:al)? (?:lending|credit)|\bmacro|\becono|commodit", re.I), "markets"),
    (re.compile(r"\brbi\b|regulat|\bsebi\b|circular|calendar|deadline", re.I), "regulation"),
)


def _kv(body: str) -> dict:
    out = {}
    for part in (body or "").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip().lower().replace("-", "_")] = v.strip()
    return out


def _iso_or_none(v):
    v = (v or "").strip()
    return v if ISO_DATE.match(v) else None


def _ed(edition: str):
    return _dt.date.fromisoformat(edition)


def _mkdate(d, m, y, edition, forward=False):
    try:
        if y:
            return _dt.date(int(y), m, int(d)).isoformat()
        ed = _ed(edition)
        c = _dt.date(ed.year, m, int(d))
        if forward and c < ed - _dt.timedelta(days=180):
            c = _dt.date(ed.year + 1, m, int(d))
        elif not forward and c > ed + _dt.timedelta(days=45):
            c = _dt.date(ed.year - 1, m, int(d))
        return c.isoformat()
    except (ValueError, TypeError):
        return None


def _dates(text: str, edition: str, forward=False) -> list:
    """[(pos, iso)] for every '5 Nov', '5 Nov 2026' or ISO date in the text; a missing year comes from the edition."""
    out = []
    for m in _DMY.finditer(text or ""):
        if m.group(4):
            iso = _iso_or_none(m.group(0))
        else:
            iso = _mkdate(m.group(1), _MON[m.group(2).lower()[:3]], m.group(3), edition, forward)
        if iso:
            out.append((m.start(), iso))
    return out


def _excluded(url: str) -> bool:
    h = _host(url)
    return any(h == d or h.endswith("." + d) or h.startswith(d.split(".")[0] + ".") for d in EXCLUDED_HOSTS)


def _links(text: str) -> list:
    out = []
    for m in _LINK.finditer(text or ""):
        url = (m.group(2) or m.group(3) or m.group(4) or "").rstrip(".,;:")
        if url and not _excluded(url):
            out.append(((m.group(1) or "").strip(), url))
    return out


def _host(url: str) -> str:
    try:
        h = (_urlparse(url).hostname or "").lower()
    except ValueError:
        return ""
    return h[4:] if h.startswith("www.") else h


def source_name(url: str, text: str = "") -> str:
    h = _host(url)
    for dom, name in SOURCE_NAMES:
        if h == dom or h.endswith("." + dom):
            return name
    t = _plain(text or "")
    return t if t and not t.lower().startswith("http") and len(t) <= 40 else h


def _is_official(url: str) -> bool:
    h = _host(url)
    return any(h == d or h.endswith("." + d) for d in OFFICIAL_HOSTS)


def _source(lines: list):
    body = [l for l in lines if not _IMPACT.search(l)]
    for group in (body, lines):
        for text, url in _links("\n".join(group)):
            return {"name": source_name(url, text), "url": url}
    return None


def _sentences(text: str, n: int = 2) -> str:
    parts = re.split(r"(?<=[.!?])\s+(?=[\"“'(₹$A-Z0-9])", text or "")
    out, buf = [], ""
    for p in parts:
        buf = f"{buf} {p}".strip() if buf else p
        if _ABBR.search(buf):
            continue
        out.append(buf)
        buf = ""
        if len(out) >= n:
            break
    if buf and len(out) < n:
        out.append(buf)
    return " ".join(out).strip()


def _clean_title(t: str) -> str:
    t = re.sub(r"^\s*(?:\d{1,2}[.)]\s+)?(?:NEW|NEW_REG|CIRCULAR|DRAFT|ENFORCEMENT|CONTEXT|DEADLINE|IN[- ]FORCE)\]\s*", "", t or "", flags=re.I)
    c = re.sub(r"^\d{1,2}[.)]\s+", "", _BRACKET_TAGS.sub("", t).strip(" :—–-"))
    return re.sub(r"\s{2,}", " ", c).strip(" :—–-") or (t or "")


def _card_summary(u: dict):
    body = [l for l in u["_lines"] if l.strip() and not _IMPACT.search(l) and not l.lstrip().startswith(">")
            and not ANY_COMMENT.match(l) and not _DEEP_LINE.match(l)]
    if not body:
        return None
    first, rest = body[0], body[1:]
    title = u["title"].rstrip("…").strip()
    if first.lstrip().startswith("|"):
        cells = [c.strip() for c in first.strip().strip("|").split("|")]
        lead = _plain(cells[0]) if cells else ""
        others = [_plain(c) for c in cells[1:] if _plain(c)]
        text = lead
        if title and lead.startswith(title) and len(lead) > len(title) + 15:
            text = lead[len(title):].lstrip(" .:—–-")
        elif title and lead.startswith(title):
            text = ""
        text = " ".join(x for x in [text.rstrip(".") + "." if text else "", "; ".join(others)] if x)
    else:
        m = re.match(r"^\s*(?:[-*]|\d+[.)])?\s*\*\*(.+?)\*\*", first)
        if _plain(first).rstrip("…") == title or _plain(first) == title:
            first = ""
        elif m and _clip(_plain(re.sub(r"^\s*\d+\.\s+", "", m.group(1)))).rstrip("…").strip() == title and len(_plain(m.group(1))) >= 25:
            first = first[m.end():]
        text = _plain("\n".join([first] + rest))
    text = _BRACKET_TAGS.sub("", _plain(text)).strip(" :—–-")
    if title and text.startswith(title) and len(text[len(title):].split()) >= 6:
        text = text[len(title):].strip(" :—–-")
    if not text:
        return None
    return _clip(_sentences(text, 2), 480) or None


def _card_impact(u: dict):
    for l in u["_lines"]:
        if _IMPACT.search(l):
            p = _plain(l)
            p = re.sub(r"^.*?(?:why it matters|possible impact on)[^:]*:\s*", "", p, flags=re.I).strip()
            if p:
                return _clip(p, 480)
    return None


_MACRO_TITLE = re.compile(r"\b(?:oil|brent|crude|rupee|sensex|nifty|commodit\w*|FIIs?|FPIs?|forex|FX swap|inflation|CPI|WPI|GDP|"
                          r"macro|bond yields?|G-?secs?|midterms?|outflows?|inflows?|crash(?:es|ed)?\s+\d+(?:\.\d+)?%)", re.I)
_REG_TITLE = re.compile(r"\b(?:asks? RBI|circulars?|directions?|guidelines?|draft|consultation|framework|norms?|deadline)\b", re.I)
_REG_TOPICS = {"circular", "enforcement", "policy"}


def _cat_from_tags(t: dict, title: str) -> str:
    c, tp, rg = set(t["companies"]), set(t["topics"]), set(t["regulators"])
    if "muthoot-fincorp" in c and re.search(r"muthoot fincorp|\bMFL\b", title or "", re.I):
        return "muthoot-fincorp"
    if rg and tp & {"circular", "enforcement", "policy"}:
        return "regulation"
    for topic, cat in (("results", "results"), ("rating", "ratings"), ("m-and-a", "deals"), ("ipo", "deals"),
                       ("asset-quality", "asset-quality"), ("gold-price", "gold")):
        if topic in tp:
            return cat
    if c - {"muthoot-fincorp"}:
        return "peers"
    if "gold-loan" in tp:
        return "gold"
    if "muthoot-fincorp" in c:
        return "muthoot-fincorp"
    if rg and _MACRO_TITLE.search(title or "") and not _REG_TITLE.search(title or "") and not tp & _REG_TOPICS:
        return "markets"  # macro / commodity / market story that merely mentions a regulator (e.g. oil, rupee, FII flows)
    if rg:
        return "regulation"
    return "markets"


def _category(u: dict, private: bool) -> str:
    over = (u.get("_card") or {}).get("category")
    if over in CATEGORIES and (private or over != "teaching"):
        return over
    sec = u["section"] or ""
    if u["report"] == "02-regulation":
        if _SEC_CATS[0][0].search(sec):
            return "teaching" if private else "regulation"
        return "regulation"
    if u["report"] == "01-daily-watch" and not re.search(r"urgent|high impact|headline", sec, re.I):
        for rx, cat in _SEC_CATS:
            if rx.search(sec):
                if cat == "teaching" and not private:
                    break
                return cat
    return _cat_from_tags(u["tags"], u["title"])


def _find_ref(text: str):
    """(regulator, ref_no, end_pos) for the first reference number in the text, else (None, None, None)."""
    best = None
    for reg, rx in _REF_RX:
        m = rx.search(text or "")
        if m and (best is None or m.start() < best[2].start()):
            best = (reg, m.group(0).rstrip(".,;:)"), m)
    if not best:
        return None, None, None
    reg, ref, m = best
    if ref.startswith("RBI/"):  # RBI prints both numbers on a circular: RBI/2026-27/303 + DoR.AML.REC.255/...
        m2 = _REF_RX[1][1].search(text, m.end(), m.end() + 60)
        if m2:
            return reg, f"{ref} {m2.group(0)}", m2.end()
    return reg, ref, m.end()


def _applies(text: str):
    text = _plain(text or "")
    m = _SCOPE.search(text)
    span = m.group(1) if m else ""
    lead = re.match(r"^\s*\W*(?:\[[^\]]*\]\s*)*\**\s*([A-Za-z ,&-]{4,60}?)\s+[–—-]\s", text[:120])
    if lead:
        span += " " + lead.group(1)
    found = [k for k, rx in _APPLIES if rx.search(span)]
    if "nbfc-mfis" in found and "nbfcs" in found and not re.search(r"\bNBFCs\b", span):
        found.remove("nbfcs")
    return found or None


def parse_reg(u: dict, edition: str):
    raw = "\n".join(l for l in u["_lines"] if not ANY_COMMENT.match(l))
    text = _URL.sub(" ", raw)
    regulator, ref, end = _find_ref(text)
    tags = u["tags"]
    if not regulator and tags["regulators"]:
        order = ("rbi", "sebi", "ibbi", "nhb", "mca", "irdai", "govt")
        regulator = sorted(tags["regulators"], key=lambda r: order.index(r) if r in order else 99)[0].upper()
    official = [url for _, url in _links(raw) if _is_official(url)]
    url = official[0] if official else None
    if not regulator and url:
        regulator = source_name(url)
    issued = None
    lead = re.match(r"^\s*(?:[-*]\s+)?\**\s*(\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4})\s*\**\s*:", text)
    if lead:  # "- 27 Oct 2026: SEBI HO/...: ..." (Latest circulars row): the leading date is the issue date
        ld = _dates(lead.group(1), edition)
        issued = ld[0][1] if ld and ld[0][1] <= edition else None
    if ref and not issued:
        near = [iso for pos, iso in _dates(text[end:end + 90], edition) if iso <= edition]
        issued = near[0] if near else None
    if not issued:
        m = re.search(r"\b(?:issued|dated|released|notified)\s+(?:on\s+)?", text, re.I)
        if m:
            near = _dates(text[m.end():m.end() + 30], edition)
            issued = near[0][1] if near else None
    if not issued:
        t0 = u["_lines"][0] if u["_lines"] else ""
        m = re.search(r"\(([^)]{3,40})\)", t0)
        near = _dates(m.group(1), edition) if m else []
        issued = near[0][1] if near else None
    effective = None
    m = re.search(r"\[EFFECTIVE:\s*(\d{4}-\d{2}-\d{2})\]", raw, re.I)
    if m:
        effective = m.group(1)
    else:
        m = re.search(r"\b(?:effective|in force|comes into force|applies)\s+(?:from|on|by)\s+", text, re.I)
        if m:
            near = _dates(text[m.end():m.end() + 30], edition, forward=True)
            effective = near[0][1] if near else None
    status = None
    if re.search(r"\[DRAFT\]|\bdraft\b|consultation paper", raw, re.I) and not re.search(r"\[NEW\]", raw):
        status = "draft"
    elif re.search(r"\[DEADLINE\]", raw, re.I):
        status = "deadline"
    elif re.search(r"\[NEW\]|\[NEW_REG\]", raw):
        status = "new"
    elif effective and effective <= edition:
        status = "in-force"
    elif effective and effective > edition:
        status = "deadline"
    elif issued and (_ed(edition) - _ed(issued)).days <= 3:
        status = "new"
    reg = {"ref_no": ref, "regulator": regulator, "applies_to": _applies(text), "issued": issued,
           "effective": effective, "status": status, "url": url}
    for ov in u.get("_reg") or []:  # <!-- reg: ... --> wins, field by field
        if "ref" in ov or "ref_no" in ov:
            reg["ref_no"] = (ov.get("ref") or ov.get("ref_no") or "").strip() or None
        if "regulator" in ov:
            reg["regulator"] = ov["regulator"].strip() or None
        if "applies" in ov or "applies_to" in ov:
            v = ov.get("applies") or ov.get("applies_to") or ""
            reg["applies_to"] = [x.strip().lower() for x in v.split(",") if x.strip()] or None
        for k in ("issued", "effective"):
            if k in ov:
                reg[k] = _iso_or_none(ov[k])
        if "status" in ov:
            reg["status"] = ov["status"].strip().lower() if ov["status"].strip().lower() in REG_STATUS else None
        if "url" in ov:
            reg["url"] = ov["url"].strip() or None
    return reg


def _wants_reg(u: dict) -> bool:
    if u["report"] != "02-regulation" or u["kind"] == "calendar":
        return False
    if u.get("_reg"):
        return True
    raw = "\n".join(u["_lines"])
    _, ref0, _ = _find_ref(_URL.sub(" ", raw))
    if u["kind"] == "circular":
        return bool(ref0) or any(_is_official(url) and not re.search(r"Display\.aspx$|NotificationUser\.aspx$|/circulars/?$|HomeAction", url)
                                 for _, url in _links(raw))
    if not re.search(r"new regulatory|circular|regulatory updates|what landed", u["section"] or "", re.I):
        return False
    _, ref, _ = _find_ref(_URL.sub(" ", raw))
    return bool(ref) and any(_is_official(url) for _, url in _links(raw))


def build_cards(units: list, edition: str, private: bool) -> list:
    cards = []
    for u in units:
        title = _clean_title(u["title"])
        if not title.strip():
            continue  # e.g. a table header row; story_tags keeps it, cards do not
        c = {"id": f"{edition}-{REPORT_SHORT.get(u['report'], u['report'])}-{u['n']}", "n": u["n"], "date": edition,
             "report": REPORT_SHORT.get(u["report"], u["report"]), "section": u["section"], "kind": u["kind"],
             "category": _category(u, private), "title": title, "summary": _card_summary(u),
             "impact": _card_impact(u), "source": _source(u["_lines"]), "tags": u["tags"]}
        if _wants_reg(u):
            c["reg"] = parse_reg(u, edition)
            for ov in u.get("_reg") or []:
                if (ov.get("title") or "").strip():
                    c["title"] = ov["title"].strip()
        c["_u"] = u  # read by content_upgrade.apply(), popped before any file is written
        cards.append(c)
    return cards


# ---- lessons (private edition only) ----
_TEACH_HEAD = re.compile(r"^##\s+.*\b(?:teaching|lesson|refresher|curriculum)\b", re.I)
_QUIZ_MARK = re.compile(r"^\s*(?:#{2,4}\s*)?\W*\**\s*quiz(?:\s+yourself)?\b", re.I)
_WEEKDAYS = r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)"


def _split_answer(a: str):
    a = a.strip()
    m = re.match(r"^(.{1,60}?)\s+[—–-]\s+(.+)$", a)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    m = re.match(r"^(.+?[.!?])\s+(.+)$", a)
    if m and len(m.group(1)) <= 160:
        return m.group(1).strip(), m.group(2).strip()
    return a, None


_QNUM = re.compile(r"^(?:(\d+)[.)]\s+|\**\s*Q\s*(\d+)\s*[:.)]\s*\**\s*:?\s*)(.+)$", re.I)
_QLABEL = re.compile(r"^\**\s*(?:Q\d*|Question)\s*[:.]\s*\**\s*:?\s*", re.I)
_ALABEL = re.compile(r"^[*_]*\(?\s*\**\s*(?:A|Ans|Answers?)\s*\**\s*[:.\u2014\u2013-]\s*\**\s*", re.I)
_OPT = re.compile(r"(?:^|\s)[-*]?\s*\(?([a-dA-D])\)\s+")


def _unwrap(s: str) -> str:
    """Strip one layer of italic/bold/paren wrapping: '*(text)*' -> 'text'."""
    s = s.strip()
    for _ in range(3):
        m = re.match(r"^(\*{1,2}|_)(.+)\1$", s)
        if m:
            s = m.group(2).strip()
            continue
        m = re.match(r"^\((.+)\)$", s)
        if not m:
            break
        s = m.group(1).strip()
    return s


def _options(s: str):
    """['opt a', 'opt b', ...] for 'a) x  b) y' / '- (a) x' lines, else None."""
    if not re.match(r"^(?:[-*]\s*)?\(?[a-dA-D]\)\s+\S", s) and not re.match(r"^(?:[-*]\s*)?[a-dA-D][.]\s+\S", s):
        return None
    parts = re.split(r"(?:^|\s)(?:[-*]\s*)?\(?[a-dA-D][).]\s+", s)
    return [_plain(p).strip() for p in parts if p.strip()]


def _parse_quiz(lines: list) -> list:
    """Quiz items after a 'Quiz yourself' mark. Answers are read from: an italic next line ('*answer*' or
    '*Answer: ...*'), an '**A:**' / '**Answer:**' line, an inline '*(answer)*' or bold-led '**No.** why' after the
    question mark, a closing '*(Answers: (1) ... (2) ...)*' paragraph, or a numbered list in an Answers block."""
    quiz, answers, in_ans, last = [], {}, False, None

    def take(q, raw):
        raw = _ALABEL.sub("", _unwrap(raw)).strip()
        if raw and q is not None and not q["answer"]:
            q["answer"] = raw

    for l in lines:
        s = l.strip()
        if not s:
            continue
        if (re.match(r"^#{2,4}\s", s) or re.match(r"^-{3,}$", s)) and quiz:
            break
        if re.search(r"<summary>", s, re.I) or re.match(r"^[#*_\s]*answers?[*_\s]*:?[*_\s]*$", s, re.I):
            in_ans = True
            continue
        if s.startswith("</details"):
            in_ans = False
            continue
        if s.startswith("<details"):
            continue
        s = re.sub(r"^[-*]\s+(?=\*\*)", "", s)  # '- **Answer:** ...'
        body = _unwrap(s)
        mb = re.match(r"^\s*\**\s*Answers?\s*(?:\([^)]{0,40}\))?\s*\**\s*[:.\u2014\u2013-]\s*\**\s*(.+)$", body, re.I)
        if mb and re.search(r"(?:^|\s)\(1\)\s", mb.group(1)):
            parts = re.split(r"(?:^|\s)\((\d+)\)\s+", mb.group(1))
            for k in range(1, len(parts) - 1, 2):
                answers[int(parts[k])] = parts[k + 1].strip()
            continue
        m = _QNUM.match(s)
        if m and in_ans:
            answers[int(m.group(1) or m.group(2))] = _ALABEL.sub("", m.group(3)).strip()
            continue
        if in_ans and last is not None and not answers:  # <details><summary>Answer</summary> text </details> per question
            take(last, s)
            continue
        if m:
            raw = _QLABEL.sub("", m.group(3)).strip()
            ans = None
            mi = re.match(r"^(.*\?)(\**)\s+((?:\*|_|\().+)$", raw)
            if mi:
                rest = mi.group(3).strip()
                q = mi.group(1) + mi.group(2)
                mbold = re.match(r"^\*\*(.+?)\*\*\s*(.*)$", rest)
                if mbold and re.match(r"^[a-z,;(]", mbold.group(2).strip()):  # '**It is a restructuring** of the ...'
                    ans = (mbold.group(1).strip() + " " + mbold.group(2).strip(), None)
                elif mbold:
                    ans = (mbold.group(1).strip(), mbold.group(2).strip() or None)
                else:
                    ans = (_ALABEL.sub("", _unwrap(rest)).strip(), None)
                raw = q
            last = {"q": _plain(raw).strip(), "options": [], "answer": None, "explain": None,
                    "_k": int(m.group(1) or m.group(2)), "_pair": ans}
            quiz.append(last)
            continue
        if last is None or in_ans:
            continue
        opts = _options(s)
        if opts:
            last["options"].extend(opts)
            continue
        if re.match(r"^\**\s*(?:A|Ans|Answer)\s*\**\s*[:.]", s, re.I) or re.match(r"^(\*|_)[^*].*\1$", s) \
                or re.match(r"^\*\(.+\)\*$", s):
            take(last, s)
            continue
    out = []
    for q in quiz:
        k, pair = q.pop("_k"), q.pop("_pair")
        if pair and pair[1]:
            ans, exp = _plain(pair[0]), _plain(pair[1])
        else:
            a = (pair[0] if pair else None) or q["answer"] or answers.get(k)
            ans, exp = _split_answer(_plain(a)) if a else (None, None)
        if ans and q["options"]:
            mo = re.match(r"^\(?([a-dA-D])\)?(?:[).:\s]|$)", ans)
            if mo and ord(mo.group(1).lower()) - 97 < len(q["options"]):
                rest = ans[mo.end():].strip()
                ans = q["options"][ord(mo.group(1).lower()) - 97]
                norm = lambda x: re.sub(r"\W+", " ", x).strip().lower()
                if rest and not (norm(ans).startswith(norm(rest)) or norm(rest).startswith(norm(ans))):
                    exp = (rest + (" " + exp if exp else "")).strip()
        tidy = lambda x: re.sub(r"\s+([.,;:])", r"\1", x).strip() if x else None
        q["answer"] = tidy(ans)
        q["explain"] = tidy(exp) or None
        out.append(q)
    return out


def parse_lessons(text: str, edition: str) -> list:
    lines = (text or "").split("\n")
    out, i = [], 0
    while i < len(lines):
        if not _TEACH_HEAD.match(lines[i]):
            i += 1
            continue
        head = _plain(lines[i][2:])
        j = i + 1
        while j < len(lines) and not (re.match(r"^##\s", lines[j]) and not _QUIZ_MARK.match(lines[j][2:].strip())):
            j += 1
        block = lines[i + 1:j]
        i = j
        title = re.sub(r"^(?:\w+\s+)?(?:daily\s+)?(?:teaching|lesson)(?:\s+session)?\s*(?:[—–:-]\s*)?", "", head, flags=re.I).strip() or head
        module = None
        m = re.match(rf"^{_WEEKDAYS}\s+(?:refresher\s+)?\(?([^:()]+?)\)?\s*[:—–]\s*(.+)$", title)
        if m:
            module, title = m.group(1).strip(), m.group(2).strip()
        else:
            m = re.match(rf"^{_WEEKDAYS}\s+refresher\s*\(([^)]+)\)\s*[:—–-]?\s*(.*)$", title)
            if m:
                module, title = m.group(1).strip(), (m.group(2).strip() or title)
        body = "\n".join(block)
        n = None
        m = re.search(r"\bDay\s+\**(\d{1,3})\**\b", head + "\n" + body)
        if m:
            n = int(m.group(1))
        # summary: first prose paragraph (prefer the "What is it?" subsection)
        paras, cur_p, in_what = [], [], False
        for l in block:
            s = l.strip()
            if re.match(r"^#{3,4}\s", s):
                if cur_p:
                    paras.append((in_what, " ".join(cur_p)))
                    cur_p = []
                in_what = bool(re.search(r"what is it|what it is", s, re.I))
                continue
            if not s or s.startswith("|") or s.startswith(">") or _QUIZ_MARK.match(s) or s.startswith("<"):
                if cur_p:
                    paras.append((in_what, " ".join(cur_p)))
                    cur_p = []
                continue
            if re.match(r"^(?:[-*]|\d+[.)])\s", s) and not cur_p:
                continue
            cur_p.append(s)
        if cur_p:
            paras.append((in_what, " ".join(cur_p)))
        paras = [(w, p) for w, p in paras if len(_plain(p).split()) >= 8 and not re.match(r"^\W*day\s+\**\d", _plain(p), re.I)] or paras
        pick = next((p for w, p in paras if w), paras[0][1] if paras else "")
        summary = _clip(_sentences(_plain(pick), 2), 480) or None
        # quiz
        quiz, answers, qi = [], {}, None
        for k, l in enumerate(block):
            if _QUIZ_MARK.match(l.strip()):
                qi = k
                break
        if qi is not None:
            quiz = _parse_quiz(block[qi + 1:])
        srcs, seen = [], set()
        for t, url in _links(body):
            if url not in seen:
                seen.add(url)
                srcs.append({"name": source_name(url, t), "url": url})
        out.append({"date": edition, "n": n, "title": title, "module": module, "summary": summary,
                    "quiz": quiz, "sources": srcs})
    return out


# ---- Muthoot Fincorp Ltd NCD status (mfl_ncd). Muthoot Fincorp only, never Muthoot Finance; status facts only ----
_MFL_HEAD = re.compile(r"^#{2,3}\s+.*(?:muthoot fincorp|\bMFL\b)", re.I)
_RANGE = re.compile(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?\s*(?:[–—-]|to)\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:,?\s+(\d{4}))?")


def _ncd_size(val: str, prose: bool = False):
    """Issue size in ₹ cr from 'base + green shoe = total' wording; the shelf is never the issue size."""
    v = re.sub(r"(?:within|under|of)\s+the\s+₹\s?[\d,]+\s*(?:cr|crore)\s+shelf|\(?₹\s?[\d,]+\s*(?:cr|crore)\s+shelf\)?", " ", val, flags=re.I)
    num = lambda x: float(x.replace(",", ""))
    m = re.search(r"=\s*₹\s?([\d,]+(?:\.\d+)?)\s*(?:cr|crore)", v, re.I)
    if m:
        return num(m.group(1))
    b = re.search(r"₹\s?([\d,]+(?:\.\d+)?)\s*(?:cr|crore)\s+base", v, re.I)
    g = re.search(r"₹\s?([\d,]+(?:\.\d+)?)\s*(?:cr|crore)\s+green[- ]shoe", v, re.I)
    if b and g:
        return num(b.group(1)) + num(g.group(1))
    if prose:
        return None
    nums = [num(x) for x in re.findall(r"₹\s?([\d,]+(?:\.\d+)?)\s*(?:cr|crore)", v)]
    return max(nums) if nums else None


def parse_ncd(text: str, edition: str):
    """Returns (found, obj). found=False: no NCD lines and no override. obj=None with found=True: override 'none'."""
    lines = (text or "").split("\n")
    ov = None
    for l in lines:
        m = NCD_COMMENT.match(l)
        if m:
            body = m.group(1).strip()
            if body.lower() in ("none", "null", "-", ""):
                return True, None
            ov = _kv(body)
    rows, prose, in_mfl, in_story = [], [], False, False
    for l in lines:
        if re.match(r"^#{2,3}\s", l):
            in_mfl = bool(_MFL_HEAD.match(l)) and not re.search(r"muthoot finance\b", l, re.I)
            in_story = False
            continue
        if re.match(r"^\*\*\d+\.\s", l.strip()):  # bold story line under a mixed section: '**1. MFL's Tranche I NCD ...**'
            in_story = bool(re.search(r"muthoot fincorp|\bMFL\b", l, re.I)) and bool(re.search(r"\bNCDs?\b|tranche", l, re.I)) \
                and not re.search(r"muthoot finance\b", l, re.I)
            continue
        if in_story and not in_mfl and l.strip() and not l.strip().startswith(">"):
            if not re.search(r"muthoot finance\b", l, re.I):
                prose.append(l.strip())
            continue
        if not in_mfl or not re.search(r"\bNCDs?\b|tranche", l, re.I) or re.search(r"muthoot finance\b(?! ?corp)", l, re.I):
            continue
        s = l.strip()
        if s.startswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if len(cells) >= 2:
                rows.append(cells)
        elif s:
            prose.append(s)
    if not rows and not prose and ov is None:
        return False, None
    o = {"issue": None, "open": None, "close": None, "size_cr": None, "rating": None, "coupon_range": None,
         "bids": [], "status": None, "source": None}
    alltext = " ".join(" | ".join(r) for r in rows) + " " + " ".join(prose)
    m = re.search(r"\bTranche\s+([IVX]+|\d+)\b", alltext)
    if m:
        o["issue"] = f"Tranche {m.group(1)}"
    word = None
    for cells in rows:
        label, val = _plain(cells[0]).lower(), cells[1]
        asof = _iso_or_none(_plain(cells[2])) if len(cells) > 2 else None
        links = _links(" ".join(cells))
        if re.search(r"status", label):
            rm = _RANGE.search(_plain(val))
            if rm:
                y2 = rm.group(6) or rm.group(3)
                o["close"] = _mkdate(rm.group(4), _MON.get(rm.group(5).lower()[:3]), y2, edition, True)
                o["open"] = _mkdate(rm.group(1), _MON.get(rm.group(2).lower()[:3]), rm.group(3) or y2, edition, True)
            wm = re.match(r"^\W*(open|closed|upcoming|opens|closes|announced)", _plain(val), re.I)
            word = wm.group(1).lower() if wm else word
            if links:
                o["source"] = {"name": source_name(links[0][1], links[0][0]), "url": links[0][1]}
        elif re.search(r"subscri|bids?\b", label):
            bm = re.search(r"([\d.]+)\s*(?:×|x\b|times)", _plain(val))
            if bm:
                o["bids"].append({"date": asof or edition, "times_subscribed": float(bm.group(1))})
            if links and not o["source"]:
                o["source"] = {"name": source_name(links[0][1], links[0][0]), "url": links[0][1]}
        elif re.search(r"\bsize\b|green", label) and not re.search(r"minimum|\bmin\b|shelf", label):
            sz = _ncd_size(_plain(val))
            if sz is not None:
                o["size_cr"] = sz
        elif re.search(r"rating", label):
            o["rating"] = _plain(val) or None
        elif re.search(r"coupon", label):
            cm = re.search(r"\d+(?:\.\d+)?%\s*[–—-]\s*\d+(?:\.\d+)?%", val)
            o["coupon_range"] = cm.group(0) if cm else None
    ptxt = _plain(" ".join(prose))
    if not o["open"]:
        rm = _RANGE.search(ptxt) if re.search(r"\bopen", ptxt, re.I) else None
        if rm:
            y2 = rm.group(6) or rm.group(3)
            o["close"] = _mkdate(rm.group(4), _MON.get(rm.group(5).lower()[:3]), y2, edition, True)
            o["open"] = _mkdate(rm.group(1), _MON.get(rm.group(2).lower()[:3]), rm.group(3) or y2, edition, True)
    if o["size_cr"] is None:
        m = re.search(r"(?:including the green[- ]shoe[^₹]{0,40}|green[- ]shoe[^₹]{0,30}=\s*|total (?:issue )?size[^₹]{0,20}|"
                      r"issue size including[^.₹]{0,20}(?:₹\s?[\d,]+\s*(?:cr|crore)[^.₹]{0,40})?\bis\s+|full (?:issue|size) is\s+)"
                      r"₹\s?([\d,]+)\s*(?:cr|crore)", ptxt, re.I)
        if m:
            o["size_cr"] = float(m.group(1).replace(",", ""))
        else:
            o["size_cr"] = _ncd_size(ptxt, prose=True)
    if o["rating"] is None:
        m = re.search(r"\brated\s+([^.();,]{4,80})", ptxt)
        if m:
            o["rating"] = m.group(1).strip()
    if o["coupon_range"] is None:
        m = re.search(r"\bcoupons?\b[^.%]{0,30}?(\d+(?:\.\d+)?%\s*[–—-]\s*\d+(?:\.\d+)?%)", ptxt, re.I)
        if m:
            o["coupon_range"] = m.group(1)
    if o["size_cr"] is not None and float(o["size_cr"]).is_integer():
        o["size_cr"] = int(o["size_cr"])
    if not o["source"]:
        for t, url in _links(" ".join(prose)):
            o["source"] = {"name": source_name(url, t), "url": url}
            break
    if ov:
        for k in ("issue", "rating", "coupon_range"):
            if k in ov:
                o[k] = ov[k] or None
        for k in ("open", "close"):
            if k in ov:
                o[k] = _iso_or_none(ov[k])
        if "size_cr" in ov:
            try:
                o["size_cr"] = float(ov["size_cr"])
                o["size_cr"] = int(o["size_cr"]) if o["size_cr"].is_integer() else o["size_cr"]
            except ValueError:
                o["size_cr"] = None
        if "bids" in ov:  # bids=2026-10-30:1.86,2026-10-29:1.67
            o["bids"] = []
            for part in ov["bids"].split(","):
                if ":" in part:
                    d, x = part.split(":", 1)
                    try:
                        if _iso_or_none(d):
                            o["bids"].append({"date": d.strip(), "times_subscribed": float(x)})
                    except ValueError:
                        pass
        if "source" in ov and ov["source"].startswith("http"):
            o["source"] = {"name": source_name(ov["source"]), "url": ov["source"]}
        if "status" in ov:
            word = ov["status"].lower()
    st = None
    if word in ("closed", "closes") and o["close"] and o["close"] < edition:
        st = "closed"
    if o["open"] and o["close"]:
        st = "upcoming" if edition < o["open"] else ("closed" if edition > o["close"] else "open")
    if word in ("open", "closed", "upcoming") and (ov and "status" in ov):
        st = word
    elif st is None and word in ("open", "closed", "upcoming"):
        st = word
    o["status"] = st
    if not any(o[k] for k in ("issue", "open", "close", "size_cr", "bids", "rating")):
        return False, None
    return True, o


def _public_ncd(day_id: str):
    """mfl_ncd from the public edition's export of the same day (sourced from its markdown), or None.
    Looks in $NBFC_PUBLIC_DIR or ../nbfc-brief next to this repo; silently None when absent."""
    import os
    for base in (os.environ.get("NBFC_PUBLIC_DIR"), Path(__file__).resolve().parent.parent / "nbfc-brief"):
        if not base:
            continue
        p = Path(base) / "data" / f"{day_id}.json"
        if p.exists() and Path(base).resolve() != Path(__file__).resolve().parent:
            try:
                return json.loads(p.read_text(encoding="utf-8")).get("mfl_ncd")
            except (ValueError, OSError):
                return None
    return None


def ncd_days(days: list, raw_root, fallback=None) -> None:
    """Sets day['mfl_ncd'] on every day (in place), with bids accumulated across editions for the same issue.
    fallback(day_id) may return a sourced mfl_ncd (the public edition) to fill size_cr / rating / coupon_range
    that this edition's markdown leaves out, for the same issue only."""
    hist = {}
    for d in sorted(days, key=lambda x: x["id"]):
        try:
            text = ""
            p = Path(raw_root) / d["id"] / "01-daily-watch.md" if raw_root else None
            if p is not None and p.exists():
                text = p.read_text(encoding="utf-8")
            else:
                rep = next((r for r in d.get("reports") or [] if r.get("key") == "01-daily-watch"), None)
                text = (rep or {}).get("content") or ""
            found, o = parse_ncd(text, d["id"])
            if not found or o is None:
                d["mfl_ncd"] = None
                continue
            key = o["issue"] or "?"
            if fallback and any(o[k] is None for k in ("size_cr", "rating", "coupon_range")):
                pub = fallback(d["id"])
                if pub and pub.get("issue") == o["issue"]:
                    for k in ("size_cr", "rating", "coupon_range"):
                        if o[k] is None and pub.get(k) is not None:
                            o[k] = pub[k]
            book = hist.setdefault(key, {})
            for b in o["bids"]:
                book[b["date"]] = b["times_subscribed"]
            o["bids"] = [{"date": k, "times_subscribed": v} for k, v in sorted(book.items()) if k <= d["id"]]
            d["mfl_ncd"] = o
        except Exception as exc:  # never fatal
            print(f"export_json: mfl_ncd skipped for {d.get('id')}: {exc}", file=sys.stderr)
            d["mfl_ncd"] = None


def _raw_reports(day: dict, raw_dir) -> list:
    out = []
    for r in day.get("reports", []):
        if r.get("key") not in TAG_REPORTS or r.get("missing"):
            continue
        text = None
        if raw_dir is not None:
            p = Path(raw_dir) / f"{r['key']}.md"
            if p.exists():
                text = p.read_text(encoding="utf-8")
        out.append((r["key"], text if text is not None else (r.get("content") or "")))
    return out


def cards_day(day: dict, raw_dir=None, private: bool = False) -> dict:
    """Copy of the day with `cards` (and, private only, `lessons`). Same units and order as story_tags."""
    try:
        out = dict(day)
        units = []
        raws = _raw_reports(day, raw_dir)
        for key, text in raws:
            units.extend(_units(key, text))
        for i, u in enumerate(units):
            u["n"] = i + 1
        out["cards"] = build_cards(units, day["id"], private)
        if private:
            les = []
            for key, text in raws:
                if key == "02-regulation":
                    les.extend(parse_lessons(text, day["id"]))
            out["lessons"] = les
        return out
    except Exception as exc:  # never fatal
        print(f"export_json: cards skipped for {day.get('id')}: {exc}", file=sys.stderr)
        return day


def load_circular_seed(path) -> dict:
    try:
        j = json.loads(Path(path).read_text(encoding="utf-8"))
        return j if isinstance(j, dict) else {}
    except (OSError, ValueError):
        return {}


def _seed_card(s: dict, private: bool):
    url, ref = s.get("url"), s.get("ref_no")
    if not url or not ref or not _iso_or_none(s.get("issued")):
        return None  # every seed entry needs its official URL, ref no. and issue date
    title = s.get("title") or ref
    tags = derive_tags(f"{title}\n{s.get('summary') or ''}")
    if s.get("regulator") and s["regulator"].lower() in TAG_REGULATORS:
        tags["regulators"] = sorted(set(tags["regulators"]) | {s["regulator"].lower()})
    tags["topics"] = sorted(set(tags["topics"]) | {"circular"})
    slug = re.sub(r"[^a-z0-9]+", "-", ref.lower()).strip("-")
    return {"id": f"seed-{slug}", "n": None, "date": s["issued"], "report": "rules", "section": "Latest circulars",
            "kind": "circular", "category": "regulation", "title": title, "summary": s.get("summary"),
            "impact": s.get("impact") if private else None,
            "source": {"name": source_name(url), "url": url}, "tags": tags,
            "reg": {"ref_no": ref, "regulator": s.get("regulator"), "applies_to": s.get("applies_to") or None,
                    "issued": s["issued"], "effective": _iso_or_none(s.get("effective")),
                    "status": s.get("status") if s.get("status") in REG_STATUS else None, "url": url}}


def _ref_key(ref):
    """Whole ref no., lower-case alphanumerics only ('PR No.70/2026' -> 'prno702026')."""
    return re.sub(r"[^a-z0-9]", "", (ref or "").lower())


def _ref_key_old(ref):
    """Pre-11 Nov key (first token). Used only as a fallback match against the seed, and only when it has a digit."""
    k = re.sub(r"\s+", "", (ref or "").split(" ")[0]).lower()
    return k if re.search(r"\d", k) else ""


def build_latest_circulars(days: list, seed: dict, private: bool) -> list:
    if not days:
        return []
    newest = max(d["id"] for d in days)
    start = (_ed(newest) - _dt.timedelta(days=CIRCULAR_WINDOW - 1)).isoformat()
    picked = {}
    seeds = {}
    seeds_old = {}
    for s in (seed or {}).get("circulars") or []:
        if isinstance(s, dict) and _ref_key(s.get("ref_no")):
            seeds.setdefault(_ref_key(s.get("ref_no")), s)
            if _ref_key_old(s.get("ref_no")):
                seeds_old.setdefault(_ref_key_old(s.get("ref_no")), []).append(s)
    for d in sorted(days, key=lambda x: x["id"]):  # oldest first: keep the first coverage of each instrument
        for c in d.get("cards") or []:
            r = c.get("reg")
            if not r:
                continue
            sd = seeds.get(_ref_key(r.get("ref_no")))
            if not sd and len(seeds_old.get(_ref_key_old(r.get("ref_no")), [])) == 1:
                sd = seeds_old[_ref_key_old(r.get("ref_no"))][0]
            if sd:  # fill fields the edition left unknown from the verified seed entry (copy; day cards stay as published)
                c = dict(c, reg=dict(r))
                r = c["reg"]
                for k in ("regulator", "issued", "effective", "url"):
                    if not r.get(k) and sd.get(k):
                        r[k] = sd[k]
                if not r.get("applies_to") and sd.get("applies_to"):
                    r["applies_to"] = list(sd["applies_to"])
                t0 = c.get("title") or ""
                if sd.get("title") and str(r.get("ref_no")).split(" ")[0] not in t0 and ":" not in t0:
                    c["title"] = sd["title"]
            when = r.get("issued") or c["date"]
            if when < start or c["date"] < start:
                continue
            key = _ref_key(r.get("ref_no")) or (r.get("url") or c["id"])
            if key not in picked:
                picked[key] = c
            elif not picked[key].get("reg", {}).get("ref_no") and r.get("ref_no"):
                picked[key] = c
    for s in (seed or {}).get("circulars") or []:
        c = _seed_card(s, private) if isinstance(s, dict) else None
        if not c or c["date"] < start or c["date"] > newest:
            continue
        key = _ref_key(c["reg"]["ref_no"])
        if key not in picked:
            picked[key] = c
    return sorted(picked.values(), key=lambda c: (c["reg"].get("issued") or c["date"], c["date"], c["id"]), reverse=True)


def _deadline_lines(text: str):
    """Yield (title, date_text, line) for calendar bullets and table rows in calendar/deadline/watchlist sections."""
    sec = None
    for l in (text or "").split("\n"):
        if re.match(r"^##\s", l):
            sec = l
            continue
        if not sec or not re.search(r"calendar|deadline|watchlist|did \*?not\*? move|upcoming", sec, re.I):
            continue
        if _TEACH_HEAD.match(sec):
            continue
        s = l.strip()
        m = re.match(r"^[-*]\s+\*\*([^*]+?):?\*\*:?\s*(.+)$", s)
        if m:
            yield _plain(m.group(2)), m.group(1), s
            continue
        if s.startswith("|") and not re.match(r"^\|\s*:?-{2,}", s) and not re.match(r"^\|\s*(?:item|date|what)\s*\|", s, re.I):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if len(cells) >= 2:
                yield _plain(cells[0]), cells[-1], s


_DRANGE = re.compile(r"^\s*(\d{1,2})(?:\s+([A-Za-z]{3,9})\.?)?(?:,?\s+(\d{4}))?\s*(?:[–—-]|to)\s*(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?\s*$")


def _range_end(dtxt: str, edition: str):
    """ISO end date for '2–4 Dec 2026' / '30 Nov – 2 Dec 2026' style ranges, else None."""
    m = _DRANGE.match(_plain(dtxt or ""))
    if not m or _MON.get(m.group(5).lower()[:3]) is None:
        return None
    return _mkdate(m.group(4), _MON[m.group(5).lower()[:3]], m.group(6) or m.group(3), edition, True)


def _index_url(url: str) -> bool:
    """True for a regulator's listing / index page (no specific document id), e.g. RBI NotificationUser.aspx."""
    try:
        u = _urlparse(url or "")
    except ValueError:
        return False
    return _is_official(url) and not u.query and bool(re.search(r"(?:NotificationUser|BS_CircularIndexDisplay|BS_PressReleaseDisplay|"
                                                                r"BS_ViewMasDirections|DraftNotificationsGuildelines)\.aspx$", u.path, re.I))


def _title_regulator(title: str):
    t = title or ""
    for reg, pat in (("SEBI", r"\bSEBI\b|\bLODR\b|Risk-o-Meter|\bILDS\b"), ("IBBI", r"\bIBBI\b|\bCIRP\b"),
                     ("NHB", r"\bNHB\b"), ("FIU-IND", r"\bFIU"),
                     ("RBI", r"\bRBI\b|\bMPC\b|Directions?\b|Ombudsman|Recovery agents|\bNBFC-AA\b|\bSBR\b")):
        if re.search(pat, t):
            return reg
    return None


def build_deadlines(days: list, latest_circulars: list, seed: dict) -> list:
    if not days:
        return []
    newest = max(d["id"] for d in days)
    floor = (_ed(newest) - _dt.timedelta(days=DEADLINE_PAST)).isoformat()
    out, seen = [], set()

    def add(date, title, regulator, ref, url, status, date_text=None):
        if not date or date < floor or not title:
            return
        if url and _index_url(url):
            url = None  # an index page is not a source for one deadline; a seed entry can fill the exact URL
        key = (date, _ref_key(ref) or re.sub(r"\W+", "", title.lower())[:40])
        if key in seen:
            return
        words = {w for w in re.findall(r"[a-z0-9]{4,}", title.lower())}
        for x in out:
            if x["date"] == date:
                xw = {w for w in re.findall(r"[a-z0-9]{4,}", x["title"].lower())}
                if len(words & xw) >= 2 or (words and xw and (words <= xw or xw <= words)):
                    for k, v in (("regulator", regulator), ("ref_no", ref), ("url", url), ("date_text", date_text)):
                        x[k] = x[k] or v
                    return
        if not regulator:
            regulator = _title_regulator(title)
        seen.add(key)
        out.append({"date": date, "title": _clip(title, 200), "regulator": regulator, "ref_no": ref, "url": url,
                    "status": status, "date_text": date_text})

    src_day = None
    for d in sorted(days, key=lambda x: x["id"], reverse=True):
        rep = [r for r in d.get("_raw") or [] if r[0] == "02-regulation"]
        if rep and any(True for _ in _deadline_lines(rep[0][1])):
            src_day = (d["id"], rep[0][1])
            break
    if src_day:
        edition, text = src_day
        for title, dtxt, line in _deadline_lines(text):
            date_text = None
            date = _range_end(dtxt, edition)
            if date:
                date_text = _plain(dtxt).strip()
            else:
                ds = _dates(_plain(dtxt), edition, forward=True)
                if not ds:
                    continue
                date = ds[0][1]
            regulator, ref, _ = _find_ref(_URL.sub(" ", line))
            if not regulator:
                t = derive_tags(title)
                regulator = t["regulators"][0].upper() if t["regulators"] else None
            links = _links(line)
            off = [u for _, u in links if _is_official(u)]
            url = off[0] if off else (links[0][1] if links else None)
            if re.search(r"\bdraft|consultation|if finali[sz]ed|comments? (?:due|by)", line, re.I):
                status = "draft"
            else:
                status = "deadline" if date >= newest else "in-force"
            title = re.sub(r"\s*\(\[?link\]?\)\s*$", "", title, flags=re.I)  # markdown '([link](url))' leftover
            title = re.sub(r"\s*\((?:RBI|SEBI|IBBI|IRDAI|NHB|MCA|PFRDA)\b(?:[^()]|\([^()]*\))*\)\s*$", "", title) or title  # regulator/ref is its own field
            add(date, title, regulator, ref, url, status, date_text)
    for c in latest_circulars:
        r = c.get("reg") or {}
        if r.get("effective") and r["effective"] > newest:
            add(r["effective"], f"{c['title']} (effective)", r.get("regulator"), r.get("ref_no"), r.get("url"), "deadline")
    for s in (seed or {}).get("deadlines") or []:
        if isinstance(s, dict) and _iso_or_none(s.get("date")) and s.get("url"):
            add(s["date"], s.get("title"), s.get("regulator"), s.get("ref_no"), s.get("url"),
                s.get("status") if s.get("status") in REG_STATUS else ("deadline" if s["date"] >= newest else "in-force"),
                s.get("date_text"))
    up = sorted((x for x in out if x["date"] >= newest), key=lambda x: (x["date"], x["title"]))
    past = sorted((x for x in out if x["date"] < newest), key=lambda x: (x["date"], x["title"]), reverse=True)
    return up + past


def cards_export(days: list, raw_root, data_dir, private: bool) -> dict:
    """Adds cards (+ private lessons) and mfl_ncd to every day in place; returns the latest.json extras."""
    extras = {}
    try:
        for i, d in enumerate(days):
            raw_dir = Path(raw_root) / d["id"] if raw_root else None
            days[i] = cards_day(d, raw_dir, private)
        ncd_days(days, raw_root, _public_ncd if private else None)
        for d in days:
            d["_raw"] = _raw_reports(d, Path(raw_root) / d["id"] if raw_root else None)
        seed = load_circular_seed(Path(data_dir) / CIRCULAR_SEED)
        lc = build_latest_circulars(days, seed, private)
        extras["latest_circulars"] = lc
        extras["deadlines"] = build_deadlines(days, lc, seed)
        extras["mfl_ncd"] = days[0].get("mfl_ncd") if days else None
        if private:
            extras["lessons"] = sorted((l for d in days for l in d.get("lessons") or []),
                                       key=lambda l: l["date"], reverse=True)
    except Exception as exc:  # never fatal
        print(f"export_json: cards extras skipped: {exc}", file=sys.stderr)
    for d in days:
        d.pop("_raw", None)
        d.setdefault("mfl_ncd", None)
    return extras
# ---- end cards block ----


# ---- content upgrade hook (content_upgrade.py: peer_intel, story threads, sources[], lifecycle, week_review) ----
def _content_upgrade(days, extras, data_dir, private, generated):
    """Runs content_upgrade.apply(); never fatal. Always strips the internal `_u` unit copies from cards."""
    try:
        here = str(Path(__file__).resolve().parent)
        if here not in sys.path:
            sys.path.insert(0, here)
        import content_upgrade
        files = content_upgrade.apply(sys.modules[__name__], days, extras, data_dir, private, generated)
    except Exception as exc:  # never fatal
        print(f"export_json: content upgrade skipped: {exc!r}", file=sys.stderr)
        files = {}
    for d in days:
        for c in d.get("cards") or []:
            c.pop("_u", None)
    extras.pop("_problems", None)
    return files


def _write_content_upgrade(data_dir, files, latest):
    """stories.json / peer_intel.json share latest.json's `generated` and are written in the same run."""
    try:
        import content_upgrade
        files = content_upgrade.finalize(latest, dict(files or {}))
    except Exception as exc:  # never fatal
        print(f"export_json: story_index skipped: {exc!r}", file=sys.stderr)
        files = {k: v for k, v in (files or {}).items() if not k.startswith("_")}
    for name, obj in (files or {}).items():
        path = Path(data_dir) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        obj["generated"] = latest["generated"]
        path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
# ---- end content upgrade hook ----


# ---- daily gold and AGLOC LTV block (docs/DATA_FORMAT.md "Gold and LTV"); additive, never fatal ----
GOLD_HEADING = re.compile(r"^##\s+(?:\W+\s*)?gold\s+and\s+ltv\b", re.I)
GOLD_SERIES = ("ibja999", "ibja916", "agloc_ltv85", "agloc_ltv80", "agloc_ltv75", "agloc_ref")
AGLOC_URL = "https://www.agloc.org/"
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GOLD_SEED = "history.json"
_GOLD_ROWS = (  # fixed row labels -> (group, field)
    (re.compile(r"^IBJA\s*999", re.I), "ibja999"),
    (re.compile(r"^IBJA\s*916", re.I), "ibja916"),
    (re.compile(r"^Gold\s+spot\s+US\$\s*/\s*oz", re.I), "spot_usd"),
    (re.compile(r"^Gold\s+spot\s+(?:₹|Rs\.?|INR)\s*/\s*10\s*g", re.I), "spot_inr"),
    (re.compile(r"^AGLOC\s+max\s+LTV\s+85\s*%", re.I), "ltv_85"),
    (re.compile(r"^AGLOC\s+max\s+LTV\s+80\s*%", re.I), "ltv_80"),
    (re.compile(r"^AGLOC\s+max\s+LTV\s+75\s*%", re.I), "ltv_75"),
    (re.compile(r"^AGLOC\s+jewell?ery\s+reference", re.I), "ref_price"),
)
_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
_DATE_RX = re.compile(r"(\d{4})-(\d{2})-(\d{2})|(\d{1,2})/(\d{1,2})/(\d{4})|(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})")


def _gold_dates(cell: str) -> list:
    """Every date in a cell as YYYY-MM-DD, in order (ISO, DD/MM/YYYY or '23 Oct 2026')."""
    out = []
    for m in _DATE_RX.finditer(cell or ""):
        try:
            if m.group(1):
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            elif m.group(4):
                d, mo, y = int(m.group(4)), int(m.group(5)), int(m.group(6))
            else:
                d, mo, y = int(m.group(7)), _MONTHS[m.group(8).lower()[:3]], int(m.group(9))
            if 1 <= mo <= 12 and 1 <= d <= 31:
                out.append(f"{y:04d}-{mo:02d}-{d:02d}")
        except (KeyError, ValueError):
            continue
    return out


def _gold_num(cell):
    """'12,345' -> 12345; '—', '-', 'n/a' or empty -> None. Date text is ignored, never read as a number."""
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", str(cell or "")).replace("*", "").strip()
    s = _DATE_RX.sub(" ", s)
    s = s.replace("\u2212", "-").replace(",", "")
    s = re.sub(r"(?i)₹|rs\.?|inr|us\$|\$|/\s*(?:g|gm|oz|10\s*g)\b", " ", s).strip()
    if not s or re.fullmatch(r"[—–\-−]+|n/?a|nil|none|null|tbd|\?", s, re.I):
        return None
    m = re.search(r"(?<![\w.])[-+]?\d+(?:\.\d+)?", s)
    if not m:
        return None
    v = float(m.group(0))
    return int(v) if v.is_integer() else v


def _gold_url(cell):
    m = re.search(r"\]\((https?://[^)\s]+)\)", cell or "")
    if m:
        return m.group(1)
    m = re.search(r"https?://[^\s)|>]+", cell or "")
    return m.group(0) if m else None


def _gold_rows(text: str) -> dict:
    """The '## 🪙 Gold and LTV' table as {row_id: [cells...]}; {} when the section is absent."""
    rows, inside = {}, False
    for line in (text or "").split("\n"):
        if line.startswith("## "):
            inside = bool(GOLD_HEADING.match(line.strip()))
            continue
        if not inside or not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cells or re.fullmatch(r"[:\-\s]*", cells[0]):
            continue
        label = re.sub(r"[*_`]", "", cells[0]).strip()
        for rx, rid in _GOLD_ROWS:
            if rx.match(label) and rid not in rows:
                rows[rid] = (cells + [""] * 6)[1:6]  # value, previous, change, effective, source
    return rows


_MON_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def as_of_display(raw):
    """'2026-11-02 1849 GMT (2026-11-03 00:19 IST)' -> '2 Nov, 18:49 GMT'; date only -> '2 Nov'; else None."""
    m = re.match(r"^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):?(\d{2})(?::\d{2})?)?\s*(GMT|UTC|IST|Z)?\b", str(raw or ""))
    if not m or not 1 <= int(m.group(2)) <= 12:
        return None
    s = f"{int(m.group(3))} {_MON_ABBR[int(m.group(2)) - 1]}"
    if m.group(4):
        hh = int(m.group(4))
        if hh > 23 or int(m.group(5)) > 59:
            return s
        tz = {"Z": "GMT", "UTC": "UTC"}.get(m.group(6) or "", m.group(6) or "")
        s += f", {hh:02d}:{m.group(5)}" + (f" {tz}" if tz else "")
    return s


def parse_gold(text: str):
    """Top-level `gold` object from the report Markdown, or None when the section/table is absent."""
    rows = _gold_rows(text)
    if not rows:
        return None
    gold = {}
    i9, i6 = rows.get("ibja999"), rows.get("ibja916")
    if i9 or i6:
        lead = i9 or i6
        eff = lead[3]
        sess = re.search(r"\b(AM|PM)\b", eff, re.I)
        dates = _gold_dates(eff)
        prev_dates = _gold_dates(lead[1])
        gold["ibja"] = {
            "rate_999": _gold_num(i9[0]) if i9 else None, "rate_916": _gold_num(i6[0]) if i6 else None,
            "prev_999": _gold_num(i9[1]) if i9 else None, "prev_916": _gold_num(i6[1]) if i6 else None,
            "session": sess.group(1).upper() if sess else None,
            "date": dates[0] if dates else None, "prev_date": prev_dates[0] if prev_dates else None,
            "source": _gold_url(lead[4]),
        }
    su, si = rows.get("spot_usd"), rows.get("spot_inr")
    if su or si:
        inr = _gold_num(si[0]) if si else None
        gold["spot"] = {
            "usd_oz": _gold_num(su[0]) if su else None, "prev_usd_oz": _gold_num(su[1]) if su else None,
            "inr_10g": inr, "as_of": (su or si)[3] or None, "as_of_display": as_of_display((su or si)[3]),
            "source": _gold_url((su or si)[4]),
            "inr_source": _gold_url(si[4]) if si and inr is not None else None,
        }
    tiers = ("ltv_85", "ltv_80", "ltv_75", "ref_price")
    if any(t in rows for t in tiers):
        eff = next((rows[t][3] for t in tiers if t in rows and _gold_dates(rows[t][3])), "")
        prev_eff = next((rows[t][1] for t in tiers if t in rows and _gold_dates(rows[t][1])), "")
        d, pd = _gold_dates(eff), _gold_dates(prev_eff)
        cur = {t: _gold_num(rows[t][0]) if t in rows else None for t in tiers}
        prev = {t: _gold_num(rows[t][1]) if t in rows else None for t in tiers}
        has_prev = any(v is not None for v in prev.values())
        gold["agloc"] = {
            **cur, "from": d[0] if d else None, "to": (d[1] if len(d) > 1 else (d[0] if d else None)),
            "prev": ({**prev, "from": pd[0] if pd else None, "to": (pd[1] if len(pd) > 1 else (pd[0] if pd else None))}
                     if has_prev else None),
            "source": next((_gold_url(rows[t][4]) for t in tiers if t in rows and _gold_url(rows[t][4])), AGLOC_URL),
        }
    return gold or None


def gold_day(day: dict) -> dict:
    """Copy of the day with `gold` when its daily watch has the Gold and LTV table; else the day unchanged."""
    try:
        rep = next((r for r in day.get("reports") or [] if r.get("key") == "01-daily-watch"), None)
        g = parse_gold((rep or {}).get("content") or "")
        if not g:
            return day
        out = dict(day)
        out["gold"] = g
        return out
    except Exception as exc:  # a gold-table problem must never stop publishing
        print(f"export_json: gold skipped for {day.get('id')}: {exc}", file=sys.stderr)
        return day


def gold_points(day: dict) -> dict:
    """{series key: {date: value}} from one day's `gold`, keyed by each figure's own date (IBJA date, AGLOC from)."""
    g, pts = day.get("gold") or {}, {}

    def put(k, dt, v):
        if dt and ISO_DATE.match(dt) and (v is None or isinstance(v, (int, float))):
            pts.setdefault(k, {})[dt] = v
    ib = g.get("ibja") or {}
    put("ibja999", ib.get("date"), ib.get("rate_999")); put("ibja916", ib.get("date"), ib.get("rate_916"))
    if ib.get("prev_date"):
        put("ibja999", ib["prev_date"], ib.get("prev_999")); put("ibja916", ib["prev_date"], ib.get("prev_916"))
    ag = g.get("agloc") or {}
    for src in ((ag.get("prev") or {}), ag):  # the current period wins over a repeated previous one
        for k, f in (("agloc_ltv85", "ltv_85"), ("agloc_ltv80", "ltv_80"), ("agloc_ltv75", "ltv_75"), ("agloc_ref", "ref_price")):
            if src.get("from"):
                put(k, src["from"], src.get(f))
    return pts


def build_gold_series(days: list, seed: dict, limit: int = SERIES_DAYS) -> dict:
    """Gold series on their own dates: seed (data/history.json) first, editions' `gold` objects win.
    Only dates up to the newest edition; the last `limit` points per key. A null is a gap, never filled."""
    try:
        newest = max(d["id"] for d in days)
        out = {}
        for k in GOLD_SERIES:
            ser = {dt: v for dt, v in (seed.get(k) or {}).items() if dt <= newest}
            for d in sorted(days, key=lambda d: d["id"]):
                for dt, v in gold_points(d).get(k, {}).items():
                    if dt <= newest:
                        ser[dt] = v
            if ser:
                out[k] = {dt: ser[dt] for dt in sorted(ser)[-limit:]}
        return out
    except Exception as exc:  # never fatal
        print(f"export_json: gold series skipped: {exc}", file=sys.stderr)
        return {}
def load_gold_seed(path) -> dict:
    """Gold keys only from data/history.json ({key: {date: number|null}}); {} when absent or bad (never fatal)."""
    try:
        from pathlib import Path as _P
        p = _P(path)
        if not p.exists():
            return {}
        raw = json.loads(p.read_text(encoding="utf-8"))
        out = {}
        for k in GOLD_SERIES:
            ser = raw.get(k) if isinstance(raw, dict) else None
            if isinstance(ser, dict):
                out[k] = {d: (v if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v else None)
                          for d, v in ser.items() if isinstance(d, str) and ISO_DATE.match(d)}
        return out
    except Exception as exc:
        print(f"export_json: gold seed ignored: {exc}", file=sys.stderr)
        return {}
# ---- end gold block ----


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
    days = [gold_day(d) for d in days]  # additive `gold` card from the Gold and LTV table; never fatal
    if not days:
        raise SystemExit("export_json: data.js has no days")
    data = site / "data"
    data.mkdir(exist_ok=True)
    extras = cards_export(days, site / "days", data, private=False)  # cards, mfl_ncd; never fatal (no lessons here)
    cu_files = _content_upgrade(days, extras, data, False, payload["generated"])
    for d in days:
        (data / f"{d['id']}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    seed = load_seed(site)
    series = build_series(days, {k: v for k, v in seed.items() if k not in GOLD_SERIES})
    series.update(build_gold_series(days, load_gold_seed(data / SEED_FILE)))  # gold keys keep their own dates
    latest = {"schema": SCHEMA, "schema_version": SCHEMA_VERSION, "generated": payload["generated"],
              "latest": days[0]["id"], "days": [_index_entry(d) for d in days], "series": series, "today": days[0]}
    latest.update(extras)  # latest_circulars, deadlines, mfl_ncd
    try:
        latest["tag_labels"] = labels_for(*(d.get("tags") for d in days))
    except Exception as exc:  # never fatal
        print(f"export_json: tag_labels skipped: {exc}", file=sys.stderr)
    seeded = sorted({dt for ser in series.values() for dt in ser} - {d["id"] for d in days})
    if seeded:  # tells the app a seed exists, so the data.js path fetches it and the JSON path need not
        latest["series_seed"] = {"file": f"data/{SEED_FILE}", "dates": len(seeded), "first": seeded[0], "last": seeded[-1]}
    _write_content_upgrade(data, cu_files, latest)
    (data / "latest.json").write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")
    print(f"export_json: {len(days)} day file(s) + data/latest.json ({SCHEMA} v{SCHEMA_VERSION})"
          + (f", series seeded with {len(seeded)} earlier date(s) from data/{SEED_FILE}" if seeded else ""))
    return data


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=str(Path(__file__).resolve().parent))
    export(Path(ap.parse_args().site))
