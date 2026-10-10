// Q-59 (desk/README.md §31.9.8): the objective line names the city levers. A HOT WATER SOAK line
// after the battery's (an MSL notice ahead until the window's forecast clears it, or spill the
// battery will not take as the battery line charges it) and an AIR-CON CYCLE line after
// shortAhead (a shortfall no start reaches, past the battery's hour and more than the battery
// holds; its peak in the core, none in the pre-cool). Poked observations of two followed
// mornings (a MILD 06:30, a HOT 05:00), no whole days (CLAUDE.md).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observe, applyInput, createState, step} from '../sim/step.js';
import {aimFlex} from '../sim/autopilot.js';
import {V} from '../sim/params.js';
import {DESK, CLASSIC} from '../content/scenarios.js';
import * as PV from '../app/planview.js';
import {objective, capacityGap, stick, LINE_MAX_CHARS, ACT_WITHIN_S} from '../app/objective.js';
import {followDay} from './lib/follow.js';

const H = 3600;
const inWin = t => t >= V.SOAK_FROM_S && t <= V.SOAK_TO_S;
const copy = x => structuredClone(x);
const lineOf = (obs, o = {}) => objective(obs, Object.assign({edited: false, planview: PV, dayAhead: obs.dayAhead}, o));
const sub = (obs, id) => obs.levers.suburbs.find(x => x.id === id);
const block = (obs, ids, lever) => { for (const id of ids) sub(obs, id)[lever].block = 'poked'; return obs; };
const isCity = (x, lever) => x.kind === 'city' && !!x.action && x.action.lever === lever;
// accepted by the sim on a copy of the state the observation came from
const accepted = (st, action) => applyInput(JSON.parse(JSON.stringify(st)), action, []).ok;

// The followed mornings, once each: DESK seed 8 (MILD) to 06:30, seed 7 (HOT) to 05:00.
const runs = {};
function morning(seed, h) {
  const key = seed + '@' + h;
  if (!runs[key]) { const d = followDay(seed, DESK, {untilH: h}); runs[key] = {st: d.st, obs: observe(d.st, {dayAhead: true})}; }
  return {st: runs[key].st, obs: copy(runs[key].obs)};
}
const hot = () => morning(7, 5);
// The MILD 06:30 with the day-ahead's low moved to 12:00, so a soak aims at 10:00-14:00, inside
// the projection (it ends at 11:00); `low` false keeps the day's own aim, 11:00-15:00.
const NOON = (12 - V.DAY_START_H) * H;
function mild(low = true) {
  const m = morning(8, 6.5), da = m.obs.dayAhead;
  if (low) da.demandP50[Math.round((NOON - da.fromS) / da.stepS) - 1] = Math.min(...da.demandP50) - 100;
  return m;
}

// The projection with `mw` of spill in the columns `when` picks and none elsewhere.
function spill(obs, mw, when = inWin) {
  const P = PV.project(obs);
  for (let k = 0; k < P.n; k++) { P.surplusMW[k] = when(P.times[k]) ? mw : 0; P.charging[k] = 0; }
  return P;
}

