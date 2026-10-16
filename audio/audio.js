// audio/audio.js: WebAudio for the game (K-19 hum, K-20 foley, K-21 tones, K-22 buses).
//
// Created on the first user gesture (browsers refuse to start audio before one) and silent
// when WebAudio is missing or refuses (C-8: the game plays fully without sound). Everything is
// synthesised; no samples: a foley voice is mixed from its recipe (audio/model.js VOICES) into
// a buffer the first time it is asked for. Math.random is allowed here (fx only, F-3): the
// noise layers.
//
//   master <- hum bus (the hum's two gains) | fx bus | alarms bus      gains: vm.settings
//
// At most MAX_NODES nodes live at once, the hum, the buses and the master included; a cue that
// would pass the budget is dropped and counted (au.dropped). A delayed cue (delayS) holds no
// nodes until it is due: it waits in au.pending and update() starts it, on time, a frame ahead.
//
//   const au = createAudio(globalThis);   // nothing happens yet
//   au.start();                           // on the first pointerdown / keydown
//   au.update(vm);                        // every frame: hum follows vm.needleHz; vm.settings; vm.cues play
//   au.cue('breaker'); au.cue({name: 'clack', pan: -0.2, delayS: 0.09});

import {humPartials, HUM_K, MAX_NODES, BASE_NODES, TONES, VOICES, RATE, nodesFor, busOf, busGains, normCue,
  rateAllows, durationOf, renderVoice} from './model.js';

/** Hum glide time constant (s): the pitch follows the needle smoothly. */
const GLIDE_S = 0.05;
/** A pending cue is started this far ahead of its time (s): more than one 60-Hz frame. */
const LOOKAHEAD_S = 0.02;
/** A voice whose `ended` event never came is freed this long after its end (s). */
const REAP_S = 0.005;
/** A pending cue later than this (a hidden tab's stalled frame loop) is dropped, not played late (s). */
const STALE_S = 0.5;
/** Most cues that may wait at once. */
const MAX_PENDING = 64;

/**
 * @param {object} win an object that may carry AudioContext / webkitAudioContext (globalThis)
 * @returns {object} the audio handle:
 *   ok, started, ctx, master, bus {fx, alarms}, hum; live / peak (nodes), dropped (cues over
 *   the budget or stale), limited (rate-limited), unknown (names not in the table); played
 *   (the last 50 names); settings; start(), update(vm), cue(c), setSettings(s), setVolume(v),
 *   setMuted(m), liveNodes()
 */
