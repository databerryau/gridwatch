// app/share.js: W6's share card (SPEC §4.7), DOM-free but for copyText.
//   Y-1  puzzleNumber: the daily's number, #1 on the launch date (content/dailies.js `from`), counted in UTC days
//        (Date.UTC differences), so a daylight-saving change never skips or repeats one.
//   Y-4  shareCard: text only, at most MAX_LINES lines and MAX_CHARS characters: the number, the date, the score and
//        letter (★ at par or better), the tags, the sparkline (12 two-hour blocks from 04:00, each the worst deviation
//        from 50 Hz in its window: score.spark) and the lowest Hz, three rows against par, the closing line, the link.
//        No event names and no clock times: lintCard is the check (the tests run it on every card they build).
//   Y-5  copyText: the clipboard, else a hidden textarea and execCommand('copy'); the end card says "Copied".
//   Y-7  closingLine: content/closing.js, picked by (date, bucket), so friends with the same result get the same line.

import {V} from '../sim/params.js';
import {mw} from '../render/format.js';
import {DAILIES} from '../content/dailies.js';
import {CLOSING} from '../content/closing.js';
import {DESK} from '../content/scenarios.js';
import {STATION_SHORT} from '../desk/util.js';

/** Y-4: the card's limits. */
export const MAX_LINES = 7, MAX_CHARS = 280;
/** C-4: the one canonical host; its root opens today's daily. */
export const SHARE_URL = 'databerryau.github.io/gridwatch';
/** Y-1: puzzle #1's date. */
export const LAUNCH_YMD = +DAILIES.from.replace(/-/g, '');

const DAY_MS = 864e5;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A YYYYMMDD's UTC midnight in ms, or NaN for no such date.
function utcOf(ymd) {
  const y = Math.floor(ymd / 1e4), m = Math.floor(ymd / 100) % 100, d = ymd % 100, t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  return Number.isInteger(ymd) && y >= 2000 && y < 2100 && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : NaN;
}

/** Y-1: the puzzle number of a YYYYMMDD (1 on the launch date), or null before it or for no such date. */
export function puzzleNumber(ymd) {
  const t = utcOf(ymd);
  return Number.isFinite(t) && t >= utcOf(LAUNCH_YMD) ? Math.round((t - utcOf(LAUNCH_YMD)) / DAY_MS) + 1 : null;
}

/** 'Fri 16 Oct' for 20261016, or '' for no such date. */
export function shortDate(ymd) {
  const t = utcOf(ymd);
  if (!Number.isFinite(t)) return '';
  const x = new Date(t);
  return WEEKDAYS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()];
}

/** Y-4: a block's glyph by its worst deviation from 50 Hz (Hz), best first: [most, glyph]. */
export const SPARK_GLYPHS = Object.freeze([[0.05, '█'], [0.10, '▇'], [0.15, '▆'], [0.3, '▅'], [0.5, '▄'], [0.8, '▃'], [1.0, '▂'], [Infinity, '▁']]
  .map(g => Object.freeze(g)));

/** Y-4: the sparkline of score.spark; a block the day never reached (it went black first: endS) is a middle dot. */
export function sparkline(spark, endS = V.DAY_S) {
  let s = '';
  for (let b = 0; b < V.SPARK_BLOCKS; b++) {
    const dev = spark && Number.isFinite(spark[b]) ? spark[b] : 0;
    s += b * V.SPARK_BLOCK_S >= endS ? '·' : SPARK_GLYPHS.find(g => dev <= g[0] + 1e-9)[1];
  }
  return s;
}

/** Y-7: the day's lowest Hz as a band: calm (normal band), wobble (containment), deep (above the first relay stage), relays. */
export function bandOf(lowHz) {
  if (!(lowHz < V.NORMAL_LO_HZ)) return 'calm';
  if (lowHz >= V.CONTAIN_LO_HZ) return 'wobble';
  return lowHz >= V.UFLS_FIRST_HZ ? 'deep' : 'relays';
}

