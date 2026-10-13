// The objective line on the game's day (slice 2c wave 3, desk/README.md §32.8.1 line): Q-80 (a
// heatwave is news from 04:00; the HOT-morning worst case retired), the line quiet in the night
// roll (Q-73), its reading spans as real seconds of the D-2 profile (Q-63, spanAt), Act I's
// constraints in the capacity asks (Q-68: the tie's limit until HH:MM, a unit out for maintenance
// planned from its return and never asked for before it), the restore task from the network's ETR
// (Q-68, Q-69: the pickup ahead, the feeders under repair named beside the count, spare()'s pickup
// at the return; folds in 2c wave 1's tests/objective-task.test.js), stopSaving's night horizon,
// and the 2b S1 aims re-checked at the profile's speeds. Observations at moments, a followed task
// morning (DESK seed 8 to its first hand-back) and one sampled stretch of the page (CLAUDE.md).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, observe, applyInput} from '../sim/step.js';
import {V} from '../sim/params.js';
import {realBetween, gridAfter, rateAt, NIGHT_S} from '../sim/clock.js';
import {aimFlex} from '../sim/autopilot.js';
import {DESK, DESK_WEEKEND} from '../content/scenarios.js';
import * as SYS from '../app/system.js';
import * as PV from '../app/planview.js';
import * as G from '../app/game.js';
import * as O from '../app/objective.js';
import {objective, capacityGap, consequence, spanAt} from '../app/objective.js';
import {clockText} from '../render/format.js';
import {followDay} from './lib/follow.js';
import {openGame} from './lib/play.js';

const TPS = V.TICKS_PER_S, H = V.S_PER_H;
const secOf = (h, m = 0) => (h - V.DAY_START_H) * H + m * 60;
const at = s => clockText(s, false);
const copy = x => structuredClone(x);
const lineOf = (obs, o = {}) => objective(obs, Object.assign({edited: false, planview: PV, dayAhead: obs.dayAhead}, o));
const colOf = (fc, t) => Math.round((t - fc.fromS) / fc.stepS) - 1;
/** A no-input player day on `scn` to grid second s (the system dispatches; nobody commits), observed with the day-ahead. */
function dayTo(seed, s, scn = DESK) {
  const st = createState(seed, scn), sys = SYS.createSystem({commit: 'player'});
  while (st.tick < s * TPS) step(st, SYS.systemInputs(sys, st));
  return {st, obs: observe(st, {dayAhead: true})};
}
const news = (obs, kind) => obs.news.find(n => n.kind === kind);

// ------------------------------------------------------------------ Q-80: heat is news from 04:00

test('Q-80: a heatwave is news from 04:00, so its derate is in the look-ahead from the first look; a HOT day without the news has none coming (heatWorstCase retired)', () => {
  assert.equal(O.heatWorstCase, undefined);
  // DESK 20261005: a heat date. The news is up at 04:00 and the look-ahead derates its window only
  const hot = observe(createState(20261005, DESK), {dayAhead: true}), heat = news(hot, 'heat');
  assert.ok(heat && heat.atS === 0, 'announced at 04:00');
  const told = capacityGap(hot, hot.dayAhead), untold = capacityGap(Object.assign(copy(hot), {news: hot.news.filter(n => n.kind !== 'heat')}), hot.dayAhead);
  let inside = 0;
  for (let k = 0; k < told.n; k++) {
    const t = told.fromS + (k + 1) * told.stepS, d = told.gap[k] - untold.gap[k];
    if (t > hot.s + told.stepS && t >= heat.fromS && t < heat.toS) { assert.ok(d > 100, 'the derate at ' + at(t) + ': ' + d.toFixed(0)); inside++; } else assert.ok(Math.abs(d) < 1e-9, at(t));
  }
  assert.ok(inside > 50, 'the whole window: ' + inside + ' columns');
  // DESK 20261002: HOT, no heatwave (calm). No heat news: nothing is added for one
  const warm = observe(createState(20261002, DESK), {dayAhead: true});
  assert.deepEqual([warm.day.temp, news(warm, 'heat')], ['HOT', undefined]);
  const a = capacityGap(warm, warm.dayAhead), b = capacityGap(Object.assign(copy(warm), {day: {temp: 'MILD', weekend: false}}), warm.dayAhead);
  assert.deepEqual(Array.from(a.gap), Array.from(b.gap), 'HOT or MILD, the same look-ahead');
});

