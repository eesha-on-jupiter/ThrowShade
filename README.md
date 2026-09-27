# throwShade

throwShade: a mobile app for logging, rating and sharing the buildings you visit, like Beli for architecture.

A hackathon demo: a phone-sized local web app with no backend. See [SPEC.md](SPEC.md) for scope and [Throwing Shade — Screen Map.html](<Throwing Shade — Screen Map.html>) for the design mockups.

## Run it

```sh
cd app
python -m http.server 5173
```

Open http://localhost:5173 in Chrome. Press F12, then Ctrl+Shift+M for device mode, and pick a 390 × 844 phone (e.g. iPhone 12 Pro).

Opening `app/index.html` directly also works. The map needs internet (Leaflet and OpenStreetMap tiles).

To test on a real phone on the same Wi-Fi, open `http://<your-laptop-ip>:5173`. "Nearby" always sorts from `TS_DEMO_LOCATION` in `app/data.js` (the Chicago Loop) while `force: true` is set.

## Building data

- `app/data.js`: 59 hand-picked landmarks plus the seeded critics and their logs.
- `app/wikidata.js`: 370 Chicago-area buildings with photos, credits and Wikipedia intros. To regenerate it:
  ```sh
  python tools/fetch_wikidata.py --global 0 --local 400 --radius 20 --city Chicago
  ```
- **Pin** on the map, or a long-press, looks the spot up on OpenStreetMap (Overpass and Nominatim). Pick the building, or name it yourself, then rate it.

## Demo tips

- **You → Reset demo data** restores the seeded critics and clears your account.
- **You → Switch account** lets you sign in as @mara.k and show that your new log appears in her feed.
- Change `TS_DEMO_LOCATION` in `app/data.js` to the venue before recording.

## Files

| File | What |
| --- | --- |
| `app/index.html` | Shell |
| `app/styles.css` | Design tokens and components taken from the mockups |
| `app/app.js` | Routing, views, state (`localStorage`) |
| `app/data.js` | Hand-picked buildings, seeded critics, their logs, demo location |
| `app/wikidata.js` | Generated Chicago buildings (don't edit by hand) |
| `tools/fetch_wikidata.py` | Wikidata/Wikipedia/Commons import script |
| `app/seed-photos.js` | Generated stand-in photos for seeded posts (don't edit by hand) |
| `tools/fetch_seed_photos.py` | Fetches those photos from Wikimedia Commons categories |
| `app/facts.js` | Generated landmark status, awards, Pritzker architects, access (don't edit by hand) |
| `tools/fetch_facts.py` | Fetches those facts from Wikidata and OpenStreetMap |
| `app/fonts/` | IBM Plex Sans (from the mockup bundle) |
