// W6: the share card (app/share.js, content/closing.js). Pure checks of Y-1's number, Y-4's sparkline, rows, limits and
// lint, Y-7's closing lines and Y-5's copy; then on the page: a finished day's YOUR CARD is the card, lint-clean, with
// its tags, Marg's closing line is its quote, SHARE copies it (or selects it when the clipboard is blocked), and the
// briefing names the daily's number.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as SH from '../app/share.js';
import {CLOSING} from '../content/closing.js';
import {MARG_LINES, MARG_WORDS} from '../app/marg.js';
import {V} from '../sim/params.js';
import {installGlobals} from './lib/dom.js';
import {openGame} from './lib/play.js';

const a = (o = {}) => Object.assign({outage: 0, supplyCents: 4, co2tPerMWh: 0.6}, o);
const dark = mwh => a({outage: mwh * V.VCR});
const words = s => s.trim().split(/\s+/).length;

test('Y-1: #1 is the launch date; every date after has exactly one number, the next, across the daylight-saving changes', () => {
  assert.equal(SH.LAUNCH_YMD, 20261012);
  assert.equal(SH.puzzleNumber(20261012), 1);
  assert.equal(SH.puzzleNumber(20261016), 5);
  assert.equal(SH.puzzleNumber(20261011), null, 'before the launch');
  assert.equal(SH.puzzleNumber(20261332), null, 'no such date');
  // 400 dates from the launch, through AEDT's end (4 Apr 2027) and start (3 Oct 2027): consecutive numbers
  let prev = 0;
  for (let k = 0; k < 400; k++) {
    const t = new Date(Date.UTC(2026, 9, 12 + k)), ymd = t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
    assert.equal(SH.puzzleNumber(ymd), prev + 1, String(ymd));
    prev++;
  }
  assert.equal(SH.shortDate(20261014), 'Wed 14 Oct');
});

test('Y-4: the sparkline is 12 blocks by the table; blocks the day never reached (black first) are middle dots', () => {
  const devs = [0, 0.05, 0.051, 0.1, 0.15, 0.3, 0.5, 0.8, 1.0, 1.2, 0.2, 0.06];
  assert.equal(SH.sparkline(devs), '██▇▇▆▅▄▃▂▁▅▇');
  assert.equal(SH.sparkline(devs, 3 * V.SPARK_BLOCK_S + 1), '██▇▇········');
  assert.equal(SH.sparkline(null), '████████████');
});

test('Y-4: the rows against par: lights, cost (supply c/kWh) and carbon, ★ at par or better', () => {
  assert.deepEqual(SH.shareRows(a(), a()), {lights: '★ every light on', cost: '★ level with par', carbon: '★ level with par'});
  assert.deepEqual(SH.shareRows(dark(42.4), a({supplyCents: 4.2, co2tPerMWh: 0.57})),
    {lights: '42 MWh dark · par 0', cost: '★ -5% vs par', carbon: '+5% vs par'});
  assert.equal(SH.shareRows(dark(3.25), dark(12)).lights, '★ 3.3 MWh dark · par 12', 'a Hard day: darker than none, lighter than par');
  assert.equal(SH.shareRows(a({supplyCents: 4.01}), a()).cost, '★ level with par', 'within half a per cent is level');
  assert.equal(SH.shareRows(a({supplyCents: 4.03}), a()).cost, '+1% vs par', 'dearer never rounds to a ★');
  assert.deepEqual(SH.shareRows(null, a(), true), {lights: 'the grid went black', cost: '', carbon: ''});
  assert.deepEqual(SH.shareRows(a(), null), {lights: '★ every light on', cost: '4.0 c/kWh', carbon: '0.60 t/MWh'});
});

const card = (o = {}) => SH.shareCard(Object.assign({ymd: 20261014, n: 3, seed: 20261014, grade: {points: 975, letter: 'A', star: false}, perfect: false,
  black: false, lowHz: 49.41, spark: [0.02, 0.2, 0.03, 0.04, 0.3, 0.08, 0.01, 1.3, 0.25, 0.14, 0.04, 0.03], endS: V.DAY_S,
  you: a({supplyCents: 4.2}), par: a(), tags: [], closing: 'Nobody noticed. That\'s the job.'}, o));

