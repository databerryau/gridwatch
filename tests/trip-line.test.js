// W7, Q-121 (decisions/2026-10-16-open-questions.md §11): the briefing's day line says "Expect a trip during the evening peak."
// on a day whose plan has the evening trip of the largest machine (sim/dayplan.js Act III: a heatwave, a wind drought or a calm
// evening, 17:00-19:30), and never on one without it (a storm day: its tie trip is a chance, not the plan's). The page reads it
// from the seed (app/week.js eveningTrip, as Q-110's outlook word) without running the sim; the oracle here is the plan the sim
// itself made (createState's ext.events). No minute is given: the minute is the test. The line names a span, the badge's PEAK
// (sim/clock.js, 16:30-20:00), which holds every such trip; not "at the peak", since Marg names the peak as a minute at TAKE THE
// DESK and the trip comes before it (the review's: a median 70 grid-minutes before on the calendar). Headless: createState and
// the shell's own functions, and one page boot for the card and Marg's line.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayText, dayPlan, TRIP_LINE} from '../app/shell.js';
import * as G from '../app/game.js';
import * as SF from '../app/shelf.js';
import {eveningTrip} from '../app/week.js';
import {createState, observe} from '../sim/step.js';
import {V} from '../sim/params.js';
import {PEAK, SEGMENTS} from '../sim/clock.js';
import {DAILIES, dailyFor, ANNIVERSARY_KEYS} from '../content/dailies.js';
import {SA2016} from '../content/anniversaries.js';
import {TEXT} from '../content/text.js';
import {openGame} from './lib/play.js';

const toS = h => (h - V.DAY_START_H) * V.S_PER_H, EVE = [toS(17), toS(19.5)];
const hm = s => String(Math.floor(s / 3600 + 4) % 24).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0');
const ymdOf = t => t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
/** The plan's evening trip: Act III's trip of the largest machine, not an anniversary's incident; its second of the day, or -1. */
const planTrip = st => (st.ext.events.find(e => e.act === 3 && e.type === 'unitTrip' && e.args.rule === 'largest' && !e.incident) || {atS: -1}).atS;
/** The line's span holds the plan's trip (and an incident's that follows it): during the evening peak, the badge's PEAK. */
const inPeak = (s, why) => assert.ok(s >= PEAK[0] && s < PEAK[1], why + ': during the evening peak, not ' + hm(s));
/** A seed's day as its briefing reads it: the state at 04:00, the day line, the plan's evening trip and whether the line says it. */
function day(seed) {
  const st = createState(seed, G.scenarioForSeed(seed)), text = dayText(st.day, dayPlan(st, observe(st)));
  return {st, text, at: planTrip(st), says: text.includes(TRIP_LINE.trim()), why: seed + ' (' + st.ext.regime.cls + '): ' + text};
}

