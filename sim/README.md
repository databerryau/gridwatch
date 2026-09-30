# sim/: the v4 simulation core (contract)

This is the contract for Phase 0.2 (SPEC.md §5, "0.2 — The v4 core"). Stage A (the architect)
wrote it with `params.js`, `rng.js`, `fleet.js`, the pre-roll half of `weather.js` and
`events.js`, `step.js` and the tests. Stage B agents implement the rest **in parallel, one file
set each**, against this document. When this document and a JSDoc comment disagree, this document
wins. Change it only on purpose, and say so in the PR.

The legacy game (`index.html`, v2.0 + Phase 0.1) is frozen and untouched. v4 is new files only.

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
      weather.sampleSecond(state)                            state.env for second s
      grid.unitsSecond(state, out)                           state machines, timers, derate, hot trips, lockouts
      grid.agcSecond(state, out)                             AGC trims (every AGC_CYCLE_S)
      grid.dispatchSecond(state, out)                        schedules move at ramps; battery, tie, renewables, RERT, DR
      grid.fosSecond(state, out)                             FOS timers, directed shedding, cold load, backInBand
      grid.securitySecond(state, out)                        R5, L, level; cached TRIP PREVIEW
      market.priceSecond(state, out)                         merit-order price
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

## 4. Random streams (F-3)

`sim/rng.js`: counter-based `hash32(seed, stream, a, b = 0, c = 0)` (MurmurHash3 fmix32 chain),
`uniform` in [0, 1), `normal` (Irwin-Hall 12: exact arithmetic, mean 0, variance 1, +-6),
`pick`/`pickWith`, `quantise`. No state, no `Math.random`.

| Stream | Counters | Used for | When |
|---|---|---|---|
| `EXT_REGIME` | a = 0 | weather class (heat / storm / calm) | createState |
| `EXT_EVENTS` | a = menu slot, b = draw number | event times, targets, lockouts | createState |
| `EXT_DEMAND` | a = minute sample | demand noise series | createState |
| `EXT_WIND` | a = minute sample | wind fraction series | createState |
| `EXT_CLOUD` | a = minute sample | utility-solar clearness series | createState |
| `EXT_FINE` | a = grid second | +-6 MW per-second demand wobble | on the fly in `sampleSecond` (a pure function of seed and second, so it is "pre-rolled" in effect) |
| `EXT_ROOFTOP` | a = sample, b = suburb | **reserved** for Phase 2 rooftop PV (P-1, P-2) | - |
| `PLAY` | a = tick, b = unit index, c = draw | player-dependent outcomes: overheat trip (H-2: `uniform(seed, PLAY, tick, k)` at the grid second's tick); later sync slip (K-12) | when the outcome is decided |

Ext draws never depend on play (C-6): the same seed gives the same weather, demand, events and
lockout times whatever anyone does. **Trip targets are rules, not dice**: "the largest online
machine by output" (`fleet.largestContingency`; ties to the lower index), "the station's
largest online machine", "the unit that ran hot". Ext series are quantised integers (MW,
per-mille) at `SERIES_STEP_S` = 60 s; ext event args have at most 3 exact decimals (tested).
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
| `env` | object | weather | this second's external conditions (below) |
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

### ext (hidden, pre-rolled, never written after createState)

| Field | Meaning |
|---|---|
| `regime` | `{cls: 'heat'\|'storm'\|'calm'}` from `EXT_REGIME` (S-10: heat 15%, storm 30%) |
| `events[]` | `{id: 'e7', atS, type, args, contingency: bool, warned: bool}`, sorted by `atS`, then type order, then menu slot; contingencies never share a second |
| `heat` | `{announceS, onsetS, endS}` or `null` |
| `series` | `{stepS: 60, demandNoiseMW: int[1441], windPm: int[1441], clearPm: int[1441]}` |
| `rooftop` | `null` (Phase 2 hook: per-suburb clearness from `EXT_ROOFTOP`) |

