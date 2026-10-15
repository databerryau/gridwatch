// app/suburbcard.js: a suburb's card (SPEC §9.1 Q-56; §31.6 card, §31.9.3-§31.9.7). On demand (Q-44,
// cap 6.5 KB in tests/budget.test.js since 2c); its CSS is injected once (#sc-css). Presentation and two sim
// inputs, flex and flexDel; the shell owns opening, closing, hiding in the watch and the focus.
//
//   const card = createSuburbCard(doc, root, actions, {toast, loadText, toggleHelp, now});
//   card.update(vm, day)  every frame while vm.suburb is set, also while the watch hides it (its pre-checks
//                     read the latest vm); day is the attempt (the shell passes game.state): a new one
//                     (PLAY THIS DAY AGAIN) forgets the player's aims and the rests; builds its rows when
//                     the suburb, the offer, a dark district or the blocks change, keeps a focused row's
//                     focus across a rebuild and closes a popover its old "?" held (Q-47; the shell
//                     closes it when the card hides); a block's booked / under way / done each frame;
//                     the aim, its words and the verdict only when the line (fromS, n), lv.rev, the LV,
//                     the player's aim, patience, the last block's del or the shown city line's atS
//                     change; names the dialog
//                     (aria-label) by its suburb
//   card.focus()      the first row's press (RESTORE, else the first CANCEL or BOOK), else ✕
//   verdict(fc, lv, id, atS, effMW) -> '✓ …' | '✕ …' | ''   §31.9.4, pure (tests)
//   WIT, LEVERS, PEAK_BAND_MW   the U-1 lines, each lever's name and "?" row, the band (100 MW)
//
// What it shows, top down (1280×600 gives it 194 px; a HOT day with both levers fits, and one
// booked block with them; two booked cycles and a soak scroll, the last resort, and the verdict
// sits under its aim so the words scroll first. 2b final review P6, computed from the CSS, not yet
// seen in a browser: lines 14.85 px, buttons 24 px; a HOT card ~180 px before the trims, ~210 px
// with a booked cycle's two-line row; padding 4 px, p margins 0 and .sc-r 2 px take 20 px off):
//   NAME · 420k homes · ✕ (btn-suburb-close)
//   n DARK: [RESTORE] (city-<ID>-restore: focus bay-restore; the card stays)   only with dark districts
//     (2c, Q-69: a task feeder before its clearS is the network's: "2 DARK · BACK 06:45, 07:05" in
//     blue with no RESTORE while every dark district is held, so card.focus() goes to the first
//     CANCEL or BOOK and nothing steals the focus before the hand-back; "2 DARK (1 BACK 07:05):
//     [RESTORE]" once one is the desk's; the words are render/map.js darkOf's, the map's; the
//     shape key tells held ('h') from restorable ('d'))
//   “U-1's dry wit”
//   patience 40: 90% respond (all respond from 50; air-con locked under 25; only on a day air-con
//     is offered, else "patience 40": it scales air-con alone, P2) · draws <lit MW> · roofs <MW>
//   per offered lever (obs.levers.offered; on a MILD day "AIR-CON CYCLE: hot days only (…)"):
//     each booked block: SOAK 10:30–14:30 booked|under way|done: tonight's heating −525 MWh   [CANCEL]
//                        AIR-CON 18:45–20:15 booked: pre-cool from 17:45 · snapback to 21:45 · $22.5k · patience −10 [CANCEL]
//       (CANCEL city-<ID>-<lever>-cancel-HHMM; dimmed, aria-disabled, once its del is not '': under
//       way from the soak's first MW or the cycle's pre-cool, so the row names the pre-cool; done
//       after the soak's end or the cycle's snapback)
//     the aim: HOT WATER SOAK +140 MW [◀] 10:30–14:30 [▶] [BOOK] [?]   (BOOK = city-<ID>-<lever>,
//       ◀ ▶ = -earlier / -later, ? = q-<lever>: deps.toggleHelp(q, [LEVERS[lever].row]))
//     air-con: the verdict of the aim, or of the suburb's last booked cycle when it cannot book and
//       that cycle can still be cancelled (none once it starts: the day-ahead then has only the
//       columns after now, and its "peak" would creep past the real one)
//     what it does: takes 525 MWh at noon; tonight's heating −525 MWh · no payment
//                   pre-cool from 17:45 · snapback to 21:45 · $22.5k · patience 60 → 50
//       or, when LV.block is not '', that reason in blue (◀ ▶ hidden, BOOK dimmed)
//
// The aim: the player's (◀ ▶, - =: 15-min steps) kept inside [fromS, toS], else the shown city
// line's atS for this lever (vm.objective; a soak line's for any suburb, an air-con line's for its
// own: after "◇ SUBURB (H)" or "▶ SUBURB (H)" BOOK sends what the line says), else aimFlex over
// vm.dayAhead || obs.forecast (fromS while it says -1), kept within one 5-minute step of the card's
// last default (objective.js stick; 2b final review S1). BOOK forgets it; CANCEL leaves the
// cancelled block's time as the aim to re-aim from. A booked block is never moved in place.
// Energies and times come from sim/weather.js flexParts (the sim's own shapes); the payment is
// the core's MWh × AIRCON_PRICE (lit districts; dark ones are not paid).
//
// A press (BOOK, CANCEL, ◀ ▶): the row's rest first (COMMIT_LOCK_MS after an accepted BOOK or
// CANCEL: "booked: OLD HAZELTON soak 10:30–14:30"); then ◀ ▶ step (blue "earliest 10:00" /
// "latest 11:00" at the ends; on a booked soak or a focused block "booked for HH:MM: CANCEL, then
// BOOK the new time", or that block's del once it is under way); BOOK and CANCEL answer in blue
// and send nothing in the briefing ("Take the desk first: Enter."), after the day ("Day over:
// …"), in the watch ("desk locked while the grid catches itself"), on LV.block ("<Suburb>:
// air-con locked: patience below 25", "… too late today: soaks start by 11:00", "… one soak a
// day: already booked") and on a block under way (its del). LV.block is said as a standing status
// (the aim row, BOOK, ◀ ▶): its window reasons (sim/grid.js LEVER_WHY) in the card's words, "too
// late today: soaks start by 11:00", "too late today: cycles start by 19:30 (pre-cool from 18:30)"
// and "no room today for another cycle around the booked one", the rest as the sim says them
// (2b final review P4: the sim's strings refuse a proposed time, and nothing was proposed). A refusal from the sim stays the
// shell's red toast. "Outside the window" is LV.block's: the card never holds an aim outside
// [fromS, toS]. A suburb with dark districts shows its "n DARK: RESTORE" line first (2c: while
// every one is a held task feeder, "n DARK · BACK HH:MM" with no RESTORE, Q-69) and still
// books (Q-50: a dark district's flex just stops; eligibility only through LV.block, §31.3.7),
// so §31.6's "a dark suburb's RESTORE first" is that line, not a blue refusal.
//
// Keys (the card's root; CARD_OWN in app/shell.js keeps them from the desk, the stack, the map
// and the fallback): ←/→ the previous / next suburb in city order (wrapping; the new card takes
// the focus), ↑/↓ the row presses (RESTORE, CANCEL, BOOK), - and = the time of the focused row's
// lever, Enter presses the focused button (preventDefault; never on ev.repeat), except in the
// briefing, where it goes on to the shell and takes the desk (app/shell.js own lets it through),
// as BOOK's blue answer says. Esc and H stay the shell's (closeTop's order; H toggles); Tab is
// the browser's.

