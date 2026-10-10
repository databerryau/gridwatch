// U-2, U-3, U-4, U-6 (desk/README.md §31): the city levers in the sim, part 1. Shapes of a block
// (flexParts / flexAt, §31.3.5), the aim (aimFlex, §31.3.10), the inputs and every refusal
// (§31.3.6, sim/README.md §6), patience (Q-54), observe().levers (§31.3.7), the records (§31.3.9),
// replay and CLASSIC's neutrality (I4). Pure functions, poked states and an hour of one day: no
// whole days (CLAUDE.md budget). The flow on the grid (I1-I3b, money, the blue row, MSL) is
// tests/levers-day.test.js.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flexParts, flexAt} from '../sim/weather.js';
import {aimFlex} from '../sim/autopilot.js';
import {createState, step, applyInput, observe, hashState, replay} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import * as physics from '../sim/physics.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {injectTrip} from './lib/sim-helpers.js';

const R = V.FLEX_RAMP_S, STEP = V.FC_STEP_S, TPS = V.TICKS_PER_S;
const at = (h, m = 0) => (h - V.DAY_START_H) * 3600 + m * 60; // grid second of hh:mm (h unwrapped)

// The integral of knots [[s, mw], ...] (trapezoids: exact for piecewise-linear parts).
const area = kn => kn.slice(1).reduce((a, p, i) => a + (p[1] + kn[i][1]) / 2 * (p[0] - kn[i][0]), 0);
const soakB = (suburb, atS, effMW) => ({suburb, lever: 'soak', atS, endS: atS + V.SOAK_S, effMW, cost: 0});
const airB = (suburb, atS, effMW, cost = V.PATIENCE_AIRCON) => ({suburb, lever: 'aircon', atS, endS: atS + V.AIRCON_S, effMW, cost});

test('U-3: flexParts: a soak is a core (+) and a night fall (-) of the same energy; every knot on the 300-s lattice; parts start and end at 0', () => {
  const b = soakB('HAZ', at(10, 30), 140), p = flexParts(b, 140), E = 140 * (V.SOAK_S - R);
  assert.deepEqual(p.map(x => x.kind), ['core', 'night']);
  assert.deepEqual(p[0].knots, [[at(10, 30), 0], [at(10, 45), 140], [at(14, 15), 140], [at(14, 30), 0]]);
  const D = E / (V.SOAK_NIGHT_TO_S - V.SOAK_NIGHT_FROM_S - R);
  assert.deepEqual(p[1].knots, [[at(22), 0], [at(22, 15), -D], [at(27, 45), -D], [at(28), 0]]);
  assert.equal(at(28), V.DAY_S, 'the night fall ends at 04:00, inside the sim day');
  assert.ok(Math.abs(area(p[0].knots) - E) < 1e-6 && Math.abs(area(p[1].knots) + E) < 1e-6, 'U-3: the night falls by the soaked energy');
});

test('U-3: flexParts: an air-con cycle is pre-cool (+50%) in the hour before, relief (-) for 1.5 h, a front-loaded snapback (+40%) over 1.5 h after', () => {
  const t = at(19, 30), b = airB('TAL', t, 13.5), p = flexParts(b, 13.5), Er = 13.5 * (V.AIRCON_S - R);
  assert.deepEqual(p.map(x => x.kind), ['precool', 'core', 'snapback']);
  assert.deepEqual(p[0].knots.map(k => k[0]), [at(18, 30), at(18, 45), at(19, 15), t]);
  assert.deepEqual(p[1].knots, [[t, 0], [at(19, 45), -13.5], [at(20, 45), -13.5], [at(21), 0]]);
  assert.deepEqual(p[2].knots.map(k => k[0]), [at(21), at(21, 15), at(22, 30)], 'the snapback peaks after one ramp, then falls linearly');
  assert.ok(Math.abs(area(p[0].knots) - V.PRECOOL_FRAC * Er) < 1e-9);
  assert.ok(Math.abs(area(p[1].knots) + Er) < 1e-9);
  assert.ok(Math.abs(area(p[2].knots) - V.SNAPBACK_FRAC * Er) < 1e-9);
  for (const x of [...p, ...flexParts(soakB('SOL', at(11), 60), 60)]) {
    assert.ok(x.knots.every(k => k[0] % STEP === 0), x.kind + ': on the lattice');
    assert.equal(x.knots[0][1], 0); assert.equal(x.knots[x.knots.length - 1][1], 0);
  }
  assert.deepEqual(flexParts(b, 27).map(x => x.knots[1][1] / 2), p.map(x => x.knots[1][1]), 'effMW scales every part');
});

