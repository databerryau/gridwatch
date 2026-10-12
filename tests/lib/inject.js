// tests/lib/inject.js: the one test-only way to put an event record on a seed's day (desk/README.md
// §32.3 "createState gains no test-only parameter", §32.5.2 step 5). The record goes into
// state.ext.events where the pre-roll would have put it, and ext is re-derived by the sim's own code
// (step.deriveExt), so the series, the rooftop skies and the heat window follow it.
import {createState, deriveExt, openDay} from '../../sim/step.js';
import {TYPE_ORDER, CONTINGENCY_TYPES} from '../../sim/events.js';
import {V} from '../../sim/params.js';

const TPS = V.TICKS_PER_S;
const ord = t => TYPE_ORDER.indexOf(t);

/**
 * Put rec ({atS, type, args} and any of id, contingency, warned, act, crisis) on state's day.
 * Refuses (throws) a record whose second has run (atS < ceil(tick / TPS)), an unknown type, a
 * heatAnnounce on a MILD day or a second one, and a contingency on a second that already has one
 * (prerollEvents never puts two on one second: a double trip is not credible). Inserts it after
 * evNext at its (atS, TYPE_ORDER) place (after records of the same second and type), re-derives
 * ext, and at tick 0 with atS 0 re-runs the opening (step.openDay), as createState would have.
 * Returns state.
 */
export function injectEvent(state, rec) {
  const evs = state.ext.events, now = Math.ceil(state.tick / TPS);
  if (ord(rec.type) < 0) throw new Error('injectEvent: unknown type ' + rec.type);
  if (!Number.isInteger(rec.atS) || rec.atS < now) throw new Error('injectEvent: second ' + rec.atS + ' has run (now ' + now + ')');
  if (rec.type === 'heatAnnounce' && (state.day.temp === 'MILD' || evs.some(e => e.type === 'heatAnnounce')))
    throw new Error('injectEvent: a heatAnnounce on a MILD day, or a second one');
  const e = {id: rec.id || 'inj' + (evs.length + 1), atS: rec.atS, type: rec.type, args: JSON.parse(JSON.stringify(rec.args || {})),
    contingency: rec.contingency ?? CONTINGENCY_TYPES.includes(rec.type), warned: rec.warned ?? false, act: rec.act ?? 0,
    crisis: rec.crisis ?? false};
  if (e.contingency && evs.some(x => x.contingency && x.atS === e.atS))
    throw new Error('injectEvent: a contingency already falls at second ' + e.atS);
  let i = state.evNext;
  while (i < evs.length && (evs[i].atS < e.atS || (evs[i].atS === e.atS && ord(evs[i].type) <= ord(e.type)))) i++;
  evs.splice(i, 0, e);
  deriveExt(state);
  if (state.tick === 0 && e.atS === 0) openDay(state);
  return state;
}

/** createState(seed, scn) with each record of recs injected, in order. */
export function stateWith(seed, scn, recs) {
  const s = createState(seed, scn);
  for (const r of recs) injectEvent(s, r);
  return s;
}
