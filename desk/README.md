# Phase 1a: the greybox desk (contract)

This is the contract for SPEC.md §5 Phase 1a ("1a — Greybox"): `next.html` plays a full day at a
flat 120× with the desk, the Live Stack, the watch and the map, in plain shapes and colours.
`sim/README.md` stays the contract for `sim/`; this file adds what Phase 1a changes there
(§3) and specifies everything outside it. When this file and a JSDoc comment disagree, this
file wins. Change it only on purpose, and say so in the PR.

Stage A (the architect) wrote this file. Stage B runs four agents in parallel, **one file set
each** (§1). Stage C (integration) merges them, wires the page end to end, re-measures S-12
and ships the PR.

Items in scope (SPEC Phase 1a row): K-1–K-7; K-8 basics (tiles, set/clear thresholds, ACK,
SILENCE); K-9–K-13; K-15–K-18; K-19 hum; the K-20 breaker clack; L-0–L-9; G-1; G-5 dark
districts; the F-11 `?perf` overlay. **Not** in 1a (1b or later): the ISA-18.1 flash
sequence details and the 30-s re-sound rule (K-8 details), full foley (K-20), K-21, K-22,
K-23's full keyboard audit, G-2–G-4, the F-11 budget, Marg and cover plates (O-3, Phase 2),
the D-2 variable clock (Phase 2: CRUISE stays a flat 120×), rooftop PV (Phase 2).

---

## 0. Decisions taken in stage A (owner-delegated, OD-17 "most fun within realism")

| # | Open question | Decision | Why |
|---|---|---|---|
| A-1 | S-4: the Live Stack has no RE-PLAN, but par re-plans free after every action. | **The desk gets a RE-DISPATCH key** (an L-9 exception, like the 04:30 pre-dispatch). It re-runs the pre-dispatch from now to 04:00 over the commitment the player has now (par's `amend`), and every lever glides to the new plan with a servo sound. Par keeps its free re-plan, so S-12 needs no re-tune for this. | The pillar-2 moment ("six levers glide up together") becomes something the player *causes*: commit a unit on the stack, press RE-DISPATCH, watch the desk re-arrange itself. Realistic: AEMO re-runs pre-dispatch every 30 min and NEMDE dispatches committed plant every 5 min; the operator's real decisions are commitment, reserves, the tie and emergencies, not typing base points. Labelled in §8.2. |
| A-2 | H-8 / K-10: SECURE previews only L; losing the other credible contingency misses 49.5 Hz in 28 of 4,904 SECURE states. | **N-1 over both credible contingencies.** The preview runs for the largest unit *and* the tie import; BIGGEST RISK names the one with the lower nadir; SECURE needs both. Adopted if S-12 still holds after the re-measure (§3.6); otherwise stage C reports the numbers and keeps L-only behind the same param. | N-1 means *any* credible contingency; a gauge that says SECURE and then fails the containment standard would betray "realism is sacred", and the watch is the game's signature moment. |
| A-3 | K-7: "DIRECT SHED appears only when LOR2 is forecast." | Available while `sec.level` is SHORT or SHEDDING (R5 < L now, the LOR2-like state). | The present LOR2 state is what the desk shows; a separate forecast LOR2 would need a second reserve definition (H-4 forbids two). |
| A-4 | K-12: the scope is offered "when it matters". | The **app** decides offers (presentation); the sim knows only whether a unit's scope is open (it suspends that unit's auto-sync). Any `ready` unit's scope can be opened from the bay. | Offers are wording and lighting; auto-sync suspension changes the grid, so only that is an input. |
| A-5 | The bench. | `next.html` becomes the greybox game. The Phase 0.2 bench moves to `bench.html` (`app/bench-boot.js`, `render/bench.js`), kept as the physics tool. K-18's "no removed IDs in next.html" applies to `next.html` only. | The bench is how the owner feels the physics; nothing is lost. |

Stage C records A-1–A-5 in SPEC.md (§9.1 as Q-6–Q-10, S-4, H-8, K-7, K-12) with the measured
effects.

---

## 1. Module map and ownership (stage B)

Each agent edits **only** the files in its row, its own `params.js` block (`// ---- phase 1a
"<owner>" block`), and its own tests. It works in its own git worktree and commits there.