import {V} from '../sim/params.js';
import {SCENARIOS, CLASSIC} from '../content/scenarios.js';
import {aimFlex, aimLineMW, knotMW as at} from '../sim/autopilot.js';
import {flexParts} from '../sim/weather.js';
import {LEVER_WHY} from '../sim/grid.js';
import {stick, cityAim} from './objective.js';
import {el, setText, setAttr, setCls, setHidden, clockOf as hm, COMMIT_LOCK_MS} from '../desk/util.js';
import {mw, dollars} from '../render/format.js';
import {darkOf} from '../render/map.js';

/** U-1's dry wit, by suburb id. */
export const WIT = Object.freeze({SOL: 'Checks its solar app more often than its children.',
  HAZ: 'On off-peak hot water since 1962; has never asked why.', RED: 'Runs the air-con like it\'s a human right. Because it is.',
  HAR: 'Nobody knows where the thermostat is, including Facilities.', TAL: 'Would like to speak to the manager of the electricity.',
  SAL: 'Remembers 2009. Will ring talkback.'});
/** Each lever's name, word and "?" row (content/text.js hot-water-soak, aircon-cycle). */
export const LEVERS = Object.freeze({soak: {name: 'HOT WATER SOAK', word: 'soak', row: 'A hot-water soak moves that night\'s heating to noon.'},
  aircon: {name: 'AIR-CON CYCLE', word: 'air-con', row: 'An air-con cycle pre-cools, relieves, then snaps back.'}});
