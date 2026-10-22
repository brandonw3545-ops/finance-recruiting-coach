/* ==========================================================================
   Finance Recruiting Coach: Markdown for lessons
   Pure functions, no DOM. The app and the static lesson pages both render
   through here, so a lesson looks the same everywhere.
   ========================================================================== */
const MD = (() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

  function mdInline(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
    t = t.replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }
  const ITEM_RE = /^(\s*)([-*+]|\d+[.)]|[a-z][.)])\s+(.*)$/;
  const indentOf = l => (/^\s*/.exec(l)[0].replace(/\t/g, '    ').length);
  function parseList(lines, i) {
    const base = indentOf(lines[i]);
    const first = ITEM_RE.exec(lines[i]);
    const marker = first[2];
    const ordered = /^\d/.test(marker), lettered = /^[a-z]/.test(marker);
    const startN = ordered ? parseInt(marker, 10) : 1;
    const items = [];
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*$/.test(l)) {
        let j = i + 1;
        while (j < lines.length && /^\s*$/.test(lines[j])) j++;
        if (j < lines.length && ITEM_RE.test(lines[j]) && indentOf(lines[j]) >= base) { i = j; continue; }
        break;
      }
      const ind = indentOf(l), m = ITEM_RE.exec(l);
      if (m && ind === base) { items.push({ text: m[3], sub: '' }); i++; continue; }
      if (m && ind > base && items.length) { const r = parseList(lines, i); items[items.length - 1].sub += r.html; i = r.next; continue; }
      if (!m && items.length && !/^\s*(#{1,6}\s|>|```|\|)/.test(l)) { items[items.length - 1].text += ' ' + l.trim(); i++; continue; }
      break;
    }
    const tag = (ordered || lettered) ? 'ol' : 'ul';
    const attrs = lettered ? ' type="a"' : (ordered && startN !== 1 ? ' start="' + startN + '"' : '');
    return { html: '<' + tag + attrs + '>' + items.map(it => '<li>' + mdInline(it.text) + it.sub + '</li>').join('') + '</' + tag + '>', next: i };
  }
  function mdBlocks(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    let html = '', i = 0;
    const para = [];
    const flush = () => { if (para.length) { html += '<p>' + mdInline(para.join(' ')) + '</p>'; para.length = 0; } };
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { flush(); i++; continue; }
      if (/^\s*```/.test(line)) {
        flush(); const buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; html += '<pre><code>' + esc(buf.join('\n')) + '</code></pre>'; continue;
      }
      const m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) { flush(); const lv = Math.min(6, m[1].length + 2); html += '<h' + lv + '>' + mdInline(m[2]) + '</h' + lv + '>'; i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); html += '<hr>'; i++; continue; }
      if (/^\s*>/.test(line)) {
        flush(); const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        html += '<blockquote>' + mdBlocks(buf.join('\n')) + '</blockquote>'; continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flush(); const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
        const head = cells(rows[0]), body = rows.slice(2).map(cells);
        html += '<div class="tbl"><table><thead><tr>' + head.map(h => '<th>' + mdInline(h) + '</th>').join('') + '</tr></thead><tbody>' +
          body.map(r => '<tr>' + r.map(c => '<td>' + mdInline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
        continue;
      }
      if (ITEM_RE.test(line)) { flush(); const r = parseList(lines, i); html += r.html; i = r.next; continue; }
      para.push(line.trim()); i++;
    }
    flush();
    return html;
  }
  function splitSections(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    let title = '', cur = null;
    const intro = [], secs = [];
    for (const l of lines) {
      const h1 = /^#\s+(.+)$/.exec(l), h2 = /^##\s+(.+)$/.exec(l);
      if (h1 && !title && !cur) { title = h1[1].trim(); continue; }
      if (h2) { cur = { head: h2[1].replace(/\*\*/g, '').trim(), lines: [] }; secs.push(cur); continue; }
      (cur ? cur.lines : intro).push(l);
    }
    return { title, intro, secs };
  }
  const SEC_KINDS = [['cold open', 'cold'], ['big idea', 'idea'], ['how it works', 'how'], ['real world', 'world'], ['trap', 'trap'], ['your line', 'line'], ['your turn', 'turn'], ['answers', 'answers'], ['warm-up', 'warm'], ['the set', 'set'], ['stretch', 'stretch']];
  const secKind = h => { const l = h.toLowerCase(); const f = SEC_KINDS.find(k => l.includes(k[0])); return f ? f[1] : 'gen'; };

  /* A lesson as sections. opts.open shows the answers; opts.headingTag picks h2/h3 for section labels. */
  function renderLesson(md, opts) {
    opts = opts || {};
    md = String(md || '').replace(/^\s*```(?:markdown|md)?[ \t]*\n/, '').replace(/\n```\s*$/, '');
    const { intro, secs } = splitSections(md);
    const tag = opts.headingTag || 'h2';
    let h = '';
    const introTxt = intro.join('\n').trim();
    if (introTxt) h += '<div class="lesson-intro">' + mdBlocks(introTxt) + '</div>';
    secs.forEach(s => {
      const k = secKind(s.head), body = mdBlocks(s.lines.join('\n'));
      if (k === 'answers') h += '<details class="sec sec-answers"' + (opts.open ? ' open' : '') + '><summary><span class="sec-label">' + mdInline(s.head) + '</span><span class="reveal">' + (opts.open ? 'Hide' : 'Show') + '</span></summary><div class="sec-body">' + body + '</div></details>';
      else h += '<section class="sec sec-' + k + '"><' + tag + ' class="sec-label">' + mdInline(s.head) + '</' + tag + '><div class="sec-body">' + body + '</div></section>';
    });
    return h;
  }

  const strip = s => String(s).replace(/\*\*|__|`/g, '').replace(/^\s*[*_]+|[*_]+\s*$/g, '').replace(/^["“'‘]+|["”'’]+$/g, '').replace(/\s+/g, ' ').trim();
  const cutQ = s => { const k = s.indexOf('?'); return k > 10 ? s.slice(0, k + 1) : s; };
  const firstLine = lines => lines.map(x => x.trim().replace(/^>\s*/, '')).find(x => x && !/^[-*_]{3,}$/.test(x)) || '';

  /* The questions a lesson asks: cold open, say it out loud, rapid fire a-c, rewind, brain teaser
     (and the numbered questions of drills and prep sessions). */
  function lessonQuestions(md) {
    const { secs } = splitSections(md);
    const out = [];
    const topItems = lines => { const r = []; lines.forEach(l => { const m = ITEM_RE.exec(l); if (m && m[1].length < 2) r.push(m[3]); }); return r; };
    const boldLead = s => { const m = /^\*\*(.+?)\*\*/.exec(s.trim()); return m && m[1].length > 12 && !/:\s*$/.test(m[1]) ? m[1] : null; };
    secs.forEach(s => {
      const h = s.head.toLowerCase();
      if (h.includes('cold open')) {
        const l = firstLine(s.lines);
        const quoted = /^\**\s*["“]([^"”]{12,})["”]/.exec(l);     // "Walk me through a DCF." Answer it out loud...
        if (l) out.push({ label: 'Cold open', q: strip(quoted ? quoted[1] : cutQ(strip(l))) });
      } else if (h.includes('your turn')) {
        const L = s.lines;
        for (let i = 0; i < L.length; i++) {
          const m = ITEM_RE.exec(L[i]);
          if (!m || m[1].length >= 2 || /^[a-z][.)]$/.test(m[2])) continue;
          const lm = /^\**\s*(say it out loud|rapid[- ]fire|rewind|brain teaser)\s*:?\s*\**\s*:?\s*(.*)$/i.exec(m[3].trim());
          if (!lm) continue;
          const kind = lm[1].toLowerCase().replace('-', ' '), rest = lm[2].trim();
          if (kind === 'rapid fire') {
            const subs = [];
            for (let j = i + 1; j < L.length; j++) {
              const sm = ITEM_RE.exec(L[j]);
              if (!sm) continue;
              if (sm[1].length >= 2 || /^[a-z][.)]$/.test(sm[2])) subs.push(sm[3]); else break;
            }
            if (!subs.length && rest) rest.split(/\s*\(?\b[a-c][.)]\s+/).map(x => x.trim()).filter(x => x.length > 3).forEach(x => subs.push(x));
            subs.slice(0, 3).forEach((q, k) => out.push({ label: 'Rapid fire ' + 'abc'[k], q: strip(cutQ(strip(q))) }));
          } else if (rest) {
            const label = kind === 'say it out loud' ? 'Say it out loud' : kind === 'rewind' ? 'Rewind' : 'Brain teaser';
            out.push({ label, q: strip(label === 'Say it out loud' ? rest : cutQ(strip(rest))) });
          }
        }
      } else if (/warm-up|the set|stretch|questions you|likely questions|questions they might ask/.test(h)) {
        const label = s.head.replace(/[*#]/g, '').trim();
        let items = topItems(s.lines);
        if (!items.length) { const l = firstLine(s.lines); if (l) items = [l]; }
        items.forEach((it, i) => { const b = boldLead(it); out.push({ label: items.length > 1 ? label + ' ' + (i + 1) : label, q: strip(b || cutQ(it)) }); });
      }
    });
    const seen = new Set();
    return out.filter(o => o.q.length > 10 && !seen.has(o.q) && seen.add(o.q)).map(o => ({ label: o.label, q: trunc(o.q, 500) })).slice(0, 16);
  }

  /* Model answers inside a written lesson, keyed by the labels lessonQuestions() uses.
     Cold open: the blockquote under "The interview trap". The rest: bold-labelled items under "Answers"
     ("**Say it out loud:**", "**a.**", "**Rewind:**", "**Brain teaser:**"). */
  function lessonAnswers(md) {
    const { secs } = splitSections(md);
    const out = {};
    secs.forEach(s => {
      const h = s.head.toLowerCase();
      if (h.includes('trap')) {
        const q = s.lines.filter(l => /^\s*>/.test(l)).map(l => l.replace(/^\s*>\s?/, '')).join(' ').replace(/\s+/g, ' ').trim();
        if (q) out['Cold open'] = q;
      } else if (h === 'answers' || h.startsWith('answers')) {
        const items = [];
        s.lines.forEach(l => {
          const m = ITEM_RE.exec(l);
          if (m && m[1].length < 2) items.push(m[3]);
          else if (items.length && l.trim() && !/^\s*#/.test(l)) items[items.length - 1] += ' ' + l.trim();
        });
        items.forEach(it => {
          const m = /^\*\*\s*([^*]+?)\s*\*\*\s*:?\s*(.*)$/.exec(it.trim());
          if (!m) return;
          const lab = m[1].replace(/[:.)]\s*$/, '').trim().toLowerCase(), body = m[2].trim();
          let key = null;
          if (/^say it out loud/.test(lab)) key = 'Say it out loud';
          else if (/^(rapid fire )?([abc])$/.test(lab)) key = 'Rapid fire ' + /([abc])$/.exec(lab)[1];
          else if (/^rewind/.test(lab)) key = 'Rewind';
          else if (/^brain teaser/.test(lab)) key = 'Brain teaser';
          else if (/^cold open/.test(lab)) key = 'Cold open';
          if (key && body) out[key] = body;
        });
      }
    });
    return out;
  }

  return { esc, trunc, mdInline, ITEM_RE, indentOf, parseList, mdBlocks, splitSections, secKind, renderLesson, lessonQuestions, lessonAnswers };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MD;
