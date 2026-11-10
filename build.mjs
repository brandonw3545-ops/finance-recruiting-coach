#!/usr/bin/env node
/* Builds the coach two ways from one set of sources:
 *   dist/finance-recruiting-coach.html  the Claude version, published as a claude.ai artifact
 *                                       (the platform wraps it in <html>/<head>, so this file has none)
 *   docs/                               the website for GitHub Pages: index.html, app.html, library/
 * Run: node build.mjs        (checks every lesson; fails loudly on a malformed one)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const rel = (...p) => path.join(ROOT, ...p);
const read = f => fs.readFileSync(rel(f), 'utf8');
const write = (f, s) => { fs.mkdirSync(path.dirname(rel(f)), { recursive: true }); fs.writeFileSync(rel(f), s); };

const E = require('./src/engine.js');
const G = require('./src/games.js');
const QR = require('./src/qr.js');
const MD = require('./src/md.js');
const esc = MD.esc;

const SITE_URL = 'https://brandonw3545-ops.github.io/finance-recruiting-coach/';
const AI_URL = 'https://claude.ai/artifact/3QqSwrzAPJCeFJCW95Kayn';
const REPO_URL = 'https://github.com/brandonw3545-ops/finance-recruiting-coach';
const NAME = 'Finance Recruiting Coach';
// The Live Room's meeting point: a Firebase Realtime Database address (free tier). Leave '' to switch live rooms off;
// the host screen then asks for an address. Setup steps are in LIVE-ROOM.md.
const LIVE_DB = 'https://live-room-for-finance-default-rtdb.firebaseio.com';
const TAGLINE = 'A free coach for finance recruiting: a day-by-day plan to your interview date, a lesson a day, voice practice and mock interviews.';

const fail = msgs => { console.error('\nBuild stopped:\n  - ' + msgs.join('\n  - ') + '\n'); process.exit(1); };

/* ------------------------------------------------------------------ lessons */
const REQUIRED_SECTIONS = ['cold open', 'big idea', 'how it works', 'real world', 'trap', 'your line', 'your turn', 'answers'];
const REQUIRED_LABELS = ['Cold open', 'Say it out loud', 'Rapid fire a', 'Rapid fire b', 'Rapid fire c', 'Rewind', 'Brain teaser'];
const CAT_ORDER = ['car', 'acc', 'val', 'mkt', 'awm', 'inv', 'trd', 'sto'];
// readable page URLs: whole words, up to about 60 characters
function pageSlug(t) {
  let s = String(t).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 60) { s = s.slice(0, 60); const k = s.lastIndexOf('-'); if (k > 30) s = s.slice(0, k); }
  return s;
}

function loadLessons() {
  const dir = rel('content', 'lessons');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() : [];
  const byTitle = new Map(E.TOPICS.map(t => [t.title, t]));
  const lessons = [], problems = [], seen = new Set();
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
    if (!fm) { problems.push(f + ': missing the --- front matter block'); continue; }
    const meta = {};
    fm[1].split('\n').forEach(l => { const k = l.indexOf(':'); if (k > 0) meta[l.slice(0, k).trim()] = l.slice(k + 1).trim(); });
    const topic = byTitle.get(meta.topic);
    if (!topic) { problems.push(f + ': topic "' + meta.topic + '" is not in the topic bank (src/engine.js). Copy the title exactly.'); continue; }
    if (seen.has(topic.id)) { problems.push(f + ': a second lesson for "' + topic.title + '"'); continue; }
    seen.add(topic.id);
    const md = raw.slice(fm[0].length).trim() + '\n';
    const { title, secs } = MD.splitSections(md);
    if (title !== topic.title) problems.push(f + ': the # heading must match the topic title exactly');
    const heads = secs.map(s => s.head.toLowerCase());
    REQUIRED_SECTIONS.forEach(r => { if (!heads.some(h => h.includes(r))) problems.push(f + ': missing the "' + r + '" section'); });
    const qs = MD.lessonQuestions(md), ans = MD.lessonAnswers(md);
    const labels = qs.map(q => q.label);
    REQUIRED_LABELS.forEach(l => {
      if (!labels.includes(l)) problems.push(f + ': no "' + l + '" question found');
      if (!ans[l]) problems.push(f + ': no answer for "' + l + '"');
    });
    if (/<\/script/i.test(md)) problems.push(f + ': contains </script');
    const words = md.split(/\n## Answers/)[0].split(/\s+/).filter(Boolean).length;
    if (words < 450 || words > 1400) problems.push(f + ': ' + words + ' words before the answers (aim for 550 to 1,100)');
    const comes = (/^\*Comes up in:\*\s*(.+)$/m.exec(md) || [])[1] || '';
    lessons.push({ id: topic.id, cat: topic.cat, level: topic.level, title: topic.title, slug: pageSlug(topic.title), md, answers: ans, comes, words, file: f });
  }
  if (problems.length) fail(problems);
  lessons.sort((a, b) => (CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat)) || (a.file < b.file ? -1 : 1));
  return lessons;
}