test('U-3 / I6: flexAt is the parts\' knots interpolated, summed in block order and filtered by suburb, kind and lever; each part integrates to its energy (per second and on 5-min columns)', () => {
  const blocks = [soakB('HAZ', at(10, 30), 140), soakB('TAL', at(11), 90), airB('TAL', at(17), 13.5), airB('HAR', at(19, 30), 40)];
  const interp = (kn, s) => {
    if (s <= kn[0][0] || s >= kn[kn.length - 1][0]) return 0;
    let i = 1; while (kn[i][0] < s) i++;
    return kn[i - 1][1] + (kn[i][1] - kn[i - 1][1]) * (s - kn[i - 1][0]) / (kn[i][0] - kn[i - 1][0]);
  };
  for (let s = 0; s <= V.DAY_S + 3600; s += 137) {
    let all = 0, tal = 0, core = 0, relief = 0;
    for (const b of blocks) for (const p of flexParts(b, b.effMW)) {
      const v = interp(p.knots, s);
      all += v;
      if (b.suburb === 'TAL') tal += v;
      if (p.kind === 'core') core += v;
      if (p.kind === 'core' && b.lever === 'aircon') relief += v;
    }
    assert.ok(Math.abs(flexAt(blocks, s) - all) < 1e-9, 's ' + s);
    assert.ok(Math.abs(flexAt(blocks, s, 'TAL') - tal) < 1e-9);
    assert.ok(Math.abs(flexAt(blocks, s, '', 'core') - core) < 1e-9);
    assert.ok(Math.abs(flexAt(blocks, s, '', 'core', 'aircon') - relief) < 1e-9);
  }
  assert.equal(flexAt([], at(12)), 0);
  assert.equal(flexAt(blocks, V.DAY_S + 1), 0, 'nothing past 04:00');
  // I6: each part's integral within 1% of its energy, on the sim's seconds and on the 5-min columns.
  for (const b of blocks) for (const p of flexParts(b, b.effMW)) {
    const E = area(p.knots), lo = p.knots[0][0], hi = p.knots[p.knots.length - 1][0];
    let perS = 0, cols = 0;
    for (let s = lo; s < hi; s++) perS += flexAt([b], s, '', p.kind);
    for (let s = lo; s < hi; s += STEP) cols += flexAt([b], s, '', p.kind) * STEP;
    assert.ok(Math.abs(perS - E) <= Math.abs(E) * 0.01 && Math.abs(cols - E) <= Math.abs(E) * 0.01, b.suburb + ' ' + p.kind);
  }
});

// A synthetic forecast: n columns from fromS, demandP50 = f(column time).
const fcOf = (fromS, n, f) => {
  const fc = {fromS, stepS: STEP, n, demandP50: []};
  for (let k = 0; k < n; k++) fc.demandP50.push(f(fromS + (k + 1) * STEP));
  return fc;
};
const LV = (id, lever, over = {}) => {
  const open = lever === 'soak' ? {mw: 140, cost: 0, fromS: V.SOAK_FROM_S, toS: V.SOAK_TO_S - V.SOAK_S, block: ''}
    : {mw: 15, cost: V.PATIENCE_AIRCON, fromS: V.AIRCON_FROM_S, toS: V.AIRCON_TO_S - V.AIRCON_S, block: ''};
  return {id, patience: 90, soak: Object.assign({}, open, lever === 'soak' ? over : {}), aircon: Object.assign({}, open, lever === 'aircon' ? over : {})};
};
const lvOf = (rows, blocks = []) => ({rev: 0, offered: ['soak', 'aircon'], suburbs: rows,
  blocks: blocks.map(b => Object.assign({}, b, {del: '', parts: flexParts(b, b.effMW)}))});

