# ThrowingShade — Product Spec

**Status:** Hackathon build v0.5 · **Date:** 2026-09-26

> ThrowingShade: a mobile app for logging, rating and sharing the buildings you visit, like Beli for architecture.

---

## 1. Overview

ThrowingShade is a phone app for logging and sharing opinions on the buildings you visit. Every building a person visits goes into a personal log with a 1–5 star rating. Friends' logs become a way to discover architecture worth seeing.

The UX borrows from **Beli**, the restaurant app: a friends feed, Been / Want to Visit lists, a map and clean building cards. The visual design follows `Throwing Shade — Screen Map.html` (see §9).

- **Form:** a local web app sized for a phone, recorded for the demo in browser device mode. It is not published to the App Store or Google Play.
- **Context:** built at a hackathon by a small team plus Claude, in a few hours.

## 2. Hackathon goal

The recorded demo shows this flow end to end:

1. Sign in.
2. Find a building (search, or nearby).
3. Rate it 1–5 stars, add a note and a photo.
4. See it in your Been list, on the map and in a friend's feed.
5. Open a friend's log and save that building to Want to Visit.

## 3. Decisions made

| Topic | Decision |
| --- | --- |
| Rating | 1–5 whole stars per log. No reactions or ranking. |
| Profiles | All profiles and logs are public. No private profiles, no follow approval, no private notes. |
| Architect verification | Left out. |
| Platform | Local web app, phone-sized. No native build and no backend. |
| Design | The mockups' look and layout; spec features win where the mockups differ (no ranks, head-to-head or trails). |

## 4. Core loop

```
 Visit ──► Log + rate ──► Share to feed ──► Discover next
   ▲                                             │
   └────── saved to Want to Visit ◄──────────────┘
```

## 5. Navigation

Five bottom tabs, with the mockups' square icons and a black centre "+".

| Tab | Route | Purpose |
| --- | --- | --- |
| Home | `#/feed` | Feed / Map pill toggle, "Find" button top right |
| Lists | `#/lists` | Been and Want to Visit |
| + | `#/log` | Log flow (bottom sheet) |
| Map | `#/map` | Same map as Home's Map toggle |
| You | `#/me` | Your profile |

