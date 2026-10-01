// app/planview.js: the Live Stack's plan view (desk/README.md §7; SPEC L-1..L-9). Pure: it
// reads an observe() snapshot (and, for the past columns, the shell's history) and imports
// only sim/params.js. Nothing here changes the grid; the stack sends what snapDrop returns.
//
// project(obs, opts)            the next 4.5 h per 5-min column: each layer's MW as the sim's
//                               plan executor will move it (desk/README §3.1), supply and gaps
// earliestArrival(obs, st, mw)  the earliest second a station can be at mw (L-4 ghost, L-6, L-9)
// glowSet(obs, gap)             control ids that can arrive by the gap's start (L-9, K-16)
// snapDrop(obs, st, atS, mw)    the inputs a drop sends, on the 15-min / 50-MW grid, or the
//                               earliest-arrival ghost when the drop is infeasible (L-4)
// snapStart(obs, unit, onAtS)   the same for dragging an off unit's ghost (a booked START)
// firstGap(proj)                the first red run ahead (the gap a trip opened, K-16)
//
// The projection is a 5-s step simulation of the executor rule, so ramps, T1/auto-sync/T2
// starts, the unload + T4 stop profile, min up/down, clamps and the arrive-by lead all match
// the sim to within one step; AGC trims, governors and heat derate changes are left out (the
// stack draws the plan, not the seconds). Where the executor's contract is loose the choice is
// named in a comment; stage C checks the projection against a stepped sim.

import {V} from '../sim/params.js';

const M = V.MACHINES, SIDS = V.STATION_IDS, NS = SIDS.length;
export const COL_S = V.FC_STEP_S;
export const N_FUTURE = Math.round(V.FC_HORIZON_S / V.FC_STEP_S);
export const N_PAST = 6;
export const SNAP_S = 900;
export const SNAP_MW = 50;
const DT = 10; // executor step (s): key application and transitions land within one step of the sim's
const AUTO = V.AUTO_SYNC_S;
const S_PER_H = V.S_PER_H, EPS = 1e-6;
const TIE_RATE = V.TIE_RAMP_MW_MIN / V.S_PER_MIN;
const RERT_RATE = V.RERT_RAMP_MW_MIN / V.S_PER_MIN;
const DR_RATE = V.DR_RAMP_MW_MIN / V.S_PER_MIN;
const BATT_RATE = V.BATT_DISPATCH_RAMP_MW_S;

/** The desk control that drives each station (desk/README §5 ids). */
export const STATION_CONTROL = Object.freeze({
  coal: 'lever-coal', ccgt: 'lever-ccgt', gta: 'lever-gta', gtb: 'lever-gtb', gtc: 'lever-gtc', hydro: 'wheel-hydro',
});
/** Layer ids that are not stations, with the control each maps to (null: none). */
export const OTHER_CONTROL = Object.freeze({
  wind: null, solar: null, tie: 'knob-tie', battery: 'dial-battery', rert: 'key-rert', dr: 'btn-dr',
});

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const machinesOf = id => M.filter(m => m.station === id);
const startToMin = m => m.t1S + AUTO + m.t2S;
const snapT = t => Math.round(t / SNAP_S) * SNAP_S;
const ceilT = t => Math.ceil(t / SNAP_S - EPS) * SNAP_S;
const snapMW = x => Math.round(x / SNAP_MW) * SNAP_MW;

/** Water value ($/MWh) at a storage fraction (P-6, HYDRO_WATER_VALUE interpolated). */
export function waterValue(frac) {
  const T = V.HYDRO_WATER_VALUE;
  if (!(frac > T[0][0])) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (frac <= T[i][0]) {
      const a = T[i - 1], b = T[i];
      return a[1] + (b[1] - a[1]) * (frac - a[0]) / (b[0] - a[0]);
    }
  }
  return T[T.length - 1][1];
}

/** Grid second at which unit u (an obs.units row) could first be 'on' at MIN if started now; Infinity if never. */
function earliestOnAt(obs, u, m) {
  const s = obs.s;
  switch (u.mode) {
    case 'on': return s;
    case 'loading': return s + u.timerS;
    case 'ready': return s + u.timerS + m.t2S;
    case 'starting': return s + u.timerS + AUTO + m.t2S;
    case 'tripped': return s + u.timerS + startToMin(m);
    case 'off': {
      const b = u.startBlock || '';
      let wait = 0;
      if (/water/.test(b)) return Infinity;
      if (/down/.test(b)) wait = Math.max(0, m.minDownS - (u.downForS || 0));
      return s + wait + startToMin(m);
    }
    default: return Infinity; // unloading / shutdown: must finish stopping, then min down
  }
}

/** The earliest-start line of each unit (L-4): {unit: grid second the unit could be on at MIN}. */
export function earliestLines(obs) {
  const out = {};
  obs.units.forEach((u, i) => { out[u.id] = earliestOnAt(obs, u, M[i]); });
  return out;
}

const committed = mode => mode === 'on' || mode === 'loading' || mode === 'ready' || mode === 'starting';

