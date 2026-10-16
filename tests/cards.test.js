// W6, D-24: the THIS REALLY HAPPENED cards (content/cards.js) and their triggers (app/verdict.js historyCard, with the
// memory verdictSecond keeps for them, `seen`). Pure checks on the cards and on hand-made memories; then the memory on a
// real state (createState and the sim's own inputs, no day played): what the player's day saw is kept, the night shift's
// is not. (tests/verdict.test.js keeps W3's first check of the five cards it began with.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as VD from '../app/verdict.js';
import {CARDS} from '../content/cards.js';
import {V} from '../sim/params.js';
import {createState, step, applyInput} from '../sim/step.js';
import {prerollRegime} from '../sim/weather.js';
import {setDistrictDark, tripTie} from '../sim/fleet.js';
import {DESK} from '../content/scenarios.js';

const TPS = V.TICKS_PER_S, H = 3600, MIN = 60;
const words = s => s.trim().split(/\s+/).length;
const memOf = (seen = {}) => Object.assign(VD.createVerdictMem(), {seen});
const trip = (o = {}) => Object.assign({n: 1, startTick: 15 * H * TPS, cause: 'unit', id: 'ccgt1', lostMW: 620, extremeHz: 49.1, uflsStages: 0,
  caught: {inertiaMW: 300, batteryMW: 90, guardMW: 0, governorsMW: 150, loadReliefMW: 10, uflsMW: 0, inverterMW: 0}}, o);
const spilled = mem => { mem.spill[600] = VD.BACKSTOP_MWH + 50; return mem; };
const negative = mem => { mem.price.fill(-20, 300, 300 + VD.NEGATIVE_MIN); return mem; };
const HOSTS = {'www.aemo.com.au': 'AEMO', 'wattclarity.com': 'WattClarity', 'wattclarity.com.au': 'WattClarity'};

