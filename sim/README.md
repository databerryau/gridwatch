# sim/: the v4 simulation core (contract)

This is the contract for Phase 0.2 (SPEC.md §5, "0.2 — The v4 core"). Stage A (the architect)
wrote it with `params.js`, `rng.js`, `fleet.js`, the pre-roll half of `weather.js` and
`events.js`, `step.js` and the tests. Stage B agents implement the rest **in parallel, one file
set each**, against this document. When this document and a JSDoc comment disagree, this document
wins. Change it only on purpose, and say so in the PR.

The legacy game (`index.html`, v2.0 + Phase 0.1) is frozen and untouched. v4 is new files only.

**Phase 1a** (`v4-core-1a.0`, desk/README.md §3) added the plan in state and its executor, the
plan, scope and sync inputs, the K-12 synchroscope, DIRECT SHED's gate and N-1 over both credible
contingencies; the sections below say so where they changed, and §12 "Phase 1a" lists what was
built, the deviations from desk/README.md §3 and the measurements.

---

## 1. Module map, ownership and the parallel plan

Stage B runs in two waves.

**Wave 1: four agents in parallel.** Each edits only the files in its row, its own block in
`params.js` (§2 rule 3) and its own test file(s). Nobody else edits them.

| Owner | Files it writes | Its tests | Spec |
|---|---|---|---|
| **physics** | `sim/physics.js` | `tests/physics.test.js` | H-8, H-6, H-7, H-10, K-5, K-10, K-11, F-4 |
| **grid** | `sim/grid.js` | `tests/grid.test.js` | F-2 (1-s update), H-1, H-2, H-4, H-10, H-11, K-1, K-2, K-3, K-5..K-7, K-12/K-13 stubs, S-11 |
| **market + events** | `sim/market.js` (not `scoreSummary`), `events.applyDue` in `sim/events.js`, `weather.forecast` in `sim/weather.js` | `tests/market.test.js`, `tests/events.test.js` | P-5..P-8, H-5, H-9, H-12, S-1..S-3, F-3, L-2, S-4 (forecast) |
| **autopilot** | `sim/autopilot.js`, `tools/par.js` | `tests/autopilot.test.js` | L-0, S-4, S-11, S-12, P-6, D-2 (reference pace), D-9 budget |

**Wave 2: integration, after wave 1 merges.** Keeps `sim/step.js`; builds `next.html`
(bench: strip chart + one slider per unit), `app/loop.js` (F-5), `content/text.js` (H-14,
`tests/text.test.js`) and `tools/baseline-v4.js` (Exit Phase 0); owns `tests/integration.test.js`;
bumps `SIM_VERSION` (only integration does); tunes values (S-12).

**Frozen after stage A** (edit only through a README change): `sim/params.js` (except the
four stage B blocks; values change only in integration's tuning), `sim/rng.js`, `sim/fleet.js`,
the pre-roll half of `weather.js` and `events.js`, `content/scenarios.js` (values: tuning only),
`tests/lib/*` (the review-fix pass added `tests/lib/speed.js`, the CPU yardstick for the D-9 and
tick budgets, as a new file), and stage A's tests (`sim-lint`, `params`,
`rng`, `state`, `fleet`), which must stay green.

Test files hold stage B acceptance tests as `test(name, {todo}, body)` with real bodies; the
owner removes `todo` as each passes. F-10 keeps the whole `node --test` run under 60 s (the
legacy baseline alone takes ~23 s), so multi-seed statistics over whole days (S-12, S-11, P-6,
H-8 containment over 1,000 states, L-2 coverage, F-2 over 100 days) run only with
`GRIDWATCH_SLOW=1` (`npm run test:slow`; `slowOnly()` in `tests/lib/sim-helpers.js`) and in
`tools/par.js`. A pending slow test is `{...TODO, ...slowOnly()}`: slowOnly only skips, so once
the owner removes TODO a slow failure is a failure.

Cross-module calls (the only ones allowed):

```
step.js      -> weather, events, fleet, physics, grid, market, rng
grid.js      -> fleet, physics.previewTrip, params, rng (play stream), weather (readers)
events.js    -> fleet (tripUnit / tripTie / tripSmelter), params, rng
physics.js   -> fleet (operateUfls, setOfgsStage, setDistrictDark), params
market.js    -> fleet (startBlock, resetAcc), weather (readers), params
autopilot.js -> step (createState, step, observe, hashState), params   ONLY (S-4 barrier, linted)
weather.js   -> params, rng
fleet.js     -> params
```

No cycles except through `step.js` at run time. Stubs mean every import resolves today.

**New state fields.** `createState` (step.js) builds every field, and `hashState` and the
frozen `observe()` shape need no edits when state grows (§8, §9). If a wave-1 owner truly needs
a private field, it adds ONE line inside its own object in `createState` and a row in §5, and
says so in its PR; integration resolves the (one-line) merge. Prefer deriving from existing
fields (e.g. profile progress from `timerS`).

## 2. Rules for every file in sim/

1. **Pure and deterministic** (F-2, C-6). No `document`, `window`, `Date`, `performance`,
   `localStorage`, timers, network, `console`, `process`, `require`, `Math.random`, and no
   escapes to them: `globalThis`, `self`, `eval`, `Function`, `Intl`, `crypto`, `WeakRef`,
   `queueMicrotask`, `setImmediate`, `Math[...]`, `localeCompare`/`toLocale*`
   (`tests/sim-lint.test.js`). Output depends only on `SIM_VERSION`, seed, scenario, input log.
2. **No transcendental Math** anywhere in `sim/` (`sin cos tan exp log pow ...` and `**`):
   browsers may round them differently (risk 5). Use tables, polynomials, repeated
   multiplication. `Math.sqrt`, `Math.round/floor/ceil/min/max/abs/imul` are fine (exact).
3. **No numeric literals** outside `params.js` except `0, 1, 2, 50, 60` and an integer alone in
   brackets (`a[3]`) (`tests/params.test.js`). Every model constant is a record in
   `params.js` (`{value, unit, src}` or `{value, unit, simplified: true, note}`; §8.3 items also
   `unverified: true`; a value uncertain within a band also `range: [lo, hi]`, explained in its
   src or note). Stage B adds records ONLY between its own marker lines
   (`// ---- stage B "<owner>" block: begin` ... `end`) at the end of `P`. Read plain values
   from `V` and hoist them to module scope.
4. **State is plain JSON**: numbers (finite), strings, booleans, `null`, arrays, plain objects.
   No `undefined`, typed arrays, `Infinity`, `NaN`, class instances, Maps, or **shared
   references** (the same object reachable twice would split in two after a JSON round trip).
   Never create `-0` in state (JSON drops the sign): add `+ 0` where a product can be -0;
   `rng.quantise` does; hashState folds -0 and throws on non-JSON values.
5. **Write only the fields your module owns** (§5 "writer" column). Anything that trips,
   closes a breaker, sets a base point, moves a relay or darkens a district goes through
   `fleet.js`, so the invariants at the top of that file hold.
6. **No allocation in `physics.tick`** and nothing per tick that grows. The grid second may
   allocate small objects (it runs 86,400 times a day, not 4.32 M).
7. Field names carry units: `MW`, `MWh`, `MWs` (MW x s), `S` (grid seconds), `Hz`, `Pct`,
   `Frac`/`Pm` (per-mille). Grid seconds `s` count from 04:00:00 (`s = floor(tick / 50)`).
8. Plain ES modules, relative imports ending in `.js`, LF line endings, no dependencies.
9. **Every sort is a total order**: break ties by id or index (e.g. offer, then id), so no
   result depends on sort stability or on engine details.

## 3. Time: one clock, two integrators (C-7, F-4)

* **Tick** = `PHYS_DT` = 20 ms of grid time. `TICKS_PER_S` = 50. The sim day runs **04:00 to
  04:00**: `DAY_TICKS` = 4,320,000 ticks. `state.tick` is the only clock.
* **Physics integrator**: every tick (`physics.tick`), always, at every playback speed. There is
  no quasi-steady shortcut.
* **Grid integrator**: once per grid second, at the **start** of the second (`tick % 50 === 0`),
  before that tick's physics.
* **Playback rate is not a sim concept.** The app (`app/loop.js`, director) decides how many
  ticks to run per frame. Rates, pauses, the watch's slow motion and FAST never change physics:
  the same input log at 0.25x, 1x, 60x or 240x gives the same `hashState` (F-4, D-6).
* The desk opens at `PLAYER_START_H` (04:30; `V.PLAYER_START_S`, `V.PLAYER_START_TICK`). The
  app runs 04:00-04:30 headless during the briefing. AGC/HAND can be chosen only before it
  (D-7); par and the plan act from it.
* "Real seconds" exist only outside the sim: the AGC LIMIT tile's 5 real s (K-2) is applied by
  the app from `agc.atLimitS`; par's pace uses the **reference** playback (`REF_PROFILE`, D-2),
  whose hours are unwrapped (`DAY_START_H + s / 3600`, 4 to 28), never `hourOfDay`.

### step(state, inputs) - exact order

```
step(state, inputs = []):
  if state.over: return []                                   (shared frozen empty array)
  for each input, in order: applyInput(state, input, out)    (validate, apply, log; see §6)
  if state.tick % 50 === 0:                                  (grid second s = tick / 50)
      if state.tick > 0: market.settleSecond(state, out)     fold acc -> score, write state.last, reset acc
      events.applyDue(state, out)                            ext events with atS <= s (trips, weather, news)
      grid.planSecond(state, out)                            Phase 1a: the plan's booked stops, starts, keys, tie keys
      weather.sampleSecond(state)                            state.env for second s
      if s % MSL_CHECK_S === 0:                              Phase 2a (P-4): the MSL level, from ONE forecast per check
          events.mslSecond(state, weather.forecast(state, FC_HORIZON_S, FC_STEP_S), out)
      grid.unitsSecond(state, out)                           state machines, timers, derate, hot trips, lockouts
      grid.agcSecond(state, out)                             AGC trims (every AGC_CYCLE_S)
      grid.dispatchSecond(state, out)                        schedules move at ramps; battery, tie, renewables, RERT, DR
      grid.fosSecond(state, out)                             FOS timers, directed shedding, cold load, backInBand
      grid.securitySecond(state, out)                        R5, L, level; cached TRIP PREVIEW
      market.priceSecond(state, out)                         merit-order price
  if state.tick === state.scope.nextAutoTick:                Phase 1a: a syncAuto close due on this tick (K-12)
      grid.syncTick(state, out)
  physics.tick(state, out)                                   20 ms: frequency, governors, battery, relays, acc
  state.tick += 1
  if state.black or state.tick >= DAY_TICKS:
      market.settleSecond(state, out); state.over = true; out.push({kind: 'dayEnd'})
  return out (a copy) or the shared empty array
```

Within a second, everything the grid update sets (schedules, tie flow, renewables, RERT, DR,
env) is **constant**; physics adds the seconds-scale response (governors, battery PFR, guard,
load relief, relays) on top. Trips from ext events therefore land on a second boundary; the
first physics tick after them sees the new state. A loop that steps must stop on
`state.over` (step is a no-op after it).

The MSL check (Phase 2a; desk/README.md §21.1) sits directly after the weather, so it tests the
second's own demand and a tie or potline trip applied by `events.applyDue` in the same second;
the tie coming back (`grid.unitsSecond`, later in the second) shows at the next check. step.js
builds the forecast and hands it over, so `events.js` still imports nothing from `weather.js`.
On a scenario with no rooftop `mslSecond` returns at once.

## 4. Random streams (F-3)

`sim/rng.js`: counter-based `hash32(seed, stream, a, b = 0, c = 0)` (MurmurHash3 fmix32 chain),
`uniform` in [0, 1), `normal` (Irwin-Hall 12: exact arithmetic, mean 0, variance 1, +-6),
`pick`/`pickWith`, `quantise`. No state, no `Math.random`.

| Stream | Counters | Used for | When |
|---|---|---|---|
| `EXT_REGIME` | a = 0; a = 1 | a = 0: weather class (heat / storm / calm). a = 1 (Phase 2a; desk/README.md §18 C-2): the day's temperature type, MILD when `uniform < mildShare / (1 - heatShare)` and the class is not heat, else HOT; hidden as `ext.regime.temp` | createState |
| `EXT_EVENTS` | a = menu slot, b = draw number | event times, targets, lockouts | createState |
| `EXT_DEMAND` | a = minute sample | demand noise series | createState |
| `EXT_WIND` | a = minute sample | wind fraction series | createState |
| `EXT_CLOUD` | a = minute sample | utility-solar clearness series | createState |
| `EXT_FINE` | a = grid second | +-6 MW per-second demand wobble | on the fly in `sampleSecond` (a pure function of seed and second, so it is "pre-rolled" in effect) |
| `EXT_ROOFTOP` | a = 5-min sample; b = suburb index, and b = the number of suburbs for the shared regional sky | the rooftop skies (Phase 2a, P-2; desk/README.md C-5): `ext.rooftop`, per-suburb clearness = one regional series + a local term each (`normal` draws). Not drawn when the scenario has no rooftop | createState |
| `PLAY` | a = tick, b = unit index, c = draw | player-dependent outcomes: overheat trip (H-2: `uniform(seed, PLAY, tick, k)` at the grid second's tick, c = 0); K-12 sync slip (Phase 1a: at the tick the unit reaches 'ready' or is sent back there, c = 1 magnitude, 2 sign, 3 phase angle) | when the outcome is decided |

Ext draws never depend on play (C-6): the same seed gives the same weather, demand, events and
lockout times whatever anyone does. **Trip targets are rules, not dice**: "the largest online
machine by output" (`fleet.largestContingency`; ties to the lower index), "the station's
largest online machine", "the unit that ran hot". Ext series are quantised integers (MW,
per-mille) at `SERIES_STEP_S` = 60 s (the rooftop skies at `scn.rooftop.cloud.stepS` = 300 s:
six of them at one minute would break the 64-KB state limit); ext event args have at most 3
exact decimals (tested).
`fx` (cosmetic) randomness lives in `render/` and `audio/` only.

## 5. State shape

`createState(seed, scenario)` returns this object. Every field is written by exactly the
modules named. "A" = set by createState only, never changed after. "-" = nobody after createState.

### Top level

| Field | Type / unit | Writer | Meaning |
|---|---|---|---|
| `v` | string | A | `SIM_VERSION` |
| `seed` | u32 | A | the day's seed (hidden from `observe`) |
| `scenarioId` | string | A | e.g. `'classic'` |
| `tick` | int | step | physics ticks since 04:00:00 |
| `over` | bool | step | day finished (04:00 or black) |
| `black` | bool | physics | system black (H-7) |
| `scn` | object | A | the scenario's data (src/note keys stripped). Static; read-only |
| `scnHash` | u32 | A | `canonicalHash(scn)`: tells scenario variants apart in `hashState` |
| `ext` | object | A | the pre-rolled external world (below). Hidden; read-only |
| `evNext` | int | events | index of the next `ext.events` entry to apply |
| `day` | `{temp: 'MILD'\|'HOT', weekend: bool}` | A | the public kind of day (P-3): `temp` from the hidden `ext.regime.temp`, read once (a heatwave day reads `'HOT'`); `weekend` from `scn.day.weekend` (Phase 2a; desk/README.md §19.2) |
| `env` | object | weather | this second's external conditions (below) |
| `msl` | `{level, minMW, atS, sinceS}` | events (`mslSecond`) | P-4 notice level 0..3, the forecast minimum behind it and its time ("msl" below); `{0, 0, -1, -1}` for the whole day when the scenario has no rooftop (Phase 2a; desk/README.md §19.2) |
| `control` | `{mode: 'AGC'\|'HAND', modeLocked: bool}` | step (applyInput) | K-2 / D-7 |
| `stations` | array | fleet (derived) | one lever per station (below) |
| `units` | array | grid, physics, fleet | one entry per machine, `V.MACHINES` order |
| `battery`, `tie`, `ren`, `hydro`, `rert`, `dr`, `smelter` | objects | see below | |
| `city` | object | fleet, grid | districts, shed fraction, cold load |
| `ufls`, `ofgs`, `collapse` | objects | physics via fleet (grid re-arms / reconnects via fleet) | relays |
| `phys` | object | physics | frequency and the per-tick readouts |
| `acc` | object | physics (adds), grid (`startCost`), market (`fleet.resetAcc`) | this second's accumulators |
| `last` | object | market | summary of the last completed second |
| `agc`, `fos` | objects | grid | AGC, operating standard |
| `sec` | object | grid; `dirty` also fleet.setSync / tripTie and step.applyInput | security |
| `price` | object | market | this second's price |
| `score` | object | market | the operator scorecard |
| `conts` | array | fleet (append), physics (trace), grid (`backInBandTick`) | contingency records |
| `contIdx` | int | fleet | index of the latest contingency in `conts`, or -1 |
| `news` | array | events | announcements made so far (public) |
| `log` | array | step | accepted inputs `{tick, type, args}` (F-6) |
| `plan` | object | grid (inputs and `planSecond`) | Phase 1a: the plan in state (below) |
| `scope` | `{unit, nextAutoTick}` | grid | Phase 1a, K-12: the unit on the synchroscope ('' none); the tick of the next `syncAuto` close (-1 none; step() compares it every tick) |

### plan (Phase 1a; L-0, L-4, L-6, K-2; desk/README.md §3.1)

```
plan = {madeAtS,   // grid second of the last planLoad (-1: none yet)
        rev,       // +1 on every change (inputs, executed keys and bookings, pruning): a UI cache key
        stations: [{id, man, doneS, clampedMW, keys: [{atS, mw}], clampOn, lastMW}],  // V.STATION_IDS order
        tie: {doneS, keys: [{atS, mw}]},
        starts: [{unit, atS}], stops: [{unit, atS}]}       // sorted by atS, then unit; one per unit
```

