// GRIDWATCH: the light seasons' month table (SPEC Q-122, Q-127). Writes content/seasons.js. Not loaded by the game.
//
//   node tools/seasons-gen.mjs          # rewrite content/seasons.js
//   node tools/seasons-gen.mjs --check  # exit 1 when content/seasons.js is not what this would write
//
// The sim needs no transcendental function (risk 5), so every month's curves are tabulated here once, as the late-summer
// day's were (content/scenarios.js ROOF_SHAPE_PM, solar.clearSkyMW), and shipped as plain numbers. February is the desk's
// own late-summer day and is not written: its dailies play 'desk' and 'desk-weekend' unchanged.
//
// The inputs, per month (MONTHS below; every value simplified game tuning, SPEC §8.2 "Light seasons"):
// - noonH, dayH: solar noon on the game's clock (13:00 under daylight saving, October to March; 12:00 April to September) and
//   the day's length at about 38°S on the 15th. Sunrise is noonH - dayH / 2, sunset noonH + dayH / 2. The late-summer day
//   (06:12-19:48) is February's.
// - solarF, roofF: the clear-sky peak of utility solar (trackers) and of rooftop PV (fixed tilt), against February's. Lower
//   sun in winter: about 0.6 at midwinter.
// - hot, mild: [min, max] °C of the month's two day types. The late-summer table's shape (22-36 °C, warmest at 17:00) is
//   scaled to the range, an hour earlier on standard time. `word` names the month's non-mild type: hot, warm or cold.
// - heat, mild share: of all days, as DESK.weather (heatShare, mildShare).
//
// Demand: the late-summer MILD day (the hot day with its cooling load removed, sim/weather.js underlyingBaseMW) is the
// underlying shape U(h). A month's day is U(h) + cooling(T) on the hot or warm type (sim's own COOLING_* rule, none on a MILD
// day, as now) + heating(T) + lighting. heating = HEAT_PER_C x max(0, HEAT_BASE_C - T) x the household weight w(h) (most in the
// morning and evening, half overnight); lighting adds LIGHT_MW from half an hour after sunset to 20:48 on a day whose sun
// sets before the late-summer day's. Tabulated every half hour; the sim eases between points (tableSmooth).
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DESK} from '../content/scenarios.js';
import {underlyingBaseMW, tableLinear} from '../sim/weather.js';
import {V} from '../sim/params.js';

const OUT = fileURLToPath(new URL('../content/seasons.js', import.meta.url));
const KEYS = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// m: noonH, dayH, solarF, roofF, word, hot [min, max], mild [min, max], heat share, mild share
const MONTHS = {
  1: {noonH: 13, dayH: 14.4, solarF: 1.0, roofF: 1.0, word: 'hot', hot: [22, 36], mild: [15, 25], heat: 0.18, mildShare: 0.50},
  3: {noonH: 13, dayH: 12.3, solarF: 0.93, roofF: 0.94, word: 'hot', hot: [19, 33], mild: [13, 23], heat: 0.08, mildShare: 0.60},
  4: {noonH: 12, dayH: 11.1, solarF: 0.82, roofF: 0.82, word: 'warm', hot: [14, 27], mild: [10, 20], heat: 0, mildShare: 0.70},
  5: {noonH: 12, dayH: 10.1, solarF: 0.70, roofF: 0.70, word: 'cold', hot: [6, 13], mild: [9, 17], heat: 0, mildShare: 0.45},
  6: {noonH: 12, dayH: 9.55, solarF: 0.64, roofF: 0.63, word: 'cold', hot: [4, 11], mild: [7, 15], heat: 0, mildShare: 0.35},
  7: {noonH: 12, dayH: 9.8, solarF: 0.66, roofF: 0.65, word: 'cold', hot: [3, 10], mild: [6, 14], heat: 0, mildShare: 0.30},
  8: {noonH: 12, dayH: 10.6, solarF: 0.75, roofF: 0.74, word: 'cold', hot: [4, 12], mild: [7, 16], heat: 0, mildShare: 0.40},
  9: {noonH: 12, dayH: 11.8, solarF: 0.86, roofF: 0.86, word: 'cold', hot: [6, 14], mild: [9, 19], heat: 0, mildShare: 0.55},
  10: {noonH: 13, dayH: 13.1, solarF: 0.95, roofF: 0.95, word: 'warm', hot: [13, 27], mild: [10, 20], heat: 0, mildShare: 0.70},
  11: {noonH: 13, dayH: 14.2, solarF: 1.0, roofF: 0.99, word: 'hot', hot: [17, 32], mild: [12, 23], heat: 0.05, mildShare: 0.60},
  12: {noonH: 13, dayH: 14.75, solarF: 1.0, roofF: 1.0, word: 'hot', hot: [20, 35], mild: [14, 25], heat: 0.12, mildShare: 0.55},
};
const HEAT_PER_C = 85, HEAT_BASE_C = 15, LIGHT_MW = 200;
const W_HEAT = [[0, 0.5], [5, 0.5], [6, 0.8], [7, 1], [9, 1], [10, 0.6], [15, 0.6], [16, 0.8], [17, 1], [22, 1], [23, 0.7], [24, 0.5]];
const FEB_SET_H = DESK.sun.setH, LATE_SUMMER_PEAK_H = 17;

