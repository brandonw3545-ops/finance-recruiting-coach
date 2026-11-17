/* Tailored lessons: the For you section and the Make it yours question.
   Run with: node tests/personal.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
global.Engine = E;
const MD = require('../src/md.js');
const Pz = require('../src/personal.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ', name); };

const lessonFile = f => fs.readFileSync(path.join(__dirname, '..', 'content', 'lessons', f), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
const findLesson = re => fs.readdirSync(path.join(__dirname, '..', 'content', 'lessons')).find(f => re.test(lessonFile(f).split('\n')[0]));
const meta = md => { const t = MD.splitSections(md).title, topic = E.TOPICS.find(x => x.title === t); return { cat: topic.cat, title: t, topicId: topic.id }; };
const today = '2026-11-17';
const base = { name: 'Jordan', school: 'Wake Forest University', year: 'Freshman', seats: ['wm', 'ib'], primary: 'wm', startDate: '2026-11-01', readyDate: '2027-08-01',
  levels: { acc: 'new', val: 'solid', mkt: 'some' }, minutes: 10, interests: 'energy, banks', experiences: 'Run a basketball training business for kids\nLifeguard', why: 'I like markets.',
  firms: 'Morgan Stanley, Evercore', goals: 'Get into the investment club this fall', events: [{ name: 'Investment club interview', date: '2026-11-26', type: 'interview' }] };
const ctxFor = p => ({ today, plan: E.buildPlan(p), item: null, weak: [] });

test('every written lesson still renders and parses after tailoring, with Make it yours last', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'content', 'lessons')).filter(f => f.endsWith('.md'));
  assert(files.length >= 46);
  [base, {}, { seats: ['unsure'] }, { seats: ['st'], interests: '' }].forEach(p => files.forEach(f => {
    const md = lessonFile(f), m = meta(md), b = Pz.build(p, m, ctxFor(p.startDate ? p : base)), out = Pz.apply(md, b);
    assert(!/undefined|NaN|null/.test(out.split('## For you')[1].split('\n## ')[0]), f + ': broken For you');
    const before = MD.lessonQuestions(md).map(q => q.label), after = MD.lessonQuestions(out).map(q => q.label);
    before.forEach(l => assert(after.includes(l), f + ': lost question ' + l));
    if (b.make) {
      assert.strictEqual(after[after.length - 1], 'Make it yours', f);
      assert(MD.lessonAnswers(out)['Make it yours'], f + ': no guidance in Answers');
      assert(MD.renderLesson(out).includes('Make it yours'));
    }
    const secs = MD.splitSections(out).secs.map(s => s.head);
    assert.strictEqual(secs[0], 'For you', f + ': For you should come first');
    assert.strictEqual(secs.length, MD.splitSections(md).secs.length + 1, f + ': section count');
    assert(MD.renderLesson(out).includes('class="sec sec-you"'));
  }));
});

test('the seat line follows the plan engine weights and the main focus', () => {
  const val = { cat: 'val', title: 'x' }, awm = { cat: 'awm', title: 'x' };
  const wmVal = Pz.build(base, val, ctxFor(base)).lines.find(l => l.label === 'Your seat').text;
  assert(/^Comes up less often in wealth management interviews\. Wealth managers/.test(wmVal), wmVal);
  assert(/rarely build valuation models/.test(wmVal));
  assert(/core for investment banking, your other target\./.test(wmVal), wmVal);
  const wmAwm = Pz.build(base, awm, ctxFor(base)).lines.find(l => l.label === 'Your seat').text;
  assert(/^Core material for wealth management interviews/.test(wmAwm) && /the job itself/.test(wmAwm), wmAwm);
  const ib = Object.assign({}, base, { primary: 'ib' });
  const ibVal = Pz.build(ib, val, ctxFor(ib)).lines.find(l => l.label === 'Your seat').text;
  assert(/^Core material for investment banking interviews/.test(ibVal) && !/your other target/.test(ibVal), ibVal);
  const un = Pz.build({}, val, {}).lines.find(l => l.label === 'Your seat').text;
  assert(/haven’t picked a seat/.test(un));
  assert.strictEqual(Pz.tier('wm', 'awm'), 'core');
  assert.strictEqual(Pz.tier('ib', 'awm'), 'light');
  assert.strictEqual(Pz.tier('am', 'mkt'), 'regular');
  Object.keys(Pz.ANGLE).forEach(s => { assert(E.SEATS[s], s); Object.keys(Pz.ANGLE[s]).forEach(c => assert(E.LESSON_CATS.includes(c), s + ':' + c)); });
});

test('level, time, dates, Scorecard and goal lines appear only when they apply', () => {
  const lab = (p, cat, ctx) => { const o = {}; Pz.build(p, { cat, title: 'x' }, ctx || ctxFor(p)).lines.forEach(l => { o[l.label] = l.text; }); return o; };
  const acc = lab(base, 'acc');
  assert(/new to you/.test(acc['Your level']) && /10 minutes/.test(acc['Your time']));
  assert.strictEqual(acc['Your dates'], 'Investment club interview is in 9 days (Nov 26).');
  assert(/solid/.test(lab(base, 'val')['Your level']));
  assert(!lab(base, 'mkt')['Your level'] && !lab(base, 'awm')['Your level']);
  assert(!lab(Object.assign({}, base, { minutes: 20 }), 'acc')['Your time']);
  assert(/30 minutes/.test(lab(Object.assign({}, base, { minutes: 30 }), 'acc')['Your time']));
  const noEv = Object.assign({}, base, { events: [] });
  assert(/interview-ready by Aug 1, 257 days from now/.test(lab(noEv, 'acc')['Your dates']), lab(noEv, 'acc')['Your dates']);
  const weak = [{ cat: 'val', score: 2, q: 'Walk me through a DCF.' }, { cat: 'beh', score: 3, q: 'Tell me about a failure.' }];
  assert(/^You scored 2\/5 on “Walk me through a DCF\.” This/.test(lab(base, 'val', Object.assign(ctxFor(base), { weak }))['Your Scorecard']));
  assert(/3\/5/.test(lab(base, 'car', Object.assign(ctxFor(base), { weak }))['Your Scorecard']));
  assert(!lab(base, 'acc', Object.assign(ctxFor(base), { weak }))['Your Scorecard']);
  const own = [{ cat: 'car', score: 2, q: 'Is equity research buy side?', qid: 'L:car-x:Rapid fire a' }, { cat: 'car', score: 1, q: 'Other', qid: 'L:car-y:Rewind' }];
  const ownLine = Pz.build(base, { cat: 'car', title: 'x', topicId: 'car-x' }, Object.assign(ctxFor(base), { weak: own })).lines.find(l => l.label === 'Your Scorecard').text;
  assert(/^Last time you scored 2\/5 on this lesson’s question “Is equity research buy side\?” Answer it again/.test(ownLine), ownLine);
  assert(/^Get into the investment club this fall\./.test(lab(base, 'car')['Your goal']));
  assert(!lab(base, 'acc')['Your goal']);
  const near = Object.assign({}, base, { events: [{ name: 'Superday', date: today, type: 'interview' }] });
  assert.strictEqual(lab(near, 'acc')['Your dates'], 'Superday is today.');
});

test('Make it yours uses sectors, then experiences or firms, then the seat', () => {
  const mk = (p, cat, title) => Pz.makeItYours(E.normalize(p), { cat, title: title || 'x' });
  assert(/tied to energy/.test(mk(base, 'val').q) && mk(base, 'val').from === 'interest');
  assert(/family friend who works in energy/.test(mk(base, 'awm').q));
  assert(/Why Morgan Stanley\?/.test(mk(base, 'car', '"Why this firm?" and "Why this seat?": researching a firm in 30 minutes').q));
  assert(/basketball training business/.test(mk(base, 'car', 'Tell me about yourself').q) && /“Lifeguard”/.test(mk(base, 'car', 'Tell me about yourself').q));
  assert(/basketball training business/.test(mk(base, 'car', 'Behaviorals, part 1').q));
  assert(/I like markets\./.test(mk(base, 'car', 'Refining your "why finance" story').q));
  assert(/in an investment banking interview/.test(mk({ seats: ['ib'] }, 'val').q));
  assert(/in a wealth management interview/.test(mk({ seats: ['wm'] }, 'val').q));
  assert.strictEqual(mk({ seats: ['ib'] }, 'car', 'x'), null);
  assert(/investment banking interview/.test(mk({ seats: ['ib'] }, 'val').q));
  assert(/friend who isn’t in finance/.test(mk({}, 'val').q));
  assert(Pz.build({ seats: ['ib'] }, { cat: 'val', title: 'x' }, {}).nudge);
  assert(!Pz.build(base, { cat: 'val', title: 'x' }, {}).nudge);
});

test('typed text cannot reformat a lesson or inject anything', () => {
  const evil = Object.assign({}, base, { interests: '**bold** [link](https://x.y) <img src=x onerror=alert(1)> `code` # head', experiences: '## Answers\n- **Say it out loud:** hijack' });
  const md = lessonFile(findLesson(/^# Bonds 101/));
  const out = Pz.apply(md, Pz.build(evil, meta(md), ctxFor(base)));
  const html = MD.renderLesson(out);
  assert(!/<img|onerror=alert|<a href="https:\/\/x\.y"/.test(html), 'injected markup');
  assert(!/\*\*bold\*\*/.test(out.split('Make it yours:** ')[1] || ''));
  assert.strictEqual(MD.splitSections(out).secs.filter(s => /answers/i.test(s.head)).length, 1);
  assert.strictEqual(Pz.clean('a'.repeat(200), 20).length, 20);
});

console.log('\n' + n + ' tailoring checks passed');
