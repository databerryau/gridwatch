// tests/balance.test.js: the K-11 BALANCE bar and the dial's readout at the eye's speed (the first
// playtest, desk/README.md §29: "the chart showing the imbalance ... moves way too fast to show
// anything"). The pure parts (smoothSeg, balanceWord, holdScale, trendColumn, shownHz and the
// battery's booking in calc.imbalanceSegments), and the bar and the dial built in the stand-in DOM
// (tests/lib/dom.js) and fed real observations: two real seconds of a fresh day at CRUISE (the
// regulation noise the old bar printed as a new number every frame) and a trip while the battery
// charges, tick by tick through its first second. Each test is a pure call or a few hundred
// frames (F-10).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {DESK} from '../content/scenarios.js';
import {imbalanceSegments} from '../desk/calc.js';
import * as D from '../desk/dial.js';

const CSS = readFileSync(new URL('../desk/desk.css', import.meta.url), 'utf8');
const TPS = V.TICKS_PER_S;
const FRAME_MS = 1000 / 60;
const CRUISE = {mode: 'CRUISE', rate: 120, watchS: -1, locked: false, watchVersion: null};
const WATCH = {mode: 'WATCH', rate: 0.15, watchS: 0.5, locked: true, watchVersion: 'full'};
const WATCH20 = {mode: 'WATCH', rate: 20, watchS: 12, locked: true, watchVersion: 'compact'};
const CARD = {mode: 'RESPOND-CARD', rate: 0, watchS: -1, locked: false, watchVersion: null};
const RESPOND = {mode: 'RESPOND', rate: 30, watchS: -1, locked: false, watchVersion: null};

// ---------------------------------------------------------------- fixture: the owner's day, a minute in

/**
 * Seed 20261007 (a Wednesday: the page plays it on DESK). `cruise`: 120 frames at 120× (one every
 * two grid seconds) after a minute to settle. Then the battery is ordered to charge 200 MW and,
 * once it charges 100, the largest unit trips: `tripped` is the tick after, `watch` the 60 ticks
 * after that (the watch's first 1.2 grid s), `trip` half a second in, where H-10 has suspended
 * the charge (below 49.85 Hz).
 */
const FIX = (() => {
  const st = createState(20261007, DESK);
  for (let k = 0; k < 60 * TPS; k++) step(st);
  const cruise = [];
  for (let f = 0; f < 120; f++) {
    for (let k = 0; k < 2 * TPS; k++) step(st);
    cruise.push(observe(st));
  }
  step(st, [{type: 'battery', mode: 'charge', mw: 200}]);
  for (let k = 0; k < 60 * TPS && (st.tick % TPS !== 0 || st.battery.schedMW > -100); k++) step(st);
  let big = -1;
  st.units.forEach((u, i) => { if (u.sync && (big < 0 || u.outMW > st.units[big].outMW)) big = i; });
  fleet.tripUnit(st, big, 'test trip', V.HOT_TRIP_LOCKOUT_S, []);
  step(st);
  const tripped = observe(st), watch = [];
  for (let k = 0; k < 60; k++) { step(st); watch.push(observe(st)); }
  return {cruise, tripped, watch, trip: watch[TPS / 2 - 1]};
})();

const vmOf = (obs, mode = CRUISE, over) => Object.assign({obs, mode, watch: null, glow: new Set()}, over);

/**
 * Frame `i` of a CRUISE run made of the real frames (two grid seconds apart, cycled), `shortMW`
 * short: the governors carry 85% of it and load relief the rest, as they do when AGC is out of
 * room, so the swing-equation identity still holds.
 */
function shortAt(i, shortMW) {
  const o0 = FIX.cruise[0], o = FIX.cruise[i % FIX.cruise.length], b = o.balance;
  const balance = Object.assign({}, b, {schedSupplyMW: b.schedSupplyMW - shortMW, governorsMW: b.governorsMW + 0.85 * shortMW,
    loadReliefMW: b.loadReliefMW + 0.15 * shortMW});
  return Object.assign({}, o, {tick: o0.tick + i * 2 * TPS, s: o0.s + i * 2, balance});
}

/** The bar alone, on a frame clock of its own (`still`: one that never moves); `notes` records ctx.note calls. */
function mountBar(o = {}) {
  const doc = makeDocument(), notes = [];
  let now = 1000;
  const ctx = {doc, now: () => now, cue() {}, note: (...a) => notes.push(a)};
  const bar = D.createImbalanceBar(ctx, doc.body);
  const $ = sel => bar.el.querySelector(sel);
  return {
    bar, notes, $,
    frame(vm, ms = FRAME_MS) { if (!o.still) now += ms; bar.update(vm); },
    head: () => $('.dk-imb-text').textContent,
    widths: () => bar.el.querySelectorAll('.dk-seg').map(e => e.style.width),
    trend: () => $('.dk-imb-trend').children,
    /** What the foot shows, in order. */
    foot: () => ['.dk-imb-shed', '.dk-imb-who', '.dk-imb-agc'].map($).filter(e => !e.hidden && e.textContent).map(e => e.textContent),
  };
}

/** The dial alone, on a frame clock of its own. */
function mountDial() {
  const doc = makeDocument(), notes = [];
  let now = 1000;
  const dial = D.createFreqDial({doc, now: () => now, cue() {}, note: (...a) => notes.push(a)}, doc.body);
  return {
    dial, notes,
    frame(vm, ms = FRAME_MS) { now += ms; dial.update(vm, null); },
    hz: () => dial.el.querySelector('.dk-hz').textContent,
    sub: () => dial.el.querySelector('.dk-dial-sub').textContent,
  };
}
/** The figure in a readout ('! 49.807 Hz' -> 49.807). */
const readHz = t => parseFloat(t.replace(/^[!✕ ]+/, ''));

/** Text changes per window of `n` frames, the most in any window; a change of `kind` (a new word) is not counted. */
function maxChangesPer(texts, n, kind = () => '') {
  let most = 0;
  for (let i = 0; i + n <= texts.length; i++) {
    let c = 0;
    for (let j = i + 1; j < i + n; j++) if (texts[j] !== texts[j - 1] && kind(texts[j]) === kind(texts[j - 1])) c++;
    most = Math.max(most, c);
  }
  return most;
}

