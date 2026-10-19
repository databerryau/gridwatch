# tools/

Developer tools for measuring the game headless in Node. They are not loaded by the game
(GitHub Pages serves every file in the repo, but nothing in `index.html` references these).
No dependencies; Node 18 or newer.

## Run the baseline

From the repo root:

```
node tools/baseline.js          # seeds 1-100, about 1-2 minutes
node tools/baseline.js 20       # quick check, seeds 1-20
```

It prints a markdown report of the current build: grades by weather class, median time in
the frequency band, mean unserved energy, blackout times, how many days are short even on
an optimistic supply bound, a reference contingency (one coal machine trips at 04:00), how
often the grade is already settled at 21:00, a determinism check and the sim cost per tick.

To measure a patched copy instead of `index.html`:

```
GRIDWATCH_HTML=path/to/copy.html node tools/baseline.js
```

Results are deterministic for a given build, seed range and policy: each harness instance
has its own seeded random-number generator. Only section 5 (timings) varies by machine.

## The v4 core (`sim/`)

```
node tools/par.js --seed 7              # par (S-4) on one seed, with its discrete actions
node tools/par.js --seeds 1-200 -j 11   # S-12 over 200 raw seeds on 11 worker processes
node tools/par.js --heat 100 -j 11      # the first 100 forced-heatwave seeds
node tools/par.js --scenario desk --seeds 1-200 -j 11 --probe --quiet   # the game's day, by day type (Phase 2a)
node tools/follow.mjs --scenario desk-weekend --seeds 1-11 --lines      # the hint-following player, par beside it
node tools/baseline-v4.js               # the SPEC §6 rows for the v4 core, ~5 min on 11 workers
node tools/baseline-v4.js --quick       # section 1 plus par on seeds 1-2, ~10 s
npm run golden:v4                       # re-record tools/baseline-v4.golden.md
npm run golden:v4 -- --check            # compare with it instead (~5 min; add --quick for ~15 s)
npm run verify                          # W7 Q15: after a SIM_VERSION change, replay par on every daily; restamp if nothing moved
node tools/daily-gen.js --from 2026-10-12 --days 365 -j 8   # D-9: gate the dailies, write content/dailies.js
node tools/daily-gen.js --check -j 8    # re-gate the shipped list under this build (no write)
node tools/ladder.mjs -j 6              # W6 Y-11: the ladder (did nothing, lean, competent vs par) on every daily, after daily-gen (~20 min)
node tools/og-image.mjs                 # W6 Y-8: draw og.png, the 1200x630 link preview
node tools/day-measure.mjs --from 2026-10-12 --days 100 -j 8  # D-10 per act, the Q-77 returning player
node tools/par.js --scenario desk --seeds 1-100 -j 8 --proxy competent,slow --allin   # §32.10: the slow proxy beside competent
node tools/d6.mjs 20261012              # D-6: one input log at 1x, with F held and with 50 pauses: one hash (~30 s)
node tools/l2.mjs --scenario desk --seeds 1-100                 # L-2: the forecast's P10-P90 coverage at 1 h and 4 h
```

`tools/d6.mjs` (2c, desk/README.md §32.10) is D-6's whole-day replay: one date through the real
page (`tests/lib/play.js openGame`), par's discrete actions to 21:00 sent through the page's actions
at par's ticks, played at the profile (1x), with F held throughout (pressed again whenever the
director could play FAST and does not) and with 50 seeded random pauses; it prints the three
end-of-day `hashState` values and MATCH or DIFFER (exit 1); every feeder card is gone on from (Esc),
so the log stays par's. `tools/par.js --proxy slow` is §32.10's 'slow' proxy: competent, but each
feeder card holds the clock 15 real s (Q-91: the player reads it that long, at zero grid time, then
restores). From stage C (Q-88) par and every proxy ask rule 9 first while a task feeder's RESTORE
window is open (its allowed second to `RESTORE_PACE_MAX_S` later).
`tools/l2.mjs --scenario desk-weekend` prints desk's numbers exactly, and rightly: the weekend's
factor scales the forecast and the realised demand alike, and the errors and the band are in MW.

