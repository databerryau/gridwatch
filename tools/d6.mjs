// GRIDWATCH: D-6's whole-day replay (SPEC D-6; desk/README.md §32.2 D-6 and §32.10, "D-6's whole-day
// replay once (1x, FAST, 50 pauses: one hash)"). One desk date through the real page model
// (tests/lib/play.js openGame: next.html booted with every real module, the page's system in
// 'player' mode, the director, the objective line, the tray and the annunciator), one input log
// played three ways, and the three end-of-day hashState values compared:
//   cruise   the clock at 1x: the D-2 profile as the director plays it (watches, cards, feeder cards...)
//   fast     F held throughout: F pressed again at the first grid second it is not FAST but could be
//            (CRUISE), whatever released it (a ringing card, an alarm, a trip)
//   pauses   N seeded random pauses (Space, 1-30 drawn frames, Space), at grid times drawn
//            uniformly from 04:30 to 04:00
// The suite checks the same on a 2-h slice (tests/clock-slice.test.js, D-6 1 and 2 of 2); this is
// the whole day, run once by the integrator at stage C. Not loaded by the game; no browser, no server.
// An ES module (.mjs: tools/package.json pins the .js tools to CommonJS).
//
//   node tools/d6.mjs                       # 20261012 (a Monday: desk; the task, two trips), 50 pauses
//   node tools/d6.mjs 20261007 --pauses 50 --rng 7
//   node tools/d6.mjs 20261017 --first      # a Saturday (desk-weekend), a first-time player
//
// THE INPUT LOG is par's discrete actions on the date (sim/autopilot.js runPar: every input whose
// origin is rule1..rule9, not rule 7's planLoad, before 21:00, when the night shift takes the desk),
// sent through the page's own actions (h.actions.input, as a press sends them, refusals toasted) at
// the tick par sent each one (game.beforeTick, the hook app/game.js calls before every tick). The
// page's system dispatches for the player, so its day is not par's and some inputs are refused:
// the same ones in every run, which is the point (the accepted counts are printed and compared).
// Every RESPOND card is dismissed (Enter) the frame it is shown, and every feeder card (Q-91) gone on
// from (Esc), so the log stays par's: its restores come at par's ticks.
// Flags: --pauses N (default 50) | --rng N (the pauses' seed, default 7) | --first (a first-time
// player: storage empty, so the full watch; default a returning player's storage, seen.watch) |
// --line=near (the objective line only near each jump's target: faster, and the line never feeds the
// sim) | --help.
// Prints, per run: the end hash, the inputs accepted, the real seconds from Space, the cards
// dismissed (feeder cards after the +), the share of the day's grid seconds at FAST (fast run) or the pauses taken; then MATCH
// or DIFFER (with the first grid hour whose hourly hash differs; exit code 1).

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openGame, clockOfS} from '../tests/lib/play.js';
import * as G from '../app/game.js';
import * as D from '../app/director.js';
import {runPar} from '../sim/autopilot.js';
import {hashState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {NIGHT_S} from '../sim/clock.js';

const TPS = V.TICKS_PER_S, START_S = V.PLAYER_START_S, DAY_S = V.DAY_S;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : Number(argv[i + 1]); };
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--pauses' && argv[i - 1] !== '--rng');
const seed = Number(pos[0] || 20261012);
if (!Number.isInteger(seed) || seed < 1) throw new Error('d6: bad seed ' + pos[0] + ' (--help)');
const nPauses = opt('pauses', 50), rngSeed = opt('rng', 7), first = argv.includes('--first');
const line = argv.includes('--line=near') ? 'near' : 'exact';

// The input log: par's discrete actions on the date, by tick.
const scn = G.scenarioForSeed(seed);
const t0 = performance.now();
const par = runPar(seed, scn);
const LOG = par.log.map((x, i) => [x, par.origins[i]])
  .filter(([x, o]) => /^rule\d$/.test(o) && x.type !== 'planLoad' && x.tick < NIGHT_S * TPS)
  .map(([x]) => ({tick: x.tick, input: Object.assign({type: x.type}, x.args)}));
console.log('# D-6 whole-day replay: seed ' + seed + ' · ' + scn.id + ' · ' + (first ? 'first-time player' : 'returning player') +
  ' · ' + LOG.length + ' inputs (par\'s discrete actions to 21:00, ' + Math.round(performance.now() - t0) + ' ms)');

