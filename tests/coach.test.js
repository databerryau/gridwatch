// O-8 (Q-92): coach, then the problem. On a first shift the line coaches (the unit, the MW, the minute); from the
// second shift, or with COACH OFF (the header's toggle, remembered), it states the problem and lights every unit that
// can still arrive in time, naming one only when exactly one can. A day played from 04:30 with the coach off is tagged
// "no coach" on the end card. Headless (tests/lib/play.js), DESK 2026-10-14 at 04:30 (its line asks for a start).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';

const memStore = () => { const m = new Map(); return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
const lineOf = p => p.game.objective;

test('O-8: a first shift coaches ("Start CCGT 2 now"); a second shift states the problem, lights two or more STARTs and names none', () => {
  const first = openGame({seed: 20261014, run: false}), later = openGame({seed: 20261014, run: false, shifts: 1});
  first.frame(); later.frame();
  assert.equal(G.coachOn(first.game), true);
  assert.equal(G.coachOn(later.game), false);
  const c = lineOf(first), q = lineOf(later);
  assert.match(c.text, /Start CCGT 2 now/);
  assert.deepEqual(c.action, {type: 'start', unit: 'ccgt2'});
  const lit = q.targets.filter(t => t.startsWith('guard-start-'));
  assert.ok(lit.length >= 2, 'two or more lit: ' + q.targets.join(' '));
  assert.doesNotMatch(q.text, /\bStart (CCGT|GT|COAL|HYDRO|Mt|Riverton|Greyfell)/i, q.text);
  assert.match(q.text, new RegExp('^You will be \\d+ MW short from \\d\\d:\\d\\d.*' + lit.length + ' units can still make it in time: the lit STARTs\\.$'));
  assert.equal(q.action, null, 'the problem carries no action of its own');
  // the desk glows each lit unit's station START
  for (const t of lit) {
    const sid = t.slice('guard-start-'.length).replace(/\d+$/, '');
    assert.ok(later.$('station-start-' + sid).classList.contains('glow'), sid + ' glows');
  }
});

test('O-8: COACH OFF / ON from the header is remembered and the line follows at once; "no coach" is the end card\'s only while it stayed off from 04:30', () => {
  const storage = memStore();
  const p = openGame({seed: 20261014, run: false, storage});
  assert.match(p.look({controls: true}), /btn-coach "COACH ON" \[pressed\]/);
  p.click('btn-coach');
  assert.match(p.look(), /btn-coach "COACH OFF"/);
  assert.equal(JSON.parse(storage.m.get(G.SETTINGS_KEY)).coach, false, 'remembered');
  assert.match(lineOf(p).text, /units can still make it in time/, 'the line, at once');
  // a day played through with it off: the tag; a new page reads the choice back
  const q = openGame({seed: 20261014, run: false, storage});
  assert.equal(G.coachOn(q.game), false, 'remembered by the next page');
  q.game.state.over = true; q.frames(2);
  assert.match(q.look({controls: false}), /^END .*NO COACH: played from 04:30 with the coach off\./m);
  // turned back on during a day: no tag
  const r = openGame({seed: 20261014, run: false, storage});
  r.click('btn-coach');
  r.game.state.over = true; r.frames(2);
  assert.doesNotMatch(r.look({controls: false}), /NO COACH/);
  assert.deepEqual([p.h.mods.errors, q.h.mods.errors, r.h.mods.errors], [[], [], []]);
});
