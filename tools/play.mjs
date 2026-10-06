// GRIDWATCH: play the real page headless, fast (tests/lib/play.js on the command line). It boots
// next.html with every real module in the stand-in DOM, takes the desk (AGC) and presses Space,
// then runs the steps in order and prints what the player sees. Not loaded by the game; no
// browser, no server. An ES module (.mjs: tools/package.json pins the .js tools to CommonJS).
//
//   node tools/play.mjs 20261007 to=15:40 until=trip look real=5 look click=<id> look
//   node tools/play.mjs 20261007 until=card diff key=Enter to=+30m diff
//   node tools/play.mjs 20261014 --hand to=06:00 buttons click=guard-start-gta1 diff
//   node tools/play.mjs 20261007 timeline=04:30-04:00/30m
//
// The first argument is the seed (default 20261007; a Saturday or Sunday seed plays the weekend
// day, as the page does). Steps:
//   to=HH:MM | to=+30m      jump to a grid time; stops early at a trip or a change of director
//                           mode (WATCH, the RESPOND card, RESPOND, OVER...), then draws one frame
//   jump=HH:MM              the same, stopping only where the clock holds (the card, the end)
//   until=EV[,EV][@MAX]     jump until an event: trip, card, mode, notice (a tray card or news),
//                           line (the objective's text changed), ask (a new ask to act), event
//                           (all but line); MAX ('HH:MM', '+2h') guards it (default: day's end)
//   look                    the full snapshot (CLOCK, LINE, WATCH, CARD, BALANCE, DIAL, N-1,
//                           TRAY, NOTE, TOAST... and CTRL: every visible control, id "label")
//   brief                   the snapshot without the CTRL lines
//   diff                    the snapshot lines that changed since the previous look/brief/diff
//   buttons                 every visible, enabled control: id "label" [state]
//   real=S | frames=N       S real seconds (or N frames) of drawn 60-fps frames: the watch, holds
//   click=ID|LABEL          a mouse click on a control (by id, else by its visible label), + 1 frame
//   press=ID|LABEL          a click sampled: what changed on the press frame, and 0.5 real s later
//   presskey=K              the same for a key (s, Enter, Shift+A...)
//   hover=ID|LABEL          rest the pointer on a control (a guard's "? IF PRESSED" line)
//   key=K                   a key press (Enter, Escape, Space, s, Shift+A, ArrowUp...), + 1 frame
//   hold=K:S                hold a key for S real seconds (D, E, F)
//   send=JSON               a sim input through the page's actions, e.g. send={"type":"start","unit":"gta1"}
//   timeline=FROM-TO/EVERY  look() every EVERY (30m) from FROM to TO, plus every event; prints the
//                           changed lines (presses Enter at each RESPOND card)
//   state                   tick, grid time, mode, contingencies, inputs logged
// Flags: --hand (HAND at the briefing) | --no-run (leave the clock held at 04:30) |
//   --scenario=ID (desk, desk-weekend, classic) | --line=near (faster jumps: the objective line
//   is computed only over the last 20 grid min before a to() target, so a held line may show a
//   fresher figure) | --aria (add the screen-reader live region to look) | --help.
//
// TIME. One drawn frame costs 3-5 ms; a jump plays the page's frames without drawing them,
// ~0.3 s per grid hour (~0.13 s with --line=near), and stops AT the tick an event begins. Every
// step prints how long it took.
//
// WHAT DIFFERS FROM FRAME-BY-FRAME PLAY (measured: tests/lib/play.js, the faithfulness check of
// its first commit). After a jump, the frame shows the state at the stop tick exactly (sim,
// objective line, annunciator, tray, the watch, the card). Readouts that ease and refresh at
// most every 0.5 real s (the frequency dial's figure) show the current value at once, where
// frame-by-frame play shows one up to 0.5 real s (60 grid s at CRUISE) old; the screen-reader
// live region is left out of look (its queue follows drawn frames). Held keys are not polled
// during a jump (release F/D/E first).

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openGame, diffLooks} from '../tests/lib/play.js';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const flags = argv.filter(a => a.startsWith('--'));
const flag = name => { const f = flags.find(x => x === '--' + name || x.startsWith('--' + name + '=')); return f === undefined ? undefined : f.includes('=') ? f.split('=')[1] : true; };
const rest = argv.filter(a => !a.startsWith('--'));
const seed = rest.length && /^\d+$/.test(rest[0]) ? Number(rest.shift()) : 20261007;
const line = flag('line') === 'near' ? 'near' : 'exact';
const lookOpts = {aria: !!flag('aria')};

