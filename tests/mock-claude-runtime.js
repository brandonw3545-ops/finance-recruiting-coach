/* A stand-in for the claude.ai viewer's `sample` capability (runtime contract 0.2.87).
   It enforces the same input/option rules the real runtime rejects with invalid_request,
   streams canned answers, and calls the page's tools the way Claude would. */
(() => {
  const log = [];
  window.__sampleLog = log;
  window.__violations = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const localISO = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const bad = (message) => { window.__violations.push(message); return { code: 'invalid_request', message }; };
  function validate(input, opts) {
    if (typeof input === 'string') { if (!input.trim()) throw bad('empty input'); }
    else if (Array.isArray(input)) {
      if (!input.length || input[0].role !== 'user' || input[input.length - 1].role !== 'user') throw bad('turns must start and end on user');
      input.forEach((t, i) => { if (!['user', 'assistant'].includes(t.role) || typeof t.content !== 'string' || !t.content.trim()) throw bad('bad turn ' + i); });
    } else throw bad('input type');
    if (opts !== undefined && (typeof opts !== 'object' || opts === null || Array.isArray(opts) || Object.getPrototypeOf(opts) !== Object.prototype)) throw bad('options not a plain object');
    opts = opts || {};
    if ('cache' in opts) {
      const c = opts.cache;
      if (opts.tools && c !== false) throw bad('cache with tools');
      const okObj = c && typeof c === 'object' && (c.gcTime === undefined || (typeof c.gcTime === 'number' && c.gcTime > 0));
      if (!(c === true || c === false || okObj)) throw bad('bad cache value');
    }
    if ('tools' in opts) {
      if (!Array.isArray(opts.tools)) throw bad('tools not an array');
      const names = new Set();
      opts.tools.forEach(t => {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(t.name) || names.has(t.name)) throw bad('tool name ' + t.name);
        names.add(t.name);
        if (!t.description || new TextEncoder().encode(t.description).length > 1024) throw bad('tool description ' + t.name);
        if (t.inputSchema && (t.inputSchema.type !== 'object' || new TextEncoder().encode(JSON.stringify(t.inputSchema)).length > 4096)) throw bad('tool schema ' + t.name);
        if (typeof t.execute !== 'function') throw bad('tool execute ' + t.name);
      });
    }
    if ('modelTier' in opts && !['quick', 'default', 'complex'].includes(opts.modelTier)) throw bad('modelTier');
    if ('signal' in opts && !(opts.signal instanceof AbortSignal)) throw bad('signal');
    if ('onText' in opts && typeof opts.onText !== 'function') throw bad('onText');
    const bytes = new TextEncoder().encode(typeof input === 'string' ? input : input.map(t => t.content).join('')).length;
    if (bytes > 262144) throw { code: 'prompt_too_large', message: 'too big' };
    window.__maxPromptBytes = Math.max(window.__maxPromptBytes || 0, bytes);
  }
  async function stream(text, opts) {
    const chunks = text.match(/[\s\S]{1,160}/g);
    let acc = '';
    for (const ch of chunks) {
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'cancelled', text: acc || undefined };
      await sleep(4);
      acc += ch;
      if (opts.onText) opts.onText({ text: acc, delta: ch });
    }
    return { text: acc, truncated: false, modelTierApplied: opts.modelTier || 'default' };
  }
  const LESSON = [
    '# {TITLE}',
    '*Comes up in:* almost every first round for your seats.',
    '',
    '## Cold open',
    '"Walk me through how the three financial statements link together." Answer it out loud before you read on.',
    '',
    '## The big idea',
    'The income statement shows profit, the balance sheet shows what you own and owe, and the cash flow statement shows where cash really went.',
    '',
    '## How it works',
    '| Line | Amount |',
    '|---|---|',
    '| Revenue | $100 |',
    '| Net income | $20 |',
    '',
    '## In the real world',
    'Enron reported profits while its cash flow told a different story. Watch the next big-bank earnings release.',
    '',
    '## The interview trap',
    'Most candidates list the statements instead of linking them.',
    '> Net income flows to the top of the cash flow statement and into retained earnings.',
    '',
    '## Your line',
    'Cash is a fact, profit is an opinion.',
    '',
    '## Your turn',
    '1. **Say it out loud:** How does a $10 increase in depreciation flow through the statements?',
    '2. **Rapid fire:**',
    '   a. What is EBITDA?',
    '   b. What is working capital?',
    '   c. What is free cash flow?',
    '3. **Rewind:** Why is $100 today worth more than $100 next year?',
    '4. **Brain teaser:** What is 17 x 24?',
    '',
    '## Answers',
    'a. Earnings before interest, taxes, depreciation and amortization. b. Current assets minus current liabilities. c. Operating cash flow minus capex. Teaser: 408.',
  ].join('\n');
  async function sampleFn(input, opts) {
    try { validate(input, opts); } catch (e) { return Promise.reject(e); }
    opts = opts || {};
    log.push({ kind: 'sample', tools: opts.tools ? opts.tools.map(t => t.name) : null, cache: opts.cache, tier: opts.modelTier, first: (typeof input === 'string' ? input : input[input.length - 1].content).slice(0, 80) });
    if (window.__mockFail) { const f = window.__mockFail; window.__mockFail = null; await sleep(10); throw f; }
    await sleep(15);
    if (typeof input === 'string') {
      const m = /Write today's (?:lesson|drill): "([^"]+)"/.exec(input);
      if (m) return stream(LESSON.replace('{TITLE}', m[1]), opts);
      return stream('# Prep session\n## What they screen for\nPreparation.\n## Your turn\nTwo tasks.', opts);
    }
    const last = input[input.length - 1].content;
    const ctx = { signal: (opts.signal || new AbortController().signal) };
    if (opts.tools && /interview is/i.test(last)) {
      const add = opts.tools.find(t => t.name === 'add_key_date');
      let res;
      try { res = await add.execute({ name: 'Investment club interview', date: localISO(9), type: 'club', note: 'Second round' }, ctx); } catch (e) { res = 'Error: ' + e.message; }
      log.push({ kind: 'tool', name: 'add_key_date', res });
      let again;
      try { again = await add.execute({ name: 'Investment club interview', date: localISO(9), type: 'club' }, ctx); } catch (e) { again = 'Error: ' + e.message; }
      log.push({ kind: 'tool', name: 'add_key_date (repeat)', res: again });
      let past;
      try { past = await add.execute({ name: 'Old thing', date: localISO(-3), type: 'other' }, ctx); } catch (e) { past = 'Error: ' + e.message; }
      log.push({ kind: 'tool', name: 'add_key_date (past)', res: past });
      const sched = opts.tools.find(t => t.name === 'get_schedule');
      const res2 = await sched.execute({ from: localISO(0), to: localISO(60) }, ctx);
      log.push({ kind: 'tool', name: 'get_schedule', res: { from: res2.from, to: res2.to, n: res2.sessions.length, keys: res2.key_dates } });
      return stream('Added your **Investment club interview** on ' + localISO(9) + '. Prep: ' + (res.prep_sessions || []).map(p => p.session + ' (' + p.date + ')').join(', '), opts);
    }
    if (opts.tools && /moved to/i.test(last)) {
      const ch = opts.tools.find(t => t.name === 'change_key_date');
      let amb; try { amb = await ch.execute({ match: 'i', new_date: localISO(12) }, ctx); } catch (e) { amb = 'Error: ' + e.message; }
      log.push({ kind: 'tool', name: 'change_key_date (ambiguous)', res: amb });
      let res; try { res = await ch.execute({ match: 'club interview', new_date: localISO(12) }, ctx); } catch (e) { res = 'Error: ' + e.message; }
      log.push({ kind: 'tool', name: 'change_key_date', res });
      const up = opts.tools.find(t => t.name === 'update_goals_and_firms');
      let r2; try { r2 = await up.execute({ add_firms: ['Evercore'], add_goals: ['Win the stock pitch competition'] }, ctx); } catch (e) { r2 = 'Error: ' + e.message; }
      log.push({ kind: 'tool', name: 'update_goals_and_firms', res: r2 });
      const rd = opts.tools.find(t => t.name === 'set_interview_ready_date');
      let r3; try { r3 = await rd.execute({ date: localISO(200) }, ctx); } catch (e) { r3 = 'Error: ' + e.message; }
      log.push({ kind: 'tool', name: 'set_interview_ready_date', res: r3 });
      return stream('Moved it, added Evercore, and re-paced your plan.', opts);
    }
    if (opts.tools && /how am i doing/i.test(last)) {
      const gs = opts.tools.find(t => t.name === 'get_scores');
      const r = await gs.execute({}, ctx);
      log.push({ kind: 'tool', name: 'get_scores', res: r });
      return stream('You have ' + r.graded_answers + ' graded answers so far.', opts);
    }
    return stream('Focus on linking the three statements this week, then do one mock.', opts);
  }
  sampleFn.json = async function (input, opts) {
    try { validate(input, opts); } catch (e) { return Promise.reject(e); }
    opts = opts || {};
    log.push({ kind: 'json', tier: opts.modelTier, first: input.slice(0, 60), fu: (input.match(/\nFollow-up: /g) || []).length });
    if (window.__mockFail) { const f = window.__mockFail; window.__mockFail = null; await sleep(10); throw f; }
    await sleep(15);
    if (input.includes('Ask ONE natural follow-up')) { const q = (/You asked: "([^"]*)"/.exec(input) || [])[1] || ''; return { followUp: 'You said that about "' + q.slice(0, 24) + '". Can you put a number on it?' }; }
    if (input.includes('Grade one interview answer')) return { score: 3, verdict: 'Right idea, loose structure.', strengths: ['Correct core idea'], fixes: ['Lead with the answer', 'Use numbers'], better: 'Net income links all three...', followUp: 'What happens to cash?', topic: 'Three statements' };
    if (input.includes('mock interview')) { const n = (input.match(/\nQ\d+ \[/g) || []).length; return { overall: 3, advance: false, headline: 'Solid start; the technicals need work.', items: Array.from({ length: n }, (_, i) => ({ score: 2 + (i % 3), feedback: 'Feedback ' + (i + 1), better: 'Better answer ' + (i + 1), topic: 'Topic ' + (i + 1) })), next: ['Drill the EV bridge', 'Tighten your story', 'One mock this week'] }; }
    if (input.includes('Suggest the key recruiting dates')) return { readyBy: localISO(150), why: 'Leaves a cushion before applications open.', events: [{ name: 'Club applications close', date: localISO(20), type: 'club', note: 'Typical timing; confirm.' }, { name: 'Sophomore programs open', date: localISO(200), type: 'application', note: 'Varies by firm.' }] };
    return {};
  };
  sampleFn.limits = async () => (window.__mockNoTools ? { maxPromptBytes: 262144 } : { maxPromptBytes: 262144, tools: { maxCount: 16 } });
  window.claude = { use: async (name) => { await sleep(25); if (window.__mockNull) return null; return name === 'sample' ? sampleFn : null; } };
})();
