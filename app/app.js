// ThrowingShade — local demo web app. Vanilla JS, hash routing, state in localStorage.
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
  const LINE = '#c8c8c8';
  const STAR_WORDS = ['', 'Throwing shade', 'Not for me', 'It’s fine', 'Loved it', 'Pilgrimage-worthy'];

  // ---------- Store ----------
  let state = load() || seed();
  state.places.forEach(registerBuilding);

  function seed() {
    const now = Date.now();
    const users = window.TS_SEED_USERS.map(u => ({ ...u }));
    const follows = [];
    users.forEach(a => users.forEach(b => { if (a.id !== b.id) follows.push([a.id, b.id]); }));
    const visits = window.TS_SEED_VISITS.map(([userId, buildingId, stars, note, h], i) => ({
      id: 'v' + i, userId, buildingId, stars, note, photo: null,
      visitedOn: isoDate(now - h * HOUR - (i % 4) * DAY),
      createdAt: now - h * HOUR,
    }));
    const want = window.TS_SEED_WANT.map(([userId, buildingId]) => ({ userId, buildingId, createdAt: now }));
    return { me: null, users, follows, visits, want, places: [] };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.users ? Object.assign({ places: [] }, s) : null; } catch (e) { return null; }
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
  function photoFor(bid) {
    const vs = visitsFor(bid).filter(v => v.photo).sort((a, b) => (b.userId === state.me) - (a.userId === state.me) || b.createdAt - a.createdAt);
    return vs.length ? vs[0].photo : null;
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
    for (let i = 1; i <= 5; i++) s += i <= n ? starSVG(INK, INK) : starSVG('none', LINE);
    return `<span class="stars ${size || ''}" role="img" aria-label="${n} out of 5 stars">${s}</span>`;
  }
  function scoreHTML(val) {
    return `<span class="score">${val}${starSVG(INK, INK)}</span>`;
  }
  // Hatching: architectural "shade" drawn in the building's style colour — stands in for a photo.
  function hatchURL(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#e4e4e4"/><path d="M-2.5 2.5l5-5M0 10L10 0M7.5 12.5l5-5" stroke="${color}" stroke-width="1.4" stroke-opacity=".6"/></svg>`;
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
  const phLabel = b => [b.style, b.year].filter(Boolean).join(' · ').toUpperCase();
  const byLine = b => [b.architect, b.year].filter(Boolean).join(' · ');
  function avatar(u, size) {
    return `<div class="avatar ${size || ''}" data-go="#/u/${u.id}" aria-label="${esc(u.name)}">${esc(initials(u.name))}</div>`;
  }
  function nav(active) {
    const item = (key, href, label) => `<a href="${href}" class="${active === key ? 'on' : ''}"><div class="ic"></div>${label}</a>`;
    return `<nav class="nav">
      ${item('home', '#/feed', 'Home')}
      ${item('lists', '#/lists', 'Lists')}
      <a href="#/log" class="plus" aria-label="Log a building">+</a>
      ${item('map', '#/map', 'Map')}
      ${item('you', '#/me', 'You')}
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
  let mapFilter = 'all', mapSel = null, map = null, mapMarkers = {}, mapView = null, pinMode = false, pinMap = null, mapFocus = false;
  let findTab = 'buildings', findQ = '';
  let listSort = 'top';
  let bTab = 'critiques';
  let draft = null;
  let resetArmed = false;
  let delArmed = false;
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
      <div class="mark">THROWING<br>SHADE</div>
      <div class="muted">Rate every building you walk into. Find the next one worth the trip.</div>
      <div class="ph hatch-band" style="${hatch(INK)}"></div>
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
    if (mine) action = `<button class="btn block" data-go="#/log/${b.id}">Edit critique</button>`;
    else if (mv) action = `<button class="btn block" data-go="#/b/${b.id}">Been · you gave ${mv.stars}★</button>`;
    else action = `<button class="btn block ${isWant(state.me, b.id) ? 'on' : ''}" data-act="want" data-id="${b.id}">${isWant(state.me, b.id) ? '✓ On Want to Visit' : '+ Want to Visit'}</button>`;
    return `<div class="card">
      <div class="card-head">
        ${avatar(u)}
        <div class="who"><b data-go="#/u/${u.id}">${mine ? 'You' : esc(u.handle)}</b> rated <b data-go="#/b/${b.id}">${esc(b.name)}</b><div class="small muted">${esc(b.city)} · ${ago(v.createdAt)}</div></div>
        ${scoreHTML(v.stars)}
      </div>
      ${ph(b, { photo: v.photo, w: 720, style: 'height:180px', label: phLabel(b) })}
      ${v.note ? `<div class="quote">“${esc(v.note)}”</div>` : ''}
      <div class="row-flex">${action}<button class="btn" style="width:64px" data-go="#/b/${b.id}">Open</button></div>
    </div>`;
  }

  function viewHome(tab) {
    const head = `
      <div class="topbar"><div class="wordmark">THROWING SHADE</div><button class="btn-sq" aria-label="Search" data-go="#/find">Find</button></div>
      <div class="toggle">
        <button class="${tab === 'feed' ? 'on' : ''}" data-go="#/feed">Feed</button>
        <button class="${tab === 'map' ? 'on' : ''}" data-go="#/map">Map</button>
      </div>`;
    if (tab === 'map') {
      const pill = (k, label) => `<button class="pill ${mapFilter === k ? 'on' : ''}" data-act="mapfilter" data-k="${k}">${label}</button>`;
      return `<div class="screen with-nav fixed" style="display:flex;flex-direction:column">
        ${head}
        <div class="pills">${pill('all', 'All')}${pill('been', 'Been')}${pill('want', 'Want to Visit')}${pill('friends', 'Friends’ picks')}</div>
        <div class="map-wrap" style="position:relative;flex:1">
          <div id="map"></div>
          <div class="map-legend" id="legend">
            <button class="legend-toggle" data-act="legend">Styles ▾</button>
            <div class="legend-items stack-6" style="gap:4px">${Object.entries(STYLES).map(([s, c]) => `<div><span class="dot" style="background:${c}"></span> ${s}</div>`).join('')}
              <div class="muted" style="margin-top:2px">● been&nbsp;&nbsp;○ want</div></div>
          </div>
          <button class="btn-sq map-locate" data-act="locate" aria-label="Locate me">Locate</button>
          <button class="btn-sq map-pinbtn" id="pinbtn" data-act="droppin" aria-label="Drop a pin to add a building">Pin</button>
          <div class="map-hint" id="map-hint" hidden>Tap a building to add it · or long-press</div>
          <div id="map-card"></div>
        </div>
      </div>${nav('map')}`;
    }
    const fids = followingIds(state.me);
    const items = state.visits.filter(v => fids.has(v.userId) || v.userId === state.me).sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
    const body = items.length ? items.map(feedCard).join('') :
      `<div class="empty">Your feed is empty.<br>Follow some critics to see what they’re rating.</div><button class="btn dashed" data-go="#/find?people">Find people</button>`;
    return `<div class="screen with-nav">${head}<div class="stack pad">${body}</div><div class="spacer"></div></div>${nav('home')}`;
  }

  function buildingRow(b, right) {
    return `<button class="row" data-go="#/b/${b.id}">
      ${ph(b, { style: 'width:38px;height:38px', go: false })}
      <div class="grow"><div class="ellipsis">${esc(b.name)}</div><div class="sub ellipsis">${esc(b.architect)} · ${esc(b.city)}</div></div>
      ${right || ''}
    </button>`;
  }

  function findResults() {
    const q = findQ.trim().toLowerCase();
    if (findTab === 'people') {
      const people = state.users.filter(u => u.id !== state.me && (!q || u.handle.includes(q) || u.name.toLowerCase().includes(q)));
      if (!people.length) return `<div class="empty">No one matches “${esc(findQ)}”.</div>`;
      return people.map(u => {
        const f = isFollowing(state.me, u.id);
        return `<div class="row" data-go="#/u/${u.id}">
          ${avatar(u)}<div class="grow"><b>${esc(u.name)}</b><div class="sub">@${esc(u.handle)} · ${visitsBy(u.id).length} logged</div></div>
          <button class="btn ${f ? '' : 'on'}" data-act="follow" data-id="${u.id}">${f ? 'Following' : 'Follow'}</button>
        </div>`;
      }).join('');
    }
    let list;
    if (!q) {
      list = nearest(BUILDINGS).slice(0, 15);
      return `<div class="caps">Nearby · ${locNote()}</div>` + list.map(x => buildingRow(x.b, `<span class="small muted">${fmtKm(x.d)}</span>`)).join('');
    }
    list = BUILDINGS.filter(b => [b.name, b.architect, b.city, b.country, b.style, b.typology].join(' ').toLowerCase().includes(q));
    if (!list.length) return `<div class="empty">No buildings match “${esc(findQ)}”.</div><button class="btn dashed" style="height:48px;width:100%" data-act="pinfrommap">Drop a pin to add it</button>`;
    return nearest(list).map(x => buildingRow(x.b, `<span class="small muted">${fmtKm(x.d)}</span>`)).join('');
  }

  function viewFind(qs) {
    if (qs === 'people') findTab = 'people';
    return `<div class="screen with-nav">
      <div class="topbar"><button class="btn-sq thin arrow" data-act="back" aria-label="Back">←</button><div class="h1 grow">Find</div></div>
      <div class="pad"><input class="input" data-input="find" value="${esc(findQ)}" placeholder="Buildings, architects, cities, people" autocomplete="off" autocapitalize="none"></div>
      <div class="tabs" style="margin:8px 16px 12px">
        <button class="${findTab === 'buildings' ? 'on' : ''}" data-act="findtab" data-k="buildings">Buildings</button>
        <button class="${findTab === 'people' ? 'on' : ''}" data-act="findtab" data-k="people">People</button>
      </div>
      <div id="results" class="stack-6 pad">${findResults()}</div>
      <div class="spacer"></div>
    </div>${nav('')}`;
  }

  function viewLists(tab) {
    const tabs = `<div class="tabs" style="margin:0 16px 12px">
      <button class="${tab === 'been' ? 'on' : ''}" data-go="#/lists">Been</button>
      <button class="${tab === 'want' ? 'on' : ''}" data-go="#/lists/want">Want to Visit</button></div>`;
    let body;
    if (tab === 'want') {
      const items = state.want.filter(w => w.userId === state.me).sort((a, b) => b.createdAt - a.createdAt);
      const fids = followingIds(state.me);
      body = items.length ? items.map(w => {
        const b = BY_ID[w.buildingId]; if (!b) return '';
        const loved = visitsFor(b.id).filter(v => fids.has(v.userId) && v.stars >= 4).length;
        const a = avgFor(b.id);
        return `<div class="row" data-go="#/b/${b.id}">
          ${ph(b, { style: 'width:38px;height:38px', go: false })}
          <div class="grow"><div class="ellipsis">${esc(b.name)}</div><div class="sub ellipsis">${esc(b.city)}${loved ? ` · ${loved} friend${loved > 1 ? 's' : ''} loved it` : ''}</div></div>
          ${a.avg ? `<b>${a.avg.toFixed(1)}</b>` : ''}
          <button class="btn-sq thin" style="width:36px;height:36px;font-size:13px" data-act="unwant" data-id="${b.id}" aria-label="Remove">✕</button>
        </div>`;
      }).join('') : `<div class="empty">Nothing saved yet.<br>Tap “+ Want to Visit” on a friend’s log.</div>`;
      body += `<button class="btn dashed" style="height:56px" data-go="#/find">+ Find buildings</button>`;
    } else {
      const vs = visitsBy(state.me).slice().sort(listSort === 'top' ? (a, b) => b.stars - a.stars || b.createdAt - a.createdAt : (a, b) => b.createdAt - a.createdAt);
      const pill = (k, l) => `<button class="pill ${listSort === k ? 'on' : ''}" data-act="sort" data-k="${k}">${l}</button>`;
      body = `<div class="row-flex">${pill('top', 'Top rated')}${pill('recent', 'Recent')}</div>`;
      body += vs.length ? vs.map((v, i) => {
        const b = BY_ID[v.buildingId]; if (!b) return '';
        return `<button class="row" data-go="#/b/${b.id}">
          <span class="rank">${i + 1}</span>
          ${ph(b, { style: 'width:38px;height:38px', go: false })}
          <div class="grow"><div class="ellipsis">${esc(b.name)}</div><div class="sub ellipsis">${esc(b.city)} · ${fmtDate(v.visitedOn)}</div></div>
          ${starsHTML(v.stars)}
        </button>`;
      }).join('') : `<div class="empty">You haven’t logged anything yet.</div>`;
      body += `<button class="btn dashed" style="height:56px" data-go="#/log">+ Log a building</button>`;
    }
    return `<div class="screen with-nav">
      <div class="topbar"><div class="h1">Lists</div></div>
      ${tabs}<div class="stack-6 pad">${body}</div><div class="spacer"></div>
    </div>${nav('lists')}`;
  }

  function viewBuilding(id) {
    const b = BY_ID[id];
    if (!b) return viewNotFound();
    const a = avgFor(b.id), mv = myVisit(b.id);
    const fids = followingIds(state.me);
    const vs = visitsFor(b.id).sort((x, y) =>
      (y.userId === state.me) - (x.userId === state.me) || fids.has(y.userId) - fids.has(x.userId) || y.createdAt - x.createdAt);
    const photos = vs.filter(v => v.photo);
    const want = isWant(state.me, b.id);
    let tabBody;
    if (bTab === 'photos') {
      tabBody = photos.length
        ? `<div class="photo-grid">${photos.map(v => `<div class="ph photo" style="background-image:url('${v.photo}');background-size:cover;background-position:center"></div>`).join('')}</div>`
        : `<div class="empty">No photos yet. Log a visit to add the first.</div>`;
    } else {
      tabBody = vs.length ? vs.map(v => {
        const u = user(v.userId); if (!u) return '';
        return `<div style="display:flex;gap:10px">
          ${avatar(u)}
          <div class="grow" style="line-height:1.4">
            <b data-go="#/u/${u.id}">${v.userId === state.me ? 'You' : esc(u.handle)}</b> · ${starsHTML(v.stars)}
            <span class="small muted"> · ${fmtDate(v.visitedOn)}</span>
            ${v.note ? `<div>“${esc(v.note)}”</div>` : ''}
            ${v.photo ? `<div class="ph photo" style="margin-top:6px;width:120px;height:90px;background-image:url('${v.photo}');background-size:cover;background-position:center"></div>` : ''}
          </div></div>`;
      }).join('') : `<div class="empty">No critiques yet. Be the first to throw shade.</div>`;
    }
    // Credit the Commons photographer whenever the hero is the Commons image (not a user's photo).
    const heroIsCommons = !photoFor(b.id) && b.image;
    const credit = heroIsCommons && b.credit
      ? `<div class="credit">Photo: ${esc(b.credit.artist)}${b.credit.license ? ' · ' + esc(b.credit.license) : ''} · <a href="${esc(b.credit.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>`
      : heroIsCommons ? `<div class="credit"><a href="${esc(commonsURL(b.image, 1200))}" target="_blank" rel="noopener">Photo: Wikimedia Commons</a></div>` : '';
    const q = encodeURIComponent(b.name + (b.city ? ' ' + b.city : ''));
    const links = [
      b.wiki && `<a class="chip" href="${esc(b.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a>`,
      b.osm && `<a class="chip" href="https://www.openstreetmap.org/${esc(b.osm)}" target="_blank" rel="noopener">OpenStreetMap ↗</a>`,
      `<a class="chip dashed" href="https://www.archdaily.com/search/all?q=${encodeURIComponent(b.name)}" target="_blank" rel="noopener">ArchDaily ↗</a>`,
      `<a class="chip dashed" href="https://www.dezeen.com/?s=${q}" target="_blank" rel="noopener">Dezeen ↗</a>`,
    ].filter(Boolean).join('');
    const adder = b.addedBy && user(b.addedBy);
    return `<div class="screen">
      ${ph(b, { cls: 'hero', w: 1000, label: phLabel(b), go: false, inner: `
        <button class="btn-sq arrow left" data-act="back" aria-label="Back">←</button>
        <button class="btn-sq right" data-act="share" data-id="${b.id}" aria-label="Share">Share</button>` })}
      ${credit}
      <div class="pad stack" style="padding-top:16px">
        <div><div class="h-building">${esc(b.name)}</div>
          <div class="muted" style="margin-top:2px">${esc([b.architect, b.year, b.typology, b.city].filter(Boolean).join(' · '))}</div></div>
        <div class="chips"><span class="chip"><span class="dot" style="background:${styleColor(b)}"></span>${esc(b.style)}</span>${b.country ? `<span class="chip dashed">${esc(b.country)}</span>` : ''}</div>
        ${visitTimingHTML(b)}
        <div class="row-flex" style="gap:12px">
          <div class="statbox"><div class="caps">Community</div><div class="val">${a.avg ? scoreHTML(a.avg.toFixed(1)).replace('class="score"', 'class="score" style="font-size:26px"') : '—'}</div><div class="tiny muted">${a.n} log${a.n === 1 ? '' : 's'}</div></div>
          <div class="statbox"><div class="caps">Your rating</div>
            ${mv ? `<div class="val" style="padding:6px 0 4px">${starsHTML(mv.stars, 'lg')}</div><div class="tiny muted">${STAR_WORDS[mv.stars]} · ${fmtDate(mv.visitedOn)}</div>`
                 : `<div class="val">Not yet</div><div class="tiny muted">Log a visit to rate</div>`}
          </div>
        </div>
        <button class="btn-primary" data-go="#/log/${b.id}">${mv ? 'Edit your critique' : 'Throw Shade'}</button>
        <div class="row-flex">
          ${mv ? '' : `<button class="btn block ${want ? 'on' : ''}" style="font-size:14px" data-act="want" data-id="${b.id}">${want ? '✓ Want to Visit' : '+ Want to Visit'}</button>`}
          <a class="btn block" style="font-size:14px" href="https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}" target="_blank" rel="noopener">Directions</a>
        </div>
        <div class="about">
          <div class="bold">About</div>
          ${b.blurb ? `<div class="quote">${esc(b.blurb)}</div>` : b.enriching ? '<div class="muted small">Looking up Wikipedia…</div>' : ''}
          ${b.address ? `<div class="small muted">${esc(b.address)}</div>` : ''}
          <div class="small muted">${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}${adder ? ` · pinned by @${esc(adder.handle)}` : ''}</div>
          <div class="chips">${links}</div>
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
    const vs = visitsBy(uid).sort((a, b) => b.stars - a.stars || b.createdAt - a.createdAt);
    const cities = new Set(vs.map(v => BY_ID[v.buildingId] && BY_ID[v.buildingId].city)).size;
    const avg = vs.length ? (vs.reduce((s, v) => s + v.stars, 0) / vs.length).toFixed(1) : '—';

    const top = vs.slice(0, 4).map((v, i) => ph(BY_ID[v.buildingId], { inner: `<span class="ph-label">${i + 1} · ${esc(BY_ID[v.buildingId].name)}</span>` })).join('');
    const topFill = Array.from({ length: Math.max(0, 4 - vs.length) }, () => '<div class="ph"></div>').join('');

    const tiers = [['S', 5, INK], ['A', 4, '#6b6b6b'], ['B', 3, '#8a8a8a'], ['C', 2, '#b0b0b0']].map(([t, s, c]) => {
      const items = vs.filter(v => (s === 2 ? v.stars <= 2 : v.stars === s));
      if (!items.length) return '';
      return `<div class="tier"><div class="t" style="background:${c}">${t}</div>${items.map(v => ph(BY_ID[v.buildingId], { initials: true })).join('')}</div>`;
    }).join('');

    const styleCounts = {};
    vs.forEach(v => { const b = BY_ID[v.buildingId]; if (b) styleCounts[b.style] = (styleCounts[b.style] || 0) + 1; });
    const maxC = Math.max(1, ...Object.values(styleCounts));
    const bars = Object.entries(styleCounts).sort((a, b) => b[1] - a[1]).map(([s, n]) =>
      `<div style="display:flex;align-items:center;gap:10px"><div class="small" style="width:108px">${esc(s)}</div><div class="bar"><div style="width:${Math.round(n / maxC * 100)}%"></div></div><div class="small" style="width:18px;text-align:right">${n}</div></div>`).join('');

    const recent = visitsBy(uid).sort((a, b) => b.createdAt - a.createdAt).map(v => {
      const b = BY_ID[v.buildingId]; if (!b) return '';
      return `<button class="row" data-go="#/b/${b.id}">
        ${ph(b, { style: 'width:38px;height:38px', go: false })}
        <div class="grow"><div class="ellipsis">${esc(b.name)}</div><div class="sub ellipsis">${v.note ? '“' + esc(v.note) + '”' : esc(b.city)}</div></div>
        ${starsHTML(v.stars)}
      </button>`;
    }).join('');

    const following = isFollowing(state.me, uid);
    return `<div class="screen with-nav">
      ${own ? '' : `<div class="topbar" style="padding-bottom:0"><button class="btn-sq thin arrow" data-act="back" aria-label="Back">←</button></div>`}
      <div style="display:flex;gap:14px;align-items:center;padding:16px">
        ${avatar(u, 'lg').replace('data-go', 'data-x')}
        <div class="grow" style="line-height:1.3"><b style="font-size:20px">${esc(u.name)}</b><div class="muted">@${esc(u.handle)}</div>${u.bio ? `<div class="small">${esc(u.bio)}</div>` : ''}</div>
      </div>
      <div class="stat-table" style="margin:0 16px">
        <div><b>${vs.length}</b><div class="tiny muted">Logged</div></div>
        <div><b>${cities}</b><div class="tiny muted">Cities</div></div>
        <div><b>${followerCount(uid)}</b><div class="tiny muted">Followers</div></div>
        <div><b>${followingIds(uid).size}</b><div class="tiny muted">Following</div></div>
      </div>
      ${own ? '' : `<div class="pad" style="margin-top:12px">${following
        ? `<button class="btn" style="width:100%;height:48px;font-size:14px;font-weight:600" data-act="follow" data-id="${uid}">Following</button>`
        : `<button class="btn-primary" style="height:48px" data-act="follow" data-id="${uid}">Follow</button>`}</div>`}
      <div class="pad" style="padding-top:16px;display:flex;flex-direction:column;gap:18px">
        <div><div class="bold" style="margin-bottom:8px">Top 4</div><div class="top4">${top}${topFill}</div></div>
        <div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>Tier list</b><span class="small muted">Avg ${avg}★</span></div>
          <div class="stack-6">${tiers || '<div class="empty">No ratings yet.</div>'}</div></div>
        ${bars ? `<div><div class="bold" style="margin-bottom:8px">By style</div><div class="stack-6" style="gap:8px">${bars}</div></div>` : ''}
        <div><div class="bold" style="margin-bottom:8px">Critiques</div><div class="stack-6">${recent || '<div class="empty">Nothing logged yet.</div>'}</div></div>
        ${own ? `<div class="row-flex"><button class="btn block" data-act="switch">Switch account</button><button class="btn block ${resetArmed ? 'on' : ''}" data-act="reset">${resetArmed ? 'Tap again to reset' : 'Reset demo data'}</button></div>` : ''}
      </div>
      <div class="spacer"></div>
    </div>${nav(own ? 'you' : '')}`;
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
    const list = q ? BUILDINGS.filter(b => [b.name, b.architect, b.city, b.style].join(' ').toLowerCase().includes(q)) : BUILDINGS;
    const rows = nearest(list).slice(0, q ? 40 : 12).map(x => {
      const mv = myVisit(x.b.id);
      return `<button class="row" data-go="#/log/${x.b.id}">
        ${ph(x.b, { style: 'width:38px;height:38px', go: false })}
        <div class="grow"><div class="ellipsis">${esc(x.b.name)}</div><div class="sub ellipsis">${esc(x.b.architect)} · ${esc(x.b.city)}</div></div>
        <span class="small ${mv ? '' : 'muted'}">${mv ? `Your ${mv.stars}★` : fmtKm(x.d)}</span>
      </button>`;
    }).join('');
    return (q ? '' : `<div class="caps">Nearby · ${locNote()}</div>`) + (rows || `<div class="empty">No buildings match “${esc(q)}”.</div>`);
  }

  function viewLogPick() {
    return sheet('Throw Shade', 1, 2,
      `<button class="btn-sq thin" data-act="closelog" aria-label="Close">✕</button>`,
      `<input class="input" data-input="logq" placeholder="Search a building, architect or city" autocomplete="off">
       <button class="btn dashed" style="height:48px" data-act="pinfrommap">Not listed? Drop a pin on the map</button>
       <div id="logresults" class="stack-6">${logResults('')}</div>`);
  }

  function viewLogRate(bid) {
    const b = BY_ID[bid];
    if (!b) return viewNotFound();
    if (!draft || draft.bid !== bid) {
      const mv = myVisit(bid);
      draft = mv ? { bid, stars: mv.stars, note: mv.note || '', date: mv.visitedOn, photo: mv.photo } : { bid, stars: 0, note: '', date: isoDate(Date.now()), photo: null };
    }
    const starBtns = [1, 2, 3, 4, 5].map(n => `<button data-act="star" data-n="${n}" class="${n <= draft.stars ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">${n <= draft.stars ? starSVG('#fff', '#fff') : starSVG('none', INK)}</button>`).join('');
    const editing = !!myVisit(bid);
    return sheet('Your critique', 2, 2,
      `<button class="btn-sq thin" data-go="#/log" aria-label="Back">←</button>`,
      `<div style="display:flex;gap:12px;align-items:center;border:1.5px solid var(--line);border-radius:6px;padding:10px">
         ${ph(b, { style: 'width:56px;height:56px', go: false })}
         <div style="line-height:1.3"><b style="font-size:16px">${esc(b.name)}</b><div class="small muted">${esc(byLine(b))}</div></div>
       </div>
       <div class="field"><div class="label">Your rating</div><div class="star-input" id="star-input">${starBtns}</div>
         <div class="star-caption" id="star-caption">${STAR_WORDS[draft.stars] || '<span class="muted" style="font-weight:400;font-size:14px">Tap to rate</span>'}</div></div>
       <div class="field"><label for="visitdate">Date visited</label><input id="visitdate" class="input" type="date" data-input="date" value="${draft.date}" max="${isoDate(Date.now())}"></div>
       <div class="field"><div class="label">Photo <span class="muted" style="font-weight:400">(optional)</span></div>
         <div style="display:flex;gap:10px">
           <label class="photo-add" for="photo-in" aria-label="Add photo">+</label>
           ${draft.photo ? `<div class="ph photo" style="width:80px;height:80px;background-image:url('${draft.photo}');background-size:cover;background-position:center">
              <button class="btn-sq thin" style="position:absolute;right:2px;top:2px;width:26px;height:26px;font-size:11px" data-act="rmphoto" aria-label="Remove photo">✕</button></div>`
             : `<div class="ph" style="width:80px;height:80px"></div>`}
         </div>
         <input id="photo-in" type="file" accept="image/*" hidden data-change="photo"></div>
       <div class="field"><label for="critique">Quick critique</label>
         <textarea id="critique" class="input" maxlength="280" data-input="note" placeholder="Say something sharp…">${esc(draft.note)}</textarea>
         <div class="counter" id="note-count">${draft.note.length} / 280</div></div>
       <div class="sheet-foot stack-6">
         <button class="btn-primary" data-act="post">${editing ? 'Update critique' : 'Post critique'}</button>
         ${editing ? `<button class="btn block ${delArmed ? 'on' : ''}" data-act="delvisit" data-id="${bid}">${delArmed ? 'Tap again to delete' : 'Delete critique'}</button>` : ''}
       </div>`);
  }

  function viewNotFound() {
    return `<div class="screen with-nav"><div class="topbar"><button class="btn-sq thin arrow" data-act="back">←</button></div>
      <div class="pad"><div class="empty">That page doesn’t exist.</div></div></div>${nav('')}`;
  }

  // ---------- Map ----------
  function destroyMap() {
    if (map) { map.remove(); map = null; mapMarkers = {}; }
    if (pinMap) { pinMap.remove(); pinMap = null; }
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
    return list.map(b => ({ b, kind: mapFilter === 'friends' && kind(b) === 'other' ? 'been' : kind(b) }));
  }
  function pinIcon(b, kind) {
    const cls = kind === 'been' ? '' : kind;
    return window.L.divIcon({ className: '', html: `<div class="pin ${cls} ${mapSel === b.id ? 'sel' : ''}" style="--c:${styleColor(b)}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
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
      <div style="font-size:20px">${a.avg ? scoreHTML(a.avg.toFixed(1)).replace('class="score"', 'class="score" style="font-size:20px"') : '<span class="small muted">No logs</span>'}</div>
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
  let nameStyle = null, pendingPinMode = false;

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

  function weatherKey(lat, lng) { return lat.toFixed(2) + ',' + lng.toFixed(2); }

  function sunTimesFor(b) {
    if (typeof SunCalc === 'undefined') return null;
    const now = new Date();
    const times = SunCalc.getTimes(now, b.lat, b.lng);
    return { now, sunrise: times.sunrise, sunset: times.sunset, goldenHour: times.goldenHour, goldenHourEnd: times.goldenHourEnd };
  }

  async function loadWeather(b) {
    const key = weatherKey(b.lat, b.lng);
    if (weatherCache[key]) return;
    weatherCache[key] = { loading: true };
    try {
      const d = await fetchJSON('https://api.open-meteo.com/v1/forecast?' + qs({
        latitude: b.lat, longitude: b.lng, current: 'temperature_2m,weather_code',
        daily: 'weather_code,temperature_2m_max,sunset', temperature_unit: 'fahrenheit', timezone: 'auto', forecast_days: 5,
      }), null, 8000);
      weatherCache[key] = { loading: false, current: d.current, daily: d.daily };
    } catch (e) {
      weatherCache[key] = { loading: false, error: true };
    }
    if (currentPath() === '/b/' + b.id) render();
  }

  function visitTimingHTML(b) {
    const sun = sunTimesFor(b);
    if (!sun) return '';
    const key = weatherKey(b.lat, b.lng);
    const w = weatherCache[key];
    if (!w) { loadWeather(b); }
    const dayStart = sun.sunrise.getTime(), dayEnd = sun.sunset.getTime();
    const pct = t => Math.max(0, Math.min(100, (t - dayStart) / (dayEnd - dayStart) * 100));
    const nowPct = pct(sun.now.getTime());
    const goldenPct = pct(sun.goldenHour.getTime());
    const fmtTime = t => t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const msToGolden = sun.goldenHour.getTime() - sun.now.getTime();
    const inGolden = sun.now >= sun.goldenHour && sun.now <= sun.sunset;
    let noteHTML;
    if (inGolden) {
      noteHTML = `<b>Golden hour now</b> — the light won't be this good again till tomorrow.`;
    } else if (msToGolden > 0 && msToGolden < 3 * 3600 * 1000) {
      const h = Math.floor(msToGolden / 3600000), m = Math.round((msToGolden % 3600000) / 60000);
      noteHTML = `<b>Golden hour in ${h > 0 ? h + 'h ' : ''}${m}m</b>` + (w && w.current ? ` — ${wmoLabel(w.current.weather_code).toLowerCase()} skies.` : '.');
    } else if (sun.now > sun.sunset || sun.now < sun.sunrise) {
      noteHTML = `Sun's down. Golden hour tomorrow around ${fmtTime(sun.goldenHour)}.`;
    } else {
      noteHTML = `Golden hour today at ${fmtTime(sun.goldenHour)}.`;
    }

    const statusHTML = w && w.current
      ? `<span class="visit-icon">${WMO[w.current.weather_code] || '☀'}</span>${wmoLabel(w.current.weather_code)}, ${Math.round(w.current.temperature_2m)}°F`
      : w && w.error ? `<span class="visit-icon">—</span>Weather unavailable` : `<span class="visit-icon">…</span>Loading…`;

    let forecastHTML = '';
    if (w && w.daily) {
      const codes = w.daily.weather_code, highs = w.daily.temperature_2m_max, sunsets = w.daily.sunset, dates = w.daily.time;
      const bestIdx = codes.reduce((best, c, i) => (i > 0 && c <= 2 && (best < 0 || c < codes[best])) ? i : best, -1);
      forecastHTML = `<div class="forecast-row">${dates.map((d, i) => {
        const day = i === 0 ? 'Today' : new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short' });
        const sset = new Date(sunsets[i]);
        return `<div class="forecast-day${i === bestIdx ? ' best' : ''}">
          <div class="d">${day}</div>
          <div class="icon">${WMO[codes[i]] || '☀'}</div>
          <div class="t">${Math.round(highs[i])}°</div>
          <div class="g">${fmtTime(sset)}</div>
          ${i === bestIdx ? '<div class="badge-best">BEST</div>' : ''}
        </div>`;
      }).join('')}</div>`;
    }

    return `<div class="visit-card">
      <div class="visit-top">
        <div class="visit-status">${statusHTML}</div>
      </div>
      <div class="visit-bar">
        <div class="visit-bar-fill" style="width:${nowPct}%"></div>
        <div class="visit-bar-marker" style="left:${nowPct}%" data-label="NOW"></div>
        <div class="visit-bar-marker golden" style="left:${goldenPct}%" data-label="GOLDEN"></div>
      </div>
      <div class="visit-times"><span>${fmtTime(sun.sunrise)}</span><span>${fmtTime(sun.sunset)}</span></div>
      <div class="visit-note"><span class="dot-live"></span><span>${noteHTML}</span></div>
      ${forecastHTML}
    </div>`;
  }

  async function overpass(lat, lng) {
    const q = `[out:json][timeout:10];(way(around:25,${lat},${lng})[building];relation(around:25,${lat},${lng})[building];` +
      `way(around:90,${lat},${lng})[building][name];relation(around:90,${lat},${lng})[building][name];);out tags center 25;`;
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
  function typeLabel(t) {
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
      osm, tags, lat: clat, lng: clng, year,
      d: Math.round(km({ lat: plat, lng: plng }, { lat: clat, lng: clng }) * 1000),
      name: tags.name || '', addr: addrOf(tags), typ: typeLabel(tags),
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
      `<button class="btn-sq thin" data-act="closelog" aria-label="Close">✕</button>`,
      `<div id="pinmap" class="pin-map"></div>
       <div class="caps">Pin · ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
       ${near.length ? `<div class="stack-6"><div class="caps">Already on Throwing Shade</div>${nearRows}</div>` : ''}
       <div class="stack-6"><div class="caps">From OpenStreetMap</div><div id="osm-results" class="stack-6">${osmResultsHTML(key)}</div></div>
       <button class="btn dashed" style="height:56px" data-act="nameit">+ Name it yourself</button>
       <div id="nameit" class="stack" hidden>
         <div class="field"><label for="nb-name">Building name</label><input id="nb-name" class="input" autocomplete="off" placeholder="${esc((lookups[key] && lookups[key].address) || 'e.g. The corner pavilion')}"></div>
         <div class="row-flex">
           <div class="field grow"><label for="nb-arch">Architect <span class="muted" style="font-weight:400">(optional)</span></label><input id="nb-arch" class="input" autocomplete="off"></div>
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
      if (p !== cur && !p.startsWith('/log') && !p.startsWith('/pin') && !p.startsWith('/signin')) { trail.length = i; go('#' + p); return; }
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

    destroyMap();
    let html, after;
    switch (seg[0]) {
      case 'signin': html = viewSignin(); break;
      case 'feed': html = viewHome('feed'); break;
      case 'map': html = viewHome('map'); after = initMap; break;
      case 'find': html = viewFind(qs); break;
      case 'lists': html = viewLists(seg[1] === 'want' ? 'want' : 'been'); break;
      case 'b': html = viewBuilding(seg[1]); break;
      case 'me': html = viewProfile(state.me); break;
      case 'u': html = viewProfile(seg[1]); break;
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
      state.me = id; save();
      go('#/feed'); toast('Welcome, @' + handle);
    },
    login(d) { state.me = d.id; save(); go('#/feed'); toast('Signed in as @' + me().handle); },
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
      if (i >= 0) { state.want.splice(i, 1); toast('Removed from Want to Visit'); }
      else { state.want.push({ userId: state.me, buildingId: d.id, createdAt: Date.now() }); toast('Saved to Want to Visit'); }
      save(); render();
    },
    unwant(d) { state.want = state.want.filter(w => !(w.userId === state.me && w.buildingId === d.id)); save(); render(); },
    follow(d) {
      const i = state.follows.findIndex(f => f[0] === state.me && f[1] === d.id);
      if (i >= 0) state.follows.splice(i, 1); else state.follows.push([state.me, d.id]);
      save();
      if (currentPath().startsWith('/find')) document.getElementById('results').innerHTML = findResults(); else render();
    },
    findtab(d) { findTab = d.k; render(); },
    sort(d) { listSort = d.k; render(); },
    btab(d) { bTab = d.k; render(); },
    mapfilter(d) { mapFilter = d.k; mapSel = null; render(); },
    legend() { document.getElementById('legend').classList.toggle('closed'); },
    locate() {
      requestLocation(ok => {
        if (!ok) toast('Location unavailable — using ' + loc.label);
        if (map) map.setView([loc.lat, loc.lng], 14);
      });
    },
    share(d) {
      const b = BY_ID[d.id], mv = myVisit(d.id);
      const text = mv ? `I gave ${b.name} ${mv.stars}★ on Throwing Shade` : `${b.name} by ${b.architect} — on Throwing Shade`;
      if (navigator.share) navigator.share({ title: b.name, text }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'), () => toast(text));
      else toast(text);
    },
    closelog() { draft = null; back(); },
    droppin() {
      setPinMode(!pinMode);
    },
    pinfrommap() { pendingPinMode = true; mapFilter = 'all'; go('#/map'); },
    pickosm(d) {
      const L0 = lookups[d.key], r = L0 && L0.results[+d.i];
      if (!r) return;
      const existing = BUILDINGS.find(b => b.osm === r.osm) ||
        (r.tags.wikidata && BUILDINGS.find(b => b.qid === r.tags.wikidata)) ||
        (r.name && BUILDINGS.find(b => km(b, r) < 0.08 && sameName(b.name, r.name)));
      if (existing) { toast(existing.name + ' is already on Throwing Shade'); go('#/log/' + existing.id); return; }
      const b = {
        id: 'osm-' + r.osm.replace('/', '-'), name: r.name || r.addr || (L0.address ? 'Building at ' + L0.address : 'Unnamed building'),
        architect: r.tags.architect || '', year: r.year, typology: r.typ, style: r.style,
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
      if (!name) return toast('Give the building a name');
      const L0 = lookups[pinKey(p.lat, p.lng)] || {};
      addPlace({
        id: 'pin-' + Date.now().toString(36), name, architect: document.getElementById('nb-arch').value.trim(),
        year: year > 0 && year <= new Date().getFullYear() + 5 ? year : '', typology: 'Building',
        style: nameStyle || styleFrom('', year > 0 ? year : ''), city: L0.city || '', country: L0.country || '',
        lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), address: L0.address || '',
        source: 'user', addedBy: state.me, createdAt: Date.now(),
      });
      nameStyle = null;
    },
    star(d) {
      draft.stars = +d.n;
      document.querySelectorAll('#star-input button').forEach((btn, i) => {
        const on = i < draft.stars;
        btn.classList.toggle('on', on);
        btn.innerHTML = on ? starSVG('#fff', '#fff') : starSVG('none', INK);
      });
      document.getElementById('star-caption').textContent = STAR_WORDS[draft.stars];
    },
    rmphoto() { draft.photo = null; render(); },
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
    post() {
      if (!draft || !draft.stars) return toast('Pick a star rating first');
      const b = BY_ID[draft.bid];
      const existing = myVisit(draft.bid);
      const snapshot = JSON.stringify(state);
      if (existing) Object.assign(existing, { stars: draft.stars, note: draft.note.trim(), visitedOn: draft.date, photo: draft.photo, createdAt: Date.now() });
      else state.visits.push({ id: 'v' + Date.now().toString(36), userId: state.me, buildingId: draft.bid, stars: draft.stars, note: draft.note.trim(), photo: draft.photo, visitedOn: draft.date, createdAt: Date.now() });
      state.want = state.want.filter(w => !(w.userId === state.me && w.buildingId === draft.bid));
      let msg = `Logged ${b.name} · ${draft.stars}★`;
      if (!save()) {
        // Storage full (photos are big): keep the log, drop the photo.
        state = JSON.parse(snapshot);
        const v = myVisit(draft.bid);
        if (v) Object.assign(v, { stars: draft.stars, note: draft.note.trim(), visitedOn: draft.date, photo: null, createdAt: Date.now() });
        else state.visits.push({ id: 'v' + Date.now().toString(36), userId: state.me, buildingId: draft.bid, stars: draft.stars, note: draft.note.trim(), photo: null, visitedOn: draft.date, createdAt: Date.now() });
        state.want = state.want.filter(w => !(w.userId === state.me && w.buildingId === draft.bid));
        save();
        msg = 'Saved without the photo — browser storage is full';
      }
      const bid = draft.bid;
      draft = null;
      bTab = 'critiques';
      trail.push('/b/' + bid);
      location.replace('#/b/' + bid);
      setTimeout(() => toast(msg), 30);
    },
  };

  const inputs = {
    find(el) { findQ = el.value; document.getElementById('results').innerHTML = findResults(); },
    logq(el) { document.getElementById('logresults').innerHTML = logResults(el.value); },
    note(el) { draft.note = el.value; document.getElementById('note-count').textContent = el.value.length + ' / 280'; },
    date(el) { draft.date = el.value || isoDate(Date.now()); },
  };

  root.addEventListener('click', e => {
    const t = e.target.closest('[data-act],[data-go]');
    if (!t || !root.contains(t)) return;
    if (t.dataset.act) { e.preventDefault(); e.stopPropagation(); actions[t.dataset.act](t.dataset, t, e); }
    else if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); }
  });
  root.addEventListener('input', e => { const f = e.target.dataset && e.target.dataset.input; if (f && inputs[f]) inputs[f](e.target); });
  root.addEventListener('change', e => {
    if (e.target.dataset && e.target.dataset.change === 'photo' && e.target.files[0]) {
      resizeImage(e.target.files[0], 900, url => {
        if (!url) return toast('Couldn’t read that image');
        if (draft) { draft.photo = url; render(); }
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
