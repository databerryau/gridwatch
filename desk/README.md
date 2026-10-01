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

---

# Phase 1b: desk polish (contract)

SPEC.md §5 "1b — Polish": K-8 details (the ISA-18.1 flash sequence, the 30-s re-sound rule);
K-20 full foley; K-21; K-22; K-23; G-2–G-4; the F-11 budget. Same method as 1a: this section is
stage A; stage B is four agents in parallel, one file set each (§12); stage C integrates,
measures and ships. Everything above this line still holds unless a row here changes it. No
gate: 1b may land before or after the greybox check, so **nothing here may change what a
control does**; it changes how the desk looks, sounds and is reached.

The sim does not change (`SIM_VERSION` stays `v4-core-1a.1`, goldens untouched). Stage A added
one read-only field to `observe()`: `sky: {clearness, windFrac}` (the present `env` values).

## 11. Decisions taken in stage A (owner-delegated, OD-17)

| # | Question | Decision | Why |
|---|---|---|---|
| B-1 | K-21 lists "frequency outside 49.5–50.5 Hz" as P1, but the UNDER/OVER FREQ tiles set at the normal band (49.85 / 50.15) and K-21's accept wants one priority per tile. | UNDER FREQ and OVER FREQ are **P2** tiles (a chime). While the frequency is outside 49.5–50.5 Hz the tile is **escalated**: it shows and sounds as P1 (`tile.prio` in the view is the effective one; `TILES[].prio` is the base, `TILES[].escalates: true`). | The owner found v2 "too stressful": a horn should mean real trouble (the containment band), not a 0.16 Hz wobble. Real control rooms escalate the same alarm by severity. |
| B-2 | ISA-18.1 sequence and flash rates. | Sequence **R** (ring-back), visual only: alarm = fast flash, ACK = steady, clears before ACK = slow flash until ACK, clears after ACK = dark. Fast = 2.5 Hz, slow = 0.8 Hz for everyone (never above 3 Hz, WCAG 2.3.1). Reduced motion: fast = 1 Hz, slow = steady with the ◇ glyph. | One safe rate for strangers arriving by link; the glyphs carry the state without the flash. |
| B-3 | K-21 P2 repeat and K-8's 30 s. | P2 repeats **once**, 60 real s after it sounded, if its tile is still unacknowledged. Horn repeats and the P2 repeat are *re-sounds* of the same alarm: they do not count in `audible`, and they are the only sounds allowed inside a tile's 30-s hold-off (they are the same sounding, not a new one). | K-8's accept counts alarms, not horn blasts. |
| B-4 | K-18 "CRT scanline overlay: optional". | On by default, very subtle (a fixed 2-px scanline over the map only, opacity ≤ 0.06, no flicker, no animation). REDUCED EFFECTS turns it and the hum off. | The control-room feel is the point of the polish pass; it must never cost legibility. |
| B-5 | K-22 "no camera zoom in the watch", but G-1 needs an integer pixel scale. | The watch's camera is a **spotlight**, not a zoom: the map dims except a soft circle on the tripped plant (or the tie), which eases in over 0.6 s. Reduced motion: the spotlight appears at once and nothing shakes. | Keeps G-1's crisp pixels and still points the eye at the cause. |
| B-6 | Foley for desk gestures needs a channel that is not a sim input. | `actions.ui({do: 'cue', name, pan?, gain?})` (presentation). The game queues it into `vm.cues`. | Sound is presentation; the input log stays clean (F-6). |
| B-7 | Settings location. | A SETTINGS popover from a header button (`#btn-settings`, also `,`): four sliders, three switches. Never pauses the game. | No menu wall; one click from play. |

## 12. Ownership (stage B)

Each agent edits only its row, in its own worktree, fast-forwarded to `phase-1b-polish` first.

