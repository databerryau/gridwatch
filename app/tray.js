// app/tray.js: the K-9 message tray model.
// Contract: desk/README.md §32.12 app/tray.js.

import {V} from '../sim/params.js';
import {stepAfter} from '../sim/clock.js';
import {isWeather} from './alarms.js';

const TPS = V.TICKS_PER_S;
/** Visible cards (K-9). */
export const MAX_CARDS = 3;
/** Words on a card (K-9). */
export const MAX_WORDS = 25;
/** LOG entries kept. */
export const MAX_LOG = 200;

export const SENDERS = Object.freeze({weather: 'WEATHER BUREAU', market: 'MARKET NOTICE', station: 'STATION', city: 'CITY DESK', network: 'NETWORK'});
// Q-82: a news kind's sender, button and target ('': the lever of the unit its text names); the rest: weather.
const NEWS = {tie: ['market', 'TO THE TIE', 'knob-tie'], outage: ['station', 'TO THE LEVER', ''], network: ['network', 'TO THE RESTORE BAY', 'bay-restore']};

/** Cut text to MAX_WORDS words (an ellipsis marks a cut). */
export function words(text, max = MAX_WORDS) {
  const w = String(text).trim().split(/\s+/);
  return w.length <= max ? w.join(' ') : w.slice(0, max).join(' ') + '…';
}

const leverOf = unitId => {
  const st = unitId.replace(/\d+$/, '');
  return st === 'hydro' ? 'wheel-hydro' : V.STATION_IDS.includes(st) ? 'lever-' + st : 'stack';
};
// the lever of the unit a text names by its full name (a log line: 'name:')
const leverIn = (t, end = '') => { const m = V.MACHINES.find(x => t.includes(x.name + end)); return m ? leverOf(m.id) : 'stack'; };
const unitName = id => { const m = V.MACHINES.find(x => x.id === id); return m ? m.name : id; };
const hhmm = s => {
  const sod = ((V.DAY_START_H * V.S_PER_H + s) % V.DAY_S + V.DAY_S) % V.DAY_S;
  return String(Math.floor(sod / V.S_PER_H)).padStart(2, '0') + ':' + String(Math.floor((sod % V.S_PER_H) / V.S_PER_MIN)).padStart(2, '0');
};

const mwc = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// ' in 35 min' as the line says it: ' at 05:38'
const clockOf = r => r.msg.replace(/ in (\d+) min\b/, (x, n) => ' at ' + hhmm(Math.floor(r.tick / TPS) + n * V.S_PER_MIN));

/**
 * An MSL notice (P-4; desk/README.md C-9, §21.4) as a MARKET NOTICE card. It says the lowest demand
 * the forecast sees and its time (or that demand is at its lowest now), and the one thing this
 * desk can do at that level; never "below X" (a level held by its hysteresis can sit above its
 * threshold), and never the backstop (not on this desk yet). MSL1 is information; MSL2
 * and MSL3 ring. Its button only focuses a control, like every card's. The card is made from the
 * record alone, so it says nothing that depends on the desk's state at that moment (whether a gas
 * unit is running, whether the battery is already charging): the objective line says that.
 * Q-60 (§31.9.7): an MSL1 or MSL2 minimum ahead in the soak window, while a soak can still start, names the soak; SUBURBS opens the card.
 */
