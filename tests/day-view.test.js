// Slice 2c's view of the day (desk/README.md §32.7.4; Q-63, Q-68, Q-69, Q-73, Q-78): the Live Stack's
// columns carry the lit city's load (sim/dark.js, as par's), the tie limit and a unit's outage; the
// map's night windows on the occupancy curve; a held task feeder's blue label, words and card; the
// stack's act ticks and onset markers, its redraw cap and its night freeze. States are reached by
// stepping the sim to 04:30 or by injecting records (tests/lib/inject.js); views are poked, never walked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, observe, applyInput} from '../sim/step.js';
import {darkShareAt, litMW} from '../sim/dark.js';
import {unitIndex} from '../sim/fleet.js';
import {DESK} from '../content/scenarios.js';
import * as PV from '../app/planview.js';
import {createSuburbCard} from '../app/suburbcard.js';
import {createMap, mapLabels, mapSummary, occupancy} from '../render/map.js';
import {createLiveStack, stackMarks, stackSummary} from '../render/livestack.js';
import * as D from '../render/mapdata.js';
import {clockText} from '../render/format.js';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {stateWith} from './lib/inject.js';
import {legacyDesk} from './lib/sim-helpers.js';
import {openGame} from './lib/play.js';

const TPS = V.TICKS_PER_S, HOT = 20261007; // a DESK weekday whose Act I task holds RED5 and RED7 dark from 04:00
const hhS = (h, m = 0) => (h - V.DAY_START_H) * 3600 + m * 60;
const C2 = V.MACHINES[unitIndex('ccgt2')], TO_MIN = C2.t1S + V.AUTO_SYNC_S + C2.t2S, TIE_RATE = V.TIE_RAMP_MW_MIN / 60;
const run = (s, S) => { while (s.tick < S * TPS) step(s, []); return s; };
let HOT0430 = null;
/** HOT's live day at 04:30, nobody at the desk (the state as JSON, parsed per call). */
const hot0430 = () => JSON.parse(HOT0430 ||= JSON.stringify(run(createState(HOT, DESK), V.PLAYER_START_S)));

function mount(make, w, h) {
  const doc = makeDocument(), root = doc.createElement('div'), ui = [], sent = [];
  doc.body.appendChild(root);
  const v = make(doc, root, {ui: c => ui.push(c), input: x => { sent.push(x); return ''; }});
  v.el.clientWidth = w; v.el.clientHeight = h;
  const cv = v.el.querySelector('canvas');
  cv.rect = {left: 0, top: 0, width: w, height: h};
  return {doc, v, ui, sent, cv};
}

test('Q-69: each column\'s load is without the task feeders held at its time (litMW, darkShareAt): no phantom red gap before a hand-back, a step up at each; UFLS darkness stays on it', () => {
  const obs = observe(hot0430()), fc = obs.forecast, P = PV.project(obs);
  const red = obs.districts.filter(d => d.dark && d.clearS > obs.s).sort((a, b) => a.clearS - b.clearS);
  assert.deepEqual(red.map(d => d.id + ' ' + clockText(d.clearS, false)), ['RED7 06:45', 'RED5 07:15'], 'HOT is a task morning');
  const one = structuredClone(obs);
  one.districts.find(d => d.id === red[0].id).dark = false; // (from 06:45 RED5 alone is held)
  const lit = (o, q, k) => litMW(fc[k][q], fc.rooftopMW[q], darkShareAt(o, P.times[q])), ks = ['demandP50', 'demandP10', 'demandP90'];
  for (let q = 0; q < P.n; q++) {
    const t = P.times[q], want = t >= red[1].clearS ? ks.map(k => fc[k][q]) : ks.map(k => lit(t < red[0].clearS ? obs : one, q, k));
    assert.deepEqual([P.p50[q], P.p10[q], P.p90[q]], want, clockText(t, false));
    assert.equal(P.load[q], P.p50[q]);
    assert.equal(P.deficit[q], P.load[q] - P.supply[q]);
  }
  // each announced return is a step up of its feeder's load (it is the desk's from then)
  for (const d of red) {
    const k = P.times.findIndex(t => t >= d.clearS);
    assert.ok(P.load[k] - P.load[k - 1] > 90, d.id + ' back at ' + clockText(P.times[k], false) + ': +' + Math.round(P.load[k] - P.load[k - 1]) + ' MW');
  }
  assert.ok(fc.demandP50[0] - P.supply[0] > PV.GAP_MIN_MW, 'against the whole city\'s P50 the first column would read SHORT');
  assert.notEqual(P.gap[0], 'red', 'against the lit city it does not');
  // UFLS or directed darkness is the player's to relight: it stays on the load, and so does its red gap (as 2b's stack)
  const shed = structuredClone(obs);
  for (const d of shed.districts) if (d.suburb === 'HAZ') Object.assign(d, {dark: true, shedBy: 'ufls'});
  const S = PV.project(shed);
  assert.deepEqual([Array.from(S.load), S.gap], [Array.from(P.load), P.gap]);
});

