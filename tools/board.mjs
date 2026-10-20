// GRIDWATCH: how long the annunciator is lit (W7 Q3, decisions/2026-10-16-open-questions.md §3). A
// statistics tool, not a test (CLAUDE.md): run it once when the alarm rules change, and report what
// it measured. Not loaded by the game. An ES module (.mjs: tools/package.json pins .js to CommonJS).
//
//   node tools/board.mjs                              # 2026-10-14, 2026-10-16, 2026-10-19: followed and do-nothing
//   node tools/board.mjs --dates 20261014,20261108    # other dailies
//   node tools/board.mjs --followed --episodes        # the followed days only, with each lit spell of a tile
//
// Per daily, two days: the hint-following player (tests/lib/follow.js followDay: only the inputs
// the line proposes, as tools/follow.mjs) and the day with no input at all (followDay, follow:
// false: the system dispatches, nobody commits a unit). Each runs app/alarms.js as the page does:
// sampleTick after every tick, updateAlarms once a grid second on alarmInputFromState, real time
// on the D-2 profile (sim/clock.js stepReal, 1x in the watch), and an operator who presses ACK
// 3 real s after anything new (as tests/alarms.test.js competentDay). From 04:30 to 21:00 (990
// grid minutes; the night roll is quiet, Q-73) it counts, in grid minutes:
//   lit       some tile's condition is in (the board an operator who ACKs at once would see)
//   shown     some tile is not 'normal' with the 3-s operator: lit, plus the ring-back of a tile that
//             cleared before its ACK (3 real s are 7-27 grid minutes at the D-2 profile's 150-540x)
//   tiles     each tile's minutes with its condition in
//   peak      lit inside D-2's Peak (16:30-20:00), and which tiles
//   sheds     minutes of TRIP SHEDS (desk/calc.js tripSheds: TIGHT, the sim's preview below 49.0 Hz; no display hold)
//   red       minutes the gauge's word is red: SHORT, SHEDDING or TRIP SHEDS
//   audible   soundings started (K-8: <= 8 a day)
// --episodes adds each spell a tile was in (from-to, and the N-1 word as it set) and the trips' times.

import {followDay} from '../tests/lib/follow.js';
import {getScenario} from '../content/scenarios.js';
import {dailyFor} from '../content/dailies.js';
import {V} from '../sim/params.js';
import {stepReal, PEAK, NIGHT_S} from '../sim/clock.js';
import * as A from '../app/alarms.js';
import {tripSheds} from '../desk/calc.js';

const TPS = V.TICKS_PER_S;
const args = process.argv.slice(2);
const at = args.indexOf('--dates');
const dates = at >= 0 ? args[at + 1].split(',').map(Number) : [20261014, 20261016, 20261019];
const modes = args.includes('--followed') ? [true] : [true, false], episodes = args.includes('--episodes');
const min = s => (s / 60).toFixed(0);
const hhmm = s => { const m = Math.floor(s / 60) + V.DAY_START_H * 60; return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const wordOf = sec => (tripSheds(sec) ? 'TRIP SHEDS' : sec.level);

function measure(ymd, follow) {
  const d = dailyFor(ymd), scn = getScenario(d.scenarioId);
  const a = A.createAlarms(), cond = {}, peakCond = {}, spells = [], open = {};
  let realMs = 0, lastS = -1, ackAt = Infinity, lit = 0, shown = 0, peakLit = 0, sheds = 0, red = 0;
  for (const t of A.TILES) { cond[t.id] = 0; peakCond[t.id] = 0; }
  const stationOf = id => id.replace(/\d+$/, '');
  const onStep = st => {
    A.sampleTick(a, st);
    if (st.tick % TPS !== 0 || st.tick < V.PLAYER_START_TICK) return;
    const x = A.alarmInputFromState(st);
    if (x.s >= NIGHT_S) return;
    const dtS = lastS < 0 ? 0 : x.inWatch ? x.s - lastS : stepReal(lastS, x.s);
    realMs += dtS * 1000;
    lastS = x.s;
    const r = A.updateAlarms(a, x, {nowMs: realMs, realDtS: dtS, stationOf});
    if (r.cues.length || r.newAlarm) ackAt = Math.min(ackAt, realMs + 3000);
    if (realMs >= ackAt) { A.ackAll(a); ackAt = Infinity; }
    const inPeak = x.s >= PEAK[0] && x.s < PEAK[1];
    if (A.TILES.some(t => a.tiles[t.id].cond)) { lit++; if (inPeak) peakLit++; }
    if (A.TILES.some(t => a.tiles[t.id].state !== 'normal')) shown++;
    for (const t of A.TILES) {
      const on = a.tiles[t.id].cond;
      if (on) { cond[t.id]++; if (inPeak) peakCond[t.id]++; }
      if (on && !open[t.id]) open[t.id] = {id: t.id, from: x.s, word: wordOf(st.sec)};
      else if (!on && open[t.id]) { spells.push(Object.assign(open[t.id], {to: x.s})); open[t.id] = null; }
    }
    if (tripSheds(st.sec)) sheds++;
    if (tripSheds(st.sec) || st.sec.level === 'SHORT' || st.sec.level === 'SHEDDING') red++;
  };
  const r = followDay(d.seed, scn, {follow, onStep});
  for (const k in open) if (open[k]) spells.push(Object.assign(open[k], {to: NIGHT_S}));
  const trips = r.st.conts.filter(c => c.startTick / TPS < NIGHT_S).map(c => hhmm(c.startTick / TPS) + ' ' + c.cause + ' ' + c.id);
  return {ymd, seed: d.seed, scenario: d.scenarioId, follow, black: r.st.black, lit, shown, peakLit, sheds, red, audible: a.audible, trips,
    spells: spells.sort((p, q) => p.from - q.from).map(p => p.id + ' ' + hhmm(p.from) + '-' + hhmm(p.to) + (p.id === 'n1' ? ' (' + p.word + ')' : '')),
    tiles: Object.entries(cond).filter(([, n]) => n > 0).map(([k, n]) => k + ' ' + min(n)).join(', '),
    peak: Object.entries(peakCond).filter(([, n]) => n > 0).map(([k, n]) => k + ' ' + min(n)).join(', ') || 'dark'};
}

console.log('board (grid minutes, 04:30-21:00 = 990; peak 16:30-20:00 = 210):');
for (const ymd of dates) {
  for (const follow of modes) {
    const t0 = Date.now(), m = measure(ymd, follow);
    console.log(ymd + ' ' + m.scenario + ' ' + (follow ? 'followed  ' : 'do-nothing') + (m.black ? ' BLACK' : '') + ': lit ' + min(m.lit) +
      ' min (shown ' + min(m.shown) + ', peak ' + min(m.peakLit) + '), TRIP SHEDS ' + min(m.sheds) + ' min, red ' + min(m.red) + ' min, audible ' +
      m.audible + ' | tiles: ' + (m.tiles || 'none') + ' | peak: ' + m.peak + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    if (episodes) console.log('  trips: ' + (m.trips.join(', ') || 'none') + '\n  spells: ' + (m.spells.join(', ') || 'none'));
  }
}
