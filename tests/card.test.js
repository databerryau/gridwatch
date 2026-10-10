// The suburb card (SPEC §9.1 Q-56, Q-60; desk/README.md §31.6 card, §31.9.3-§31.9.7): its rows, the aim and its
// steps, the air-con verdict (§31.9.4), the rests (§31.9.5), the pre-checks that answer in blue without sending, the
// watch, the tray's log-only route and lock card. Headless (CLAUDE.md): sampled frames through tests/lib/play.js,
// states reached by booking ahead at 04:30 or by poking (a pushed block, a dark district, a poked vm), never by
// walking the day. The presses' answers (Q-41) are tests/feedback-city.test.js's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import {aimFlex} from '../sim/autopilot.js';
import {flexParts} from '../sim/weather.js';
import {setDistrictDark} from '../sim/fleet.js';
import {SEEN_KEY, resetDay} from '../app/game.js';
import {createSuburbCard, verdict, WIT, LEVERS, PEAK_BAND_MW} from '../app/suburbcard.js';
import * as T from '../app/tray.js';
import {TEXT} from '../content/text.js';
import {DESK} from '../content/scenarios.js';
import {clockOf as hm} from '../desk/util.js';
import {makeDocument} from './lib/dom.js';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const TPS = V.TICKS_PER_S, HOT = 20261007, MILD = 20261014; // DESK weekdays: a heatwave day, a calm mild day
const at = (h, m = 0) => (h - V.DAY_START_H) * V.S_PER_H + m * V.S_PER_MIN;
const toast = p => (p.$('toast').hidden ? '' : (p.$('toast').classList.contains('info') ? 'blue ' : 'RED ') + p.$('toast').textContent);
/** The card as the play driver's SUBURB line reads it (its buttons are CTRL lines). */
const card = p => (p.look({controls: false}).split('\n').find(l => l.startsWith('SUBURB ')) || '').slice(7);
const flexLog = p => p.game.state.log.filter(r => r.type === 'flex' || r.type === 'flexDel').map(r => r.type + ' ' + r.args.suburb + ' ' + r.args.lever + ' ' + hm(r.args.atS));
const lv = (p, id) => p.vm().obs.levers.suburbs.find(s => s.id === id);
const span = (a, s) => hm(a) + '–' + hm(a + s);

// A day-ahead line with an evening plateau 19:00-20:15 (within PEAK_BAND_MW of its 19:45 top), 500 MW lower elsewhere.
function plateau() {
  const fc = {fromS: 0, stepS: V.FC_STEP_S, n: V.DAY_S / V.FC_STEP_S, demandP50: []};
  for (let k = 0; k < fc.n; k++) { const t = (k + 1) * fc.stepS; fc.demandP50.push(t === at(19, 45) ? 7050 : t >= at(19) && t <= at(20, 15) ? 7000 : 6500); }
  return fc;
}
const RED = {mw: 45, cost: 10, fromS: V.AIRCON_FROM_S, toS: V.AIRCON_TO_S - V.AIRCON_S, block: ''};
const knotAt = kn => t => { for (let i = 1; i < kn.length; i++) if (t <= kn[i][0]) return t < kn[0][0] ? 0 : kn[i - 1][1] + (kn[i][1] - kn[i - 1][1]) * (t - kn[i - 1][0]) / (kn[i][0] - kn[i - 1][0]); return 0; };

