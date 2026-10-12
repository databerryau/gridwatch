// GRIDWATCH: L-2's forecast coverage (SPEC L-2; desk/README.md §32.6.3, §32.10). Realised operational
// demand falls inside the forecast's P10-P90 in 80 +- 5% of 15-min intervals at 1-h and 4-h leads.
// The method of the slow tests that fb73b7d deleted (`git show fb73b7d^:tests/events.test.js`, "L-2"
// and "L-2 (DESK)"), rebuilt as a tool: per seed and lead, from 05:00 every 15 min while t + lead is
// before 03:00, the day is jumped to t (events and the weather only: no grid, no input),
// forecast(state, lead, FC_STEP_S)'s last column is read, and a copy jumped to t + lead gives the
// realised env.demandMW. Not loaded by the game. An ES module (.mjs: tools/package.json pins the .js
// tools to CommonJS). Stage C runs it once (§32.10); a builder only smoke-checks it on a seed or two.
//
//   node tools/l2.mjs                                    # desk, seeds 1-100, leads 1 h and 4 h
//   node tools/l2.mjs --scenario desk-weekend --seeds 1-200
//   node tools/l2.mjs --scenario desk-legacy --seeds 1-100   # desk on the legacy menu (2a's measure)
//   node tools/l2.mjs --seed 3 --leads 1                 # a smoke check
//
// Flags: --scenario ID (desk, desk-weekend, classic, desk-legacy, desk-weekend-legacy; default desk) |
// --seed N | --seeds A-B (default 1-100) | --leads h,h (default 1,4) | --json (one JSON object).
// Reports, per lead: coverage over every interval; by the day's class (the hidden regime.cls, read for
// reporting only); and over the intervals whose target falls inside a front the forecast carries (a
// cloud news on a dayplan day, from its onset to the last suburb's latest clear: Q-79's band, which
// stage C's tuning round may move on an L-2 miss). Each with its count and the misses above P90 and
// below P10.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createState} from '../sim/step.js';
import {applyDue} from '../sim/events.js';
import {forecast, sampleSecond, climate} from '../sim/weather.js';
import {V, SIM_VERSION} from '../sim/params.js';
import {getScenario} from '../content/scenarios.js';
import {legacyDesk, legacyDeskWeekend} from '../tests/lib/sim-helpers.js';

const FILE = fileURLToPath(import.meta.url), TPS = V.TICKS_PER_S, MIN = V.S_PER_MIN, H = V.S_PER_H;

function parseArgs(argv) {
  const o = {scenario: 'desk', seeds: [1, 100], leads: [1, 4], json: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--seed') { const n = parseInt(next(), 10); o.seeds = [n, n]; }
    else if (a === '--seeds') { const [x, y] = next().split('-').map(Number); o.seeds = [x, y === undefined ? x : y]; }
    else if (a === '--scenario') o.scenario = next();
    else if (a === '--leads') o.leads = next().split(',').map(Number);
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') {
      const src = readFileSync(FILE, 'utf8').split('\n');
      console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).join('\n'));
      process.exit(0);
    } else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  return o;
}

const scenarioOf = id => id === 'desk-legacy' ? legacyDesk() : id === 'desk-weekend-legacy' ? legacyDeskWeekend() : getScenario(id);
const goTo = (s, t) => { s.tick = t * TPS; applyDue(s, []); sampleSecond(s); return s; };
const clone = x => JSON.parse(JSON.stringify(x));

/** The span [from, to] of the front the forecast carries at state s (Q-79), or null. */
function frontSpan(s) {
  const n = s.scn.dayplan && s.scn.rooftop.capacityMW > 0 && s.news.findLast(x => x.kind === 'cloud');
  if (!n) return null;
  const c = climate(s.scn).cloud, lag = Math.max(...s.scn.city.suburbs.map(x => x.frontLagMin));
  return [n.fromS, n.fromS + (lag + c.clearAfterMin[1] + c.clearRampMin) * MIN];
}

/** Coverage of one lead over a seed range: {all, byClass: {cls: tally}, front: tally}. */
export function coverage(scn, seeds, leadS) {
  const tally = () => ({n: 0, inside: 0, above: 0, below: 0});
  const all = tally(), front = tally(), byClass = {};
  for (let seed = seeds[0]; seed <= seeds[1]; seed++) {
    const s = createState(seed, scn), cls = s.ext.regime.cls;
    for (let t = H; t + leadS < V.DAY_S - H; t += 15 * MIN) {
      goTo(s, t);
      const fc = forecast(s, leadS, V.FC_STEP_S), k = fc.n - 1, at = fc.fromS + fc.n * fc.stepS, span = frontSpan(s);
      const y = goTo(clone(s), t + leadS).env.demandMW;
      const into = [all, byClass[cls] ||= tally()];
      if (span && at >= span[0] && at <= span[1]) into.push(front);
      for (const b of into) {
        b.n++;
        if (y > fc.demandP90[k]) b.above++; else if (y < fc.demandP10[k]) b.below++; else b.inside++;
      }
    }
  }
  return {all, byClass, front};
}

const pct = b => b.n ? (100 * b.inside / b.n).toFixed(1) + '%' : 'n/a';
const row = (name, b) => '| ' + name + ' | ' + b.n + ' | ' + pct(b) + ' | ' + b.above + ' | ' + b.below + ' |';

function main() {
  const o = parseArgs(process.argv.slice(2)), scn = scenarioOf(o.scenario), out = {};
  for (const h of o.leads) out[h + 'h'] = coverage(scn, o.seeds, h * H);
  if (o.json) { console.log(JSON.stringify({sim: SIM_VERSION, scenario: o.scenario, seeds: o.seeds, leads: out})); return; }
  console.log('# L-2 coverage: ' + o.scenario + ', seeds ' + o.seeds.join('-') + ' (' + SIM_VERSION + ')\n');
  console.log('Realised operational demand inside the forecast\'s P10-P90 (L-2: 80 +- 5%), 15-min intervals.\n');
  for (const [lead, r] of Object.entries(out)) {
    console.log('## Lead ' + lead + '\n\n| intervals | n | inside | above P90 | below P10 |\n|---|---|---|---|---|');
    console.log(row('all', r.all));
    for (const [cls, b] of Object.entries(r.byClass).sort()) console.log(row(cls, b));
    console.log(row('front forecast', r.front) + '\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === FILE) main();
