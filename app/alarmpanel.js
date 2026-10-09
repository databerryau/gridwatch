// app/alarmpanel.js: the alarm panel (SPEC §9.1 Q-46, desk/README.md §30.6). EXPLAIN (or W, or a
// second press on a tile) pops the alarms out over the desk while the clock is held. On the left
// the 12 tiles as a 4 × 3 board (glyph, label, state word, a short live reading), sorted once each
// time the panel opens (an ACK changes a face in place, never moves it): alarm, then cleared but
// not acknowledged, then acknowledged, then quiet (dimmed); within a group escalated first, then
// the newest setAtS. On the right the selected alarm: NOW, WHAT TO DO (GO TO and ACK), WHAT IT
// MEANS, WHY, ON THE REAL GRID, and the tile's trigger. Arrows move the selection (4 to a row),
// Home/End jump, and it follows the focus; every change is sent as {do: 'alarmsSel', id}.
// Loaded on demand (Q-44) with content/alarmhelp.js; its CSS is injected once. Presentation only:
// no button sends a sim input. The focus is the shell's (§30.3.4): focus() is called once per
// opening, on the frame the panel first shows; update(vm) never moves it.
//
// content/alarmhelp.js ALARM_HELP[tileId] = {means, why, todo: {text, target}, real, trigger, reading(obs, tile)}:
//   todo.target  the control GO TO focuses: one the player acts on, never a readout (READOUT); null
//                for the tile's own (STORAGE LOW's moves between the hydro wheel and the battery).
//                While the plan line says ▶ ACT NOW or ‼ URGENT and names a control, GO TO offers it.
//   real         ON THE REAL GRID, naming its source: {text, facts: [SPEC §8.1 Fact titles]} says only
//                what those rows' Value cells say, with each row's confidence as a word (H well
//                established, M likely, L or UNVERIFIED unverified); {text, abstraction: '<§8.2 bold
//                title>'} only its Real world cell; {own: text} GRIDWATCH's own rule. A §8.1 limit is
//                the standard's, never a control room's alarm setting.
//   trigger      when the tile sets and clears: GRIDWATCH's thresholds, built from the constants
//   reading      NOW: at least one live number from vm.obs; up to its first ' · ' is the board's
// Numbers come from sim/params.js and app/alarms.js constants, never typed in; a number no constant
// holds is the cited row's. Nothing on SPEC §8.3's unverified list is stated as fact (the trip
// lockout, the swing-equation constants, ISA-18.2's acknowledge: ACK is this desk's ACK).
// tests/alarmpanel.test.js checks all of it.

import {ALARM_HELP} from '../content/alarmhelp.js';
import {CLASSIC} from '../content/scenarios.js';
import {STATION_SHORT, unitLabel, clockOf, setText, setAttr, setCls} from '../desk/util.js';

const COLS = 4, NOTE_MS = 4000;
const WORD = {alarm: 'ALARM', cleared: 'cleared, not acknowledged', ackd: 'acknowledged', normal: 'quiet'};
const GROUP = {alarm: 0, cleared: 1, ackd: 2, normal: 3};
/** Readouts: a GO TO never lands on one (§30.6). */
export const READOUT = /^(dial-freq|bar-imbalance|gauge-n1|annunciator)$/;
// GO TO <the control as the desk labels it> (desk/README.md §5 ids)
const NAMES = {stack: 'LIVE STACK', tray: 'MESSAGES', 'dial-battery': 'BATTERY', 'ring-guard': 'GUARD ring', 'wheel-hydro': 'HYDRO wheel',
  'knob-tie': 'TIE knob', 'bay-restore': 'RESTORE bay', 'bay-sync': 'SYNC bay', 'btn-redispatch': 'RE-DISPATCH', 'btn-dr': 'DR',
  'key-rert': 'reserve diesel', 'key-shed': 'DIRECT SHED', map: 'map', 'suburb-card': 'SUBURBS'};