const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100, q = x => Math.round(x * 4) / 4;
// A shape sin(pi (h - rise) / day)^k on 15-min points strictly inside the sun hours, with 0 at sunrise and sunset.
function sunTable(rise, set, k, peak) {
  const out = [[r2(rise), 0]];
  for (let h = Math.ceil(rise * 4 + 1e-9) / 4; h < set - 1e-9; h += 0.25) out.push([h, Math.round(peak * Math.sin(Math.PI * (h - rise) / (set - rise)) ** k)]);
  return out.concat([[r2(set), 0]]);
}
// The late-summer hot table's shape (0 at its 22 °C, 1 at its 36 °C), on hour h of a clock `shift` hours from daylight time.
const shape = (h, shift) => { const t = DESK.temperatureC.table, lo = 22, hi = 36; return (tableLinear(t, ((h + shift) % 24 + 24) % 24) - lo) / (hi - lo); };
const tempTable = ([lo, hi], shift) => Array.from({length: 25}, (_, i) => [i, r1(lo + (hi - lo) * shape(i, shift))]);
const cooling = T => V.COOLING_MAX_MW * Math.min(1, Math.max(0, (T - V.COOLING_BASE_C) / V.COOLING_SPAN_C));
const U = h => underlyingBaseMW(DESK, {temp: 'MILD', weekend: false}, h);

function month(m) {
  const x = MONTHS[m], shift = 13 - x.noonH, rise = x.noonH - x.dayH / 2, set = x.noonH + x.dayH / 2;
  const light = h => (set >= FEB_SET_H ? 0 : LIGHT_MW * Math.min(1, Math.max(0, (h - set - 0.5) / 0.5)) * Math.min(1, Math.max(0, (20.8 - h) / 0.5)));
  const demand = (range, cool) => Array.from({length: 49}, (_, i) => {
    const h = i / 2, T = tableLinear(tempTable(range, shift), h);
    return [h, Math.round(U(h) + (cool ? cooling(T) : 0) + HEAT_PER_C * Math.max(0, HEAT_BASE_C - T) * tableLinear(W_HEAT, h) + light(h))];
  });
  const solarPeak = DESK.solar.clearSkyMW.reduce((a, p) => Math.max(a, p[1]), 0);
  return {
    key: KEYS[m], name: NAMES[m], word: x.word,
    sun: {riseH: r2(rise), setH: r2(set)},
    clearSkyMW: sunTable(rise, set, 1.35, solarPeak * x.solarF),
    shapePm: sunTable(rise, set, 1.5, 1000),
    clearFactor: r2(DESK.rooftop.clearFactor * x.roofF),
    table: tempTable(x.hot, shift), mildTable: tempTable(x.mild, shift),
    baseMW: demand(x.hot, x.word !== 'cold'), mildBaseMW: demand(x.mild, false),
    heatShare: x.heat, mildShare: x.mildShare, aircon: x.word !== 'cold',
  };
}

