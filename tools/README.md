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

## Files

| File | What it is |
|---|---|
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
