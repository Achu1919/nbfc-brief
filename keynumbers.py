"""Key numbers: parse the fixed '## Key numbers' block (see KEY-NUMBERS.md),
with a conservative fallback for older reports that only have free text.

Hard rule: never invent or carry forward a value. Anything that cannot be read
unambiguously from that day's file is left out.
"""
from __future__ import annotations

import re
from datetime import date

# key, display name, group, aliases (normalised), core?, sane range for fallback
ITEMS = [
    ("sensex", "Sensex", "index", ["sensex", "bse sensex", "s&p bse sensex"], True, (20000, 200000)),
    ("nifty", "Nifty 50", "index", ["nifty", "nifty 50", "nifty50"], True, (8000, 60000)),
    ("niftyfin", "Nifty Financial Services", "index",
     ["nifty financial services", "nifty fin services", "nifty fin svcs", "nifty financial", "finnifty"], True, (8000, 80000)),
    ("manappuram", "Manappuram Finance", "peer", ["manappuram", "manappuram finance"], True, (20, 5000)),
    ("muthoot", "Muthoot Finance", "peer", ["muthoot finance", "muthoot fin"], True, (200, 20000)),
    ("iifl", "IIFL Finance", "peer", ["iifl finance", "iifl"], True, (50, 5000)),
    ("shriram", "Shriram Finance", "peer", ["shriram finance", "shriram"], True, (100, 10000)),
    ("bajaj", "Bajaj Finance", "peer", ["bajaj finance"], True, (100, 20000)),
    ("usdinr", "USD/INR", "macro", ["usd/inr", "inr/usd", "usdinr", "rupee", "inr", "₹/$"], True, (60, 130)),
    ("gold10g", "Gold (₹/10g)", "macro", ["gold", "gold india", "gold per 10g", "gold ₹/10g", "mcx gold"], True, (30000, 500000)),
    ("brent", "Brent ($/bbl)", "macro", ["brent", "brent crude"], True, (20, 250)),
    ("goldspot", "Gold spot ($/oz)", "macro", ["gold spot", "spot gold"], False, None),
    ("fii", "FII net (₹ cr)", "flows", ["fii net", "fii", "fpi net", "fpi"], False, None),
    ("dii", "DII net (₹ cr)", "flows", ["dii net", "dii"], False, None),
]
BY_KEY = {i[0]: i for i in ITEMS}
CORE = [i[0] for i in ITEMS if i[4]]
MISSING = {"", "—", "–", "-", "n/a", "na", "not in report", "not available"}
MD_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
URL = re.compile(r"https?://[^\s<>()\[\]|]+")
MON = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _norm(name: str) -> str:
    n = re.sub(r"[*_`]", "", name)
    n = re.sub(r"\([^)]*\)", "", n)
    n = n.lower().replace("peer", "")
    n = re.sub(r"[^\w/&₹$ ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def match_key(name: str) -> str | None:
    raw = name.lower()
    if "fincorp" in raw or re.search(r"\bmfl\b", raw):
        return None  # Muthoot Fincorp is not a listed peer
    n = _norm(name)
    for key, _, _, aliases, _, _ in ITEMS:
        if n in aliases:
            return key
    return None


def _clean(cell: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\*\*|__|`", "", cell)).strip()


def _source(cell: str):
    m = MD_LINK.search(cell)
    if m:
        return {"label": _clean(m.group(1)), "url": m.group(2)}
    u = URL.search(cell)
    if u:
        url = u.group(0).rstrip(".,;:")
        host = re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
        return {"label": host, "url": url}
    c = _clean(cell)
    return {"label": c, "url": None} if c.lower() not in MISSING else None


def _date_label(d: date) -> str:
    return f"{d.day} {d.strftime('%b')} {d.year}"


def parse_asof(cell: str, edition: date):
    c = _clean(cell)
    if c.lower() in MISSING:
        return None, None
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", c)
    if m:
        try:
            d = date(int(m[1]), int(m[2]), int(m[3]))
            rest = c.replace(m.group(0), "").strip(" ,·")
            return d.isoformat(), _date_label(d) + (f" {rest}" if rest else "")
        except ValueError:
            pass
    d = find_date(c, edition)
    if d:
        return d.isoformat(), _date_label(d)
    return None, c  # keep what the report said, verbatim


def find_dates(text: str, edition: date) -> list[date]:
    out = []
    pats = [r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b",
            r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b"]
    low = text.lower()
    for i, p in enumerate(pats):
        for m in re.finditer(p, low):
            day_s, mon_s = (m[1], m[2]) if i == 0 else (m[2], m[1])
            yr = int(m[3]) if m[3] else edition.year
            try:
                d = date(yr, MON[mon_s[:3]], int(day_s))
            except ValueError:
                continue
            if not m[3] and d > edition:  # e.g. 'Dec' contract months are not dates
                continue
            out.append(d)
    return out


def find_date(text: str, edition: date):
    ds = sorted(set(find_dates(text, edition)))
    return ds[0] if len(ds) == 1 else None


def _direction(change: str) -> str:
    c = change.strip().lstrip("(~*")
    if c[:1] == "+" or c[:1] == "↑":
        return "up"
    if c[:1] in "−-–↓":
        return "down"
    return "flat"


def _table_rows(lines: list[str]) -> list[list[str]]:
    rows = []
    for l in lines:
        cells = [c.strip() for c in l.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue
        rows.append(cells)
    return rows


def key_numbers_section(text: str):
    """Return (lines of the '## Key numbers' section, start, end) or None."""
    lines = text.splitlines()
    start = None
    for i, l in enumerate(lines):
        if re.match(r"^##\s+.*key numbers", l, re.I):
            start = i
            continue
        if start is not None and re.match(r"^##\s+", l):
            return lines[start:i], start, i
    return (lines[start:], start, len(lines)) if start is not None else None


def parse_block(text: str, edition: date, warn=None):
    sec = key_numbers_section(text)
    if not sec:
        return None
    lines = sec[0]
    tables, cur, heading = [], None, ""
    for l in lines:
        s = l.strip()
        if s.startswith("#"):
            heading = s
        if s.startswith("|"):
            if cur is None:
                cur = {"heading": heading, "lines": []}
                tables.append(cur)
            cur["lines"].append(s)
        else:
            cur = None
    items, watch = [], []
    for t in tables:
        rows = _table_rows(t["lines"])
        if len(rows) < 2:
            continue
        head = [h.lower() for h in rows[0]]
        col = {h: i for i, h in enumerate(head)}
        get = lambda r, k: r[col[k]] if k in col and col[k] < len(r) else ""
        is_watch = "watchlist" in t["heading"].lower() or "change" not in col
        for r in rows[1:]:
            name = _clean(get(r, "item"))
            value = _clean(get(r, "value"))
            if not name or value.lower() in MISSING:
                continue
            asof, asof_label = parse_asof(get(r, "as of"), edition)
            src = _source(get(r, "source"))
            if is_watch:
                watch.append({"name": name, "value": value, "asof": asof, "asof_label": asof_label,
                              "source": src, "origin": "block"})
                continue
            key = match_key(name)
            if not key:
                if warn:
                    warn(f"unknown key-number item '{name}' (see KEY-NUMBERS.md for allowed names)")
                continue
            change = _clean(get(r, "change"))
            if change.lower() in MISSING:
                change = ""
            k = BY_KEY[key]
            items.append({"key": key, "name": k[1], "group": k[2], "value": value, "change": change,
                          "dir": _direction(change) if change else "flat", "asof": asof,
                          "asof_label": asof_label, "basis": _clean(get(r, "basis")) or None,
                          "source": src, "origin": "block"})
            if warn and not asof_label:
                warn(f"key number '{name}' has no as-of date")
    seen, uniq = set(), []
    for it in items:
        if it["key"] in seen:
            if warn:
                warn(f"duplicate key number '{it['name']}', keeping the first")
            continue
        seen.add(it["key"])
        uniq.append(it)
    return {"origin": "block", "items": uniq, "watchlist": watch}


# ---------------- fallback: older free-text reports ----------------
NUM = r"(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
GAP = r"[ \t*:~]*(?:\((?:peer|not mfl)[^)]*\)[ \t*:~]*)?(?:(?:at|to|closed at|closed|settled at|ended at|ended|around|about|near)[ \t*~]+)?"
CHG = r"[ \t*]*(?:\(([^()]*?%[^()]*?)\)|,?[ \t*]*([+−\-–]\s?\d+(?:\.\d+)?%))?"


def _label_re(key: str) -> str:
    return {
        "sensex": r"\bSensex\b",
        "nifty": r"\bNifty(?:\s?50)?\b(?!\s*(?:Bank|Financial|Fin|IT|Midcap|Smallcap|Next|Auto|Pharma|Metal|Realty|PSU|FMCG|Media|Energy|India|VIX))",
        "niftyfin": r"\bNifty (?:Financial Services|Fin(?:ancial)? Services|Fin Svcs)\b",
        "manappuram": r"\bManappuram(?: Finance)?\b",
        "muthoot": r"\bMuthoot Finance\b",
        "iifl": r"\bIIFL Finance\b",
        "shriram": r"\bShriram Finance\b",
        "bajaj": r"\bBajaj Finance\b",
    }[key]


def _fallback_candidates(key: str, line: str):
    rng = BY_KEY[key][5]
    out = []
    if key in ("sensex", "nifty", "niftyfin", "manappuram", "muthoot", "iifl", "shriram", "bajaj"):
        cur = "" if BY_KEY[key][2] == "index" else r"₹\s?"
        pat = _label_re(key) + r"\**" + GAP + r"(~)?\s?" + cur + NUM + r"(?![\d,])(?!\s*(?:cr|crore|lakh|bn|mn|%|x|×|/|[–\-]\s*\d))" + CHG
        for m in re.finditer(pat, line, re.I):
            v = float(m[2].replace(",", ""))
            if BY_KEY[key][2] == "index" and "," not in m[2] and v < 1000:
                continue
            if rng[0] <= v <= rng[1]:
                approx = "~" if APPROX.search(line[m.start():m.start(2)]) else ""
                out.append((approx + ("₹" if cur else "") + m[2], (m[3] or m[4] or "").strip(), m.end(2)))
    elif key == "usdinr":
        pat = r"\b(?:USD/INR|INR/USD|rupee)\b[ \t*:]*(?:closed|ended|settled|hit|at|was|traded)?[ \t*~]*(?:at\s+)?[ \t*~]*(\d{2,3}\.\d{1,4})(?![\d.])(?!\s*[–\-]\s*\d)(?:\s*/\s*\$)?" + CHG
        for m in re.finditer(pat, line, re.I):
            v = float(m[1])
            if rng[0] <= v <= rng[1]:
                approx = "~" if APPROX.search(line[m.start():m.start(1)]) else ""
                out.append((approx + m[1], (m[2] or m[3] or "").strip(), m.end(1)))
    elif key == "gold10g":
        if re.search(r"\bgold\b|\bMCX\b", line, re.I):
            for m in re.finditer(r"(~)?\s?₹\s?(\d{1,2},\d{2},\d{3}|\d{2,3},\d{3})\s*/\s*10\s?g", line):
                v = float(m[2].replace(",", ""))
                if rng[0] <= v <= rng[1]:
                    out.append(((m[1] or "") + "₹" + m[2] + "/10g", "", m.end()))
    elif key == "brent":
        for m in re.finditer(r"\bBrent\b(?: crude)?[ \t*:]*(?:at|near|around|to|was)?[ \t*]*(~)?[ \t*]*\$\s?(\d{2,3}(?:\.\d+)?)(?![\d.])(?!\s*[–\-]\s*\$?\d)", line, re.I):
            v = float(m[2])
            if rng[0] <= v <= rng[1]:
                approx = "~" if APPROX.search(line[m.start():m.start(2)]) else ""
                out.append((approx + "$" + m[2], "", m.end(2)))
    return out


BAD_CONTEXT = re.compile(r"\btargets?\b|\bTP\b|upside|downside|price objective|averag|forecast|estimate", re.I)


APPROX = re.compile(r"~|≈|\babout\b|\baround\b|\bnear\b|\broughly\b", re.I)


def clean_change(chg: str) -> str:
    c = re.sub(r"[*_]", "", chg or "").strip()
    if re.fullmatch(r"[+−\-–]\s?[\d.,]+(?:\s*pts)?%?(?:\s*[,/]\s*[+−\-–]\s?[\d.,]+%)?", c):
        return c
    signed = re.findall(r"[+−\-–]\s?\d+(?:\.\d+)?%", c)
    if len(signed) == 1 and len(re.findall(r"\d+(?:\.\d+)?", c)) == 1 and not re.search(r"week|month|ytd|year|wk", c, re.I):
        return signed[0]
    return ""  # mixed day/week moves or commentary: don't guess which one


def context_date(line: str, end: int, edition: date):
    """Only trust a date that clearly qualifies the figure: in the bullet's bold
    lead-in label, next to the word 'close', or 'on <date>' right after the value."""
    lead = re.match(r"^\s*[-*]?\s*\*\*([^*]+)\*\*", line)
    if lead and not re.search(r"\d\s*[–\-]\s*\d", lead.group(1)):
        d = find_date(lead.group(1), edition)
        if d:
            return d
    after = line[end:end + 40]
    m = re.match(r"(?:[^.;]|\.\d)*?\b(?:on|as of)\s+((?:\w+\s+)?\d{1,2}\s+\w{3,9}|\w{3,9}\s+\d{1,2})", after)
    if m:
        d = find_date(m.group(1), edition)
        if d:
            return d
    for cm in re.finditer(r"close", line, re.I):
        d = find_date(line[max(0, cm.start() - 18):cm.end() + 14], edition)
        if d:
            return d
    return None


def parse_fallback(text: str, edition: date):
    lines, skip, table_hdr = text.splitlines(), False, None
    found: dict[str, list] = {k: [] for k in CORE}
    for raw in lines:
        s = raw.strip()
        if re.match(r"^##\s+", s):
            skip = bool(re.search(r"source", s, re.I))
        if skip:
            continue
        if s.startswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                continue
            if table_hdr is None:
                table_hdr = cells
                continue
            # table rows: first cell is the label, second the value
            if len(cells) >= 2:
                for key in ("manappuram", "muthoot", "iifl", "shriram", "bajaj", "sensex", "nifty", "niftyfin"):
                    if re.fullmatch(r"[*\s]*" + _label_re(key) + r"[*\s]*(?:\(peer\))?[*\s]*", cells[0], re.I):
                        cur = "" if BY_KEY[key][2] == "index" else "₹"
                        m = re.match(r"^(~)?\s?" + re.escape(cur) + r"\s?" + NUM + r"(?:\s*,\s*\**([+−\-–]\s?\d+(?:\.\d+)?%)\**)?", _clean(cells[1]))
                        if m:
                            v = float(m[2].replace(",", ""))
                            rng = BY_KEY[key][5]
                            if rng[0] <= v <= rng[1]:
                                d = find_date(table_hdr[1] if len(table_hdr) > 1 else "", edition)
                                chg = m[3] or ""
                                ci = next((i for i, h in enumerate(table_hdr) if re.search(r"change|chg", h, re.I)), None)
                                if not chg and ci is not None and ci < len(cells) and ci != 1:
                                    chg = re.sub(r"[▲▼↑↓]", "", cells[ci])
                                found[key].append(((m[1] or "") + cur + m[2], clean_change(chg), d, s))
            continue
        table_hdr = None
        plain = MD_LINK.sub(lambda m: m.group(1), s)
        if BAD_CONTEXT.search(plain):
            continue  # analyst targets, averages, ranges: not a quoted level
        for key in CORE:
            for val, chg, end in _fallback_candidates(key, plain):
                found[key].append((val, clean_change(chg), context_date(plain, end, edition), s))
    items = []
    for key in CORE:
        cands = found[key]
        if not cands:
            continue
        values = {c[0].lstrip("~") for c in cands}
        if len(values) != 1:
            continue  # the text gives more than one figure: ambiguous, leave blank
        val, chg, d, line = cands[0]
        chgs = {c[1] for c in cands if c[1]}
        chg = chgs.pop() if len(chgs) == 1 else ""
        dates = {c[2] for c in cands if c[2]}
        d = dates.pop() if len(dates) == 1 else None
        link = MD_LINK.search(line)
        url = URL.search(line)
        src = ({"label": _clean(link.group(1)), "url": link.group(2)} if link else
               ({"label": re.sub(r"^https?://(www\.)?", "", url.group(0)).split("/")[0], "url": url.group(0).rstrip(".,;:)")} if url else None))
        k = BY_KEY[key]
        items.append({"key": key, "name": k[1], "group": k[2], "value": val, "change": chg,
                      "dir": _direction(chg) if chg else "flat",
                      "asof": d.isoformat() if d else None, "asof_label": _date_label(d) if d else None,
                      "basis": "read from report text", "source": src, "origin": "text",
                      "line": _clean(MD_LINK.sub(lambda m: m.group(1), line))[:300]})
    return {"origin": "text", "items": items, "watchlist": []} if items else None


def extract(text: str, edition: date, warn=None):
    blk = parse_block(text, edition, warn)
    if blk is not None:
        blk["core_total"] = len(CORE)
        blk["core_found"] = sum(1 for i in blk["items"] if i["key"] in CORE)
        return blk
    fb = parse_fallback(text, edition)
    if fb:
        fb["core_total"] = len(CORE)
        fb["core_found"] = sum(1 for i in fb["items"] if i["key"] in CORE)
        return fb
    return {"origin": None, "items": [], "watchlist": [], "core_total": len(CORE), "core_found": 0}
