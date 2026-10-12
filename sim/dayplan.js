// sim/dayplan.js: the event director, the day's designed plan (desk/README.md §32, Q-65).
// Contract: sim/README.md §11 dayplan.js.

import {V} from './params.js';
import {STREAM, uniform, pickWith} from './rng.js';
import {stepAfter, gridBefore, actAt, ACT_S} from './clock.js';
import {TYPE_ORDER, CONTINGENCY_TYPES} from './events.js';

const MIN = V.S_PER_MIN, MARK = V.DAYPLAN_MARK_S, PM = V.PER_MILLE, OC = V.ONSET_CLEAR_REAL_S, III = actAt(ACT_S[2]);
const toS = h => Math.round((h - V.DAY_START_H) * V.S_PER_H);

export function prerollRegime(seed, scn) {
  const w = scn.weather, h = w.heatShare, u = a => uniform(seed, STREAM.EXT_REGIME, a), x = u(2);
  const cls = u(0) < h ? 'heat' : x < w.stormShare / (1 - h) ? 'storm' : x < (w.stormShare + w.droughtShare) / (1 - h) ? 'drought' : 'calm';
  return {cls, temp: cls === 'heat' ? 'HEATWAVE' : u(1) < (w.mildShare || 0) / (1 - h) ? 'MILD' : 'HOT'};
}

// One of the whole steps of st s in [a, b] that no open ban (lo, hi) holds, by u; -1 if none (Q-72)
function pick(u, a, b, bans = [], st = MIN) {
  const ok = [];
  for (let t = Math.ceil(a / st) * st; t <= b; t += st) if (bans.every(([lo, hi]) => t <= lo || t >= hi)) ok.push(t);
  return ok.length ? ok[Math.floor(u * ok.length)] : -1;
}
// Too near x: within r real s (step profile) or g grid s
const ban = (x, r, g = 0) => [Math.min(gridBefore(x, r), x - g), Math.max(stepAfter(x, r), x + g)];

