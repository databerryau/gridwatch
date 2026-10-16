// tools/verdict.mjs: W3's verdict on a whole day, headless (tests/lib/play.js), with par: D-20's accept (on the
// three 2026-10-14 runs of the review the lights row names the causes and the measured MWh) and a read of the
// card's words. Runs: follower (every action the line proposes, Enter at each card), enter (Enter at each card,
// nothing else: the review's Enter-only run), nothing (Enter at each RESPOND card, LEAVE at each feeder card).
//   node tools/verdict.mjs [seed] [follower|enter|nothing ...]     (about 10 s a run)
import {openGame} from '../tests/lib/play.js';

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
  const v = g.end.verdict, sc = g.end.score;
  console.log('## ' + seed + ' ' + run + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s) ' + (g.end.grade ? 'SCORE ' + g.end.grade.points + ' ' + g.end.grade.letter : 'no grade') +
    ' · sim MWh: task ' + sc.taskMWh.toFixed(1) + ', directed ' + sc.directedMWh.toFixed(1) + ', ufls ' + sc.uflsMWh.toFixed(1));
  for (const k of ['lights', 'cost', 'carbon']) console.log(k.toUpperCase() + ' ' + v[k]);
  console.log('STRIP ' + v.strip.map(c => c || '.').join(''));
  if (v.moment) console.log('MOMENT ' + v.moment.text.join(' '));
  if (v.card) console.log('CARD ' + v.card.id);
  console.log(v.demand.text);
  console.log(v.trips);
  if (p.h.mods.errors.length) console.log('ERRORS ' + p.h.mods.errors.join(' | '));
}
