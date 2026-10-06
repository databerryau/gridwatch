// desk/emergency.js: K-7 emergency controls, the A-1 RE-DISPATCH key and the K-2 AGC/HAND key
// (desk/README.md §6, §0 A-1, A-3).
//
// Reserve diesel (RERT): a key under a red cover. The first press lifts the cover and shows the
// cost and lead; then hold 0.6 s (or hold E) to arm. Armed, the same hold stands it down.
// Industrial DR: a big button, hold 0.6 s (or hold D); lamps for the calls left.
// DIRECT SHED: a guarded key (lift, then hold 0.6 s), shown only while the gauge reads SHORT or
// SHEDDING (A-3). Its face names the district the sim will shed and that district's load
// (calc.nextShed, obs.districts[].coldLoadMW: "about 0 MW" for one that is feeding back at noon,
// Phase 2a). Nothing here commits on a single tap: clicks are ignored, only holds commit
// (DIRECT SHED also takes the keyboard's guarded double: Enter lifts, Enter again within 2 s, §13.3).
// Keys (K-23): E / D held; K focuses DIRECT SHED, V the AGC/HAND key, N presses RE-DISPATCH.
// Foley (K-20): covers cue `cover` (lift and drop), key switches `key`, push buttons `button`.

import {V} from '../sim/params.js';
import {nextShed} from './calc.js';
import {el, setText, setAttr, setCls, setHidden, setStyle, mw, mmss, fin, GUARD_MS, PAN} from './util.js';

export const COVER_MS = 6000;   // a lifted cover drops again after this long untouched
const RERT_TEXT = '$' + V.RERT_COST.toLocaleString('en-AU') + '/MWh · ' + V.RERT_MW + ' MW · ' + V.RERT_LEAD_S / 60 + '-min lead';
const DR_TEXT = V.DR_MW + ' MW · ' + V.DR_DURATION_S / 60 + ' min · $' + V.DR_PRICE.toLocaleString('en-AU') + '/MWh';

/**
 * What DIRECT SHED will do now, in words: the district the sim sheds next (calc.nextShed) and its
 * load, "about 0 MW" when that district has none to give (zero or negative net load).
 * @returns {{id:string, text:string}} id '' when no lit rotation district is left
 */
export function shedText(obs) {
  const d = nextShed(obs.districts);
  if (!d) return {id: '', text: 'no lit district left in the rotation'};
  const load = Math.round(fin(d.coldLoadMW));
  return {id: d.id, text: d.id + ', about ' + (load > 0 ? load : 0) + ' MW'};
}

/**
 * A hold-to-commit key. o: {id, cls, covered, label, commit() -> '' | refusal, can() -> '' | reason,
 * cue (the K-20 cue of a commit), shortcut, twice (keyboard: a second Enter within 2 s of the lift commits)}.
 * Pointer: down starts the hold (or lifts the cover), up before 0.6 s cancels. Keyboard: Enter or
 * Space held on the focused key. The desk's hold key (D, E) calls hold(true/false).
 */
function holdKey(ctx, parent, o) {
  const b = el(ctx.doc, 'button', 'dk-hold ' + o.cls);
  b.id = o.id; b.type = 'button';
  b.setAttribute('aria-keyshortcuts', o.shortcut);
  let wasUp = false;
  const commit = () => { coverUntil = -1; if (!ctx.locked() && !o.commit()) ctx.cue(o.cue, PAN.panel); };
  const face = el(ctx.doc, 'span', 'dk-hold-face'), sub = el(ctx.doc, 'span', 'dk-hold-sub'), bar = el(ctx.doc, 'i', 'dk-hold-bar');
  b.append(face, sub, bar);
  parent.appendChild(b);
  let coverUntil = -1;
  const coverUp = () => !o.covered || ctx.now() <= coverUntil;
  function down(fromKey) {
    if (ctx.locked()) return;
    const why = o.can();
    if (why) { ctx.note(b, why); return; }
    if (!coverUp() && !fromKey) { coverUntil = ctx.now() + COVER_MS; ctx.live(o.label + ' cover lifted: ' + o.cost() + '. Hold to commit.'); return; }
    if (!coverUp()) coverUntil = ctx.now() + COVER_MS;   // hold E / D lifts and holds at once
    ctx.holds.down(o.id, commit);
  }
  function up() {
    const r = ctx.holds.up(o.id);
    if (r === 'short') ctx.note(b, 'hold 0.6 s to commit');
    if (r === 'done') coverUntil = -1;
  }
  b.addEventListener('pointerdown', ev => { if (ev.button === undefined || ev.button === 0) down(false); });
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', () => ctx.holds.cancel(o.id));
  b.addEventListener('pointercancel', () => ctx.holds.cancel(o.id));
  b.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    if (ev.repeat) return;
    // The keyboard's guarded double (DIRECT SHED): lifted less than 2 s ago, a second press commits.
    if (o.twice && ev.key === 'Enter' && coverUp() && ctx.now() <= coverUntil - COVER_MS + GUARD_MS && !ctx.locked() && !o.can()) { commit(); return; }
    down(false);
  });
  b.addEventListener('keyup', ev => { if (ev.key === 'Enter' || ev.key === ' ') up(); });
  b.addEventListener('click', ev => { ev.preventDefault && ev.preventDefault(); });   // a click never commits (K-7)
  return {
    el: b, face, sub,
    /** The desk's D / E: true when the key did something (started, ended or refused a hold). */
    hold(on) {
      if (on) { down(true); return true; }
      const held = ctx.holds.active(o.id);
      up();
      return held;
    },
    render() {
      // The cover lifting, or dropping (unused after 6 s, or as the key commits), clicks.
      if (o.covered && coverUp() !== wasUp) { wasUp = coverUp(); ctx.cue('cover', PAN.panel); }
      setCls(b, 'cover-up', o.covered && coverUp());
      setCls(b, 'covered', o.covered && !coverUp());
      setCls(b, 'holding', ctx.holds.active(o.id));
      setStyle(bar, 'width', (ctx.holds.progress(o.id) * 100).toFixed(0) + '%');
    },
    coverUp,
  };
}

