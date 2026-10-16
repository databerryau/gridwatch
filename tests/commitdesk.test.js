// K-24 (Q-93): the commitment desk. On an AGC day the levers, the hydro wheel and the Live Stack are the dispatch's
// readouts; each station has two word buttons, START and STOP, beside its machine lamps; RE-DISPATCH leaves the desk;
// the tie knob moves the tie and never holds the levers; the GUARD shows what it holds and a SET chip when the line
// asks. A HAND day keeps every lever input. Headless and sampled (tests/lib/play.js), DESK 2026-10-14 at 04:30.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;
// the enabled controls (a button, a slider...) the page shows: aria-disabled counts as not enabled
const enabled = p => p.buttons().filter(c => { const e = c.id && p.$(c.id); return !(e && e.getAttribute('aria-disabled') === 'true'); });
const LEVER = /^(lever-|wheel-hydro$|btn-redispatch$|man-|guard-(start|stop)-)/;

test('K-24: at 04:30 an AGC day shows at most about 55 enabled controls, none a lever, the wheel, RE-DISPATCH or a machine guard; a HAND day keeps them', () => {
  const agc = openGame({seed: 20261014, run: false}), hand = openGame({seed: 20261014, agc: false, run: false});
  const a = enabled(agc), h = enabled(hand);
  assert.ok(a.length <= 55, a.length + ' enabled controls: ' + a.map(c => c.id).join(' '));
  assert.deepEqual(a.filter(c => LEVER.test(c.id)).map(c => c.id), []);
  for (const sid of ['coal', 'ccgt', 'gta', 'gtb', 'gtc', 'hydro']) assert.ok(agc.$('station-start-' + sid) && agc.$('station-stop-' + sid), sid + ': its START and STOP');
  for (const id of ['lever-coal', 'lever-gtc', 'wheel-hydro', 'btn-redispatch', 'guard-start-gta1']) assert.ok(h.some(c => c.id === id), 'HAND keeps ' + id);
  assert.deepEqual(h.filter(c => /^station-/.test(c.id)), [], 'and has no station words');
});

test('K-24: a station\'s START presses the machine the line asks for, guarded (START?, then the start); a press on a lever says the dispatch sets the MW', () => {
  const p = openGame({seed: 20261014});
  p.to('06:00', {stop: [], line: 'near'});
  const line = p.game.objective, t = line && line.targets.find(x => x.startsWith('guard-start-')), unit = t ? t.slice('guard-start-'.length) : null;
  assert.ok(unit, 'the 06:00 line asks for a START: ' + (line && line.text));
  const sid = V.MACHINES.find(m => m.id === unit).station, b = 'station-start-' + sid;
  assert.ok(p.$(b).classList.contains('glow'), 'the asked station\'s START glows');
  const s1 = p.press(b, {after: 1 / 60});
  assert.match(s1.during, new RegExp(b + ' "START\\?" \\[pressed,ARMED'));
  assert.equal(p.game.state.log.filter(x => x.type === 'start').length, 0, 'one press lifts the cover');
  p.press(b, {after: 1 / 60});
  assert.deepEqual(p.game.state.log.filter(x => x.type === 'start').map(x => x.args.unit), [unit], 'the second starts the asked machine');
  const n = p.game.state.log.length, s = p.press('lever-coal', {after: 1 / 60});
  assert.match(s.during, /^NOTE blue [^\n]*: The dispatch sets the MW; START and STOP are yours\.$/m);
  assert.equal(p.game.state.log.length, n, 'and sends nothing');
  assert.deepEqual(p.h.mods.errors, []);
});

test('K-24: on an AGC day the tie knob moves the tie and never holds the levers: the dispatch keeps it there; on a HAND day it holds them', () => {
  const p = openGame({seed: 20261014});
  p.to('12:00', {stop: [], line: 'near'});
  assert.equal(p.send({type: 'tie', mw: -100}), '');
  p.to('12:30', {stop: [], line: 'near'});
  assert.equal(p.vm().held, false, 'not held by hand');
  assert.equal(p.game.state.tie.setMW, -100, 'the dispatch kept the tie where the player set it');
  assert.ok(p.$('btn-redispatch').hidden, 'no RE-DISPATCH to press');
  const h = openGame({seed: 20261014, agc: false});
  h.to('12:00', {stop: [], line: 'near'});
  h.send({type: 'tie', mw: -100});
  h.frame();
  assert.equal(h.vm().held, true, 'HAND: a hand on the tie holds the levers');
});

test('K-24: the GUARD says what it holds; while the line asks for a GUARD, SET n sets it in one press', () => {
  const p = openGame({seed: 20261014});
  for (let i = 0; i < 6 && p.to('08:00', {stop: [], line: 'near'}).why.startsWith('held'); i++) p.key('Escape'); // (the morning's hand-backs: Esc restores)
  const a = p.game.objective && p.game.objective.action;
  assert.ok(a && a.type === 'guard', 'the 08:00 line asks for a GUARD: ' + (p.game.objective && p.game.objective.text));
  assert.match(p.look(), new RegExp('guard-set "SET ' + a.mw + '"'));
  p.press('guard-set', {after: 1 / 60});
  assert.equal(p.game.state.battery.guardMW, a.mw);
  p.frames(2);
  assert.match(p.$('ring-guard').parentElement.parentElement.querySelector('.dk-ffr').textContent, new RegExp('GUARD ' + a.mw + ' held'));
  assert.ok(p.$('guard-set').hidden, 'set: the chip goes');
});