test('§31.9.4: the verdict on the line aimFlex uses: ✓ at its default aim, then each failure in order, on the peak at the nearest quarter hour', () => {
  const fc = plateau(), L = {suburbs: [{id: 'RED', aircon: RED}], blocks: []}, v = a => verdict(fc, L, 'RED', a, RED.mw);
  assert.ok(7050 - 7000 < PEAK_BAND_MW && 7050 - 6500 > PEAK_BAND_MW, 'the plateau is the band');
  const a = aimFlex(fc, L, 'RED', 'aircon');
  assert.equal(a, at(19), 'aimFlex centres the relief on the 19:45 top');
  assert.equal(v(a), '✓ relief 19:00–20:30 covers the 19:45 peak; snapback after it');
  assert.equal(v(RED.toS), '✕ relief 19:30–21:00: pre-cool lands on the 19:45 peak', 'atS = toS: full relief at the top, pre-cool on the band before it');
  assert.equal(v(at(17, 45)), '✕ relief 17:45–19:15 misses the 19:45 peak', 'centred on a pre-PV peak');
  assert.equal(v(RED.fromS), '✕ relief 15:00–16:30 misses the 19:45 peak', 'atS = fromS');
  assert.equal(v(at(18, 30)), '✕ relief 18:30–20:00: snapback lands on the 19:45 peak', 'the relief covers the top, its snapback the band after it');
  // the line is P50 (booked flex in it) less this suburb's own air-con blocks: its own dent does not move the peak; another suburb's does
  const own = {suburb: 'RED', lever: 'aircon', atS: at(19), endS: at(20, 30), effMW: 400, cost: 10, del: ''}, dented = plateau();
  own.parts = flexParts(own, 400);
  dented.demandP50 = dented.demandP50.map((m, k) => m + own.parts.reduce((x, q) => x + knotAt(q.knots)((k + 1) * V.FC_STEP_S), 0));
  assert.equal(verdict(dented, {suburbs: L.suburbs, blocks: [own]}, 'RED', at(19), 45), v(at(19)), 'its own block taken out of the line');
  assert.equal(aimFlex(dented, {suburbs: L.suburbs, blocks: [own]}, 'RED', 'aircon'), at(19), 'aimFlex reads the same line (2b final review P7: one helper, aimLineMW)');
  assert.equal(verdict(dented, {suburbs: L.suburbs, blocks: [Object.assign({}, own, {suburb: 'HAR'})]}, 'RED', at(19), 45), '✕ relief 19:00–20:30 misses the 19:00 peak',
    'another suburb\'s relief stays in the line: the peak left is at 19:00');
  assert.equal(verdict(Object.assign({}, fc, {n: 100}), L, 'RED', at(19), 45), '', 'no column in 15:00-21:00: no verdict');
});

