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

## Read: "Jump to section" row (fix/reader-chips, 13 Nov 2026)

- The section chips at the top of each Read desk (News, Rules, Weekly) are one row that scrolls sideways: `nav.toc[aria-label="Jump to section"] > .toc-s.fx-sc`. They never wrap, so the article starts on the first screen at 360 and 412 px.
- The row is sticky under the top pill (`--toc-top`, `--toc-h` on `.art`). Once it sticks, app.js adds `.stuck` and a glass bar fades in behind it. Headings in an article that has the row (`.art.has-toc`) get a `scroll-margin-top` that clears the row.
- Active chip: an IntersectionObserver band just under the row, plus a rAF-throttled scroll check, picks the last heading above that line. Its chip gets `aria-current="true"` and is scrolled to the middle of the row (smooth unless reduced motion). Tapping a chip marks it straight away.
- Jumps: the article's `content-visibility:auto` chunks only have a 640px height guess until painted, so jumps used to land hundreds of px off. `tocGo()` paints every chunk once (`.art.cv-all`), scrolls, then corrects after `scrollend`.
- The scroller sits inside its own box with the `.fx-sc` edge fade, so it never makes the page wider than the screen. Chips press with the todo-app spring; reduced motion turns the transitions off.

## Topic hubs: list first, then each company's or regulator's own page (feat/hub-pages, 13 Nov 2026)

