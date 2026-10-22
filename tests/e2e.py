"""End-to-end checks for both builds of the coach.

Part A runs the Claude version (dist/finance-recruiting-coach.html) against a mocked
`sample` runtime (tests/mock-claude-runtime.js). Part B serves the website (docs/) on a
local port and runs it the way a visitor would, with no AI on the page.

Run from the project folder after `node build.mjs`:
    pip install playwright && python -m playwright install chromium   # once
    python3 tests/e2e.py
Screenshots land in tests/.out/shots.
"""
import contextlib
import datetime as dt
import functools
import http.server
import json
import pathlib
import re
import socketserver
import sys
import threading
import urllib.parse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests' / '.out'
SHOTS = OUT / 'shots'
SHOTS.mkdir(parents=True, exist_ok=True)

problems, notes = [], []


def check(cond, msg):
    if cond:
        notes.append('ok   ' + msg)
    else:
        problems.append('FAIL ' + msg)
        print('FAIL', msg, flush=True)


def iso(days):
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


def no_hscroll(page, label):
    w = page.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
    check(w[0] <= w[1], f'no horizontal scroll on {label} ({w[0]} <= {w[1]})')


def state_of(page):
    page.wait_for_timeout(450)  # the app debounces saves by 300 ms
    return json.loads(page.evaluate('localStorage.getItem("frc:v1")') or 'null')


def watch(page, errs):
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text)
            if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text else None)


# Links that open Claude are real <a> tags. This keeps the click from navigating away
# and records where it would have gone (the app sets the href during the same click).
CATCH_HANDOFF = ('window.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("a[data-act=handoff]");'
                 ' if (a) { e.preventDefault(); window.__handoff = a.href; } });')


def handoff_q(page):
    href = page.evaluate('window.__handoff') or ''
    if '?q=' not in href:
        return href, ''
    return href, urllib.parse.unquote(href.split('?q=', 1)[1])


def fill_profile(page, with_suggest):
    page.fill('#f-name', 'Jordan')
    page.fill('#f-school', 'Wake Forest University')
    page.select_option('#f-year', 'Freshman')
    page.click('[data-act="seat"][data-seat="wm"]')
    page.click('[data-act="seat"][data-seat="am"]')
    check(page.locator('#primary-wrap').is_visible(), 'main-focus picker appears with two seats')
    page.select_option('#f-primary', 'wm')
    page.fill('#f-goals', 'Get into the investment club this fall\nLand a sophomore wealth management internship')
    page.fill('#f-firms', 'Morgan Stanley, UBS')
    page.fill('#f-ready', iso(180))
    page.click('[data-act="ev-add"]')
    row = page.locator('.ev').last
    row.locator('[data-evf="name"]').fill('Investment club application')
    row.locator('[data-evf="date"]').fill(iso(12))
    row.locator('[data-evf="type"]').select_option('club')
    if with_suggest:
        page.click('[data-act="suggest"]')
        page.wait_for_selector('.sugg li')
        check(page.locator('.sugg li').count() == 2, 'suggested dates render')
        page.click('[data-act="sugg-add"][data-i="0"]')
        check(page.locator('.ev').count() == 2 and page.locator('.ev-est').count() == 1, 'a suggested date is added and flagged as an estimate')
    page.fill('#f-remind', '07:45')
    page.fill('#f-why', 'I like math and people, and I want to help families build wealth.')
    page.fill('#f-exp', 'Run a basketball training business for kids\nTour guide\nMath peer tutor')
    page.fill('#f-int', 'energy, uranium')
    page.wait_for_timeout(250)


LIB_FIRST = 'The map of finance: sell side vs. buy side, and where every seat fits'
LABELS = ['Cold open', 'Say it out loud', 'Rapid fire a', 'Rapid fire b', 'Rapid fire c', 'Rewind', 'Brain teaser']