// ------------------------------------------------------------------ the executor, stepped

function simInit(obs) {
  const s = obs.s;
  const plan = obs.plan || {stations: [], tie: {doneS: -1, keys: []}, starts: [], stops: []};
  const mach = obs.units.map((u, i) => {
    const m = M[i];
    const x = {m, i, id: u.id, st: SIDS.indexOf(m.station), mode: u.mode, avail: u.availMW ?? m.ratingMW,
      base: u.mode === 'on' ? u.basePointMW : 0, out: 0, tEnd: s + (u.timerS || 0), from: 0, t0: s,
      upSince: u.sync ? s - (u.upForS || 0) : -Infinity, downSince: s - (u.downForS || 0), block: u.startBlock || '',
      closeAt: -1};
    if (u.mode === 'on') x.out = clamp(u.schedMW - (u.agcTrimMW || 0), 0, x.avail);
    else if (u.sync) x.out = u.schedMW;
    if (u.mode === 'loading') { x.from = u.schedMW; x.t0 = s; }
    if (u.mode === 'shutdown') { x.from = u.schedMW; x.t0 = s; }
    return x;
  });
  const sts = SIDS.map((id, j) => {
    const p = plan.stations.find(q => q.id === id) || {man: false, doneS: -1, clampedMW: 0, keys: []};
    const ms = mach.filter(x => x.st === j);
    const lastKey = p.keys.find(k => k.atS === p.doneS);
    return {id, j, man: !!p.man, doneS: p.doneS, clamped: p.clampedMW || 0, lastReq: lastKey ? lastKey.mw : 0,
      keys: p.keys.slice().sort((a, b) => a.atS - b.atS), ki: 0, mach: ms,
      onCount: ms.filter(x => x.mode === 'on').length, limited: false};
  });
  const starts = plan.starts.map(e => ({unit: e.unit, atS: e.atS, done: false}));
  const stops = plan.stops.map(e => ({unit: e.unit, atS: e.atS, done: false}));
  const t = obs.tie;
  const tie = {set: t.setMW, flow: t.flowMW, tripped: t.tripped, until: s + (t.lockoutS || 0),
    doneS: plan.tie ? plan.tie.doneS : -1, keys: plan.tie ? plan.tie.keys.slice() : [], importLim: t.importLimitMW ?? V.TIE_MAX_MW};
  const b = obs.battery;
  const cap = V.BATT_MW - (b.guardMW || 0);
  const order = clamp(b.mode === 'discharge' ? b.orderMW : b.mode === 'charge' ? -b.orderMW : 0, -cap, cap);
  const batt = {order, out: b.schedMW ?? b.outMW, soc: b.socMWh, cap: b.capMWh ?? V.BATT_MWH, limited: false};
  const r = obs.rert;
  const rert = {armed: r.armed, arriveAt: s + (r.leadS || 0), down: r.standingDown, out: r.outMW};
  const dr = {until: s + (obs.dr.activeS || 0), mw: obs.dr.mw};
  const hydro = {store: obs.hydro.storageMWh};
  return {mach, sts, starts, stops, tie, batt, rert, dr, hydro, man: obs.mode === 'HAND'};
}

function applyKey(S, st, mw, atS) {
  const ms = st.mach;
  // A 0-MW key takes the lever to its floor (every 'on' machine at MIN); stops are separate
  // bookings in obs.plan.stops (the sim's executor, sim/README.md §12 Phase 1a deviation 1).
  if (mw === 0) {
    for (const x of ms) if (x.mode === 'on') x.base = x.m.minMW;
    st.clamped = 0; st.lastReq = 0;
    return;
  }
  st.lastReq = mw;
  let c = 0, lo = 0, hi = Infinity;
  for (const x of ms) if (x.mode === 'on') { c++; lo = x.m.minMW; if (x.avail < hi) hi = x.avail; }
  if (!c) { st.clamped = mw; return; }
  const share = clamp(mw / c, lo, hi);
  for (const x of ms) if (x.mode === 'on') x.base = share;
  st.clamped = Math.max(0, mw - share * c);
}

function stepStations(S, t) {
  for (const st of S.sts) {
    let c = 0;
    for (const x of st.mach) if (x.mode === 'on') c++;
    if (c > st.onCount && st.clamped > EPS && st.lastReq > 0) applyKey(S, st, st.lastReq, t);
    st.onCount = c;
    if (st.man) continue;
    // next = the first key with atS > doneS (desk/README §3.1)
    while (st.ki < st.keys.length && !(st.keys[st.ki].atS > st.doneS)) st.ki++;
    if (st.ki >= st.keys.length) continue;
    const key = st.keys[st.ki];
    let lever = 0, R = 0;
    for (const x of st.mach) if (x.mode === 'on') { lever += x.base; R += x.m.rampMWs; }
    const lead = R > 0 ? Math.abs(key.mw - lever) / R : 0;
    if (t + lead >= key.atS - EPS || key.atS <= t) { applyKey(S, st, key.mw, key.atS); st.doneS = key.atS; }
  }
}

