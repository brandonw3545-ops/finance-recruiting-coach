/* ==========================================================================
   Finance Recruiting Coach: calendar export
   Turns a plan into an .ics file that Google Calendar and Apple Calendar import:
   one timed event per study day (with a reminder) and an all-day event per key date.
   Pure functions, no DOM.
   ========================================================================== */
const Calendar = (() => {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const bytes = s => (enc ? enc.encode(s).length : unescape(encodeURIComponent(s)).length);

  function stampUTC(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  // floating local time: the event happens at 9:30 wherever the student is
  function floating(isoDate, hhmm, plusMinutes) {
    const [y, m, d] = isoDate.split('-').map(Number), [hh, mm] = hhmm.split(':').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d, hh, mm + (plusMinutes || 0)));
    return t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + 'T' + pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + '00';
  }
  const dateOnly = isoDate => isoDate.replace(/-/g, '');
  function nextDay(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + 1));
    return t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate());
  }
  function escText(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  // RFC 5545: lines longer than 75 octets continue on the next line after a space
  function fold(line) {
    if (bytes(line) <= 75) return line;
    let out = '', cur = '', n = 0, limit = 75;
    for (const ch of line) {
      const b = bytes(ch);
      if (n + b > limit) { out += cur + '\r\n '; cur = ''; n = 0; limit = 74; }
      cur += ch; n += b;
    }
    return out + cur;
  }
  const slugId = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'date';

  const KIND = { lesson: 'Lesson', drill: 'Drill', mock: 'Mock interview', prep: 'Prep session', firm: 'Firm deep-dive', rev: 'Rewind' };

  /* opts: { time 'HH:MM', minutes, from 'YYYY-MM-DD', link(date) => url, now Date, name } */
  function buildICS(plan, opts) {
    opts = opts || {};
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(opts.time || '') ? opts.time : '09:30';
    const minutes = opts.minutes || 20, from = opts.from || plan.start;
    const stamp = stampUTC(opts.now || new Date());
    const link = typeof opts.link === 'function' ? opts.link : () => '';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Finance Recruiting Coach//Plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escText(opts.name || 'Recruiting coach')];
    let sessions = 0, dates = 0;
    plan.items.filter(it => it.date >= from).forEach(it => {
      const url = link(it.date);
      L.push('BEGIN:VEVENT',
        'UID:session-' + it.date + '@finance-recruiting-coach',
        'DTSTAMP:' + stamp,
        'DTSTART:' + floating(it.date, time),
        'DTEND:' + floating(it.date, time, minutes),
        'SUMMARY:' + escText('Coach: ' + it.title),
        'DESCRIPTION:' + escText((KIND[it.kind] || 'Session') + ' · day ' + it.day + ' of ' + plan.total + (it.event ? ' · for ' + it.event.name : '') + (url ? '\nOpen it: ' + url : '')),
        ...(url ? ['URL:' + url] : []),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escText("Today's recruiting session"), 'TRIGGER:PT0M', 'END:VALARM',
        'END:VEVENT');
      sessions++;
    });
    (plan.events || []).filter(e => e.date >= from).forEach(e => {
      L.push('BEGIN:VEVENT',
        'UID:date-' + e.date + '-' + slugId(e.name) + '@finance-recruiting-coach',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + dateOnly(e.date),
        'DTEND;VALUE=DATE:' + nextDay(e.date),
        'SUMMARY:' + escText(e.name + (e.est ? ' (estimated date)' : '')),
        'DESCRIPTION:' + escText('Key date from your recruiting plan.' + (e.note ? '\n' + e.note : '')),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escText('Tomorrow: ' + e.name), 'TRIGGER:-PT15H', 'END:VALARM',
        'END:VEVENT');
      dates++;
    });
    L.push('END:VCALENDAR');
    return { text: L.map(fold).join('\r\n') + '\r\n', sessions, dates };
  }

  return { buildICS, fold, escText };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Calendar;
