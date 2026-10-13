// render/format.js: plain-text formatting for the bench (numbers, clock, event records).
// Contract: desk/README.md §32.12 render/format.js.

import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S, S_PER_H = V.S_PER_H, S_PER_MIN = V.S_PER_MIN, DAY_S = V.DAY_S;
const START_S = V.DAY_START_H * S_PER_H;

const pad2 = n => String(n).padStart(2, '0');

/** 'HH:MM:SS' of a grid second (04:00:00 = 0), integer arithmetic like observe().clock. */
export function clockText(s, withSeconds = true) {
  const sod = ((START_S + Math.floor(s)) % DAY_S + DAY_S) % DAY_S;
  const t = pad2(Math.floor(sod / S_PER_H)) + ':' + pad2(Math.floor((sod % S_PER_H) / S_PER_MIN));
  return withSeconds ? t + ':' + pad2(sod % S_PER_MIN) : t;
}

/** Clock text of a tick. */
export const tickClock = (tick, withSeconds = true) => clockText(Math.floor(tick / TPS), withSeconds);

/** Rounded MW with a thousands separator ('1,234'), '-' for a non-finite value. */
export function mw(x, digits = 0) {
  if (!Number.isFinite(x)) return '-';
  const v = digits ? x.toFixed(digits) : String(Math.round(x) + 0);
  const [i, f] = v.split('.');
  const sign = i.startsWith('-') ? '-' : '';
  const body = (sign ? i.slice(1) : i).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + body + (f ? '.' + f : '');
}

/** Signed MW ('+120', '-40', '0'). */
export const smw = x => (Number.isFinite(x) && Math.round(x) > 0 ? '+' : '') + mw(x);

/** Frequency with 3 decimals. */
export const hz = x => (Number.isFinite(x) ? x.toFixed(3) : '-');

/** Rate label: 0.15 -> '0.15×', 120 -> '120×', 2100 -> '2,100×'. */
export function rateText(r) {
  if (!(r > 0)) return '0×';
  if (r < 1) return String(Math.round(r * 100) / 100) + '×';
  return mw(r) + '×';
}

/** Minutes and seconds 'm:ss' from seconds. */
export function mmss(s) {
  const t = Math.max(0, Math.round(s));
  return Math.floor(t / S_PER_MIN) + ':' + pad2(t % S_PER_MIN);
}

/** Dollars, compact: '$840', '$12.3k', '$1.25M'. */
export function dollars(x) {
  if (!Number.isFinite(x)) return '-';
  const a = Math.abs(x), sign = x < 0 ? '-' : '';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return sign + '$' + (a / 1e3).toFixed(1) + 'k';
  return sign + '$' + mw(a);
}

/**
 * A spot price in $/MWh with the sign before the dollar (U+2212): '$74', '−$20', '−$1,000';
 * '-' for a non-finite value. The belly's price goes negative (P-9).
 */
export function priceText(x) {
  if (!Number.isFinite(x)) return '-';
  const r = Math.round(x) + 0;
  return (r < 0 ? '\u2212$' : '$') + mw(Math.abs(r));
}

// ------------------------------------------------------------------ the game's header (Phase 1a)

/**
 * LIGHTS ON as a share of the energy the city asked for so far: '100%' while nothing has been
 * dark, else one decimal (never rounded up to 100%: '99.96%' shows as '99.9%').
 */
export function lightsText(score) {
  const served = score.servedMWh, dark = score.lightsMWh === undefined ? score.unservedMWh : score.lightsMWh;
  if (!(dark > 0) || !(served + dark > 0)) return '100%';
  const pct = 100 * served / (served + dark);
  return (Math.floor(pct * 10) / 10).toFixed(1) + '%';
}

/** CUSTOMER COST in cents per kWh served ('8.4'), '-' before anything is served. */
export const centsText = score => (score.servedMWh > 0 && Number.isFinite(score.centsPerKWh) ? score.centsPerKWh.toFixed(1) : '-');

/** CO₂ intensity in t/MWh generated ('0.61'), '-' before anything is generated. */
export const co2Text = score => (score.co2tPerMWh > 0 && Number.isFinite(score.co2tPerMWh) ? score.co2tPerMWh.toFixed(2) : '-');

/** Q-48 (§30.7): the ALL-IN score's prices, from the params ('$' and a thousands comma), and its c/kWh asked for. */
export const VCR_TEXT = '$' + mw(V.VCR), VER_TEXT = '$' + mw(V.VER);
export const allInCents = a => (a && a.askedMWh > 0 && Number.isFinite(a.cents) ? a.cents.toFixed(1) : '-');

/**
 * Q-64, Q-73: a sim input's answer in the briefing (but AGC/HAND) and in the night roll (app/game.js
 * sendInput, redispatch). Help, so blue: the shell's toast is its one answer, and the views draw
 * no refusal for it (isLock).
 */
export const BRIEF_LOCK = 'Take the desk first: Enter.',
  NIGHT_LOCK = 'The night shift has the desk to 04:00: it starts and stands down units and calls demand response as par would.';
