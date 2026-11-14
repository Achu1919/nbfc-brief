"""Events calendar (plan: nbfc-events-calendar-plan.md §2, §6; docs/DATA_FORMAT.md "Events"). Same file in both
editions. Run: python3 -m unittest tests.test_events
"""
from __future__ import annotations

import copy
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "tests"))
import content_upgrade as CU  # noqa: E402
import export_json as X  # noqa: E402
import review_checks as R  # noqa: E402

DATA = REPO / "data"
PRIVATE = (DATA / CU.PEER_PRIVATE).exists()
NSE = "https://nsearchives.nseindia.com/corporate/X_01112026_SD.pdf"


def _load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def _seed_row(**k):
    row = {"id": "evt-manappuram-record-date-2026-11-18", "title": "Manappuram Finance interim dividend record date",
           "type": "record-date", "group": "company", "date": "2026-11-18", "status": "upcoming",
           "entity": "manappuram", "sources": [{"name": "NSE", "url": NSE}], "public": True}
    row.update(k)
    return row


class _T:  # minimal thread stand-in
    def __init__(self, sid, updates=(), meta=None):
        self.id, self.updates, self.meta, self.dl_next, self.dl_asof = sid, list(updates), meta or {}, None, None


def _run(seed_rows, extras=None, private=True, md=None, days=None, threads=None, newest="2026-11-14", prev=None):
    tmp = Path(tempfile.mkdtemp())
    data = tmp / "data"
    data.mkdir()
    (data / CU.EVENTS_SEED).write_text(json.dumps({"events": seed_rows}), encoding="utf-8")
    if prev is not None:
        (data / CU.EVENTS_FILE).write_text(json.dumps({"events": prev}), encoding="utf-8")
    for ed, text in (md or {}).items():
        (tmp / "days" / ed).mkdir(parents=True)
        (tmp / "days" / ed / "01-daily-watch.md").write_text(text, encoding="utf-8")
    problems = []
    days = days or [{"id": newest, "cards": []}]
    evs, _ = CU.events_export(X, days, extras or {}, data, private, problems, threads or {}, newest)
    return evs, problems


