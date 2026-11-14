"""CoS + Site Builder review checks (11 Nov 2026), shared by both editions:
no aggregator source anywhere (Chittorgarh only on NCD bid-data rows / cards, per SOURCES.md), stable neutral thread titles, audited regulator tags, sourced `next`,
milestones never status-only, no flattened table-row summaries, no stray story archives; events calendar (event_errors)."""
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
WARNINGS = []  # reported, never failing


_CTX_KEYS = ("title", "summary", "name", "label", "what", "value", "note", "issue")


def _ctx(o, ctx):
    """Text of the nearest row / card / update around a source: decides whether it is NCD bid data."""
    if isinstance(o, dict) and any(isinstance(o.get(k), str) for k in _CTX_KEYS):
        t = " ".join(str(o.get(k)) for k in _CTX_KEYS if isinstance(o.get(k), str))
        if o.get("bids"):
            t += " NCD bids"
        return t
    return ctx


def _srcs(o, path, out, ctx=""):
    if isinstance(o, dict):
        if "url" in o and ("name" in o or "label" in o) and re.search(r"source|sources|\bsrc", path):
            out.append((path, o, ctx))
        elif re.search(r"\.source$", path) and "name" in o:  # thread update sources carry {name, tier}
            out.append((path, o, ctx))
        sub = _ctx(o, ctx)
        for k, v in o.items():
            if k != "content":  # raw report markdown is the published archive text, not a source field
                _srcs(v, f"{path}.{k}", out, sub)
    elif isinstance(o, list):
        for v in o:
            _srcs(v, path + "[]", out, ctx)


def _texts(o, path, out, ctx=""):
    if isinstance(o, dict):
        sub = _ctx(o, ctx)
        for k, v in o.items():
            if k in TEXT_KEYS and isinstance(v, str):
                out.append((f"{path}.{k}", v, sub))
            elif k != "content":
                _texts(v, f"{path}.{k}", out, sub)
    elif isinstance(o, list):
        for v in o:
            _texts(v, path + "[]", out, ctx)


def chit_ok(url, name, ctx):
    """SOURCES.md (11 Nov 2026): Chittorgarh only for NCD bid / subscription data, nothing else."""
    is_chit = "chittorgarh" in (url or "").lower() or re.search(r"chittorgarh", name or "", re.I)
    if not is_chit or not CU.ncd_bid_text(ctx):
        return False
    return (not url) or CU.chittorgarh_page(url)


def aggregator_errors(data_dir: Path):
    errs = []
    files = [p for p in sorted(data_dir.glob("*.json")) + sorted((data_dir / "stories").glob("*.json")) if p.name != AUDIT_FILE]
    hosts = "|".join(map(re.escape, CU.BANNED_HOSTS))
    for p in files:
        o = json.loads(p.read_text(encoding="utf-8"))
        found = []
        _srcs(o, "", found)
        for path, s, ctx in found:
            u, n = s.get("url") or "", str(s.get("name") or s.get("label") or "")
            ok = chit_ok(u, n, ctx)
            if (CU.banned(u, ok) or CU._names(ok).search(n)):
                errs.append(f"{p.name}{path}: aggregator source {n} {u}")
        texts = []
        _texts(o, "", texts)
        for path, t, ctx in texts:
            ok = CU.ncd_bid_text(ctx) or CU.ncd_bid_text(t)
            for m in re.finditer(r"https?://(?:www\.)?(?:" + hosts + r")\S*", t):
                if not (ok and CU.chittorgarh_page(m.group(0))):
                    errs.append(f"{p.name}{path}: names an aggregator: {t[:80]}")
            if CU._names(ok).search(t):
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
            # a new thread the routine has not given a _threads entry yet: allowed (warned at export), but its
            # fallback title must still be short; the stable title is added in story_map.json later
            if len(t.get("title") or "") > CU.THREAD_TITLE_MAX:
                errs.append(f"story {sid}: fallback title longer than {CU.THREAD_TITLE_MAX} chars")
            WARNINGS.append(f"story {sid}: no _threads entry in story_map.json (fallback title {t.get('title')!r})")
            m = {}
        if m and t.get("title") != m["title"]:
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


