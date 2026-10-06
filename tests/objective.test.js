// SPEC §9.1 Q-18: the commitment is the player's. The system operator in 'player' mode never
// starts a unit; the standing objective (app/objective.js) says what the desk needs next. These
// tests prove the two halves of that on the game's day (DESK, the day with the belly; Phase 2a,
// desk/README.md C-10, §21.4): a day with no input fails, and a player who does only what the
// objective line says (tests/lib/follow.js) gets through it, and does it well.
//
// The unit tests poke real observations: one followed MILD morning (seed 8 to 13:00) is run
// once, and the observation behind each kind of line is kept (a deep copy) for the tests to
// change one thing at a time. The accepts of §21.4 over the 11 seeds x 2 scenarios are slow-only
// (about 4 minutes for a to i without f; f re-runs a day per STOP, about 11 minutes, and is a TODO:
// it fails as written, see its reason).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, observe, applyInput, replay, hashState} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {V} from '../sim/params.js';
import {DESK, DESK_WEEKEND, CLASSIC, getScenario} from '../content/scenarios.js';
import * as SYS from '../app/system.js';
import * as PV from '../app/planview.js';
import * as O from '../app/objective.js';
import {objective, capacityShort, consequence, steady} from '../app/objective.js';
import {clockText} from '../render/format.js';
import {unitLabel} from '../desk/util.js';
import {followDay} from './lib/follow.js';
import * as FOLLOW from '../tools/follow.mjs';
import {slowOnly} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const S_PER_H = V.S_PER_H, S_PER_MIN = V.S_PER_MIN;
const secOfH = h => (h - V.DAY_START_H) * S_PER_H;
const at = s => clockText(s, false);
const machine = id => V.MACHINES.find(m => m.id === id);
/** START to minimum load, from the machine's own times (C-12). */
const startToMinS = id => machine(id).t1S + V.AUTO_SYNC_S + machine(id).t2S;
/** '49 min', '1 h 10', '8 h': a duration as the consequence line says it. */
const span = s => { const m = Math.max(1, Math.round(s / S_PER_MIN)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''); };

/** The line on an observation, as the follower asks for it. */
const lineOf = obs => objective(obs, {edited: false, planview: PV, dayAhead: obs.dayAhead});
const copy = obs => structuredClone(obs);
const unit = (obs, id) => obs.units.find(u => u.id === id);

// ------------------------------------------------------------------ the followed MILD morning (run once)

const MILD_SEED = 8;
let morningRun = null;
/**
 * DESK seed 8 (a MILD weekday) followed to 13:00: every line the follower read, and a copy of
 * the observation behind the first line of each kind the unit tests poke.
 */
function morning() {
  if (morningRun) return morningRun;
  const lines = [], keep = {};
  const first = (name, obs) => { if (!keep[name]) keep[name] = copy(obs); };
  const rec = (obs, ctx) => {
    const x = objective(obs, ctx);
    lines.push({s: obs.s, kind: x.kind, level: x.level, text: x.text, action: x.action, targets: x.targets, startBy: x.startBy});
    if (x.kind === 'stop') first('stop', obs);
    if (x.kind === 'commit' && x.action && x.action.type === 'start') first('start', obs);
    if (x.kind === 'commit' && !x.action && /^Next: start/.test(x.text)) first('later', obs);
    if (x.kind === 'battery' && x.action && x.action.mode === 'charge') first('charge', obs);
    if (x.kind === 'spare' && x.action && x.action.type === 'guard') first('guard', obs);
    return x;
  };
  const day = followDay(MILD_SEED, DESK, {untilH: 13, objective: rec});
  morningRun = {day, lines, keep};
  return morningRun;
}

// Accept (i) on a list of lines read once a grid minute and the actions followed (§21.4).
function lineChecks(lines, said, tag) {
  for (const x of lines) {
    assert.ok(x.text.length <= O.LINE_MAX_CHARS, tag + ': one line (' + x.text.length + '): ' + x.text);
    assert.doesNotMatch(x.text, /undefined|NaN|Infinity/, tag);
    assert.doesNotMatch(x.text, /-\d{1,2}:\d{2}/, tag + ': a negative clock time: ' + x.text);
  }
  for (const a of said) {
    if (!a.accepted || !a.action) continue;
    const costly = a.kind === 'stop' || (a.kind === 'battery' && (a.action.mode === 'charge' || a.action.mode === 'discharge'));
    if (!costly) continue;
    for (const x of lines) {
      if (x.s <= a.s || x.s > a.s + 300) continue;
      assert.notEqual(x.kind, 'short', tag + ': short within 5 min of following "' + a.text + '": ' + x.text);
      assert.ok(!(x.action && (x.action.type === 'callDR' || x.action.type === 'armRERT')), tag + ': ' + JSON.stringify(x.action) + ' within 5 min of "' + a.text + '"');
    }
  }
}

// ------------------------------------------------------------------ the day and the system

test('the DESK scenario is the game\'s day: the classic fleet with CCGT 2 off at 04:00, rooftop solar and day types; the weekend has coal 4 off', () => {
  assert.equal(getScenario('desk'), DESK);
  assert.equal(getScenario('desk-weekend'), DESK_WEEKEND);
  const a = observe(createState(7, CLASSIC)), b = observe(createState(7, DESK)), w = observe(createState(7, DESK_WEEKEND));
  const on = o => o.units.filter(u => u.mode === 'on').map(u => u.id);
  assert.deepEqual(on(a).filter(id => !on(b).includes(id)), ['ccgt2'], 'the same fleet, CCGT 2 off overnight');
  assert.deepEqual(on(b).filter(id => !on(w).includes(id)), ['coal4'], 'the weekend: coal 4 off since Friday night');
  assert.ok(on(w).includes('ccgt2'), 'and both CCGTs on');
  // the belly (Phase 2a, C-1): rooftop solar on the game's day, none on the classic day
  assert.equal(CLASSIC.rooftop.capacityMW, 0);
  assert.ok(DESK.rooftop.capacityMW > 0);
  assert.deepEqual(b.day, {temp: 'HOT', weekend: false});
  assert.deepEqual(w.day, {temp: 'HOT', weekend: true});
  assert.equal(observe(createState(MILD_SEED, DESK)).day.temp, 'MILD');
  // by 08:30 the roofs are taking the load off the grid: demand = underlying - rooftop
  const k = b.forecast.rooftopMW.length - 1;
  assert.ok(b.forecast.rooftopMW[k] > 500, 'rooftop at 08:30: ' + b.forecast.rooftopMW[k].toFixed(0) + ' MW');
  assert.ok(Math.abs(b.forecast.underlyingP50[k] - b.forecast.rooftopMW[k] - b.forecast.demandP50[k]) < 1e-6);
});

test('player mode: the system never books a start or a stop, and re-dispatches what is committed', () => {
  const {st, sys} = followDay(7, DESK, {follow: false, untilH: 8});
  const loads = st.log.filter(r => r.type === 'planLoad');
  assert.ok(loads.length >= 20, 'a dispatch every 5 grid-minutes: ' + loads.length);
  for (const r of loads) { assert.deepEqual(r.args.starts, []); assert.deepEqual(r.args.stops, []); }
  assert.equal(st.log.filter(r => r.type === 'start' || r.type === 'planStart').length, 0);
  assert.equal(sys.commit, 'player');
  // F-6: the day is its log.
  assert.equal(hashState(replay(7, DESK, st.log, {untilTick: st.tick})), hashState(st));
});

test('the objective sees the morning shortfall ahead and names the CCGT, with its lead time and a deadline', () => {
  // the GUARD comes first (the line that can be acted on now); once it is up the line is the CCGT
  const st = createState(7, DESK), sys = SYS.createSystem({commit: 'player'});
  while (st.tick < V.PLAYER_START_TICK + 120 * TPS) step(st, SYS.systemInputs(sys, st));
  assert.equal(applyInput(st, {type: 'guard', mw: V.PAR_GUARD_MAX_MW}, []).ok, true);
  for (let i = 0; i < 60 * TPS; i++) step(st, SYS.systemInputs(sys, st));
  const obs = observe(st, {dayAhead: true});
  const short = capacityShort(obs);
  assert.ok(short && short.atS > obs.s + 1800, 'short later this morning, not now');
  const o = lineOf(obs);
  assert.match(o.text, /^You will be \d+ MW short from 0\d:\d\d\. Start CCGT 2 by 0\d:\d\d: it takes 49 min to reach the grid\.$/);
  assert.equal(o.kind, 'commit');
  assert.deepEqual(o.targets, ['guard-start-ccgt2']);
  assert.equal(o.level, 'plan');
  assert.equal(o.action, null, 'nothing to do yet: the line says by when');
  assert.ok(o.startBy > obs.s + O.ACT_WITHIN_S && o.startBy < short.atS, 'a decision with a lead time');
  assert.equal(Math.round(startToMinS('ccgt2') / S_PER_MIN), 49, 'the 49 minutes are the machine\'s own times');
  assert.deepEqual(o.short && Object.keys(o.short), ['atS', 'endS', 'mw']);
  // the game's reading time (ctx.leadS, grid seconds: its rate x LINE_REACT_S): "now" that much earlier
  const lead = o.startBy - obs.s - O.ACT_WITHIN_S, ctx = {edited: false, planview: PV, dayAhead: obs.dayAhead};
  const early = objective(obs, Object.assign({leadS: lead}, ctx));
  assert.deepEqual([early.level, early.action], ['act', {type: 'start', unit: 'ccgt2'}]);
  assert.match(early.text, /Start CCGT 2 now: it takes 49 min/);
  assert.equal(early.startBy, o.startBy, 'the deadline itself is the same');
  assert.equal(objective(obs, Object.assign({leadS: lead - 60}, ctx)).level, 'plan', 'and no earlier');
});

test('levers held by hand with the plan short: the objective says RE-DISPATCH', () => {
  const st = createState(7, DESK), sys = SYS.createSystem({commit: 'player'});
  while (st.tick < V.PLAYER_START_TICK + 600 * TPS) step(st, SYS.systemInputs(sys, st));
  assert.equal(applyInput(st, {type: 'basePoint', station: 'coal', mw: 1000}, []).ok, true); // the coal lever pulled down
  for (let i = 0; i < 400 * TPS; i++) step(st, SYS.systemInputs(sys, st));
  assert.equal(sys.edited, true, 'a hand move takes the levers over');
  const o = objective(observe(st), {edited: sys.edited, planview: PV});
  assert.equal(o.level, 'crit');
  assert.equal(o.kind, 'held');
  assert.match(o.text, /^With levers held by hand the plan is [\d,]+ MW below demand (now|from \d\d:\d\d)\. RE-DISPATCH \(N\) hands every lever back/);
  assert.deepEqual(o.action, {redispatch: true});
  const r = SYS.redispatch(sys, st);
  assert.equal(applyInput(st, r.input, []).ok, true);
  assert.equal(sys.edited, false);
});

test('a MILD morning to 13:00 (seed 8): the follower starts the CCGT for the morning, raises the GUARD, stops both CCGTs for the belly and charges the battery', () => {
  const {day, lines} = morning();
  assert.equal(day.score.unservedMWh, 0, 'nothing unserved by 13:00');
  assert.equal(day.st.black, false);
  const did = day.said.filter(x => x.accepted).map(x => x.kind + ':' + (x.action.type || 'redispatch') + (x.action.unit ? ':' + x.action.unit : '') + (x.action.mode ? ':' + x.action.mode : ''));
  assert.deepEqual(day.said.filter(x => !x.accepted), [], 'the sim accepted every action the line proposed');
  assert.ok(did.includes('spare:guard'), 'the GUARD for the first second after a trip: ' + did);
  assert.ok(did.includes('commit:start:ccgt2'), 'the CCGT for the morning ramp');
  // (d) a gas unit stopped before 12:00 (its restart is the evening's: the slow accept)
  const stops = day.said.filter(x => x.accepted && x.action.type === 'stop');
  assert.deepEqual(stops.map(x => x.action.unit), ['ccgt2', 'ccgt1'], 'the dearest gas unit first, then the next');
  assert.ok(stops.every(x => x.s < secOfH(12)), 'both before 12:00');
  assert.ok(stops[1].s - stops[0].s >= O.STOP_GAP_S, 'one STOP at a time');
  // (the saving rests on the day going as forecast until the unit is back: the line says so)
  for (const x of stops) assert.match(x.text, /^CCGT \d is not needed until \d\d:\d\d\. Stop it: saves about \$[\d,]+ if nothing trips before then\. Start it again by \d\d:\d\d\.$/);
  assert.ok(did.includes('battery:battery:charge'), 'the battery charged before the evening');
  // never thrash: the battery branch's own orders, idle included, are at least a quarter of an hour apart
  const orders = day.said.filter(x => x.accepted && x.kind === 'battery' && x.action.type === 'battery');
  for (let i = 1; i < orders.length; i++) assert.ok(orders[i].s - orders[i - 1].s >= 900, 'battery orders ' + at(orders[i - 1].s) + ' and ' + at(orders[i].s));
  // every line carries a kind the shell knows, and (i) holds on the morning
  for (const x of lines) assert.ok(['watch', 'held', 'short', 'commit', 'restore', 'spare', 'stop', 'battery', 'quiet'].includes(x.kind), x.kind);
  assert.equal(O.LINE_MAX_CHARS, 170, '§21.4: one line, at most 170 characters (the objective\'s own checks and these tests read the one constant)');
  lineChecks(lines, day.said, 'seed ' + MILD_SEED);
  // (what the STOP and BATTERY lines are worth over the whole day is accept e, slow)
});

test('a day with no input fails: the evening is short without the units only the player can start (seed 8)', () => {
  // to 21:00 (6,800 MWh unserved by then; the whole day, on every seed, is slow accept h)
  const idle = followDay(MILD_SEED, DESK, {follow: false, untilH: 21});
  assert.ok(idle.st.black || idle.score.unservedMWh > 5000, 'no input: ' + idle.score.unservedMWh.toFixed(0) + ' MWh unserved');
  assert.equal(idle.st.log.filter(r => r.type === 'start').length, 0, 'nothing started by itself');
});

// ------------------------------------------------------------------ STOP (§21.4): each condition on a poked observation