test('§31.3.10 aimFlex: the soak centres its 4-h core on the lowest column in 10:00-15:00, rounded to the lattice and clamped to [fromS, toS]', () => {
  const vee = t => 2000 + Math.abs(t - at(12, 7)) / 10; // lowest at 12:07 (between columns: 12:05 and 12:10 are equal-ish)
  const fc = fcOf(at(9), 120, vee); // 09:05 .. 19:00
  const lv = lvOf([LV('HAZ', 'soak')]);
  assert.equal(aimFlex(fc, lv, 'HAZ', 'soak'), at(10, 5), 'centred on 12:05: 10:05');
  // Lower columns outside the window are not searched.
  const fc2 = fcOf(at(9), 120, t => (t < at(10) || t > at(15) ? 0 : vee(t)));
  assert.equal(aimFlex(fc2, lv, 'HAZ', 'soak'), at(10, 5));
  // Centred later than the last start: clamped to toS (11:00); earlier than fromS: clamped to 10:00.
  assert.equal(aimFlex(fcOf(at(9), 120, t => Math.abs(t - at(14, 30))), lv, 'HAZ', 'soak'), V.SOAK_TO_S - V.SOAK_S);
  assert.equal(aimFlex(fcOf(at(9), 120, t => Math.abs(t - at(10))), lv, 'HAZ', 'soak'), V.SOAK_FROM_S);
  // A narrower open range (later in the morning) clamps the same way.
  assert.equal(aimFlex(fc, lvOf([LV('HAZ', 'soak', {fromS: at(10, 40)})]), 'HAZ', 'soak'), at(10, 40));
});

test('§31.3.10 aimFlex: air-con centres its 1.5-h relief on the highest column in 15:00-21:00; -1 when blocked, when no column is in the window, or when the extreme is the last column with the window running past it', () => {
  const hill = t => 7000 - Math.abs(t - at(19, 30)) / 10;
  const lv = lvOf([LV('TAL', 'aircon')]);
  assert.equal(aimFlex(fcOf(at(15), 72, hill), lv, 'TAL', 'aircon'), at(18, 45), 'relief 18:45-20:15 around the 19:30 peak');
  assert.equal(aimFlex(fcOf(at(15), 72, hill), lvOf([LV('TAL', 'aircon', {block: 'locked', fromS: -1, toS: -1})]), 'TAL', 'aircon'), -1);
  assert.equal(aimFlex(fcOf(at(15), 72, hill), lv, 'XYZ', 'aircon'), -1, 'no such suburb');
  assert.equal(aimFlex(fcOf(at(5), 54, hill), lv, 'TAL', 'aircon'), -1, '05:00-09:30: no column in the window');
  // The forecast ends at 18:00 while the window runs to 21:00 and demand is still rising: not yet in view.
  const rising = fcOf(at(13, 30), 54, t => 5000 + t / 100);
  assert.equal(rising.fromS + rising.n * STEP, at(18));
  assert.equal(aimFlex(rising, lv, 'TAL', 'aircon'), -1);
  // The window's own end inside the forecast: its last column may be the extreme.
  const late = fcOf(at(17), 54, t => 5000 + t / 100);
  assert.equal(aimFlex(late, lv, 'TAL', 'aircon'), V.AIRCON_TO_S - V.AIRCON_S, 'the peak at 21:00: centred 20:15, clamped to 19:30');
});

