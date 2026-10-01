// audio/model.js: the pure parts of the game's sound (K-19 hum, K-20 breaker clack, K-21
// alarm tones), so Node tests can check them without WebAudio.
//
// K-19 mains hum: transformers hum at twice grid frequency, so the hum has partials at k x 2f
// (k = 1..4). A quiet reference tone sits at k x 100 Hz (twice the 50-Hz nominal); each partial
// beats against its reference at 2k x |f - 50| (at 49.75 Hz the 400 Hz partial wobbles twice a
// second). Default level -30 dBFS. There is no such tone in a real control room: it is
// sonification, labelled in the abstractions drawer (H-14).
// K-20 breaker close: a bandpassed noise transient plus inharmonic partials near 0.9, 1.4 and
// 2.2 kHz, decaying over 120 ms, plus a thud.

/** Nominal frequency (Hz). */
export const F0 = 50;
/** Hum partial numbers (K-19). */
export const HUM_K = Object.freeze([1, 2, 3, 4]);
/** Hum level (dBFS) at the default volume (K-19). */
export const HUM_DBFS = -30;
/** The reference tone sits this many dB below the hum. */
export const REF_REL_DB = -10;
/** A hard ceiling on simultaneous WebAudio nodes (K-20). */
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

/** Nodes one cue uses (the budget check in audio/audio.js). */
export function nodesFor(cue) {
  if (cue === 'breaker') return 9; // noise source + bandpass + gain, 3 partials + their gain, thud osc + gain
  const t = TONES[cue];
  return t ? t.notes.length + 1 : 0;
}

/** Nodes the hum holds (4 partials + 4 references + 2 gains) plus the master gain. */
export const HUM_NODES = 2 * HUM_K.length + 2 + 1;

/**
 * Which cue a sim record asks for (sim/README §7 `cue`); Phase 1a plays only the breaker clack:
 * a machine's breaker closing and a feeder closed by RESTORE. The rest of K-20 is Phase 1b.
 */
export function cueOfRecord(r) {
  if (r.kind === 'breaker' && r.closed) return 'breaker';
  if (r.kind === 'restore') return 'breaker';
  return '';
}