| Owner | Files it writes | Its tests | Spec |
|---|---|---|---|
| **sim** | `sim/*.js` (all), `sim/README.md` (§-by-§ updates for what it changes), `tools/par.js`, `tools/baseline-v4.js`, `tools/baseline-v4.golden.md`, `app/assist.js`, `app/system.js` (new) | `tests/{state,grid,physics,autopilot,integration,events,market,params,baseline-v4,sim-lint,loop}.test.js`, new `tests/plan.test.js`, `tests/sync.test.js`, `tests/system.test.js` | L-0, L-4, L-6, K-2 (HAND/MAN), K-3 (sim side), K-7 gate, K-12 (sim), H-8/K-10 (A-2), S-12 re-measure, F-6 |
| **desk** | `desk/*.js` (new), `desk/desk.css` (new) | new `tests/desk.test.js` | K-1, K-3 (guards), K-4, K-5, K-6, K-7 (UI), K-8 (tile view), K-9 (tray view), K-10 (gauge view), K-11, K-12 (scope UI), K-13 (restore bay UI), K-17 (desk panel sizes) |
| **stack+map** | `app/planview.js` (new), `render/livestack.js` (new), `render/map.js` (new), `render/mapdata.js` (new) | new `tests/planview.test.js`, `tests/livestack.test.js`, `tests/map.test.js` | L-1–L-9, G-1, G-5 |
| **shell** | `next.html`, `bench.html` (moved from next.html), `app/boot.js` (rewritten for the game), `app/bench-boot.js` (the old boot.js), `app/director.js`, `app/game.js` (new), `app/alarms.js` (new), `app/tray.js` (new), `app/keys.js` (new; `app/input.js` stays for the bench), `app/watch.js` (new), `app/perf.js` (new), `audio/*.js` (new), `render/format.js`, `content/text.js` | `tests/bench.test.js` (retargeted to bench.html), new `tests/next.test.js`, `tests/director.test.js`, `tests/alarms.test.js`, `tests/audio.test.js`, `tests/text.test.js` | F-5 modes (FAST, RESPOND, FOCUS, compact watch), K-8 model, K-9 model, K-15, K-16, K-17 layout, K-18, K-19, K-20 clack, K-23 key map, F-11 `?perf`, H-14 anchors |

Frozen for stage B (nobody edits): `index.html`, `tools/harness.js`, `tools/policies.js`,
`tools/baseline.js`, `tools/baseline.golden.md`, `tests/lib/*` (add new helper files only),
`content/scenarios.js` (sim may add fields for the plan; values only through tuning),
`SPEC.md` (stage C only).

Cross-module rules outside `sim/` (checked by tests):
1. `render/`, `desk/`, `audio/` read the **view model** (§5) only: `observe()` output plus app
   state. They never import `sim/` except `sim/params.js` (public constants) and never touch
   `state`. `app/planview.js` imports only `sim/params.js`.
2. Everything that changes the grid is a sim input sent through `actions.input(x)` (§4).
   Presentation (focus, expand, ACK, SILENCE, pause, rate, FAST, skip, scope *offers*) never is.
3. `Math.random` only under `render/` and `audio/` (F-3). Relative `.js` imports only; no
   request to another origin; no build step (C-1). `<meta charset="utf-8">` first (C-2).
4. No `location.reload()` (C-3). Storage and audio are optional (C-8): wrap every
   `localStorage` access in try/catch; the game plays with both blocked.
5. Plain ES modules, LF, no dependencies, no frameworks.

---

## 2. Time, modes and the director (shell; F-5, K-15, K-16)

`app/director.js` owns the rate. Modes (the badge always shows mode and rate):

| Mode | Rate | Enters | Leaves |
|---|---|---|---|
| CRUISE | 120× (flat until Phase 2) | default | — |
| FAST | 3 × CRUISE while F is held | F down | F up, any new P1/P2 alarm, WATCH, RESPOND, FOCUS |
| WATCH | full 0.15×/1×/10× over 0–3/3–10/10–30 s; compact 0.5×/2×/20× | a contingency record | watch end (sim `watchEndTick`) |
| RESPOND-CARD | 0 (clock held) | watch end | Enter, or any desk input (the card's dismiss) |
| RESPOND | 30× | card dismissed | frequency back in 49.85–50.15 Hz (`contingency.backInBandTick >= 0`) or 5 grid-min after the card, then CRUISE |
| FOCUS | 1× | a synchroscope opened (sim `scope.unit !== ''`), or a restore breaker being closed (2 grid-s after a `restore` input) | scope closed / unit synced; the restore's 2 grid-s |
| PAUSE | 0 | Space, hidden tab, day over | Space |

Precedence: PAUSE > WATCH > RESPOND-CARD > FOCUS > RESPOND > FAST > CRUISE. Debug speeds stay
on `bench.html` only.

**Watch version** (K-15): full the first time ever (localStorage `gridwatch:v4:seen` has no
`watch`) and on anything new (first UFLS operation seen, first HIGH RoCoF); otherwise
compact. Esc skips only after a full watch has been seen (skipping plays the rest at CRUISE).
Viewing never changes the outcome (C-7): the director only picks the rate.

**RESPOND card** (K-16, `app/watch.js` model + `desk`-independent overlay in the shell): ≤4
lines, **no action buttons**: nadir vs the standard, MW caught per source (from
`contingency.caught`), the problem in plain words (the H-4 level and R5 − L if short, dark
districts, the 30:00 secure countdown from `secureByTick`), and "Enter to take the desk". The
lit set is `planview.glowSet(vm, gapAfterTrip)` plus the restore bay if districts are dark.

---

## 3. Sim changes (sim agent)

`SIM_VERSION` → `v4-core-1a.0`. The observe() shape gains the fields below
(`tests/state.test.js` OBS_SHAPE updated by the sim agent). `hashState`, JSON resume and the
S-4 barrier rules are unchanged; new state is plain JSON.

### 3.1 The plan in state (L-0, L-4, L-6)

```
state.plan = {
  madeAtS: -1,            // grid second of the last planLoad (-1: no plan yet)
  rev: 0,                 // +1 on every change (UI cache key)
  stations: [             // V.STATION_IDS order, hydro included
    {id, man: false,      // HAND mode only: lever grabbed, plan suspended (K-2, L-6)
     doneS: -1,           // atS of the last keyframe applied (each applies once)
     clampedMW: 0,        // > 0: the last applied keyframe was clamped by this many MW (re-applied when onCount rises)
     keys: [{atS, mw}]},  // "arrive-by" keyframes, sorted by atS, at most one per atS
  ],
  tie: {doneS: -1, keys: [{atS, mw}]},
  starts: [{unit, atS}],  // booked STARTs (issued at atS), sorted by atS then unit
  stops:  [{unit, atS}],  // booked STOPs
}
```

**Meaning of a keyframe** `{atS, mw}`: the station's lever (Σ base points of its `'on'`
machines) should *arrive* at `mw` by `atS`. The executor (`grid.planSecond`, run each grid
second right after `events.applyDue` and before `unitsSecond`) does, for each station not
`man`:
* next = the first key with `atS > doneS`; lead = |mw − lever| / (station ramp now, Σ
  `rampMWs` of its `'on'` machines; ∞ if none). When `s + lead >= atS` (or `atS <= s`), apply
  it through the same code path as a `basePoint` input (`fleet.setBasePoint` equal shares,
  clamped to [Σmin, Σavail]); `doneS = atS`; `clampedMW` = requested − applied (≥ 0).