// ------------------------------------------------------------------ Q-73: the night roll

test('Q-73: from the night shift the line is quiet (no ask, no urge: the night strip replaces it), in the pure line and on the page', () => {
  const st = createState(20261008, DESK);
  st.control.nightShift = true; // (the sim's flag from 21:00, sim/step.js; poked: the line reads obs.nightShift only)
  const x = lineOf(observe(st, {dayAhead: true}));
  assert.deepEqual([x.kind, x.level, x.text, x.action, x.targets], ['quiet', 'ok', '', null, []]);
  const game = G.createGame({seed: 20261008, scenario: DESK, system: SYS, planview: PV, commit: 'player', storage: null});
  G.takeDesk(game);
  const day = G.buildVm(game, {nowMs: 1});
  assert.ok(day.objective && day.objective.text, 'a line by day: ' + (day.objective && day.objective.text));
  game.state.control.nightShift = true; game.objectiveS = -1e9; game.lineMs = -1e9;
  const vm = G.buildVm(game, {nowMs: 2});
  assert.deepEqual([vm.objective.text, vm.objective.action], ['', null]);
  for (const g of day.objective.targets) assert.ok(!vm.glow.has(g), g + ' no longer lit');
});

// ------------------------------------------------------------------ Q-63: the spans

test('Q-63: NOW_S, ACT_WITHIN_S and the STEADY spans mean their real seconds at TUNED_RATE in every segment (spanAt), never less than the span, never past a night scenario\'s 21:00', () => {
  const real = g => g / O.TUNED_RATE;
  for (const g of [O.NOW_S, O.ACT_WITHIN_S, O.STEADY_S, O.STEADY_HOLD_S, O.STEADY_QUIET_S]) {
    for (const [h, m] of [[4, 40], [5, 30], [7, 0], [10, 0], [12, 0], [15, 0], [17, 30], [20, 10]]) {
      const s = secOf(h, m), span = spanAt(s, g, false);
      assert.ok(Math.abs(realBetween(s, s + span, false) - real(g)) < 1e-6, g + ' at ' + at(s) + ': ' + span.toFixed(1) + ' grid s');
      assert.ok(span >= g);
    }
  }
  // the profile at 540x (PRE-DAWN) and 150x (PEAK): five real seconds are 45 and 12.5 grid-min
  assert.equal(spanAt(secOf(5), O.ACT_WITHIN_S, false), 5 * 540);
  assert.equal(spanAt(secOf(18), O.ACT_WITHIN_S, false), 5 * 150);
  // HAND halves the profile: at its 120x (14:30-16:30) the spans are the tuned grid ones; at its 75x peak the floor holds
  assert.equal(spanAt(secOf(15), O.ACT_WITHIN_S, true), O.ACT_WITHIN_S);
  assert.equal(spanAt(secOf(18), O.ACT_WITHIN_S, true), O.ACT_WITHIN_S);
  // at 20:58 the NIGHT ROLL's 2,100x would make "now" hours long; a night scenario's ends at 21:00 (the floor then)
  const late = secOf(20, 58);
  assert.ok(gridAfter(late, real(O.ACT_WITHIN_S), false) - late > 2 * H);
  assert.equal(spanAt(late, O.ACT_WITHIN_S, false, NIGHT_S), O.ACT_WITHIN_S);
  const ten = secOf(20, 50);
  assert.ok(spanAt(ten, O.NOW_S, false) > NIGHT_S - ten);
  assert.equal(spanAt(ten, O.NOW_S, false, NIGHT_S), NIGHT_S - ten);
});

// ------------------------------------------------------------------ Q-68: Act I's constraints

