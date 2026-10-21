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
  // W9 (2026-10-21): five more, each account read in its source that day. Victoria, 25 Jan 2019: a heatwave with coal 4 out at
  // 04:00 and all day. D-9 softened it: the source's "up to 1,600 MW" would be two of the desk's 650-MW units, and with two out
  // par was short of supply on all 41 attempts (as on June 2022's)
  20270125: {name: 'Victorian heatwave', year: 2019,
    account: 'On Friday 25 January 2019, record-breaking heat in Victoria coincided with the loss of up to 1,600 MW of thermal ' +
      'generation. AEMO called on emergency reserves, but load shedding still affected more than 200,000 Victorian ' +
      'consumers across two hours.',
    echo: 'Today\'s desk, softened: a heatwave with one coal unit out all day.',
    source: 'https://www.aemo.com.au/Newsroom/Media-Release/AEMO-summer-operations-event-report', sourceName: 'AEMO',
    overrides: {
      weather: {src: ON_THIS_DAY + ': a heatwave', heatShare: 1, stormShare: 0, droughtShare: 0, mildShare: 0},
      commitment: {src: 'D-29, Victoria 2019: the desk\'s 04:00 commitment with coal 4 out (a forced outage) and the rest run ' +
        'harder overnight to cover it: simplified.', units: {coal1: 600, coal2: 600, coal3: 600, coal4: null, ccgt1: 520, hydro1: 200, hydro2: 200}},
      dayplan: {incident: {outages: {units: ['coal4']}}},
    }},
  // Melbourne, 30 Jan 2009: a heatwave Saturday; two 500 kV lines fail at the report's minutes (14:12, 17:01). The desk has one
  // tie, so each failure is a tighter import limit until the day's end
  20270130: {name: 'Melbourne heatwave', year: 2009,
    account: 'On 30 January 2009, in Victoria\'s heat above 40 °C, the South Morang to Keilor 500 kV line went out at 14:12, ' +
      'and a second South Morang 500 kV line failed at 17:01. NEMMCO instructed shedding of up to 1,200 MW in western Melbourne.',
    echo: 'Today\'s desk echoes it in the tie: each failure cuts your imports.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/market_event_reports/archive/180-0091-pdf.pdf',
    sourceName: 'NEMMCO',
    overrides: {
      weather: {src: ON_THIS_DAY + ': a heatwave', heatShare: 1, stormShare: 0, droughtShare: 0, mildShare: 0},
      dayplan: {incident: {lines: {steps: [{atH: 14.2, limitMW: 450}, {atH: 17 + 1 / 60, limitMW: 150}]}}},
    }},
  // Heywood, 31 Jan 2020: a hot Sunday with a storm; in it the tie trips and stays out for the rest of the day (South Australia
  // was an island for 17 days)
  20270131: {name: 'Heywood separation', year: 2020,
    account: 'At about 13:24 on 31 January 2020, thunderstorm winds brought down transmission towers on two 500 kV lines in ' +
      'Victoria. South Australia was cut off from Victoria and ran as an island until 17 February, the longest ' +
      'separation of the two networks.',
    echo: 'Today\'s desk: in the storm your tie trips, out for the rest of the day.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2020/final-report-vic-sa-separation-31-jan--2020.pdf',
    sourceName: 'AEMO',
    overrides: {
      weather: {src: ON_THIS_DAY + ': hot, with a storm', heatShare: 0, stormShare: 1, droughtShare: 0, mildShare: 0},
      dayplan: {act2: {mix: {front: 1, unit: 0, smelter: 0, tie: 0}}, act3: {storm: {linkTripP: 0}},
        incident: {separation: {cause: 'storm', restOfDay: true}}},
    }},
  // The market suspension, 15 Jun 2022: a cold Tuesday with low wind and a coal unit out all day (W8's June day). The desk
  // has no market to suspend: the echo says so
  20270615: {name: 'Market suspension', year: 2022,
    account: 'In June 2022, unit outages, low wind and solar output and high winter demand made running the market under its ' +
      'rules impossible. With close to 5 GW under direction, AEMO suspended the spot market from 14:05 on 15 June. No ' +
      'customer load was shed.',
    echo: 'Today\'s desk: a coal unit out, low wind, a cold evening, and no market to suspend.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/market_event_reports/2022/nem-market-suspension-and-operational-challenges-in-june-2022.pdf',
    sourceName: 'AEMO',
    overrides: {
      weather: {src: ON_THIS_DAY + ': cold, with low wind', heatShare: 0, stormShare: 0, droughtShare: 1, mildShare: 0},
      commitment: {src: 'D-29, June 2022: the desk\'s 04:00 commitment with coal 4 out (a forced outage) and the rest run ' +
        'harder overnight to cover it: simplified.', units: {coal1: 600, coal2: 600, coal3: 600, coal4: null, ccgt1: 520, hydro1: 200, hydro2: 200}},
      dayplan: {incident: {outages: {units: ['coal4']}}},
    }},
  // QNI, 25 Aug 2018: a settled winter Wednesday; early in the afternoon the tie trips with no warning (lightning), and returns
  // after the usual 90-150 minutes. Act II keeps to a cloud front, so its own tie or unit event never sits beside it
  20270825: {name: 'QNI lightning', year: 2018,
    account: 'At 13:11 on 25 August 2018, both circuits joining Queensland to New South Wales tripped, with a flashover ' +
      'consistent with lightning. Queensland and South Australia were cut off, and relays shed load in New South Wales, ' +
      'Victoria and Tasmania. All load was back by 15:28.',
    echo: 'Today\'s desk: early in the afternoon your tie trips without warning.',
    source: 'https://www.aemo.com.au/-/media/Files/Electricity/NEM/Market_Notices_and_Events/Power_System_Incident_Reports/2018/Preliminary-report-Qld-SA-System-Separation-25-August-2018.pdf',
    sourceName: 'AEMO',
    overrides: {
      weather: {src: ON_THIS_DAY + ': settled (no heatwave, storm or wind drought)', heatShare: 0, stormShare: 0, droughtShare: 0},
      dayplan: {act2: {mix: {front: 1, unit: 0, smelter: 0, tie: 0}},
        incident: {separation: {cause: 'lightning', windowH: [13, 13.5], lockoutMin: [90, 150]}}},
    }},
});

