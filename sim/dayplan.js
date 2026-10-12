// sim/dayplan.js: the event director, the day's designed plan on a dayplan scenario (desk/README.md §32, Q-65).
// Contract: sim/README.md §11 dayplan.js. Neutral at stage A: today's regime formula and the legacy menu.

import {STREAM, uniform} from './rng.js';
import {prerollEvents} from './events.js';

/** The day's weather class and temperature type, as weather.prerollRegime's formula today. */
export function prerollRegime(seed, scn) {
  const u = uniform(seed, STREAM.EXT_REGIME, 0), w = scn.weather;
  const cls = u < w.heatShare ? 'heat' : u < w.heatShare + w.stormShare ? 'storm' : 'calm';
  const mild = uniform(seed, STREAM.EXT_REGIME, 1) < (w.mildShare || 0) / (1 - w.heatShare);
  return {cls, temp: cls === 'heat' ? 'HEATWAVE' : mild ? 'MILD' : 'HOT'};
}

/** The day's records {id, atS, type, args, contingency, warned, act, crisis}: the legacy menu's (act 0) at stage A. */
export const preroll = (seed, scn, regime) => prerollEvents(seed, scn, regime);