/** §31.9.4: columns within this of the evening peak are its band. */
export const PEAK_BAND_MW = 100;
const STEP_S = 900, CSS = '#suburb-card .sc{padding:4px 10px;font-size:11px}#suburb-card .sc-h,#suburb-card .sc-r,#suburb-card .sc-b{display:flex;align-items:center;gap:5px}' +
  '#suburb-card h2{margin:0;font:700 13px var(--mono);color:var(--bright)}#suburb-card .sc-h span{flex:1;color:var(--dim)}#suburb-card p{margin:0;color:var(--dim)}' +
  '#suburb-card .sc-r{margin-top:2px}#suburb-card .sc-r b{flex:1;font:700 11px var(--mono);color:var(--bright)}#suburb-card .sc-b span{flex:1}' +
  '#suburb-card .sc-t{font:11px var(--mono);color:var(--bright)}#suburb-card .info{color:var(--blue)}#suburb-card .ok{color:var(--green)}#suburb-card .bad{color:var(--amber)}' +
  '#suburb-card button.off{opacity:.45}';

// LV.block as standing words (P4)
const LAST = V.AIRCON_TO_S - V.AIRCON_S, notNow = (lever, L) => L.block === LEVER_WHY.late ? 'too late today: ' + (lever === 'soak' ? 'soaks start by ' + hm(V.SOAK_TO_S - V.SOAK_S)
  : 'cycles start by ' + hm(LAST) + ' (pre-cool from ' + hm(LAST - V.PRECOOL_S) + ')') : L.block === LEVER_WHY.overlap ? 'no room today for another cycle around the booked one' : L.block;
// a part's energy (MWh)
const mwh = kn => kn.reduce((a, k, i) => (i ? a + (k[0] - kn[i - 1][0]) * (k[1] + kn[i - 1][1]) / 2 : 0), 0) / V.S_PER_H;
const partsOf = (lever, atS, m) => Object.fromEntries(flexParts({lever, atS}, m).map(p => [p.kind, p.knots]));

/** §31.9.4: the air-con verdict for a relief from atS on aimFlex's line: '✓ …', '✕ …' or '' (no column in the window). */
export function verdict(fc, lv, id, atS, effMW) {
  const cols = [];
  let pk = 0, peak = -1;
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    if (t < V.AIRCON_FROM_S || t > V.AIRCON_TO_S) continue;
    const m = aimLineMW(fc, lv, id, 'aircon', k);
    cols.push([t, m]);
    if (peak < 0 || m > pk) { pk = m; peak = t; }
  }
  if (peak < 0) return '';
  const P = partsOf('aircon', atS, effMW), band = cols.filter(c => c[1] >= pk - PEAK_BAND_MW), on = k => band.some(c => at(P[k], c[0]) > 0);
  const t = ' the ' + hm(Math.round(peak / STEP_S) * STEP_S) + ' peak', r = ' relief ' + hm(atS) + '–' + hm(atS + V.AIRCON_S);
  return at(P.core, peak) > 1e-9 - effMW ? '✕' + r + ' misses' + t : on('precool') ? '✕' + r + ': pre-cool lands on' + t : on('snapback') ? '✕' + r + ': snapback lands on' + t
    : '✓' + r + ' covers' + t + '; snapback after it';
}