test('Q-59 soak (b): spill the battery will not take names the free suburb with the most MW under the excess, aimed by aimFlex, with the full flex input', () => {
  const {st, obs} = mild();
  assert.equal(obs.day.temp, 'MILD');
  assert.match(lineOf(obs).text, /^Next: start /, 'the morning\'s own line: commit-later, nothing to do now');
  const b = obs.battery;
  assert.equal(b.ratedMW - b.guardMW, 100, 'the GUARD leaves the battery 100 MW to charge');
  // 300 MW spilled 10:00-11:00, the battery takes 100: 200 over, Old Hazelton's 140 fits
  const x = lineOf(obs, {proj: spill(obs, 300)}), atS = aimFlex(obs.dayAhead, obs.levers, 'HAZ', 'soak');
  assert.equal(atS, V.SOAK_FROM_S);
  assert.deepEqual([x.kind, x.level, x.targets, x.action, x.startBy], ['city', 'plan', ['suburb-HAZ'], {type: 'flex', suburb: 'HAZ', lever: 'soak', atS}, atS]);
  assert.match(x.text, /^The battery cannot take all of noon's spill\. Book a HOT WATER SOAK in Old Hazelton, (\d\d:\d\d)–(\d\d:\d\d) \(140 MW\): tanks take the rest; tonight's heating falls by as much\.$/);
  assert.ok(accepted(st, x.action), 'the sim books it as said');
  // under the excess: 60 MW over books Solstice Rise (60), the first of the two 60s in city order
  assert.equal(lineOf(obs, {proj: spill(obs, 160)}).action.suburb, 'SOL');
  // no suburb under it: the smallest free one
  assert.equal(lineOf(block(copy(obs), ['HAR', 'SOL', 'SAL'], 'soak'), {proj: spill(obs, 160)}).action.suburb, 'TAL');
  // at SURPLUS_MIN_MW over, or under it: nothing
  assert.equal(lineOf(obs, {proj: spill(obs, 100 + V.SURPLUS_MIN_MW)}).kind, 'commit');
  // no free suburb: nothing
  assert.equal(lineOf(block(copy(obs), ['SOL', 'HAZ', 'RED', 'HAR', 'TAL', 'SAL'], 'soak'), {proj: spill(obs, 300)}).kind, 'commit');
  // aimed at 11:00-15:00 (the day's own low), the soak takes none of the spill at 10:00-10:55: nothing
  const own = mild(false).obs;
  assert.equal(aimFlex(own.dayAhead, own.levers, 'HAZ', 'soak'), V.SOAK_FROM_S + H);
  assert.equal(lineOf(own, {proj: spill(own, 300)}).kind, 'commit');
});

test('Q-59 soak (b): the battery as the battery line charges it: up to what the GUARD leaves and 350 MW, from the earliest blue column, until full', () => {
  const {obs} = mild();
  const free = copy(obs);
  free.battery.ratedMW = free.battery.guardMW + 400; // the GUARD leaves 400 MW: 350 of charge (PAR_BATT_CHARGE_MAX_MW)
  assert.equal(lineOf(free, {proj: spill(free, 300)}).kind, 'commit', 'it takes all 300 MW: the morning\'s own line');
  assert.equal(lineOf(free, {proj: spill(free, 350 + V.SURPLUS_MIN_MW + 5)}).action.suburb, 'HAR', '55 MW over');
  const full = copy(free);
  full.battery.socMWh = full.battery.capMWh;
  assert.equal(lineOf(full, {proj: spill(full, 300)}).action.suburb, 'HAZ', 'a full battery takes nothing');
  // spill from 08:00 fills it before 10:00 (394 MWh of room at 300 MW): the window's spill is all over
  const early = t => t >= V.SOAK_FROM_S - 2 * H && t <= V.SOAK_TO_S;
  assert.equal(lineOf(free, {proj: spill(free, 300, early)}).action.suburb, 'HAZ');
  // spill before the window only: no soak
  assert.equal(lineOf(full, {proj: spill(full, 300, t => t < V.SOAK_FROM_S)}).kind, 'commit');
  // a present charge order is part of what the battery takes
  const P = spill(obs, 0);
  for (let k = 0; k < P.n; k++) if (inWin(P.times[k])) { P.surplusMW[k] = 250; P.charging[k] = 100; }
  assert.equal(lineOf(obs, {proj: P}).action.suburb, 'HAZ', '250 + 100 spilled, 100 taken: 250 over');
});

