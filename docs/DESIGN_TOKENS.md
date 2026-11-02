# NBFC Brief design tokens (v8, public edition)

All colour, type, spacing, radius and elevation values live as CSS custom properties at the top of `app.css`.
Components use **semantic** tokens only (`--bg`, `--text-1`, `--accent` …). Never reference a raw hex or a
primitive (`--n500`, `--a600`) inside a component rule.

Themes: **Light** and **Dark** only. On a first visit the theme follows `prefers-color-scheme`. Once the user taps
the toggle, the choice is saved in `localStorage['nbfc-theme']` and used from then on. There is no "system" state.

## Primitives

| Neutral | Hex | Accent (ink blue) | Hex |
|---|---|---|---|
| n0 | `#FFFFFF` | a50 | `#EEF2FA` |
| n50 | `#F6F7F9` | a100 | `#DCE4F5` |
| n100 | `#EEF0F3` | a200 | `#B9C8EB` |
| n200 | `#E1E4E9` | a300 | `#8EA6E0` |
| n300 | `#C9CDD5` | a400 | `#6585D2` |
| n400 | `#9EA3AE` | a500 | `#4366BE` |
| n500 | `#6B717E` | a600 | `#2F4FA3` |
| n600 | `#535965` | a700 | `#253F84` |
| n700 | `#3C414B` | a800 | `#1D3166` |
| n800 | `#272A31` | a900 | `#15244A` |
| n850 | `#1E2026` | | |
| n900 | `#17191E` | | |
| n950 | `#0E0F12` | | |

## Semantic tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F7F9` | `#0E0F12` | page background (flat, no gradients) |
| `--surface-1` | `#FFFFFF` | `#16181C` | cards, tables |
| `--surface-2` | `#EEF0F3` | `#1C1E23` | segmented track, hover |
| `--surface-3` | `#E1E4E9` | `#25282E` | pressed |
| `--chrome` | `rgba(255,255,255,.86)` | `rgba(26,28,33,.86)` | top pill and bottom nav (the only blurred surfaces) |
| `--text-1` | `#17191E` | `#ECEDF0` | primary text |
| `--text-2` | `#535965` | `#A8ADB7` | secondary text |
| `--text-3` | `#6B717E` | `#878D98` | meta and captions (≥4.5:1 on bg and surface-1) |
| `--border` | `rgba(23,25,30,.10)` | `rgba(255,255,255,.09)` | card outlines |
| `--hairline` | `rgba(23,25,30,.07)` | `rgba(255,255,255,.06)` | row dividers |
| `--border-strong` | `rgba(23,25,30,.18)` | `rgba(255,255,255,.16)` | controls |
| `--accent` | `#2F4FA3` | `#8EA6E0` | links, focus ring, active dots |
| `--accent-soft` | `rgba(47,79,163,.08)` | `rgba(142,166,224,.12)` | selected-row tint |
| `--on-accent` | `#FFFFFF` | `#0E0F12` | text on accent |
| `--up` | `#0E7A4B` | `#4BC28A` | gains |
| `--down` | `#B42330` | `#F2777A` | losses |
| `--warn` | `#8F5C06` | `#E2AC52` | rules / caution |
| `--inv` / `--on-inv` | `#17191E` / `#F6F7F9` | `#ECEDF0` / `#0E0F12` | active pill, today in the calendar, toasts |
| `--cover` | `#17191E` | `#24272D` | daily magazine cover |
| `--cover-wk` | `#253F84` | `#253F84` | weekly-edition cover |
| `--cover-ink` / `--cover-ink2` | `#F3F4F6` / `rgba(243,244,246,.68)` | same | text on covers |

Archive dots: News = accent, Rules = warn, Weekly = n700 (dark: n300).

## Type