test('Q-69: the past columns are without the held feeders too: on HOT at 05:00 the last past demand meets the first future column', () => {
  const p = openGame({seed: HOT});
  p.to('05:00', {stop: []});
  const vm = p.vm(), P = PV.project(vm.obs, {hist: vm.hist}), raw = PV.pastFromHist(vm.hist, P.pastTimes);
  const last = P.past.demand[PV.N_PAST - 1];
  assert.ok(Math.abs(last - P.p50[0]) < 50, 'past ' + Math.round(last) + ' MW, next ' + Math.round(P.p50[0]) + ' MW');
  assert.ok(raw.demand[PV.N_PAST - 1] - P.p50[0] > 200, 'the whole city\'s demand would stand a cliff above the now line');
});

test('Q-68: the tie limit holds each column\'s import until its end; an injected outage puts CCGT 2\'s earliest line and ghost at its return + startToMin, and a 06:00 booking starts at the return', () => {
  const OUT = hhS(7, 30), END = hhS(6, 30), BOOK = hhS(6);
  const s = run(stateWith(HOT, legacyDesk(), [{atS: 0, type: 'unitOutage', args: {unit: 'ccgt2', untilS: OUT}}, {atS: 0, type: 'tieDerate', args: {limitMW: 400, untilS: END}},
    {atS: END, type: 'tieDerateEnd', args: {}}, {atS: OUT, type: 'unitReturn', args: {unit: 'ccgt2'}}]), V.PLAYER_START_S);
  assert.ok(applyInput(s, {type: 'tie', mw: V.TIE_MAX_MW}).ok);
  let obs = observe(s), P = PV.project(obs);
  assert.equal(obs.units[unitIndex('ccgt2')].startBlock, 'on outage until 07:30');
  // (the executor steps 10 s, so a column within a step of the end may have begun the ramp)
  for (let q = 0; q < P.n; q++) if (P.times[q] < END - 10) assert.equal(P.tie[q], 400, 'the limit at ' + clockText(P.times[q], false));
  assert.equal(P.tie[P.n - 1], V.TIE_MAX_MW, 'after the derate imports ramp to the full 800 MW');
  assert.equal(P.earliest.ccgt2, OUT + TO_MIN, 'the earliest line: the return + startToMin');
  const snap = PV.snapStart(obs, 'ccgt2', BOOK + TO_MIN);
  assert.ok(snap.infeasible && snap.ghost.onAtS >= OUT + TO_MIN, 'a drag before the return lands on the first step after it');
  const big = PV.earliestArrival(obs, 'ccgt', C2.ratingMW * 2);
  assert.deepEqual(big.starts, [{unit: 'ccgt2', onAtS: OUT + TO_MIN}]);
  // the tie helps a gap after the limit's end when it is set at the limit (L-9), and never when it is set past it
  const knob = mw => PV.glowCandidates({...obs, tie: {...obs.tie, setMW: mw}}).filter(c => c.id === 'knob-tie').map(c => c.atS);
  assert.deepEqual([knob(400), knob(V.TIE_MAX_MW)], [[END + Math.ceil(PV.SNAP_MW / TIE_RATE)], []]);
  const {v: stack, cv} = mount(createLiveStack, 336, 164);
  stack.update(baseVm(Object.assign(structuredClone(obs), {mode: 'HAND'}))); // (K-24: a drag on the stack is a HAND day's)
  assert.deepEqual(stack.debug.ghosts.filter(g => g.station === 'ccgt').map(g => [g.unit, g.atS]), [['ccgt2', OUT + TO_MIN]], 'the stack\'s ghost');
  // the ghost says why it is late, and so does a drag before it
  const gh = stack.debug.ghosts.find(g => g.unit === 'ccgt2'), y = gh.y + gh.h / 2, xBook = stack.debug.geom.x(BOOK + TO_MIN);
  cv.dispatch('pointermove', {clientX: gh.x + 2, clientY: y});
  assert.match(stack.el.querySelector('.livestack-tip').textContent, new RegExp('^CCGT 2 is on outage until 07:30: earliest on ' + clockText(OUT + TO_MIN, false) + '\n'));
  for (const [type, x] of [['pointerdown', gh.x + 2], ['pointermove', xBook], ['pointerup', xBook]]) cv.dispatch(type, {clientX: x, clientY: y, pointerId: 1});
  assert.match(stack.debug.message, new RegExp('^Too soon: CCGT 2 is on outage until 07:30, so earliest ' + clockText(Math.ceil((OUT + TO_MIN) / 900) * 900, false) + '\\. '));
  // a booking made by planLoad before the return waits in plan.starts (the sim's startDueS): the mirror starts it at OUT;
  // a tie key under the limit leads from the import the limit lets run (100 MW at 06:00 from 400, not 800: grid.js tiePlanSecond)
  assert.ok(applyInput(s, {type: 'planLoad', fromS: s.tick / TPS, stations: {}, tie: [[BOOK, 100]], starts: [['ccgt2', BOOK]], stops: []}).ok);
  obs = observe(s); P = PV.project(obs);
  assert.deepEqual(obs.plan.starts, [{unit: 'ccgt2', atS: BOOK}]);
  const q = P.times.findLastIndex(t => t <= BOOK - (400 - 100) / TIE_RATE), sim = run(JSON.parse(JSON.stringify(s)), P.times[q]);
  assert.deepEqual([P.tie[q], sim.tie.flowMW], [400, 400], 'at the limit until the lead at ' + clockText(P.times[q], false));
  assert.ok(Math.abs(P.tie[q + 1] - 100) < 1e-9, 'the key reached');
  const out = P.units.ccgt2;
  for (let q = 0; q < P.n; q++) {
    if (P.times[q] <= OUT) assert.equal(out[q], 0, 'off until its return: ' + clockText(P.times[q], false));
    if (P.times[q] >= OUT + TO_MIN) assert.ok(out[q] >= C2.minMW - 1e-9, 'online from the return + startToMin: ' + clockText(P.times[q], false));
  }
  stack.update(baseVm(structuredClone(obs), {frame: {nowMs: 2000}}));
  assert.deepEqual(stack.debug.handles.filter(h => h.kind === 'start').map(h => [h.unit, h.onAtS]), [['ccgt2', OUT + TO_MIN]], 'its START handle sits where it comes on');
});