test('Y-4: the card reads as §4.7 sets it out: 7 lines, the rows aligned, the link last; the lint passes it', () => {
  const c = card();
  assert.deepEqual(c.lines, ['GRIDWATCH #3 · Wed 14 Oct · 975 A', '█▅██▅▇█▁▅▆██  low 49.41 Hz', 'Lights  ★ every light on', 'Cost    +5% vs par',
    'Carbon  ★ level with par', '"Nobody noticed. That\'s the job."', 'databerryau.github.io/gridwatch']);
  assert.deepEqual(SH.lintCard(c.text), []);
  assert.equal(card({grade: {points: 1002, letter: 'A', star: true}, perfect: true, tags: ['NO COACH']}).lines[0], 'GRIDWATCH #3 · Wed 14 Oct · 1002 A ★ · PERFECT · NO COACH');
  assert.equal(card({ymd: null, n: null, seed: 7}).lines[0], 'GRIDWATCH · seed 7 · 975 A', 'off the calendar: the seed');
  const black = card({black: true, grade: {points: 0, letter: 'F', star: false}, you: null, endS: 15.3 * 3600});
  assert.deepEqual(black.lines.slice(0, 3), ['GRIDWATCH #3 · Wed 14 Oct · 0 F', '█▅██▅▇█▁····  low 49.41 Hz', 'Lights  the grid went black']);
  assert.deepEqual(SH.lintCard(black.text), []);
});

test('Y-4: the longest card stays within 7 lines and 280 characters: it drops the closing line, then the last tags', () => {
  const tags = ['FIRST SHIFT', 'PRACTICE', 'HAND-FLOWN', 'COACHED', 'GLASS BROKEN', 'HARD DAY'];
  const longest = Object.values(CLOSING).flat().reduce((x, y) => (y.length > x.length ? y : x));
  const c = card({n: 9999, grade: {points: 1999, letter: 'A', star: true, hardMWh: 9}, perfect: true, tags, closing: longest, you: dark(12345), par: dark(23456)});
  assert.deepEqual(SH.lintCard(c.text), []);
  assert.ok(c.lines.length <= SH.MAX_LINES && [...c.text].length <= SH.MAX_CHARS, c.text);
  assert.ok(!c.text.includes('"'), 'the closing line goes first');
  // a busy later shift (PRACTICE, HAND-FLOWN, GLASS BROKEN) keeps its closing line
  const usual = card({n: 999, grade: {points: 1000, letter: 'A', star: true}, perfect: true, tags: ['PRACTICE', 'HAND-FLOWN', 'GLASS BROKEN'], closing: longest,
    you: dark(1234), par: dark(1300)});
  assert.equal(usual.lines.length, 7, usual.text);
});

test('Y-4: the lint rejects clock times, event words, district ids, emoji, an eighth line and a 281st character', () => {
  const ok = card().text;
  for (const [bad, why] of [[ok.replace('Lights ', 'At 18:49 '), 'a clock time'], [ok + ' 7pm', 'a clock time'], [ok.replace('Nobody', 'GT·A tripped'), 'the event word "tripped"'],
    [ok.replace('Nobody', 'The heatwave'), 'the event word "heatwave"'], [ok.replace('Nobody', 'HAR4'), 'a district id'], [ok.replace('★', '🔥'), 'a character outside ASCII, the blocks, ★ and ·']]) {
    assert.ok(SH.lintCard(bad).includes(why), bad);
  }
  assert.match(SH.lintCard(ok + '\nmore').join(), /8 lines/);
  assert.match(SH.lintCard(ok + 'x'.repeat(281 - [...ok].length)).join(), /281 characters/);
});

test('Y-7: at least 40 closing lines, at least 2 a bucket, every bucket reachable, each lint-clean and short enough for Marg', () => {
  const buckets = ['black'];
  for (const l of ['on', 'dark']) for (const c of ['under', 'over']) for (const b of ['calm', 'wobble', 'deep', 'relays']) buckets.push(l + '.' + c + '.' + b);
  assert.deepEqual(Object.keys(CLOSING).sort(), buckets.slice().sort());
  assert.ok(Object.values(CLOSING).flat().length >= 40);
  for (const [k, lines] of Object.entries(CLOSING)) {
    assert.ok(lines.length >= 2, k);
    for (const s of lines) {
      assert.deepEqual(SH.lintCard('"' + s + '"'), [], s);
      assert.ok(s.length <= 40, s + ' is ' + s.length + ' characters');
      const marg = MARG_LINES.verdict({points: 1000, letter: 'A'}, s);
      assert.ok(words(marg) <= MARG_WORDS && marg.endsWith(s), marg);
    }
  }
  // the buckets from the outcome
  const b = (you, par, lowHz) => SH.bucketOf({you, par, lowHz});
  assert.equal(b(a(), a(), 49.9), 'on.under.calm');
  assert.equal(b(dark(1), a(), 49.85), 'dark.under.calm');
  assert.equal(b(a({supplyCents: 4.1}), a(), 49.84), 'on.over.wobble');
  assert.equal(b(a(), a(), 49.5), 'on.under.wobble');
  assert.equal(b(a(), a(), 49.49), 'on.under.deep');
  assert.equal(b(a(), a(), 49.0), 'on.under.deep');
  assert.equal(b(a(), a(), 48.99), 'on.under.relays');
  assert.equal(SH.bucketOf({black: true}), 'black');
});

