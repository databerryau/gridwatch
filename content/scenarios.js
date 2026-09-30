// content/scenarios.js: scenarios as data (spec F-13, D-8, P-6).
//
// A scenario is plain JSON-able data. createState() copies it into state.scn with the
// source keys (src, note, simplified, unverified) stripped, so the sim never reads this
// module at run time: state is self-contained.
//
// Source rule: every object whose own values include numbers carries a `src` (legacy
// line refs are to index.html v2.0 + Phase 0.1) or `simplified: true` with a `note`
// (tests/params.test.js). Times of day are hours; hours >= 24 are the next morning.
// Model constants shared by every scenario live in sim/params.js.

import {P} from '../sim/params.js';

const LEG = 'legacy index.html';

// U-1 suburbs; districts are ~3% of demand each (K-13), sized by households.
const SUBURBS = [
  {id: 'SOL', name: 'Solstice Rise', households: 280000, districts: 5},
  {id: 'HAZ', name: 'Old Hazelton', households: 300000, districts: 5},
  {id: 'RED', name: 'Redgum Flats', households: 420000, districts: 7},
  {id: 'HAR', name: 'Harbourside', households: 250000, districts: 4},
  {id: 'TAL', name: 'Tallowood Heights', households: 290000, districts: 5},
  {id: 'SAL', name: 'Saltbush Bay', households: 360000, districts: 6},
];

