/* ==========================================================================
   Finance Recruiting Coach: Play
   The Mental Math Sprint and Statement Flows, drawn as worksheets you fill in.
   Runs on play.html and, in a 30-second form, in the home page hero. No plan or
   sign-up needed. Scores stay in this browser (localStorage key frc:play:v1).
   ========================================================================== */
const Play = (() => {
  'use strict';
  const G = Games;
  const KEY = 'frc:play:v1', APP_KEY = 'frc:v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const playURL = () => new URL('play.html', location.href.replace(/[#?].*$/, '')).href;

  /* ---------- what's saved ---------- */
  let store = load();
  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.v === 1 && Array.isArray(d.runs)) return d; } catch (e) { /* unreadable or blocked: start fresh */ }
    return { v: 1, name: '', runs: [] };
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private window: scores last for this visit only */ } }
  function appState() { try { const d = JSON.parse(localStorage.getItem(APP_KEY) || 'null'); return d && d.v === 1 ? d : null; } catch (e) { return null; } }
  function record(run) {
    store.runs.push(Object.assign({ date: todayISO(), at: Date.now() }, run));
    if (store.runs.length > 300) store.runs = store.runs.slice(-300);
    persist();
  }
  const runsOf = g => store.runs.filter(r => r.g === g);
  const bestOf = g => { const r = runsOf(g); return r.length ? Math.max.apply(null, r.map(x => x.score)) : null; };
  function defaultName() {
    if (store.name) return store.name;
    const a = appState();
    return a && a.profile && a.profile.name ? G.cleanName(String(a.profile.name).split(' ')[0]) : '';
  }

  /* ---------- small UI helpers ---------- */
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
  function shareChallenge(c) {
    const url = playURL() + G.challengeHash(c);
    if (navigator.share) navigator.share({ text: G.shareText(c, '').replace(/:\s*$/, '.'), url }).catch(() => { /* closed the share sheet */ });
    else copy(G.shareText(c, url), 'Challenge copied. Paste it into a text or group chat.');
  }

  /* =========================== Mental Math Sprint ===========================
     A worksheet: column A is the question, B is your answer, C is the check.
     The clock starts on the first keystroke, so reading the first question is free. */
  function startSprint(root, opts) {
    const secs = opts.secs || 60, keep = opts.compact ? 2 : 4;
    const qs = G.sprintRound(opts.seed, 90);
    let i = 0, right = 0, t0 = 0, tick = 0, over = false;
    const log = [];
    root.innerHTML =
      '<div class="ws" data-game="sprint">' +
      '<div class="ws-bar"><span class="ws-ref" id="sp-ref">B2</span><span class="ws-fx" aria-hidden="true">fx</span><span class="ws-formula">=SPRINT(' + secs + ')</span>' +
      '<span class="ws-meter"><b id="sp-score">0</b> right</span><span class="ws-clock" id="sp-clock" aria-label="Time left">' + mmss(secs) + '</span></div>' +
      '<div class="ws-time" aria-hidden="true"><i id="sp-bar"></i></div>' +
      '<table class="ws-grid sp-grid"><thead><tr><th class="rn"></th><th>A</th><th>B</th><th>C</th></tr></thead>' +
      '<tbody id="sp-log"><tr class="hdr"><td class="rn">1</td><td>Question</td><td>Your answer</td><td>Check</td></tr></tbody>' +
      '<tbody><tr class="active"><td class="rn" id="sp-rn">2</td><td class="q" id="sp-q" aria-live="polite"></td>' +
      '<td class="in-cell"><form id="sp-form" autocomplete="off"><input class="cell-in" id="sp-in" inputmode="decimal" enterkeyhint="go" autocapitalize="off" spellcheck="false" aria-label="Your answer"><span class="unit" id="sp-unit"></span></form></td>' +
      '<td><button class="btn small" type="submit" form="sp-form" id="sp-go">Enter</button></td></tr></tbody></table>' +
      '<p class="ws-note" id="sp-note">The clock starts when you type. Enter locks in an answer, and an empty Enter skips.</p></div>';
    const input = $('#sp-in', root), qEl = $('#sp-q', root);
    const show = () => {
      const q = qs[i];
      qEl.textContent = q.prompt;
      $('#sp-unit', root).textContent = G.UNIT_HINT[q.unit] || '';
      $('#sp-rn', root).textContent = i + 2;
      $('#sp-ref', root).textContent = 'B' + (i + 2);
    };
    const paintClock = () => {
      const left = Math.max(0, secs - (Date.now() - t0) / 1000);
      $('#sp-clock', root).textContent = mmss(Math.ceil(left));
      $('#sp-bar', root).style.width = (100 - left / secs * 100).toFixed(1) + '%';
      if (left <= 0) finish();
    };
    const begin = () => { if (t0 || over) return; t0 = Date.now(); tick = setInterval(paintClock, 100); root.classList.add('running'); };
    function finish() {
      if (over) return;
      over = true; clearInterval(tick);
      input.disabled = true; $('#sp-go', root).disabled = true; input.blur();
      $('#sp-clock', root).textContent = '0:00'; $('#sp-bar', root).style.width = '100%';
      $('#sp-note', root).textContent = 'Time. ' + right + ' right out of ' + log.length + ' answered.';
      opts.onDone({ g: 'sprint', seed: opts.seed, score: right, tried: log.length, secs, log });
    }
    $('#sp-form', root).addEventListener('submit', e => {
      e.preventDefault();
      if (over) return;
      begin();
      const q = qs[i], typed = input.value.trim(), ok = G.checkTyped(q, typed);
      if (ok) right++;
      log.push({ kind: q.kind, ok });
      const tr = document.createElement('tr');
      tr.className = ok ? 'ok' : 'miss';
      tr.innerHTML = '<td class="rn">' + (i + 2) + '</td><td>' + esc(q.prompt) + '</td><td class="num typed">' + (typed ? esc(typed) : '<span class="skip">skipped</span>') + '</td>' +
        '<td class="num chk">' + (ok ? '<span aria-label="right">✓</span>' : esc(G.fmtAnswer(q.answer, q.unit))) + '</td>';
      const lg = $('#sp-log', root);
      lg.appendChild(tr);
      while (lg.children.length > keep + 1) lg.removeChild(lg.children[1]);
      $('#sp-score', root).textContent = right;
      i++; input.value = '';
      if (i >= qs.length) { finish(); return; }
      show(); input.focus();
    });
    input.addEventListener('input', begin);
    show();
    if (opts.focus) input.focus();
    return { stop() { over = true; clearInterval(tick); } };
  }

  /* =========================== Statement Flows ===========================
     One event, nine lines across the three statements. Mark each line up, down or
     unchanged, check it, and read the walk-through. Five events a round. */
  const PICK = [[1, '▲', 'Up'], [0, '–', 'No change'], [-1, '▼', 'Down']];
  function startFlows(root, opts) {
    const round = G.flowsRound(opts.seed, opts.n || 5);
    let idx = 0, picks = {}, total = 0, checked = false, t0 = 0, tick = 0, done = false;
    const per = [];
    const clock = () => { const el = $('#fl-clock', root); if (el && t0) el.textContent = mmss((Date.now() - t0) / 1000); };
    function stmtTable(scen, stmt, startRow) {
      const rows = scen.rows.filter(r => r.stmt === stmt);
      return '<table class="ws-grid fl-tbl"><thead><tr><th class="rn"></th><th>' + G.STMT_NAME[stmt] + '</th><th class="chg">Change</th></tr></thead><tbody>' +
        rows.map((r, j) => {
          let cell;
          if (!checked) {
            cell = '<span class="seg3" role="group" aria-label="' + esc(r.label) + '">' + PICK.map(p => '<button type="button" data-k="' + r.k + '" data-pick="' + p[0] + '" aria-pressed="' + (picks[r.k] === p[0]) + '" aria-label="' + p[2] + '" title="' + p[2] + '">' + p[1] + '</button>').join('') + '</span>';
          } else {
            const ok = picks[r.k] === r.dir;
            cell = '<span class="fl-ans ' + (r.dir > 0 ? 'up' : r.dir < 0 ? 'down' : 'flat') + '">' + G.acct(r.delta) + '</span><span class="fl-mark ' + (ok ? 'ok' : 'miss') + '">' + (ok ? '✓' : '✗') + '</span>';
          }
          return '<tr data-row="' + r.k + '"' + (checked ? ' class="' + (picks[r.k] === r.dir ? 'ok' : 'miss') + '"' : '') + '><td class="rn">' + (startRow + j) + '</td><td>' + esc(r.label) + '</td><td class="chg">' + cell + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    function paint() {
      const s = round[idx];
      const got = checked ? G.flowScore(s, picks) : 0;
      const filled = s.rows.filter(r => picks[r.k] !== undefined).length;
      root.innerHTML =
        '<div class="ws" data-game="flows">' +
        '<div class="ws-bar"><span class="ws-ref">' + (idx + 1) + ' of ' + round.length + '</span><span class="ws-fx" aria-hidden="true">fx</span><span class="ws-formula">=FLOW(event)</span>' +
        '<span class="ws-meter"><b>' + (total + got) + '</b> of ' + ((idx + (checked ? 1 : 0)) * 9) + ' lines</span><span class="ws-clock" id="fl-clock">' + mmss(t0 ? (Date.now() - t0) / 1000 : 0) + '</span></div>' +
        '<div class="fl-event"><p class="fl-text">' + esc(s.text) + '</p><p class="fl-assume">Tax rate ' + s.taxPct + '%. One period, and taxes are paid in cash this period.</p></div>' +
        '<div class="fl-stmts">' + stmtTable(s, 'is', 1) + stmtTable(s, 'cf', 3) + stmtTable(s, 'bs', 6) + '</div>' +
        (checked
          ? '<div class="fl-why" aria-live="polite"><p class="fl-got"><b>' + got + ' of 9 lines.</b>' + (s.trap ? ' ' + esc(s.trap) : '') + '</p>' +
            '<dl><dt>Income statement</dt><dd>' + esc(s.why.is) + '</dd><dt>Cash flow statement</dt><dd>' + esc(s.why.cf) + '</dd><dt>Balance sheet</dt><dd>' + esc(s.why.bs) + '</dd></dl></div>' +
            '<div class="btn-row"><button class="btn primary" type="button" data-fl="next">' + (idx + 1 < round.length ? 'Next event' : 'See my result') + '</button></div>'
          : '<div class="btn-row"><button class="btn primary" type="button" data-fl="check">Check ' + (filled < 9 ? '(' + filled + ' of 9 marked)' : 'my answers') + '</button><button class="btn" type="button" data-fl="rest">The rest don\'t change</button></div>') +
        '</div>';
    }
    root.addEventListener('click', e => {
      if (done) return;
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.dataset.pick !== undefined && !checked) {
        if (!t0) { t0 = Date.now(); tick = setInterval(clock, 500); }
        picks[b.dataset.k] = +b.dataset.pick;
        $$('button[data-k="' + b.dataset.k + '"]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        const filled = round[idx].rows.filter(r => picks[r.k] !== undefined).length;
        const c = $('[data-fl="check"]', root); if (c) c.textContent = 'Check ' + (filled < 9 ? '(' + filled + ' of 9 marked)' : 'my answers');
      } else if (b.dataset.fl === 'rest') {
        round[idx].rows.forEach(r => { if (picks[r.k] === undefined) picks[r.k] = 0; });
        paint();
      } else if (b.dataset.fl === 'check') {
        if (!t0) { t0 = Date.now(); tick = setInterval(clock, 500); }
        checked = true; paint();
        const w = $('.fl-why', root); if (w && w.scrollIntoView) w.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (b.dataset.fl === 'next') {
        const got = G.flowScore(round[idx], picks);
        total += got; per.push({ id: round[idx].id, got });
        if (idx + 1 < round.length) { idx++; picks = {}; checked = false; paint(); root.scrollIntoView && root.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
        done = true; clearInterval(tick);
        opts.onDone({ g: 'flows', seed: opts.seed, score: total, total: round.length * 9, ms: Date.now() - t0, per });
      }
    });
    paint();
    return { stop() { done = true; clearInterval(tick); } };
  }

  /* =========================== the Play page =========================== */
  let root = null, game = null, challenge = null;
  function progress() {
    const app = appState();
    const st = G.streak(G.activeDays(app, store), todayISO());
    const p = app && app.profile;
    const rd = G.readiness({ answers: (app && app.answers) || [], play: store, seats: (p && p.seats) || [], today: todayISO(),
      plan: p && p.startDate && p.readyDate ? { start: p.startDate, ready: p.readyDate, events: p.events || [] } : null });
    return { st, rd, hasPlan: !!p };
  }
  function lobby() {
    if (game) { game.stop(); game = null; }
    const pr = progress(), bs = bestOf('sprint'), bf = bestOf('flows');
    const ch = challenge;
    const banner = ch ? '<div class="ch-banner"><p>' + (ch.name ? '<b>' + esc(ch.name) + '</b> ' : 'Someone ') + (ch.score != null ? 'got <b>' + ch.score + '</b> ' + (ch.g === 'flows' ? 'of 45 lines' : 'in 60 seconds') + ' on this round of ' : 'sent you a round of ') + G.GAMES[ch.g].name + '. You get the same questions.</p>' +
      '<div class="btn-row"><button class="btn primary" data-go="' + ch.g + '" data-seed="' + esc(ch.seed) + '">Take the challenge</button><button class="btn ghost" data-go="clear">Not now</button></div></div>' : '';
    const tile = (g, title, blurb, best, bestLbl) =>
      '<section class="game-tile"><h2>' + title + '</h2><p>' + blurb + '</p>' +
      '<p class="game-best">' + (best == null ? 'No score yet.' : 'Your best: <b>' + best + '</b> ' + bestLbl + '.') + '</p>' +
      '<div class="btn-row"><button class="btn primary" data-go="' + g + '" data-seed="' + G.dailySeed(todayISO()) + '">Play today\'s round</button><button class="btn" data-go="' + g + '" data-seed="">New round</button></div></section>';
    const rd = pr.rd;
    root.innerHTML = banner +
      '<header class="play-head"><h1 class="h-page">Play</h1><p class="lede">Two games built from the questions first rounds actually ask. Today\'s round is the same for everyone, so you can compare scores. No account, and nothing leaves this browser.</p></header>' +
      '<div class="game-tiles">' +
      tile('sprint', 'Mental Math Sprint', 'Sixty seconds of the arithmetic interviewers expect in your head: percent changes, multiples, yields, the rule of 72. Type the answer, hit Enter, next.', bs, 'in 60 seconds') +
      tile('flows', 'Statement Flows', 'One event, three statements. "Depreciation goes up by $20": mark each line up, down or unchanged, then read the walk-through. Five events a round.', bf, 'of 45 lines') +
      '</div>' +
      '<section class="prog"><h2>Your progress</h2><table class="ws-grid prog-tbl"><tbody>' +
      '<tr><td class="rn">1</td><td>Day streak</td><td class="num"><b>' + pr.st.n + '</b></td><td>' + (pr.st.n ? (pr.st.today ? 'Today counts.' : 'Play or study today to keep it.') : 'Any game, graded answer or finished session starts one.') + '</td></tr>' +
      '<tr><td class="rn">2</td><td>Rounds played</td><td class="num"><b>' + store.runs.length + '</b></td><td>' + runsOf('sprint').length + ' sprints, ' + runsOf('flows').length + ' flows</td></tr>' +
      (pr.hasPlan
        ? '<tr><td class="rn">3</td><td>Readiness<sup>1</sup></td><td class="num"><b>' + rd.overall + '%</b></td><td>' + (rd.expected != null ? 'Your plan is ' + rd.expected + '% elapsed, so you are ' + rd.status + '.' : '') + (rd.next ? ' ' + esc(rd.next.name) + ' is in ' + rd.next.days + ' day' + (rd.next.days === 1 ? '' : 's') + '.' : '') + '</td></tr>' +
          (rd.weakest ? '<tr><td class="rn">4</td><td>Weakest area</td><td class="num">' + esc(rd.weakest.name) + '</td><td>' + esc(rd.weakest.next) + '</td></tr>' : '')
        : '<tr><td class="rn">3</td><td>Readiness</td><td class="num">–</td><td><a href="app.html">Build a plan</a> with your interview dates and this row tracks you against them.</td></tr>') +
      '</tbody></table>' + (pr.hasPlan ? '<p class="fn"><sup>1</sup> An estimate from your graded answers and game scores, nothing else. <a href="app.html#scorecard">The Scorecard</a> breaks it down by area.</p>' : '') + '</section>' +
      '<section class="live-cta"><h2>Playing with a room?</h2><p>Put a code on the projector and everyone answers on their phone. Ten questions, a live leaderboard, about five minutes.</p><div class="btn-row"><a class="btn" href="live.html#host">Host a live room</a><a class="btn ghost" href="live.html">Join with a code</a></div></section>';
  }
  function play(g, seed) {
    seed = seed || G.newSeed();
    if (game) game.stop();
    const daily = seed === G.dailySeed(todayISO());
    root.innerHTML = '<div class="play-top"><button class="backlink" data-go="lobby">← All games</button><span class="note">' + G.GAMES[g].name + (daily ? ', today\'s round' : '') + '</span></div><div id="game"></div><div id="result"></div>';
    const onDone = res => result(res);
    game = g === 'sprint' ? startSprint($('#game', root), { seed, secs: 60, focus: true, onDone }) : startFlows($('#game', root), { seed, n: 5, onDone });
    window.scrollTo(0, 0);
  }
  function result(res) {
    const before = bestOf(res.g);
    record({ g: res.g, seed: res.seed, score: res.score, total: res.total || 0, tried: res.tried || 0, ms: res.ms || 0 });
    const ch = challenge && challenge.g === res.g && challenge.seed === res.seed ? challenge : null;
    const unit = res.g === 'sprint' ? 'right in 60 seconds' : 'of 45 lines right';
    const rows = [['This round', res.score, res.g === 'sprint' ? res.tried + ' answered' : mmss(res.ms / 1000) + ' on the clock']];
    if (ch && ch.score != null) rows.push([ch.name || 'Your challenger', ch.score, res.score > ch.score ? 'You win by ' + (res.score - ch.score) + '.' : res.score === ch.score ? 'A tie. Run it back.' : 'They lead by ' + (ch.score - res.score) + '.']);
    rows.push(['Your best before this', before == null ? '–' : before, before == null ? 'First score on the board.' : res.score > before ? 'New best.' : '']);
    if (res.g === 'sprint') rows.push(['Target', G.SPRINT_TARGET, res.score >= G.SPRINT_TARGET ? 'Cleared.' : (G.SPRINT_TARGET - res.score) + ' to go.']);
    const st = G.streak(G.activeDays(appState(), store), todayISO());
    rows.push(['Day streak', st.n, 'Today counts.']);
    let miss = '';
    if (res.g === 'sprint' && res.log) {
      const m = {}; res.log.forEach(l => { if (!l.ok) m[l.kind] = (m[l.kind] || 0) + 1; });
      const worst = Object.keys(m).sort((a, b) => m[b] - m[a])[0];
      if (worst) miss = '<p class="note">Most misses: ' + esc(KIND_LABEL[worst] || worst) + '.</p>';
    }
    const el = $('#result', root);
    el.innerHTML = '<section class="res" aria-live="polite"><p class="res-num">' + res.score + '</p><p class="res-lbl">' + unit + '</p>' +
      '<table class="ws-grid res-tbl"><tbody>' + rows.map((r, i) => '<tr><td class="rn">' + (i + 1) + '</td><td>' + esc(r[0]) + '</td><td class="num"><b>' + esc(r[1]) + '</b></td><td>' + esc(r[2]) + '</td></tr>').join('') + '</tbody></table>' + miss +
      '<div class="res-share"><label for="ch-name">Your name on the challenge</label><input class="in" id="ch-name" maxlength="16" placeholder="First name" value="' + esc(defaultName()) + '">' +
      '<div class="btn-row"><button class="btn primary" data-go="share">Challenge a friend</button><button class="btn" data-go="copy">Copy the link</button></div>' +
      '<p class="hint">They get the same questions and see your score first.</p></div>' +
      '<div class="btn-row"><button class="btn" data-go="' + res.g + '" data-seed="">New round</button><button class="btn" data-go="' + res.g + '" data-seed="' + esc(res.seed) + '">Same round again</button><button class="btn" data-go="' + (res.g === 'sprint' ? 'flows' : 'sprint') + '" data-seed="' + G.dailySeed(todayISO()) + '">Try ' + G.GAMES[res.g === 'sprint' ? 'flows' : 'sprint'].name + '</button><button class="btn ghost" data-go="lobby">All games</button></div></section>';
    el.dataset.g = res.g; el.dataset.seed = res.seed; el.dataset.score = res.score;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  const KIND_LABEL = { pctOf: 'percent of a number', pctChange: 'percent change', evMultiple: 'EV/EBITDA', impliedEV: 'implied enterprise value', pe: 'P/E', rule72: 'the rule of 72', margin: 'margins', netIncome: 'after-tax income',
    compound: 'compounding', presentValue: 'present value', fraction: 'fractions to percents', times: 'multiplication', equityValue: 'the EV to equity bridge', enterpriseValue: 'the equity to EV bridge', marketCap: 'market cap',
    bondYield: 'bond yields', divYield: 'dividend yields', breakeven: 'gains needed after a loss', basisPoints: 'basis points', interest: 'interest expense', wacc: 'WACC' };
  function onClick(e) {
    const b = e.target.closest('[data-go]'); if (!b) return;
    const go = b.dataset.go;
    if (go === 'lobby') lobby();
    else if (go === 'clear') { challenge = null; history.replaceState(null, '', location.pathname); lobby(); }
    else if (go === 'sprint' || go === 'flows') play(go, b.dataset.seed);
    else if (go === 'share' || go === 'copy') {
      const el = $('#result', root), nm = G.cleanName(($('#ch-name', root) || {}).value);
      store.name = nm; persist();
      const c = { g: el.dataset.g, seed: el.dataset.seed, score: +el.dataset.score, name: nm };
      if (go === 'share') shareChallenge(c);
      else copy(playURL() + G.challengeHash(c), 'Link copied. Whoever opens it gets the same round.');
    }
  }
  function mount(el) {
    root = el;
    challenge = G.parseChallenge(location.hash);
    root.addEventListener('click', onClick);
    addEventListener('hashchange', () => { const c = G.parseChallenge(location.hash); if (c) { challenge = c; lobby(); } });
    lobby();
  }

  /* ---------- the home page hero: a 30-second sprint, right there ---------- */
  function hero(el) {
    const seed = G.dailySeed(todayISO());      // the full minute on the Play page uses this; the taste here uses different questions
    const run = () => startSprint($('#hero-game', el), { seed: 'H' + seed, secs: 30, compact: true, onDone: res => {
      const out = $('#hero-out', el);
      out.innerHTML = '<p><b>' + res.score + ' right in 30 seconds.</b> ' + (res.score >= 10 ? 'That pace clears this site\'s target of 20 a minute.' : 'The target here is 20 a minute. It comes fast with reps.') + '</p>' +
        '<div class="btn-row"><a class="btn primary" href="play.html' + G.challengeHash({ g: 'sprint', seed }) + '">Play the full minute</a><a class="btn" href="play.html">See both games</a><button class="btn ghost" type="button" id="hero-again">Again</button></div>';
      out.hidden = false;
      $('#hero-again', el).addEventListener('click', () => { out.hidden = true; run(); $('#sp-in', el).focus(); });
    } });
    el.innerHTML = '<div id="hero-game"></div><div id="hero-out" class="hero-out" hidden aria-live="polite"></div>';
    run();
  }

  return { mount, hero, startSprint, startFlows, progress, KEY };
})();