export function createEmergency(ctx, keysParent, emergParent) {
  const doc = ctx.doc;
  let vm = null, wasHeld = false;
  const obs = () => vm.obs;
  // U-10: notes go on the CONTROL column, never inside a key whose face is rewritten every frame
  const keys = el(doc, 'div', 'dk-keys');

  // ---- K-2 AGC/HAND key (display; set at the briefing, locked from 04:30, D-7)
  const agc = el(doc, 'button', 'dk-key dk-agc');
  agc.id = 'key-agc'; agc.type = 'button';
  agc.setAttribute('role', 'switch');
  agc.setAttribute('aria-keyshortcuts', 'V');
  agc.addEventListener('click', () => {
    if (!vm || ctx.locked()) return;
    if (obs().modeLocked) { ctx.note(keys, 'AGC/HAND is set at the briefing: locked for the day', 6000, 'info'); return; }
    if (!ctx.send({type: 'mode', agc: obs().mode !== 'AGC'}, agc)) ctx.cue('key', PAN.keys);
  });
  // ---- A-1 RE-DISPATCH key: re-runs the pre-dispatch over the commitment you have now; lit while vm.held
  const redis = el(doc, 'button', 'dk-key dk-redispatch');
  redis.id = 'btn-redispatch'; redis.type = 'button';
  const redisGlyph = el(doc, 'span', 'dk-key-glyph', '⟳');
  redis.append(redisGlyph, el(doc, 'span', '', 'RE-DISPATCH'));
  redis.setAttribute('aria-label', 'RE-DISPATCH: re-plan every lever and the tie from now over the units committed now');
  redis.setAttribute('aria-keyshortcuts', 'N');
  /** A press of the RE-DISPATCH key (click, Enter, or N). True unless the desk is locked. */
  function redispatch() {
    if (!vm || ctx.locked()) return false;
    const r = typeof ctx.actions.redispatch === 'function' ? ctx.actions.redispatch() || '' : 'not available';
    if (r) ctx.note(keys, '✕ ' + r); else { ctx.cue('button', PAN.keys); ctx.note(keys, '✓ levers re-planned', undefined, 'info'); ctx.live('RE-DISPATCH: plan re-run'); }
    return true;
  }
  redis.addEventListener('click', redispatch);
  keys.append(el(doc, 'div', 'dk-rot-title', 'CONTROL'), agc, redis);
  keysParent.appendChild(keys);

  // ---- emergency row
  const box = el(doc, 'div', 'dk-emerg');
  emergParent.appendChild(box);
  const rert = holdKey(ctx, box, {
    id: 'key-rert', cls: 'dk-rert', covered: true, label: 'Reserve diesel', cue: 'key', shortcut: 'E',
    can: () => (obs().rert.standingDown ? 'standing down' : ''),
    cost: () => RERT_TEXT,
    commit() { const r = obs().rert; return ctx.send({type: r.armed ? 'standDownRERT' : 'armRERT'}, rert.el); },
  });
  const dr = holdKey(ctx, box, {
    id: 'btn-dr', cls: 'dk-dr', covered: false, label: 'Industrial DR', cue: 'button', shortcut: 'D',
    can: () => { const d = obs().dr; return d.callsLeft <= 0 ? 'no DR calls left today' : d.activeS > 0 ? 'DR is on' : ''; },
    cost: () => DR_TEXT,
    commit() { return ctx.send({type: 'callDR'}, dr.el); },
  });
  const drLamps = el(doc, 'span', 'dk-dr-lamps');
  dr.el.appendChild(drLamps);
  const shed = holdKey(ctx, box, {
    id: 'key-shed', cls: 'dk-shed', covered: true, label: 'DIRECT SHED', cue: 'key', shortcut: 'K', twice: true,
    can: () => '',
    cost: () => { const next = shedText(obs()); return next.id ? 'sheds ' + next.text : 'sheds nothing, ' + next.text; },
    commit() { return ctx.send({type: 'directShed'}, shed.el); },
  });

  function render() {
    const o = obs();
    const isAgc = o.mode === 'AGC';
    setText(agc, isAgc ? 'A AGC' : 'H HAND');
    setCls(agc, 'locked', !!o.modeLocked);
    setAttr(agc, 'aria-checked', isAgc ? 'true' : 'false');
    setAttr(agc, 'aria-label', 'AGC/HAND key: ' + (isAgc ? 'AGC on' : 'HAND (AGC off)') + (o.modeLocked ? ', locked for the day' : ''));
    setAttr(agc, 'aria-disabled', o.modeLocked || ctx.locked() ? 'true' : 'false');
    setCls(agc, 'hand', !isAgc);
    setAttr(redis, 'aria-disabled', ctx.locked() ? 'true' : 'false');
    setCls(redis, 'glow', !!(vm.glow && vm.glow.has('btn-redispatch')));
    // held by hand: HELD as well as amber (K-22), and a note when it starts
    const held = !!vm.held;
    setCls(redis, 'lit', held);
    setText(redisGlyph, held ? '⟳ HELD' : '⟳');
    setAttr(redis, 'title', held ? 'HELD BY HAND: you moved a lever, the wheel or the tie, so the dispatch stopped ' +
      'moving the levers. Press to hand them back.' : 'Re-plan every lever and the tie from now');
    if (held && !wasHeld) ctx.note(keys, 'held by hand: RE-DISPATCH (N) hands the levers back', 6000, 'info');
    wasHeld = held;
    // RERT
    const r = o.rert;
    setText(rert.face, r.armed ? (r.standingDown ? '◐ STANDING DOWN' : r.leadS > 0 ? '◔ DIESEL ' + mmss(r.leadS) : '● DIESEL ' + mw(r.outMW) + ' MW')
      : rert.coverUp() ? '▶ HOLD: ARM DIESEL' : '▣ BREAK GLASS');
    setText(rert.sub, r.armed && !r.standingDown ? (rert.coverUp() ? 'HOLD: STAND DOWN' : 'lift, hold to stand down') : RERT_TEXT);
    setCls(rert.el, 'armed', !!r.armed);
    setAttr(rert.el, 'aria-label', 'Reserve diesel key under a red cover: ' + (r.armed ? 'armed' : 'not armed') + ', cover ' +
      (rert.coverUp() ? 'lifted' : 'down') + '. ' + RERT_TEXT + '. Press to lift the cover, then hold 0.6 s, or hold E.');
    setAttr(rert.el, 'aria-pressed', r.armed ? 'true' : 'false');
    // DR
    const d = o.dr;
    setText(dr.face, d.activeS > 0 ? '● DR ON ' + mmss(d.activeS) : 'DR');
    setText(dr.sub, d.activeS > 0 ? mw(d.mw) + ' MW off' : DR_TEXT);
    let lamps = '';
    for (let i = 0; i < V.DR_CALLS; i++) lamps += i < d.callsLeft ? '●' : '○';
    setText(drLamps, lamps);
    setAttr(drLamps, 'title', d.callsLeft + ' of ' + V.DR_CALLS + ' calls left today');
    setCls(dr.el, 'armed', d.activeS > 0);
    setAttr(dr.el, 'aria-label', 'Industrial demand response: ' + (d.activeS > 0 ? 'on' : 'off') + '. Hold 0.6 s, or hold D. ' +
      d.callsLeft + ' of ' + V.DR_CALLS + ' calls left. ' + DR_TEXT);
    setAttr(dr.el, 'aria-pressed', d.activeS > 0 ? 'true' : 'false');
    // DIRECT SHED: only while SHORT / SHEDDING (A-3)
    const short = o.sec.level === 'SHORT' || o.sec.level === 'SHEDDING';
    setHidden(shed.el, !short);
    setText(shed.face, shed.coverUp() ? '▶ HOLD: SHED' : '▣ DIRECT SHED');
    const next = shedText(o);
    setText(shed.sub, next.text);
    setAttr(shed.el, 'aria-label', 'DIRECT SHED key under a cover, cover ' + (shed.coverUp() ? 'lifted' : 'down') +
      ': sheds ' + (next.id ? 'district ' + next.text + ', the next in rotation' : 'nothing: ' + next.text) +
      '. Press to lift, then hold 0.6 s, or press Enter again within 2 s.');
    for (const k of [rert, dr, shed]) {
      k.render();
      setAttr(k.el, 'aria-disabled', ctx.locked() ? 'true' : 'false');
      setCls(k.el, 'glow', !!(vm.glow && vm.glow.has(k.el.id)));
    }
  }
  return {
    update(v) { vm = v; render(); },
    /** D / E held (K-23): true on keydown, false on keyup. */
    holdKey(k, on) {
      const key = k === 'e' ? rert : k === 'd' ? dr : null;
      if (!vm || !key || (on && ctx.locked())) return false;
      return key.hold(on);
    },
    redispatch,
  };
}