const rows = Object.keys(MONTHS).map(Number).map(month);
const j = v => JSON.stringify(v);
const text = `// content/seasons.js: the light seasons' month table (SPEC Q-122, Q-127). GENERATED by tools/seasons-gen.mjs: edit the
// inputs there and run it (tests/seasons.test.js fails a file that is not what it writes). content/scenarios.js lays each
// month over the desk's late-summer day (DESK and DESK_WEEKEND) as 'desk-<key>' and 'desk-weekend-<key>'; content/dailies.js
// plays a date's month from SEASONS_FROM. February is the late-summer day itself (06:12-19:48) and has no row.
//
// Each row: sun (rise and set, game clock), utility solar's clear-sky curve (MW, 15-min points), the rooftop shape (per mille
// of its noon peak) and clear-sky factor, the two day types' temperatures (table: the hot, warm or cold type, \`word\`;
// mildTable: MILD), their demand (baseMW, mildBaseMW: MW, half-hourly, eased between), the shares of heatwave and MILD days,
// and whether the city's air-con lever is offered on the non-mild type (no cooling load on a cold day).
export const SEASON_NOTE = 'SPEC Q-122 / Q-127 light seasons (tools/seasons-gen.mjs): sun times at about 38 deg S on the 15th, ' +
  'solar noon 13:00 under daylight saving and 12:00 without; clear-sky solar and rooftop peaks scaled from February; ' +
  'temperatures on the late-summer shape; demand = the late-summer mild day + cooling (hot and warm types) + heating ' +
  '(${HEAT_PER_C} MW per deg C below ${HEAT_BASE_C} deg C, weighted to mornings and evenings) + ${LIGHT_MW} MW of early-evening lighting ' +
  'after an early sunset. Game values, simplified (SPEC §8.2 "Light seasons").';
export const SEASON_MONTHS = Object.freeze({
${rows.map((r, i) => `  ${Object.keys(MONTHS)[i]}: {key: ${j(r.key)}, name: ${j(r.name)}, word: ${j(r.word)}, sun: ${j(r.sun).replace(/"/g, '')}, clearFactor: ${r.clearFactor},
    heatShare: ${r.heatShare}, mildShare: ${r.mildShare}, aircon: ${r.aircon},
    table: ${j(r.table)},
    mildTable: ${j(r.mildTable)},
    baseMW: ${j(r.baseMW)},
    mildBaseMW: ${j(r.mildBaseMW)},
    clearSkyMW: ${j(r.clearSkyMW)},
    shapePm: ${j(r.shapePm)}},`).join('\n')}
});
`;

if (process.argv.includes('--check')) {
  const now = readFileSync(OUT, 'utf8');
  if (now !== text) { console.error('content/seasons.js is not what tools/seasons-gen.mjs writes: run it'); process.exit(1); }
  console.log('content/seasons.js is current');
} else {
  writeFileSync(OUT, text);
  for (const r of rows) {
    const pk = t => t.reduce((a, p) => (p[1] > a[1] ? p : a));
    console.log(r.key, 'sun', r.sun.riseH, '-', r.sun.setH, '| solar pk', pk(r.clearSkyMW)[1], '| hot pk', pk(r.baseMW).join('@'),
      'min', Math.min(...r.baseMW.map(p => p[1])), '| mild pk', pk(r.mildBaseMW).join('@'), '| T', r.table.map(p => p[1]).join(' '));
  }
}
