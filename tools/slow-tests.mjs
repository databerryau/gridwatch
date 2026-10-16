// tools/slow-tests.mjs (REVIEW-2026-10-14 opportunity 16): CLAUDE.md's test budget, measured. Each test file runs alone
// (node:test's run() on that one file, a few files at once), its wall clock is timed and each test's own duration read
// from the runner's events. A file over its budget or holding a test over its budget is run again by itself, with
// nothing beside it, and that second number is the one reported, so files run side by side raise no false alarms.
//
// The budgets are the owner's laptop's (CLAUDE.md: a file 6 s alone, a test 2.5 s). On another machine they are scaled
// by tests/lib/speed.js's CPU yardstick, as D-9's runtime budget is: measured here, against OWNER_YARD_NS measured
// there, so a CI runner half as fast allows twice the seconds and warns about what is slow on the laptop, not about the
// runner (--raw: the budgets as written). The yardstick is read before the run, after it and before each file timed
// again alone, and the fastest reading scales: a busy moment (the owner's laptop runs agents beside the tests) slows a
// reading, and one slow reading must not loosen the budgets and hide an offender. Even so, a file or test within the
// budgets here but over CLAUDE.md's as written is marked "over as written", and the verdict names it. Each offender
// gets a GitHub warning annotation (CI runs this after `node --test`, spec F-10). It only reports: it always exits 0.
// A failing test is `node --test`'s business; here it is only marked, with its first line.
//
// Beside each file's wall clock is its CPU time (the test process's and any it started: a one-line --import hook in
// NODE_OPTIONS writes process.cpuUsage() at exit). A busy machine stretches the wall, not the CPU: a file whose wall is
// well over its CPU was waiting for a core (or on a timer), and the report says when that was common. The budgets are
// judged on the wall, as CLAUDE.md states them.
//
// (Not tools/test-times.mjs: `node --test` with no arguments runs every **/test-*.mjs as a test file.)
//
//   node tools/slow-tests.mjs                          # every tests/*.test.js, 4 at once
//   node tools/slow-tests.mjs -j 2 --top 20            # 2 at once; the slowest 20 files and tests
//   node tools/slow-tests.mjs tests/desk.test.js       # these files only
//   node tools/slow-tests.mjs --json times.json        # also write every file's and test's seconds
//   node tools/slow-tests.mjs --raw                    # no yardstick: the budgets as CLAUDE.md writes them
import {run} from 'node:test';
import {readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join, dirname, relative, resolve, sep, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {availableParallelism, tmpdir} from 'node:os';
import {yardstickNs, OWNER_YARD_NS} from '../tests/lib/speed.js';

/** CLAUDE.md: a test file takes 6 s or less when run alone... */
export const FILE_BUDGET_S = 6;
/** ...and a test 2.5 s or less (on the owner's laptop). */
export const TEST_BUDGET_S = 2.5;
/** A file whose wall clock is over its CPU time by this factor (and a second) waited for the machine. */
export const BUSY_RATIO = 1.5;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => { const r = relative(ROOT, p); return r.startsWith('..') || isAbsolute(r) ? p : r.split(sep).join('/'); };
const samePath = (a, b) => a && b && (sep === '\\' ? a.toLowerCase() === b.toLowerCase() : a === b);

// The CPU hook: each node process started with it writes {pid, ppid, argv, s} to SLOW_TESTS_CPU/<pid>.json at exit.
const HOOK = "import {writeFileSync} from 'node:fs';process.on('exit',()=>{try{const u=process.cpuUsage();" +
  "writeFileSync(process.env.SLOW_TESTS_CPU+'/'+process.pid+'.json',JSON.stringify({pid:process.pid,ppid:process.ppid,argv:process.argv,s:(u.user+u.system)/1e6}))}catch{}})";
let cpuDir = null;
const counted = new Set();   // (the pids already read: a file timed again alone is a new process)
/** Start recording CPU time for the node processes this one starts from now on (the test files and their children). */
function cpuHook() {
  cpuDir = mkdtempSync(join(tmpdir(), 'slow-tests-'));
  process.env.SLOW_TESTS_CPU = cpuDir;
  process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS || '') + ' --import=data:text/javascript,' + encodeURIComponent(HOOK)).trim();
}
/** {cpu: s, procs: n}: the CPU s of the test process for `path` and of every process under it; nulls without the hook. */
function cpuOf(path) {
  const none = {cpu: null, procs: 0};
  if (!cpuDir) return none;
  const ps = [];
  for (const n of readdirSync(cpuDir)) { try { ps.push(JSON.parse(readFileSync(join(cpuDir, n), 'utf8'))); } catch { /* a process still writing */ } }
  const top = ps.find(x => x.ppid === process.pid && !counted.has(x.pid) && samePath(x.argv[1] && resolve(x.argv[1]), path));
  if (!top) return none;
  counted.add(top.pid);
  let s = 0;
  const under = new Set([top.pid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const x of ps) if (!under.has(x.pid) && under.has(x.ppid)) { under.add(x.pid); grew = true; }
  }
  for (const x of ps) if (under.has(x.pid)) s += x.s;
  return {cpu: s, procs: under.size};
}

