// Slice 2c's clock on the page's side (desk/README.md §32.7.2; Q-62-Q-64, Q-70, Q-73, Q-78): the
// rate director plays the D-2 profile (sim/clock.js), RESTORE at each hand-back, NIGHT from 21:00,
// FAST refused and released, the badge, the line's cadence, the briefing's AGC/HAND as the sim's
// mode, the night lock, and D-6's and D-4's accepts on a 2-h slice of a desk day. The whole-day
// profile runs on a fake state (only what the director reads): app/loop.js runFrame and rateOf, no sim.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {hashState} from '../sim/step.js';
import {realBetween, rateAt, NIGHT_S} from '../sim/clock.js';
import {SCENARIOS} from '../content/scenarios.js';
import * as D from '../app/director.js';
import * as G from '../app/game.js';
import {createPacer, runFrame} from '../app/loop.js';
import {badgeText, badgeTitle} from '../render/format.js';
import {injectTrip} from './lib/sim-helpers.js';
import {openGame} from './lib/play.js';

const TPS = V.TICKS_PER_S, START = V.PLAYER_START_S, H = 3600;
const CLEARS = [9900, 11700]; // 06:45 and 07:15: two hand-backs on the morning ramp (270x)

// A fake state: only what the director reads.
const fake = (o = {}) => ({tick: (o.s ?? START) * TPS, over: false, contIdx: -1, conts: [], scope: {unit: ''},
  control: {handFlown: !!o.hand}, scn: {night: o.night ?? true},
  city: {districts: (o.clears || []).map((c, i) => ({id: 'T' + i, clearS: c, dark: true, shedBy: 'task', restoredAtS: -1}))}});
const director = seen => D.createDirector({game: true, paused: false, seen});
const trip = st => { st.conts.push({n: 0, startTick: st.tick, watchEndTick: st.tick + V.WATCH_S * TPS, backInBandTick: -1, rocofHzS: -0.3, uflsStages: 0}); st.contIdx = 0; };
const mode = (d, st) => D.modeOf(d, st).mode;

// 04:30 to 04:00 through the page's loop at `hz` frames a real second: the real seconds it took (the
// last frame may run past 04:00: within one frame).
function day(st, d, hz) {
  const p = createPacer(), h = {rate: () => D.rateOf(d, st), tick: () => { st.tick++; }};
  let frames = 0;
  while (st.tick < V.DAY_TICKS) { runFrame(p, 1 / hz, h); frames++; }
  return frames / hz;
}

test('Q-62, Q-63: CRUISE plays the D-2 profile: 04:30 to 04:00 takes 245 real s at 60 and at 144 Hz, the night roll included; HAND 478', () => {
  for (const hz of [60, 144]) {
    const r = day(fake(), director(), hz);
    assert.ok(Math.abs(r - 245) <= 3 && Math.abs(r - realBetween(START, V.DAY_S)) < 0.05, hz + ' Hz: ' + r.toFixed(3) + ' real s');
  }
  const hand = day(fake({hand: true}), director(), 60);
  assert.ok(Math.abs(hand - 478) <= 3 && Math.abs(hand - realBetween(START, V.DAY_S, true)) < 0.05, 'HAND: ' + hand.toFixed(3) + ' real s');
});

