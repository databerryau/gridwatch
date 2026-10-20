// W6, D-29 and S-7: SA 2016 (the SA black system, 28 Sep 2016), the practice shelf's first Hard day. Its own scenario
// ('desk-sa2016': DESK with content/anniversaries.js SA2016's overrides) on its own seed (attempt 1 of its date, so never that
// date's day): a mild spring weekday with a storm; the storm's cut-out takes the wind, and 10 grid s later the tie, carrying
// the cheap afternoon's import, trips (sim/dayplan.js dayplan.incident.cascade: no other scenario has one, so no other day
// changes and SIM_VERSION stands). Par sheds but does not go black, so the day is graded on par's outage-free part (S-7). Its
// account shows before its briefing, as an anniversary's does. Par runs to a checkpoint two grid minutes after the cascade,
// never the whole day (par's whole day and the no-input day were measured once: content/anniversaries.js SA2016).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../app/game.js';
import * as SF from '../app/shelf.js';
import * as SH from '../app/share.js';
import * as S from '../app/score.js';
import * as AP from '../sim/autopilot.js';
import {createState} from '../sim/step.js';
import {preroll, prerollRegime} from '../sim/dayplan.js';
import {V} from '../sim/params.js';
import {SA2016} from '../content/anniversaries.js';
import {SCENARIOS, DESK, SA2016_SCENARIO} from '../content/scenarios.js';
import {DAILIES, seedOf} from '../content/dailies.js';
import {openGame} from './lib/play.js';
import {restampAdvice} from '../tools/verify.mjs';

