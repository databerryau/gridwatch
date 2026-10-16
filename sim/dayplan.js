// sim/dayplan.js: the event director, the day's designed plan (desk/README.md §32, Q-65).
//
// The event director: the day's designed plan ("director" stays the app's rate director). Imports
// `params.js`, `rng.js`, `clock.js` and `events.js` only, never `weather.js` (linted).
// `prerollRegime(seed, scn)` and `preroll(seed, scn, regime)` are called by `weather.prerollRegime`
// and `createState` when the scenario has a `dayplan` block (`desk`, `desk-weekend`); classic keeps
// the legacy `prerollRegime` and `prerollEvents` untouched. At stage A it was neutral (today's
// formula, the legacy menu). **Wave 1 (`plan`) made it the designed day**: every share, window and
// size from the scenario's dayplan block, the one climatology on a dayplan day (the one value read
// from elsewhere is the heat's clear sky, `scn.events.heat.clearMu`, desk/README.md §32.4.3).
//
// **`prerollRegime(seed, scn)`** (Q-66). `EXT_REGIME` a = 0 is the heat draw (u < `heatShare`) and
// a = 1 MILD or HOT as before, so every pinned seed keeps its day type; a = 2 picks the overlay among
// the non-heat days: storm if u2 < `stormShare` / (1 − `heatShare`), drought if u2 < (`stormShare` +
// `droughtShare`) / (1 − `heatShare`), else calm. So the shares are shares of all days: desk 15 / 25
// / 20 / 40. `cls` is `heat` | `storm` | `drought` | `calm`; `temp` as before.
//
// **`preroll(seed, scn, regime)`** returns §5's records sorted by (atS, `TYPE_ORDER`, the order made),
// ids `e1`... Each carries `act` (1, 2 or 3 as designed; 0 the notices) and `crisis`: the act's
// designed crisis (Act I's constraint, Act II's belly crisis, every record of Act III's, on a drought
// day its trip too); the restore task is Act I's but not its crisis. `contingency` from
// `CONTINGENCY_TYPES`; `warned` on every plan record but the trips and the notices (the smelter's
// return is announced at its trip).
//
// *Draws.* Four `EXT_EVENTS` slots from `DAYPLAN_SLOT_BASE`, in this order, each with its own counter:
// the constraint, the restore task, Act III, Act II. The task has its own slot, so its `p` (0 staged
// until grid's semantics merge, then 0.85) moves no other draw, and a gate always draws first, so the
// task's dates are exactly those with that draw under `p`. One helper picks uniformly over the whole
// steps of [a, b] (both ends in) that no open ban (lo, hi) holds. Briefing times (the derate's end,
// the late return, the clearances) and heat onsets sit on `DAYPLAN_MARK_S` 5-min marks (an ETR and a
// notice give round times); hazards in play and trips on whole minutes; the derate's limit on
// `DAYPLAN_MW_STEP` 50-MW steps; lockouts and the clear-after on whole minutes.
//
// *Act I* (Q-68). On `derateP` a `tieDerate {limitMW, untilS}` at 04:00 and its `tieDerateEnd`, else
// the late return, `unitOutage {unit, untilS}` and its `unitReturn`: its uniform is drawn here, but
// its time is picked last of all, one action from every other moment (*Moments*, below), so nothing
// else depends on which unit is late and the weekend keeps the weekday's weather, trips and task
// (`desk-weekend` differs only in Act I's late return, §32.4.3). The late unit must be off in the
// scenario's 04:00 commitment: `fleet.setOutage` throws in `createState` if it is not, so a data error
// is loud. On `task.p`: a suburb uniformly among those with two or more rotation districts (a
// district's suburb is its id less its digits), two distinct districts of it, and two clearances: the
// first uniform over the marks of `clearH`, the second over the marks at least `gapMin` from it, both
// one action from the derate's end (*Moments*), sorted (the first district drawn gets the earlier). `feederOut` at 04:00 and a `feederClear` at each.
//
// *Act III before Act II* (Q-66), so the belly's trip is drawn over what the evening leaves (Q-72).
// Heat: the onset on a mark in `onsetH`, the end min(onset + `lastsH`, `endByH`), `heatAnnounce` at
// 04:00 (uplift and derate per-mille from params, as the legacy menu), `heatOnset` and `heatEnd`.
// Storm: the arrival in `arriveH`, the cut-out start arrival + `cutoutAfterMin`, the pass min(arrival
// + `passAfterMin`, `passByH`); `stormWarn` carries the climatological cut-out window (arrival +
// `cutoutAfterMin`'s ends: what the forecast assumes, never the drawn start) and `passS`; the link
// trip on `linkTripP`, over the whole minutes from 31 real s after the cut-out start to before the
// pass that the rules leave, or none. Drought: the onset in `onsetH`, `droughtWarn {onsetS, muPm}`,
// `windDrought {windMu}` at the onset. Calm and drought: the evening trip of the largest machine over
// `act3.trip.windowH`.
//
// *Act II* (Q-67). The kind by `mix` (`heatMix` on a heat day); a trip (a unit, the smelter with its
// return `smelterOffMin` later, or the tie) over `act2.windowH`; with no feasible minute the front on a
// non-heat day, none on a heat day. Act II's windows are half-open at their end, `ACT_S[2]` (14:30,
// where the clock's Act III starts), so every Act II trip and front onset is in the clock's Act II (the
// badge, the stack's ticks and 2d's debrief agree with the record's `act`). The front: its onset over
// [max(`onsetH[0]`, the derate's end + `afterDerateMin`), `onsetH[1]`), not within 31 real s of a
// trip; `cloudWarn {onsetS, frontPm, roofDropMW}`, `cloudOnset {clearMu: frontMu, suburbs: true,
// clearS}`, `cloudClear {clearMu}` after `clearAfterMin`. The front's onset is its first suburb's (the
// lags are from it). Its set is never empty with today's windows (the test asserts one belly crisis on
// every non-heat day, so a tuning that empties it fails). `roofDropMW` (Q-79) is each suburb's rooftop
// fall at its own bottom, from scenario data and the warned onset only: Σ capacity × share ×
// clearFactor × cloudBite × (`cloud.mu` − `frontMu`) × the shape table at onset + lag + `frontRampMin`
// (linear between its points, as `weather.rooftopClearSkyMW`), rounded to `DAYPLAN_MW_STEP`. It is the
// most the front takes, so the text says "up to about": the clearing is hidden, and a front that
// clears inside the 55 min SAL takes to bottom out (clear-after 40-54 min, about a fifth of fronts)
// takes 0.78-0.99 of it; the sky the front finds is the climatology's `cloud.mu` (0.95; the clamped
// sky averages 0.937).
//
// *Then the notices*, `dayplan.notices` at their hours (desk: MORNING_RAMP 05:50, DUCK 15:00; no
// TROUGH, nothing from 21:00).
//
// *An anniversary's incident* (W6, D-29: `dayplan.incident`, on content/anniversaries.js's variants only; no desk scenario has
// one, so no other day's plan changes and `SIM_VERSION` stands). After Act II, from a fifth slot, its records marked `incident`
// and unwarned: `early` a trip of the largest machine over `windowH` (Q-72's spacing and one action from every moment, as any
// trip); `follow` a second 'largest' trip `afterS` after the act's unit trip (a cascade: it keeps no spacing, by design);
// `towers` a `tieDerate` to `limitMW` until the day's end and a trip of the largest machine at one minute while the storm blows
// (from its arrival to its pass, Q-72's spacing from every trip, one action from every moment, but not 31 real s from the
// storm's onsets, which often leave no such minute: the storm is the cause).
//
// *Q-71.* A warning is at the latest whole minute with `stepReal(warn, onset)` ≥ `LEAD_REAL_S`:
// `floor(gridBefore(onset, LEAD_REAL_S) / 60) × 60`, exact (sim/clock.js). The floor of a GT's start +
// 2 grid-min never binds (the shortest lead is 65 grid-min), so it is a test, not code.
//
// *Q-72, by construction.* A trip is drawn over the minutes no ban holds: each warned onset so far
// (heat onset, storm arrival, cut-out start, drought onset) bans (`gridBefore`(x, 31), `stepAfter`(x,
// 31)) on the step profile, and each trip so far bans (min(`gridBefore`(x, 91), x − 3,600),
// max(`stepAfter`(x, 91), x + 3,600)); the front's onset keeps 31 real s from each trip. The extra
// second is Q-71's margin: the eased clock the player plays differs from the step profile by at most
// 0.6 s over a span (sim/clock.js), so the rules hold on both (without it, 3 of 4,000 days missed
// D-8(c) on the eased clock, by 0.12 s at most). Acts II and III hold one trip each at most, so two a
// day; the windows of the data keep them from 09:00 and before 21:00 (the guard test checks all five
// rules on 4,000 days, on `stepReal` and on `realBetween`).
//
// *Moments, one action apart.* A moment is a record that makes a card or asks a decision after
// 04:00: the derate's end, the late return, each clearance, each warning, each warned onset and each
// trip. Every time the plan picks after the derate keeps `PAR_ACTION_GAP_REAL_S` (3 real s, S-4's pace:
// one action at a time) from every moment picked before it, on the step profile, and a warned hazard
// keeps its warning so too (the onsets whose warning would fall inside a moment's ban (lo, hi) are
// inside (`stepAfter`(lo, 26), `stepAfter`(hi + 60, 26)), a slight superset). The late return is
// picked last, so it keeps one action from all of them. So CCGT 2's return never lands on a feeder's
// hand-back (it did within 2 real s on 9.4% of dates), the belly's trip never comes a second after
// the tie limit lifts, and a front's warning never rings with a hand-back. The guard checks every two
// moments of 4,000 days (without the rule: 1,176 pairs).
//
// *Measured* (`tests/dayplan.test.js`, 2,000 dates from 2026-01-01 with each date's scenario and desk
// seeds 1-2,000, the task live): classes 14.9 / 24.8 / 20.5 / 39.7% (dates) and 15.4 / 25.7 / 18.8 /
// 40.2% (seeds); leads storm 65-115, cloud 130-175, drought 65-123 grid-min; the task on 84.7%, the
// derate on 49.5%; Act II on non-heat days front 41.4, unit 24.6, smelter 19.0, tie 14.9% (no trip ever
// lacked a feasible minute), on heat days unit 40.5, smelter 31.6, tie 27.8%; non-heat belly trips by
// hour 09-14: 542 / 443 / 354 / 332 / 227 / 90 (median 11:01, 15.2 real s into the act; 10.2% before
// 09:24), heat days' 401 / 152 / 54 / 0 / 0 / 0 (median 09:35, 4.4 real s into the act; 36.9% before
// 09:24, 66.1% before 10:00: the 31 real s before a heat onset at 12:30-14:30 reach back to
// 09:16-11:55); evening trips 17-19: 719 / 963 / 702 (median 18:32); the storm's link trip on 25.1% of
// 1,009 storm days. For stage C (reported, not tuned here): no unwarned contingency all day on 31.3%
// of storm days (a front in Act II and no link trip); the longest stretch with no ringing card,
// 04:30-21:00, p10/p50/p90 real s: storm 57/77/100, drought 66/79/97, calm 94/113/143, heat
// 128/138/148, and nothing rings from 14:30 on 95.2% of heat days (the heat onset falls in the clock's
// Act II).

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

  // W6 (D-29): an anniversary's incident (content/anniversaries.js), on its variant's dayplan only. Its own slot, the last, so
  // every other draw is the date's own; before the late return, which keeps one action from it. Its records carry `incident`
  // (tools/daily-gen.js gates an anniversary only with them), and none is warned.
  const I = D.incident, incident = (...a) => { add(...a); Object.assign(list[list.length - 1], {warned: false, incident: true}); };
  if (I) {
    r = drawer();
    if (I.early) { // Loy Yang A3, 2017: the largest machine trips before dawn
      const x = I.early, t = trip(r(), toS(x.windowH[0]), toS(x.windowH[1]));
      if (t >= 0) incident(1, t, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), x.lockoutMin)});
    }
    if (I.follow) { // Callide C, 2021: the act's unit trip takes the next largest machine with it, afterS later
      const x = I.follow, e = list.find(y => y.act === x.act && y.type === 'unitTrip');
      if (e) incident(x.act, e.atS + x.afterS, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), x.lockoutMin)}), away(e.atS + x.afterS);
    }
    if (I.towers) { // the Moorabool towers, 2024: in the storm the lines come down: the tie limited, the largest machine trips
      const x = I.towers, at = list.find(y => y.type === 'stormArrive'), ps = list.find(y => y.type === 'stormPass');
      const t = at && ps ? when(r(), at.atS + MIN, ps.atS - 1, MIN, trs.map(y => ban(y, SP, V.SPACING_GRID_S))) : -1;
      if (t >= 0) {
        trs.push(t), away(t);
        incident(III, t, 'tieDerate', {limitMW: x.limitMW, untilS: V.DAY_S});
        incident(III, t, 'unitTrip', {rule: 'largest', lockoutS: mins(r(), x.lockoutMin)});
      }
    }
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