A key is **arrive-by**: the station's lever (Σ base points of its 'on' machines) should be at
`mw` by `atS`. `doneS` is the atS of the last key applied (each applies once); `man` (HAND only)
suspends the station's plan; `clampedMW` > 0 means the last key was clamped by that many MW (not
enough machines on) and is re-applied once when the on-line count rises past `clampOn` (private,
with `lastMW`, the key's MW). A key of 0 MW is the lever at its floor (Σ MIN; hydro gates shut);
the STOP that ends a layer dragged to 0 is an explicit booking in `stops` (§12 Phase 1a,
deviation 1). Keys older than `PLAN_HISTORY_S` (30 min) are dropped. `observe()` copies it by
explicit keys without `clampOn` and `lastMW`.

### ext (hidden, pre-rolled, never written after createState)

| Field | Meaning |
|---|---|
| `regime` | `{cls: 'heat'\|'storm'\|'calm', temp: 'HEATWAVE'\|'MILD'\|'HOT'}` from `EXT_REGIME` (S-10: heat 15%, storm 30%). `temp` is `'HEATWAVE'` iff `cls` is `'heat'`; MILD needs `scn.weather.mildShare` > 0 (CLASSIC 0, DESK 0.55). Only createState reads `temp`, once, for `state.day`; code tolerates it missing (Phase 2a; desk/README.md §19.2) |
| `events[]` | `{id: 'e7', atS, type, args, contingency: bool, warned: bool}`, sorted by `atS`, then type order, then menu slot; contingencies never share a second |
| `heat` | `{announceS, onsetS, endS}` or `null` |
| `series` | `{stepS: 60, demandNoiseMW: int[1441], windPm: int[1441], clearPm: int[1441]}` |
| `rooftop` | `{stepS: 300, clearPm: [[int x 289] x nSub]}`: each suburb's clearness (`scn.city.suburbs` order) as integer per-mille inside `cloud.min..max`, from `weather.prerollRooftop` on `EXT_ROOFTOP`; `null` when `scn.rooftop.capacityMW` is 0. One shared regional sky (reverts to `cloud.mu`; a heatwave's clear skies lift that mean from its onset) plus a small zero-mean local term per suburb, stored already combined; the 2a cloud front does not cross the suburbs. Read only by `sampleSecond`, for the present second; never by `forecast()` (Phase 2a; desk/README.md §19.2, C-5) |

Event types (classic menu, legacy L331-370): `notice {code}`, `heatAnnounce {onsetS, endS,
upliftPm, deratePm}` (integer per-mille), `heatOnset {clearMuAtLeast}`, `heatEnd`, `stormWarn
{arriveS}`, `stormArrive {windMu}`, `windCutout {windMu}`, `stormPass {windMu}`, `cloudWarn
{onsetS}`, `cloudOnset {clearMu}`, `cloudClear {clearMu}`, `windDrought {windMu}`, `smelterTrip
{offS}`, `smelterReturn`, `linkTrip {cause, lockoutS}`, `unitTrip {rule: 'largest'|'station',
station?, lockoutS}`. The `windMu`/`clearMu` args are already folded into the series at
createState; `applyDue` only logs them.

### env (weather.sampleSecond, every grid second; public "present" values)

`s` (grid second), `h` (hour of day), `demandMW` (operational demand, P-1: underlying minus
rooftop PV minus the smelter's missing load), `underlyingMW` (the day's shape x heat multiplier
+ noise + wobble), `windAvailMW`, `solarAvailMW` (clear-sky table x clearness), `windFrac`,
`clearness`, `heatActive` (onset <= s < end), `heatMult`, `tempC` (display; a MILD day shows
`scn.temperatureC.mildTable`), `neighbourPrice` ($/MWh, P-6), `exportLimitMW` (300 in
09:00-16:00, else 800), `rooftopMW` (every suburb's rooftop PV as if every inverter were
connected), `roofSubMW[nSub]` (per suburb, `scn.city.suburbs` order), `roofClearFrac[nSub]` (its
clearness now). Phase 2a (desk/README.md §19.2, C-3, C-4):

* **P-3.** `underlyingMW = weather.underlyingBaseMW(scn, state.day, h) x heatMult + noise +
  wobble`. The shape is `DEM(h)` on a HOT weekday; a MILD day takes off its cooling load,
  `COOLING_MAX_MW x clamp((T - COOLING_BASE_C) / COOLING_SPAN_C)` with T from the scenario's
  hot-day temperature table; a weekend multiplies either by `WEEKEND_DEMAND_FACTOR`. MILD and
  the weekend come from the public `state.day`, the heat from `ext.heat`.
* **P-2.** `roofSubMW[j] = capacityMW x share[j] x clearFactor x shape(h) x (1 - cloudBite x
  (1 - k_j)) x (1 - (1 - heatFactor) x r(s))`: `shape` is `scn.rooftop.shapePm` (integer
  per-mille of the 13:00 peak, linear between its 15-min points; 0 outside 06:12-19:48), `k_j` =
  `roofClearFrac[j]`, read from `ext.rooftop` (linear between its 5-min samples), and `r(s)` =
  `weather.heatRampAt(ext.heat, s)`, the 0..1 ramp `heatMultAt` uses, so the hot-panel derate
  starts with the heat window and never leaks a heatwave that has not been announced.
  `rooftopMW` is the sum. Clear noon (13:00, k = 1) is 3,500 MW; 18:48 about 386 MW; k = 0.32
  everywhere leaves 52.4% (tested).
* **P-1.** `demandMW = underlyingMW - rooftopMW - (SMELTER_MW - smelter.loadMW)` on every grid
  second (flex = 0 in 2a; tested over a whole DESK day through a potline trip). `demandMW`
  stays THE operational total every consumer reads; what is off with dark or reconnecting
  districts is `city.roofOffMW` (fleet), never taken out of `env`.
* With no rooftop (`ext.rooftop` null) `rooftopMW` is 0, `roofSubMW` zeros and `roofClearFrac`
  ones, written in place each second; with that and a HOT weekday (the classic day, C-1) every
  `env` value is bit-identical to the pre-2a formula (tested, association order included).

### day and msl (Phase 2a; desk/README.md C-2, C-9)

`day = {temp: 'MILD' | 'HOT', weekend}` is the public kind of day, set once by createState
(`temp` from the hidden `ext.regime.temp`, a heatwave reading `'HOT'`; `weekend` from
`scn.day.weekend`) and never written again. `sampleSecond` and `forecast` take the day type from
it; nothing else reads `ext.regime.temp`.

