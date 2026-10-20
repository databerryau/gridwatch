// W7, Q-115 (decisions brief §5, option A): the player's restore close plays FOCUS (1x) until frequency is back in the
// normal band (at least RESTORE_FOCUS_S, at most RESTORE_FOCUS_MAX_S grid s), then one caption in the tray, so the
// cold-load dip's recovery is seen and not only its fall; and the K-12 scope offer is a HAND day's only: on an AGC day
// nothing is offered, and START on a unit at full speed still opens its scope. The rule on a fake state (the director
// alone), then the page through the play driver, sampled (CLAUDE.md): a real hand-back's dip, and an AGC morning's START.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import * as fleet from '../sim/fleet.js';
import * as D from '../app/director.js';
import * as G from '../app/game.js';
import * as T from '../app/tray.js';
import {openGame} from './lib/play.js';

const TPS = V.TICKS_PER_S, H = 3600, LO = V.NORMAL_LO_HZ;

// A fake state: only what the director reads (11:00, MIDDAY SOLAR's 300x), with the sim's last whole second (state.last)
const fake = () => ({tick: 7 * H * TPS, over: false, contIdx: -1, conts: [], scope: {unit: ''}, units: [], phys: {fHz: 50},
  last: {fMinHz: 50, fMaxHz: 50}, control: {handFlown: false, mode: 'AGC', nightShift: false}, scn: {night: true}, city: {districts: []}});

// A close at 11:00 with frequency f(s) (grid s after it), tick by tick as app/game.js tickOnce runs it (and state.last
// as the sim's step settles each second, at its first tick): the FOCUS's grid s, its end, its caption ('' when none)
function close(f, mw = 243.4, poke = null) {
  const st = fake(), d = D.createDirector({game: true, paused: false, seen: {watch: true}}), t0 = st.tick, fs = [];
  const hz = t => (t <= t0 ? 50 : f((t - t0) / TPS));
  D.focusRestore(d, st, mw, 'HAR4');
  let focus = 0, caption = '', endTick = -1;
  for (let k = 1; k <= 10 * TPS && endTick < 0; k++) {
    assert.deepEqual([D.modeOf(d, st).mode, D.rateOf(d, st)], ['FOCUS', 1], 'FOCUS plays 1x to its end');
    focus++;
    if (st.tick % TPS === 0) { for (let j = st.tick - TPS; j < st.tick; j++) fs.push(hz(j)); st.last = {fMinHz: Math.min(...fs), fMaxHz: Math.max(...fs)}; fs.length = 0; }
    st.tick++; st.phys.fHz = hz(st.tick);
    if (poke) poke(st, t0);
    const rf = D.restoreFocusTick(d, st);
    if (rf) caption = D.restoreCaption(rf);
    if (d.rfs[0].end >= 0) endTick = d.rfs[0].end;
  }
  return {focusS: focus / TPS, endS: (endTick - t0) / TPS, caption, after: D.modeOf(d, st).mode, rf: d.rfs[0]};
}