| Owner | Files | Tests | Items |
|---|---|---|---|
| **sound** | `audio/audio.js`, `audio/model.js` | `tests/audio.test.js` | K-20, K-21 (tones), K-22 (buses, reduced effects) |
| **desk** | `desk/*.js`, `desk/desk.css` | `tests/desk.test.js` | K-8 view (B-2), K-20 (emits cues), K-22 (glyphs, reduced motion), K-23 (ARIA, keys, nothing drag- or hover-only) |
| **map** | `render/map.js`, `render/mapdata.js`, `render/livestack.js` (K-22/K-23 fixes only: no behaviour change) | `tests/map.test.js`, `tests/livestack.test.js` | G-2, G-3, G-4, G-5 polish, B-5, K-23 for the map and the stack |
| **shell** | `next.html`, `app/shell.js`, `app/game.js`, `app/alarms.js`, `app/keys.js`, `app/perf.js`, `app/tray.js`, `app/watch.js`, `app/director.js`, `content/text.js`, `render/format.js`, `tests/lib/dom.js` (additions only) | `tests/{alarms,next,director,text}.test.js`, new `tests/settings.test.js`, `tests/keys.test.js` | K-8 model (B-1–B-3), K-21, K-22 (settings, classes, B-4), K-23 (key routing, live region), F-11 budget in `?perf`, B-6, B-7 |
| stage C | `tools/shot-receiver.mjs`, `tools/perf.mjs`, `tests/budget.test.js`, `tests/day.test.js` (the keyboard-only day), `SPEC.md`, seams | | F-11 measure, release checklist |

Frozen: `sim/**`, `tools/**` (existing files), `index.html`, `bench.html`, `app/bench-boot.js`,
`app/session.js`, `render/bench.js`, `app/planview.js`, `app/system.js`, `app/assist.js`,
`SPEC.md`, every test file not in your row. If you need a change outside your row, write it in
your report; do not make it. The §1 cross-module rules (1–5) still apply.

## 13. Shared interfaces (the seams; read all of this whoever you are)

### 13.1 Settings (shell builds; everyone reads `vm.settings`)

```
vm.settings = {
  volume: 0..1 (master, default 0.8), hum: 0..1 (1), fx: 0..1 (1), alarms: 0..1 (1), muted: bool,
  reducedMotion: bool,   // resolved: the stored choice, else matchMedia('(prefers-reduced-motion: reduce)')
  reducedEffects: bool,  // no CRT overlay, no hum (K-22)
  crt: bool,             // B-4; false whenever reducedEffects
}
```

Stored under `gridwatch:v4:settings` (try/catch, C-8) as the user's choices only
(`reducedMotion` stored as `true | false | null`, null = follow the system). UI commands:
`actions.ui({do: 'set', key, value})`, `{do: 'settings', on?}` (open/close the popover),
`{do: 'mute'}` (Shift+M). The shell also sets `body.rm` (reduced motion), `body.fxlow` (reduced
effects) and `body.crt`, so CSS can follow without reading the vm. Modules given a `vm` read
`vm.settings.reducedMotion`; `desk.css` may use `body.rm …` selectors **and** keeps its
`@media (prefers-reduced-motion)` block.

### 13.2 Cues (`vm.cues`)

A cue is a string `name` or `{name, pan?: -1..1, gain?: 0..1, delayS?: number}`. Sources:

* **Sim records** → `audio/model.js cuesOfRecord(record, ctx)` returns an array of cues
  (`ctx.suburbOf(districtId)` → suburb code, for the pan). The game calls it for every record
  (until merge it falls back to the 1a `cueOfRecord`: `import * as AM`, test `AM.cuesOfRecord`).
* **Alarms** → `horn`, `chime` (app/alarms.js), tray → `ring2`, `tick` (app/tray.js).
* **Desk gestures** → `actions.ui({do: 'cue', name, pan?})` (B-6), names below.

Cue names (the sound agent implements every one; unknown names are ignored, never thrown):