`msl = {level, minMW, atS, sinceS}` (writer: `events.mslSecond`, every `MSL_CHECK_S` = 300 s).
`minMW` is the minimum forecast operational demand: the least of `env.demandMW` now and
`forecast.demandP50` over the 4.5-h window; `atS` its grid second (now, when the present is the
minimum). Both are refreshed at every check, unrounded. In the last 4.5 h of the sim day the
window runs past 04:00, as the forecast's own columns do (tomorrow morning, on the same day
type), so `atS` may be up to `FC_HORIZON_S` past `DAY_S`: a consumer that maps it onto the day
(a `dayAhead` column, a plan position) clamps it. No level is reached at night (no rooftop), so
no record carries such a time. `level` 0..3: a level is **reached**
when `minMW` is at or below its threshold (`MSL1_MW` 1,600, `MSL2_MW` 1,300, `MSL3_MW` 1,000,
each raised by `MSL_TIE_OUT_MW` for the hours the tie is out: the present while `tie.tripped`, a
forecast column only if it falls before the tie's public return, `env.s + tie.lockoutS`; the
column tested is the one closest to its own threshold, and `minMW` / `atS` are that column's)
and **left** only once `minMW` is more than `MSL_CLEAR_MW` above it. `sinceS` is the grid second of the last change of level (-1: none yet
today). Every change of level emits one `log` record (§7). With no rooftop the object is never
written: `{0, 0, -1, -1}` all day.

### stations[i] - `{id, basePointMW}` (K-1)

**Derived**: `basePointMW` is always the sum of `units[].basePointMW` over the station's
machines in mode `'on'` (`fleet.refreshLever`; every base point change goes through
`fleet.setBasePoint` or is followed by `refreshLever`). The unit base points are the
authority:

* a machine reaching `'on'` enters at its `minMW`; the others keep theirs;
* STOP sets the stopping machine's base point to 0 (it leaves the lever); a trip likewise;
* a `basePoint` input gives every `'on'` machine an equal share, `clamp(mw / onCount, minMW,
  availMW)` (a station's machines have identical bounds, so the result is exactly
  `clamp(mw, Σmin, Σavail)`); the logged `mw` is that applied lever (§6);
* heat derate re-clamps `'on'` base points to `availMW`.

So starting, stopping or tripping one machine never moves the others: coal at 3 x 500 plus a
joining machine is 500, 500, 500, 240 (an equal split of the lever would have moved all four
to 435).

### units[i] (one per machine; static data is `V.MACHINES[i]`)

| Field | Unit | Writer | Meaning |
|---|---|---|---|
| `id`, `station`, `k` | | A | `'coal1'`..`'hydro3'`; `k` = index into `V.MACHINES` |
| `mode` | enum | grid, fleet | `off` -> `starting` (T1) -> `ready` (auto-sync wait) -> `loading` (T2) -> `on` -> `unloading` (to MIN at ramp) -> `shutdown` (T4) -> `off`; `tripped` (lockout) -> `off` |
| `sync` | bool | fleet.setSync (called by grid, fleet) | breaker closed: counts in Ek, output, governors. True in loading/on/unloading/shutdown |
| `timerS` | s | grid, fleet | seconds left in the timed phase (T1, auto-sync, T2, T4, lockout) |
| `upSinceS`, `downSinceS` | s | fleet.setSync | last breaker close / open (S-11 min up / down) |
| `downWhy` | `'stop'`/`'trip'` | fleet.setSync | why the breaker last opened: S-11 minimum down time runs only after a planned `'stop'` (owner decision D1; a `'trip'` is held by its lockout, then may hot-start) |
| `basePointMW` | MW | fleet (setBasePoint, tripUnit), grid via fleet | this machine's base point (0 unless `'on'`) |
| `agcTrimMW` | MW | grid | AGC trim, within +-`agcBandMW` (0 in HAND) |
| `schedMW` | MW | grid | scheduled output: moves toward clamp(base + trim, MIN, avail) at `rampMWs` per second; profiles in loading/unloading/shutdown |
| `govMW` | MW | physics | governor response (first-order lag state) |
| `outMW` | MW | physics | electrical output this tick = `schedMW + govMW` (0 if not sync) |
| `availMW` | MW | grid | rating x (1 - `HEAT_THERMAL_DERATE` if heat active and thermal) |
| `hotS` | s | grid | seconds above `HOT_LOADING_FRAC` of avail (H-2) |
| `starts` | count | grid | starts today |
| `slipHz`, `slipToHz`, `slipAtTick`, `phaseAtDeg` | Hz, Hz, tick, deg | grid | Phase 1a, K-12: the slip (machine - grid) is `slipHz` at `slipAtTick`, moving linearly to `slipToHz` over `SYNC_TRIM_S`; the phase angle is `phaseAtDeg` at `slipAtTick`. `grid.syncAt(u, tick)` integrates it exactly (observe shows the values now) |
| `autoTick` | tick | grid | the tick a `syncAuto` close is due (-1 none) |
| `revTripS` | s | grid | grid seconds to a reverse-power trip after a slow close (0 none) |
| `kickMW`, `kickEndTick` | MW, tick | grid | a rough close's one-second swing in `schedMW`, removed at the first grid second from `kickEndTick` |

### battery - K-5, H-8 two layers, H-10

| Field | Unit | Writer | Meaning |
|---|---|---|---|
| `mode` | `charge`/`idle`/`discharge` | grid (input) | the dial |
| `orderMW` | MW >= 0 | grid (input) | magnitude |
| `guardMW` | MW | grid (input) | GUARD ring, 0..500 in 50-MW steps; held back as contingency FFR |
| `schedMW` | MW (+ discharge) | grid | moves toward clamp(signed order + agcTrim, -(BATT_MW - guardMW), BATT_MW - guardMW) at `BATT_DISPATCH_RAMP_MW_S`; charge part 0 while `fullHold`; near empty / full also held to the schedule taper (§11 grid) |
| `agcTrimMW` | MW | grid | within +-(BATT_MW - guardMW) |
| `pfrMW` | MW | physics | mandatory PFR layer (deadband 0.015, full at 0.85 Hz beyond, 0.1 s + 0.1 s); stored after the inverter / SoC trim (anti-windup) |
| `ffrMW` | MW | physics | GUARD layer delivered now: follows its target at guardMW per `GUARD_DELIVERY_S` up and BATT_MW per `GUARD_WITHDRAW_S` down (turning the ring down mid-sustain never steps it) |
| `ffrFiredTick` | tick or -1 | physics | when the guard fired; -1 = armed |
| `outMW` | MW | physics | effSched + pfr + ffr exactly (§11 physics step 4) |
| `socMWh` | MWh | physics | integrated per tick, clamped to [0, BATT_MWH]; charge x `BATT_CHARGE_EFF` |
| `fullHold` | bool | grid | "CHARGE ORDER - paused (full)" (H-10); cleared only by a new battery input |
| `ufSuspend` | bool | physics | charging suspended below 49.85 Hz until above 49.90 (H-10), at physics speed; with `UF_RESUME_LINEAR` (default) scheduled charging re-engages in proportion between 49.85 and 49.90 instead of as one step at 49.90 |

### tie, ren, hydro, rert, dr, smelter

| Object | Fields (writer) |
|---|---|
| `tie` | `setMW` (grid, input), `flowMW` (grid; + import; ramps at `TIE_RAMP_MW_MIN`; clamp [-exportLimit, 800]), `tripped`, `lockoutS` (fleet.tripTie, grid) |
| `ren` | `windLimitPct`, `solarLimitPct` (grid, input: output LIMIT %, 100 = no curtailment, as the legacy LIMIT slider), `windCurtMW`, `solarCurtMW` (grid, integration: the curtailed MW, moving toward available x (100 - limit)% at `CURTAIL_RAMP_FRAC_MIN`, so a LIMIT change is never a step; the weather passes straight through), `windAutoMW`, `solarAutoMW` (grid, Phase 2a, C-6: MW held back by the dispatch in a surplus, on top of the manual LIMIT's `*CurtMW`: each moves toward its pro-rata share of the cut at `CURTAIL_RAMP_FRAC_MIN` and back to 0 as the surplus goes; `windAutoMW` is stored before OFGS, as `windCurtMW` is; 0 whenever there is no surplus, so always 0 on a day without one), `windMW`, `solarMW` (grid: available - `*CurtMW` - `*AutoMW`; physics and settlement apply OFGS to wind, and physics takes the over-frequency back-off `phys.renPfrMW` off both, C-7; the market's stack offers the AVAILABLE MW, `env.windAvailMW` net of OFGS and `env.solarAvailMW`, P-5, so neither cut moves the price) |
| `hydro` | `storageMWh` (physics, per tick), `warned[]` (grid: 30%, 10% warnings) |
| `rert` | `armed`, `leadS`, `outMW`, `standingDown`, `armedEver` (grid) |
| `dr` | `callsLeft`, `activeS`, `mw` (grid; `mw` moves toward DR_MW while `activeS > 0`, else toward 0, at `DR_RAMP_MW_MIN`, integration) |
| `smelter` | `loadMW` (fleet.tripSmelter, events: return ramp), `offS`, `returning` (events), `returnS` (events, stage B: second the return ramp starts; set at the trip as trip + offS, so the ramp is a function of time and weather.forecast knows the announced return) |

### city, ufls, ofgs, collapse

* `city.districts[d]`: `{id: 'RED1', suburb, share, uflsStage (1..8, 0 = none), rot (rotation
  index, -1 = none), dark, shedBy: null|'ufls'|'directed'|'task', darkSinceS, restoredAtS,
  surgeMW}`. 32 districts (~3% each, from U-1 households); 16 carry the 8 UFLS stages, 16 form
  the directed-shedding rotation. `dark`/`shedBy`/`darkSinceS`/`restoredAtS` change only
  through `fleet.setDistrictDark`; `surgeMW` (grid) is the cold-load extra at its restore.
* `city.shedFrac` (fleet, exact sum of dark shares), `city.coldLoadMW` (grid: the decaying sum
  of surges, K-13), `city.lastRestoreS` (grid).
* A district's **cold-load MW** is `fleet.districtColdLoadMW(state, d)`. With `G = env.demandMW
  + env.rooftopMW` (the total before rooftop; Phase 2a, P-12 / C-8): for a DARK district the
  undelayed underlying pickup, `G x share x (dark for > COLD_LOAD_AFTER_S ? COLD_LOAD_FACTOR :
  1)`, no rooftop netted off (its inverters wait and then ramp, below); for a LIT district its
  NET load now, `G x share` less the rooftop it has connected (near zero or negative at a sunny
  noon). With no rooftop both are `env.demandMW x share` (x the factor), as before. Permissive,
  observe, the restore surge and the `shed` record all use it.
* (Phase 2a; desk/README.md §19.2; P-12, C-8) `city.districts[d]` also carries `sub` (index into
  `scn.city.suburbs`) and `roofFrac` (1 / its suburb's district count), both final at stage A,
  and `reconnectS`: -1, or the grid second its inverters START ramping back. `fleet.
  setDistrictDark` sets it to the relight second + `ROOF_RECONNECT_S` (and to -1 when the
  district goes dark); `fleet.refreshRoof` resets it to -1 once the ramp has finished at
  `reconnectS + ROOF_RAMP_S`. A district's rooftop **off fraction**: dark 1; `reconnectS < 0` 0;
  `s < reconnectS` 1; else `1 - (s - reconnectS) / ROOF_RAMP_S`. `city.roofDarkMW` (rooftop MW
  off because its district is dark) and `city.roofOffMW` (off in total: dark, or relit and
  still waiting or ramping) are the sums of `env.roofSubMW[sub] x roofFrac` (x the off
  fraction) over the districts, recomputed by `fleet.refreshRoof(state)`: called by
  `setDistrictDark` (also mid-second, when physics operates a UFLS stage) and once a grid second
  by `grid.fosSecond`, so physics and the market read two numbers and the tick has no district
  loop. `fleet.litDemandMW(state)` = `G x (1 - shedFrac) - (env.rooftopMW - city.roofOffMW)`:
  the lit operational demand (`obs.demand.litMW`, the market demand's first term); with rooftop
  zero it is `env.demandMW x (1 - shedFrac)` exactly, and both sums are 0.
* `ufls.timerS[8]`, `ufls.operated[8]`: physics (timers; `fleet.operateUfls` darkens both
  districts and marks the stage); grid re-arms with `fleet.rearmUfls` once both are lit.
  `ofgs.timerS[4]`, `ofgs.tripped[4]`, `ofgs.trippedFrac`: physics trips and grid reconnects
  (after `OFGS_RECONNECT_S` back in band, counting `ofgs.okS`; then one stage per
  `OFGS_RECONNECT_GAP_S`, the last to trip first) only via `fleet.setOfgsStage`, which keeps
  `trippedFrac = count x OFGS_STAGE_FRAC`. `collapse.bandS[2]` (physics): time BELOW each
  band's upper edge (47.5 Hz for 2 s, 48.0 Hz for 20 s), so a dip into the lower band keeps the
  20-s timer running. Relay and collapse timers count whole ticks (0.30 s is exactly 15).

### phys (physics; every tick)

`fHz`; `fHist[32]` (ring: `fHist[t % 32]` = f at the **start** of tick t); `rocofHzS` =
(fHist[t] - fHist[t - 25]) / 0.5 s, computed right after the push (K-11 FOS window);
`ekMWs` (kept by `fleet.setSync`); readouts for the imbalance bar (K-11):
`schedSupplyMW` (sum of sync schedMW + tie + wind after OFGS + solar + battery effective sched +
RERT), `supplyMW` (the same with outputs: + governors + PFR + guard - `renPfrMW`), `servedMW`,
`loadReliefMW` (= servedMW x LOAD_RELIEF x (F0 - f) / F0, positive when f < F0), `loadMW` (=
servedMW - loadReliefMW + `roofPfrMW`), `imbalanceMW` (= supply - load), `inertiaMW` (=
-imbalance), `govTotalMW`, `shedMW`. At createState the readouts are 0.

Load on net blocks (Phase 2a; desk/README.md §19.2; P-12, C-8), with `G = env.demandMW +
env.rooftopMW` the total before rooftop (keep the operation order: physics, the market and
observe share these, and with rooftop zero each is exactly the pre-2a value):

```
shedMW   = G x shedFrac - city.roofDarkMW                       the RELAY MW: the dark districts' net load
servedMW = G x (1 - shedFrac) - (env.rooftopMW - city.roofOffMW) + city.coldLoadMW - dr.mw
unserved = G x shedFrac                                         the dark customers' own load -> acc.unservedMWs
```

The inverters' over-frequency response (C-7; lowering only, labelled; flags `REN_PFR_ON`,
`ROOF_FW_ON`), from the tick's START frequency f and this tick's state after the relays:

```
renPfrMW  = min(out, max(0, f - F0 - GOV_DEADBAND_HZ) / (GOV_DROOP x F0) x (WIND_MW x (1 - ofgs.trippedFrac) + SOLAR_MW))
            out = ren.windMW x (1 - ofgs.trippedFrac) + ren.solarMW   (as scheduled; droop on rating, no lag)
roofPfrMW = (env.rooftopMW - city.roofOffMW) x roofHoldFrac
            roofHoldFrac: f > ROOF_FW_START_HZ -> max(held, min(1, (f - ROOF_FW_START_HZ) / (ROOF_FW_ZERO_HZ - ROOF_FW_START_HZ)));
            f < ROOF_FW_START_HZ - ROOF_FW_HYST_HZ -> falls by PHYS_DT / ROOF_RAMP_S a tick to 0; between the two it is held
```

`roofHoldFrac` is the one piece of state here: the lowest rooftop output reached is held (AS/NZS
4777.2) until the frequency is back under 50.15 Hz, then the back-off returns at 1 / `ROOF_RAMP_S`
of the connected rooftop a second (so at most `ROOF_RAMP_S` from zero output).
**Identity** (tested every tick): `(schedSupplyMW - servedMW) + inertiaMW + govTotalMW +
battery.pfrMW + battery.ffrMW + loadReliefMW - renPfrMW - roofPfrMW = 0` within rounding.
`servedMW` stays the load-relief base.

### acc (per-second accumulators) and last

`acc`: `unitMWs[14]`, `battOutMWs` (signed net output, + discharge), `battChargeMWs` (charge
drawn, >= 0), `battAbsMWs` (throughput |out|), `shedMWs`, `servedMWs` (of `loadMW`),
`loadReliefMWs`, `fMinHz`, `fMaxHz`, `fSumHz` (on each tick's START frequency), `ticks`
(physics adds each tick; when `acc.ticks === 0` it first sets `fMinHz = fMaxHz = f`),
`startCost` ($, grid adds at START). Built by `fleet.newAcc()`; `market.settleSecond` folds it and calls
`fleet.resetAcc(acc)`, and writes `last = {fMeanHz, fMinHz, fMaxHz, servedMW, shedMW}` (means
over the completed second). AGC, FOS and the restore permissive read `last.fMeanHz`.
(Phase 2a; desk/README.md §19.2) `acc.shedMWs` is the RELAY MW x s (net load; the source of
`last.shedMW`); `acc.unservedMWs` adds the unserved rate `G x shedFrac` x `PHYS_DT` each tick (the
dark customers' underlying load, C-8: it feeds `score.unservedMWh`); `acc.spillMWs` adds
`phys.renPfrMW` x `PHYS_DT` (wind and solar backed off by over-frequency, C-7). All are carried
by `newAcc`, `resetAcc` and the preview's `copyAcc`. `acc.servedMWs` is of `loadMW`, so rooftop
that backs off shows as energy served by the grid.

### agc, fos, sec, price (grid / market)

* `agc = {nextCycleS, requestMW, unmetMW, atLimitS, aceMW}`: `unmetMW` is the ACE while the
  request is clipped with ACE pushing further out (else 0); `atLimitS` counts consecutive grid
  seconds at the limit; in HAND every trim and the request are 0 and ACE is still shown.
* `fos = {outsideS, belowContainS, countdownS, directed, nextShedS}`.
* `sec = {r5MW, lMW, lKind: 'unit'|'link'|'none', lId, ratio, previewNadirHz, previewAtS,
  previewLId, previewLMW, previewFHz, dirty, level: 'SECURE'|'TIGHT'|'SHORT'|'SHEDDING',
  previewUnitHz, previewLinkHz, pvUnitId, pvUnitMW, pvLinkMW}`.
  `previewFHz` (the frequency the cached preview started from; finishing pass) and the `pv*`
  fields (what the cached previews were for) are private: `observe()` copies `sec` by its key
  list without them. Phase 1a (A-2, `N1_PREVIEW_ALL`): `lMW` stays the larger MW (the R5 test,
  `ratio`, the P-7 x); `previewUnitHz` / `previewLinkHz` are the TRIP PREVIEWs of losing the
  largest unit and the tie import; `lKind`, `lId`, `previewNadirHz`, `previewLId` and
  `previewLMW` name the worse of the two (ties to the unit): the gauge's BIGGEST RISK.
* `price = {mwh, marginalId, adder, exhausted, x}` (x = R5 / L).

### score (market; S-1..S-3)

`servedMWh`, `unservedMWh` (= uflsMWh + directedMWh + taskMWh; Phase 2a, C-8: the integral of
the dark customers' UNDERLYING load, `acc.unservedMWs`, so LIGHTS ON does not depend on the sun;
with no rooftop it equals the integral of the relay MW, as before), `cost {fuel, noLoad, starts,
tie, battWear, dr, rert, flex}` ($), `co2t`, `genMWh` (generation in the region: units, wind after
OFGS, solar, RERT, less what wind and solar backed off inside the second, `acc.spillMWs`),
`marketBill` (info only), `minHz`, `maxHz`, `outsideNormalS`,
`spark[12]` (worst |f - 50| per 2-h block from 04:00, Y-4), `starts`, `spillMWh` (Phase 2a,
C-6 / C-7: wind and solar energy held back or backed off; each settled second adds
`(windCurtMW + windAutoMW) x (1 - ofgs.trippedFrac) + solarCurtMW + solarAutoMW` and
`acc.spillMWs`; counted and shown, never charged for: its cost is the fuel burned later, S-2).
`market.scoreSummary(score)` derives `{lightsMWh, costDollars, centsPerKWh, co2t, co2tPerMWh,
servedMWh}` (`co2tPerMWh` = co2t / genMWh, AEMO's CDEII convention: imports count in neither term). **Never** unserved x a price (H-12; linted). VCR is for the debrief only.

### conts[] (contingency records; K-15 watch, K-16 respond card, D-21 moment)

`{n, startTick, cause: 'unit'|'link'|'load', id, lostMW (+ supply lost, - load lost), fStartHz,
ekBeforeMWs, ekAfterMWs, rocofHzS (df/dt of the first tick after the trip), extremeHz,
extremeTick, pre, caught, uflsStages, contained (extreme within 49.5-50.5), backInBandTick (-1
until f is back in 49.85-50.15), watchEndTick (start + 30 s), secureByTick (start + 30 min)}`.
Opened by `fleet.startContingency` for any trip > 50 MW (FOS event threshold). `pre` =
`fleet.preTrip(state)`: the readouts of the last tick before the trip `{inertiaMW, batteryMW
(= battery.outMW - ffrMW: PFR plus the charge suspension), guardMW (= ffrMW), governorsMW,
loadReliefMW, uflsMW (= phys.shedMW)}`. `caught` has the same keys: the value at the extreme
**minus** `pre`. With frozen schedules, Σ caught = lostMW - the tripped unit's pre-trip govMW
(0 at 50 Hz), within 1 MW (tested). Physics fills the trace while `tick < watchEndTick`; grid
fills `backInBandTick`.
(Phase 2a; desk/README.md §19.2) `pre`, `caught` and `previewTrip`'s `caught` gain `inverterMW`
as the last key: `-(renPfrMW + roofPfrMW)` at the extreme minus its pre-trip value (C-7: negative
when the inverters caught a loss of load), so caught still sums to lostMW (tested on a load
loss, preview and record). `uflsMW` is the relay MW (net load).

### news[] (public announcements; events)

`{atS, kind: 'heat'|'storm'|'cloud'|'drought', fromS, toS (or null), text}` and **nothing
else**: no event id or index (S-4: it would reveal how many silent events came before). A
`heatAnnounce` gives `fromS = onsetS, toS = endS`; `stormWarn` gives `fromS = arriveS`;
`cloudWarn` gives `fromS = onsetS`; `windDrought` is announced at onset.

## 6. Inputs (F-6)

An input is `{type, ...args}`. `applyInput(state, input, out)` (step.js) runs:

1. **Shape**: known `type`; exactly the listed args (extra keys refused, so logs are
   canonical); each arg of the right kind and range.
2. **Day over** -> refused. **Watch lock** (K-15): refused while `tick < conts[contIdx].watchEndTick`.
3. **Canonical copy** `cmd = {type, ...args}` with -0 folded to 0. `mode` is applied in
   step.js (refused from `PLAYER_START_TICK` on and after any other accepted input, D-7);
   everything else by `grid.applyCommand(state, cmd, out)`, which returns `''` (applied) or the
   reason (nothing changed), and MAY rewrite `cmd`'s numeric args to the value actually applied
   (e.g. a clamped base point).
4. Accepted -> `sec.dirty = true`; for non-mode inputs `control.modeLocked = true`; appended to
   `state.log` as `{tick, type, args}` read from `cmd` **after** grid ran (args in the shape's
   key order), so the log holds what was applied. Refused -> `{tick, kind: 'input', ok: false,
   type, reason}` pushed to `out`; **not logged**.

| type | args | Accepted when (grid) | Effect |
|---|---|---|---|
| `basePoint` | `station`, `mw` >= 0 | always | equal shares over the `'on'` machines (§5 stations); `mw` rewritten to the applied lever (0 if none is on). Phase 1a, AGC: writes the plan (L-6): keys from now to the arrival and the move in flight (keys up to `doneS`) are dropped, `{arrival, mw}` inserted, arrival = s + ⌈\|Δ\| / station ramp⌉, `doneS` = arrival (exactly one keyframe at the earliest ramp-feasible time; later keys stay; nothing when no machine is on). HAND: `man = true` (the station's plan waits; no key is touched) |
| `start` | `unit` | `fleet.startBlock` is '' (off; min down met after a planned stop, none after a trip (D1); water for hydro) | `starting`, `timerS = t1S`, `acc.startCost += startCost`, `starts++` |
| `stop` | `unit` | `fleet.stopBlock` is '' (min up met; starting/ready just cancel) | on/loading -> `unloading`, base point 0 (the lever loses exactly its share); starting/ready -> `off` |
| `abortStop` | `unit` | mode `unloading` or `shutdown` (hydro: not out of water) | unloading -> `on` with base point = schedMW; shutdown -> `loading` (T2 slope from its output up to MIN) |
| `syncClose` | `unit`, `bypass` (bool, optional, default false) | mode `ready`; not blocked by the sync-check relay (\|slip\| > `SYNC_BLOCK_SLIP_HZ` or \|angle\| > `SYNC_ROUGH_DEG`, judged `SYNC_BREAKER_TICKS` after the input) unless HAND and `bypass` | K-12 outcome table (§11 grid, "Synchroscope"): clean, rough, reverse or (HAND bypass) close-then-trip; a `sync` record. Refused: `'blocked by sync-check relay'`, the input record carrying `cue: 'buzz'` |
| `battery` | `mode` in charge/idle/discharge, `mw` >= 0 | always | order set (`mw` rewritten to min(mw, BATT_MW)); `fullHold = false` |
| `guard` | `mw` in 0..500, multiple of 50 | always | `guardMW` |
| `tie` | `mw` in -800..800 | always (while tripped it sets the post-repair setpoint) | `setMW`; the flow is clamped to the export cap at use (a lower cap is reached at the tie ramp, never as a step). Phase 1a: writes the tie's plan like a lever in AGC (arrival at `TIE_RAMP_MW_MIN`), in HAND too (§12 Phase 1a, deviation 5) |
| `curtail` | `kind` wind/solar, `limitPct` 0..100 | always | the output LIMIT % (100 = no curtailment), reached at `CURTAIL_RAMP_FRAC_MIN` (both ways) |
| `callDR` | - | calls left and not active | `activeS = DR_DURATION_S`, `callsLeft--`; `dr.mw` ramps in and out at `DR_RAMP_MW_MIN` |
| `armRERT` | - | not armed | armed, `leadS = RERT_LEAD_S`, `armedEver = true` ("glass broken") |
| `standDownRERT` | - | armed and not already standing down | ramps out at `RERT_RAMP_MW_MIN`, then disarmed; before it arrives it simply cancels |
| `mode` | `agc` bool | before 04:30 and `!control.modeLocked` | `control.mode` = AGC / HAND (D-7) |
| `restore` | `district` | dark and `grid.restorePermissive(state, d, {preview: true})` is '' (the lamp's conditions plus the RESTORE PREVIEW, run on the input only) | **K-13 stub**: relit; `surgeMW` = cold load - its share of demand; `lastRestoreS`; UFLS stage re-armed if both its districts are lit |
| `directShed` | - | `sec.level` is SHORT or SHEDDING (Phase 1a, A-3: R5 < L now, the LOR2-like state) and a lit district in rotation remains (K-7) | darkens the lit rotation district restored longest ago (never shed first; ties by the lowest `rot`: on a fresh day, the lowest `rot`; Phase 2a: passing over a district with no net load to give), `shedBy 'directed'` (true rotation: a district just restored is not the next one shed) |
| `planKey` | `station`, `atS` (whole s), `mw` >= 0 | `atS >= s`; something of the station on, booked, or free to start by then; before 04:00 | insert or replace the key at atS, **rewritten** (logged as applied): atS up to the earliest time the station's ramp reaches mw from the previous key after now (or the lever now), counting machines joining at MIN; mw into [Σmin, Σrating] of the machines on or booked on by then. None on or booked and mw > 0: books the START of the first machine free to start so it reaches MIN and climbs to mw by atS (a later booking of it moves earlier; atS moves later if the start would be past). mw 0: to MIN by atS, and a STOP of every machine on by then booked at atS. The rewrite is a fixed point: the logged key rewrites to itself on replay |
| `planDel` | `station`, `atS` | a key at exactly atS, not in the past | removes it, and the STOPs of the station booked at that second |
| `planStart` | `unit`, `atS` | `atS >= s`; unit off (or tripped) and free to start by atS (minimum down time, lockout, water) | books START at atS (replacing the unit's booking) |
| `planStop` | `unit`, `atS` | `atS >= s`; unit committed, or booked to start before atS | books STOP at atS (replacing the unit's booking) |
| `planUnbook` | `unit` | a booking of the unit | removes its booked START and STOP |
| `planRejoin` | `station`, `keep` (bool) | HAND and `man` | `man = false`; `keep`: the missed keys up to now give way to a key {now, present lever} (`doneS` = now; L-6 KEEP); else the executor applies the plan's present value at the next second (RESUME) |
| `planLoad` | `fromS` (whole s), `stations` {id: [[atS, mw], ...]}, `tie` [[atS, mw], ...], `starts` [[unit, atS], ...], `stops` [[unit, atS], ...] | `fromS >= s`; every atS >= fromS; shape checked in step.js: known station ids, <= `PLAN_MAX_KEYS` entries per list, keys strictly increasing in atS, bookings sorted by (atS, unit), one per unit per list, MW finite (station >= 0, tie within +-800) | replaces every plan entry with atS >= fromS; MAN flags clear; a key the executor had applied at or after fromS is superseded (`doneS` moves back); `madeAtS` = s. Logged canonically: `stations` carries every station id in `V.STATION_IDS` order (missing = []), fresh arrays |
| `scope` | `unit` ('' closes) | unit `ready`, or '' | `scope.unit`; that unit's auto-synchroniser waits while it is on the scope (A-4). The scope closes when the unit leaves 'ready' |
| `syncTrim` | `unit`, `dHz` = +-`SYNC_TRIM_HZ` | the unit is `ready` and on the scope | speed target += dHz (within +-`SYNC_SLIP_LIMIT_HZ`); the slip moves linearly to it over `SYNC_TRIM_S`; cancels a pending `syncAuto` |
| `syncAuto` | `unit` | unit `ready`; AGC (HAND has no auto-synchroniser) | K-12 AUTO: trims the slip to +`SYNC_AUTO_SLIP_HZ` and closes cleanly on the next pass through 0 degrees (the close command at the tick 80 ms before it; `scope.nextAutoTick`) |

`ack`, `silence`, pause, rate, FAST, skip, focus, expand and scope *offers* are **not** sim inputs
(presentation only).

**Input log record**: `{tick, type, args}`. `replay(seed, scenario, log, {untilTick})` feeds
each record back as `{type, ...args}` at its tick (F-6) and **throws** if a record is refused
or if the day ends before records below `untilTick` are reached (the log belongs to another
seed, scenario or version). Resume (F-7) = seed + `SIM_VERSION` + log, or a JSON snapshot:
`JSON.parse(JSON.stringify(state))` resumes bit-identically, even mid-watch (tested).

## 7. Event records (returned by step)

Every record has `tick` and `kind`; `cue` (optional) names a sound for `audio/`.

| kind | fields | emitted by |
|---|---|---|
| `log` | `sev: 'info'\|'good'\|'warn'\|'crit'`, `code`, `msg` | any module |
| `contingency` | `cause`, `id`, `lostMW`, `fHz`, `ekBeforeGWs`, `ekAfterGWs`, `cue: 'horn'` | fleet (trips > 50 MW) - the watch starts on it |
| `breaker` | `unit` (machine id or `'tie'`), `closed`, `why: 'sync'\|'stop'\|'trip'`, `cue: 'breaker'` | fleet, grid |
| `ufls` | `stage`, `districts[]`, `mw` (the stage's NET load, Phase 2a P-12: its two districts' underlying load less the rooftop they had CONNECTED, which went with their feeders; near zero or negative at a sunny noon; exactly the fall of `phys.servedMW` on that tick), `cue: 'clack'` | physics |
| `ofgs` | `stage`, `mw` | physics |
| `shed` | `district`, `why: 'directed'`, `mw` (the district's NET load when it was shed, `fleet.districtColdLoadMW` of a lit district), `cue: 'clack'` | grid |
| `restore` | `district`, `mw` (its cold-load MW: the undelayed UNDERLYING pickup, x `COLD_LOAD_FACTOR` after 10 min dark; its rooftop returns `ROOF_RECONNECT_S` later, over `ROOF_RAMP_S`) | grid |
| `announce` | `news` (the news record), `cue: 'warn'` | events |
| `black` | `fHz`, `why: 'under'\|'over'\|'inertia'` | physics |
| `input` | `ok: false`, `type` (string or null), `reason`; `cue: 'buzz'` when the sync-check relay blocked a `syncClose` | step.applyInput |
| `sync` | `unit`, `result: 'clean'\|'rough'\|'reverse'\|'bypass'\|'auto'`, `angleDeg`, `slipHz` (judged 80 ms after the command), `cue`: 'breaker' (clean), 'growl' (rough, reverse, bypass), none (auto) | grid (Phase 1a, K-12); the close's own `breaker` record comes first |
| `dayEnd` | `black` | step |

Phase 1a log codes (kind `log`): `PLAN` (a booked START or STOP refused when due, dropped),
`SYNC_ROUGH`, `SYNC_REVERSE`, `SYNC_REVERSE_TRIP`.

Phase 2a MSL codes (kind `log`, from `events.mslSecond`; P-4, desk/README.md §19.3): `MSL1`,
`MSL2`, `MSL3` and `MSL_CLEAR`, one record on **every** change of `msl.level` (a rise, a fall to
a lower level, the clear), named for the level reached. These records carry three more fields:
`{tick, kind: 'log', sev, code, msg, level, minMW, atS}`, with `sev` `info` / `warn` / `crit` for
levels 1 / 2 / 3 and `good` for the clear, `minMW` rounded to 1 MW and `atS` the grid second of
that minimum. `msg` is complete on its own in at most 25 words and names the level's threshold
as it stands, e.g. "MSL1 notice: lowest forecast demand 1,850 MW at 12:40. MSL1 is 1,900 MW (tie
out): two load trips above the security floor." When the minimum is the present second (`atS`
equals the record's own second: a potline trip, or a clear while demand is rising) the value is
measured, not forecast, and the message says so: "MSL1 notice: demand is at its lowest now,
1,471 MW. MSL1 is 1,600 MW: two load trips above the security floor." Never a news item (news is
weather). The `DUCK`
notice has its own wording on a scenario with rooftop PV (the sun leaving the rooftops).

`ufls`, `shed` and a district that is still reconnecting (Phase 2a; labelled). Both records net
the rooftop the district had connected when it was shed: all of it normally, none or part of it
for a district relit less than `ROOF_RECONNECT_S` + `ROOF_RAMP_S` (7 min) ago. `phys.shedMW`
keeps the §5 formula, `G x shedFrac - city.roofDarkMW`, which takes ALL of a dark district's
rooftop off, so after a stage has shed a reconnecting district `phys.shedMW` (and the contingency
record's `caught.uflsMW`, which is its change) is below the stage's record by the rooftop that
was still off, and `caught` then sums to that much less than `lostMW` (measured: 99.0 MW with
RED1 relit and waiting when stage 1 operates; 0.000 with every district fully connected). An
exact figure needs the connected rooftop remembered per district, a state field (desk/README.md
§19.2); reported for stage C with the K-15 wording.

Message text lives in these records for the bench; Phase 1a moves wording to `content/text.js`.

## 8. observe(state, opts): the player's view (S-4 barrier)

Everything the desk, map, Live Stack and autopilot may read. **Never** `state.ext`, `seed`,
`scnHash`, `regime`, `evNext`, `scn`, event ids, or anything about the future except
`forecast`, `dayAhead` and `news`. Every value is a fresh copy; nested state objects are copied
**by explicit key lists** (step.js), so a private field a module adds never leaks.

The shape is **frozen**: `tests/state.test.js` (`OBS_SHAPE`) lists every key. Top level:
`v, scenarioId, tick, s, clock {h, hh, mm, ss, text} (from integer seconds), over, black, mode,
modeLocked (true from 04:30 even with no input), inWatch, inRespond, f, balance, demand,
units[], stations[] {id, name, basePointMW, onCount, minMW, maxMW, outMW}, battery, tie, wind
{availMW, outMW, limitPct, ofgsTrippedFrac}, solar {availMW, outMW, limitPct}, hydro, dr, rert,
smelter, sec, fos, agc, price, score (+ scoreSummary), districts[] {id, suburb, share,
uflsStage, rot, dark, shedBy, darkSinceS, restoredAtS, coldLoadMW, restoreBlock}, news[] {atS,
kind, fromS, toS, text}, contingency (latest record incl. pre and caught, or null),
contingencies[] {n, startS, cause, id, lostMW, watchEndS, backInBandS}, forecast, dayAhead,
plan, scope`. Phase 1a added: `units[]` gains `slipHz`, `phaseDeg` (now, from `grid.syncAt`; 0
unless 'ready'); `sec` gains `previewUnitHz`, `previewLinkHz`; `plan` = {madeAtS, rev, stations[]
{id, man, doneS, clampedMW, keys[] {atS, mw}}, tie {doneS, keys[]}, starts[] {unit, atS}, stops[]
{unit, atS}}; `scope` = {unit, open}. Phase 1b added `sky` = {clearness, windFrac}: the present
`env` values (public, like `solar.availMW`), for the map's weather (G-3, G-4). It is not state:
`hashState` and `SIM_VERSION` are unchanged.
Phase 2a (desk/README.md §19.3; stage A wired every key, the world job filled in `env`, `day`,
`msl` and the forecast, and the grid job fills in what it owns: `phys`, `city`, `ren`, `score`,
`conts`): `balance` gains `renPfrMW`, `roofPfrMW` (after `shedMW`); `demand`
gains `underlyingMW`, `rooftopMW` (as if connected, so `nowMW = underlyingMW - rooftopMW -
(SMELTER_MW - smelter.loadMW)` holds in obs), `litMW` (`fleet.litDemandMW`), `unservedMW`
(`G x shedFrac`, `G = env.demandMW + env.rooftopMW`) (after `tempC`); `wind` and `solar` gain
`autoMW` (last: `ren.windAutoMW` / `solarAutoMW` as stored); `score` gains `spillMWh` (last of
the state keys, before the summary); `districts[]` gains `reconnectS` (last); `contingency.pre`
and `.caught` gain `inverterMW` (last); `forecast` and `dayAhead` gain `underlyingP50[]`,
`rooftopMW[]` (after `exportLimitMW`; `demandP50/P10/P90` stay operational). Top level, after
`scope`: `rooftop` = {mw (generating now: availMW - offMW - `phys.roofPfrMW`), availMW
(`env.rooftopMW`), capMW (`scn.rooftop.capacityMW`), offMW (`city.roofOffMW`), suburbs[] {id, mw,
capMW, clearness}: one per `scn.city.suburbs`, in order, also at capacity 0}; `msl` = {level,
minMW, atS, sinceS}; `day` = {temp, weekend}. Never `ext.regime.temp` or `ext.rooftop`: on a
heatwave day `day.temp` is `'HOT'` and the word HEATWAVE appears nowhere in `observe()` at any
hour (the 10:30 warning is the news), and no key `clearPm` exists in it (`tests/state.test.js`).
`restoreBlock` is `grid.restorePermissive(state, d)` for a dark district (the lamp: frequency and
interval; the restore preview runs only on the restore input, never per district here) and
`fleet.DISTRICT_LIT` for a lit one. The bench asks the preview itself for lit lamps
(`app/session.restoreChecks`, once per grid second), so its RESTORE button matches the input.

`forecast` = `weather.forecast(state, FC_HORIZON_S, FC_STEP_S)`: 54 five-minute columns
`{fromS, stepS, n, demandP50[], demandP10[], demandP90[], windMW[], solarMW[], neighbourPrice[],
exportLimitMW[], underlyingP50[], rooftopMW[]}` built from the scenario's climatology, the public
kind of day (`state.day`), the present (`env`) and `news` only. (Phase 2a: `demandP50` / `P10` /
`P90` are operational demand; `underlyingP50` = `demandP50` + `rooftopMW` + the smelter's
expected missing load at that column; `rooftopMW` is the rooftop forecast as if every inverter
were connected, after the heat derate of an ANNOUNCED heat window, and 0 in every column on a
scenario with no rooftop; §11 weather.js.)
`dayAhead` is `null` unless `observe(state, {dayAhead: true})`: then the same forecast to the
end of the sim day (L-0 pre-dispatch). Neither may read `ext` (`tests/events.test.js`
scrambles ext, including the series, the heat window and, on DESK, the rooftop skies and the
hidden day type, and expects an identical forecast).

## 9. hashState(state)

A type-tagged FNV-style walk over **every field of state except `scn` and `ext`**: sorted keys,
array lengths, exact IEEE bits (-0 folded to 0), each 32-bit word mixed by multiply then
xor-shift (review fix: multiplication alone never carried a high-bit difference down, so any
two sign flips cancelled), finished with `hash32`. It walks a JSON copy made with a replacer that
leaves out `scn` and `ext` and throws on a non-JSON value (NaN, Infinity, undefined, a
function), never the live objects: a JS walk reading the live numeric leaves once a grid-hour
made every later `physics.tick` allocate ~130-180 B (V8; 0 B without it), about 25-40% of a
par day (review fix; `tests/state.test.js` checks the tick allocates nothing after four hourly
hashes). `scn` and `ext` are functions of seed, scenario and
`SIM_VERSION`, which are all hashed (seed and `v` directly, the scenario through `scnHash`,
so a tuned or variant scenario hashes differently without a version bump). Nobody edits
hashState when state grows; `tests/state.test.js` perturbs every leaf and expects the hash to
change, and pairs of sign flips and doublings not to cancel. Two engines agree only if their
physics is bit-identical (`?selftest`, risk 5). Cost ~0.3-0.5 ms: once per grid-hour (F-2),
never per tick. `canonicalHash(x)` is the same walk for any plain value (on the value itself).

## 10. Performance budget

* **A day** (4.32 M physics ticks + 86,400 grid seconds + par's decisions) runs in **<= 1.6 s**
  single-threaded on a laptop: D-9 generates 365 days in <= 10 min. So `physics.tick` <=
  ~0.3 us (a representative tick with this state layout measured ~250 ns). Integration
  measured (Node 24, the owner's laptop, first pass): a whole scripted-plan day through
  `step()` 1.15-1.35 s including ~0.1 s of decisions (1,440 `observe()` calls); 250-290 ns per
  tick all-in (grid seconds amortised), of which `physics.tick` is ~160-200 ns (more with
  more machines on the bars); a doNothing day ~230-270 ns per tick.
* Per-machine constants are precomputed in `V.MACHINES` (`govDeadTicks`, `govAlpha = DT/lag`,
  `govGainMWperHz`, `govCapMW`, `ekMWs`, `rampMWs`, bands). Hoist `V.*` into module-level consts.
* Units are small fixed-shape objects created once (never add or delete fields); loop with
  `for (let i = 0; i < n; i++)`, no closures, no array methods, no allocation in `tick`.
* Branch cheaply: relays and collapse checks start with a single comparison against the
  highest threshold (f < 49.0, f > 51.0, f < 48.0) and skip otherwise.
* `ekMWs` is maintained by `fleet.setSync`, not recomputed per tick. Demand, renewables, tie,
  RERT and DR are constant within the second.
* `step()` returns a shared frozen empty array when nothing happened.
* **TRIP PREVIEW**: the only repeated full-engine run. It never clones state (a JSON clone of
  state alone costs ~0.26 ms): it saves every field the engine (and the preview's target and
  guard override) can write into ONE module-level backup built once, runs the engine on
  state itself for <= 10 s = 500 ticks, stopping after the nadir, and restores every saved
  field exactly (in a `finally`), so state is unchanged on return (tested by hash and by
  interleaving). Integration changed this from a separate scratch object: running the tick
  engine on two object shapes made every field access polymorphic, ~90 ns per LIVE tick
  (130 vs 220 ns measured). Target ~0.1-0.3 ms; limit 5 ms (H-8). `securitySecond` re-runs it
  only when dirty, L moved (§11 grid) or `PREVIEW_REFRESH_S` passed.
* Hot-path details that matter: `step()` skips the `buf.length = 0` store (a runtime call) on
  empty ticks; weather tables are searched by bisection.
* `observe()` allocates (tens of us, more with `dayAhead`); par calls it at decision points
  only (every `PAR_DECIDE_EVERY_S`), never per tick. `hashState` once per grid-hour.
* **Test budget** (F-10 < 60 s with ~23 s of legacy baseline): the default run steps at most
  ~8 M ticks in `tests/integration.test.js` and ~8 M in `tests/autopilot.test.js` (short
  windows, injected trips at 04:31 instead of waiting for pre-rolled ones), and
  `tests/baseline-v4.test.js` runs `tools/baseline-v4.js --quick` (~10 s in its own process:
  the fixed probes and two par days); whole days over many seeds only with `GRIDWATCH_SLOW=1`.
* **Measured at the end of Phase 0.2** (the owner's laptop, Node 24, other work running): a par
  day took 2.0-2.3 s (`tools/par.js`; 2.2-2.5 s in `tools/baseline-v4.js`, which adds the H-8
  probes and per-tick checks), over the 1.6-s budget. Commit 3876c98 timed the same way took
  2.0-2.1 s, so the first-pass 1.15-1.35 s above was a quieter machine rather than lost speed;
  the finishing pass's preview trigger adds ~0.15 s (§11 grid). **Review-fix pass:** most of the
  overrun was the hourly `hashState` on the live state (§9); with the JSON-copy walk a par day
  takes ~1.5-1.8 s standalone (`runPar`; see SPEC S-12 for the `tools/baseline-v4.js` median).
* **Budget tests** (review fix): `tests/autopilot.test.js` times a par day on the main thread's
  CPU clock and `tests/physics.test.js` times `physics.tick`, each divided by a CPU yardstick
  measured in the same process (`tests/lib/speed.js`: float work on small objects that shares no
  code with the sim). The budgets (D-9's 2 x 1.6 s a day, ~0.3 us a tick) are stated on the owner's
  laptop and converted with the yardstick measured there, so a slow CI box passes and a slower
  engine fails. The old day test fell back to "par <= 1.5 x planOnly", which shares the engine
  and passed a 4x slower physics; the old tick bound was 2 us.

## 11. Module contracts

Reads and writes per stage B module (a write through a `fleet.js` action counts as fleet's):

| Module | Reads | Writes |
|---|---|---|
| physics | `tick`, `phys`, `units[].{mode, sync, schedMW, availMW, govMW, k}`, `battery.{schedMW, guardMW, socMWh, ffrFiredTick, pfrMW, ufSuspend}`, `tie.flowMW`, `ren.{windMW, solarMW}`, `rert.outMW`, `dr.mw`, `env.{demandMW, rooftopMW}`, `city.{shedFrac, coldLoadMW, roofDarkMW, roofOffMW}`, `ufls`, `ofgs`, `collapse`, `conts[contIdx]`, `hydro.storageMWh` | `phys.*` (incl. `renPfrMW`, `roofPfrMW`, `roofHoldFrac`), `units[].{govMW, outMW}`, `battery.{pfrMW, ffrMW, ffrFiredTick, outMW, socMWh, ufSuspend}`, `hydro.storageMWh`, `ufls.timerS`, `ofgs.timerS`, `collapse.bandS`, `black`, trace fields of `conts[contIdx]` (incl. `caught.inverterMW`), `acc.*` (adds, incl. `unservedMWs`, `spillMWs`); stages via `fleet.operateUfls` / `fleet.setOfgsStage` (through them `districts[].reconnectS`, `city.{roofDarkMW, roofOffMW}`) |
| grid | everything above plus `env` (incl. `rooftopMW`, `roofSubMW`), `last` (`fMeanHz`: the AGC term of the automatic cut), `agc.unmetMW`, `ren.{windAutoMW, solarAutoMW}` (`agcSecond`: units first while spilling), `control`, `sec`, `seed` (play stream) | `units[].{mode, timerS, agcTrimMW, schedMW, availMW, hotS, starts}`, base points via `fleet.setBasePoint`, `battery.{mode, orderMW, guardMW, schedMW, agcTrimMW, fullHold}`, `tie.{setMW, flowMW, tripped, lockoutS}`, `ren.*` (incl. `windAutoMW`, `solarAutoMW`), `hydro.warned`, `rert.*`, `dr.*`, `city.{coldLoadMW, lastRestoreS}`, `districts[].surgeMW`, `ofgs.okS`, `agc.*`, `fos.*`, `sec.*`, `acc.startCost`, `conts[contIdx].backInBandTick`; breakers via `fleet.setSync`, trips via `fleet.tripUnit`, districts via `fleet.setDistrictDark` and the roofs via `fleet.refreshRoof` (`districts[].reconnectS`, `city.{roofDarkMW, roofOffMW}`), re-arm / reconnect via `fleet.rearmUfls` / `fleet.setOfgsStage` |
| market | `env` (incl. `rooftopMW`, through `fleet.litDemandMW`), `units`, `battery`, `tie`, `ren` (incl. the manual and automatic curtailment), `ofgs.trippedFrac`, `rert`, `dr`, `city` (incl. `roofOffMW`), `sec`, `acc` (incl. `unservedMWs`, `spillMWs`), `hydro.storageMWh` | `price.*`, `score.*` (incl. `spillMWh`), `last.*`, `acc` (via `fleet.resetAcc`) |
| events (`applyDue`) | `ext.events`, `evNext`, `units`, `tie`, `smelter`, `scn` (the storm and cloud text timings; `scn.rooftop.capacityMW` for the DUCK wording) | `evNext`, `news`, `smelter.{returning, loadMW, returnS}`; trips via `fleet.tripUnit`, `tripTie`, `tripSmelter` |
| events (`mslSecond`) | `scn.rooftop.capacityMW`, `scn.clock`, `env.{s, demandMW}`, `tie.{tripped, lockoutS}`, `msl`, `tick`, the forecast passed in | `msl.*` |
| weather (`sampleSecond`) | `tick`, `seed`, `scn` (incl. `scn.rooftop`, `scn.temperatureC`), `ext.{heat, series, rooftop}` for the present second, `day`, `smelter.loadMW` | `env.*` (`roofSubMW` and `roofClearFrac` in place) |
| weather (`forecast`) | `scn` (incl. `scn.rooftop` and its cloud process, the public `scn.events` timings), `day`, `env` (incl. `roofClearFrac`), `news`, `smelter.{loadMW, returning, returnS}` (the announced return) | nothing |
| autopilot | `observe()` output only | its own memo |
| step | everything (orchestration) | `tick`, `over`, `log`, `control`, `sec.dirty`; `createState` also writes `ext.rooftop` (`weather.prerollRooftop`) and `day` (once, from `ext.regime.temp` and `scn.day`); `gridSecond` calls `events.mslSecond` |

Only `weather.sampleSecond` and `events.applyDue` read `ext`, and only for the present second;
`ext.regime.temp` is read once, by `createState`.
Nothing reads `ext` to anticipate the future.

### fleet.js (A, done, frozen; Phase 2a: the grid job's roof bookkeeping)

Phase 2a wave 1 (desk/README.md §19.2, §21.2; P-12, C-8, C-7) changed four rows: `preTrip`
(`inverterMW`), `setDistrictDark` (`reconnectS`, then `refreshRoof`), `districtColdLoadMW` (dark:
underlying pickup; lit: net load) and the new `refreshRoof`; `litDemandMW` is stage A's. New
invariant: `city.roofDarkMW` / `roofOffMW` are the rooftop off with dark districts / off in total,
from `env.roofSubMW` as of the last refresh (every grid second, and at every district change).

| Export | Does |
|---|---|
| `gridSecond(state) -> int` | `floor(tick / 50)` |
| `unitIndex(id) -> int` | index in `V.MACHINES` / `state.units`, or -1 |
| `buildUnits(scn)`, `buildStations(units)`, `buildCity(scn)`, `newAcc()` | construction (createState) |
| `resetAcc(acc)` | zero the accumulators in place (market, after each second) |
| `ekMWs(state) -> MWs` | sum of H x rating over sync units |
| `setSync(state, i, closed, why)` | breaker; keeps `phys.ekMWs`, `up/downSinceS`, `downWhy` (`why` 'trip' from tripUnit, else a planned stop), `sec.dirty` |
| `refreshLever(state, stationId)`, `stationRange(state, stationId)`, `setBasePoint(state, i, mw)` | K-1 levers (§5 stations) |
| `largestContingency(state) -> {kind, id, mw}` | H-4 L: largest sync machine output or tie import (ties to the lower index) |
| `startBlock(state, i)`, `stopBlock(state, i) -> ''\|reason` | S-11 / H-1 command rules (desk and grid use the same); minimum down time only after a planned stop (D1) |
| `preTrip(state)`, `startContingency(state, cause, id, lostMW, ekBeforeMWs, out)` | opens `conts[]` with `pre` (Phase 2a: `inverterMW` = `-(phys.renPfrMW + phys.roofPfrMW)`, last key), emits `contingency` |
| `tripUnit(state, i, cause, lockoutS, out) -> MW lost` | H-2/H-3/H-9: breaker open, lockout, base point to 0, contingency if > 50 MW |
| `tripTie(state, cause, lockoutS, out) -> signed MW` | K-6 link trip |
| `tripSmelter(state, offS, out) -> -MW` | load trip (over-frequency) |
| `setDistrictDark(state, d, dark, why) -> share` | keeps `city.shedFrac` exact; callers emit records. Phase 2a: dark -> `reconnectS = -1`; relit -> `reconnectS` = that second + `ROOF_RECONNECT_S`; then `refreshRoof` |
| `refreshRoof(state)` | Phase 2a (P-12, C-8): `city.roofDarkMW`, `city.roofOffMW` over all districts from `env.roofSubMW` and each district's off fraction (§5 city); resets a finished `reconnectS` to -1. Callers: `setDistrictDark`, `grid.fosSecond` |
| `litDemandMW(state)` | Phase 2a: `G x (1 - shedFrac) - (env.rooftopMW - city.roofOffMW)`, the lit operational demand (market, observe, the C-6 surplus) |
| `districtColdLoadMW(state, d)`, `DISTRICT_LIT` | K-13 cold load (Phase 2a: dark = the undelayed underlying pickup `G x share` x the cold factor; lit = its net load now); restorePermissive's reason for a lit district |
| `operateUfls(state, k) -> ids`, `rearmUfls(state, k) -> bool`, `setOfgsStage(state, k, tripped)` | relay stages with their invariants |

### weather.js

Stage A (done): `hourOfDay(scn, s)`, `secondOfHour(scn, h)`, `tableLinear(t, x)`,
`tableSmooth(t, x)`, `demandBaseMW(scn, h)`, `clearSkySolarMW(scn, h)`, `neighbourPrice(scn, h)`,
`exportLimitMW(h)`, `heatMultAt(heat, s)`, `prerollRegime(seed, scn)`,
`prerollSeries(seed, scn, regime, events)`, `fineNoiseMW(seed, s)`, `sampleSecond(state)`.

**B "market + events"**: `forecast(state, horizonS, stepS)` (shape in §8). Reads `scn`
(including the public timings in `scn.events`), `env`, `news` and the smelter's present load
and announced return (`smelter.{loadMW, returning, returnS}`); never `ext` (S-4 scramble test).
S-4: wind and solar drift from the present toward the climatological value, or toward the
**announced** regime (storm: surge then cut-out risk; drought; cloud front inside its warned
window; heat's clear skies) with `FC_DRIFT_TAU_S`; demand P50 = DEM x announced heat + the
present deviation decaying at the noise revert rate - the smelter's expected missing load;
P10/P90 = P50 -+ `Z_P90` x sd(lead), where sd is the forecast error of the scenario's own
demand-noise process (`scn.demand.noise`, an OU series) plus `FINE_NOISE_MW`: 0 at lead 0,
growing with lead (L-2 accept: 80 +- 5% coverage at 1 h and 4 h; measured 78.0% / 77.3%).
The stage A relative band (`FC_SIGMA_NEAR`..`FC_SIGMA_FAR`) covered 96% at 4 h and failed L-2;
those params are kept only for the §8.3 register. `neighbourPrice[]` and `exportLimitMW[]`
are the exact public shapes.

**Phase 2a "world"** (desk/README.md §21.1): `heatRampAt(heat, s)` (the 0..1 ramp of
`heatMultAt`, whose own expression is unchanged), `underlyingBaseMW(scn, day, h)` (P-3),
`rooftopClearSkyMW(scn, h)` (P-2: capacity x clear-sky factor x the shape table),
`prerollRooftop(seed, scn, events)` (C-5: `ext.rooftop`, or `null` at capacity 0; built on a
step-and-length-generic copy of the mean-reverting series, `ouSeries` itself untouched), and
`sampleSecond` and `forecast` with rooftop and day types (§5 env). `sampleSecond` also reads
`state.day`.

`forecast` on a day with rooftop. Underlying P50 = `underlyingBaseMW(day, h)` x announced heat
+ the decaying present deviation. Rooftop = the P-2 curve at ONE clearness, the suburbs'
capacity-weighted `env.roofClearFrac` (the rooftop factor is affine in k, so this is exact),
drifting from its present value toward `cloud.mu` (toward `events.heat.clearMu` from an
announced onset) by `regional.revertPerStep` per `cloud.stepS`, x the heat derate inside the
announced window. `demandP50` = underlying - rooftop - the smelter's expected missing load. The
band adds the rooftop's own forecast error, in MW at that column's sun: `(clear-sky MW x
cloudBite)^2 x [vR(n) + S2 x (vL(n) + sL^2 x (aR^n - aL^n)^2)]`, where vR and vL are the
regional and local variances grown over the n steps of lead (`sigma^2 (1 - a^2n) / (1 - a^2)`),
S2 the sum of squared shares (the local terms are independent), sL^2 the local term's stationary
variance, and the last term the part of the present deviation that was local and fades faster
than the forecast (which treats all of it as regional) assumes. It reads `scn`, `state.day`,
`env`, `news` and the smelter; never `ext` (the DESK scramble cases).
Measured on `desk`, seeds 1-200 (15-min intervals, the slow test's method): coverage of P10-P90
80.7% at 1 h and 79.9% at 4 h (L-2: 80 +- 5%; heatwave days 73.9% at 4 h: the unannounced heat is
the forecast's honest error). The aggregate rooftop forecast error is 2.9% of the forecast at
1 h and 3.1% at 4 h (sigma, daylight columns; L-2's starting values were 5% and 15%): the cloud
process forgets a deviation in about an hour and cannot be clearer than 1, so the error
saturates. That clamp also puts the mean clearness (0.937) under `cloud.mu` (0.95), which the
forecast drifts to: a bias of -0.6% of rooftop at 1 h and -1.1% at 4 h (+4 / +27 MW of
operational demand in daylight), small against the band and left labelled.

### events.js

Stage A (done): `prerollEvents(seed, scn, regime)`, `TYPE_ORDER`, `CONTINGENCY_TYPES`.

**B "market + events"**: `applyDue(state, out)`: apply every `ext.events[evNext..]` with `atS <=
s` in order; advance `evNext`. Effects: notices -> log; `heatAnnounce`, `stormWarn`,
`cloudWarn`, `windDrought` -> push a news record (§5, exactly its five keys) and an `announce`
event; heat onset/end, storm and cloud events -> log only (demand, derate and series already
carry them); `unitTrip` -> `fleet.tripUnit` on the rule's target (rule `largest`: the sync
unit with the largest output, lower index on a tie; rule `station`: that station's sync
machine with the largest output; none -> nothing); `linkTrip` -> `fleet.tripTie` (no-op if
already tripped); `smelterTrip` -> `fleet.tripSmelter` and `smelter.returnS = trip second +
offS`; `smelterReturn` -> `smelter.returning = true`. While returning, `smelter.loadMW` =
min(SMELTER_MW, max(loadMW, `SMELTER_RETURN_MW_MIN / 60` x (s - returnS + 1))): a function of
time, so it is the same called every second or after a jump. Invariant: each event applies
exactly once; nothing in ext is modified.

**Phase 2a "world"** (P-4; desk/README.md C-9, §21.1): `mslSecond(state, fc, out)`. step()
calls it straight after `weather.sampleSecond` on every `MSL_CHECK_S`-th grid second with that
second's `weather.forecast(state, FC_HORIZON_S, FC_STEP_S)`. It keeps `state.msl` (§5 "day and
msl") and pushes the §7 MSL record on every change of level; it returns at once on a scenario
with no rooftop. Reads `scn.rooftop.capacityMW`, `scn.clock`, `env.{s, demandMW}`,
`tie.{tripped, lockoutS}`, `msl`, `tick` and `fc`; writes `msl.*`. No new import.
Measured by the world job under its first rule, which raised every threshold for the whole
window while the tie was out NOW (weather and events only, no input; the tie's lockout counted
as `grid.unitsSecond` does): on mild weekends (`desk-weekend`) MSL1 is reached on 14.9% of days in seeds 1-200 (15 of
101) and 21.0% in seeds 1-1,000, MSL2 on 0% and 1.3%, MSL3 never (P-4: 10-30%, <= 10%); on
mild weekdays MSL1 on 0.4%, on HOT and heatwave days never. The first notice of the day follows
a tie outage on 59 of 113 days, a potline trip on 49 and neither on 5 (seeds 1-1,000). A potline
notice has no lead (the trip is the news); a tie-out notice raised in the morning has up to
4.5 h (median 175 min), but 35 of the 37 first notices with >= 2 h of lead were cancelled before
their minimum arrived, because the tie came back first (C-9 raises every threshold for the whole
window while the tie is out NOW); the 5 with no contingency are a clear sky with demand ~150 MW
under its curve, seen only as it happens (lead 0). Stage C rewords P-4's lead clause (C-9). Not
built, measured for it: raising the threshold only for the columns before the tie's public
return time (`tie.lockoutS`) gives MSL1 16.7%, MSL2 1.3%, and 5 of 8 early notices standing.
**The wave-1 merge adopted that per-column rule** (desk/README.md §25 M-1): the code and §5 "day
and msl" describe it; the slow P-4 test (seeds 1-200) passes with it.

### physics.js (B "physics")

`tick(state, out)` and `previewTrip(state, target, opts) -> {nadirHz, nadirS, lostMW,
uflsStages, black, caught}` (JSDoc in the file). Order inside `tick`:

1. `fHist[tick % 32] = fHz` (`FHIST_LEN` is a power of two, indexed with a mask; checked at
   load); `rocofHzS` over 25 ticks.
2. `ufSuspend` hysteresis (49.85 / 49.90).
3. Governors, units with mode `'on'`: `fd = fHist[(tick - govDeadTicks) mod 32]`; `e` =
   `fd - F0` outside the +-0.015 deadband (0 inside, reduced by the deadband outside);
   `target = -e x govGainMWperHz`, clamped to +-`govCapMW`, then to headroom
   [-max(schedMW - minMW, 0), max(availMW - schedMW, 0)]; `govMW += (target - govMW) x govAlpha`. Other sync
   units decay `govMW` to 0 at the same alpha. Governors are symmetric (H-7 over-frequency).
4. Battery: `effSched = schedMW`, but 0 when (`ufSuspend` and `schedMW < 0`; with
   `UF_RESUME_LINEAR` it re-engages in proportion between 49.85 and 49.90), when discharging
   at `socMWh <= 0`, or when charging at `socMWh >= BATT_MWH`. PFR target =
   -clamp(e_db / 0.85, -1, 1) x BATT_MW on f delayed 5 ticks, lag 0.1 s; guard: fires when
   `guardMW > 0` and f < `GUARD_TRIGGER_HZ` (no dead time), ramps to `guardMW` over 1 s,
   holds `GUARD_SUSTAIN_S`, ramps off over `GUARD_RAMP_OFF_S`, re-arms when f >= 49.85 after
   that; total capped at +-BATT_MW and by SoC, trimming PFR first, then the guard, then the
   schedule itself, so `outMW === effSched + pfrMW + ffrMW`. **SoC power taper**
   (integration): within a few MWh of empty (full) the total discharge (charge) is limited to
   sqrt(2 x `BATT_DISPATCH_RAMP_MW_S` x E), E the MW s left to empty (to fill, grid side), so
   the output reaches 0 at the dispatch ramp instead of stepping off (a BMS derating power near
   its SoC limits); 0 at exactly empty (full). Without it PFR, which the grid's schedule taper
   cannot see, filled a battery charging ~250 MW and the charge stepped off at 100%, a
   self-made over-frequency event that blacked out doNothing nights. Integrate `socMWh` and
   clamp it to [0, BATT_MWH].
5. `outMW = schedMW + govMW` for sync units; integrate `hydro.storageMWh` (>= 0).
6. UFLS (8 stages from 49.0 by 0.125, 0.3 s delay each, the stage timer resets if f recovers
   above its threshold before it operates; operate = `fleet.operateUfls(state, k)` and a `ufls`
   record); OFGS (4 stages 51.0-51.75, 0.3 s, 25% of wind each, `fleet.setOfgsStage`).
7. Load on net blocks (Phase 2a: P-12, C-8; the §5 phys formulas on `G = env.demandMW +
   env.rooftopMW`): `shedMW` (the relay MW: net), `servedMW`, the unserved rate (underlying),
   `loadReliefMW` (= served x LOAD_RELIEF x (F0 - f) / F0). Then the inverters' over-frequency
   response (C-7): `renPfrMW` and, through the held `roofHoldFrac`, `roofPfrMW` (§5 phys);
   `loadMW = servedMW - loadReliefMW + roofPfrMW`. No district loop: `fleet.refreshRoof` keeps
   `city.roofDarkMW` / `roofOffMW` (also when a UFLS stage operates in step 6, so the same tick's
   load already has the stage's rooftop off). The `ufls` record's `mw` is the stage's net load:
   `G x` the change of `shedFrac` less the change of `city.roofOffMW` across `fleet.operateUfls`
   (the rooftop its districts had connected; §7 for a district still reconnecting).
8. `supplyMW` = outputs + tie + wind after OFGS + solar + RERT + battery - `renPfrMW`;
   `imbalanceMW = supplyMW - loadMW`; `fHz += F0 x imbalanceMW x DT / (2 x ekMWs)`; clamp
   [46.5, 53.5]; `ekMWs <= 0` -> black ('inertia').
9. Collapse (H-7) -> `black = true`, `black` record.
10. Readouts (`renPfrMW`, `roofPfrMW` too), contingency trace while `tick < watchEndTick`
    (`rocofHzS` of the first tick, extreme, `caught` = readouts at the extreme minus `pre`,
    `inverterMW` = `-(renPfrMW + roofPfrMW)` among them, `uflsStages`, `contained`),
    accumulators (when `acc.ticks === 0`, `fMinHz = fMaxHz = f` first; `unservedMWs` adds the
    unserved rate, `spillMWs` adds `renPfrMW`).

Phase 2a measurements (the grid job, the owner's laptop with another job running; best of 9 x
200,000 ticks on the seed-5 opening state, in yardstick units so the load cancels): the tick
cost 1.78-1.87 units before (135-152 ns), 1.85-1.90 with the code and the flags off, 1.87-1.91
with the flags on (138-160 ns): about 5 ns more, against a budget of 4.29 units (300 ns).
The preview's backup, save and restore carry every field the engine or `fleet.setDistrictDark`
now writes (`phys.renPfrMW`, `roofPfrMW`, `roofHoldFrac`; each district's `reconnectS`;
`city.roofDarkMW`, `roofOffMW`; the two new accumulators), tested by hash for every preview
kind with a Solstice Rise district dark and another reconnecting.

C-7 measured with the flags on (hand-driven poked noon, `tests/belly.test.js`): from the
curtailing state (510 MW held back, battery full, six units at MIN) a 256-MW load loss peaks at
50.232 Hz and a trip of the tie at 300 MW export at 50.273 Hz (50.260 Hz with 3,465 MW of
rooftop connected: the roofs start backing off at 50.25 Hz), with no OFGS stage; with the flags
off the same two events reached 51.660 and 51.829 Hz with three and four OFGS stages. The droop
is stateless and on rating, so it does not overshoot; the dispatch's feed-forward cut then takes
the MW over at its ramp (about 30 s) and the frequency returns to 50 Hz. The H-7 desk-lab midday
case (`tools/baseline-v4.js`: two coal machines, 6.5 GW.s, -650 MW, no battery) no longer
overshoots to 52 Hz after its over-shed: peak 51.082 Hz, one OFGS stage, not black (was black at
52.110 Hz after 1.10 s). Rebuilt on a mild 12:30 with net-load blocks (operational demand 2,400
MW, 3,465 MW of rooftop, 700 MW solar, 400 MW wind, no tie flow; Solstice Rise net negative):
no battery, nadir 47.435 Hz, all 8 stages for 1,295 MW of net load (2,942 MW of customers dark),
peak 50.440 Hz, not black; with the battery, nadir 48.451 Hz, 3 stages for 396 MW net (1,093 MW
of customers dark). The same supply with no rooftop sheds 447 MW of customers in 3 stages: with
rooftop behind them the static blocks darken about 2.4 times the customers for the same relief
(P-12; SPEC §8.2 "ufls-blocks"). On the classic day (no rooftop, never a surplus) the droop is
the one thing of Phase 2a wave 1 that moves: it acts whenever the frequency is above 50.015 Hz
with wind or solar generating, so par's days diverge after the first such second. Par, seeds
1-48, before -> after: black 0 -> 0; days with nothing unserved 45 -> 44; highest frequency of
any day 50.275 -> 50.152 Hz; energy backed off 15.5 MWh a day on average (18.8 at most), counted
in `score.spillMWh`.

`previewTrip` runs the same step function on state itself between a save and an exact
restore (§10) with schedules, demand and renewables frozen (no grid seconds; the inverters'
over-frequency response, C-7, is in the engine, so the preview shows it and `caught.inverterMW`
carries it), for <=
`PREVIEW_HORIZON_S`, stopping once f has risen for `ROCOF_WINDOW_S` after the nadir (and only
when the battery cannot run dry inside the horizon and no charge step is pending). State is
unchanged on return (tested by hash, and by interleaving calls between two runs). Targets:
`unit`, `link`, `load` (mw > 0: the extreme is the PEAK), `district` (a restore preview: its
cold-load MW, the undelayed underlying pickup of P-12, since its rooftop waits `ROOF_RECONNECT_S`,
longer than the horizon; `pre.uflsMW` leaves the relit district's net MW out) and `none` (removes nothing); an
unknown kind, unit or district, or `guardMW` outside 0..BATT_MW throws before state is
touched. `opts.guardMW` overrides the guard and clamps the battery schedule to
+-(BATT_MW - guardMW); the clamped MW (effective, after the SoC and H-10 rules) are carried as
a net-demand offset (env.demandMW - moved) so the preview starts balanced (the K-5 test
specifies "the same fleet, battery idle, 400 MW less demand"), and come off `pre.batteryMW`.
`caught` as in §5 conts, relative to the state's readouts. K-10: it matches the real nadir
within 0.02 Hz in the same state, also through `step()` with AGC and ramps running (the real
run's schedules move only by ramps in the first seconds).

Contingency records: the extreme is judged on each traced tick's START frequency;
`extremeTick` is that tick and `caught` that tick's readouts minus `pre` (so a UFLS stage
that turns the fall is counted); the last frequency is judged too at black and at the end of
a preview.

Spec IDs: H-8 (RoCoF 1%, inertia raises nadir >= 0.2 Hz, containment, 10-s run <= 5 ms), H-6
(no shedding above 49.0; 0.30 +- 0.02 s; no automatic restore), H-7, H-10, K-5, K-10, K-11, F-4;
Phase 2a: P-12, C-8 (net blocks, unserved on the underlying load), C-7 (H-8 / risk 10: the
inverters' over-frequency response). `tests/belly.test.js` holds the Phase 2a cases.

### grid.js (B "grid")

`applyCommand(state, cmd, out) -> ''|reason`, `unitsSecond`, `agcSecond`, `dispatchSecond`,
`fosSecond`, `securitySecond` (all `(state, out)`), `security(state, opts) -> {r5MW, lMW, lKind,
lId, riskMW, ratio, previewNadirHz, previewUnitHz, previewLinkHz, level}` (THE reserve function,
H-4; pure), `restorePermissive(state, d) -> ''|reason` (pure). Phase 1a: `newPlan()`,
`planSecond(state, out)` (the plan's executor), `syncAt(u, tick) -> {slipHz, phaseDeg}` (pure),
`syncTick(state, out)`, `SYNC_BLOCKED`, `REFUSAL_CUES`. Details in the JSDoc and in §5-6. Key
rules:

* **The plan's executor** (Phase 1a, `planSecond`, right after `events.applyDue`): booked STOPs,
  then STARTs, due now go through the input path (`applyCommand`; a refusal drops the booking
  with a `log` record, code `PLAN`); keys older than `PLAN_HISTORY_S` are dropped; for each
  station not MAN: a clamped key is re-applied once when the on-line count rose; the next key
  (the first after `doneS`) applies through the basePoint path when `atS <= s` (only the latest
  past key) or `s + |mw' - lever| / ramp >= atS` (mw' clamped to the station's range, ramp = Σ
  rampMWs of its 'on' machines; with none on, at atS), then `doneS = atS`, `clampedMW = mw -
  applied`; the tie's keys set `tie.setMW` the same way at `TIE_RAMP_MW_MIN`. Anything applied
  sets `sec.dirty` (as the plan's inputs did in 0.2) and `plan.rev += 1`. It runs during the
  watch too: the watch locks the desk, not dispatch.
* **Synchroscope** (Phase 1a, K-12): see §5 units and §6; `syncClose` judges `syncAt(u, tick +
  SYNC_BREAKER_TICKS)` (the breaker closes at the command's tick; the outcome is judged 80 ms on,
  where the player aims): blocked (|slip| > `SYNC_BLOCK_SLIP_HZ` or |angle| > `SYNC_ROUGH_DEG`),
  reverse (slip < 0: closes with no block, trips after `SYNC_REVERSE_TRIP_S` back to 'ready' with
  a new slip, no lockout), rough (slip >= 0, `SYNC_CLEAN_DEG` < |angle| <= `SYNC_ROUGH_DEG`: the
  block plus `SYNC_ROUGH_MW` for one second), clean; HAND + bypass on a blocked close: closes,
  then `fleet.tripUnit` with `SYNC_BYPASS_LOCKOUT_S`. The background auto-synchroniser (AGC,
  `AUTO_SYNC_S` after 'ready') waits while the unit is on the scope and is always clean ('auto').

* Unit state machine per §5; auto-sync after `AUTO_SYNC_S` in AGC mode only (HAND:
  manual `syncClose`); breaker close picks up `syncBlockMW`, then T2 linear to MIN; unloading at
  ramp to MIN, then T4 linear to `breakerOpenMW`, then the breaker opens (the only step, <= 5%).
  The sync block and the breaker-open level are capped at MIN (hydro, MIN 0, closes at 0 MW and
  is 'on' at once). The transitions follow `schedMW` reaching MIN or the breaker-open level;
  `timerS` is a display countdown (and what the market reads for starting / ready units: T1
  left, then the auto-sync wait, 0 in HAND). Reaching `'on'` sets the base point to `minMW` via
  `fleet.setBasePoint`. A heat derate lowers output at the unit's ramp, not as a step. Hydro at
  `HYDRO_STOP_MWH` is forced to unload and cannot restart or abort the stop.
* Hot trip (H-2): `hotS > HOT_ARM_S` and `uniform(seed, STREAM.PLAY, tick, k) <
  HOT_TRIP_PER_H / 3600` once per grid second -> `fleet.tripUnit(..., 'ran above 96% too long',
  HOT_TRIP_LOCKOUT_S, out)`.
* AGC (K-2): integral on ACE from `last.fMeanHz`, participation by band, never starts/stops
  units or moves base points, 0 in HAND; `agc.atLimitS` counts grid seconds the request
  exceeded all bands. A unit's raise band stops at `HOT_LOADING_FRAC` x availMW (the
  overload gate is its high regulating limit), so AGC never makes a unit run hot (H-2); only
  a lever moved past the gate does. Phase 2a (C-6): while the dispatch is spilling wind or solar
  (`ren.windAutoMW` or `solarAutoMW` > 0) a LOWERING request goes to the units first, pro rata
  by their room above MIN and as far as MIN (beyond the regulating band: thermal energy is out
  of merit while renewables are spilled, and the feed-forward cut assumes every unit at its
  floor), and only what they cannot take goes to the battery's band. A raising request, and
  every request on a second with nothing spilled, is shared pro rata within the bands as before,
  so a day that never spills (the classic day) is unchanged (48 of 48 par days end on the same
  hash, flags on and off).
