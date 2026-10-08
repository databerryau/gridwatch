// The alarm panel (SPEC §9.1 Q-46, desk/README.md §30.6): app/alarmpanel.js and its explainers,
// content/alarmhelp.js. The texts are held to SPEC §8 (the facts cited exist, every number is a
// constant's or the cited row's, each confidence is said in words), the order and the default
// selection follow §30.3.3 / §30.6, and on the real page headless (tests/lib/play.js) the panel's
// own keys and buttons all answer, W after a trip opens on UNIT TRIP, and the annunciator keeps
// quiet while it is open and sounds once on close. Sampled, not streamed: the sim jumps between
// moments and a frame is drawn around each press.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import * as A from '../app/alarms.js';
import * as G from '../app/game.js';
import {ALARM_HELP} from '../content/alarmhelp.js';
import {READOUT, controlName, planTarget, panelOrder, realText} from '../app/alarmpanel.js';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const SPEC = read('../SPEC.md');
const section = (from, to) => SPEC.slice(SPEC.indexOf(from), SPEC.indexOf(to));
/** SPEC §8.1's rows by Fact title: the whole row line (its numbers) and its Conf. cell. */
const FACTS = new Map(section('### 8.1', '### 8.2').split('\n').filter(l => /^\| [^-|F]/.test(l)).map(l => {
  const cells = l.split('|').map(c => c.trim());
  return [cells[1], {line: l, conf: cells[cells.length - 2]}];
}));
/** SPEC §8.2's rows by bold title, as tests/text.test.js reads them. */
const ABSTRACTIONS = new Map(section('### 8.2', '### 8.3').split('\n').filter(l => l.startsWith('| **'))
  .map(l => [/^\| \*\*(.+?)\*\*/.exec(l)[1], l]));
