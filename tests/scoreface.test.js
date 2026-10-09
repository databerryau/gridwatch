// Q-48 (desk/README.md §30.7 "Face", §30.9): the ALL-IN score's face. The header chip (SCORE against
// par at the same grid time, 'SCORE …' until par gets there, ALL-IN c/kWh with no par to compare),
// the briefing's goals, and the end card, which loads on demand (app/endcard.js): the score and its
// letter, YOU / PAR / Δ for SUPPLY, OUTAGES, CARBON and ALL-IN, the biggest gap, the rule, the
// reliability readouts and their "?". Prices come from V.VCR and V.VER, never typed in. The wording
// never calls ALL-IN or SUPPLY "what customers pay", "your bill" or "the price".
//
// Headless (CLAUDE.md): the shell alone on next.html (no desk, map or stack) for the chip and the
// card; end-card tests set state.over and inject par ({score, series?, black?} or a runner with a
// step()), never playing to 04:00. One sampled play through tests/lib/play.js at the end.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bootGame, GOALS_TEXT} from '../app/shell.js';
import * as endCard from '../app/endcard.js';
import {allIn, grade} from '../app/score.js';
import {seriesAt, PAR_MARK_S} from '../app/par.js';
import {dollars} from '../render/format.js';
import {V} from '../sim/params.js';
import {TEXT} from '../content/text.js';
import {makeDocument} from './lib/dom.js';
import {openGame} from './lib/play.js';

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const NEXT = read('../next.html');
const usd = x => '$' + x.toLocaleString('en-US');
const VCR = usd(V.VCR), VER = usd(V.VER);
const FORBIDDEN = /what customers pay|your bill|the price\b/i;
const tick = () => new Promise(r => setTimeout(r, 0));
const squash = s => s.replace(/\s+/g, ' ').trim();

/** par's running totals at its 5-minute marks, `f` × a steady day's (a series as app/par.js records it). */
function parSeries(f = 1) {
  const row = s => ({costDollars: 45 * f * s, servedMWh: 1.3 * s, lightsMWh: 0, co2tPerMWh: 0.6, saidiMin: 0, saifi: 0, maifi: 0});
  return Array.from({length: V.DAY_S / PAR_MARK_S + 1}, (_, k) => row(k * PAR_MARK_S));
}
/** A par runner the test moves by hand (app/game.js uses an injected object with a step() as the runner). */
const runner = o => Object.assign({step() { return this.done; }, done: false, score: null, series: [], progress: 0, black: false,
  at(s) { return seriesAt(this.series, s); }}, o);

// The shell alone on next.html, the texts and the end card passed in (the page loads them on demand).
function boot(o = {}) {
  const doc = makeDocument(NEXT);
  const h = bootGame(doc, Object.assign({search: '?seed=20261008', storage: null, audioWin: {}, raf: false, now: () => 0,
    text: {TEXT}, endCard}, o));
  const $ = id => doc.getElementById(id), frame = () => h.frame(1 / 60);
  frame();
  return {doc, h, $, frame, game: h.game,
    chip: () => $('chip-allin-k').textContent + ' ' + $('chip-allin-v').textContent, // (the stand-in drops the space between them)
    take() { $('btn-take').click(); frame(); },
    over(black = false) { h.game.state.over = true; h.game.state.black = black; frame(); },
    rows: () => $('end-card').querySelectorAll('tr').map(r => r.children.map(c => squash(c.textContent))),
    lines: () => $('end-card').querySelectorAll('p').map(p => squash(p.textContent))};
}
const scoreText = g => 'SCORE ' + g.points + ' · ' + g.letter + (g.star ? ' ★' : '');

