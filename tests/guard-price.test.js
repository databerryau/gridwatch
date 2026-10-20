// W7, Q4 (decisions/2026-10-16-open-questions.md §4, option B): prices on both sides, only in the "? IF PRESSED" line.
// The GUARD ring turned down says what the freed battery MW could replace by 21:00 (gas and its carbon, the score's terms)
// against what the largest loss would then shed, at the VCR per 10 minutes dark (app/objective.js guardConsequence; the
// page: app/game.js guardReach, the live region: app/shell.js liveFrame). A STOP's line carries its saving: tests/objective.test.js.
// The ring sends on release or key-up (desk/rotary.js), so its price stands under "? IF PRESSED" only while it turns, and
// under GUARD SET once sent (the review: a key step is made before its price is read); the live region says it as made.
// The arithmetic on a poked observation with a stand-in preview; the page at 04:30, held (no day walked, CLAUDE.md).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import {DESK} from '../content/scenarios.js';
import {guardConsequence, LINE_MAX_CHARS, RELAY_NEAR_HZ} from '../app/objective.js';
import {CONSIDER_REST_MS, guardReach, tickOnce} from '../app/game.js';
import {liveFrame, createLive} from '../app/shell.js';
import {openGame} from './lib/play.js';

const H = V.S_PER_H, at = h => (h - V.DAY_START_H) * H;
let OBS = null;
function base() {
  if (!OBS) { const st = createState(20261014, DESK); while (st.tick < V.PLAYER_START_TICK) step(st); OBS = JSON.stringify(observe(st)); }
  return JSON.parse(OBS);
}
// 17:30 with gas (CCGT 1) setting $74, the battery at socMWh, COAL 1 the largest loss
function evening(socMWh) {
  const o = base();
  Object.assign(o, {s: at(17.5)});
  Object.assign(o.battery, {ratedMW: 500, guardMW: 400, socMWh, capMWh: 1000});
  Object.assign(o.price, {mwh: 74, adder: 0, marginalId: 'ccgt1'});
  Object.assign(o.sec, {lKind: 'unit', lId: 'coal1'});
  return o;
}
// a stand-in TRIP PREVIEW: sheds `mw` below a GUARD of 400, none at 400
const sheds = mw => g => ({nadirHz: g >= 400 ? 49.41 : 48.95, caught: {uflsMW: g >= 400 ? 0 : mw}});

