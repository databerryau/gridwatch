// Q-74 (desk/README.md §32.1, §32.7.3): the N-1 gauge's COVER row and the RESPOND card's COVER words.
// BAND (the FOS countdown) and COVER (R5 >= L with nothing shed by relays or direction, within 30 min of
// the trip) on one row, read at the eye's speed: m:ss only at 10x or slower, whole minutes rounded up
// above it, no figure redrawn sooner than every 500 real ms, m:ss always in the aria label.
// Fixtures are views (tests/lib/vm-fixture.js baseVm) of a real 04:00 observation with the trip's
// record, the clock and the level poked in: no frames, no sim run.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {V} from '../sim/params.js';
import {createState, observe} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import {createGauge, COVER_OVER_TITLE, BAND_OK_MS, FIGURE_MS} from '../desk/gauge.js';
import * as W from '../app/watch.js';

const TPS = V.TICKS_PER_S, T0 = 6 * 3600;   // the trip at 10:00
const BASE = observe(createState(4, CLASSIC));

/**
 * A view at T0 + atS with the trip's record. o: rate (the director's), ms (the frame's real ms), level,
 * out (fos.outsideS > 0: frequency outside the band for that many seconds), hz, securedS (from the trip; -1: not yet).
 */
function view({atS, rate = 300, ms = 1000, level = 'TIGHT', out = 0, hz = 50, securedS = -1, cont = true}) {
  const o = structuredClone(BASE), start = T0 * TPS;
  o.tick = (T0 + atS) * TPS;
  o.s = T0 + atS;
  o.sec.level = level;
  o.f.hz = hz;
  Object.assign(o.fos, {outsideS: out, countdownS: out > 0 ? Math.max(0, V.FOS_RECOVER_S - out) : V.FOS_RECOVER_S});
  o.contingency = cont ? {n: 0, startTick: start, watchEndTick: start + V.WATCH_S * TPS, secureByTick: start + V.SECURE_AGAIN_S * TPS,
    securedTick: securedS < 0 ? -1 : start + securedS * TPS} : null;
  o.inRespond = !!cont && o.tick < o.contingency.secureByTick;
  return baseVm(o, {mode: {mode: 'CRUISE', rate, watchS: -1, locked: false, watchVersion: null}, frame: {nowMs: ms, dtS: 1 / 60, alpha: 0}});
}
function gauge() {
  const doc = makeDocument(), g = createGauge({doc, note() {}, cue() {}, ui() {}}, doc.body), row = g.el.querySelector('.dk-cover');
  const up = (v, pv = null) => { g.update(v, pv); return row.hidden ? null : row.textContent; };
  return {g, row, up, fill: () => row.querySelector('.dk-gbar-fill').style.width, aria: () => row.getAttribute('aria-label')};
}

test('Q-74: m:ss at 10x or slower; whole minutes rounded up above it (no ":" on the face at 30x and 300x); BAND\'s bar drains over 5 min', () => {
  const {up, fill} = gauge();
  // COVER after the watch, 1,700 s left (28:20)
  assert.equal(up(view({atS: 100, rate: 1})), 'COVER 28:20');
  assert.equal(up(view({atS: 100, rate: 10, ms: 2000})), 'COVER 28:20');
  for (const rate of [30, 300]) {
    const t = up(view({atS: 100, rate, ms: 3000 + rate * 10}));
    assert.equal(t, 'COVER 29 MIN');
    assert.doesNotMatch(t, /:/);
  }
  // BAND LOW: 20 s outside 49.85-50.15 Hz, 280 s left
  assert.equal(up(view({atS: 100, rate: 1, out: 20, hz: 49.8, ms: 10000})), 'BAND LOW 4:40');
  for (const rate of [30, 300]) {
    const t = up(view({atS: 100, rate, out: 20, hz: 49.8, ms: 20000 + rate * 10}));
    assert.equal(t, 'BAND LOW 5 MIN');
    assert.doesNotMatch(t, /:/);
  }
  assert.equal(fill(), (280 / V.FOS_RECOVER_S * 100).toFixed(1) + '%');
  // the watch's slow part (0.15x) and a PAUSE (rate 0) read m:ss
  assert.equal(up(view({atS: 2, rate: 0.15, out: 2, hz: 49.6, ms: 30000})), 'BAND LOW 4:58');
  assert.equal(up(view({atS: 100, rate: 0, out: 20, hz: 49.8, ms: 31000})), 'BAND LOW 4:40');
});

