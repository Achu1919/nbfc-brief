# NBFC Brief: public data format (schema `nbfc-brief`, version 1)

The app reads two sources and picks the fresher one:

| Source | Path | Written by |
|---|---|---|
| JSON contract (preferred) | `/data/latest.json` and `/data/YYYY-MM-DD.json` | the publisher's daily run, or `export_json.py` |
| Legacy bundle (fallback) | `/data.js` (`window.BRIEFING = {...}`) | `publish.py` from `days/<date>/*.md` |

## Freshness rule (app side)

1. Fetch `/data/latest.json` and read the `generated` stamp from the first bytes of `/data.js` (a Range request).
2. Use the JSON only if `schema == "nbfc-brief"`, `schema_version == 1`, `today` is present, **and** `generated` is the same as or newer than data.js's `generated`.
3. If `/data.js` is absent, a valid JSON is used on its own. If the JSON is absent, invalid or older, the app uses data.js.
4. To force a source for testing, add `?src=json` or `?src=legacy`.

So a stale `data/` folder can never show an old edition. Publish both sources in the same commit, with the same `generated`.

## `data/latest.json`

```json
{
  "schema": "nbfc-brief",
  "schema_version": 1,
  "generated": "2026-10-30T07:15:09",
  "latest": "2026-10-30",
  "days":   [ <index entry>, ... ],
  "series": { "<item key>": { "YYYY-MM-DD": number|null, ... } },
  "today":  <day>
}
```

- `generated` is an IST timestamp without an offset (`YYYY-MM-DDTHH:MM:SS`).
- `days` has one index entry per edition, newest first: `id, label, weekday, is_monday, due, filed, core_found, reports[{key, section, title, missing, expected, words, sources}]`.
- `series` covers up to the last 30 editions. `null` is a gap: the figure was not in that day's report. A gap is never filled from another day.
- `series_seed` (optional) is written only when an optional seed file was merged: `{"file": "data/history.json", "dates": n, "first": "YYYY-MM-DD", "last": "YYYY-MM-DD"}`. See "Optional history seed" below.

## Optional history seed: `data/history.json`

Sparklines draw from `series`. A new edition has one point per figure, so the app shows a quiet "new" placeholder until two editions exist. To start with a history, the publisher may commit a seed of earlier figures:

```json
{ "_meta": "optional note for people, ignored",
  "<item key>": { "YYYY-MM-DD": number|null, ... } }
```

- Numbers keyed by edition date only: no text, labels, sources or notes. Keys starting with `_` are ignored.
- The seed fills only dates that are **not** live editions and are older than the newest one. A live edition always wins, including its gaps (`null`).
- Nothing is carried forward. A date without a figure stays `null` and is drawn as a gap.
- `export_json.py` merges it into `series` (the last 30 dates across seed and live editions) and sets `series_seed`. When the app falls back to `data.js`, it fetches `data/history.json` only if `latest.json` has `series_seed`, with a 2.5 s limit, and merges it with the same rules.
- A missing, malformed or slow seed is ignored: the export still succeeds and the app still renders.
- `?seed=0` disables the app-side seed fetch and `?seed=1` forces it (for testing).

### Sparkline states (app)

| Figures in the 14-date window | Shown | Column header |
|---|---|---|
| 0 | faint dashed baseline and "—" (label: "No figure yet; trend builds as editions accumulate") | Trend |
| 1 | faint dashed baseline, a quiet end dot and "new" (label: "Trend builds as editions accumulate") | Trend |
| 2–13 dates | line with an end dot, coloured by the day's direction; fewer than 4 dates are drawn right-aligned and short | Trend |
| 14 dates | full 14-date sparkline | 14d |
- `today` is the full day for `latest`. Older days load on demand from `data/<id>.json`, which has the same `<day>` shape.

## `<day>`

| Field | Type | Notes |
|---|---|---|
| `id` | `"YYYY-MM-DD"` | edition date (IST) |
| `label`, `weekday`, `is_monday` | string, string, bool | for display |
| `due`, `filed` | int | desks expected and desks filed |
| `reports[]` | object | `key` is one of `01-daily-watch`, `02-regulation`, `03-weekly-analysis` (Mondays). Also `section, kind, title, when, expected, missing, content` (Markdown), `words, sources` |
| `key_numbers` | object | `core_total, core_found, items[]` (see below) |
| `mfl_market[]` | object | "Muthoot Fincorp in the market" (see below) |
| `stories[]` | object, optional | structured news cards; if absent, the app parses them from the news report |
| `rules[]` | object, optional | structured circulars; if absent, the app parses them from the regulation report |
| `rules_note` | string, optional | one line under the circulars, e.g. "No new RBI circular today." |
| `reg_calendar[]` | object, optional | "Regulatory calendar" (see below) |

