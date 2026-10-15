// audio/model.js: the pure parts of the game's sound (K-19 hum, K-20 foley, K-21 alarm tones,
// K-22 buses), so Node tests can check them without WebAudio.
//
// K-19 mains hum: transformers hum at twice grid frequency, so the hum has partials at k x 2f
// (k = 1..4). A quiet reference tone sits at k x 100 Hz (twice the 50-Hz nominal); each partial
// beats against its reference at 2k x |f - 50| (at 49.75 Hz the 400 Hz partial wobbles twice a
// second). Default level -30 dBFS. There is no such tone in a real control room: it is
// sonification, labelled in the abstractions drawer (H-14).
// K-20 breaker close: a bandpassed noise transient plus inharmonic partials near 0.9, 1.4 and
// 2.2 kHz, decaying over 120 ms, plus a thud.
//
// Phase 1b (desk/README §13.2): every cue is data. A cue is either a TONE (oscillators, the
// K-21 alarm sounds) or a VOICE: a list of layers (bandpassed noise, sines, saws, squares, each
// with its own envelope) that renderVoice() mixes into one buffer. A rendered voice plays
// through a source and a gain (and a panner when panned): 2-3 live nodes, whatever its recipe,
// which is what lets 16 UFLS clacks, a horn and a breaker share the 32-node budget.

import {SUBURBS, BASE_W} from '../render/mapdata.js';

/** Nominal frequency (Hz). */
export const F0 = 50;
/** Hum partial numbers (K-19). */
export const HUM_K = Object.freeze([1, 2, 3, 4]);
/** Hum level (dBFS) at the default volume (K-19). */
export const HUM_DBFS = -30;
/** The reference tone sits this many dB below the hum. */
export const REF_REL_DB = -10;
/** A hard ceiling on simultaneous WebAudio nodes (K-20), the hum and the buses included. */
export const MAX_NODES = 32;
/** Breaker clack (K-20). */
export const CLACK = Object.freeze({partialsHz: Object.freeze([900, 1400, 2200]), noiseCentreHz: 1800, noiseQ: 1.2,
  decayS: 0.12, thudHz: 70, thudDecayS: 0.09, level: 0.5});
/** Alarm tones (K-21 basics): P1 two-tone horn, P2 chime, tray ring (twice), soft tick. */
export const TONES = Object.freeze({
  horn: Object.freeze({notes: Object.freeze([[440, 0, 0.35], [554, 0.4, 0.35]]), type: 'square', level: 0.12}),
  chime: Object.freeze({notes: Object.freeze([[880, 0, 0.6]]), type: 'sine', level: 0.15}),
  ring2: Object.freeze({notes: Object.freeze([[1320, 0, 0.12], [1320, 0.25, 0.12]]), type: 'triangle', level: 0.08}),
  tick: Object.freeze({notes: Object.freeze([[2000, 0, 0.03]]), type: 'sine', level: 0.05}),
});

/** dBFS -> linear gain. */
export const dbToGain = db => Math.pow(10, db / 20);

/**
 * Foley voices (K-20), as data for renderVoice(). `durS`: the buffer's length; `level`: the
 * voice's gain. A layer is {type: 'noise' | 'sine' | 'saw' | 'square', level, at?: s,
 * durS?: s (default: to the end)} plus
 *   noise: bandHz, q (a bandpass over white noise);
 *   others: hz, a number or [from, to] (a linear sweep over the layer);
 *   envelope: decayS (exponential, -60 dB at decayS) or attackS / releaseS (linear fades).
 */
