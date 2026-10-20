// W7 (Q-119): what par did that you didn't (app/verdict.js parLines, under THE MOMENT; app/par.js parHad). Pure checks on
// moments made from hand-made memories and par records: a fall says par's trip when it was another, par's GUARD with par's
// GUARD tried on your trip, and par's machines running, at most three facts, never a cause; a shed with no trip says par's
// machines, tie, air-con and a GUARD par let go, the most MW first; the thinnest margin only when par's spare was more; a
// rise, a par that did not finish, and a minute where nothing differs say nothing. Then the twin (one replay, a preview per
// GUARD, one more on the kept state at once), par's minute record against the sim's own states, and one sampled play: a
// real trip with your GUARD at 0 against par's 300 MW, and with yours at 100 (SAVE IMAGE still waits for the twin).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as VD from '../app/verdict.js';
import {createParRunner, parHad, unitsOn, PAR_KEY} from '../app/par.js';
import {MOMENT_IMAGE_WAIT} from '../app/endcard.js';
import {V} from '../sim/params.js';
import {createState, step} from '../sim/step.js';
import {previewTrip} from '../sim/physics.js';
import {flexAt} from '../sim/weather.js';
import {runPar} from '../sim/autopilot.js';
import {DESK} from '../content/scenarios.js';
import {unitLabel} from '../desk/util.js';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S, H = 3600, MIN = 60, S = 16 * H + 49 * MIN + 20, K = Math.floor(S / MIN) - 1;   // (a trip at 20:49:20; read at 20:49)
const bit = (...ids) => ids.reduce((a, id) => a | (1 << V.MACHINES.findIndex(x => x.id === id)), 0);
const MINE = bit('coal1', 'coal2', 'coal3', 'ccgt1', 'hydro1');
const cont = (o = {}) => Object.assign({n: 1, startTick: S * TPS + 7, cause: 'unit', id: 'coal2', lostMW: 560, extremeHz: 48.95, uflsStages: 0, backInBandTick: -1,
  caught: {inertiaMW: 300, batteryMW: 20, guardMW: 0, governorsMW: 150, loadReliefMW: 10, uflsMW: 0, inverterMW: 0}}, o);
// your memory: the minute before the trip read as MINE, GUARD 0, importing 200 MW
function memOf(o = {}) {
  const mem = VD.createVerdictMem();
  for (let k = K - 5; k <= K + 5; k++) { mem.on[k] = MINE; mem.guard[k] = 0; mem.tie[k] = 200; mem.r5[k] = 700; mem.L[k] = 650; }
  return Object.assign(mem, o);
}
// par's: the same unless told; a trip on the same machine at the same tick; its minute's lowest 49.62 Hz
const parOf = (had = {}, o = {}) => Object.assign({
  parMinute: () => ({lowHz: 49.62, highHz: 50.04, r5MW: 900}),
  parHad: k => (k === K ? Object.assign({guardMW: 0, on: MINE, tieMW: 200}, had) : null),
  parTrips: [{tick: S * TPS + 7, cause: 'unit', id: 'coal2', mw: 560}], parBlocks: [], blocks: []}, o);
const lines = (m, o) => VD.moment(m.mem || memOf(), m.conts || [cont()], Object.assign({guardMW: 0}, o)).parLines;