/** The name GO TO gives a control id. */
export function controlName(id) {
  const m = /^(lever|guard-start|guard-stop)-(\w+)$/.exec(id || '');
  const sb = CLASSIC.city.suburbs.find(s => 'suburb-' + s.id === id); // (Q-56: suburb-<ID>, by its name)
  return NAMES[id] || (sb ? sb.name : !m ? String(id) :m[1] === 'lever' ? (STATION_SHORT[m[2]] || m[2]) + ' lever' : (m[1] === 'guard-stop' ? 'STOP ' : 'START ') + unitLabel(m[2]));
}
/** The plan line's first control (not a readout) while it asks to act now (▶ ACT NOW, ‼ URGENT: app/shell.js objectiveWord), else null. */
export const planTarget = o => (o && (o.level === 'act' || o.level === 'crit') && o.kind !== 'watch' && o.kind !== 'battery' &&
  (o.targets || []).find(x => !READOUT.test(x))) || null;
/** The board's order (§30.6) of vm.alarms.tiles: ids. */
export function panelOrder(tiles) {
  return tiles.map((t, i) => [t, i]).sort(([a, i], [b, j]) => GROUP[a.state] - GROUP[b.state] || b.escalated - a.escalated ||
    b.setAtS - a.setAtS || i - j).map(p => p[0].id);
}
/** ON THE REAL GRID as shown. */
export const realText = r => r.own || r.text + (r.abstraction ? ' (Simplified here: "' + r.abstraction.replace(/\.$/, '') + '" in the ? drawer.)' : '');

const CSS = `
#alarm-panel .ap{display:flex;flex-direction:column;height:100%;min-height:0}
.ap-hd,.ap-ft{display:flex;align-items:center;gap:8px;padding:4px 8px;flex:none}
.ap-hd{border-bottom:1px solid var(--line)}
.ap-hd b{flex:1;font:700 12px var(--mono);color:var(--bright);letter-spacing:.06em}
.ap-ft{border-top:1px solid var(--line);color:var(--dim);font-size:11px;flex-wrap:wrap}
.ap-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:10px;padding:6px 8px}
.ap-board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(44px,1fr);gap:4px;min-height:0}
.ap-t{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;text-align:left;white-space:normal;padding:2px 6px;overflow:hidden}
.ap-t span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--dim)}
.ap-t .ap-l{font:700 11px var(--mono);color:var(--bright)}
.ap-t.s-alarm{border-color:var(--red);background:#f8514926}
.ap-t.s-cleared{border:1px dashed var(--amber)}
.ap-t.s-ackd{border-color:#f8514980}
.ap-t.s-normal{opacity:.55}
.ap-t.esc{border:3px double var(--red)}
.ap-t[aria-selected=true]{outline:2px solid var(--blue);outline-offset:1px;opacity:1}
.ap-sel{overflow:auto;min-height:0;padding-right:4px}
.ap-sel h3{margin:0 0 2px;font:700 13px var(--mono);color:var(--bright)}
.ap-sel h4{margin:5px 0 1px;font:700 10px var(--mono);color:var(--dim);letter-spacing:.08em}
.ap-sel p{margin:0}
.ap-acts{display:flex;gap:6px;margin-top:3px}
.ap-sel .ap-trig{margin-top:6px;color:var(--dim);font-size:11px}
.ap .lit{border-color:var(--red);color:var(--bright)}
.ap .dk-note{position:static;max-width:none;border:1px solid var(--blue);background:#0d2238;color:var(--bright);padding:1px 6px;font-size:11px}`;

/**
 * @param {Document} doc
 * @param {Element} root #alarm-panel
 * @param {{ui:function(object):string}} actions the shell's actions (presentation only)
 * @returns {{update(vm:object):void, focus():void, el:Element}}
 */