const signChanges = xs => xs.filter((x, i) => i > 0 && Math.sign(x) !== Math.sign(xs[i - 1]) && x !== 0 && xs[i - 1] !== 0).length;

// ---------------------------------------------------------------- C5: the bar at CRUISE

test('K-11 at CRUISE (complaint 2): two real seconds of AGC regulation noise read as one word, BALANCED, with no segment drawn', () => {
  // The premise, from the sim: what the old head printed ('GAP n · BORROWED −n') was a new figure nearly every frame, flipping sign.
  const raw = FIX.cruise.map(o => Math.round(imbalanceSegments(o.balance).schedMW));
  assert.ok(maxChangesPer(raw, 60) >= 45, 'the raw gap changes ' + maxChangesPer(raw, 60) + ' times a real second');
  assert.ok(signChanges(raw) >= 30, 'and changes sign ' + signChanges(raw) + ' times in 2 s');
  assert.ok(Math.max(...raw.map(Math.abs)) > 10, 'by up to ' + Math.max(...raw.map(Math.abs)) + ' MW');
  const m = mountBar(), heads = [], labels = new Set();
  for (const o of FIX.cruise) {
    m.frame(vmOf(o));
    heads.push(m.head());
    labels.add(m.bar.el.getAttribute('aria-label'));
    assert.ok(m.widths().every(w => w === '0.00%'), 'BALANCED: nothing drawn but the zero line');
    assert.equal(m.$('.dk-imb-text').className, 'dk-imb-text', 'dim: not crit, not warn');
  }
  assert.deepEqual([...new Set(heads)], ['BALANCED']);
  assert.equal(m.$('.dk-title').textContent, 'BALANCE');
  assert.deepEqual(m.foot(), []);
  assert.ok(labels.size <= 3, 'the text alternative changes at most once per real second: ' + labels.size + ' in 2 s');
  assert.match([...labels][0], /^Balance: BALANCED\. Scheduled supply minus demand [−+]?\d+ MW, covered by spin /);
  // the shown gap (one linear average over a real second) hardly moves: a few sign changes in 2 s, not dozens
  let shown = null;
  const g = FIX.cruise.map(o => (shown = D.smoothSeg(shown, imbalanceSegments(o.balance, o.battery), FRAME_MS / 1000, false)).schedMW);
  assert.ok(signChanges(g) <= 4, 'shown gap sign changes in 2 s: ' + signChanges(g));
  assert.ok(Math.max(...g.map(Math.abs)) < D.BAL_IN_MW, 'the shown gap stays inside ±' + D.BAL_IN_MW + ' MW: ' + Math.max(...g.map(Math.abs)).toFixed(1));
});

/**
 * The do-nothing afternoon on the owner's day (measured with no inputs, desk/README.md §29): AGC out
 * of room from 16:08, a per-minute mean gap of −22 MW at 16:09, −54 at 16:13, −88 at 16:17, −110 at
 * 16:18 and −155 at 16:19, carried by the governors (and some load relief), UFLS at 16:19-16:20.
 * Laid over the real noise frames: [grid minutes after 16:08, MW short].
 */
const SHORTFALL = [[0, 0], [1, 22], [5, 54], [9, 88], [10, 110], [11, 155], [14, 155]];
function shortfallMW(min) {
  for (let i = 1; i < SHORTFALL.length; i++) {
    const [m0, a] = SHORTFALL[i - 1], [m1, b] = SHORTFALL[i];
    if (min <= m1) return a + (b - a) * (min - m0) / (m1 - m0);
  }
  return SHORTFALL[SHORTFALL.length - 1][1];
}

test('K-11 a slow shortfall reads SHORT in red and names the governors; between events the track is the trend alone, red in the minutes the word said SHORT, deepening', () => {
  const m = mountBar(), heads = [];
  const frames = 14 * 30;   // 14 grid minutes at 120×: 7 real s
  let firstShort = -1, lastMin = -1;
  for (let i = 0; i < frames; i++) {
    const o = shortAt(i, shortfallMW(i * 2 / 60));
    m.frame(vmOf(o));
    heads.push(m.head());
    if (firstShort < 0 && m.head().startsWith('SHORT')) firstShort = i;
    if (i * 2 / 60 < 0.5) assert.equal(m.head(), 'BALANCED', 'frame ' + i);
    // C6 / BB-1: no segment covers the trend between events; the word and the foot carry the figures
    assert.ok(m.widths().every(w => w === '0.00%'), 'frame ' + i + ': ' + m.widths().join(' '));
    assert.ok(!m.$('.dk-imb-trend').hidden && m.$('.dk-imb-zero').hidden, 'the trend, across its middle line; not the zero of the stack');
    // a new grid minute's column has the colour of the word on the head (red only beside SHORT, BB-7)
    const min = Math.floor(o.s / 60);
    if (min !== lastMin) {
      lastMin = min;
      assert.equal(m.trend()[D.TREND_N - 1].className, m.head().startsWith('SHORT') ? 'short' : '', 'minute ' + min + ', ' + m.head());
    }
  }
  assert.ok(firstShort > 0 && shortfallMW(firstShort * 2 / 60) > D.BAL_OUT_MW, 'SHORT once the shown gap passes ' + D.BAL_OUT_MW + ' MW: ' +
    shortfallMW(firstShort * 2 / 60).toFixed(0) + ' MW short at its first frame');
  assert.ok(heads.slice(firstShort).every(h => /^SHORT \d+0 MW$/.test(h)), 'no flapping back: ' + [...new Set(heads.slice(firstShort))].join(', '));
  const last = Number(/^SHORT (\d+) MW$/.exec(m.head())[1]);
  assert.ok(last >= 140 && last <= 160, 'the head: ' + m.head());
  assert.ok(maxChangesPer(heads, 60) <= 2, 'the head changes at most twice a real second: ' + maxChangesPer(heads, 60));
  assert.equal(m.$('.dk-imb-text').className, 'dk-imb-text crit');
  assert.match(m.$('.dk-imb-who').textContent, /^held up by governors 1[2-4]0 · load relief 20$/);
  // the trend: one column a grid minute, newest on the right; red below the middle, deepening as the hole grows
  const cols = m.trend(), reds = cols.filter(e => e.className === 'short');
  assert.equal(cols.length, D.TREND_N);
  assert.ok(reds.length >= 10 && cols.slice(-reds.length).every(e => e.className === 'short' && e.style.top === '50.0%'),
    'the newest minutes are red: ' + cols.map(e => e.className[0] || '.').join(''));
  const h = reds.map(e => parseFloat(e.style.height));
  for (let i = 1; i < h.length - 2; i++) assert.ok(h[i] >= h[i - 1], 'the trough deepens: ' + h.join(', '));
  assert.ok(h[h.length - 1] > 30, 'to most of the half-track: ' + h[h.length - 1] + '%');
  assert.ok(cols.slice(-reds.length - 3, -reds.length).every(e => e.className === ''), 'grey before the hole');
  assert.ok(cols.slice(0, -15).every(e => e.style.height === '0.0%'), 'minutes not seen yet are flat');
});

