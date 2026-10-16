// W6 (Y-6): SAVE IMAGE, THE MOMENT as a PNG to share (app/momentimage.js, render/charts.js plotMoment, app/endcard.js). Pure
// checks on moments app/verdict.js makes from hand-made memories, drawn on tests/lib/dom.js's recording canvas: every word
// on the picture (the trace's own labels too) passes the share card's lint, nothing is drawn under the trace but the minute
// bar, no NaN reaches the canvas, the catch stack's rows (the end card's words' numbers, in its order) and the file's name;
// a spoiler in the closing line is left off; a cut says whose it was; a low that is not the day's says so, with the day's.
// Then the end card: the button only in THE MOMENT and only with YOUR CARD, off while the fall with no GUARD computes, and
// a press saves a PNG with a toast as DOWNLOAD REPLAY LOG does. One sampled play: a real trip's moment, with a GUARD set,
// saved from the page once its fall with no GUARD is in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as MI from '../app/momentimage.js';
import * as VD from '../app/verdict.js';
import * as SH from '../app/share.js';
import {createEndCard, MOMENT_IMAGE_NOTE, MOMENT_IMAGE_WAIT, MOMENT_IMAGE_WAIT_NOTE} from '../app/endcard.js';
import {MINUTE_BAR} from '../render/charts.js';
import {mw} from '../render/format.js';
import {allIn} from '../app/score.js';
import {V} from '../sim/params.js';
import {makeDocument, installGlobals} from './lib/dom.js';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S, H = 3600, S = 16 * H;
const pm = () => ({lowHz: 49.8, highHz: 50.1, r5MW: 900});
const cont = (o = {}) => Object.assign({n: 1, startTick: S * TPS, cause: 'unit', id: 'ccgt1', lostMW: 620, extremeHz: 49.1, uflsStages: 0, backInBandTick: -1,
  caught: {inertiaMW: 300, batteryMW: 20, guardMW: 400, governorsMW: 150, loadReliefMW: 10, uflsMW: 0, inverterMW: 0}}, o);