test('§31.3.10 aimFlex: the line is demandP50 less this suburb\'s own blocks of this lever: another suburb\'s booked flex counts, so a second suburb aims at the peak that is left', () => {
  const base = t => 7000 - Math.abs(t - at(19, 30)) / 100; // a broad evening peak
  const har = airB('HAR', at(18, 45), 40);
  // The forecast already carries HAR's cycle (Q-50): relief on the peak, snapback after it.
  const withHar = t => base(t) + flexAt([har], t);
  const fc = fcOf(at(15), 72, withHar);
  const rows = [LV('HAR', 'aircon'), LV('TAL', 'aircon')];
  const lv = lvOf(rows, [har]);
  const own = aimFlex(fcOf(at(15), 72, base), lvOf(rows), 'HAR', 'aircon');
  assert.equal(aimFlex(fc, lv, 'HAR', 'aircon'), own, 'HAR re-aims on the line without its own block');
  const second = aimFlex(fc, lv, 'TAL', 'aircon');
  assert.notEqual(second, own, 'TAL sees the peak HAR left');
  let k = -1, hi = -Infinity;
  for (let j = 0; j < fc.n; j++) { const t = fc.fromS + (j + 1) * STEP; if (t >= V.AIRCON_FROM_S && t <= V.AIRCON_TO_S && fc.demandP50[j] > hi) { hi = fc.demandP50[j]; k = j; } }
  const want = Math.round((fc.fromS + (k + 1) * STEP - V.AIRCON_S / 2) / STEP) * STEP;
  assert.equal(second, Math.min(V.AIRCON_TO_S - V.AIRCON_S, Math.max(V.AIRCON_FROM_S, want)));
  // Another lever's blocks of the same suburb are not subtracted.
  const soak = soakB('HAR', at(10), 20);
  assert.equal(aimFlex(fc, lvOf(rows, [har, soak]), 'HAR', 'aircon'), own);
});

// ------------------------------------------------------------------ inputs, refusals, patience (sim/README.md §6)

const book = (s, suburb, lever, atS, out) => applyInput(s, {type: 'flex', suburb, lever, atS}, out).reason;
const del = (s, suburb, lever, atS, out) => applyInput(s, {type: 'flexDel', suburb, lever, atS}, out).reason;
/** DESK seed `seed` with the clock at hh:mm (a test poke: inputs read only the clock and the levers). */
const deskAt = (seed, h, m = 0) => { const s = createState(seed, DESK); s.tick = at(h, m) * TPS; return s; };
const NOT_OFFERED = 'not offered today', WINDOW = 'not a 5-minute mark in the window', LATE = 'too late: it would start in the past';
const OVERLAP = 'overlaps another air-con block of this suburb', LOCKED = 'air-con locked: patience below ' + V.PATIENCE_LOCK;
const UNDER = 'under way: too late to cancel';

test('§31.3.6: every refusal, word for word (sim/README.md §6); a refused input changes nothing and is not logged', () => {
  const c = createState(2, CLASSIC);
  c.tick = at(5) * TPS;
  assert.equal(book(c, 'HAZ', 'soak', at(10, 30)), NOT_OFFERED, 'CLASSIC (levers: null)');
  assert.equal(del(c, 'HAZ', 'soak', at(10, 30)), NOT_OFFERED);
  assert.equal(book(createState(2, DESK), 'HAZ', 'soak', at(10, 30)), 'levers open at 04:30', 'the briefing');
  const mild = deskAt(1, 5);
  assert.equal(mild.day.temp, 'MILD');
  assert.equal(book(createState(1, DESK), 'TAL', 'aircon', at(19, 30)), 'levers open at 04:30', 'the clock before the menu (§6 order)');
  assert.equal(book(mild, 'TAL', 'aircon', at(19, 30)), NOT_OFFERED, 'Q-51: no air-con on a MILD day');
  assert.equal(book(mild, 'TAL', 'soak', at(10, 30)), '', 'the soak every day');
  const s = deskAt(2, 5);
  assert.equal(s.day.temp, 'HOT');
  const h = hashState(s);
  for (const [suburb, lever, t] of [['HAZ', 'soak', at(10, 31)], ['HAZ', 'soak', at(9, 55)], ['HAZ', 'soak', at(11, 5)],
    ['TAL', 'aircon', at(14, 55)], ['TAL', 'aircon', at(19, 35)], ['TAL', 'aircon', at(17, 2)]]) {
    assert.equal(book(s, suburb, lever, t), WINDOW, suburb + ' ' + lever + ' at ' + t);
  }
  assert.equal(del(s, 'HAZ', 'soak', at(10, 30)), 'no such block');
  assert.equal(hashState(s), h, 'nothing refused changed state');
  assert.equal(s.log.length, 0);
  assert.equal(book(s, 'HAZ', 'soak', at(10, 30)), '');
  assert.equal(book(s, 'HAZ', 'soak', at(10)), 'one soak a day: already booked');
  assert.equal(book(s, 'HAZ', 'aircon', at(18, 30)), '');
  // The overlap rule, both orders: for any two, the later's atS - PRECOOL_S >= the earlier's endS.
  for (const t of [at(16, 5), at(17, 30), at(18, 30), at(19, 30)]) assert.equal(book(s, 'HAZ', 'aircon', t), OVERLAP, 'HAZ at ' + t);
  assert.equal(book(s, 'HAZ', 'aircon', at(16)), '', 'relief ends 17:30, an hour before the later pre-cool');
  const late = deskAt(2, 10, 31);
  assert.equal(book(late, 'HAZ', 'soak', at(10, 30)), LATE);
  assert.equal(book(late, 'HAZ', 'soak', at(10, 35)), '', 'its first knot may be the next 5-minute mark');
  late.tick = at(10, 35) * TPS;
  assert.equal(del(late, 'HAZ', 'soak', at(10, 35)), UNDER, 'a soak is under way from atS');
  const pm = deskAt(2, 17, 1);
  assert.equal(book(pm, 'SOL', 'aircon', at(18)), LATE, 'pre-cool from 17:00 is past');
  assert.equal(book(pm, 'SOL', 'aircon', at(18, 5)), '');
  pm.tick = at(17, 5) * TPS;
  assert.equal(del(pm, 'SOL', 'aircon', at(18, 5)), UNDER, 'air-con is under way from its pre-cool');
  assert.equal(del(pm, 'SOL', 'aircon', at(18, 10)), 'no such block');
});

