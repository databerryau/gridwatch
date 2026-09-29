// F-13: every model constant lives in sim/params.js or content/scenarios.js with a source
// or the label "simplified"; no numeric literal elsewhere in sim/ (allow-list 0, 1, 2, 50,
// 60 and array indices); the fleet is the F-13 table.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
import * as params from '../sim/params.js';
import {P, V, valuesOf} from '../sim/params.js';
import {SCENARIOS} from '../content/scenarios.js';
import {tokenize, jsFiles} from './lib/js-tokens.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SIM = fileURLToPath(new URL('../sim/', import.meta.url));
const rel = f => relative(ROOT, f).replace(/\\/g, '/');

const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x) && 'value' in x;

// Walk a params tree; report records without unit/src/simplified and numbers outside records.
function checkParams(x, path, bad) {
  if (typeof x === 'number') { bad.push(path + ': bare number ' + x + ' outside a {value, unit, src} record'); return; }
  if (x === null || typeof x !== 'object') return;
  if (isRecord(x)) {
    if (typeof x.unit !== 'string' || !x.unit) bad.push(path + ': no unit');
    const sourced = typeof x.src === 'string' && x.src.length > 0;
    const simplified = x.simplified === true && typeof x.note === 'string' && x.note.length > 0;
    if (!sourced && !simplified) bad.push(path + ': needs src, or simplified: true with a note');
    if (sourced && x.simplified) bad.push(path + ': has both src and simplified');
    if ('unverified' in x && x.unverified !== true) bad.push(path + ': unverified must be true when present');
    return;
  }
  for (const k of Object.keys(x)) checkParams(x[k], path + '.' + k, bad);
}

test('F-13: every exported param is a record with a unit and a src or simplified note', () => {
  const bad = [];
  const skip = new Set(['V', 'SIM_VERSION']);
  for (const [name, val] of Object.entries(params)) {
    if (skip.has(name) || typeof val === 'function') continue;
    checkParams(val, name, bad);
  }
  assert.deepEqual(bad, []);
  assert.ok(Object.keys(P).length > 100, 'expected the full parameter set');
});

test('V mirrors P: plain values, derived tables present, frozen', () => {
  for (const k of Object.keys(P)) assert.deepEqual(V[k], valuesOf(P[k]), k);
  assert.ok(Object.isFrozen(V) && Object.isFrozen(V.MACHINES) && Object.isFrozen(V.MACHINES[0]));
  assert.equal(V.TICKS_PER_S, 50);
  assert.equal(V.DAY_TICKS, 4320000);
  assert.equal(V.MACHINES.length, 13);
  assert.equal(new Set(V.MACHINE_IDS).size, V.MACHINES.length);
});

test('§8.3: constants still unverified are flagged', () => {
  for (const k of ['GUARD_TRIGGER_HZ', 'GUARD_SUSTAIN_S', 'AUTO_SYNC_S', 'FC_SIGMA_NEAR', 'FC_SIGMA_FAR', 'RERT_RAMP_MW_MIN',
    'BATT_DISPATCH_RAMP_MW_S', 'BATT_CHARGE_EFF'])
    assert.equal(P[k].unverified, true, k);
  for (const st of P.FLEET) for (const f of ['t1Min', 't2Min', 't4Min']) assert.equal(st[f].unverified, true, st.id + '.' + f);
});

// Every record with a `range` (H-8: "every parameter inside its §8 range").
function rangedRecords(x, path, out) {
  if (x === null || typeof x !== 'object') return out;
  if (isRecord(x)) { if ('range' in x) out.push({path, r: x}); return out; }
  for (const k of Object.keys(x)) rangedRecords(x[k], path + '.' + k, out);
  return out;
}