test('K-11 after a trip (the watch): only the stack, raw, at the size of the hole, named as the foot names it; the card and RESPOND keep that scale; back at CRUISE the trend is redrawn at the scale it shrinks to', () => {
  const m = mountBar();
  for (const o of FIX.cruise.slice(0, 30)) m.frame(vmOf(o));
  assert.equal(m.head(), 'BALANCED');
  const o = FIX.trip, raw = imbalanceSegments(o.balance, o.battery), lost = Math.abs(o.contingency.lostMW);
  assert.ok(lost > 400 && raw.schedMW < -400, 'the trip: ' + lost.toFixed(0) + ' MW lost, gap ' + raw.schedMW.toFixed(0));
  m.frame(vmOf(o, WATCH, {watch: {beat: 'battery'}}));
  // raw on the first frame of the watch: the word and the segments are this frame's, not an average
  const w = D.balanceWord(raw, 'BALANCED');
  assert.equal(m.head(), 'SHORT ' + Math.round(-raw.schedMW / 10) * 10 + ' MW');
  assert.equal(m.head(), w.head);
  assert.equal(m.$('.dk-imb-text').className, 'dk-imb-text crit');
  assert.equal(m.$('.dk-imb-who').textContent, w.who);
  assert.match(w.who, /^held up by (spin \d+ · battery \d+|battery \d+ · spin \d+)$/, 'spin and the battery carry the first half second');
  const S = D.barScale(raw, lost);
  assert.equal(S, 1000, 'the event scale: the lost MW, rounded up');
  assert.deepEqual(m.widths(), D.barLayout(raw, S).segs.map(s => s.width.toFixed(2) + '%'));
  assert.ok(m.$('.dk-imb-trend').hidden && !m.$('.dk-imb-zero').hidden, 'the stack takes the track, about its zero');
  assert.deepEqual(m.bar.el.querySelectorAll('.dk-seg').filter(e => e.classList.contains('glow')).map(e => e.className.split(' ')[1]), ['dk-seg-batt'],
    'the segment the caption is about glows');
  // BB-8: one name per thing: each segment's tooltip uses the foot's word for it
  const segs = m.bar.el.querySelectorAll('.dk-seg');
  assert.deepEqual(segs.map(e => e.getAttribute('title').replace(/ [−+]?\d+ MW$/, '')), ['gap', 'spin', 'battery', 'governors', 'load relief', 'solar and wind']);
  assert.equal(segs[0].getAttribute('title'), 'gap ' + (raw.schedMW < 0 ? '−' : '+') + Math.round(Math.abs(raw.schedMW)) + ' MW');
  for (const name of w.who.replace(/^held up by /, '').split(' · ').map(x => x.replace(/ \d+$/, ''))) {
    assert.ok(segs.some(e => e.getAttribute('title').startsWith(name + ' ')), name);
  }
  // the respond card (unlocked, 0×) and RESPOND (30×): averaged again, and still the stack while BALANCED, at the
  // event's ±1000 (10 MW short, governors covering it, is half a percent of the bar), the trend still away
  const calm = Object.assign({}, o, {tick: o.tick + TPS, s: o.s + 1, battery: null,
    balance: {schedSupplyMW: 4990, servedMW: 5000, governorsMW: 10, batteryPfrMW: 0, guardMW: 0, loadReliefMW: 0, inertiaMW: 0, imbalanceMW: 0}});
  for (let i = 0; i < 240; i++) m.frame(vmOf(calm, CARD));   // 4 real s: past the scale's hold
  const card = parseFloat(m.$('.dk-seg-sched').style.width);
  assert.ok(card > 0 && card < 2, 'the card is part of the event: the stack, at ±1000 (' + m.head() + ' is ' + card + '%)');
  assert.equal(m.$('.dk-imb-trend').hidden, true);
  for (let i = 0; i < 600; i++) m.frame(vmOf(calm, RESPOND));   // 10 real s: the trip's average has gone
  assert.equal(m.head(), 'BALANCED');
  assert.equal(m.$('.dk-seg-sched').style.width, '0.50%');
  assert.equal(m.$('.dk-seg-gov').style.width, '0.50%');
  assert.equal(m.$('.dk-imb-trend').hidden, true);
  // back at CRUISE: BALANCED outside an event draws nothing, and the trend is back, at the held ±1000 ...
  m.frame(vmOf(calm));
  assert.ok(!m.$('.dk-imb-trend').hidden && m.$('.dk-imb-zero').hidden);
  assert.ok(m.widths().every(x => x === '0.00%'));
  const heights = () => m.trend().map(e => parseFloat(e.style.height));
  const before = heights();
  assert.ok(before.some(x => x > 1), 'the trip minute is in the trend: ' + before.join(' '));
  // ... until the hold runs out (the grid minute unchanged): ±100, every column redrawn ten times taller (at most half the track)
  for (let i = 0; i < 210; i++) m.frame(vmOf(calm));
  const after = heights();
  after.forEach((x, i) => assert.ok(Math.abs(x - Math.min(50, before[i] * 10)) <= 0.6, 'column ' + i + ': ' + before[i] + '% -> ' + x + '%'));
});

