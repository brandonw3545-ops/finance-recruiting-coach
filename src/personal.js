/* ==========================================================================
   Street Ready: tailoring a written lesson to the person reading it
   Pure functions, no DOM, no AI. Takes the lesson's Markdown and the profile from
   Setup, and adds two things:
   - a "For you" section near the top: how this topic shows up for their main seat,
     what to do given their level and time, their next date, and a weak spot from
     their Scorecard if one matches;
   - a "Make it yours" question at the end of "Your turn", built from the sectors
     they follow, their experiences or their firms, with grading guidance in Answers.
   Everything here is phrased as advice about interviews in general, never as a fact
   about a specific firm or school.
   ========================================================================== */
const Personal = (() => {
  'use strict';
  const E = typeof Engine !== 'undefined' ? Engine : require('./engine.js');

  // what a person typed, made safe to drop into Markdown: no formatting, links or headings
  const clean = (s, n) => {
    const t = String(s == null ? '' : s).replace(/[*_`[\]#<>|~\\]/g, '').replace(/\s+/g, ' ').trim();
    return t.length > (n || 80) ? t.slice(0, (n || 80) - 1).trimEnd() + '…' : t;
  };
  const AREA = { acc: 'accounting', val: 'valuation', mkt: 'markets' };
  const SEC = { acc: 'acc', val: 'val', mkt: 'mkt', awm: 'awm', car: 'car', inv: 'inv', sto: 'sto', trd: 'trd' };

  /* How much a seat's interviews lean on each lesson subject comes from the plan engine's
     own weights, so the advice here and the plan always agree. */
  function tier(seat, cat) {
    const w = E.SEAT_WEIGHTS[seat], i = E.LESSON_CATS.indexOf(cat);
    if (!w || i < 0) return 'regular';
    return w[i] >= 0.2 ? 'core' : w[i] >= 0.1 ? 'regular' : 'light';
  }
  // the first sentence always; the second only when there's no seat-specific angle to say instead
  const TIER = {
    core: [ph => 'Core material for ' + ph + ' interviews.', 'Expect it in a first round, with a follow-up.'],
    regular: [ph => 'Comes up regularly in ' + ph + ' interviews.', 'Interviewers mostly check that you can explain it simply.'],
    light: [ph => 'Comes up less often in ' + ph + ' interviews.', 'Know the 30-second version and spend extra time elsewhere.'],
  };
  const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
  const UNSURE = {
    core: 'You haven’t picked a seat yet, and this shows up in interviews for most of them. Worth learning well while you decide.',
    regular: 'You haven’t picked a seat yet. This shows up in many finance interviews, and how much you like it is a clue about where you’d fit.',
    light: 'You haven’t picked a seat yet. Only some seats ask about this, so if it clicks for you, notice that.',
  };
  /* One line on how a seat's interviewers come at a subject, where it differs from the general advice. */
  const ANGLE = {
    ib: {
      acc: 'Bankers expect the three statements cold, so practice walking through changes like this without notes.',
      val: 'Valuation is the center of most banking interviews: expect "how would you value this company?" and "which method gives the highest value?"',
      mkt: 'Banking interviewers mostly use markets questions to check you follow the news, so tie it to a recent deal or headline.',
      car: 'Banking interviewers weigh "why banking" and teamwork stories almost as heavily as technicals.',
    },
    st: {
      mkt: 'Trading interviews expect a view: say where you think this is heading and why, then defend it.',
      trd: 'This is the language of the desk. Expect quick follow-ups and mental math on the spot.',
      val: 'On a desk, valuation comes up as "is this cheap or expensive right now?", not as a full model.',
      acc: 'Trading interviews rarely go deep on accounting. Be able to explain the idea in a sentence.',
    },
    am: {
      awm: 'This is close to the job itself, so explain it the way you would to a portfolio manager.',
      mkt: 'Asset management interviews often open with "what’s going on in markets?", so connect this to something current.',
      inv: 'Expect to pitch: asset managers want to hear how this changes your view of a specific stock.',
      val: 'Asset managers use valuation to decide what to buy, so frame your answer around whether a stock is mispriced.',
    },
    wm: {
      awm: 'This is the job itself. Practice explaining it to a client in plain words, without jargon.',
      mkt: 'Wealth management interviews often ask what’s happening in markets and how you’d explain it to a nervous client.',
      val: 'Wealth managers rarely build valuation models. Know it well enough to explain why a stock a client owns looks expensive or cheap.',
      acc: 'In wealth management, accounting matters for understanding a company a client owns, not for modeling it.',
      car: 'Wealth management is a people business, so interviewers listen closely to how you talk about working with others.',
    },
    pe: {
      val: 'Private equity interviews lean on valuation and LBO math, so expect numbers, not just definitions.',
      acc: 'Private equity wants accounting fluency: cash flow, debt and working capital come up constantly.',
      car: 'Private equity interviews often ask about a deal you’ve followed, so have one ready.',
    },
    hf: {
      inv: 'Hedge funds want a pitch with an edge: what is the market missing?',
      mkt: 'Expect to defend a view on rates, the economy or a sector you follow.',
      val: 'Hedge fund interviews use valuation to test judgment: is it cheap, and what would change your mind?',
    },
    er: {
      acc: 'Equity research lives in financial statements, so expect to read and explain lines from a 10-K.',
      val: 'Research analysts set price targets, so tie this to how you’d value a stock you follow.',
      inv: 'Expect to pitch a stock and defend your numbers.',
    },
    cf: {
      acc: 'Corporate finance teams work in their own company’s numbers every day: budgets, forecasts and cash.',
      val: 'Corporate finance uses valuation mainly for big decisions: will this project or purchase earn more than it costs?',
    },
    cb: {
      acc: 'Credit analysts read financial statements to answer one question: can this company pay its debt back?',
      mkt: 'Lenders watch interest rates closely, because rates set what borrowers pay.',
    },
    vc: {
      inv: 'Venture capital interviews often ask you to pitch a startup or a market, with a view on why now.',
      val: 'Early-stage companies often have no profits, so venture valuation leans on comparables and growth, not cash flows.',
    },
  };

  function seatLine(p, cat) {
    const seat = p.primary || (p.seats && p.seats[0]) || 'unsure';
    if (cat === 'car') {
      const angle = ANGLE[seat] && ANGLE[seat].car;
      return 'Every interview has these questions, whatever the seat.' + (angle ? ' ' + angle : '');
    }
    if (seat === 'unsure' || !E.SEATS[seat]) return UNSURE[tier('unsure', cat)];
    const t = TIER[tier(seat, cat)], angle = ANGLE[seat] && ANGLE[seat][cat];
    let s = t[0](E.SEATS[seat].phrase) + ' ' + (angle || t[1]);
    const also = (p.seats || []).filter(x => x !== seat && x !== 'unsure' && E.SEATS[x] && tier(x, cat) === 'core');
    if (also.length && tier(seat, cat) !== 'core') s += ' It’s core for ' + also.map(x => E.SEATS[x].phrase).join(' and ') + ', your other target' + (also.length > 1 ? 's' : '') + '.';
    return s;
  }

  function levelLine(p, cat) {
    const lv = AREA[cat] && p.levels && p.levels[cat];
    if (lv === 'new') return 'You marked ' + AREA[cat] + ' as new to you, so go slowly: read How it works twice and try every question in Your turn before you open the answers.';
    if (lv === 'solid') return 'You marked ' + AREA[cat] + ' as solid. Skip to The interview trap, answer Say it out loud, and aim for a 5.';
    return '';
  }
  function timeLine(p) {
    if (+p.minutes === 10) return 'You set 10 minutes a lesson. If that’s all you have today, read The big idea and The interview trap, then answer Say it out loud.';
    if (+p.minutes === 30) return 'You set 30 minutes a lesson, so finish with Make it yours at the end and grade it.';
    return '';
  }
  const shortDate = d => E.fmt(d, { month: 'short', day: 'numeric' });
  function dateLine(plan, item, today) {
    if (!plan || !today) return '';
    const next = (plan.events || []).filter(e => e.date >= today)[0];
    if (next && !(item && item.event && item.event.id === next.id)) {
      const n = E.daysBetween(today, next.date);
      if (n <= 30) return clean(next.name, 70) + (n === 0 ? ' is today.' : n === 1 ? ' is tomorrow.' : ' is in ' + n + ' days (' + shortDate(next.date) + ').') + (next.est ? ' That date is an estimate.' : '');
    }
    if (plan.ready && plan.ready >= today) {
      const n = E.daysBetween(today, plan.ready);
      return 'You want to be interview-ready by ' + shortDate(plan.ready) + ', ' + n + ' day' + (n === 1 ? '' : 's') + ' from now.';
    }
    return '';
  }
  const ANSWER_CATS = { car: ['car', 'beh', 'fit'] };
  function weakLine(weak, cat, topicId) {
    const cats = ANSWER_CATS[cat] || [cat], low = (weak || []).filter(x => x && x.score <= 3 && x.q);
    const own = topicId ? low.find(x => String(x.qid || '').indexOf('L:' + topicId + ':') === 0) : null;
    const w = own || low.find(x => cats.includes(x.cat));
    if (!w) return '';
    const q = clean(w.q, 110), quoted = '“' + q + (/[.?!…]$/.test(q) ? '”' : '.”');
    return own ? 'Last time you scored ' + w.score + '/5 on this lesson’s question ' + quoted + ' Answer it again before you move on.'
      : 'You scored ' + w.score + '/5 on ' + quoted + ' This lesson covers related ground, so try that question again afterward.';
  }

  /* The question at the end of "Your turn". It uses the first thing they listed, so it stays
     the same from visit to visit and their score history lines up. */
  function makeItYours(p, lesson) {
    const cat = lesson.cat, title = String(lesson.title || '');
    const interest = clean(E.splitList(p.interests || '')[0], 40);
    const exps = E.splitLines(p.experiences || '').map(x => clean(x, 70)).filter(Boolean), exp = exps[0] ? clean(exps[0], 90) : '';
    const firm = clean((p.firmList || E.splitList(p.firms || ''))[0], 40);
    const seat = E.SEATS[p.primary] && p.primary !== 'unsure' ? E.SEATS[p.primary].phrase : '';
    if (cat === 'car') {
      if (exps.length && /tell me about yourself/i.test(title)) return { q: 'Draft your 60-second answer from what you entered in Setup: ' + exps.slice(0, 2).map(x => '“' + x + '”').join(' and ') + '. Start with where you are now, then how you got here, then why this seat.', from: 'experience' };
      if (p.why && /why finance/i.test(title)) return { q: 'Turn your note from Setup, “' + clean(p.why, 100) + '”, into a 60-second answer only you could give.', from: 'why' };
      if (firm && /firm|why this|research/i.test(title)) return { q: 'Answer “Why ' + firm + '?” in 60 seconds, using what this lesson teaches.', from: 'firm' };
      if (exp) return { q: 'Answer this lesson’s main question with one of your own experiences, “' + exp + '”, in 90 seconds.', from: 'experience' };
      if (p.why) return { q: 'Turn your “why finance” note from Setup into a 60-second answer, using this lesson’s structure.', from: 'why' };
      return null;
    }
    if (interest) {
      const Q = {
        acc: 'Pick one company tied to ' + interest + '. Find this lesson’s idea in its latest annual report (the 10-K) and explain in 60 seconds what it tells you about the business.',
        val: 'Pick one company tied to ' + interest + '. Using this lesson, explain in 60 seconds how you’d judge whether its stock is cheap or expensive, and what you’d look up first.',
        mkt: 'How does this lesson show up in ' + interest + ' right now? Give a 60-second answer that uses one number you looked up today.',
        inv: 'Use this lesson to pitch one stock tied to ' + interest + ' in 60 seconds: the idea, why now, and the biggest risk.',
        trd: 'How would a trader use this lesson on a stock or commodity tied to ' + interest + ' this week? Answer in 60 seconds.',
        awm: 'Explain this lesson in 60 seconds to a family friend who works in ' + interest + ' and has never had a financial advisor. What would matter most to them?',
        sto: 'Could something like this happen in ' + interest + ' today? Make the case in 60 seconds, for or against.',
      };
      if (Q[cat]) return { q: Q[cat], from: 'interest' };
    }
    if (seat) return { q: 'Explain this lesson in 60 seconds the way you would in ' + an(seat) + ' interview, with one real example.', from: 'seat' };
    return { q: 'Explain this lesson in 60 seconds to a friend who isn’t in finance, with one real example.', from: 'none' };
  }
  const GUIDE = {
    car: 'There’s no single right answer. A strong one tells one specific story, says what you did yourself, and ends with what you learned or why it points you to this seat.',
    other: 'There’s no single right answer. A strong one names a real company or number, uses the lesson’s idea correctly, and ends with what you’d check next.',
  };

  /* lesson: { cat, title, topicId }; ctx: { today, plan, item, weak } */
  function build(profile, lesson, ctx) {
    const p = E.normalize(profile || {});
    ctx = ctx || {};
    const cat = SEC[lesson && lesson.cat] || 'gen';
    const lines = [];
    const add = (label, text) => { if (text) lines.push({ label, text }); };
    add('Your seat', seatLine(p, cat));
    add('Your level', levelLine(p, cat));
    add('Your time', timeLine(p));
    add('Your dates', dateLine(ctx.plan, ctx.item, ctx.today));
    add('Your Scorecard', weakLine(ctx.weak, cat, lesson && lesson.topicId));
    if (cat === 'car' && p.goalList && p.goalList.length) add('Your goal', clean(p.goalList[0], 120) + '. Aim your answers at that.');
    const make = makeItYours(p, lesson || {});
    const nudge = !String(p.interests || '').trim() && cat !== 'car' ? 'Add the sectors you follow in Setup and the last question in every lesson will use them.' : '';
    return { lines, make, nudge, guide: make ? (cat === 'car' ? GUIDE.car : GUIDE.other) : '' };
  }

  /* Puts the pieces into the lesson's Markdown: "For you" after the opening lines and before
     the first section, "Make it yours" as the last item of "Your turn", and its guidance as
     the last item of "Answers". A lesson missing those sections gets only what fits. */
  function apply(md, b) {
    if (!b || !md) return md;
    const L = String(md).replace(/\r/g, '').split('\n');
    const headAt = re => L.findIndex(l => re.test(l));
    const sectionEnd = start => { let i = start + 1; while (i < L.length && !/^##\s/.test(L[i])) i++; while (i > start + 1 && !L[i - 1].trim()) i--; return i; };
    // Make it yours, at the end of Your turn
    const turn = headAt(/^##\s+your turn/i);
    if (b.make && turn >= 0) {
      const end = sectionEnd(turn);
      let n = 0;
      for (let i = turn + 1; i < end; i++) { const m = /^(\d+)[.)]\s/.exec(L[i]); if (m) n = Math.max(n, +m[1]); }
      L.splice(end, 0, (n ? (n + 1) + '. ' : '- ') + '**Make it yours:** ' + b.make.q);
    }
    const ans = headAt(/^##\s+answers/i);
    if (b.make && b.guide && ans >= 0) L.splice(sectionEnd(ans), 0, '- **Make it yours:** ' + b.guide);
    // For you, before the first section
    const first = headAt(/^##\s/);
    const rows = b.lines.map(x => '- **' + x.label + ':** ' + x.text);
    if (b.nudge) rows.push('- ' + b.nudge);
    if (rows.length) L.splice(first >= 0 ? first : L.length, 0, '## For you', ...rows, '');
    return L.join('\n');
  }

  return { build, apply, tier, clean, makeItYours, ANGLE };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Personal;