def _md_plain(s):
    s = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"<https?://[^>\s]*>|https?://\S+", " ", s)
    s = re.sub(r"[*_`#]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _norm(s):
    return re.sub(r"\s+", " ", s or "")


_CMP = re.compile(r"(?<![<>≤≥=-])[<>]=?\s?(?=[₹$\d])")


def comparison_losses(report_text, texts):
    """Step 3 (11 Nov): '>' / '<' before a figure in the report that a card's text shows without it
    ('(≤₹2.5 lakh, ₹2.5–5 lakh, ₹5 lakh)' for '… >₹5 lakh)')."""
    out = []
    for line in (report_text or "").split("\n"):
        if line.lstrip().startswith(("<!--", ">", "|")):
            continue  # table cells are checked through row / key-figure summaries
        p = _md_plain(line)
        for m in _CMP.finditer(p):
            a, b = p[max(0, m.start() - 14):m.start()], p[m.end():m.end() + 14]
            if len(a.strip()) < 4:
                continue
            for cid, k, t in texts:
                if (_norm(a.rstrip() + " " + b) in t or _norm(a + b) in t) and _norm(a + m.group(0) + b) not in t \
                        and _norm(a + m.group(0).strip() + b) not in t:
                    out.append(f"{cid}.{k}: lost '{m.group(0).strip()}' in {(a + m.group(0) + b)!r}")
    return out


def table_headers(report_text):
    lines = (report_text or "").split("\n")
    out = []
    for i, l in enumerate(lines[:-1]):
        if l.strip().startswith("|") and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]) and "-" in lines[i + 1]:
            cells = [_md_plain(c) for c in l.strip().strip("|").split("|")]
            cells = [c for c in cells if c]
            if len(cells) >= 2:
                out.append(" ".join(cells))
    return out


UPDATE_PREFIX = re.compile(r"^\s*Update(?:\s+\d+)?\s*[:\u2014\u2013]", re.I)