test('the head: a new word at once, new figures at most once per 500 real ms, in the watch too; the foot\'s carriers likewise', () => {
  const m = mountBar();
  m.frame(vmOf(FIX.cruise[0]));   // the head written now
  m.frame(vmOf(FIX.trip, WATCH), 100);
  assert.match(m.head(), /^SHORT \d+0 MW$/, 'a new word does not wait for TEXT_MS');
  const at = mwShort => Object.assign({}, FIX.trip, {balance: {schedSupplyMW: 5000 - mwShort, servedMW: 5000, governorsMW: mwShort}, battery: null});
  m.frame(vmOf(at(300), WATCH), 500);
  assert.equal(m.head(), 'SHORT 300 MW');
  m.frame(vmOf(at(400), WATCH), 100);
  assert.equal(m.head(), 'SHORT 300 MW', 'the same word: its new figure waits');
  m.frame(vmOf(at(400), WATCH), 400);
  assert.equal(m.head(), 'SHORT 400 MW');
  assert.equal(D.TEXT_MS, 500);
  // the watch tick by tick (raw): the carriers change most frames; the foot at most twice a real second
  const w = mountBar(), raw = [], feet = [];
  for (const o of FIX.watch) {
    w.frame(vmOf(o, WATCH));
    raw.push(D.balanceWord(imbalanceSegments(o.balance, o.battery), 'SHORT').who);
    feet.push(w.$('.dk-imb-who').textContent);
  }
  assert.ok(maxChangesPer(raw, 60) >= 15, 'raw, the carriers change ' + maxChangesPer(raw, 60) + ' times in 60 frames');
  assert.ok(maxChangesPer(feet, 60) <= 2, 'the foot: ' + [...new Set(feet)].join(' / '));
});

// ---------------------------------------------------------------- C5: the pure parts

test('smoothSeg: raw on the first frame and in the watch; a 1-real-second exponential average, linear, so the shown segments still balance about zero', () => {
  const keys = ['schedMW', 'inertiaMW', 'batteryMW', 'governorsMW', 'loadReliefMW', 'inverterMW'];
  const segs = FIX.cruise.map(o => imbalanceSegments(o.balance, o.battery));
  const first = D.smoothSeg(null, segs[0], 0.016, false);
  for (const k of keys) assert.equal(first[k], segs[0][k], 'first frame raw: ' + k);
  assert.equal(first.shedMW, 0, 'SHED sets no scale');
  const snap = D.smoothSeg(first, segs[50], 0.016, true);
  for (const k of keys) assert.equal(snap[k], segs[50][k], 'the watch: raw ' + k);
  // K-11, restated: each frame the shown segments sum to zero about the shown gap (within 1 MW); the
  // shown gap is the average of the frames' gaps
  let shown = null, avg = 0;
  segs.forEach((s, i) => {
    shown = D.smoothSeg(shown, s, FRAME_MS / 1000, false);
    avg = i === 0 ? s.schedMW : avg + (s.schedMW - avg) * (1 - Math.exp(-FRAME_MS / 1000 / D.BAL_TAU_S));
    const sum = keys.reduce((a, k) => a + shown[k], 0);
    assert.ok(Math.abs(sum) <= 1, 'frame ' + i + ': the segments sum to ' + sum);
    assert.ok(Math.abs(shown.schedMW - avg) < 1e-9);
  });
  // the time constant, the same at any frame rate: a step reaches 1 - 1/e after 1 real s, 95% after 3
  const step = (fps, s) => { let x = D.smoothSeg(null, {schedMW: 0}, 0, false); for (let i = 0; i < fps * s; i++) x = D.smoothSeg(x, {schedMW: 100}, 1 / fps, false); return x.schedMW; };
  assert.ok(Math.abs(step(60, 1) - 100 * (1 - Math.exp(-1))) < 1e-9 && Math.abs(step(30, 1) - step(60, 1)) < 1e-9 && Math.abs(step(144, 1) - step(60, 1)) < 1e-9);
  assert.ok(step(60, 3) > 95);
  // a frame clock that stalls or runs back moves nothing; a long gap (a hidden tab) lands on the present
  assert.equal(D.smoothSeg(first, segs[9], 0, false).schedMW, first.schedMW);
  assert.equal(D.smoothSeg(first, segs[9], -1, false).schedMW, first.schedMW);
  assert.ok(Math.abs(D.smoothSeg(first, segs[9], 120, false).schedMW - segs[9].schedMW) < 1e-9);
});

test('balanceWord: BALANCED inside ±15 MW and until the gap passes ±25 (no flapping); 10-MW steps; the biggest carriers on the covering side, in words', () => {
  const at = (g, was, x, n) => D.balanceWord(Object.assign({schedMW: g}, x), was, n);
  assert.equal(at(14, 'BALANCED').head, 'BALANCED');
  assert.equal(at(-25, 'BALANCED').head, 'BALANCED', 'inside the hysteresis: stays');
  assert.equal(at(-26, 'BALANCED').head, 'SHORT 30 MW');
  assert.equal(at(-16, 'SHORT').head, 'SHORT 20 MW', 'once SHORT, until back inside ±15');
  assert.equal(at(-14.9, 'SHORT').head, 'BALANCED');
  assert.equal(at(20, 'SURPLUS').word, 'SURPLUS');
  assert.equal(at(30, 'SHORT').head, 'SURPLUS 30 MW', 'straight across');
  assert.equal(at(-124, 'BALANCED').head, 'SHORT 120 MW');
  assert.equal(at(135, 'BALANCED').head, 'SURPLUS 140 MW');
  assert.equal(at(5, 'BALANCED').who, '');
  // a shortfall: what holds it up, biggest first; a carrier under 5 MW or pulling the other way is not named
  const short = {inertiaMW: 3, batteryMW: 8, governorsMW: 101, loadReliefMW: 21, inverterMW: -30};
  assert.equal(at(-130, 'SHORT', short).who, 'held up by governors 100 · load relief 20');
  assert.equal(at(-130, 'SHORT', short, 1).who, 'held up by governors 100', 'one, beside SHED');
  assert.equal(at(-130, 'SHORT', Object.assign({}, short, {loadReliefMW: 4})).who, 'held up by governors 100 · battery 10');
  assert.equal(at(-130, 'SHORT', {governorsMW: -50}).who, '', 'nobody named on the wrong side');
  // a surplus: what soaks it up
  assert.equal(at(125, 'SURPLUS', {inverterMW: -81, governorsMW: -39, loadReliefMW: -6, inertiaMW: 2}).who, 'soaked up by solar and wind 80 · governors 40');
  // a trip's first second: spin first
  assert.equal(at(-600, 'BALANCED', {inertiaMW: 406, batteryMW: 80, governorsMW: 3}).who, 'held up by spin 410 · battery 80');
});