Inter (system fallback), tabular numbers (`font-variant-numeric: tabular-nums`) on every figure.
Scale: `--t-12` 12 · `--t-13` 13 · `--t-15` 15 · `--t-17` 17 · `--t-20` 20 · `--t-24` 24 · `--t-34` clamp(30px, 8.2vw, 36px).
Headings are 650–700 weight with tight tracking. No gradient text and no emoji in headings (report emoji are stripped at render time).

## Spacing (8px grid, 4px half-step)

`--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 24 · `--sp-6` 32 · `--sp-7` 48.

## Radius

`--r-s` 6 (covers, chips) · `--r-m` 10 (pills, buttons) · `--r-l` 14 (cards) · `--r-pill` 999 (top pill, bottom nav).

## Elevation

`--elev-1` cards (hairline + 1px shadow) · `--elev-2` floating chrome · `--elev-3` covers and the open transition.
Dark theme uses deeper, lower-opacity shadows plus a 1px light edge on covers.

## Chrome

- Top pill: fixed, `--pill-h` 52px (60 on ≥900px), inset 12px, `--chrome` plus 30px blur. It is the only header: the
  page title fades out under it before the compact title, date and key stat fade in.
- Bottom nav: same glass, with a neutral `--surface-2` active indicator and the active label at weight 650 in `--text-1`.

## Light theme: warm paper (v8)

The light theme is off-white paper rather than pure white. Neutrals are warm; the ink-blue accent and the semantic colours are kept (up and warn darkened a step for contrast on the warmer surfaces). Dark theme is unchanged. Where this section and the tables above differ, this section wins.

| Token | Light | Use |
|---|---|---|
| n0 / `--surface` (cards) | `#FBFAF7` | cards, chrome-solid, on-accent |
| n50 / `--bg` | `#F3F1EC` | page background, `theme-color` meta and manifest |
| n100 / `--surface-2` | `#ECE9E2` | secondary surface |
| n200 / hairlines | `#E2DED5` | dividers; `--border` / `--hairline` / `--border-strong` are rgba(52,42,24,.13 / .09 / .20) |
| n300…n900 | `#CDC8BD` `#A29D92` `#6A655C` `#57534B` `#403C36` `#2A2824` `#1B1A17` | warm text and icon ramp |
| `--up` / `--warn` | `#0C7045` / `#86560A` | |
| `--chrome` | rgba(251,250,247,.86) | |

Measured contrast on bg, card and surface-2: text-2 6.3–7.3:1, text-3 ≥ 4.77:1, accent ≥ 6.26:1, down ≥ 5.37:1, warn ≥ 5.17:1.

### Bottom nav in light: smoky glass
- `--nav-tint-x` rgba(38,34,28,.13) graphite over the refracted frost (fallback without SVG filters: `--nav-tint` rgba(214,210,201,.78)).
- Rim `--nav-rim` rgba(255,255,255,.7) with `--nav-line` rgba(40,32,20,.16); `--nav-shadow` 0 14px 34px -10px rgba(40,32,20,.34), 0 3px 10px rgba(40,32,20,.12).
- Inactive labels `--nav-ink` = n800. The active blob stays bright (`--blob-x` white .62 over its own lifted lens) so it reads clearly against the smoky bar.
- Measured labels in light: ≥ 5.98:1 over the dark covers, 6.97:1 over the black button, 6.21:1 over text. In dark, the nav tokens map to the glass tokens.

## Liquid glass (v8 strength)
- Rim bend: band 18px (pill), 22px (nav), 14px (blob). Scale 23 / 28 / 17, so it stays under 1.33× band (monotonic, no mirror fold). Centre frost `soft` 8, saturate 1.6, and a small magnification (.02).
- Chroma `ca` .06 / .05 / .04, about 0.7px of R/B split per side at the rim (blob about 0.35px).
- Lift: pill light .28 + .72, nav light .26 + .70 (the graphite tint sits on top), dark .24 + .06; blob unchanged.
- Labels and icons stay above the glass on every wobble frame. Scroll at 4× CPU: p95 16.8 ms, 1 frame over 20 ms.

