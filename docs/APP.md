# NBFC Brief

A daily, source-linked brief on India's NBFC sector. It covers news and markets, key numbers and listed peers, RBI/SEBI/IBBI circulars, a regulatory calendar, the Monday weekly analysis, and a "Muthoot Fincorp in the market" panel.

*Independent summary of public information; not an official view of Muthoot Fincorp Ltd.*

## What's here

- `index.html`, `app.js`, `app.css`: the app, a static single page with no build step and light/dark themes.
- `manifest.webmanifest`, `sw.js`, `icons/`: the installable PWA ("NBFC Brief"). Service-worker caches are namespaced `nbfc-brief-`.
- `vercel.json`: headers only. `sw.js` is never cached; `data.js` and `data/` always revalidate.
- `docs/DATA_FORMAT.md`: the public data contract.
- `docs/DESIGN_TOKENS.md`: the design tokens.
- `export_json.py`: writes `data/latest.json` and `data/<date>.json` from `data.js`.
- `tests/test_contract.py`: validates a `data/` folder against the contract.

## Data

The app loads `data/latest.json` when it is valid and at least as fresh as `data.js`; otherwise it uses `data.js`. See `docs/DATA_FORMAT.md`.

## Run locally

```
python3 -m http.server 8000   # then open http://localhost:8000/
```

Testing aids:
- `?src=json` or `?src=legacy` forces a data source.
- `?today=YYYY-MM-DD` simulates the IST date.

## Search

- Open it with the search button in the top pill, or press `/` anywhere outside a text field. Route: `#/search?q=…&tp=…&rg=…&co=…` (topic, regulator and company slugs, comma-separated).
- `search.js` loads only when search first opens. It builds an index from this site's `data/latest.json` and `data/<id>.json` and caches it in IndexedDB (`<namespace>-search`), keyed by `latest.json` → `generated`. The service worker caches `search.js` with the shell and `data/` network-first, so search also works offline once the data has been seen.
- It covers stories, glance items, circulars, the regulatory calendar, Monday weekly analysis, MFL items and gold rows. Tags come from `story_tags[]`. Editions without them use app-side keyword heuristics. See `docs/DATA_FORMAT.md` → "App-side notes".
- Filter pills show Gold loan, NCD, Ratings, Results, Circulars and RBI, SEBI, IBBI, plus the top companies. Other tags are under "More".
- A result opens `#/<id>/read/<key>?hl=…&sec=…`, which scrolls to the item and highlights it. Recent searches are kept in localStorage.
- Keyboard: arrow keys move through the results, Enter opens one, Esc clears. The result count is announced through an aria-live region.

## Gold card

When a day carries `gold` (IBJA, spot, AGLOC), Today shows a compact card and Markets shows the full card. Each row shows the change as an absolute value and a %. Tap a sparkline to expand it (1M / All). AGLOC is drawn as steps over its period. The card is hidden when the day has no `gold`. Test fixture: `tests/fixtures/gold-day.json`.


## Topics hubs

- Bottom bar: Today, Read, Topics, Markets, Archive. Only the active tab is highlighted. Search stays in the top bar.
- `hubs.js` renders `#/topics` (2-column tile grid; tiles spring in with a 32 ms stagger, no motion under reduced motion) and the hub pages. The service worker caches it with the shell.
- Data rules for hubs and circulars are in docs/DATA_FORMAT.md, "App-side notes: Topics hubs".

## Content upgrade, step 1 (`cu.js`)

`cu.js` loads before `app.js` (both deferred) and is precached with the shell. This public file is generated from a shared source with every private-only part removed. Every new field is optional: when it is missing, null or malformed, nothing is drawn and the page looks as it did before; a block that throws is dropped on its own.

- **Readers** for the fields in the content-upgrade contract (NBFC Guru's plan §14 and §15): cards' `story_id`, `continues`, `thread_seq`, `is_update`, `dup_of`, `sources[]` (`tier` 1/2/3, `fallback`, `role`, `page`), `impact_label`; `reg.lifecycle`, `reg.deadline`, `reg.deadline_near`, `reg.comments_due`, `first_covered`; and in `latest.json` `continuing_stories` (max 8), `story_index` (with `refs`), `peer_intel`, `week_review`. A legacy `lifecycle: "deadline-near"` is read as "no stage, deadline near".
- **Lazy files:** after the first view, on idle, the app fetches `story_index.file` (normally `data/stories.json`) and then `data/peer_intel.json` (or `peer_intel_index.file`). They go through the service worker's network-first data cache, so they work offline after one online open. Skipped on Save-Data or 2G; the peer archive then loads when a peer page opens. Neither file is requested unless `latest.json` says it exists (`story_index`, `peer_intel` or `peer_intel_index`), so current data never causes a 404.
- **Today cards:** "Source: BSE +2" (tap +2 to open the tiered list, Tier 1 first, 48 px rows); lifecycle chip (Draft, Final, Effective, Superseded, Withdrawn; unknown values show as a grey chip) and a red deadline chip ("Comments close in 6 days") counted from the phone's date, so it stays right offline; an older edition shows it as at its own date; "Update N · since <date>" (`thread_seq` and `story_index.refs[id].opened`) or "Status" when today's only news on the thread is a lifecycle or deadline change (`continuing_stories[].latest.kind`); a `dup_of` card folds under its primary as "Also in: <section>"; the impact line uses `impact_label`.
- **Latest circulars:** the lifecycle chip replaces the old `reg.status` chip when present; deadline chip and Status badge as above.
- **Peers hub:** a Peer Intelligence slot above the peer tiles, only when `peer_intel` has entries from the last 21 days (no slot and no placeholder otherwise): event chips, period and date; up to six metric tiles (more behind "All N figures"; definitions behind "How these are defined"); "With Muthoot Fincorp", a table of figures as published, each with its period and source, "Not yet published for <period>" when a value is missing, and no better/worse colouring; guidance, quotes, "Not disclosed this quarter", the impact line, and the sources list. Peer tiles add "new deck" for 3 days after a deck or results.
- **Peer pages:** a Peer Intelligence history, newest entry open and earlier quarters one tap away, from `latest.json` plus `data/peer_intel.json`.
- **Today nudge:** one row ("New: Manappuram Finance Q2 FY27 investor deck →") when a peer filed on the edition date.
- **Small fixes:** the gold card's spot line uses `gold.spot.as_of_display`; the Regulation hub's deadlines show `deadlines[].date_text` ("2–4 Dec · ends in 6 days").
- **Example data (dev only):** `?fixture=content-upgrade` overlays `tests/fixtures/content-upgrade/` (overlay, stories, peer_intel; marked EXAMPLE DATA) on the real `latest.json`. It works only on localhost and on branch-preview hosts (`nbfc-*-git-<branch>-…vercel.app`, never the master alias or the production domain), and every view it touches shows an "Example data" flag. Fixture data never goes into `data/` or `latest.json`. `.vercelignore` ships only that fixture folder from `tests/`.
