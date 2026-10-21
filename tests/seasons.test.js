// Q-127 (light seasons, Q-122): content/seasons.js is tools/seasons-gen.mjs's output, each month is a plausible day of its
// season, and a season's words reach the briefing and the week ahead.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SEASON_MONTHS} from '../content/seasons.js';
import {SEASON_SCENARIOS, DESK} from '../content/scenarios.js';
import {createState, observe} from '../sim/step.js';
import {underlyingBaseMW, rooftopClearSkyMW} from '../sim/weather.js';
import {dayText, dayPlan} from '../app/shell.js';
import {dayWord} from '../app/week.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const peak = t => Math.max(...t.map(p => p[1]));

test('Q-127: content/seasons.js is what tools/seasons-gen.mjs writes', () => {
  execFileSync(process.execPath, ['tools/seasons-gen.mjs', '--check'], {cwd: ROOT, stdio: 'pipe'});
});

test('Q-127: every month is a day of its season: shorter, weaker sun in winter, heating in the cold months, no heatwave out of summer', () => {
  const feb = {day: DESK.sun.setH - DESK.sun.riseH, solar: peak(DESK.solar.clearSkyMW)};
  for (const [m, r] of Object.entries(SEASON_MONTHS)) {
    const day = r.sun.setH - r.sun.riseH, winter = m >= 5 && m <= 8;
    assert.ok(peak(r.clearSkyMW) <= feb.solar, r.key + ': never above the nameplate');
    if (winter) {
      assert.ok(day < 11 && r.sun.setH < 17.5, r.key + ': a short day, the sun down before the evening peak');
      assert.ok(peak(r.clearSkyMW) < 0.8 * feb.solar && r.clearFactor < 0.55, r.key + ': a low sun');
      assert.equal(r.word, 'cold');
      // the evening's heating: the cold day's 18:00 above its noon, by more than the late-summer mild day's
      const at = (t, h) => t.find(p => p[0] === h)[1], mildFeb = h => underlyingBaseMW(DESK, {temp: 'MILD', weekend: false}, h);
      assert.ok(at(r.baseMW, 18) - at(r.baseMW, 12) > mildFeb(18) - mildFeb(12) + 200, r.key + ': heating lifts the evening');
      assert.ok(at(r.baseMW, 18) > at(r.mildBaseMW, 18), r.key + ': a cold day asks more than a mild one');
    }
    if (r.word !== 'hot') assert.equal(r.heatShare, 0, r.key + ': no heatwave');
    assert.ok(Math.max(...r.table.map(p => p[1])) <= 36 && Math.min(...r.mildTable.map(p => p[1])) >= 3, r.key);
  }
});

test('Q-127: a June day plays: the sim reads its month (rooftop, demand, temperature), and its words say cold or mild', () => {
  const jun = SEASON_SCENARIOS['desk-jun'];
  assert.ok(rooftopClearSkyMW(jun, 12) < 0.65 * rooftopClearSkyMW(DESK, 13), 'the winter rooftop at noon');
  assert.equal(rooftopClearSkyMW(jun, 17), 0, 'dark by 17:00');
  let seen = new Set();
  for (let seed = 1; seen.size < 2 && seed < 200; seed++) {
    const st = createState(seed, jun), obs = observe(st), t = dayText(st.day, dayPlan(st, obs));
    assert.ok(st.env.tempC < 12, 'a June dawn');
    if (st.day.temp === 'MILD') { assert.match(t, /^Today: a mild weekday/); seen.add('MILD'); } else { assert.match(t, /^Today: a cold weekday: heating lifts the morning and the evening\./); seen.add('HOT'); }
    assert.doesNotMatch(t, /heatwave/i);
  }
  assert.equal(seen.size, 2, 'both types drawn');
  assert.equal(dayWord({cls: 'calm', temp: 'HOT'}, jun), 'cold');
  assert.equal(dayWord({cls: 'calm', temp: 'HOT'}, SEASON_SCENARIOS['desk-oct']), 'warm');
  assert.equal(dayWord({cls: 'calm', temp: 'HOT'}, DESK), 'hot', 'the late-summer day is unchanged');
  assert.equal(dayText({temp: 'HOT', weekend: true}, {heat: false, season: 'warm', word: 'storm'}), 'Today: a warm weekend, one coal unit off. Storms likely later.');
});

test('Q-127: the map\'s light follows the month\'s sun: a June 16:30 is dusk, 17:30 night, its noon is midday, and late summer is unchanged', async () => {
  const {skyHour, skyState, sunAmount} = await import('../render/map.js');
  const jun = createState(1, SEASON_SCENARIOS['desk-jun']), feb = createState(1, DESK);
  const at = (st, h) => ({...observe(st), clock: {h}});
  assert.deepEqual(observe(jun).sky.sun, {riseH: SEASON_MONTHS[6].sun.riseH, setH: SEASON_MONTHS[6].sun.setH});
  for (const h of [5, 6.5, 12, 17.5, 19, 22]) assert.equal(skyHour(at(feb, h)), h, 'late summer: the clock');
  assert.equal(skyState(skyHour(at(jun, 12))), 'day');
  assert.equal(skyState(skyHour(at(jun, 16.5))), 'dusk', 'June: dusk at 16:30');
  assert.equal(skyState(skyHour(at(jun, 17.5))), 'night', 'and dark by 17:30, before the evening peak');
  assert.equal(skyState(skyHour(at(jun, 7))), 'dawn');
  assert.ok(sunAmount(skyHour(at(jun, 12))) === 1 && Math.abs(skyHour(at(jun, 12)) - 13) < 0.05, 'solar noon is the sky\'s midday');
  let last = -1;
  for (let h = 4; h < 20.5; h += 0.25) { const x = skyHour(at(jun, h)); assert.ok(x > last, 'continuous and rising at ' + h); last = x; }
});
