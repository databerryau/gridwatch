// desk/bay.js: the procedure bay (desk/README.md §6): SYNC (K-12 synchroscope) and RESTORE
// (K-13 feeder breakers).
//
// SYNC: the READY units (lit when offered, A-4); open one's scope (`scope`), watch the needle at
// phaseDeg turning at slipHz, trim with [ ] (`syncTrim` ±0.05 Hz), close with C or the breaker
// handle (`syncClose`; HAND may use the bypass key), U for AUTO (`syncAuto`). With the scope open
// and no close for 8 real seconds the desk sends `syncAuto` itself (K-12).
// RESTORE: each dark district is a feeder breaker with its cold-load MW; the RESTORE PERMISSIVE
// lamp (restoreBlock === ''); a breaker closes (`restore`) only when the lamp and the district's
// RESTORE PREVIEW (actions.restorePreview) both allow it. R, ←/→, Enter.
// Keys (K-23): O opens the first READY unit's scope (an offered one first; again: closes it),
// B is the bypass key (HAND). The scope canvas is role="img" with a text alternative that changes
// at most once per real second. Foley (K-20): buttons and tabs cue `button`, the bypass key `key`;
// the breaker's own sounds come from the sim's records.

import {V} from '../sim/params.js';
import {scopeAngle, scopeZone, turnS, coldLoad} from './calc.js';
import {el, setText, setAttr, setCls, setHidden, slowAttr, mw, fin, mmss, unitLabel, CLASS_GLYPH, PAN} from './util.js';

export const SCOPE_AUTO_REAL_MS = 8000;   // K-12: AUTO after 8 real s on the scope without a close
export const SYNC_LABEL = 'Real operators aim for 15–30 s per turn and close within ±10°. Ours turns faster. ' +
  'Most plants synchronise automatically, at the station, not in the control room.';
const TRIM_HZ = V.SYNC_TRIM_HZ ?? 0.05;

