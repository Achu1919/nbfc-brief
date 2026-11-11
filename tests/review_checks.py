"""CoS + Site Builder review checks (11 Nov 2026), shared by both editions:
no aggregator source anywhere, stable neutral thread titles, audited regulator tags, sourced `next`,
milestones never status-only, no flattened table-row summaries, no stray story archives."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
import content_upgrade as CU  # noqa: E402

AUDIT_FILE = CU.REPLACEMENTS  # the audit record itself lists the old aggregator URLs on purpose
BAD_TITLE = re.compile(r"\btoday\b|\(employer\)|\byour\b|\d(?:\.\d+)?\s*[x×](?!\w)|[—:]\s*$", re.I)
FLAT_ROW = re.compile(r"^(?:[^:;]+;\s*){3,}[^:;]*$")
TEXT_KEYS = ("title", "summary", "impact", "impact_deep", "excerpt")


def _srcs(o, path, out):
    if isinstance(o, dict):
        if "url" in o and ("name" in o or "label" in o) and re.search(r"source|sources|\bsrc", path):
            out.append((path, o))
        elif re.search(r"\.source$", path) and "name" in o:  # thread update sources carry {name, tier}
            out.append((path, o))
        for k, v in o.items():
            if k != "content":  # raw report markdown is the published archive text, not a source field
                _srcs(v, f"{path}.{k}", out)
    elif isinstance(o, list):
        for v in o:
            _srcs(v, path + "[]", out)


def _texts(o, path, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in TEXT_KEYS and isinstance(v, str):
                out.append((f"{path}.{k}", v))
            elif k != "content":
                _texts(v, f"{path}.{k}", out)
    elif isinstance(o, list):
        for v in o:
            _texts(v, path + "[]", out)


def aggregator_errors(data_dir: Path):
    errs = []
    files = [p for p in sorted(data_dir.glob("*.json")) + sorted((data_dir / "stories").glob("*.json")) if p.name != AUDIT_FILE]
    for p in files:
        o = json.loads(p.read_text(encoding="utf-8"))
        found = []
        _srcs(o, "", found)
        for path, s in found:
            u, n = s.get("url") or "", str(s.get("name") or s.get("label") or "")
            if CU.banned(u) or CU.BANNED_NAMES.search(n):
                errs.append(f"{p.name}{path}: aggregator source {n} {u}")
        for path, t in ((pp, tt) for pp, tt in (lambda acc: (_texts(o, "", acc), acc)[1])([])):
            if CU.BANNED_NAMES.search(t) or re.search(r"https?://(?:www\.)?(?:" + "|".join(map(re.escape, CU.BANNED_HOSTS)) + ")", t):
                errs.append(f"{p.name}{path}: names an aggregator: {t[:80]}")
        for path, row in (("deadlines", r) for r in (o.get("deadlines") or []) if isinstance(o, dict)):
            if CU.banned(row.get("url")):
                errs.append(f"{p.name} {path}: aggregator url {row.get('url')}")
    return errs


def thread_errors(data_dir: Path):
    errs = []
    smap = json.loads((data_dir / "story_map.json").read_text(encoding="utf-8"))
    meta = smap.get("_threads") or {}
    for k, v in meta.items():
        t = v.get("title") or ""
        if not t or len(t) > CU.THREAD_TITLE_MAX or BAD_TITLE.search(t):
            errs.append(f"story_map _threads {k}: title {t!r} is not short, stable and neutral")
    so = json.loads((data_dir / "stories.json").read_text(encoding="utf-8"))
    stories = dict(so.get("stories") or {})
    for a in so.get("archives") or []:
        f = data_dir.parent / a["file"] if isinstance(a, dict) and a.get("file") else None
        if f and f.exists():
            stories.update(json.loads(f.read_text(encoding="utf-8")).get("stories") or {})
    listed = {Path(a["file"]).name for a in so.get("archives") or [] if isinstance(a, dict) and a.get("file")}
    for f in (data_dir / "stories").glob("*.json") if (data_dir / "stories").exists() else []:
        if f.name not in listed:
            errs.append(f"data/stories/{f.name}: not listed in stories.json archives[] (stale)")
    latest = json.loads((data_dir / "latest.json").read_text(encoding="utf-8"))
    rows = [(sid, t) for sid, t in stories.items()] + [(r["story_id"], r) for r in latest.get("continuing_stories") or []]
    for sid, t in rows:
        m = meta.get(sid)
        if not m:
            errs.append(f"story {sid}: no _threads entry in story_map.json")
            continue
        if t.get("title") != m["title"]:
            errs.append(f"story {sid}: title {t.get('title')!r} is not the stable title {m['title']!r}")
        if "regulators" in t and isinstance(m.get("regulators"), list) and sorted(t["regulators"]) != sorted(m["regulators"]):
            errs.append(f"story {sid}: regulators {t['regulators']} differ from the audited {m['regulators']}")
        n = t.get("next")
        if n:
            if not (re.match(r"^\d{4}-\d{2}-\d{2}$", n.get("date") or "") and n.get("what") and (n.get("source") or {}).get("url")):
                errs.append(f"story {sid}: next without date / what / source")
            elif CU.tier(n["source"]["url"]) > 2:
                errs.append(f"story {sid}: next source not tier 1/2")
        for u in t.get("updates") or []:
            if u.get("kind") == "status" and CU.MILESTONES_NOT_STATUS.match(str(u.get("milestone") or "")):
                errs.append(f"story {sid} {u.get('card_id')}: milestone {u['milestone']} marked status-only")
        lt = t.get("latest") or {}
        if lt.get("kind") == "status":
            src = stories.get(sid) or {}
            up = next((u for u in src.get("updates") or [] if u.get("card_id") == lt.get("card_id")), {})
            if CU.MILESTONES_NOT_STATUS.match(str(up.get("milestone") or "")):
                errs.append(f"continuing {sid}: milestone latest marked status")
    ncd = stories.get("mfl-ncd-2026-tranche-1")
    if ncd:
        if ncd.get("regulators"):
            errs.append(f"mfl-ncd-2026-tranche-1: regulators {ncd['regulators']} on a company issue thread")
        lst = [u for u in ncd["updates"] if u.get("milestone") in ("listed", "listing")]
        if lst and any(u.get("kind") == "status" for u in lst):
            errs.append("mfl-ncd-2026-tranche-1: the BSE listing update is kind status")
    return errs


def flat_row(s):
    """Cells of a table row joined with '; ' and no labels: '13,752.4; 14,005.4 (…); −253.0 (−1.81%); IBJA'."""
    if not s or ":" in s or s.startswith("("):
        return False
    segs = [x.strip() for x in s.rstrip(".").split(";") if x.strip()]
    if len(segs) < 2:
        return False
    if any(x.count("(") != x.count(")") for x in segs):
        return False  # a '; ' inside a parenthesis is prose, not cells
    numeric = sum(1 for x in segs if re.match(r"^[\d₹$−+~]", x))
    return numeric >= 2 and sum(len(x.split()) for x in segs) / len(segs) <= 5


def summary_errors(data_dir: Path):
    errs = []
    for p in sorted(data_dir.glob("2026-*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        for c in d.get("cards") or []:
            s = c.get("summary") or ""
            if flat_row(s):
                errs.append(f"{p.name} {c['id']}: flattened table-row summary {s[:70]!r}")
            if re.search(r"\bSource\b.*\|", s):
                errs.append(f"{p.name} {c['id']}: table header in summary {s[:70]!r}")
    return errs


def all_errors(data_dir: Path):
    return aggregator_errors(data_dir) + thread_errors(data_dir) + summary_errors(data_dir)


if __name__ == "__main__":
    e = all_errors(REPO / "data")
    print(f"review checks: {len(e)} problem(s)")
    for x in e[:60]:
        print(" -", x)
    sys.exit(1 if e else 0)
