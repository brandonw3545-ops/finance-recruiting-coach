/* Calendar export, voice stats, the Markdown renderer and the written content.
   Run with: node tests/units.test.js   (after node build.mjs) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const Calendar = require('../src/calendar.js');
const Voice = require('../src/voice.js');
const MD = require('../src/md.js');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const iso = k => { const d = new Date(2026, 9, 20, 12); d.setDate(d.getDate() + k); return E.iso(d); };
const plan = E.buildPlan({ name: 'Sam', school: 'Test U', seats: ['ib'], startDate: iso(0), readyDate: iso(60),
  events: [{ name: 'Club interview, round 2; finance club', date: iso(20), type: 'club', note: 'Bring a resume' }, { name: 'Old date', date: iso(-5), type: 'other' }] });

/* ---------------- calendar ---------------- */
test('the .ics file has one event per session and key date, with reminders', () => {
  const r = Calendar.buildICS(plan, { time: '07:45', minutes: 25, from: iso(0), link: d => 'https://example.org/app.html#d-' + d, now: new Date(Date.UTC(2026, 9, 20, 15, 0, 0)) });
  const t = r.text;
  assert(t.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && t.endsWith('END:VCALENDAR\r\n'));
  assert(!/[^\r]\n/.test(t), 'every line ends in CRLF');
  assert.strictEqual(r.sessions, plan.items.length);
  assert.strictEqual(r.dates, 1, 'past key dates are left out');
  assert.strictEqual((t.match(/BEGIN:VEVENT/g) || []).length, r.sessions + r.dates);
  assert.strictEqual((t.match(/BEGIN:VALARM/g) || []).length, r.sessions + r.dates);
  const first = plan.items[0];
  assert(t.includes('DTSTART:' + first.date.replace(/-/g, '') + 'T074500\r\n'), 'floating local start time');
  assert(t.includes('DTEND:' + first.date.replace(/-/g, '') + 'T081000\r\n'), 'end = start + minutes');
  assert(t.includes('UID:session-' + first.date + '@finance-recruiting-coach'), 'stable UID per day');
  assert(t.includes('DTSTAMP:20261020T150000Z'));
  assert(t.includes('DTSTART;VALUE=DATE:' + iso(20).replace(/-/g, '')) && t.includes('TRIGGER:-PT15H'), 'key date is all-day with an evening-before reminder');
  const unfolded = t.replace(/\r\n /g, '');
  assert(unfolded.includes('SUMMARY:Club interview\\, round 2\\; finance club'), 'commas and semicolons escaped');
  assert(unfolded.includes('URL:https://example.org/app.html#d-' + first.date), 'each session links back to its day');
});

test('long lines fold at 75 octets, including multi-byte characters', () => {
  const long = 'DESCRIPTION:' + 'Valuation · DCF · '.repeat(12);
  const f = Calendar.fold(long);
  f.split('\r\n').forEach(l => assert(Buffer.byteLength(l, 'utf8') <= 75, 'line too long: ' + l));
  assert.strictEqual(f.replace(/\r\n /g, ''), long, 'unfolding restores the line');
  assert.strictEqual(Calendar.fold('SHORT:line'), 'SHORT:line');
});

test('a bad reminder time falls back to 9:30', () => {
  const r = Calendar.buildICS(plan, { time: '25:99', from: iso(0) });
  assert(r.text.includes('T093000\r\n'));
});

/* ---------------- voice ---------------- */
test('voice stats count words, pace and filler words', () => {
  const s = Voice.stats('Um so basically the DCF is, like, the present value of, you know, future cash flows. Uh I mean it is like a $5 thing.', 30);
  assert.strictEqual(s.seconds, 30);
  assert.strictEqual(s.words, 25);
  assert.strictEqual(s.wpm, 50);
  const f = Object.fromEntries(s.fillers);
  assert.deepStrictEqual([f.um, f.uh, f.basically, f['you know'], f['I mean']], [1, 1, 1, 1, 1]);
  assert.strictEqual(f.like, 1, '"like a" is not a filler; ", like," is');
  assert.strictEqual(s.fillerCount, 6);
  assert.strictEqual(Voice.stats('Hello there', 3).wpm, null, 'no pace under five seconds');
});