/** desk/README.md §5's control ids. */
const md = read('../desk/README.md'), at = md.indexOf('Control and target ids');
const CONTROL_IDS = new Set(md.slice(at, md.indexOf('\n\n', at)).replace(/`/g, ' ').split(/\s+/).filter(x => /^[a-z][a-z0-9-]*$/.test(x)));

// Every number a text may show: a value in sim/params.js or app/alarms.js, as is or in minutes,
// hours or per cent (the texts' own units).
const VALUES = [];
const walk = x => { if (typeof x === 'number') VALUES.push(x); else if (x && typeof x === 'object') for (const k in x) walk(x[k]); };
walk(V); walk(Object.assign({}, A));
const isValue = (n, extra) => [...VALUES, ...extra].some(v => [v, v / V.S_PER_MIN, v / V.S_PER_H, v * V.PCT].some(w => Math.abs(w - n) < 1e-9 * Math.max(1, Math.abs(n))));
// Numbers as a reader reads them: '1,308' and '49.85', not the 1 of LOR1, the 4 of Q4 or the minutes of 17:00.
const numbers = s => [...String(s).matchAll(/(?<![\w.:])\d[\d,]*(?:\.\d+)?/g)].map(m => Number(m[0].replace(/,/g, '')));
const CONF_WORD = {H: 'well established', M: 'likely', L: 'unverified', UNVERIFIED: 'unverified'};

test('Q-46: every tile has an explainer; its facts and abstractions are SPEC §8 rows; ON THE REAL GRID says each confidence in words', () => {
  assert.ok(FACTS.size >= 40 && FACTS.has('Normal operating band') && FACTS.get('LOR levels').conf === 'H', 'the §8.1 parser');
  assert.ok(ABSTRACTIONS.has('DC tie.'), 'the §8.2 parser');
  assert.deepEqual(Object.keys(ALARM_HELP).sort(), A.TILES.map(t => t.id).sort());
  for (const t of A.TILES) {
    const h = ALARM_HELP[t.id], r = h.real, at = t.id + ': ';
    for (const k of ['means', 'why', 'trigger']) assert.ok(typeof h[k] === 'string' && h[k].length > 20, at + k);
    assert.ok(h.todo && h.todo.text.length > 20, at + 'todo');
    // GO TO lands on a control the player acts on, never a readout
    const target = h.todo.target || t.target;
    assert.ok(CONTROL_IDS.has(target) && !READOUT.test(target), at + 'GO TO ' + target);
    assert.equal(typeof h.reading, 'function', at + 'reading');
    assert.equal(['facts', 'abstraction', 'own'].filter(k => r[k]).length, 1, at + 'real: facts, an abstraction or its own');
    if (r.facts) {
      for (const f of r.facts) {
        assert.ok(FACTS.has(f), at + 'no §8.1 row "' + f + '"');
        for (const c of FACTS.get(f).conf.match(/\b(H|M|L|UNVERIFIED)\b/g)) assert.ok(r.text.includes(CONF_WORD[c]), at + f + ' is ' + c + ': say "' + CONF_WORD[c] + '"');
      }
    }
    if (r.abstraction) assert.ok(ABSTRACTIONS.has(r.abstraction), at + 'no §8.2 row "' + r.abstraction + '"');
    if (r.own) assert.match(r.own, /GRIDWATCH's own rule/);
  }
  // WEATHER, STORAGE LOW and LINK TRIP have no §8.1 row (§30.6)
  for (const id of ['weather', 'storageLow', 'linkTrip']) assert.ok(!ALARM_HELP[id].real.facts, id);
});

test('Q-46: every number in an explainer is a constant (sim/params.js, app/alarms.js) or the cited row\'s; nothing unverified is stated as fact', () => {
  for (const t of A.TILES) {
    const h = ALARM_HELP[t.id], r = h.real;
    const rows = (r.facts || []).map(f => FACTS.get(f).line).concat(r.abstraction ? [ABSTRACTIONS.get(r.abstraction)] : []);
    const fromRows = rows.flatMap(numbers);
    const shown = {trigger: h.trigger, means: h.means, why: h.why, todo: h.todo.text, real: realText(r)};
    for (const [k, s] of Object.entries(shown)) {
      for (const n of numbers(s)) assert.ok(isValue(n, k === 'real' ? fromRows : []), t.id + '.' + k + ': ' + n + ' is no constant' + (k === 'real' ? ' and not in the cited rows' : '') + ': ' + s);
    }
    // SPEC §8.3: the trip lockout only as GRIDWATCH's rule and unverified; no household count, no ISA-18.2, no MSL3 value
    const all = Object.values(shown).join(' ');
    if (/locked out|lockout/.test(all)) assert.match(all, /unverified/, t.id);
    assert.doesNotMatch(all, /household|1\.9 ?M|ISA|MSL3|swing/i, t.id);
  }
  // the trigger lines are built from the constants: one spot check each way
  assert.match(ALARM_HELP.underFreq.trigger, new RegExp('below ' + A.UNDER_SET_HZ.toFixed(2) + ' Hz, clears above ' + A.UNDER_CLEAR_HZ.toFixed(2) + ' Hz'));
  assert.match(ALARM_HELP.agcLimit.trigger, new RegExp('over ' + V.AGC_LIMIT_ALARM_REAL_S + ' real s'));
  assert.equal(A.AGC_LIMIT_REAL_S, V.AGC_LIMIT_ALARM_REAL_S, 'one constant for AGC LIMIT');
});

test('Q-46 (§30.3.3, §30.6): the default selection, the board\'s order, the plan line\'s GO TO and the names GO TO says', () => {
  const T = (id, state, o = {}) => Object.assign({id, state, prio: A.TILES.find(t => t.id === id).prio, escalated: false, setAtS: -1}, o);
  const quiet = A.TILES.map(t => T(t.id, 'normal'));
  const view = tiles => ({tiles: quiet.map(q => tiles.find(t => t.id === q.id) || q)});
  assert.equal(A.defaultSel(view([]), null, 0), 'underFreq', 'nothing in: UNDER FREQ');
  // a live pick wins; a lapsed one does not
  const trip = view([T('n1', 'alarm', {setAtS: 100}), T('unitTrip', 'alarm', {setAtS: 50}), T('underFreq', 'alarm', {setAtS: 60})]);
  assert.equal(A.defaultSel(trip, {id: 'peak', untilMs: 5000}, 4000), 'peak');
  assert.equal(A.defaultSel(trip, {id: 'peak', untilMs: 5000}, 5000), 'unitTrip', 'the highest effective priority, before the newest');
  // an escalated tile is P1: then the newest P1; a cleared tile is unacknowledged too
  assert.equal(A.defaultSel(view([T('unitTrip', 'cleared', {setAtS: 50}), T('underFreq', 'alarm', {prio: 'P1', escalated: true, setAtS: 60})]), null, 0), 'underFreq');
  assert.equal(A.defaultSel(view([T('n1', 'alarm', {setAtS: 70}), T('rocof', 'cleared', {setAtS: 90})]), null, 0), 'rocof');
  // with nothing unacknowledged, the newest acknowledged standing tile
  assert.equal(A.defaultSel(view([T('n1', 'ackd', {setAtS: 10}), T('minGen', 'ackd', {setAtS: 20})]), null, 0), 'minGen');
  // the board: alarm, cleared, acknowledged, quiet; escalated first, then the newest; then annunciator order
  const board = panelOrder(view([T('n1', 'ackd', {setAtS: 300}), T('rocof', 'cleared', {setAtS: 400}), T('unitTrip', 'alarm', {setAtS: 100}),
    T('weather', 'alarm', {setAtS: 200}), T('underFreq', 'alarm', {prio: 'P1', escalated: true, setAtS: 50})]).tiles);
  assert.deepEqual(board.slice(0, 5), ['underFreq', 'weather', 'unitTrip', 'rocof', 'n1']);
  assert.deepEqual(board.slice(5), A.TILES.map(t => t.id).filter(id => !board.slice(0, 5).includes(id)));
  // GO TO: the plan line's first control while it asks to act now, never a readout or a battery or watch line
  assert.equal(planTarget({level: 'act', kind: 'spare', targets: ['gauge-n1', 'ring-guard']}), 'ring-guard');
  assert.equal(planTarget({level: 'crit', kind: 'short', targets: ['guard-start-gta1']}), 'guard-start-gta1');
  for (const o of [null, {level: 'plan', kind: 'commit', targets: ['stack']}, {level: 'act', kind: 'battery', targets: ['dial-battery']},
    {level: 'act', kind: 'watch', targets: []}, {level: 'act', kind: 'restore', targets: ['gauge-n1']}]) assert.equal(planTarget(o), null);
  assert.deepEqual(['lever-coal', 'guard-start-gta1', 'guard-stop-coal2', 'ring-guard', 'stack', 'wheel-hydro'].map(controlName),
    ['COAL lever', 'START GT·A', 'STOP COAL 2', 'GUARD ring', 'LIVE STACK', 'HYDRO wheel']);
});

test('Q-46: with the panel open its tiles select and keep the focus in it; arrows, Home and End move; Tab wraps; the board sorts once per opening', () => {
  const p = openGame({seed: 20261007});
  p.to('04:31', {stop: []}); // (N-1 INSECURE is in from 04:30:10)
  p.key('w');
  const box = p.$('alarm-panel'), inBox = () => box.contains(p.doc.activeElement);
  const order = () => p.$('alarm-panel').querySelector('.ap-board').children.map(b => b.id.slice(3));
  assert.match(p.look(), /^ALARMS open: \S.* · .+\.$/m, 'the look line has the explainer\'s first sentence');
  const first = order();
  assert.equal(first.length, 12);
  assert.deepEqual([first[0], p.vm().alarmsSel], ['n1', 'n1'], 'it opens on the one alarm in, first on the board');
  // a press on a tile selects it: the explainer follows, the focus stays in the panel, the clock stays held
  const s = p.press('ap-peak');
  assert.equal(p.vm().alarmsSel, 'peak');
  assert.ok(inBox(), 'the focus stays in the panel');
  assert.equal(p.mode(), 'ALARMS');
  assert.match(s.diff, /^ALARMS open: PEAK · It is the evening peak/m);
  assert.match(p.$('ap-now').textContent, /\d/, 'NOW shows a live number');
  assert.equal(p.$('ap-peak').getAttribute('aria-selected'), 'true');
  // arrows move in board order (4 to a row), Home and End jump, the selection following the focus
  const i = first.indexOf('peak');
  p.key('ArrowLeft');
  assert.equal(p.vm().alarmsSel, first[i - 1]);
  assert.equal(p.doc.activeElement.id, 'ap-' + first[i - 1]);
  p.key('Home');
  assert.equal(p.vm().alarmsSel, first[0]);
  p.key('ArrowDown');
  assert.equal(p.vm().alarmsSel, first[4]);
  p.key('End');
  assert.equal(p.vm().alarmsSel, first[11]);
  p.key('ArrowRight');
  assert.equal(p.vm().alarmsSel, first[11], 'the end stays the end');
  // Enter on a tile is its press; from CLOSE the arrows still move the selection
  p.$('ap-rocof').focus();
  p.key('Enter');
  assert.equal(p.vm().alarmsSel, 'rocof');
  p.$('btn-alarms-close').focus();
  p.key('Home');
  assert.equal(p.doc.activeElement.id, 'ap-' + first[0]);
  // Tab from the last control comes back to the first, and Shift+Tab the other way
  p.$('btn-ap-sil').focus();
  p.key('Tab');
  assert.equal(p.doc.activeElement.id, 'btn-alarms-close');
  p.key('Tab', {shiftKey: true});
  assert.equal(p.doc.activeElement.id, 'btn-ap-sil');
  assert.equal(p.game.ui.alarmsOpen, true, 'none of the panel\'s own keys closed it');
  // ACK changes a face in place, never moves it, nor does a tile that comes in while open; the next opening sorts again
  p.click('ap-n1');
  p.click('ap-ack-one');
  assert.equal(p.vm().alarms.tiles.find(t => t.id === 'n1').state, 'ackd');
  assert.match(p.$('ap-n1').className, /\bs-ackd\b/);
  Object.assign(p.game.alarms.tiles.weather, {state: 'alarm', cond: true, setAtS: Math.floor(p.game.state.tick / TPS)}); // (a test poke)
  p.frame();
  assert.deepEqual(order(), first, 'the board did not move');
  p.key('Escape');
  p.key('w');
  assert.deepEqual(order().slice(0, 2), ['weather', 'n1'], 're-sorted on opening: the alarm, then the acknowledged');
  assert.equal(p.vm().alarmsSel, 'weather');
});

test('Q-46: every panel control answers: GO TO, ACK, ACK ALL, HORN OFF and CLOSE; the plan line\'s control first', () => {
  const p = openGame({seed: 20261007});
  p.to('04:31', {stop: []});
  p.key('w');
  // the plan line asks to raise the GUARD now (▶ ACT NOW): WHAT TO DO offers its control first
  const plan = planTarget(p.vm().objective);
  assert.ok(plan, 'the 04:30 line acts now: ' + JSON.stringify(p.vm().objective && p.vm().objective.text));
  assert.match(p.$('ap-todo').textContent, /^The plan line above says act now: GO TO /);
  assert.equal(p.$('ap-goto').textContent, 'GO TO ' + controlName(plan));
  // nothing to acknowledge on a quiet tile, nothing sounding: blue notes, never red (Q-41)
  p.click('ap-rocof');
  let s = p.press('ap-ack-one');
  assert.match(s.during, /^NOTE blue ap-ft: Nothing to acknowledge on HIGH RoCoF: it is quiet\.$/m);
  s = p.press('btn-ap-sil');
  assert.match(s.during, /^NOTE blue ap-ft: Nothing sounding: HORN OFF stops the horn/m);
  p.real(4.5, 0.5);
  assert.doesNotMatch(p.look(), /^NOTE blue ap-ft/m, 'the note goes after a few seconds');
  // ACK ALL acknowledges what is in; pressed again it says there is nothing left
  assert.ok(p.vm().alarms.unacked > 0);
  p.click('btn-ap-ack');
  assert.equal(p.vm().alarms.unacked, 0);
  s = p.press('btn-ap-ack');
  assert.match(s.during, /^NOTE blue ap-ft: Nothing to acknowledge: ACK marks/m);
  // GO TO: the panel closes, the clock stays paused, the focus is on the control
  p.click('ap-goto');
  assert.deepEqual([p.game.ui.alarmsOpen, p.mode(), p.doc.activeElement.id], [false, 'PAUSE', plan]);
  // with no act-now line, a tile's own GO TO: AGC LIMIT's is RE-DISPATCH
  p.key('w');
  p.game.objective = null;
  p.click('ap-agcLimit');
  assert.equal(p.$('ap-goto').textContent, 'GO TO RE-DISPATCH');
  p.click('ap-goto');
  assert.equal(p.doc.activeElement.id, 'btn-redispatch');
  // CLOSE gives the focus back to the opener
  p.key('w');
  p.click('btn-alarms-close');
  assert.deepEqual([p.game.ui.alarmsOpen, p.mode(), p.doc.activeElement.id], [false, 'PAUSE', 'btn-redispatch']);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-46: W after a trip opens on UNIT TRIP, not a lapsed pick (a live pick wins); the first card says W explains', () => {
  const p = openGame({seed: 20261007});
  p.key(' ');
  // a tile pressed while closed is W's pick for its note's life
  p.h.actions.ui({do: 'alarmsPick', id: 'peak'});
  p.key('w');
  assert.equal(p.vm().alarmsSel, 'peak');
  p.key('w');
  p.h.actions.ui({do: 'alarmsPick', id: 'peak'});
  p.real(G.ALARMS_PICK_MS / 1000 + 0.5, 0.5); // (paused: half-second frames are enough)
  p.key(' ');
  injectTrip(p.game.state, Math.floor(p.game.state.tick / TPS) + 60);
  assert.equal(p.until('trip', {max: '+10m'}).why, 'trip');
  p.real(0.5);
  const s = p.pressKey('w');
  assert.equal(p.vm().alarmsSel, 'unitTrip');
  assert.match(s.during, /^ALARMS open: UNIT TRIP · A machine dropped off at once, with all its output\.$/m);
  assert.match(p.$('ap-now').textContent, /^COAL \d lost \d+ MW · at \d\d:\d\d · out \d+:\d\d more$/);
  assert.match(p.$('ap-unitTrip').textContent, /COAL \d lost \d+ MW$/, 'the board shows the reading up to its first ·');
  assert.match(p.$('ap-goto').textContent, /^GO TO /);
  p.key('w');
  assert.equal(p.until('card').why, 'card');
  assert.match(p.look(), /^CARD .*Enter \(or a click\) to take the desk · W explains each alarm \(the clock holds\)\.$/m);
  p.key('w');
  assert.equal(p.vm().alarmsSel, 'unitTrip', 'at the card too: cleared, still unacknowledged, P1');
});

test('Q-46: while the panel is open nothing sounds or repeats; on close what is still unacknowledged sounds once', () => {
  // the model: a fresh alarm under the hold is held, and sounds on release (one sounding)
  const a = A.createAlarms();
  const x = over => Object.assign({s: 10000, h: 10, fHz: 50, rocof: 0, level: 'SECURE', agcAtLimitS: 0, hydroFrac: 0.8, battFrac: 0.5,
    inWatch: false, contCount: 0, cont: null, newsCount: 0, news: null}, over);
  A.updateAlarms(a, x({}), {nowMs: 0, realDtS: 0});
  let r = A.updateAlarms(a, x({fHz: 49.8}), {nowMs: 100, realDtS: 0, hold: true});
  assert.deepEqual([r.cues, a.tiles.underFreq.state, a.tiles.underFreq.held, a.audible], [[], 'alarm', true, 0]);
  r = A.updateAlarms(a, x({fHz: 49.8, s: 10001}), {nowMs: 200, realDtS: 0, hold: true});
  assert.deepEqual(r.cues, []);
  r = A.updateAlarms(a, x({fHz: 49.8, s: 10002}), {nowMs: 300, realDtS: 0});
  assert.deepEqual([r.cues, a.audible], [['chime'], 1], 'on release: one sounding');
  // on the page: N-1 INSECURE chimed at 04:30; its single repeat (60 real s on) waits for the panel
  const p = openGame({seed: 20261007});
  p.to('04:31', {stop: []});
  const al = p.game.alarms;
  assert.equal(al.sounds.length, 1, 'one chime so far: ' + JSON.stringify(al.sounds));
  p.key('w');
  const n = [al.audible, al.repeats];
  let heard = [];
  for (let k = 0; k < 140; k++) { p.frame(0.5); heard = heard.concat(p.vm().cues.filter(c => c === 'horn' || c === 'chime')); }
  assert.deepEqual([heard, al.audible, al.repeats], [[], ...n], 'quiet for 70 real s while open');
  p.key('w');
  assert.deepEqual(p.vm().cues.filter(c => c === 'horn' || c === 'chime'), ['chime'], 'the repeat sounds once, on close');
  assert.equal(al.repeats, n[1] + 1);
  p.frame(0.5);
  assert.deepEqual(p.vm().cues.filter(c => c === 'horn' || c === 'chime'), [], 'and only once');
});
