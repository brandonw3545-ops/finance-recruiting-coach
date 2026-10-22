/* Plan engine checks. Run with: node tests/engine.test.js */
const assert = require('assert');
const E = require('../src/engine.js');

const iso = n => { const d = new Date(2026, 9, 20, 12); d.setDate(d.getDate() + n); return E.iso(d); };
const base = { school: 'Test University', seats: ['ib'], startDate: iso(0), readyDate: iso(180) };
const plan = p => { const r = E.buildPlan(Object.assign({}, base, p)); assert(!r.error, r.error); return r; };
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ', name); };

test('every session key is unique, across many profiles', () => {
  const profiles = [
    {}, { seats: ['wm', 'am', 'ib'], primary: 'wm' }, { seats: ['st'], studyDays: [1, 3, 5] }, { seats: ['unsure'] },
    { seats: ['pe'], readyDate: iso(20) }, { seats: ['vc'], readyDate: iso(1000) }, { seats: ['hf'], studyDays: [6], mockDay: 6 },
    { firms: 'Goldman Sachs, Evercore, Lazard, Moelis, Centerview, PJT, Guggenheim, Jefferies, Houlihan Lokey' },
  ];
  profiles.forEach(p => {
    const r = plan(p), keys = new Set(r.items.map(i => i.key));
    assert.strictEqual(keys.size, r.items.length, 'duplicate keys for ' + JSON.stringify(p));
  });
});

test('one session per study day, only on study days', () => {
  const r = plan({ studyDays: [1, 3, 5] });
  const dates = r.items.map(i => i.date);
  assert.strictEqual(new Set(dates).size, dates.length);
  r.items.forEach(i => assert([1, 3, 5].includes(E.parseISO(i.date).getDay())));
});

test('mock interviews stay a minority of sessions, even at one study day a week', () => {
  [[0, 1, 2, 3, 4, 5, 6], [1, 3, 5], [2, 6], [6]].forEach(days => {
    [20, 90, 180, 365].forEach(len => {
      const r = plan({ studyDays: days, mockDay: days[days.length - 1], readyDate: iso(len) });
      const share = r.counts.mock / r.total;
      assert(share <= 0.4, `mocks are ${Math.round(share * 100)}% with ${days.length} days/week over ${len} days`);
    });
  });
});

test('each key date gets prep before it, and an interview gets a day-of session', () => {
  const r = plan({ events: [
    { name: 'Club application', date: iso(30), type: 'club' },
    { name: 'First round', date: iso(60), type: 'interview' },
    { name: 'Info session', date: iso(45), type: 'networking' },
  ] });
  const forEv = name => r.items.filter(i => i.event && i.event.name === name);
  assert(forEv('Club application').length >= 1 && forEv('Club application').every(i => i.date < iso(30)));
  const fr = forEv('First round');
  assert(fr.some(i => i.sub === 'day' && i.date === iso(60)), 'interview day session');
  assert(fr.some(i => i.kind === 'mock' && i.date < iso(60)), 'mock before the interview');
  assert(forEv('Info session').every(i => i.date < iso(45)));
});

test('an event after the ready date extends the plan into recruiting season', () => {
  const r = plan({ readyDate: iso(90), events: [{ name: 'Superday', date: iso(150), type: 'interview' }] });
  assert.strictEqual(r.end, iso(150));
  assert.strictEqual(r.phases[r.phases.length - 1].name, 'Recruiting season');
});

test('short timelines become a sprint with a final mock', () => {
  const r = plan({ readyDate: iso(14) });
  assert.deepStrictEqual(r.phases.map(p => p.name), ['Sprint']);
  assert(r.items.slice(-4).some(i => i.kind === 'mock'));
});

test('"solid" levels swap the basics for a refresher', () => {
  const r = plan({ levels: { acc: 'solid', val: 'some', mkt: 'some' } });
  const acc = r.items.filter(i => i.kind === 'lesson' && i.cat === 'acc');
  assert(/refresher/i.test(acc[0].title));
  assert(!acc.some(i => i.title === 'The income statement, line by line'));
});

test('seat filters keep wealth-only topics away from a banking-only plan', () => {
  const r = plan({ seats: ['ib'], readyDate: iso(365) });
  assert(!r.items.some(i => i.title.startsWith('Estate planning basics')));
  const w = plan({ seats: ['wm'], readyDate: iso(365) });
  assert(w.items.some(i => i.title.startsWith('Estate planning basics')));
});