test('Q-59 soak (a): an MSL notice ahead books the most MW until the window\'s forecast clears it (the notice is re-checked every 5 min)', () => {
  const {obs} = mild(), proj = PV.project(obs);
  const msl = copy(obs), d = msl.forecast.demandP50;
  Object.assign(msl.msl, {level: 1, minMW: 1550, atS: msl.s + 4 * H, sinceS: msl.s});
  let lo = -1;
  for (let k = 0; k < msl.forecast.n; k++) if (inWin(proj.times[k])) { d[k] = 1650; if (lo < 0) lo = k; }
  d[lo + 3] = 1550;
  const x = lineOf(msl, {proj});
  assert.deepEqual([x.kind, x.targets, x.action.lever, x.action.atS], ['city', ['suburb-HAZ'], 'soak', aimFlex(msl.dayAhead, msl.levers, 'HAZ', 'soak')]);
  assert.match(x.text, /^MSL1: demand falls to about 1,550 MW at \d\d:\d\d\. Book a HOT WATER SOAK in Old Hazelton, \d\d:\d\d–\d\d:\d\d \(140 MW\): it lifts the low; tonight's heating falls by as much\.$/);
  // Old Hazelton booked: the next most
  assert.equal(lineOf(block(copy(msl), ['HAZ'], 'soak'), {proj}).action.suburb, 'RED');
  // the window's forecast above the clear line (MSL1_MW + MSL_CLEAR_MW): the notice will clear, no line
  const clear = copy(msl);
  for (let k = 0; k < clear.forecast.n; k++) if (inWin(proj.times[k])) clear.forecast.demandP50[k] = V.MSL1_MW + V.MSL_CLEAR_MW + 1;
  assert.equal(lineOf(clear, {proj}).kind, 'commit');
  // a notice whose low is now, or none
  const now = copy(msl);
  now.msl.atS = now.s;
  assert.equal(lineOf(now, {proj}).kind, 'commit');
  const none = copy(msl);
  none.msl.level = 0;
  assert.equal(lineOf(none, {proj}).kind, 'commit');
  // the tie out lifts every threshold by MSL_TIE_OUT_MW in the columns before its return (sim/events.js):
  // 100 MW above the clear line clears with the tie in, and holds with it out past 15:00 (the units
  // poked large, so no start answers the tie's loss first)
  const tie = copy(msl);
  for (const u of tie.units) u.ratingMW = u.availMW = 5000;
  for (let k = 0; k < tie.forecast.n; k++) if (inWin(proj.times[k])) tie.forecast.demandP50[k] = V.MSL1_MW + V.MSL_CLEAR_MW + 100;
  assert.notEqual(lineOf(tie, {proj}).kind, 'city');
  Object.assign(tie.tie, {tripped: true, lockoutS: V.SOAK_TO_S + H - tie.s});
  const y = lineOf(tie, {proj});
  assert.deepEqual([y.kind, y.action && y.action.suburb], ['city', 'HAZ']);
  assert.match(y.text, /^MSL1: demand falls to about 1,800 MW/);
  tie.tie.lockoutS = V.SOAK_FROM_S - H - tie.s;
  assert.notEqual(lineOf(tie, {proj}).kind, 'city', 'the tie back by 09:00: no lift in the window');
});

test('Q-59 soak: aimed only when the window is in view (no day-ahead: the low is the last column), never in place of a battery order due now', () => {
  const {obs} = mild();
  assert.notEqual(lineOf(obs, {proj: spill(obs, 300), dayAhead: null}).kind, 'city', 'aimFlex -1: not yet in view');
  // spill now: the battery's charge order first
  const now = copy(obs);
  now.solar.autoMW = 200;
  const x = lineOf(now, {proj: spill(now, 300)});
  assert.deepEqual([x.kind, x.action.type, x.action.mode], ['battery', 'battery', 'charge']);
  // CLASSIC has no levers
  const st = createState(2, CLASSIC);
  while (st.tick < V.PLAYER_START_TICK + 60 * V.TICKS_PER_S) step(st);
  const c = observe(st, {dayAhead: true});
  assert.deepEqual(c.levers.suburbs, []);
  assert.notEqual(lineOf(c, {proj: spill(c, 2000)}).kind, 'city');
});

// The HOT 05:00 with no unit left to start and the day-ahead's real gap (capacityGap real) shaped by
// hand: -300 MW everywhere, and `g(k)` in the evening around the column nearest 19:15.
function evening(o, g) {
  const obs = o || hot().obs, day = obs.dayAhead;
  for (const u of obs.units) if (u.mode === 'off') u.startBlock = 'poked';
  day.solarMW.fill(0);
  const R = capacityGap(obs, day, {real: true});
  let peak = 0;
  for (let k = 0; k < day.n; k++) if (Math.abs(day.fromS + (k + 1) * day.stepS - (19.25 - V.DAY_START_H) * H) < Math.abs(day.fromS + (peak + 1) * day.stepS - (19.25 - V.DAY_START_H) * H)) peak = k;
  for (let k = 0; k < day.n; k++) { const gap = g(k - peak); day.demandP50[k] += (gap === undefined ? -300 : gap) - R.gap[k]; }
  return obs;
}
// 18:35-19:55, 100 MW at its edges, 700 at 19:15
const BUMP = i => (Math.abs(i) <= 8 ? 100 + 75 * (8 - Math.abs(i)) : undefined);

test('Q-59 air-con: a shortfall no start reaches, more than the battery holds, its peak in the core and none in the pre-cool: the suburb with the most relief', () => {
  const {st} = hot(), obs = evening(null, BUMP);
  assert.equal(obs.day.temp, 'HOT');
  const atS = aimFlex(obs.dayAhead, obs.levers, 'RED', 'aircon');
  assert.equal(atS, (18.5 - V.DAY_START_H) * H, 'relief 18:30-20:00 around the 19:15 peak');
  const x = lineOf(obs);
  assert.deepEqual([x.kind, x.level, x.targets, x.action, x.startBy], ['city', 'plan', ['suburb-RED'], {type: 'flex', suburb: 'RED', lever: 'aircon', atS}, atS - V.PRECOOL_S]);
  assert.equal(x.text, 'From about 18:30 committed units fall short. Book an AIR-CON CYCLE in Redgum Flats, 18:30–20:00 (45 MW): pre-cool from 17:30; 40% of the relief comes back after.');
  assert.ok(accepted(st, x.action), 'the sim books it as said');
  // Redgum Flats booked or locked: the next most relief
  assert.equal(lineOf(block(copy(obs), ['RED'], 'aircon')).action.suburb, 'HAR');
  // its deadline (the pre-cool's start) within ACT_WITHIN_S and the reading time: act
  const lead = {leadS: atS - V.PRECOOL_S - obs.s - ACT_WITHIN_S};
  assert.equal(lineOf(obs, lead).level, 'act');
  // not yet due, it waits behind a line with something to do now (a feeder that can close), and
  // comes back once that is done; due, it keeps its place in the order
  const dark = copy(obs);
  Object.assign(dark.districts[0], {dark: true, restoreBlock: ''});
  assert.equal(lineOf(dark).kind, 'restore');
  assert.equal(lineOf(dark, lead).kind, 'city');
  dark.districts[0].dark = false;
  assert.equal(lineOf(dark).kind, 'city');
  // an earlier, smaller run (150 MW at 16:15-16:45, before the pre-cool) does not hide the evening's
  const two = evening(null, i => BUMP(i) || (i >= -36 && i <= -30 ? 150 : undefined));
  assert.deepEqual(lineOf(two).action, x.action);
});

test('Q-59 air-con: not when the pre-cool lands in the gap, the peak is past the core, the battery holds it, a start can reach it, or the next minutes are short', () => {
  // the gap from 18:15: inside the pre-cool 17:30-18:30
  assert.ok(!isCity(lineOf(evening(null, i => (i >= -12 && i <= 8 ? (BUMP(i) || 100) : undefined))), 'aircon'));
  // the run's largest column at 20:10, after the core (wind lost then; the demand peak, and so the aim, stay at 19:15)
  const late = evening(null, i => BUMP(i) || (i > 8 && i <= 16 ? 100 : undefined));
  const k0 = late.dayAhead.demandP50.indexOf(Math.max(...late.dayAhead.demandP50));
  for (let k = k0 + 11; k <= k0 + 14; k++) late.dayAhead.windMW[k] -= 1500;
  assert.ok(!isCity(lineOf(late), 'aircon'));
  // 300 MW at most: the battery holds it as the battery line charges it by 15:30 (to 97%), even
  // from 68%: about 565 MWh (a tail of 290 MW to 20:55) is not air-con's, 855 MWh (to 21:55) is
  const small = n => {
    const o = evening(null, i => (Math.abs(i) <= 8 ? 100 + 25 * (8 - Math.abs(i)) : undefined)), w = o.dayAhead.windMW;
    const k0 = o.dayAhead.demandP50.indexOf(Math.max(...o.dayAhead.demandP50));
    for (let k = k0 + 9; k < k0 + 9 + n; k++) w[k] -= 590; // wind lost: the gap grows, demand and the aim stay
    o.battery.socMWh = 680;
    return o;
  };
  assert.ok(!isCity(lineOf(small(0)), 'aircon'));
  assert.ok(!isCity(lineOf(small(12)), 'aircon'));
  assert.ok(isCity(lineOf(small(24)), 'aircon'));
  // a unit that can still be started for it: the commit lines' (a start beats air-con)
  const start = evening(null, BUMP);
  start.units.find(u => u.id === 'gta1').startBlock = '';
  assert.ok(!isCity(lineOf(start), 'aircon'));
  // short within the next quarter of an hour with no battery and no demand response left: not air-con's
  const soon = evening(null, BUMP);
  for (let k = 1; k <= 3; k++) soon.forecast.demandP50[k] += 3000;
  Object.assign(soon.battery, {socMWh: V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH});
  soon.dr.callsLeft = 0;
  assert.ok(!isCity(lineOf(soon), 'aircon'));
  // a MILD day offers no air-con
  assert.ok(!isCity(lineOf(evening(mild().obs, BUMP)), 'aircon'));
});

test('Q-59: every city line fits LINE_MAX_CHARS with the longest name (Tallowood Heights) and the widest figures', () => {
  const others = ['SOL', 'HAZ', 'RED', 'HAR', 'SAL'];
  const {obs} = mild(), proj = PV.project(obs);
  const msl = block(copy(obs), others, 'soak');
  sub(msl, 'TAL').soak.mw = 140;
  Object.assign(msl.msl, {level: 3, minMW: 1700, atS: msl.s + 4 * H, sinceS: msl.s});
  for (let k = 0; k < msl.forecast.n; k++) if (inWin(proj.times[k])) msl.forecast.demandP50[k] = V.MSL1_MW + V.MSL_CLEAR_MW - 25;
  const spilled = block(copy(obs), others, 'soak');
  sub(spilled, 'TAL').soak.mw = 140;
  const air = block(evening(null, BUMP), others, 'aircon');
  sub(air, 'TAL').aircon.mw = 145;
  const lines = [lineOf(msl, {proj}), lineOf(spilled, {proj: spill(spilled, 300)}), lineOf(air)];
  for (const x of lines) {
    assert.equal(x.kind, 'city');
    assert.match(x.text, /Tallowood Heights/);
    assert.ok(x.text.length <= LINE_MAX_CHARS, x.text.length + ': ' + x.text);
    assert.doesNotMatch(x.text, /undefined|NaN|Infinity/);
  }
});

test('S1 (2b final review): an aim within a 5-min step of the shown line\'s keeps it: sampled every 30 grid s for 30 min, the soak line and the air-con aim name one time each where aimFlex alone flips between two marks', () => {
  // the followed HOT 06:30 (the day-ahead starts at obs.s, off the lattice, so its extreme column slides); the sim
  // jumps 30 s between samples, the plan held; the soak line on the soak (a) row's MSL1 poke, held as the game holds it
  const st = JSON.parse(JSON.stringify(morning(7, 6.5).st)), raw = {soak: [], aircon: []}, kept = [], said = [];
  let held = null, keep = -1;
  for (let i = 0; i < 60; i++) {
    for (const end = st.tick + 30 * V.TICKS_PER_S; st.tick < end;) step(st, []);
    const obs = observe(st, {dayAhead: true}), proj = PV.project(obs), a = aimFlex(obs.dayAhead, obs.levers, 'RED', 'aircon');
    raw.soak.push(aimFlex(obs.dayAhead, obs.levers, 'HAZ', 'soak'));
    raw.aircon.push(a);
    kept.push(keep = stick(a, keep, sub(obs, 'RED').aircon));
    Object.assign(obs.msl, {level: 1, minMW: 1550, atS: obs.s + 4 * H, sinceS: obs.s});
    for (let k = 0; k < obs.forecast.n; k++) if (inWin(proj.times[k])) obs.forecast.demandP50[k] = 1650;
    held = lineOf(obs, {proj, held});
    assert.equal(held.kind, 'city', held.text);
    said.push(held.action.atS);
  }
  const changes = a => a.filter((x, i) => i && x !== a[i - 1]).length;
  assert.ok(changes(raw.soak) >= 4 && changes(raw.aircon) >= 4, 'the fixture flips: ' + changes(raw.soak) + ' and ' + changes(raw.aircon) + ' changes');
  assert.ok(changes(said) <= 1 && changes(kept) <= 1, 'the line ' + changes(said) + ', the air-con aim ' + changes(kept));
  assert.ok(raw.soak.includes(said[0]) && raw.aircon.includes(kept[0]), 'kept: one of the two marks');
});
