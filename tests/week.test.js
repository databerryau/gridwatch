// W6, D-28 (Q-109): THE WEEK AHEAD on the end card: the next seven dailies' day types from their seeds alone, each the type the
// day itself draws (its state's regime), so the day plays it: a HEATWAVE, hot or mild day's briefing says so, and a storm or
// low-wind day warns of it on the day. On the end card, after YOUR CARD. Only this build's gate-checked dailies: it stops at
// the calendar's end and shows none with a stale list.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../app/week.js';
import * as G from '../app/game.js';
import {dayText} from '../app/shell.js';
import {createState, observe} from '../sim/step.js';
import {DAILIES, dailyFor} from '../content/dailies.js';
import {openGame} from './lib/play.js';

const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
const ymdOf = s => +s.replace(/-/g, '');
const local = ymd => new Date(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100);
// The end card of a day played on `date` (the player's local date), ended at once
function endCard(seed, date) {
  const p = openGame({seed, run: false, par: PAR, date});
  p.game.state.over = true;
  p.frames(2);
  return p;
}

test('D-28: the week ahead is the next seven dailies, each named by the regime its own day draws', () => {
  const w = W.weekAhead(20261016, G.dailyStamp());
  assert.equal(w.length, W.WEEK_DAYS);
  assert.deepEqual(w.map(x => x.ymd), [20261017, 20261018, 20261019, 20261020, 20261021, 20261022, 20261023]);
  assert.equal(w[0].day, 'Sat');
  for (const x of w) {
    const d = dailyFor(x.ymd, G.dailyStamp()), st = createState(d.seed, G.scenarioForSeed(d.seed));
    assert.equal(x.word, W.dayWord(st.ext.regime), x.ymd + ': the day\'s own regime');
  }
  assert.deepEqual(['heat', 'storm', 'drought'].map(cls => W.dayWord({cls})), ['HEATWAVE', 'storm', 'low wind']);
  assert.deepEqual(['MILD', 'HOT'].map(temp => W.dayWord({cls: 'calm', temp})), ['mild', 'hot']);
  // each day held to its word: the line breaks only between days
  assert.match(W.weekText(w), /^Sat [^ ]+ · Sun [^ ]+ · /);
  assert.equal(W.weekText([{day: 'Mon', word: 'low wind'}, {day: 'Tue', word: 'mild'}]), 'Mon low wind · Tue mild');
  // across a month's end and a year's
  assert.deepEqual(W.weekAhead(20261230, G.dailyStamp(), 3).map(x => x.ymd), [20261231, 20270101, 20270102]);
});

test('D-28: only gate-checked dailies: it stops at the calendar\'s end, and a stale list shows none', () => {
  const to = ymdOf(DAILIES.to), st = G.dailyStamp();
  assert.deepEqual(W.weekAhead(to - 2, st).map(x => x.ymd), [to - 1, to], 'the last two dailies, then the calendar ends');
  assert.deepEqual(W.weekAhead(to, st), []);
  assert.deepEqual(W.weekAhead(20261016, 'another build'), [], 'a stale list: the seeds may change');
  assert.deepEqual(W.weekAhead(NaN, st), []);
});

test('D-28: each word is what that day plays: HEATWAVE, hot and mild in its briefing; a storm or low wind warned on the day (a month of dailies)', () => {
  const from = ymdOf(DAILIES.from), seen = new Set(), WARN = {storm: 'stormWarn', 'low wind': 'droughtWarn'};
  for (const x of W.weekAhead(from - 1, G.dailyStamp(), 30)) {
    const d = dailyFor(x.ymd, G.dailyStamp()), st = createState(d.seed, G.scenarioForSeed(d.seed)), obs = observe(st);
    const text = dayText(st.day, {heat: obs.news.some(n => n.kind === 'heat' && n.atS === 0)}), why = x.ymd + ' ' + x.word + ': ' + text;
    seen.add(x.word);
    assert.equal(x.word === 'HEATWAVE', /heatwave this afternoon/.test(text), why);
    if (x.word === 'mild') assert.match(text, /^Today: a mild /, why);
    if (x.word === 'hot') assert.match(text, /^Today: a hot .*no heatwave forecast\.$/, why);
    // (a storm or a wind drought is not in the briefing: it is warned hours ahead, on the day; the row's title says so)
    if (WARN[x.word]) assert.ok(/^Today: a (mild|hot) /.test(text) && st.ext.events.some(e => e.type === WARN[x.word] && e.atS > 0), why);
  }
  assert.ok(seen.size >= 4, 'a month shows several kinds of day: ' + [...seen]);
});

test('D-28 on the page: the end card shows THE WEEK AHEAD from today, after YOUR CARD, with its note', () => {
  const p = endCard(20261016, local(20261016)), box = p.$('end-week');
  assert.ok(box, 'the week-ahead row');
  assert.equal(box.textContent, 'THE WEEK AHEAD ' + W.weekText(W.weekAhead(20261016, G.dailyStamp())));
  assert.equal(box.title, W.WEEK_NOTE);
  const share = p.$('end-share'), kids = Array.from(box.parentNode.children);
  assert.ok(share && kids.indexOf(share) >= 0 && kids.indexOf(share) < kids.indexOf(box), 'after YOUR CARD');
  assert.deepEqual(p.h.mods.errors, []);
});

test('D-28 on the page: a past daily\'s card looks ahead from today; a shift ended past midnight, from the new date; none at the calendar\'s end', () => {
  // a past daily from the shelf: the week is today's, not the played day's
  assert.equal(endCard(20261013, local(20261016)).$('end-week').textContent, 'THE WEEK AHEAD ' + W.weekText(W.weekAhead(20261016, G.dailyStamp())));
  // a shift begun on the 16th and ended on the 17th: the week from the 17th (the run itself stays the 16th's)
  const date = local(20261016), p = openGame({seed: 20261016, run: false, par: PAR, date});
  date.setDate(17);
  p.game.state.over = true;
  p.frames(2);
  assert.equal(p.game.today, 20261016, 'the run keeps the date it began on');
  assert.deepEqual(p.game.end.week.map(x => x.ymd)[0], 20261018);
  // on the calendar's last daily nothing is ahead: no row
  const to = ymdOf(DAILIES.to);
  assert.equal(endCard(to, local(to)).$('end-week'), null);
});
