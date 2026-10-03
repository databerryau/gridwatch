// app/tray.js: the K-9 message tray model. Pure and DOM-free; desk/tray.js draws trayView()
// (vm.tray).
//
// Cards come from the sim's records: news (`announce`: the weather bureau), station notices
// (trips, a unit at full speed, lockout releases, water), market notices (the security level
// going SHORT or SHEDDING, reserve diesel, DR, and from Phase 2a the minimum-system-load levels,
// P-4 / desk/README.md C-9) and the city desk (UFLS, directed shedding, restores). Each card: a sender, a grid time, <= 25 words and ONE button that only focuses a
// control (and lights it, L-9); it never dispatches (K-9). At most 3 cards are visible; older
// ones and cards older than CARD_TTL_S go to the LOG drawer. Warning cards ring twice (the
// audio cue 'ring2') and never repeat: a warning's key (what it is about) is shown once a day.
// Cards never pause play (§7).

import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;
/** Visible cards (K-9). */
export const MAX_CARDS = 3;
/** A card leaves the tray for the LOG after this many grid seconds. */
export const CARD_TTL_S = 30 * V.S_PER_MIN;
/** Words on a card (K-9). */
export const MAX_WORDS = 25;
/** LOG entries kept. */
export const MAX_LOG = 200;

export const SENDERS = Object.freeze({weather: 'WEATHER BUREAU', market: 'MARKET NOTICE', station: 'STATION', city: 'CITY DESK'});

/** Cut text to MAX_WORDS words (an ellipsis marks a cut). */
export function words(text, max = MAX_WORDS) {
  const w = String(text).trim().split(/\s+/);
  return w.length <= max ? w.join(' ') : w.slice(0, max).join(' ') + '…';
}

const leverOf = unitId => {
  const st = unitId.replace(/\d+$/, '');
  return st === 'hydro' ? 'wheel-hydro' : V.STATION_IDS.includes(st) ? 'lever-' + st : 'stack';
};
const unitName = id => { const m = V.MACHINES.find(x => x.id === id); return m ? m.name : id; };
const hhmm = s => {
  const sod = ((V.DAY_START_H * V.S_PER_H + s) % V.DAY_S + V.DAY_S) % V.DAY_S;
  return String(Math.floor(sod / V.S_PER_H)).padStart(2, '0') + ':' + String(Math.floor((sod % V.S_PER_H) / V.S_PER_MIN)).padStart(2, '0');
};

const mwc = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * An MSL notice (P-4; desk/README.md C-9, §21.4) as a MARKET NOTICE card. It says the lowest demand
 * the forecast sees and its time (or that demand is at its lowest now), and the one thing this
 * desk can do at that level; never "below X" (a level held by its hysteresis can sit above its
 * threshold), and never the soak or the backstop (not on this desk yet). MSL1 is information; MSL2
 * and MSL3 ring. Its button only focuses a control, like every card's. The card is made from the
 * record alone, so it says nothing that depends on the desk's state at that moment (whether a gas
 * unit is running, whether the battery is already charging): the objective line says that.
 */
function mslCard(r) {
  const key = 'msl:' + r.code + ':' + r.tick;
  const nowS = Math.floor(r.tick / TPS), now = r.atS <= nowS;
  const low = now ? 'Demand is at its lowest now, ' + mwc(r.minMW) + ' MW.' : 'Lowest demand ' + mwc(r.minMW) + ' MW at ' + hhmm(r.atS) + '.';
  const stack = {label: 'SEE THE STACK', target: 'stack'};
  switch (r.level) {
    case 1: return {key, from: SENDERS.market, sev: 'info', text: low + (now ? ' Charge the battery if it has room.' : ' Power spilled then can go into the battery: charge it on the spill.'),
      button: {label: 'TO THE BATTERY', target: 'dial-battery'}};
    case 2: return {key, from: SENDERS.market, sev: 'warn', text: low + ' Make room: charge the battery, and stop a gas unit if one is running.', button: stack};
    case 3: return {key, from: SENDERS.market, sev: 'warn', text: low + ' Units at minimum make more than the city uses: stop one, or frequency climbs until rooftop solar cuts back.', button: stack};
    default: return {key, from: SENDERS.market, sev: 'info', text: 'Low-demand notice cancelled: ' + (now ? 'demand is ' + mwc(r.minMW) + ' MW now, and the forecast does not go lower.'
      : 'the lowest demand forecast is now ' + mwc(r.minMW) + ' MW, at ' + hhmm(r.atS) + '.'), button: stack};
  }
}