function mslCard(r) {
  const key = 'msl:' + r.code + ':' + r.tick;
  const nowS = Math.floor(r.tick / TPS), now = r.atS <= nowS;
  const low = now ? 'Demand is at its lowest now, ' + mwc(r.minMW) + ' MW.' : 'Lowest demand ' + mwc(r.minMW) + ' MW at ' + hhmm(r.atS) + '.';
  const stack = {label: 'SEE THE STACK', target: 'stack'}, sub = {label: 'SUBURBS', target: 'suburb-card'};
  const soak = !now && r.atS >= V.SOAK_FROM_S && r.atS <= V.SOAK_TO_S && nowS <= V.SOAK_TO_S - V.SOAK_S;
  switch (r.level) {
    case 1: return {key, from: SENDERS.market, sev: 'info', text: low + (soak ? ' A hot-water soak takes the spill: book one, and charge the battery on it.'
      : now ? ' Charge the battery if it has room.' : ' Power spilled then can go into the battery: charge it on the spill.'), button: soak ? sub : {label: 'TO THE BATTERY', target: 'dial-battery'}};
    case 2: return {key, from: SENDERS.market, sev: 'warn', text: low + (soak ? ' Make room: book a hot-water soak, charge the battery, and stop a gas unit if one is running.'
      : ' Make room: charge the battery, and stop a gas unit if one is running.'), button: soak ? sub : stack};
    case 3: return {key, from: SENDERS.market, sev: 'warn', text: low + ' Units at minimum make more than the city uses: stop one, or frequency climbs until rooftop solar cuts back.', button: stack};
    default: return {key, from: SENDERS.market, sev: 'info', text: 'Low-demand notice cancelled: ' + (now ? 'demand is ' + mwc(r.minMW) + ' MW now, and the forecast does not go lower.'
      : 'the lowest demand forecast is now ' + mwc(r.minMW) + ' MW, at ' + hhmm(r.atS) + '.'), button: stack};
  }
}

/**
 * The card a record makes, or null. Pure (tests call it). {log: true, from, text}: a LOG line only, no card.
 * night: the night shift has the desk (Q-73; §32.12).
 * @returns {{key:string, from:string, sev:'info'|'warn', text:string, button:{label:string, target:string}}|{log:true, from:string, text:string}|null}
 */