/** The anniversary of a YYYYMMDD, or null. */
export const anniversaryOf = ymd => (Object.hasOwn(ANNIVERSARIES, ymd) ? ANNIVERSARIES[ymd] : null);

// W6, D-29 and S-7: SA 2016, the practice shelf's first Hard day (app/shelf.js hardDays), never a daily. Its account shows on the
// briefing as an anniversary's does (app/game.js anniversaryFor), headed THIS REALLY HAPPENED, not ON THIS DAY: it has no date
// (app/shell.js ACCOUNT_HEAD). Its scenario, 'desk-' + key, is DESK with these overrides (content/scenarios.js SA2016_SCENARIO),
// and it is played from its own seed, attempt 1 of its date (seedOf(20160928, 1)), so it is never that date's day (app/game.js
// scenarioForSeed, dailyYmd). Not gated (D-9): par sheds on it, so it is graded on par's outage-free part (S-7). The source is
// the 'black' card's (content/cards.js), from the same report. Its card carries HARD DAY, not ANNIVERSARY: it is played on any
// date.
//
// A mild spring weekday with a storm (in SA it was a Wednesday in September). The storm arrives between 17:00 and 18:00
// (16:18 there, about two hours before sunset; the desk's sun sets at 19:48); 10-20 minutes later its cut-out takes the wind
// towards 5%, with the fast wind (revertPerMin) most of it in two grid minutes, and 10 grid s after it the tie, carrying the
// cheap afternoon's import, trips (dayplan.incident.cascade, sim/dayplan.js): a fall no plan built for one trip at a time
// rides out. There the frequency fell too fast for the relays and the state went black; here it falls slowly enough for
// UFLS to shed (the 'black' card says what GRIDWATCH simplifies). The day's other crisis is the belly's front. The echo names
// both differences: the desk's notice says the turbines cut out in the storm, where the wind farms' protection cut them, and
// the relays have time to shed.
// *Measured* once (2026-10-17, v4-core-2d.0, seed 120160928): the storm arrives at 17:11, its cut-out and the tie's trip at
// 17:30 and 17:30:10, it passes at 19:31, and the tie is back at 20:49. Par (sim/autopilot.js runPar) lost 492 MW of import at
// the trip, fell to 48.91 Hz and shed 359 MWh (UFLS stage 1, 205 MWh; directed, 154), every district relit by 18:20, never
// black. The page's no-input day (app/game.js, the system dispatching, nobody starting a unit or relighting a street) lost
// 363 MW there, fell to 48.94 Hz (UFLS stage 1), was 15,537 MWh dark by 04:00 and never went black. tests/sa2016.test.js
// runs par to two grid minutes after the trip. It can be beaten: par's own moves with the tie held at 0 MW from 17:00 shed
// nothing (measured once in review, 2026-10-17), so a Hard day's words say that par sheds, never that no plan keeps every
// light on (S-7, app/endcard.js).
export const SA2016 = deepFreeze({seed: 120160928, key: 'sa2016', name: 'SA black system', year: 2016,
  account: 'On the afternoon of 28 September 2016, tornadoes brought down transmission towers in South Australia. As the lines ' +
    'faulted, wind farms\' protection cut their output, and the link to Victoria overloaded and tripped. Frequency fell too fast ' +
    'for load shedding, and the state went black.',
  echo: 'Here a storm\'s cut-out replaces the protection, and your relays have time to shed.',
  source: 'https://www.aemo.com.au/-/media/Files/Electricity/NEM/Market_Notices_and_Events/Power_System_Incident_Reports/2017/Integrated-Final-Report-SA-Black-System-28-September-2016.pdf',
  sourceName: 'AEMO',
  overrides: {
    weather: {src: 'D-29, S-7: SA 2016\'s day, a mild spring day with a storm (no heatwave or wind drought)', heatShare: 0, stormShare: 1,
      droughtShare: 0, mildShare: 1},
    wind: {src: 'The classic wind (legacy index.html L306, L452) with a fast revert, game tuning (D-29, SA 2016: the wind follows the ' +
      'storm within minutes, so the cut-out takes most of the wind in two grid minutes, as the wind farms\' protection did in seconds)',
    revertPerMin: 0.6},
    tie: {note: 'P-6 / J-14 with SA 2016\'s neighbour (D-29): cheap through the afternoon and evening, so the tie imports when the storm ' +
      'comes, as SA was importing from Victoria that day. Values are game tuning.',
    neighbourPrice: [[0, 45], [4, 40], [6, 50], [7, 60], [9, 40], [11, 10], [13, 5], [15, 20], [17, 40], [18.5, 55], [20, 50], [22, 45], [24, 45]]},
    dayplan: {act2: {mix: {front: 1, unit: 0, smelter: 0, tie: 0}},
      act3: {storm: {arriveH: [17, 18], cutoutAfterMin: [10, 20], cutoutMu: 0.05, linkTripP: 0}},
      incident: {cascade: {afterS: 10, lockoutMin: [180, 240]}}},
  }});

/** Written by tools/daily-gen.js: {v: the dailies' stamp, hashes: {YYYYMMDD: the variant's scenarioHash}} when each was gated. */
export const GATED = {v: 'v4-core-2d.0|2010181300|1748646610|3131276438', hashes: {20261214: 1740361102, 20270125: 1227152058, 20270130: 3668823352, 20270131: 53523633, 20270213: 832125625, 20270525: 421652195, 20270615: 2798029781, 20270825: 1180989165}};

function deepFreeze(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}