| Name | When | Bus | Sound (K-20) |
|---|---|---|---|
| `detent` | a lever, knob or ring passes a detent | fx | 80 Hz thump |
| `ratchet` | a lever, wheel or ring is dragged | fx | a tick; audio limits it to ≤ 20 per real s (drops the rest) |
| `gate` | the hydro wheel stops / the 96% overload gate is crossed | fx | thunk |
| `key` | a key switch turns (RERT, DIRECT SHED, the AGC/HAND key) | fx | key turn |
| `cover` | a guard or cover lifts or drops | fx | a light click |
| `button` | a push button commits (DR, RE-DISPATCH, ACK, SILENCE, START/STOP press, tabs) | fx | button |
| `servo` | a lever handle is moved by the plan, not the hand (L-6) | fx | a short motor whirr; ≤ 1 per 0.25 s |
| `breaker` | breaker close / RESTORE feeder close (records) | fx | 1a clack |
| `clack` | a UFLS stage or DIRECT SHED sheds a district (records) | fx | relay clack, **panned** by the district's suburb (`render/mapdata.js SUBURBS` box centre x → −1..1), one per district, 90 ms apart (the map's block rate) |
| `growl` | rough / reverse / bypass sync (records) | fx | 60–90 Hz, 1.5 s |
| `buzz` | sync-check relay refusal (records) | fx | buzz |
| `spoolUp` / `spoolDown` | a machine starts / is stopped or trips (records: find the record kinds in sim/README §7; if none marks a start, key off the `input` record `start` and the plan's booked start log) | fx | ≤ 3 s sweep |
| `horn` `chime` `ring2` `tick` | alarms and the tray | alarms | 1a tones (horn: two-tone) |

Budget: ≤ 32 live nodes including the hum and the bus gains (K-20 accept); a cue that would
pass it is dropped. Buses: master → {hum, fx, alarms} gains from `vm.settings`; `reducedEffects`
or `hum === 0` silences the hum bus; `muted` silences master. The map's base width is 640 px
(`BASE_W`): pan = (x / 640) × 2 − 1.

### 13.3 Keys (K-23): who handles what

The shell's document `keydown`/`keyup` listener runs, in order: (1) ignore text fields and
`defaultPrevented`; (2) `mods.desk.key(ev)`: if it returns true, `preventDefault` and stop;
(3) `mods.stack.key(ev)` and `mods.map.key(ev)` if they exist, same rule; (4) the
`app/keys.js` fallback map. So a focused control handles its own keys natively (and calls
`preventDefault`), `desk.key` handles desk-wide keys, and keys.js makes every K-23 key work from
anywhere. The same key must never act twice. D and E holds belong to the desk when it is
mounted (keys.js polls them only when there is no desk).

K-23 accept, as a test stage C writes: a scripted player sending **only keyboard events** to
the document completes a day (focus a station 1–8, move it, start and stop a machine, set the
battery order and the GUARD ring, the tie, open the scope and close a breaker, restore a
district, ACK, call DR, RE-DISPATCH, drop a Live Stack keyframe, dismiss the respond card). So
every control needs a keyboard route and a way to reach it:

| Control | Reach | Operate |
|---|---|---|
| levers | 1–5 | ↑↓ ±10 MW, Shift ±1, PgUp/PgDn detent, S S / X X, P |
| hydro wheel | 6 | ←→ 1%, Shift 10%, S S / X X |
| battery dial | 7 | ←→ mode (CHARGE/IDLE/DISCHARGE), ↑↓ magnitude 50 MW, Shift 10 |
| GUARD ring | 7 then G (or Tab) | ←→ / ↑↓ one 50-MW detent |
| tie knob | 8 | ←→ / ↑↓ 50 MW, Shift 10, PgUp/PgDn detent |
| RERT key | E (hold 0.6 s; first press lifts the cover) | — |
| DR | D (hold 0.6 s) | — |
| DIRECT SHED | focusable; Enter lifts, Enter again within 2 s commits | — |
| RE-DISPATCH | a free letter (desk agent picks one and documents it), or focus + Enter | — |
| scope | `[` `]` C U; a `ready` unit's scope opens with O (the first ready unit) or Enter on its bay button | — |
| restore bay | R, ←→, Enter | — |
| annunciator | A / Shift+A; tiles are buttons (Enter focuses the target) | — |
| tray | M; cards' buttons are buttons | — |
| Live Stack | L (again: expand); number selects a layer, arrows move one snap step, Enter drops (L-4, already there) | — |
| map | Tab from the stack, or focus; ←→ cycles plants and suburbs (sets the hover cross-highlight and shows the label), Esc leaves | — |
| settings | `,` | native sliders and checkboxes |

Free letters the desk agent may claim for new routes: G, O, B, K, V, N. Document every key in
the file header and in `aria-keyshortcuts`. The shell forwards every key to `desk.key` first,
so desk-claimed keys just work without the shell knowing them.

Roles: levers, wheel, ring, knob, magnitude = `role="slider"` with `aria-valuemin/max/now` and
`aria-valuetext` ("COAL base point 1,240 MW, output 1,236 MW"); AGC/HAND key, covers, guards =
`role="switch"` or buttons with `aria-pressed`; tiles, cards, bay rows = buttons. Canvas only
for the dial, the synchroscope, the stack and the map, each with a text alternative
(`aria-label` updated at most once per real second). **Live region**: the shell's `#aria-live`
(polite) mirrors, at most one message per 2 real s: mode changes, the frequency band changing
(normal / outside normal / outside containment), the N-1 word changing, a new alarm's label, a
tray warning's text. The desk's `.dk-live` keeps the per-control notes.

### 13.4 Status is never colour-only (K-22)

Every lamp, tile, level word, gap and map state carries a glyph, letter, word, pattern or
shape as well as colour. Accept (each owner tests its own): each state has distinct
**non-colour** content (text, glyph, or a class-driven shape or pattern), asserted on content,
not on pixels. Known gaps to close: lever machine lamps (state shown by the colour of the
letter), N-1 bars (green/orange/red fill), the Live Stack's red/amber gaps (add hatch
direction or a glyph row), battery lamps on the map, the tripped strobe (add a ✕ mark), dark
districts (already shape: unlit + darker roof; add a hatched outline in the overlay).