test('Q-48: the chip: hidden at the briefing; from TAKE THE DESK, SCORE against par at the same grid time ("SCORE …" until par is there); its title', () => {
  const run = runner({progress: 0.2});
  const b = boot({par: run});
  assert.equal(b.$('chip-allin').hidden, true, 'hidden in the briefing');
  b.take();
  assert.equal(b.$('chip-allin').hidden, false);
  assert.equal(b.chip(), 'SCORE …', 'par has not reached 04:30 yet');
  run.series = parSeries(0.9);
  b.frame();
  const v = b.h.vm(), hh = b.game.households, you = allIn(v.obs.score, hh), par = allIn(run.at(v.obs.s), hh);
  const g = grade(you, par, false);
  assert.ok(g && g.points > 0);
  assert.equal(b.chip(), 'SCORE ' + g.points, 'against par at the same grid time');
  const tip = b.$('chip-allin').title;
  assert.equal(b.$('chip-allin').getAttribute('aria-label'), tip);
  assert.equal(tip, 'ALL-IN so far: ' + you.cents.toFixed(1) + ' c/kWh (par ' + par.cents.toFixed(1) + '), SAIDI 0.0 min. The day\'s cost ' +
    'to the community per kWh the city asked for: supply + MWh dark × ' + VCR + ' (VCR) + CO₂ × ' + VER + ' (VER). Not a price or a bill.');
  assert.doesNotMatch(tip, FORBIDDEN);
  // its inline "?" opens the ALL-IN entry: what customers are charged, and what is left out
  const q = b.doc.querySelector('button.q[data-anchor="chip-allin"]');
  assert.ok(q && q.parentElement.id === 'hdr', 'an inline "?" in the header');
  q.click();
  assert.match(b.$('popover').textContent, /^The score divides par's ALL-IN by yours.*Customers pay the market price plus network and retail charges\. Those charges, most of a bill, are the same whatever you do and are left out\. VCR and VER are what regulators count an outage and a tonne as worth, not money anyone is paid\./s);
  // par off: the ALL-IN in cents per kWh the city asked for, and no par in the title
  const off = boot();
  off.take();
  const mine = allIn(off.h.vm().obs.score, off.game.households);
  assert.equal(off.chip(), 'ALL-IN ' + mine.cents.toFixed(1) + 'c');
  assert.match(off.$('chip-allin').title, /^ALL-IN so far: [\d.]+ c\/kWh, SAIDI/);
});

test('Q-48: at 04:00 the chip equals the end card\'s score; the card: h2 first, SCORE and letter, YOU / PAR / Δ, the gap, the rule, the reliability "?"', () => {
  const run = runner();
  const b = boot({par: run});
  b.take();
  const sc = b.h.vm().obs.score, PAR = Object.assign({}, sc, {costDollars: sc.costDollars * 0.8}); // par: the same day, 20% cheaper supply
  Object.assign(run, {done: true, score: PAR, progress: 1, series: parSeries()});
  b.over();
  const e = b.game.end, hh = b.game.households, you = e.allIn, par = allIn(PAR, hh), g = grade(you, par, false);
  assert.deepEqual(e.grade, g);
  const card = b.$('end-card');
  assert.equal(card.hidden, false);
  assert.equal(card.firstElementChild.tagName, 'H2');
  assert.equal(card.firstElementChild.textContent, 'Day over: 04:00.', 'the h2 first and unchanged');
  assert.equal(b.$('end-score').textContent, scoreText(g));
  assert.equal(b.chip(), 'SCORE ' + g.points, 'the chip at 04:00 is the card\'s score');
  const rows = b.rows();
  assert.deepEqual(rows[0], ['', 'YOU', 'PAR', 'Δ']);
  assert.deepEqual(rows[1], ['SUPPLY', dollars(you.supply), dollars(par.supply), '+' + dollars(you.supply - par.supply)]);
  assert.deepEqual(rows.map(r => r[0]).filter(x => /^[A-Z-]+$/.test(x)), ['SUPPLY', 'OUTAGES', 'CARBON', 'ALL-IN']);
  const text = squash(card.textContent);
  assert.ok(text.includes(you.supplyCents.toFixed(1) + ' c/kWh served: the COST chip (par ' + par.supplyCents.toFixed(1) + ')'), text);
  assert.ok(text.includes('0.0 MWh dark × ' + VCR + ' (VCR)'));
  assert.ok(text.includes(you.co2tPerMWh.toFixed(2) + ' t/MWh × ' + Math.round(you.askedMWh).toLocaleString('en-US') + ' MWh = ' +
    Math.round(you.co2tPriced).toLocaleString('en-US') + ' t × ' + VER + ' (VER)'), text);
  assert.ok(text.includes('your plants emitted ' + Math.round(you.co2t).toLocaleString('en-US') + ' t; imports and dark load are counted at your mix'));
  assert.ok(text.includes(you.cents.toFixed(1) + ' c/kWh · $' + you.perHousehold.toFixed(2) + ' per household'));
  const hhSpan = card.querySelectorAll('span').find(s => /per household/.test(s.textContent));
  assert.equal(hhSpan.title, 'per household of the city\'s 1.9M (unverified); real networks also count businesses');
  const lines = b.lines();
  assert.ok(lines.includes('Biggest gap to par: SUPPLY +' + dollars(you.supply - par.supply) + ' (more or dearer plant than par\'s)'), lines.join('\n'));
  { const c = boot({par: {score: Object.assign({}, PAR, {cost: Object.assign({}, sc.cost, {flex: 1})})}}); c.take(); c.over(); assert.ok(c.lines().some(l => /^Biggest gap to par: SUPPLY \+\S+ \(more or dearer plant, or city payments, than par's\)$/.test(l)), c.lines().join('\n')); } // §31.9.11: either day paid the city
  assert.ok(lines.includes('Score = 1000 × par\'s ALL-IN ÷ yours. Par is GRIDWATCH\'s own autopilot on this same day.'));
  assert.deepEqual(b.$('end-reliability').querySelectorAll('p').map(p => squash(p.textContent)),
    ['SAIDI 0.0 min · SAIFI 0.00 · MAIFI 0.00 per household today (par: SAIDI 0.0 min)', 'No household was off for more than 3 minutes. ?']);
  assert.match(lines.at(-2), /^Seed 20261008 · v4-[\w.-]+ · 0 inputs · hash 0x[0-9a-f]{8}$/);
  assert.deepEqual(card.querySelectorAll('button').map(x => x.id), ['q-reliability', 'btn-save-log', 'btn-again']);
  assert.doesNotMatch(text, FORBIDDEN);
  // the reliability "?": a button inside the card that toggles the reliability entry's popover
  const q = b.$('q-reliability');
  assert.deepEqual([q.className, q.getAttribute('aria-controls')], ['q inline', 'popover']);
  q.click();
  assert.equal(b.$('popover').hidden, false);
  assert.ok(b.$('popover').textContent.startsWith(endCard.RELIABILITY_ROW + 'Real world: '), b.$('popover').textContent.slice(0, 120));
  assert.ok(TEXT.abstractions.some(x => x.row === endCard.RELIABILITY_ROW && x.game === 'drawer'));
  assert.deepEqual(b.h.mods.errors, []);
});

test('Q-48: par computing: "PAR: computing… n%" in the score\'s place, redrawn as par runs and when it arrives (the buttons stay)', () => {
  const run = runner({progress: 0.42});
  const b = boot({par: run});
  b.take();
  b.over();
  assert.equal(b.$('end-score').textContent, 'PAR: computing… 42%');
  assert.deepEqual(b.rows()[0], ['', 'YOU'], 'no PAR column yet');
  assert.equal(b.chip(), 'SCORE …');
  const again = b.$('btn-again');
  run.progress = 0.5;
  b.frame();
  assert.equal(b.$('end-score').textContent, 'PAR: computing… 50%');
  const sc = b.h.vm().obs.score; // par arrives dearer than you: you beat it
  Object.assign(run, {done: true, progress: 1, score: Object.assign({}, sc, {costDollars: 2 * sc.costDollars}), series: parSeries()});
  b.frame();
  const g = b.game.end.grade;
  assert.ok(g && g.star && g.letter === 'A', 'par arrived and graded the end in place');
  assert.equal(b.$('end-score').textContent, scoreText(g));
  assert.equal(b.chip(), 'SCORE ' + g.points);
  assert.deepEqual(b.rows()[0], ['', 'YOU', 'PAR', 'Δ']);
  assert.equal(b.$('btn-again'), again, 'the card is redrawn between the h2 and the seed line only');
});

test('Q-48: par off, a black day, and a par that went black', () => {
  // par off: the player's ALL-IN and "PAR: off", no score, no PAR column
  const off = boot();
  off.take();
  off.over();
  const mine = off.game.end.allIn;
  assert.equal(off.$('end-score').textContent, 'ALL-IN ' + mine.cents.toFixed(1) + ' c/kWh · PAR: off');
  assert.deepEqual(off.rows()[0], ['', 'YOU']);
  assert.ok(!off.lines().some(l => /Biggest gap|beat par/.test(l)));
  assert.equal(off.chip(), 'ALL-IN ' + mine.cents.toFixed(1) + 'c');
  // a black day: the F at once, when it went black, par's ALL-IN and no YOU column (the day was cut short)
  const PAR = {costDollars: 4.3e6, servedMWh: 1.1e5, lightsMWh: 0, co2tPerMWh: 0.55, co2t: 6e4, centsPerKWh: 3.9};
  const black = boot({par: {score: PAR}});
  black.take();
  black.over(true);
  assert.equal(black.$('end-card').firstElementChild.textContent, 'The grid went black.');
  assert.equal(black.$('end-score').textContent, 'SCORE 0 · F');
  assert.equal(black.chip(), 'SCORE 0');
  assert.ok(black.lines().includes('The grid went black at 04:30: the day was cut short, so it has no YOU column.'), black.lines().join('\n'));
  const rows = black.rows(), par = allIn(PAR, black.game.households);
  assert.deepEqual(rows[0], ['', 'PAR']);
  assert.deepEqual(rows.find(r => r[0] === 'ALL-IN'), ['ALL-IN', dollars(par.total)]);
  assert.ok(squash(black.$('end-card').textContent).includes('par\'s plants emitted 60,000 t; imports and dark load are counted at par\'s mix'));
  // par could not finish: no score, the player's own column
  const pb = boot({par: {score: PAR, black: true}});
  pb.take();
  pb.over();
  assert.equal(pb.$('end-score').textContent, 'par could not finish this day: no score');
  assert.deepEqual(pb.rows()[0], ['', 'YOU']);
  assert.match(pb.chip(), /^ALL-IN [\d.]+c$/);
  for (const x of [off, black, pb]) assert.deepEqual(x.h.mods.errors, []);
});

test('Q-48: the card\'s arithmetic: SAIDI\'s worth at VCR, the biggest gap named, ★ and "You beat par on all three"', () => {
  const doc = makeDocument(NEXT), root = doc.getElementById('end-card'), hh = 1.9e6;
  const base = {costDollars: 4.0e6, servedMWh: 1.1e5, lightsMWh: 0, co2tPerMWh: 0.55, co2t: 6e4, centsPerKWh: 3.6};
  const mount = (you, par, saidiMin) => {
    const card = endCard.createEndCard(doc, root, {}, {par: () => ({done: true, score: par}), households: () => hh, log: () => ({}),
      again() {}, toggleHelp() {}, toast() {}});
    const a = allIn(Object.assign({}, you, {saidiMin, saifi: 0.12}), hh), p = allIn(par, hh);
    card.update({obs: {s: V.DAY_S}, end: {black: false, allIn: a, parAllIn: p, grade: grade(a, p, false), seed: 1, v: 'x', inputs: 0, hash: 0}});
    return {a, p, lines: root.querySelectorAll('p').map(x => squash(x.textContent))};
  };
  // 12 MWh dark, all else par's: OUTAGES is the gap, and each SAIDI-minute is worth OUTAGES ÷ SAIDI
  const dark = mount(Object.assign({}, base, {lightsMWh: 12}), base, 2.5);
  assert.ok(dark.lines.includes('Biggest gap to par: OUTAGES +' + dollars(12 * V.VCR) + ' (12.0 MWh dark at ' + VCR + ' each)'), dark.lines.join('\n'));
  assert.ok(dark.lines.includes('Each SAIDI-minute today cost customers about ' + dollars(12 * V.VCR / 2.5) + ' at VCR. A distributor\'s STPIS ' +
    'would not count this shedding ?'), dark.lines.join('\n'));
  assert.ok(dark.lines.includes('SAIDI 2.5 min · SAIFI 0.12 · MAIFI 0.00 per household today (par: SAIDI 0.0 min)'));
  // cheaper and cleaner than par: ★ and no gap
  const win = mount(Object.assign({}, base, {costDollars: 3.5e6, co2tPerMWh: 0.5}), base, 0);
  assert.ok(win.lines[0].startsWith('SCORE ') && win.lines[0].endsWith(' · A ★'), win.lines[0]);
  assert.ok(win.lines.includes('You beat par on all three.'));
  // the prices are the params', never typed into the face's code
  for (const f of ['../app/endcard.js', '../app/shell.js', '../render/format.js']) {
    assert.doesNotMatch(read(f), /30,?000|\$80\b|\b80 ?\/ ?t/, f + ' types a price in');
  }
});

test('Q-48 / Q-44: the end card loads on demand (hidden meanwhile), once; a failed load says so', async () => {
  let loads = 0;
  const b = boot({par: {score: {costDollars: 1e6, servedMWh: 1e5, lightsMWh: 0, co2tPerMWh: 0.5}}, endCard: () => { loads++; return Promise.resolve(endCard); }});
  b.take();
  assert.equal(loads, 0, 'nothing loads before the day ends');
  b.over();
  assert.equal(b.$('end-card').hidden, true, 'hidden while it loads');
  await tick();
  b.frame();
  assert.equal(b.$('end-card').hidden, false);
  assert.equal(b.$('end-card').firstElementChild.textContent, 'Day over: 04:00.');
  b.$('btn-again').click();
  b.frame();
  assert.equal(b.$('end-card').hidden, true);
  assert.equal(b.$('briefing-card').hidden, false);
  b.take();
  b.over(true);
  assert.equal(loads, 1, 'mounted once');
  assert.equal(b.$('end-card').firstElementChild.textContent, 'The grid went black.', 'a new day\'s end redraws it');
  const bad = boot({endCard: () => Promise.reject(new Error('offline'))});
  bad.take();
  bad.over();
  await tick();
  bad.frame();
  assert.equal(bad.$('end-card').hidden, false);
  assert.match(bad.$('end-card').textContent, /could not be loaded/);
  assert.deepEqual(bad.h.mods.errors, ['end card: offline']);
});

test('Q-48: the briefing names the three goals and their prices (≤ 60 words); EXPLAIN in "how"; the texts never call it a bill', () => {
  const b = boot();
  assert.equal(b.$('briefing-goals').textContent, GOALS_TEXT);
  assert.ok(GOALS_TEXT.includes('plus ' + VCR + ' for each MWh') && GOALS_TEXT.includes('plus ' + VER + ' a tonne of CO₂'), GOALS_TEXT);
  assert.ok(GOALS_TEXT.split(/\s+/).length <= 60, GOALS_TEXT.split(/\s+/).length + ' words');
  assert.ok(b.$('briefing-how').textContent.includes('EXPLAIN (W), beside the alarms, holds the clock and explains each one.'));
  const byId = new Map(TEXT.abstractions.map(e => [e.id, e]));
  for (const id of ['allin-score', 'allin-vcr', 'allin-carbon', 'reliability-indices']) {
    const e = byId.get(id);
    assert.equal(e.ui, 'drawer', id);
    for (const k of ['real', 'ours', 'why']) assert.doesNotMatch(e[k], FORBIDDEN, id + '.' + k);
  }
  assert.doesNotMatch(GOALS_TEXT, FORBIDDEN);
  assert.equal(byId.get('allin-score').game, 'chip-allin');
  assert.ok(byId.get('allin-score').ours.includes(VCR + ' (VCR)') && byId.get('allin-score').ours.includes(VER + ' (VER)'));
  assert.ok(byId.get('reliability-indices').ours.startsWith('A district dark longer than ' + V.SUSTAINED_INTERRUPTION_S / 60 + ' grid-minutes'));
  assert.match(byId.get('customer-cost').ours, /never priced in CUSTOMER COST: the ALL-IN score prices it\.$/);
  assert.match(byId.get('carbon-generation').ours, /In the ALL-IN score, every MWh the city asked for, imports and dark load included, is charged at this intensity\.$/);
});

test('Q-48, played (sampled): the CLOCK line carries SCORE against par through the day, and the END line at 04:00 the same score', () => {
  const series = parSeries(0.9), par = {score: series.at(-1), series};
  const p = openGame({seed: 20261008, par});
  p.to('04:45');
  const v = p.vm(), hh = p.game.households, g = grade(allIn(v.obs.score, hh), allIn(seriesAt(series, v.obs.s), hh), false);
  assert.match(p.look({controls: false}), new RegExp('^CLOCK 04:45:\\d\\d \\| .* \\| SCORE ' + g.points + '$', 'm'));
  p.game.state.over = true;
  p.frames(2);
  const end = p.game.end.grade, look = p.look({controls: false});
  assert.match(look, new RegExp('^END Day over: 04:00\\. ' + scoreText(end).replace(/[★·]/g, '.') + ' YOU PAR Δ SUPPLY', 'm'), look);
  assert.match(look, new RegExp('\\| SCORE ' + end.points + '$', 'm'));
  assert.deepEqual(p.h.mods.errors, []);
});