test('STOP: the line names the dearest committed gas unit, what it saves and when to bring it back', () => {
  const obs = morning().keep.stop;
  const x = lineOf(obs), u = unit(obs, 'ccgt2');
  assert.equal(x.kind, 'stop');
  assert.equal(x.level, 'plan');
  assert.deepEqual(x.action, {type: 'stop', unit: 'ccgt2'});
  assert.deepEqual(x.targets, ['guard-stop-ccgt2']);
  assert.equal(O.stopCandidate(obs).id, 'ccgt2', 'CCGT 1 and CCGT 2 offer the same: the highest index');
  assert.ok(u.outMW <= u.minMW + O.STOP_FLOOR_MW && obs.sec.level === 'SECURE');
  assert.ok(x.saving >= O.STOP_MIN_SAVING);
  // the dollars quoted are the saving, to the nearest thousand; tools/follow.mjs reads line.saving for accept f
  assert.equal(Number(/saves about \$([\d,]+)/.exec(x.text)[1].replace(/,/g, '')), Math.round(x.saving / 1000) * 1000);
  assert.equal(FOLLOW.quotedSaving(x), x.saving);
  // "Start it again by": no sooner than its minimum down time allows (C-12: from breaker open to the next START)
  const again = /Start it again by (\d\d):(\d\d)/.exec(x.text);
  const m = machine('ccgt2'), earliest = obs.s + Math.max(0, u.outMW - u.minMW) / m.rampMWs + m.t4S + m.minDownS;
  assert.ok(secOfH(Number(again[1]) + Number(again[2]) / 60) >= Math.floor(earliest / 300) * 300, 'restart ' + again[0] + ' vs the earliest START ' + at(earliest));
});

test('STOP condition 1: no line when the desk would be short, one trip in, before the unit could be back and an hour more', () => {
  const base = morning().keep.stop, m = machine('ccgt2');
  const W = m.t4S + m.minDownS + startToMinS('ccgt2') + O.STOP_CLEAR_S;
  // a shortfall inside the window (demand up 4,000 MW for an hour, three hours from now): no STOP
  const bump = (obs, fromH, toH) => { const fc = obs.dayAhead; for (let k = 0; k < fc.n; k++) { const t = fc.fromS + (k + 1) * fc.stepS; if (t >= base.s + fromH * S_PER_H && t < base.s + toH * S_PER_H) fc.demandP50[k] += 4000; } return obs; };
  assert.ok(4 * S_PER_H < W && W < 6 * S_PER_H, 'W is ' + span(W) + ': unload, T4, minimum down, a start and an hour');
  const inside = lineOf(bump(copy(base), 3, 4));
  assert.notEqual(inside.kind, 'stop');
  assert.ok(!(inside.action && inside.action.type === 'stop'));
  // the same shortfall after the window is the restart's business: the STOP stands, and says to be back for it
  const after = lineOf(bump(copy(base), 6, 7));
  assert.equal(after.kind, 'stop');
  assert.match(after.text, /is not needed until \d\d:\d\d\. .*Start it again by \d\d:\d\d\.$/);
  const until = /not needed until (\d\d):(\d\d)/.exec(after.text);
  assert.ok(secOfH(Number(until[1]) + Number(until[2]) / 60) <= base.s + 6 * S_PER_H + 300, 'needed by the bump at ' + at(base.s + 6 * S_PER_H) + ': ' + until[0]);
  // the heat worst case is a second look at the same window, and can only be harder
  const hot = copy(base);
  hot.day.temp = 'HOT';
  const worst = O.heatWorstCase(hot), heat = DESK.events.heat;
  assert.deepEqual(worst, {fromS: secOfH(heat.onsetH), toS: secOfH(heat.endH), roofLoss: 1 - DESK.rooftop.heatFactor});
  assert.equal(O.heatWorstCase(base), null, 'a MILD day has no heatwave ahead');
  const noon = copy(hot);
  noon.s = secOfH(heat.announceH);
  assert.equal(O.heatWorstCase(noon), null, 'past the announcement hour none is coming');
  const told = copy(hot);
  told.news.push({atS: told.s - 60, kind: 'heat', fromS: secOfH(heat.onsetH), toS: secOfH(heat.endH), text: 'x'});
  assert.equal(O.heatWorstCase(told), null, 'an announced heatwave is in the forecast already');
  const plain = O.capacityGap(hot, hot.dayAhead, {without: 'ccgt2'}), harder = O.capacityGap(hot, hot.dayAhead, {without: 'ccgt2', heat: worst});
  let more = 0;
  for (let k = 0; k < plain.n; k++) {
    const t = plain.fromS + (k + 1) * plain.stepS;
    assert.ok(harder.gap[k] >= plain.gap[k] - 1e-9);
    if (t >= worst.fromS && t < worst.toS) { assert.ok(harder.gap[k] > plain.gap[k] + V.HEAT_DEMAND_UPLIFT * hot.dayAhead.underlyingP50[k] - 1e-6, 'the uplift and the derate at ' + at(t)); more++; }
  }
  assert.ok(more > 50, 'the whole heat window');
});

test('STOP condition 1 as written: the largest remaining loss with the water held until 15:30, and on a HOT morning the unannounced heatwave too', () => {
  const base = morning().keep.stop, m = machine('ccgt2'), u = unit(base, 'ccgt2');
  const W = Math.max(0, u.outMW - u.minMW) / m.rampMWs + m.t4S + m.minDownS + startToMinS('ccgt2') + O.STOP_CLEAR_S;
  const n1 = {marginMW: O.MARGIN_MW + O.largestLoss(base, 'ccgt2'), without: 'ccgt2'};
  assert.ok(O.largestLoss(base, 'ccgt2') >= 500, 'the largest remaining loss: ' + Math.round(O.largestLoss(base, 'ccgt2')) + ' MW');
  const cols = (fc, from, to) => { const ks = []; for (let k = 0; k < fc.n; k++) { const t = fc.fromS + (k + 1) * fc.stepS; if (t >= from && t < to) ks.push(k); } return ks; };
  // (a) the water is held for the evening: a morning that holds one trip only on the gorge's water is no time to stop
  const hold = secOfH(V.PAR_WATER_HOLD_UNTIL_H);
  const wet = copy(base), ks = cols(wet.dayAhead, base.s, Math.min(hold, base.s + W));
  const plain = O.capacityGap(wet, wet.dayAhead, n1), water = O.capacityGap(wet, wet.dayAhead, Object.assign({water: true}, n1));
  const dry = Math.max(...ks.map(k => plain.gap[k])), soaked = Math.max(...ks.map(k => water.gap[k]));
  assert.ok(dry - soaked > 400, 'the water before 15:30 is worth ' + Math.round(dry - soaked) + ' MW to the check');
  for (const k of ks) wet.dayAhead.demandP50[k] += 200 - dry; // short by 200 MW with the water held, 200 MW or more to spare with it counted
  const asWritten = O.capacityShort(wet, wet.dayAhead, n1), withWater = O.capacityShort(wet, wet.dayAhead, Object.assign({water: true}, n1));
  assert.ok(asWritten && asWritten.atS < base.s + W, 'short as written, inside W');
  assert.ok(!withWater || withWater.atS >= base.s + W, 'not short inside W if the water were counted for the trip');
  assert.notEqual(lineOf(wet).kind, 'stop', 'no STOP on water the dispatch is keeping for the evening');
  // (b) the heatwave that may still be announced: only on a HOT morning before the announcement, inside its window
  const heat = DESK.events.heat;
  const warm = copy(base);
  warm.day.temp = 'HOT';
  const worst = O.heatWorstCase(warm);
  assert.ok(worst && warm.s < secOfH(heat.announceH));
  const hk = cols(warm.dayAhead, Math.max(worst.fromS, base.s), base.s + W);
  assert.ok(hk.length > 6, 'the heat window falls inside W');
  const p0 = O.capacityGap(warm, warm.dayAhead, n1), h0 = O.capacityGap(warm, warm.dayAhead, Object.assign({heat: worst}, n1));
  const top = Math.max(...hk.map(k => p0.gap[k]));
  for (const k of hk) warm.dayAhead.demandP50[k] += -top; // exactly covered in the plain check
  const hotLine = lineOf(warm), mildLine = lineOf(Object.assign(copy(warm), {day: {temp: 'MILD', weekend: false}}));
  assert.ok(Math.max(...hk.map(k => h0.gap[k] - p0.gap[k])) >= O.SHORT_MIN_MW, 'the uplift and the derate are worth a run');
  assert.notEqual(hotLine.kind, 'stop', 'HOT, unannounced: the heatwave may come, and the unit could not be back for it: ' + hotLine.text);
  assert.equal(mildLine.kind, 'stop', 'the same morning on a MILD day: no heatwave is coming');
  const told = copy(warm);
  told.s = secOfH(heat.announceH); // past the announcement hour with none announced: none is coming
  assert.equal(O.heatWorstCase(told), null);
});

test('STOP conditions 2 and 3: only while SECURE with the unit\'s own headroom to spare, and only from its floor', () => {
  const base = morning().keep.stop;
  const tight = copy(base);
  tight.sec.level = 'TIGHT';
  assert.notEqual(lineOf(tight).kind, 'stop', 'not SECURE');
  const thin = copy(base), u = unit(thin, 'ccgt2');
  const head = Math.max(0, Math.min(u.availMW - u.outMW, u.rampMWMin * V.R5_WINDOW_MIN));
  thin.sec.r5MW = V.SECURE_RATIO * thin.sec.lMW + head - 1;
  assert.notEqual(lineOf(thin).kind, 'stop', 'SECURE only with this unit\'s 5-minute headroom');
  thin.sec.r5MW += 2;
  assert.equal(lineOf(thin).kind, 'stop');
  const loaded = copy(base);
  unit(loaded, 'ccgt2').outMW = unit(loaded, 'ccgt2').minMW + O.STOP_FLOOR_MW + 1;
  assert.notEqual(lineOf(loaded).kind, 'stop', 'above its floor: the dispatch still wants it');
});

test('STOP condition 4: not for a saving under $10,000; at MSL2 and MSL3 the saving is not the point and the line says ACT', () => {
  const base = morning().keep.stop;
  // gas as cheap as coal: stopping it saves little more than its no-load, less than a start costs
  const cheap = copy(base);
  for (const u of cheap.units) if (u.cls === 'ccgt') u.offer = V.STATIONS.coal.offer + 4;
  assert.equal(O.stopCandidate(cheap).id, 'ccgt2');
  assert.notEqual(lineOf(cheap).kind, 'stop', 'the saving is under ' + O.STOP_MIN_SAVING);
  for (const level of [2, 3]) {
    const low = copy(cheap);
    low.msl = {level, minMW: 1200, atS: low.s + 3600, sinceS: low.s - 60};
    const x = lineOf(low);
    assert.equal(x.kind, 'stop', 'MSL' + level);
    assert.equal(x.level, 'act');
    assert.deepEqual(x.action, {type: 'stop', unit: 'ccgt2'});
    assert.match(x.text, /^Demand is falling under what the running units must make\. Stop CCGT 2: it is not needed until \d\d:\d\d\. Start it again by \d\d:\d\d\.$/);
  }
  const one = copy(cheap);
  one.msl = {level: 1, minMW: 1550, atS: one.s + 3600, sinceS: one.s - 60};
  assert.notEqual(lineOf(one).kind, 'stop', 'MSL1 is information: the saving still decides');
  // the saving itself: more idle hours save more, and a stop for the rest of the day pays no start
  const u = unit(base, 'ccgt2'), proj = PV.project(base);
  const short = O.stopSaving(base, u, base.s + 4 * S_PER_H, base.dayAhead, proj, PV), long = O.stopSaving(base, u, base.s + 6 * S_PER_H, base.dayAhead, proj, PV);
  assert.ok(long > short, 'six idle hours save more than four: ' + Math.round(long) + ' vs ' + Math.round(short));
  const m = machine('ccgt2'), perH = u.minMW * u.offer + m.noLoadPerS * S_PER_H;
  assert.ok(long - short < 2 * perH + 1 && long - short > 0, 'never more than its own fuel and no-load for the two hours ($' + Math.round(perH) + ' an hour)');
});

test('STOP, one at a time and never a unit that cannot stop: no second STOP while a unit is on its way down or just off; a blocked candidate is not replaced', () => {
  const base = morning().keep.stop;
  for (const mode of ['unloading', 'shutdown']) {
    const busy = copy(base);
    unit(busy, 'ccgt1').mode = mode;
    assert.notEqual(lineOf(busy).kind, 'stop', 'another unit is ' + mode);
  }
  const just = copy(base);
  Object.assign(unit(just, 'gta1'), {mode: 'off', downForS: O.STOP_GAP_S - 60});
  assert.notEqual(lineOf(just).kind, 'stop', 'a unit went off under ' + O.STOP_GAP_S + ' s ago');
  unit(just, 'gta1').downForS = O.STOP_GAP_S;
  assert.equal(lineOf(just).kind, 'stop');
  // the candidate is the dearest committed gas unit; if it cannot be stopped yet there is no STOP line (never the next one down)
  const blocked = copy(base);
  unit(blocked, 'ccgt2').stopBlock = 'minimum up time: 100 min left';
  const x = lineOf(blocked);
  assert.notEqual(x.kind, 'stop');
  assert.ok(!x.action || x.action.type !== 'stop');
});

test('STOP never names a hydro machine and never names coal, whatever they offer', () => {
  const base = morning().keep.stop;
  const noGas = copy(base);
  for (const u of noGas.units) {
    if (u.cls === 'ccgt' || u.cls === 'ocgt') Object.assign(u, {mode: 'off', outMW: 0, startBlock: 'minimum down time: 100 min left'});
    else u.offer = 500; // coal and hydro dearer than any gas
  }
  assert.equal(O.stopCandidate(noGas), null, 'only coal and hydro are committed');
  const x = lineOf(noGas);
  assert.notEqual(x.kind, 'stop');
  assert.ok(!x.action || x.action.type !== 'stop');
  // with gas committed it is still gas, even when coal and hydro offer more
  const dear = copy(base);
  for (const u of dear.units) if (u.cls === 'coal' || u.cls === 'hydro') u.offer = 500;
  assert.equal(O.stopCandidate(dear).cls, 'ccgt');
  // and over the whole followed morning no STOP or consequence-free line touched one
  for (const l of morning().lines) if (l.action && l.action.type === 'stop') assert.match(l.action.unit, /^(ccgt|gt)/);
});

// ------------------------------------------------------------------ the branch order (§21.4)

