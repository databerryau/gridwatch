// tools/verdict.mjs: W3's verdict on a whole day, headless (tests/lib/play.js), with par: D-20's accept (on the
// three 2026-10-14 runs of the review the lights row names the causes and the measured MWh) and a read of the
// card's words. Runs: follower (every action the line proposes, Enter at each card), enter (Enter at each card,
// nothing else: the review's Enter-only run), nothing (Enter at each RESPOND card, LEAVE at each feeder card).
//   node tools/verdict.mjs [seed] [follower|enter|nothing ...]     (about 10 s a run)
// W7 (Q-119): with a twin (the moment's fall with no GUARD, or par's GUARD tried on your trip), TWIN says what it cost at
// the day's end: its replay to the trip in one go (the page spreads it over frames, TWIN_BUDGET_MS each) and one more
// preview on the replayed state (what asking par's GUARD of a twin that was already made adds).
import {openGame, clockOfS} from '../tests/lib/play.js';
import {TWIN_BUDGET_MS} from '../app/shell.js';
import {createTwin} from '../app/verdict.js';
import {V} from '../sim/params.js';

const seed = Number(process.argv[2]) || 20261014;
const runs = process.argv.slice(3).length ? process.argv.slice(3) : ['follower', 'enter', 'nothing'];
for (const run of runs) {
  const t0 = Date.now(), p = openGame({seed, par: true}), g = p.game;
  for (let i = 0; i < 5000 && !g.state.over; i++) {
    const r = p.until(['card', 'mode', 'notice', 'line'], {max: '+1m', line: 'near'});
    if (r.why === 'held:FEEDER-CARD' && run === 'nothing') { p.click('feeder-leave'); continue; }
    if (r.why.startsWith('held')) { p.key('Enter'); continue; }
    const a = run === 'follower' && !g.state.control.nightShift && g.objective && g.objective.action;
    if (a) { if (a.redispatch) p.click('btn-redispatch'); else p.send(a); }
  }
  for (let i = 0; i < 2000 && (!g.par.done || (g.twin && !g.twin.done)); i++) p.frame();
  let twin = '';
  if (g.twin) {   // (the same twin again, timed whole)
    const c = g.end.verdict.moment.cont, guards = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500], asked = guards.filter(x => g.twin.tried(x) !== undefined);
    const tw = createTwin(g.seed, g.scenario, g.state.log.slice(), c, asked), t1 = performance.now();
    tw.step(Infinity);
    const replay = performance.now() - t1, t2 = performance.now();
    tw.want(guards.find(x => !asked.includes(x)));
    const one = performance.now() - t2;
    twin = 'TWIN replay to ' + clockOfS(c.startTick / V.TICKS_PER_S) + ' with ' + asked.length + ' preview(s) (GUARD ' + asked.join(', ') + ' MW): ' + replay.toFixed(0) + ' ms (' +
      Math.ceil(replay / TWIN_BUDGET_MS) + ' frames at ' + TWIN_BUDGET_MS + ' ms); one more preview: ' + one.toFixed(1) + ' ms';
  }
  const v = g.end.verdict, sc = g.end.score;
  console.log('## ' + seed + ' ' + run + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s) ' + (g.end.grade ? 'SCORE ' + g.end.grade.points + ' ' + g.end.grade.letter : 'no grade') +
    ' · sim MWh: task ' + sc.taskMWh.toFixed(1) + ', directed ' + sc.directedMWh.toFixed(1) + ', ufls ' + sc.uflsMWh.toFixed(1));
  for (const k of ['lights', 'cost', 'carbon']) console.log(k.toUpperCase() + ' ' + v[k]);
  console.log('STRIP ' + v.strip.map(c => c || '.').join(''));
  if (v.moment) console.log('MOMENT ' + v.moment.text.join(' '));
  if (twin) console.log(twin);
  if (v.card) console.log('CARD ' + v.card.id);
  console.log(v.demand.text);
  console.log(v.trips);
  if (p.h.mods.errors.length) console.log('ERRORS ' + p.h.mods.errors.join(' | '));
}
