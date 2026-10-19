// W7 (Q15): tools/verify.mjs, the verify run that restamps the dailies' four files when a build moves nothing they store. Its pure
// parts: what it counts as a difference (a date's par, D-9 gate, D-29 incident, class and scripted players against the stored
// ladder row; a selftest case against its golden values) and the restamp, through each file's own writer, which must give back the
// shipped file byte for byte and then change nothing but the stamp. No day is played here (the run itself is a tool: npm run verify).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DAILIES} from '../content/dailies.js';
import {LADDER} from '../content/ladder.js';
import {SELFTEST} from '../content/selftest.js';
import {GATED} from '../content/anniversaries.js';
import {ladderText} from '../tools/ladder.mjs';
import {selftestText} from '../tools/selftest-gen.mjs';
import {dateDiffs, caseDiffs, restamped, regeneration, restampAdvice, datesOf} from '../tools/verify.mjs';

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

test('Q15: a selftest case matches its golden values; a moved hash names the first hour, a moved par its ALL-IN', () => {
  const [par] = SELFTEST.cases, same = {tick: par.tick, hash: par.hash, hashes: par.hashes.slice(), total: par.total};
  assert.deepEqual(caseDiffs(par, same, 'p'), []);
  const moved = Object.assign({}, same, {hashes: same.hashes.map((h, i) => (i >= 9 ? h ^ 1 : h)), hash: same.hash ^ 1, total: same.total + 5});
  assert.deepEqual(caseDiffs(par, moved, 'p').map(d => d.field), ['hash at 14:00 (the first hour that differs)', 'hash at the end', 'par ALL-IN $']);
  assert.deepEqual(caseDiffs(par, Object.assign({}, same, {tick: 100, hashes: same.hashes.slice(0, 3)}), 'p').map(d => d.field), ['tick', 'hourly hashes']);
});

test('Q15: the restamp goes through each file\'s own writer, which gives back the shipped file; the new text differs by the stamp alone', () => {
  assert.deepEqual(restamped(LISTS, DAILIES.v, read, WRITERS), [], 'nothing to write under the stamp the files carry');
  const stamp = 'v4-core-test|1|2', out = restamped(LISTS, stamp, read, WRITERS);
  assert.deepEqual(out.map(f => f.path), ['content/dailies.js', 'content/ladder.js', 'content/anniversaries.js', 'content/selftest.js']);
  for (const f of out) {
    assert.equal(f.was, read(f.path));
    assert.equal(f.text.split(stamp).length - 1, 1, f.path + ': the stamp once');
    assert.equal(f.text.replace(stamp, f.v), f.was, f.path + ': nothing but the stamp');
  }
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
