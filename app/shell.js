// app/shell.js: the game page (next.html) around app/game.js. It mounts the map, the desk and
// the Live Stack (whichever modules boot.js passes in), draws the header and the overlays
// (briefing, watch, respond card, end card, drawer, "?" labels, toast, ?perf), runs the frame
// loop (ticks, then the view model, then every module draws: never inside step(), X-26),
// binds the K-23 keys and starts the audio on the first gesture.
//
// app/boot.js is the page's one module script: it imports the real modules and calls
// bootGame(document, {...}). Tests call bootGame with the stand-in DOM (tests/lib/dom.js) and
// stand-in modules, so the shell is tested before the other stage B files exist.
//
// Element ids other modules rely on:
//   #map, #desk      the roots createMap / createDesk receive
//   #stack-slot      created BY THE DESK in its third column: createLiveStack's root. If the
//                    desk has none, the shell makes one at the end of #desk.
//   #stack-overlay   L-4: while vm.stackExpanded the shell moves the Live Stack's `el` here
//                    (over the map, ~1248 x 420) and back into #stack-slot after; the stack
//                    sizes its canvas from its parent on update.

import {SIM_VERSION} from '../sim/params.js';
import * as G from './game.js';
import {startRaf} from './loop.js';
import {createKeys, bindKeys, poll as pollKeys} from './keys.js';
import {createPerf, perfFrame, renderPerf} from './perf.js';
import {createAudio} from '../audio/audio.js';
import {TEXT} from '../content/text.js';
import {badgeText, lightsText, centsText, co2Text, clockText} from '../render/format.js';
import {BEATS} from './watch.js';

/** K-17: header, map and desk heights (px) for a viewport; the CSS in next.html does the same. */
export function layoutSizes(width, height) {
  const header = width >= 1600 ? 40 : 32;
  const desk = Math.max(300, Math.floor((height - header) / 2));
  return {header, desk, map: height - header - desk};
}

const WATCH_WORDS = {inertia: 'INERTIA', battery: 'BATTERY', governors: 'GOVERNORS', ufls: 'UFLS', settle: 'SETTLE'};

/**
 * Boot the game on `doc`.
 * @param {Document} doc
 * @param {{createDesk?:function, createLiveStack?:function, createMap?:function, system?:object, planview?:object,
 *   search?:string, storage?:object|null, audioWin?:object, raf?:boolean, now?:function():number, date?:Date}} deps
 *   raf: false to skip startRaf (tests call handle.frame(dtS) themselves).
 * @returns {object} handle {game, actions, frame(dtS), vm(), audio, mods, keys, unbind()}
 */