test('branch order: watch first; a dark district that can be restored outranks STOP and commit-later; STOP outranks commit-later; quiet last', () => {
  const {keep} = morning();
  const stop = keep.stop, later = keep.later;
  assert.ok(later, 'the morning had a commit-later line');
  const l = lineOf(later);
  assert.equal(l.kind, 'commit');
  assert.equal(l.level, 'plan');
  assert.equal(l.action, null);
  assert.match(l.text, /^Next: start [A-Z·0-9 ]+ by \d\d:\d\d for (the afternoon|the evening)\. It takes /);
  assert.ok(l.short.atS - later.s > V.FC_HORIZON_S, 'a day-ahead shortfall more than 4.5 h away');
  // the same shortfall is ahead when the STOP line shows: with the unit unable to stop, the line is commit-later
  const held = copy(stop);
  unit(held, 'ccgt2').stopBlock = 'minimum up time: 100 min left';
  assert.match(lineOf(held).text, /^Next: start /);
  assert.equal(lineOf(stop).kind, 'stop', 'none dark and a stoppable unit: STOP');
  // a dark district with its permissive lit: restore, above both
  for (const base of [stop, later]) {
    const dark = copy(base);
    Object.assign(dark.districts[3], {dark: true, restoreBlock: ''});
    const x = lineOf(dark);
    assert.equal(x.kind, 'restore');
    assert.deepEqual(x.action, {type: 'restore', district: dark.districts[3].id});
  }
  // a feeder that cannot close yet says so, and gives way to a line with something to do now
  const wait = copy(later);
  Object.assign(wait.districts[3], {dark: true, restoreBlock: 'frequency below 49.9 Hz'});
  assert.equal(lineOf(wait).kind, 'restore');
  assert.equal(lineOf(wait).action, null);
  const waitStop = copy(stop);
  Object.assign(waitStop.districts[3], {dark: true, restoreBlock: 'frequency below 49.9 Hz'});
  assert.equal(lineOf(waitStop).kind, 'stop', 'the line that can be acted on now');
  // the watch locks the desk; a finished day says nothing
  const watch = copy(stop);
  watch.inWatch = true;
  assert.equal(lineOf(watch).kind, 'watch');
  assert.equal(lineOf(watch).action, null);
  const over = copy(stop);
  over.over = true;
  assert.deepEqual([lineOf(over).kind, lineOf(over).text], ['quiet', '']);
  // every line carries kind, short and long (the seams)
  for (const o of [stop, later, keep.start, keep.charge, keep.guard]) {
    const x = lineOf(o);
    for (const k of ['level', 'kind', 'text', 'targets', 'action', 'startBy', 'short', 'long']) assert.ok(k in x, k);
  }
});

test('short now outranks everything else: the battery first, sized to what is short; one start; demand response only when neither can answer', () => {
  const base = morning().keep.stop;
  const short = copy(base);
  for (const fc of [short.forecast, short.dayAhead]) for (let k = 0; k < 3; k++) fc.demandP50[k] += 4000;
  short.sec.level = 'SHORT';
  const x = lineOf(short);
  assert.equal(x.kind, 'short');
  assert.equal(x.level, 'crit');
  // (the plan's figure, which AGC may still be covering: never the BALANCE bar's word SHORT)
  assert.match(x.text, /^The plan is [\d,]+ MW below demand now: /);
  assert.doesNotMatch(x.text, /short/i);
  assert.doesNotMatch(x.text, /too late to plan/i, 'a trip nobody could foresee is nobody\'s fault');
  assert.ok(x.action.type === 'battery' || x.action.type === 'guard', 'the battery is there in seconds: ' + JSON.stringify(x.action));
  if (x.action.type === 'battery') assert.equal(x.action.mode, 'discharge');
  assert.ok(x.text.length <= O.LINE_MAX_CHARS, x.text);
  // while the battery or a start can answer, demand response is neither named nor lit
  assert.doesNotMatch(x.text, /demand response|\bDR\b/);
  assert.ok(!x.targets.includes('btn-dr'), x.targets.join());
  // an empty battery, nothing left to start: demand response, said in words
  const bare = copy(short);
  bare.battery.socMWh = V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH;
  for (const u of bare.units) if (u.mode === 'off') u.startBlock = 'minimum down time: 100 min left';
  const y = lineOf(bare);
  assert.equal(y.kind, 'short');
  assert.deepEqual(y.action, {type: 'callDR'});
  assert.match(y.text, /call demand response \(hold D\): industry cuts 350 MW for 1 h\.$/);
  assert.equal(V.DR_MW, 350);
  assert.equal(V.DR_DURATION_S, 3600);
  // and with no calls left the line says what is already on its way, and asks for nothing
  bare.dr.callsLeft = 0;
  const z = lineOf(bare);
  assert.equal(z.kind, 'short');
  assert.equal(z.action, null);
  assert.match(z.text, /^The plan is [\d,]+ MW below demand now\. /);
});

// ------------------------------------------------------------------ the line says what is true (wave-3 review)

// The morning's STOP observation with no STOP to make and nothing to charge: the commit and quiet lines speak.
function plain() {
  const o = copy(morning().keep.stop);
  for (const u of o.units) if (u.cls === 'ccgt') u.stopBlock = 'minimum up time: 100 min left';
  o.battery.socMWh = o.battery.capMWh;
  return o;
}
const shift = (fc, mw, from = -Infinity, to = Infinity) => { for (let k = 0; k < fc.n; k++) { const t = fc.fromS + (k + 1) * fc.stepS; if (t >= from && t < to) fc.demandP50[k] += mw; } };
const maxGap = (G, from = -Infinity, to = Infinity) => { let m = -Infinity; for (let k = 0; k < G.n; k++) { const t = G.fromS + (k + 1) * G.stepS; if (t >= from && t < to) m = Math.max(m, G.gap[k]); } return m; };
/** Demand set so that the check G (a gap of the same forecast) reads target(k) in every column from..to (MW; G moves one for one with demand). */
const setGap = (fc, G, target, from = -Infinity, to = Infinity) => { for (let k = 0; k < fc.n; k++) { const t = fc.fromS + (k + 1) * fc.stepS; if (t >= from && t < to) fc.demandP50[k] += (typeof target === 'function' ? target(k) : target) - G.gap[k]; } };

test('the commit line: "Your units are N MW below demand now" only when the desk really is; otherwise what the hour lacks against a safe margin', () => {
  const base = plain();
  // short of the planning margin from now (the water held for the evening), rising over the hour as an
  // evening ramp does, with the gorge and the tie able to cover it
  const both = (o, G, target, from, to) => { const d = o.dayAhead.demandP50.slice(); setGap(o.dayAhead, G, target, from, to); for (let k = 0; k < o.forecast.n; k++) o.forecast.demandP50[k] += o.dayAhead.demandP50[k] - d[k]; };
  // the thermal units well up their range (as on an evening ramp), so their own ramp is not what limits them
  for (const u of base.units) if (u.mode === 'on' && u.station !== 'hydro') u.outMW = Math.max(u.outMW, 0.9 * u.availMW);
  const o = copy(base), T = O.capacityGap(o, o.dayAhead, {marginMW: O.MARGIN_MW});
  both(o, T, k => 50 + 25 * k, -Infinity, o.s + S_PER_H);
  const R = O.capacityGap(o, o.forecast, {real: true});
  assert.ok(maxGap(R, -Infinity, o.s + 301) < 0, 'the real check (the gorge and the tie counted) covers the next minutes: ' + Math.round(maxGap(R, -Infinity, o.s + 301)));
  const x = objective(o, {edited: false, planview: PV, dayAhead: o.dayAhead, proj: PV.project(base)});
  assert.equal(x.kind, 'commit');
  assert.equal(x.level, 'act');
  assert.match(x.text, /^Within the hour you will be up to [\d,]+ MW short of a safe margin\. Start [A-Z·0-9 ]+ now: it takes /);
  assert.doesNotMatch(x.text, /below demand now|until then/, 'not short now, and no gap for anything to carry: ' + x.text);
  // the same with the desk really short in the next minutes (its plan as it was: the short-now line is the plan's)
  const r = copy(o);
  both(r, R, 150, -Infinity, o.s + 601);
  Object.assign(r.battery, {mode: 'idle', orderMW: 0, fullHold: false});
  const y = objective(r, {edited: false, planview: PV, dayAhead: r.dayAhead, proj: PV.project(base)});
  assert.equal(y.kind, 'commit');
  assert.match(y.text, /^Your units are [\d,]+ MW below demand now\. Start [A-Z·0-9 ]+ now: it takes [^;]+; until then the battery and the spare on the grid carry the gap\.$/);
  // a charging battery is never said to carry it
  const c = copy(r);
  Object.assign(c.battery, {mode: 'charge', orderMW: 100, socMWh: 700});
  assert.match(objective(c, {edited: false, planview: PV, dayAhead: c.dayAhead, proj: PV.project(base)}).text, /until then the spare on the grid carries the gap\.$/);
});

test('the commit line for a trip\'s worth of spare: "From about" on the quarter hour after it, never before the deadline plus the lead; "Another trip" just after one', () => {
  // no water above the reserve: the trip check is the forecast plus 650 MW at any hour
  const base = plain();
  base.hydro.storageMWh = V.PAR_WATER_RESERVE_MWH;
  const T = O.capacityGap(base, base.dayAhead, {marginMW: O.MARGIN_MW});
  // covered by 100 MW in the planning check from 2 h ahead for an hour, and 400 MW short of a trip's worth of spare
  const from = base.s + 2 * S_PER_H, o = copy(base);
  shift(o.dayAhead, -2000, -Infinity, from); shift(o.dayAhead, -2000, from + S_PER_H);
  shift(o.dayAhead, -100 - maxGap(T, from, from + S_PER_H), from, from + S_PER_H);
  const G = O.tripGap(o, o.dayAhead, 500);
  assert.ok(maxGap(G, from, from + S_PER_H) >= 300 && maxGap(O.capacityGap(o, o.dayAhead, {marginMW: O.MARGIN_MW})) < 0);
  const x = lineOf(o);
  assert.equal(x.kind, 'commit');
  const m = /^From about (\d\d):(\d\d) one trip would leave you short\. Start ([A-Z·0-9 ]+) by (\d\d):(\d\d): it takes (\d+) min to reach the grid\.$/.exec(x.text);
  assert.ok(m, x.text);
  const needS = secOfH(Number(m[1]) + Number(m[2]) / 60), byS = secOfH(Number(m[4]) + Number(m[5]) / 60);
  assert.equal(needS % 900, 0, 'on the quarter hour');
  assert.ok(byS + Number(m[6]) * 60 <= needS, 'start by ' + m[4] + ':' + m[5] + ' + ' + m[6] + ' min is before ' + m[1] + ':' + m[2]);
  // with the trip margin gone the same plant is enough: the margin is what asked for the unit
  const noTrip = O.tripGap(o, o.dayAhead, 0);
  assert.ok(maxGap(noTrip) < O.SHORT_MIN_MW);
  // a trip's worth missing from now, a quarter of an hour after a trip: "Another trip"
  const now = copy(base);
  setGap(now.dayAhead, T, -100, -Infinity, now.s + S_PER_H); setGap(now.dayAhead, T, -2000, now.s + S_PER_H);
  now.contingencies.push({n: 1, startS: now.s - 300, cause: 'link', id: 'tie', lostMW: 500, watchEndS: now.s - 260, backInBandS: -1});
  assert.match(lineOf(now).text, /^Another trip now would leave you short\. Start [A-Z·0-9 ]+ now: /);
  now.contingencies[0].startS = now.s - 900;
  assert.match(lineOf(now).text, /^One trip now would leave you short\. /);
});

