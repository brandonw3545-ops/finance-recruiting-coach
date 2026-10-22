/* ==========================================================================
   Finance Recruiting Coach: the app
   One app, two homes:
   - the website (GitHub Pages): no AI on the page; written lessons, self-checks and
     voice practice work right here, and AI actions open in the visitor's own Claude chat;
   - the Claude version (a claude.ai artifact): Claude runs in the page through the
     `sample` capability, on the viewer's own Claude account.
   State lives in this browser (localStorage).
   ========================================================================== */
(() => {
  'use strict';
  const E = Engine, P = Prompts;
  const LIB = (typeof LIBRARY !== 'undefined' && LIBRARY) || {};        // written lessons by topic id (built from content/lessons)
  const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
  const SITE_URL = 'https://brandonw3545-ops.github.io/finance-recruiting-coach/';
  const AI_URL = 'https://claude.ai/artifact/3QqSwrzAPJCeFJCW95Kayn';
  const appURL = () => (!IN_CLAUDE && /^https?:$/.test(location.protocol) ? location.origin + location.pathname : SITE_URL + 'app.html');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const todayISO = () => E.todayISO();
  const short = iso => E.fmt(iso, { month: 'short', day: 'numeric' });
  const dshort = iso => E.fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' });

  /* =========================== state =========================== */
  const KEY = 'frc:v1';
  function probe() { try { localStorage.setItem('frc:probe', '1'); localStorage.removeItem('frc:probe'); return true; } catch (e) { return false; } }
  function fresh() {
    return {
      v: 1, profile: null, draft: null, done: {}, lessons: {}, answers: [], mocks: [], mockActive: null, chat: [],
      drillQ: null, recentQ: [], ui: { tab: 'setup', viewKey: null, drill: 'mixed', practice: 'drill', mockView: null },
    };
  }
  let storageOk = probe();
  let S = fresh();
  // drop anything a half-finished session left behind (an empty chat turn would make the next call invalid)
  function tidy() {
    S.chat = (Array.isArray(S.chat) ? S.chat : []).filter(m => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim());
    ['answers', 'mocks'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
    ['done', 'lessons'].forEach(k => { if (!S[k] || typeof S[k] !== 'object') S[k] = {}; });
    const A = S.mockActive;
    if (A && Array.isArray(A.qs)) {      // mocks saved by an older version
      A.fus = Array.isArray(A.fus) ? A.fus : A.qs.map(() => null);
      A.scores = Array.isArray(A.scores) ? A.scores : A.qs.map(() => 0);
      A.stage = A.stage === 'fu' && A.fus[A.i] ? 'fu' : 'main';
    } else S.mockActive = null;
  }
  (function hydrate() {
    if (!storageOk) return;
    try {
      const raw = localStorage.getItem(KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.v === 1) { S = Object.assign(fresh(), d); S.ui = Object.assign(fresh().ui, d.ui || {}); tidy(); }
    } catch (e) { /* unreadable: start fresh */ }
  })();
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 300); }
  function saveNow() {
    clearTimeout(saveT);
    if (!storageOk) return;
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) {
      trimLessons(15);
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e2) { storageOk = false; renderFoot(); }
    }
  }
  function trimLessons(max) {
    const ks = Object.keys(S.lessons).sort((a, b) => (S.lessons[a].at || 0) - (S.lessons[b].at || 0));
    while (ks.length > max) delete S.lessons[ks.shift()];
  }
  addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

  /* =========================== plan + derived data =========================== */
  let memo = { sig: '', plan: null };
  function getPlan() {
    if (!S.profile) return null;
    const sig = JSON.stringify(S.profile);
    if (sig !== memo.sig) memo = { sig, plan: E.buildPlan(S.profile) };
    return memo.plan && !memo.plan.error ? memo.plan : null;
  }
  function prof() { const pl = getPlan(); return pl ? pl.profile : E.normalize(S.profile || {}); }
  function findItem(key) { const pl = getPlan(); return pl ? pl.items.find(i => i.key === key) || null : null; }

  function weakSpots() {
    const latest = new Map();
    S.answers.forEach(a => {
      const k = String(a.topic || a.q || '').toLowerCase().trim();
      const prev = latest.get(k);
      if (!prev || a.at >= prev.at) latest.set(k, a);
    });
    return Array.from(latest.values()).filter(a => a.score <= 3)
      .sort((x, y) => (x.score - y.score) || (y.at - x.at))
      .map(a => ({ topic: a.topic || 'A recent answer', score: a.score, q: a.q, qid: a.qid || '', fixes: a.fixes || [], cat: a.cat, at: a.at }));
  }
  /* spaced repetition (the schedule itself lives in the engine) */
  let revMemo = { sig: '', list: [] };
  function reviews() {
    const t = todayISO(), last = S.answers.length ? S.answers[S.answers.length - 1].id : '';
    const sig = t + '|' + S.answers.length + '|' + last;
    if (revMemo.sig !== sig) revMemo = { sig, list: E.reviewSchedule(S.answers, t) };
    return revMemo.list;
  }
  const dueReviews = () => reviews().filter(r => r.isDue);
  const reviewFor = q => reviews().find(r => r.key === E.reviewKey(q)) || null;
  function dueWords(d) {
    const n = E.daysBetween(todayISO(), d);
    return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'on ' + E.fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function catStats() {
    const m = {};
    S.answers.forEach(a => { const c = E.CATS[a.cat] ? a.cat : 'fit'; (m[c] = m[c] || []).push(a); });
    return Object.keys(m).map(c => {
      const arr = m[c].slice(-12);
      return { cat: c, avg: arr.reduce((s, a) => s + a.score, 0) / arr.length, n: m[c].length };
    });
  }
  function weakCats() {
    const bank = ['acc', 'val', 'mkt', 'trd', 'awm', 'inv', 'beh', 'fit', 'teaser'];
    return catStats().filter(s => bank.includes(s.cat) && s.n >= 2 && s.avg <= 3.2).sort((a, b) => a.avg - b.avg).map(s => s.cat);
  }
  function recentTitles() {
    const pl = getPlan(); if (!pl) return [];
    return pl.items.filter(it => S.done[it.key] && (it.kind === 'lesson' || it.kind === 'rev'))
      .sort((a, b) => String(S.done[b.key]).localeCompare(String(S.done[a.key])) || b.idx - a.idx)
      .slice(0, 5).map(displayTitle);
  }
  function ctx() { return { plan: getPlan(), today: todayISO(), weak: weakSpots(), recent: recentTitles() }; }
  function streak(plan) {
    const t = todayISO(); let n = 0;
    for (let i = plan.items.length - 1; i >= 0; i--) {
      const it = plan.items[i];
      if (it.date > t) continue;
      if (S.done[it.key]) n++;
      else if (it.date === t) continue;
      else break;
    }
    return n;
  }
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function resolveRev(it) {
    const w = weakSpots()[0];
    if (w) return { title: 'Rewind: ' + w.topic, weak: w };
    const pl = getPlan();
    const doneL = pl.items.filter(x => x.kind === 'lesson' && S.done[x.key]);
    const pick = doneL.length ? doneL[hashStr(it.key) % doneL.length] : pl.items.find(x => x.kind === 'lesson');
    return { title: 'Rewind: ' + (pick ? pick.title.split(':')[0] : 'the core technicals'), weak: null };
  }
  function displayTitle(it) { const s = S.lessons[it.key]; return (it.kind === 'rev' && s && s.title) ? s.title : it.title; }
  function shortTitle(it) {
    const t = displayTitle(it);
    if (it.kind === 'prep' || it.kind === 'mock' || it.kind === 'firm' || it.kind === 'drill') return t;
    const head = t.split(':')[0];
    return head.length >= 12 ? head : trunc(t, 60);
  }
  function answerCat(it) {
    if (it.kind === 'prep' || it.kind === 'firm') return 'fit';
    if (it.cat === 'car') return 'beh';
    if (it.kind === 'rev') { const w = weakSpots()[0]; return w ? w.cat : 'rev'; }
    return it.cat;
  }

  /* =========================== Claude (sample capability) =========================== */
  // 'ready': Claude runs in the page · 'web': the website, AI opens in Claude · 'off': inside Claude but blocked · 'checking'
  let samplePromise = null, aiState = IN_CLAUDE ? 'checking' : 'web', aiBlocked = '';
  function getSample() {
    if (!samplePromise) {
      samplePromise = (async () => {
        try {
          if (!window.claude || typeof window.claude.use !== 'function') return null;
          return await window.claude.use('sample');
        } catch (e) { return null; }
      })().then(s => {
        const was = aiState;
        if (aiState !== 'off') aiState = s ? 'ready' : IN_CLAUDE ? 'off' : 'web';
        if (was !== aiState && was === 'checking' && S.profile) render();
        else {
          // first visit: don't redraw the setup form under someone who may be typing; just swap the one button that differs
          const a = !S.profile && aiReady() ? $('a[data-act="handoff"][data-kind="dates"]') : null;
          if (a) a.outerHTML = '<button type="button" class="btn" data-act="suggest">Suggest dates for me</button>';
          renderFoot();
        }
        if (s) toolsAvailable(s).then(ok => { const h = $('#ask-hint'); if (h) h.hidden = !ok; });
        return s;
      });
    }
    return samplePromise;
  }
  const HARD_OFF = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  const AI_MSG = {
    not_granted: "Claude wasn't allowed for this page, so lessons and grading are off for this visit. Reload to be asked again, or use Copy as prompt.",
    sampling_disabled: "Claude isn't available on this account. Use Copy as prompt to run it in a chat.",
    not_declared: 'This page lost access to Claude. Use Copy as prompt for now.',
    capability_disabled: "Claude isn't available in this view. Use Copy as prompt for now.",
    capability_removed: "This app version can't reach Claude here. Use Copy as prompt for now.",
    rate_limited: "You've hit a usage limit for now. Try again later.",
    session_expired: 'Your Claude session expired. Sign in again, then retry.',
    refused: 'Claude declined that one. Try rephrasing it.',
    empty_completion: 'That came back empty. Try again.',
    invalid_json: 'The result came back garbled. Try again.',
    prompt_too_large: "That's too long to send. Shorten it and try again.",
    upstream_error: 'Connection hiccup. Try again.',
  };
  function aiError(e) {
    const code = (e && e.code) || 'upstream_error';
    if (HARD_OFF.includes(code)) { aiState = 'off'; aiBlocked = code; renderFoot(); }
    return AI_MSG[code] || AI_MSG.upstream_error;
  }
  function aiNotice() {
    if (aiState !== 'off') return '';
    return '<div class="ai-off"><span><strong>Claude isn\'t running in this page.</strong> ' + (aiBlocked === 'not_granted' ? 'Reload and allow it when asked, or use' : 'Use') + ' the Open in Claude buttons: they start a chat on your own Claude account with your plan built in.</span></div>';
  }
  function thinking(msg) { return '<span class="thinking"><i class="pulse"></i>' + esc(msg) + '</span>'; }

  /* =========================== markdown (shared with the lesson pages: src/md.js) =========================== */
  const { mdInline, mdBlocks, splitSections, ITEM_RE } = MD;
  const answersOpen = {};
  const renderLesson = (md, key) => MD.renderLesson(md, { open: !!answersOpen[key] });
  const lessonQuestions = md => MD.lessonQuestions(md);

  /* =========================== small UI helpers =========================== */
  function chip(cat) { const c = E.CATS[cat] || E.CATS.fit; return '<span class="chip" title="' + esc(c.name) + '">' + esc(c.code) + '</span>'; }
  const scoreCls = s => s >= 4 ? 's-hi' : s === 3 ? 's-mid' : 's-lo';
  const textCls = s => s >= 4 ? 't-hi' : s === 3 ? 't-mid' : 't-lo';
  const SCORE_WORD = { 5: 'Pass', 4: 'Close', 3: 'Shaky', 2: 'Miss', 1: 'Miss' };
  function scoreBadge(s, small) { return '<div class="score ' + scoreCls(s) + (small ? ' sm' : '') + '" role="img" aria-label="Score ' + s + ' out of 5">' + s + '<small>/5</small></div>'; }
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const d = new Date(ts);
    if (E.iso(d) === todayISO()) return 'today ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return short(E.iso(d));
  }
  let toastT = 0;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function copyText(text, okMsg) {
    let p;
    try { p = (navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(text) : Promise.reject(new Error('none')); }
    catch (e) { p = Promise.reject(e); }
    p.then(() => toast(okMsg || 'Copied')).catch(() => openCopy(text, 'Automatic copying was blocked. The text is selected below: copy it with Ctrl+C or Cmd+C.', 'Copy this'));
  }
  function openCopy(text, msg, title, link) {
    closeOverlay();
    const o = document.createElement('div');
    o.className = 'overlay'; o.id = 'overlay';
    o.innerHTML = '<div class="card" role="dialog" aria-modal="true" aria-labelledby="ov-h"><h2 id="ov-h" style="font-size:17px">' + esc(title || 'Copy this prompt') + '</h2>' + (msg ? '<p class="note">' + esc(msg) + '</p>' : '') +
      '<label class="vh" for="ov-ta">Prompt text</label><textarea class="in" id="ov-ta" readonly>' + esc(text) + '</textarea><div class="btn-row"><button class="btn primary" data-act="ov-copy">Copy</button>' +
      (link ? '<a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">Open Claude<span class="ext" aria-hidden="true"> ↗</span></a>' : '') + '<button class="btn" data-act="ov-close">Close</button></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o) closeOverlay(); });
    const ta = $('#ov-ta'); ta.focus(); ta.select();
  }
  function closeOverlay() { const o = $('#overlay'); if (o) o.remove(); }
  function armed(btn, label) {
    if (btn.dataset.armed === '1') return true;
    const orig = btn.textContent;
    btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = orig; } }, 3500);
    return false;
  }

  /* timer: 30 seconds to think, 60 to answer */
  let T = null;
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function timerHTML(scope) { return '<div class="timer"><button class="btn small" type="button" data-act="timer" data-scope="' + scope + '">Start timer</button><span class="timer-read" id="' + scope + '-timer"><span class="ph">Think</span>0:30</span></div>'; }
  function timerStart(scope, btn) {
    timerStop();
    T = { scope, phase: 'think', end: Date.now() + 30000, btn };
    btn.textContent = 'Reset';
    T.iv = setInterval(tick, 200); tick();
  }
  function tick() {
    if (!T) return;
    const el = $('#' + T.scope + '-timer');
    if (!el) { timerStop(); return; }
    let left = Math.ceil((T.end - Date.now()) / 1000);
    if (left <= 0 && T.phase === 'think') { T.phase = 'answer'; T.end = Date.now() + 60000; left = 60; }
    else if (left <= 0 && T.phase === 'answer') { T.phase = 'over'; left = 0; clearInterval(T.iv); }
    el.className = 'timer-read ' + T.phase;
    el.innerHTML = '<span class="ph">' + ({ think: 'Think', answer: 'Answer', over: "Time's up" })[T.phase] + '</span>' + mmss(Math.max(0, left));
  }
  function timerStop() {
    if (!T) return;
    clearInterval(T.iv);
    const el = $('#' + T.scope + '-timer');
    if (el) { el.className = 'timer-read'; el.innerHTML = '<span class="ph">Think</span>0:30'; }
    if (T.btn && T.btn.isConnected) T.btn.textContent = 'Start timer';
    T = null;
  }

  /* tooltip */
  function showTip(html, x, y) {
    const t = $('#tip'); if (!t) return;
    t.innerHTML = html; t.hidden = false;
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    t.style.left = Math.max(8, left) + 'px'; t.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { const t = $('#tip'); if (t) t.hidden = true; }

  /* =========================== shell =========================== */
  const TABS = [['today', 'Today'], ['plan', 'Plan'], ['practice', 'Practice'], ['scorecard', 'Scorecard'], ['ask', 'Ask'], ['setup', 'Setup']];
  const MARK = '<svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><rect class="bm-bg" x="0" y="0" width="28" height="28" rx="6"/><rect class="bm-ln" x="6" y="7.5" width="16" height="2.6" rx="1.3"/><rect class="bm-ln" x="6" y="12.7" width="11.5" height="2.6" rx="1.3"/><rect class="bm-ln" x="6" y="17.9" width="7" height="2.6" rx="1.3"/><path class="bm-ck" d="M15.6 18.6l2.2 2.2 4.4-5"/></svg>';
  function shell() {
    $('#app').innerHTML =
      '<header class="top"><div class="wrap"><div class="top-row">' + (IN_CLAUDE ? '<div class="brand">' : '<a class="brand" href="./" title="Home">') + MARK + '<div class="brand-txt"><div class="brand-name">Finance Recruiting Coach</div><div class="brand-sub" id="brand-sub"></div></div>' + (IN_CLAUDE ? '</div>' : '</a>') + '<div class="count" id="count"></div></div>' +
      '<nav class="tabs" id="tabs" aria-label="Sections"></nav></div></header>' +
      '<main class="wrap" id="main"></main><footer class="wrap foot" id="foot"></footer>';
  }
  function renderTop() {
    const plan = getPlan();
    const p = S.profile ? prof() : null;
    $('#brand-sub').textContent = p && (p.name || p.school) ? [p.name, p.school].filter(Boolean).join(' · ') : 'Your plan, your dates, your coach';
    const c = $('#count');
    if (plan) {
      const n = E.daysBetween(todayISO(), plan.ready);
      c.innerHTML = n >= 0 ? '<span class="count-n">' + n + '</span><span class="count-l"><span class="long">days to interview-ready</span><span class="short">days left</span></span>' : '<span class="count-l">Interview-ready date passed</span>';
      c.title = 'Interview-ready by ' + E.fmt(plan.ready, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } else c.innerHTML = '';
  }
  function renderTabs() {
    const has = !!getPlan();
    $('#tabs').innerHTML = TABS.map(([k, l]) => {
      const dis = !has && k !== 'setup';
      return '<button class="tab" data-act="tab" data-tab="' + k + '"' + (S.ui.tab === k ? ' aria-current="page"' : '') + (dis ? ' aria-disabled="true" title="Build your plan first"' : '') + '>' + l + '</button>';
    }).join('');
  }
  function renderFoot() {
    const f = $('#foot'); if (!f) return;
    const ai = aiState === 'ready' ? '<span><i class="dot on"></i>Claude connected. Lessons and grading use your own Claude account.</span>'
      : aiState === 'web' ? '<span><i class="dot on"></i>Written lessons and practice work right here. AI actions open in your own Claude chat.</span>'
        : aiState === 'off' ? '<span><i class="dot off"></i>Claude isn\'t running in this page. Open in Claude works anywhere.</span>'
          : '<span><i class="dot"></i>Checking for Claude…</span>';
    const st = storageOk ? '<span>Your plan and progress are saved in this browser only.</span>' : '<span class="warn">This browser window isn\'t saving progress. Copy a backup code in Setup before you leave.</span>';
    const links = IN_CLAUDE ? '<span><a href="' + SITE_URL + '" target="_blank" rel="noopener">The website version</a> has voice practice and calendar reminders.</span>'
      : '<span class="foot-links"><a href="./">Home</a><a href="library/">Lesson library</a><a href="' + AI_URL + '" target="_blank" rel="noopener">Claude version</a></span>';
    f.innerHTML = ai + st + links;
    $$('.ai-slot').forEach(el => { el.innerHTML = aiNotice(); });
  }
  function render() {
    if (!getPlan() && S.ui.tab !== 'setup') S.ui.tab = 'setup';
    hideTip();
    renderTop(); renderTabs(); renderFoot();
    ({ today: viewToday, plan: viewPlan, practice: viewPractice, scorecard: viewScorecard, ask: viewAsk, setup: viewSetup })[S.ui.tab]();
  }
  function go(tab) { timerStop(); S.ui.tab = tab; if (tab === 'today') S.ui.viewKey = null; save(); render(); window.scrollTo(0, 0); }

  /* =========================== Open in Claude ===========================
     Where in-page Claude isn't available (the website, or a viewer who declined), each AI
     action opens a new Claude chat with the prompt already typed, on the visitor's own account.
     claude.ai/new?q= isn't an official API, so long prompts are copied instead. */
  const CLAUDE_NEW = 'https://claude.ai/new';
  const URL_MAX = 3800;
  const HANDOFF_LABEL = { lesson: 'Teach me in Claude', rev: 'Teach me in Claude', drill: 'Run the drill in Claude', prep: 'Prep me in Claude', firm: 'Build my answer in Claude' };
  const aiReady = () => aiState === 'ready';
  function handoffBtn(kind, label, attrs, cls) {
    const klass = cls && /\bfchip\b/.test(cls) ? cls : 'btn' + (cls ? ' ' + cls : '');
    return '<a class="' + klass + '" href="' + CLAUDE_NEW + '" target="_blank" rel="noopener" data-act="handoff" data-kind="' + kind + '"' + (attrs || '') + '>' + esc(label) + '<span class="ext" aria-hidden="true"> ↗</span></a>';
  }
  function handoffPrompt(kind, el) {
    const p = prof(), c = ctx();
    if (kind === 'lesson' || kind === 'personalize') {
      const it = findItem(el.dataset.key);
      if (!it) return null;
      return kind === 'lesson' ? P.handoffLesson(p, getPlan(), it, c, it.kind === 'rev' ? resolveRev(it) : null) : P.handoffPersonalize(p, it, c);
    }
    if (kind === 'grade') {
      const g = gradeInputs(el.dataset.scope);
      if (!g.q) { toast('Pick or type the question first'); return null; }
      if (!g.a) { toast('Answer first: record it or type it'); const t = $('#' + el.dataset.scope + '-a'); if (t) t.focus(); return null; }
      return P.handoffGrade(p, g.q, g.a, g.meta.context);
    }
    if (kind === 'mock') return P.handoffMock(p, c, S.mockActive ? S.mockActive.qs : E.pickMock(p, uid(), [], weakCats()));
    if (kind === 'ask') { const box = $('#ask-in'); return P.handoffAsk(p, c, el.dataset.q || (box ? box.value : '')); }
    if (kind === 'dates') return P.handoffDates(E.normalize(getDraft()), todayISO());
    return null;
  }
  function handoff(a, e) {
    const prompt = handoffPrompt(a.dataset.kind, a);
    if (!prompt) { e.preventDefault(); return; }
    const q = encodeURIComponent(prompt);
    if (q.length <= URL_MAX) { a.href = CLAUDE_NEW + '?q=' + q; return; }      // the click itself opens the chat
    e.preventDefault();
    a.href = CLAUDE_NEW;
    openCopy(prompt, 'This one is too long to send in a link. Copy it, open Claude, and paste it into the new chat.', 'Copy, then open Claude', CLAUDE_NEW);
  }

  /* =========================== voice answers ===========================
     Website only: the Claude viewer can't use the microphone. */
  const voiceOK = !IN_CLAUDE && Voice.supported();
  const voiceStats = {};           // scope -> stats of the last recording
  let recorder = null, recScope = null, recTick = 0;
  const VOICE_NOTE = 'Recording uses your browser\'s speech-to-text. Chrome sends the audio to Google to transcribe it.';
  function recBtnHTML(scope) {
    if (!voiceOK) return '';
    const on = recScope === scope;
    return '<button class="btn small rec' + (on ? ' on' : '') + '" type="button" data-act="rec" data-scope="' + scope + '" aria-pressed="' + on + '" title="' + esc(VOICE_NOTE) + '"><i class="rec-dot" aria-hidden="true"></i>' + (on ? 'Stop recording' : 'Record answer') + '</button>';
  }
  function voiceVerdictHTML(st, compact) {
    const v = Voice.verdicts(st);
    return '<div class="vbox"><span class="mono">' + Voice.mmss(st.seconds) + ' · ' + st.words + ' words' + (st.wpm ? ' · ' + st.wpm + ' wpm' : '') + ' · ' + st.fillerCount + ' filler' + (st.fillerCount === 1 ? '' : 's') + '</span>' +
      (compact || !v.length ? '' : '<ul>' + v.map(x => '<li class="' + (x.tone === 'good' ? 't-hi' : 't-mid') + '">' + esc(x.text) + '</li>').join('') + '</ul>') + '</div>';
  }
  function vstatsHTML(scope) {
    if (recScope === scope) return '<span class="rec-live"><i class="rec-dot" aria-hidden="true"></i>Listening <span class="mono" id="' + scope + '-rect">0:00</span></span>';
    const st = voiceStats[scope];
    return st ? voiceVerdictHTML(st, false) : '';
  }
  function answerFieldHTML(scope, hint, value, placeholder) {
    const ph = placeholder || (voiceOK ? 'Record it, type it, or use the mic on your keyboard.' : 'Type it, or tap the mic on your keyboard and say it out loud.');
    return '<div class="field"><label for="' + scope + '-a">Your answer</label><textarea class="in" id="' + scope + '-a" placeholder="' + esc(ph) + '">' + esc(value || '') + '</textarea>' +
      '<div class="vstats" id="' + scope + '-vs" aria-live="polite">' + vstatsHTML(scope) + '</div>' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
  }
  function paintRec(scope) {
    const b = $('[data-act="rec"][data-scope="' + scope + '"]');
    if (b) b.outerHTML = recBtnHTML(scope);
    const vs = $('#' + scope + '-vs');
    if (vs) vs.innerHTML = vstatsHTML(scope);
  }
  function recDone(scope) { clearInterval(recTick); recorder = null; recScope = null; paintRec(scope); }
  function recStop() { if (recorder) recorder.stop(); }
  function recStart(scope) {
    if (recorder) recStop();
    const box = $('#' + scope + '-a');
    if (!box) return;
    const base = box.value.trim() ? box.value.trim() + ' ' : '';
    let errored = false;
    voiceStats[scope] = null;
    recScope = scope;
    recorder = Voice.Recorder({
      onText: t => { const b = $('#' + scope + '-a'); if (b) { b.value = base + t; b.dispatchEvent(new Event('input', { bubbles: true })); } },
      onEnd: ({ text, seconds }) => { if (errored) return; voiceStats[scope] = Voice.stats(text, seconds); recDone(scope); },
      onError: code => {
        errored = true;
        recDone(scope);
        const msg = code === 'not-allowed' || code === 'service-not-allowed' ? 'The microphone is blocked. Allow it from the address bar, or type your answer.'
          : code === 'audio-capture' ? 'No microphone found. Type your answer instead.'
            : code === 'network' ? 'Speech-to-text needs an internet connection.' : 'Recording stopped (' + code + '). Try again, or type it.';
        const vs = $('#' + scope + '-vs'); if (vs) vs.innerHTML = '<p class="note bad">' + esc(msg) + '</p>';
      },
    });
    try { recorder.start(); }
    catch (e) { recorder = null; recScope = null; toast("Recording isn't available in this browser"); return; }
    paintRec(scope);
    clearInterval(recTick);
    recTick = setInterval(() => { const el = $('#' + scope + '-rect'); if (el && recorder) el.textContent = Voice.mmss(Math.floor(recorder.elapsed())); }, 250);
  }

  /* =========================== Today =========================== */
  let stream = null;          // { key, ctl, text }
  let flash = null;           // { key, msg }
  let lessonQs = [];
  const drafts = {};          // unsent answers, by box
  const libFor = it => (it && (it.kind === 'lesson') && it.topicId && LIB[it.topicId]) || null;
  function viewToday() {
    const plan = getPlan(), t = todayISO();
    let item = S.ui.viewKey ? findItem(S.ui.viewKey) : null;
    if (S.ui.viewKey && !item) S.ui.viewKey = null;
    const todays = E.itemOn(plan, t);
    if (!item) item = todays;
    const main = item ? sessionHTML(plan, item, !!todays && item.key === todays.key) : restHTML(plan);
    $('#main').innerHTML = '<div class="today"><div style="min-width:0">' + main + '</div><aside class="side" aria-label="Your week">' + sideHTML(plan) + '</aside></div>';
    if (item) afterSession(item);
  }
  function teachBlurb(it) {
    const tail = aiReady() ? '' : ' It opens in a Claude chat on your own account, with your plan built in.';
    if (it.kind === 'drill') return 'No new theory today: a warm-up, six interview questions from easy to hard and a stretch question.' + tail;
    if (it.kind === 'prep') return (it.sub === 'day' ? 'A short warm-up for interview day: three quick technicals, your three stories, your "why" and a checklist.' : 'A prep session for ' + esc(it.event.name) + ' on ' + short(it.event.date) + ': what they screen for, how your background fits, and a dated checklist.') + tail;
    if (it.kind === 'firm') return 'Build your answer to "Why ' + esc(it.firm) + '?": what they do, where to research them in 30 minutes, and a draft answer with blanks for you to fill.' + tail;
    if (it.kind === 'rev') { const r = resolveRev(it); return (r.weak ? 'A Rewind on your weakest recent answer (' + r.weak.score + '/5), taught from a new angle and drilled.' : 'A Rewind on an earlier topic, taught from a new angle and drilled.') + tail; }
    return aiReady() ? 'Opens with an interview question, explains the idea in plain English, shows the trap most candidates fall into, and ends with questions for you to answer out loud.'
      : "This one isn't in the built-in lesson library yet. Claude writes it for you, aimed at your seats and dates, in a chat on your own account.";
  }
  const TEACH_BTN = { lesson: 'Teach me this lesson', rev: 'Teach me this lesson', drill: 'Start the drill', prep: 'Prep me', firm: 'Build my answer' };
  function doneBtn(it, small) { return '<button class="btn' + (small ? ' small' : '') + '" data-act="done" data-key="' + esc(it.key) + '">' + (S.done[it.key] ? 'Undo done' : 'Mark done') + '</button>'; }
  function sessionHTML(plan, it, isToday) {
    const ph = plan.phases.find(x => x.n === it.phase);
    const saved = S.lessons[it.key];
    const title = it.kind === 'rev' ? (saved && saved.title ? saved.title : resolveRev(it).title) : it.title;
    const eyebrow = dshort(it.date) + ' · Day ' + it.day + ' of ' + plan.total + (ph ? ' · ' + ph.name : '');
    const link = it.event ? '<div class="session-link">Linked to your date: ' + esc(it.event.name) + ', ' + short(it.event.date) + (it.event.est ? ' (estimate)' : '') + '</div>' : '';
    const body = it.kind === 'mock' ? mockCardHTML(it) : lessonBlockHTML(it, saved);
    return (!isToday ? '<button class="backlink" data-act="back-today">← Back to today</button>' : '') +
      '<div class="ai-slot">' + aiNotice() + '</div>' +
      '<div class="session-head"><div class="eyebrow">' + esc(eyebrow) + (isToday ? ' · Today' : '') + '</div>' +
      '<div class="session-meta">' + chip(it.cat) + '<span class="note">' + esc(E.CATS[it.cat].name) + '</span>' + (S.done[it.key] ? '<span class="done-flag">✓ Done</span>' : '') + '</div>' +
      '<h1 class="session-title">' + esc(title) + '</h1>' + link + '</div>' + body;
  }
  function lessonBlockHTML(it, saved) {
    const busy = !!(stream && stream.key === it.key);
    const fl = flash && flash.key === it.key ? '<p class="note bad" style="margin-top:12px">' + esc(flash.msg) + '</p>' : '';
    if (flash && flash.key === it.key) flash = null;
    const lib = libFor(it);
    if (!saved && !busy && !lib) {
      const ai = aiReady(), k = ' data-key="' + esc(it.key) + '"';
      return fl + '<div class="teach"><p>' + teachBlurb(it) + '</p><div class="btn-row">' +
        (ai ? '<button class="btn primary" data-act="teach"' + k + '>' + TEACH_BTN[it.kind] + '</button><button class="btn" data-act="copy-lesson"' + k + '>Copy as prompt</button>'
          : handoffBtn('lesson', HANDOFF_LABEL[it.kind] || 'Open in Claude', k, 'primary') + '<button class="btn" data-act="copy-lesson"' + k + '>Copy prompt</button>') +
        doneBtn(it) + '</div>' +
        '<p class="hint">' + (ai ? 'About ' + prof().minutes + ' minutes. The first time, Claude asks you to allow this page; it uses your own Claude account.'
          : 'A free Claude account works. No Claude? Copy prompt works in most AI chat apps.') + '</p></div>';
    }
    const md = busy ? stream.text : saved ? saved.text : lib.md;
    return fl + '<div class="lesson-wrap" id="lesson-area" data-key="' + esc(it.key) + '"><div class="lesson-bar" id="lesson-bar">' + lessonBarHTML(it, saved, busy, lib) + '</div>' +
      '<article class="lesson" id="lesson">' + renderLesson(md, it.key) + '</article>' +
      (!busy && saved && saved.truncated ? '<p class="trunc">This one stopped early. Regenerate it for the full version.</p>' : '') + '</div>' +
      (!busy ? gradeBoxHTML('lg', it, md, saved ? null : lib) : '');
  }
  function lessonBarHTML(it, saved, busy, lib) {
    if (busy) return '<span id="busy-msg">' + thinking(stream.text ? 'Writing…' : 'Thinking. The first words can take up to a minute.') + '</span><button class="btn small" data-act="stop-lesson">Stop</button>';
    const k = ' data-key="' + esc(it.key) + '"';
    if (saved) {
      return '<span class="note mono">' + (lib ? 'Personalized · ' : '') + 'Saved ' + esc(ago(saved.at)) + '</span><div class="btn-row">' + doneBtn(it, true) +
        (aiReady() ? '<button class="btn small" data-act="regen"' + k + '>Regenerate</button>' : '') +
        (lib ? '<button class="btn small" data-act="lib-restore"' + k + '>Standard lesson</button>' : '') +
        '<button class="btn small" data-act="copy-lesson"' + k + '>Copy as prompt</button></div>';
    }
    return '<span class="note mono">From the lesson library</span><div class="btn-row">' + doneBtn(it, true) +
      (aiReady() ? '<button class="btn small" data-act="teach"' + k + '>Personalize it</button>' : handoffBtn('personalize', 'Make it about me', k, 'small')) + '</div>';
  }
  function gradeButtons(scope, key) {
    const k = key ? ' data-key="' + esc(key) + '"' : '';
    if (aiReady()) {
      return '<button class="btn primary" id="' + scope + '-go" data-act="grade" data-scope="' + scope + '"' + k + '>Grade my answer</button>' +
        '<button class="btn" data-act="self-check" data-scope="' + scope + '"' + k + '>Check it myself</button>' +
        '<button class="btn ghost" data-act="copy-grade" data-scope="' + scope + '"' + k + '>Copy as prompt</button>';
    }
    return '<button class="btn primary" id="' + scope + '-go" data-act="self-check" data-scope="' + scope + '"' + k + '>Check my answer</button>' +
      handoffBtn('grade', 'Grade it in Claude', ' data-scope="' + scope + '"' + k);
  }
  function gradeBoxHTML(scope, it, md, lib) {
    lessonQs = lessonQuestions(md);
    const ans = (lib && lib.answers) || {};
    lessonQs.forEach(o => { o.model = ans[o.label] || ''; o.qid = lib ? 'L:' + it.topicId + ':' + o.label : ''; });
    const opts = lessonQs.map((o, i) => '<option value="' + i + '">' + esc(o.label) + ': ' + esc(trunc(o.q, 80)) + '</option>').join('') + '<option value="custom">Type my own question</option>';
    return '<section class="grade" aria-labelledby="lg-h"><h2 id="lg-h">Answer it, get a score</h2>' +
      '<div class="field"><label for="lg-q">Question</label><select class="in" id="lg-q">' + opts + '</select>' +
      '<label class="vh" for="lg-qc">Your question</label><textarea class="in" id="lg-qc" rows="2" placeholder="Type or paste the question"' + (lessonQs.length ? ' hidden' : '') + '></textarea></div>' +
      '<div class="btn-row">' + timerHTML('lg') + recBtnHTML('lg') + '</div>' +
      answerFieldHTML('lg', 'Answer before you open the Answers section. Every score goes to your Scorecard.' + (voiceOK ? ' ' + VOICE_NOTE : '')) +
      '<div class="btn-row">' + gradeButtons('lg', it.key) + '</div><div id="lg-out" aria-live="polite"></div></section>';
  }
  function afterSession(it) {
    const a = $('#lg-a'); if (a && !a.value) a.value = drafts['lg:' + it.key] || '';
  }
  function mockCardHTML(it) {
    const doneMock = S.mocks.filter(m => m.key === it.key && m.result).slice(-1)[0];
    if (doneMock) return '<div class="teach"><p>You finished this mock: ' + doneMock.result.overall + '/5. ' + esc(doneMock.result.headline) + '</p><div class="btn-row"><button class="btn primary" data-act="mock-view" data-id="' + esc(doneMock.id) + '">See the feedback</button><button class="btn" data-act="mock-start" data-key="' + esc(it.key) + '">Run another</button></div></div>';
    const active = S.mockActive && S.mockActive.key === it.key;
    return '<div class="teach"><p>Five questions, one at a time, the way a first round for ' + esc(E.SEATS[prof().primary].phrase) + ' usually runs: a fit question, a behavioral, two technicals and a closer, each with a follow-up. No feedback until the end.' + (it.event ? ' Use it as a dress rehearsal for ' + esc(it.event.name) + '.' : '') + ' About 15 minutes.</p>' +
      '<div class="btn-row"><button class="btn primary" data-act="mock-start" data-key="' + esc(it.key) + '">' + (active ? 'Resume the mock' : 'Start the mock') + '</button>' +
      (aiReady() ? '' : handoffBtn('mock', 'Run it live in Claude')) + doneBtn(it) + '</div></div>';
  }
  function restHTML(plan) {
    const t = todayISO(), nxt = E.nextItem(plan, t);
    if (t < plan.start && nxt) return '<div class="empty"><h2>Your plan starts ' + E.fmt(plan.start, { weekday: 'long', month: 'long', day: 'numeric' }) + '</h2><p>First up: ' + esc(nxt.title) + '. Open it now if you want a head start.</p><div class="btn-row"><button class="btn primary" data-act="open" data-key="' + esc(nxt.key) + '">Open the first lesson</button></div></div>';
    if (!nxt) return '<div class="empty"><h2>You\'ve reached the end of your plan</h2><p>Keep sharp with drills and mock interviews, or add new dates in Setup to extend it.</p><div class="btn-row"><button class="btn primary" data-act="tab" data-tab="practice">Go to Practice</button><button class="btn" data-act="tab" data-tab="setup">Add dates</button></div></div>';
    return '<div class="empty"><h2>No session today</h2><p>Today isn\'t one of your study days. Next up, ' + E.fmt(nxt.date, { weekday: 'long', month: 'short', day: 'numeric' }) + ': ' + esc(displayTitle(nxt)) + '.</p><div class="btn-row"><button class="btn primary" data-act="open" data-key="' + esc(nxt.key) + '">Start it early</button><button class="btn" data-act="tab" data-tab="practice">Quick drill instead</button></div></div>';
  }
  function sideHTML(plan) {
    const t = todayISO();
    const evs = plan.events.filter(e => e.date >= t).slice(0, 4);
    const evHTML = evs.length ? '<ul class="mini">' + evs.map(e => { const n = E.daysBetween(t, e.date); return '<li><span class="d">' + short(e.date) + '</span><span class="t evn">' + esc(e.name) + (e.est ? ' <span class="chip flag">EST</span>' : '') + '</span><span class="away">' + (n === 0 ? 'today' : n + 'd') + '</span></li>'; }).join('') + '</ul>'
      : '<p class="note">No dates yet. Add deadlines and interviews in Setup and the coach schedules prep sessions before each one.</p>';
    const cur = E.itemOn(plan, t) || E.nextItem(plan, t);
    let wk = '<p class="note">Nothing scheduled.</p>';
    if (cur) {
      const w = E.weekOf(plan, cur);
      const items = plan.items.filter(i => E.weekOf(plan, i) === w);
      wk = '<ul class="mini">' + items.map(i => '<li class="' + (i.date === t ? 'is-today' : '') + '"><span class="d">' + esc(E.fmt(i.date, { weekday: 'short', day: 'numeric' })) + '</span><button class="t" data-act="open" data-key="' + esc(i.key) + '">' + esc(shortTitle(i)) + '</button><span class="st ' + (S.done[i.key] ? 'st-done' : i.date < t ? 'st-miss' : '') + '">' + (S.done[i.key] ? '✓' : i.date < t ? 'missed' : '') + '</span></li>').join('') + '</ul>';
    }
    const dueR = dueReviews(), allR = reviews();
    const revHTML = dueR.length
      ? '<ul class="mini">' + dueR.slice(0, 3).map(r => '<li><span class="d">' + (r.due < t ? 'overdue' : 'today') + '</span><span class="t">' + esc(trunc(r.q, 70)) + '</span><span></span></li>').join('') + '</ul><div class="btn-row" style="margin-top:8px"><button class="btn small" data-act="reviews-go">Start reviews</button></div>'
      : '<p class="note">' + (allR.length ? 'Nothing due today. Next review ' + dueWords(allR[0].due) + '.' : 'Anything you score 3 or lower comes back the next day, then after 3, 7 and 14 days.') + '</p>';
    const due = plan.items.filter(i => i.date <= t).length;
    const doneN = plan.items.filter(i => S.done[i.key] && i.date <= t).length;
    const missed = plan.items.filter(i => i.date < t && !S.done[i.key]);
    const stats = '<div class="stats-row"><div class="stat-sm"><b>' + doneN + '<small> / ' + due + '</small></b><span>sessions done so far</span></div><div class="stat-sm"><b>' + streak(plan) + '</b><span>session streak</span></div></div>';
    const catchUp = missed.length ? '<div class="side-block"><h2>Catch up · ' + missed.length + '</h2><ul class="mini">' + missed.slice(-4).reverse().map(i => '<li><span class="d">' + short(i.date) + '</span><button class="t" data-act="open" data-key="' + esc(i.key) + '">' + esc(shortTitle(i)) + '</button><span></span></li>').join('') + '</ul></div>' : '';
    return '<div class="side-block"><h2>Your dates</h2>' + evHTML + '</div><div class="side-block"><h2>This week</h2>' + wk + '</div>' +
      '<div class="side-block"><h2>Reviews' + (dueR.length ? ' · ' + dueR.length + ' due' : '') + '</h2>' + revHTML + '</div>' +
      '<div class="side-block"><h2>Progress</h2>' + stats + '</div>' + catchUp;
  }

  async function teach(key, regen) {
    const plan = getPlan(), it = findItem(key);
    if (!it) return;
    if (stream) { toast('Still writing the last one'); return; }
    const rev = it.kind === 'rev' ? resolveRev(it) : null;
    const prompt = P.lesson(prof(), plan, it, ctx(), rev);
    const sample = await getSample();
    if (!sample) { openCopy(P.handoffLesson(prof(), plan, it, ctx(), rev), "Claude isn't available in this view. Copy this, open Claude, and paste it into a new chat.", 'Copy, then open Claude', CLAUDE_NEW); return; }
    const prev = S.lessons[it.key];
    const ctl = new AbortController();
    stream = { key: it.key, ctl, text: '' };
    delete S.lessons[it.key];
    if (S.ui.tab === 'today') render();
    const keep = (text, trunc) => { S.lessons[it.key] = { text, at: Date.now(), title: rev ? rev.title : it.title, truncated: !!trunc }; };
    try {
      const res = await sample(prompt, {
        signal: ctl.signal, modelTier: 'default', cache: regen ? { gcTime: 86400000, refresh: true } : { gcTime: 86400000 },
        onText: ({ text }) => { if (stream && stream.key === it.key) { stream.text = text; paintStream(it.key, text); } },
      });
      keep(res.text, res.truncated);
    } catch (e) {
      if (e && e.text) keep(e.text, true);
      else if (prev) S.lessons[it.key] = prev;
      if (!e || e.code !== 'cancelled') flash = { key: it.key, msg: aiError(e) };
    } finally {
      stream = null;
      trimLessons(80); save();
      if (S.ui.tab === 'today') render();
    }
  }
  function paintStream(key, text) {
    const area = $('#lesson-area');
    if (!area || area.dataset.key !== key) return;
    const art = $('#lesson'); if (art) art.innerHTML = renderLesson(text, key);
    const bm = $('#busy-msg'); if (bm && !bm.dataset.w) { bm.dataset.w = '1'; bm.innerHTML = thinking('Writing…'); }
  }

  /* ---------- grading: by Claude, or by you against the model answer ---------- */
  const gradeCtl = {};
  const selfPending = {};     // scope -> { q, a, meta, model, followUp, voice }
  function cleanGrade(r) {
    if (!r || typeof r !== 'object') throw { code: 'invalid_json' };
    const score = Math.round(Number(r.score));
    if (!(score >= 1 && score <= 5)) throw { code: 'invalid_json' };
    const arr = (x, n) => (Array.isArray(x) ? x : []).map(v => String(v).trim()).filter(Boolean).slice(0, n);
    return { score, verdict: String(r.verdict || '').trim(), strengths: arr(r.strengths, 2), fixes: arr(r.fixes, 3), better: String(r.better || '').trim(), followUp: String(r.followUp || r.follow_up || '').trim(), topic: trunc(String(r.topic || '').trim(), 60) };
  }
  function modelByQid(qid) {
    if (!qid) return { model: '', followUp: '' };
    if (qid.indexOf('L:') === 0) {
      const rest = qid.slice(2), i = rest.indexOf(':');
      const l = LIB[rest.slice(0, i)];
      return { model: (l && l.answers && l.answers[rest.slice(i + 1)]) || '', followUp: '' };
    }
    const b = E.questionById(qid);
    return b ? { model: b.answer || '', followUp: b.followUp || '' } : { model: '', followUp: '' };
  }
  function gradeInputs(scope) {
    let q = '', meta;
    if (scope === 'lg') {
      const sel = $('#lg-q'), c = $('#lg-qc');
      const pick = (sel && sel.value !== 'custom' && lessonQs[+sel.value]) ? lessonQs[+sel.value] : null;
      q = pick ? pick.q : (c ? c.value.trim() : '');
      const it = findItem(($('#lg-go') || {}).dataset ? $('#lg-go').dataset.key : '');
      meta = it ? { key: it.key, cat: answerCat(it), src: 'lesson', context: 'Lesson: ' + displayTitle(it), topic: trunc(displayTitle(it).split(':')[0], 60) } : { key: null, cat: 'fit', src: 'lesson', context: 'lesson' };
      meta.qid = pick ? pick.qid : '';
      if (pick && /^Brain teaser/.test(pick.label)) { meta.cat = 'teaser'; meta.context += ' (brain teaser)'; }
    } else {
      q = S.drillQ ? S.drillQ.text : '';
      meta = { key: null, cat: S.drillQ ? S.drillQ.cat : 'fit', src: 'drill', context: 'Practice drill (' + (S.drillQ ? E.CATS[S.drillQ.cat].name : 'mixed') + ')', qid: S.drillQ ? S.drillQ.qid || '' : '', topic: trunc(q, 60) };
    }
    const a = (($('#' + scope + '-a') || {}).value || '').trim();
    return { q, a, meta };
  }
  function logAnswer(rec) {
    S.answers.push(rec);
    if (S.answers.length > 400) S.answers.splice(0, S.answers.length - 400);
    if (rec.key && (rec.src === 'lesson' || rec.src === 'self') && !S.done[rec.key]) S.done[rec.key] = todayISO();
    save();
  }
  async function doGrade(scope) {
    const out = $('#' + scope + '-out'), btn = $('#' + scope + '-go');
    if (!out || !btn) return;
    const { q, a, meta } = gradeInputs(scope);
    if (!q) { out.innerHTML = '<p class="note bad">Pick or type the question you\'re answering.</p>'; return; }
    if (!a) { out.innerHTML = '<p class="note bad">Write or dictate your answer first.</p>'; $('#' + scope + '-a').focus(); return; }
    const prompt = P.grade(prof(), ctx(), q, a, meta.context);
    const sample = await getSample();
    if (!sample) { openCopy(P.handoffGrade(prof(), q, a, meta.context), "Claude isn't available in this view. Copy this, open Claude, and paste it into a new chat.", 'Copy, then open Claude', CLAUDE_NEW); return; }
    const ctl = new AbortController(); gradeCtl[scope] = ctl;
    btn.disabled = true;
    out.innerHTML = '<div class="btn-row">' + thinking('Grading. This can take up to a minute.') + '<button class="btn small" data-act="grade-stop" data-scope="' + scope + '">Stop</button></div>';
    try {
      const g = cleanGrade(await sample.json(prompt, { modelTier: 'default', signal: ctl.signal }));
      const rec = Object.assign({ id: uid(), at: Date.now(), date: todayISO(), key: meta.key, cat: meta.cat, src: meta.src, q, qid: meta.qid || '', a: a.slice(0, 2000) }, g, voiceStats[scope] ? { voice: voiceStats[scope] } : {});
      logAnswer(rec);
      const o = $('#' + scope + '-out'); if (o) o.innerHTML = resultHTML(rec, scope);
      if (scope === 'lg') { const df = $$('[data-act="done"]'); df.forEach(b => { b.textContent = 'Undo done'; }); }
    } catch (e) {
      const o = $('#' + scope + '-out');
      if (o) o.innerHTML = (e && e.code === 'cancelled') ? '' : '<p class="note bad">' + esc(aiError(e)) + '</p>';
    } finally {
      if (btn.isConnected) btn.disabled = false;
      gradeCtl[scope] = null;
    }
  }
  function resultHTML(r, scope) {
    const rv = reviewFor(r.q);
    return '<div class="result"><div class="result-top">' + scoreBadge(r.score) + '<div><span class="verdict-l">' + SCORE_WORD[r.score] + ' · ' + r.score + '/5</span><p class="verdict">' + esc(r.verdict) + '</p></div></div>' +
      (r.voice ? voiceVerdictHTML(r.voice, false) : '') +
      '<div class="cols"><div><h3>What worked</h3>' + (r.strengths.length ? '<ul>' + r.strengths.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>' : '<p class="note">Not much yet. Start with the fixes.</p>') + '</div>' +
      '<div><h3>Fix next</h3>' + (r.fixes.length ? '<ol>' + r.fixes.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' : '<p class="note">Nothing major.</p>') + '</div></div>' +
      (r.better ? '<div><h3 class="mini-h">A stronger answer</h3><p class="better">' + esc(r.better) + '</p></div>' : '') +
      (rv ? '<p class="hint">This one comes back for review ' + dueWords(rv.due) + '.</p>' : '') +
      (r.followUp ? '<div class="followup"><span>Follow-up they\'d ask: <q>' + esc(r.followUp) + '</q></span><button class="btn small" data-act="followup" data-scope="' + scope + '" data-q="' + esc(r.followUp) + '">Answer the follow-up</button></div>' : '') + '</div>';
  }
  function selfCheck(scope) {
    const out = $('#' + scope + '-out');
    if (!out) return;
    if (recScope === scope) recStop();
    const { q, a, meta } = gradeInputs(scope);
    if (!q) { out.innerHTML = '<p class="note bad">Pick or type the question you\'re answering.</p>'; return; }
    if (!a) { out.innerHTML = '<p class="note bad">Answer first: record it, type it, or jot down the key points.</p>'; const t = $('#' + scope + '-a'); if (t) t.focus(); return; }
    const m = modelByQid(meta.qid);
    selfPending[scope] = { q, a, meta, model: m.model, followUp: m.followUp, voice: voiceStats[scope] || null };
    out.innerHTML = selfCheckHTML(scope);
  }
  function scorePickHTML(act, attrs, chosen) {
    return '<div class="score-pick" role="group" aria-label="Your score">' + [1, 2, 3, 4, 5].map(n => '<button type="button" class="pick ' + scoreCls(n) + '" data-act="' + act + '"' + attrs + ' data-n="' + n + '" aria-pressed="' + (chosen === n) + '">' + n + '</button>').join('') + '</div>';
  }
  const RUBRIC_TXT = '5 would clearly pass a first round. 4 is right with small gaps. 3 is partly right or rambling. 2 misses the core idea. 1 is wrong or blank.';
  function selfCheckHTML(scope) {
    const s = selfPending[scope];
    const model = s.model ? '<div><h3 class="mini-h">Model answer</h3><div class="better">' + mdBlocks(s.model) + '</div></div>'
      : '<p class="note">There\'s no written answer for this one. Score yourself against the lesson' + (aiReady() ? ', or use Grade my answer.' : ', or get it graded in Claude.') + '</p>';
    return '<div class="result self">' + model + (s.voice ? voiceVerdictHTML(s.voice, false) : '') +
      '<div class="rubric"><h3 class="mini-h">Score yourself</h3><p class="note">' + RUBRIC_TXT + '</p>' + scorePickHTML('self-score', ' data-scope="' + scope + '"', 0) +
      '<p class="hint">Anything you score 3 or lower comes back for review tomorrow.</p></div></div>';
  }
  function selfScore(scope, n) {
    const s = selfPending[scope];
    if (!s || !(n >= 1 && n <= 5)) return;
    logAnswer({ id: uid(), at: Date.now(), date: todayISO(), key: s.meta.key, cat: s.meta.cat, src: s.meta.src === 'lesson' ? 'self' : 'self-drill', q: s.q, qid: s.meta.qid || '', a: s.a.slice(0, 2000), score: n,
      verdict: 'Scored yourself against the model answer.', strengths: [], fixes: [], better: s.model || '', followUp: s.followUp || '', topic: s.meta.topic || trunc(s.q, 60), voice: s.voice || undefined });
    delete selfPending[scope];
    voiceStats[scope] = null;
    const rv = reviewFor(s.q);
    const o = $('#' + scope + '-out');
    if (o) o.innerHTML = '<div class="result logged"><div class="result-top">' + scoreBadge(n) + '<div><span class="verdict-l">Logged · ' + SCORE_WORD[n] + '</span><p class="verdict">' +
      (rv ? 'This one comes back for review ' + dueWords(rv.due) + '.' : n >= 4 ? 'It won\'t come back unless you miss it later.' : 'Logged.') + '</p></div></div>' +
      (s.model ? '<details><summary>Model answer</summary><div class="better">' + mdBlocks(s.model) + '</div></details>' : '') +
      (s.followUp ? '<div class="followup"><span>Interviewers often follow up with: <q>' + esc(s.followUp) + '</q></span><button class="btn small" data-act="followup" data-scope="' + scope + '" data-q="' + esc(s.followUp) + '">Answer the follow-up</button></div>' : '') + '</div>';
    const vs = $('#' + scope + '-vs'); if (vs) vs.innerHTML = '';
    if (scope === 'lg') $$('[data-act="done"]').forEach(b => { b.textContent = 'Undo done'; });
  }

  /* =========================== Plan =========================== */
  let planExpanded = false;
  /* calendar reminders: a downloaded .ics (website only; the Claude viewer can't save .ics files) */
  let calInfo = null;
  function fmtTime(hhmm) {
    const [h, m] = String(hhmm || '09:30').split(':').map(Number);
    return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' AM' : ' PM');
  }
  function downloadText(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function exportCalendar() {
    const plan = getPlan();
    if (!plan) return;
    const p = prof(), base = appURL();
    const r = Calendar.buildICS(plan, { time: p.remindAt, minutes: p.minutes, from: todayISO(), link: d => base + '#d-' + d, name: 'Recruiting coach' });
    downloadText('recruiting-plan.ics', r.text, 'text/calendar;charset=utf-8');
    calInfo = { sessions: r.sessions, dates: r.dates, time: p.remindAt };
    if (S.ui.tab !== 'plan') { S.ui.tab = 'plan'; save(); }
    render();
  }
  function calInfoHTML() {
    if (!calInfo) return '';
    return '<div class="cal-info"><div class="btn-row" style="justify-content:space-between"><b>Downloaded recruiting-plan.ics</b><button class="btn small ghost" data-act="cal-close">Close</button></div>' +
      '<p class="note">' + calInfo.sessions + ' sessions at ' + fmtTime(calInfo.time) + ', each with a reminder, plus ' + calInfo.dates + ' key date' + (calInfo.dates === 1 ? '' : 's') + '. Each event links back to that day\'s session.</p>' +
      '<ul><li><b>iPhone or Mac:</b> open the file and choose Add All.</li><li><b>Google Calendar:</b> on a computer, open Settings, then Import &amp; export, then Import. Pick the file and a calendar.</li>' +
      '<li>Import it into a new calendar named "Recruiting coach" so you can remove it in one step. If your plan changes, delete that calendar and import a fresh file.</li></ul>' +
      '<p class="hint">Change the reminder time in Setup, under Routine.</p></div>';
  }
  function phaseBarHTML(plan, compact) {
    const span = Math.max(1, E.daysBetween(plan.start, plan.end) + 1);
    const starts = plan.phases.map(ph => E.daysBetween(plan.start, ph.from));
    const segs = plan.phases.map((ph, i) => {
      const w = (i < plan.phases.length - 1 ? starts[i + 1] : span) - starts[i];
      return '<div class="seg ph-' + ph.n + '" style="flex:' + Math.max(1, w) + ' 1 0"></div>';
    }).join('');
    const pos = iso => Math.min(100, Math.max(0, E.daysBetween(plan.start, iso) / Math.max(1, span - 1) * 100));
    const ticks = plan.events.map(e => '<span class="tick' + (e.est ? ' est' : '') + '" style="left:' + pos(e.date).toFixed(2) + '%" data-tip="' + esc(e.name + ' · ' + short(e.date) + (e.est ? ' (estimate)' : '')) + '"></span>').join('');
    const t = todayISO();
    const now = t >= plan.start && t <= plan.end ? '<span class="nowline" style="left:' + pos(t).toFixed(2) + '%"></span>' : '';
    const legend = '<ul class="phase-legend">' + plan.phases.map(ph => '<li><span class="sw ph-' + ph.n + '"></span><b>' + esc(ph.name) + '</b><span class="r">' + short(ph.from) + ' – ' + short(ph.to) + '</span></li>').join('') + '</ul>';
    const keys = '<div class="btn-row" style="gap:14px;margin:8px 0 2px">' + (now ? '<span class="tick-key"><i class="now"></i>Today</span>' : '') + (plan.events.length ? '<span class="tick-key"><i></i>Your dates</span>' : '') + (plan.events.some(e => e.est) ? '<span class="tick-key"><i class="est"></i>Estimated dates</span>' : '') + '</div>';
    return '<div class="phasebar-wrap" role="img" aria-label="' + esc(plan.phases.map(ph => ph.name + ' from ' + short(ph.from) + ' to ' + short(ph.to)).join('; ')) + '"><div class="phasebar-outer"><div class="phasebar">' + segs + '</div>' + now + '</div><div class="ticks">' + ticks + '</div>' + (compact ? '' : keys) + legend + '</div>';
  }
  function rowHTML(it, t) {
    const cls = (it.date === t ? 'is-today ' : '') + (S.done[it.key] ? 'is-done' : '');
    const st = S.done[it.key] ? '<span class="st-done">✓ done</span>' : it.date < t ? '<span class="st-miss">missed</span>' : it.date === t ? 'today' : '';
    const sub = it.event ? '<small>for ' + esc(it.event.name) + ' · ' + short(it.event.date) + '</small>' : '';
    return '<li class="' + cls + '"><button class="row" data-act="open" data-key="' + esc(it.key) + '"><span class="d">' + esc(dshort(it.date)) + '</span><span class="c">' + chip(it.cat) + '</span><span class="t">' + esc(displayTitle(it)) + sub + '</span><span class="s">' + st + '</span></button></li>';
  }
  function markerHTML(e) {
    return '<li class="marker"><div class="row"><span class="d">' + esc(dshort(e.date)) + '</span><span class="c"><span class="chip input">DATE</span></span><span class="t">' + esc(e.name) + ' <span class="note" style="font-weight:400">· ' + esc(E.EVENT_TYPES[e.type]) + (e.est ? ' · estimate' : '') + '</span></span><span class="s"></span></div></li>';
  }
  function viewPlan() {
    const plan = getPlan(), t = todayISO(), c = plan.counts;
    const weeks = [];
    plan.items.forEach(it => { const w = E.weekOf(plan, it); (weeks[w] = weeks[w] || []).push(it); });
    const evW = {};
    plan.events.forEach(e => { const w = Math.floor(E.daysBetween(plan.start, e.date) / 7); (evW[w] = evW[w] || []).push(e); });
    const ref = E.itemOn(plan, t) || E.nextItem(plan, t) || plan.items[plan.items.length - 1];
    const curW = E.weekOf(plan, ref);
    let html = '';
    weeks.forEach((items, w) => {
      if (!items) return;
      const ws = E.iso(E.addDays(E.parseISO(plan.start), w * 7)), we = E.iso(E.addDays(E.parseISO(plan.start), w * 7 + 6));
      const doneN = items.filter(i => S.done[i.key]).length;
      const open = planExpanded || (w >= curW && w <= curW + 1);
      const rows = [];
      const evs = (evW[w] || []).slice();
      items.forEach(it => {
        while (evs.length && evs[0].date < it.date) rows.push(markerHTML(evs.shift()));
        rows.push(rowHTML(it, t));
        while (evs.length && evs[0].date === it.date) rows.push(markerHTML(evs.shift()));
      });
      evs.forEach(e => rows.push(markerHTML(e)));
      html += '<details class="week"' + (open ? ' open' : '') + '><summary><span class="wk-n">Week ' + (w + 1) + '</span><span class="wk-r">' + short(ws) + ' – ' + short(we) + '</span>' + (w === curW ? '<span class="wk-now">THIS WEEK</span>' : '') + '<span class="wk-m">' + doneN + '/' + items.length + ' done</span></summary><ol class="days">' + rows.join('') + '</ol></details>';
    });
    const sum = '<span><b>' + plan.total + '</b> study days</span><span><b>' + c.lesson + '</b> lessons</span><span><b>' + c.drill + '</b> drills</span><span><b>' + c.mock + '</b> mock interviews</span>' + (c.prep ? '<span><b>' + c.prep + '</b> prep sessions</span>' : '') + (c.firm ? '<span><b>' + c.firm + '</b> firm deep-dives</span>' : '') + (c.rev ? '<span><b>' + c.rev + '</b> rewinds</span>' : '');
    $('#main').innerHTML = '<div class="plan-head"><div><p class="eyebrow">Interview-ready by ' + esc(E.fmt(plan.ready, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) + '</p><h1 class="h-page">Your plan</h1><div class="plan-sum">' + sum + '</div></div>' +
      '<div class="btn-row">' + (IN_CLAUDE ? '' : '<button class="btn primary" data-act="cal">Add to calendar</button>') + '<button class="btn" data-act="plan-expand">' + (planExpanded ? 'Collapse weeks' : 'Expand all weeks') + '</button><button class="btn" data-act="plan-copy">Copy plan as text</button></div></div>' +
      calInfoHTML() + phaseBarHTML(plan) + '<p class="note" style="margin:0 0 14px">' + plan.phases.map(ph => '<b>' + esc(ph.name) + ':</b> ' + esc(ph.blurb)).join(' ') + '</p>' + html;
  }

  /* =========================== Practice =========================== */
  let mockCtl = null, mockGrading = false, mockBusy = false;
  function drillFilters() {
    const p = prof();
    const f = [['due', 'Reviews due'], ['weak', 'Weak spots'], ['mixed', 'Mixed'], ['fit', 'Fit'], ['beh', 'Behavioral'], ['acc', 'Accounting'], ['val', 'Valuation'], ['mkt', 'Markets'], ['inv', 'Pitches']];
    if (p.seats.some(s => ['st', 'hf', 'unsure'].includes(s))) f.push(['trd', 'Trading']);
    if (p.seats.some(s => ['wm', 'am', 'unsure'].includes(s))) f.push(['awm', 'Wealth & AM']);
    f.push(['teaser', 'Brain teasers']);
    return f;
  }
  function drillPool(filter) {
    const p = prof();
    const cat = c => (E.CATS[c] ? c : 'fit');
    if (filter === 'due') return dueReviews().map(r => ({ id: 'r-' + E.slug(r.q).slice(0, 30), qid: r.qid || '', cat: cat(r.cat), text: r.q }));
    if (filter === 'weak') return weakSpots().map(w => ({ id: 'w-' + E.slug(w.q).slice(0, 30), qid: w.qid || '', cat: cat(w.cat), text: w.q }));
    return E.questionsFor(p, filter === 'mixed' ? null : filter).map(q => ({ id: q.id, qid: q.id, cat: q.cat, text: q.text }));
  }
  function nextDrillQ() {
    const pool = drillPool(S.ui.drill);
    if (!pool.length) { S.drillQ = { none: true, filter: S.ui.drill }; save(); return; }
    const recent = new Set(S.recentQ || []);
    const curId = S.drillQ && S.drillQ.id;
    let src = S.ui.drill === 'due' ? pool.filter(q => q.id !== curId) : pool.filter(q => !recent.has(q.id) && q.id !== curId);
    if (!src.length) src = pool.filter(q => q.id !== curId);
    if (!src.length) src = pool;
    const pick = S.ui.drill === 'due' ? src[0] : src[Math.floor(Math.random() * src.length)];
    S.drillQ = { id: pick.id, qid: pick.qid || '', cat: pick.cat, text: E.fillQuestion(pick.text, prof()), filter: S.ui.drill };
    S.recentQ = [pick.id].concat((S.recentQ || []).filter(x => x !== pick.id)).slice(0, 12);
    drafts.dg = '';
    voiceStats.dg = null;
    save();
  }
  function viewPractice() {
    const mode = S.ui.practice;
    if (mode === 'drill' && (!S.drillQ || S.drillQ.filter !== S.ui.drill || S.drillQ.none)) nextDrillQ();
    $('#main').innerHTML = '<div class="prac"><div><h1 class="h-page">Practice</h1><p class="lede">' + (voiceOK ? 'Record your answer out loud, or type it.' : 'Answer out loud or in writing; tap the mic on your keyboard to dictate.') + ' ' +
      (aiReady() ? 'Claude scores it the way a first-round interviewer would, or you can check it against the model answer yourself.' : 'Then check it against the model answer and score yourself, or get it graded in Claude.') + '</p></div>' +
      '<div class="ai-slot">' + aiNotice() + '</div>' +
      '<div class="seg-ctl" role="group" aria-label="Practice mode"><button data-act="pmode" data-mode="drill" aria-pressed="' + (mode === 'drill') + '">Quick drill</button><button data-act="pmode" data-mode="mock" aria-pressed="' + (mode === 'mock') + '">Mock interview</button></div>' +
      '<div id="pbody">' + (mode === 'drill' ? drillHTML() : mockHTML()) + '</div></div>';
  }
  function drillHTML() {
    const weakN = weakSpots().length, dueN = dueReviews().length, q = S.drillQ;
    const count = k => k === 'weak' && weakN ? '<span class="n">' + weakN + '</span>' : k === 'due' && dueN ? '<span class="n">' + dueN + '</span>' : '';
    const chips = drillFilters().map(([k, l]) => '<button class="fchip" data-act="dfilter" data-f="' + k + '" aria-pressed="' + (S.ui.drill === k) + '">' + l + count(k) + '</button>').join('');
    if (!q || q.none) {
      const next = reviews()[0];
      const msg = S.ui.drill === 'due' ? ['Nothing due right now', next ? 'Your next review is ' + dueWords(next.due) + '. Anything you score 3 or lower comes back the next day, then after 3, 7 and 14 days.' : 'Anything you score 3 or lower comes back the next day, then after 3, 7 and 14 days.']
        : S.ui.drill === 'weak' ? ['No weak spots yet', 'Any answer that scores 3 or lower lands here so you can take another swing at it.'] : ['Nothing here yet', 'Pick another category.'];
      return '<div class="filters" role="group" aria-label="Question type">' + chips + '</div><div class="empty"><h2>' + msg[0] + '</h2><p>' + msg[1] + '</p></div>';
    }
    const due = S.ui.drill === 'due' ? '<span class="note">Review ' + (dueN ? '1 of ' + dueN : '') + '</span>' : '';
    return '<div class="filters" role="group" aria-label="Question type">' + chips + '</div><div class="prac">' +
      '<div class="qcard"><div class="qmeta"><span class="btn-row">' + chip(q.cat) + due + '</span><button class="btn small" data-act="dnext">' + (S.ui.drill === 'due' ? 'Skip for now' : 'New question') + '</button></div><p class="qtext">' + esc(q.text) + '</p><div class="btn-row">' + timerHTML('dg') + recBtnHTML('dg') + '</div></div>' +
      answerFieldHTML('dg', voiceOK ? VOICE_NOTE : '', drafts.dg || '') +
      '<div class="btn-row">' + gradeButtons('dg', '') + '</div><div id="dg-out" aria-live="polite"></div></div>';
  }

  /* ---------- mock interviews: five questions, each with a follow-up, scored at the end ---------- */
  function mockHTML() {
    if (mockGrading) return '<div class="qcard"><div class="btn-row">' + thinking('Grading your interview. This can take a minute or two.') + '<button class="btn small" data-act="mock-stop">Stop</button></div></div>';
    if (S.ui.mockView) { const m = S.mocks.find(x => x.id === S.ui.mockView); if (m && m.result) return mockResultHTML(m); }
    const A = S.mockActive;
    if (A && A.review) return mockReviewHTML(A);
    if (A) {
      const q = A.qs[A.i], fu = A.stage === 'fu' ? A.fus[A.i] : null;
      const prog = A.qs.map((_, j) => '<i class="' + (j === A.i ? 'on' : (A.answers[j] || '').trim() ? 'done' : '') + '"></i>').join('');
      const val = fu ? fu.a || '' : A.answers[A.i] || '';
      const nextBtn = mockBusy ? thinking('The interviewer is thinking…')
        : '<button class="btn primary" data-act="mock-next">' + (fu ? (A.i === A.qs.length - 1 ? 'Finish' : 'Next question') : 'Next') + '</button>' + (fu ? '<button class="btn ghost" data-act="mock-skipfu">Skip the follow-up</button>' : '');
      return '<div class="prac"><div class="qcard"><div class="qmeta"><span class="eyebrow">Question ' + (A.i + 1) + ' of ' + A.qs.length + (fu ? ' · follow-up' : '') + '</span><div class="mock-prog" aria-hidden="true">' + prog + '</div></div>' +
        (fu ? '<p class="prev-q">' + esc(q.text) + '</p><div><span class="chip input">FOLLOW-UP</span></div><p class="qtext">' + esc(fu.q) + '</p>'
          : '<div>' + chip(q.cat) + '</div><p class="qtext">' + esc(q.text) + '</p>') +
        '<div class="btn-row">' + timerHTML('mk') + recBtnHTML('mk') + '</div></div>' +
        answerFieldHTML('mk', '', val, 'Answer the way you would out loud. Feedback comes at the end.') +
        '<div class="btn-row">' + (A.i > 0 || fu ? '<button class="btn" data-act="mock-prev">Back</button>' : '') + nextBtn +
        '<button class="btn ghost" data-act="mock-quit">Quit this mock</button></div><div id="mk-out" aria-live="polite"></div></div>';
    }
    const hist = S.mocks.filter(m => m.result).slice(-8).reverse();
    const how = aiReady() ? 'After each answer the interviewer asks a follow-up that reacts to what you said. No feedback until you finish, then every answer gets a score and a stronger version.'
      : 'Each question comes with the follow-up interviewers usually ask. At the end you compare your answers with model answers and score yourself. Want an interviewer who reacts to what you actually say? Run it live in Claude.';
    return '<div class="prac"><div class="qcard"><h2 style="font-size:19px">Mock interview</h2><p class="note" style="font-size:15px">Five questions, the way a first round for ' + esc(E.SEATS[prof().primary].phrase) + ' usually runs: a fit question, a behavioral, two technicals and a closer.' + (weakCats().length ? ' One technical comes from your weakest area.' : '') + ' ' + how + '</p>' +
      '<div class="btn-row"><button class="btn primary" data-act="mock-start">Start a mock interview</button>' + handoffBtn('mock', 'Run it live in Claude') + '</div></div>' +
      (hist.length ? '<div><h2 class="eyebrow" style="margin-bottom:6px">Past mocks</h2><ul class="mock-list">' + hist.map(m => '<li><span>' + short(m.date) + ' · ' + esc(trunc(m.result.headline, 90)) + '</span><span class="btn-row" style="flex-wrap:nowrap">' + scoreBadge(m.result.overall, true) + '<button class="btn small" data-act="mock-view" data-id="' + esc(m.id) + '">Open</button></span></li>').join('') + '</ul></div>' : '') + '</div>';
  }
  function mockModel(q) { const b = E.questionById(q.id); return b ? b.answer || '' : ''; }
  function mockReviewHTML(A) {
    const scored = A.qs.every((_, i) => !(A.answers[i] || '').trim() || A.scores[i] >= 1);
    return '<div class="prac"><div><h2 class="h-sub">Score your mock</h2><p class="note">Be the interviewer: compare each answer with the model answer, then score it. ' + RUBRIC_TXT + '</p></div>' +
      A.qs.map((q, i) => {
        const ans = (A.answers[i] || '').trim(), fu = A.fus[i], model = mockModel(q);
        return '<div class="mq"><div class="mq-q">' + (i + 1) + '. ' + esc(q.text) + '</div>' +
          '<div class="mq-a"><b>Your answer</b><p>' + esc(ans || '(no answer)') + '</p>' + (fu ? '<b>Follow-up: ' + esc(fu.q) + '</b><p>' + esc((fu.a || '').trim() || '(no answer)') + '</p>' : '') + '</div>' +
          (model ? '<details><summary>Model answer</summary><div class="better">' + mdBlocks(model) + '</div></details>' : '') +
          (ans ? scorePickHTML('mock-self', ' data-i="' + i + '"', A.scores[i] || 0) : '<p class="note">Unanswered questions score 1.</p>') + '</div>';
      }).join('') +
      '<div class="btn-row"><button class="btn primary" data-act="mock-save"' + (scored ? '' : ' disabled') + '>Save my scores</button><button class="btn ghost" data-act="mock-quit">Discard this mock</button></div>' +
      (scored ? '' : '<p class="hint">Score every answered question to save.</p>') + '</div>';
  }
  function mockResultHTML(m) {
    const r = m.result, fus = m.fus || [];
    return '<div class="prac"><div class="result"><div class="result-top">' + scoreBadge(r.overall) + '<div><span class="verdict-l">' + short(m.date) + ' · mock interview · ' + (r.self ? 'self-scored' : SCORE_WORD[r.overall]) + '</span><p class="verdict">' + esc(r.headline) + '</p><p class="advance ' + (r.advance ? 't-hi' : 't-lo') + '">' + (r.advance ? '✓ Would advance to the next round' : "✕ Wouldn't advance yet") + '</p></div></div>' +
      (r.next.length ? '<div><h3 class="mini-h">Work on this week</h3><ol style="margin:0;padding-left:1.2em">' + r.next.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></div>' : '') +
      m.qs.map((q, i) => {
        const it = r.items[i];
        return '<div class="mq"><div class="mq-h">' + scoreBadge(it.score, true) + '<div><div class="mq-q">' + esc(q.text) + '</div>' + (it.feedback ? '<p class="note">' + esc(it.feedback) + '</p>' : '') + '</div></div>' +
          '<details><summary>Your answer and a stronger one</summary><p>' + esc(m.answers[i] || '(no answer)') + '</p>' + (fus[i] ? '<p class="note"><b>Follow-up:</b> ' + esc(fus[i].q) + '</p><p>' + esc((fus[i].a || '').trim() || '(no answer)') + '</p>' : '') +
          (it.better ? '<div class="better" style="margin-top:8px">' + mdBlocks(it.better) + '</div>' : '') + '</details></div>';
      }).join('') +
      '<div class="btn-row"><button class="btn primary" data-act="mock-start">Run another mock</button><button class="btn" data-act="mock-close">Done</button></div></div></div>';
  }
  function captureMock() {
    const A = S.mockActive, ta = $('#mk-a');
    if (!A || !ta || A.review) return;
    if (A.stage === 'fu' && A.fus[A.i]) A.fus[A.i].a = ta.value;
    else A.answers[A.i] = ta.value;
  }
  function mockStart(key) {
    timerStop();
    if (S.mockActive && (!key || S.mockActive.key === key)) { S.ui.tab = 'practice'; S.ui.practice = 'mock'; S.ui.mockView = null; save(); render(); return; }
    const avoid = [].concat.apply([], S.mocks.slice(-3).map(m => m.qs.map(q => q.id)));
    const qs = E.pickMock(prof(), uid(), avoid, weakCats());
    S.mockActive = { id: uid(), key: key || null, qs, answers: qs.map(() => ''), fus: qs.map(() => null), scores: qs.map(() => 0), i: 0, stage: 'main', review: false, date: todayISO() };
    S.ui.tab = 'practice'; S.ui.practice = 'mock'; S.ui.mockView = null;
    save(); render(); window.scrollTo(0, 0);
  }
  async function genFollowUp(A, i) {
    const written = E.questionById(A.qs[i].id);
    const fallback = written && written.followUp ? written.followUp : null;
    const sample = await getSample();
    if (!sample) return fallback;
    try {
      const r = await sample.json(P.followUp(prof(), A.qs[i].text, A.answers[i]), { modelTier: 'quick' });
      const f = r && typeof r.followUp === 'string' ? r.followUp.trim() : '';
      return f.length > 8 ? trunc(f, 300) : fallback;
    } catch (e) {
      if (e && HARD_OFF.includes(e.code)) aiError(e);
      return fallback;
    }
  }
  function mockAdvance(A) {
    if (A.i >= A.qs.length - 1) { A.stage = 'main'; save(); mockFinish(); return; }
    A.i++; A.stage = 'main'; save(); render();
  }
  async function mockNext() {
    const A = S.mockActive;
    if (!A || mockBusy) return;
    captureMock(); timerStop(); if (recScope === 'mk') recStop();
    voiceStats.mk = null;
    if (A.stage === 'main' && (A.answers[A.i] || '').trim()) {
      if (!A.fus[A.i]) {
        let fq;
        if (aiReady()) { mockBusy = true; render(); fq = await genFollowUp(A, A.i); mockBusy = false; }
        else { const w = E.questionById(A.qs[A.i].id); fq = w && w.followUp ? w.followUp : null; }
        if (S.mockActive !== A) return;                     // quit while the interviewer was thinking
        if (fq) A.fus[A.i] = { q: fq, a: '' };
      }
      if (A.fus[A.i]) { A.stage = 'fu'; save(); render(); return; }
    }
    mockAdvance(A);
  }
  function mockSkipFu() {
    const A = S.mockActive;
    if (!A) return;
    timerStop(); if (recScope === 'mk') recStop();
    A.fus[A.i] = null;
    mockAdvance(A);
  }
  function mockPrev() {
    const A = S.mockActive;
    if (!A) return;
    captureMock(); timerStop();
    if (A.stage === 'fu') A.stage = 'main';
    else if (A.i > 0) { A.i--; A.stage = A.fus[A.i] ? 'fu' : 'main'; }
    save(); render();
  }
  function cleanMock(r, n) {
    if (!r || typeof r !== 'object') throw { code: 'invalid_json' };
    const sc = v => { const s = Math.round(Number(v)); return s >= 1 && s <= 5 ? s : null; };
    const items = (Array.isArray(r.items) ? r.items : []).slice(0, n).map(x => ({ score: sc(x && x.score) || 1, feedback: String((x && x.feedback) || '').trim(), better: String((x && x.better) || '').trim(), topic: trunc(String((x && x.topic) || '').trim(), 60) }));
    if (!items.length) throw { code: 'invalid_json' };
    while (items.length < n) items.push({ score: 1, feedback: 'No feedback came back for this one.', better: '', topic: '' });
    const overall = sc(r.overall) || Math.round(items.reduce((s, x) => s + x.score, 0) / n);
    return { overall, advance: !!r.advance, headline: String(r.headline || '').trim() || 'Mock graded.', items, next: (Array.isArray(r.next) ? r.next : []).map(x => String(x).trim()).filter(Boolean).slice(0, 4) };
  }
  function saveMock(A, res, src) {
    const m = { id: A.id, key: A.key, date: todayISO(), at: Date.now(), qs: A.qs, answers: A.answers.slice(), fus: A.fus.slice(), result: res };
    S.mocks.push(m); if (S.mocks.length > 60) S.mocks.shift();
    A.qs.forEach((q, i) => {
      const it = res.items[i];
      if (!(A.answers[i] || '').trim()) return;
      S.answers.push({ id: uid(), at: Date.now() + i, date: todayISO(), key: A.key, cat: q.cat, src, q: q.text, qid: q.id, a: A.answers[i].slice(0, 2000), score: it.score, verdict: it.feedback, strengths: [], fixes: it.feedback ? [it.feedback] : [], better: it.better, followUp: A.fus[i] ? A.fus[i].q : '', topic: it.topic || trunc(q.text, 60) });
    });
    if (S.answers.length > 400) S.answers.splice(0, S.answers.length - 400);
    if (A.key && !S.done[A.key]) S.done[A.key] = todayISO();
    S.mockActive = null; S.ui.mockView = m.id;
  }
  async function mockFinish() {
    const A = S.mockActive; if (!A) return;
    captureMock();
    if (!A.answers.some(a => (a || '').trim())) { A.i = 0; A.stage = 'main'; save(); render(); const o = $('#mk-out'); if (o) o.innerHTML = '<p class="note bad">Answer at least one question first.</p>'; return; }
    timerStop();
    if (!aiReady()) { A.review = true; save(); render(); window.scrollTo(0, 0); return; }     // score it yourself
    const prompt = P.mockGrade(prof(), ctx(), A.qs, A.answers, A.fus);
    const sample = await getSample();
    if (!sample) { A.review = true; save(); render(); return; }
    mockCtl = new AbortController(); mockGrading = true; save(); render();
    let err = '';
    try { saveMock(A, cleanMock(await sample.json(prompt, { signal: mockCtl.signal, modelTier: 'default' }), A.qs.length), 'mock'); }
    catch (e) { err = (e && e.code === 'cancelled') ? '' : aiError(e); }
    finally {
      mockGrading = false; mockCtl = null; save();
      if (S.ui.tab === 'practice') { render(); if (err) { const o = $('#mk-out'); if (o) o.innerHTML = '<p class="note bad">' + esc(err) + ' Your answers are saved: press Next to try again.</p>'; } }
    }
  }
  function mockSaveSelf() {
    const A = S.mockActive;
    if (!A || !A.review) return;
    const items = A.qs.map((q, i) => ({ score: (A.answers[i] || '').trim() ? A.scores[i] : 1, feedback: '', better: mockModel(q), topic: trunc(q.text, 60) }));
    if (items.some(x => !(x.score >= 1))) return;
    const avg = items.reduce((s, x) => s + x.score, 0) / items.length;
    saveMock(A, { overall: Math.round(avg), advance: avg >= 3.5, headline: 'You scored yourself ' + avg.toFixed(1) + ' on average.', items, next: [], self: true }, 'mock-self');
    save(); render(); window.scrollTo(0, 0);
  }

  /* =========================== Scorecard =========================== */
  let chartRO = null;
  function viewScorecard() {
    const plan = getPlan(), t = todayISO(), A = S.answers;
    const due = plan.items.filter(i => i.date <= t).length;
    const doneN = plan.items.filter(i => S.done[i.key] && i.date <= t).length;
    const last20 = A.slice(-20);
    const avg = last20.length ? last20.reduce((s, a) => s + a.score, 0) / last20.length : null;
    const mocks = S.mocks.filter(m => m.result);
    const tiles = '<div class="tiles">' +
      '<div class="tile"><div class="l">Sessions done</div><div class="v">' + doneN + '<small> / ' + due + '</small></div><div class="s">scheduled through today</div></div>' +
      '<div class="tile"><div class="l">Session streak</div><div class="v">' + streak(plan) + '</div><div class="s">study days in a row</div></div>' +
      '<div class="tile"><div class="l">Average score</div><div class="v">' + (avg == null ? '–' : avg.toFixed(1) + '<small> / 5</small>') + '</div><div class="s">' + (last20.length ? 'last ' + last20.length + ' graded answers' : 'no graded answers yet') + '</div></div>' +
      '<div class="tile"><div class="l">Mock interviews</div><div class="v">' + mocks.length + '</div><div class="s">' + (mocks.length ? 'latest: ' + mocks[mocks.length - 1].result.overall + '/5' : 'none yet') + '</div></div></div>';
    let body;
    if (!A.length) {
      body = '<div class="empty"><h2>No scores yet</h2><p>Answer a question under any lesson, a quick drill or a mock interview. Every graded answer lands here, and anything you score 3 or lower becomes a weak spot the coach brings back.</p><div class="btn-row"><button class="btn primary" data-act="tab" data-tab="practice">Try a quick drill</button><button class="btn" data-act="tab" data-tab="today">Go to today\'s lesson</button></div></div>';
    } else {
      const ws = weakSpots().slice(0, 8);
      const hist = A.slice().reverse().slice(0, 60);
      body = '<div class="sc-grid">' +
        '<section class="panel"><h2>Average score by area</h2><p class="sub">Last 12 answers in each area, on the 1 to 5 scale</p>' + barsHTML() + '</section>' +
        '<section class="panel"><h2>Score trend</h2><p class="sub">Your last ' + Math.min(30, A.length) + ' graded answers, oldest to newest</p><div class="chart" id="trend"></div></section>' +
        '<section class="panel"><h2>Weak spots</h2><p class="sub">Your latest answer on each of these scored 3 or lower. A 4 or 5 clears it.</p>' +
        (ws.length ? '<ul class="weak-list">' + ws.map((w, i) => '<li>' + scoreBadge(w.score, true) + '<div style="min-width:0"><b>' + esc(w.topic) + '</b><div class="wq">' + esc(trunc(w.q, 140)) + '</div>' + (rv => rv ? '<div class="due' + (rv.isDue ? ' is-due' : '') + '">Review ' + dueWords(rv.due) + '</div>' : '')(reviewFor(w.q)) + '</div><button class="btn small" data-act="retry-weak" data-i="' + i + '">Retry</button></li>').join('') + '</ul>' : '<p class="note">None right now. Nice.</p>') + '</section>' +
        '<section class="panel"><h2>History</h2><p class="sub">Every graded answer, newest first. Open one to see the feedback.</p><ul class="hist">' +
        hist.map(a => '<li><details><summary><span class="d">' + short(a.date) + '</span><span class="c">' + chip(E.CATS[a.cat] ? a.cat : 'fit') + '</span><span>' + esc(trunc(a.q, 110)) + '</span><span class="sc ' + textCls(a.score) + '">' + a.score + '/5</span></summary><div class="body"><div><b>Your answer</b><div class="a">' + esc(a.a) + '</div></div>' + (a.verdict ? '<div><b>Verdict.</b> ' + esc(a.verdict) + '</div>' : '') + (a.fixes && a.fixes.length && a.src !== 'mock' ? '<div><b>Fix next</b><ol style="margin:4px 0 0;padding-left:1.2em">' + a.fixes.map(f => '<li>' + esc(f) + '</li>').join('') + '</ol></div>' : '') + (a.better ? '<div><b>Stronger answer</b><p class="better" style="margin-top:4px">' + esc(a.better) + '</p></div>' : '') + '</div></details></li>').join('') + '</ul></section></div>';
    }
    $('#main').innerHTML = '<div><h1 class="h-page">Scorecard</h1><p class="lede">Scores use one rubric: 5 would clearly pass a first round, 3 is partly right or disorganized, 1 is wrong or blank.</p></div>' + tiles + body;
    const tr = $('#trend');
    if (tr) {
      const paint = () => { tr.innerHTML = trendSVG(tr.clientWidth); };
      paint();
      if (chartRO) chartRO.disconnect();
      if (window.ResizeObserver) { let last = tr.clientWidth; chartRO = new ResizeObserver(() => { if (Math.abs(tr.clientWidth - last) > 4) { last = tr.clientWidth; paint(); } }); chartRO.observe(tr); }
    }
  }
  function barsHTML() {
    const order = ['fit', 'beh', 'acc', 'val', 'mkt', 'inv', 'trd', 'awm', 'teaser', 'sto', 'rev', 'car', 'prep', 'firm', 'mock'];
    const st = catStats();
    const rows = order.map(c => st.find(s => s.cat === c)).filter(Boolean);
    return '<div class="bars">' + rows.map(s => {
      const weak = s.n >= 2 && s.avg < 3.5;
      const name = E.CATS[s.cat].name;
      return '<div class="bar-row" tabindex="0" data-tip="' + esc(name + ': ' + s.avg.toFixed(1) + ' average across ' + s.n + ' graded answer' + (s.n === 1 ? '' : 's')) + '"><span class="nm">' + esc(name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (s.avg / 5 * 100).toFixed(1) + '%"></div></div>' +
        '<div class="bar-val"><b>' + s.avg.toFixed(1) + '</b><span>' + s.n + ' answer' + (s.n === 1 ? '' : 's') + '</span>' + (weak ? '<span class="chip miss">⚑ Needs work</span>' : '') + '</div></div>';
    }).join('') + '</div><div class="axis5" aria-hidden="true"><span></span><div class="sc"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div></div>';
  }
  let trendPts = [];
  function trendSVG(width) {
    const pts = S.answers.slice(-30);
    trendPts = pts;
    const W = Math.max(260, Math.floor(width || 0)), H = 190, L = 26, R = 50, Tp = 12, B = 28;
    const iw = W - L - R, ih = H - Tp - B;
    const x = i => L + (pts.length === 1 ? iw / 2 : i / (pts.length - 1) * iw);
    const y = s => Tp + (5 - s) / 4 * ih;
    let g = '';
    for (let s = 1; s <= 5; s++) g += '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(s) + '" y2="' + y(s) + '"/><text class="ch-lbl" x="' + (L - 8) + '" y="' + (y(s) + 4) + '" text-anchor="end">' + s + '</text>';
    const path = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.score).toFixed(1)).join(' ');
    const dots = pts.map((p, i) => '<circle class="ch-dot" data-i="' + i + '" cx="' + x(i).toFixed(1) + '" cy="' + y(p.score).toFixed(1) + '" r="4"/>').join('');
    const lastP = pts[pts.length - 1];
    const endLbl = '<text class="ch-end" x="' + (x(pts.length - 1) + 10).toFixed(1) + '" y="' + (y(lastP.score) + 4).toFixed(1) + '">' + lastP.score + '/5</text>';
    const xl = '<text class="ch-lbl" x="' + L + '" y="' + (H - 8) + '">' + esc(short(pts[0].date)) + '</text>' + (pts.length > 1 ? '<text class="ch-lbl" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(short(lastP.date)) + '</text>' : '');
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Score trend for your last ' + pts.length + ' answers. Latest score ' + lastP.score + ' out of 5. Every score is listed in History."><g>' + g + '</g><line class="ch-x" id="ch-x" x1="0" x2="0" y1="' + Tp + '" y2="' + (H - B) + '" visibility="hidden"/>' +
      (pts.length > 1 ? '<path class="ch-line" d="' + path + '"/>' : '') + dots + endLbl + xl + '<rect class="ch-hit" x="' + L + '" y="0" width="' + iw + '" height="' + H + '" fill="transparent" data-l="' + L + '" data-iw="' + iw + '"/></svg>';
  }

  /* =========================== Ask: the coach as an agent ===========================
     The chat hands Claude a few page functions (sample `tools`), so the coach can read
     the plan and scorecard and change the plan when the student tells it something new.
     Every change it makes can be undone from the message that made it. */
  let askCtl = null, askDraft = '', askErr = '';
  let toolsOk = null;      // can this view run page tools? null until checked
  let lastUndo = null;     // { id, before, after }: the coach's most recent set of changes
  async function toolsAvailable(sample) {
    if (toolsOk === null) {
      try { const lim = await sample.limits(); toolsOk = !!(lim && lim.tools); } catch (e) { toolsOk = false; }
    }
    return toolsOk;
  }
  function setAskStatus(msg) { const el = $('#ask-status'); if (el) el.innerHTML = msg ? thinking(msg) : ''; }
  function mutateProfile(fn) {
    fn(S.profile);
    if (S.draft) fn(S.draft);      // keep unsaved Setup edits in step
    D = null;
    save();
  }
  const longDay = iso => E.fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  function coachTools(changes, signal) {
    const okDate = s => !!E.parseISO(String(s == null ? '' : s).trim());
    const stopped = () => { if (signal.aborted) throw new Error('The student stopped this reply, so nothing was changed.'); };
    const prepFor = (plan, id) => plan ? plan.items.filter(it => it.event && it.event.id === id).map(it => ({ date: it.date, session: it.title })) : [];
    const arr = x => (Array.isArray(x) ? x : x ? [x] : []).map(v => trunc(String(v).trim(), 120)).filter(Boolean).slice(0, 6);
    return [
      {
        name: 'get_schedule',
        description: "Returns the student's sessions between two dates (YYYY-MM-DD, inclusive, at most 31 days): date, kind, title, whether it's done, and the key date a session prepares for, plus the key dates in that window.",
        inputSchema: { type: 'object', properties: { from: { type: 'string', description: 'First date, YYYY-MM-DD' }, to: { type: 'string', description: 'Last date, YYYY-MM-DD' } }, required: ['from', 'to'] },
        execute(input) {
          const plan = getPlan();
          if (!plan) throw new Error('The student has no plan yet.');
          let from = String(input.from || '').trim(), to = String(input.to || '').trim();
          if (!okDate(from) || !okDate(to)) throw new Error('Dates must be YYYY-MM-DD.');
          if (to < from) { const x = from; from = to; to = x; }
          const cap = E.iso(E.addDays(E.parseISO(from), 30));
          if (to > cap) to = cap;
          setAskStatus('Checking your schedule…');
          return {
            from, to, today: todayISO(),
            sessions: plan.items.filter(it => it.date >= from && it.date <= to).map(it => ({ date: it.date, kind: it.kind, title: displayTitle(it), done: !!S.done[it.key], prepares_for: it.event ? it.event.name : undefined })),
            key_dates: plan.events.filter(e => e.date >= from && e.date <= to).map(e => ({ date: e.date, name: e.name, type: E.EVENT_TYPES[e.type] })),
          };
        },
      },
      {
        name: 'get_scores',
        description: "Returns the student's practice record: average score (1-5) by area, current weak spots, the 8 most recent graded answers with the top fix for each, and recent mock interview results.",
        execute() {
          setAskStatus('Reading your scorecard…');
          const A = S.answers, last = A.slice(-20);
          return {
            graded_answers: A.length,
            average_last_20: last.length ? +(last.reduce((s, a) => s + a.score, 0) / last.length).toFixed(2) : null,
            by_area: catStats().map(s => ({ area: E.CATS[s.cat].name, average: +s.avg.toFixed(2), answers: s.n })),
            weak_spots: weakSpots().slice(0, 8).map(w => ({ topic: w.topic, score: w.score, question: trunc(w.q, 160) })),
            recent: A.slice(-8).reverse().map(a => ({ date: a.date, area: (E.CATS[a.cat] || E.CATS.fit).name, question: trunc(a.q, 140), score: a.score, top_fix: a.fixes && a.fixes[0] ? trunc(a.fixes[0], 160) : undefined })),
            mocks: S.mocks.filter(m => m.result).slice(-3).reverse().map(m => ({ date: m.date, overall: m.result.overall, would_advance: m.result.advance, headline: trunc(m.result.headline, 160) })),
            sessions_done: Object.keys(S.done).length,
          };
        },
      },
      {
        name: 'add_key_date',
        description: "Adds a dated event to the student's plan and rebuilds the plan with prep sessions before it. Only for a real event the student told you about. Returns the event and the prep sessions now scheduled for it.",
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short name, e.g. "Investment club interview" or "Coffee chat with a Morgan Stanley analyst"' },
            date: { type: 'string', description: 'YYYY-MM-DD' },
            type: { type: 'string', enum: Object.keys(E.EVENT_TYPES), description: 'application = application deadline; interview = job or program interview; club = student club application or interview; networking = info session, coffee chat or networking event; other = anything else' },
            note: { type: 'string', description: 'Optional one-line detail the student gave' },
          },
          required: ['name', 'date', 'type'],
        },
        execute(input) {
          const name = trunc(String(input.name || '').trim(), 80), date = String(input.date || '').trim();
          const type = E.EVENT_TYPES[input.type] ? String(input.type) : 'other';
          if (!name) throw new Error('The event needs a name.');
          if (!okDate(date)) throw new Error('The date must be YYYY-MM-DD.');
          if (date < todayISO()) throw new Error('That date has already passed, so nothing was added.');
          stopped();
          const dup = (S.profile.events || []).find(e => e.date === date && String(e.name).toLowerCase() === name.toLowerCase());
          if (dup) return { already_in_plan: true, event: { name: dup.name, date: dup.date } };
          setAskStatus('Adding ' + name + ' to your plan…');
          const id = uid();
          mutateProfile(p => { p.events = (p.events || []).concat({ id, name, date, type, note: trunc(String(input.note || '').trim(), 200), est: false }); });
          changes.push('Added ' + name + ' · ' + longDay(date) + ' · ' + E.EVENT_TYPES[type]);
          const plan = getPlan();
          return { added: { name, date, type: E.EVENT_TYPES[type] }, prep_sessions: prepFor(plan, id), note: plan && date > plan.ready ? 'This falls after the interview-ready date, so the plan now runs past it.' : undefined };
        },
      },
      {
        name: 'change_key_date',
        description: "Moves or removes one of the student's existing key dates. Pass part of its name as match. Returns what changed; errors list the key dates when nothing or several match.",
        inputSchema: {
          type: 'object',
          properties: {
            match: { type: 'string', description: 'Part of the key date name, e.g. "club interview"' },
            new_date: { type: 'string', description: 'YYYY-MM-DD, to move it' },
            remove: { type: 'boolean', description: 'true to take it off the plan' },
          },
          required: ['match'],
        },
        execute(input) {
          const m = String(input.match || '').toLowerCase().trim();
          const evs = S.profile.events || [];
          const hits = m ? evs.filter(e => String(e.name || '').toLowerCase().includes(m)) : [];
          if (!hits.length) throw new Error('No key date matches "' + String(input.match || '') + '". Their key dates: ' + (evs.map(e => e.name + ' (' + e.date + ')').join('; ') || 'none') + '.');
          if (hits.length > 1) throw new Error('Several key dates match: ' + hits.map(e => e.name + ' (' + e.date + ')').join('; ') + '. Use a more specific match.');
          const ev = { id: hits[0].id, name: hits[0].name, date: hits[0].date };
          const same = e => e.name === ev.name && e.date === ev.date;
          stopped();
          if (input.remove === true) {
            setAskStatus('Removing ' + ev.name + '…');
            mutateProfile(p => { p.events = (p.events || []).filter(e => !same(e)); });
            changes.push('Removed ' + ev.name + ' (' + longDay(ev.date) + ')');
            return { removed: ev };
          }
          const nd = String(input.new_date || '').trim();
          if (!okDate(nd)) throw new Error('Pass new_date as YYYY-MM-DD, or remove: true.');
          if (nd < todayISO()) throw new Error('The new date has already passed.');
          setAskStatus('Moving ' + ev.name + '…');
          mutateProfile(p => { (p.events || []).forEach(e => { if (same(e)) { e.date = nd; e.est = false; } }); });
          changes.push('Moved ' + ev.name + ' to ' + longDay(nd));
          return { moved: { name: ev.name, from: ev.date, to: nd }, prep_sessions: prepFor(getPlan(), ev.id) };
        },
      },
      {
        name: 'set_interview_ready_date',
        description: "Changes the date the student wants to be interview-ready by; the plan's pacing and phases rebuild around it. Returns the new number of study days and the phases.",
        inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] },
        execute(input) {
          const date = String(input.date || '').trim();
          if (!okDate(date)) throw new Error('The date must be YYYY-MM-DD.');
          if (date <= todayISO()) throw new Error('The interview-ready date has to be in the future.');
          const errs = E.validate(Object.assign({}, S.profile, { readyDate: date }));
          if (errs.readyDate) throw new Error(errs.readyDate);
          stopped();
          setAskStatus('Re-pacing your plan…');
          const old = S.profile.readyDate;
          mutateProfile(p => { p.readyDate = date; });
          changes.push('Interview-ready date moved from ' + longDay(old) + ' to ' + longDay(date));
          const plan = getPlan();
          return { ready_by: date, study_days: plan ? plan.total : null, phases: plan ? plan.phases.map(ph => ({ name: ph.name, from: ph.from, to: ph.to })) : [] };
        },
      },
      {
        name: 'update_goals_and_firms',
        description: "Adds or removes the student's goals (short sentences) and target firms. Each firm gets a \"Why us?\" deep-dive near the end of the plan. Returns the updated lists.",
        inputSchema: {
          type: 'object',
          properties: {
            add_goals: { type: 'array', items: { type: 'string' } },
            remove_goals: { type: 'array', items: { type: 'string' }, description: 'Goals to remove, matched by part of their text' },
            add_firms: { type: 'array', items: { type: 'string' } },
            remove_firms: { type: 'array', items: { type: 'string' } },
          },
        },
        execute(input) {
          const ag = arr(input.add_goals), rg = arr(input.remove_goals).map(s => s.toLowerCase());
          const af = arr(input.add_firms), rf = arr(input.remove_firms).map(s => s.toLowerCase());
          if (!ag.length && !rg.length && !af.length && !rf.length) throw new Error('Nothing to change.');
          stopped();
          setAskStatus('Updating your goals and firms…');
          const lower = a => a.map(x => x.toLowerCase());
          const g0 = E.splitLines(S.profile.goals || ''), f0 = E.splitList(S.profile.firms || '');
          mutateProfile(p => {
            let goals = E.splitLines(p.goals || '').filter(g => !rg.some(r => g.toLowerCase().includes(r)));
            ag.forEach(g => { if (!lower(goals).includes(g.toLowerCase())) goals.push(g); });
            p.goals = goals.join('\n');
            let firms = E.splitList(p.firms || '').filter(f => !rf.some(r => f.toLowerCase().includes(r)));
            af.forEach(f => { if (!lower(firms).includes(f.toLowerCase())) firms.push(f); });
            p.firms = firms.join(', ');
          });
          const g1 = E.splitLines(S.profile.goals), f1 = E.splitList(S.profile.firms);
          g1.filter(g => !g0.includes(g)).forEach(g => changes.push('Goal added: ' + g));
          g0.filter(g => !g1.includes(g)).forEach(g => changes.push('Goal removed: ' + g));
          f1.filter(f => !f0.includes(f)).forEach(f => changes.push('Firm added: ' + f));
          f0.filter(f => !f1.includes(f)).forEach(f => changes.push('Firm removed: ' + f));
          return { goals: g1, firms: f1, note: f1.length > 8 ? 'Only the first 8 firms get deep-dives.' : undefined };
        },
      },
    ];
  }

  function undoBtn(m) {
    if (m.undone) return '<span class="note">Undone</span>';
    if (lastUndo && lastUndo.id === m.id && JSON.stringify(S.profile) === lastUndo.after) return '<button class="btn small" data-act="ask-undo" data-id="' + esc(m.id) + '">Undo</button>';
    return '';
  }
  function msgHTML(m) {
    if (m.role === 'user') return '<div class="msg user"><span class="who">You</span><div class="bubble">' + esc(m.content) + '</div></div>';
    const ch = m.changes && m.changes.length
      ? '<div class="changes"><div class="changes-h"><span class="chip link">PLAN UPDATED</span>' + undoBtn(m) + '</div><ul>' + m.changes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>' : '';
    return '<div class="msg coach"><span class="who">Coach</span><div class="bubble">' + (m.content ? mdBlocks(m.content) : thinking('Thinking…')) + '</div>' + ch + '</div>';
  }
  /* on the website: the question opens in a new Claude chat that already knows the plan */
  function viewAskWeb() {
    const p = prof(), seat = E.SEATS[p.primary].phrase;
    const sugs = ['What should I focus on this week?', 'How does recruiting for ' + seat + ' usually work for a ' + p.year.toLowerCase() + '?', 'Help me answer "Why ' + seat + '?"', 'How do I write a cold email to an alum?'];
    $('#main').innerHTML = '<div class="ask"><div><h1 class="h-page">Ask your coach</h1><p class="lede">Ask anything about recruiting, a concept you\'re stuck on, or a draft you want torn apart. It opens a new Claude chat that already knows your plan, your dates and your weak spots, on your own Claude account.</p></div>' +
      '<div class="ai-slot">' + aiNotice() + '</div>' +
      '<div class="sugs">' + sugs.map(s => handoffBtn('ask', s, ' data-q="' + esc(s) + '"', 'fchip')).join('') + '</div>' +
      '<div class="composer"><label class="vh" for="ask-in">Your question</label><textarea class="in" id="ask-in" placeholder="Ask anything…">' + esc(askDraft) + '</textarea>' +
      '<div class="btn-row">' + handoffBtn('ask', 'Ask in Claude', '', 'primary') + '<button class="btn ghost" data-act="ask-copy">Copy as prompt</button></div>' +
      (IN_CLAUDE ? '' : '<p class="hint">Want a coach that edits your plan from the chat? The <a href="' + AI_URL + '" target="_blank" rel="noopener">Claude version</a> can do that.</p>') + '</div></div>';
  }
  function viewAsk() {
    if (!aiReady()) return viewAskWeb();
    const p = prof(), msgs = S.chat;
    const seat = E.SEATS[p.primary].phrase;
    const sugs = ['What should I focus on this week?', 'How am I doing so far?', 'How does recruiting for ' + seat + ' usually work for a ' + p.year.toLowerCase() + '?', 'Help me answer "Why ' + seat + '?"'];
    $('#main').innerHTML = '<div class="ask"><div><h1 class="h-page">Ask your coach</h1><p class="lede">Anything about recruiting, a concept you\'re stuck on, or a draft you want torn apart. It knows your plan, your dates and your weak spots, and it can change your plan when you tell it something new.</p></div>' +
      '<div class="ai-slot">' + aiNotice() + '</div>' +
      '<div class="msgs" id="msgs">' + msgs.map(msgHTML).join('') + '</div>' +
      '<div id="ask-status" class="ask-status" aria-live="polite"></div>' +
      (askErr ? '<p class="note bad">' + esc(askErr) + '</p>' : '') +
      (msgs.length ? '' : '<div class="sugs">' + sugs.map(s => '<button class="fchip" data-act="ask-sug" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>') +
      '<div class="composer"><label class="vh" for="ask-in">Your message</label><textarea class="in" id="ask-in" placeholder="Ask anything…">' + esc(askDraft) + '</textarea><div class="btn-row">' +
      (askCtl ? '<button class="btn" data-act="ask-stop">Stop</button>' : '<button class="btn primary" data-act="ask-send">Send</button>') +
      '<button class="btn ghost" data-act="ask-copy">Copy as prompt</button>' + (msgs.length && !askCtl ? '<button class="btn ghost" data-act="ask-clear">Clear chat</button>' : '') + '</div>' +
      '<p class="hint" id="ask-hint"' + (toolsOk === false ? ' hidden' : '') + '>Try: "My investment club interview is next Thursday." The coach adds it to your plan and schedules prep before it.</p></div></div>';
    askErr = '';
  }
  async function askSend(text) {
    const box = $('#ask-in');
    text = String(text || (box ? box.value : '')).trim();
    if (!text || askCtl) return;
    const sample = await getSample();
    if (!sample) { openCopy(P.handoffAsk(prof(), ctx(), text), "Claude isn't available in this view. Copy this, open Claude, and paste it into a new chat.", 'Copy, then open Claude', CLAUDE_NEW); return; }
    const useTools = await toolsAvailable(sample);
    if (askCtl) return;
    const c = ctx();
    S.chat.push({ id: uid(), role: 'user', content: text });
    const history = S.chat.slice(-16).filter(m => String(m.content || '').trim()).map(m => ({ role: m.role, content: m.content }));
    const turns = pre => [{ role: 'user', content: pre }].concat(history);
    const msg = { id: uid(), role: 'assistant', content: '' };
    S.chat.push(msg);
    askDraft = ''; askCtl = new AbortController();
    const signal = askCtl.signal, changes = [], before = clone(S.profile);
    render();
    const onText = ({ text: tx }) => { msg.content = tx; const b = $$('#msgs .msg.coach .bubble').pop(); if (b) b.innerHTML = mdBlocks(tx); };
    const plain = () => sample(turns(P.chatPreamble(prof(), c, false)), { signal, cache: false, modelTier: 'default', onText });
    try {
      let r;
      if (useTools) {
        try { r = await sample(turns(P.chatPreamble(prof(), c, true)), { signal, cache: false, modelTier: 'default', onText, tools: coachTools(changes, signal) }); }
        catch (e) {
          if (!e || e.code !== 'tools_unavailable') throw e;
          toolsOk = false;             // this view can't run page tools: answer without them
          r = await plain();
        }
      } else r = await plain();
      msg.content = r.text;
    } catch (e) {
      const cancelled = e && e.code === 'cancelled';
      if (e && e.text) msg.content = e.text + (cancelled ? '' : '\n\n*(Interrupted.)*');
      else if (changes.length) msg.content = '*(Stopped before it finished replying.)*';
      else { const i = S.chat.indexOf(msg); if (i >= 0) S.chat.splice(i, 1); }
      if (!cancelled && !(e && e.text)) askErr = aiError(e);
    } finally {
      if (changes.length) {
        msg.changes = changes.slice();
        lastUndo = { id: msg.id, before, after: JSON.stringify(S.profile) };
      }
      askCtl = null;
      if (S.chat.length > 40) S.chat.splice(0, S.chat.length - 40);
      save();
      render();
      if (S.ui.tab === 'ask') { const m = $('#msgs'); if (m && m.lastElementChild) m.lastElementChild.scrollIntoView({ block: 'nearest' }); }
      if (changes.length && S.ui.tab !== 'ask') toast('Your coach updated your plan');
    }
  }

  /* =========================== Setup =========================== */
  let D = null, pvT = 0, sugg = null, dataPanel = '';
  function newDraft() {
    return { name: '', school: '', year: 'Sophomore', major: '', seats: [], primary: '', firms: '', goals: '', startDate: todayISO(), readyDate: '', events: [], levels: { acc: 'some', val: 'some', mkt: 'some' }, studyDays: [0, 1, 2, 3, 4, 5, 6], mockDay: 0, minutes: 20, remindAt: '09:30', why: '', experiences: '', interests: '' };
  }
  function getDraft() {
    if (!D) { D = Object.assign(newDraft(), clone(S.draft || S.profile || {})); D.levels = Object.assign({ acc: 'some', val: 'some', mkt: 'some' }, D.levels || {}); D.events = (D.events || []).map(e => Object.assign({ id: uid() }, e)); }
    return D;
  }
  function exampleProfile() {
    const t = E.parseISO(todayISO()), at = n => E.iso(E.addDays(t, n));
    return { name: 'Sample', school: 'Your school', year: 'Sophomore', seats: ['ib'], primary: 'ib', firms: 'Evercore, Goldman Sachs', startDate: at(0), readyDate: at(180),
      events: [{ id: 'x1', name: 'Investment club application', date: at(9), type: 'club' }, { id: 'x2', name: 'Summer analyst applications open', date: at(120), type: 'application', est: true }],
      levels: { acc: 'some', val: 'new', mkt: 'some' }, studyDays: [0, 1, 2, 3, 4, 5, 6], mockDay: 0, minutes: 20 };
  }
  const field = (id, label, control, errKey, hint) => '<div class="field"><label for="' + id + '">' + label + '</label>' + control + (hint ? '<span class="hint">' + hint + '</span>' : '') + (errKey ? '<p class="err" id="err-' + errKey + '" hidden></p>' : '') + '</div>';
  function evRowHTML(e) {
    return '<div class="ev" data-ev="' + esc(e.id) + '">' +
      '<div class="field"><label for="ev-n-' + esc(e.id) + '">What</label><input class="in" id="ev-n-' + esc(e.id) + '" data-evf="name" value="' + esc(e.name) + '" placeholder="e.g. Investment club application"></div>' +
      '<div class="field"><label for="ev-d-' + esc(e.id) + '">Date</label><input class="in" type="date" id="ev-d-' + esc(e.id) + '" data-evf="date" value="' + esc(e.date) + '"></div>' +
      '<div class="field"><label for="ev-t-' + esc(e.id) + '">Type</label><select class="in" id="ev-t-' + esc(e.id) + '" data-evf="type">' + Object.keys(E.EVENT_TYPES).map(k => '<option value="' + k + '"' + (e.type === k ? ' selected' : '') + '>' + esc(E.EVENT_TYPES[k]) + '</option>').join('') + '</select></div>' +
      '<button type="button" class="btn ghost x" data-act="ev-del" data-id="' + esc(e.id) + '">Remove</button>' +
      (e.est ? '<div class="ev-est"><span class="chip flag">ESTIMATE</span><span>' + esc(e.note || "Suggested date. Confirm it with your career center or the program's site.") + '</span><button type="button" class="btn small" data-act="ev-ok" data-id="' + esc(e.id) + '">Mark confirmed</button></div>' : '') + '</div>';
  }
  function viewSetup() {
    const d = getDraft(), first = !S.profile;
    const seats = Object.keys(E.SEATS);
    const order = [1, 2, 3, 4, 5, 6, 0], dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], dl = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lv = (k, label) => '<div class="lv-row"><span class="lbl" id="lv-' + k + '-l">' + label + '</span><div class="segs" role="radiogroup" aria-labelledby="lv-' + k + '-l">' + ['new', 'some', 'solid'].map(v => '<label><input type="radio" name="lv-' + k + '" id="lv-' + k + '-' + v + '" value="' + v + '"' + (d.levels[k] === v ? ' checked' : '') + '><span>' + ({ new: 'New to it', some: 'Some', solid: 'Solid' })[v] + '</span></label>').join('') + '</div></div>';
    const intro = first
      ? '<p class="eyebrow">Takes about five minutes</p><h1 class="h-page">Build your recruiting coach</h1><p class="lede">Tell it where you go to school, what you\'re aiming for and the dates that matter. It builds a day-by-day plan to the date you want to be interview-ready, teaches each day\'s lesson, grades your answers and runs mock interviews. ' +
        (IN_CLAUDE ? 'It runs on your own Claude account, and your progress stays in this browser.' : 'No account needed: your plan and progress stay in this browser, and anything that needs AI opens in your own Claude chat.') + '</p>'
      : '<h1 class="h-page">Setup</h1><p class="lede">Change anything and your plan rebuilds when you save. Sessions you\'ve finished stay finished.</p>';
    $('#main').innerHTML = '<div class="setup"><div style="min-width:0"><div class="intro">' + intro +
      '<div class="legend-model" aria-label="How to read this page"><span class="b-in"><b>Blue</b> is what you enter</span><span class="b-out"><b>Black</b> is what the coach builds</span><span class="b-ln"><b>Green</b> marks sessions tied to your dates</span></div>' +
      (first ? '<p class="note restore-line">Already set this up on another device? <button type="button" class="linkbtn" data-act="restore-open">Restore it from a backup code</button></p><div id="data-extra">' + dataPanel + '</div>' : '') + '</div>' +
      '<form id="setup-form" novalidate>' +
      '<fieldset class="fs"><legend>You</legend><div class="grid2">' +
      field('f-name', 'First name', '<input class="in" id="f-name" autocomplete="given-name" value="' + esc(d.name) + '" placeholder="Jordan">') +
      field('f-school', 'School', '<input class="in" id="f-school" value="' + esc(d.school) + '" placeholder="e.g. Wake Forest University">', 'school') +
      field('f-year', 'Year', '<select class="in" id="f-year">' + E.YEARS.map(y => '<option' + (d.year === y ? ' selected' : '') + '>' + esc(y) + '</option>').join('') + '</select>') +
      field('f-major', 'Major (optional)', '<input class="in" id="f-major" value="' + esc(d.major) + '" placeholder="e.g. Finance, Economics">') + '</div></fieldset>' +
      '<fieldset class="fs"><legend>Goal</legend><div class="field"><span class="lbl" id="seats-l">Seats you\'re aiming for</span><div class="togs" role="group" aria-labelledby="seats-l">' + seats.map(s => '<button type="button" class="tog" data-act="seat" data-seat="' + s + '" aria-pressed="' + d.seats.includes(s) + '">' + esc(E.SEATS[s].label) + '</button>').join('') + '</div><p class="err" id="err-seats" hidden></p></div>' +
      '<div class="field" id="primary-wrap"' + (d.seats.length > 1 ? '' : ' hidden') + '><label for="f-primary">Main focus</label><select class="in" id="f-primary">' + d.seats.map(s => '<option value="' + s + '"' + (d.primary === s ? ' selected' : '') + '>' + esc(E.SEATS[s].label) + '</option>').join('') + '</select><span class="hint">Most lessons and mock questions lean toward this one.</span></div>' +
      field('f-goals', 'Your goals', '<textarea class="in" id="f-goals" rows="3" placeholder="One per line, for example:&#10;Get into the investment club this fall&#10;Land a sophomore summer internship in wealth management">' + esc(d.goals) + '</textarea>', null, 'One per line. Lessons, prep sessions and mock interviews get aimed at these.') +
      field('f-firms', 'Firms on your list (optional)', '<input class="in" id="f-firms" value="' + esc(d.firms) + '" placeholder="e.g. Goldman Sachs, Evercore, Morgan Stanley">', null, 'Separate with commas. Each gets a "Why us?" deep-dive near the end.') + '</fieldset>' +
      '<fieldset class="fs"><legend>Dates</legend><div class="grid2">' +
      field('f-start', 'Start date', '<input class="in" type="date" id="f-start" value="' + esc(d.startDate) + '">', 'startDate') +
      field('f-ready', 'Interview-ready by', '<input class="in" type="date" id="f-ready" value="' + esc(d.readyDate) + '">', 'readyDate', 'When you want to be able to walk into a first round. Not sure? Try "Suggest dates for me".') + '</div>' +
      '<div class="field"><span class="lbl">Key dates</span><span class="hint">Application deadlines, interviews, club applications, info sessions. The coach puts a prep session before each one.</span></div>' +
      '<div class="ev-list" id="ev-list">' + d.events.map(evRowHTML).join('') + '</div>' +
      '<div class="btn-row"><button type="button" class="btn" data-act="ev-add">+ Add a date</button>' +
      (aiReady() ? '<button type="button" class="btn" data-act="suggest">Suggest dates for me</button>' : handoffBtn('dates', 'Suggest dates in Claude')) + '</div><div id="sugg">' + (sugg ? suggHTML(sugg) : '') + '</div></fieldset>' +
      '<fieldset class="fs"><legend>Starting point</legend><div class="lv-grid">' + lv('acc', 'Accounting') + lv('val', 'Valuation') + lv('mkt', 'Markets') + '</div><span class="hint">"New to it" adds more lessons in that area. "Solid" swaps the basics for a one-lesson refresher.</span></fieldset>' +
      '<fieldset class="fs"><legend>Routine</legend><div class="field"><span class="lbl" id="dow-l">Study days</span><div class="togs" role="group" aria-labelledby="dow-l">' + order.map(i => '<button type="button" class="tog" data-act="dow" data-dow="' + i + '" aria-pressed="' + d.studyDays.includes(i) + '">' + dn[i] + '</button>').join('') + '</div></div>' +
      '<div class="grid2">' + field('f-mockday', 'Mock interview day', '<select class="in" id="f-mockday">' + order.map(i => '<option value="' + i + '"' + (+d.mockDay === i ? ' selected' : '') + '>' + dl[i] + '</option>').join('') + '</select>') +
      '<div class="field"><span class="lbl" id="min-l">Time per lesson</span><div class="segs" role="radiogroup" aria-labelledby="min-l">' + [10, 20, 30].map(v => '<label><input type="radio" name="f-min" id="f-min-' + v + '" value="' + v + '"' + (+d.minutes === v ? ' checked' : '') + '><span>' + v + ' min</span></label>').join('') + '</div></div>' +
      field('f-remind', 'Reminder time', '<input class="in" type="time" id="f-remind" value="' + esc(d.remindAt || '09:30') + '">', null, IN_CLAUDE ? 'Used when you add your plan to a calendar on the website.' : 'When each day\'s calendar reminder goes off. Add your plan to a calendar from the Plan tab.') + '</div></fieldset>' +
      '<fieldset class="fs"><legend>Your story (optional)</legend><p class="hint" style="margin-top:-6px">This is what makes the coaching yours: your "why finance" answer and your behavioral stories get built from it.</p>' +
      field('f-why', 'Why finance, in a sentence or two', '<textarea class="in" id="f-why" rows="3" placeholder="What actually got you interested">' + esc(d.why) + '</textarea>') +
      field('f-exp', 'Experiences to draw on', '<textarea class="in" id="f-exp" rows="4" placeholder="One per line: jobs, clubs, sports, projects, a business you run">' + esc(d.experiences) + '</textarea>', null, 'Stick to things you\'d put on a resume.') +
      field('f-int', 'Markets and sectors you follow', '<input class="in" id="f-int" value="' + esc(d.interests) + '" placeholder="e.g. energy, AI infrastructure, banks">') + '</fieldset>' +
      '<div class="save-row"><button class="btn primary" type="submit" id="f-save">' + (first ? 'Build my plan' : 'Save and rebuild') + '</button>' + (!first ? '<button class="btn ghost" type="button" data-act="setup-discard">Discard changes</button>' : '') + '<span class="note" id="f-msg" aria-live="polite"></span></div></form>' +
      (first ? '' : toolsHTML()) + '</div><aside class="preview" id="preview" aria-label="Plan preview"></aside></div>';
    const f = $('#setup-form');
    f.addEventListener('input', onSetupInput);
    f.addEventListener('change', onSetupInput);
    f.addEventListener('submit', e => { e.preventDefault(); setupSave(); });
    paintPreview();
  }
  function onSetupInput(e) {
    const t = e.target, d = getDraft();
    const map = { 'f-name': 'name', 'f-school': 'school', 'f-year': 'year', 'f-major': 'major', 'f-firms': 'firms', 'f-goals': 'goals', 'f-start': 'startDate', 'f-ready': 'readyDate', 'f-why': 'why', 'f-exp': 'experiences', 'f-int': 'interests', 'f-primary': 'primary', 'f-remind': 'remindAt' };
    if (map[t.id]) d[map[t.id]] = t.value;
    else if (t.id === 'f-mockday') d.mockDay = +t.value;
    else if (t.name && t.name.indexOf('lv-') === 0) d.levels[t.name.slice(3)] = t.value;
    else if (t.name === 'f-min') d.minutes = +t.value;
    else if (t.dataset && t.dataset.evf) { const row = t.closest('.ev'), ev = row && d.events.find(x => x.id === row.dataset.ev); if (ev) ev[t.dataset.evf] = t.value; }
    else return;
    draftChanged();
  }
  function draftChanged() { S.draft = D; save(); clearTimeout(pvT); pvT = setTimeout(paintPreview, 150); }
  function paintEvents() { const l = $('#ev-list'); if (l) l.innerHTML = getDraft().events.map(evRowHTML).join(''); }
  function paintPreview() {
    const el = $('#preview'); if (!el) return;
    const d = getDraft();
    const example = !(E.parseISO(d.startDate) && E.parseISO(d.readyDate));
    const src = example ? exampleProfile() : Object.assign({}, d, { seats: d.seats.length ? d.seats : ['unsure'] });
    const plan = E.buildPlan(src);
    if (plan.error) { el.innerHTML = '<div class="card"><span class="eyebrow">Live preview</span><h2>Your plan</h2><p class="note bad">' + esc(plan.error) + '</p></div>'; return; }
    const c = plan.counts, items = plan.items.slice(0, 12);
    const end = items.length ? items[items.length - 1].date : plan.start;
    const evs = plan.events.filter(e => e.date <= end);
    const rows = [];
    items.forEach(it => {
      while (evs.length && evs[0].date < it.date) { const e = evs.shift(); rows.push('<li class="mk"><span class="d">' + short(e.date) + '</span><span><span class="chip input">DATE</span></span><span class="t">' + esc(e.name) + '</span></li>'); }
      rows.push('<li><span class="d">' + short(it.date) + '</span><span>' + chip(it.cat) + '</span><span class="t">' + esc(it.title) + (it.event ? '<small>for ' + esc(it.event.name) + '</small>' : '') + '</span></li>');
    });
    el.innerHTML = '<div class="card">' + (example ? '<span class="ex-flag">Example · a sample sophomore aiming for banking</span>' : '<span class="eyebrow">Live preview</span>') +
      '<h2>' + (example ? 'What a plan looks like' : 'Your plan so far') + '</h2>' +
      '<p class="note">' + plan.total + ' study days to ' + E.fmt(plan.ready, { month: 'short', day: 'numeric', year: 'numeric' }) + ': ' + c.lesson + ' lessons, ' + c.drill + ' drills, ' + c.mock + ' mock interviews' + (c.prep ? ', ' + c.prep + ' prep sessions' : '') + (c.firm ? ', ' + c.firm + ' firm deep-dives' : '') + '.</p>' +
      phaseBarHTML(plan, true) + '<ol class="pv-list">' + rows.join('') + '</ol><p class="hint">' + (example ? 'Add your start and interview-ready dates and this turns into your plan.' : 'The first two weeks. You\'ll see every week on the Plan tab.') + '</p></div>';
  }
  function suggHTML(s) {
    if (!s.events.length && !s.readyBy) return '<div class="sugg"><p class="note">No usable dates came back. Try again, or add your dates by hand.</p></div>';
    return '<div class="sugg"><p class="note"><b>Estimates, not facts.</b> These come from how recent recruiting cycles usually run. Confirm each one with your career center or the program\'s site before you rely on it.</p>' +
      (s.readyBy ? '<div class="btn-row"><span>Interview-ready by <b class="mono">' + E.fmt(s.readyBy, { month: 'short', day: 'numeric', year: 'numeric' }) + '</b>' + (s.why ? '. ' + esc(s.why) : '') + '</span><button type="button" class="btn small" data-act="sugg-ready">Use this date</button></div>' : '') +
      '<ul>' + s.events.map((e, i) => '<li><span class="d">' + E.fmt(e.date, { month: 'short', day: 'numeric', year: '2-digit' }) + '</span><span>' + esc(e.name) + '<small>' + esc(E.EVENT_TYPES[e.type]) + (e.note ? ' · ' + esc(e.note) : '') + '</small></span><button type="button" class="btn small" data-act="sugg-add" data-i="' + i + '"' + (e.added ? ' disabled' : '') + '>' + (e.added ? 'Added' : 'Add') + '</button></li>').join('') + '</ul>' +
      (s.events.some(e => !e.added) ? '<div class="btn-row"><button type="button" class="btn" data-act="sugg-all">Add all</button></div>' : '') + '</div>';
  }
  function cleanSugg(r) {
    const t = todayISO(), ok = s => typeof s === 'string' && E.parseISO(s);
    const events = (r && Array.isArray(r.events) ? r.events : []).filter(e => e && e.name && ok(e.date) && e.date > t).slice(0, 10)
      .map(e => ({ id: uid(), name: trunc(String(e.name).trim(), 80), date: e.date, type: E.EVENT_TYPES[e.type] ? e.type : 'other', note: trunc(String(e.note || '').trim(), 200), est: true }));
    return { readyBy: r && ok(r.readyBy) && r.readyBy > t ? r.readyBy : '', why: trunc(String((r && r.why) || '').trim(), 300), events };
  }
  async function suggestDates(btn) {
    const d = getDraft(), box = $('#sugg');
    if (!String(d.school || '').trim() || !d.seats.length) { box.innerHTML = '<p class="note bad">Add your school and at least one seat first, so the suggestions fit you.</p>'; return; }
    const prompt = P.timeline(E.normalize(d), todayISO());
    const sample = await getSample();
    if (!sample) { openCopy(prompt, "Claude isn't available in this view. Paste this into a Claude chat for suggested dates."); return; }
    btn.disabled = true; box.innerHTML = thinking('Working out typical dates for your seats. This can take a minute.');
    try { sugg = cleanSugg(await sample.json(prompt, { modelTier: 'default' })); const b = $('#sugg'); if (b) b.innerHTML = suggHTML(sugg); }
    catch (e) { const b = $('#sugg'); if (b) b.innerHTML = '<p class="note bad">' + esc(aiError(e)) + '</p>'; }
    finally { if (btn.isConnected) btn.disabled = false; }
  }
  function addSugg(i) {
    const d = getDraft(), e = sugg && sugg.events[i];
    if (!e || e.added) return;
    if (!d.events.some(x => x.name === e.name && x.date === e.date)) d.events.push({ id: uid(), name: e.name, date: e.date, type: e.type, note: e.note, est: true });
    e.added = true;
  }
  function setupSave() {
    const d = getDraft();
    const before = d.events.length;
    d.events = d.events.filter(e => String(e.name || '').trim() || E.parseISO(e.date));
    if (d.events.length !== before) paintEvents();
    const errs = E.validate(d);
    const badEv = d.events.find(e => !String(e.name || '').trim() || !E.parseISO(e.date));
    $$('.err').forEach(el => { el.hidden = true; el.textContent = ''; });
    const keys = Object.keys(errs);
    if (keys.length || badEv) {
      keys.forEach(k => { const el = $('#err-' + k); if (el) { el.textContent = errs[k]; el.hidden = false; } });
      $('#f-msg').textContent = badEv ? 'Each key date needs a name and a date (or remove it).' : 'Fix the highlighted fields to build your plan.';
      const firstId = { school: 'f-school', startDate: 'f-start', readyDate: 'f-ready' }[keys[0]];
      if (firstId) $('#' + firstId).focus();
      else if (keys[0] === 'seats') $('#err-seats').scrollIntoView({ block: 'center' });
      else if (badEv) { const n = $('#ev-n-' + badEv.id); if (n) n.focus(); }
      return;
    }
    const plan = E.buildPlan(d);
    if (plan.error) { $('#f-msg').textContent = plan.error; return; }
    const first = !S.profile;
    S.profile = clone(d); S.draft = null; D = null; sugg = null;
    S.ui.tab = 'today'; S.ui.viewKey = null;
    if (S.drillQ) S.drillQ = null;
    saveNow(); render(); window.scrollTo(0, 0);
    toast(first ? 'Your plan is ready' : 'Plan rebuilt');
  }
  function toolsHTML() {
    const plan = getPlan(); if (!plan) return '';
    const p = prof();
    return '<div class="more-tools"><section class="card"><h2 style="font-size:17px">Take it into Claude</h2><p class="note" style="margin-top:4px">Want to use your coach in a Claude Project or any chat instead? Copy its instructions and your full plan.</p>' +
      '<div class="copyblock" style="margin-top:12px"><div class="btn-row" style="justify-content:space-between"><b style="font-size:14px">Coach instructions</b><button type="button" class="btn small" data-act="copy-instr">Copy</button></div><pre>' + esc(trunc(P.projectInstructions(p, plan), 700)) + '</pre></div>' +
      '<div class="copyblock" style="margin-top:12px"><div class="btn-row" style="justify-content:space-between"><b style="font-size:14px">Your plan, as Markdown</b><button type="button" class="btn small" data-act="plan-copy">Copy</button></div><pre>' + esc(trunc(E.planMarkdown(plan), 500)) + '</pre></div></section>' +
      (IN_CLAUDE ? '' : '<section class="card"><h2 style="font-size:17px">Calendar reminders</h2><p class="note" style="margin-top:4px">Put every study day on your phone\'s calendar at ' + fmtTime(p.remindAt) + ', with a reminder and a link back to that day\'s session.</p><div class="btn-row" style="margin-top:12px"><button type="button" class="btn" data-act="cal">Add to calendar</button></div></section>') +
      '<section class="card"><h2 style="font-size:17px">Your data</h2><p class="note" style="margin-top:4px">Your plan, lessons and scores live in this browser only. To move them to another device or browser, copy a backup code here and restore it there.' + (IN_CLAUDE ? ' The code also works on the <a href="' + SITE_URL + 'app.html" target="_blank" rel="noopener">website version</a>, which adds voice practice and calendar reminders.' : '') + '</p>' +
      '<div class="btn-row" style="margin-top:12px"><button type="button" class="btn" data-act="backup">Copy backup code</button><button type="button" class="btn" data-act="restore-open">Restore from a code</button><button type="button" class="btn ghost" data-act="erase">Erase everything</button></div><div id="data-extra" style="margin-top:12px">' + dataPanel + '</div></section></div>';
  }
  function b64e(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
  function b64d(b64) { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }

  /* =========================== events =========================== */
  const H = {
    tab: b => { if (b.getAttribute('aria-disabled') === 'true') { toast('Build your plan first'); return; } go(b.dataset.tab); },
    open: b => { const it = findItem(b.dataset.key), td = E.itemOn(getPlan(), todayISO()); timerStop(); S.ui.viewKey = it && td && it.key === td.key ? null : b.dataset.key; S.ui.tab = 'today'; save(); render(); window.scrollTo(0, 0); },
    'back-today': () => { S.ui.viewKey = null; save(); render(); window.scrollTo(0, 0); },
    done: b => { const k = b.dataset.key; if (S.done[k]) delete S.done[k]; else S.done[k] = todayISO(); save(); render(); },
    teach: b => teach(b.dataset.key, false),
    regen: b => teach(b.dataset.key, true),
    'stop-lesson': () => { if (stream) stream.ctl.abort(); },
    'copy-lesson': b => { const it = findItem(b.dataset.key); if (!it) return; copyText(P.handoffLesson(prof(), getPlan(), it, ctx(), it.kind === 'rev' ? resolveRev(it) : null), 'Prompt copied. Paste it into a Claude chat.'); },
    'lib-restore': b => { delete S.lessons[b.dataset.key]; save(); render(); },
    grade: b => doGrade(b.dataset.scope),
    'grade-stop': b => { const c = gradeCtl[b.dataset.scope]; if (c) c.abort(); },
    'copy-grade': b => { const g = gradeInputs(b.dataset.scope); copyText(P.handoffGrade(prof(), g.q || '[question]', g.a || '[your answer]', g.meta.context), 'Prompt copied. Paste it into a Claude chat.'); },
    'self-check': b => selfCheck(b.dataset.scope),
    'self-score': b => selfScore(b.dataset.scope, +b.dataset.n),
    rec: b => { const sc = b.dataset.scope; if (recScope === sc) recStop(); else recStart(sc); },
    'reviews-go': () => { timerStop(); S.ui.tab = 'practice'; S.ui.practice = 'drill'; S.ui.drill = 'due'; S.drillQ = null; save(); render(); window.scrollTo(0, 0); },
    cal: () => exportCalendar(),
    'cal-close': () => { calInfo = null; render(); },
    followup: b => {
      const s = b.dataset.scope, q = b.dataset.q;
      if (s === 'lg') { const sel = $('#lg-q'), c = $('#lg-qc'); sel.value = 'custom'; c.hidden = false; c.value = q; }
      else { S.drillQ = Object.assign({}, S.drillQ, { id: 'fu-' + uid(), qid: '', text: q }); voiceStats.dg = null; save(); render(); }
      const a = $('#' + s + '-a'); if (a) { a.value = ''; drafts[s === 'lg' ? 'lg:' + (($('#lg-go') || {}).dataset || {}).key : 'dg'] = ''; a.focus(); }
    },
    timer: b => { if (T && T.scope === b.dataset.scope) timerStop(); else timerStart(b.dataset.scope, b); },
    pmode: b => { timerStop(); S.ui.practice = b.dataset.mode; save(); render(); },
    dfilter: b => { timerStop(); S.ui.drill = b.dataset.f; nextDrillQ(); render(); },
    dnext: () => { timerStop(); nextDrillQ(); render(); },
    'mock-start': b => mockStart(b.dataset.key || null),
    'mock-next': () => mockNext(),
    'mock-prev': () => mockPrev(),
    'mock-skipfu': () => mockSkipFu(),
    'mock-finish': () => mockFinish(),
    'mock-self': b => { const A = S.mockActive; if (!A || !A.review) return; A.scores[+b.dataset.i] = +b.dataset.n; save(); render(); },
    'mock-save': () => mockSaveSelf(),
    'mock-stop': () => { if (mockCtl) mockCtl.abort(); },
    'mock-quit': b => { if (!armed(b, 'Click again to quit')) return; timerStop(); S.mockActive = null; save(); render(); toast('Mock discarded'); },
    'mock-copy': () => { captureMock(); copyText(P.handoffMock(prof(), ctx(), S.mockActive ? S.mockActive.qs : E.pickMock(prof(), uid(), [], weakCats())), 'Prompt copied. Paste it into a Claude chat.'); },
    'mock-view': b => { S.ui.mockView = b.dataset.id; S.ui.tab = 'practice'; S.ui.practice = 'mock'; save(); render(); window.scrollTo(0, 0); },
    'mock-close': () => { S.ui.mockView = null; save(); render(); },
    'retry-weak': b => { const w = weakSpots()[+b.dataset.i]; if (!w) return; S.ui.tab = 'practice'; S.ui.practice = 'drill'; S.ui.drill = 'weak'; S.drillQ = { id: 'w-' + E.slug(w.q).slice(0, 30), qid: w.qid || '', cat: E.CATS[w.cat] ? w.cat : 'fit', text: w.q, filter: 'weak' }; voiceStats.dg = null; drafts.dg = ''; save(); render(); window.scrollTo(0, 0); },
    'ask-send': () => askSend(),
    'ask-sug': b => askSend(b.dataset.q),
    'ask-stop': () => { if (askCtl) askCtl.abort(); },
    'ask-clear': b => { if (!armed(b, 'Click again to clear')) return; S.chat = []; lastUndo = null; save(); render(); },
    'ask-undo': b => {
      if (!lastUndo || lastUndo.id !== b.dataset.id) return;
      S.profile = lastUndo.before; S.draft = null; D = null;
      const m = S.chat.find(x => x.id === lastUndo.id); if (m) m.undone = true;
      lastUndo = null; save(); render(); toast('Plan changes undone');
    },
    'ask-copy': () => { const box = $('#ask-in'); copyText(P.handoffAsk(prof(), ctx(), (box && box.value.trim()) || '[your question]'), 'Prompt copied. Paste it into a Claude chat.'); },
    seat: b => {
      const d = getDraft(), s = b.dataset.seat;
      if (s === 'unsure') d.seats = d.seats.includes('unsure') ? [] : ['unsure'];
      else { d.seats = d.seats.filter(x => x !== 'unsure'); d.seats = d.seats.includes(s) ? d.seats.filter(x => x !== s) : d.seats.concat(s); }
      if (!d.seats.includes(d.primary)) d.primary = d.seats[0] || '';
      $$('[data-act="seat"]').forEach(x => x.setAttribute('aria-pressed', String(d.seats.includes(x.dataset.seat))));
      const pw = $('#primary-wrap'); pw.hidden = d.seats.length < 2;
      $('#f-primary').innerHTML = d.seats.map(x => '<option value="' + x + '"' + (d.primary === x ? ' selected' : '') + '>' + esc(E.SEATS[x].label) + '</option>').join('');
      const er = $('#err-seats'); if (er && d.seats.length) er.hidden = true;
      draftChanged();
    },
    dow: b => {
      const d = getDraft(), i = +b.dataset.dow;
      if (d.studyDays.includes(i)) { if (d.studyDays.length === 1) { toast('Keep at least one study day'); return; } d.studyDays = d.studyDays.filter(x => x !== i); }
      else d.studyDays = d.studyDays.concat(i).sort();
      b.setAttribute('aria-pressed', String(d.studyDays.includes(i)));
      draftChanged();
    },
    'ev-add': () => { const d = getDraft(), e = { id: uid(), name: '', date: '', type: 'application', est: false }; d.events.push(e); paintEvents(); draftChanged(); const n = $('#ev-n-' + e.id); if (n) n.focus(); },
    'ev-del': b => { const d = getDraft(); d.events = d.events.filter(x => x.id !== b.dataset.id); paintEvents(); draftChanged(); },
    'ev-ok': b => { const e = getDraft().events.find(x => x.id === b.dataset.id); if (e) { e.est = false; paintEvents(); draftChanged(); } },
    suggest: b => suggestDates(b),
    'sugg-ready': () => { if (!sugg || !sugg.readyBy) return; getDraft().readyDate = sugg.readyBy; $('#f-ready').value = sugg.readyBy; draftChanged(); toast('Interview-ready date set'); },
    'sugg-add': b => { addSugg(+b.dataset.i); paintEvents(); $('#sugg').innerHTML = suggHTML(sugg); draftChanged(); },
    'sugg-all': () => { sugg.events.forEach((_, i) => addSugg(i)); paintEvents(); $('#sugg').innerHTML = suggHTML(sugg); draftChanged(); },
    'setup-discard': () => { D = null; S.draft = null; sugg = null; save(); render(); toast('Changes discarded'); },
    'copy-instr': () => copyText(P.projectInstructions(prof(), getPlan()), 'Coach instructions copied'),
    'plan-copy': () => copyText(E.planMarkdown(getPlan()), 'Plan copied as Markdown'),
    'plan-expand': () => { planExpanded = !planExpanded; render(); },
    backup: () => { copyText('FRC1:' + b64e(JSON.stringify(S)), 'Backup code copied. Keep it somewhere safe.'); },
    'restore-open': () => { dataPanel = '<div class="field"><label for="restore-in">Paste your backup code</label><textarea class="in" id="restore-in" rows="3" placeholder="FRC1:…"></textarea></div><div class="btn-row" style="margin-top:8px"><button type="button" class="btn primary" data-act="restore-go">Restore</button><button type="button" class="btn ghost" data-act="panel-close">Cancel</button></div>'; $('#data-extra').innerHTML = dataPanel; $('#restore-in').focus(); },
    'restore-go': () => {
      const raw = ($('#restore-in').value || '').trim().replace(/^FRC1:/, '').replace(/\s+/g, '');
      try {
        const data = JSON.parse(b64d(raw));
        if (!data || data.v !== 1) throw new Error('bad');
        S = Object.assign(fresh(), data); S.ui = Object.assign(fresh().ui, data.ui || {}); S.ui.tab = 'today'; S.ui.viewKey = null; tidy(); lastUndo = null;
        D = null; dataPanel = ''; memo = { sig: '', plan: null };
        saveNow(); render(); toast('Restored');
      } catch (e) { $('#data-extra').insertAdjacentHTML('beforeend', '<p class="note bad" style="margin-top:8px">That code didn\'t work. Copy the whole thing, starting with FRC1:</p>'); }
    },
    erase: () => { dataPanel = '<div class="confirm"><span>This deletes your plan, lessons and scores from this browser. It can\'t be undone.</span><button type="button" class="btn small" data-act="erase-yes">Yes, erase everything</button><button type="button" class="btn small ghost" data-act="panel-close">Cancel</button></div>'; $('#data-extra').innerHTML = dataPanel; },
    'erase-yes': () => { S = fresh(); D = null; sugg = null; dataPanel = ''; memo = { sig: '', plan: null }; saveNow(); render(); window.scrollTo(0, 0); toast('Erased'); },
    'panel-close': () => { dataPanel = ''; $('#data-extra').innerHTML = ''; },
    'ov-copy': () => { const ta = $('#ov-ta'); ta.select(); try { navigator.clipboard.writeText(ta.value).then(() => { toast('Copied'); closeOverlay(); }).catch(() => toast('Press Ctrl+C or Cmd+C to copy')); } catch (e) { toast('Press Ctrl+C or Cmd+C to copy'); } },
    'ov-close': () => closeOverlay(),
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const h = H[b.dataset.act];
    if (b.dataset.act === 'handoff') { handoff(b, e); return; }      // a real link: let it open Claude
    if (h) { if (b.tagName === 'A') e.preventDefault(); h(b, e); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'dg-a') drafts.dg = t.value;
    else if (t.id === 'lg-a') { const g = $('#lg-go'); if (g) drafts['lg:' + g.dataset.key] = t.value; }
    else if (t.id === 'mk-a' && S.mockActive) { const A = S.mockActive; if (A.stage === 'fu' && A.fus[A.i]) A.fus[A.i].a = t.value; else A.answers[A.i] = t.value; save(); }
    else if (t.id === 'ask-in') askDraft = t.value;
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'lg-q') { const c = $('#lg-qc'); if (c) c.hidden = e.target.value !== 'custom'; }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeOverlay(); hideTip(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.id === 'ask-in') { e.preventDefault(); askSend(); }
  });
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.matches && d.matches('details.sec-answers')) {
      const area = $('#lesson-area'); if (area) answersOpen[area.dataset.key] = d.open;
      const r = d.querySelector('.reveal'); if (r) r.textContent = d.open ? 'Hide' : 'Show';
    }
  }, true);
  // tooltips: bars, phase-bar ticks and the trend chart
  document.addEventListener('pointermove', e => {
    const tipEl = e.target.closest && e.target.closest('[data-tip]');
    if (tipEl) { showTip(esc(tipEl.dataset.tip), e.clientX, e.clientY); return; }
    const hit = e.target.closest && e.target.closest('.ch-hit');
    if (hit && trendPts.length) {
      const svg = hit.ownerSVGElement, r = svg.getBoundingClientRect();
      const L = +hit.dataset.l, iw = +hit.dataset.iw, px = e.clientX - r.left;
      const n = trendPts.length, i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px - L) / iw * (n - 1))));
      const dot = svg.querySelector('.ch-dot[data-i="' + i + '"]'), xh = svg.querySelector('#ch-x');
      $$('.ch-dot.on', svg).forEach(d => d.classList.remove('on'));
      if (dot) { dot.classList.add('on'); xh.setAttribute('x1', dot.getAttribute('cx')); xh.setAttribute('x2', dot.getAttribute('cx')); xh.setAttribute('visibility', 'visible'); }
      const a = trendPts[i];
      showTip('<b>' + a.score + '/5</b> · ' + esc(short(a.date)) + '<br>' + esc(trunc(a.q, 110)), e.clientX, e.clientY);
      return;
    }
    hideTip();
    const xh = $('#ch-x'); if (xh) xh.setAttribute('visibility', 'hidden');
    $$('.ch-dot.on').forEach(d => d.classList.remove('on'));
  });
  document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); showTip(esc(t.dataset.tip), r.left + 20, r.bottom - 6); } });
  document.addEventListener('focusout', hideTip);

  /* =========================== boot =========================== */
  shell();
  const h = (location.hash || '').slice(1);
  const dm = /^d-(\d{4}-\d{2}-\d{2})$/.exec(h);              // links from calendar reminders: #d-2026-10-23
  if (dm && getPlan()) {
    const it = E.itemOn(getPlan(), dm[1]);
    if (it) { S.ui.tab = 'today'; S.ui.viewKey = it.date === todayISO() ? null : it.key; }
  } else if (TABS.some(t => t[0] === h) && S.profile) S.ui.tab = h;
  if (!S.profile) S.ui.tab = 'setup';
  render();
  getSample();
})();