test('Q-119: a fall: par\'s GUARD with par\'s GUARD tried on your trip, then par\'s machines running; facts in par\'s favour, never a cause', () => {
  const tried = g => (g === 300 ? {nadirHz: 49.31, uflsStages: 0, black: false} : undefined);
  const o = parOf({guardMW: 300, on: MINE | bit('gtb1', 'gtc2')}, {parTry: tried}), m = VD.moment(memOf(), [cont()], Object.assign({guardMW: 0}, o));
  assert.deepEqual(m.parLines, ['Par had a GUARD of 300 MW. With it on your trip: 49.31 Hz, no relays.',
    'Par had ' + unitLabel('gtb1') + ' and ' + unitLabel('gtc2') + ' running; you didn\'t.']);
  // under par's own line, after what caught yours and your GUARD's line; the what-if is a number of the moment
  assert.deepEqual(m.text.slice(-4), ['Your GUARD was at 0 MW: this was the fall with no GUARD.', 'Par at 20:49: lowest 49.62 Hz, 900 MW spare in 5 min.', ...m.parLines]);
  assert.equal(m.numbers.parGuardHz, 49.31);
  for (const l of m.parLines) assert.ok(/^Par/.test(l) && !/because|should|fail|mistake|you forgot/i.test(l), l);
  // the relays in the preview; the grid black in it
  assert.match(lines({}, parOf({guardMW: 300}, {parTry: () => ({nadirHz: 48.97, uflsStages: 2, black: false})}))[0], /: 48\.97 Hz, and the relays would shed 2 stages\.$/);
  assert.match(lines({}, parOf({guardMW: 300}, {parTry: () => ({nadirHz: 47, uflsStages: 8, black: true})}))[0], /With it on your trip: the grid would go black\.$/);
  // computing: said so, and the moment says it waits (SAVE IMAGE waits only for the fall with no GUARD: none here)
  const w = VD.moment(memOf(), [cont()], Object.assign({guardMW: 0}, parOf({guardMW: 300}, {parTry: () => null})));
  assert.deepEqual([w.parLines[0], w.parPending, w.pending], ['Par had a GUARD of 300 MW. With it on your trip: computing…', true, undefined]);
  // no twin to ask (or it failed): the GUARD as a plain fact; a GUARD par had below yours is not par's doing for a fall
  assert.deepEqual(lines({}, parOf({guardMW: 300})), ['Par had a GUARD of 300 MW; yours was 0.']);
  assert.deepEqual(lines({}, parOf({guardMW: 300}, {parTry: () => ({nadirHz: NaN, uflsStages: 0, black: false})})), ['Par had a GUARD of 300 MW; yours was 0.']);
  assert.deepEqual(VD.moment(memOf(), [cont()], Object.assign({guardMW: 300}, parOf({guardMW: 100}))).parLines, []);
  // your GUARD at the trip is the one the game kept for it, not the minute's
  assert.deepEqual(VD.moment(memOf(), [cont()], Object.assign({guardMW: 300}, parOf({guardMW: 300}))).parLines, []);
});