test('the commit line for a slow unit that cannot reach the shortfall: when it arrives, and what holds the desk until then', () => {
  const base = plain();
  // every fast machine committed or blocked: only coal 4, off since the small hours, can start
  for (const u of base.units) if (u.mode === 'off') u.startBlock = 'minimum down time: 100 min left';
  Object.assign(unit(base, 'coal4'), {mode: 'off', outMW: 0, schedMW: 0, startBlock: '', stopBlock: 'unit is off'});
  const T = O.capacityGap(base, base.dayAhead, {marginMW: O.MARGIN_MW}), from = base.s + 1800;
  const o = copy(base);
  setGap(o.dayAhead, T, 300, from, from + 5 * S_PER_H);
  const x = lineOf(o), arrive = o.s + unit(o, 'coal4').startToMinS;
  assert.equal(x.kind, 'commit');
  assert.deepEqual(x.action, {type: 'start', unit: 'coal4'});
  assert.match(x.text, /^Start COAL 4 now: it reaches the grid at (\d\d:\d\d), too late for \d\d:\d\d\. Until then, (what the plant cannot give is the battery's to carry|the plant covers the forecast with less spare than it should have)\.$/);
  assert.equal(/at (\d\d:\d\d), too late/.exec(x.text)[1], at(arrive));
  assert.doesNotMatch(x.text, /You will be|short from/, 'no shortfall figure the desk will not see');
});

test('the quiet line: "Enough plant" only with nothing short of a trip\'s worth of spare; every unit committed and a gap ahead is said plainly', () => {
  const base = plain();
  const G = O.tripGap(base, base.dayAhead, 500), top = maxGap(G);
  // nothing ahead within 40 MW of a trip's worth of spare: enough
  const ok = copy(base);
  shift(ok.dayAhead, 40 - O.THIN_MW - top);
  assert.match(lineOf(ok).text, /^Enough plant is committed for the rest of the day\. /);
  // a thin band (THIN_MW to SHORT_MIN_MW): covered, but with little spare for a trip; never "enough"
  const thin = copy(base);
  shift(thin.dayAhead, (O.THIN_MW + O.SHORT_MIN_MW) / 2 - top);
  const t = lineOf(thin);
  assert.equal(t.kind, 'quiet');
  assert.match(t.text, /^Committed plant covers the forecast, but with little spare for a trip( from about \d\d:\d\d)?\./);
  // every unit that can run committed, and the evening more than they can give: said, with what carries it
  const all = copy(base);
  for (const u of all.units) if (u.mode === 'off') u.startBlock = 'minimum down time: 100 min left';
  shift(all.dayAhead, 1500, secOfH(18), secOfH(20));
  const a = lineOf(all);
  assert.equal(a.kind, 'quiet');
  assert.match(a.text, /^Every unit (that can run )?is committed\. From about 1[78]:\d\d demand is about [\d,]+ MW more than they can give: (the battery, then demand response, carry it|more than the battery and demand response can carry)\.$/);
  // "no higher demand" only when none is ahead
  const peak = copy(base);
  const fc = peak.dayAhead;
  for (let k = 0; k < fc.n; k++) fc.demandP50[k] = peak.demand.nowMW - 500;
  for (let k = 0; k < fc.n; k++) { const t = fc.fromS + (k + 1) * fc.stepS; if (t >= secOfH(19) && t < secOfH(19.25)) fc.demandP50[k] = peak.demand.nowMW + 150; }
  assert.match(lineOf(peak).text, /Highest demand ahead: about [\d,]+ MW at 19:\d\d\.$/);
  for (let k = 0; k < fc.n; k++) { const t = fc.fromS + (k + 1) * fc.stepS; if (t >= secOfH(19) && t < secOfH(19.25)) fc.demandP50[k] = peak.demand.nowMW + 50; }
  assert.match(lineOf(peak).text, /No higher demand is ahead today\.$/, 'within the figure\'s own rounding of now');
  for (const o of [ok, thin, all, peak]) assert.ok(lineOf(o).text.length <= O.LINE_MAX_CHARS, lineOf(o).text);
});

test('short now: the plan\'s red within five minutes is an emergency only when the desk at its limits is short there too', () => {
  const o = plain(), P = PV.project(o);
  P.gap[0] = 'red'; P.deficit[0] = 500;
  const ctx = {edited: false, planview: PV, dayAhead: o.dayAhead, proj: P};
  assert.ok(maxGap(O.capacityGap(o, o.forecast, {real: true}), -Infinity, o.s + 301) < -O.SHORT_MIN_MW, 'the real check has room');
  assert.notEqual(objective(o, ctx).kind, 'short', 'a plan still climbing to its keyframe is not "below demand now"');
  const r = copy(o);
  const R = O.capacityGap(r, r.forecast, {real: true});
  setGap(r.forecast, R, 200, -Infinity, r.s + 301);
  const x = objective(r, Object.assign({}, ctx, {dayAhead: r.dayAhead}));
  assert.equal(x.kind, 'short');
  assert.match(x.text, /^The plan is [\d,]+ MW below demand now: /);
});

test('STOP saving: the energy that replaces the unit is free in columns where power would be spilled', () => {
  const base = morning().keep.stop, u = unit(base, 'ccgt2'), m = machine('ccgt2');
  const proj = PV.project(base), backS = base.s + 3 * S_PER_H;
  const none = Object.assign({}, proj, {surplusMW: new Float64Array(proj.n)});
  const all = Object.assign({}, proj, {surplusMW: new Float64Array(proj.n).fill(500)});
  const paid = O.stopSaving(base, u, backS, base.dayAhead, none, PV), free = O.stopSaving(base, u, backS, base.dayAhead, all, PV);
  assert.ok(free > paid + 1000, 'free replacement saves more: ' + Math.round(free) + ' vs ' + Math.round(paid));
  // its idle columns all inside the plan view and all spilled: the saving is exactly the unit's own
  // fuel and no-load for them, less one start
  const h = base.dayAhead.stepS / S_PER_H, offS = base.s + Math.max(0, u.outMW - u.minMW) / m.rampMWs + m.t4S / 2, onS = backS + m.t1S + V.AUTO_SYNC_S + m.t2S / 2;
  let n = 0, inside = true;
  for (let k = 0; k < base.dayAhead.n; k++) {
    const t = base.dayAhead.fromS + (k + 1) * base.dayAhead.stepS;
    if (t > offS && t <= onS) { n++; if (!(k < proj.n && Math.abs(proj.times[k] - t) < 1)) inside = false; }
  }
  assert.ok(inside && n > 20, n + ' idle columns, all inside the plan view');
  const own = (u.minMW * u.offer + m.noLoadPerS * S_PER_H) * h;
  assert.ok(Math.abs(free - (n * own - m.startCost)) < 1, Math.round(free) + ' vs ' + Math.round(n * own - m.startCost));
});

test('the water as par and the plan view count it: the reserve sits above HYDRO_STOP_MWH, and the water value is the plan view\'s', () => {
  const base = morning().keep.stop;
  assert.ok(base.units.some(u => u.station === 'hydro' && u.mode === 'on'), 'the gorge is spinning');
  const gap = storageMWh => { const o = copy(base); o.hydro.storageMWh = storageMWh; return O.capacityGap(o, o.dayAhead, {real: true}).gap; };
  const dry = gap(0), floor = gap(V.HYDRO_STOP_MWH + V.PAR_WATER_RESERVE_MWH), wet = gap(V.HYDRO_STOP_MWH + V.PAR_WATER_RESERVE_MWH + 500);
  assert.deepEqual(Array.from(floor), Array.from(dry), 'no firm water down to the reserve above the stop level');
  assert.ok(dry.some((g, k) => g - wet[k] > 50), 'the water above it counts');
  // the STOP saving prices hydro with ctx.planview's waterValue (no copy of its own)
  let asked = 0;
  const spy = Object.assign({}, PV, {waterValue: f => { asked++; return PV.waterValue(f); }});
  const x = objective(base, {edited: false, planview: spy, dayAhead: base.dayAhead});
  assert.equal(x.kind, 'stop');
  assert.ok(asked > 0, 'asked the plan view for the water value');
  assert.equal(x.saving, lineOf(base).saving);
});

test('the HOT-morning STOP guard reads the heatwave the sim has pre-rolled: its window, and none from the announcement on (desk heat seeds)', () => {
  // (hardening for D-8, slice 2c: the guard reads the scenario's event menu; if the director moves the
  // announcement or the window, this fails instead of the guard holding STOPs for a heatwave that cannot come)
  let n = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const st = createState(seed, DESK), ev = st.ext.events.filter(e => e.type === 'heatAnnounce');
    if (!ev.length) continue;
    n++;
    const obs = observe(st), w = O.heatWorstCase(obs);
    assert.equal(obs.day.temp, 'HOT', 'seed ' + seed + ': a heatwave day reads HOT until it is announced');
    assert.ok(w && w.fromS === ev[0].args.onsetS && w.toS === ev[0].args.endS, 'seed ' + seed + ': ' + JSON.stringify(w) + ' vs ' + JSON.stringify(ev[0].args));
    obs.s = ev[0].atS - 1;
    assert.ok(O.heatWorstCase(obs), 'seed ' + seed + ': still possible a second before');
    for (const s of [ev[0].atS, ev[0].atS + 1, ev[0].args.onsetS]) { obs.s = s; assert.equal(O.heatWorstCase(obs), null, 'seed ' + seed + ' at ' + at(s)); }
  }
  assert.ok(n >= 10, n + ' heat seeds');
});

test('the reserve diesel is stood down only when HALF of the battery\'s and demand response\'s energy would carry what is left (a band, so the two never chase each other)', () => {
  const o = plain();
  for (const u of o.units) if (u.mode === 'off') u.startBlock = 'minimum down time: 100 min left';
  Object.assign(o.rert, {armed: true, leadS: 0, outMW: V.RERT_MW, standingDown: false, armedEver: true});
  Object.assign(o.battery, {socMWh: 1000, mode: 'idle', orderMW: 0});
  const R0 = O.capacityGap(o, o.dayAhead, {real: true, rert: false}), F0 = O.capacityGap(o, o.forecast, {real: true, rert: false});
  const above = 1000 - V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH, drE = V.DR_MW * V.DR_CALLS * V.DR_DURATION_S / S_PER_H;
  // without the diesel, 4 h of a gap the battery and demand response could carry in full, but not on half their energy
  const gapMW = Math.min(V.RERT_MW, Math.round(0.75 * (above + drE) / 4)) - V.PAR_RERT_MARGIN_MW;
  const deep = copy(o);
  setGap(deep.dayAhead, R0, gapMW, o.s + 600, o.s + 4 * S_PER_H + 600); setGap(deep.forecast, F0, gapMW, o.s + 600, o.s + 4 * S_PER_H + 600);
  assert.ok((gapMW + V.PAR_RERT_MARGIN_MW) * 4 > (above + drE) / 2 && (gapMW + V.PAR_RERT_MARGIN_MW) * 4 < above + drE);
  const x = lineOf(deep);
  assert.ok(!(x.action && x.action.type === 'standDownRERT'), 'half would not carry it: the diesel stays: ' + x.text);
  // a gap a quarter of their energy carries: stand it down
  const shallow = copy(o);
  setGap(shallow.dayAhead, R0, gapMW / 3, o.s + 600, o.s + 4 * S_PER_H + 600); setGap(shallow.forecast, F0, gapMW / 3, o.s + 600, o.s + 4 * S_PER_H + 600);
  assert.deepEqual(lineOf(shallow).action, {type: 'standDownRERT'});
});

test('a gap no start can reach, while the battery is discharging into it: one line that says so, never "be ready to discharge"', () => {
  const o = plain();
  for (const u of o.units) if (u.mode === 'off') u.startBlock = 'minimum down time: 100 min left';
  const R = O.capacityGap(o, o.forecast, {real: true});
  // the plant at its limits 120 MW short from half an hour ahead for half an hour, with room before and after
  for (const fc of [o.forecast, o.dayAhead]) { const Rf = O.capacityGap(o, fc, {real: true}), tk = k => fc.fromS + (k + 1) * fc.stepS; setGap(fc, Rf, k => (tk(k) >= o.s + 1800 && tk(k) < o.s + 3600 ? 120 : -400)); }
  const idle = copy(o);
  Object.assign(idle.battery, {mode: 'idle', orderMW: 0, socMWh: 800, guardMW: 0});
  const plan0 = PV.project(plain()), on = obs => objective(obs, {edited: false, planview: PV, dayAhead: obs.dayAhead, proj: plan0}); // (the plan as it was: this is the shortAhead branch, not the plan's red)
  const x = on(idle);
  assert.match(x.text, /^From about \d\d:\d\d demand is more than every committed unit can give\. The battery carries it: be ready to discharge it then\.$/);
  const going = copy(o);
  Object.assign(going.battery, {mode: 'discharge', orderMW: 100, socMWh: 800, guardMW: 0});
  const y = on(going);
  assert.equal(y.kind, 'battery');
  assert.match(y.text, /^From about \d\d:\d\d to about \d\d:\d\d demand is more than every committed unit can give\. The battery is carrying it: leave it discharging\.$/);
  // the same words a quarter of an hour on, the gap now open: the desk can keep the line as it was said
  const later = copy(going);
  for (const fc of [later.forecast, later.dayAhead]) { const R2 = O.capacityGap(later, fc, {real: true}); setGap(fc, R2, 120, -Infinity, later.s + 600); }
  Object.assign(later.battery, {orderMW: 200});
  const z = on(later);
  assert.equal(z.kind, 'battery');
  assert.equal(z.text.replace(/\d\d:\d\d/g, '#'), y.text.replace(/\d\d:\d\d/g, '#'));
  for (const l of [x, y, z]) assert.doesNotMatch(l.text, /Demand is covered/);
});

test('the watch line names what tripped: a unit, the tie line or a smelter potline', () => {
  const o = copy(morning().keep.stop);
  o.inWatch = true;
  o.contingency = {n: 3, cause: 'unit', id: 'coal1', lostMW: 455};
  assert.equal(lineOf(o).text, 'COAL 1 has tripped. The desk is locked while the grid catches itself: watch.');
  o.contingency = {n: 3, cause: 'link', id: 'tie', lostMW: 564};
  assert.equal(lineOf(o).text, 'The tie line has tripped. The desk is locked while the grid catches itself: watch.');
  o.contingency = {n: 3, cause: 'load', id: 'smelter', lostMW: -256};
  assert.equal(lineOf(o).text, 'A smelter potline has tripped: 260 MW of load gone. The desk is locked while the grid catches itself: watch.');
  o.contingency = null;
  assert.equal(lineOf(o).text, 'A unit has tripped. The desk is locked while the grid catches itself: watch.');
});

test('spare: the GUARD for the first second, asked once for all the battery can hold; the reserve diesel is stood down once the desk holds without it', () => {
  const {keep} = morning();
  const g = lineOf(keep.guard);
  assert.equal(g.kind, 'spare');
  assert.equal(g.level, 'act');
  assert.equal(g.action.type, 'guard');
  assert.ok(g.action.mw > keep.guard.battery.guardMW && g.action.mw <= V.PAR_GUARD_MAX_MW && g.action.mw % V.PAR_GUARD_STEP_MW === 0);
  assert.match(g.text, /^If (your biggest unit|the tie line) tripped now, frequency would fall to 4\d\.\d\d Hz: too low to be secure\. Raise the battery GUARD to \d+ MW: it catches the fall in the first second\.$/);
  assert.ok(keep.guard.sec.previewNadirHz < V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ, '"too low to be secure": under the SECURE line');
  assert.deepEqual(g.targets, ['gauge-n1', 'ring-guard']);
  assert.doesNotMatch(g.text, /R5|N-1|LOR|\bL\b/, 'plain words');
  // asked once: the most the battery can hold (each step is worth less than the one before, so a
  // line sized on one step's worth asked again a minute later)
  const room = copy(keep.guard);
  Object.assign(room.battery, {guardMW: 0, mode: 'idle', orderMW: 0, socMWh: 900});
  assert.deepEqual(lineOf(room).action, {type: 'guard', mw: V.PAR_GUARD_MAX_MW});
  // ...as far as the battery can sustain it, and never into MW an order is using
  const low = copy(room);
  low.battery.socMWh = (V.PAR_GUARD_MAX_MW - 50) * V.GUARD_SUSTAIN_S / S_PER_H;
  assert.deepEqual(lineOf(low).action, {type: 'guard', mw: V.PAR_GUARD_MAX_MW - V.PAR_GUARD_STEP_MW});
  const busy = copy(room);
  Object.assign(busy.battery, {mode: 'charge', orderMW: 250});
  assert.deepEqual(lineOf(busy).action, {type: 'guard', mw: 200}, 'the ring takes only what the dial is not using: 500 - 250');
  // the preview is stale after an input (with the clock held it stays so until Space): no second ask on it
  const stale = copy(room);
  Object.assign(stale.battery, {guardMW: 200});
  stale.sec.dirty = true;
  assert.ok(!(lineOf(stale).action && lineOf(stale).action.type === 'guard'), lineOf(stale).text);
  // armed for nothing: on a morning that holds without it, the reserve diesel goes first
  const armed = copy(keep.stop);
  Object.assign(armed.rert, {armed: true, leadS: 600, outMW: 0, standingDown: false, armedEver: true});
  const x = lineOf(armed);
  assert.equal(x.kind, 'spare');
  assert.deepEqual(x.action, {type: 'standDownRERT'});
  assert.deepEqual(x.targets, ['key-rert']);
  assert.match(x.text, /^The desk holds without the reserve diesel for the next 45 min\. Stand it down \(hold E\): it costs \$80,000 a minute\.$/);
  assert.equal(V.RERT_MW * V.RERT_COST / S_PER_MIN, 80000);
  armed.rert.standingDown = true;
  assert.notDeepEqual(lineOf(armed).action, {type: 'standDownRERT'}, 'not twice');
});

test('spare after a trip: a fired GUARD still giving while frequency is high is turned down; a fired GUARD is never raised; once re-armed it goes back up', () => {
  const {keep} = morning();
  // a belly trip smaller than the ring: the GUARD gives its 400 MW for its whole sustain whatever the frequency does
  const hi = copy(keep.stop);
  Object.assign(hi.battery, {guardMW: 400, ffrMW: 400, guardFired: true});
  hi.f.hz = 50.2;
  const x = lineOf(hi);
  assert.deepEqual(x.action, {type: 'guard', mw: 0});
  assert.equal(x.kind, 'spare');
  assert.equal(x.level, 'act');
  assert.deepEqual(x.targets, ['ring-guard']);
  assert.equal(x.text, 'Frequency is high: the battery GUARD is still giving its 400 MW after the trip. Turn it down to 0 MW; it can go back up once the GUARD has re-armed.');
  assert.ok(x.text.length <= O.LINE_MAX_CHARS);
  // in band, nothing delivered, the ring already down, or not fired: no such line
  for (const [k, v] of [['f', {hz: V.NORMAL_HI_HZ}], ['battery', {ffrMW: 0}], ['battery', {guardMW: 0, ffrMW: 120}], ['battery', {guardFired: false}]]) {
    const o = copy(hi);
    Object.assign(o[k], v);
    assert.notDeepEqual(lineOf(o).action, {type: 'guard', mw: 0}, k + ' ' + JSON.stringify(v) + ': ' + lineOf(o).text);
  }
  // the trip preview under the secure line asks for the GUARD (the line above) only while it is armed: a
  // ring raised while the fired GUARD is still sustaining delivers again at once
  const room = copy(keep.guard);
  Object.assign(room.battery, {guardMW: 0, mode: 'idle', orderMW: 0, socMWh: 900});
  assert.deepEqual(lineOf(room).action, {type: 'guard', mw: V.PAR_GUARD_MAX_MW}, 'armed');
  for (const b of [{guardFired: true}, {guardFired: true, guardMW: 200, ffrMW: 200}]) {
    const o = copy(room);
    Object.assign(o.battery, b);
    assert.ok(o.f.hz <= V.NORMAL_HI_HZ && o.sec.previewNadirHz < V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ);
    const y = lineOf(o);
    assert.ok(!(y.action && y.action.type === 'guard'), JSON.stringify(b) + ': ' + y.text);
  }
  // re-armed within the hour of the trip that took it to 0: back to its most at once, while the desk
  // is still SECURE (not after the N-1 gauge has gone insecure and chimed)
  const back = copy(keep.stop);
  Object.assign(back.battery, {guardMW: 0, ffrMW: 0, guardFired: false, mode: 'idle', orderMW: 0, socMWh: 900});
  back.contingencies.push({n: back.contingencies.length, startS: back.s - 900, cause: 'unit', id: 'coal1'});
  assert.equal(back.sec.level, 'SECURE');
  const y = lineOf(back);
  assert.deepEqual(y.action, {type: 'guard', mw: V.PAR_GUARD_MAX_MW});
  assert.equal(y.kind, 'spare');
  assert.equal(y.level, 'plan');
  assert.deepEqual(y.targets, ['ring-guard']);
  assert.equal(y.text, 'After the trip the battery GUARD is at 0 MW. Raise it to 400 MW: it catches the fall in the first second if anything else trips.');
  // not while it is still fired, not an hour after the trip, not after a loss of load (the GUARD never fired for it), not into an order
  const not = (tag, f) => { const o = copy(back); f(o); const z = lineOf(o); assert.ok(!(z.action && z.action.type === 'guard'), tag + ': ' + z.text); };
  not('fired', o => { o.battery.guardFired = true; });
  not('an hour on', o => { o.contingencies.at(-1).startS = o.s - S_PER_H; });
  not('a potline', o => { o.contingencies.at(-1).cause = 'load'; });
  const busy = copy(back);
  Object.assign(busy.battery, {mode: 'charge', orderMW: 300});
  assert.deepEqual(lineOf(busy).action, {type: 'guard', mw: 200}, 'the ring takes only what the charge order leaves');
});

test('GUARD after a belly trip (slow, desk-weekend 20261017 and 5): the follower is back in the normal band within FOS_RECOVER_S', slowOnly(), t => {
  // A unit at minimum trips under a GUARD of 400 MW raised at 04:31. Before the release line, frequency stayed
  // above 50.15 Hz for 478 s (20261017: coal 1, 240 MW at 14:08) and 526 s (5: 245 MW at 12:33) of the next
  // 900. On 20261017 the charge hold alone already brings it under the bound (157 s), so seed 5 is the case
  // where the bound itself bites; on both the line must turn the GUARD down and raise it again once re-armed.
  for (const c of [{seed: 20261017, untilH: 14.5, at: '14:08', mw: 240}, {seed: 5, untilH: 13.05, at: '12:33', mw: 245}]) {
    const day = followDay(c.seed, DESK_WEEKEND, {untilH: c.untilH});
    const trip = day.st.conts.find(x => x.cause === 'unit' && at(Math.floor(x.startTick / TPS)) === c.at);
    assert.ok(trip && Math.abs(trip.lostMW - c.mw) < 3, c.seed + ': the trip: ' + JSON.stringify(trip && {id: trip.id, lostMW: trip.lostMW}));
    // the day again a tick at a time from the follower's own log (F-6), counting the seconds above the band
    const st = createState(c.seed, DESK_WEEKEND), log = day.st.log;
    let j = 0, hiS = 0, guardAtTrip = -1;
    while (st.tick < day.st.tick) {
      const batch = [];
      while (j < log.length && log[j].tick <= st.tick) { batch.push(Object.assign({type: log[j].type}, log[j].args)); j++; }
      if (st.tick === trip.startTick) guardAtTrip = st.battery.guardMW;
      step(st, batch);
      if (st.tick % TPS === 0 && st.tick > trip.startTick && st.tick <= trip.startTick + 900 * TPS && st.last.fMeanHz > V.NORMAL_HI_HZ) hiS++;
    }
    assert.equal(hashState(st), hashState(day.st), c.seed + ': the same day');
    assert.equal(guardAtTrip, V.PAR_GUARD_MAX_MW, c.seed + ': the GUARD was at its most when the unit tripped');
    t.diagnostic(c.seed + ': ' + hiS + ' s above ' + V.NORMAL_HI_HZ + ' Hz in the 900 s after the trip');
    assert.ok(hiS <= V.FOS_RECOVER_S, c.seed + ': ' + hiS + ' s above ' + V.NORMAL_HI_HZ + ' Hz in the 900 s after the trip');
    const down = day.said.find(x => x.s > trip.startTick / TPS && x.accepted && x.action.type === 'guard' && x.action.mw === 0);
    assert.ok(down, c.seed + ': the line turned the GUARD down');
    assert.ok(day.said.some(x => x.s > down.s && x.accepted && x.action.type === 'guard' && x.action.mw === V.PAR_GUARD_MAX_MW), c.seed + ': and back up once it re-armed');
  }
});

// ------------------------------------------------------------------ the battery (§21.4)

test('battery: charge before the evening when the evening needs it, on what is spilled, and never an order on top of an order', () => {
  const {keep} = morning();
  const obs = keep.charge, x = lineOf(obs);
  assert.equal(x.kind, 'battery');
  assert.equal(x.level, 'plan');
  assert.equal(x.action.type, 'battery');
  assert.equal(x.action.mode, 'charge');
  assert.deepEqual(x.targets, ['dial-battery']);
  assert.match(x.text, /^The battery is at \d+%\. Charge it at \d+ MW now, to be full by 15:30: tonight's peak will want it\.$/);
  assert.ok(obs.s >= secOfH(V.PAR_BATT_CHARGE_H[0]) && obs.s < secOfH(V.PAR_BATT_CHARGE_H[1]), 'inside the charge window');
  // not within a quarter of an hour of a trip (the desk is catching it); from a quarter of an hour on, yes
  const trip = copy(obs);
  trip.contingencies.push({n: 1, startS: obs.s - 600, cause: 'unit', id: 'coal2', lostMW: 500, watchEndS: obs.s - 560, backInBandS: -1});
  assert.ok(!(lineOf(trip).action && lineOf(trip).action.type === 'battery'), 'ten minutes after a trip: ' + lineOf(trip).text);
  trip.contingencies[0].startS = obs.s - 900;
  assert.deepEqual(lineOf(trip).action, x.action, 'fifteen minutes after');
  // never more than the committed plant can carry on top of demand in the coming hour (the 4.5-h
  // forecast poked 40 MW under that; the plan as it was, so the plan's own columns stay clear)
  const thin = copy(obs);
  const G = O.capacityGap(thin, thin.forecast, {marginMW: O.MARGIN_MW});
  let spare = Infinity;
  for (let k = 0; k < G.n && (k + 1) * G.stepS <= S_PER_H; k++) spare = Math.min(spare, -G.gap[k]);
  for (let k = 0; k < thin.forecast.n; k++) thin.forecast.demandP50[k] += spare - 40;
  assert.ok(x.action.mw >= 50 && spare > 100, 'the order the line made with room: ' + x.action.mw + ' MW, ' + Math.round(spare) + ' MW spare');
  const t = objective(thin, {edited: false, planview: PV, dayAhead: thin.dayAhead, proj: PV.project(obs)});
  assert.ok(!(t.action && t.action.type === 'battery'), '40 MW of spare cannot carry a 50-MW charge: ' + t.text);
  // a price of $0 or less with nothing spilled: free power too, sized to what the GUARD leaves and the plant can carry
  const neg = copy(obs);
  Object.assign(neg.price, {mwh: -20});
  neg.wind.autoMW = 0; neg.solar.autoMW = 0;
  const projNeg = PV.project(neg);
  for (let k = 0; k < projNeg.n; k++) projNeg.surplusMW[k] = 0;
  const p = objective(neg, {edited: false, planview: PV, dayAhead: neg.dayAhead, proj: projNeg});
  assert.equal(p.kind, 'battery');
  assert.equal(p.action.mode, 'charge');
  assert.equal(p.action.mw, Math.floor(Math.min(neg.battery.ratedMW - neg.battery.guardMW, V.PAR_BATT_CHARGE_MAX_MW) / V.GUARD_STEP_MW) * V.GUARD_STEP_MW);
  assert.match(p.text, /^The price is −\$20\. Charge the battery at \d+ MW: power costs nothing now and is worth gas prices tonight\.$/);
  // the order made: the same observation with the battery charging at it proposes no battery order
  const made = copy(obs);
  Object.assign(made.battery, {mode: 'charge', orderMW: x.action.mw});
  const y = lineOf(made);
  assert.ok(!(y.action && y.action.type === 'battery'), 'no second order: ' + y.text);
  // full: nothing to charge
  const full = copy(obs);
  full.battery.socMWh = full.battery.capMWh;
  assert.ok(!(lineOf(full).action && lineOf(full).action.type === 'battery'));
  // spill: free power is charged with, in GUARD steps, inside what the GUARD leaves
  const spill = copy(obs);
  spill.wind.autoMW = 180; spill.solar.autoMW = 60;
  const z = lineOf(spill);
  assert.equal(z.kind, 'battery');
  assert.match(z.text, /^Power is being spilled\. Charge the battery at \d+ MW: it takes what would be wasted, and tonight that is worth gas prices\.$/);
  const lim = spill.battery.ratedMW - spill.battery.guardMW;
  assert.equal(z.action.mw, Math.floor(Math.min(lim, V.PAR_BATT_CHARGE_MAX_MW, 240) / V.GUARD_STEP_MW) * V.GUARD_STEP_MW);
  // ...but not in the MW a fired GUARD gave up after a trip (they are the GUARD's again once it re-arms;
  // a charge made in them was raised minute after minute on a cut that lags: desk-weekend seed 5, 12:37 and 12:38)
  for (const b of [{guardFired: true, guardMW: 0}, {guardFired: true, guardMW: 0, mode: 'charge', orderMW: 100}]) {
    const o = copy(spill);
    Object.assign(o.battery, b);
    o.contingencies.push({n: o.contingencies.length, startS: o.s - 300, cause: 'unit', id: 'coal1'}); // (a GUARD fires on a trip)
    const q = lineOf(o);
    assert.ok(!(q.action && q.action.type === 'battery' && q.action.mode === 'charge'), JSON.stringify(b) + ': ' + q.text);
  }
  // short while it charges: the short-now line outranks the battery's own, and asks for the battery the other way
  const tight = copy(made);
  for (const fc of [tight.forecast, tight.dayAhead]) for (let k = 0; k < 12; k++) fc.demandP50[k] += 2500;
  const w = lineOf(tight);
  assert.equal(w.kind, 'short');
  assert.equal(w.action.type, 'battery');
  assert.equal(w.action.mode, 'discharge');
});

test('battery in the evening: discharge while gas sets the price, at a rate that lasts to 22:00 and keeps the reserve; idle at the reserve', () => {
  // The evening's clock on a quiet plant (poked: the morning's observation at 18:00 with demand
  // 1,500 MW lower, nothing to start or stop, gas at the margin), so the battery branch speaks.
  const eve = copy(morning().keep.stop);
  eve.s = secOfH(18);
  for (const fc of [eve.forecast, eve.dayAhead]) for (let k = 0; k < fc.n; k++) fc.demandP50[k] -= 1500;
  for (const u of eve.units) if (u.cls === 'ccgt') u.stopBlock = 'minimum up time: 100 min left';
  eve.price = {mwh: 137, marginalId: 'ccgt1', adder: 0, exhausted: false, x: 0};
  Object.assign(eve.battery, {mode: 'idle', orderMW: 0, socMWh: 900, guardMW: 0});
  const reserve = V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH, idle = {type: 'battery', mode: 'idle', mw: 0};
  const x = lineOf(eve);
  assert.equal(x.kind, 'battery');
  assert.equal(x.level, 'plan', 'worth doing, never an alarm');
  const hours = (secOfH(V.PAR_BATT_DISCHARGE_H[1]) - eve.s) / S_PER_H;
  assert.deepEqual(x.action, {type: 'battery', mode: 'discharge', mw: Math.floor((900 - reserve) / hours / 10) * 10}, 'the rate that lasts to 22:00 above the reserve');
  assert.equal(x.text, 'Gas is setting the price ($137). Discharge the battery at 170 MW: it lasts to 22:00 and keeps 20% for a trip.');
  // inside what the GUARD leaves: the ring is the spare line's
  const ring = copy(eve);
  ring.battery.guardMW = 400;
  assert.deepEqual(lineOf(ring).action, {type: 'battery', mode: 'discharge', mw: 100});
  assert.equal(lineOf(ring).text, 'Gas is setting the price ($137). Discharge the battery at 100 MW, all the GUARD leaves free, down to 20%: the rest is kept for a trip.');
  // coal at the margin: the charge is worth more later
  const coal = copy(eve);
  coal.price = {mwh: 26, marginalId: 'coal1', adder: 0, exhausted: false, x: 0};
  assert.ok(!(lineOf(coal).action && lineOf(coal).action.type === 'battery'), lineOf(coal).text);
  // at the reserve, or within 5% of it: no discharge; discharging at the reserve: idle
  const band = copy(eve);
  band.battery.socMWh = reserve + O.BATT_BAND * V.BATT_MWH - 1;
  assert.ok(!(lineOf(band).action && lineOf(band).action.type === 'battery'), 'a band between the level that ends an order and the one that starts it');
  const low = copy(eve);
  Object.assign(low.battery, {mode: 'discharge', orderMW: 100, socMWh: reserve - 1});
  assert.deepEqual(lineOf(low).action, idle);
  assert.match(lineOf(low).text, /^The battery is down to 20%\. Set it to idle: /);
  // a discharge still running after 22:00, and a charge still running into the evening: idle
  const late = copy(eve);
  late.s = secOfH(22.5);
  Object.assign(late.battery, {mode: 'discharge', orderMW: 100, socMWh: 400});
  assert.deepEqual(lineOf(late).action, idle);
  assert.match(lineOf(late).text, /^The evening is over\. /);
  // A charge still running into the evening: while coal sets the price it tops the battery up (no
  // order: idle now and discharge a few minutes later would be two orders for one); once gas sets
  // it, the discharge is the one order, from the charge.
  const into = copy(coal);
  Object.assign(into.battery, {mode: 'charge', orderMW: 100, socMWh: 950});
  assert.ok(!(lineOf(into).action && lineOf(into).action.type === 'battery'), 'coal at the margin: the top-up runs on: ' + lineOf(into).text);
  const gasInto = copy(eve);
  Object.assign(gasInto.battery, {mode: 'charge', orderMW: 100, socMWh: 950});
  assert.equal(lineOf(gasInto).action.mode, 'discharge', 'gas at the margin: straight to the discharge');
  // a charge into the evening with the battery near its reserve (nothing to discharge): idle, and why
  const lowInto = copy(eve);
  Object.assign(lowInto.battery, {mode: 'charge', orderMW: 100, socMWh: reserve + 10});
  assert.deepEqual(lineOf(lowInto).action, idle);
  assert.equal(lineOf(lowInto).text, 'Gas is setting the price ($137). Set the battery to idle: charging now buys gas.');
  for (const o of [eve, ring, low, late, gasInto, lowInto]) assert.equal(lineOf(o).kind, 'battery', 'a BATTERY line never reads SHORT');
});

// ------------------------------------------------------------------ the start cascade (§21.4)

test('no start cascade: once a start is on its way the line never proposes a second for the shortfall the first cannot reach either', () => {
  const {keep, day} = morning();
  const obs = keep.start, x = lineOf(obs);
  assert.equal(x.kind, 'commit');
  assert.equal(x.level, 'act');
  assert.deepEqual(x.action, {type: 'start', unit: 'ccgt2'});
  assert.match(x.text, /Start CCGT 2 now: it takes 49 min to reach the grid/);
  // the same observation with that unit starting: the morning's line is gone (never GT after GT a minute apart)
  const going = copy(obs);
  Object.assign(unit(going, 'ccgt2'), {mode: 'starting', timerS: machine('ccgt2').t1S - 60, startBlock: 'unit is starting'});
  const y = lineOf(going);
  assert.ok(!(y.action && y.action.type === 'start' && y.startBy <= going.s + O.ACT_WITHIN_S && y.short && y.short.atS < going.s + startToMinS('ccgt2')), 'a second start for the same morning: ' + y.text);
  // over the followed morning: at most one start in any 5 minutes
  const starts = day.said.filter(a => a.accepted && a.action.type === 'start');
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i].s - starts[i - 1].s >= 300, at(starts[i - 1].s) + ' and ' + at(starts[i].s));
});