function doStart(S, x, t) {
  if (x.mode !== 'off') return;
  if (x.m.station === 'hydro' && S.hydro.store <= V.HYDRO_STOP_MWH + EPS) return;
  if (x.downWhyStop && t - x.downSince < x.m.minDownS) return;
  if (/down/.test(x.block) && t - x.downSince < x.m.minDownS) return;
  x.mode = 'starting'; x.tEnd = t + x.m.t1S;
}

function doStop(S, x, t) {
  if (x.mode === 'starting' || x.mode === 'ready') { x.mode = 'off'; x.out = 0; return; }
  if (x.mode !== 'on' && x.mode !== 'loading') return;
  if (t - x.upSince < x.m.minUpS - EPS) return; // refused (min up): the executor drops it
  x.mode = 'unloading'; x.base = 0;
}

function stepMachine(S, x, t) {
  const m = x.m;
  switch (x.mode) {
    case 'tripped': if (t >= x.tEnd) { x.mode = 'off'; x.block = ''; x.downSince = -Infinity; } break;
    case 'starting': if (t >= x.tEnd) { x.mode = 'ready'; x.tEnd = t + AUTO; } break;
    case 'ready':
      if (t >= x.tEnd) {
        x.mode = 'loading'; x.out = V.SYNC_BLOCK_FRAC * m.ratingMW; x.from = x.out; x.t0 = t; x.tEnd = t + m.t2S; x.upSince = t;
        if (m.t2S <= 0) { x.mode = 'on'; x.base = m.minMW; }
      }
      break;
    case 'loading':
      if (t >= x.tEnd) { x.mode = 'on'; x.base = m.minMW; x.out = m.minMW; }
      else x.out = x.from + (m.minMW - x.from) * clamp((t - x.t0) / Math.max(1, x.tEnd - x.t0), 0, 1);
      break;
    case 'on': {
      const target = clamp(x.base, m.minMW, x.avail), d = m.rampMWs * DT;
      x.out = x.out < target ? Math.min(target, x.out + d) : Math.max(target, x.out - d);
      break;
    }
    case 'unloading':
      x.out = Math.max(m.minMW, x.out - m.rampMWs * DT);
      if (x.out <= m.minMW + EPS) {
        x.mode = 'shutdown'; x.from = x.out; x.t0 = t; x.tEnd = t + m.t4S;
        if (m.t4S <= 0) { x.mode = 'off'; x.out = 0; x.downSince = t; x.downWhyStop = true; }
      }
      break;
    case 'shutdown': {
      const end = V.BREAKER_OPEN_FRAC * m.ratingMW;
      if (t >= x.tEnd) { x.mode = 'off'; x.out = 0; x.downSince = t; x.downWhyStop = true; }
      else x.out = x.from + (Math.min(end, x.from) - x.from) * clamp((t - x.t0) / Math.max(1, x.tEnd - x.t0), 0, 1);
      break;
    }
    default: x.out = 0;
  }
}

function colTimes(fc) {
  const t = new Float64Array(N_FUTURE);
  for (let k = 0; k < N_FUTURE; k++) t[k] = fc.fromS + (k + 1) * COL_S;
  return t;
}

/**
 * Project the plan (L-1..L-5). Future column k is the 5-min interval ending at
 * `times[k] = forecast.fromS + (k + 1) x 300` and holds the value at that time (the forecast's
 * own convention); past column p (0..5) ends at `pastTimes[p]` and is filled from `opts.hist`
 * (the shell's history, see livestack.js) or left NaN.
 * @param {object} obs observe() output (with obs.plan)
 * @param {{hist?: object}} [opts]
 * @returns {object} {s, fromS, times, pastTimes, p50, p10, p90, layers[], stations{}, units{},
 *   supply, load, deficit, gap[], earliest{}, blue[]}; see the README-style notes inline.
 */
