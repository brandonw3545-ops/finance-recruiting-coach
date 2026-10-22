/* ==========================================================================
   Finance Recruiting Coach: the coach's prompts
   Every call to Claude is memoryless, so each prompt carries the rules,
   the student's profile and the exact output format.
   ========================================================================== */
const Prompts = (() => {
  'use strict';
  const E = Engine;

  const RULES = [
    'You are a finance recruiting coach for one college student. Teach like a sharp second-year analyst who still remembers learning this: plain English first, then the precise version interviewers expect. Be direct when an answer is weak and specific about how to fix it.',
    '',
    'Ground rules:',
    "- Accuracy first. If you aren't sure of a figure, date or detail, leave it out or flag it as something to check. Never invent statistics, deals, quotes, people or news.",
    "- You can't browse the web and your knowledge has a cutoff. Never present anything as this week's news. When current events matter, tell the student exactly what to look up (the latest CPI release, a company's last earnings call) instead of guessing.",
    "- Don't invent facts about the student's school (clubs, programs, deadlines, alumni). When something depends on their school, tell them what to ask and whom to ask.",
    "- Pitch everything at the student's level and target seats.",
    '- American English. No emoji. No filler openers like "Great question".',
  ].join('\n');

  const LV = { new: 'brand new', some: 'some exposure', solid: 'solid' };
  const WORDS = { 10: 550, 20: 900, 30: 1300 };

  function longDate(isoStr) { return E.fmt(isoStr, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }

  /* ctx: { plan, item, today, weak: [{topic, score, q}], recent: [titles] } */
  function profileBlock(p, ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};
    const L = [];
    const seats = p.seats.map(s => E.SEATS[s].label + (s === p.primary && p.seats.length > 1 ? ' (primary)' : '')).join(', ');
    L.push('Student: ' + (p.name || 'the student') + ', ' + p.year.toLowerCase() + ' at ' + p.school + (p.major ? ', studying ' + p.major : '') + '.');
    L.push('Target seats: ' + seats + '.');
    L.push('Firms on their list: ' + (p.firmList.length ? p.firmList.join(', ') : 'none chosen yet') + '.');
    if (p.goalList && p.goalList.length) L.push('Their goals: ' + p.goalList.join('; ') + '.');
    L.push('Self-rated starting level: accounting ' + LV[p.levels.acc] + ', valuation ' + LV[p.levels.val] + ', markets ' + LV[p.levels.mkt] + '.');
    if (p.interests) L.push('Markets and sectors they follow: ' + p.interests + '.');
    if (p.why) L.push('Why finance, in their words: ' + p.why.replace(/\s+/g, ' ').trim());
    if (p.experiences) L.push('Experiences they can draw on: ' + p.experiences.split(/\n+/).map(s => s.trim()).filter(Boolean).join('; ') + '.');
    if (opts.static) return L.join('\n');
    const today = ctx.today || E.todayISO();
    L.push('Today: ' + longDate(today) + '.');
    const plan = ctx.plan;
    if (plan && !plan.error) {
      const away = E.daysBetween(today, plan.ready);
      L.push('Interview-ready target: ' + longDate(plan.ready) + (away >= 0 ? ' (' + away + ' days away).' : ' (already passed).'));
      if (ctx.item) {
        const ph = plan.phases.find(x => x.n === ctx.item.phase);
        L.push('This session: day ' + ctx.item.day + ' of ' + plan.total + (ph ? ', phase "' + ph.name + '"' : '') + '.');
      }
      const up = plan.events.filter(e => e.date >= today).slice(0, 3);
      if (up.length) L.push('Coming up: ' + up.map(e => e.name + ' (' + E.EVENT_TYPES[e.type].toLowerCase() + ') on ' + E.fmt(e.date, { month: 'short', day: 'numeric' }) + ', ' + E.daysBetween(today, e.date) + ' days away' + (e.est ? ', date is an estimate' : '')).join('; ') + '.');
    }
    if (ctx.weak && ctx.weak.length) L.push('Weak spots to revisit (latest score out of 5): ' + ctx.weak.slice(0, 5).map(w => w.topic + ' (' + w.score + ')').join('; ') + '.');
    else L.push('Weak spots to revisit: none logged yet.');
    if (ctx.recent && ctx.recent.length) L.push('Recent lessons: ' + ctx.recent.slice(0, 5).join('; ') + '.');
    return L.join('\n');
  }

  /* ---------------- lessons ---------------- */
  function standardFormat(title, words, teaser, extra) {
    return [
      'Write today\'s lesson: "' + title + '".',
      extra || '',
      'Aim for about ' + words + ' words before the Answers section. Use Markdown with exactly these headings, in this order:',
      '',
      '# ' + title,
      '*Comes up in:* one line on how often this shows up in first-round interviews for the student\'s target seats.',
      '',
      '## Cold open',
      'One interview question on this topic, phrased the way an interviewer would ask it. Then one line telling the student to answer it out loud before reading on.',
      '',
      '## The big idea',
      'Two to four sentences in plain English, with one analogy.',
      '',
      '## How it works',
      'The mechanics, with a short worked example using simple numbers. Use a small table if it helps.',
      '',
      '## In the real world',
      'One real, well-documented example this concept explains (historical is fine). No invented current events. End with one line on what to watch in the news to see it live.',
      '',
      '## The interview trap',
      'The mistake most candidates make. Then a model answer they could say in about 60 seconds, as a blockquote.',
      '',
      '## Your line',
      'One sentence the student could drop into a "what\'s going on in the markets" or "why this matters" answer, the follow-up an interviewer would ask next, and the strongest counterargument.',
      '',
      '## Your turn',
      '1. **Say it out loud:** one question to answer in 60 seconds, after 30 seconds to think.',
      '2. **Rapid fire:** three short questions, labeled a, b and c.',
      '3. **Rewind:** one question on a weak spot or earlier lesson listed above. If none are listed, use a fundamental from an earlier topic.',
      '4. **Brain teaser:** one ' + teaser + ' mental math, probability, market sizing or logic question.',
      '',
      '## Answers',
      'Short answers to the rapid fire, the rewind and the brain teaser.',
      '',
      'Make it specific to this student: use their seats, interests and background where they genuinely fit. Start directly with the heading. No preamble, no sign-off.',
    ].filter(x => x !== null).join('\n');
  }

  const DRILL_SET = {
    car: 'Four numbered behavioral questions this student is likely to face. Under each, a STAR skeleton (situation, task, action, result) built from the experiences they listed, with [brackets] where they need specifics. If they listed no experiences, give the skeleton with prompts for what to fill in.',
    mkt: 'First, a fill-in-the-blanks 60-second markets answer with [brackets] for the live numbers. Then six numbered follow-up questions an interviewer might ask after it, easiest to hardest.',
    awm: 'Six numbered client scenarios (age, goal, situation and one twist), each ending with "What would you recommend, and why?"',
    inv: 'Six numbered pushback questions an interviewer would throw at a stock pitch, easiest to hardest. If the student follows a sector, frame them around a well-known company in it.',
    sto: 'Six numbered rapid questions on famous market events (what happened, why, and what it teaches), each answerable in 30 seconds.',
  };
  const DRILL_WARM = {
    mkt: "The five things to check before giving a markets answer today, and where to find each. Don't quote any figures from memory.",
  };

  function drillFormat(item, words) {
    const set = DRILL_SET[item.cat] || 'Six numbered interview questions for the student\'s target seats, easiest to hardest. Mix "walk me through" questions with short calculations and one curveball. No answers here.';
    const warm = DRILL_WARM[item.cat] || 'One quick question to get going.';
    return [
      'Write today\'s drill: "' + item.title + '". Focus: ' + (item.focus || (E.DRILLS[item.cat] || {}).focus || 'interview reps') + '.',
      'No new theory: this is interview practice at speed. Vary the questions from earlier rounds. Aim for about ' + words + ' words before the Answers section. Use Markdown with exactly these headings:',
      '',
      '# ' + item.title,
      '*Drill day:* one line on what today trains and how long a strong answer should take.',
      '',
      '## Warm-up',
      warm,
      '',
      '## The set',
      set,
      '',
      '## Stretch',
      'One harder question a top interviewer might use to separate candidates.',
      '',
      '## Your turn',
      'Tell the student to answer two questions from the set out loud with a 60-second timer, then get them graded.',
      '',
      '## Answers',
      'For the warm-up, every question in the set and the stretch: a concise model answer and the most common mistake.',
      '',
      'Start directly with the heading. No preamble, no sign-off.',
    ].join('\n');
  }

  function prepFormat(item, today) {
    const e = item.event;
    const away = E.daysBetween(today, e.date);
    const when = longDate(e.date) + (away > 0 ? ' (' + away + ' days away)' : away === 0 ? ' (today)' : ' (already passed)') + (e.est ? '. The date is an estimate, so the first task is to confirm it' : '');
    const note = e.note ? '\nThe student\'s note on it: ' + e.note : '';
    const F = {
      app: [
        'This is an application-prep session for "' + e.name + '", due ' + when + '.' + note,
        'Use Markdown with these headings, in order:',
        '# Application prep: ' + e.name,
        '## What they screen for',
        "What programs like this usually look for in an applicant like this student, and what makes an application forgettable. Where details depend on this specific program, say exactly what to check on its page.",
        '## Your angle',
        "Two or three specific ways the student's background maps to what they want. Name the experience you're drawing on.",
        '## The checklist',
        'A dated checklist from today to the deadline: resume, short answers or cover letter, who to ask for a review, when to submit. Use real dates.',
        '## Questions they might ask',
        'Four likely questions (behavioral and technical for this seat), one line each on how to approach them.',
        '## Your turn',
        'Two tasks to do today, each under 30 minutes.',
      ],
      int: [
        'This is interview prep for "' + e.name + '" on ' + when + '.' + note,
        'Use Markdown with these headings, in order:',
        '# Interview prep: ' + e.name,
        '## Know the seat',
        "What this role does day to day and what interviewers for it test. Where facts depend on the specific firm, say what to look up and where (the firm's site, recent press releases, alumni on LinkedIn).",
        "## The ten questions you'll most likely get",
        'Five behavioral and five technical questions for this seat, numbered, each with a one-line approach.',
        '## Your "why this firm" skeleton',
        "A fill-in-the-blanks answer built from the student's background, with [brackets] for firm facts they still need to research.",
        '## Questions to ask them',
        'Four sharp questions, and two to avoid.',
        '## Your turn',
        'Answer two of the ten questions out loud tonight, then get them graded.',
      ],
      net: [
        'This is prep for "' + e.name + '" on ' + when + ', a networking event or info session.' + note,
        'Use Markdown with these headings, in order:',
        '# Get ready for ' + e.name,
        '## Your 30-second intro',
        "Drafted from the student's background, in first person, ready to say out loud.",
        '## Three questions worth asking',
        'Specific, non-generic questions for people at this kind of event, and why each one lands.',
        '## Working the room',
        'How to start and end a conversation, and what to write down right after.',
        '## The follow-up',
        'A short follow-up email template with [brackets] for names and details.',
        '## Your turn',
        'Two things to do before the event.',
      ],
      club: [
        'This is prep for "' + e.name + '" on ' + when + ', a student club application or interview.' + note,
        'Use Markdown with these headings, in order:',
        '# Club prep: ' + e.name,
        '## What finance clubs look for',
        "What selective student finance clubs usually screen for, and the questions they commonly ask (often \"why us\", a basic technical and a stock pitch). Don't invent details about this club; say what to ask current members.",
        '## Your angle',
        "How the student's background fits, and which experience to lead with.",
        '## A two-minute stock pitch',
        'A skeleton they can fill in tonight, using a sector they follow if they listed one.',
        '## Likely questions',
        'Five questions, one line each on how to approach them.',
        '## Your turn',
        'Two tasks for today.',
      ],
      other: [
        'This is prep for "' + e.name + '" on ' + when + '.' + note,
        'Use Markdown with these headings, in order:',
        '# Get ready: ' + e.name,
        '## What it is and why it matters',
        '## How to prepare',
        'Concrete steps, dated where it helps.',
        '## Your turn',
        'Two tasks for today.',
      ],
      day: [
        'Today is interview day: "' + e.name + '".' + note + ' Keep it short and steady. This is a warm-up, not new material.',
        'Use Markdown with these headings, in order:',
        '# Interview day: ' + e.name,
        '## Ten-minute warm-up',
        'Three quick technical questions for the seat, each followed right away by its answer, plus one mental-math rep.',
        '## Your three stories',
        "Leadership, failure and teamwork: one line each, drawn from the student's listed experiences.",
        '## Your why',
        'A two-sentence "why this seat, why this firm" skeleton with [brackets].',
        '## Checklist',
        'Logistics for in-person or video (camera, mic, link, arriving early, water), and two questions to ask.',
        '## After',
        'What to write down right after, and a short thank-you note template.',
      ],
    };
    return (F[item.sub] || F.other).join('\n') + '\n\nMake it specific to this student. Start directly with the heading. No preamble, no sign-off.';
  }

  function firmFormat(item) {
    const f = item.firm;
    return [
      'This is a firm deep-dive on ' + f + ', to help the student answer "Why ' + f + '?".',
      'Use Markdown with these headings, in order:',
      '# Why ' + f + '?',
      "## What they're known for",
      'Only well-established facts: business lines, how they make money, what kind of firm they are. Flag anything that may have changed recently and should be checked (leadership, recent deals, rankings).',
      '## Research them in 30 minutes',
      "The exact places to look (latest annual report or shareholder letter, press releases, recent deal announcements, alumni from the student's school on LinkedIn) and what to pull from each.",
      '## Your answer, drafted',
      'A 45-second "Why ' + f + '?" answer for this student, built from their background, with [brackets] where they need facts from their own research.',
      '## Questions to ask them',
      'Three questions that show they did the work.',
      '## Your turn',
      'Fill in the brackets and say the answer out loud twice.',
      '',
      'Start directly with the heading. No preamble, no sign-off.',
    ].join('\n');
  }

  /* rev: { title, weak: {topic, score, q, fixes} | null, fallback } */
  function lesson(p, plan, item, ctx, rev) {
    const today = ctx.today || E.todayISO();
    const words = WORDS[p.minutes] || 900;
    let body;
    if (item.kind === 'drill') body = drillFormat(item, words);
    else if (item.kind === 'prep') body = prepFormat(item, today);
    else if (item.kind === 'firm') body = firmFormat(item);
    else {
      let extra = '';
      let title = item.title;
      if (item.kind === 'rev' && rev) {
        title = rev.title;
        extra = rev.weak
          ? 'This is a Rewind session. The student recently scored ' + rev.weak.score + '/5 on: "' + rev.weak.q + '".' + (rev.weak.fixes && rev.weak.fixes.length ? ' The main fixes noted were: ' + rev.weak.fixes.join('; ') + '.' : '') + ' Re-teach the idea from a different angle than a textbook would, and aim the Cold open and "Say it out loud" at exactly that gap.'
          : 'This is a Rewind session on an earlier topic. Re-teach it from a fresh angle and drill it.';
      }
      body = standardFormat(title, words, E.teaserLevel(plan, item), extra);
    }
    return RULES + '\n\n' + profileBlock(p, Object.assign({}, ctx, { plan, item })) + '\n\n' + body;
  }

  /* ---------------- grading ---------------- */
  const RUBRIC = 'Rubric: 5 = clearly passes a first round: correct, structured, concise. 4 = correct with small gaps or a bit long. 3 = partly right, or right but disorganized. 2 = major errors or missing the core idea. 1 = wrong, off-topic or blank.';

  function grade(p, ctx, q, a, context) {
    return [
      RULES, '', profileBlock(p, ctx), '',
      "Grade one interview answer the way a first-round interviewer for the student's target seats would, then coach. The answer may be dictated, so ignore filler words and typos.",
      '',
      'Context: ' + (context || 'practice drill') + '.',
      'Question: """' + q + '"""',
      'Answer: """' + a + '"""',
      '',
      RUBRIC,
      '',
      'Reply with only a JSON object in this shape:',
      '{"score": 1-5, "verdict": "one sentence", "strengths": ["up to two short points"], "fixes": ["up to three specific fixes, most important first"], "better": "a model answer they could say in about 60 seconds", "followUp": "the follow-up question an interviewer would ask next", "topic": "2-5 word topic tag"}',
    ].join('\n');
  }

  function mockGrade(p, ctx, qs, answers, fus) {
    const seat = E.SEATS[p.primary];
    fus = fus || [];
    return [
      RULES, '', profileBlock(p, ctx), '',
      'Grade this ' + qs.length + '-question mock interview for a ' + seat.role + ' role the way a first-round interviewer would, then coach. Answers may be dictated, so ignore filler words and typos. A blank answer scores 1. Where the interviewer asked a follow-up, score the question and its follow-up together.',
      '',
      qs.map((q, i) => 'Q' + (i + 1) + ' [' + E.CATS[q.cat].name + ']: ' + q.text + '\nAnswer: """' + ((answers[i] || '').trim() || '(no answer)') + '"""' +
        (fus[i] && fus[i].q ? '\nFollow-up: ' + fus[i].q + '\nAnswer: """' + ((fus[i].a || '').trim() || '(no answer)') + '"""' : '')).join('\n\n'),
      '',
      RUBRIC,
      '',
      'Reply with only a JSON object in this shape:',
      '{"overall": 1-5, "advance": true or false, "headline": "one sentence on how the interview went", "items": [{"score": 1-5, "feedback": "two sentences: what worked and the biggest fix", "better": "a model answer in about 60 spoken seconds", "topic": "2-5 word topic tag"}], "next": ["three specific things to work on this week"]}',
      'The items array must have exactly ' + qs.length + ' entries, in question order. "advance" means you would pass them to the next round.',
    ].join('\n');
  }

  /* ---------------- timeline suggestions ---------------- */
  function timeline(p, today) {
    const seats = p.seats.map(s => E.SEATS[s].label).join(', ');
    return [
      RULES, '',
      'Today is ' + longDate(today) + '. ' + (p.name || 'The student') + ' is a ' + p.year.toLowerCase() + ' at ' + (p.school || 'a U.S. university') + ', targeting ' + seats + (p.firmList.length ? ' (firms on their list: ' + p.firmList.join(', ') + ')' : '') + '.' + (p.goalList && p.goalList.length ? ' Their goals: ' + p.goalList.join('; ') + '.' : ''),
      '',
      'Suggest the key recruiting dates they should plan around over roughly the next 18 months, plus an "interview-ready by" date that leaves a cushion before the first interviews that matter. Base it on how recent recruiting cycles for these seats have run; they have been moving earlier, especially in investment banking. Don\'t invent school-specific details: for on-campus items, name the kind of event and its typical timing. Every date is an estimate, so say how confident you are in each note.',
      '',
      'Reply with only a JSON object in this shape:',
      '{"readyBy": "YYYY-MM-DD", "why": "one or two sentences", "events": [{"name": "short name", "date": "YYYY-MM-DD", "type": "application" | "interview" | "networking" | "club" | "other", "note": "one line: what it is and how sure you are"}]}',
      'Give 4 to 8 events, sorted by date, all after ' + today + '.',
    ].join('\n');
  }

  /* ---------------- chat ---------------- */
  const TOOL_RULES = [
    'You can read and change their plan with tools:',
    '- When they tell you about a deadline, interview, club application, info session or other event that has a date, add it with add_key_date. The plan then schedules prep sessions before it.',
    '- When a date moves or gets cancelled, use change_key_date. Use set_interview_ready_date and update_goals_and_firms only when they ask for that change or clearly state it.',
    '- Never invent or guess a date. Work out relative dates ("next Thursday") from today\'s date above. If they give no date, ask for it instead of adding anything.',
    '- After a change, say in one line what you changed and what the plan now has before it, using the tool result.',
    '- For questions about their schedule or progress, call get_schedule or get_scores instead of guessing.',
  ].join('\n');

  function chatPreamble(p, ctx, tools) {
    const plan = ctx.plan;
    let planLine = '';
    if (plan && !plan.error) {
      const today = ctx.today || E.todayISO();
      const it = E.itemOn(plan, today) || E.nextItem(plan, today);
      const next = plan.items.filter(x => x.date > today).slice(0, 3);
      planLine = '\nTheir plan: ' + (it ? (it.date === today ? "today's session is " : 'the next session is ') + '"' + it.title + '"' + (it.date !== today ? ' on ' + E.fmt(it.date) : '') + '. ' : '') + (next.length ? 'After that: ' + next.map(x => x.title).join('; ') + '.' : '');
      if (plan.events.length) planLine += '\nTheir key dates: ' + plan.events.map(e => e.name + ' (' + E.EVENT_TYPES[e.type].toLowerCase() + ', ' + e.date + (e.est ? ', estimate' : '') + ')').join('; ') + '.';
    }
    return [
      RULES, '', profileBlock(p, ctx) + planLine, '',
      "You're answering the student's questions in a chat. Keep answers tight: short paragraphs or a short list, usually under 200 words unless they ask for more. When something depends on a specific firm's or school's current dates or policies, say what's typical and tell them to confirm. Use Markdown sparingly.",
      tools ? '\n' + TOOL_RULES : "\nYou can't change their plan from this chat. If they mention a new date or goal, tell them to add it on the Setup tab.",
    ].join('\n');
  }

  /* ---------------- export for a Claude Project or any chat ---------------- */
  function projectInstructions(p, plan) {
    const words = WORDS[p.minutes] || 900;
    return [
      'You are my finance recruiting coach.',
      '',
      RULES.split('\n').slice(2).join('\n'),
      '',
      'About me:',
      profileBlock(p, {}, { static: true }),
      '',
      'My plan is in the attached file "recruiting-plan.md": every study day from ' + E.fmt(plan.start, { month: 'long', day: 'numeric', year: 'numeric' }) + ' to ' + E.fmt(plan.end, { month: 'long', day: 'numeric', year: 'numeric' }) + ', with my key dates. How to run it:',
      '- When I say "today\'s lesson", find today\'s date in the plan and teach that session. For a regular lesson use these sections: Cold open (an interview question), The big idea, How it works (with a worked example), In the real world, The interview trap (with a 60-second model answer), Your line, Your turn (say it out loud, three rapid-fire questions, a rewind on a weak spot, a brain teaser), and Answers. About ' + words + ' words.',
      '- On drill days, skip new theory: a warm-up, six interview questions easiest to hardest, a stretch question, then answers.',
      '- On mock interview days, run a five-question mock one question at a time with no feedback until the end, then score each answer 1 to 5 with fixes and a model answer.',
      '- Whenever I answer a question, grade it 1 to 5 (5 = would clearly pass a first round), tell me what worked, the top fixes and a better answer, then ask the follow-up an interviewer would ask.',
      '- Keep a running list of my weak spots from those grades and work them into later lessons.',
    ].join('\n');
  }

  /* ---------------- live follow-ups during an in-page mock (quick tier) ---------------- */
  function followUp(p, q, a) {
    return [
      'You are interviewing a ' + p.year.toLowerCase() + ' for a ' + E.SEATS[p.primary].role + ' role. You asked: "' + q + '"',
      'They answered: """' + String(a || '').trim() + '"""',
      'Ask ONE natural follow-up that reacts to what they actually said: probe a vague claim, a gap, a number or their reasoning, the way a real first-round interviewer would. One sentence, no feedback, no hints. If the answer is blank or off-topic, ask the original question a different way.',
      'Reply with only JSON: {"followUp": "your question"}',
    ].join('\n');
  }

  /* ---------------- hand-off prompts: opened in the visitor's own Claude chat ----------------
     Short enough to travel in a link. A chat may be able to search the web, so these ask for
     current examples with sources instead of ruling them out. */
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const HANDOFF_RULES = "Be accurate: never invent figures, deals, quotes or details about my school. If you can search the web, use it for anything current and cite sources; if you can't, tell me what to look up.";
  const GRADE_RULES = 'When I answer, score it 1-5 (5 = would clearly pass a first round, 3 = partly right or disorganized, 1 = wrong or blank), say what worked, give the top fixes and a stronger 60-second version, then ask the follow-up a real interviewer would ask.';

  function aboutMe(p, ctx) {
    const seats = p.seats.map(s => E.SEATS[s].label.toLowerCase()).join(', ');
    const L = ['About me: ' + (p.name ? p.name + ', ' : '') + 'a ' + p.year.toLowerCase() + ' at ' + (p.school || 'a U.S. university') + (p.major ? ' studying ' + p.major : '') + ', aiming for ' + seats + (p.seats.length > 1 ? ' (mainly ' + E.SEATS[p.primary].label.toLowerCase() + ')' : '') + '.'];
    if (p.goalList && p.goalList.length) L.push('Goals: ' + clip(p.goalList.join('; '), 220) + '.');
    if (p.firmList && p.firmList.length) L.push('Firms on my list: ' + p.firmList.join(', ') + '.');
    L.push('Level: accounting ' + LV[p.levels.acc] + ', valuation ' + LV[p.levels.val] + ', markets ' + LV[p.levels.mkt] + '.');
    if (p.experiences) L.push('Experiences: ' + clip(E.splitLines(p.experiences).join('; '), 240) + '.');
    if (p.interests) L.push('I follow: ' + clip(p.interests, 100) + '.');
    if (ctx && ctx.weak && ctx.weak.length) L.push('Weak spots: ' + ctx.weak.slice(0, 3).map(w => w.topic).join('; ') + '.');
    return L.join(' ');
  }

  function handoffLesson(p, plan, item, ctx, rev) {
    const today = (ctx && ctx.today) || E.todayISO();
    const words = WORDS[p.minutes] || 900;
    if (item.kind === 'drill') {
      return ['Run a finance interview drill with me: "' + item.title + '" (' + (item.focus || 'interview reps') + '). No new theory.', aboutMe(p, ctx),
        'Ask me six questions one at a time, easiest to hardest, then one stretch question. After each answer, grade it and move on.', GRADE_RULES, HANDOFF_RULES].join('\n\n');
    }
    if (item.kind === 'prep') return [aboutMe(p, ctx), prepFormat(item, today).replace(/\n\nMake it specific to this student\..*$/s, ''), 'Make it specific to me.', HANDOFF_RULES].join('\n\n');
    if (item.kind === 'firm') return [aboutMe(p, ctx), firmFormat(item).replace(/\n\nStart directly with the heading\..*$/s, ''), HANDOFF_RULES].join('\n\n');
    const title = item.kind === 'rev' && rev ? rev.title : item.title;
    const weakNote = item.kind === 'rev' && rev && rev.weak ? ' I recently scored ' + rev.weak.score + '/5 on: "' + clip(rev.weak.q, 160) + '". Re-teach it from a new angle and aim the quiz at that gap.' : '';
    return [
      'Be my finance recruiting coach. Teach me today\'s lesson: "' + title + '".' + weakNote,
      aboutMe(p, ctx),
      'In about ' + words + ' words, in this order: an interview question for me to answer out loud before reading on; the big idea in plain English with one analogy; how it works, with a small worked example; a real example (this week\'s news if you can search, with sources, or a well-documented case); the trap most candidates fall into, with a 60-second model answer. Then quiz me: one question to answer out loud, three rapid-fire questions, one review question on an earlier topic and a ' + E.teaserLevel(plan, item) + ' brain teaser. Put the answers at the very end.',
      GRADE_RULES, HANDOFF_RULES,
    ].join('\n\n');
  }

  function handoffPersonalize(p, item, ctx) {
    return [
      'I\'m studying "' + item.title + '" for finance recruiting and I\'ve read a standard lesson on it. Make it mine: connect it to my background and target seats in a few short paragraphs, then quiz me one question at a time, starting with one I should answer out loud and going a level deeper each time.',
      aboutMe(p, ctx), GRADE_RULES, HANDOFF_RULES,
    ].join('\n\n');
  }

  function handoffGrade(p, q, a, context) {
    return [
      'Grade my answer to a finance interview question the way a first-round interviewer for ' + E.SEATS[p.primary].phrase + ' would. It may be dictated, so ignore filler and typos.' + (context ? ' (' + context + ')' : ''),
      'Question: ' + q,
      'My answer: ' + a,
      'Score it 1-5 (5 = would clearly pass a first round, 3 = partly right or disorganized, 1 = wrong or blank). Say what worked, give the top three fixes, most important first, and a stronger version I could say in about 60 seconds. Then ask me the follow-up you\'d ask next and grade my reply the same way.',
      'I\'m a ' + p.year.toLowerCase() + ' at ' + (p.school || 'a U.S. university') + '. ' + HANDOFF_RULES,
    ].join('\n\n');
  }

  function handoffMock(p, ctx, qs) {
    const firm = p.firmList && p.firmList.length ? p.firmList[0] : '';
    return [
      'Run a live first-round mock interview with me for a ' + E.SEATS[p.primary].role + ' role' + (firm ? ' at ' + firm : '') + '.',
      aboutMe(p, ctx),
      'Ask these questions one at a time, in order:\n' + qs.map((q, i) => (i + 1) + '. ' + q.text).join('\n'),
      'After each answer, ask at most one natural follow-up that reacts to what I actually said, then move on. Stay in character: no hints and no scores until the end. Then debrief: score each answer 1-5 with a one-line reason (5 = interview-ready, 3 = right idea but missing a key piece or rambling, 1 = wrong or blank), my best answer, my weakest answer rewritten tighter in my own voice, an honest verdict on whether I\'d advance, and one thing to fix this week.',
      'Start with question 1 now.',
    ].join('\n\n');
  }

  function handoffAsk(p, ctx, text) {
    const plan = ctx && ctx.plan;
    let planLine = '';
    if (plan && !plan.error) {
      const today = ctx.today || E.todayISO();
      const it = E.itemOn(plan, today) || E.nextItem(plan, today);
      planLine = 'My plan: interview-ready by ' + E.fmt(plan.ready, { month: 'long', day: 'numeric', year: 'numeric' }) + (it ? '; ' + (it.date === today ? 'today\'s session is "' : 'next up is "') + it.title + '"' : '') + '.' +
        (plan.events.length ? ' Key dates: ' + plan.events.filter(e => e.date >= today).slice(0, 5).map(e => e.name + ' (' + e.date + ')').join('; ') + '.' : '');
    }
    return [
      'You\'re my finance recruiting coach. ' + aboutMe(p, ctx) + (planLine ? ' ' + planLine : ''),
      'Keep answers tight: short paragraphs or a short list. ' + HANDOFF_RULES,
      'My question: ' + (String(text || '').trim() || 'What should I focus on this week?'),
    ].join('\n\n');
  }

  function handoffDates(p, today) {
    return [
      'Today is ' + longDate(today) + '. ' + aboutMe(p),
      'Suggest the recruiting dates I should plan around over the next 18 months for my target seats: club applications, early insight and sophomore programs, internship application windows and on-campus recruiting. Search the web for this cycle\'s actual dates if you can and cite sources; otherwise give typical timing and say how confident you are. Then suggest an "interview-ready by" date with a cushion before the first interviews that matter.',
      'Format: a short dated list, one line each on what it is. Don\'t invent details about my school; tell me what to ask the career center instead.',
    ].join('\n\n');
  }

  return {
    RULES, WORDS, profileBlock, lesson, grade, mockGrade, timeline, chatPreamble, projectInstructions,
    followUp, handoffLesson, handoffPersonalize, handoffGrade, handoffMock, handoffAsk, handoffDates,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Prompts;
