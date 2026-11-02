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