* Battery: `schedMW` toward clamp(signed order + trim, +-(BATT_MW - guardMW)) at the dispatch
  ramp (K-5: guard MW are never available to orders). Near empty / full the schedule (and
  the AGC band "within SoC") is held to P <= sqrt((r/2)^2 + 2 r E) - r/2, the most the
  dispatch ramp r can still bring to 0 in whole seconds with the energy E left (an energy
  management limit; physics applies the continuous form to the total output, §11 physics).
* Tie: the export cap limits the target; a lower cap is reached at the tie ramp.
* Renewables (integration): the curtailed MW move at `CURTAIL_RAMP_FRAC_MIN` (§5 `ren`); DR at
  `DR_RAMP_MW_MIN` (§5 `dr`). Tripped wind reconnects one OFGS stage per
  `OFGS_RECONNECT_GAP_S`, the last to trip first.
* **Automatic curtailment** (Phase 2a, C-6; `dispatchSecond`, last, on this second's schedules).
  `surplusMW` = must-run + wind after the manual LIMIT and OFGS + utility solar after the manual
  LIMIT - (`fleet.litDemandMW` + `city.coldLoadMW` - `dr.mw` - `tie.flowMW` - the battery's
  schedule on its order). Must-run is the price stack's floor blocks (MIN of every unit 'on', 0
  for hydro; the present output of a unit loading, unloading or shutting down) plus reserve
  diesel on line (`rert.outMW`: out of the market, but as real; an extension of the contract's
  wording). The battery term is `schedMW - agcTrimMW`, kept between the schedule and the order's
  own target: the dispatch counts the player's order, never AGC's trim, or a trim once given
  would be matched by less curtailment and stay (an idle battery would fill by itself with the
  plan at MIN). While
  `surplusMW` > 0 the cut = min(that wind and solar, `surplusMW` + AGC's unmet lowering
  request), else 0. The request: while `agc.unmetMW` is negative (at AGC's last cycle every
  lowering band of the units and the battery was spent and the frequency was still high, so AGC
  LIMIT is lit while it acts), `AGC_BIAS_MW_PER_HZ` x (`last.fMeanHz` - F0) beyond AGC's
  deadband: the ACE of the second just completed, read every second, so it fades as the frequency
  returns. (Held for the 4-s AGC cycle it overshot inside the governors' deadband and hunted
  against AGC's own raise; measured with the units at MIN and the battery charging on its whole
  inverter, a 12-s cycle of 49.970-50.022 Hz held, 49.994-50.014 Hz read every second. It is
  smaller, not gone: `agc.unmetMW` still flickers negative there for about a third of the
  seconds, 4 s at a time, and a few MW more than the surplus are spilled.) It is added only in a
  surplus: outside
  one, AGC at its lowering limit means the plan holds units above what is needed; they have
  governor room and the remedy is the plan, not spilling wind while gas runs above minimum
  (measured with the request added unconditionally: 4 of 48 classic par days spilled wind with
  no surplus, seed 17 for 908 s around midnight with thirteen units 1,400 MW above their
  minimums; the contract review had found AGC's lower limit reached on 0 of 86,400 s, on seeds
  1-5). Outside a floor surplus a stale plan is therefore held by the units' AGC bands, their
  governors and the inverters' droop alone (measured, AGC on, battery full, floor blocks 50 MW
  short of a surplus, 30 min: a plan 300 MW above MIN parks at 50.02 Hz, 600 MW at 50.13 Hz,
  1,000 MW at 50.28 Hz, 1,500 MW at 50.70 Hz with the governors at their cap; never an OFGS
  stage; reported for stage C). `windAutoMW` and `solarAutoMW` move toward their pro-rata
  share (by present output; wind after OFGS) at `CURTAIL_RAMP_FRAC_MIN`, never above what the
  manual LIMIT leaves, and back to 0 as the surplus goes. While a cut is active it is a cap on
  OUTPUT, as the semi-dispatch cap is: a change of availability lands on the held MW first, in
  either direction (MW the weather takes from a plant that is held back come out of the held MW;
  MW it gives back are held too, then released at the ramp if the surplus has room: 350 MW of
  solar back in one second peaks at 50.03 Hz, 50.32 Hz when they went straight to output). The
  tie and the battery are never moved by the dispatch. While it is spilling, AGC lowers the
  units to MIN before it uses the battery (the AGC rule above), so a plan above MIN in a surplus
  comes down to the floor the cut assumes: falling into a 510-MW surplus on a plan 300 MW above
  MIN ends with every unit at MIN, 510 MW held back and 50.000 Hz, and an idle battery at 50% in
  a standing 500-MW surplus gains under 1 MWh in 30 min with the plan 60 to 600 MW above MIN
  (22.7 to 167.8 MWh when the request was shared pro rata). Coal comes down at 3 MW a minute a
  machine, so after a step AGC's request is unmet until the units arrive and that is spilled
  meanwhile (a 510-MW step on a plan 300 MW above MIN: peak 50.41 Hz, up to 72 MW more than the
  surplus spilled for about 15 min, then the surplus alone). **Not held:** once every unit is at
  MIN and every MW of wind and solar is held back (must-run above demand, MSL3), AGC's lowering
  band on the battery is all that is left and an idle battery with room does charge (210 MW in
  a 210-MW deep belly, 89 MWh in 30 min at the floor price): the contract's order, "after the
  units' and the battery's bands"; whether AGC should keep that band while the battery is idle
  is stage C's call. In HAND the feed-forward term works unchanged (AGC's term is 0);
  levers held above MIN are not lowered for the player: the excess is carried by governors and
  the inverters' droop at a raised frequency (measured: 300 MW above MIN parks at 50.13 Hz with
  the C-7 droop on, 50.21 Hz without it) until a lever moves. With the surplus exactly cut and every unit at its floor the second is balanced
  to rounding, so AGC and an idle battery do nothing. Measured (hand-driven noon, `tests/
  belly.test.js`): demand falling 0.25 MW/s under a 1,310-MW must-run fleet with the battery
  full stays at 50.000 Hz with 510 MW held back (the stage A sim went black at 52 Hz).
