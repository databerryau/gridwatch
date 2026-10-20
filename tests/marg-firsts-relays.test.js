// W7 (Q-124 review): Marg's relays line at a daily's own first relay shed, not an injected one. DESK 20261016, a first shift
// with its cards answered as Enter would: the city has been shedding by direction since the afternoon, and at 17:10 the
// relays shed their first districts on their own. Warnings fill the tray (the city desk's sheds); her line used to wait
// behind them for two and a half grid hours, past the next trip, and then counted both. Now it takes the place of the city
// desk's oldest warning at once, beside the relays' own card. One jump in a before() hook, sampled (tests/lib/play.js
// skipTo with a stop, CLAUDE.md): the hours to 17:10 are skipped.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {firstsNow, MARG_FROM} from '../app/marg.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S, S = {};

before(() => {
  const p = S.p = openGame({seed: 20261016});
  // to the first grid second the relays have shed today (a card that holds the clock answered as Enter would)
  for (let n = 0; n < 60; n++) {
    const r = p.skipTo('21:00', {stop: ({state, game}) => firstsNow(state, game.verdict).includes('relays')});
    if (r.why.startsWith('held')) { p.key('Enter'); continue; }
    assert.equal(r.why, 'pred', 'no relay shed before 21:00');
    break;
  }
  S.at = Math.floor(p.game.state.tick / TPS);
  // her line, if this frame did not say it: on until it is said, or a grid minute
  if (!p.game.marg.beats['first:relays']) p.skipTo('+60s', {stop: ({game}) => !!game.marg.beats['first:relays']});
});

test('Q-124 review: a daily\'s natural first relay shed: Marg says it within a grid minute, beside the relays\' own card, the shed\'s count true', () => {
  const p = S.p, g = p.game, line = g.marg.said.find(l => l.key === 'first:relays');
  assert.ok(S.at > 13 * 3600 && S.at < 13.25 * 3600, 'the relays\' first shed is 17:10 on this day: ' + S.at);
  assert.ok(line, 'said within a grid minute of the shed');
  assert.ok(line.atS - S.at <= 60, (line.atS - S.at) + ' grid s after');
  const ufls = new Set(g.verdict.spells.filter(x => x.by === 'ufls').map(x => x.id));
  assert.equal(line.text, 'The relays shed ' + ufls.size + ' districts on their own: frequency fell below 49 Hz. Last net before a blackout.');
  // on the tray beside the relays' own warning; the city desk's older warning that gave way is in the LOG
  const tray = g.tray.cards;
  assert.ok(tray.some(c => c.from === MARG_FROM && c.text === line.text), 'her card on the tray');
  assert.ok(tray.some(c => c.sev === 'warn' && /^Relays shed /.test(c.text)), 'the relays\' own card still shows');
  assert.ok(g.tray.log.some(c => c.from === 'CITY DESK' && c.atS < S.at), 'an older shed\'s warning went to the LOG');
  assert.match(p.look({controls: false}), /^TRAY .*! CITY DESK 17:10 Relays shed .* \|\| i MARG, SUPERVISOR 17:10 The relays shed /m);
});