test('D-24: every card is well formed: a trigger, its year, at most 40 words (and the simplification 26), no quotation, a source AEMO or WattClarity publishes', () => {
  const ids = new Set();
  for (const c of CARDS) {
    assert.ok(Object.isFrozen(c) && /^[a-z]+$/.test(c.id) && !ids.has(c.id), c.id);
    ids.add(c.id);
    assert.match(c.trigger, /^[a-z][a-z ]+[a-z]$/, c.id + ': the trigger is a short phrase in words');
    assert.ok(words(c.trigger) <= 6, c.id);
    assert.match(c.text, /\b(19|20)\d\d\b/, c.id + ': the text names when it happened');
    assert.ok(c.text.length > 40 && words(c.text) <= 40, c.id + ': ' + words(c.text) + ' words');
    assert.ok(c.simplifies.length > 20 && words(c.simplifies) <= 26, c.id + ': ' + words(c.simplifies) + ' words');
    for (const s of [c.text, c.simplifies]) {
      assert.match(s, /^[A-Z].*\.$/, c.id + ': a sentence');
      assert.ok(!/["“”—]|\s{2}/.test(s), c.id + ': no quotation, no em dash, no double space');
    }
    const u = new URL(c.source);
    assert.equal(u.protocol, 'https:', c.id);
    assert.equal(HOSTS[u.hostname], c.sourceName, c.id + ': ' + u.hostname);
  }
});

test('D-24: each card shows on a day that fits it, the rarest and most dramatic first (the day\'s own before the battery\'s)', () => {
  // [card, memory, the player's trips, black]: each day also fires every trigger after its own, so the order is tested too
  const days = [
    ['black', spilled(memOf({directed: true, tie: true})), [trip({uflsStages: 2})], true],
    ['ufls', memOf({directed: true, tie: true, rert: true}), [trip({uflsStages: 1})], false],
    ['directed', memOf({directed: true, tie: true, rert: true, heat: true}), [trip()], false],
    ['islanded', memOf({tie: true, rert: true, heat: true}), [trip({cause: 'link', id: 'tie', lostMW: 300})], false],
    ['rert', memOf({rert: true, heat: true}), [trip()], false],
    ['heat', negative(memOf({heat: true})), [trip()], false],
    ['drought', negative(spilled(memOf({drought: true}))), [trip()], false],
    ['battery', negative(spilled(memOf())), [trip()], false],
    ['backstop', negative(spilled(memOf())), [trip({caught: {batteryMW: 20}})], false],
    ['negative', negative(memOf()), [], false],
  ];
  assert.deepEqual(days.map(d => d[0]), CARDS.map(c => c.id), 'every card has a day, in the cards\' order');
  for (const [id, mem, conts, black] of days) assert.equal(VD.historyCard(mem, conts, black).id, id);
  // and each on its own
  for (const k of ['directed', 'tie', 'rert', 'heat', 'drought']) assert.equal(VD.historyCard(memOf({[k]: true}), [], false).id, k === 'tie' ? 'islanded' : k);
  // a tie trip with no flow makes no contingency: the tie card still shows (seen.tie), the battery's does not
  assert.equal(VD.historyCard(memOf({tie: true}), [], false).id, 'islanded');
  assert.equal(VD.historyCard(memOf(), [trip({caught: {batteryMW: 20}})], false), null, 'a small catch on a plain day: no card');
});

test('D-24: the memory keeps what the player\'s day saw (a shed by the city desk, the tie out, the diesel called, a heatwave or a drought from its onset), never the night shift\'s', () => {
  const seedOf = cls => { let seed = 1; while (prerollRegime(seed, DESK).cls !== cls) seed++; return seed; };
  const day = night => {
    const st = createState(seedOf('heat'), DESK), mem = VD.createVerdictMem();
    while (!st.news.some(n => n.kind === 'heat')) step(st);   // (the heat's news is at 04:00, its onset from 12:30)
    st.control.nightShift = night;
    const onS = st.news.find(n => n.kind === 'heat').fromS;
    const minute = s => { st.tick = (s + 1) * TPS; VD.verdictSecond(mem, st, null); };   // (the grid second s just ended; s + 1 a minute mark)
    minute(onS - 1);
    const before = {...mem.seen};
    minute(onS + MIN - 1);
    const heat = !!mem.seen.heat;
    st.tie.flowMW = 0;   // (the player had the tie at 0 MW)
    tripTie(st, 'storm', 90 * MIN, []);
    assert.ok(st.tie.tripped && st.conts.length === 0, 'the tie tripped at no flow: no contingency');
    const out = [];
    assert.ok(applyInput(st, {type: 'armRERT'}, out).ok && applyInput(st, {type: 'standDownRERT'}, out).ok, 'armed, then stood down before it came');
    setDistrictDark(st, st.city.districts.findIndex(x => x.rot >= 0 && !x.dark), true, 'directed');
    minute(onS + 2 * MIN - 1);
    return {before, heat, after: mem.seen};
  };
  const you = day(false);
  assert.deepEqual(you.before, {}, 'nothing before the onset');
  assert.ok(you.heat, 'the heatwave from its onset');
  assert.deepEqual(you.after, {heat: true, tie: true, rert: true, directed: true});
  assert.deepEqual(day(true).after, {}, 'the night shift\'s are not the player\'s');
  // a wind drought from its onset, as the sim's news gives it (its warning, sim/events.js announce: {atS, kind, fromS, toS, text})
  const st = createState(seedOf('drought'), DESK), mem = VD.createVerdictMem(), onS = 12 * H;
  st.news.push({atS: onS - H, kind: 'drought', fromS: onS, toS: null, text: 'Wind drought from about 16:00'});
  for (const s of [onS - 1, onS + MIN - 1]) { st.tick = (s + 1) * TPS; VD.verdictSecond(mem, st, null); if (s < onS) assert.deepEqual(mem.seen, {}); }
  assert.deepEqual(mem.seen, {drought: true});
});
