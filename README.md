# Finance Recruiting Coach

A free coach for college students recruiting for finance clubs and internships. You plug in your school, the seats you want, your goals and the dates that matter. It builds a day-by-day plan to the date you want to be interview-ready, teaches a lesson a day, has you answer questions out loud, brings back the ones you miss, and runs mock interviews.

- **Website:** https://brandonw3545-ops.github.io/finance-recruiting-coach/ (free; you'll need a Claude account, and the free plan works)
- **Claude version:** https://claude.ai/artifact/3QqSwrzAPJCeFJCW95Kayn (the same coach running inside Claude, with in-page grading and a chat coach that can edit your plan)

## Two versions, one codebase

| | Website | Claude version |
|---|---|---|
| Plan, key dates, prep sessions | ✓ | ✓ |
| 40 written lessons | ✓ | ✓, and Claude can personalize any of them |
| Lessons not in the library yet | Open in your own Claude chat, with your plan in the prompt | Written in the page |
| Grading | Score yourself against model answers, or grade it in Claude | Claude grades it in the page, or score yourself |
| Mock interviews | Written follow-ups, then you score yourself against model answers | The interviewer reacts to what you said, then grades the whole interview |
| Voice answers (time, pace, filler words) | ✓ | — (the Claude viewer can't use the microphone) |
| Calendar reminders (.ics) | ✓ | — (the Claude viewer can't save .ics files) |
| Spaced repetition | ✓ | ✓ |
| Chat coach | Opens in your own Claude chat | In the page, and it can add or move dates in your plan |

The website runs no AI and has no server. Anything that needs AI opens `claude.ai/new?q=…` with the prompt filled in, so it runs on the visitor's own Claude account (a free one works). That link format isn't an official API, so long prompts fall back to "copy, then open Claude".

Everything a student enters stays in their browser's localStorage. **Setup → Your data** has a backup code for moving to another device.

## What's where

```
content/lessons/*.md     the written lessons (one Markdown file each)
content/answers.md       model answers and usual follow-ups for the practice question bank
src/engine.js            topic bank, question bank, plan builder, spaced-repetition schedule (pure functions)
src/md.js                Markdown renderer shared by the app and the lesson pages
src/prompts.js           every prompt sent to Claude, in the page or through a hand-off link
src/calendar.js          the .ics export
src/voice.js             speech-to-text wrapper and delivery stats
src/app.js, styles.css   the app
src/site.css             the home page and lesson library
src/answers.js           generated from content/answers.md (don't edit)
build.mjs                builds everything below
docs/                    the website (GitHub Pages serves this folder)
dist/finance-recruiting-coach.html   the Claude version, published as a claude.ai artifact
assets/og.png            the link-preview image
tests/                   unit tests and a browser run of both versions
```

## How the plan works

`buildPlan(profile)` in `src/engine.js` picks from about 175 topics and:

- weights categories by the seats you want and how strong you already are,
- splits the time into phases (Foundations, Reps, Interview mode, Recruiting season, or one Sprint if there's less than about three weeks),
- puts prep before every key date: a week before an application, five days before a club application or interview, the day before an info session, and for a real interview a prep session, a mock the day before and a warm-up on the day,
- spaces mock interviews by how many days a week you study,
- adds a "Why us?" deep-dive for each firm on your list, and Rewinds that re-teach your weakest answers.

**Spaced repetition:** any answer you score 3 or lower comes back the next day. Pass it on or after its due date and it moves out to 3 days, then 7, then 14, then it retires. Miss it again and it starts over.

## Adding a lesson

1. Pick a topic from `RAW_TOPICS` in `src/engine.js` and copy its title exactly.
2. Create `content/lessons/NN-short-name.md`:

```markdown
---
topic: <exact topic title>
---
# <exact topic title>
*Comes up in:* where interviewers ask this.

## Cold open
"The interview question."

Answer it out loud before you read on.

## The big idea
## How it works
## In the real world
## The interview trap
(end with the model answer as a > quote)
## Your line
## Your turn
1. **Say it out loud:** …
2. **Rapid fire:**
   a. …
   b. …
   c. …
3. **Rewind:** a question on an earlier topic
4. **Brain teaser:** …

## Answers
- **Say it out loud:** …
- **a.** …
- **b.** …
- **c.** …
- **Rewind:** …
- **Brain teaser:** …
```

3. Run `node build.mjs`. It stops with a clear message if the title doesn't match, a section or answer is missing, or the lesson is too short or long (450 to 1,400 words before the answers). Each lesson gets its own page in the library and replaces the "open in Claude" step for that topic.

Model answers for the practice questions live in `content/answers.md`: a `## ` heading with the question's exact text from `RAW_QUESTIONS`, the answer in Markdown, and a last line `**Follow-up:** …`.

## Build and test

```bash
node build.mjs                    # builds docs/ and dist/, checks every lesson and answer
node tests/engine.test.js         # plan engine and spaced repetition
node tests/units.test.js          # calendar, voice stats, Markdown, lesson content
pip install playwright && python -m playwright install chromium
python3 tests/e2e.py              # both versions in a real browser
```

The browser run drives the Claude version against a stand-in for Claude's runtime (`tests/mock-claude-runtime.js`, which rejects malformed calls the way the real one does), then serves `docs/` locally and goes through the website: lesson pages, setup, self-checks, a fake microphone, the calendar download, a mock interview, reviews coming due the next day, phone width and dark mode.

## Publishing

- **Website:** commit and push. GitHub Pages serves `docs/` from `main`.
- **Claude version:** publish `dist/finance-recruiting-coach.html` as a claude.ai artifact with the `sample` capability (`capabilities: {sample: {}}`).

## Limits

- Lessons use well-documented examples. For anything that changes week to week (rates, the market, a firm's deadlines), they tell you what to look up. Suggested recruiting dates are estimates; confirm them with your career center and the firm's site.
- 40 of the roughly 175 topics have written lessons so far. The rest open in Claude on the website.
- Progress lives in one browser unless you move it with a backup code.
- Voice answers need Chrome, Edge or Safari. In Chrome, the audio goes to Google for transcription.

Not affiliated with any bank, school or Anthropic.
