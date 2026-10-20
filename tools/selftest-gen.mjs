// tools/selftest-gen.mjs: writes content/selftest.js (W6, risk 5), the golden values index.html?selftest (app/selftest.js) checks
// each browser against before a release, measured here in Node with the page's own runner (app/selftest.js measure):
//   par      par's day to its end on two dailies, a weekday's and a weekend's; its ALL-IN must be the stored par
//            (content/ladder.js, F-8), so run tools/ladder.mjs first when the stamp moves
//   nothing  the page's no-input day on the first daily to 14:00: the ladder's check (tools/ladder.mjs CHECK_H)
//   replay   two scripted players' input logs, recorded here (sim/autopilot.js's fuzz proxy: random valid inputs, F-3), each to
//            a checkpoint a few grid hours in (the page replays a log in one call, which cannot pause)
// The file carries the build stamp (app/game.js dailyStamp), like the ladder: tests/selftest.test.js fails when it is stale, and
// plays the cases to a checkpoint against it. It prints what each log covers (its inputs and their kinds, the first relays, a
// trip), so a re-run shows when a pick has lost its point. About 10 s; run it once per SIM_VERSION, after tools/ladder.mjs
// (W7 Q15: `npm run verify` first, which restamps this file and the lists when every stored value still holds).
//
//   node tools/selftest-gen.mjs [--dry]   (--dry prints and writes nothing)
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {CHECK_H} from './ladder.mjs';

const ROOT = new URL('..', import.meta.url);
const OUT = fileURLToPath(new URL('content/selftest.js', ROOT));
const imp = p => import(new URL(p, ROOT).href);

// The picks (2026-10-16, v4-core-2d.0) and what each covered then; `at` is a grid time ('HH:MM')
const PICKS = [
  {kind: 'par', ymd: 20261016},                    // a weekday HEATWAVE, par's busiest kind of day (F-8 measured the page's par on it)
  {kind: 'par', ymd: 20261031},                    // a weekend storm (desk-weekend)
  {kind: 'nothing', ymd: 'from', at: CHECK_H + ':00'},   // the ladder's check: the first daily to 14:00
  {kind: 'replay', ymd: 20261016, at: '08:00'},    // 7 inputs of 7 kinds, and the relays (UFLS) at 07:52
  {kind: 'replay', ymd: 20261025, at: '10:15'},    // a weekend HEATWAVE: 15 inputs of 8 kinds, and a trip at 09:57 and its watch
];