export function bootGame(doc, deps) {
  const o = deps || {};
  const $ = id => doc.getElementById(id);
  const now = o.now || (() => globalThis.performance.now());
  const search = o.search === undefined ? (globalThis.location ? globalThis.location.search : '') : o.search;
  const query = new URLSearchParams(search);
  const game = G.createGame({seed: G.seedFrom(search, o.date), system: o.system, planview: o.planview,
    storage: o.storage === undefined ? safeStorage() : o.storage});
  const audio = createAudio(o.audioWin === undefined ? globalThis : o.audioWin);
  const perf = query.has('perf') ? createPerf() : null;
  const keys = createKeys();
  let vm = null, lastPerfDraw = -1e9, toastUntil = 0, qNext = 0, prevMode = '';

  // ---------------------------------------------------------------- actions (desk/README.md §4)
  const base = G.makeActions(game);
  const actions = {
    input: x => { const r = base.input(x); if (r) showToast('Refused: ' + r); return r; },
    redispatch: () => { const r = base.redispatch(); if (r) showToast('RE-DISPATCH: ' + r); return r; },
    ui: cmd => {
      const r = base.ui(cmd);
      if (cmd && cmd.do === 'focus' && cmd.target) focusEl(cmd.target);
      if (cmd && (cmd.do === 'drawer')) drawDrawer();
      return r;
    },
    previewTrip: opts => base.previewTrip(opts),
    restorePreview: id => base.restorePreview(id),
  };

  function focusEl(id) {
    const el = $(id);
    if (el && el.focus) { try { el.focus(); } catch { /* ignore */ } }
  }

  // ---------------------------------------------------------------- modules
  const mods = {map: null, desk: null, stack: null, errors: []};
  const mount = (name, fn, root) => {
    if (!fn || !root) return null;
    try { return fn(doc, root, actions); } catch (e) { mods.errors.push(name + ': ' + (e && e.message ? e.message : e)); return null; }
  };
  mods.map = mount('map', o.createMap, $('map'));
  mods.desk = mount('desk', o.createDesk, $('desk'));
  let slot = $('stack-slot');
  if (!slot && $('desk')) {
    slot = doc.createElement('div');
    slot.id = 'stack-slot';
    $('desk').appendChild(slot);
  }
  mods.stack = mount('stack', o.createLiveStack, slot);
  let stackOut = false;

  // ---------------------------------------------------------------- header, briefing
  const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
  on('btn-pause', 'click', () => actions.ui({do: 'pause'}));
  on('btn-mute', 'click', () => { actions.ui({do: 'mute'}); });
  on('btn-help', 'click', () => actions.ui({do: 'drawer'}));
  let briefAgc = true;
  const setBriefMode = agc => {
    briefAgc = agc;
    const a = $('btn-agc'), h = $('btn-hand');
    if (a) { a.classList.toggle('on', agc); a.setAttribute('aria-checked', String(agc)); }
    if (h) { h.classList.toggle('on', !agc); h.setAttribute('aria-checked', String(!agc)); }
  };
  on('btn-agc', 'click', () => setBriefMode(true));
  on('btn-hand', 'click', () => setBriefMode(false));
  const take = () => {
    if (G.takeDesk(game, {agc: briefAgc})) { const b = $('briefing-card'); if (b) b.hidden = true; }
  };
  on('btn-take', 'click', take);
  briefingText();

  function briefingText() {
    const b = $('briefing-card');
    if (!b) return;
    b.hidden = game.phase !== 'briefing';
    const w = $('briefing-watch');
    if (w) {
      const news = game.state.news.map(n => n.text);
      w.textContent = 'Seed ' + game.seed + ' · AGC is on by default; HAND flies the day without it, locked at 04:30.' +
        (news.length ? ' Watch for: ' + news[0] : '');
    }
  }

  // ---------------------------------------------------------------- "?" labels and the drawer (H-14)
  const byAnchor = new Map();
  for (const e of TEXT.abstractions) {
    if (!e.game || e.game === 'drawer') continue;
    if (!byAnchor.has(e.game)) byAnchor.set(e.game, []);
    byAnchor.get(e.game).push(e);
  }
  const qButtons = new Map();
  function placeQs() {
    const layer = $('q-layer');
    if (!layer) return;
    for (const [id, entries] of byAnchor) {
      const el = $(id);
      let q = qButtons.get(id);
      if (!el) { if (q) q.hidden = true; continue; }
      if (!q) {
        q = doc.createElement('button');
        q.className = 'q';
        q.textContent = '?';
        q.dataset.anchor = id;
        q.title = entries.map(e => e.row).join(' · ');
        q.setAttribute('aria-label', 'About: ' + entries.map(e => e.row).join('; '));
        q.addEventListener('click', ev => { if (ev.stopPropagation) ev.stopPropagation(); showPopover(q, entries); });
        layer.appendChild(q);
        qButtons.set(id, q);
      }
      const r = el.getBoundingClientRect();
      q.hidden = !(r.width > 0 && r.height > 0);
      q.style.left = Math.round(r.right - 26) + 'px';
      q.style.top = Math.round(r.top + 2) + 'px';
    }
  }
  function entryNodes(parent, e, headTag) {
    const h = doc.createElement(headTag);
    h.textContent = e.row;
    parent.appendChild(h);
    for (const [k, label] of [['real', 'Real world: '], ['ours', 'GRIDWATCH: '], ['why', 'Why: ']]) {
      const p = doc.createElement('p');
      const b = doc.createElement('b');
      b.textContent = label;
      p.appendChild(b);
      p.appendChild(doc.createTextNode(e[k]));
      parent.appendChild(p);
    }
  }
  function showPopover(q, entries) {
    const pop = $('popover');
    if (!pop) return;
    pop.replaceChildren();
    for (const e of entries) entryNodes(pop, e, 'h4');
    const r = q.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.round(r.left - 200)) + 'px';
    pop.style.top = Math.round(r.bottom + 4) + 'px';
    pop.hidden = false;
  }
  doc.addEventListener('click', ev => {
    const pop = $('popover');
    if (pop && !pop.hidden && !(ev.target && ev.target.classList && ev.target.classList.contains('q')) && !pop.contains(ev.target)) pop.hidden = true;
  });
  function drawDrawer() {
    const d = $('drawer');
    if (!d) return;
    d.hidden = !game.ui.drawer;
    if (d.hidden || d.childElementCount) return;
    const h = doc.createElement('h2');
    h.textContent = 'What GRIDWATCH simplifies, and why';
    d.appendChild(h);
    for (const e of TEXT.abstractions) {
      const a = doc.createElement('article');
      entryNodes(a, e, 'h4');
      d.appendChild(a);
    }
  }

  // ---------------------------------------------------------------- overlays
  function showToast(text) {
    const t = $('toast');
    if (!t) return;
    t.textContent = text;
    t.hidden = false;
    toastUntil = now() + 3000;
  }
  const setText = (id, s) => { const el = $(id); if (el && el.textContent !== s) el.textContent = s; };

  function drawHeader(v) {
    const m = v.mode;
    setText('clock-text', m.mode === 'WATCH' ? clockText(v.obs.s) : v.obs.clock.text);
    setText('rate-text', badgeText(m));
    const badge = $('rate-badge');
    if (badge) badge.className = m.mode;
    const sc = v.obs.score;
    setText('chip-lights-v', lightsText(sc));
    setText('chip-cost-v', centsText(sc));
    setText('chip-co2-v', co2Text(sc));
    setText('btn-pause', m.mode === 'PAUSE' || m.mode === 'HIDDEN' ? 'PLAY' : 'PAUSE');
    const bp = $('btn-pause');
    if (bp) bp.disabled = v.phase !== 'play' || v.obs.over;
    setText('btn-mute', v.settings.muted ? 'SOUND OFF' : 'SOUND ON');
  }

  function drawWatch(v) {
    const w = v.watch, box = $('watch-vignette');
    doc.body.classList.toggle('watch', !!w);
    if (!box) return;
    box.hidden = !w;
    if (!w) return;
    setText('stopwatch', w.stopwatch);
    setText('beat-caption', w.version === 'full' ? w.caption : WATCH_WORDS[w.beat]);
    const steps = $('beat-steps');
    if (steps) {
      steps.replaceChildren();
      BEATS.forEach((b, i) => {
        if (i) steps.appendChild(doc.createTextNode(' → '));
        const el = doc.createElement(i === w.beatIndex ? 'b' : 'span');
        el.textContent = WATCH_WORDS[b];
        steps.appendChild(el);
      });
    }
  }

  let respondShown = -1;
  function drawRespond(v) {
    const card = $('respond-card');
    if (!card) return;
    card.hidden = !v.respond;
    if (!v.respond || respondShown === v.respond.n) { if (!v.respond) respondShown = -1; return; }
    respondShown = v.respond.n;
    card.replaceChildren();
    v.respond.lines.forEach((line, i) => {
      const p = doc.createElement('p');
      p.textContent = line;
      if (i === v.respond.lines.length - 1) p.className = 'hint';
      card.appendChild(p);
    });
  }

  let endShown = false;
  function drawEnd(v) {
    const card = $('end-card');
    if (!card) return;
    if (!v.end) { card.hidden = true; endShown = false; return; }
    if (endShown) return;
    endShown = true;
    card.hidden = false;
    card.replaceChildren();
    const h = doc.createElement('h2');
    h.textContent = v.end.black ? 'The grid went black.' : 'Day over: 04:00.';
    card.appendChild(h);
    const sc = v.end.score;
    for (const line of ['LIGHTS ON  ' + lightsText(sc) + ' · ' + sc.lightsMWh.toFixed(1) + ' MWh dark',
      'COST       ' + centsText(sc) + ' c/kWh', 'CO₂        ' + co2Text(sc) + ' t/MWh',
      'Seed ' + v.end.seed + ' · ' + v.end.v + ' · ' + v.end.inputs + ' inputs · hash 0x' + (v.end.hash >>> 0).toString(16).padStart(8, '0')]) {
      const p = doc.createElement('p');
      p.className = 'score';
      p.textContent = line;
      card.appendChild(p);
    }
    const row = doc.createElement('p');
    const save = doc.createElement('button');
    save.id = 'btn-save-log';
    save.textContent = 'DOWNLOAD REPLAY LOG';
    save.addEventListener('click', () => download('gridwatch-' + SIM_VERSION + '-seed-' + game.seed + '.json',
      JSON.stringify(G.gameLog(game), null, 1)));
    const again = doc.createElement('button');
    again.id = 'btn-again';
    again.textContent = 'PLAY THIS DAY AGAIN';
    again.addEventListener('click', () => { G.resetDay(game); endShown = false; card.hidden = true; briefingText(); });
    row.appendChild(save);
    row.appendChild(doc.createTextNode(' '));
    row.appendChild(again);
    card.appendChild(row);
  }

  function download(name, text) {
    try {
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
      a.download = name;
      doc.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) {
      showToast('Download failed: ' + (e && e.message ? e.message : e));
    }
  }

  function placeStack(v) {
    if (!mods.stack || !mods.stack.el) return;
    const ov = $('stack-overlay');
    if (!ov || v.stackExpanded === stackOut) return;
    stackOut = v.stackExpanded;
    if (stackOut) { ov.appendChild(mods.stack.el); ov.hidden = false; } else { slot.appendChild(mods.stack.el); ov.hidden = true; }
  }

  function announce(v) {
    if (v.mode.mode === prevMode) return;
    prevMode = v.mode.mode;
    setText('aria-live', badgeText(v.mode));
  }

  // ---------------------------------------------------------------- the frame (X-26: draw after the ticks)
  const drawMs = {};
  const timed = (name, f) => {
    const t = now();
    try { f(); } catch (e) { mods.errors.push(name + ': ' + (e && e.message ? e.message : e)); }
    drawMs[name] = now() - t;
  };

  function onFrame(dtS) {
    const t0 = now();
    for (const a of pollKeys(keys, t0)) run(a);
    const ticks = G.frame(game, dtS, now);
    const t1 = now();
    vm = G.buildVm(game, {nowMs: t1, dtS});
    if (mods.map) timed('map', () => mods.map.update(vm));
    if (mods.desk) timed('desk', () => mods.desk.update(vm));
    if (mods.stack) timed('stack', () => mods.stack.update(vm));
    timed('shell', () => {
      drawHeader(vm); drawWatch(vm); drawRespond(vm); drawEnd(vm); placeStack(vm); announce(vm);
      const b = $('briefing-card');
      if (b) b.hidden = vm.phase !== 'briefing';
      const dr = $('drawer');
      if (dr && dr.hidden === vm.drawer) drawDrawer();
      const t = $('toast');
      if (t && !t.hidden && now() > toastUntil) t.hidden = true;
      if (t1 >= qNext) { placeQs(); qNext = t1 + 500; }
    });
    timed('audio', () => audio.update(vm));
    if (perf) {
      perfFrame(perf, {frameMs: now() - t0, simMs: t1 - t0, ticks, draw: drawMs});
      if (t1 - lastPerfDraw > 500) {
        lastPerfDraw = t1;
        const el = $('perf');
        if (el) { el.hidden = false; renderPerf(el, perf); }
      }
    }
    return ticks;
  }

  // ---------------------------------------------------------------- keys and gestures
  function run(a) {
    if (a.ui) {
      if (a.ui.do === 'dismissRespond' || a.ui.do === 'skipWatch') {
        const pop = $('popover');
        if (a.ui.do === 'skipWatch' && game.ui.drawer) { actions.ui({do: 'drawer', on: false}); return; }
        if (a.ui.do === 'skipWatch' && pop && !pop.hidden) { pop.hidden = true; return; }
      }
      actions.ui(a.ui);
    } else if (a.input) actions.input(a.input);
    else if (a.redispatch) actions.redispatch();
  }
  const unbindKeys = bindKeys(doc, keys, () => vm, a => {
    if (game.phase === 'briefing' && a.ui && a.ui.do === 'dismissRespond') return;
    run(a);
  }, now);
  // Enter on the briefing card takes the desk.
  doc.addEventListener('keydown', ev => { if (game.phase === 'briefing' && ev.key === 'Enter' && !ev.defaultPrevented) take(); });
  const gesture = () => { if (!audio.started) audio.start(); };
  doc.addEventListener('pointerdown', gesture);
  doc.addEventListener('keydown', gesture);

  let stopRaf = null;
  if (o.raf !== false) stopRaf = startRaf(onFrame, hidden => { game.director.hidden = hidden; });
  if (mods.errors.length) showToast(mods.errors[0]);

  return {
    game, actions, audio, mods, keys, perf,
    frame: onFrame,
    vm: () => vm,
    unbind() { unbindKeys(); if (stopRaf) stopRaf(); },
  };
}

function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.getItem('gridwatch:v4:probe');
    return s;
  } catch {
    return null;
  }
}

