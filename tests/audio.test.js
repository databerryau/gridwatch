// K-19 hum, K-20 breaker clack, C-8 optional audio: audio/model.js (pure) and audio/audio.js
// against a counting stand-in AudioContext.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../audio/model.js';
import {createAudio} from '../audio/audio.js';

test('K-19: hum partials at k x 2f against a k x 100 Hz reference; beats at 2k|Δf| within 2%; -30 dBFS', () => {
  for (const f of [50, 49.75, 49.5, 49.123, 50.2, 51]) {
    const parts = M.humPartials(f);
    assert.deepEqual(parts.map(p => p.k), [1, 2, 3, 4]);
    for (const p of parts) {
      assert.ok(Math.abs(p.hz - p.k * 2 * f) < 1e-9);
      assert.equal(p.refHz, p.k * 100);
      const want = 2 * p.k * Math.abs(f - 50), heard = Math.abs(p.hz - p.refHz);
      assert.ok(Math.abs(heard - want) <= 0.02 * want + 1e-9, 'k=' + p.k + ' at ' + f);
      assert.ok(Math.abs(M.beatRate(f, p.k) - want) <= 0.02 * want + 1e-9);
    }
  }
  // The example in K-19: at 49.75 Hz the 400 Hz partial wobbles twice a second.
  assert.ok(Math.abs(M.humPartials(49.75)[1].beatHz - 1) < 1e-9);
  assert.ok(Math.abs(M.humPartials(49.75)[3].beatHz - 2) < 1e-9, '400 Hz partial (k = 4 at 2f = 99.5 Hz) beats at 2 Hz');
  const total = M.humPartials(50).reduce((a, p) => a + p.gain, 0);
  assert.ok(Math.abs(20 * Math.log10(total) - M.HUM_DBFS) < 1e-9, 'the hum sums to -30 dBFS');
  assert.ok(M.humPartials(50).every(p => p.refGain < p.gain), 'the reference is quieter');
  assert.equal(M.humPartials(NaN)[0].hz, 100, 'a bad frequency hums at nominal');
});

test('K-20: the breaker clack decays to -60 dB over 120 ms with partials near 0.9, 1.4, 2.2 kHz; records that ask for it', () => {
  assert.equal(M.clackEnvelope(0), 1);
  assert.ok(Math.abs(20 * Math.log10(M.clackEnvelope(M.CLACK.decayS)) + 60) < 1e-6);
  assert.equal(M.clackEnvelope(-1), 0);
  assert.deepEqual([...M.CLACK.partialsHz], [900, 1400, 2200]);
  assert.equal(M.CLACK.decayS, 0.12);
  assert.equal(M.cueOfRecord({kind: 'breaker', unit: 'gta1', closed: true, why: 'sync'}), 'breaker');
  assert.equal(M.cueOfRecord({kind: 'breaker', unit: 'gta1', closed: false, why: 'trip'}), '');
  assert.equal(M.cueOfRecord({kind: 'restore', district: 'RED1', mw: 200}), 'breaker', 'a feeder closing');
  assert.equal(M.cueOfRecord({kind: 'ufls'}), '', 'UFLS clacks are Phase 1b foley');
});

// ------------------------------------------------------------------ a stand-in WebAudio

function fakeWin() {
  const stats = {created: 0, started: 0, ctx: 0};
  const param = v => ({value: v, setTargetAtTime(x) { this.value = x; }, setValueAtTime(x) { this.value = x; }});
  class Node {
    constructor(kind) { this.kind = kind; stats.created++; this.outs = []; }
    connect(n) { this.outs.push(n); return n; }
    disconnect() {}
  }
  class Osc extends Node {
    constructor() { super('osc'); this.frequency = param(440); this.type = 'sine'; this.onended = null; }
    start() { stats.started++; }
    stop() {}
  }
  class Ctx {
    constructor() { stats.ctx++; this.currentTime = 0; this.sampleRate = 8000; this.destination = new Node('dest'); this.oscs = []; }
    createGain() { const n = new Node('gain'); n.gain = param(1); return n; }
    createOscillator() { const o = new Osc(); this.oscs.push(o); return o; }
    createBiquadFilter() { const n = new Node('biquad'); n.frequency = param(350); n.Q = param(1); n.type = 'lowpass'; return n; }
    createBuffer(ch, len, sr) { return {length: len, sampleRate: sr, data: new Float32Array(len), getChannelData() { return this.data; }}; }
    createBufferSource() { const n = new Osc(); n.kind = 'buffer'; return n; }
    resume() { return Promise.resolve(); }
  }
  return {win: {AudioContext: Ctx}, stats};
}

test('C-8: no WebAudio means silence, never an error; the context is made on the first gesture only', () => {
  const none = createAudio({});
  assert.equal(none.ok, false);
  assert.equal(none.start(), false);
  none.update({needleHz: 49.9, cues: ['breaker', 'horn']});
  assert.equal(none.cue('breaker'), false);
  const throwing = createAudio({AudioContext: class { constructor() { throw new Error('NotAllowedError'); } }});
  assert.equal(throwing.start(), false);
  assert.equal(throwing.ok, false);
  const {win, stats} = fakeWin();
  const au = createAudio(win);
  assert.equal(stats.ctx, 0, 'nothing before a gesture');
  au.update({needleHz: 50});
  assert.equal(stats.ctx, 0);
  assert.equal(au.start(), true);
  assert.equal(au.start(), true);
  assert.equal(stats.ctx, 1, 'one context');
});

test('K-19 / K-20: the hum follows the needle (beats within 2%); cues play; never more than 32 nodes live', () => {
  const {win} = fakeWin();
  const au = createAudio(win);
  au.start();
  assert.equal(au.liveNodes(), M.HUM_NODES);
  au.update({needleHz: 49.75, settings: {volume: 0.5, muted: false}});
  const oscs = au.hum.osc, refs = au.hum.ref;
  for (let i = 0; i < 4; i++) {
    const k = i + 1, beat = Math.abs(oscs[i].frequency.value - refs[i].frequency.value);
    assert.ok(Math.abs(beat - 2 * k * 0.25) <= 0.02 * 2 * k * 0.25, 'k=' + k + ' beat ' + beat);
  }
  assert.equal(au.master.gain.value, 0.5);
  au.update({needleHz: 49.75, settings: {volume: 0.5, muted: true}});
  assert.equal(au.master.gain.value, 0, 'mute');
  // A storm of cues never passes the node budget (ended callbacks never fire in the stand-in).
  for (let i = 0; i < 50; i++) au.update({needleHz: 50, cues: ['breaker', 'horn', 'chime', 'ring2', 'tick']});
  assert.ok(au.peak <= M.MAX_NODES, 'peak ' + au.peak);
  assert.ok(au.dropped > 0, 'cues past the budget are dropped');
  assert.ok(au.played.includes('breaker'));
  // Freed nodes come back when sources end.
  const {win: w2} = fakeWin();
  const b = createAudio(w2);
  b.start();
  b.cue('breaker');
  assert.equal(b.liveNodes(), M.HUM_NODES + 9);
  const ended = b.ctx.oscs.filter(o => typeof o.onended === 'function');
  for (const o of ended) o.onended();
  assert.equal(b.liveNodes(), M.HUM_NODES);
});
