// W7 Q2 (decisions/2026-10-16-open-questions.md §2, option A): TRIP SHEDS, the desk's fifth N-1 word. The sim
// keeps its four (SECURE, TIGHT, SHORT, SHEDDING); the desk calls TIGHT with the sim's TRIP PREVIEW below the
// first UFLS stage TRIP SHEDS (desk/calc.js), red, with what it would cost, held against flicker at the edge. The
// gauge, the RESPOND card and the live region say it; app/alarms.js lights LIGHTS AT RISK on it (tests/alarms.test.js).
// Fixtures are views of a real 04:00 observation with the level and the preview poked in: no frames, no sim run.
// (The real page at a real TRIP SHEDS, 2026-10-14 at 05:30 with no input: tests/alarmpanel.test.js.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {V} from '../sim/params.js';
import {createState, observe} from '../sim/step.js';
import {DESK} from '../content/scenarios.js';
import {tripSheds, shedDistricts, shedsLine, n1Word, SHEDS_MIN_MS, SHEDS_HOLD_HZ} from '../desk/calc.js';
import {createGauge, LEVEL_GLYPH} from '../desk/gauge.js';
import {createLive, liveFrame, LIVE_GAP_MS} from '../app/shell.js';
import * as W from '../app/watch.js';

const BASE = observe(createState(20261014, DESK));
/** BASE with every district lit (04:00 has feeders under repair) and the N-1 level and preview poked in. */
function obsAt(level, hz, o = {}) {
  const x = structuredClone(BASE);
  for (const d of x.districts) Object.assign(d, {dark: false, shedBy: null});
  Object.assign(x.sec, {level, previewNadirHz: hz, previewUnitHz: hz, previewLinkHz: 49.4, lKind: 'unit', lId: 'coal1', r5MW: 1121, lMW: 621}, o);
  return x;
}
const stage = (ds, k) => ds.filter(d => d.uflsStage === k);

test('W7 Q2: TRIP SHEDS is TIGHT with the preview below the first UFLS stage; SECURE, SHORT and SHEDDING keep their own words', () => {
  const sec = (level, hz, lKind = 'unit') => ({level, previewNadirHz: hz, lKind});
  assert.equal(tripSheds(sec('TIGHT', 48.999)), true);
  assert.equal(tripSheds(sec('TIGHT', V.UFLS_FIRST_HZ)), false, 'at 49.0 Hz no relay operates');
  assert.equal(tripSheds(sec('TIGHT', 49.3)), false, 'caught above the relays: TIGHT');
  for (const lv of ['SHORT', 'SHEDDING', 'SECURE']) assert.equal(tripSheds(sec(lv, 48.5)), false, lv);
  assert.equal(tripSheds(sec('TIGHT', 48.5, 'none')), false, 'no credible risk');
  // its own glyph and colour on the gauge (K-22: never colour alone)
  assert.equal(new Set(Object.values(LEVEL_GLYPH)).size, 5);
  assert.equal(LEVEL_GLYPH['TRIP SHEDS'], '▼');
});

test('W7 Q2: the districts it would shed: the lit ones of each stage whose threshold is above the nadir; a spent stage sheds none', () => {
  const ds = obsAt('TIGHT', 50).districts;
  for (let k = 1; k <= V.UFLS_STAGES; k++) assert.equal(stage(ds, k).length, 2, 'two districts a stage (§8.2)');
  assert.equal(shedDistricts(ds, 49.01), 0);
  assert.equal(shedDistricts(ds, 48.99), 2);
  assert.equal(shedDistricts(ds, V.UFLS_FIRST_HZ - V.UFLS_STEP_HZ), 2, 'at the second stage\'s threshold it does not operate');
  assert.equal(shedDistricts(ds, 48.80), 4);
  assert.equal(shedDistricts(ds, 40), 2 * V.UFLS_STAGES);
  // a district already dark (a feeder under repair) is not shed again
  Object.assign(stage(ds, 1)[0], {dark: true, shedBy: 'task'});
  assert.equal(shedDistricts(ds, 48.99), 1);
  // a stage that has operated is spent until all its districts are back (sim/fleet.js rearmUfls)
  Object.assign(stage(ds, 2)[0], {dark: true, shedBy: 'ufls'});
  assert.equal(shedDistricts(ds, 48.80), 1);
});

