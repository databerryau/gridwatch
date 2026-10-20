// W7 (Q-124) on the page: Marg's first-time lines for a price below zero and for coal held at its minimum while solar
// spills, each at the first moment it happens on a daily where it does: DESK-WEEKEND 20261017, a first shift (storage that
// works, nothing seen), where the price first goes below zero at 10:45 and a coal unit sits at its minimum with solar
// spilling at 10:58 (feeders closed at their cards, as a player pressing Enter would). Each line is a tray card from Marg
// at that moment, true of it; neither repeats while it stays true, and a browser that has met them never hears them again.
// One jump in a before() hook, sampled (tests/lib/play.js skipTo with a stop, CLAUDE.md): the hours to 11:00 are skipped.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import {firstsNow, MARG_FROM} from '../app/marg.js';
import {priceText} from '../render/format.js';
import {V} from '../sim/params.js';

const SEED = 20261017, TPS = V.TICKS_PER_S;
const mem = new Map();
const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
const seenMarg = () => (JSON.parse(mem.get(G.SEEN_KEY) || '{}').marg || {});
const S = {};

// skip to the first grid second `what` is true (answering the cards on the way as Enter would), then look
function firstMoment(p, what) {
  const before = p.game.marg.said.length;
  for (let n = 0; n < 20; n++) {
    const r = p.skipTo('14:00', {stop: ({state}) => firstsNow(state).includes(what)});
    if (r.why.startsWith('held')) { p.key('Enter'); continue; }
    assert.equal(r.why, 'pred', what + ' never happened before 14:00 on ' + SEED);
    break;
  }
  const vm = p.h.vm();
  return {at: p.game.state.tick / TPS, obs: vm.obs, look: p.look({controls: false}), said: p.game.marg.said.slice(before), seen: seenMarg(), dayAhead: p.game.dayAhead};
}

before(() => {
  const p = S.p = openGame({seed: SEED, storage});
  assert.ok(p.game.marg.first, 'a first shift');
  S.price = firstMoment(p, 'price');
  S.coal = firstMoment(p, 'coal');
});

test('Q-124 on the page: the first price below zero, at that moment: Marg\'s tray card with the price the Live Stack shows; remembered', () => {
  const x = S.price, line = x.said.find(l => l.key === 'first:price');
  assert.ok(line, 'said at the first second below zero: ' + JSON.stringify(x.said));
  assert.equal(line.atS, Math.floor(x.at));
  assert.ok(Math.round(x.obs.price.mwh) < 0, 'true at that moment');
  assert.equal(line.text, 'Price below zero: ' + priceText(x.obs.price.mwh) + '/MWh. More power than the city can use, so generators pay to run. Store what you can.');
  assert.match(x.look, new RegExp('^TRAY .*i ' + MARG_FROM + ' \\d\\d:\\d\\d Price below zero: ', 'm'), 'a tray card');
  assert.doesNotMatch(x.look, /^CLOCK .*\| (PAUSED|HELD)/m, 'no hold (Q-101)');
  assert.deepEqual(x.seen, {price: true}, 'kept with the first-shift memory');
});