test('Q-73: the night windows follow the occupancy curve (0.9 at 21:00, 0.15 from 01:00, waking 05:30-07:30) times the demand, in about 30 steps', () => {
  assert.deepEqual([21, 1, 3, 5.5, 7.5, 12].map(occupancy), [0.9, 0.15, 0.15, 0.15, 0.9, 0.9]);
  for (let h = 21; h < 25; h += 0.25) assert.ok(occupancy(h + 0.25) < occupancy(h), 'falling at ' + h);
  const {v: map} = mount(createMap, 1280, 268), vm = baseVm(observe(createState(1, DESK)));
  vm.obs.demand.underlyingMW = 5000;
  const windows = h => {
    vm.obs.clock.h = h; vm.frame.nowMs += 16; map.update(vm);
    return Object.values(map.debug.districts).reduce((a, d) => a + d.windows, 0);
  };
  const w21 = windows(21), w0030 = windows(0.5), w03 = windows(3);
  assert.ok(w21 > 3 * w0030 && w0030 > w03 && w03 > 0, 'windows lit: 21:00 ' + w21 + ', 00:30 ' + w0030 + ', 03:00 ' + w03);
  // the night roll redraws the city one step at a time: one rebuild per step, 21:00 to 04:00 by the minute
  const r0 = map.debug.rebuilds.city;
  for (let m = 0; m <= 7 * 60; m++) windows(21 + m / 60);
  const steps = map.debug.rebuilds.city - r0;
  assert.ok(steps >= 15 && steps <= 31, steps + ' city rebuilds in the night');
});