/** One file alone: {file, wall (s), cpu (s or null), procs, ok, tests: [{name, line, s, ok, error}]}. A test's name carries its suites ("suite > test"). */
export async function timeFile(file) {
  const tests = [], path = [], abs = resolve(ROOT, file);
  let ok = true;
  const t0 = performance.now();
  for await (const ev of run({files: [abs]})) {
    const d = ev.data;
    if (ev.type === 'test:start') { path.length = d.nesting; path.push(d.name); }
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    if (ev.type === 'test:fail') ok = false;
    if (d.details?.type === 'suite') continue;
    const t = {name: [...path.slice(0, d.nesting), d.name].join(' > '), line: d.line ?? 0, s: (d.details?.duration_ms ?? 0) / 1000, ok: ev.type === 'test:pass'};
    if (!t.ok) t.error = String(d.details?.error?.cause?.message ?? d.details?.error?.message ?? '').split('\n')[0];
    tests.push(t);
  }
  return {file, wall: (performance.now() - t0) / 1000, ...cpuOf(abs), ok, tests};
}

/** `files`, at most `jobs` at once, in the order given. */
async function timeAll(files, jobs, onDone) {
  const out = new Array(files.length);
  let next = 0;
  const worker = async () => { while (next < files.length) { const i = next++; out[i] = await timeFile(files[i]); onDone?.(out[i]); } };
  await Promise.all(Array.from({length: Math.min(jobs, files.length)}, worker));
  return out;
}

/** The budgets on this machine: CLAUDE.md's times `scale` (this machine's yardstick ns over the owner's laptop's). */
export const budgets = (scale = 1) => ({file: FILE_BUDGET_S * scale, test: TEST_BUDGET_S * scale, scale});
/** The budgets from the yardstick's readings here (ns): the fastest scales (a busy moment slows a reading, never the machine). */
export const budgetsOf = yards => budgets(Math.min(...yards) / OWNER_YARD_NS);
const over = (r, b) => r.wall > b.file || r.tests.some(t => t.s > b.test);
const busy = r => r.cpu !== null && r.cpu !== undefined && r.wall > BUSY_RATIO * r.cpu + 1;
const sec = s => s.toFixed(1).padStart(6) + ' s';
const fix1 = x => (Math.round(x * 10) / 10).toString();
// GitHub workflow commands: a message escapes %, CR and LF; a property also , and :.
const esc = s => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = s => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

/**
 * The report's lines for timed files `rs`: the slowest `top` files and tests, a verdict, then one GitHub warning per
 * offender. o.b: budgets(scale); o.yard: the yardstick's ns here (null: --raw); o.jobs, o.wall: how the run went.
 */
