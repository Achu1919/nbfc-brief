from __future__ import annotations

import json
import re
from datetime import date, datetime
from pathlib import Path

import keynumbers

ROOT = Path(__file__).resolve().parent
DAYS = ROOT / "days"
OUT = ROOT / "data.js"

JOBS = {
    "01-daily-watch": {
        "section": "News",
        "kind": "Daily Watch",
        "agent": "NBFC Brief",
        "when": "7:00 AM",
        "question": "What happened in markets and the sector?",
        "monday_only": False,
    },
    "02-regulation": {
        "section": "Rules",
        "kind": "Regulation",
        "agent": "NBFC Brief",
        "when": "7:00 AM",
        "question": "What changed in the rulebook?",
        "monday_only": False,
    },
    "03-weekly-analysis": {
        "section": "Weekly",
        "kind": "Weekly Analysis",
        "agent": "NBFC Brief",
        "when": "7:15 AM Mondays",
        "question": "What did the whole week mean?",
        "monday_only": True,
    },
}


def clean_inline(value: str) -> str:
    value = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"[*_`#]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def first_heading(text: str, fallback: str) -> str:
    for line in text.splitlines():
        match = re.match(r"^#{1,3}\s+(.+?)\s*$", line)
        if match:
            heading = clean_inline(match.group(1))
            if "Daily Watch" in heading:
                return "News and markets"
            if "Regulatory Daily Report" in heading or "NBFC Brief" in heading:
                return "What changed in the rules"
            if "Weekly Analysis" in heading:
                return "The week in NBFCs"
            return heading
    return fallback


URL_RE = re.compile(r"https?://[^\s<>()\[\]]+")
META_RE = re.compile(
    r"^(\*\*)?(date|published|covering)\b|\bedition\b\s*·",
    re.IGNORECASE,
)


def clip(value: str, limit: int = 220) -> str:
    """Shorten at a sentence or word boundary, never mid-word."""
    if len(value) <= limit:
        return value
    cut = value[:limit]
    stop = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    if stop >= limit * 0.6:
        return cut[: stop + 1]
    space = cut.rfind(" ")
    return (cut[:space] if space > 0 else cut).rstrip(" ,;:—-") + "…"


def is_meta_block(block: str) -> bool:
    """The edition blurb / date line at the top of a report is not a summary."""
    first = block.strip().splitlines()[0].strip()
    italic = (first.startswith("*") and first.endswith("*") and not first.startswith("**")) or (
        first.startswith("_") and first.endswith("_")
    )
    return italic or bool(META_RE.search(first))


def strip_bullet(line: str) -> str:
    return re.sub(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)", "", line)


def excerpt(text: str) -> str:
    parts: list[str] = []
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if not block or block.startswith(("#", "---", "|")) or is_meta_block(block):
            continue
        lines = [l for l in block.splitlines() if not l.lstrip().startswith(("|", "- ", "* "))]
        if not lines:
            continue
        piece = clean_inline(" ".join(strip_bullet(l) for l in lines))
        piece = re.sub(r"^\d+[.)]\s+", "", piece)
        piece = re.sub(r"^[^\w₹(\"']+", "", piece).strip()
        if piece:
            parts.append(piece)
        if len(" ".join(parts)) >= 80:
            break
    return clip(" ".join(parts), 220)


def count_sources(text: str) -> int:
    return len({u.rstrip(".,;:*_") for u in URL_RE.findall(text)})


def without_key_numbers(text: str) -> str:
    """The Key numbers tables are data, not prose: keep them out of read time."""
    sec = keynumbers.key_numbers_section(text)
    if not sec:
        return text
    lines = text.splitlines()
    return "\n".join(lines[:sec[1]] + lines[sec[2]:])


def count_words(text: str) -> int:
    return len(clean_inline(text).split())


def section_titles(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            t = re.sub(r"^[^\w]+", "", clean_inline(m.group(1)))
            if t:
                out.append(t)
    return out


def read_report(path: Path, key: str, folder: str) -> dict:
    text = path.read_text(encoding="utf-8")
    meta = JOBS[key]
    return {
        "id": f"{folder}-{key}",
        "key": key,
        "section": meta["section"],
        "kind": meta["kind"],
        "agent": meta["agent"],
        "when": meta["when"],
        "question": meta["question"],
        "monday_only": meta["monday_only"],
        "title": first_heading(text, meta["kind"]),
        "excerpt": excerpt(text),
        "content": text,
        "missing": False,
        "expected": True,
        "file": path.name,
        # additive fields (older readers ignore them)
        "sources": count_sources(text),
        "words": count_words(without_key_numbers(text)),
        "sections": section_titles(text),
    }


def empty_report(key: str, folder: str, expected: bool) -> dict:
    meta = JOBS[key]
    if not expected:
        title = "Not due today"
        excerpt_text = "This job only files on Mondays."
    else:
        title = "Did not arrive"
        excerpt_text = f"The {meta['when']} job did not leave a file."
    return {
        "id": f"{folder}-{key}",
        "key": key,
        "section": meta["section"],
        "kind": meta["kind"],
        "agent": meta["agent"],
        "when": meta["when"],
        "question": meta["question"],
        "monday_only": meta["monday_only"],
        "title": title,
        "excerpt": excerpt_text,
        "content": "",
        "missing": True,
        "expected": expected,
        "file": f"{key}.md",
        "sources": 0,
        "words": 0,
        "sections": [],
    }


def day_key_numbers(day_dir: Path, day: date) -> dict:
    """Market figures + Muthoot Fincorp market table from that day's news report only (never carried forward)."""
    path = day_dir / "01-daily-watch.md"
    if not path.exists():
        return {"origin": None, "items": [], "watchlist": [], "core_total": len(keynumbers.CORE),
                "core_found": 0, "report_id": None}
    warn = lambda msg: print(f"  warning {day_dir.name}: {msg}")
    kn = keynumbers.extract(path.read_text(encoding="utf-8"), day, warn)
    kn["report_id"] = f"{day_dir.name}-01-daily-watch"
    return kn


def build() -> dict:
    days = []
    DAYS.mkdir(parents=True, exist_ok=True)
    windows = __import__("sys").platform.startswith("win")
    for day_dir in sorted((p for p in DAYS.iterdir() if p.is_dir()), reverse=True):
        try:
            day = date.fromisoformat(day_dir.name)
        except ValueError:
            continue
        is_monday = day.weekday() == 0
        reports = []
        for key, meta in JOBS.items():
            path = day_dir / f"{key}.md"
            expected = (not meta["monday_only"]) or is_monday
            if path.exists():
                reports.append(read_report(path, key, day_dir.name))
            else:
                reports.append(empty_report(key, day_dir.name, expected))
        days.append(
            {
                "id": day_dir.name,
                "label": day.strftime("%A, %#d %B %Y") if windows else day.strftime("%A, %-d %B %Y"),
                "iso": day_dir.name,
                "weekday": day.strftime("%A"),
                "is_monday": is_monday,
                "reports": reports,
                "due": sum(1 for r in reports if r["expected"]),
                "filed": sum(1 for r in reports if not r["missing"]),
                "key_numbers": day_key_numbers(day_dir, day),
            }
        )
    return {"generated": datetime.now().isoformat(timespec="seconds"), "days": days}


if __name__ == "__main__":
    payload = build()
    OUT.write_text(
        "window.BRIEFING = " + json.dumps(payload, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"Published {len(payload['days'])} day(s) to {OUT}")