test('Q-68, the tie derate: the look-ahead holds the limit until its end, then the full tie; a capacity ask says "the tie limited to N MW until HH:MM"', () => {
  const {obs} = dayTo(20261002, secOf(4, 30));
  const tie = obs.tie;
  assert.ok(tie.importLimitMW < V.TIE_MAX_MW && tie.limitUntilS > obs.s, 'a derate in force: ' + tie.importLimitMW + ' MW until ' + at(tie.limitUntilS));
  const free = Object.assign(copy(obs), {tie: Object.assign({}, tie, {importLimitMW: V.TIE_MAX_MW, limitUntilS: -1})});
  const lim = capacityGap(obs, obs.dayAhead), full = capacityGap(free, obs.dayAhead), firm = V.STATIONS.coal.ratingMW;
  for (let k = 1; k < lim.n; k++) {
    const t = lim.fromS + (k + 1) * lim.stepS;
    assert.ok(Math.abs(lim.gap[k] - full.gap[k] - (t < tie.limitUntilS ? firm - tie.importLimitMW : 0)) < 1e-6, at(t));
  }
  const x = lineOf(obs);
  assert.equal(x.kind, 'commit');
  assert.ok(x.text.includes(' (the tie limited to ' + tie.importLimitMW + ' MW until ' + at(tie.limitUntilS) + ')'), x.text);
  assert.ok(x.text.length <= O.LINE_MAX_CHARS);
});

test('Q-68, the late return: a unit out for maintenance is planned from its return and never asked for before it; a booked start waits for it; the asks name the outage', () => {
  // DESK 20261007: CCGT 2 out until 07:45 (Act I), the cheaper unit for the morning
  const obs = dayTo(20261007, secOf(4, 30)).obs;
  obs.sec.previewNadirHz = 49.95; // (the GUARD ask aside: the morning's commit line is the subject)
  const cc = obs.units.find(u => u.id === 'ccgt2'), back = cc.outUntilS;
  assert.ok(cc.mode === 'off' && back > obs.s && /^on outage until/.test(cc.startBlock), cc.startBlock);
  // the morning's ask: a dearer unit now, and why not CCGT 2
  const x = lineOf(obs);
  assert.equal(x.kind, 'commit');
  assert.ok(x.text.includes(' (CCGT 2 out until ' + at(back) + ')'), x.text);
  assert.ok(!(x.action && x.action.unit === 'ccgt2') && !x.targets.includes('guard-start-ccgt2'), x.text);
  // its START press says why it is refused, in the briefing's words
  assert.equal(consequence(obs, 'guard-start-ccgt2', {dayAhead: obs.dayAhead, planview: PV}).text, 'START CCGT 2 is blocked: out for maintenance until ' + at(back) + '.');
  // a start booked now is due at the return (sim/grid.js startDueS): CCGT 2 counts from back + 49 min, not from now + 49 min
  const booked = copy(obs), outless = copy(obs);
  booked.plan.starts.push({unit: 'ccgt2', atS: obs.s});
  outless.plan.starts.push({unit: 'ccgt2', atS: obs.s});
  outless.units.find(u => u.id === 'ccgt2').outUntilS = -1;
  const Gb = capacityGap(booked, obs.dayAhead), Go = capacityGap(outless, obs.dayAhead), k = colOf(obs.dayAhead, back);
  assert.ok(Gb.gap[k] - Go.gap[k] >= cc.minMW, 'not there before its return: ' + (Gb.gap[k] - Go.gap[k]).toFixed(0) + ' MW');
  // a shortfall only CCGT 2's return reaches cheaply: the line plans it for 07:45 and asks nothing before then
  const G0 = O.tripGap(obs, obs.dayAhead, O.COMMIT_MARGIN_MW - O.MARGIN_MW), from = back + cc.startToMinS + 300;
  const short = copy(obs);
  for (const fc of [short.dayAhead]) for (let j = 0; j < fc.n; j++) { const t = fc.fromS + (j + 1) * fc.stepS; fc.demandP50[j] += (t >= from && t < from + H ? 600 : -1500) - G0.gap[j]; }
  const y = lineOf(short);
  assert.deepEqual([y.kind, y.level, y.action, y.targets], ['commit', 'plan', null, []], y.text);
  assert.match(y.text, new RegExp('Start CCGT 2 at ' + at(back) + ', when it is back: it takes 49 min to reach the grid( and [^.]*)?\\.$'));
  // with a reading lead that reaches the deadline the line still asks nothing before the return
  assert.equal(lineOf(short, {leadS: 6 * H}).action, null);
});