export function report(rs, {top = 10, jobs = 4, wall = 0, b = budgets(), yard = null} = {}) {
  const tests = rs.flatMap(r => r.tests.map(t => ({...t, file: r.file})));
  const files = [...rs].sort((x, y) => y.wall - x.wall), slow = [...tests].sort((x, y) => y.s - x.s);
  const badFiles = files.filter(r => r.wall > b.file), badTests = slow.filter(t => t.s > b.test), failed = rs.filter(r => !r.ok);
  // within the budgets here but over CLAUDE.md's as written (where the yardstick says this machine is the slower)
  const writtenFile = r => r.wall > FILE_BUDGET_S && r.wall <= b.file, writtenTest = t => t.s > TEST_BUDGET_S && t.s <= b.test;
  const asFiles = files.filter(writtenFile), asTests = slow.filter(writtenTest);
  const mark = (bad, written) => (bad ? '  OVER' : written ? '  over as written' : '');
  const here = b.scale === 1 ? '' : ' here', waited = rs.filter(busy);
  const cpu = r => (r.cpu === null || r.cpu === undefined ? '' : ', cpu ' + r.cpu.toFixed(1) + ' s');
  const lines = [
    'slow-tests: ' + rs.length + ' files, ' + tests.length + ' tests, ' + jobs + ' at once' + (wall ? ', ' + wall.toFixed(1) + ' s wall' : '') +
      ' (the files alone add to ' + rs.reduce((a, r) => a + r.wall, 0).toFixed(1) + ' s)',
    yard === null ? 'Budgets as CLAUDE.md writes them: ' + FILE_BUDGET_S + ' s a file, ' + TEST_BUDGET_S + ' s a test.'
      : 'CPU yardstick ' + yard.toFixed(0) + ' ns here, ' + OWNER_YARD_NS + ' on the owner\'s laptop: the budgets here are ' + fix1(b.file) + ' s a file and ' +
        fix1(b.test) + ' s a test (CLAUDE.md\'s ' + FILE_BUDGET_S + ' and ' + TEST_BUDGET_S + ' there).',
    '', 'Slowest files (budget ' + fix1(b.file) + ' s' + here + '):',
    ...files.slice(0, top).map(r => sec(r.wall) + '  ' + r.file + '  (' + r.tests.length + ' tests' + cpu(r) + ')' + mark(r.wall > b.file, writtenFile(r)) + (r.ok ? '' : '  FAILED')),
    '', 'Slowest tests (budget ' + fix1(b.test) + ' s' + here + '):',
    ...slow.slice(0, top).map(t => sec(t.s) + '  ' + t.file + ':' + t.line + '  ' + t.name + mark(t.s > b.test, writtenTest(t)) + (t.ok ? '' : '  FAILED')),
    '', badFiles.length || badTests.length
      ? 'Over budget: ' + badFiles.length + ' file(s), ' + badTests.length + ' test(s) (each file timed again alone). CLAUDE.md, "The loop": jump the sim between moments.'
      : asFiles.length || asTests.length
        ? 'Within the budgets here, but over CLAUDE.md\'s as written (' + FILE_BUDGET_S + ' s a file, ' + TEST_BUDGET_S + ' s a test): ' + asFiles.length + ' file(s), ' +
          asTests.length + ' test(s) (' + [...asFiles.map(r => r.file + ' ' + r.wall.toFixed(1) + ' s'), ...asTests.map(t => t.file + ':' + t.line + ' ' + t.s.toFixed(1) + ' s')]
          .slice(0, 4).join('; ') + (asFiles.length + asTests.length > 4 ? '; ...' : '') + '). Time them on a quiet machine before calling them within budget.'
        : 'Every file and every test is within budget.',
  ];
  if (waited.length) {
    lines.push('The machine was busy: ' + waited.length + ' of ' + rs.length + ' files took over ' + BUSY_RATIO + 'x their CPU time on the wall (' +
      waited.slice(0, 3).map(r => r.file + ' ' + r.wall.toFixed(1) + ' s, cpu ' + r.cpu.toFixed(1)).join('; ') + (waited.length > 3 ? '; ...' : '') + '). Their walls overstate them.');
  }
  for (const r of failed) {
    const t = r.tests.find(x => !x.ok);
    lines.push('FAILED: ' + r.file + (t ? ': ' + t.name + (t.error ? ': ' + t.error : '') : '') + ' (node --test says why; the times count all the same).');
  }
  const budget = (s, written) => 'the budget is ' + fix1(s) + ' s' + (b.scale === 1 ? ' (CLAUDE.md)' : here + ' (' + written + ' s on the owner\'s laptop, CLAUDE.md)');
  for (const r of badFiles) {
    lines.push('::warning file=' + escProp(r.file) + ',title=Test file over budget::' + esc(r.file + ' took ' + r.wall.toFixed(1) + ' s' + here + ', run alone' +
      cpu(r) + '; ' + budget(b.file, FILE_BUDGET_S) + '.'));
  }
  for (const t of badTests) {
    lines.push('::warning file=' + escProp(t.file) + ',line=' + t.line + ',title=Test over budget::' + esc('"' + t.name + '" took ' + t.s.toFixed(1) + ' s' + here + '; ' +
      budget(b.test, TEST_BUDGET_S) + '. Jump the sim between moments; do not step frames.'));
  }
  return lines;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
  const flag = k => { const i = args.indexOf(k); return i >= 0 && !!args.splice(i, 1); };
  const jobs = Math.max(1, Math.floor(+opt('-j', Math.min(4, availableParallelism()))) || 1);
  const top = +opt('--top', 10), json = opt('--json', null), raw = flag('--raw');
  const files = args.length ? args.map(f => rel(resolve(process.cwd(), f)))
    : readdirSync(join(ROOT, 'tests')).filter(n => n.endsWith('.test.js')).sort().map(n => 'tests/' + n);
  try {
    // the yardstick first, with nothing beside it (a reading is the fastest of 7 runs), again after the run and before
    // each file timed again alone: the fastest reading of them all scales the budgets
    const yards = raw ? [] : [yardstickNs()], budgetsNow = () => (raw ? budgets() : budgetsOf(yards));
    cpuHook();
    const t0 = performance.now();
    let done = 0;
    const rs = await timeAll(files, jobs, () => { if (process.stderr.isTTY) process.stderr.write('\rslow-tests: ' + ++done + '/' + files.length + ' '); });
    const wall = (performance.now() - t0) / 1000;
    if (process.stderr.isTTY) process.stderr.write('\n');
    if (!raw) yards.push(yardstickNs());
    // An offender is timed again with nothing beside it: the budget is for a file run alone (a reading on the way may
    // tighten the budgets: a file then over them is timed again too)
    for (const alone = new Set(); jobs > 1;) {
      const i = rs.findIndex((r, k) => !alone.has(k) && over(r, budgetsNow()));
      if (i < 0) break;
      if (!raw) yards.push(yardstickNs());
      rs[i] = await timeFile(rs[i].file);
      alone.add(i);
    }
    const b = budgetsNow(), yard = raw ? null : Math.min(...yards);
    console.log(report(rs, {top, jobs, wall, b, yard}).join('\n'));
    if (json) writeFileSync(json, JSON.stringify({wall, jobs, yard, yards, budgets: b, files: rs}, null, 1));
  } catch (e) {
    console.log('::warning title=slow-tests could not time the tests::' + esc(String((e && e.stack) || e)));   // (it only reports)
  } finally {
    if (cpuDir) rmSync(cpuDir, {recursive: true, force: true});
  }
  process.exitCode = 0;
}
