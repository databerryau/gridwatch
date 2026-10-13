// sim/dayplan.js: the event director, the day's designed plan (desk/README.md §32, Q-65).
// Contract: sim/README.md §11 dayplan.js.

import {V} from './params.js';
import {STREAM, uniform, pickWith} from './rng.js';
import {stepAfter, gridBefore, actAt, ACT_S} from './clock.js';
import {TYPE_ORDER, CONTINGENCY_TYPES} from './events.js';

// + 1: Q-71's margin, so Q-72 holds on the eased clock too (Q-62)
const MIN = V.S_PER_MIN, MARK = V.DAYPLAN_MARK_S, PM = V.PER_MILLE, III = actAt(ACT_S[2]), LEAD = V.LEAD_REAL_S;
const OC = V.ONSET_CLEAR_REAL_S + 1, SP = V.SPACING_REAL_S + 1, GAP = V.PAR_ACTION_GAP_REAL_S, STEP = V.DAYPLAN_MW_STEP;
const toS = h => Math.round((h - V.DAY_START_H) * V.S_PER_H);
const lerp = (t, x) => { const i = t.findIndex(p => p[0] > x), a = t[i - 1], b = t[i];
  return i < 0 ? t[t.length - 1][1] : i ? a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) : t[0][1]; };

export function prerollRegime(seed, scn) {
  const w = scn.weather, h = w.heatShare, u = a => uniform(seed, STREAM.EXT_REGIME, a), x = u(2);
  const cls = u(0) < h ? 'heat' : x < w.stormShare / (1 - h) ? 'storm' : x < (w.stormShare + w.droughtShare) / (1 - h) ? 'drought' : 'calm';
  return {cls, temp: cls === 'heat' ? 'HEATWAVE' : u(1) < (w.mildShare || 0) / (1 - h) ? 'MILD' : 'HOT'};
}

// One of the whole steps of st s in [a, b] that no open ban (lo, hi) holds, by u; -1 if none (Q-72)
function pick(u, a, b, bans = [], st = MIN) {
  const ok = [], bs = bans.filter(x => x[1] > a && x[0] < b);
  for (let t = Math.ceil(a / st) * st; t <= b; t += st) if (bs.every(x => t <= x[0] || t >= x[1])) ok.push(t);
  return ok.length ? ok[Math.floor(u * ok.length)] : -1;
}
// Too near x: within r real s (step profile) or g grid s
const ban = (x, r, g = 0) => [Math.min(gridBefore(x, r), x - g), Math.max(stepAfter(x, r), x + g)];
// The onsets whose warning (Q-71) falls inside ban b: a slight superset
const late = b => b.map((y, i) => stepAfter(y + i * MIN, LEAD));