export function project(obs, opts = {}) {
  const fc = obs.forecast, s = obs.s, times = colTimes(fc);
  const n = N_FUTURE;
  const S = simInit(obs);
  S.t0 = s;
  const unitsOut = {}, stationsOut = {};
  for (const x of S.mach) unitsOut[x.id] = new Float64Array(n);
  for (const id of SIDS) stationsOut[id] = {mw: new Float64Array(n), lever: new Float64Array(n), onCount: new Uint8Array(n), limited: new Uint8Array(n)};
  const tieOut = new Float64Array(n), battOut = new Float64Array(n), battLim = new Uint8Array(n);
  const rertOut = new Float64Array(n), drOut = new Float64Array(n);
  const hydroJ = SIDS.indexOf('hydro');
  let k = 0;
  const expLimAt = t => {
    const kk = clamp(Math.floor((t - fc.fromS) / COL_S), 0, n - 1);
    return fc.exportLimitMW ? fc.exportLimitMW[kk] : V.TIE_MAX_MW;
  };
  for (let t = s; k < n; t += DT) {
    // booked starts / stops due (same code path as the inputs: refused ones are dropped)
    for (const e of S.stops) if (!e.done && e.atS <= t) { e.done = true; const x = S.mach.find(q => q.id === e.unit); if (x) doStop(S, x, t); }
    for (const e of S.starts) if (!e.done && e.atS <= t) { e.done = true; const x = S.mach.find(q => q.id === e.unit); if (x) doStart(S, x, t); }
    stepStations(S, t);
    // hydro out of water: the station unloads at its ramp (HYDRO_STOP_MWH)
    const hst = S.sts[hydroJ];
    if (S.hydro.store <= V.HYDRO_STOP_MWH + EPS) {
      hst.limited = true;
      for (const x of S.mach) if (x.st === hydroJ && x.mode === 'on') x.base = 0;
    }
    for (const x of S.mach) stepMachine(S, x, t);
    let hydroMW = 0;
    for (const x of S.mach) if (x.st === hydroJ) hydroMW += x.out;
    S.hydro.store = Math.max(0, S.hydro.store - hydroMW * DT / S_PER_H);
    // tie: arrive-by keys at TIE_RAMP, flow toward the clamped setpoint
    const T = S.tie;
    let tk = null;
    for (const q of T.keys) if (q.atS > T.doneS) { tk = q; break; }
    if (tk && (t + Math.abs(tk.mw - T.set) / TIE_RATE >= tk.atS - EPS || tk.atS <= t)) { T.set = tk.mw; T.doneS = tk.atS; }
    if (T.tripped && t >= T.until) T.tripped = false;
    const tieTarget = T.tripped ? 0 : clamp(T.set, -expLimAt(t), T.importLim);
    if (T.tripped) T.flow = 0;
    else T.flow = T.flow < tieTarget ? Math.min(tieTarget, T.flow + TIE_RATE * DT) : Math.max(tieTarget, T.flow - TIE_RATE * DT);
    // battery: the present order held, stopped by its energy
    const B = S.batt;
    let want = B.order;
    if (want > 0 && B.soc <= EPS) { want = 0; B.limited = true; }
    if (want < 0 && B.soc >= B.cap - V.BATT_FULL_EPS_MWH) { want = 0; B.limited = true; }
    B.out = B.out < want ? Math.min(want, B.out + BATT_RATE * DT) : Math.max(want, B.out - BATT_RATE * DT);
    B.soc = clamp(B.soc - (B.out > 0 ? B.out : B.out * V.BATT_CHARGE_EFF) * DT / S_PER_H, 0, B.cap);
    // RERT and DR
    const Rr = S.rert;
    const rWant = Rr.armed && !Rr.down && t >= Rr.arriveAt ? V.RERT_MW : 0;
    Rr.out = Rr.out < rWant ? Math.min(rWant, Rr.out + RERT_RATE * DT) : Math.max(rWant, Rr.out - RERT_RATE * DT);
    const dWant = t < S.dr.until ? V.DR_MW : 0;
    S.dr.mw = S.dr.mw < dWant ? Math.min(dWant, S.dr.mw + DR_RATE * DT) : Math.max(dWant, S.dr.mw - DR_RATE * DT);
    // sample at column ends
    while (k < n && t >= times[k] - EPS) {
      for (const x of S.mach) unitsOut[x.id][k] = x.out;
      for (const st of S.sts) {
        const so = stationsOut[st.id];
        let mw = 0, lever = 0, c = 0;
        for (const x of st.mach) { mw += x.out; if (x.mode === 'on') { lever += x.base; c++; } }
        so.mw[k] = mw; so.lever[k] = lever; so.onCount[k] = c; so.limited[k] = st.limited ? 1 : 0;
      }
      tieOut[k] = T.flow; battOut[k] = B.out; battLim[k] = B.limited ? 1 : 0; rertOut[k] = Rr.out; drOut[k] = S.dr.mw;
      k++;
    }
  }
  // layers in P-6 cost order (L-3): wind and solar at the bottom, then offers
  const windLim = (obs.wind.limitPct ?? 100) / 100, solarLim = (obs.solar.limitPct ?? 100) / 100;
  const wind = new Float64Array(n), solar = new Float64Array(n), windAv = new Float64Array(n), solarAv = new Float64Array(n);
  const tieImp = new Float64Array(n), tieExp = new Float64Array(n), battDis = new Float64Array(n), battChg = new Float64Array(n);
  for (let q = 0; q < n; q++) {
    windAv[q] = fc.windMW[q]; solarAv[q] = fc.solarMW[q];
    wind[q] = fc.windMW[q] * windLim; solar[q] = fc.solarMW[q] * solarLim;
    tieImp[q] = Math.max(0, tieOut[q]); tieExp[q] = Math.max(0, -tieOut[q]);
    battDis[q] = Math.max(0, battOut[q]); battChg[q] = Math.max(0, -battOut[q]);
  }
  const wv = waterValue(obs.hydro.frac ?? obs.hydro.storageMWh / V.HYDRO_ALLOCATION_MWH);
  const layers = [];
  layers.push({id: 'wind', kind: 'ren', offer: V.RENEWABLE_OFFER, mw: wind, availMW: windAv, rank: 0});
  layers.push({id: 'solar', kind: 'ren', offer: V.RENEWABLE_OFFER, mw: solar, availMW: solarAv, rank: 1});
  const disp = SIDS.map(id => ({id, kind: 'station', offer: id === 'hydro' ? wv : V.STATIONS[id].offer, mw: stationsOut[id].mw,
    lever: stationsOut[id].lever, limited: stationsOut[id].limited}));
  disp.push({id: 'tie', kind: 'tie', offer: obs.tie.neighbourPrice ?? fc.neighbourPrice[0], mw: tieImp});
  disp.sort((a, b) => a.offer - b.offer || (a.id < b.id ? -1 : 1));
  layers.push(...disp);
  layers.push({id: 'dr', kind: 'dr', offer: V.DR_PRICE, mw: drOut});
  layers.push({id: 'battery', kind: 'battery', offer: V.DR_PRICE + 1, mw: battDis, limited: battLim});
  layers.push({id: 'rert', kind: 'rert', offer: V.RERT_COST, mw: rertOut});
  layers.forEach((L, r) => { L.rank = r; });
  // supply, load and gaps (L-5)
  const supply = new Float64Array(n), load = new Float64Array(n), deficit = new Float64Array(n), gap = new Array(n), blue = new Uint8Array(n);
  for (let q = 0; q < n; q++) {
    let sup = 0;
    for (const L of layers) sup += L.mw[q];
    supply[q] = sup - tieExp[q] - battChg[q]; // net of exports and charging (drawn as extra load)
    load[q] = fc.demandP50[q];
    deficit[q] = fc.demandP50[q] - supply[q];
    gap[q] = supply[q] < fc.demandP50[q] - 0.5 ? 'red' : supply[q] < fc.demandP90[q] - 0.5 ? 'amber' : '';
    // blue (Phase 2 display): committed minimum + uncurtailed renewables + imports above P10
    let floor = wind[q] + solar[q] + tieImp[q];
    for (const id of SIDS) floor += stationsOut[id].onCount[q] * V.STATIONS[id].minMW;
    blue[q] = floor > fc.demandP10[q] ? 1 : 0;
  }
  const pastTimes = new Float64Array(N_PAST);
  for (let p = 0; p < N_PAST; p++) pastTimes[p] = fc.fromS - (N_PAST - 1 - p) * COL_S;
  const past = pastFromHist(opts.hist, pastTimes);
  return {
    s, fromS: fc.fromS, times, pastTimes, past, n,
    p50: fc.demandP50, p10: fc.demandP10, p90: fc.demandP90,
    layers, stations: stationsOut, units: unitsOut, tie: tieOut, battery: battOut,
    exports: tieExp, charging: battChg, supply, load, deficit, gap, blue,
    earliest: earliestLines(obs),
    now: nowEdge(obs),
  };
}