async function main() {
  const dry = process.argv.includes('--dry'), t0 = Date.now();
  const [{V}, {hashState}, AP, G, ST, {DAILIES, dailyFor}, {LADDER}, {tickClock}] = await Promise.all([imp('sim/params.js'), imp('sim/step.js'),
    imp('sim/autopilot.js'), imp('app/game.js'), imp('app/selftest.js'), imp('content/dailies.js'), imp('content/ladder.js'), imp('render/format.js')]);
  const TPS = V.TICKS_PER_S, stamp = G.dailyStamp(), clock = t => tickClock(t, false);
  const tickAt = hhmm => { const [h, m] = hhmm.split(':').map(Number); return ((h - V.DAY_START_H + 24) % 24 * V.S_PER_H + m * V.S_PER_MIN) * TPS; };
  const cases = [];
  let ms = 0;
  for (const p of PICKS) {
    const ymd = p.ymd === 'from' ? +DAILIES.from.replace(/-/g, '') : p.ymd, d = dailyFor(ymd, stamp);
    if (!d.gated) throw new Error(ymd + ' is not a daily of this build (content/dailies.js): run tools/daily-gen.js and tools/ladder.mjs first');
    const c = {kind: p.kind, ymd, seed: d.seed, scenarioId: d.scenarioId}, scn = G.scenarioForSeed(d.seed);
    let said = '';
    if (p.kind === 'nothing') c.tick = tickAt(p.at);
    if (p.kind === 'replay') {
      // the scripted player's day, recorded to the checkpoint; what it covers
      let ufls = -1;
      const trips = [];
      c.tick = tickAt(p.at);
      const rec = AP.runPar(d.seed, scn, {proxy: 'fuzz', untilTick: c.tick,
        onStep: st => { if (ufls < 0 && st.score.uflsMWh > 0) ufls = st.tick; if (st.conts.length > trips.length) trips.push(st.tick); }});
      c.log = rec.log.map(r => ({tick: r.tick, type: r.type, args: Object.assign({}, r.args)}));
      c.recorded = hashState(rec.state) >>> 0;
      said = c.log.length + ' inputs of ' + new Set(c.log.map(r => r.type)).size + ' kinds (' + [...new Set(c.log.map(r => r.type))].join(', ') + '); the relays ' +
        (ufls < 0 ? 'never' : 'from ' + clock(ufls)) + '; ' + (trips.length ? 'a trip at ' + clock(trips[0]) : 'no trip');
    }
    const m0 = Date.now(), got = await ST.measure(c);
    ms += Date.now() - m0;
    Object.assign(c, {tick: got.tick, hash: got.hash, hashes: got.hashes});
    if (p.kind === 'par') {
      c.total = got.total;
      const stored = ST.storedTotal(ymd);
      if (got.total !== stored) throw new Error(ymd + ': par\'s ALL-IN $' + got.total + ' is not the stored par $' + stored + ' (content/ladder.js): run tools/ladder.mjs first');
      said = 'ALL-IN $' + got.total + ', the stored par; the day ends ' + clock(got.tick) + (got.tick < V.DAY_TICKS ? ' (black)' : '');
    }
    if (p.kind === 'nothing') {
      if (LADDER.check.ymd === ymd && LADDER.check.tick === c.tick && LADDER.check.hash !== c.hash) throw new Error('the no-input day is not the ladder\'s check: run tools/ladder.mjs first');
      said = c.hashes.length + ' hours, the ladder\'s check' + (LADDER.check.hash === c.hash ? '' : ' (another tick)');
    }
    if (p.kind === 'replay') {
      if (c.hash !== c.recorded) throw new Error(ymd + ': the log replays to another state than the day it was recorded from (F-6)');
      delete c.recorded;
    }
    cases.push(c);
    console.log(ST.caseName(c) + ' to ' + clock(c.tick) + ': ' + said);
  }
  const file = selftestText({v: stamp, cases});
  console.log('the cases took ' + (ms / 1000).toFixed(1) + ' s in Node (the page: about that, plus its drawing)');
  if (dry) console.log(file.slice(0, 2000));
  else { writeFileSync(OUT, file); console.log('wrote content/selftest.js: ' + cases.length + ' cases, ' + file.length + ' bytes, in ' + Math.round((Date.now() - t0) / 1000) + ' s'); }
}

/** content/selftest.js's text for {v, cases} (main writes it; W7 Q15: tools/verify.mjs restamps the shipped file through it). */
export function selftestText(S) {
  const body = S.cases.map(c => {
    const {log, ...rest} = c, s = JSON.stringify(rest);
    return log ? s.slice(0, -1) + ',"log":[\n    ' + log.map(r => JSON.stringify(r)).join(',\n    ') + ']}' : s;
  }).join(',\n  ');
  return '// content/selftest.js: W6 (risk 5): the golden values index.html?selftest (app/selftest.js) checks a browser against,\n' +
    '// measured in Node with the page\'s own runner. par: par\'s day to its end (the hash each grid hour from 05:00 and at its end,\n' +
    '// and its ALL-IN, which is content/ladder.js\'s stored par); nothing: the page\'s no-input day to 14:00 (the ladder\'s check);\n' +
    '// replay: a scripted player\'s input log (sim/autopilot.js fuzz) and the hash at its checkpoint. Hashes: hashState, unsigned.\n' +
    '// Written by tools/selftest-gen.mjs; do not edit. The stamp is app/game.js dailyStamp\'s.\n' +
    'export const SELFTEST = {v: ' + JSON.stringify(S.v) + ', cases: [\n  ' + body + ',\n]};\n';
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e.message || e); process.exit(1); });