test('firms on the list get "Why us?" deep-dives before the ready date', () => {
  const r = plan({ firms: 'Evercore, Morgan Stanley', readyDate: iso(200) });
  const firms = r.items.filter(i => i.kind === 'firm').map(i => i.firm);
  assert.deepStrictEqual(firms.sort(), ['Evercore', 'Morgan Stanley']);
  r.items.filter(i => i.kind === 'firm').forEach(i => assert(i.date <= r.ready));
});

test('goals are split one per line; legacy "target" still counts', () => {
  assert.deepStrictEqual(E.normalize({ goals: '- Join the investment club\n\nLand a summer internship' }).goalList, ['Join the investment club', 'Land a summer internship']);
  assert.deepStrictEqual(E.normalize({ target: 'Sophomore internship' }).goalList, ['Sophomore internship']);
});

test('validation catches the missing basics', () => {
  const errs = E.validate({ seats: [], startDate: iso(0), readyDate: iso(3) });
  assert(errs.school && errs.seats && errs.readyDate);
  assert.deepStrictEqual(E.validate(base), {});
});

test('plans are deterministic for the same profile', () => {
  const p = { seats: ['am', 'wm'], events: [{ name: 'App', date: iso(40), type: 'application' }] };
  assert.strictEqual(JSON.stringify(plan(p).items), JSON.stringify(plan(p).items));
});

test('every practice question has a model answer and a usual follow-up', () => {
  const missing = E.QUESTIONS.filter(q => !q.answer || !q.followUp).map(q => q.text);
  assert.deepStrictEqual(missing, [], 'run node build.mjs to regenerate src/answers.js');
  assert.strictEqual(E.questionById(E.QUESTIONS[33].id).text, 'Walk me through a DCF.');
  assert.strictEqual(E.questionById('nope'), null);
});

test('templated questions fill in the seat, role and a firm', () => {
  const p = E.normalize(Object.assign({}, base, { seats: ['wm'], firms: 'UBS' }));
  assert.strictEqual(E.fillQuestion('Why {seat}?', p), 'Why wealth management?');
  assert.strictEqual(E.fillQuestion('Why {firm}?', p), 'Why UBS?');
  assert(/wealth management associate/.test(E.fillQuestion('What do you think a first-year {role} does day to day?', p)));
});

test('spaced repetition: a miss returns in 1 day, then 3, 7 and 14, then retires', () => {
  const ans = [];
  const log = (day, score) => ans.push({ q: 'Walk me through a DCF.', qid: 'q33', cat: 'val', date: iso(day), at: ans.length + 1, score });
  const due = today => E.reviewSchedule(ans, iso(today));
  log(0, 2);
  assert.strictEqual(due(0)[0].due, iso(1));
  assert.strictEqual(due(0)[0].isDue, false);
  assert.strictEqual(due(1)[0].isDue, true);
  log(1, 4); assert.strictEqual(due(1)[0].due, iso(4), 'pass on time: +3 days');
  log(2, 5); assert.strictEqual(due(2)[0].due, iso(4), 'a pass before it is due does not move it along');
  log(4, 4); assert.strictEqual(due(4)[0].due, iso(11), '+7 days');
  log(11, 5); assert.strictEqual(due(11)[0].due, iso(25), '+14 days');
  log(25, 4); assert.strictEqual(due(25).length, 0, 'retired after the 14-day review');
  log(30, 3); assert.strictEqual(due(30)[0].due, iso(31), 'a later miss brings it back');
});

test('spaced repetition: first-time passes never enter, and the same question matches loosely', () => {
  const ans = [
    { q: 'Why finance?', date: iso(0), at: 1, score: 5, cat: 'fit' },
    { q: 'What is goodwill, and when is it created?', date: iso(0), at: 2, score: 1, cat: 'acc' },
    { q: 'what is GOODWILL and when is it created', date: iso(1), at: 3, score: 4, cat: 'acc' },
  ];
  const r = E.reviewSchedule(ans, iso(1));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].attempts, 2);
  assert.strictEqual(r[0].due, iso(4));
});

console.log(`\n${n} engine checks passed`);
