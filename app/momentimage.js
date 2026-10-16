// app/momentimage.js: W6 (Y-6, REVIEW-2026-10-14 opportunity 14): SAVE IMAGE, THE MOMENT as a 1200×630 PNG to share. Loaded
// on demand when the end card's button is pressed (app/endcard.js, once YOUR CARD is made). On it: the daily's number and
// date (a Hard day's name, else the seed), the score and its letter, the tags; the moment's frequency, its lowest second
// marked and the NO GUARD and PAR lines as on the card (render/charts.js plotMoment); the extreme in big figures, the fall
// with no GUARD under it; what caught it, as a stack in the order it acts (K-15); the closing line (Y-7) and the link.
// It is public like the share card, so it keeps the card's rule (app/share.js lintCard): every line of words passes the
// lint or is left off, and the trace has no time axis, only a bar a minute long. The battery's own response is "fast
// response" and the relays' "homes cut off": "battery" and "relay" are the lint's spoiler words. Canvas 2D only; saved
// as DOWNLOAD REPLAY LOG is (a Blob, a.download and a toast).

import {COL, CAUGHT_STYLE, plotMoment} from '../render/charts.js';
import {mw} from '../render/format.js';
import {lintCard, SHARE_URL} from './share.js';

/** Y-6: the picture's size, a link preview's (og:image) shape. */
export const IMAGE_W = 1200, IMAGE_H = 630;
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif', MONO = 'ui-monospace, "Cascadia Mono", Consolas, "SF Mono", monospace';
const PAD = 48, SIDE = 820, K = 2;   // (K: the trace's text at 22px)
/** Y-6: the trace's box on the picture (its time axis, below it, carries only the minute bar). */
export const PLOT = Object.freeze({x0: PAD + 70, x1: 780, y0: 192, y1: 536});

/** Y-6: what caught it, in the order it acts, in words the share card's lint passes: [catch key, name, colour]. */
export const CATCH_WORDS = Object.freeze([['inertiaMW', 'spin'], ['batteryMW', 'fast response'], ['guardMW', 'YOUR GUARD'],
  ['governorsMW', 'governors'], ['loadReliefMW', 'load relief'], ['inverterMW', 'inverters backing off'], ['uflsMW', 'homes cut off']]
  .map(([k, name]) => Object.freeze([k, name, CAUGHT_STYLE[k] ? CAUGHT_STYLE[k][1] : COL.amber])));

/** Y-6: a trip's catch as the stack's rows, {name, mw, col, you}, 5 MW or more each (app/verdict.js caughtText's floor). */
export function catchRows(c) {
  if (!c || !c.caught) return [];
  const sign = c.lostMW >= 0 ? 1 : -1;
  return CATCH_WORDS.map(([k, name, col]) => ({name, mw: sign * (c.caught[k] || 0), col, you: k === 'guardMW'})).filter(r => r.mw >= 5);
}

/**
 * Y-6: the picture's words from a finished day's end (game.end: its share card, grade and verdict's moment). Each line
 * made from the day goes through the share card's lint, and one that fails is left off ('' and in `dropped`), so nothing
 * on the picture can spoil a day; the fixed words pass it (tests/momentimage.test.js lints every word drawn).
 * @returns {{title, day, score, tags, big, bigLabel, noGuard, note, rows, closing, refs, rise, dropped}}
 */
export function imageText(end) {
  const s = end.share, m = end.verdict.moment, g = end.grade, n = m.numbers, c = m.cont, rise = !!c && c.lostMW < 0, dropped = [];
  const ok = t => { if (!t) return ''; if (lintCard(t).length) { dropped.push(t); return ''; } return t; };
  const day = (s.lines[0] || '').split(' · ')[1] || '';   // (shareCard's head: GRIDWATCH #n · the day · the score · the tags)
  const margin = m.kind === 'margin' && Number.isFinite(n.r5MW);
  return {title: ok('GRIDWATCH' + (s.n ? ' #' + s.n : '')), day: ok(day), rise, dropped, rows: catchRows(c),
    score: ok(g ? g.points + ' ' + g.letter + (g.star ? ' ★' : '') : 'no score'),
    tags: ok([end.perfect && 'PERFECT', ...(s.tags || [])].filter(Boolean).join(' · ')),
    big: ok(margin ? mw(n.r5MW) + ' MW' : Number.isFinite(n.extremeHz) ? n.extremeHz.toFixed(2) + ' Hz' : ''),
    bigLabel: margin ? 'SPARE IN 5 MIN' : rise ? 'HIGHEST' : 'LOWEST',
    noGuard: ok(Number.isFinite(n.noGuardHz) ? 'With no GUARD: ' + n.noGuardHz.toFixed(2) + ' Hz' : ''),
    note: ok(margin ? 'for a ' + mw(n.riskMW) + ' MW risk: the day\'s thinnest margin' : !c && m.kind === 'shed' ? 'The city desk cut load to hold it.' : ''),
    closing: ok(s.closing ? '"' + s.closing + '"' : ''),
    refs: [{hz: n.noGuardHz, label: 'NO GUARD', col: COL.pink}, {hz: n.parHz, label: 'PAR', col: COL.grey}]};
}

