// W3: the verdict (app/verdict.js, app/endcard.js). Pure checks on hand-made memories, then two that run the sim:
//   the no-GUARD twin (D-21) replays a log to the tick before a trip and previews it with no GUARD (lower than with
//   it, and from the pre-trip state); and on the page, a trip then the day's end: the card's LIGHTS, COST, CARBON,
//   the strip, THE MOMENT with what caught it, and THE NUMBERS behind its summary.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as VD from '../app/verdict.js';
import {CARDS} from '../content/cards.js';
import {V} from '../sim/params.js';
import {createState, step} from '../sim/step.js';
import {unitLabel} from '../desk/util.js';
import {previewTrip} from '../sim/physics.js';
import {DESK} from '../content/scenarios.js';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S, H = 3600, MIN = 60;
const sp = (id, by, from, to, mwh = 10, night = false) => ({id, by, stage: 1, from, to, mwh, night});
const memOf = (o = {}) => Object.assign(VD.createVerdictMem(), o);
const cont = (o = {}) => Object.assign({n: 1, startTick: 15 * H * TPS, cause: 'unit', id: 'ccgt1', lostMW: 620, extremeHz: 49.1, uflsStages: 0, backInBandTick: 15 * H * TPS + 100 * TPS,
  caught: {inertiaMW: 300, batteryMW: 20, guardMW: 400, governorsMW: 150, loadReliefMW: 10, uflsMW: 0, inverterMW: 0}}, o);

test('D-20: the lights row names each spell by cause and time with the sim\'s MWh for that cause; cost and carbon against par in words', () => {
  const mem = memOf({spells: [sp('HAR4', 'task', 2 * H + 55 * MIN, 18 * H + 20 * MIN, 5, true), sp('SOL3', 'directed', 14 * H + 30 * MIN, 16 * H + 7 * MIN), sp('RED1', 'ufls', 15 * H + 19 * MIN, -1)]});
  const r = VD.lightsRow(mem, {taskMWh: 5907, directedMWh: 450.4, uflsMWh: 0.02}, {lightsMWh: 0});
  assert.equal(r.text, 'Feeders you went on past: HAR4 from 06:55, relit by the night shift at 22:20 (5,907 MWh). Shed by the city desk: SOL3 18:30–20:07 (450 MWh). ' +
    'Shed by the relays: RED1 from 19:19, still dark at 04:00 (0.0 MWh). Par kept every light on.');
  assert.equal(VD.lightsRow(memOf(), {}, {lightsMWh: 12}).text, 'Every light you were given stayed on. Par: 12 MWh dark.');
  assert.equal(VD.costRow({supplyCents: 3.32}, {supplyCents: 3.2}), '3.3 c/kWh served, par 3.2: dearer by 0.1.');
  assert.equal(VD.carbonRow({co2tPerMWh: 0.6012}, {co2tPerMWh: 0.6}), '0.60 t/MWh, par 0.60: ±0: nothing you did moved it today.');
  assert.equal(VD.carbonRow({co2tPerMWh: 0.58}, {co2tPerMWh: 0.6}), '0.58 t/MWh, par 0.60: cleaner by 0.02.');
});

test('L-10: the strip is red for a minute with a district of yours dark, blue for an hour that spilled, green otherwise, blank unplayed; the chime once, after the peak, only with no red hour before it', () => {
  const mem = VD.createVerdictMem();
  for (let m = 0; m < 3 * 60; m++) { mem.oper[m] = 5000; mem.level[m] = 0; mem.shed[m] = 0; mem.spill[m] = m >= 60 && m < 120 ? (m - 60) * 0.5 : m >= 120 ? 30 : 0; }
  mem.shed[150] = 1; // (a dark spell of the player's open)
  assert.deepEqual(VD.strip(mem).slice(0, 4), ['g', 'b', 'r', '']);
  // the chime: peak 6,000 MW at 18:00, passed (95%) at 19:41; one red minute at 19:15 forbids it
  const ramp = red => {
    const m2 = VD.createVerdictMem();
    let rang = 0;
    for (let k = 12 * 60; k < 16 * 60; k++) {
      m2.oper[k] = k <= 14 * 60 ? 5000 + k - 12 * 60 : 6000 - (k - 14 * 60) * 3; m2.level[k] = 0; m2.shed[k] = red && k === 14 * 60 + 75 ? 1 : 0;
      // (verdictSecond's minute half, called directly: the chime's rule)
      if (VD.cleanRampAt(m2, k)) rang++;
    }
    return rang;
  };
  assert.deepEqual([ramp(false), ramp(true)], [1, 0]);
});

