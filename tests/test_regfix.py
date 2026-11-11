"""Regression tests for the three reg bugs found 11 Nov 2026 (content upgrade plan §0, §15 point 12).

Runs the exporter on the repo's own markdown for the affected days (read-only; nothing is written).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
import export_json as X  # noqa: E402

PRIVATE = (REPO / "content_upgrade.py").exists() and REPO.name != "nbfc-brief" and (REPO / "KEY-NUMBERS.md").exists()


def day_cards(day_id):
    raw = REPO / "days" / day_id
    reports = [{"key": k, "missing": False} for k in X.TAG_REPORTS if (raw / f"{k}.md").exists()]
    d = X.cards_day({"id": day_id, "reports": reports}, raw, PRIVATE)
    for c in d.get("cards") or []:
        c.pop("_u", None)
    return d["cards"]


def by_title(cards, needle):
    hits = [c for c in cards if needle in c["title"] and c.get("reg")]
    assert hits, needle
    return hits[0]


class RegBugs(unittest.TestCase):
    def test_bug1_comment_belongs_to_the_next_row(self):
        if not (REPO / "days" / "2026-11-11").exists():
            self.skipTest("no 11 Nov edition")
        cards = day_cards("2026-11-11")
        g = by_title(cards, "Gandhinagar Leasing")
        self.assertEqual(g["reg"]["regulator"], "RBI")
        self.assertNotIn("PR No.70", g["reg"]["ref_no"] or "")
        s = by_title(cards, "Settlement of Administrative")
        self.assertEqual((s["reg"]["regulator"], s["reg"]["ref_no"]), ("SEBI", "PR No.70/2026"))

    def test_bug1_six_nov_sebi_rows_carry_their_own_ref(self):
        if not (REPO / "days" / "2026-11-06").exists():
            self.skipTest("no 6 Nov edition")
        cards = day_cards("2026-11-06")
        rows = [c for c in cards if c.get("reg") and c["section"].lower().startswith("latest circulars")]
        self.assertTrue(rows)
        for c in rows:
            ref = c["reg"]["ref_no"]
            if ref and ref.startswith("HO/"):
                self.assertIn(ref, c["title"], c["id"])  # the row's own ref, never the neighbour's
        psl = by_title(cards, "RBI Press Release 2026-2027/1447")
        self.assertEqual(psl["reg"]["regulator"], "RBI")

    def test_bug2_issue_date_is_the_leading_date_not_the_extended_deadline(self):
        if not (REPO / "days" / "2026-11-04").exists():
            self.skipTest("no 4 Nov edition")
        c = by_title(day_cards("2026-11-04"), "24467")
        self.assertEqual(c["reg"]["issued"], "2026-10-27")

    def test_issue_date_never_after_edition(self):
        for day in ("2026-11-04", "2026-11-06", "2026-11-11"):
            if not (REPO / "days" / day).exists():
                continue
            for c in day_cards(day):
                if c.get("reg") and c["reg"].get("issued"):
                    self.assertLessEqual(c["reg"]["issued"], day, c["id"])

    def test_bug3_press_release_refs_do_not_collide(self):
        self.assertNotEqual(X._ref_key("PR No.70/2026"), X._ref_key("PR No.71/2026"))
        self.assertNotEqual(X._ref_key("Press Release 2026-2027/1471"), X._ref_key("Press Release 2026-2027/1447"))
        self.assertEqual(X._ref_key("RBI/2026-27/43"), X._ref_key("RBI/2026-27/43 "))
        self.assertEqual(X._ref_key_old("PR No.70/2026"), "")  # generic first token is never a fallback key
        seed = {"circulars": [{"ref_no": "PR No.70/2026", "regulator": "SEBI", "issued": "2026-11-06", "title": "A",
                               "url": "https://www.sebi.gov.in/a.html"}]}
        days = [{"id": "2026-11-11", "cards": [
            {"id": "2026-11-11-rules-1", "date": "2026-11-11", "title": "x", "reg": {"ref_no": "PR No.71/2026",
             "regulator": "SEBI", "issued": "2026-11-10", "url": None, "applies_to": None, "effective": None, "status": None}}]}]
        lc = X.build_latest_circulars(days, seed, False)
        refs = sorted(c["reg"]["ref_no"] for c in lc)
        self.assertEqual(refs, ["PR No.70/2026", "PR No.71/2026"])  # used to collapse into one 'pr' entry
        self.assertIsNone(next(c for c in lc if c["reg"]["ref_no"] == "PR No.71/2026")["reg"]["url"])


if __name__ == "__main__":
    unittest.main()