* The restore surge is the pickup beyond the district's share of the total before rooftop;
  `fosSecond` calls `fleet.refreshRoof` beside the cold-load refresh (P-12, Phase 2a).
* Directed shedding (FOS and DIRECT SHED): the lit rotation district restored longest ago
  (never shed first), ties by rot (§6). Phase 2a (desk/README.md §25 M-2): a district whose net
  load is zero or negative (feeding back at a sunny noon) is passed over while any other lit
  rotation district has load to give; shedding it would take generation off.
* **N-1 over both credible contingencies** (Phase 1a, A-2, `N1_PREVIEW_ALL`): the TRIP PREVIEW
  runs for the largest unit and for the tie import; SECURE needs R5 >= 1.25 L and **both**
  previews >= 49.5 Hz + margins; `lKind` / `lId` / `previewNadirHz` name the worse one (ties to
  the unit), `lMW` stays the larger MW. The link is previewed only while the import exceeds the
  largest unit's output: a link trip of no more MW keeps every machine's inertia and governor, so
  it is never deeper (0 of 3,578 par-day states in the Phase 1a check), and `previewLinkHz` then
  carries the unit's nadir as its bound. With the flag false, only L (the larger MW) is previewed,
  as in Phase 0.2.
* R5 (H-4): only mode 'on' units count (loading and stopping units offer no headroom, H-1);
  battery `min(BATT_MW - outMW, socMWh / 0.5 h)`; tie `min(800 - flow, 100 x 5)` if not tripped.
  SECURE needs R5 >= 1.25 L **and** preview nadir for losing L >= 49.5 Hz + `PREVIEW_MARGIN_HZ`
  (0.05) + `PREVIEW_AGE_MARGIN_HZ_S` (0.001) x the cached preview's age in grid seconds (tuning
  pass: the frozen-schedule preview missed the live nadir by up to 0.105 Hz, and a 40-s old
  one by 0.07 Hz; with the margin 0 of 1,000 SECURE states missed 49.5 Hz, H-8 slow test).