// ------------------------------------------------------------------ Q-68, Q-69: the restore task from the ETR

test('Q-69: before a hand-back the line plans the pickup, from its return; at it, the RESTORE ask; the feeders under repair are named beside the count; spare() counts a held feeder at its return (folds in tests/objective-task.test.js)', () => {
  const task = createState(8, DESK).city.districts.filter(d => d.shedBy === 'task').sort((a, b) => a.clearS - b.clearS);
  assert.equal(task.length, 2, 'DESK seed 8 is a restore-task date');
  const [first, second] = task;
  const seen = {};
  const {st} = followDay(8, DESK, {untilH: V.DAY_START_H + first.clearS / H,
    onMinute: (s, obs) => { for (const [k, ds] of [['far', O.PICKUP_AHEAD_S + 1800], ['near', 1800]]) if (obs.s === first.clearS - ds) seen[k] = obs; }});
  const HELD = /^feeder under repair until \d\d:\d\d$/;
  // an hour and a half before: both dark and held, and the morning's own line (no word of the feeders yet)
  assert.deepEqual(seen.far.districts.filter(d => d.dark).map(d => d.id).sort(), [first.id, second.id].sort());
  const f = lineOf(seen.far);
  assert.notEqual(f.kind, 'restore', f.text);
  assert.doesNotMatch(f.text, /district|feeder/);
  // half an hour before: what to hold for the first one's pickup, never an ask (no lamp lights before its clearS)
  for (const d of seen.near.districts.filter(x => x.dark)) assert.match(d.restoreBlock, HELD);
  const n = lineOf(seen.near);
  assert.deepEqual([n.kind, n.level, n.action, n.targets, n.startBy], ['restore', 'plan', null, ['bay-restore', 'gauge-n1'], first.clearS], n.text);
  const fig = /^(\w+)'s feeder is back at (\d\d:\d\d): hold ([\d,]+) MW of spare for its pickup\.$/.exec(n.text);
  assert.ok(fig && fig[1] === first.id && fig[2] === at(first.clearS), n.text);
  const cold = seen.near.districts.find(d => d.id === first.id).coldLoadMW;
  assert.ok(Number(fig[3].replace(',', '')) >= cold * 0.9 && Number(fig[3].replace(',', '')) <= cold * 1.5, fig[3] + ' MW against a cold load of ' + cold.toFixed(0) + ' MW now');
  // a UFLS district beside them is the desk's: the line closes it, counting all three and naming the two under repair
  const ufls = copy(seen.near), poked = Object.assign(ufls.districts.find(d => !d.dark && d.uflsStage > 0), {dark: true, shedBy: 'ufls', restoreBlock: ''});
  const u = lineOf(ufls);
  assert.deepEqual([u.kind, u.level, u.action], ['restore', 'act', {type: 'restore', district: poked.id}]);
  assert.equal(u.text, '3 districts are dark (' + first.id + ', ' + second.id + ' under repair until ' + at(first.clearS) + ', ' + at(second.clearS) +
    ') and the permissive lamp is lit. Close a feeder: R, then Enter.');
  // spare(): the pickup of a feeder under repair counts once its return is within the act window, not before
  // (with the game's reading lead, LINE_REACT_S of the profile: the line asks for a fast machine in time for the hand-back)
  const thin = o => Object.assign(o.sec, {level: 'TIGHT', r5MW: 100, lMW: 50, previewNadirHz: 49.95, lKind: 'unit'}), lead = {leadS: G.readingLeadS(seen.near.s, false, true)};
  const soon = copy(seen.near);
  thin(soon);
  const p = lineOf(soon, lead);
  assert.deepEqual([p.kind, p.level, p.action && p.action.type], ['spare', 'act', 'start'], p.text);
  assert.match(p.text, new RegExp('^' + first.id + '\'s feeder is back at ' + at(first.clearS) + ' and picks up [\\d,]+ MW, more than the spare you have\\. Start '));
  const later = copy(soon);
  for (const d of later.districts) if (d.clearS > later.s) { d.clearS += 6 * H; d.restoreBlock = 'feeder under repair until ' + at(d.clearS); }
  assert.notEqual(lineOf(later, lead).kind, 'spare', 'six hours before its return: nothing to hold yet');
  // at the first clearS: handed back (its lamp lit), the second still held; the ask is the RESTORE one
  const obs = observe(st, {dayAhead: true});
  assert.equal(obs.s, first.clearS);
  const backed = obs.districts.find(d => d.id === first.id), still = obs.districts.find(d => d.id === second.id);
  assert.deepEqual([backed.dark, backed.restoreBlock, still.dark], [true, '', true]);
  assert.match(still.restoreBlock, HELD);
  const y = lineOf(obs);
  assert.deepEqual([y.kind, y.level, y.action], ['restore', 'act', {type: 'restore', district: first.id}]);
  assert.equal(y.text, '2 districts are dark (' + second.id + ' under repair until ' + at(second.clearS) + ') and the permissive lamp is lit. Close a feeder: R, then Enter.');
  // handed back but its lamp not yet lit: a plan line for it, the held one named, never the reason
  const wait = copy(obs);
  wait.districts.find(d => d.id === first.id).restoreBlock = 'frequency below 49.9 Hz';
  const w = lineOf(wait);
  assert.deepEqual([w.kind, w.level, w.action], ['restore', 'plan', null]);
  assert.match(w.text, new RegExp('^2 districts are dark \\(' + second.id + ' under repair until \\d\\d:\\d\\d\\)\\. A feeder closes once '));
});

