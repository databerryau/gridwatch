// D-11's accept on the page (desk/README.md §32.8.2, Q-73), sampled: no drawn roll. One game, a returning
// player's (a compact watch, RESTORE at 30×), no input but Enter on each RESPOND card, jumped once to
// 21:00:01 (to('21:00') lands before the sim's flip) by tests/feedback.test.js's card loop. Then three
// looks: at 21:00 the plan bar is the night strip (the lock's words over the day's totals) and the badge
// reads NIGHT ROLL; at 01:00 every figure has counted up and the city's windows have gone dark; the night
// ends at 04:00 by itself (never a card or a hold) within 15 real s of 21:00, and the END line is there at
// once. Par is a finished stand-in, so the strip shows SCORE. The end card's fetch at 21:00 is checked on
// the shell alone. The file takes about 5.5 s alone, nearly all of it the sim's day and night.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openGame} from './lib/play.js';
import {makeDocument} from './lib/dom.js';
import * as G from '../app/game.js';
import {bootGame, NIGHT_REDRAW_MS} from '../app/shell.js';
import * as endCard from '../app/endcard.js';
import {NIGHT_LOCK} from '../render/format.js';
import {PAR_MARK_S} from '../app/par.js';
import {NIGHT_S} from '../sim/clock.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';

const SEED = 20261013;   // a storm day with no trip before 21:00 (the loop still answers any card)
const mem = new Map([[G.SEEN_KEY, JSON.stringify({watch: true, restore: true})]]);
const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v))};
// par: its running totals at its 5-minute marks (app/par.js), a steady day's
const row = s => ({costDollars: 50 * s, servedMWh: 1.4 * s, lightsMWh: 0, co2tPerMWh: 0.6, saidiMin: 0, saifi: 0, maifi: 0});
const series = Array.from({length: V.DAY_S / PAR_MARK_S + 1}, (_, k) => row(k * PAR_MARK_S));

const S = {};
const lines = (look, head) => look.split('\n').filter(l => l.startsWith(head));
/** The strip's figures: {SUPPLY, OUTAGES, CARBON, ALL-IN} in $M and SCORE. */
function figures(look) {
  const [night] = lines(look, 'NIGHT ');
  assert.ok(night, 'the night strip shows:\n' + look);
  const f = {};
  for (const m of night.matchAll(/(SUPPLY|OUTAGES|CARBON|ALL-IN) \$(\d+\.\d)M/g)) f[m[1]] = Number(m[2]);
  f.SCORE = Number(/ · SCORE (\d+) \(par 1000\)$/.exec(night)[1]);
  return f;
}
const windows = p => Object.values(p.h.mods.map.debug.districts).reduce((a, d) => a + d.windows, 0);

before(() => {
  const p = S.p = openGame({seed: SEED, storage, par: {score: series.at(-1), series}});
  for (let i = 0; i < 8; i++) { const r = p.to('21:00:01', {stop: [], line: 'near'}); if (r.why !== 'held:RESPOND-CARD') break; p.key('Enter'); }
  S.t21 = p.now;
});

test('Q-73 at 21:00: the plan bar is the night strip (the lock\'s words, the day\'s totals and SCORE against par), the badge NIGHT ROLL', () => {
  const p = S.p, look = S.look21 = p.look({controls: false});
  assert.equal(p.clock(), '21:00:01');
  assert.equal(lines(look, 'CLOCK')[0].split(' | ')[1], 'NIGHT ROLL 2,100×');
  assert.deepEqual(lines(look, 'LINE '), [], 'the standing line gives way to the strip');
  const [night] = lines(look, 'NIGHT ');
  assert.ok(night.startsWith('NIGHT ☾ NIGHT SHIFT ' + NIGHT_LOCK + ' SUPPLY $'), night);
  const f = S.f21 = figures(look);
  assert.ok(f.SUPPLY > 0 && f.CARBON > 0 && f.SCORE > 0, JSON.stringify(f));
  assert.ok(Math.abs(f['ALL-IN'] - (f.SUPPLY + f.OUTAGES + f.CARBON)) <= 0.15, 'ALL-IN is the three parts: ' + JSON.stringify(f));
  // nothing to press, nothing that moves: no control in it, and its figures redrawn at most every NIGHT_REDRAW_MS
  assert.equal(p.$('night-strip').querySelectorAll('button').length, 0);
  assert.ok(NIGHT_REDRAW_MS >= 500);
  assert.equal(p.$('end-card').hidden, true);
  S.w21 = windows(p);
  assert.deepEqual(p.h.mods.errors, []);
});