A desk that has not filed yet has `missing: true` and no `content`. The app shows it as not filed yet (today) or as not arrived (older days). A partial day is valid.

### `key_numbers.items[]`

`{key, label, group, value, change, asof, value_num, sources[{label,url}]}`

- `value_num` is the number used for the sparkline. `null` means ambiguous, so it is plotted as a gap. If `value_num` is omitted, the app parses `value`.
- Peer keys are for listed companies only. **Muthoot Finance (`muthoot`) is a peer and is never Muthoot Fincorp.** Muthoot Fincorp's own items go in `mfl_market`, never in the peer set.

### `mfl_market[]`

`{kind, name, value, asof, asof_label, source{label,url}}`

- `kind` is one of `ncd` | `rating` | `news` | `watch`.
- `asof` is ISO; `asof_label` is the human form.
- Only Muthoot Fincorp Ltd's own public items belong here (NCD issue status, ratings, filings, news).
- No source means no row.

### `stories[]`

`{title, dek, sentiment, tag, mfl_impact, sources[{label,url}]}`

- `sentiment` is read from Muthoot Fincorp's point of view: `positive` | `negative` | `watch` | `neutral`. Leave it out when the report does not say; the app then shows no chip.
- `mfl_impact` is rendered under **"Possible impact on Muthoot Fincorp"**. See the editorial rules below.

### `rules[]`

`{issuer, ref, date, title, tag, effective, applies_to_mfl, url}`

- `issuer` is `RBI` | `SEBI` | `IBBI`.
- `applies_to_mfl` is `true` | `false` | `"unclear"`. "unclear" means the report could not yet tell; it is never guessed.

### `reg_calendar[]`

`{date, issuer, item, applies_to, source}`

- `date` is `YYYY-MM-DD` and required.
- `issuer` can be `null`, shown as "issuer not stated".
- `applies_to` is free text or `null`.
- `source` is `{label,url}`, a URL string, or `null` (shown as not linked).
- On the live edition the app hides past dates, sorts by date and labels entries "today", "tomorrow" or "in N days".

## Editorial rules for `mfl_impact` (and any MFL-facing text)

- **Neutral and third person.** Describe the possible effect on Muthoot Fincorp Ltd, for example "Higher gold prices raise the collateral value behind gold loans across lenders, including Muthoot Fincorp." Do not use "we", "our", "you", or instructions to the company or the reader.
- **No NCD or securities solicitation.** Do not use wording such as subscribe, apply now, invest, book your, or limited window. Do not present coupons or yields as an offer, and do not use calls to action. Issue facts (open/close dates, subscription multiples, ratings) may be stated with their source.
- **Not advice.** The footer says the notes are neutral context and not investment or financial advice. Keep the text consistent with that.
- Every figure carries its source. A missing figure is stated as missing and never carried over from another day.
- Muthoot Finance is a separate listed peer and must never be written as, or merged with, Muthoot Fincorp.

## What must never be in the public data

The public files carry only the three desks above. Strip these before publishing:

- lesson or tutorial sections and self-test questions;
- spoken-script fields;
- salutations or names addressed to a specific reader, and "for <person>" preambles;
- internal file paths and agent prompts.

The legacy `data.js` must be cleaned the same way, because the app falls back to it.

## Producing the JSON from data.js

```
python3 export_json.py        (publish.py runs it automatically)
```

This reads `data.js` plus optional `days/<id>/structured.json` sidecars, which may hold `stories`, `rules`, `rules_note`, `reg_calendar`, `mfl_market`, `items_sources` and `items_value_num`. It writes `data/<id>.json` and `data/latest.json` with the same `generated`.

To check the output: `python3 tests/test_contract.py data`.

## Story tags (search and filters; additive)

Every `data/<id>.json` day (and `latest.json` → `today`) carries three additive fields. `data.js` does not carry them, and no existing field changes.

| Field | Where | Notes |
|---|---|---|
| `story_tags[]` | day | one entry per story unit, in report order |
| `tags` | day, and each `latest.json` → `days[]` index entry | union of the day's story tags |
| `tag_labels` | day, and `latest.json` top level | `{slug: display name}` for every slug used in that file (latest.json: all days) |

Stories are not separate objects in the reports (the app parses them from Markdown), so tags sit in a parallel list that points back at the text:

```json
{"n": 1, "report": "01-daily-watch", "section": "URGENT / High Impact", "kind": "story",
 "title": "Muthoot Finance explains its Stage 3 jump: ...",
 "tags": {"companies": ["muthoot-finance"], "regulators": ["rbi"], "topics": ["asset-quality", "gold-loan", "results"]}}
```

- `report` is the report `key`; `section` is the `##` heading without emoji; `title` is the story's bold lead, `###` heading or first sentence (plain text, max ~160 chars).
- `kind`: `story` (numbered items under "URGENT / High Impact"), `circular` (items under "New Regulatory Updates"), `calendar` ("Regulatory calendar" lines), `analysis` (one per `##` section of the Monday weekly), `item` (every other bullet, paragraph or table row in a news section).
- Skipped: the preamble, "Key numbers", source lists and "sources checked" checklists, and "No significant developments" / "No new …" lines.
- `tags` always has all three keys: `companies`, `regulators`, `topics`. Each is a sorted, de-duplicated list of lowercase kebab-case slugs, possibly empty.
- If a day has structured `stories[]`, `rules[]` or `reg_calendar[]` (sidecar), each of those objects also gets the same `tags` object.

**Vocabulary**

- regulators: `rbi`, `sebi`, `ibbi`, `mca`, `nhb`, `irdai`, `govt`
- topics: `gold-loan`, `ncd`, `rating`, `results`, `circular`, `funding`, `rates`, `gold-price`, `markets`, `asset-quality`, `microfinance`, `digital-lending`, `ipo`, `m-and-a`, `enforcement`, `macro`, `housing-finance`, `vehicle-finance`, `policy`
- companies: `muthoot-fincorp`, `muthoot-finance`, `muthoot-microfin`, `manappuram`, `bajaj-finance`, `bajaj-housing-finance`, `shriram-finance`, `iifl-finance`, `lic-housing-finance`, `cholamandalam`, `poonawalla-fincorp`, `l-and-t-finance`, `hdb-financial`, `tata-capital`, `aditya-birla-capital`, `piramal-finance`, `mahindra-finance`, `pnb-housing-finance`, `equitas-sfb`, `navi-finserv`, `sbi`, `hdfc-bank`, `icici-bank`, `axis-bank`, `kotak-mahindra-bank`. The list can grow; read display names from `tag_labels`.
- **`muthoot-finance` (listed peer) and `muthoot-fincorp` (Muthoot Fincorp Ltd) are separate slugs and never merged.**

**How tags are derived** (`export_json.py`, `tag_day`)

- Word-boundary keyword regexes over the story title and body, read from the repo's own `days/<id>/<key>.md`. URLs are stripped first, so a link alone never adds a tag.
- "Possible impact on Muthoot Fincorp" / "why it matters" lines are not used for matching, so a story is tagged by what it is about, not by its impact note.
- Companies and topics named in the section heading apply to every item in it (e.g. "Muthoot Fincorp in the market" → `muthoot-fincorp`, "Credit Rating Actions" → `rating`).
- Items under "New Regulatory Updates" that name a regulator also get `circular`.
- Failure-safe: if tagging fails for a day, that day is exported without tag fields and publishing continues.

**Override.** Put an HTML comment on its own line inside the story (right under its first line is clearest):

```
<!-- tags: companies=muthoot-finance,manappuram; regulators=rbi; topics=gold-loan,results -->
```

Each key given replaces the derived list for that story; keys left out keep the derived tags. `publish.py` removes these lines, so they never reach `data.js`, the report `content` or the page.

## Gold and LTV (`gold`, additive)

When the day's `01-daily-watch` report has a `## 🪙 Gold and LTV` table, the day (in `data/<id>.json` and in `latest.json` → `today`) carries a top-level `gold` object. **If the section is missing, there is no `gold` key, and the app hides the card.** Past editions have no table, so `gold` starts with the first edition that has one. Earlier history comes only from the series (see below).

The table uses fixed row labels; the exporter matches them by their start:

| Item (row label starts with) | → field |
|---|---|
| `IBJA 999` | `ibja.rate_999` (Value), `ibja.prev_999` (Previous) |
| `IBJA 916` | `ibja.rate_916`, `ibja.prev_916` |
| `Gold spot US$/oz` | `spot.usd_oz`, `spot.prev_usd_oz` |
| `Gold spot ₹/10g` | `spot.inr_10g` (its Source link → `spot.inr_source`) |
| `AGLOC max LTV 85%` / `80%` / `75%` | `agloc.ltv_85` / `ltv_80` / `ltv_75` (Previous → `agloc.prev.*`) |
| `AGLOC jewellery reference` | `agloc.ref_price` |

