// W7 (Q-124): Marg's three first-time lines (app/marg.js MARG_FIRSTS, app/game.js margFrame), in place of O-4's concept cards
// and O-5's "why?": a price below zero, coal held at its minimum while solar spills, and the relays' first shed. Each is
// said the first time this browser's player meets the thing, true of that moment, at most 20 words with a live number, in
// the tray only (no hold); it keeps room for the fixed beats still to come, so on a later day one can speak and the rest
// wait for another day. Pure checks first, then the page at the relays' first shed (the price and coal lines' first moments
// are tests/marg-firsts-day.test.js's, a day of their own).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarg, margSay, beatsAhead, firstsNow, MARG_LINES, MARG_WORDS, MARG_FIRST, MARG_LATER, MARG_FIRSTS, AT_MIN_MW, MARG_FROM} from '../app/marg.js';
import * as G from '../app/game.js';
import {V} from '../sim/params.js';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';

const words = t => t.trim().split(/\s+/).length;
const TPS = V.TICKS_PER_S, H = 3600, coal = V.MACHINES.find(m => m.id === 'coal1');
// an obs with what the lines read: a coal unit at its minimum (AGC: its start counts the auto-synchroniser), solar spilling
function obsAt(s, o = {}) {
  return Object.assign({s, price: {mwh: -20}, solar: {availMW: 900, outMW: 742},
    units: [{id: 'coal1', cls: 'coal', mode: 'on', schedMW: coal.minMW, minMW: coal.minMW, startToMinS: coal.t1S + V.AUTO_SYNC_S + coal.t2S}]}, o);
}
// the verdict's memory of dark spells (app/verdict.js): RED1 shed twice by the relays, SAL1 once, one directed shed
const spell = (id, by) => ({id, by, stage: 1, from: 0, to: -1, mwh: 1, night: false});
const MEM = {spells: [spell('RED1', 'ufls'), spell('SAL1', 'ufls'), spell('HAZ2', 'directed'), spell('RED1', 'ufls')]};
// a day-ahead forecast whose peak is at 18:30 (14.5 h after 04:00)
const fc = {fromS: 0, stepS: 900, n: 96, demandP50: Array.from({length: 96}, (_, k) => 5000 - Math.abs(k + 1 - 58) * 20)};