test('holdScale and the event floor: the scale grows at once, shrinks after 3 real s unneeded, and is the lost MW rounded up in an event; SHED sets no size', () => {
  const h = {s: 0, t: 0};
  assert.equal(D.holdScale(h, 100, 0), 100);
  assert.equal(D.holdScale(h, 500, 100), 500, 'grows at once');
  assert.equal(D.holdScale(h, 100, 3099), 500, 'held');
  assert.equal(D.holdScale(h, 200, 2000 + 100), 500);
  assert.equal(D.holdScale(h, 500, 3000), 500, 'needed again: the hold starts over');
  assert.equal(D.holdScale(h, 100, 5999), 500);
  assert.equal(D.holdScale(h, 100, 6000), 100, 'shrinks after SCALE_HOLD_MS');
  assert.equal(D.SCALE_HOLD_MS, 3000);
  // the event floor: a 613-MW trip is drawn on ±1000 whatever the stack does; a load loss the same (|lostMW|)
  assert.equal(D.barScale({schedMW: -20, inertiaMW: 20}, 613), 1000);
  assert.equal(D.barScale({schedMW: 5}, Math.abs(-256)), 500);
  assert.equal(D.barScale({schedMW: -20, inertiaMW: 20}), 100);
  assert.equal(D.barScale({schedMW: -1500, inertiaMW: 1500}, 613), 2000, 'a bigger stack still fits');
  // the bar's segments come from smoothSeg, whose shedMW is 0: UFLS's dark MW never stretch the scale
  assert.equal(D.barScale(D.smoothSeg(null, {schedMW: -40, governorsMW: 40, shedMW: 731}, 0, false)), 100);
});

test('trendColumn: the colour of the word that minute (grey BALANCED, red below the middle SHORT, blue above SURPLUS); |gap| / scale × 50% tall, at most half the track', () => {
  assert.deepEqual(D.trendColumn(-10, 100, 'BALANCED'), {cls: '', top: 50, height: 5});
  assert.deepEqual(D.trendColumn(-20, 100, 'BALANCED'), {cls: '', top: 50, height: 10}, 'BALANCED 20 MW short: grey, as the word');
  assert.deepEqual(D.trendColumn(-20, 100, 'SHORT'), {cls: 'short', top: 50, height: 10}, 'SHORT, on its way back: red');
  assert.deepEqual(D.trendColumn(-60, 100, 'SHORT'), {cls: 'short', top: 50, height: 30});
  assert.deepEqual(D.trendColumn(40, 200, 'SURPLUS'), {cls: 'surplus', top: 40, height: 10});
  assert.deepEqual(D.trendColumn(-600, 100, 'SHORT'), {cls: 'short', top: 50, height: 50});
  assert.deepEqual(D.trendColumn(undefined, 100), {cls: '', top: 50, height: 0}, 'a minute not seen yet: flat');
  assert.equal(D.TREND_N, 30);
});

test('the trend samples the shown gap once a grid minute, keeps 30, and a new day clears it and the average', () => {
  const m = mountBar(), minutes = new Set();
  const drawn = () => m.trend().filter(e => e.style.height !== '0.0%').length;
  for (let i = 0; i < 32 * 30; i++) {   // 32 grid minutes, 60 MW short: every column visible
    const o = shortAt(i, 60);
    m.frame(vmOf(o));
    minutes.add(Math.floor(o.s / 60));
    assert.equal(drawn(), Math.min(D.TREND_N, minutes.size), 'frame ' + i + ': one column per grid minute seen');
  }
  assert.equal(m.trend().filter(e => e.className === 'short').length, D.TREND_N);
  // a new day (the tick goes back): the trend starts over and the bar is raw again, not averaged with the old day
  const o = Object.assign({}, shortAt(0, 300), {tick: 10, s: 0});
  m.frame(vmOf(o), 600);
  assert.equal(drawn(), 1, 'one column of the new day');
  assert.equal(m.head(), 'SHORT ' + Math.round(-imbalanceSegments(o.balance, o.battery).schedMW / 10) * 10 + ' MW');
});

test('a new day starts the bar afresh (BB-2): its word, its held scale and its text throttle are the new day\'s, as on a bar mounted that morning', () => {
  const m = mountBar();
  for (let i = 0; i < 180; i++) m.frame(vmOf(shortAt(i, 300)));
  m.frame(vmOf(FIX.trip, WATCH));   // the day ends in a trip: SHORT, the ±1000 scale, the head just written
  assert.match(m.head(), /^SHORT [4-9]\d0 MW$/);
  const look = b => [b.head(), b.$('.dk-imb-text').className, ...b.foot(), ...b.widths(), ...b.trend().map(e => e.className + e.style.height)].join('|');
  // the next day 100 ms later, 200 MW short (the same word, a new figure, half the old scale), then the day after
  // that, 20 MW short (inside the word's hysteresis): frame for frame as a fresh bar
  let tick = 10;
  for (const shortMW of [200, 20]) {
    const fresh = mountBar();
    for (let i = 0; i < 120; i++) {
      const o = Object.assign(shortAt(i, shortMW), {tick: tick + i * 2 * TPS, s: i * 2});
      m.frame(vmOf(o), i ? FRAME_MS : 100);
      fresh.frame(vmOf(o), i ? FRAME_MS : 100);
      assert.equal(look(m), look(fresh), shortMW + ' MW short, frame ' + i);
    }
    tick = 5;
  }
  assert.equal(m.head(), 'BALANCED');
  // a day that ends BALANCED with customers dark, its foot just written: the next morning's foot is its own at once
  const dark = Object.assign({}, FIX.cruise[0].demand, {unservedMW: 400});
  for (let i = 0; i < 60; i++) m.frame(vmOf(Object.assign(shortAt(i, 0), {tick: 1e6 + i, demand: dark})), i < 59 ? FRAME_MS : 600);
  assert.deepEqual(m.foot(), ['✕ SHED 400 MW']);
  m.frame(vmOf(Object.assign(shortAt(0, 0), {tick: 3})), 100);
  assert.deepEqual(m.foot(), [], 'the new day\'s foot');
});

