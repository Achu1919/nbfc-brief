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