test('Q4: the GUARD turned down prices both sides: the gas and carbon the freed MW could replace by 21:00, and what a trip would then shed at the VCR per 10 minutes dark', () => {
  const o = evening(800), ccgt = V.MACHINES.find(m => m.id === 'ccgt1');
  // 3.5 h to 21:00 (the night shift's GUARD from then): 100 MW free gives 350 MWh, 300 MW gives all 600 above the reserve:
  // 250 MWh more, at $74 + 0.42 t at the VER
  assert.equal(DESK.night, true);
  const v = 250 * (74 + V.VER * ccgt.co2);
  assert.equal(Math.round(v / 1000), 27);
  const c = guardConsequence(o, 400, 200, sheds(332));
  assert.deepEqual(c, {target: 'ring-guard', level: 'crit', fromMW: 400, toMW: 200,
    text: 'GUARD 400 → 200 MW: the battery could replace up to about $27,000 more gas and carbon by 21:00. A COAL 1 trip would then shed about 330 MW: $1.7M per 10 minutes dark.'});
  assert.ok(c.text.length <= LINE_MAX_CHARS, c.text.length);
  assert.equal(Math.round(332 * V.VCR / 6 / 1e5) / 10, 1.7, 'the VCR the score charges, for 10 minutes');
  // nothing shed: where it would bottom, and whether that is still secure (the N-1 gauge's line, 49.55 Hz)
  // (150 MW free gives 525 MWh: 175 more)
  assert.deepEqual(guardConsequence(o, 400, 350, () => ({nadirHz: 49.213, caught: {uflsMW: 0}})), {target: 'ring-guard', level: 'plan', fromMW: 400, toMW: 350,
    text: 'GUARD 400 → 350 MW: the battery could replace up to about $19,000 more gas and carbon by 21:00. A COAL 1 trip would bottom at about 49.21 Hz: no relays, but not secure.'});
  assert.match(guardConsequence(o, 400, 350, () => ({nadirHz: V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ, caught: {uflsMW: 0}})).text, / A COAL 1 trip would bottom at about 49\.55 Hz: still secure\.$/);
  // (review) close to the first stage the preview's own error (up to 0.105 Hz optimistic, sim/params.js) could reach the
  // relays: "no relays" only from RELAY_NEAR_HZ up
  const edge = hz => guardConsequence(o, 400, 350, () => ({nadirHz: hz, caught: {uflsMW: 0}})).text;
  assert.ok(RELAY_NEAR_HZ >= V.UFLS_FIRST_HZ + 0.105 && RELAY_NEAR_HZ < V.UFLS_FIRST_HZ + 0.12, RELAY_NEAR_HZ);
  assert.match(edge(49.02), / A COAL 1 trip would bottom at about 49\.02 Hz: close to the relays\.$/);
  assert.match(edge(RELAY_NEAR_HZ - 0.001), /: close to the relays\.$/);
  assert.match(edge(RELAY_NEAR_HZ), / would bottom at about 49\.11 Hz: no relays, but not secure\.$/);
  // shedding already at 400: the more, and the tie as the largest loss; past LINE_MAX_CHARS (172 as the long head said it)
  // the short head says the same: what is saved, by when, and what the trip would shed, and is shedding now
  const tie = evening(800);
  Object.assign(tie.sec, {lKind: 'link', lId: 'tie'});
  assert.equal(guardConsequence(tie, 400, 200, g => ({nadirHz: 48.9, caught: {uflsMW: g >= 400 ? 120 : 332}})).text,
    'GUARD 400 → 200 MW: up to about $27,000 of gas and carbon saved by 21:00. A tie trip would then shed about 330 MW (120 MW now): $1.7M per 10 minutes dark.');
  assert.match(guardConsequence(tie, 400, 300, g => ({nadirHz: 48.9, caught: {uflsMW: 120}})).text, / A tie trip would bottom at about 48\.90 Hz: it sheds no more\.$/);
  // the charge runs out first either way: no energy to price
  assert.match(guardConsequence(evening(500), 400, 200, sheds(332)).text, /^GUARD 400 → 200 MW: no more energy by 21:00: the battery's charge runs out first either way\. A COAL 1 trip/);
  // before the evening: 16:30-21:00 at tonight's gas (the CCGT's offer and carbon), on the charge the battery line fills it to by 15:30
  const am = evening(400);
  Object.assign(am, {s: at(10)});
  am.price.marginalId = 'coal1';
  const ccgtV = V.STATIONS.ccgt.offer + V.VER * V.STATIONS.ccgt.co2, mwh = Math.min(970 - 200, 300 * 4.5) - Math.min(970 - 200, 100 * 4.5);
  assert.match(guardConsequence(am, 400, 200, sheds(0)).text, new RegExp('^GUARD 400 → 200 MW: the battery could replace up to about \\$' + Math.round(mwh * ccgtV / 1000).toLocaleString('en') + ',000 more gas'));
  // up, or level: nothing to price
  assert.equal(guardConsequence(o, 200, 400, sheds(332)), null);
  assert.equal(guardConsequence(o, 400, 400, sheds(332)), null);
  // no loss to preview: the energy side alone
  const none = evening(800);
  none.sec.lKind = 'none';
  assert.equal(guardConsequence(none, 400, 200, () => assert.fail('no preview')).text, 'GUARD 400 → 200 MW: the battery could replace up to about $27,000 more gas and carbon by 21:00.');
});

test('W7 integration review: once the GUARD stands at the move (GUARD SET) the price says what the N-1 gauge says: the relays shed under TRIP SHEDS, never under TIGHT, at the gauge\'s figure', () => {
  const o = evening(800), quiet = () => ({nadirHz: 49.14, caught: {uflsMW: 0}});
  const tail = c => c.text.slice(c.text.indexOf(' A COAL 1 trip'));
  // the review's frame: the price's own run says 49.14 Hz, no relays; the gauge says TRIP SHEDS at 48.99 Hz (rounded down, as it shows it)
  assert.equal(tail(guardConsequence(o, 150, 100, quiet)), ' A COAL 1 trip would bottom at about 49.14 Hz: no relays, but not secure.', 'turning, not yet sent: its own run');
  let c = guardConsequence(o, 150, 100, quiet, {word: 'TRIP SHEDS', hz: 48.996});
  assert.equal(tail(c), ' A COAL 1 trip would bottom at about 48.99 Hz: the relays would shed districts.');
  assert.equal(c.level, 'crit');
  // a word the gauge holds over a preview back above 49.0 Hz: as the gauge says it; and its live figure, the price's own run
  assert.match(guardConsequence(o, 150, 100, quiet, {word: 'TRIP SHEDS', hz: 49.02}).text, / 49\.02 Hz: above the relays now\.$/);
  assert.match(guardConsequence(o, 150, 100, quiet, {word: 'TRIP SHEDS'}).text, / 49\.14 Hz: above the relays now\.$/);
  // shedding at both GUARDs: no more, as before
  assert.match(guardConsequence(o, 150, 100, () => ({nadirHz: 48.97, caught: {uflsMW: 294}}), {word: 'TRIP SHEDS', hz: 48.97}).text, / 48\.97 Hz: it sheds no more\.$/);
  // the gauge says TIGHT (its preview at or above 49.0 Hz) while the price's own run sheds: no shed is said, at the gauge's figure
  c = guardConsequence(o, 150, 100, g => ({nadirHz: g >= 150 ? 49.2 : 48.98, caught: {uflsMW: g >= 150 ? 0 : 294}}), {word: 'TIGHT', hz: 49.05});
  assert.equal(tail(c), ' A COAL 1 trip would bottom at about 49.05 Hz: close to the relays.');
  assert.equal(c.level, 'plan');
  assert.match(guardConsequence(o, 150, 100, () => ({nadirHz: 48.97, caught: {uflsMW: 294}}), {word: 'TIGHT', hz: 49.2}).text, / 49\.20 Hz: no relays, but not secure\.$/);
  // SHORT and SHEDDING say nothing of the relays: the price's own run, as before
  assert.match(guardConsequence(o, 150, 100, g => ({nadirHz: 48.9, caught: {uflsMW: g >= 150 ? 0 : 294}}), {word: 'SHORT', hz: 48.9}).text, / would then shed about 290 MW: /);
});

test('Q4 (review): the GUARD price is one line (LINE_MAX_CHARS) at its longest: a four-figure shed with some shed now, behind a six-figure gain or none, every largest loss; its figures all said', () => {
  // (a hot evening: a UFLS stage is two districts of about 3% of demand each, so two stages more at the lower GUARD reach four figures)
  const hot = (soc, lKind, lId) => {
    const o = evening(soc);
    Object.assign(o, {s: at(17)});
    Object.assign(o.battery, {guardMW: 500, socMWh: soc});
    Object.assign(o.price, {mwh: 300, marginalId: 'gtc1'});
    Object.assign(o.sec, {lKind, lId});
    return o;
  };
  // the review's case: 176 characters before
  const r = guardConsequence(hot(1000, 'unit', 'coal1'), 500, 0, g => ({nadirHz: 48.6, caught: {uflsMW: g >= 500 ? 120 : 1234}}));
  assert.equal(r.text, 'GUARD 500 → 0 MW: up to about $280,000 of gas and carbon saved by 21:00. A COAL 1 trip would then shed about 1,230 MW (120 MW now): $6.2M per 10 minutes dark.');
  let longest = 0;
  const mw = x => (Math.round(x / 10) * 10).toLocaleString('en') + ' MW';
  for (const [lKind, lId, who] of [['unit', 'hydro1', 'HYDRO 1'], ['unit', 'gtc2', 'GT·C 2'], ['link', 'tie', 'tie']]) for (const soc of [1000, 300]) {
    for (const [shed, now] of [[1680, 1560], [1234, 120], [1680, 0], [330, 120]]) for (const [f, t] of [[500, 0], [500, 450], [450, 0]]) {
      const c = guardConsequence(hot(soc, lKind, lId), f, t, g => ({nadirHz: 48.6, caught: {uflsMW: g >= f ? now : shed}}));
      longest = Math.max(longest, c.text.length);
      assert.ok(c.text.length <= LINE_MAX_CHARS, c.text.length + ': ' + c.text);
      assert.match(c.text, new RegExp('^GUARD ' + f + ' → ' + t + ' MW: (.*\\$[\\d,]+ .*gas and carbon|no .* the .*charge runs out first either way)'), c.text);
      assert.ok(c.text.includes('A ' + who + ' trip would then shed about ' + mw(shed)) && (!now || c.text.includes('(' + mw(now) + ' now)')) &&
        / per 10 min(utes)? dark\.$/.test(c.text), c.text);
    }
  }
  assert.ok(longest > 150, 'the sweep reached the long forms: ' + longest);
});

test('Q4 (review), the live region: the GUARD price is said once a move, as made; one gone from the screen before it was said is dropped; the next reach, the same move too, is said again', () => {
  const L = createLive(), out = [];
  let tick = 100, ms = 0;
  const price = (fromMW, toMW, usd = '24,000', level = 'plan') => ({target: 'ring-guard', level, fromMW, toMW,
    text: 'GUARD ' + fromMW + ' → ' + toMW + ' MW: the battery could replace up to about $' + usd + ' more gas and carbon by 21:00. A COAL 1 trip would bottom at about 49.53 Hz: no relays, but not secure.'});
  const vm = (consider, guardMW, level = 'SECURE') => ({phase: 'play', obs: {tick: tick++, f: {hz: 50}, sec: {level}, battery: {guardMW}, over: false, nightShift: false},
    mode: {mode: 'PLAY', segment: 'DAWN', act: 1}, alarms: {tiles: []}, tray: {cards: []}, respond: null, feeder: null, objective: null, consider});
  const step = (c, guardMW, level, dt = 250) => { const r = liveFrame(L, vm(c, guardMW, level), ms); if (r) out.push(r); ms += dt; return r; };
  step(null, 400);   // (primed)
  // turning, not yet sent: on the screen under "? IF PRESSED", never said
  for (let i = 0; i < 12; i++) step(price(400, 350), 400);
  assert.deepEqual(out, []);
  // sent: said at once (nothing said in the last 2 s), once, though its figures move after
  assert.equal(step(price(400, 350), 350), 'GUARD SET: ' + price(400, 350).text);
  for (let i = 0; i < 12; i++) step(price(400, 350, '25,000'), 350);
  assert.equal(out.length, 1, out.join(' | '));
  // rested (the plan's line back), then the same move again: said again
  for (let i = 0; i < 12; i++) step(null, 350);
  step(price(350, 300), 350);   // (the next reach starts from where the GUARD stands: not yet sent)
  for (let i = 0; i < 4; i++) step(null, 350);
  out.length = 0;
  step(price(400, 350), 350);
  assert.deepEqual(out, ['GUARD SET: ' + price(400, 350).text], 'a second reach, the same move');
  // a step made inside the 2-s gap waits; turned back before it is said (the reach ends: no price), it is dropped
  out.length = 0;
  step(price(400, 300, '34,000'), 300);
  step(price(400, 350), 350, 'TIGHT');
  step(null, 400, 'TIGHT');
  for (let i = 0; i < 16; i++) step(null, 400, 'TIGHT');
  assert.deepEqual(out, ['N-1 TIGHT'], 'the undone move is not said: ' + out.join(' | '));
  // a turn of several steps inside the gap says its last, with its newest figures
  out.length = 0;
  for (let i = 0; i < 12; i++) step(null, 400, 'TIGHT');
  step(price(400, 350), 350, 'TIGHT');
  step(price(400, 300), 300, 'TIGHT');
  step(price(400, 250), 250, 'TIGHT');
  step(price(400, 250, '41,000'), 250, 'TIGHT');
  for (let i = 0; i < 12; i++) step(price(400, 250, '41,000'), 250, 'TIGHT');
  assert.deepEqual(out, ['GUARD SET: ' + price(400, 350).text, 'GUARD SET: ' + price(400, 250, '41,000').text]);
});

test('Q4 in the page: the GUARD ring turned down by keys says both sides, "? IF PRESSED" while the key is down and GUARD SET once the step is sent; the live region says it once, as made; the plan\'s line returns after the rest; a line asking for that GUARD is not argued with', () => {
  const p = openGame({seed: 20261014, run: false});
  assert.equal(p.send({type: 'guard', mw: 400}), '');
  p.frame();
  const ring = p.$('ring-guard');
  ring.focus();
  const line = () => p.$('objective-level').textContent + ' ' + p.$('objective-text').textContent;
  const aria = [], hear = () => { const t = (/^ARIA (.*)$/m.exec(p.look({controls: false, aria: true})) || [])[1]; if (t && t !== aria[aria.length - 1]) aria.push(t); };
  hear();
  // the key down: the ring turns, nothing is sent yet (desk/rotary.js sends on key-up): what the press would do
  p.keyDown('ArrowDown'); p.frame(); hear();
  assert.equal(p.game.state.battery.guardMW, 400);
  assert.match(line(), /^\? IF PRESSED GUARD 400 → 350 MW: the battery could replace up to about \$[\d,]+ more gas and carbon by 21:00\. /, line());
  // (review) key-up sends it: the price stands for a move made, never "if pressed"
  p.keyUp('ArrowDown'); p.frame(); hear();
  assert.equal(p.game.state.battery.guardMW, 350);
  assert.match(line(), /^✓ GUARD SET GUARD 400 → 350 MW: /, line());
  p.key('ArrowDown'); hear();   // a second step: the reach goes on from 400
  assert.equal(p.game.state.battery.guardMW, 300);
  assert.match(line(), /^✓ GUARD SET GUARD 400 → 300 MW: the battery could replace up to about \$[\d,]+ more gas and carbon by 21:00\. A [A-Z]+ \d trip would (bottom at about 4\d\.\d\d Hz: (still secure|no relays, but not secure|close to the relays)|then shed about [\d,]+ MW( \([\d,]+ MW now\))?[:,] \$[\d.,]+M? per 10 min(utes)? dark)\.$/, line());
  // the live region: the move as made, its last step (rate-limited: the first step's may go first), never "if pressed"
  // (the clock is held: real seconds pass in a few long frames, as tests/card.test.js lets a rest pass)
  for (let i = 0; i < 4; i++) { p.real(0.7, 0.7); hear(); }
  const priced = aria.filter(t => /GUARD 400 → /.test(t));
  assert.ok(priced.length >= 1 && priced.every(t => /^GUARD SET: GUARD 400 → (350|300) MW: the battery could replace/.test(t)), aria.join(' | '));
  assert.match(priced[priced.length - 1], /^GUARD SET: GUARD 400 → 300 MW: /);
  p.real(CONSIDER_REST_MS / 1000 + 1.4, 0.7);   // (the ring's ghost lingers 1.5 s, desk/rotary.js PREVIEW_LINGER_MS; then the rest)
  assert.doesNotMatch(line(), /IF PRESSED|GUARD SET/, 'the plan\'s line back: ' + line());
  // a line that asks for a GUARD at or below the ring's: the turn is the line's (a short desk wants the MW), no price; past it, priced
  const g = p.game, reach = {fromMW: 400, toMW: 200, ms: p.now};
  g.ui.guardReach = reach;
  g.objective = {level: 'act', kind: 'short', text: 'Demand is 200 MW more than every committed unit can give. The battery carries it: turn its GUARD down to 0 MW, then discharge it.',
    targets: ['ring-guard'], action: {type: 'guard', mw: 0}, startBy: 0, short: null, long: null};
  assert.equal(guardReach(g, p.now), null);
  g.objective.action.mw = 300;
  assert.equal(guardReach(g, p.now), reach);
  assert.equal(g.ui.previewGuardMW, null, 'the ring\'s ghost is gone');
  assert.equal(guardReach(g, p.now + CONSIDER_REST_MS + 1), null, 'rested');
  assert.deepEqual(p.h.mods.errors, []);
});

test('W7 integration review, in the page: under GUARD SET the price is made every frame and says what the N-1 gauge beside it says, its live figure while the ring\'s ghost lingers, then its word and figure', () => {
  const p = openGame({seed: 20261014, run: false}), g = p.game, st = g.state;
  assert.equal(p.send({type: 'guard', mw: 400}), '');
  p.frame();
  p.$('ring-guard').focus();
  p.keyDown('ArrowDown'); p.frame(); p.keyUp('ArrowDown'); p.frame();
  assert.equal(st.battery.guardMW, 350);
  // (the clock is held: one tick by hand, so the desk asks for its live preview again, then the sim's preview and this second's
  // preview runs are set by hand)
  const poke = (sec, at350, at400) => {
    tickOnce(g);
    Object.assign(st.sec, {level: 'TIGHT', lKind: 'unit', lId: 'coal1', dirty: false}, sec);
    g.previewS = Math.floor(st.tick / V.TICKS_PER_S);
    g.previewCache.set('unit|coal1|350', at350);
    g.previewCache.set('unit|coal1|400', at400);
    p.frame();
  };
  const gauge = () => p.$('gauge-n1').getAttribute('aria-label'), line = () => p.$('objective-level').textContent + ' ' + p.$('objective-text').textContent;
  // the gauge says TIGHT at 49.20 Hz; this second's run at 350 MW (the ghost's, the gauge's live figure) sheds
  poke({previewNadirHz: 49.2}, {nadirHz: 48.98, caught: {uflsMW: 294}}, {nadirHz: 49.3, caught: {uflsMW: 0}});
  assert.match(gauge(), /^N-1 gauge: TIGHT\. .*Trip preview 48\.98 Hz/, gauge());
  assert.match(line(), /^✓ GUARD SET GUARD 400 → 350 MW: .* A COAL 1 trip would bottom at about 48\.98 Hz: close to the relays\.$/, line());
  // the ghost gone (desk/rotary.js PREVIEW_LINGER_MS): the gauge's own figure and word
  p.real(1.6, 0.4); p.frame();
  assert.equal(g.ui.previewGuardMW, null);
  assert.match(gauge(), /^N-1 gauge: TIGHT\. .*Trip preview 49\.20 Hz/, gauge());
  assert.match(line(), /^✓ GUARD SET GUARD 400 → 350 MW: .* A COAL 1 trip would bottom at about 49\.20 Hz: no relays, but not secure\.$/, line());
  // the sim's preview falls under 49.0 Hz: TRIP SHEDS on the gauge, and on the same frame in the price, though this second's run
  // at 350 MW, which the line's cadence would still be reading, says 49.14 Hz and no relays
  poke({previewNadirHz: 48.996}, {nadirHz: 49.14, caught: {uflsMW: 0}}, {nadirHz: 49.3, caught: {uflsMW: 0}});
  assert.match(gauge(), /^N-1 gauge: TRIP SHEDS: would fall to 48\.99 Hz: the relays would shed \d districts?\./, gauge());
  assert.match(line(), /^✓ GUARD SET GUARD 400 → 350 MW: .* A COAL 1 trip would bottom at about 48\.99 Hz: the relays would shed districts\.$/, line());
  assert.deepEqual(p.h.mods.errors, []);
});