const TPS = V.TICKS_PER_S, MIN = V.S_PER_MIN, toS = h => Math.round((h - V.DAY_START_H) * V.S_PER_H);
const words = s => s.trim().split(/\s+/).filter(Boolean).length;
const day = createState(SA2016.seed, SA2016_SCENARIO), cut = day.ext.events.find(e => e.type === 'windCutout');
const CHECK = (cut.atS + 2 * MIN) * TPS;   // the checkpoint: the cut-out, the tie's trip, its watch and the relays behind it
const store = (init = {}) => {
  const mem = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {mem, getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
};

test('D-29, S-7: SA 2016 is the shelf\'s first Hard day, on its own seed and scenario; the gate\'s Hard days moved up one', () => {
  const h = SF.hardDays(), gate = Object.keys(DAILIES.attempts).filter(k => DAILIES.attempts[k] > 0).map(Number).sort((a, b) => a - b);
  assert.deepEqual(h[0], {n: 1, seed: SA2016.seed, weekend: false}, 'a Wednesday');
  assert.deepEqual(h.slice(1).map(x => [x.n, x.seed]), gate.map((ymd, i) => [i + 2, ymd]));
  assert.equal(SF.hardDayOf(SA2016.seed), 1);
  assert.equal(SA2016.seed, seedOf(20160928, 1), 'attempt 1 of its date: never that date\'s day');
  assert.equal(G.scenarioForSeed(SA2016.seed), SA2016_SCENARIO);
  assert.equal(SCENARIOS['desk-sa2016'], SA2016_SCENARIO, 'listed: a saved run or a replay finds it by id');
  for (const s of [20160928, seedOf(20160928, 2)]) assert.equal(G.scenarioForSeed(s), DESK, s + ': its date\'s own day');
  assert.equal(G.dailyFrom('?seed=' + SA2016.seed).scenarioId, 'desk-sa2016');
  // the desk scenarios (the dailies' stamp) are untouched; the city, its rooftop and the fleet's 04:00 are the desk's own
  assert.equal(DAILIES.v, G.dailyStamp(), 'content/dailies.js is stale: ' + restampAdvice(DAILIES.from, DAILIES.to));
  assert.equal(DESK.dayplan.incident, undefined);
  for (const k of ['city', 'rooftop', 'commitment', 'levers']) assert.equal(SA2016_SCENARIO[k], DESK[k], k);
  // on the page's path: a Hard day, practice, no date's daily, graded by the page's own par (no stored par)
  const game = G.createGame({daily: G.dailyFrom('?seed=' + SA2016.seed), scenario: G.scenarioForSeed, storage: null});
  assert.deepEqual([game.state.scenarioId, game.hard, game.daily.gated, G.dailyYmd(game), G.storedPar(game)], ['desk-sa2016', 1, null, null, null]);
  assert.equal(G.anniversaryFor(game), SA2016);
  assert.equal(G.anniversaryFor(G.createGame({seed: SA2016.seed, scenario: DESK, storage: null})), null, 'its seed on another scenario is no SA 2016');
});

test('D-29: the cascade: a mild storm; its cut-out takes most of the wind in two grid minutes, and 10 grid s later the tie trips, unwarned', () => {
  const ev = day.ext.events, one = type => ev.filter(e => e.type === type);
  assert.deepEqual([day.ext.regime.cls, day.ext.regime.temp], ['storm', 'MILD']);
  const [arrive] = one('stormArrive');
  assert.equal(one('windCutout').length, 1);
  assert.ok(arrive.atS >= toS(17) && arrive.atS <= toS(18), 'the storm comes in the late afternoon');
  assert.ok(cut.atS - arrive.atS >= 10 * MIN && cut.atS - arrive.atS <= 20 * MIN && cut.args.windMu === 0.05 && cut.warned);
  assert.deepEqual(ev.filter(e => e.contingency).map(e => [e.type, e.atS - cut.atS, e.args.cause, e.warned, e.incident]),
    [['linkTrip', 10, 'storm', false, true]], 'the day\'s one trip; the belly\'s crisis is a front');
  const w = day.ext.series.windPm, k = cut.atS / day.ext.series.stepS;
  assert.ok(w[k - 1] >= 800 && w[k + 1] <= 300, 'the wind: ' + w.slice(k - 1, k + 2).join(', ') + ' per mille');
  // its own slot: without the incident the plan is the same (the late return aside: it keeps one action from it)
  const regime = prerollRegime(SA2016.seed, SA2016_SCENARIO), none = {...SA2016_SCENARIO, dayplan: {...SA2016_SCENARIO.dayplan, incident: undefined}};
  const rest = list => list.filter(e => !e.incident && e.type !== 'unitOutage' && e.type !== 'unitReturn').map(e => [e.atS, e.type, JSON.stringify(e.args)]);
  assert.deepEqual(rest(preroll(SA2016.seed, SA2016_SCENARIO, regime)), rest(preroll(SA2016.seed, none, regime)));
  // a hook on data no other scenario has
  for (const scn of Object.values(SCENARIOS)) if (scn !== SA2016_SCENARIO) assert.ok(!(scn.dayplan && scn.dayplan.incident && scn.dayplan.incident.cascade), scn.id);
});

test('S-7: par sheds on SA 2016 and does not go black: the trip takes the tie\'s import and the relays shed (to the checkpoint)', () => {
  const r = AP.runPar(SA2016.seed, SA2016_SCENARIO, {untilTick: CHECK, hashEveryS: V.DAY_S + 1}), c = r.state.conts;
  assert.equal(r.black, false);
  assert.deepEqual(c.map(x => [x.cause, x.startTick / TPS]), [['link', cut.atS + 10]]);
  assert.ok(c[0].lostMW > 300 && c[0].uflsStages >= 1 && c[0].extremeHz > V.BLACK_LO_HZ, JSON.stringify([c[0].lostMW, c[0].uflsStages, c[0].extremeHz]));
  assert.ok(S.parShedMWh(r.score) > S.OUTAGE_MIN_MWH, 'a Hard day: par shed ' + S.parShedMWh(r.score) + ' MWh');
});

test('D-29, S-7 on the page: Hard day 1 from the shelf opens on THIS REALLY HAPPENED (sourced, 60 words at most), names the day, and its card is a Hard day\'s', () => {
  const PAR = {score: {costDollars: 4e6, lightsMWh: 359, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4, uflsMWh: 205, directedMWh: 154}, series: []};
  const p = openGame({seed: 20261016, run: false, par: PAR, storage: store({[G.SEEN_KEY]: {shifts: 3}}), date: new Date(2026, 9, 16)});
  p.game.state.over = true;
  p.frames(2);
  p.click('btn-shelf');
  assert.doesNotMatch(p.$('shelf-card').textContent, /no plan/i, 'par sheds on a Hard day; a player may not (review)');
  const first = p.$('shelf-card').querySelectorAll('button').find(b => /^Hard day \d+$/.test(b.textContent));
  assert.equal(first.textContent, 'Hard day 1', 'first of the Hard days');
  first.click();
  p.frame();
  assert.equal(p.game.seed, SA2016.seed);
  const a = SA2016, card = p.$('briefing-card'), acc = p.$('briefing-account'), src = p.$('briefing-account-source');
  assert.equal(card.firstElementChild, acc, 'the account is the briefing\'s first box');
  assert.equal(acc.hidden, false);
  assert.match(acc.textContent, /^THIS REALLY HAPPENED/, 'played on any date, with no date shown: not ON THIS DAY (review)');
  assert.equal(p.$('briefing-account-text').textContent, a.account);
  assert.equal(p.$('briefing-account-echo').textContent, a.echo);
  // (review) the echo says where the desk differs: its notice says the turbines cut out in the storm, where the account's
  // wind farms' protection cut them
  assert.ok(/cut-out/.test(a.echo) && /protection/.test(a.echo) && /protection/.test(a.account), a.echo);
  const box = words([p.$('briefing-account-head').textContent, a.account, a.echo, src.textContent].join(' '));
  assert.ok(words(a.account) <= 60 && box <= 65, 'the account ' + words(a.account) + ' words, the box ' + box);
  assert.equal(src.textContent, 'Source: AEMO');
  assert.match(src.href, /^https:\/\/www\.aemo\.com\.au\/.+SA-Black-System-28-September-2016\.pdf$/);
  assert.equal(p.$('briefing-title').textContent, 'Hard day 1 · SA black system, 2016 · PRACTICE');
  assert.doesNotMatch(p.$('briefing-title').title, /no plan/i);
  assert.equal(p.$('briefing-date').textContent, '', 'no date: it is no date\'s daily');
  assert.match(p.$('briefing-day').textContent, /Storms likely later\.$/);
  p.key('Enter');
  assert.equal(p.game.phase, 'play', 'TAKE THE DESK is still the one click');
  p.game.state.over = true;
  p.frames(2);
  const s = p.game.end.share;
  assert.match(s.lines[0], /^GRIDWATCH · Hard day 1 · \d+ [A-F]( ★)?( · PERFECT)? · PRACTICE · HARD DAY$/, 'HARD DAY, no ANNIVERSARY: played on any date');
  assert.deepEqual(SH.lintCard(s.text), [], 'no event words, no place, no time');
  assert.doesNotMatch(s.text, /SA|2016|black/i);
  // (review) a Hard day can be beaten (content/anniversaries.js SA2016): beside PERFECT, the card says that par shed, never
  // that no plan keeps every light on
  assert.match(p.$('end-score').textContent, / · PERFECT$/, 'the day ended at once: nothing shed');
  assert.equal(p.$('end-run').textContent, 'PRACTICE: Hard day 1. Par sheds load on this day: you are graded on the rest.');
  assert.match(p.$('end-hard').textContent, /^HARD DAY: par shed 359\.0 MWh today\. The points leave those MWh out/);
  assert.doesNotMatch(p.$('end-card').textContent, /no plan/i);
  assert.deepEqual(p.h.mods.errors, []);
});
