// audio/audio.js: WebAudio for the game (K-19 hum, K-20 breaker clack, K-21 basic tones).
//
// Created on the first user gesture (browsers refuse to start audio before one) and silent
// when WebAudio is missing or refuses (C-8: the game plays fully without sound). Everything is
// synthesised; no samples. At most MAX_NODES nodes live at once: a cue that would pass the
// budget is dropped. Math.random is allowed here (fx only, F-3): the clack's noise burst.
//
//   const au = createAudio(globalThis);   // nothing happens yet
//   au.start();                           // on the first pointerdown / keydown
//   au.update(vm);                        // every frame: hum follows vm.needleHz; vm.cues play
//   au.cue('breaker');

import {humPartials, HUM_K, MAX_NODES, HUM_NODES, CLACK, TONES, nodesFor, dbToGain} from './model.js';

/** Hum glide time constant (s): the pitch follows the needle smoothly. */
const GLIDE_S = 0.05;

/**
 * @param {object} win an object that may carry AudioContext / webkitAudioContext (globalThis)
 * @returns {object} the audio handle
 */
export function createAudio(win) {
  const Ctx = win && (win.AudioContext || win.webkitAudioContext);
  const au = {
    ok: !!Ctx, started: false, ctx: null, master: null, hum: null, live: 0, peak: 0, dropped: 0,
    volume: 0.8, muted: false, humOn: true, played: [],
    start() {
      if (au.started || !Ctx) return au.started;
      try {
        au.ctx = new Ctx();
        au.master = au.ctx.createGain();
        au.master.gain.value = au.muted ? 0 : au.volume;
        au.master.connect(au.ctx.destination);
        au.live = 1;
        buildHum(au);
        au.started = true;
        if (au.ctx.resume) { try { const p = au.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
      } catch {
        au.ok = false; au.ctx = null; au.master = null; au.hum = null; au.live = 0;
      }
      return au.started;
    },
    update(vm) {
      if (!au.started) return;
      const f = vm && Number.isFinite(vm.needleHz) ? vm.needleHz : vm && vm.obs ? vm.obs.f.hz : 50;
      setHum(au, f, vm && vm.obs ? vm.obs.over : false);
      if (vm && vm.settings) { au.setVolume(vm.settings.volume); au.setMuted(vm.settings.muted); }
      if (vm && vm.cues) for (const c of vm.cues) au.cue(c);
    },
    cue(name) {
      if (!au.started) return false;
      const need = nodesFor(name);
      if (!need || au.live + need > MAX_NODES) { au.dropped++; return false; }
      try {
        if (name === 'breaker') clack(au); else tone(au, TONES[name]);
        au.played.push(name);
        if (au.played.length > 50) au.played.shift();
        return true;
      } catch {
        return false;
      }
    },
    setVolume(v) {
      if (!(v >= 0 && v <= 1)) return;
      au.volume = v;
      if (au.master) au.master.gain.value = au.muted ? 0 : v;
    },
    setMuted(m) {
      au.muted = !!m;
      if (au.master) au.master.gain.value = au.muted ? 0 : au.volume;
    },
    liveNodes() { return au.live; },
  };
  return au;
}

function track(au, n) {
  au.live += n;
  if (au.live > au.peak) au.peak = au.live;
}

function buildHum(au) {
  const ctx = au.ctx, parts = humPartials(50);
  const humGain = ctx.createGain(), refGain = ctx.createGain();
  humGain.gain.value = 1; refGain.gain.value = 1;
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
  // partials sum at equal level on one bus and the two bus gains carry the -30 dBFS hum and
  // the quieter reference (the model's 1/k shares, averaged).
  const g = parts.reduce((a, p) => a + p.gain, 0), rg = parts.reduce((a, p) => a + p.refGain, 0);
  humGain.gain.value = g / HUM_K.length;
  refGain.gain.value = rg / HUM_K.length;
  au.hum = {osc, ref, humGain, refGain, level: g / HUM_K.length};
  track(au, HUM_NODES - 1); // the master is already counted
}

function setHum(au, f, over) {
  const h = au.hum;
  if (!h) return;
  const t = au.ctx.currentTime || 0;
  for (let i = 0; i < h.osc.length; i++) {
    const hz = HUM_K[i] * 2 * f;
    const fr = h.osc[i].frequency;
    if (fr.setTargetAtTime) fr.setTargetAtTime(hz, t, GLIDE_S); else fr.value = hz;
  }
  const lvl = over || !au.humOn ? 0 : h.level;
  if (h.humGain.gain.value !== lvl) h.humGain.gain.value = lvl;
}

// A node group that frees its budget when its last source ends.
function release(au, n, src) {
  let done = false;
  const free = () => { if (!done) { done = true; au.live -= n; } };
  if (src && 'onended' in src) src.onended = free; else if (src && src.addEventListener) src.addEventListener('ended', free);
  else free();
}

function tone(au, spec) {
  const ctx = au.ctx, t0 = ctx.currentTime || 0;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(au.master);
  let last = null, end = 0;
  for (const [hz, at, dur] of spec.notes) {
    const o = ctx.createOscillator();
    o.type = spec.type; o.frequency.value = hz;
    o.connect(g);
    if (g.gain.setValueAtTime) {
      g.gain.setValueAtTime(spec.level, t0 + at);
      g.gain.setValueAtTime(0, t0 + at + dur);
    } else g.gain.value = spec.level;
    o.start(t0 + at); o.stop(t0 + at + dur);
    if (at + dur >= end) { end = at + dur; last = o; }
  }
  const n = spec.notes.length + 1;
  track(au, n);
  release(au, n, last);
}

function clack(au) {
  const ctx = au.ctx, t0 = ctx.currentTime || 0, sr = ctx.sampleRate || 48000;
  const len = Math.max(1, Math.floor(sr * CLACK.decayS));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData ? buf.getChannelData(0) : new Float32Array(len);
  const k = Math.log(1000) / CLACK.decayS;
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-(i / sr) * k);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = CLACK.noiseCentreHz; bp.Q.value = CLACK.noiseQ;
  const ng = ctx.createGain();
  ng.gain.value = CLACK.level;
  src.connect(bp); bp.connect(ng); ng.connect(au.master);
  const pg = ctx.createGain();
  pg.gain.value = CLACK.level * 0.4;
  if (pg.gain.setTargetAtTime) pg.gain.setTargetAtTime(0, t0, CLACK.decayS / 6.9);
  pg.connect(au.master);
  let last = src;
  for (const hz of CLACK.partialsHz) {
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = hz;
    o.connect(pg); o.start(t0); o.stop(t0 + CLACK.decayS);
  }
  const th = ctx.createOscillator(), tg = ctx.createGain();
  th.type = 'sine'; th.frequency.value = CLACK.thudHz;
  tg.gain.value = CLACK.level * dbToGain(-3);
  if (tg.gain.setTargetAtTime) tg.gain.setTargetAtTime(0, t0, CLACK.thudDecayS / 6.9);
  th.connect(tg); tg.connect(au.master);
  th.start(t0); th.stop(t0 + CLACK.thudDecayS * 1.5);
  src.start(t0);
  last = th;
  track(au, 9);
  release(au, 9, last);
}