export function preroll(seed, scn, regime) {
  const D = scn.dayplan, a1 = D.act1, a2 = D.act2, a3 = D.act3, cls = regime.cls, list = [], ons = [], trs = [];
  let slot = V.DAYPLAN_SLOT_BASE, free = 0;
  const drawer = () => { const a = slot++; let d = 0; return () => uniform(seed, STREAM.EXT_EVENTS, a, d++); };
  const add = (act, atS, type, args, crisis = true) => {
    const contingency = CONTINGENCY_TYPES.includes(type);
    list.push({id: '', atS, type, args, contingency, warned: act > 0 && !contingency, act, crisis, k: list.length});
  };
  const win = (u, w, st) => pick(u, toS(w[0]), toS(w[1]), [], st);
  const mins = (u, r) => pick(u, r[0] * MIN, r[1] * MIN);
  const warn = x => Math.floor(gridBefore(x, V.LEAD_REAL_S) / MIN) * MIN;
  const trip = (u, a, b) => {
    const t = pick(u, a, b, ons.map(x => ban(x, OC)).concat(trs.map(x => ban(x, V.SPACING_REAL_S, V.SPACING_GRID_S))));
    if (t >= 0) trs.push(t);
    return t;
  };

  // Act I (Q-68): the constraint, then the restore task
  let r = drawer();
  if (r() < a1.derateP) {
    const x = a1.derate;
    free = win(r(), x.untilH, MARK);
    add(1, 0, 'tieDerate', {limitMW: pick(r(), x.limitMW[0], x.limitMW[1], [], 50), untilS: free}); // 50-MW steps
    add(1, free, 'tieDerateEnd', {});
  } else {
    const x = a1.late, untilS = win(r(), x.untilH, MARK);
    add(1, 0, 'unitOutage', {unit: x.unit, untilS});
    add(1, untilS, 'unitReturn', {unit: x.unit});
  }
  r = drawer();
  const tk = a1.task, rot = scn.city.rotation, g = tk.gapMin * MIN;
  if (r() < tk.p) {
    const ds = pickWith(r(), scn.city.suburbs.map(b => rot.filter(id => id.replace(/\d+$/, '') === b.id)).filter(y => y.length > 1));
    const d = pickWith(r(), ds), e = pickWith(r(), ds.filter(id => id !== d)), c = win(r(), tk.clearH, MARK);
    const cs = [c, pick(r(), toS(tk.clearH[0]), toS(tk.clearH[1]), [[c - g, c + g]], MARK)].sort((p, q) => p - q);
    add(1, 0, 'feederOut', {districts: [d, e], clearS: cs}, false);
    add(1, cs[0], 'feederClear', {district: d}, false);
    add(1, cs[1], 'feederClear', {district: e}, false);
  }

  // Act III (Q-66), before Act II so the belly's trip is drawn over what is left (Q-72)
  r = drawer();
  if (cls === 'heat') {
    const x = a3.heat, on = win(r(), x.onsetH, MARK), endS = Math.min(on + x.lastsH * V.S_PER_H, toS(x.endByH));
    add(III, 0, 'heatAnnounce', {onsetS: on, endS, upliftPm: Math.round(V.HEAT_DEMAND_UPLIFT * PM),
      deratePm: Math.round(V.HEAT_THERMAL_DERATE * PM)});
    add(III, on, 'heatOnset', {clearMuAtLeast: scn.events.heat.clearMu});
    add(III, endS, 'heatEnd', {});
    ons.push(on);
  } else if (cls === 'storm') {
    const x = a3.storm, at = win(r(), x.arriveH), co = at + mins(r(), x.cutoutAfterMin);
    const passS = Math.min(at + x.passAfterMin * MIN, toS(x.passByH)), after = m => at + m * MIN;
    add(III, warn(at), 'stormWarn', {arriveS: at, cutoutFromS: after(x.cutoutAfterMin[0]), cutoutToS: after(x.cutoutAfterMin[1]), passS});
    add(III, at, 'stormArrive', {windMu: x.arriveMu});
    add(III, co, 'windCutout', {windMu: x.cutoutMu});
    add(III, passS, 'stormPass', {windMu: x.passMu});
    ons.push(at, co);
    const l = r() < x.linkTripP ? trip(r(), stepAfter(co, OC), passS - 1) : -1;
    if (l >= 0) add(III, l, 'linkTrip', {cause: 'storm', lockoutS: mins(r(), x.linkLockoutMin)});
  } else {
    if (cls === 'drought') {
      const x = a3.drought, on = win(r(), x.onsetH);
      add(III, warn(on), 'droughtWarn', {onsetS: on, muPm: Math.round(x.mu * PM)});
      add(III, on, 'windDrought', {windMu: x.mu});
      ons.push(on);
    }
    const x = a3.trip, l = trip(r(), toS(x.windowH[0]), toS(x.windowH[1]));
    if (l >= 0) add(III, l, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), x.lockoutMin)});
  }

  // Act II (Q-67): one belly crisis; a trip with no feasible minute becomes the front (none under a heatwave)
  r = drawer();
  const heat = cls === 'heat', mix = heat ? a2.heatMix : a2.mix;
  let kind = pickWith(r(), Object.keys(mix), k => mix[k]);
  if (kind !== 'front') {
    const at = trip(r(), toS(a2.windowH[0]), toS(a2.windowH[1]));
    if (at < 0) kind = heat ? '' : 'front';
    else if (kind === 'unit') add(2, at, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), a2.unitLockoutMin)});
    else if (kind === 'tie') add(2, at, 'linkTrip', {cause: 'fault', lockoutS: mins(r(), a2.tieLockoutMin)});
    else {
      add(2, at, 'smelterTrip', {offS: a2.smelterOffMin * MIN});
      add(2, at + a2.smelterOffMin * MIN, 'smelterReturn', {});
    }
  }
  const fr = a2.front, on = kind === 'front' ?
    pick(r(), Math.max(toS(fr.onsetH[0]), free && free + fr.afterDerateMin * MIN), toS(fr.onsetH[1]), trs.map(y => ban(y, OC))) : -1;
  if (on >= 0) {
    // Q-79: each suburb's rooftop fall once the front is over it (lag + ramp), from scenario data and the onset only
    const R = scn.rooftop, clearS = on + mins(r(), fr.clearAfterMin);
    let f = 0;
    scn.city.suburbs.forEach((b, j) => {
      const h = V.DAY_START_H + (on + (b.frontLagMin + fr.frontRampMin) * MIN) / V.S_PER_H;
      f += R.share[j] * (R.shapePm.find(p => p[0] >= h) || [0, 0])[1] / PM;
    });
    const dropMW = f * R.capacityMW * R.clearFactor * R.cloudBite * (R.cloud.mu - fr.frontMu);
    add(2, warn(on), 'cloudWarn', {onsetS: on, frontPm: Math.round(fr.frontMu * PM), roofDropMW: Math.round(dropMW / 50) * 50});
    add(2, on, 'cloudOnset', {clearMu: fr.frontMu, suburbs: true, clearS});
    add(2, clearS, 'cloudClear', {clearMu: fr.clearMu});
  }

  for (const n of D.notices) add(0, toS(n.atH), 'notice', {code: n.code}, false);
  const ord = e => TYPE_ORDER.indexOf(e.type);
  list.sort((p, q) => p.atS - q.atS || ord(p) - ord(q) || p.k - q.k);
  list.forEach((e, i) => { e.id = 'e' + (i + 1); delete e.k; });
  return list;
}