/* ------------------------------------------------------------------ question bank answers */
// content/answers.md -> src/answers.js. Each "## " heading is a question's exact text from src/engine.js;
// under it, the model answer, then a last line "**Follow-up:** ..." with the usual next question.
function buildAnswers() {
  const file = rel('content', 'answers.md');
  if (!fs.existsSync(file)) return { count: 0, missing: E.QUESTIONS.map(q => q.text) };
  const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const texts = new Set(E.QUESTIONS.map(q => q.text));
  const QA = {}, problems = [];
  raw.split(/^## /m).slice(1).forEach(chunk => {
    const nl = chunk.indexOf('\n');
    const head = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    let body = nl < 0 ? '' : chunk.slice(nl + 1).trim();
    if (!texts.has(head)) { problems.push('content/answers.md: "' + head + '" is not a question in src/engine.js. Copy the text exactly.'); return; }
    if (QA[head]) { problems.push('content/answers.md: "' + head + '" appears twice'); return; }
    let f = '';
    const fm = /\n?\*\*Follow-up:\*\*\s*(.+)\s*$/.exec(body);
    if (fm) { f = fm[1].trim(); body = body.slice(0, fm.index).trim(); }
    if (!body) problems.push('content/answers.md: "' + head + '" has no answer');
    QA[head] = f ? { a: body, f } : { a: body };
  });
  if (problems.length) fail(problems);
  write('src/answers.js', '/* Generated by build.mjs from content/answers.md. Edit that file, not this one. */\nconst QA = ' + jsonForScript(QA) +
    ';\nif (typeof module !== "undefined" && module.exports) module.exports = QA;\n');
  return { count: Object.keys(QA).length, missing: E.QUESTIONS.filter(q => !QA[q.text]).map(q => q.text) };
}

/* ------------------------------------------------------------------ shared page parts */
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&display=swap">';
const MARK_SVG = '<svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><rect class="bm-bg" x="0" y="0" width="28" height="28" rx="6"/><rect class="bm-ln" x="6" y="7.5" width="16" height="2.6" rx="1.3"/><rect class="bm-ln" x="6" y="12.7" width="11.5" height="2.6" rx="1.3"/><rect class="bm-ln" x="6" y="17.9" width="7" height="2.6" rx="1.3"/><path class="bm-ck" d="M15.6 18.6l2.2 2.2 4.4-5"/></svg>';
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#1537CF"/><rect x="6" y="7.5" width="16" height="2.6" rx="1.3" fill="#fff"/><rect x="6" y="12.7" width="11.5" height="2.6" rx="1.3" fill="#fff"/><rect x="6" y="17.9" width="7" height="2.6" rx="1.3" fill="#fff"/><path d="M15.6 18.6l2.2 2.2 4.4-5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}';
const inlineSafe = (name, s) => { if (/<\/(script|style)/i.test(s)) fail([name + ' contains a closing tag that would break the page']); return s; };
const jsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');

function webPage({ title, description, url, css, body, scripts, ogType, bodyClass }) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(description) + '">' +
    '<meta name="claude:viewport-fit-sides" content="cover">' +
    '<link rel="icon" href="' + FAVICON + '"><link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:type" content="' + (ogType || 'website') + '"><meta property="og:site_name" content="' + NAME + '"><meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(description) + '"><meta property="og:url" content="' + esc(url) + '"><meta property="og:image" content="' + SITE_URL + 'assets/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    FONTS + '<style>' + RESET + '\n' + inlineSafe('css', css) + '</style></head><body' + (bodyClass ? ' class="' + bodyClass + '"' : '') + '>' + body + (scripts || '') + '</body></html>\n';
}