// ------------------------------------------------------------------ Q-73: what a STOP saves on a night scenario

test('Q-73: on a night scenario a STOP saves until the night shift would stop the unit (21:00, or 90 min on), and a restart from then is not the player\'s', () => {
  const {obs} = dayTo(20261008, secOf(4, 30));
  const u = obs.units.find(x => x.id === 'ccgt1');
  assert.equal(u.mode, 'on');
  const legacy = Object.assign(copy(obs), {scenarioId: 'desk-legacy'}); // (no night: the saving runs to 04:00)
  assert.equal(O.stopHorizonS(obs, u), Math.max(NIGHT_S, obs.s - u.upForS + V.PAR_DECOMMIT_MIN_ON_MIN * 60));
  assert.equal(O.stopHorizonS(legacy, u), V.DAY_S);
  // a unit started at 20:00 runs 90 min before the night shift may stop it
  assert.equal(O.stopHorizonS(Object.assign(copy(obs), {s: secOf(20, 30)}), Object.assign({}, u, {upForS: 1800})), secOf(21, 30));
  const proj = PV.project(obs), fc = obs.dayAhead, save = (o, back, f = fc) => O.stopSaving(o, u, back, f, proj, PV);
  // (fc cut after the column at or before t: the columns a saving to t counts)
  const cut = t => Object.assign({}, fc, {n: colOf(fc, Math.floor((t - fc.fromS) / fc.stepS) * fc.stepS + fc.fromS) + 1});
  const night = save(obs, Infinity), allDay = save(legacy, Infinity);
  assert.notEqual(night, allDay);
  // the night scenario's saving is the legacy day's over the columns to 21:00
  assert.ok(Math.abs(save(legacy, Infinity, cut(NIGHT_S)) - night) < 1e-6, night.toFixed(0) + ' vs ' + save(legacy, Infinity, cut(NIGHT_S)).toFixed(0));
  // a restart after 21:00: the night shift's, so no start to pay and the same hours; the legacy day pays its start
  const late = NIGHT_S + 1800, m = V.MACHINES.find(x => x.id === 'ccgt1'), onS = late + m.t1S + V.AUTO_SYNC_S + m.t2S / 2;
  assert.equal(save(obs, late), night);
  assert.ok(Math.abs(save(legacy, late) - (save(legacy, Infinity, cut(onS)) - m.startCost)) < 1e-6);
});

// ------------------------------------------------------------------ 2b S1 at the profile's speeds

