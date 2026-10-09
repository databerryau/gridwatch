// "Every press answers" for the suburb card (SPEC Q-41, Q-42, Q-56, Q-60; desk/README.md §31.9.5): each new press
// changes what the player sees, and help is never red. The card's BOOK, ◀ ▶, CANCEL, RESTORE, its "?" and ✕, its keys
// (←/→, ↑/↓, - =, Enter), and the tray's SUBURBS and TO THE SUBURB buttons. One press, one answer: after an accepted
// BOOK or CANCEL the row rests 1 real s and a press there says what was sent; a repeat Enter sends nothing.
// Headless and sampled (tests/lib/play.js, CLAUDE.md): a look before, on the press frame and a frame after; states by
// booking ahead at 04:30 and by poking (a dark district, a record into the tray), never by walking the day.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {setDistrictDark} from '../sim/fleet.js';
import * as T from '../app/tray.js';
import {openGame, diffLooks} from './lib/play.js';

const A = 1 / 60, TPS = V.TICKS_PER_S;
const flexes = p => p.game.state.log.filter(r => r.type === 'flex' || r.type === 'flexDel').map(r => r.type);
function quiet(p) { const t = p.$('toast'); if (t) t.hidden = true; }
/** (a) the press changed what the player sees (or matches `want`); (b) no help in red. */
function answers(r, want, what) {
  const s = diffLooks(r.before, r.during) + '\n' + r.diff;
  if (want) assert.match(s, want, what + ' did not answer as expected; it showed:\n' + s);
  else assert.ok(s.trim(), what + ': a silent press');
  for (const l of (r.during + '\n' + r.after).split('\n')) {
    if (l.startsWith('TOAST RED ')) assert.match(l, /^TOAST RED (Refused|RE-DISPATCH): /, what + ': help in red: ' + l);
    if (l.startsWith('NOTE RED ')) assert.match(l, /: ✕ /, what + ': help in red: ' + l);
  }
  return s;
}
const click = (p, x, want, what = x) => { quiet(p); return answers(p.press(x, {after: A}), want, what); };
const tap = (p, k, want, extra = {}) => { quiet(p); return answers(p.pressKey(k, extra, {after: A}), want, k); };

