// W7, Q-117 (decisions/2026-10-16-open-questions.md §7): the header's SCORE chip shows no number before 21:00. It keeps its
// place from TAKE THE DESK with its key over FROM 21:00, in grey, on two lines (next.html #chip-allin.later), and a title that
// says when the score shows; from the night shift's first frame (on a day with no night shift, from its clock's 21:00) and
// once the day is over it is Q-48's chip again, moving with the night strip (tests/night-strip.test.js plays that). The same
// on every kind of day: a daily, a weekend, an anniversary, a Hard day, a HAND day, and with no par to compare (ALL-IN). A page
// that opens past 21:00 (a resume) shows the number on its first frame. One width all day, so nothing in the header moves at
// 21:00 (with no par to compare, its own: "ALL-IN 999.9c"): the sizes are read from next.html's CSS and held against the widest
// text each key shows (no layout in the stand-in DOM; the integrator's browser pass sees it laid out).
//
// Headless (CLAUDE.md): the shell alone on next.html (no desk, map or stack), the clock held; the night is the sim's own flag
// set on the state, never played to.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bootGame, scoreShown, SCORE_LATER, SCORE_LATER_TIP, NIGHT_REDRAW_MS} from '../app/shell.js';
import * as G from '../app/game.js';
import {allIn, grade} from '../app/score.js';
import {seriesAt, PAR_MARK_S} from '../app/par.js';
import {NIGHT_S} from '../sim/clock.js';
import {V} from '../sim/params.js';
import {SA2016} from '../content/anniversaries.js';
import {allInCents} from '../render/format.js';
import {makeDocument} from './lib/dom.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const ruleOf = sel => { const m = new RegExp('(?:^|[\\s}])' + sel + '\\s*\\{([^}]*)\\}').exec(NEXT); assert.ok(m, 'no rule ' + sel); return m[1]; };
// par's running totals at its 5-minute marks, a steady day's: a running score exists from 04:00
const row = s => ({costDollars: 40.5 * s, servedMWh: 1.3 * s, lightsMWh: 0, co2tPerMWh: 0.6, saidiMin: 0, saifi: 0, maifi: 0});
const series = Array.from({length: V.DAY_S / PAR_MARK_S + 1}, (_, k) => row(k * PAR_MARK_S));
const PAR = {score: series.at(-1), series};

/** The shell alone on a seed's day (the page's own scenario), the desk taken (HAND first if asked), the clock held; `clock.t` its page time. */
function boot(seed, {par = PAR, hand = false} = {}) {
  const doc = makeDocument(NEXT), clock = {t: 0};
  const h = bootGame(doc, {search: '?seed=' + seed, scenario: G.scenarioForSeed, storage: null, audioWin: {}, raf: false, now: () => clock.t, par});
  const $ = id => doc.getElementById(id), frame = () => { clock.t += NIGHT_REDRAW_MS; h.frame(1 / 60); };
  h.frame(1 / 60);
  if (hand) $('btn-hand').click();
  $('btn-take').click();
  h.game.director.paused = true;   // (the clock held: the frames below run no tick)
  frame();
  const chip = $('chip-allin');
  return {h, $, frame, game: h.game, chip,
    words: () => $('chip-allin-k').textContent + ' ' + $('chip-allin-v').textContent,   // (the stand-in drops the space between them)
    night() { h.game.state.control.nightShift = true; frame(); }};
}
const pointsNow = b => {
  const v = b.h.vm(), hh = b.game.households;
  return grade(allIn(v.obs.score, hh), allIn(seriesAt(series, v.obs.s), hh), false).points;
};

test('Q-117: the chip shows its number from the night shift (or a night-less day\'s 21:00) and once the day is over, never before', () => {
  const s = NIGHT_S;
  assert.equal(scoreShown({s: s - 1, nightShift: false, over: false}), false, 'a day with a night shift waits for it');
  assert.equal(scoreShown({s, nightShift: false, over: false}), false, 'its clock alone is not enough: the night shift has the desk on its flag');
  assert.equal(scoreShown({s, nightShift: true, over: false}), true);
  assert.equal(scoreShown({s: s - 1, nightShift: false, over: false}, false), false, 'the classic day: its clock');
  assert.equal(scoreShown({s, nightShift: false, over: false}, false), true);
  assert.equal(scoreShown({s: 3600, nightShift: false, over: true}), true, 'a day that ended early (black) shows its score at once');
});