/** Mount the card into root (#suburb-card): its shape, deps and keys are desk/README.md §31.8's. */
export function createSuburbCard(doc, root, actions, deps) {
  if (!doc.getElementById('sc-css')) { const st = el(doc, 'style', '', CSS); st.id = 'sc-css'; (doc.head || doc.body).appendChild(st); }
  const box = el(doc, 'div', 'sc'), head = el(doc, 'div', 'sc-h'), name = el(doc, 'h2'), homes = el(doc, 'span'), x = el(doc, 'button', '', '✕'), body = el(doc, 'div');
  x.id = 'btn-suburb-close';
  x.type = 'button';
  x.title = 'Close (Esc or H). In the card: ←/→ suburb, ↑/↓ row, -/= time, Enter press';
  x.setAttribute('aria-label', 'Close the suburb card');
  x.addEventListener('click', () => actions.ui({do: 'suburb', id: null}));
  head.append(name, homes, x);
  box.append(head, body);
  root.appendChild(box);
  root.addEventListener('keydown', key);
  let vm = null, shape = '', E = null, day, aims = {}, dflt = {}, rests = {}; // E: the built rows of the open suburb
  const say = s => deps.toast(s, 'info'), now = () => (deps.now ? deps.now() : vm.frame.nowMs);
  const cityOf = v => (SCENARIOS[v.obs.scenarioId] || CLASSIC).city.suburbs;
  const subOf = v => v.obs.levers.suburbs.find(s => s.id === v.suburb);
  const btn = (text, id, f, row) => { const b = el(doc, 'button', '', text); b.type = 'button'; if (id) b.id = id; if (row) b.dataset.row = '1'; b.addEventListener('click', f); return b; };

  // the next booking's aim in [fromS, toS]: the player's, the line's, else aimFlex's held within a step (S1)
  function aimOf(v, lever, L) {
    if (L.block) return -1;
    const d = v.suburb + lever;
    let a = aims[d];
    if (a === undefined && (a = cityAim(v.objective, lever, v.suburb)) < 0) a = dflt[d] = stick(aimFlex(v.dayAhead || v.obs.forecast, v.obs.levers, v.suburb, lever), dflt[d] ?? -1, L);
    return Math.min(L.toS, Math.max(L.fromS, a));
  }
  const span = (lever, a) => hm(a) + '–' + hm(a + (lever === 'soak' ? V.SOAK_S : V.AIRCON_S));
  const said = (lever, a, what) => what + ': ' + name.textContent + ' ' + LEVERS[lever].word + ' ' + span(lever, a);
  // what a block does, in words (Q-56)
  function words(lever, a, m, cost, p) {
    const P = partsOf(lever, a, m);
    if (lever === 'soak') return 'takes ' + mw(mwh(P.core)) + ' MWh at noon; tonight\'s heating −' + mw(mwh(P.core)) + ' MWh · no payment';
    return 'pre-cool from ' + hm(a - V.PRECOOL_S) + ' · snapback to ' + hm(a + V.AIRCON_S + V.SNAPBACK_S) + ' · ' +
      dollars(-mwh(P.core) * V.AIRCON_PRICE) + ' · patience ' + (p === undefined ? '−' + cost : p + ' → ' + (p - cost));
  }

  // a press in a lever's row (BOOK, CANCEL, ◀ ▶): the rest, the pre-checks (blue, nothing sent), then the input
  function press(lever, what, b) {
    const v = vm, id = v.suburb, L = subOf(v)[lever], r = rests[id + lever];
    if (r && now() < r.until) return say(r.text);
    if (typeof what === 'number') return step(v, lever, L, what);
    const why = v.phase === 'briefing' ? 'Take the desk first: Enter.' : v.obs.over ? 'Day over: PLAY THIS DAY AGAIN for another go'
      : v.mode.locked ? 'desk locked while the grid catches itself' : '';
    if (why) return say(why);
    let x, a;
    if (b) {
      const cur = v.obs.levers.blocks.find(q => q.suburb === id && q.lever === lever && q.atS === b.atS);
      if (!cur || cur.del) return say(cur ? cur.del : 'no such block');
      a = b.atS;
      x = {type: 'flexDel', suburb: id, lever, atS: a};
    } else {
      if (L.block) return say(cityOf(v).find(s => s.id === id).name + ': ' + notNow(lever, L));
      a = aimOf(v, lever, L);
      x = {type: 'flex', suburb: id, lever, atS: a};
    }
    if (actions.input(x)) return;
    rests[id + lever] = {until: now() + COMMIT_LOCK_MS, text: said(lever, a, b ? 'cancelled' : 'booked')};
    if (b) aims[id + lever] = a; else delete aims[id + lever]; // (a cancelled block's time is the aim to re-aim from)
  }
  // ◀ ▶ (and - =): 15-min steps of the unbooked aim; a booked block is never moved in place
  function step(v, lever, L, d, b) {
    const mine = v.obs.levers.blocks.filter(q => q.suburb === v.suburb && q.lever === lever),
      blk = b ? mine.find(q => q.atS === b.atS) : L.block && lever === 'soak' && mine[mine.length - 1];
    if (blk) return say(blk.del || 'booked for ' + hm(blk.atS) + ': CANCEL, then BOOK the new time');
    if (L.block) return say(notNow(lever, L));
    const a = aimOf(v, lever, L), n = Math.min(L.toS, Math.max(L.fromS, a + d * STEP_S));
    if (n === a) return say((d < 0 ? 'earliest ' : 'latest ') + hm(a));
    aims[v.suburb + lever] = n;
  }

  // keys inside the card (§31.8)
  function key(ev) {
    const k = ev.key, a = doc.activeElement;
    if (!vm || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (k === 'Enter') { if (vm.phase === 'briefing') return; ev.preventDefault(); if (!ev.repeat && root.contains(a) && a.click) a.click(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const ids = cityOf(vm).map(s => s.id), i = ids.indexOf(vm.suburb);
      actions.ui({do: 'suburb', id: ids[(i + (k === 'ArrowLeft' ? ids.length - 1 : 1)) % ids.length]});
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const rows = [...body.querySelectorAll('[data-row]')], i = rows.indexOf(a), n = rows[i < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, i + (k === 'ArrowUp' ? -1 : 1)))];
      if (n) n.focus();
    } else if (k === '-' || k === '=') {
      const r = a && a.closest && root.contains(a) && a.closest('[data-lever]'), lever = r ? r.dataset.lever : vm.obs.levers.offered[0], sub = subOf(vm);
      if (!lever || !sub) return;
      const rest = rests[vm.suburb + lever];
      if (rest && now() < rest.until) say(rest.text);
      else step(vm, lever, sub[lever], k === '-' ? -1 : 1, a && a.dataset && a.dataset.at ? {atS: Number(a.dataset.at)} : null);
    } else return;
    ev.preventDefault();
  }

  // the open suburb's rows: its dark line, then per lever its blocks and the aim
  function build(v, id, sub, dark, mine) {
    const lv = v.obs.levers, foc = body.contains(doc.activeElement) ? doc.activeElement.id : null;
    for (const q of body.querySelectorAll('[aria-expanded="true"]')) deps.toggleHelp(q, []); // (Q-47)
    body.replaceChildren();
    E = {lv: {}};
    if (dark) {
      E.dark = el(doc, 'p', 'info');
      E.dark.append(el(doc, 'span'));
      // RESTORE only once a feeder is the desk's: the network's (Q-69) neither offers it nor takes the focus
      if (mine) E.dark.append(' ', btn('RESTORE', 'city-' + id + '-restore', () => actions.ui({do: 'focus', target: 'bay-restore'}), true));
      body.appendChild(E.dark);
    }
    body.append(el(doc, 'p', 'sc-w', '“' + (WIT[id] || '') + '”'), E.st = el(doc, 'p'));
    if (!sub) body.appendChild(el(doc, 'p', '', 'No city levers on this desk.'));
    for (const lever of sub ? ['soak', 'aircon'] : []) {
      const T = LEVERS[lever], g = el(doc, 'div');
      g.dataset.lever = lever;
      body.appendChild(g);
      if (!lv.offered.includes(lever)) { g.appendChild(el(doc, 'p', '', T.name + ': hot days only (a mild day has no cooling load to relieve)')); continue; }
      const R = E.lv[lever] = {blocks: []};
      for (const b of lv.blocks) {
        if (b.suburb !== id || b.lever !== lever) continue;
        const row = el(doc, 'div', 'sc-b'), c = btn('CANCEL', 'city-' + id + '-' + lever + '-cancel-' + hm(b.atS).replace(':', ''), () => press(lever, 'cancel', b), true);
        c.dataset.at = String(b.atS);
        row.append(el(doc, 'span'), c);
        g.appendChild(row);
        R.blocks.push({at: b.atS, row, c, txt: lever === 'soak' ? 'tonight\'s heating −' + mw(mwh(b.parts[0].knots)) + ' MWh' : words(lever, b.atS, b.effMW, b.cost)});
      }
      const r = el(doc, 'div', 'sc-r'), q = el(doc, 'button', 'q inline', '?');
      q.id = 'q-' + lever;
      q.type = 'button';
      q.title = T.row;
      q.setAttribute('aria-label', 'About: ' + T.row);
      q.setAttribute('aria-controls', 'popover');
      q.setAttribute('aria-expanded', 'false');
      q.addEventListener('click', () => deps.toggleHelp(q, [T.row]));
      r.append(el(doc, 'b', '', T.name), R.mw = el(doc, 'span', 'sc-t'), R.l = btn('◀', 'city-' + id + '-' + lever + '-earlier', () => press(lever, -1)),
        R.t = el(doc, 'span', 'sc-t'), R.r = btn('▶', 'city-' + id + '-' + lever + '-later', () => press(lever, 1)),
        R.book = btn('BOOK', 'city-' + id + '-' + lever, () => press(lever, 'book'), true), q);
      R.l.setAttribute('aria-label', 'Earlier by 15 min (-)');
      R.r.setAttribute('aria-label', 'Later by 15 min (=)');
      g.appendChild(r); // (the verdict right under its aim: words scroll before it, P6)
      if (lever === 'aircon') g.appendChild(R.v = el(doc, 'p'));
      g.appendChild(R.c = el(doc, 'p'));
    }
    const n = foc && doc.getElementById(foc);
    if (foc !== null) (n && body.contains(n) ? n : root.querySelector('[data-row]') || x).focus(); // (the focused row was rebuilt)
  }

  return {
    el: box,
    update(v, d) {
      vm = v;
      if (d !== day) { day = d; aims = {}; dflt = {}; rests = {}; shape = ''; } // (a new attempt)
      const id = v.suburb, s = cityOf(v).find(q => q.id === id);
      if (!s) return;
      const obs = v.obs, sub = subOf(v), lv = obs.levers, ds = obs.districts.filter(d => d.suburb === id), D = darkOf(obs, id), mine = D.n > D.h;
      // (Q-69: a task feeder before its hand-back is the network's: its time, and no RESTORE; the map's words)
      const key = id + lv.offered + (D.n ? mine ? 'd' : 'h' : '') + (sub ? '' : 'x') + lv.blocks.map(b => b.suburb + b.lever + b.atS);
      if (key !== shape) { shape = key; build(v, id, sub, D.n, mine); }
      setText(name, s.name.toUpperCase());
      setAttr(root, 'aria-label', s.name);
      setText(homes, Math.round(s.households / 1e3) + 'k homes');
      if (E.dark) setText(E.dark.firstChild, D.text + (mine ? ':' : ''));
      const roof = (obs.rooftop.suburbs.find(q => q.id === id) || {mw: 0}).mw, p = sub ? sub.patience : -1;
      setText(E.st, (sub ? 'patience ' + p + (lv.offered.includes('aircon') ? ': ' + (p < V.PATIENCE_LOCK ? 'air-con locked' : p < V.PATIENCE_FULL ?
        Math.round(100 * (V.PATIENCE_FULL + p) / (2 * V.PATIENCE_FULL)) + '% respond' : 'all respond') : '') + ' · ' : '') +
        'draws ' + mw(ds.reduce((a, d) => a + (d.dark ? 0 : d.coldLoadMW), 0)) + ' MW · roofs ' + mw(roof) + ' MW');
      for (const lever in E.lv) {
        const R = E.lv[lever], L = sub[lever], fc = v.dayAhead || obs.forecast, last = lv.blocks.filter(b => b.suburb === id && b.lever === lever).pop();
        for (const {at: t, row, c, txt} of R.blocks) {
          const b = lv.blocks.find(q => q.suburb === id && q.lever === lever && q.atS === t), u = b.del !== '';
          setText(row.firstChild, LEVERS[lever].word.toUpperCase() + ' ' + span(lever, t) + (u ? obs.s < b.endS + (lever === 'aircon' ? V.SNAPBACK_S : 0) ? ' under way: ' : ' done: ' : ' booked: ') + txt);
          setCls(c, 'off', u);
          setAttr(c, 'aria-disabled', u);
        }
        // (the aim, its words and the verdict only when what they read changes)
        const k = [fc.fromS, fc.n, lv.rev, L.mw, L.cost, L.fromS, L.toS, L.block, aims[id + lever], p, last && last.del, cityAim(v.objective, lever, id)].join();
        if (R.k === k) continue;
        R.k = k;
        const a = aimOf(v, lever, L);
        setText(R.mw, (lever === 'soak' ? '+' : '−') + mw(L.mw) + ' MW');
        for (const e of [R.l, R.t, R.r]) setHidden(e, a < 0);
        setCls(R.book, 'off', a < 0);
        setAttr(R.book, 'aria-disabled', a < 0);
        if (a >= 0) setText(R.t, span(lever, a));
        setText(R.c, a < 0 ? notNow(lever, L) : words(lever, a, L.mw, L.cost, p));
        setCls(R.c, 'info', a < 0);
        if (R.v) {
          const w = a >= 0 ? verdict(fc, lv, id, a, L.mw) : last && !last.del ? verdict(fc, lv, id, last.atS, last.effMW) : '';
          setText(R.v, w);
          setCls(R.v, 'ok', w[0] === '✓');
          setCls(R.v, 'bad', w[0] === '✕');
        }
      }
    },
    focus() { (root.querySelector('[data-row]') || x).focus(); },
  };
}