test('Q-54 / U-4: patience: an air-con booking costs 10 + 5 per air-con block booked, delivers 0.5 + p/100 below 50, locks below 25; a cancel refunds its own cost; every change is a PATIENCE record with its cause', () => {
  const s = deskAt(2, 5), out = [];
  const tal = () => s.levers.patience[4], blk = t => s.levers.blocks.find(b => b.suburb === 'TAL' && b.atS === t);
  assert.equal(book(s, 'TAL', 'soak', at(10), out), '');
  assert.equal(tal(), 40, 'a soak costs nothing');
  assert.deepEqual(out.map(r => r.code), ['FLEX_BOOK'], 'and makes no PATIENCE record');
  out.length = 0;
  assert.equal(book(s, 'TAL', 'aircon', at(19, 30), out), '');
  assert.deepEqual([blk(at(19, 30)).effMW, blk(at(19, 30)).cost, tal()], [15 * 0.9, 10, 30], 'Tallowood (40): 90% the first time');
  assert.equal(book(s, 'TAL', 'aircon', at(15), out), '');
  assert.deepEqual([blk(at(15)).effMW, blk(at(15)).cost, tal()], [15 * 0.8, 15, 15], '80% the second time, and it ends at 15');
  assert.deepEqual(out.map(r => r.code), ['FLEX_BOOK', 'PATIENCE', 'FLEX_BOOK', 'PATIENCE', 'PATIENCE_LOCK']);
  const [b1, p1, , p2, lock] = out;
  assert.deepEqual(b1, {tick: s.tick, kind: 'log', sev: 'info', code: 'FLEX_BOOK', msg: b1.msg, suburb: 'TAL', lever: 'aircon', atS: at(19, 30),
    endS: at(21), effMW: 13.5});
  assert.match(b1.msg, /^Tallowood Heights: air-con cycle booked for 19:30 \(14 MW\)\.$/);
  assert.deepEqual([p1.suburb, p1.patience, p1.delta, p1.cause], ['TAL', 30, -10, 'aircon']);
  assert.deepEqual([p2.patience, p2.delta], [15, -15]);
  assert.deepEqual([lock.sev, lock.suburb, lock.patience], ['info', 'TAL', 15]);
  assert.equal(book(s, 'TAL', 'aircon', at(17)), LOCKED, 'locked below 25 (derived: there is no flag)');
  assert.equal(observe(s).levers.suburbs[4].aircon.block, LOCKED);
  out.length = 0;
  assert.equal(del(s, 'TAL', 'aircon', at(15), out), '');
  assert.deepEqual(out.map(r => [r.code, r.patience, r.delta, r.cause]), [['FLEX_DEL', undefined, undefined, undefined], ['PATIENCE', 30, 15, 'cancel']]);
  assert.deepEqual([out[0].suburb, out[0].lever, out[0].atS], ['TAL', 'aircon', at(15)]);
  assert.equal(observe(s).levers.suburbs[4].aircon.block, '', 'the refund lifts the lock');
  assert.equal(book(s, 'TAL', 'aircon', at(15, 30)), '');
  assert.deepEqual([blk(at(15, 30)).effMW, blk(at(15, 30)).cost, tal()], [12, 15, 15], 'a re-booking is priced afresh');
  // Harbourside (50): 100%, then 90%; never locked by two cycles.
  assert.equal(book(s, 'HAR', 'aircon', at(19)), '');
  assert.equal(book(s, 'HAR', 'aircon', at(16, 30)), '');
  assert.deepEqual(s.levers.blocks.filter(b => b.suburb === 'HAR').map(b => b.effMW), [36, 40]);
  assert.equal(s.levers.patience[3], 25);
  assert.equal(s.levers.rev, 7, 'rev rises on every accepted booking and cancel');
  // Blocks stay sorted by (atS, the suburb's city index).
  const keys = s.levers.blocks.map(b => [b.atS, s.scn.city.suburbs.findIndex(x => x.id === b.suburb)]);
  assert.deepEqual(keys, keys.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]));
});