test('D-11 (Q-73): at 01:00 every figure has counted up and the windows are dark; the night ends at 04:00 by itself within 15 real s, the END line at once', () => {
  const p = S.p;
  const r = p.to('01:00', {stop: ['card']});
  assert.equal(r.why, 'target', 'no card in the night');
  const f = figures(p.look({controls: false}));
  for (const k of ['SUPPLY', 'CARBON', 'ALL-IN']) assert.ok(f[k] > S.f21[k], k + ' counts up: ' + S.f21[k] + ' -> ' + f[k]);
  assert.ok(f.OUTAGES >= S.f21.OUTAGES && f.SCORE > 0, JSON.stringify(f));
  const w = windows(p);
  assert.ok(w < S.w21 / 3, 'the windows go dark: ' + S.w21 + ' at 21:00, ' + w + ' at 01:00');
  const end = p.until('card');   // (its guard is the day's end: 'target' on the tick the day is over)
  assert.ok(p.game.state.over && /^(over|target)$/.test(end.why), 'the roll asks for nothing, no card and no hold: ' + end.why + ' at ' + end.at);
  assert.ok(p.now - S.t21 <= 15000, (p.now - S.t21) + ' real ms from 21:00');
  const look = p.look({controls: false});
  assert.match(look, /^END Day over: 04:00\. /m, 'the end card at once');
  assert.deepEqual(lines(look, 'NIGHT '), [], 'the strip gives way to the card');
  assert.deepEqual(p.h.mods.errors, []);
});

// (the shell alone on next.html, its flags set as the sim sets them: no second played game)
test('Q-73: the end card is fetched when the night shift takes the desk (hidden), so 04:00 shows it on its first frame; a classic night fetches nothing early', async () => {
  const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
  const boot = scenario => {
    let loads = 0;
    const doc = makeDocument(NEXT), h = bootGame(doc, {search: '?seed=' + SEED, scenario, storage: null, audioWin: {}, raf: false, now: () => 0,
      endCard: () => { loads++; return Promise.resolve(endCard); }});
    doc.getElementById('btn-take').click();
    h.frame(1 / 60);
    return {h, $: id => doc.getElementById(id), loads: () => loads};
  };
  const b = boot(G.scenarioForSeed);
  assert.equal(b.loads(), 0, 'nothing before 21:00');
  b.h.game.state.control.nightShift = true; // (the sim's flag from 21:00, Q-73)
  b.h.frame(1 / 60);
  await new Promise(r => setTimeout(r, 0));   // (the page's import() is asynchronous)
  b.h.frame(1 / 60);
  assert.deepEqual([b.loads(), b.$('end-card').hidden], [1, true], 'fetched at the flip, still hidden');
  b.h.game.state.over = true;
  b.h.frame(1 / 60);
  assert.deepEqual([b.loads(), b.$('end-card').hidden, b.$('end-card').firstElementChild.textContent], [1, false, 'Day over: 04:00.'], 'shown on the frame the day ends');
  const c = boot(CLASSIC);
  c.h.game.state.tick = (NIGHT_S + 3600) * V.TICKS_PER_S; // (22:00 on a day with no night shift)
  c.h.frame(1 / 60);
  assert.equal(c.loads(), 0, 'classic: no night shift, no early fetch');
  assert.deepEqual([b.h.mods.errors, c.h.mods.errors], [[], []]);
});