* If `clampedMW > 0` and the station's onCount rose since, re-apply the same mw once more.
* `mw === 0` on a key means: unload to MIN, then STOP every machine of the station (the
  executor books their stops at the arrival time; STOP is H-1's profile).
* Keys older than `s − 1800` are dropped (the stack shows 30 min of past from history, L-1).

Booked starts/stops are issued at `atS` through the same code path as the inputs
(`fleet.startBlock` / `stopBlock`); a refused one is dropped with a `log` record
(`code: 'PLAN'`), exactly as par's refused plan inputs were. Tie keys set `tie.setMW` when
due (the tie ramps; same arrive-by rule with `TIE_RAMP_MW_MIN`).

### 3.2 New and changed inputs (README §6 table gets these rows)

| type | args | Accepted when | Effect |
|---|---|---|---|
| `basePoint` (changed) | `station`, `mw` | always | as today **plus**, in AGC mode, the plan: drop the station's keys with `atS` < arrival, insert `{arrival, applied mw}` where arrival = s + ⌈\|Δ\| / station ramp⌉ (L-6: exactly one keyframe, at the earliest ramp-feasible time); `doneS` = arrival. In HAND: `man = true` (plan suspended for that station). |
| `planKey` | `station`, `atS` (int s), `mw` (≥ 0) | `atS >= s`; the station exists | Insert/replace the key at `atS`. **Rewrites** `atS` up to the earliest ramp-feasible time from the previous key (or from the lever now), and `mw` into [Σmin, Σrating] of the machines on or booked on by then. If no machine of the station is on or booked by `atS` and `mw > 0`, books the START of the first startable machine at `atS − startToMinS` (rewriting `atS` to `s + startToMinS` if that is past). `mw = 0`: unload then stop (§3.1). |
| `planDel` | `station`, `atS` | a key at exactly `atS` | removes it (and any stop it booked) |
| `planStart` | `unit`, `atS` | `atS >= s`; unit off, `startBlock` '' | books START at `atS` (replaces a booking of the same unit) |
| `planStop` | `unit`, `atS` | `atS >= s`; unit committed | books STOP at `atS` |
| `planUnbook` | `unit` | a booking of the unit | removes its booked start/stop |
| `planRejoin` | `station`, `keep` (bool) | HAND mode, `man` | `man = false`; `keep`: replace keys up to the next one with the present lever (L-6 KEEP) |
| `planLoad` | `fromS` (int), `stations` {id: [[atS, mw], ...]}, `tie` [[atS, mw], ...], `starts` [[unit, atS], ...], `stops` [[unit, atS], ...] | `fromS >= s`; ≤ 400 keys per list; sorted; valid ids | Replace every plan entry with `atS >= fromS`; clear `man` flags; `madeAtS = s`. Used by the 04:30 pre-dispatch, RE-DISPATCH, the dark-city reflow and par. |
| `tie` (changed) | `mw` | always | as today **plus**, in AGC mode, the tie's plan like `basePoint` |
| `scope` | `unit` ('' closes) | unit `ready` (or '') | `scope.unit`; suspends that unit's auto-sync while open (A-4) |
| `syncTrim` | `unit`, `dHz` ∈ {−0.05, +0.05} | unit on the scope | machine speed target += dHz; slip moves linearly to it over `SYNC_TRIM_S` (0.5 s) |
| `syncAuto` | `unit` | unit `ready` | trims slip to +0.10 Hz and closes cleanly on the next pass through 0° (K-12 AUTO; the app sends it after 8 real s on the scope without a close) |
| `syncClose` (changed) | `unit`, `bypass` (bool) | unit `ready`; not blocked (below) unless `bypass` in HAND | the K-12 outcome table, judged at the angle `SYNC_BREAKER_TICKS` (80 ms = 4 ticks) after the input |
| `directShed` (changed) | — | as today **and** `sec.level` is SHORT or SHEDDING (A-3) | unchanged |

`ack`, `silence`, pause, rate, FAST, skip, focus, expand and scope *offers* are not inputs.

### 3.3 K-12 synchroscope in the sim

When a unit reaches `ready`, the sim seeds its slip from the PLAY stream
(`uniform(seed, PLAY, tick, k, 1)`): magnitude in [0.15, 0.40] Hz, sign from a second draw;
the phase angle starts at `uniform(...)·360 − 180`. Fields on the unit (grid-owned, observed):
`slipHz` (machine − grid, + = machine fast = needle clockwise), `phaseDeg` (−180..180, 0 = in
phase), and private `slipToHz`, `slipAtTick`, `phaseAtDeg`. The angle is analytic (piecewise
linear slip): no per-tick integration, no transcendental Math (§2 rule 2).

Outcome of `syncClose` at angle θ (80 ms later) and slip σ:

| Condition | Result | Record |
|---|---|---|
| \|σ\| > 0.5 Hz or \|θ\| > 20° | refused `'blocked by sync-check relay'` (HAND + `bypass`: closes, then trips at once with a 20-grid-min lockout) | `input` refusal, `cue: 'buzz'` |
| σ < 0 and \|θ\| ≤ 20° | closes, then reverse-power trip after 2 grid-s, back to `ready` with a new slip, no lockout | `sync {unit, result:'reverse'}` `cue: 'growl'` |
| σ > 0, 10° < \|θ\| ≤ 20° | closes: rough (block as clean, plus a `SYNC_ROUGH_MW` one-second swing in `schedMW`), shaft stress logged | `sync {result:'rough'}` `cue: 'growl'` |
| σ > 0, \|θ\| ≤ 10° | clean: ≤5% block then T2 to MIN (today's close) | `sync {result:'clean'}` `cue: 'breaker'` |
| auto-sync (AGC, `AUTO_SYNC_S` after ready, scope not open) or `syncAuto` | always clean | `sync {result:'auto'}` |

`observe().scope = {unit, open}`; `observe().units[]` gains `slipHz`, `phaseDeg` (0 when not
`ready`). New params (sim block): `SYNC_SLIP_MIN_HZ` 0.15, `SYNC_SLIP_MAX_HZ` 0.40,
`SYNC_TRIM_HZ` 0.05, `SYNC_TRIM_S` 0.5, `SYNC_BREAKER_TICKS` 4, `SYNC_CLEAN_DEG` 10,
`SYNC_ROUGH_DEG` 20, `SYNC_BLOCK_SLIP_HZ` 0.5, `SYNC_REVERSE_TRIP_S` 2, `SYNC_BYPASS_LOCKOUT_S`
1200, `SYNC_AUTO_SLIP_HZ` 0.10, `SYNC_ROUGH_MW` (simplified, with a note). All labelled
(§8.2 "Our synchroscope turns faster").

### 3.4 Autopilot, assist and the app's system layer

* `preDispatch(obs)` returns the plan **as a `planLoad` input** (plus its diagnostic
  columns). Keyframes become arrive-by (`atS` = the column time the value is for).
* Par executes nothing itself: at 04:30 it sends `planLoad` (without stops, S-4); each
  `amend` sends a `planLoad` from now (origin `'replan'`); rules 1/2's tie hold is written into
  the amended plan's tie keys (no separate hold). `planInputs` and the queue go away;
  `runPar`'s `origins` gain `'planLoad'`.
* planOnly's `reflowLit` becomes a `planLoad` too.
* **`app/system.js`** (sim agent; DOM-free, imports `sim/autopilot.js` and `sim/step.js` like
  `app/assist.js`) is the game's "system operator": `createSystem()`, `systemInputs(sys,
  state)` → at 04:30 the pre-dispatch `planLoad`; while districts are dark the L-0 reflow
  (`planLoad`, every `PLAN_REFLOW_S` and when the dark share moves), so a no-input day is
  never black (L-0 accept); and `redispatch(sys, state)` → the RE-DISPATCH `planLoad` (A-1) or
  a reason it is refused ('not during the watch', 'no plan before 04:30'). All are logged
  inputs, so `replay()` reproduces a game day (F-6).
* `app/assist.js` keeps ASSIST PLAN / PAR for the bench on top of the same.

### 3.5 N-1 over both credible contingencies (A-2)

`grid.security` previews the largest unit and the tie import (when importing); `sec` gains
`previewUnitHz`, `previewLinkHz`; `lKind`/`lId`/`previewNadirHz` name the worse of the two
(ties to the unit); SECURE needs R5 ≥ 1.25 L **and** both previews ≥ 49.5 Hz + margins.
Behind param `N1_PREVIEW_ALL` (default true). K-10's preview-matches-nadir test is rerun for
both kinds.

### 3.6 Measurement (sim agent, before handing over)

Re-run `node tools/baseline-v4.js` (re-record the golden) and report the S-12 table (par
clean raw/heat, RERT, commitAll, lean A, planOnly black, H-8 containment for both kinds, par
day runtime) against the Phase 0.2 figures, with A-2 on and off. If A-2 breaks an S-12
target, leave `N1_PREVIEW_ALL` false and report.

---

## 4. Actions (what the UI may call)

Every UI module receives `actions`:

```
actions.input(x)        // a sim input (§3.2 and sim/README §6); returns '' or the refusal reason
actions.redispatch()    // A-1 RE-DISPATCH through app/system.js; returns '' or the reason
actions.ui(cmd)         // presentation only, cmd = {do: ...}:
   {do:'focus', target}         // focus a control by id (tray buttons, annunciator tiles, glow)
   {do:'hover', target|null}    // cross-highlight map <-> lever <-> stack layer (G-2 basics)
   {do:'ack'} {do:'silence'}    // annunciator (K-8)
   {do:'ackTile', id}
   {do:'stackExpand', on}       // L over the map (L-4)
   {do:'preview', on}           // TRIP PREVIEW ghost (K-10), T / hover
   {do:'previewGuard', mw|null} // the ring being turned: ghost needle for that guard (K-5)
   {do:'offerTaken', unit}      // the player opened an offered scope
   {do:'dismissRespond'}        // Enter on the respond card
   {do:'pause'} {do:'fast', on} {do:'skipWatch'} {do:'drawer'} {do:'tray'}
actions.previewTrip(opts)  // {kind:'unit'|'link', id?, guardMW?} -> {nadirHz, caught} (runs
                           // physics.previewTrip on the live state via app/game.js, cached per
                           // grid second and guard value; the ONLY way UI reaches the engine)
actions.restorePreview(districtId) // -> '' or refusal (grid.restorePermissive with preview)
```

Controls send the **applied** values back through the next frame's view model; a control
never assumes its input was accepted.

---

## 5. The view model (shell builds it once per frame; everyone reads it)

`app/game.js` builds `vm` after each frame's ticks:

```
vm = {
  obs,                 // observe(state), fresh each frame (contains plan, scope, forecast, sec, ...)
  mode,                // director: {mode, rate, watchS, locked, watchVersion: 'full'|'compact'|null}
  frame: {nowMs, dtS, alpha},
  alarms,              // app/alarms.js: {tiles: [{id, label, prio, state:'normal'|'alarm'|'ackd'|'cleared', flash:'fast'|'slow'|null, glyph, target}], sounding: bool}
  tray,                // app/tray.js: {cards: [{id, from, atS, text, button:{label, target}, sev}], log: [...]}
  focus,               // id of the focused control or null
  hover,               // hovered asset id or null
  stackExpanded, previewOn, previewGuardMW,
  offers,              // [{unit, why}] scopes offered now (A-4)
  respond,             // null or the K-16 card model {lines:[...], glow:[targets]}
  glow,                // Set of control ids to light (L-9 hover / K-16 respond)
  hist,                // app/game.js ring buffers: freq (3 min at 1-s), per-station output and demand (last 30 grid-min at 5-min cols) for the stack's past
  settings,            // {volume, muted}
}
```

Control and target ids (stable; tiles, tray buttons and glow sets use them):
`lever-coal lever-ccgt lever-gta lever-gtb lever-gtc wheel-hydro dial-battery ring-guard
knob-tie key-rert btn-dr key-shed key-agc btn-redispatch guard-start-<unit>
guard-stop-<unit> bay-sync bay-restore gauge-n1 dial-freq bar-imbalance annunciator tray
stack map`.

---

## 6. The desk (desk agent)

`desk/desk.js` exports `createDesk(doc, root, actions)` → `{update(vm), el}`; it builds the
desk panels inside `root` (a `#desk` element the shell sizes to max(300 px, 50% of the
viewport below the header), K-17). Controls are DOM elements with ARIA roles (slider,
switch, button); canvas only for the frequency dial and the synchroscope (K-23). Plain
shapes and colours (greybox), every lamp/tile with a glyph or letter as well as colour.
Every control ≥ 24×24 px; no horizontal scroll at 1280 px. Layout per SPEC §4.2 (232 / 424 /
336 / 256 px columns at 1280 px wide; scale proportionally above).