test('Q-119: a fall: par\'s trip first when it was another machine, none, or the same one 50 MW off; at most three lines; machines only when your fall went deeper', () => {
  const both = {guardMW: 300, on: MINE | bit('gtb1')};
  const other = lines({}, parOf(both, {parTrips: [{tick: S * TPS + 7, cause: 'unit', id: 'coal3', mw: 480}]}));
  assert.deepEqual(other, ['Par\'s trip took ' + unitLabel('coal3') + ' (480 MW); yours took ' + unitLabel('coal2') + ' (560 MW).',
    'Par had a GUARD of 300 MW; yours was 0.', 'Par had ' + unitLabel('gtb1') + ' running; you didn\'t.']);
  assert.equal(lines({}, parOf(both, {parTrips: []}))[0], 'Par had no trip over 50 MW at 20:49.');
  assert.equal(lines({}, parOf({}, {parTrips: [{tick: S * TPS + 7, cause: 'unit', id: 'coal2', mw: 480}]}))[0], 'Par\'s ' + unitLabel('coal2') + ' was at 480 MW when it tripped; yours was at 560.');
  assert.deepEqual(lines({}, parOf({}, {parTrips: [{tick: S * TPS + 7, cause: 'unit', id: 'coal2', mw: 530}]})), [], 'within 50 MW: the same trip');
  // the tie in the game's words, which way it flowed: par's exporting when it tripped (a rise for par) is never a minus sign
  const tie = x => lines({conts: [cont({cause: 'link', id: 'tie', lostMW: 600})]}, parOf({}, {parTrips: [{tick: S * TPS + 7, cause: 'link', id: 'tie', mw: x}]}))[0];
  assert.equal(tie(300), 'Par\'s tie line was importing 300 MW when it tripped; yours was importing 600 MW.');
  assert.equal(tie(-300), 'Par\'s tie line was exporting 300 MW when it tripped; yours was importing 600 MW.');
  const rose = t => lines({}, parOf({}, {parTrips: [Object.assign({tick: S * TPS + 7}, t)]}))[0];
  assert.equal(rose({cause: 'link', id: 'tie', mw: -200}), 'Par\'s trip took the tie line (exporting 200 MW); yours took ' + unitLabel('coal2') + ' (560 MW).');
  assert.equal(rose({cause: 'load', id: 'smelter', mw: -300}), 'Par\'s trip took a smelter potline (300 MW of load); yours took ' + unitLabel('coal2') + ' (560 MW).');
  assert.deepEqual(lines({}, parOf({}, {parTrips: null})), [], 'a par kept before W7 has no trips: nothing said of them');
  // more machines par had, three named and the rest counted
  assert.deepEqual(lines({}, parOf({on: MINE | bit('gta1', 'gtb1', 'gtb2', 'gtc1', 'gtc2')})),
    ['Par had ' + ['gta1', 'gtb1', 'gtb2'].map(unitLabel).join(', ') + ' and 2 more running; you didn\'t.']);
  // a swap is not more plant: par's HYDRO 2 for your HYDRO 1 is nothing; par's GT·B 1 for your HYDRO 1 is 83 MW: not 100
  assert.deepEqual(lines({}, parOf({on: (MINE & ~bit('hydro1')) | bit('hydro2')})), []);
  assert.deepEqual(lines({}, parOf({on: (MINE & ~bit('hydro1')) | bit('gtb1')})), []);
  // your fall no deeper than par's (its minute and the next): par's machines are not said; its GUARD on your trip still is
  const shallow = parOf({guardMW: 300, on: MINE | bit('gtb1')}, {parMinute: s => ({lowHz: s > S + 30 ? 48.9 : 49.7, highHz: 50, r5MW: 900}), parTry: () => ({nadirHz: 49.4, uflsStages: 0, black: false})});
  assert.deepEqual(lines({}, shallow), ['Par had a GUARD of 300 MW. With it on your trip: 49.40 Hz, no relays.']);
  // the relays after a trip are a fall too (the shed's moment is the trip's)
  const sp = {id: 'RED1', by: 'ufls', stage: 1, from: S + 3, to: S + 900, mwh: 30, night: false};
  const relays = VD.moment(memOf({spells: [sp]}), [cont({uflsStages: 1})], Object.assign({guardMW: 0}, parOf({guardMW: 300})));
  assert.deepEqual([relays.kind, relays.parLines], ['shed', ['Par had a GUARD of 300 MW; yours was 0.']]);
});

