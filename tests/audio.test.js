// K-19 hum, K-20 foley, K-21 tones, K-22 buses, C-8 optional audio: audio/model.js (pure) and
// audio/audio.js against a counting stand-in AudioContext (desk/README §13.2, §14.1).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../audio/model.js';
import {createAudio} from '../audio/audio.js';
import {SUBURBS} from '../render/mapdata.js';

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
  // The 1a single-cue mapping stays until stage C moves the game to cuesOfRecord.
  assert.equal(M.cueOfRecord({kind: 'breaker', unit: 'gta1', closed: true, why: 'sync'}), 'breaker');
  assert.equal(M.cueOfRecord({kind: 'breaker', unit: 'gta1', closed: false, why: 'trip'}), '');
  assert.equal(M.cueOfRecord({kind: 'restore', district: 'RED1', mw: 200}), 'breaker', 'a feeder closing');
  assert.equal(M.cueOfRecord({kind: 'ufls'}), '', 'UFLS clacks come from cuesOfRecord');
});

// ------------------------------------------------------------------ the cue table (pure)

const TABLE = {detent: 'fx', ratchet: 'fx', gate: 'fx', key: 'fx', cover: 'fx', button: 'fx', servo: 'fx', breaker: 'fx',
  clack: 'fx', growl: 'fx', buzz: 'fx', spoolUp: 'fx', spoolDown: 'fx', horn: 'alarms', chime: 'alarms', ring2: 'alarms', tick: 'alarms'};

test('§13.2: every cue name has a spec, a bus, a node count and a length; unknown names have none', () => {
  assert.deepEqual([...M.CUE_NAMES].sort(), Object.keys(TABLE).sort());
  for (const [name, bus] of Object.entries(TABLE)) {
    assert.equal(M.busOf(name), bus, name);
    const spec = M.specOf(name);
    assert.ok(spec && (spec.kind === 'voice' || spec.kind === 'tone'), name);
    const n = M.nodesFor(name);
    assert.ok(n >= 2 && n <= 4, name + ' nodes ' + n);
    assert.equal(M.nodesFor(name, true), n + 1, 'a panner is one more node');
    assert.ok(M.durationOf(name) > 0 && M.durationOf(name) <= 3, name + ' lasts ' + M.durationOf(name));
  }
  for (const bad of ['', 'nope', 'warn', 'toString', 'constructor', '__proto__']) {
    assert.equal(M.busOf(bad), '', bad);
    assert.equal(M.specOf(bad), null);
    assert.equal(M.nodesFor(bad), 0);
    assert.equal(M.durationOf(bad), 0);
  }
  // K-20's numbers: growl 1.5 s, spools <= 3 s, a clack is over before the next one (90 ms).
  assert.equal(M.durationOf('growl'), 1.5);
  assert.ok(M.durationOf('spoolUp') <= 3 && M.durationOf('spoolDown') <= 3);
  assert.ok(M.durationOf('clack') < M.CLACK_STAGGER_S);
  assert.equal(M.CLACK_STAGGER_S, 0.09);
  assert.equal(M.VOICES.detent.layers[0].hz, 80, 'the 80 Hz detent thump');
  const growlHz = M.VOICES.growl.layers.flatMap(l => l.hz);
  assert.ok(Math.min(...growlHz) >= 60 && Math.max(...growlHz) <= 90, 'growl stays in 60-90 Hz');
  assert.equal(M.BASE_NODES, M.HUM_NODES + M.BUS_NODES);
  assert.equal(M.BASE_NODES, 13, '8 hum oscillators, their 2 gains (the hum bus), fx, alarms, master');
});

test('K-20: every voice renders to a finite, non-silent buffer within -1..1 that ends at zero', () => {
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [name, spec] of Object.entries(M.VOICES)) {
    const sr = 8000, d = M.renderVoice(spec, sr, rnd);
    assert.equal(d.length, Math.floor(spec.durS * sr), name);
    let peak = 0;
    for (const v of d) { assert.ok(Number.isFinite(v), name); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.05 && peak <= 1, name + ' peak ' + peak);
    assert.ok(d[d.length - 1] === 0, name + ' ends at zero (no click)');
  }
  // The breaker still decays like K-20 says: the last 10 ms are far below the first 10 ms.
  const b = M.renderVoice(M.VOICES.breaker, 48000, rnd);
  const rms = (a, z) => Math.sqrt(b.slice(a, z).reduce((s, v) => s + v * v, 0) / (z - a));
  assert.ok(rms(b.length - 480, b.length) < 0.02 * rms(0, 480));
  assert.deepEqual(M.VOICES.breaker.layers.filter(l => l.type === 'sine').map(l => l.hz), [900, 1400, 2200, 70]);
});