export function createAlarmPanel(doc, root, actions) {
  if (!doc.getElementById('ap-css')) {
    const st = doc.createElement('style');
    st.id = 'ap-css';
    st.textContent = CSS;
    (doc.head || doc.body).appendChild(st);
  }
  const mk = (tag, cls, text, parent) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const btn = (id, text, title, parent, f) => {
    const b = mk('button', '', text, parent);
    b.id = id; b.type = 'button'; b.title = title;
    b.addEventListener('click', () => { actions.ui({do: 'cue', name: 'button'}); f(); });
    return b;
  };
  const ui = cmd => actions.ui(cmd);
  const el = mk('div', 'ap', '', root);
  const hd = mk('div', 'ap-hd', '', el), head = mk('b', '', 'ALARMS', hd);
  const close = btn('btn-alarms-close', '✕ CLOSE', 'Close (Esc or W): the clock runs as it was', hd, () => ui({do: 'alarms', on: false}));
  const main = mk('div', 'ap-main', '', el);
  const board = mk('div', 'ap-board', '', main);
  board.setAttribute('role', 'listbox');
  board.setAttribute('aria-label', 'The alarms: arrows move, the selected one is explained');
  const side = mk('div', 'ap-sel', '', main);
  const title = mk('h3', '', '', side);
  const part = (id, h, after) => { mk('h4', '', h, side); const p = mk('p', '', '', side); p.id = 'ap-' + id; if (after) side.appendChild(after); return p; };
  const acts = mk('div', 'ap-acts');
  const now = part('now', 'NOW'), todo = part('todo', 'WHAT TO DO', acts);
  const goto = btn('ap-goto', 'GO TO', 'Close the panel and go to this control; the clock stays paused', acts, () => ui({do: 'alarmsGoto', target: gotoId}));
  const ackOne = btn('ap-ack-one', 'ACK', 'This desk\'s ACK: a flashing alarm turns steady, a cleared one goes dark', acts, () => {
    if (!unacked(byId[sel])) say('Nothing to acknowledge on ' + byId[sel].label + ': it is ' + WORD[byId[sel].state] + '.');
    ui({do: 'ackTile', id: sel});
  });
  const means = part('means', 'WHAT IT MEANS'), why = part('why', 'WHY'), real = part('real', 'ON THE REAL GRID');
  const trig = mk('p', 'ap-trig', '', side);
  trig.id = 'ap-trig';
  const ft = mk('div', 'ap-ft', '', el);
  const ackAll = btn('btn-ap-ack', 'ACK ALL (A)', 'Acknowledge every alarm (A)', ft, () => {
    if (!vmNow.alarms.unacked) say('Nothing to acknowledge: ACK marks flashing alarms as seen.');
    ui({do: 'ack'});
  });
  const sil = btn('btn-ap-sil', 'HORN OFF (Shift+A)', 'Stop the horn (Shift+A); the tiles keep flashing', ft, () => {
    if (!vmNow.alarms.sounding) say('Nothing sounding: HORN OFF stops the horn, ACK marks alarms seen.');
    ui({do: 'silence'});
  });
  mk('span', '', 'Esc or W closes · Space closes and runs', ft);
  const note = mk('span', 'dk-note info', '', ft);
  note.hidden = true;

  let vmNow = null, order = null, sel = '', gotoId = '', noteUntil = -1, byId = {};
  const tiles = {};
  const unacked = t => !!t && (t.state === 'alarm' || t.state === 'cleared');
  function say(text) { setText(note, text); note.hidden = false; noteUntil = 0; }
  function select(id, focus) {
    if (!tiles[id]) return;
    if (id !== sel) { ui({do: 'alarmsSel', id}); sel = id; draw(); }
    if (focus) tiles[id].b.focus();
  }
  function tile(t) {
    const b = mk('button', 'ap-t', '', board);
    b.id = 'ap-' + t.id; b.type = 'button';
    b.setAttribute('role', 'option');
    b.addEventListener('click', () => select(t.id));
    b.addEventListener('focus', () => select(t.id));
    return (tiles[t.id] = {b, l: mk('span', 'ap-l', '', b), w: mk('span', '', '', b), r: mk('span', '', '', b)});
  }
  function sort() {
    order = panelOrder(vmNow.alarms.tiles);
    for (const id of order) board.appendChild(tiles[id].b);
  }
  root.addEventListener('keydown', ev => {
    const k = ev.key, t = ev.target;
    if (k === 'Enter' && t && t.tagName === 'BUTTON' && el.contains(t)) { ev.preventDefault(); t.click(); return; }
    if (k === 'Tab') {
      const to = !ev.shiftKey && t === sil ? close : ev.shiftKey && t === close ? sil : null;
      if (to) { ev.preventDefault(); to.focus(); }
      return;
    }
    if (!order) return;
    const i = order.indexOf(sel), n = order.length;
    const j = {ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + COLS, ArrowUp: i - COLS, Home: 0, End: n - 1}[k];
    if (j === undefined) return;
    ev.preventDefault();
    select(order[Math.max(0, Math.min(n - 1, j))], true);
  });

  function draw() {
    const v = vmNow, t = byId[sel], h = ALARM_HELP[sel];
    if (!v || !t || !h) return;
    for (const id in tiles) {
      setAttr(tiles[id].b, 'aria-selected', String(id === sel));
      setAttr(tiles[id].b, 'tabindex', id === sel ? '0' : '-1');
    }
    setText(title, t.glyph + ' ' + t.label + ' · ' + WORD[t.state] + ' · ' + t.prio + (t.escalated ? ' (escalated)' : '') +
      (t.setAtS >= 0 ? ' · set ' + clockOf(t.setAtS) : ''));
    setText(now, h.reading(v.obs, t));
    const plan = planTarget(v.objective);
    gotoId = plan || h.todo.target || t.target;
    setText(todo, (plan ? 'The plan line above says act now: GO TO ' + controlName(plan) + ' first. ' : '') + h.todo.text);
    setText(goto, 'GO TO ' + controlName(gotoId));
    setCls(ackOne, 'lit', unacked(t));
    setText(means, h.means); setText(why, h.why); setText(real, realText(h.real));
    setText(trig, 'GRIDWATCH\'s trigger: ' + h.trigger);
  }

  return {
    el,
    update(vm) {
      vmNow = vm;
      byId = {};
      for (const t of vm.alarms.tiles) {
        byId[t.id] = t;
        const T = tiles[t.id] || tile(t), h = ALARM_HELP[t.id];
        setAttr(T.b, 'class', 'ap-t s-' + t.state + (t.escalated && t.state !== 'normal' ? ' esc' : ''));
        setText(T.l, (t.escalated ? '‼' : '') + t.glyph + ' ' + t.label);
        setText(T.w, WORD[t.state] + ' · ' + t.prio);
        setText(T.r, h ? h.reading(vm.obs, t).split(' · ')[0] : '');
        setAttr(T.b, 'aria-label', t.label + ': ' + WORD[t.state] + ', ' + t.prio + (t.escalated ? ', escalated' : ''));
      }
      if (!order) sort();
      if (vm.alarmsSel && byId[vm.alarmsSel]) sel = vm.alarmsSel;
      else if (!byId[sel]) sel = order[0];
      const m = vm.mode && vm.mode.mode;
      setText(head, 'ALARMS' + (m === 'ALARMS' ? ' · clock held' : vm.phase === 'briefing' ? ' · before the desk opens' : '') +
        ' · ' + vm.alarms.unacked + ' to acknowledge');
      setCls(ackAll, 'lit', vm.alarms.unacked > 0);
      setCls(sil, 'lit', !!vm.alarms.sounding);
      setText(sil, (vm.alarms.sounding ? '♪ ' : '') + 'HORN OFF (Shift+A)');
      const ms = vm.frame ? vm.frame.nowMs : 0;
      if (noteUntil === 0) noteUntil = ms + NOTE_MS;
      else if (noteUntil > 0 && ms > noteUntil) { note.hidden = true; noteUntil = -1; }
      draw();
    },
    // once per opening (the shell): the board is sorted again for this opening, and CLOSE takes the focus
    focus() { if (vmNow) sort(); close.focus(); },
  };
}