`tools/daily-gen.js` (2c, desk/README.md Q-75) plays par on each date's candidates (attempt k is
`YYYYMMDD + k x 10^8`, the date's scenario, the same class as attempt 0) and keeps the first that
passes D-9's gate along par's day: the optimistic bound (plus air-con at rated MW in its window)
never below demand before booked flex, and `market.isClean`. It writes the exceptions to
`content/dailies.js` under the build stamp (`app/game.js dailyStamp()`), fails loudly when a
date has no passing attempt by k = 40 (and writes nothing), and reports the attempts, the class
shares, the Hard-day pool, D-10 by class and the wall and single-core times. A par day is about
2-2.5 s here, so 365 dates are about 15 min on one core. `tools/day-measure.mjs` holds D-10's
pure gap function (`tests/gaps.test.js`) and the returning-player proxy of Q-77.

`tools/par.js --scenario desk | desk-weekend` measures the game's own days (rooftop PV, day
types; Phase 2a): each row carries the day type, the minimum operational demand, the hours at a
negative price, the MWh spilled, the peak frequency, the highest MSL level and rule 4's coal
stops, and the summary groups them by day type. `--probe` trips both credible contingencies in a
copy of each SECURE state (H-8), as the baseline does on the classic day; `--rows FILE` writes
every row as a JSON line. From 2b (desk/README.md §31.6) each row also carries `soakDays` and
`airconDays` (1 when the proxy booked any block of that lever), `soakMWh` and `reliefMWh` (the
booked cores' energy, effMW × (block length − FLEX_RAMP_S), not metered) and `flexDollars`
(`score.cost.flex`); the summary adds their totals and a "soak / air-con days" column by day
type. From 2c (desk/README.md §32.7.1) a clean day is `market.isClean` (a task feeder's lag never
makes a day unclean), each row carries the restore task's `taskMWh`, `heldMWh` and `lateMWh` and
S-6's PERFECT, the weather column is the regime's class (heat, storm, drought, calm on the game's
days), and `actions` counts the log's rule origins (the night memo's from 21:00 as
`nightActions`). `tools/baseline-v4.js` and its golden stay on the classic day, which has no rooftop PV: it
is the regression anchor.