test('Q-74: no figure redrawn sooner than every 500 real ms (one COVER figure across two updates 0.2 real s apart at 300x); aria m:ss at 300x', () => {
  const {up, aria} = gauge();
  assert.equal(up(view({atS: 100, ms: 1000})), 'COVER 29 MIN');
  assert.equal(aria(), 'COVER 28:20', 'the label says m:ss at every rate');
  // 0.2 real s at 300x is 60 grid-s: 1,640 s left would read 28 MIN
  assert.equal(up(view({atS: 160, ms: 1200})), 'COVER 29 MIN', 'held');
  assert.equal(up(view({atS: 250, ms: 1000 + FIGURE_MS})), 'COVER 26 MIN', 'redrawn after 500 ms');
  // a new word is drawn at once (the figure rule is about figures)
  assert.equal(up(view({atS: 260, ms: 1600, out: 3, hz: 49.8})), 'BAND LOW 5 MIN');
  assert.match(aria(), /^COVER \d+:\d\d$|^BAND LOW \d:\d\d$/);
});

test('Q-74: "BAND ✓" is held 3 real s after the return (there 1 s on, gone at 3.1 s outside a window); "BAND HIGH"', () => {
  const {up} = gauge();
  assert.equal(up(view({atS: 40, out: 30, hz: 50.2, cont: false, ms: 1000})), 'BAND HIGH 5 MIN');
  assert.equal(up(view({atS: 41, cont: false, ms: 1100})), 'BAND ✓');
  assert.equal(up(view({atS: 300, cont: false, ms: 2100})), 'BAND ✓', '1 s after the return');
  assert.equal(up(view({atS: 900, cont: false, ms: 1100 + BAND_OK_MS + 100})), null, 'gone at 3.1 s, no COVER window');
  // inside a window it gives way to COVER
  const w = gauge();
  w.up(view({atS: 40, out: 30, hz: 49.7, ms: 1000}));
  assert.equal(w.up(view({atS: 41, ms: 1100})), 'BAND ✓');
  assert.equal(w.up(view({atS: 700, ms: 4200})), 'COVER 19 MIN');
  // quiet: no trip and in band, the row is hidden (and the caught line is the preview's)
  assert.equal(gauge().up(view({atS: 50, cont: false})), null);
});

test('Q-74: COVER n MIN, ✓ T+n, LOST (amber), and past 30 min "COVER ✕ n MIN OVER" in amber with its title, also in band', () => {
  const {up, row} = gauge();
  const cls = () => row.className.split(' ').filter(c => c === 'good' || c === 'warn').join('') || 'plain';
  assert.equal(up(view({atS: 10, ms: 1000})), 'COVER 30 MIN', 'from the trip (the watch counts)');
  assert.equal(cls(), 'plain');
  assert.equal(up(view({atS: 500, securedS: 400, ms: 2000})), 'COVER ✓ T+7 MIN');
  assert.equal(cls(), 'good');
  assert.equal(up(view({atS: 500, securedS: 400, rate: 1, ms: 3000})), 'COVER ✓ T+6:40');
  assert.equal(up(view({atS: 600, securedS: 400, level: 'SHORT', ms: 4000})), 'COVER LOST', 'the level fell to SHORT inside the window');
  assert.equal(cls(), 'warn');
  assert.equal(up(view({atS: 1900, securedS: 400, ms: 5000})), null, 'covered and the window over: hidden');
  // uncovered past secureByTick, frequency in band: overdue, amber, titled
  assert.equal(up(view({atS: V.SECURE_AGAIN_S + 130, ms: 6000})), 'COVER ✕ 3 MIN OVER');
  assert.equal(cls(), 'warn');
  assert.equal(row.getAttribute('title'), COVER_OVER_TITLE);
  assert.match(row.getAttribute('aria-label'), /^COVER ✕ 2:10 OVER\. AEMO would direct/);
  assert.equal(up(view({atS: V.SECURE_AGAIN_S + 130, rate: 1, ms: 7000})), 'COVER ✕ 2:10 OVER');
});