test('Q-119: a shed with no trip says par\'s machines, tie, air-con cycles and a GUARD par let go, the most MW first, three at most; the thinnest margin only when par had more spare', () => {
  const sp = {id: 'SOL3', by: 'directed', stage: 0, from: S, to: S + 1800, mwh: 90, night: false}, mem = memOf({spells: [sp]});
  mem.guard[K] = 300;
  const ac = {suburb: 'RED', lever: 'aircon', atS: S - 1800, endS: S - 1800 + V.AIRCON_S, effMW: 45, cost: 30}, off = -flexAt([ac], (K + 1) * MIN);
  assert.ok(off > 40, 'the cycle\'s core is under way: ' + off);
  const o = parOf({guardMW: 0, on: MINE | bit('gtc1'), tieMW: 600}, {parBlocks: [ac]});
  const m = VD.moment(mem, [], o);
  assert.deepEqual([m.kind, m.parLines], ['shed', ['Par was importing 600 MW over the tie; you were importing 200 MW.', 'Par had ' + unitLabel('gtc1') + ' running; you didn\'t.',
    'Par had a GUARD of 0 MW; yours was 300.']], 'tie 400, machines 300, GUARD 300 (in that order), air-con ' + Math.round(off) + ': the fourth is left');
  mem.guard[K] = 0;
  assert.deepEqual(VD.moment(mem, [], parOf({}, {parBlocks: [ac]})).parLines, ['Par\'s air-con cycles were taking ' + Math.round(off) + ' MW off demand; you had none running.']);
  assert.deepEqual(VD.moment(mem, [], parOf({}, {parBlocks: [ac], blocks: [Object.assign({}, ac, {effMW: 15})]})).parLines[0],
    'Par\'s air-con cycles were taking ' + Math.round(off) + ' MW off demand; yours ' + Math.round(-flexAt([Object.assign({}, ac, {effMW: 15})], (K + 1) * MIN)) + ' MW.');
  assert.equal(VD.moment(mem, [], parOf({tieMW: 300}, {parBlocks: []})).parLines[0], 'Par was importing 300 MW over the tie; you were importing 200 MW.');
  mem.tie[K] = -120;
  assert.equal(VD.moment(mem, [], parOf({tieMW: 0})).parLines[0], 'Par was not importing over the tie; you were exporting 120 MW.');
  // a GUARD par let go, only while yours held its MW back at the shed: not fired (frequency at or above GUARD_TRIGGER_HZ for
  // GUARD_SUSTAIN_S + GUARD_RAMP_OFF_S before it), or fired before that and spent. A fired GUARD is delivering them; the
  // relays cut below 49 Hz, so frequency crossed the trigger on its way down and the GUARD had fired: never for the relays.
  const held = (by, dipS) => {
    const x = memOf({spells: [Object.assign({}, sp, {by})]});
    x.guard[K] = 300; x.fLo.fill(49.8, S - 900, S + 60);
    if (dipS !== undefined) x.fLo[S - dipS] = V.GUARD_TRIGGER_HZ - 0.01;
    if (by === 'ufls') x.fLo.fill(48.9, S - 4, S + 1);
    return VD.moment(x, [], parOf()).parLines;
  };
  const GUARD = ['Par had a GUARD of 0 MW; yours was 300.'], LIVE_S = V.GUARD_SUSTAIN_S + V.GUARD_RAMP_OFF_S;
  assert.deepEqual([held('directed'), held('directed', 120), held('directed', LIVE_S), held('directed', LIVE_S + 1), held('ufls'), held('ufls', LIVE_S + 60)],
    [GUARD, [], [], GUARD, [], []], 'held back / delivering / still ramping off / spent / the relays');
  // the thinnest margin: par's machines, only when par's spare in 5 min was 50 MW more
  const g = memOf();
  g.r5.fill(5000); g.L.fill(600); g.r5[K] = 700;
  const more = parOf({on: MINE | bit('gtc1')});
  more.parHad = k => (k === K ? {guardMW: 0, on: MINE | bit('gtc1'), tieMW: 200} : null);
  assert.deepEqual(VD.moment(g, [], more).parLines, ['Par had ' + unitLabel('gtc1') + ' running; you didn\'t.']);
  assert.deepEqual(VD.moment(g, [], Object.assign({}, more, {parMinute: () => ({lowHz: 49.9, highHz: 50.1, r5MW: 720})})).parLines, [], 'par\'s spare 20 MW more: nothing to say');
});

test('Q-119: nothing on a rise, when par did not finish or kept no record of the minute, or when nothing differs; three at most', () => {
  const rise = cont({lostMW: -400, extremeHz: 50.6, caught: {inertiaMW: -200, governorsMW: -150}});
  const big = parOf({guardMW: 500, on: MINE | bit('gtb1', 'gtb2'), tieMW: 900}, {parTrips: []});
  const r = VD.moment(memOf(), [rise], Object.assign({guardMW: 0}, big));
  assert.deepEqual([r.parLines, r.text.some(l => /^Par had/.test(l))], [[], false]);
  const none = VD.moment(memOf(), [cont()], {guardMW: 0, parMinute: null, parHad: big.parHad});
  assert.equal(none.parLines, undefined, 'par not finished (no par line): no lines');
  assert.deepEqual(lines({}, parOf({}, {parHad: () => null})), [], 'no record of the minute (a par kept before W7)');
  const unread = memOf();
  unread.on[K] = -1;
  assert.deepEqual(lines({mem: unread}, big), [], 'your minute not recorded');
  assert.deepEqual(lines({}, parOf()), [], 'nothing differs');
  assert.ok(lines({}, big).length <= VD.DIFF_MAX);
});

