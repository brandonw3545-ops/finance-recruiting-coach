// Fetches a handful of U.S. government data series from FRED and writes content/market.json.
// Runs once a day in GitHub Actions (.github/workflows/market.yml) with FRED_API_KEY from the repo's secrets.
// The key never reaches the website: visitors only ever see the saved numbers.
import fs from 'node:fs';
const KEY = process.env.FRED_API_KEY;
if (!KEY) { console.log('No FRED_API_KEY set, so nothing was fetched.'); process.exit(0); }
const SERIES = ['DGS10', 'DGS2', 'DFEDTARU', 'DFEDTARL', 'CPIAUCSL', 'PCEPILFE', 'UNRATE'];
const back = (iso, days) => new Date(Date.parse(iso + 'T12:00:00Z') - days * 86400000).toISOString().slice(0, 10);
const out = { fetched: new Date().toISOString().slice(0, 10), source: 'FRED, Federal Reserve Bank of St. Louis', series: {} };
for (const id of SERIES) {
  const url = 'https://api.stlouisfed.org/fred/series/observations?series_id=' + id + '&api_key=' + KEY + '&file_type=json&sort_order=desc&limit=500';
  const res = await fetch(url);
  if (!res.ok) { console.error(id + ': FRED answered ' + res.status); process.exit(1); }
  const obs = ((await res.json()).observations || []).filter(o => o.value !== '.' && Number.isFinite(+o.value)).map(o => ({ date: o.date, value: +o.value }));
  if (!obs.length) { console.error(id + ': no observations'); process.exit(1); }
  const latest = obs[0], pick = days => obs.find(o => o.date <= back(latest.date, days)) || null;
  out.series[id] = { date: latest.date, value: latest.value, monthAgo: pick(30), yearAgo: pick(365) };
}
fs.writeFileSync(new URL('../content/market.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('Saved ' + SERIES.length + ' series, latest ' + out.series.DGS10.date);
