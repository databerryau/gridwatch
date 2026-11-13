// The review of 2026-11-13, C2: a STOP that is only a saving (level plan) is a note, and never hides a later branch
// with something to do. On the daily of 12 Oct 2026 at 11:00 (par's day, every gas unit committed) with the battery
// idle while the city spills power at -$20, the line asked to STOP GT·C 2 for a $178,000 saving, and a player who kept
// the unit never saw the charge ask. A STOP asked as one (MSL, Q-133's midday) still acts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {observe} from '../sim/step.js';
import * as weather from '../sim/weather.js';
import * as AP from '../sim/autopilot.js';
import * as PV from '../app/planview.js';
import {objective} from '../app/objective.js';
import {SCENARIOS} from '../content/scenarios.js';
import {dailyFor} from '../content/dailies.js';

test('C2: an optional STOP note gives way to the battery\'s charge ask while power spills', () => {
  const d = dailyFor(20261012);
  const r = AP.runPar(d.seed, SCENARIOS[d.scenarioId], {proxy: 'commitAll', untilTick: 7 * 3600 * V.TICKS_PER_S, hashEveryS: V.DAY_S + 1});
  const obs = observe(r.state), day = weather.forecast(r.state, V.DAY_S - obs.s, V.FC_STEP_S);
  Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: Math.min(obs.battery.socMWh, 500)});
  const ask = o => objective(o, {planview: PV, dayAhead: structuredClone(day), leadS: 0, coach: true});
  const l = ask(structuredClone(obs));
  assert.equal(l.kind, 'battery', l.level + '/' + l.kind + ': ' + l.text);
  assert.deepEqual(l.action && l.action.mode, 'charge');
  // with the battery charging, the soak that is due comes next: still never the STOP note in its place
  const charging = structuredClone(obs);
  Object.assign(charging.battery, {mode: 'charge', orderMW: l.action.mw});
  const s = ask(charging);
  assert.deepEqual([s.kind, s.level], ['city', 'act'], s.level + '/' + s.kind + ': ' + s.text);
});
