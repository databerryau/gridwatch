// Q-69 on the objective line (desk/README.md §32.1): a task feeder before its clearS is the
// network's outage (under repair, as the permissive says), so the line's restore branch neither
// counts it nor says a feeder closes "once frequency is steady and there is spare reserve"; from
// its clearS it is the desk's to close. One followed task morning (DESK seed 8 to its first
// hand-back), no whole day (CLAUDE.md). The restore-task asks themselves are wave 3's (§32.3 line).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, observe} from '../sim/step.js';
import {V} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import * as PV from '../app/planview.js';
import {objective} from '../app/objective.js';
import {followDay} from './lib/follow.js';

const lineOf = obs => objective(obs, {edited: false, planview: PV, dayAhead: obs.dayAhead});
const HELD = /^feeder under repair until \d\d:\d\d$/;

test('Q-69: a held task feeder is not the line\'s to close (the morning\'s own line shows); from its clearS it is, and only the handed-back feeders count', () => {
  const task = createState(8, DESK).city.districts.filter(d => d.shedBy === 'task').sort((a, b) => a.clearS - b.clearS);
  assert.equal(task.length, 2, 'DESK seed 8 is a restore-task date');
  const [first, second] = task;
  assert.ok(second.clearS > first.clearS);
  let before = null;
  const {st} = followDay(8, DESK, {untilH: V.DAY_START_H + first.clearS / V.S_PER_H,
    onMinute: (s, obs) => { if (obs.s === first.clearS - 1800) before = obs; }});
  // half an hour before the first hand-back: both feeders dark and held
  const held = before.districts.filter(d => d.dark);
  assert.deepEqual(held.map(d => d.id).sort(), [first.id, second.id].sort());
  for (const d of held) assert.match(d.restoreBlock, HELD);
  const x = lineOf(before);
  assert.notEqual(x.kind, 'restore', x.text);
  assert.doesNotMatch(x.text, /district|feeder closes/);
  // a UFLS district beside them is the desk's: counted alone, and closed first
  const ufls = structuredClone(before);
  Object.assign(ufls.districts.find(d => !d.dark && d.uflsStage > 0), {dark: true, shedBy: 'ufls', restoreBlock: ''});
  const u = lineOf(ufls);
  assert.deepEqual([u.kind, u.level], ['restore', 'act']);
  assert.match(u.text, /^1 district is dark and the permissive lamp is lit\./);
  // at the first clearS: that feeder is handed back (its lamp lit), the second still held
  const obs = observe(st, {dayAhead: true});
  assert.equal(obs.s, first.clearS);
  const back = obs.districts.find(d => d.id === first.id), still = obs.districts.find(d => d.id === second.id);
  assert.deepEqual([back.dark, back.restoreBlock, still.dark], [true, '', true]);
  assert.match(still.restoreBlock, HELD);
  const y = lineOf(obs);
  assert.deepEqual([y.kind, y.level, y.action], ['restore', 'act', {type: 'restore', district: first.id}]);
  assert.equal(y.text, '1 district is dark and the permissive lamp is lit. Close a feeder: R, then Enter.');
  // handed back but its lamp not yet lit: the plan line counts it, never the held one
  const wait = structuredClone(obs);
  wait.districts.find(d => d.id === first.id).restoreBlock = 'frequency below 49.9 Hz';
  const w = lineOf(wait);
  assert.deepEqual([w.kind, w.level, w.action], ['restore', 'plan', null]);
  assert.match(w.text, /^1 district is dark\. A feeder closes once /);
});