test('K-20: rate limits as a pure function of timestamps: ratchet <= 20 per second, servo <= 1 per 0.25 s', () => {
  const run = (name, stepS, totalS) => {
    const at = [];
    let last;
    for (let i = 0; i * stepS < totalS; i++) {
      const t = i * stepS;
      if (M.rateAllows(name, t, last)) { at.push(t); last = t; }
    }
    return at;
  };
  const most = (at, win) => Math.max(...at.map(t => at.filter(u => u >= t && u < t + win - 1e-9).length));
  for (const step of [0.001, 0.007, 1 / 60, 0.05]) {
    const r = run('ratchet', step, 3);
    assert.ok(most(r, 1) <= 20, 'ratchet at ' + step + ': ' + most(r, 1));
    assert.ok(r.length >= 40, 'and it still ticks: ' + r.length);
    assert.ok(most(run('servo', step, 3), 0.25) <= 1);
  }
  assert.equal(run('ratchet', 0.05, 1).length, 20, 'twenty ticks 50 ms apart all pass');
  assert.equal(run('servo', 0.01, 1).length, 4);
  assert.equal(M.rateAllows('ratchet', 5, undefined), true, 'never sounded');
  assert.equal(M.rateAllows('ratchet', 5.01, 5), false);
  assert.equal(M.rateAllows('ratchet', 0, 5), true, 'a clock that restarted does not mute it');
  assert.equal(M.rateAllows('clack', 5, 5), true, 'no limit on other cues');
});

test('§13.2: pan = (x / 640) x 2 - 1 from the suburb box centre; cues normalise', () => {
  assert.equal(M.panOfX(0), -1);
  assert.equal(M.panOfX(320), 0);
  assert.equal(M.panOfX(640), 1);
  assert.equal(M.panOfX(9999), 1);
  // Suburbs pan across the city's own width (stage C), west -CITY_PAN to east +CITY_PAN.
  const pans = SUBURBS.map(sb => M.panOfSuburb(sb.id));
  assert.ok(Math.abs(Math.min(...pans) + M.CITY_PAN) < 1e-12 && Math.abs(Math.max(...pans) - M.CITY_PAN) < 1e-12);
  assert.ok(M.panOfSuburb('HAZ') < M.panOfSuburb('HAR') && M.panOfSuburb('HAR') < M.panOfSuburb('TAL'), 'west to east');
  assert.ok(M.panOfSuburb('SOL') < 0 && M.panOfSuburb('SAL') > 0);
  assert.equal(M.panOfSuburb('XXX'), 0);
  assert.equal(M.panOfSuburb(undefined), 0);
  assert.deepEqual(M.normCue('horn'), {name: 'horn', pan: 0, gain: 1, delayS: 0});
  assert.deepEqual(M.normCue({name: 'clack', pan: -3, gain: 7, delayS: -1}), {name: 'clack', pan: -1, gain: 1, delayS: 0});
  assert.deepEqual(M.normCue({name: 'clack', pan: 0.25, gain: 0.5, delayS: 0.09}), {name: 'clack', pan: 0.25, gain: 0.5, delayS: 0.09});
  for (const bad of [null, undefined, '', 7, {}, {name: 3}, {pan: 1}]) assert.equal(M.normCue(bad), null);
});