/** Each layer's MW now (the layers' now-edges; a station's is Σ base-tracking output, L-6). */
export function nowEdge(obs) {
  const out = {wind: obs.wind.outMW, solar: obs.solar.outMW, tie: Math.max(0, obs.tie.flowMW), dr: obs.dr.mw,
    battery: Math.max(0, obs.battery.outMW), rert: obs.rert.outMW, exports: Math.max(0, -obs.tie.flowMW), charging: Math.max(0, -obs.battery.outMW)};
  for (const id of SIDS) out[id] = 0;
  for (const u of obs.units) if (u.sync) out[u.station] += u.mode === 'on' ? Math.max(0, u.schedMW - (u.agcTrimMW || 0)) : u.schedMW;
  return out;
}

/**
 * Past columns from the shell's history. Shape (desk/README §5 `hist`): `{demand: [{s, mw}],
 * stations: {<layer id>: [{s, mw}]}}` where layer ids are the station ids plus wind, solar,
 * tie (signed, + import), battery (signed, + discharge), rert, dr. Each past column takes the
 * last record at or before its end time and after its start; NaN where there is none.
 */
export function pastFromHist(hist, pastTimes) {
  const out = {demand: new Float64Array(N_PAST).fill(NaN), layers: {}};
  if (!hist) return out;
  // app/game.js's form: per id, an array of column means; column c covers
  // [colFromS + c * colS, colFromS + (c + 1) * colS) and lands on the past column ending there.
  const cols = Number.isFinite(hist.colFromS) && hist.colS > 0;
  const pick = (arr, dst) => {
    if (!Array.isArray(arr)) return;
    if (cols && (arr.length === 0 || typeof arr[0] === 'number')) {
      for (let p = 0; p < N_PAST; p++) {
        const c = Math.round((pastTimes[p] - hist.colFromS) / hist.colS) - 1;
        if (c >= 0 && c < arr.length && Number.isFinite(arr[c])) dst[p] = arr[c];
      }
      return;
    }
    for (let p = 0; p < N_PAST; p++) {
      const hi = pastTimes[p], lo = hi - COL_S;
      for (let i = arr.length - 1; i >= 0; i--) {
        const r = arr[i];
        if (!r || !(r.s <= hi)) continue;
        if (r.s > lo && Number.isFinite(r.mw)) dst[p] = r.mw;
        break;
      }
    }
  };
  pick(hist.demand, out.demand);
  for (const id of Object.keys(hist.stations || {})) {
    const dst = new Float64Array(N_PAST).fill(NaN);
    pick(hist.stations[id], dst);
    out.layers[id] = dst;
  }
  return out;
}

