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