test('K-22: bus gains from vm.settings; the 1a shape and junk are tolerated', () => {
  assert.deepEqual(M.busGains({volume: 0.5, hum: 0.4, fx: 0.3, alarms: 0.2, muted: false, reducedEffects: false}),
    {master: 0.5, hum: 0.4, fx: 0.3, alarms: 0.2});
  assert.deepEqual(M.busGains({volume: 0.5, muted: false}), {master: 0.5, hum: 1, fx: 1, alarms: 1}, 'the 1a shape');
  assert.equal(M.busGains({volume: 0.5, muted: true}).master, 0, 'mute silences the master');
  assert.equal(M.busGains({reducedEffects: true}).hum, 0, 'reduced effects: no hum');
  assert.equal(M.busGains({hum: 0}).hum, 0);
  assert.equal(M.busGains({reducedEffects: true}).fx, 1, 'and nothing else');
  assert.deepEqual(M.busGains(undefined), {master: 0.8, hum: 1, fx: 1, alarms: 1});
  assert.deepEqual(M.busGains({volume: 'loud', hum: -1, fx: 2, alarms: NaN}), {master: 0.8, hum: 1, fx: 1, alarms: 1});
});

test('§13.2: cuesOfRecord maps each record kind; a ufls record clacks once per district, panned, 90 ms apart', () => {
  const ctx = {suburbOf: id => ({d1: 'HAZ', d2: 'SAL', d3: 'RED'})[id]};
  assert.deepEqual(M.cuesOfRecord({kind: 'breaker', unit: 'gta1', closed: true, why: 'sync'}, ctx), ['breaker']);
  assert.deepEqual(M.cuesOfRecord({kind: 'breaker', unit: 'tie', closed: true, why: 'sync'}, ctx), ['breaker']);
  assert.deepEqual(M.cuesOfRecord({kind: 'breaker', unit: 'gta1', closed: false, why: 'stop'}, ctx), ['spoolDown']);
  assert.deepEqual(M.cuesOfRecord({kind: 'breaker', unit: 'coal2', closed: false, why: 'trip'}, ctx), ['spoolDown']);
  assert.deepEqual(M.cuesOfRecord({kind: 'breaker', unit: 'tie', closed: false, why: 'trip'}, ctx), [], 'the tie has no machine');
  assert.deepEqual(M.cuesOfRecord({kind: 'restore', district: 'd2', mw: 200}, ctx), [{name: 'breaker', pan: M.panOfSuburb('SAL')}]);
  assert.deepEqual(M.cuesOfRecord({kind: 'shed', district: 'd1', why: 'directed', mw: 90}, ctx), [{name: 'clack', pan: M.panOfSuburb('HAZ')}]);
  const u = M.cuesOfRecord({kind: 'ufls', stage: 1, districts: ['d1', 'd2', 'd3'], mw: 300, cue: 'clack'}, ctx);
  assert.equal(u.length, 3);
  assert.deepEqual(u.map(c => c.name), ['clack', 'clack', 'clack']);
  assert.deepEqual(u.map(c => c.pan), ['HAZ', 'SAL', 'RED'].map(M.panOfSuburb));
  u.forEach((c, i) => assert.ok(Math.abs(c.delayS - i * 0.09) < 1e-12));
  for (const result of ['rough', 'reverse', 'bypass']) assert.deepEqual(M.cuesOfRecord({kind: 'sync', unit: 'gta1', result, cue: 'growl'}, ctx), ['growl']);
  assert.deepEqual(M.cuesOfRecord({kind: 'sync', unit: 'gta1', result: 'clean', cue: 'breaker'}, ctx), [], 'the breaker record already clacked');
  assert.deepEqual(M.cuesOfRecord({kind: 'sync', unit: 'gta1', result: 'auto'}, ctx), []);
  assert.deepEqual(M.cuesOfRecord({kind: 'input', ok: false, type: 'syncClose', reason: 'blocked by sync-check relay', cue: 'buzz'}, ctx), ['buzz']);
  assert.deepEqual(M.cuesOfRecord({kind: 'input', ok: false, type: 'start', reason: 'min down'}, ctx), []);
  // Alarms and the tray own their sounds; logs, news and the day's end are silent here.
  for (const r of [{kind: 'contingency', cue: 'horn'}, {kind: 'log', sev: 'crit', code: 'UNIT_TRIP', cue: 'horn'},
    {kind: 'announce', cue: 'warn'}, {kind: 'ofgs', stage: 1}, {kind: 'black'}, {kind: 'dayEnd'}, {kind: 'future'}, {}, null]) {
    assert.deepEqual(M.cuesOfRecord(r, ctx), []);
  }
  // Without a ctx (or with one that throws or knows nothing) the id's prefix is the suburb.
  assert.deepEqual(M.cuesOfRecord({kind: 'shed', district: 'RED3'}), [{name: 'clack', pan: M.panOfSuburb('RED')}]);
  assert.deepEqual(M.cuesOfRecord({kind: 'shed', district: 'RED3'}, {suburbOf() { throw new Error('x'); }}), [{name: 'clack', pan: M.panOfSuburb('RED')}]);
  assert.deepEqual(M.cuesOfRecord({kind: 'ufls', districts: ['zz9']}, {suburbOf: () => undefined}), [{name: 'clack', pan: 0, delayS: 0}]);
  // Every cue it returns is one audio/ plays.
  for (const c of u) assert.ok(M.busOf(c.name));
  // spoolUp: no record marks a start, so it comes from the accepted input or the mode change.
  assert.deepEqual(M.cuesOfInput({type: 'start', unit: 'gta1'}), ['spoolUp']);
  assert.deepEqual(M.cuesOfInput({tick: 9, type: 'start', args: {unit: 'gta1'}}), ['spoolUp'], 'a state.log entry');
  assert.deepEqual(M.cuesOfInput({type: 'stop', unit: 'gta1'}), []);
  assert.deepEqual(M.cuesOfInput(null), []);
  assert.equal(M.cueOfModeChange('off', 'starting'), 'spoolUp');
  assert.equal(M.cueOfModeChange('tripped', 'starting'), 'spoolUp');
  assert.equal(M.cueOfModeChange('starting', 'starting'), '');
  assert.equal(M.cueOfModeChange(undefined, 'starting'), '', 'the first observation is not a change');
  assert.equal(M.cueOfModeChange('on', 'unloading'), '', 'stops come from the breaker record');
});