* **Preview refresh** (`securitySecond`): re-run when `sec.dirty` (every accepted input,
  `fleet.setSync`, trips), when L's id differs from `sec.previewLId`, when |L - previewLMW| >
  `PREVIEW_L_TOL_MW`, when |f - `previewFHz`| > `PREVIEW_F_TOL_HZ` (0.03 Hz; finishing pass),
  or `PREVIEW_REFRESH_S` after `previewAtS`; then set `previewAtS`, `previewLId`, `previewLMW`,
  `previewFHz`, clear `dirty`. The frequency trigger exists because the preview starts from the
  present frequency and governor state: `tools/baseline-v4.js` found 5 of 1,595 states the desk
  showed as SECURE that missed 49.5 Hz when L tripped (worst 49.417 Hz). Four came 3-20 s after
  an excursion to 50.06-50.25 Hz or 49.95 Hz (governors wound down, or already spent) had left the
  cached preview 0.07-0.17 Hz above a fresh one; with the trigger, 0 of 4,299 probes missed (§12,
  finishing pass). It raises previews from ~4,000 to ~6,800 a day (+0.15 s). The fifth was in the
  grid second after par released the GUARD: the level is recomputed only at the grid second, so
  for the rest of a second in which an input was accepted `sec.dirty` is true and the level is
  the one computed before the input (a display latency of under one grid second, which the desk
  can show from `observe().sec.dirty`; not changed).
* FOS (H-11) on `last.fMeanHz`: countdown 300 s while outside 49.85-50.15; directed shedding
  (one rotation district per 60 s) when the countdown ends below 49.85 or after > 60 s below
  49.5; it stops when frequency **recovers**: `last.fMeanHz >= NORMAL_LO_HZ`. No automatic
  restore. A contingency's `backInBandTick` is the first tick of the first completed
  post-trip second whose min and max frequency both lie in the normal band.
* K-13 in 0.2: permissive (`last.fMeanHz >= 49.9`, 300 s since the last restore; with
  `{preview: true}`, on the restore input only, a RESTORE PREVIEW `previewTrip` kind 'district'
  whose nadir must be >= 49.5 Hz + `PREVIEW_MARGIN_HZ`; tuning pass: it replaced R5 >= 1.2 x
  cold load, which passed restores whose surge set off UFLS again; the unused
  `RESTORE_R5_RATIO` was removed in the review-fix pass) and the cold-load surge (`surgeMW`
  decaying linearly over 10 min into `city.coldLoadMW`); no procedure bay yet.

### market.js (B "market + events")