class LiveFile(unittest.TestCase):
    def test_review_checks_pass(self):
        self.assertEqual(R.event_errors(DATA), [])

    def test_shape_and_generated(self):
        f, latest = _load(CU.EVENTS_FILE), _load("latest.json")
        self.assertEqual((f["schema"], f["schema_version"]), ("nbfc-events", 1))
        self.assertEqual(list(f)[:4], ["schema", "schema_version", "generated", "events"])
        self.assertEqual(f["generated"], latest["generated"])
        self.assertEqual(_load("stories.json")["generated"], latest["generated"])
        self.assertEqual(latest["events_index"]["generated"], latest["generated"])
        self.assertEqual(len(f["events"]), len(set(f["events"])))

    def test_every_public_event_has_tier1_and_no_banned_host(self):
        for k, e in _load(CU.EVENTS_FILE)["events"].items():
            urls = [s["url"] for s in e["sources"]]
            if e["public"]:
                self.assertTrue(any(CU.tier(u) == 1 for u in urls), k)
            for u in urls:
                self.assertFalse(CU.banned(u), (k, u))
                self.assertNotRegex(u, r"chittorgarh|moneycontrol|trendlyne", k)

    def test_public_voice(self):
        bad = re.compile(r"\b(?:we|our|us|sai|achu|subscribe|apply now|invest now|attractive|buy|should)\b", re.I)
        for k, e in _load(CU.EVENTS_FILE)["events"].items():
            if e["public"]:
                for fld in ("title", "agenda", "status_note"):
                    self.assertFalse(bad.search(e.get(fld) or ""), (k, fld, e.get(fld)))

    def test_no_private_rows_in_public_edition(self):
        if PRIVATE:
            self.skipTest("private edition may carry public:false rows")
        f, latest = _load(CU.EVENTS_FILE), _load("latest.json")
        self.assertTrue(all(e["public"] for e in f["events"].values()))
        self.assertTrue(all(e["public"] for e in latest["upcoming_events"]))

    def test_upcoming_events_window(self):
        latest = _load("latest.json")
        evs = _load(CU.EVENTS_FILE)["events"]
        self.assertEqual([e["id"] for e in latest["upcoming_events"]],
                         [e["id"] for e in CU.upcoming_events(evs, latest["latest"])])
        import datetime as dt
        hi = (dt.date.fromisoformat(latest["latest"]) + dt.timedelta(days=7)).isoformat()
        for e in latest["upcoming_events"]:
            self.assertEqual(e["status"], "upcoming")
            self.assertTrue(latest["latest"] <= e["date"] <= hi or latest["latest"] <= e.get("date_end", "") <= hi, e["id"])

    def test_seeded_backfill_rows(self):
        evs = _load(CU.EVENTS_FILE)["events"]
        must = {"evt-manappuram-record-date-2026-11-18": ("2026-11-18", "record-date", "manappuram"),
                "evt-muthoot-microfin-board-2026-11-19": ("2026-11-19", "board-meeting", "muthoot-microfin"),
                "evt-iifl-egm-2026-12-04": ("2026-12-04", "egm", "iifl-finance"),
                "evt-rbi-mpc-2026-12": ("2026-12-02", "mpc", "rbi"),
                "evt-rbi-interest-rate-directions-2027-04-01": ("2027-04-01", "circular-effective", "rbi")}
        for k, (d, t, ent) in must.items():
            self.assertIn(k, evs)
            self.assertEqual((evs[k]["date"], evs[k]["type"], evs[k]["entity"]), (d, t, ent), k)
        self.assertEqual(evs["evt-rbi-mpc-2026-12"]["date_end"], "2026-12-04")
        self.assertEqual(evs["evt-iifl-egm-2026-12-04"]["time"], "11:00")
        self.assertTrue(evs["evt-rbi-interest-rate-directions-2027-04-01"]["conditional"])
        self.assertFalse(any(e["conditional"] for k, e in evs.items() if k != "evt-rbi-interest-rate-directions-2027-04-01"))

    def test_deadlines_keep_their_shape(self):
        for x in _load("latest.json")["deadlines"]:
            self.assertLessEqual(set(x), R.DEADLINE_KEYS, x)

    def test_seed_file_is_audited(self):
        seed = _load(CU.EVENTS_SEED)
        for row in seed["events"]:
            self.assertTrue(any(CU.tier(s["url"]) == 1 for s in row["sources"]), row["id"])
            self.assertIn(row["entity"], CU.EVENT_ENTITIES, row["id"])
            for s in row["sources"]:
                self.assertTrue(CU.event_source_ok(s["url"]), (row["id"], s["url"]))