export function createBay(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-panel dk-bay');
  const tabs = el(doc, 'div', 'dk-bay-tabs');
  tabs.setAttribute('role', 'tablist');
  const tSync = el(doc, 'button', 'dk-tab', 'SYNC');
  tSync.id = 'bay-sync'; tSync.type = 'button'; tSync.setAttribute('role', 'tab');
  tSync.setAttribute('aria-keyshortcuts', 'O');
  const tRest = el(doc, 'button', 'dk-tab', 'RESTORE');
  tRest.id = 'bay-restore'; tRest.type = 'button'; tRest.setAttribute('role', 'tab');
  tRest.setAttribute('aria-keyshortcuts', 'R');
  const cue = name => ctx.cue(name || 'button', PAN.bay);
  const permit = el(doc, 'span', 'dk-lamp dk-permit');
  tabs.append(tSync, tRest, permit);
  const vSync = el(doc, 'div', 'dk-bay-view dk-sync');
  const vRest = el(doc, 'div', 'dk-bay-view dk-restore');
  box.append(tabs, vSync, vRest);
  parent.appendChild(box);

  let vm = null, view = 'sync', userView = false;
  function show(v, byUser) { view = v; if (byUser) userView = true; render(); }
  tSync.addEventListener('click', () => { if (view !== 'sync') cue(); show('sync', true); });
  tRest.addEventListener('click', () => { if (view !== 'restore') cue(); show('restore', true); });
  tSync.addEventListener('focus', () => show('sync', true));
  tRest.addEventListener('focus', () => show('restore', true));

  // ---- SYNC view
  const list = el(doc, 'div', 'dk-ready');
  const scopeBox = el(doc, 'div', 'dk-scope');
  const cv = el(doc, 'canvas', 'dk-scope-canvas');
  cv.id = 'scope-canvas';
  cv.setAttribute('role', 'img');
  const slow = slowAttr(ctx.now);
  const slip = el(doc, 'div', 'dk-slip');
  scopeBox.append(cv, slip);
  const ctl = el(doc, 'div', 'dk-sync-ctl');
  const btn = (id, text, label, keys) => {
    const b = el(doc, 'button', 'dk-btn', text);
    b.id = id; b.type = 'button'; b.setAttribute('aria-label', label); b.setAttribute('aria-keyshortcuts', keys);
    return b;
  };
  const bLow = btn('sync-lower', '[ −', 'Machine speed lower 0.05 Hz ([)', '[');
  const bHigh = btn('sync-raise', '+ ]', 'Machine speed higher 0.05 Hz (])', ']');
  const bClose = btn('sync-close', 'C CLOSE', 'Close the breaker (C)', 'C');
  bClose.classList.add('dk-breaker');
  const bAuto = btn('sync-auto', 'U AUTO', 'Auto-synchronise (U)', 'U');
  const bBypass = btn('sync-bypass', 'BYPASS', 'HAND only: bypass the sync-check relay (B)', 'B');
  bBypass.setAttribute('role', 'switch');
  const bExit = btn('sync-exit', '✕', 'Close the synchroscope (O)', 'O');
  ctl.append(bLow, bHigh, bClose, bAuto, bBypass, bExit);
  const label = el(doc, 'div', 'dk-sync-label', SYNC_LABEL);
  vSync.append(list, scopeBox, ctl, label);
  let readyKey = '', readyBtns = new Map(), bypass = false;
  let openUnit = '', openMs = 0, lastT = 0, autoSent = false;

  const scopeUnit = () => (vm && vm.obs.scope ? vm.obs.scope.unit || '' : '');
  const unitObs = id => vm.obs.units.find(u => u.id === id);
  function openScope(id) {
    if (!vm || ctx.locked()) return;
    const r = ctx.send({type: 'scope', unit: id}, box);
    if (!r) cue();
    if (!r && vm.offers && vm.offers.some(o => o.unit === id)) ctx.ui({do: 'offerTaken', unit: id});
    show('sync', true);
  }
  function exitScope() {
    if (ctx.locked() || !scopeUnit()) return;
    if (!ctx.send({type: 'scope', unit: ''}, box)) cue();
  }
  function toggleBypass() {
    if (!vm || vm.obs.mode !== 'HAND') { ctx.note(box, 'the bypass key works only in HAND'); return; }
    bypass = !bypass;
    cue('key');
    render();
  }
  function trim(dir) {
    const u = scopeUnit();
    if (!u) { ctx.note(box, 'open a scope first'); return; }
    if (!ctx.send({type: 'syncTrim', unit: u, dHz: dir * TRIM_HZ}, box)) cue();
  }
  function close() {
    const u = scopeUnit();
    if (!u) { ctx.note(box, 'open a scope first'); return; }
    const hand = vm.obs.mode === 'HAND';
    const r = ctx.send({type: 'syncClose', unit: u, bypass: hand && bypass}, box);
    if (!r) { openMs = 0; autoSent = false; }
  }
  function auto() {
    const u = scopeUnit();
    if (!u) { ctx.note(box, 'open a scope first'); return; }
    if (!ctx.send({type: 'syncAuto', unit: u}, box)) cue();
    autoSent = true;
  }
  bLow.addEventListener('click', () => { if (!ctx.locked()) trim(-1); });
  bHigh.addEventListener('click', () => { if (!ctx.locked()) trim(1); });
  bClose.addEventListener('click', () => { if (!ctx.locked()) close(); });
  bAuto.addEventListener('click', () => { if (!ctx.locked()) auto(); });
  bBypass.addEventListener('click', toggleBypass);
  bExit.addEventListener('click', exitScope);

  function buildReady(ready) {
    list.replaceChildren();
    readyBtns = new Map();
    for (const u of ready) {
      const b = el(doc, 'button', 'dk-btn dk-ready-btn');
      b.type = 'button'; b.id = 'scope-' + u.id;
      b.addEventListener('click', () => openScope(u.id));
      list.appendChild(b);
      readyBtns.set(u.id, b);
    }
    if (!ready.length) list.appendChild(el(doc, 'div', 'dk-empty', 'No unit at full speed.'));
  }

  function drawScope(u) {
    const dpr = fin(globalThis.devicePixelRatio, 1) || 1;
    const w = Math.max(1, Math.round(fin(cv.clientWidth, 96) * dpr)), h = Math.max(1, Math.round(fin(cv.clientHeight, 96) * dpr));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.max(6, Math.min(w, h) / 2 - 4 * dpr);
    const top = -Math.PI / 2, rad = d => d * Math.PI / 180;
    const sector = (deg, col) => { g.beginPath(); g.moveTo(cx, cy); g.fillStyle = col; g.arc(cx, cy, r, top - rad(deg), top + rad(deg)); g.closePath(); g.fill(); };
    g.fillStyle = '#1b222c';
    g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.fill();
    sector(V.SYNC_ROUGH_DEG ?? 20, '#9a7a2266');
    sector(V.SYNC_CLEAN_DEG ?? 10, '#2f7d3faa');
    g.strokeStyle = '#8b949e'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.stroke();
    g.strokeStyle = '#f0f6fc'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx, cy - r + 6 * dpr); g.stroke();   // 12 o'clock mark
    g.fillStyle = '#8b949e'; g.font = Math.round(8 * dpr) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SLOW', cx - r * 0.55, cy + r * 0.55); g.fillText('FAST', cx + r * 0.55, cy + r * 0.55);
    if (!u) return;
    const a = scopeAngle(u.phaseDeg, u.slipHz, fin(vm.frame && vm.frame.alpha) * V.PHYS_DT);
    const zone = scopeZone(a);
    const col = zone === 'clean' ? '#3fb950' : zone === 'rough' ? '#d29922' : '#f0f6fc';
    g.strokeStyle = col; g.lineWidth = 3 * dpr;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (r - 3 * dpr) * Math.sin(rad(a)), cy - (r - 3 * dpr) * Math.cos(rad(a))); g.stroke();
    g.fillStyle = '#c9d1d9';
    g.beginPath(); g.arc(cx, cy, 3 * dpr, 0, 2 * Math.PI); g.fill();
  }

  function renderSync() {
    const o = vm.obs;
    const ready = o.units.filter(u => u.mode === 'ready');
    const k = ready.map(u => u.id).join('|');
    if (k !== readyKey) { readyKey = k; buildReady(ready); }
    const su = scopeUnit();
    for (const u of ready) {
      const b = readyBtns.get(u.id);
      if (!b) continue;
      const off = vm.offers && vm.offers.find(x => x.unit === u.id);
      setText(b, (su === u.id ? '◉ ' : '◑ ') + unitLabel(u.id) + (o.mode === 'AGC' && u.timerS > 0 ? ' ' + mmss(u.timerS) : ''));
      setCls(b, 'offered', !!off);
      setCls(b, 'on', su === u.id);
      setAttr(b, 'aria-label', unitLabel(u.id) + ' at full speed: open its synchroscope' + (off ? ' (offered: ' + off.why + ')' : '') +
        (o.mode === 'AGC' ? ', auto-sync in ' + mmss(u.timerS) : ''));
      setAttr(b, 'aria-pressed', su === u.id ? 'true' : 'false');
    }
    const u = su ? unitObs(su) : null;
    drawScope(u && u.mode === 'ready' ? u : null);
    if (u && u.mode === 'ready') {
      const s = fin(u.slipHz);
      setText(slip, unitLabel(su) + ' SLIP ' + (s >= 0 ? '+' : '−') + Math.abs(s).toFixed(2) + ' Hz · ' +
        (Number.isFinite(turnS(s)) ? turnS(s).toFixed(1) + ' s/turn' : 'still') + (s >= 0 ? ' · FAST ↻' : ' · SLOW ↺'));
      // The needle turns too fast to read out: the alternative says how it turns and what a close would do.
      slow(cv, 'aria-label', 'Synchroscope, ' + unitLabel(su) + ': slip ' + (s >= 0 ? 'plus ' : 'minus ') + Math.abs(s).toFixed(2) + ' hertz, needle turning ' +
        (s >= 0 ? 'clockwise (machine fast)' : 'anticlockwise (machine slow: a close would trip on reverse power)') +
        (Number.isFinite(turnS(s)) ? ', one turn every ' + turnS(s).toFixed(1) + ' seconds' : '') +
        (Math.abs(s) > (V.SYNC_BLOCK_SLIP_HZ ?? 0.5) ? ', too fast: the sync-check relay blocks a close' : '') +
        '. Close just before 12 o\'clock (C), trim with [ and ], or U for AUTO.');
    } else {
      setText(slip, su ? unitLabel(su) : 'Pick a unit');
      setAttr(cv, 'aria-label', 'Synchroscope: no unit on the scope' + (ready.length ? '. O opens ' + unitLabel(ready[0].id) : ''));
    }
    const hand = o.mode === 'HAND';
    setHidden(bBypass, !hand);
    setCls(bBypass, 'on', hand && bypass);
    setText(bBypass, hand && bypass ? '● BYPASS' : 'BYPASS');
    setAttr(bBypass, 'aria-checked', hand && bypass ? 'true' : 'false');
    for (const b of [bLow, bHigh, bClose, bAuto, bExit]) setAttr(b, 'aria-disabled', !su || ctx.locked() ? 'true' : 'false');
  }

  // K-12: AUTO after 8 real s with the scope open and no close. Real seconds of play: time with
  // the clock stopped (PAUSE, a hidden tab) does not count.
  function scopeTimer() {
    const t = ctx.now(), dt = Math.max(0, t - lastT);
    lastT = t;
    const su = vm.obs.scope && vm.obs.scope.open !== false ? scopeUnit() : '';
    const u = su ? unitObs(su) : null;
    if (!u || u.mode !== 'ready') { openUnit = ''; openMs = 0; autoSent = false; return; }
    if (su !== openUnit) { openUnit = su; openMs = 0; autoSent = false; return; }
    if (!vm.mode || vm.mode.rate > 0) openMs += dt;
    if (!autoSent && !ctx.locked() && openMs >= SCOPE_AUTO_REAL_MS) {
      autoSent = true;
      ctx.send({type: 'syncAuto', unit: su}, box);
    }
  }

  // ---- RESTORE view
  const rhead = el(doc, 'div', 'dk-restore-head');
  const feeders = el(doc, 'div', 'dk-feeders');
  feeders.setAttribute('role', 'listbox');
  feeders.setAttribute('tabindex', '0');
  feeders.id = 'restore-list';
  feeders.setAttribute('aria-label', 'Dark districts: ←/→ choose, Enter closes the breaker');
  vRest.append(rhead, feeders);
  let rows = new Map(), rowKey = '', sel = '', pvCache = new Map();
  const dark = () => vm.obs.districts.filter(d => d.dark);
  function previewOf(d) {
    // The lamp first; the preview runs only while the lamp allows (as the restore input does).
    if (d.restoreBlock) return d.restoreBlock;
    const key = d.id + '@' + vm.obs.s;
    if (pvCache.has(key)) return pvCache.get(key);
    const r = typeof ctx.actions.restorePreview === 'function' ? ctx.actions.restorePreview(d.id) || '' : 'no restore preview';
    pvCache.set(key, r);
    return r;
  }
  function closeFeeder(id) {
    if (!vm || ctx.locked()) return;
    const d = vm.obs.districts.find(x => x.id === id);
    if (!d || !d.dark) return;
    const why = previewOf(d);
    if (why) { ctx.note(box, '✕ ' + why); return; }
    ctx.send({type: 'restore', district: id}, box);   // the breaker's clack is the record's cue
  }
  function buildRows(list) {
    feeders.replaceChildren();
    rows = new Map();
    for (const d of list) {
      const row = el(doc, 'div', 'dk-feeder');
      row.setAttribute('role', 'option');
      row.dataset.district = d.id;
      const name = el(doc, 'span', 'dk-feeder-name'), load = el(doc, 'span', 'dk-feeder-mw'), pv = el(doc, 'span', 'dk-feeder-pv');
      const brk = el(doc, 'button', 'dk-btn dk-feeder-brk', 'CLOSE');
      brk.id = 'restore-' + d.id; brk.type = 'button';
      brk.addEventListener('click', ev => { ev.stopPropagation && ev.stopPropagation(); sel = d.id; closeFeeder(d.id); });
      row.addEventListener('click', () => { sel = d.id; render(); });
      row.append(name, load, pv, brk);
      feeders.appendChild(row);
      rows.set(d.id, {row, name, load, pv, brk});
    }
    if (!list.length) feeders.appendChild(el(doc, 'div', 'dk-empty', 'All districts lit.'));
  }
  feeders.addEventListener('keydown', ev => {
    if (!vm) return;
    const ids = dark().map(d => d.id);
    if (!ids.length) return;
    // Enter on a row's own CLOSE button (reached by Tab) means that row, not the one chosen before.
    const row = ev.target && ev.target !== feeders && ev.target.closest ? ev.target.closest('.dk-feeder') : null;
    if (row && ids.includes(row.dataset.district)) sel = row.dataset.district;
    let i = Math.max(0, ids.indexOf(sel));
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { i = (i + 1) % ids.length; sel = ids[i]; ev.preventDefault(); render(); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { i = (i - 1 + ids.length) % ids.length; sel = ids[i]; ev.preventDefault(); render(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); closeFeeder(ids.indexOf(sel) >= 0 ? sel : ids[0]); }
  });
  function renderRestore() {
    const o = vm.obs, list = dark();
    const k = list.map(d => d.id).join('|');
    if (k !== rowKey) { rowKey = k; buildRows(list); }
    if (list.length && !list.some(d => d.id === sel)) sel = list[0].id;
    if (pvCache.size > 64) pvCache = new Map();
    for (const d of list) {
      const R = rows.get(d.id);
      if (!R) continue;
      const cl = coldLoad(d, o.s, o.demand.nowMW);
      const why = previewOf(d);
      const ok = why === '';
      setText(R.name, (d.id === sel ? '▸ ' : '') + d.id + (d.shedBy ? ' · ' + d.shedBy.toUpperCase() : ''));
      setText(R.load, mw(d.coldLoadMW) + ' MW' + (cl.factor > 1 ? ' ×' + cl.factor : cl.coldInS > 0 ? ' ×1.5 in ' + mmss(cl.coldInS) : ''));
      const pvCls = ok ? 'good' : d.restoreBlock ? 'warn' : 'crit';
      setText(R.pv, CLASS_GLYPH[pvCls]);
      setAttr(R.pv, 'class', 'dk-feeder-pv ' + pvCls);
      setAttr(R.pv, 'title', ok ? 'RESTORE PREVIEW: nadir stays ≥ ' + V.SECURE_NADIR_HZ + ' Hz' : why);
      R.brk.disabled = !ok || ctx.locked();
      setAttr(R.brk, 'aria-label', 'Close the feeder breaker of ' + d.id + ' (' + mw(d.coldLoadMW) + ' MW cold load)' + (ok ? '' : ': ' + why));
      setCls(R.row, 'sel', d.id === sel);
      setAttr(R.row, 'aria-selected', d.id === sel ? 'true' : 'false');
    }
    const lamp = list.length > 0 && list.some(d => d.restoreBlock === '');
    // The chosen district's refusal is on the face, not only in a tooltip (K-23: nothing hover-only).
    const sd = list.find(d => d.id === sel), sWhy = sd ? previewOf(sd) : '';
    setText(rhead, list.length ? (lamp ? 'P ✓ RESTORE PERMISSIVE' + (sWhy ? ' · ' + sd.id + ' ✕ ' + sWhy : '') :
      'P ✕ ' + (sWhy || list[0].restoreBlock || 'not permissive')) : 'No dark districts.');
    setAttr(feeders, 'aria-label', 'Dark districts: ←/→ choose, Enter closes the breaker' + (sd ? '. ' + sd.id + ', ' + mw(sd.coldLoadMW) +
      ' MW cold load, ' + (sWhy ? 'blocked: ' + sWhy : 'preview clear') : ''));
    setCls(rhead, 'lit', lamp);
  }

  function render() {
    if (!vm) return;
    const o = vm.obs;
    const darkN = o.districts.filter(d => d.dark).length;
    // Which view: the scope when open, else the player's choice, else RESTORE when districts are dark.
    if (scopeUnit()) view = 'sync';
    else if (!userView) view = darkN > 0 && !o.units.some(u => u.mode === 'ready') ? 'restore' : 'sync';
    setHidden(vSync, view !== 'sync');
    setHidden(vRest, view !== 'restore');
    setAttr(tSync, 'aria-selected', view === 'sync' ? 'true' : 'false');
    setAttr(tRest, 'aria-selected', view === 'restore' ? 'true' : 'false');
    const offered = !!(vm.offers && vm.offers.length);
    setCls(tSync, 'lit', offered || o.units.some(u => u.mode === 'ready'));
    setCls(tSync, 'offered', offered);
    setText(tSync, (offered ? '◉ ' : '') + 'SYNC');
    setText(tRest, (darkN ? '✕' + darkN + ' ' : '') + 'RESTORE');
    setCls(tRest, 'lit', darkN > 0);
    const lamp = o.districts.some(d => d.dark && d.restoreBlock === '');
    setHidden(permit, darkN === 0);
    setText(permit, lamp ? 'P ✓' : 'P ✕');
    setCls(permit, 'lit', lamp);
    setCls(tSync, 'glow', !!(vm.glow && vm.glow.has('bay-sync')));
    setCls(tRest, 'glow', !!(vm.glow && vm.glow.has('bay-restore')));
    if (view === 'sync') renderSync(); else renderRestore();
  }

  return {
    el: box,
    show,
    update(v) {
      vm = v;
      scopeTimer();
      if (vm.obs.scope && vm.obs.scope.unit) userView = false;
      render();
    },
    /** K-23 bay keys: [ ] C U O B (scope), R (restore bay). True if handled. */
    key(k) {
      if (!vm || ctx.locked()) return false;
      if (k === 'o') {
        if (scopeUnit()) { exitScope(); return true; }
        const ready = vm.obs.units.filter(u => u.mode === 'ready');
        const first = ready.find(u => vm.offers && vm.offers.some(x => x.unit === u.id)) || ready[0];
        if (!first) { show('sync', true); ctx.note(box, 'no unit at full speed'); return true; }
        openScope(first.id);
        return true;
      }
      if (k === 'b') { if (vm.obs.mode !== 'HAND') return false; toggleBypass(); return true; }
      if (k === '[') { trim(-1); return true; }
      if (k === ']') { trim(1); return true; }
      if (k === 'c') { close(); return true; }
      if (k === 'u') { auto(); return true; }
      if (k === 'r') { show('restore', true); tRest.focus && tRest.focus(); feeders.focus && feeders.focus(); return true; }
      return false;
    },
  };
}