test('Q-117: before 21:00 the chip\'s place reads SCORE FROM 21:00, in grey, with no number and no par in its words; from the night shift, the score', () => {
  const b = boot(20261016);
  assert.equal(b.chip.hidden, false, 'its place kept from TAKE THE DESK');
  assert.equal(b.words(), 'SCORE ' + SCORE_LATER);
  assert.equal(b.chip.className, 'chip later');
  assert.deepEqual([b.chip.title, b.chip.getAttribute('aria-label')], [SCORE_LATER_TIP.score, SCORE_LATER_TIP.score], 'K-23: its name says when');
  assert.equal(SCORE_LATER_TIP.score, 'Your score shows here from 21:00, when the night shift takes the desk, and moves with the night\'s ' +
    'totals to 04:00, when your day is scored: 1000 × par\'s ALL-IN ÷ yours.');
  // par has its totals so far: a running score exists, and the chip says nothing of it
  const points = pointsNow(b);
  assert.ok(points > 0, points);
  for (const t of [b.words(), b.chip.title]) assert.doesNotMatch(t, new RegExp('\\b' + points + '\\b|\\(par|\\bc/kWh'), t);
  // the inline "?" beside it still explains the score (content/text.js allin-score)
  const q = b.$('hdr').querySelector('button.q[data-anchor="chip-allin"]');
  assert.ok(q && !q.hidden, 'its "?", shown');
  // 21:00: the night shift has the desk
  b.night();
  assert.equal(b.chip.className, 'chip', 'one line again');
  assert.equal(b.words(), 'SCORE ' + pointsNow(b));
  assert.match(b.chip.title, /^ALL-IN so far: [\d.]+ c\/kWh \(par [\d.]+\), SAIDI/);
  assert.deepEqual(b.h.mods.errors, []);
});

/** Each day: SCORE FROM 21:00 (ALL-IN with no par) in grey until the night shift, then its number; with no par the chip's
 * own width (.allin, next.html: "ALL-IN 999.9c") from its first frame, so it too does not move at 21:00. */
function sameOn(days) {
  for (const [what, seed, o] of days) {
    const b = boot(seed, o), off = !!o && o.par === false, wide = off ? ' allin' : '';
    if (what === 'a Hard day') assert.ok(b.game.hard > 0, 'a Hard day: ' + seed);
    if (what === 'a HAND day') assert.equal(b.game.state.control.mode, 'HAND');
    assert.deepEqual([b.words(), b.chip.className, b.chip.title], [(off ? 'ALL-IN ' : 'SCORE ') + SCORE_LATER, 'chip later' + wide,
      SCORE_LATER_TIP[off ? 'allIn' : 'score']], what);
    b.night();
    if (off) assert.match(b.words(), /^ALL-IN [\d.]+c$/, what);
    else assert.equal(b.words(), 'SCORE ' + pointsNow(b), what);
    assert.equal(b.chip.className, 'chip' + wide, what);
    assert.deepEqual(b.h.mods.errors, [], what);
  }
}

test('Q-117: the same on a weekend, an anniversary and a Hard day', () => {
  sameOn([['a weekend', 20261017], ['Loy Yang A3', 20261214], ['a Hard day', 20261026]]);
});

test('Q-117: the same on SA 2016, a HAND day and with no par to compare (ALL-IN FROM 21:00)', () => {
  sameOn([['SA 2016', SA2016.seed], ['a HAND day', 20261016, {hand: true}], ['no par', 20261016, {par: false}]]);
  assert.equal(SCORE_LATER_TIP.allIn, 'Your ALL-IN shows here from 21:00, when the night shift takes the desk, and moves with the night\'s ' +
    'totals to 04:00. There is no par to compare today.');
});