export function cardOf(r, night = false) {
  switch (r.kind) {
    case 'announce': {
      const n = r.news, [from, label, target] = NEWS[n.kind] || ['weather', 'SEE THE STACK', isWeather(n.kind) ? 'stack' : 'map'], to = target || leverIn(n.text);
      return {key: 'news:' + n.kind + ':' + n.fromS, from: SENDERS[from], sev: 'warn', text: n.text, button: {label: to === 'stack' ? 'SEE THE STACK' : label, target: to},
        holdS: n.atS > 0 ? n.fromS : 0};
    }
    case 'contingency':
      if (r.cause === 'unit') return {key: 'trip:' + r.id + ':' + r.tick, from: SENDERS.station, sev: 'warn',
        text: unitName(r.id) + ' tripped: ' + Math.round(r.lostMW) + ' MW lost. Protection lockout; the plan has a hole.',
        button: {label: 'TO THE LEVER', target: leverOf(r.id)}};
      if (r.cause === 'link') return {key: 'trip:tie:' + r.tick, from: SENDERS.station, sev: 'warn',
        text: 'Interconnector tripped: ' + Math.round(r.lostMW) + ' MW of import lost.', button: {label: 'TO THE TIE', target: 'knob-tie'}};
      return {key: 'trip:load:' + r.tick, from: SENDERS.station, sev: 'warn',
        text: 'Smelter potline tripped: ' + Math.round(Math.abs(r.lostMW)) + ' MW of load gone. Frequency rises.',
        button: {label: 'TO THE DIAL', target: 'dial-freq'}};
    case 'ufls':
      return {key: 'ufls:' + r.tick + ':' + r.stage, from: SENDERS.city, sev: 'warn',
        text: 'Relays shed ' + r.districts.join(' and ') + ' (UFLS stage ' + r.stage + ', ' + Math.round(r.mw) + ' MW). Restore when the permissive allows.',
        button: {label: 'TO THE RESTORE BAY', target: 'bay-restore'}};
    case 'shed':
      return {key: 'shed:' + r.tick + ':' + r.district, from: SENDERS.city, sev: 'warn',
        text: 'District ' + r.district + ' shed (' + r.why + ', ' + Math.round(r.mw) + ' MW).', button: {label: 'TO THE RESTORE BAY', target: 'bay-restore'}};
    case 'log':
      switch (r.code) {
        case 'UNIT_READY': return {key: 'ready:' + r.tick + ':' + r.msg, from: SENDERS.station, sev: 'info', text: night ? clockOf(r).replace(' (or SYNC now)', '') : clockOf(r),
          button: night ? {label: 'TO THE LEVER', target: leverIn(r.msg, ' at full speed')} : {label: 'TO THE SCOPE', target: 'bay-sync'}};
        // each command taken, at once (no key: each one a card)
        case 'UNIT_START': case 'UNIT_STOP': case 'UNIT_CANCEL': case 'UNIT_ABORT_STOP':
          return {key: null, from: SENDERS.station, sev: 'info', text: clockOf(r),
            button: {label: 'TO THE LEVER', target: leverIn(r.msg, ':')}};
        case 'UNIT_RELEASED': return {key: 'rel:' + r.tick + ':' + r.msg, from: SENDERS.station, sev: 'info', text: r.msg,
          button: {label: 'TO THE STACK', target: 'stack'}};
        case 'HYDRO_WATER': case 'HYDRO_EMPTY': return {key: 'water:' + r.code + ':' + r.msg.slice(0, 40), from: SENDERS.station, sev: 'warn',
          text: r.msg, button: {label: 'TO THE GATE', target: 'wheel-hydro'}};
        // (a front's onset: the dayplan's only, Q-83)
        case 'HEAT_ONSET': case 'STORM_ARRIVE': case 'WIND_CUTOUT': case 'CLOUD_ONSET': case 'WIND_DROUGHT': return r.code === 'CLOUD_ONSET' && !/suburb/.test(r.msg) ? null
          : {key: 'wx:' + r.code, from: SENDERS.weather, sev: r.sev === 'crit' ? 'warn' : 'info', text: r.msg, button: {label: 'SEE THE STACK', target: 'stack'}};
        // (Q-91: done: its restore moves the card to the LOG, so a closed feeder is never left as an instruction)
        case 'FEEDER_CLEAR': return {key: 'clear:' + r.district, from: SENDERS.network, sev: 'warn', done: r.district,
          text: r.district + ' feeder repaired and handed back: close its breaker (R or Enter at its card, or from the RESTORE bay).',
          button: {label: 'TO THE RESTORE BAY', target: 'bay-restore'}};
        case 'UNIT_AVAILABLE': return {key: null, from: SENDERS.station, sev: 'info', text: r.msg, button: {label: 'TO THE LEVER', target: leverIn(r.msg)}};
        case 'TIE_LIMIT_END': return {key: null, from: SENDERS.market, sev: 'info', text: r.msg, button: {label: 'TO THE TIE', target: 'knob-tie'}};
        case 'RERT_ARMED': case 'RERT_ONLINE': return {key: 'rert:' + r.code + ':' + r.tick, from: SENDERS.market, sev: 'info', text: r.msg,
          button: {label: 'TO THE KEY', target: 'key-rert'}};
        case 'DR_CALL': return {key: 'dr:' + r.tick, from: SENDERS.market, sev: 'info', text: r.msg, button: {label: 'TO DR', target: 'btn-dr'}};
        // Q-60: bookings, cancels and patience go to the LOG only; a suburb locking is a card
        case 'FLEX_BOOK': case 'FLEX_DEL': case 'PATIENCE': return {log: true, from: SENDERS.city, text: r.msg};
        case 'PATIENCE_LOCK': return {key: 'lock:' + r.suburb + ':' + r.tick, from: SENDERS.city, sev: 'info', text: r.msg + ' A cancel refunds a cycle\'s patience.',
          button: {label: 'TO THE SUBURB', target: 'suburb-' + r.suburb}};
        case 'MSL1': case 'MSL2': case 'MSL3': case 'MSL_CLEAR': return mslCard(r);
        case 'DIRECTED_SHED': return {key: 'dshed:' + r.tick, from: SENDERS.city, sev: 'warn', text: r.msg,
          button: {label: 'TO THE GAUGE', target: 'gauge-n1'}};
        case 'SECURITY':
          if (/SECURITY (SHORT|SHEDDING)/.test(r.msg)) {
            const lvl = /SHEDDING/.test(r.msg) ? 'SHEDDING' : 'SHORT';
            return {key: 'sec:' + lvl + ':' + Math.floor(r.tick / TPS / 1800), from: SENDERS.market, sev: 'warn',
              text: lvl === 'SHORT' ? 'Lack of reserve: spare in 5 min is below the biggest risk. ' + r.msg.replace(/^SECURITY SHORT: /, '')
                : 'Load is off supply: the system is SHEDDING.', button: {label: 'TO THE GAUGE', target: 'gauge-n1'}};
          }
          return null;
        default: return null;
      }
    default: return null;
  }
}