test('Y-7: the pick is seeded by (date, bucket): the same result on the same date gets the same line; dates vary it', () => {
  assert.equal(SH.closingLine(20261014, 'on.under.calm'), SH.closingLine(20261014, 'on.under.calm'));
  const seen = new Set();
  for (let d = 1; d <= 28; d++) seen.add(SH.closingLine(20261100 + d, 'dark.over.deep'));
  assert.equal(seen.size, CLOSING['dark.over.deep'].length, 'a month of dates uses every line of a bucket');
});

test('Y-5: copy goes to the clipboard, else a hidden textarea and execCommand, else reports failure', async () => {
  let got = '';
  assert.equal(await SH.copyText('x', {navigator: {clipboard: {writeText: async t => { got = t; }}}}), 'clipboard');
  assert.equal(got, 'x');
  const ta = {style: {}, setAttribute() {}, select() {}, remove() {}};
  const doc = ok => ({createElement: () => ta, body: {appendChild() {}}, execCommand: c => c === 'copy' && ok});
  const denied = {clipboard: {writeText: async () => { throw new Error('NotAllowedError'); }}};
  assert.equal(await SH.copyText('x', {navigator: denied, document: doc(true)}), 'fallback');
  assert.equal(await SH.copyText('x', {navigator: denied, document: doc(false)}), '');
  assert.equal(await SH.copyText('x', {}), '');
});

const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};

test('W6 on the page: the briefing names the daily; the day over, YOUR CARD is the card with its tags, Marg quotes its line, SHARE copies it', async () => {
  const p = openGame({seed: 20261016, run: false, par: PAR});
  assert.equal(p.$('briefing-title').textContent, 'Daily #5');
  p.send({type: 'armRERT'});
  p.game.state.over = true;
  p.frames(2);
  const s = p.game.end.share;
  assert.equal(p.$('end-share-text').textContent, s.text);
  assert.deepEqual(SH.lintCard(s.text), []);
  assert.match(s.lines[0], /^GRIDWATCH #5 · Fri 16 Oct · \d+ [A-D]( ★)?( · PERFECT)? · FIRST SHIFT · GLASS BROKEN$/);
  assert.ok(p.game.end.verdict.marg.endsWith(s.closing), 'her closing line is the card\'s quote');
  assert.ok(s.text.includes('"' + s.closing + '"'));
  // SHARE: the clipboard takes the card, the button says so
  let copied = '';
  const restore = installGlobals({navigator: {clipboard: {writeText: async t => { copied = t; }}}});
  try {
    p.click('btn-share');
    await new Promise(r => setImmediate(r));
  } finally { restore(); }
  assert.equal(copied, s.text);
  assert.equal(p.$('btn-share').textContent, 'COPIED');
  assert.match(p.$('toast').textContent, /^Copied/);
  assert.deepEqual(p.h.mods.errors, []);
});

test('W6 on the page: a seed off the calendar is named, not numbered; a HAND day is tagged; a blocked clipboard says how to copy', async () => {
  const p = openGame({seed: 7, scenario: 'desk', par: PAR, agc: false});
  assert.equal(p.$('briefing-title').textContent, 'Tonight\'s desk');
  p.to('05:00');
  p.game.state.over = true;
  p.frames(2);
  const s = p.game.end.share;
  assert.match(s.lines[0], /^GRIDWATCH · seed 7 · \d+ [A-D].* · HAND-FLOWN$/, 'a later shift with the coach off (its default) has no coach tag');
  const restore = installGlobals({navigator: {}});
  try {
    p.click('btn-share');
    await new Promise(r => setImmediate(r));
  } finally { restore(); }
  assert.equal(p.$('btn-share').textContent, 'SHARE');
  assert.match(p.$('toast').textContent, /Ctrl\+C/);
});
