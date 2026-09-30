// desk/emergency.js: K-7 emergency controls, the A-1 RE-DISPATCH key and the K-2 AGC/HAND key
// (desk/README.md §6, §0 A-1, A-3).
//
// Reserve diesel (RERT): a key under a red cover. The first press lifts the cover and shows the
// cost and lead; then hold 0.6 s (or hold E) to arm. Armed, the same hold stands it down.
// Industrial DR: a big button, hold 0.6 s (or hold D); lamps for the calls left.
// DIRECT SHED: a guarded key (lift, then hold 0.6 s), shown only while the gauge reads SHORT or
// SHEDDING (A-3). Nothing here commits on a single tap: clicks are ignored, only holds commit.

import {V} from '../sim/params.js';
import {el, setText, setAttr, setCls, setHidden, setStyle, mw, mmss, fin} from './util.js';

export const COVER_MS = 6000;   // a lifted cover drops again after this long untouched
const RERT_TEXT = '$' + V.RERT_COST.toLocaleString('en-AU') + '/MWh · ' + V.RERT_MW + ' MW · ' + V.RERT_LEAD_S / 60 + '-min lead';
const DR_TEXT = V.DR_MW + ' MW · ' + V.DR_DURATION_S / 60 + ' min · $' + V.DR_PRICE.toLocaleString('en-AU') + '/MWh';

/**
 * A hold-to-commit key. o: {id, cls, covered, label, commit(), can() -> '' | reason}.
 * Pointer: down starts the hold (or lifts the cover), up before 0.6 s cancels. Keyboard: Enter or
 * Space held on the focused key. The desk's hold key (D, E) calls hold(true/false).
 */
