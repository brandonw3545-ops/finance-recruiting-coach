/* ==========================================================================
   A small QR code encoder for the live room's join link: byte mode, error correction
   level M, versions 1 to 10 (up to 213 bytes). No dependencies. QR.svg(text) returns
   an SVG string, or '' if the text is too long.
   ========================================================================== */
const QR = (() => {
  'use strict';
  // per version (index 1..10) at level M: error-correction codewords per block, then [blocks, data codewords] groups
  const EC = [null, [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]], [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const dataCodewords = v => EC[v].slice(1).reduce((s, g) => s + g[0] * g[1], 0);

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(degree) {
    const res = new Array(degree).fill(0); res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) { res[j] = gfMul(res[j], root); if (j + 1 < degree) res[j] ^= res[j + 1]; }
      root = gfMul(root, 2);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    const res = divisor.map(() => 0);
    data.forEach(b => {
      const f = b ^ res.shift();
      res.push(0);
      divisor.forEach((c, i) => { res[i] ^= gfMul(c, f); });
    });
    return res;
  }
  function utf8(text) {
    const s = unescape(encodeURIComponent(String(text))), out = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function matrix(text, forceMask) {
    const bytes = utf8(text);
    let v = 0;
    for (let k = 1; k <= 10; k++) { if (bytes.length + (k < 10 ? 2 : 3) <= dataCodewords(k)) { v = k; break; } }
    if (!v) return null;
    const cap = dataCodewords(v);

    // the bit stream: mode, length, bytes, terminator, padding
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    for (let pad = 0xEC; data.length < cap; pad ^= 0xEC ^ 0x11) data.push(pad);

    // split into blocks, add error correction, interleave
    const ecLen = EC[v][0], div = rsDivisor(ecLen), blocks = [];
    let at = 0;
    EC[v].slice(1).forEach(g => { for (let b = 0; b < g[0]; b++) { const d = data.slice(at, at + g[1]); at += g[1]; blocks.push({ d, e: rsRemainder(d, div) }); } });
    const stream = [];
    const longest = Math.max.apply(null, blocks.map(b => b.d.length));
    for (let i = 0; i < longest; i++) blocks.forEach(b => { if (i < b.d.length) stream.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach(b => stream.push(b.e[i]));

    // function patterns
    const size = v * 4 + 17;
    const mod = [], fn = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const set = (x, y, dark) => { mod[y][x] = !!dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = ALIGN[v], last = al.length - 1;
    al.forEach((cx, i) => al.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const drawFormat = mask => {
      const d = mask;                       // level M is 00, so the data is just the mask number
      let rem = d << 10;
      for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
      const f = ((d << 10) | rem) ^ 0x5412, bit = i => (f >>> i) & 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (v >= 7) {
      let rem = v << 12;
      for (let i = 17; i >= 12; i--) if ((rem >>> i) & 1) rem ^= 0x1F25 << (i - 12);
      const vb = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const b = (vb >>> i) & 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
    }

    // data, in the zigzag from the bottom right
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && k < stream.length * 8) { mod[y][x] = ((stream[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
      }
    }

    // try all eight masks and keep the one a scanner will find easiest
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = get => {
        for (let a = 0; a < size; a++) {
          let run = 1, hist = 0;
          for (let b = 0; b < size; b++) {
            const cur = get(a, b);
            hist = ((hist << 1) | (cur ? 1 : 0)) & 0x7FF;
            if (b >= 10 && (hist === 0x5D0 || hist === 0x05D)) p += 40;
            if (b > 0) { if (cur === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
          }
        }
      };
      line((a, b) => mod[a][b]); line((a, b) => mod[b][a]);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x + 1 < size && y + 1 < size && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
      }
      const total = size * size;
      return p + Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
    if (forceMask >= 0 && forceMask < 8) best = forceMask;
    applyMask(best); drawFormat(best);
    return { size, version: v, mask: best, rows: mod };
  }

  function svg(text, opts) {
    const m = matrix(text);
    if (!m) return '';
    const q = (opts && opts.margin != null) ? opts.margin : 4, n = m.size + q * 2;
    let d = '';
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (!m.rows[y][x]) continue;
        let w = 1; while (x + w < m.size && m.rows[y][x + w]) w++;
        d += 'M' + (x + q) + ' ' + (y + q) + 'h' + w + 'v1h-' + w + 'z';
        x += w - 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  return { matrix, svg };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = QR;