test('Q-70: RESTORE at each hand-back, 30x (10x until this browser has closed a task feeder) until it is closed or 300 grid-s: two never closed add 17.78 real s', () => {
  const ramp = 2 * (V.RESTORE_PACE_MAX_S / V.RESTORE_PACE_RATE - V.RESTORE_PACE_MAX_S / 270); // 2 x (10 - 1.11)
  const seen = day(fake({clears: CLEARS}), director({restore: true}), 60);
  assert.ok(Math.abs(seen - (245 + 17.78)) <= 3 && Math.abs(seen - 245 - ramp) < 0.05, 'returning: ' + seen.toFixed(3) + ' real s');
  // the window, second by second (the first time: 10x over the same 300 grid-s, 30 real s)
  const st = fake({clears: CLEARS, s: CLEARS[0] - 1}), d = director(), at = s => { st.tick = s * TPS; return D.modeOf(d, st); };
  assert.equal(at(CLEARS[0] - 1).mode, 'CRUISE');
  assert.deepEqual([at(CLEARS[0]).mode, D.rateOf(d, st), badgeText(D.modeOf(d, st))], ['RESTORE', 10, 'RESTORE 10×']);
  assert.equal(D.setFast(d, st, true), false, 'no FAST in RESTORE');
  assert.equal(at(CLEARS[0] + V.RESTORE_PACE_MAX_S - 1).mode, 'RESTORE');
  assert.equal(at(CLEARS[0] + V.RESTORE_PACE_MAX_S).mode, 'CRUISE', 'a pace, not a hold: 300 grid-s at most');
  // the first closed at 07:14: RESTORE ends, and the second's allowed second is that + RESTORE_INTERVAL_S (07:19)
  Object.assign(st.city.districts[0], {dark: false, restoredAtS: CLEARS[1] - 60});
  at(CLEARS[1] - 60);
  assert.equal(D.focusRestore(d, st, 'T0'), true, 'the first accepted restore of a task feeder sets seen.restore');
  assert.deepEqual([d.seen.restore, d.seenDirty, D.focusRestore(d, st, 'T0')], [true, true, false]);
  assert.equal(at(CLEARS[1]).mode, 'CRUISE');
  assert.deepEqual([at(CLEARS[1] - 60 + V.RESTORE_INTERVAL_S).mode, D.rateOf(d, st)], ['RESTORE', 30]);
  assert.equal(at(CLEARS[1] - 60 + V.RESTORE_INTERVAL_S + 1).mode, 'RESTORE');
  st.scope.unit = 'gta1';
  assert.equal(mode(d, st), 'FOCUS', 'FOCUS (a scope, a breaker) is above RESTORE');
  const plain = fake({s: CLEARS[0]});
  plain.city.districts.push({id: 'X', clearS: -1, dark: true, shedBy: 'ufls', restoredAtS: -1});
  assert.equal(D.focusRestore(director(), plain, 'X'), false, 'a UFLS district is not the task');
});

test('Q-63: FAST is 3 x the profile, refused in WATCH, the card, RESPOND, FOCUS, ALARMS, RESTORE and NIGHT; a ringing tray card ends it (MSL2 does, MSL1 does not)', () => {
  const s = 7 * H, st = fake({s}), d = director({watch: true});           // 11:00, MIDDAY SOLAR
  assert.equal(D.setFast(d, st, true), true);
  assert.deepEqual([mode(d, st), D.modeOf(d, st).rate, D.rateOf(d, st)], ['FAST', 900, 3 * rateAt(s)]);
  const refused = (name, poke) => {
    const x = fake({s}), e = director({watch: true});
    poke(x, e);
    assert.equal(mode(e, x), name);
    assert.equal(D.setFast(e, x, true), false, 'refused in ' + name);
  };
  refused('ALARMS', (x, e) => { e.held = true; });
  refused('FOCUS', x => { x.scope.unit = 'gta1'; });
  refused('WATCH', x => trip(x));
  refused('RESPOND-CARD', x => { trip(x); x.tick = x.conts[0].watchEndTick; });
  refused('RESPOND', (x, e) => { trip(x); x.tick = x.conts[0].watchEndTick; D.dismissCard(e, x); });
  refused('RESTORE', x => { x.city.districts.push({id: 'T', clearS: s, dark: true, shedBy: 'task', restoredAtS: -1}); });
  refused('NIGHT', x => { x.tick = (NIGHT_S + H) * TPS; });
  // FAST held when RESTORE comes: it ends there
  const r = fake({s: CLEARS[0] - 1, clears: CLEARS}), e = director();
  D.setFast(e, r, true);
  r.tick += TPS;
  D.directorFrame(e, r);
  assert.equal(e.fast, false);
  // the game: a card that rings ends FAST (G.handleRecords, the records a step returns); an information card does not
  const game = G.createGame({seed: 3, storage: null});
  G.takeDesk(game);
  const msl = level => ({tick: game.state.tick, kind: 'log', sev: level > 1 ? 'warn' : 'info', code: 'MSL' + level, msg: 'MSL' + level + ' notice',
    level, minMW: 2500, atS: Math.floor(game.state.tick / TPS) + H});
  assert.equal(G.ui(game, {do: 'fast', on: true}), '');
  G.handleRecords(game, [msl(1)], '');
  assert.equal(mode(game.director, game.state), 'FAST', 'MSL1 is information');
  G.handleRecords(game, [msl(2)], '');
  assert.equal(mode(game.director, game.state), 'CRUISE', 'MSL2 rings: FAST released');
});

