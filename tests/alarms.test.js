// K-8 / K-21: the annunciator model (app/alarms.js) and K-9: the message tray model
// (app/tray.js). The competent proxy's day triggers <= 8 audible alarms (one seed here, more
// with GRIDWATCH_SLOW=1).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {CLASSIC} from '../content/scenarios.js';
import * as A from '../app/alarms.js';
import * as T from '../app/tray.js';
import {SLOW} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;

/** desk/README.md §5's control ids. */
function contractIds() {
  const md = readFileSync(new URL('../desk/README.md', import.meta.url), 'utf8');
  const at = md.indexOf('Control and target ids');
  const block = md.slice(at, md.indexOf('\n\n', at)).replace(/`/g, ' ');
  return new Set(block.split(/\s+/).filter(x => /^[a-z][a-z0-9-]*$/.test(x)));
}

// A quiet snapshot; tests override fields.
const snap = over => Object.assign({s: 10000, h: 10, fHz: 50, rocof: 0, level: 'SECURE', agcAtLimitS: 0, hydroFrac: 0.8, battFrac: 0.5,
  inWatch: false, contCount: 0, cont: null, newsCount: 0, news: null}, over);
const tile = (a, id) => A.alarmsView(a).tiles.find(t => t.id === id);

test('K-21: every tile has exactly one priority and a target control id; 12 tiles (4 x 3), each with a glyph per state', () => {
  const ids = contractIds();
  assert.equal(A.TILES.length, 12);
  const seen = new Set();
  for (const t of A.TILES) {
    assert.ok(['P1', 'P2', 'P3'].includes(t.prio), t.id + ' ' + t.prio);
    assert.ok(ids.has(t.target), t.id + ' targets #' + t.target + ', not a §5 id');
    assert.ok(!seen.has(t.id));
    seen.add(t.id);
  }
  for (const label of ['UNDER FREQ', 'OVER FREQ', 'N-1 INSECURE', 'HIGH RoCoF', 'UNIT TRIP', 'LINK TRIP', 'UFLS OPERATED', 'AGC LIMIT',
    'STORAGE LOW', 'MIN GEN', 'WEATHER', 'PEAK']) assert.ok(A.TILES.some(t => t.label === label), label);
  // K-21 P1: UFLS, unit trip, frequency out of band, N-1 insecure at the peak.
  for (const id of ['ufls', 'unitTrip', 'underFreq', 'overFreq', 'peak']) assert.equal(A.TILES.find(t => t.id === id).prio, 'P1', id);
  const glyphs = new Set(Object.values(A.GLYPH));
  assert.equal(glyphs.size, 4, 'status is never colour-only (K-22)');
  const v = A.alarmsView(A.createAlarms());
  for (const t of v.tiles) assert.ok(t.glyph && t.target && t.label && t.prio);
});

test('K-8: UNDER FREQ sets below 49.85 Hz and clears above 49.90 Hz (hysteresis); extremes inside a frame count', () => {
  const a = A.createAlarms();
  const up = (f, ms = 0) => A.updateAlarms(a, snap({fHz: f}), {nowMs: ms, realDtS: 0.016});
  up(49.86);
  assert.equal(tile(a, 'underFreq').state, 'normal');
  const r = up(49.84, 1000);
  assert.equal(tile(a, 'underFreq').state, 'alarm');
  assert.equal(tile(a, 'underFreq').flash, 'fast');
  assert.deepEqual(r.cues, ['horn'], 'P1 horn');
  assert.equal(r.newAlarm, true);
  up(49.88, 2000);
  assert.equal(tile(a, 'underFreq').state, 'alarm', 'still set between 49.85 and 49.90');
  up(49.91, 3000);
  assert.equal(tile(a, 'underFreq').state, 'cleared', 'cleared before ACK: slow flash');
  assert.equal(tile(a, 'underFreq').flash, 'slow');
  A.ackAll(a);
  assert.equal(tile(a, 'underFreq').state, 'normal');
  // A dip inside a frame (between two updates) still sets it: sampleTick sees every tick.
  const s = createState(1, CLASSIC);
  s.phys.fHz = 49.80; A.sampleTick(a, s);
  s.phys.fHz = 49.99;
  A.updateAlarms(a, A.alarmInputFromState(s), {nowMs: 60000, realDtS: 0.016});
  assert.equal(tile(a, 'underFreq').state, 'alarm');
  // OVER FREQ: > 50.15 sets, < 50.10 clears.
  const b = A.createAlarms();
  A.updateAlarms(b, snap({fHz: 50.16}), {nowMs: 0});
  assert.equal(tile(b, 'overFreq').state, 'alarm');
  A.ackAll(b);
  assert.equal(tile(b, 'overFreq').state, 'ackd', 'ACK turns the flash steady');
  assert.equal(tile(b, 'overFreq').flash, null);
  A.updateAlarms(b, snap({fHz: 50.12}), {nowMs: 100});
  assert.equal(tile(b, 'overFreq').state, 'ackd');
  A.updateAlarms(b, snap({fHz: 50.09}), {nowMs: 200});
  assert.equal(tile(b, 'overFreq').state, 'normal', 'an acknowledged alarm that clears goes dark');
});

test('K-8: SILENCE stops the sound only; the horn repeats every 4 s until then; no tile sounds twice within 30 s', () => {
  const a = A.createAlarms();
  let r = A.updateAlarms(a, snap({fHz: 49.8}), {nowMs: 0});
  assert.deepEqual(r.cues, ['horn']);
  assert.equal(A.alarmsView(a).sounding, true);
  r = A.updateAlarms(a, snap({fHz: 49.8, s: 10001}), {nowMs: 2000});
  assert.deepEqual(r.cues, [], 'not yet');
  r = A.updateAlarms(a, snap({fHz: 49.8, s: 10002}), {nowMs: 4100});
  assert.deepEqual(r.cues, ['horn'], 'repeat after 4 real s');
  assert.equal(a.audible, 1, 'a repeat is not a new audible alarm');
  A.silence(a);
  assert.equal(A.alarmsView(a).sounding, false);
  assert.equal(tile(a, 'underFreq').state, 'alarm', 'SILENCE leaves the tile flashing');
  r = A.updateAlarms(a, snap({fHz: 49.8, s: 10003}), {nowMs: 9000});
  assert.deepEqual(r.cues, [], 'silenced');
  // Clear, ACK, set again within 30 real s: flashes but does not sound.
  A.updateAlarms(a, snap({fHz: 49.95, s: 10004}), {nowMs: 10000});
  A.ackAll(a);
  r = A.updateAlarms(a, snap({fHz: 49.8, s: 10005}), {nowMs: 20000});
  assert.equal(tile(a, 'underFreq').state, 'alarm');
  assert.deepEqual(r.cues, [], 'no re-sound within 30 s');
  A.updateAlarms(a, snap({fHz: 49.95, s: 10006}), {nowMs: 21000});
  A.ackAll(a);
  r = A.updateAlarms(a, snap({fHz: 49.8, s: 10007}), {nowMs: 40000});
  assert.deepEqual(r.cues, ['horn'], 'sounds again after 30 s');
  // ACK one tile.
  assert.equal(A.ackTile(a, 'underFreq'), true);
  assert.equal(tile(a, 'underFreq').state, 'ackd');
  assert.equal(A.ackTile(a, 'nope'), false);
});

test('K-21: during the watch sounds are held; still unacknowledged, they sound once after it; P3 is silent; P2 chimes once', () => {
  const a = A.createAlarms();
  const cont = {n: 0, cause: 'unit', id: 'coal2', uflsStages: 0, watchEndS: 10030};
  let r = A.updateAlarms(a, snap({inWatch: true, contCount: 1, cont, fHz: 49.6, rocof: 1.3}), {nowMs: 0, stationOf: () => 'coal'});
  assert.deepEqual(r.cues, [], 'held in the watch');
  assert.equal(r.newAlarm, true);
  assert.equal(tile(a, 'unitTrip').state, 'alarm');
  assert.equal(tile(a, 'unitTrip').target, 'lever-coal', 'the trip tile points at the tripped unit\'s lever');
  r = A.updateAlarms(a, snap({s: 10031, inWatch: false, contCount: 1, cont, fHz: 49.8}), {nowMs: 29000});
  assert.deepEqual(r.cues, ['horn'], 'one sound after the watch');
  assert.equal(a.audible, 1);
  assert.deepEqual(a.sounds[0].tiles.sort(), ['rocof', 'underFreq', 'unitTrip'].sort());
  // Acknowledged during the watch: silent afterwards.
  const b = A.createAlarms();
  A.updateAlarms(b, snap({inWatch: true, contCount: 1, cont, fHz: 49.6}), {nowMs: 0});
  A.ackAll(b);
  r = A.updateAlarms(b, snap({s: 10031, inWatch: false, contCount: 1, cont, fHz: 49.8}), {nowMs: 29000});
  assert.deepEqual(r.cues, []);
  assert.equal(b.audible, 0);
  // WEATHER (P3) sets silently; STORAGE LOW (P2) chimes once and does not keep sounding.
  const c = A.createAlarms();
  r = A.updateAlarms(c, snap({newsCount: 1, news: {atS: 9000, fromS: 12000, toS: null, kind: 'storm'}}), {nowMs: 0});
  assert.equal(tile(c, 'weather').state, 'alarm');
  assert.deepEqual(r.cues, []);
  r = A.updateAlarms(c, snap({s: 10001, hydroFrac: 0.29}), {nowMs: 1000});
  assert.deepEqual(r.cues, ['chime']);
  assert.equal(A.alarmsView(c).sounding, false, 'a chime is one sound');
  assert.equal(tile(c, 'storageLow').target, 'wheel-hydro');
});

test('K-8: N-1 INSECURE after 10 grid-s not SECURE; it clears after a 30-min secure window; AGC LIMIT after 5 real s; PEAK', () => {
  const a = A.createAlarms();
  let s = 20000;
  const up = (level, h = 10, agc = 0, dt = 0.016) => A.updateAlarms(a, snap({s: s++, h, level, agcAtLimitS: agc}), {nowMs: s * 10, realDtS: dt});
  up('SECURE');
  for (let i = 0; i < A.N1_SET_S; i++) up('TIGHT');
  assert.equal(tile(a, 'n1').state, 'normal');
  up('TIGHT');
  assert.equal(tile(a, 'n1').state, 'alarm');
  A.ackAll(a);
  for (let i = 0; i < A.N1_CLEAR_S - 1; i++) { up('SECURE'); if (i === 100) up('TIGHT'); }
  assert.equal(tile(a, 'n1').state, 'ackd', 'a brief TIGHT restarts the secure window');
  for (let i = 0; i < 200; i++) up('SECURE');
  assert.equal(tile(a, 'n1').state, 'normal');
  // AGC LIMIT: real seconds, not grid seconds.
  for (let i = 0; i < 300; i++) up('SECURE', 10, i + 1, 0.016);
  assert.equal(tile(a, 'agcLimit').state, 'normal', '300 grid-s at 120x is 4.8 real s');
  for (let i = 0; i < 20; i++) up('SECURE', 10, 400 + i, 0.016);
  assert.equal(tile(a, 'agcLimit').state, 'alarm');
  // PEAK: 17:00-20:00 and not SECURE.
  const b = A.createAlarms();
  for (let i = 0; i < 12; i++) A.updateAlarms(b, snap({s: 50000 + i, h: 16.5, level: 'TIGHT'}), {nowMs: i});
  assert.equal(tile(b, 'peak').state, 'normal');
  A.updateAlarms(b, snap({s: 50020, h: 17.1, level: 'TIGHT'}), {nowMs: 100});
  assert.equal(tile(b, 'peak').state, 'alarm');
  assert.equal(tile(b, 'peak').prio, 'P1');
});

test('the alarm snapshot from observe() equals the one read straight from state', () => {
  const s = createState(4, CLASSIC);
  for (let i = 0; i < 3 * 60 * TPS + 17; i++) step(s);
  const a = A.alarmInput(observe(s)), b = A.alarmInputFromState(s);
  for (const k of Object.keys(a)) {
    if (typeof a[k] === 'number') assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k + ' ' + a[k] + ' vs ' + b[k]);
    else assert.deepEqual(a[k], b[k], k);
  }
});

/** Count the competent proxy's audible alarms over a day; the operator ACKs 3 real s after each sound. */
function competentDay(seed) {
  const a = A.createAlarms();
  let realMs = 0, lastS = -1, ackAt = Infinity;
  const stationOf = id => id.replace(/\d+$/, '');
  runPar(seed, CLASSIC, {proxy: 'competent', onStep: st => {
    A.sampleTick(a, st);
    if (st.tick % TPS !== 0 || st.tick < V.PLAYER_START_TICK) return;
    const x = A.alarmInputFromState(st);
    // Real time: 120x at CRUISE, about 1x in the watch.
    realMs += (lastS < 0 ? 0 : x.s - lastS) * 1000 / (x.inWatch ? 1 : 120);
    lastS = x.s;
    const r = A.updateAlarms(a, x, {nowMs: realMs, realDtS: 1 / (x.inWatch ? 1 : 120), stationOf});
    if (r.cues.length || r.newAlarm) ackAt = Math.min(ackAt, realMs + 3000);
    if (realMs >= ackAt) { A.ackAll(a); ackAt = Infinity; }
  }});
  return a;
}

test('K-8 accept: the competent proxy triggers <= 8 audible alarms in a day', () => {
  const seeds = SLOW ? Array.from({length: 20}, (_, i) => i + 1) : [1];
  const counts = seeds.map(seed => {
    const a = competentDay(seed);
    assert.ok(a.audible <= 8, 'seed ' + seed + ': ' + a.audible + ' audible alarms ' + JSON.stringify(a.sounds));
    return a.audible;
  });
  assert.ok(counts.every(n => n >= 1), 'a day is not silent: ' + counts);
});

// ------------------------------------------------------------------ the tray (K-9)

const news = (atS, kind, fromS) => ({tick: atS * TPS, kind: 'announce', news: {atS, kind, fromS, toS: null, text: 'Storm warning: gusts ' +
  'above the survival speed of the wind farms are expected from the afternoon, with the front crossing the ranges before dusk ' +
  'and lingering until late evening over the coast.'}});

test('K-9: at most 3 cards; warning cards ring twice and never repeat; <= 25 words; the rest go to the LOG', () => {
  const tr = T.createTray();
  let cues = T.trayRecords(tr, [news(100, 'storm', 5000)]);
  assert.deepEqual(cues, ['ring2'], 'a warning rings twice');
  cues = T.trayRecords(tr, [news(100, 'storm', 5000)]);
  assert.deepEqual(cues, [], 'never repeats');
  assert.equal(tr.cards.length, 1);
  assert.ok(tr.cards[0].text.split(/\s+/).length <= T.MAX_WORDS + 0, tr.cards[0].text);
  assert.ok(tr.cards[0].text.endsWith('…'));
  T.trayRecords(tr, [{tick: 200 * TPS, kind: 'contingency', cause: 'unit', id: 'coal3', lostMW: 612},
    {tick: 201 * TPS, kind: 'ufls', stage: 1, districts: ['HAZ1', 'TAL1'], mw: 400},
    {tick: 202 * TPS, kind: 'log', sev: 'info', code: 'UNIT_READY', msg: 'GT·A at full speed: auto-sync in 4 min.'}]);
  const v = T.trayView(tr);
  assert.equal(v.cards.length, T.MAX_CARDS);
  assert.equal(v.log.length, 1);
  for (const c of [...v.cards, ...v.log]) {
    assert.ok(Object.values(T.SENDERS).includes(c.from), c.from);
    assert.deepEqual(Object.keys(c.button).sort(), ['label', 'target'], 'a button only focuses a control');
    assert.match(c.time, /^\d\d:\d\d$/);
  }
  assert.equal(v.cards.find(c => /tripped/.test(c.text)).button.target, 'lever-coal');
  T.trayFrame(tr, 202 + T.CARD_TTL_S + 1);
  assert.equal(T.trayView(tr).cards.length, 0, 'old cards go to the LOG');
  assert.equal(T.trayView(tr).log.length, 4);
  assert.equal(tr.rings, 3, 'three warnings rang');
});

test('K-9: every record kind that makes a warning card offers a one-click jump to a real control', () => {
  const ids = contractIds();
  const recs = [news(1, 'heat', 2), {tick: 5, kind: 'contingency', cause: 'link', id: 'tie', lostMW: 500},
    {tick: 6, kind: 'contingency', cause: 'load', id: 'smelter', lostMW: -256}, {tick: 7, kind: 'shed', district: 'RED2', why: 'directed', mw: 180},
    {tick: 8, kind: 'log', code: 'HYDRO_WATER', msg: 'GORGE: 30% of the day\'s water left.'},
    {tick: 9, kind: 'log', code: 'SECURITY', msg: 'SECURITY SHORT: spare in 5 min 400 MW, biggest risk coal1 650 MW, trip preview 49.40 Hz.'}];
  for (const r of recs) {
    const c = T.cardOf(r);
    assert.ok(c, r.kind);
    assert.ok(ids.has(c.button.target), r.kind + ' -> ' + c.button.target);
  }
  assert.equal(T.cardOf({tick: 1, kind: 'log', code: 'SECURITY', msg: 'SECURITY TIGHT: ...'}), null, 'TIGHT is the gauge\'s, not a card');
});
