// desk/levers.js: K-1 motorised unit levers and the K-3 machine guards (desk/README.md §6).
//
// One lever per station (COAL, CCGT, GT·A, GT·B, GT·C). The handle is the station's base point
// (the plan's now-edge, obs.stations[].basePointMW); behind it the output needle (outMW), the AGC
// band bracket (base ± band, K-2), the 10-grid-minute ramp cone, detent ticks at MIN/25/50/75%,
// the 96% spring gate with its red zone (H-2 trip risk) and a tick for the next plan keyframe.
// A drag sends `basePoint` on release (and at most every 250 ms while dragging); ↑/↓ ±10 MW,
// Shift ±1, PgUp/PgDn next detent; crossing the gate needs 12 px of extra drag or Shift+↑.
// K-24 (Q-93): on an AGC day the lever is the dispatch's readout (a press answers in blue, DISPATCH_NOTE) and the
// station's START / STOP word buttons (stationButtons) press its machines' guards; HAND keeps the live lever.
// One lamp per machine with its own START and STOP guards (lift, then press; S S / X X).
// Phase 2a (C-10, desk/README.md §19.5): a guard lights when its id is in vm.glow (the
// objective's STOP or START), and tells the desk when it is hovered, pressed by a pointer,
// focused, lifted or committed (ctx.consider), so the shell can say what the press will do
// before it is made.
// Foley (K-20): a hand move cues `detent` / `gate` / `ratchet`, a plan move cues `servo`; guards
// cue `cover` (lift, drop) and `button` (the press that commits). A rough close shakes the lever.

import {V} from '../sim/params.js';
import {leverScale, nextDetent, rampCone, agcBandMW, stationUnits} from './calc.js';
import {lockedNote} from './emergency.js';
import {el, control, setText, setAttr, setCls, setStyle, setHidden, mw, clamp, fin, clockOf, mmss, unitLabel,
  STATION_SHORT, LEVER_STATIONS, MODE_GLYPH, MODE_WORD, PAN, GUARD_MS, GUARD_CLICK_MS, DISPATCH_NOTE, agcDesk} from './util.js';

export const GATE_PX = 12;          // K-1: extra drag past the spring gate
export const DRAG_SEND_MS = 250;    // K-1: at most one basePoint per 250 ms while dragging
export const KEY_STEP_MW = 10, KEY_FINE_MW = 1;
export const HAND_MS = 500;         // K-20: no servo cue within 0.5 s of a hand move
export const SERVO_MS = 250;        // K-20: at most one servo cue per lever per 0.25 s
export const SHAKE_MS = 600;        // K-12: a rough close shakes the lever this long
// H-18 (Q-102): above the 96% gate a machine has no raise headroom left; nothing trips for running there.
const AT_LIMIT = 'above 96%: no raise headroom (T previews a trip)';
const KEY_S = GUARD_MS / 1000, CLICK_S = GUARD_CLICK_MS / 1000;

const pct = (v, total) => (total > 0 ? clamp(fin(v) / total, 0, 1) * 100 : 0);
/** Help, blue (Q-41: red is only the grid's refusal, ctx.send's '✕ reason'). */
export const help = (ctx, host, text) => ctx.note(host, text, undefined, 'info');
/** True while the desk is locked; the press is answered by lockedNote (the watch: ctx.lockNote; the day over says so). */
export function lockedPress(ctx, host) {
  if (!ctx.locked()) return false;
  lockedNote(ctx, host);
  return true;
}
/** Locked: the keys of the controls in `host` (arrows, Page, Home/End, `letters`) get the lock note, not the fallback map. */
export function lockKeys(ctx, host, letters = '') {
  host.addEventListener('keydown', ev => {
    const k = ev.key || '';
    if (ev.ctrlKey || ev.altKey || ev.metaKey || !(/^(Arrow|Page|Home$|End$)/.test(k) || k.length === 1 && letters.includes(k.toLowerCase()))) return;
    if (lockedPress(ctx, host)) ev.preventDefault();
  });
}

// ---------------------------------------------------------------- one machine: lamp + guards (K-3)

/**
 * The START / STOP guards of machine k (V.MACHINES index). START: lift, then press (off units);
 * on a READY unit it opens the synchroscope. STOP: lift, then press (cancels a start while
 * starting/ready); while unloading/shutdown it offers ABORT (one press, restores the unit).
 */