Columns are `Item | Value | Previous | Change | Effective | Source`. `Change` is not read: the UI works out the change from the current and previous values.

```json
"gold": {
  "ibja":  {"rate_999": 13752, "rate_916": 12599, "prev_999": 14005, "prev_916": 12829, "session": "PM",
            "date": "2026-11-02", "prev_date": "2026-10-30", "source": "https://ibjarates.com/"},
  "spot":  {"usd_oz": 3990.4, "prev_usd_oz": 4012.1, "inr_10g": null, "as_of": "2026-11-03 07:10 IST",
            "source": "https://www.reuters.com/markets/commodities/", "inr_source": null},
  "agloc": {"ltv_85": 10709, "ltv_80": 10079, "ltv_75": 9449, "ref_price": 12599, "from": "2026-11-03", "to": "2026-11-03",
            "prev": {"ltv_85": 10904, "ltv_80": 10263, "ltv_75": 9621, "ref_price": 12828, "from": "2026-10-31", "to": "2026-11-02"},
            "source": "https://www.agloc.org/"}
}
```

- Numbers: thousands separators (including Indian `1,23,456`), `₹`, `Rs` and `US$` are stripped. `—`, `-`, `n/a` or an empty cell becomes `null`. Any value can be `null`, and nothing is computed or derived.
- `ibja.session` is `AM` or `PM`, read from Effective (e.g. `2026-11-02 PM`). `ibja.date` is the date in Effective. `prev_date` is a date written in the 999 row's Previous cell (e.g. `14,005 (2026-10-30 PM)`), else `null`.
- `agloc.from` and `agloc.to` come from Effective (`2026-10-23 to 2026-10-23`); rows marked `same` share them. `agloc.prev` is `null` when no Previous value is given. Its `from` and `to` come from dates written in a Previous cell, else `null`.
- A group (`ibja`, `spot`, `agloc`) is present only if at least one of its rows is in the table.
- Failure-safe: a malformed table means no `gold` key for that day, and publishing continues.

### Gold series

`latest.json` → `series` also has `ibja999`, `ibja916` (₹/g, the latest session, normally PM), `agloc_ltv85`, `agloc_ltv80`, `agloc_ltv75` and `agloc_ref` (₹/g). `goldspot` is unchanged and still comes from Key numbers. The format is the same `{ "YYYY-MM-DD": number|null }`, with these differences:

- **Gold points are keyed by the figure's own date, not the edition date**: the IBJA rate date, and for AGLOC the period start (`from`). AGLOC periods often span days, such as Saturday to Monday. `data/history.json` → `_agloc_periods` maps each period start to its end (keys starting with `_` are notes and are ignored as series).
- Points come from `data/history.json` (the backfill), and an edition's `gold` object wins on the same date. Both the current and `prev` values are used, each on its own date. The series holds only dates up to the newest edition, and the last 30 points per key.
- These keys do not change the date axis of the other series.
- Backfill (committed 3 Nov 2026):
  - AGLOC: every published period from 1 Oct 2026, from the historic LTV table on https://www.agloc.org/. All four columns are published for these periods, and nothing is computed.
  - IBJA: trading days from 1 Oct 2026, from the "Previous 30 Days" PDF on https://ibjarates.com/. These are PM rates per 10 g divided by 10, so a figure may have one decimal.

## Cards (`cards[]`, additive)

Every day file (`data/YYYY-MM-DD.json`) and `latest.json` → `today` carry `cards[]`: one card per story, item, circular,
calendar row or analysis unit, in the same order and with the same `n` as `story_tags[]` (which stays). `data.js` never
has cards. Units with no usable title (for example a bare table header row) get no card.

| key | type | notes |
|-----|------|-------|
| `id` | string | `YYYY-MM-DD-<report>-<n>`, e.g. `2026-11-02-news-1`; seed circulars use `seed-<ref-slug>` |
| `n` | int | unit number within the edition; matches `story_tags[].n` |
| `date` | ISO date | edition date |
| `report` | `news` \| `rules` \| `weekly` | |
| `section` | string | the `##` heading the unit sits under |
| `kind` | `story` \| `item` \| `circular` \| `calendar` \| `analysis` | |
| `category` | string | one of `regulation`, `muthoot-fincorp`, `peers`, `gold`, `markets`, `results`, `ratings`, `deals`, `asset-quality` |
| `title` | string | heading or lead sentence, bracket tags (`[NEW]`, `[CIRCULAR]` …) and list numbers removed |
| `summary` | string \| null | at most 2 sentences of plain text; never the impact line |
| `impact` | string \| null | the "Possible impact on Muthoot Fincorp:" line, text only; null when absent |
| `source` | `{name, url}` \| null | first cited link; `name` from a domain map (RBI, SEBI, Economic Times …). Links to exa.ai, stockfin.ai, trackliveprice, makro.live and stockwatch.live are never used |
| `tags` | `{companies, regulators, topics}` | same slugs as `story_tags` |
| `reg` | object | circular cards only, see below |

