// sim/dayplan.js: the event director, the day's designed plan (desk/README.md §32, Q-65).
// Contract: sim/README.md §11 dayplan.js (neutral at stage A).

import {STREAM, uniform} from './rng.js';
import {prerollEvents} from './events.js';

export function prerollRegime(seed, scn) {
  const u = uniform(seed, STREAM.EXT_REGIME, 0), w = scn.weather;
  const cls = u < w.heatShare ? 'heat' : u < w.heatShare + w.stormShare ? 'storm' : 'calm';
  const mild = uniform(seed, STREAM.EXT_REGIME, 1) < (w.mildShare || 0) / (1 - w.heatShare);
  return {cls, temp: cls === 'heat' ? 'HEATWAVE' : mild ? 'MILD' : 'HOT'};
}

export const preroll = (seed, scn, regime) => prerollEvents(seed, scn, regime);
