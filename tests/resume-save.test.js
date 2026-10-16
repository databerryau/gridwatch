// W6, F-7: resume, its saves (tests/resume.test.js has the replay itself): small all day, a failed write leaves no older
// save, START OVER, another build, another seed, blocked storage.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import * as HI from '../app/history.js';
import {RESUME_LOST} from '../app/shell.js';
import {hashState} from '../sim/step.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S, TODAY = new Date(2026, 9, 16), AT = h => Math.round((h - 4) * 3600 * TPS);
const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
function store(init = {}) {
  const mem = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {mem, getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
}
const open = (s, o = {}) => openGame(Object.assign({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY}, o));
const hist = s => JSON.parse(s.mem.get(HI.HISTORY_KEY) || 'null');
const saves = s => [...s.mem.keys()].filter(k => k.startsWith(G.RESUME_KEY)).sort();
const DAILY = G.RESUME_KEY + ':daily', PRACTICE = G.RESUME_KEY + ':practice';
function resume(q) {
  q.click('btn-take');
  for (let k = 0; k < 400 && q.game.replay; k++) q.frame();
  assert.equal(q.game.replay, null);
  assert.equal(q.game.resumeFailed, '', 'resumed');
  return q;
}

// A returning player's official run to 09:30 with a press of theirs, then the tab hidden
function played(o = {}) {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s, o);
  assert.equal(p.send({type: 'armRERT'}), '');
  G.runTo(p.game, AT(9.5));
  assert.ok(G.saveResume(p.game), 'the hidden tab saves the run');
  return {s, p, hash: hashState(p.game.state), tick: p.game.state.tick};
}

test('F-7 (review): the save stays small all day (F-7: under 200 KB): actions, not the system\'s plans', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s);
  for (let h = 5; h <= 12; h += 0.25) { G.runTo(p.game, AT(h)); p.h.actions.input({type: 'guard', mw: (Math.round(h * 4) % 4) * 50}); }   // (29 presses: the save grows with actions, not hours)
  assert.ok(G.saveResume(p.game));
  const n = s.mem.get(DAILY).length;
  assert.ok(n < 20 * 1024, n + ' characters');
});

test('F-7: START OVER drops the save; the official run stays a DNF and this one is practice', () => {
  const {s} = played();
  const q = open(s, {take: false});
  q.click('btn-restart');
  assert.deepEqual(saves(s), []);
  assert.equal(q.$('btn-take').textContent, 'TAKE THE DESK');
  assert.equal(q.$('btn-restart').hidden, true);
  assert.equal(q.$('briefing-title').textContent, 'Daily #5 · PRACTICE');
  assert.equal(hist(s).days[20261016].dnf, true);
  // a write that fails leaves no older save to be offered
  const t = store({[G.SEEN_KEY]: {shifts: 3}}), r = open(t);
  assert.ok(G.saveResume(r.game));
  r.game.storage = Object.assign({}, t, {setItem(k, v) { if (k.startsWith(G.RESUME_KEY)) throw new Error('quota'); t.mem.set(k, String(v)); }});
  assert.equal(G.saveResume(r.game), false);
  assert.deepEqual(saves(t), [], 'the stale save went');
});

test('F-7: a save from another build is dropped with a message; another seed is not offered; storage blocked saves nothing', () => {
  const {s} = played();
  s.mem.set(DAILY, JSON.stringify(Object.assign(JSON.parse(s.mem.get(DAILY)), {sim: 'v4-core-0.0'})));
  const q = open(s, {take: false});
  assert.equal(q.$('btn-take').textContent, 'TAKE THE DESK');
  assert.equal(q.$('toast').textContent, RESUME_LOST);
  assert.deepEqual(saves(s), []);
  const t = played();
  assert.equal(open(t.s, {seed: 20261015, take: false}).$('btn-take').textContent, 'TAKE THE DESK');
  const blocked = {getItem: () => null, setItem() { throw new Error('blocked'); }, removeItem() {}};
  assert.equal(G.saveResume(open(blocked).game), false);
});