Event types (classic menu, legacy L331-370): `notice {code}`, `heatAnnounce {onsetS, endS,
upliftPm, deratePm}` (integer per-mille), `heatOnset {clearMuAtLeast}`, `heatEnd`, `stormWarn
{arriveS}`, `stormArrive {windMu}`, `windCutout {windMu}`, `stormPass {windMu}`, `cloudWarn
{onsetS}`, `cloudOnset {clearMu}`, `cloudClear {clearMu}`, `windDrought {windMu}`, `smelterTrip
{offS}`, `smelterReturn`, `linkTrip {cause, lockoutS}`, `unitTrip {rule: 'largest'|'station',
station?, lockoutS}`. The `windMu`/`clearMu` args are already folded into the series at
createState; `applyDue` only logs them.

### env (weather.sampleSecond, every grid second; public "present" values)

`s` (grid second), `h` (hour of day), `demandMW` (operational demand = underlying minus the
smelter's missing load; before Phase 2 operational = underlying), `underlyingMW` (DEM x heat
multiplier + noise + wobble), `windAvailMW`, `solarAvailMW` (clear-sky table x clearness),
`windFrac`, `clearness`, `heatActive` (onset <= s < end), `heatMult`, `tempC` (display),
`neighbourPrice` ($/MWh, P-6), `exportLimitMW` (300 in 09:00-16:00, else 800).

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
| `ren` | `windLimitPct`, `solarLimitPct` (grid, input: output LIMIT %, 100 = no curtailment, as the legacy LIMIT slider), `windCurtMW`, `solarCurtMW` (grid, integration: the curtailed MW, moving toward available x (100 - limit)% at `CURTAIL_RAMP_FRAC_MIN`, so a LIMIT change is never a step; the weather passes straight through), `windMW`, `solarMW` (grid: available - curtailed; physics and settlement apply OFGS to wind; the market's stack offers the AVAILABLE MW, `env.windAvailMW` net of OFGS and `env.solarAvailMW`, P-5) |
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
* A district's **cold-load MW** is `fleet.districtColdLoadMW(state, d)` = `env.demandMW x
  share x (dark for > COLD_LOAD_AFTER_S ? COLD_LOAD_FACTOR : 1)`; permissive, observe and the
  restore surge all use it.
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
RERT), `supplyMW` (the same with outputs: + governors + PFR + guard), `servedMW` (= demand x
(1 - shedFrac) + coldLoad - DR), `loadReliefMW` (= servedMW x LOAD_RELIEF x (F0 - f) / F0,
positive when f < F0), `loadMW` (= servedMW - loadReliefMW), `imbalanceMW` (= supply - load),
`inertiaMW` (= -imbalance), `govTotalMW`, `shedMW` (= demand x shedFrac).
**Identity** (tested): `(schedSupplyMW - servedMW) + inertiaMW + govTotalMW + battery.pfrMW +
battery.ffrMW + loadReliefMW = 0` within 1 MW. At createState the readouts are 0.

### acc (per-second accumulators) and last

`acc`: `unitMWs[14]`, `battOutMWs` (signed net output, + discharge), `battChargeMWs` (charge
drawn, >= 0), `battAbsMWs` (throughput |out|), `shedMWs`, `servedMWs` (of `loadMW`),
`loadReliefMWs`, `fMinHz`, `fMaxHz`, `fSumHz` (on each tick's START frequency), `ticks`
(physics adds each tick; when `acc.ticks === 0` it first sets `fMinHz = fMaxHz = f`),
`startCost` ($, grid adds at START). Built by `fleet.newAcc()`; `market.settleSecond` folds it and calls
`fleet.resetAcc(acc)`, and writes `last = {fMeanHz, fMinHz, fMaxHz, servedMW, shedMW}` (means
over the completed second). AGC, FOS and the restore permissive read `last.fMeanHz`.

### agc, fos, sec, price (grid / market)

* `agc = {nextCycleS, requestMW, unmetMW, atLimitS, aceMW}`: `unmetMW` is the ACE while the
  request is clipped with ACE pushing further out (else 0); `atLimitS` counts consecutive grid
  seconds at the limit; in HAND every trim and the request are 0 and ACE is still shown.
* `fos = {outsideS, belowContainS, countdownS, directed, nextShedS}`.
* `sec = {r5MW, lMW, lKind: 'unit'|'link'|'none', lId, ratio, previewNadirHz, previewAtS,
  previewLId, previewLMW, previewFHz, dirty, level: 'SECURE'|'TIGHT'|'SHORT'|'SHEDDING'}`.
  `previewFHz` (the frequency the cached preview started from; finishing pass) is private:
  `observe()` copies `sec` by its key list without it.
* `price = {mwh, marginalId, adder, exhausted, x}` (x = R5 / L).

### score (market; S-1..S-3)

`servedMWh`, `unservedMWh` (= uflsMWh + directedMWh + taskMWh), `cost {fuel, noLoad, starts,
tie, battWear, dr, rert, flex}` ($), `co2t`, `genMWh` (generation in the region: units, wind after
OFGS, solar, RERT; review fix), `marketBill` (info only), `minHz`, `maxHz`, `outsideNormalS`,
`spark[12]` (worst |f - 50| per 2-h block from 04:00, Y-4), `starts`.
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
| `basePoint` | `station`, `mw` >= 0 | always | equal shares over the `'on'` machines (§5 stations); `mw` rewritten to the applied lever (0 if none is on) |
| `start` | `unit` | `fleet.startBlock` is '' (off; min down met after a planned stop, none after a trip (D1); water for hydro) | `starting`, `timerS = t1S`, `acc.startCost += startCost`, `starts++` |
| `stop` | `unit` | `fleet.stopBlock` is '' (min up met; starting/ready just cancel) | on/loading -> `unloading`, base point 0 (the lever loses exactly its share); starting/ready -> `off` |
| `abortStop` | `unit` | mode `unloading` or `shutdown` (hydro: not out of water) | unloading -> `on` with base point = schedMW; shutdown -> `loading` (T2 slope from its output up to MIN) |
| `syncClose` | `unit` | mode `ready` | **K-12 stub**: breaker closes now, clean (angle/slip come in Phase 1a) |
| `battery` | `mode` in charge/idle/discharge, `mw` >= 0 | always | order set (`mw` rewritten to min(mw, BATT_MW)); `fullHold = false` |
| `guard` | `mw` in 0..500, multiple of 50 | always | `guardMW` |
| `tie` | `mw` in -800..800 | always (while tripped it sets the post-repair setpoint) | `setMW`; the flow is clamped to the export cap at use (a lower cap is reached at the tie ramp, never as a step) |
| `curtail` | `kind` wind/solar, `limitPct` 0..100 | always | the output LIMIT % (100 = no curtailment), reached at `CURTAIL_RAMP_FRAC_MIN` (both ways) |
| `callDR` | - | calls left and not active | `activeS = DR_DURATION_S`, `callsLeft--`; `dr.mw` ramps in and out at `DR_RAMP_MW_MIN` |
| `armRERT` | - | not armed | armed, `leadS = RERT_LEAD_S`, `armedEver = true` ("glass broken") |
| `standDownRERT` | - | armed and not already standing down | ramps out at `RERT_RAMP_MW_MIN`, then disarmed; before it arrives it simply cancels |
| `mode` | `agc` bool | before 04:30 and `!control.modeLocked` | `control.mode` = AGC / HAND (D-7) |
| `restore` | `district` | dark and `grid.restorePermissive(state, d, {preview: true})` is '' (the lamp's conditions plus the RESTORE PREVIEW, run on the input only) | **K-13 stub**: relit; `surgeMW` = cold load - its share of demand; `lastRestoreS`; UFLS stage re-armed if both its districts are lit |
| `directShed` | - | a lit district in rotation remains (K-7; Phase 1a adds the LOR2-forecast gate) | darkens the lit rotation district restored longest ago (never shed first; ties by the lowest `rot`: on a fresh day, the lowest `rot`), `shedBy 'directed'` (true rotation: a district just restored is not the next one shed) |

`ack`, `silence`, pause, rate, FAST and skip are **not** sim inputs (presentation only).
Live Stack keyframes (L-4/L-6, Phase 1a) will add a `plan` input type and a `plan` state field.

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
| `ufls` | `stage`, `districts[]`, `mw`, `cue: 'clack'` | physics |
| `ofgs` | `stage`, `mw` | physics |
| `shed` | `district`, `why: 'directed'`, `mw`, `cue: 'clack'` | grid |
| `restore` | `district`, `mw` (its cold-load MW) | grid |
| `announce` | `news` (the news record), `cue: 'warn'` | events |
| `black` | `fHz`, `why: 'under'\|'over'\|'inertia'` | physics |
| `input` | `ok: false`, `type` (string or null), `reason` | step.applyInput |
| `dayEnd` | `black` | step |

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
contingencies[] {n, startS, cause, id, lostMW, watchEndS, backInBandS}, forecast, dayAhead`.
`restoreBlock` is `grid.restorePermissive(state, d)` for a dark district (the lamp: frequency and
interval; the restore preview runs only on the restore input, never per district here) and
`fleet.DISTRICT_LIT` for a lit one. The bench asks the preview itself for lit lamps
(`app/session.restoreChecks`, once per grid second), so its RESTORE button matches the input.

`forecast` = `weather.forecast(state, FC_HORIZON_S, FC_STEP_S)`: 54 five-minute columns
`{fromS, stepS, n, demandP50[], demandP10[], demandP90[], windMW[], solarMW[], neighbourPrice[],
exportLimitMW[]}` built from the scenario's climatology, the present (`env`) and `news` only.
`dayAhead` is `null` unless `observe(state, {dayAhead: true})`: then the same forecast to the
end of the sim day (L-0 pre-dispatch). Neither may read `ext` (`tests/events.test.js`
scrambles ext, including the series and the heat window, and expects an identical forecast).

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
| physics | `tick`, `phys`, `units[].{mode, sync, schedMW, availMW, govMW, k}`, `battery.{schedMW, guardMW, socMWh, ffrFiredTick, pfrMW, ufSuspend}`, `tie.flowMW`, `ren.{windMW, solarMW}`, `rert.outMW`, `dr.mw`, `env.demandMW`, `city.{shedFrac, coldLoadMW}`, `ufls`, `ofgs`, `collapse`, `conts[contIdx]`, `hydro.storageMWh` | `phys.*`, `units[].{govMW, outMW}`, `battery.{pfrMW, ffrMW, ffrFiredTick, outMW, socMWh, ufSuspend}`, `hydro.storageMWh`, `ufls.timerS`, `ofgs.timerS`, `collapse.bandS`, `black`, trace fields of `conts[contIdx]`, `acc.*` (adds); stages via `fleet.operateUfls` / `fleet.setOfgsStage` |
| grid | everything above plus `env`, `last`, `control`, `sec`, `seed` (play stream) | `units[].{mode, timerS, agcTrimMW, schedMW, availMW, hotS, starts}`, base points via `fleet.setBasePoint`, `battery.{mode, orderMW, guardMW, schedMW, agcTrimMW, fullHold}`, `tie.{setMW, flowMW, tripped, lockoutS}`, `ren.*`, `hydro.warned`, `rert.*`, `dr.*`, `city.{coldLoadMW, lastRestoreS}`, `districts[].surgeMW`, `ofgs.okS`, `agc.*`, `fos.*`, `sec.*`, `acc.startCost`, `conts[contIdx].backInBandTick`; breakers via `fleet.setSync`, trips via `fleet.tripUnit`, districts via `fleet.setDistrictDark`, re-arm / reconnect via `fleet.rearmUfls` / `fleet.setOfgsStage` |
| market | `env`, `units`, `battery`, `tie`, `ren`, `ofgs.trippedFrac`, `rert`, `dr`, `city`, `sec`, `acc`, `hydro.storageMWh` | `price.*`, `score.*`, `last.*`, `acc` (via `fleet.resetAcc`) |
| events (`applyDue`) | `ext.events`, `evNext`, `units`, `tie`, `smelter`, `scn` (the storm and cloud text timings) | `evNext`, `news`, `smelter.{returning, loadMW, returnS}`; trips via `fleet.tripUnit`, `tripTie`, `tripSmelter` |
| weather (`forecast`) | `scn` (incl. the public `scn.events` timings), `env`, `news`, `smelter.{loadMW, returning, returnS}` (the announced return) | nothing |
| autopilot | `observe()` output only | its own memo |
| step | everything (orchestration) | `tick`, `over`, `log`, `control`, `sec.dirty` |

Only `weather.sampleSecond` and `events.applyDue` read `ext`, and only for the present second.
Nothing reads `ext` to anticipate the future.

### fleet.js (A, done, frozen)

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
| `preTrip(state)`, `startContingency(state, cause, id, lostMW, ekBeforeMWs, out)` | opens `conts[]` with `pre`, emits `contingency` |
| `tripUnit(state, i, cause, lockoutS, out) -> MW lost` | H-2/H-3/H-9: breaker open, lockout, base point to 0, contingency if > 50 MW |
| `tripTie(state, cause, lockoutS, out) -> signed MW` | K-6 link trip |
| `tripSmelter(state, offS, out) -> -MW` | load trip (over-frequency) |
| `setDistrictDark(state, d, dark, why) -> share` | keeps `city.shedFrac` exact; callers emit records |
| `districtColdLoadMW(state, d)`, `DISTRICT_LIT` | K-13 cold load; restorePermissive's reason for a lit district |
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
7. Load: `servedMW`, `shedMW`, `loadReliefMW` (= served x LOAD_RELIEF x (F0 - f) / F0),
   `loadMW` as in §5.
8. `imbalanceMW = supplyMW - loadMW`; `fHz += F0 x imbalanceMW x DT / (2 x ekMWs)`; clamp
   [46.5, 53.5]; `ekMWs <= 0` -> black ('inertia').
9. Collapse (H-7) -> `black = true`, `black` record.
10. Readouts, contingency trace while `tick < watchEndTick` (`rocofHzS` of the first tick,
    extreme, `caught` = readouts at the extreme minus `pre`, `uflsStages`, `contained`),
    accumulators (when `acc.ticks === 0`, `fMinHz = fMaxHz = f` first).

`previewTrip` runs the same step function on state itself between a save and an exact
restore (§10) with schedules, demand and renewables frozen (no grid seconds), for <=
`PREVIEW_HORIZON_S`, stopping once f has risen for `ROCOF_WINDOW_S` after the nadir (and only
when the battery cannot run dry inside the horizon and no charge step is pending). State is
unchanged on return (tested by hash, and by interleaving calls between two runs). Targets:
`unit`, `link`, `load` (mw > 0: the extreme is the PEAK), `district` (a restore preview: its
cold-load MW; `pre.uflsMW` leaves the relit district out) and `none` (removes nothing); an
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
(no shedding above 49.0; 0.30 +- 0.02 s; no automatic restore), H-7, H-10, K-5, K-10, K-11, F-4.

### grid.js (B "grid")

`applyCommand(state, cmd, out) -> ''|reason`, `unitsSecond`, `agcSecond`, `dispatchSecond`,
`fosSecond`, `securitySecond` (all `(state, out)`), `security(state, opts) -> {r5MW, lMW, lKind,
lId, ratio, previewNadirHz, level}` (THE reserve function, H-4; pure), `restorePermissive
(state, d) -> ''|reason` (pure). Details in the JSDoc and in §5-6. Key rules:

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
  a lever moved past the gate does.
* Battery: `schedMW` toward clamp(signed order + trim, +-(BATT_MW - guardMW)) at the dispatch
  ramp (K-5: guard MW are never available to orders). Near empty / full the schedule (and
  the AGC band "within SoC") is held to P <= sqrt((r/2)^2 + 2 r E) - r/2, the most the
  dispatch ramp r can still bring to 0 in whole seconds with the energy E left (an energy
  management limit; physics applies the continuous form to the total output, §11 physics).
* Tie: the export cap limits the target; a lower cap is reached at the tie ramp.
* Renewables (integration): the curtailed MW move at `CURTAIL_RAMP_FRAC_MIN` (§5 `ren`); DR at
  `DR_RAMP_MW_MIN` (§5 `dr`). Tripped wind reconnects one OFGS stage per
  `OFGS_RECONNECT_GAP_S`, the last to trip first.
* Directed shedding (FOS and DIRECT SHED): the lit rotation district restored longest ago
  (never shed first), ties by rot (§6).
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
the JSDoc. Decisions: market demand = the LIT demand (env.demandMW x (1 - city.shedFrac) +
city.coldLoadMW) - tie.flowMW - battery.schedMW (scheduled flows, P-5; review fix: load shed and
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

### autopilot.js (B "autopilot")

`preDispatch(obs) -> plan`, `planInputs(obs, memo, tags?) -> Input[]`, `createAutopilot(opts) ->
memo`, `decide(obs, memo) -> Input[]` (<= 1), `replan(obs, memo) -> bool` (the bench's RE-PLAN),
`refRealSeconds(fromS, toS, conts)`, `runPar(seed, scenario, opts) -> {score, summary, log, origins,
hashes, black, plan, state, memo}`.
JSDoc has the details. The contract:

* **L-0 plan (0.2 form).** Computed once at 04:30 from `observe(state, {dayAhead: true})`: a
  merit-order schedule for the P50 forecast net of wind and solar (P-6 offers; the tie as a
  price-taking block at the neighbour's price: import when it is below the marginal offer,
  export when above), obeying start times, ramps and min up/down times, ignoring N-1, hazards,
  drift and the noon minimum. Lists `starts`, `stops`, `basePoints` (per station, <= one per
  5-min column), `ties`, sorted. Deterministic per seed and version.
* **Executing the plan.** The plan's inputs are issued when due (`planInputs`, origin
  `'plan'`). They stand in for K-2/L-6 "levers follow the plan" and are **not** discrete
  actions: the S-4 pace does not count them. **Re-plan** (SPEC S-4, §8.2): after each discrete
  action par re-dispatches every lever and the tie from then to 04:00 (`amend`); the rewritten
  queue's entries carry `re` and are logged with origin `'replan'`. The re-plan is part of the
  action, not a paced action of its own, and the bench player has the same RE-PLAN under ASSIST
  PLAN (`replan`, `app/assist.replanNow`). Par starts from the plan without its stops. Whether
  the Phase 1a Live Stack keeps RE-PLAN or par paces its re-plan is an owner decision. Phase 1a moves the plan into state. A proxy that
  never amends its plan (planOnly) re-dispatches it for the lit load while districts are dark
  (`reflowLit`: at once when the dark share moves, then every `PLAN_REFLOW_S`), as NEM
  dispatch targets metered demand (L-0: never black with no input).
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
  state); `origins[i]` names the source of `log[i]`.
* `tools/par.js` (Exit Phase 0) prints par for any seed. `tools/` is CommonJS
  (`tools/package.json`), so it loads the ES modules with `await import('../sim/step.js')`
  (Node >= 20), never `require`. It exports `grade()` (S-5) for `tools/baseline-v4.js`, and
  runs `main()` only when executed.

### step.js (A, kept by "integration")

`createState(seed, scenario)`, `step(state, inputs)`, `applyInput(state, input, out)`,
`inWatch(state)`, `observe(state, opts)`, `hashState(state)`, `canonicalHash(x)`,
`replay(seed, scenario, log, opts)`, `INPUT_TYPES`, `SIM_VERSION`. createState pre-rolls ext,
samples second 0 and balances the opening second with the online hydro machines (as
`tools/baseline.js` did for the legacy build). Integration also builds `next.html`,
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