/** The 'classic' day: the legacy v2.0 day ported to the v4 core (Phase 0.2 bench and par). */
export const CLASSIC = {
  id: 'classic',
  name: 'Classic late-summer day',
  note: 'Every daily is a late-summer day until Y-9 ships (§8.2). The D-8 event director (Phase 2) replaces the legacy event menu below.',

  clock: {
    src: LEG + ' L423 (t = 0 is 04:00); PLAYER_START_H in params',
    startH: 4,
  },

  demand: {
    src: LEG + ' L283-285 (DEM). Legacy eases between points with a half-cosine; v4 uses smoothstep (3u^2 - 2u^3), which is within ~7 MW of it and needs no transcendental function (risk 5).',
    baseMW: [[0, 4750], [1, 4350], [2, 4050], [3, 3850], [3.5, 3800], [4, 3820], [5, 3900], [6, 4250], [7, 5000],
      [8, 5600], [9, 6000], [10, 6300], [11, 6500], [12, 6650], [13, 6800], [14, 7000], [15, 7150], [16, 7350],
      [17, 7550], [18, 7680], [18.8, 7720], [19.5, 7600], [20, 7350], [21, 6900], [22, 6100], [23, 5300], [24, 4750]],
    noise: {
      src: LEG + ' L454 (noise += -noise*0.003 + N*5.5 per 0.2-min tick), converted to 1-min steps: revert 1 - 0.997^5, sigma 5.5*sqrt(sum 0.997^2j)',
      revertPerMin: 0.01491, sigmaMW: 12.225, startMW: 0,
    },
  },

  temperatureC: {
    src: LEG + ' L286 (TMP); display only until P-3 (Phase 2)',
    table: [[0, 26], [4, 23], [6, 22], [9, 27], [12, 32], [15, 35], [17, 36], [19, 33], [22, 29], [24, 26]],
  },

  sun: {
    src: LEG + ' L287 (SUNRISE 6.2, SUNSET 19.8; late summer, §8.2)',
    riseH: 6.2, setH: 19.8,
  },

  solar: {
    src: LEG + ' L437-439: clear-sky utility solar = 1400 * sin(pi (h - 6.2) / 13.6)^1.35, tabulated every 15 min and rounded to 1 MW (generated once with Node; linear between points, 0 outside the sun hours)',
    clearSkyMW: [[6.2, 0], [6.25, 3], [6.5, 38], [6.75, 86], [7, 142], [7.25, 204], [7.5, 270], [7.75, 340], [8, 412],
      [8.25, 485], [8.5, 559], [8.75, 633], [9, 707], [9.25, 779], [9.5, 849], [9.75, 917], [10, 983], [10.25, 1044],
      [10.5, 1103], [10.75, 1156], [11, 1206], [11.25, 1250], [11.5, 1289], [11.75, 1322], [12, 1350], [12.25, 1372],
      [12.5, 1387], [12.75, 1397], [13, 1400], [13.25, 1397], [13.5, 1387], [13.75, 1372], [14, 1350], [14.25, 1322],
      [14.5, 1289], [14.75, 1250], [15, 1206], [15.25, 1156], [15.5, 1103], [15.75, 1044], [16, 983], [16.25, 917],
      [16.5, 849], [16.75, 779], [17, 707], [17.25, 633], [17.5, 559], [17.75, 485], [18, 412], [18.25, 340],
      [18.5, 270], [18.75, 204], [19, 142], [19.25, 86], [19.5, 38], [19.75, 3], [19.8, 0]],
  },

  wind: {
    src: LEG + ' L306 (start 0.52, mu 0.55) and L452 (wind += (mu - wind)*0.004 + N*0.006 per 0.2-min tick, clamp 0.04-0.98), converted to 1-min steps',
    startFrac: 0.52, mu: 0.55, revertPerMin: 0.01984, sigmaPerMin: 0.01331, min: 0.04, max: 0.98,
  },

  cloud: {
    src: LEG + ' L306 (clearness start 0.92, mu 0.92) and L453 (cloud += (mu - cloud)*0.01 + N*0.008 per 0.2-min tick, clamp 0.15-1), converted to 1-min steps',
    startFrac: 0.92, mu: 0.92, revertPerMin: 0.04901, sigmaPerMin: 0.01754, min: 0.15, max: 1,
  },

  tie: {
    simplified: true,
    note: 'P-6 / J-14: the neighbour\'s price follows a daily shape, cheap at midday (same sun) and dear in the evening; values are game tuning (legacy L549 used a flat $58 import / $40 export). Linear between points.',
    neighbourPrice: [[0, 55], [4, 45], [6, 60], [7, 85], [9, 45], [11, 10], [13, 5], [15, 30], [17, 120], [18.5, 170],
      [20, 130], [22, 75], [24, 55]],
  },

  // Weather class of the day: one uniform draw u; u < heat -> heat; u < heat + storm -> storm; else calm.
  weather: {
    src: 'S-10 / ' + LEG + ' L334-335 (HEAT 0.15, STORM 0.45 cumulative); values from params HEAT_SHARE and STORM_SHARE',
    heatShare: P.HEAT_SHARE.value,
    stormShare: P.STORM_SHARE.value,
  },

  // The legacy event menu (L331-370), timings unchanged. Windows are [from, to) in hours.
  events: {
    src: LEG + ' L331-370 (schedule()), times converted from minutes after 04:00 to hours of day',
    bigTrip: {
      src: LEG + ' L337: always; 08:00-13:30 on heat or storm days, else 11:00-20:00. Target rule (F-3): the largest online machine by output. Lockout L390: 90-150 min (simplified: real returns after a protection trip range from hours to weeks; after the lockout the unit may hot-start, S-11 minimum down time applies to planned stops only, owner decision D1)',
      severeWindowH: [8, 13.5], calmWindowH: [11, 20], lockoutMin: [90, 150],
    },
    extraTrip: {
      src: LEG + ' L338: 55% of days, 06:00-02:00. Legacy picked a random online unit; v4 pre-rolls a station (ext) and trips its largest online machine, or nothing if none is online (F-3). Lockout 90-150 min (simplified, as bigTrip: then a hot start, D1)',
      p: 0.55, windowH: [6, 26], lockoutMin: [90, 150],
      stations: ['coal', 'ccgt', 'gta', 'gtb', 'gtc', 'hydro'],
    },
    heat: {
      src: LEG + ' L339-344: announce 10:30, active 13:30-20:00 (+6.5% demand, -7% thermal; params), clear skies (clearness mu >= 0.98)',
      announceH: 10.5, onsetH: 13.5, endH: 20, clearMu: 0.98,
    },
    storm: {
      src: LEG + ' L345-351: warn 15:40, arrive 16:40 (wind mu 0.95), cut-out 17:10-18:10 (mu 0.18), tie trip 17:20-18:30 on 60% of storms (lockout L397: 90-180 min), passes 19:00 (mu 0.5)',
      warnH: 15 + 40 / 60, arriveH: 16 + 40 / 60, arriveMu: 0.95, cutoutWindowH: [17 + 10 / 60, 18 + 10 / 60], cutoutMu: 0.18,
      linkTripP: 0.6, linkTripWindowH: [17 + 20 / 60, 18.5], linkLockoutMin: [90, 180], passH: 19, passMu: 0.5,
    },
    cloud: {
      src: LEG + ' L353-358: 65% of days; warned 09:00-14:00, front overhead 20 min later (clearness mu 0.32), clears 40-110 min after it arrives (mu 0.92)',
      p: 0.65, warnWindowH: [9, 14], leadMin: 20, clearAfterMin: [40, 110], frontMu: 0.32, clearMu: 0.92,
    },
    smelter: {
      src: LEG + ' L359-361: 45% of days, 10:00-16:00, load off for 45 min. Size is the 256-MW potline (params SMELTER_MW; legacy 600 MW, X-28)',
      p: 0.45, windowH: [10, 16], offMin: 45,
    },
    drought: {
      src: LEG + ' L363-365: 35% of days, 18:00-20:00, wind mu 0.12 for the rest of the day (unwarned; announced at onset)',
      p: 0.35, windowH: [18, 20], mu: 0.12,
    },
    linkTrip: {
      src: LEG + ' L367 and L397: 40% of days, 07:20-01:40, lockout 90-180 min',
      p: 0.4, windowH: [7 + 20 / 60, 25 + 40 / 60], lockoutMin: [90, 180],
    },
    notices: {
      src: LEG + ' L368-370: information lines at t = 110, 795 and 1230 min after 04:00',
      list: [{atH: 5 + 50 / 60, code: 'MORNING_RAMP'}, {atH: 17.25, code: 'DUCK'}, {atH: 24.5, code: 'TROUGH'}],
    },
  },

  // 04:00 commitment (legacy L322-325, L307-309), split per machine.
  commitment: {
    src: LEG + ' L322-325: coal 2,000, CCGT 520, hydro 400 at 04:00; L309 tie 250 import; L307 battery 680 MWh idle. Split per machine and the online/offline history are simplified (units have been in their state for a day).',
    units: {coal1: 500, coal2: 500, coal3: 500, coal4: 500, ccgt1: 260, ccgt2: 260, hydro1: 200, hydro2: 200},
    sinceS: -86400,
    tieMW: 250,
    battery: {socMWh: 680, mode: 'idle', mw: 0, guardMW: 0},
    windLimitPct: 100, solarLimitPct: 100, // output LIMIT % (legacy L310 wCurt/sCurt): 100 = no curtailment
    mode: 'AGC',
  },

  // U-1 suburbs and their districts: UFLS blocks (H-6), restore feeders (K-13) and the
  // directed-shedding rotation (H-11).
  city: {
    simplified: true,
    note: 'U-1 households (1.9M, unverified) set each suburb\'s share of demand; each suburb is split into equal districts of ~3%. Sixteen districts carry the eight UFLS stages (two per stage, from different suburbs); the other sixteen form the directed-shedding rotation, as real schemes keep UFLS-armed feeders out of rotation.',
    suburbs: SUBURBS,
    uflsStages: [['RED1', 'SAL1'], ['HAZ1', 'TAL1'], ['SOL1', 'RED2'], ['HAR1', 'SAL2'], ['HAZ2', 'RED3'], ['TAL2', 'SOL2'],
      ['SAL3', 'RED4'], ['HAZ3', 'HAR2']],
    rotation: ['SOL3', 'HAZ4', 'RED5', 'HAR3', 'TAL3', 'SAL4', 'SOL4', 'HAZ5', 'RED6', 'HAR4', 'TAL4', 'SAL5', 'SOL5',
      'RED7', 'TAL5', 'SAL6'],
  },
};

// Deep-frozen: a test or tool that edits a scenario in place would leak into every later
// createState in the same process. Make a variant with JSON.parse(JSON.stringify(CLASSIC)),
// change it, and give it its own id (state.scnHash tells variants apart in hashState).
function deepFreeze(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}
deepFreeze(CLASSIC);

export const SCENARIOS = Object.freeze({classic: CLASSIC});

/** Scenario by id; throws on an unknown id. */
export function getScenario(id) {
  const s = SCENARIOS[id];
  if (!s) throw new Error('unknown scenario: ' + id);
  return s;
}