// ------------------------------------------------------------------ arrival, glow, snap

/**
 * The earliest grid second station `station` can be at `mw` (L-4 ghost, L-6, L-9), counting
 * from the lever now with the executor's arrive-by rule (lead = |Δ| / Σ ramp of 'on' machines).
 * Beyond the committed machines, the next machines by earliest on-time are added (committed,
 * booked, then startable off or locked-out ones): they join at MIN, then the station ramps with
 * every machine. mw = 0 is unload-to-MIN then STOP (not before minimum up time).
 * @returns {{atS:number, needsStart:string|null, starts:Array<{unit:string, onAtS:number}>, mw:number, reachable:boolean}}
 *   `mw` is the value it can actually reach (clamped to Σmin..Σavail of the machines used);
 *   `starts` lists every machine that must be booked (needsStart is the first); atS is
 *   Infinity when nothing can be started.
 */
export function earliestArrival(obs, station, mw) {
  const s = obs.s, units = obs.units.filter(u => u.station === station);
  const on = units.filter(u => u.mode === 'on');
  const R = on.reduce((a, u) => a + u.rampMWMin / V.S_PER_MIN, 0);
  const lever = on.reduce((a, u) => a + u.basePointMW, 0);
  const minOn = on.reduce((a, u) => a + u.minMW, 0), availOn = on.reduce((a, u) => a + u.availMW, 0);
  if (!(mw > 0)) {
    let t = s + (R > 0 ? Math.ceil(Math.max(0, lever - minOn) / R) : 0);
    for (const u of units) if (u.mode === 'on' || u.mode === 'loading') t = Math.max(t, s + Math.max(0, M[obs.units.indexOf(u)].minUpS - (u.upForS || 0)));
    return {atS: t, needsStart: null, starts: [], mw: 0, reachable: true};
  }
  if (on.length && mw <= availOn + EPS) {
    const eff = Math.max(mw, minOn);
    return {atS: s + Math.ceil(Math.abs(eff - lever) / R), needsStart: null, starts: [], mw: eff, reachable: true};
  }
  const booked = new Map(((obs.plan && obs.plan.starts) || []).map(e => [e.unit, e.atS]));
  const cands = [];
  for (const u of units) {
    if (u.mode === 'on') continue;
    const i = obs.units.indexOf(u), m = M[i];
    let at;
    if (booked.has(u.id) && u.mode === 'off') at = Math.max(booked.get(u.id) + startToMin(m), earliestOnAt(obs, u, m));
    else at = earliestOnAt(obs, u, m);
    if (!Number.isFinite(at)) continue;
    cands.push({u, m, at, needBook: (u.mode === 'off' || u.mode === 'tripped') && !booked.has(u.id)});
  }
  cands.sort((a, b) => a.at - b.at || a.m.k - b.m.k);
  let cap = availOn, used = [];
  for (const c of cands) {
    if (cap >= mw - EPS) break;
    used.push(c); cap += c.u.availMW;
  }
  if (!used.length) return {atS: Infinity, needsStart: null, starts: [], mw: Math.min(mw, availOn), reachable: false};
  const target = Math.min(mw, cap);
  const tOn = Math.max(s, ...used.map(c => c.at));
  const leverAt = lever + used.reduce((a, c) => a + c.m.minMW, 0);
  const Rall = R + used.reduce((a, c) => a + c.m.rampMWs, 0);
  const eff = Math.max(target, leverAt - lever + minOn);
  const atS = tOn + Math.ceil(Math.max(0, eff - leverAt) / Rall);
  const starts = used.filter(c => c.needBook).map(c => ({unit: c.u.id, onAtS: c.at}));
  return {atS, needsStart: starts.length ? starts[0].unit : null, starts, mw: eff, reachable: target >= mw - EPS};
}

/**
 * Everything that could help in a gap (L-9): for each candidate control, the earliest second
 * it can add one snap step (50 MW). Stations add 50 MW to the present lever (a start when no
 * headroom is left: the control is then that unit's START guard); the battery, the tie, DR and
 * the RERT diesel have their own lead times.
 * @returns {Array<{id:string, layer:string, atS:number, unit:string|null}>}
 */