export function preroll(seed, scn, regime) {
  const D = scn.dayplan, a1 = D.act1, a2 = D.act2, a3 = D.act3, cls = regime.cls, list = [], ons = [], trs = [], mom = [];
  let slot = V.DAYPLAN_SLOT_BASE, free = 0;
  const drawer = () => { const a = slot++; let d = 0; return () => uniform(seed, STREAM.EXT_EVENTS, a, d++); };
  const add = (act, atS, type, args, crisis = true) => {
    const contingency = CONTINGENCY_TYPES.includes(type);
    list.push({id: '', atS, type, args, contingency, warned: act > 0 && !contingency, act, crisis, k: list.length});
  };
  const away = x => mom.push(ban(x, GAP)); // each moment so far (a card or a decision), one action wide (S-4)
  // A time in [a, b] away from every moment so far; a warned hazard's warning too
  const when = (u, a, b, st = MIN, bans = [], warned) => pick(u, a, b, mom.concat(warned ? mom.map(late) : [], bans), st);
  const win = (u, w, st, warned) => when(u, toS(w[0]), toS(w[1]), st, [], warned);
  const mins = (u, r) => pick(u, r[0] * MIN, r[1] * MIN);
  const warn = x => Math.floor(gridBefore(x, LEAD) / MIN) * MIN;
  const trip = (u, a, b) => {
    const t = when(u, a, b, MIN, ons.map(x => ban(x, OC)).concat(trs.map(x => ban(x, SP, V.SPACING_GRID_S))));
    if (t >= 0) trs.push(t), away(t);
    return t;
  };

  // Act I (Q-68): the constraint, then the restore task; a late return's time is picked last, away from everything
  let r = drawer(), out;
  if (r() < a1.derateP) {
    const x = a1.derate;
    free = win(r(), x.untilH, MARK);
    add(1, 0, 'tieDerate', {limitMW: pick(r(), x.limitMW[0], x.limitMW[1], [], STEP), untilS: free});
    add(1, free, 'tieDerateEnd', {});
    away(free);
  } else out = [r()];
  r = drawer();
  const tk = a1.task, rot = scn.city.rotation, g = tk.gapMin * MIN;
  if (r() < tk.p) {
    const ds = pickWith(r(), scn.city.suburbs.map(b => rot.filter(id => id.replace(/\d+$/, '') === b.id)).filter(y => y.length > 1));
    const d = pickWith(r(), ds), e = pickWith(r(), ds.filter(id => id !== d)), c = win(r(), tk.clearH, MARK);
    away(c);
    const c2 = when(r(), toS(tk.clearH[0]), toS(tk.clearH[1]), MARK, [[c - g, c + g]]), cs = [c, c2].sort((p, q) => p - q);
    away(c2);
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
    ons.push(on), away(on);
    const t = a3.trip, l = trip(r(), toS(t.windowH[0]), toS(t.windowH[1])); // Q-85: heat days keep the evening trip
    if (l >= 0) add(III, l, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), t.lockoutMin)});
  } else if (cls === 'storm') {
    const x = a3.storm, at = win(r(), x.arriveH, MIN, true), co = at + mins(r(), x.cutoutAfterMin);
    const passS = Math.min(at + x.passAfterMin * MIN, toS(x.passByH)), after = m => at + m * MIN;
    add(III, warn(at), 'stormWarn', {arriveS: at, cutoutFromS: after(x.cutoutAfterMin[0]), cutoutToS: after(x.cutoutAfterMin[1]), passS});
    add(III, at, 'stormArrive', {windMu: x.arriveMu});
    add(III, co, 'windCutout', {windMu: x.cutoutMu});
    add(III, passS, 'stormPass', {windMu: x.passMu});
    ons.push(at, co), [warn(at), at, co].forEach(away);
    const l = r() < x.linkTripP ? trip(r(), stepAfter(co, OC), passS - 1) : -1;
    if (l >= 0) add(III, l, 'linkTrip', {cause: 'storm', lockoutS: mins(r(), x.linkLockoutMin)});
  } else {
    if (cls === 'drought') {
      const x = a3.drought, on = win(r(), x.onsetH, MIN, true);
      add(III, warn(on), 'droughtWarn', {onsetS: on, muPm: Math.round(x.mu * PM)});
      add(III, on, 'windDrought', {windMu: x.mu});
      ons.push(on), away(warn(on)), away(on);
    }
    const x = a3.trip, l = trip(r(), toS(x.windowH[0]), toS(x.windowH[1]));
    if (l >= 0) add(III, l, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), x.lockoutMin)});
  }

  // Act II (Q-67), before ACT_S[2]: one belly crisis; a trip with no feasible minute becomes the front (none under a heatwave)
  r = drawer();
  const heat = cls === 'heat', mix = heat ? a2.heatMix : a2.mix, end = h => toS(h) - MIN;
  let kind = pickWith(r(), Object.keys(mix), k => mix[k]);
  if (kind !== 'front') {
    const at = trip(r(), toS(a2.windowH[0]), end(a2.windowH[1]));
    if (at < 0) kind = heat ? '' : 'front';
    else if (kind === 'unit') add(2, at, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), a2.unitLockoutMin)});
    else if (kind === 'tie') add(2, at, 'linkTrip', {cause: 'fault', lockoutS: mins(r(), a2.tieLockoutMin)});
    else {
      add(2, at, 'smelterTrip', {offS: a2.smelterOffMin * MIN});
      add(2, at + a2.smelterOffMin * MIN, 'smelterReturn', {});
    }
  }
  // Never empty with today's windows: tests/dayplan.test.js asserts one belly crisis on every non-heat day
  const fr = a2.front, on = kind === 'front' ? when(r(), Math.max(toS(fr.onsetH[0]), free && free + fr.afterDerateMin * MIN),
    end(fr.onsetH[1]), MIN, trs.map(y => ban(y, OC)), true) : -1;
  if (on >= 0) { // roofDropMW (Q-79): each suburb's fall at its own bottom, the most the front takes
    const R = scn.rooftop, clearS = on + mins(r(), fr.clearAfterMin);
    let f = 0;
    scn.city.suburbs.forEach((b, j) => { f += R.share[j] * lerp(R.shapePm, V.DAY_START_H + (on + (b.frontLagMin + fr.frontRampMin) * MIN) / V.S_PER_H); });
    const dropMW = f / PM * R.capacityMW * R.clearFactor * R.cloudBite * (R.cloud.mu - fr.frontMu);
    add(2, warn(on), 'cloudWarn', {onsetS: on, frontPm: Math.round(fr.frontMu * PM), roofDropMW: Math.round(dropMW / STEP) * STEP});
    add(2, on, 'cloudOnset', {clearMu: fr.frontMu, suburbs: true, clearS});
    add(2, clearS, 'cloudClear', {clearMu: fr.clearMu});
    away(warn(on)), away(on);
  }

  if (out) {
    const x = a1.late, untilS = win(out[0], x.untilH, MARK);
    add(1, 0, 'unitOutage', {unit: x.unit, untilS});
    add(1, untilS, 'unitReturn', {unit: x.unit});
  }
  for (const n of D.notices) add(0, toS(n.atH), 'notice', {code: n.code}, false);
  const ord = e => TYPE_ORDER.indexOf(e.type);
  list.sort((p, q) => p.atS - q.atS || ord(p) - ord(q) || p.k - q.k);
  list.forEach((e, i) => { e.id = 'e' + (i + 1); delete e.k; });
  return list;
}