export function createTray() {
  return {cards: [], log: [], seen: {}, nextId: 1, rings: 0, rev: 0, view: null, viewRev: -1, night: false};
}

// A new card (its life stored now, Q-63), or null: a key seen today never repeats.
function add(tr, c, atS) {
  if (c.key) { if (tr.seen[c.key]) return null; tr.seen[c.key] = true; }
  const card = {id: 'card' + tr.nextId++, from: c.from, atS, text: words(c.text), button: c.button, sev: c.sev,
    untilS: Math.max(stepAfter(Math.max(atS, V.PLAYER_START_S), V.TRAY_LIFE_REAL_S), c.holdS || 0)};
  if (c.done) card.done = c.done;
  tr.cards.push(card);
  return card;
}

/**
 * Fold a step's records into the tray. Returns the audio cues: 'ring2' for a new warning card
 * (it rings twice, once), 'tick' for an information card (K-21 P3); none at night (Q-73).
 */
export function trayRecords(tr, recs) {
  const cues = [];
  let made = 0;
  for (const r of recs) {
    if (r.code === 'NIGHT_SHIFT') tr.night = true;
    if (r.kind === 'restore') { const i = tr.cards.findIndex(x => x.done === r.district); if (i >= 0) toLog(tr, tr.cards.splice(i, 1)[0]); continue; }
    const c = cardOf(r, tr.night);
    // an announce's log twin: no second card
    if (!c || r.kind === 'log' && recs.some(x => x.kind === 'announce' && x.news.text === r.msg)) continue;
    if (c.log) { toLog(tr, {from: c.from, atS: Math.floor(r.tick / TPS), text: c.text, sev: 'info'}); continue; }
    if (!add(tr, c, Math.floor(r.tick / TPS))) continue;
    made++;
    if (tr.night) continue;
    if (c.sev === 'warn') { cues.push('ring2'); tr.rings++; } else cues.push('tick');
  }
  // the oldest goes, information first; the n from before this call before any new
  while (tr.cards.length > MAX_CARDS) { const n = tr.cards.length - made, i = tr.cards.findIndex((c, j) => c.sev === 'info' && (j < n || n < 1)); toLog(tr, tr.cards.splice(Math.max(0, i), 1)[0]); }
  if (made) tr.rev++;
  return cues;
}

/** Q-81: the 04:00 news as cards at TAKE THE DESK; ['ring2'] once, or []. */
export function trayBriefing(tr, news) {
  let made = 0;
  for (const n of news) if (n.atS === 0 && add(tr, cardOf({kind: 'announce', news: n}), 0)) made++;
  while (tr.cards.length > MAX_CARDS) toLog(tr, tr.cards.shift());
  if (!made) return [];
  tr.rev++; tr.rings++;
  return ['ring2'];
}

function toLog(tr, card) {
  tr.rev++;
  tr.log.push(card);
  if (tr.log.length > MAX_LOG) tr.log.splice(0, tr.log.length - MAX_LOG);
}

/** Once per frame: cards whose life is over go to the LOG. */
export function trayFrame(tr, s) {
  for (let i = 0; i < tr.cards.length;) if (s >= tr.cards[i].untilS) toLog(tr, tr.cards.splice(i, 1)[0]); else i++;
}

/** Dismiss one card to the LOG (a tray view may offer it; it never dispatches). */
export function dismissCard(tr, id) {
  const i = tr.cards.findIndex(c => c.id === id);
  if (i < 0) return false;
  toLog(tr, tr.cards.splice(i, 1)[0]);
  return true;
}

/** vm.tray: {cards (<= 3, oldest first), log (newest last)}; each card's time as text too. */
export function trayView(tr) {
  if (tr.viewRev === tr.rev && tr.view) return tr.view;
  const view = c => Object.assign({}, c, {time: hhmm(c.atS), button: Object.assign({}, c.button)});
  tr.view = {cards: tr.cards.map(view), log: tr.log.map(view)};
  tr.viewRev = tr.rev;
  return tr.view;
}