export function glowCandidates(obs) {
  const s = obs.s, out = [];
  for (const id of SIDS) {
    const st = obs.stations.find(q => q.id === id);
    if (!st) continue;
    const a = earliestArrival(obs, id, st.basePointMW + SNAP_MW);
    if (!Number.isFinite(a.atS) || a.mw <= st.basePointMW + EPS) continue;
    out.push({id: a.needsStart ? 'guard-start-' + a.needsStart : STATION_CONTROL[id], layer: id, atS: a.atS, unit: a.needsStart});
  }
  const b = obs.battery, bCap = V.BATT_MW - (b.guardMW || 0);
  const bNow = b.mode === 'discharge' ? b.orderMW : b.mode === 'charge' ? -b.orderMW : 0;
  if (bCap - bNow >= SNAP_MW && b.socMWh > SNAP_MW * V.BATT_R5_SUSTAIN_H) out.push({id: 'dial-battery', layer: 'battery', atS: s + Math.ceil(SNAP_MW / BATT_RATE), unit: null});
  const t = obs.tie, tLim = t.importLimitMW ?? V.TIE_MAX_MW;
  if (t.setMW <= tLim - SNAP_MW) out.push({id: 'knob-tie', layer: 'tie', atS: (t.tripped ? s + (t.lockoutS || 0) : s) + Math.ceil(SNAP_MW / TIE_RATE), unit: null});
  if (obs.dr.callsLeft > 0 && !(obs.dr.activeS > 0)) out.push({id: 'btn-dr', layer: 'dr', atS: s + Math.ceil(SNAP_MW / DR_RATE), unit: null});
  if (!obs.rert.armed) out.push({id: 'key-rert', layer: 'rert', atS: s + V.RERT_LEAD_S + Math.ceil(SNAP_MW / RERT_RATE), unit: null});
  return out;
}

/**
 * L-9: the control ids whose earliest arrival is at or before the gap's start.
 * @param {object} obs
 * @param {{atS:number}} gap e.g. firstGap(project(obs)) or a hovered red run
 * @returns {string[]} sorted
 */
export function glowSet(obs, gap) {
  if (!gap) return [];
  return glowCandidates(obs).filter(c => c.atS <= gap.atS).map(c => c.id).sort();
}

/** The layers (station / other ids) behind a glow set, for the stack's own highlight. */
export function glowLayers(obs, gap) {
  if (!gap) return [];
  return [...new Set(glowCandidates(obs).filter(c => c.atS <= gap.atS).map(c => c.layer))];
}

/** Red runs ahead: [{atS (start of the first red column), endS, k0, k1, mw (largest deficit)}]. */
export function redRuns(proj) {
  const out = [];
  for (let k = 0; k < proj.n; k++) {
    if (proj.gap[k] !== 'red') continue;
    const k0 = k;
    let mw = 0;
    while (k < proj.n && proj.gap[k] === 'red') { mw = Math.max(mw, proj.deficit[k]); k++; }
    // atS: the first moment the plan is measured short (a column's value is at its end time),
    // so a gap a trip opens now starts one column ahead and the fast units still glow (K-16)
    out.push({atS: proj.times[k0], endS: proj.times[k - 1], k0, k1: k - 1, mw});
  }
  return out;
}

/** The first red run ahead (K-16: the gap a trip opened), or null. */
export function firstGap(proj) {
  return redRuns(proj)[0] || null;
}

/** The red run containing future column k, or null. */
export function gapAt(proj, k) {
  return redRuns(proj).find(r => k >= r.k0 && k <= r.k1) || null;
}

function keysOf(obs, station) {
  const p = obs.plan && obs.plan.stations.find(q => q.id === station);
  return p ? p.keys : [];
}

/**
 * What a drop of station's edge at (atS, mw) sends (L-4): snapped to 15 min / 50 MW, then
 * checked against the earliest ramp-feasible time from the previous future key (or from the
 * lever now, starts included). Feasible: `{inputs, key}` where inputs are the planStart
 * bookings a start needs (each booked at its sync time minus its start time, as late as the
 * key allows) followed by the planKey. Infeasible: `{infeasible: true, ghost}` where the ghost
 * is the same drop moved to the first 15-min step at or after the earliest arrival (with its
 * own inputs), so the stack shows it instead of silently accepting (L-4 accept).
 * @returns {{station, atS, mw, earliestS, infeasible?:true, inputs?:object[], key?:object, ghost?:object, reason?:string}}
 */
