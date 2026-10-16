// content/anniversaries.js: W6, D-29 (Q-103): the anniversary dailies. On the date of a real NEM incident inside the dailies'
// calendar (content/dailies.js from..to), the daily is a labelled variant of the date's own scenario, shaped by the incident.
// content/scenarios.js lays `overrides` over that scenario (objects merged, arrays and values replaced) and lists the variant
// under the id content/dailies.js dailyScenarioIdOf gives the date on every attempt ('desk-<key>' or 'desk-weekend-<key>', its
// ANNIVERSARY_KEYS), so the page, the week ahead, the gate and the ladder all play it. The sim reads the overrides through the scenario only: the weather
// shares fix the day's type, and sim/dayplan.js reads `dayplan.incident` (no other scenario has one). The desk scenarios,
// app/game.js dailyStamp and every other date's daily are untouched.
//
// The account shows on the briefing, above its title (app/shell.js): what happened, when and where, as the source says it, with
// no number the source does not give. Then `echo`: what of it today's desk echoes, plainly where the desk differs (Loy Yang's
// battery catches far more than 2017's did). The account is at most 60 words; the box, with its head, the echo and the source,
// at most 65 (tests/anniversary.test.js). The end card's THIS REALLY HAPPENED cards (content/cards.js) say the same of Loy Yang
// A3 and Callide C, from the same sources.
//
// GATED is written by tools/daily-gen.js when it gates an anniversary's date: the build stamp and the variant's scenarioHash
// (sim/step.js) the date was gated under. tests/anniversary.test.js fails when a variant changes after its date was gated:
// run tools/daily-gen.js --dates for it, then tools/ladder.mjs --from D --to D (the stored par, F-8: content/ladder.js anniv
// holds each row to the variant it was made from). The account, the echo and the source are not in the variant (its name and
// year are): they change with no re-gate.

const ON_THIS_DAY = 'D-29: the anniversary\'s day, every attempt of the date';

export const ANNIVERSARIES = deepFreeze({
  // Loy Yang A3, 14 Dec 2017: a hot, settled day; the largest machine trips before dawn, and the night shift hands over the
  // battery's GUARD armed at 04:00 (the briefing's Watch for says so; the watch, the respond card and the moment name it as the
  // night shift's until the player sets the ring: app/game.js nightGuard). Today's battery catches most of the trip, as 2017's
  // could not: the echo says so, so the account's lesson (coal did the work) is not turned around in play
  20261214: {name: 'Loy Yang A3', year: 2017,
    account: 'Early on 14 December 2017, Loy Yang A3 in Victoria tripped, losing about 550 MW. South Australia\'s big battery ' +
      'jumped in fast, with under a sixtieth of that; old coal units did most of the work.',
    echo: 'Today\'s desk echoes the trip, not the catch: your battery is far bigger than 2017\'s.',
    source: 'https://wattclarity.com.au/articles/2018/03/fcas-in-action-what-happens-when-a-generator-trips/', sourceName: 'WattClarity',
    overrides: {
      weather: {src: ON_THIS_DAY + ': hot and settled (no heatwave, storm or wind drought)', heatShare: 0, stormShare: 0, droughtShare: 0, mildShare: 0},
      commitment: {src: 'The desk\'s 04:00 commitment (CCGT 2 off overnight, §9.1 Q-18) with the battery\'s GUARD armed at 200 MW by ' +
        'the night shift (D-29: a battery\'s fast catch, far larger than 2017\'s): simplified.', battery: {guardMW: 200}},
      dayplan: {act2: {mix: {front: 1, unit: 0, smelter: 0, tie: 0}}, incident: {early: {windowH: [5.25, 6], lockoutMin: [90, 150]}}},
    }},
  // The Moorabool towers, 13 Feb 2024: a hot Saturday with a storm; in it the lines come down (the tie limited) and a machine
  // trips. The belly's crisis is a cloud front, never a trip: a trip there would keep the towers' 90 real s away (Q-72)
  20270213: {name: 'Moorabool towers', year: 2024,
    account: 'On the afternoon of 13 February 2024, severe storms in Victoria brought down six towers on the two 500 kV lines from Moorabool ' +
      'to Sydenham. All four Loy Yang A units disconnected, about 2,690 MW of generation was lost, and 300 MW of load was shed to protect ' +
      'the lines still in service.',
    echo: 'Today\'s desk echoes it.',
    source: 'https://aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2024/preliminary-report---loss-of-moorabool---sydenham-500-kv-lines-on-13-feb-2024.pdf',
    sourceName: 'AEMO',
    overrides: {
      weather: {src: ON_THIS_DAY + ': hot, with a storm', heatShare: 0, stormShare: 1, droughtShare: 0, mildShare: 0},
      dayplan: {act2: {mix: {front: 1, unit: 0, smelter: 0, tie: 0}}, act3: {storm: {linkTripP: 0}},
        incident: {towers: {limitMW: 400, lockoutMin: [90, 150]}}},
    }},
  // Callide C, 25 May 2021: a mild autumn weekday; the evening's trip of the largest machine takes the next largest with it five
  // grid minutes later (D-9 softened it: a minute later, par fell into the relays on all six attempts tried)
  20270525: {name: 'Callide C', year: 2021,
    account: 'On the afternoon of 25 May 2021, a failure at Callide C power station in central Queensland set off trips across the ' +
      'state. Frequency fell to 48.53 Hz, and automatic relays shed 1,308 MW of load.',
    echo: 'Today\'s desk echoes it.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2021/trip-of-multiple-generators-and-lines-in-qld-and-associated-under-frequency-load-shedding.pdf',
    sourceName: 'AEMO',
    overrides: {
      weather: {src: ON_THIS_DAY + ': mild and settled', heatShare: 0, stormShare: 0, droughtShare: 0, mildShare: 1},
      dayplan: {incident: {follow: {act: 3, afterS: 300, lockoutMin: [90, 150]}}},
    }},
});

/** The anniversary of a YYYYMMDD, or null. */
export const anniversaryOf = ymd => (Object.hasOwn(ANNIVERSARIES, ymd) ? ANNIVERSARIES[ymd] : null);

/** Written by tools/daily-gen.js: {v: the dailies' stamp, hashes: {YYYYMMDD: the variant's scenarioHash}} when each was gated. */
export const GATED = {v: 'v4-core-2d.0|2010181300|1748646610', hashes: {20261214: 1740361102, 20270213: 832125625, 20270525: 3868733141}};

function deepFreeze(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}