### 13.5 Reduced motion (K-22)

With `vm.settings.reducedMotion`: no lever shake (rough sync), no handle transition, no
flashing faster than 3 Hz anywhere (tiles per B-2; glow rings pulse ≤ 1 Hz or sit steady; the
tripped strobe ≤ 1 Hz; rain and cloud shadows drawn static; no spotlight easing). The shell
test asserts `body.rm`; each owner's test asserts its own module honours the flag.

## 14. The four jobs

### 14.1 sound (`audio/`)

Implement §13.2: every cue, the three buses, the ratchet and servo rate limits, pan
(`StereoPannerNode` where available, else centre), the 32-node budget with honest accounting
(`au.live`, `au.peak`, `au.dropped`), `cuesOfRecord`. Keep `cueOfRecord` exported (1a callers)
until stage C removes it. `au.update(vm)` reads `vm.settings` and `vm.cues` (strings or
objects). Hum (K-19) is unchanged apart from its bus. Everything stays pure-testable in
`audio/model.js` (specs as data, `nodesFor(name)`, `busOf(name)`, `panOfSuburb(code)`, the rate
limiter as a pure function of timestamps). Tests: every cue name in §13.2 has a spec, a bus
and a node count; a storm of cues (8 UFLS stages = 16 clacks in 1.5 s, a horn, a breaker, ten
ratchets) never exceeds 32 live nodes on the fake context; ratchet ≤ 20/s; pan mapping;
volumes and mute reach the right gains; unknown cue ignored; no WebAudio → silent, no throw.

### 14.2 desk (`desk/`)

* **K-8 view** (B-2): flash classes at 2.5 Hz / 0.8 Hz; `body.rm` and the media query give
  1 Hz / steady; tile glyphs come from `vm.alarms.tiles[].glyph`; an escalated tile (`prio`
  P1 while its base is P2: the view gives `escalated: true`) is visibly different without
  colour (a double border or "‼").
