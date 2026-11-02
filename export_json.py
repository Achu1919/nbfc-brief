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
        "reports": [{"key": r["key"], "section": r.get("section"), "title": r.get("title"), "missing": r.get("missing"),
                     "expected": r.get("expected"), "words": r.get("words", 0), "sources": r.get("sources", 0)}
                    for r in d["reports"]],
    }


def export(site: Path) -> Path:
    payload = load_payload(site)
    days = sorted((public_day(d, _sidecar(site, d["id"])) for d in payload["days"]), key=lambda d: d["id"], reverse=True)
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