test('Q-73: NIGHT from 21:00 on a night scenario: the profile eased in, no FAST, and a contingency there is logged only (no watch, card or RESPOND); classic keeps its watch', () => {
  const st = fake({s: NIGHT_S - 1}), d = director({watch: true});
  assert.deepEqual([mode(d, st), badgeText(D.modeOf(d, st))], ['CRUISE', 'PEAK EASING 300×']);
  assert.ok(D.rateOf(d, st) > 300 && D.rateOf(d, st) < 2100, 'eased into: ' + D.rateOf(d, st));
  st.tick = NIGHT_S * TPS;
  assert.deepEqual([mode(d, st), badgeText(D.modeOf(d, st)), badgeTitle(D.modeOf(d, st))], ['NIGHT', 'NIGHT ROLL 2,100×', 'The night roll: the night shift runs the grid to 04:00']);
  st.tick = (NIGHT_S + H) * TPS;
  trip(st);
  const m = D.modeOf(d, st);
  assert.deepEqual([m.mode, m.rate, D.rateOf(d, st), m.locked, m.night], ['NIGHT', 2100, 2100, false, true]);
  st.tick = st.conts[0].watchEndTick + 1;
  assert.deepEqual([mode(d, st), D.respondCardOpen(d, st), D.dismissCard(d, st)], ['NIGHT', false, false], 'no card');
  const classic = fake({s: NIGHT_S + H, night: false});
  trip(classic);
  assert.equal(mode(d, classic), 'WATCH', 'classic (night: false) keeps its watch');
  // the night lock (the sim sets control.nightShift at 21:00 on a night scenario; test poke): sim inputs refused in blue, views open
  const game = G.createGame({seed: 3, storage: null});
  G.takeDesk(game);
  game.state.control.nightShift = true;
  const n = game.state.log.length;
  assert.equal(G.sendInput(game, {type: 'tie', mw: 100}), G.NIGHT_LOCK);
  assert.equal(G.redispatch(game), G.NIGHT_LOCK);
  assert.equal(game.state.log.length, n, 'nothing logged');
  assert.ok(G.isLock(G.NIGHT_LOCK) && !G.isLock('tie limit'));
  for (const cmd of [{do: 'pause'}, {do: 'pause'}, {do: 'ack'}, {do: 'volume', volume: 0.5}, {do: 'drawer'}]) assert.equal(G.ui(game, cmd), '', cmd.do);
});

test('Q-63, Q-78: the badge names the segment and its target, never an ease\'s figure (HAND halved), the act in its title; the line\'s cadence and reading lead follow the profile', () => {
  const st = fake({s: 2 * H}), d = director();                           // 06:00: easing 540x -> 270x
  assert.ok(Math.abs(D.rateOf(d, st) - 360) < 1e-6, 'the loop runs the ease: ' + D.rateOf(d, st));
  assert.deepEqual([D.modeOf(d, st).rate, badgeText(D.modeOf(d, st)), badgeTitle(D.modeOf(d, st))],
    [270, 'MORNING RAMP 270×', 'Act I, the morning ramp: the city wakes and demand climbs']);
  const peak = fake({s: 14 * H, hand: true});                             // 18:00 in HAND
  assert.deepEqual([badgeText(D.modeOf(d, peak)), D.modeOf(d, peak).act], ['PEAK 75×', 3]);
  assert.equal(badgeTitle(D.modeOf(d, fake({s: 6 * H}))), 'Act II, the belly: rooftop solar floods in');
  assert.equal(badgeTitle(D.modeOf(d, fake({s: 0}))), '', 'the briefing: no act');
  // objectiveDue: max(30 grid-s, 0.4 real s of the profile); 'news' when the watch, the card, RESPOND, RESTORE, NIGHT or OVER comes or goes
  const g = (s, hand = false) => ({objectiveS: s, objectiveMode: 'CRUISE', state: {control: {handFlown: hand}}});
  assert.deepEqual([G.objectiveDue(g(START), START + 215, 'CRUISE'), G.objectiveDue(g(START), START + 216, 'CRUISE')], [false, true], '540x: 216 grid-s');
  assert.deepEqual([G.objectiveDue(g(14 * H), 14 * H + 59, 'CRUISE'), G.objectiveDue(g(14 * H), 14 * H + 60, 'CRUISE')], [false, true], '150x: 60');
  assert.equal(G.objectiveDue(g(14 * H, true), 14 * H + 30, 'CRUISE'), true, 'HAND 75x: the 30-s floor');
  for (const m of ['RESTORE', 'NIGHT', 'RESPOND', 'WATCH']) assert.equal(G.objectiveDue(g(START), START + 1, m), 'news', m);
  assert.equal(G.objectiveDue(g(START), START + 1, 'PAUSE'), false, 'Space is not news');
});