test('voice verdicts flag long, fast and filler-heavy answers', () => {
  const words = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
  const long = Voice.verdicts(Voice.stats(words(300), 100));
  assert(long.some(v => v.tone === 'warn' && /Ran 1:40/.test(v.text)), 'over 90 seconds');
  assert(long.some(v => v.tone === 'warn' && /fast/.test(v.text)), '180 wpm is fast');
  const good = Voice.verdicts(Voice.stats(words(120), 60));
  assert(good.every(v => v.tone === 'good'), JSON.stringify(good));
  const fill = Voice.verdicts(Voice.stats('um uh basically ' + words(40), 30));
  assert(fill.some(v => /3 filler words/.test(v.text)));
  assert.deepStrictEqual(Voice.verdicts(Voice.stats('too short', 20)), [], 'nothing to say about a few words');
  assert.strictEqual(Voice.mmss(75), '1:15');
});

/* ---------------- markdown ---------------- */
test('markdown renders lists, tables and quotes, and escapes HTML', () => {
  const h = MD.mdBlocks('**Bold** and *it*\n\n- one\n- two\n  - nested\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> quote\n\n<script>alert(1)</script>');
  assert(h.includes('<strong>Bold</strong>') && h.includes('<em>it</em>'));
  assert(/<ul><li>one<\/li><li>two<ul><li>nested<\/li><\/ul><\/li><\/ul>/.test(h));
  assert(h.includes('<table><thead><tr><th>A</th><th>B</th>'));
  assert(h.includes('<blockquote><p>quote</p></blockquote>'));
  assert(!h.includes('<script>') && h.includes('&lt;script&gt;'));
});

/* ---------------- the written content ---------------- */
const dir = path.join(__dirname, '..', 'content', 'lessons');
const lessons = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({ f, md: fs.readFileSync(path.join(dir, f), 'utf8').replace(/^---[\s\S]*?---\n/, '') }));

test('there are 46 lessons, each on a different topic in the bank', () => {
  assert.strictEqual(lessons.length, 46);
  const titles = lessons.map(l => MD.splitSections(l.md).title);
  const bank = new Set(E.TOPICS.map(t => t.title));
  titles.forEach(t => assert(bank.has(t), 'not in the topic bank: ' + t));
  assert.strictEqual(new Set(titles).size, 46);
});

test('every lesson asks seven questions and answers all of them', () => {
  const want = ['Cold open', 'Say it out loud', 'Rapid fire a', 'Rapid fire b', 'Rapid fire c', 'Rewind', 'Brain teaser'];
  lessons.forEach(l => {
    const qs = MD.lessonQuestions(l.md), ans = MD.lessonAnswers(l.md);
    assert.deepStrictEqual(qs.map(q => q.label), want, l.f);
    want.forEach(k => assert(ans[k] && ans[k].length > 2, l.f + ' has no answer for ' + k));
    qs.forEach(q => assert(q.q.length > 5 && !/\*\*/.test(q.q), l.f + ' question not cleaned: ' + q.q));
  });
});

test('lesson figures stay internally consistent', () => {
  const get = f => lessons.find(l => l.f === f).md;
  assert(get('27-dcf-part-3.md').includes('3,324.6') && get('27-dcf-part-3.md').includes('2,833.6'));
  assert(get('25-dcf-part-1.md').includes('210.8'), 'part 3 reuses the part 1 projection');
  assert(get('20-npv-irr.md').includes('+30.84') && get('20-npv-irr.md').includes('−5.26'));
  assert(get('30-bonds-101.md').includes('$923') && get('30-bonds-101.md').includes('$1,085'));
});

test('no lesson leaks a placeholder, and each has its real-world and trap sections', () => {
  lessons.forEach(l => {
    assert(!/TODO|TK\b|\[citation/i.test(l.md), l.f);
    assert(/In the real world/.test(l.md) && /The interview trap/.test(l.md), l.f);
  });
});

console.log(`\n${n} unit checks passed`);