test('Q-115: a restore\'s FOCUS holds until frequency is back in the normal band, 2 grid s at the least and 6 at the most, then one caption with the pickup and the seconds as they happened', () => {
  assert.deepEqual([D.RESTORE_FOCUS_S, D.RESTORE_FOCUS_MAX_S, D.FOCUS_RATE], [2, 6, 1]);
  // in band all along: the shortest FOCUS, and no "back" (it never left)
  let r = close(() => 50.02);
  assert.deepEqual([r.focusS, r.endS, r.after, r.caption], [2, 2, 'CRUISE', 'Cold load picked up: 243 MW, frequency stayed in band.']);
  // the cold-load dip (the morning's: out at 0.6 s, its nadir, back at 3.3 s): FOCUS until a whole grid second has been
  // in band (the sim's own "back in band", a contingency's backInBandTick: here 11:00:04-05, read on 11:00:05's first tick)
  const dip = back => s => (s < 0.6 ? 49.9 : s < back ? 49.75 : 49.88);
  r = close(dip(3.3));
  assert.deepEqual([r.focusS, r.endS, r.after, r.caption], [5.02, 5.02, 'CRUISE', 'Cold load picked up: 243 MW, back in band in 3 s.']);
  assert.deepEqual([r.rf.out, (r.rf.back - r.rf.tick) / TPS, r.rf.quiet], [true, 3.3, false]);
  // back at 4.3 s: its whole second would come after the cap; 6 grid s, and the caption says when it was back
  r = close(dip(4.3));
  assert.deepEqual([r.focusS, r.caption], [6, 'Cold load picked up: 243 MW, back in band in 4 s.']);
  // still out at the cap (an evening's slow recovery): 6 grid s, said so
  r = close(s => (s < 0.3 ? 50 : 49.7), 1234.4);
  assert.deepEqual([r.focusS, r.after, r.caption], [6, 'CRUISE', 'Cold load picked up: 1,234 MW, still out of band after 6 s.']);
  // a blip under the band edge: back within the second; FOCUS for its 2 s and the next whole second in band
  r = close(s => (s > 0.3 && s < 0.6 ? LO - 0.01 : 49.95));
  assert.deepEqual([r.focusS, r.caption], [2.02, 'Cold load picked up: 243 MW, back in band in under a second.']);
  // out, back, out again: "back" is the last return, and the FOCUS waits for a whole second after it
  r = close(s => (s < 1 ? 49.8 : s < 1.5 ? 49.9 : s < 3 ? 49.8 : 49.9));
  assert.deepEqual([r.endS, r.caption], [4.02, 'Cold load picked up: 243 MW, back in band in 3 s.']);
  // a trip during it: FOCUS ends at once and quietly (the watch tells that story)
  r = close(dip(3.3), 243.4, (st, t0) => { if (st.tick === t0 + TPS) { st.conts.push({n: 0, startTick: st.tick, watchEndTick: st.tick + V.WATCH_S * TPS, backInBandTick: -1, rocofHzS: -0.3, uflsStages: 0}); st.contIdx = 0; } });
  assert.deepEqual([r.endS, r.caption, r.rf.quiet], [1, '', true]);
});