test('W7 Q2: what it would cost, in words: "would", rounded down below 49.0 Hz; a held word over a preview back at the edge says so', () => {
  assert.equal(shedsLine(obsAt('TIGHT', 48.996)), 'would fall to 48.99 Hz: the relays would shed 2 districts', 'never "49.00" below the relays');
  assert.equal(shedsLine(obsAt('TIGHT', 48.86)), 'would fall to 48.86 Hz: the relays would shed 4 districts');
  const one = obsAt('TIGHT', 48.95);
  Object.assign(stage(one.districts, 1)[0], {dark: true, shedBy: 'task'});
  assert.equal(shedsLine(one), 'would fall to 48.95 Hz: the relays would shed 1 district');
  assert.equal(shedsLine(obsAt('TIGHT', 49.02)), 'would fall to 49.02 Hz: just above the relays');
});

test('W7 Q2: the word holds 3 real s while the preview stays within 0.05 Hz of the relays; a clear rise, the sim\'s other words or a new day end it at once', () => {
  const mem = {};
  const at = (level, hz, ms, tick = 1000) => { const o = obsAt(level, hz); o.tick = tick; return n1Word(mem, o, ms); };
  assert.equal(at('TIGHT', 49.3, 0), 'TIGHT');
  assert.equal(at('TIGHT', 48.99, 100), 'TRIP SHEDS');
  assert.equal(at('TIGHT', 49.02, 200), 'TRIP SHEDS', 'held: the preview hovers at the edge for grid minutes');
  assert.equal(at('TIGHT', 49.02, 100 + SHEDS_MIN_MS - 1), 'TRIP SHEDS');
  assert.equal(at('TIGHT', 49.02, 100 + SHEDS_MIN_MS), 'TIGHT', 'after 3 real s');
  at('TIGHT', 48.99, 5000);
  assert.equal(at('TIGHT', V.UFLS_FIRST_HZ + SHEDS_HOLD_HZ, 5100), 'TIGHT', 'a preview clearly above ends it at once');
  assert.equal(SHEDS_HOLD_HZ, V.PREVIEW_MARGIN_HZ, 'the preview\'s own allowance');
  at('TIGHT', 48.99, 6000);
  assert.equal(at('SECURE', 49.6, 6100), 'SECURE');
  at('TIGHT', 48.99, 7000);
  assert.equal(at('SHORT', 48.99, 7100), 'SHORT');
  at('TIGHT', 48.99, 8000, 5000);
  assert.equal(at('TIGHT', 49.02, 8100, 100), 'TIGHT', 'a day started again (PLAY THIS DAY AGAIN, the shelf)');
});