test('Q-56 at 04:30 on a hot day: name, homes, wit, patience with what it does, draws and roofs; per lever its MW, the aim (aimFlex over the day-ahead), what it does and the verdict; ◀ ▶ and - = step 15 min inside [fromS, toS], answering at the ends; ↑/↓ move between rows, ←/→ switch suburb', () => {
  const p = openGame({seed: HOT});
  assert.equal(p.suburb('RED'), '');
  const v = p.vm(), L = lv(p, 'RED'), fc = v.dayAhead, aim = aimFlex(fc, v.obs.levers, 'RED', 'aircon'), soak = aimFlex(fc, v.obs.levers, 'RED', 'soak');
  assert.deepEqual(v.obs.levers.offered, ['soak', 'aircon']);
  assert.ok(aim >= L.aircon.fromS && soak >= L.soak.fromS, 'both aims in view');
  const w = verdict(fc, v.obs.levers, 'RED', aim, 45);
  assert.match(w, /^✓ relief .* covers the 19:30 peak; snapback after it$/, 'the default aim is right on this day');
  assert.equal(card(p), 'REDGUM FLATS 420k homes “' + WIT.RED + '” patience 60: all respond · draws ' + /draws ([\d,]+) MW/.exec(card(p))[1] +
    ' MW · roofs 0 MW HOT WATER SOAK +110 MW ' + span(soak, V.SOAK_S) + ' takes 413 MWh at noon; tonight\'s heating −413 MWh · no payment ' +
    'AIR-CON CYCLE −45 MW ' + span(aim, V.AIRCON_S) + ' ' + w + ' pre-cool from ' + hm(aim - V.PRECOOL_S) + ' · snapback to ' + hm(aim + V.AIRCON_S + V.SNAPBACK_S) +
    ' · $22.5k · patience 60 → 50', 'the verdict right under its aim (P6: what scrolls at the floor is the words)');
  assert.equal(p.doc.activeElement.id, 'city-RED-soak', 'opened: the first row takes the focus');
  // ▶ steps 15 min (the verdict follows), ◀ back; at the ends they answer in blue and stay
  p.click('city-RED-aircon-later');
  assert.ok(card(p).includes('−45 MW ' + span(aim + 900, V.AIRCON_S) + ' ' + verdict(p.vm().dayAhead, p.vm().obs.levers, 'RED', aim + 900, 45) + ' pre-cool'));
  p.click('city-RED-aircon-earlier');
  assert.ok(card(p).includes('−45 MW ' + span(aim, V.AIRCON_S) + ' '));
  for (let i = 0; i < 4; i++) p.click('city-RED-soak-earlier');
  assert.equal(toast(p), 'blue earliest 10:00');
  assert.ok(card(p).includes('+110 MW 10:00–14:00 '));
  // - and = step the row the focus is in (the soak's BOOK), as the card's own keys
  p.$('city-RED-soak').focus();
  p.key('=');
  assert.ok(card(p).includes('+110 MW 10:15–14:15 '));
  for (let i = 0; i < 3; i++) p.key('=', {}, {frame: false});
  p.key('=');
  assert.equal(toast(p), 'blue latest 11:00');
  p.key('-');
  assert.ok(card(p).includes('+110 MW 10:45–14:45 '));
  // ↑/↓ move between the rows' presses; ←/→ switch suburb, and the new card takes the focus
  p.key('ArrowDown');
  assert.equal(p.doc.activeElement.id, 'city-RED-aircon');
  p.key('ArrowDown');
  assert.equal(p.doc.activeElement.id, 'city-RED-aircon', 'the last row stays');
  p.key('ArrowUp');
  assert.equal(p.doc.activeElement.id, 'city-RED-soak');
  p.key('ArrowRight');
  assert.deepEqual([p.vm().suburb, p.doc.activeElement.id], ['HAR', 'city-HAR-soak']);
  assert.match(card(p), /^HARBOURSIDE 250k homes .* patience 50: all respond · /);
  for (let i = 0; i < 4; i++) p.key('ArrowLeft');
  assert.equal(p.vm().suburb, 'SAL', 'wrapping in city order');
  assert.deepEqual(flexLog(p), [], 'nothing sent');
  assert.equal(p.vm().focus, null, 'no key reached the desk');
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-52-Q-54 booked ahead at 04:30: BOOK sends flex at the aim and the row lists the block with CANCEL; the LOG gets the booking and the patience (no card); below 50 the MW scales, below 25 the air-con locks (an info card that opens that suburb) and BOOK answers in blue; a cancel refunds its own cost', () => {
  const p = openGame({seed: HOT});
  p.suburb('TAL');
  assert.ok(card(p).includes('patience 40: 90% respond'));
  const fc = p.vm().dayAhead, aim = aimFlex(fc, p.vm().obs.levers, 'TAL', 'aircon'), m0 = lv(p, 'TAL').aircon.mw, cards = p.vm().tray.cards.length;
  assert.equal(m0, 15 * 0.9);
  p.click('city-TAL-aircon');
  assert.deepEqual(flexLog(p), ['flex TAL aircon ' + hm(aim)]);
  assert.equal(lv(p, 'TAL').patience, 30);
  assert.ok(card(p).includes('AIR-CON ' + span(aim, V.AIRCON_S) + ' booked: pre-cool from ' + hm(aim - V.PRECOOL_S) + ' · snapback to ' +
    hm(aim + V.AIRCON_S + V.SNAPBACK_S) + ' · $6,750 · patience −10'), card(p) + ': the booked row names the pre-cool, when CANCEL ends');
  assert.ok(card(p).includes('patience 30: 80% respond') && card(p).includes('AIR-CON CYCLE −12 MW'), 'the next cycle at 80%');
  const nx = /AIR-CON CYCLE −12 MW (\d\d:\d\d–\d\d:\d\d) /.exec(card(p))[1];
  assert.match(card(p), new RegExp('AIR-CON CYCLE −12 MW ' + nx + ' ✕ relief ' + nx + ' misses the \\d\\d:\\d\\d peak pre-cool '), 'the verdict names the relief it judges: the next aim, not the booked one (P1)');
  assert.ok(p.$('city-TAL-aircon-cancel-' + hm(aim).replace(':', '')));
  assert.equal(p.vm().tray.cards.length, cards, 'no tray card for a booking');
  assert.deepEqual(p.vm().tray.log.slice(-2).map(e => e.from + ': ' + e.text), ['CITY DESK: Tallowood Heights: air-con cycle booked for ' + hm(aim) + ' (14 MW).',
    'CITY DESK: Tallowood Heights patience 30 (-10: air-con).']);
  // a second cycle in the latest open run before it: 15 more, below 25: locked
  p.real(1.05, 0.35);
  assert.equal(lv(p, 'TAL').aircon.block, '');
  p.click('city-TAL-aircon');
  assert.equal(flexLog(p).length, 2);
  assert.deepEqual([lv(p, 'TAL').patience, lv(p, 'TAL').aircon.block], [15, 'air-con locked: patience below 25']);
  assert.ok(card(p).includes('patience 15: air-con locked') && /AIR-CON CYCLE −10 MW ✓ [^·]* air-con locked: patience below 25$/.test(card(p)), card(p) + ': the last cycle\'s verdict, then why no more');
  const lock = p.vm().tray.cards.at(-1);
  assert.deepEqual([lock.from, lock.sev, lock.text, lock.button.label, lock.button.target], ['CITY DESK', 'info',
    'Tallowood Heights: air-con locked. A cancel refunds a cycle\'s patience.', 'TO THE SUBURB', 'suburb-TAL']);
  p.real(1.05, 0.35);
  p.click('city-TAL-aircon');
  assert.equal(toast(p), 'blue Tallowood Heights: air-con locked: patience below 25', 'a pre-check');
  assert.equal(flexLog(p).length, 2, 'nothing sent');
  assert.equal(p.$('city-TAL-aircon').getAttribute('aria-disabled'), 'true');
  assert.equal(p.$('city-TAL-aircon-later').hidden, true, 'no aim to step');
  // the lock card's button opens that suburb's card
  p.suburb('HAZ');
  p.click(p.doc.querySelectorAll('.dk-card-btn').find(b => b.dataset.target === 'suburb-TAL'));
  assert.equal(p.vm().suburb, 'TAL');
  // a cancel refunds that block's own cost (15, the second's) and lifts the lock
  const ids = p.doc.querySelectorAll('button').filter(b => /^city-TAL-aircon-cancel-/.test(b.id)).map(b => b.id);
  assert.equal(ids.length, 2);
  p.click(ids[0]);
  assert.deepEqual([lv(p, 'TAL').patience, lv(p, 'TAL').aircon.block], [30, '']);
  assert.match(flexLog(p).at(-1), /^flexDel TAL aircon /);
  assert.equal(p.vm().tray.log.at(-1).text, 'Tallowood Heights patience 30 (+15: cancel).');
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-56 pre-checks answer in blue and send nothing (a poked vm): the briefing, the watch, the day over, locked, outside the window, under way (- = too); a cycle\'s verdict only while it can be cancelled, under way through its snapback; then the rest answers with what was sent', () => {
  const p = openGame({seed: HOT});
  p.suburb('HAZ');
  const base = p.vm(), doc = makeDocument(NEXT), root = doc.getElementById('suburb-card'), ins = [], said = [];
  let now = 5000;
  root.hidden = false;
  const c = createSuburbCard(doc, root, {ui: () => '', input: x => { ins.push(x); return ''; }}, {toast: (s, k) => said.push(k + ' ' + s), loadText() {}, toggleHelp() {}, now: () => now});
  const vm = poke => { const v = Object.assign({}, base, {obs: JSON.parse(JSON.stringify(base.obs)), mode: Object.assign({}, base.mode)}); poke(v); c.update(v); };
  const book = (lever = 'soak') => { const n = said.length; doc.getElementById('city-HAZ-' + lever).click(); return said.length > n ? said.at(-1) : '(sent)'; };
  vm(v => { v.phase = 'briefing'; });
  assert.equal(book(), 'info Take the desk first: Enter.');
  vm(v => { v.mode.locked = true; });
  assert.equal(book(), 'info desk locked while the grid catches itself');
  vm(v => { v.obs.over = true; });
  assert.equal(book(), 'info Day over: PLAY THIS DAY AGAIN for another go');
  vm(v => { Object.assign(v.obs.levers.suburbs[1].aircon, {block: 'air-con locked: patience below 25', fromS: -1, toS: -1}); });
  assert.equal(book('aircon'), 'info Old Hazelton: air-con locked: patience below 25');
  vm(v => { Object.assign(v.obs.levers.suburbs[1].soak, {block: 'too late: it would start in the past', fromS: -1, toS: -1}); });
  assert.equal(book(), 'info Old Hazelton: too late today: soaks start by 11:00', 'outside the window');
  // the window's two reasons as a standing status say what holds, not a refusal of a time nobody proposed (P4)
  const words = lever => doc.getElementById('city-HAZ-' + lever).parentElement.parentElement.children.at(-1).textContent;
  vm(v => { Object.assign(v.obs.levers.suburbs[1].aircon, {block: 'too late: it would start in the past', fromS: -1, toS: -1}); });
  assert.equal(words('aircon'), 'too late today: cycles start by 19:30 (pre-cool from 18:30)');
  vm(v => { Object.assign(v.obs.levers.suburbs[1].aircon, {block: 'overlaps another air-con block of this suburb', fromS: -1, toS: -1}); });
  assert.equal(words('aircon'), 'no room today for another cycle around the booked one');
  const blk = {suburb: 'HAZ', lever: 'soak', atS: at(10, 30), endS: at(14, 30), effMW: 140, cost: 0, del: ''}, x = doc.getElementById.bind(doc);
  blk.parts = flexParts(blk, 140);
  const booked = del => vm(v => { v.obs.levers.blocks.push(Object.assign({}, blk, {del})); Object.assign(v.obs.levers.suburbs[1].soak, {block: 'one soak a day: already booked', fromS: -1, toS: -1}); });
  const eq = (on, want, why) => { const n = said.length; x(on).focus(); root.dispatch('keydown', {key: '='}); assert.deepEqual(said.slice(n), [want], why); };
  booked('');
  assert.deepEqual([x('city-HAZ-soak-cancel-1030').parentElement.firstChild.textContent, x('city-HAZ-soak-cancel-1030').getAttribute('aria-disabled')],
    ['SOAK 10:30–14:30 booked: tonight\'s heating −525 MWh', 'false']);
  eq('city-HAZ-soak', 'info booked for 10:30: CANCEL, then BOOK the new time', 'a booked block is never moved in place');
  booked('under way: too late to cancel');
  assert.deepEqual([x('city-HAZ-soak-cancel-1030').parentElement.firstChild.textContent, x('city-HAZ-soak-cancel-1030').getAttribute('aria-disabled')],
    ['SOAK 10:30–14:30 under way: tonight\'s heating −525 MWh', 'true'], 'the same block, now under way (no rebuild)');
  x('city-HAZ-soak-cancel-1030').click();
  assert.equal(said.at(-1), 'info under way: too late to cancel');
  for (const on of ['city-HAZ-soak', 'city-HAZ-soak-cancel-1030']) eq(on, 'info under way: too late to cancel', on + ': - = on a block under way say why, not "CANCEL, then BOOK"');
  // an air-con cycle: its verdict while it can be cancelled, none once its pre-cool starts; under way through its snapback
  const cyc = {suburb: 'HAZ', lever: 'aircon', atS: at(18), endS: at(19, 30), effMW: 40, cost: 10}, line = () => { const r = x('city-HAZ-aircon').parentElement, g = r.parentElement.children; return g[g.indexOf(r) + 1].textContent; };
  cyc.parts = flexParts(cyc, 40);
  const cycle = (del, s) => vm(v => { v.obs.s = s; v.obs.levers.blocks.push(Object.assign({}, cyc, {del})); Object.assign(v.obs.levers.suburbs[1].aircon, {block: 'too late: it would start in the past', fromS: -1, toS: -1}); });
  cycle('', base.obs.s);
  assert.match(line(), /^[✓✕] /, 'a booked cycle that can be cancelled: its verdict');
  cycle('under way: too late to cancel', at(20));
  assert.deepEqual([line(), x('city-HAZ-aircon-cancel-1800').parentElement.firstChild.textContent], ['',
    'AIR-CON 18:00–19:30 under way: pre-cool from 17:00 · snapback to 21:00 · ' + /\$[\d.,k]+/.exec(x('city-HAZ-aircon-cancel-1800').parentElement.firstChild.textContent)[0] + ' · patience −10'],
    'started: no verdict on a line that has moved past its peak; its snapback still runs');
  cycle('under way: too late to cancel', at(21));
  assert.match(x('city-HAZ-aircon-cancel-1800').parentElement.firstChild.textContent, /^AIR-CON 18:00–19:30 done: /, 'after the snapback: done');
  assert.equal(ins.length, 0, 'nothing sent');
  // accepted: BOOK sends at the aim; for COMMIT_LOCK_MS the whole row answers with what was sent; then it acts again
  vm(() => {});
  assert.equal(book(), '(sent)');
  const a = aimFlex(base.dayAhead, base.obs.levers, 'HAZ', 'soak'), was = 'info booked: OLD HAZELTON soak ' + span(a, V.SOAK_S);
  assert.deepEqual(ins, [{type: 'flex', suburb: 'HAZ', lever: 'soak', atS: a}]);
  now += 999;
  assert.equal(book(), was);
  doc.getElementById('city-HAZ-soak-later').click();
  assert.equal(said.at(-1), was, 'the whole row rests');
  now += 1;
  assert.equal(book(), '(sent)', 'after the rest it acts');
  assert.equal(ins.length, 2);
});

test('S1 (2b final review): with no aim of the player\'s, BOOK sends the shown city line\'s time (a soak line names any suburb\'s, an air-con line only its own); else aimFlex\'s, held within a 5-min step (a poked vm)', () => {
  const p = openGame({seed: HOT});
  p.suburb('HAZ');
  const base = p.vm(), doc = makeDocument(NEXT), root = doc.getElementById('suburb-card'), ins = [];
  let now = 0;
  root.hidden = false;
  const c = createSuburbCard(doc, root, {ui: () => '', input: x => { ins.push(x); return ''; }}, {toast() {}, loadText() {}, toggleHelp() {}, now: () => (now += 2000)});
  // the day-ahead with a dip at column k (the soak centres its 4 h on it), and an optional city line
  const vm = (k, line) => { const v = Object.assign({}, base, {dayAhead: JSON.parse(JSON.stringify(base.dayAhead)), objective: line || null}); v.dayAhead.demandP50[k] -= 5000; c.update(v); return v; };
  const sent = (lever = 'soak') => { doc.getElementById('city-HAZ-' + lever).click(); return ins.at(-1).atS; };
  const k = Math.round((at(12, 30) - base.dayAhead.fromS) / V.FC_STEP_S) - 1, aim = v => aimFlex(v.dayAhead, v.obs.levers, 'HAZ', 'soak');
  const a0 = aim(vm(k)), a1 = aim(vm(k + 1)), a2 = aim(vm(k + 2));
  assert.deepEqual([a1 - a0, a2 - a0], [300, 600], 'the dip a column later: aimFlex a step later');
  vm(k);
  assert.equal(sent(), a0);
  vm(k + 1);
  assert.equal(sent(), a0, 'one step away: held');
  vm(k + 2);
  assert.equal(sent(), a2, 'two steps: the new aim');
  const line = (suburb, lever, atS) => ({kind: 'city', level: 'plan', text: '', targets: ['suburb-' + suburb], action: {type: 'flex', suburb, lever, atS}});
  vm(k, line('RED', 'soak', a0 + 900));
  assert.equal(sent(), a0 + 900, 'a soak line for another suburb: free suburbs aim alike');
  const ac = aimFlex(base.dayAhead, base.obs.levers, 'HAZ', 'aircon');
  vm(k, line('RED', 'aircon', ac + 900));
  assert.equal(sent('aircon'), ac, 'another suburb\'s air-con line: not this one\'s');
  vm(k, line('HAZ', 'aircon', ac + 900));
  assert.equal(sent('aircon'), ac + 900, 'its own');
});

test('Q-56 in play: the briefing sends nothing and Enter in the card takes the desk; a dark suburb\'s card says so first and RESTORE focuses the bay; a pushed block under way: CANCEL answers in blue; the watch hides the card and a press there sends nothing; the day over', () => {
  const b = openGame({seed: HOT, take: false});
  b.suburb('HAZ');
  b.click('city-HAZ-soak');
  assert.equal(toast(b), 'blue Take the desk first: Enter.');
  assert.deepEqual(flexLog(b), []);
  assert.equal(b.doc.activeElement.id, 'city-HAZ-soak');
  b.key('Enter');
  assert.deepEqual([b.vm().phase, flexLog(b)], ['play', []], 'Enter in the card takes the desk, as the answer says (Q-41)');
  const seen = {getItem: k => (k === SEEN_KEY ? JSON.stringify({watch: true}) : null), setItem() {}};
  const p = openGame({seed: HOT, storage: seen}), st = p.game.state;
  setDistrictDark(st, st.city.districts.findIndex(x => x.suburb === 'RED'), true, 'directed');
  p.suburb('RED');
  assert.match(card(p), /^REDGUM FLATS 420k homes 1 DARK: “/);
  assert.equal(p.doc.activeElement.id, 'city-RED-restore', 'its first row');
  p.click('city-RED-restore');
  assert.ok(p.$('bay-restore').contains(p.doc.activeElement), 'RESTORE focuses the bay');
  assert.equal(p.vm().suburb, 'RED', 'and the card stays');
  // under way: a soak whose first knot is now (pushed, sorted, rev + 1)
  const s = Math.floor(st.tick / TPS / V.FC_STEP_S) * V.FC_STEP_S, cancel = 'city-RED-soak-cancel-' + hm(s).replace(':', '');
  st.levers.blocks.unshift({suburb: 'RED', lever: 'soak', atS: s, endS: s + V.SOAK_S, effMW: 110, cost: 0});
  st.levers.rev++;
  p.frame();
  assert.ok(card(p).includes('SOAK ' + span(s, V.SOAK_S) + ' under way: tonight\'s heating −413 MWh'), card(p));
  assert.equal(p.$(cancel).getAttribute('aria-disabled'), 'true');
  p.click(cancel);
  assert.equal(toast(p), 'blue under way: too late to cancel');
  assert.deepEqual(flexLog(p), []);
  // the watch: hidden, vm.suburb kept; a press that still reached it sends nothing; back when the lock ends
  injectTrip(st, Math.floor(st.tick / TPS) + 60);
  assert.equal(p.until('trip', {max: '+10m'}).why, 'trip');
  assert.deepEqual([p.$('suburb-card').hidden, p.vm().suburb], [true, 'RED']);
  p.$('city-RED-aircon').click();
  p.frame();
  assert.equal(toast(p), 'blue desk locked while the grid catches itself');
  p.key('Escape');
  assert.equal(p.until('card', {max: '+10m'}).why, 'card');
  assert.equal(p.$('suburb-card').hidden, false);
  // the day over (set by state)
  st.over = true;
  p.frame();
  p.click('city-RED-aircon');
  assert.equal(toast(p), 'blue Day over: PLAY THIS DAY AGAIN for another go');
  assert.deepEqual(flexLog(p), []);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-51 a mild day offers the soak only, and the card says why; a new attempt forgets the aim; Q-60 the tray: bookings and patience are LOG lines (no card, no cue), a lock an info card; the "?" rows are drawer texts', () => {
  const p = openGame({seed: MILD});
  p.suburb('SOL');
  assert.deepEqual(p.vm().obs.levers.offered, ['soak']);
  assert.ok(card(p).endsWith('AIR-CON CYCLE: hot days only (a mild day has no cooling load to relieve)'));
  assert.match(card(p), /” patience 70 · draws /, 'patience only scales air-con: no "respond" when none is offered (P2)');
  assert.equal(p.$('city-SOL-aircon'), null);
  // PLAY THIS DAY AGAIN (resetDay, as the end card's again): a new attempt forgets the player's aim
  const a0 = aimFlex(p.vm().dayAhead, p.vm().obs.levers, 'SOL', 'soak'), shows = () => card(p).includes(' MW ' + span(a0, V.SOAK_S) + ' ');
  assert.ok(shows());
  p.click(a0 < lv(p, 'SOL').soak.toS ? 'city-SOL-soak-later' : 'city-SOL-soak-earlier');
  assert.ok(!shows(), 'the player\'s aim');
  resetDay(p.game);
  p.frame().click('btn-agc').click('btn-take').suburb('SOL');
  assert.ok(shows(), card(p));
  const tr = T.createTray(), r = (code, x) => Object.assign({tick: at(5) * TPS, kind: 'log', sev: 'info', code, msg: code + ' msg'}, x);
  assert.deepEqual(T.trayRecords(tr, [r('FLEX_BOOK'), r('FLEX_DEL'), r('PATIENCE', {suburb: 'TAL', patience: 30})]), []);
  assert.deepEqual([tr.cards.length, T.trayView(tr).log.map(e => e.from + ' ' + e.time + ' ' + e.text)],
    [0, ['CITY DESK 05:00 FLEX_BOOK msg', 'CITY DESK 05:00 FLEX_DEL msg', 'CITY DESK 05:00 PATIENCE msg']]);
  assert.deepEqual(T.trayRecords(tr, [r('PATIENCE_LOCK', {suburb: 'TAL', patience: 15, msg: 'Tallowood Heights: air-con locked.'})]), ['tick']);
  assert.equal(tr.cards[0].button.target, 'suburb-TAL');
  for (const k of ['soak', 'aircon']) {
    const e = TEXT.abstractions.find(x => x.row === LEVERS[k].row);
    assert.ok(e && e.game === 'drawer' && e.ui === 'drawer' && !e.specPending, k); // (048e5a7: the rows are in SPEC §8.2)
  }
  assert.deepEqual(Object.keys(WIT), DESK.city.suburbs.map(x => x.id));
});