export const VOICES = Object.freeze({
  // Levers: an 80 Hz detent thump.
  detent: {durS: 0.11, level: 0.6, layers: [
    {type: 'sine', hz: 80, level: 1, decayS: 0.1},
    {type: 'noise', bandHz: 900, q: 1, level: 0.25, decayS: 0.012}]},
  // The drag ratchet: one pawl tick (rate-limited to 20 a second, RATE).
  ratchet: {durS: 0.02, level: 0.22, layers: [
    {type: 'noise', bandHz: 3200, q: 2.5, level: 1, decayS: 0.014},
    {type: 'sine', hz: 2100, level: 0.3, decayS: 0.008}]},
  // Gate thunk: a low body dropping in pitch under a dull knock.
  gate: {durS: 0.2, level: 0.55, layers: [
    {type: 'sine', hz: [120, 55], level: 1, decayS: 0.18},
    {type: 'noise', bandHz: 420, q: 0.9, level: 0.6, decayS: 0.05}]},
  // Key turn: the barrel's two clicks, the second with a little ring.
  key: {durS: 0.16, level: 0.35, layers: [
    {type: 'noise', bandHz: 2600, q: 2, level: 0.7, decayS: 0.02},
    {type: 'noise', bandHz: 3400, q: 2, level: 1, decayS: 0.03, at: 0.08},
    {type: 'sine', hz: 1250, level: 0.35, decayS: 0.06, at: 0.08}]},
  // Guard / cover: a light click.
  cover: {durS: 0.035, level: 0.2, layers: [
    {type: 'noise', bandHz: 4200, q: 2, level: 1, decayS: 0.015},
    {type: 'sine', hz: 1800, level: 0.4, decayS: 0.02}]},
  // Push button: a short soft knock.
  button: {durS: 0.07, level: 0.32, layers: [
    {type: 'sine', hz: [260, 180], level: 1, decayS: 0.05},
    {type: 'noise', bandHz: 1500, q: 1.2, level: 0.5, decayS: 0.02}]},
  // The plan's servo moving a lever handle (L-6): a short motor whirr.
  servo: {durS: 0.22, level: 0.12, layers: [
    {type: 'saw', hz: [95, 150], level: 0.7, attackS: 0.03, releaseS: 0.06},
    {type: 'sine', hz: [380, 600], level: 0.5, attackS: 0.03, releaseS: 0.06}]},
  // Breaker close (K-20): the 1a clack, from CLACK.
  breaker: {durS: Math.max(CLACK.decayS, CLACK.thudDecayS * 1.5), level: CLACK.level, layers: [
    {type: 'noise', bandHz: CLACK.noiseCentreHz, q: CLACK.noiseQ, level: 1, decayS: CLACK.decayS},
    ...CLACK.partialsHz.map(hz => ({type: 'sine', hz, level: 0.4, decayS: CLACK.decayS})),
    {type: 'sine', hz: CLACK.thudHz, level: dbToGain(-3), decayS: CLACK.thudDecayS}]},
  // A load-shedding relay: smaller and brighter than the breaker, over before the next one
  // (90 ms apart, CLACK_STAGGER_S).
  clack: {durS: 0.07, level: 0.4, layers: [
    {type: 'noise', bandHz: 2600, q: 1.5, level: 1, decayS: 0.05},
    {type: 'sine', hz: 1700, level: 0.35, decayS: 0.05},
    {type: 'sine', hz: 2900, level: 0.25, decayS: 0.04},
    {type: 'sine', hz: 130, level: 0.6, decayS: 0.04}]},
  // Out-of-phase growl: 60-90 Hz for 1.5 s; two saws a few Hz apart beat like a machine
  // fighting the grid.
  growl: {durS: 1.5, level: 0.3, layers: [
    {type: 'saw', hz: [60, 90], level: 0.6, attackS: 0.04, releaseS: 0.5},
    {type: 'saw', hz: [64, 84], level: 0.5, attackS: 0.04, releaseS: 0.5},
    {type: 'sine', hz: [60, 90], level: 0.6, attackS: 0.04, releaseS: 0.5}]},
  // Sync-check relay refusal: a flat mains buzz.
  buzz: {durS: 0.28, level: 0.14, layers: [
    {type: 'square', hz: 100, level: 0.7, attackS: 0.004, releaseS: 0.03},
    {type: 'saw', hz: 200, level: 0.4, attackS: 0.004, releaseS: 0.03}]},
  // Turbine spool up / down (<= 3 s): a rumble and a whine sweeping together.
  spoolUp: {durS: 2.8, level: 0.16, layers: [
    {type: 'saw', hz: [35, 180], level: 0.5, attackS: 0.5, releaseS: 0.9},
    {type: 'sine', hz: [300, 2200], level: 0.35, attackS: 0.8, releaseS: 0.9},
    {type: 'noise', bandHz: 1400, q: 0.7, level: 0.25, attackS: 1.2, releaseS: 1.0}]},
  spoolDown: {durS: 3.0, level: 0.16, layers: [
    {type: 'saw', hz: [180, 30], level: 0.5, attackS: 0.05, releaseS: 1.6},
    {type: 'sine', hz: [2200, 220], level: 0.35, attackS: 0.05, releaseS: 2.0},
    {type: 'noise', bandHz: 1400, q: 0.7, level: 0.25, attackS: 0.05, releaseS: 2.4}]},
});

