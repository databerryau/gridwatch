// W7 (Q15): tools/verify.mjs, the verify run that restamps the dailies' four files when a build moves nothing they store. Its pure
// parts: what it counts as a difference (a date's par, D-9 gate, D-29 incident, class and scripted players against the stored
// ladder row; a selftest case against its golden values, its hashes taken under the version they were made with: state.v is in
// every hash) and the restamp, through each file's own writer, which must give back the shipped file byte for byte and then change
// only the stamp and the version's hashes. No day is played here (the run itself is a tool: npm run verify).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createState, hashState} from '../sim/step.js';
import {SIM_VERSION} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import {DAILIES} from '../content/dailies.js';
import {LADDER} from '../content/ladder.js';
import {SELFTEST} from '../content/selftest.js';
import {GATED} from '../content/anniversaries.js';
import {ladderText} from '../tools/ladder.mjs';
import {selftestText} from '../tools/selftest-gen.mjs';
import {dateDiffs, caseDiffs, restamped, regeneration, restampAdvice, datesOf, hashBoth} from '../tools/verify.mjs';

const DG = createRequire(import.meta.url)('../tools/daily-gen.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const WRITERS = {writeList: DG.writeList, writeGated: DG.writeGated, ladderText, selftestText};
const LISTS = {DAILIES, LADDER, GATED, SELFTEST};
// A replayed date as tools/verify.mjs verifyDate gives it: par's row matching 20261016's stored one, the gate passed
const ROW = LADDER.rows[20261016];
const got = o => Object.assign({ymd: 20261016, seed: 20261016, k: 0, par: ROW.slice(0, 2), shortMin: 0, clean: true, pass: true, incident: true,
  cls: 'HOT|heat', cls0: 'HOT|heat'}, o);

test('Q15: a replayed date matches its stored row; each field that moved is named with the stored value and the new one', () => {
  assert.deepEqual(dateDiffs(got(), ROW), []);
  assert.deepEqual(dateDiffs(got({players: ROW.slice(2)}), ROW), [], 'the scripted players, on a sampled date');
  assert.deepEqual(dateDiffs(got({par: [ROW[0] + 1, ROW[1]]}), ROW), [{at: '2026-10-16', field: 'par ALL-IN $', stored: ROW[0], got: ROW[0] + 1}]);
  assert.deepEqual(dateDiffs(got({par: [ROW[0], 2.5]}), ROW).map(d => d.field), ['par shed MWh']);
  assert.deepEqual(dateDiffs(got({players: [ROW[2], ROW[3] - 7, ROW[4]]}), ROW).map(d => [d.field, d.got]), [['lean $', ROW[3] - 7]]);
  assert.deepEqual(dateDiffs(got({par: null, pass: false, clean: false}), ROW).map(d => d.field), ['par (null: black)', 'D-9 gate'], 'par went black');
  assert.deepEqual(dateDiffs(got({par: null, pass: false, clean: false}), null).map(d => d.field), ['D-9 gate'], 'stored black, still black: only the gate');
  assert.deepEqual(dateDiffs(got({pass: false, shortMin: 3}), ROW).map(d => [d.field, d.got]), [['D-9 gate', '3 min below the bound']]);
  assert.deepEqual(dateDiffs(got({incident: false}), ROW).map(d => d.field), ['D-29 incident']);
  assert.deepEqual(dateDiffs(got({k: 2, cls: 'MILD|calm'}), ROW).map(d => [d.field, d.stored, d.got]), [['class of attempt 2', 'HOT|heat', 'MILD|calm']]);
  assert.deepEqual(dateDiffs(got(), undefined).map(d => d.field), ['ladder row'], 'a date with no row');
});

test('Q15: a state\'s hash covers SIM_VERSION (state.v): hashBoth takes it as this build makes it and under the golden\'s version', () => {
  const st = createState(20261016, DESK), now = hashState(st) >>> 0;
  assert.deepEqual(hashBoth(hashState, st, SIM_VERSION), [now, now], 'the same version: one hash');
  const [a, b] = hashBoth(hashState, st, 'v4-core-older');
  assert.equal(a, now);
  assert.notEqual(b, now, 'another version, another hash');
  assert.equal(st.v, SIM_VERSION, 'the state is given back as it was');
  st.v = 'v4-core-older';
  assert.equal(hashState(st) >>> 0, b, 'the older build\'s hash of the same state');
});

test('Q15: a selftest case matches its golden values under their version; a moved hash names the first hour, a moved par its ALL-IN', () => {
  const [par] = SELFTEST.cases, was = {hash: par.hash, hashes: par.hashes.slice()};
  const same = {tick: par.tick, hash: 1, hashes: par.hashes.map(() => 1), was, total: par.total};
  assert.deepEqual(caseDiffs(par, same, 'p'), [], 'this build\'s own hashes are not compared: those under the golden\'s version are');
  const moved = Object.assign({}, same, {was: {hashes: was.hashes.map((h, i) => (i >= 9 ? h ^ 1 : h)), hash: was.hash ^ 1}, total: same.total + 5});
  assert.deepEqual(caseDiffs(par, moved, 'p').map(d => d.field), ['hash at 14:00 (the first hour that differs)', 'hash at the end', 'par ALL-IN $']);
  assert.deepEqual(caseDiffs(par, Object.assign({}, same, {tick: 100, was: {hash: was.hash, hashes: was.hashes.slice(0, 3)}}), 'p').map(d => d.field), ['tick', 'hourly hashes']);
});

test('Q15: the restamp goes through each file\'s own writer, which gives back the shipped file; only the stamp and the version\'s hashes change', () => {
  assert.deepEqual(restamped(LISTS, DAILIES.v, read, WRITERS), [], 'nothing to write under the stamp the files carry');
  const stamp = 'v4-core-test|1|2', out = restamped(LISTS, stamp, read, WRITERS);
  assert.deepEqual(out.map(f => f.path), ['content/dailies.js', 'content/ladder.js', 'content/anniversaries.js', 'content/selftest.js']);
  for (const f of out) {
    assert.equal(f.was, read(f.path));
    assert.equal(f.text.split(stamp).length - 1, 1, f.path + ': the stamp once');
    assert.equal(f.text.replace(stamp, f.v), f.was, f.path + ': nothing but the stamp');
  }
  // a new SIM_VERSION: the selftest's hashes and the ladder's check are this build's (verified under the old version by the run)
  const fresh = {cases: SELFTEST.cases.map((c, i) => ({hash: i + 1, hashes: c.hashes.map(() => 7)})), check: 99};
  const v2 = restamped(LISTS, stamp, read, WRITERS, fresh), text = p => v2.find(f => f.path === p).text;
  assert.match(text('content/ladder.js'), /check: \{"ymd":\d+,"tick":\d+,"hash":99\}/);
  assert.equal(text('content/ladder.js').replace(stamp, LADDER.v).replace('"hash":99}', '"hash":' + LADDER.check.hash + '}'), read('content/ladder.js'));
  assert.match(text('content/selftest.js'), /^ {2}\{"kind":"par","ymd":\d+,"seed":\d+,"scenarioId":"desk","tick":\d+,"hash":1,"hashes":\[7,7,/m);
  // a file edited by hand (here a stored par) is refused: the verify never writes over what its writer would not have written
  const edited = p => (p === 'content/ladder.js' ? read(p).replace('20261016: [14749198', '20261016: [14749199') : read(p));
  assert.throws(() => restamped(LISTS, stamp, edited, WRITERS), /content\/ladder\.js is not as its writer writes it/);
});

test('Q15: the advice names the verify first and the full regeneration second, over the shipped calendar', () => {
  assert.equal(datesOf(DAILIES.from, DAILIES.to).length, Math.round((Date.parse(DAILIES.to) - Date.parse(DAILIES.from)) / 864e5) + 1);
  assert.deepEqual(datesOf('2026-12-30', '2027-01-02'), [20261230, 20261231, 20270101, 20270102]);
  const days = datesOf(DAILIES.from, DAILIES.to).length;
  assert.match(regeneration(DAILIES.from, DAILIES.to)[0], new RegExp('^node tools/daily-gen\\.js --from ' + DAILIES.from + ' --days ' + days + ' -j 8 '));
  const a = restampAdvice(DAILIES.from, DAILIES.to);
  assert.ok(a.indexOf('npm run verify') < a.indexOf('daily-gen.js') && a.indexOf('daily-gen.js') < a.indexOf('ladder.mjs') && a.indexOf('ladder.mjs') < a.indexOf('selftest-gen.mjs'), a);
});
