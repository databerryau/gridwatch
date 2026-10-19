// W7, Q4 (decisions/2026-10-16-open-questions.md §4, option B): prices on both sides, only in the "? IF PRESSED" line.
// The GUARD ring turned down says what the freed battery MW could replace by 21:00 (gas and its carbon, the score's terms)
// against what the largest loss would then shed, at the VCR per 10 minutes dark (app/objective.js guardConsequence; the
// page: app/game.js guardReach, the live region: app/shell.js liveFrame). A STOP's line carries its saving: tests/objective.test.js.
// The arithmetic on a poked observation with a stand-in preview; the page at 04:30, held (no day walked, CLAUDE.md).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import {DESK} from '../content/scenarios.js';
import {guardConsequence, LINE_MAX_CHARS} from '../app/objective.js';
import {CONSIDER_REST_MS, guardReach} from '../app/game.js';
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
  assert.deepEqual(c, {target: 'ring-guard', level: 'crit',
    text: 'GUARD 400 → 200 MW: the battery could replace up to about $27,000 more gas and carbon by 21:00. A COAL 1 trip would then shed about 330 MW: $1.7M per 10 minutes dark.'});
  assert.ok(c.text.length <= LINE_MAX_CHARS, c.text.length);
  assert.equal(Math.round(332 * V.VCR / 6 / 1e5) / 10, 1.7, 'the VCR the score charges, for 10 minutes');
  // nothing shed: still caught, with the nadir
  // (150 MW free gives 525 MWh: 175 more)
  assert.deepEqual(guardConsequence(o, 400, 350, () => ({nadirHz: 49.213, caught: {uflsMW: 0}})), {target: 'ring-guard', level: 'plan',
    text: 'GUARD 400 → 350 MW: the battery could replace up to about $19,000 more gas and carbon by 21:00. A COAL 1 trip would still be caught above the relays, at about 49.21 Hz.'});
  // shedding already at 400: the more, and the tie as the largest loss
  const tie = evening(800);
  Object.assign(tie.sec, {lKind: 'link', lId: 'tie'});
  assert.match(guardConsequence(tie, 400, 200, g => ({nadirHz: 48.9, caught: {uflsMW: g >= 400 ? 120 : 332}})).text, / A tie trip would then shed about 330 MW \(120 MW now\)[:,] /);
  assert.match(guardConsequence(tie, 400, 300, g => ({nadirHz: 48.9, caught: {uflsMW: 120}})).text, / A tie trip would shed no more, at about 48\.90 Hz\.$/);
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

test('Q4 in the page: turning the GUARD ring down by keys says both sides under "? IF PRESSED", and the live region says it once; the plan\'s line returns after the rest; a line asking for that GUARD is not argued with', () => {
  const p = openGame({seed: 20261014, run: false});
  assert.equal(p.send({type: 'guard', mw: 400}), '');
  p.frame();
  const ring = p.$('ring-guard');
  ring.focus();
  p.key('ArrowDown');
  p.key('ArrowDown');
  const line = () => p.$('objective-level').textContent + ' ' + p.$('objective-text').textContent;
  assert.match(line(), /^\? IF PRESSED GUARD 400 → 300 MW: the battery could replace up to about \$[\d,]+ more gas and carbon by 21:00\. A [A-Z]+ \d trip would (still be caught above the relays, at about 4\d\.\d\d Hz|then shed about [\d,]+ MW[:,] \$[\d.,]+M? per 10 min(utes)? dark)\.$/, line());
  // (the clock is held: real seconds pass in a few long frames, as tests/card.test.js lets a rest pass)
  p.real(0.35, 0.35);   // (each key sent its GUARD; the reach is from 400 until its rest)
  assert.equal(p.game.state.battery.guardMW, 300);
  assert.match(line(), /GUARD 400 → 300 MW/);
  // the live region: the price as the ring turned (said at once: nothing was said in the last 2 s), then the newest, rate-limited
  const said = [];
  for (let i = 0; i < 2; i++) { p.real(1.4, 0.7); said.push((/^ARIA (.*)$/m.exec(p.look({controls: false, aria: true})) || [])[1]); }
  assert.ok(said.some(t => /^IF PRESSED: GUARD 400 → 300 MW: the battery could replace/.test(t)), said.join(' | '));
  p.real(CONSIDER_REST_MS / 1000 + 1.4, 0.7);   // (the ring's ghost lingers 1.5 s, desk/rotary.js PREVIEW_LINGER_MS; then the rest)
  assert.doesNotMatch(line(), /IF PRESSED/, 'the plan\'s line back: ' + line());
  // a line that asks for a GUARD at or below the ring's: the turn is the line's (a short desk wants the MW), no price; past it, priced
  const g = p.game, reach = {fromMW: 400, toMW: 200, ms: p.now};
  g.ui.guardReach = reach;
  g.objective = {level: 'act', kind: 'short', text: 'Demand is 200 MW more than every committed unit can give. The battery carries it: turn its GUARD down to 0 MW, then discharge it.',
    targets: ['ring-guard'], action: {type: 'guard', mw: 0}, startBy: 0, short: null, long: null};
  assert.equal(guardReach(g, p.now), null);
  g.objective.action.mw = 300;
  assert.equal(guardReach(g, p.now), reach);
  assert.equal(guardReach(g, p.now + CONSIDER_REST_MS + 1), g.ui.previewGuardMW === null ? null : reach, 'rested once the ring\'s ghost is gone');
  assert.deepEqual(p.h.mods.errors, []);
});