test('W7 Q2 on the gauge: ▼ TRIP SHEDS in red, what it would cost in the caught line\'s place, whole in its title and the label; held, then TIGHT', () => {
  const doc = makeDocument(), g = createGauge({doc, note() {}, cue() {}, ui() {}}, doc.body);
  const word = g.el.querySelector('.dk-level'), row = g.el.querySelector('.dk-sheds'), ptext = g.el.querySelector('.dk-ptext');
  const caught = g.el.querySelector('.dk-caught');
  const up = (hz, ms, pv = null) => g.update(baseVm(obsAt('TIGHT', hz), {frame: {nowMs: ms, dtS: 1 / 60, alpha: 0}}), pv);
  up(49.3, 0);
  assert.deepEqual([word.textContent, word.className, row.hidden], ['! TIGHT', 'dk-level lv-TIGHT', true]);
  up(48.987, 1000);
  assert.deepEqual([word.textContent, word.className], ['▼ TRIP SHEDS', 'dk-level lv-TRIP-SHEDS']);
  assert.equal(ptext.textContent, '✕ 48.98 Hz · U 48.98 L 49.40', 'the preview\'s figure rounded down too: one figure on the gauge');
  assert.deepEqual([row.hidden, row.textContent], [false, '48.98 Hz: the relays would shed 2 districts']);
  assert.equal(row.getAttribute('title'), 'If COAL 1 tripped now, frequency would fall to 48.98 Hz: the relays would shed 2 districts.');
  assert.match(g.el.getAttribute('aria-label'), /^N-1 gauge: TRIP SHEDS: would fall to 48\.98 Hz: the relays would shed 2 districts\. Spare in 5 minutes 1121 MW/);
  assert.match(g.el.querySelector('#q-gauge').title, /TRIP SHEDS is TIGHT with the TRIP PREVIEW below 49\.0 Hz: the spare is there, but frequency would fall faster than it arrives/);
  // the face fits the gauge at the floor: the longest (16 districts) in 8-px mono (0.62 em) across the 232-px column less its edge
  assert.ok('48.98 Hz: the relays would shed 16 districts'.length * 0.62 * 8 <= 232 - 8);
  // the live preview (T, the ring turning) has the place for what it caught
  up(48.987, 1100, {nadirHz: 49.1, caught: {inertiaMW: 100, batteryMW: 40, guardMW: 200, governorsMW: 260, loadReliefMW: 10, uflsMW: 0}, guardMW: 200});
  assert.deepEqual([row.hidden, caught.hidden], [true, false]);
  // held over a preview back at the edge, with what is true of it; then TIGHT
  up(49.02, 2000);
  assert.deepEqual([word.textContent, row.textContent], ['▼ TRIP SHEDS', '49.02 Hz: just above the relays']);
  up(49.02, 1100 + SHEDS_MIN_MS);
  assert.deepEqual([word.textContent, row.hidden], ['! TIGHT', true]);
});

test('W7 Q2 on the RESPOND card: TRIP SHEDS says the spare is there but too slow, and what the next trip would shed; only TIGHT says the spare covers it', () => {
  const c = {n: 1, lostMW: 600, extremeHz: 49.41, startTick: 0, secureByTick: V.SECURE_AGAIN_S * V.TICKS_PER_S,
    caught: {inertiaMW: 0, batteryMW: 120, guardMW: 0, governorsMW: 300, loadReliefMW: 20, uflsMW: 0, inverterMW: 0}};
  const line = o => { o.tick = V.WATCH_S * V.TICKS_PER_S; return W.respondCard(o, c).lines[2]; };
  const sheds = line(obsAt('TIGHT', 48.97));
  assert.equal(sheds, 'N-1 TRIP SHEDS: enough spare, but too slow to catch the next trip. Frequency would fall to 48.97 Hz: the relays would shed 2 districts.');
  assert.ok(!/covers/.test(sheds), 'the brief: "spare covers the next trip" is false when it would shed');
  assert.equal(line(obsAt('TIGHT', 49.3)), 'N-1 TIGHT: spare covers the next trip, without SECURE\'s margin.');
  assert.match(line(obsAt('SHORT', 48.97, {r5MW: 500})), /^N-1 SHORT: 121 MW short: cover it within /);
});

test('W7 Q2 in the live region: the N-1 word is the desk\'s, TRIP SHEDS included, and a flap back inside the hold says nothing', () => {
  const mk = (level, hz) => ({obs: {tick: 100, f: {hz: 50}, sec: {level, previewNadirHz: hz, lKind: 'unit'}}, mode: {mode: 'CRUISE', rate: 120, watchS: -1},
    alarms: {tiles: []}, tray: {cards: []}});
  const L = createLive();
  assert.equal(liveFrame(L, mk('TIGHT', 49.3), 0), null, 'the first frame only takes note');
  assert.equal(liveFrame(L, mk('TIGHT', 48.99), 5000), 'N-1 TRIP SHEDS');
  assert.equal(liveFrame(L, mk('TIGHT', 49.02), 5000 + LIVE_GAP_MS), null, 'held: still TRIP SHEDS');
  assert.equal(liveFrame(L, mk('TIGHT', 49.3), 5000 + 2 * LIVE_GAP_MS), 'N-1 TIGHT');
});
