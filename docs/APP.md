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
- **Impact label:** taken from the data (`impact_label`, the same on every card). Hub feeds built from the search index have no card object, so they use `NBCU.impactLabel`, the first `impact_label` in `latest.json`. Without it each edition keeps its old label.
- **Real data (11 Nov):** this branch merges NBFC Guru's `content-upgrade` data branch. `stories.json` stories carry `card_count` and `editions` (read as the thread's count; `update_count` still read as a fallback); a status-only update has `kind: "status"`.
- **Today cards:** "Source: BSE +2" (tap +2 to open the tiered list, Tier 1 first, 48 px rows); lifecycle chip (Draft, Final, Effective, Superseded, Withdrawn; unknown values show as a grey chip) and a red deadline chip ("Comments close in 6 days") counted from the phone's date, so it stays right offline; an older edition shows it as at its own date; "Update N · since <date>" (`thread_seq` and `story_index.refs[id].opened`) or "Status" when today's only news on the thread is a lifecycle or deadline change (`continuing_stories[].latest.kind`); a `dup_of` card folds under its primary as "Also in: <section>"; the impact line uses `impact_label`.
- **Latest circulars:** the lifecycle chip replaces the old `reg.status` chip when present; deadline chip and Status badge as above.
- **Peers hub:** a Peer Intelligence slot above the peer tiles, only when `peer_intel` has entries from the last 21 days (no slot and no placeholder otherwise): event chips, period and date; up to six metric tiles (more behind "All N figures"; definitions behind "How these are defined"); "With Muthoot Fincorp", a table of figures as published, each with its period and source, "Not yet published for <period>" when a value is missing, and no better/worse colouring; guidance, quotes, "Not disclosed this quarter", the impact line, and the sources list. Peer tiles add "new deck" for 3 days after a deck or results.
- **Peer pages:** a Peer Intelligence history, newest entry open and earlier quarters one tap away, from `latest.json` plus `data/peer_intel.json`.
- **Today nudge:** one row ("New: Manappuram Finance Q2 FY27 investor deck →") when a peer filed on the edition date.
- **Small fixes:** the gold card's spot line uses `gold.spot.as_of_display`; the Regulation hub's deadlines show `deadlines[].date_text` ("2–4 Dec · ends in 6 days").
- **Example data (dev only):** `?fixture=content-upgrade` overlays `tests/fixtures/content-upgrade/` (overlay, stories, peer_intel; marked EXAMPLE DATA) on the real `latest.json`. It works only on localhost and on branch-preview hosts (`nbfc-*-git-<branch>-…vercel.app`, never the master alias or the production domain), and every view it touches shows an "Example data" flag. Fixture data never goes into `data/` or `latest.json`. `.vercelignore` ships only that fixture folder from `tests/`.

## Content upgrade, step 2 (story threads)

All in `cu.js`; `app.js`, `hubs.js` and `search.js` only call it. Uses `latest.json` (`continuing_stories`, `story_index.refs`) and `data/stories.json`; no day file is needed to draw a thread.

- **Continuing stories strip** above the day's stories: up to 8 cards from `continuing_stories` (hub-colour top edge, hub, "since <opened>", title, "Today:" or "Last update 9 Nov:" with the latest update, "Status" when it was a status-only change (`latest.kind: "status"`), "Next:" when `next` is set, a dot rail and "N updates"). "All threads →" opens `#/threads`. Hidden when the list is missing or empty. An archived edition whose day file has `continuing_stories` shows its own strip, "Continuing on Tue 4 Nov".
- **Story timeline sheet** at `#/story/<id>` (aliases from `stories.json` resolve): a bottom sheet over the current view with regulator, lifecycle, deadline and Open/Dormant/Closed chips, title, "N updates · first covered <date> · <hub>", "Grew out of / Continues in" links, a dashed "Next" node when `next` is set, then updates newest first (today highlighted, `milestone` and "Status" labels, tiered source), each opening that day's report. Actions: "Open in <hub>" and "Read today's report". Opened from the strip, the card's "Update N" badge, the Threads list and hub blocks. Back, Escape, the × button, the scrim and dragging the handle down close it; closing returns to the page underneath without re-rendering it. Focus moves into the sheet, is trapped there (the page behind is `inert`) and returns to the opener. A reload on `#/story/<id>` opens it over Today. An unknown id shows "This story isn't in this edition's index" and stays on Today.
- **Before `stories.json` loads** (or offline without it): the sheet uses the `continuing_stories` entry or `story_index.refs` and says "Loading earlier updates…" / "Earlier updates load when online". If `stories.json` is older than `latest.json`, today's update comes from `continuing_stories` with "Index updating".
- **Threads** (`#/threads`, under the Topics tab): every thread since 1 Oct grouped Open / Dormant / Closed recently (closed behind a button), filterable by hub (`#/threads?f=regulation`).
- **Hubs:** "Continuing in this topic", up to 4 open or dormant threads of that hub, above the hub's feed.
- **Summaries flattened from tables:** `cleanSum()` tidies card, hub-feed and search-result summaries. Markdown pipes and `|---|` rows are dropped; a "Field/Item/Metric + Value…" header keeps only the first data row ("Status: Closed, …"), or nothing when rows can't be told apart; a headerless numeric row ("14,242.0; 14,145.2 (…); …; IBJA") keeps the figure and the source. Card source lists show each publisher once.
- **Motion:** the sheet rises on the Glide spring with a scrim fade; timeline nodes and strip cards rise with a 32 ms stagger (max 8); reduced motion gives a short fade with no movement.