// ------------------------------------------------------------------ a stand-in WebAudio

/** opts.pan === false: a context without createStereoPanner. */
function fakeWin(opts = {}) {
  const stats = {created: 0, started: 0, ctx: 0, kinds: {}};
  const param = v => ({value: v, setTargetAtTime(x) { this.value = x; }, setValueAtTime(x) { this.value = x; }});
  class Node {
    constructor(kind) { this.kind = kind; stats.created++; stats.kinds[kind] = (stats.kinds[kind] || 0) + 1; this.outs = []; }
    connect(n) { this.outs.push(n); return n; }
    disconnect() {}
  }
  class Osc extends Node {
    constructor(kind = 'osc') { super(kind); this.frequency = param(440); this.type = 'sine'; this.onended = null; this.startAt = null; }
    start(t) { stats.started++; this.startAt = t === undefined ? 0 : t; }
    stop() {}
  }
  class Ctx {
    constructor() {
      stats.ctx++; this.currentTime = 0; this.sampleRate = 8000;
      this.destination = {kind: 'dest', outs: []};   // not a node the game makes: not counted
      this.oscs = []; this.sources = []; this.panners = []; this.gains = [];
      if (opts.pan !== false) this.createStereoPanner = () => { const n = new Node('panner'); n.pan = param(0); this.panners.push(n); return n; };
    }
    createGain() { const n = new Node('gain'); n.gain = param(1); this.gains.push(n); return n; }
    createOscillator() { const o = new Osc(); this.oscs.push(o); return o; }
    createBiquadFilter() { const n = new Node('biquad'); n.frequency = param(350); n.Q = param(1); n.type = 'lowpass'; return n; }
    createBuffer(ch, len, sr) { return {length: len, sampleRate: sr, data: new Float32Array(len), getChannelData() { return this.data; }}; }
    createBufferSource() { const n = new Osc('buffer'); this.sources.push(n); return n; }
    resume() { return Promise.resolve(); }
  }
  return {win: {AudioContext: Ctx}, stats};
}

/** Does a node's output end up at target (following first connections)? */
const reaches = (node, target) => {
  for (let n = node, i = 0; n && i < 8; n = n.outs[0], i++) if (n === target) return true;
  return false;
};