export function createMachine(ctx, k, pan) {
  const doc = ctx.doc, m = V.MACHINES[k];
  const name = unitLabel(m.id), kc = m.station === 'hydro' ? 6 : LEVER_STATIONS.indexOf(m.station) + 1;   // its K-23 key
  const box = el(doc, 'div', 'dk-mach');
  box.dataset.unit = m.id;
  const start = el(doc, 'button', 'dk-guard dk-start');
  start.id = 'guard-start-' + m.id; start.type = 'button';
  const stop = el(doc, 'button', 'dk-guard dk-stop');
  stop.id = 'guard-stop-' + m.id; stop.type = 'button';
  // K-24: on an AGC day the machine is a lamp; its station's START and STOP press its guards (stationButtons)
  const lamp = el(doc, 'span', 'dk-lamp');
  lamp.id = 'lamp-' + m.id;
  box.append(start, stop, lamp);
  let agc = false;
  let u = null, offered = false, wasS = false, wasX = false, glowS = false, glowX = false;
  let keyS = false, keyX = false;   // lifted by S / X
  let last = '';                    // 'CCGT 2 START sent': said again by a press in the 1-s rest
  // C-10: hover and focus on either guard are the desk's to resolve (ctx.consider, desk.js); it
  // is told of a pointer press too, because the focus a click leaves on a button is not the keyboard's
  for (const g of [start, stop]) {
    g.addEventListener('pointerenter', () => ctx.consider.hover(g.id, true));
    g.addEventListener('pointerleave', () => ctx.consider.hover(g.id, false));
    g.addEventListener('pointerdown', () => ctx.consider.press(g.id));
    g.addEventListener('pointerup', () => ctx.consider.up(g.id));
    g.addEventListener('pointercancel', () => ctx.consider.up(g.id));
    g.addEventListener('focus', () => ctx.consider.focus(g.id, true));
    g.addEventListener('blur', () => ctx.consider.focus(g.id, false));
  }

  const startAction = () => (!u ? '' : u.mode === 'off' ? (u.startBlock ? '' : 'start') : u.mode === 'ready' ? 'scope' : '');
  const stopAction = () => {
    if (!u) return '';
    if (u.mode === 'starting' || u.mode === 'ready') return 'cancel';
    if (u.mode === 'on' || u.mode === 'loading') return u.stopBlock ? '' : 'stop';
    if (u.mode === 'unloading' || u.mode === 'shutdown') return stopWhy() ? '' : 'abort';
    return '';
  };
  const why = () => (!u ? '' : u.mode === 'off' ? u.startBlock || '' : u.mode === 'starting' ? 'full speed in ' + mmss(u.timerS) :
    u.mode === 'tripped' ? 'locked out ' + mmss(u.timerS) : '');
  const stopWhy = () => (!u ? '' : u.mode === 'on' || u.mode === 'loading' ? u.stopBlock || '' : (u.mode === 'unloading' || u.mode === 'shutdown') &&
    m.station === 'hydro' && ctx.vm().obs.hydro.storageMWh <= V.HYDRO_STOP_MWH ? 'no water to keep it on' : '');
  const says = r => name + ' ' + MODE_WORD[u ? u.mode : 'off'] + (r ? ': ' + r : '');

  // START with nothing to start: what the unit does, what to press instead
  const startHelp = () => (!u ? '' : /^(on|loading)$/.test(u.mode) ? (m.station === 'hydro' ? 'the wheel' : 'its lever') + ' sets the MW' :
    /^(unloading|shutdown)$/.test(u.mode) ? stopWhy() || '↺ puts it back on' : u.mode === 'tripped' ? why() + ', then START' : why());
  const sent = (x, what) => { if (!ctx.send(x, box)) { ctx.guards.lock(m.id); last = name + what + ' sent'; ctx.cue('button', pan); ctx.live(last); } };
  const rest = () => help(ctx, box, last + (why() ? ': ' + why() : ''));
  /** K-3: press 1 lifts g, press 2 sends x (then the unit's guards rest COMMIT_LOCK_MS) */
  function guarded(g, what, x, key) {
    const res = ctx.guards.press(g.id, () => {
      if (g === start) wasS = false; else wasX = false;
      ctx.ui({do: 'armed', target: g.id, on: false});   // no frame sees this drop
      sent(x, what);
    }, key ? GUARD_MS : GUARD_CLICK_MS);
    if (res === 'lift') {
      if (g === start) keyS = key; else keyX = key;
      ctx.live(name + what + ' armed: press again within ' + (key ? KEY_S : CLICK_S) + ' s');
      ctx.consider.lift(g.id, key);
    } else ctx.consider.commit(g.id);
    render();
  }

  /** @param {boolean} [byKey] the press came from S on the station's lever, not from the guard itself */
  function pressStart(byKey) {
    if (lockedPress(ctx, box)) return;
    if (ctx.guards.locked(m.id)) { rest(); return; }
    const a = startAction();
    if (!a) { help(ctx, box, says(startHelp())); return; }
    if (a === 'scope') {
      const r = ctx.send({type: 'scope', unit: m.id}, box);
      if (!r) { ctx.cue('button', pan); if (offered) ctx.ui({do: 'offerTaken', unit: m.id}); ctx.showBay('sync'); }
      return;
    }
    guarded(start, ' START', {type: 'start', unit: m.id}, byKey === true);
  }
  /** @param {boolean} [byKey] the press came from X on the station's lever */
  function pressStop(byKey) {
    if (lockedPress(ctx, box)) return;
    if (ctx.guards.locked(m.id)) { rest(); return; }
    const a = stopAction();
    if (!a) { help(ctx, box, says(stopWhy() || 'nothing to stop')); return; }
    if (a === 'abort') sent({type: 'abortStop', unit: m.id}, ' ABORT');
    else guarded(stop, a === 'cancel' ? ' CANCEL START' : ' STOP', {type: 'stop', unit: m.id}, byKey === true);
  }
  // a folded guard (keys only) presses the armed one
  start.addEventListener('click', () => (ctx.guards.lifted(stop.id) ? pressStop : pressStart)(false));
  stop.addEventListener('click', () => (ctx.guards.lifted(start.id) ? pressStart : pressStop)(false));

  function render() {
    if (!u) return;
    const sa = startAction(), so = stopAction();
    // a cover drops when its press changes
    if (sa !== 'start') ctx.guards.drop(start.id);
    if (so !== 'stop' && so !== 'cancel') ctx.guards.drop(stop.id);
    const upS = ctx.guards.lifted(start.id), upX = ctx.guards.lifted(stop.id);
    // A guard lifting, or dropping unused, clicks (a commit has its own button cue) and tells the shell.
    if (upS !== wasS) { wasS = upS; ctx.cue('cover', pan); ctx.ui({do: 'armed', target: start.id, on: upS}); }
    if (upX !== wasX) { wasX = upX; ctx.cue('cover', pan); ctx.ui({do: 'armed', target: stop.id, on: upX}); }
    setAttr(start, 'aria-pressed', upS ? 'true' : 'false');
    setAttr(stop, 'aria-pressed', upX ? 'true' : 'false');
    setAttr(start, 'tabindex', upX ? -1 : 0); setAttr(stop, 'tabindex', upS ? -1 : 0);
    setAttr(box, 'class', 'dk-mach m-' + u.mode + (u.hotS > 0 ? ' hot' : '') + (offered ? ' offered' : '') + (upS || upX ? ' armed' : ''));
    setText(start, upS ? 'START?' : (MODE_GLYPH[u.mode] || '?') + m.j);
    setHidden(start, agc); setHidden(stop, agc); setHidden(lamp, !agc);
    setText(lamp, (MODE_GLYPH[u.mode] || '?') + m.j + (u.mode === 'starting' || u.mode === 'tripped' ? ' ' + mmss(u.timerS) : ''));
    setAttr(lamp, 'title', name + ' · ' + MODE_WORD[u.mode] + (u.sync ? ' · ' + mw(u.outMW) + ' MW' : ''));
    setText(stop, upX ? (so === 'cancel' ? 'CANCEL?' : 'STOP?') : so === 'abort' ? '↺' : so ? '■' : '·');
    setCls(start, 'lifted', upS); setCls(stop, 'lifted', upX);
    setCls(start, 'key', upS && keyS); setCls(stop, 'key', upX && keyX);
    setCls(start, 'live', !!sa); setCls(stop, 'live', !!so);
    setCls(start, 'glow', glowS); setCls(stop, 'glow', glowX);   // L-9 / C-10: the objective points at this guard
    const hint = ' (the objective points here)';
    setAttr(start, 'aria-disabled', sa ? 'false' : 'true');
    setAttr(stop, 'aria-disabled', so ? 'false' : 'true');
    const w = why(), sw = stopWhy(), verb = so === 'cancel' ? 'CANCEL START' : 'STOP', twice = ' (guarded: press twice within ' + CLICK_S + ' s, or ';
    setAttr(start, 'title', sa === 'start' ? 'START ' + name + ': click, then click START? to confirm (keys: ' + kc + ', S S)' :
      sa === 'scope' ? 'SYNC ' + name + ': open the synchroscope (' + (ctx.vm().obs.mode === 'AGC' ? 'auto-sync in ' + mmss(u.timerS) : 'HAND: you close it') + ')' : says(w));
    setAttr(stop, 'title', so === 'abort' ? 'ABORT: one click puts ' + name + ' back on' :
      so ? verb + ' ' + name + ': click, then click again to confirm (keys: ' + kc + ', X X)' : sw ? says(sw) : name + ': nothing to stop');
    const hot = u.hotS > 0 ? ', ' + AT_LIMIT : '';
    setAttr(start, 'aria-label', name + ' ' + MODE_WORD[u.mode] + hot + ': ' + (upS ? 'START armed, press again to start' :
      sa === 'start' ? 'START' + twice + 'S S within ' + KEY_S + ' s)' : sa === 'scope' ? 'open synchroscope' : w || 'no start') + (glowS ? hint : ''));
    setAttr(stop, 'aria-label', name + ': ' + (upX ? verb + ' armed, press again' : so === 'abort' ? 'ABORT STOP' :
      so ? verb + twice + 'X X within ' + KEY_S + ' s)' : 'no stop' + (sw ? ', ' + sw : '')) + (glowX ? hint : ''));
    setAttr(box, 'title', name + ' · ' + MODE_WORD[u.mode] + (u.sync ? ' · ' + mw(u.outMW) + ' MW' : '') +
      (u.hotS > 0 ? ' · ' + AT_LIMIT : '') + (w || sw ? ' · ' + w + sw : ''));
  }

  return {
    el: box, start, stop, id: m.id, k,
    update(vm) {
      u = vm.obs.units[k];
      agc = agcDesk(vm);
      offered = !!(vm.offers && vm.offers.some(o => o.unit === m.id));
      glowS = !!(vm.glow && vm.glow.has(start.id)); glowX = !!(vm.glow && vm.glow.has(stop.id));
      render();
    },
    pressStart, pressStop, startAction, stopAction,
    mode: () => (u ? u.mode : 'off'),
    timerS: () => (u ? u.timerS : 0),
    glowS: () => glowS, glowX: () => glowX,
  };
}

