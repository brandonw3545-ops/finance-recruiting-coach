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
const MD = require('./src/md.js');
const esc = MD.esc;

const SITE_URL = 'https://brandonw3545-ops.github.io/finance-recruiting-coach/';
const AI_URL = 'https://claude.ai/artifact/3QqSwrzAPJCeFJCW95Kayn';
const REPO_URL = 'https://github.com/brandonw3545-ops/finance-recruiting-coach';
const NAME = 'Finance Recruiting Coach';
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

function webPage({ title, description, url, css, body, scripts, ogType }) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(description) + '">' +
    '<meta name="claude:viewport-fit-sides" content="cover">' +
    '<link rel="icon" href="' + FAVICON + '"><link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:type" content="' + (ogType || 'website') + '"><meta property="og:site_name" content="' + NAME + '"><meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(description) + '"><meta property="og:url" content="' + esc(url) + '"><meta property="og:image" content="' + SITE_URL + 'assets/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    FONTS + '<style>' + RESET + '\n' + inlineSafe('css', css) + '</style></head><body>' + body + (scripts || '') + '</body></html>\n';
}

/* ------------------------------------------------------------------ the app */
function appParts(lessons) {
  const LIB = {};
  lessons.forEach(l => { LIB[l.id] = { title: l.title, cat: l.cat, slug: l.slug, md: l.md, answers: l.answers }; });
  const files = ['src/md.js', 'src/answers.js', 'src/engine.js', 'src/prompts.js', 'src/calendar.js', 'src/voice.js'];
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
const siteCSS = () => read('src/styles.css') + '\n' + read('src/site.css');
function siteTop(depth, active) {
  const up = '../'.repeat(depth);
  const link = (href, label, key) => '<a href="' + up + href + '"' + (active === key ? ' aria-current="page"' : '') + '>' + label + '</a>';
  return '<header class="site-top"><div class="wrap site-top-row"><a class="brand" href="' + (up || './') + '">' + MARK_SVG + '<span class="brand-name">' + NAME + '</span></a>' +
    '<nav class="site-nav" aria-label="Site">' + link('library/', 'Lessons', 'lib') + link('#how', 'How it works', 'how') + link('#faq', 'FAQ', 'faq') +
    '<a class="btn primary small" href="' + up + 'app.html">Build my plan</a></nav></div></header>';
}
function siteFoot(depth) {
  const up = '../'.repeat(depth);
  return '<footer class="site-foot"><div class="wrap site-foot-row"><div><div class="brand-name">' + NAME + '</div><p class="note">Made by a college freshman who was preparing for the same interviews. Free, no ads, and it runs on your own Claude account. Not affiliated with any bank, school or Anthropic.</p></div>' +
    '<nav class="foot-nav" aria-label="More"><a href="' + up + 'app.html">The coach</a><a href="' + up + 'library/">Lesson library</a><a href="' + AI_URL + '" target="_blank" rel="noopener">Claude version</a><a href="' + REPO_URL + '" target="_blank" rel="noopener">Source on GitHub</a></nav></div></footer>';
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
function homePage(lessons) {
  const ex = examplePlanHTML();
  const pick = ['acc-the-three-financial-statements-what-each-one-tel', 'val-walk-me-through-a-dcf-the-60-second-answer-and-t', 'val-equity-value-vs-enterprise-value-the-house-and-m', 'car-tell-me-about-yourself-turning-your-resume-into-', 'mkt-bonds-101-coupons-maturities-and-why-prices-and-', 'awm-asset-management-vs-wealth-management-what-each-'];
  const featured = pick.map(id => lessons.find(l => l.id === id)).filter(Boolean).concat(lessons).filter((l, i, a) => a.indexOf(l) === i).slice(0, 6);
  const body = siteTop(0, '') + '<main>' +
    '<section class="hero"><div class="wrap hero-grid"><div class="hero-copy">' +
      '<p class="eyebrow">For college students recruiting for finance</p>' +
      '<h1 class="hero-h">Walk into your first finance interview ready.</h1>' +
      '<p class="hero-sub">Tell it your school, your goals and the dates that matter. It builds a day-by-day plan to your interview, teaches one lesson a day, and drills you out loud until the answers come easily.</p>' +
      '<div class="btn-row hero-cta"><a class="btn primary big" href="app.html">Build my plan</a><a class="btn big" href="library/">Read the ' + lessons.length + ' lessons</a></div>' +
      '<p class="note">Free. You\'ll need a Claude account, and the free plan works. Setup takes about five minutes, and your plan stays in your browser.</p></div>' +
      '<figure class="demo" aria-label="Example: part of a plan for a sophomore aiming for banking">' +
        '<div class="demo-head"><span class="ex-flag">Example plan · a sophomore aiming for banking</span><span class="mono note">' + ex.total + ' study days</span></div>' +
        '<ol class="ex-list">' + ex.rows + '</ol>' +
        '<div class="demo-score"><div class="score s-hi sm" role="img" aria-label="Score 4 out of 5">4<small>/5</small></div><div><b>Say it out loud:</b> "Walk me through a DCF."<div class="mono note">0:58 · 142 wpm · 1 filler · back for review in 3 days</div></div></div>' +
        '<figcaption class="legend-model"><span class="b-in"><b>Blue</b> is what you enter</span><span class="b-out"><b>Black</b> is what the coach builds</span><span class="b-ln"><b>Green</b> ties a session to your dates</span></figcaption>' +
      '</figure></div></section>' +

    '<section class="band" id="how"><div class="wrap"><h2 class="sec-h">How it works</h2><ol class="steps">' +
      '<li><span class="step-n">1</span><h3>Plug in your dates</h3><p>Your school, the seats you want, your goals, and every deadline, club interview and info session you know about. Not sure of the dates? It can suggest typical ones.</p></li>' +
      '<li><span class="step-n">2</span><h3>Learn one thing a day</h3><p>A plan paced to the date you want to be interview-ready: the three statements before DCFs, fit questions before your first interview, and a prep session before every date you entered.</p></li>' +
      '<li><span class="step-n">3</span><h3>Say it out loud</h3><p>Answer each question out loud and score it against a model answer. Anything you miss comes back in 1, 3, 7 and 14 days, and mock interviews tell you if you\'d advance.</p></li>' +
    '</ol></div></section>' +

    '<section class="band alt"><div class="wrap"><h2 class="sec-h">What you get</h2><div class="features">' +
      feature('LESSONS', 'A lesson a day', lessons.length + ' written lessons on the questions first rounds actually ask, from the three statements to "walk me through a DCF". Each opens with a question to answer before you read.') +
      feature('PREP', 'Prep before every date', 'Add a deadline or interview and the plan schedules prep before it: a checklist for applications, a mock the day before an interview, a warm-up that morning.') +
      feature('VOICE', 'Practice out loud', 'Record your answer and see your time, pace and filler words, then compare it with a model answer. Interviews are spoken, so practice should be too.') +
      feature('MOCK', 'Mock interviews', 'Five questions the way a first round runs, each with the follow-up interviewers usually ask. Score yourself, or run a live one in Claude that reacts to what you say.') +
      feature('REVIEW', 'Spaced repetition', 'Miss a question and it comes back the next day, then after 3, 7 and 14 days, until you have it cold.') +
      feature('CALENDAR', 'Reminders on your phone', 'Add the whole plan to Google or Apple Calendar in one tap. Each morning\'s session shows up with a link straight to it.') +
    '</div></div></section>' +

    '<section class="band" id="ai"><div class="wrap two-col"><div><h2 class="sec-h">What you need Claude for</h2></div><div class="prose">' +
      '<p>You\'ll need a Claude account, and the free plan works. The site itself runs no AI and has no server: your plan, the written lessons, practice, voice and the scorecard all work right here, in your browser.</p>' +
      '<p>Claude does the rest. It writes the lessons that aren\'t in the library yet, grades your answers the way an interviewer would, and runs live mock interviews that push back on what you say. Each of those buttons opens a new chat on <b>your own Claude account</b> with your plan already in the prompt.</p>' +
      '<p>Prefer everything in one place? The <a href="' + AI_URL + '" target="_blank" rel="noopener">Claude version</a> runs the same coach inside Claude, with grading and a chat coach that can edit your plan.</p>' +
    '</div></div></section>' +

    '<section class="band alt"><div class="wrap"><div class="sec-row"><h2 class="sec-h">Start with these lessons</h2><a class="more" href="library/">All ' + lessons.length + ' lessons</a></div><ul class="lib-cards">' +
      featured.map(l => '<li><a href="library/' + l.slug + '.html"><span class="chip">' + esc(E.CATS[l.cat].code) + '</span><b>' + esc(l.title) + '</b><span class="note">' + esc(l.comes) + '</span></a></li>').join('') +
    '</ul></div></section>' +

    '<section class="band" id="faq"><div class="wrap two-col"><div><h2 class="sec-h">Questions</h2></div><div class="faq">' +
      faq('Do I need Claude?', 'Yes, for the full plan, and the free plan works. Lessons on topics that aren\'t in the library yet, grading from an interviewer\'s point of view and live mock interviews all happen in Claude. The written lessons, voice practice, reviews and the scorecard work without it.') +
      faq('Is it free?', 'Yes. There\'s nothing to pay for here, and Claude\'s free plan works. A lot of use in one day can run into the free plan\'s usage limits.') +
      faq('Where is my data?', 'In this browser only. Nothing is sent to a server. To move to another device, copy a backup code in Setup and restore it there.') +
      faq('Does voice practice record me?', 'Recording uses your browser\'s built-in speech-to-text. In Chrome, the audio goes to Google to be transcribed; the transcript stays in your browser.') +
      faq('Who is this for?', 'College students recruiting for finance clubs, early insight programs and internships in banking, asset and wealth management, sales and trading, and the buy side. It\'s built for freshmen and sophomores, and it works for anyone starting out.') +
      faq('Is the content accurate?', 'The lessons cover standard interview material and get checked against the usual technical answers. Anything about this week\'s markets or a specific firm\'s dates changes fast, so the coach tells you what to look up.') +
      faq('Can I see the code?', 'Yes. It\'s open source on <a href="' + REPO_URL + '" target="_blank" rel="noopener">GitHub</a>.') +
    '</div></div></section>' +

    '<section class="band cta-band"><div class="wrap cta-row"><h2 class="sec-h">Your first lesson takes about 20 minutes.</h2><a class="btn primary big" href="app.html">Build my plan</a></div></section>' +
    '</main>' + siteFoot(0);
  return webPage({ title: NAME, description: TAGLINE, url: SITE_URL, css: siteCSS(), body });
}
const feature = (code, h, p) => '<div class="feature"><span class="chip">' + code + '</span><h3>' + h + '</h3><p>' + p + '</p></div>';
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
fs.rmSync(rel('docs', 'library'), { recursive: true, force: true });       // drop pages for lessons that were renamed or removed
write('docs/library/index.html', libraryIndex(lessons));
lessons.forEach((l, i) => write('docs/library/' + l.slug + '.html', lessonPage(l, i, lessons)));
write('docs/404.html', webPage({ title: 'Page not found · ' + NAME, description: TAGLINE, url: SITE_URL + '404.html', css: siteCSS(),
  body: siteTop(0, '') + '<main class="wrap lib-main"><h1 class="h-page">That page isn\'t here.</h1><p class="lede">Try the <a href="' + SITE_URL + '">home page</a>, the <a href="' + SITE_URL + 'library/">lesson library</a> or <a href="' + SITE_URL + 'app.html">your plan</a>.</p></main>' }));
write('docs/.nojekyll', '');
if (fs.existsSync(rel('assets', 'og.png'))) { fs.mkdirSync(rel('docs', 'assets'), { recursive: true }); fs.copyFileSync(rel('assets', 'og.png'), rel('docs', 'assets', 'og.png')); }

const kb = f => (fs.statSync(rel(f)).size / 1024).toFixed(0) + ' KB';
console.log('built ' + lessons.length + ' lessons (' + lessons.reduce((s, l) => s + l.words, 0).toLocaleString() + ' words)');
console.log('  dist/finance-recruiting-coach.html  ' + kb('dist/finance-recruiting-coach.html'));
console.log('  docs/index.html ' + kb('docs/index.html') + ' · docs/app.html ' + kb('docs/app.html') + ' · docs/library/ ' + (lessons.length + 1) + ' pages');
console.log('  model answers for ' + qa.count + ' of ' + E.QUESTIONS.length + ' practice questions');
if (qa.missing.length) console.log('  note: no model answer yet for: ' + qa.missing.map(t => '"' + t + '"').join(', '));
