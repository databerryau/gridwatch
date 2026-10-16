// W6, F-7: resume. A run in play is saved (the input log, the tick, the run's status) at TAKE THE DESK, at each input and
// when the tab is hidden; reopened, the briefing offers RESUME AT hh:mm, and the replay lands on the same tick with the
// same state hash, the official run still its own. START OVER leaves the date's DNF and plays practice; a save from
// another build is dropped with a message; the day's end clears the save; with storage blocked nothing is saved.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import * as HI from '../app/history.js';
import {RESUME_LOST} from '../app/shell.js';
import {hashState} from '../sim/step.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S, TODAY = new Date(2026, 9, 16), AT = h => (h - 4) * 3600 * TPS;
const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
function store(init = {}) {
  const mem = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {mem, getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
}
const open = (s, o = {}) => openGame(Object.assign({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY}, o));
const hist = s => JSON.parse(s.mem.get(HI.HISTORY_KEY) || 'null');

// A returning player's official run to 11:00, with one input of theirs, then the tab hidden: the saved run
function played() {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s);
  assert.equal(p.send({type: 'armRERT'}), '');
  G.runTo(p.game, AT(11));
  assert.ok(G.saveResume(p.game), 'the hidden tab saves the run');
  return {s, p, hash: hashState(p.game.state), tick: p.game.state.tick, id: p.game.run.id};
}

test('F-7: reopened, the briefing offers RESUME AT 11:00; the replay lands on the same tick and state, the official run still its own', () => {
  const {s, hash, tick, id} = played();
  assert.equal(hist(s).days[20261016].dnf, true, 'the run passed 09:00: the date\'s DNF, until it ends');
  const q = open(s, {take: false});
  assert.equal(q.$('briefing-title').textContent, 'Daily #5 · OFFICIAL', 'its own run, not practice beside it');
  assert.equal(q.$('btn-take').textContent, 'RESUME AT 11:00');
  assert.equal(q.$('btn-restart').hidden, false);
  assert.equal(q.$('btn-agc').hidden, true, 'a resumed day keeps its own mode');
  const t0 = performance.now();
  q.click('btn-take');
  for (let k = 0; k < 400 && q.game.replay; k++) q.frame();
  const ms = performance.now() - t0;
  assert.equal(q.game.replay, null);
  assert.equal(q.game.state.tick, tick);
  assert.equal(hashState(q.game.state), hash, 'the same state, bit for bit');
  assert.equal(q.game.phase, 'play');
  assert.equal(q.game.director.paused, true, 'held where it was');
  assert.equal(q.game.playerInputs, 1);
  assert.equal(q.game.run.id, id);
  assert.match(q.$('toast').textContent, /^Back at 11:00, as you left it\. Space runs the clock\.$/);
  assert.equal(q.$('briefing-card').hidden, true);
  // the day ends: the date's entry is finished, the save is gone
  q.game.state.over = true;
  q.frames(2);
  const e = hist(s).days[20261016];
  assert.equal(e.dnf, false);
  assert.equal(e.id, id);
  assert.equal(s.mem.has(G.RESUME_KEY), false, 'nothing left to resume');
  assert.ok(!q.game.end.share.tags.includes('PRACTICE'));
  assert.deepEqual(q.h.mods.errors, []);
  assert.ok(ms < 6000, 'resumed in ' + Math.round(ms) + ' ms');
});

test('F-7: START OVER drops the save; the official run stays a DNF and this one is practice', () => {
  const {s} = played();
  const q = open(s, {take: false});
  q.click('btn-restart');
  assert.equal(s.mem.has(G.RESUME_KEY), false);
  assert.equal(q.$('btn-take').textContent, 'TAKE THE DESK');
  assert.equal(q.$('btn-restart').hidden, true);
  assert.equal(q.$('briefing-title').textContent, 'Daily #5 · PRACTICE');
  assert.equal(hist(s).days[20261016].dnf, true);
});

test('F-7: a save from another build is dropped with a message; another seed or a day-end leaves none; storage blocked saves nothing', () => {
  const {s} = played();
  const raw = JSON.parse(s.mem.get(G.RESUME_KEY));
  s.mem.set(G.RESUME_KEY, JSON.stringify(Object.assign(raw, {sim: 'v4-core-0.0'})));
  const q = open(s, {take: false});
  assert.equal(q.$('btn-take').textContent, 'TAKE THE DESK');
  assert.equal(q.$('toast').textContent, RESUME_LOST);
  assert.equal(s.mem.has(G.RESUME_KEY), false);
  // a saved run of another seed is not offered for this one
  const t = played();
  const other = open(t.s, {seed: 20261015, take: false});
  assert.equal(other.$('btn-take').textContent, 'TAKE THE DESK');
  // storage blocked: the game plays and saves nothing
  const blocked = {getItem: () => null, setItem() { throw new Error('blocked'); }, removeItem() {}};
  const b = open(blocked);
  assert.equal(G.saveResume(b.game), false);
});

test('F-7: a first shift resumes as a first shift; a run saved on another date resumes as practice', () => {
  const s = store(), p = open(s);
  G.runTo(p.game, AT(7));
  G.saveResume(p.game);
  const q = open(s, {take: false});
  assert.equal(q.$('briefing-title').textContent, 'Daily #5 · FIRST SHIFT');
  const next = open(s, {take: false, date: new Date(2026, 9, 17)});
  assert.equal(next.$('briefing-title').textContent, 'Daily #5 · PRACTICE', 'yesterday\'s daily, resumed today, does not count');
  assert.equal(next.$('btn-take').textContent, 'RESUME AT 07:00');
});