test('C-8: no WebAudio means silence, never an error; the context is made on the first gesture only', () => {
  const none = createAudio({});
  assert.equal(none.ok, false);
  assert.equal(none.start(), false);
  none.update({needleHz: 49.9, cues: ['breaker', 'horn', {name: 'clack', pan: 1, delayS: 0.09}], settings: {volume: 1, hum: 1, fx: 1, alarms: 1, muted: false}});
  assert.equal(none.cue('breaker'), false);
  none.setSettings({volume: 0.2}); none.setVolume(0.3); none.setMuted(true);
  assert.equal(none.liveNodes(), 0);
  for (const w of [undefined, null]) {
    const a = createAudio(w);
    assert.equal(a.start(), false);
    a.update({cues: ['horn']});
  }
  const throwing = createAudio({AudioContext: class { constructor() { throw new Error('NotAllowedError'); } }});
  assert.equal(throwing.start(), false);
  assert.equal(throwing.ok, false);
  throwing.update({needleHz: 50, cues: ['horn']});
  assert.equal(throwing.cue('horn'), false);
  // A context that starts and then throws from everything: cues fail quietly, the frame goes on.
  const {win: w3} = fakeWin();
  const c = createAudio(w3);
  c.start();
  c.ctx.createGain = () => { throw new Error('InvalidStateError'); };
  c.ctx.createBufferSource = () => { throw new Error('InvalidStateError'); };
  assert.equal(c.cue('breaker'), false);
  assert.equal(c.cue({name: 'clack', pan: 0.5}), false);
  c.update({needleHz: 49.9, cues: ['horn', 'detent'], settings: {volume: 0.5}});
  assert.equal(c.liveNodes(), M.BASE_NODES, 'a failed cue holds no nodes');
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
  const {win, stats} = fakeWin();
  const au = createAudio(win);
  au.start();
  assert.equal(au.liveNodes(), M.BASE_NODES);
  assert.equal(stats.created, M.BASE_NODES, 'honest accounting: every node made at start is counted');
  au.update({needleHz: 49.75, settings: {volume: 0.5, muted: false}});
  const oscs = au.hum.osc, refs = au.hum.ref;
  for (let i = 0; i < 4; i++) {
    const k = i + 1, beat = Math.abs(oscs[i].frequency.value - refs[i].frequency.value);
    assert.ok(Math.abs(beat - 2 * k * 0.25) <= 0.02 * 2 * k * 0.25, 'k=' + k + ' beat ' + beat);
  }
  assert.equal(au.master.gain.value, 0.5);
  au.update({needleHz: 49.75, settings: {volume: 0.5, muted: true}});
  assert.equal(au.master.gain.value, 0, 'mute');
  // A storm of cues never passes the node budget (ended callbacks never fire in the stand-in
  // and its clock stands still, so nothing is ever freed).
  for (let i = 0; i < 50; i++) au.update({needleHz: 50, cues: ['breaker', 'horn', 'chime', 'ring2', 'tick', 'growl', {name: 'clack', pan: 0.4}]});
  assert.ok(au.peak <= M.MAX_NODES, 'peak ' + au.peak);
  assert.equal(stats.created, au.liveNodes(), 'the count is the nodes that exist');
  assert.ok(au.dropped > 0, 'cues past the budget are dropped');
  assert.ok(au.played.includes('breaker'));
  // Freed nodes come back when sources end.
  const {win: w2} = fakeWin();
  const b = createAudio(w2);
  b.start();
  b.cue('breaker');
  assert.equal(b.liveNodes(), M.BASE_NODES + M.nodesFor('breaker'));
  b.cue('horn');
  assert.equal(b.liveNodes(), M.BASE_NODES + M.nodesFor('breaker') + M.nodesFor('horn'));
  const ended = [...b.ctx.oscs, ...b.ctx.sources].filter(o => typeof o.onended === 'function');
  assert.equal(ended.length, 2, 'one ending source per cue');
  for (const o of ended) { o.onended(); o.onended(); }
  assert.equal(b.liveNodes(), M.BASE_NODES, 'and only once each');
  // ...or, when no ended event comes, once their time has passed.
  b.cue('breaker');
  b.ctx.currentTime = 10;
  b.update({needleHz: 50});
  assert.equal(b.liveNodes(), M.BASE_NODES);
  assert.equal(b.voices.length, 0);
});