`tools/follow.mjs` runs the hint-following player (`tests/lib/follow.js`: a day in which the
only inputs are the ones the objective line proposes) over a seed range, with par's day beside
it: unserved energy, cost by key, the battery at 16:30, and for each STOP line it followed the
saving the line quoted against the realised difference. Since 2b it also counts the soaks and
air-con cycles the player booked and gives the day's ALL-IN beside par's, with the points
(1000 × par's ÷ yours) and, per day type, the days soaked or cycled and the median points
(desk/README.md §31.10 item 3). `--no-follow` is the day with no input at all, which must fail.

`tools/baseline-v4.js` (Exit Phase 0) prints four sections: fixed probes (physics, the H-7
desk-lab midday case, STOP, the import step at 13:00 and 18:30, rate invariance through
`app/loop.js`, watch lock, heat share), statistics over the seed range (S-12, H-8 containment,
prices, battery, the lean, competent, planOnly and commitAll proxies graded against par, S-11,
S-2's correlation, F-3), one row per seed
(each row depends only on its seed and ends with the day's `hashState`), and machine-dependent
lines. The whole report is run on demand (`npm run baseline:v4`); there is no slow test tier (SPEC
Q-40). `--help` lists the flags. Since W7 (Q15) the golden is a tool check, not a test: a SIM_VERSION
change no longer needs it re-recorded. `npm run golden:v4 -- --check` runs the report and compares it
with the golden instead of writing it (exit 1 on a difference): section 1 line for line, each
section 3 row by its table and seed (so `--check --quick` compares par's rows on seeds 1-2), and
with the golden's own flags sections 1-3 whole; never the Build line or section 4.
`tests/par-classic.test.js` still plays par's day on seed 4 for what holds on any build (S-4's pace,
D-9's runtime, H-8's containment, H-4's alarm agreement), and `tests/par-guard.test.js` plays a
daily's par day against the selftest's golden hours, so the suite still catches a change to par's
day made without a SIM_VERSION change.

## Verify, then restamp (`verify.mjs`)

```
npm run verify                                 # replay and compare; restamp the four files when everything matches
node tools/verify.mjs --check -j 4             # compare only (CI: .github/workflows/verify.yml)
node tools/verify.mjs --dates 2026-10-16,2027-02-13   # these dates only (never writes)
node tools/verify.mjs --players 1              # the scripted players on every date too (the whole ladder, ~4x the time)
```

W7 (Q15; decisions/2026-10-16-open-questions.md §15, option 2). A SIM_VERSION change (or a desk
scenario's) makes the dailies' stamp (`app/game.js dailyStamp`) stale in content/dailies.js,
content/ladder.js, content/anniversaries.js GATED and content/selftest.js, and the stale-stamp tests
fail. Making the four again costs 25-40 minutes; most changes move nothing they store. The verify
replays, under this build, on worker processes: par's day on every listed daily (its listed attempt,
an anniversary under its variant) through `runPar`, the run the ladder and the page's stored par
take, against the date's ladder row (ALL-IN total and shed MWh); D-9's gate along that same run
(daily-gen's bound and gate each grid minute, the anniversary's incident, attempt k's class); the
ladder's scripted players (the no-input day, lean, competent) on every 8th date, the anniversaries
and the selftest's dates (`--players N`); every selftest case through the page's own runner (each
hourly hash, the end, par's ALL-IN) and so the ladder's 14:00 check; and the anniversaries' variant
hashes. When everything matches it rewrites only the stamps, each file through the writer that made
it (the new text differs by the stamp alone; a file its writer would not give back is refused). When
anything differs it writes nothing, prints each date and field that differs (and says so when only
state hashes moved), and prints the full regeneration: `tools/daily-gen.js`, then `tools/ladder.mjs`,
then `tools/selftest-gen.mjs`. Not checked: the attempts before a listed one (a regeneration may pick
an earlier attempt that now passes; the listed one still passes D-9), the scripted players off the
sample, daily-gen's D-10 and Hard-day pool, and the classic golden. CI runs `--check` on pushes that
touch sim/, the scenarios, the dailies' files or app/system.js, in a workflow of its own, so the
test job is not slowed.

## Play the real page, fast (`play.mjs`)

```
node tools/play.mjs 20261007 to=15:40 until=trip look real=5 diff key=Enter to=+30m diff
node tools/play.mjs 20261007 timeline=04:30-04:00/30m     # the whole day, every 30 min and every event (~8 s)
node tools/play.mjs 20261007 suburb=RED look press=city-RED-aircon press=city-RED-soak   # book ahead on a suburb's card at 04:30
node tools/play.mjs --help
```

`suburb=ID` opens a suburb's card as a map click does (`suburb(id)` in the library); `look`
shows it as a `SUBURB` line and its presses as CTRL lines: `city-<ID>-soak` and
`city-<ID>-aircon` (BOOK), `-earlier` / `-later` (◀ ▶), `-cancel-HHMM` (CANCEL a block),
`city-<ID>-restore`. Book ahead at 04:30 rather than jumping to the window (desk/README §31.9.12).

`tools/play.mjs` is the command line of `tests/lib/play.js` (`openGame()`): next.html booted with
every real module in the stand-in DOM, driven by jumps (`to`, `until`) that play the page's
frames without drawing them (~0.3 s per grid hour, stopping AT the tick a trip, the card, a mode
change, a notice or a new line begins), drawn frames where they matter (`real=5` in the watch),
clicks and keys, and `look`: what the player sees, as text. `press=ID` (`press()` in the
library) samples a press the way the owner asked (SPEC Q-40): a look before, one on the press
frame and one 0.5 real s after. Use it (not hand-written frame-by-frame loops: ~3-5 ms per
frame, minutes per playthrough) to check a fix in play.

## Run only the tests a change affects (`changed-tests.mjs`)

```
npm run test:changed                         # this branch and uncommitted work, against main
node tools/changed-tests.mjs --list          # which test files, without running them
node tools/changed-tests.mjs desk/dial.js    # the tests that depend on these files
```

It reads each test file's imports (through `tests/lib/` and the game's modules) and the repo
paths it names, and runs the tests that depend on something changed. The whole suite
(`node --test`) runs once before a merge, and in CI. See `CLAUDE.md`.

## Check the test budget (`slow-tests.mjs`)

```
npm run test:slow                            # every tests/*.test.js alone, 4 at once: the slowest files and tests
node tools/slow-tests.mjs -j 2 --top 20      # 2 at once, the slowest 20
node tools/slow-tests.mjs tests/desk.test.js # these files only
node tools/slow-tests.mjs --json times.json  # every file's and test's seconds, for a before/after
```

CLAUDE.md's budget: a test file takes 6 s or less run alone, a test 2.5 s or less, on the owner's
laptop. Each file runs alone through node:test's `run()`; an offender is timed again with nothing
beside it. The budgets are scaled by the CPU yardstick of `tests/lib/speed.js` (D-9's), so a slower
machine is not an offender (`--raw`: the budgets as written). The yardstick is read before the run, after
it and before each file timed again alone, and the fastest reading scales, so a busy moment does not
loosen the budgets; a file or test within them but over the budget as written is still marked "over as
written", and the verdict names it. Each file's CPU time is shown beside
its wall: a wall far over the CPU says the machine was busy, and the report says so. CI runs it
after `node --test` and prints a GitHub warning for each offender; it never fails the build.
(Not `test-times.mjs`: `node --test` runs any `test-*.mjs` as a test file.)

## Files

| File | What it is |
|---|---|
| `play.mjs` | Plays next.html headless and fast; prints what the player sees (`tests/lib/play.js`). An ES module. |
| `d6.mjs` | D-6's whole-day replay through the real page: one input log at 1x, F held and 50 pauses, one hash (2c). An ES module. |
| `changed-tests.mjs` | Runs only the test files a change can affect (`npm run test:changed`). An ES module. |
| `slow-tests.mjs` | Times each test file alone against CLAUDE.md's budget; warns in CI (`npm run test:slow`). An ES module. |
| `par.js` | v4 par and the proxies over seeds (S-4, S-5, S-11, S-12, S-14) on any scenario; `-j N` forks workers. Exports `grade()`. |
| `follow.mjs` | The hint-following player over seeds, against par (SPEC §9.1 Q-18; desk/README.md §21.4). An ES module. |
| `perf.mjs`, `shot-receiver.mjs` | F-11 headless measurements; the PNG receiver for visual QA (SPEC §10). |
| `baseline-v4.js` | The v4 baseline above; `baseline-v4.golden.md` is its committed output (`--check` compares with it). |
| `verify.mjs` | W7 Q15: replays par on every daily against the stored lists and restamps them when nothing moved (`npm run verify`). An ES module. |
| `harness.js` | Loads the inline `<script>` of `index.html` with a stub page and a seeded `Math.random`. `load({seed, file})` returns a game instance `G`; `G.runToEnd(policy)` plays a whole shift and returns `{black, grade, money, cmp, unserved, co2, worstDev, maxPrice, outT, t, endClock}`. Also exports `gradeOf(S, black)` and `weatherClass(G)`. `node tools/harness.js` runs a 5-seed smoke test. |
| `policies.js` | Scripted players: `doNothing`, `reactiveOnly`, `competent` (the best preset from the balance review, reading only what the screen shows; see `observe()`), `competentClassic` (the review's reference policy), and the configurable `ctl(cfg)`. |
| `baseline.js` | Runs the policies over seeds and prints the report. |
| `package.json` | Pins `tools/` to CommonJS so these scripts keep working if the repo root later adds `"type": "module"` for the v4 ES-module sim. No dependencies. |

## Writing a policy

A policy is a function called before every tick (100 ms real, 0.2 sim-minutes):

```js
const {load} = require('./harness.js');
const G = load({seed: 7});
const r = G.runToEnd(G => {
  if (G.hourNow() > 15 && !G.FU.gta.on) G.startUnit('gta');
  G.FU.hyd.set = 600;
});
console.log(r.grade, r.unserved);
```

Act only through the levers a player has (unit `set`, `G.startUnit`, `G.stopUnit`,
`G.callDR`, `G.toggleDiesel`, `S.ic.set`, `S.batt.set`, `S.wCurt`, `S.sCurt`), and read only
what the screen shows (see the list above `observe()` in `policies.js`). A policy that
reads hidden state (`S.windMu`, `S.cloudMu`, `u.hot`, `S.ev`) is measuring the dice, not play.
