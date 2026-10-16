// tools/slow-tests.mjs (REVIEW-2026-10-14 opportunity 16): CLAUDE.md's test budget, measured. The report's lines and
// GitHub warnings from made-up timings; then the tool itself, once, on a little test file of its own (a suite, a
// failing test, a child process): the names, lines and times read from node:test's events, the CPU time of the file's
// process and its child, the failure marked with its first line, and exit 0.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {report, budgets, FILE_BUDGET_S, TEST_BUDGET_S} from '../tools/slow-tests.mjs';

const TOOL = fileURLToPath(new URL('../tools/slow-tests.mjs', import.meta.url));
const warnings = lines => lines.filter(l => l.startsWith('::warning '));

test('the budgets are CLAUDE.md\'s (6 s a file alone, 2.5 s a test), scaled by the CPU yardstick on another machine', () => {
  const md = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
  assert.match(md, /a test file takes 6 s or less when run alone, and a test 2\.5 s or less/);
  assert.deepEqual([FILE_BUDGET_S, TEST_BUDGET_S], [6, 2.5]);
  assert.deepEqual(budgets(1.5), {file: 9, test: 3.75, scale: 1.5});
});

test('report: the slowest first, OVER past the budget, FAILED named with its first line; a busy machine said; one GitHub warning per offender, escaped', () => {
  const rs = [
    {file: 'tests/b.test.js', wall: 0.4, cpu: 0.3, ok: false, tests: [{name: 'broken', line: 5, s: 0.2, ok: false, error: 'Expected values to be equal:'}]},
    {file: 'tests/a.test.js', wall: 7.2, cpu: 6.9, ok: true, tests: [{name: 'a day > 50% of it,\nplayed', line: 12, s: 3.1, ok: true}, {name: 'quick', line: 30, s: 0.1, ok: true}]},
  ];
  const lines = report(rs, {top: 2, jobs: 2, wall: 7.5});
  assert.match(lines[0], /^slow-tests: 2 files, 3 tests, 2 at once, 7\.5 s wall \(the files alone add to 7\.6 s\)$/);
  assert.equal(lines[1], 'Budgets as CLAUDE.md writes them: 6 s a file, 2.5 s a test.');
  const files = lines.slice(lines.indexOf('Slowest files (budget 6 s):') + 1, lines.indexOf('Slowest files (budget 6 s):') + 3);
  assert.deepEqual(files, ['   7.2 s  tests/a.test.js  (2 tests, cpu 6.9 s)  OVER', '   0.4 s  tests/b.test.js  (1 tests, cpu 0.3 s)  FAILED']);
  const tests = lines.slice(lines.indexOf('Slowest tests (budget 2.5 s):') + 1, lines.indexOf('Slowest tests (budget 2.5 s):') + 3);
  assert.deepEqual(tests, ['   3.1 s  tests/a.test.js:12  a day > 50% of it,\nplayed  OVER', '   0.2 s  tests/b.test.js:5  broken  FAILED'], 'the top 2 only');
  assert.ok(lines.includes('FAILED: tests/b.test.js: broken: Expected values to be equal: (node --test says why; the times count all the same).'));
  assert.ok(!lines.some(l => l.startsWith('The machine was busy')), 'each wall is near its CPU time');
  assert.deepEqual(warnings(lines), [
    '::warning file=tests/a.test.js,title=Test file over budget::tests/a.test.js took 7.2 s, run alone, cpu 6.9 s; the budget is 6 s (CLAUDE.md).',
    '::warning file=tests/a.test.js,line=12,title=Test over budget::"a day > 50%25 of it,%0Aplayed" took 3.1 s; the budget is 2.5 s (CLAUDE.md). Jump the sim between moments; do not step frames.',
  ]);
  // on a machine half as fast as the owner's laptop by the yardstick, 7.2 s and 3.1 s are within its budgets
  const slow = report(rs, {b: budgets(1.5), yard: 105});
  assert.match(slow[1], /^CPU yardstick 105 ns here, 70 on the owner's laptop: the budgets here are 9 s a file and 3\.8 s a test/);
  assert.deepEqual(warnings(slow), []);
  assert.ok(slow.includes('Every file and every test is within budget.'));
  // and on one twice as fast, the 7.2-s file is over its 3 s
  assert.equal(warnings(report(rs, {b: budgets(0.5), yard: 35}))[0], '::warning file=tests/a.test.js,title=Test file over budget::tests/a.test.js took 7.2 s here, ' +
    'run alone, cpu 6.9 s; the budget is 3 s here (6 s on the owner\'s laptop, CLAUDE.md).');
  // a wall far over its CPU time: the file waited for a core, and the report says the walls overstate
  const waited = report([{...rs[1], wall: 16, cpu: 6.9}, {file: 'tests/c.test.js', wall: 1, cpu: null, ok: true, tests: []}]);
  assert.ok(waited.includes('The machine was busy: 1 of 2 files took over 1.5x their CPU time on the wall (tests/a.test.js 16.0 s, cpu 6.9). Their walls overstate them.'), waited.join('\n'));
  assert.ok(waited.includes('   1.0 s  tests/c.test.js  (0 tests)'), 'no CPU time read: none shown');
});

test('the tool on a file of its own: "suite > test" names, lines and times from node:test\'s events; its CPU time with its child\'s; a failing test marked; exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slow-tests-')), f = join(dir, 'x.test.js'), out = join(dir, 'out.json');
  try {
    // (a suite's test waits 60 ms on a timer; the other starts a node process that burns 0.4 s of CPU, then fails)
    writeFileSync(f, "import {test, describe} from 'node:test';\nimport {spawnSync} from 'node:child_process';\n" +
      "describe('a suite', () => { test('waits', async () => { await new Promise(r => setTimeout(r, 60)); }); });\n" +
      "test('fails', () => { spawnSync(process.execPath, ['-e', 'const t = Date.now(); while (Date.now() - t < 400);']); throw new Error('on purpose\\nsecond line'); });\n");
    const env = {...process.env};
    delete env.NODE_TEST_CONTEXT;   // (node:test's run() runs nothing inside a test process; the tool is its own)
    const r = spawnSync(process.execPath, [TOOL, '--raw', '-j', '1', '--json', out, f], {encoding: 'utf8', env});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^FAILED: .*x\.test\.js: fails: on purpose \(node --test says why/m);
    const j = JSON.parse(readFileSync(out, 'utf8')), x = j.files[0];
    assert.deepEqual([j.files.length, x.ok, x.tests.map(t => [t.name, t.line, t.ok])], [1, false, [['a suite > waits', 3, true], ['fails', 4, false]]]);
    assert.ok(x.tests[0].s >= 0.05 && x.tests[0].s < 2 && x.wall >= x.tests[0].s, JSON.stringify(x));
    assert.ok(x.procs === 2 && x.cpu >= 0.4 && x.cpu < x.wall + 1, 'the file\'s process and its child, 0.4 s of CPU: ' + JSON.stringify(x));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