test('Q-124: the three lines say what is true now, with its number, in at most 20 words', () => {
  const price = MARG_LINES.price(obsAt(7 * H));
  assert.equal(price, 'Price below zero: −$20/MWh. More power than the city can use, so generators pay to run. Store what you can.');
  assert.match(MARG_LINES.price(obsAt(7 * H, {price: {mwh: -1000}})), /^Price below zero: −\$1,000\/MWh\./, 'the floor');
  // coal: stopped at 11:00 it would shut down (70 min), sit out 8 h and start (50 min + the auto-synchroniser's 4): 21:04, past the 18:30 peak
  assert.equal(MARG_LINES.coal(obsAt(7 * H), fc), 'Coal\'s at its minimum: lower, it won\'t burn steady. Solar spills 160 MW. Stopped, coal\'s out past the evening.');
  // at 07:00 it would be back at 17:04, before the peak: the hours instead (whole hours: at least that long)
  assert.match(MARG_LINES.coal(obsAt(3 * H), fc), /Stopped, coal's out 10 hours\.$/);
  assert.match(MARG_LINES.coal(obsAt(3 * H), null), /out 10 hours\.$/, 'no day-ahead: 21:00 bounds the evening');
  assert.equal(MARG_LINES.coal(obsAt(7 * H, {units: [Object.assign({}, obsAt(0).units[0], {schedMW: coal.minMW + 5})]}), fc), '', 'not at its minimum: nothing');
  // the relays: the districts they shed today, each once (the line can wait for the tray: what they did stays true)
  assert.equal(MARG_LINES.relays(obsAt(13 * H), fc, MEM), 'The relays shed 2 districts on their own: frequency fell below 49 Hz. Last net before a blackout.');
  assert.match(MARG_LINES.relays(obsAt(13 * H), fc, {spells: [spell('RED1', 'ufls')]}), /^The relays shed 1 district on their own:/);
  assert.equal(MARG_LINES.relays(obsAt(13 * H), fc, {spells: [spell('HAZ2', 'directed')]}), '', 'the city desk\'s shed is not the relays');
  for (const t of [price, MARG_LINES.coal(obsAt(7 * H), fc), MARG_LINES.coal(obsAt(3 * H), fc), MARG_LINES.relays(obsAt(13 * H), fc, MEM)]) {
    assert.ok(words(t) <= MARG_WORDS && /\d/.test(t), words(t) + ' words: ' + t);
  }
});

// a sim state with what firstsNow reads
function stateOf(o = {}) {
  return Object.assign({price: {mwh: 12}, env: {solarAvailMW: 900}, ren: {solarMW: 900}, city: {districts: [{dark: false, shedBy: null}]},
    units: V.MACHINES.map(m => ({k: m.k, mode: m.station === 'coal' ? 'on' : 'off', schedMW: m.station === 'coal' ? m.minMW + 100 : 0}))}, o);
}

test('Q-124: when each is true: the relays have shed today; a price below zero to the dollar; solar spilled past MIN GEN\'s floor with a coal unit at its minimum', () => {
  assert.deepEqual(firstsNow(stateOf()), []);
  assert.deepEqual(firstsNow(stateOf(), {spells: []}), []);
  assert.deepEqual(firstsNow(stateOf({price: {mwh: -0.4}})), [], 'shown as $0: not below zero');
  assert.deepEqual(firstsNow(stateOf({price: {mwh: -0.6}})), ['price']);
  assert.deepEqual(firstsNow(stateOf(), {spells: [spell('HAZ2', 'directed')]}), [], 'the city desk\'s shed is not the relays');
  assert.deepEqual(firstsNow(stateOf(), {spells: [Object.assign(spell('RED1', 'ufls'), {to: 99})]}), ['relays'], 'relit since: they still shed it today');
  const atMin = stateOf().units.map(u => (V.MACHINES[u.k].id === 'coal3' ? Object.assign({}, u, {schedMW: V.MACHINES[u.k].minMW + AT_MIN_MW}) : u));
  assert.deepEqual(firstsNow(stateOf({units: atMin})), [], 'at its minimum, nothing spilled');
  assert.deepEqual(firstsNow(stateOf({units: atMin, ren: {solarMW: 900 - V.SURPLUS_MIN_MW}})), [], 'spill at MIN GEN\'s floor is not spill');
  assert.deepEqual(firstsNow(stateOf({units: atMin, ren: {solarMW: 800}, price: {mwh: -20}}), MEM), ['relays', 'price', 'coal']);
  assert.deepEqual([...MARG_FIRSTS], ['relays', 'price', 'coal']);
});

test('Q-124: a first-time line keeps room for the fixed beats to come: on a later day one speaks, the next waits; nothing fixed is lost', () => {
  // a later day: the briefing's line said; act2, act3, the handover and the verdict to come
  const m = createMarg(false);
  margSay(m, 'take', 'Morning.', 1800);
  assert.equal(beatsAhead(m, 1, false), 4);
  assert.ok(margSay(m, 'first:price', 'one', 2000, 'stack', beatsAhead(m, 1, false)));
  assert.equal(margSay(m, 'first:coal', 'two', 2100, 'stack', beatsAhead(m, 1, false)), null, 'the second waits');
  assert.equal(m.beats['first:coal'], undefined, 'and is not marked said: another day says it');
  for (const k of ['act2', 'act3', 'handover', 'verdict']) assert.ok(margSay(m, k, k, 3000), k + ' still speaks');
  assert.equal(m.said.length, MARG_LATER);
  // act2 and act3 are reserved only before their act; the handover and the verdict until said
  assert.equal(beatsAhead(createMarg(false), 3, false), 2);
  // a first shift reserves the watch's settle too, and has room for all three
  const f = createMarg(true);
  assert.equal(beatsAhead(f, 1, false), 5);
  for (const k of MARG_FIRSTS) assert.ok(margSay(f, 'first:' + k, k, 0, 'stack', beatsAhead(f, 1, false)));
  assert.ok(MARG_FIRST - f.said.length >= beatsAhead(f, 1, false) + 9, 'room for the fixed beats and the nine plates\' asks');
});

// a game as margFirsts reads it
function gameOf(o = {}) {
  const st = stateOf(Object.assign({price: {mwh: -20}, over: false, control: {nightShift: false}}, o.state));
  return Object.assign({marg: createMarg(o.first !== false), phase: 'play', state: st, director: {seen: {marg: o.seen || {}}}, margAct: 2, margWatched: true,
    tray: {cards: o.cards || []}, verdict: {spells: []}}, o.game);
}
const card = sev => ({sev});

test('Q-124: margFirsts (the page\'s and the driver\'s test): not once seen, not twice a day, never in a watch or at night, nor without room', () => {
  assert.deepEqual(G.margFirsts(gameOf(), 'CRUISE'), ['price']);
  assert.deepEqual(G.margFirsts(gameOf({seen: {price: true}}), 'CRUISE'), [], 'met in this browser before');
  const g = gameOf();
  g.marg.beats['first:price'] = true;
  assert.deepEqual(G.margFirsts(g, 'CRUISE'), [], 'said today');
  assert.deepEqual(G.margFirsts(gameOf(), 'WATCH'), [], 'never in a watch');
  assert.deepEqual(G.margFirsts(gameOf(), 'SHED-WATCH'), []);
  assert.deepEqual(G.margFirsts(gameOf({state: {control: {nightShift: true}}}), 'NIGHT'), [], 'the night shift has the desk');
  assert.deepEqual(G.margFirsts(gameOf({game: {phase: 'briefing'}}), 'CRUISE'), []);
  assert.deepEqual(G.margFirsts(gameOf({cards: [card('warn'), card('warn'), card('warn')]}), 'CRUISE'), [], 'three warnings showing: her card would go to the LOG at once');
  assert.deepEqual(G.margFirsts(gameOf({cards: [card('warn'), card('warn'), card('info')]}), 'CRUISE'), ['price'], 'an information card gives way to hers');
  const full = gameOf({first: false, game: {margAct: 1}});
  for (const k of ['take', 'x']) margSay(full.marg, k, k, 0);
  assert.deepEqual(G.margFirsts(full, 'CRUISE'), [], 'a later day with its one free line used');
});

test('Q-124 review: one lesson never sends another to the LOG: with the tray full, hers waits while the card that would give way is a lesson', () => {
  // the price's line said (a first shift), and now coal at its minimum with solar spilling too
  const atMin = stateOf().units.map(u => (V.MACHINES[u.k].id === 'coal3' ? Object.assign({}, u, {schedMW: V.MACHINES[u.k].minMW}) : u));
  const withPrice = cards => {
    const g = gameOf({cards, state: {units: atMin, ren: {solarMW: 800}}});
    margSay(g.marg, 'first:price', MARG_LINES.price(obsAt(7 * H)), 2000, 'stack');
    return g;
  };
  const lesson = {sev: 'info', from: MARG_FROM, text: MARG_LINES.price(obsAt(7 * H))}, other = {sev: 'info', from: 'STATION', text: 'Mt Hazel coal 2: START.'};
  assert.deepEqual(G.margFirsts(withPrice([card('warn'), card('warn'), lesson]), 'CRUISE'), [], 'the price\'s card would give way: coal waits');
  assert.deepEqual(G.margFirsts(withPrice([card('warn'), lesson]), 'CRUISE'), ['coal'], 'a free place: both show');
  assert.deepEqual(G.margFirsts(withPrice([other, card('warn'), lesson]), 'CRUISE'), ['coal'], 'an older information card gives way instead');
  assert.deepEqual(G.margFirsts(withPrice([card('warn'), card('warn'), Object.assign({}, lesson, {from: 'STATION'})]), 'CRUISE'), ['coal'], 'only her own card is a lesson');
});

test('Q-124 review: with warnings filling the tray, the relays\' line takes the place of the city desk\'s oldest warning (a shed); the others wait', () => {
  const city = {sev: 'warn', from: 'CITY DESK', text: 'Relays shed RED1 and SAL1 (UFLS stage 1, 431 MW). Restore when the permissive allows.'};
  const market = {sev: 'warn', from: 'MARKET NOTICE', text: 'Load is off supply: the system is SHEDDING.'};
  const relays = cards => G.margFirsts(gameOf({cards, game: {verdict: MEM}}), 'CRUISE');
  assert.deepEqual(relays([market, city, city]), ['relays'], 'a shed\'s warning gives way to hers');
  assert.deepEqual(relays([market, market, market]), [], 'no shed on the tray: it waits');
  assert.deepEqual(G.margFirsts(gameOf({cards: [city, city, city]}), 'CRUISE'), [], 'the price\'s line does not take a shed\'s place');
});

test('Q-124 on the page: the first relay shed is said as its watch ends, in the place of a shed\'s warning when warnings fill the tray, with the districts the relays shed; with storage blocked the page remembers', () => {
  // DESK 20261016, a first shift with storage blocked; the two coal units on line trip a second apart at 04:31 (a double
  // trip, as Callide C's in 2021): too much for spin, the battery and the governors in the small hours, so the relays shed
  const p = openGame({seed: 20261016}), st = p.game.state, said = () => p.game.marg.said.filter(l => l.key === 'first:relays');
  injectTrip(st, Math.floor(st.tick / TPS) + 60);
  injectTrip(st, Math.floor(st.tick / TPS) + 61);
  assert.equal(p.until('trip', {max: '+5m'}).why, 'trip');
  // the relays have shed, inside the watch: she waits (no voice over the watch)
  assert.equal(p.skipTo('+5m', {stop: ({state, game}) => firstsNow(state, game.verdict).includes('relays')}).why, 'pred');
  assert.equal(p.h.vm().mode.mode, 'WATCH');
  assert.deepEqual(said(), [], 'not over the watch');
  const sheds = p.game.tray.cards.filter(c => c.sev === 'warn' && c.from === 'CITY DESK').map(c => c.id);
  assert.ok(sheds.length, 'the relays\' own warnings on the tray');
  // the watch ends at its RESPOND card, three warnings on the tray (the relays' and the market's SHEDDING). Hers would go
  // straight to the LOG, so it takes the place of the city desk's oldest warning, a shed it says again in words
  assert.equal(p.skipTo('+5m').why, 'held:RESPOND-CARD');
  const line = said()[0], shed = p.h.vm().obs.districts.filter(d => d.dark && d.shedBy === 'ufls').length;   // (all the relays shed, as the card says)
  assert.ok(line, 'said at the RESPOND card');
  assert.ok(st.tick >= st.conts[0].watchEndTick && line.atS === Math.floor(st.tick / TPS), 'as the watch ends: ' + line.atS + ', ' + st.conts[0].watchEndTick / TPS);
  assert.match(p.look({controls: false}), new RegExp('^CARD .*SHEDDING: ' + shed + ' districts dark', 'm'));
  assert.equal(line.text, 'The relays shed ' + shed + ' districts on their own: frequency fell below 49 Hz. Last net before a blackout.');
  assert.ok(shed >= 2 && st.score.minHz < V.UFLS_FIRST_HZ, 'true: frequency fell below ' + V.UFLS_FIRST_HZ + ' Hz (' + st.score.minHz.toFixed(2) + ')');
  const tray = p.game.tray.cards, gone = sheds.filter(id => !tray.some(c => c.id === id));
  assert.equal(tray.length, 3);
  assert.equal(tray.filter(c => c.sev === 'warn').length, 2);
  assert.ok(gone.length && gone.every(id => p.game.tray.log.some(c => c.id === id)), 'the shed\'s warning she replaced is in the LOG');
  assert.match(p.look({controls: false}), /^TRAY .*i MARG, SUPERVISOR \d\d:\d\d The relays shed \d+ districts on their own: /m, 'on the tray, not the LOG');
  // storage blocked: the page's memory (the next day in this page does not say it again), and once today
  assert.deepEqual(p.game.director.seen.marg, {relays: true});
  p.key('Enter');
  p.realJump(2);
  assert.equal(said().length, 1, 'once');
});