// A memory with a fall at S (to 49.1 Hz, back by a minute), every second either side played but the last 30 (the day's end)
function memFall(rise = false) {
  const mem = VD.createVerdictMem();
  for (let t = S - VD.MOMENT_SPAN_S; t < S + VD.MOMENT_SPAN_S - 30; t++) {
    const d = t < S ? 0.01 : t < S + 5 ? 0.18 * (t - S) : Math.max(0.05, 0.9 - 0.015 * (t - S - 5));
    mem.fLo[t] = (rise ? 50 + d : 50 - d) - 0.01; mem.fHi[t] = (rise ? 50 + d : 50 - d) + 0.01;
  }
  return mem;
}
const tripMoment = (o = {}) => VD.moment(memFall(), [cont(o.cont)], {parMinute: pm, twin: {done: true, nadirHz: 48.9}, guardMW: 400});
// game.end as app/game.js makes it: the share card (shareFor's), the grade, the verdict's moment
function endOf(m, o = {}) {
  const s = Object.assign({ymd: 20261016, n: 5, seed: 20261016, grade: {points: 975, letter: 'A', star: false}, perfect: false, black: false, lowHz: 49.1,
    spark: [], endS: V.DAY_S, you: {outage: 0, supplyCents: 4, co2tPerMWh: 0.6}, par: null, tags: ['FIRST SHIFT'], closing: 'Nobody noticed. That\'s the job.'}, o.share);
  const share = Object.assign(SH.shareCard(s), {n: s.n, ymd: s.ymd, tags: s.tags, closing: s.closing});
  return Object.assign({seed: 20261016, black: false, perfect: false, lowHz: s.lowHz, grade: s.grade, share, verdict: {moment: m}}, o.end);
}
// A stand-in canvas whose context also keeps every fillText ({s, x, y}) and every call's name
function recording(doc) {
  const cv = doc.createElement('canvas'), ctx = cv.getContext('2d'), texts = [], calls = [];
  const rec = new Proxy(ctx, {
    get: (t, k) => { const v = t[k]; return typeof v !== 'function' ? v : (...a) => { calls.push(k); if (k === 'fillText') texts.push({s: String(a[0]), x: a[1], y: a[2]}); return v(...a); }; },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  cv.getContext = () => rec;
  return {cv, texts, calls};
}
function draw(end) {
  const doc = makeDocument(), r = recording(doc), t = MI.drawImage(r.cv, end);
  return Object.assign(r, {t, doc, words: r.texts.map(x => x.s)});
}
// what a picture must keep: the lint on every word, no NaN, the trace's time axis bare (only the minute bar under it)
function publicOk(d, what) {
  assert.deepEqual(d.doc.canvasStats.bad, [], what + ': no NaN or Infinity reached the canvas');
  for (const w of d.words) assert.deepEqual(SH.lintCard(w), [], what + ': "' + w + '"');
  const under = d.texts.filter(x => x.y > MI.PLOT.y1 && x.y < MI.IMAGE_H - 50 && x.x >= MI.PLOT.x0 - 40 && x.x <= MI.PLOT.x1).map(x => x.s);
  assert.deepEqual(under, [MINUTE_BAR], what + ': nothing labels the time axis but the minute bar');
}

test('Y-6: the picture of a trip: 1200×630, the day and score, the fall marked, NO GUARD and PAR, what caught it as the card says it; every word passes the share card\'s lint', () => {
  const d = draw(endOf(tripMoment()));
  assert.deepEqual([d.cv.width, d.cv.height], [1200, 630]);
  assert.ok(d.doc.canvasStats.calls > 300, 'drawn: ' + d.doc.canvasStats.calls + ' calls');
  publicOk(d, 'trip');
  assert.deepEqual(d.t.dropped, []);
  for (const w of ['GRIDWATCH #5', 'Fri 16 Oct · FIRST SHIFT', '975 A', 'THE MOMENT', 'LOWEST', '49.10 Hz', 'With no GUARD: 48.90 Hz', 'NO GUARD 48.90', 'PAR 49.80',
    'CAUGHT BY', 'spin 300 MW', 'YOUR GUARD 400 MW', 'droop response 20 MW', 'governors 150 MW', 'load relief 10 MW', '"Nobody noticed. That\'s the job."',
    SH.SHARE_URL]) assert.ok(d.words.includes(w), w + ' in ' + JSON.stringify(d.words));
  assert.equal(d.t.dayLow, '', 'the day\'s low is this one: not said twice');
  // the fall is marked (a dot) at its lowest second, below its start, with the card's figure
  const mark = d.texts.filter(x => x.s === '49.10 Hz').find(x => x.x < MI.PLOT.x1);
  assert.ok(mark && d.calls.includes('arc'), 'the lowest second marked');
  // the catch stack: the end card's numbers in its order, YOUR GUARD among them; under 5 MW is left out. The battery's own
  // droop is not "fast" anything: the GUARD is its fast frequency response (the glossary, the GUARD's help)
  assert.deepEqual(MI.catchRows(cont()).map(r => r.name), ['spin', 'YOUR GUARD', 'droop response', 'governors', 'load relief']);
  assert.deepEqual(MI.catchRows(cont({caught: {inertiaMW: 300, batteryMW: 4, uflsMW: 120}})).map(r => r.name + ' ' + r.mw), ['spin 300', 'homes cut off 120']);
  assert.deepEqual(MI.catchRows(null), []);
  for (const x of [cont(), cont({caught: {inertiaMW: 300, batteryMW: 90, guardMW: 200, governorsMW: 150, loadReliefMW: 10, uflsMW: 120, inverterMW: 40}}),
    cont({lostMW: -400, caught: {inertiaMW: -200, batteryMW: -40, governorsMW: -120, inverterMW: -60}})]) {
    assert.deepEqual(MI.catchRows(x).map(r => mw(r.mw)), VD.caughtText(x).split(', ').map(p => / ([\d,]+) MW$/.exec(p)[1]), 'as the card says it: ' + VD.caughtText(x));
  }
  assert.ok(!MI.CATCH_WORDS.some(([, name]) => /fast/i.test(name)), 'no "fast" but YOUR GUARD');
  // all seven rows under the day's low (it went deeper): closer together, the last 30 px above the foot's link
  const full = draw(endOf(tripMoment({cont: {caught: {inertiaMW: 300, batteryMW: 90, guardMW: 200, governorsMW: 150, loadReliefMW: 10, uflsMW: 120, inverterMW: 40}}}), {share: {lowHz: 48.5}}));
  publicOk(full, 'seven rows');
  assert.deepEqual([full.t.rows.length, full.t.dayLow], [7, 'The day\'s low: 48.50 Hz']);
  assert.deepEqual(full.texts.filter(x => x.x > MI.PLOT.x1 && x.y > MI.IMAGE_H - 59).map(x => x.s), [SH.SHARE_URL], 'on the side, only the link near the foot');
});

test('Y-6: a rise, the thinnest margin, the city desk\'s cut and the relays\' each make a picture that keeps the rule and says whose the cut was; a low that is not the day\'s says so; a spoiler is left off', () => {
  const rise = VD.moment(memFall(true), [cont({lostMW: -400, extremeHz: 50.9, caught: {inertiaMW: -200, batteryMW: -40, governorsMW: -120, inverterMW: -60}})], {parMinute: pm});
  const r = draw(endOf(rise));
  publicOk(r, 'rise');
  assert.deepEqual([r.t.bigLabel, r.t.big, r.t.noGuard], ['HIGHEST', '50.90 Hz', '']);
  assert.ok(r.words.includes('inverters backing off 60 MW') && r.words.includes('PAR 50.10'), JSON.stringify(r.words));
  const mem = memFall();
  for (let k = 0; k < V.DAY_S / 60; k++) { mem.r5[k] = k === S / 60 ? 200 : 1000; mem.L[k] = 600; }
  const g = draw(endOf(VD.moment(mem, [], {parMinute: pm})));
  publicOk(g, 'margin');
  assert.deepEqual([g.t.bigLabel, g.t.big, g.t.rows.length], ['SPARE IN 5 MIN', '200 MW', 0]);
  assert.ok(g.words.includes('for a 600 MW risk: the day\'s thinnest margin'), JSON.stringify(g.words));
  const shed = VD.moment(Object.assign(memFall(), {spells: [{id: 'SOL3', by: 'directed', stage: 1, from: S, to: S + 600, mwh: 10, night: false}]}), [], {parMinute: pm});
  const c = draw(endOf(shed));
  publicOk(c, 'directed shed');
  assert.ok(c.words.includes('The city desk cut load to hold it.') && !c.words.some(w => /SOL/.test(w)), 'the cut, its suburb not named: ' + JSON.stringify(c.words));
  assert.deepEqual([c.t.bigLabel, c.t.big, c.t.dayLow], ['LOWEST', '49.09 Hz', '']);
  // the shed came first (D-21) and a trip later went deeper: its low is "LOWEST HERE", the day's low (the share card's) under it
  const sm = VD.moment(Object.assign(memFall(), {spells: [shed.spell]}), [cont({startTick: (S + 2 * H) * TPS, extremeHz: 48.38})], {parMinute: pm});
  const de = endOf(sm, {share: {lowHz: 48.38}}), deeper = draw(de);
  publicOk(deeper, 'a shed, then a deeper trip');
  assert.deepEqual([sm.kind, deeper.t.bigLabel, deeper.t.big, deeper.t.dayLow], ['shed', 'LOWEST HERE', '49.09 Hz', 'The day\'s low: 48.38 Hz']);
  assert.ok(deeper.words.includes('The day\'s low: 48.38 Hz') && de.share.lines.some(l => / low 48\.38 Hz$/.test(l)), 'as the share card says: ' + JSON.stringify(deeper.words));
  // the relays cut on frequency alone (no trip before them, or one hours before, or a rise): the picture and the card say so
  const relays = sp => VD.moment(Object.assign(memFall(), {spells: [{id: 'RED1', by: 'ufls', stage: 1, from: S + 6, to: S + 900, mwh: 30, night: false}]}), sp, {parMinute: pm});
  for (const [what, conts] of [['no trip', []], ['a trip 6 hours before', [cont({startTick: (S - 6 * H) * TPS})]], ['a rise just before', [cont({lostMW: -300, extremeHz: 50.4})]]]) {
    const u = relays(conts), r6 = draw(endOf(u));
    publicOk(r6, what);
    assert.deepEqual([u.kind, u.cont, u.s, r6.t.bigLabel, r6.t.note, r6.t.rows.length], ['shed', null, S + 6, 'LOWEST', 'Homes were cut off automatically to hold it.', 0], what);
    assert.match(u.text[0], /^\d\d:\d\d: the relays shed RED1 to hold frequency\. Lowest 49\.09 Hz\.$/, what);
  }
  // a fall 6 s before them is theirs: the trip's moment, its catch with the relays' share
  const t6 = relays([cont({uflsStages: 1, caught: {inertiaMW: 300, guardMW: 200, governorsMW: 150, uflsMW: 120}})]), d6 = draw(endOf(t6));
  publicOk(d6, 'the relays after a trip');
  assert.deepEqual([t6.cont && t6.cont.n, t6.s, d6.t.note], [1, S, '']);
  assert.ok(d6.words.includes('homes cut off 120 MW'), JSON.stringify(d6.words));
  // a black day; a closing line, a tag and a day's name that would spoil are left off (each word is linted as it is drawn)
  const b = draw(endOf(tripMoment(), {share: {grade: {points: 0, letter: 'F', star: false}, n: null, ymd: null, seed: 7, tags: ['HAND-FLOWN', 'STORM DAY'],
    closing: 'The battery saved you at 19:05.'}, end: {black: true, seed: 7}}));
  publicOk(b, 'spoilers');
  assert.deepEqual(b.t.dropped, ['HAND-FLOWN · STORM DAY', '"The battery saved you at 19:05."']);
  assert.ok(b.words.includes('GRIDWATCH') && b.words.includes('seed 7') && b.words.includes('0 F'), JSON.stringify(b.words));
});

test('Y-6: the file is named by the daily\'s number, else the seed, with no time of day', () => {
  assert.equal(MI.imageName(endOf(tripMoment())), 'gridwatch-daily-5-moment.png');
  assert.equal(MI.imageName(endOf(tripMoment(), {share: {n: null, ymd: null}, end: {seed: 20261007}})), 'gridwatch-seed-20261007-moment.png');
});

// The end card on a stand-in page, as the shell mounts it, with a finished day whose verdict holds `m` (and YOUR CARD unless share: null)
function card(m, share) {
  const doc = makeDocument(), root = doc.createElement('div'), toasts = [];
  doc.body.appendChild(root);
  const a = allIn({costDollars: 4e6, servedMWh: 1.1e5, lightsMWh: 0, co2tPerMWh: 0.55, co2t: 6e4, centsPerKWh: 3.6, saidiMin: 0, saifi: 0}, 1.9e6);
  const end = Object.assign(endOf(m), {allIn: a, parAllIn: a, v: 'x', inputs: 0, hash: 0});
  if (share === null) end.share = null;
  end.verdict = {lights: 'Every light you were given stayed on.', cost: '', carbon: '', moment: m, card: null, strip: [], demand: {text: ''}, trips: 'No trips today.'};
  let told = null;
  const said = new Promise(r => { told = r; });
  createEndCard(doc, root, {}, {par: () => null, households: () => 1.9e6, log: () => ({}), again() {}, toggleHelp() {}, toast: (text, kind) => { toasts.push([kind || 'red', text]); told(); }})
    .update({obs: {s: V.DAY_S}, end});
  return {doc, toasts, said, $: id => doc.getElementById(id)};
}
// Saving on the stand-in: its canvases get a toBlob (a PNG of the type asked), URL a createObjectURL that keeps the blob
function saving(doc, ok = true) {
  const blobs = [], anchors = [], make = doc.createElement;
  doc.createElement = tag => {
    const e = make(tag);
    if (tag === 'canvas') e.toBlob = (cb, type) => cb(ok ? {type, size: 1} : null);
    if (tag === 'a') { anchors.push(e); e.addEventListener('click', () => { e.clicked = true; }); }
    return e;
  };
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: b => { blobs.push(b); return 'blob:png'; }, revokeObjectURL() {}})});
  return {blobs, anchors, restore};
}

