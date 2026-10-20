// W7, Q1 (decisions/2026-10-16-open-questions.md §1, option A): SOAK THE CITY. One press books the HOT WATER SOAK of
// every free suburb at one time (a distributor's ripple control moves its controlled hot water with one signal); the
// suburb card keeps CANCEL and BOOK per suburb for trimming. The press is one action: saved once (F-7), counted once
// (X-45, D-10). The line's ask is tests/objective-levers.test.js's; the followed morning's one ask, tests/objective.test.js's.
// Headless (CLAUDE.md): sampled frames at 04:30 through tests/lib/play.js, no day walked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {aimFlex} from '../sim/autopilot.js';
import {hashState} from '../sim/step.js';
import * as G from '../app/game.js';
import {clockOf as hm} from '../desk/util.js';
import {openGame} from './lib/play.js';

const TPS = V.TICKS_PER_S, MILD = 20261014, CITY = ['SOL', 'HAZ', 'RED', 'HAR', 'TAL', 'SAL'];   // (city order: the sim's inputs go so)
const card = p => (p.look({controls: false}).split('\n').find(l => l.startsWith('SUBURB ')) || '').slice(7);
const flexLog = p => p.game.state.log.filter(r => r.type === 'flex' || r.type === 'flexDel').map(r => r.type + ' ' + r.args.suburb + ' ' + hm(r.args.atS));
const toast = p => (p.$('toast').hidden ? '' : (p.$('toast').classList.contains('info') ? 'blue ' : 'RED ') + p.$('toast').textContent);
const span = a => hm(a) + '–' + hm(a + V.SOAK_S);
const cancelOf = (p, id) => p.doc.querySelectorAll('button').find(b => b.id.startsWith('city-' + id + '-soak-cancel-'));