Category: rules-report units are `regulation`; news sections map by section name (gold, results, ratings,
deals, asset quality, peers, markets, Muthoot Fincorp); anything else falls back to tag priority. A tags comment may set it:
`<!-- tags: category=ratings -->`.

### `reg` (circular cards)

`{ref_no, regulator, applies_to[], issued, effective, status, url}`

- `ref_no`: the reference exactly as published (e.g. `RBI/2026-27/301 DoR.AML.REC.253/14.06.001/2026-27`,
  `HO/(201)2026-DDHS-POD1/I/24467/2026`, `IBBI/CIRP/109/2026`).
- `regulator`: `RBI`, `SEBI`, `IBBI`, `NHB`, `FIU-IND`, …
- `applies_to`: slugs such as `nbfcs`, `banks`, `arcs`, `aifis`, `hfcs`, `debenture-trustees`, `intermediaries`, `fpis`.
- `issued`, `effective`: ISO dates. `status`: `new` \| `draft` \| `in-force` \| `deadline`. `url`: the official page.
- Parsed from the markdown (Reference / Addressed to / effective lines). An override comment under the `### ` heading wins:
  `<!-- reg: ref=RBI/2026-27/301; applies=nbfcs,banks; issued=2026-10-27; effective=2026-10-27; status=new; title=... -->`
- Unknown fields are `null`, never guessed. A circular card gets `reg` only when it has a ref no., an official link or an
  override.
- `<!-- tags: -->`, `<!-- reg: -->` and `<!-- ncd: -->` comments are stripped from `data.js` and from all text fields.

## `latest.json` → `latest_circulars[]`

Circular cards (with `reg`) from the last 10 days of editions (newest edition inclusive), newest `reg.issued` first. The
first coverage of each instrument is kept (dedup by the first token of `ref_no`). Verified entries from
`data/circulars_seed.json` are merged in: they fill unknown `reg` fields of a matching card and add instruments the
editions did not cover.

`data/circulars_seed.json`:

```json
{"circulars": [{"ref_no": "...", "regulator": "RBI", "title": "...", "summary": "...", "issued": "YYYY-MM-DD",
                "effective": null, "applies_to": ["nbfcs"], "status": "new", "url": "https://www.rbi.org.in/..."}],
 "deadlines": [{"date": "YYYY-MM-DD", "title": "...", "regulator": "SEBI", "ref_no": "...", "url": "...", "status": "deadline"}]}
```

Only official sources (rbi.org.in, sebi.gov.in, ibbi.gov.in, nhb.org.in, fiuindia.gov.in). Entries without `url`,
`ref_no` or `issued` are ignored.

## `latest.json` → `deadlines[]`

`{date, title, regulator, ref_no, url, status}` from calendar, deadline and watchlist sections, circular `effective`
dates and the seed. Upcoming first (ascending), then past items newest first; items more than 30 days before the newest
edition are dropped. Same-date rows that describe the same thing are merged. `regulator`, `ref_no` and `url` may be null.

## `mfl_ncd` (day files and `latest.json`, both levels)

Status of a current Muthoot Fincorp public NCD issue, or `null` when there is none. Never Muthoot Finance. Status only,
no solicitation or rate card.

`{issue, open, close, size_cr, rating, coupon_range, bids: [{date, times_subscribed}], status, source: {name, url}}`

- `status`: `open` \| `closed` \| `upcoming`. `bids` accumulate across editions for the same issue, oldest first.
- Parsed from Muthoot Fincorp NCD lines; sources are the exchange, company IR / offer documents, or Chittorgarh for bids.
- Override: `<!-- ncd: issue=Tranche I; open=2026-10-23; close=2026-11-05; size_cr=500; rating=...; status=open -->`,
  or `<!-- ncd: none -->` to force `null`.
- Fields not in the edition (e.g. `coupon_range`) are `null`.

Public data never has `lessons`, `quiz` or any `teaching` key or category (`tests/test_contract.py` checks this).