// A seeded LCG (the slice test's), for the pauses.
function lcg(s) { return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

/** One run: a fresh page, the log by tick, played to 04:00 with `each` asked once a grid second. */
function run(name, o = {}) {
  const a = performance.now();
  const mem = new Map(first ? [] : [[G.SEEN_KEY, JSON.stringify({watch: true})]]);
  const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v))};
  const p = openGame({seed, storage});
  const game = p.game;
  let k = 0, accepted = 0, cards = 0, feeders = 0;
  game.beforeTick = g => {
    for (; k < LOG.length && LOG[k].tick <= g.state.tick; k++) if (p.h.actions.input(LOG[k].input) === '') accepted++;
  };
  const stop = o.each ? [({state, game: g}) => { if (state.tick % TPS === 0) o.each(g, state); return false; }] : [];
  const playTo = toS => {
    for (let guard = 0; guard < 10000; guard++) {
      if (game.state.over) return;
      const r = p.to(toS, {stop, line});
      if (r.why === 'target' || r.why === 'over') return;
      if (r.why === 'held:RESPOND-CARD') { cards++; p.key('Enter'); continue; }
      if (r.why === 'held:FEEDER-CARD') { feeders++; p.key('Escape'); continue; }
      throw new Error(name + ': the jump stopped (' + r.why + ') at ' + r.at);
    }
    throw new Error(name + ': no end');
  };
  if (o.pauses) for (const at of o.pauses) {
    playTo(at.s);
    if (game.state.over) break;
    p.key(' ');
    if (game.director.paused) { o.taken++; p.frames(at.frames); p.key(' '); }
    if (game.director.paused) throw new Error(name + ': still paused at ' + p.clock());
  }
  playTo(DAY_S);
  if (!game.state.over) throw new Error(name + ': the day did not end (' + p.clock() + ')');
  return {name, hash: hashState(game.state), hourly: game.hashes.slice(), accepted, cards, feeders, realS: (p.now - p.spaceMs) / 1000,
    ms: Math.round(performance.now() - a), refusedLast: game.refusal};
}

const runs = [];
runs.push(run('cruise'));
// F held: pressed again whenever the director could play FAST and does not (Q-63's refusals and releases)
const F = {fast: 0, cruise: 0, presses: 0};
runs.push(Object.assign(run('fast', {each: (g, st) => {
  const m = D.modeOf(g.director, st).mode;
  if (m === 'FAST') F.fast++;
  else if (m === 'CRUISE') { F.cruise++; if (G.ui(g, {do: 'fast', on: true}) === '') F.presses++; }
}}), {F}));
const rnd = lcg(rngSeed), times = new Set();
while (times.size < nPauses) times.add(START_S + 60 + Math.floor(rnd() * (DAY_S - START_S - 120)));
const pauses = [...times].sort((x, y) => x - y).map(s => ({s, frames: 1 + Math.floor(rnd() * 30)}));
const P = {pauses, taken: 0};
runs.push(Object.assign(run('pauses', P), {taken: P.taken}));

for (const r of runs) {
  const extra = r.F ? ' · FAST ' + r.F.fast + ' of ' + (r.F.fast + r.F.cruise) + ' grid s it could be (' + (100 * r.F.fast / Math.max(1, r.F.fast + r.F.cruise)).toFixed(1) +
    '%), F pressed ' + r.F.presses + 'x' : r.taken !== undefined ? ' · ' + r.taken + ' of ' + nPauses + ' pauses taken' : '';
  console.log(r.name.padEnd(7) + ' hash ' + r.hash + ' · inputs accepted ' + r.accepted + ' of ' + LOG.length + ' · ' + r.realS.toFixed(1) +
    ' real s from Space · cards ' + r.cards + '+' + r.feeders + extra + ' · ' + r.ms + ' ms');
}
const same = runs.every(r => r.hash === runs[0].hash && r.accepted === runs[0].accepted);
if (same) console.log('MATCH: one end-of-day hashState (' + runs[0].hash + ') from all three runs');
else {
  console.log('DIFFER');
  for (const r of runs.slice(1)) {
    const h = r.hourly.findIndex((x, i) => x !== runs[0].hourly[i]);
    if (h >= 0) console.log('  ' + r.name + ': first differing hourly hash at ' + clockOfS((h + 1) * V.S_PER_H) + ' (against cruise)');
  }
  process.exitCode = 1;
}