test('§13.2: every cue plays on its bus with the node count the model states; unknown cues are ignored and counted', () => {
  for (const name of M.CUE_NAMES) {
    for (const pan of [0, 0.5]) {
      const {win, stats} = fakeWin();
      const au = createAudio(win);
      au.start();
      const before = stats.created;
      assert.equal(au.cue(pan ? {name, pan} : name), true, name);
      assert.equal(stats.created - before, M.nodesFor(name, !!pan), name + ' makes what it says');
      assert.equal(au.liveNodes(), M.BASE_NODES + M.nodesFor(name, !!pan));
      const g = au.ctx.gains[au.ctx.gains.length - 1], bus = au.bus[M.busOf(name)];
      assert.ok(reaches(g, bus), name + ' -> ' + M.busOf(name));
      assert.ok(reaches(bus, au.master) && reaches(au.master, au.ctx.destination));
      assert.equal(au.ctx.panners.length, pan ? 1 : 0);
      if (pan) assert.equal(au.ctx.panners[0].pan.value, 0.5);
    }
  }
  const {win} = fakeWin();
  const au = createAudio(win);
  au.start();
  for (const bad of ['nope', 'warn', '', null, undefined, 7, {}, {name: 'nope', pan: 1}, 'constructor']) assert.equal(au.cue(bad), false);
  au.update({needleHz: 50, cues: ['nope', {name: 'zzz'}, 'tick']});
  assert.equal(au.unknown, 11);
  assert.equal(au.dropped, 0, 'unknown is not dropped');
  assert.deepEqual(au.played, ['tick']);
  assert.equal(au.liveNodes(), M.BASE_NODES + M.nodesFor('tick'));
  // The cue's gain scales its level; a voice's buffer is rendered once.
  au.cue({name: 'detent', gain: 0.5});
  assert.ok(Math.abs(au.ctx.gains[au.ctx.gains.length - 1].gain.value - M.VOICES.detent.level * 0.5) < 1e-12);
  const buf = au.buffers.detent;
  assert.ok(buf.data.some(v => v !== 0), 'the buffer holds the rendered voice');
  au.cue('detent');
  assert.equal(au.buffers.detent, buf);
  // No StereoPannerNode: the cue plays in the centre, with no panner counted.
  const {win: w2, stats: s2} = fakeWin({pan: false});
  const c = createAudio(w2);
  c.start();
  assert.equal(c.cue({name: 'clack', pan: -0.7}), true);
  assert.equal(c.liveNodes(), M.BASE_NODES + M.nodesFor('clack'));
  assert.equal(s2.kinds.panner, undefined);
});

