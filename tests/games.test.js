/* Game checks: the accounting has to balance and every sprint answer has to match its own prompt.
   Run with: node tests/games.test.js */
const assert = require('assert');
const G = require('../src/games.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const near = (a, b) => Math.abs(a - b) < 0.011;

test('every Statement Flows scenario balances at every size and tax rate', () => {
  G.SCENARIOS.forEach(s => [10, 20, 40, 100, 200].forEach(x => [0, 20, 21, 25, 40].forEach(t => {
    const c = G.flowCalc(s.id, x, t);
    assert(c.balanced, s.id + ' does not balance at x=' + x + ' t=' + t);
    assert(near(c.d.cash, c.d.cfo + c.d.cfi + c.d.cff), s.id + ': cash is not the sum of the three cash flow sections');
    const sc = G.flowScenario(s.id, x, t);
    assert.strictEqual(sc.rows.length, 9);
    sc.rows.forEach(r => assert.strictEqual(r.dir, Math.sign(r.delta) || 0));
    [sc.why.is, sc.why.cf, sc.why.bs].forEach(w => assert(w && !/undefined|NaN/.test(w), s.id + ': broken walk-through: ' + w));
  })));
});

test('the classics match the answers interviewers expect', () => {
  const d = (id, x, t) => G.flowCalc(id, x, t).d;
  // depreciation up 10 at 40%: net income down 6, cash up 4, PP&E down 10, equity down 6
  assert.deepStrictEqual(d('dep', 10, 40), { pretax: -10, ni: -6, cfo: 4, cfi: 0, cff: 0, cash: 4, oa: -10, liab: 0, eq: -6 });
  // inventory bought with cash: nothing on the income statement, operations down, inventory up
  assert.deepStrictEqual(d('invCash', 10, 40), { pretax: 0, ni: 0, cfo: -10, cfi: 0, cff: 0, cash: -10, oa: 10, liab: 0, eq: 0 });
  // stock-based comp 10 at 40%: net income down 6, cash up 4, equity up 4
  assert.deepStrictEqual(d('sbc', 10, 40), { pretax: -10, ni: -6, cfo: 4, cfi: 0, cff: 0, cash: 4, oa: 0, liab: 0, eq: 4 });
  // a dividend never touches net income
  assert.deepStrictEqual(d('dividend', 10, 40), { pretax: 0, ni: 0, cfo: 0, cfi: 0, cff: -10, cash: -10, oa: 0, liab: 0, eq: -10 });
  // revenue on credit: taxed before it is collected
  assert.deepStrictEqual(d('arSale', 100, 25), { pretax: 100, ni: 75, cfo: -25, cfi: 0, cff: 0, cash: -25, oa: 100, liab: 0, eq: 75 });
  // equipment bought with debt: cash does not move
  assert.deepStrictEqual(d('capexDebt', 50, 25), { pretax: 0, ni: 0, cfo: 0, cfi: -50, cff: 50, cash: 0, oa: 50, liab: 50, eq: 0 });
  // prepayment from a customer: cash and a liability, no revenue
  assert.deepStrictEqual(d('deferredRev', 60, 25), { pretax: 0, ni: 0, cfo: 60, cfi: 0, cff: 0, cash: 60, oa: 0, liab: 60, eq: 0 });
  // interest paid 20 at 25%: net income and cash both down 15
  assert.deepStrictEqual(d('interest', 20, 25), { pretax: -20, ni: -15, cfo: -15, cfi: 0, cff: 0, cash: -15, oa: 0, liab: 0, eq: -15 });
  // selling a 40 asset for 80: gain 40, operations down by the tax, investing up 80
  assert.deepStrictEqual(d('assetSale', 40, 25), { pretax: 40, ni: 30, cfo: -10, cfi: 80, cff: 0, cash: 70, oa: -40, liab: 0, eq: 30 });
});

test('a flows round has five different scenarios that get harder, and scoring counts lines', () => {
  for (let k = 0; k < 200; k++) {
    const rd = G.flowsRound('S' + k, 5);
    assert.strictEqual(new Set(rd.map(s => s.id)).size, 5);
    assert.deepStrictEqual(rd.map(s => s.lv), [0, 0, 1, 1, 2]);
    rd.forEach(s => assert(Number.isInteger(s.x * s.taxPct / 100), 'tax is a whole number'));
  }
  const s = G.flowsRound('X', 5)[0], perfect = {};
  s.rows.forEach(r => { perfect[r.k] = r.dir; });
  assert.strictEqual(G.flowScore(s, perfect), 9);
  assert.strictEqual(G.flowScore(s, {}), 0);
  assert.deepStrictEqual([G.acct(-8), G.acct(0), G.acct(1200)], ['(8)', '–', '1,200']);
});

// recompute each sprint answer from the numbers printed in its own prompt
const nums = q => q.prompt.replace(/,/g, '').replace(/Rule of 72/, '').match(/\d+(\.\d+)?/g).map(Number);
const RECOMPUTE = {
  pctOf: a => a[0] * a[1] / 100,
  pctChange: a => Math.abs(a[1] - a[0]) / a[0] * 100,
  evMultiple: a => a[0] / a[1],
  impliedEV: a => a[0] * a[1],
  pe: a => a[0] / a[1],
  rule72: (a, q) => /how many years/.test(q.prompt) ? 72 / a[0] : 72 / a[0],
  margin: a => a[1] / a[0] * 100,
  netIncome: a => a[0] * (1 - a[1] / 100),
  compound: a => a[0] * Math.pow(1 + a[1] / 100, a[2]),
  presentValue: a => a[0] / (1 + a[1] / 100),
  fraction: a => a[0] / a[1] * 100,
  times: a => a[0] * a[1],
  equityValue: a => a[0] - a[1] + a[2],
  enterpriseValue: a => a[0] + a[1] - a[2],
  marketCap: a => a[0] * a[1],
  bondYield: a => a[0] / a[1] * 100,
  divYield: a => a[1] / a[0] * 100,
  breakeven: a => (1 / (1 - a[0] / 100) - 1) * 100,
  basisPoints: (a, q) => a[0] + (/rise/.test(q.prompt) ? 1 : -1) * a[1] / 100,
  interest: a => a[0] * a[1] / 100,
  wacc: a => (a[0] * a[1] + a[2] * a[3]) / 100,
};

test('every sprint answer matches its prompt, is clean, and can be typed back in', () => {
  const seen = {};
  for (let k = 0; k < 400; k++) {
    G.sprintRound('R' + k, 60).forEach(q => {
      seen[q.kind] = (seen[q.kind] || 0) + 1;
      assert(RECOMPUTE[q.kind], 'no recompute rule for ' + q.kind);
      const want = RECOMPUTE[q.kind](nums(q), q);
      assert(near(want, q.answer), q.kind + ': "' + q.prompt + '" says ' + q.answer + ', recomputed ' + want);
      assert(q.answer > 0 && near(q.answer * 100, Math.round(q.answer * 100)), q.kind + ': answer is not clean: ' + q.answer);
      assert(G.checkTyped(q, G.fmtAnswer(q.answer, q.unit)), q.kind + ': typing "' + G.fmtAnswer(q.answer, q.unit) + '" should be right');
      assert(G.checkTyped(q, String(q.answer)), 'bare number');
      assert(!G.checkTyped(q, String(q.answer + 1)) && !G.checkTyped(q, '') && !G.checkTyped(q, 'abc'));
      const c = G.mathChoices(q, G.rng('c' + q.id));
      assert.strictEqual(new Set(c.choices).size, 4, q.kind + ': choices repeat: ' + c.choices.join(' | '));
      assert.strictEqual(c.choices[c.correct], G.fmtAnswer(q.answer, q.unit));
    });
  }
  G.KIND_NAMES.forEach(k => assert(seen[k] > 50, k + ' barely shows up (' + (seen[k] || 0) + ')'));
});

test('the same seed gives the same round, kinds do not repeat back to back, and it warms up first', () => {
  assert.deepStrictEqual(G.sprintRound('SAME', 40), G.sprintRound('SAME', 40));
  assert.notDeepStrictEqual(G.sprintRound('SAME', 10).map(q => q.prompt), G.sprintRound('OTHER', 10).map(q => q.prompt));
  for (let k = 0; k < 50; k++) {
    const rd = G.sprintRound('K' + k, 60);
    rd.forEach((q, i) => { if (i) assert.notStrictEqual(q.kind, rd[i - 1].kind); });
    assert(rd.slice(0, 3).every(q => q.lv === 0));
  }
  assert.strictEqual(G.dailySeed('2026-11-10'), 'D20261110');
  assert(/^[A-Z2-9]{6}$/.test(G.newSeed()) && /^[A-Z]{4}$/.test(G.roomCode()));
});

test('typed answers accept the ways people write numbers', () => {
  const q = { answer: 1200 };
  ['1200', '1,200', '$1,200', '$1200M', '1200 m', ' 1200 '].forEach(t => assert(G.checkTyped(q, t), t));
  assert(G.checkTyped({ answer: 8 }, '8x') && G.checkTyped({ answer: 8 }, '8.0x') && G.checkTyped({ answer: 37.5 }, '37.5%') && G.checkTyped({ answer: 9 }, '9 years'));
  assert(!G.checkTyped({ answer: 37.5 }, '38') && !G.checkTyped({ answer: 8 }, '8-') && !G.checkTyped({ answer: 8 }, '1e1'));
});

test('live questions: four different choices, one right, the same for host and players', () => {
  Object.keys(G.LIVE_MIXES).forEach(mix => {
    for (let k = 0; k < 60; k++) {
      const texts = [];
      for (let i = 0; i < 12; i++) {
        const q = G.liveQuestion('ROOM' + k, mix, i);
        assert.deepStrictEqual(q, G.liveQuestion('ROOM' + k, mix, i));
        assert.strictEqual(q.choices.length, 4);
        assert.strictEqual(new Set(q.choices).size, 4, mix + ' q' + i + ': ' + q.choices.join(' | '));
        assert(q.correct >= 0 && q.correct < 4 && q.text && q.why);
        texts.push(q.text.replace(/\$[\d,]+|\d+%/g, '#'));
      }
      if (mix === 'flows') assert(new Set(texts.slice(0, 7).map(t => t.split(' Tax rate')[0])).size === 7, 'statement questions repeat too soon');
      if (mix === 'mixed') assert(/Tax rate/.test(G.liveQuestion('ROOM' + k, mix, 1).text) && !/Tax rate/.test(G.liveQuestion('ROOM' + k, mix, 0).text));
    }
  });
});

test('live scoring: speed matters, wrong is zero, junk is ignored', () => {
  assert.strictEqual(G.livePoints(false, 100, 20000), 0);
  assert.strictEqual(G.livePoints(true, 0, 20000), 1000);
  assert.strictEqual(G.livePoints(true, 20000, 20000), 600);
  assert.strictEqual(G.livePoints(true, 999999, 20000), 600);
  assert(G.livePoints(true, 5000, 20000) > G.livePoints(true, 15000, 20000));
  const q0 = G.liveQuestion('RM', 'mixed', 0), q1 = G.liveQuestion('RM', 'mixed', 1);
  const players = { a: { n: 'Ana' }, b: { n: '<b>Bo</b>' }, c: { n: '' } };
  const answers = { 0: { a: { c: q0.correct, ms: 2000 }, b: { c: (q0.correct + 1) % 4, ms: 100 }, ghost: { c: q0.correct, ms: 1 }, c: 'junk' }, 1: { a: { c: q1.correct, ms: 9000 }, b: { c: q1.correct, ms: 1000 } } };
  const board = G.liveBoard(players, answers, 'RM', 'mixed', 1, 20);
  assert.deepStrictEqual(board.map(r => r.n), ['Ana', 'bBo/b', 'Player']);
  assert(board[0].s > board[1].s && board[1].s > 0 && board[2].s === 0);
  assert.strictEqual(board[0].right, 2);
  assert.strictEqual(G.liveBoard(players, answers, 'RM', 'mixed', 0, 20)[0].last, G.livePoints(true, 2000, 20000));
});

test('challenge links round-trip and reject junk', () => {
  const h = G.challengeHash({ g: 'sprint', seed: 'AB12CD', score: 23, name: 'Brandon W' });
  assert.deepStrictEqual(G.parseChallenge(h), { g: 'sprint', seed: 'AB12CD', score: 23, name: 'Brandon W' });
  assert.deepStrictEqual(G.parseChallenge('#g=flows&s=D20261110'), { g: 'flows', seed: 'D20261110', score: null, name: '' });
  ['', '#g=poker&s=ABC', '#g=sprint&s=<script>', '#g=sprint', '#s=ABC', '#g=sprint&s=ab'].forEach(x => assert.strictEqual(G.parseChallenge(x), null, x));
  assert.strictEqual(G.parseChallenge('#g=sprint&s=ABC&p=9999').score, null);
  assert.strictEqual(G.parseChallenge('#g=sprint&s=ABC&n=%3Cimg%20onerror%3Dx%3E').name, 'img onerror=x');
  assert.strictEqual(G.cleanName('  A   very long nickname indeed  '), 'A very long nick');
  assert(/23 right in 60 seconds/.test(G.shareText({ g: 'sprint', score: 23 }, 'https://x.test/')));
});

test('day streak: today can still be open, a missed yesterday ends it', () => {
  const S = d => new Set(d);
  assert.deepStrictEqual(G.streak(S([]), '2026-11-10'), { n: 0, today: false });
  assert.deepStrictEqual(G.streak(S(['2026-11-10']), '2026-11-10'), { n: 1, today: true });
  assert.deepStrictEqual(G.streak(S(['2026-11-08', '2026-11-09']), '2026-11-10'), { n: 2, today: false });
  assert.deepStrictEqual(G.streak(S(['2026-11-07', '2026-11-08']), '2026-11-10'), { n: 0, today: false });
  assert.strictEqual(G.streak(S(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']), '2026-11-02').n, 4);
  const days = G.activeDays({ answers: [{ date: '2026-11-01' }], done: { k1: '2026-11-02' }, mocks: [{ date: '2026-11-03' }] }, { runs: [{ date: '2026-11-04' }, { date: 'bad' }] });
  assert.deepStrictEqual(Array.from(days).sort(), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
});

test('readiness: nothing done is zero, practice moves it, and it is compared with the calendar', () => {
  const empty = G.readiness({ answers: [], play: null, seats: ['ib'] });
  assert.strictEqual(empty.overall, 0);
  assert.deepStrictEqual(empty.areas.map(a => a.k), ['acc', 'val', 'mkt', 'story', 'math']);
  assert(G.readiness({ seats: ['wm'] }).areas.some(a => a.k === 'awm'));
  const ans = (cat, score, k) => Array.from({ length: k }, () => ({ cat, score }));
  const some = G.readiness({ answers: ans('acc', 5, 6).concat(ans('val', 3, 6), ans('fit', 4, 2)), seats: ['ib'],
    play: { runs: [{ g: 'sprint', score: 10 }, { g: 'sprint', score: 14 }, { g: 'sprint', score: 12 }, { g: 'flows', score: 45, total: 45 }, { g: 'flows', score: 45, total: 45 }, { g: 'flows', score: 45, total: 45 }] } });
  const by = {}; some.areas.forEach(a => { by[a.k] = a.pct; });
  assert.strictEqual(by.acc, 100);
  assert.strictEqual(by.val, 50);
  assert.strictEqual(by.story, 25);          // a 4 average, but only two answers so far
  assert.strictEqual(by.mkt, 0);
  assert.strictEqual(by.math, 60);           // averages 12 a minute against a target of 20
  assert.strictEqual(some.weakest.k, 'mkt');
  const paced = G.readiness({ answers: ans('acc', 5, 6), seats: ['ib'], today: '2026-11-10', plan: { start: '2026-10-01', ready: '2027-02-01', events: [{ name: 'Club interview', date: '2026-11-20' }, { name: 'Old', date: '2026-10-05' }] } });
  assert.strictEqual(paced.expected, 33);
  assert.strictEqual(paced.status, 'behind pace');
  assert.strictEqual(paced.daysLeft, 83);
  assert.deepStrictEqual(paced.next, { name: 'Club interview', date: '2026-11-20', days: 10 });
});

test('QR codes: right size for the text, the three finder corners, and too-long text is refused', () => {
  const QR = require('../src/qr.js');
  const url = 'https://brandonw3545-ops.github.io/finance-recruiting-coach/live.html#join=ABCD';
  const m = QR.matrix(url);
  assert.strictEqual(m.version, 5);
  assert.strictEqual(m.size, 37);
  assert.deepStrictEqual(QR.matrix(url), m);
  const finder = (x0, y0) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const edge = x === 0 || x === 6 || y === 0 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4; assert.strictEqual(m.rows[y0 + y][x0 + x], edge || core, 'finder at ' + x0 + ',' + y0); } };
  finder(0, 0); finder(m.size - 7, 0); finder(0, m.size - 7);
  for (let i = 8; i < m.size - 8; i++) assert.strictEqual(m.rows[6][i], i % 2 === 0, 'timing row');
  assert.strictEqual(m.rows[m.size - 8][8], true, 'the always-dark module');
  assert.deepStrictEqual([1, 14, 15, 26, 27, 62, 63, 106, 107, 213].map(k => QR.matrix('x'.repeat(k)).version), [1, 1, 2, 2, 3, 4, 5, 6, 7, 10]);
  assert.strictEqual(QR.matrix('x'.repeat(214)), null);
  assert.strictEqual(QR.svg('x'.repeat(214)), '');
  assert(/^<svg [^>]*viewBox="0 0 41 41"/.test(QR.svg(url, { margin: 2 })) && !/[<>]script/.test(QR.svg('<script>')));
});

console.log('\n' + n + ' game checks passed');