export function createAudio(win) {
  const Ctx = win && (win.AudioContext || win.webkitAudioContext);
  const au = {
    ok: !!Ctx, started: false, ctx: null, master: null, bus: null, hum: null, live: 0, peak: 0,
    dropped: 0, limited: 0, unknown: 0, played: [], pending: [], voices: [], buffers: {}, lastAt: {},
    settings: {volume: 0.8, hum: 1, fx: 1, alarms: 1, muted: false, reducedEffects: false},
    volume: 0.8, muted: false, humOn: true, humOver: false, canPan: false,
    start() {
      if (au.started || !Ctx) return au.started;
      try {
        const ctx = au.ctx = new Ctx();
        au.master = ctx.createGain();
        au.master.connect(ctx.destination);
        au.bus = {fx: ctx.createGain(), alarms: ctx.createGain()};
        au.bus.fx.connect(au.master); au.bus.alarms.connect(au.master);
        buildHum(au);
        au.canPan = typeof ctx.createStereoPanner === 'function';
        au.live = au.peak = BASE_NODES;
        au.started = true;
        applyGains(au);
        if (ctx.resume) { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
      } catch {
        au.ok = false; au.started = false; au.ctx = null; au.master = null; au.bus = null; au.hum = null; au.live = 0;
      }
      return au.started;
    },
    update(vm) {
      if (!au.started) return;
      try {
        const f = vm && Number.isFinite(vm.needleHz) ? vm.needleHz : vm && vm.obs && vm.obs.f ? vm.obs.f.hz : 50;
        au.humOver = !!(vm && vm.obs && vm.obs.over);
        if (vm && vm.settings) au.setSettings(vm.settings); else applyGains(au);
        setHum(au, f);
        drain(au);
      } catch { /* C-8: sound never stops the game */ }
      if (vm && vm.cues) for (const c of vm.cues) au.cue(c);
    },
    /**
     * Play a cue: a name or {name, pan?, gain?, delayS?}. False when it did not (and will not)
     * sound: not started, unknown name, rate-limited, over the node budget. Never throws.
     */
    cue(x) {
      if (!au.started) return false;
      try {
        const c = normCue(x);
        if (!c || !busOf(c.name)) { au.unknown++; return false; }
        const now = au.ctx.currentTime || 0;
        if (!rateAllows(c.name, now, au.lastAt[c.name])) { au.limited++; return false; }
        if (RATE[c.name]) au.lastAt[c.name] = now;
        if (c.delayS > LOOKAHEAD_S) {
          if (au.pending.length >= MAX_PENDING) { au.dropped++; return false; }
          au.pending.push({c, due: now + c.delayS});
          return true;
        }
        return play(au, c, now + c.delayS);
      } catch {
        return false;
      }
    },
    /** vm.settings (desk/README §13.1); the 1a shape {volume, muted} works too. */
    setSettings(s) {
      if (!s) return;
      const o = au.settings;
      for (const k of ['volume', 'hum', 'fx', 'alarms']) if (s[k] >= 0 && s[k] <= 1) o[k] = s[k];
      if ('muted' in s) o.muted = !!s.muted;
      if ('reducedEffects' in s) o.reducedEffects = !!s.reducedEffects;
      au.volume = o.volume; au.muted = o.muted;
      applyGains(au);
    },
    setVolume(v) { au.setSettings({volume: v}); },
    setMuted(m) { au.setSettings({muted: !!m}); },
    liveNodes() { return au.live; },
  };
  return au;
}

const setParam = (p, v) => { if (p.value !== v) p.value = v; };

function applyGains(au) {
  if (!au.started) return;
  const g = busGains(au.settings), h = au.hum, hum = au.humOn ? g.hum : 0;
  setParam(au.master.gain, g.master);
  setParam(au.bus.fx.gain, g.fx);
  setParam(au.bus.alarms.gain, g.alarms);
  // The hum bus is the hum's own two gains (a third node would only cost budget). The hum
  // falls silent when the day is over; its reference stays, as in 1a.
  setParam(h.humGain.gain, au.humOver ? 0 : h.level * hum);
  setParam(h.refGain.gain, h.refLevel * hum);
}

function buildHum(au) {
  const ctx = au.ctx, parts = humPartials(50);
  const humGain = ctx.createGain(), refGain = ctx.createGain();
  humGain.connect(au.master); refGain.connect(au.master);
  const osc = [], ref = [];
  for (const p of parts) {
    const o = ctx.createOscillator(), r = ctx.createOscillator();
    o.type = 'sine'; r.type = 'sine';
    o.frequency.value = p.hz; r.frequency.value = p.refHz;
    o.connect(humGain); r.connect(refGain);
    o.start(); r.start();
    osc.push(o); ref.push(r);
  }
  // Levels: a gain node per voice would double the node count (K-20's budget), so the four
  // partials sum at equal level on one gain and the two gains carry the -30 dBFS hum and the
  // quieter reference (the model's 1/k shares, averaged).
  const g = parts.reduce((a, p) => a + p.gain, 0), rg = parts.reduce((a, p) => a + p.refGain, 0);
  au.hum = {osc, ref, humGain, refGain, level: g / HUM_K.length, refLevel: rg / HUM_K.length};
}

function setHum(au, f) {
  const h = au.hum, t = au.ctx.currentTime || 0;
  for (let i = 0; i < h.osc.length; i++) {
    const hz = HUM_K[i] * 2 * f, fr = h.osc[i].frequency;
    if (fr.setTargetAtTime) fr.setTargetAtTime(hz, t, GLIDE_S); else fr.value = hz;
  }
}

// ------------------------------------------------------------------ the node budget

// Free the voices that ended without saying so (a suspended context, a missing `ended`).
function reap(au, now) {
  let any = false;
  for (const v of au.voices) {
    if (!v.done && now > v.endT + REAP_S) v.free();
    if (v.done) any = true;
  }
  if (any) au.voices = au.voices.filter(v => !v.done);
}

// Count a voice's nodes until its source ends (or reap() finds it overdue).
function hold(au, n, endT, src, nodes) {
  const v = {n, endT, done: false, free() {
    if (v.done) return;
    v.done = true; au.live -= n;
    for (const x of nodes) { try { x.disconnect(); } catch { /* ignore */ } }
  }};
  au.live += n;
  if (au.live > au.peak) au.peak = au.live;
  au.voices.push(v);
  if ('onended' in src) src.onended = v.free; else if (src.addEventListener) src.addEventListener('ended', v.free);
}

// Start the pending cues that are due within the next frame, each at its own time.
function drain(au) {
  const now = au.ctx.currentTime || 0;
  reap(au, now);
  if (!au.pending.length) return;
  const keep = [];
  for (const p of au.pending) {
    if (p.due > now + LOOKAHEAD_S) keep.push(p);
    else if (p.due < now - STALE_S) au.dropped++;
    else { try { play(au, p.c, Math.max(now, p.due)); } catch { /* ignore */ } }
  }
  au.pending = keep;
}

// ------------------------------------------------------------------ playing

function play(au, c, at) {
  reap(au, au.ctx.currentTime || 0);
  const panned = au.canPan && c.pan !== 0, need = nodesFor(c.name, panned);
  if (au.live + need > MAX_NODES) { au.dropped++; return false; }
  const ctx = au.ctx, nodes = [];
  try {
    const g = ctx.createGain();
    nodes.push(g);
    let tail = g;
    if (panned) {
      const p = ctx.createStereoPanner();
      p.pan.value = c.pan;
      g.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(au.bus[busOf(c.name)]);
    const src = TONES[c.name] ? tone(au, TONES[c.name], g, c.gain, at, nodes) : voice(au, c.name, g, c.gain, at, nodes);
    hold(au, need, at + durationOf(c.name), src, nodes);
  } catch {
    for (const x of nodes) { try { x.disconnect(); } catch { /* ignore */ } }
    return false;
  }
  au.played.push(c.name);
  if (au.played.length > 50) au.played.shift();
  return true;
}

// Oscillator notes through one gain, gated per note. Returns the source that ends last.
function tone(au, spec, g, gain, t0, nodes) {
  const ctx = au.ctx, level = spec.level * gain;
  g.gain.value = 0;
  let last = null, end = -1;
  for (const [hz, at, dur] of spec.notes) {
    const o = ctx.createOscillator();
    nodes.push(o);
    o.type = spec.type; o.frequency.value = hz;
    o.connect(g);
    if (g.gain.setValueAtTime) {
      g.gain.setValueAtTime(level, t0 + at);
      g.gain.setValueAtTime(0, t0 + at + dur);
    } else g.gain.value = level;
    o.start(t0 + at); o.stop(t0 + at + dur);
    if (at + dur >= end) { end = at + dur; last = o; }
  }
  return last;
}

// A foley voice: its rendered buffer (made once per context) through one gain.
function voice(au, name, g, gain, t0, nodes) {
  const ctx = au.ctx, spec = VOICES[name];
  let buf = au.buffers[name];
  if (!buf) {
    const sr = ctx.sampleRate || 48000, data = renderVoice(spec, sr);
    buf = ctx.createBuffer(1, data.length, sr);
    if (buf.copyToChannel) buf.copyToChannel(data, 0); else buf.getChannelData(0).set(data);
    au.buffers[name] = buf;
  }
  const src = ctx.createBufferSource();
  nodes.push(src);
  src.buffer = buf;
  g.gain.value = spec.level * gain;
  src.connect(g);
  src.start(t0);
  return src;
}
