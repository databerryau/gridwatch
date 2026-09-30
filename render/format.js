// render/format.js: plain-text formatting for the bench (numbers, clock, event records).
// Pure and DOM-free (tests import it). Wording for the desk moves to content/text.js in
// Phase 1a (README §7); the bench shows the sim's own record text.

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