// Within this of par (MWh dark, or a share of par's c/kWh or t/MWh) counts as level with it.
const LEVEL_MWH = 0.05, LEVEL_SHARE = 0.005;
const darkOf = a => (a ? a.outage / V.VCR : 0);
/** Is `you` at par or better on lights (MWh dark), cost (supply c/kWh) and carbon (t/MWh)? (no par: lights on alone) */
export function atPar(you, par) {
  const dark = darkOf(you);
  if (!par) return {lights: dark < LEVEL_MWH, cost: true, carbon: true};
  const no = (y, p) => !(y > p * (1 + LEVEL_SHARE));
  return {lights: dark <= darkOf(par) + LEVEL_MWH, cost: no(you.supplyCents, par.supplyCents), carbon: no(you.co2tPerMWh, par.co2tPerMWh)};
}

/**
 * Y-7: the closing line's bucket: 'black'; 'solo.on' or 'solo.dark' with no par to compare; 'held' when streets of yours
 * went dark but no more than par's (a Hard day); else lights.cost.band ('on.under.calm', 'dark.over.deep').
 */
export function bucketOf(o) {
  if (o.black) return 'black';
  const dark = darkOf(o.you) >= LEVEL_MWH;
  if (!o.par) return dark ? 'solo.dark' : 'solo.on';
  const p = atPar(o.you, o.par);
  if (dark && p.lights) return 'held';
  return (dark ? 'dark' : 'on') + '.' + (p.cost ? 'under' : 'over') + '.' + bandOf(o.lowHz);
}

// FNV-1a over a string: the closing line's pick (the same date and bucket, the same line, in every browser).
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
/** Y-7: the closing line for a day (a YYYYMMDD, or a seed off the calendar) and a bucket. */
export function closingLine(day, bucket) {
  const lines = CLOSING[bucket] || CLOSING['on.under.calm'];
  return lines[fnv(day + '|' + bucket) % lines.length];
}

const mwh = x => (x < 10 ? mw(x, 1) : mw(x));
const share = (y, p) => Math.round(100 * Math.abs(y / p - 1));
// A row against par: "★ level with par", "★ -3% vs par", "+5% vs par"
function vsPar(y, p, star) {
  if (!(p > 0) || !Number.isFinite(y)) return '';
  const n = share(y, p);
  return star ? '★ ' + (n === 0 ? 'level with par' : '-' + n + '% vs par') : '+' + Math.max(1, n) + '% vs par';
}

/** Y-4: the three rows, words after their names: {lights, cost, carbon}. */
export function shareRows(you, par, black) {
  if (black) return {lights: 'the grid went black', cost: '', carbon: ''};
  const p = atPar(you, par), dark = darkOf(you), star = par && p.lights ? '★ ' : '';   // (★: at par or better; no par, no ★)
  const lights = dark < LEVEL_MWH ? star + 'every light on'
    : star + mwh(dark) + ' MWh dark' + (par ? ' · par ' + (darkOf(par) < LEVEL_MWH ? '0' : mwh(darkOf(par))) : '');
  if (!par) return {lights, cost: you.supplyCents.toFixed(1) + ' c/kWh', carbon: you.co2tPerMWh.toFixed(2) + ' t/MWh'};
  return {lights, cost: vsPar(you.supplyCents, par.supplyCents, p.cost), carbon: vsPar(you.co2tPerMWh, par.co2tPerMWh, p.carbon)};
}

/**
 * Y-4: the share card.
 * @param {{ymd:number|null, n:number|null, seed:number, grade:object|null, perfect:boolean, black:boolean, lowHz:number,
 *   spark:number[], endS:number, you:object, par:object|null, tags:string[], closing:string}} o
 *   ymd and n: the daily's date and number (null off the calendar: `name`, a Hard day's, else the seed, is named instead); grade: app/score.js
 *   grade's; you, par: app/score.js allIn's; tags: ANNIVERSARY (D-29), FIRST SHIFT, PRACTICE, HAND-FLOWN,
 *   NO COACH or COACHED, GLASS BROKEN, HARD DAY.
 * @returns {{text:string, lines:string[]}} the closing line is dropped, then the last tags, to stay within MAX_CHARS.
 */