test('Q-41 the card\'s presses: BOOK (soak, air-con), ◀ ▶ and their ends, BOOK blocked, CANCEL, RESTORE, "?", ✕; its keys ←/→, ↑/↓, - =, Enter', () => {
  const p = openGame({seed: 20261007});
  const st = p.game.state;
  setDistrictDark(st, st.city.districts.findIndex(d => d.suburb === 'HAR'), true, 'directed');
  p.suburb('HAZ');
  click(p, 'city-HAZ-soak-later', /^SUBURB .*HOT WATER SOAK \+140 MW \d\d:\d\d–\d\d:\d\d /m, '▶');
  click(p, 'city-HAZ-soak-earlier', /^SUBURB /m, '◀');
  for (let i = 0; i < 4; i++) p.click('city-HAZ-soak-earlier');
  click(p, 'city-HAZ-soak-earlier', /^TOAST blue earliest 10:00$/m, '◀ at the window\'s start');
  click(p, 'city-HAZ-soak', /^SUBURB .*SOAK 10:00–14:00 booked: tonight's heating −525 MWh.*one soak a day: already booked/m, 'BOOK soak');
  click(p, 'city-HAZ-soak-cancel-1000', /^TOAST blue booked: OLD HAZELTON soak 10:00–14:00$/m, 'CANCEL in the rest');
  p.real(1.05, 0.35);
  click(p, 'city-HAZ-soak', /^TOAST blue Old Hazelton: one soak a day: already booked$/m, 'BOOK on a booked soak');
  click(p, 'city-HAZ-soak-cancel-1000', /^SUBURB .*HOT WATER SOAK \+140 MW 10:00–14:00 takes/m, 'CANCEL');
  click(p, 'city-HAZ-aircon', /^SUBURB .*AIR-CON \d\d:\d\d–\d\d:\d\d booked: snapback/m, 'BOOK air-con');
  assert.deepEqual(flexes(p), ['flex', 'flexDel', 'flex']);
  click(p, 'q-aircon', /^POPOVER An air-con cycle pre-cools, relieves, then snaps back\./m, '"?"');
  click(p, 'q-aircon', /^CTRL .*q-aircon "\?"/m, '"?" again closes it');
  // the keys, with the focus in the card
  p.$('city-HAZ-aircon').focus();
  tap(p, 'ArrowUp', /^CTRL .*\[focus\]/m);
  tap(p, 'ArrowDown', /^CTRL .*city-HAZ-aircon "BOOK" \[focus\]/m);
  tap(p, '=', /^SUBURB /m);
  tap(p, '-', /^SUBURB /m);
  tap(p, 'ArrowRight', /^SUBURB REDGUM FLATS /m);
  tap(p, 'ArrowRight', /^SUBURB HARBOURSIDE 250k homes 1 DARK: /m);
  click(p, 'city-HAR-restore', /^CTRL .*bay-restore "[^"]*RESTORE" \[[^\]]*focus/m, 'RESTORE');
  p.$('city-HAR-soak').focus();
  tap(p, 'Enter', /^SUBURB .*SOAK \d\d:\d\d–\d\d:\d\d booked/m);
  assert.equal(flexes(p).length, 4);
  click(p, 'btn-suburb-close', null, '✕');
  assert.equal(p.vm().suburb, null);
  assert.deepEqual(p.h.mods.errors, []);
});

test('§31.9.5 one press, one answer: two BOOK presses leave one FLEX_BOOK; a repeat Enter sends nothing; after the rest a press cancels', () => {
  const p = openGame({seed: 20261014});
  p.suburb('SOL');
  const books = () => p.game.state.log.filter(r => r.type === 'flex').length;
  p.click('city-SOL-soak', {frame: false});
  p.click('city-SOL-soak');
  assert.equal(books(), 1, 'a double click books once');
  assert.match(p.look({controls: false}), /^TOAST blue booked: SOLSTICE RISE soak \d\d:\d\d–\d\d:\d\d$/m);
  const cancel = p.doc.querySelectorAll('button').find(b => /^city-SOL-soak-cancel-/.test(b.id));
  cancel.focus();
  p.real(1.05, 0.35);
  p.keyDown('Enter', {repeat: true});
  p.frame();
  assert.equal(p.game.state.log.filter(r => r.type === 'flexDel').length, 0, 'a held Enter repeats: nothing sent');
  p.key('Enter');
  assert.equal(p.game.state.log.filter(r => r.type === 'flexDel').length, 1, 'after the rest a press cancels');
  assert.equal(books(), 1);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-60 the tray\'s presses: an MSL1 card in the soak window says SUBURBS and opens the card; the lock card opens its suburb\'s', () => {
  const p = openGame({seed: 20261014});
  const s = Math.floor(p.game.state.tick / TPS), rec = {tick: s * TPS, kind: 'log', sev: 'info', code: 'MSL1', level: 1, minMW: 1480, atS: (12.5 - V.DAY_START_H) * V.S_PER_H,
    msg: 'MSL1 notice'};
  T.trayRecords(p.game.tray, [rec, {tick: s * TPS, kind: 'log', sev: 'info', code: 'PATIENCE_LOCK', suburb: 'SAL', patience: 20, msg: 'Saltbush Bay: air-con locked.'}]);
  p.frame();
  const btn = t => p.doc.querySelectorAll('.dk-card-btn').find(b => b.dataset.target === t);
  assert.equal(btn('suburb-card').textContent, 'SUBURBS');
  click(p, btn('suburb-card'), /^SUBURB SOLSTICE RISE /m, 'SUBURBS');
  click(p, btn('suburb-SAL'), /^SUBURB SALTBUSH BAY /m, 'TO THE SUBURB');
  assert.deepEqual(p.h.mods.errors, []);
});
