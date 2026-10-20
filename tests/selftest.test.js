// W6 (risk 5): index.html?selftest, the golden-run check each browser passes before a release. content/selftest.js
// (tools/selftest-gen.mjs) holds what Node worked out for this build: par's day on two dailies to its end (the hash each hour,
// and its ALL-IN, which must be the stored par of content/ladder.js), the page's no-input day to 14:00 (the ladder's check)
// and two scripted players' input logs to a checkpoint. The file carries the dailies' build stamp, so a stale one cannot
// merge; and the page's own runner plays the cases here, in the stand-in DOM, to a checkpoint (par and the no-input day to
// 06:00, not whole days: CLAUDE.md's 2.5 s a test). ?selftest is routed before the phone's landing page.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {V, SIM_VERSION} from '../sim/params.js';
import * as G from '../app/game.js';
import {SELFTEST} from '../content/selftest.js';
import {LADDER} from '../content/ladder.js';
import {DAILIES, dailyFor} from '../content/dailies.js';
import {showSelftest, runCases, judge, summaryLine, browserOf, caseName} from '../app/selftest.js';
import {selftestText} from '../tools/selftest-gen.mjs';
import {restampAdvice} from '../tools/verify.mjs';
import {start} from '../app/start.js';
import {makeDocument} from './lib/dom.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOUR = V.S_PER_H * V.TICKS_PER_S, AT_06 = 2 * HOUR;
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const kind = k => SELFTEST.cases.filter(c => c.kind === k);
// A stand-in window on index.html: its viewport, address, user agent and clipboard
function win({w = 1920, h = 1080, coarse = false, search = '?selftest', clip = null} = {}) {
  const q = {'(pointer: coarse)': coarse, '(any-pointer: fine)': !coarse};
  return {innerWidth: w, innerHeight: h, matchMedia: s => ({matches: !!q[s]}), location: {search}, navigator: {userAgent: FIREFOX, clipboard: clip},
    performance, setTimeout, MessageChannel, document: makeDocument(readFileSync(join(ROOT, 'index.html'), 'utf8'))};
}

test('risk 5: the golden file is this build\'s; par\'s totals are the stored par; the no-input day is the ladder\'s check', () => {
  assert.equal(SELFTEST.v, G.dailyStamp(), 'content/selftest.js is stale: ' + restampAdvice(DAILIES.from, DAILIES.to));
  assert.equal(selftestText(SELFTEST), readFileSync(join(ROOT, 'content', 'selftest.js'), 'utf8'), 'tools/selftest-gen.mjs writes the file back as it reads (W7 Q15: the restamp)');
  assert.equal(kind('par').length, 2);
  assert.equal(kind('nothing').length, 1);
  assert.ok(kind('replay').length >= 1);
  for (const c of SELFTEST.cases) {
    const d = dailyFor(c.ymd, G.dailyStamp());
    assert.deepEqual([c.seed, c.scenarioId], [d.seed, d.scenarioId], caseName(c) + ' is its date\'s daily');
  }
  assert.deepEqual(new Set(kind('par').map(c => c.scenarioId)), new Set(['desk', 'desk-weekend']), 'a weekday and a weekend');
  for (const c of kind('par')) {
    assert.equal(c.total, LADDER.rows[c.ymd][0], caseName(c) + ': the stored par (F-8)');
    assert.equal(c.tick, V.DAY_TICKS, 'to the day\'s end');
    assert.deepEqual([c.hashes.length, c.hashes[23]], [24, c.hash], 'each hour, and the end');
  }
  const [n] = kind('nothing');
  assert.deepEqual({ymd: n.ymd, tick: n.tick, hash: n.hash}, LADDER.check, 'the ladder\'s check (tools/ladder.mjs nothingCheck)');
  for (const c of kind('replay')) {
    assert.ok(c.log.length >= 5 && c.log.every((r, i) => r.tick < c.tick && (i === 0 || r.tick >= c.log[i - 1].tick)), caseName(c) + ': a sorted log before its checkpoint');
    assert.ok(c.tick <= 7 * HOUR, caseName(c) + ': the page replays it in one call, so its checkpoint stays early (11:00 at the latest)');
  }
});