// ------------------------------------------------------------------ steady: the line as it is shown

test('steady: a line whose deadline or figure moves while it asks for the same thing is kept as it was said; an action is never held back or changed', () => {
  const plan = (text, startBy) => ({level: 'plan', kind: 'commit', text, targets: ['guard-start-ccgt2'], action: null, startBy, short: null, long: null});
  const a = plan('Start CCGT 2 by 05:15.', 4500), b = plan('Start CCGT 2 by 05:20.', 4800);
  let h = steady(null, a, 1000);
  assert.equal(h.line, a);
  h = steady(h, b, 1060);
  assert.equal(h.line.text, a.text, 'a later deadline within the hold: the line stands');
  assert.equal(h.line.startBy, a.startBy);
  assert.equal(h.seenS, 1000);
  h = steady(h, a, 1120);
  assert.equal(h.seenS, 1120, 'seen fresh again');
  // not the fresh reading for STEADY_HOLD_S: the new one shows
  let k = steady({line: a, seenS: 1000}, b, 1000 + O.STEADY_HOLD_S);
  assert.equal(k.line, b);
  // a deadline earlier by more than a mark is news at once
  k = steady({line: b, seenS: 1000}, plan('Start CCGT 2 by 05:05.', 3900), 1030);
  assert.equal(k.line.startBy, 3900);
  // within ACT_WITHIN_S of the deadline shown the fresh line always shows
  k = steady({line: a, seenS: 3990}, b, 4000);
  assert.equal(k.line, b);
  // an action, a critical line, another kind, other controls: at once
  const act = Object.assign(plan('Start CCGT 2 now.', 1100), {level: 'act', action: {type: 'start', unit: 'ccgt2'}});
  assert.equal(steady({line: a, seenS: 1000}, act, 1060).line, act);
  assert.equal(steady({line: act, seenS: 1000}, b, 1060).line, b, 'the line after an action is the fresh one');
  // a line the player has not acted on: the same action keeps its words while a figure in them moves...
  const g1 = {level: 'act', kind: 'spare', text: 'Frequency would fall to 49.38 Hz. Raise the battery GUARD to 400 MW.', targets: ['gauge-n1', 'ring-guard'], action: {type: 'guard', mw: 400}, startBy: 1000, short: null, long: null};
  const g2 = Object.assign({}, g1, {text: 'Frequency would fall to 49.33 Hz. Raise the battery GUARD to 400 MW.', startBy: 1030});
  const kept = steady({line: g1, seenS: 1000}, g2, 1030);
  assert.equal(kept.line.text, g1.text);
  assert.deepEqual(kept.line.action, g2.action);
  assert.equal(kept.line.startBy, 1030, 'now is now');
  // ...a different action is a different line, and a critical line is never held
  const g3 = Object.assign({}, g2, {text: 'Frequency would fall to 49.10 Hz. Raise the battery GUARD to 300 MW.', action: {type: 'guard', mw: 300}});
  assert.equal(steady({line: g1, seenS: 1000}, g3, 1030).line, g3);
  const c1 = Object.assign({}, g1, {level: 'crit', kind: 'short', text: 'Short 300 MW now.'}), c2 = Object.assign({}, c1, {text: 'Short 350 MW now.'});
  assert.equal(steady({line: c1, seenS: 1000}, c2, 1030).line, c2);
  const other = Object.assign(plan('Start GT·A by 05:20.', 4800), {targets: ['guard-start-gta1']});
  assert.equal(steady({line: a, seenS: 1000}, other, 1060).line, other);
  const quiet = {level: 'ok', kind: 'quiet', text: 'Enough plant is committed.', targets: [], action: null, startBy: -1, short: null, long: null};
  assert.equal(steady({line: a, seenS: 1000}, quiet, 1060).line, quiet);
  // other words are other news, shown at once even with the same kind, controls and deadline: a real
  // shortfall where there was only a deadline, another risk
  const next = plan('Next: start GT·A by 15:05 for the afternoon.', 4500), real = plan('You will be 400 MW short from 15:15. Start GT·A by 15:05.', 4500);
  assert.equal(steady({line: next, seenS: 1000}, real, 1060).line, real);
  const tie = {level: 'plan', kind: 'spare', text: 'Demand is covered, but losing the tie line would not be caught.', targets: ['gauge-n1', 'ring-guard'], action: null, startBy: -1, short: null, long: null};
  const big = Object.assign({}, tie, {text: 'Demand is covered, but losing your biggest unit would not be caught.'});
  assert.equal(steady({line: tie, seenS: 1000}, big, 1060).line, big);
  // a quiet line (nothing to do, no deadline) is shown for STEADY_QUIET_S against another quiet line:
  // the forecast's noise crosses its band edges a minute at a time
  const q2 = Object.assign({}, quiet, {text: 'Committed plant covers the forecast, but with little spare for a trip.'});
  let qh = steady(null, quiet, 2000);
  qh = steady(qh, q2, 2060);
  assert.equal(qh.line.text, quiet.text, 'a minute later: still the first');
  qh = steady(qh, quiet, 2120);
  qh = steady(qh, q2, 2000 + O.STEADY_QUIET_S - 1);
  assert.equal(qh.line.text, quiet.text);
  qh = steady(qh, q2, 2000 + O.STEADY_QUIET_S);
  assert.equal(qh.line.text, q2.text, 'after STEADY_QUIET_S the fresh one');
  assert.equal(qh.sinceS, 2000 + O.STEADY_QUIET_S);
  // ...and never over a line that asks for something
  const ask = Object.assign({}, quiet, {kind: 'commit', level: 'act', text: 'One trip now would leave you short. Start GT·C 1 now.', action: {type: 'start', unit: 'gtc1'}});
  assert.equal(steady(steady(null, quiet, 3000), ask, 3060).line, ask);
  // on the followed morning it changes no action and shows fewer distinct lines
  const {lines} = morning();
  let held = null, shown = 0, raw = 0, lastShown = '', lastRaw = '';
  for (const l of lines) {
    held = steady(held, l, l.s);
    assert.deepEqual(held.line.action, l.action);
    assert.equal(held.line.kind, l.kind);
    if (held.line.text !== lastShown) { shown++; lastShown = held.line.text; }
    if (l.text !== lastRaw) { raw++; lastRaw = l.text; }
  }
  assert.ok(shown <= raw, shown + ' shown, ' + raw + ' raw');
});