function holdKey(ctx, parent, o) {
  const b = el(ctx.doc, 'button', 'dk-hold ' + o.cls);
  b.id = o.id; b.type = 'button';
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
    ctx.holds.down(o.id, () => { coverUntil = -1; if (!ctx.locked()) o.commit(); });
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
    if (!ev.repeat) down(false);
  });
  b.addEventListener('keyup', ev => { if (ev.key === 'Enter' || ev.key === ' ') up(); });
  b.addEventListener('click', ev => { ev.preventDefault && ev.preventDefault(); });   // a click never commits (K-7)
  return {
    el: b, face, sub,
    hold(on) { if (on) down(true); else up(); },
    render() {
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
  let vm = null;
  const obs = () => vm.obs;

  // ---- K-2 AGC/HAND key (display; set at the briefing, locked from 04:30, D-7)
  const agc = el(doc, 'button', 'dk-key dk-agc');
  agc.id = 'key-agc'; agc.type = 'button';
  agc.setAttribute('role', 'switch');
  agc.addEventListener('click', () => {
    if (!vm || ctx.locked()) return;
    if (obs().modeLocked) { ctx.note(agc, 'mode is locked for the day'); return; }
    ctx.send({type: 'mode', agc: obs().mode !== 'AGC'}, agc);
  });
  // ---- A-1 RE-DISPATCH key: re-runs the pre-dispatch over the commitment you have now
  const redis = el(doc, 'button', 'dk-key dk-redispatch');
  redis.id = 'btn-redispatch'; redis.type = 'button';
  redis.append(el(doc, 'span', 'dk-key-glyph', '⟳'), el(doc, 'span', '', 'RE-DISPATCH'));
  redis.setAttribute('aria-label', 'RE-DISPATCH: re-plan every lever and the tie from now over the units committed now');
  redis.addEventListener('click', () => {
    if (!vm || ctx.locked()) return;
    const r = typeof ctx.actions.redispatch === 'function' ? ctx.actions.redispatch() || '' : 'not available';
    if (r) ctx.note(redis, '✕ ' + r); else { ctx.note(redis, '✓ levers re-planned'); ctx.live('RE-DISPATCH: plan re-run'); }
  });
  const keys = el(doc, 'div', 'dk-keys');
  keys.append(el(doc, 'div', 'dk-rot-title', 'CONTROL'), agc, redis);
  keysParent.appendChild(keys);

  // ---- emergency row
  const box = el(doc, 'div', 'dk-emerg');
  emergParent.appendChild(box);
  const rert = holdKey(ctx, box, {
    id: 'key-rert', cls: 'dk-rert', covered: true, label: 'Reserve diesel',
    can: () => (obs().rert.standingDown ? 'standing down' : ''),
    cost: () => RERT_TEXT,
    commit() { const r = obs().rert; ctx.send({type: r.armed ? 'standDownRERT' : 'armRERT'}, rert.el); },
  });
  const dr = holdKey(ctx, box, {
    id: 'btn-dr', cls: 'dk-dr', covered: false, label: 'Industrial DR',
    can: () => { const d = obs().dr; return d.callsLeft <= 0 ? 'no DR calls left today' : d.activeS > 0 ? 'DR is on' : ''; },
    cost: () => DR_TEXT,
    commit() { ctx.send({type: 'callDR'}, dr.el); },
  });
  const drLamps = el(doc, 'span', 'dk-dr-lamps');
  dr.el.appendChild(drLamps);
  const shed = holdKey(ctx, box, {
    id: 'key-shed', cls: 'dk-shed', covered: true, label: 'DIRECT SHED',
    can: () => '',
    cost: () => 'sheds one district (~' + mw(fin(obs().demand.nowMW) * V.DISTRICT_SHARE) + ' MW) in rotation',
    commit() { ctx.send({type: 'directShed'}, shed.el); },
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
    // RERT
    const r = o.rert;
    setText(rert.face, r.armed ? (r.standingDown ? '◐ STANDING DOWN' : r.leadS > 0 ? '◔ DIESEL ' + mmss(r.leadS) : '● DIESEL ' + mw(r.outMW) + ' MW')
      : rert.coverUp() ? '▶ HOLD: ARM DIESEL' : '▣ BREAK GLASS');
    setText(rert.sub, r.armed && !r.standingDown ? (rert.coverUp() ? 'HOLD: STAND DOWN' : 'lift, hold to stand down') : RERT_TEXT);
    setCls(rert.el, 'armed', !!r.armed);
    setAttr(rert.el, 'aria-label', 'Reserve diesel key under a red cover: ' + (r.armed ? 'armed' : 'not armed') + '. ' + RERT_TEXT +
      '. Press to lift the cover, then hold 0.6 s, or hold E.');
    // DR
    const d = o.dr;
    setText(dr.face, d.activeS > 0 ? '● DR ON ' + mmss(d.activeS) : 'DR');
    setText(dr.sub, d.activeS > 0 ? mw(d.mw) + ' MW off' : DR_TEXT);
    let lamps = '';
    for (let i = 0; i < V.DR_CALLS; i++) lamps += i < d.callsLeft ? '●' : '○';
    setText(drLamps, lamps);
    setAttr(drLamps, 'title', d.callsLeft + ' of ' + V.DR_CALLS + ' calls left today');
    setCls(dr.el, 'armed', d.activeS > 0);
    setAttr(dr.el, 'aria-label', 'Industrial demand response: hold 0.6 s, or hold D. ' + d.callsLeft + ' calls left. ' + DR_TEXT);
    // DIRECT SHED: only while SHORT / SHEDDING (A-3)
    const short = o.sec.level === 'SHORT' || o.sec.level === 'SHEDDING';
    setHidden(shed.el, !short);
    setText(shed.face, shed.coverUp() ? '▶ HOLD: SHED' : '▣ DIRECT SHED');
    setText(shed.sub, 'one district, ~' + mw(fin(o.demand.nowMW) * V.DISTRICT_SHARE) + ' MW');
    setAttr(shed.el, 'aria-label', 'DIRECT SHED key under a cover: sheds one district in rotation. Press to lift, then hold 0.6 s.');
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
      if (!vm) return false;
      if (k === 'e') { if (!on || !ctx.locked()) rert.hold(on); return true; }
      if (k === 'd') { if (!on || !ctx.locked()) dr.hold(on); return true; }
      return false;
    },
  };
}
