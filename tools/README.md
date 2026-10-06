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
```

`tools/par.js --scenario desk | desk-weekend` measures the game's own days (rooftop PV, day
types; Phase 2a): each row carries the day type, the minimum operational demand, the hours at a
negative price, the MWh spilled, the peak frequency, the highest MSL level and rule 4's coal
stops, and the summary groups them by day type. `--probe` trips both credible contingencies in a
copy of each SECURE state (H-8), as the baseline does on the classic day; `--rows FILE` writes
every row as a JSON line. `tools/baseline-v4.js` and its golden stay on the classic day, which
has no rooftop PV: it is the regression anchor.

`tools/follow.mjs` runs the hint-following player (`tests/lib/follow.js`: a day in which the
only inputs are the ones the objective line proposes) over a seed range, with par's day beside
it: unserved energy, cost by key, the battery at 16:30, and for each STOP line it followed the
saving the line quoted against the realised difference. `--no-follow` is the day with no input
at all, which must fail.

`tools/baseline-v4.js` (Exit Phase 0) prints four sections: fixed probes (physics, the H-7
desk-lab midday case, STOP, the import step at 13:00 and 18:30, rate invariance through
`app/loop.js`, watch lock, heat share), statistics over the seed range (S-12, H-8 containment,
prices, battery, the lean, competent, planOnly and commitAll proxies graded against par, S-11,
S-2's correlation, F-3), one row per seed
(each row depends only on its seed and ends with the day's `hashState`), and machine-dependent
lines. `tests/baseline-v4.test.js` plays par's day on seed 4 in-process and compares it with that
seed's golden row, hash included. The whole report is run on demand (`npm run baseline:v4`); there
is no slow test tier (SPEC Q-40). `--help` lists the flags.

## Files

| File | What it is |
|---|---|
| `par.js` | v4 par and the proxies over seeds (S-4, S-5, S-11, S-12, S-14) on any scenario; `-j N` forks workers. Exports `grade()`. |
| `follow.mjs` | The hint-following player over seeds, against par (SPEC §9.1 Q-18; desk/README.md §21.4). An ES module. |
| `perf.mjs`, `shot-receiver.mjs` | F-11 headless measurements; the PNG receiver for visual QA (SPEC §10). |
| `baseline-v4.js` | The v4 baseline above; `baseline-v4.golden.md` is its committed output. |
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