test('Q-115 on the page: HAR4\'s hand-back at 06:40 (2026-10-22) dips out of band and the clock stays 1x until it is back, about 3.1 grid s (it was 2); then the city desk\'s caption, its MW the sim\'s cold load', () => {
  const p = openGame({seed: 20261022}), st = p.game.state;
  assert.deepEqual([p.skipTo('07:30').at, p.mode(), p.game.feeder && p.game.feeder.id], ['06:40:00', 'FEEDER-CARD', 'HAR4']);
  const i = st.city.districts.findIndex(x => x.id === 'HAR4'), mw = fleet.districtColdLoadMW(st, i), t0 = st.tick, ms0 = p.now;
  p.key('Enter');                                                       // RESTORE HAR4 (Q-91: R or Enter at its card)
  assert.deepEqual(st.log.filter(x => x.type === 'restore').map(x => [x.tick, x.args.district]), [[t0, 'HAR4']]);
  assert.match(p.look({controls: false}), / \| FOCUS 1× \| /, 'the close plays 1x');
  assert.equal(p.until('mode', {max: '+1m'}).why, 'mode');
  const rf = p.game.director.rfs.at(-1), backS = (rf.back - t0) / TPS, focusS = (rf.end - t0) / TPS;
  assert.ok(rf.out && backS > D.RESTORE_FOCUS_S + 0.5 && backS < 4, 'back in band ' + backS + ' grid s after the close');
  assert.ok(focusS > backS + 0.9 && focusS <= D.RESTORE_FOCUS_MAX_S, 'and a whole grid second in band: ' + focusS + ' grid s at 1x');
  assert.equal(p.mode(), 'CRUISE');
  assert.ok(Math.abs((p.now - ms0) / 1000 - focusS) < 0.6, 'at 1x: ' + (p.now - ms0) / 1000 + ' real s for ' + focusS + ' grid s');
  const look = p.look();
  assert.match(look, /^DIAL 49\.[89]\d\d Hz /m, 'the dial, at speed each second\'s mean, reads in band from the first frame (no "!")');
  const text = 'Cold load picked up: ' + Math.round(mw) + ' MW, back in band in ' + Math.round(backS) + ' s.';
  assert.equal(rf.mw, mw, 'the sim\'s cold-load figure for HAR4 at the close');
  assert.match(look, new RegExp('^TRAY .*CITY DESK[^|]*' + text.replace(/[.]/g, '\\.') + '[^|]*TO THE DIAL', 'm'));
  assert.equal(p.game.tray.cards.filter(c => /^Cold load/.test(c.text)).length, 1, 'one caption');
  // D-2's clock: the FOCUS part is this close's, at 1x (Space came before the jump: its frames are the skip's)
  const f = p.clockReport().parts.FOCUS;
  assert.ok(f.n === 1 && Math.abs(f.realS - focusS) < 0.1 && Math.abs(f.overS - focusS) < 0.1, JSON.stringify(f));
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-115 (review), K-9: the caption is never pushed out by its own arrival: with three warnings up (a shed evening\'s), the oldest of them goes to the LOG; an older information card would go first', () => {
  const tr = T.createTray(), ufls = (s, stage, d) => ({tick: s * TPS, kind: 'ufls', stage, districts: d, mw: 424});
  const caption = atS => ({text: 'Cold load picked up: 251 MW, still out of band after 6 s.', target: 'dial-freq', atS});
  T.trayRecords(tr, [{tick: 200 * TPS, kind: 'contingency', cause: 'unit', id: 'coal3', lostMW: 612}, ufls(201, 1, ['RED1', 'SAL1']), ufls(202, 2, ['HAR1', 'SAL2'])]);
  assert.deepEqual(tr.cards.map(c => c.sev), ['warn', 'warn', 'warn']);
  assert.deepEqual(T.trayMarg(tr, caption(210), T.SENDERS.city, 'TO THE DIAL'), ['tick']);
  assert.deepEqual(tr.cards.map(c => c.sev + ' ' + c.text.split(' ').slice(0, 5).join(' ')), ['warn Relays shed RED1 and SAL1', 'warn Relays shed HAR1 and SAL2', 'info Cold load picked up: 251']);
  assert.deepEqual([tr.log.length, tr.log[0].text.includes('tripped'), tr.cards[2].button], [1, true, {label: 'TO THE DIAL', target: 'dial-freq'}]);
  // with an older information card up, that one goes, and the warnings stay
  const tr2 = T.createTray();
  T.trayRecords(tr2, [ufls(201, 1, ['RED1', 'SAL1']), {tick: 202 * TPS, kind: 'log', sev: 'info', code: 'UNIT_READY', msg: 'GT·A at full speed: auto-sync in 4 min.'}, ufls(203, 2, ['HAR1', 'SAL2'])]);
  assert.deepEqual(tr2.cards.map(c => c.sev), ['warn', 'info', 'warn']);
  T.trayMarg(tr2, caption(230), T.SENDERS.city, 'TO THE DIAL');
  assert.deepEqual([tr2.cards.map(c => c.sev + ' ' + c.atS), tr2.log.map(c => c.atS)], [['warn 201', 'warn 203', 'info 230'], [202]]);
});

test('Q-115 on the page: an AGC morning offers nothing when a unit reaches full speed at TIGHT (a HAND day would), and START on it still opens its synchroscope', () => {
  const p = openGame({seed: 20261002}), st = p.game.state, gta1 = st.units.find(u => u.id === 'gta1');
  assert.equal(st.control.mode, 'AGC');
  assert.equal(p.send({type: 'start', unit: 'gta1'}), '');                // (GT·A's one machine: the station's START is its)
  assert.equal(p.until(({state}) => state.units.find(u => u.id === 'gta1').mode === 'ready', {max: '+30m'}).why, 'pred');
  const obs = p.vm().obs;
  assert.notEqual(G.offerWhy(Object.assign({}, obs, {mode: 'HAND'}), {n: 0, extra: 0, contN: -1}), '', 'a HAND day would offer it here');
  assert.deepEqual([gta1.mode, p.vm().offers, p.game.tally.n, p.mode()], ['ready', [], 0, 'CRUISE'], 'nothing offered: no SYNC 30×');
  const s = p.press('station-start-gta');
  assert.deepEqual([st.scope.unit, p.mode()], ['gta1', 'FOCUS'], 'START on the unit at full speed opened its scope');
  assert.match(s.during, / \| FOCUS 1× \| /);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-115, F-7: a HAND day saved mid-offer resumes to the same offers, tally and SYNC 30× (the offer\'s window comes back with it)', () => {
  const mem = new Map([[G.SEEN_KEY, JSON.stringify({shifts: 3})]]), date = new Date(2026, 9, 2);
  const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  const p = openGame({seed: 20261002, agc: false, storage, date});
  assert.equal(p.send({type: 'start', unit: 'gta1'}), '');
  p.until(({state}) => state.units.find(u => u.id === 'gta1').mode === 'ready', {max: '+30m'});
  assert.deepEqual([p.game.state.control.mode, p.mode(), p.vm().offers], ['HAND', 'OFFER', [{unit: 'gta1', why: 'tight'}]]);
  assert.ok(G.saveResume(p.game));
  const q = openGame({seed: 20261002, storage, date, take: false});
  q.click('btn-take');
  for (let k = 0; k < 400 && q.game.replay; k++) q.frame();
  assert.deepEqual([q.game.resumeFailed, q.game.state.tick, q.game.offered, q.game.tally], ['', p.game.state.tick, p.game.offered, p.game.tally]);
  q.key(' ');                                                            // (the resumed desk opens held)
  assert.deepEqual([q.mode(), q.game.director.offers], ['OFFER', p.game.director.offers], 'SYNC 30× for the rest of its window, as in play');
});

test('Q-115, F-7 (review): an offer a replay frame makes, that play never made, does not come back with the resume', () => {
  const mem = new Map([[G.SEEN_KEY, JSON.stringify({shifts: 3})]]), date = new Date(2026, 9, 2);
  const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
  const p = openGame({seed: 20261002, agc: false, storage, date}), ready = id => ({state}) => state.units.find(u => u.id === id).mode === 'ready';
  // GT·A offered at TIGHT (the day's one 'tight' offer, Q-78); cancelled; GT·B at full speed is not offered (the tally's extra is used)
  p.send({type: 'start', unit: 'gta1'}); p.until(ready('gta1'), {max: '+30m'});
  assert.deepEqual([p.vm().offers, p.game.tally], [[{unit: 'gta1', why: 'tight'}], {n: 1, extra: 1, contN: -1}]);
  p.send({type: 'stop', unit: 'gta1'}); p.send({type: 'start', unit: 'gtb1'}); p.until(ready('gtb1'), {max: '+30m'});
  const tb = p.game.state.tick;
  p.until(({state}) => state.tick >= tb + 60 * TPS, {max: '+5m'});
  assert.deepEqual([p.vm().offers, p.mode()], [[], 'CRUISE']);
  assert.ok(G.saveResume(p.game));
  // the resume's replay, with one page frame (shell.js onFrame builds the vm every frame) landing while GT·B waits: the
  // replay's own tally is fresh there, so that frame offers GT·B, which play never did
  const q = openGame({seed: 20261002, storage, date, take: false}), g = q.game, at = Math.ceil((tb + 1) / 256) * 256;
  assert.ok(G.resumeBegin(g));
  G.resumeStep(g, 0, () => (g.state.tick >= at ? 1 : 0));
  assert.equal(g.state.units.find(u => u.id === 'gtb1').mode, 'ready');
  G.buildVm(g, {nowMs: 1, dtS: 1 / 60});
  assert.ok(Object.keys(g.director.offers).length, 'the replay frame offered GT·B');
  assert.equal(G.resumeStep(g), 1);
  assert.deepEqual([g.resumeFailed, g.state.tick, g.offered, g.tally], ['', p.game.state.tick, p.game.offered, p.game.tally]);
  g.director.paused = false;
  assert.deepEqual([D.modeOf(g.director, g.state).mode, g.director.offers], ['CRUISE', p.game.director.offers], 'no SYNC 30× play never had');
});