/** Which bus each cue plays on (desk/README §13.2). The hum has its own. */
export const BUS = Object.freeze({
  detent: 'fx', ratchet: 'fx', gate: 'fx', key: 'fx', cover: 'fx', button: 'fx', servo: 'fx', breaker: 'fx',
  clack: 'fx', growl: 'fx', buzz: 'fx', spoolUp: 'fx', spoolDown: 'fx',
  horn: 'alarms', chime: 'alarms', ring2: 'alarms', tick: 'alarms',
});
/** Every cue name audio/ plays. */
export const CUE_NAMES = Object.freeze(Object.keys(BUS));

/** The bus of a cue ('fx' | 'alarms'), '' for an unknown name. */
export function busOf(name) {
  return Object.prototype.hasOwnProperty.call(BUS, name) ? BUS[name] : '';
}

/** A cue's spec: {kind: 'tone', ...TONES[name]} or {kind: 'voice', ...VOICES[name]}; null if unknown. */
export function specOf(name) {
  if (!busOf(name)) return null;
  return TONES[name] ? Object.assign({kind: 'tone'}, TONES[name]) : Object.assign({kind: 'voice'}, VOICES[name]);
}

/** How long a cue sounds (s); 0 for an unknown name. */
export function durationOf(name) {
  const s = specOf(name);
  if (!s) return 0;
  return s.kind === 'voice' ? s.durS : s.notes.reduce((a, [, at, dur]) => Math.max(a, at + dur), 0);
}

/**
 * Nodes one cue holds while it sounds (the budget check in audio/audio.js): a voice is a
 * buffer source and a gain, a tone is one oscillator per note and a gain; one more when the
 * cue is panned (a StereoPannerNode). 0 for an unknown name.
 */
export function nodesFor(name, panned = false) {
  const s = specOf(name);
  if (!s) return 0;
  return (s.kind === 'voice' ? 2 : s.notes.length + 1) + (panned ? 1 : 0);
}

/** Nodes the hum holds: 4 partials + 4 references + their two gains, which are the hum bus. */
export const HUM_NODES = 2 * HUM_K.length + 2;
/** The fx bus, the alarms bus and the master gain. */
export const BUS_NODES = 3;
/** Nodes live from start() on, before any cue. */
export const BASE_NODES = HUM_NODES + BUS_NODES;

/**
 * The hum's partials at grid frequency f.
 * @returns {Array<{k:number, hz:number, refHz:number, beatHz:number, gain:number, refGain:number}>}
 *   gain: each partial's share of the -30 dBFS hum (1/k, normalised), refGain: its reference's.
 */