/* ------------------------------------------------------------------ the app */
function appParts(lessons) {
  const LIB = {};
  lessons.forEach(l => { LIB[l.id] = { title: l.title, cat: l.cat, slug: l.slug, md: l.md, answers: l.answers }; });
  const files = ['src/md.js', 'src/answers.js', 'src/engine.js', 'src/games.js', 'src/prompts.js', 'src/calendar.js', 'src/voice.js'];
  const scripts = files.map(f => '<script>\n' + inlineSafe(f, read(f)) + '\n</script>').join('\n') +
    '\n<script>\nconst LIBRARY = ' + jsonForScript(LIB) + ';\n</script>\n<script>\n' + inlineSafe('src/app.js', read('src/app.js')) + '\n</script>';
  const body = '<div id="app"><noscript>This coach needs JavaScript to run.</noscript></div>\n<div id="tip" class="tip" hidden></div>\n';
  return { css: read('src/styles.css'), body, scripts };
}

function buildArtifact(parts) {
  const head = '<title>' + NAME + '</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="description" content="' + esc(TAGLINE) + '">\n' + FONTS + '\n<style>\n' + inlineSafe('css', parts.css) + '\n</style>\n';
  return head + parts.body + parts.scripts + '\n';
}

/* ------------------------------------------------------------------ site chrome */
const siteCSS = () => read('src/styles.css') + '\n' + read('src/site.css') + '\n' + read('src/model.css');
const inlineScripts = files => files.map(f => '<script>\n' + inlineSafe(f, read(f)) + '\n</script>').join('\n');
function siteTop(depth, active) {
  const up = '../'.repeat(depth);
  const link = (href, label, key) => '<a href="' + up + href + '"' + (active === key ? ' aria-current="page"' : '') + '>' + label + '</a>';
  return '<header class="site-top"><div class="wrap site-top-row"><a class="brand" href="' + (up || './') + '">' + MARK_SVG + '<span class="brand-name">' + NAME + '</span></a>' +
    '<nav class="site-nav" aria-label="Site">' + link('play.html', 'Play', 'play') + link('live.html', 'Live Room', 'live').replace('<a ', '<a class="nav-opt" ') + link('library/', 'Lessons', 'lib') +
    '<a class="btn primary small" href="' + up + 'app.html">Build my plan</a></nav></div></header>';
}
function siteFoot(depth) {
  const up = '../'.repeat(depth);
  return '<footer class="site-foot"><div class="wrap site-foot-row"><div><div class="brand-name">' + NAME + '</div><p class="note">Made by Brandon, a college freshman preparing for the same interviews. Free, no ads, and the AI parts run on your own Claude account. Not affiliated with any bank, school or Anthropic.</p></div>' +
    '<nav class="foot-nav" aria-label="More"><a href="' + up + 'app.html">The coach</a><a href="' + up + 'play.html">Play</a><a href="' + up + 'live.html">Live Room</a><a href="' + up + 'library/">Lesson library</a><a href="' + AI_URL + '" target="_blank" rel="noopener">Claude version</a><a href="' + REPO_URL + '" target="_blank" rel="noopener">Source on GitHub</a></nav></div></footer>';
}
const CAT_LABEL = { car: 'Careers & fit', acc: 'Accounting', val: 'Valuation & deals', mkt: 'Markets & the economy', awm: 'Asset & wealth management', inv: 'Investing & pitches', trd: 'Trading', sto: 'Case studies' };