/** S / X on a focused station: the first startable machine, or the last stoppable one (K-3, K-23). */
export function stationKey(machines, key) {
  if (key === 's') {
    const m = machines.find(x => x.startAction() === 'start');
    if (m) { m.pressStart(true); return true; }
  } else if (key === 'x') {
    for (let i = machines.length - 1; i >= 0; i--) {
      const a = machines[i].stopAction();
      if (a === 'stop' || a === 'cancel') { machines[i].pressStop(true); return true; }
    }
  }
  return false;
}

/** S / X that found nothing (stationKey false): what each machine is doing, as help (it may follow S S); a READY unit is O's. */
export function nothingTo(ctx, host, machines, k) {
  const s = k === 's', all = machines.filter(m => !(s ? /^(on|loading|ready)$/ : /^(off|tripped)$/).test(m.mode())).map(m => (s ? m.start : m.stop).getAttribute('title')).join(', ');
  ctx.note(host, 'nothing to ' + (s ? 'start: ' + (all || 'all running') : 'stop: ' + (all || 'none running')), 5000, 'info');
}

/**
 * K-24 (Q-93): a station's two word buttons on an AGC day, START and STOP, beside its lamps. Each presses one
 * machine's guard (the guard sequence, the two-press rule and the "? IF PRESSED" line unchanged): the machine
 * whose cover is up, else the one the line points at, else the first that can start (a READY one opens its
 * scope) or the last that can stop. Labels: START? / STOP? (CANCEL?) armed; "◔ 4:59" while the only machine left
 * is starting; "✕ 12:00" while it is locked out. Ids station-start-<sid>, station-stop-<sid>.
 */