test('2b S1 at 540x: at the line\'s look cadence there (0.4 real s, 216 grid s) aimFlex\'s raw aim flips between two marks as the forecast slides; the aim the line shows (stick, ctx.held) never does', () => {
  // DESK_WEEKEND 20261003 after its two hand-backs, with noon's spill poked into the projection so the soak line speaks
  const st = createState(20261003, DESK_WEEKEND), sys = SYS.createSystem({commit: 'player'});
  const run = s => { while (st.tick < s * TPS) step(st, SYS.systemInputs(sys, st)); };
  run(V.PLAYER_START_S);
  assert.equal(applyInput(st, {type: 'guard', mw: V.PAR_GUARD_MAX_MW}, []).ok, true);
  for (const d of st.city.districts.filter(x => x.shedBy === 'task').sort((a, b) => a.clearS - b.clearS)) {
    run(d.clearS + 60);
    assert.equal(applyInput(st, {type: 'restore', district: d.id}, []).ok, true, d.id);
  }
  const every = rateAt(V.PLAYER_START_S, false) * V.OBJ_EVERY_REAL_S, raw = [], shown = [];
  assert.equal(every, 216);
  let held = null;
  for (let s = Math.ceil(st.tick / TPS), end = s + H; s <= end; s += every) {
    run(s);
    const obs = observe(st, {dayAhead: true}), P = PV.project(obs);
    for (let k = 0; k < P.n; k++) { P.surplusMW[k] = P.times[k] >= V.SOAK_FROM_S && P.times[k] <= V.SOAK_TO_S ? 2000 : 0; P.charging[k] = 0; }
    const x = lineOf(obs, {proj: P, held});
    assert.equal(x.kind, 'city', at(s) + ': ' + x.text);
    raw.push(aimFlex(obs.dayAhead, obs.levers, x.action.suburb, 'soak'));
    shown.push(x.action.atS);
    held = x;
  }
  const flips = a => a.filter((x, i) => i && x !== a[i - 1]).length;
  assert.ok(flips(raw) >= 4, 'the raw aim flips ' + flips(raw) + ' times in ' + raw.length + ' looks: ' + raw.map(at).join(' '));
  assert.equal(flips(shown), 0, shown.map(at).join(' '));
});

test('2b S1 at speed: on the page at FAST over the morning ramp (3 x 270x, faster than 540x), each city aim the line shows stands its dwell and none flickers back', () => {
  // DESK_WEEKEND 20261004: a soak for noon's spill is the line from about 06:30 once the GUARD and a fast machine are in
  const p = openGame({seed: 20261004});
  p.to('06:00', {stop: ['card'], line: 'near'});
  assert.equal(p.send({type: 'guard', mw: V.PAR_GUARD_MAX_MW}), '');
  assert.equal(p.send({type: 'start', unit: 'hydro3'}), '');
  p.to('06:25', {stop: ['card']});
  const g = p.game, shown = [];
  const aim = () => { const o = g.objective; return o && o.kind === 'city' ? o.action.suburb + '@' + o.action.atS : o ? o.kind : '-'; };
  for (let i = 0; i < 20; i++) {
    p.h.actions.ui({do: 'fast', on: true}); // (F held: pressed again whenever an ask ended it)
    shown.push({a: aim(), ms: p.now});
    const r = p.until(({game}) => aim() !== shown.at(-1).a || game.state.tick < 0, {max: '08:30', vm: true});
    if (r.why === 'target' || r.why === 'over' || r.why.startsWith('held')) break;
  }
  shown.push({a: aim(), ms: p.now});
  const city = shown.filter(x => x.a.includes('@'));
  assert.ok(city.length >= 1, 'a city line shows: ' + shown.map(x => x.a).join(' '));
  for (let i = 0; i + 1 < shown.length; i++) {
    if (!shown[i].a.includes('@')) continue;
    assert.ok(shown[i + 1].ms - shown[i].ms >= G.LINE_DWELL_MS - 1, shown[i].a + ' stood ' + (shown[i + 1].ms - shown[i].ms) + ' ms');
    assert.ok(!shown.slice(i + 2).some(x => x.a === shown[i].a && shown[i + 1].a.includes('@')), shown[i].a + ' came back');
  }
});