test('Q-69: a held task feeder\'s suburb: a blue label with its hand-back times, the words, a card that reads them and offers no RESTORE, and a click that keeps the focus; then today\'s alarm', () => {
  const obs = observe(hot0430()), red = obs.districts.filter(d => d.suburb === 'RED' && d.dark).sort((a, b) => a.clearS - b.clearS);
  const [t1, t2] = red.map(d => clockText(d.clearS, false));
  assert.deepEqual([t1, t2], ['06:45', '07:15']);
  const label = (o, hover = null) => mapLabels(baseVm(o), hover).find(l => l.id === 'sub:RED');
  const said = o => /Districts dark: ([^.]*)\./.exec(mapSummary(baseVm(o), null))[1];
  assert.deepEqual(label(obs), {id: 'sub:RED', text: 'REDGUM FLATS: 2 DARK · BACK 06:45, 07:15', kind: 'info'});
  assert.deepEqual(label(obs, 'sub:RED'), label(obs), 'pointing at it keeps its times');
  assert.equal(said(obs), 'Redgum Flats 2 (under repair until 06:45, 07:15)');
  // the first hand-back: today's red alarm until it is closed, naming the one still held; then the second's time alone
  const back = structuredClone(obs);
  back.s = red[0].clearS;
  assert.deepEqual(label(back), {id: 'sub:RED', text: 'REDGUM FLATS: 2 DARK (1 BACK 07:15)', kind: 'alarm'});
  assert.equal(said(back), 'Redgum Flats 2 (1 under repair until 07:15)');
  back.districts.find(d => d.id === red[0].id).dark = false;
  assert.deepEqual(label(back), {id: 'sub:RED', text: 'REDGUM FLATS: 1 DARK · BACK 07:15', kind: 'info'});
  // one clearance for both (2e's forced first shift) is said once; a shed district beside the held two is counted apart
  const once = structuredClone(obs), plus = structuredClone(obs);
  once.districts.forEach(d => { if (d.clearS >= 0) d.clearS = red[0].clearS; });
  assert.equal(label(once).text, 'REDGUM FLATS: 2 DARK · BACK 06:45');
  Object.assign(plus.districts.find(d => d.id === 'RED1'), {dark: true, shedBy: 'ufls'});
  assert.deepEqual([label(plus).text, label(plus).kind, said(plus)], ['REDGUM FLATS: 3 DARK (2 BACK 06:45, 07:15)', 'alarm', 'Redgum Flats 3 (2 under repair until 06:45, 07:15)']);
  // a blue label never takes a red alarm's place (at most 3 at rest): HAZ, HAR and SAL shed, RED held
  const busy = structuredClone(obs);
  for (const d of busy.districts) if (['HAZ1', 'HAR1', 'SAL1'].includes(d.id)) Object.assign(d, {dark: true, shedBy: 'ufls'});
  assert.deepEqual(mapLabels(baseVm(busy), null).map(l => l.id + ' ' + l.kind), ['sub:HAZ alarm', 'sub:HAR alarm', 'sub:SAL alarm']);
  // the card: the times in blue, no RESTORE to steal the focus before the hand-back; RESTORE once one is the desk's
  const doc = makeDocument(), root = doc.createElement('div'), ui = [];
  doc.body.appendChild(root);
  const card = createSuburbCard(doc, root, {ui: c => ui.push(c), input: () => ''}, {toast() {}, loadText() {}, toggleHelp() {}, now: () => 0});
  const vm = o => baseVm(structuredClone(o), {suburb: 'RED', phase: 'play'});
  card.update(vm(obs), 1);
  const dark = () => root.querySelector('.info').textContent.trim();
  assert.equal(dark(), '2 DARK · BACK 06:45, 07:15');
  assert.equal(doc.getElementById('city-RED-restore'), null);
  card.focus();
  assert.equal(doc.activeElement.id, 'city-soak-all', 'the first row takes the focus (W7 Q1: SOAK THE CITY, the soak\'s first)');
  const handed = structuredClone(obs);
  handed.s = red[0].clearS;
  card.update(vm(handed), 1);
  assert.equal(dark(), '2 DARK (1 BACK 07:15): RESTORE');
  card.focus();
  assert.equal(doc.activeElement.id, 'city-RED-restore', 'once one is the desk\'s, RESTORE is the first row');
  handed.districts.forEach(d => { d.clearS = -1; });
  card.update(vm(handed), 1);
  assert.equal(dark(), '2 DARK: RESTORE', 'today\'s face without the task');
  // the map: a click on the held suburb opens its card without sending the focus to the RESTORE bay
  const {v: map, ui: mui, cv} = mount(createMap, 1280, 268), turned = structuredClone(obs);
  turned.s = red[0].clearS;
  for (const [o, want] of [[obs, [{do: 'suburb', id: 'RED'}]], [turned, [{do: 'focus', target: 'bay-restore'}, {do: 'suburb', id: 'RED'}]]]) {
    map.update(baseVm(structuredClone(o)));
    const L = map.debug.layout, b = D.SUBURBS.find(x => x.id === 'RED').box;
    cv.dispatch('click', {clientX: L.dx + (b[0] + b[2] / 2) * L.scale, clientY: L.dy + (b[1] + b[3] / 2 - L.srcY) * L.scale});
    assert.deepEqual(mui.splice(0), want);
  }
});