export function humPartials(fHz) {
  const f = Number.isFinite(fHz) ? fHz : F0;
  const norm = HUM_K.reduce((a, k) => a + 1 / k, 0);
  const total = dbToGain(HUM_DBFS), ref = dbToGain(REF_REL_DB);
  return HUM_K.map(k => ({k, hz: k * 2 * f, refHz: k * 2 * F0, beatHz: 2 * k * Math.abs(f - F0),
    gain: total * (1 / k) / norm, refGain: total * ref * (1 / k) / norm}));
}

/** The beat rate the ear hears between partial k and its reference at frequency f. */
export function beatRate(fHz, k) {
  return Math.abs(k * 2 * fHz - k * 2 * F0);
}

/** Clack envelope at time t (s) after the close: exp decay reaching -60 dB at CLACK.decayS. */
export function clackEnvelope(t) {
  if (t < 0) return 0;
  return Math.exp(-t * Math.log(1000) / CLACK.decayS);
}

// ------------------------------------------------------------------ settings and buses (K-22)

const unit = (v, dflt) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : dflt);

/**
 * Bus gains from vm.settings (desk/README §13.1). Tolerates the 1a shape ({volume, muted}) and
 * a missing object: absent or bad fields take their defaults (volume 0.8, the rest 1).
 * `muted` silences the master; `reducedEffects` or `hum === 0` silences the hum bus.
 * @returns {{master:number, hum:number, fx:number, alarms:number}}
 */
export function busGains(settings) {
  const s = settings || {};
  return {
    master: s.muted ? 0 : unit(s.volume, 0.8),
    hum: s.reducedEffects ? 0 : unit(s.hum, 1),
    fx: unit(s.fx, 1),
    alarms: unit(s.alarms, 1),
  };
}

// ------------------------------------------------------------------ cues

/**
 * A cue as audio/ plays it, from a string or {name, pan?, gain?, delayS?}: pan clamped to
 * -1..1 (default 0), gain to 0..1 (default 1), delayS >= 0 (default 0). null when it has no name.
 * @returns {{name:string, pan:number, gain:number, delayS:number}|null}
 */
export function normCue(c) {
  if (typeof c === 'string') return c ? {name: c, pan: 0, gain: 1, delayS: 0} : null;
  if (!c || typeof c.name !== 'string' || !c.name) return null;
  const pan = Number.isFinite(c.pan) ? Math.max(-1, Math.min(1, c.pan)) : 0;
  const gain = Number.isFinite(c.gain) ? Math.max(0, Math.min(1, c.gain)) : 1;
  const delayS = Number.isFinite(c.delayS) && c.delayS > 0 ? c.delayS : 0;
  return {name: c.name, pan, gain, delayS};
}

/**
 * Rate limits (K-20), as the least real time between two soundings of a cue: the drag ratchet
 * ticks at most 20 times a second, the servo whirrs at most once per 0.25 s.
 */
export const RATE = Object.freeze({ratchet: 1 / 20, servo: 0.25});

/**
 * May cue `name` sound at real time nowS, given when it last sounded (lastS; undefined or
 * -Infinity: never)? Pure: the caller keeps the timestamps. Cues without a limit always may.
 */
export function rateAllows(name, nowS, lastS) {
  const gap = RATE[name];
  if (!gap || !Number.isFinite(lastS)) return true;
  // 1e-9: 20 ticks exactly 50 ms apart must all pass despite float sums; a clock that ran
  // backwards (a new context) must not mute the cue for good.
  return nowS < lastS || nowS - lastS >= gap - 1e-9;
}

/** Stereo position of a map x in base px (BASE_W wide): -1 (west edge) .. 1 (east edge). */
export function panOfX(x) {
  return Math.max(-1, Math.min(1, x / BASE_W * 2 - 1));
}

/** How far the westmost and eastmost suburbs sit from centre (stage C: the map-wide formula gave only -0.19..+0.34). */
export const CITY_PAN = 0.8;
const CITY_X = SUBURBS.map(s => s.box[0] + s.box[2] / 2);
const CITY_MID = (Math.min(...CITY_X) + Math.max(...CITY_X)) / 2, CITY_HALF = (Math.max(...CITY_X) - Math.min(...CITY_X)) / 2 || 1;

