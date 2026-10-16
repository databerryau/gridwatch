// W6, F-7: resume, its edges (tests/resume.test.js has the replay itself): a dismissed RESPOND card stays dismissed;
// another build, another seed and blocked storage; practice never takes the daily's slot, and a run saved on another day
// resumes as practice; a first shift's plates come back as they were.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import * as HI from '../app/history.js';
import * as D from '../app/director.js';
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


test('F-7 (review): a RESPOND card dismissed before the save stays dismissed after the resume', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s, {seed: 20261006, run: true});
  G.runTo(p.game, AT(9));   // (headless past the morning: this day's first trip is at 09:03)
  p.frame();
  for (let k = 0; k < 6 && G.shownFeeder(p.game); k++) { p.h.actions.ui({do: 'goOn'}); p.frame(); }   // (the feeders' cards: LEAVE)
  p.until('trip');
  const w = p.until('card', {max: '+30m'});
  assert.equal(D.respondCardOpen(p.game.director, p.game.state), true, JSON.stringify(w));
  p.key('Enter');
  assert.equal(D.respondCardOpen(p.game.director, p.game.state), false);
  assert.ok(G.saveResume(p.game));
  const q = resume(open(s, {seed: 20261006, take: false}));
  assert.equal(hashState(q.game.state), hashState(p.game.state));
  assert.equal(D.respondCardOpen(q.game.director, q.game.state), false, 'the old card does not hold the clock again');
});

test('F-7 (review): practice never takes the daily\'s slot; a run saved on another day resumes as practice and writes no entry', () => {
  const t = played();
  const past = open(t.s, {seed: 20261014});
  G.runTo(past.game, AT(5));
  assert.ok(G.saveResume(past.game));
  assert.deepEqual(saves(t.s), [DAILY, PRACTICE]);
  assert.equal(JSON.parse(t.s.mem.get(DAILY)).seed, 20261016, 'today\'s run is still there');
  // a run of the 17th's daily, played as practice on the 16th, resumed on the 17th: practice, and no entry for the 17th
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), f = open(s, {seed: 20261017});
  assert.equal(f.game.run.why, 'future');
  G.runTo(f.game, AT(8.9));
  assert.ok(G.saveResume(f.game));
  const q = open(s, {seed: 20261017, take: false, date: new Date(2026, 9, 17)});
  assert.equal(q.$('briefing-title').textContent, 'Daily #6 · PRACTICE');
  resume(q);
  G.runTo(q.game, AT(9.1));
  assert.equal(hist(s), null, 'it never became the 17th\'s official run');
});

test('F-7 (review): a first shift resumes as a first shift, with the plates it had lifted', () => {
  const s = store(), p = open(s, {plates: true});
  G.runTo(p.game, AT(7));
  p.game.plates.delete('start');   // (the line asked for START: its plate lifted)
  G.saveResume(p.game);
  const q = open(s, {take: false, plates: true});
  assert.equal(q.$('briefing-title').textContent, 'Daily #5 · FIRST SHIFT');
  resume(q);
  assert.equal(q.game.plates.has('start'), false);
  assert.equal(q.game.plates.has('stop'), true);
});