test('H-8 / §8: every ranged param holds a value inside its [lo, hi] range, and the range is explained', () => {
  const ranged = rangedRecords(P, 'P', []);
  assert.ok(ranged.length >= 12, 'expected ranges on LOAD_RELIEF, battery PFR, guard trigger, auto-sync and governors');
  for (const {path, r} of ranged) {
    assert.ok(Array.isArray(r.range) && r.range.length === 2 && r.range[0] < r.range[1], path + ': range must be [lo, hi]');
    assert.equal(typeof r.value, 'number', path);
    assert.ok(r.value >= r.range[0] && r.value <= r.range[1], path + ': ' + r.value + ' outside ' + r.range);
    assert.match(r.src || r.note, /range/i, path + ': the src or note must say where the range comes from');
  }
  for (const k of ['LOAD_RELIEF', 'BATT_PFR_DEAD_S', 'BATT_PFR_LAG_S', 'GUARD_TRIGGER_HZ', 'AUTO_SYNC_S'])
    assert.ok(Array.isArray(P[k].range), k + ' has a range');
  for (const cl of Object.values(P.CLASSES)) assert.ok(cl.govDeadS.range && cl.govLagS.range);
});

test('stage B param blocks: four labelled, empty-at-stage-A marker pairs at the end of P (merge-safe)', () => {
  const src = readFileSync(fileURLToPath(new URL('../sim/params.js', import.meta.url)), 'utf8');
  for (const owner of ['physics', 'grid', 'market + events', 'autopilot']) {
    const a = src.indexOf('// ---- stage B "' + owner + '" block: begin'), b = src.indexOf('// ---- stage B "' + owner + '" block: end');
    assert.ok(a > 0 && b > a, owner + ' block markers');
  }
});

test('F-13: the fleet is the spec table (machines committed individually)', () => {
  const want = {
    coal: {machines: 4, ratingMW: 650, minMW: 240, hot: 120, offer: 26, noLoadPerH: 3000, minUpH: 8, minDownH: 8, co2: 0.95, H: 5},
    ccgt: {machines: 2, ratingMW: 650, minMW: 175, hot: 45, offer: 74, noLoadPerH: 3000, minUpH: 4, minDownH: 3, co2: 0.42, H: 4.5},
    gta: {machines: 1, ratingMW: 500, minMW: 250, hot: 8, offer: 148, noLoadPerH: 4000, minUpH: 1, minDownH: 0.5, co2: 0.63, H: 3.5},
    gtb: {machines: 2, ratingMW: 400, minMW: 200, hot: 8, offer: 152, noLoadPerH: 4000, minUpH: 1, minDownH: 0.5, co2: 0.63, H: 3.5},
    gtc: {machines: 1, ratingMW: 300, minMW: 150, hot: 5, offer: 156, noLoadPerH: 2400, minUpH: 1, minDownH: 0.5, co2: 0.63, H: 3.5},
    hydro: {machines: 3, ratingMW: 317, minMW: 0, hot: 3, offer: 130, noLoadPerH: 0, minUpH: 0, minDownH: 0, co2: 0, H: 3.5},
  };
  assert.deepEqual(V.STATION_IDS, Object.keys(want));
  for (const [id, w] of Object.entries(want)) {
    const st = V.STATIONS[id];
    for (const k of Object.keys(w)) if (k !== 'hot') assert.equal(st[k], w[k], id + '.' + k);
    assert.equal(st.t1Min + st.t2Min, w.hot, id + ': T1 + T2 is the hot start');
  }
  assert.equal(V.STATIONS.coal.rampMWMin, 3);
  assert.equal(V.STATIONS.ccgt.rampMWMin, 17.5);
  assert.ok(Math.abs(V.STATIONS.hydro.rampMWMin * 3 - 130) < 1e-9, 'hydro 130 MW/min per station');
  // T2 and T4 profiles never move faster than the machine's ramp (F-4, H-1).
  for (const m of V.MACHINES) {
    if (m.t2S > 0) assert.ok((m.minMW - m.syncBlockMW) / m.t2S <= m.rampMWs + 1e-9, m.id + ' T2 faster than ramp');
    if (m.t4S > 0) assert.ok((m.minMW - m.breakerOpenMW) / m.t4S <= m.rampMWs + 1e-9, m.id + ' T4 faster than ramp');
  }
  // The largest single machine is a credible contingency within the NEM's 700-800 MW (F-13).
  assert.ok(Math.max(...V.MACHINES.map(m => m.ratingMW)) <= 800);
  assert.ok(V.TIE_MAX_MW <= 800 && V.SMELTER_MW <= 800);
});