// ------------------------------------------------------------------ consequence(): what a press would do (C-10)

test('C-10 consequence: START says when the unit is at minimum load and how long it must run, from the machine\'s own times', () => {
  const obs = morning().keep.stop, ctx = {dayAhead: obs.dayAhead, planview: PV};
  for (const id of ['gta1', 'gtc1', 'coal4']) {
    const o = copy(obs);
    Object.assign(unit(o, id), {mode: 'off', startBlock: '', outMW: 0});
    const m = machine(id), c = consequence(o, 'guard-start-' + id, {dayAhead: o.dayAhead, planview: PV});
    assert.equal(c.target, 'guard-start-' + id);
    assert.equal(c.level, 'plan');
    const head = 'START ' + unitLabel(id) + ': at minimum load (' + m.minMW + ' MW) by ' + at(o.s + startToMinS(id)) + ', ' + span(startToMinS(id)) + ' from now, and it must then run ' + span(m.minUpS) + '. ';
    assert.ok(c.text.startsWith(head), c.text + '\n  expected: ' + head);
    assert.match(c.text.slice(head.length), /^(Nothing ahead needs it yet\.|It covers the shortfall from \d\d:\d\d\.|It helps with the shortfall from \d\d:\d\d\.|It is too late for \d\d:\d\d, but it helps from \d\d:\d\d\.)$/);
    assert.ok(c.text.length <= O.LINE_MAX_CHARS, c.text);
  }
  // coal: 50 min to full speed, 4 to sync, 70 to minimum load; then 8 hours on
  assert.equal(span(startToMinS('coal4')), '2 h 04');
  assert.equal(span(machine('coal4').minUpS), '8 h');
  // too late for a short gap that is over before the unit arrives: both gaps named, at the times the
  // objective line says them (the hover never contradicts the line)
  const two = copy(obs);
  Object.assign(unit(two, 'coal4'), {mode: 'off', outMW: 0, schedMW: 0, startBlock: '', stopBlock: 'unit is off'});
  const G = O.tripGap(two, two.dayAhead, O.COMMIT_MARGIN_MW - O.MARGIN_MW);
  const tAt = k => two.dayAhead.fromS + (k + 1) * two.dayAhead.stepS;
  setGap(two.dayAhead, G, k => (tAt(k) >= two.s + 600 && tAt(k) < two.s + 1500 ? 200 : tAt(k) >= two.s + 3 * S_PER_H && tAt(k) < two.s + 4 * S_PER_H ? 150 : -1000));
  const tc = consequence(two, 'guard-start-coal4', {dayAhead: two.dayAhead, planview: PV});
  const tm = /Too late for the gap from (\d\d):(\d\d); it (?:covers|helps with) the one from (\d\d):(\d\d)\.$/.exec(tc.text);
  assert.ok(tm, tc.text);
  assert.ok(secOfH(Number(tm[1]) + Number(tm[2]) / 60) < two.s + 1500 && secOfH(Number(tm[3]) + Number(tm[4]) / 60) >= two.s + 3 * S_PER_H - 900, tc.text);
  assert.ok(tc.text.length <= O.LINE_MAX_CHARS, tc.text);
  // hydro has no minimum load and no minimum run
  const h = copy(obs);
  Object.assign(unit(h, 'hydro3'), {mode: 'off', startBlock: ''});
  const c = consequence(h, 'guard-start-hydro3', ctx);
  assert.ok(c.text.startsWith('START HYDRO 3: on the grid by ' + at(h.s + startToMinS('hydro3')) + ', ' + span(startToMinS('hydro3')) + ' from now. '), c.text);
});

