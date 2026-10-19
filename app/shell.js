// app/shell.js: the game page (next.html) around app/game.js. It mounts the map, the desk and
// the Live Stack (whichever modules boot.js passes in), draws the header and the overlays
// (briefing, watch, respond card, end card, drawer, "?" labels, toast, ?perf), runs the frame
// loop (ticks, then the view model, then every module draws: never inside step(), X-26),
// binds the K-23 keys and starts the audio on the first gesture.
//
// app/boot.js is the page's one module script: it imports the real modules and calls
// bootGame(document, {...}). Tests call bootGame with the stand-in DOM (tests/lib/dom.js) and
// stand-in modules, so the shell is tested before the other stage B files exist.
//
// Element ids other modules rely on:
//   #map, #desk      the roots createMap / createDesk receive
//   #stack-slot      created BY THE DESK in its third column: createLiveStack's root. If the
//                    desk has none, the shell makes one at the end of #desk.
//   #stack-overlay   L-4: while vm.stackExpanded the shell moves the Live Stack's `el` here
//                    (over the map, ~1248 x 420) and back into #stack-slot after; the stack
//                    sizes its canvas from its parent on update.
//
// Phase 1b (desk/README.md §13): the SETTINGS popover (#btn-settings, `,`; B-7) and the body
// classes rm / fxlow / crt that follow vm.settings; the one key listener and its order (§13.3:
// the desk's key(ev), then the stack's and the map's, then app/keys.js); the #aria-live region
// (createLive / liveFrame below); the ?perf budget marks; ?debug -> globalThis.gridwatch.
// desk/README.md §30: texts and the alarm panel on demand (Q-44, Q-46), "?" and Esc (Q-47), par (Q-48).
// desk/README.md §32.8.2 (2c): the briefing's Watch for (Q-81), the header's HAND chip (D-7), the night
// strip in the objective's place from 21:00 and the end card fetched then (Q-73). Enter at the RESPOND card
// closes it on the capture phase, before any control's own Enter (K-16: a RESTORE row's would close a breaker).
// Q-91: the feeder card (#feeder-card, drawFeeder from vm.feeder: what, the keys in blue, what going on means,
// before a press why a restore would be refused now in amber (vm.feeder.lamp), a refused restore's reason in
// red (the grid's refusal), and two blue buttons: #feeder-restore "RESTORE <id>" (the restore of its feeder)
// and #feeder-go-on "GO ON" (ui 'goOn')). On the capture phase (feederFirst, after Esc's closeTop: an Esc that
// closed something stops there), while the director plays FEEDER-CARD, Enter or R sends the restore of the
// feeder it names (actions.input: a refusal toasts in red and the card stays) and Esc goes on, but in
// SETTINGS, the drawer and "?", and but Enter on a RESTORE row (the bay's CLOSE), the suburb card or the
// card's own buttons, which is theirs. A key's auto-repeat is swallowed, and so is an Enter or R within
// FEEDER_ARM_MS (250 real ms) of the Enter that closed the RESPOND card (cardFirst; a queued card shows on
// that press), with a blue answer. A click on the card's body focuses its feeder's CLOSE (restore-<id>) and
// the card stays. It sits over the map (never the desk's Live Stack or bay); with the stack out (L) the body
// class stack-out (placeStack) moves it over the lever bank. The objective line waits while it shows, as at
// the respond card (the card is the one instruction while the clock holds), but a ‼ URGENT line stays up.
// W6 (K-22, K-23; the 2026-10-17 accessibility audit): the briefing's AGC/HAND is a radio group (one Tab stop, the arrows:
// radioKey); the end card's h2 and the shelf's first day take the focus on show and give it back on close, and Space on their
// buttons is the buttons'; #aria-live says the objective line when what it asks changes, the RESPOND card and the end card's
// score (the line itself is no live region); a toast is said politely when blue and at once when red; a "?" pressed by a key
// puts the focus in its popover.

import {V} from '../sim/params.js';
import * as G from './game.js';
import {allIn, grade, parShedMWh} from './score.js';
import {startRaf} from './loop.js';
import {createKeys, bindKeys, poll as pollKeys, typing} from './keys.js';
import {createAudio} from '../audio/audio.js';
import {ANCHORS} from '../content/anchors.js';
import {badgeText, badgeTitle, BADGE_HELP, NIGHT_LOCK, lightsChip, centsText, co2Text, clockText, allInCents, mw, VCR_TEXT, VER_TEXT} from '../render/format.js';
import {BEATS, FEEDER_ON} from './watch.js';
import {modeOf, feederCard} from './director.js';
import {observe} from '../sim/step.js';
import {unitLabel} from '../desk/util.js';
import {puzzleNumber} from './share.js';
import {localYmd} from './history.js';
import {pastDailies, hardDays, resultText, isoOf} from './shelf.js';
import {outlookWord} from './week.js';

/** K-17: header, map and desk heights (px) for a viewport; the CSS in next.html does the same. */
export function layoutSizes(width, height) {
  const header = width >= 1600 ? 40 : 32;
  const desk = Math.max(300, Math.floor((height - header) / 2));
  return {header, desk, map: height - header - desk};
}

const WATCH_WORDS = {inertia: 'INERTIA', battery: 'BATTERY', governors: 'GOVERNORS', ufls: 'UFLS', settle: 'SETTLE'};
/** K-15 (Q-97): the strips, as [word, the beat indices it lights]: a fall's five beats; a rise's own three. */
export const FALL_STRIP = Object.freeze(BEATS.map((b, i) => [WATCH_WORDS[b], [i]]));
export const RISE_STRIP = Object.freeze([['SPIN', [0]], ['INVERTERS', [1, 2]], ['SETTLE', [3, 4]]]);
// Why F did nothing, by mode (the director's setFast refuses these).
const FAST_WAIT = {WATCH: 'the watch plays the trip in slow motion', 'RESPOND-CARD': 'read the card, then Enter',
  RESPOND: 'RESPOND runs 30× until frequency is back in band', FOCUS: 'the clock runs 1× while you SYNC or RESTORE',
  ALARMS: 'the alarm panel holds the clock: Esc closes it', 'FEEDER-CARD': 'a feeder you may close holds the clock: R, Enter or Esc restores it',
  OFFER: 'a unit is at full speed: O opens its synchroscope (30× for at most 8 s)', NIGHT: 'the night shift runs the roll to 04:00'};
/** Q-48: par's ticks per frame while the day runs, and once it is over. */
export const PAR_STEP_TICKS = 3000, PAR_STEP_OVER_TICKS = 6000;
/** D-21: real ms a frame the no-GUARD twin may replay for, once the day is over. */
export const TWIN_BUDGET_MS = 10;
/** X-46: par's in-page slice stops past this many real ms a frame (the day over: no limit). */
export const PAR_BUDGET_MS = 1.5;
/** Q-91: a feeder card that shows on the Enter that closed the RESPOND card takes Enter or R this many real ms later. */
export const FEEDER_ARM_MS = 250;
// Q-46 (§30.3.6): the alarm panel's own keys inside it; the keys that never close it (F: refused, FAST_WAIT).
const SUB = /^suburb-/, CARD_OWN = /^(Arrow\w+|Page\w+|Home|End|Enter|Tab|[sxp=-])$/i, PANEL_OWN = /^(Arrow\w+|Home|End|Enter|Tab)$/, PANEL_KEEPS = /^([ wWaAfFhH?,]|Escape|Spacebar|Shift|Control|Alt\w*|Meta|OS|CapsLock|Fn|Dead|Unidentified)$/;
/** The CRT switch's title and answer while REDUCED EFFECTS is on (it is greyed). */
export const CRT_OFF = 'CRT is off while REDUCED EFFECTS is on';

/** Q-47: the popover beside its "?" (rect r): below if it fits, else on the roomier side; never over the "?". */
export function popoverPlace(r, w, h, vw, vh) {
  const below = vh - r.bottom, down = h <= below - 12 || below >= r.top;
  return {left: Math.max(8, Math.min(r.left - 200, vw - w - 8)), top: down ? r.bottom + 4 : null, bottom: down ? null : vh - r.top + 4,
    maxHeight: (down ? below : r.top) - 12};
}

// ------------------------------------------------------------------ the objective line's word (Q-18, C-10)

// The level as a glyph and a word (K-22: never colour alone). By level; and by kind where the
// level's own word would say the wrong thing: a STOP or a BATTERY line is advice about cost, never
// URGENT, and a line about spare or a dark district names what it is about. Never SHORT, the
// BALANCE bar's word.
const LEVEL_WORD = Object.freeze({ok: '✓ STEADY', plan: '◷ PLAN', act: '▶ ACT NOW', crit: '‼ URGENT'});
const KIND_WORD = Object.freeze({
  watch: {ok: '◉ WATCH', plan: '◉ WATCH', act: '◉ WATCH', crit: '◉ WATCH'},
  stop: {plan: '◇ SAVING', act: '▶ ACT NOW', crit: '▶ ACT NOW'},
  battery: {plan: '◇ BATTERY', act: '▶ BATTERY', crit: '▶ BATTERY'},
  spare: {plan: '◷ SPARE', crit: '▶ ACT NOW'},
  restore: {plan: '◷ DARK', crit: '▶ ACT NOW'},
  city: {plan: '◇ SUBURB (H)', act: '▶ SUBURB (H)', crit: '▶ SUBURB (H)'},
});
/** The word beside a consequence line (C-10): what a guarded press would do. */
export const CONSIDER_WORD = '? IF PRESSED';
/** The words while a guard's cover is up (vm.armed), and for a unit on its way (level 'ok'). */
export const ARMED_WORD = '● ARMED', UNDER_WAY_WORD = '✓ UNDER WAY';

/** The glyph and word shown beside an objective line {kind, level} (app/objective.js). */
export function objectiveWord(o) {
  if (!o) return '';
  const byKind = KIND_WORD[o.kind];
  return (byKind && byKind[o.level]) || LEVEL_WORD[o.level] || '';
}

/**
 * The briefing's line about the day (P-3; desk/README.md §21.4): its type and whether it is a
 * weekday, from the public obs.day only (a heatwave day reads HOT, C-2). plan: on a day the event
 * director planned, {heat: a heatwave announced at 04:00, word: the day's outlook word} (Q-80: a HOT
 * day without one has none coming; Q-110: a storm or low wind "likely later", as the week ahead said,
 * its time in the warning on the day); null on the classic day, whose heatwave is announced mid-morning.
 */