const t0 = performance.now();
const p = openGame({seed, agc: !flag('hand'), run: !flag('no-run'), scenario: typeof flag('scenario') === 'string' ? flag('scenario') : undefined});
console.log('# seed ' + seed + ' · ' + p.game.scenario.id + ' · ' + (flag('hand') ? 'HAND' : 'AGC') + ' · opened in ' + Math.round(performance.now() - t0) + ' ms');

let prev = '';
const KEY_ALIAS = {space: ' ', spc: ' ', esc: 'Escape', enter: 'Enter', tab: 'Tab'};
function keyOf(k) {
  const parts = k.length > 1 && k.includes('+') ? k.split('+') : [k];
  const base = parts.pop(), extra = {};
  for (const m of parts) extra[m.toLowerCase() + 'Key'] = true;
  return {key: KEY_ALIAS[base.toLowerCase()] || base, extra};
}
const jumpOut = r => r.why + ' at ' + r.at + ' (' + r.ticks + ' ticks, ' + r.ms + ' ms)';

for (const step of rest) {
  const a = performance.now();
  const eq = step.indexOf('='), name = eq < 0 ? step : step.slice(0, eq), arg = eq < 0 ? '' : step.slice(eq + 1);
  let out = '';
  try {
    switch (name) {
      case 'to': out = jumpOut(p.to(arg, {line})); break;
      case 'jump': out = jumpOut(p.to(arg, {line, stop: []})); break;
      case 'until': {
        const [evs, max] = arg.split('@');
        out = jumpOut(p.until(evs ? evs.split(',') : 'event', {line, max: max || undefined}));
        break;
      }
      case 'look': out = prev = p.look(lookOpts); break;
      case 'brief': out = prev = p.look(Object.assign({controls: false}, lookOpts)); break;
      case 'diff': {
        const now = p.look(lookOpts);
        out = diffLooks(prev, now) || '(no change)';
        prev = now;
        break;
      }
      case 'buttons': out = p.buttons().map(c => c.id + ' "' + c.label + '"' + (c.value !== undefined && c.value !== null ? '=' + c.value : '') + (c.state.length ? ' [' + c.state.join(',') + ']' : '')).join('\n'); break;
      case 'real': p.real(Number(arg)); out = p.clock() + ' ' + p.mode(); break;
      case 'frames': p.frames(Number(arg)); out = p.clock() + ' ' + p.mode(); break;
      case 'click': p.click(arg); out = p.clock() + ' ' + p.mode(); break;
      case 'press': case 'presskey': {
        const s = name === 'press' ? p.press(arg, {look: lookOpts}) : (k => p.pressKey(k.key, k.extra, {look: lookOpts}))(keyOf(arg));
        out = 'DURING (changed on the press frame)\n' + (diffLooks(s.before, s.during) || '(no change)') +
          '\nAFTER 0.5 real s (changed since before)\n' + (s.diff || '(no change)');
        prev = s.after;
        break;
      }
      case 'hover': p.hover(arg); p.frame(); out = p.clock() + ' ' + p.mode(); break;
      case 'key': { const k = keyOf(arg); p.key(k.key, k.extra); out = p.clock() + ' ' + p.mode(); break; }
      case 'hold': { const [k, s] = arg.split(':'); p.hold(keyOf(k).key, Number(s || 1)); out = p.clock() + ' ' + p.mode(); break; }
      case 'send': out = 'refused: ' + (p.send(JSON.parse(arg)) || '(accepted)'); break;
      case 'state': {
        const s = p.game.state;
        out = 'tick ' + s.tick + ' · ' + p.clock() + ' · ' + p.mode() + ' · contingencies ' + s.conts.length + ' · inputs ' + s.log.length + (s.over ? ' · OVER' : '');
        break;
      }
      case 'timeline': {
        const m = /^([^-]*)-([^/]*)(?:\/(.+))?$/.exec(arg || '-/30m') || [];
        const tl = p.timeline({from: m[1] || undefined, to: m[2] || undefined, every: m[3] || '30m', line, look: lookOpts});
        out = tl.map(e => '## ' + e.at + ' ' + e.why + ' (' + e.ms + ' ms)\n' + (e.diff || '(no change)')).join('\n');
        prev = tl.length ? tl[tl.length - 1].look : prev;
        break;
      }
      default: throw new Error('unknown step ' + step + ' (--help)');
    }
  } catch (e) {
    out = 'ERROR ' + (e && e.message ? e.message : e);
    process.exitCode = 1;
  }
  console.log('> ' + step + '  [' + Math.round(performance.now() - a) + ' ms]\n' + out);
  if (process.exitCode) break;
}