test('Y-6 on the end card: SAVE IMAGE in THE MOMENT once YOUR CARD is made, off while the fall with no GUARD computes, none without a moment; a press saves the PNG with a toast', async () => {
  // (elements are compared by id or presence: a failing assert would print the stand-in DOM, which never ends)
  const c = card(tripMoment()), b = c.$('btn-save-moment'), has = (x, id) => !!x.$(id);
  assert.ok(!!b, 'the button');
  assert.deepEqual(c.$('end-moment').querySelectorAll('button').map(x => x.id), ['btn-save-moment'], 'inside THE MOMENT, its only button');
  assert.deepEqual([b.textContent, b.title], ['SAVE IMAGE', MOMENT_IMAGE_NOTE]);
  assert.equal(has(card(tripMoment(), null), 'btn-save-moment'), false, 'not before YOUR CARD (par still computing)');
  // the fall with no GUARD still computing: the button is there but off, and says why (the picture would miss it)
  const wait = VD.moment(memFall(), [cont()], {parMinute: pm, twin: {done: false, nadirHz: NaN}, guardMW: 400}), w = card(wait).$('btn-save-moment');
  assert.deepEqual([wait.pending, w.textContent, w.title, w.disabled], [true, MOMENT_IMAGE_WAIT, MOMENT_IMAGE_WAIT_NOTE, true]);
  assert.deepEqual([tripMoment().pending, b.disabled], [undefined, false], 'done: on');
  const none = card(null);
  assert.deepEqual([has(none, 'end-moment'), has(none, 'btn-save-moment')], [false, false], 'a day without a moment: no button');
  // the press: the module loads, the picture is drawn and saved as a PNG under its name, and the toast says so
  const s = saving(c.doc);
  try {
    b.click();
    assert.equal(b.disabled, true, 'one save at a time');
    await c.said;
    await new Promise(r => setTimeout(r, 0));
  } finally { s.restore(); }
  assert.deepEqual(c.toasts, [['info', 'Saved to your downloads: gridwatch-daily-5-moment.png']]);
  assert.deepEqual([s.blobs.map(x => x.type), s.anchors.length, s.anchors[0].download, s.anchors[0].href, !!s.anchors[0].clicked], [['image/png'], 1, 'gridwatch-daily-5-moment.png', 'blob:png', true]);
  assert.equal(b.disabled, false);
  assert.deepEqual(c.doc.canvasStats.bad, []);
  // a browser that makes no PNG: a red toast, nothing saved
  const f = card(tripMoment()), fs = saving(f.doc, false);
  try { f.$('btn-save-moment').click(); await f.said; } finally { fs.restore(); }
  assert.deepEqual([f.toasts, fs.anchors.length], [[['red', 'The image failed: this browser made no PNG']], 0]);
});

