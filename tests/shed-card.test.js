// D-26 (Q-95): after shedding, the dark districts hold the clock as the morning's feeders do, one card a relay
// stage (and one for the city desk's sheds), at the first second each may be closed and would be accepted.
//   1. The director, on a fake state: the order (the earliest allowed second, then stage 1 before stage 2 before
//      the city desk), a refused stage never holds up the next, LEAVE answers the whole group, none from 21:00.
//   2. On the page (DESK 20261007, midday, a stage shed by hand): the card names the stage, its districts and
//      their pickup; Enter restores the first and queues the other, which closes itself with no second card.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {setDistrictDark} from '../sim/fleet.js';
import * as D from '../app/director.js';
import {V} from '../sim/params.js';
import {NIGHT_S} from '../sim/clock.js';

const TPS = V.TICKS_PER_S, S0 = 15 * 3600;   // 19:00
const district = (id, shedBy, uflsStage) => ({id, clearS: -1, dark: true, shedBy, uflsStage, restoredAtS: -1});
const fake = s => ({tick: s * TPS + 1, over: false, contIdx: -1, conts: [], scope: {unit: ''}, units: [], log: [],
  control: {handFlown: false, mode: 'AGC', nightShift: false}, scn: {night: true},
  city: {districts: [district('D1', 'directed', 0), district('B2', 'ufls', 2), district('A1', 'ufls', 1), district('A2', 'ufls', 1), {id: 'L', clearS: -1, dark: false, shedBy: null, uflsStage: 0, restoredAtS: s - 600}]}});

test('D-26, the director: stage 1 first, then stage 2, then the city desk; a refused stage holds up nothing; LEAVE answers its group; none from 21:00', () => {
  const st = fake(S0);
  let refuse = new Set();
  const d = D.createDirector({game: true, paused: false, accepts: (s, i) => !refuse.has(s.city.districts[i].id)});
  assert.deepEqual([D.modeOf(d, st).mode, D.feederCard(d, st)], ['FEEDER-CARD', 'A1'], 'stage 1, its first district');
  assert.deepEqual(D.queueMates(d, st.city.districts, 'A1').map(x => x.id), ['A2'], 'its RESTORE queues the rest of stage 1');
  assert.deepEqual(D.queueMates(d, st.city.districts, 'D1').map(x => x.id), [], 'the city desk\'s one shed: nothing behind it');
  refuse = new Set(['A1', 'A2']); d.pv = null;
  assert.equal(D.feederCard(d, st), 'B2', 'stage 1 refused: stage 2 holds');
  refuse = new Set(); d.pv = null;
  assert.ok(D.answerFeeder(d, st, 'A1', true), 'LEAVE STAGE 1 DARK');
  assert.deepEqual([d.fc.A1, d.fc.A2], [Infinity, Infinity], 'the whole stage is gone on from');
  assert.equal(D.feederCard(d, st), 'B2');
  D.answerFeeder(d, st, 'B2', false);
  assert.equal(D.feederCard(d, st), 'D1', 'the city desk\'s sheds last');
  D.answerFeeder(d, st, 'D1', false);
  assert.deepEqual([D.modeOf(d, st).mode, D.feederCard(d, st)], ['CRUISE', '']);
  const late = fake(NIGHT_S + 60), dn = D.createDirector({game: true, paused: false});
  assert.equal(D.feederCard(dn, late), '', 'none from 21:00');
});

test('D-26 on the page: "RESTORE stage 1: RED1 and SAL1"; Enter restores RED1 and SAL1 closes itself at its allowed second', () => {
  const p = openGame({seed: 20261007}), st = p.game.state;
  for (let i = 0; i < 6 && p.to('12:00', {stop: [], line: 'near'}).why.startsWith('held'); i++) p.key('Escape'); // (the morning's hand-backs: Esc restores)
  assert.equal(p.clock(), '12:00:00');
  for (const id of ['RED1', 'SAL1']) setDistrictDark(st, st.city.districts.findIndex(x => x.id === id), true, 'ufls');
  const r = p.until('card', {max: '+10m', line: 'near'});
  assert.equal(r.why, 'held:FEEDER-CARD', r.why + ' at ' + r.at);
  const look = p.look({controls: false}), q = st.tick / TPS;
  assert.match(look, /^FEEDER RESTORE stage 1: RED1 and SAL1, about \d+0 MW with their cold load\. RESTORE RED1 now; SAL1 at \d\d:\d\d \(it closes itself\)\. /m);
  p.key('Enter');
  const dk = id => st.city.districts.find(x => x.id === id).dark;
  assert.deepEqual([dk('RED1'), dk('SAL1')], [false, true], 'RED1 restored, SAL1 queued');
  const r2 = p.until('card', {max: '+10m', line: 'near'});
  assert.notEqual(r2.why, 'held:FEEDER-CARD', 'no second card: ' + r2.why + ' at ' + r2.at);
  const log = st.log.filter(x => x.type === 'restore' && x.tick >= q * TPS - 1).map(x => [x.args.district, Math.round(x.tick / TPS - q)]);
  assert.deepEqual(log.map(x => x[0]), ['RED1', 'SAL1']);
  assert.ok(log[1][1] >= V.RESTORE_INTERVAL_S && log[1][1] <= V.RESTORE_INTERVAL_S + 2, 'SAL1 closed itself ' + log[1][1] + ' grid s after the card');
});