// ---------------------------------------------------------------- the foot: SHED, who, AGC

test('the foot: SHED, then who carries the gap (one beside SHED), then "! AGC limit" in words, at the word\'s thresholds and never for a few MW (BB-3, BB-4, BB-5)', () => {
  const at = (i, unmetMW, shortMW = 0, over) => Object.assign(shortAt(i, shortMW), {agc: {unmetMW}}, over);
  const note = m => m.$('.dk-imb-agc');
  // a weekend noon: AGC's lowering flickers a few MW at its limit (−5 … −13): no note under BALANCED
  const m = mountBar();
  for (let i = 0; i < 180; i++) {
    m.frame(vmOf(at(i, i % 4 ? 0 : -13 + (i % 3) * 4)));
    assert.equal(note(m).hidden, true, 'frame ' + i);
  }
  assert.equal(m.head(), 'BALANCED');
  // AGC at its limit, flickering to 0 between its cycles as it does (the owner's 16:09-16:19): nothing while the gap
  // is inside the word's thresholds; once it reads SHORT the note, steady, not blinking with the flicker
  for (let i = 180; i < 300; i++) {
    m.frame(vmOf(at(i, i % 3 ? 50 : 0, 10)));
    assert.equal(note(m).hidden, true, 'BALANCED, frame ' + i);
  }
  const seen = [];
  for (let i = 300; i < 480; i++) { m.frame(vmOf(at(i, i % 3 ? 60 : 0, 60))); seen.push(note(m).hidden); }
  assert.equal(m.head(), 'SHORT 60 MW');
  assert.equal(note(m).textContent, '! AGC limit');
  const from = seen.indexOf(false);
  assert.ok(from >= 0 && from < 60 && seen.slice(from).every(h => !h), 'shown from frame ' + from + ', then held');
  // gone within about a second once AGC has room again
  let gone = -1;
  for (let i = 480; i < 600 && gone < 0; i++) { m.frame(vmOf(at(i, 0, 60))); if (note(m).hidden) gone = i - 480; }
  assert.ok(gone > 0 && gone <= 60, 'the note goes ' + (gone / 60).toFixed(2) + ' real s after AGC has room');
  // the order, most important first: SHED, the carrier (one, so the foot fits 199 px), the AGC note; no '+' beside SHORT
  const s = mountBar();
  for (let i = 0; i < 300; i++) s.frame(vmOf(at(i, 260, 100, {demand: Object.assign({}, FIX.cruise[0].demand, {unservedMW: 495})})));
  assert.equal(s.head(), 'SHORT 100 MW');
  assert.deepEqual(s.foot(), ['✕ SHED 495 MW', 'held up by governors 90', '! AGC limit']);
  assert.deepEqual(s.$('.dk-imb-foot').querySelectorAll('span').map(e => e.className), ['dk-imb-l', 'dk-imb-shed', 'dk-imb-who', 'dk-imb-agc']);
  assert.ok(!s.$('.dk-imb-foot').textContent.includes('+'));
  // what does not fit drops whole to a hidden second line, the AGC note first (the carriers give way only beside SHED)
  assert.match(CSS, /\.dk-imb-foot \{ flex-wrap: wrap; \} \.dk-imb-l \{ display: flex; gap: 6px; min-width: 0; \}/);
});

test('a caller whose frame clock stands still (BB-6): the bar runs on vm.frame.dtS, or without it draws each frame raw; never frozen on its first frame', () => {
  const frame = {nowMs: 0, dtS: FRAME_MS / 1000};
  const m = mountBar({still: true});
  for (let i = 0; i < 300; i++) {
    m.frame(vmOf(shortAt(i, i ? 300 : 0), CRUISE, {frame}));
    if (i === 1) assert.equal(m.head(), 'BALANCED', 'one frame of a 300-MW gap, averaged over dtS: 5 MW');
  }
  assert.match(m.head(), /^SHORT (29|30|31)0 MW$/, 'averaged on dtS: ' + m.head());
  const r = mountBar({still: true});
  r.frame(vmOf(FIX.cruise[0]));
  const o = shortAt(1, 300);
  r.frame(vmOf(o));
  assert.equal(r.head(), D.balanceWord(imbalanceSegments(o.balance, o.battery)).head, 'no clock at all: this frame\'s own');
  for (let i = 2; i < 10; i++) r.frame(vmOf(FIX.cruise[i]));
  assert.equal(r.head(), 'BALANCED');
});

// ---------------------------------------------------------------- C7: the battery's booking

