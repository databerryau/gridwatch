// Exit Phase 0 / F-12 for the v4 core: tools/baseline-v4.js prints the SPEC.md §6 rows the v4
// core can measure, and tools/baseline-v4.golden.md is its committed output. The default run
// re-runs the quick report (section 1 and par on seeds 1-2, ~10 s in its own process) and
// compares its deterministic lines with the golden: every section 1 line, and each section 3
// row it prints (a row depends only on its seed). With GRIDWATCH_SLOW=1 the full report's
// sections 0-3 must equal the golden. Section 4 and the Build line vary by machine and build.
// An intentional behaviour change re-records the golden (`npm run golden:v4`, about 5 min on 11
// worker processes) in the same commit, with a one-line reason.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {slowOnly} from './lib/sim-helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const golden = () => readFileSync(new URL('../tools/baseline-v4.golden.md', import.meta.url), 'utf8');
// The child has its own time limit: a synchronous call blocks node:test's timeout (F-10: < 60 s).
const run = (args, timeout) => execFileSync(process.execPath, ['tools/baseline-v4.js', ...args],
  {cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout});

/** Lines by section number (0 = the header), without blank lines, the Build line or section 4. */
function sections(report) {
  const out = {0: []};
  let cur = 0;
  for (const line of report.replace(/\r/g, '').split('\n')) {
    const m = /^## (\d+)\./.exec(line);
    if (m) { cur = Number(m[1]); out[cur] = []; continue; }
    if (line.trim() === '' || line.startsWith('Build: ')) continue;
    out[cur].push(line);
  }
  delete out[4];
  return out;
}

const seedRows = lines => lines.filter(l => /^\| \d+ \|/.test(l));
const RERECORD = 'if the change is intended, run `npm run golden:v4` and give the reason in the commit message';

test('v4 baseline (quick): section 1 and the per-seed rows it re-runs equal tools/baseline-v4.golden.md', () => {
  const g = sections(golden()), q = sections(run(['--quick'], 55_000));
  assert.deepEqual(q[1], g[1], 'section 1 changed: ' + RERECORD);
  const want = new Set(seedRows(g[3]));
  const rows = seedRows(q[3]);
  assert.equal(rows.length, 2, 'the quick run prints par on seeds 1-2');
  for (const r of rows) assert.ok(want.has(r), 'this section 3 row is not in the golden (' + RERECORD + '):\n' + r);
});

test('v4 baseline (full): sections 0-3 equal tools/baseline-v4.golden.md', slowOnly(), () => {
  const g = sections(golden()), f = sections(run([], 3_600_000));
  for (const k of [0, 1, 2, 3]) assert.deepEqual(f[k], g[k], 'section ' + k + ': ' + RERECORD);
});