`buildStack(state) -> [{id, kind, offer, mw}]` (total order), `clearPrice(state) -> {mwh,
marginalId, adder, exhausted, x}`, `scarcityAdder(x)`, `clampPrice(p)`, `waterValue(frac)`,
`priceSecond(state, out)`, `settleSecond(state, out)`, `scoreSummary(score)` (A). Details in
the JSDoc. Decisions: market demand = the LIT operational demand (`fleet.litDemandMW`: Phase 2a,
net of the rooftop still connected; env.demandMW x (1 - city.shedFrac) with no rooftop) +
city.coldLoadMW - tie.flowMW - battery.schedMW (scheduled flows, P-5; review fix: load shed and
still dark is not dispatched for); stack membership per unit mode (H-1: loading / unloading / shutdown units offer only
their present output, at the floor; starting / ready units only if <= 10 min from MIN; off
units only if `startBlock` is '' and T1 + T2 <= 10 min, auto-sync not counted); wind and solar
in the stack at their AVAILABLE MW (`env.windAvailMW` net of OFGS, `env.solarAvailMW`: a
curtailment LIMIT never raises the price; review fix), in settlement as dispatched; RERT is never in the stack and its MW are not subtracted
from market demand (P-8 "as if absent"); the tie is price-taking and enters only through
market demand (P-5); CUSTOMER COST never includes the market bill or anything x unserved.
Stage B choices: an ACTIVE DR call stays in the stack at its delivered `dr.mw` and DR_PRICE (a
dispatched block is priced like a generator; otherwise the price would sit at the cap exactly
while DR holds the system); hydro at or below `HYDRO_STOP_MWH` offers only its present
output; `marginalId` is '' when the price is administered (the cap while directed shedding is in force,
i.e. a district dark with shedBy 'directed', or when the stack cannot cover the lit demand;
review fix: UFLS districts waiting to be restored used to hold the cap for hours) and at the floor with an empty stack; unserved energy is split by the dark
districts' `shedBy` at the end of each second (booked as UFLS if nothing is dark then);
`outsideNormalS` counts seconds whose MEAN frequency is outside the normal band; no-load uses
`sync` at settle time; `marketBill` = price x served MWh (information only); `genMWh` is the
region's generation (units, wind after OFGS, solar, RERT), S-3's denominator.
Phase 2a (the grid job; P-9, P-12, C-6..C-8): unserved energy is settled from `acc.unservedMWs`
(the dark customers' underlying load), split by `shedBy` with the same weights; `last.shedMW`
stays the relay MW (`acc.shedMWs`). `spillMWh` adds each second's curtailment (the manual LIMIT's
and the dispatch's, wind net of OFGS) and what wind and solar backed off by over-frequency
response (`acc.spillMWs`), which also comes off `genMWh`; spilled energy is never a cost. The
belly's price needs no rule of its own: the stack offers AVAILABLE wind and solar, so in a
surplus the lit demand clears on their offer (`RENEWABLE_OFFER`, P-9) and, when the minimum-load
blocks alone exceed it, on the floor; the automatic cut never moves it (P-5).

### autopilot.js (B "autopilot")

`preDispatch(obs) -> plan` (with `plan.load`, its planLoad input), `planUpdates(obs, memo, tags?,
opts?) -> Input[]`, `createAutopilot(opts) -> memo`, `decide(obs, memo) -> Input[]` (<= 1),
`replan(obs, memo) -> planLoad|null` (the player's RE-PLAN / RE-DISPATCH), `refRealSeconds(fromS,
toS, conts)`, `runPar(seed, scenario, opts) -> {score, summary, log, origins, hashes, black, plan,
state, memo}`. JSDoc has the details. The contract:

* **L-0 plan.** Computed once at 04:30 from `observe(state, {dayAhead: true})`: a merit-order
  schedule for the P50 forecast net of wind and solar (P-6 offers; the tie as a price-taking block
  at the neighbour's price: import when it is below the marginal offer, export when above),
  obeying start times, ramps and min up/down times, ignoring N-1, hazards, drift and the noon
  minimum. Phase 1a: the result is a `planLoad` input (`plan.load`): arrive-by keys at the 5-min
  column times (atS = the column the value is for; at most one per station and column; whole MW),
  the tie's keys, and the booked STARTs and STOPs, sorted. Deterministic per seed and version.
* **Executing the plan** (Phase 1a). The plan lives in state (§5 plan); the grid's executor moves
  the levers, the tie and the bookings (K-2, L-6). Par sends `planLoad` inputs only: the 04:30
  plan without its stops (S-4; origin `'plan'`), and after each discrete action the **re-plan**
  (SPEC S-4, §8.2; `amend`: every lever and the tie from then to 04:00 over the present
  commitment and the plan's pending STARTs; origin `'replan'`, not paced), queued in
  `memo.outbox` by `decide()` and sent by `planUpdates()`. After a start, an order or a restore
  the re-plan waits for the next decision (obs shows the effect); after rule 1 or 2 moves the tie
  it is sent at once, with the tie's hold written into its tie keys (no separate hold). Rule 7's
  action is itself a re-plan (a `planLoad`, origin `'rule7'`, paced). A proxy that never amends
  its plan (planOnly, and `app/system.js`) re-flows it for the lit load while districts are dark
  (`reflowLit`, a `planLoad`: at once when the dark share moves, then every `PLAN_REFLOW_S`), as
  NEM dispatch targets metered demand (L-0: never black with no input). The player's RE-PLAN
  (bench) and RE-DISPATCH (game, A-1) are `replan()`: par's amend over the player's commitment,
  keeping the booked STOPs.
* **Discrete actions** (`decide`, origin `'rule1'..'rule9'`): S-4 rules 1-8 in order, plus
  rule 9 (restore, §12), at most one per `PAR_ACTION_GAP_REAL_S` of `refRealSeconds` (D-2
  profile, unwrapped hours, plus each contingency's watch, respond card and RESPOND segment),
  never in a watch, never before 04:30. Tuning pass: rule 8 is an adequacy walk (firm units
  and tie at their real limits plus an energy-limited pool of water, DR hours and battery
  energy above its reserve; arm only on a shortfall the 20-min lead can reach, or earlier when
  energy-driven; DR saved for the peak; stand down when the walk without the diesel is clean,
  asked first by rule 4); rule 1 calls DR when no peaker is left to start; rule 9's estimate
  uses the restore preview's line. Review-fix pass: rule 6's window end (a discharge order past
  22:00 or at the 20% reserve) is asked right after rule 1 (origin 'rule6'); rule 2 raises the
  GUARD only as far as the battery sustains it for `GUARD_SUSTAIN_S`. The file header lists
  each extension.
* **The belly** (Phase 2a: SPEC S-14 rules 2-4, P-12; desk/README.md C-12, §21.3, §25). On a
  scenario with no rooftop, a price that never reaches $0 and nothing spilled (the classic day)
  every line here is exactly the pre-2a behaviour.
  * *Lit operational demand.* A dark district takes its roofs off with its feeder, so the lit
    load is not a proportional slice of operational demand. The dispatch (`context`), the
    lit-load re-flow and the adequacy walk read the present from `obs.demand.litMW` and a
    forecast column as `(demandP50 + rooftopMW) x (1 - dark customers) - rooftopMW x (1 - dark
    rooftop)` (`litMW`, `darkShare`: a district holds an equal part of its suburb's nameplate,
    from `obs.rooftop.suburbs`). Wind and solar are read as AVAILABLE (`obs.wind.availMW`, the
    forecast; the walk adds back `autoMW`), so what the dispatch is holding back in a surplus
    (C-6) is never a shortfall. The plan's day-ahead columns carry the rooftop (`plan.fc.roof`).
  * *The plan in a surplus.* Units to their floor, the tie to the export limit (par exports only
    to absorb must-run), the rest left to the sim's cut: the column's `gap` is negative.
  * *Rule 6 gains S-14 rule 2*, a union with its window: charge whenever `obs.price.mwh <= 0` or
    `obs.wind.autoMW + obs.solar.autoMW > SURPLUS_MIN_MW`, while the battery is below
    `PAR_BATT_CHARGE_TO`. The order is the charge already ordered plus what is still spilled
    (the sim's cut is net of the order), never less than the window's rate, at most
    `PAR_BATT_CHARGE_MAX_MW`, and no more than reaches `PAR_BATT_CHARGE_TO` by par's next
    possible action. A belly order (`memo.belly`) is held while the surplus still feeds it and
    comes down by what the thermal units carry above their floor (else it flapped at every
    decision: the order takes the whole spill, so the price turns positive and nothing is spilled).
  * *Rule 4 gains S-14 rule 4*: after the gas units, and only once none is committed, ONE coal
    machine a day (`PAR_COAL_STOPS_DAY`, `memo.coalStops`) is stopped if the forecast is at or
    below MSL2 (per column `+ MSL_TIE_OUT_MW` before the tie's return) for `PAR_COAL_MSL2_H` and
    `eveningHolds`: in every plan column until the machine could be back at MIN (unload, T4,
    minimum down from breaker open to the next START, `startToMinS`), the other machines on,
    coming or free to start at `PAR_MAX_LOADING`, hydro at rule 5's release rate and the tie at
    its secure import, less the largest single loss, cover the lit net demand plus
    `PAR_COMMIT_MARGIN_MW`. Expected never to fire on the game's days; `tools/par.js` counts it.
  * *S-14 rule 3* (as reworded: export to the cap, charge, the dispatch curtails the rest) needs
    no input from par. *Rules 1 and 5* wait for the city levers (2b).
  * *A battery order in the dispatch* (`batteryOrder`) counts for the energy behind it: a
    discharge until `PAR_BATT_RESERVE_FRAC`, a charge until full, at most the inverter less the
    GUARD. That is the player's order (through `replan()`, whose memory runs no rule 6) and par's
    belly charge (until `PAR_BATT_CHARGE_TO`); par's window orders still end with their window.
  * *Rule 7* reads `agc.requestMW` net of the units' lowering trims while the dispatch is spilling
    (AGC then takes them to MIN beyond their bands, C-6: the dispatch at work, not drift), and a
    surplus the plan itself shows for the coming column is not a miss of the forecast.
  * *`replan()`* gives the first plan column, which arrives in less than a whole column unless
    the re-dispatch falls on the 5-min grid, only the ramp its remaining time allows (the
    player's levers ran up to 45 MW behind a whole-column first key while coal climbed). Par's
    own amendments keep the whole-column window (unchanged; a stage C candidate).
* **Proxies** (`opts.proxy`): `par`; `planOnly` (the plan, nothing else: the L-0 accept);
  `doNothing` (no input at all: F-3); `lean` (plan + rules 1, 2, 7, 8, 9); `competent` (plan +
  rules 1-9 at `PROXY_COMPETENT_GAP_REAL_S`: H-1(b), F-3, K-8); `commitAll` (S-11: START every
  offline machine at tick 0 in one batch, bypassing pace and the 04:30 start, then par without
  rule 4); `fuzz` (private hash of the seed, never the sim's streams).
* **Harness.** `runPar` decides at 04:30, every `PAR_DECIDE_EVERY_S` and at the first second
  after each watch; `opts.state` continues any state (tests); `opts.memo` continues an earlier
  run's memory (a JSON copy of `state` and `memo` resumes the same day: the decision cadence,
  `nextS` and `afterWatch`, lives in the memo, also for `app/assist.js`; review fix);
  `opts.onStep(state)` is called after every step (tests sample through it; it must not modify
  state); `origins[i]` names the source of `log[i]`. At a decision: the day's plan once (from
  the day-ahead observation), `decide()`'s action, then `planUpdates()` (the 04:30 plan, the
  re-plans, the re-flow): the same order in `app/assist.js` and `app/system.js`.
* `tools/par.js` (Exit Phase 0) prints par for any seed. `tools/` is CommonJS
  (`tools/package.json`), so it loads the ES modules with `await import('../sim/step.js')`
  (Node >= 20), never `require`. It exports `grade()` (S-5) for `tools/baseline-v4.js`, and
  runs `main()` only when executed. Phase 2a: `--scenario desk | desk-weekend`, a summary by day
  type (MILD / HOT / HEATWAVE, weekend) with the minimum operational demand, the hours at a
  negative price, the MWh spilled (the score's, and the automatic cut alone), the peak frequency,
  the highest MSL level and rule 4's coal stops; `--probe` trips both credible contingencies in a
  copy of each SECURE state (H-8, as `tools/baseline-v4.js` does on the classic day); `--rows FILE`.
  `tools/follow.mjs` runs the hint-following player (`tests/lib/follow.js`) over seeds: unserved
  energy, `score.cost` by key with par's beside it, and each STOP line's quoted saving against the
  realised difference (the same day with that STOP skipped).

### step.js (A, kept by "integration")

`createState(seed, scenario)`, `step(state, inputs)`, `applyInput(state, input, out)`,
`inWatch(state)`, `observe(state, opts)`, `hashState(state)`, `canonicalHash(x)`,
`replay(seed, scenario, log, opts)`, `INPUT_TYPES`, `SIM_VERSION`. createState pre-rolls ext,
samples second 0 and balances the opening second with the online hydro machines (as
`tools/baseline.js` did for the legacy build). Phase 2a "world": createState also pre-rolls
`ext.rooftop` (`weather.prerollRooftop`) and sets the public `state.day`; the grid second runs
the MSL check after the weather (§3); `observe()` carries the desk/README.md §19.3 values (§8).
`balanceOpening` is unchanged: with the weekend factor and the MILD shape in `env.demandMW` the
04:00 second balances within 1 MW on `desk` and `desk-weekend` on MILD and HOT days alike
(tested; over seeds 1-200 the two hydro machines open at 96-159 MW each on `desk` and 217-276 MW
on `desk-weekend`, inside their 0-317 MW range: the weekend draws water from 04:00, which stage
C's commitment tuning, C-14, may change). Integration also builds `next.html`,
`app/loop.js` (F-5: rAF, `min(frameDt, 0.1) x rate` accumulator, whole ticks, per-frame cap),
`content/text.js` (H-14: one entry per §8.2 row, `{id, row, anchorId, real, ours, why,
params}`, `ours` built from params values; `tests/text.test.js`) and `tools/baseline-v4.js`
(the §6 rows for the v4 core; CommonJS with `await import()`). All of these exist now (§12,
"Bench" and "Finishing pass").

## 12. Decisions stage A made (and where the spec is loose)

* Sim day 04:00-04:00 (4.32 M ticks); desk and par start 04:30; AGC/HAND only before 04:30.
* Grid second runs at the **start** of the second, after inputs and before physics.
* `normal()` is Irwin-Hall(12), not Box-Muller: exact arithmetic beats "two uniforms" for risk 5.
  No transcendental function anywhere in sim/; DEM uses smoothstep (legacy: half-cosine), the
  clear-sky solar curve is a table generated once.
* Hash constants, unit conversions and tolerances are params records (the literal rule).
* Station levers (K-1: one lever per station), machines committed individually (F-13); unit
  base points are the authority and the lever is their sum (§5).
* F-4's "no unit's output rises faster than its ramp" applies to `schedMW` (dispatch + AGC).
  Governor response is primary frequency response and is bounded by H-8, not by the ramp.
* GUARD trigger 49.75 Hz (UNVERIFIED), full within 1 s, 10-min sustain, 60-s ramp-off, re-arm
  at 49.85. Battery round-trip efficiency 85% (not in the spec; flagged unverified).
* **Battery dispatch ramp 10 MW/s deviates from F-13's "full swing in <1 s"** (flagged
  unverified): orders and AGC move at 600 MW/min so a dial turn is not a self-made
  contingency; PFR and the guard use the full <1-s swing.
* Legacy "trip a random unit" became "trip a pre-rolled station's largest online machine, or
  nothing"; contingencies never share a second; the classic scenario keeps the legacy menu and
  timings (storm 30%, heat announced 10:30). D-8's director is a Phase 2 scenario.
* Inputs are refused during the watch **in the sim**, so par and players obey the same rule.
* Only accepted inputs are logged, with the args actually applied. Start cost is charged at START.
* Smelter returns 45 min after its trip at 25 MW/min (legacy: one 600-MW step).
* `RERT` has a stand-down input and a 100 MW/min ramp (the spec only arms it).
* Hydro is stopped (base point 0) at 75 MWh left instead of tripping at 0 (legacy did).
* **L-0 in 0.2 is a plan in par's memory, executed by inputs tagged `'plan'`** (not paced), so
  AGC bands (~920 MW at the opening commitment) never have to cover the ~3,900-MW daily swing.
  The same code gives the bench player the plan. Phase 1a moves it into state.
* **Par rule 9 (restore) is an extension.** S-4 has no restore rule and H-6 forbids automatic
  restore, so without it any shedding would leave districts dark and the level at SHEDDING all
  day (and, after directed shedding, the price at the cap). It needs no new constants: the K-13
  permissive holds them.
* **competent** = the plan + par's rules at half par's pace (a good human); **lean** = plan +
  reaction (S-5); **commitAll** starts everything at 04:00 in one batch (S-11 says "at 04:00").
* Market demand subtracts `battery.schedMW` (the scheduled flow), not the per-tick `outMW`.
* The curtailment state is an output LIMIT (`windLimitPct`, 100 = no curtailment), as the
  legacy LIMIT slider; the input is `curtail {kind, limitPct}`.
* `tools/par.js` keeps the spec's name as a CommonJS script using `await import()`; the v4
  baseline is a new `tools/baseline-v4.js`, because `tools/baseline.js` is the frozen legacy
  harness with a golden output (F-12) and stage rules only allow adding files under `tools/`.
  Exit Phase 0's "`tools/baseline.js --v4`" is met by that file (or by a one-line `--v4`
  delegation later, if the owner allows editing baseline.js).
* H-8's "every parameter inside its §8 range": ranged params carry `range` and a test keeps
  each value inside it; containment is tested at the default values. Sweeping range endpoints
  needs a params override and belongs to the tuning tools, not to `node --test`.
* F-2 (100 days), S-12 (200 days) and H-8 (1,000 states) run only in the slow suite; the
  default run keeps F-10's < 60 s.

### Integration, wave 2 first pass (what changed after the three wave-1 reports)

* **SoC power taper in physics** (§11 physics step 4): the battery's total output near empty /
  full is limited to what the dispatch ramp can still bring to 0 with the energy left, so an
  empty or full battery never steps off. Found on doNothing days: AGC parked the battery
  charging ~400 MW overnight, PFR (outside the grid's schedule taper) filled it early, and the
  ~250-MW charge stepped off at 100%, driving frequency to 52 Hz (black 'over'). It reuses
  `BATT_DISPATCH_RAMP_MW_S`, so the grid's whole-second schedule taper never binds tighter.
* **The preview runs on state between a save and an exact restore** (§10): performance only;
  results are bit-identical (the same day hashes before and after the change).
* **Curtailment and DR ramp** (`CURTAIL_RAMP_FRAC_MIN`, `DR_RAMP_MW_MIN`, new params in the
  integration block; the grid report's realism flag): a curtailment LIMIT change used to move
  up to 1.4 GW of solar in one grid second and a DR call was a 350-MW load step on and off,
  both larger than the credible contingencies and not recorded as one. Two grid tests were
  adjusted (K-7 DR, curtail).
* README brought in line with what the wave-1 owners built (their CONTRACT NOTES): the guard
  override's net-demand offset, H-10 linear re-engagement, the GUARD withdraw rate, collapse
  bands on time below, AGC's overload gate, the battery schedule taper, the output-driven
  profiles, true-rotation directed shedding, one-stage-at-a-time OFGS reconnect, the forecast
  band from the demand-noise process (and its extra reads), DR in the stack while active,
  hydro out of water, `smelter.returnS`.
* `tests/integration.test.js`: everything that does not need par runs now. F-3's accept names
  par's proxies, so a core version (doNothing, a scripted operator reading `observe()` only,
  and the fuzzer; 100 whole days in the slow suite) runs until `runPar` exists; the par
  version, H-1 (b), K-2 / L-8 and H-8 containment stay todo for the autopilot pass. A
  whole-sim K-15 test feeds every input type inside a watch.
* Open for the autopilot / tuning pass (not changed here, see the integration report):
  SECURE is rarely reached (the level sits at TIGHT or SHORT most of a scripted day); the K-13
  permissive (R5 >= 1.2 x cold load) can pass a restore whose surge then trips UFLS, since R5 is
  5-minute headroom, not primary response (a restore preview, `previewTrip` kind 'district',
  would catch it; done in the tuning pass); the SECURITY log line has no hysteresis (~60-90 lines a day, mostly
  TIGHT/SHORT flapping: K-8 set/clear thresholds belong to Phase 1a); at high import the tie
  becomes L and the P-7 adder can raise the price (H-5; labelled and measured in the review-fix
  pass, SPEC H-5 and §8.2); a started GT leaves the stack for its
  first ~2 min (T1 + auto-sync + T2 > 10 min).

### Tuning pass (owner decisions D1-D3, 2026-09-30)

What changed, with the measured effect (`tools/par.js`; SPEC S-12 has the table):

* **D1, S-11** (fleet.js): minimum down time only after a planned stop. Units carry `downWhy`
  (setSync's new `why`; tripUnit passes 'trip'); `startBlock` skips the minimum down time
  after a trip, so a unit is held only by its protection lockout (the legacy 90-150 min,
  simplified), then may hot-start. The L-0 plan and par read it through `startBlock`.
* **D2, F-13** (params.js): GT·C is 2 x 300 MW (14 machines; `unitMWs[14]`). With D1:
  par clean 100 -> 178 of 200 raw seeds, heat 9 -> 78 of 100, RERT 198 -> 136.
* **Rule 8** (autopilot.js): the adequacy walk (see the file header): RERT 136 -> 51 of 200 raw
  seeds, clean 178 -> 175, heat 78 -> 75 (with the K-13 and H-4 changes below: RERT 48; with
  rule 1's DR: RERT 47, clean 179, heat 76).
* **H-4 / H-8** (grid.js, params `PREVIEW_MARGIN_HZ`, `PREVIEW_AGE_MARGIN_HZ_S`): SECURE needs the
  preview to clear 49.5 Hz by 0.05 Hz plus 0.001 Hz per second of the cached preview's age.
  Without it 1,748 of 4,448 fresh-preview SECURE states (and 602 of 3,834 the desk showed) missed
  49.5 Hz, by up to 0.105 Hz; with it 0 of 1,000 (the H-8 slow test samples fresh previews at
  the tick and probes the desk's cached SECURE states too).
* **K-13** (grid.js): the restore input runs a RESTORE PREVIEW (kind 'district') and refuses a
  nadir below 49.55 Hz; `restorePermissive(state, d)` without opts (observe, the lamp) runs
  no preview. Par's restores that UFLS undid within 10 min: 1 -> 0 over 200 seeds; par restores
  43 -> 35 and its unserved energy on failing days rises (districts wait for a safe pickup).
* **L-0** (autopilot.js `reflowLit`, param `PLAN_REFLOW_S`): planOnly black 19 -> 0 of 100 raw
  seeds (0 of 200). The black was a half-dark city at night: the plan kept dispatching for the
  whole city (and the day-ahead wind), the battery filled, and frequency rose to 52 Hz.
* **Rule 1**: with no peaker left to start after a supply trip, DR is called when units, tie
  and diesel cannot carry present net demand: at the evening profile's pace (7.5 grid-min per
  action) the old order reached DR after FOS directed shedding. Clean 175 -> 179 of 200.

### Bench (wave 2: `next.html`, `app/`, `render/`, `content/text.js`)

* `next.html` plays a whole day through the bench (Exit Phase 0): serve the repo root
  (`py -m http.server 8642`) and open `http://localhost:8642/next.html`; options
  `?seed=N&assist=off|plan|par&speed=0.25|1|60|120|240|2100&play=1`. Every module loads from
  the same origin. The rate badge is always visible; a contingency plays the K-15 watch
  (0.15x -> 1x -> 10x over 30 grid-s, ~29 real s) with the desk locked; SKIP plays the rest at
  the chosen speed.
* `app/loop.js` (F-5) is pure (`runFrame` takes callbacks and a pacer); only `startRaf` touches
  the browser. A lagging frame slows play and never drops or repeats a tick; 60 Hz and 144 Hz
  displays reach the same state within one tick through a watch (`tests/loop.test.js`).
* `app/assist.js` (ASSIST PLAN / PAR) repeats `runPar`'s harness because `makePlan` is not
  exported; `tests/loop.test.js` and section 1 of `tools/baseline-v4.js` fail if the two drift.
* DEBUG TRIP calls `fleet.tripUnit` directly at the next grid second (lockout
  `HOT_TRIP_LOCKOUT_S`), outside the input log: the session is marked `poked` and its saved log
  says it no longer replays.
* `content/text.js` holds one entry per §8.2 row, `ours` built from params; entries whose desk
  element arrives in Phase 1 are drawer-only (`ui: 'drawer'`).
* Not measured: F-5's 60 fps at 1920 x 1080 (no browser in the build loop).

### Finishing pass (end of Phase 0.2, 2026-09-30)

* `SIM_VERSION` `v4-core-0.2.0` -> `v4-core-0.2.1`: the tuning pass and this pass change every
  day's outcome (a 0.2.0 log does not replay on 0.2.1).
* `tools/baseline-v4.js` and its golden `tools/baseline-v4.golden.md` (Exit Phase 0; SPEC's
  "`tools/baseline.js --v4`", §12 above): fixed probes, statistics over 200 raw and 100
  forced-heat par days, proxies graded on seeds 1-100 and F-3 on seeds 1-10, and one row per
  seed ending in its `hashState`. `tests/baseline-v4.test.js` checks section 1 and the rows of a
  quick run in the default suite and the whole report in the slow suite; `npm run golden:v4`
  re-records it.
* **H-4 / H-8 preview refresh on frequency drift** (`PREVIEW_F_TOL_HZ`, `sec.previewFHz`; §11
  grid): the baseline's wider containment sample (at most one SECURE state per 15 grid-min on
  271 par days) found 5 of 1,595 desk-SECURE states that missed 49.5 Hz, which the slow H-8 test
  (seeds from 1 until 1,000 fresh states) had not reached. With the trigger: 4,299 of 4,299
  probes hold 49.5 Hz (worst 49.511 Hz). Par reads `sec.previewNadirHz`, so S-12 moved slightly:
  raw clean 179/200 and RERT 47/200 unchanged, forced heat 76 -> 75 of 100 (the target exactly),
  mean unserved on raw seeds 170 -> 145 MWh. The level-only latency after an input is unchanged
  (§11 grid).