test('C7: a charge the battery suspends for a trip is the battery\'s (as on the respond card), not the gap\'s; the sums still close', () => {
  const pre = FIX.tripped, o = FIX.trip, b = o.balance, bat = o.battery;
  assert.ok(bat.ufSuspend && bat.schedMW < -50, 'H-10: charging ' + (-bat.schedMW).toFixed(0) + ' MW suspended at ' + o.f.hz.toFixed(3) + ' Hz');
  assert.ok(!pre.battery.ufSuspend, 'the tick after the trip: not yet');
  const s = imbalanceSegments(b, bat), old = imbalanceSegments(b);
  assert.ok(Math.abs(s.sumMW - b.imbalanceMW) <= 1 && Math.abs(s.sumMW + s.inertiaMW) <= 1 && Math.abs(s.schedMW + s.borrowedMW) <= 1,
    'the swing-equation identity and BORROWED = −GAP');
  assert.ok(Math.abs(s.batteryMW - (bat.outMW - bat.schedMW)) < 1e-9, 'battery = its change from schedule: ' + s.batteryMW.toFixed(1));
  // the gap stays the hole the trip made (the respond card's lost MW); booked to the schedule, it shrank by the suspended charge
  const at1 = imbalanceSegments(pre.balance, pre.battery).schedMW;
  assert.ok(Math.abs(s.schedMW - at1) < 2, 'gap ' + s.schedMW.toFixed(1) + ' MW, as at the trip ' + at1.toFixed(1));
  assert.ok(old.schedMW - s.schedMW > 0.9 * -bat.schedMW, 'the old booking: ' + old.schedMW.toFixed(1));
  assert.ok(Math.abs((s.batteryMW - old.batteryMW) - (old.schedMW - s.schedMW)) < 1e-9, 'one term moved between two segments');
  // nothing suspended, the battery busy (charging, its PFR answering the trip): the same as without obs.battery
  const pb = pre.battery;
  assert.ok(pb.schedMW < -100 && pre.balance.batteryPfrMW > 20 && Math.abs(pb.outMW - pb.schedMW) > 20,
    'charging ' + (-pb.schedMW).toFixed(0) + ' MW, PFR ' + pre.balance.batteryPfrMW.toFixed(0) + ' MW');
  const c1 = imbalanceSegments(pre.balance, pb), c0 = imbalanceSegments(pre.balance);
  for (const k of ['schedMW', 'batteryMW', 'sumMW', 'borrowedMW']) assert.ok(Math.abs(c1[k] - c0[k]) < 1e-6, k + ': ' + c1[k] + ' vs ' + c0[k]);
});

// ---------------------------------------------------------------- C8: the dial's readout

/** A dial frame on obs `o`: vm.hist.freq ends in `last` (the last grid second) after `before`. */
const dialVm = (o, mode, last, before = [], over) =>
  Object.assign(vmOf(o, mode), {hist: {freq: [...Array(180 - 1 - before.length).fill(50), ...before, last]}}, over);

test('C8 shownHz: above 10× the last grid second eased over HZ_TAU_S real s, at any frame rate; the grid itself at 10× and below, in the watch and on a first frame', () => {
  const o = FIX.cruise[10];
  assert.equal(D.shownHz(NaN, dialVm(o, CRUISE, 49.9), 1 / 60), 49.9, 'nothing shown yet: the last grid second');
  assert.equal(D.shownHz(50, dialVm(o, Object.assign({}, CRUISE, {rate: 10}), 49.9), 1 / 60), o.f.hz, '10× and below: the grid now');
  assert.equal(D.shownHz(50, dialVm(o, WATCH20, 49.7), 1 / 60), 49.7, 'the watch: raw');
  assert.equal(D.shownHz(50, dialVm(o, CRUISE, 49.9), 0), 50, 'a stalled clock moves nothing');
  const run = (fps, s) => { let x = 50; for (let i = 0; i < fps * s; i++) x = D.shownHz(x, dialVm(o, CRUISE, 49.9), 1 / fps); return x; };
  const want = 50 - 0.1 * (1 - Math.exp(-1 / D.HZ_TAU_S));
  for (const fps of [30, 60, 144]) assert.ok(Math.abs(run(fps, 1) - want) < 1e-9, fps + ' fps: ' + run(fps, 1));
  assert.equal(D.HZ_TAU_S, 0.5);
  assert.equal(D.needleHz(dialVm(o, CRUISE, 49.9)), 49.9, 'needleHz is still the last second');
});

test('C8 on the dial (BB-1): a compact watch shows each grid second raw; the card and RESPOND after it read the grid, not the trip\'s seconds; nothing amber while the grid is in band', () => {
  const d = mountDial(), o = FIX.cruise[10];
  const at = (hz, mode, last, before) => dialVm(Object.assign({}, o, {f: Object.assign({}, o.f, {hz})}), mode, last, before);
  for (let i = 0; i < 120; i++) d.frame(at(50, CRUISE, 50));
  assert.equal(d.hz(), '50.000 Hz');
  // the compact watch at 20×: the grid recovering from the nadir, a grid second each third of a frame
  const rise = Array.from({length: 23}, (_, i) => 49.519 + i * 0.01);
  for (let i = 3; i < rise.length; i++) {
    d.frame(at(rise[i], WATCH20, rise[i], rise.slice(0, i)));
    assert.equal(readHz(d.hz()), +rise[i].toFixed(3), 'the watch, grid second ' + i + ': ' + d.hz());
  }
  // the card (0×): the grid now; RESPOND (30×): the trip's seconds still fill the last 30 of vm.hist.freq
  d.frame(at(49.861, CARD, 49.861, rise));
  assert.equal(d.hz(), '49.861 Hz');
  for (let i = 0; i < 120; i++) {
    d.frame(at(49.872, i < 60 ? RESPOND : CRUISE, 49.872, rise));
    assert.ok(Math.abs(readHz(d.hz()) - 49.872) < 0.012 && !/^[!✕]/.test(d.hz()), (i < 60 ? 'RESPOND' : 'CRUISE') + ' frame ' + i + ': ' + d.hz());
  }
  // the watch straight into CRUISE, and a new day (the tick goes back): raw at once, not eased from what was shown
  const e = mountDial();
  for (let i = 0; i < 30; i++) e.frame(at(49.7, WATCH20, 49.7));
  e.frame(at(49.8, CRUISE, 49.8));
  assert.equal(e.hz(), '! 49.800 Hz', 'the first frame after the watch');
  for (let i = 0; i < 120; i++) e.frame(at(49.6, CRUISE, 49.6));
  e.frame(dialVm(Object.assign({}, o, {tick: 5, f: Object.assign({}, o.f, {hz: 50.01})}), CRUISE, 50.01));
  assert.equal(e.hz(), '50.010 Hz', 'a new day');
});