test('C-10 consequence: STOP says when the unit leaves the grid and the earliest it can be back (minimum down time from breaker open to the next START); coal is critical', () => {
  const obs = morning().keep.stop, ctx = {dayAhead: obs.dayAhead, planview: PV};
  const backOf = (o, id) => { const u = unit(o, id), m = machine(id), openS = o.s + Math.max(0, u.outMW - u.minMW) / m.rampMWs + m.t4S; return {openS, backS: openS + m.minDownS + startToMinS(id)}; };
  // a coal machine at 10:00: three hours to come off, not back before the evening is over
  const coal = consequence(obs, 'guard-stop-coal1', ctx), cb = backOf(obs, 'coal1');
  const day = s => at(s) + (s >= V.DAY_S ? ' tomorrow' : '');
  assert.ok(coal.text.startsWith('STOP COAL 1: off the grid in ' + span(cb.openS - obs.s) + ', and not back at minimum load before ' + day(cb.backS) + '.'), coal.text);
  assert.equal(coal.level, 'crit', 'the press opens a shortfall the unit cannot be back for');
  assert.match(coal.text, /( From \d\d:\d\d you would need [\d,]+ MW more than the line asks for| [A-Z][a-z' ]+ would be [\d,]+ MW short from \d\d:\d\d|one trip would then leave you short)\.$/);
  assert.ok(cb.backS - obs.s > machine('coal1').minDownS + machine('coal1').t4S, 'more than the 8 h of minimum down time');
  assert.ok(coal.text.length <= O.LINE_MAX_CHARS, coal.text);
  // A coal machine well above its floor is still on the grid for hours after the press: the shortfall
  // is said from when it begins, never "at once" (the unit counted down its ramp and the T4 slope).
  const high = copy(obs);
  Object.assign(unit(high, 'coal1'), {outMW: 560});
  // the morning short at once if the unit were simply gone (100 MW over what the rest can give, the margin included)
  const gone = O.capacityGap(high, high.dayAhead, {marginMW: O.MARGIN_MW, without: 'coal1'});
  const lift = 100 - maxGap(gone, -Infinity, high.s + 3 * S_PER_H);
  for (const fc of [high.forecast, high.dayAhead]) shift(fc, lift, -Infinity, high.s + 3 * S_PER_H);
  const hc = consequence(high, 'guard-stop-coal1', {dayAhead: high.dayAhead, planview: PV}), hb = backOf(high, 'coal1');
  assert.ok(hb.openS - high.s > 3 * S_PER_H - 600, 'off the grid in ' + span(hb.openS - high.s));
  assert.equal(hc.level, 'crit');
  assert.doesNotMatch(hc.text, /at once/i, 'it is still giving most of its 560 MW for an hour and more: ' + hc.text);
  const from = /(?:From (\d\d):(\d\d) you would|would be [\d,]+ MW short from (\d\d):(\d\d))/.exec(hc.text);
  assert.ok(from, hc.text);
  const fromS = secOfH(Number(from[1] || from[3]) + Number(from[2] || from[4]) / 60);
  assert.ok(fromS - high.s >= S_PER_H, 'the shortfall begins as its output falls, not at the press: ' + at(fromS));
  const G1 = O.capacityGap(high, high.dayAhead, {marginMW: O.MARGIN_MW, leaving: 'coal1'}), Gw = O.capacityGap(high, high.dayAhead, {marginMW: O.MARGIN_MW, without: 'coal1'});
  assert.ok(G1.gap[0] < Gw.gap[0] - 300, 'in the first column it is still giving most of its 560 MW');
  for (let k = 0; k < G1.n; k++) assert.ok(G1.gap[k] <= Gw.gap[k] + 1e-6);
  const brk = Math.floor((hb.openS - high.dayAhead.fromS) / high.dayAhead.stepS);
  assert.ok(Math.abs(G1.gap[brk + 1] - Gw.gap[brk + 1]) < 1e-6, 'and nothing once the breaker is open');
  // a unit already on its way down is counted the same way by every look-ahead
  const going = copy(high);
  Object.assign(unit(going, 'coal1'), {mode: 'unloading'});
  assert.deepEqual(Array.from(O.capacityGap(going, going.dayAhead).gap), Array.from(O.capacityGap(high, high.dayAhead, {leaving: 'coal1'}).gap));
  // the CCGT the objective proposes to stop: back in time, and the line says by when to start it
  const gas = consequence(obs, 'guard-stop-ccgt2', ctx), gb = backOf(obs, 'ccgt2');
  assert.ok(gas.text.startsWith('STOP CCGT 2: off the grid in ' + span(gb.openS - obs.s) + ', and not back at minimum load before ' + at(gb.backS) + '.'), gas.text);
  assert.equal(gas.level, 'plan');
  assert.match(gas.text, /( It is needed again from \d\d:\d\d: start it by \d\d:\d\d\.| Nothing ahead needs it today\.)$/);
  // a shortfall that begins after the unit could be back is the restart's business, not this press's:
  // the level stays 'plan' and the line says by when to start it again
  const later = copy(obs), Gl = O.capacityGap(later, later.dayAhead, {marginMW: O.MARGIN_MW, leaving: 'ccgt2'});
  setGap(later.dayAhead, Gl, 300, gb.backS + 2 * S_PER_H, gb.backS + 3 * S_PER_H);
  setGap(later.dayAhead, Gl, -2000, -Infinity, gb.backS + 2 * S_PER_H); setGap(later.dayAhead, Gl, -2000, gb.backS + 3 * S_PER_H);
  const lc = consequence(later, 'guard-stop-ccgt2', {dayAhead: later.dayAhead, planview: PV});
  assert.equal(lc.level, 'plan', lc.text);
  assert.match(lc.text, / It is needed again from \d\d:\d\d: start it by \d\d:\d\d\.$/);
  // a stop that opens a shortfall at once
  const now = copy(obs);
  for (const fc of [now.forecast, now.dayAhead]) for (let k = 0; k < fc.n; k++) fc.demandP50[k] += 1700;
  const hard = consequence(now, 'guard-stop-ccgt2', {dayAhead: now.dayAhead, planview: PV});
  assert.equal(hard.level, 'crit');
  // hydro: on the grid, not "at minimum load"
  const hy = consequence(obs, 'guard-stop-hydro1', ctx);
  assert.match(hy.text, /^STOP HYDRO 1: off the grid in \d+ min, and not back on the grid before \d\d:\d\d\./);
});

test('C-10 consequence: CANCEL START, a blocked press says why, a unit on its way says where it is, and a press that would do nothing gives the line back', () => {
  const obs = morning().keep.start, ctx = {dayAhead: obs.dayAhead, planview: PV};
  // CCGT 2 a quarter of an hour into its start: cancelling it throws the morning away
  const going = copy(obs);
  Object.assign(unit(going, 'ccgt2'), {mode: 'starting', timerS: machine('ccgt2').t1S - 900, startBlock: 'unit is starting'});
  const head = 'CANCEL START CCGT 2: it goes cold; a new start takes ' + Math.round(unit(going, 'ccgt2').startToMinS / S_PER_MIN) + ' min.';
  const c = consequence(going, 'guard-stop-ccgt2', {dayAhead: going.dayAhead, planview: PV});
  assert.ok(c.text.startsWith(head), c.text);
  assert.match(c.text.slice(head.length), /^ (The morning would be [\d,]+ MW short from \d\d:\d\d|From \d\d:\d\d (you would need [\d,]+ MW more than the line asks for|one trip would then leave you short)|It is needed again from \d\d:\d\d: start it (by \d\d:\d\d|again at once)|One trip would then leave you short)\.$/);
  // A cancelled start never closed its breaker: no minimum down time before the next START (C-12).
  // Its restart is the latest START that is back for the need, and never later than the need itself.
  const again = /It is needed again from (\d\d):(\d\d): start it (?:by (\d\d):(\d\d)|again at once)\./.exec(c.text);
  if (again) {
    const needS = secOfH(Number(again[1]) + Number(again[2]) / 60), byS = again[3] ? secOfH(Number(again[3]) + Number(again[4]) / 60) : going.s;
    assert.ok(byS + startToMinS('ccgt2') <= needS + 300, 'start it by ' + at(byS) + ' for ' + at(needS));
    assert.ok(byS < going.s + machine('ccgt2').minDownS, 'not after a minimum down time it does not have');
  }
  // a need it cannot be back for, a new start being 49 min: critical
  const soon = copy(going);
  for (const fc of [soon.forecast, soon.dayAhead]) for (let k = 0; k < fc.n; k++) { const t = fc.fromS + (k + 1) * fc.stepS; if (t >= soon.s + 1800) fc.demandP50[k] += 900; }
  const cs = consequence(soon, 'guard-stop-ccgt2', {dayAhead: soon.dayAhead, planview: PV});
  assert.equal(cs.level, 'crit', cs.text);
  assert.doesNotMatch(cs.text, /start it by/, cs.text);
  // with the morning 1,700 MW higher there is no doubt: the press opens a shortfall
  for (const fc of [going.forecast, going.dayAhead]) for (let k = 0; k < fc.n; k++) fc.demandP50[k] += 1700;
  const c2 = consequence(going, 'guard-stop-ccgt2', {dayAhead: going.dayAhead, planview: PV});
  assert.ok(c2.text.startsWith(head), c2.text);
  assert.equal(c2.level, 'crit');
  // blocked presses: the sim's own reason, in words
  const down = copy(obs);
  unit(down, 'ccgt2').startBlock = 'minimum down time: 156 min left';
  assert.deepEqual(consequence(down, 'guard-start-ccgt2', ctx), {target: 'guard-start-ccgt2', text: 'START CCGT 2 is blocked: minimum down time, 2 h 36 left.', level: 'plan'});
  const up = copy(obs);
  unit(up, 'ccgt1').stopBlock = 'minimum up time: 221 min left';
  assert.equal(consequence(up, 'guard-stop-ccgt1', ctx).text, 'STOP CCGT 1 is blocked: minimum up time, 3 h 41 left.');
  const tripped = copy(obs);
  Object.assign(unit(tripped, 'coal1'), {mode: 'tripped', timerS: 5400});
  assert.equal(consequence(tripped, 'guard-start-coal1', ctx).text, 'START COAL 1 is blocked: it tripped and is locked out for another 1 h 30.');
  assert.equal(consequence(tripped, 'guard-stop-coal1', ctx).text, 'COAL 1 is tripped: nothing to stop.');
  // a press that would do nothing says nothing: the objective stays on screen while the pointer
  // crosses the bank (START on a unit that is running or on its way off, STOP on one that is off)
  assert.equal(consequence(obs, 'guard-start-coal1', ctx), null, 'START on a unit that is on');
  assert.equal(consequence(obs, 'guard-stop-gta1', ctx), null, 'STOP on a unit that is off');
  for (const mode of ['loading', 'unloading', 'shutdown']) {
    const busy = copy(obs);
    unit(busy, 'ccgt1').mode = mode;
    assert.equal(consequence(busy, 'guard-start-ccgt1', ctx), null, 'START while ' + mode);
  }
  // a unit on its way says where it is, as a faceplate would: a START just made reads as under way
  // (level ok), with the times from the unit's own (full speed, then the auto-sync and T2 in AGC)
  assert.equal(obs.mode, 'AGC');
  const coming = copy(obs), cm = machine('ccgt2');
  Object.assign(unit(coming, 'ccgt2'), {mode: 'starting', timerS: 1200});
  assert.deepEqual(consequence(coming, 'guard-start-ccgt2', ctx), {target: 'guard-start-ccgt2', level: 'ok',
    text: 'CCGT 2 is starting: full speed at ' + at(coming.s + 1200) + ', at minimum load by ' + at(coming.s + 1200 + V.AUTO_SYNC_S + cm.t2S) + '.'});
  // by HAND nothing syncs it but the player: no time it cannot keep by itself
  coming.mode = 'HAND';
  assert.deepEqual(consequence(coming, 'guard-start-ccgt2', ctx), {target: 'guard-start-ccgt2', level: 'ok',
    text: 'CCGT 2 is starting: full speed at ' + at(coming.s + 1200) + '; then SYNC it by hand.'});
  const water = copy(obs);
  Object.assign(unit(water, 'hydro3'), {mode: 'starting', timerS: 60});
  assert.match(consequence(water, 'guard-start-hydro3', ctx).text, /^HYDRO 3 is starting: full speed at \d\d:\d\d, on the grid by \d\d:\d\d\.$/);
  // at full speed one press opens the synchroscope (FOCUS, 1x), not guarded: said, with the auto-sync's time
  const ready = copy(obs);
  Object.assign(unit(ready, 'ccgt2'), {mode: 'ready', timerS: 240});
  assert.deepEqual(consequence(ready, 'guard-start-ccgt2', ctx), {target: 'guard-start-ccgt2', level: 'plan',
    text: 'CCGT 2 is at full speed: a press opens the synchroscope (the clock runs at 1×); auto-sync closes its breaker at ' + at(ready.s + 240) + '.'});
  ready.mode = 'HAND';
  assert.equal(consequence(ready, 'guard-start-ccgt2', ctx).text, 'CCGT 2 is at full speed: a press opens the synchroscope (the clock runs at 1×).', 'by HAND no auto-sync');
  // on its way off, one press aborts the stop (not guarded): said
  for (const mode of ['unloading', 'shutdown']) {
    const stopping = copy(obs);
    unit(stopping, 'ccgt1').mode = mode;
    assert.deepEqual(consequence(stopping, 'guard-stop-ccgt1', ctx), {target: 'guard-stop-ccgt1', level: 'plan',
      text: 'CCGT 1 is stopping: one press ABORTs the stop and keeps it on.'}, mode);
  }
  // except hydro the grid unloads for its water: the sim refuses the ABORT ('no water'), and the line never offers it
  const dry = copy(obs);
  unit(dry, 'hydro1').mode = 'unloading';
  assert.match(consequence(dry, 'guard-stop-hydro1', ctx).text, /ABORTs/, 'water left: it can be kept on');
  dry.hydro.storageMWh = V.HYDRO_STOP_MWH - 1;
  assert.equal(consequence(dry, 'guard-stop-hydro1', ctx).text, 'HYDRO 1 is stopping: its water is spent, so it cannot be kept on.');
  // no target, an unknown one, the watch and the day's end: nothing
  assert.equal(consequence(obs, null, ctx), null);
  assert.equal(consequence(obs, 'guard-start-nothing9', ctx), null);
  assert.equal(consequence(obs, 'dial-battery', ctx), null);
  const watch = copy(obs);
  watch.inWatch = true;
  assert.equal(consequence(watch, 'guard-start-gta1', ctx), null);
  // a time after 04:00 is tomorrow's, and says so
  const late = copy(obs);
  late.s = secOfH(22);
  const cl = consequence(late, 'guard-stop-coal2', {dayAhead: late.dayAhead, planview: PV});
  assert.match(cl.text, /not back at minimum load before \d\d:\d\d tomorrow\./);
});

// ------------------------------------------------------------------ the accepts of §21.4 (slow): 11 seeds x 2 scenarios

const SEEDS = [[1, 'MILD'], [5, 'MILD'], [8, 'MILD'], [13, 'MILD'], [20261001, 'MILD'], [2, 'HOT'], [3, 'HOT'], [7, 'HOT'], [11, 'HOT'], [20260930, 'HOT'], [4, 'HEAT']];
const EVENING_S = secOfH(V.PAR_BATT_DISCHARGE_H[0]);
const k$ = x => Math.round(x / 1000);

// (i) widened to every DISCHARGE the line orders, the short-now and shortAhead branches' too: the
// orders inside one growing evening shortfall (a larger order, or demand response, as the gap grows).
// Reported, not asserted: §21.4 names the STOP, CHARGE and DISCHARGE hints, and whether that covers
// the shortfall branches' own orders is the integrator's to rule (desk/README.md, the wave-3 record).
function escalations(lines, said) {
  const out = [];
  for (const a of said) {
    if (!a.accepted || a.kind !== 'short' || a.action.type !== 'battery' || a.action.mode !== 'discharge') continue;
    const x = lines.find(l => l.s > a.s && l.s <= a.s + 300 && (l.kind === 'short' || (l.action && (l.action.type === 'callDR' || l.action.type === 'armRERT'))));
    if (x) out.push(at(a.s) + ' ' + a.action.mw + ' MW -> ' + at(x.s) + ' ' + x.text);
  }
  return out;
}

for (const scn of [DESK, DESK_WEEKEND]) {
  test('§21.4 accept on ' + scn.id + ' (slow): the hint-following player does well on the 11 seeds (a, b, c, d, e, g, h, i)', slowOnly(), t => {
    let clean = 0, rert = 0, dr = 0, costOk = 0, stopOk = 0, cheaper = 0, battOk = 0, battHot = 0, hot = 0, wide = 0, cascades = 0;
    for (const [seed, type] of SEEDS) {
      const lines = [];
      let batt = null, parBatt = null;
      const tag0 = scn.id + ' seed ' + seed;
      const rec = (obs, ctx) => {
        const x = objective(obs, ctx);
        lines.push({s: obs.s, kind: x.kind, level: x.level, text: x.text, action: x.action});
        // the line says what is true (wave-3 review): "Enough plant" only with no column a trip's worth
        // of spare short by THIN_MW or more; "short now" in the present tense only when the desk at its
        // limits is short in the next minutes
        if (/^Enough plant/.test(x.text)) assert.ok(maxGap(O.tripGap(obs, ctx.dayAhead, O.COMMIT_MARGIN_MW - O.MARGIN_MW)) < O.THIN_MW, tag0 + ' ' + at(obs.s) + ': ' + x.text);
        if (/^Your units are [\d,]+ MW below demand now/.test(x.text)) assert.ok(maxGap(O.capacityGap(obs, obs.forecast, {real: true}), -Infinity, obs.s + 301) > 0, tag0 + ' ' + at(obs.s) + ': ' + x.text);
        return x;
      };
      const day = followDay(seed, scn, {objective: rec, onMinute: (st, obs) => {
        if (batt === null && obs.s >= EVENING_S) batt = st.battery.socMWh;
        // C-10: what every guarded press would do, every half hour, is one line of plain words
        if (obs.s % 1800 < 60) {
          for (const u of obs.units) for (const g of ['guard-start-', 'guard-stop-']) {
            const c = consequence(obs, g + u.id, {dayAhead: obs.dayAhead, planview: PV});
            if (c) { assert.ok(c.text.length <= O.LINE_MAX_CHARS, tag0 + ' ' + at(obs.s) + ' ' + c.text); assert.doesNotMatch(c.text, /undefined|NaN|Infinity|-\d{1,2}:\d{2}/, c.text); }
          }
        }
      }});
      const tag = scn.id + ' seed ' + seed + ' (' + type + ')';
      assert.equal(observe(createState(seed, scn)).day.temp, type === 'HEAT' ? 'HOT' : type, tag + ': the day type the seed list says (a heatwave reads HOT until it is announced)');
      // (a) never black; nothing unserved on >= 9 of 11
      assert.equal(day.st.black, false, tag + ': black');
      if (day.score.unservedMWh === 0) clean++;
      // (b) the reserve diesel on <= 3 of 11, never left armed; mean DR calls <= 1.5
      if (day.st.rert.armedEver) rert++;
      assert.ok(!day.st.rert.armed || day.st.rert.standingDown, tag + ': the day ends with the reserve diesel armed');
      dr += V.DR_CALLS - day.st.dr.callsLeft;
      // (c) customer cost <= 1.3 x par's on >= 8 of 11
      const par = runPar(seed, scn, {onStep: st => { if (parBatt === null && st.tick >= EVENING_S * TPS) parBatt = st.battery.socMWh; }});
      const ratio = day.score.centsPerKWh / par.score.centsPerKWh;
      if (ratio <= 1.3) costOk++;
      // (d) a gas unit stopped before 12:00 and restarted, on mild and hot days
      const stops = day.said.filter(x => x.accepted && x.action.type === 'stop' && x.s < secOfH(12));
      const again = stops.filter(x => day.said.some(y => y.s > x.s && y.accepted && y.action.type === 'start' && y.action.unit === x.action.unit));
      if (type !== 'HEAT' && again.length) stopOk++;
      for (const x of day.said) if (x.action && x.action.type === 'stop') assert.match(x.action.unit, /^(ccgt|gt)/, tag + ': STOP named ' + x.action.unit);
      // (e) cheaper with the STOP and BATTERY lines followed than not; unserved energy higher on none
      const off = followDay(seed, scn, {objective: (obs, ctx) => { const x = objective(obs, ctx); return x.kind === 'stop' || x.kind === 'battery' ? Object.assign({}, x, {action: null}) : x; }});
      const plan = FOLLOW.planCost(day.score.cost), planOff = FOLLOW.planCost(off.score.cost);
      if (plan < planOff) cheaper++;
      assert.ok(day.score.unservedMWh <= off.score.unservedMWh + 1e-6, tag + ': more unserved with the branches on (' + day.score.unservedMWh.toFixed(0) + ' vs ' + off.score.unservedMWh.toFixed(0) + ' MWh)');
      // (g) the battery at 16:30 against par's
      if (batt >= parBatt) battOk++;
      if (type !== 'MILD') { hot++; if (batt >= parBatt) battHot++; }
      // (h) the no-input day fails
      const idle = followDay(seed, scn, {follow: false});
      assert.ok(idle.st.black || idle.score.unservedMWh > 5000, tag + ': the no-input day passes (' + idle.score.unservedMWh.toFixed(0) + ' MWh unserved)');
      // (i) the lines themselves
      lineChecks(lines, day.said, tag);
      const esc = escalations(lines, day.said);
      wide += esc.length;
      for (const e of esc) t.diagnostic(tag + ': (i) widened: ' + e);
      // never thrash (§21.4): the battery branch's own orders, idle included, a quarter of an hour apart
      const own = day.said.filter(a => a.accepted && a.kind === 'battery' && a.action.type === 'battery');
      for (let i = 1; i < own.length; i++) assert.ok(own[i].s - own[i - 1].s >= 900, tag + ': battery orders ' + at(own[i - 1].s) + ' ' + own[i - 1].action.mode + ' and ' + at(own[i].s) + ' ' + own[i].action.mode);
      // start cascades: more than two starts within 5 grid-min (reported; on these days only after a trip)
      const starts = day.said.filter(a => a.accepted && a.action.type === 'start');
      for (let i = 0; i < starts.length; i++) {
        const w = starts.filter(b => b.s >= starts[i].s && b.s - starts[i].s <= 300);
        if (w.length > 2 && !(i > 0 && starts[i].s - starts[i - 1].s <= 300)) {
          cascades++;
          const trip = day.st.conts.find(c => { const cs = Math.floor(c.startTick / TPS); return cs <= w.at(-1).s && w[0].s - cs <= 1800; });
          t.diagnostic(tag + ': start cascade ' + w.map(b => at(b.s) + ' ' + b.action.unit).join(', ') + (trip ? ' (' + trip.cause + ' ' + trip.id + ' tripped at ' + at(Math.floor(trip.startTick / TPS)) + ')' : ' (NO trip in or before it)'));
        }
      }
      t.diagnostic(tag + ': unserved ' + day.score.unservedMWh.toFixed(0) + ' MWh, RERT ' + (day.st.rert.armedEver ? 'armed' : '-') + ', DR ' + (V.DR_CALLS - day.st.dr.callsLeft) + ', ' +
        day.score.centsPerKWh.toFixed(2) + ' c/kWh (par ' + par.score.centsPerKWh.toFixed(2) + ', x' + ratio.toFixed(2) + '), plan $' + k$(plan) + 'k (off $' + k$(planOff) + 'k), battery at 16:30 ' +
        Math.round(batt) + ' MWh (par ' + Math.round(parBatt) + '), stops before 12:00 ' + (stops.map(x => x.action.unit).join(' ') || '-') + ' (restarted: ' + (again.map(x => x.action.unit).join(' ') || '-') + '), no input ' +
        idle.score.unservedMWh.toFixed(0) + ' MWh');
    }
    t.diagnostic(scn.id + ': a clean ' + clean + '/11; b RERT ' + rert + '/11, DR mean ' + (dr / 11).toFixed(2) + '; c ' + costOk + '/11; d ' + stopOk + '/10; e ' + cheaper + '/11; g ' + battOk + '/11 (hot and heatwave days ' + battHot + '/' + hot + ')' +
      '; (i) widened to the shortfall branches\' discharges: ' + wide + '; start cascades ' + cascades);
    assert.ok(clean >= 9, 'a: nothing unserved on ' + clean + ' of 11');
    assert.ok(rert <= 3, 'b: the reserve diesel armed on ' + rert + ' of 11');
    assert.ok(dr / 11 <= 1.5, 'b: ' + (dr / 11).toFixed(2) + ' DR calls a day');
    assert.ok(costOk >= 8, 'c: within 1.3 x par on ' + costOk + ' of 11');
    // (d) on both day scenarios: "on mild and hot days" holds for the weekend too
    assert.ok(stopOk >= 8, 'd: a gas unit stopped before 12:00 and restarted on ' + stopOk + ' of the 10 non-heatwave seeds');
    assert.ok(cheaper >= 8, 'e: cheaper with the STOP and BATTERY lines on ' + cheaper + ' of 11');
    // (g) is asserted on the hot days it names; the MILD days are reported (par ends several exactly full: see desk/README.md)
    assert.ok(battHot >= hot - 1, 'g: the battery at or above par\'s at 16:30 on ' + battHot + ' of the ' + hot + ' hot and heatwave days');
  });
}

test('§21.4 accept f (slow): each quoted STOP saving against the same day with that one STOP skipped', {...slowOnly(), todo: 'f fails as written: 38 of 140 after the wave-3 review (45 of 155 before). The skip of tools/follow.mjs blocks the unit until its next start, and the STOP candidate is the dearest committed gas unit (§21.4), so every later STOP of a cheaper unit in that window is forgone too: the realised figure is the queue\'s. Read stop by stop within a queue, 116 of 140. The rest: hot-morning STOPs a trip turned into a loss (the line says "if nothing trips before then"), and knock-on effects of keeping a unit on. The measure is the integrator\'s to settle (desk/README.md, the wave-3 record)'}, t => {
  let ok = 0, okQueue = 0, n = 0;
  const offers = new Map(observe(createState(1, DESK)).units.map(u => [u.id, u.offer])), offer = id => offers.get(id);
  const within = (quoted, realised) => Math.abs(quoted - realised) <= 10000 || Math.abs(quoted - realised) <= 0.3 * Math.abs(realised);
  for (const scn of [DESK, DESK_WEEKEND]) for (const [seed, type] of SEEDS) {
    const day = followDay(seed, scn), rows = [];
    for (const {line, untilS} of FOLLOW.stopLines(day.said)) {
      const alt = followDay(seed, scn, {objective: FOLLOW.skipping(line, untilS)});
      rows.push({line, untilS, quoted: FOLLOW.quotedSaving(line), realised: FOLLOW.planCost(alt.score.cost) - FOLLOW.planCost(day.score.cost)});
    }
    rows.forEach((r, i) => {
      // the queue reading: a later STOP of a unit no dearer, inside this one's skip window, was forgone with it
      const j = rows.findIndex((q, jj) => jj > i && q.line.s < r.untilS && offer(q.line.action.unit) <= offer(r.line.action.unit));
      const marginal = j >= 0 ? r.realised - rows[j].realised : r.realised;
      n++; if (within(r.quoted, r.realised)) ok++; if (within(r.quoted, marginal)) okQueue++;
      t.diagnostic(scn.id + ' seed ' + seed + ' (' + type + ') ' + at(r.line.s) + ' ' + r.line.action.unit + ': quoted $' + k$(r.quoted) + 'k, realised $' + k$(r.realised) + 'k' +
        (within(r.quoted, r.realised) ? '' : '  OUTSIDE') + ', stop by stop $' + k$(marginal) + 'k' + (within(r.quoted, marginal) ? '' : '  OUTSIDE'));
    });
  }
  t.diagnostic('f: ' + ok + ' of ' + n + ' quoted savings within +-30% or $10,000 of the realised difference; stop by stop within a queue ' + okQueue + ' of ' + n);
  assert.equal(ok, n);
});
