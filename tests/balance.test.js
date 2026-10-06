// tests/balance.test.js: the K-11 BALANCE bar and the dial's readout at the eye's speed (the first
// playtest, desk/README.md §29: "the chart showing the imbalance ... moves way too fast to show
// anything"). The pure parts (smoothSeg, balanceWord, holdScale, trendColumn, shownHz and the
// battery's booking in calc.imbalanceSegments), and the bar and the dial built in the stand-in DOM
// (tests/lib/dom.js) and fed real observations: two real seconds of a fresh day at CRUISE (the
// regulation noise the old bar printed as a new number every frame) and a trip while the battery
// charges. Each test is a pure call or a few hundred frames (F-10); the whole-day acceptance runs
// with GRIDWATCH_SLOW=1.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from './lib/dom.js';
import {slowOnly} from './lib/sim-helpers.js';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {DESK} from '../content/scenarios.js';
import {imbalanceSegments} from '../desk/calc.js';
import * as D from '../desk/dial.js';

const TPS = V.TICKS_PER_S;
const FRAME_MS = 1000 / 60;
const CRUISE = {mode: 'CRUISE', rate: 120, watchS: -1, locked: false, watchVersion: null};
const WATCH = {mode: 'WATCH', rate: 0.15, watchS: 0.5, locked: true, watchVersion: 'full'};

// ---------------------------------------------------------------- fixture: the owner's day, a minute in

/**
 * Seed 20261007 (a Wednesday: the page plays it on DESK). `cruise`: 120 frames at 120× (one every
 * two grid seconds) after a minute to settle. Then the battery is ordered to charge 200 MW and,
 * once it charges 100, the largest unit trips: `tripped` is the tick after, `trip` half a second
 * into the watch, where H-10 has suspended the charge (below 49.85 Hz).
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
  const tripped = observe(st);
  for (let k = 0; k < TPS / 2; k++) step(st);
  return {cruise, tripped, trip: observe(st)};
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

/** The bar alone, on a frame clock of its own; `notes` records ctx.note calls. */
function mountBar() {
  const doc = makeDocument(), notes = [];
  let now = 1000;
  const ctx = {doc, now: () => now, cue() {}, note: (...a) => notes.push(a)};
  const bar = D.createImbalanceBar(ctx, doc.body);
  const $ = sel => bar.el.querySelector(sel);
  return {
    bar, notes, $,
    frame(vm, ms = FRAME_MS) { now += ms; bar.update(vm); },
    head: () => $('.dk-imb-text').textContent,
    widths: () => bar.el.querySelectorAll('.dk-seg').map(e => e.style.width),
    trend: () => $('.dk-imb-trend').children,
  };
}

