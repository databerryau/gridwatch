// W6, F-7: resume, the second review's findings. A resumed run resumes again (its save keeps the whole day's actions); a
// desk key at the briefing cannot spoil a replay while a save is offered; no frame ticks while a replay runs; an older tab
// cannot overwrite the resumed run's save, and a run's old slot goes when it is saved anew.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import * as HI from '../app/history.js';
import {RESUME_LOCK} from '../render/format.js';
import {hashState} from '../sim/step.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S, TODAY = new Date(2026, 9, 16), AT = h => Math.round((h - 4) * 3600 * TPS);
function store(init = {}) {
  const mem = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {mem, getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
}
const open = (s, o = {}) => openGame(Object.assign({seed: 20261016, run: false, storage: s, date: TODAY}, o));
const saves = s => [...s.mem.keys()].filter(k => k.startsWith(G.RESUME_KEY)).sort();
const slot = (s, k) => JSON.parse(s.mem.get(G.RESUME_KEY + ':' + k) || 'null');
function resume(q) {
  q.click('btn-take');
  for (let k = 0; k < 400 && q.game.replay; k++) q.frame();
  assert.equal(q.game.resumeFailed, '', 'resumed');
  return q;
}

test('F-7 (review 2): a resumed run, played on and saved, resumes again to the same state', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s);
  p.send({type: 'armRERT'});
  G.runTo(p.game, AT(9.2));
  G.saveResume(p.game);
  const q = resume(open(s, {take: false}));
  G.runTo(q.game, AT(9.4));
  assert.equal(q.h.actions.input({type: 'guard', mw: 100}), '');
  const hash = hashState(q.game.state), tick = q.game.state.tick;
  assert.equal(slot(s, 'daily').acts.length, 3, 'TAKE THE DESK, the diesel and the GUARD');
  const r = resume(open(s, {take: false}));
  assert.equal(r.game.state.tick, tick);
  assert.equal(hashState(r.game.state), hash);
  assert.equal(r.game.run.status, 'official');
  assert.equal(JSON.parse(s.mem.get(HI.HISTORY_KEY)).days[20261016].id, r.game.run.id);
});

test('F-7 (review 2): while a save is offered the desk refuses inputs; while a replay runs no frame ticks', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s);
  G.runTo(p.game, AT(9.2));
  G.saveResume(p.game);
  const q = open(s, {take: false});
  q.click('key-agc');
  assert.equal(q.game.state.log.length, 0, 'the AGC key at the briefing is refused');
  assert.equal(q.h.actions.input({type: 'mode', agc: false}), RESUME_LOCK, 'any desk input: resume or start over first');
  assert.ok(G.resumeBegin(q.game));
  assert.equal(G.frame(q.game, 5, () => 0), 0, 'a frame during the replay runs no tick');
  q.key(' ');
  for (let k = 0; k < 400 && q.game.replay; k++) q.frame();
  assert.equal(q.game.resumeFailed, '');
  assert.equal(hashState(q.game.state), hashState(p.game.state));
});

test('F-7 (review 2): an older tab cannot overwrite the resumed run\'s save; a run saved anew leaves no old slot behind', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), a = open(s);
  G.runTo(a.game, AT(9.2));
  G.saveResume(a.game);
  const b = resume(open(s, {take: false}));
  G.runTo(b.game, AT(9.5));
  G.saveResume(b.game);
  // the old tab, still open, is hidden: it finds the date taken and saves as practice, never over the daily slot
  G.saveResume(a.game);
  assert.equal(a.game.run.status, 'practice');
  assert.equal(slot(s, 'daily').run.id, b.game.run.id);
  // the 16th's run, resumed on the 17th as practice and saved: one save, in the practice slot
  const c = resume(open(s, {take: false, date: new Date(2026, 9, 17)}));
  assert.equal(c.game.run.status, 'practice');
  G.runTo(c.game, AT(9.7));
  G.saveResume(c.game);
  assert.deepEqual(saves(s).map(k => k.split(':').pop()), ['practice'], 'the old daily save went');
});
