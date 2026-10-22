/* ==========================================================================
   Finance Recruiting Coach: voice answers
   Speech-to-text through the browser's own Web Speech API (Chrome, Edge, Safari),
   plus delivery stats: time, words per minute and filler words.
   stats() and verdicts() are pure; Recorder needs a browser.
   ========================================================================== */
const Voice = (() => {
  'use strict';
  // "um" and "uh" are often dropped by speech-to-text, so the count is a floor, not a measurement
  const FILLERS = [
    ['um', /\bu+m+\b/gi], ['uh', /\bu+h+\b/gi], ['like', /\blike\b(?!\s+(?:to|a|an|the|this|that|it)\b)/gi],
    ['you know', /\byou know\b/gi], ['I mean', /\bi mean\b/gi], ['sort of', /\bsort of\b/gi], ['kind of', /\bkind of\b/gi],
    ['basically', /\bbasically\b/gi], ['literally', /\bliterally\b/gi],
  ];

  function stats(text, seconds) {
    const t = String(text || '');
    const words = (t.match(/[A-Za-z0-9][A-Za-z0-9'’$%.,-]*/g) || []).length;
    const secs = Math.max(0, Math.round(seconds || 0));
    const wpm = secs >= 5 && words ? Math.round(words / (secs / 60)) : null;
    const fillers = FILLERS.map(([w, re]) => [w, (t.match(re) || []).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    return { seconds: secs, words, wpm, fillers, fillerCount: fillers.reduce((s, x) => s + x[1], 0) };
  }

  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  /* plain-English feedback on delivery; tone is 'good' or 'warn' */
  function verdicts(st) {
    const out = [];
    if (st.words < 8) return out;
    if (st.seconds > 90) out.push({ tone: 'warn', text: 'Ran ' + mmss(st.seconds) + '. Most answers should land in about 60 seconds.' });
    else if (st.seconds >= 40) out.push({ tone: 'good', text: 'Good length at ' + mmss(st.seconds) + '.' });
    else if (st.seconds >= 15) out.push({ tone: 'warn', text: 'Short at ' + mmss(st.seconds) + '. A full answer usually takes 45 to 75 seconds.' });
    if (st.wpm) {
      if (st.wpm > 175) out.push({ tone: 'warn', text: st.wpm + ' words a minute is fast. Slow down and land each point.' });
      else if (st.wpm < 105) out.push({ tone: 'warn', text: st.wpm + ' words a minute is slow. Cut the long pauses.' });
      else out.push({ tone: 'good', text: st.wpm + ' words a minute is a comfortable pace.' });
    }
    if (st.fillerCount >= 3) out.push({ tone: 'warn', text: st.fillerCount + ' filler words caught (' + st.fillers.slice(0, 3).map(f => f[0] + ' ×' + f[1]).join(', ') + '). Pause instead.' });
    else if (st.words >= 40) out.push({ tone: 'good', text: st.fillerCount ? 'Only ' + st.fillerCount + ' filler word' + (st.fillerCount === 1 ? '' : 's') + ' caught.' : 'No filler words caught.' });
    return out;
  }

  function supported() {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /* handlers: { onText(text), onEnd({text, seconds}), onError(code) } */
  function Recorder(handlers) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null, finalText = '', interim = '', startedAt = 0, stopping = false, restarts = 0, ended = false;
    const done = () => {
      if (ended) return;
      ended = true;
      handlers.onEnd({ text: (finalText + interim).replace(/\s+/g, ' ').trim(), seconds: (Date.now() - startedAt) / 1000 });
    };
    function wire(r) {
      r.onresult = e => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript.trim() + ' ';
          else interim += res[0].transcript;
        }
        handlers.onText((finalText + interim).replace(/\s+/g, ' ').trim());
      };
      r.onerror = e => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        stopping = true;
        handlers.onError(e.error || 'error');
      };
      // Chrome ends a session after a pause; keep listening until the student presses Stop
      r.onend = () => {
        if (!stopping && restarts < 30) {
          restarts++;
          try { r.start(); return; } catch (err) { /* fall through */ }
        }
        done();
      };
    }
    return {
      start(lang) {
        rec = new SR();
        rec.lang = lang || (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
        finalText = ''; interim = ''; startedAt = Date.now(); stopping = false; restarts = 0; ended = false;
        wire(rec);
        rec.start();
      },
      stop() { stopping = true; try { rec.stop(); } catch (e) { done(); } },
      elapsed() { return startedAt ? (Date.now() - startedAt) / 1000 : 0; },
    };
  }

  return { stats, verdicts, supported, Recorder, mmss };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Voice;