test('Q1: SOAK THE CITY on a suburb card books every free suburb\'s soak at the shown time in one press (one action, one count); CANCEL trims one; the row is back for two free suburbs and books only those', () => {
  const p = openGame({seed: MILD});
  p.suburb('HAZ');
  const v = p.vm(), a = aimFlex(v.dayAhead, v.obs.levers, 'HAZ', 'soak'), n0 = p.game.playerInputs, k0 = p.game.acts.length;
  assert.ok(a >= V.SOAK_FROM_S, 'the soak aimed: ' + hm(a));
  assert.match(card(p), new RegExp('THE CITY \\+480 MW ' + span(a) + ' HOT WATER SOAK \\+140 MW ' + span(a) + ' '), 'first in the soak\'s rows, at the open suburb\'s aim');
  assert.equal(p.doc.activeElement.id, 'city-soak-all', 'the card opens on it');
  assert.equal(p.$('city-soak-all').getAttribute('aria-label'), 'SOAK THE CITY: the hot water soak of the 6 free suburbs, 480 MW ' + span(a));
  p.key('Enter');
  assert.deepEqual(flexLog(p), CITY.map(id => 'flex ' + id + ' ' + hm(a)), 'a flex input a suburb, at one time');
  assert.equal(p.game.playerInputs, n0 + 1, 'one press, one count (the end card\'s inputs, D-10)');
  assert.deepEqual(p.game.acts.slice(k0).map(x => x[1]), ['c'], 'one saved action (F-7)');
  assert.equal(p.$('city-soak-all'), null, 'no free suburb: the row goes');
  assert.match(card(p), new RegExp('SOAK ' + span(a) + ' booked: tonight\'s heating −525 MWh'));
  // the rest: an Enter on the row the focus moved to (HAZ's CANCEL) sends nothing
  assert.equal(p.doc.activeElement, cancelOf(p, 'HAZ'));
  p.key('Enter');
  assert.equal(toast(p), 'blue booked: the city\'s soak ' + span(a));
  assert.equal(flexLog(p).length, 6, 'nothing sent in the rest');
  // trim: HAZ's CANCEL after the rest, then RED's from its own card
  p.real(1.05, 0.35);
  p.key('Enter');
  assert.deepEqual(flexLog(p).slice(6), ['flexDel HAZ ' + hm(a)]);
  assert.equal(p.$('city-soak-all'), null, 'one free suburb: its own BOOK, no city row');
  p.suburb('RED');
  p.click(cancelOf(p, 'RED'));
  assert.ok(card(p).includes('THE CITY +250 MW ' + span(a)), card(p));
  p.real(1.05, 0.35);
  p.click('city-soak-all');
  assert.deepEqual(flexLog(p).slice(7), ['flexDel RED ' + hm(a), 'flex HAZ ' + hm(a), 'flex RED ' + hm(a)], 'only the free ones');
  assert.equal(p.game.playerInputs, n0 + 4);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q1: H on the line\'s city soak opens its first suburb\'s card with SOAK THE CITY focused, at the line\'s time; the briefing and a booked city answer in blue', () => {
  const p = openGame({seed: MILD, run: false}), atS = V.SOAK_FROM_S + 2700;   // (held: the line poked stays until the clock runs)
  const ids = ['HAZ', 'RED', 'TAL', 'SOL', 'SAL', 'HAR'];
  p.game.objective = {level: 'plan', kind: 'city', targets: ids.map(id => 'suburb-' + id), startBy: atS, short: null, long: null,
    text: 'The battery cannot take all of noon\'s spill. Book the city\'s HOT WATER SOAK, 10:45–14:45 (480 MW): tanks take the rest.',
    action: {type: 'soakCity', lever: 'soak', atS, suburbs: ids}};
  p.frame();
  assert.match(p.look({controls: false}), /^LINE ◇ SUBURB \(H\) The battery cannot take all of noon's spill\. Book the city's HOT WATER SOAK/m);
  p.key('h');
  assert.deepEqual([p.vm().suburb, p.doc.activeElement.id], ['HAZ', 'city-soak-all']);
  assert.ok(card(p).includes('THE CITY +480 MW 10:45–14:45 HOT WATER SOAK +140 MW 10:45–14:45 '), card(p));
  p.key('Enter');
  assert.deepEqual(flexLog(p), CITY.map(id => 'flex ' + id + ' 10:45'));
  // a press with nothing free (a stale row) answers in blue and sends nothing; so does the briefing
  const q = openGame({seed: MILD, take: false});
  q.$('btn-agc').click();
  assert.equal(q.h.actions.soakCity(atS), G.BRIEF_LOCK);
  assert.deepEqual(flexLog(q), []);
  assert.equal(p.h.actions.soakCity(atS), 'every suburb\'s soak is booked');
  assert.match(toast(p), /^RED Refused: every suburb's soak is booked$/);
});

test('Q1, F-7: a SOAK THE CITY press is saved as one action and resumes to the same state hash, counted once', () => {
  const mem = new Map([[G.SEEN_KEY, JSON.stringify({shifts: 3})]]), s = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
  const open = o => openGame(Object.assign({seed: 20261016, run: false, par: PAR, storage: s, date: new Date(2026, 9, 16)}, o));
  const p = open(), atS = V.SOAK_FROM_S + 3600;
  assert.equal(p.h.actions.soakCity(atS), '');
  G.runTo(p.game, Math.round((5.5 - V.DAY_START_H) * V.S_PER_H * TPS));   // (an hour on: the test budget)
  assert.ok(G.saveResume(p.game));
  const tick = p.game.state.tick, hash = hashState(p.game.state);
  const saved = JSON.parse(mem.get(G.RESUME_KEY + ':daily'));
  assert.deepEqual(saved.acts.filter(x => x[1] === 'c').map(x => x[2]), [{atS}], 'one action, its time');
  const q = open({take: false});
  assert.equal(q.$('btn-take').textContent, 'RESUME AT 05:30');
  q.click('btn-take');
  for (let k = 0; k < 400 && q.game.replay; k++) q.frame();
  assert.equal(q.game.resumeFailed, '', 'resumed');
  assert.equal(q.game.state.tick, tick);
  assert.equal(hashState(q.game.state), hash, 'the same state, bit for bit');
  assert.equal(q.game.playerInputs, 1, 'counted once');
  assert.deepEqual(q.game.state.log.filter(r => r.type === 'flex').map(r => r.args.suburb), CITY);
  assert.deepEqual(q.h.mods.errors, []);
});