## Content upgrade, step 3 (hubs, weekly review, reader links, search)

Again all in `cu.js`, with small hooks in `app.js`, `hubs.js` and `search.js`. Every field is optional; a missing one drops only its element.

- **Regulation hub, "Tracked instruments":** circulars from `data/stories.json` that carry `reg.lifecycle`, grouped Draft / Final / Effective (superseded, withdrawn or unknown stages behind one button), soonest deadline first, 4 per stage with "Show all N". Each row shows the regulator, the lifecycle chip, a deadline chip counted from today on the device, the reference number and first/last covered dates, and opens the thread's timeline. Hidden until the index loads; the circulars feed below is unchanged.
- **Upcoming deadlines:** a deadline with `story_id` opens that thread's timeline ("Timeline" marker) and keeps the source one tap away (a 48 px ↗ button). The strip is now a contained scroller: clipped in its own box (`.hsc`), so it can never widen the page, with an edge fade on the side that has more cards (`.fx-sc`, toggled by `cu.js` on scroll and resize). The search filter rows use the same scroller and fade.
- **Muthoot Fincorp hub:** "Continuing in this topic" opens with the latest Muthoot Fincorp thread as a timeline preview (its 3 newest updates, each opening its card in the reader), then up to 3 more threads. Threads of other hubs that list `muthoot-fincorp` in `companies` count too, except regulation threads.
- **Today, "This week's review":** from `week_review`, shown from its Monday (`published`) for 7 days, with up to 3 of the review's threads (most cards that week first) and "Open the weekly review". An archived edition shows its own card when its day file has `week_review`.
- **Weekly review, `#/week/<week_start>`** (under the Read tab): each section of the weekly with its summary, "Stories in this section" (thread rows from `week_review.sections[].story_ids`, else the card's `stories_ref`, each with "N this week" from `week_threads`), and "Read this section" (opens the unit with `?card=`). "Threads this week that the review didn't cover" is a collapsed list. Section summaries come from the day file of the Monday it was published; without it (offline, never opened) the titles and threads still show. An older week is looked up in the day file of `week_start + 7`.
- **Read:**
  - A unit whose card has a `story_id` gets a "Thread · Update N" pill at the end of its heading, opening the timeline. Cards are matched to headings by title, ignoring any leading "Update:" on either side.
  - On the weekly desk each `##` section ends with "Stories in this section", and the report ends with the uncovered-threads list and a link to `#/week/<date>`.
  - `?card=<card_id>` scrolls to the unit (the heading and the text under it, or the whole `##` section on the weekly) and highlights it for about 3 seconds. It works alongside `hl=`/`sec=`: Today's cards, timeline nodes and search results now link with `?card=<id>&hl=<title letters>`, and `hl=` is the fallback when a card can't be matched. An unknown card opens the report at the top.
- **Peer pages, `#/peer/<slug>?pi=<id>`:** opens that Peer Intelligence entry (expanding it if it is an older quarter), scrolls to it and highlights it. The Today nudge and the Peers hub cards link this way. An unknown id shows a toast once the archive has loaded.
- **Search (index v7, rebuilt once):**
  - Threads (title plus their update titles) rank first when the title matches and open the timeline. Peer Intelligence entries are searchable by metric labels, guidance, quotes, non-disclosures and comparison labels, and open `?pi=`. Fields that exist only in the private edition are never indexed here: this build has no code for them.
  - Source names are indexed ("BSE" finds the cards citing BSE), and the weekly sections are found by the titles of their linked threads.
  - Filters: Stage (Draft, Final, Effective, from the card's `reg.lifecycle`) and Thread ("In a story thread", cards with a `story_id`). Rows only show when something matches.
  - Thread and Peer Intelligence documents are built at load time from `data/stories.json` and `data/peer_intel.json` (cached offline), never stored, so they follow those files. The topic pages still read only the day documents.
- **Routes on reload and offline:** `#/week/<date>`, `?card=` and `?pi=` are plain hash routes, so a reload lands on them, and they render offline from the service worker's cached data (`latest.json`, the day files already opened, `stories.json`, `peer_intel.json`).