- **Routes:** `#/topic/<hub>` opens on a list; `#/topic/<hub>/<entity>` is that entity's page (app.js passes the key as `hub/entity`). `#/peer/<slug>` still works and draws the same page as `#/topic/peers/<slug>` (`?pi=` too). An unknown entity shows "Nothing in <hub> names …" with a link back to the list. Back, deep links and cold loads all work; a reload on an entity page works offline once the data has been seen.
- **Which hubs:** Peers, Results, Ratings, Deals and Asset quality list companies. Regulation lists regulators. Gold lists two themes ("Gold price & AGLOC" and "Gold-loan rules") and then the lenders. **Skipped:** Muthoot Fincorp, because it is one company already; Markets, because index, rate and flow numbers live in the Markets tab and most of its items name no company; and Teaching in the private edition, which is lessons.
- **Entities come from the data:** the companies and regulators come from the published tags (`story_tags` / the search index's `tg`), so a new name in tomorrow's data gets a row without a code change. `ALIAS` in hubs.js folds other spellings of a slug (`baf` → `bajaj-finance`, `mfl` → `muthoot-fincorp`, …). `SHORT` holds the names the briefs use in text (Chola, MFL, IIFL, …). Both are app-side only; NBFC Guru's data format is unchanged.
- **Matching rule (precision):** an item counts for an entity when it is the item's only company or regulator tag, or when its title or text names the entity. For regulators, a title that names its own regulator wins over passing tags ("RBI cancels …" counts for RBI, not IBBI). Week-level sections inherit every company of the week, so they appear under an entity only when they name it. Everything still appears in the hub's full list below.
- **The list:** Peers shows "Listed peers" first (Muthoot Finance, Manappuram, IIFL, Shriram, Bajaj, always shown), then "Muthoot Fincorp group" (Muthoot Fincorp and Muthoot Microfin, when peer stories name them), then "Other companies". Regulation shows RBI, SEBI and IBBI first, then the others. **Cutoff:** a row needs at least `max(3, ceil(hub items / 50))` items (7 on the public Peers hub today); with core rows, up to 10 more rows, otherwise up to 14. The rest sit behind "N more companies" as compact name + count rows.
- **A row:** name and value on line 1 (the latest NSE close for listed peers, else the item count), then the item count and last date with the day change (or "close <date>" when today's table has no change), then the newest headline (one whose title names the entity is preferred) with a sparkline: price for listed peers, items per edition over the last 14 editions for everything else. No figure is computed or guessed; a missing one is left out.
- **An entity page:** a header with a back link to the list (it goes back in history when the list is where you came from), then "At a glance" (price, day change, as-of, range and item counts for listed peers; items, latest, first and next deadline for others), the regulator's upcoming deadlines, "Continuing threads" (story threads naming that company or regulator, open and dormant first, from `stories.json` / `continuing_stories`; `NBCU.entThreads` in cu.js), Peer Intelligence for the company on Peers and Results (with the "With Muthoot Fincorp" figures as published), the price chart, "Items over time" by edition date (newest first, 24 at a time), and "In other topics" links to the same company's page in other hubs. The Gold price theme shows the gold card. The public edition draws only what its own data and `cu.js` carry, so no private-only parts.
- **Hub page order:** header, then the list (right under the header), then "Continuing in this topic", then the hub's own blocks and the full feed. The old peer tiles and "Other companies in the briefs" pills are replaced by the list.
- **Motion and focus:** rows and page blocks use the cascade (32 ms stagger, max 8 rows). List → page enters from the right and Back from the left. Reduced motion gives a short fade. On a new page focus moves to the `h1`. Back restores the list's scroll position and focuses the row you opened.
- **A11y:** each group is a `section` with an `h2` and a `ul role=list` of links. Each row is one link whose name starts with the entity. The "more" list is a disclosure button with `aria-expanded`. Forced-colours borders are set, and rows are at least 72 px tall, with 44 px compact rows.
- Service worker: public `v13-2026-11-13-hubpages`, private `v20-2026-11-13-hubpages`.

## Whole-card tap (feat/hub-pages, 13 Nov 2026)
Tapping anywhere on a story or news card opens the same item its title opens. Read more used to be the link for this.
- **Markup.** Each tappable card is `<article … data-tap>`. Its title is the one real link, `<h3><a class="tap-a" href="…">`. Keyboard users Tab to it and press Enter, and screen readers hear a single link per card. Nothing is stretched over the card, so text in it can still be selected.
- **Read more is gone.** Its text links (Read more / Read full report / Read this section / Open the weekly review / Full timeline) are replaced by a quiet `›` chevron, `<span class="tap-ch" aria-hidden="true">`. The title link is the accessible target.
- **Where cards are tappable:**
  - Today and older editions: `.scard` story cards and the weekly-review card `.wk`.
  - Hub feeds and company or regulator pages: `.fi` feed cards, `.rc` regulation cards and the NCD fallback card.
  - The MFL hub's own-company card `.mflp`.
  - The weekly review's sections `.wks`.
  - These were already whole-card links and are unchanged: Continuing `.cc`, circulars `.circ`, Threads `.trow`, search results `.sx-a`, Archive covers, hub list rows `.erow` and deadlines `.dl`.
  - These stay deliberately untappable as cards: the Peer Intelligence panels `.pi` and the Teaching lesson cards, because they are interactive panels, not news cards.
- **One delegated handler (app.js, "whole-card tap").** It listens on the document for pointerdown, pointermove, pointerup and pointercancel, plus scroll, dragstart, click and auxclick. A tap is ignored when any of these is true:
  - it started on or ended on a control inside the card: `a`, `button`, `input`, `select`, `textarea`, `summary`, `details`, `label`, `[role=button|link|tab]` or `[contenteditable]`;
  - the pointer moved more than 10 px;
  - the page or a horizontal scroller scrolled;
  - text is selected;
  - a native drag started (dragstart). An Android long press selects text and never fires a click, so selection stays free.
  - Ctrl, ⌘ or Shift with a click, or a middle-click, opens the item in a new tab. A plain tap calls `a.click()` on the title link, so the router, history and Back behave exactly as they do for a title tap.
- **Press state.** `.pressing` sets `scale: .985` with the spring ease and adds a faint hub-tinted glass wash (an inset shadow). On touch it waits 70 ms so a scroll doesn't flash it. Hover deepens the border and nudges the chevron. Keyboard focus on the title draws the ring on the whole card (`[data-tap]:has(.tap-a:focus-visible)`). The card uses the `scale` property, not `transform`, so it doesn't fight the cascade animation. With reduced motion only the colour changes. Forced colours get a Highlight outline. Desktop shows `cursor: pointer`.
- Service worker: public `v14-2026-11-13-cardtap`, private `v21-2026-11-13-cardtap`.

## Events calendar (feat/events-calendar, 14 Nov 2026)
Upcoming company, debt, regulatory and market dates for the watch list: Muthoot Fincorp, the five peers (Muthoot Finance, Manappuram, IIFL Finance, Shriram Finance, Bajaj Finance), Muthoot Microfin, and RBI, SEBI and IBBI. There's no sixth tab, no notifications and no private reminders.
- **Code.** `events.js` is one identical file in both repos. app.js routes to it and tells it the edition (`window.__NB.priv`). It is precached by the service worker and allowlisted in `.vercelignore`.
- **Data.** It reads `data/events.json` (schema `nbfc-events`, v1; NBFC Guru's 7 AM exporter writes it, see `docs/DATA_FORMAT.md` → "Events calendar"). It fetches the file only when `latest.json` carries `events_index`, so a site without the file makes no blind request. The Today strip uses `latest.json` → `upcoming_events` (the next 7 days, full objects). A missing, failed, malformed or empty file never throws: every block hides itself and Calendar shows a calm "No events published yet". Malformed rows are dropped one by one.
- **Public vs private.** The public edition keeps only `public:true` rows that carry an official source link, even if the file should already be public-only. Aggregator calendars (Chittorgarh, Moneycontrol, Trendlyne) are never shown as a source. The private edition adds a "Private edition only" line on rows that are not public.
- **Where it shows:**
  - **Today, "Coming up".** A row of glass cards for the next 7 days, after Continuing and before the stories. It's hidden when nothing is due.
  - **`#/calendar`.** A list grouped by date, with group filters (All, Company, Debt, Regulation, Market) and a company/regulator filter, each with counts. "Past" sits behind a toggle. `#/calendar?view=month` is a month grid in Archive's look, with event marks and a keyboard calendar using a roving tabindex: arrows, Home/End (week start and end), PageUp/PageDown (same day in the previous or next month). The day's events are listed under the grid. Switching between List and Month keeps the filter, and Back restores the month and day.
  - **`#/event/<id>`.** The detail page: type, date or range (`date`–`date_end`), IST time, status (Upcoming, Done, Cancelled, Moved), agenda, outcome card after the event, linked story or card when it resolves in that edition, sources, and related dates (for example "Earlier RBI MPC dates"). The old row of a rescheduled event shows a "Moved" card with the new date (from `supersedes` and `related_ids`), and the new row shows "Replaces". An unknown id shows "Event not found" with the ‹ Calendar link back.
  - **Company and regulator pages** (`#/topic/<hub>/<entity>`). An "Upcoming" block under At a glance, only when that entity has upcoming events.
  - **Topics.** A Calendar entry. **Search.** Events are indexed as documents, so "egm" or "record date" finds them.
- **Offline.** `events.js` is in the shell cache and `events.json` is cached like other data, so a seen event page, the calendar and the Today strip reload offline.
- **Unchanged.** The Regulation hub's "Upcoming deadlines" strip (`deadlines[]`) and the Archive calendar.
- **A11y and motion.** No horizontal overflow at 360 or 412. Focus moves to the page h1 on route change. With reduced motion there's no movement, and forced colours get borders and a Highlight selected day.
- Service worker: public `v15-2026-11-14-events`, private `v22-2026-11-14-events`.