test('Q-78 / Q-63 / Q-73: the stack\'s act ticks and warned onsets ahead (drawn and said), its idle redraw at most STACK_MAX_HZ, and frozen from the night shift', () => {
  const obs = observe(hot0430()), heat = obs.news.find(n => n.kind === 'heat');
  assert.ok(heat && heat.fromS > hhS(12), 'HOT\'s heatwave is announced at 04:00');
  assert.deepEqual(stackMarks(obs, V.DAY_S).map(k => [k.text, clockText(k.atS, false)]),
    [['II', '09:00'], ['III', '14:30'], ['HEAT', clockText(heat.fromS, false)], ['NIGHT', '21:00']].sort((a, b) => (a[1] < b[1] ? -1 : 1)));
  // the view an hour on (the forecast relabelled: 05:30-10:00), a storm warned for 2 h ahead and a tie derate
  const vm = baseVm(structuredClone(obs)), s = vm.obs.s += 3600;
  vm.obs.forecast.fromS += 3600;
  vm.obs.news.push({atS: s, kind: 'storm', fromS: s + 7200, toS: null, text: ''}, {atS: s, kind: 'tie', fromS: 0, toS: hhS(11), text: ''});
  const {v: stack, cv, doc} = mount(createLiveStack, 336, 164);
  stack.update(vm);
  const st = stack.debug.stats;
  assert.deepEqual(st.marks, ['STORM', 'II'], 'the storm 2 h ahead, then act II; a derate is no onset');
  assert.match(cv.getAttribute('aria-label'), new RegExp(' Marked: STORM ' + clockText(s + 7200, false) + ', Act II 09:00\\. '));
  assert.ok(stackSummary(stack.debug.proj, {...vm.obs, s: hhS(9, 1)}, false).indexOf('Act II') < 0, 'nothing behind the now line');
  // two words that would touch take two rows (CLOUD 14:20 and III 14:30 are 10 px apart here), under the gaps' glyphs
  const noon = baseVm(structuredClone(obs)), texts = [];
  noon.obs.s = noon.obs.forecast.fromS = hhS(12);
  noon.obs.news = [{atS: noon.obs.s, kind: 'cloud', fromS: hhS(14, 20), toS: null, text: ''}];
  const {v: s2, cv: cv2, doc: doc2} = mount(createLiveStack, 336, 164);
  cv2.getContext('2d').fillText = (t, x, y) => texts.push([t, y]);
  s2.update(noon);
  const yOf = w => texts.find(([t]) => t === w)[1], G = s2.debug.geom;
  assert.deepEqual([yOf('CLOUD'), yOf('III')], [G.y1, G.y1 + 10]);
  // at rest the stack redraws at most STACK_MAX_HZ a real second: at 1,620x the now line steps and the
  // executor bumps the plan every frame; a change still lands within 0.1 real s
  const d0 = st.draws, gap = 1000 / V.STACK_MAX_HZ;
  for (let f = 1; f <= 60; f++) { vm.frame.nowMs += 16; vm.obs.s += 27; vm.obs.plan.rev++; stack.update(vm); }
  const draws = st.draws - d0; // (a draw on the first 16-ms frame at least 0.1 s after the last)
  assert.ok(draws <= V.STACK_MAX_HZ && draws >= 60 / Math.ceil(gap / 16) - 1, draws + ' draws in 0.96 real s');
  vm.frame.nowMs += gap; vm.obs.plan.rev++; stack.update(vm);
  assert.equal(st.draws - d0, draws + 1, 'a plan change draws within 0.1 real s');
  // the night shift: one draw (its text says so), then frozen whatever moves, but for its size; a press answers in
  // blue and its note goes as any note; no tip about 21:00's plan
  vm.obs.nightShift = true; vm.frame.nowMs += 16; stack.update(vm);
  assert.match(cv.getAttribute('aria-label'), / The night shift has the desk: the stack is frozen until 04:00\./);
  const n0 = st.draws;
  for (let f = 0; f < 30; f++) { vm.frame.nowMs += 200; vm.obs.s += 400; vm.obs.plan.rev++; stack.update(vm); }
  assert.equal(st.draws, n0, 'frozen');
  stack.el.clientWidth = 1248; stack.el.clientHeight = 420; stack.update(vm);
  assert.equal(st.draws, n0 + 1, 'a new size draws once');
  cv.dispatch('pointerdown', {clientX: 200, clientY: 80, pointerId: 1});
  assert.equal(stack.debug.message, 'The night shift has the desk: the stack is frozen until 04:00');
  assert.ok(stack.el.querySelector('.livestack-msg').classList.contains('info'), 'in blue (Q-41)');
  vm.frame.nowMs += 4016; stack.update(vm);
  assert.equal(stack.debug.message, '', 'gone after 4 real s, frozen as it is');
  cv.dispatch('pointermove', {clientX: 600, clientY: 300});
  assert.ok(stack.el.querySelector('.livestack-tip').hidden);
  assert.deepEqual([st.draws, ...[...doc.canvasStats.bad, ...doc2.canvasStats.bad]], [n0 + 1]);
});
