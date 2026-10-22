/* ==========================================================================
   Finance Recruiting Coach: topic bank + plan engine
   Pure functions, no DOM. Builds a day-by-day plan from a student's profile.
   ========================================================================== */
const Engine = (() => {
  'use strict';

  /* ---------- dates (local, noon-anchored so DST never shifts a day) ---------- */
  function parseISO(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12);
    return dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }
  function iso(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  function addDays(dt, n) {
    const x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n, 12);
    return x;
  }
  function daysBetween(a, b) { // ISO strings, b - a in days
    const A = parseISO(a), B = parseISO(b);
    if (!A || !B) return NaN;
    return Math.round((B - A) / 86400000);
  }
  function todayISO() { return iso(new Date()); }
  function fmt(isoStr, opts) {
    const d = parseISO(isoStr);
    if (!d) return '';
    return d.toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function slug(s) {
    return String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }

  /* ---------- vocabulary ---------- */
  const CATS = {
    acc: { name: 'Accounting', code: 'ACC' },
    val: { name: 'Valuation & Deals', code: 'VAL' },
    mkt: { name: 'Markets & Economy', code: 'MKT' },
    awm: { name: 'Asset & Wealth Mgmt', code: 'AWM' },
    car: { name: 'Careers & Behaviorals', code: 'CAR' },
    inv: { name: 'Investing & Pitches', code: 'INV' },
    sto: { name: 'Case Study', code: 'CASE' },
    trd: { name: 'Trading & Derivatives', code: 'TRD' },
    rev: { name: 'Rewind', code: 'REW' },
    mock: { name: 'Mock Interview', code: 'MOCK' },
    prep: { name: 'Prep Session', code: 'PREP' },
    firm: { name: 'Firm Deep-Dive', code: 'FIRM' },
    fit: { name: 'Fit', code: 'FIT' },
    beh: { name: 'Behavioral', code: 'BEH' },
    teaser: { name: 'Brain Teaser', code: 'BT' },
  };
  const LESSON_CATS = ['acc', 'val', 'mkt', 'awm', 'car', 'inv', 'sto', 'trd'];

  const SEATS = {
    ib: { label: 'Investment banking', phrase: 'investment banking', role: 'investment banking analyst' },
    st: { label: 'Sales & trading', phrase: 'sales and trading', role: 'sales and trading analyst' },
    am: { label: 'Asset management', phrase: 'asset management', role: 'asset management analyst' },
    wm: { label: 'Wealth management', phrase: 'wealth management', role: 'wealth management associate' },
    pe: { label: 'Private equity', phrase: 'private equity', role: 'private equity analyst' },
    hf: { label: 'Hedge funds', phrase: 'hedge funds', role: 'hedge fund analyst' },
    er: { label: 'Equity research', phrase: 'equity research', role: 'equity research associate' },
    cf: { label: 'Corporate finance', phrase: 'corporate finance', role: 'corporate finance analyst' },
    cb: { label: 'Commercial banking & credit', phrase: 'commercial banking', role: 'credit analyst' },
    vc: { label: 'Venture capital', phrase: 'venture capital', role: 'venture capital analyst' },
    unsure: { label: 'Not sure yet', phrase: 'finance', role: 'finance analyst' },
  };

  const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', "Master's / MBA", 'Recent grad'];

  const EVENT_TYPES = {
    application: 'Application deadline',
    interview: 'Interview',
    networking: 'Networking or info session',
    club: 'Club application or interview',
    other: 'Other',
  };

  /* Share of lesson days by category for each seat. Order: acc val mkt awm car inv sto trd */
  const SEAT_WEIGHTS = {
    ib:     [.24, .30, .11, .02, .18, .04, .08, .03],
    st:     [.08, .08, .30, .03, .17, .06, .08, .20],
    am:     [.14, .17, .19, .14, .13, .15, .07, .01],
    wm:     [.08, .07, .18, .32, .16, .09, .08, .02],
    pe:     [.25, .33, .07, .03, .15, .08, .08, .01],
    hf:     [.15, .17, .20, .05, .10, .20, .07, .06],
    er:     [.25, .24, .10, .02, .14, .17, .07, .01],
    cf:     [.32, .20, .10, .02, .20, .06, .09, .01],
    cb:     [.30, .14, .16, .05, .20, .04, .10, .01],
    vc:     [.10, .20, .14, .03, .22, .20, .10, .01],
    unsure: [.18, .18, .17, .10, .19, .07, .07, .04],
  };

  /* ---------- topic bank: [cat, level, title, seats ('' = everyone), year ('' | 'early')] ---------- */
  const RAW_TOPICS = [
    // Accounting
    ['acc', 1, 'The three financial statements: what each one tells you', ''],
    ['acc', 1, 'The income statement, line by line', ''],
    ['acc', 1, 'The balance sheet: why assets always equal liabilities plus equity', ''],
    ['acc', 1, "The cash flow statement: why profit isn't the same as cash", ''],
    ['acc', 1, 'How the three statements link together', ''],
    ['acc', 1, 'PP&E, capex and depreciation', ''],
    ['acc', 2, 'Working capital: why fast-growing companies can run out of cash', ''],
    ['acc', 2, 'The classic: "Depreciation goes up by $10. Walk me through the three statements."', ''],
    ['acc', 2, "EBITDA: why bankers love it and why Buffett and Munger didn't", ''],
    ['acc', 2, 'Free cash flow: unlevered vs. levered, and why investors care most about it', ''],
    ['acc', 2, 'Deferred revenue and prepaid expenses', ''],
    ['acc', 2, 'Debt on the statements: borrowing, interest and repayment', ''],
    ['acc', 2, 'Inventory: FIFO vs. LIFO', ''],
    ['acc', 2, "Stock-based compensation: the \"non-cash\" expense that's very real", ''],
    ['acc', 2, 'Goodwill, intangibles and impairments', ''],
    ['acc', 2, 'GAAP vs. non-GAAP: "adjusted" earnings and one-time items', ''],
    ['acc', 2, 'Basic vs. diluted shares, the treasury stock method, and EPS', ''],
    ['acc', 2, 'Return ratios: margins, ROE, ROA and ROIC', ''],
    ['acc', 2, 'Leverage and liquidity ratios: debt/EBITDA, interest coverage, current ratio', ''],
    ['acc', 2, 'Earnings season: reading an earnings release, and what "beat and raise" means', ''],
    ['acc', 2, 'How to read a 10-K in 30 minutes', ''],
    ['acc', 2, 'Dividends and buybacks on the financial statements', ''],
    ['acc', 3, 'Tricky three-statement scenarios: write-downs, PP&E bought with debt, issuing stock', ''],
    ['acc', 3, 'Deferred taxes and NOLs', ''],
    ['acc', 3, 'Leases: operating vs. finance, and what they do to EBITDA', ''],
    ['acc', 3, 'Credit analysis: can this company pay its debts?', 'cb ib pe hf am cf'],
    ['acc', 3, 'Earnings models: building a simple quarterly forecast', 'er hf am'],

    // Valuation & deals
    ['val', 1, 'Time value of money: why $100 today beats $100 next year', ''],
    ['val', 1, 'Present value, discount rates, NPV and IRR: the engine behind every valuation', ''],
    ['val', 1, 'Equity value vs. enterprise value (the house-and-mortgage analogy)', ''],
    ['val', 2, 'The EV bridge: why you add debt and subtract cash (and the trick questions)', ''],
    ['val', 2, 'Valuation multiples: P/E, EV/EBITDA, EV/Revenue, and which ones go together', ''],
    ['val', 2, 'Comparable companies analysis ("comps")', ''],
    ['val', 2, 'DCF, part 1: the big idea and projecting free cash flow', ''],
    ['val', 2, 'DCF, part 2: the discount rate (WACC, CAPM and beta)', ''],
    ['val', 2, "DCF, part 3: terminal value, and why it's most of the answer", ''],
    ['val', 2, '"Walk me through a DCF": the 60-second answer and the follow-ups', ''],
    ['val', 2, 'Precedent transactions and control premiums', ''],
    ['val', 2, 'The football field: which valuation method gives the highest value, and why', ''],
    ['val', 2, 'Capital structure: why companies borrow, and when it backfires', ''],
    ['val', 2, 'Dividends vs. buybacks: how companies hand cash back', ''],
    ['val', 2, 'M&A 101: why companies buy other companies', ''],
    ['val', 2, 'Merger models and accretion/dilution: will the deal raise or lower EPS?', 'ib pe er hf cf'],
    ['val', 2, 'LBOs: how private equity buys companies with borrowed money (IRR and MOIC)', ''],
    ['val', 2, 'IPOs: how a company goes public, and why stocks "pop"', ''],
    ['val', 2, 'Valuing high-growth, unprofitable companies', ''],
    ['val', 2, 'Intrinsic value, margin of safety, and value investing', ''],
    ['val', 3, 'The paper LBO: doing one in your head', 'pe ib hf'],
    ['val', 3, 'Sum-of-the-parts valuation', ''],
    ['val', 3, 'Valuing banks: why EV/EBITDA breaks, and what to use instead', 'ib cb er hf am'],
    ['val', 3, 'REITs and FFO: valuing real estate companies', ''],
    ['val', 3, 'NAV models: valuing miners and energy producers', 'ib er hf am'],
    ['val', 3, "Restructuring: what happens when a company can't pay", 'ib pe hf cb'],
    ['val', 3, 'Spin-offs and activist investors', 'ib hf am er'],
    ['val', 3, 'Venture math: valuations, dilution and the power law', 'vc pe'],
    ['val', 3, 'PE fund mechanics: committed capital, carry and the J-curve', 'pe am wm vc hf'],

    // Markets & economy
    ['mkt', 1, 'What a stock actually is, and how the stock market works', ''],
    ['mkt', 1, 'Bonds 101: coupons, maturities, and why prices and yields move in opposite directions', ''],
    ['mkt', 1, 'Inflation: CPI vs. PCE, and why the Fed targets 2%', ''],
    ['mkt', 1, 'Market indices: how the S&P 500, Dow and Nasdaq are built (and why the Dow is weird)', ''],
    ['mkt', 1, 'The Federal Reserve: the fed funds rate, the FOMC and the dual mandate', ''],
    ['mkt', 2, 'Why interest rates move stock prices', ''],
    ['mkt', 2, 'The 10-year Treasury yield: the most important number in finance', ''],
    ['mkt', 2, 'The yield curve, and what an inversion is supposed to signal', ''],
    ['mkt', 2, 'GDP, recessions and the business cycle', ''],
    ['mkt', 2, 'The jobs report: why markets obsess over payrolls and unemployment', ''],
    ['mkt', 2, 'Credit markets: ratings, investment grade vs. high yield, and spreads', ''],
    ['mkt', 2, "The Fed's toolkit beyond rates: QE, QT and the dot plot", ''],
    ['mkt', 2, 'Commodities: oil, gold, and what moves them', ''],
    ['mkt', 2, 'Sectors: cyclical vs. defensive stocks, and sector rotation', ''],
    ['mkt', 2, 'Volatility and the VIX', ''],
    ['mkt', 2, 'Duration: how much a bond moves when rates move', ''],
    ['mkt', 2, 'The dollar and currencies: why a strong dollar hurts U.S. multinationals', ''],
    ['mkt', 2, 'Market plumbing: bid-ask spreads, liquidity and order types', ''],
    ['mkt', 2, 'Fiscal vs. monetary policy: deficits, the national debt and Treasury supply', ''],
    ['mkt', 2, 'How banks make money: deposits, loans and net interest margin', ''],
    ['mkt', 2, "Private credit: one of Wall Street's fastest-growing markets", ''],
    ['mkt', 2, 'Fintech: how payments work, stablecoins and tokenization', ''],
    ['mkt', 2, 'Crypto and bitcoin ETFs: what professionals tell clients', ''],
    ['mkt', 2, 'Trade and global markets: tariffs, and why China, Europe and Japan move U.S. stocks', ''],
    ['mkt', 3, 'TIPS and real yields', ''],
    ['mkt', 3, 'Factor investing: value, momentum, quality and size', 'am hf wm er'],

    // Asset & wealth management
    ['awm', 1, 'Asset management vs. wealth management: what each does, and how each makes money', ''],
    ['awm', 1, 'Asset classes: stocks, bonds, cash, real estate and alternatives', ''],
    ['awm', 1, 'Risk: volatility, drawdowns, and what "risk tolerance" really means', ''],
    ['awm', 1, 'The wealth management landscape: wirehouses, RIAs, private banks, and how each gets paid', 'wm am'],
    ['awm', 1, 'Fiduciary vs. suitability: who has to put the client first', 'wm am'],
    ['awm', 2, 'Diversification and correlation: the only free lunch in investing', ''],
    ['awm', 2, 'Modern portfolio theory and the efficient frontier', ''],
    ['awm', 2, 'Asset allocation: the 60/40 portfolio, strategic vs. tactical, and glide paths', ''],
    ['awm', 2, 'Active vs. passive: the index fund revolution, and why most pros trail the index', ''],
    ['awm', 2, 'ETFs vs. mutual funds: costs, taxes and structure', ''],
    ['awm', 2, 'Measuring performance: benchmarks, alpha, beta and the Sharpe ratio', ''],
    ['awm', 2, 'Licenses and credentials: SIE, Series 7 and 66, CFP and CFA', 'wm am st'],
    ['awm', 2, 'Why big banks love wealth management', 'wm am ib'],
    ['awm', 2, 'Retirement accounts: 401(k), IRA, Roth vs. traditional', 'wm'],
    ['awm', 2, '529s, HSAs, taxable accounts and asset location', 'wm'],
    ['awm', 2, 'Capital gains taxes and tax-loss harvesting', 'wm am'],
    ['awm', 2, 'The investment policy statement and the know-your-client process', 'wm am'],
    ['awm', 2, 'Retirement income: the 4% rule and sequence-of-returns risk', 'wm'],
    ['awm', 2, 'Estate planning basics: wills, trusts, gifting and the step-up in basis', 'wm'],
    ['awm', 2, 'Fixed income for clients: Treasuries, munis, CDs and bond ladders', 'wm am'],
    ['awm', 2, 'Alternatives for wealthy clients: private equity, hedge funds, private credit and real estate', 'wm am pe hf'],
    ['awm', 2, 'Behavioral finance: loss aversion, recency bias, and the advisor as behavior coach', 'wm am hf'],
    ['awm', 2, 'Rebalancing: the discipline of trimming winners', 'wm am'],
    ['awm', 2, 'Concentrated stock and equity compensation: RSUs, options and the one-stock problem', 'wm'],
    ['awm', 3, 'Hedge fund strategies: long/short, global macro, event-driven and quant', 'hf am wm st'],
    ['awm', 3, 'Direct indexing and tax-aware investing', 'wm am'],
    ['awm', 3, 'Insurance and annuities: where they fit in a plan', 'wm'],
    ['awm', 3, 'Capstone: building a client portfolio from scratch', 'wm am'],

    // Trading & derivatives
    ['trd', 1, 'What sales & trading desks actually do: flow, market-making and risk', ''],
    ['trd', 1, 'Options 101: calls and puts in plain English', ''],
    ['trd', 2, 'Futures and forwards: locking in a price', 'st hf am'],
    ['trd', 2, "What drives an option's price", 'st hf am'],
    ['trd', 2, 'The Greeks: delta, gamma, theta and vega', 'st hf'],
    ['trd', 2, 'Short selling and how a short squeeze happens', ''],
    ['trd', 2, 'Interest rate swaps: trading fixed for floating', 'st hf cb'],
    ['trd', 2, 'FX markets: spot, forwards and the carry trade', 'st hf'],
    ['trd', 2, 'How to pitch a trade: thesis, catalyst, entry and stop', 'st hf'],
    ['trd', 3, 'Convertibles and preferred stock', ''],
    ['trd', 3, 'Volatility trading: implied vs. realized', 'st hf'],
    ['trd', 3, 'Credit default swaps and how credit trades', 'st hf cb'],
    ['trd', 3, 'Market-making math: expected value, edge and position sizing', 'st hf'],

    // Investing & pitches
    ['inv', 1, 'How to pitch a stock: thesis, catalysts, valuation, risks', ''],
    ['inv', 1, '"If I gave you $1 million, how would you invest it?"', ''],
    ['inv', 2, 'Moats: what makes a great business hard to compete with', ''],
    ['inv', 2, 'Pitch practice: build a stock pitch on a company you follow', ''],
    ['inv', 2, 'Sector deep-dive: how companies in a sector you follow get valued', ''],
    ['inv', 2, 'Bull vs. bear: arguing the other side of your own pitch', ''],
    ['inv', 2, 'Reading an investor presentation like an analyst', ''],
    ['inv', 3, 'Pitch workshop: tightening your pitch to two minutes', ''],
    ['inv', 3, 'A second pitch, outside your comfort sector', ''],
    ['inv', 3, 'The short pitch: arguing a stock goes down', 'hf am er st'],

    // Case studies
    ['sto', 1, 'Warren Buffett and Berkshire Hathaway: compounding in real life', ''],
    ['sto', 1, 'Silicon Valley Bank (2023): how rising rates broke a bank', ''],
    ['sto', 1, 'The 2008 financial crisis in plain English', ''],
    ['sto', 1, 'Enron: how accounting fraud works, and the red flags', ''],
    ['sto', 2, 'The dot-com bubble', ''],
    ['sto', 2, 'Paul Volcker and the war on 1970s inflation', ''],
    ['sto', 2, 'Archegos (2021): how a family office blew up', ''],
    ['sto', 2, 'GameStop (2021): retail traders and the short squeeze', ''],
    ['sto', 2, 'Bernie Madoff: how a Ponzi scheme works, and why custody matters', ''],
    ['sto', 2, "The Fed's 2022–23 hiking cycle: what happened to stocks and bonds", ''],
    ['sto', 2, 'Long-Term Capital Management (1998): leverage and the limits of models', ''],
    ['sto', 2, 'Jack Bogle and the first index fund', ''],
    ['sto', 2, 'RJR Nabisco (1988): the buyout that defined an era', 'pe ib hf'],
    ['sto', 2, "Black Monday (1987): the market's worst day", ''],
    ['sto', 2, 'March 2020: the COVID crash and the fastest recovery', ''],
    ['sto', 2, "Lehman Brothers' last weekend", ''],

    // Careers & behaviorals
    ['car', 1, 'The map of finance: sell side vs. buy side, and where every seat fits', ''],
    ['car', 1, '"Tell me about yourself": turning your resume into a 60-second story', ''],
    ['car', 1, 'Your "why finance" story: an answer only you could give', ''],
    ['car', 1, '"What\'s going on in the markets?": a daily habit and a 60-second answer', ''],
    ['car', 1, 'How finance recruiting works: clubs, timelines, early programs and superdays', ''],
    ['car', 1, 'Investment banking: what bankers do, and bulge brackets vs. elite boutiques vs. middle market', ''],
    ['car', 1, 'Sales & trading and equity research: what they do and how they differ from banking', ''],
    ['car', 1, 'The buy side: asset management, hedge funds, private equity and venture capital', ''],
    ['car', 2, 'Networking: cold emails, coffee chats, and the network you already have', ''],
    ['car', 2, 'Telling stories that prove it: the STAR method and your story bank', ''],
    ['car', 2, 'Brain teasers, mental math and market sizing: how to think out loud', ''],
    ['car', 2, 'Beyond Wall Street: commercial banking, corporate finance and regional hubs', ''],
    ['car', 2, 'Excel and financial modeling: what to learn, and in what order', ''],
    ['car', 2, 'Behaviorals, part 1: strengths, weaknesses and "tell me about a failure"', ''],
    ['car', 2, 'How to talk about a recent deal in an interview', ''],
    ['car', 2, 'Early opportunities: insight programs, sophomore internships and your game plan', '', 'early'],
    ['car', 2, 'Your resume, rebuilt for finance: bullets that show impact', ''],
    ['car', 2, 'The most common technical-interview mistakes', ''],
    ['car', 2, 'Behaviorals, part 2: leadership, teamwork and conflict questions', ''],
    ['car', 2, '"Why this firm?" and "Why this seat?": researching a firm in 30 minutes', ''],
    ['car', 2, 'Questions to ask your interviewer (and ones to avoid)', ''],
    ['car', 3, 'Video interviews and HireVue: sounding sharp, not scripted', ''],
    ['car', 3, 'Superdays: what to expect, and how to finish strong', ''],
    ['car', 3, 'Thank-you notes, follow-ups and handling offers', ''],
    ['car', 3, "The 20 questions you're most likely to get", ''],
    ['car', 3, 'Capstone: the whole map, revisited', ''],
  ];

  function mkTopic(r) {
    return { id: r[0] + '-' + slug(r[2]), cat: r[0], level: r[1], title: r[2], for: r[3] ? r[3].split(/\s+/) : [], yr: r[4] || '' };
  }
  const TOPICS = RAW_TOPICS.map(mkTopic);
  const REFRESHERS = {
    acc: mkTopic(['acc', 1, 'Accounting refresher: the three statements and how they link, in one lesson', '']),
    val: mkTopic(['val', 1, 'Valuation refresher: time value, EV vs. equity value, and the main valuation methods', '']),
    mkt: mkTopic(['mkt', 1, 'Markets refresher: stocks, bonds, rates and the Fed in one lesson', '']),
  };

  const DRILLS = {
    acc: { title: 'Accounting drills', focus: 'three-statement walk-throughs, ratios and accounting trick questions' },
    val: { title: 'Valuation drills', focus: 'EV and equity value, multiples, DCF and deal math' },
    mkt: { title: 'Markets workout', focus: 'building a 60-second markets answer and handling the follow-ups' },
    awm: { title: 'Client scenarios', focus: 'advising realistic clients on allocation, risk, taxes and behavior', seats: ['wm', 'am', 'unsure'] },
    car: { title: 'Behavioral reps', focus: 'tightening behavioral stories with the STAR method' },
    inv: { title: 'Pitch workshop', focus: 'sharpening a stock pitch and defending it under pushback' },
    sto: { title: 'Market history lightning round', focus: 'quick questions on famous market events and what they teach' },
    trd: { title: 'Trading drills', focus: 'options, rates, market-making and mental math at speed', seats: ['st', 'hf', 'unsure'] },
  };

  /* ---------- interview question bank: [cat, text, seats] ---------- */
  const RAW_QUESTIONS = [
    ['fit', 'Walk me through your resume.', ''],
    ['fit', 'Tell me about yourself.', ''],
    ['fit', 'Why finance?', ''],
    ['fit', 'Why {seat}?', ''],
    ['fit', 'Why {firm}?', ''],
    ['fit', 'What do you think a first-year {role} does day to day?', ''],
    ['fit', 'Where do you see yourself in five years?', ''],
    ['fit', "What's a business or market story you've followed closely lately?", ''],

    ['beh', 'Tell me about a time you failed.', ''],
    ['beh', 'Tell me about a time you led a team.', ''],
    ['beh', 'Tell me about a conflict with a teammate and how you handled it.', ''],
    ['beh', "What's your greatest weakness?", ''],
    ['beh', 'Tell me about a time you worked under real pressure.', ''],
    ['beh', "What's an accomplishment you're proud of?", ''],
    ['beh', 'Tell me about a time you had to persuade someone.', ''],
    ['beh', 'Tell me about a time you made a mistake on the details. What happened next?', ''],
    ['beh', 'How do you handle critical feedback? Give me an example.', ''],
    ['beh', 'Tell me about a time you took initiative without being asked.', ''],
    ['beh', 'Tell me about a time you had to learn something difficult quickly.', ''],

    ['acc', 'Walk me through the three financial statements.', ''],
    ['acc', 'How do the three financial statements link together?', ''],
    ['acc', 'Depreciation goes up by $10. Walk me through the three statements. Assume a 25% tax rate.', ''],
    ['acc', 'If you could use only one financial statement to judge a company, which would you pick and why?', ''],
    ['acc', "What's the difference between cash-basis and accrual accounting?", ''],
    ['acc', 'A company buys $100 of inventory with cash. Walk me through the statements. Then it sells that inventory for $150. Walk me through again with a 25% tax rate.', ''],
    ['acc', "What is working capital, and how can a growing company run out of cash even when it's profitable?", ''],
    ['acc', "What's the difference between net income and free cash flow?", ''],
    ['acc', 'How does stock-based compensation show up on the three statements?', ''],
    ['acc', 'What is goodwill, and when is it created?', ''],
    ['acc', 'A company raises $100 of debt and uses it to buy PP&E. Walk me through the statements at the moment of purchase.', ''],
    ['acc', 'Why is EBITDA so widely used, and what are its flaws?', ''],
    ['acc', 'A company writes down $50 of inventory. Walk me through the statements with a 25% tax rate.', ''],
    ['acc', 'What is deferred revenue, and why might a fast-growing subscription company have a lot of it?', ''],

    ['val', 'Walk me through a DCF.', ''],
    ['val', "What's the difference between equity value and enterprise value?", ''],
    ['val', 'Why do you add debt and subtract cash to get from equity value to enterprise value?', ''],
    ['val', 'What are the main ways to value a company, and which usually gives the highest value?', ''],
    ['val', 'How do you calculate WACC, and why is the cost of equity usually higher than the cost of debt?', ''],
    ['val', "What's the difference between levered and unlevered free cash flow, and which discount rate goes with each?", ''],
    ['val', 'How would you value a company that has no earnings yet?', ''],
    ['val', 'What is terminal value, and what are the two ways to calculate it?', ''],
    ['val', 'Walk me through a basic LBO.', 'pe ib hf'],
    ['val', 'What makes a company a good LBO candidate?', 'pe ib'],
    ['val', 'A company with a P/E of 20 buys a company with a P/E of 10 using all stock. Is the deal accretive or dilutive, and why?', 'ib pe er cf'],
    ['val', 'Why do acquirers usually pay a premium over the current share price?', ''],
    ['val', 'What are the limits of the P/E ratio?', ''],
    ['val', 'Company A trades at 10x EBITDA and Company B at 15x. What could explain the gap?', ''],
    ['val', 'If interest rates rise, what happens to a DCF valuation, and why?', ''],
    ['val', 'Paper LBO: you buy a company with $100M of EBITDA at 10x using 60% debt. Five years later EBITDA is $150M, you exit at 10x, and $200M of debt has been paid down. What are the MOIC and the rough IRR?', 'pe ib hf'],

    ['mkt', "What's going on in the markets right now?", ''],
    ['mkt', 'How do interest rates affect stock prices?', ''],
    ['mkt', "What's the relationship between bond prices and yields? Explain it with an example.", ''],
    ['mkt', 'What does an inverted yield curve signal, and how reliable has that signal been?', ''],
    ['mkt', 'What does the Fed do, and how does a rate cut ripple through markets?', ''],
    ['mkt', 'If inflation comes in hotter than expected, what happens to stocks, bonds and the dollar?', ''],
    ['mkt', 'Where do you think the S&P 500 will be in a year, and why?', ''],
    ['mkt', 'Why does the 10-year Treasury yield matter so much?', ''],
    ['mkt', 'What would make you worried about a recession right now?', ''],
    ['mkt', 'How does a strong dollar affect a U.S. company that sells mostly overseas?', ''],

    ['inv', 'Pitch me a stock.', ''],
    ['inv', "What's a stock you'd avoid or short, and why?", 'hf am er st'],
    ['inv', 'If I gave you $1 million, how would you invest it?', ''],
    ['inv', "What's the biggest risk to the stock you'd pitch?", ''],
    ['inv', 'Tell me about an investment you got wrong. What did you learn?', ''],
    ['inv', 'Name a company with a strong moat. What makes it hard to compete with?', ''],

    ['trd', "What's the difference between a call and a put?", ''],
    ['trd', 'What happens to the price of an option when volatility rises? Why?', ''],
    ['trd', 'What is delta, in plain English?', 'st hf'],
    ['trd', 'Why would a company use an interest rate swap?', 'st hf cb'],
    ['trd', 'Pitch me a trade.', 'st hf'],
    ['trd', "You're making a market in a stock trading around $50. How do you set your bid and ask, and what moves them?", 'st hf'],
    ['trd', 'Would you rather have $1 million for sure or a 50% chance at $2.5 million? Walk me through how you think about it.', 'st hf'],

    ['awm', 'How would you explain diversification to a client with no finance background?', ''],
    ['awm', 'A 65-year-old client wants to move all their savings into tech stocks. What do you say?', 'wm am'],
    ['awm', "What's the difference between active and passive management, and why do most active managers trail their benchmark?", ''],
    ['awm', "What's the difference between a fiduciary and a broker?", 'wm am'],
    ['awm', 'What is the Sharpe ratio, and what does it miss?', 'am wm hf'],
    ['awm', 'How would you build a portfolio for a 25-year-old saving for retirement?', 'wm am'],
    ['awm', "What's the difference between a Roth IRA and a traditional IRA, and who should pick which?", 'wm'],
    ['awm', 'How do wealth managers get paid, and what conflicts can that create?', 'wm am'],
    ['awm', 'A client panics after the market drops 20%. What do you tell them?', 'wm am'],

    ['teaser', "What's 17 × 24?", ''],
    ['teaser', "What's 15% of 360?", ''],
    ['teaser', 'A stock rises 50% and then falls 50%. Where does it end up?', ''],
    ['teaser', 'A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much is the ball?', ''],
    ['teaser', 'What is the probability of rolling at least one six in two rolls of a die?', ''],
    ['teaser', 'What is the sum of the whole numbers from 1 to 100?', ''],
    ['teaser', 'What is the angle between the hands of a clock at 3:15?', ''],
    ['teaser', 'How many gas stations are there in the United States? Walk me through your estimate.', ''],
    ['teaser', 'Estimate the annual revenue of a coffee shop near your campus.', ''],
    ['teaser', 'You have a 3-gallon jug and a 5-gallon jug. How do you measure exactly 4 gallons?', ''],
    ['teaser', 'Roughly what is 1.07 to the 10th power? Explain your shortcut.', ''],
    ['teaser', 'How many times a day do the hour and minute hands of a clock overlap?', ''],
    ['teaser', "What's 0.6 divided by 0.08?", ''],
  ];
  const QUESTIONS = RAW_QUESTIONS.map((r, i) => ({ id: 'q' + i + '-' + slug(r[1]).slice(0, 24), cat: r[0], text: r[1], for: r[2] ? r[2].split(/\s+/) : [] }));
  // model answers and the usual follow-up for each question live in src/answers.js (global QA in the browser)
  const QA_SRC = (typeof QA !== 'undefined' && QA) || (typeof require !== 'undefined' ? (() => { try { return require('./answers.js'); } catch (e) { return {}; } })() : {});
  QUESTIONS.forEach(q => { const x = QA_SRC[q.text]; q.answer = x ? x.a : ''; q.followUp = x && x.f ? x.f : ''; });
  function questionById(id) { return QUESTIONS.find(q => q.id === id) || null; }

  /* ---------- profile ---------- */
  const DEFAULT_PROFILE = {
    name: '', school: '', year: 'Sophomore', major: '',
    seats: [], primary: '', firms: '', goals: '',
    startDate: '', readyDate: '', events: [],
    levels: { acc: 'some', val: 'some', mkt: 'some' },
    studyDays: [0, 1, 2, 3, 4, 5, 6], mockDay: 0, minutes: 20, remindAt: '09:30',
    why: '', experiences: '', interests: '',
  };

  function splitList(s) {
    if (Array.isArray(s)) return s.map(x => String(x).trim()).filter(Boolean);
    return String(s || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  }
  function splitLines(s) {
    if (Array.isArray(s)) return s.map(x => String(x).trim()).filter(Boolean);
    return String(s || '').split(/\n+/).map(x => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
  }

  function normalize(raw) {
    const p = Object.assign({}, DEFAULT_PROFILE, raw || {});
    p.levels = Object.assign({}, DEFAULT_PROFILE.levels, (raw && raw.levels) || {});
    ['acc', 'val', 'mkt'].forEach(k => { if (!['new', 'some', 'solid'].includes(p.levels[k])) p.levels[k] = 'some'; });
    p.seats = (Array.isArray(p.seats) ? p.seats : []).filter(s => SEATS[s]);
    p.seats = [...new Set(p.seats)];
    if (!p.seats.length) p.seats = ['unsure'];
    if (!p.seats.includes(p.primary)) p.primary = p.seats[0];
    p.studyDays = [...new Set((Array.isArray(p.studyDays) ? p.studyDays : []).map(Number).filter(n => n >= 0 && n <= 6))].sort();
    if (!p.studyDays.length) p.studyDays = [0, 1, 2, 3, 4, 5, 6];
    p.mockDay = Number.isInteger(+p.mockDay) && +p.mockDay >= 0 && +p.mockDay <= 6 ? +p.mockDay : 0;
    p.minutes = [10, 20, 30].includes(+p.minutes) ? +p.minutes : 20;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.remindAt || ''))) p.remindAt = '09:30';
    if (!YEARS.includes(p.year)) p.year = 'Sophomore';
    p.firmList = [...new Set(splitList(p.firms))].slice(0, 8);
    if (!String(p.goals || '').trim() && raw && raw.target) p.goals = String(raw.target);
    p.goalList = [...new Set(splitLines(p.goals))].slice(0, 6);
    p.events = (Array.isArray(p.events) ? p.events : [])
      .filter(e => e && String(e.name || '').trim() && parseISO(e.date))
      .map(e => ({ id: e.id || ('e-' + slug(e.name) + '-' + e.date), name: String(e.name).trim(), date: e.date, type: EVENT_TYPES[e.type] ? e.type : 'other', est: !!e.est, note: e.note || '' }))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    return p;
  }

  function validate(raw) {
    const p = normalize(raw);
    const errs = {};
    if (!String(p.school || '').trim()) errs.school = 'Add your school.';
    if (!raw || !Array.isArray(raw.seats) || !raw.seats.filter(s => SEATS[s]).length) errs.seats = 'Pick at least one seat, or "Not sure yet".';
    const s = parseISO(p.startDate), r = parseISO(p.readyDate);
    if (!s) errs.startDate = 'Add a start date.';
    if (!r) errs.readyDate = 'Add the date you want to be interview-ready.';
    else if (s && daysBetween(p.startDate, p.readyDate) < 7) errs.readyDate = 'Give yourself at least a week after your start date.';
    return errs;
  }

  /* ---------- weights ---------- */
  function baseWeights(p) {
    const w = {};
    LESSON_CATS.forEach(c => w[c] = 0);
    const add = (seat, share) => SEAT_WEIGHTS[seat].forEach((v, i) => { w[LESSON_CATS[i]] += v * share; });
    const others = p.seats.filter(s => s !== p.primary);
    if (!others.length) add(p.primary, 1);
    else { add(p.primary, 0.6); others.forEach(s => add(s, 0.4 / others.length)); }
    const LV = { new: 1.25, some: 1, solid: 0.8 };
    w.acc *= LV[p.levels.acc]; w.val *= LV[p.levels.val]; w.mkt *= LV[p.levels.mkt];
    return w;
  }
  const PHASE_MULT = {
    0: { car: 1.3, inv: 0.7, sto: 0.4 },
    1: { acc: 1.15, val: 1.1, mkt: 1.1, inv: 0.6 },
    2: { inv: 1.5, trd: 1.2, val: 1.1, car: 0.9, rev: 0.07 },
    3: { car: 1.7, rev: 0.12 },
    4: { car: 1.5, mkt: 1.2, rev: 0.15 },
  };
  function phaseWeights(base, ph) {
    const m = PHASE_MULT[ph] || {};
    const w = {};
    let sum = 0;
    LESSON_CATS.forEach(c => { w[c] = base[c] * (m[c] || 1); sum += w[c]; });
    LESSON_CATS.forEach(c => { w[c] = sum ? w[c] / sum : 0; });
    w.rev = m.rev || 0;
    return w;
  }

  const PHASE_INFO = {
    0: { name: 'Sprint', blurb: 'Highest-yield topics first, with a mock interview every week.' },
    1: { name: 'Foundations', blurb: 'Core technicals and how recruiting works, one topic a day.' },
    2: { name: 'Reps', blurb: 'Advanced topics mixed with drills, pitch work and weekly mocks.' },
    3: { name: 'Interview mode', blurb: 'Firm deep-dives, drills at interview speed and two mocks a week.' },
    4: { name: 'Recruiting season', blurb: 'Stay sharp while applications and interviews happen.' },
  };

  /* ---------- queues ---------- */
  function buildQueues(p) {
    const early = p.year === 'Freshman' || p.year === 'Sophomore';
    const all = p.seats.includes('unsure');
    const q = {};
    LESSON_CATS.forEach(c => q[c] = []);
    TOPICS.forEach(t => {
      if (t.yr === 'early' && !early) return;
      if (t.for.length && !all && !t.for.some(s => p.seats.includes(s))) return;
      q[t.cat].push(t);
    });
    ['acc', 'val', 'mkt'].forEach(c => {
      if (p.levels[c] === 'solid') q[c] = [REFRESHERS[c]].concat(q[c].filter(t => t.level > 1));
    });
    LESSON_CATS.forEach(c => {
      q[c] = q[c].map((t, i) => [t, i]).sort((a, b) => (a[0].level - b[0].level) || (a[1] - b[1])).map(x => x[0]);
    });
    return q;
  }

  function drillAllowed(c, p) {
    const d = DRILLS[c];
    if (!d) return false;
    if (!d.seats) return true;
    return d.seats.some(s => p.seats.includes(s));
  }

  /* ---------- plan ---------- */
  const PREP_RULES = {
    application: [{ off: 7, sub: 'app' }],
    interview: [{ off: 0, sub: 'day' }, { off: 5, sub: 'int' }, { off: 1, sub: 'mock' }],
    networking: [{ off: 1, sub: 'net' }],
    club: [{ off: 5, sub: 'club' }],
    other: [{ off: 3, sub: 'other' }],
  };
  const PREP_TITLES = {
    app: n => 'Application prep: ' + n,
    int: n => 'Interview prep: ' + n,
    net: n => 'Get ready for ' + n,
    club: n => 'Club prep: ' + n,
    other: n => 'Get ready: ' + n,
    mock: n => 'Mock interview for ' + n,
    day: n => 'Interview day: ' + n,
  };

  function buildPlan(raw) {
    const p = normalize(raw);
    const start = parseISO(p.startDate), ready = parseISO(p.readyDate);
    if (!start || !ready) return { error: 'Add a start date and an interview-ready date.', profile: p };
    if (ready <= start) return { error: 'Your interview-ready date needs to come after your start date.', profile: p };

    const evs = p.events.filter(e => e.date >= p.startDate);
    let end = ready;
    const lastEv = evs.length ? parseISO(evs[evs.length - 1].date) : null;
    if (lastEv && lastEv > end) end = lastEv;
    const cap = addDays(start, 3 * 365);
    if (end > cap) end = cap;
    const endISO = iso(end);

    const days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) if (p.studyDays.includes(d.getDay())) days.push(iso(d));
    const readyISO = iso(ready);
    const R = days.filter(d => d <= readyISO).length;
    if (!days.length || !R) return { error: 'There are no study days before your interview-ready date. Add more study days or move the date.', profile: p };

    // phases (a few stray days after the ready date fold into the last phase)
    const phaseOf = new Array(days.length);
    const phases = [];
    const post = days.length - R;
    if (R < 24) phases.push({ n: 0, fromIdx: 0, toIdx: R - 1 });
    else {
      const p3 = Math.max(7, Math.round(R * 0.15)), p2 = Math.round(R * 0.30), p1 = R - p2 - p3;
      phases.push({ n: 1, fromIdx: 0, toIdx: p1 - 1 }, { n: 2, fromIdx: p1, toIdx: p1 + p2 - 1 }, { n: 3, fromIdx: p1 + p2, toIdx: R - 1 });
    }
    if (post >= 5) phases.push({ n: 4, fromIdx: R, toIdx: days.length - 1 });
    else if (post > 0) phases[phases.length - 1].toIdx = days.length - 1;
    phases.forEach(ph => {
      for (let i = ph.fromIdx; i <= ph.toIdx; i++) phaseOf[i] = ph.n;
      Object.assign(ph, PHASE_INFO[ph.n], { from: days[ph.fromIdx], to: days[ph.toIdx], days: ph.toIdx - ph.fromIdx + 1 });
    });

    const special = new Map();
    const startISO = p.startDate;
    const evInfo = e => ({ id: e.id, name: e.name, date: e.date, type: e.type, note: e.note, est: e.est });
    const mockNear = (i, span) => {
      for (const [j, s] of special) if (s.kind === 'mock' && Math.abs(daysBetween(days[j], days[i])) <= span) return true;
      return false;
    };

    // 1) prep sessions tied to the student's dates (interview-day items first: they can only go on one day)
    const rules = [];
    evs.forEach(e => (PREP_RULES[e.type] || PREP_RULES.other).forEach(r => rules.push([e, r])));
    rules.sort((a, b) => (a[1].sub === 'day' ? 0 : 1) - (b[1].sub === 'day' ? 0 : 1));
    rules.forEach(([e, r]) => {
      let pick = -1;
      if (r.sub === 'day') {
        const i = days.indexOf(e.date);
        if (i >= 0 && !special.has(i)) pick = i;
      } else {
        const target = iso(addDays(parseISO(e.date), -r.off));
        for (let i = 0; i < days.length && days[i] < e.date; i++) {
          if (special.has(i)) continue;
          if (days[i] <= target) pick = i;               // latest free day on or before the target
          else { if (pick < 0) pick = i; break; }        // otherwise the first free day after it
        }
      }
      if (pick < 0) return;
      const isMock = r.sub === 'mock';
      special.set(pick, {
        kind: isMock ? 'mock' : 'prep', cat: isMock ? 'mock' : 'prep', sub: r.sub,
        title: PREP_TITLES[r.sub](e.name), event: evInfo(e),
        key: (isMock ? 'mock-ev-' : 'prep-') + slug(e.name) + '-' + e.date + '-' + r.sub,
      });
    });

    // 2) mock interviews on the student's mock day; cadence scales with study days per week:
    //    at least BASE weeks apart and at least GAP study days apart, so a light schedule
    //    still gets mostly lessons
    const k = p.studyDays.length;
    const BASE = { 0: 1, 1: 2, 2: 1, 3: 1, 4: 1 }, GAP = { 0: 3, 1: 10, 2: 5, 3: 3, 4: 5 };
    const everyWeeks = ph => Math.max(BASE[ph], Math.ceil(GAP[ph] / k));
    const byWeek = [];
    days.forEach((d, i) => { const w = Math.floor(daysBetween(startISO, d) / 7); (byWeek[w] = byWeek[w] || []).push(i); });
    const placeMock = (cands, title, suffix) => {
      for (const i of cands) {
        if (i <= 0 || special.has(i) || mockNear(i, 2)) continue;
        special.set(i, { kind: 'mock', cat: 'mock', sub: 'std', title, key: 'mock-' + days[i] + (suffix || '') });
        return i;
      }
      return -1;
    };
    byWeek.forEach((idxs, w) => {
      if (!idxs || !idxs.length) return;
      let main = idxs.find(i => parseISO(days[i]).getDay() === p.mockDay);
      if (main === undefined) main = idxs[idxs.length - 1];
      const ph = phaseOf[main], every = everyWeeks(ph);
      const on = ph === 1 ? (w >= 2 && (w - 2) % every === 0) : (w % every === 0);
      if (!on) return;
      const earlier = idxs.filter(i => i < main).reverse();
      const placed = placeMock([main].concat(earlier), 'Mock interview');
      if (ph === 3 && k >= 5 && placed > 0) {
        const target = daysBetween(startISO, days[placed]) - 3;
        const order = idxs.slice().sort((a, b) => Math.abs(daysBetween(startISO, days[a]) - target) - Math.abs(daysBetween(startISO, days[b]) - target));
        placeMock(order, 'Midweek mock interview', '-mid');
      }
    });
    // a final mock in the last few days before the ready date
    const last = R - 1;
    let recent = -1;
    for (let j = last; j >= 0 && daysBetween(days[j], days[last]) <= 3; j--) {
      const s = special.get(j);
      if (s && s.kind === 'mock') { recent = j; break; }
    }
    if (recent >= 0) { const s = special.get(recent); if (s.sub === 'std') s.title = 'Final mock: a full first round'; }
    else {
      for (let j = last; j > 0 && daysBetween(days[j], days[last]) <= 3; j--) {
        if (!special.has(j)) { special.set(j, { kind: 'mock', cat: 'mock', sub: 'std', title: 'Final mock: a full first round', key: 'mock-' + days[j] }); break; }
      }
    }

    // 3) firm deep-dives spread through interview mode (or the back half of a sprint)
    const ph3 = phases.find(ph => ph.n === 3);
    const firmSpan = ph3 ? { from: ph3.fromIdx, to: ph3.toIdx } : (phases[0].n === 0 ? { from: Math.floor(R / 2), to: R - 1 } : null);
    if (firmSpan && p.firmList.length) {
      const len = firmSpan.to - firmSpan.from + 1;
      const F = Math.min(6, p.firmList.length, Math.max(1, Math.floor(len / 4)));
      p.firmList.slice(0, F).forEach((f, j) => {
        const target = firmSpan.from + Math.floor((j + 0.5) * len / F);
        for (let d = 0; d < len; d++) {
          for (const c of [target + d, target - d]) {
            if (c >= firmSpan.from && c <= firmSpan.to && !special.has(c)) {
              special.set(c, { kind: 'firm', cat: 'firm', title: 'Why ' + f + '?', firm: f, key: 'firm-' + slug(f) });
              return;
            }
          }
        }
      });
    }

    // 3) lessons, interleaved by weight (smooth weighted round-robin)
    const queues = buildQueues(p);
    const base = baseWeights(p);
    const ptr = {}, current = { rev: 0 }, drillN = {}, topicLate = {}, drillLate = {};
    LESSON_CATS.forEach(c => { ptr[c] = 0; current[c] = 0; drillN[c] = 0; topicLate[c] = 0; drillLate[c] = 0; });
    let revN = 0, first = true;
    const RATIO = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3 };
    const hasTopic = (c, ph) => ptr[c] < queues[c].length && ((ph === 0 || ph === 1) ? queues[c][ptr[c]].level <= 2 : true);
    const canServe = (c, ph) => c === 'rev' ? true : (hasTopic(c, ph) || drillAllowed(c, p));

    const items = new Array(days.length);
    for (let i = 0; i < days.length; i++) {
      if (special.has(i)) { items[i] = special.get(i); continue; }
      const ph = phaseOf[i];
      const w = phaseWeights(base, ph);
      const cand = LESSON_CATS.concat('rev').filter(c => w[c] > 0 && canServe(c, ph));
      let best;
      if (!cand.length) best = 'rev';
      else {
        let total = 0;
        cand.forEach(c => { current[c] += w[c]; total += w[c]; });
        best = (first && cand.includes('car')) ? 'car' : cand.reduce((a, b) => current[b] > current[a] ? b : a);
        current[best] -= total;
      }
      first = false;

      if (best === 'rev') { revN++; items[i] = { kind: 'rev', cat: 'rev', title: 'Rewind: your weakest topic', key: 'rev-' + revN }; continue; }
      const topicOk = hasTopic(best, ph), drillOk = drillAllowed(best, p);
      const late = ph >= 2;
      let doDrill = false;
      if (!topicOk && drillOk) doDrill = true;
      else if (topicOk && drillOk && late && RATIO[ph] > 0 && drillLate[best] < topicLate[best] * RATIO[ph]) doDrill = true;
      if (doDrill) {
        drillN[best]++; if (late) drillLate[best]++;
        items[i] = { kind: 'drill', cat: best, title: DRILLS[best].title + ', round ' + drillN[best], key: 'drill-' + best + '-' + drillN[best], focus: DRILLS[best].focus };
      } else if (topicOk) {
        const t = queues[best][ptr[best]++];
        if (late) topicLate[best]++;
        items[i] = { kind: 'lesson', cat: best, title: t.title, topicId: t.id, level: t.level, key: t.id };
      } else {
        revN++;
        items[i] = { kind: 'rev', cat: 'rev', title: 'Rewind: your weakest topic', key: 'rev-' + revN };
      }
    }

    const out = items.map((it, i) => Object.assign({}, it, { date: days[i], idx: i, day: i + 1, phase: phaseOf[i] }));
    const counts = { lesson: 0, drill: 0, mock: 0, prep: 0, firm: 0, rev: 0 };
    out.forEach(it => { counts[it.kind] = (counts[it.kind] || 0) + 1; });
    return {
      profile: p, items: out, phases, events: evs, start: startISO, end: endISO, ready: readyISO,
      prepDays: R, total: out.length, counts,
    };
  }

  /* ---------- helpers used by the app ---------- */
  function itemOn(plan, isoDate) { return plan.items.find(it => it.date === isoDate) || null; }
  function nextItem(plan, isoDate) { return plan.items.find(it => it.date > isoDate) || null; }
  function weekOf(plan, it) { return Math.floor(daysBetween(plan.start, it.date) / 7); }
  function teaserLevel(plan, it) {
    const f = plan.prepDays ? it.idx / plan.prepDays : 1;
    return f < 0.3 ? 'easy' : f < 0.7 ? 'medium' : 'hard';
  }
  function questionsFor(p, cat) {
    const all = p.seats.includes('unsure');
    return QUESTIONS.filter(q => (!cat || q.cat === cat) && (!q.for.length || all || q.for.some(s => p.seats.includes(s))));
  }
  function fillQuestion(text, p, rnd) {
    const firms = p.firmList || [];
    const firm = firms.length ? firms[Math.floor((rnd ? rnd() : Math.random()) * firms.length)] : 'our firm';
    return text.replace('{seat}', SEATS[p.primary].phrase).replace('{role}', SEATS[p.primary].role).replace('{firm}', firm);
  }
  function rng(seedStr) {
    let h = 1779033703 ^ String(seedStr).length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /* Technical categories that matter most for a seat, for drills and mocks */
  const SEAT_TECH = {
    ib: ['acc', 'val'], pe: ['val', 'acc'], er: ['acc', 'val', 'inv'], cf: ['acc', 'val'], cb: ['acc', 'val', 'mkt'],
    st: ['mkt', 'trd'], hf: ['inv', 'val', 'mkt'], am: ['inv', 'mkt', 'awm'], wm: ['awm', 'mkt', 'inv'], vc: ['inv', 'val'],
    unsure: ['acc', 'val', 'mkt'],
  };

  function pickMock(p, seed, avoidIds, weakCats) {
    const r = rng(seed);
    const avoid = new Set(avoidIds || []);
    const pick = (cat) => {
      const pool = questionsFor(p, cat);
      const fresh = pool.filter(q => !avoid.has(q.id));
      const src = fresh.length ? fresh : pool;
      const q = src[Math.floor(r() * src.length)];
      avoid.add(q.id);
      return { id: q.id, cat: q.cat, text: fillQuestion(q.text, p, r) };
    };
    const tech = SEAT_TECH[p.primary] || SEAT_TECH.unsure;
    const t1 = (weakCats && weakCats.length) ? weakCats[0] : tech[0];
    const t2 = tech.find(c => c !== t1) || tech[0];
    const lastCat = ['ib', 'pe', 'cf', 'cb', 'vc'].includes(p.primary) ? (r() < 0.5 ? 'teaser' : 'mkt') : (r() < 0.5 ? 'mkt' : 'inv');
    return [pick('fit'), pick('beh'), pick(t1), pick(t2), pick(lastCat)];
  }

  /* ---------- spaced repetition ----------
     A question you score 3 or lower comes back the next day. Each time you then score 4 or 5
     (on or after its due date) the gap grows: 3 days, 7 days, 14 days, then it's retired.
     Missing it again at any point starts it over. Right the first time: never scheduled. */
  const REVIEW_GAPS = [1, 3, 7, 14];
  function reviewKey(q) { return String(q || '').toLowerCase().replace(/[^a-z0-9$%]+/g, ' ').trim(); }
  function reviewSchedule(answers, today) {
    const m = new Map();
    (answers || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0)).forEach(a => {
      const k = reviewKey(a.q), day = parseISO(a.date) ? a.date : today;
      if (!k || !(a.score >= 1)) return;
      let r = m.get(k);
      if (!r) {
        if (a.score >= 4) return;
        m.set(k, { key: k, q: a.q, qid: a.qid || '', cat: a.cat, box: 0, last: day, due: iso(addDays(parseISO(day), REVIEW_GAPS[0])), score: a.score, attempts: 1, retired: false });
        return;
      }
      r.attempts++; r.last = day; r.score = a.score; r.q = a.q; r.qid = a.qid || r.qid; r.cat = a.cat || r.cat;
      if (a.score <= 3) { r.box = 0; r.retired = false; r.due = iso(addDays(parseISO(day), REVIEW_GAPS[0])); return; }
      if (r.retired || (r.due && day < r.due)) return;          // a pass before it's due doesn't move it along
      if (r.box + 1 >= REVIEW_GAPS.length) { r.retired = true; r.due = null; return; }
      r.box++;
      r.due = iso(addDays(parseISO(day), REVIEW_GAPS[r.box]));
    });
    return Array.from(m.values()).filter(r => !r.retired)
      .map(r => Object.assign(r, { isDue: r.due <= today }))
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.score - b.score));
  }

  function planMarkdown(plan) {
    const p = plan.profile;
    const L = [];
    L.push('# ' + (p.name ? p.name + "'s" : 'My') + ' recruiting plan');
    L.push('');
    L.push('Interview-ready by **' + fmt(plan.ready, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '**. ' + plan.total + ' study days from ' + fmt(plan.start, { month: 'long', day: 'numeric', year: 'numeric' }) + '.');
    if (plan.events.length) {
      L.push('', '## Key dates');
      plan.events.forEach(e => L.push('- ' + fmt(e.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + e.name + ' (' + EVENT_TYPES[e.type] + (e.est ? ', estimate' : '') + ')'));
    }
    L.push('', '## Phases');
    plan.phases.forEach(ph => L.push('- **' + ph.name + '** · ' + fmt(ph.from) + ' to ' + fmt(ph.to) + ': ' + ph.blurb));
    L.push('', '## Day by day');
    let lastW = -1;
    plan.items.forEach(it => {
      const w = weekOf(plan, it);
      if (w !== lastW) {
        lastW = w;
        const ws = iso(addDays(parseISO(plan.start), w * 7)), we = iso(addDays(parseISO(plan.start), w * 7 + 6));
        L.push('', '### Week ' + (w + 1) + ': ' + fmt(ws) + ' to ' + fmt(we));
      }
      L.push('- Day ' + it.day + ' · ' + fmt(it.date) + ' · *' + CATS[it.cat].name + '* · ' + it.title);
    });
    return L.join('\n');
  }

  const api = {
    CATS, LESSON_CATS, SEATS, YEARS, EVENT_TYPES, TOPICS, QUESTIONS, DRILLS, SEAT_TECH, PHASE_INFO, DEFAULT_PROFILE,
    parseISO, iso, addDays, daysBetween, todayISO, fmt, slug, splitList, splitLines, rng,
    normalize, validate, buildPlan, itemOn, nextItem, weekOf, teaserLevel, questionsFor, fillQuestion, pickMock, planMarkdown, baseWeights,
    questionById, reviewKey, reviewSchedule, REVIEW_GAPS,
  };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