test('D-24: one card, the most dramatic trigger first; each with a source URL and a simplification line', () => {
  for (const c of CARDS) assert.ok(/^https:\/\//.test(c.source) && c.simplifies.length > 20 && c.text.length > 40, c.id);
  const mem = memOf(), none = VD.historyCard(mem, [], false);
  assert.equal(none, null);
  assert.equal(VD.historyCard(mem, [cont()], false).id, 'battery');
  assert.equal(VD.historyCard(mem, [cont({uflsStages: 1})], false).id, 'ufls');
  assert.equal(VD.historyCard(mem, [cont({uflsStages: 1})], true).id, 'black');
  mem.price.fill(-20, 0, 40);
  assert.equal(VD.historyCard(mem, [], false).id, 'negative');
});

test('D-21: the moment is the first shed, else the largest trip, else the thinnest margin; with at least three live numbers, YOUR GUARD named', () => {
  const pm = s => ({lowHz: 49.8, highHz: 50.1, r5MW: 900});
  const small = cont({n: 1, extremeHz: 49.7}), big = cont({n: 2, startTick: 16 * H * TPS, extremeHz: 49.1});
  const t = VD.moment(memOf(), [small, big], {parMinute: pm, twin: {done: true, nadirHz: 48.9}, guardMW: 400});
  assert.equal(t.kind, 'trip');
  assert.equal(t.s, 16 * H);
  assert.deepEqual(t.text, ['20:00: ' + unitLabel('ccgt1') + ' tripped (620 MW). Frequency fell to 49.10 Hz.',
    'Caught by spin 300 MW, YOUR GUARD 400 MW, the battery 20 MW, governors 150 MW, load relief 10 MW.', 'With no GUARD (400 MW held back): 48.90 Hz.',
    'Par at 20:00: lowest 49.80 Hz, 900 MW spare in 5 min.']);
  assert.ok(Object.values(t.numbers).filter(Number.isFinite).length >= 3, JSON.stringify(t.numbers));
  const shed = VD.moment(memOf({spells: [sp('SOL3', 'directed', 14 * H, 15 * H)]}), [big], {parMinute: pm});
  assert.deepEqual([shed.kind, shed.s], ['shed', 14 * H]);
  assert.match(shed.text[0], /^18:00: the city desk shed SOL3 to hold frequency\./);
  const night = VD.moment(memOf({spells: [sp('SOL3', 'directed', 18 * H, 19 * H)]}), [big], {nightS: 17 * H});
  assert.equal(night.kind, 'trip', 'a shed in the night roll is the night shift\'s');
  const mem = memOf();
  for (let m = 0; m < 600; m++) { mem.r5[m] = 1000 - (m === 300 ? 800 : 0); mem.L[m] = 600; }
  const mg = VD.moment(mem, [], {parMinute: pm});
  assert.deepEqual([mg.kind, mg.s, mg.text[0]], ['margin', 300 * MIN, '09:00: your thinnest margin. 200 MW spare in 5 min for a 600 MW risk.']);
});

test('D-21: the no-GUARD twin replays the log to the tick before the trip and previews it with no GUARD: lower than the same preview with the GUARD', () => {
  const g = V.PLAYER_START_TICK + 10, T = V.PLAYER_START_TICK + 20 * MIN * TPS;
  const log = [{tick: g, type: 'guard', args: {mw: 400}}];
  const tw = VD.createTwin(20261007, DESK, log, {startTick: T, cause: 'unit', id: 'coal1', lostMW: 500});
  let n = 0;
  while (!tw.step(20000) && n++ < 1000);
  assert.ok(tw.done && Number.isFinite(tw.nadirHz), 'done: ' + tw.nadirHz);
  // the same state by hand: the guard on, the preview with it and without
  const st = createState(20261007, DESK);
  while (st.tick < T) { step(st, st.tick === g ? [{type: 'guard', mw: 400}] : []); }
  assert.equal(st.battery.guardMW, 400);
  const withG = previewTrip(st, {kind: 'unit', id: 'coal1'}).nadirHz, noG = previewTrip(st, {kind: 'unit', id: 'coal1'}, {guardMW: 0}).nadirHz;
  assert.equal(tw.nadirHz, noG);
  assert.ok(noG < withG, noG + ' < ' + withG);
});

test('W3 on the page: a trip, then the day\'s end: LIGHTS, COST, CARBON, the strip, THE MOMENT with what caught it, the card, THE NUMBERS behind its summary', () => {
  const p = openGame({seed: 20261007}), st = p.game.state;
  for (let i = 0; i < 6 && p.to('10:00', {stop: [], line: 'near'}).why.startsWith('held'); i++) p.key('Escape'); // (the morning's hand-backs)
  injectTrip(st, 6 * H + 60);
  assert.equal(p.until('trip', {max: '+5m', line: 'near'}).why, 'trip');
  p.until('card', {max: '+5m', line: 'near'});
  p.key('Enter');
  p.to('+20m', {stop: [], line: 'near'});
  st.over = true;
  p.frames(2);
  const end = p.look({controls: false}).split('\n').find(l => l.startsWith('END '));
  assert.match(end, / LIGHTS (Every light|Feeders)/);
  assert.match(end, / COST \d+\.\d c\/kWh served\. CARBON \d\.\d\d t\/MWh\. /);
  assert.match(end, / THE MOMENT 10:01: .* tripped \(\d[\d,]* MW\)\. Frequency fell to 4\d\.\d\d Hz\. Caught by [^.]*\d MW\. Your GUARD was at 0 MW: this was the fall with no GUARD\. /);
  assert.match(end, / THE NUMBERS YOU /);
  assert.equal(p.$('end-strip').children.filter(c => c.className === 's-g' || c.className === 's-r' || c.className === 's-b').length, 7, '04:00 to 10:21: seven hours played');
  assert.equal(p.$('end-numbers').tagName, 'DETAILS');
  assert.deepEqual(p.h.mods.errors, []);
});