## View switching (v8)
- Each view lives in a `.vw` wrapper (`display:contents`). On a switch, the new view is built and laid out first, hidden below the old one (`.vw.stg`: visibility hidden, no pointer events). The cover-flow is measured and painted at this stage too. Only then does the old view fade (100 ms to .12, compositor only), and the new view replaces it and rises in (opacity .3 → 1). The content area is never empty.
- The tab blob and the pill title or subtitle update on tap, before the view is built.
- The Archive node is kept after it is built and re-attached on return, keyed on the edition count, the newest id and the calendar month. It is also prebuilt in `requestIdleCallback` after the first load.
- Cover-flow is virtualised. All 68 links and their labels stay in the DOM, but a cover's face is only written when it comes within 5.6 positions of the centre; far covers are `display:none`. The `--cf-*` sizes are inlined in the HTML.
- 10 rapid Markets↔Archive switches at 4× CPU: the deepest dip is one frame (30–43 ms) with the old content at 12% and the header, pill and nav still showing (before: up to 234 ms blank, ~1 s in the owner's video). Nav highlight 76–137 ms after the synthetic click, including input latency.

## Liquid glass (v7b corrections)

- Z-order: `.lg` glass (z -1) < blob `.ind` (z 0) < labels/icons (z 1) on every engine. Labels are never inside any backdrop filter, so they stay crisp and are never clipped or colour-fringed.
- Bend lives only in the outer rim: band 13px (pill) / 14px (nav) / 12px (blob), smoothstep falloff `t²(3−2t)`, scale 16/17/14 (< 1.3×band, monotonic, no fold). Centre is undisplaced.
- Chroma: `ca` .03 (.02 blob) → ≈0.25–0.3px per side, edge only.
- Centre frost: 12px soft blur, masked to the flat centre by the map's B channel (rim weight = t).
- Luminance lift (feComponentTransfer, rebuilt on theme change): pill/nav light slope .26 + .74, dark .22 + .06; blob light .30 + .72, dark .45 + .14. Measured label contrast ≥ 5.0:1 over dark covers, the black news-desk button and body text in both themes.
- Tints: `--glass-tint-x` light rgba(255,255,255,.6), dark rgba(28,30,36,.5); `--blob-x` light .45, dark .10. Blob magnification .03 (backdrop only).
- Filter region = element box in userSpaceOnUse; displacement map is a capsule SDF of the exact size, so the frosted surface is one rounded capsule.

## Liquid glass (v7)

Only three elements are glass: the top pill (`#tp>.lg`), the bottom nav (`#tabbar>.lg`) and the nav blob (`#tabbar>.ind`). Cards stay lightly frosted.

- `.lg` is a child layer, so the pill and the nav never become a backdrop root. Never put opacity, filter or mask on `.tp` or `.tabbar`; animate their transform only.
- Fallback on every engine: `--glass-tint` with `blur(16px) saturate(170%)`, a specular radial (`--glass-spec`) and rim inset lines (`--glass-rim`, `--glass-rim2`, `--glass-line`).
- On Chromium, `html.lgx` swaps in `backdrop-filter:url(#lg-*)` with the lighter `--glass-tint-x`. `lgSet()` in app.js draws a displacement map at the element's exact size:
  - R/G hold an inward edge-lens vector, ~0 in the centre and steepest at the rim.
  - B holds the rim weight.
  - The map is rebuilt on resize through a ResizeObserver.
- The filter chain:
  1. A light blur.
  2. Three displacements (scale ±ca), one per R/G/B channel, then recombined for the chromatic fringe.
  3. A sharp rim masked over a frosted centre, then saturation.
  - Keep `scale < ~1.3 × band`, or the rim folds into a mirror image.
- The blob uses an rAF spring (k 300, c 18, m 1) on its transform:
  - It stretches with velocity, with scaleX ≤ 1.25 and scaleY ≥ 0.85.
  - It squashes against the capsule wall rather than leaving it.
  - A press squash is 0.9.
  - With reduced motion it jumps.