export function stationButtons(ctx, sid, machines, pan) {
  const doc = ctx.doc, S = STATION_SHORT[sid];
  const row = el(doc, 'div', 'dk-stbtns');
  const bs = el(doc, 'button', 'dk-btn dk-stbtn dk-stbtn-start', 'START'), bx = el(doc, 'button', 'dk-btn dk-stbtn dk-stbtn-stop', 'STOP');
  bs.setAttribute('aria-label', S + ' START'); bx.setAttribute('aria-label', S + ' STOP');
  bs.id = 'station-start-' + sid; bs.type = 'button';
  bx.id = 'station-stop-' + sid; bx.type = 'button';
  row.append(bs, bx);
  let on = false;
  const lifted = g => ctx.guards.lifted(g.id);
  const forStart = () => machines.find(m => lifted(m.start)) || machines.find(m => m.glowS() && m.startAction()) ||
    machines.find(m => m.startAction() === 'start') || machines.find(m => m.startAction() === 'scope') ||
    machines.find(m => ctx.guards.locked(m.id)) || machines.find(m => m.mode() === 'off') || null;   // (one resting after its press, or an OFF one that cannot start, says why)
  const forStop = () => {
    const can = m => m.stopAction() !== '';
    const any = machines.find(m => lifted(m.stop)) || machines.find(m => m.glowX() && can(m));
    if (any) return any;
    for (let i = machines.length - 1; i >= 0; i--) if (machines[i].stopAction() === 'stop' || machines[i].stopAction() === 'cancel') return machines[i];
    for (let i = machines.length - 1; i >= 0; i--) if (can(machines[i])) return machines[i];
    return null;
  };
  // C-10: what the press would do is the chosen machine's guard's (hover, focus, press)
  let hov = {start: '', stop: ''};
  const target = (b, m) => (m ? (b === bs ? m.start.id : m.stop.id) : '');
  for (const [b, pick, k] of [[bs, forStart, 'start'], [bx, forStop, 'stop']]) {
    b.addEventListener('pointerenter', () => { hov[k] = target(b, pick()); if (hov[k]) ctx.consider.hover(hov[k], true); });
    b.addEventListener('pointerleave', () => { if (hov[k]) ctx.consider.hover(hov[k], false); hov[k] = ''; });
    b.addEventListener('focus', () => { const t = target(b, pick()); if (t) ctx.consider.focus(t, true); });
    b.addEventListener('blur', () => { for (const m of machines) ctx.consider.focus(k === 'start' ? m.start.id : m.stop.id, false); });
  }
  bs.addEventListener('click', () => {
    if (lockedPress(ctx, row)) return;
    const m = forStart();
    if (m) { ctx.consider.press(m.start.id); m.pressStart(false); ctx.consider.up(m.start.id); return; }
    help(ctx, row, S + ': nothing to start (' + machines.map(x => x.start.getAttribute('title')).join(', ') + ')');
  });
  bx.addEventListener('click', () => {
    if (lockedPress(ctx, row)) return;
    const m = forStop();
    if (m) { ctx.consider.press(m.stop.id); m.pressStop(false); ctx.consider.up(m.stop.id); return; }
    help(ctx, row, S + ': nothing to stop (none running)');
  });
  return {
    el: row,
    update(vm) {
      on = agcDesk(vm);
      setHidden(row, !on);
      if (!on) return;
      const ms = forStart(), mx = forStop();
      const upS = !!ms && lifted(ms.start), upX = !!mx && lifted(mx.stop);
      const canS = !!ms && !!ms.startAction(), canX = !!mx && !!mx.stopAction();   // (a press that only says why is not live)
      const starting = machines.filter(m => m.mode() === 'starting'), out = machines.filter(m => m.mode() === 'tripped');
      setText(bs, upS ? 'START?' : canS ? 'START' : starting.length ? '◔ ' + mmss(Math.min(...starting.map(m => m.timerS()))) :
        out.length ? '✕ ' + mmss(Math.min(...out.map(m => m.timerS()))) : 'START');
      setText(bx, upX ? (mx.stopAction() === 'cancel' ? 'CANCEL?' : 'STOP?') : 'STOP');
      setCls(bs, 'lifted', upS); setCls(bx, 'lifted', upX);
      setCls(bs, 'live', canS); setCls(bx, 'live', canX);
      setCls(bs, 'glow', machines.some(m => m.glowS())); setCls(bx, 'glow', machines.some(m => m.glowX()));
      setAttr(bs, 'aria-disabled', canS ? 'false' : 'true'); setAttr(bx, 'aria-disabled', canX ? 'false' : 'true');
      setAttr(bs, 'aria-pressed', upS ? 'true' : 'false'); setAttr(bx, 'aria-pressed', upX ? 'true' : 'false');
      setAttr(bs, 'title', ms ? ms.start.getAttribute('title') : S + ': nothing to start');
      setAttr(bx, 'title', mx ? mx.stop.getAttribute('title') : S + ': nothing to stop');
      setAttr(bs, 'aria-label', S + ' START: ' + (ms ? ms.start.getAttribute('aria-label') : 'nothing to start'));
      setAttr(bx, 'aria-label', S + ' STOP: ' + (mx ? mx.stop.getAttribute('aria-label') : 'nothing to stop'));
    },
  };
}