export function shareCard(o) {
  const g = o.grade, score = g ? g.points + ' ' + g.letter + (g.star ? ' ★' : '') + (o.perfect ? ' · PERFECT' : '') : 'no score';
  const head = tags => ['GRIDWATCH' + (o.n ? ' #' + o.n : ''), o.ymd && shortDate(o.ymd) ? shortDate(o.ymd) : o.name || 'seed ' + o.seed, score, ...tags].join(' · ');
  const r = shareRows(o.you, o.par, o.black), row = (k, v) => (v ? (k + '        ').slice(0, 8) + v : '');
  const body = [sparkline(o.spark, o.endS) + '  low ' + (Number.isFinite(o.lowHz) ? o.lowHz.toFixed(2) : '-') + ' Hz',
    row('Lights', r.lights), row('Cost', r.cost), row('Carbon', r.carbon)].filter(Boolean);
  let tags = (o.tags || []).slice(), closing = o.closing ? '"' + o.closing + '"' : '';
  const build = () => [head(tags), ...body, closing, SHARE_URL].filter(Boolean);
  let lines = build();
  while (len(lines.join('\n')) > MAX_CHARS && (closing || tags.length)) {
    if (closing) closing = ''; else tags.pop();
    lines = build();
  }
  return {text: lines.join('\n'), lines};
}
const len = s => [...s].length;

/**
 * Y-4's lint: words that name an event, a time of day or a plant (spoilers: "the battery" says what caught a fall), each a
 * whole word, plural too (tests/share.test.js); the stations' own labels (desk/util.js STATION_SHORT) are added below.
 */
export const EVENT_WORDS = Object.freeze(['trip', 'tripped', 'tripping', 'heatwave', 'heat', 'hot', 'storm', 'front', 'cloud', 'outage', 'fault',
  'feeder', 'interconnector', 'tie', 'link', 'contingency', 'ufls', 'shed', 'shedding', 'relay', 'derate', 'derated', 'smelter', 'potline', 'drought',
  'cutout', 'cut-out', 'lightning', 'wind', 'solar', 'rooftop', 'gas', 'turbine', 'battery', 'batteries', 'diesel', 'rert', 'dr',
  'morning', 'midday', 'noon', 'afternoon', 'evening', 'tonight', 'night', 'dawn', 'dusk', 'sunrise', 'sunset', 'peak']);
const STATION_WORDS = [...new Set(Object.values(STATION_SHORT).map(s => s.split(/[^A-Za-z]/)[0].toLowerCase()))];
const WORD_RE = new RegExp('\\b(' + [...EVENT_WORDS, ...STATION_WORDS].map(w => w.replace(/-/g, '\\-')).join('|') + ')(s|es)?\\b', 'i');
// The city's places: each suburb's name, and its id alone or as a district's (SOL, SOL3)
const PLACES = DESK.city.suburbs, PLACE_RE = new RegExp('\\b(' + PLACES.map(s => s.id).join('|') + ')\\d*\\b|\\b(' +
  PLACES.map(s => s.name.split(' ').pop()).join('|') + ')\\b', 'i');
// Allowed: plain ASCII, the middle dot, the eight block glyphs and the star (no emoji).
const CHARS_RE = /^[\x20-\x7E\n·▁-█★]*$/;

/** Y-4: what is wrong with a card's text ([] when nothing). */
export function lintCard(text) {
  const out = [], lines = text.split('\n');
  if (lines.length > MAX_LINES) out.push(lines.length + ' lines (at most ' + MAX_LINES + ')');
  if (len(text) > MAX_CHARS) out.push(len(text) + ' characters (at most ' + MAX_CHARS + ')');
  if (/\b\d{1,2}[:h]\d\d\b/.test(text) || /\b\d{1,2}\s?(am|pm)\b/i.test(text)) out.push('a clock time');
  const w = text.match(WORD_RE);
  if (w) out.push('the event word "' + w[1] + '"');
  if (/\b[A-Z]{3}\d\b/.test(text) || PLACE_RE.test(text)) out.push('a place');
  if (!CHARS_RE.test(text)) out.push('a character outside ASCII, the blocks, ★ and ·');
  return out;
}

/**
 * Y-5: copy `text`: the async clipboard, else a hidden textarea and execCommand('copy').
 * @param {{navigator?:object, document?:object}} env the page's (globalThis by default)
 * @returns {Promise<string>} 'clipboard', 'fallback', or '' when neither worked
 */
export async function copyText(text, env = globalThis) {
  try {
    const c = env.navigator && env.navigator.clipboard;
    if (c && typeof c.writeText === 'function') { await c.writeText(text); return 'clipboard'; }
  } catch { /* (blocked: try the fallback) */ }
  try {
    const doc = env.document, ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    doc.body.appendChild(ta);
    ta.select();
    const ok = typeof doc.execCommand === 'function' && doc.execCommand('copy');
    ta.remove();
    return ok ? 'fallback' : '';
  } catch {
    return '';
  }
}