test('risk 5: the page, headless: par and the no-input day to 06:00 match the golden hours; it shows the browser, the stamp and a line to COPY', async () => {
  let copied = '';
  const w = win({clip: {writeText: async t => { copied = t; }}}), doc = w.document;
  const {root, done} = showSelftest(doc, w, {golden: {v: SELFTEST.v, cases: [kind('par')[0], ...kind('nothing')]}, upTo: AT_06});
  assert.ok(doc.body.classList.contains('selftest'), 'the game\'s markup is hidden');
  assert.equal(doc.getElementById('selftest-line').parentElement.hidden, true, 'no line before the runs are done');
  const results = await done;
  assert.deepEqual(results.map(r => [r.name, r.pass, r.note]), [
    ['par Fri 16 Oct', true, '2 of 24 hours match (stopped at 06:00)'],
    ['no input Mon 12 Oct', true, '2 of 10 hours match (stopped at 06:00)']]);
  assert.deepEqual(doc.getElementById('selftest-rows').querySelectorAll('td.st').map(td => td.textContent), ['PASS', 'PASS']);
  assert.match(root.textContent, /Par's day, Fri 16 Oct \(HEATWAVE\), to its end/);
  assert.equal(doc.getElementById('selftest-env').textContent, 'Firefox 131 on Windows · SIM_VERSION ' + SIM_VERSION + ' · stamp ' + G.dailyStamp());
  assert.equal(doc.getElementById('selftest-progress').value, 1);
  assert.match(doc.getElementById('selftest-now').textContent, /^Done in \d+\.\d s: 2 of 2 pass\.$/);
  const line = doc.getElementById('selftest-line').textContent;
  assert.match(line, /^GRIDWATCH selftest \d{4}-\d\d-\d\d: PASS 2\/2 · Firefox 131 on Windows · v4-core-[^ ]+ · \d+\.\d s$/);
  doc.getElementById('selftest-copy').click();
  await new Promise(r => setImmediate(r));
  assert.equal(copied, line);
  assert.equal(doc.getElementById('selftest-copy').textContent, 'COPIED');
});

test('risk 5: the weekend\'s par to 06:00 matches the golden hours', async () => {
  const [r] = await runCases({v: SELFTEST.v, cases: [kind('par')[1]]}, {upTo: AT_06});
  assert.deepEqual([r.name, r.pass, r.note], ['par Sat 31 Oct', true, '2 of 24 hours match (stopped at 06:00)']);
});

for (const c of kind('replay')) {
  test('risk 5: ' + caseName(c) + ': the scripted player\'s log replays through sim/step.js replay to its checkpoint\'s hash', async () => {
    const [r] = await runCases({v: SELFTEST.v, cases: [c]});
    assert.deepEqual([r.pass, r.why], [true, []]);
    assert.match(r.note, /^the hash at \d\d:\d\d matches$/);
  });
}

test('risk 5: a FAIL names the first hour whose hash differs, an ALL-IN off the stored par, a day that ended early; stale golden values play nothing', async () => {
  const [par] = kind('par'), [rep] = kind('replay'), got = {tick: par.tick, hashes: par.hashes.slice(), hash: par.hash, total: par.total};
  assert.deepEqual(judge(par, got), {pass: true, why: [], note: '24 of 24 hours match; ALL-IN $14,749,198, the stored par'});
  assert.deepEqual(judge(par, Object.assign({}, got, {hashes: got.hashes.map((h, i) => (i >= 8 ? h ^ 1 : h)), hash: got.hash ^ 1})).why,
    ['the hash first differs at 13:00']);
  assert.deepEqual(judge(par, Object.assign({}, got, {hash: got.hash ^ 1})).why, ['the hash differs at 04:00']);
  assert.deepEqual(judge(par, Object.assign({}, got, {total: got.total + 3})).why, ['ALL-IN $14,749,201, the stored par is $14,749,198']);
  assert.deepEqual(judge(par, Object.assign({}, got, {tick: 3e6, hashes: got.hashes.slice(0, 16)})).why, ['the day ended at 20:40, not 04:00']);
  // drift that blacks the grid early: the hour where the numbers split still comes first (it is what the line to copy says)
  const split = (c, k, n) => c.hashes.slice(0, n).map((h, i) => (i >= k ? h ^ 1 : h));
  const blacked = Object.assign({}, got, {tick: 8.5 * HOUR, hashes: split(par, 1, 8), hash: 1, total: 5});
  assert.deepEqual(judge(par, blacked).why, ['the hash first differs at 06:00', 'the day ended at 12:30, not 04:00', 'ALL-IN $5, the stored par is $14,749,198']);
  assert.match(summaryLine([Object.assign({name: caseName(par)}, judge(par, blacked))], {ymd: 20261016, browser: 'B', stamp: 'S', ms: 1}),
    /: FAIL 0\/1 \(par Fri 16 Oct: the hash first differs at 06:00\) · /);
  const [none] = kind('nothing');
  assert.deepEqual(judge(none, {tick: 9 * HOUR, hashes: split(none, 2, 9), hash: 1}).why, ['the hash first differs at 07:00', 'the day ended at 13:00, not 14:00']);
  assert.deepEqual(judge(par, got, Infinity, {v: 'another build', rows: {}}).why, ['no stored par for this date (content/ladder.js is another build\'s)']);
  assert.deepEqual(judge(rep, {tick: rep.tick, hashes: [], hash: rep.hash ^ 1}).why, ['the hash differs at 08:00']);
  // golden values from another build: every case fails at once, and says how to make them again
  const t0 = Date.now(), stale = await runCases({v: 'another build', cases: SELFTEST.cases});
  assert.ok(Date.now() - t0 < 200 && stale.every(r => !r.pass && /node tools\/selftest-gen\.mjs/.test(r.why[0])));
  assert.equal(summaryLine([{pass: true, name: 'par Fri 16 Oct', why: []}, {pass: false, name: 'replay Sun 25 Oct', why: ['the hash differs at 10:15', 'x']}],
    {ymd: 20261016, browser: 'Edge 141 on Windows', stamp: 'S', ms: 12345}),
  'GRIDWATCH selftest 2026-10-16: FAIL 1/2 (replay Sun 25 Oct: the hash differs at 10:15) · Edge 141 on Windows · S · 12.3 s');
});

test('risk 5: ?selftest is routed before the landing check (a phone too) and loads its page on demand, never the game', async () => {
  let loads = 0, shown = null;
  const w = win({w: 390, h: 844, coarse: true});
  assert.equal(start(w, () => { loads++; }, async () => ({showSelftest: (doc, x) => { shown = [doc, x]; }})), 'selftest');
  await new Promise(r => setImmediate(r));
  assert.deepEqual([loads, shown], [0, [w.document, w]]);
  assert.equal(start(win({search: '?play&selftest'}), () => { loads++; }, async () => ({showSelftest() {}})), 'selftest');
  assert.equal(start(win({search: '?selftests'}), () => { loads++; }), 'game', 'only ?selftest itself');
  assert.equal(loads, 1);
  // a page that does not load says so, in place of the game's empty desk
  const off = win();
  start(off, () => { loads++; }, () => Promise.reject(new Error('offline')));
  await new Promise(r => setImmediate(r));
  assert.equal(off.document.body.textContent, 'The selftest did not load: offline');
});

test('risk 5: the browser from its user agent', () => {
  assert.equal(browserOf(FIREFOX), 'Firefox 131 on Windows');
  assert.equal(browserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'), 'Chrome 141 on Windows');
  assert.equal(browserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'), 'Edge 141 on Windows');
  assert.equal(browserOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'), 'Safari 18.1 on macOS');
  assert.equal(browserOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'), 'Chrome 141 on Android');
  assert.equal(browserOf(''), 'an unknown browser');
});