/* ------------------------------------------------------------------ home page */
function examplePlanHTML() {
  // a real plan from the engine for a made-up sophomore, shown as the "working model" on the home page
  const plan = E.buildPlan({ name: 'Sample', school: 'Example University', year: 'Sophomore', seats: ['ib', 'wm'], primary: 'ib', firms: 'Evercore',
    startDate: '2026-09-07', readyDate: '2027-02-15', events: [{ id: 'x1', name: 'Investment club interview', date: '2026-09-25', type: 'club' }], levels: { acc: 'some', val: 'new', mkt: 'some' } });
  const rows = plan.items.filter(it => it.day >= 14 && it.day <= 19);
  const day = iso => E.fmt(iso, { weekday: 'short' });
  const evRow = '<li class="ex-mk"><span class="d">Fri</span><span class="c"><span class="chip input">DATE</span></span><span class="t">Investment club interview</span></li>';
  let out = '', placed = false;
  rows.forEach(it => {
    if (!placed && it.date > '2026-09-25') { out += evRow; placed = true; }
    out += '<li><span class="d">' + day(it.date) + '</span><span class="c"><span class="chip">' + esc(E.CATS[it.cat].code) + '</span></span><span class="t">' + esc(it.title) + (it.event ? '<small>for ' + esc(it.event.name) + '</small>' : '') + '</span></li>';
  });
  if (!placed) out += evRow;
  return { rows: out, total: plan.total, counts: plan.counts };
}
// a real Statement Flows answer, drawn the way the game shows it after you check
function flowExampleHTML() {
  const sc = G.flowScenario('dep', 20, 25);
  const tbl = (stmt, from) => '<table class="ws-grid fl-tbl"><thead><tr><th class="rn"></th><th>' + G.STMT_NAME[stmt] + '</th><th class="chg">Change</th></tr></thead><tbody>' +
    sc.rows.filter(r => r.stmt === stmt).map((r, j) => '<tr><td class="rn">' + (from + j) + '</td><td>' + esc(r.label) + '</td><td class="chg"><span class="fl-ans ' + (r.dir > 0 ? 'up' : r.dir < 0 ? 'down' : 'flat') + '">' + G.acct(r.delta) + '</span></td></tr>').join('') + '</tbody></table>';
  return '<figure class="ws" style="margin:0" aria-label="Example: depreciation goes up by $20 at a 25% tax rate">' +
    '<div class="fl-event"><p class="fl-text">' + esc(sc.text) + '</p><p class="fl-assume">Tax rate ' + sc.taxPct + '%. One period, and taxes are paid in cash this period.</p></div>' +
    '<div class="fl-stmts" style="grid-template-columns:minmax(0,1fr)">' + tbl('is', 1) + tbl('cf', 3) + tbl('bs', 6) + '</div>' +
    '<figcaption class="ex-cap">' + esc(sc.trap) + '</figcaption></figure>';
}
// what the projector shows while a Live Room fills up. The QR is real: it opens the join page.
function liveExampleHTML() {
  const names = ['Ana', 'Marcus', 'Priya', 'Jon', 'Sofia', 'Dev'];
  return '<figure class="lobby-ex" style="margin:0" aria-label="Example: a Live Room waiting to start"><div class="lobby"><div class="lobby-join"><p class="lobby-how">Join at <b>' + esc(SITE_URL.replace(/^https?:\/\//, '') + 'live.html') + '</b> with code</p><p class="room-code">DCFS</p></div>' +
    '<div class="lobby-qr">' + QR.svg(SITE_URL + 'live.html', { margin: 2 }) + '</div></div>' +
    '<div class="lobby-players"><ul class="chips">' + names.map(n => '<li><span class="pchip">' + n + '</span></li>').join('') + '</ul></div>' +
    '<figcaption class="fn">An example of the host screen. The QR code is real and opens the join page.</figcaption></figure>';
}
function homePage(lessons) {
  const ex = examplePlanHTML();
  const pick = ['acc-the-three-financial-statements-what-each-one-tel', 'val-walk-me-through-a-dcf-the-60-second-answer-and-t', 'val-equity-value-vs-enterprise-value-the-house-and-m', 'car-tell-me-about-yourself-turning-your-resume-into-', 'mkt-bonds-101-coupons-maturities-and-why-prices-and-', 'awm-asset-management-vs-wealth-management-what-each-'];
  const featured = pick.map(id => lessons.find(l => l.id === id)).filter(Boolean).concat(lessons).filter((l, i, a) => a.indexOf(l) === i).slice(0, 6);
  const row = (n, a, b, c) => '<tr><td class="rn">' + n + '</td><td>' + a + '</td><td class="num">' + b + '</td><td>' + c + '</td></tr>';
  const crow = (n, a, b, c) => '<tr><td class="rn">' + n + '</td><td>' + a + '</td><td>' + b + '</td><td>' + c + '</td></tr>';
  const body = siteTop(0, '') + '<main class="home">' +
    '<section class="hero grid-paper" id="summary"><div class="wrap hero-grid"><div class="hero-copy">' +
      '<h1 class="hero-h">Finance recruiting prep, built like a model.</h1>' +
      '<p class="hero-sub"><span class="t-in">Blue is what you type</span>: your school, the seats you want, the dates that matter. Black is what it builds: a day-by-day plan to your interview, a lesson a day, and questions you answer out loud. Start with the sprint on this page. The clock starts when you type.</p>' +
      '<div class="btn-row hero-cta"><a class="btn primary big" href="app.html">Build my plan</a><a class="btn big" href="play.html">Play the games</a></div>' +
      '<p class="note">Free. No sign-up, no ads, nothing to install.<sup>1</sup></p></div>' +
      '<div class="hero-sheet" id="hero-sheet"><noscript><p class="note">The sprint needs JavaScript. The <a href="library/">lesson library</a> works without it.</p></noscript></div></div></section>' +

    '<section class="band alt" id="numbers"><div class="wrap two-col"><div><h2 class="sec-h">What\'s in it, counted</h2><p class="sec-note">These numbers come straight from the code every time the site is built.</p></div>' +
      '<table class="ws-grid tear"><tbody>' +
      row(1, 'Written lessons', lessons.length, 'From the three statements to "walk me through a DCF"') +
      row(2, 'Practice questions with model answers', E.QUESTIONS.length, 'Each with the follow-up interviewers usually ask') +
      row(3, 'Events in Statement Flows', G.SCENARIOS.length, 'Every one is tested to balance') +
      row(4, 'Kinds of mental math in the Sprint', G.KIND_NAMES.length, 'The numbers change every round') +
      row(5, 'Topics a plan can draw from', E.TOPICS.length, lessons.length + ' are written; the rest open in Claude<sup>1</sup>') +
      row(6, 'Price', '$0', 'No ads either') +
      row(7, 'Sign-ups', '0', 'Your plan and scores stay in this browser<sup>2</sup>') +
      '</tbody></table></div></section>' +

    '<section class="band" id="play"><div class="wrap"><h2 class="sec-h">Two games, and a room for when there\'s an audience</h2>' +
      '<div class="play-row">' + flowExampleHTML() + '<div class="play-copy"><h3>Statement Flows</h3>' +
        '<p>Every accounting interview gets to the same question: one thing changes, so what happens on all three statements? You mark nine lines up, down or unchanged. Then it shows the numbers and walks through why.</p>' +
        '<p>The example here is a real answer from the game. The Mental Math Sprint at the top of this page is the other game, and its link sends a friend the exact same questions.</p>' +
        '<div class="btn-row"><a class="btn primary" href="play.html">Play Statement Flows</a></div></div></div>' +
      '<div class="play-row flip"><div class="play-copy"><h3>Live Room</h3>' +
        '<p>For a club meeting or a class. One screen shows the question, everyone answers on their own phone, and the leaderboard moves after each one. Ten questions takes about five minutes.</p>' +
        '<div class="btn-row"><a class="btn primary" href="live.html#host">Host a room</a><a class="btn" href="live.html">Join with a code</a></div></div>' + liveExampleHTML() + '</div>' +
    '</div></section>' +

    '<section class="band alt" id="plan"><div class="wrap"><h2 class="sec-h">The plan is the part that knows your dates</h2><div class="play-row">' +
      '<figure class="demo" aria-label="Example: part of a plan for a sophomore aiming for banking">' +
        '<div class="demo-head"><span class="ex-flag">Example plan for a sophomore aiming for banking</span><span class="mono note">' + ex.total + ' study days</span></div>' +
        '<ol class="ex-list">' + ex.rows + '</ol>' +
        '<figcaption class="legend-model"><span class="b-in"><b>Blue</b> is what you enter</span><span class="b-out"><b>Black</b> is what the coach builds</span><span class="b-ln"><b>Green</b> ties a session to your dates</span></figcaption>' +
      '</figure>' +
      '<div class="play-copy"><p>Tell it when your club interview, application deadline or superday is, and it works backward: fit questions before your first interview, the three statements before DCFs, a mock the day before and a warm-up that morning.</p>' +
        '<p>You answer out loud and score yourself against a model answer. Anything you miss comes back the next day, then after 3, 7 and 14 days. The readiness score only moves when you answer something, never when you read something.</p>' +
        '<div class="btn-row"><a class="btn primary" href="app.html">Build my plan</a><a class="btn" href="library/">Read the ' + lessons.length + ' lessons</a></div></div>' +
    '</div></div></section>' +

    '<section class="band" id="notes"><div class="wrap two-col"><div class="maker"><h2 class="sec-h" style="margin-bottom:0">Why I built this</h2>' +
      '<p>I built this because I felt behind on finance recruiting, which starts earlier every year. I also had no idea where to start, at least not without spending a lot of money.</p>' +
      '<p>I wanted something built around me, so I made the Finance Recruiting Coach. It gives you a lesson every day that fits your own goals and dates, then has you answer out loud and shows your time, pace and filler words, so you get better at speaking and not just at knowing the answer.</p>' +
      '<p>It\'s free and the code is public. If a lesson gets something wrong, <a href="' + REPO_URL + '/issues" target="_blank" rel="noopener">open an issue on GitHub</a> and I\'ll fix it.</p>' +
      '<p class="sig">Brandon, college freshman</p></div>' +
      '<div><table class="ws-grid contents"><thead><tr><th class="rn"></th><th>What</th><th>Where it runs</th><th>Needs Claude?</th></tr></thead><tbody>' +
      crow(1, 'Plan, written lessons, both games', 'In this page', 'No') +
      crow(2, 'Voice practice', 'In this page, in Chrome, Edge or Safari. It times you and counts filler words.', 'No') +
      crow(3, 'Live Room', 'In this page, plus a shared room that holds nicknames and answer taps', 'No') +
      crow(4, 'Lessons that aren\'t written yet', 'A chat on your own Claude account, with your plan already in the prompt', 'Yes, free plan works') +
      crow(5, 'Grading and live mock interviews', 'Same: your own Claude account', 'Yes, free plan works') +
      '</tbody></table><p class="fn">Want all of it in one place? The <a href="' + AI_URL + '" target="_blank" rel="noopener">Claude version</a> runs the same coach inside Claude, with grading in the page.</p></div>' +
    '</div></section>' +

    '<section class="band alt" id="lessons"><div class="wrap"><div class="sec-row"><h2 class="sec-h">Start with these lessons</h2><a class="more" href="library/">All ' + lessons.length + ' lessons</a></div><ol class="lesson-ledger">' +
      featured.map((l, i) => '<li><a href="library/' + l.slug + '.html"><span class="n">' + (i + 1) + '</span><b>' + esc(l.title) + '</b><span class="where">' + esc(l.comes) + '</span></a></li>').join('') +
    '</ol></div></section>' +

    '<section class="band" id="faq"><div class="wrap two-col"><div><h2 class="sec-h">Questions</h2></div><div class="faq">' +
      faq('Do I need Claude?', 'Not for the games, the written lessons, voice practice or the scorecard. You do for lessons on topics that aren\'t in the library yet, for grading from an interviewer\'s point of view and for live mock interviews. A free Claude account works.') +
      faq('Is it free?', 'Yes. There\'s nothing to pay for here, and Claude\'s free plan works. A lot of use in one day can run into the free plan\'s usage limits.') +
      faq('Where is my data?', 'In this browser. Your plan, answers and game scores are not sent to a server. To move to another device, copy a backup code in Setup and restore it there. A Live Room is the exception: the nickname you type and your answer taps go to the room\'s database so the host screen can show them.') +
      faq('Does voice practice record me?', 'Recording uses your browser\'s built-in speech-to-text. In Chrome, the audio goes to Google to be transcribed; the transcript stays in your browser.') +
      faq('Who is this for?', 'College students recruiting for finance clubs, early insight programs and internships in banking, asset and wealth management, sales and trading, and the buy side. It\'s built for freshmen and sophomores, and it works for anyone starting out.') +
      faq('Is the content accurate?', 'The lessons cover standard interview material and get checked against the usual technical answers. Every Statement Flows event is tested to balance, and every Sprint answer is recomputed from its own question. Anything about this week\'s markets or a specific firm\'s dates changes fast, so the coach tells you what to look up.') +
      faq('What is the readiness score?', 'An estimate from your graded answers and game scores, by area, compared with how far along your plan is. It starts at zero and only moves when you answer something. It is a study aid, not a prediction.') +
      faq('Can I see the code?', 'Yes. It\'s open source on <a href="' + REPO_URL + '" target="_blank" rel="noopener">GitHub</a>.') +
    '</div></div></section>' +

    '<section class="footnotes"><div class="wrap"><ol><li>Lessons that aren\'t written yet, AI grading and live mock interviews open in your own Claude account, and a free one works. Everything else runs in this page.</li>' +
      '<li>Fonts load from Google Fonts, voice practice in Chrome sends audio to Google to be transcribed, and a Live Room shares your nickname and answer taps with the room.</li></ol></div></section>' +
    '</main>' +
    '<nav class="sheet-tabs" aria-label="Sections on this page">' + [['summary', 'Summary'], ['numbers', 'Numbers'], ['play', 'Play'], ['plan', 'Plan'], ['notes', 'Notes'], ['lessons', 'Lessons'], ['faq', 'Questions']].map((t, i) => '<a href="#' + t[0] + '"' + (i ? '' : ' aria-current="true"') + '>' + t[1] + '</a>').join('') + '</nav>' +
    siteFoot(0);
  const scripts = inlineScripts(['src/games.js', 'src/play.js']) + '\n<script>\nPlay.hero(document.getElementById("hero-sheet"));\n' +
    '(function(){var tabs=[].slice.call(document.querySelectorAll(".sheet-tabs a"));if(!("IntersectionObserver" in window))return;var on=function(id){tabs.forEach(function(a){if(a.getAttribute("href")==="#"+id)a.setAttribute("aria-current","true");else a.removeAttribute("aria-current");});};' +
    'var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)on(e.target.id);});},{rootMargin:"-45% 0px -50% 0px"});tabs.forEach(function(a){var s=document.getElementById(a.getAttribute("href").slice(1));if(s)io.observe(s);});})();\n</script>';
  return webPage({ title: NAME, description: TAGLINE, url: SITE_URL, css: siteCSS(), body, scripts, bodyClass: 'has-tabs' });
}
function playPage() {
  const body = siteTop(0, 'play') + '<main class="wrap play-main" id="play"><noscript>The games need JavaScript.</noscript></main>' + siteFoot(0);
  return webPage({ title: 'Play · ' + NAME, description: 'Two free games for finance interviews: a 60-second Mental Math Sprint and Statement Flows, where one event moves all three statements. Send a friend the same round.', url: SITE_URL + 'play.html', css: siteCSS(), body,
    scripts: inlineScripts(['src/games.js', 'src/play.js']) + '\n<script>\nPlay.mount(document.getElementById("play"));\n</script>' });
}
function livePage() {
  const body = siteTop(0, 'live') + '<main class="wrap live-main" id="live"><noscript>The Live Room needs JavaScript.</noscript></main>' + siteFoot(0);
  return webPage({ title: 'Live Room · ' + NAME, description: 'Host a live finance quiz: one screen shows the questions, everyone answers on their phone, and the leaderboard updates after each one.', url: SITE_URL + 'live.html', css: siteCSS(), body,
    scripts: '<script>\nconst FRC_LIVE_DB = ' + jsonForScript(LIVE_DB) + ';\n</script>\n' + inlineScripts(['src/games.js', 'src/qr.js', 'src/live.js']) + '\n<script>\nLive.mount(document.getElementById("live"));\n</script>' });
}
const faq = (q, a) => '<details class="faq-item"><summary>' + q + '</summary><p>' + a + '</p></details>';

/* ------------------------------------------------------------------ lesson library */
function libraryIndex(lessons) {
  const groups = CAT_ORDER.filter(c => lessons.some(l => l.cat === c));
  const body = siteTop(1, 'lib') + '<main class="wrap lib-main">' +
    '<div class="lib-head"><p class="eyebrow">Lesson library</p><h1 class="h-page">' + lessons.length + ' lessons on what first rounds actually ask</h1>' +
    '<p class="lede">Each lesson opens with an interview question to answer before you read, then the idea in plain English, a worked example, the trap most candidates fall into, and questions to answer out loud. Read them in any order, or <a href="../app.html">build a plan</a> and get them in the right order for your dates.</p></div>' +
    groups.map(c => '<section class="lib-group"><h2 class="lib-cat">' + esc(CAT_LABEL[c]) + '</h2><ol class="lib-list">' +
      lessons.filter(l => l.cat === c).map(l => '<li><a href="' + l.slug + '.html"><b>' + esc(l.title) + '</b><span class="note">' + esc(l.comes) + '</span></a></li>').join('') + '</ol></section>').join('') +
    '</main>' + siteFoot(1);
  return webPage({ title: 'Lesson library · ' + NAME, description: lessons.length + ' free lessons for finance interviews: accounting, valuation, markets, wealth management and fit questions.', url: SITE_URL + 'library/', css: siteCSS(), body });
}
function lessonPage(l, i, lessons) {
  const prev = lessons[i - 1], next = lessons[i + 1];
  const quiz = 'I\'m preparing for finance interviews. Quiz me on "' + l.title + '" one question at a time, starting with one I should answer out loud. After each answer, score it 1-5 (5 = would clearly pass a first round), say what worked, give the top fixes and a stronger 60-second version, then ask the follow-up a real interviewer would ask. Be accurate and don\'t invent figures.';
  const body = siteTop(1, 'lib') + '<main class="wrap lesson-page">' +
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="./">Lessons</a><span aria-hidden="true">/</span><span>' + esc(CAT_LABEL[l.cat]) + '</span></nav>' +
    '<header class="session-head"><div class="session-meta"><span class="chip">' + esc(E.CATS[l.cat].code) + '</span><span class="note">' + esc(E.CATS[l.cat].name) + '</span></div><h1 class="session-title">' + esc(l.title) + '</h1></header>' +
    '<article class="lesson">' + MD.renderLesson(l.md, { open: false }) + '</article>' +
    '<aside class="cta-box"><h2>Practice this out loud</h2><p>Build your plan to record your answers, score them against model answers, and get this lesson at the right point before your interviews.</p>' +
      '<div class="btn-row"><a class="btn primary" href="../app.html">Build my plan</a><a class="btn" href="https://claude.ai/new?q=' + encodeURIComponent(quiz) + '" target="_blank" rel="noopener">Quiz me in Claude<span class="ext" aria-hidden="true"> ↗</span></a></div></aside>' +
    '<nav class="pager" aria-label="More lessons">' + (prev ? '<a class="pg prev" href="' + prev.slug + '.html"><span class="note">Previous</span><b>' + esc(prev.title) + '</b></a>' : '<span></span>') +
      (next ? '<a class="pg next" href="' + next.slug + '.html"><span class="note">Next</span><b>' + esc(next.title) + '</b></a>' : '<span></span>') + '</nav>' +
    '</main>' + siteFoot(1) +
    '<script>document.addEventListener("toggle",function(e){var d=e.target;if(d.matches&&d.matches("details.sec-answers")){var r=d.querySelector(".reveal");if(r)r.textContent=d.open?"Hide":"Show";}},true);</script>';
  return webPage({ title: l.title + ' · ' + NAME, description: (l.comes ? l.comes + ' ' : '') + 'A free lesson from ' + NAME + '.', url: SITE_URL + 'library/' + l.slug + '.html', css: siteCSS(), body, ogType: 'article' });
}

/* ------------------------------------------------------------------ build */
const lessons = loadLessons();
const qa = buildAnswers();          // writes src/answers.js before the app is assembled
const parts = appParts(lessons);

write('dist/finance-recruiting-coach.html', buildArtifact(parts));
write('docs/app.html', webPage({ title: 'Your plan · ' + NAME, description: TAGLINE, url: SITE_URL + 'app.html', css: parts.css, body: parts.body, scripts: parts.scripts }));
write('docs/index.html', homePage(lessons));
write('docs/play.html', playPage());
write('docs/live.html', livePage());
fs.rmSync(rel('docs', 'library'), { recursive: true, force: true });       // drop pages for lessons that were renamed or removed
write('docs/library/index.html', libraryIndex(lessons));
lessons.forEach((l, i) => write('docs/library/' + l.slug + '.html', lessonPage(l, i, lessons)));
write('docs/404.html', webPage({ title: 'Page not found · ' + NAME, description: TAGLINE, url: SITE_URL + '404.html', css: siteCSS(),
  body: siteTop(0, '') + '<main class="wrap lib-main"><h1 class="h-page">That page isn\'t here.</h1><p class="lede">Try the <a href="' + SITE_URL + '">home page</a>, the <a href="' + SITE_URL + 'library/">lesson library</a> or <a href="' + SITE_URL + 'app.html">your plan</a>.</p></main>' }));
write('docs/.nojekyll', '');
fs.mkdirSync(rel('docs', 'assets'), { recursive: true });
fs.readdirSync(rel('assets')).filter(f => /\.png$/.test(f)).forEach(f => fs.copyFileSync(rel('assets', f), rel('docs', 'assets', f)));

const kb = f => (fs.statSync(rel(f)).size / 1024).toFixed(0) + ' KB';
console.log('built ' + lessons.length + ' lessons (' + lessons.reduce((s, l) => s + l.words, 0).toLocaleString() + ' words)');
console.log('  dist/finance-recruiting-coach.html  ' + kb('dist/finance-recruiting-coach.html'));
console.log('  docs/index.html ' + kb('docs/index.html') + ' · docs/app.html ' + kb('docs/app.html') + ' · docs/play.html ' + kb('docs/play.html') + ' · docs/live.html ' + kb('docs/live.html') + ' · docs/library/ ' + (lessons.length + 1) + ' pages');
console.log('  model answers for ' + qa.count + ' of ' + E.QUESTIONS.length + ' practice questions');
if (qa.missing.length) console.log('  note: no model answer yet for: ' + qa.missing.map(t => '"' + t + '"').join(', '));