test('§31.3.7: observe().levers: what is offered, each suburb\'s {mw, cost, fromS, toS, block} for each lever, and the blocks with del and parts', () => {
  const s = deskAt(2, 4, 30), L = () => observe(s).levers;
  const sub = id => L().suburbs.find(x => x.id === id);
  assert.deepEqual(L().offered, ['soak', 'aircon']);
  assert.deepEqual(L().suburbs.map(x => [x.id, x.patience]), [['SOL', 70], ['HAZ', 90], ['RED', 60], ['HAR', 50], ['TAL', 40], ['SAL', 80]]);
  assert.deepEqual(sub('HAZ').soak, {mw: 140, cost: 0, fromS: at(10), toS: at(11), block: ''});
  assert.deepEqual(sub('TAL').aircon, {mw: 13.5, cost: 10, fromS: at(15), toS: at(19, 30), block: ''});
  assert.equal(sub('HAR').aircon.mw, 40);
  assert.equal(book(s, 'TAL', 'aircon', at(19, 30)), '');
  // The next cycle may go before it only (two fit when the first starts by 17:00), priced afresh.
  assert.deepEqual(sub('TAL').aircon, {mw: 12, cost: 15, fromS: at(15), toS: at(17), block: ''});
  assert.equal(book(s, 'HAZ', 'aircon', at(15)), '');
  assert.deepEqual(sub('HAZ').aircon, {mw: 15, cost: 15, fromS: at(17, 30), toS: at(19, 30), block: ''}, 'after it: once its relief has ended');
  // Every start in [fromS, toS] is accepted (here, the ends and a middle).
  for (const t of [at(17, 30), at(18, 30), at(19, 30)]) assert.equal(book(JSON.parse(JSON.stringify(s)), 'HAZ', 'aircon', t), '', 'HAZ at ' + t);
  const o = L();
  assert.equal(o.rev, 2);
  assert.deepEqual(o.blocks.map(b => [b.suburb, b.lever, b.atS, b.endS, b.effMW, b.cost, b.del]),
    [['HAZ', 'aircon', at(15), at(16, 30), 15, 10, ''], ['TAL', 'aircon', at(19, 30), at(21), 13.5, 10, '']]);
  assert.deepEqual(o.blocks[1].parts, flexParts(s.levers.blocks[1], 13.5));
  // Later in the day the windows close: the soak after 11:00, a cycle once its pre-cool would be past.
  s.tick = at(11, 1) * TPS;
  assert.deepEqual(sub('SOL').soak, {mw: 60, cost: 0, fromS: -1, toS: -1, block: LATE});
  s.tick = at(14, 1) * TPS;
  assert.deepEqual([sub('HAZ').aircon.fromS, sub('TAL').aircon.fromS], [at(17, 30), at(15, 5)]);
  assert.equal(L().blocks[0].del, UNDER, 'HAZ\'s pre-cool began at 14:00');
  s.tick = at(16) * TPS;
  assert.deepEqual([sub('TAL').aircon.fromS, sub('TAL').aircon.toS], [at(17), at(17)], 'the last start before 19:30 (pre-cool from now)');
  s.tick = at(16, 1) * TPS;
  assert.deepEqual(sub('TAL').aircon, {mw: 12, cost: 15, fromS: -1, toS: -1, block: OVERLAP}, 'the run before 19:30 has closed');
  s.tick = at(18, 31) * TPS;
  assert.equal(sub('SAL').aircon.block, LATE);
  // The view is a copy, and empty on CLASSIC.
  o.blocks[0].parts[0].knots[1][1] = -1;
  assert.notEqual(flexParts(s.levers.blocks[0], 15)[0].knots[1][1], -1);
  assert.deepEqual(observe(createState(2, CLASSIC)).levers, {rev: 0, offered: [], suburbs: [], blocks: []});
});