/** P on a station (K-2, L-6): why it already follows the plan; `how` says, in HAND, how it leaves it. */
export const planSays = (vm, sid, how) => (vm.obs.mode === 'HAND' ? STATION_SHORT[sid] + ' follows the plan: ' + how :
  vm.held ? 'AGC: RE-DISPATCH (N) hands the levers back' : 'AGC: ' + (sid === 'hydro' ? 'the wheel follows' : 'levers follow') + ' the plan already');
/** P (Shift: KEEP): back on the plan when off it (MAN), else why not; answered in blue either way. */
export function rejoinPlan(ctx, host, sid, keep, how, pan) {
  const vm = ctx.vm();
  if (!vm || lockedPress(ctx, host)) return;
  const pl = vm.obs.plan, p = pl && pl.stations ? pl.stations.find(x => x.id === sid) : null, S = STATION_SHORT[sid];
  if (!p || !p.man) { help(ctx, host, planSays(vm, sid, how)); return; }
  if (!ctx.send({type: 'planRejoin', station: sid, keep: !!keep}, host)) { ctx.cue('button', pan); help(ctx, host, S + (keep ? ' KEEP: the plan goes on from here' : ' back on the plan')); }
}

// ---------------------------------------------------------------- one lever

function createLever(ctx, sid, parent) {
  const doc = ctx.doc;
  const slot = el(doc, 'div', 'dk-lever-slot');
  slot.dataset.station = sid;
  const head = el(doc, 'div', 'dk-lever-head');
  const name = el(doc, 'span', 'dk-lever-name');
  name.append(el(doc, 'kbd', 'dk-kcap', LEVER_STATIONS.indexOf(sid) + 1), STATION_SHORT[sid]);   // its K-23 key
  const man = el(doc, 'button', 'dk-man', 'M');
  man.id = 'man-' + sid; man.type = 'button';
  man.setAttribute('aria-label', STATION_SHORT[sid] + ' MAN lamp: double-click or P to resume the plan, Shift+P to keep');
  head.append(name, man);
  const body = el(doc, 'div', 'dk-lever-body');
  const pan = PAN[sid];
  const track = control(doc, 'div', 'dk-track', 'slider', 'lever-' + sid, STATION_SHORT[sid] + ' lever');
  setAttr(track, 'aria-orientation', 'vertical');
  setAttr(track, 'aria-keyshortcuts', String(LEVER_STATIONS.indexOf(sid) + 1));
  const off = el(doc, 'div', 'dk-offzone'), gate = el(doc, 'div', 'dk-gatezone'), gateLbl = el(doc, 'span', 'dk-gate-label');
  gate.appendChild(gateLbl);
  const cone = el(doc, 'div', 'dk-cone'), band = el(doc, 'div', 'dk-band'), ticks = el(doc, 'div', 'dk-ticks');
  const needle = el(doc, 'div', 'dk-needle'), ghost = el(doc, 'div', 'dk-ghost'), handle = el(doc, 'div', 'dk-handle');
  track.append(off, gate, ticks, cone, band, ghost, needle, handle);
  const machCol = el(doc, 'div', 'dk-machs');
  const st = V.STATIONS[sid];
  const machines = [];
  for (let k = st.first; k < st.first + st.count; k++) { const m = createMachine(ctx, k, pan); machines.push(m); machCol.appendChild(m.el); }
  const words = stationButtons(ctx, sid, machines, pan);
  machCol.prepend(words.el);
  body.append(track, machCol);
  const foot = el(doc, 'div', 'dk-lever-foot');
  const rBase = el(doc, 'span', 'dk-rd-base'), rOut = el(doc, 'span', 'dk-rd-out');
  foot.append(rBase, el(doc, 'span', 'dk-rd-sep', '▸'), rOut);
  foot.title = 'SET (white): where the lever is ▸ OUT (orange): what ' + STATION_SHORT[sid] + ' makes now, MW';
  slot.append(head, body, foot);
  parent.appendChild(slot);

  let vm = null, sc = leverScale({stations: [], units: []}, sid), ticksKey = '';
  // local: a value the player is moving (drag / keys), shown instead of the vm's until the
  // input has been through a frame (never assume it was accepted).
  let drag = null;            // {crossed, t0, lastSendT, lastSent, v}
  let pending = null;         // {v, t} key moves not yet sent
  let shown = null;           // {v, afterTick, frames} value sent, shown until a later tick (or the second frame) arrives
  // Foley state: the base point last frame (a change the hand did not make is the plan's servo),
  // when the hand last moved the lever, the last servo cue, and the rough-close shake's end.
  let prevBase = null, handT = -1e12, servoT = -1e12, shakeUntil = -1;
  const feelSt = {};
  const feel = (a, b) => { handT = ctx.now(); ctx.feel(feelSt, Math.round(a), Math.round(b), sc.detents, gateOn() ? sc.gateMW : null, pan); };

  const obs = () => vm.obs;
  const stationObs = () => obs().stations.find(x => x.id === sid);
  const baseNow = () => fin(stationObs() && stationObs().basePointMW);
  const current = () => (drag ? drag.v : pending ? pending.v : shown ? shown.v : baseNow());
  const bounds = () => (sc.onCount > 0 ? [sc.minMW, sc.maxMW] : [0, sc.totalMW]);
  const gateOn = () => sc.onCount > 0 && sc.gateMW > sc.minMW;

  function send(v, final) {
    const o = obs();
    const x = Math.round(v);
    let r;
    if (sc.onCount > 0) r = ctx.send({type: 'basePoint', station: sid, mw: x}, slot);
    else if (!final) return '';
    else { help(ctx, slot, 'no machine on: START one first (S S)'); r = 'no machine on'; }   // (K-24: only HAND reaches here)
    shown = r ? null : {v: x, afterTick: o.tick, frames: 0};
    handT = ctx.now();
    if (!r) ctx.live(STATION_SHORT[sid] + ' ' + x + ' MW');
    return r;
  }

  // ---- pointer: the handle follows the pointer along the track
  function mwAt(y) {
    const r = track.getBoundingClientRect();
    return r.height > 0 ? (r.bottom - y) / r.height * sc.totalMW : 0;
  }
  function dragTo(y) {
    const [lo, hi] = bounds();
    let v = clamp(mwAt(y), lo, hi);
    if (gateOn()) {
      if (!drag.crossed && v > sc.gateMW) {
        const r = track.getBoundingClientRect();
        const gateY = r.bottom - sc.gateMW / sc.totalMW * r.height;
        if (gateY - y >= GATE_PX) drag.crossed = true; else v = sc.gateMW;
      } else if (drag.crossed && v <= sc.gateMW) drag.crossed = false;
    }
    const was = drag.v;
    drag.v = Math.round(v);
    feel(was, drag.v);
  }
  const readout = () => { if (!agcDesk(vm)) return false; help(ctx, slot, DISPATCH_NOTE); return true; };   // K-24
  track.addEventListener('pointerdown', ev => {
    if (!vm || lockedPress(ctx, slot) || readout()) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    track.setPointerCapture && track.setPointerCapture(ev.pointerId);
    const t = ctx.now();
    drag = {crossed: gateOn() && baseNow() > sc.gateMW, t0: t, lastSendT: -1e12, lastSent: null, v: baseNow()};
    pending = null;
    dragTo(ev.clientY);
    track.focus && track.focus();
    render();
  });
  track.addEventListener('pointermove', ev => {
    if (!drag) return;
    dragTo(ev.clientY);
    const t = ctx.now();
    if (sc.onCount > 0 && t - drag.t0 >= DRAG_SEND_MS && t - drag.lastSendT >= DRAG_SEND_MS && drag.v !== drag.lastSent) {
      drag.lastSendT = t; drag.lastSent = drag.v;
      send(drag.v, false);
    }
    render();
  });
  const release = ev => {
    if (!drag) return;
    if (ev && ev.clientY !== undefined && ev.type === 'pointerup') dragTo(ev.clientY);
    const d = drag;
    drag = null;
    if (ctx.locked()) { render(); return; }
    if (d.v !== d.lastSent || sc.onCount === 0) send(d.v, true);
    render();
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  track.addEventListener('lostpointercapture', release);
  slot.addEventListener('pointerenter', () => ctx.ui({do: 'hover', target: 'lever-' + sid}));
  slot.addEventListener('pointerleave', () => ctx.ui({do: 'hover', target: null}));
  // The same cross-highlight for the keyboard (K-23: nothing hover-only).
  track.addEventListener('focus', () => ctx.ui({do: 'hover', target: 'lever-' + sid}));
  track.addEventListener('blur', () => ctx.ui({do: 'hover', target: null}));

  // ---- keyboard (K-23): ↑↓ ±10, Shift ±1 (and crosses the gate), PgUp/PgDn detents, Home/End
  track.addEventListener('keydown', ev => {
    if (!vm || ctx.locked()) return;
    if (/^(Arrow|Page|Home$|End$)/.test(ev.key) && agcDesk(vm)) { ev.preventDefault(); readout(); return; }
    const v = current(), [lo, hi] = bounds();
    let t = null;
    const up = ev.key === 'ArrowUp' || ev.key === 'ArrowRight', down = ev.key === 'ArrowDown' || ev.key === 'ArrowLeft';
    if (up) t = v + (ev.shiftKey ? KEY_FINE_MW : KEY_STEP_MW);
    else if (down) t = v - (ev.shiftKey ? KEY_FINE_MW : KEY_STEP_MW);
    else if (ev.key === 'PageUp') t = nextDetent(v, sc.detents, 1);
    else if (ev.key === 'PageDown') t = nextDetent(v, sc.detents, -1);
    else if (ev.key === 'Home') t = lo;
    else if (ev.key === 'End') t = gateOn() ? sc.gateMW : hi;
    if (t === null) return;
    ev.preventDefault();
    // The spring gate: only Shift+↑ crosses it (K-1).
    if (gateOn() && v <= sc.gateMW && t > sc.gateMW && !(up && ev.shiftKey)) t = sc.gateMW;
    t = Math.round(clamp(t, lo, hi));
    feel(v, t);
    pending = {v: t, t: pending ? pending.t : ctx.now()};
    render();
  });
  track.addEventListener('keyup', ev => {
    if (!pending) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(ev.key)) flush();
  });
  function flush() {
    if (!pending) return;
    const v = pending.v;
    pending = null;
    if (!ctx.locked() && Math.round(v) !== Math.round(baseNow())) send(v, true);
    render();
  }

  // ---- HAND: the MAN lamp rejoins the plan (K-2, L-6)
  const HOW = 'M lights once you move it';
  const rejoin = keep => { if (vm) rejoinPlan(ctx, slot, sid, keep, HOW, pan); };
  man.addEventListener('dblclick', ev => rejoin(ev.shiftKey));
  man.addEventListener('click', () => { if (vm && !lockedPress(ctx, slot)) help(ctx, slot, planOf() && planOf().man ? 'double-click or P: RESUME PLAN · Shift+P: KEEP' : planSays(vm, sid, HOW)); });
  lockKeys(ctx, slot, 'sxp');
  const planOf = () => (obs().plan && obs().plan.stations ? obs().plan.stations.find(x => x.id === sid) : null);

  // ---- render
  function render() {
    if (!vm) return;
    const o = obs(), so = stationObs() || {basePointMW: 0, outMW: 0, onCount: 0, minMW: 0, maxMW: 0};
    const T = sc.totalMW, v = current();
    setStyle(handle, 'bottom', 'calc(' + pct(v, T).toFixed(2) + '% - 12px)');
    setStyle(needle, 'bottom', pct(so.outMW, T).toFixed(2) + '%');
    setStyle(off, 'bottom', pct(sc.maxMW, T).toFixed(2) + '%');
    setStyle(off, 'height', (100 - pct(sc.maxMW, T)).toFixed(2) + '%');
    const gOn = gateOn();
    setHidden(gate, !gOn);
    if (gOn) {
      setStyle(gate, 'bottom', pct(sc.gateMW, T).toFixed(2) + '%');
      setStyle(gate, 'height', Math.max(0, pct(sc.maxMW, T) - pct(sc.gateMW, T)).toFixed(2) + '%');
    }
    const b = agcBandMW(o, sid);
    setHidden(band, !(b > 0 && so.onCount > 0));
    if (b > 0) {
      const lo = clamp(fin(so.basePointMW) - b, sc.minMW, sc.maxMW), hi = clamp(fin(so.basePointMW) + b, sc.minMW, sc.maxMW);
      setStyle(band, 'bottom', pct(lo, T).toFixed(2) + '%');
      setStyle(band, 'height', Math.max(0, pct(hi, T) - pct(lo, T)).toFixed(2) + '%');
    }
    const c = rampCone(o, sid);
    setHidden(cone, !(so.onCount > 0));
    setStyle(cone, 'bottom', pct(c.loMW, T).toFixed(2) + '%');
    setStyle(cone, 'height', Math.max(0, pct(c.hiMW, T) - pct(c.loMW, T)).toFixed(2) + '%');
    const p = planOf();
    const nk = p && p.keys ? p.keys.find(k => k.atS > o.s) : null;
    setHidden(ghost, !nk);
    if (nk) { setStyle(ghost, 'bottom', pct(nk.mw, T).toFixed(2) + '%'); setAttr(ghost, 'title', 'plan: ' + mw(nk.mw) + ' MW by ' + clockOf(nk.atS)); }
    // Detent ticks (rebuilt when the committed capacity changes).
    const key = sc.detents.join(',');
    if (key !== ticksKey) {
      ticksKey = key;
      ticks.replaceChildren();
      for (const d of sc.detents) { const t = el(doc, 'i', 'dk-tick'); setStyle(t, 'bottom', pct(d, T).toFixed(2) + '%'); ticks.appendChild(t); }
    }
    // At the limit: the station above its gate or any machine above it (H-18: no raise headroom, no trip).
    const units = stationUnits(o, sid);
    const hotS = Math.max(0, ...units.map(u => fin(u.hotS)));
    const over = hotS > 0 || (gOn && v > sc.gateMW);
    setCls(slot, 'hot', over);
    setText(gateLbl, over ? '! >96%' : '96%');
    setAttr(gate, 'title', 'Spring gate at 96% of available: above it a machine has no raise headroom left for AGC or a trip (T previews one)');
    // HAND: MAN lamp; AGC: hidden (no MAN state in AGC, K-2).
    const hand = o.mode === 'HAND';
    setHidden(man, !hand);
    setCls(man, 'lit', !!(p && p.man));
    setText(man, p && p.man ? 'M' : 'P');
    setCls(slot, 'hand', hand);
    setCls(slot, 'idle', so.onCount === 0);
    setCls(slot, 'moving', !!(drag || pending));
    setCls(slot, 'glow', !!(vm.glow && vm.glow.has('lever-' + sid)));
    setCls(slot, 'hover', vm.hover === 'lever-' + sid);
    setCls(slot, 'shake', ctx.now() < shakeUntil && !ctx.rm());
    setText(rBase, mw(v));
    setText(rOut, mw(so.outMW));
    setAttr(track, 'aria-valuemin', 0);
    setAttr(track, 'aria-valuemax', T);
    setAttr(track, 'aria-valuenow', Math.round(v));
    setAttr(track, 'aria-valuetext', STATION_SHORT[sid] + ' base point ' + mw(v) + ' MW, output ' + mw(so.outMW) + ' MW, ' +
      so.onCount + ' of ' + st.count + ' on' + (so.onCount ? ', ' + mw(sc.minMW) + '–' + mw(sc.maxMW) + ' MW' : '') +
      (nk ? ', plan ' + mw(nk.mw) + ' MW by ' + clockOf(nk.atS) : '') + (p && p.man ? ', MAN: off the plan' : '') +
      (over ? ', above the 96% gate: no raise headroom' : ''));
    setAttr(track, 'aria-disabled', ctx.locked() || agcDesk(vm) ? 'true' : 'false');   // (K-24: a readout on an AGC day)
    setCls(slot, 'readout', agcDesk(vm));
  }

  return {
    el: slot, track, machines, sid,
    update(v) {
      vm = v;
      sc = leverScale(v.obs, sid);
      if (shown && (v.obs.tick > shown.afterTick || ++shown.frames >= 2)) shown = null;
      if (pending && ctx.now() - pending.t >= DRAG_SEND_MS && !ctx.locked()) flush();
      if (ctx.locked()) { drag = null; pending = null; }
      // K-20 servo: the handle moved and no hand moved it (the plan did, L-6).
      const b = Math.round(baseNow()), t = ctx.now();
      if (prevBase !== null && b !== prevBase && !drag && !pending && !shown && t - handT >= HAND_MS && t - servoT >= SERVO_MS) {
        servoT = t;
        ctx.cue('servo', pan);
      }
      prevBase = b;
      for (const m of machines) m.update(v);
      words.update(v);
      render();
    },
    key(k, shift) {
      if (k === 'p') { rejoin(shift); return true; }
      if (stationKey(machines, k)) return true;
      nothingTo(ctx, slot, machines, k);
      return false;
    },
    /** K-12: a rough close on one of this station's machines (no shake under reduced motion). */
    shake() { shakeUntil = ctx.now() + SHAKE_MS; },
  };
}

/** The lever bank. */
export function createLevers(ctx, parent) {
  const bank = el(ctx.doc, 'div', 'dk-levers');
  parent.appendChild(bank);
  const levers = LEVER_STATIONS.map(sid => createLever(ctx, sid, bank));
  return {
    el: bank, levers,
    machines: levers.flatMap(l => l.machines),
    update(vm) { for (const l of levers) l.update(vm); },
    /** A K-23 letter (s, x, p) for the lever whose slot holds focus; true if handled. */
    key(target, k, shift) {
      const slot = target && target.closest ? target.closest('.dk-lever-slot') : null;
      if (!slot) return false;
      const l = levers.find(x => x.sid === slot.dataset.station);
      return l ? l.key(k, shift) : false;
    },
    shake(sid) { const l = levers.find(x => x.sid === sid); if (l) l.shake(); },
  };
}