test('C8 readout at the eye\'s speed (BB-2/BB-3): at CRUISE its figure changes at most twice a real second, a new colour at once; in an event every frame', () => {
  // the premise: the last grid second of the real CRUISE frames is a new figure nearly every frame
  const seconds = FIX.cruise.map(o => o.f.hz.toFixed(3));
  assert.ok(maxChangesPer(seconds, 60) >= 45, 'the grid second changes ' + maxChangesPer(seconds, 60) + ' times a real second');
  const d = mountDial(), texts = [];
  for (const o of FIX.cruise) { d.frame(dialVm(o, CRUISE, o.f.hz)); texts.push(d.hz()); }
  assert.ok(maxChangesPer(texts, 60) <= 2, 'the readout changes ' + maxChangesPer(texts, 60) + ' times a real second');
  assert.ok(new Set(texts).size >= 3, 'yet it follows the grid: ' + [...new Set(texts)].join(', '));
  // a new colour shows at once: 49.8 Hz at 10× (raw) 100 ms after the last figure
  d.frame(dialVm(Object.assign({}, FIX.cruise[0], {f: Object.assign({}, FIX.cruise[0].f, {hz: 49.8})}), Object.assign({}, CRUISE, {rate: 10}), 49.8), 100);
  assert.equal(d.hz(), '! 49.800 Hz');
  // in an event every frame: RESPOND (30×) and the watch
  for (const mode of [RESPOND, WATCH20]) {
    const e = mountDial(), seen = [];
    for (const o of FIX.cruise) { e.frame(dialVm(o, mode, o.f.hz)); seen.push(e.hz()); }
    assert.ok(maxChangesPer(seen, 60) >= 20, mode.mode + ': ' + maxChangesPer(seen, 60) + ' changes in 60 frames');
  }
});

test('C8 CHANGE per real second (BB-6): steady through AGC\'s noise at 120×, "falling" in a sag the eye can see, "rising" back; the digits in the watch and above the limit', () => {
  const o = FIX.cruise[10];
  const f = (r, hz = o.f.hz) => Object.assign({}, o, {f: Object.assign({}, o.f, {rocofHzS: r, ekGWs: 18.1, hz})});
  // AGC's regulation noise: a new grid second each frame, RoCoF up to ±0.03 Hz/s (× 120 = 3.6 Hz a real second, frame by frame)
  const d = mountDial(), subs = [];
  for (const x of FIX.cruise) { d.frame(dialVm(f(x.f.rocofHzS, x.f.hz), CRUISE, x.f.hz)); subs.push(d.sub()); }
  assert.ok(Math.max(...FIX.cruise.map(x => Math.abs(x.f.rocofHzS * 120))) > 1, 'the premise: RoCoF × rate is large frame by frame');
  assert.deepEqual([...new Set(subs)], ['CHANGE steady\nSPIN 18.1 GW·s']);
  // the owner's 16:18 at 120×: 0.01 Hz a frame (0.6 Hz a real second) while the 500-ms RoCoF reads a few mHz/s
  let hz = 49.95;
  for (let i = 0; i < 45; i++) { hz -= 0.01; d.frame(dialVm(f(-0.004, hz), CRUISE, hz)); }
  assert.equal(d.sub(), 'CHANGE falling\nSPIN 18.1 GW·s', 'a sag the needle shows');
  for (let i = 0; i < 60; i++) { hz += 0.01; d.frame(dialVm(f(0.004, hz), CRUISE, hz)); }
  assert.equal(d.sub(), 'CHANGE rising\nSPIN 18.1 GW·s');
  for (let i = 0; i < 90; i++) d.frame(dialVm(f(0.001, hz), CARD, hz));
  assert.equal(d.sub(), 'CHANGE steady\nSPIN 18.1 GW·s', 'the card: nothing moves');
  // the watch: always the digits; above the limit, ✕ and the digits
  d.frame(dialVm(f(0.012), WATCH, o.f.hz));
  assert.equal(d.sub(), 'CHANGE +0.012 Hz/s\nSPIN 18.1 GW·s');
  d.frame(dialVm(f(-1.3), WATCH, o.f.hz));
  assert.equal(d.sub(), '✕ CHANGE −1.300 Hz/s\nSPIN 18.1 GW·s');
  d.frame(dialVm(f(-1.3), CRUISE, o.f.hz));
  assert.equal(d.sub(), '✕ CHANGE −1.300 Hz/s\nSPIN 18.1 GW·s');
  assert.equal(D.STEADY_HZ_S, 0.05);
  // CHANGE over SPIN, two short lines beside the readout: both fit at 1280 px (one line cut SPIN off)
  assert.match(CSS, /\.dk-dial-sub \{[^}]*white-space: pre; line-height: 1\.15;/);
  // its '?' is help, not a refusal
  d.dial.el.querySelector('#q-dial').click();
  assert.equal(d.notes[0][3], 'info');
});

test('the bar\'s \'?\' (q-imb) explains it as help (an info note), the trend and the AGC note included; the panel is a group, so the button inside it is reachable', () => {
  const m = mountBar();
  m.frame(vmOf(FIX.cruise[0]));
  const q = m.$('#q-imb');
  assert.ok(q && q.parentElement === m.bar.el, 'on the panel itself, for its top-right corner');
  assert.equal(q.getAttribute('aria-label'), 'What the balance bar means');
  assert.match(q.title, /^Supply minus demand, averaged over about a second\. BALANCED: within 25 MW\. SHORT: /);
  // the trend in two plain sentences: one column a grid minute, now at the right, red below the middle line short, blue above surplus
  assert.match(q.title, /AGC limit: the running units have no room left\. Between trips, one column per grid minute, the newest on the right: red below the middle line is short, blue above it is surplus\./);
  // ... and the middle line is drawn: across the trend, at half its height
  assert.match(CSS, /\.dk-imb-trend \{[^}]*background: linear-gradient\(var\(--dk-dim\), var\(--dk-dim\)\) 0 50% \/ 100% 1px no-repeat; \}/);
  q.click();
  assert.deepEqual(m.notes.map(n => [n[0], n[1], n[2], n[3]]), [[m.bar.el, q.title, 8000, 'info']]);
  assert.equal(m.bar.el.getAttribute('role'), 'group');
  assert.equal(m.$('.dk-imb-track').getAttribute('aria-hidden'), 'true');
});