test('F-13 / H-8 / H-6 / H-12 key values', () => {
  assert.equal(V.LOAD_RELIEF, 0.5);
  assert.equal(V.GOV_DROOP, 0.05);
  assert.equal(V.GOV_DEADBAND_HZ, 0.015);
  assert.equal(V.GOV_CAP_FRAC, 0.12);
  assert.equal(V.BATT_PFR_FULL_HZ, 0.85);
  assert.equal(V.UFLS_FIRST_HZ, 49);
  assert.equal(V.UFLS_STEP_HZ, 0.125);
  assert.equal(V.UFLS_STAGES, 8);
  assert.equal(V.UFLS_DELAY_S, 0.3);
  assert.equal(V.PRICE_CAP, 23200);
  assert.equal(V.PRICE_FLOOR, -1000);
  assert.equal(V.VCR, 30000);
  assert.equal(V.RERT_COST, 16000);
  assert.deepEqual(V.CLASSES.coal.govDeadS + V.CLASSES.coal.govLagS, 5.5);
});

// Numeric literals in sim/*.js: only 0, 1, 2, 50, 60, or an integer alone in brackets (a[3]).
const ALLOWED = new Set([0, 1, 2, 50, 60]);
function literalProblems(file, src) {
  const toks = tokenize(src), bad = [];
  toks.forEach((t, k) => {
    if (t.type !== 'num' || ALLOWED.has(t.value)) return;
    const prev = toks[k - 1], next = toks[k + 1];
    if (prev && prev.text === '[' && next && next.text === ']' && Number.isInteger(t.value)) return;
    bad.push(file + ':' + t.line + ' ' + t.text);
  });
  return bad;
}

test('the literal scanner itself: flags constants, ignores comments, strings, templates, regexes, identifiers and indices', () => {
  const src = [
    '// 3.5 in a comment', '/* 1400 */', "const a = 'x 26 y', b = `t ${n} 99 ${m[3]} 7`;",
    'const re = /\\d{4}/g; const T1 = x2 + log10;', 'const ok = [0, 1, 2, 50, 60, 0x0, 1.0, 5e1]; const i = a[3];',
    'const bad1 = 0.02, bad2 = 3, bad3 = 1e-9, bad4 = x * 100; const arr = [3, 4];',
  ].join('\n');
  assert.deepEqual(literalProblems('t.js', src).map(s => s.split(' ')[1]), ['0.02', '3', '1e-9', '100', '3', '4']);
});

test('F-13: no numeric literal in sim/ outside params.js (allow 0, 1, 2, 50, 60 and array indices)', () => {
  const bad = [];
  for (const f of jsFiles(SIM)) {
    if (rel(f) === 'sim/params.js') continue;
    bad.push(...literalProblems(rel(f), readFileSync(f, 'utf8')));
  }
  assert.deepEqual(bad, []);
});

// content/scenarios.js: every object holding numbers has a src or a simplified note on
// itself or on an ancestor below the scenario root.
function hasNumbers(v) {
  return typeof v === 'number' || (Array.isArray(v) && v.some(hasNumbers));
}
function checkScenario(x, path, sourced, bad) {
  if (x === null || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y, i) => checkScenario(y, path + '[' + i + ']', sourced, bad)); return; }
  const own = (typeof x.src === 'string' && x.src.length > 0) || (x.simplified === true && typeof x.note === 'string');
  const here = sourced || own;
  for (const [k, v] of Object.entries(x)) {
    if (hasNumbers(v) && !here) bad.push(path + '.' + k + ': numbers without src or simplified');
    if (v && typeof v === 'object') checkScenario(v, path + '.' + k, here, bad);
  }
}

test('F-13: every scenario number carries a source or the simplified label', () => {
  const bad = [];
  for (const [id, scn] of Object.entries(SCENARIOS)) checkScenario(scn, id, false, bad);
  assert.deepEqual(bad, []);
});