/**
 * Stereo position of a suburb (render/mapdata.js SUBURBS: its box's centre x); 0 if unknown.
 * The city sits mid-map, so the pan is taken across the city's own width (west suburbs
 * -CITY_PAN, east +CITY_PAN): a district's clack is heard where it is, not all near centre.
 */
export function panOfSuburb(code) {
  const sb = SUBURBS.find(s => s.id === code);
  return sb ? CITY_PAN * (sb.box[0] + sb.box[2] / 2 - CITY_MID) / CITY_HALF : 0;
}

/** Seconds between two districts' clacks in one shed (the map darkens its blocks at this rate). */
export const CLACK_STAGGER_S = 0.09;

// A district's suburb: ctx.suburbOf when given, else the id's own prefix ('RED1' -> 'RED').
function suburbOf(ctx, districtId) {
  let code = '';
  if (ctx && typeof ctx.suburbOf === 'function') { try { code = ctx.suburbOf(districtId) || ''; } catch { code = ''; } }
  if (!code && typeof districtId === 'string') code = districtId.slice(0, 3);
  return code;
}

/**
 * The cues a sim record asks for (sim/README §7), in play order.
 *   breaker closed (why 'sync'; a machine or the tie)   -> breaker
 *   breaker opened on a machine (why 'stop' | 'trip')   -> spoolDown (the tie has no machine)
 *   restore (a feeder closing)                          -> breaker, panned to the district
 *   ufls                                                -> one clack per district, panned, 90 ms apart
 *   shed (DIRECT SHED)                                  -> clack, panned
 *   sync rough | reverse | bypass                       -> growl (a clean close is the breaker
 *                                                          record's clack, which comes first)
 *   input refused by the sync-check relay (cue 'buzz')  -> buzz
 * Horns, chimes and the tray's sounds are not here: app/alarms.js and app/tray.js own them.
 * No record marks a machine STARTING (see cuesOfInput and cueOfModeChange for spoolUp).
 * @param {object} r a record from step()
 * @param {{suburbOf?: (districtId:string) => string}} [ctx]
 * @returns {Array<string|{name:string, pan?:number, delayS?:number}>}
 */
export function cuesOfRecord(r, ctx) {
  if (!r) return [];
  switch (r.kind) {
    case 'breaker':
      if (r.closed) return ['breaker'];
      return r.unit !== 'tie' && (r.why === 'stop' || r.why === 'trip') ? ['spoolDown'] : [];
    case 'restore': return [{name: 'breaker', pan: panOfSuburb(suburbOf(ctx, r.district))}];
    case 'ufls': return (r.districts || []).map((id, i) => ({name: 'clack', pan: panOfSuburb(suburbOf(ctx, id)), delayS: i * CLACK_STAGGER_S}));
    case 'shed': return [{name: 'clack', pan: panOfSuburb(suburbOf(ctx, r.district))}];
    case 'sync': return r.result === 'rough' || r.result === 'reverse' || r.result === 'bypass' ? ['growl'] : [];
    case 'input': return r.cue === 'buzz' ? ['buzz'] : [];
    default: return [];
  }
}

/**
 * spoolUp, route 1: the cues of an ACCEPTED input (an input {type, ...} or a state.log entry
 * {tick, type, args}): `start` -> spoolUp. Refused inputs come back as `input` records
 * (cuesOfRecord); the sim emits nothing for an accepted one.
 */
export function cuesOfInput(input) {
  return input && input.type === 'start' ? ['spoolUp'] : [];
}

/**
 * spoolUp, route 2 (covers the plan's booked starts too): the cue of a machine's mode changing
 * between two observations: anything -> 'starting' is spoolUp. Stops and trips are NOT here
 * (their breaker records give spoolDown), so the two routes never double.
 */