test('Q-64: in the briefing AGC/HAND is the sim\'s mode: the desk\'s key and the card\'s buttons set it, the card draws it, any other sim input is refused in blue; TAKE THE DESK keeps it; a new day reads AGC', () => {
  const p = openGame({take: false});
  p.frame();
  const on = id => new RegExp(id + ' "[^"]*" \\[[^\\]]*on');
  const v = p.press('key-agc', {after: 1 / 60});                        // the desk's AGC/HAND key (V focuses it; Enter here takes the desk)
  assert.equal(p.game.state.control.mode, 'HAND');
  assert.match(v.after, on('btn-hand'));
  assert.doesNotMatch(v.after, on('btn-agc'));
  p.click('guard-start-gta1');                                           // the cover up; the second press is the START
  const s = p.press('guard-start-gta1', {after: 1 / 60});
  assert.match(s.during, /^TOAST blue Take the desk first: Enter\.$/m);
  assert.equal(p.h.actions.input({type: 'planDel', station: 'ccgt', atS: 9000}), G.BRIEF_LOCK, 'a stack drop: the same answer');
  assert.deepEqual(p.game.state.log.map(r => r.type), ['mode'], 'only the mode is logged');
  p.key('Enter');                                                        // TAKE THE DESK
  p.key(' ');
  assert.deepEqual([p.game.state.control.mode, p.game.state.control.handFlown, p.mode()], ['HAND', true, 'CRUISE']);
  assert.match(p.look({controls: false}), /^CLOCK 04:3\d:\d\d \| PRE-DAWN 270× /m, 'HAND halves the profile');
  G.resetDay(p.game);
  p.frame();
  assert.match(p.look(), on('btn-agc'), 'a new day: the card reads AGC');
  p.click('btn-hand'); p.click('btn-agc');
  assert.match(p.look(), on('btn-agc'));
  p.key('Enter'); p.key(' ');
  assert.deepEqual([p.game.state.control.mode, p.game.state.control.handFlown], ['AGC', false], 'HAND then AGC: an AGC day, never tagged');
  assert.deepEqual(p.game.state.log.map(r => r.type).slice(0, 2), ['mode', 'mode']);
  assert.deepEqual(p.h.mods.errors, []);
});

// ------------------------------------------------------------------ D-6 and D-4 on a 2-h slice

// Desk 2026-10-02 from 07:00 to 09:00: HAZ4's feeder handed back at 07:30 (HAZ5's at 08:00), a cloud
// warning at 08:25 and a trip injected at 08:40, with the player's inputs at fixed ticks.
const SEED = 20261002, FROM = 3 * H, TRIP = 4 * H + 2400, UNTIL = 5 * H * TPS;
const MID = (TRIP - 300) * TPS, NEAR = (TRIP + 600) * TPS;            // D-4's stretch: 08:35 to 08:50
const INPUTS = [[(FROM + 600) * TPS, {type: 'guard', mw: 150}], [(12600 + 30) * TPS + 7, {type: 'restore', district: 'HAZ4'}],
  [(4 * H + 300) * TPS + 13, {type: 'battery', mode: 'discharge', mw: 100}], [(TRIP + 500) * TPS, {type: 'tie', mw: 300}]];
let base = null, mid = null, ref = null;
const mem = () => { const m = new Map(); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m}; };