export function dayText(day, plan) {
  if (!day) return '';
  const when = day.weekend ? 'weekend' : 'weekday';
  const lean = day.weekend ? ', one coal unit off' : '', later = (plan && LATER[plan.word]) || '';
  if (day.temp === 'MILD') return 'Today: a mild ' + when + lean + (day.weekend ? '.' : ': rooftop solar cuts midday demand.') + later;
  return 'Today: a hot ' + when + lean + (!plan ? '; any heatwave warning comes mid-morning.' : plan.heat ? ', heatwave this afternoon.' : ', no heatwave forecast.') + later;
}
/** Q-110: the day line's outlook sentence for a storm or a wind drought (app/week.js's words): no time, which the warning gives. */
export const LATER = Object.freeze({storm: ' Storms likely later.', 'low wind': ' Low wind likely later.'});
/** The day line's plan (dayText) from the state at 04:00 and its obs: null on the classic day (no director's plan). */
export const dayPlan = (st, obs) => (st.scn.dayplan ? {heat: obs.news.some(n => n.kind === 'heat' && n.atS === 0), word: outlookWord(st.seed, st.scn)} : null);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** D-3: the briefing's date line from a YYYYMMDD seed ('Friday 16 October 2026'), else 'Seed N'. */
export function dateText(seed) {
  const y = Math.floor(seed / 1e4), m = Math.floor(seed / 100) % 100, d = seed % 100;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (!(y >= 2000 && y < 2100) || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return 'Seed ' + seed;
  return DAYS[t.getUTCDay()] + ' ' + d + ' ' + MONTHS[m - 1] + ' ' + y;
}

// Q-81 (§32.8.2): one brief per 04:00 news item, from its kind and the public obs (each <= 8 words)
const hm = s => clockText(s, false);
const BRIEF = {
  heat: n => 'heatwave ' + hm(n.fromS) + '–' + hm(n.toS),
  tie: (n, o) => 'tie import ≤ ' + mw(o.tie.importLimitMW) + ' MW until ' + hm(n.toS),
  outage: (n, o) => unitLabel((o.units.find(u => u.outUntilS === n.toS) || {}).id) + ' out until ' + hm(n.toS),
  network: (n, o) => {
    const ds = o.districts.filter(d => d.clearS >= 0).sort((a, b) => a.clearS - b.clearS);
    return ds.map(d => d.id).join(', ') + (ds.length > 1 ? ' feeders' : ' feeder') + ' back ' + [...new Set(ds.map(d => hm(d.clearS)))].join(', ');
  },
};
/**
 * The briefing's "Watch for" (Q-81): one brief per news item announced at 04:00, in their order; then the GUARD the night shift
 * hands over (guardMW, the scenario's 04:00 commitment: Loy Yang's day arms it, D-29), so the GUARD the watch names is no surprise.
 */
export const watchFor = (obs, guardMW = 0) => obs.news.filter(n => n.atS === 0 && BRIEF[n.kind]).map(n => BRIEF[n.kind](n, obs))
  .concat(guardMW > 0 ? ['the night shift\'s battery GUARD at ' + mw(guardMW) + ' MW'] : []);
/** F-7: the resume's replay runs this long a frame (real ms: the page shows only the briefing meanwhile); and what a player is told when a saved run cannot replay. */
export const RESUME_BUDGET_MS = 250;
export const RESUME_LOST = 'GRIDWATCH was updated, so your shift could not resume. Your history and streak are kept.';
/** W6 (Y-2): the practice days whose briefing offers the shelf (never a first visit's, nor with no history: D-3's one click). */
export const SHELF_ON = Object.freeze(['done', 'past', 'future', 'seed']);
/** W6 (Y-2): the practice shelf's notes. */
export const SHELF_NOTE = 'Practice never changes your streak: only today\'s daily counts.';
export const HARD_NOTE = 'Par sheds load on every one of these days. You are graded on what par could save.';
/** W6 (Y-2, Q-99): the briefing title's tag for the run's status, and why (its title attribute). */
export const RUN_TAG = Object.freeze({first: 'FIRST SHIFT', official: 'OFFICIAL', practice: 'PRACTICE'});
export const RUN_WHY = Object.freeze({first: 'Your first shift: practice, unless you count it at the end.',
  official: 'Today\'s daily: this run counts once the clock passes 09:00 (one official run a day).',
  done: 'Today\'s official run is in: this one is practice.', past: 'A past daily: practice. Only today\'s counts.', seed: 'Not a daily: practice.',
  future: 'Not today\'s daily: practice. Only today\'s counts.', hard: 'A Hard day: par sheds load on it, so you are graded on the rest. Practice.', off: 'History is off in this browser (no storage): practice, nothing counts.',
  nodaily: 'GRIDWATCH has no gate-checked daily for today\'s date yet: this day is practice, and nothing counts.'});
/** W6 (D-29): the briefing account's head: an anniversary daily's date is the incident's; a Hard day is played on any date, so it takes the end card's head for a true story. */
export const ACCOUNT_HEAD = Object.freeze({dated: 'ON THIS DAY', hard: 'THIS REALLY HAPPENED'});
/** F-8: the briefing title on a date past the dailies' calendar. */
export const NO_DAILY = 'No daily today · PRACTICE';
/** Q-75: a daily played outside the gate-checked list says so, before play and after (app/endcard.js). */
export const NOT_GATED = 'Not gate-checked: this day may not be solvable.';
/**
 * The briefing's "Watch for" into `w` (next.html #briefing-watch, in the card's own colour): a bold head and the
 * day's briefs (<= 30 words, D-3; guardMW: watchFor's), then NOT_GATED on its own line when `gated` is false; hidden with neither.
 */
export function watchForInto(doc, w, obs, gated, guardMW = 0) {
  const b = watchFor(obs, guardMW), el = (tag, s) => { const e = doc.createElement(tag); e.textContent = s; return e; };
  w.replaceChildren();
  if (b.length) w.append(el('b', 'Watch for:'), ' ' + b.join('; ') + '.');
  if (gated === false) { const g = el('span', NOT_GATED); g.className = 'gate'; w.append(' ', g); }
  w.hidden = !b.length && gated !== false;
}

/** The briefing's goals (Q-48, §30.7; Q-69): the ALL-IN score's three parts, their prices from the params, and par (<= 60 words). */
export const GOALS_TEXT = 'Keep the lights on, cheaply and cleanly. Your score is one total: supply\'s cost, plus ' + VCR_TEXT +
  ' for each MWh dark that is yours (a feeder under repair becomes yours at its hand-back), plus ' + VER_TEXT + ' a tonne of CO₂: ' +
  'regulators\' values of reliability and emissions. Par, GRIDWATCH\'s autopilot on this day, scores 1000; a smaller total scores more.';

/** D-7, Q-64: the header's HAND chip (amber, with the word) before the night shift, and after it on a HAND-flown day. */
export const HAND_CHIP = Object.freeze({
  day: ['HAND', 'Flown by hand: no AGC trim from 04:30 until 21:00, when the night shift takes the desk on AGC'],
  night: ['HAND-FLOWN · NIGHT SHIFT ON AGC', 'You flew the day by hand; the night shift has the desk on AGC until 04:00'],
});
/** Q-73: the night strip redraws its figures at most this often (real ms), so each can be read. */
export const NIGHT_REDRAW_MS = 500;
/** A toast lives max(TOAST_MS, TOAST_WORD_MS a word) (real ms), so it can be read (§32.11). */
export const TOAST_MS = 3000, TOAST_WORD_MS = 300;
const NBSP = String.fromCharCode(0xa0);   // (K-23: a toast's words again, made new for its live region)
const millions = x => '$' + (x / 1e6).toFixed(1) + 'M';

// ------------------------------------------------------------------ the live region (K-23, §13.3)

/** #aria-live says at most one message per this many real ms. */
export const LIVE_GAP_MS = 2000;
// What waits is one slot per kind (the newest of a kind replaces the older: "newest alarm
// wins"), said in this order: a card that holds the clock first (the RESPOND card, the end card's score).
const LIVE_ORDER = ['card', 'alarm', 'line', 'guard', 'tray', 'band', 'level', 'mode'];
const BAND_TEXT = {normal: 'Frequency back in the normal band', outside: 'Frequency outside the normal band',
  containment: 'Frequency outside the containment band'};

/** The frequency band the live region names: 'normal' | 'outside' (normal) | 'containment' (outside it). */
export function bandOf(hz) {
  if (hz < V.CONTAIN_LO_HZ || hz > V.CONTAIN_HI_HZ) return 'containment';
  return hz < V.NORMAL_LO_HZ || hz > V.NORMAL_HI_HZ ? 'outside' : 'normal';
}

/** A new live-region model (pure; liveFrame feeds it a vm per frame). */
export function createLive() {
  return {primed: false, lastMs: -Infinity, tick: -1, mode: '', seg: '', act: 0, band: '', bandSaid: '', level: '', levelSaid: '', tiles: {}, cards: new Set(),
    respond: -1, line: '', lineSaid: '', heldSaid: false, q: {}};
}

/** The objective line is hidden (Q-73: the night strip has its place; Q-91: a card holds the clock, but for a ‼ URGENT line at a feeder card). */
const lineHidden = v => v.phase !== 'play' || v.obs.over || !!v.respond || (!!v.feeder && !(v.objective && v.objective.level === 'crit')) || !!v.obs.nightShift;
const firstSentence = s => (/^.*?[.!?](?=\s|$)/.exec(s) || [s])[0];
/**
 * K-23: what the live region says of an objective line: its word without the glyph, and the whole line (LINE_MAX_CHARS: at most
 * about 30 words), whose problem comes first and its ask after ('ACT NOW: You will be 250 MW short from 06:30. Start GT·A now: ...').
 */
export const lineWords = o => objectiveWord(o).replace(/^\S+\s+/, '') + ': ' + o.text;
/** Q-18: the line's note while the clock is held (the desk opens so); K-23: the live region says it once, at the desk's opening. */
export const HELD_NOTE = 'Clock held: press Space to run (you can act while paused).';
const heldAtOpening = v => v.phase === 'play' && v.mode.mode === 'PAUSE' && !v.obs.over && v.obs.tick === V.PLAYER_START_TICK;
/** K-23: what it says of a RESPOND card: what happened (its first sentence), what it leaves you, and the key (watch.js respondCard's lines). */
export const respondWords = r => [firstSentence(r.lines[0]), ...r.lines.slice(2)].join(' ');

// What the mode slot says: the badge; on a new D-2 segment its name first if the badge has it not
// ('PEAK, FAST 450×'), and on a new act the act's words before it (render/format.js badgeTitle; Q-78).
function modeWords(m, seg, act) {
  const b = badgeText(m), name = seg && !b.startsWith(m.segment) ? m.segment + ', ' : '', t = act ? badgeTitle(m).slice(0, -BADGE_HELP.length).trim() : '';
  return (t ? t + ' ' : '') + name + b;
}

/**
 * One frame of the live region: note what changed in `vm` (the mode, the D-2 segment or the act,
 * the frequency band, the N-1 word, a tile going into alarm or escalating, a new tray warning, what
 * the objective line asks, a new RESPOND card) and return the one message to say now, or null. At
 * most one per LIVE_GAP_MS; the rest wait, one per kind (L.q: the shell queues the end card's score there).
 */
export function liveFrame(L, vm, nowMs) {
  const obs = vm.obs;
  if (obs.tick < L.tick) { const fresh = createLive(); fresh.lastMs = L.lastMs; Object.assign(L, fresh); } // a new day on the same page
  L.tick = obs.tick;
  const first = !L.primed;
  L.primed = true;
  const m = vm.mode, mode = m.mode, seg = (m.segment || '') !== L.seg, act = (m.act || 0) !== L.act;
  // (a watch is said once; a segment or an act that changed inside it is said when it ends)
  if (mode === 'WATCH') { if (L.mode !== mode && !first) L.q.mode = 'WATCH'; L.mode = mode; }
  else if (mode !== L.mode || seg || act) {
    L.mode = mode; L.seg = m.segment || ''; L.act = m.act || 0;
    if (!first && !(mode === 'OVER' && vm.end)) L.q.mode = modeWords(m, seg, act);   // (the end card's h2 says DAY OVER: it takes the focus)
  }
  const band = bandOf(obs.f.hz);
  if (band !== L.band) { L.band = band; if (first) L.bandSaid = band; else L.q.band = BAND_TEXT[band] + ', ' + obs.f.hz.toFixed(2) + ' Hz'; }
  const level = obs.sec.level;
  if (level !== L.level) { L.level = level; if (first) L.levelSaid = level; else L.q.level = 'N-1 ' + level; }
  for (const t of vm.alarms.tiles) {
    const was = L.tiles[t.id], is = t.state + (t.escalated ? '!' : '');
    if (was !== is) {
      L.tiles[t.id] = is;
      if (t.state === 'alarm' && !first && (t.escalated ? !(was && was.endsWith('!')) : !(was && was.startsWith('alarm')))) {
        L.q.alarm = (t.escalated ? 'Alarm escalated: ' : 'Alarm: ') + t.label + ', ' + t.prio;
      }
    }
  }
  for (const c of vm.tray.cards) {
    if (L.cards.has(c.id)) continue;
    L.cards.add(c.id);
    if (c.sev === 'warn' && !first) L.q.tray = c.from + ': ' + c.text;
  }
  // K-23: the RESPOND card (K-16), once a card: Enter closes it from anywhere, so it is said before anything else waiting
  const r = vm.respond;
  if (r && r.n !== L.respond && !first) L.q.card = respondWords(r);
  L.respond = r ? r.n : -1;
  // K-23: the objective line (Q-18), whole, when what it asks changes (its level, kind and first control): new figures alone never
  // make it speak, and it never says a START or STOP guard's C-10 consider text (a hover would), nor the paused suffix but once at the desk's opening (below)
  // (#objective is no live region: it rewrites itself several times a minute)
  const o = vm.objective && vm.objective.text && !lineHidden(vm) ? vm.objective : null, line = o ? o.level + '|' + o.kind + '|' + (o.targets[0] || '') : '';
  if (line !== L.line) { L.line = line; if (first) L.lineSaid = line; else if (o) L.q.line = lineWords(o); else delete L.q.line; }
  // Q4 (W7): the GUARD ring turned down is priced in #objective; the ring's own value says only "GUARD n MW", so its
  // price is said here, the newest replacing one not yet said (a turn of several steps says its last)
  const gc = vm.consider && vm.consider.target === 'ring-guard' && !lineHidden(vm) ? vm.consider.text : '';
  if (gc && gc !== L.guardSaid) { L.guardSaid = gc; L.q.guard = CONSIDER_WORD.slice(2) + ': ' + gc; }
  if (nowMs - L.lastMs < LIVE_GAP_MS) return null;
  // A band, level or line that flapped back to what was last said has nothing to say.
  if (L.q.band && L.band === L.bandSaid) delete L.q.band;
  if (L.q.level && L.level === L.levelSaid) delete L.q.level;
  if (L.q.line && L.line === L.lineSaid) delete L.q.line;
  for (const k of LIVE_ORDER) {
    let text = L.q[k];
    if (!text) continue;
    delete L.q[k];
    if (k === 'band') L.bandSaid = L.band;
    if (k === 'level') L.levelSaid = L.level;
    if (k === 'line') L.lineSaid = L.line;
    // (the desk opens with the clock held: the first line or badge said there says so, once; a pause the player made, never)
    if ((k === 'line' || k === 'mode') && !L.heldSaid && heldAtOpening(vm)) { L.heldSaid = true; text += (/[.!?]$/.test(text) ? ' ' : '. ') + HELD_NOTE; }
    L.lastMs = nowMs;
    return text;
  }
  return null;
}

// vm.settings key -> the popover's control id (next.html #settings).
const SET_RANGES = {volume: 'set-volume', hum: 'set-hum', fx: 'set-fx', alarms: 'set-alarms'};
const SET_CHECKS = {reducedMotion: 'set-rm', reducedEffects: 'set-fxlow', crt: 'set-crt'};

/**
 * Boot the game on `doc`.
 * @param {Document} doc
 * @param {{createDesk?:function, createLiveStack?:function, createMap?:function, system?:object, planview?:object,
 *   search?:string, storage?:object|null, audioWin?:object, raf?:boolean, now?:function():number, date?:Date,
 *   matchMedia?:function(string):{matches:boolean}|null, text?:object|function, alarmPanel?:object|function,
 *   endCard?:object|function, perf?:object|function, suburbCard?:object|function, par?:boolean|object}} deps
 *   raf: false to skip startRaf (tests call handle.frame(dtS) themselves). matchMedia: the
 *   system's prefers-reduced-motion is read through it (default: globalThis.matchMedia when
 *   present; null: no system preference).
 *   text, alarmPanel, endCard (Q-44, §30.9), perf (?perf), suburbCard: the module (tests), a loader of it, or absent: imported on first need.
 * @returns {object} handle {game, actions, frame(dtS), vm(), audio, mods, keys, perf, live, loadText(), closeTop(), unbind()}
 */
export function bootGame(doc, deps) {
  const o = deps || {};
  const $ = id => doc.getElementById(id);
  const now = o.now || (() => globalThis.performance.now());
  const search = o.search === undefined ? (globalThis.location ? globalThis.location.search : '') : o.search;
  const query = new URLSearchParams(search);
  // K-22: reduced motion defaults from the system. Asked on every read, so a change of the
  // system setting is followed without a listener.
  const mm = o.matchMedia === undefined ? (typeof globalThis.matchMedia === 'function' ? q => globalThis.matchMedia(q) : null) : o.matchMedia;
  let rmQuery = null;
  try { rmQuery = mm ? mm('(prefers-reduced-motion: reduce)') : null; } catch { rmQuery = null; }
  const game = G.createGame({daily: G.dailyFrom(search, o.date), system: o.system, planview: o.planview, scenario: o.scenario, commit: o.commit,
    startPaused: o.startPaused, par: o.par, todayOf: () => localYmd(o.date || new Date()),   // (W6, Y-1: the player's local date, at each new day)
    storage: o.storage === undefined ? safeStorage() : o.storage, reducedMotion: () => !!(rmQuery && rmQuery.matches)});
  const audio = createAudio(o.audioWin === undefined ? globalThis : o.audioWin);
  let perf = null, PF = null;
  const keys = createKeys();
  const live = createLive();
  let vm = null, lastPerfDraw = -1e9, toastUntil = 0, qNext = 0;

  // ---------------------------------------------------------------- actions (desk/README.md §4)
  const base = G.makeActions(game);
  let opener = null; // Q-46: the focus when the alarm panel opened
  let cardFrom = null, cardTake;
  const actions = {
    input: x => { const r = base.input(x), lock = G.isLock(r); if (r) showToast(lock ? r : 'Refused: ' + r, lock ? 'info' : ''); return r; },
    redispatch: () => { const r = base.redispatch(), lock = G.isLock(r); if (r) showToast(lock ? r : 'RE-DISPATCH: ' + r, lock ? 'info' : ''); return r; },
    soakCity: atS => { const r = base.soakCity(atS), lock = G.isLock(r); if (r) showToast(lock ? r : 'Refused: ' + r, lock ? 'info' : ''); return r; },   // (Q1)
    ui: cmd => {
      const inTray = cmd && cmd.do === 'tray' && $('tray') && $('tray').contains(doc.activeElement);
      const wasOpen = !!game.ui.alarmsOpen, wasCard = game.ui.suburb;
      if (cmd && cmd.do === 'alarms' && !wasOpen) opener = doc.activeElement;
      const r = base.ui(cmd);
      if (cmd) answer(cmd, r, inTray);
      if (!wasCard && game.ui.suburb) cardFrom = doc.activeElement;
      if (cmd && cmd.do === 'focus' && cmd.target && !r) focusEl(cmd.target);
      else if (cmd && wasOpen && !game.ui.alarmsOpen) focusAfterPanel(cmd);
      if (!r && game.ui.suburb && cmd && cmd.do === 'suburb') cardTake = !(cmd.id && within('bay-restore', doc.activeElement));
      if (wasCard && !game.ui.suburb) cardBack();
      if (cmd && (cmd.do === 'drawer')) drawDrawer();
      if (cmd && (cmd.do === 'settings' || cmd.do === 'set' || cmd.do === 'mute' || cmd.do === 'coach')) drawSettings(G.settingsView(game), game.ui.settingsOpen);
      return r;
    },
    previewTrip: opts => base.previewTrip(opts),
    restorePreview: id => base.restorePreview(id),
  };

  // Every press answers (Q-41): a shell press that did nothing says why, in blue (help, never red).
  const held = () => game.phase === 'briefing' ? 'Take the desk first: Enter. Then Space runs the clock.'
    : 'Day over: PLAY THIS DAY AGAIN for another go';
  function answer(cmd, r, inTray) {
    const m = modeOf(game.director, game.state), say = s => showToast(s, 'info');
    if (cmd.do === 'pause' && r) say(held());
    if (cmd.do === 'fast' && cmd.on) {
      if (r) say('FAST waits: ' + (FAST_WAIT[m.mode] || 'not now') + (m.canSkip && m.mode === 'WATCH' ? ' (Esc skips)' : ''));
      else if (game.phase !== 'play' || game.state.over) say(held());
      else if (m.mode === 'PAUSE') say('FAST needs the clock running: Space');
    }
    if (cmd.do === 'skipWatch' && r && m.mode === 'WATCH') say('The first watch plays through: Esc skips from the next trip');
    if (r && (cmd.do === 'suburb' || SUB.test(cmd.target))) say(r);
    // M: onto the tray's newest message; M again (the keys in the tray): its LOG opens or closes.
    if (cmd.do === 'tray') {
      const log = $('btn-log');
      if (inTray && log) { log.click(); log.focus(); } else if (mods.desk && mods.desk.focus) mods.desk.focus('tray');
    }
  }

  function focusEl(id) {
    if (SUB.test(id)) { cardTake = true; return; }
    let el = $(id);
    // A box a browser cannot focus (#map: no tabindex) hands the focus to its focusable child
    // (the map's .citymap, which takes the keys).
    if (el && !el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName)) el = el.querySelector('[tabindex]') || el;
    if (el && el.focus) { try { el.focus(); } catch { /* ignore */ } }
  }

  // Q-46 (§30.3.4): once the panel closes, the focus goes back to its opener if shown, or to GO TO's
  // target. A focus still in the hidden panel is let go (its keys would stay the panel's).
  function focusAfterPanel(cmd) {
    let n = opener;
    if (cmd.do === 'alarmsGoto' && cmd.target) focusEl(cmd.target);
    else if (cmd.do === 'alarms' && n && n !== doc.body) {
      while (n && !n.hidden && n !== doc.body) n = n.parentElement;
      if (n === doc.body) opener.focus();
    }
    const ae = doc.activeElement;
    if (inPanel(ae) && ae.blur) ae.blur();
  }
  // t is inside the element with this id (the alarm panel, SETTINGS)
  function within(id, t) { const e = $(id); return !!(e && t && e.contains(t)); }
  function inPanel(t) { return within('alarm-panel', t); }

  // ---------------------------------------------------------------- modules
  const mods = {map: null, desk: null, stack: null, errors: []};
  const mount = (name, fn, root, opts) => {
    if (!fn || !root) return null;
    try { return opts === undefined ? fn(doc, root, actions) : fn(doc, root, actions, opts); } catch (e) { mods.errors.push(name + ': ' + (e && e.message ? e.message : e)); return null; }
  };
  mods.map = mount('map', o.createMap, $('map'));
  mods.desk = mount('desk', o.createDesk, $('desk'), {annunSlot: $('annun-slot')});
  let slot = $('stack-slot');
  if (!slot && $('desk')) {
    slot = doc.createElement('div');
    slot.id = 'stack-slot';
    $('desk').appendChild(slot);
  }
  mods.stack = mount('stack', o.createLiveStack, slot);
  let stackOut = false;
  // §13.3: the D and E holds belong to a mounted desk that takes keys.
  keys.deskHolds = !!(mods.desk && typeof mods.desk.key === 'function');

  // ---------------------------------------------------------------- header, briefing
  const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
  on('btn-pause', 'click', () => actions.ui({do: 'pause'}));
  on('rate-badge', 'click', () => actions.ui({do: 'pause'}));
  // K-16: a click on the card or the desk takes the desk, as Enter does
  const dismissCard = () => { if (game.respond) actions.ui({do: 'dismissRespond'}); };
  on('respond-card', 'click', dismissCard);
  // Q-91: the card's body goes to its feeder's CLOSE in the RESTORE bay (the card stays); its buttons restore or go on
  on('feeder-card', 'click', () => { const f = game.feeder; actions.ui({do: 'focus', target: f ? 'restore-' + f.id : 'bay-restore'}); });
  on('desk', 'pointerdown', dismissCard);
  on('annun-slot', 'pointerdown', ev => { if (!within('btn-explain', ev.target)) dismissCard(); }); // (§30.4; EXPLAIN: back on its close)
  on('btn-mute', 'click', () => { actions.ui({do: 'mute'}); });
  on('btn-coach', 'click', () => { actions.ui({do: 'coach'}); });   // O-8
  on('btn-done-before', 'click', () => { actions.ui({do: 'doneBefore'}); drawSettings(G.settingsView(game), game.ui.settingsOpen); });   // O-1
  on('btn-help', 'click', () => actions.ui({do: 'drawer'}));
  on('btn-drawer-close', 'click', () => actions.ui({do: 'drawer', on: false}));
  on('btn-pop-close', 'click', () => closePopover());
  // Q-64: the briefing's AGC/HAND is the sim's mode: the buttons send it and draw from obs.mode (the desk's key too). K-23: a
  // radio group with one Tab stop, the one picked (a roving tabindex; radioKey below gives it its keys)
  const RADIOS = [['btn-agc', 'AGC'], ['btn-hand', 'HAND']];
  const briefMode = mode => {
    for (const [id, m] of RADIOS) {
      const b = $(id), tab = mode === m ? '0' : '-1';
      if (b) { b.classList.toggle('on', mode === m); b.setAttribute('aria-checked', String(mode === m)); if (b.getAttribute('tabindex') !== tab) b.setAttribute('tabindex', tab); }
    }
  };
  // (the one already on logs nothing: a radio)
  const pickMode = m => { if (game.state.control.mode !== m) actions.input({type: 'mode', agc: m === 'AGC'}); briefMode(game.state.control.mode); };
  for (const [id, m] of RADIOS) on(id, 'click', () => pickMode(m));
  briefMode(game.state.control.mode);
  // K-23 (WCAG 2.1.1): the arrows on a focused AGC or HAND move the pick to the other one shown, and the focus with it; Enter or
  // Space on the one not picked picks it (the desk not taken). On the one picked they are the briefing's, as a native radio's
  // Enter submits its form: Enter takes the desk (D-3: a mouse player who clicked HAND, which focuses it, then presses Enter),
  // Space answers as on the rest of the card. True when the key was the radios'.
  function radioKey(ev) {
    const at = RADIOS.findIndex(([id]) => ev.target && ev.target.id === id);
    if (at < 0) return false;
    const k = ev.key, m = RADIOS[at][1];
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      if (game.state.control.mode === m) return false;
      pickMode(m);
      return true;
    }
    if (!/^Arrow(Left|Right|Up|Down)$/.test(k)) return false;
    const list = RADIOS.map(([id, mm]) => [$(id), mm]).filter(([b]) => b && !b.hidden), i = list.findIndex(([b]) => b === ev.target);
    const [b, next] = list[(i + (/Left|Up/.test(k) ? list.length - 1 : 1)) % list.length];
    pickMode(next);
    b.focus();
    return true;
  }
  // W6: the shelf owns Enter while it is open, and on MORE DAYS (a press there opens it, it never takes the desk)
  const shelfOwns = t => { const sh = $('shelf-card'); return (!!sh && !sh.hidden) || !!(t && (t.id === 'btn-shelf-brief' || (sh && sh.contains(t)))); };
  const take = () => {
    const sh = $('shelf-card');
    if (sh) sh.hidden = true;
    if (game.resumeSaved) { if (G.resumeBegin(game)) briefingText(); return; }   // (F-7: RESUME AT hh:mm)
    if (G.takeDesk(game)) { const b = $('briefing-card'); if (b) b.hidden = true; }
  };
  on('btn-take', 'click', take);
  // F-7: START OVER drops the saved run (an official run that passed 09:00 stays a DNF; this one is practice beside it)
  on('btn-restart', 'click', () => { if (game.replay) return; G.clearResume(game); G.resetDay(game); briefingText(); });
  if (game.resumeLost) showToast(RESUME_LOST, 'info');
  briefingText();

  function briefingText() {
    const b = $('briefing-card');
    if (!b) return;
    b.hidden = game.phase !== 'briefing';
    const hand = $('btn-hand'), agc = $('btn-agc'), saved = game.resumeSaved, takeB = $('btn-take'), restart = $('btn-restart');
    if (hand) hand.hidden = !G.handOffered(game) || !!saved;   // D-7: from the second shift (F-7: a resumed day keeps its own)
    if (agc) agc.hidden = !!saved;
    if (takeB) takeB.textContent = game.replay ? 'RESUMING…' : saved ? 'RESUME AT ' + clockText(saved.tick / V.TICKS_PER_S, false) : 'TAKE THE DESK';
    if (restart) restart.hidden = !saved || !!game.replay;
    const shelfB = $('btn-shelf-brief');   // (W6, Y-2: on a practice day's briefing; a first visit keeps its one click)
    if (shelfB) shelfB.hidden = !SHELF_ON.includes(G.runView(game).why) || G.firstShift(game) || !!game.replay;
    const st = game.state, obs = observe(st), day = $('briefing-day'), w = $('briefing-watch');
    if (day) day.textContent = dayText(st.day, dayPlan(st, obs));
    if (w) watchForInto(doc, w, obs, game.daily ? game.daily.gated : null, st.scn.commitment.battery.guardMW);
    const date = $('briefing-date');
    // (a daily's exception seed is its date + k·1e8, Q-75; a Hard day has no date: it is not that date's daily)
    if (date) date.textContent = game.hard ? '' : dateText(game.seed % 1e8);
    // W6 (D-29): an anniversary's account, the briefing's first card (no button: TAKE THE DESK stays D-3's one click), then
    // what of it today's desk echoes. Its head is ON THIS DAY under a daily's date; a Hard day (SA 2016) shows no date
    const an = G.anniversaryFor(game), acc = $('briefing-account'), accText = $('briefing-account-text'), accSrc = $('briefing-account-source');
    const accEcho = $('briefing-account-echo'), accHead = $('briefing-account-head');
    if (acc) acc.hidden = !an;
    if (accHead) accHead.textContent = game.hard ? ACCOUNT_HEAD.hard : ACCOUNT_HEAD.dated;
    if (accText) accText.textContent = an ? an.account : '';
    if (accEcho) accEcho.textContent = an ? an.echo : '';
    if (accSrc) { accSrc.textContent = an ? 'Source: ' + an.sourceName : ''; accSrc.href = an ? an.source : ''; }
    // W6: the daily's number (Y-1), the anniversary it is (D-29), and whether this run counts (Y-2, Q-99), its reason in the title
    const title = $('briefing-title'), ymd = G.dailyYmd(game), n = ymd ? puzzleNumber(ymd) : null, run = G.runView(game), what = an ? ' · ' + an.name + ', ' + an.year : '';
    if (title) {
      title.textContent = G.noDaily(game) ? NO_DAILY : n ? 'Daily #' + n + what + ' · ' + RUN_TAG[run.status] : game.hard ? 'Hard day ' + game.hard + what + ' · PRACTICE' : 'Practice desk' + what;
      title.title = game.hard ? RUN_WHY.hard : RUN_WHY[run.status === 'practice' ? run.why : run.status];
    }
    const score = $('how-score');   // D-3: the score's rule is behind the header "?" (HOW TO PLAY)
    if (score) score.textContent = GOALS_TEXT;
  }

  // ---------------------------------------------------------------- on demand (Q-44): a module passed in (tests), a loader, or import()
  const err = (what, e) => mods.errors.push(what + ': ' + (e && e.message ? e.message : e));
  function lazy(src, imp, got, fail) {
    if (src && typeof src === 'object') { try { got(src); } catch (e) { fail(e); } return; }
    Promise.resolve().then(typeof src === 'function' ? src : imp).then(got).catch(fail);
  }
  // loadText(): TEXT, or null while it loads (the first call starts it) or failed; open help redraws on arrival.
  let TEXT = null, textState = ''; // 'loading' | 'ready' | 'failed'
  const redrawHelp = () => { if (game.ui.drawer) drawDrawer(); if (popRows) fillPopover(); };
  function loadText() {
    if (textState) return TEXT;
    textState = 'loading';
    lazy(o.text, () => import('../content/text.js'), m => { TEXT = m.TEXT || null; textState = TEXT ? 'ready' : 'failed'; redrawHelp(); },
      e => { textState = 'failed'; err('text', e); redrawHelp(); });
    return TEXT;
  }
  if (query.has('perf')) lazy(o.perf, () => import('./perf.js'), m => { PF = m; perf = m.createPerf(); }, e => err('perf', e));

  // ---------------------------------------------------------------- "?" labels and the drawer (H-14, Q-47)
  const qButtons = new Map();
  const shown = e => { for (let n = e; n !== doc.body; n = n.parentElement) if (!n || n.hidden) return false; return true; }; // in the page, not hidden
  function placeQs() {
    const layer = $('q-layer'), hdr = $('hdr'), dr = $('drawer'), d = dr && !dr.hidden && dr.getBoundingClientRect();
    if (!layer) return;
    for (const {game: id, rows} of ANCHORS) {
      const el = $(id);
      let q = qButtons.get(id);
      if (!el) { if (q) q.hidden = true; continue; }
      if (!q) {
        q = doc.createElement('button');
        q.className = 'q';
        q.textContent = '?';
        q.dataset.anchor = id;
        q.title = rows.join(' · ');
        q.setAttribute('aria-label', 'About: ' + rows.join('; '));
        q.setAttribute('aria-controls', 'popover');
        q.setAttribute('aria-expanded', 'false');
        q.addEventListener('click', ev => toggleHelp(q, rows, ev));
        qButtons.set(id, q);
        // The header and the cards are the shell's own: their "?" sits inline right after the element. Desk,
        // stack and map elements get a floating badge on their top-right corner (their DOM is
        // their modules' own, so the shell never inserts into it).
        if (hdr && hdr.contains(el) || el.closest('.card')) q.classList.add('inline'); else layer.appendChild(q);
      }
      if (q.classList.contains('inline')) {
        // shown with its element; back after it when that was rebuilt
        if (!q.isConnected) { const p = el.parentElement; p.insertBefore(q, p.children[Array.prototype.indexOf.call(p.children, el) + 1] || null); }
        q.hidden = !shown(el);
        continue;
      }
      const r = el.getBoundingClientRect(), x = r.right - 26, y = r.top + 2;
      q.hidden = !(r.width > 0 && r.height > 0);
      q.style.left = Math.round(d && x + 24 >= d.left && y <= d.bottom ? r.left + 2 : x) + 'px'; // top-left when top-right is under the drawer
      q.style.top = Math.round(y) + 'px';
    }
  }
  function entryNodes(parent, e, headTag) {
    const h = doc.createElement(headTag);
    h.textContent = e.row;
    parent.appendChild(h);
    for (const [k, label] of [['real', 'Real world: '], ['ours', 'GRIDWATCH: '], ['why', 'Why: ']]) {
      const p = doc.createElement('p');
      const b = doc.createElement('b');
      b.textContent = label;
      p.appendChild(b);
      p.appendChild(doc.createTextNode(e[k]));
      parent.appendChild(p);
    }
  }
  // Q-47 (§30.3.7): every "?" calls toggleHelp; only closePopover() hides #popover. K-23: the popover is named by its first
  // heading (#pop-title); a "?" pressed by a key puts the focus in its text (#pop-body), and Esc or ✕ gives it back to the "?".
  let popAnchor = null, popRows = null;
  const expanded = (q, on) => { if (q) { q.setAttribute('aria-expanded', on); q.classList.toggle('on', on); } };
  function fillPopover() {
    const pop = $('popover'), body = $('pop-body'), T = loadText(), de = doc.documentElement;
    body.replaceChildren();
    for (const row of popRows) {
      // (a "?" may still name the title SPEC §8.2 has, which a renamed entry `replaces` until stage C)
      const e = T && T.abstractions.find(x => x.row === row || x.replaces === row);
      if (e) entryNodes(body, e, 'h4'); else body.appendChild(doc.createElement('h4')).textContent = row;
    }
    const title = body.querySelector('h4');
    if (title) title.id = 'pop-title';
    pop.style.maxHeight = ''; // (its own height)
    const p = popoverPlace(popAnchor.getBoundingClientRect(), pop.offsetWidth, pop.offsetHeight, de.clientWidth, de.clientHeight);
    for (const k in p) pop.style[k] = p[k] === null ? 'auto' : p[k] + 'px';
  }
  function openPopover(anchorEl, rows, byKey) {
    const pop = $('popover');
    if (!pop) return;
    expanded(popAnchor, false);
    expanded(popAnchor = anchorEl, true);
    popRows = rows;
    pop.hidden = false;
    fillPopover();
    if (byKey) focusEl('pop-body');
  }
  function closePopover() {
    const pop = $('popover'), a = popAnchor, had = !!pop && !pop.hidden && pop.contains(doc.activeElement);
    if (pop) pop.hidden = true;
    expanded(popAnchor, false);
    popAnchor = null; popRows = null;
    if (had) { if (a && shown(a)) a.focus(); else doc.activeElement.blur(); }
  }
  // ev: the "?"'s click (a key's has detail 0: a browser's own); without it (the end card's and the suburb card's "?"), the
  // input that came last: a key, or the pointer
  let keyed = false;
  const modality = ev => { keyed = ev.type === 'keydown'; };
  doc.addEventListener('keydown', modality, true);
  doc.addEventListener('pointerdown', modality, true);
  function toggleHelp(button, rows, ev) {
    if (button === popAnchor) closePopover(); else openPopover(button, rows, ev ? ev.detail === 0 : keyed);
  }
  doc.addEventListener('click', ev => {
    const pop = $('popover');
    if (pop && !pop.hidden && !(ev.target && ev.target.classList && ev.target.classList.contains('q')) && !pop.contains(ev.target)) closePopover();
    // A click anywhere else closes the SETTINGS popover (its own button toggles it).
    const set = $('settings'), btn = $('btn-settings');
    if (game.ui.settingsOpen && set && !set.contains(ev.target) && !(btn && btn.contains(ev.target))) actions.ui({do: 'settings', on: false});
  });
  // Q-47: under 300 px tall, an index of closed <details>. Focus: CLOSE on open, back after.
  let drawerShows = '', drawerFrom = null; // the textState and height it was built for (never frozen empty)
  function drawDrawer() {
    const d = $('drawer'), body = $('drawer-body'), help = $('btn-help');
    if (!d) return;
    const was = !d.hidden, open = !!game.ui.drawer;
    d.hidden = !open;
    doc.body.classList.toggle('q-on', open); // the "?" marks with it
    expanded(help, open);
    if (!open) {
      if (popAnchor && !popAnchor.classList.contains('inline')) closePopover(); // a floating badge's goes with it
      if (was && d.contains(doc.activeElement)) (drawerFrom !== doc.body && shown(drawerFrom) ? drawerFrom : help).focus();
      return;
    }
    const T = loadText(), short = d.clientHeight < 300;
    if (drawerShows !== textState + short) {
      drawerShows = textState + short;
      body.replaceChildren();
      if (!T) body.appendChild(doc.createElement('p')).textContent = textState === 'failed' ? 'The texts could not be loaded: reload the page to try again.' : 'Loading…';
      else for (const e of T.abstractions) {
        const det = body.appendChild(doc.createElement('article')).appendChild(doc.createElement('details'));
        det.open = !short;
        entryNodes(det, e, 'summary');
      }
    }
    if (!was) { drawerFrom = doc.activeElement; focusEl('btn-drawer-close'); placeQs(); }
  }

  // Q-46: the alarm panel, mounted on its first open; panel.focus() once, on the frame it first shows.
  let panel = null, panelState = '', panelShown = false;
  function drawAlarmPanel(v) {
    const box = $('alarm-panel');
    if (!box) return;
    if (box.hidden === v.alarmsOpen) box.hidden = !v.alarmsOpen;
    if (!v.alarmsOpen) { panelShown = false; return; }
    if (!panelState) {
      panelState = 'loading';
      box.textContent = 'Loading…';
      lazy(o.alarmPanel, () => import('./alarmpanel.js'), m => { box.replaceChildren(); panel = m.createAlarmPanel(doc, box, actions); },
        e => { box.textContent = 'The alarm panel could not be loaded. Esc or W closes it.'; err('alarm panel', e); });
    }
    if (!panel) return;
    try { panel.update(v); if (!panelShown) { panelShown = true; panel.focus(); } } catch (e) { err('alarm panel', e); }
  }

  let card = null, cardState = '';
  function drawSuburbCard(v) {
    const box = $('suburb-card'), on = !!v.suburb && !v.mode.locked;
    if (!box) return;
    if (box.hidden === on) box.hidden = !on;
    if (!on) { if (box.contains(doc.activeElement)) doc.activeElement.blur(); if (box.contains(popAnchor)) closePopover(); }
    if (!v.suburb) return; // (kept up to date while the watch hides it: its pre-checks read the latest vm)
    if (!cardState) {
      cardState = 'loading';
      box.textContent = 'Loading…';
      lazy(o.suburbCard, () => import('./suburbcard.js'), m => { box.replaceChildren(); card = m.createSuburbCard(doc, box, actions, {toast: showToast, loadText, toggleHelp, now}); },
        e => { box.textContent = 'The suburb card could not be loaded. Esc or H closes it.'; err('suburb card', e); });
    }
    if (!card) return;
    try { card.update(v, game.state); if (cardTake && on) { cardTake = false; card.focus(); } } catch (e) { err('suburb card', e); }
  }
  function cardBack() {
    const n = cardFrom, a = doc.activeElement;
    if (!within('suburb-card', a)) return;
    a.blur();
    if (n && n !== doc.body) shown(n) ? n.focus() : focusEl('map');
  }

  // ---------------------------------------------------------------- overlays
  /**
   * kind 'info': an answer to a press that did nothing (blue, Q-41); else a refusal (red). K-23: the box is shown, not read
   * (aria-hidden); a screen reader hears a blue answer politely (#toast-polite, role=status: it never cuts in) and a refusal at
   * once (#toast-alert, role=alert). The same words again are made new (a trailing no-break space), so they are said again.
   */
  function showToast(text, kind) {
    const t = $('toast');
    if (!t) return;
    t.className = kind === 'info' ? 'info' : '';
    t.textContent = text;
    t.hidden = false;
    toastUntil = now() + Math.max(TOAST_MS, TOAST_WORD_MS * text.split(/\s+/).length);
    const say = $(kind === 'info' ? 'toast-polite' : 'toast-alert'), other = $(kind === 'info' ? 'toast-alert' : 'toast-polite');
    if (other) other.textContent = '';
    if (say) say.textContent = say.textContent === text ? text + NBSP : text;
  }
  // (as the box goes: its words leave the two regions, so the next toast is new to them)
  function hideToast(t) {
    t.hidden = true;
    for (const id of ['toast-polite', 'toast-alert']) { const e = $(id); if (e) e.textContent = ''; }
  }
  const setText = (id, s) => { const el = $(id); if (el && el.textContent !== s) el.textContent = s; };

  // The standing objective (Q-18): one line, with the level as a glyph and a word. While the
  // player is hovering, focusing or has lifted a START / STOP guard, the line says what that press
  // would do instead (C-10, vm.consider), under the word '? IF PRESSED' (ARMED: amber unless critical).
  function drawObjective(v) {
    const box = $('objective');
    if (!box) return;
    const o = v.objective, c = v.consider || null;
    const paused = v.mode.mode === 'PAUSE' && v.phase === 'play' && !v.obs.over;
    // (Q-73: in the night roll the night strip stands in its place; a press there answers with the lock's note;
    // Q-91: a feeder card, as the respond card, is the one instruction while it holds the clock, but for an urgent line)
    box.hidden = (!o && !c) || lineHidden(v);
    if (box.hidden) return;
    const armed = !!c && v.armed === c.target;
    const cls = c ? (armed && c.level !== 'crit' ? 'act' : c.level) + ' consider' : o.level;
    if (box.className !== cls) box.className = cls;
    setText('objective-level', !c ? objectiveWord(o) : armed ? ARMED_WORD : c.level === 'ok' ? UNDER_WAY_WORD : CONSIDER_WORD);
    setText('objective-text', c ? (armed ? 'Press again to confirm. ' : '') + c.text
      : (o.text || '') + (paused ? '  ·  ' + HELD_NOTE : ''));
  }

  function drawHeader(v) {
    const m = v.mode;
    setText('clock-text', m.mode === 'WATCH' ? clockText(v.obs.s) : v.obs.clock.text);
    setText('rate-text', badgeText(m));
    const badge = $('rate-badge');
    if (badge) { badge.className = m.mode; const t = badgeTitle(m); if (badge.title !== t) badge.title = t; } // (Q-78: the act)
    const sc = v.obs.score;
    const lights = lightsChip(v.obs), lc = $('chip-lights');
    setText('chip-lights-v', lights);
    if (lc && lc.classList.contains('dark') !== (lights !== '100%')) lc.classList.toggle('dark', lights !== '100%');
    setText('chip-cost-v', centsText(sc));
    setText('chip-co2-v', co2Text(sc));
    setText('btn-pause', m.mode === 'PAUSE' || m.mode === 'HIDDEN' || m.mode === 'ALARMS' ? 'PLAY' : 'PAUSE');
    const bp = $('btn-pause');
    if (bp) bp.disabled = v.phase !== 'play' || v.obs.over;
    drawAllIn(v);
    drawHand(v.obs);
  }

  // D-7, Q-64: HAND (obs.mode) until the night shift takes the desk, then HAND-FLOWN (obs.handFlown); none on an AGC day.
  function drawHand(o) {
    const chip = $('chip-hand');
    if (!chip) return;
    const k = o.nightShift ? (o.handFlown ? 'night' : '') : o.mode === 'HAND' ? 'day' : '';
    if (chip.hidden !== !k) chip.hidden = !k;
    if (!k || chip.className === 'chip ' + k) return;
    chip.className = 'chip ' + k; chip.title = HAND_CHIP[k][1];
    // (the night's words on two lines, broken only at the '·': next.html #chip-hand span)
    chip.replaceChildren(...HAND_CHIP[k][0].split(' · ').flatMap((s, i, a) => {
      const e = doc.createElement('span'); e.textContent = s + (i < a.length - 1 ? ' ·' : ''); return i ? [' ', e] : [e];
    }));
  }

  // Q-48 (§30.7): you and par at the same grid time (once graded, the end card's grade); `off`: no par to compare (off, black, no score).
  function scoreOf(v) {
    const par = game.par, hh = game.households, you = allIn(v.obs.score, hh), g0 = v.end && v.end.grade;
    const off = !par || (par.done && (par.black || !par.score)), at = off ? null : par.at(v.obs.s), p = at && allIn(at, hh);
    return {you, p, off, g0, g: g0 || grade(you, p, false, parShedMWh(at))}; // (S-7: a Hard day so far)
  }

  // Q-48: the chip: SCORE against par ('SCORE …' until par gets there); with no par to compare, ALL-IN in cents per kWh asked for.
  let allInTip = '';
  function drawAllIn(v) {
    const chip = $('chip-allin');
    if (!chip) return;
    chip.hidden = v.phase !== 'play';
    // (Q-73: in the night roll it moves with the night strip, every NIGHT_REDRAW_MS, so the two say the same)
    if (chip.hidden || (v.obs.nightShift && !v.obs.over && v.frame.nowMs - nightMs < NIGHT_REDRAW_MS)) return;
    const {you, p, off, g0, g} = scoreOf(v), c = allInCents(you);
    setText('chip-allin-k', off && !g0 ? 'ALL-IN' : 'SCORE');
    setText('chip-allin-v', off && !g0 ? c + 'c' : g ? String(g.points) : '…');
    const tip = 'ALL-IN so far: ' + c + ' c/kWh' + (off ? '' : ' (par ' + (p ? allInCents(p) : '…') + ')') + ', SAIDI ' + you.saidiMin.toFixed(1) +
      ' min. The day\'s cost to the community per kWh the city asked for: supply + your MWh dark × ' + VCR_TEXT + ' (VCR; a feeder under ' +
      'repair is yours from its hand-back) + CO₂ × ' + VER_TEXT + ' (VER). Not a price or a bill.';
    if (tip !== allInTip) { allInTip = tip; chip.title = tip; chip.setAttribute('aria-label', tip); }
  }

  // Q-73 (§32.8.2): the night strip in the plan bar while the night shift has the desk: the lock's words and
  // the day's totals counting up to 04:00 (SCORE against par as the chip; with no par, ALL-IN also in the chip's
  // c/kWh), redrawn every NIGHT_REDRAW_MS; nothing to press, and it stays while the pointer crosses the desk.
  let nightMs = -Infinity;
  function drawNight(v) {
    const box = $('night-strip'), on = v.phase === 'play' && v.obs.nightShift && !v.obs.over;
    if (!box) return;
    if (box.hidden === on) { box.hidden = !on; nightMs = -Infinity; setText('night-note', NIGHT_LOCK); }
    if (!on || v.frame.nowMs - nightMs < NIGHT_REDRAW_MS) return;
    nightMs = v.frame.nowMs;
    const {you, off, g0, g} = scoreOf(v);
    setText('night-figs', 'SUPPLY ' + millions(you.supply) + ' · OUTAGES ' + millions(you.outage) + ' · CARBON ' + millions(you.carbon) +
      ' · ALL-IN ' + millions(you.total) + (off && !g0 ? ' (' + allInCents(you) + 'c/kWh)' : ' · SCORE ' + (g ? g.points : '…') + ' (par 1000)'));
  }

  function drawWatch(v) {
    const w = v.watch, box = $('watch-vignette');
    doc.body.classList.toggle('watch', !!w);
    if (!box) return;
    box.hidden = !w;
    if (!w) return;
    setText('stopwatch', w.stopwatch);
    // (K-15: a rise has its own strip; a directed shed's watch has none, only its sentence)
    const strip = w.shed ? [] : w.rise ? RISE_STRIP : FALL_STRIP, now = strip.find(x => x[1].includes(w.beatIndex));
    setText('beat-caption', w.version === 'full' || w.shed ? w.caption : now ? now[0] : '');
    const steps = $('beat-steps');
    if (steps) {
      steps.replaceChildren();
      strip.forEach(([word, at], i) => {
        if (i) steps.appendChild(doc.createTextNode(' → '));
        const el = doc.createElement(at.includes(w.beatIndex) ? 'b' : 'span');
        el.textContent = word;
        steps.appendChild(el);
      });
    }
  }

  let respondShown = -1;
  function drawRespond(v) {
    const card = $('respond-card');
    if (!card) return;
    card.hidden = !v.respond;
    if (!v.respond || respondShown === v.respond.n) { if (!v.respond) respondShown = -1; return; }
    respondShown = v.respond.n;
    card.replaceChildren();
    v.respond.lines.forEach((line, i) => {
      const p = doc.createElement('p');
      p.textContent = line;
      if (i === v.respond.lines.length - 1) p.className = 'hint';
      card.appendChild(p);
    });
  }

  // Q-91, D-27: the feeder card while a hand-back holds the clock: what, the morning's plan (this one now, the
  // others queued), the keys (blue), the mouse's RESTORE and the priced LEAVE, and why a restore is refused: amber
  // before a press (the bay's preview), red once refused (the grid's)
  function drawFeeder(v) {
    const card = $('feeder-card'), f = v.feeder;
    if (!card) return;
    card.hidden = !f;
    if (!f) return;
    if (!card.children.length) {
      for (const c of ['what', 'plan', 'hint', 'why']) { const p = doc.createElement('p'); p.className = c; card.appendChild(p); }
      const row = doc.createElement('div'), go = (b, f2) => b.addEventListener('click', ev => { ev.stopPropagation(); f2(); });
      row.className = 'row';
      const rb = doc.createElement('button'), ob = doc.createElement('button');
      rb.id = 'feeder-restore'; rb.type = 'button'; rb.className = 'take'; rb.title = 'R, Enter or Esc: close its breaker now';
      ob.id = 'feeder-leave'; ob.type = 'button'; ob.title = FEEDER_ON;
      go(rb, () => { if (game.feeder) actions.input({type: 'restore', district: game.feeder.id}); });
      go(ob, () => actions.ui({do: 'goOn'}));
      row.append(rb, ob);
      card.appendChild(row);
    }
    const [what, plan, hint, why, row] = card.children, [rb, ob] = row.children;
    if (what.textContent !== f.text) what.textContent = f.text;
    if (plan.textContent !== f.plan) plan.textContent = f.plan;
    if (hint.textContent !== f.keys) hint.textContent = f.keys;
    if (rb.textContent !== 'RESTORE ' + f.id) rb.textContent = 'RESTORE ' + f.id;
    if (ob.textContent !== f.leave) ob.textContent = f.leave;
    const w = f.why ? '✕ Refused: ' + f.why + '.' : f.lamp ? 'Not yet: ' + f.lamp + '. The RESTORE bay closes it once its lamp lights.' : '';
    if (why.textContent !== w) why.textContent = w;
    if (why.hidden !== !w) why.hidden = !w;
    const cls = f.why ? 'why' : 'why lamp';
    if (why.className !== cls) why.className = cls;
  }

  // Q-48 (§30.9): the end card, on demand (app/endcard.js), mounted into #end-card when the day ends (hidden while it loads);
  // fetched from 21:00 when a night shift has the desk (Q-73), so 04:00 shows it at once.
  let endCard = null, endState = '';
  const endDeps = {par: () => game.par, households: () => game.households, log: () => G.gameLog(game), toggleHelp, toast: showToast,
    run: () => G.runView(game),   // (W6: Y-2, Y-3)
    shelf: () => openShelf(),   // (W6, Y-2: MORE DAYS)
    again: () => { G.resetDay(game); for (const id of ['end-card', 'shelf-card']) { const c = $(id); if (c) c.hidden = true; } briefingText(); focusEl('btn-take'); }};   // (K-23: the button pressed is gone)

  // W6 (Y-2): the practice shelf: today's daily (when another day is on the desk), the past dailies with this browser's results,
  // and the Hard days (app/shelf.js). A pick is played in the page (C-3), the address kept in step so a reload keeps the day.
  // K-23: it opens on its first day's button (TODAY, else the newest past daily) and gives the focus back to its opener on CLOSE or
  // Esc (closeShelf), as the drawer does; a pick lands on the new briefing's TAKE THE DESK.
  let shelfFrom = null;
  function openShelf() {
    const c = $('shelf-card');
    if (!c || game.replay) return;
    if (c.hidden) shelfFrom = doc.activeElement;
    if (game.todayOf) game.today = game.todayOf();   // (a day played past midnight: the shelf is the new date's)
    const el = (tag, text, parent, cls) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; parent.appendChild(n); return n; };
    const pick = (box, label, p, title) => { const b = el('button', label, box); if (title) b.title = title; b.addEventListener('click', () => playDay(p)); return b; };
    c.replaceChildren();
    el('h2', 'More days: practice', c);
    el('p', SHELF_NOTE, c, 'dim');
    if (G.dailyYmd(game) !== game.today) pick(el('div', '', c, 'days'), 'TODAY: DAILY #' + puzzleNumber(game.today), {ymd: game.today}).id = 'shelf-today';
    el('h3', 'PAST DAILIES', c);
    const past = el('div', '', c, 'days');
    for (const d of pastDailies(game.today, game.history)) pick(past, '#' + d.n + ' ' + d.label + ' · ' + (resultText(d.entry) || 'not played'), {ymd: d.ymd});
    el('h3', 'HARD DAYS', c);
    el('p', HARD_NOTE, c, 'dim');
    const hard = el('div', '', c, 'days');
    for (const h of hardDays()) pick(hard, 'Hard day ' + h.n, {seed: h.seed, hard: h.n}, h.weekend ? 'a weekend' : 'a weekday');
    const close = el('button', 'CLOSE', el('p', '', c));
    close.id = 'shelf-close';
    close.addEventListener('click', () => closeShelf());
    c.hidden = false;
    c.querySelector('button').focus();
  }
  // (the opener, else the MORE DAYS shown: the end card's or the briefing's)
  function closeShelf() {
    const c = $('shelf-card');
    if (!c || c.hidden) return false;
    const had = c.contains(doc.activeElement);
    c.hidden = true;
    if (!had) return true;
    const back = [shelfFrom, $('btn-shelf'), $('btn-shelf-brief')].find(n => n && n !== doc.body && shown(n));
    if (back) back.focus(); else doc.activeElement.blur();
    return true;
  }
  function playDay(p) {
    const daily = p.ymd ? G.dailyFrom('?date=' + isoOf(p.ymd)) : Object.assign(G.dailyFrom('?seed=' + p.seed), {gated: null});
    if (!G.switchDay(game, daily)) return;
    for (const id of ['end-card', 'shelf-card']) { const c = $(id); if (c) c.hidden = true; }
    try {   // (the address: a reload keeps this day, and a resume finds it)
      const u = new URL(globalThis.location.href);
      u.searchParams.delete('seed'); u.searchParams.delete('date');
      if (p.ymd !== game.today) u.searchParams.set(p.ymd ? 'date' : 'seed', p.ymd ? isoOf(p.ymd) : String(p.seed));   // (today's: the bare address)
      globalThis.history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch { /* (no address: a test page) */ }
    if (game.resumeLost) showToast(RESUME_LOST, 'info');
    briefingText();
    focusEl('btn-take');
  }
  on('btn-shelf-brief', 'click', () => openShelf());
  function drawEnd(v) {
    const card = $('end-card');
    if (!card) return;
    if ((v.end || v.obs.nightShift) && !endState) {
      endState = 'loading';
      lazy(o.endCard, () => import('./endcard.js'), m => { card.replaceChildren(); endCard = m.createEndCard(doc, card, actions, endDeps); },
        e => { endState = 'failed'; card.textContent = 'The end card could not be loaded: reload the page to play this day again.'; err('end card', e); });
    }
    if (v.end && endCard) { try { endCard.update(v); } catch (e) { err('end card', e); } }
    card.hidden = !v.end || (!endCard && endState !== 'failed');
    if (!card.hidden && v.end !== endFocused) { endFocused = v.end; focusEnd(card); }
    else if (!card.hidden && PAR_COMPUTING.test(endSaid)) { const s = $('end-score'); if (s && !PAR_COMPUTING.test(s.textContent)) live.q.card = endSaid = s.textContent; }
  }
  // K-23: on the frame a day's end card first shows, its h2 (which names the dialog: #end-card aria-labelledby) takes the focus,
  // so the keyboard starts on the card, not ~70 Tab stops before it; and the live region's card slot says its score line. A day
  // the page's own par grades (no stored par: a practice seed, a Hard day) may show par's progress there first (endcard.js
  // fill's 'PAR: computing… N%'): its score is said again, once, when it lands.
  let endFocused = null, endSaid = '';
  const PAR_COMPUTING = /^PAR: computing/;
  function focusEnd(card) {
    const h = card.querySelector('h2'), score = $('end-score');
    endSaid = '';
    if (!h) return;
    h.id = 'end-title';
    h.setAttribute('tabindex', '-1');
    h.focus();
    if (score) live.q.card = endSaid = score.textContent;
  }

  function placeStack(v) {
    if (!mods.stack || !mods.stack.el) return;
    const ov = $('stack-overlay');
    if (!ov || v.stackExpanded === stackOut) return;
    stackOut = v.stackExpanded;
    doc.body.classList.toggle('stack-out', stackOut); // (Q-91: the feeder card moves off it)
    if (stackOut) { ov.appendChild(mods.stack.el); ov.hidden = false; } else { slot.appendChild(mods.stack.el); ov.hidden = true; }
  }

  // K-23: #aria-live mirrors the mode, the frequency band, the N-1 word, new alarms and tray
  // warnings, what the objective line asks, the RESPOND card and the end card's score, one message per 2 real s (liveFrame above).
  function announce(v, nowMs) {
    const text = liveFrame(live, v, nowMs);
    if (text) setText('aria-live', text);
  }

  // ---------------------------------------------------------------- settings (K-22, §13.1, B-7)
  let setKey = '', setOpen = false;
  function drawSettings(st, open) {
    // Body classes, so CSS follows without reading the vm: rm, fxlow, crt (B-4).
    const key = (st.reducedMotion ? 'r' : '-') + (st.reducedEffects ? 'f' : '-') + (st.crt ? 'c' : '-');
    if (key !== setKey) {
      setKey = key;
      doc.body.classList.toggle('rm', st.reducedMotion);
      doc.body.classList.toggle('fxlow', st.reducedEffects);
      doc.body.classList.toggle('crt', st.crt);
    }
    for (const k of Object.keys(SET_RANGES)) {
      const el = $(SET_RANGES[k]), val = String(Math.round(st[k] * 100));
      if (el && String(el.value) !== val) el.value = val;
    }
    for (const k of Object.keys(SET_CHECKS)) {
      const el = $(SET_CHECKS[k]);
      if (el && el.checked !== st[k]) el.checked = st[k];
    }
    // Reduced effects has no CRT: the switch greys and its row says why (hover, click).
    const crt = $(SET_CHECKS.crt), row = crt && crt.parentElement;
    if (crt && crt.disabled !== st.reducedEffects) {
      crt.disabled = st.reducedEffects;
      if (row) { row.classList.toggle('off', st.reducedEffects); row.title = st.reducedEffects ? CRT_OFF : ''; }
    }
    // O-1: I'VE DONE THIS BEFORE, always there on a first shift until pressed
    const done = $('btn-done-before'), first = G.firstShift(game) && game.settings.plates;
    if (done && done.hidden === first) done.hidden = !first;
    // O-8: COACH ON / OFF, as the line plays it now (a first shift's default, or the remembered choice)
    const coach = $('btn-coach'), on = G.coachOn(game);
    if (coach && coach.hidden !== !!game.state.control.nightShift) coach.hidden = !!game.state.control.nightShift;   // (no line at night: no coach)
    if (coach) { setText('btn-coach', on ? 'COACH ON' : 'COACH OFF'); if (coach.getAttribute('aria-pressed') !== String(on)) coach.setAttribute('aria-pressed', String(on)); }
    const mute = $('btn-mute');
    if (mute) {
      setText('btn-mute', st.muted ? 'SOUND OFF' : 'SOUND ON');
      if (mute.getAttribute('aria-pressed') !== String(st.muted)) mute.setAttribute('aria-pressed', String(st.muted));
    }
    const pop = $('settings'), btn = $('btn-settings');
    if (pop && pop.hidden === open) pop.hidden = !open;
    if (open !== setOpen) {
      setOpen = open;
      if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('on', open); }
      // Keyboard: opening lands on the first slider; closing hands focus back to the button.
      if (open) focusEl(SET_RANGES.volume);
      else if (pop && btn && pop.contains(doc.activeElement)) focusEl('btn-settings');
    }
  }
  for (const k of Object.keys(SET_RANGES)) {
    const send = ev => actions.ui({do: 'set', key: k, value: Math.max(0, Math.min(1, Number(ev.target.value) / 100))});
    on(SET_RANGES[k], 'input', send);
    on(SET_RANGES[k], 'change', send);
  }
  for (const k of Object.keys(SET_CHECKS)) on(SET_CHECKS[k], 'change', ev => actions.ui({do: 'set', key: k, value: !!ev.target.checked}));
  const crtRow = $(SET_CHECKS.crt) && $(SET_CHECKS.crt).parentElement;
  if (crtRow) crtRow.addEventListener('click', () => { if ($(SET_CHECKS.crt).disabled) showToast(CRT_OFF, 'info'); });
  on('btn-settings', 'click', () => actions.ui({do: 'settings'}));
  drawSettings(G.settingsView(game), false);

  // F-7: the resume's replay, RESUME_BUDGET_MS a frame, its progress on the briefing's button; then the desk, held where it was
  function resuming() {
    const p = G.resumeStep(game, RESUME_BUDGET_MS, now), b = $('btn-take');
    if (game.replay) { if (b) b.textContent = 'RESUMING… ' + Math.floor(100 * p) + '%'; return; }
    if (game.resumeFailed) { showToast('Your shift could not be resumed (' + game.resumeFailed + '): a fresh day.'); game.resumeFailed = ''; briefingText(); return; }
    showToast('Back at ' + clockText(game.state.tick / V.TICKS_PER_S, false) + ', as you left it. Space runs the clock.', 'info');
  }

  // ---------------------------------------------------------------- the frame (X-26: draw after the ticks)
  const drawMs = {};
  const timed = (name, f) => {
    const t = now();
    try { f(); } catch (e) { mods.errors.push(name + ': ' + (e && e.message ? e.message : e)); }
    drawMs[name] = now() - t;
  };

  function onFrame(dtS) {
    const t0 = now();
    for (const a of pollKeys(keys, t0)) run(a);
    if (game.replay) resuming();   // (F-7)
    const ticks = G.frame(game, dtS, now);
    const t1 = now();
    // Q-48: par, a slice a frame from TAKE THE DESK, in every mode (?perf: its own 'par' line)
    if (game.par && game.phase === 'play') timed('par', () => { if (!game.par.done) game.par.step(game.state.over ? PAR_STEP_OVER_TICKS : PAR_STEP_TICKS, game.state.over ? Infinity : PAR_BUDGET_MS); });
    // D-21: the moment's no-GUARD twin replays the day after it (app/verdict.js createTwin), TWIN_BUDGET_MS a frame
    if (game.twin && !game.twin.done && game.state.over) timed('twin', () => game.twin.step(Infinity, TWIN_BUDGET_MS));
    vm = G.buildVm(game, {nowMs: t1, dtS});
    if (mods.map) timed('map', () => mods.map.update(vm));
    if (mods.desk) timed('desk', () => mods.desk.update(vm));
    if (mods.stack) timed('stack', () => mods.stack.update(vm));
    timed('shell', () => {
      drawHeader(vm); drawObjective(vm); drawNight(vm); drawSettings(vm.settings, vm.settingsOpen); drawWatch(vm); drawRespond(vm); drawFeeder(vm); drawEnd(vm); placeStack(vm);
      drawAlarmPanel(vm); drawSuburbCard(vm);
      announce(vm, t1);
      const b = $('briefing-card');
      if (b) b.hidden = vm.phase !== 'briefing';
      if (vm.phase === 'briefing') briefMode(vm.obs.mode);
      const dr = $('drawer');
      if (dr && dr.hidden === vm.drawer) drawDrawer();
      const t = $('toast');
      if (t && !t.hidden && now() > toastUntil) hideToast(t);
      if (t1 >= qNext) { placeQs(); qNext = t1 + 500; }
    });
    timed('audio', () => audio.update(vm));
    if (perf) {
      PF.perfFrame(perf, {frameMs: now() - t0, simMs: t1 - t0, ticks, rate: vm.mode.rate, draw: drawMs});
      if (t1 - lastPerfDraw > 500) {
        lastPerfDraw = t1;
        const el = $('perf');
        if (el) { el.hidden = false; PF.renderPerf(el, perf); }
      }
    }
    return ticks;
  }

  // ---------------------------------------------------------------- keys and gestures
  function run(a) {
    if (a.ui) actions.ui(a.ui);
    else if (a.input) actions.input(a.input);
    else if (a.redispatch) actions.redispatch();
  }

  // Q-47: Esc closes the top-most first: popover, SETTINGS, drawer, alarm panel, suburb card, a desk note (W2).
  function closeTop() {
    const pop = $('popover'), u = game.ui, d = mods.desk, sh = $('shelf-card');
    if (pop && !pop.hidden) closePopover();
    else if (sh && !sh.hidden) closeShelf();   // (W6: the practice shelf)
    else if (u.settingsOpen || u.drawer || u.alarmsOpen) actions.ui(u.settingsOpen ? {do: 'settings', on: false} : u.drawer ? {do: 'drawer', on: false} : {do: 'alarms', on: false});
    else if (u.suburb && !modeOf(game.director, game.state).locked) actions.ui({do: 'suburb', id: null});
    else return !!(d && d.closeHelp && d.closeHelp());
    return true;
  }
  const mod = ev => ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev.target);
  // Capture phase (§30.3.6): an Esc that closed something stops there; with the alarm panel open, any
  // other desk key, inside the panel or not, first closes it as GO TO, before any control's own
  // handler, unless the panel owns it or it lands in SETTINGS (above the panel; its keys are its own).
  function escFirst(ev) {
    if (ev.key === 'Escape' && !ev.shiftKey && !mod(ev) && closeTop()) { ev.preventDefault(); ev.stopPropagation(); }
  }
  function panelFirst(ev) {
    const t = ev.target, k = ev.key;
    if (!game.ui.alarmsOpen || mod(ev) || PANEL_KEEPS.test(k) || (k === 'M' && ev.shiftKey) || within('settings', t)) return;
    if (!((inPanel(t) || within('drawer', t) || k === 'Enter' && t.classList.contains('dk-tile')) && PANEL_OWN.test(k))) actions.ui({do: 'alarmsGoto', target: null}); // (§30.4: Enter on a tile selects it)
  }
  // K-16: Enter at the RESPOND card closes it before any control under the keys hears it (a RESTORE row's Enter
  // would close a breaker, a suburb card's button would press), but in the alarm panel, SETTINGS, the drawer and "?".
  function cardFirst(ev) {
    const t = ev.target;
    if (ev.key !== 'Enter' || !game.respond || mod(ev) || game.ui.alarmsOpen || ['settings', 'drawer', 'popover'].some(id => within(id, t))) return;
    ev.preventDefault(); ev.stopPropagation();
    if (!ev.repeat) cardKeyMs = now();
    actions.ui({do: 'dismissRespond'});
  }
  // Q-91, D-27: at the feeder card Enter, R or Esc restores its feeder (an Esc that closed something stops there),
  // before any control hears them (the bay's R), but in SETTINGS, the drawer and "?". Enter on a RESTORE row, a suburb
  // card's button or the card's own buttons is that control's (a CLOSE is the bay's: another feeder's answers the
  // card, its own restores it). A key's auto-repeat is swallowed, and so is an Enter or R within FEEDER_ARM_MS of the
  // Enter that closed the RESPOND card (a queued feeder card shows at once): a pickup is never a held or doubled key (K-3).
  let cardKeyMs = -1e9;
  function feederFirst(ev) {
    const t = ev.target, k = ev.key;
    if (ev.defaultPrevented || mod(ev) || !/^(Enter|r|R|Escape)$/.test(k) || ['settings', 'drawer', 'popover'].some(id => within(id, t))) return;
    const id = modeOf(game.director, game.state).mode === 'FEEDER-CARD' ? feederCard(game.director, game.state) : '';
    if (!id || k === 'Enter' && !ev.repeat && ['restore-list', 'suburb-card', 'feeder-card'].some(x => within(x, t))) return;
    ev.preventDefault(); ev.stopPropagation();
    if (ev.repeat) return;
    if (now() - cardKeyMs < FEEDER_ARM_MS) showToast('A feeder you may close holds the clock: read its card, then R or Enter restores it', 'info');
    else actions.input({type: 'restore', district: id});
  }
  doc.addEventListener('keydown', escFirst, true);
  doc.addEventListener('keydown', panelFirst, true);
  doc.addEventListener('keydown', cardFirst, true);
  doc.addEventListener('keydown', feederFirst, true);

  // The page's one key listener (§13.3; the order is app/keys.js bindKeys'): text fields and
  // consumed keys are left alone, then the desk, the stack, the map, then the fallback map.
  const unbindKeys = bindKeys(doc, keys, () => vm, a => {
    if (game.phase === 'briefing' && a.ui && a.ui.do === 'dismissRespond') return;
    run(a);
  }, now, {
    // The popover's sliders and switches work natively: only Esc and `,` (close) are the game's there. K-23: so does Space on a
    // button (or THE NUMBERS) of the end card and the shelf, which have the focus: it presses it, as a browser's Space does.
    own: ev => (within('settings', ev.target) && ev.key !== 'Escape' && ev.key !== ',') ||
      ((game.ui.alarmsOpen && inPanel(ev.target) || within('drawer', ev.target)) && PANEL_OWN.test(ev.key)) || (within('suburb-card', ev.target) && CARD_OWN.test(ev.key) && !(ev.key === 'Enter' && game.phase === 'briefing')) ||
      (/^( |Spacebar)$/.test(ev.key) && ['end-card', 'shelf-card'].some(id => within(id, ev.target)) && /^(BUTTON|SUMMARY)$/.test(ev.target.tagName)),
    // Enter on the briefing card takes the desk (and nothing else: the key stops here); on AGC or HAND the radios' keys (K-23).
    first: ev => {
      if (game.phase !== 'briefing') return false;
      if (radioKey(ev)) return true;
      if (ev.key !== 'Enter' || (ev.target && (ev.target.id === 'btn-restart' || ev.target.tagName === 'A')) || shelfOwns(ev.target)) return false;   // (F-7: Enter on a focused START OVER is its own; W6: so is the shelf's, and a link's: D-29's source)
      take(); return true;
    },
    chain: () => [mods.desk, mods.stack, mods.map],
    // A module that took a key may have moved the keyboard focus (the desk's 1-8): vm.focus follows, into the plan bar too.
    // (With the alarm panel open, panelFirst has closed it before any desk key gets here, but for Enter on a tile: it selects.)
    used: (m, ev) => {
      const ae = doc.activeElement;
      if (ev.type !== 'keyup' && !game.ui.alarmsOpen && ae && ae.id && ae.id !== game.ui.focus && (within('desk', ae) || within('annun-slot', ae))) base.ui({do: 'focus', target: ae.id});
    },
    error: e => { mods.errors.push('key: ' + (e && e.message ? e.message : e)); },
  });
  const gesture = () => { if (!audio.started) audio.start(); };
  doc.addEventListener('pointerdown', gesture);
  doc.addEventListener('keydown', gesture);

  let stopRaf = null;
  // (F-7: a hidden or closing tab saves the run where it is)
  if (o.raf !== false) stopRaf = startRaf(onFrame, hidden => { game.director.hidden = hidden; if (hidden) G.saveResume(game); });
  const win = doc.defaultView;
  if (win && typeof win.addEventListener === 'function') win.addEventListener('pagehide', () => G.saveResume(game));
  if (mods.errors.length) showToast(mods.errors[0]);

  const handle = {
    game, actions, audio, mods, keys, live, loadText, closeTop,
    get perf() { return perf; },
    frame: onFrame,
    vm: () => vm,
    unbind() {
      unbindKeys(); for (const f of [escFirst, panelFirst, cardFirst, feederFirst, modality]) doc.removeEventListener('keydown', f, true);
      doc.removeEventListener('pointerdown', modality, true); if (stopRaf) stopRaf();
    },
  };
  // F-11: ?debug exposes the boot handle for stage C's shot and perf tools (nothing else may use it).
  if (query.has('debug')) globalThis.gridwatch = handle;
  return handle;
}

function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.getItem('gridwatch:v4:probe');
    return s;
  } catch {
    return null;
  }
}

