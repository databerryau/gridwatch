// Exit Phase 0 / F-12 for the v4 core: tools/baseline-v4.js prints the SPEC.md §6 rows the v4
// core can measure, and tools/baseline-v4.golden.md is its committed output. Every section 3 row
// depends only on its seed, so this test is a cheap regression guard on one of them: it plays
// par's day on seed 4 (the heat day: RERT armed, load shed) in this process, through the bench's
// harness as the tool does (app/assist.js), and compares the row's columns that the day itself
// fixes, its end-of-day hashState among them, with the golden. The whole report (section 1's fixed
// probes, the statistics over 200 seeds) is the tool's: `npm run baseline:v4` prints it on demand.
// An intentional behaviour change re-records the golden (`npm run golden:v4`, about 5 min on 11
// worker processes) in the same commit, with a one-line reason.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState, step, observe, hashState} from '../sim/step.js';
import {createAssist, assistInputs} from '../app/assist.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';

const SEED = 4;
const RERECORD = 'if the change is intended, run `npm run golden:v4` and give the reason in the commit message';

/** Section 3.1's row for `seed` (par, raw seeds), as cells by column name. */
function goldenRow(seed) {
  const lines = readFileSync(new URL('../tools/baseline-v4.golden.md', import.meta.url), 'utf8').replace(/\r/g, '').split('\n');
  const from = lines.indexOf('### 3.1 Par, raw seeds');
  assert.ok(from >= 0, 'the golden has section 3.1');
  const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
  const head = cells(lines.find((l, i) => i > from && l.startsWith('| seed |')));
  const row = lines.find((l, i) => i > from && l.startsWith('| ' + seed + ' |'));
  assert.ok(row, 'the golden has a section 3.1 row for seed ' + seed);
  return Object.fromEntries(cells(row).map((c, i) => [head[i], c]));
}

// The tool's number formats (tools/baseline-v4.js: fix, num, int, hex).
const fix = (x, d) => { const s = x.toFixed(d); return /^-0\.?0*$/.test(s) ? s.slice(1) : s; };
const commas = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const num = (x, d) => { const [i, f] = fix(x, d).replace(/^-/, '−').split('.'); return commas(i) + (f ? '.' + f : ''); };
const int = x => { const s = fix(x, 0); return s[0] === '-' ? '−' + commas(s.slice(1)) : commas(s); };
const hex = h => '0x' + (h >>> 0).toString(16).padStart(8, '0');

test('v4 baseline: par\'s day on seed 4 gives section 3.1\'s row of tools/baseline-v4.golden.md (class, shed, RERT, DR, cost, carbon, trips, 19:00 price, end-of-day hash)', () => {
  const g = goldenRow(SEED);
  const state = createState(SEED, CLASSIC), a = createAssist('par');
  const T19 = (19 - V.DAY_START_H) * V.S_PER_H * V.TICKS_PER_S + 1; // just after the 19:00:00 grid update, as the tool reads it
  let p19 = null;
  while (!state.over) {
    const inputs = assistInputs(a, state);
    assert.equal(a.error, '', 'par\'s harness');
    step(state, inputs);
    if (state.tick === T19) p19 = state.price.mwh;
  }
  const sc = observe(state).score;
  const got = {
    class: state.ext.regime.cls,
    black: state.black ? g.black : '', // the tool prints BLACK and the time; not black is an empty cell
    unserved: num(sc.unservedMWh, 1), UFLS: num(sc.uflsMWh, 1), directed: num(sc.directedMWh, 1),
    RERT: state.log.some(x => x.type === 'armRERT') ? 'yes' : '', DR: String(state.log.filter(x => x.type === 'callDR').length),
    '¢': fix(sc.centsPerKWh, 3), t: fix(sc.co2tPerMWh, 3), trips: String(state.conts.length),
    '19:00': p19 === null ? '-' : int(p19), hash: hex(hashState(state)),
  };
  assert.equal(state.black, g.black !== '', 'black: ' + RERECORD);
  for (const k of Object.keys(got)) assert.equal(got[k], g[k], 'seed ' + SEED + ', column ' + k + ': ' + RERECORD);
});