test('K-22: volumes, mute and reduced effects reach the right gains', () => {
  const {win} = fakeWin();
  const au = createAudio(win);
  au.start();
  const h = au.hum;
  assert.equal(au.master.gain.value, 0.8, 'defaults before any settings');
  assert.equal(au.bus.fx.gain.value, 1);
  assert.equal(au.bus.alarms.gain.value, 1);
  assert.equal(h.humGain.gain.value, h.level);
  assert.equal(h.refGain.gain.value, h.refLevel);
  assert.ok(Math.abs(20 * Math.log10(h.level * 4) - M.HUM_DBFS) < 1e-9, 'four partials at -30 dBFS together');
  au.update({needleHz: 50, settings: {volume: 0.6, hum: 0.5, fx: 0.25, alarms: 0.75, muted: false, reducedMotion: true, reducedEffects: false, crt: true}});
  assert.equal(au.master.gain.value, 0.6);
  assert.equal(au.bus.fx.gain.value, 0.25);
  assert.equal(au.bus.alarms.gain.value, 0.75);
  assert.equal(h.humGain.gain.value, h.level * 0.5);
  assert.equal(h.refGain.gain.value, h.refLevel * 0.5);
  au.update({needleHz: 50, settings: {volume: 0.6, hum: 0.5, fx: 0.25, alarms: 0.75, muted: false, reducedEffects: true}});
  assert.equal(h.humGain.gain.value, 0, 'reduced effects: no hum');
  assert.equal(h.refGain.gain.value, 0, 'nor its reference');
  assert.equal(au.bus.fx.gain.value, 0.25, 'the other buses stay');
  au.update({needleHz: 50, settings: {volume: 0.6, hum: 0, fx: 0.25, alarms: 0.75, muted: false, reducedEffects: false}});
  assert.equal(h.humGain.gain.value, 0, 'hum slider at 0');
  au.update({needleHz: 50, settings: {volume: 0.6, hum: 1, fx: 0, alarms: 0.75, muted: true, reducedEffects: false}});
  assert.equal(au.master.gain.value, 0, 'mute silences the master');
  assert.equal(au.bus.fx.gain.value, 0);
  assert.equal(h.humGain.gain.value, h.level, 'the buses keep their own levels under mute');
  // The 1a shape leaves the other buses where they were; the 1a setters still work.
  au.update({needleHz: 50, settings: {volume: 0.3, muted: false}});
  assert.equal(au.master.gain.value, 0.3);
  assert.equal(au.bus.alarms.gain.value, 0.75);
  au.setVolume(0.9); assert.equal(au.master.gain.value, 0.9);
  au.setVolume(7); assert.equal(au.master.gain.value, 0.9, 'a bad volume is ignored');
  au.setMuted(true); assert.equal(au.master.gain.value, 0);
  au.setMuted(false); assert.equal(au.master.gain.value, 0.9);
  // The day over: the hum stops (1a), and comes back with the next day.
  au.update({needleHz: 50, obs: {f: {hz: 50}, over: true}});
  assert.equal(h.humGain.gain.value, 0);
  au.update({needleHz: 50, obs: {f: {hz: 50}, over: false}});
  assert.equal(h.humGain.gain.value, h.level);
  // Settings given before the first gesture apply when the context starts.
  const {win: w2} = fakeWin();
  const b = createAudio(w2);
  b.update({settings: {volume: 0.4, hum: 1, fx: 0.5, alarms: 1, muted: true}});
  b.setSettings({volume: 0.4, hum: 1, fx: 0.5, alarms: 1, muted: true});
  b.start();
  assert.equal(b.master.gain.value, 0);
  assert.equal(b.bus.fx.gain.value, 0.5);
});

test('K-20: ratchet and servo are rate-limited on the real clock; delayed cues wait without holding nodes', () => {
  const {win} = fakeWin();
  const au = createAudio(win);
  au.start();
  let ratchets = 0, servos = 0;
  for (let i = 0; i < 1000; i++) {            // one real second of pointermoves, 1 ms apart
    au.ctx.currentTime = i / 1000;
    if (au.cue('ratchet')) ratchets++;
    if (au.cue('servo')) servos++;
    au.update({needleHz: 50});
  }
  assert.ok(ratchets <= 20 && ratchets >= 18, 'ratchets in 1 s: ' + ratchets);
  assert.equal(servos, 4);
  assert.equal(au.limited, 2000 - ratchets - servos);
  assert.equal(au.dropped, 0, 'rate-limited is not over-budget');
  assert.ok(au.peak <= M.BASE_NODES + 2 * M.nodesFor('ratchet') + M.nodesFor('servo'), 'peak ' + au.peak);
  // A staggered shed: three clacks 90 ms apart, each started at its own time.
  const {win: w2} = fakeWin();
  const b = createAudio(w2);
  b.start();
  const cues = M.cuesOfRecord({kind: 'ufls', stage: 1, districts: ['HAZ1', 'RED2', 'SAL3']});
  b.update({needleHz: 50, cues});
  assert.equal(b.ctx.sources.length, 1, 'only the first has sounded');
  assert.equal(b.pending.length, 2);
  assert.equal(b.liveNodes(), M.BASE_NODES + M.nodesFor('clack', true), 'the waiting ones hold nothing');
  for (let f = 1; f <= 30; f++) { b.ctx.currentTime = f / 60; b.update({needleHz: 50}); }
  assert.equal(b.pending.length, 0);
  assert.deepEqual(b.ctx.sources.map(s => Math.round(s.startAt * 1000)), [0, 90, 180]);
  assert.deepEqual(b.ctx.panners.map(p => p.pan.value), ['HAZ', 'RED', 'SAL'].map(M.panOfSuburb));
  assert.equal(b.liveNodes(), M.BASE_NODES, 'all three have ended');
  // A frame loop that stalled (a hidden tab) drops what is long overdue instead of a late burst.
  b.update({needleHz: 50, cues: [{name: 'clack', delayS: 0.09}]});
  b.ctx.currentTime += 5;
  b.update({needleHz: 50});
  assert.equal(b.ctx.sources.length, 3);
  assert.equal(b.dropped, 1);
});