test('Q-119: the twin replays once and previews each GUARD asked on the pre-trip state, and one asked later at once on the state it kept', () => {
  const g = V.PLAYER_START_TICK + 10, T = V.PLAYER_START_TICK + 20 * MIN * TPS, c = {startTick: T, cause: 'unit', id: 'coal1', lostMW: 500};
  const log = [{tick: g, type: 'guard', args: {mw: 100}}];
  const tw = VD.createTwin(20261007, DESK, log, c, [0, 300]);
  assert.deepEqual([tw.tried(0), tw.tried(300), tw.tried(150), tw.rev], [null, null, undefined, 0], 'computing; 150 not asked');
  tw.step(Infinity);
  const st = createState(20261007, DESK);
  while (st.tick < T) step(st, st.tick === g ? [{type: 'guard', mw: 100}] : []);
  const by = mw => { const x = previewTrip(st, {kind: 'unit', id: 'coal1'}, {guardMW: mw}); return {nadirHz: x.nadirHz, uflsStages: x.uflsStages, black: x.black}; };
  assert.deepEqual([tw.done, tw.tried(0), tw.tried(300), tw.nadirHz, tw.rev], [true, by(0), by(300), by(0).nadirHz, 2]);
  assert.ok(by(300).nadirHz > by(100).nadirHz && by(100).nadirHz > by(0).nadirHz, 'more GUARD, a shallower fall');
  tw.want(150);
  assert.deepEqual([tw.tried(150), tw.rev], [by(150), 3], 'asked later: made at once, on the kept state');
  tw.want(150);
  assert.equal(tw.rev, 3, 'once each');
  // a preview that fails (no such machine) is NaN, said as no number; the day plays on
  const bad = VD.createTwin(20261007, DESK, [], {startTick: V.PLAYER_START_TICK + 60 * TPS, cause: 'unit', id: 'nope', lostMW: 300}, [300]);
  bad.step(Infinity);
  assert.deepEqual([bad.done, Number.isNaN(bad.tried(300).nadirHz)], [true, true]);
});

test('Q-119: par keeps what it had a minute each, as the sim\'s own states say, and its trips and city bookings once it finishes; a par kept before W7 has none', () => {
  const seed = 20261008, until = H * TPS, r = createParRunner(seed, DESK, {});
  while (r.progress * V.DAY_TICKS < until) r.step(3000);
  const want = [];
  runPar(seed, DESK, {untilTick: until, onStep: s => { if (s.tick % (MIN * TPS) === 0) want.push([s.battery.guardMW, unitsOn(s), Math.round(s.tie.flowMW)]); }});
  const got = want.map((x, k) => parHad(r, k)).map(h => [h.guardMW, h.on, h.tieMW]);
  assert.deepEqual(got, want);
  assert.ok(want.some(x => x[1] !== want[0][1]) || want[0][1] > 0, 'machines running');
  assert.deepEqual([parHad(r, -1), parHad(r, 9999), parHad(null, 0)], [null, null, null]);
  // finished (a day that goes black at once): its trips and bookings, kept with it; a kept par from before W7 has none
  const scn = JSON.parse(JSON.stringify(DESK));
  scn.commitment.units = {}; scn.commitment.tieMW = 0;
  const box = {}, st = {read: k => (k in box ? JSON.parse(box[k]) : null), write: (k, v) => { box[k] = JSON.stringify(v); }}, b = createParRunner(7, scn, {storage: st});
  b.step(3000);
  assert.deepEqual([b.done, b.trips, b.blocks, st.read(PAR_KEY).trips, st.read(PAR_KEY).blocks], [true, [], [], [], []]);
  const old = Object.assign({}, st.read(PAR_KEY));
  delete old.had; delete old.trips; delete old.blocks;
  const k = createParRunner(7, DESK, {storage: {read: () => old, write() {}}});
  assert.deepEqual([k.done, k.had, k.trips, k.blocks, parHad(k, 0)], [true, [], null, null, null]);
});