/** Text changes per window of `n` frames, the most in any window. */
function maxChangesPer(texts, n) {
  let most = 0;
  for (let i = 0; i + n <= texts.length; i++) {
    let c = 0;
    for (let j = i + 1; j < i + n; j++) if (texts[j] !== texts[j - 1]) c++;
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
  assert.equal(m.$('.dk-imb-who').textContent, '');
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

test('K-11 a slow shortfall reads SHORT in red, names the governors holding it up, and draws a red trend that deepens', () => {
  const m = mountBar(), heads = [];
  const frames = 14 * 30;   // 14 grid minutes at 120×: 7 real s
  let firstShort = -1;
  for (let i = 0; i < frames; i++) {
    m.frame(vmOf(shortAt(i, shortfallMW(i * 2 / 60))));
    heads.push(m.head());
    if (firstShort < 0 && m.head().startsWith('SHORT')) firstShort = i;
    if (i * 2 / 60 < 0.5) assert.equal(m.head(), 'BALANCED', 'frame ' + i);
  }
  assert.ok(firstShort > 0 && shortfallMW(firstShort * 2 / 60) > D.BAL_OUT_MW, 'SHORT once the shown gap passes ' + D.BAL_OUT_MW + ' MW: ' +
    shortfallMW(firstShort * 2 / 60).toFixed(0) + ' MW short at its first frame');
  assert.ok(heads.slice(firstShort).every(h => /^SHORT \d+0 MW$/.test(h)), 'no flapping back: ' + [...new Set(heads.slice(firstShort))].join(', '));
  const last = Number(/^SHORT (\d+) MW$/.exec(m.head())[1]);
  assert.ok(last >= 140 && last <= 160, 'the head: ' + m.head());
  assert.ok(maxChangesPer(heads, 60) <= 2, 'the head changes at most twice a real second: ' + maxChangesPer(heads, 60));
  assert.equal(m.$('.dk-imb-text').className, 'dk-imb-text crit');
  assert.match(m.$('.dk-imb-who').textContent, /^held up by governors 1[2-4]0 · load relief 20$/);
  const gap = m.$('.dk-seg-sched');
  assert.ok(parseFloat(gap.style.width) > 10 && gap.classList.contains('neg'), 'the gap is drawn, left of zero: ' + gap.style.width);
  // the trend: one column a grid minute, newest on the right; red below the middle, deepening as the hole grows
  const cols = m.trend();
  assert.equal(cols.length, D.TREND_N);
  const reds = cols.slice(-11);
  assert.ok(reds.every(e => e.className === 'short' && e.style.top === '50.0%'), reds.map(e => e.className).join(' '));
  const h = reds.map(e => parseFloat(e.style.height));
  for (let i = 1; i < 9; i++) assert.ok(h[i] >= h[i - 1], 'the trough deepens: ' + h.join(', '));
  assert.ok(h[10] > 30, 'to most of the half-track: ' + h[10] + '%');
  assert.ok(cols.slice(-15, -13).every(e => e.className === ''), 'grey before the hole: ' + cols.slice(-15, -13).map(e => e.className).join(' '));
  assert.ok(cols.slice(0, -15).every(e => e.style.height === '0.0%'), 'minutes not seen yet are flat');
});

test('K-11 after a trip (the watch): raw, at the size of the hole, saying who caught the loss; the trend makes way and the scale holds through RESPOND', () => {
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
  assert.equal(m.$('.dk-imb-trend').hidden, true, 'the stack takes the track');
  assert.deepEqual(m.bar.el.querySelectorAll('.dk-seg').filter(e => e.classList.contains('glow')).map(e => e.className.split(' ')[1]), ['dk-seg-batt'],
    'the segment the caption is about glows');
  // RESPOND (unlocked, 30×): averaged again, and still drawn while BALANCED, at the event's ±1000
  // (10 MW short, governors covering it, is half a percent of the bar), the trend still away
  const respond = {mode: 'RESPOND', rate: 30, watchS: -1, locked: false, watchVersion: null};
  const calm = Object.assign({}, o, {tick: o.tick + TPS, s: o.s + 1, battery: null,
    balance: {schedSupplyMW: 4990, servedMW: 5000, governorsMW: 10, batteryPfrMW: 0, guardMW: 0, loadReliefMW: 0, inertiaMW: 0, imbalanceMW: 0}});
  for (let i = 0; i < 600; i++) m.frame(vmOf(calm, respond));   // 10 real s: the trip's average has gone
  assert.equal(m.head(), 'BALANCED');
  assert.equal(m.$('.dk-seg-sched').style.width, '0.50%');
  assert.equal(m.$('.dk-seg-gov').style.width, '0.50%');
  assert.equal(m.$('.dk-imb-trend').hidden, true);
  // back at CRUISE: BALANCED outside an event draws nothing, and the trend is back
  m.frame(vmOf(calm));
  assert.equal(m.$('.dk-imb-trend').hidden, false);
  assert.ok(m.widths().every(x => x === '0.00%'));
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

test('balanceWord: BALANCED inside ±15 MW and until the gap passes ±25 (no flapping); 10-MW steps; the two biggest carriers on the covering side, in words', () => {
  const at = (g, was, x) => D.balanceWord(Object.assign({schedMW: g}, x), was);
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

test('trendColumn: grey inside ±15 MW, red below the middle when short, blue above when surplus; |gap| / scale × 50% tall, at most half the track', () => {
  assert.deepEqual(D.trendColumn(-10, 100), {cls: '', top: 50, height: 5});
  assert.deepEqual(D.trendColumn(-60, 100), {cls: 'short', top: 50, height: 30});
  assert.deepEqual(D.trendColumn(40, 200), {cls: 'surplus', top: 40, height: 10});
  assert.deepEqual(D.trendColumn(-600, 100), {cls: 'short', top: 50, height: 50});
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
  m.frame(vmOf(o), 600);   // past TEXT_MS: the head shows this frame's figure
  assert.equal(drawn(), 1, 'one column of the new day');
  assert.equal(m.head(), 'SHORT ' + Math.round(-imbalanceSegments(o.balance, o.battery).schedMW / 10) * 10 + ' MW');
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
  // nothing suspended: the same as without obs.battery
  const calm = FIX.cruise[60], c1 = imbalanceSegments(calm.balance, calm.battery), c0 = imbalanceSegments(calm.balance);
  for (const k of ['schedMW', 'batteryMW', 'sumMW', 'borrowedMW']) assert.ok(Math.abs(c1[k] - c0[k]) < 1e-6, k);
});

// ---------------------------------------------------------------- C8: the dial's readout

test('C8: above 10× the needle and readout are the mean of the last real second\'s grid seconds; CHANGE reads "steady" outside the watch, so SPIN fits', () => {
  const o = FIX.cruise[10], freq = Array.from({length: 180}, (_, i) => (i < 20 ? NaN : 50 + (i % 2 ? 0.02 : -0.02) + (i >= 60 ? -0.01 : 0)));
  const vm = (mode, over) => Object.assign(vmOf(o, mode), {hist: {freq}}, over);
  const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
  assert.ok(Math.abs(D.shownHz(vm(CRUISE)) - mean(freq.slice(-120))) < 1e-12, 'the last 120 at 120×');
  assert.ok(Math.abs(D.shownHz(vm(Object.assign({}, CRUISE, {rate: 540}))) - mean(freq.slice(20))) < 1e-12, 'at most the 180 kept, NaN (before the day) skipped');
  assert.equal(D.shownHz(vm(Object.assign({}, CRUISE, {rate: 10}))), o.f.hz, '10× and below: the grid now');
  assert.equal(D.shownHz(vm(CRUISE, {hist: {freq: []}})), o.f.hz, 'no history yet');
  assert.equal(D.shownHz(vm(CRUISE, {hist: {freq: [NaN, NaN]}})), D.needleHz(vm(CRUISE, {hist: {freq: [NaN, NaN]}})));
  assert.equal(D.needleHz(vm(CRUISE)), freq[179], 'needleHz is still the last second');
  // the dial on one frame
  const doc = makeDocument(), notes = [];
  const dial = D.createFreqDial({doc, now: () => 1000, cue() {}, note: (...a) => notes.push(a)}, doc.body);
  const sub = () => dial.el.querySelector('.dk-dial-sub').textContent, big = () => dial.el.querySelector('.dk-hz').textContent;
  const f = r => Object.assign({}, o, {f: Object.assign({}, o.f, {rocofHzS: r, ekGWs: 18.1})});
  dial.update(Object.assign(vmOf(f(0.012)), {hist: {freq}}), null);
  assert.equal(sub(), 'CHANGE steady · SPIN 18.1 GW·s');
  assert.equal(big(), mean(freq.slice(-120)).toFixed(3) + ' Hz');
  dial.update(Object.assign(vmOf(f(-0.412)), {hist: {freq}}), null);
  assert.equal(sub(), 'CHANGE −0.412 Hz/s · SPIN 18.1 GW·s');
  dial.update(Object.assign(vmOf(f(0.012), WATCH), {hist: {freq}}), null);
  assert.equal(sub(), 'CHANGE +0.012 Hz/s · SPIN 18.1 GW·s', 'the watch: always the digits');
  dial.update(Object.assign(vmOf(f(-1.3), WATCH), {hist: {freq}}), null);
  assert.equal(sub(), '✕ CHANGE −1.300 Hz/s · SPIN 18.1 GW·s');
  assert.equal(D.STEADY_HZ_S, 0.05);
  // its '?' is help, not a refusal
  dial.el.querySelector('#q-dial').click();
  assert.equal(notes[0][3], 'info');
});

test('the bar\'s \'?\' (q-imb) explains it as help (an info note); the panel is a group, so the button inside it is reachable', () => {
  const m = mountBar();
  m.frame(vmOf(FIX.cruise[0]));
  const q = m.$('#q-imb');
  assert.ok(q && q.parentElement === m.bar.el, 'on the panel itself, for its top-right corner');
  assert.equal(q.getAttribute('aria-label'), 'What the balance bar means');
  assert.match(q.title, /^Supply minus demand, averaged over about a second\. BALANCED: AGC is keeping up\. SHORT: /);
  q.click();
  assert.deepEqual(m.notes.map(n => [n[0], n[1], n[2], n[3]]), [[m.bar.el, q.title, 8000, 'info']]);
  assert.equal(m.bar.el.getAttribute('role'), 'group');
  assert.equal(m.$('.dk-imb-track').getAttribute('aria-hidden'), 'true');
});

// ---------------------------------------------------------------- the acceptance on the real game (slow)

/**
 * A day as the page plays it (app/game.js: the player's commitment, AGC on, no input): runTo(h)
 * headless, then frame() by frame at 60 fps, the bar fed each frame's view model. A respond card is dismissed at
 * once (Enter), so the day goes on at CRUISE.
 */
async function realDay(seed) {
  const G = await import('../app/game.js'), DIR = await import('../app/director.js');
  const system = await import('../app/system.js'), planview = await import('../app/planview.js');
  const game = G.createGame({seed, scenario: G.scenarioForSeed, system, planview, commit: 'player', storage: null});
  G.takeDesk(game, {agc: true});
  const m = mountBar();
  let nowMs = 0;
  return {
    m,
    runTo: h => G.runTo(game, Math.round((h - V.DAY_START_H) * 3600 * TPS)),
    frame() {
      nowMs += FRAME_MS;
      G.frame(game, FRAME_MS / 1000);
      DIR.dismissCard(game.director, game.state);
      const vm = G.buildVm(game, {nowMs, dtS: FRAME_MS / 1000});
      m.frame(vm);
      return vm;
    },
  };
}

/** The gap segment as drawn: -1 left of zero, +1 right, 0 not drawn. */
const drawnSign = m => (m.$('.dk-seg-sched').style.width === '0.00%' ? 0 : m.$('.dk-seg-sched').classList.contains('neg') ? -1 : 1);

test('K-11 accept (slow): at CRUISE outside events, on 4 days at 6 times of day, the head changes at most twice a real second and the drawn gap never flips', slowOnly(), async t => {
  const SECS = 3;
  for (const seed of [20261003, 20261005, 20261007, 20261010]) {
    const day = await realDay(seed);
    for (const h of [5, 8, 11, 14, 17, 20]) {
      day.runTo(h);
      let heads = 0, flips = 0, raw = 0, quiet = 0, lastHead = null, lastSign = 0, lastRaw = 0;
      for (let f = 0; f < SECS * 60; f++) {
        const vm = day.frame();
        if (vm.mode.mode !== 'CRUISE' || vm.mode.locked) { lastHead = null; lastSign = 0; continue; }   // an event: counted from after it
        const head = day.m.head(), sign = drawnSign(day.m), r = Math.sign(imbalanceSegments(vm.obs.balance).schedMW);
        if (lastHead !== null) { quiet++; if (head !== lastHead) heads++; if (r !== lastRaw) raw++; }
        if (sign) { if (lastSign && sign !== lastSign) flips++; lastSign = sign; }
        lastHead = head; lastRaw = r;
      }
      const tag = seed + ' ' + h + ':00';
      t.diagnostic(tag + ': ' + quiet + ' calm frames, head changes ' + heads + ', drawn gap flips ' + flips + ', raw gap sign changes ' + raw);
      assert.ok(heads <= 2 * SECS, tag + ': the head changed ' + heads + ' times in ' + SECS + ' s');
      assert.ok(flips <= SECS, tag + ': the drawn gap changed side ' + flips + ' times');
    }
  }
});

test('K-11 on the owner\'s day (slow): with no input, the bar says SHORT, names the governors and draws a red trough for 2 real s and more before UFLS sheds', slowOnly(), async t => {
  // seed 20261007, nobody starts CCGT 2: AGC runs out of room from about 16:08 and UFLS sheds at about 16:19
  const day = await realDay(20261007);
  day.runTo(15.9);
  let vm = null, shortFrames = 0, at16 = '';
  for (let f = 0; f < 60 * 60 && !(vm && vm.obs.demand.unservedMW > 0); f++) {
    vm = day.frame();
    if (vm.obs.clock.text === '16:00') at16 = day.m.head();
    shortFrames = day.m.head().startsWith('SHORT') ? shortFrames + 1 : 0;
  }
  assert.ok(vm.obs.demand.unservedMW > 0, 'UFLS shed by ' + vm.obs.clock.text);
  t.diagnostic('UFLS at ' + vm.obs.clock.text + ' after ' + (shortFrames / 60).toFixed(1) + ' real s of SHORT; the head ' + day.m.head() + ', the foot ' +
    day.m.$('.dk-imb-who').textContent + ', the trend ' + day.m.trend().slice(-12).map(e => e.className[0] || '.').join(''));
  assert.equal(at16, 'BALANCED', 'AGC still has room at 16:00');
  assert.ok(shortFrames >= 120, 'SHORT for ' + (shortFrames / 60).toFixed(1) + ' real s before the shed');
  assert.equal(day.m.$('.dk-imb-text').className, 'dk-imb-text crit');
  assert.match(day.m.$('.dk-imb-who').textContent, /^held up by governors \d+/);
  const red = day.m.trend().slice(-6);
  assert.ok(red.every(e => e.className === 'short'), 'the newest six grid minutes are red: ' + red.map(e => e.className).join(' '));
  const h = red.map(e => parseFloat(e.style.height));
  for (let i = 1; i < h.length; i++) assert.ok(h[i] >= h[i - 1], 'deepening: ' + h.join(', '));
});