export const isLock = r => r === BRIEF_LOCK || r === NIGHT_LOCK;

const MODE_LABEL = {OVER: 'DAY OVER', HIDDEN: 'PAUSE', ALARMS: 'HELD', 'RESPOND-CARD': 'HELD', 'FEEDER-CARD': 'HELD', OFFER: 'SYNC'};

/**
 * The rate badge (F-5: the mode and the rate are always visible): the D-2 segment and its target
 * rate in CRUISE and NIGHT ('PEAK 150×', HAND 'PEAK 75×', 'NIGHT ROLL 2,100×'; Q-78), 'FAST 1,620×',
 * 'SYNC 30×' (a scope offer), 'WATCH T+1.23 s ×0.15', 'HELD 0× · Enter' (the RESPOND card),
 * 'HELD 0× · R restore · Esc on' (a feeder card, Q-91), 'HELD 0× · Esc' (the alarm panel, Q-46),
 * 'PAUSE 0×', 'DAY OVER'. The bench's modes have no segment: 'CRUISE 120×'.
 * @param {{mode:string, rate:number, watchS:number, segment?:string}} m director.modeOf()
 */
export function badgeText(m) {
  const label = (/^(CRUISE|NIGHT)$/.test(m.mode) && m.segment) || MODE_LABEL[m.mode] || m.mode;
  if (m.mode === 'OVER') return label;
  if (m.mode === 'WATCH') return 'WATCH T+' + Math.max(0, m.watchS).toFixed(2) + ' s ×' + rateText(m.rate).replace('×', '');
  if (m.mode === 'RESPOND-CARD') return 'HELD 0× · Enter';
  if (m.mode === 'FEEDER-CARD') return 'HELD 0× · R restore · Esc on';
  if (m.mode === 'ALARMS') return 'HELD 0× · Esc';
  return label + ' ' + rateText(m.rate);
}

// The act of the day in words (D-1, Q-78), by modeOf().act (1-4; 0 before 04:30); the night shift's only with modeOf().night.
const ACT_TITLES = ['', 'Act I, the morning ramp: the city wakes and demand climbs', 'Act II, the belly: rooftop solar floods in',
  'Act III, neck and peak: the sun sets as demand peaks', 'The night roll: the clock runs on to 04:00'];
/** What the badge is (next.html's title before the first frame). */
export const BADGE_HELP = 'Mode and playback rate (grid seconds per real second). Click or Space: pause / run';
/** The badge's title: the act, then BADGE_HELP. */
export const badgeTitle = m => {
  const a = m.night ? 'The night roll: the night shift runs the grid to 04:00' : ACT_TITLES[m.act];
  return (a ? a + '. ' : '') + BADGE_HELP;
};

/**
 * One event-log line for a step() record, or null for records the log leaves out (a
 * 'restore' or 'announce' record is followed by the sim's own log line saying the same).
 * @returns {{sev:'info'|'good'|'warn'|'crit'|'dim', text:string}|null}
 */
export function describeRecord(r, unitName = id => id) {
  switch (r.kind) {
    case 'log': return {sev: r.sev, text: r.msg};
    case 'contingency':
      return {sev: 'crit', text: 'CONTINGENCY: ' + r.cause + ' ' + unitName(r.id) + ', ' + mw(Math.abs(r.lostMW)) + ' MW ' +
        (r.lostMW >= 0 ? 'of supply' : 'of load') + ' lost at ' + hz(r.fHz) + ' Hz; spin ' + r.ekBeforeGWs.toFixed(1) +
        ' -> ' + r.ekAfterGWs.toFixed(1) + ' GW·s. The watch plays.'};
    case 'breaker':
      return {sev: 'dim', text: 'Breaker ' + (r.closed ? 'closed' : 'opened') + ': ' + unitName(r.unit) + ' (' + r.why + ')'};
    case 'ufls':
      return {sev: 'crit', text: 'UFLS stage ' + r.stage + ' operated: ' + r.districts.join(', ') + ' dark, ' + mw(r.mw) + ' MW shed.'};
    case 'ofgs': return {sev: 'warn', text: 'OFGS stage ' + r.stage + ': ' + mw(r.mw) + ' MW of wind tripped (over-frequency).'};
    case 'shed': return {sev: 'crit', text: 'District ' + r.district + ' shed (' + r.why + '), ' + mw(r.mw) + ' MW.'};
    case 'black': return {sev: 'crit', text: 'SYSTEM BLACK (' + r.why + ') at ' + hz(r.fHz) + ' Hz.'};
    case 'input': return r.by === 'assist' ? {sev: 'dim', text: 'Assist input refused (' + (r.type || 'input') + '): ' + r.reason + '.'}
      : {sev: 'warn', text: 'Refused ' + (r.type || 'input') + ': ' + r.reason + '.'};
    case 'dayEnd': return {sev: r.black ? 'crit' : 'good', text: r.black ? 'Day over: the grid went black.' : 'Day over: 04:00.'};
    case 'restore': case 'announce': return null;
    default: return {sev: 'info', text: r.kind};
  }
}
