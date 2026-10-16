// tools/d26.mjs: D-26's accept, measured (SPEC §5 W3). DESK 2026-10-14 headless (tests/lib/play.js): Enter at every
// card to 19:19 (the Enter-only run of the 2026-10-14 review, which sheds from 18:30), then also every START
// the line asks for, until 21:00 (the night shift's). Prints each dark set and each card, and the day's
// UFLS / directed / task MWh. Run once when the holds change: node tools/d26.mjs [seed]
import {V} from '../sim/params.js';
import {openGame} from '../tests/lib/play.js';
import * as D from '../app/director.js';
const p = openGame({seed: Number(process.argv[2]) || 20261014}), g = p.game, TPS = V.TICKS_PER_S;
const hm = (s = g.state.tick / TPS) => String(Math.floor(s / 3600 + 4) % 24).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const mode = () => D.modeOf(g.director, g.state).mode;
const dark = () => g.state.city.districts.filter(x => x.dark).map(x => x.id + ':' + x.shedBy).join(' ');
let last = '';
const followFrom = (19 * 3600 + 19 * 60) - 4 * 3600;
for (let i = 0; i < 6000 && !g.state.over; i++) {
  const s = g.state.tick / TPS;
  if (mode() === 'RESPOND-CARD') { p.key('Enter'); continue; }
  if (mode() === 'FEEDER-CARD') { const f = g.feeder; console.log(hm(), 'CARD', f.text, '|', f.plan, '|', f.lamp || f.why); p.key('Enter'); if (mode() === 'FEEDER-CARD') { console.log('  refused:', g.feeder && g.feeder.why); p.key('Escape'); } continue; }
  if (s >= followFrom && s < (21 - 4) * 3600 && g.objective && g.objective.action && g.objective.action.type === 'start') {
    const a = g.objective.action; console.log(hm(), 'start', a.unit, p.send(a) || 'ok');
  }
  p.until(['trip', 'card', 'mode', 'notice'], {max: '+1m', line: 'near'});
  const d = dark(); if (d !== last) { console.log(hm(), mode(), d || '(all lit)'); last = d; }
}
const sc = g.state.score; console.log(JSON.stringify({ufls: sc.uflsMWh, dir: sc.directedMWh, task: sc.taskMWh}));