Other routes: `#/find` (search buildings and people), `#/b/<id>` (building), `#/u/<id>` (someone's profile), `#/signin`.

## 6. Screens

| Screen | What it shows |
| --- | --- |
| Sign in | Wordmark; create a user (display name + handle) or continue as a seeded critic |
| Feed | Cards: avatar, "@maya rated **Salk Institute**", star score, image, note, "+ Want to Visit" / Open |
| Map | Filter pills (All, Been, Want to Visit, Friends' picks); greyscale map; pins coloured by style (filled = been, ring = want); style legend; Locate; **Pin** (or long-press) to add a building; bottom building card |
| What's here? (pin) | Mini map + coordinates; buildings already in the app within 120 m; OpenStreetMap buildings at the spot (name, type, address, Wikipedia badge); "+ Name it yourself" form (name, architect, year, style) → rate it |
| Find | Search field; Buildings tab (nearby when empty) and People tab with Follow buttons |
| Log 1/2 — Throw Shade | Bottom sheet: search + nearby buildings with distance |
| Log 2/2 — Your critique | Five square star buttons with caption (Throwing shade → Pilgrimage-worthy), date visited, one photo, 280-character critique, Post |
| Building | Photo (user's, else Wikimedia Commons with credit line), name, architect · year · typology · city, style chip, Community / Your rating, Throw Shade, Want to Visit, Directions, About (Wikipedia intro, address, coordinates, links to Wikipedia / OpenStreetMap / ArchDaily search / Dezeen search), Critiques / Photos tabs |
| Lists | Been (Top rated / Recent) and Want to Visit |
| Profile | Avatar, stats (Logged, Cities, Followers, Following), Follow button, Top 4, tier list (S = 5★ … C = ≤2★), By style bars, critiques; Switch account and Reset demo data on your own profile |

## 7. Data

Everything lives in the browser's `localStorage` under the key `throwingshade.v1`.

| Collection | Fields |
| --- | --- |
| `users` | id, handle, name, bio |
| `follows` | [followerId, followeeId] |
| `visits` | id, userId, buildingId, stars (1–5), note, photo (resized JPEG data URL), visitedOn, createdAt |
| `want` | userId, buildingId, createdAt |
| `places` | Buildings users pinned: id (`osm-way-…` or `pin-…`), name, architect, year, typology, style, city, country, lat, lng, address, osm, qid, image, credit, blurb, wiki, source (`osm` / `user`), addedBy, createdAt |

- Buildings are static in `app/data.js` (59 buildings, weighted to New York).
- One visit per user per building; logging again updates it and moves it to the top of feeds.
- Logging a building removes it from your Want to Visit list.
- New users follow every seeded critic, and the critics follow them back, so a new log shows up in their feeds straight away.
- If a photo overflows storage, the log saves without the photo.

## 8. Building data

Three sources, merged at load in `app.js`:

| Source | What | How |
| --- | --- | --- |
| `app/data.js` | 59 hand-picked landmarks worldwide, seeded critics and their logs | Hand-written |
| `app/wikidata.js` | 370 Chicago-area buildings (+ Wikidata photos/intros for 57 of the hand-picked ones) | Generated by `tools/fetch_wikidata.py` |
| `state.places` | Buildings users add by dropping a pin | OpenStreetMap at runtime |

**Import (`tools/fetch_wikidata.py`).** Queries Wikidata for everything with a named architect within `--radius` km of `TS_DEMO_LOCATION`, plus (optionally) the most notable buildings worldwide (`--global N`). It adds photo credits from the Commons API and 2-sentence intros from the Wikipedia API. Hand-picked buildings are pinned via their Wikipedia article titles. Responses are cached in `tools/.cache/`, and the script backs off when Wikimedia rate-limits it.

```sh
python tools/fetch_wikidata.py --global 0 --local 400 --radius 20 --city Chicago   # Chicago (current)
python tools/fetch_wikidata.py --global 450 --local 400 --radius 20 --city Chicago # + worldwide
```

**Drop a pin (runtime).**
1. Overpass API: buildings within 25 m of the pin, plus named buildings within 90 m. Two public servers, 12 s timeout each.
2. Nominatim reverse geocode in parallel: the address and city, and the fallback candidate if Overpass fails.
3. Picking an OSM building reuses an existing entry if it has the same OSM id, the same Wikidata id, or a similar name within 80 m. Otherwise it creates a new building.
4. If OSM links the building to Wikidata/Wikipedia, the app fetches the photo, intro, year and Commons credit. It ignores Wikidata items without coordinates, which usually means the tag points at a company rather than the building.
5. Lookups are cached per ~10 m in `localStorage`, and "Name it yourself" always works, even offline.

**Location.** `TS_DEMO_LOCATION` in `data.js` is the Chicago Loop. `force: true` ignores the device's real location, so the recording looks right wherever it's filmed.

**Licences.** Wikidata is CC0. Wikipedia intros are CC BY-SA, linked from each building. Commons photos show photographer and licence under the hero. OpenStreetMap data is ODbL and credited on the map. ArchDaily and Dezeen have no public API, so the app only links to their search pages.

## 9. Visual design

Taken from `Throwing Shade — Screen Map.html`:

- **Type:** IBM Plex Sans (bundled in `app/fonts`); wordmark in caps with 0.06em tracking.
- **Colour:** ink `#1f1f1f` on white; greys `#6b6b6b`, `#c8c8c8`, `#e4e4e4`. The only colour is the style palette: Brutalist `#c2410c`, Modernist `#1d6f8c`, Postmodern `#7a8b2e`, Deconstructivist `#8a4fa0`, plus Art Deco, High-tech, Contemporary and Historic in the same muted range.
- **Shapes:** 2px ink strokes on square buttons (44px targets); pill filters and toggles; 1.5px grey card borders with 6px radius; dashed borders for placeholders and secondary actions.
- **Patterns:** bottom-sheet log flow over a grey scrim, with a grabber, step counter and progress bars; underline tabs; bordered stat boxes; bar charts drawn as outlined bars.
- **Map:** greyscale OpenStreetMap tiles over the mockups' grid-paper background.

## 10. Tech

| Layer | Choice |
| --- | --- |
| App | Vanilla HTML/CSS/JS, no build step (`app/index.html`, `styles.css`, `app.js`, `data.js`) |
| Routing | Hash routes |
| Storage | `localStorage` |
| Map | Leaflet 1.9.4 from unpkg + OpenStreetMap tiles (needs internet) |
| Building data | Wikidata SPARQL (build time), Wikipedia + Commons APIs, Overpass + Nominatim (runtime) |
| Run | Any static server, e.g. `python -m http.server 5173` in `app/` |

## 11. Demo checklist

- [ ] `TS_DEMO_LOCATION` is the Chicago Loop with `force: true`; re-run the import if the demo city changes.
- [ ] Rehearse a pin drop on a building that isn't in the list; have one "Name it yourself" spot ready in case Overpass is slow.
- [ ] Record in Chrome DevTools device mode (iPhone 12/13/14, 390 × 844).
- [ ] Before each take: **You → Reset demo data**, then create a fresh account.
- [ ] Run-through: sign up → Feed → "+" → pick a nearby building → 4★, note, photo → Post → Lists → Map "Been" → You → Switch account to @mara.k → your log is at the top of her feed → back as you, "+ Want to Visit" on a friend's card.
- [ ] Have a photo on the recording machine ready to upload.
- [ ] Record a backup take in case the network drops and map tiles don't load.

## 12. Open questions

- [ ] Run the worldwide import (`--global 450`) once Chicago is signed off.
- [ ] Logo: keep the text wordmark, or design one?
