// tests/rules.test.js: no invented rules (H-18, Q-102): no hot-unit trip on the desk days; the directed-shedding
// timers are tagged as GRIDWATCH's own rule; the GUARD ring has its own "?" row.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import * as grid from '../sim/grid.js';
import {commit, opening} from './lib/sim-helpers.js';
import {TEXT} from '../content/text.js';
import {ALARM_HELP} from '../content/alarmhelp.js';

// A unit held above its 96% gate for `hours` grid-hours, its seconds stepped as the sim steps them.
function runHot(hotTrips, hours) {
  const s = commit(opening(3), {coal1: 640, ccgt1: 300, hydro1: 200});
  s.scn.hotTrips = hotTrips;
  const out = [], c1 = s.units.find(u => u.id === 'coal1');
  for (let n = 0; n < hours * 3600; n++) {
    c1.outMW = c1.availMW;               // pinned at its rating: above the gate every second
    s.tick += V.TICKS_PER_S;
    grid.unitsSecond(s, out);
    if (c1.mode === 'tripped') break;
  }
  return {c1};
}

test('H-18: on the desk days no unit trips for running hot (the classic day keeps its overheat trips)', () => {
  const desk = runHot(false, 8);
  assert.ok(desk.c1.hotS > V.HOT_ARM_S, 'it was above the gate the whole time: ' + desk.c1.hotS + ' s');
  assert.notEqual(desk.c1.mode, 'tripped');
  const classic = runHot(true, 120);
  assert.equal(classic.c1.mode, 'tripped', 'classic still draws its 3.5%/h risk');
});

test('H-18: the UNDER FREQ explainer and the directed-shedding row tag the timers as GRIDWATCH\'s own rule', () => {
  assert.match(ALARM_HELP.underFreq.why, /GRIDWATCH's own rule: a stand-in for AEMO directing the networks/);
  const row = TEXT.abstractions.find(e => e.id === 'directed-shedding');
  assert.match(row.ours, /GRIDWATCH's own rule, not the frequency standard's: a stand-in for AEMO directing the networks/);
});

test('H-18: the GUARD ring has its own "?" row beside #ring-guard: contingency FCAS, set by hand', () => {
  const row = TEXT.abstractions.find(e => e.game === 'ring-guard');
  assert.ok(row, 'no "?" row beside #ring-guard');
  assert.equal(row.row, 'The GUARD is contingency FCAS, set by hand.');
  assert.match(row.ours, /Below 49\.75 Hz it delivers them within a second and holds them for 10 min/);
});