test('Q-117: a page that opens past 21:00 (a resume lands there) shows the score on its first frame in play, never FROM 21:00', () => {
  const doc = makeDocument(NEXT);
  const h = bootGame(doc, {search: '?seed=20261016', scenario: G.scenarioForSeed, storage: null, audioWin: {}, raf: false, now: () => 0, par: PAR});
  h.frame(1 / 60);
  const chip = doc.getElementById('chip-allin');
  assert.equal(chip.hidden, true, 'the briefing (where a resume replays)');
  doc.getElementById('btn-take').click();   // (the click draws no frame: the next frame is the desk's first)
  h.game.director.paused = true;
  h.game.state.control.nightShift = true;   // (the replayed state: the night shift has the desk)
  h.frame(1 / 60);
  assert.deepEqual([chip.hidden, chip.className], [false, 'chip']);
  assert.match(doc.getElementById('chip-allin-v').textContent, /^\d+$/);
  assert.equal(doc.getElementById('night-strip').hidden, false, 'with the strip');
  assert.deepEqual(h.mods.errors, []);
});

test('Q-117: one width all day, so the header does not move at 21:00: each key\'s min-width holds the widest it shows; FROM 21:00 two lines inside it', () => {
  // the sizes, read from next.html (no layout in the stand-in DOM): the chip's monospace (its ch), padding and border
  const num = (re, s) => { const m = re.exec(s); assert.ok(m, String(re)); return m.slice(1).map(Number); };
  const chip = ruleOf('\\.chip'), [font] = num(/font: (\d+)px var\(--mono\)/, chip), [, padX] = num(/padding: (\d+)px (\d+)px/, chip);
  const [border] = num(/border: (\d+)px solid/, chip), [hdr] = num(/--hdr: (\d+)px/, NEXT), [hdrLine] = num(/^ {2}header \{[^}]*border-bottom: (\d+)px/m, NEXT);
  assert.match(NEXT, /\* \{ box-sizing: border-box; \}/, 'a min-width counts the padding and the border');
  /** A rule's min-width in the chip's ch, after its padding and border. */
  const widthCh = sel => { const [ch, px] = num(/min-width: calc\((\d+)ch \+ (\d+)px\)/, ruleOf(sel)); assert.equal(px, 2 * padX + 2 * border, sel); return ch; };
  const ch = {SCORE: widthCh('#chip-allin'), 'ALL-IN': widthCh('#chip-allin\\.allin')};
  // the widest each key shows at night: SCORE and four digits (five would be a day ten times cheaper than par's); with no par,
  // ALL-IN in the chip's own c/kWh to 999.9 (past it, a third of the day's energy dark at VCR)
  const widest = {SCORE: 'SCORE ' + 9999, 'ALL-IN': 'ALL-IN ' + allInCents({askedMWh: 1, cents: 999.94}) + 'c'};
  for (const k of ['SCORE', 'ALL-IN']) assert.ok(widest[k].length <= ch[k], widest[k] + ' in ' + ch[k] + 'ch');
  assert.ok(ch['ALL-IN'] <= 13, 'no wider than it needs: ' + ch['ALL-IN'] + 'ch');
  // before 21:00: the key over FROM 21:00 on two lines of a smaller font, grey, with the same sides, inside the same width and the header
  const later = ruleOf('#chip-allin\\.later span, #chip-allin\\.later b'), [small] = num(/font-size: (\d+)px/, later), [lh] = num(/line-height: (\d+)px/, later);
  assert.match(later, /display: block;/, 'two lines');
  const [padY, padX2] = num(/padding: (\d+)px (\d+)px/, ruleOf('#chip-allin\\.later'));
  assert.equal(padX2, padX, 'the same sides');
  assert.match(NEXT, /#chip-allin\.later b \{ color: var\(--dim\); font-weight: 400; \}/, 'grey, not a value');
  for (const k of ['SCORE', 'ALL-IN']) for (const s of [k, SCORE_LATER]) assert.ok(s.length * small / font <= ch[k], s + ' under ' + k);
  assert.ok(2 * lh + 2 * padY + 2 * border <= hdr - hdrLine, 'two lines in the ' + hdr + '-px header');
});
