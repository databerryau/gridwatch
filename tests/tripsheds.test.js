// W7 Q2 (decisions/2026-10-16-open-questions.md §2, option A): TRIP SHEDS, the desk's fifth N-1 word. The sim
// keeps its four (SECURE, TIGHT, SHORT, SHEDDING); the desk calls TIGHT with the sim's TRIP PREVIEW below the
// first UFLS stage TRIP SHEDS (desk/calc.js), red, with what it would cost, held against flicker at the edge. The
// gauge, the RESPOND card and the live region say it; app/alarms.js lights LIGHTS AT RISK on it (tests/alarms.test.js).
// Fixtures are views of a real 04:00 observation with the level and the preview poked in: no frames, no sim run,
// except the hold's own test, which reads the sim's preview at the edge on a real dawn (headless, once a grid second).
// (The real page at a real TRIP SHEDS, 2026-10-14 at 05:30 with no input: tests/alarmpanel.test.js.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {followDay} from './lib/follow.js';
import {V} from '../sim/params.js';
import {createState, observe} from '../sim/step.js';
import {stepReal} from '../sim/clock.js';
import {DESK, getScenario} from '../content/scenarios.js';
import {dailyFor} from '../content/dailies.js';
import {tripSheds, shedDistricts, shedsLine, n1Word, SHEDS_MIN_MS} from '../desk/calc.js';
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

test('W7 Q2: what it would cost, in words: "would", rounded down below 49.0 Hz; a held word over a preview back above the relays says so', () => {
  assert.equal(shedsLine(obsAt('TIGHT', 48.996)), 'would fall to 48.99 Hz: the relays would shed 2 districts', 'never "49.00" below the relays');
  assert.equal(shedsLine(obsAt('TIGHT', 48.86)), 'would fall to 48.86 Hz: the relays would shed 4 districts');
  const one = obsAt('TIGHT', 48.95);
  Object.assign(stage(one.districts, 1)[0], {dark: true, shedBy: 'task'});
  assert.equal(shedsLine(one), 'would fall to 48.95 Hz: the relays would shed 1 district');
  assert.equal(shedsLine(obsAt('TIGHT', 49.02)), 'would fall to 49.02 Hz: above the relays now');
  assert.equal(shedsLine(obsAt('TIGHT', 49.3)), 'would fall to 49.30 Hz: above the relays now', 'held over any preview: never "just above" 0.3 Hz up');
});

test('W7 Q2 review: TRIP SHEDS holds SHEDS_MIN_MS real ms after the preview last said it, whatever the Hz, and a TIGHT after it as long; the sim\'s other words and a new day end it at once', () => {
  const mem = {};
  const at = (level, hz, ms, tick = 1000) => { const o = obsAt(level, hz); o.tick = tick; return n1Word(mem, o, ms); };
  assert.ok(SHEDS_MIN_MS >= 1000 && SHEDS_MIN_MS <= 2000, 'about 1-2 real s: 2.5-18 grid-min at 150-540x');
  assert.equal(at('TIGHT', 49.3, 0), 'TIGHT');
  assert.equal(at('TIGHT', 48.99, 100), 'TRIP SHEDS', 'at once from a TIGHT that TRIP SHEDS did not leave');
  // the preview's next refresh lands straight at 49.09 Hz (2026-10-14: 49.05-49.13 Hz after 48.98): held
  assert.equal(at('TIGHT', 49.09, 200), 'TRIP SHEDS');
  assert.equal(at('TIGHT', 49.3, 100 + SHEDS_MIN_MS - 1), 'TRIP SHEDS', 'whatever the Hz');
  assert.equal(at('TIGHT', 49.3, 100 + SHEDS_MIN_MS), 'TIGHT', 'SHEDS_MIN_MS after the preview last said it');
  // back under 49.0 at once: the TIGHT stays its SHEDS_MIN_MS first, then TRIP SHEDS if the preview still says it
  const off = 100 + SHEDS_MIN_MS;
  assert.equal(at('TIGHT', 48.98, off + 10), 'TIGHT', 'no 10-ms TIGHT between two TRIP SHEDS');
  assert.equal(at('TIGHT', 48.98, off + SHEDS_MIN_MS - 1), 'TIGHT');
  // a dip into the old 49.0-49.05 Hz band never lights it again: only the preview below 49.0 does
  assert.equal(at('TIGHT', 49.03, off + SHEDS_MIN_MS), 'TIGHT');
  assert.equal(at('TIGHT', 49.03, off + SHEDS_MIN_MS + 500), 'TIGHT');
  assert.equal(at('TIGHT', 48.98, off + SHEDS_MIN_MS + 600), 'TRIP SHEDS');
  // each time the preview says it again, the hold runs from then
  const on = off + SHEDS_MIN_MS + 600;
  assert.equal(at('TIGHT', 48.99, on + 1000), 'TRIP SHEDS');
  assert.equal(at('TIGHT', 49.2, on + 1000 + SHEDS_MIN_MS - 1), 'TRIP SHEDS');
  assert.equal(at('TIGHT', 49.2, on + 1000 + SHEDS_MIN_MS), 'TIGHT');
  // the sim's own words show at once and end the hold; from them TRIP SHEDS comes at once
  at('TIGHT', 48.99, 20000);
  assert.equal(at('SECURE', 49.6, 20100), 'SECURE');
  assert.equal(at('TIGHT', 49.1, 20200), 'TIGHT');
  at('TIGHT', 48.99, 30000);
  assert.equal(at('SHORT', 48.99, 30100), 'SHORT');
  assert.equal(at('TIGHT', 48.99, 30200), 'TRIP SHEDS', 'SHORT to TRIP SHEDS: no wait');
  at('TIGHT', 48.99, 40000, 5000);
  assert.equal(at('TIGHT', 49.02, 40100, 100), 'TIGHT', 'a day started again (PLAY THIS DAY AGAIN, the shelf)');
});