/** Y-6: the file's name: the daily's number, else the seed (no clock time: the name travels with the picture). */
export function imageName(end) {
  const n = end.share && end.share.n;
  return 'gridwatch-' + (n ? 'daily-' + n : 'seed-' + end.seed) + '-moment.png';
}

/** Y-6: draw the picture onto `canvas` (sized here, IMAGE_W × IMAGE_H, no devicePixelRatio). Returns imageText's words. */
export function drawImage(canvas, end) {
  canvas.width = IMAGE_W; canvas.height = IMAGE_H;
  const ctx = canvas.getContext('2d'), t = imageText(end), m = end.verdict.moment;
  const put = (s, x, y, font, col, align = 'left') => {
    if (s) { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align; ctx.fillText(s, x, y); }
  };
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);
  ctx.textBaseline = 'alphabetic';
  // the head: the day on the left, the score on the right
  put(t.title, PAD, 80, '700 44px ' + SANS, COL.bright);
  const head = [t.day, t.tags].filter(Boolean).join(' · ');
  put(head, PAD, 118, fitted(ctx, head, IMAGE_W - 2 * PAD, 24), COL.text);
  put(t.score, IMAGE_W - PAD, 92, '700 64px ' + MONO, COL.bright, 'right');
  ctx.fillStyle = COL.grid; ctx.fillRect(PAD, 140, IMAGE_W - 2 * PAD, 2);
  put('THE MOMENT', PAD, 176, '700 20px ' + SANS, COL.axis);
  // the trace (render/charts.js: its own text in the middle baseline)
  plotMoment(ctx, PLOT, m.trace, t.refs, {rise: t.rise, k: K, markHz: m.numbers.extremeHz});
  ctx.textBaseline = 'alphabetic';
  // the side: the extreme, with no GUARD; what caught it, a bar and a row each (at most seven: they fit above the foot)
  const sw = IMAGE_W - PAD - SIDE;
  let y = 200;
  put(t.bigLabel, SIDE, y, '700 20px ' + SANS, COL.axis);
  put(t.big, SIDE, y += 56, '700 56px ' + MONO, COL.bright);
  if (t.noGuard) put(t.noGuard, SIDE, y += 40, '24px ' + SANS, COL.pink);
  if (t.note) { const nf = ctx.font = '22px ' + SANS; for (const l of wrap(ctx, t.note, sw)) put(l, SIDE, y += 32, nf, COL.text); }
  if (t.rows.length) {
    put('CAUGHT BY', SIDE, y += 44, '700 20px ' + SANS, COL.axis);
    const total = t.rows.reduce((a, r) => a + r.mw, 0);
    let x = SIDE;
    y += 12;
    for (const r of t.rows) { ctx.fillStyle = r.col; ctx.fillRect(x, y, Math.max(2, sw * r.mw / total - 2), 20); x += sw * r.mw / total; }
    y += 20;
    for (const r of t.rows) {
      ctx.fillStyle = r.col; ctx.fillRect(SIDE, (y += 28) - 14, 14, 14);
      put(r.name + ' ' + mw(r.mw) + ' MW', SIDE + 24, y, (r.you ? '700 ' : '') + '20px ' + SANS, r.you ? COL.bright : COL.text);
    }
  }
  // the foot: the closing line and the link
  put(t.closing, PAD, IMAGE_H - 30, 'italic 22px ' + SANS, COL.text);
  put(SHARE_URL, IMAGE_W - PAD, IMAGE_H - 30, '700 22px ' + SANS, COL.blue, 'right');
  return t;
}

// The font, at most px and at least 14px, at which s fits in maxW px (every tag at once is a long line)
function fitted(ctx, s, maxW, px) {
  for (;; px -= 2) {
    const font = ctx.font = px + 'px ' + SANS;
    if (px <= 14 || ctx.measureText(s).width <= maxW) return font;
  }
}

// s in lines no wider than maxW px at the context's font, broken at spaces (a part of a line the lint passes passes it too)
function wrap(ctx, s, maxW) {
  const out = [];
  for (const w of s.split(' ')) {
    const more = out.length ? out[out.length - 1] + ' ' + w : '';
    if (more && ctx.measureText(more).width <= maxW) out[out.length - 1] = more; else out.push(w);
  }
  return out;
}

/**
 * Y-6: SAVE IMAGE: draw the picture on a canvas of its own and save it to the downloads as a PNG, with a toast (as
 * DOWNLOAD REPLAY LOG). doc: the page's document; toast(text, kind): the shell's.
 * @returns {Promise<string>} the file's name, or '' when it failed (the toast says why)
 */
export function saveMoment(doc, end, toast) {
  return new Promise(done => {
    const fail = err => { toast('The image failed: ' + (err && err.message ? err.message : err)); done(''); };
    try {
      const cv = doc.createElement('canvas'), name = imageName(end);
      drawImage(cv, end);
      cv.toBlob(blob => {
        try {
          if (!blob) throw new Error('this browser made no PNG');
          const a = doc.createElement('a');
          doc.body.appendChild(a);
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
          toast('Saved to your downloads: ' + name, 'info');
          done(name);
        } catch (err) { fail(err); }
      }, 'image/png');
    } catch (err) { fail(err); }
  });
}
