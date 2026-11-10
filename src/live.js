/* ==========================================================================
   Finance Recruiting Coach: Live Room
   One screen hosts (a projector), everyone else joins by code on a phone or laptop.
   Questions come from the same seeded generators as the solo games, so the room only
   has to sync a seed, a question number, nicknames and answer taps.

   Where the room lives:
   - a Firebase Realtime Database, over its REST and streaming API (no SDK), or
   - this browser only ("local"), for trying it out in two tabs and for the tests.
   Everything read from the room is treated as untrusted: names are cleaned and escaped,
   numbers are checked, and nothing from it is ever run or inserted as HTML.
   ========================================================================== */
const Live = (() => {
  'use strict';
  const G = Games;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LETTERS = ['A', 'B', 'C', 'D'];
  const DB_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/i;
  const DEV_RE = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
  const cleanDb = s => { s = String(s || '').trim().replace(/\/+$/, ''); return DB_RE.test(s) || DEV_RE.test(s) ? s : ''; };
  const clone = o => JSON.parse(JSON.stringify(o == null ? null : o));
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* fine */ } } };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* fine */ } } };

  /* ---------- a JSON document addressed by path, the way the database sees it ---------- */
  function getAt(doc, keys) { let d = doc; for (const k of keys) { if (d == null || typeof d !== 'object') return null; d = d[k]; } return d == null ? null : d; }
  function setAt(doc, keys, val) {
    if (!keys.length) return val == null ? null : val;
    const out = doc && typeof doc === 'object' ? Object.assign({}, doc) : {};      // the database hands back 0,1,2 keys as an array
    const child = setAt(out[keys[0]], keys.slice(1), val);
    if (child == null) delete out[keys[0]]; else out[keys[0]] = child;
    return Object.keys(out).length ? out : null;
  }
  const splitPath = p => String(p).split('/').filter(Boolean);

  /* ---------- Firebase Realtime Database over REST ---------- */
  function fbStore(base) {
    const url = p => base + '/rooms/' + p + '.json';
    // on a refusal, pass along what the database said: a wrong region comes back with the right address in the message
    const ok = r => r.ok ? r.json() : r.json().catch(() => null).then(j => { const e = new Error('The room database said no (' + r.status + ')' + (j && typeof j.error === 'string' ? ': ' + j.error.slice(0, 220) : '.')); e.status = r.status; throw e; });
    function send(method, p, body) {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      return fetch(url(p), { method, body: payload }).then(ok).catch(err => {
        if (err && err.status) throw err;
        // a network that blocks PUT, PATCH or DELETE: the database also takes them as a POST with an override
        return fetch(url(p) + '?x-http-method-override=' + method, { method: 'POST', body: payload === undefined ? 'null' : payload }).then(ok);
      });
    }
    function watch(p, cb) {
      let cache = null, es = null, poll = 0, dead = false, live = false;
      const pollOnce = () => fetch(url(p)).then(ok).then(v => { if (!dead && !live) { cache = v; cb(cache); } }).catch(() => { /* try again next tick */ });
      const startPoll = () => { if (poll || dead) return; pollOnce(); poll = setInterval(pollOnce, 1500); };
      const onEvent = type => e => {
        if (dead) return;
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (!m || typeof m.path !== 'string') return;
        live = true; if (poll) { clearInterval(poll); poll = 0; }
        const keys = splitPath(m.path);
        if (type === 'put') cache = setAt(cache, keys, m.data);
        else if (m.data && typeof m.data === 'object') Object.keys(m.data).forEach(k => { cache = setAt(cache, keys.concat(splitPath(k)), m.data[k]); });
        cb(cache);
      };
      try {
        es = new EventSource(url(p));
        es.addEventListener('put', onEvent('put'));
        es.addEventListener('patch', onEvent('patch'));
        const drop = () => { live = false; if (es) es.close(); startPoll(); };
        es.addEventListener('cancel', drop);
        es.addEventListener('auth_revoked', drop);
        es.onerror = () => { if (es.readyState === 2) drop(); else { live = false; startPoll(); } };   // while it reconnects, keep up by polling
      } catch (e) { startPoll(); }
      setTimeout(() => { if (!live) startPoll(); }, 3500);
      return () => { dead = true; if (es) es.close(); clearInterval(poll); };
    }
    return { kind: 'db', read: p => fetch(url(p)).then(ok), write: (p, v) => send('PUT', p, v), merge: (p, o) => send('PATCH', p, o), remove: p => send('DELETE', p), watch };
  }

  /* ---------- this browser only: two tabs can play each other ---------- */
  function localStore() {
    const PRE = 'frc:live:room:', subs = [];
    const room = code => { try { return JSON.parse(localStorage.getItem(PRE + code) || 'null'); } catch (e) { return null; } };
    const notify = code => subs.slice().forEach(s => { if (s.code === code) s.cb(getAt(room(code), s.keys)); });
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel('frc-live') : null;
    if (bc) bc.onmessage = e => notify(String(e.data));
    addEventListener('storage', e => { if (e.key && e.key.indexOf(PRE) === 0) notify(e.key.slice(PRE.length)); });
    const commit = (code, doc) => { if (doc == null) localStorage.removeItem(PRE + code); else localStorage.setItem(PRE + code, JSON.stringify(doc)); notify(code); if (bc) bc.postMessage(code); };
    const at = p => { const k = splitPath(p); return { code: k[0], keys: k.slice(1) }; };
    const write = (p, v) => { const a = at(p); commit(a.code, setAt(room(a.code), a.keys, v)); return Promise.resolve(v); };
    return {
      kind: 'local',
      read: p => { const a = at(p); return Promise.resolve(getAt(room(a.code), a.keys)); },
      write,
      merge: (p, o) => { const a = at(p); let doc = room(a.code); Object.keys(o).forEach(k => { doc = setAt(doc, a.keys.concat(splitPath(k)), o[k]); }); commit(a.code, doc); return Promise.resolve(o); },
      remove: p => write(p, null),
      watch: (p, cb) => { const a = at(p), sub = { code: a.code, keys: a.keys, cb }; subs.push(sub); setTimeout(() => { if (subs.includes(sub)) cb(getAt(room(a.code), a.keys)); }, 0); return () => { const i = subs.indexOf(sub); if (i >= 0) subs.splice(i, 1); }; },
    };
  }

  /* ---------- which store, and the links that carry it ---------- */
  let root = null, store = null, mode = '', dbUrl = '', stop = null, tick = 0;
  const hashParams = () => { const m = {}; location.hash.replace(/^#/, '').split('&').forEach(kv => { const k = kv.indexOf('='); try { if (k > 0) m[kv.slice(0, k)] = decodeURIComponent(kv.slice(k + 1)); else if (kv) m[kv] = ''; } catch (e) { /* skip */ } }); return m; };
  function pickStore(p) {
    const baked = cleanDb(typeof FRC_LIVE_DB === 'string' ? FRC_LIVE_DB : '');
    if (p.local !== undefined) { mode = 'local'; dbUrl = ''; store = localStore(); return; }
    dbUrl = cleanDb(p.db) || baked || cleanDb(ls.get('frc:live:db'));      // a link can name its own room database
    if (dbUrl) { mode = dbUrl === baked ? 'baked' : 'custom'; store = fbStore(dbUrl); } else { mode = ''; store = null; }
  }
  const pageURL = () => location.href.replace(/[#?].*$/, '');
  const joinURL = code => pageURL() + '#join=' + code + (mode === 'local' ? '&local' : mode === 'custom' ? '&db=' + encodeURIComponent(dbUrl) : '');
  const fail = msg => { const el = $('#live-err', root); if (el) { el.textContent = msg; el.hidden = false; } };
  function reset() { if (stop) stop(); stop = null; clearInterval(tick); tick = 0; }

  /* =========================== the front door =========================== */
  function door(note) {
    reset();
    root.innerHTML =
      '<header class="live-head"><h1 class="h-page">Live Room</h1><p class="lede">One screen shows the questions. Everyone else answers on their own phone or laptop, and the leaderboard updates after every question.</p></header>' +
      (note ? '<p class="live-note">' + esc(note) + '</p>' : '') +
      '<div class="live-door"><form class="door-card" id="join-form"><h2>Join a room</h2><p>Type the four-letter code from the screen.</p>' +
      '<div class="field"><label for="j-code">Room code</label><input class="in code-in" id="j-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD"></div>' +
      '<div class="field"><label for="j-name">Your name</label><input class="in" id="j-name" maxlength="16" autocomplete="nickname" placeholder="First name" value="' + esc(G.cleanName(ls.get('frc:live:name') || '')) + '"></div>' +
      '<p class="note bad" id="live-err" hidden></p><div class="btn-row"><button class="btn primary big" type="submit">Join</button></div></form>' +
      '<div class="door-card"><h2>Host a room</h2><p>Open this on the screen everyone can see. You pick the questions, the room gets a code, and you run the pace.</p><div class="btn-row"><a class="btn big" href="#host">Host a room</a></div></div></div>';
    $('#join-form', root).addEventListener('submit', e => {
      e.preventDefault();
      const code = ($('#j-code', root).value || '').toUpperCase().replace(/[^A-Z]/g, ''), name = G.cleanName($('#j-name', root).value);
      if (code.length !== 4) return fail('The code is four letters.');
      if (!name) return fail('Add a name so the leaderboard can show you.');
      const p = hashParams();
      location.hash = 'join=' + code + (p.local !== undefined ? '&local' : p.db ? '&db=' + encodeURIComponent(p.db) : '') + '&name=' + encodeURIComponent(name);
    });
  }

  /* =========================== host =========================== */
  const H = { code: '', room: null, key: '', frozen: {}, revealing: -1 };
  function hostSetup(msg) {
    reset();
    const need = !store;
    root.innerHTML =
      '<header class="live-head"><h1 class="h-page">Host a Live Room</h1><p class="lede">Put this window on the projector. Players join from their own phones with a code and a QR.</p></header>' +
      (need ? '<div class="live-setup-db"><h2>Connect the room database first</h2><p>Live rooms need somewhere for the phones and this screen to meet. Paste the address of your Firebase Realtime Database, or try a room on this device only.</p>' +
        '<div class="field"><label for="db-in">Database address</label><input class="in" id="db-in" inputmode="url" placeholder="https://your-project-default-rtdb.firebaseio.com"></div>' +
        '<div class="btn-row"><button class="btn primary" type="button" id="db-save">Connect</button><a class="btn" href="#host&local">Try it on this device</a></div></div>' : '') +
      '<form class="host-form" id="host-form"' + (need ? ' hidden' : '') + '>' +
      (mode === 'local' ? '<p class="live-note">This room only works in this browser. Open the join link in a second tab to try it.</p>' : '') +
      '<fieldset class="fs"><legend>Questions</legend><div class="togs" role="radiogroup" aria-label="Question mix">' + Object.keys(G.LIVE_MIXES).map((k, i) => '<label class="radio-pill"><input type="radio" name="mix" value="' + k + '"' + (i ? '' : ' checked') + '><span>' + G.LIVE_MIXES[k] + '</span></label>').join('') + '</div></fieldset>' +
      '<fieldset class="fs"><legend>How many</legend><div class="togs">' + [6, 10, 14].map(n => '<label class="radio-pill"><input type="radio" name="n" value="' + n + '"' + (n === 10 ? ' checked' : '') + '><span>' + n + ' questions</span></label>').join('') + '</div></fieldset>' +
      '<fieldset class="fs"><legend>Time for each</legend><div class="togs">' + [15, 20, 30].map(n => '<label class="radio-pill"><input type="radio" name="secs" value="' + n + '"' + (n === 20 ? ' checked' : '') + '><span>' + n + ' seconds</span></label>').join('') + '</div></fieldset>' +
      '<p class="note bad" id="live-err"' + (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</p>' +
      '<div class="btn-row"><button class="btn primary big" type="submit">Open the room</button><a class="btn ghost" href="#">Back</a></div></form>';
    const save = $('#db-save', root);
    if (save) save.addEventListener('click', () => {
      const v = cleanDb($('#db-in', root).value);
      if (!v) { toast('That doesn\'t look like a Firebase database address.'); return; }
      ls.set('frc:live:db', v); pickStore(hashParams()); hostSetup();
    });
    $('#host-form', root).addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target), cfg = { mix: G.LIVE_MIXES[f.get('mix')] ? f.get('mix') : 'mixed', n: +f.get('n') || 10, secs: +f.get('secs') || 20 };
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Opening…';
      hostCreate(cfg, 0).then(hostAttach).catch(err => { btn.disabled = false; btn.textContent = 'Open the room'; fail(err && err.status ? err.message + (err.status === 401 || err.status === 403 ? ' The database rules probably are not published yet.' : '') : 'Could not reach the room database. Check the connection and the address.'); });
    });
  }
  function hostCreate(cfg, tries) {
    const code = G.roomCode();
    return store.read(code + '/pub').then(old => {
      if (old && Date.now() - (+old.t || 0) < 6 * 3600e3 && tries < 5) return hostCreate(cfg, tries + 1);      // someone else's live room
      return store.write(code, { pub: { v: 1, t: Date.now(), stage: 'lobby', seed: G.newSeed(), mix: cfg.mix, n: cfg.n, secs: cfg.secs, i: -1 } }).then(() => code);
    });
  }
  function hostAttach(code) {
    reset();
    H.code = code; H.room = null; H.key = ''; H.frozen = {}; H.revealing = -1;
    ss.set('frc:live:host', JSON.stringify({ code, mode, db: dbUrl }));
    root.innerHTML = '<div class="host" id="host"></div>';
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => { /* optional */ }); } catch (e) { /* optional */ }
    stop = store.watch(code, room => { H.room = room; hostPaint(); });
    tick = setInterval(hostTick, 200);
  }
  const players = () => { const p = (H.room && H.room.players) || {}, out = {}; Object.keys(p).slice(0, 200).forEach(id => { if (p[id] && typeof p[id] === 'object') out[id] = p[id]; }); return out; };
  const answersFor = i => { const a = H.room && H.room.ans && H.room.ans[i]; return a && typeof a === 'object' ? a : {}; };
  function hostPaint() {
    const el = $('#host', root); if (!el) return;
    const room = H.room, pub = room && room.pub;
    if (!pub) { el.innerHTML = '<div class="empty"><h2>This room has closed</h2><div class="btn-row"><a class="btn primary" href="#host">Open a new one</a></div></div>'; return; }
    const ps = players(), ids = Object.keys(ps);
    const key = pub.stage + ':' + pub.i + ':' + (pub.stage === 'lobby' ? ids.join(',') : '');
    if (key === H.key) { hostTick(); return; }
    H.key = key;
    const n = +pub.n || 10, secs = +pub.secs || 20, i = +pub.i;
    if (pub.stage === 'lobby') {
      const url = joinURL(H.code);
      el.innerHTML = '<div class="lobby"><div class="lobby-join"><p class="lobby-how">Join at <b>' + esc(pageURL().replace(/^https?:\/\//, '')) + '</b> with code</p><p class="room-code" aria-label="Room code ' + H.code.split('').join(' ') + '">' + H.code + '</p>' +
        '<p class="note"><button class="linkbtn" type="button" data-h="copy">Copy the join link</button></p></div><div class="lobby-qr">' + QR.svg(url, { margin: 2 }) + '<p class="note">or scan this</p></div></div>' +
        '<div class="lobby-players"><h2>' + ids.length + ' in the room</h2>' + (ids.length ? '<ul class="chips">' + ids.map(id => '<li><button type="button" class="pchip" data-h="kick" data-id="' + esc(id) + '" title="Remove from the room">' + esc(G.cleanName(ps[id].n) || 'Player') + '<span aria-hidden="true"> ×</span></button></li>').join('') + '</ul>' : '<p class="note">Names show up here as people join. Tap a name to remove it.</p>') + '</div>' +
        '<div class="btn-row host-actions"><button class="btn primary big" type="button" data-h="start"' + (ids.length ? '' : ' disabled') + '>Start with ' + ids.length + ' player' + (ids.length === 1 ? '' : 's') + '</button><span class="note">' + n + ' questions, ' + secs + ' seconds each: ' + esc(G.LIVE_MIXES[pub.mix] || '').toLowerCase() + '.</span><button class="btn ghost" type="button" data-h="end">Close the room</button></div>';
      return;
    }
    if (pub.stage === 'q' || pub.stage === 'reveal') {
      const q = G.liveQuestion(pub.seed, pub.mix, i), rev = pub.stage === 'reveal';
      const a = rev ? (H.frozen[i] || answersFor(i)) : {}, counts = [0, 0, 0, 0];
      Object.keys(a).forEach(id => { const c = a[id] && a[id].c; if (c >= 0 && c < 4) counts[c]++; });
      const board = Array.isArray(pub.board) ? pub.board.slice(0, 5) : [];
      el.innerHTML = '<div class="q-top"><span class="q-n">Question ' + (i + 1) + ' of ' + n + '</span><span class="q-tag">' + esc(q.tag) + '</span><span class="q-in" id="h-in"></span><span class="q-clock" id="h-clock"></span></div>' +
        '<div class="ws-time q-bar" aria-hidden="true"><i id="h-bar"></i></div>' +
        '<p class="q-text">' + esc(q.text) + '</p>' +
        '<ol class="q-choices' + (rev ? ' revealed' : '') + '">' + q.choices.map((c, k) => '<li class="' + (rev && k === q.correct ? 'right' : '') + '"><span class="q-letter">' + LETTERS[k] + '</span><span class="q-choice">' + esc(c) + '</span>' + (rev ? '<span class="q-count">' + counts[k] + '</span>' : '') + '</li>').join('') + '</ol>' +
        (rev ? '<p class="q-why">' + esc(q.why) + '</p><div class="board"><h2>Leaderboard</h2>' + boardHTML(board, 5) + '</div><div class="btn-row host-actions"><button class="btn primary big" type="button" data-h="next">' + (i + 1 < n ? 'Next question' : 'Final results') + '</button><button class="btn ghost" type="button" data-h="end">Close the room</button></div>'
          : '<div class="btn-row host-actions"><button class="btn" type="button" data-h="reveal">Show the answer now</button><button class="btn ghost" type="button" data-h="end">Close the room</button></div>');
      hostTick();
      return;
    }
    if (pub.stage === 'final') {
      const board = Array.isArray(pub.board) ? pub.board : [];
      const pod = board.slice(0, 3);
      el.innerHTML = '<div class="final"><h2 class="final-h">Final results</h2><ol class="podium">' + pod.map((r, k) => '<li class="p' + (k + 1) + '"><span class="pod-place">' + ['1st', '2nd', '3rd'][k] + '</span><span class="pod-name">' + esc(G.cleanName(r.n) || 'Player') + '</span><span class="pod-score">' + G.fmtNum(+r.s || 0) + '</span></li>').join('') + '</ol>' +
        (board.length > 3 ? '<div class="board">' + boardHTML(board.slice(0, 30), 30, 3) + '</div>' : '') +
        '<div class="btn-row host-actions"><button class="btn primary big" type="button" data-h="again">Play again, same room</button><button class="btn" type="button" data-h="end">Close the room</button></div>' +
        '<p class="note">Everyone can keep practicing on their own at <b>' + esc(pageURL().replace(/^https?:\/\//, '').replace(/live\.html$/, 'play.html')) + '</b></p></div>';
    }
  }
  function boardHTML(rows, max, skip) {
    const list = rows.slice(skip || 0, max);
    if (!list.length) return '<p class="note">No answers yet.</p>';
    return '<table class="ws-grid board-tbl"><tbody>' + list.map((r, k) => '<tr><td class="rn">' + (k + 1 + (skip || 0)) + '</td><td>' + esc(G.cleanName(r.n) || 'Player') + '</td><td class="num"><b>' + G.fmtNum(+r.s || 0) + '</b></td></tr>').join('') + '</tbody></table>';
  }
  function hostTick() {
    const pub = H.room && H.room.pub; if (!pub || pub.stage !== 'q') return;
    const secs = +pub.secs || 20, left = (+pub.at || 0) + secs * 1000 - Date.now();
    const ids = Object.keys(players()), a = answersFor(pub.i), got = ids.filter(id => a[id]).length;
    const c = $('#h-clock', root), b = $('#h-bar', root), n = $('#h-in', root);
    if (c) c.textContent = Math.max(0, Math.ceil(left / 1000));
    if (b) b.style.width = Math.max(0, Math.min(100, 100 - left / (secs * 10))).toFixed(1) + '%';
    if (n) n.textContent = got + ' of ' + ids.length + ' answered';
    if (left <= -1200 || (ids.length && got >= ids.length)) hostReveal();
  }
  function hostReveal() {
    const pub = H.room && H.room.pub; if (!pub || pub.stage !== 'q' || H.revealing === pub.i) return;
    const i = +pub.i; H.revealing = i;
    H.frozen[i] = clone(answersFor(i)) || {};
    const all = {}; for (let k = 0; k <= i; k++) all[k] = H.frozen[k] || answersFor(k);
    const board = G.liveBoard(players(), all, pub.seed, pub.mix, i, +pub.secs || 20).slice(0, 200).map(r => ({ id: r.id, n: r.n, s: r.s }));
    store.merge(H.code + '/pub', { stage: 'reveal', board }).catch(() => { H.revealing = -1; });
  }
  function hostClick(e) {
    const b = e.target.closest('[data-h]'); if (!b || !H.code) return;
    const pub = (H.room && H.room.pub) || {}, act = b.dataset.h, P = H.code + '/pub';
    if (act === 'start') store.merge(P, { stage: 'q', i: 0, at: Date.now(), board: null });
    else if (act === 'reveal') hostReveal();
    else if (act === 'next') { if (+pub.i + 1 < (+pub.n || 10)) store.merge(P, { stage: 'q', i: +pub.i + 1, at: Date.now() }); else store.merge(P, { stage: 'final' }); }
    else if (act === 'again') { H.frozen = {}; H.revealing = -1; store.write(H.code + '/ans', null).then(() => store.merge(P, { stage: 'lobby', seed: G.newSeed(), i: -1, board: null })); }
    else if (act === 'kick') { const id = b.dataset.id, patch = {}; patch['kicked/' + id] = true; store.write(H.code + '/players/' + id, null).then(() => store.merge(P, patch)); }
    else if (act === 'copy') copy(joinURL(H.code), 'Join link copied.');
    else if (act === 'end') { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to close it'; return; } const code = H.code; reset(); H.code = ''; ss.set('frc:live:host', null); store.remove(code).catch(() => { /* already gone */ }); location.hash = 'host' + (mode === 'local' ? '&local' : ''); hostSetup(); }
  }

  /* =========================== player =========================== */
  const P = { code: '', pid: '', name: '', pub: null, shown: -2, t0: 0, sent: {}, key: '', seed: '' };
  function playerJoin(code, name) {
    reset();
    P.code = code; P.name = name; P.pub = null; P.shown = -2; P.sent = {}; P.key = '';
    P.pid = ss.get('frc:live:pid:' + code) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    ss.set('frc:live:pid:' + code, P.pid); ls.set('frc:live:name', name);
    root.innerHTML = '<div class="player" id="player"><p class="thinking"><i class="pulse"></i>Joining room ' + esc(code) + '…</p></div>';
    store.read(code + '/pub').then(pub => {
      if (!pub || typeof pub !== 'object') { door('No room has the code ' + code + '. Check the screen and try again.'); history.replaceState(null, '', location.pathname); return; }
      return store.write(code + '/players/' + P.pid, { n: name, t: Date.now() }).then(() => {
        stop = store.watch(code + '/pub', p => { P.pub = p; playerPaint(); });
        tick = setInterval(playerTick, 200);
      });
    }).catch(() => door('Could not reach the room. Check your connection and try again.'));
  }
  function playerPaint() {
    const el = $('#player', root); if (!el) return;
    const pub = P.pub;
    if (!pub) { el.innerHTML = '<div class="p-msg"><h2>The room has closed</h2><p>Thanks for playing.</p><div class="btn-row"><a class="btn primary" href="play.html">Keep playing on your own</a></div></div>'; return; }
    if (pub.kicked && pub.kicked[P.pid]) { reset(); el.innerHTML = '<div class="p-msg"><h2>The host removed you from this room</h2><div class="btn-row"><a class="btn" href="#">Back</a></div></div>'; return; }
    if (pub.seed !== P.seed) { P.seed = pub.seed; P.sent = {}; P.shown = -2; }      // a new game in the same room
    const i = +pub.i, n = +pub.n || 10, secs = +pub.secs || 20;
    const board = Array.isArray(pub.board) ? pub.board : [], rank = board.findIndex(r => r && r.id === P.pid), me = rank >= 0 ? board[rank] : null;
    const key = pub.stage + ':' + i + ':' + (P.sent[i] ? 's' : '') + ':' + (pub.stage === 'q' && P.shown === i && Date.now() - P.t0 > secs * 1000 ? 'late' : '');
    if (key === P.key) return;
    P.key = key;
    if (pub.stage === 'lobby') { el.innerHTML = '<div class="p-msg"><h2>You\'re in, ' + esc(P.name) + '.</h2><p>The questions show up on the big screen and the answers show up here. Keep this page open.</p></div>'; return; }
    if (pub.stage === 'q') {
      if (P.shown !== i) { P.shown = i; P.t0 = Date.now(); }
      const q = G.liveQuestion(pub.seed, pub.mix, i), mine = P.sent[i], late = !mine && Date.now() - P.t0 > secs * 1000;
      el.innerHTML = '<div class="p-top"><span>Question ' + (i + 1) + ' of ' + n + '</span><span id="p-clock"></span></div><div class="ws-time" aria-hidden="true"><i id="p-bar"></i></div>' +
        '<p class="p-q">' + esc(q.text) + '</p>' +
        '<div class="p-choices">' + q.choices.map((c, k) => '<button type="button" class="p-choice' + (mine && mine.c === k ? ' picked' : '') + '" data-c="' + k + '"' + (mine || late ? ' disabled' : '') + '><span class="q-letter">' + LETTERS[k] + '</span><span>' + esc(c) + '</span></button>').join('') + '</div>' +
        '<p class="p-status" aria-live="polite">' + (mine ? 'Locked in. Watch the screen.' : late ? 'Time ran out on that one.' : '') + '</p>';
      playerTick();
      return;
    }
    if (pub.stage === 'reveal') {
      const q = G.liveQuestion(pub.seed, pub.mix, i), mine = P.sent[i], right = !!mine && mine.c === q.correct;
      const pts = mine ? G.livePoints(right, mine.ms, secs * 1000) : 0;
      el.innerHTML = '<div class="p-msg ' + (right ? 'p-right' : 'p-wrong') + '"><p class="p-verdict">' + (right ? 'Right' : mine ? 'Not this time' : 'No answer') + '</p><p class="p-pts">+' + G.fmtNum(pts) + '</p>' +
        '<p>The answer was <b>' + LETTERS[q.correct] + ': ' + esc(q.choices[q.correct]) + '</b>.</p>' +
        (me ? '<p class="p-rank">You\'re ' + ordinal(rank + 1) + ' of ' + board.length + ' with ' + G.fmtNum(+me.s || 0) + '.</p>' : '') + '</div>';
      return;
    }
    if (pub.stage === 'final') {
      el.innerHTML = '<div class="p-msg"><p class="p-verdict">' + (me ? 'You finished ' + ordinal(rank + 1) + ' of ' + board.length : 'That\'s the game') + '</p>' + (me ? '<p class="p-pts">' + G.fmtNum(+me.s || 0) + '</p>' : '') +
        '<p>The same questions are on the site whenever you want them, with a 60-second sprint and a plan built around your own interview dates.</p><div class="btn-row"><a class="btn primary" href="play.html">Play on your own</a><a class="btn" href="app.html">Build my plan</a></div></div>';
    }
  }
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  function playerTick() {
    const pub = P.pub; if (!pub || pub.stage !== 'q' || P.shown !== +pub.i) return;
    const secs = +pub.secs || 20, left = P.t0 + secs * 1000 - Date.now();
    const c = $('#p-clock', root), b = $('#p-bar', root);
    if (c) c.textContent = Math.max(0, Math.ceil(left / 1000)) + 's';
    if (b) b.style.width = Math.max(0, Math.min(100, 100 - left / (secs * 10))).toFixed(1) + '%';
    if (left <= 0 && !P.sent[pub.i]) playerPaint();
  }
  function playerClick(e) {
    const b = e.target.closest('.p-choice'); if (!b || b.disabled) return;
    const pub = P.pub; if (!pub || pub.stage !== 'q') return;
    const i = +pub.i, secs = +pub.secs || 20, ms = Math.max(0, Math.min(secs * 1000, Date.now() - P.t0)), c = +b.dataset.c;
    if (P.sent[i] || !(c >= 0 && c < 4)) return;
    P.sent[i] = { c, ms };
    playerPaint();
    store.write(P.code + '/ans/' + i + '/' + P.pid, { c, ms }).catch(() => { toast('That tap didn\'t send. Check your connection.'); });
  }

  /* ---------- shared bits ---------- */
  let toastT = 0;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function copy(text, ok) {
    let p;
    try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('none')); } catch (e) { p = Promise.reject(e); }
    p.then(() => toast(ok)).catch(() => { window.prompt('Copy this link:', text); });
  }
  function route() {
    const p = hashParams();
    pickStore(p);
    document.body.classList.toggle('is-host', p.host !== undefined);
    if (p.host !== undefined) {
      let saved = null; try { saved = JSON.parse(ss.get('frc:live:host') || 'null'); } catch (e) { saved = null; }
      if (saved && saved.code && store && saved.mode === mode && (saved.db || '') === dbUrl) { hostAttach(saved.code); return; }
      hostSetup();
    } else if (p.join) {
      const code = String(p.join).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4), name = G.cleanName(p.name || '');
      if (!store) { door('Live rooms aren\'t connected on this site yet.'); return; }
      if (code.length === 4 && name) { history.replaceState(null, '', location.pathname + '#join=' + code + (mode === 'local' ? '&local' : mode === 'custom' ? '&db=' + encodeURIComponent(dbUrl) : '') + '&name=' + encodeURIComponent(name)); playerJoin(code, name); }
      else { door(); if (code) $('#j-code', root).value = code; const f = $(code ? '#j-name' : '#j-code', root); if (f) f.focus(); }
    } else door();
  }
  function mount(el) {
    root = el;
    root.addEventListener('click', e => { hostClick(e); playerClick(e); });
    addEventListener('hashchange', route);
    route();
  }
  return { mount, getAt, setAt, cleanDb };
})();