export function cueOfModeChange(from, to) {
  return to === 'starting' && from !== 'starting' && from !== undefined ? 'spoolUp' : '';
}

/**
 * Phase 1a's single cue per record, kept until stage C moves the game to cuesOfRecord: the
 * breaker clack for a machine's breaker closing and a feeder closed by RESTORE.
 */
export function cueOfRecord(r) {
  if (r.kind === 'breaker' && r.closed) return 'breaker';
  if (r.kind === 'restore') return 'breaker';
  return '';
}

// ------------------------------------------------------------------ rendering a voice

// White noise through an RBJ bandpass (constant 0 dB peak), in place.
function bandpass(x, sr, hz, q) {
  const w = 2 * Math.PI * Math.min(hz, sr * 0.45) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
}

/**
 * Mix a voice's layers into one mono buffer (see VOICES for the layer fields).
 * @param {{durS:number, layers:Array<object>}} spec
 * @param {number} sr sample rate (Hz)
 * @param {() => number} [rnd] noise source in [0, 1) (default Math.random: fx only, F-3)
 * @returns {Float32Array} samples in -1..1; the voice's `level` is NOT applied (the gain node carries it)
 */
export function renderVoice(spec, sr, rnd = Math.random) {
  const n = Math.max(1, Math.floor(spec.durS * sr)), out = new Float32Array(n);
  for (const L of spec.layers) {
    const i0 = Math.min(n, Math.floor((L.at || 0) * sr));
    const len = Math.min(n - i0, L.durS ? Math.floor(L.durS * sr) : n - i0);
    if (len <= 0) continue;
    const durS = len / sr, k = L.decayS ? Math.log(1000) / L.decayS : 0;
    const env = t => {
      let e = k ? Math.exp(-t * k) : 1;
      if (L.attackS && t < L.attackS) e *= t / L.attackS;
      if (L.releaseS && t > durS - L.releaseS) e *= Math.max(0, (durS - t) / L.releaseS);
      return e;
    };
    if (L.type === 'noise') {
      const x = new Float32Array(len);
      for (let i = 0; i < len; i++) x[i] = rnd() * 2 - 1;
      // The bandpass thins white noise by about sqrt(bandwidth / Nyquist); make that up so a
      // layer's level means roughly the same for noise and for a sine.
      bandpass(x, sr, L.bandHz, L.q || 1);
      const makeup = Math.min(8, 1 / Math.sqrt(Math.max(0.02, Math.min(L.bandHz, sr * 0.45) / (L.q || 1) / (sr / 2))));
      for (let i = 0; i < len; i++) out[i0 + i] += x[i] * makeup * L.level * env(i / sr);
    } else {
      const sweep = Array.isArray(L.hz), f0 = sweep ? L.hz[0] : L.hz, f1 = sweep ? L.hz[1] : L.hz;
      let ph = 0; // cycles; integrating the frequency keeps a sweep free of clicks
      for (let i = 0; i < len; i++) {
        const fr = ph - Math.floor(ph);
        const s = L.type === 'sine' ? Math.sin(2 * Math.PI * fr) : L.type === 'saw' ? 2 * fr - 1 : fr < 0.5 ? 1 : -1;
        out[i0 + i] += s * L.level * env(i / sr);
        ph += (f0 + (f1 - f0) * (i / len)) / sr;
      }
    }
  }
  // The last 2 ms fade to zero (no click when a flat layer runs to the end), and a mix whose
  // layers sum past full scale is scaled back to it (clipping would add harshness).
  const fade = Math.min(n, Math.max(1, Math.floor(0.002 * sr)));
  let peak = 0;
  for (let i = 0; i < n; i++) {
    if (i >= n - fade) out[i] *= (n - 1 - i) / fade;
    const a = out[i] < 0 ? -out[i] : out[i];
    if (a > peak) peak = a;
  }
  if (peak > 1) for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}