test('Y-6 on the page: a real trip with a GUARD set, the day\'s end, SAVE IMAGE once the fall with no GUARD is in: the picture keeps the rule and is saved under the seed', async () => {
  const p = openGame({seed: 20261007}), st = p.game.state;
  p.send({type: 'guard', mw: 200});
  injectTrip(st, 30 * 60 + 90);
  assert.equal(p.until('trip', {max: '+10m', line: 'near'}).why, 'trip');
  p.until('card', {max: '+5m', line: 'near'});
  p.key('Enter');
  p.to('+5m', {stop: [], line: 'near'});
  st.over = true;
  p.frames(1);
  // the twin replays the day after it, 10 ms a frame: the button waits for it (seconds for an evening trip)
  const w = p.$('btn-save-moment');
  assert.ok(p.game.twin && !p.game.twin.done, 'the twin computing');
  assert.deepEqual([!!(w && w.closest('#end-moment')), w.disabled, w.textContent], [true, true, MOMENT_IMAGE_WAIT], 'SAVE IMAGE in THE MOMENT, off');
  p.game.twin.step(Infinity);   // (jumped to its end, as the shell's frames would bring it)
  p.frames(1);
  const b = p.$('btn-save-moment');
  assert.deepEqual([b.disabled, b.textContent], [false, 'SAVE IMAGE'], 'on, once the twin is done');
  const s = saving(p.doc), make = p.doc.createElement, pics = [];
  p.doc.createElement = tag => { const e = make(tag); if (tag === 'canvas') { const r = recording({createElement: () => e}); pics.push(r); } return e; };
  try {
    b.click();
    for (let i = 0; i < 20 && !s.anchors.length; i++) await new Promise(r => setTimeout(r, 0));
  } finally { s.restore(); }
  assert.equal(s.anchors[0] && s.anchors[0].download, 'gridwatch-seed-20261007-moment.png');
  const words = pics[0].texts.map(x => x.s);
  assert.ok(words.includes('CAUGHT BY') && words.some(w => /^With no GUARD: \d\d\.\d\d Hz$/.test(w)) && words.some(w => /^NO GUARD \d\d\.\d\d$/.test(w)), JSON.stringify(words));
  // the trip was the day's low (the sim's own two counts of it agree): a plain LOWEST, and no day's low under it
  assert.ok(words.includes('LOWEST') && !words.some(w => /day's low/.test(w)), JSON.stringify(words));
  for (const w of words) assert.deepEqual(SH.lintCard(w), [], w);
  assert.deepEqual(p.h.mods.errors, []);
});
