/* The "Right now" notes: built only from the data, dated, and left out when a number is missing.
   Run with: node tests/market.test.js */
const assert = require('assert');
const M = require('../tools/market-notes.js');
const E = require('../src/engine.js');
const s = (date, value, m, y) => ({ date, value, monthAgo: m == null ? null : { date: 'x', value: m }, yearAgo: y == null ? null : { date: 'x', value: y } });
const data = { fetched: '2026-11-10', series: { DGS10: s('2026-11-09', 4.31, 4.12, 4.4), DGS2: s('2026-11-09', 3.9, 3.8, 4.2), DFEDTARU: s('2026-11-09', 4, 4, 4.5), DFEDTARL: s('2026-11-09', 3.75, 3.75, 4.25),
  CPIAUCSL: s('2026-09-01', 330, 329, 320), PCEPILFE: s('2026-09-01', 128.52, 128.3, 125), UNRATE: s('2026-10-01', 4.3, 4.3, 4.1) } };
const n = M.notes(data), titles = new Set(E.TOPICS.map(t => t.title));
Object.keys(n).forEach(t => { assert(titles.has(t), 'not a real topic: ' + t); assert(!/NaN|undefined|null/.test(n[t]), n[t]); assert(/FRED/.test(n[t])); });
assert.strictEqual(Object.keys(n).length, 7);
const bonds = n['Bonds 101: coupons, maturities, and why prices and yields move in opposite directions'];
assert(/Nov\. 9, 2026/.test(bonds) && /4\.31%/.test(bonds) && /up from 4\.12% a month earlier/.test(bonds) && /prices of existing bonds fell/.test(bonds), bonds);
const curve = n['The yield curve, and what an inversion is supposed to signal'];
assert(/gap of 0\.41 percentage points/.test(curve) && /slopes upward/.test(curve), curve);
const fed = n['The Federal Reserve: the fed funds rate, the FOMC and the dual mandate'];
assert(/3\.75% to 4\.00%/.test(fed) && /cut rates by 0\.50 percentage points/.test(fed), fed);
const inf = n['Inflation: CPI vs. PCE, and why the Fed targets 2%'];
assert(/September 2026 were 3\.1% higher/.test(inf) && /up 2\.8% in September 2026, above the Fed's 2% target/.test(inf), inf);
// an inverted curve, and falling yields
const inv = M.notes({ series: { DGS10: s('2026-11-09', 3.5, 3.9, 3.5), DGS2: s('2026-11-09', 4.1, 4, 4) } });
assert(/minus 0\.60 percentage points/.test(inv['The yield curve, and what an inversion is supposed to signal']) && /inverted/.test(inv['The yield curve, and what an inversion is supposed to signal']));
assert(/prices of existing bonds rose/.test(inv['Bonds 101: coupons, maturities, and why prices and yields move in opposite directions']));
// missing data means no note, never a broken one
assert.deepStrictEqual(M.notes(null), {});
assert.deepStrictEqual(M.notes({ series: { DGS10: { date: '2026-11-09', value: 4.3 } } }), {});
const md = '# T\n## In the real world\nx\n\n## The interview trap\ny\n';
assert(M.inject(md, 'Note.').includes('x\n\n## Right now\nNote.\n\n## The interview trap'));
assert.strictEqual(M.inject(md, undefined), md);
console.log('market checks passed');