test('Q-74: never ✓ beside a SHORT or SHEDDING head (COVER and BAND both)', () => {
  for (const level of ['SHORT', 'SHEDDING']) {
    const {up, g} = gauge();
    let ms = 1000;
    for (const atS of [40, 400, 1200, 1700]) {
      for (const securedS of [-1, 35, 300]) {
        const t = up(view({atS, level, securedS, ms: ms += 600}));
        assert.ok(!t || !t.includes('✓'), level + ' at T+' + atS + ': ' + t);
        assert.match(g.el.querySelector('.dk-level').textContent, new RegExp(level));
      }
    }
    // frequency back in band while SHORT: no BAND ✓ either
    up(view({atS: 40, level, out: 30, hz: 49.7, ms: ms += 600}));
    const t = up(view({atS: 41, level, ms: ms += 100}));
    assert.ok(!t.includes('✓'), t);
  }
});

test('Q-74: while the row shows, the live preview\'s caught words move to its title', () => {
  const {up, g} = gauge();
  const pv = {nadirHz: 49.62, caught: {inertiaMW: 100, batteryMW: 40, guardMW: 0, governorsMW: 260, loadReliefMW: 10, uflsMW: 0}, guardMW: null};
  const caught = g.el.querySelector('.dk-caught'), ptext = g.el.querySelector('.dk-ptext');
  up(view({atS: 100, cont: false}), pv);
  assert.equal(caught.hidden, false);
  assert.doesNotMatch(ptext.getAttribute('title'), /Caught by/);
  up(view({atS: 100, ms: 2000}), pv);
  assert.equal(caught.hidden, true);
  assert.match(ptext.getAttribute('title'), /Caught by GOV 260 · SPIN 100 · BATT 40 · RELIEF 10\.$/);
  assert.match(g.el.getAttribute('aria-label'), /COVER 28:20\.$/, 'the gauge\'s label says the row too');
  assert.match(g.el.querySelector('#q-gauge').title, /COVER counts 30 min to R5 ≥ L/);
});

test('Q-74 on the RESPOND card: SHORT says what to cover and by when, TIGHT already covers, SHEDDING says relight; held feeders stay out', () => {
  const v = view({atS: V.WATCH_S, level: 'TIGHT'}), obs = v.obs;
  const c = Object.assign(obs.contingency, {extremeHz: 49.62, lostMW: 600,
    caught: {inertiaMW: 0, batteryMW: 120, guardMW: 0, governorsMW: 300, loadReliefMW: 20, uflsMW: 0, inverterMW: 0}});
  const line = (level, r5 = obs.sec.lMW) => { const o = structuredClone(obs); Object.assign(o.sec, {level, r5MW: r5}); return W.respondCard(o, c).lines[2]; };
  assert.equal(line('SHORT', obs.sec.lMW - 120), 'N-1 SHORT: 120 MW short: cover it within 29:30.');
  assert.equal(line('TIGHT'), 'N-1 TIGHT: spare covers the next trip, without SECURE\'s margin.');
  assert.equal(line('SECURE'), 'N-1 SECURE: the fleet can take the next trip.');
  const o = structuredClone(obs), d = o.districts.find(x => !x.dark);
  Object.assign(d, {dark: true, shedBy: 'ufls'});
  o.sec.level = 'SHEDDING';
  assert.equal(W.respondCard(o, c).lines[2], 'SHEDDING: 1 districts dark (' + Math.round(d.coldLoadMW) + ' MW): relight them within 29:30.');
  // a held task feeder (the network's until its hand-back, Q-69) is neither counted nor glows the bay
  const h = structuredClone(o);
  Object.assign(h.districts.find(x => !x.dark), {dark: true, shedBy: 'task', clearS: h.s + 600});
  const card = W.respondCard(h, c);
  assert.deepEqual([card.numbers.darkCount, card.lines[2]], [1, W.respondCard(o, c).lines[2]]);
});