def step3_errors(data_dir: Path):
    """Site Builder step 3: no 'Update:' title prefix, no lost '>' / '<', no flattened multi-row table,
    no `next` dated before the build."""
    errs = []
    for p in sorted(data_dir.glob("2026-*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        texts = []
        for c in d.get("cards") or []:
            if UPDATE_PREFIX.match(c.get("title") or ""):
                errs.append(f"{p.name} {c['id']}: title keeps the 'Update:' prefix")
            for k in ("title", "summary", "impact", "impact_deep"):
                if c.get(k):
                    texts.append((c["id"], k, _norm(c[k])))
        for r in d.get("reports") or []:
            rt = r.get("content") or ""
            errs += [f"{p.name} {x}" for x in comparison_losses(rt, [t for t in texts if t[0].split("-")[3] == {"01-daily-watch": "news", "02-regulation": "rules", "03-weekly-analysis": "weekly"}.get(r.get("key"), "?")])]
            for h in table_headers(rt):
                if len(h.split()) >= 3:
                    for cid, k, t in texts:
                        if k == "summary" and _norm(h) in t:
                            errs.append(f"{p.name} {cid}: summary repeats the table header {h[:60]!r} (flattened table)")
        for row in d.get("continuing_stories") or []:
            if UPDATE_PREFIX.match((row.get("latest") or {}).get("title") or ""):
                errs.append(f"{p.name} continuing {row.get('story_id')}: latest title keeps 'Update:'")
    sp = data_dir / "stories.json"
    lp = data_dir / "latest.json"
    if sp.exists() and lp.exists():
        so = json.loads(sp.read_text(encoding="utf-8"))
        build = str(so.get("generated") or "")[:10]
        for sid, t in (so.get("stories") or {}).items():
            n = t.get("next")
            if n and n.get("date") and build and n["date"] < build:
                errs.append(f"story {sid}: next {n['date']} is before the build date {build}")
            for u in t.get("updates") or []:
                if UPDATE_PREFIX.match(u.get("title") or ""):
                    errs.append(f"story {sid} {u.get('card_id')}: update title keeps 'Update:'")
        lt = json.loads(lp.read_text(encoding="utf-8"))
        for row in lt.get("continuing_stories") or []:
            n = row.get("next")
            if n and n.get("date") and build and n["date"] < build:
                errs.append(f"latest continuing {row.get('story_id')}: next {n['date']} is before the build date {build}")
    return errs


# ---- events calendar (data/events.json; docs/DATA_FORMAT.md "Events") ----
DEADLINE_KEYS = {"date", "date_text", "kind", "ref_no", "regulator", "status", "story_id", "title", "url"}
_EV_REQ = ("id", "title", "type", "group", "date", "status", "entity", "entity_name", "source", "sources",
           "outcome", "related_ids", "conditional", "public", "first_seen", "updated")
_EV_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def event_errors(data_dir: Path):
    """Schema, unique stable ids, Tier-1 sources, no aggregator date sources, neutral public voice, status and
    supersedes links, public:false never in the public edition, upcoming_events / events_index consistent,
    events.json generated == latest.json generated, deadlines[] keeps its own shape."""
    errs = []
    data_dir = Path(data_dir)
    try:
        latest = json.loads((data_dir / "latest.json").read_text(encoding="utf-8"))
    except Exception as exc:
        return [f"events: latest.json unreadable ({exc!r})"]
    private = (data_dir / CU.PEER_PRIVATE).exists()
    for x in latest.get("deadlines") or []:
        extra = set(x) - DEADLINE_KEYS
        if extra:
            errs.append(f"deadlines {x.get('date')}: unexpected keys {sorted(extra)}")
    idx = latest.get("events_index")
    path = data_dir / CU.EVENTS_FILE
    if not idx and not path.exists():
        return errs
    if not idx or not path.exists():
        return errs + ["events: events_index and data/events.json must ship together"]
    try:
        f = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return errs + [f"events: events.json unreadable ({exc!r})"]
    if f.get("schema") != CU.EVENTS_SCHEMA or f.get("schema_version") != CU.EVENTS_SCHEMA_VERSION:
        errs.append("events: schema / schema_version")
    if f.get("generated") != latest.get("generated"):
        errs.append(f"events: generated {f.get('generated')} != latest.json {latest.get('generated')}")
    evs = f.get("events")
    if not isinstance(evs, dict):
        return errs + ["events: `events` must be an object keyed by id"]
    newest = latest.get("latest") or ""
    for k, e in evs.items():
        w = f"event {k}"
        if not isinstance(e, dict):
            errs.append(f"{w}: not an object")
            continue
        if e.get("id") != k:
            errs.append(f"{w}: id {e.get('id')!r} does not match its key")
        if not CU.EVENT_ID.match(k) or len(k) > 80:
            errs.append(f"{w}: bad id")
        for r in _EV_REQ:
            if r not in e:
                errs.append(f"{w}: missing {r}")
        extra = set(e) - set(CU.EVENT_FIELDS)
        if extra:
            errs.append(f"{w}: unknown fields {sorted(extra)}")
        if e.get("type") not in CU.EVENT_TYPES_ALL:
            errs.append(f"{w}: type {e.get('type')!r}")
        if e.get("group") not in CU.EVENT_GROUPS:
            errs.append(f"{w}: group {e.get('group')!r}")
        if e.get("status") not in CU.EVENT_STATUS:
            errs.append(f"{w}: status {e.get('status')!r}")
        if e.get("entity") not in CU.EVENT_ENTITIES:
            errs.append(f"{w}: entity {e.get('entity')!r} is not a hub slug")
        if not _EV_ISO.match(str(e.get("date") or "")):
            errs.append(f"{w}: date {e.get('date')!r}")
        if e.get("date_end") is not None and not (_EV_ISO.match(str(e["date_end"])) and e["date_end"] > (e.get("date") or "")):
            errs.append(f"{w}: date_end {e.get('date_end')!r}")
        if e.get("time") is not None and not re.match(r"^\d{2}:\d{2}$", str(e["time"])):
            errs.append(f"{w}: time {e.get('time')!r}")
        for fk in ("first_seen", "updated"):
            if not _EV_ISO.match(str(e.get(fk) or "")):
                errs.append(f"{w}: {fk}")
        srcs = e.get("sources") or []
        if not srcs or e.get("source") != srcs[0]:
            errs.append(f"{w}: source must equal sources[0]")
        if e.get("public") is not False and not any(s.get("tier") == 1 for s in srcs):
            errs.append(f"{w}: public event without a Tier-1 source")
        allsrc = list(srcs) + ([e["outcome"]["source"]] if isinstance(e.get("outcome"), dict) and e["outcome"].get("source") else [])
        for s in allsrc:
            u = (s or {}).get("url") or ""
            if not CU.event_source_ok(u):
                errs.append(f"{w}: banned or aggregator date source {u}")
            if s.get("tier") != CU.tier(u):
                errs.append(f"{w}: source tier {s.get('tier')} != {CU.tier(u)}")
        if e.get("public") is not False:
            for fk in ("title", "agenda", "status_note"):
                if e.get(fk) and not CU.voice_ok(e[fk]):
                    errs.append(f"{w}: public {fk} is not neutral: {e[fk]!r}")
                if e.get(fk) and BAD_TITLE.search(e[fk]) and fk == "title":
                    errs.append(f"{w}: title wording {e[fk]!r}")
        if not private and e.get("public") is False:
            errs.append(f"{w}: public:false row in the public edition")
        end = e.get("date_end") or e.get("date") or ""
        if e.get("status") == "done" and end > newest:
            errs.append(f"{w}: done but dated after the newest edition {newest}")
        if e.get("outcome") is not None:
            if not isinstance(e["outcome"], dict):
                errs.append(f"{w}: outcome must be an object or null")
            elif e.get("status") != "done":
                errs.append(f"{w}: outcome on a {e.get('status')} event")
        sup = e.get("supersedes")
        if sup is not None:
            if sup == k or sup not in evs:
                errs.append(f"{w}: supersedes unknown id {sup!r}")
            elif evs[sup].get("status") not in ("rescheduled", "cancelled"):
                errs.append(f"{w}: superseded {sup} is {evs[sup].get('status')}, not rescheduled")
        if e.get("status") == "rescheduled" and not any(o.get("supersedes") == k for o in evs.values()):
            errs.append(f"{w}: rescheduled with no row superseding it")
        for r in e.get("related_ids") or []:
            if r not in evs:
                errs.append(f"{w}: related id {r} not in this file")
    # events_index + upcoming_events
    if idx.get("file") != "data/" + CU.EVENTS_FILE or idx.get("generated") != latest.get("generated"):
        errs.append("events_index: file / generated")
    refs = idx.get("refs") or {}
    if set(refs) != set(evs):
        errs.append("events_index: refs do not match events.json ids")
    for k, r in refs.items():
        if k in evs and r != CU.event_ref(evs[k]):
            errs.append(f"events_index ref {k}: differs from events.json")
    n_up = sum(1 for e in evs.values() if e.get("status") == "upcoming" and (e.get("date_end") or e["date"]) >= newest)
    if idx.get("upcoming") != n_up:
        errs.append(f"events_index.upcoming {idx.get('upcoming')} != {n_up}")
    want = [e["id"] for e in CU.upcoming_events(evs, newest)]
    got = [e.get("id") for e in latest.get("upcoming_events") or []]
    if got != want:
        errs.append(f"upcoming_events {got} != {want}")
    for e in latest.get("upcoming_events") or []:
        if e != evs.get(e.get("id")):
            errs.append(f"upcoming_events {e.get('id')}: differs from events.json")
    return errs


def all_errors(data_dir: Path):
    return (aggregator_errors(data_dir) + thread_errors(data_dir) + summary_errors(data_dir) + step3_errors(data_dir)
            + event_errors(data_dir))


if __name__ == "__main__":
    e = all_errors(REPO / "data")
    print(f"review checks: {len(e)} problem(s), {len(set(WARNINGS))} warning(s)")
    for w in sorted(set(WARNINGS))[:20]:
        print(" ~", w)
    for x in e[:60]:
        print(" -", x)
    sys.exit(1 if e else 0)