* **K-20**: emit `actions.ui({do:'cue', …})` per the table (detent, ratchet, gate, key, cover,
  button, servo). Emit on real state changes only (a detent crossed, not every pointermove).
  `servo`: when a lever's handle moves because the plan moved it (not during or within 0.5 s
  of a drag). Rough-sync lever shake (K-12) for 0.6 s unless reduced motion.
* **K-22** (§13.4, §13.5) and **K-23** (§13.3): roles, value text, keyboard routes for every
  control, nothing hover-only (TRIP PREVIEW already has T and the latch button; keep) and
  nothing drag-only. `desk.key(ev)` returns true exactly when it acted.
* Keep K-17: 1280×300 floor, every control ≥ 24×24 px, no horizontal scroll (existing tests).
* Tests: each control reachable and operable by keys alone (the desk half of the keyboard
  day); each emits its cues; states distinct without colour; reduced motion honoured; roles
  and value text present.

### 14.3 map (`render/`)

* **G-2**: each technology recognisable with labels off: coal = hyperbolic cooling towers +
  tall stacks + a coal pile; CCGT = two boxy HRSGs with stubby stacks; GTs = small sheds, one
  stack each; hydro = a dam wall with a spillway and penstocks; battery = rows of white
  containers; tie = lattice pylons marching off the west edge; wind, solar as now but cleaner.
  ≤ 3 labels at rest (keep `mapLabels`). Hover a plant lights its lever and the reverse
  (`vm.hover`, both ways already; verify and test). `map.key(ev)`: when the map is focused
  (`tabindex=0` on its `el`), ←→ cycles plants then suburbs and sends the same hover; return
  true when it acted.
* **G-3**: sky and light follow the hour and the sun: night, dawn, day, a **sunset** palette
  around 18:48 (accept: at 18:48 the sky state is `'sunset'`; expose `skyState(h)` pure:
  'night' | 'dawn' | 'day' | 'sunset' | 'dusk'), a sun disc tracking across the sky, long warm
  light at dusk. Solar-farm sheen follows `obs.solar.outMW` (rooftop glint is Phase 2).
* **G-4**: weather readable from one frame, no text, from a pure `weatherOf(obs)` →
  `{heat: bool, storm: 0..1, cloud: 0..1, windy: 0..1}` (heat = `obs.demand.heatActive`; storm
  = a `news` kind `'storm'` with `fromS <= s`, scaled by `sky.windFrac`, fading once the wind
  has fallen back; cloud = 1 − `sky.clearness` in daylight). Heat: haze band on the horizon +
  a bleached, warmer palette. Storm: layered dark cloud, slanted rain sheets, darker ground,
  turbines feathered at cut-out. Cloud front: soft shadows drifting across the suburbs.
  Reduced motion: all three drawn static.
* **G-5 polish + B-5**: tripped plant = smoke + strobe **and a ✕** for the whole lockout; a
  stage-1 shed is identifiable within 1 s (blocks go dark at 90 ms each: keep); dark districts
  get a hatched outline in the overlay; the watch spotlight (B-5); rotors slow in the watch.
* **B-4**: nothing (the CRT overlay is the shell's CSS over `#map`).
* `render/livestack.js`: red/amber gaps distinguishable without colour (§13.4); `stack.key(ev)`
  on the handle only if its keyboard route needs the shell's forwarding (it already listens on
  its own element); a canvas `aria-label` text alternative.
* Keep G-1 (integer scale at 1280×600, 1280×720, 1920×1080; nothing off the terrain; `render/`
  imports only `sim/params.js`). Map draw ≤ 2 ms p95 at 1280×600 in Chromium is the target
  (stage C measures): keep per-frame work flat (cache the static layer per light/weather
  bucket as now; the district loop does a `find` per block today, fix that).
* Tests: `skyState`, `weatherOf`, each weather state changes what is drawn (count/kind of
  draw calls on the stand-in context), silhouette parts exist per plant (data test), the
  bounding-box test still passes, labels ≤ 3 at rest, keyboard cycle sets hover, reduced
  motion statics, the ✕ and hatch present.

### 14.4 shell (`app/`, `next.html`)