with sync_playwright() as pw:
    browser = pw.chromium.launch()

    # =====================================================================
    # PART A: the Claude version, against the mocked runtime
    # =====================================================================
    page_html = (ROOT / 'dist' / 'finance-recruiting-coach.html').read_text()
    RESET = (':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
             'body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}')
    (OUT / 'harness.html').write_text('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
                                      '<style>' + RESET + '</style></head><body>' + page_html + '</body></html>')
    HARNESS = 'file://' + str(OUT / 'harness.html')
    MOCK = (ROOT / 'tests' / 'mock-claude-runtime.js').read_text()

    def open_claude(flags='', state=None, **kw):
        ctx = browser.new_context(**kw)
        ctx.route(re.compile(r'fonts\.g'), lambda r: r.abort())
        pre = flags + CATCH_HANDOFF
        if state is not None:
            pre += 'try{if(!sessionStorage.getItem("seeded")){localStorage.setItem("frc:v1",' + json.dumps(state) + ');sessionStorage.setItem("seeded","1")}}catch(e){};'
        ctx.add_init_script(pre + MOCK)
        page = ctx.new_page()
        errs = []
        watch(page, errs)
        page.goto(HARNESS)
        return ctx, page, errs

    all_errs = []

    # ---------------- A1. setup ----------------
    ctx, page, errs = open_claude(viewport={'width': 1280, 'height': 900})
    page.wait_for_selector('#setup-form')
    check('Build your recruiting coach' in page.inner_text('main'), 'A: first visit lands on setup')
    page.wait_for_selector('button[data-act="suggest"]')
    check(page.locator('a[data-act="handoff"][data-kind="dates"]').count() == 0, 'A: once Claude connects, setup offers in-page date suggestions instead of a link')
    page.screenshot(path=str(SHOTS / 'a01-setup-desktop.png'))
    page.click('#f-save')
    check(page.locator('#err-school').is_visible() and page.locator('#err-seats').is_visible(), 'A: empty save flags the missing basics')
    fill_profile(page, with_suggest=True)
    check('Your plan so far' in page.inner_text('#preview'), 'A: preview switches to the real plan once dates exist')
    page.click('#f-save')
    page.wait_for_selector('.session-title')
    st = state_of(page)
    check(st['profile']['goals'].startswith('Get into') and st['profile']['remindAt'] == '07:45', 'A: goals and reminder time saved')
    check(page.locator('#count .count-n').inner_text().strip() == '180', 'A: countdown shows 180 days')

    # ---------------- A2. today: a library lesson, graded by Claude, then personalized ----------------
    check(page.inner_text('.session-title') == LIB_FIRST, 'A: day one is a written library lesson')
    check('From the lesson library' in page.inner_text('#lesson-bar') and page.locator('#lesson-bar [data-act="teach"]').inner_text() == 'Personalize it', 'A: library lesson offers Personalize it')
    check(page.locator('.sec-cold').count() == 1 and page.locator('.sec-trap').count() == 1 and page.locator('details.sec-answers[open]').count() == 0, 'A: lesson sections render, answers hidden')
    opts = page.locator('#lg-q option').all_inner_texts()
    check([o.split(':')[0] for o in opts[:-1]] == LABELS and opts[-1] == 'Type my own question', 'A: grade box lists the seven lesson questions: ' + ' | '.join(o[:24] for o in opts))
    page.select_option('#lg-q', '1')
    page.fill('#lg-a', 'The sell side advises and sells, the buy side invests. Banks are sell side; asset managers are buy side.')
    page.click('#lg-go')
    page.wait_for_selector('#lg-out .result')
    check('3/5' in page.inner_text('#lg-out'), 'A: Claude grades the answer 3/5')
    check(page.locator('[data-act="done"]').first.inner_text() == 'Undo done', 'A: grading marks the session done')
    page.click('#lg-out [data-act="followup"]')
    check(page.input_value('#lg-qc') == 'What happens to cash?', 'A: follow-up loads into the question box')
    # check it myself, against the written answer
    page.select_option('#lg-q', '2')
    page.fill('#lg-a', 'Investment banking is sell side.')
    page.click('[data-act="self-check"][data-scope="lg"]')
    page.wait_for_selector('#lg-out .result.self')
    check(len(page.inner_text('#lg-out .result.self .better')) > 3, 'A: Check it myself shows the written answer')
    page.click('#lg-out [data-act="self-score"][data-n="2"]')
    check('comes back for review tomorrow' in page.inner_text('#lg-out'), 'A: a self-score of 2 schedules a review tomorrow')
    check(page.locator('#lg-out .result.logged details summary').inner_text() == 'Model answer', 'A: the logged result keeps the model answer')
    st = state_of(page)
    check(st['answers'][-1]['src'] == 'self' and st['answers'][-1]['qid'].startswith('L:car-the-map-of-finance'), 'A: self-score logged with the lesson question id')
    # personalize, regenerate, back to the standard lesson
    page.click('#lesson-bar [data-act="teach"]')
    page.wait_for_selector('#lesson-bar [data-act="lib-restore"]', timeout=15000)
    check('Personalized' in page.inner_text('#lesson-bar'), 'A: Personalize it streams a personalized version')
    opts = page.locator('#lg-q option').all_inner_texts()
    check('Cold open: Walk me through how the three financial statements link together.' in opts, 'A: grade box follows the personalized lesson')
    page.click('[data-act="regen"]')
    page.wait_for_selector('#lesson-bar [data-act="lib-restore"]', timeout=15000)
    page.wait_for_timeout(150)
    regen = [x for x in page.evaluate('window.__sampleLog') if x['kind'] == 'sample' and isinstance(x.get('cache'), dict) and x['cache'].get('refresh')]
    check(len(regen) == 1, 'A: Regenerate asks Claude again (cache refresh)')
    page.click('[data-act="lib-restore"]')
    page.wait_for_selector('#lesson-bar [data-act="teach"]')
    check('From the lesson library' in page.inner_text('#lesson-bar'), 'A: Standard lesson brings back the written version')
    page.screenshot(path=str(SHOTS / 'a02-today-library.png'))

    # ---------------- A3. plan ----------------
    page.click('[data-act="tab"][data-tab="plan"]')
    page.wait_for_selector('.week')
    check('Club prep: Investment club application' in page.inner_text('main'), 'A: plan has prep before the club application')
    check(page.locator('.tick').count() == 2, 'A: phase bar shows a tick per key date')
    check(page.locator('[data-act="cal"]').count() == 0, 'A: no calendar download inside Claude (the viewer cannot save .ics files)')

    # ---------------- A4. practice: drill + mock with live follow-ups ----------------
    page.click('[data-act="tab"][data-tab="practice"]')
    page.wait_for_selector('.qcard .qtext')
    page.fill('#dg-a', 'Because you can invest it and earn a return, so money today is worth more.')
    page.click('#dg-go')
    page.wait_for_selector('#dg-out .result')
    check('/5' in page.inner_text('#dg-out'), 'A: quick drill graded')
    page.click('[data-act="pmode"][data-mode="mock"]')
    page.click('[data-act="mock-start"]')
    for i in range(5):
        page.wait_for_selector('#mk-a')
        page.fill('#mk-a', f'My answer number {i + 1}, structured and short.')
        page.click('[data-act="mock-next"]')
        page.wait_for_selector('.qcard .chip.input', timeout=15000)   # FOLLOW-UP
        fu = page.inner_text('.qcard .qtext')
        if i == 0:
            check(fu.startswith('You said that about') and 'number' in fu, 'A: the interviewer asks a follow-up that reacts to the answer: ' + fu)
        if i == 1:
            page.click('[data-act="mock-prev"]')
            check(page.input_value('#mk-a') == 'My answer number 2, structured and short.', 'A: Back returns to the main answer with the text kept')
            page.click('[data-act="mock-next"]')
            page.wait_for_selector('.qcard .chip.input')
        if i == 2:
            page.click('[data-act="mock-skipfu"]')
            continue
        page.fill('#mk-a', f'Follow-up answer {i + 1}.')
        page.click('[data-act="mock-next"]')
    page.wait_for_selector('.mq', timeout=15000)
    log = page.evaluate('window.__sampleLog')
    quick = [x for x in log if x['kind'] == 'json' and x.get('tier') == 'quick']
    check(len(quick) == 5, f'A: one quick follow-up call per question ({len(quick)})')
    mock_grades = [x for x in log if x['kind'] == 'json' and x.get('fu') == 4]
    check(len(mock_grades) == 1, 'A: the grading prompt carries the four answered follow-ups (one was skipped)')
    check(page.locator('.mq').count() == 5 and "Wouldn't advance yet" in page.inner_text('main'), 'A: mock result lists five graded answers and a verdict')
    check('<b>Follow-up:</b>' in page.inner_html('.mq >> nth=0'), 'A: the result keeps the follow-up and its answer')

    # ---------------- A5. scorecard ----------------
    page.click('[data-act="tab"][data-tab="scorecard"]')
    page.wait_for_selector('.tiles')
    check(page.locator('.tile').count() == 4 and page.locator('#trend svg').count() == 1, 'A: scorecard tiles and trend chart render')
    check(page.locator('.weak-list li').count() >= 1 and 'Review' in page.inner_text('.weak-list'), 'A: weak spots show when each comes back for review')
    page.screenshot(path=str(SHOTS / 'a03-scorecard.png'))

    # ---------------- A6. ask: the agent edits the plan ----------------
    page.click('[data-act="tab"][data-tab="ask"]')
    page.wait_for_selector('#ask-in')
    check(page.locator('#ask-hint').is_visible(), 'A: agent hint shows when tools are available')
    page.fill('#ask-in', 'My investment club interview is next Thursday, second round.')
    page.click('[data-act="ask-send"]')
    page.wait_for_selector('.changes', timeout=15000)
    page.wait_for_selector('[data-act="ask-send"]')
    tc = [x for x in page.evaluate('window.__sampleLog') if x['kind'] == 'tool']
    check(any(x['name'] == 'add_key_date' and isinstance(x['res'], dict) and x['res'].get('prep_sessions') for x in tc), 'A: add_key_date returns prep sessions')
    check(any(x['name'] == 'add_key_date (repeat)' and isinstance(x['res'], dict) and x['res'].get('already_in_plan') for x in tc), 'A: adding the same date twice is a no-op')
    check(any(x['name'] == 'add_key_date (past)' and str(x['res']).startswith('Error') for x in tc), 'A: a past date is refused')
    sched = [x for x in tc if x['name'] == 'get_schedule'][-1]['res']
    check(sched['to'] == iso(30), f'A: get_schedule caps the window at 31 days ({sched["to"]})')
    chat = [x for x in page.evaluate('window.__sampleLog') if x['kind'] == 'sample' and x['tools']][-1]
    check(chat['cache'] is False, 'A: tool calls pass cache:false')
    check(any(e['name'] == 'Investment club interview' for e in state_of(page)['profile']['events']), 'A: the agent wrote the key date into the plan')
    page.click('[data-act="ask-undo"]')
    check(not any(e['name'] == 'Investment club interview' for e in state_of(page)['profile']['events']) and 'Undone' in page.inner_text('.changes'), 'A: Undo removes the change')
    page.fill('#ask-in', 'My investment club interview is next Thursday.')
    page.click('[data-act="ask-send"]')
    page.wait_for_function('document.querySelectorAll(".changes").length >= 2', timeout=15000)
    page.wait_for_selector('[data-act="ask-send"]')
    page.fill('#ask-in', 'Update: the club interview got moved to the 12th, and add Evercore.')
    page.click('[data-act="ask-send"]')
    page.wait_for_function('document.querySelectorAll(".changes").length >= 3', timeout=15000)
    page.wait_for_selector('[data-act="ask-send"]')
    tcm = {x['name']: x['res'] for x in page.evaluate('window.__sampleLog') if x['kind'] == 'tool'}
    check(str(tcm.get('change_key_date (ambiguous)', '')).startswith('Error:'), 'A: an ambiguous match is refused')
    check(isinstance(tcm.get('change_key_date'), dict) and tcm['change_key_date'].get('moved', {}).get('to') == iso(12), 'A: change_key_date moves the date')
    st = state_of(page)
    check(st['profile']['readyDate'] == iso(200) and 'Evercore' in st['profile']['firms'], 'A: firm added and plan re-paced')
    page.fill('#ask-in', 'How am I doing so far?')
    page.click('[data-act="ask-send"]')
    page.wait_for_function('[...document.querySelectorAll(".msg.coach .bubble")].pop().innerText.includes("graded answers")', timeout=15000)
    gs = [x for x in page.evaluate('window.__sampleLog') if x['kind'] == 'tool' and x['name'] == 'get_scores'][-1]['res']
    check(gs['graded_answers'] >= 8, f'A: get_scores returns the record ({gs["graded_answers"]} answers)')
    page.screenshot(path=str(SHOTS / 'a04-ask-agent.png'))
    check(page.evaluate('window.__violations') == [], 'A: no API contract violations: ' + json.dumps(page.evaluate('window.__violations')))
    check(page.evaluate('window.__maxPromptBytes') < 60000, f'A: largest prompt is small ({page.evaluate("window.__maxPromptBytes")} bytes)')

    # ---------------- A7. errors ----------------
    page.click('[data-act="tab"][data-tab="practice"]')
    page.click('[data-act="pmode"][data-mode="drill"]')
    page.wait_for_selector('#dg-a')
    page.fill('#dg-a', 'answer')
    page.evaluate('window.__mockFail = {code: "rate_limited", message: "slow down"}')
    page.click('#dg-go')
    page.wait_for_selector('#dg-out .note.bad')
    check('usage limit' in page.inner_text('#dg-out') and page.locator('.ai-off').count() == 0, 'A: a rate limit shows a plain message and keeps Claude on')
    page.evaluate('window.__mockFail = {code: "not_granted", message: "no"}')
    page.click('#dg-go')
    page.wait_for_selector('.ai-off')
    check(page.locator('.ai-off').count() >= 1, 'A: not_granted switches to the Claude-off notice')
    page.reload()
    page.wait_for_selector('.tabs')
    st2 = state_of(page)
    check(st2['profile']['name'] == 'Jordan' and len(st2['answers']) >= 8, 'A: progress survives a reload')
    saved_state = page.evaluate('localStorage.getItem("frc:v1")')
    all_errs += errs
    ctx.close()

    # ---------------- A8. no tools in this view ----------------
    ctx, page, errs = open_claude(flags='window.__mockNoTools=true;', state=saved_state, viewport={'width': 1100, 'height': 800})
    page.wait_for_selector('.tabs')
    page.click('[data-act="tab"][data-tab="ask"]')
    page.wait_for_timeout(300)
    check(not page.locator('#ask-hint').is_visible(), 'A: agent hint hidden when tools are unavailable')
    page.fill('#ask-in', 'My investment club interview is next Thursday.')
    page.click('[data-act="ask-send"]')
    page.wait_for_function('[...document.querySelectorAll(".msg.coach .bubble")].pop().innerText.includes("three statements")', timeout=15000)
    last = [x for x in page.evaluate('window.__sampleLog') if x['kind'] == 'sample'][-1]
    check(last['tools'] is None and page.evaluate('window.__violations') == [], 'A: plain chat sends no tools')
    all_errs += errs
    ctx.close()

    # ---------------- A9. Claude blocked in the viewer ----------------
    ctx, page, errs = open_claude(flags='window.__mockNull=true;', state=saved_state, viewport={'width': 1100, 'height': 800})
    page.wait_for_selector('.tabs')
    page.wait_for_selector('.ai-off')
    check("isn't running in this page" in page.inner_text('#foot'), 'A: footer says Claude is not running')
    page.click('[data-act="tab"][data-tab="today"]')
    page.click('#lesson-bar a[data-act="handoff"]')
    href, q = handoff_q(page)
    check(href.startswith('https://claude.ai/new?q=') and LIB_FIRST.split(':')[0] in q, 'A: Make it about me opens a Claude chat with the lesson in the prompt')
    all_errs += errs
    ctx.close()

    # ---------------- A10. phone width + dark ----------------
    for scheme in ('light', 'dark'):
        ctx, page, errs = open_claude(state=saved_state, viewport={'width': 390, 'height': 844}, color_scheme=scheme, device_scale_factor=2)
        page.wait_for_selector('.tabs')
        for tab in ('today', 'plan', 'practice', 'scorecard', 'ask', 'setup'):
            page.click(f'[data-act="tab"][data-tab="{tab}"]')
            page.wait_for_timeout(120)
            no_hscroll(page, f'A: {tab} at 390px ({scheme})')
            if tab in ('today', 'practice') and scheme == 'dark':
                page.screenshot(path=str(SHOTS / f'a05-phone-{scheme}-{tab}.png'))
        if scheme == 'dark':
            check(page.evaluate('getComputedStyle(document.body).backgroundColor') != 'rgb(241, 244, 239)', 'A: dark background applied')
        all_errs += errs
        ctx.close()

    # ---------------- A11. exports, backup, erase, restore ----------------
    clip = 'Object.defineProperty(Navigator.prototype,"clipboard",{configurable:true,get:()=>({writeText:async t=>{window.__clip=String(t)}})});'
    n_answers = len(json.loads(saved_state)['answers'])
    ctx, page, errs = open_claude(flags=clip, state=saved_state, viewport={'width': 1200, 'height': 900})
    page.wait_for_selector('.tabs')
    page.click('[data-act="tab"][data-tab="setup"]')
    page.wait_for_selector('.more-tools')
    page.click('[data-act="copy-instr"]')
    instr = page.evaluate('window.__clip') or ''
    check(instr.startswith('You are my finance recruiting coach') and 'Wake Forest University' in instr, 'A: Claude Project export carries the rules and profile')
    page.click('[data-act="backup"]')
    code = page.evaluate('window.__clip') or ''
    check(code.startswith('FRC1:'), 'A: backup code copied')
    page.click('[data-act="erase"]')
    page.click('[data-act="erase-yes"]')
    page.wait_for_selector('#setup-form')
    check(state_of(page)['profile'] is None, 'A: erase returns to a fresh setup')
    page.click('.intro [data-act="restore-open"]')
    page.fill('#restore-in', code)
    page.click('[data-act="restore-go"]')
    page.wait_for_selector('.session-title')
    st = state_of(page)
    check(st['profile']['name'] == 'Jordan' and len(st['answers']) == n_answers, 'A: a backup code restores the plan and scores')
    all_errs += errs
    ctx.close()

    # =====================================================================
    # PART B: the website, served locally, no AI on the page
    # =====================================================================
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'docs')))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    BASE = f'http://127.0.0.1:{httpd.server_address[1]}/'

    # a stand-in for the browser's speech recognition, so voice answers can be tested headless
    FAKE_SR = r'''
    (function () {
      function R(text, fin) { var r = [{ transcript: text }]; r.isFinal = fin; return r; }
      function FakeSR() { window.__sr = this; }
      FakeSR.prototype.start = function () {
        var me = this, finals = [];
        me._t = [
          setTimeout(function () { me.onresult && me.onresult({ resultIndex: 0, results: [R('Um so the map of finance', false)] }); }, 80),
          setTimeout(function () { finals.push(R('Um so the map of finance has two sides, like, the sell side and the buy side.', true)); me.onresult && me.onresult({ resultIndex: 0, results: finals.slice() }); }, 160),
          setTimeout(function () { finals.push(R('Uh banks sell and investors buy.', true)); me.onresult && me.onresult({ resultIndex: 1, results: finals.slice() }); }, 240)
        ];
      };
      FakeSR.prototype.stop = function () { var me = this; setTimeout(function () { me.onend && me.onend(); }, 30); };
      window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
    })();'''

    def open_web(path='app.html', state=None, init='', clock=None, **kw):
        ctx = browser.new_context(accept_downloads=True, **kw)
        ctx.route(re.compile(r'fonts\.g'), lambda r: r.abort())
        pre = init + CATCH_HANDOFF
        if state is not None:
            pre += 'try{if(!sessionStorage.getItem("seeded")){localStorage.setItem("frc:v1",' + json.dumps(state) + ');sessionStorage.setItem("seeded","1")}}catch(e){};'
        ctx.add_init_script(pre)
        page = ctx.new_page()
        if clock:
            page.clock.install(time=clock)
        errs = []
        watch(page, errs)
        page.goto(BASE + path)
        return ctx, page, errs

    # ---------------- B1. home, library, lesson pages ----------------
    ctx, page, errs = open_web('', viewport={'width': 1280, 'height': 900})
    check(page.title() == 'Finance Recruiting Coach' and 'Walk into your first finance interview ready.' in page.inner_text('h1'), 'B: home page renders')
    check(page.locator('.ex-list li').count() >= 6 and page.locator('.lib-cards li').count() == 6, 'B: example plan and six featured lessons')
    check(page.locator('a.btn.primary[href="app.html"]').count() >= 2 and page.locator('meta[property="og:image"]').count() == 1, 'B: calls to action and share card meta')
    page.click('.faq-item summary >> nth=0')
    check(page.locator('.faq-item[open]').count() == 1, 'B: FAQ opens')
    page.screenshot(path=str(SHOTS / 'b01-home.png'))
    page.click('.site-nav a[href="library/"]')
    page.wait_for_selector('.lib-list')
    check(page.locator('.lib-list li').count() == 40 and page.locator('.lib-group').count() == 7, 'B: library lists 40 lessons in 7 groups')
    page.click('.lib-list a >> nth=0')
    page.wait_for_selector('.lesson-page')
    first_title = page.inner_text('h1.session-title')
    check(page.locator('details.sec-answers[open]').count() == 0 and page.locator('.sec-cold').count() == 1, 'B: a lesson page renders with answers hidden')
    page.click('details.sec-answers summary')
    page.wait_for_function('document.querySelector("details.sec-answers .reveal").textContent === "Hide"', timeout=3000)
    check(page.locator('details.sec-answers[open]').count() == 1, 'B: answers open with a Hide label')
    quiz = page.get_attribute('.cta-box a[href^="https://claude.ai/new?q="]', 'href') or ''
    check(urllib.parse.unquote(quiz).find(first_title) > 0, 'B: Quiz me in Claude carries the lesson title')
    page.click('.pg.next')
    page.wait_for_selector('.lesson-page')
    check(page.inner_text('h1.session-title') != first_title and page.locator('.pg.prev').count() == 1, 'B: pager moves to the next lesson')
    no_hscroll(page, 'B: lesson page at 1280px')
    page.goto(BASE + '404.html')
    check("That page isn't here." in page.inner_text('h1'), 'B: 404 page renders')
    all_errs += errs
    ctx.close()

    for scheme in ('light', 'dark'):
        ctx, page, errs = open_web('', viewport={'width': 390, 'height': 844}, color_scheme=scheme, device_scale_factor=2)
        no_hscroll(page, f'B: home at 390px ({scheme})')
        if scheme == 'dark':
            page.screenshot(path=str(SHOTS / 'b02-home-phone-dark.png'), full_page=True)
        page.goto(BASE + 'library/')
        no_hscroll(page, f'B: library at 390px ({scheme})')
        page.click('.lib-list a >> nth=8')
        page.wait_for_selector('.lesson-page')
        no_hscroll(page, f'B: lesson with a table at 390px ({scheme})')
        if scheme == 'light':
            page.screenshot(path=str(SHOTS / 'b03-lesson-phone.png'))
        all_errs += errs
        ctx.close()

    # ---------------- B2. the coach on the website ----------------
    ctx, page, errs = open_web(viewport={'width': 1280, 'height': 900}, init=FAKE_SR)
    page.wait_for_selector('#setup-form')
    check("You'll need a Claude account" in page.inner_text('.intro'), 'B: setup says up front that it needs a Claude account')
    page.fill('#f-school', 'Wake Forest University')
    page.click('a[data-act="handoff"][data-kind="dates"]')
    href, q = handoff_q(page)
    check(href.startswith('https://claude.ai/new?q=') and 'Wake Forest University' in q, 'B: Suggest dates in Claude opens a chat with the school in the prompt')
    page.fill('#f-school', '')
    fill_profile(page, with_suggest=False)
    page.click('#f-save')
    page.wait_for_selector('.session-title')
    check(page.inner_text('.session-title') == LIB_FIRST, 'B: day one is the written lesson')
    check(page.locator('#lesson-bar a[data-act="handoff"][data-kind="personalize"]').count() == 1, 'B: library lesson offers Make it about me in Claude')
    check(page.locator('#lg-go').inner_text() == 'Check my answer' and page.locator('a[data-act="handoff"][data-kind="grade"]').count() == 1, 'B: grading is a self-check plus Grade it in Claude')
    check("AI actions open in your own Claude chat" in page.inner_text('#foot'), 'B: footer explains where the AI comes from')
    # voice
    page.select_option('#lg-q', '1')
    page.click('[data-act="rec"][data-scope="lg"]')
    page.wait_for_selector('.rec-live')
    check(page.locator('[data-act="rec"][data-scope="lg"]').inner_text().strip() == 'Stop recording', 'B: recording starts')
    page.wait_for_function('document.querySelector("#lg-a").value.includes("investors buy")')
    page.click('[data-act="rec"][data-scope="lg"]')
    page.wait_for_selector('#lg-vs .vbox')
    vb = page.inner_text('#lg-vs .vbox')
    check('words' in vb and '3 fillers' in vb, 'B: delivery stats count words and fillers: ' + vb.replace('\n', ' / '))
    check(page.input_value('#lg-a').startswith('Um so the map of finance has two sides'), 'B: the transcript lands in the answer box')
    page.click('a[data-act="handoff"][data-kind="grade"]')
    href, q = handoff_q(page)
    check(href.startswith('https://claude.ai/new?q=') and 'investors buy' in q, 'B: Grade it in Claude sends the question and the answer')
    page.click('#lg-go')
    page.wait_for_selector('#lg-out .result.self')
    check(len(page.inner_text('#lg-out .result.self .better')) > 40 and page.locator('#lg-out .result.self .vbox').count() == 1, 'B: self-check shows the model answer and the delivery stats')
    page.click('#lg-out [data-act="self-score"][data-n="2"]')
    check('comes back for review tomorrow' in page.inner_text('#lg-out'), 'B: a 2 comes back tomorrow')
    page.screenshot(path=str(SHOTS / 'b04-app-today.png'))
    st = state_of(page)
    rec = st['answers'][-1]
    check(rec['score'] == 2 and rec.get('voice', {}).get('fillerCount') == 3, 'B: the logged answer keeps its voice stats')
    # calendar
    page.click('[data-act="tab"][data-tab="plan"]')
    with page.expect_download() as d:
        page.click('[data-act="cal"]')
    ics_path = d.value.path()
    ics = pathlib.Path(ics_path).read_bytes().decode('utf-8')
    info = page.inner_text('.cal-info')
    m = re.search(r'(\d+) sessions at 7:45 AM.*plus (\d+) key date', info.replace('\n', ' '))
    n_ev = ics.count('BEGIN:VEVENT')
    check(d.value.suggested_filename == 'recruiting-plan.ics' and m is not None and n_ev == int(m.group(1)) + int(m.group(2)), f'B: calendar file has every session and key date ({n_ev} events): ' + info[:80])
    check('T074500\r\n' in ics and all(len(l.encode()) <= 75 for l in ics.split('\r\n')), 'B: events start at the reminder time and lines fold at 75 octets')
    check((BASE + 'app.html#d-' + iso(0)) in ics.replace('\r\n ', ''), 'B: each event links back to its day in the app')
    page.click('[data-act="cal-close"]')
    # deep link from a calendar event
    page.goto('about:blank')
    page.goto(BASE + 'app.html#d-' + iso(2))
    page.wait_for_selector('.session-title')
    check(page.locator('.backlink').count() == 1 and 'What a stock actually is' in page.inner_text('.session-title'), 'B: a calendar link opens that day\'s session')
    page.click('.backlink')
    check(page.inner_text('.session-title') == LIB_FIRST, 'B: Back to today works')
    # a session with no written lesson hands off to Claude
    page.click('[data-act="tab"][data-tab="plan"]')
    page.click('[data-act="plan-expand"]')
    page.click('.week button.row:has-text("Warren Buffett")')
    page.wait_for_selector('.teach')
    check("isn't in the built-in lesson library yet" in page.inner_text('.teach'), 'B: an unwritten lesson explains that Claude will write it')
    page.click('.teach a[data-act="handoff"]')
    href, q = handoff_q(page)
    check(href.startswith('https://claude.ai/new?q=') and 'Warren Buffett' in q and len(href) < 4000, f'B: Teach me in Claude opens a chat with the lesson topic ({len(href)} chars)')
    # practice drill: self-check
    page.click('[data-act="tab"][data-tab="practice"]')
    page.wait_for_selector('.qcard .qtext')
    chips = page.locator('[data-act="dfilter"]').all_inner_texts()
    check(chips[0].startswith('Reviews due') and any(c.startswith('Wealth & AM') for c in chips), 'B: drill filters include reviews due and wealth and AM')
    page.click('[data-act="dfilter"][data-f="acc"]')
    page.wait_for_selector('.qcard .qtext')
    page.fill('#dg-a', 'Revenue minus expenses, then the balance sheet and cash flow link up.')
    page.click('#dg-go')
    page.wait_for_selector('#dg-out .result.self')
    check(len(page.inner_text('#dg-out .better')) > 60, 'B: drill self-check shows a written model answer')
    page.click('#dg-out [data-act="self-score"][data-n="4"]')
    check('Interviewers often follow up with' in page.inner_text('#dg-out'), 'B: the logged drill shows the usual follow-up')
    page.click('#dg-out [data-act="followup"]')
    # mock interview with written follow-ups and self-review
    page.click('[data-act="pmode"][data-mode="mock"]')
    check(page.locator('a[data-act="handoff"][data-kind="mock"]').count() == 1, 'B: mock offers a live run in Claude')
    page.click('[data-act="mock-start"]')
    fus = 0
    for i in range(5):
        page.wait_for_selector('#mk-a')
        page.fill('#mk-a', f'Web answer {i + 1}.')
        page.click('[data-act="mock-next"]')
        page.wait_for_timeout(80)
        if page.locator('.qcard .chip.input').count():
            fus += 1
            page.fill('#mk-a', f'Web follow-up {i + 1}.')
            page.click('[data-act="mock-next"]')
    page.wait_for_selector('.mq')
    check(fus == 5, f'B: every mock question came with its written follow-up ({fus})')
    check(page.locator('.mq').count() == 5 and page.locator('.mq details summary:has-text("Model answer")').count() == 5, 'B: review mode shows five answers with model answers')
    check(page.locator('[data-act="mock-save"]').is_disabled(), 'B: saving waits until every answer is scored')
    for i in range(5):
        page.click(f'[data-act="mock-self"][data-i="{i}"][data-n="{[4, 3, 5, 2, 4][i]}"]')
    page.click('[data-act="mock-save"]')
    page.wait_for_selector('.result .verdict')
    res_txt = page.text_content('.result')
    check('self-scored' in res_txt and 'You scored yourself 3.6' in res_txt, 'B: the self-scored mock is saved with its average: ' + res_txt[:120])
    page.screenshot(path=str(SHOTS / 'b05-mock-result.png'))
    # ask
    page.click('[data-act="tab"][data-tab="ask"]')
    page.wait_for_selector('#ask-in')
    page.fill('#ask-in', 'How do I network with alumni at Morgan Stanley?')
    page.click('.composer a[data-act="handoff"]')
    href, q = handoff_q(page)
    check('How do I network with alumni at Morgan Stanley?' in q and 'Wake Forest' in q, 'B: Ask in Claude carries the question and the student context')
    check(page.locator('.sugs a[data-act="handoff"]').count() == 4, 'B: suggested questions open in Claude')
    # scorecard
    page.click('[data-act="tab"][data-tab="scorecard"]')
    page.wait_for_selector('.tiles')
    check(page.locator('#trend svg').count() == 1 and page.locator('.weak-list li').count() >= 1, 'B: the scorecard fills from self-scores')
    web_state = state_of(page)
    all_errs += errs
    ctx.close()

    # ---------------- B3. tomorrow: the review comes due ----------------
    tomorrow = dt.datetime.combine(dt.date.today() + dt.timedelta(days=1), dt.time(10, 0))
    ctx, page, errs = open_web(state=json.dumps(web_state), clock=tomorrow, viewport={'width': 1280, 'height': 900})
    page.wait_for_selector('.tabs')
    page.click('[data-act="tab"][data-tab="today"]')
    page.wait_for_selector('.side')
    side = page.text_content('.side')
    check(re.search(r'Reviews · [1-9] due', side) is not None, 'B: the next day, missed questions are due: ' + side[side.find('Reviews'):][:60].replace('\n', ' '))
    page.click('[data-act="reviews-go"]')
    page.wait_for_selector('.qcard .qtext')
    check('Review 1 of' in page.inner_text('.qcard'), 'B: Start reviews opens the review queue')
    due_q = page.inner_text('.qcard .qtext')
    page.fill('#dg-a', 'Sell side advises and sells; buy side invests money.')
    page.click('#dg-go')
    page.wait_for_selector('#dg-out .result.self')
    check(len(page.inner_text('#dg-out .better')) > 3, 'B: a review of a lesson question still finds its written answer')
    page.click('#dg-out [data-act="self-score"][data-n="5"]')
    check(re.search(r'comes back for review on \w{3}, \w{3} \d+', page.inner_text('#dg-out')) is not None, 'B: passing a review pushes it out three days')
    all_errs += errs
    ctx.close()

    # ---------------- B4. the website at phone width, light and dark ----------------
    for scheme in ('light', 'dark'):
        ctx, page, errs = open_web(state=json.dumps(web_state), viewport={'width': 390, 'height': 844}, color_scheme=scheme, device_scale_factor=2, init=FAKE_SR)
        page.wait_for_selector('.tabs')
        for tab in ('today', 'plan', 'practice', 'scorecard', 'ask', 'setup'):
            page.click(f'[data-act="tab"][data-tab="{tab}"]')
            page.wait_for_timeout(120)
            no_hscroll(page, f'B: {tab} at 390px ({scheme})')
            if tab in ('today', 'practice') and scheme == 'light':
                page.screenshot(path=str(SHOTS / f'b06-phone-{scheme}-{tab}.png'))
        all_errs += errs
        ctx.close()

    httpd.shutdown()
    browser.close()

print('\n'.join(notes))
print('\nconsole/page errors:', json.dumps(all_errs, indent=1) if all_errs else 'none')
print('\nPROBLEMS:' if problems else '\nALL CHECKS PASSED', '\n'.join(problems))
print(f'\n{len(notes)} passed, {len(problems)} failed')
sys.exit(1 if problems or all_errs else 0)