test('K-20 accept: 8 UFLS stages (16 clacks in 1.5 s), a horn, a breaker and ten ratchets stay within 32 live nodes', () => {
  const district = (s, i) => ['HAZ', 'HAR', 'TAL', 'SOL', 'RED', 'SAL'][(s * 2 + i) % 6] + (s + 1);
  const ctx = {suburbOf: id => id.slice(0, 3)};
  for (const ended of [false, true]) {          // without and with `ended` events
    const {win, stats} = fakeWin();
    const au = createAudio(win);
    au.start();
    let made = 0;
    for (let f = 0; f <= 120; f++) {             // 2 real seconds of frames
      const t = f / 60;
      au.ctx.currentTime = t;
      if (ended) for (const s of [...au.ctx.sources, ...au.ctx.oscs]) if (s.onended && s.startAt !== null && t > s.startAt + 0.7) { s.onended(); s.onended = null; }
      const cues = [];
      for (let s = 0; s < 8; s++) {
        if (f === Math.round(s * 0.18 * 60)) cues.push(...M.cuesOfRecord({kind: 'ufls', stage: s + 1, districts: [district(s, 0), district(s, 1)], mw: 100, cue: 'clack'}, ctx));
      }
      if (f === 0) cues.push('horn', ...M.cuesOfRecord({kind: 'breaker', unit: 'coal1', closed: false, why: 'trip'}, ctx));
      if (f === 2) cues.push('breaker');
      if (f >= 10 && f < 20) cues.push('ratchet');   // ten ratchets, a frame apart
      made += cues.length;
      au.update({needleHz: 49.2, cues});
      assert.ok(au.liveNodes() <= M.MAX_NODES, 'frame ' + f + ': ' + au.liveNodes());
    }
    assert.equal(made, 16 + 3 + 10);
    assert.ok(au.peak <= M.MAX_NODES, 'peak ' + au.peak);
    assert.equal(au.dropped, 0, 'nothing had to be dropped: peak ' + au.peak);
    assert.equal(au.ctx.sources.filter(s => s.kind === 'buffer').length - 2 - (10 - au.limited), 16, 'every district clacked');
    assert.equal(au.ctx.panners.length, 16, 'each one panned');
    assert.equal(stats.kinds.panner, 16);
    const r = 10 - au.limited;
    assert.ok(r >= 3 && r <= 4, 'ten ratchets in 1/6 s: ' + r + ' tick (<= 20/s)');
    assert.equal(au.pending.length, 0);
  }
  // The worst case: all eight stages in one frame. Still never over 32; the surplus is dropped.
  const {win} = fakeWin();
  const au = createAudio(win);
  au.start();
  const cues = ['horn', 'breaker'];
  for (let s = 0; s < 8; s++) cues.push(...M.cuesOfRecord({kind: 'ufls', stage: s + 1, districts: [district(s, 0), district(s, 1), district(s, 2)]}, ctx));
  for (let i = 0; i < 10; i++) cues.push('ratchet');
  for (let f = 0; f <= 60; f++) {
    au.ctx.currentTime = f / 60;
    au.update({needleHz: 48.8, cues: f === 0 ? cues : []});
    assert.ok(au.liveNodes() <= M.MAX_NODES, 'frame ' + f + ': ' + au.liveNodes());
  }
  assert.ok(au.peak <= M.MAX_NODES && au.peak > M.BASE_NODES + 12, 'peak ' + au.peak);
  assert.ok(au.dropped > 0, 'cues past the budget are dropped, and counted');
  assert.equal(au.ctx.panners.length + au.dropped, 24, 'every clack either sounded or was counted as dropped');
});