* **Alarms** (B-1, B-2, B-3) in `app/alarms.js`: `TILES[].escalates`; effective `prio` and
  `escalated` in `alarmsView`; `a.audible` counts new soundings only; `a.repeats` counts
  re-sounds; the P2 60-s repeat; `alarmInput` gains what escalation needs. Tests: every tile
  has exactly one base priority (K-21 accept); no tile starts a new sounding within 30 s of
  its last (K-8 accept) across a scripted storm; the competent proxy still triggers ≤ 8
  audible alarms a day (the existing test); held-during-watch still sounds once after.
* **Settings** (§13.1, B-7): model in `app/game.js` (`ui` cases `set`, `settings`, `mute`,
  `cue`), popover in `next.html` + `app/shell.js` (`#btn-settings`, `#settings`, four
  `<input type=range>`, three checkboxes: REDUCED MOTION, REDUCED EFFECTS, CRT), body classes,
  the CRT overlay CSS (B-4), `matchMedia` read through an injectable `deps.matchMedia`.
* **Cues**: `ui({do:'cue'})` queues into `vm.cues`; records go through `cuesOfRecord` when the
  audio model has it (§13.2).
* **Keys** (§13.3): the forwarding order, `,` for settings, no double action; `tests/keys.test.js`.
* **Live region** (§13.3) and the header's text alternatives.
* **F-11**: `app/perf.js` gets `BUDGET = {frameP95Ms: 8, simP95Ms: 1 (at ≤150×; 3 at 2,100×)}`
  and the overlay marks each line OK / OVER; `?debug` exposes the boot handle as
  `globalThis.gridwatch` (stage C's shot and perf tools use it; nothing else may).
* `content/text.js`: §8.2 entries where 1b adds an abstraction (the alarm escalation B-1; the
  sonified hum is there already), "?" anchors for new elements.
* Keep K-17 / K-18 (`tests/next.test.js`).

## 16. Stage C record (integration, 2026-10-01)

The four branches merged without conflicts; `node --test` 392 pass. What integration changed:

* **Pan.** §13.2's map-wide formula put every suburb between -0.19 and +0.34. `panOfSuburb` now
  spans the city's own width (west -0.8, east +0.8).
* **spoolUp.** No sim record marks a machine starting, so the game reads it off each unit's mode
  between frames (`cueOfModeChange`), which covers booked starts too.
* **Live Stack redraw.** It drew its whole canvas every frame (p50 2.8 ms, p95 4.6 ms in
  Chromium, over L-1's 4 ms). It now redraws only when the projection, the now line (15 grid-s
  steps), its size or a highlight changes, or while something is live (a drag, a selection, a
  ghost, a message, a hover, the watch).
* **The dial's UFLS label** sat under the red arc; moved inside it.
* **SPEC**: §9.1 Q-11–Q-17 (B-1–B-7), the §8.2 escalation row, K-21, the F-11 measurement, the
  release checklist. New tools are `.mjs` because `tools/package.json` pins CommonJS.
* **The keyboard-only day** (`tests/day.test.js`): key events only, through the real page; its
  log replays to the same hash. Its restore leg runs only if the injected trip sheds load.
* **Agents' deviations kept**: keyboard steps on the battery dial and tie knob are 50 / Shift 10
  / Ctrl 1 MW (§13.3) where 1a had 10 / 1; `HORIZON_Y` 40 → 56 so the floor layout shows sky;
  the breaker clack is a rendered buffer (2 nodes, not 9); an escalation inside a tile's
  hold-off sounds at once; keyup always reaches the key chain; Ctrl/Meta/Alt combos skip it.
* **Not done**: nobody has listened to the sound (fake audio context only); paint time is not
  in the F-11 numbers; no greyscale screenshot; first use of a long voice (growl, spool) renders
  for 20–50 ms once; §7 above still describes the 1a greybox map.

## 15. Done means

`node --test` green and still under 60 s; each agent reports: what it built, every deviation
from this section and why, anything it needed outside its row, and its test count. Commit on
your worktree branch (several commits are fine); do not push, do not merge.