test('Q-121: "Expect a trip during the evening peak." exactly when the plan has the evening trip, last and with no minute (every 5th daily of the calendar)', () => {
  // the owner's sentence (Q-121), made a span: the evening peak is the badge's PEAK, the segment the trip lands in
  assert.equal(TRIP_LINE, ' Expect a trip during the evening peak.');
  assert.equal(SEGMENTS.find(g => g.a === PEAK[0]).name, 'PEAK', 'the badge\'s word for the span');
  const stamp = G.dailyStamp(), end = new Date(DAILIES.to + 'T00:00:00Z'), seen = {};
  for (let t = new Date(DAILIES.from + 'T00:00:00Z'); t <= end; t = new Date(t.getTime() + 5 * 864e5)) {
    const x = day(dailyFor(ymdOf(t), stamp).seed);
    assert.equal(x.says, x.at >= 0, x.why + (x.at >= 0 ? ' (the plan trips at ' + hm(x.at) + ')' : ' (no evening trip in the plan)'));
    if (x.at >= 0) assert.ok(x.at >= EVE[0] && x.at <= EVE[1], x.why + ': the plan\'s window, not ' + hm(x.at));
    if (x.at >= 0) inPeak(x.at, x.why);
    assert.equal(x.text.endsWith(TRIP_LINE), x.says, x.why + ': its last sentence');
    assert.doesNotMatch(x.text, /\d:\d\d/, x.why + ': no minute');
    const k = x.st.ext.regime.cls + (x.says ? ' + trip' : '');
    seen[k] = (seen[k] || 0) + 1;
  }
  // every kind of day in the sample: the three that keep the evening trip, and the storm, which has none
  assert.deepEqual(Object.keys(seen).sort(), ['calm + trip', 'drought + trip', 'heat + trip', 'storm'], JSON.stringify(seen));
  // the "?" drawer says the same: every evening without a storm brings the trip, the briefing announces it, never its minute
  const ours = id => TEXT.abstractions.find(e => e.id === id).ours;
  assert.ok(ours('event-dense-day').includes('every evening without a storm also brings a trip of the largest unit, announced in the ' +
    'briefing but never its minute, and a storm may trip the tie.'), ours('event-dense-day'));
  assert.ok(ours('warning-leads').endsWith(' No trip\'s minute is ever warned: the briefing says only whether the evening peak brings one.'),
    ours('warning-leads'));
  assert.doesNotMatch(TEXT.abstractions.map(e => e.ours).join(' '), /Trips are never warned|most evenings without a storm|III's unwarned trip/);
});

test('Q-121: the anniversaries and the Hard days say it as their plans do, each trip during the evening peak; an incident\'s trip is the account\'s, never the line\'s', () => {
  const stamp = G.dailyStamp(), of = ymd => day(dailyFor(ymd, stamp).seed);
  const incident = (x, act) => x.st.ext.events.filter(e => e.incident && e.type === 'unitTrip' && e.act === act).map(e => e.atS);
  // Loy Yang A3: a settled day keeps its evening trip (the line), and its largest machine trips before dawn too (the account says so)
  const ly = of(20261214);
  assert.equal(ly.text, 'Today: a hot weekday, no heatwave forecast. Expect a trip during the evening peak.', ly.why);
  assert.equal(incident(ly, 1).length, 1, 'the dawn trip is the incident\'s');
  inPeak(ly.at, ly.why);
  // Callide C: the evening trip (the line) takes the next largest with it five grid minutes later: the account's "trips across the state"
  const cc = of(20270525);
  assert.equal(cc.text, 'Today: a mild weekday: rooftop solar cuts midday demand. Expect a trip during the evening peak.', cc.why);
  assert.deepEqual(incident(cc, 3), [cc.at + 300], 'the second trip is the incident\'s, after the line\'s');
  inPeak(cc.at, cc.why); inPeak(cc.at + 300, cc.why + ' (the second trip)');
  // the Moorabool towers: a storm day; its unit trip comes in the storm, as the account tells it: no line
  const tw = of(20270213);
  assert.equal(tw.text, 'Today: a hot weekend, one coal unit off, no heatwave forecast. Storms likely later.', tw.why);
  assert.deepEqual([tw.at, incident(tw, 3).length], [-1, 1]);
  assert.deepEqual(Object.keys(ANNIVERSARY_KEYS).map(Number), [20261214, 20270213, 20270525], 'every anniversary is above');
  // the Hard days: the gate's rejected attempts play the desk's plans; SA 2016 is a storm whose tie trips at the peak, unwarned (no line)
  const hard = SF.hardDays();
  for (const h of hard) {
    const x = day(h.seed);
    assert.equal(x.says, x.at >= 0, 'Hard day ' + h.n + ': ' + x.why);
    assert.equal(eveningTrip(h.seed, G.scenarioForSeed(h.seed)), x.at >= 0, 'Hard day ' + h.n + ': the seed\'s plan is the state\'s');
    if (x.at >= 0) inPeak(x.at, 'Hard day ' + h.n + ': ' + x.why);
  }
  const sa = day(SA2016.seed);
  assert.equal(hard[0].seed, SA2016.seed);
  assert.ok(!sa.says && sa.text.endsWith('Storms likely later.'), sa.why);
  assert.ok(hard.some(h => day(h.seed).says), 'some Hard days have the evening trip');
});

test('Q-121 on the page: the briefing card carries the line; Marg then names the peak as a minute, and the trip comes before it', () => {
  const p = openGame({seed: 20261016, take: false}), x = day(20261016);
  assert.ok(x.at >= 0, x.why);
  assert.equal(p.$('briefing-day').textContent, x.text);
  assert.ok(x.text.endsWith(TRIP_LINE), x.text);
  // TAKE THE DESK: Marg's first line gives the forecast's peak to the minute; the plan's trip is earlier, inside the evening
  // peak, so the line names that span and never "the peak" as a moment
  p.click('btn-take');
  const take = (p.game.marg.said.find(l => l.key === 'take') || {}).text, m = /^Morning\. Peak about [\d,]+ MW at (\d\d):(\d\d)\./.exec(take);
  assert.ok(m, take);
  assert.ok(x.at >= PEAK[0] && x.at < toS(+m[1] + m[2] / 60), 'the trip at ' + hm(x.at) + ', Marg\'s peak at ' + m[1] + ':' + m[2]);
  assert.doesNotMatch(TRIP_LINE, /\bat the peak\b/);
  assert.deepEqual(p.h.mods.errors, []);
});
