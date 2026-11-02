# NBFC Brief

A daily summary of public news, market data and RBI/SEBI/IBBI regulatory updates for India's non-banking financial companies (NBFCs), with a weekly analysis on Mondays.

- `days/<YYYY-MM-DD>/01-daily-watch.md`: news, markets, key numbers and the Muthoot Fincorp market table
- `days/<YYYY-MM-DD>/02-regulation.md`: new RBI/SEBI/IBBI instruments, items that did not move, regulatory calendar
- `days/<YYYY-MM-DD>/03-weekly-analysis.md`: Monday weekly analysis and sector scorecard
- `regulatory-log.md`: one line per instrument checked
- `publish.py` builds `data.js` from the markdown (uses `keynumbers.py`); `index.html` / `reader.html` render it

Build: `python publish.py`

Independent summary of public information; not an official view of Muthoot Fincorp Ltd. Every figure links to its public source. Nothing here is investment advice or an offer of any security.