test('Q-124 on the page: coal at its minimum while solar spills, at that moment: what it spills and why it stays on, true then; the price line not again', () => {
  const x = S.coal, line = x.said.find(l => l.key === 'first:coal'), o = x.obs;
  assert.ok(line && line.atS === Math.floor(x.at), JSON.stringify(x.said));
  // true then: a coal unit at its minimum, the solar it spills (to 10 MW), and stopped now it would be out past the evening's peak
  const u = o.units.find(q => q.cls === 'coal' && q.mode === 'on' && q.schedMW <= q.minMW + 0.5), m = V.MACHINES.find(q => q.id === u.id);
  const spill = o.solar.availMW - o.solar.outMW, back = o.s + m.t4S + m.minDownS + m.t1S + V.AUTO_SYNC_S;
  let peak = null;
  for (let k = 0; k < x.dayAhead.n; k++) { const t = x.dayAhead.fromS + (k + 1) * x.dayAhead.stepS; if (t >= o.s && (!peak || x.dayAhead.demandP50[k] > peak.mw)) peak = {mw: x.dayAhead.demandP50[k], atS: t}; }
  assert.ok(spill > V.SURPLUS_MIN_MW);
  assert.ok(back > peak.atS, 'back after the peak');
  assert.equal(line.text, 'Coal\'s at its minimum: lower, it won\'t burn steady. Solar spills ' + (Math.round(spill / 10) * 10).toLocaleString('en-AU') +
    ' MW. Stopped, coal\'s out past the evening.');
  // the price is still below zero, and she has not said it again
  assert.ok(Math.round(o.price.mwh) < 0);
  assert.equal(S.p.game.marg.said.filter(l => l.key === 'first:price').length, 1);
  assert.deepEqual(x.seen, {price: true, coal: true});
});

test('Q-124: a browser that has met them never hears them again; with storage blocked, the page remembers for the rest of its days', () => {
  // the same moment (coal and the price both true) in a new page on the same storage: nothing to say; on a new browser, both
  const at = S.p.game.state, ask = st => { const g = G.createGame({seed: SEED, storage: st}); G.takeDesk(g); g.state = at; return G.margFirsts(g, 'CRUISE'); };
  assert.deepEqual(firstsNow(at).filter(k => k !== 'relays'), ['price', 'coal']);
  assert.deepEqual(ask(storage), [], 'met in this browser');
  assert.deepEqual(ask(null), ['price', 'coal'], 'a new browser would hear both');
  // storage blocked: the page's memory carries to its next day (PLAY THIS DAY AGAIN: the same page), so at most once a day
  const g = G.createGame({seed: SEED, storage: null});
  G.takeDesk(g);
  g.director.seen.marg = {price: true};
  G.resetDay(g);
  G.takeDesk(g);
  g.state = at;
  assert.deepEqual(G.margFirsts(g, 'CRUISE'), ['coal']);
});

test('Q-124 review: two lessons due in one frame beside two warnings: one is said, the other waits for room, and neither goes to the LOG unseen', () => {
  // a new browser at that moment (the price below zero and coal at its minimum both new), the tray holding two warnings
  const g = G.createGame({seed: SEED, storage: null}), frame = n => G.buildVm(g, {nowMs: n * 16, dtS: 1 / 60});
  G.takeDesk(g);
  g.state = S.p.game.state;
  const warn = n => ({id: 'w' + n, from: 'MARKET NOTICE', atS: 0, text: 'warning ' + n, sev: 'warn', button: {label: 'TO THE GAUGE', target: 'gauge-n1'}, untilS: 1e9});
  g.tray.cards = [warn(1), warn(2)];
  const firsts = () => g.marg.said.filter(l => l.key.startsWith('first:')).map(l => l.key), mine = list => list.filter(c => c.from === MARG_FROM).map(c => c.text.split(':')[0]);
  frame(1);
  assert.deepEqual(firsts(), ['first:price'], 'one a frame');
  assert.deepEqual(mine(g.tray.cards), ['Price below zero']);
  frame(2);
  assert.deepEqual(firsts(), ['first:price'], 'coal waits: hers would send the price\'s card to the LOG');
  assert.deepEqual(g.director.seen.marg, {price: true}, 'and is not kept as met');
  // the price's card has had its life (TRAY_LIFE_REAL_S): the frame moves it to the LOG, and coal has its turn
  g.tray.cards.find(c => c.from === MARG_FROM).untilS = g.state.tick / TPS;
  frame(3);
  assert.deepEqual(mine(g.tray.log), ['Price below zero']);
  assert.deepEqual(firsts(), ['first:price', 'first:coal']);
  assert.deepEqual(mine(g.tray.cards), ['Coal\'s at its minimum']);
  assert.deepEqual(g.director.seen.marg, {price: true, coal: true});
});
