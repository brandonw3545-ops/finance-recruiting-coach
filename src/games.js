/* ==========================================================================
   Finance Recruiting Coach: games
   Pure functions, no DOM. Seeded question generators for the Mental Math Sprint and
   Statement Flows, the live-room questions built from them, scoring, challenge links,
   the day streak and the readiness estimate.
   The same seed always gives the same round, which is what makes a challenge link fair.
   ========================================================================== */
const Games = (() => {
  'use strict';

  /* ---------- seeded random (same generator as the plan engine) ---------- */
  function rng(seedStr) {
    seedStr = String(seedStr);
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newSeed() { let s = ''; for (let i = 0; i < 6; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)]; return s; }
  const dailySeed = iso => 'D' + String(iso).replace(/-/g, '');
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function roomCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }

  /* ---------- numbers ---------- */
  const round2 = n => Math.round(n * 100) / 100;
  function fmtNum(n) {
    const v = round2(n);
    const [w, d] = String(Math.abs(v)).split('.');
    return (v < 0 ? '-' : '') + w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
  }
  // how an answer reads next to its unit: 25%, 8.0x, $360M, 9 years
  function fmtAnswer(v, unit) {
    if (unit === 'x') return (Math.round(v * 10) / 10).toFixed(1) + 'x';
    if (unit === '%') return fmtNum(v) + '%';
    if (unit === '$M') return '$' + fmtNum(v) + 'M';
    if (unit === '$') return '$' + fmtNum(v);
    if (unit === 'yrs') return fmtNum(v) + ' years';
    return fmtNum(v);
  }
  const UNIT_HINT = { 'x': 'x', '%': '%', '$M': '$M', '$': '$', 'yrs': 'years', '': '' };
  // typed answers: "$1,200", "8x", "25 %" all count
  function parseTyped(text) {
    const s = String(text == null ? '' : text).replace(/[,\s$%]/g, '').replace(/(x|m|mm|yrs?|years?)$/i, '');
    if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function checkTyped(q, text) {
    const v = parseTyped(text);
    return Number.isFinite(v) && Math.abs(v - q.answer) <= 0.011;
  }
  // three wrong answers: the usual mistakes first, then near misses
  function distract(r, ans, extras) {
    const step = Math.abs(ans) < 2 ? 0.25 : Math.abs(ans) < 20 ? 1 : Math.abs(ans) < 100 ? 5 : Math.abs(ans) < 1000 ? 10 : 50;
    const near = shuffle(r, [ans + step, ans - step, ans + 2 * step, ans * 2, ans / 2, ans - 2 * step, ans * 1.5]);
    const out = [];
    (extras || []).concat(near).forEach(v => {
      v = round2(v);
      if (out.length < 3 && Number.isFinite(v) && v > 0 && Math.abs(v - ans) > 0.011 && !out.some(o => Math.abs(o - v) < 0.011)) out.push(v);
    });
    for (let k = 3; out.length < 3; k++) out.push(round2(ans + k * step));
    return out;
  }

  /* ---------- Mental Math Sprint: the question kinds ----------
     Each returns { prompt, answer, unit, wrong }. Numbers are chosen so every answer is
     clean (a whole number or one or two decimals). lv: 0 warm-up, 1 standard, 2 hard. */
  const KINDS = {
    pctOf: { cat: 'mkt', lv: [0, 1], make(r, lv) {
      const p = pick(r, lv ? [5, 15, 30, 35, 40, 60, 75] : [10, 20, 25, 50]), base = 20 * int(r, 2, lv ? 30 : 15);
      const a = p * base / 100;
      return { prompt: p + '% of ' + fmtNum(base), answer: a, unit: '', wrong: [(100 - p) * base / 100, a * 10, a / 10] };
    } },
    pctChange: { cat: 'mkt', lv: [0, 1, 2], make(r, lv) {
      const from = pick(r, [20, 40, 60, 80, 100, 120, 200, 240, 400]);
      const up = lv === 0 || r() < 0.55;
      const p = up ? pick(r, lv === 0 ? [10, 20, 25, 50, 100] : [5, 15, 30, 35, 45, 75, 150]) : pick(r, lv === 2 ? [15, 35, 45, 65, 85] : [10, 20, 25, 40, 50, 75]);
      const to = from + (up ? 1 : -1) * from * p / 100;
      const wrongBase = Math.round(Math.abs(to - from) / to * 1000) / 10;
      const words = r() < 0.5
        ? 'A stock ' + (up ? 'rises' : 'falls') + ' from $' + fmtNum(from) + ' to $' + fmtNum(to) + '. Percent ' + (up ? 'gain' : 'drop') + '?'
        : 'Revenue ' + (up ? 'grew' : 'fell') + ' from $' + fmtNum(from) + 'M to $' + fmtNum(to) + 'M. Percent ' + (up ? 'growth' : 'decline') + '?';
      return { prompt: words, answer: p, unit: '%', wrong: [wrongBase, Math.abs(to - from)] };
    } },
    evMultiple: { cat: 'val', lv: [0, 1, 2], make(r, lv) {
      const e = pick(r, [20, 40, 50, 80, 100, 120, 150, 200, 250]), m = pick(r, lv === 0 ? [5, 6, 8, 10] : lv === 1 ? [7, 9, 11, 12, 14] : [6.5, 7.5, 8.5, 12.5]);
      return { prompt: 'Enterprise value $' + fmtNum(e * m) + 'M, EBITDA $' + fmtNum(e) + 'M. EV/EBITDA?', answer: m, unit: 'x', wrong: [m + 1, m - 1, m + 2] };
    } },
    impliedEV: { cat: 'val', lv: [1, 2], make(r, lv) {
      const e = pick(r, [20, 40, 50, 60, 80, 120, 150, 200]), m = pick(r, lv === 1 ? [6, 7, 8, 9, 10, 12] : [6.5, 7.5, 8.5, 11, 14]);
      return { prompt: 'EBITDA of $' + fmtNum(e) + 'M, peers trade at ' + m + 'x. Implied enterprise value, in $M?', answer: e * m, unit: '$M', wrong: [e * (m + 1), e * (m - 1), e * m * 10] };
    } },
    pe: { cat: 'val', lv: [0, 1], make(r) {
      const eps = pick(r, [2, 3, 4, 5, 6, 8]), m = pick(r, [10, 12, 15, 18, 20, 25, 30]);
      return { prompt: 'Share price $' + fmtNum(eps * m) + ', earnings per share $' + eps + '. P/E?', answer: m, unit: 'x', wrong: [m + 2, m - 2, m + 5] };
    } },
    rule72: { cat: 'mkt', lv: [0, 1], make(r) {
      const rate = pick(r, [2, 3, 4, 6, 8, 9, 12]);
      if (r() < 0.6) return { prompt: 'Rule of 72: at ' + rate + '% a year, how many years to double your money?', answer: 72 / rate, unit: 'yrs', wrong: [Math.round(100 / rate), 72 / rate + 2, 72 / rate - 2] };
      return { prompt: 'Rule of 72: to double in ' + (72 / rate) + ' years, what annual return do you need?', answer: rate, unit: '%', wrong: [rate + 2, rate * 2, rate + 1] };
    } },
    margin: { cat: 'acc', lv: [0, 1], make(r) {
      const rev = pick(r, [200, 300, 400, 500, 600, 800, 1000, 1200]), m = pick(r, [5, 8, 10, 12, 15, 20, 25, 30, 40]);
      return { prompt: 'Revenue $' + fmtNum(rev) + 'M, EBITDA $' + fmtNum(rev * m / 100) + 'M. EBITDA margin?', answer: m, unit: '%', wrong: [m + 5, m / 2, m + 2] };
    } },
    netIncome: { cat: 'acc', lv: [0, 1], make(r) {
      const x = pick(r, [100, 200, 300, 400, 500, 800]), t = pick(r, [20, 25, 30, 40]);
      return { prompt: 'Pre-tax income $' + x + 'M, tax rate ' + t + '%. Net income, in $M?', answer: x * (100 - t) / 100, unit: '$M', wrong: [x * t / 100, x * (100 + t) / 100] };
    } },
    compound: { cat: 'mkt', lv: [1, 2], make(r, lv) {
      const P = pick(r, [100, 200, 1000]), g = pick(r, [10, 20, 50, 100]), n = lv === 2 && g !== 20 ? 3 : 2;
      const a = round2(P * Math.pow(1 + g / 100, n));
      return { prompt: '$' + fmtNum(P) + ' grows ' + g + '% a year for ' + n + ' years. Ending value?', answer: a, unit: '$', wrong: [P * (1 + n * g / 100), P * (1 + g / 100)] };
    } },
    presentValue: { cat: 'val', lv: [1, 2], make(r) {
      const pv = pick(r, [100, 200, 400, 800, 1000]), d = pick(r, [10, 20, 25, 50]);
      const fv = pv * (100 + d) / 100;
      return { prompt: '$' + fmtNum(fv) + ' a year from now, discounted at ' + d + '%. Worth today?', answer: pv, unit: '$', wrong: [fv * (100 - d) / 100, fv * (100 + d) / 100] };
    } },
    fraction: { cat: 'mkt', lv: [0, 1], make(r, lv) {
      const d = pick(r, lv ? [8, 40] : [4, 5, 20, 25]);
      const n = d === 8 ? pick(r, [1, 3, 5, 7]) : d === 40 ? pick(r, [1, 3, 7, 9, 11]) : int(r, 1, d - 1);
      return { prompt: n + '/' + d + ' as a percent?', answer: round2(n / d * 100), unit: '%', wrong: [round2(n / (d + 2) * 100), round2(d / n)] };
    } },
    times: { cat: 'mkt', lv: [0, 1, 2], make(r, lv) {
      const a = lv === 0 ? int(r, 6, 12) : lv === 1 ? int(r, 13, 25) : pick(r, [25, 35, 45, 75, 125]);
      const b = lv === 0 ? int(r, 11, 20) : lv === 1 ? int(r, 11, 19) : pick(r, [12, 16, 24, 32, 48]);
      return { prompt: a + ' × ' + b, answer: a * b, unit: '', wrong: [a * b + 10, a * b - 10, a * (b + 1), a * b + a] };
    } },
    equityValue: { cat: 'val', lv: [1, 2], make(r) {
      const ev = 100 * int(r, 6, 20), debt = 50 * int(r, 2, 10), cash = 50 * int(r, 1, 5);
      return { prompt: 'Enterprise value $' + fmtNum(ev) + 'M, debt $' + debt + 'M, cash $' + cash + 'M. Equity value, in $M?', answer: ev - debt + cash, unit: '$M', wrong: [ev + debt - cash, ev - debt - cash, ev + debt + cash] };
    } },
    enterpriseValue: { cat: 'val', lv: [1, 2], make(r) {
      const eq = 100 * int(r, 5, 20), debt = 50 * int(r, 2, 12), cash = 50 * int(r, 1, 5);
      return { prompt: 'Market cap $' + fmtNum(eq) + 'M, debt $' + debt + 'M, cash $' + cash + 'M. Enterprise value, in $M?', answer: eq + debt - cash, unit: '$M', wrong: [eq - debt + cash, eq + debt + cash, eq - debt - cash] };
    } },
    marketCap: { cat: 'val', lv: [0, 1], make(r) {
      const p = pick(r, [8, 12, 15, 20, 24, 25, 30, 40, 50, 60, 75]), s = pick(r, [20, 40, 50, 80, 100, 150, 200]);
      return { prompt: 'Share price $' + p + ', ' + s + 'M shares outstanding. Market cap, in $M?', answer: p * s, unit: '$M', wrong: [p * s * 10, p * s / 10, p * (s + 10)] };
    } },
    bondYield: { cat: 'mkt', lv: [0, 1], make(r) {
      const price = pick(r, [500, 800, 1000, 1200]), y = pick(r, [2, 4, 5, 6, 8, 10]);
      return { prompt: 'A bond pays a $' + (price * y / 100) + ' coupon each year and trades at $' + fmtNum(price) + '. Current yield?', answer: y, unit: '%', wrong: [y + 1, y * 2, y - 1] };
    } },
    divYield: { cat: 'mkt', lv: [0, 1], make(r) {
      const price = pick(r, [20, 25, 40, 50, 80, 100]), y = pick(r, [1, 2, 3, 4, 5, 6, 8]);
      return { prompt: 'A $' + price + ' stock pays $' + fmtNum(price * y / 100) + ' a year in dividends. Dividend yield?', answer: y, unit: '%', wrong: [y + 1, y * 2, y + 2] };
    } },
    breakeven: { cat: 'mkt', lv: [1, 2], make(r) {
      const [d, g] = pick(r, [[20, 25], [50, 100], [60, 150], [75, 300], [80, 400]]);
      return { prompt: 'A stock falls ' + d + '%. What percent gain gets it back to even?', answer: g, unit: '%', wrong: [d, d * 2, g / 2 + d] };
    } },
    basisPoints: { cat: 'mkt', lv: [1, 2], make(r) {
      const y = pick(r, [3.25, 3.5, 4, 4.25, 4.5, 4.75, 5]), b = pick(r, [25, 50, 75, 125]), up = r() < 0.5;
      const a = round2(y + (up ? 1 : -1) * b / 100);
      return { prompt: 'A bond yields ' + y + '%. Yields ' + (up ? 'rise' : 'fall') + ' ' + b + ' basis points. New yield?', answer: a, unit: '%', wrong: [round2(y + (up ? 1 : -1) * b / 1000), round2(y + (up ? -1 : 1) * b / 100), round2(y + (up ? 1 : -1) * b / 10)] };
    } },
    interest: { cat: 'acc', lv: [0, 1], make(r) {
      const n = pick(r, [100, 200, 300, 400, 500]), rate = pick(r, [4, 5, 6, 8, 10]);
      return { prompt: 'A $' + n + 'M loan at ' + rate + '%. Interest expense each year, in $M?', answer: n * rate / 100, unit: '$M', wrong: [n * rate / 10, n * rate / 1000, n * (rate + 1) / 100] };
    } },
    wacc: { cat: 'val', lv: [2], make(r) {
      const we = pick(r, [50, 60, 70, 80]), ce = pick(r, [8, 10, 12]), cd = pick(r, [4, 5, 6]);
      const a = (we * ce + (100 - we) * cd) / 100;
      return { prompt: we + '% equity at a ' + ce + '% cost, ' + (100 - we) + '% debt at ' + cd + '% after tax. WACC?', answer: a, unit: '%', wrong: [(ce + cd) / 2, ((100 - we) * ce + we * cd) / 100, a + 1] };
    } },
  };
  const KIND_NAMES = Object.keys(KINDS);
  const levelAt = (i, r) => i < 3 ? 0 : i < 8 ? (r() < 0.5 ? 0 : 1) : i < 16 ? 1 : (r() < 0.5 ? 1 : 2);
  function mathQ(seed, i, prevKind) {
    const r = rng(seed + ':m:' + i);
    const lv = levelAt(i, r);
    const names = KIND_NAMES.filter(k => KINDS[k].lv.includes(lv) && k !== prevKind);
    const kind = pick(r, names);
    const q = KINDS[kind].make(r, lv);
    return { id: seed + '-' + i, i, kind, cat: KINDS[kind].cat, lv, prompt: q.prompt, answer: round2(q.answer), unit: q.unit, wrong: q.wrong };
  }
  // the first n questions of a sprint; no two in a row of the same kind
  function sprintRound(seed, n) {
    const out = [];
    for (let i = 0; i < (n || 80); i++) out.push(mathQ(seed, i, i ? out[i - 1].kind : ''));
    return out;
  }
  // four choices for a math question (the live room is tap-to-answer)
  function mathChoices(q, r) {
    const all = shuffle(r, [q.answer].concat(distract(r, q.answer, q.wrong)));
    return { choices: all.map(v => fmtAnswer(v, q.unit)), correct: all.indexOf(q.answer) };
  }

  /* ---------- Statement Flows ----------
     One event, three statements. Each scenario gives the pre-tax hit, the cash flow
     adjustments and the balance sheet lines; the engine derives the rest and the balance
     check (cash + other assets = liabilities + equity) has to hold or the tests fail.
     Assumptions, shown on screen: one period, taxes paid in cash this period. */
  const FLOW_ROWS = [
    { k: 'pretax', stmt: 'is', label: 'Pre-tax income' },
    { k: 'ni', stmt: 'is', label: 'Net income' },
    { k: 'cfo', stmt: 'cf', label: 'Cash from operations' },
    { k: 'cfi', stmt: 'cf', label: 'Cash from investing' },
    { k: 'cff', stmt: 'cf', label: 'Cash from financing' },
    { k: 'cash', stmt: 'bs', label: 'Cash' },
    { k: 'oa', stmt: 'bs', label: 'Other assets' },
    { k: 'liab', stmt: 'bs', label: 'Liabilities' },
    { k: 'eq', stmt: 'bs', label: "Shareholders' equity" },
  ];
  const STMT_NAME = { is: 'Income statement', cf: 'Cash flow statement', bs: 'Balance sheet' };
  /* fields: pretax, adj (non-cash and working-capital lines inside cash from operations), cfi, cff,
     oa (non-cash assets), liab, eqx (equity moves that skip the income statement), all as multiples of x.
     adjWhy / oaName / liabName / eqWhy / isWhy feed the walk-through; trap is the usual mistake. */
  const SCENARIOS = [
    { id: 'dep', lv: 0, text: x => 'Depreciation goes up by $' + x + '.', pretax: -1, adj: 1, oa: -1,
      adjWhy: 'add back the depreciation because no cash left the building', oaName: 'PP&E', trap: 'Cash goes up, not down: the only cash effect is the tax you saved.' },
    { id: 'capexCash', lv: 0, text: x => 'The company buys $' + x + ' of equipment with cash.', cfi: -1, oa: 1,
      isWhy: 'Buying equipment is not an expense. It gets depreciated later.', oaName: 'PP&E', trap: 'Nothing hits the income statement on the day you buy it.' },
    { id: 'debtIssue', lv: 0, text: x => 'The company borrows $' + x + '.', cff: 1, liab: 1,
      isWhy: 'Borrowing is not income.', liabName: 'debt' },
    { id: 'dividend', lv: 0, text: x => 'The company pays a $' + x + ' cash dividend.', cff: -1, eqx: -1,
      isWhy: 'Dividends are not an expense. They come out of retained earnings.', eqWhy: 'retained earnings fall by the dividend', trap: 'Net income does not change.' },
    { id: 'stockIssue', lv: 0, text: x => 'The company sells $' + x + ' of new stock.', cff: 1, eqx: 1,
      isWhy: 'Raising equity is not income.', eqWhy: 'common stock and paid-in capital rise' },
    { id: 'invCash', lv: 0, text: x => 'The company buys $' + x + ' of inventory with cash.', adj: -1, oa: 1,
      isWhy: 'Inventory is not expensed until it is sold.', adjWhy: 'inventory went up, which uses cash', oaName: 'inventory', trap: 'It sits in operations, not investing, and it never touches net income yet.' },
    { id: 'debtRepay', lv: 0, text: x => 'The company repays $' + x + ' of debt principal.', cff: -1, liab: -1,
      isWhy: 'Repaying principal is not an expense. Only interest is.', liabName: 'debt' },
    { id: 'buyback', lv: 1, text: x => 'The company buys back $' + x + ' of its own stock.', cff: -1, eqx: -1,
      isWhy: 'A buyback is not an expense.', eqWhy: 'treasury stock reduces equity' },
    { id: 'capexDebt', lv: 1, text: x => 'The company buys $' + x + ' of equipment and pays for it with new debt.', cfi: -1, cff: 1, oa: 1, liab: 1,
      isWhy: 'Neither the purchase nor the borrowing is income or expense.', oaName: 'PP&E', liabName: 'debt', trap: 'Cash does not move: investing is down and financing is up by the same amount.' },
    { id: 'arSale', lv: 1, text: x => 'The company books $' + x + ' of revenue on credit. No costs, and the customer has not paid.', pretax: 1, adj: -1, oa: 1,
      adjWhy: 'receivables went up, so that revenue is not cash yet', oaName: 'receivables', trap: 'Cash goes down: you owe tax on revenue you have not collected.' },
    { id: 'arCollect', lv: 1, text: x => 'A customer pays a $' + x + ' invoice that was booked as revenue last period.', adj: 1, oa: -1,
      isWhy: 'The revenue was already booked last period.', adjWhy: 'receivables came down, which brings in cash', oaName: 'receivables' },
    { id: 'invWriteDown', lv: 1, text: x => 'The company writes down $' + x + ' of inventory.', pretax: -1, adj: 1, oa: -1,
      adjWhy: 'add back the write-down because it is non-cash', oaName: 'inventory', trap: 'Same shape as depreciation: cash rises by the tax saved.' },
    { id: 'deferredRev', lv: 1, text: x => 'A customer pays $' + x + ' upfront for a subscription that has not been delivered yet.', adj: 1, liab: 1,
      isWhy: 'No revenue until the service is delivered.', adjWhy: 'deferred revenue went up, which is cash in the door', liabName: 'deferred revenue', trap: 'Cash is up but revenue is not. The company owes the service, so it is a liability.' },
    { id: 'accrued', lv: 1, text: x => 'Employees earned $' + x + ' of wages this period that have not been paid yet.', pretax: -1, adj: 1, liab: 1,
      adjWhy: 'accrued wages went up, so the expense has not cost cash yet', liabName: 'accrued wages', trap: 'The expense counts now even though no one has been paid.' },
    { id: 'interest', lv: 1, text: x => 'The company pays $' + x + ' of interest on its debt, in cash.', pretax: -1,
      trap: 'Interest is tax-deductible, so net income falls by less than the interest.' },
    { id: 'prepaid', lv: 1, text: x => 'The company pays $' + x + ' upfront for next year\'s insurance.', adj: -1, oa: 1,
      isWhy: 'The expense belongs to next year.', adjWhy: 'prepaid expenses went up, which uses cash', oaName: 'prepaid insurance' },
    { id: 'apPay', lv: 1, text: x => 'The company pays off $' + x + ' of accounts payable.', adj: -1, liab: -1,
      isWhy: 'The expense was booked when the bill arrived.', adjWhy: 'payables came down, which uses cash', liabName: 'payables' },
    { id: 'sbc', lv: 2, text: x => 'The company records $' + x + ' of stock-based compensation.', pretax: -1, adj: 1, eqx: 1,
      adjWhy: 'add back the stock comp because it is paid in shares, not cash', eqWhy: 'paid-in capital rises by the full grant while retained earnings fall by the after-tax expense', trap: 'Equity goes up, not down.' },
    { id: 'invSale', lv: 2, text: x => 'The company sells inventory that cost $' + x + ' for $' + (2 * x) + ' in cash.', pretax: 1, adj: 1, oa: -1,
      adjWhy: 'inventory came down by its cost', oaName: 'inventory' },
    { id: 'assetSale', lv: 2, text: x => 'The company sells equipment carried at $' + x + ' for $' + (2 * x) + ' in cash.', pretax: 1, adj: -1, cfi: 2, oa: -1,
      adjWhy: 'take the gain back out, because the whole sale price shows up in investing', oaName: 'PP&E', trap: 'Cash from operations falls: the gain is removed and the tax on it stays.' },
    { id: 'deferredEarned', lv: 2, text: x => 'The company delivers a service that a customer prepaid $' + x + ' for last period.', pretax: 1, adj: -1, liab: -1,
      adjWhy: 'deferred revenue came down, and the cash arrived last period', liabName: 'deferred revenue', trap: 'Revenue is up and cash is down: the only cash movement is the tax.' },
  ];
  const SCEN_BY_ID = {}; SCENARIOS.forEach(s => { SCEN_BY_ID[s.id] = s; });
  const plural = noun => /s$/.test(noun) && !/^cash from/i.test(noun);
  const upDown = (n, noun) => {
    const pl = plural(noun);
    return n === 0 ? noun + (pl ? ' do not change' : ' does not change') : noun + (n > 0 ? (pl ? ' rise by $' : ' rises by $') : (pl ? ' fall by $' : ' falls by $')) + fmtNum(Math.abs(n));
  };
  const sgn = n => n > 0 ? 1 : n < 0 ? -1 : 0;

  function flowCalc(id, x, taxPct) {
    const s = SCEN_BY_ID[id];
    const pretax = (s.pretax || 0) * x;
    const tax = pretax * taxPct / 100;
    const ni = pretax - tax;
    const adj = (s.adj || 0) * x;
    const cfo = ni + adj, cfi = (s.cfi || 0) * x, cff = (s.cff || 0) * x;
    const d = { pretax, ni, cfo, cfi, cff, cash: cfo + cfi + cff, oa: (s.oa || 0) * x, liab: (s.liab || 0) * x, eq: ni + (s.eqx || 0) * x };
    const balanced = Math.abs(d.cash + d.oa - d.liab - d.eq) < 1e-9;
    // the walk-through, in the order an interviewer expects: income statement, cash flow, balance sheet
    const is = pretax ? upDown(pretax, 'Pre-tax income') + '. At a ' + taxPct + '% tax rate, ' + upDown(ni, 'net income') + '.' : (s.isWhy || 'Nothing hits the income statement.') + ' Net income does not change.';
    const cfParts = [];
    if (pretax) cfParts.push('Start with net income, ' + (ni > 0 ? 'up' : 'down') + ' $' + fmtNum(Math.abs(ni)));
    if (adj) cfParts.push((pretax ? 'then ' : 'In operations, ') + (adj > 0 ? 'add' : 'subtract') + ' $' + fmtNum(Math.abs(adj)) + ': ' + s.adjWhy);
    let cf = cfParts.length ? cfParts.join(', ') + '. ' + upDown(cfo, 'Cash from operations') + '.' : 'Cash from operations does not change.';
    if (cfi) cf += ' ' + upDown(cfi, 'Cash from investing') + '.';
    if (cff) cf += ' ' + upDown(cff, 'Cash from financing') + '.';
    cf += ' ' + (d.cash ? 'Net, ' + upDown(d.cash, 'cash') + '.' : 'Net, cash does not change.');
    const bsParts = [upDown(d.cash, 'Cash')];
    if (d.oa) bsParts.push(upDown(d.oa, s.oaName || 'other assets'));
    if (d.liab) bsParts.push(upDown(d.liab, s.liabName || 'liabilities'));
    bsParts.push(d.eq ? upDown(d.eq, 'equity') + (s.eqWhy ? ' (' + s.eqWhy + ')' : ni ? ' through retained earnings' : '') : 'equity does not change');
    const side = d.cash + d.oa;
    const bs = bsParts.join(', ') + '. ' + (side ? 'Both sides move by $' + fmtNum(Math.abs(side)) + (side > 0 ? ' up' : ' down') + ', so it balances.' : 'Total assets do not change, so it balances.');
    return { d, balanced, tax, why: { is, cf, bs }, trap: s.trap || '' };
  }
  function flowScenario(id, x, taxPct) {
    const s = SCEN_BY_ID[id], c = flowCalc(id, x, taxPct);
    return {
      id, lv: s.lv, x, taxPct, text: s.text(x),
      rows: FLOW_ROWS.map(rw => ({ k: rw.k, stmt: rw.stmt, label: rw.label, delta: c.d[rw.k], dir: sgn(c.d[rw.k]) })),
      why: c.why, trap: c.trap, balanced: c.balanced,
    };
  }
  // a round ramps: two warm-ups, two standard, then a hard one (repeating that shape for longer rounds)
  function flowsRound(seed, n) {
    const r = rng(seed + ':f');
    const pools = [0, 1, 2].map(lv => shuffle(r, SCENARIOS.filter(s => s.lv === lv).map(s => s.id)));
    const shape = [0, 0, 1, 1, 2];
    const out = [];
    for (let i = 0; i < (n || 5); i++) {
      const lv = shape[i % shape.length];
      const pool = pools[lv].length ? pools[lv] : pools[1];
      out.push(flowScenario(pool.shift(), pick(r, [20, 40, 100, 200]), pick(r, [20, 25, 40])));
    }
    return out;
  }
  const flowScore = (scen, picks) => scen.rows.reduce((n, rw) => n + (picks && picks[rw.k] === rw.dir ? 1 : 0), 0);
  // accounting style: negatives in parentheses, zero as a dash
  const acct = n => n === 0 ? '–' : n < 0 ? '(' + fmtNum(-n) + ')' : fmtNum(n);
  const moveWords = n => n === 0 ? 'No change' : (n > 0 ? 'Up $' : 'Down $') + fmtNum(Math.abs(n));

  // one scenario as a four-choice question about a single line
  function flowChoices(scen, r) {
    const cands = scen.rows.filter(rw => ['ni', 'cfo', 'cash', 'eq', 'liab', 'cfi', 'cff'].includes(rw.k));
    const moving = cands.filter(rw => rw.delta !== 0);
    const row = r() < 0.8 && moving.length ? pick(r, moving) : pick(r, cands);
    const x = scen.x, after = x * (100 - scen.taxPct) / 100, tax = x * scen.taxPct / 100;
    const opts = [row.delta];
    shuffle(r, [-row.delta, 0, x, -x, after, -after, tax, -tax, 2 * x, -2 * x]).forEach(v => { if (opts.length < 4 && !opts.includes(v)) opts.push(v); });
    const all = shuffle(r, opts);
    return { text: scen.text + ' Tax rate ' + scen.taxPct + '%. What happens to ' + (row.k === 'eq' ? "shareholders' equity" : row.label.toLowerCase()) + '?', choices: all.map(moveWords), correct: all.indexOf(row.delta), row: row.k };
  }

  /* ---------- live room ---------- */
  const LIVE_MIXES = { mixed: 'Mental math and the three statements', math: 'Mental math only', flows: 'Three statements only' };
  // which scenario the f-th statements question uses: warm-ups first, no repeats until a level runs out
  const flowLevel = f => f < 2 ? 0 : f < 5 ? 1 : (f % 2 ? 2 : 1);
  function liveFlowId(seed, f) {
    const r = rng(seed + ':lf');
    const pools = [0, 1, 2].map(lv => shuffle(r, SCENARIOS.filter(s => s.lv === lv).map(s => s.id)));
    const lv = flowLevel(f);
    let seen = 0; for (let k = 0; k < f; k++) if (flowLevel(k) === lv) seen++;
    return pools[lv][seen % pools[lv].length];
  }
  function liveQuestion(seed, mix, i) {
    const r = rng(seed + ':l:' + i);
    const useFlow = mix === 'flows' || (mix !== 'math' && i % 2 === 1);
    if (useFlow) {
      const scen = flowScenario(liveFlowId(seed, mix === 'flows' ? i : (i - 1) / 2), pick(r, [20, 40, 100, 200]), pick(r, [20, 25, 40]));
      const c = flowChoices(scen, r);
      return { i, cat: 'acc', tag: 'Three statements', text: c.text, choices: c.choices, correct: c.correct, why: [scen.why.is, scen.why.cf, scen.why.bs].join(' ') };
    }
    const q = mathQ(seed + ':lm', mix === 'math' ? i : i / 2 + 2, '');
    const c = mathChoices(q, r);
    return { i, cat: q.cat, tag: 'Mental math', text: q.prompt, choices: c.choices, correct: c.correct, why: 'Answer: ' + fmtAnswer(q.answer, q.unit) + '.' };
  }
  // right answers score 600 plus up to 400 for speed
  function livePoints(right, ms, limitMs) {
    if (!right) return 0;
    const f = Math.max(0, Math.min(1, 1 - (ms || 0) / (limitMs || 20000)));
    return 600 + Math.round(400 * f);
  }
  function liveBoard(players, answers, seed, mix, upTo, secs) {
    const ids = Object.keys(players || {});
    const rows = ids.map(id => ({ id, n: cleanName(players[id] && players[id].n) || 'Player', s: 0, right: 0, last: 0 }));
    const by = {}; rows.forEach(rw => { by[rw.id] = rw; });
    for (let i = 0; i <= upTo; i++) {
      const q = liveQuestion(seed, mix, i), a = (answers && answers[i]) || {};
      Object.keys(a).forEach(id => {
        const rw = by[id], v = a[id];
        if (!rw || !v || typeof v.c !== 'number') return;
        const pts = livePoints(v.c === q.correct, +v.ms || 0, secs * 1000);
        rw.s += pts; if (pts) rw.right++; if (i === upTo) rw.last = pts;
      });
    }
    return rows.sort((a, b) => b.s - a.s || a.n.localeCompare(b.n));
  }

  /* ---------- names, challenge links, share text ---------- */
  function cleanName(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }
  const GAMES = { sprint: { name: 'Mental Math Sprint', unit: 'right in 60 seconds' }, flows: { name: 'Statement Flows', unit: 'of 45 lines right' } };
  function challengeHash(c) {
    const p = ['g=' + c.g, 's=' + encodeURIComponent(c.seed)];
    if (Number.isFinite(c.score)) p.push('p=' + Math.round(c.score));
    if (c.name) p.push('n=' + encodeURIComponent(cleanName(c.name)));
    return '#' + p.join('&');
  }
  function parseChallenge(hash) {
    const m = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(kv => { const k = kv.indexOf('='); if (k > 0) { try { m[kv.slice(0, k)] = decodeURIComponent(kv.slice(k + 1)); } catch (e) { /* skip a malformed value */ } } });
    if (!GAMES[m.g] || !/^[A-Z0-9]{3,12}$/.test(m.s || '')) return null;
    const score = /^\d{1,3}$/.test(m.p || '') ? +m.p : null;
    return { g: m.g, seed: m.s, score, name: cleanName(m.n) };
  }
  function shareText(c, url) {
    const g = GAMES[c.g];
    return g.name + ': ' + c.score + ' ' + g.unit + '. Same questions, your turn: ' + url;
  }

  /* ---------- progress: streak and readiness ---------- */
  function addDaysISO(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n, 12);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  // days in a row with any practice. Today not done yet doesn't break it; a missed yesterday does.
  function streak(days, today) {
    const has = d => (days instanceof Set ? days.has(d) : !!days[d]);
    let cur = has(today) ? today : addDaysISO(today, -1), n = 0;
    while (has(cur)) { n++; cur = addDaysISO(cur, -1); }
    return { n, today: has(today) };
  }
  // every day with a graded answer, a finished session, a mock or a game
  function activeDays(app, play) {
    const days = new Set();
    const ok = d => { if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) days.add(d.slice(0, 10)); };
    if (app) {
      (app.answers || []).forEach(a => ok(a.date));
      Object.keys(app.done || {}).forEach(k => ok(app.done[k]));
      (app.mocks || []).forEach(m => ok(m.date));
    }
    if (play) (play.runs || []).forEach(rn => ok(rn.date));
    return days;
  }
  const SPRINT_TARGET = 20;      // right answers in 60 seconds this site treats as ready (a house target, not an industry rule)
  const AREAS = [
    { k: 'acc', name: 'Accounting', cats: ['acc'], game: 'flows', next: 'Play Statement Flows, then drill accounting questions out loud.' },
    { k: 'val', name: 'Valuation', cats: ['val'], next: 'Drill valuation questions out loud in Practice.' },
    { k: 'mkt', name: 'Markets', cats: ['mkt', 'trd', 'inv'], next: 'Drill markets questions and practice your 60-second markets answer.' },
    { k: 'awm', name: 'Asset & wealth mgmt', cats: ['awm'], seats: ['wm', 'am'], next: 'Drill asset and wealth management questions in Practice.' },
    { k: 'story', name: 'Story & fit', cats: ['fit', 'beh', 'car', 'prep', 'firm'], next: 'Record your "tell me about yourself" and one behavioral story.' },
    { k: 'math', name: 'Mental math', cats: ['teaser'], game: 'sprint', next: 'Run the Mental Math Sprint until you clear ' + SPRINT_TARGET + ' in a minute.' },
  ];
  /* A rough, honest estimate from what you've actually done, never from what you've read:
     graded answers (last 12 per area, on the 1-5 scale), Statement Flows accuracy and Sprint scores.
     An area needs about six graded answers or three game rounds before it counts in full. */
  function readiness(input) {
    const answers = input.answers || [], runs = (input.play && input.play.runs) || [], seats = input.seats || [];
    const gameRuns = g => runs.filter(rn => rn.g === g).slice(-5);
    const areas = AREAS.filter(a => !a.seats || a.seats.some(s => seats.includes(s))).map(a => {
      const parts = [];
      const arr = answers.filter(x => a.cats.includes(x.cat)).slice(-12);
      if (arr.length) {
        const avg = arr.reduce((s, x) => s + (+x.score || 0), 0) / arr.length;
        parts.push({ w: 0.6, v: Math.max(0, Math.min(1, (avg - 1) / 4)) * Math.min(1, arr.length / 6) });
      }
      if (a.game === 'flows') {
        const g = gameRuns('flows');
        if (g.length) parts.push({ w: 0.4, v: g.reduce((s, rn) => s + rn.score / (rn.total || 45), 0) / g.length * Math.min(1, g.length / 3) });
      }
      if (a.game === 'sprint') {
        const g = gameRuns('sprint');
        if (g.length) parts.push({ w: 1, v: Math.min(1, g.reduce((s, rn) => s + rn.score, 0) / g.length / SPRINT_TARGET) * Math.min(1, g.length / 3) });
      }
      const wsum = parts.reduce((s, p) => s + p.w, 0);
      const pct = wsum ? Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / wsum * 100) : 0;
      return { k: a.k, name: a.name, pct, seen: arr.length + (a.game ? gameRuns(a.game).length : 0), next: a.next, game: a.game || '' };
    });
    const overall = areas.length ? Math.round(areas.reduce((s, a) => s + a.pct, 0) / areas.length) : 0;
    const out = { overall, areas, weakest: areas.slice().sort((a, b) => a.pct - b.pct)[0] || null, expected: null, status: '', daysLeft: null, next: null };
    const pl = input.plan, t = input.today;
    if (pl && pl.start && pl.ready && t) {
      const span = Math.max(1, dayDiff(pl.start, pl.ready));
      const el = Math.max(0, Math.min(1, dayDiff(pl.start, t) / span));
      out.expected = Math.round(el * 100);
      out.daysLeft = dayDiff(t, pl.ready);
      out.status = overall >= out.expected - 10 ? 'on pace' : 'behind pace';
      const ev = (pl.events || []).filter(e => e.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      if (ev) out.next = { name: ev.name, date: ev.date, days: dayDiff(t, ev.date) };
    }
    return out;
  }
  function dayDiff(a, b) {
    const f = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
    return Math.round((f(b) - f(a)) / 86400000);
  }

  return {
    rng, shuffle, newSeed, dailySeed, roomCode, fmtNum, fmtAnswer, UNIT_HINT, parseTyped, checkTyped, distract,
    KINDS, KIND_NAMES, mathQ, sprintRound, mathChoices,
    FLOW_ROWS, STMT_NAME, SCENARIOS, flowCalc, flowScenario, flowsRound, flowScore, flowChoices, acct, moveWords,
    LIVE_MIXES, liveQuestion, livePoints, liveBoard,
    cleanName, GAMES, challengeHash, parseChallenge, shareText,
    streak, activeDays, readiness, AREAS, SPRINT_TARGET, addDaysISO, dayDiff,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Games;
