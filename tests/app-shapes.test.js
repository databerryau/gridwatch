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
import {PEAK, NIGHT_S} from '../sim/clock.js';

// (wave 2, clock: offerWhy dropped its `mode` (Q-78), and modeOf's segment and act became real; these two tests follow)
test('K-12, Q-78: G.offerWhy is the bay\'s predicate: respond (D-5\'s window, once per contingency) > tight or peak (one a day), none past MAX_OFFERS or from 21:00; W7 (Q-115): HAND days only', () => {
  const [p0, p1] = PEAK, obs = (level, s, inRespond = false, mode = 'HAND') => ({s, mode, handFlown: mode === 'HAND', sec: {level}, inRespond, contingency: {n: 0}}), t = (n, extra = 0, contN = -1) => ({n, extra, contN});
  for (const [level, s, r] of [['TIGHT', p0, true], ['SHORT', p0, false], ['SECURE', p0, false]]) {
    assert.equal(G.offerWhy(obs(level, s, r, 'AGC'), t(0)), '', 'an AGC day: nothing is offered (' + level + ')');
  }
  assert.equal(G.offerWhy(Object.assign(obs('TIGHT', p0), {handFlown: false}), t(0)), 'tight', 'the held 04:30 desk of a HAND day (mode HAND, not yet tagged)');
  assert.equal(G.offerWhy(obs('TIGHT', p0, true), t(0)), 'respond');
  assert.equal(G.offerWhy(obs('SECURE', 7200, true), t(0)), 'respond');
  assert.equal(G.offerWhy(obs('TIGHT', p0, true), t(1, 0, 0)), 'tight', 'this contingency had its offer: the day\'s tight or peak one is left');
  assert.equal(G.offerWhy(obs('SHORT', p0), t(0)), 'tight');
  assert.equal(G.offerWhy(obs('SECURE', p0), t(0)), 'peak');
  assert.equal(G.offerWhy(obs('SECURE', p0), t(1, 1)), '', 'tight and peak share one offer a day');
  assert.equal(G.offerWhy(obs('TIGHT', p0), t(1, 1)), '');
  assert.equal(G.offerWhy(obs('SECURE', p1), t(0)), '', 'the peak window\'s end is outside it');
  assert.equal(G.offerWhy(obs('SECURE', 21600), t(0)), '');
  assert.equal(G.offerWhy(obs('TIGHT', NIGHT_S, true), t(0)), '', 'none from 21:00');
  assert.equal(G.offerWhy(obs('TIGHT', p0, true), t(G.MAX_OFFERS - 1, 1, 0)), '');
  assert.equal(G.offerWhy(obs('TIGHT', p0, true), t(G.MAX_OFFERS)), '', 'at most MAX_OFFERS a day');
});

test('§32.4.8: modeOf carries segment, act and night: the D-2 segment and act in the game, neutral on the bench', () => {
  const s = createState(1, CLASSIC);
  const m = D.modeOf(D.createDirector({game: true, paused: false}), s);
  assert.deepEqual([m.segment, m.act, m.night], ['PRE-DAWN', 0, false], m.mode);
  const b = D.modeOf(D.createDirector({paused: true}), s);
  assert.deepEqual([b.segment, b.act, b.night], ['', 0, false], b.mode);
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
  // the unitOutage applier's text (A2, sim/events.js): the unit by its full name
  assert.deepEqual(row(card('outage', 'Late return from maintenance: Riverton CCGT 2 unavailable until 07:15.')), [T.SENDERS.station, 'warn', 'TO THE LEVER', 'lever-ccgt']);
  assert.equal(card('outage', 'Late return from maintenance: Mt Hazel coal 4 unavailable until 11:30.').button.target, 'lever-coal');
  assert.deepEqual(row(card('outage', 'A unit is out.')), [T.SENDERS.station, 'warn', 'SEE THE STACK', 'stack'], 'no unit named: the stack, and the button says so (Q-42)');
  assert.deepEqual(row(card('smoke')), ['WEATHER BUREAU', 'warn', 'SEE THE STACK', 'map'], 'any other kind as before');
  assert.equal(card('tie').key, 'news:tie:0', 'the key as before: a kind and its start');
});