// A game on the slice from a copy of `from`: the inputs, and the hashes at NEAR and UNTIL, by beforeTick.
function slice(seen = {}, from = base) {
  const out = {hash: '', near: '', accepted: 0};
  const game = G.createGame({seed: SEED, scenario: SCENARIOS.desk, storage: mem(), beforeTick: g => {
    const t = g.state.tick;
    for (const [at, x] of INPUTS) if (t === at && G.sendInput(g, x) === '') out.accepted++;
    if (t === MID && !mid) mid = structuredClone(g.state);
    if (t === NEAR) out.near = hashState(g.state);
    if (t === UNTIL) out.hash = hashState(g.state);
  }});
  Object.assign(game.director.seen, seen);
  game.state = structuredClone(from);
  G.takeDesk(game);
  out.game = game;
  return out;
}
// Frames until `end`: `each(game, i)` before each frame; a RESPOND card is dismissed at once.
function frames(o, dtS, each, end = UNTIL) {
  const game = o.game;
  for (let i = 0; game.state.tick <= end; i++) {
    assert.ok(i < 2e4, 'the slice plays out');
    if (each) each(game, i);
    G.frame(game, dtS);
    if (D.respondCardOpen(game.director, game.state)) G.ui(game, {do: 'dismissRespond'});
  }
  return o;
}

// The reference: the slice at 1x, the page's loop at one grid second per real second.
before(() => {
  const g = G.createGame({seed: SEED, scenario: SCENARIOS.desk, storage: null});
  G.takeDesk(g);
  injectTrip(g.state, TRIP);
  G.runTo(g, FROM * TPS);
  base = structuredClone(g.state);
  ref = slice();
  const p = createPacer(), h = {rate: () => 1, tick: () => G.tickOnce(ref.game)};
  while (ref.game.state.tick <= UNTIL) runFrame(p, 0.1, h);
});

test('D-6 (1 of 2): one input log at 1x and with F held gives one hashState (a 2-h slice holding a hand-back, a warning and a trip)', () => {
  const st = ref.game.state;
  assert.ok(st.conts.length === 1 && st.news.some(n => n.kind === 'cloud' && n.atS > FROM) && ref.accepted === INPUTS.length, 'the slice holds them all');
  assert.ok(st.log.some(r => r.type === 'restore') && ref.hash);
  // F held (pressed again whenever something released it), the watch played, the card dismissed at once
  let fastFrames = 0;
  const fast = frames(slice({watch: true}), 1 / 60, g => { if (D.modeOf(g.director, g.state).mode === 'CRUISE') G.ui(g, {do: 'fast', on: true}); if (D.modeOf(g.director, g.state).mode === 'FAST') fastFrames++; });
  assert.ok(fastFrames > 100, fastFrames + ' frames at FAST');
  assert.deepEqual([fast.hash, fast.accepted], [ref.hash, INPUTS.length]);
  assert.ok(fast.game.director.seen.restore && JSON.parse(fast.game.storage.m.get(G.SEEN_KEY)).restore, 'the restore of a task feeder set seen.restore, saved');
});

test('D-6 (2 of 2): the same log with 50 seeded random pauses gives the same hashState', () => {
  let seed = 7, left = 50, until = -1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pauses = frames(slice({watch: true}), 1 / 60, (g, i) => {
    if (until === i) G.ui(g, {do: 'pause'});
    else if (until < i && left > 0 && rnd() < 0.05 && !g.director.paused) { G.ui(g, {do: 'pause'}); left--; until = i + 1 + Math.floor(rnd() * 30); }
  });
  assert.equal(left, 0, 'all 50 pauses taken');
  assert.deepEqual([pauses.hash, pauses.accepted], [ref.hash, INPUTS.length]);
});

test('D-4: the trip\'s watch advances the grid clock by 0.50 min, and the outcome is the same whether it is viewed or skipped (the profile around it)', () => {
  const c = ref.game.state.conts[0];
  assert.equal((c.watchEndTick - c.startTick) / TPS / 60, 0.5);
  const viewed = frames(slice({watch: true}, mid), 1 / 60, null, NEAR);
  let skips = 0;
  const skipped = frames(slice({watch: true}, mid), 1 / 60, g => { if (D.modeOf(g.director, g.state).mode === 'WATCH' && G.ui(g, {do: 'skipWatch'}) === '') skips++; }, NEAR);
  assert.equal(skips, 1, 'Esc skipped the one watch');
  assert.deepEqual([viewed.near, skipped.near], [ref.near, ref.near]);
});