test('§31.3.1: levers.suburbs list the city\'s suburbs in its order (grid and step index both by the city index); createState refuses any other list', () => {
  for (const scn of [DESK, DESK_WEEKEND]) assert.deepEqual(scn.levers.suburbs.map(x => x.id), scn.city.suburbs.map(x => x.id), scn.id);
  const bad = JSON.parse(JSON.stringify(DESK));
  bad.levers.suburbs.reverse();
  assert.throws(() => createState(2, bad), /levers\.suburbs must follow city\.suburbs/, 'another order');
  bad.levers.suburbs.reverse().pop();
  assert.throws(() => createState(2, bad), /levers\.suburbs must follow city\.suburbs/, 'a subset');
  bad.levers.suburbs = DESK.levers.suburbs;
  assert.equal(createState(2, bad).levers.patience.length, 6);
});

test('K-15 / F-6 (2b): flex and flexDel on DESK are refused in the watch (applyInput\'s rule) and after the day', () => {
  const s = injectTrip(createState(2, DESK), V.PLAYER_START_S + 60);
  while (s.contIdx < 0) step(s);
  const out = [];
  assert.match(book(s, 'HAZ', 'soak', at(10, 30), out), /watch/);
  assert.match(del(s, 'HAZ', 'soak', at(10, 30), out), /watch/);
  assert.equal(s.log.length, 0);
  s.tick = s.conts[s.contIdx].watchEndTick;
  assert.equal(book(s, 'HAZ', 'soak', at(10, 30)), '', 'the desk unlocks at watchEndTick');
  s.over = true;
  assert.equal(book(s, 'SOL', 'soak', at(10, 30)), 'the day is over');
});

test('F-6 / F-2 (2b): replay of a day with bookings and cancels is bit-identical, with soak, pre-cool and paid relief flowing; the log holds the inputs as given (never rewritten)', () => {
  const s = createState(2, DESK), want = [], no = [];
  const f = (suburb, lever, atS) => ({type: 'flex', suburb, lever, atS}), d = (suburb, lever, atS) => ({type: 'flexDel', suburb, lever, atS});
  const inputs = new Map([ // by tick: two land mid-second
    [at(4, 31) * TPS, [f('HAZ', 'soak', at(10, 30)), f('TAL', 'aircon', at(19, 30)), f('TAL', 'aircon', at(15)), f('RED', 'soak', at(10, 1))]],
    [at(4, 40) * TPS, [d('TAL', 'aircon', at(15)), f('SAL', 'soak', at(10))]],
    [at(4, 50) * TPS, [f('TAL', 'aircon', at(16)), d('HAZ', 'soak', at(10, 30))]],
    [at(5) * TPS + 7, [f('HAR', 'aircon', at(15)), f('RED', 'soak', at(10, 30))]],
    [at(10, 1) * TPS, [d('SAL', 'soak', at(10))]],
    [at(13, 59) * TPS + 3, [d('TAL', 'aircon', at(16)), f('SOL', 'aircon', at(15, 30))]]]);
  while (!s.over && s.tick < at(15, 5) * TPS) {
    const x = inputs.get(s.tick);
    if (x) for (const i of x) { const r = applyInput(s, i); if (r.ok) want.push(i); else no.push(r.reason); }
    step(s);
  }
  assert.deepEqual(no, [WINDOW, UNDER], 'refused, not logged: RED off the lattice, SAL\'s soak under way');
  assert.equal(want.length, 11);
  assert.deepEqual(s.log.map(r => Object.assign({type: r.type}, r.args)), want, 'logged as given');
  assert.deepEqual(s.levers.patience, [60, 90, 60, 40, 30, 80]);
  assert.ok(!s.black && s.env.reliefSubMW[3] > 0 && s.env.flexMW !== 0 && s.score.cost.flex > 0, 'HAR\'s relief paid, SOL\'s pre-cool on');
  const r = replay(2, DESK, s.log, {untilTick: s.tick});
  assert.equal(r.tick, s.tick);
  assert.equal(hashState(r), hashState(s));
  assert.equal(JSON.stringify(r), JSON.stringify(s));
});