class Exporter(unittest.TestCase):
    def test_drops_untiered_banned_and_aggregator_rows(self):
        rows = [_seed_row(),
                _seed_row(id="evt-manappuram-x-2026-11-20", date="2026-11-20",
                          sources=[{"url": "https://www.chittorgarh.com/ncd/x/1/"}]),
                _seed_row(id="evt-manappuram-y-2026-11-21", date="2026-11-21",
                          sources=[{"url": "https://www.moneycontrol.com/news/business/x.html"}]),
                _seed_row(id="evt-manappuram-z-2026-11-22", date="2026-11-22",
                          sources=[{"url": "https://www.livemint.com/x.html"}]),
                _seed_row(id="evt-acme-board-2026-11-23", entity="acme")]
        evs, problems = _run(rows)
        self.assertEqual(list(evs), ["evt-manappuram-record-date-2026-11-18"])
        self.assertTrue(any("no Tier-1" in p for p in problems))
        self.assertTrue(any("hub slug" in p for p in problems))

    def test_derived_rows_dedup_against_seed(self):
        url = "https://www.sebi.gov.in/legal/circulars/oct-2026/x_1.html"
        seed = [_seed_row(id="evt-sebi-x-takes-effect-2026-12-01", title="SEBI X takes effect", type="circular-effective",
                          group="regulation", date="2026-12-01", entity="sebi", sources=[{"url": url}])]
        extras = {"deadlines": [{"date": "2026-12-01", "title": "X changes take effect", "regulator": "SEBI", "url": url,
                                 "status": "deadline", "ref_no": "HO/1"},
                                {"date": "2026-12-09", "title": "Y window closes", "regulator": "RBI",
                                 "url": "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=1&Mode=0", "status": "deadline"},
                                {"date": "2026-12-10", "title": "Z, no link", "regulator": "RBI", "url": None, "status": "deadline"}]}
        before = copy.deepcopy(extras)
        evs, _ = _run(seed, extras)
        self.assertEqual(extras, before)  # deadlines[] is never touched
        self.assertIn("evt-sebi-x-takes-effect-2026-12-01", evs)
        self.assertEqual(evs["evt-sebi-x-takes-effect-2026-12-01"]["reg_ref"], "HO/1")
        self.assertEqual(sum(1 for e in evs.values() if e["date"] == "2026-12-01"), 1)
        self.assertEqual([e["type"] for e in evs.values() if e["date"] == "2026-12-09"], ["compliance-deadline"])
        self.assertFalse(any(e["date"] == "2026-12-10" for e in evs.values()))

    def test_ncd_and_story_next_lift(self):
        extras = {"mfl_ncd": {"issue": "Tranche II", "open": "2026-12-01", "close": "2026-12-12",
                              "source": {"name": "BSE", "url": "https://www.bseindia.com/downloads/UploadDocs/Notices/x.pdf"}}}
        t = _T("iifl-x", meta={"title": "IIFL Finance capital raise", "next": {
            "date": "2026-12-04", "what": "IIFL Finance EGM on the preferential issue", "known_from": "2026-11-12",
            "source": {"name": "NSE", "url": NSE}}})
        evs, _ = _run([], extras, threads={"iifl-x": t})
        self.assertIn("evt-mfl-ncd-t2-open-2026-12-01", evs)
        self.assertIn("evt-mfl-ncd-t2-close-2026-12-12", evs)
        egm = [e for e in evs.values() if e["type"] == "egm"]
        self.assertEqual([(e["entity"], e["date"], e["story_id"]) for e in egm], [("iifl-finance", "2026-12-04", "iifl-x")])

    def test_comment_overrides_and_reschedule(self):
        md = {"2026-11-14": "x\n<!-- event: id=evt-manappuram-record-date-2026-11-25; supersedes=evt-manappuram-record-date-2026-11-18; "
                            "date=2026-11-25; type=record-date; entity=manappuram; title=Manappuram Finance interim dividend record date; "
                            f"source={NSE} -->\n"
                            "<!-- event: id=evt-iifl-egm-2026-12-04; date=2026-12-04; time=11:00; type=egm; entity=iifl-finance; "
                            f"title=IIFL Finance EGM; source={NSE}; status=upcoming -->\n"}
        evs, problems = _run([_seed_row()], md=md)
        self.assertEqual(evs["evt-manappuram-record-date-2026-11-18"]["status"], "rescheduled")
        self.assertIn("evt-manappuram-record-date-2026-11-25", evs["evt-manappuram-record-date-2026-11-18"]["related_ids"])
        self.assertEqual(evs["evt-manappuram-record-date-2026-11-25"]["supersedes"], "evt-manappuram-record-date-2026-11-18")
        self.assertEqual(evs["evt-iifl-egm-2026-12-04"]["time"], "11:00")
        self.assertEqual(evs["evt-iifl-egm-2026-12-04"]["first_seen"], "2026-11-14")

    def test_comment_later_wins_and_bad_supersedes(self):
        md = {"2026-11-13": f"<!-- event: id=evt-manappuram-record-date-2026-11-18; status=cancelled; note=Withdrawn by the board -->\n",
              "2026-11-14": f"<!-- event: id=evt-manappuram-b-2026-11-30; supersedes=evt-nope-2026-01-01; date=2026-11-30; "
                            f"type=board-meeting; entity=manappuram; title=Manappuram Finance board meeting; source={NSE} -->\n"}
        evs, problems = _run([_seed_row()], md=md, days=[{"id": "2026-11-14", "cards": []}, {"id": "2026-11-13", "cards": []}])
        self.assertEqual(evs["evt-manappuram-record-date-2026-11-18"]["status"], "cancelled")
        self.assertNotIn("supersedes", evs["evt-manappuram-b-2026-11-30"])
        self.assertTrue(any("supersedes unknown" in p for p in problems))

    def test_status_done_rules(self):
        rows = [_seed_row(id="evt-sebi-a-2026-11-01", title="SEBI A takes effect", type="circular-effective", group="regulation",
                          date="2026-11-01", entity="sebi", sources=[{"url": "https://www.sebi.gov.in/a.html"}]),
                _seed_row(id="evt-manappuram-board-2026-11-02", type="board-meeting", date="2026-11-02")]
        evs, _ = _run(rows)
        self.assertEqual(evs["evt-sebi-a-2026-11-01"]["status"], "done")          # the regulatory date itself
        self.assertEqual(evs["evt-manappuram-board-2026-11-02"]["status"], "upcoming")  # needs a published outcome

    def test_public_filter_and_upcoming(self):
        rows = [_seed_row(), _seed_row(id="evt-muthoot-fincorp-internal-2026-11-15", entity="muthoot-fincorp",
                                       title="Internal reminder", date="2026-11-15", public=False),
                _seed_row(id="evt-manappuram-far-2026-11-22", date="2026-11-22"),
                _seed_row(id="evt-manappuram-edge-2026-11-21", date="2026-11-21")]
        pub, _ = _run(rows, private=False)
        priv, _ = _run(rows, private=True)
        self.assertNotIn("evt-muthoot-fincorp-internal-2026-11-15", pub)
        self.assertIn("evt-muthoot-fincorp-internal-2026-11-15", priv)
        self.assertEqual([e["id"] for e in CU.upcoming_events(pub, "2026-11-14")],
                         ["evt-manappuram-record-date-2026-11-18", "evt-manappuram-edge-2026-11-21"])

    def test_first_seen_and_updated_are_stable(self):
        evs, _ = _run([_seed_row()])
        again, _ = _run([_seed_row()], prev=evs, newest="2026-11-15")
        self.assertEqual(again["evt-manappuram-record-date-2026-11-18"]["updated"],
                         evs["evt-manappuram-record-date-2026-11-18"]["updated"])
        moved, _ = _run([_seed_row(agenda="changed")], prev=evs, newest="2026-11-15")
        self.assertEqual(moved["evt-manappuram-record-date-2026-11-18"]["updated"], "2026-11-15")

    def test_review_checks_catch_bad_files(self):
        tmp = Path(tempfile.mkdtemp())
        e = CU._ev_norm(_seed_row(), X, [], "t")
        e.update(first_seen="2026-11-14", updated="2026-11-14")
        bad = dict(e, id="evt-manappuram-bad-2026-11-19", date="2026-11-19", public=False, title="Our board meeting",
                   supersedes="evt-missing-2026-01-01")
        evs = {e["id"]: e, bad["id"]: bad}
        latest = {"generated": "G", "latest": "2026-11-14", "deadlines": [],
                  "events_index": {"file": "data/events.json", "generated": "G", "upcoming": 2,
                                   "refs": {k: CU.event_ref(v) for k, v in evs.items()}},
                  "upcoming_events": [e]}
        (tmp / "latest.json").write_text(json.dumps(latest), encoding="utf-8")
        (tmp / CU.EVENTS_FILE).write_text(json.dumps({"schema": "nbfc-events", "schema_version": 1, "generated": "X",
                                                      "events": evs}), encoding="utf-8")
        errs = " | ".join(R.event_errors(tmp))
        for frag in ("generated X", "public:false row", "supersedes unknown", "upcoming_events"):
            self.assertIn(frag, errs)


class Markdown(unittest.TestCase):
    def test_event_comments_are_stripped(self):
        line = "<!-- event: id=evt-iifl-egm-2026-12-04; date=2026-12-04; type=egm; entity=iifl-finance -->"
        self.assertTrue(X.ANY_COMMENT.match(line))
        self.assertEqual(X.strip_tag_comments("a\n" + line + "\nb"), "a\nb")
        src = (REPO / "publish.py").read_text(encoding="utf-8")
        self.assertIn("peer|event)", src)


if __name__ == "__main__":
    unittest.main()
