// Slice 2c's app shapes at stage A (desk/README.md §32.4.8, §32.5.3 step 4), neutral until the
// waves fill them: G.offerWhy (K-12's predicate, moved out of updateOffers unchanged), modeOf's
// segment / act / night, game.end.handFlown and .gated, and the tray's senders and targets for
// the new news kinds (Q-82). Pure or one createState each.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import * as G from '../app/game.js';
import * as D from '../app/director.js';
import * as T from '../app/tray.js';
import * as A from '../app/alarms.js';

test('K-12: G.offerWhy is the bay\'s predicate: respond (RESPOND or its card) > tight > peak, none past MAX_OFFERS', () => {
  const [p0, p1] = A.PEAK_H, obs = (level, h) => ({sec: {level}, clock: {h}}), t = n => ({n, extra: 0, contN: -1});
  assert.equal(G.offerWhy(obs('TIGHT', p0), t(0), 'RESPOND'), 'respond');
  assert.equal(G.offerWhy(obs('SECURE', 6), t(0), 'RESPOND-CARD'), 'respond');
  assert.equal(G.offerWhy(obs('SHORT', p0), t(0), 'CRUISE'), 'tight');
  assert.equal(G.offerWhy(obs('SECURE', p0), t(0), 'FAST'), 'peak');
  assert.equal(G.offerWhy(obs('SECURE', p1), t(0), 'CRUISE'), '', 'the peak window\'s end is outside it');
  assert.equal(G.offerWhy(obs('SECURE', 10), t(0), 'CRUISE'), '');
  assert.equal(G.offerWhy(obs('TIGHT', p0), t(G.MAX_OFFERS - 1), 'RESPOND'), 'respond');
  assert.equal(G.offerWhy(obs('TIGHT', p0), t(G.MAX_OFFERS), 'RESPOND'), '', 'at most MAX_OFFERS a day');
});

test('§32.4.8: modeOf carries segment, act and night, neutral until the D-2 profile (game and bench directors)', () => {
  const s = createState(1, CLASSIC);
  for (const d of [D.createDirector({game: true, paused: false}), D.createDirector({paused: true})]) {
    const m = D.modeOf(d, s);
    assert.deepEqual([m.segment, m.act, m.night], ['', 0, false], m.mode);
  }
});

test('§32.4.8: game.end.handFlown is the sim\'s tag, game.end.gated the daily\'s (null for a game made from a bare seed)', () => {
  const end = (o, poke) => { const g = G.createGame(Object.assign({storage: null}, o)); if (poke) poke(g.state); g.state.over = true; G.buildVm(g, {nowMs: 0, dtS: 0}); return g.end; };
  assert.deepEqual([end({seed: 3}).handFlown, end({seed: 3}).gated], [false, null]);
  assert.equal(end({seed: 3}, s => { s.control.handFlown = true; }).handFlown, true, 'read from state.control.handFlown (Q-64: the sim sets it at 04:30)');
  const daily = G.dailyFrom('?seed=3');
  assert.equal(end({daily}).gated, daily.gated);
  assert.equal(end({daily: Object.assign({}, daily, {gated: true})}).gated, true);
  const g = G.createGame({daily, storage: null});
  G.resetDay(g);
  assert.equal(g.daily, daily, 'PLAY THIS DAY AGAIN keeps the daily');
  G.resetDay(g, 4);
  assert.equal(g.daily, null, 'a reset to another seed is not that daily');
});

test('Q-82: a news card\'s sender and button by kind: the weather from the bureau, the tie from the market, an outage from the station, feeders from the network', () => {
  const card = (kind, text = 'x') => T.cardOf({tick: 0, kind: 'announce', news: {atS: 0, kind, fromS: 0, toS: 3600, text}});
  const row = c => [c.from, c.sev, c.button.label, c.button.target];
  for (const k of ['heat', 'storm', 'cloud', 'drought']) assert.deepEqual(row(card(k)), ['WEATHER BUREAU', 'warn', 'SEE THE STACK', 'stack'], k);
  assert.deepEqual(row(card('tie')), [T.SENDERS.market, 'warn', 'TO THE TIE', 'knob-tie']);
  assert.deepEqual(row(card('network')), ['NETWORK', 'warn', 'TO THE RESTORE BAY', 'bay-restore']);
  assert.equal(T.SENDERS.network, 'NETWORK');
  assert.deepEqual(row(card('outage', 'CCGT 2 is out of service until 07:15.')), [T.SENDERS.station, 'warn', 'TO THE LEVER', 'lever-ccgt']);
  assert.equal(card('outage', 'Mt Hazel coal 4 returns from maintenance at 11:30.').button.target, 'lever-coal');
  assert.equal(card('outage', 'A unit is out.').button.target, 'stack', 'no unit named: the stack');
  assert.deepEqual(row(card('smoke')), ['WEATHER BUREAU', 'warn', 'SEE THE STACK', 'map'], 'any other kind as before');
  assert.equal(card('tie').key, 'news:tie:0', 'the key as before: a kind and its start');
});