| File | Exports | What |
|---|---|---|
| `desk/levers.js` | `createLevers` | K-1: COAL, CCGT, GT·A, GT·B, GT·C. Handle = plan/base point (`stations[].basePointMW`); behind it the output needle (`outMW`), the AGC band bracket (base ± band), the 10-grid-min ramp cone; detents MIN/25/50/75%; the 96% spring gate (+12 px extra drag or Shift+↑ to cross; red zone shows that station's `hotS` risk). One lamp per machine with its own START/STOP guard (K-3: lift then press, or S S / X X within 2 s; STOP while unloading offers ABORT). Drag → `basePoint` on release (and at most every 250 ms while dragging, so the servo is felt); ↑/↓ ±10 MW, Shift ±1, PgUp/PgDn next detent. HAND: amber MAN lamp, P / double-click rejoins (`planRejoin`). |
| `desk/rotary.js` | `createHydroWheel`, `createBatteryDial`, `createTieKnob` | K-4 wheel (drag in a circle / scroll / ←→ 1%, Shift 10%) → hydro `basePoint`; rim shows storage and "water lasts until HH:MM" (storage − `HYDRO_STOP_MWH` over the gate MW), red arc where it empties before the forecast peak ends. K-5 dial CHARGE/IDLE/DISCHARGE + magnitude, GUARD ring 0–500 in 50-MW detents (`guard`), FFR ARMED lamp, FULL–HOLD; turning the ring calls `actions.ui({do:'previewGuard', mw})`. K-6 knob −800..800 (detents 0, ±250, ±500, ±800), link lamp, export-cap red arc. |
| `desk/emergency.js` | `createEmergency` | K-7: RERT key under a red cover (lift, then hold 0.6 s or hold E) with cost and lead shown first; DR big button (hold D 0.6 s) with call lamps; DIRECT SHED guarded key visible only while SHORT/SHEDDING. RE-DISPATCH key (A-1) calls `actions.redispatch()`. AGC/HAND key (display; locked after 04:30). |
| `desk/annunciator.js` | `createAnnunciator` | K-8 view: 4×3 tiles from `vm.alarms.tiles` (fast/slow flash classes, ≤3 Hz under reduced motion), ACK and SILENCE buttons, click/Enter → focus the tile's target. |
| `desk/tray.js` | `createTray` | K-9 view: ≤3 cards, LOG drawer; a card's button only calls `actions.ui({do:'focus'})`. |
| `desk/gauge.js` | `createGauge` | K-10: "SPARE IN 5 MIN" (R5) vs "BIGGEST RISK: <name>" (L) bars, SECURE/TIGHT/SHORT/SHEDDING word; TRIP PREVIEW (T or hover) ghost result with the MW each source catches; colours ≥49.5 green, 49.0–49.5 amber, <49.0 red; plain words on the face, R5/L/LOR behind "?". |
| `desk/dial.js` | `createFreqDial`, `createImbalanceBar` | K-11: canvas dial 49–51 Hz, bands, UFLS mark at 49.0, needle (1-s average above 10×, F-4), ghost needle from the preview, 3-decimal readout, CHANGE (RoCoF, Hz/s) and SPIN (GW·s), "HAND" on the face when HAND. Imbalance bar: scheduled supply − demand plus the hatched BORROWED stack (inertia, battery FFR, governors, load relief) and red SHED; segments sum to the swing-equation imbalance (±1 MW). |
| `desk/bay.js` | `createBay` | Procedure bay. **SYNC** (K-12): list of `ready` units, lit when offered; the scope (canvas needle at `phaseDeg`, turning at `slipHz`, 12 o'clock mark, ±10° green / ±20° amber sectors); `[`/`]` → `syncTrim`, C / breaker handle → `syncClose`, U → `syncAuto`; after 8 real s open with no close, send `syncAuto`; label "Real operators aim for 15–30 s per turn…". **RESTORE** (K-13): dark districts as feeder breakers, cold-load MW (1.5× after 10 min), RESTORE PERMISSIVE lamp (`restoreBlock === ''`), per-district preview colour from `actions.restorePreview`, R / ←→ / Enter; close → `restore`. |
| `desk/desk.js` | `createDesk` | Builds the grid of panels, routes keyboard focus 1–8 (COAL…tie), and passes `vm` down. |
| `desk/desk.css` | — | Desk styles (the shell links it). |

---

## 7. The Live Stack and the map (stack+map agent)

**`app/planview.js`** (pure; imports `sim/params.js` only; reads `obs` only):
* `project(obs, opts)` → per 5-min column from now−30 min to now+4.5 h (6 past + 54
  future): each station's projected lever MW from `obs.plan` (keys, bookings, the executor's
  arrive-by rule, ramps, T1/T2 of booked starts, the stop profile), the tie, wind/solar
  forecast, battery order, hydro; plus per-column `supply`, and `gap` classes: red (supply <
  P50), amber (< P90), blue (inflexible floor > P10; Phase 2), for L-5. Must agree with what
  the sim then does (tested by stepping a sim in the stack+map tests after merge; before merge,
  against a hand-built obs).
* `earliestArrival(obs, station, mw)` → `{atS, needsStart: unit|null}` (L-4 ghost, L-6
  arrival, L-9).
* `glowSet(obs, gap)` → the control ids of units whose earliest arrival ≤ the gap's start
  (L-9, K-16).
* `snapDrop(obs, station, atS, mw)` → the `planKey` the drop would send, on the 15-min / 50-MW
  grid, or `{infeasible: true, ghost}`.

**`render/livestack.js`**: `createLiveStack(doc, root, actions)` → `{update(vm), el}`. Canvas
336×164 at the floor (L-4 expand: an overlay ~1248×420 over the map on L or the corner
button; the clock keeps running). Fixed 0–9,000 MW axis (L-1); P50 skyline + LIKELY RANGE
band (L-2); layers in P-6 cost order coloured as the levers and the map (L-3); drag handles
with ≥24-px hit areas; drops snap to 15 min / 50 MW and send `planKey` (L-4); off units as
ghosts from their earliest-start line; red/amber gaps (L-5; first-shift simplification is
Phase 2); hover a red gap → `actions.ui({do:'hover'})` + glow (L-9); during the watch the
tripped layer tears and the stack is read-only (L-7); keyboard: number selects a layer,
arrows move one snap step, Enter drops. Render ≤4 ms at 1280 px.

**`render/map.js`** + **`render/mapdata.js`**: `createMap(doc, root, actions)` → `{update(vm),
el}`. Greybox isometric map on one canvas at an **integer** pixel scale of a fixed
offscreen size (G-1: e.g. 320×134 base → ×4 at 1280×536…; choose a base so 1280×600,
1280×720 and 1920×1080 all give integer scales with terrain to the frame edges). Buildings
for every station, the battery, the tie, wind, solar; six suburbs (U-1 names, SPEC §4.5) made
of the 32 districts (`obs.districts[].suburb`); districts go dark block by block (G-5); a
tripped plant shows smoke + red strobe while locked out; rotors slow in the watch; restored
districts relight. Labels only on hover or alarm (≤3 at rest). Hover a plant →
`actions.ui({do:'hover', target: 'lever-...'})`. `Math.random` allowed here (fx only). A
bounding-box test proves no building sits outside the terrain.

---

## 8. The shell (shell agent)

* **`next.html`**: header 32 px (clock, rate badge, LIGHTS ON / COST / CO₂ chips from
  `score` summary, PAUSE, ?), `#map` (top), `#desk` (bottom, K-17 sizes), overlays (respond
  card, watch vignette + stopwatch "T+0.00 s ×0.15", end card, drawer, `?perf`). Links
  `desk/desk.css`. One module script: `app/boot.js`. No IDs from K-18's removed list
  (`selP`, `strip`, the bench's chart/panel ids).
* **`app/game.js`**: the game session (DOM-free): sim state, director, pacer, `app/system.js`,
  alarms, tray, history rings, `previewTrip`/`restorePreview` caches, `vm` builder, input log
  (F-6) and replay export. Mirrors `app/session.js` (which the bench keeps).
* **`app/boot.js`**: mounts `createMap`, `createDesk`, `createLiveStack`, the overlays and
  audio; runs the frame loop (`app/loop.js`); draws after ticks (X-26).
* **`app/alarms.js`**: K-8 basics, pure: tiles UNDER FREQ (set < 49.85, clear > 49.90), OVER
  FREQ (> 50.15 / < 50.10), N-1 INSECURE (level ≠ SECURE for ≥ 10 grid-s / SECURE for ≥ 10
  grid-s), HIGH RoCoF (|rocof| > 1 Hz/s), UNIT TRIP, LINK TRIP, UFLS OPERATED (records),
  AGC LIMIT (`agc.atLimitS` > 5 **real** s), STORAGE LOW (hydro < 30% or battery < 10%), MIN
  GEN (placeholder, Phase 2), WEATHER (news), PEAK (17:00–20:00 and level ≠ SECURE); states
  normal / alarm (unacked) / ackd / cleared-unacked; ACK, SILENCE; each tile has a target id
  and a K-21 priority (P1/P2/P3). Test: the competent proxy triggers ≤8 audible alarms a day.
* **`app/tray.js`**: K-9 model from `announce` records (news), station notices (trips,
  syncs, RERT), market notices; ≤3 visible, the rest to LOG; warning cards ring twice.
* **`app/watch.js`**: the K-15 beat model (which beat is live from the trace:
  inertia / battery / governors / UFLS / settle, captions ≤15 words, "YOUR GUARD: N MW") and
  the K-16 respond card model.
* **`app/keys.js`**: the K-23 key map (1–8 focus, ↑↓/PgUp/PgDn, S S / X X, P, [ ] C U, R ←→
  Enter, A / Shift+A, D / E hold, T M L Tab, Space Esc F-hold) → actions; keys typed in text
  fields are ignored.
* **`audio/audio.js`**: WebAudio, created on the first gesture (C-8: silent if unavailable).
  K-19 hum: partials k·2f (k = 1…4) plus a quiet reference k·100 Hz, beating at 2k·|Δf|,
  −30 dBFS default; K-20 breaker clack (bandpassed noise transient + inharmonic partials near
  0.9/1.4/2.2 kHz, 120 ms decay, thud). ≤32 nodes. `audio/model.js` holds the pure parts
  (partial frequencies from f, envelopes) for tests.
* **`app/perf.js`**: `?perf` overlay: frame ms p50/p95, sim ms, draw ms per module, ticks per
  frame (F-11).
* **`content/text.js`**: new §8.2 entries for A-1 (RE-DISPATCH), the synchroscope's speed,
  and the anchors of the new desk elements (H-14).

---

## 9. Tests and the definition of done

* `node --test` stays under 60 s and green (F-10). Slow statistics only with
  `GRIDWATCH_SLOW=1`.
* Each agent's tests cover every *Accept* of its items that can be checked headless (DOM
  modules through the stand-in DOM pattern in `tests/bench.test.js`; extend it in a new
  `tests/lib/dom.js` if needed, shell agent owns that file, others may copy the pattern
  locally until merge).
* Stage C adds `tests/next.test.js`'s whole-day run: `next.html` + `app/boot.js` in the
  stand-in DOM, fake frames, a scripted desk player that only uses `actions`, a full day to
  04:00 without an exception, replay of its log matches its scorecard (F-6).
* Greybox check (SPEC Phase 1a gate) is the owner's, after merge.

---

## 10. Stage C record (integration, 2026-10-01)

The four stage B branches merged without conflicts. What integration found and changed:

* **Seams between the agents' modules** (each passed its own tests against the contract):
  * `app/system.js` returns `{input, reason}` from `redispatch`; `app/game.js` read an object as
    an input. Fixed in game.js (string, input, list or `{input, reason}`).
  * The respond card passed `{fromS, toS}` to `planview.glowSet`, which reads `gap.atS`, so
    nothing glowed. game.js now passes planview's first red run (`firstGap(project(obs))`), or
    the N-1 problem's `{atS: secureBy}` when the stack shows none.
  * The desk named its Live Stack slot `#stack` (the stack's own element id) while the shell
    mounts into `#stack-slot`. The desk's slot is `#stack-slot`; `#stack` is the Live Stack.
  * `vm.hist`: the shell kept six numeric column means; the stack read `{s, mw}` records and also
    draws wind, solar, tie, battery, diesel and DR. The shell records all twelve layers and
    `planview.pastFromHist` reads the shell's column form.
  * `app/planview.js` treated a 0-MW key as "stop the station" (this file's §3.1 wording); the sim
    made it "lever to its floor" with stops as separate bookings (sim/README.md §12 Phase 1a,
    deviation 1). The projection follows the sim now. It showed hydro switched off for ~30 min
    at the evening peak while it ran at ~900 MW.
* **Projection vs the executor** (`tests/planview.test.js`, stage C test): 4.5 h ahead with no
  input, every station's projected MW is within its AGC band of the sim's real output. The
  other misses seen in probes were all unforecast trips.
* **K-13 reserve rule** (`sim/grid.js restorePermissive`; SPEC §9.1 Q-10; `SIM_VERSION`
  v4-core-1a.1): the whole-day test's restoring player went black on seed 20260930, because
  restores that passed the preview could not be carried. The permissive (lamp and input) now also
  needs R5 ≥ the district's cold-load MW.
* **Whole days** (`tests/day.test.js`): `next.html` with every real module in the stand-in DOM,
  a scripted player using `actions` only; 04:00–09:00 and a trip walked through WATCH →
  RESPOND-CARD → RESPOND in the default suite, three whole days in the slow suite; the logs
  replay to the same `hashState` (F-6).
* **Browser** (Chromium, the preview pane at 1280×600): the page boots with every module, no
  console error, header 32 / map 268 / desk 300 px, the Live Stack mounted at 334×167 in its slot,
  no horizontal scroll. The pane is hidden in this environment, so frames do not run there; play
  is covered by the Node day tests.
* **Risk found (not fixed): stale modules after a deploy.** The first browser load mixed a cached
  old `render/format.js` with new modules and failed on a missing export. GitHub Pages lets
  browsers cache files for ~10 minutes, so a returning visitor during that window after a push
  could get the same failure. A fix (a version query on every import, or one versioned entry
  path) belongs with the Phase 4 switch of `index.html`, before strangers arrive.