// ------------------------------------------------------------------ I4: neutral with no block

test('I4: on CLASSIC (and on any day with no block) the 2b terms are exactly zero and every formula is the pre-2b expression, bit for bit', () => {
  const c = createState(4, CLASSIC);
  for (let i = 0; i < 2 * 3600 * TPS; i++) step(c); // 04:00-06:00
  assert.deepEqual([c.env.flexMW, c.env.flexSubMW, c.env.reliefSubMW, c.city.flexDarkMW, c.levers],
    [0, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 0, {rev: 0, patience: [], blocks: []}]);
  assert.ok(observe(c, {dayAhead: true}).dayAhead.flexMW.every(x => x === 0));
  // DESK at a sunny 12:30 with no block: two districts dark (one past the cold-load delay), one relit and waiting.
  const s = createState(1, DESK), ds = s.city.districts, idx = id => ds.findIndex(d => d.id === id);
  s.tick = at(12, 30) * TPS;
  step(s);
  fleet.setDistrictDark(s, idx('SOL3'), true, 'directed');
  fleet.setDistrictDark(s, idx('RED5'), true, 'directed');
  s.tick += (V.COLD_LOAD_AFTER_S + 60) * TPS;
  fleet.setDistrictDark(s, idx('RED5'), false, null);
  fleet.setDistrictDark(s, idx('HAZ4'), true, 'directed');
  s.tick += 10 * TPS;
  const e = s.env, city = s.city, g = e.demandMW + e.rooftopMW;
  assert.ok(e.rooftopMW > 2000 && city.roofOffMW > 0 && city.shedFrac > 0);
  assert.ok(Object.is(fleet.litDemandMW(s), g * (1 - city.shedFrac) - (e.rooftopMW - city.roofOffMW)), 'litDemandMW');
  for (const id of ['SOL3', 'HAZ4', 'RED5', 'TAL1']) {
    const d = ds[idx(id)], base = g * d.share, sec = Math.floor(s.tick / TPS);
    const off = d.dark ? 1 : d.reconnectS < 0 ? 0 : sec < d.reconnectS ? 1 : 1 - (sec - d.reconnectS) / V.ROOF_RAMP_S;
    const old = d.dark ? (sec - d.darkSinceS > V.COLD_LOAD_AFTER_S ? base * V.COLD_LOAD_FACTOR : base) : base - e.roofSubMW[d.sub] * d.roofFrac * (1 - off);
    assert.ok(Object.is(fleet.districtColdLoadMW(s, idx(id)), old), id);
  }
  const before = s.acc.unservedMWs;
  physics.tick(s, []);
  assert.ok(Object.is(s.phys.shedMW, g * city.shedFrac - city.roofDarkMW + 0), 'shedMW');
  assert.ok(Object.is(s.phys.servedMW, g * (1 - city.shedFrac) - (e.rooftopMW - city.roofOffMW) + city.coldLoadMW - s.dr.mw + 0), 'servedMW');
  assert.ok(Object.is(s.acc.unservedMWs, before + g * city.shedFrac * V.PHYS_DT), 'unserved');
});