/**
 * The card a record makes, or null. Pure (tests call it).
 * @returns {{key:string, from:string, sev:'info'|'warn', text:string, button:{label:string, target:string}}|null}
 */
export function cardOf(r) {
  switch (r.kind) {
    case 'announce': {
      const n = r.news;
      const target = n.kind === 'heat' || n.kind === 'storm' || n.kind === 'drought' || n.kind === 'cloud' ? 'stack' : 'map';
      return {key: 'news:' + n.kind + ':' + n.fromS, from: SENDERS.weather, sev: 'warn', text: n.text, button: {label: 'SEE THE STACK', target}};
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
        case 'UNIT_READY': return {key: 'ready:' + r.tick + ':' + r.msg, from: SENDERS.station, sev: 'info', text: r.msg,
          button: {label: 'TO THE SCOPE', target: 'bay-sync'}};
        case 'UNIT_RELEASED': return {key: 'rel:' + r.tick + ':' + r.msg, from: SENDERS.station, sev: 'info', text: r.msg,
          button: {label: 'TO THE STACK', target: 'stack'}};
        case 'HYDRO_WATER': case 'HYDRO_EMPTY': return {key: 'water:' + r.code + ':' + r.msg.slice(0, 40), from: SENDERS.station, sev: 'warn',
          text: r.msg, button: {label: 'TO THE GATE', target: 'wheel-hydro'}};
        case 'HEAT_ONSET': case 'STORM_ARRIVE': case 'WIND_CUTOUT': return {key: 'wx:' + r.code, from: SENDERS.weather, sev: 'warn',
          text: r.msg, button: {label: 'SEE THE STACK', target: 'stack'}};
        case 'RERT_ARMED': case 'RERT_ONLINE': return {key: 'rert:' + r.code + ':' + r.tick, from: SENDERS.market, sev: 'info', text: r.msg,
          button: {label: 'TO THE KEY', target: 'key-rert'}};
        case 'DR_CALL': return {key: 'dr:' + r.tick, from: SENDERS.market, sev: 'info', text: r.msg, button: {label: 'TO DR', target: 'btn-dr'}};
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
  return {cards: [], log: [], seen: {}, nextId: 1, rings: 0, rev: 0, view: null, viewRev: -1};
}

/**
 * Fold a step's records into the tray. Returns the audio cues: 'ring2' for a new warning card
 * (it rings twice, once), 'tick' for an information card (K-21 P3).
 */
export function trayRecords(tr, recs) {
  const cues = [];
  for (const r of recs) {
    const c = cardOf(r);
    if (!c) continue;
    if (tr.seen[c.key]) continue; // never repeats
    tr.seen[c.key] = true;
    const card = {id: 'card' + tr.nextId++, from: c.from, atS: Math.floor(r.tick / TPS), text: words(c.text), button: c.button, sev: c.sev};
    tr.cards.push(card);
    if (c.sev === 'warn') { cues.push('ring2'); tr.rings++; } else cues.push('tick');
  }
  while (tr.cards.length > MAX_CARDS) toLog(tr, tr.cards.shift());
  if (cues.length) tr.rev++;
  return cues;
}

function toLog(tr, card) {
  tr.rev++;
  tr.log.push(card);
  if (tr.log.length > MAX_LOG) tr.log.splice(0, tr.log.length - MAX_LOG);
}

/** Once per frame: cards older than CARD_TTL_S go to the LOG. */
export function trayFrame(tr, s) {
  while (tr.cards.length && s - tr.cards[0].atS > CARD_TTL_S) toLog(tr, tr.cards.shift());
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
