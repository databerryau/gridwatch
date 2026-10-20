// W6, F-7: resume. The save is the player's actions (each input with the feeder card it answered, RE-DISPATCH, the cards'
// answers, TAKE THE DESK) at their ticks, plus what frames alone keep; RESUME replays them through the game's own functions,
// with the system running as in play, and lands on the saved tick with the saved state hash. Here: the same state and the
// official run its own (an older tab yields); a press at the saved moment kept; a queued feeder remembered.
// tests/resume-save.test.js: the saves themselves; tests/resume-edges.test.js: cards, slots, days and plates.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import * as HI from '../app/history.js';
import * as D from '../app/director.js';
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

test('F-7: reopened, the briefing offers RESUME AT 09:30; the replay lands on the same tick and state, the official run still its own', () => {
  const {s, p, hash, tick} = played();
  assert.equal(hist(s).days[20261016].dnf, true, 'the run passed 09:00: the date\'s DNF, until it ends');
  const q = open(s, {take: false});
  assert.equal(q.$('briefing-title').textContent, 'Daily #5 · OFFICIAL', 'its own run, not practice beside it');
  assert.equal(q.$('btn-take').textContent, 'RESUME AT 09:30');
  assert.equal(q.$('btn-restart').hidden, false);
  assert.equal(q.$('btn-agc').hidden, true, 'a resumed day keeps its own mode');
  resume(q);
  assert.equal(q.game.state.tick, tick);
  assert.equal(hashState(q.game.state), hash, 'the same state, bit for bit');
  assert.equal(q.game.phase, 'play');
  assert.equal(q.game.director.paused, true, 'held where it was');
  assert.equal(q.game.playerInputs, 1);
  assert.equal(q.game.state.rert.armed, true);
  assert.deepEqual(q.game.cues, [], 'the replay was silent');
  assert.match(q.$('toast').textContent, /^Back at 09:30, as you left it\. Space runs the clock\.$/);
  assert.equal(q.$('briefing-card').hidden, true);
  // the older tab (still open) no longer owns the date: its end writes nothing
  assert.equal(hist(s).days[20261016].id, q.game.run.id, 'the resume took a new lease');
  p.game.state.over = true;
  p.frames(2);
  assert.equal(p.game.run.status, 'practice');
  assert.equal(hist(s).days[20261016].dnf, true);
  // the resumed tab ends the day: the date's entry is finished, its save gone
  q.game.state.over = true;
  q.frames(2);
  const e = hist(s).days[20261016];
  assert.equal(e.dnf, false);
  assert.equal(e.id, q.game.run.id);
  assert.deepEqual(saves(s), [], 'nothing left to resume');
  assert.ok(!q.game.end.share.tags.includes('PRACTICE'));
  assert.deepEqual(q.h.mods.errors, []);
});

test('F-7 (review): a press at the very moment of the save is kept; so is a RE-DISPATCH and a START after it', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s);
  G.runTo(p.game, AT(10));
  assert.equal(p.h.actions.input({type: 'armRERT'}), '');
  p.h.actions.redispatch();
  const t = p.game.state.tick;
  assert.ok(G.saveResume(p.game));
  const q = resume(open(s, {take: false}));
  assert.equal(q.game.state.tick, t);
  assert.equal(hashState(q.game.state), hashState(p.game.state));
  assert.equal(q.game.state.rert.armed, true);
  assert.equal(q.game.playerInputs, p.game.playerInputs);
});

test('F-7 (review): a feeder queued at its card still closes itself after the resume', () => {
  // the morning's feeder card: RESTORE at it closes the first and queues the other (D-27)
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = open(s, {seed: 20261007, run: true, date: new Date(2026, 9, 7)});
  const w = p.until('card', {max: '09:00'});
  assert.equal(p.game.feeder ? 'feeder' : w.why, 'feeder', JSON.stringify(w));
  p.key('Enter');
  const queued = D.queuedFeeders(p.game.director);
  assert.ok(queued.length >= 1, 'a feeder is queued');
  G.runTo(p.game, p.game.state.tick + TPS);   // (W7, Q-115: a grid second into its FOCUS, frequency out of band)
  const rf = p.game.director.rfs;
  assert.deepEqual([rf.length, rf[0].out, rf[0].back, rf[0].end], [1, true, -1, -1], 'saved mid-FOCUS, in the dip');
  assert.ok(G.saveResume(p.game));
  const q = resume(open(s, {seed: 20261007, take: false, date: new Date(2026, 9, 7)}));
  assert.equal(hashState(q.game.state), hashState(p.game.state));
  assert.deepEqual(D.queuedFeeders(q.game.director), queued);
  // W7 (Q-115): the close's FOCUS comes back with it (the replay follows the dip tick by tick, as play did)
  assert.deepEqual([q.game.director.rfs, q.game.director.focusUntilTick], [p.game.director.rfs, p.game.director.focusUntilTick]);
  // and both close it at its second
  for (const g of [p.game, q.game]) G.runTo(g, g.state.tick + 40 * 60 * TPS);
  assert.equal(hashState(q.game.state), hashState(p.game.state), 'the same day on from there');
  const caption = g => g.tray.cards.concat(g.tray.log).filter(c => /^Cold load/.test(c.text)).map(c => c.atS + ' ' + c.text);
  assert.deepEqual([q.game.director.rfs, caption(q.game)], [p.game.director.rfs, caption(p.game)], 'the same FOCUS end and caption');
  assert.equal(caption(p.game).length, 1, 'one caption: the queued close (D-27) has no FOCUS');
});
