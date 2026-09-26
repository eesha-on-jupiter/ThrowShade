// throwShade — local demo web app. Vanilla JS, hash routing, state in localStorage.
(function () {
  'use strict';

  // Buildings = hand-curated (enriched from Wikidata) + Wikidata imports + places users pinned (state.places).
  const WD = window.TS_WIKIDATA || { enrich: {}, buildings: [] };
  const BUILDINGS = window.TS_BUILDINGS.map(b => Object.assign({}, b, WD.enrich[b.id] || {})).concat(WD.buildings);
  const BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
  function registerBuilding(b) {
    if (BY_ID[b.id]) Object.assign(BY_ID[b.id], b);
    else { BUILDINGS.push(b); BY_ID[b.id] = b; }
  }
  const STYLES = window.TS_STYLES;
  const KEY = 'throwingshade.v1';
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;
  const INK = '#1f1f1f';
  const LINE = '#dcdad4';
  const STAR_WORDS = ['', 'Throwing shade', 'Not for me', 'It’s fine', 'Loved it', 'Pilgrimage-worthy'];
  // What a rater liked — toggled as chips in the log sheet, shown on the feed and summed per place.
  const ASPECTS = ['Design', 'Material', 'Structure', 'Facade', 'Light', 'Space', 'Interior', 'Detail', 'Craft',
    'Context', 'Landscape', 'Views', 'Scale', 'Vibes', 'Engineering', 'Sustainability'];
  const KINDS = { building: 'Building', bridge: 'Bridge', art: 'Art', spot: 'Spot' };
  const kindOf = b => b.kind || 'building';
  const MAX_PHOTOS = 4;
  // Stand-in photos for seeded critics' posts (app/seed-photos.js), credited under the photos.
  const SEED_PHOTOS = window.TS_SEED_PHOTOS || {};
  const PHOTO_CREDITS = {};
  Object.values(SEED_PHOTOS).forEach(list => list.forEach(x => { PHOTO_CREDITS[x.url] = x.credit; }));
  const SEED_PHOTO_COUNTS = [0, 2, 0, 1, 0, 0, 3, 0, 1, 0];
  function seedPhotosFor(userId, bid, i) {
    const pool = SEED_PHOTOS[bid] || [];
    if (!pool.length) return [];
    const shift = Math.max(0, window.TS_SEED_USERS.findIndex(u => u.id === userId));
    const n = Math.min(SEED_PHOTO_COUNTS[i % SEED_PHOTO_COUNTS.length], pool.length);
    return Array.from({ length: n }, (_, k) => pool[(shift + k) % pool.length].url);
  }
  // Illustrated profile pictures offered in Edit profile (app/avatars/avatar_01.png … _32.png).
  const PRESET_AVATARS = Array.from({ length: 32 }, (_, i) => 'avatars/avatar_' + String(i + 1).padStart(2, '0') + '.png');
  // LEED badge: real, verified ratings (b.leed, hand-checked for a handful of buildings) win.
  // Everywhere else this is an illustrative demo value only — deterministic per building, clearly
  // labeled "(demo)" in the UI — never presented as a real certification for a real place.
  const LEED_LEVELS = ['Certified', 'Silver', 'Gold', 'Platinum'];
  function leedFor(b) {
    if (b.leed) return { level: b.leed, real: true };
    let h = 7;
    for (let i = 0; i < b.id.length; i++) h = (h * 31 + b.id.charCodeAt(i)) | 0;
    const n = Math.abs(h) % 10;
    const level = LEED_LEVELS[Math.min(3, Math.floor(n / 2.5))];
    return { level, real: false };
  }
  // Default "liked" aspects for seeded logs without explicit ones in data.js (TS_SEED_LIKES).
  const STYLE_LIKES = {
    Brutalist: ['Material', 'Structure', 'Scale'], Modernist: ['Design', 'Light', 'Space'], Postmodern: ['Facade', 'Detail', 'Vibes'],
    Deconstructivist: ['Design', 'Vibes', 'Facade'], 'Art Deco': ['Facade', 'Detail', 'Craft'], 'High-tech': ['Structure', 'Engineering', 'Design'],
    Contemporary: ['Design', 'Material', 'Context'], Historic: ['Craft', 'Detail', 'Facade'],
  };

  // ---------- Store ----------
  let state = load() || seed();
  state.places.forEach(registerBuilding);
  // Older saves stored a single `photo` per log and no liked aspects.
  state.visits.forEach(v => {
    if (!v.photos) v.photos = v.photo ? [v.photo] : [];
    delete v.photo;
    if (!v.likes) v.likes = [];
    // "Concept" and "Atmosphere" were folded into "Vibes".
    v.likes = [...new Set(v.likes.map(l => (l === 'Concept' || l === 'Atmosphere' ? 'Vibes' : l)))];
  });
  // (Re)apply stand-in photos to seeded posts; photos people uploaded (data: URLs) are never touched.
  if (state.seedPhotos !== 3) {
    state.visits.forEach(v => {
      const m = /^v(\d+)$/.exec(v.id);
      if (m && v.photos.every(p => !p.startsWith('data:'))) v.photos = seedPhotosFor(v.userId, v.buildingId, +m[1]);
    });
    state.seedPhotos = 3;
  }
  // Older saves predate the seeded critics' avatars.
  window.TS_SEED_USERS.forEach(s => {
    const u = state.users.find(x => x.id === s.id);
    if (u && !u.photo && s.photo) u.photo = s.photo;
    if (!u && !state.users.some(x => x.handle === s.handle)) {  // skip if someone already signed up with that handle
      state.users.forEach(o => { state.follows.push([s.id, o.id]); state.follows.push([o.id, s.id]); });
      state.users.push({ ...s });
    }
  });

  function seed() {
    const now = Date.now();
    const users = window.TS_SEED_USERS.map(u => ({ ...u }));
    const follows = [];
    users.forEach(a => users.forEach(b => { if (a.id !== b.id) follows.push([a.id, b.id]); }));
    const seedLikes = (userId, bid, stars, i) => {
      const set = (window.TS_SEED_LIKES || {})[userId + '|' + bid];
      if (set) return set.slice();
      const b = BY_ID[bid];
      return !b || stars < 3 ? [] : (STYLE_LIKES[b.style] || ['Design']).slice(0, 2 + (i % 2));
    };
    const visits = window.TS_SEED_VISITS.map(([userId, buildingId, stars, note, h], i) => ({
      id: 'v' + i, userId, buildingId, stars, note, photos: seedPhotosFor(userId, buildingId, i), likes: seedLikes(userId, buildingId, stars, i),
      visitedOn: isoDate(now - h * HOUR - (i % 4) * DAY),
      createdAt: now - h * HOUR,
    }));
    const want = window.TS_SEED_WANT.map(([userId, buildingId]) => ({ userId, buildingId, createdAt: now }));
    const lists = (window.TS_SEED_LISTS || []).map(l => ({
      id: l.id, name: l.name, ownerId: l.ownerId, members: l.members.slice(), invitesNewUsers: !!l.invitesNewUsers, createdAt: now - l.hoursAgo * HOUR,
      items: l.items.filter(([bid]) => BY_ID[bid]).map(([bid, by], i) => ({ buildingId: bid, addedBy: by || l.ownerId, createdAt: now - (l.hoursAgo - i) * HOUR })),
    }));
    return { me: null, users, follows, visits, want, places: [], lists };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.users ? Object.assign({ places: [], lists: [] }, s) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  const user = id => state.users.find(u => u.id === id);
  const me = () => user(state.me);
  const followingIds = uid => new Set(state.follows.filter(f => f[0] === uid).map(f => f[1]));
  const followerCount = uid => state.follows.filter(f => f[1] === uid).length;
  const isFollowing = (a, b) => state.follows.some(f => f[0] === a && f[1] === b);
  const visitsBy = uid => state.visits.filter(v => v.userId === uid);
  const visitsFor = bid => state.visits.filter(v => v.buildingId === bid);
  const myVisit = bid => state.visits.find(v => v.userId === state.me && v.buildingId === bid);
  const isWant = (uid, bid) => state.want.some(w => w.userId === uid && w.buildingId === bid);
  const styleColor = b => STYLES[b.style] || INK;

  function avgFor(bid) {
    const vs = visitsFor(bid);
    if (!vs.length) return { avg: null, n: 0 };
    return { avg: vs.reduce((s, v) => s + v.stars, 0) / vs.length, n: vs.length };
  }
  function topRated(limit) {
    return BUILDINGS.map(b => ({ b, a: avgFor(b.id) }))
      .filter(x => x.a.n > 0)
      .sort((x, y) => y.a.avg - x.a.avg || y.a.n - x.a.n)
      .slice(0, limit || 10);
  }
  // Recs: places you haven't logged, ranked by friends' ratings, styles you tend to love, and distance.
  function recsFor(uid, limit) {
    const visited = new Set(visitsBy(uid).map(v => v.buildingId));
    const fids = followingIds(uid);
    const styleTotals = {};
    visitsBy(uid).forEach(v => {
      const b = BY_ID[v.buildingId]; if (!b || !b.style) return;
      (styleTotals[b.style] = styleTotals[b.style] || []).push(v.stars);
    });
    const favStyles = new Set(Object.entries(styleTotals)
      .filter(([, arr]) => arr.reduce((s, n) => s + n, 0) / arr.length >= 4)
      .map(([s]) => s));
    const distMap = new Map(nearest(BUILDINGS).map(x => [x.b.id, x.d]));
    const scored = BUILDINGS.filter(b => !visited.has(b.id)).map(b => {
      const friendVs = visitsFor(b.id).filter(v => fids.has(v.userId));
      const friendAvg = friendVs.length ? friendVs.reduce((s, v) => s + v.stars, 0) / friendVs.length : 0;
      const d = distMap.has(b.id) ? distMap.get(b.id) : 9999;
      let score = 0, reason = null;
      if (friendAvg >= 4) { score += friendAvg * 3; reason = friendVs.length > 1 ? `${friendVs.length} friends loved it` : 'A friend loved it'; }
      if (!reason && favStyles.has(b.style)) { score += 4; reason = `You tend to love ${b.style}`; }
      if (!reason && d < 3) { score += 2; reason = 'Right nearby'; }
      score += Math.max(0, 2 - d / 15);
      return { b, score, reason, d };
    }).filter(x => x.reason);
    scored.sort((x, y) => y.score - x.score);
    if (scored.length < (limit || 12)) {
      const already = new Set(scored.map(x => x.b.id));
      topRated(40).forEach(x => {
        if (scored.length >= (limit || 12)) return;
        if (visited.has(x.b.id) || already.has(x.b.id)) return;
        scored.push({ b: x.b, score: 0, reason: 'Highly rated', d: distMap.get(x.b.id) });
        already.add(x.b.id);
      });
    }
    return scored.slice(0, limit || 12);
  }
  // Guides: shelves grouped by style, kind and city — built from whatever data already exists.
  function buildGuides() {
    const guides = [];
    const byStyle = {};
    BUILDINGS.forEach(b => { if (b.style) (byStyle[b.style] = byStyle[b.style] || []).push(b); });
    Object.entries(byStyle).filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 4)
      .forEach(([style, list]) => guides.push({ title: style, sub: `${list.length} places`, items: rankByRating(list) }));
    ['bridge', 'art', 'spot'].forEach(k => {
      const list = BUILDINGS.filter(b => kindOf(b) === k);
      if (list.length) guides.push({ title: KINDS[k] + 's', sub: `${list.length} places`, items: rankByRating(list) });
    });
    const byCity = {};
    BUILDINGS.forEach(b => { if (b.city) (byCity[b.city] = byCity[b.city] || []).push(b); });
    const topCity = Object.entries(byCity).sort((a, b) => b[1].length - a[1].length)[0];
    if (topCity && topCity[1].length >= 3) guides.push({ title: topCity[0], sub: `${topCity[1].length} places`, items: rankByRating(topCity[1]) });
    return guides;
  }
  function rankByRating(list) {
    return list.slice().sort((a, b) => (avgFor(b.id).avg || 0) - (avgFor(a.id).avg || 0));
  }
  function photoFor(bid) {
    const vs = visitsFor(bid).filter(v => v.photos.length).sort((a, b) => (b.userId === state.me) - (a.userId === state.me) || b.createdAt - a.createdAt);
    return vs.length ? vs[0].photos[0] : null;
  }
  // A photo from a log that actually tagged this feature; else a distinct shot of the place (the vetted
  // Commons photos first, then its Wikipedia gallery — round-robin by row so rows don't repeat); else the hero.
  function photoForAspect(b, aspect, i) {
    const tagged = visitsFor(b.id).filter(v => v.likes && v.likes.includes(aspect) && v.photos && v.photos.length)
      .sort((x, y) => (y.userId === state.me) - (x.userId === state.me) || y.createdAt - x.createdAt);
    if (tagged.length) return tagged[0].photos[0];
    const pool = (SEED_PHOTOS[b.id] || []).map(x => x.url);
    if (pool.length) return pool[i % pool.length];
    if (b.gallery && b.gallery.length) return b.gallery[i % b.gallery.length];
    return photoURL(b, 120);
  }

  // ---------- Formatting ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function isoDate(ts) { const d = new Date(ts); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.round(h / 24);
    if (d < 7) return d + 'd ago';
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function initials(name) {
    return String(name).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
  function km(a, b) {
    const R = 6371, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtKm(d) {
    if (d < 1) return Math.round(d * 1000 / 10) * 10 + ' m';
    if (d < 100) return d.toFixed(1) + ' km';
    return Math.round(d).toLocaleString('en-GB') + ' km';
  }

  // ---------- Drawing helpers ----------
  const STAR_PATH = 'M12 2.6l2.85 5.95 6.55.8-4.8 4.55 1.23 6.5L12 17.2l-5.83 3.2 1.23-6.5-4.8-4.55 6.55-.8z';
  function starSVG(fill, stroke) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  }
  function starsHTML(n, size) {
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= n ? starSVG(INK, INK) : starSVG(LINE, LINE);
    return `<span class="stars ${size || ''}" role="img" aria-label="${n} out of 5 stars">${s}</span>`;
  }
  function scoreHTML(val) {
    return `<span class="score">${val}${starSVG(INK, INK)}</span>`;
  }

  // Line icons, paths after Lucide (ISC licence) — drawn with currentColor so they follow the text colour.
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    bookmarkCheck: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="m9 10 2 2 4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    map: '<path d="M14.1 5.1 9.9 3 3.6 5.2A1 1 0 0 0 3 6.1v13.3a.7.7 0 0 0 1 .6l5-2 4.1 2.1 6.3-2.2a1 1 0 0 0 .6-.9V3.7a.7.7 0 0 0-1-.6z"/><path d="M9.9 3v15M14.1 5.1V21"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4M12 2v13"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    navigate: '<path d="m3 11 19-9-9 19-2-8z"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    switch: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    feed: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-5 4.5-9 12-10 1 7.5-3 12-5 12"/><path d="M15 9c-3 3-5 8-5 11"/>',
  };
  function icon(name, size) {
    return `<svg class="i ${size || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }
  // Hatching: architectural "shade" drawn in the building's style colour — stands in for a photo.
  function hatchURL(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#efeeea"/><path d="M-2.5 2.5l5-5M0 10L10 0M7.5 12.5l5-5" stroke="${color}" stroke-width="1.2" stroke-opacity=".42"/></svg>`;
    return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
  }
  function hatch(color) {
    return `background-image:${hatchURL(color)};background-size:10px 10px;background-repeat:repeat;`;
  }
  // Wikimedia Commons thumbnail at a given width (redirects to the scaled file).
  function commonsURL(file, w) {
    return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file).replace(/'/g, '%27') + '?width=' + w;
  }
  // Photo priority: this log's photo → any user photo of the building → Wikimedia Commons image → hatching.
  function photoURL(b, w, own) {
    return own || photoFor(b.id) || (b.image ? commonsURL(b.image, w) : null);
  }
  function ph(b, o) {
    o = o || {};
    const photo = photoURL(b, o.w || 240, o.photo);
    // The hatching sits under the photo, so a slow or failed image still shows something on-style.
    const bg = photo
      ? `background-image:url('${photo}'),${hatchURL(styleColor(b))};background-size:cover,10px 10px;background-repeat:no-repeat,repeat;background-position:center,0 0;`
      : hatch(styleColor(b));
    const go = o.go === false ? '' : ` data-go="#/b/${b.id}"`;
    let inner = o.inner || '';
    if (!photo && o.label) inner += `<span class="ph-label">${esc(o.label)}</span>`;
    if (!photo && o.initials) inner += `<span class="ph-initials">${esc(initials(b.name))}</span>`;
    return `<div class="ph ${photo ? 'photo' : ''} ${o.cls || ''}" style="${bg}${o.style || ''}"${go} aria-label="${esc(b.name)}">${inner}</div>`;
  }
  const makerLine = b => [b.architect, b.city].filter(Boolean).join(' · ');
  function likeChips(likes) {
    return likes && likes.length ? `<div class="chips likes">${likes.map(l => `<span class="chip">${esc(l)}</span>`).join('')}</div>` : '';
  }
  // A log's own photos: 1 full width, 2 side by side, 3 = one large + two, 4 = grid.
  let galleries = [];
  function gallery(list) { galleries.push(list); return galleries.length - 1; }
  function shotsHTML(photos) {
    if (!photos || !photos.length) return '';
    const list = photos.slice(0, MAX_PHOTOS);
    const g = gallery(list);
    const credits = list.map(p => PHOTO_CREDITS[p]).filter(Boolean);
    const creditLine = credits.length
      ? `<div class="shot-credit">Photo${credits.length > 1 ? 's' : ''}: ${esc([...new Set(credits.map(c => c.artist))].join(', '))} · <a href="${esc(credits[0].page)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>`
      : '';
    return `<div class="shots n${list.length}">${list.map((p, i) => `<button class="shot" data-act="viewphoto" data-g="${g}" data-i="${i}" style="background-image:url('${p}')" aria-label="View photo ${i + 1} of ${list.length}"></button>`).join('')}</div>${creditLine}`;
  }
  const phLabel = b => [b.style, b.year].filter(Boolean).join(' · ').toUpperCase();
  const byLine = b => [b.architect, b.year].filter(Boolean).join(' · ');
  function avatar(u, size) {
    const bg = u.photo ? ` style="background-image:url('${u.photo}');background-size:cover;background-position:center"` : '';
    return `<div class="avatar ${size || ''}"${bg} data-go="#/u/${u.id}" aria-label="${esc(u.name)}">${u.photo ? '' : esc(initials(u.name))}</div>`;
  }
  // The logomark: a stepped tower, half solid ink, half in the app's diagonal shade.
  let logoN = 0;
  function logoSVG(size) {
    const n = ++logoN, s = size || 28;
    const d = 'M6 21V14H8V8H10V3H14V8H16V14H18V21Z';
    return `<svg class="logo-mark" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">
      <clipPath id="lgShape${n}"><path d="${d}"/></clipPath>
      <clipPath id="lgRight${n}"><rect x="12" y="0" width="12" height="24"/></clipPath>
      <g clip-path="url(#lgShape${n})">
        <rect width="24" height="24" fill="currentColor"/>
        <g clip-path="url(#lgRight${n})">
          <rect width="24" height="24" fill="var(--paper, #fff)"/>
          <g stroke="currentColor" stroke-width="1.1">${[-8, -4, 0, 4, 8, 12, 16, 20, 24, 28].map(o => `<line x1="${o - 12}" y1="24" x2="${o + 12}" y2="0"/>`).join('')}</g>
        </g>
      </g>
      <path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter"/>
    </svg>`;
  }

  // ---------- Sound ----------
  const Sound = (() => {
    let ctx;
    function ensure() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, vol, delay) {
      try {
        const c = ensure();
        const t0 = c.currentTime + (delay || 0);
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol || 0.05, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(c.destination);
        osc.start(t0); osc.stop(t0 + dur + 0.02);
      } catch (e) { /* no audio support */ }
    }
    return {
      tap() { tone(520, 0.05, 'square', 0.025); },
      star() { tone(720, 0.07, 'sine', 0.05); },
      success() { tone(660, 0.09, 'sine', 0.05); tone(880, 0.13, 'sine', 0.05, 0.09); },
    };
  })();
  function nav(active) {
    const item = (key, href, label, ic) => `<a href="${href}" class="${active === key ? 'on' : ''}">${icon(ic)}${label}</a>`;
    return `<nav class="nav">
      ${item('home', '#/feed', 'Home', 'home')}
      ${item('lists', '#/lists', 'Lists', 'bookmark')}
      <a href="#/find" class="plus ${active === 'find' ? 'on' : ''}" aria-label="Search architecture and people">${icon('search')}</a>
      ${item('map', '#/map', 'Map', 'map')}
      ${item('you', '#/me', 'You', 'user')}
    </nav>`;
  }

  // ---------- Location ----------
  let loc = { ...window.TS_DEMO_LOCATION, demo: true };
  let locAsked = false;
  function requestLocation(cb) {
    if (window.TS_DEMO_LOCATION.force || !navigator.geolocation) { cb && cb(false); return; }
    navigator.geolocation.getCurrentPosition(
      p => { loc = { lat: p.coords.latitude, lng: p.coords.longitude, label: 'your location', demo: false }; cb && cb(true); },
      () => cb && cb(false),
      { timeout: 5000, maximumAge: 600000 }
    );
  }
  const nearest = list => list.map(b => ({ b, d: km(loc, b) })).sort((x, y) => x.d - y.d);
  const locNote = () => loc.demo ? `from ${esc(loc.label)} (demo location)` : 'from your location';

  // ---------- UI state ----------
  const root = document.getElementById('app');
  let beenMap = null, inviteSel = new Set();
  let mapKind = 'all', mapFilter = 'all', mapSel = null, map = null, mapMarkers = {}, mapView = null, pinMode = false, pinMap = null, mapFocus = false;
  let findQ = '', findTab = 'arch';
  let listSort = 'top';
  let bTab = 'critiques';
  let draft = null;
  let resetArmed = false;
  let delArmed = false;
  let epPhoto;
  const trail = [];

  // ---------- Views ----------
  function viewSignin() {
    const people = state.users.map(u => `
      <button class="row" data-act="login" data-id="${u.id}">
        ${avatar(u).replace('data-go', 'data-x')}
        <div class="grow"><b>${esc(u.name)}</b><div class="sub">@${esc(u.handle)}</div></div>
        <span class="small">${visitsBy(u.id).length} logged</span>
      </button>`).join('');
    return `<div class="screen"><div class="signin">
      <div class="mark-group">${logoSVG(40)}<div class="mark">throwShade</div></div>
      <div class="muted">Rate every building you walk into. Find the next one worth the trip.</div>
      <div class="hero-strip">${['wd-Q653584', 'wd-Q753180', 'wd-Q929965'].filter(id => BY_ID[id]).map(id => ph(BY_ID[id], { w: 360, go: false })).join('') || `<div class="ph hatch-band" style="${hatch(INK)}"></div>`}</div>
      <div class="field"><label for="su-name">Display name</label><input id="su-name" class="input" placeholder="Ada Critic" autocomplete="off"></div>
      <div class="field"><label for="su-handle">Handle</label><input id="su-handle" class="input" placeholder="ada.c" autocapitalize="none" autocomplete="off" spellcheck="false"></div>
      <button class="btn-primary" data-act="signup">Start throwing shade</button>
      <div class="caps" style="margin-top:6px">Or continue as</div>
      <div class="stack-6">${people}</div>
    </div></div>`;
  }

  function feedCard(v) {
    const u = user(v.userId), b = BY_ID[v.buildingId];
    if (!u || !b) return '';
    const mine = v.userId === state.me;
    const mv = myVisit(b.id);
    let action;
    if (mine) action = `<button class="link" data-go="#/log/${b.id}">${icon('edit', 'sm')}Edit</button>`;
    else if (mv) action = `<button class="link" data-go="#/b/${b.id}">${icon('check', 'sm')}Been · you gave ${mv.stars}★</button>`;
    else action = `<button class="link ${isSaved(b.id) ? 'on' : ''}" data-go="#/save/${b.id}">${isSaved(b.id) ? icon('bookmarkCheck', 'sm') + 'Saved' : icon('bookmark', 'sm') + 'Save'}</button>`;
    const where = [kindOf(b) !== 'building' && KINDS[kindOf(b)], b.city, ago(v.createdAt)].filter(Boolean).join(' · ');
    return `<div class="card">
      <div class="card-head">
        ${avatar(u)}
        <div class="who"><b data-go="#/u/${u.id}">${mine ? 'You' : esc(u.handle)}</b> rated <b data-go="#/b/${b.id}">${esc(b.name)}</b><div class="small muted">${esc(where)}</div></div>
      </div>
      <div class="rating-line">${starsHTML(v.stars, 'md')}<span class="small muted">${STAR_WORDS[v.stars]}</span></div>
      ${v.note ? `<div class="quote">${esc(v.note)}</div>` : ''}
      ${likeChips(v.likes)}
      ${shotsHTML(v.photos)}
      <div class="card-actions">${action}<button class="link" data-go="#/b/${b.id}">Details${icon('chevron', 'sm')}</button></div>
    </div>`;
  }

  function viewHome(tab) {
    const head = `
      <div class="topbar">${tab === 'map' ? '<div class="h1">Map</div>' : `<div class="wordmark-group">${logoSVG(24)}<div class="wordmark">throwShade</div></div>`}</div>`;
    if (tab === 'map') {
      const pill = (k, label) => `<button class="pill ${mapFilter === k ? 'on' : ''}" data-act="mapfilter" data-k="${k}">${label}</button>`;
      const kpill = (k, label) => `<button class="pill ${mapKind === k ? 'on' : ''}" data-act="mapkind" data-k="${k}">${label}</button>`;
      return `<div class="screen with-nav fixed" style="display:flex;flex-direction:column">
        ${head}
        <div class="pills">${kpill('all', 'All')}${kpill('building', 'Buildings')}${kpill('bridge', 'Bridges')}${kpill('art', 'Art')}${kpill('spot', 'Spots')}<span class="pill-sep"></span>${pill('been', 'Been')}${pill('want', 'Want to Visit')}${pill('friends', 'Friends’ picks')}</div>
        <div class="map-wrap" style="position:relative;flex:1">
          <div id="map"></div>
          <div class="map-legend closed" id="legend">
            <button class="legend-toggle" data-act="legend">${icon('layers', 'sm')}Styles</button>
            <div class="legend-items stack-6" style="gap:4px">${Object.entries(STYLES).map(([s, c]) => `<div><span class="dot" style="background:${c}"></span> ${s}</div>`).join('')}
              <div class="muted" style="margin-top:2px">● been&nbsp;&nbsp;○ want</div>
              <div class="muted">● building ■ bridge ◆ art ◉ spot</div></div>
          </div>
          <button class="btn-sq map-locate" data-act="locate" aria-label="Locate me">${icon('locate')}</button>
          <button class="btn-sq map-pinbtn" id="pinbtn" data-act="droppin" aria-label="Drop a pin to add a building">${icon('pin')}</button>
          <div class="map-hint" id="map-hint" hidden>Tap a place to add it · or long-press</div>
          <div id="map-card"></div>
        </div>
      </div>${nav('map')}`;
    }
    const fids = followingIds(state.me);
    const items = state.visits.filter(v => fids.has(v.userId) || v.userId === state.me).sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
    const body = items.length ? items.map(feedCard).join('') :
      `<div class="empty">Your feed is empty.<br>Follow some critics to see what they’re rating.</div><button class="btn dashed" data-act="findpeople">${icon('users', 'sm')}Find people</button>`;
    return `<div class="screen with-nav">${head}<div class="stack pad">${body}</div><div class="spacer"></div></div>${nav('home')}`;
  }

  function buildingRow(b, right) {
    return `<button class="row" data-go="#/b/${b.id}">
      ${ph(b, { style: 'width:38px;height:38px', go: false })}
      <div class="grow"><div class="ellipsis">${esc(b.name)}</div><div class="sub ellipsis">${esc(makerLine(b))}</div></div>
      ${right || ''}
    </button>`;
  }

  function findResults() {
    const q = findQ.trim().toLowerCase();
    const section = (title, rows) => rows.length ? `<div class="caps find-section">${title}</div>${rows.join('')}` : '';
    const personRow = u => {
      const f = isFollowing(state.me, u.id);
      return `<div class="row" data-go="#/u/${u.id}">
        ${avatar(u)}<div class="grow"><b>${esc(u.name)}</b><div class="sub">@${esc(u.handle)} · ${visitsBy(u.id).length} logged</div></div>
        <button class="btn ${f ? '' : 'on'}" data-act="follow" data-id="${u.id}">${f ? 'Following' : 'Follow'}</button>
      </div>`;
    };
    // Tap the row to open the place; the + rates it straight away (the log flow used to live on the centre button).
    const placeRow = x => `<div class="row" data-go="#/b/${x.b.id}">
        ${ph(x.b, { style: 'width:38px;height:38px', go: false })}
        <div class="grow"><div class="ellipsis">${esc(x.b.name)}</div><div class="sub ellipsis">${esc([KINDS[kindOf(x.b)] !== 'Building' && KINDS[kindOf(x.b)], makerLine(x.b), fmtKm(x.d)].filter(Boolean).join(' · '))}</div></div>
        <button class="btn-sq thin" style="width:34px;height:34px" data-go="#/log/${x.b.id}" aria-label="Rate ${esc(x.b.name)}">${icon('plus', 'sm')}</button>
      </div>`;
    const pinLink = `<button class="btn dashed" style="height:48px;width:100%;margin-top:12px" data-act="pinfrommap">${icon('pin', 'sm')}Can’t find it? Drop a pin</button>`;
    if (findTab === 'users') {
      const others = state.users.filter(u => u.id !== state.me).sort((a, b) => a.name.localeCompare(b.name));
      const people = q ? others.filter(u => u.handle.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)) : others;
      if (!people.length) return `<div class="empty" style="margin-top:12px">No users match “${esc(findQ)}”.</div>`;
      return section(q ? 'Users' : `All users · ${people.length}`, people.map(personRow));
    }
    if (!q) return section(`Nearby · ${locNote()}`, nearest(BUILDINGS).slice(0, 15).map(placeRow)) + pinLink;
    const places = nearest(BUILDINGS.filter(b => [b.name, b.architect, b.city, b.country, b.style, b.typology, KINDS[kindOf(b)]].join(' ').toLowerCase().includes(q))).slice(0, 40);
    if (!places.length) return `<div class="empty" style="margin-top:12px">No architecture matches “${esc(findQ)}”.</div>` + pinLink;
    return section('Architecture', places.map(placeRow)) + pinLink;
  }

  function viewFind() {
    return `<div class="screen with-nav">
      <div class="topbar"><div class="h1">Search</div></div>
      <div class="tabs" style="margin:0 20px 12px">
        <button class="${findTab === 'arch' ? 'on' : ''}" data-act="findtab" data-k="arch">Architecture</button>
        <button class="${findTab === 'users' ? 'on' : ''}" data-act="findtab" data-k="users">Users</button>
      </div>
      <div class="pad input-wrap">${icon('search')}<input class="input" data-input="find" value="${esc(findQ)}" placeholder="${findTab === 'users' ? 'Search users by name or handle' : 'Search buildings, bridges, art, architects, cities'}" autocomplete="off" autocapitalize="none"></div>
      <div id="results" class="stack-6 pad">${findResults()}</div>
      <div class="spacer"></div>
    </div>${nav('find')}`;
  }

  // ---------- Lists: Want to Visit (private) + custom lists shared with invited members ----------
  const myLists = () => state.lists.filter(l => l.members.includes(state.me)).sort((a, b) => b.createdAt - a.createdAt);
  const inList = (l, bid) => l.items.some(i => i.buildingId === bid);
  const isSaved = bid => isWant(state.me, bid) || myLists().some(l => inList(l, bid));
  const handles = ids => ids.map(user).filter(Boolean).map(u => '@' + u.handle);
  function listMeta(l) {
    const n = l.items.length;
    const others = handles(l.members.filter(m => m !== state.me));
    const who = l.ownerId === state.me
      ? (others.length ? 'with ' + others.slice(0, 2).join(', ') + (others.length > 2 ? ` +${others.length - 2}` : '') : 'only you')
      : 'invited by ' + handles([l.ownerId]).join('');
    return `${n} place${n === 1 ? '' : 's'} · ${who}`;
  }
  function listTile(l) {
    const first = l.items.length && BY_ID[l.items[l.items.length - 1].buildingId];
    return first ? ph(first, { w: 160, style: 'width:52px;height:52px', go: false }) : `<div class="list-icon">${icon('bookmark')}</div>`;
  }

  // Tabs: your lists, Recs and Guides (Recs/Guides from Herft's shandon-updates).
  function viewLists(tab) {
    const tabs = `<div class="tabs" style="margin:0 20px 12px">
      <button class="${tab === 'mine' ? 'on' : ''}" data-go="#/lists">My lists</button>
      <button class="${tab === 'recs' ? 'on' : ''}" data-go="#/lists/recs">Recs</button>
      <button class="${tab === 'guides' ? 'on' : ''}" data-go="#/lists/guides">Guides</button></div>`;
    let body;
    if (tab === 'recs') {
      const recs = recsFor(state.me, 12);
      body = `<div class="stack-6 pad">${recs.length ? recs.map(x => `<div class="row" data-go="#/b/${x.b.id}">
          ${ph(x.b, { style: 'width:44px;height:44px', go: false })}
          <div class="grow"><div class="ellipsis">${esc(x.b.name)}</div><div class="sub ellipsis">${esc(x.reason)}</div></div>
          <button class="btn-sq thin" style="width:36px;height:36px" data-go="#/save/${x.b.id}" aria-label="${isSaved(x.b.id) ? 'Saved' : 'Save'}">${icon(isSaved(x.b.id) ? 'bookmarkCheck' : 'bookmark', 'sm')}</button>
        </div>`).join('') : `<div class="empty">Log a few places and follow some critics — recs show up here.</div>`}</div>`;
    } else if (tab === 'guides') {
      const guides = buildGuides();
      body = `<div class="pad">${guides.length ? guides.map(g => `
        <div class="section-title" style="margin-top:8px">${esc(g.title)}<span class="muted small">${esc(g.sub)}</span></div>
        <div class="rail flush">${g.items.slice(0, 10).map(b => `<button class="rail-item" data-go="#/b/${b.id}">
          ${ph(b, { w: 300, cls: 'rail-photo', label: phLabel(b), go: false })}
          <div class="rail-name ellipsis">${esc(b.name)}</div>
          <div class="rail-meta muted">${esc(b.city || '')}</div>
        </button>`).join('')}</div>`).join('') : `<div class="empty">Nothing to group yet.</div>`}</div>`;
    } else {
      const want = state.want.filter(w => w.userId === state.me).length;
      const lists = myLists();
      body = `<div class="stack-6 pad">
        <button class="row" data-go="#/list/want">
          <div class="list-icon">${icon('bookmark')}</div>
          <div class="grow"><b>Want to Visit</b><div class="sub">${want} place${want === 1 ? '' : 's'} · only you</div></div>
          ${icon('chevron', 'sm')}
        </button>
        ${lists.map(l => `<button class="row" data-go="#/list/${l.id}">
          ${listTile(l)}
          <div class="grow"><b class="ellipsis">${esc(l.name)}</b><div class="sub ellipsis">${esc(listMeta(l))}</div></div>
          <div class="avatars">${l.members.slice(0, 3).map(m => user(m)).filter(Boolean).map(u => avatar(u, 'xs').replace('data-go', 'data-x')).join('')}</div>
        </button>`).join('')}
      </div>
      <div class="pad" style="margin-top:14px"><button class="btn dashed" style="width:100%;height:52px" data-go="#/newlist">${icon('plus', 'sm')}New list</button></div>`;
    }
    return `<div class="screen with-nav">
      <div class="topbar"><div class="h1">Lists</div><button class="btn-sq thin" data-go="#/newlist" aria-label="New list">${icon('plus')}</button></div>
      ${tabs}${body}
      <div class="spacer"></div>
    </div>${nav('lists')}`;
  }

  function placeRow(b, sub, remove) {
    return `<div class="row" data-go="#/b/${b.id}">
      ${ph(b, { w: 120, style: 'width:44px;height:44px', go: false })}
      <div class="grow"><div class="ellipsis">${esc(b.name)}</div><div class="sub ellipsis">${esc(sub)}</div></div>
      ${remove || ''}
    </div>`;
  }

  function viewWantList() {
    const items = state.want.filter(w => w.userId === state.me).sort((a, b) => b.createdAt - a.createdAt);
    const rows = items.map(w => {
      const b = BY_ID[w.buildingId]; if (!b) return '';
      return placeRow(b, makerLine(b), `<button class="btn-sq thin" style="width:34px;height:34px" data-act="unwant" data-id="${b.id}" aria-label="Remove">${icon('x', 'sm')}</button>`);
    }).join('');
    return `<div class="screen with-nav">
      <div class="topbar"><button class="btn-sq thin" data-act="back" aria-label="Back">${icon('back')}</button><div class="h1 grow">Want to Visit</div></div>
      <div class="stack-6 pad">${rows || '<div class="empty">Nothing saved yet.<br>Tap Save on any place.</div>'}</div>
      <div class="spacer"></div>
    </div>${nav('lists')}`;
  }

  function viewList(id) {
    const l = state.lists.find(x => x.id === id);
    if (!l || !l.members.includes(state.me)) return viewNotFound();
    const rows = l.items.slice().sort((a, b) => b.createdAt - a.createdAt).map(it => {
      const b = BY_ID[it.buildingId]; if (!b) return '';
      const adder = user(it.addedBy);
      const canRemove = it.addedBy === state.me || l.ownerId === state.me;
      return placeRow(b, [b.city, adder && (adder.id === state.me ? 'added by you' : 'added by @' + adder.handle)].filter(Boolean).join(' · '),
        canRemove ? `<button class="btn-sq thin" style="width:34px;height:34px" data-act="unlist" data-list="${l.id}" data-id="${b.id}" aria-label="Remove">${icon('x', 'sm')}</button>` : '');
    }).join('');
    const members = l.members.map(user).filter(Boolean);
    return `<div class="screen with-nav">
      <div class="topbar"><button class="btn-sq thin" data-act="back" aria-label="Back">${icon('back')}</button><div class="h1 grow ellipsis">${esc(l.name)}</div>
        <button class="btn-sq thin" data-go="#/list/${l.id}/invite" aria-label="Invite people">${icon('users')}</button></div>
      <div class="pad members" data-go="#/list/${l.id}/invite">
        <div class="avatars">${members.slice(0, 5).map(u => avatar(u, 'xs').replace('data-go', 'data-x')).join('')}</div>
        <span class="small muted">${members.length} member${members.length === 1 ? '' : 's'} · ${l.ownerId === state.me ? 'you made this list' : 'made by @' + esc(user(l.ownerId).handle)}</span>
        <span class="small" style="margin-left:auto">Invite</span>
      </div>
      <div class="stack-6 pad">${rows || '<div class="empty">No places yet.<br>Tap Save on any place to add it here.</div>'}</div>
      <div class="spacer"></div>
    </div>${nav('lists')}`;
  }

  // Name + invite picker, used by "New list" and inside the save sheet.
  function newListForm(bid) {
    const others = state.users.filter(u => u.id !== state.me);
    return `<div class="field"><label for="nl-name">List name</label><input id="nl-name" class="input" placeholder="e.g. Brutalist crawl" maxlength="40" autocomplete="off"></div>
      <div class="field"><div class="label">Invite people <span class="muted" style="font-weight:400">optional</span></div>
        <div class="chips">${others.map(u => `<button class="pill ${inviteSel.has(u.id) ? 'on' : ''}" data-act="pickinvite" data-u="${u.id}">@${esc(u.handle)}</button>`).join('')}</div></div>
      <button class="btn-primary" data-act="createlist" data-bid="${bid || ''}">Create list</button>`;
  }

  function viewNewList() {
    return sheet('New list', 1, 1, `<button class="btn-sq thin" data-act="closelog" aria-label="Close">${icon('x')}</button>`, newListForm(''));
  }

  function checkRow(act, attrs, on, title, sub, lead) {
    return `<button class="row check-row ${on ? 'on' : ''}" data-act="${act}" ${attrs}>
      ${lead}<div class="grow"><b class="ellipsis">${esc(title)}</b><div class="sub ellipsis">${esc(sub)}</div></div>
      <span class="check">${icon('check', 'sm')}</span>
    </button>`;
  }

  function viewSaveTo(bid) {
    const b = BY_ID[bid];
    if (!b) return viewNotFound();
    const want = state.want.filter(w => w.userId === state.me).length;
    return sheet('Save to list', 1, 1,
      `<button class="btn-sq thin" data-act="closelog" aria-label="Close">${icon('x')}</button>`,
      `<div class="banner" style="display:flex;gap:12px;align-items:center;padding:10px">
         ${ph(b, { w: 120, style: 'width:48px;height:48px', go: false })}
         <div style="line-height:1.3;min-width:0"><b class="ellipsis" style="display:block">${esc(b.name)}</b><div class="small muted ellipsis">${esc(makerLine(b))}</div></div>
       </div>
       <div class="stack-6">
         ${checkRow('togglewant', `data-id="${bid}"`, isWant(state.me, bid), 'Want to Visit', `${want} place${want === 1 ? '' : 's'} · only you`, `<div class="list-icon">${icon('bookmark')}</div>`)}
         ${myLists().map(l => checkRow('togglelist', `data-list="${l.id}" data-id="${bid}"`, inList(l, bid), l.name, listMeta(l), listTile(l))).join('')}
       </div>
       <button class="btn dashed" style="height:48px" data-act="newlistform">${icon('plus', 'sm')}New list</button>
       <div id="newlist" class="stack" hidden>${newListForm(bid)}</div>
       <div class="sheet-foot"><button class="btn-primary" data-act="closelog">Done</button></div>`);
  }

  function viewInvite(id) {
    const l = state.lists.find(x => x.id === id);
    if (!l || !l.members.includes(state.me)) return viewNotFound();
    const others = state.users.filter(u => u.id !== state.me);
    return sheet(`Invite to “${esc(l.name)}”`, 1, 1,
      `<button class="btn-sq thin" data-act="closelog" aria-label="Close">${icon('x')}</button>`,
      `<div class="small muted">Members can see the list and add places to it.</div>
       <div class="stack-6">${others.map(u => {
         const on = l.members.includes(u.id);
         return checkRow(u.id === l.ownerId ? 'noop' : 'invite', `data-list="${l.id}" data-u="${u.id}"`, on, u.name,
           '@' + u.handle + (u.id === l.ownerId ? ' · owner' : ''), avatar(u).replace('data-go', 'data-x'));
       }).join('')}</div>
       <div class="sheet-foot"><button class="btn-primary" data-act="closelog">Done</button></div>`);
  }

  function viewBuilding(id) {
    const b = BY_ID[id];
    if (!b) return viewNotFound();
    const a = avgFor(b.id), mv = myVisit(b.id);
    const leed = leedFor(b);
    const fids = followingIds(state.me);
    const vs = visitsFor(b.id).sort((x, y) =>
      (y.userId === state.me) - (x.userId === state.me) || fids.has(y.userId) - fids.has(x.userId) || y.createdAt - x.createdAt);
    const photos = vs.flatMap(v => v.photos);
    const likeCounts = {};
    vs.forEach(v => v.likes.forEach(l => { likeCounts[l] = (likeCounts[l] || 0) + 1; }));
    const liked = Object.entries(likeCounts).sort((x, y) => y[1] - x[1]);
    const want = isWant(state.me, b.id);
    if (liked.length > 1 && !b.galleryDone && !b.gallery && b.wiki && !(SEED_PHOTOS[b.id] || []).length) fetchGallery(b);
    let tabBody;
    if (bTab === 'photos') {
      tabBody = photos.length
        ? `<div class="photo-grid">${(g => photos.map((p, i) => `<button class="ph photo" data-act="viewphoto" data-g="${g}" data-i="${i}" style="background-image:url('${p}');background-size:cover;background-position:center" aria-label="View photo ${i + 1}"></button>`).join(''))(gallery(photos))}</div>`
        : `<div class="empty">No photos yet. Log a visit to add the first.</div>`;
    } else {
      tabBody = vs.length ? vs.map(v => {
        const u = user(v.userId); if (!u) return '';
        return `<div style="display:flex;gap:10px">
          ${avatar(u)}
          <div class="grow" style="line-height:1.4">
            <b data-go="#/u/${u.id}">${v.userId === state.me ? 'You' : esc(u.handle)}</b> · ${starsHTML(v.stars)}
            <span class="small muted"> · ${fmtDate(v.visitedOn)}</span>
            ${v.note ? `<div>${esc(v.note)}</div>` : ''}
            ${likeChips(v.likes)}
            ${shotsHTML(v.photos)}
          </div></div>`;
      }).join('') : `<div class="empty">No critiques yet. Be the first to throw shade.</div>`;
    }
    // Credit the Commons photographer whenever the hero is the Commons image (not a user's photo).
    const heroPhoto = photoFor(b.id);
    const heroSeedCredit = heroPhoto && PHOTO_CREDITS[heroPhoto];
    const heroIsCommons = !heroPhoto && b.image;
    const credit = heroSeedCredit
      ? `<div class="credit">Photo: ${esc(heroSeedCredit.artist)}${heroSeedCredit.license ? ' · ' + esc(heroSeedCredit.license) : ''} · <a href="${esc(heroSeedCredit.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>`
      : heroIsCommons && b.credit
      ? `<div class="credit">Photo: ${esc(b.credit.artist)}${b.credit.license ? ' · ' + esc(b.credit.license) : ''} · <a href="${esc(b.credit.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>`
      : heroIsCommons ? `<div class="credit"><a href="${esc(commonsURL(b.image, 1200))}" target="_blank" rel="noopener">Photo: Wikimedia Commons</a></div>` : '';
    const q = encodeURIComponent(b.name + (b.city ? ' ' + b.city : ''));
    const links = [
      b.wiki && `<a class="chip" href="${esc(b.wiki)}" target="_blank" rel="noopener">Wikipedia${icon('external', 'sm')}</a>`,
      b.osm && `<a class="chip" href="https://www.openstreetmap.org/${esc(b.osm)}" target="_blank" rel="noopener">OpenStreetMap${icon('external', 'sm')}</a>`,
      `<a class="chip dashed" href="https://www.archdaily.com/search/all?q=${encodeURIComponent(b.name)}" target="_blank" rel="noopener">ArchDaily${icon('external', 'sm')}</a>`,
      `<a class="chip dashed" href="https://www.dezeen.com/?s=${q}" target="_blank" rel="noopener">Dezeen${icon('external', 'sm')}</a>`,
    ].filter(Boolean).join('');
    const adder = b.addedBy && user(b.addedBy);
    return `<div class="screen">
      ${ph(b, { cls: 'hero', w: 1000, label: phLabel(b), go: false, inner: `
        <button class="btn-sq left" data-act="back" aria-label="Back">${icon('back')}</button>
        <button class="btn-sq right" data-act="share" data-id="${b.id}" aria-label="Share">${icon('share')}</button>` })}
      ${credit}
      <div class="pad stack" style="padding-top:16px">
        <div><div class="h-building">${esc(b.name)}</div>
          <div class="muted" style="margin-top:2px">${esc([b.architect, b.year, b.typology, b.city].filter(Boolean).join(' · '))}</div></div>
        <div class="chips"><span class="chip"><span class="dot" style="background:${styleColor(b)}"></span>${esc(b.style)}</span>${kindOf(b) !== 'building' ? `<span class="chip dashed">${KINDS[kindOf(b)]}</span>` : ''}${b.country ? `<span class="chip dashed">${esc(b.country)}</span>` : ''}${leed ? `<span class="chip leed ${leed.real && leed.level === 'Platinum' ? 'leed-top' : ''} ${leed.real ? '' : 'dashed'}" title="${leed.real ? 'LEED certified' : 'Illustrative demo rating — not a verified certification'}">${icon('leaf', 'sm')}LEED ${esc(leed.level)}${leed.real ? '' : ' <span class="tiny" style="opacity:.65">(demo)</span>'}</span>` : ''}</div>
        <div class="row-flex" style="gap:12px">
          <div class="statbox"><div class="caps">Community</div><div class="val">${a.avg ? scoreHTML(a.avg.toFixed(1)).replace('class="score"', 'class="score" style="font-size:26px"') : '—'}</div><div class="tiny muted">${a.n} log${a.n === 1 ? '' : 's'}</div></div>
          <div class="statbox"><div class="caps">Your rating</div>
            ${mv ? `<div class="val" style="padding:6px 0 4px">${starsHTML(mv.stars, 'lg')}</div><div class="tiny muted">${STAR_WORDS[mv.stars]} · ${fmtDate(mv.visitedOn)}</div>`
                 : `<div class="val">Not yet</div><div class="tiny muted">Log a visit to rate</div>`}
          </div>
        </div>
        ${liked.length ? `<div>
          <div class="section-title">Popular features<span class="muted small">${vs.length} log${vs.length === 1 ? '' : 's'}</span></div>
          <div class="stack-6">${liked.slice(0, 6).map(([l, n], i) => {
            const photo = photoForAspect(b, l, i);
            const thumbBg = photo
              ? `background-image:url('${photo}');background-size:cover;background-position:center;`
              : hatch(styleColor(b));
            return `<div style="display:flex;align-items:center;gap:10px">
              <div class="ph" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;${thumbBg}"></div>
              <div class="grow">
                <div class="small" style="margin-bottom:4px">${esc(l)}</div>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="bar"><div style="width:${Math.round(n / vs.length * 100)}%"></div></div>
                  <div class="tiny muted" style="flex-shrink:0">${n}</div>
                </div>
              </div>
            </div>`;
          }).join('')}</div>
        </div>` : ''}
        <button class="btn-primary" data-go="#/log/${b.id}">${mv ? 'Edit your critique' : 'Throw Shade'}</button>
        <div class="row-flex">
          <button class="btn block ${isSaved(b.id) ? 'on' : ''}" data-go="#/save/${b.id}">${isSaved(b.id) ? icon('bookmarkCheck', 'sm') + 'Saved' : icon('bookmark', 'sm') + 'Save'}</button>
          <a class="btn block" href="https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}" target="_blank" rel="noopener">${icon('navigate', 'sm')}Directions</a>
        </div>
        <div class="about">
          <div class="bold">About</div>
          ${b.blurb ? `<div class="quote">${esc(b.blurb)}</div>` : b.enriching ? '<div class="muted small">Looking up Wikipedia…</div>' : ''}
          ${b.address ? `<div class="small muted">${esc(b.address)}</div>` : ''}
          <div class="small muted">${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}${adder ? ` · pinned by @${esc(adder.handle)}` : ''}</div>
          <div class="chips">${links}</div>
          ${visitTimingHTML(b)}
        </div>
        <div class="tabs">
          <button class="${bTab === 'critiques' ? 'on' : ''}" data-act="btab" data-k="critiques">Critiques · ${vs.length}</button>
          <button class="${bTab === 'photos' ? 'on' : ''}" data-act="btab" data-k="photos">Photos · ${photos.length}</button>
        </div>
        ${tabBody}
      </div>
      <div class="spacer"></div>
    </div>`;
  }

  function viewProfile(uid) {
    const u = user(uid);
    if (!u) return viewNotFound();
    const own = uid === state.me;
    const vs = visitsBy(uid);
    const cities = new Set(vs.map(v => BY_ID[v.buildingId] && (BY_ID[v.buildingId].city || BY_ID[v.buildingId].country))).size;
    const recent = vs.slice().sort((a, b) => b.createdAt - a.createdAt).map(v => {
      const b = BY_ID[v.buildingId]; if (!b) return '';
      return `<button class="row" data-go="#/b/${b.id}">
        ${ph(b, { style: 'width:38px;height:38px', go: false })}
        <div class="grow"><div class="ellipsis">${esc(b.name)}</div><div class="sub ellipsis">${v.note ? esc(v.note) : esc(b.city)}</div></div>
        ${starsHTML(v.stars)}
      </button>`;
    }).join('');

    const following = isFollowing(state.me, uid);
    return `<div class="screen with-nav">
      <div class="topbar" style="padding-bottom:0">${own ? '<div class="grow"></div>' : `<button class="btn-sq thin" data-act="back" aria-label="Back">${icon('back')}</button><div class="grow"></div>`}
        ${own ? `<button class="btn-sq thin" data-go="#/editprofile" aria-label="Edit profile">${icon('edit')}</button>` : ''}</div>
      <div style="display:flex;gap:14px;align-items:center;padding:16px 20px">
        ${own ? `<label class="avatar-edit" for="avatar-in" aria-label="Change profile photo">${avatar(u, 'lg').replace('data-go', 'data-x')}<span class="avatar-edit-badge">${icon('camera', 'sm')}</span></label>
          <input id="avatar-in" type="file" accept="image/*" hidden data-change="avatarphoto">`
          : avatar(u, 'lg').replace('data-go', 'data-x')}
        <div class="grow" style="line-height:1.3"><b style="font-size:20px">${esc(u.name)}</b><div class="muted">@${esc(u.handle)}</div>${u.bio ? `<div class="small">${esc(u.bio)}</div>` : (own ? `<div class="small muted" data-go="#/editprofile">Add a bio</div>` : '')}</div>
      </div>
      <div class="stat-table" style="margin:0 20px">
        <div><b>${vs.length}</b><div class="tiny muted">Logged</div></div>
        <div><b>${cities}</b><div class="tiny muted">Cities</div></div>
        <div data-go="#/followers/${uid}"><b>${followerCount(uid)}</b><div class="tiny muted">Followers</div></div>
        <div data-go="#/following/${uid}"><b>${followingIds(uid).size}</b><div class="tiny muted">Following</div></div>
      </div>
      ${own ? '' : `<div class="pad" style="margin-top:14px">${following
        ? `<button class="btn ghost" style="width:100%;height:48px;font-weight:600" data-act="follow" data-id="${uid}">${icon('check', 'sm')}Following</button>`
        : `<button class="btn-primary" style="height:48px" data-act="follow" data-id="${uid}">Follow</button>`}</div>`}
      <div class="pad" style="padding-top:18px;display:flex;flex-direction:column;gap:18px">
        <div><div class="section-title">Where ${own ? 'you’ve' : esc(u.name.split(' ')[0]) + ' has'} been<span class="small muted" style="font-weight:400">${cities} ${cities === 1 ? 'city' : 'cities'}</span></div>
          <div id="beenmap" class="been-map">${vs.length ? '' : '<div class="map-fallback">Log a place to start your map.</div>'}</div></div>
        <div><div class="section-title">Critiques</div><div class="stack-6">${recent || '<div class="empty">Nothing logged yet.</div>'}</div></div>
        ${own ? `<div class="row-flex"><button class="btn block ghost" data-act="switch">${icon('switch', 'sm')}Switch account</button><button class="btn block ${resetArmed ? 'on' : ''}" data-act="reset">${icon('reset', 'sm')}${resetArmed ? 'Tap again to reset' : 'Reset demo'}</button></div>` : ''}
      </div>
      <div class="spacer"></div>
    </div>${nav(own ? 'you' : '')}`;
  }

  // One blob per city (or country when a place has no city), sized by how many places were logged there.
  function initBeenMap(uid) {
    const el = document.getElementById('beenmap');
    if (!el || !window.L) return;
    const groups = {};
    visitsBy(uid).forEach(v => {
      const b = BY_ID[v.buildingId]; if (!b) return;
      const key = b.city || b.country || 'Elsewhere';
      const g = groups[key] = groups[key] || { key, n: 0, lat: 0, lng: 0 };
      g.n++; g.lat += b.lat; g.lng += b.lng;
    });
    const list = Object.values(groups).map(g => ({ key: g.key, n: g.n, lat: g.lat / g.n, lng: g.lng / g.n }));
    if (!list.length) return;
    beenMap = window.L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, worldCopyJump: true });
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 18 }).addTo(beenMap);
    const layer = window.L.layerGroup().addTo(beenMap);
    const max = Math.max(...list.map(g => g.n));
    // Merge cities whose blobs would overlap at the current zoom; they split apart again as you zoom in.
    const draw = () => {
      if (!beenMap) return;
      layer.clearLayers();
      const clusters = [];
      list.slice().sort((x, y) => y.n - x.n).forEach(g => {
        const pt = beenMap.latLngToLayerPoint([g.lat, g.lng]);
        const hit = clusters.find(c => c.pt.distanceTo(pt) < 64);
        if (hit) { hit.n += g.n; hit.more++; hit.lat += g.lat * g.n; hit.lng += g.lng * g.n; hit.w += g.n; }
        else clusters.push({ pt, key: g.key, n: g.n, more: 0, lat: g.lat * g.n, lng: g.lng * g.n, w: g.n });
      });
      const top = Math.max(max, ...clusters.map(c => c.n));
      clusters.forEach(c => {
        const size = Math.round(26 + 22 * Math.sqrt(c.n / top));
        const label = c.more ? `${c.key} +${c.more}` : c.key;
        window.L.marker([c.lat / c.w, c.lng / c.w], {
          icon: window.L.divIcon({ className: '', html: `<div class="blob" style="width:${size}px;height:${size}px"><b>${c.n}</b><span class="blob-city">${esc(label)}</span></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
          keyboard: false,
        }).on('click', () => beenMap.setView([c.lat / c.w, c.lng / c.w], Math.min(beenMap.getZoom() + 3, 11))).addTo(layer);
      });
    };
    beenMap.on('zoomend', draw);
    if (list.length === 1) beenMap.setView([list[0].lat, list[0].lng], 10);
    else beenMap.fitBounds(list.map(g => [g.lat, g.lng]), { padding: [36, 36], maxZoom: 10 });
    draw();
    setTimeout(() => beenMap && beenMap.invalidateSize(), 0);
  }

  function viewFollowList(uid, kind) {
    const u = user(uid);
    if (!u) return viewNotFound();
    const ids = kind === 'followers' ? state.follows.filter(f => f[1] === uid).map(f => f[0]) : Array.from(followingIds(uid));
    const people = ids.map(user).filter(Boolean);
    const rows = people.length ? people.map(p => {
      const f = isFollowing(state.me, p.id);
      return `<div class="row" data-go="#/u/${p.id}">
        ${avatar(p)}<div class="grow"><b>${esc(p.name)}</b><div class="sub">@${esc(p.handle)} · ${visitsBy(p.id).length} logged</div></div>
        ${p.id === state.me ? '' : `<button class="btn ${f ? '' : 'on'}" data-act="follow" data-id="${p.id}">${f ? 'Following' : 'Follow'}</button>`}
      </div>`;
    }).join('') : `<div class="empty">${kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</div>`;
    return `<div class="screen with-nav">
      <div class="topbar"><button class="btn-sq thin" data-act="back" aria-label="Back">${icon('back')}</button><div class="h1 grow">${kind === 'followers' ? 'Followers' : 'Following'}</div></div>
      <div class="stack-6 pad">${rows}</div>
      <div class="spacer"></div>
    </div>${nav('')}`;
  }

  function viewEditProfile() {
    const u = me();
    return sheet('Edit profile', 1, 1,
      `<button class="btn-sq thin" data-act="closeedit" aria-label="Close">${icon('x')}</button>`,
      `<div class="field"><div class="label">Profile picture</div>
         <div class="avatar-picker">${PRESET_AVATARS.map(p => `<button class="avatar-pick ${u.photo === p ? 'on' : ''}" data-act="pickavatar" data-src="${p}" style="background-image:url('${p}')" aria-label="Choose this picture"></button>`).join('')}</div></div>
       <div class="field"><label for="ep-name">Display name</label><input id="ep-name" class="input" value="${esc(u.name)}" maxlength="40"></div>
       <div class="field"><label for="ep-handle">Handle</label><input id="ep-handle" class="input" value="${esc(u.handle)}" maxlength="20" autocapitalize="none"></div>
       <div class="field"><label for="ep-bio">Bio</label><textarea id="ep-bio" class="input" data-input="epbio" maxlength="140" style="height:80px">${esc(u.bio || '')}</textarea>
         <div class="counter" id="ep-bio-count">${(u.bio || '').length} / 140</div></div>
       <div class="sheet-foot"><button class="btn-primary" data-act="saveprofile">Save</button></div>`);
  }

  function sheet(title, step, total, left, body) {
    const bars = Array.from({ length: total }, (_, i) => `<div class="${i < step ? 'on' : ''}"></div>`).join('');
    return `<div class="screen fixed"><div class="scrim" data-act="closelog"></div><div class="sheet">
      <div class="grabber"></div>
      <div class="sheet-head">${left}<div class="title">${title}</div><div class="step">${step} / ${total}</div></div>
      <div class="progress">${bars}</div>
      ${body}
    </div></div>`;
  }

  function logResults(q) {
    q = (q || '').trim().toLowerCase();
    const list = q ? BUILDINGS.filter(b => [b.name, b.architect, b.city, b.style, b.typology, KINDS[kindOf(b)]].join(' ').toLowerCase().includes(q)) : BUILDINGS;
    const rows = nearest(list).slice(0, q ? 40 : 12).map(x => {
      const mv = myVisit(x.b.id);
      return `<button class="row" data-go="#/log/${x.b.id}">
        ${ph(x.b, { style: 'width:38px;height:38px', go: false })}
        <div class="grow"><div class="ellipsis">${esc(x.b.name)}</div><div class="sub ellipsis">${esc(makerLine(x.b))}</div></div>
        <span class="small ${mv ? '' : 'muted'}">${mv ? `Your ${mv.stars}★` : fmtKm(x.d)}</span>
      </button>`;
    }).join('');
    return (q ? '' : `<div class="caps">Nearby · ${locNote()}</div>`) + (rows || `<div class="empty">No places match “${esc(q)}”.</div>`);
  }

  function viewLogPick() {
    return sheet('Throw Shade', 1, 2,
      `<button class="btn-sq thin" data-act="closelog" aria-label="Close">${icon('x')}</button>`,
      `<div class="input-wrap">${icon('search')}<input class="input" data-input="logq" placeholder="Search buildings, bridges, art, spots" autocomplete="off"></div>
       <button class="btn dashed" style="height:48px" data-act="pinfrommap">${icon('pin', 'sm')}Not listed? Drop a pin on the map</button>
       <div id="logresults" class="stack-6">${logResults('')}</div>`);
  }

  function viewLogRate(bid) {
    const b = BY_ID[bid];
    if (!b) return viewNotFound();
    if (!draft || draft.bid !== bid) {
      const mv = myVisit(bid);
      draft = mv
        ? { bid, stars: mv.stars, note: mv.note || '', date: mv.visitedOn, photos: mv.photos.slice(), likes: mv.likes.slice() }
        : { bid, stars: 0, note: '', date: isoDate(Date.now()), photos: [], likes: [] };
    }
    const starBtns = [1, 2, 3, 4, 5].map(n => `<button data-act="star" data-n="${n}" class="${n <= draft.stars ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">${n <= draft.stars ? starSVG('#fff', '#fff') : starSVG('none', '#a1a1a6')}</button>`).join('');
    const editing = !!myVisit(bid);
    return sheet('Your critique', 2, 2,
      `<button class="btn-sq thin" data-go="#/log" aria-label="Back">${icon('back')}</button>`,
      `<div class="banner" style="display:flex;gap:12px;align-items:center;padding:10px">
         ${ph(b, { style: 'width:56px;height:56px', go: false })}
         <div style="line-height:1.3"><b style="font-size:16px">${esc(b.name)}</b><div class="small muted">${esc(byLine(b))}</div></div>
       </div>
       <div class="field"><div class="label">Your rating</div><div class="star-input" id="star-input">${starBtns}</div>
         <div class="star-caption" id="star-caption">${STAR_WORDS[draft.stars] || '<span class="muted" style="font-weight:400;font-size:14px">Tap to rate</span>'}</div></div>
       <div class="field"><div class="label">What stood out? <span class="muted" style="font-weight:400">tap all that apply</span></div>
         <div class="chips aspects">${ASPECTS.map(a => `<button class="pill ${draft.likes.includes(a) ? 'on' : ''}" data-act="aspect" data-k="${a}">${a}</button>`).join('')}</div></div>
       <div class="field"><label for="visitdate">Date visited</label><input id="visitdate" class="input" type="date" data-input="date" value="${draft.date}" max="${isoDate(Date.now())}"></div>
       <div class="field"><div class="label">Photos <span class="muted" style="font-weight:400">optional · up to ${MAX_PHOTOS}</span></div>
         <div class="photo-row">
           ${draft.photos.map((p, i) => `<div class="ph photo" style="width:72px;height:72px;background-image:url('${p}');background-size:cover;background-position:center">
              <button class="btn-sq rm" data-act="rmphoto" data-i="${i}" aria-label="Remove photo">${icon('x', 'sm')}</button></div>`).join('')}
           ${draft.photos.length < MAX_PHOTOS ? `<label class="photo-add" for="photo-in" aria-label="Add photos">${icon('camera', 'lg')}</label>` : ''}
         </div>
         <input id="photo-in" type="file" accept="image/*" multiple hidden data-change="photo"></div>
       <div class="field"><label for="critique">Quick critique</label>
         <textarea id="critique" class="input" maxlength="280" data-input="note" placeholder="Say something sharp…">${esc(draft.note)}</textarea>
         <div class="counter" id="note-count">${draft.note.length} / 280</div></div>
       <div class="sheet-foot stack-6">
         <button class="btn-primary" data-act="post">${editing ? 'Update critique' : 'Post critique'}</button>
         ${editing ? `<button class="btn block danger ${delArmed ? 'on' : ''}" data-act="delvisit" data-id="${bid}">${delArmed ? 'Tap again to delete' : 'Delete critique'}</button>` : ''}
       </div>`);
  }

  function viewNotFound() {
    return `<div class="screen with-nav"><div class="topbar"><button class="btn-sq thin" data-act="back" aria-label="Back">${icon('back')}</button></div>
      <div class="pad"><div class="empty">That page doesn’t exist.</div></div></div>${nav('')}`;
  }

  // ---------- Map ----------
  function destroyMap() {
    if (map) { map.remove(); map = null; mapMarkers = {}; }
    if (pinMap) { pinMap.remove(); pinMap = null; }
    if (beenMap) { beenMap.remove(); beenMap = null; }
    pinMode = false;
  }
  function setPinMode(on) {
    pinMode = on;
    const btn = document.getElementById('pinbtn'), hint = document.getElementById('map-hint');
    if (btn) btn.classList.toggle('on', on);
    if (hint) hint.hidden = !on;
    const legend = document.getElementById('legend');
    if (legend && on) legend.classList.add('closed');
  }
  function placePin(latlng) {
    setPinMode(false);
    go(`#/pin/${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)}`);
  }

  function mapBuildings() {
    const fids = followingIds(state.me);
    const been = new Set(visitsBy(state.me).map(v => v.buildingId));
    const want = new Set(state.want.filter(w => w.userId === state.me).map(w => w.buildingId));
    const friends = new Set(state.visits.filter(v => fids.has(v.userId)).map(v => v.buildingId));
    const kind = b => been.has(b.id) ? 'been' : want.has(b.id) ? 'want' : 'other';
    let list = BUILDINGS;
    if (mapFilter === 'been') list = list.filter(b => been.has(b.id));
    if (mapFilter === 'want') list = list.filter(b => want.has(b.id));
    if (mapFilter === 'friends') list = list.filter(b => friends.has(b.id));
    if (mapKind !== 'all') list = list.filter(b => kindOf(b) === mapKind);
    return list.map(b => ({ b, kind: mapFilter === 'friends' && kind(b) === 'other' ? 'been' : kind(b) }));
  }
  function pinIcon(b, kind) {
    const cls = kind === 'been' ? '' : kind;
    return window.L.divIcon({ className: '', html: `<div class="pin k-${kindOf(b)} ${cls} ${mapSel === b.id ? 'sel' : ''}" style="--c:${styleColor(b)}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
  }
  function renderMapCard() {
    const el = document.getElementById('map-card');
    if (!el) return;
    const b = BY_ID[mapSel];
    if (!b) { el.innerHTML = ''; return; }
    const a = avgFor(b.id), mv = myVisit(b.id);
    el.innerHTML = `<button class="map-card" style="width:calc(100% - 24px)" data-go="#/b/${b.id}">
      ${ph(b, { w: 160, style: 'width:64px;height:64px', go: false })}
      <div class="grow" style="line-height:1.3"><b>${esc(b.name)}</b><div class="small muted">${esc(byLine(b))}</div>
        <div class="small">${esc(b.city)} · ${fmtKm(km(loc, b))}${mv ? ` · you: ${mv.stars}★` : ''}</div></div>
      <div style="font-size:20px">${a.avg ? scoreHTML(a.avg.toFixed(1)) : '<span class="small muted">No logs</span>'}</div>
    </button>`;
  }
  function initMap() {
    const items = mapBuildings();
    if (!items.find(x => x.b.id === mapSel)) mapSel = items.length ? nearest(items.map(x => x.b))[0].b.id : null;
    renderMapCard();
    if (!window.L) {
      document.getElementById('map').innerHTML = '<div class="map-fallback">Map tiles need an internet connection. Pins and the building card still work from the list views.</div>';
      return;
    }
    map = window.L.map('map', { zoomControl: false, attributionControl: true });
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    items.forEach(({ b, kind }) => {
      const m = window.L.marker([b.lat, b.lng], { icon: pinIcon(b, kind) }).addTo(map);
      m.on('click', () => {
        const prev = mapSel; mapSel = b.id;
        [prev, b.id].forEach(id => { const r = mapMarkers[id]; if (r) r.marker.setIcon(pinIcon(r.b, r.kind)); });
        renderMapCard();
      });
      mapMarkers[b.id] = { marker: m, b, kind };
    });
    window.L.marker([loc.lat, loc.lng], { icon: window.L.divIcon({ className: '', html: '<div class="pin me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }).addTo(map);
    // Drop a pin: tap after pressing "Pin", or long-press / right-click anywhere.
    map.on('click', e => { if (pinMode) placePin(e.latlng); });
    map.on('contextmenu', e => placePin(e.latlng));
    map.on('moveend', () => { if (map) mapView = { c: map.getCenter(), z: map.getZoom() }; });
    const selB = BY_ID[mapSel];
    if (mapFocus && selB) { map.setView([selB.lat, selB.lng], 17); mapFocus = false; }
    else if (mapFilter === 'all' && mapView) map.setView(mapView.c, mapView.z);
    else if (mapFilter === 'all' || !items.length) map.setView([loc.lat, loc.lng], 13);
    else map.fitBounds(items.map(x => [x.b.lat, x.b.lng]), { padding: [60, 60], maxZoom: 14 });
    setTimeout(() => map && map.invalidateSize(), 0);
    if (pendingPinMode) { pendingPinMode = false; setPinMode(true); }
  }

  // ---------- Pin → "What's here?" (OpenStreetMap via Overpass, Nominatim as fallback) ----------
  // The public Overpass servers are shared and sometimes overloaded, so: short timeouts, a second server,
  // Nominatim's nearest address if both fail, results cached per ~10 m, and "Name it yourself" always works.
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  const lookups = {};
  let nameStyle = null, nameKind = 'building', pendingPinMode = false;

  function fetchJSON(url, opts, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 12000);
    return fetch(url, Object.assign({ signal: ctl.signal }, opts || {}))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(() => clearTimeout(timer));
  }
  const qs = o => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

  // ---------- Weather / best time to visit ----------
  // Open-Meteo needs no API key, so the demo works with live weather straight away.
  const WMO = {
    0: '☀', 1: '🌤', 2: '⛅', 3: '☁',
    45: '🌫', 48: '🌫',
    51: '🌦', 53: '🌦', 55: '🌦', 56: '🌦', 57: '🌦',
    61: '🌧', 63: '🌧', 65: '🌧', 66: '🌧', 67: '🌧',
    71: '🌨', 73: '🌨', 75: '🌨', 77: '🌨',
    80: '🌦', 81: '🌧', 82: '🌧',
    85: '🌨', 86: '🌨',
    95: '⛈', 96: '⛈', 99: '⛈',
  };
  const wmoLabel = c => c === 0 ? 'Clear' : c <= 2 ? 'Mostly clear' : c === 3 ? 'Cloudy' : c <= 48 ? 'Foggy' : c <= 67 || (c >= 80 && c <= 82) ? 'Rainy' : c <= 77 || c >= 85 ? 'Snowy' : c >= 95 ? 'Stormy' : 'Mixed';
  const weatherCache = {};
  const visitDaySel = {}; // buildingId -> selected forecast day index (0 = today)
  const visitExpanded = {}; // buildingId -> is the widget open
  const visitSliderPos = {}; // buildingId -> scrub position, 0..1000
  const visitSunCache = {}; // buildingId -> { sun, lo, hi } for the currently rendered day, read by the slider handler

  function weatherKey(lat, lng) { return lat.toFixed(2) + ',' + lng.toFixed(2); }

  function sunTimesFor(b, forDate) {
    if (typeof SunCalc === 'undefined') return null;
    const now = new Date();
    const times = SunCalc.getTimes(forDate || now, b.lat, b.lng);
    return { now, sunrise: times.sunrise, sunset: times.sunset, goldenHour: times.goldenHour, goldenHourEnd: times.goldenHourEnd };
  }

  // What the light looks like at an arbitrary scrubbed time within the sunrise→sunset window.
  function lightLabel(t, sun) {
    const ms = t.getTime();
    if (ms < sun.sunrise.getTime()) return 'Before sunrise — flat, cool light';
    if (ms < sun.goldenHourEnd.getTime()) return 'Morning golden hour — warm, soft light';
    if (ms < sun.goldenHour.getTime()) return 'Midday — harsh overhead light';
    if (ms <= sun.sunset.getTime()) return 'Golden hour — warm, soft light';
    return 'After sunset — flat, cool light';
  }

  async function loadWeather(b) {
    const key = weatherKey(b.lat, b.lng);
    if (weatherCache[key]) return;
    weatherCache[key] = { loading: true };
    try {
      const d = await fetchJSON('https://api.open-meteo.com/v1/forecast?' + qs({
        latitude: b.lat, longitude: b.lng, current: 'temperature_2m,weather_code',
        hourly: 'temperature_2m,weather_code',
        daily: 'weather_code,temperature_2m_max,sunset', temperature_unit: 'fahrenheit', timezone: 'auto', forecast_days: 5,
      }), null, 8000);
      weatherCache[key] = { loading: false, current: d.current, daily: d.daily, hourly: d.hourly, tz: d.timezone };
    } catch (e) {
      weatherCache[key] = { loading: false, error: true };
    }
    if (currentPath() === '/b/' + b.id) render();
  }

  function visitTimingHTML(b) {
    const key = weatherKey(b.lat, b.lng);
    const w = weatherCache[key];
    if (!w) { loadWeather(b); }
    const selIdx = visitDaySel[b.id] || 0;
    const isToday = selIdx === 0;
    const fmtTime = t => t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // Pick the date this card is showing: today (live) or a future forecast day (noon local, so DST doesn't shift it).
    const selDate = isToday ? new Date() : new Date(Date.now() + selIdx * 86400000);
    if (!isToday) selDate.setHours(12, 0, 0, 0);
    const sun = sunTimesFor(b, selDate);
    if (!sun) return '';
    // SunCalc returns true instants; Open-Meteo's hourly times are the place's wall clock. Put the sun times on the
    // place's wall clock too, so markers line up and times read right wherever the viewer is (e.g. Chicago from NY).
    const toPlace = t => (w && w.tz ? new Date(t.toLocaleString('en-US', { timeZone: w.tz })) : t);
    Object.keys(sun).forEach(k => { sun[k] = toPlace(sun[k]); });

    const nowIcon = isToday
      ? (w && w.current ? WMO[w.current.weather_code] || '☀' : w && w.error ? '—' : '…')
      : (w && w.daily ? WMO[w.daily.weather_code[selIdx]] || '☀' : '…');
    const nowTemp = isToday
      ? (w && w.current ? Math.round(w.current.temperature_2m) + '°F' : w && w.error ? 'N/A' : '…')
      : (w && w.daily ? Math.round(w.daily.temperature_2m_max[selIdx]) + '°F high' : '…');
    const nowCond = isToday
      ? (w && w.current ? wmoLabel(w.current.weather_code) : w && w.error ? 'Weather unavailable' : 'Loading')
      : (w && w.daily ? wmoLabel(w.daily.weather_code[selIdx]) : 'Loading');

    let quickNote;
    if (isToday) {
      const msToGolden = sun.goldenHour.getTime() - sun.now.getTime();
      const inGolden = sun.now >= sun.goldenHour && sun.now <= sun.sunset;
      if (inGolden) quickNote = 'Golden hour now';
      else if (msToGolden > 0 && msToGolden < 3 * 3600 * 1000) {
        const h = Math.floor(msToGolden / 3600000), m = Math.round((msToGolden % 3600000) / 60000);
        quickNote = `Golden hour in ${h > 0 ? h + 'h ' : ''}${m}m`;
      } else if (sun.now > sun.sunset || sun.now < sun.sunrise) quickNote = `Golden hour tomorrow ~${fmtTime(sun.goldenHour)}`;
      else quickNote = `Golden hour at ${fmtTime(sun.goldenHour)}`;
    } else {
      quickNote = `Golden hour ${selDate.toLocaleDateString([], { weekday: 'short' })} at ${fmtTime(sun.goldenHour)}`;
    }

    const expanded = !!visitExpanded[b.id];
    let expandedHTML = '';
    if (expanded) {
      let dayTabsHTML = '';
      if (w && w.daily) {
        const codes = w.daily.weather_code, dates = w.daily.time;
        const bestIdx = codes.reduce((best, c, i) => (i > 0 && c <= 2 && (best < 0 || c < codes[best])) ? i : best, -1);
        dayTabsHTML = `<div class="visit-daytabs">${dates.map((d, i) => {
          const day = i === 0 ? 'Today' : new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short' });
          return `<button class="daytab${i === selIdx ? ' on' : ''}" data-act="visitday" data-id="${b.id}" data-i="${i}">${day}${i === bestIdx ? ' ★' : ''}</button>`;
        }).join('')}</div>`;
      }

      let scrubHTML;
      const dateStr = w && w.daily && w.daily.time[selIdx];
      const hoursForDay = (w && w.hourly && dateStr)
        ? w.hourly.time.reduce((acc, t, i) => { if (t.startsWith(dateStr)) acc.push({ t: new Date(t), temp: w.hourly.temperature_2m[i], code: w.hourly.weather_code[i] }); return acc; }, [])
        : [];

      if (hoursForDay.length) {
        const lo = hoursForDay[0].t.getTime(), hi = hoursForDay[hoursForDay.length - 1].t.getTime();
        visitSunCache[b.id] = { sun, hours: hoursForDay };
        const defaultIdx = isToday
          ? hoursForDay.reduce((best, h, i) => Math.abs(h.t - sun.now) < Math.abs(hoursForDay[best].t - sun.now) ? i : best, 0)
          : Math.min(12, hoursForDay.length - 1);
        const idx = visitSliderPos[b.id] != null ? Math.min(visitSliderPos[b.id], hoursForDay.length - 1) : defaultIdx;
        visitSliderPos[b.id] = idx;
        const cur = hoursForDay[idx];
        const zonePct = t => Math.max(0, Math.min(100, (t.getTime() - lo) / (hi - lo) * 100));
        const nowPct = isToday ? zonePct(sun.now) : null;

        scrubHTML = `
          <div class="visit-scrub">
            <div class="visit-scrub-track">
              <div class="visit-scrub-zone" style="left:${zonePct(sun.sunrise)}%;width:${Math.max(0, zonePct(sun.goldenHourEnd) - zonePct(sun.sunrise))}%"></div>
              <div class="visit-scrub-zone" style="left:${zonePct(sun.goldenHour)}%;width:${Math.max(0, zonePct(sun.sunset) - zonePct(sun.goldenHour))}%"></div>
              ${nowPct != null ? `<div class="visit-scrub-now" style="left:${nowPct}%"></div>` : ''}
            </div>
            <input type="range" class="visit-slider" min="0" max="${hoursForDay.length - 1}" step="1" value="${idx}" data-input="visitslider" data-id="${b.id}" aria-label="Time of day">
          </div>
          <div class="visit-scrub-readout">
            <span class="visit-icon-lg" id="visit-scrub-icon-${b.id}">${WMO[cur.code] || '☀'}</span>
            <div class="grow">
              <div><b id="visit-scrub-temp-${b.id}">${Math.round(cur.temp)}°F</b> <span id="visit-scrub-time-${b.id}" class="muted">${fmtTime(cur.t)}</span></div>
              <div id="visit-scrub-label-${b.id}" class="small muted">${lightLabel(cur.t, sun)}</div>
            </div>
          </div>`;
      } else {
        scrubHTML = `<div class="small muted">Loading hourly forecast…</div>`;
      }

      expandedHTML = `${dayTabsHTML}${scrubHTML}`;
    }

    return `<div class="visit-widget${expanded ? ' open' : ''}">
      <button class="visit-summary" data-act="visitexpand" data-id="${b.id}">
        <span class="visit-icon-lg">${nowIcon}</span>
        <span class="visit-main">
          <b class="visit-temp">${nowTemp}</b>
          <span class="visit-cond muted">${nowCond}</span>
        </span>
        <span class="visit-quick muted">${quickNote}</span>
        <span class="visit-chevron">${expanded ? '︿' : '﹀'}</span>
      </button>
      ${expandedHTML}
    </div>`;
  }

  async function overpass(lat, lng) {
    const A = (r) => `(around:${r},${lat},${lng})`;
    const q = `[out:json][timeout:10];(way${A(25)}[building];relation${A(25)}[building];` +
      `way${A(90)}[building][name];relation${A(90)}[building][name];` +
      `nwr${A(70)}[tourism=artwork];way${A(70)}[man_made=bridge];way${A(50)}["bridge:name"];` +
      `nwr${A(120)}[name][leisure~"^(park|garden)$"];nwr${A(90)}[name][place=square];nwr${A(90)}[name][amenity=fountain];` +
      `nwr${A(90)}[name][tourism~"^(attraction|viewpoint)$"];nwr${A(90)}[name][man_made=pier];);out tags center 30;`;
    let lastErr;
    for (const ep of OVERPASS) {
      try {
        const d = await fetchJSON(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 12000);
        return d.elements || [];
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  function nominatim(lat, lng) {
    return fetchJSON('https://nominatim.openstreetmap.org/reverse?' + qs({ format: 'jsonv2', lat, lon: lng, zoom: 18, addressdetails: 1, extratags: 1, namedetails: 1 }), null, 8000);
  }

  const TYPE_WORDS = {
    yes: 'Building', commercial: 'Commercial building', office: 'Office building', retail: 'Retail building',
    residential: 'Residential building', apartments: 'Apartment building', house: 'House', detached: 'House',
    church: 'Church', cathedral: 'Cathedral', chapel: 'Chapel', university: 'University building', college: 'College building',
    school: 'School', hotel: 'Hotel', train_station: 'Station', transportation: 'Transit building', civic: 'Civic building',
    public: 'Public building', government: 'Government building', museum: 'Museum', stadium: 'Stadium',
    industrial: 'Industrial building', warehouse: 'Warehouse', parking: 'Parking garage', hospital: 'Hospital',
  };
  const AMENITY_WORDS = { theatre: 'Theatre', library: 'Library', place_of_worship: 'Place of worship', arts_centre: 'Arts centre', university: 'University building', townhall: 'Town hall', cinema: 'Cinema' };
  // What kind of place an OSM element is: art > bridge > building > spot.
  function osmKind(t) {
    if (t.tourism === 'artwork') return 'art';
    if (t.man_made === 'bridge' || t['bridge:name']) return 'bridge';
    if (t.building) return 'building';
    if (t.leisure || t.place === 'square' || t.amenity === 'fountain' || t.tourism || t.man_made === 'pier') return 'spot';
    return 'building';
  }
  const SPOT_WORDS = { park: 'Park', garden: 'Garden', square: 'Square', fountain: 'Fountain', attraction: 'Attraction', viewpoint: 'Viewpoint', pier: 'Pier' };
  const cap = w => w ? w[0].toUpperCase() + w.slice(1) : w;
  function typeLabel(t) {
    const k = osmKind(t);
    if (k === 'art') return t.artwork_type ? cap(t.artwork_type.replace(/_/g, ' ')) : 'Public art';
    if (k === 'bridge') return t['bridge:movable'] ? cap(t['bridge:movable']) + ' bridge' : t['bridge:structure'] ? cap(t['bridge:structure'].replace(/_/g, ' ')) + ' bridge' : 'Bridge';
    if (k === 'spot') return SPOT_WORDS[t.leisure] || SPOT_WORDS[t.place] || SPOT_WORDS[t.amenity] || SPOT_WORDS[t.tourism] || SPOT_WORDS[t.man_made] || 'Place';
    if (t.tourism === 'museum') return 'Museum';
    if (AMENITY_WORDS[t.amenity]) return AMENITY_WORDS[t.amenity];
    if (+t['building:levels'] >= 40) return 'Skyscraper';
    const v = t.building || 'yes';
    if (TYPE_WORDS[v]) return TYPE_WORDS[v];
    const w = v.replace(/_/g, ' ');
    return w[0].toUpperCase() + w.slice(1) + (/building$/.test(w) ? '' : ' building');
  }
  const STYLE_RULES = [
    ['Brutalist', /brutal/], ['Deconstructivist', /deconstruct/], ['Postmodern', /post.?modern/],
    ['High-tech', /high.?tech|structural.expressionism|late.modern/], ['Art Deco', /art.?deco|streamline/],
    ['Contemporary', /contemporary|neo.?futur|parametric|blob|sustainable|minimal/],
    ['Modernist', /modern|international|bauhaus|functional|expressionis|mid.?century|organic|prairie|chicago.school|constructiv|googie/],
    ['Historic', /./],
  ];
  function styleFrom(text, year) {
    const s = String(text || '').toLowerCase();
    if (s) for (const [name, rx] of STYLE_RULES) if (rx.test(s)) return name;
    if (!year) return 'Modernist';
    return year < 1920 ? 'Historic' : year < 1990 ? 'Modernist' : 'Contemporary';
  }
  const yearFrom = s => { const m = /(\d{4})/.exec(s || ''); return m ? +m[1] : ''; };
  const addrOf = t => [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const sameName = (a, b) => {
    const n = x => String(x).toLowerCase().replace(/\(.*?\)|\bthe\b|\bbuilding\b/g, '').replace(/[^a-z0-9]+/g, '');
    const x = n(a), y = n(b);
    return !!x && !!y && (x.includes(y) || y.includes(x));
  };

  function candidate(osm, tags, clat, clng, plat, plng) {
    const year = yearFrom(tags.start_date || tags['building:start_date'] || tags['construction:date']);
    return {
      osm, tags, lat: clat, lng: clng, year, kind: osmKind(tags),
      d: Math.round(km({ lat: plat, lng: plng }, { lat: clat, lng: clng }) * 1000),
      name: tags.name || tags['bridge:name'] || '', addr: addrOf(tags), typ: typeLabel(tags),
      style: styleFrom(tags['building:architecture'] || tags.architecture, year),
      wiki: !!(tags.wikidata || tags.wikipedia),
    };
  }

  async function lookupPin(key, lat, lng) {
    const L0 = lookups[key] = { status: 'loading', results: [] };
    try {
      const cached = JSON.parse(localStorage.getItem('ts.osm.' + key));
      if (cached) { Object.assign(L0, cached, { status: 'done' }); refreshPin(key); return; }
    } catch (e) { /* no cache */ }
    const [op, nm] = await Promise.allSettled([overpass(lat, lng), nominatim(lat, lng)]);
    const nmv = nm.status === 'fulfilled' ? nm.value : null;
    if (nmv && nmv.address) {
      const a = nmv.address;
      L0.address = [a.house_number, a.road].filter(Boolean).join(' ');
      L0.city = a.city || a.town || a.village || a.suburb || '';
      L0.country = a.country || '';
    }
    if (op.status === 'fulfilled') {
      const seen = new Set();
      L0.results = op.value
        .filter(e => e.tags && (e.center || e.lat != null))
        .map(e => candidate(e.type + '/' + e.id, e.tags, e.center ? e.center.lat : e.lat, e.center ? e.center.lon : e.lon, lat, lng))
        .filter(c => !seen.has(c.osm) && seen.add(c.osm))
        // buildings at the pin first, named before unnamed, then by distance
        .sort((x, y) => (x.d > 30) - (y.d > 30) || (!!y.name - !!x.name) || x.d - y.d)
        .slice(0, 6);
    } else if (nmv && nmv.osm_type) {
      const tags = Object.assign({}, nmv.extratags || {}, { building: nmv.type }, nmv.name ? { name: nmv.name } : {});
      L0.results = [candidate(nmv.osm_type + '/' + nmv.osm_id, tags, +nmv.lat, +nmv.lon, lat, lng)];
      L0.error = 'OpenStreetMap’s building data was slow, so this is the nearest address instead.';
    } else {
      L0.error = 'Couldn’t reach OpenStreetMap. You can still name it yourself.';
    }
    L0.status = 'done';
    if (!L0.error) {
      try { localStorage.setItem('ts.osm.' + key, JSON.stringify({ results: L0.results, address: L0.address, city: L0.city, country: L0.country })); } catch (e) { /* storage full */ }
    }
    refreshPin(key);
  }

  function pinKey(lat, lng) { return lat.toFixed(4) + ',' + lng.toFixed(4); }
  function currentPin() {
    const m = /^\/pin\/(-?[\d.]+),(-?[\d.]+)/.exec(currentPath());
    return m ? { lat: +m[1], lng: +m[2] } : null;
  }

  function osmResultsHTML(key) {
    const L0 = lookups[key];
    if (!L0 || L0.status === 'loading') return '<div class="empty">Looking up this spot on OpenStreetMap…</div>';
    let html = L0.error ? `<div class="small muted">${esc(L0.error)}</div>` : '';
    if (!L0.results.length) return html + '<div class="empty">No mapped building here. Name it yourself below.</div>';
    html += L0.results.map((r, i) => `
      <button class="row" data-act="pickosm" data-key="${key}" data-i="${i}">
        <div class="ph" style="width:38px;height:38px;${hatch(STYLES[r.style])}"></div>
        <div class="grow"><div class="ellipsis">${r.name ? esc(r.name) : `<span class="muted">${esc(r.addr || 'Unnamed building')}</span>`}</div>
          <div class="sub ellipsis">${esc([r.typ, r.name ? r.addr : '', r.year].filter(Boolean).join(' · '))}</div></div>
        ${r.wiki ? '<span class="chip" style="font-size:10px;padding:2px 8px">Wikipedia</span>' : ''}
        <span class="small muted">${r.d} m</span>
      </button>`).join('');
    return html;
  }
  function refreshPin(key) {
    const p = currentPin();
    if (!p || pinKey(p.lat, p.lng) !== key) return;
    const el = document.getElementById('osm-results');
    if (el) el.innerHTML = osmResultsHTML(key);
    const nm = document.getElementById('nb-name');
    const L0 = lookups[key];
    if (nm && L0 && L0.address) nm.placeholder = L0.address;
  }

  function viewPin(lat, lng) {
    const key = pinKey(lat, lng);
    const P = { lat, lng };
    const near = BUILDINGS.map(b => ({ b, d: km(P, b) })).filter(x => x.d < 0.12).sort((x, y) => x.d - y.d).slice(0, 4);
    const nearRows = near.map(x => `<button class="row" data-go="#/log/${x.b.id}">
        ${ph(x.b, { w: 120, style: 'width:38px;height:38px', go: false })}
        <div class="grow"><div class="ellipsis">${esc(x.b.name)}</div><div class="sub ellipsis">${esc(byLine(x.b))}</div></div>
        <span class="small muted">${Math.round(x.d * 1000)} m</span></button>`).join('');
    const pills = Object.entries(STYLES).map(([s, c]) =>
      `<button class="pill ${nameStyle === s ? 'on' : ''}" data-act="pickstyle" data-k="${s}"><span class="dot" style="background:${c}"></span> ${s}</button>`).join('');
    return sheet('What’s here?', 1, 2,
      `<button class="btn-sq thin" data-act="closelog" aria-label="Close">${icon('x')}</button>`,
      `<div id="pinmap" class="pin-map"></div>
       <div class="caps">Pin · ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
       ${near.length ? `<div class="stack-6"><div class="caps">Already on throwShade</div>${nearRows}</div>` : ''}
       <div class="stack-6"><div class="caps">From OpenStreetMap</div><div id="osm-results" class="stack-6">${osmResultsHTML(key)}</div></div>
       <button class="btn dashed" style="height:52px" data-act="nameit">${icon('edit', 'sm')}Name it yourself</button>
       <div id="nameit" class="stack" hidden>
         <div class="seg">${Object.entries(KINDS).map(([k, l]) => `<button class="${nameKind === k ? 'on' : ''}" data-act="pickkind" data-k="${k}">${l}</button>`).join('')}</div>
         <div class="field"><label for="nb-name">Name</label><input id="nb-name" class="input" autocomplete="off" placeholder="${esc((lookups[key] && lookups[key].address) || 'e.g. The corner pavilion')}"></div>
         <div class="row-flex">
           <div class="field grow"><label for="nb-arch">Architect or artist <span class="muted" style="font-weight:400">(optional)</span></label><input id="nb-arch" class="input" autocomplete="off"></div>
           <div class="field" style="width:104px"><label for="nb-year">Year</label><input id="nb-year" class="input" inputmode="numeric" maxlength="4" autocomplete="off"></div>
         </div>
         <div class="field"><div class="label">Style</div><div class="chips">${pills}</div></div>
         <button class="btn-primary" data-act="savenamed">Add and rate it</button>
       </div>`);
  }
  function initPin(lat, lng) {
    const key = pinKey(lat, lng);
    if (!lookups[key] || (lookups[key].status === 'done' && lookups[key].error)) lookupPin(key, lat, lng);
    if (!window.L || !document.getElementById('pinmap')) return;
    pinMap = window.L.map('pinmap', { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false, attributionControl: false }).setView([lat, lng], 18);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(pinMap);
    window.L.marker([lat, lng], { icon: window.L.divIcon({ className: '', html: '<div class="drop"></div>', iconSize: [22, 30], iconAnchor: [11, 30] }), interactive: false }).addTo(pinMap);
    setTimeout(() => pinMap && pinMap.invalidateSize(), 0);
  }

  function addPlace(b) {
    state.places.push(b);
    registerBuilding(b);
    save();
    mapSel = b.id; mapFocus = true;
    go('#/log/' + b.id);
  }

  // Pull photo, intro and credit from Wikidata / Wikipedia / Commons when OSM links the building.
  async function enrichFromWiki(b) {
    b.enriching = true;
    try {
      let title = b.wikiTag && /^en:/.test(b.wikiTag) ? b.wikiTag.slice(3) : null;
      if (b.qid) {
        const d = await fetchJSON('https://www.wikidata.org/w/api.php?' + qs({ action: 'wbgetentities', ids: b.qid, props: 'sitelinks|claims', sitefilter: 'enwiki', format: 'json', origin: '*' }));
        const e = d.entities && d.entities[b.qid];
        // OSM sometimes tags a building with its occupant company's item. Buildings have coordinates; companies don't.
        if (e && !(e.claims && e.claims.P625)) throw new Error('Wikidata item is not a place');
        if (e) {
          if (!title && e.sitelinks && e.sitelinks.enwiki) title = e.sitelinks.enwiki.title;
          const claim = p => { const c = e.claims && e.claims[p] && e.claims[p][0]; return c && c.mainsnak.datavalue && c.mainsnak.datavalue.value; };
          const img = claim('P18');
          if (img && !b.image) b.image = img;
          const t = claim('P1619') || claim('P571');
          if (t && !b.year) { const y = parseInt(String(t.time).slice(1, 5), 10); if (y) b.year = y; }
        }
      }
      if (title) {
        const d = await fetchJSON('https://en.wikipedia.org/w/api.php?' + qs({ action: 'query', format: 'json', origin: '*', redirects: 1, prop: 'pageimages|extracts', piprop: 'name', exintro: 1, explaintext: 1, exsentences: 2, titles: title }));
        const page = Object.values((d.query && d.query.pages) || {})[0];
        if (page && page.missing === undefined) {
          if (page.extract) b.blurb = page.extract.replace(/\s+/g, ' ').slice(0, 420);
          if (!b.image && page.pageimage) b.image = page.pageimage;
          b.wiki = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'));
        }
      }
      if (b.image && !b.credit) {
        const d = await fetchJSON('https://commons.wikimedia.org/w/api.php?' + qs({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName', titles: 'File:' + b.image }));
        const page = Object.values((d.query && d.query.pages) || {})[0];
        const m = page && page.imageinfo && page.imageinfo[0].extmetadata;
        if (m) {
          const artist = m.Artist ? new DOMParser().parseFromString(m.Artist.value, 'text/html').body.textContent.replace(/\s+/g, ' ').trim() : '';
          b.credit = { artist: artist.slice(0, 80) || 'Unknown', license: m.LicenseShortName ? m.LicenseShortName.value : '', page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(b.image.replace(/ /g, '_')) };
        }
      }
    } catch (e) { /* offline or rate-limited: the building still works without Wikipedia data */ }
    b.enriching = false;
    save();
    if (currentPath() === '/b/' + b.id) render();
  }

  // Pull the other photos already sitting on a building's Wikipedia article, so "Popular features"
  // doesn't have to repeat the single hero image for every row.
  const BAD_IMG = /logo|icon|flag|symbol|locator|_map(_|\.)|\.svg$|\.ogv?$|\.pdf$|\.gif$/i;
  async function fetchGallery(b) {
    b.galleryDone = true;
    try {
      const title = decodeURIComponent((b.wiki.split('/wiki/')[1] || '').replace(/_/g, ' '));
      if (!title) return;
      const d = await fetchJSON('https://en.wikipedia.org/w/api.php?' + qs({
        action: 'query', format: 'json', origin: '*', generator: 'images', gimlimit: 20,
        prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: 300, titles: title,
      }));
      const pages = Object.values((d.query && d.query.pages) || {});
      const gallery = pages
        .filter(p => p.imageinfo && p.imageinfo[0] && !BAD_IMG.test(p.title) && (p.imageinfo[0].width || 0) >= 300)
        .map(p => p.imageinfo[0].thumburl || p.imageinfo[0].url)
        .filter(Boolean)
        .slice(0, 8);
      if (gallery.length) { b.gallery = gallery; if (currentPath() === '/b/' + b.id) render(); }
    } catch (e) { /* offline or rate-limited: features fall back to the hero photo */ }
  }

  // ---------- Photo resize ----------
  function resizeImage(file, maxSide, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => cb(null);
      img.src = reader.result;
    };
    reader.onerror = () => cb(null);
    reader.readAsDataURL(file);
  }

  // ---------- Photo viewer ----------
  let viewer = null;
  function openViewer(list, i) {
    closeViewer();
    viewer = { list, i };
    const el = document.createElement('div');
    el.className = 'lightbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Photo viewer');
    root.appendChild(el);
    let x0 = null;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) stepViewer(dx < 0 ? 1 : -1);
    });
    drawViewer();
  }
  function drawViewer() {
    const el = root.querySelector('.lightbox');
    if (!el || !viewer) return;
    const { list, i } = viewer, url = list[i], c = PHOTO_CREDITS[url];
    el.innerHTML = `
      <div class="lb-top"><span class="lb-count">${list.length > 1 ? `${i + 1} / ${list.length}` : ''}</span>
        <button class="btn-sq lb-close" data-act="lbclose" aria-label="Close">${icon('x')}</button></div>
      <div class="lb-stage" data-act="lbclose"><img src="${url}" alt="Photo ${i + 1} of ${list.length}"></div>
      ${list.length > 1 ? `<button class="btn-sq lb-nav prev" data-act="lbprev" aria-label="Previous photo">${icon('back')}</button>
        <button class="btn-sq lb-nav next" data-act="lbnext" aria-label="Next photo">${icon('chevron')}</button>` : ''}
      ${c ? `<div class="lb-credit">Photo: ${esc(c.artist)}${c.license ? ' · ' + esc(c.license) : ''} · <a href="${esc(c.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>` : ''}`;
  }
  function stepViewer(d) {
    if (!viewer) return;
    viewer.i = (viewer.i + d + viewer.list.length) % viewer.list.length;
    drawViewer();
  }
  function closeViewer() {
    const el = root.querySelector('.lightbox'); if (el) el.remove();
    viewer = null;
  }
  document.addEventListener('keydown', e => {
    if (!viewer) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowRight') stepViewer(1);
    if (e.key === 'ArrowLeft') stepViewer(-1);
  });

  // ---------- Confetti ----------
  function celebrate() {
    const old = root.querySelector('.confetti'); if (old) old.remove();
    const host = document.createElement('div');
    host.className = 'confetti';
    const colors = Object.values(STYLES);
    for (let i = 0; i < 16; i++) {
      const bit = document.createElement('span');
      bit.style.setProperty('--dx', (Math.random() * 220 - 110) + 'px');
      bit.style.setProperty('--dy', (Math.random() * -180 - 30) + 'px');
      bit.style.setProperty('--rot', (Math.random() * 360) + 'deg');
      bit.style.background = colors[i % colors.length];
      bit.style.left = (35 + Math.random() * 30) + '%';
      bit.style.animationDelay = (Math.random() * 0.1) + 's';
      host.appendChild(bit);
    }
    root.appendChild(host);
    setTimeout(() => host.remove(), 950);
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const old = root.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    root.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2400);
  }

  // ---------- Router ----------
  function currentPath() { return location.hash.slice(1) || '/feed'; }
  function go(h) { if (location.hash === h) render(); else location.hash = h; }
  function back() {
    const cur = currentPath();
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      if (p !== cur && !p.startsWith('/log') && !p.startsWith('/pin') && !p.startsWith('/editprofile') && !p.startsWith('/save') && !p.startsWith('/newlist') && !/\/invite$/.test(p) && !p.startsWith('/signin')) { trail.length = i; go('#' + p); return; }
    }
    go('#/feed');
  }

  function render() {
    const path = currentPath();
    const [p, qs] = path.split('?');
    const seg = p.split('/').filter(Boolean);
    if (!state.me || !me()) {
      if (seg[0] !== 'signin') { location.replace('#/signin'); return; }
    }
    if (trail[trail.length - 1] !== path) trail.push(path);
    if (trail.length > 50) trail.splice(0, trail.length - 50);
    if (seg[0] !== 'me' && seg[0] !== 'u') resetArmed = false;
    if (seg[0] !== 'log') { draft = null; delArmed = false; }
    if (seg[0] !== 'save' && seg[0] !== 'newlist') inviteSel = new Set();

    destroyMap();
    galleries = [];
    let html, after;
    switch (seg[0]) {
      case 'signin': html = viewSignin(); break;
      case 'feed': html = viewHome('feed'); break;
      case 'map': html = viewHome('map'); after = initMap; break;
      case 'find': html = viewFind(); break;
      case 'lists': html = viewLists(['recs', 'guides'].includes(seg[1]) ? seg[1] : 'mine'); break;
      case 'list': html = seg[1] === 'want' ? viewWantList() : seg[2] === 'invite' ? viewInvite(seg[1]) : viewList(seg[1]); break;
      case 'save': html = viewSaveTo(seg[1]); break;
      case 'newlist': html = viewNewList(); break;
      case 'b': html = viewBuilding(seg[1]); break;
      case 'me': html = viewProfile(state.me); after = () => initBeenMap(state.me); break;
      case 'u': html = viewProfile(seg[1]); after = () => initBeenMap(seg[1]); break;
      case 'followers': html = viewFollowList(seg[1], 'followers'); break;
      case 'following': html = viewFollowList(seg[1], 'following'); break;
      case 'editprofile': html = viewEditProfile(); break;
      case 'log': html = seg[1] ? viewLogRate(seg[1]) : viewLogPick(); break;
      case 'pin': {
        const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(seg[1] || '');
        if (m) { html = viewPin(+m[1], +m[2]); after = () => initPin(+m[1], +m[2]); } else html = viewNotFound();
        break;
      }
      default: html = viewNotFound();
    }
    root.innerHTML = html;
    if (after) after();

    if (state.me && !locAsked && ['map', 'find', 'log'].includes(seg[0])) {
      locAsked = true;
      requestLocation(ok => { if (ok && ['map', 'find', 'log'].includes(currentPath().split('/')[1]) && !currentPath().startsWith('/log/')) render(); });
    }
  }

  // ---------- Actions ----------
  const actions = {
    signup() {
      const name = document.getElementById('su-name').value.trim();
      const handle = document.getElementById('su-handle').value.trim().toLowerCase().replace(/^@/, '');
      if (!name) return toast('Add a display name');
      if (!/^[a-z0-9._]{2,20}$/.test(handle)) return toast('Handle: 2–20 letters, numbers, dots or underscores');
      if (state.users.some(u => u.handle === handle)) return toast('@' + handle + ' is taken');
      const id = 'u-' + Date.now().toString(36);
      const others = state.users.map(u => u.id);
      state.users.push({ id, handle, name, bio: '' });
      // Demo: follow everyone, and everyone follows you back, so your logs show up in their feeds.
      others.forEach(o => { state.follows.push([id, o]); state.follows.push([o, id]); });
      state.lists.filter(l => l.invitesNewUsers).forEach(l => l.members.push(id));
      state.me = id; save();
      Sound.success();
      go('#/feed');
      setTimeout(() => { celebrate(); toast('Welcome, @' + handle); }, 30);
    },
    login(d) { state.me = d.id; save(); Sound.success(); go('#/feed'); toast('Signed in as @' + me().handle); },
    switch() { state.me = null; save(); go('#/signin'); },
    reset() {
      if (!resetArmed) { resetArmed = true; render(); return; }
      resetArmed = false;
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      state = seed(); save();
      try { Object.keys(localStorage).filter(k => k.startsWith('ts.osm.')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
      location.hash = '#/signin'; location.reload();
    },
    back,
    want(d) {
      const i = state.want.findIndex(w => w.userId === state.me && w.buildingId === d.id);
      Sound.tap();
      if (i >= 0) { state.want.splice(i, 1); toast('Removed from Want to Visit'); }
      else { state.want.push({ userId: state.me, buildingId: d.id, createdAt: Date.now() }); toast('Saved to Want to Visit'); }
      save(); render();
    },
    togglewant(d, el) {
      const i = state.want.findIndex(w => w.userId === state.me && w.buildingId === d.id);
      if (i >= 0) state.want.splice(i, 1); else state.want.push({ userId: state.me, buildingId: d.id, createdAt: Date.now() });
      el.classList.toggle('on', i < 0);
      Sound.tap(); save();
    },
    togglelist(d, el) {
      const l = state.lists.find(x => x.id === d.list); if (!l) return;
      const i = l.items.findIndex(it => it.buildingId === d.id);
      if (i >= 0) l.items.splice(i, 1); else l.items.push({ buildingId: d.id, addedBy: state.me, createdAt: Date.now() });
      el.classList.toggle('on', i < 0);
      Sound.tap(); save();
    },
    newlistform() {
      const f = document.getElementById('newlist');
      f.hidden = !f.hidden;
      if (!f.hidden) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('nl-name').focus(); }
    },
    pickinvite(d, el) {
      if (inviteSel.has(d.u)) inviteSel.delete(d.u); else inviteSel.add(d.u);
      el.classList.toggle('on', inviteSel.has(d.u));
    },
    createlist(d) {
      const name = document.getElementById('nl-name').value.trim();
      if (!name) return toast('Give the list a name');
      const l = { id: 'l-' + Date.now().toString(36), name, ownerId: state.me, members: [state.me, ...inviteSel], items: [], createdAt: Date.now() };
      if (d.bid) l.items.push({ buildingId: d.bid, addedBy: state.me, createdAt: Date.now() });
      state.lists.push(l);
      const n = inviteSel.size;
      inviteSel = new Set();
      save(); Sound.success();
      if (d.bid) render(); else location.replace('#/list/' + l.id);
      setTimeout(() => toast(`Created “${name}”` + (n ? ` · invited ${n}` : '')), 30);
    },
    invite(d, el) {
      const l = state.lists.find(x => x.id === d.list); if (!l) return;
      const i = l.members.indexOf(d.u);
      if (i >= 0) l.members.splice(i, 1); else l.members.push(d.u);
      el.classList.toggle('on', i < 0);
      Sound.tap(); save();
    },
    noop() {},
    unlist(d) {
      const l = state.lists.find(x => x.id === d.list); if (!l) return;
      l.items = l.items.filter(it => it.buildingId !== d.id);
      save(); render();
    },
    unwant(d) { state.want = state.want.filter(w => !(w.userId === state.me && w.buildingId === d.id)); save(); render(); },
    follow(d) {
      const i = state.follows.findIndex(f => f[0] === state.me && f[1] === d.id);
      if (i >= 0) state.follows.splice(i, 1); else state.follows.push([state.me, d.id]);
      save();
      if (currentPath().startsWith('/find')) document.getElementById('results').innerHTML = findResults(); else render();
    },
    sort(d) { listSort = d.k; render(); },
    btab(d) { bTab = d.k; render(); },
    // Place type is single-choice ("All" clears it); Been / Want / Friends toggle on and off.
    mapfilter(d) { mapFilter = mapFilter === d.k ? 'all' : d.k; mapSel = null; render(); },
    mapkind(d) { mapKind = d.k; mapSel = null; render(); },
    legend() { document.getElementById('legend').classList.toggle('closed'); },
    locate() {
      requestLocation(ok => {
        if (!ok) toast('Location unavailable — using ' + loc.label);
        if (map) map.setView([loc.lat, loc.lng], 14);
      });
    },
    share(d) {
      const b = BY_ID[d.id], mv = myVisit(d.id);
      const text = mv ? `I gave ${b.name} ${mv.stars}★ on throwShade` : `${b.name} by ${b.architect} — on throwShade`;
      if (navigator.share) navigator.share({ title: b.name, text }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'), () => toast(text));
      else toast(text);
    },
    closelog() { draft = null; back(); },
    findtab(d) { findTab = d.k; findQ = ''; render(); },
    findpeople() { findTab = 'users'; findQ = ''; go('#/find'); },
    viewphoto(d) { const list = galleries[+d.g]; if (list) openViewer(list, +d.i); },
    lbclose(d, el, e) { if (e.target.tagName !== 'IMG') closeViewer(); },
    lbprev() { stepViewer(-1); },
    lbnext() { stepViewer(1); },
    closeedit() { epPhoto = undefined; back(); },
    // Only marks the choice; the name/bio inputs keep their edits because the sheet isn't re-rendered.
    pickavatar(d, el) {
      epPhoto = d.src;
      document.querySelectorAll('.avatar-pick.on').forEach(x => x.classList.remove('on'));
      el.classList.add('on');
    },
    saveprofile() {
      const u = me();
      const name = document.getElementById('ep-name').value.trim();
      const handle = document.getElementById('ep-handle').value.trim().toLowerCase().replace(/^@/, '');
      const bio = document.getElementById('ep-bio').value.trim();
      if (!name) return toast('Add a display name');
      if (!/^[a-z0-9._]{2,20}$/.test(handle)) return toast('Handle: 2–20 letters, numbers, dots or underscores');
      if (handle !== u.handle && state.users.some(x => x.handle === handle)) return toast('@' + handle + ' is taken');
      u.name = name; u.handle = handle; u.bio = bio;
      if (epPhoto) u.photo = epPhoto;
      epPhoto = undefined;
      save(); Sound.success();
      back(); toast('Profile updated');
    },
    droppin() {
      setPinMode(!pinMode);
    },
    pinfrommap() { pendingPinMode = true; mapFilter = 'all'; mapKind = 'all'; go('#/map'); },
    pickosm(d) {
      const L0 = lookups[d.key], r = L0 && L0.results[+d.i];
      if (!r) return;
      const existing = BUILDINGS.find(b => b.osm === r.osm) ||
        (r.tags.wikidata && BUILDINGS.find(b => b.qid === r.tags.wikidata)) ||
        (r.name && BUILDINGS.find(b => km(b, r) < 0.08 && sameName(b.name, r.name)));
      if (existing) { toast(existing.name + ' is already on throwShade'); go('#/log/' + existing.id); return; }
      const b = {
        id: 'osm-' + r.osm.replace('/', '-'), kind: r.kind,
        name: r.name || r.addr || (L0.address ? KINDS[r.kind] + ' at ' + L0.address : 'Unnamed ' + KINDS[r.kind].toLowerCase()),
        architect: r.tags.architect || r.tags.artist_name || r.tags.artist || '', year: r.year, typology: r.typ, style: r.style,
        city: r.tags['addr:city'] || L0.city || '', country: L0.country || '',
        lat: +r.lat.toFixed(6), lng: +r.lng.toFixed(6), osm: r.osm, address: r.addr || L0.address || '',
        qid: r.tags.wikidata || undefined, wikiTag: r.tags.wikipedia || undefined,
        source: 'osm', addedBy: state.me, createdAt: Date.now(),
      };
      addPlace(b);
      if (b.qid || b.wikiTag) enrichFromWiki(b);
    },
    nameit() {
      const f = document.getElementById('nameit');
      f.hidden = !f.hidden;
      if (!f.hidden) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('nb-name').focus(); }
    },
    pickstyle(d) {
      nameStyle = nameStyle === d.k ? null : d.k;
      document.querySelectorAll('[data-act=pickstyle]').forEach(btn => btn.classList.toggle('on', btn.dataset.k === nameStyle));
    },
    savenamed() {
      const p = currentPin(); if (!p) return;
      const name = document.getElementById('nb-name').value.trim();
      const year = parseInt(document.getElementById('nb-year').value, 10);
      if (!name) return toast('Give it a name');
      const L0 = lookups[pinKey(p.lat, p.lng)] || {};
      addPlace({
        id: 'pin-' + Date.now().toString(36), kind: nameKind, name, architect: document.getElementById('nb-arch').value.trim(),
        year: year > 0 && year <= new Date().getFullYear() + 5 ? year : '', typology: KINDS[nameKind],
        style: nameStyle || styleFrom('', year > 0 ? year : ''), city: L0.city || '', country: L0.country || '',
        lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), address: L0.address || '',
        source: 'user', addedBy: state.me, createdAt: Date.now(),
      });
      nameStyle = null; nameKind = 'building';
    },
    pickkind(d) {
      nameKind = d.k;
      document.querySelectorAll('[data-act=pickkind]').forEach(btn => btn.classList.toggle('on', btn.dataset.k === nameKind));
    },
    star(d) {
      Sound.star();
      draft.stars = +d.n;
      document.querySelectorAll('#star-input button').forEach((btn, i) => {
        const on = i < draft.stars;
        btn.classList.toggle('on', on);
        btn.innerHTML = on ? starSVG('#fff', '#fff') : starSVG('none', '#a1a1a6');
        if (on) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
      });
      document.getElementById('star-caption').textContent = STAR_WORDS[draft.stars];
    },
    visitexpand(d) { visitExpanded[d.id] = !visitExpanded[d.id]; render(); },
    visitday(d) { visitDaySel[d.id] = +d.i; delete visitSliderPos[d.id]; render(); },
    rmphoto(d) { draft.photos.splice(+d.i, 1); render(); },
    delvisit(d) {
      if (!delArmed) { delArmed = true; render(); return; }
      delArmed = false;
      state.visits = state.visits.filter(v => !(v.userId === state.me && v.buildingId === d.id));
      save();
      draft = null;
      trail.push('/b/' + d.id);
      location.replace('#/b/' + d.id);
      setTimeout(() => toast('Critique deleted'), 30);
    },
    aspect(d, el) {
      const i = draft.likes.indexOf(d.k);
      if (i >= 0) draft.likes.splice(i, 1); else draft.likes.push(d.k);
      el.classList.toggle('on', i < 0);
    },
    post() {
      if (!draft || !draft.stars) return toast('Pick a star rating first');
      const b = BY_ID[draft.bid];
      const existing = myVisit(draft.bid);
      const snapshot = JSON.stringify(state);
      const fields = { stars: draft.stars, note: draft.note.trim(), likes: draft.likes.slice(), visitedOn: draft.date, createdAt: Date.now() };
      if (existing) Object.assign(existing, fields, { photos: draft.photos.slice() });
      else state.visits.push(Object.assign({ id: 'v' + Date.now().toString(36), userId: state.me, buildingId: draft.bid, photos: draft.photos.slice() }, fields));
      state.want = state.want.filter(w => !(w.userId === state.me && w.buildingId === draft.bid));
      let msg = `Logged ${b.name} · ${draft.stars}★`;
      if (!save()) {
        // Storage full (photos are big): keep the log, drop the photos.
        state = JSON.parse(snapshot);
        const v = myVisit(draft.bid);
        if (v) Object.assign(v, fields, { photos: [] });
        else state.visits.push(Object.assign({ id: 'v' + Date.now().toString(36), userId: state.me, buildingId: draft.bid, photos: [] }, fields));
        state.want = state.want.filter(w => !(w.userId === state.me && w.buildingId === draft.bid));
        save();
        msg = 'Saved without photos — browser storage is full';
      }
      Sound.success();
      const bid = draft.bid;
      draft = null;
      bTab = 'critiques';
      trail.push('/b/' + bid);
      location.replace('#/b/' + bid);
      setTimeout(() => { celebrate(); toast(msg); }, 30);
    },
  };

  const inputs = {
    find(el) { findQ = el.value; document.getElementById('results').innerHTML = findResults(); },
    logq(el) { document.getElementById('logresults').innerHTML = logResults(el.value); },
    note(el) { draft.note = el.value; document.getElementById('note-count').textContent = el.value.length + ' / 280'; },
    date(el) { draft.date = el.value || isoDate(Date.now()); },
    visitslider(el) {
      const id = el.dataset.id, c = visitSunCache[id];
      if (!c) return;
      const idx = +el.value;
      visitSliderPos[id] = idx;
      const h = c.hours[idx];
      if (!h) return;
      const iconEl = document.getElementById('visit-scrub-icon-' + id);
      const tempEl = document.getElementById('visit-scrub-temp-' + id);
      const timeEl = document.getElementById('visit-scrub-time-' + id);
      const labelEl = document.getElementById('visit-scrub-label-' + id);
      if (iconEl) iconEl.textContent = WMO[h.code] || '☀';
      if (tempEl) tempEl.textContent = Math.round(h.temp) + '°F';
      if (timeEl) timeEl.textContent = h.t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (labelEl) labelEl.textContent = lightLabel(h.t, c.sun);
    },
    epbio(el) { document.getElementById('ep-bio-count').textContent = el.value.length + ' / 140'; },
  };

  root.addEventListener('click', e => {
    const t = e.target.closest('[data-act],[data-go]');
    if (!t || !root.contains(t)) return;
    if (t.dataset.act) { e.preventDefault(); e.stopPropagation(); actions[t.dataset.act](t.dataset, t, e); }
    else if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); }
  });
  root.addEventListener('input', e => { const f = e.target.dataset && e.target.dataset.input; if (f && inputs[f]) inputs[f](e.target); });
  root.addEventListener('change', e => {
    if (e.target.dataset && e.target.dataset.change === 'photo' && e.target.files.length && draft) {
      const files = Array.from(e.target.files).slice(0, MAX_PHOTOS - draft.photos.length);
      let pending = files.length;
      files.forEach(f => resizeImage(f, 800, url => {
        if (url && draft && draft.photos.length < MAX_PHOTOS) draft.photos.push(url);
        else if (!url) toast('Couldn’t read one of those images');
        if (--pending === 0) render();
      }));
    }
    if (e.target.dataset && e.target.dataset.change === 'avatarphoto' && e.target.files[0]) {
      resizeImage(e.target.files[0], 300, url => {
        if (!url) return toast('Couldn’t read that image');
        me().photo = url;
        save(); Sound.success(); render();
      });
    }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'su-name' || e.target.id === 'su-handle')) actions.signup();
  });

  window.addEventListener('hashchange', render);
  if (!load()) save();
  render();
})();