export function snapDrop(obs, station, atS, mw) {
  const s = obs.s, st = obs.stations.find(q => q.id === station);
  const maxMW = machinesOf(station).reduce((a, m) => a + m.ratingMW, 0);
  let t = snapT(atS);
  if (t < s) t = ceilT(s);
  const w = clamp(snapMW(mw), 0, Math.floor(maxMW / SNAP_MW) * SNAP_MW);
  const base = {station, atS: t, mw: w};
  const arr = earliestArrival(obs, station, w);
  if (!Number.isFinite(arr.atS)) return Object.assign(base, {infeasible: true, earliestS: Infinity, ghost: null, reason: 'no machine can start'});
  let earliest = arr.atS;
  // from the previous future key: ramp-feasible from it at the station ramp by then
  const prev = keysOf(obs, station).filter(k => k.atS >= s && k.atS < t).pop();
  if (prev) {
    const units = obs.units.filter(u => u.station === station && (u.mode === 'on' || committed(u.mode)));
    const R = units.reduce((a, u) => a + u.rampMWMin / V.S_PER_MIN, 0) + arr.starts.reduce((a, c) => a + M[obs.units.findIndex(u => u.id === c.unit)].rampMWs, 0);
    if (R > 0) earliest = Math.max(earliest, prev.atS + Math.ceil(Math.abs(arr.mw - prev.mw) / R));
  }
  if (t >= earliest) return Object.assign(base, {earliestS: earliest, inputs: dropInputs(obs, station, t, w, arr), key: {type: 'planKey', station, atS: t, mw: w}});
  const g = ceilT(earliest);
  return Object.assign(base, {infeasible: true, earliestS: earliest,
    ghost: {atS: g, mw: w, inputs: dropInputs(obs, station, g, w, arr), key: {type: 'planKey', station, atS: g, mw: w}}});
}

function dropInputs(obs, station, atS, mw, arr) {
  const out = [];
  if (arr.starts.length) {
    // book each start as late as the key allows: on at MIN by atS minus the climb after it
    const units = obs.units.filter(u => u.station === station && u.mode === 'on');
    const R = units.reduce((a, u) => a + u.rampMWMin / V.S_PER_MIN, 0);
    const lever = units.reduce((a, u) => a + u.basePointMW, 0);
    const used = arr.starts.map(c => M[obs.units.findIndex(u => u.id === c.unit)]);
    const Rall = R + used.reduce((a, m) => a + m.rampMWs, 0);
    const leverAt = lever + used.reduce((a, m) => a + m.minMW, 0);
    const tOn = atS - Math.ceil(Math.max(0, arr.mw - leverAt) / Rall);
    for (const c of arr.starts) {
      const m = M[obs.units.findIndex(u => u.id === c.unit)];
      const at = Math.max(c.onAtS, tOn) - startToMin(m);
      out.push({type: 'planStart', unit: c.unit, atS: Math.max(obs.s, Math.round(at))});
    }
  }
  out.push({type: 'planKey', station, atS, mw});
  return out;
}

/**
 * Dragging an off unit's ghost (L-4): the unit reaches MIN at `onAtS` (snapped to 15 min);
 * START is booked at that sync time minus its start time. Before its earliest-start line the
 * drop is infeasible and the ghost sits on the first 15-min step after the line.
 * @returns {{unit, onAtS, earliestS, infeasible?:true, inputs?:object[], ghost?:object}}
 */
export function snapStart(obs, unit, onAtS) {
  const i = obs.units.findIndex(u => u.id === unit);
  const u = obs.units[i], m = M[i];
  const earliest = earliestOnAt(obs, u, m);
  let t = snapT(onAtS);
  if (t < obs.s) t = ceilT(obs.s);
  const mk = at => [{type: 'planStart', unit, atS: at - startToMin(m)}];
  if (!Number.isFinite(earliest)) return {unit, onAtS: t, earliestS: Infinity, infeasible: true, ghost: null};
  if (t >= earliest) return {unit, onAtS: t, earliestS: earliest, inputs: mk(t)};
  const g = ceilT(earliest);
  return {unit, onAtS: t, earliestS: earliest, infeasible: true, ghost: {onAtS: g, inputs: mk(g)}};
}

/** Layer tooltip facts (L-3 accept): MW now, ramp (MW/min), start time (min), cost ($/MWh). */
export function layerFacts(obs, id) {
  if (V.STATIONS[id]) {
    const st = V.STATIONS[id], on = obs.units.filter(u => u.station === id && u.sync).length;
    return {id, name: st.name, machines: st.machines, on, rampMWMin: st.rampMWMin * Math.max(1, on), startMin: (startToMin(machinesOf(id)[0])) / V.S_PER_MIN,
      offer: id === 'hydro' ? waterValue(obs.hydro.frac) : st.offer};
  }
  const other = {
    wind: {name: 'Wind', rampMWMin: null, startMin: 0, offer: V.RENEWABLE_OFFER},
    solar: {name: 'Utility solar', rampMWMin: null, startMin: 0, offer: V.RENEWABLE_OFFER},
    tie: {name: 'Tie line', rampMWMin: V.TIE_RAMP_MW_MIN, startMin: 0, offer: obs.tie.neighbourPrice},
    battery: {name: 'Battery', rampMWMin: V.BATT_DISPATCH_RAMP_MW_S * V.S_PER_MIN, startMin: 0, offer: null},
    rert: {name: 'Reserve diesel', rampMWMin: V.RERT_RAMP_MW_MIN, startMin: V.RERT_LEAD_S / V.S_PER_MIN, offer: V.RERT_COST},
    dr: {name: 'Demand response', rampMWMin: V.DR_RAMP_MW_MIN, startMin: 0, offer: V.DR_PRICE},
  }[id];
  return other ? Object.assign({id}, other) : null;
}