* `content/text.js`: the event-dense-day (protection lockout, D1), pre-dispatch (reflow under
  ASSIST PLAN), lor-states (margins and refresh) and restore-permissive (restore preview) entries
  now say what the sim does.
* `tests/integration.test.js`'s rate-invariance test drives `app/loop.js` instead of a stand-in.
  No test is `todo`; every slow test runs with `GRIDWATCH_SLOW=1`.
* **Left for the owner: N-1 over every credible contingency.** H-4 previews only L, the largest
  contingency by MW. The baseline also trips the other credible contingency from each probed
  SECURE state (the largest unit when L is the tie import, the tie when L is a unit): 28 of 3,512
  miss 49.5 Hz (worst 49.470 Hz), because a unit trip of nearly the tie's MW also removes its
  inertia and governor response. The H-8 slow test first failed on one of these (seed 11, 21:16,
  tie 620.75 MW against coal units at ~620.7 MW): it tripped the cached L's kind after the fresh
  check had previewed the tie. The test now trips the L each SECURE judgement previewed. Taking
  the worst preview over both would close the gap; it changes the gauge's "biggest risk" and par
  (rule 2 reads the preview), so it needs the owner and a new S-12 run.
* Measured and left open (the numbers are in the golden): the battery's average charge price
  over all charging is far above P-10's $100 because AGC regulation and primary response charge
  at whatever the price is (P-10 is a Phase 3 item, on the cut list; the review-fix pass found
  that about two-thirds of the finishing pass's $433 was the cap held after UFLS: $203 since);
  the competent proxy earns A on 67 of 100 raw seeds (68 since the review-fix pass) against
  S-5's 70% of *dailies* (gate-passed seeds, D-9); a few forced-heat days are short even on the
  optimistic bound (D-9 rejects those); the classic scenario has unwarned contingencies < 60 real
  s apart on 68 of 100 days (the D-8 director, Phase 2); a par day takes 2.2-2.5 s against D-9's
  1.6 s (1.56 s median after the review-fix pass's hashState fix).

### Review-fix pass (2026-09-30, `v4-core-0.2.2`)

The confirmed findings of the adversarial review, applied (SPEC.md has the measured effects in
S-12, §6 and §8):

* **Price** (market.js, P-5/P-8): market demand is the lit demand; the cap only while directed
  shedding is in force or the stack cannot cover the lit demand (UFLS districts waiting to be
  restored used to hold the cap for hours on a healthy grid); wind and solar enter the stack at
  their available MW, so a curtailment LIMIT never raises the price. The H-4 level still reads
  SHEDDING while any district is dark (LOR3 includes load interrupted automatically).
* **CARBON** (market.js, S-3): per MWh generated in the region (`score.genMWh`), not served.
* **hashState** (step.js, §9): the xor-shift per word, and the walk on a JSON copy. Every hash
  changed (`SIM_VERSION` 0.2.2; the golden was re-recorded).
* **Par** (autopilot.js): rule 6's window end ranked after rule 1; rule 2's GUARD only as far as
  the battery sustains it; re-plan inputs logged as `'replan'`; the cadence in the memo and
  `runPar(opts.memo)`; `replan()` for the bench.
* **Bench**: RE-PLAN under ASSIST PLAN; the RESTORE button asks the restore preview; the big
  frequency readout shows the 1-s average above 10x (F-4).
* **Labels** (SPEC §8.2, content/text.js): wind and utility solar give no primary frequency
  response; hydro spins free; CARBON counts the region's own generation; par re-plans after every
  action; the scarcity adder can rise with import at the evening peak; SECURE guards L only.
* **Measured and recorded**: the H-7 desk-lab midday case (black with no battery), the H-5
  evening probe, S-2's correlation (open: the Accept names no proxy set), S-11 from the golden.
* **Tests**: the information barrier scrambles a real regime and heat window; the resume test
  resumes a day; the D-9 and tick budgets use a CPU yardstick; the tick allocates nothing after
  hourly hashes; pairs of sign flips change the hash.
* **Measured** (`tools/baseline-v4.js`, golden re-recorded; the finishing pass in brackets): par
  clean 181/200 raw (179), 75/100 forced heat (75), RERT 47/200 (47), commitAll dearer 86/100
  (87), lean A 0/100, competent A 68/100 (67); 13 of the 271 par days shed less and none more;
  SECURE containment 6,856 of 6,856 (more SECURE states: the battery no longer runs empty
  overnight); the battery's charge price $203/MWh ($433); a par day 1.56 s median, 1.78 s max on
  seeds 1-10 in one process (2.40 / 2.55 s).

### Phase 1a (`v4-core-1a.0`, the sim agent; desk/README.md §3)

What was built (the contract is in §3, §5-8 and §11 above):

* **The plan in state** (`state.plan`, `grid.planSecond`, §5 plan, §11 grid): arrive-by keyframes
  per station and for the tie, booked STARTs and STOPs; the executor runs right after
  `events.applyDue`. Inputs `planKey`, `planDel`, `planStart`, `planStop`, `planUnbook`,
  `planRejoin`, `planLoad`; `basePoint` and `tie` write the plan (AGC: L-6's one keyframe at the
  earliest ramp-feasible time; HAND: `man`). `step.js` checks planLoad's list arguments and logs
  them canonically (every station, fresh arrays); optional arguments (`syncClose.bypass`) are
  filled in, so logs stay canonical.
* **K-12 synchroscope** (§5 units, §6, §7 `sync`, §11 grid): seeded slip and angle on the PLAY
  stream, the analytic angle (`grid.syncAt`), the outcome table, `scope` / `syncTrim` /
  `syncAuto`, the background auto-synchroniser waiting while the scope is open, the tick-exact
  AUTO close (`scope.nextAutoTick`, checked once per tick in step()).
* **DIRECT SHED** only while the gauge reads SHORT or SHEDDING (A-3).
* **N-1 over both credible contingencies** (A-2, `N1_PREVIEW_ALL`, §11 grid).
* **Par and the L-0 plan act through `planLoad`** (§11 autopilot): the queue, `planInputs` and
  the tie hold's re-issue are gone; `planUpdates()` sends the 04:30 plan, par's re-plans and the
  re-flow; `replan()` returns the RE-PLAN / RE-DISPATCH planLoad.
* **`app/system.js`**: the game's system operator (04:30 pre-dispatch, the lit-load re-flow,
  `redispatch()` for A-1's RE-DISPATCH key), DOM-free, on the autopilot's planOnly memory and
  runPar's cadence (a no-input game day is the planOnly day, hash for hash). **`app/assist.js`**
  keeps ASSIST PLAN / PAR for the bench on the same calls; `replanNow` applies the planLoad.
* `observe()`: `plan`, `scope`, `units[].slipHz` / `phaseDeg`, `sec.previewUnitHz` /
  `previewLinkHz` (§8); `SIM_VERSION` `v4-core-1a.0`.

**Deviations from desk/README.md §3** (each the most realistic and most fun option found; the
owner may overrule):

1. **A 0-MW key is "the lever at its floor", not "stop"**; the STOP is an explicit booking.
   `planKey` with mw 0 still does exactly what §3.2 says (to MIN by the key, then a STOP of every
   machine, booked at the key), but the executor gives 0 no special meaning. Otherwise a hydro
   wheel turned to 0 (a lever move in AGC writes a 0-MW key) or an L-0 plan column with the gates
   shut would stop the machines; hydro spins free and a stopped machine needs a 3-min start. The
   Live Stack draws stops from `plan.stops`.
2. **A lever move also drops the move in flight** (keys up to `doneS`), not only keys before the
   arrival: otherwise a drag that sends several basePoints (the desk sends one every 250 ms) left
   its earlier, later-arriving keys behind and the lever snapped back to them.
3. **A booked START for an offline station is timed so the unit arrives by the key** (START at
   atS - start-to-MIN - climb from MIN to mw), not at atS - startToMinS: "arrive-by" for the
   whole layer, as L-4 draws it. A later START already booked for the station's machine is moved
   earlier. The rewrite is a fixed point (every choice is made from the final atS), so the logged
   key rewrites to itself on replay (F-6); an earlier draft's rewrite was not, and the fuzz replay
   test caught it.
4. **The breaker closes at the command's tick; the outcome is judged at the angle 80 ms later**
   (`SYNC_BREAKER_TICKS`), which is what the player aims for. The AUTO close is issued on the
   tick 80 ms before its pass through 0 degrees. A slow (reverse) close picks up no block (the
   machine motors) until its trip. The auto-sync (background and AUTO) is 'auto' in the `sync`
   record; a clean manual close carries `cue: 'breaker'` as §3.3's table says, so a clean close
   has two breaker cues on the same tick (the close's `breaker` record and the `sync` record):
   the shell should play one.
5. **The tie writes its plan in HAND too.** HAND is about unit output and AGC (K-2); the tie is a
   DC setpoint in either mode, and without it the plan's next tie key would pull a HAND player's
   tie move back. The tie has no MAN flag.
6. **A basePoint to a station with no machine on writes no key** (its applied lever is 0, which
   would read as a floor key).
7. **The periodic re-flow waits while the player owns the plan** (app/system.js): once the player
   has moved a lever or the tie or edited the plan since the system's last planLoad, the
   30-minute re-flow no longer overwrites their plan (a re-flow when the dark share moves still
   runs, as dispatch must follow the metered load), until RE-DISPATCH hands it back. A no-input
   day is unchanged (never black).
8. **The link preview runs only while the import exceeds the largest unit's output** (A-2): a
   link trip of no more MW keeps all inertia and governors and was never deeper (0 of 3,578
   par-day states); `previewLinkHz` then carries the unit's nadir as its bound (the desk's TRIP
   PREVIEW asks `physics.previewTrip` itself for an exact link preview).
9. **`observe().units[].slipHz` is the slip now** (state's `slipHz` is the slip at `slipAtTick`,
   the start of the present trim ramp), and `origins` keep the names 'plan' / 'replan' (both are
   planLoads) rather than a new 'planLoad' origin.
10. **The executor keeps running during the watch** (the watch locks the desk; dispatch
    continues). In 0.2 the plan's inputs were held until the watch ended.
11. Par's re-plan after a tie action (rules 1 and 2) is sent at once, with the hold written into
    its tie keys; after other actions it waits for the next decision as before. Rule 7's action is
    the re-plan's planLoad (it was the largest single lever move).

12. **The cached TRIP PREVIEW also re-runs when the fleet's primary-response headroom moves**
    more than `PREVIEW_L_TOL_MW` (Σ governor headroom of 'on' units up to their cap, plus the
    battery charge an under-frequency would suspend; `sec.pvHeadMW`). Arrive-by keys make units
    ramp just in time, and on seed 153 a 39-s-old SECURE preview (49.592 Hz) had become 49.487 Hz
    while a unit climbed; with the trigger that state is TIGHT.

**Measured** (`node tools/baseline-v4.js`, 200 raw + 100 forced-heat seeds, golden re-recorded;
A-2 off = the same build with `N1_PREVIEW_ALL` false; end of Phase 0.2 = `v4-core-0.2.2`):

| Measure (target) | 0.2.2 | 1a, A-2 off | **1a, A-2 on (shipped)** |
|---|---|---|---|
| Par clean, 200 raw (≥ 85%) | 181 (90.5%) | 184 (92.0%) | **186 (93.0%)** |
| Par clean, 100 forced heat (≥ 75%) | 75 | 75 | **75** |
| Par arms RERT, raw (≤ 25%) | 47 (23.5%) | 44 (22.0%) | **45 (22.5%)** |
| commitAll dearer (≥ 70%) | 86/100 | 87/100 | **86/100** |
| Lean A (≤ 40%) | 0/100 | 1/100 | **2/100** |
| planOnly black (never) | 0/100 | 0/100 | **0/100** |
| SECURE, losing the largest unit (≥ 49.5 Hz) | (L only) | 6,895 of 6,913 | **6,689 of 6,689** (worst 49.502) |
| SECURE, losing the tie import (> 50 MW) | (L only) | 5,245 of 5,246 | **4,870 of 4,871** (worst 49.488) |
| SECURE, the contingency not previewed | 4,876 of 4,904 | 5,200 of 5,218 | **none (both previewed)** |
| Par day, CPU s, seeds 1-10, one process (median / max) | 1.70 / 2.52 * | 1.88 / 4.59 | **2.02 / 4.81** |

\* 0.2.2 re-timed on the same machine in the same session (its golden said 1.56 / 1.78 s on a
quieter run). The remaining SECURE miss (seed 224, 13:30, tie 800 MW, 49.488 Hz) is a
fresh-preview error of 0.071 Hz (the frozen-schedule preview does not see AGC still lowering
units in the first seconds), larger than `PREVIEW_MARGIN_HZ` (0.05); A-2 off has the same kind
of miss (49.463 Hz). Raising the margin could cost S-12's heat target (75/100, exactly on it), so it is
left for stage C and the owner. Seed 4's par day is slow in every build (4.8 s here, 2.5 s in
0.2.2); on the median the plan executor and planLoad logs add ~0.18 s and A-2's second preview ~0.14 s.
