/* Turns the numbers in content/market.json into a short "Right now" note for the lessons they explain.
   Every sentence is built from the data and carries its date, so a stale file can never read as today's news.
   Only U.S. government series are used (Treasury, Federal Reserve, BLS, BEA), fetched from FRED by tools/fetch-market.mjs. */
'use strict';
const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const day = iso => { const [y, m, d] = iso.split('-').map(Number); return MONTHS[m - 1] + ' ' + d + ', ' + y; };
const month = iso => { const [y, m] = iso.split('-').map(Number); return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1] + ' ' + y; };
const pct = (n, dp) => n.toFixed(dp == null ? 2 : dp) + '%';
const moved = (now, then, dp) => Math.abs(now - then) < 0.005 ? 'unchanged from' : (now > then ? 'up from ' : 'down from ') + pct(then, dp);
const yoy = s => (s.value / s.yearAgo.value - 1) * 100;

function notes(data) {
  const out = {}, S = (data && data.series) || {};
  const has = (...ids) => ids.every(id => S[id] && Number.isFinite(S[id].value));
  const full = (...ids) => ids.every(id => has(id) && S[id].monthAgo && S[id].yearAgo);
  const src = ' *Source: FRED, Federal Reserve Bank of St. Louis.*';
  if (full('DGS10')) {
    const t = S.DGS10, vsMonth = moved(t.value, t.monthAgo.value), up = t.value > t.monthAgo.value + 0.005, down = t.value < t.monthAgo.value - 0.005;
    out['Bonds 101: coupons, maturities, and why prices and yields move in opposite directions'] =
      'On ' + day(t.date) + ', the 10-year Treasury yielded ' + pct(t.value) + ', ' + (vsMonth === 'unchanged from' ? 'unchanged from a month earlier' : vsMonth + ' a month earlier') + '. ' +
      (up ? 'Yields rose, so the prices of existing bonds fell over that month.' : down ? 'Yields fell, so the prices of existing bonds rose over that month.' : 'With yields flat, existing bond prices barely moved.') +
      ' A year earlier it was ' + pct(t.yearAgo.value) + '.' + src;
    out['Why interest rates move stock prices'] =
      'On ' + day(t.date) + ', the 10-year Treasury yielded ' + pct(t.value) + ', ' + (Math.abs(t.value - t.yearAgo.value) < 0.005 ? 'the same as' : (t.value > t.yearAgo.value ? 'up from ' : 'down from ') + pct(t.yearAgo.value)) + ' a year earlier. ' +
      (t.value > t.yearAgo.value + 0.005 ? 'A higher yield raises the rate used to discount future profits, which weighs most on stocks whose earnings are far in the future.' : t.value < t.yearAgo.value - 0.005 ? 'A lower yield reduces the rate used to discount future profits, which helps most the stocks whose earnings are far in the future.' : 'With the discount rate about where it was, any move in stocks over the year came from earnings and sentiment, not from rates.') + src;
    out['DCF, part 2: the discount rate (WACC, CAPM and beta)'] =
      'On ' + day(t.date) + ', the 10-year Treasury yielded ' + pct(t.value) + '. That is the usual starting point for the risk-free rate in CAPM, so a cost of equity built today starts from about ' + pct(t.value, 1) + ' before any equity risk premium is added.' + src;
  }
  if (has('DGS10', 'DGS2')) {
    const a = S.DGS10, b = S.DGS2, spread = a.value - b.value;
    out['The yield curve, and what an inversion is supposed to signal'] =
      'On ' + day(a.date) + ', the 2-year Treasury yielded ' + pct(b.value) + ' and the 10-year yielded ' + pct(a.value) + ', a gap of ' + (spread < 0 ? 'minus ' : '') + Math.abs(spread).toFixed(2) + ' percentage points. ' +
      (spread < -0.005 ? 'The curve is inverted: short-term money costs more than long-term money.' : spread < 0.255 ? 'The curve is nearly flat.' : 'The curve slopes upward, which is its normal shape.') + src;
  }
  if (has('DFEDTARU', 'DFEDTARL') && S.DFEDTARU.yearAgo) {
    const u = S.DFEDTARU, l = S.DFEDTARL, was = u.yearAgo.value;
    out['The Federal Reserve: the fed funds rate, the FOMC and the dual mandate'] =
      'On ' + day(u.date) + ', the Fed\'s target range for the fed funds rate was ' + pct(l.value) + ' to ' + pct(u.value) + '. ' +
      (Math.abs(u.value - was) < 0.005 ? 'That is the same range as a year earlier.' : 'A year earlier the top of the range was ' + pct(was) + ', so the Fed has ' + (u.value < was ? 'cut' : 'raised') + ' rates by ' + Math.abs(u.value - was).toFixed(2) + ' percentage points in total since then.') + src;
  }
  if (has('CPIAUCSL') && S.CPIAUCSL.yearAgo) {
    const c = S.CPIAUCSL, p = S.PCEPILFE, cy = yoy(c);
    out['Inflation: CPI vs. PCE, and why the Fed targets 2%'] =
      'Consumer prices in ' + month(c.date) + ' were ' + pct(cy, 1) + ' higher than a year earlier, as measured by CPI.' +
      (p && p.yearAgo ? ' Core PCE, the measure the Fed watches most closely, was up ' + pct(yoy(p), 1) + ' in ' + month(p.date) + ', ' + (yoy(p) > 2.05 ? 'above' : yoy(p) < 1.95 ? 'below' : 'at') + ' the Fed\'s 2% target.' : '') + src;
  }
  if (full('DGS10') && has('DFEDTARU', 'DFEDTARL', 'UNRATE') && has('CPIAUCSL') && S.CPIAUCSL.yearAgo) {
    out['"What\'s going on in the markets?": a daily habit and a 60-second answer'] =
      'Four numbers to know before any interview, as of the latest data. The 10-year Treasury yield: ' + pct(S.DGS10.value) + ' (' + day(S.DGS10.date) + '). The Fed\'s target range: ' + pct(S.DFEDTARL.value) + ' to ' + pct(S.DFEDTARU.value) + '. Inflation: CPI up ' + pct(yoy(S.CPIAUCSL), 1) + ' over the year to ' + month(S.CPIAUCSL.date) + '. Unemployment: ' + pct(S.UNRATE.value, 1) + ' in ' + month(S.UNRATE.date) + '. Check the stock market\'s level yourself the morning of the interview.' + src;
  }
  return out;
}
// add the note as its own section, just before the interview trap
function inject(md, note) {
  const at = md.indexOf('\n## The interview trap');
  return at < 0 || !note ? md : md.slice(0, at) + '\n## Right now\n' + note + '\n' + md.slice(at);
}
module.exports = { notes, inject };