// One sampled play: a trip just after the desk is taken, the day's end, a par that had GUARD (and a machine) at that minute
function play(guard, parGuard, extra = 0) {
  const p = openGame({seed: 20261007, par: {}}), st = p.game.state;
  if (guard) p.send({type: 'guard', mw: guard});
  injectTrip(st, 30 * 60 + 90);
  assert.equal(p.until('trip', {max: '+10m', line: 'near'}).why, 'trip');
  p.until('card', {max: '+5m', line: 'near'});
  p.key('Enter');
  p.to('+5m', {stop: [], line: 'near'});
  st.over = true;
  // par: you, but with parGuard (and the machines in extra) at every minute; its trip yours
  const mem = p.game.verdict, n = V.DAY_S / MIN, par = p.game.par, c = st.conts[0], minutes = [], had = [];
  for (let k = 0; k < n; k++) { minutes.push(49.99, 50.01, 2000); had.push(parGuard, (mem.on[k] >= 0 ? mem.on[k] : 0) | extra, Math.round(mem.tie[k] || 0)); }
  Object.assign(par, {score: JSON.parse(JSON.stringify(st.score)), minutes, had, trips: [{tick: c.startTick, cause: c.cause, id: c.id, mw: Math.round(c.lostMW)}], blocks: []});
  p.frames(1);
  return p;
}
const momentText = p => p.$('end-moment').children.filter(x => x.tagName === 'P').map(x => x.textContent);

test('Q-119 on the page: your GUARD at 0, par\'s at 300 MW: par\'s GUARD on your trip computes after the day, then is said; SAVE IMAGE does not wait for it', () => {
  const p = play(0, 300), g = p.game, mem = g.verdict, k = VD.diffMinute(g.end.verdict.moment);
  assert.deepEqual([mem.guard[k], mem.on[k] > 0, Number.isFinite(mem.tie[k])], [0, true, true], 'your minute recorded: ' + [mem.guard[k], mem.on[k], mem.tie[k]]);
  assert.ok(g.twin && !g.twin.done && g.twin.tried(300) === null && g.twin.tried(0) === undefined, 'a twin for par\'s GUARD only');
  assert.ok(momentText(p).includes('Par had a GUARD of 300 MW. With it on your trip: computing…'), JSON.stringify(momentText(p)));
  const b = p.$('btn-save-moment');
  assert.deepEqual([b.disabled, b.textContent], [false, 'SAVE IMAGE'], 'the picture has no par\'s GUARD: it does not wait');
  g.twin.step(Infinity);
  p.frames(1);
  const line = momentText(p).find(l => /^Par had a GUARD/.test(l)), hz = Number(/: (\d\d\.\d\d) Hz/.exec(line || '')[1]);
  assert.match(line, /^Par had a GUARD of 300 MW\. With it on your trip: \d\d\.\d\d Hz, (no relays|and the relays would shed \d stages?)\.$/);
  assert.ok(hz > g.end.verdict.moment.cont.extremeHz, 'with par\'s GUARD the fall is shallower: ' + hz + ' > ' + g.end.verdict.moment.cont.extremeHz);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-119 on the page: your GUARD at 100, par\'s at 300 and a machine more: one twin for both previews, and SAVE IMAGE waits for it as before', () => {
  const p = play(100, 300, bit('gtc2')), g = p.game;
  assert.ok(g.twin && g.twin.tried(0) === null && g.twin.tried(300) === null, 'one twin, both asked');
  const w = p.$('btn-save-moment'), t0 = momentText(p);
  assert.deepEqual([w.disabled, w.textContent], [true, MOMENT_IMAGE_WAIT], 'SAVE IMAGE waits for the fall with no GUARD');
  assert.ok(t0.includes('With no GUARD: computing…') && t0.includes('Par had a GUARD of 300 MW. With it on your trip: computing…'), JSON.stringify(t0));
  g.twin.step(Infinity);
  p.frames(1);
  const t = momentText(p), b = p.$('btn-save-moment');
  assert.deepEqual([b.disabled, b.textContent], [false, 'SAVE IMAGE']);
  assert.ok(t.some(l => /^With no GUARD \(100 MW held back\): \d\d\.\d\d Hz\.$/.test(l)) && t.some(l => /^Par had a GUARD of 300 MW\. With it on your trip: \d\d\.\d\d Hz/.test(l)), JSON.stringify(t));
  assert.ok(t.includes('Par had ' + unitLabel('gtc2') + ' running; you didn\'t.'), JSON.stringify(t));
  assert.ok(t.filter(l => /^Par(?! at)/.test(l)).length <= VD.DIFF_MAX);
  assert.deepEqual(p.h.mods.errors, []);
});
