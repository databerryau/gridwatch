// The review of 2026-11-13, C4 and C5: the coach says only what is true.
// C4: a unit waiting out a minimum down time or a trip's lockout was left out of the look-ahead, so the line said
// "Every unit that can run is committed" at 11:01 and "Start CCGT 1 now" at 12:31 on the same day. It is now counted
// from when it may start (sim/onat.js startFromS), as a unit out for maintenance is: "Start CCGT 2 at 07:30, when it
// can start again".
// C5: "You will be 450 MW short from 13:20" was the planning check (the forecast plus MARGIN_MW, the water kept for the
// evening) said as fact, on a day the desk at its limits had no gap until 15:26. The figure now says what it is: "From
// 13:20 you will be 450 MW short of a safe margin".
// Pure calls on the DESK 20261007 state at 04:30 (tests/stagec-app.test.js's late-return shape): well under a second.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import {DESK} from '../content/scenarios.js';
import {clockText} from '../render/format.js';
import * as O from '../app/objective.js';
import * as SYS from '../app/system.js';
import * as PV from '../app/planview.js';

const START = V.PLAYER_START_S, at = s => clockText(s, false);
const secOf = (h, m = 0) => (h - V.DAY_START_H) * V.S_PER_H + m * 60;

// DESK 20261007 at 04:30, CCGT 2 back from its outage: the state each test pokes
function base() {
  const st = createState(20261007, DESK), sys = SYS.createSystem({commit: 'player'});
  while (st.tick < START * V.TICKS_PER_S) step(st, SYS.systemInputs(sys, st));
  const obs = observe(st, {dayAhead: true});
  obs.sec.previewNadirHz = 49.95; // (the GUARD ask aside)
  Object.assign(obs.units.find(u => u.id === 'ccgt2'), {outUntilS: -1, startBlock: ''});
  return obs;
}

// The line for a shortfall CCGT 2 reaches cheaply only from fromS: an hour 600 MW past the commit check from just after
// a start made at fromS reaches the grid, and 1,500 MW of room everywhere else.
function ask(obs, fromS) {
  const o = structuredClone(obs), cc = o.units.find(u => u.id === 'ccgt2');
  const G0 = O.tripGap(o, o.dayAhead, O.COMMIT_MARGIN_MW - O.MARGIN_MW), from = fromS + cc.startToMinS + 300;
  for (let j = 0; j < o.dayAhead.n; j++) { const t = o.dayAhead.fromS + (j + 1) * o.dayAhead.stepS; o.dayAhead.demandP50[j] += (t >= from && t < from + 3600 ? 600 : -1500) - G0.gap[j]; }
  return O.objective(o, {edited: false, planview: PV, dayAhead: o.dayAhead});
}

test('C4: a unit in its minimum down time is planned from its end ("when it can start again"), never left out of the look-ahead', () => {
  const obs = base(), m = V.MACHINES.find(x => x.id === 'ccgt2');
  // stopped at 04:30: its minimum down time (3 h) runs to 07:30, and the sim says so
  Object.assign(obs.units.find(u => u.id === 'ccgt2'), {startBlock: 'minimum down time: 180 min left', downForS: 0});
  assert.equal(m.minDownS, 3 * V.S_PER_H, 'the 3 h this test is shaped on');
  const x = ask(obs, secOf(7, 30));
  assert.deepEqual([x.kind, x.action, x.targets], ['commit', null, []], x.text);
  assert.match(x.text, /Start CCGT 2 at 07:30, when it can start again: it takes 49 min to reach the grid/);
  assert.ok(x.text.length <= O.LINE_MAX_CHARS, x.text.length + ': ' + x.text);
  // free now, the same shortfall asks for it by its deadline
  const free = base();
  assert.match(ask(free, secOf(7, 30)).text, /Start CCGT 2 by \d\d:\d\d: it takes 49 min/);
});

test('C4: a tripped unit is planned from the end of its lockout; one locked out past the day\'s end is not counted', () => {
  const obs = base(), cc = obs.units.find(u => u.id === 'ccgt2');
  Object.assign(cc, {mode: 'tripped', timerS: 2 * V.S_PER_H, startBlock: 'unit is tripped'});
  const back = obs.s + 2 * V.S_PER_H;
  const x = ask(obs, back);
  assert.deepEqual([x.kind, x.action], ['commit', null], x.text);
  assert.match(x.text, new RegExp('Start CCGT 2 at ' + at(back) + ', when it can start again: '));
  // out until the day ends: no ask names it
  const gone = base();
  Object.assign(gone.units.find(u => u.id === 'ccgt2'), {mode: 'tripped', timerS: V.DAY_S, startBlock: 'unit is tripped'});
  assert.doesNotMatch(ask(gone, back).text, /CCGT 2/);
});

test('C4: a unit out for maintenance still reads "when it is back"', () => {
  const obs = base();
  Object.assign(obs.units.find(u => u.id === 'ccgt2'), {outUntilS: secOf(7, 45), startBlock: 'on outage until 07:45'});
  assert.match(ask(obs, secOf(7, 45)).text, /Start CCGT 2 at 07:45, when it is back: /);
});

test('C5: a commit line\'s figure is said as short of a safe margin, never as plain "short"', () => {
  const obs = base();
  const x = ask(obs, secOf(7, 30));
  assert.match(x.text, /^From \d\d:\d\d you will be [\d,]+ MW short of a safe margin\. Start CCGT 2 by /, x.text);
  assert.doesNotMatch(x.text, /You will be/);
});