test('W7 Q2 review: on a real dawn, where the preview lands either side of 49.0 Hz refresh after refresh, the word changes no faster than SHEDS_MIN_MS', () => {
  // 2026-10-14 with no input, 05:00-07:15 (540x, then 270x): the sim's preview read once a grid second, real time from the
  // D-2 profile (sim/clock.js stepReal; a watch at 1x), as the gauge would read it at CRUISE. Before this hold the word
  // changed every 2-500 real ms here (05:15, 05:30-05:34, 06:41-07:13).
  const d = dailyFor(20261014), TPS = V.TICKS_PER_S, from = (5 - V.DAY_START_H) * 3600;
  const mem = {}, spells = [];
  let realMs = 0, lastS = -1, raw = null, flips = 0, word = '', since = 0;
  followDay(d.seed, getScenario(d.scenarioId), {follow: false, untilH: 7.25, onStep: st => {
    if (st.tick % TPS !== 0) return;
    const s = st.tick / TPS;
    if (s < from) return;
    const watch = st.contIdx >= 0 && st.tick < st.conts[st.contIdx].watchEndTick;
    realMs += lastS < 0 ? 0 : (watch ? s - lastS : stepReal(lastS, s)) * 1000;
    lastS = s;
    const r = tripSheds(st.sec);
    if (raw !== null && r !== raw) flips++;
    raw = r;
    const w = n1Word(mem, {tick: st.tick, sec: st.sec}, realMs);
    if (w !== word) { if (word) spells.push({w: word, ms: realMs - since, s, to: w}); word = w; since = realMs; }
  }});
  assert.ok(flips >= 20, 'the preview crosses 49.0 Hz ' + flips + ' times here: the edge this test is about');
  const sheds = spells.filter(p => p.w === 'TRIP SHEDS');
  // (with the hold, 32 crossings make three spells: 05:10, 06:36 and 07:10)
  assert.ok(sheds.length >= 2 && spells.some((p, i) => p.w === 'TIGHT' && i > 0 && spells[i - 1].w === 'TRIP SHEDS'), JSON.stringify(spells));
  // every TRIP SHEDS spell, and every TIGHT between two, lasts SHEDS_MIN_MS (the sim's own words may cut one short)
  for (let i = 0; i < spells.length; i++) {
    const p = spells[i], between = p.w === 'TIGHT' && i > 0 && spells[i - 1].w === 'TRIP SHEDS' && p.to === 'TRIP SHEDS';
    if ((p.w === 'TRIP SHEDS' && p.to === 'TIGHT') || between) {
      assert.ok(p.ms >= SHEDS_MIN_MS - 1e-6, p.w + ' for ' + p.ms.toFixed(0) + ' real ms, to ' + p.to + ' at grid s ' + p.s);
    }
  }
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
  // held over a preview back above the relays, with what is true of it; then TIGHT
  up(49.09, 2000);
  assert.deepEqual([word.textContent, row.textContent], ['▼ TRIP SHEDS', '49.09 Hz: above the relays now']);
  up(49.09, 1100 + SHEDS_MIN_MS);
  assert.deepEqual([word.textContent, row.hidden], ['! TIGHT', true]);
  // and stays TIGHT its SHEDS_MIN_MS though the preview is back under 49.0 Hz: no flicker
  up(48.987, 1100 + SHEDS_MIN_MS + 20);
  assert.deepEqual([word.textContent, row.hidden], ['! TIGHT', true]);
  up(48.987, 1100 + 2 * SHEDS_MIN_MS);
  assert.equal(word.textContent, '▼ TRIP SHEDS');
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
  assert.equal(liveFrame(L, mk('TIGHT', 49.09), 5000 + SHEDS_MIN_MS - 1), null);
  assert.equal(L.level, 'TRIP SHEDS', 'held: the preview back at 49.09 Hz is no change to say');
  assert.ok(SHEDS_MIN_MS < LIVE_GAP_MS);
  assert.equal(liveFrame(L, mk('TIGHT', 49.3), 5000 + LIVE_GAP_MS), 'N-1 TIGHT');
});
