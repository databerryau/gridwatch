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
  mode,                // director: {mode, rate, watchS, locked, watchVersion: 'full'|'compact'|null, canSkip: Esc would skip this watch (Q-41)}
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
stack map suburb-<ID> suburb-card btn-suburb-close city-<ID>-soak city-<ID>-aircon`.

2b (§31.3.8): `suburb-<ID>` is a suburb on the map and its card (bare id `HAZ` in `vm.suburb`),
`suburb-card` the card itself, `btn-suburb-close` its ✕ (wave 2 keeps it: tests/cardshell.test.js
presses it), `city-<ID>-soak` and `city-<ID>-aircon` the card's presses.

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
  frame (F-11); on demand under `?perf` (Q-49).
* **`content/text.js`**: new §8.2 entries for A-1 (RE-DISPATCH), the synchroscope's speed,
  and the anchors of the new desk elements (H-14).

---

## 9. Tests and the definition of done

* `node --test` stays under 60 s and green (F-10). There is no slow tier (SPEC Q-40,
  2026-10-07): statistics over many seeds are measured on demand with `tools/par.js` and
  `tools/follow.mjs`, and `CLAUDE.md` holds the test loop.
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
| map | Tab from the stack, or focus; ←→ cycles plants and suburbs (sets the hover cross-highlight and shows the label); Enter presses the hovered plant or suburb as a click does (a suburb opens its card; not under RESPOND or in the briefing, 2b); Esc leaves | — |
| settings | `,` | native sliders and checkboxes |
| suburb card (2b, Q-56) | H (opens the line's or the hovered suburb, else the last, else the first; again: closes), or a click on a suburb | ←/→ the previous / next suburb, ↑/↓ its row presses (RESTORE, CANCEL, BOOK), - / = the focused row's time by 15 min, Enter presses (in the briefing it takes the desk); PgUp/PgDn, Home, End, Tab, S, X and P are kept from the desk (the lever behind it never moves); Esc or H closes |

Letters still free for new routes: I, J, Y (G, O, B, K, V, N are the desk's; H is the suburb card's). Document every key in
its §31.8 subsection (Q-49) and in `aria-keyshortcuts`. The shell forwards every key to `desk.key` first,
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

## 17. After the owner's first play (2026-10-01): the commitment is the player's

SPEC §9.1 Q-18. `app/boot.js` boots the game with `scenario: DESK, commit: 'player', startPaused:
true`; `createGame` / `bootGame` default to the Phase 1a behaviour (classic day, the system
commits), which most tests still use. New: `app/objective.js` (pure: `capacityShort(obs)`,
`objective(obs, ctx)`), `vm.objective` (`{level, text, targets, action, startBy, short}`, its
targets added to `vm.glow`), `#objective` in `next.html`, `TILE_HELP` in
`desk/annunciator.js`, a click on the map (focus the plant's control), `content/scenarios.js
DESK`, `createSystem({commit})` and `DISPATCH_S` in `app/system.js`. The sim is unchanged.

## 15. Done means

`node --test` green and still under 60 s; each agent reports: what it built, every deviation
from this section and why, anything it needed outside its row, and its test count. Commit on
your worktree branch (several commits are fine); do not push, do not merge.

---

# Phase 2a: the belly (contract)

SPEC.md Phase 2 (38 items, XL) is built in slices: **2a the belly** (this section), 2b the city
levers (U-1–U-4, U-6, S-14 rules 1 and 5), 2c the day (D-1, D-2, D-4–D-11), 2d grade and debrief
(S-5–S-9, D-20–D-25, L-10), 2e briefing and onboarding (D-3, D-7, O-1–O-6), then playtest gate 1.

**2a ships:** rooftop PV in the sim (P-1, P-2), day types (P-3), MSL notices (P-4), a midday
price that goes negative (P-9), UFLS and restore on net load (P-12), par's belly rules without
city levers (S-14 rules 2–4), S-12 measured on the game's day, and all of it on `next.html`: the
rooftop bite and spill on the Live Stack, glinting suburbs, MSL notices, and an objective line
that gives the player an **afternoon and cost decision** (SPEC §9.1 Q-18's open gap): what to
stop, what it saves, when to bring it back, when to charge and discharge, and what a guarded
press will do before it is made.

Same method as 1a and 1b, with one change: stage B runs in **two waves**, because every seam
that broke before was a module tested against a stand-in. Stage A (this section; the §19.1–19.4
shapes created with neutral values; `SIM_VERSION` `v4-core-2a.0`; golden re-recorded) → **wave 1**
(`world`, `grid`: the sim) → the integrator merges, re-records the golden and lands the §19.5
stubs → **wave 2** (`par`, `app`, `view`: built on the real belly) → stage C (integrate, tune,
measure, SPEC, `v4-core-2a.1`, golden). Everything above this line still holds unless a row here
changes it. This contract was reviewed against the code by four readers before any code was
written; where a line here is oddly specific, a measurement is behind it.

## 18. Decisions taken in stage A (owner-delegated, OD-17; SPEC §9.1 Q-19 onward at stage C)

| # | Question | Decision | Why |
|---|---|---|---|
| C-1 | Which day gets rooftop PV? Nearly every test, the bench and the golden run CLASSIC; the game runs DESK. | **DESK and DESK_WEEKEND** (`rooftop.capacityMW` 5,000, `weather.mildShare` 0.55). **CLASSIC stays PV-free** (capacity 0, mild share 0): with rooftop zero every new term is exactly zero (checked: 2,000,000 random states, 0 mismatches), so CLASSIC is the regression anchor. S-12, S-14 and the P- accepts are measured on `desk` and `desk-weekend`. | The golden becomes a guard, not a casualty; the game's day is the one that is tuned. |
| C-2 | P-3 day types before D-8 exists; the sim may not read a date. | `prerollRegime` keeps `cls` (the `a = 0` draw, unchanged) and adds a hidden `temp`: `'HEATWAVE'` iff `cls === 'heat'`, else `'MILD'` when `uniform(seed, EXT_REGIME, 1) < mildShare / (1 − heatShare)`, else `'HOT'`. `createState` reads it **once** to set the public `state.day = {temp: 'MILD' | 'HOT', weekend}` (a heatwave day reads `'HOT'`; its heat is announced at 10:30 as today). `sampleSecond` and `forecast` take MILD / HOT and the weekend from `state.day`, heat from `ext.heat` and the news as today; nothing else reads `ext.regime.temp`. Weekend is scenario data (`scn.day.weekend`); the app picks `desk-weekend` when the seed reads as a date that is a Saturday or Sunday. No new stream. D-8's other share changes wait for 2c. | Heat seeds, S-10 and the storm tests do not move (2,000 seeds: heat 308 as before, MILD 54%, HOT 31%); MILD and HOT differ by up to 1,400 MW so the forecast must know which; a hidden heatwave must not leak (S-4). |
| C-3 | P-3 MILD: which temperature, and where does the weekend factor go? | Underlying = (DEM(h) − cooling) × weekend × heat uplift + noise, cooling = `COOLING_MAX_MW` × clamp((T − 22) / 14) on MILD days only, T from the scenario's (hot-day) temperature table; weekend = 0.92. A MILD day shows `temperatureC.mildTable` (display only). The +6.5% uplift and the rooftop derate both follow the **heat window**, ramped as `heatMultAt` ramps (truth from `ext.heat`; the forecast from the heat news). | Noise-free minima at clearness 0.92: HOT 3,442, HEATWAVE 3,442, MILD weekday 2,394, MILD weekend 1,938 MW: all inside P-3's bands. A derate from sunrise would leak the hidden regime. |
| C-4 | P-2's "clear-noon output 3,500 ± 50 MW" against its own curve (3,361 MW at 12:00). | The accept samples **13:00 (solar noon) with k = 1**. The shape is a 15-min table of integer per-mille (`rooftop.shapePm`), linear between points: no transcendental function in `sim/`. | The curve, the sun times and every other number stand; only the wording was wrong (fixed at stage C). |
| C-5 | Per-suburb cloud; the 64 KB state limit; fronts; the forecast's rooftop error. | `ext.rooftop = {stepS: 300, clearPm: [6 × 289 integers]}` on `EXT_ROOFTOP`: each suburb's series is **one shared regional sky** (slow; counter b = nSub) **plus a small local term** (b = suburb), stored already combined, about 7 KB. Heat's clear sky applies to them; **the 2a cloud front does not** (it stays over the solar precinct, as its notice says) until D-8 gives fronts a 125–170-minute lead (2c). The forecast's rooftop band is derived from this process, as the demand band is from its noise. | Six independent skies average out to a 1.7% rooftop forecast error (L-2 asks for 5% at 1 h, 15% at 4 h); suburbs of one city share a sky. A front over every suburb adds ~1,570 MW of demand on 20 minutes' notice on 65% of days: unplannable. Labelled in §8.2 until 2c. |
| C-6 | Who curtails in the belly? Nothing does today: with par on a rooftop proxy 16 of 24 mild weekends went **black at 52 Hz**. | **The dispatch does, automatically and feed-forward** (`sim/grid.js`): each grid second, surplus = must-run MW (the stack's floor blocks) + wind and utility solar after the manual LIMIT and OFGS − market demand (lit operational demand + cold load − DR − tie flow − the battery's scheduled output), **with the tie and the battery order as they are**. That much wind and solar is held back pro rata (`ren.windAutoMW`, `ren.solarAutoMW`), moving at the manual LIMIT's ramp, and released as the surplus goes. The sim never moves the tie or the battery to make room: the tie is the plan's and **the battery is the player's**. AGC's unmet lowering request (after the units' and the battery's bands) is added to the cut, so a stale plan cannot push the grid to 52 Hz. Spilled energy is counted (`score.spillMWh`) and shown; it is never charged for (S-2: its cost is the fuel burned later). | NEMDE dispatches semi-scheduled plant down when its offer is marginal (the semi-dispatch cap; "economic offloading", 18% of grid solar, §8.1). An idle battery must **not** fill by itself: charging at a negative price is the player's decision (OD-12). |
| C-7 | H-8 / risk 10: do inverters respond to over-frequency? A 256-MW potline trip at noon reached 51.26 Hz from a SECURE state even with curtailment. | **Yes, lowering only** (labelled: real plant also raises from curtailed headroom). Wind and utility solar: `GOV_DROOP` on rating beyond `GOV_DEADBAND_HZ`, capped by present output (`REN_PFR_ON`). Rooftop inverters (AS/NZS 4777.2:2020, Australia A): output falls linearly from 50.25 Hz to zero at 52.0 Hz, is **held at the lowest value reached** until frequency is back under 50.15 Hz, then returns on the `ROOF_RAMP_S` ramp (`ROOF_FW_ON`). Both are in the engine the previews use; both enter the K-11 identity and `caught` (§19.2). | Mandatory PFR binds semi-scheduled plant whenever its target is above 0 MW; the inverter settings are the standard's. Without them the belly has no downward response. The watch then shows the solar farm and the roofs backing off. |
| C-8 | P-12: what does a block shed, what counts as unserved, do reverse-flowing blocks trip? | Relay MW (`phys.shedMW`, the `ufls` / `shed` records) is the dark districts' **net** load and may be near zero or negative at noon. **Unserved energy is the dark customers' underlying load** (their rooftop is off with the feeder): a new accumulator `acc.unservedMWs`. Blocks are static and trip regardless of flow (labelled: South Australia has disarmed reverse-flowing circuits since 2021). Restored inverters wait `ROOF_RECONNECT_S` (60 s) and then ramp over `ROOF_RAMP_S` (360 s), so a restore picks up the full underlying load first. | The static scheme is the AEMO concern the spec cites (Victoria, 28 Nov 2021: 26%). LIGHTS ON must not fall because the sun is out. |
| C-9 | What do the MSL thresholds test, and where do notices live? The spec lists a 13th tile; the panel is 4 × 3 and twelve is pinned in three places. | `state.msl`: the minimum forecast operational demand (P50) over the 4.5-h window (and now), against MSL1/2/3 = 1,600 / 1,300 / 1,000 MW, each **raised by 300 MW while the tie is out** (no export sink). A `log` record on every change of level; never a news item (news is weather). **Twelve tiles stay**: MIN GEN becomes real (power is being spilled now); MSL levels are MARKET NOTICE tray cards that say the one thing this desk can do, and at MSL2 and MSL3 the objective's STOP is a security call, not a saving. Most MSL1 notices will follow a contingency (tie out, potline off); stage C rewords P-4's lead clause. | AEMO's floors vary with the network; "MSL3 only with a noon contingency" then holds for a tie trip too. A tile for a forecast would chatter (K-8: ≤ 8 alarms a day). |
| C-10 | The player's belly decision (Q-18's gap: "every unit is committed by midday, nothing is ever stopped"; "no warning before a press"). | The objective line gains **STOP** ("RIVERTON CCGT 2 is not needed until 16:10. Stop it: saves about $41,000. Start it again by 15:21."), **BATTERY** (charge while power is being spilled or the price is ≤ $0; charge before the evening when the evening needs it; discharge when gas is setting the price or the plan is short), a reserve-diesel stand-down, and a **commit-later** line for the hours beyond the 4.5-h window. It looks to the end of the day (`dayAhead`). Gas only: never coal, never hydro. **Before any guarded press**, hovering, focusing or lifting a START / STOP guard shows what the press will do (`vm.consider`): "STOP MT HAZEL 3: off the grid in 1 h 10, and not back at minimum load before 21:14. Tonight's peak would be 420 MW short." | A decision with a lead time, told plainly, on every day type: fuel saved now against a restart later; free power stored against power spilled. The coal lever's trap is real and is now said before the press. |
| C-11 | L-5's blue over-reports (it counts price-taking imports: 10 blue columns at $26 with nothing spilled). | Blue = **projected spill**, the same arithmetic as C-6 on the projection: committed minimums + forecast wind and utility solar (after the manual LIMIT) − (P50 + export room + the charge `project()` steps from the present battery order), where > `SURPLUS_MIN_MW` (50). Export room is `fc.exportLimitMW[q]`, 0 while the tie is tripped (2b final review V-1: the export the plan sets on the tie, capped by `fc.exportLimitMW[q]`; a plan that exports under the cap spills the rest). Its own array and run list (`proj.surplusMW`, `blueRuns`), never a kind in `proj.gap`. From P50, not P10, in 2a. | Blue should mean "this will be wasted": the thing the player can act on. It then agrees with what the sim spills. |
| C-12 | S-14 as written; minimum down time. | Rule 2 (charge when the price ≤ $0) joins `rule6` as a union with its window. Rule 3 is reworded: export to the cap, charge, and the dispatch curtails the rest (C-6): nothing for par to send (the neighbour's price is never negative, so the rule as written cannot fire). Rule 4 (coal) joins `rule4`: stop one coal machine only if MSL2 is forecast for ≥ 3 h **and** the evening holds N-1 without it; it is expected never to fire on real days (report the count; do not tune it to fire). Rules 1 and 5 wait for 2b. Origins stay `rule1`–`rule9`. Minimum down time keeps the code's convention: from breaker open to the next START order (54 min longer for coal, 39 min for a CCGT, than breaker to breaker): a coal STOP at 10:00 is back at minimum load at 21:14, one at 05:00 at 17:54. Every text computes it from the unit's own times; stage C rewrites SPEC P-9's sentence and labels it. | Buildable, measurable, and no new rule names for the tests to chase. |
| C-13 | `SIM_VERSION`, the golden. | Stage A: `v4-core-2a.0` (new state shape; CLASSIC numbers unchanged, only hashes) and a golden re-record. The integrator re-records again at the wave-1 merge (C-7 moves CLASSIC), so wave 2 starts green. Stage C: `v4-core-2a.1` after tuning. **No wave agent bumps the version or re-records the golden.** | One generated file, one writer. |
| C-14 | Is a do-nothing weekend allowed to pass? (On a mild weekend the DESK 04:00 fleet nearly covers the evening.) | No. `desk-weekend` has its own, leaner 04:00 commitment: **coal 4 off since Friday night** (three coal at 540 MW, CCGT 1 at 480 MW, hydro balancing). The weekend's lead-time decision: bring the fourth coal machine back by mid-afternoon (cheap all evening, but another 240 MW of minimum in tomorrow's belly), or run gas tonight. The no-input day must fail on both scenarios; stage C tunes the commitment (scenario data only) if it does not. | Q-18: the best move must never be to touch nothing. Coal units are decommitted over low-demand weekends. |

## 19. Shared shapes

Stage A created §19.1–19.4 with neutral values: fill in behaviour, do not rename. The integrator
lands §19.5's stubs at the wave-1 merge. Adding or renaming a shared key means coming back here
first. `observe()` key **order** is tested (`tests/state.test.js` `OBS_SHAPE`).

### 19.1 Scenario (`content/scenarios.js`)

```
scn.rooftop = {capacityMW,              // CLASSIC 0; DESK / DESK_WEEKEND 5000 (P-2)
  clearFactor: 0.70, cloudBite: 0.7, heatFactor: 0.92,
  share: [0.25, 0.09, 0.20, 0.05, 0.23, 0.18],   // of capacityMW, in scn.city.suburbs order (U-1: SOL HAZ RED HAR TAL SAL)
  shapePm: [[h, pm], ...],              // sin^1.5 over 6.2..19.8 h at 15-min points, integer per-mille, 1000 at 13:00
  cloud: {stepS: 300, startFrac, mu, min, max,
          regional: {revertPerStep, sigmaPerStep}, local: {revertPerStep, sigmaPerStep}}}
scn.weather.mildShare                   // CLASSIC 0; DESK 0.55
scn.day = {weekend}                     // false; DESK_WEEKEND (id 'desk-weekend') true
scn.temperatureC.mildTable              // DESK only; display only
DESK_WEEKEND.commitment                 // its own (C-14)
SCENARIOS = {classic, desk, 'desk-weekend'}   // replays resolve scenarios by id
```

CLASSIC's scenario data is **final at stage A**. DESK and DESK_WEEKEND have their own `rooftop`,
`weather`, `temperatureC`, `day` objects; no wave agent changes a value reachable from CLASSIC.

### 19.2 State (`createState`; nobody adds a field in stage B without a row here)

```
ext.regime   = {cls, temp}                       // temp hidden, read once by createState (C-2); code tolerates it missing
ext.rooftop  = {stepS, clearPm: [[int] x nSub]}  // null when capacityMW is 0 (C-5); never read by forecast()
day          = {temp, weekend}                   // public (C-2); capacity-0 scenario: {temp: 'HOT', weekend: false}
env         += rooftopMW,                        // every suburb, as if every inverter were connected; 0 at capacity 0
               roofSubMW: [nSub],                // zeros at capacity 0
               roofClearFrac: [nSub]             // ones at capacity 0
               // identity each grid second (P-1; flex = 0 in 2a, 2b adds env.flexMW: §31.3.4 I1):
               //   demandMW = underlyingMW + flexMW - rooftopMW - (SMELTER_MW - smelter.loadMW)
               // env.demandMW stays THE operational total: what tests poke and every consumer reads
city        += roofDarkMW,                       // rooftop MW off because its district is dark
               roofOffMW                         // off in total: dark, or relit and still waiting / ramping
districts[] += sub,                              // index into scn.city.suburbs            (final at stage A)
               roofFrac,                         // 1 / its suburb's district count          (final at stage A)
               reconnectS                        // -1, or the grid second this district's inverters START ramping back
ren         += windAutoMW, solarAutoMW           // held back by the dispatch (C-6); windCurtMW / solarCurtMW stay the manual LIMIT's
phys        += renPfrMW, roofPfrMW,              // MW backed off by over-frequency response (C-7), >= 0
               roofHoldFrac                      // the rooftop back-off held (0..1) until f < start - hysteresis
msl          = {level 0..3, minMW, atS, sinceS}  // C-9; stays {0, 0, -1, -1} at capacity 0 (mslSecond returns at once)
acc         += unservedMWs, spillMWs             // newAcc, resetAcc and physics copyAcc carry them
score       += spillMWh
conts[].pre, conts[].caught, previewTrip's caught += inverterMW   (last key)
```

`reconnectS`: set by `fleet.setDistrictDark` on a relight to that second + `ROOF_RECONNECT_S`;
-1 when nothing is pending (never dark, dark now, or the ramp finished: the refresh resets it at
`reconnectS + ROOF_RAMP_S`). A district's rooftop off fraction: dark → 1; `reconnectS < 0` → 0;
`s < reconnectS` → 1; else `1 − (s − reconnectS) / ROOF_RAMP_S`. One function,
`fleet.refreshRoof(state)`, recomputes `roofDarkMW` and `roofOffMW` over all districts from
`env.roofSubMW`; `setDistrictDark` calls it and so does `grid.fosSecond` beside `refreshColdLoad`.

Formulas `sim/physics.js` and `sim/market.js` share. With rooftop and flex zero and the C-7 flags
off every one equals today's value exactly; keep the operation order as written:

```
G0       = fleet.baseLoadMW(state) = env.demandMW + env.rooftopMW - env.flexMW   // before rooftop, flex out (2b, §31.3.4 I2)
relay shed (phys.shedMW)  = G0 * shedFrac + city.flexDarkMW - city.roofDarkMW
served   (phys.servedMW)  = G0 * (1 - shedFrac) + (env.flexMW - city.flexDarkMW) - (env.rooftopMW - city.roofOffMW) + coldLoadMW - dr.mw
unserved rate             = G0 * shedFrac                       // into acc.unservedMWs -> score.unservedMWh
fleet.litDemandMW(state)  = G0 * (1 - shedFrac) + (env.flexMW - city.flexDarkMW) - (env.rooftopMW - city.roofOffMW)   // market demand's first term; obs.demand.litMW

C-7 readouts (pure functions of state and the tick's start frequency f, except the hold):
renPfrMW  = min(out, max(0, f - F0 - GOV_DEADBAND_HZ) / (GOV_DROOP * F0) * (WIND_MW * (1 - ofgs.trippedFrac) + SOLAR_MW))
            // out = wind after OFGS + utility solar, as scheduled this second; droop on rating, no lag
roofPfrMW = (env.rooftopMW - city.roofOffMW) * roofHoldFrac
            // roofHoldFrac = max(held, clamp((f - ROOF_FW_START_HZ) / (ROOF_FW_ZERO_HZ - ROOF_FW_START_HZ), 0, 1));
            // released (ramping to 0 over ROOF_RAMP_S) once f < ROOF_FW_START_HZ - ROOF_FW_HYST_HZ
supplyMW  = scheduled supply + governors + battery PFR + guard - renPfrMW        (schedSupplyMW unchanged)
loadMW    = servedMW - loadReliefMW + roofPfrMW                                  (servedMW stays the load-relief base)
identity  : (schedSupplyMW - servedMW) + inertiaMW + govTotalMW + battery.pfrMW + battery.ffrMW + loadReliefMW
            - renPfrMW - roofPfrMW = 0
caught.inverterMW = -(renPfrMW + roofPfrMW) at the extreme minus its pre-trip value   // so caught still sums to lostMW
```

Energy: physics adds `renPfrMW × DT` to `acc.spillMWs`; `settleSecond` takes that off `genMWh`
and adds the second's curtailment, `(windCurtMW + windAutoMW) × (1 − trippedFrac) + solarCurtMW +
solarAutoMW`, to `score.spillMWh`. `obs.wind.outMW` / `solar.outMW` are after the manual LIMIT
and the automatic cut, before the frequency response.

`fleet.districtColdLoadMW(state, d)` keeps its signature: for a dark district, the **undelayed
underlying pickup** (G0 × share × the cold factor, no rooftop netted off); for a lit one, its net
load now; both add the district's `flexShare = env.flexSubMW[sub] × roofFrac` (2b, §31.3.4 I3), and
the restore surge is `max(0, coldMW − G0 × share − flexShare)`. The previewTrip backup, save and restore gain every field above that the engine or
`setDistrictDark` writes, in the change that makes them written.

### 19.3 `observe()` additions, in this order (exact expressions)

```
balance   += renPfrMW, roofPfrMW                              (after shedMW)
demand    += underlyingMW, rooftopMW, litMW, unservedMW       (after tempC)
             // nowMW = env.demandMW; underlyingMW = env.underlyingMW; rooftopMW = env.rooftopMW (as if connected,
             // so nowMW = underlyingMW + flexMW - rooftopMW - (SMELTER_MW - smelter.loadMW) holds in obs, flexMW from 2b);
             // litMW = fleet.litDemandMW(state); unservedMW = G0 * shedFrac
wind      += autoMW        solar += autoMW                    (last)
score     += spillMWh                                         (after starts; §30.7 adds saidiMin, saifi, maifi after it)
districts[] += reconnectS                                     (last; the number, passed through)
contingency.pre, contingency.caught += inverterMW             (last)
forecast, dayAhead += underlyingP50, rooftopMW                (after exportLimitMW; arrays of length n)
             // demandP50 / P10 / P90 stay OPERATIONAL; rooftopMW as if connected, after the heat derate;
             // underlyingP50 = demandP50 - flexMW (2b, §31.3.7) + rooftopMW + the smelter's expected missing load; solarMW stays utility-only
top level, after scope:
rooftop    = {mw, availMW, capMW, offMW, suburbs}
             // availMW = env.rooftopMW; offMW = city.roofOffMW; mw = availMW - offMW - phys.roofPfrMW (generating now);
             // capMW = scn.rooftop.capacityMW (nameplate); suburbs: one per scn.city.suburbs, in order, ALSO at capacity 0:
             //   {id, mw: env.roofSubMW[j] (as if connected), capMW: capacityMW * share[j], clearness: env.roofClearFrac[j]}
msl        = {level, minMW, atS, sinceS}
day        = {temp, weekend}
```

Records: `{tick, kind: 'log', sev, code, msg, level, minMW, atS}` on **every** change of
`msl.level`: code `'MSL' + level`, or `'MSL_CLEAR'` at 0; sev `info` / `warn` / `crit` for levels
1 / 2 / 3 and `good` for the clear; `msg` ≤ 25 words and complete on its own; `minMW` rounded to
1 MW. The `ufls` and `shed` records keep `mw`; it is now net load.

### 19.4 Params (`sim/params.js`)

`// ---- phase 2a "shared" block: begin` / `end` (stage A's; frozen in stage B) holds what more
than one job reads: `MSL1_MW` 1600, `MSL2_MW` 1300, `MSL3_MW` 1000, `MSL_TIE_OUT_MW` 300,
`MSL_CHECK_S` 300, `MSL_CLEAR_MW` 100, `ROOF_RECONNECT_S` 60, `ROOF_RAMP_S` 360,
`ROOF_FW_START_HZ` 50.25, `ROOF_FW_ZERO_HZ` 52, `ROOF_FW_HYST_HZ` 0.1, `REN_PFR_ON`, `ROOF_FW_ON`
(both `false` at stage A; `grid` turns them on in its second commit), `SURPLUS_MIN_MW` 50. Each
sim job adds its own records inside its own empty block, `// ---- phase 2a "world" block`,
`"grid"`, `"par"` (not the stage B blocks of the same names). Values shown to the player go
through `content/text.js` entries with `params` paths.

### 19.5 The app's side (wave 2; the integrator lands the stubs marked * at the wave-1 merge)

```
* capacityShort(obs, fc = obs.forecast)         // any forecast-shaped object
* objective(obs, ctx): ctx += dayAhead          // observe(state, {dayAhead: true}).dayAhead, on the objective's 30-s cadence
* vm.objective += kind, long                    // kind: 'watch' | 'held' | 'short' | 'commit' | 'restore' | 'spare' | 'stop' | 'battery' | 'quiet'
                                                //   | 'city' (2b, Q-59: the city levers; KIND_WORD '◇ SUBURB (H)')
                                                // long: {atS, endS, mw} | null, the spill ahead (PV.blueRuns(proj)[0])
  vm.objective.action += {type: 'stop', unit} | {type: 'battery', mode, mw} | {type: 'standDownRERT'}   (sim inputs; the game never sends them)
* vm.consider = {target, text, level} | null    // C-10; level 'plan' | 'crit'; shown in #objective in place of the objective, word '? IF PRESSED'
* actions.ui({do: 'consider', target: 'guard-start-<unit>' | 'guard-stop-<unit>' | null})   -> game.ui.consider
* vm.hist.rooftop                               // beside vm.hist.demand, the same column form (column mean of env.rooftopMW)
* proj (app/planview.js project) += rooftop (Float64Array n), surplusMW (n); proj.blue[q] = surplusMW[q] > SURPLUS_MIN_MW ? 1 : 0
* proj.past += rooftop                          // the silhouette is operational + rooftop, so the hatch is exactly the rooftop bite
* blueRuns(proj) -> [{atS, endS, k0, k1, mw}]   // the shape of redRuns
* format.priceText(mwh) -> '$74' | '−$20' | '−$1,000'   (U+2212; final at the merge)
* scenarioForSeed(seed) in app/game.js          // 'desk-weekend' when the seed's date, ymdOf(seed) (attempt k = YYYYMMDD + k·10⁸, Q-75), is a Saturday or Sunday, else 'desk';
                                                // bootGame accepts `scenario` as an object or a function of the seed
* tests/lib/follow.js  followDay(seed, scenario, {follow, untilH, objective})   // the hint-following player (frozen; tests and tools/follow.mjs import it)
* tests/lib/desk-vm.js                          // a DESK-day vm fixture for UI tests (frozen)
```

**`consider` (C-10).** The desk keeps hover, focus and lift per guard and sends `consider` only
when the resolved target changes: a lifted guard wins, then the focused, then the hovered; null
when none. A commit counts as a drop. After a lift made by key the target is held 6,000 ms after
the cover drops (the cover itself still drops after 2 s). `vm.consider = consequence(obs, target,
{dayAhead, planview})`, recomputed when the target changes, on the objective's cadence and after
any accepted input; null when the phase is not `play`, the commitment is not the player's, the
desk is locked, or there is no target. `consequence` covers start, stop, cancel-start and a
blocked press (its reason); `scope` and `abort` return null. `level` is `crit` when the press
opens a day-ahead shortfall or the unit cannot return before it is next needed. Every time is
computed from `V.MACHINES` (C-12); no per-class constant; "tomorrow" only when past 04:00.

Targets the objective may light: `guard-stop-<unit>`, `guard-start-<unit>`, `dial-battery`,
`key-rert`, `stack`, and those it uses today. The desk lights a guard, and the map a plant, whose
`guard-start-` or `guard-stop-` id is in `vm.glow`. MIN GEN's input is `spillMW`
(`obs.wind.autoMW + obs.solar.autoMW`), fed identically by `alarmInput` and
`alarmInputFromState`. Every renderer tolerates the new keys being absent or zero (CLASSIC
fixtures, the bench).

**H-14 rows.** `app` writes the `content/text.js` entry (`specPending` where the row is new);
stage C adds or renames the SPEC §8.2 row with this **exact** title:

| id | §8.2 title | Says | Anchor |
|---|---|---|---|
| `wind-solar-pfr` (renamed row) | Wind, utility solar and rooftop solar respond to over-frequency only. | Real plant also raises from curtailed headroom; AS/NZS 4777.2 50.25–52 Hz, held | `dial-freq` |
| `rooftop-model` (new) | Rooftop solar: one curve, six skies. | 0.70 clear-sky factor; the heat derate only inside the heat window; no cloud front over the suburbs until the director (2c) | `map` |
| `mild-days` (new) | A mild day is the hot day with its cooling load removed. | Weekend ×0.92; the shares; a heatwave is announced at 10:30 until D-8 | `stack` |
| `auto-curtailment` (new) | The dispatch spills wind and solar automatically, pro rata. | Real: NEMDE by offer price through the semi-dispatch cap; rooftop is curtailed last, by the backstop, not on this desk yet | `stack` |
| `min-down-time` (new) | Minimum down time runs from breaker open to the next START. | 54 / 39 min longer than breaker to breaker | `lever-coal` |
| `ufls-blocks` (gains) | (title unchanged) | Static blocks trip even when feeding back; unserved energy counts the dark customers' own load | (unchanged) |
| `cold-load`, `restore-permissive` (gain) | (unchanged) | Restored rooftop waits 60 s and ramps over 6 min | (unchanged) |
| `msl-tiers` (rebuilt) | (unchanged) | From the MSL params; +300 MW with the tie out; from our own forecast; the backstop is not on this desk yet | `tray` |
| `lor-states` (gains) | (unchanged) | SECURE previews the loss of supply, not of load | (unchanged) |

## 20. Ownership

Each agent edits only its row, in its own worktree, **fast-forwarded to `phase-2a-belly` first**
(`git merge --ff-only phase-2a-belly`; agent worktrees start from `main`).

**Wave 1 (the sim).**

| Owner | Files | Tests | Items |
|---|---|---|---|
| **world** | `sim/weather.js`, `sim/events.js`, `sim/step.js`, `content/scenarios.js` (DESK's and DESK_WEEKEND's `rooftop`, `day`, `weather`, `temperatureC.mildTable`; notice texts), `sim/params.js` `phase 2a "world"` block | `tests/events.test.js`, `tests/state.test.js`, `tests/rng.test.js`, `tests/integration.test.js` (the F-3 row), new `tests/rooftop.test.js` | P-1, P-2, P-3, P-4, the forecast (L-2 band), the S-4 barrier for the new hidden state |
| **grid** | `sim/fleet.js`, `sim/physics.js`, `sim/grid.js`, `sim/market.js`, `sim/params.js` `phase 2a "grid"` block | `tests/fleet.test.js`, `tests/physics.test.js`, `tests/grid.test.js`, `tests/market.test.js`, new `tests/belly.test.js` | P-12, P-9, C-6 curtailment, C-7 over-frequency response, C-8 unserved and reconnect, `score.spillMWh` |

`sim/README.md`: `world` owns §3, §4, §5 (ext, env and new `day` / `msl` subsections placed
directly after env), §7's MSL codes, §8 and the §11 weather.js / events.js / step.js contracts.
`grid` owns §5 (tie–ren, city, phys, acc, score), §7's `ufls` / `shed` / `restore` wording and
the §11 fleet / physics / grid / market contracts. **Neither edits the §11 Reads / Writes
table**: each puts its rows in its report and the integrator applies them.

`grid` does not wait for `world`. Its multi-second tests drive the grid second by hand in
`step.js`'s order (`settleSecond`, `unitsSecond`, `agcSecond`, `dispatchSecond`, `fosSecond`,
`securitySecond`, `priceSecond`, then 50 `physics.tick`) **without `weather.sampleSecond` and
never through `step()`**, so the poked `env.demandMW`, `rooftopMW`, `roofSubMW`, `windAvailMW`,
`solarAvailMW` and `exportLimitMW` hold. A poke of `roofSubMW` keeps `rooftopMW` equal to its sum
and is followed by `fleet.refreshRoof`. Stage A's `sampleSecond` already writes `rooftopMW = 0`,
zeroed `roofSubMW` and `roofClearFrac` of ones at capacity 0, so a test that forgets this fails
in the worktree, not at the merge.

**Wave 2 (on the merged wave 1).**

| Owner | Files | Tests | Items |
|---|---|---|---|
| **par** | `sim/autopilot.js`, `app/system.js`, `app/assist.js`, `tools/par.js`, `tools/follow.mjs` (a command-line wrapper of `tests/lib/follow.js`), `sim/params.js` `phase 2a "par"` block, `sim/README.md` (the autopilot.js contract) | `tests/autopilot.test.js`, `tests/system.test.js` | S-14 rules 2–4 (C-12), par and the dispatch on lit operational demand, the battery in the plan, tools |
| **app** | `app/objective.js`, `app/game.js`, `app/alarms.js`, `app/tray.js`, `app/shell.js`, `app/watch.js`, `app/record.js`, `app/boot.js`, `next.html`, `content/text.js` | `tests/objective.test.js`, `tests/alarms.test.js`, `tests/next.test.js`, `tests/text.test.js`, `tests/day.test.js` (the Q-18 page test only) | C-10 (objective, `vm.consider`), C-9 surfacing (MIN GEN, MSL cards), the respond card's `inverterMW`, `vm.hist.rooftop`, the weekend variant, the minute record, H-14 entries |
| **view** | `app/planview.js`, `render/livestack.js`, `render/map.js`, `render/mapdata.js`, `render/format.js`, `desk/*.js`, `desk/desk.css` | `tests/planview.test.js`, `tests/livestack.test.js`, `tests/map.test.js`, `tests/desk.test.js` | L-2 silhouette and rooftop hatch, C-11 blue, the signed price, G-3 glint, guards that light and send `consider`, the K-11 bar's inverter segment, the desk reading `obs.districts[]` |
| stage C | `SPEC.md`, `tools/baseline-v4.js`, `tools/baseline-v4.golden.md`, `sim/params.js` (`SIM_VERSION`, tuning, the notes at lines 103 and 109), `content/scenarios.js` (tuning: `desk-weekend`'s commitment, DESK's 04:00 battery charge), `tests/budget.test.js`, `tests/day.test.js`, `tests/integration.test.js` (whole-day cases), `tests/lib/*` (new files), the §11 table, seams | | see §23 |

Frozen for everyone: `index.html`, `bench.html`, `tools/harness.js`, `tools/policies.js`,
`tools/baseline.js`, `tools/baseline.golden.md`, `tools/baseline-v4.js` and its golden,
`SIM_VERSION`, `SPEC.md`, `tests/lib/*` (add new files only), the `"shared"` params block, every
file and test not in your row. A change needed outside your row goes in your report, not in code.
The §1 cross-module rules and `sim/README.md` §2 still apply (no transcendental functions, no
literals outside `params.js`, plain-JSON state, no allocation in `physics.tick`).

## 21. The jobs

### 21.1 world (`sim/weather.js`, `sim/events.js`, `sim/step.js`)

* **P-1 / P-3.** `sampleSecond`: underlying per C-3 (MILD and the weekend from `state.day`);
  `env.rooftopMW`, `roofSubMW`, `roofClearFrac` per §19.2; the identity each grid second, tested
  on every second of a DESK day including a smelter trip. At capacity 0 `env` is bit-identical to
  today's (keep the association order of the noise terms).
* **P-2.** Suburb j: `capacityMW × share[j] × clearFactor × shape(h) × (1 − cloudBite × (1 − k_j))
  × (1 − (1 − heatFactor) × r(s))`, r(s) = the 0..1 ramp of `heatMultAt` (truth: `ext.heat`;
  forecast: the heat news; `heatMultAt` itself keeps its expression). Accept: 3,500 ± 50 MW at
  13:00 with k = 1; ≤ 500 MW at 18:48; k = 0.32 everywhere leaves 52% of clear-sky output.
* **Pre-roll.** The rooftop pre-roll fills `ext.rooftop` (C-5): a step-and-length-generic copy
  of the mean-reverting series, quantised integers, play-independent. Starting values in the
  scenario (yours to tune): `startFrac` and `mu` 0.95; `regional` slow, `local` small. New DESK
  tests: state under 64 KB; `clearPm` is six arrays of 289 integers inside min..max × 1000;
  `observe()` never contains the key `clearPm`; on heat seeds the string `HEATWAVE` appears
  nowhere in `observe()` at any time and `day.temp` is `'HOT'`.
* **Forecast.** `demandP50/P10/P90` operational; `underlyingP50` and `rooftopMW` columns; rooftop
  clearness drifts from the present capacity-weighted value toward the mean (the factor is affine
  in k, so one weighted value is exact); the band widens with the rooftop variance of the C-5
  process. Public information only: `state.day`, `env`, `news`, never `ext`. Add DESK cases to
  the scramble test in `tests/events.test.js` (seeds 1 MILD, 2 HOT, 4 heat unannounced at 10:00):
  scramble `ext.rooftop.clearPm[j][i]` for `i × stepS > env.s + stepS` and set `ext.regime.temp`
  to each of its three values; `forecast()` must be deep-equal. Report to `par` the DESK case
  `tests/autopilot.test.js` needs. Measure and report L-2 coverage on `desk` at 1 h and 4 h and
  the aggregate rooftop forecast-error sigma at 1 h and 4 h against L-2's 5% / 15%.
* **P-4.** `events.mslSecond(state, fc, out)`; `step.gridSecond` calls it immediately after
  `weather.sampleSecond` when `s % MSL_CHECK_S === 0`, passing `weather.forecast(state,
  FC_HORIZON_S, FC_STEP_S)` (one forecast per check; `events.js` imports nothing new). It returns
  at once at capacity 0. Level per C-9 with `MSL_CLEAR_MW` of hysteresis; the §19.3 record on
  every change. Where MSL1 is reached without a contingency its record is ≥ 2 h before `msl.atS`.
  Fix the DUCK notice's wording for rooftop.
* `observe()`: the §19.3 values (stage A wired the keys). The 04:00 opening balances within 1 MW
  on `desk` and `desk-weekend` for MILD and HOT (new test); `balanceOpening` itself is unchanged.
* **Measure and report** (seeds 1–200 on `desk` and `desk-weekend`, no par needed): the share of
  each day type; minimum operational demand by day type (P-3: HOT 3,400, HEATWAVE 3,450, MILD
  weekday 2,350, MILD weekend 1,800, each ± 10%); MSL1/2/3 frequency on mild weekends (P-4: MSL1
  10–30%, MSL2 ≤ 10%), the cause of each MSL1 (tie out, potline, neither) and its lead. P-4's
  lever in 2a is the rooftop cloud process only; the thresholds are frozen. (Proxy: independent
  skies at mu 0.92 gave MSL1 on 8% of mild weekends, 0.95 gave 19%, 1.0 gave 25%, P-3 in band
  for all three.)
* `tests/baseline-v4.test.js` must stay green for you, hashes included: nothing you do may change
  a CLASSIC value. DESK tests in `tests/objective.test.js` will go red ("the DESK scenario is the
  classic day…", "a day with no input runs short by mid-morning…", the slow whole-day case):
  they are `app`'s to rewrite in wave 2. List every red test outside your row; do not edit them,
  and do not weaken DESK to avoid them.

### 21.2 grid (`sim/fleet.js`, `sim/physics.js`, `sim/grid.js`, `sim/market.js`)

Build in **two commits**. Commit 1: P-12, C-8, C-6 and the C-7 code with `REN_PFR_ON` and
`ROOF_FW_ON` false. At this commit `node tools/baseline-v4.js --quick`, with every
`0x[0-9a-f]{8}` masked, must equal the golden line for line: that is the C-1 proof; report the
masked diff. Commit 2: both flags true (edit the two shared params; nothing else in that block).
Report every section-1 and section-2 row that moves (expect many: the droop acts on about 15% of
CLASSIC ticks).

* **P-12 / C-8.** `setDistrictDark` and `fleet.refreshRoof` keep `roofDarkMW`, `roofOffMW` and
  `reconnectS` per §19.2 (also when physics calls mid-second). Physics and the market use the
  §19.2 formulas; no district loop and no allocation in the tick. `acc.unservedMWs` feeds
  `score.unservedMWh`; `splitShed` keeps its weights. With rooftop zero the four existing test
  files pass with **no assert edited**, except that the three pokes of `acc.shedMWs` in
  `tests/market.test.js` (the S-1 cases) become pokes of `acc.unservedMWs`. New cases go in
  `tests/belly.test.js`. Accept (poked `env`: a clear mild 12:30, `roofSubMW[j]` = 5000 × share[j]
  × 0.70 × shape): stage-1 MW = Σ net load of its two districts ± 1 MW; stage-1 net MW at that
  noon < at a poked 19:00; the restore preview includes the undelayed load; `hashState` equal
  before and after every preview kind with a Solstice Rise district dark. Rebuild the H-7 midday
  case on that noon (Solstice Rise net negative): record stages shed, MW and peak; a result, not
  a target.
* **C-6.** Per §18 C-6, in `dispatchSecond`: the feed-forward surplus, plus AGC's unmet lowering
  request; pro rata by present output; clamped to what is available after the manual LIMIT;
  moving at `CURTAIL_RAMP_FRAC_MIN`; released as the surplus goes. It works in HAND mode too (the
  feed-forward term needs no AGC). The stack still offers **available** wind and solar at −$20,
  so curtailing never raises the price (P-5) and the belly's price is their offer (P-9).
  Accept (hand-driven seconds): start balanced at a 2,110-MW operational noon (four coal and two
  CCGT at MIN = 1,310 MW, 400 MW wind, 700 MW solar, tie −300 at the cap), battery FULL; let
  demand fall 0.25 MW/s to 1,600: frequency stays in the normal band, no OFGS,
  `windAutoMW + solarAutoMW` ends within 10 MW of 510, the price is the renewable offer,
  `acc.spillMWs` grows (on the stage-A sim this run goes black: the test must fail there). Let
  demand return to 2,110: both auto MW return to 0 before any unit leaves MIN. Battery idle at
  50% with a 500-MW surplus for 30 grid-min: SoC rises < 20 MWh, `|agc.requestMW|` <
  `PAR_REBASE_MW`, the cut is within 50 MW of the surplus; with a CHARGE 300 order the cut is 300
  MW less. The same noon with the tie at 0 MW never reaches 51 Hz (curtailment simply does more).
  A stale plan (base points 300 MW above MIN at that noon, AGC on) stays under 50.5 Hz.
* **C-7.** Per §19.2. Accept, from the curtailing state, flags on: a 256-MW load loss, and a trip
  of the tie at 300 MW export, each peak ≤ 50.5 Hz with no OFGS stage (run with `env.rooftopMW`
  0, the droop alone, and again with rooftop poked). If either passes 50.5 Hz, report the peak
  and do not tune: stage C then adds the load loss to the SECURE preview or labels it.

### 21.3 par (`sim/autopilot.js`, `app/system.js`, tools)

* C-12's rules; unit tests on poked observations in the style of the rule 6 / rule 2 test. Rule 2
  fires on the price or on spill (`obs.wind.autoMW + obs.solar.autoMW > SURPLUS_MIN_MW`).
* `context()`, `reflowLit`, the adequacy walk: lit operational demand from `obs.demand.litMW`
  and the forecast, not share arithmetic. Rule 7 must not fire for hours because the dispatch is
  curtailing. The player-mode dispatch (`app/system.js`) plans the belly sensibly: units to their
  floor, export to the cap, no false shortfall from curtailed renewables. `commitSig` gains the
  battery's mode, order and guard; `context()` counts a battery order only for the energy behind
  it (discharge until the reserve, charge until full).
* `tools/par.js`: group by `day.temp` and weekend; columns for minimum operational demand,
  negative-price hours, spilled MWh, peak Hz, highest MSL level. `tools/follow.mjs`: the
  hint-following player over a seed range and scenario: unserved, `score.cost` by key, par's
  beside it, and each STOP's quoted saving against the realised difference (the same day with
  that STOP skipped).
* **Measure and report** on `desk` and `desk-weekend`, seeds 1–200: S-12 (clean ≥ 85%, forced
  heat ≥ 75%, RERT ≤ 25%), commit-all dearer than par (≥ 70%), black days (target 0),
  negative-price hours by day type (P-9: mild 2–6 h, hot ≤ 1 h), SECURE-state containment for
  both trip kinds as baseline-v4 section 1 measures it (target every state ≥ 49.5 Hz), rule 4's
  count, a par day's runtime. Do not tune the fleet; propose.
* `tests/baseline-v4.test.js` stays green except for rows your rule changes move: say which.

### 21.4 app (`app/`, `next.html`, `content/text.js`)

* **The objective (C-10).** Branch order: **watch, held, short-now, commit-now, restore, spare,
  stop, battery, commit-later, quiet.**
  * short-now reads the largest deficit in the columns within `NOW_S` only (fixes "Short 1,510 MW
    now" at 03:56); battery DISCHARGE (sized to the deficit) joins DR and the quickest start, and
    the line returns `{type: 'battery', mode: 'idle'}` once nothing within `NOW_S` is short.
  * commit-now: the first day-ahead shortfall starts within `FC_HORIZON_S` of now (today's
    behaviour, text and regexes), or every unit is committed. commit-later: any later day-ahead
    shortfall: kind `commit`, level `plan`, action null ("Next: start GT·A by 16:58 for the
    evening.").
  * spare gains: RERT armed and the day-ahead check clean without it for `PAR_RERT_STANDDOWN_MIN`
    → action `{type: 'standDownRERT'}`, target `key-rert`.
  * **stop.** Candidate: among committed units (on, loading, starting, ready or booked) that are
    CCGT or GT (never coal; never hydro: it spins free and carries reserve), the dearest by
    offer (ties: the highest index). If it is not `on` with `stopBlock === ''`, there is no STOP
    line. Proposed only when all hold: (1) `capacityShort(obs without it, dayAhead)` with
    `MARGIN_MW` + the largest remaining single loss has no short column before `s + W`, W =
    unload to MIN at its ramp + T4 + minimum down + `startToMinS` + 3,600 s; while `day.temp` is
    `'HOT'` and no heat is announced this must also hold with the heat uplift and thermal derate
    applied to the afternoon (params, never `ext`); (2) `sec.level` is SECURE and `sec.r5MW` less
    the unit's own 5-minute headroom ≥ `SECURE_RATIO × sec.lMW`; (3) the unit is at its floor
    (`outMW ≤ minMW + 20`); (4) the saving ≥ `STOP_MIN_SAVING` ($10,000): for each idle hour, its
    minimum MW × (its offer − the cost of the energy that replaces it) + its no-load, less one
    start; the replacement costs $0 in columns where `proj.surplusMW > 0`, otherwise the offer of
    the cheapest committed unit with room. At MSL2 and MSL3, (4) is dropped and the level is
    `act`. At most one STOP action per 1,800 grid-s. The text names when the unit is next needed,
    the saving and the restart time.
  * **battery.** CHARGE when a column within `NOW_S` has `proj.surplusMW > SURPLUS_MIN_MW` or
    the price ≤ $0, and the battery is not full and not already charging; or inside
    `PAR_BATT_CHARGE_H` when it is below `PAR_BATT_CHARGE_TO` and the evening is short without
    it ("The battery is at 41%. Charge it before 15:30: tonight's peak will want it."). DISCHARGE
    in the evening window when a gas turbine is setting the price and the battery is above its
    reserve; IDLE again at the reserve. Never thrash: one battery action per 900 grid-s.
  * After an accepted start, stop, abortStop, battery or guard input in player mode with the
    levers not held by hand, `sendInput` applies `sysMod.redispatch` in the same call (a logged
    `planLoad`), so the line never reads "Short … call DR" off a stale plan. ≤ 170 characters.
  * Unit tests on poked observations for each STOP condition, "a hydro machine is never named",
    branch order (a day-ahead shortfall > 4.5 h away with a dark district → `restore`; with none
    dark and a stoppable unit → `stop`), and: for 5 grid-min after following a STOP, CHARGE or
    DISCHARGE hint the kind is never `short` and the action is never `callDR` or `armRERT`.
* **`vm.consider`** per §19.5; `consequence(obs, target, ctx)` is pure, in `app/objective.js`.
* **Surfacing.** MIN GEN sets when `spillMW` > 50 MW for 60 grid-s and clears when < 10 MW for
  1,800 grid-s. MSL cards from the `log` records (MARKET NOTICE, ≤ 25 words, a focus-only
  button), each saying the forecast minimum, its time and the one thing this desk can do: MSL1
  "Lowest demand 1,540 MW at 12:40. Keep battery room for noon."; MSL2 "… A gas unit at minimum
  is in the way: see the objective."; MSL3 "… Units at minimum exceed demand: stop one, or
  frequency rises until the roofs back off." No card names the soak or the backstop. The
  respond card and watch beats name `inverterMW` ("solar backed off N MW"). The day's type on
  the briefing (HOT: "A heatwave warning, if one comes, comes mid-morning."). `vm.hist.rooftop`;
  `app/record.js` minutes carry underlying and rooftop; `LEVEL_WORD` by kind so a STOP or BATTERY
  hint never reads SHORT; the §19.5 H-14 entries.
* **Accept** (real days, slow; the 11 seeds of `tests/objective.test.js`: MILD 1, 5, 8, 13,
  20261001; HOT 2, 3, 7, 11, 20260930; HEATWAVE 4; on `desk` and on `desk-weekend`): the
  hint-following player is never black and ends with nothing unserved on ≥ 9 of 11 on each; on
  mild **and** hot days it stops at least one gas unit before 12:00 and restarts it; fuel +
  no-load + starts + tie + battery wear (RERT and DR excluded) is lower with the stop and battery
  branches on than off on ≥ 8 of 11, with unserved energy higher on none; each quoted saving is
  within ±30% or $10,000 of the realised difference; on hot days its battery is at or above par's
  level at 16:30 on ≥ 9 of 11. **The no-input day fails (unserved > 5,000 MWh) on every seed of
  both scenarios**: report each that does not (C-14). One default-suite case: a mild seed to
  13:00 (about 1.5 s); the rest is slow-only.

### 21.5 view (`app/planview.js`, `render/`, `desk/`)

* **Live Stack.** The silhouette (operational + rooftop, a faint line) above the operational
  skyline with the gap hatched sun-yellow and the word ROOFTOP in the big layout, past columns
  included; blue SURPLUS columns per C-11 with `GAP_MARK.blue` (pattern, glyph and word, never
  colour alone), a minimum drawn height, a hover line ("N MW will be spilled: stop a unit, or
  charge"); the price through `priceText`, negative in its own colour, with the word SPILL
  while the dispatch is cutting more than `SURPLUS_MIN_MW` (MIN GEN's input; final review);
  `stackSummary` gains the surplus runs and a rooftop clause after its present sentences; the
  redraw key covers what is new; L-1's 4 ms holds. Shown always in 2a (the first-shift face of
  L-2 arrives with onboarding, 2e).
* **Map (G-3).** Panels on every suburb's roofs in proportion to its rooftop MW (cached layer);
  a per-frame glint per suburb scaled by `obs.rooftop.suburbs[]` (`mw / capMW`, so cloud dims
  it), graded by the light, off for dark districts and for relit ones until their ramp starts
  (`reconnectS`), static under reduced motion; one path and one fill per suburb, no cached-layer
  rebuild at mid-day (the existing test); `mapSummary` says the rooftop MW; a plant lights for
  `guard-stop-<unit>` as for `guard-start-<unit>`. Window lighting at night follows underlying
  demand. Reconcile the map's sunset with the scenario's (19:48) or say why not.
* **Desk.** A START / STOP guard lights when its id is in `vm.glow` and sends `consider` per
  §19.5; the K-11 bar gains an inverter segment (`renPfrMW + roofPfrMW`) and `CAUGHT_WORD` a word
  for `inverterMW`; `desk/calc.js coldLoad` reads `obs.districts[].coldLoadMW` (no second copy
  of the sim's rule); DIRECT SHED shows the `coldLoadMW` of the lit rotation district with the
  lowest (`restoredAtS`, `rot`), the one the sim will shed ("about 0 MW" when zero or negative).
  Nothing else on the desk moves.

## 22. Done means (each agent)

Run **your own test files** while you work. Before reporting, run `node --test` once; under load
the two baseline tests can hit their 55-s child timeout (re-run those two alone before calling it
a failure). The golden: compare `node tools/baseline-v4.js --quick` with
`tools/baseline-v4.golden.md` after masking `0x[0-9a-f]{8}`. Wave 1: masked, it must be identical
for `world` (hashes too) and for `grid` at its flags-off commit (hash-only differences are
expected there and are not a failure). Wave 2: green except for rows `par`'s rules move. Report:
what you built, every deviation from this section and why, what you needed outside your row
(including rows for the §11 table), your measurements, every red test outside your row, your
test count. Commit on your worktree branch; do not push, merge, bump `SIM_VERSION` or re-record
the golden.

## 23. Stage C (the integrator's list)

Merge; seams; `node --test` and the slow suite; S-12 / S-14 / P-3 / P-4 / P-9 measured on `desk`
and `desk-weekend` by day type; the no-input and hint-following days (C-14: tune `desk-weekend`'s
commitment and DESK's 04:00 battery charge, scenario data only, with S-12 re-measured); K-8's
audible alarms for the competent proxy on mild seeds (≤ 8); first-visit size; visual QA PNGs of
the map at a mild noon and the Live Stack with a surplus; `SIM_VERSION` `v4-core-2a.1`; the
golden. SPEC edits: the status line and phase table (slices); P-1 (per second, the smelter
term), P-2 (13:00; the derate inside the heat window), P-3, P-4 (the quantity, the tie-out rise,
the lead clause), P-9 (the 21:14 timing), P-12 and S-1 (unserved = underlying), S-14 (rule 3's
wording, rules 1 and 5 deferred), L-2 (the sigma; shown always until 2e), L-5 (the definition,
P50, the reference seed), K-8 (twelve tiles), H-7 (the midday re-run), H-8 (C-7), §6 rows, §8.2
rows per the §19.5 table, §8.3 additions (the 6-minute ramp stays unverified), risk 10, §9.1
Q-19 onward, the Q-18 "still to do", the release checklist. Deferred and said so in SPEC: P-1's
debrief plot (2d), S-14 rules 1 and 5 and the lean proxy (2b / 2d), fronts over suburbs and the
briefing-time heatwave (2c).

## 24. Stage A record (2026-10-02)

Stage A is commits `5e4e076` (shapes, `v4-core-2a.0`) and `2f8dc74` (golden). CLASSIC is
unchanged: the quick baseline and the full golden differ from the old ones only in hashes, the
Build line and machine lines (439 of 439 lines identical once hashes are masked). Two independent
checks found no defect. Settled while building it:

* `obs.wind.autoMW` / `obs.solar.autoMW` pass `ren.windAutoMW` / `ren.solarAutoMW` through as
  stored (before OFGS). Only the spill energy applies `(1 - ofgs.trippedFrac)` to the wind term.
* An MSL level is reached when the tested minimum is **at or below** its threshold.
* `ext.rooftop` is null on every scenario until `world` lands its pre-roll: nothing may infer
  "no rooftop" from it; use `scn.rooftop.capacityMW`.
* `inverterMW` is a literal 0 in four places for `grid` to wire: `fleet.preTrip`,
  `fleet.startContingency`'s `caught`, physics `newCaught` (and the trace and reset around it) and
  previewTrip's returned `caught`. `app/record.js` already traces it from `phys.renPfrMW +
  phys.roofPfrMW`, and `desk/calc.js imbalanceSegments` already subtracts both in `sumMW` and
  `borrowedMW` (the K-11 identity closes once they are non-zero).
* `desk-weekend` opens about 210 MW short at stage A (coal 4 is off and the weekend factor is
  not applied yet). With `world`'s ×0.92 the estimate is hydro at about 269 MW each on a HOT
  weekend: balanced, but drawing water from 04:00. Stage C tunes the commitment (C-14).
* DESK_WEEKEND shares DESK's `rooftop`, `weather` and `temperatureC` objects (none is shared
  with CLASSIC). First-visit transfer is 312.4 KB gzip of 400.

## 25. Wave 1 record (the sim; merged 2026-10-02)

`world` and `grid` were each built in a worktree, reviewed by two readers (one against the
contract, one trying to break it, with mutation testing) and fixed. Merged with one README
conflict; the golden was re-recorded at the merge (C-13). **The order of the remaining work
changes: wave 2 is `par` and `view`; `app` is wave 3**, built on both, because the objective's
accepts need the final dispatch and the real blue.

What the sim now does, measured (weather and events only unless said; seeds 1–200):

* Day types: MILD 50.5%, HOT 35%, HEATWAVE 14.5% (seeds 1–2,000: 54 / 31 / 15). Pinned seeds:
  MILD 1, 5, 8, 9, 13, 20261001, 20261004; HOT 2, 3, 7, 11, 20260930, 20261003; HEATWAVE 4.
* Minimum operational demand, median: HOT 3,242, HEATWAVE 3,271, MILD weekday 2,202, MILD weekend
  1,746 MW (P-3: all in band). L-2 coverage on `desk` 80.7% at 1 h, 79.9% at 4 h. Rooftop
  forecast-error sigma 2.9% / 3.1% (L-2's 5% / 15% is not reachable with a mean-reverting sky;
  stage C rewrites the line). State 45.6 KB of 64.
* MSL on mild weekends: MSL1 on 15–21% of days, MSL2 on ≤ 1.3%, MSL3 never. A no-contingency
  MSL1 has no lead (it needs −150 MW of demand noise, which the forecast forgets in an hour):
  P-4's 2-hour lead clause is not met and stage C rewords it.
* C-6: a 510-MW surplus is held at 50.000 Hz with 510 MW cut; an idle battery gains < 1 MWh in 30
  minutes; a CHARGE 300 order takes exactly 300 MW off the cut. The same run on the stage A sim
  goes black at 52 Hz. C-7: a 256-MW load loss from the curtailing state peaks at 50.23 Hz and a
  tie trip at 300 MW export at 50.27 Hz (51.66 and 51.83 Hz with the flags off). H-7's midday
  case on net-load blocks: 8 stages take 1,295 MW net for 650 MW lost and leave 2,942 MW of
  customers dark; peak 50.44 Hz, not black (black at 52 Hz with the flags off).
* CLASSIC: bit-identical through `world` and through `grid`'s flags-off commit. With the flags on
  the droop acts on about 15% of ticks and par's days diverge (48 seeds: zero-unserved days 45 →
  44; black 0 → 0).

Decisions taken at the merge (integrator):

| # | Question | Decision |
|---|---|---|
| M-1 | The whole-window tie rise raised MSL1 for morning tie outages that ended hours before the belly: 35 of 37 long-lead notices were cancelled before their minimum. | **Per column**: the present counts as out while the tie is tripped; a forecast column only if it falls before the tie's public return (`env.s + tie.lockoutS`). The column tested is the one closest to its own threshold; `msl.minMW` / `atS` are that column's. P-4 still in band (slow test, seeds 1–200). |
| M-2 | Directed shedding took the next rotation district whatever its net load: SOL3 at −33 MW tipped a 4-MW shortfall into UFLS. | `shedNextRotation` **passes over a lit rotation district whose net load is ≤ 0** (the old rule when none has load). UFLS blocks stay static (C-8). The desk names the same district (§21.5 below). |
| M-3 | `grid`'s deviations from §21.2. | Accepted as built: AGC's unmet lowering request joins the cut only **while the floor surplus is > 0** (added always, it spilled wind on CLASSIC with no surplus); it is the last second's ACE, not an integral; while the dispatch is spilling a lowering request goes to **the units first, as far as MIN**, then the battery; the cut is a **cap on output** in both directions; RERT output counts as must-run; the rooftop hold releases at a fixed 1 / `ROOF_RAMP_S` per second. |
| M-4 | Left open for stage C. | A plan far above MIN with **no** floor surplus parks high (600 MW above: 50.13 Hz; 1,000: 50.28 Hz; never OFGS, never black): in the game the dispatch re-plans every 5 minutes, so only hand-held levers get there. In a **deep belly** (must-run above demand with every MW of wind and sun already held back) AGC charges an idle battery with the excess, and with no room left frequency parks at about 50.35 Hz on the roofs' back-off: the only remedy is stopping a unit (MSL3's card says so). `caught.uflsMW` is short by the still-off rooftop when a stage sheds a district relit under 7 minutes ago (labelled). `msl.atS` may be up to 4.5 h past 04:00 late at night (level 0 then; clamp before mapping it to a column). |

Facts the next waves build on:

* `forecast.demandP50/P10/P90` are operational; `underlyingP50 = demandP50 + rooftopMW + the
  smelter's expected missing load`; `rooftopMW` is as if every inverter were connected, after the
  derate of an **announced** heat window. The band is widest where the sun is high.
* The cut works from the **floor blocks**: in a surplus a base point above MIN is carried by AGC
  (which lowers units to MIN at their own ramps, coal 3 MW/min a machine), with
  `|agc.requestMW|` up to the units' whole room above MIN while spilling, beyond the regulating
  bands. `agc.unmetMW` flickers negative for about a third of the seconds while the units are at
  MIN and the battery charges on its whole inverter.
* `spillMW = obs.wind.autoMW + obs.solar.autoMW` is exactly 0 outside a floor surplus. The
  droop's back-off is **not** in it: that is `balance.renPfrMW`, and `score.spillMWh` counts it
  (about 15 MWh on any day), so "spill > 0" in the score does not mean a surplus.
* `caught.inverterMW` is negative when the inverters caught a loss of load (−253 of a 256-MW
  potline trip) and can be positive after a loss of supply that began above 50.015 Hz.
* `obs.districts[].coldLoadMW`: a lit district's **net** load (negative at a sunny noon: SOL3
  −8.9 MW); a dark one's underlying pickup. `ufls` / `shed` records' `mw` is net (the load the
  relays took off); `restore`'s is the underlying pickup. `obs.demand.shedMW` is the relay MW
  (can be ≤ 0 with customers dark); `obs.demand.unservedMW` is the customers' load.
* MSL records: `{tick, kind: 'log', sev, code, msg, level, minMW, atS}` on every change, a fall
  included (MSL2 → MSL1 emits `MSL1` / `info`). A level held by hysteresis can sit 100 MW above
  its threshold, so a card says the minimum and its time, never "below X". When the minimum is
  the present second the message says "demand is at its lowest now".
* The S-4 scramble in `tests/autopilot.test.js` needs a DESK case (`par`): `createState(5, DESK)`
  with donor `createState(4, DESK)`, the existing recipe plus `s.ext.rooftop.clearPm[j] =
  row.map((x, i) => (i * stepS > cutS ? donor.ext.rooftop.clearPm[j][i] : x))`. Do not swap
  `state.day`: it is public.
* `desk-weekend` opens balanced with hydro at 217–276 MW a machine from 04:00 (C-14 tuning).

Red on purpose after the merge (the next owner's):

* `view`: `tests/desk.test.js` K-11 "the bar balances about zero" (`desk/dial.js` needs the
  inverter segment); `tests/map.test.js` G-5 "machine rotor slows in the watch" (a fragile seed-7
  fixture whose frequency the droop moved by 8 mHz: measure cruise at 50 Hz or widen the margin).
* `app` (wave 3): `tests/objective.test.js` "the DESK scenario is the classic day…" and "a day
  with no input runs short by mid-morning…", and its slow whole-day case.

Changes to §21 for the next waves:

* **§21.5 view, added.** The dial's SHED mark keys on `obs.demand.unservedMW` (not `shedMW`,
  which is ≤ 0 with a net exporter dark) and the bar tolerates a negative `shedMW`. DIRECT SHED
  names the lit rotation district with the lowest (`restoredAtS`, `rot`) **among those whose
  `coldLoadMW` > 0** (all of them when none is), as M-2 sheds. C-11's blue also counts
  `obs.rert.outMW` as must-run and uses the battery's order (not AGC's trim), as the sim's cut
  does. `obs.msl.atS` is clamped to the end of the day before it is mapped to a column.
* **§21.3 par, added.** The S-4 DESK scramble case above. Rule 7 reads the request net of what
  the dispatch is lowering in a surplus. S-12 is re-measured with the C-7 flags on.
* **§21.4 app (wave 3), added.** The respond card words `inverterMW` for both signs. MIN GEN reads
  `spillMW` (0 outside a floor surplus), never `score.spillMWh`.

**Measured on the merged sim before wave 3 (the objective as it was at Q-18, 11 seeds a scenario).**
The hint-following player is never black and ends with nothing unserved on 10 of 11 `desk` seeds
(seed 3: 12,876 MWh) and 10 of 11 weekend seeds, but **at ruinous cost**: it arms the reserve
diesel on 19 of 22 days and never stands it down ($10M to $110M a day), calls all three DR blocks
every day, and pays 15 to 114 c/kWh where par pays about 4.7. Its `spare` line has no action, so
N-1 is never restored, the evening's guaranteed trip finds it short, and the fast answers are
all it has. Wave 3's accept adds a cost bar for that reason (§21.4 as amended in the wave-3
brief). The no-input day leaves 11,000 to 37,000 MWh unserved on every seed of both scenarios.

**C-14 tuned at the merge.** With one CCGT the hot weekend opened 170 MW under the capacity
margin, leaning on 270 MW a machine of hydro from 04:00, and the line started eight units in
eight minutes. `desk-weekend` now opens with **both CCGTs on** (CCGT 2 at 300 MW) and coal 4 off:
hydro balances at 67 to 126 MW a machine (seeds 1-200), nothing is asked for before 06:00, and the no-input
weekend still fails on 11 of 11 seeds.

## 26. Wave 2 record (par and the view; merged 2026-10-02)

`par` and `view` were each built in a worktree, reviewed by two readers (with mutation testing:
79 and 114 mutants, none surviving after the fix pass) and fixed. Both merged without conflict;
the golden was re-recorded (par's battery orders now sit in its plan for their energy, which
moves 198 of 200 CLASSIC rows). Wave 3 (`app`) builds on this.

**Par on the game's day** (`node tools/par.js --scenario desk | desk-weekend --seeds 1-200`):

| | `desk` | `desk-weekend` | Target |
|---|---|---|---|
| Zero unserved (S-12, S-14) | 192 of 200 (96.0%): MILD 99/101, HOT 67/70, HEATWAVE 26/29 | 197 of 200 (98.5%) | ≥ 85% |
| Forced heat, zero unserved | 86 of 100 | 98 of 100 | ≥ 75% |
| RERT armed | 13 of 200 (6.5%) | 1 of 200 | ≤ 25% |
| Commit-all dearer than par (S-11) | 198 of 200 | 200 of 200 | ≥ 70% |
| Black days | 0 | 0 | 0 |
| Negative-price hours, MILD (P-9: 2–6 h) | median 1.68 h (in band on 39 of 101) | median 2.62 h (80 of 101) | weekday misses |
| Negative-price hours, HOT (≤ 1 h) | 70 of 70 | 69 of 70 | |
| Spilled MWh a day, MILD (the automatic cut) | 299 mean, 870 max | 778 mean, 1,673 max | |
| SECURE states holding 49.5 Hz (H-8) | 6,470 of 6,471 (worst 49.491 Hz, a cached preview) | 6,436 of 6,438 | all |
| Rule 4 coal stops | 0 | 0 | expected 0 |
| A par day's runtime | 1.79 s | 1.71 s | 1.6 s (D-9), unchanged by 2a |

CLASSIC after the merge (golden): zero unserved 183 of 200, forced heat 77 of 100, RERT 44, the
competent proxy's A 72 of 100 (now over its 70), battery average charge price $198.

This table and the CLASSIC line are as measured at wave 2. The final review moved par on every
scenario (the dispatch counts a unit still loading); §28 has the figures since, and SPEC S-12
carries them.

**The view, measured.** Blue against the sim's cut with the truth in place of the forecast:
median 0.1 MW, 1 MW worst once a spill has settled; with its own forecast, within about 50 MW at
+5 to +15 minutes (the rest is forecast error). Live Stack full redraw p95 1.2–1.5 ms of 4; map
frame p95 0.06 ms at a mild noon; first visit 345.6 KB gzip of 400. The agent looked at real
pixels (`next.html?seed=1&debug`, PNGs through `tools/shot-receiver.mjs`).

Decisions at the merge (integrator):

| # | Question | Decision |
|---|---|---|
| N-1 | C-11 left out demand response and a battery DISCHARGE order, which the sim's cut counts (350 and 200 MW low in exactly those cases). | Both terms added to `proj.surplusMW` (`app/planview.js`), with test rows. |
| N-2 | Par's own battery orders counted to the end of their window, so the night recharge was never in its plan (AGC asked for over 150 MW on 12,496 of 12,529 charging seconds). | **Every battery order counts for the energy behind it** (the par agent's fix). CLASSIC moves; S-12 holds on all three scenarios; golden re-recorded. |
| N-3 | The map's sun disc sets at 18:48; the scenario's sunset is 19:48. | **Not moved** (the view agent tried it: a sun on the horizon under a starry sky, because the light table is dark by 19:54). The light, and so the glint, reaches zero at 19:48; stage C says so under G-3. |
| N-4 | Left for stage C. | After a trip in a surplus, par's rule 1 starts a GT and imports while the dispatch is still spilling (37–81 MWh on the seeds looked at). P-9's mild-weekday band (median 1.7 h against 2–6 h). The price alone starts no charge order outside par's window when nothing is spilled (104 s in 16 days). |

Facts wave 3 builds on:

* **Lighting a control.** Put `guard-stop-<unit>` or `guard-start-<unit>` in `vm.glow` and the
  guard on the desk, the plant on the map and the station's layer on the stack all light.
  `dial-battery`, `key-rert` and `stack` light too.
* **`consider`.** The desk sends `actions.ui({do: 'consider', target})` only when the resolved
  target changes and never an initial null. "Focused" is the **keyboard's** focus (a guard
  clicked with the mouse is not focused for this; a later-focused guard ends a key-lift hold).
  Losing hover or focus clears on the next desk frame. After `S` / `X` on a lever the target
  stays for the 2-s cover plus 6 s; after a commit by key it clears at once; after a mouse commit
  it stays while the pointer is on the guard. After a new day the present target is sent again.
  In this shell Tab does not move between guards, so a keyboard player reaches a guard's
  consequence through `S` / `X` on its lever. The desk sends targets for guards whose press would
  open the scope, abort a stop or be refused: `consequence()` returns null or the block reason.
* **`proj.surplusMW`** assumes the tie exports at its limit (0 while tripped), counts a CHARGE
  order, DR and a DISCHARGE order, and is not capped at wind + solar (in a deep belly it
  overstates what can be spilled). For "is power being spilled now" read `obs.wind.autoMW +
  obs.solar.autoMW`. `vm.objective.long = blueRuns(proj)[0]`; its `atS` is the END of the first
  blue column.
* **The dispatch** reads the present from `obs.demand.litMW`. A player's battery order counts
  for its energy (discharge to 20%, charge to full, within the inverter less the GUARD) and is
  re-dispatched at the system's next look (≤ 60 grid-s; `commitSig` carries the battery). The
  sim keeps discharging below 20%: the objective's idle-at-the-reserve line closes that.
* **`tools/follow.mjs`** (`node tools/follow.mjs --scenario desk --seeds 1-11 --lines`) runs the
  hint-following player with par beside it, cost by key, the battery at 16:30, and for each
  accepted STOP line the quoted saving against the realised difference. The saving is read from
  `line.saving`, `action.saving`, or the first dollar amount after "save" in the text. It skips a
  STOP by setting that unit's `stopBlock` in a copy of the observation: this relies on §21.4's
  rule that a candidate not `on` with `stopBlock === ''` gets **no STOP line** (the objective
  falls through to its lower branches; it does not name the next unit).
* MSL2 and MSL3 never occur on par days (MSL1 on 11 of 101 mild weekends): those objective
  branches are tested on poked observations only.
* The stack's header already says SPILL beside a negative price (since the final review, only
  while the dispatch is cutting more than `SURPLUS_MIN_MW`) and its text alternative lists
  the surplus runs and the rooftop MW: the objective says the action, not the number again.
* `calc.coldLoad(d, nowS)`, `calc.nextShed(districts)`, `dial.shedMarkMW(obs)`,
  `emergency.shedText(obs)` and `desk.makeConsider` are exported if the app wants the same
  answers. `CAUGHT_WORD.inverterMW` is INVERTERS (positive parts only on the gauge).
* Screenshots: start the `gridwatch` preview (it serves the main checkout), open
  `next.html?seed=1&debug`, set the viewport to 1280×720, tick with `gridwatch.frame`, POST
  `canvas.toDataURL()` to `node tools/shot-receiver.mjs`. The browser caches modules between
  reloads: `fetch(file, {cache: 'reload'})` each edited file first.

Still red on purpose (wave 3's): `tests/objective.test.js` "the DESK scenario is the classic
day…" and "a day with no input runs short by mid-morning…", and its slow whole-day case.
`app/boot.js` still passes `DESK` (wave 3 passes `scenarioForSeed`); `vm.consider` is still null.

## 27. Wave 3 record (the objective line; merged 2026-10-03) and stage C

`app` was built in a worktree, reviewed by three readers (the contract, an adversary, and a
first-time player who read every line of six whole days as a stranger would) and fixed: 34
findings, all resolved in the row (the player's one blocker: "You are 650 MW short" at 50 Hz
with nothing unserved, now "Within the hour you will be up to 650 MW short of a safe margin").
Mutation check: 25 of 26 mutants of `app/objective.js` killed, the survivor equivalent.

**The hint-following player, measured** (`tests/lib/follow.js`, 11 seeds on each of `desk` and
`desk-weekend`, par on the same seed; `tests/objective.test.js` slow accepts):

| Accept (§21.4) | `desk` | `desk-weekend` |
|---|---|---|
| a. never black, nothing unserved on ≥ 9 of 11 | 11 of 11 | 11 of 11 |
| b. reserve diesel on ≤ 3, none left armed; DR ≤ 1.5 a day | 1 (stood down); DR 0.73 | 0; DR 0.18 |
| c. cost ≤ 1.3 × par's on ≥ 8 of 11 | 10 (the miss: the diesel day, where par leaves 1,063 MWh dark and the follower none; since §28 par is clean there) | 11 |
| d. a gas unit stopped before noon and restarted, ≥ 8 of 10 non-heatwave | 10 of 10 | 10 of 10 |
| e. plan cost lower with STOP and BATTERY followed, unserved never higher | 11 of 11 | 11 of 11 |
| f. each quoted STOP saving within ±30% or $10,000 | **not met**: 38 of 140 as `tools/follow.mjs` skips; 116 of 140 stop by stop | (both scenarios together) |
| g. battery at or above par's at 16:30 on hot days | 5 of 6 (all seeds: 7 of 11); 6 of 6 (10 of 11) since §28 | 5 of 6 (7 of 11); 6 of 6 (10 of 11) since §28 |
| h. the no-input day fails on every seed | 11 of 11 | 11 of 11 |
| i. no line over 170 chars, no NaN, no "short" after a followed hint | 0 violations | 0 violations |

Before wave 3 the same player armed the diesel on 19 of 22 days and paid 15 to 114 c/kWh.

Rulings at stage C (integrator):

| # | Question | Ruling |
|---|---|---|
| P-1 | f is not met as written. | **Recorded as not met.** The tool's skip blocks a unit until its next start, so it forgoes a whole queue of later STOPs: the realised figure is the queue's. Stop by stop, 116 of 140 agree (evening and night 99 of 107; mornings 17 of 33, the misses mostly from trips). The line now says "saves about $N if nothing trips before then". The test stays a todo with these figures. |
| P-2 | g: "on hot days, ≥ 9 of 11" cannot be met when 6 of 11 seeds are hot. | **Read as hot and heatwave days, hot − 1** (5 of 6 on each). Every miss is 0.2–2.1% under a par battery at or near full: AGC regulation draws 10–16 MWh from a full battery in the hour before 16:30 while the follower runs fewer units. Since the final review (§28): 6 of 6 on each, 10 of 11 over all seeds. |
| P-3 | i widened to the shortfall branches' own DISCHARGE orders. | **Not part of i.** Four cases on `desk` (five since §28: 20260930, 500 MW at 18:51 then a DR call at 18:54), each a larger order or a DR call inside one growing evening shortfall; none follows a battery-branch hint. The battery branch's own orders hold "one per 900 grid-s" on all 22 days; a literal rule over every battery input would need the time of the last order in `observe()` (a sim change; not made). |
| P-4 | A STOP on a hot morning can lose money if something trips in the afternoon (3 of 10: −$49k to −$90k against a quoted +$31k to +$36k). | **Kept as a stated bet** (SPEC §9.1 Q-38): on a HOT morning, until 10:30 (while a heatwave may still be announced) the STOP must also hold with the heat added; from 10:30 it is checked as forecast (CCGT 2 passes from 10:30, gas turbines from about 09:30); the line says "if nothing trips before then". |

Deviations from §21.4 accepted as built: branch selection ranks lines that carry an action (or
are critical) before passive ones, so a STOP or BATTERY line shows over "Start X by 14:05"; an
extra `shortAhead` branch between commit-now and restore; the commit margin is 650 MW (one trip
covered), counting water at any hour, while STOP's condition 1 holds water until 15:30 as
written; a spilled-power raise of an existing charge; a charge into the evening continues while
coal sets the price; the GUARD line asks once for 400 MW; the quiet line's thin-spare band;
`steady()` holds a line's words while only its figures move; STOP text "if nothing trips before
then" and, for gas turbines, "Spare holds without it now:"; the MSL card texts as reworded.

**Stage C.** SPEC §8.2 gained the five rows of the §19.5 table (one renamed) and the
`content/text.js` entries left `specPending`; SPEC's "in progress" markers are closed, Q-18's
"still to do" is closed with the measurement above, and Q-38 records P-4. `SIM_VERSION`
`v4-core-2a.1`; the golden re-recorded. No value was tuned at stage C: C-14's tuning was conditional and the no-input day fails on 11 of 11 seeds on both scenarios. P-9's weekday band, M-4 and N-4 stay open.

**Size, at the end of stage C.** First visit 382.2 KB gzip of the 400-KB budget (F-11; was 345.6
after wave 2; first recorded here as 376.5, a figure from `tools/baseline-v4.js`, which leaves out
`desk/desk.css`): `app/objective.js` is 85 KB raw, 27 KB gzip. §28 has the size after the final
review; the next slice should budget its first-visit bytes up front. The
default suite runs in 50 s of F-10's 60.

## 28. Final review (2026-10-03)

Before the branch went for review the whole of 2a was read again, by three readers (the seams
between the waves, the docs against the code, code health), each finding reproduced or refuted by
a second agent. Three findings were real and major; the rest were minor or docs. Two fix jobs
(`sim`, `app`), each reviewed again, then merged by hand.

**Fixed, the sim** (`sim/autopilot.js`, `tests/autopilot.test.js`, `tests/planview.test.js`):

* **The dispatch imported while it spilled.** A unit still loading was not in the plan until it
  reached MIN, so the plan bought its MW on the tie while the dispatch cut wind and solar for
  them. Now, under `par` (`amend`: par, RE-DISPATCH and the game's dispatch), its output counts
  along its T2 slope (sim/README.md, autopilot.js). On the follower's days: `desk-weekend`
  20261017 imported 256 MWh while spilling, now 0 (no-blue minutes with a cut over 100 MW 37 → 2);
  seed 1, 153 → 0; `desk` 13, 82 → 54 (the rest is the 5-minute dispatch behind fast solar). A
  test pokes a belly at 12:30 with coal 4 loading and fails without the fix.
* **Blue with the player's terms on** is a default-suite row now (DR and a DISCHARGE order, then a
  CHARGE order, against the cut the sim then makes: within 0.4 MW in every column). Any new C-6
  term (2b's soak, air-con cycling) goes into `sim/grid.js` `surplusMW`, `app/planview.js` and
  this row. (Superseded for 2b by §31 Q-50: flex is in operational demand, not a C-6 term; only
  the row gained a soak case.)

**Fixed, the app** (`app/objective.js`, `app/system.js`, `app/game.js`, `render/livestack.js`,
`tools/perf.mjs`, tests):

* **The GUARD after a belly trip.** The line raised the GUARD to 400 MW and never lowered it, so
  after a trip at minimum (240 MW) the GUARD kept giving 400 MW and frequency sat above 50.15 Hz for
  up to 590 s. The line now (a) asks for the GUARD at 0 MW while it has fired and frequency is
  high, (b) never raises it while fired, (c) asks for it back within the hour after a loss of
  supply ("After the trip the battery GUARD is at 0 MW. Raise it to 400 MW: …"), and (d) orders
  no spill charge while the GUARD has fired. (c) and (d) go beyond the review's list: without (c)
  `desk-weekend` 20261001 heard 9 audible alarms (K-8 is ≤ 8), and without (d) seed 5 ordered two
  charges a minute apart into the released MW (accept i). On the 22 accept days the seconds above
  50.15 Hz in the 900 s after each trip went from 3,655 to 312 in all (the worst trip 590 s before, the worst 67 s after);
  days with a trip over `FOS_RECOVER_S` 7 → 0. The slow test runs `desk-weekend` 20261017 and 5;
  without (a) the first still fails (on "the line turned the GUARD down", 157 s above the band,
  since (d) alone removes the charge that kept it high) and the second fails the 300-s bound
  itself (526 s).
* **Hand edits held at once.** The game asked `sys.edited`, which the system only rescans at its
  60-grid-s look, so a lever moved by hand and then a START re-dispatched over the hand's keys.
  `app/system.js heldByHand(sys, state)` scans the log fresh; `app/game.js` and
  `tests/lib/follow.js` use it.
* **The line's cost per frame.** One projection and one day-ahead forecast per line (the
  day-ahead from `weather.forecast`, not a second `observe`); a new consider target recomputes
  only the consequence (1.6 → 0.09 ms). `tools/perf.mjs` now measures the page's own day: the
  seed's scenario, the player's commitment and a player following the line.
* Smaller: SPILL on the stack only while the dispatch cuts more than `SURPLUS_MIN_MW` (and the
  price is negative); `LINE_MAX_CHARS` exported; the water as par counts it
  (`planview.waterValue`); the line's errors kept in `vm.objectiveError` (not yet shown);
  `tests/lib/follow.js` observes only when it acts or measures; a check that the HOT-morning STOP
  guard reads the heatwave the sim has pre-rolled; a slow K-8 case for the follower on mild
  weekends (4–7 audible alarms a day).

**Par, after the final review** (`node tools/par.js --scenario … --seeds 1-200 --probe --vs commitAll`,
and `--heat 100`; wave 2's figure in brackets):

| | `desk` | `desk-weekend` | Target |
|---|---|---|---|
| Zero unserved | 191 of 200 (192): MILD 98/101, HOT 68/70, HEATWAVE 25/29 | 195 of 200 (197): MILD 98/101, HOT 68/70, HEATWAVE 29/29 | ≥ 85% |
| Forced heat, zero unserved | 85 of 100 (86) | 98 of 100 (98) | ≥ 75% |
| RERT armed | 15 of 200 (13) | 1 of 200 (1) | ≤ 25% |
| Commit-all dearer than par | 197 of 200 (198) | 200 of 200 (200) | ≥ 70% |
| Black days | 0 | 0 | 0 |
| SECURE states holding 49.5 Hz | 6,495 of 6,495 | 6,684 of 6,685 (worst 49.497 Hz) | all |

The seeds par newly leaves unclean (`desk` 10 and 68, `desk-weekend` 29, 36 and 51) shed after
trips with nothing loading, or on 51 after a trip that is larger because the plan no longer
over-imports; the S-12 targets hold. CLASSIC (golden re-recorded, `v4-core-2a.1` kept: unreleased):
zero unserved 181 of 200, forced heat 77, RERT 43, the competent proxy's A 71 of 100, battery
average charge price $197.

**The follower's accepts** (§21.4, slow, 11 seeds a scenario): a, b, d, e, h unchanged. c: still
10 of 11 on `desk`, but its miss is now a day par gets through clean (`desk` seed 3: the
follower arms the reserve diesel and pays 2.0 × par's 7.4 c/kWh). g: 10 of 11, 6 of 6 hot and
heatwave days, on both scenarios (5 of 6 at stage C). i: 0 violations; widened to the shortfall
branches' DISCHARGE orders, 5 on `desk` (one more, P-3). f stays not met (P-1).

**Size.** First visit 384.3 KB gzip (`node tools/perf.mjs`, 45 files, 1,108 KB raw):
15.7 KB of headroom for slices 2b–2e. `app/objective.js` is 85.4 KB raw, 27.6 KB gzip.

Left open: N-4 (par's own import while spilling after a trip: 9,129 MWh over 200 weekend seeds,
210 of it while a unit loads); `vm.objectiveError` is not rendered; the Live Stack still projects
on its own cache on the frames the line projects (about 1.2 ms p50); F-11 in a browser was not
re-run after the final review.

---

## 30. Alarms beside the plan, an alarm panel that explains, "?" that closes, and one ALL-IN score (contract, 2026-10-08)

(Comments that cite "§29" in `desk/dial.js`, `desk/calc.js` and `tests/balance.test.js` mean the
PR #9 BALANCE-bar playtest record, which never landed here. This contract is §30.)

The owner, 2026-10-08, after playing the PR #11 build:

> I think the alarms and the 'plan' notes should be next to each-other because I spend a lot of
> time looking at the plan notes, I also think the alarms panel should be able to pop out and pause
> the game so that you can understand each of the alarms and get an explainer, I also notice that
> if you click the "?" it shows information but then when you click it again it doesn't close the
> note so blocks your view. We also need to make explicit the goals of reducing cost for consumers
> while not being under power, I think we need to put in some STIPIS calculation but also tie it to
> total consumer cost and also ratio against carbon emissions, so the final score should be a
> combination of the 3 put together a sensible formula

How we read it (checked against the code, workflows `wf_d9aef32c-e8d` and `wf_cc8a1cd4-c64`):
- **The "plan notes" are the standing objective line** (`#objective`, Q-18): its badge reads
  `◷ PLAN`, and the owner reads it all day. The message tray is already directly under the
  annunciator, so it cannot be what is far from the alarms.
- **The "?" bug is three bugs.** (a) The header "?" opens `#drawer`, which is `position: fixed;
  top: 0; right: 0; width: 470px; z-index: 15` and so paints over the "?" that opened it; a second
  click lands on the drawer, which has no close control (a mouse-only player cannot close it). It
  also covers desk column 4 (the alarms and the tray). (b) The shell's "?" badges call
  `showPopover` on every click (it has no open state), and Esc closes the drawer under the popover
  first. (c) The desk's own "?" buttons (`q-dial`, `q-imb`, `q-gauge`) and the annunciator tiles
  re-arm their notes on each press. The tests passed because the DOM stand-in has no layout.
- **STPIS cannot be applied as-is, and the game must say so.** AER STPIS v2.0 cl. 3.3(a)(2)–(4)
  (and the Distribution Reliability Measures Guideline §3.3, items 1–3) let a distributor *exclude*
  load shed for a generation shortfall, automatic UFLS and shedding directed by AEMO, unless a
  network interruption is already under way. Until slice 2c's storm feeders, those are the only
  outages GRIDWATCH has. Regulators value unserved energy from supply shortfalls at VCR: the
  Reliability Panel sets the standard against "the cost of unserved energy measured at the VCR",
  and AEMO's ISP counts "involuntary load shedding costs, valued at the value of customer
  reliability" and "changes in greenhouse gas emissions, valued at the value of emissions
  reduction". GRIDWATCH extends VCR to every MWh it sheds, UFLS after any trip included, although
  the reliability standard leaves out non-credible contingencies and the AER computes no VCR for
  widespread or longer-than-12-h outages. Regulators rank options by the *difference* in these
  dollars; dividing par's total by yours is GRIDWATCH's own rule. So the score prices reliability
  the system-operator way (VCR × MWh dark) and shows SAIDI, SAIFI and MAIFI as the Guideline
  defines them, before STPIS's exclusions (the AER's "all outages" basis), labelled. STPIS dollars
  and VCR × USE are never added together: STPIS's rates are built from VCR, so that would count an
  outage twice.

### 30.1 Decisions (owner-delegated, "most fun within realism"; SPEC §9.1 numbers allocated here)

| # | Decision | Why |
|---|---|---|
| **Q-44** | **Help texts load on demand** (risk 11, option A). `content/text.js` (the drawer and "?" texts, 14.4 KB gzip) leaves the first visit and loads on the first open of the drawer or a "?" popover; the new alarm explainers load on the first open of the alarm panel. A small static anchor index stays eager. F-11's 400 KB stays as written; the test names the on-demand modules and caps each. Measured: the first visit goes from 397.6 to about 384.6 KB; after this wave's eager code (≤ 6 KB in all, each agent reports its share) about 9–11 KB is left for slices 2b–2e. | Keeps F-11's promise ("the first visit transfers ≤400 KB") literally true. The other options (raise F-11; trim the most-tested module) cost more. Loading takes one same-origin request, while the reader is reading. |
| **Q-45** | **The plan bar.** The objective line and a compact annunciator share one strip along the bottom of the map: `#planbar` = `#objective` (unchanged id, children and classes) on the left, the annunciator as 6 × 2 tiles with ACK, HORN OFF and an **EXPLAIN** key on the right. The desk's column 4 becomes the message tray (now 212 px tall) above the emergency cell. SIL is renamed HORN OFF (owner, playtest 1: faces must say what they do). | The owner's eyes are on the plan line; the alarms now sit at its right end, where a control room's alarm banner sits. Every id stays, so every focus jump, key and test that names a control still works. |
| **Q-46** | **The alarm panel explains and holds the clock.** EXPLAIN (or W, or a second press on a tile) pops the alarms out into a large panel over the desk. While it is open the clock is held (director mode `ALARMS`, badge `HELD 0× · Esc`); closing returns to exactly the run state before (the player's own pause is untouched). For each of the 12 alarms it shows the state and at least one live number, what to do (with GO TO, which focuses the control and leaves the clock paused so the player can act), what it means, why it happens, and what the real grid does, with its source or "GRIDWATCH's own rule". No button in it sends a sim input; any other desk key closes it first (as GO TO). New horns and repeats wait while it is open; anything still unacknowledged sounds once on close. Allowed at any time, including the watch (the watch resumes at the same tick, as with Space). | "Pop out and pause so you can understand each alarm." A hold the player asks for is D-6's free pause with a reason attached, not the pause-card the §7 cut list rejects: nothing in it plays the game for you. |
| **Q-47** | **The "?" rule.** The press that opened a help closes it. Nothing a "?" opens covers that "?" (the drawer runs from under the header to the top of the plan bar; a popover opens below or above its "?", never over it). Every help shows how to close it: the drawer and the popover have a ✕, and a desk note's own "?" reads ✕ while its note shows. Esc closes the top-most thing first, in z-order: popover (20) → settings (16) → drawer (15) → alarm panel (13) → a desk note (a "?" note or a tile note); only when none is open does Esc go on to the map, the stack or skipping the watch. | The owner's bug, generalised: no help may trap the view. |
| **Q-48** | **One ALL-IN score.** ALL-IN $ = SUPPLY (S-2's cost of supply) + OUTAGES (VCR $30,000/MWh × MWh dark, S-1) + CARBON (VER $80/t × S-3's intensity × MWh the city asked for). **SCORE = round(1000 × par's ALL-IN ÷ yours)**: 1000 is par (GRIDWATCH's own autopilot on the same day), more beats it, a black day is 0 (F). Letters come from the score (§30.7). A live SCORE chip compares you with par at the same grid time all day. SAIDI, SAIFI and MAIFI are counted in the sim (per household; sustained = dark longer than 3 grid-min) and shown as reliability readouts with their link to the money, never added in. The briefing names the three goals and their prices; the end card shows the breakdown against par. Overrides H-12's "footnote only" for the *score* (CUSTOMER COST still never prices unserved energy), S-5's MWh ladder and S-9's carbon star. | One currency is how regulators trade the three goals off, so the formula teaches the real trade: 1 MWh dark = $30,000 = 375 priced tonnes of CO₂. Carbon on intensity × energy asked for: shedding barely moves it, and importing lowers it only through the mix you run (imported MWh are charged at your own mix, not the neighbour's). The ratio to par reads the same on any day. Recomputed on seed 20261008 (`v4-core-2a.1`, VER $80): par $9.124M (supply 4.331 + carbon 4.793); competent 987–988; lean 944–945; commit-all 809; a 10-MWh shed 968; the no-input day 14. |

### 30.2 Who builds what

Stage A (one agent, `base`) lands the shared skeleton (§30.3) on `alarms-and-score`. Then five
agents work in parallel, each in its own worktree **fast-forwarded to the stage-A commit** (agent
worktrees branch from `main`: `git merge --ff-only alarms-and-score` first), each editing only its
files (shared files: only the region named). The integrator (stage C) merges, writes SPEC.md,
re-records the golden, measures, and does the one browser pass.

| Owner | Files (region) | Its tests |
|---|---|---|
| **base** (stage A) | `content/anchors.js`, `app/alarmpanel.js` and `content/alarmhelp.js` (stubs), `app/score.js` (complete), `app/par.js` (stub), `app/boot.js`, `app/shell.js` (TEXT loading, popover functions, Esc capture and `closeTop`, key routing while the panel is open, focus on open/close, `drawAlarmPanel`, the par step in `onFrame`, `?perf` par line), `app/director.js`, `app/game.js` (the alarms commands, `alarmCtx`, `vm.alarmsOpen/alarmsSel`, `game.par`, `game.end` fields, `resetDay`, `take`), `app/alarms.js` (`defaultSel` stub only), `app/keys.js` (W), `render/format.js` (ALARMS label), `next.html` (containers, box rules, CSS variables), `tools/perf.mjs`, `tests/lib/dom.js` (capture phase), `tests/lib/play.js` (deps, `alarmCtx`, look lines), `tests/budget.test.js`, `tests/next.test.js` (:75 and :84 for `--desk-h`; deps) | new `tests/anchors.test.js`, new `tests/hold.test.js`; `budget`, `director`, `keys`, `next`, `play` |
| **planbar** (W1) | `desk/annunciator.js`, `desk/desk.js` (mount and ownership only), `desk/desk.css`, `next.html` (`#planbar`, `#objective`, `#annun-slot`, `#stack-overlay`, `#respond-card` top), `app/shell.js` (K-16 on the slot; the `used` route) | new `tests/planbar.test.js`; may fix broken lines in `desk`, `next`, `day`, `alarms` |
| **help** (W2) | `app/shell.js` (bodies of `openPopover`/`closePopover`/`toggleHelp`, `placeQs`, `drawDrawer`), `next.html` (`#drawer`, `#popover`, `#q-layer` CSS; `#btn-help` attributes), `desk/desk.js` (`ctx.note` and `closeHelp` only), `desk/dial.js`, `desk/gauge.js`, `desk/annunciator.js` (one line: pass the tile to `ctx.note`), `tests/lib/play.js` (`open` state in `controlOf`) | new `tests/help.test.js`; may fix broken lines in `next`, `desk`, `balance` |
| **panel** (W3) | `app/alarmpanel.js`, `content/alarmhelp.js` (fill the stubs), `app/alarms.js` (`ctx.hold`, `defaultSel`'s body, `setAtS` in the view, one AGC-limit constant), `app/watch.js` (one line), `tests/lib/play.js` (the ALARMS look line's detail) | new `tests/alarmpanel.test.js`; may fix broken lines in `alarms`, `next` (:1097) |
| **score-core** (W4) | `sim/step.js`, `sim/market.js`, `sim/params.js` (`SIM_VERSION` only), `sim/README.md` §8, `app/par.js` (the runner's body), `app/score.js` (`LETTERS` values only, after calibration), `app/game.js` (filling `game.end.parAllIn`/`grade` when par finishes), `tools/par.js`, test titles at `tests/integration.test.js:114` and `tests/market.test.js:72`, `desk/README.md:881` | new `tests/score.test.js`; may fix broken lines in `state`, `market`, `baseline-v4` |
| **score-ui** (W5) | `app/shell.js` (`drawHeader`'s chip, `drawEnd`, `briefingText`), `next.html` (`#chip-allin` and `#end-card` CSS, `#briefing-goals` and `#briefing-how` text), `render/format.js` (money and score text), `content/text.js` (new and fixed entries), `content/anchors.js` (append its own anchors), `SPEC.md` §8.1/§8.2 (only the rows `tests/text.test.js` needs) | new `tests/scoreface.test.js`; may fix broken lines in `next`, `text`, `honesty` |

Rules for all: never edit `app/score.js` or `app/par.js` signatures; never touch another agent's
region (if you must, one line, named in your report). New tests go in your own new file; edit an
existing test file only to repair an assertion your change breaks, and name the line. Pre-existing
overruns (`feedback.test.js` 6.85 s; the K-8 accept at `alarms.test.js:398`, 2.54 s) are exempt
unless you add time to them; the integrator splits them. Frozen: everything else, and `SPEC.md`
except W5's §8 rows.

### 30.3 Stage A: the shared skeleton (base)

1. **Q-44, on-demand text.**
   - `content/anchors.js` (eager): `export const ANCHORS = Object.freeze([{game: '<id>', rows:
     ['<row title>', …]}, …])`, exactly the `game` anchors and row titles of `TEXT.abstractions`
     (entries with no `game` or `game: 'drawer'` are not anchors). `tests/anchors.test.js` checks
     it equals what `content/text.js` gives, so the two cannot drift.
   - `bootGame(doc, deps)`: `deps.text` is the module object (`{TEXT}`) or a function returning a
     promise of it; absent, the shell imports `../content/text.js` itself on first need.
     `app/boot.js` passes nothing (so the browser loads it on demand); `tests/lib/play.js` and
     `tests/next.test.js` pass the module (synchronous). The shell's `loadText()` returns `TEXT` or
     `null` and starts the load once. Badges and their titles/aria-labels come from `ANCHORS`.
     While loading, the drawer shows "Loading…" and a popover shows its row titles; when the text
     arrives whatever is open is redrawn (the drawer's build-once guard must not freeze an empty
     drawer). If the load fails, the popover keeps the titles and the drawer says the text could
     not be loaded.
   - `deps.alarmPanel` likewise: the module, a loader, or absent (`import('./alarmpanel.js')`).
     Stage A creates the stubs W3 fills: `app/alarmpanel.js` exports `createAlarmPanel(doc, root,
     actions) → {update(vm) {}, focus() {}, el}` with one `✕ CLOSE` button
     (`id="btn-alarms-close"`, sends `{do: 'alarms', on: false}`); `content/alarmhelp.js` exports
     `ALARM_HELP = {}`. `tests/lib/play.js` and `tests/next.test.js` pass `alarmPanel` statically.
   - `tools/perf.mjs`: the import walk also follows multi-line static imports.
     `tests/budget.test.js`: `content/text.js` leaves the required list; a new test names the
     on-demand modules (`content/text.js`, `app/alarmpanel.js`, `content/alarmhelp.js`) and checks
     (a) none is in `firstVisit('next.html')`; (b) every `import(` under `app/`, `desk/`,
     `render/`, `content/`, `audio/` names one of them; (c) the static-import closure of each,
     minus the first visit, holds only named modules; (d) gzip -9 caps: `content/text.js`
     ≤ 17 KB (W5), `content/alarmhelp.js` ≤ 5 KB and `app/alarmpanel.js` ≤ 6 KB (W3). The first
     visit stays ≤ 400 KB.
2. **The hold.** `app/director.js`: `createDirector` gains `held: false`. `rateOf` and
   `rateOfLastTick` return 0 when held. `modeOf`: `OVER > HIDDEN > ALARMS > PAUSE > WATCH > …`
   (`locked` is still the watch's). `setFast` refuses in ALARMS; `directorFrame` ends FAST in
   ALARMS. `render/format.js`: `MODE_LABEL.ALARMS = 'HELD'`, badge `HELD 0× · Esc`. Shell: the
   pause button reads PLAY in ALARMS; `FAST_WAIT.ALARMS` = "the alarm panel holds the clock: Esc
   closes it"; `#rate-badge.ALARMS` styled like PAUSE.
3. **The commands** (`app/game.js` `ui`; presentation only, never logged):
   - `{do: 'alarms', on?, id?}`: `on` undefined toggles. **Open**, in every phase: `ui.alarmsOpen =
     true`; `ui.alarmsSel = id` if given, else `A.defaultSel(view, ui.alarmsPick, nowMs)` (below).
     Only while `phase === 'play'` and the day is not over does it also set `director.held = true`
     and end FAST; `take()` sets `held` from `alarmsOpen`. **Close**: `alarmsOpen = false`,
     `alarmsSel = null`, `held = false`. Returns ''.
   - `{do: 'alarmsSel', id}`: the one selection (`vm.alarmsSel`); the panel sends it on every
     change (click, arrows, Home/End, focus). Unknown id: 'no such tile'.
   - `ui.alarmsPick = {id, untilMs}`: a tile press while the panel is closed records its tile for
     the life of its note (6 s), then it lapses. `A.defaultSel(view, pick, nowMs)` (stage A stub:
     the pick if live, else 'underFreq'; W3 fills) chooses: a live pick; else the unacknowledged
     tile (state `alarm` or `cleared`) with the highest effective priority, newest `setAtS` first;
     else the newest acknowledged standing tile; else 'underFreq'.
   - `{do: 'alarmsGoto', target}`: closes the panel; then, if in play, not over and
     `!D.respondCardOpen(director, state)` (not `vm.respond` or the mode, which read ALARMS and
     null while the panel is open), sets `director.paused = true` (the hold becomes an ordinary
     pause, with its "Clock held" note); then focuses `target` as `{do: 'focus'}` does. Returns ''.
   - `{do: 'focus', target}` while the panel is open runs as `{do: 'alarmsGoto', target}` (a map
     click on a dark suburb, a tray button, 1–8). The one exception is a tile press, which selects
     (§30.4).
   - `{do: 'pause'}` while the panel is open closes it in every phase; then it runs the clock only
     in play before the day is over; elsewhere it answers with the existing blue toast.
   - With the panel open the RESPOND card hides and returns on close, exactly as with Space.
   - `resetDay` clears `alarmsOpen`, `alarmsSel` and `alarmsPick` (the new director starts unheld).
   - vm: `vm.alarmsOpen: boolean`, `vm.alarmsSel: string|null`.
4. **Focus** is moved synchronously by the shell's `actions.ui` wrapper, never by `panel.update`.
   When `{do: 'alarms'}` opens the panel the wrapper records `opener = doc.activeElement`;
   `drawAlarmPanel` calls `panel.focus()` once, on the frame the panel first shows. After a close
   the wrapper does exactly one thing: for `{do: 'alarms'}` (W, EXPLAIN, ✕, Esc) it focuses
   `opener` if it is still in the document and not hidden; for `{do: 'alarmsGoto', target}` it
   calls `focusEl(target)` even when `vm.focus` already names it; for `{do: 'pause'}` it moves no
   focus (Space has already blurred).
5. **One alarm context.** `G.alarmCtx(game, nowMs, realDtS)` →
   `{nowMs, realDtS, stationOf, hold}`: `realDtS` is 0 while the clock's rate is 0 (so AGC LIMIT
   counts running time only; this also changes PAUSE, on purpose), `hold = !!game.ui.alarmsOpen`.
   `buildVm` and `tests/lib/play.js` `lightFrame` both call it, so headless jumps and the page agree.
6. **Keys.**
   - `app/keys.js`: `w`/`W` → `{ui: {do: 'alarms'}}` (free and unpinned; `q` and `z` stay unbound).
   - **Esc first.** `app/shell.js` adds `doc.addEventListener('keydown', escFirst, true)`
     (capture). On Escape with no modifiers, not typing: `closeTop()` closes the top-most of
     popover → settings → drawer → alarm panel → desk note (`mods.desk.closeHelp()` when the desk
     has it, W2); if it closed something, `preventDefault()` and `stopPropagation()`, so the map
     and the Live Stack never see that Esc. Otherwise the Esc goes on as today (the map, the stack,
     then the fallback, which skips the watch). The old Esc lines in `run()` go. `tests/lib/dom.js`:
     `addEventListener(t, f, opts)` records capture (`opts === true` or `opts.capture`), and
     `dispatch` runs the document's capture listeners first (`stopPropagation` there ends it),
     then target → ancestors, then the document's bubbling listeners.
   - **Other keys while the panel is open.** Inside `#alarm-panel` the panel handles arrows, Home,
     End, Enter and Tab itself (the `own` route leaves them alone). Elsewhere, any keydown other
     than Escape, Space, W, A, Shift+A, ?, `,` and Shift+M first runs `{do: 'alarmsGoto', target:
     null}` (close, ordinary pause), then goes on as it always does. Keyups are untouched (the D/E
     release path).
7. **Popover functions** (`app/shell.js`): `openPopover(anchorEl, rows)` fills `#popover` (the
   rows' texts once loaded, their titles until then), places it and shows it; `closePopover()`
   hides it; `toggleHelp(button, rows)` is what every "?" calls. `closeTop`, the outside-click
   handler and the drawer's close only ever call `closePopover()`; nothing else sets
   `#popover.hidden`. Stage A writes them as today's behaviour; W2 fills the toggle, aria and
   placement.
8. **Containers and box rules** (`next.html`):
   - `:root` gains `--desk-h: max(300px, calc((100vh - var(--hdr)) / 2))` and `--planbar-h: 58px`;
     rules that repeat the desk height use `--desk-h`; `tests/next.test.js:75` and `:84` follow.
   - `<div id="planbar">` wraps `#objective` and a new `<div id="annun-slot" class="dk-vars">`.
     `#planbar { position: fixed; z-index: 6; left: 0; right: 0; bottom: var(--desk-h); display:
     flex; align-items: flex-end; gap: 8px; padding-right: 4px; pointer-events: none }`;
     `#objective` loses `position: fixed` and its offsets and becomes `flex: 1 1 auto; min-width:
     0`; `#annun-slot { flex: none; margin-left: auto; pointer-events: auto }` (it stays at the
     right end while `#objective` is hidden). W1 tunes these.
   - `<div id="alarm-panel" role="dialog" aria-modal="true" aria-label="Alarms explained" hidden>`
     with `#alarm-panel { position: fixed; z-index: 13; left: 8px; right: 8px; bottom: 8px; top:
     calc(100vh - var(--desk-h) + 4px); overflow: auto; background: var(--panel2); border: 1px
     solid var(--dim); border-radius: 8px }`. W3 styles only its insides (injected `<style>`).
   - `<span id="chip-allin" class="chip" hidden>` in the header after the CO₂ chip, and
     `<p id="briefing-goals"></p>` in the briefing card before `#briefing-how`.
9. **Score skeleton.**
   - `app/score.js`, complete as §30.7 specifies; `LETTERS` provisional `[['A', 960], ['B', 670],
     ['C', 340], ['D', -Infinity]]` (W4 calibrates the values only). It reads `sc.saidiMin || 0`,
     `sc.saifi || 0`, `sc.maifi || 0` until W4's counters land.
   - `app/par.js` stub with §30.7's signature: `createParRunner(seed, scenario, opts)` →
     `{step(maxTicks) {return true}, done: true, score: null, series: [], at(s) {return null},
     progress: 1, black: false}`.
   - `createGame({par})`: `par` defaults to **false** (no runner; every existing test is
     unaffected); `true` makes a runner; an object `{score, series?, black?}` is a finished runner
     (tests). `bootGame` passes `deps.par`; `app/boot.js` passes `par: true`. `game.par` is the
     runner or null.
   - `game.end` gains `allIn` (the player's, from `app/score.js`), `parAllIn: null` and `grade:
     null`; on a black day `grade = {points: 0, letter: 'F', star: false}` at once, without par.
     `game.end` is mutated in place when par arrives (W4), never replaced.
   - The shell calls `game.par.step(3000)` once per frame from TAKE THE DESK while the day runs, in
     every mode (PAUSE and ALARMS too), and `step(6000)` once the day is over, before `G.buildVm`.
     `?perf` shows the step as its own `par` line inside the frame (no hiding it from F-11).
10. **Look lines** (`tests/lib/play.js`): `ALARMS open: <label of vm.alarmsSel>` while
    `#alarm-panel` is shown (W3 adds the explainer's first sentence). The CLOCK line also prints
    `#chip-allin`'s text (empty while hidden). The CLOCK line shows the `ALARMS` mode like any other.
11. **Mount hooks.** `createDesk(doc, root, actions, {annunSlot: $('annun-slot')})` (the desk may
    ignore it until W1). `drawAlarmPanel(vm)` mounts the panel module into `#alarm-panel` on the
    first open, then calls `panel.update(vm)` while open and keeps `hidden` in step with
    `vm.alarmsOpen`.
12. `tests/hold.test.js`: open/close restores PAUSE or CRUISE exactly; Space closes and runs; GO TO
    leaves the clock paused and focuses its target; a held watch keeps its tick; the RESPOND card
    returns on close; in the briefing W opens without holding and TAKE THE DESK carries the hold;
    with the map focused and the drawer open one Esc closes the drawer and the map keeps its state;
    with the panel open, 1 then S S closes the panel, pauses, and the start is sent; a replay with
    the panel used has the same end hash as without.

### 30.4 The plan bar (W1)

- `#planbar` and `#objective` as §30.3.8; `#objective` keeps its look, its classes (exactly the
  level, plus ` consider`) and `pointer-events: none`.
- `#annun-slot`: 432 × 58 px below 1600 px wide, `clamp(432px, 30vw, 600px)` wide from 1600 px; it
  carries the desk's CSS variables (`.dk, .dk-vars { --dk-…; --u }`), focus ring and glow rules,
  and the desk's scale and reduced-motion classes.
- The desk builds the annunciator into `opts.annunSlot` (fallback: its own column 4, so desk-only
  mounts and tests still work). Tiles 6 × 2, about 52 × 24 px; the state glyph sits inline before
  the label (no glyph row); below 1600 px the label is 8.5 px, line-height 1, at most two lines
  (escalated tiles with their double border still fit); from 1600 px 10 px on one line. ACK and
  HORN OFF stacked (24 px each; HORN OFF on two lines, `♪ HORN OFF` while sounding; `#btn-silence`
  keeps its id; update `alarms.test.js:527` and `:538`). The **EXPLAIN** key (about 52 × 50 px;
  the word EXPLAIN and a small W; `id="btn-explain"`, `aria-keyshortcuts="W"`,
  `aria-controls="alarm-panel"`, `aria-expanded` = `vm.alarmsOpen`; title "Explain the alarms
  (W): holds the clock"; press → `actions.ui({do: 'alarms'})`; the pressed look while open; the
  `.lit` look while any tile is in `alarm`, until the panel has been opened once that day).
- **Tile press.** With the panel closed: focuses its control and shows its one-line note (K-8),
  now ending "Press again to explain (W).", and records `alarmsPick`. A second press on the same
  tile while its note shows closes the note and opens the panel at that tile (`{do: 'alarms', on:
  true, id}`). With the panel open: only selects (`{do: 'alarmsSel', id}`); no focus jump, no
  note; the tile's aria-label then ends "Enter: explain it". Notes float above the block (over
  the map), not over the tiles.
- Every `desk.contains(e)` check that must include the alarms widens to the desk or the moved
  annunciator (`focus()`, the `.dk-focus` ring, Enter on a focused tile, the scale and
  reduced-motion classes). Shell: a pointerdown on `#annun-slot` dismisses the RESPOND card (K-16
  parity), except on `#btn-explain` (the card then returns on close); the `used` route follows
  focus into the slot.
- Desk column 4: `LAYOUT.panels[3] = [212, 80]`: the tray (its cards may wrap to two lines) above
  the emergency cell; the CSS and `LAYOUT` agree (the K-17 test). Rewrite `desk.test.js:1340-1343`.
- L-4: the expanded Live Stack's reserve above the desk goes from 58 to 75 px.
- `@media (max-height: 659px) { #respond-card { top: calc(var(--hdr) + 8px); } }`, so at the
  1280 × 600 floor the card ends above the plan bar (a CSS pin in `planbar.test.js`).
- First-visit growth ≤ 1 KB.

### 30.5 The "?" rule (W2)

- **Drawer:** `top: var(--hdr); bottom: calc(var(--desk-h) + var(--planbar-h) + 9px); right: 0;
  width: min(470px, 40vw)`: it covers neither the header nor the plan bar nor the desk. A sticky
  (`position: sticky; top: 0`) row with `✕ CLOSE` (`id="btn-drawer-close"`, title "Close (? or
  Esc)"). Where the drawer is under 300 px tall, each article is a closed `<details>` whose
  `<summary>` is its row title, so it opens as an index. `#btn-help` gets
  `aria-haspopup="dialog"`, `aria-controls="drawer"`, `aria-expanded` and the `.on` look. Focus
  moves to CLOSE on open and back to `#btn-help` on close (if it was inside). Outside clicks do
  not close it. Closing it also closes a popover opened from a badge. A floating badge whose
  top-right corner falls inside the open drawer is placed at its element's top-left instead.
- **Popover:** the "?" that opened it closes it; another "?" swaps to it. A `✕` in its top-right
  corner (aria-label "Close"). Every "?" has `aria-controls="popover"` and `aria-expanded`. No
  `stopPropagation` (a "?" click closes SETTINGS like any outside click). It opens below its "?"
  if it fits, else above; `max-height` is the larger space minus 12 px, with scroll; it never
  overlaps its "?".
- **Inline "?"**: an anchor inside the header or inside a `.card` (briefing, end card) gets an
  inline "?" right after it; it is shown only while its element is shown, and re-inserted when its
  element was rebuilt (`!q.isConnected`).
- **Desk notes:** `ctx.note(box, text, ms, kind, q)`: given the "?" button or tile `q`, a second
  press hides that note; `q.aria-expanded` follows (also on expiry); a "?" button reads `✕` with
  the `.on` look while its note shows; a "?" note stays at least `max(ms, 0.3 s × words)`.
  `desk.closeHelp()` hides an open "?" or tile note and returns true (false if none).
- **Driver:** `controlOf` marks `open` when `aria-expanded="true"`, so a close is not read as a
  silent press.
- First-visit growth ≤ 0.6 KB.

### 30.6 The alarm panel (W3)

- `app/alarmpanel.js` (on demand; imports `content/alarmhelp.js`, may import `desk/util.js`,
  `desk/calc.js`, `desk/gauge.js`, `desk/dial.js` helpers and `render/format.js`; injects its own
  `<style>` once): `createAlarmPanel(doc, root, actions) → {update(vm), focus(), el}`.
- **Ids:** tiles `ap-<tileId>`, ACK ALL `btn-ap-ack`, HORN OFF `btn-ap-sil`, GO TO `ap-goto`, ACK
  this alarm `ap-ack-one`, CLOSE `btn-alarms-close`. No panel element reuses an annunciator id.
- **Layout:** a header ("ALARMS · clock held" and ✕); on the left the 12 tiles as a large 4 × 3
  board (glyph, label, state word, a short live reading), sorted once when the panel opens (an ACK
  changes a face in place, never moves it); on the right the selected alarm, in this order:
  **NOW** (≥ 1 live number); **WHAT TO DO** (with `GO TO <control as the desk labels it>` and
  ACK); **WHAT IT MEANS**; **WHY** (the physics, plain); **ON THE REAL GRID**; the trigger ("sets
  below 49.85 Hz, clears above 49.90 Hz", built from the constants). At 1280 × 600 NOW, WHAT TO DO
  and WHAT IT MEANS show without scrolling. Footer: "ACK ALL (A) · HORN OFF (Shift+A) · Esc or W
  closes · Space closes and runs".
- **GO TO** targets a control the player acts on, never a readout (`dial-freq`, `bar-imbalance`,
  `gauge-n1`); when the plan line is ▶ ACT NOW or ‼ URGENT and names a target, WHAT TO DO first
  offers GO TO that control.
- **Order:** alarm, then cleared-unacknowledged, then acknowledged, then quiet (dimmed); within a
  group escalated first, then newest `setAtS`. Arrow keys move, Home/End jump, the selection
  follows focus and is sent as `{do: 'alarmsSel', id}`.
- `content/alarmhelp.js`: `ALARM_HELP[tileId] = {means, why, todo: {text, target}, real: {text,
  facts: ['<exact §8.1 Fact title>', …]} | {text, abstraction: '<exact §8.2 bold title>'} | {own:
  text}, reading(obs, tile) → string}`. Numbers come from `sim/params.js` and `app/alarms.js`
  constants, never typed in. ON THE REAL GRID says only what the cited §8.1 row's Value cell (or
  §8.2 row's "Real world" cell) says, with its confidence as a word (H well established, M likely,
  L or UNVERIFIED unverified; "H / M" → "well established / likely"). A §8.1 limit is the
  standard's limit, never a real control room's alarm setting; the trigger line is GRIDWATCH's.
  Nothing on the §8.3 list is stated as fact (the trip lockout, the swing-equation constants,
  ISA-18.2's acknowledge semantics — ACK is "this desk's ACK" —, MSL3 for a region like ours, the
  1.9M households); where needed it says "unverified". Claims stay within what the code does
  (UFLS OPERATED lights only for stages inside a trip's watch; a smelter trip lights no trip tile;
  quote `f.rocofHzS`, not the trip-start RoCoF). WEATHER, STORAGE LOW and LINK TRIP have no §8.1
  row: their "real grid" part is a §8.2 abstraction or `own`.
- `app/alarms.js`: while `ctx.hold`, nothing starts sounding and nothing repeats (as in the
  watch); on release, tiles still unacknowledged sound once (the post-watch path); nothing is
  silenced for the player. `alarmsView` tiles gain `setAtS` (fix `next.test.js:1097`).
  `AGC_LIMIT_REAL_S` comes from `V.AGC_LIMIT_ALARM_REAL_S`. Fill `defaultSel` (§30.3.3).
- `app/watch.js`: on the day's first trip the RESPOND card's last line reads "Enter (or a click)
  to take the desk · W explains each alarm (the clock holds)."
- `tests/alarmpanel.test.js`: parses SPEC §8.1 and §8.2 as `tests/text.test.js` does; every
  `TILES` id has an entry; every `facts`/`abstraction` title exists; every number in each
  rendered entry equals a value in `sim/params.js`, `app/alarms.js` or the cited row; with the
  panel open a tile press selects and focus stays in the panel; W after a trip opens on UNIT TRIP
  (not a lapsed pick); no sound while open and one sounding on close; every panel control answers.
- On-demand caps: `app/alarmpanel.js` ≤ 6 KB, `content/alarmhelp.js` ≤ 5 KB gzip; first-visit
  growth ≤ 0.5 KB.

### 30.7 The ALL-IN score (W4 core, W5 face)

**Sim (W4).** `state.score` gains, after `spillMWh` and before the summary keys (update
`tests/state.test.js`'s frozen order and `sim/README.md` §8):
- `saidiMin`: Σ over sustained interruptions (dark longer than `V.SUSTAINED_INTERRUPTION_S`) of
  minutes dark × the district's `share` (households fraction): minutes per household. Counted
  each grid second in `market.settleSecond`; at the second an interruption passes the line, its
  first `V.SUSTAINED_INTERRUPTION_S` are added.
- `saifi`: Σ of `share` over sustained interruptions (added when one passes the line).
- `maifi`: Σ of `share` over interruptions relit after ≤ the line (no reclosers are modelled; it
  will usually be 0).
- Task districts (slice 2c) will count from the second they go dark.
No household count is needed (a district's share is both its customers and its demand). No price
in `sim/` (the H-12 scan stays). `SIM_VERSION` → `v4-core-2a.2`. W4 re-records the golden in its
worktree once (`npm run golden:v4 -- -j 4`) to prove that only the hash cells, line 3 (the
version and the sources hash) and the first-visit line change — any other change is a bug; the
integrator re-records the final golden after the merge.

**`app/score.js`** (stage A writes it complete; pure; imports only `sim/params.js`):
```
allIn(sc, households) -> {supply, outage, carbon, total,          // dollars
  askedMWh,      // sc.servedMWh + sc.lightsMWh
  co2tPriced,    // sc.co2tPerMWh * askedMWh: the tonnes the carbon term prices
  cents,         // total / askedMWh / 10  (c per kWh asked for)
  perHousehold,  // total / households
  unservedMWh, co2t, co2tPerMWh, supplyCents, saidiMin, saifi, maifi}   // copied for the face
   supply = sc.costDollars; outage = V.VCR * sc.lightsMWh; carbon = V.VER * co2tPriced
   (0 if nothing generated; askedMWh 0 -> cents 0)
grade(you, par, black) -> {points, letter, star}
   black -> {points: 0, letter: 'F', star: false}; par null or par.total <= 0 -> null
   points = Math.round(1000 * par.total / you.total); star = points >= 1000
   letter: the first of LETTERS whose min <= points
LETTERS = [['A', a], ['B', b], ['C', c], ['D', -Infinity]]
```
**Calibration (W4, one run, reported).** `tools/par.js` keeps `module.exports = {grade}` (the S-5
MWh letter `tools/baseline-v4.js` uses) and gains `--allin`, which grades with
`app/score.js`'s `grade` on rows extended with `servedMWh`, `lightsMWh`, `co2tPerMWh`,
`costDollars`, `saidiMin`, `saifi`, `maifi`. One run on `desk` and `desk-weekend`, 100 seeds each:
`a` so that S-5's accept carries over (competent ≥ 70% A, lean ≤ 40% A, commit-all loses A on
≥ 30%) and a 10-MWh shed on an otherwise par day stays an A; `b` and `c` so that, on the median
calibration day, par's day plus 150 MWh dark at VCR scores ≥ b and plus 600 MWh scores ≥ c. The
report gives a, b, c and the competent and lean A/B/C/D/F splits beside S-5's measured A71 B13 C2
D14.

**Par in the page (W4 fills `app/par.js`).** `createParRunner(seed, scenario, {storage}) →
{step(maxTicks) → done, done, score, series, at(s), progress, black}`. `step` never reads a clock:
it advances par by at most `maxTicks` ticks through `AP.runPar(seed, scenario, {state, memo,
untilTick: min(tick + chunk, end)})` calls in chunks of at least 500 ticks, creating its state on
the first step. It records par's `{costDollars, lightsMWh, servedMWh, co2tPerMWh, saidiMin, saifi,
maifi}` every 300 grid-s (`series`, 289 entries); `at(s)` returns those at grid second s, linear
between marks, null until par has passed s. Storage: one key, `gridwatch:v4:par` = `{v, seed,
scenarioId, score, series, black}` for the latest finished day only, through game.js's wrapped
`readJson`/`writeJson`; a matching key makes the runner finished at once. `resetDay` with the same
seed, scenario and `SIM_VERSION` keeps the current runner, finished or not. W4 fills
`game.end.parAllIn` and `grade` (in place) on the frame par finishes; a par day that went black
gives `grade = null`. `tests/score.test.js`: a runner stepped to 08:00 in 500-tick slices equals
one `AP.runPar(…, {untilTick})`; `allIn`/`grade` on the measured rows; the incentive order VCR
> PRICE_CAP > RERT price > DR price (shedding is never cheaper than the reserves).

**Face (W5).** Wording is fixed: no text calls ALL-IN or SUPPLY "what customers pay", "your bill"
or "the price"; prices come from `V.VCR` and `V.VER`, never typed in.
- **Header** `#chip-allin` (shown from TAKE THE DESK): `SCORE <n>` where n = `grade(allIn(yours
  so far), par.at(obs.s), black).points`, i.e. against par at the same grid time; `SCORE …` while
  `at()` is null; with par off, `ALL-IN <c>c`. Title and aria-label: "ALL-IN so far: <c> c/kWh
  (par <c>), SAIDI <m> min. The day's cost to the community per kWh the city asked for: supply +
  MWh dark × $30,000 (VCR) + CO₂ × $80 (VER). Not a price or a bill." Its inline "?" (anchor
  `chip-allin`) adds: "Customers pay the market price plus network and retail charges. Those
  charges, most of a bill, are the same whatever you do and are left out. VCR and VER are what
  regulators count an outage and a tonne as worth, not money anyone is paid." At 04:00 the chip
  equals the end card's score (a test). Both COST and ALL-IN use "c/kWh".
- **Briefing** `#briefing-goals` (≤ 60 words): "Keep the lights on, cheaply and cleanly. Your day
  is scored as one total: the cost of supply, plus $30,000 for each MWh the city goes without (the
  AER's value of customer reliability), plus $80 a tonne of CO₂ (the interim value of emissions
  reduction). Par, GRIDWATCH's own autopilot on this day, scores 1000; a smaller total scores
  more." `#briefing-how` gains "EXPLAIN (W), beside the alarms, holds the clock and explains each
  one."
- **End card:** the h2 stays first and unchanged ("Day over: 04:00." / "The grid went black.").
  Under it the score and letter (★ at 1000 or more). Then a YOU / PAR / Δ table:
  - SUPPLY (the COST chip): $ and c/kWh;
  - OUTAGES: <MWh> MWh dark × $30,000 (VCR);
  - CARBON: <t/MWh> t/MWh × <MWh asked> MWh = <co2tPriced> t × $80 (VER), and under it "your
    plants emitted <co2t> t; imports and dark load are counted at your mix";
  - ALL-IN: $, c/kWh and $ per household (title: "per household of the city's 1.9M
    (unverified); real networks also count businesses").
  Then "Biggest gap to par: <PART> +$<x>M (SUPPLY: more or dearer plant than par's; OUTAGES:
  <n> MWh dark at $30,000 each; CARBON: a dirtier mix than par's)", or "You beat par on all
  three." Then "Score = 1000 × par's ALL-IN ÷ yours. Par is GRIDWATCH's own autopilot on this
  same day." Then a RELIABILITY block (`id="end-reliability"`): line 1 "SAIDI <m> min · SAIFI <x>
  · MAIFI <y> per household today (par: SAIDI <m> min)"; line 2, when SAIDI > 0, "Each
  SAIDI-minute today cost customers about $<OUTAGES ÷ SAIDI>M at VCR. A distributor's STPIS would
  not count this shedding (?)", else "No household was off for more than 3 minutes." Its "?" is a
  button inside the card (`id="q-reliability"`, class `q inline`, `aria-controls="popover"`) that
  calls `toggleHelp(button, ['<the reliability entry's row title>'])`. Then the seed/hash line and
  both buttons.
  - Par computing: "PAR: computing… <n>%" in the score's place, redrawn when par arrives; par
    off: the player's ALL-IN and "PAR: off", no score. Black day: "The grid went black at HH:MM",
    the F at once, par's ALL-IN, no YOU column (the day was cut short). Par black: "par could not
    finish this day: no score".
- **Text** (`content/text.js`, on demand; new entries `ui: 'drawer'`, `params` naming `VCR`, `VER`,
  `SUSTAINED_INTERRUPTION_S` as they use them): the ALL-IN score (`game: 'chip-allin'`: the
  formula, VCR, VER, ISP/Reliability Panel practice, "not a bill"); the reliability readouts
  (`game: 'drawer'`: AER definitions, the 3-minute line, all outages vs normalised, a 2024
  customer's year — 115 min / 1.0 normalised, 394 min / 1.6 all outages —, how STPIS turns VCR
  into incentive rates (60/40 SAIDI/SAIFI, ±5% of revenue), cl. 3.3(a)(2)–(4), why the game counts
  them anyway, slice 2c's storm feeders as the real STPIS case); fix 'customer-cost' ("unserved
  energy is never priced" → never priced in CUSTOMER COST; the ALL-IN score prices it); append to
  'carbon-generation'.ours "In the ALL-IN score, every MWh the city asked for, imports and dark load
  included, is charged at this intensity." Append the new anchors to `content/anchors.js`.
- **SPEC §8** (W5, only these rows): §8.2 rows "ALL-IN carbon charges every MWh the city asked for
  at the region's own intensity", "Every MWh dark is valued at the NEM VCR, $30,000/MWh (2024
  dollars)", "The score divides par's ALL-IN by yours", "SAIDI, SAIFI and MAIFI count the shedding
  you cause, per household, in grid-minutes"; §8.1 rows for STPIS v2.0 (cl. 3.3, w = 1.5, ±5%),
  the Guideline's 3-minute line, the 2024 VCRs, the interim VER table ("H (value) / UNVERIFIED (no
  replacement)"), the 0.002% reliability standard, and the 2024 SAIDI/SAIFI averages — each with
  its URL from the research record.
- First-visit growth ≤ 2 KB (W5) and ≤ 1 KB (W4); `content/text.js` ≤ 17 KB gzip.

### 30.8 Done means (every agent)

- Your tests and the tests your change can affect pass (`npm run test:changed`; `--list` to see
  them). Never the whole suite in a loop; the integrator runs it once.
- No browser, no server. Headless checks through `tests/lib/play.js` / `tools/play.mjs` and the
  DOM stand-in. Statistics tools only where this contract says (W4: one golden re-record and one
  calibration run, `-j 4`).
- Test budget: a new or changed test file ≤ 6 s alone, a test ≤ 2.5 s. End-card tests set
  `state.over` and inject `par: {score}`; they never play to 04:00.
- Every press answers (Q-41/Q-42): blue for help, red only for refusals.
- First visit ≤ 400 KB gzip (`node tools/perf.mjs`); report your growth against your share.
- Commit in your worktree with plain-English subjects naming the Q ids; report what you measured,
  what you could not do, and every line you changed outside your region. Do not edit SPEC.md
  (W5: only the §8 rows) or this section.

### 30.9 Stage A record (2026-10-08) and what changes for the wave

Stage A merged as `eeec42c` (builder `wf_b1c8deb4-952`, two reviewers, one fix pass; 14 findings,
13 fixed, F3 rejected because `{do: 'ackTile', id}` already existed). Whole suite: 653 tests pass
in 31.5 s. First visit: 397.9 KB before, **390.6 KB after** (`content/text.js` −14.4 KB on demand,
`content/anchors.js` +1.2 KB, stage A's own code +5.6 KB: well over the share §30.1 implied).

Changes for the wave (they override §30.2–§30.7 where they differ):
- **W5's end card loads on demand.** `drawEnd` and its score face move into a new on-demand
  module `app/endcard.js` (`createEndCard(doc, root, actions, deps) → {update(vm), el}`), mounted
  into `#end-card` when the day ends, through `deps.endCard` (module, loader, or absent →
  `import('./endcard.js')`), the same pattern as the alarm panel; `tests/lib/play.js` and
  `tests/next.test.js` pass it statically (W5 may add those two lines). W5 adds `app/endcard.js`
  to `tests/budget.test.js`'s on-demand list with a 5 KB cap. W5's eager share is then ≤ 0.8 KB
  (the chip, the briefing text); the end card's text reads its prices from `V`.
- **W4 does not edit `app/game.js`:** stage A's `buildVm` already fills `game.end.parAllIn` and
  `grade` in place on the first frame par is done (a black par gives `grade = null`). `app/par.js`
  already exports `PAR_MARK_S = 300` and `seriesAt(series, s)`; W4's runner reuses them. An
  injected object with a `step()` is used as the runner itself; any other object is a finished
  runner (`{score, series?, black?, at?}`).
- **W1's tile press** records the pick with `{do: 'alarmsPick', id}` while the panel is closed
  (stage A added it; `ALARMS_PICK_MS = 6000`), and selects with `{do: 'alarmsSel', id}` while it
  is open (ignored when closed).
- **Keys:** with the panel open any desk key closes it first (as GO TO), with the focus inside the
  panel too, except the panel's own keys inside it, the keep list (`PANEL_KEEPS` in
  `app/shell.js`: Esc, Space, W, A, Shift+A, ?, `,`, Shift+M, F) and keys inside SETTINGS.
- **Budget after the wave:** about 394 KB if every agent stays inside its share, leaving about
  6 KB for slices 2b–2e. Risk 11 is eased, not closed; the integrator records the measured figure.

---

# Slice 2b: the city levers (contract)

## 31. The city levers: HOT WATER SOAK at noon, AIR-CON CYCLE in the evening (contract, 2026-10-09)

The owner, 2026-10-09: "let's go with the next feature please". By the Phase 2 slice table that
is **2b, the city levers**: SPEC U-1 (six suburbs), U-2 (levers; Phase 2 ships HOT WATER SOAK
and AIR-CON CYCLE with pre-cool), U-3 (flex on the Live Stack), U-4 (patience), U-6 (customer
cost) and S-14 rules 1 and 5 (par soaks on an MSL1 forecast; par aims evening flex at the
operational peak).

How we read it (workflow `wf_29727424-408`: seven readers and two critics; reports kept in the
session scratchpad, `u2b/`):
- **The model already has its slots.** P-1's `flex` term (`sim/weather.js`, built as 0),
  `score.cost.flex` (`sim/market.js`, never accrued), the forecast that every consumer reads,
  and the S-4 barrier that makes par read `observe()` only.
- **Flex goes into operational demand and the forecast, nowhere else (Q-50).** Then the blue
  SURPLUS run, the gaps, the price, the MSL notices, par's plan and the objective line all
  answer a booking the next frame, with no second term to keep in step. desk/README §28's line
  "any new C-6 term (2b's soak, air-con cycling) goes into `surplusMW`, `app/planview.js` and
  this row" is **superseded**: a second term would count the flex twice. Only the test row
  stays (blue with a soak booked).
- **True-scale flex is too small to see.** At the 1280×600 floor the stack is about 63 MW a
  pixel; one suburb's air-con relief is under a pixel and its snapback under half. So the stack
  marks blocks with a minimum-height band and a code, and the card says the rebound in words.
- **The first visit cannot hold 2b as things stand.** 5,212 B are left; 2b costs about 6.5–9 KB
  eager even written tersely (2a's yardstick: 20–26 B of gzip per net line of sim code, 54 B per
  params record). 154 KB of the 395 KB first visit is comments (Q-49).
- **The spec has gaps 2b must close:** who picks the levers by day type; the soak cap
  contradicts itself (U-2 "cap", U-4 "−15 if exceeded"; a full tank cannot take more); the
  soak's "credit" has no value and any positive value double counts the night fuel the sim
  already saves; when and where "that night's heating falls"; pre-cool optional or not; patience
  recovery erases start patience by mid-afternoon; the ticker and the petition have no surface
  until U-8. Decisions Q-49–Q-60 close them.

Realism, checked (spec-realism report; sources go to SPEC §8.1 at stage C):
- **Hot water.** SA Power Networks' solar sponge was 10:00–15:00 (now 09:30–16:30 from 1 Jul
  2025); Ausgrid and Powercor moved controlled load to daytime in 2024–25. Scaling the UNSW/PLUS
  ES estimate (10.5 GWh/day shiftable across the NEM, ~4 M tanks) to 1.9 M households gives
  about 2 GWh/day, against U-2's 1.9 GWh: the soak MW and the cap are plausible. AEMO's MSL
  framework calls on controlled load at **MSL3**; DNSPs also turn hot water on in MSL events.
  A soak par books at MSL1 is foresight, labelled.
- **Air-con.** PeakSmart: 155,738 air-cons, 107 MW at a 50% cap, events about 16:00–19:00.
  Measured snapback is 17–35% of the event energy (SDG&E 2008) to about 40–50% (SCE 2019), and
  front-loaded; U-2's 60% is the top of the field. Relief exists only where air-cons run, and a
  MILD day (P-3) has removed its cooling load.
- **Patience.** Opt-outs are real: 0.3% for the SA hot-water trial, about 13% thermostat
  overrides that grow with event length. The magnitudes are game tuning (U-4 says so).

### 31.1 Decisions (owner-delegated, "most fun within realism"; SPEC §9.1 at stage C)

| # | Decision | Why |
|---|---|---|
| **Q-49** | **Budget: prose leaves the shipped files before the wave.** Stage A moves the leading header comment of the ten largest first-visit files (`sim/autopilot.js`, `sim/physics.js`, `app/objective.js`, `desk/desk.js`, `render/map.js`, `render/livestack.js`, `sim/grid.js`, `app/keys.js`, `sim/params.js`, `app/alarms.js`; about 16.0 KB gzip) into the READMEs, each file keeping its first line and a pointer; `app/perf.js` loads on demand under `?perf` (−1.8 KB). F-11 stays 400 KB. Every 2b agent writes **terse** code (one-line comments, params notes ≤ 80 characters, the reasoning in the READMEs) and keeps to its eager share (§31.2). | Keeps F-11 literally true with no build step (C-1) and no change the player can see, and leaves about 14 KB for 2c–2e. Raising F-11 stays the owner's call if they would rather keep the headers in the files. |
| **Q-50** | **Flex is operational demand.** A booked block's MW is added to `env.demandMW` and to the forecast's P50/P10/P90 (P-1: op = U × heat + flex − R + noise), and to nothing else. It is never in `underlyingMW` and never unserved (S-1): a dark district's flex simply stops, suburb by suburb. | Every press answers on instruments the player already reads: blue shrinks, a gap closes, the MSL card clears. One term, so nothing double counts. |
| **Q-51** | **The menu by day type:** HOT WATER SOAK every day; AIR-CON CYCLE on HOT days only (a heatwave reads HOT). Data in the scenario (`levers.menu`), keyed by `day.temp`; the director (2c) may take it over. | A MILD day has no cooling load to relieve (P-3 removed it), so the lever would relieve load that is not there. MILD days become a belly puzzle and HOT days an evening one, and a stranger sees one or two levers a day (U-2's "≤ 3, by day type"). |
| **Q-52** | **HOT WATER SOAK:** one block per suburb per day, **4 h**, starting 10:00–11:00 on a 5-minute mark (the 10:00–15:00 window), 15-min ramps, at the suburb's U-1 MW (no patience factor: the tanks are switched by relay). **That night's heating falls by the booked energy, spread over 22:00–04:00** (simplified: it ignores standing losses and districts dark during the soak). No patience cost, no payment (SOAK_PRICE 0). A booking can be cancelled until its first MW, not after. The 1.9-GWh cap is structural: six 4-h blocks are 1.8 GWh delivered, so there is no cap bookkeeping and no "−15". | The real choice is how much of noon's spill goes into tanks rather than the battery, and the soak's reward arrives as the night fuel the sim saves. No credit, so nothing is counted twice and the lever does not always pay. A fixed block lets the player decide by suburb, without a form. |
| **Q-53** | **AIR-CON CYCLE (pre-cool bundled):** relief **1.5 h** at the suburb's U-1 MW × its response, starting 15:00–19:30 on a 5-minute mark (ending by 21:00). Pre-cool always runs in the hour before (+50% of the relieved energy). The **snapback returns 40% of the relieved energy over the 1.5 h after, front-loaded** (falling linearly). 15-min ramps. A suburb may be cycled again once its last relief has ended (a later cycle's pre-cool may run over the earlier snapback; so two cycles fit when the first starts by 17:00), if its patience allows. Customers are paid $400/MWh of relief delivered (lit). A booking can be cancelled until its pre-cool starts, not after. | Aim is the decision: centred on the operational peak (19:30 on the measured days) the snapback lands after it; centred on the pre-PV peak (18:40–18:55) it lands on it. 40% is inside the measured 17–50% and still punishes a bad aim. A bundled pre-cool removes an option that was strictly worse as written. |
| **Q-54** | **Patience:** each suburb starts at its U-1 value. An air-con booking costs 10, plus 5 for each air-con block that suburb has booked at the time; a soak costs 0. An air-con booking delivers × (PATIENCE_FULL + p) / (2 · PATIENCE_FULL) (= 0.5 + p/100) when the suburb's patience p before it is below 50; `effMW` is fixed at booking. The suburb's air-con is locked while its patience is below 25. A cancel refunds that block's own stored cost (so a refund can lift a lock, and a re-booking is priced afresh). Every change is a `PATIENCE` record with its cause. **No recovery, no petition and no ticker in 2b:** recovery moves to W-2 (Week mode, where it matters across days); the petition and U-4's "≥ 3 ticker lines" move to U-8 (the ticker, Phase 3). | Patience bites on a second cycle (a suburb fits two in the window): Tallowood (40) delivers 90% the first time and 80% the second, and ends the day at 15; Harbourside (50) delivers 100% then 90%. "+5 per idle hour" from 04:30 would erase every start value by 16:30. |
| **Q-55** | **Costs (U-6):** `AIRCON_PRICE` $400/MWh relieved, `SOAK_PRICE` $0, both labelled simplified. The Phase 3 rows (EV, VPP, backstop) are not added until their levers are. Pre-cool and snapback energy is bought like any other load. | The ladder reads AIR-CON $400 < DR $1,400 < RERT $16,000 < VCR $30,000. Air-con loses money against a running gas turbine, so it is a reliability tool, not a habit. |
| **Q-56** | **The suburb card.** A click on any suburb (or Enter on a keyboard-hovered suburb, or **H**) opens its card on the left of the map; it loads on demand (Q-44 pattern). It shows the suburb's name, households, personality line, patience, its draw and its roofs (the old click label), one row per offered lever: each booked block of it (times, the consequence in words, and CANCEL until it is under way), then, while a booking is possible, the aim for the next one (◀ ▶ 15-min steps inside `[fromS, toS]`, BOOK, its MW and cost). The consequence: tonight's heating fall for the soak; pre-cool, snapback, payment and patience for air-con. For air-con a verdict line (§31.9.4). **A booked block is never moved in place:** CANCEL, re-aim, BOOK. A click on a suburb with dark districts keeps Q-42 (it focuses the RESTORE bay) and also opens the card, which shows an "n DARK: RESTORE" line first without taking the focus. The card does not hold the clock and hides during the watch (§31.9.3). It never sends in the briefing, the watch or after the day: those answer in blue. | One place per suburb, reachable by mouse and keyboard, and one press per lever with the aim pre-filled. The verdict line carries U-2's rebound lesson that the stack cannot draw. |
| **Q-57** | **Stack and map.** The skyline carries flex already (Q-50). Each booked block adds a band at least 4 px tall along the skyline over its core, in one "city flex" pattern with the suburb's code; pre-cool, snapback and the night fall are dashed ghosts. **No drag in time in 2b** (the card's steps do it; U-3's drag waits for 2d or Phase 3). **No suburb colours** (twelve layer and four status colours are taken; K-22 needs a pattern and a code anyway). The map shows a booked mark on a suburb and its patience when below 50, and glows a suburb the objective names. | Readable at the floor without adding hues; the band says where the block is, the skyline says what it does. |
| **Q-58** | **Par (S-14 rules 1 and 5), narrow.** Rule 1 sits first in `rule6`: on the MSL1 notice (`obs.msl.level ≥ 1 && obs.msl.atS > obs.s`) it soaks the offered, free suburb with the most effective soak MW, aimed at the forecast minimum, one suburb per decision while the notice stands. Rule 5 sits in `rule8`, after its present-gap DR branch and before `armRERT`: when the walk is short in the evening and air-con is offered, it cycles the free suburb with the most effective relief, aimed at the operational peak of the no-flex line, one per decision, and re-walks before arming RERT. Origins stay `rule6` and `rule8`. Par does not soak on spill alone. | Par stays a fair reference: a stranger who never opens the card is not punished, and a player who soaks noon's spill earns a reachable edge (about +5 ALL-IN points on a spill day). |
| **Q-59** | **The objective line names the levers.** A new kind `city`: a soak line beside `battery` when a spill run or an MSL1 notice lies ahead in the soak window and an offered suburb is free; an air-con branch inside `shortAhead`, before DR. Targets are `suburb-<ID>`; `action` is the full `flex` input. | Before 2e's introductions, the line is the only way a stranger learns the card exists. It offers air-con only against a shortfall, never as an evening habit, so it does not teach a points trap. |
| **Q-60** | **The tray.** The MSL1 and MSL2 cards name the soak and carry a SUBURBS button that opens the card (presentation only, K-9). `PATIENCE` and `FLEX_*` records go to the LOG through a new log-only route; a suburb locking is an info card. | The notice says the one thing this desk can do about it (P-4), and U-4's "every change logs a cause" is visible. |

### 31.2 Who builds what, and in what order

Stage A (`base`) ends like 2a's: the integrator merges `2b-base` into `city-levers`, bumps
`SIM_VERSION` to `v4-core-2b.0` (the shapes, neutral values) and re-records the golden, so wave 1
(`sim`) starts green. Wave 1 adds no state field, so on CLASSIC its golden cells, hashes
included, stay those of `v4-core-2b.0`. Then wave 2 runs four agents in parallel on the merged
sim. Stage C integrates, measures and does the one browser pass. Every
agent works in its own worktree **fast-forwarded to the branch it builds on** (agent worktrees
branch from `main`: `git merge --ff-only <branch>` first) and commits on a named branch.

| Owner | Builds on | Files (region) | Eager share |
|---|---|---|---|
| **base** (stage A) | `city-levers` | Q-49 header moves (the ten files' leading comments → `sim/README.md` §11 for sim files, desk/README §31.8 for the others) and `app/perf.js` on demand (`app/shell.js`, `tests/budget.test.js`, `tests/next.test.js`, `tests/lib/play.js`); `content/scenarios.js` (`levers`); `sim/params.js` (2b block); `sim/step.js` (state, `SHAPES`, `'suburb'` kind, `observe()` keys); `sim/grid.js` (the two `applyCommand` cases, refusing); `sim/weather.js` (`flexParts`, `flexAt`, zero columns); `sim/autopilot.js` (`aimFlex` only); `app/game.js` (§31.3.8); `app/keys.js` (H); `app/shell.js` (`KIND_WORD`, card mount, `closeTop`); `next.html` (`#suburb-card`); new `app/suburbcard.js` (stub); lists in `tests/state.test.js`, `tests/integration.test.js`, `tests/lib/follow.js`, `tests/next.test.js`, `tools/baseline-v4.js`; `sim/README.md` §5–§8; desk/README §5 ids | ≤ 1.5 KB net of the trims |
| **sim** (wave 1) | `2b-base` | `sim/weather.js`, `sim/fleet.js`, `sim/physics.js`, `sim/grid.js`, `sim/market.js`, `sim/events.js`, `sim/step.js` (fills only), `sim/README.md`; new `tests/levers.test.js`; deliberate edits in `tests/rooftop.test.js`, `tests/state.test.js`, `tests/market.test.js`, `tests/score.test.js`, `tests/belly.test.js` | ≤ 3.0 KB |
| **par** (wave 2) | `city-levers` after the merge | `sim/autopilot.js` (rules; `aimFlex`'s body only if a bug), `app/system.js` (`commitSig`), `tools/par.js` (counters); new `tests/par-levers.test.js`; deliberate edits in `tests/autopilot.test.js`, `tests/system.test.js` | ≤ 1.2 KB |
| **view** (wave 2) | same | `render/map.js`, `render/mapdata.js`, `render/livestack.js`, `app/planview.js` (only if a helper is needed); new `tests/city-view.test.js`; edits in `tests/map.test.js` (the lit-suburb line), `tests/livestack.test.js`, `tests/feedback.test.js` (the two suburb-click lines only) | ≤ 1.4 KB |
| **card** (wave 2) | same | `app/suburbcard.js` (fill), `app/shell.js` (the card's mount, own keys, focus; nothing else), `next.html` (card CSS), `app/tray.js`, `content/text.js` (+ its cap), `content/anchors.js` (append), `tests/lib/play.js`, `tools/play.mjs`, `tools/README.md`; new `tests/card.test.js`, new `tests/feedback-city.test.js`; edits in `tests/alarms.test.js` (the MSL card lines), `tests/honesty.test.js` (suburb names), `tests/budget.test.js` (caps), `tests/help.test.js`, `tests/keys.test.js` | ≤ 0.8 KB (the rest on demand) |
| **objective** (wave 2) | same | `app/objective.js`, `tools/follow.mjs`; new `tests/objective-levers.test.js`; edits in `tests/objective.test.js` (kind lists), `tests/seams.test.js` (kind list), `tests/system.test.js` (`PLAN_COST_KEYS` line only) | ≤ 1.0 KB |
| **integrator** (stage C) | all | merges, `SIM_VERSION`, golden, SPEC.md, desk/README §31.10–§31.11, tools runs, browser pass | — |

Rules for all: never change a §31.3 shape (a needed change is reported, and the integrator
amends this section); never touch another owner's file or region (if you must, one line, named
in your report). New tests go in your own new file; edit an existing test only to repair an
assertion your change breaks deliberately, naming the line. Pre-existing overruns
(`feedback.test.js` 7.6 s alone, `integration.test.js` 6.3 s, `objective.test.js` 6.0 s, the
K-8 accept in `alarms.test.js`) are exempt unless you add time to them: add only list entries
there.

### 31.3 The shared shapes (stage A makes every one real; nobody changes them later)

**31.3.1 Scenario data** (`content/scenarios.js`). `DESK` (and so `DESK_WEEKEND`) gains a
top-level `levers`; `CLASSIC` gets an explicit `levers: null` (no code infers "none" from
absence). Suburbs in the city's order, keyed by id:
```js
levers: {
  menu: {MILD: ['soak'], HOT: ['soak', 'aircon']},
  suburbs: [
    {id: 'SOL', soakMW: 60, airconMW: 25, patience: 70},
    {id: 'HAZ', soakMW: 140, airconMW: 15, patience: 90},
    {id: 'RED', soakMW: 110, airconMW: 45, patience: 60},
    {id: 'HAR', soakMW: 20, airconMW: 40, patience: 50},
    {id: 'TAL', soakMW: 90, airconMW: 15, patience: 40},
    {id: 'SAL', soakMW: 60, airconMW: 10, patience: 80},
  ],
},
```
The suburbs' personality lines (U-1) live with the card's texts (on demand), not here.

**31.3.2 Params** (`sim/params.js`, a `// ---- phase 2b "levers" (desk/README §31)` block after
the 2a block). Clock times as unwrapped hours with derived seconds after 04:00, as
`PLAYER_START_H` / `PLAYER_START_S` are. Every derived time is a multiple of `FC_STEP_S`. Notes
≤ 80 characters; the reasons live here in §31.1.

| Key | Value | Kind |
|---|---|---|
| `FLEX_RAMP_S` | 900 | simplified (switch-on diversity; trials randomise 15–60 min) |
| `SOAK_FROM_H`, `SOAK_TO_H` → `_S` | 10, 15 | src SAPN solar sponge window |
| `SOAK_S` | 14,400 | simplified (4 h × 480 MW ≈ U-2's 1.9-GWh cap) |
| `SOAK_NIGHT_FROM_H`, `SOAK_NIGHT_TO_H` → `_S` | 22, 28 | simplified (night heating, inside the sim day) |
| `AIRCON_FROM_H`, `AIRCON_TO_H` → `_S` | 15, 21 | simplified (relief window) |
| `AIRCON_S` | 5,400 | U-2 (≤ 1.5 h) |
| `PRECOOL_S`, `PRECOOL_FRAC` | 3,600, 0.5 | U-2; unverified |
| `SNAPBACK_S`, `SNAPBACK_FRAC` | 5,400, 0.4 | src SDG&E 2008 / SCE 2019 (17–50%) |
| `PATIENCE_AIRCON`, `PATIENCE_REPEAT` | 10, 5 | U-4 (game) |
| `PATIENCE_FULL`, `PATIENCE_LOCK` | 50, 25 | U-4 (game) |
| `SOAK_PRICE`, `AIRCON_PRICE` | 0, 400 | U-6, simplified |

**31.3.3 State** (`createState`; plain JSON, fixed keys, sparse):
```
levers: {rev: 0, patience: [nSub], blocks: []}   // [] arrays on CLASSIC
  block: {suburb: 'HAZ', lever: 'soak' | 'aircon', atS, endS, effMW, cost}   // cost: the patience it took
         sorted by (atS, suburb's city index, lever); atS/endS: core start/end (s after 04:00)
env.flexMW            // present flex, as if every district were lit (signed)
env.flexSubMW[nSub]   // the same per suburb
env.reliefSubMW[nSub] // ≥ 0: the core air-con relief alone, per suburb (what is paid)
city.flexDarkMW       // Σ over dark districts of their suburb's flex share (fleet's district loop)
```
`rev` rises on every accepted booking or cancel. A suburb's next air-con cost counts its
air-con blocks in `blocks` (a cancel removes one). Locked is derived (patience < `PATIENCE_LOCK`);
there is no lock flag.

**31.3.4 Invariants** (wave 1 proves each in `tests/levers.test.js`):
- **I1 (P-1):** `env.demandMW = env.underlyingMW + env.flexMW − env.rooftopMW − smelterGap`
  every grid second, in that association order (exact when flex is 0).
- **I2 (S-1):** unserved accrues on `G0 × shedFrac`, where `G0 = fleet.baseLoadMW(state) =
  env.demandMW + env.rooftopMW − env.flexMW`. Every site that computes `G` today uses the one
  helper.
- **I3 (P-12):** a district's flex share is `flexShare = env.flexSubMW[sub] · roofFrac` (signed;
  `roofFrac` = 1 / the suburb's district count, fleet.js). `city.flexDarkMW` = Σ over dark
  districts of `flexShare`, kept in `fleet.refreshRoof`'s loop. A dark district's flex stops and
  resumes at relight only through the fall of `flexDarkMW`. Lit demand is the lit districts' net
  load plus `env.flexMW − city.flexDarkMW`. `fleet.districtColdLoadMW` adds `flexShare` in both
  branches (lit: `G0·share + flexShare − roof…`; dark: `G0·share (× the cold factor) +
  flexShare`), and the restore surge (grid.js and the preview's, physics.js) is
  `max(0, coldMW − G0·share − flexShare)`: only the cold factor is surge, the whole pickup is
  `coldMW`. So the R5 permissive, the `restore` record, the preview's `lostMW` and
  `obs.districts[].coldLoadMW` all show the true pickup. The UFLS record adds `ΔflexDarkMW`; the
  preview's shed baseline adds `BK.flexDarkMW − city.flexDarkMW`. desk/README §19.2's cold-load
  line is amended to match.
- **I3b (previews leave no trace):** `city.flexDarkMW` (and any field the new code in
  `setDistrictDark`/`refreshRoof` writes) joins physics.js's backup `BK`, `save()` and
  `restore()`. In the preview, G is taken from the backup (`BK.demandMW + env.rooftopMW −
  env.flexMW`), not `baseLoadMW(state)` (a guard override has already offset `env.demandMW`).
  Test: with a soak core and an air-con core under way and a district of each suburb dark (one
  relit and waiting), every preview kind of belly.test.js, a unit preview that operates UFLS and
  `grid.restorePermissive(s, d, {preview: true})` each leave `hashState` and the JSON unchanged,
  and caught sums to `lostMW`.
- **I4 (neutral):** on `CLASSIC`, and on any day with no block, every value except the state
  hash is bit-identical to `b6bd6c2`.
- **I5 (the forecast):** `forecast.flexMW[k]` is the booked flex at column time
  `fromS + (k + 1) · stepS` (the convention every consumer uses; a reader got it 5 minutes
  wrong). `demandP50/P10/P90` include it; `underlyingP50` does not. `dayAhead` the same.
- **I6 (U-3):** each part's integral equals its §31.3.5 energy within 1%, on the sim's knots
  and on the forecast columns.

**31.3.5 Shapes of a block** (the sim is their only author). `flexParts(block, effMW)` →
`[{kind, knots: [[s, mw], …]}]`, exported pure from `sim/weather.js`; every knot on the 300-s
lattice, every part starts and ends at 0 MW. `R = FLEX_RAMP_S`.

| Lever | Part | Knots | Energy |
|---|---|---|---|
| soak | `core` (+) | atS:0 → atS+R:M → endS−R:M → endS:0 (endS = atS + SOAK_S) | E = M·(SOAK_S − R) |
| soak | `night` (−) | 22:00:0 → +R:−D → 04:00−R:−D → 04:00:0 | −E (D from E) |
| aircon | `precool` (+) | atS−PRECOOL_S:0 → +R:P → atS−R:P → atS:0 | PRECOOL_FRAC · Er |
| aircon | `core` (−) | atS:0 → atS+R:−M → endS−R:−M → endS:0 (endS = atS + AIRCON_S) | −Er, Er = M·(AIRCON_S − R) |
| aircon | `snapback` (+) | endS:0 → endS+R:S → endS+SNAPBACK_S:0 | SNAPBACK_FRAC · Er |

`flexAt(blocks, s, suburb = '', kind = '') → MW` sums the parts of `blocks` at `s` in their
sorted order, filtered by suburb id and part kind (`''` = all), without allocating:
`env.flexMW` and `forecast.flexMW[k]` use `flexAt(blocks, s)`, `flexSubMW[i]` uses
`flexAt(blocks, s, id)`, `reliefSubMW[i]` is `−flexAt(blocks, s, id, 'core')` over air-con
blocks (or with a lever filter, the sim's choice; keep the signature compatible). A block is **under way** from its
first knot (soak: `atS`; air-con: `atS − PRECOOL_S`).

**31.3.6 Inputs** (`SHAPES`, sim/README §6):
```
flex    {suburb: 'suburb', lever: ['soak', 'aircon'], atS: 'second'}
flexDel {suburb: 'suburb', lever: ['soak', 'aircon'], atS: 'second'}
```
- A new arg kind `'suburb'`: an id in `state.scn.city.suburbs`, a shape check only, like
  `'district'`. A scenario with `levers: null` (CLASSIC) is refused in `grid.applyCommand` as not
  offered, so `applyInput`'s over-day and watch refusals come first on every scenario.
- **No rewrites:** `atS` off the 5-minute lattice is refused, never snapped (so replay is a fixed
  point). `effMW` = U-1 MW × response is computed at booking and stored; the log holds only the
  input.
- Refused (exact strings fixed by wave 1 and listed in sim/README §6; stage A refuses both with
  `'levers are wired in wave 1'`): before 04:30; not offered today; locked; soak already booked;
  off the lattice or outside the window; too late (its first knot would be in the past);
  overlaps another air-con block of that suburb (for any two, the later's `atS − PRECOOL_S` must
  be ≥ the earlier's `endS`, whatever the booking order); `flexDel` of no such block; `flexDel`
  under way. The
  watch's and the over-day's refusals stay `applyInput`'s.
- In `REDISPATCH_AFTER` (`app/game.js`, `tests/lib/follow.js`, `tests/next.test.js`, together).
  **Not** in `app/system.js` `EDITS` or `HAND_EDITS`, **not** in `FUZZ_TYPES`. In
  `tests/integration.test.js` (`INPUT_TYPES`, the watch's tries, malformed examples) and in
  `tools/baseline-v4.js`'s tries.

**31.3.7 `observe()`** (`OBS_SHAPE` and sim/README §8 change together):
```
demand:   + flexMW                       (after unservedMW; = env.flexMW)
forecast: + flexMW[]                     (after rooftopMW; dayAhead the same)
levers:   (new, after day)
  {rev, offered: ['soak', …],
   suburbs: [{id, patience, soak: LV, aircon: LV}],          // city order; [] on CLASSIC
   blocks:  [{suburb, lever, atS, endS, effMW, cost, del, parts: [{kind, knots}]}]}
  del: '' when a flexDel of that block would pass grid's checks now, else the exact refusal
       (the watch's and the day over's stay applyInput's, as for block: 2b final review D7)
  LV = {mw, cost, fromS, toS, block}
```
- `mw`: what a booking now would deliver (U-1 MW × response); `cost`: the patience it would
  cost; `fromS`/`toS`: the earliest and latest `atS` a booking now may take (on the lattice; −1
  when none); `block`: `''` when a booking in `[fromS, toS]` would be accepted, else the exact
  reason one would be refused (the watch and the day over left to applyInput, §31.11). **The card,
  par and the objective check eligibility only through
  `block`, `fromS` and `toS`**, never by re-deriving the rules.
- No field may derive from `ext` (S-4).

**31.3.8 The app's side** (stage A, complete):
- `G.ui {do: 'suburb', id}`: an id opens that card (or switches to it) and never closes it;
  `id: null` closes it; with no `id` key (H) it toggles: closed → open the suburb `vm.glow`
  names (`suburb-<ID>`), else the last opened, else the first in city order. With the alarm
  panel open it closes the panel as GO TO does, then opens the card.
- `G.ui {do: 'focus', target: 'suburb-<ID>'}` opens that card. The map's hover sends
  `{do: 'hover', target: 'suburb-<ID>'}`.
- `vm.suburb`: the open card's id or `null`, cleared in `resetDay`. (No `vm.hist.flex`:
  dropped, §31.9.14.) `vm.dayAhead`: the
  game's latest forecast to 04:00 (`game.dayAhead`; `null` until the line first runs).
- Ids (desk/README §5's list gains them): `suburb-<ID>` (a suburb on the map, and its card),
  `city-<ID>-soak`, `city-<ID>-aircon` (the card's presses), `suburb-card` (the container).
- The objective's kind `city` has a `KIND_WORD` entry in `app/shell.js` (a glyph the charset
  test allows) and is listed in desk/README §19.5.
- **H** opens and closes the card (`app/keys.js`, `{ui: {do: 'suburb'}}`; documented in the
  keys header, desk/README §13.3 and SPEC K-23 at stage C). H, I, J and Y were the free letters.
- `#suburb-card` in `next.html`: `role="dialog"`, hidden, on the left of the map region (the
  drawer covers the right), z-index 11 (below the respond card's 12), not class `card` (the
  `placeQs` trap). The shell mounts it like the alarm panel: `drawSuburbCard(vm)` through
  `lazy(o.suburbCard, () => import('./suburbcard.js'), …)`, "Loading…" until it arrives. `closeTop`
  learns it: popover → settings → drawer → alarm panel → **suburb card** → desk note.
- `app/suburbcard.js` exports `createSuburbCard(doc, root, actions, deps) → {update(vm), el}`.
  Stage A's stub shows the suburb's name and a ✕; wave 2's card fills it. `tests/budget.test.js`
  names it on demand with a 6-KB cap; `tests/lib/play.js` and `tests/next.test.js` pass it
  statically.
- **Inputs never go out from the card in the briefing** (a pre-existing bug: an accepted input in
  the briefing defeats a HAND choice; its own task).

**31.3.9 Records** (sim/README §7): `{tick, kind: 'log', sev, code, msg, …}` with
- `FLEX_BOOK` (info): `suburb, lever, atS, endS, effMW`;
- `FLEX_DEL` (info): `suburb, lever, atS`;
- `PATIENCE` (info): `suburb, patience, delta, cause` (`'aircon'` or `'cancel'`);
- `PATIENCE_LOCK` (info): `suburb, patience`.
`news[]` stays weather only.

**31.3.10 Aim** (`sim/autopilot.js`, pure, stage A complete): `aimFlex(fc, lv, id, lever) → atS
| −1`, where `fc` is any forecast object (`obs.forecast` or `dayAhead`) and `lv` is
`obs.levers`. **The line it aims on** is `demandP50` less this suburb's own blocks of this lever
(their `parts` interpolated at the column times), so other suburbs' booked flex counts and a
second suburb aims at the peak (or the minimum) that is left: snapbacks do not stack. Only
columns whose time `fc.fromS + (k + 1)·fc.stepS` lies inside the lever's window are searched
(soak 10:00–15:00, air-con 15:00–21:00). Soak: centre the 4-h core on the lowest such column;
air-con: centre the relief on the highest. Round to the lattice (`Math.round(x / V.FC_STEP_S) ·
V.FC_STEP_S`) and clamp to that lever's `[fromS, toS]`. Return −1 when `block` is not `''`, when
no column of `fc` is inside the window, or when the extreme is `fc`'s last column while the
window runs past it (not yet in view: objective.js's `rising` test). Callers read −1 as "not
now". Par aims over `obs.forecast` (it holds no day-ahead after its plan); the card and the
objective over `vm.dayAhead || obs.forecast`.

**31.3.11 Redraw and re-flow keys.** `render/livestack.js` `signature()` and `app/system.js`
`commitSig` include `obs.levers.rev`. The map's per-frame overlay reads `vm.suburb` and the
levers block, never the cached city layers' keys.

**31.3.12 Money** (wave 1, `sim/market.js` `settleSecond`): `cost.flex += Σ_i
env.reliefSubMW[i] · (lit districts of suburb i ÷ its districts) · h · AIRCON_PRICE`, the lit
count taken in `settleSecond`'s own per-second district loop with a module scratch array (no
allocation; `splitShed`'s precedent). The soak term is omitted while `SOAK_PRICE` is 0 (pricing
it later needs its own field). Pre-cool and snapback energy is bought as load. `tests/score.test.js`'s ladder gains `DR_PRICE >
AIRCON_PRICE > SOAK_PRICE`.

**31.3.13 Versions.** Nobody but the integrator bumps `SIM_VERSION` or re-records the golden.
After stage A + wave 1: `v4-core-2b.0`, golden re-recorded (masked diff: hash cells, the build
line, section 1's input-types row, the first-visit line). CLASSIC stays lever-free, so no other
cell may move; if one does, it is a bug.

### 31.4 Stage A (base): steps, in commits

1. **Q-49.** Move the ten headers (each file keeps its first line plus `// Contract: <README
   §>.`); `app/perf.js` on demand (`ON_DEMAND` entry with its cap; `tests/next.test.js` and
   `tests/lib/play.js` pass `deps.perf` statically). Measure with `node tools/perf.mjs` before
   and after and put both figures in the commit message. Nothing else in this commit.
2. Scenario data and params (§31.3.1–§31.3.2).
3. State, `SHAPES`, the `'suburb'` kind, the refusing `applyCommand` cases, `observe()` keys
   with neutral values (`levers.suburbs[].*.block = 'levers are wired in wave 1'`, `fromS`/`toS`
   −1, `flexMW` 0 and zero columns), `flexParts`/`flexAt` complete and unit-tested, `aimFlex`
   complete and unit-tested, the test-list edits, sim/README §5–§8.
4. The app's side (§31.3.8), with a test that H, a map-style `{do:'suburb', id}`, a second press
   and Esc open and close the stub card, and that `focus suburb-HAZ` opens it.
5. Gate: `node --test` once; `tests/baseline-v4.test.js` may fail **only** on the hash cells
   (check the masked diff with `node tools/baseline-v4.js --quick`, desk/README §22) and say so.

### 31.5 Wave 1 (sim)

Make the levers real in the sim and nowhere else: I1–I6, the refusals, patience and its
records, `observe()`'s `levers` filled (`mw`, `cost`, `fromS`, `toS`, `block`, `parts`),
`demand.flexMW` and the forecast columns, `cost.flex`. Per-tick code allocates nothing and
loops no districts (the district sum belongs in fleet's existing per-second district loop).
`tests/levers.test.js` (≤ 6 s alone) covers: I1–I6; a dark district's soak stops and is not
unserved; cost on lit relief only; each refusal string; patience scaling, lock and refund, each
change a `PATIENCE` record; replay of a day with bookings and cancels is bit-identical; a soak
booked on a mild noon shrinks `wind.autoMW + solar.autoMW` (the blue row of desk/README §28);
the forecast minimum rises by the soak and the MSL notice can clear; CLASSIC neutral (I4).

### 31.6 Wave 2

**par.** S-14 rules 1 and 5 as Q-58 says, aimed with `aimFlex`; `litDayAhead` adds booked flex
beyond the 4.5-h window from `obs.levers.blocks` (its heat uplift never multiplies flex); memo
flags are plain JSON and tolerated when absent; `commitSig` gains `obs.levers.rev`;
`tools/par.js` rows gain `flexDollars`, `soakMWh`, `reliefMWh`, `soakDays`, `airconDays`.
`tests/par-levers.test.js`: each rule fires on a poked observation and not otherwise, aims
where §31.3.10 says, books only through `block === ''`, respects pace, never in a watch; the
`/^rule[1-9]$/` origins hold. Deliberate edits to the exact `decide()` assertions in
`tests/autopilot.test.js`, named. Do not run `tools/par.js` over many seeds (the integrator
does, once).

**view.** The map: a click on any suburb sends `{do: 'suburb', id}`; Enter on a
keyboard-hovered suburb the same (`aria-keyshortcuts`); hover sends `{do: 'hover', target:
'suburb-<ID>'}`; the overlay rings `vm.suburb` and a glowing `suburb-<ID>`, marks a booked
suburb and shows patience below 50 (K-22: a number or glyph, not colour alone; per frame, never
in the cached layers). The stack: the band and ghosts of Q-57; `stackSummary` and the hover
text name each block; `signature()` gains `obs.levers.rev`. `tests/city-view.test.js`: a soak
booked while paused redraws; the band is ≥ 4 px at the floor; the click routes; the summary
names the block.

**card.** Fill `app/suburbcard.js` as Q-56 says: rows read `obs.levers` and aim with `aimFlex`
over `vm.dayAhead` (or the forecast); the verdict line reads the no-flex line (`demandP50 −
flexMW`); pre-checks answer in blue without sending (locked, outside the window, under way, the
watch, the briefing, the day over; a suburb with dark districts shows its RESTORE line first and
still books, Q-50); BOOK and CANCEL send `flex` /
`flexDel` (CANCEL only while that block's `del === ''`); ◀ ▶ steer only the unbooked aim, and
on a booked block answer in blue ("booked for HH:MM: CANCEL, then BOOK the new time"). Keys inside the card: ←/→ suburb,
↑/↓ row, `-`/`=` time, Enter press, Esc close (in `closeTop`'s order), documented. The tray
(Q-60). Help texts: rewrite `city-levers`, add `hot-water-soak` and `aircon-cycle` (§8.2,
`specPending: true`), anchors appended in order, `content/text.js`'s cap raised as needed. The
play driver gets a `SUBURB` look line and the card's presses. `tests/card.test.js` and
`tests/feedback-city.test.js` (every new press answers, Q-41/Q-42, each ≤ 6 s alone).

**objective.** Q-59's two branches; `LINE_MAX_CHARS` holds; the line says what is true
(pre-cool first, the snapback's share). `PLAN_COST_KEYS` gains `flex`.
`tests/objective-levers.test.js` on poked observations (no whole days).

### 31.7 Done means (every agent)

- [ ] Your new tests and the ones your change can affect pass: `npm run test:changed` (`--list`
      first) once before reporting; in the loop, name files. Never the whole suite in a loop
      (stage A runs it once at its gate).
- [ ] Each new test file ≤ 6 s alone, each test ≤ 2.5 s; report the times.
- [ ] `node tools/perf.mjs` once at the end: report your eager growth against your share. An
      `import()` added: `node --test tests/budget.test.js` by name.
- [ ] No browser, no server. Headless through `tests/lib/play.js` / `tools/play.mjs`.
- [ ] Sim rules: plain JSON state, every constant a params record, no transcendental functions
      in per-tick code, autopilot reads only `observe()` and `V`.
- [ ] No `SIM_VERSION` bump, no golden re-record, no SPEC.md edit (card: only the §8.2 rows
      `tests/text.test.js` needs). No statistics tools over many seeds (CLAUDE.md).
- [ ] Commit on your named branch with plain-English subjects naming the U/S/Q ids. Report what
      you built, every deviation from this section, every line outside your region, measurements,
      red tests outside your files, your test count.

### 31.8 Module headers (moved from the files, Q-49)

Stage A moves here the leading header comments of `app/objective.js`, `desk/desk.js`,
`render/map.js`, `render/livestack.js`, `app/keys.js` and `app/alarms.js`, verbatim, one
subsection each (the sim files' headers go to `sim/README.md` §11, under their modules). Each file
keeps its first line and a pointer to its subsection.

#### app/objective.js

```text
app/objective.js: the desk's standing objective (SPEC §9.1 Q-18; Phase 2a: desk/README.md
C-10, §21.4). Pure and DOM-free.

In the game the commitment is the player's: which units run, and when. The dispatch of the
units they have committed is automatic (app/system.js). This module reads what the player
can (observe() and the plan view) and says, in one line, what the desk needs next: nothing;
a unit to start, by when, and how long it takes; a unit to stop, what that saves and when to
bring it back; the battery to charge or discharge; the levers handed back; a feeder to close.
It never acts. Every decision it names has a lead time, and it says by when.

The look-ahead is a CAPACITY check, not the plan's own red columns: for each forecast column,
what the committed fleet could give (machines on, starting or booked by then, at the plan's
loading; hydro for the water it has; the tie; the wind and sun forecast) against the forecast
demand plus a margin. The plan's red columns move with every 5-minute dispatch; whether
enough plant is committed does not. Three margins (MW above the P50 forecast):
  MARGIN_MW         the forecast's own error: under it the desk is short of a safe margin
  COMMIT_MARGIN_MW  what the evening needs to ride through one trip: under it a unit is asked for
                    (the trip's part counts the water at any hour: a trip is what the gorge is kept for)
  MARGIN_MW + the largest single loss   what must remain before a unit may be stopped, with the
                    water held until 15:30 as for any plan (§21.4 STOP condition 1)
so a unit the line asked for is never one it then asks to stop. What the desk can really give
(every unit at its limits from where it is, the water, the tie at its limit; capacityGap real)
says whether it is short NOW.

  objective(obs, {edited, planview, proj?, dayAhead?}) -> {level, kind, text, targets, action, startBy, short, long}
    level   'ok' | 'plan' (act later, or worth doing) | 'act' (act now) | 'crit' (short already)
    kind    which line it is (desk/README.md §19.5): 'watch' | 'held' | 'short' | 'commit' | 'restore' |
            'spare' | 'stop' | 'battery' | 'city' | 'quiet'
    targets control ids to light (desk/README.md §5)
    action  the sim input (or {redispatch: true}) that answers it now, or null. The game never
            sends it: the hint-following player (tests/lib/follow.js) does, to prove that a
            player who does only what this line says gets through the day and does it well.
    short   the capacity shortfall the line is about {atS, endS, mw}, or the first one in the
            4.5-h window, or null
    long    the spill ahead {atS, endS, mw} or null (planview's first blue run)
    saving  (STOP lines) the dollars the line quotes

Branch order (§21.4; 2b §31.9.8): watch, held, short-now, commit-now, shortAhead, air-con,
restore, spare, stop, battery, soak, commit-later, quiet. A line that asks for nothing yet (a
start more than ACT_WITHIN_S away, a feeder that cannot close yet, spare that nothing can add,
the reserve diesel on its way) gives way to a lower branch that has something to do now; among
lines that ask for something, the order above decides; then a critical line; then a city line not
yet due (level 'plan': it carries its action, so a player may book ahead, but a booking hours away
never hides a feeder to close, a GUARD to raise or a battery order; once due, 'act', it keeps its
place in the order); then the first that has something to say. Between commit-now and restore
sits the shortfall no start can reach (shortAhead): what every committed MW cannot give within
the hour is the battery's to carry, and demand response's when it is more than the battery
holds; the reserve diesel only beyond both.

The city levers (2b, Q-59, §31.9.8): kind 'city', targets ['suburb-<ID>'], the action the full
flex input {type: 'flex', suburb, lever, atS} with atS from aimFlex (sim/autopilot.js) over the
day-ahead (or the 4.5-h forecast; -1 is "not now": no line), kept at the shown line's atS while
aimFlex is within one 5-minute step of it (`stick`, `cityAim`; ctx.held, the game passes
game.objective; the forecast starts at obs.s, off the lattice, so its extreme column slides and
aimFlex alone flips between two marks every few grid minutes: 2b final review S1; tests/lib/follow.js
and the tools pass none), startBy the booking's deadline
(the soak's atS, the air-con's pre-cool start), level 'act' once that is within ACT_WITHIN_S
(+ leadS), else 'plan'. Eligibility only through observe().levers' block (a suburb is free when
its lever's block is ''). One suburb per line; the next is named once the forecast carries the
booking.
  soak (after battery: a battery order due now shows first; before commit-later), aimed once:
  every free suburb has no soak of its own, so aimFlex gives them all the same atS. When either
    (a) an MSL notice stands with its low ahead (obs.msl.level >= 1, atS > now), and some
        column of the 4.5-h forecast in 10:00-15:00 is still at or under MSL1_MW + MSL_CLEAR_MW,
        raised by MSL_TIE_OUT_MW in a column before the tie's return as sim/events.js raises it
        (the notice is re-checked only every MSL_CHECK_S, so a soak booked since would not clear
        it until then: without this, a player who books at once would be asked for a suburb a
        minute until the next check). It names the free suburb with the most soak MW (par's
        rule 1); the low it quotes is that column, the one nearest its threshold;
    (b) else, spill the battery will not take: the projection's spill plus the present charge
        order per column, the battery modelled as battery() charges it (up to min(ratedMW -
        guardMW, PAR_BATT_CHARGE_MAX_MW) a column, from the earliest blue column, its present
        order in every column, until (capMWh - socMWh) / BATT_CHARGE_EFF is used); the largest
        excess inside the aimed block's span (atS, atS + SOAK_S) above SURPLUS_MIN_MW names the
        free suburb with the most soak MW at or under it, else the smallest. Spill outside the
        span is not the soak's to take (on a MILD 06:30 aimed at 11:00, spill at 10:00-10:55
        gives no line; the line comes once the projection reaches the span).
    Text: "MSL1: demand falls to about 1,550 MW at 12:40. Book a HOT WATER SOAK in Old Hazelton,
    10:35–14:35 (140 MW): it lifts the low; tonight's heating falls by as much." or "The
    battery cannot take all of noon's spill. Book … : tanks take the rest; tonight's heating
    falls by as much." (Q-52: the night's heating falls by the booked energy.)
  air-con (right after shortAhead) only when lookAhead names no unit (a start beats air-con),
    shortAhead's soon does not hold, and for a run of the real gap (capacityGap real, over the
    day-ahead) at or after the suburb's fromS (each run in turn: a smaller, earlier one does not
    hide the evening's): no gap column in the aimed pre-cool [atS - PRECOOL_S, atS], the run's
    largest column inside the core [atS, atS + AIRCON_S], and the run more than the battery holds
    (its largest column above ratedMW, or its MWh above the charge over the reserve, where before
    15:30 (PAR_BATT_CHARGE_H) the charge counts at least PAR_BATT_CHARGE_TO: battery() fills it by
    then on any day with an evening gap): where demand response would be called (Q-59 "before DR";
    air-con is $400/MWh against DR's $1,400). The free suburb with the most relief MW that passes.
    Text: "From about 18:30 committed units fall short. Book an AIR-CON CYCLE in Redgum Flats,
    18:30–20:00 (45 MW): pre-cool from 17:30; 40% of the relief comes back after." ("committed":
    a unit that is off but cannot reach the gap may exist; the 40% is of the relieved energy.)
Every city line fits LINE_MAX_CHARS with Tallowood Heights and the widest figures
(tests/objective-levers.test.js).

(The GUARD line asks once for the most the battery can hold for a trip, PAR_GUARD_MAX_MW: a step
is worth less the higher the ring already is. Measured at 04:31 on the 11 seeds of both day
scenarios: the first 100 MW 0.025 to 0.104 Hz on the trip preview, then 0.021 to 0.062, 0.014 to
0.041, 0.011 to 0.030. A line sized on a step's worth asked twice: 300 MW, then 400.)
(After a trip the fired GUARD gives its whole ring for GUARD_SUSTAIN_S; a belly trip is smaller
than the ring, so while it is still giving and frequency is above the normal band the line turns it
down to 0 (par's rule 2 does the same), raises no ring while it is fired, holds the battery
branch's charge orders out of the MW it gave up, and raises it back once it has re-armed, within
the hour of the trip. Measured on desk-weekend seed 20261017, coal 1 at minimum, 240 MW, tripping
at 14:08:40 under a 400-MW GUARD: 478 s above 50.15 Hz in the next 900 s before, 49 s after.)
(Both moved here from the file in 2b, Q-49.)

The line says what is true (the wave-3 review): a shortfall is in the present tense only when the
desk at its limits (the real check) is short in the next minutes, otherwise it is what the hour
lacks against a safe margin; "Enough plant is committed" only with no column short of a trip's
worth of spare by THIN_MW; a STOP's saving says it rests on nothing tripping before the unit is
back; a unit on its way off counts down its ramp and the T4 slope until its breaker opens.

The line is pure, so "never thrash" is kept by state, not by a clock: a STOP is not proposed
while another unit is on its way down or has been down under STOP_GAP_S; a battery order is
proposed only from idle (or to raise a charge by what is still being spilled, or to end one at
the reserve or at the window's end), with bands between the levels that start and end it, and
none in the quarter hour before the evening's own order. (The shortfall branches raise a
discharge as an evening gap grows: each order is sized for the gap 20 min ahead.)

  consequence(obs, target, {planview, dayAhead}) -> {target, text, level} | null
    what a guarded press would do, said before it is made (C-10): target is
    'guard-start-<unit>' or 'guard-stop-<unit>'; level 'ok' (starting) | 'plan' | 'crit'.

  steady(held, next, s) -> {line, seenS, sinceS}
    the line as the desk shows it: a line whose deadline or figure moves with each forecast while
    what it asks for and its other words stay the same is kept as it was said, and a quiet line
    for STEADY_QUIET_S against another quiet line (the game holds `held`; the objective itself
    stays pure, and the action a line carries is never held back or changed).
```

#### desk/desk.js

```text
desk/desk.js: the desk (desk/README.md §6, §13-§14.2; SPEC §4.2-§4.3, K-17 panel sizes).

  const desk = createDesk(doc, root, actions, opts?);   // root: the #desk element the shell sizes; opts.annunSlot (Q-45)
  desk.update(vm);          // every frame, after the ticks (reads the view model only, §5)
  desk.key(ev);             // the shell forwards every keydown/keyup here first (§13.3); true = the desk acted
  desk.focus(id);           // focus a desk control by its §5 id (also done when vm.focus changes)
  desk.slots.stack          // the #stack-slot element the Live Stack (#stack) mounts into (render/livestack.js)
  desk.el                   // the desk's own container

Four columns at the 1280×300 floor (232 / 424 / 336 / 256 px + 8-px gutters): the frequency
dial over the imbalance bar and N-1 gauge; the lever bank over the hydro wheel, battery dial,
tie knob and the AGC / RE-DISPATCH keys; the Live Stack slot over the procedure bay; the
message tray over the emergency row; the annunciator in the plan bar (§30.4). Every input goes through
actions.input (never assumed accepted: refusals show on the control for a moment); the desk
is locked while vm.mode.locked (the watch) except ACK and SILENCE. Time for guards, holds and
the synchroscope's 8-s AUTO comes from vm.frame.nowMs (or opts.now), never from timers.

Keys (K-23, §13.3). desk.key returns true exactly when it acted; the shell then stops. (D and E
always return true: both holds are the desk's, so the shell never starts its own.)
  desk.key (from anywhere):
    1-8        focus COAL / CCGT / GT·A / GT·B / GT·C / hydro wheel / battery dial / tie knob
    G          focus the GUARD ring            V   focus the AGC/HAND key
    K          focus DIRECT SHED (while shown) N   RE-DISPATCH (as a press of its key)
    O          open the first READY unit's synchroscope (an offered one first); again: close the scope
    [ ] C U    slip lower / raise, close the breaker, auto-sync      B   the bypass key (HAND only)
    R          the restore bay (focus its list)
    A, Shift+A ACK, SILENCE                    D, E (hold 0.6 s)   industrial DR, reserve diesel
    S S / X X  start / stop a machine of the focused station (guarded), P / Shift+P rejoin the plan (HAND)
    Enter      presses the focused desk button (tiles, cards, guards, tabs, ...); not while the RESPOND card is up
  The focused control, natively (it calls preventDefault, so the shell does nothing more):
    lever        ↑↓ ±10 MW, Shift ±1 (Shift+↑ crosses the 96% gate), PgUp/PgDn detent, Home/End
    hydro wheel  ←→ (or ↑↓) 1%, Shift 10%, PgUp/PgDn 10%, Home/End
    battery dial ←→ mode CHARGE / IDLE / DISCHARGE, ↑↓ magnitude 50 MW, Shift 10, Ctrl 1, Home/End
    GUARD ring   ←→ / ↑↓ one 50-MW detent, Home/End
    tie knob     ←→ / ↑↓ 50 MW, Shift 10, Ctrl 1, PgUp/PgDn detent, Home/End
    RERT, DR     Enter or Space held 0.6 s (RERT: the first press lifts the cover)
    DIRECT SHED  Enter lifts the cover, Enter again within 2 s commits (or hold 0.6 s)
    restore list ←→ / ↑↓ choose a district, Enter closes its breaker
    tray         ←→ / ↑↓ move between the cards' buttons and LOG
  T, M, L, Tab, Space, Esc, F and ? stay the shell's (app/keys.js).
Foley (K-20): gestures emit actions.ui({do:'cue', name, pan}) on real changes only (ctx.cue).

C-10 (Phase 2a, desk/README.md §19.5): the desk tells the shell which START / STOP guard the
player is considering, actions.ui({do: 'consider', target: 'guard-start-<unit>' |
'guard-stop-<unit>' | null}), and only when the answer changes. A lifted guard wins, then the
focused one, then the hovered one; null when none. A commit counts as a drop. A lift made by
key (S / X on a lever: nothing is hovered and the lever, not the guard, has the focus) is held
CONSIDER_HOLD_MS after its cover drops, so a keyboard player has time to read what the press
would do (the cover itself still drops after 2 s). "Focused" is the keyboard's focus: the
focus a mouse click leaves on a guard is not counted (makeConsider says how), so after a
pointer lift or commit the target clears when the pointer leaves. The shell shows vm.consider
in the objective line; the desk only names the guard. After a new day (obs.tick going back)
the target is sent again, because the shell clears its copy. K-3: a cover going up or down
sends {do: 'armed', target, on}.
```

#### render/map.js

```text
render/map.js: the living isometric city map (desk/README.md §7, §14.3; SPEC G-1..G-5).
One screen canvas; the scene is drawn on a fixed BASE_W x BASE_H offscreen canvas and
blitted at an integer scale (render/mapdata.js scaleFor), letterboxed with the ground and
sky colours, never sky under the ground. Reads the view model only (vm.obs, vm.mode,
vm.hover, vm.glow, vm.alarms, vm.settings.reducedMotion). Math.random is cosmetic only (F-3).

  const map = createMap(document, root, actions);   // root: the #map box
  map.update(vm);                                   // every frame
  map.key(ev);                                      // the shell forwards keys (§13.3); true when it acted

What it shows
  G-2  one silhouette per technology (shapes are data in mapdata.js PLANT_PARTS): coal =
       hyperbolic cooling towers, banded stacks, a coal pile; CCGT = two boxy HRSGs with
       stubby stacks; GTs = a shed and one stack each; hydro = a dam wall, a spillway and
       penstocks; battery = rows of white containers; tie = tall lattice pylons marching off
       the west edge; wind turbines on the ridge; solar rows on the plain. Labels on hover,
       focus or alarm only (<= 3 at rest). Hovering a plant sends actions.ui({do: 'hover',
       target}); vm.hover rings the plant back. A click: see the click listener (Q-41).
  G-3  skyState(h): night, dawn, day, sunset (18:48), dusk; a sun disc crossing east to
       west; long warm light and long shadows at sunset; lit windows at night, as many as
       the city is using (underlying demand). Rooftop PV
       (Phase 2a): panels on every suburb's roofs in proportion to its rooftop MW (the city
       layer, cached) and a glint on them each frame: per suburb, as bright as its output
       over its capacity (cloud dims it) and as the light; never on a dark district, on a
       relit one only as its inverters ramp back; a static pattern under reduced motion.
  G-4  weatherOf(obs): heat = haze on the horizon + a bleached warm palette + shimmer;
       storm = two layers of dark cloud, slanted rain and rain sheets, a darker ground,
       turbines feathered at cut-out; cloud front = grey cloud and soft shadows drifting
       over the suburbs. All three are drawn static under reduced motion.
  G-5  a shed district goes dark block by block (90 ms each) and gets a hatched outline; a
       tripped machine smokes, strobes red and carries a ✕ for its whole lockout; rotors slow
       in the watch; the watch spotlight (B-5) dims everything but the cause.

Keys (map focused; tabindex 0): ←/→ cycle the plants then the suburbs (sets the hover and
shows the label), Home the first, Enter presses the hovered one as a click does (a plant's
control, wind's or solar's label, a suburb's card; not while the RESPOND card is up or in the
briefing: Enter is theirs, dismiss and TAKE THE DESK), Esc leaves. key() returns true exactly
when it acted; the map's own keydown listener calls it and stops the event, so a key forwarded
by the shell never acts twice.

Cost: the sky, the terrain (with the plants), the city (with its rooftop panels) and the
cloud strips are cached on their own canvases and redrawn only when the light bucket, the
weather bucket or a district's dark blocks change; a frame is a few blits plus the moving
parts. The glint is one path and one fill per suburb from typed arrays laid out once.

Phase 2b, the city levers (desk/README.md §31; Q-56, Q-57, §31.9.10). Also reads vm.suburb
and obs.levers.
  Click   a suburb sends actions.ui({do: 'suburb', id}); one with a dark district sends
          {do: 'focus', target: 'bay-restore'} first (Q-42), and the shell then opens the card
          without taking the focus off RESTORE. Enter on a hovered suburb does the same (Keys
          above). A suburb click no longer pins the blue label: the card carries its draw and
          roofs (app/suburbcard.js computes them; mapPinText's suburb branch is kept for tests
          only, since no suburb is pinned now). Wind, solar and the ground still
          pin; the ground's says "Click a plant for its control, a suburb for its card".
  Hover   a suburb sends {do: 'hover', target: 'suburb-<ID>'} (H reads it; the stack's
          bands do not light for it).
  Overlay per frame, never in the cached layers (a booking redraws nothing cached):
          - a blue rectangle round vm.suburb (none in the watch: the card is hidden);
          - the glow ring for a glowing 'suburb-<ID>' (the objective names it), as a plant's;
          - the white hover ring for the pointer's suburb or vm.hover 'suburb-<ID>' (a band
            hovered on the stack);
          - suburbTag(obs.levers, id, s), top left in the suburb on a dark plate (none in the
            watch: the spotlight dims all but the cause): 'SOAK HH:MM' or 'AIR HH:MM', the
            lever and start of its first block not yet over; then, after its first air-con
            booking today or while locked, its patience (the suburb's, whichever lever the
            mark names): '☺ 80' at or above PATIENCE_FULL (full response), '☹ 40' below it
            (the response falls), '☹ 15 LOCKED' under PATIENCE_LOCK. A glyph and a number,
            never colour alone (K-22). A booking that was cancelled refunds its patience and
            shows none. ☺ and ☹ (U+263A, U+2639) carry the Unicode Emoji property but present
            as text by default: the stage-C browser pass checks them on Windows Chrome; if a
            colour emoji is drawn, use 'P80', 'P40 ▼', 'P15 LOCKED'.
  Text    mapSummary (K-23) names the hovered suburb's tag: "On <name> <tag>: Enter opens
          its card."
```

#### render/livestack.js

```text
render/livestack.js: the Live Stack (desk/README.md §7; SPEC §4.4, L-1..L-9, K-18).
A desk screen: the next 4.5 h as a skyline of forecast demand (P50 + LIKELY RANGE band) on
a fixed 0-9,000 MW axis, each source a coloured layer in P-6 cost order, red/amber gaps,
ghosts for off units from their earliest-start line, and drag handles that write the plan
(planKey / planStart / planDel / planUnbook through actions.input). Reads the view model
only; the plan maths is app/planview.js.

  const stack = createLiveStack(document, root, actions);   // once
  stack.update(vm);                                         // every frame, after the ticks

View-model inputs: vm.obs (with obs.plan), vm.mode.locked (read-only during the watch, L-7),
vm.stackExpanded (L-4 overlay over the map), vm.hover / vm.glow (cross-highlight, L-9),
vm.hist (past columns: {demand: [{s, mw}], rooftop: [{s, mw}], stations: {<layer id>: [{s, mw}]}},
layer ids = station ids + wind, solar, tie (signed), battery (signed), rert, dr; absent: no past
drawn; app/game.js sends column means with colFromS / colS instead: planview.pastFromHist reads both).

Phase 2a, the belly (desk/README.md §21.5; shown always until the first-shift face of L-2, 2e):
  L-2  the silhouette: a faint line at operational + rooftop above the operational skyline,
       past columns included, and the rooftop bite between the two hatched sun-yellow (sparse
       "\\\", no fill), with the word ROOFTOP in the big layout. Nothing is drawn while the
       rooftop is under 1 MW (night; the CLASSIC scenario).
  C-11 blue SURPLUS columns where proj.surplusMW > SURPLUS_MIN_MW (planview.blueRuns): what
       will be spilled, standing on the demand line (over exports and charging) with a minimum
       height, GAP_MARK.blue's pattern, glyph and word, and a hover line that says what to do.
       Blue is never a kind in proj.gap.
  P-9  the price through format.priceText; a negative price in its own colour, with the word SPILL
       while power is being spilled now (wind.autoMW + solar.autoMW > SURPLUS_MIN_MW).

Pointer: drag a key handle or a layer's top edge (a new key there) to (time, MW); drag an off
unit's ghost sideways to book its START; drag a booked start below the axis to unbook it.
Drops snap to 15 min / 50 MW; an infeasible drop shows the earliest-arrival ghost instead
(click it or press Enter to take it); a click with no drag says what to drag. Keyboard (stack focused): 1-6 select COAL, CCGT, GT·A,
GT·B, GT·C, HYDRO (again: that station's off-unit ghost), arrows move one snap step, Enter
drops, Delete removes the selected key, Esc clears, L expands. The element listens for its
own keys and stops them, so the handle needs no key() for the shell to forward (§13.3).

K-22 (status is never colour only): a red gap (short of P50) is hatched "\\\" and carries a
"!" over each run; an amber gap (inside the likely range) is hatched "///" and carries a "~";
a blue surplus is barred "|||" and carries a "+" and, where the run is wide enough, the word
SURPLUS (GAP_MARK). K-23: the canvas has role="img" and an aria-label saying what the picture
says (stackSummary: the gaps, then the surplus runs and the rooftop), refreshed at most once
per real second.

Phase 2b, the city levers (desk/README.md §31; U-3, Q-50, Q-57). The skyline already carries
every booked MW (flex is in the forecast's P50), so the stack draws where each block is, not
what it does:
  band    each block's core (obs.levers.blocks[].parts, the sim's knots) over the future
          columns inside it: a band at least SURPLUS_MIN_PX (4 px) tall along the skyline,
          load added (the soak) under the skyline, relief (air-con) over it; several stack
          outward in block order. One pattern for every suburb, a K-22 pattern no other mark
          uses: a pale fill with dark rows ("≡"); no suburb colours. The suburb's code (K-22:
          one pattern, so the code tells the bands apart), in both layouts, on a plate just
          beyond the band (clear of the skyline) at its first column, shifted right by its
          stacking level.
  ghosts  pre-cool, snapback and the night fall, the same minimum height on the same side
          rule, as a dashed line along their outer edge (the off units' dash).
          Heights are the part's plateau MW (ramps not drawn): at the floor (63 MW a pixel)
          nearly every block is the 4-px minimum anyway.
  hover   a band or a ghost names its block (blockText: lever, suburb, MW, core times), a
          ghost also its part on a second line (PRE-COOL: load added before it; SNAPBACK: load
          returning after it; NIGHT HEATING: lower by what it soaked: U-2's rebound, which
          the dashed line alone cannot say), and sends {do: 'hover', target: 'suburb-<ID>'},
          so the map rings the suburb. Hover only: a press there takes what is under it, and
          nothing drags a block in 2b (the card's steps do).
  text    stackSummary adds "Booked: <block>." for each block with a part drawn (a column inside
          its knots, as drawCity tests it), "Booked: <block> (its snapback)." (or pre-cool, night
          heating) when only its ghosts are (K-23: what the picture shows; later ones are on the
          map's tags; 2b final review P5).
  hitTest what is under (x, y): a handle, a ghost, a layer edge, a layer body or a gap; for a
          hover (forHover) also a blue surplus column, a block or the rooftop bite, which a
          press never grabs. A hover's order: the pending ghost; a blue column (C-11), whatever
          lies under it (the column stands on the top of the stack, where the top layer's key
          handles and its edge are; a press there still takes the handle or the edge: blue is
          never dragged); a handle; a gap (its L-9 hover, 2 px of slack over the skyline); a
          block's band or ghost; then the off-unit ghosts, the edges, the layers, the rooftop.
          So along the skyline a handle or a red gap (what a press takes there) wins over a
          band: the hover never names a block where the press does something else, but over
          a SHORT run a relief band hovers only in its top pixels.
  redraw  signature() includes obs.levers.rev: a booking or a cancel while paused redraws.
```

#### app/keys.js

```text
app/keys.js: the K-23 key map for the game (next.html). app/input.js stays the bench's.

createKeys() is a small state machine (S S / X X within 2 s, D / E / F holds); keyDown,
keyUp and poll return ACTIONS, never touching the DOM or the sim:
  {ui: {...}}           a presentation command (actions.ui)
  {input: {...}}        a sim input (actions.input)
  {redispatch: true}    RE-DISPATCH (actions.redispatch)
bindKeys(doc, keys, getVm, run, now, route) attaches it to a document: the page's ONE key
listener. Its order (desk/README.md §13.3), so that the same key never acts twice:
  1. a key typed into a text field, or already consumed by a focused control (it called
     preventDefault: the desk's controls handle their own arrows, S S and so on), or one the
     shell says is not the game's (route.own: the settings popover's sliders), is left alone;
     so is anything with Ctrl / Meta / Alt (browser shortcuts are never game keys);
  2. route.first(ev) (the shell: Enter on the briefing card);
  3. each module of route.chain() that has key(ev), in order: the desk, the Live Stack, the
     map. The first that returns true used the key: preventDefault, stop;
  4. this file's map, the fallback that makes every K-23 key work from anywhere.
D and E holds are the desk's while a desk with key() is mounted (keys.holds = false): the
fallback then neither times nor fires them.

| 1-8                     focus COAL / CCGT / GT·A / GT·B / GT·C / hydro / battery / tie
| ↑ ↓ (Shift fine), PgUp/PgDn   move the focused lever (±10 / ±1 MW, next detent) or wheel
| S S / X X               START / STOP the focused station's next machine (guarded: twice in 2 s)
| P                       rejoin the plan (HAND)
| [ ] C U                 slip lower / raise, close the breaker, auto-sync (the open scope)
| R                       restore bay (←/→ and Enter are the bay's own)
| A, Shift+A              ACK, SILENCE
| D, E (hold 0.6 s)       industrial DR, reserve diesel key
| T, M, L, Tab            trip preview, tray (again: its LOG), Live Stack (again: expand), map
| Space, Esc, F (hold)    pause, skip the watch (after a full one), fast (doing nothing: a blue toast says why)
| Enter                   dismiss the respond card
| ?                       the abstractions drawer; Shift+M mute
| ,                       the SETTINGS popover (B-7)
| W                       EXPLAIN: the alarm panel opens (the clock holds) or closes (Q-46)
| H                       the suburb card opens or closes (Q-56; a held H does not repeat)
```

#### app/alarms.js

```text
app/alarms.js: the K-8 annunciator model and the K-21 priority of each tile (Phase 1b:
desk/README.md §11 B-1, B-2, B-3). Pure and DOM-free; desk/annunciator.js draws
`alarmsView()` (vm.alarms).

Twelve tiles (4 x 3). Phase 2a (desk/README.md C-9): MIN GEN is real (the dispatch is spilling
wind and sun now); the MSL levels are tray cards (app/tray.js), not a thirteenth tile. Each has one BASE priority and a
target control id (a click or Enter focuses it). Analogue tiles have separate set and clear
thresholds (K-8), event tiles are set by what happened (a contingency, a UFLS stage, news).

Escalation (B-1): UNDER FREQ and OVER FREQ are P2 tiles (`escalates: true`). While the
frequency is outside the containment band (49.5-50.5 Hz) the tile is escalated: the view
gives it `prio: 'P1'` and `escalated: true`, and it sounds the horn. An acknowledged tile
that escalates flashes again (it is worse news than the one acknowledged).

States (ISA-18.1 sequence R, ring-back, visual only; B-2): normal -> alarm (new: flashes
fast, sounds by priority) -> ACK -> ackd (steady) -> condition clears -> normal (dark). An
alarm that clears before ACK is 'cleared' (flashes slowly, the ring-back) until ACK returns
it to normal. SILENCE stops the sound only. The flash rates are the desk's (2.5 / 0.8 Hz).

Sound (K-21, B-3). A SOUNDING is one alarm sound started: the horn (the highest effective
priority among the tiles that start it is P1) or one chime (P2); P3 tiles are silent here
(their tray card makes the soft tick). One sounding per update at most. `a.audible` counts
soundings (K-8's accept: "the competent proxy triggers <= 8 audible alarms per daily").
RE-SOUNDS are the same alarm heard again and count in `a.repeats`, never in `a.audible`:
  * the horn every HORN_REPEAT_S real s while a P1 alarm is unacknowledged and not silenced;
  * one chime P2_REPEAT_S real s after a P2 tile sounded, if it is still unacknowledged
    (and not silenced, and no horn is going);
  * the horn starting on a tile that escalates inside its own hold-off (below).
No tile starts a NEW sounding within RESOUND_HOLDOFF_S real s of its last one (K-8 accept):
an alarm that sets again inside that window flashes at once and is held; if it is still
unacknowledged when the window ends it sounds then. During the watch every sound is held
the same way; tiles still unacknowledged sound once when the watch ends. So with the alarm
panel open (ctx.hold, Q-46).

Inputs: updateAlarms(a, x, ctx) reads a small snapshot `x` built by alarmInput(obs) in the
game, or alarmInputFromState(state) in headless runs (tests; they must agree). Frequency
extremes between two updates come from sampleTick() (called after every tick): a frame at
120x spans ~100 ticks, and a dip below 49.85 Hz inside it must still set UNDER FREQ.
```

#### app/suburbcard.js

(2b, the card agent; written here, not in the file, Q-49.)

```text
app/suburbcard.js: a suburb's card (SPEC §9.1 Q-56; §31.6 card, §31.9.3-§31.9.7). On demand (Q-44,
cap 6 KB in tests/budget.test.js); its CSS is injected once (#sc-css). Presentation and two sim
inputs, flex and flexDel; the shell owns opening, closing, hiding in the watch and the focus.

  const card = createSuburbCard(doc, root, actions, {toast, loadText, toggleHelp, now});
  card.update(vm, day)  every frame while vm.suburb is set, also while the watch hides it (its pre-checks
                    read the latest vm); day is the attempt (the shell passes game.state): a new one
                    (PLAY THIS DAY AGAIN) forgets the player's aims and the rests; builds its rows when
                    the suburb, the offer, a dark district or the blocks change, keeps a focused row's
                    focus across a rebuild and closes a popover its old "?" held (Q-47; the shell
                    closes it when the card hides); a block's booked / under way / done each frame;
                    the aim, its words and the verdict only when the line (fromS, n), lv.rev, the LV,
                    the player's aim, patience, the last block's del or the shown city line's atS
                    change; names the dialog
                    (aria-label) by its suburb
  card.focus()      the first row's press (RESTORE, else the first CANCEL or BOOK), else ✕
  verdict(fc, lv, id, atS, effMW) -> '✓ …' | '✕ …' | ''   §31.9.4, pure (tests)
  WIT, LEVERS, PEAK_BAND_MW   the U-1 lines, each lever's name and "?" row, the band (100 MW)

What it shows, top down (1280×600 gives it 194 px; a HOT day with both levers fits, and one
booked block with them; two booked cycles and a soak scroll, the last resort, and the verdict
sits under its aim so the words scroll first. 2b final review P6, computed from the CSS, not yet
seen in a browser: lines 14.85 px, buttons 24 px; a HOT card ~180 px before the trims, ~210 px
with a booked cycle's two-line row; padding 4 px, p margins 0 and .sc-r 2 px take 20 px off):
  NAME · 420k homes · ✕ (btn-suburb-close)
  n DARK: [RESTORE] (city-<ID>-restore: focus bay-restore; the card stays)   only with dark districts
  “U-1's dry wit”
  patience 40: 90% respond (all respond from 50; air-con locked under 25; only on a day air-con
    is offered, else "patience 40": it scales air-con alone, P2) · draws <lit MW> · roofs <MW>
  per offered lever (obs.levers.offered; on a MILD day "AIR-CON CYCLE: hot days only (…)"):
    each booked block: SOAK 10:30–14:30 booked|under way|done: tonight's heating −525 MWh   [CANCEL]
                       AIR-CON 18:45–20:15 booked: pre-cool from 17:45 · snapback to 21:45 · $22.5k · patience −10 [CANCEL]
      (CANCEL city-<ID>-<lever>-cancel-HHMM; dimmed, aria-disabled, once its del is not '': under
      way from the soak's first MW or the cycle's pre-cool, so the row names the pre-cool; done
      after the soak's end or the cycle's snapback)
    the aim: HOT WATER SOAK +140 MW [◀] 10:30–14:30 [▶] [BOOK] [?]   (BOOK = city-<ID>-<lever>,
      ◀ ▶ = -earlier / -later, ? = q-<lever>: deps.toggleHelp(q, [LEVERS[lever].row]))
    air-con: the verdict of the aim, or of the suburb's last booked cycle when it cannot book and
      that cycle can still be cancelled (none once it starts: the day-ahead then has only the
      columns after now, and its "peak" would creep past the real one)
    what it does: takes 525 MWh at noon; tonight's heating −525 MWh · no payment
                  pre-cool from 17:45 · snapback to 21:45 · $22.5k · patience 60 → 50
      or, when LV.block is not '', that reason in blue (◀ ▶ hidden, BOOK dimmed)

The aim: the player's (◀ ▶, - =: 15-min steps) kept inside [fromS, toS], else the shown city
line's atS for this lever (vm.objective; a soak line's for any suburb, an air-con line's for its
own: after "◇ SUBURB (H)" or "▶ SUBURB (H)" BOOK sends what the line says), else aimFlex over
vm.dayAhead || obs.forecast (fromS while it says -1), kept within one 5-minute step of the card's
last default (objective.js stick; 2b final review S1). BOOK forgets it; CANCEL leaves the
cancelled block's time as the aim to re-aim from. A booked block is never moved in place.
Energies and times come from sim/weather.js flexParts (the sim's own shapes); the payment is
the core's MWh × AIRCON_PRICE (lit districts; dark ones are not paid).

A press (BOOK, CANCEL, ◀ ▶): the row's rest first (COMMIT_LOCK_MS after an accepted BOOK or
CANCEL: "booked: OLD HAZELTON soak 10:30–14:30"); then ◀ ▶ step (blue "earliest 10:00" /
"latest 11:00" at the ends; on a booked soak or a focused block "booked for HH:MM: CANCEL, then
BOOK the new time", or that block's del once it is under way); BOOK and CANCEL answer in blue
and send nothing in the briefing ("Take the desk first: Enter."), after the day ("Day over:
…"), in the watch ("desk locked while the grid catches itself"), on LV.block ("<Suburb>:
air-con locked: patience below 25", "… too late today: soaks start by 11:00", "… one soak a
day: already booked") and on a block under way (its del). LV.block is said as a standing status
(the aim row, BOOK, ◀ ▶): its window reasons (sim/grid.js LEVER_WHY) in the card's words, "too
late today: soaks start by 11:00", "too late today: cycles start by 19:30 (pre-cool from 18:30)"
and "no room today for another cycle around the booked one", the rest as the sim says them
(2b final review P4: the sim's strings refuse a proposed time, and nothing was proposed). A refusal from the sim stays the
shell's red toast. "Outside the window" is LV.block's: the card never holds an aim outside
[fromS, toS]. A suburb with dark districts shows its "n DARK: RESTORE" line first and still
books (Q-50: a dark district's flex just stops; eligibility only through LV.block, §31.3.7),
so §31.6's "a dark suburb's RESTORE first" is that line, not a blue refusal.

Keys (the card's root; CARD_OWN in app/shell.js keeps them from the desk, the stack, the map
and the fallback): ←/→ the previous / next suburb in city order (wrapping; the new card takes
the focus), ↑/↓ the row presses (RESTORE, CANCEL, BOOK), - and = the time of the focused row's
lever, Enter presses the focused button (preventDefault; never on ev.repeat), except in the
briefing, where it goes on to the shell and takes the desk (app/shell.js own lets it through),
as BOOK's blue answer says. Esc and H stay the shell's (closeTop's order; H toggles); Tab is
the browser's.
```

### 31.9 After the contract review (workflow `wf_3f02ecb7-0c6`; these override §31.1–§31.7 where they differ)

Four lenses (seams, physics, the player, buildability) found 70 issues; a skeptic refuted 7 and
confirmed 3 blockers and 22 majors. The fixes already written into §31.1–§31.3 above: the
`'suburb'` kind is a shape check only (S1/B1); no block is moved in place, blocks carry `cost` and
`del` (F1/S8/P3/P4); the soak has no patience factor (F18); the overlap rule (P9); the lock is
derived (S14); I3 and I3b (P2, S4/P1); `flexAt`'s signature (P6); the money formula (P5/S5);
`aimFlex` (S7/B10/P8/F16); the golden after stage A (B7). The rest:

**31.9.1 Stage A, also.**
- `content/scenarios.js`: the `levers` block's first keys are `simplified: true, note: '…'` (F-13,
  `tests/params.test.js`), as `city`'s are; `createState` strips them, so `state.scn.levers` is
  exactly `{menu, suburbs}`.
- `tests/integration.test.js`: the F-6 vocabulary list, the fuzzer's `make` table (`flex`/`flexDel`
  generators: a suburb from `s0.scn.city.suburbs`, a lever, an `atS` sometimes off the lattice),
  the K-15 watch tries (CLASSIC seed 2 with a valid id, e.g. `{type: 'flex', suburb: 'HAZ', lever:
  'soak', atS: 23400}`, refused for the watch), malformed examples (unknown suburb, unknown lever,
  non-integer `atS`). New input types change the fuzzer's `one(INPUT_TYPES)` picks; that is
  expected (those tests compare runs with each other, not with fixed values).
- `tests/state.test.js`: `OBS_SHAPE` (top level, `demand`, `forecast`, `levers`); the `levers`
  list paths (`levers.suburbs[]`, `.soak`, `.aircon`, `levers.blocks[]`, `.parts[]`) go in the DESK
  shape test with a block pushed into `state.levers.blocks` directly; repair its `demand` literal.
- `tests/lib/vm-fixture.js`: `baseVm` gains `suburb: null, dayAhead: null`.
- `tests/baseline-v4.test.js`: move the end-of-day hash assertion after the D-9 timing, so a
  hash-only change never hides S-4 pace or D-9 (one moved line, named in the report).
- `app/perf.js` on demand: the `?debug` handle's `perf` becomes a getter; `tests/next.test.js`
  passes `perf` in `boot()`'s defaults.
- `app/alarmpanel.js` `NAMES` gains `'suburb-card': 'SUBURBS'` and a branch naming `suburb-<ID>`
  by the suburb's name (one line each).
- **Ids and focus targets.** `vm.suburb` and `{do: 'suburb', id}` use the bare id (`'HAZ'`).
  `focus suburb-<ID>` opens that card; `focus suburb-card` opens the card as H does (the suburb
  the objective's targets or the hover name, else the last opened (kept in `game.ui`, cleared in
  `resetDay`), else the first in city order) and **never closes it**. `{do: 'alarmsGoto'}`
  honours both (close and pause as today, then open). One helper serves both. A map click
  (`{do: 'suburb', id}` with an id) opens or switches and **never closes**; only ✕, Esc, H and
  `id: null` close (F10: a double click must not close what it opened).
- **Focus (F2).** `createSuburbCard(doc, root, actions, deps) → {update(vm), focus(), el}`;
  `deps = {toast, loadText, toggleHelp}` (the end card's pattern). The shell records the opener
  when a command opens the card from closed, calls `card.focus()` on the frame it first shows or
  switches suburb, and on close returns the focus to the opener if still shown, else to the map;
  a focus left in the hidden card is blurred. Keys whose target is inside `#suburb-card` are the
  card's (an `own` route like `PANEL_OWN`), so the app's fallback and the map never see them. H
  ignores `ev.repeat`. Exception: a click on a dark suburb focuses the RESTORE bay and opens the
  card without taking the focus.
- **Geometry (F3).** `#suburb-card`: `position: fixed; left: 32px` (clear of the map's "?");
  `top: calc(var(--hdr) + 8px)`; `width: 400px`; `max-height` down to 8 px above `#planbar` (194 px
  at 1280×600, as built); `overflow-y: auto` only as a last resort. The card's inner CSS is injected by
  `app/suburbcard.js` (as `app/alarmpanel.js` does); `next.html` holds only the container rule.
- `KIND_WORD.city` carries the route, e.g. `'◇ SUBURB (H)'` (a glyph the charset test allows),
  outside the line's 170 characters (F7); assert it beside the other `objectiveWord` checks.
- Step 4's test also covers: H moves the focus into the card and a second H returns it; a held H
  does not toggle; `focus suburb-card` and `alarmsGoto suburb-HAZ` open it; ArrowDown with the card
  focused sends no input.

**31.9.2 The sim (wave 1), also.** The night fall follows the booked energy; a levers test pins it
for a district dark through the soak (P10). The MSL notice answers at its next 5-minute check, not
the next frame (P11): the "notice can clear" test steps to the next `MSL_CHECK_S`. `flex`/`flexDel`
in a watch on DESK are refused by `applyInput`'s watch rule (a test). Eager share **≤ 2.4 KB**.

**31.9.3 The card in the watch (F4).** `#suburb-card` is hidden while `vm.mode.locked` (the whole
watch, paused or skipped), with `vm.suburb` kept, and shows again when the lock ends. While
hidden, `closeTop` passes over it, so Esc still skips the watch; H and `{do: 'suburb'}` answer in
blue ("the suburb card is back after the watch"). Stage A builds this; `tests/card.test.js`
checks it with `injectTrip` (never by walking the day).

**31.9.4 The verdict line (F5).** Computed on the line `aimFlex` uses for that suburb, over
`vm.dayAhead || obs.forecast`. The peak is that line's highest column in 15:00–21:00 (labelled at
the nearest quarter hour, as the objective's quiet line does); the peak band is every column there
within `PEAK_BAND_MW = 100` of it (a constant local to the card). Each part is evaluated at the
band's column times by interpolating its knots. ✓ "relief HH:MM–HH:MM covers the HH:MM peak;
snapback after it" only when the core is at its full −effMW at the peak column and pre-cool and
snapback are 0 MW at every band column; else ✕ naming the first failure, in this order: "relief
HH:MM–HH:MM misses the HH:MM peak", "relief HH:MM–HH:MM: pre-cool lands on the HH:MM peak",
"relief HH:MM–HH:MM: snapback lands on the HH:MM peak" (2b final review P1: every verdict names
the relief it judges, so after a booking the next aim's ✕ does not read as the booked cycle's).
`tests/card.test.js` covers the four states on poked blocks (the `aimFlex` default ✓; `atS = toS`
pre-cool on; `atS` at the pre-PV peak, relief misses; `atS = fromS`, relief misses).

**31.9.5 One press, one answer (F10).** After an accepted BOOK or CANCEL, that row rests
`COMMIT_LOCK_MS` (`desk/util.js`, 1 real s on the shell's `now()`); a press in the rest sends
nothing and answers in blue with what was sent ("booked: OLD HAZELTON soak 10:30–14:30"). The
card's keydown calls `preventDefault()` on Enter (no native click) and acts only when
`!ev.repeat`. `tests/feedback-city.test.js`: two presses leave one FLEX_BOOK; a repeat Enter sends
nothing; after the rest a press cancels.

**31.9.6 Help inside the card (F8, S19).** New text entries `hot-water-soak` and `aircon-cycle`
are `ui: 'drawer', game: 'drawer'` (the end card's pattern). The card draws its own inline "?"
per lever row (`button.q.inline`, `aria-controls="popover"`, `deps.toggleHelp(q, [row])`).
`content/anchors.js` does not change; no anchor may name `suburb-card`, `suburb-<ID>` or
`city-<ID>-*` (`#q-layer`, z 7, is under the card). `city-levers` is rewritten in place and keeps
its `btn-dr` anchor.

**31.9.7 The tray (F12, B3).** The MSL1 and MSL2 cards keep one button (K-9). When the record's
`atS` lies in the soak window, after its tick (a low ahead, not now: par's rule 1 and the line's
trigger (a) ask the same; 2b final review S2), and its tick is no later than the last soak start
(`SOAK_TO_S − SOAK_S`), the text names the hot-water soak and the button becomes SUBURBS with
target `suburb-card`, replacing TO THE BATTERY / SEE THE STACK (MSL1 keeps its battery advice in
words). Otherwise the cards stay as today. Both checks use the record and params only.
`desk/tray.js` is unchanged. Deliberate edits in `tests/alarms.test.js` (the target list; the
`soak` ban lifted for in-window MSL1/MSL2 only).

**31.9.8 The objective line (F13, S11, F7).**
- **Soak branch:** after `battery`, before `commitLater`, so a battery order due now shows first.
  Triggers: (a) the MSL1 notice ahead (`obs.msl.level >= 1 && obs.msl.atS > obs.s`), booking as
  par's rule 1 does until it clears; (b) spill the battery will not take: over the projection's
  columns in the soak window, model the battery as `battery()` charges it (per column up to
  `min(ratedMW − guardMW, PAR_BATT_CHARGE_MAX_MW)` less the present order, filling greedily from
  the earliest blue column until its room `(capMWh − socMWh) / BATT_CHARGE_EFF` is used); the line
  shows while the largest excess column is above `SURPLUS_MIN_MW`, naming the free suburb with the
  largest effective soak MW ≤ that excess (else the smallest). It always carries the full `flex`
  action. The text says it takes the noon power the battery cannot.
- **Air-con branch:** its own branch right after `shortAhead` (unchanged: the next hour belongs to
  the battery and DR), only when `lookAhead` names no unit for the gap (a start beats air-con),
  and only for a run of the real gap at or after the suburb's `fromS` where the aimed block's
  pre-cool `[atS − PRECOOL_S, atS]` has no gap column above 0 and the run's largest column falls
  inside its core. Never while `shortAhead`'s `soon` holds. One suburb at a time.
- Every city line names the suburb and the lever; the route is in the kind's word (31.9.1); the
  named suburb glows. Tests check the longest name (Tallowood Heights) and widest figures fit
  `LINE_MAX_CHARS`.
- **As built after wave 2's review (these amend the bullets above):** a city line not yet due
  (`plan`) waits behind any line with something to do now and behind a critical line, ahead of
  lines with nothing to do; once `act` it keeps its place. Trigger (a) is the soak window's
  minimum of the line's own projection at or below `MSL1_MW + MSL_CLEAR_MW`, with
  `MSL_TIE_OUT_MW` added in columns before the tie's return (as `sim/events.js` does); trigger (b)
  counts the excess only inside the aimed block's span. The air-con branch walks every gap run
  from the suburb's `fromS`, and before 15:30 counts the battery at the charge it is planned to
  reach (`max(socMWh, CHARGE_TO_MWH) − RESERVE_MWH`).
- **Par's rule 1 (Q-58), as built:** the MSL1 notice ahead **with its `atS` inside the soak
  window** (`SOAK_FROM_S`..`SOAK_TO_S`), the same test the tray uses (31.9.7).

**31.9.9 Par (S6, S11, B13).**
- `preDispatch` stores the day-ahead line **without** flex: `P.fc.p50[k] = fc.demandP50[j] −
  fc.flexMW[j]` (its own first dispatch still reads `fc`, so a block booked on the paused desk at
  04:30 counts once). `litDayAhead(P, k, t, heat, D, lv)` uplifts that line for heat and then adds
  the flex of `lv.blocks` at the column time inside `litMW`. Every column carries flex from exactly
  one source. Test: a plan made after a booking gives the same `context()` cover beyond 4.5 h as a
  plan made before it and re-planned (within 1 MW), also under a late heatwave.
- **Rule 5 books only when** the walk is uncovered at some column at or after `fromS`, no column
  in `[atS − PRECOOL_S, atS]` is uncovered, and the first uncovered column at or after `atS` lies
  in `[atS, atS + AIRCON_S]`; and `aimFlex` returned ≥ 0. Otherwise it falls through to `armRERT`
  as today. An uncovered column within `PRECOOL_S` of now stays DR's and RERT's.
- Rules 1 and 5 run only for the proxies that plan ahead (par, competent, commitAll), gated as
  `batteryOrder` gates rule 6; a test shows lean never sends `flex`.
- `tests/system.test.js`: par edits only the `commitSig` test lines; the objective only the
  `PLAN_COST_KEYS` line and the `planCost` example.

**31.9.10 The map (F17, S9, F14, B16).** The map shows a suburb's patience after its first air-con
booking today or when it is locked (a glyph and the number, e.g. "☹ 30"); the card always shows it
with what it does ("patience 40: 90% respond"). A suburb click no longer pins the blue label (the
card carries draw and roofs); `mapPinText` keeps its ground text. View's deliberate test edits:
`tests/map.test.js` :369 (hover sends `suburb-<ID>`), :922 (title), :935–937 (a dark suburb sends
the RESTORE focus, then the card), :945–953 (a lit suburb opens the card); `tests/feedback.test.js`
:261–262 and :377 only.

**31.9.11 The end card (F15).** When either day paid `cost.flex`, SUPPLY's reason reads "more or
dearer plant, or city payments, than par's". `app/endcard.js` (that sentence) and
`tests/scoreface.test.js` (its line) join the card agent's files.

**31.9.12 Tests, time and bytes (B4, B8, B11, B15).**
- **Selecting tests:** right after `git merge --ff-only <branch>`, record `BASE=$(git rev-parse
  HEAD)`; run `node tools/changed-tests.mjs --base $BASE --list`, then without `--list`, once
  before reporting. Wave 2 adds `-- --test-concurrency=2` (four agents at once on a small PC).
  Never the bare `npm run test:changed` (it diffs against main: 45 of 47 files). Stage A's
  `node --test` gate is its only full run.
- **Reach states by booking ahead and poking, never by walking the day.** BOOK, CANCEL, ◀ ▶,
  outside the window, locked and the verdict all run before 06:00; "under way" by pushing a block
  whose first knot is at or before now into `state.levers.blocks` (sorted, `rev + 1`) or by one
  shared jump; the watch by `injectTrip`.
- **Eager shares (measured with `node tools/perf.mjs` against the commit you built on; the Q-49
  trims are not counted):** base ≤ 2.6 KB, sim ≤ 2.4 KB, par ≤ 1.2 KB, view ≤ 1.4 KB, card ≤ 0.8 KB,
  objective ≤ 1.0 KB: **2b ≤ 9.4 KB**. The ten headers free about 14.8 KB, not 16.0; with perf.js,
  about 16.6 KB.
- **Shared helpers:** `tests/lib/play.js` is the card's (others report a needed extension);
  `tests/lib/vm-fixture.js` is stage A's. Each wave owner may edit its own modules' subsections of
  §31.8 and `sim/README.md` §11. The params header is its leading comment run (the
  `SIM_VERSION` changelog stays beside `SIM_VERSION`). H is documented in §31.8's keys table,
  desk/README §13.3 and SPEC K-23 (stage C).

**31.9.13 Versions (B12, S20).** Stage A: `v4-core-2b.0` (§31.2). Before each re-record, run
`node tools/baseline-v4.js --quick` at the parent commit and at yours and diff section 1 and the
§3.1 rows of seeds 1–2 with `0x[0-9a-f]{8}` masked: expected the Build line and the K-15 types row,
nothing else. At stage C, after the wave-2 merge: the masked diff again, then `v4-core-2b.1` (par's
levers change par's game days) and one more re-record; only hash cells and the Build line may move
on CLASSIC. SPEC §6 and risk 11 quote `tools/perf.mjs`, never the golden's machine line.

**31.9.14 The order of work, as run.** Stage A's sim half and wave 1 are one agent, `sim` (branch
`2b-sim`): the sim headers (Q-49), every sim shape (§31.3.1–§31.3.7, §31.3.9, `aimFlex`) and then
the behaviour (§31.5, §31.9.2), in that order of commits. Stage A's app half is a second agent,
`app` (branch `2b-app`), in parallel: the other six headers, `app/perf.js` on demand, §31.3.8 and
the app items of §31.9.1 and §31.9.3. Eager shares: `sim` ≤ 4.2 KB, `app` ≤ 0.8 KB (base and
wave 1's 5.0 KB together). `vm.hist.flex` is dropped (the skyline already carries past flex;
nothing draws past bands in 2b). The integrator merges both, runs `node --test` once, bumps
`v4-core-2b.0` and re-records the golden; then wave 2.

### 31.10 Stage C measures (the integrator, once each, after the wave-2 merge)

1. `node tools/par.js --scenario desk --seeds 1-200 -j 4 --probe --quiet`, the same for
   `desk-weekend`, and `--heat 100` on both. Gates: zero shed on ≥ 85% of raw seeds and ≥ 75% of
   heat seeds; RERT armed on ≤ 25%; MSL3 never except after a noon contingency; no black day.
   Report soakDays, airconDays, soakMWh, reliefMWh, flexDollars beside 2a's figures (§28).
2. `node tools/par.js --scenario desk,desk-weekend --seeds 1-100 -j 4 --proxy
   competent,lean,commitAll --allin`. Gates: competent ≥ 70% A; lean ≤ 40% A (fills S-12's "not
   measured yet (2b / 2d)" row); commitAll loses A on ≥ 30%. `LETTERS` stay unless a gate fails.
3. `node tools/follow.mjs` on the accept lists for `desk` and `desk-weekend` (the follower still
   gets through; `--no-follow` still fails), with the city lines on; report how often it soaks and
   cycles, and its ALL-IN against par on mild spill days (Q-58's "+5").
4. `node tools/perf.mjs`; `node --test` once (< 60 s).
5. The golden (§31.9.13); one browser pass, one pane, at 1280×600, 1280×720 and 1920×1080.

### 31.11 Round 1 record (2026-10-09) and what changes for wave 2

Round 1 (workflow `wf_d912efc0-9ec`) merged as `682c32a` (`sim`: builder, two reviewers, a fix
pass; 9 findings, 8 fixed, 1 handed to the integrator) and `a1da41f` (`app`: 13 findings, 10
fixed, 2 rejected, 1 contract text). `v4-core-2b.0`, golden re-recorded (`a951e9a`; masked diff:
the Build line, the K-15 row "0 of 810 … all 27 types" and the machine lines only). Whole suite
before the re-record: 718 tests, 716 pass (the two golden hash compares), 37.2 s.

**First visit** (`node tools/perf.mjs`): 404,388 B before 2b → the sim's headers −7,097 B, the
app's headers −7,864 B, `app/perf.js` on demand −1,749 B, the sim's shapes and behaviour
+4,237 B (share 4,301 B), the app's glue +818 B (share 819 B) → **383.6 KB, 16.4 KB left**. Wave 2's
shares (par 1.2, view 1.4, card 0.8, objective 1.0 KB) leave about 12 KB for 2c–2e.

**The sim as built** (deviations from §31.3, accepted):
- `flexAt(blocks, s, suburb, kind, lever)` has a fifth argument, `lever` (`''` = all).
- `sampleSecond` fills `flexMW`, `flexSubMW` and `reliefSubMW` in one pass, bit-identical to
  `flexAt` (tested); `flexAt` skips blocks outside their span.
- Blocks are sorted by (`atS`, suburb index): the lever can never decide (soaks start by 11:00,
  air-con from 15:00).
- An air-con `LV`'s `[fromS, toS]` is the latest open run between that suburb's blocks (after its
  last cycle if that fits, else before it); a start in an earlier open run is still accepted.
- `block` includes "levers open at 04:30" but not the watch or the day over, which stay
  `applyInput`'s (as `startBlock` does). `flexDel` before 04:30 answers "no such block".
- `grid.log()` takes an object of extra fields; new exports `grid.leverView`, `grid.flexDelBlock`;
  `createState` throws unless `levers.suburbs` follows `city.suburbs` in order.
- `cost.flex` runs one loop over every district, only while some suburb's relief is non-zero,
  summing `reliefSubMW[sub] × roofFrac` over the lit ones (no scratch array).
- Tests: `tests/levers.test.js` (13 tests, 2.1 s alone) and `tests/levers-day.test.js` (8, 1.2 s),
  including a replay of a DESK day to 15:05 with 13 bookings and cancels, bit-identical.
- Refusal order (sim/README §6): levers null → "levers open at 04:30" → the menu's "not offered
  today" → locked and the rest.

**The app as built:**
- The card's own keys are `CARD_OWN = /^(Arrow\w+|Page\w+|Home|End|Enter|Tab|[sxp])$/i` in
  `app/shell.js` (S, X and P too, so no lever key leaks out of the card). **The card agent adds
  `-` and `=` there.** H is in `PANEL_KEEPS` (H closes the alarm panel and keeps the card).
- `vm.focus` never names a suburb or the card. A `{do: 'suburb', id}` sent while RESTORE has the
  focus (the map's dark-suburb click) opens the card without taking the focus; every other open
  takes it. A malformed falsy id closes the card.
- The stub's close press is `btn-suburb-close` (a kept id in §5). `#suburb-card`'s max-height is
  `calc(100vh - var(--desk-h) - var(--hdr) - 74px)`: 194 px at 1280×600, 8 px above `#planbar`.
- `app/shell.js` has **no eager slack** left in the app's share; the card agent's 0.8 KB is its own.
- `tests/cardshell.test.js` (5 tests, 1.2 s) passes to the card agent from wave 2.

**Owners added for wave 2:** the "blue with a soak booked" planview row is **view**'s (in
`tests/planview.test.js` or its own file); `tests/cardshell.test.js` is **card**'s.

### 31.12 Wave 2 and stage C record (2026-10-10)

Wave 2 (workflow `wf_47646134-efa`, cut short by a usage limit after three builders; resumed as
`wf_3d04cce3-ac0`, which finished the card in its worktree and ran every review and fix pass)
merged as `73dec4f` (par: 4 findings, 3 fixed, 1 a docs line done at stage C), `bf50118` (view:
13, 11 fixed, 2 handed on), `6696ba5` (card: 12, 11 fixed, 1 contract text) and `b079738`
(objective: 11, all fixed or amended). Whole suite after the merge: **747 tests, all pass,
40.9 s**. The final whole-branch review (`wf_fbb6570e-761`) and its fix pass are recorded
below.

**Stage C measures (§31.10), on `v4-core-2b.0` + wave 2:**

| | `desk` | `desk-weekend` | Gate | 2a (§28) |
|---|---|---|---|---|
| Zero unserved, 200 raw seeds | 191 (95.5%) | 195 (97.5%) | ≥ 85% | 191 / 195 |
| Forced heat, 100 seeds | 86 | 98 | ≥ 75% | 85 / 98 |
| RERT armed, raw | 14 (7.0%) | 1 (0.5%) | ≤ 25% | 15 / 1 |
| Black days | 0 | 0 | 0 | 0 |
| SECURE states holding 49.5 Hz, raw | 6,481 of 6,481 | 6,684 of 6,685 (49.497 Hz, seed 106) | all | 6,495 / 6,684 of 6,685 |
| Par's soak days / air-con days, raw | 0 / 1 | 1 / 0 | — | — |
| Par's soak / air-con days, heat | 0 / 8 | 0 / 1 | — | — |
| MSL3 | never | never | only after a noon contingency | never |
| SECURE states holding 49.5 Hz, forced heat | 2,078 of 2,080 (49.478 Hz, seed 465) | 2,667 of 2,667 | all | `main` gives the same two misses on seed 465 (2,068 of 2,070): pre-existing, not 2b's |

Par uses the levers rarely, as Q-58 intends: rule 1 needs an MSL1 notice whose minimum lies in the
soak window (one weekend day in 200), and rule 5 a shortfall its pre-cool does not land on (one
weekday in 200, eight forced-heat days). On `desk` raw, 106 MWh relieved for $42,500.

**ALL-IN letters** (`--proxy competent,lean,commitAll --allin`, 200 days): competent A on 154
(77%, gate ≥ 70%); commitAll loses A on 191 (95.5%, gate ≥ 30%); **lean A on 96 (48%, gate
≤ 40%: not met)**, as at Q-48 (48.5%), so the 2b levers do not move it; `LETTERS` stay
A ≥ 962, B ≥ 684, C ≥ 351. Par's median ALL-IN $9.746M (desk seed 55).

**The follower** (`tools/follow.mjs`, the accept lists): `desk` 11 of 11 days with nothing
unserved, `desk-weekend` 12 of 12, none black; the no-input day still fails 11 of 11. It soaks
all six suburbs on every MILD day (and once on a HOT weekend) and never cycles air-con. ALL-IN
points against par: MILD median 1,015 (991–1,068) on weekdays and 1,021 (1,009–1,089) on weekends;
HOT 979–1,024 except `desk` seed 3 (621: the follower arms the reserve diesel, as in 2a §28).
That is Q-58's edge: on mild days a player who soaks beats par.

**The final review** (`wf_fbb6570e-761`: seams, docs truth, the player; each major checked by a
skeptic): 16 confirmed (1 major, 15 minor), none refuted; one fix pass (`2b-final`, merged as
`81561a7`) fixed them and V-1:
- **S1, aims that flickered.** `aimFlex` searches columns at `env.s`-based times, so its rounded
  aim flipped between two 5-minute marks about every 2.5 real s at 120×, and the card and the line
  kept changing their time. Now the line keeps an aim within one 5-minute step of the one it
  shows (`stick`, `cityAim` in `app/objective.js`; `game.js` passes `held`), and the card books
  the shown line's time (else its own held default). `aimFlex` is unchanged. Followed DESK seed 7,
  06:30, 60 samples: 12 and 11 changes before, 0 after.
- **V-1, the stack's blue with soaks.** The projection's export room is now the planned tie
  export (`obs.plan.tie` from `obs.tie.setMW`, capped by `exportLimitMW`, 0 while tripped). The
  90th-percentile error of blue against the sim's cut, 5 minutes ahead, fell from 84 to 37 MW; the
  rest is the system re-dispatching the tie every few minutes.
- Smaller: the tray names the soak only for a low still ahead and MSL2's words say "a gas unit
  if one is running"; every ✕ verdict names its relief; a MILD card makes no air-con response
  claim; the card's refusal strings read as the player's words (`grid.LEVER_WHY`); the stack's
  text names blocks drawn only as ghosts; the card is 20 px shorter and its verdict sits under its
  aim (190 of 194 px at 1280×600 with a booked cycle); one shared `knotMW`/`aimLineMW` in
  `sim/autopilot.js`; READMEs and the air-con help made true.

**The browser pass** (one pane, port 8653, seed 7, a HOT `desk` day, 1280×600, 1280×720 and
1920×1080): the card opens on the left, fits (188 px with a booked cycle, ≤ 194), hides no "?",
and its verdict and costs read right ("$22.5k" for 45 MW × 1.25 h × $400); the patience glyph
draws as a plain text character, not a colour emoji; the soak's band shows along the skyline.
**Found and fixed (`f5f1c74`):** a soak's code plate sat under its band, beneath the plan's key
handles, and could not be read; every code now sits above the skyline.

**Versions and totals:** `v4-core-2b.1`, golden re-recorded (masked diff: the Build line and the
machine lines only). Whole suite 749 tests, all pass. First visit **387.8 KB** (394.9 before 2b):
Q-49's moves freed 16.7 KB, 2b added about 9.2 KB (cap 9.4), **12.2 KB left for 2c–2e**. On
demand: `app/suburbcard.js` 6,098 of 6,144 B, `content/text.js` 18,180 B (cap 18.5 KB),
`app/perf.js` 1,821 B. The follower re-run after the final fixes gives the same days (MILD median
1,015 / 1,021, every day clean).

**Open after 2b** (none blocks the slice):
- The lean proxy's 48% A (S-5's ≤ 40%), carried from Q-48.
- No drag in time on the stack (U-3), no suburb colours, no ticker or petition (U-8), no patience
  recovery (W-2): decided out of 2b (Q-54, Q-57).
- The pre-existing briefing bug: an input accepted in the briefing sets `modeLocked`, so a HAND
  choice is lost (the card never sends in the briefing).

## 32. The day: one clock, a designed day, a gate, and a night that runs itself (contract, 2026-10-12)

The owner, 2026-10-12: "work on the next feature please". By the Phase 2 slice table that is
**2c, the day**: SPEC D-1 (four acts), D-2 (the clock profile), D-4 (two time domains), D-5
(watch, then respond), D-6 (speed control), D-7 (hand-flying), D-8 (the event director), D-9
(the solvability gate), D-10 (decisions per act) and D-11 (the night roll).

How we read it (workflow `wf_1be059fb-2fe`: seven readers and two critics; reports kept in the
session scratchpad, `2c/understand-*.md`, `2c/critic-*.md`):
- **Much of the pacing exists.** `app/director.js` already has WATCH, the respond card, RESPOND
  30×, FOCUS, FAST, PAUSE and ALARMS. CRUISE is a flat 120×, so a day is 705 real s (210 of
  them the night). The D-2 profile already exists as data (`V.REF_PROFILE`, exactly 245.000 real
  s) and only par's pace reads it.
- **D-8 is a rewrite of the game day's event menu, not a tuning pass.** `desk` inherits
  classic's legacy menu: 90% of 2,000 dates break at least one D-8(c) spacing rule, every
  storm and cloud warning is under 25 real s (16.5 and 2.5–4 s), 18% of days trip before 09:00
  and 22% trip in the night roll. The temperature classes already meet D-8(a) (15.4 / 30.6 /
  54.0%).
- **The SPEC contradicts itself in about eight places** (D-7 against D-11 twice, D-11 against
  Q-18, S-1 against S-6/S-7, D-2's accept against Q-18's held start, D-8(b)'s Act III against
  its overlays, Act II's "deeper minimum", the storm's tie trip, the act windows against
  D-8(c)'s spacing). §32.1 decides each.
- **The riskiest item is the Act I restore task**: it changes S-1, the score, the SHEDDING
  level, the dispatch, par's fairness and every tool's "clean" day, and at 270× one real second
  of delay is about $675k of VCR (7% of par's ALL-IN): a reflex test (OD-8, §0 forbid it).
- **The budget.** 12.2 KB of first visit is left for 2c–2e; 2c needs about 8–9 KB eager. The
  remaining leading header comments of first-visit files are 13.2 KB gzip (measured): a second
  Q-49 move before the waves (Q-61).
- **Frame cost.** The objective line recomputes every 30 grid-s: every 3.3 frames at 540× and
  every frame at 2,100×, at 2.3–4.7 ms each. Grid-time cadences tuned at 120× must follow the
  profile (Q-63).

Realism (checked by the readers; sources go to SPEC §8.1 at stage C):
- **Overnight decommitment** is the generators' own market behaviour in the NEM: Q-18's
  all-day player commitment was the simplification, and a night shift that stands units down is
  more realistic, not less.
- **The 30-minute secure state** is NER cl. 4.2.6. The NEM's test (the next credible contingency
  contained above 49.5 Hz) would show par insecure on most mornings (par is TIGHT 100% of Act I
  on two of three probed seeds; previews 49.30–49.49 Hz): a fleet-containment question for a
  later slice. 2c's "secure again" is the R5 ≥ L floor, labelled (Q-74).
- **Network outage notices** (a tie derate) and **availability declarations** (a late return
  from maintenance) come days to hours ahead: honest at the briefing. **Fog** in late summer is
  a stretch: dropped. **Storm feeders** are the DNSP's to repair; it gives an ETR; the
  operator gates the pickup for cold load. Pricing the operator's delay after the hand-back at
  VCR is a game abstraction (labelled).
- **The Bureau warns of heatwaves days ahead**: announcing at the briefing is more realistic
  than 10:30.
- **A front over every suburb** takes about 1.5 GW of rooftop in under an hour: at the top of the
  range for a city with 5 GW of rooftop, plausible with a band and a lag across suburbs.
- **No NEM region flies without AGC**: HAND stays a labelled game mode.

### 32.1 Decisions (owner-delegated, "most fun within realism"; SPEC §9.1 at stage C)

This is the contract after its review (§32.13): where a row changed, the review's ID is named.

| # | Decision | Why |
|---|---|---|
| **Q-61** | **Budget: the second prose move.** Stage A moves the remaining leading header comment of every first-visit JS file into the READMEs (`sim/README.md` §11 for sim files, §32.12 here for the rest), each file keeping its first line and a pointer, measured (about 12 KB gzip; probes 11.2–12.3). 2c's eager total is **11.4 KB** (§32.3), so 2d and 2e keep about 12–13 KB. `tests/budget.test.js` enforces first visit ≤ the post-move total + 11.4 KB; agents measure their own share with `tools/perf.mjs --sizes` (no frame run). On-demand caps: `content/text.js` 20 KB, `content/alarmhelp.js` 5.5 KB. F-11 stays 400 KB; raising it stays the owner's call. (M10) | F-11 stays literally true with no build step and nothing the player can see. |
| **Q-62** | **One clock: `sim/clock.js`.** Pure, imports `params.js` only. `V.REF_PROFILE` stays the one table. The **ease** is linear in pace (1/rate) across a grid window W = 2·`CLOCK_EASE_REAL_S`·r1·r2/(r1 + r2) centred on each of the seven interior boundaries: it lasts exactly 2 real s and keeps the integral over every whole window, so the day stays **245.000 s**; a span cut inside a window differs from the step profile by at most 0.375 s per cut end (0.433 s in HAND, at 21:00), 0.542 s with both ends cut (0.600 s in HAND): inside the leads' 1-s margin. Before 04:30 the rate is the first segment's, after 04:00 the last's. Every mode change (watch, card, RESPOND, RESTORE, FOCUS, PAUSE, FAST, ALARMS) is instant, because each answers the player or the physics. Par keeps the step profile (`stepReal`, moved from `autopilot.js` bit-identically). The director, the D-8 leads, the objective's reading lead, the tray's card life and the stack's cadence all read this module. (RC-15, F11) | The player's clock and the guarantees the day makes about it are one function. Exact arithmetic, pure in grid time, so tests and `tests/lib/play.js` integrate it with no frames. |
| **Q-63** | **The rate director plays the profile.** CRUISE = `clock.rateAt(s, hand)` with `hand = state.control.handFlown`. The badge names the segment and its **target** rate ("PEAK 150×", never a number counting through an ease). FAST = 3 × CRUISE, refused in WATCH, the card, RESPOND's 30× part, RESTORE, FOCUS, ALARMS and NIGHT, and **released by every new tray card that rings** (news, warn notices, MSL2 and MSL3, a feeder cleared; MSL1 is information), any new P1/P2 alarm and any new ask. RESPOND: 30× from the card until back in band or 5 grid-min, then the profile. Grid-time cadences become profile-derived functions of grid time: the objective recomputes when grid time has moved max(30 s, `rateAt` × `OBJ_EVERY_REAL_S` 0.4 real s); its reading lead is `gridAfter(s, 13 real s) − s`; a tray card lives `TRAY_LIFE_REAL_S` 20 real s of `stepReal` from max(its atS, 04:30) (a warning issued in play until its onset, if later; briefing cards the plain 20 s); the stack's idle redraw is at most `STACK_MAX_HZ` 10 a real second. (F-12, F14, F-6, M6) | Every clock the player reads runs at the eye's speed whatever the segment; FAST cannot run the player past a warning (D-8(d)'s 25 s assume it stops). Deterministic, so `play.js` stays exact. |
| **Q-64** | **HAND (D-7).** Every profile speed is halved **from 04:30 to 21:00** (the HAND clock is 466 + 12 = **478 s**). **In the briefing the choice is `state.control.mode`**: while `phase === 'briefing'` the game applies `{type: 'mode'}` inputs (the card's AGC/HAND buttons, the desk's AGC key) and refuses every other sim input with a blue "Take the desk first: Enter."; the card's buttons draw from `obs.mode`; `briefAgc`, `game.agc` and `takeDesk`'s mode argument go. `control.handFlown` is set by the sim on the tick the day reaches 04:30 with the mode HAND, and never cleared, so tapping HAND then AGC never tags an AGC day. At 21:00 the night shift takes the desk in both modes: a sim rule (desk scenarios only) sets the mode to AGC, clears every station's MAN flag and logs `NIGHT_SHIFT`; `handFlown` keeps the tag. The end card says HAND-FLOWN in 2c; history and the share card wait for Phase 4. D-7's accept reads "AGC never acts in HAND before 21:00". 2e owns the briefing card's HAND copy (D-3). (M5, RC-11) | A HAND night with no input shed 571–625 MWh (measured): a 21:00 handover is how control rooms work and keeps D-11's 12 s for everyone. One place holds the choice, so the card, the desk key and the day can never disagree. |
| **Q-65** | **The event director is `sim/dayplan.js`** ("director" stays the rate director's name). `createState` and `weather.prerollRegime` delegate to it when the scenario has a `dayplan` block (`desk`, `desk-weekend`); classic keeps the legacy `prerollEvents` and `prerollRegime` untouched (Q-19). **Every share, window and size is scenario data**, so 2e can pin the first shift (§4.1) as a scenario variant by data alone. Records keep the code's shape `{id, atS, type, args, contingency, warned}` and gain `act` (the act the plan designed the record for: 1, 2 or 3, Act I's briefing items included; 0 only on legacy records and notices) and `crisis` (bool), hidden in ext for tests, tools and 2d's debrief. The temperature draws (`EXT_REGIME` a = 0, a = 1) are kept, so every pinned seed keeps its day type; new draws use `EXT_REGIME` a = 2 and `EXT_EVENTS` slots from `DAYPLAN_SLOT_BASE` 64 (no legacy counter moves). On a dayplan day the dayplan block is **the one climatology**: the plan's records, the forecast (through `weather.climate(scn)`) and the texts read it, never `scn.events`. (RC-12, RC-5) | Classic stays the regression anchor with its golden numbers; a data-driven plan is testable over 2,000 dates in milliseconds; one copy of each number cannot drift. |
| **Q-66** | **Act III, one crisis per date, exclusive:** heatwave 15% \| storm 25% \| wind drought 20% \| calm 40%. Storm and drought are drawn among the non-heatwave days on a = 2, so the shares are shares of all days; `regime.cls` on desk is `heat` \| `storm` \| `drought` \| `calm`, and desk has its own `weather.stormShare` 0.25 and `droughtShare` 0.20 (classic keeps `P.STORM_SHARE` 0.30). **Heat:** announced at 04:00, onset 12:30–14:30, end min(onset + 6.5 h, 20:00). **Storm:** arrival 15:30–19:00, every storm time relative to the arrival, pass min(arrival + 140 min, 20:50); the link trip is drawn on 60% of storms, counts as **unwarned**, falls ≥ 30 real s after the arrival and the cut-out start and before the pass, or not at all (feasible on about 45%, so it happens on about 27% of storm days; the test reports the share). **Drought:** warned, onset 15:00–18:00, **plus** the calm day's trip (D-8(b) read literally: drought is an overlay, so Act III is "otherwise"). **Calm:** an unwarned trip of the largest online machine by output, 17:00–19:30. (RC-13) | D-8(b) says "the heatwave or storm", singular; a storm and a drought on one evening is physically contradictory (today's menu allows it). The evening trip is the game's signature moment (K-15, D-21, D-24), kept on 60% of days. |
| **Q-67** | **Act II, one belly crisis per date.** Non-heat days: a **warned cloud front over the suburbs** 40% \| an unwarned trip of the largest unit 25% \| the smelter 20% \| the tie 15%. Heat days: unit 40 \| smelter 30 \| tie 30 (no front under a heatwave's clear sky). Trips 09:00–14:30; front onset 10:00–14:30 and never before the Act I derate's end + 30 min, clearing after 40–110 min. "A deeper-than-forecast minimum" is **dropped**: a hidden bias big enough to be a crisis would break L-2's coverage or leak hidden state (S-4). The tie trip keeps P-4's MSL3 path ("a noon tie or smelter trip") and Q-33's tie-out rise alive. If D-8(c) leaves no feasible minute for an Act II trip, the crisis becomes the front (non-heat) or none (heat; counted and reported). (F-11) | Every belly gets one decision that matters and none that is unfair; the front is a commitment test with 130–175 grid-min of warning. |
| **Q-68** | **Act I: a warned constraint every date, plus load to restore on 85%.** Constraint (announced at 04:00): a **tie import derate** 50% (400–550 MW until 10:00–12:00) or a **late return from maintenance** 50% (`desk`: CCGT 2 unavailable until 06:30–08:00; `desk-weekend`: coal 4 until 10:00–13:00; only a unit that is off in the scenario's 04:00 commitment). Fog is dropped (late summer). **Restore task:** two **rotation** districts of one pre-rolled suburb dark from 04:00 ("overnight faults"), each with its own clearance on a 5-min mark in 06:30–08:00, ≥ 15 grid-min apart, both public at 04:00 (the network's ETR) and exact. The smelter variant waits for Phase 3 (it needs an input, a bay row and par's rule, and a potline's value of reliability is not the residential VCR). The forced first shift (2e) may set one clearance for both feeders and never delays CCGT 2. (RC-6) | Act I gets real decisions (D-10: 3–5): whether to start CCGT 2 earlier for ~300 MW coming back on the steepest ramp, two restores, and a constraint to plan around. Rotation districts keep UFLS fully armed. |
| **Q-69** | **The task's accounting (S-1).** A task district is **held** (the network's outage) until its `clearS`: not unserved, not SHEDDING, not in SAIDI/SAIFI, priced at nothing. From `clearS` until restored it is the operator's: `taskMWh` (LIGHTS ON, ALL-IN at VCR) and SAIDI/SAIFI. `score.heldMWh` records the network's part for the debrief, never priced. **SHEDDING (LOR3) counts only `ufls` and `directed` darkness**, so DIRECT SHED, the red price and the "short now" line ignore a task feeder before and after its hand-back. The opening balance uses lit demand. The dispatch, par's plan and the stack carry the **announced return** at `clearS` (the ETR is public). **One clean predicate**, `market.isClean(score, black)` = not black and `uflsMWh + directedMWh === 0`, serves D-9(2), S-7's Hard-day trigger and every tool's "clean" day, so par's own restore lag never rejects a date. **S-6's PERFECT** is `market.isPerfect(score, black)` = `isClean` and `score.taskLateMWh === 0`: every handed-back feeder closed within `RESTORE_PACE_MAX_S` of when it may be (the later of its `clearS` and the last restore + `RESTORE_INTERVAL_S`). One rule for MWh and SAIDI (this overrides §30.7's note "task districts count from the second they go dark"). (F-4) | Counting from 04:00 would add about $25M of VCR to par and the player alike and squeeze every grade about 3× toward 1000. "From the hand-back, every minute dark is yours" is one teachable rule, and PERFECT still asks you to close the feeders. |
| **Q-70** | **RESTORE pace.** At each district's allowed second (the later of its `clearS` and the last restore + `RESTORE_INTERVAL_S`) the rate director plays **`RESTORE_PACE_RATE` 30×** (badge "RESTORE 30×") until that district is restored or for `RESTORE_PACE_MAX_S` 300 grid-s (≤ 10 real s), then the profile: a pace, not a hold (K-16 stands). FAST is refused in it. **Until this browser has closed a task feeder** (`seen.restore`, kept in `gridwatch:v4:seen` like `seen.watch`, set by the first accepted restore of a district with `clearS ≥ 0`), it plays at `RESTORE_FIRST_RATE` 10× over the same 300 grid-s (≤ 30 real s), badge "RESTORE 10×". The FEEDER_CLEAR card says what to press ("…repaired: close its breaker (R, then Enter)"), its button goes to the RESTORE bay, and the bay's tab glows at each hand-back. Par's reference playback counts the same public segments at 30× (each `clearS` to + 300 grid-s; desk only, so classic's par is bit-identical). (F-8) | Without it one real second at 270× costs 4.5 grid-min of a district (≈ $340k; ≈ $675k for both), and par's own 3-real-s pace lags 13.5 grid-min: a reflex test and a par that every attentive player beats by ~80 points. With it a second costs 30 grid-s, the first time it is gentler still, and the hand-back becomes a moment. |
| **Q-71** | **Warning leads (D-8(d)).** A hazard is warned at the latest whole minute with `clock.stepReal(warn, onset) ≥ LEAD_REAL_S` 26 (25 s plus a 1-s margin) and onset − warn ≥ the answering start + 2 grid-min (a GT; it never binds): cloud 130–175, storm 65–115, drought 65–123 grid-min. **Briefing items** (the heatwave, the tie derate, the late return, the feeder ETRs) are announced at 04:00, before the clock starts, and are exempt from (d). Pauses, FOCUS, watches and RESPOND only add to a lead; FAST is released by the warning (Q-63). (F11) | D-8(d) exactly, on the clock the player plays. |
| **Q-72** | **Spacing (D-8(c)).** "Unwarned contingencies" are the pre-rolled Act II trip, Act III trip and storm link trip; an H-2 hot trip is the player's own overload behind a visible gate and is excluded. Rules: ≤ 2 a day; none before 09:00 or from 21:00; any two ≥ `SPACING_REAL_S` 90 real s (`stepReal`) **and** ≥ `SPACING_GRID_S` 60 grid-min apart (so none inside another's RESPOND window); none within `ONSET_CLEAR_REAL_S` 30 real s (`stepReal`) of a warned onset (heat onset, storm arrival, cut-out start, the front's onset over its first suburb, drought onset). **By construction:** the plan draws Act III first, then each later trip uniformly over its feasible whole minutes; an empty set falls back as Q-66/Q-67 say. A guard test checks 2,000 dates. | D-8(c) is a constraint solver in real seconds; drawing over the feasible set meets it every time instead of on 90% of retries. |
| **Q-73** | **The night roll (D-11)**, on desk scenarios (`scn.night`). From 21:00 the rate director's **NIGHT** mode runs the profile (2,100×, eased into), never FAST, and plays **no watch, card or RESPOND** for any contingency (logged only; the horn and the rings are quiet). **The desk refuses sim inputs** with a blue note, "The night shift has the desk: it stands down what the night does not need. Your day is scored at 04:00."; views stay open (W, the LOG, settings, L, the suburb card read-only, "?"), and so do pause, ACK and volume. **The night shift is one function for par and for the player:** `AP.nightMemo(obs)` builds, from the 21:00 observation alone, par's rules with the player's booked stops kept (the plan carries `obs.plan.stops`), an armed RERT's clock seeded so it can be stood down, and a grid-time pace of one action per `DISPATCH_S` (300 grid-s) instead of S-4's 3 real s (nobody plays the night). `runPar` swaps its memo for it at the first decision at or after NIGHT_S (a JSON flag, once); `app/system.js` does the same and stops its player-mode dispatch, so there is one plan writer at night. Its inputs are logged (origin `night`), so replay holds. No dayplan event falls from 21:00 (the TROUGH notice goes on desk). The plan bar becomes a **night strip** that counts up (SUPPLY, OUTAGES, CARBON, ALL-IN, SCORE vs par); the city's windows go dark on an occupancy curve; the end card is fetched at 21:00. Q-18 is amended: "the system never starts or stops a unit before 21:00". Classic (`night: false`) keeps today's night and its "no-input day = planOnly" equivalence. (RC-8, RC-9, F3, F-3, M3, F-14) | Seven grid-hours in 12 real s cannot be played, so nothing should ask to be. The same function on the same 21:00 state gives the same night, so identical play scores 1000; the soak's night-fuel reward (Q-52) still counts. |
| **Q-74** | **COVER after a trip (D-5's "secure 30:00").** `contingency.securedTick`: the first tick at or after the watch's end with `sec.r5MW ≥ sec.lMW` and no district dark for `ufls` or `directed` (task districts never block it); −1 until then; latched (also `contingencies[].securedS`). The N-1 gauge gains one row, named **COVER** so it never contradicts H-4's head word (SECURE/TIGHT/SHORT/SHEDDING). It shows while `obs.inRespond`, or while the latest contingency is past its watch and still uncovered, or while frequency is outside 49.85–50.15 Hz (H-11). **BAND** (FOS): "BAND LOW" or "BAND HIGH" with `fos.countdownS`, a draining bar over `FOS_RECOVER_S`, held 3 real s after the return as "BAND ✓". **COVER:** "COVER n MIN" with a draining bar over 30 min; "COVER ✓ T+n MIN" once covered; "COVER LOST" in amber if the level later falls to SHORT or SHEDDING inside the window; after 30 min uncovered "COVER ✕ n MIN OVER" in **amber** (titled "AEMO would direct a unit on or shed load here; GRIDWATCH only counts it"). Figures follow the dial's rules: m:ss only at ≤ 10× (the watch's slow part, the card, FOCUS, PAUSE), whole minutes rounded up above it, no figure redrawn more often than every 500 real ms; m:ss always in the aria label. While the row shows, the preview's "caught" words move into its title. Labelled in §8.2: the NEM's secure state is the next credible trip contained ≥ 49.5 Hz; relighting shed load within the 30 min is GRIDWATCH's. (F-1, F-2) | Measured: par is "not SHORT" 0.5 min after all 8 probed trips but SECURE (H-4) only 1–3% of Acts I and III, so H-4 would expire on most trips, par's included. A separate word keeps the head honest. |
| **Q-75** | **The dailies (D-9).** Attempt 0 of a date is its `YYYYMMDD` seed, attempt k is `YYYYMMDD + k·10⁸` (k ≤ 42); the scenario comes from the **date** (`scenarioIdOf(ymdOf(seed))`: Saturday and Sunday play `desk-weekend`). `content/dailies.js` ships **exceptions only**, `{v, from, to, attempts: {YYYYMMDD: k}}`, about 0.3 KB, with `dailyFor(date, stamp)`. `v` is the **build stamp** the list was gated under: `SIM_VERSION + '|' + scenarioHash(desk) + '|' + scenarioHash(desk-weekend)`. `tests/dailies.test.js` fails when a non-empty list's `v` differs from the build's stamp or covers fewer than 365 days, so any later sim or desk-scenario change cannot merge until the integrator regenerates. "Same temperature class" is temp **and** `regime.cls`. The gate runs along par's day: (1) the §3.2 bound plus air-con at rated MW in its window never falls below demand before booked flex, and (2) `isClean`. Cap: 40 attempts, then a loud failure; rejected seeds are reported as the Hard-day pool and not shipped (the practice menu is Phase 4). `tools/daily-gen.js` uses workers (`-j`) and prints the single-core time. next.html with no query plays today's daily; `?date=YYYY-MM-DD` that date's; `?seed=N` a raw seed, gated only if it is that date's listed attempt. At runtime a stale stamp still plays the listed attempt (never a rejected attempt 0) with `gated: false`; a date outside `[from, to]` plays attempt 0, and both the briefing and the end card say "Not gate-checked: this day may not be solvable". A deliberate Y-1 deviation (no string hash, no `SIM_VERSION` in the seed). (F4, F5, M4) | Today's links, the owner's played days, every `2026100x` test and par's cache keep working; a sim fix re-checks dates instead of re-rolling them; a stale list can never pass as gated. |
| **Q-76** | **Decisions per act (D-10), a measure.** An opportunity is a par decision (start, stop, restore, flex, callDR, armRERT, standDownRERT, a battery **mode** change, the rule-1 tie answer to a trip) or a director moment (a trip, its card, a warning, an MSL change, a feeder clearance, a unit's return, the tie limit's end), merged within 3 real s, on the step profile, 05:30–21:00. GUARD steps, battery re-sizes and re-dispatches are the system's work, not decisions. Measured once at stage C over the generated year, reported with per-act counts and by class (heat, storm, drought, calm); not tuned inside 2c (gate 1 decides). (F-10, F-15) | The raw par log passes trivially (60 actions, worst gap 24 s); the filter measured 5 / 6 / 12 per act and a 37.7-s worst gap on one day. |
| **Q-77** | **The returning-player proxy (D-8, K-12).** A `tools/` proxy: competent + it restores whenever the lamp allows + it takes every offered scope and closes cleanly. Offers come from the real rule, `G.offerWhy(obs, tally)` (exported from `app/game.js`; Q-78). A SYNC **matters** (K-12: it "removes a red or amber column that auto-sync would leave") when a 5-min stack column in [close, close + `AUTO_SYNC_S`] is red or amber at the offer **and** the MW the clean close gains in that column (the sync block, then the T2 ramp toward MIN) covers its gap (P50 or P90 minus supply, from `app/planview.js project`). The weaker count (the 4 minutes merely fall on a red or amber column) is reported beside it; if only the weaker count reaches 80%, stage C records a K-12/D-8 miss for the owner rather than relabelling the measure. Measured once at stage C on 100 dates. (F6) | K-12's own definition, made measurable without a counterfactual run per offer. |
| **Q-78** | **Acts on the face (D-1), and the scope offer.** The badge names the D-2 segment in words a stranger reads: PRE-DAWN, MORNING RAMP, SOLAR RISING, MIDDAY SOLAR, EVENING RAMP, PEAK, PEAK EASING, NIGHT ROLL; its title names the act ("Act II, the belly: rooftop solar floods in"). The Live Stack draws act ticks at 09:00, 14:30 and 21:00 ("II", "III", "NIGHT") and an onset marker at each warned onset ahead. No act banner in 2c (2e's introductions own act starts). The PEAK tile and K-12's "evening peak window" become D-2's Peak segment, 16:30–20:00: `app/alarms.js PEAK_H` stays in hours, derived from `clock.PEAK` ([16.5, 20]). **The scope offer (K-12):** 'respond' is D-5's window (`obs.inRespond`), one offer per contingency, the first unit to reach full speed inside it; 'tight' and 'peak' share one offer a day; at most `MAX_OFFERS` 3 in all, none from 21:00. The suburb card counts as "the map" for D-1 (it opens only from a suburb). (F-9, F6, F9) | The badge already says where in the day you are, in plain words; the offers go to the moments that matter instead of being spent on the morning. |
| **Q-79** | **Fronts over the suburbs** (P-2, Q-23 lifted). A warned front sets each place's sky, not its mean: from suburb j's onset (the event's onset + `frontLagMin[j]`) the sky moves linearly to the front's clearness (`frontMu` 0.32) over `frontRampMin` 10, holds there plus its local term (the regional noise suspended) until that suburb's lagged clear, then moves over `clearRampMin` 20 to the after-front sky (`clearMu` 0.92) and the regional process resumes from there. Lags in `city.suburbs` order, which is the map's west to east: SOL 0, HAZ 5, RED 20, HAR 25, TAL 40, SAL 45 min; the solar precinct (east of SAL) 50. That is about 50 km/h: a sweep of about 9 real s at 300×, the whole city under it 55 min after onset. The rooftop forecast carries the warned front from the warning with the same per-place shape, and while a front is forecast its band adds the clearing's own variance, (perK × (clearMu − frontMu))² × p(1 − p) with p the share of the clear window elapsed, in place of the flat ×2.5 (stage C measures L-2). The cloudWarn text may state the size ("rooftop output falls about 1.4 GW from 12:10"), computed at preroll from scenario data and the warned onset only. The map's glint already dims suburb by suburb; no moving shadow art in 2c. (F-7, m2) | The belly's crisis is visible on every roof the player can see, warned hours ahead, and the forecast knows it. |
| **Q-80** | **The heatwave at the briefing.** `heatAnnounce` at 04:00; `day.temp` stays MILD or HOT publicly (the heat is news, so `levers.menu` keyed MILD/HOT is unchanged); Q-38's HOT-morning bet and `heatWorstCase` are retired (a HOT day with no heat news at 04:00 has no heatwave coming); `dayText` is rewritten. | Hiding nothing leaks nothing, and the morning's STOP decision becomes honest. |
| **Q-81** | **Briefing items.** `createState` ends `ekMWs → weather.sampleSecond → events.applyDue` (every atS-0 record, into a discarded scratch `out`) `→ balanceOpening`, so `state.news`, the task districts, the tie limit and the outage exist at tick 0. The briefing's "Watch for" gives one brief per 04:00 news item, composed in `app/shell.js` from the item's kind and public obs (heat "heatwave 13:00–19:30"; tie "tie import ≤ 450 MW until 11:00"; outage "CCGT 2 out until 07:15"; network "SAL3, SAL4 feeders back 06:45, 07:05"), each ≤ 8 words, ≤ 30 words in all. At TAKE THE DESK the tray makes one card per briefing item with one ring (`T.trayBriefing`), and the recorder seeds them too; the full texts are on the cards. (RC-3, RC-14, F-6, M6) | The briefing tells what the day holds in a glance; nothing announced at 04:00 is lost before the clock starts. |
| **Q-82** | **Warnings at the new speeds.** Tray senders by kind: heat, storm, cloud and drought from WEATHER BUREAU (button to the stack); `tie` from MARKET NOTICE (to the tie); `outage` from STATION (to the unit's lever); `network` from NETWORK (to the restore bay). A unit's return and the tie limit's end are information cards (no ring) from STATION and MARKET NOTICE. One predicate, `A.isWeather(kind)` (heat, storm, cloud, drought), sets the WEATHER tile, routes the tray and counts in `content/alarmhelp.js`; the alarms see every news kind of a batch, not only the last. News texts on a dayplan day are ≤ 25 words and never repeat the sender (classic's texts unchanged byte for byte). In the night roll the horn and the rings are quiet. K-8's ≤ 8 audible alarms is re-checked on the profile clock. (RC-14, F-10, F9) | Every card is readable and goes where its decision is. |
| **Q-83** | **Classic is untouched.** Every 2c behaviour keys on scenario data (`dayplan`, `night`, a nonzero task or limit) and is exactly neutral on classic. Anything that writes a hashed state field on classic is a stage-A job; after stage A's one re-record, `tests/baseline-v4.test.js` (classic seed 4's row and par's hash) stays green in every worktree. An agent that turns it red stops and reports the cells; only the integrator bumps `SIM_VERSION` or re-records (if a classic hash move after stage A is ever unavoidable, the integrator re-records at that wave's merge, so the next wave starts green). (B1) | The regression anchor stays an anchor. |
| **Q-84** | **The owner's call, 2026-10-13: F-11 is a measured report, not a gate.** The first-visit size is still measured and reported (`tools/perf.mjs --sizes`, `tests/budget.test.js` prints it), but nothing fails on it: the 400-KB ceiling, the 2c total and the per-agent caps of §32.3 are dropped (the caps stay as a record of what each part cost). The on-demand modules keep their structure checks (nothing else is loaded by `import()`, they bring only each other); their size caps become reports too. Applied at the wave-2 merge (one agent edits `tests/budget.test.js` in wave 2). | Asked directly (§32.11): the limit had cost two rounds of moving comments out of the files and a byte ration in every agent's job, for a fraction of a second of load time on a desktop game. |
| **Q-85** | **The owner's call, 2026-10-13: heatwave days keep the evening trip.** On a heat day the plan also draws the calm day's unwarned trip of the largest online machine, 17:00–19:30, under every Q-72 rule (it amends D-8(b)'s "the heatwave, otherwise a trip"). Built at once in `sim/dayplan.js` (Act III's slot, after the heat onset). Measured: heat days' longest stretch with no ringing card fell from 128 / 138 / 148 to 72 / 83 / 109 real s (p10 / p50 / p90), and nothing rings after 14:30 on 0% of them (was 95.2%); the belly trip is unchanged (median 09:34). Forced-heat par (S-12 ≥ 75%) is re-measured at stage C. | Thermal plant trips more in heat; the hardest day gets its peak moment instead of an empty evening. |

### 32.2 SPEC amendments 2c carries (the integrator writes them at stage C)

- **D-1:** the suburb card is part of the map.
- **D-2:** "today's build runs at 2 (120×)" goes; the ease is linear in pace (Q-62); RESPOND
  "0–10 s". **Accept:** the profile integrates to 245 ± 3 s (AGC; HAND 478 ± 3). A scripted run
  presses TAKE THE DESK, Space (Q-18's held start), then Enter on each card. From Space to the
  verdict it is within ±5 s of E = `realBetween(04:30, end)` plus, for each span played off the
  profile, its real seconds minus `realBetween` over that span's grid seconds. The spans are
  each watch, each card, RESPOND's 30× part and Q-70's RESTORE at each allowed second, each
  read from the sim's records (the contingency's watch and card ticks, `backInBandTick` or
  +300 grid-s; the allowed second to the restore input or +300 grid-s), not from the director.
  With no input every clearance is a full RESTORE (10 real s against 1.1 s at 270×), so E ≈ 245
  + Σ watch + Σ RESPOND + 17.8 s on the 85% of dates with the task. The session table gains a
  row "RESTORE at 30× (Q-70): about 1–10 s per clearance, two on 85% of dates, one on the forced
  first shift" (17.8 s if never restored); the returning SHARE estimate moves to ≈5:34–5:58 and
  the first shift's to ≈6:42–6:58 (its upper end is over ≤6:50: a 2e risk, so 2e's scripted
  first shift restores at its introduction). "Link opened to SHARE ≤6:00 / ≤6:50" is measured
  when 2d's debrief and 2e's first shift land; 2c measures the verdict half, and the Phase 2 box
  "D-2 timing runs" stays open. F-5's "(a flat 120× before Phase 2)" and desk/README §2 follow.
  F-5 gains RESTORE (30× at each hand-back until restored or 5 grid-min; 10× until the first)
  and NIGHT (the profile; desk locked to sim inputs); CRUISE reads "75×–2,100× (HAND halves
  04:30–21:00)".
- **D-3:** "Watch for" ≤ 30 words inside the card's 60.
- **D-5:** "pre-rolled" unwarned contingencies (an H-2 hot trip is the player's own); "secure
  30:00" is named COVER: R5 ≥ L with no UFLS or directed district dark, with ✓ and a label
  (Q-74).
- **D-6:** "disabled during WATCH and RESPOND" means RESPOND's 30× part (and RESTORE, NIGHT); it
  releases on "any new ringing tray card, P1/P2 alarm, ask or contingency (P3 tiles and MSL1 do
  not)". The accept's end-state hash is checked on a 2-h slice in the suite and on one whole
  desk day once at stage C.
- **D-7:** the HAND clock is 478 s; "AGC never acts in HAND before 21:00"; the tag on the end
  card in 2c, history and the share card in Phase 4. The slice table keeps D-7 in 2c (halving,
  the bug fix, the tag) and leaves 2e the briefing copy.
- **D-8:** the record shape `{id, atS, type, args, contingency, warned}` plus `act` and
  `crisis`; Q-66/Q-67/Q-68's partitions; no deeper minimum; the storm's tie trip unwarned (about
  27% of storms); shares measured on raw candidates; scenario data so 2e can pin the first
  shift. (d): leads cloud 130–175, storm 65–115, drought 65–123 grid-min; heatwaves, tie derates,
  late returns and feeder ETRs are announced at the briefing and exempt. The §6 heat-share row
  names `tests/dayplan.test.js`; §6's cloud-lead row follows.
- **D-9:** "in Node, with workers"; gate (2) is `isClean`; replacement keeps temp and
  `regime.cls`; Q-75's seeds (a Y-1 deviation). Interim until Phase 4's F-8: `content/dailies.js`
  holds `{v, from, to, attempts}` (exceptions only, no stored par; the page re-runs par); a date
  in `[from, to]` always plays its gated attempt and a stale stamp cannot merge; dates outside it
  are labelled before and after play; Phase 4 replaces them with "No daily today — practice".
  Phase 2's ship line: "gate-passed seeds for every date in `content/dailies.js`'s `[from, to]`,
  stamped with the shipped build". The Phase 2 checklist gains "`dailies.js` re-checked at the
  slice's final `SIM_VERSION`" for 2d and 2e.
- **D-10:** Q-76's definition, stated as a measure.
- **F-11 (Q-84):** the first visit is measured and reported, not capped; §6's row reads "reported" and risk 11 closes. **D-8(b) (Q-85):** heatwave days also carry the evening trip.
- **D-11:** Q-73's night shift, desk lock and quiet night; scenario-gated; "≤ 12.5 s (12.4 s
  with the 21:00 ease)"; §6's row follows.
- **K-15/K-16:** except from 21:00 on a night scenario, where a contingency is logged only.
- **K-12:** offers per Q-78 ('respond' = D-5's 30-min window, one per contingency; 'tight' and
  'peak' share one a day; peak = D-2's Peak); "matters" measured as Q-77 defines it.
- **H-4:** LOR3 (SHEDDING) = UFLS or directed shedding. **H-11:** the countdown is met on
  next.html (2c); its debrief line is 2d's.
- **S-1/S-6/S-7** per Q-69 (S-6: "PERFECT: no UFLS or directed shedding, and every handed-back
  feeder closed within 5 grid-min of when it may be"). **S-4:** on night scenarios the 3-real-s
  pace applies 04:30–21:00; the night runs one action per 5 grid-min; the measured note says
  heat at 04:00.
- **Q-18** "before 21:00". **Q-38** retired. **Q-20/P-3** heat at the briefing. **Q-23/P-2**
  lifted. **K-13** gains the code's R5 ≥ cold-load rule. **L-2:** the front's band is the
  clearing's own variance (Q-79), measured. **§4.1** one clearance on the forced first shift.
  **X-23** closed by D-8 (DUCK at 15:00).
- **§8.2** rows rewritten (SPEC row and `content/text.js` entry together): compressed playback,
  event-dense day, the Act I restore task, rooftop solar (fronts), mild days (heat at the
  briefing); **ALL-IN score and VCR** (OUTAGES = VCR × every MWh dark that is yours: UFLS,
  directed, a black grid, and a task feeder from the network's hand-back until you restore it;
  before the hand-back it is the network's outage, recorded and never priced; pricing the
  operator's delay at VCR is a game abstraction); **reliability indices** ("count the outages you
  cause"; a task feeder counts from its hand-back, so these are not the all-outages basis for
  it; "come with slice 2c" goes); **LOR states** (a task feeder is never LOR3); **restore
  permissive** (a task feeder's first condition is the hand-back; until then "feeder under repair
  until HH:MM"); **AGC band** (HAND turns AGC off until 21:00). Added: the night shift; HAND;
  Act I's warned constraints; every daily is solvable (a fairness rule, not a property of real
  grids); game-sized warning leads; COVER (Q-74); RESTORE pace.

### 32.3 Who builds what, and in what order

Stage A runs three agents in parallel, then the integrator merges them, bumps `SIM_VERSION` to
`v4-core-2c.0` and re-records the golden once (classic: hash cells, Build and machine lines
only). Then three waves, each merged and measured by the integrator before the next starts:
wave 1 the sim (real, not stand-ins), wave 2 par, the clock and the view **on the merged real
sim**, wave 3 the objective line and the shell **on the merged real thing**. Stage C measures
once each, tunes once if a gate misses, regenerates the dailies last, and does the one browser
pass.

Every agent works in its own worktree **fast-forwarded to the branch it builds on** (agent
worktrees branch from `main`: `git merge --ff-only <branch>` first) and commits on a named
branch. No agent opens a browser or starts a server. No agent runs a `tools/` statistic unless
its job below names it, and then once.

| Owner | Builds on | Files (region) | Eager cap |
|---|---|---|---|
| **prose** (A1) | `the-day` | The **leading comment block only** of every first-visit JS file (list: `tools/perf.mjs firstVisit`) → `sim/README.md` §11 (sim files, under their existing headings) or §32.12 (others), each file keeping its first line and a pointer; `tools/perf.mjs` (a `--sizes` flag: file count, raw and gzip bytes per file, no frame run); `tests/budget.test.js` (the 2c ceiling, the text.js and alarmhelp.js caps); nothing else | −(measured) |
| **base-sim** (A2) | `the-day` | New `sim/clock.js`, new `sim/dark.js`, new `sim/dayplan.js` (neutral); `sim/params.js` (2c block); `sim/autopilot.js` (import `clock.stepReal` and `dark.*`, delete `profileReal`, `darkShare`, `litMW`; `refRealSeconds`'s `clears` parameter, unused; nothing else); `sim/step.js` (createState's order, `balanceOpening` on lit demand, state, observe, the 04:30 `handFlown` rule, `scenarioHash`); `sim/events.js` (`TYPE_ORDER`, the new types' appliers and texts); `sim/fleet.js` (fields, setters, `refreshHeld`, `startBlock`'s outage reason); `sim/grid.js` (`startFreeAt`/`onAtS` outage terms; the `securedTick` block at the end of `securitySecond`; nothing else); `sim/physics.js` (the preview's stand-in record gains `securedTick`; nothing else); `sim/weather.js` (`prerollRegime` delegates); `sim/market.js` (`heldMWh`, `taskLateMWh`, `isClean`, `isPerfect`); `content/scenarios.js` (the 2c data, §32.4.2); new `tests/clock.test.js`, `tests/lib/inject.js`, `tests/inject.test.js`; lists in `tests/state.test.js` (and its opening test :487–503), `tests/integration.test.js`, `tests/seams.test.js`, `tests/sim-lint.test.js`; `sim/README.md` §1, §5–§8 and new §11 subsections for clock.js, dark.js and dayplan.js | 4.3 KB |
| **base-app** (A3) | `the-day` | Test hygiene (§32.5.3): the 120×-literal tests, the desk-event fixtures (onto `legacyDesk()` in `tests/lib/sim-helpers.js` or `injectTrip`), the vacuous skip; the tools' clean predicate (`tools/par.js`, `tools/baseline-v4.js`, `tools/follow.mjs`, `tests/lib/follow.js`: a local copy marked `TODO(2c-merge)` until A2's `isClean` merges); new `content/dailies.js` and `tests/dailies.test.js`; `app/game.js` (`scenarioForSeed` through `scenarioIdOf`, `dailyFrom`, `game.daily`, `game.end.handFlown` and `.gated`, the exported pure `offerWhy` moved out of `updateOffers` unchanged); `app/shell.js` (the one boot line, `G.createGame({seed: …`: boot through `dailyFrom`); `app/director.js` (`modeOf`'s new fields, neutral); `app/tray.js` (sender and target tables for the new kinds) | 1.1 KB |
| **plan** (W1) | `the-day` after stage A | `sim/dayplan.js` (the real plan, §32.6.1), `content/scenarios.js` (the dayplan block's values and desk's `stormShare` only), `sim/events.js` (the dayplan-day wording of heatText, stormText, cloudText and the drought's text, gated on `scn.dayplan`); new `tests/dayplan.test.js`; re-pins of desk lines the live plan breaks with the task off (§32.6.1) | 3.5 KB |
| **grid** (W1) | same | `sim/grid.js`, `sim/fleet.js`, `sim/physics.js`, `sim/market.js`, `sim/step.js` (the night flip only); new `tests/task.test.js`, `tests/act1.test.js`; additions to `tests/grid.test.js` | 1.0 KB |
| **sky** (W1) | same | `sim/weather.js` (`climate(scn)`, fronts over the suburbs, the forecast and its band), new `tools/l2.mjs` (the revived L-2 method; not run by the agent); new `tests/front.test.js`; the `rooftop-model` lines of `tests/text.test.js` only if a test asserts the old wording | 0.5 KB |
| **par** (W2) | `the-day` after wave 1 | `sim/autopilot.js` (the tie limit, outages, the night memo and swap, rule 9 at the gate, RESTORE segments in `refRealSeconds`), `sim/dark.js` (the announced returns), `app/system.js` (the night swap; **the spike first**), `app/assist.js` (mirror the swap, or state it is classic-only), `tools/par.js`, new `tools/daily-gen.js`, new `tools/day-measure.mjs` (D-10 gaps, the Q-77 proxy); new `tests/night.test.js`, `tests/gaps.test.js`; rows added to `tests/dailies.test.js`; deliberate edits in `tests/autopilot.test.js`, `tests/system.test.js` | 0.8 KB |
| **clock** (W2) | same | `app/director.js`, `app/loop.js`, `app/game.js` (rate, cadences, `objectiveDue`, FAST release, the briefing mode rule, the night lock, the offer rule, the `trayBriefing` call), `app/shell.js` (the briefing-mode lines only: from `let briefAgc` to the end of the TAKE THE DESK block, and the frame's briefing block), `render/format.js` (the badge), `app/keys.js` (only if a key needs an answer), `tests/lib/play.js` and `tools/play.mjs` (the cadence mirror, `spaceMs`, the `clock` step, `--returning`); new `tests/clock-director.test.js`; deliberate edits in `tests/director.test.js`, `tests/loop.test.js`, `tests/next.test.js` :591–592, `tests/play.test.js` | 0.8 KB |
| **desk** (W2) | same | `desk/gauge.js` (Q-74's row), `desk/bay.js` (FAULT word, the repair reason, the tab glow), `desk/rotary.js` and `desk/calc.js` (the tie limit), `desk/desk.js` (the night lock note), `desk/desk.css`, `app/tray.js` (`trayBriefing`, card life, senders, the information cards), `app/alarms.js` (`isWeather`, news kinds, night quiet, `PEAK_H` from the clock), `content/alarmhelp.js` (PEAK's trigger and WEATHER's reading only), `app/watch.js` (the card's COVER words), `app/endcard.js` (HAND-FLOWN, the reliability line for task feeders, "not gate-checked"); new `tests/countdown.test.js`, `tests/tray-day.test.js`; deliberate edits in `tests/alarms.test.js` (K-8's clock), `tests/desk.test.js` | 0.8 KB |
| **map** (W2) | same | `render/map.js` (the occupancy curve, the feeder label with its times), `render/livestack.js` (act ticks, onset markers, the redraw cap, the night freeze), `app/planview.js` (`darkShareAt` and `litMW` per column, the tie limit, the outage in `earliestOnAt` and its mirror executor); `app/suburbcard.js` (a held suburb's face, §32.11; its on-demand cap may rise to 6.5 KB); new `tests/day-view.test.js`; deliberate edits in `tests/map.test.js` (:569 allowlist), `tests/livestack.test.js`, `tests/planview.test.js` (:640 allowlist) | 0.6 KB |
| **line** (W3) | `the-day` after wave 2 | `app/objective.js` (Q-80, the restore-task asks, derate and outage reasons, quiet at night, `stopSaving`'s night horizon, profile-aware constants), `tools/follow.mjs`; new `tests/objective-day.test.js`; deliberate edits in `tests/objective.test.js`, `tests/line.test.js`, `tests/day.test.js` | 0.4 KB |
| **shell** (W3) | same | `app/shell.js` (not the briefing-mode lines), `next.html`, `content/text.js` (+ its cap), `content/anchors.js` (append): the briefing's "Watch for", the HAND chip, the night strip, the end card's prefetch, `GOALS_TEXT` and the ALL-IN tooltip, the §8.2 rows; new `tests/briefing.test.js`, `tests/night-strip.test.js`, `tests/feedback-day.test.js` (new presses only), `tests/acts-audit.test.js` (D-1); anchors pinned in `tests/scoreface.test.js` :253–261 and `tests/text.test.js` :155–158 kept or deliberately repaired | 0.8 KB |
| **integrator** | all | merges, `SIM_VERSION`, the golden, SPEC.md, §32.11, the tools runs, `content/dailies.js`'s list, the browser pass | — |

2c total: **14.6 KB** eager (11.4 KB in the first draft; 12.4 KB at the stage-A merge; 14.6 KB at the wave-1 merge, §32.11: stage A 5,463 B and wave 1 5,048 B measured, so A2 4.3, A3 1.1, plan 3.5, grid 1.0, sky 0.5 KB; waves 2 and 3 keep their 4.2 KB; 2d and 2e keep about 9.3 KB). Caps are self-measured as base-to-head deltas (`node tools/perf.mjs
--sizes`); an agent over its cap reports the number and does not code-golf; the integrator
reallocates at the merge (at stage A's merge it compares A2's measured clock.js and dayplan.js
with plan's 1.8 KB before wave 1 starts).

**Rules for all.**
- Never change a §32.4 shape (a needed change is reported, and the integrator amends this
  section). Never touch another owner's file or region (if you must, one line, named in your
  report). Any later 2c agent may append one params line, named in its report.
- New tests go in your own new file; edit an existing test only to repair an assertion your
  change breaks on purpose, naming the line. Pre-existing overruns (`feedback.test.js` 7.4 s
  alone, `system.test.js` 6.5 s, alarms' K-8 2.46 s) are exempt unless you add time to them: add
  only list entries there.
- `npm run test:changed` picks 54 of 55 files for any sim or scenario change, so in the fix loop
  **name your files** (`node --test tests/x.test.js`); run the whole suite once at the end.
- A change that writes a hashed state field on classic, or moves any classic number, is a
  stage-A job or is gated on Q-83's keys. If your change turns `tests/baseline-v4.test.js` red,
  stop and report the cells; never re-record.
- `createState` gains no test-only parameter (pure in (seed, scenario)); every test-only way to
  put an event on a seed lives in `tests/lib/inject.js`.
- Moved header prose (sim/README §11, §32.12) that your change makes false is yours to fix; name
  it in your report.
- **Merge failures:** a failure that exists only on a merged branch belongs to the integrator,
  who fixes it if the fix is ≤ 10 lines (each named in §32.11), or relaunches the owner of the
  failing region as a **new** agent on the merged branch with the failing list (never
  SendMessage to a running workflow agent).

### 32.4 The shared shapes (stage A makes every one real; nobody changes them later)

**32.4.1 `sim/clock.js`** (pure; imports `./params.js` only). Sim seconds: 0 = 04:00, `DAY_S` =
04:00 next day.

```js
export const NIGHT_S;            // 21:00 = 61200 (the last REF_PROFILE segment's start)
export const ACT_S;              // [1800, 18000, 37800, 61200, 86400]: 04:30, 09:00, 14:30, 21:00, 04:00
export const SEGMENTS;           // frozen [{a, b, rate, name}] from V.REF_PROFILE and V.CLOCK_SEGMENT_NAMES
export const PEAK;               // [a, b] of the segment named 'PEAK' (16:30-20:00)
export function actAt(s)         // 0 before 04:30, 1, 2, 3, 4 = the night roll
export function segmentAt(s)     // index into SEGMENTS (0 before 04:30, the last from NIGHT_S)
export function targetRate(s, hand)  // SEGMENTS[segmentAt(s)].rate, x V.HAND_RATE_FACTOR before NIGHT_S when hand
export function rateAt(s, hand)  // eased (Q-62) at the 7 interior boundaries; targetRate elsewhere
export function stepReal(a, b)   // autopilot's profileReal, moved bit-identically (no hand, no ease)
export function stepAfter(s, realS)       // the earliest g >= s with stepReal(s, g) >= realS
export function gridBefore(s, realS)      // the latest g <= s with stepReal(g, s) >= realS
export function realBetween(a, b, hand)   // the integral of 1 / rateAt over [a, b), closed form
export function gridAfter(s, realS, hand) // the grid second reached realS real seconds after s
export function hhmm(s)          // 'HH:MM' of sim second s: the one formatter for the sim's texts from 2c on
```

Params (`sim/params.js`, 2c block, each with a source note ≤ 80 characters): `HAND_RATE_FACTOR`
0.5; `CLOCK_EASE_REAL_S` 2; `CLOCK_SEGMENT_NAMES` ['PRE-DAWN', 'MORNING RAMP', 'SOLAR RISING',
'MIDDAY SOLAR', 'EVENING RAMP', 'PEAK', 'PEAK EASING', 'NIGHT ROLL']; `RESTORE_PACE_RATE` 30,
`RESTORE_FIRST_RATE` 10, `RESTORE_PACE_MAX_S` 300 (Q-70); `LEAD_REAL_S` 26 (Q-71);
`SPACING_REAL_S` 90, `SPACING_GRID_S` 3600, `ONSET_CLEAR_REAL_S` 30 (Q-72); `DAYPLAN_SLOT_BASE`
64, `DAYPLAN_MARK_S` 300; `TRAY_LIFE_REAL_S` 20; `OBJ_EVERY_REAL_S` 0.4; `STACK_MAX_HZ` 10;
`NIGHT_ACTION_S` 300 (Q-73, = the dispatch interval).

Tests (`tests/clock.test.js`, < 0.3 s): `stepReal(PLAYER_START_S, DAY_S) === 245` and equals the
old `profileReal` on 1,000 random intervals; `realBetween` over the day is 245.000 ± 1e-9 (AGC)
and 478 ± 1e-6 (HAND); every interior boundary's ease lasts 2.000 real s; the night (NIGHT_S →
DAY_S) is ≤ 12.5 s in both modes; `gridAfter(s, realBetween(s, t)) === t` and `stepReal(s,
stepAfter(s, r)) ≥ r` exactly (`stepAfter` and `gridBefore` are the least or greatest float that passes); `rateAt` is continuous; classic par's end hash is unchanged
(in the golden test already).

**32.4.2 `sim/dark.js`** (pure; imports `./params.js` only; reads obs only): `darkShareAt(obs,
s) -> {shed, roof}` and `litMW(p50, roofMW, D)`, moved from `autopilot.js` (`darkShare`, `litMW`)
bit-identically by A2; at stage A `s` is unused (the present dark share, today's behaviour). From
wave 2 (par) a district with `clearS >= 0` counts as lit at every `s >= clearS` (the announced
return). Autopilot and `app/planview.js` import it.

**32.4.3 Scenario data** (`content/scenarios.js`). CLASSIC gets explicit `dayplan: null`,
`night: false` (no code infers "none" from absence). DESK (DESK_WEEKEND builds `dayplan: {...DESK.dayplan,
act1: {...DESK.dayplan.act1, late: {unit: 'coal4', untilH: [10, 13]}}}`):

```js
weather: {heatShare: 0.15, stormShare: 0.25, droughtShare: 0.20, mildShare: 0.55}, // desk's own (Q-66)
night: true,                                                                        // Q-73
dayplan: {
  simplified: true, note: '…',  // game tuning: shares, windows and sizes (Q-65-Q-68)
  act1: {
    derateP: 0.5, derate: {limitMW: [400, 550], untilH: [10, 12]},
    late: {unit: 'ccgt2', untilH: [6.5, 8]},
    task: {p: 0.85, clearH: [6.5, 8], gapMin: 15},     // two rotation districts of one suburb
  },
  act2: {
    windowH: [9, 14.5],
    mix: {front: 0.40, unit: 0.25, smelter: 0.20, tie: 0.15}, heatMix: {unit: 0.40, smelter: 0.30, tie: 0.30},
    front: {onsetH: [10, 14.5], clearAfterMin: [40, 110], frontMu: 0.32, clearMu: 0.92,
      frontRampMin: 10, clearRampMin: 20, afterDerateMin: 30},
    smelterOffMin: 45, unitLockoutMin: [90, 150], tieLockoutMin: [90, 180],
  },
  act3: {
    heat: {onsetH: [12.5, 14.5], lastsH: 6.5, endByH: 20},
    storm: {arriveH: [15.5, 19], arriveMu: 0.95, cutoutAfterMin: [30, 90], cutoutMu: 0.18,
      passAfterMin: 140, passByH: 20 + 50 / 60, passMu: 0.5, linkTripP: 0.6, linkLockoutMin: [90, 180]},
    drought: {onsetH: [15, 18], mu: 0.12},
    trip: {windowH: [17, 19.5], lockoutMin: [90, 150]},
  },
  notices: [{atH: 5 + 50 / 60, code: 'MORNING_RAMP'}, {atH: 15, code: 'DUCK'}],
},
```

`city.suburbs[j]` gains `frontLagMin` (SOL 0, HAZ 5, RED 20, HAR 25, TAL 40, SAL 45; the map's
west to east) and `rooftop.precinctLagMin` 50. On a dayplan scenario this block is the one
climatology (Q-65): the cut-out holds until the pass, as in the legacy menu; the heat's clear-sky
`clearMu` stays only in `events.heat`. Desk shares `CLASSIC.events` by reference, so nothing
edits it. Stage C's one tuning round may move values, never shapes.

**32.4.4 State** (stage A adds every field with its neutral value; all plain JSON):
- `control.handFlown` false: set true by `sim/step.js` on the tick the day reaches
  PLAYER_START_TICK with `control.mode` HAND; never cleared.
- `control.nightShift` false: true from NIGHT_S on a `night` scenario (wave 1 sets it).
- `city.districts[i].clearS` −1: a task district's hand-back second.
- `city.heldFrac` 0: Σ `share` of districts that are dark, `shedBy === 'task'` and `clearS >
  s`, kept exact by `fleet.refreshHeld(state)` (idempotent; no other writes), which
  `setDistrictDark` and the `feederClear` applier call.
- `score.heldMWh` 0, `score.taskLateMWh` 0.
- `tie.limitMW` `TIE_MAX_MW`, `tie.limitUntilS` −1.
- `units[k].outUntilS` −1.
- `conts[n].securedTick` −1 (`fleet.startContingency`, and the preview's stand-in record in
  `sim/physics.js`).

**32.4.5 `observe()`** (the frozen shape grows; `OBS_SHAPE`, `CONT_KEYS` and `SCORE_KEYS`
updated): `handFlown` and `nightShift` (top level, after `modeLocked`); `tie.importLimitMW`
reads `tie.limitMW` (was the constant) and `tie.limitUntilS` is new; `units[].outUntilS`;
`districts[].clearS`; `contingency.securedTick` and `contingencies[].securedS` (−1 or whole
seconds); `score.heldMWh`, `score.taskLateMWh`. Nothing hidden is exposed: every new value is
public at 04:00 (the briefing) or the moment it happens.

**32.4.6 Event records.** New types are inserted in `TYPE_ORDER` **before `smelterReturn`**
(information before contingencies; the relative order of existing types is unchanged, so
classic's sort is unchanged): `feederOut`, `tieDerate`, `unitOutage`, `droughtWarn`,
`feederClear`, `tieDerateEnd`, `unitReturn`. Every record gains `act` and `crisis` (Q-65);
legacy `prerollEvents` sets `act: 0, crisis: false`. Stage A writes every new applier for real;
the **consequences** in the grid are wave 1's. The new types' texts read only their args, ≤ 25
words, no sender prefix (the tray names the sender). **heatText, stormText, cloudText and the
drought's text are shared with classic** (their output is in `state.news`, so in `hashState`
and the golden; `tests/events.test.js` :133–143 pins the heat wording): while `scn.dayplan` is
null each returns today's string byte for byte, its classic branch unedited; the dayplan-day
wording (args only, ≤ 25 words, no sender) is plan's (wave 1). A2 does not edit those four
texts.

**Series keys.** `weather.prerollSeries` and `prerollRooftop` apply `windMu`, `clearMu` and
`clearMuAtLeast` at the record's own atS, whatever its type. So only a record that changes the
weather at its own second carries one: heatOnset, stormArrive, windCutout, stormPass,
windDrought, cloudOnset, cloudClear. No warning or briefing record carries one (droughtWarn,
stormWarn, cloudWarn, heatAnnounce, any Act I type); a warning whose text needs a weather number
carries it under another name, as an integer per-mille.

| Type | atS | Args | Applier (stage A) | Public as |
|---|---|---|---|---|
| `feederOut` | 0 | `{districts: [id, id], clearS: [s1, s2]}` | each district's `clearS` set **before** `setDistrictDark(…, true, 'task')` with `darkSinceS` 0; news | news `{kind: 'network', fromS: s1, toS: s2, text}` |
| `feederClear` | `clearS` | `{district}` | `fleet.refreshHeld(state)`; log `{sev: 'warn', code: 'FEEDER_CLEAR', msg, district}` | the record (a ringing tray card) |
| `tieDerate` | 0 | `{limitMW, untilS}` | `fleet.setTieLimit(state, limitMW, untilS)`; news | news `{kind: 'tie', fromS: 0, toS: untilS, text}` |
| `tieDerateEnd` | `untilS` | `{}` | `fleet.setTieLimit(state, TIE_MAX_MW, -1)`; log info `TIE_LIMIT_END` | an information card |
| `unitOutage` | 0 | `{unit, untilS}` | `fleet.setOutage(state, k, untilS)` (throws unless unit k is off); news | news `{kind: 'outage', fromS: 0, toS: untilS, text}` |
| `unitReturn` | `untilS` | `{unit}` | `fleet.setOutage(state, k, -1)`; log info `UNIT_AVAILABLE` | an information card |
| `droughtWarn` | warn | `{onsetS, muPm}` | news (log-only `windDrought` follows at the onset) | news `{kind: 'drought', fromS: onsetS, toS: null, text}` |
| `windDrought` | onset | `{windMu}` on a dayplan day | log only once a `droughtWarn` has made the drought's news (else as today, so a legacy record on a neutral desk day keeps its news) | the log |
| `heatAnnounce` | 0 on desk | as today, from the plan's onset and end | as today | as today |
| `cloudWarn` / `cloudOnset` / `cloudClear` | warn / onset / clear | cloudWarn gains `frontPm` (and may carry `roofDropMW`, Q-79); cloudOnset gains `suburbs: true, clearS` on desk; lags come only from scenario data | as today | as today |
| `stormWarn` | warn | gains `cutoutFromS`, `cutoutToS`, `passS` on desk | as today | news `{kind: 'storm', fromS: arriveS, toS: args.passS when present, else null, text}` |

**32.4.7 Fleet, grid and market helpers** (stage A, real, neutral when nothing is set):
`fleet.setTieLimit(state, mw, untilS)`; `fleet.setOutage(state, k, untilS)`;
`fleet.refreshHeld(state)`; `startBlock` checks the outage before minimum down time and returns
`'on outage until HH:MM'` while `outUntilS > s`; `grid.startFreeAt` returns at least
`outUntilS`, and `onAtS` for a booked off unit `max(b.atS, outUntilS) + startToMinS`, so
`planStart` refuses a booking before the return with the reason and `planKey`'s auto-booking
lands after it; the `securedTick` block at the end of `grid.securitySecond` (Q-74's rule, read
from `r5MW`, `lMW` and `shedBy`, never the level word); `market.isClean`, `market.isPerfect`;
`step.scenarioHash(scn)` (= the `scnHash` createState computes). `autopilot.refRealSeconds(fromS,
toS, conts, clears = [])` (clears unused until wave 2; three-argument calls unchanged).

**32.4.8 The app's side.**
- `D.modeOf(d, state)` returns its existing fields plus `segment`, `act`, `night`. Precedence:
  OVER > HIDDEN > ALARMS > PAUSE > WATCH > RESPOND-CARD > FOCUS > RESTORE > RESPOND > NIGHT >
  FAST > CRUISE, where NIGHT suppresses the watch and the card for a contingency from NIGHT_S.
  The view's night is `obs.nightShift` (real from wave 1), never `modeOf().night`.
- `G.offerWhy(obs, tally, mode)` (pure; 'respond' | 'tight' | 'peak' | ''; `tally = {n, extra,
  contN}`; `mode` optional: the page's director mode until wave 2's clock drops it; with it omitted 'respond' is `obs.inRespond`, the form par's proxy calls), `G.objectiveDue(game, s, mode)` (wave 2), `G.dailyFrom(search, date)`, `game.daily`,
  `game.end.handFlown`, `game.end.gated` (true | false | null; null is not a daily, so no label: "Not gate-checked" shows only for false); `G.dailyStamp()` (what `tools/daily-gen.js` writes as `v`); `G.OBJECTIVE_EVERY_S` stays exported as the 30-s floor.
- `A.PEAK_H` stays in hours (`[16.5, 20]` from wave 2); `A.isWeather(kind)`; `T.trayFrame(tr,
  s)`, `A.updateAlarms(st, input, ctx)`, `A.alarmInputFromState(state)` and `G.alarmCtx(game,
  nowMs, realDtS)` keep their signatures (Q-63's card life and Q-73's quiet night live inside
  them, so `play.js`'s light frame follows).
- `T.trayBriefing(tr, news) -> cues`: one card per `news` item with `atS === 0` through
  `cardOf`'s 'announce' path (sender, target, seen key as in play), atS 0 ("04:00"), returns
  `['ring2']` once if it made any card, else `[]` (classic stays neutral); its overflow evicts
  older cards first. `trayRecords(tr, recs) -> cues` keeps its meaning: a 'ring2' is exactly one
  new card that rings. Tray `SENDERS` gains `network: 'NETWORK'`.
- `content/dailies.js` (A3): `export const DAILIES = {v: '', from: '', to: '', attempts: {}}`
  (`v` written by `tools/daily-gen.js` as a literal, never imported); `seedOf(ymd, k)` =
  `ymd + k·1e8` (k ≤ 42); `ymdOf(seed)` = `(seed >>> 0) % 1e8`; `scenarioIdOf(ymd)` ('desk-weekend'
  on a valid Saturday or Sunday date, else 'desk'; the one date-to-scenario mapping);
  `dailyFor(date, stamp) -> {seed, scenarioId, gated, ymd}` (`date` a local `Date` or
  'YYYY-MM-DD'; `gated` only when `v === stamp` and `from ≤ date ≤ to`; a stale stamp plays the
  listed attempt with `gated: false`; outside `[from, to]` attempt 0 with `gated: false`).

### 32.5 Stage A (three agents in parallel, then the integrator)

**32.5.1 prose (A1).** Move every remaining leading header comment of the first-visit JS files
into the READMEs (Q-49's form: first line and a one-line pointer kept), inserting under existing
headings only. Change no code and no inner comment. Add `tools/perf.mjs --sizes`. Measure the
first visit before and after with `--sizes`, and put into `tests/budget.test.js`: first visit ≤
(the measured post-move total) + the 2c total (12.4 KB since the stage-A merge), whose failure message prints the total, the ceiling and
§32.3's cap table; `content/text.js` 20 KB and `content/alarmhelp.js` 5.5 KB on demand.

**32.5.2 base-sim (A2).** In commits:
1. `sim/clock.js`, `sim/dark.js` and their tests; `autopilot.js` imports them (classic par hash
   unchanged); the S-4 lint list becomes `['./params.js', './step.js', './clock.js',
   './dark.js']`.
2. The params block (§32.4.1).
3. State, observe and records (§32.4.4–§32.4.6); the 04:30 `handFlown` rule; the new appliers
   and their texts; the helpers (§32.4.7). `createState` ends `ekMWs → weather.sampleSecond →
   events.applyDue(state, scratch)` (Q-81) `→ balanceOpening`, which balances
   `fleet.litDemandMW(state)`: hydro takes the difference within each machine's range as today,
   and whatever hydro cannot take above its floor comes off the online coal machines evenly,
   each kept at or above its minMW (lit demand equals `env.demandMW` when nothing is dark, and
   hydro is never at a limit at 04:00 today, so classic and stage-A desk move only by the new
   keys). `tests/state.test.js` :487–503 compares supply with `fleet.litDemandMW(s)` within
   1 MW.
4. `sim/dayplan.js` **neutral**: `prerollRegime(seed, scn)` is today's formula and
   `preroll(seed, scn, regime)` returns `events.prerollEvents(seed, scn, regime)` with `act` and
   `crisis` added (it imports params, rng, clock and events only, never weather);
   `createState` and `weather.prerollRegime` delegate to it when `scn.dayplan`. The scenario data
   of §32.4.3 is added with two values staged: desk's `weather.stormShare` stays
   `P.STORM_SHARE` and `night: true` is inert until wave 1. Until wave 1, desk's climatology is
   the legacy `events` block (the plan is neutral).
5. `sim/step.js` exports `deriveExt(state)` (ext.series, ext.rooftop and ext.heat from
   ext.events, the very code createState uses) and `openDay(state)` (the atS-0 records, then
   `sampleSecond`, then `balanceOpening`), and createState calls them. `tests/lib/inject.js`:
   `injectEvent(state, rec)` refuses a record whose second has run (`rec.atS <
   ceil(tick / TPS)`), a second heatAnnounce or one on a MILD day; inserts the record after
   `evNext` at its (atS, TYPE_ORDER) place; calls `deriveExt`; and at tick 0 with atS 0 calls
   `openDay`. `stateWith(seed, scn, recs)` = createState plus each record injected.
   `tests/inject.test.js` (≤ 0.3 s): an injected cloudOnset leaves the sky unchanged before its
   atS and lowers it 30 min after; an injected heatAnnounce gives the heat window's derate; an
   atS-0 tieDerate at tick 0 is in `observe().news` with the limit set; a past atS throws;
   `stateWith(seed, scn, [])` deep-equals `createState(seed, scn)` on DESK and CLASSIC.
6. READMEs: `sim/README.md` §1 (clock, dark and dayplan in the import table; autopilot's list),
   §5 (state), §7 (records, the series-keys rule), §8 (observe), new §11 subsections for
   clock.js, dark.js and dayplan.js after `### step.js` (A1 only inserts under existing ones).
7. **Neutrality, once at the end (no tool run, no re-record).** (a) `tests/baseline-v4.test.js`
   is expected red on exactly :128 (par's end hash) and :134, whose diff lists `hash` and
   nothing else; report both; any other cell is a regression A2 fixes. (b) A scratch probe (not
   committed), run before the first commit and at the head: `runPar` on CLASSIC 4, DESK
   20261007, DESK 20261008, DESK_WEEKEND 20261003; compare `r.log`, and the final state's JSON
   with `ext`, `scnHash` and the §32.4.4 keys removed; report the four equalities.

**32.5.3 base-app (A3).**
1. **Test hygiene before anything moves.** `tests/lib/sim-helpers.js` gains `legacyDesk()` (and
   `legacyDeskWeekend()`): `{...DESK, id: 'desk-legacy', dayplan: null, night: false, weather:
   {...DESK.weather, stormShare: P.STORM_SHARE.value}}`, today's desk day for day. Tests that
   assert 120× literals (`director.test.js` :50/:52, `day.test.js` :41/:96, `play.test.js`
   :10–12/:22/:38, `next.test.js` :201/:252/:406/:1175/:1178, `feedback.test.js`
   :143/:145/:282/:284, `hold.test.js` :286, `alarms.test.js` :296/:384–392) read the rate from
   the page (`badgeText(modeOf())`, `D.rateOf`) so they pass at 120× now and on the profile
   later. Tests whose subject is not the plan but that ride on desk's pre-rolled events
   (`feedback.test.js` :322–364, `rooftop.test.js` :103–167, `events.test.js` :251/:604,
   `objective.test.js` :49/:123/:183/:209/:671, `levers-day.test.js` :270, `planview.test.js`
   :267/:521/:572/:613) are re-pinned onto `legacyDesk()` or `injectTrip`, so the dayplan commit
   changes only the plan's own tests. The vacuous skip in `director.test.js` :209 marks
   `seen.watch`.
2. **One clean predicate** in the tools (Q-69), with a local copy until A2's `isClean` merges.
3. `content/dailies.js` (§32.4.8) and `tests/dailies.test.js` (pure: `scenarioForSeed(seedOf(
   20261003, 1))` and `(…, 42)` are DESK_WEEKEND; `ymdOf(seedOf(d, k)) === d` for k 0..42; on the
   empty list `dailyFor` returns `{seed: ymd, gated: false}`; `?seed=` of a non-date gives
   `gated: false`; the stamp check skips while the list is empty). `app/game.js`:
   `scenarioForSeed(seed)` keeps its name and returns `SCENARIOS[scenarioIdOf(ymdOf(seed))]`;
   `dailyFrom(search, date)` (`?seed=N`: `{seed: N, scenarioId, ymd, gated: d.gated && d.seed ===
   N}`; `?date=`: `dailyFor(that date)`; none: `dailyFor(today)`); `createGame` takes `o.daily`;
   `game.end.gated`; `app/shell.js`'s boot line boots through it (one line). While the list is empty
   every date's daily is its YYYYMMDD seed, so play is unchanged.
4. `app/director.js modeOf` returns the new fields with neutral values (`segment: ''`, `act: 0`,
   `night: false`); `game.end.handFlown` (from `state.control.handFlown`); `G.offerWhy` (the
   predicate moved out of `updateOffers` unchanged); the tray's sender and target tables (Q-82).

**32.5.4 The integrator.** Merge A2, then A1, then A3; resolve `TODO(2c-merge)`; run the whole
suite; masked golden diff (hash cells, Build and machine lines only, classic numbers equal) and
A2's neutrality probe on the merged stage A; bump `SIM_VERSION` to `v4-core-2c.0`; `npm run
golden:v4`; `tools/perf.mjs --rates 120,540,1620,2100` once (the frame baseline); compare A2's
measured bytes with the caps; record §32.11.

### 32.6 Wave 1 (the sim, real)

**32.6.1 plan.** `sim/dayplan.js` for real (Q-65–Q-68, Q-71, Q-72):
- `prerollRegime`: a = 0 heat (u < heatShare), a = 1 MILD/HOT (as today), a = 2 the overlay
  among non-heat days (storm if u2 < stormShare / (1 − heatShare), drought if u2 < (stormShare +
  droughtShare) / (1 − heatShare), else calm). `cls` heat | storm | drought | calm. Desk's
  `weather.stormShare` becomes 0.25 here.
- `preroll`: Act I (constraint, task), then Act III, then Act II, then the notices; every draw on
  `EXT_EVENTS` slots ≥ `DAYPLAN_SLOT_BASE` with its own counter; times on whole minutes
  (clearances and heat onsets on `DAYPLAN_MARK_S` marks); warnings by Q-71 through
  `clock.gridBefore`; trips over their feasible minutes (Q-72); the storm link trip and cut-out
  relative to the arrival; the front's onset after the derate's end + `afterDerateMin`; nothing
  from 21:00; every record's `act` and `crisis`; the task's suburb and its two rotation districts
  drawn from the scenario's rotation list; the outaged unit off in the 04:00 commitment; the
  series-keys rule (§32.4.6); the cloudWarn's `roofDropMW` from scenario data and the warned
  onset only.
- The dayplan-day wording of heatText, stormText, cloudText and the drought's text (args only,
  ≤ 25 words, no sender), gated on `scn.dayplan`; classic's strings byte for byte.
- **Staging:** plan ships desk's `dayplan.act1.task.p` at **0** (every other value live,
  `derateP` 0.5 included); the integrator sets 0.85 at the wave-1 merge, after grid's semantics
  are in. `tests/dayplan.test.js` runs on a scenario copy with p 0.85.
- `tests/dayplan.test.js` (pre-roll only, ≤ 1 s): over 2,000 consecutive dates from 2026-01-01
  (each with its date's scenario) and over seeds 1–2,000 on `desk`: class shares ±2 points;
  storm 25 ± 2, drought 20 ± 2; zero violations of Q-72 (all five rules) and Q-71 (every warned
  onset's lead ≥ 25 real s and ≥ its start + 2 min); timing windows (D-8(e)); nothing from
  21:00; the task on 85 ± 2% with clearances in 06:30–08:00 ≥ 15 min apart and rotation
  districts of one suburb; one constraint every date, its outaged unit off at 04:00; no front
  before its date's derate end + 30 min; the series-keys rule (the set of types carrying each key
  is exactly §32.4.6's list; on drought days only `windDrought` carries `windMu`, at
  `droughtWarn`'s onset; `cloudOnset` at `cloudWarn`'s onset); the timing histograms of the Act
  II and Act III trips (not degenerate: the joint draw must not push every Act II trip into
  09:00–09:24), heat days' Act II trips reported separately; the link trip's realised share;
  classic's pre-roll unchanged (deep-equal on 200 seeds) and classic's heat, storm, cloud and
  drought news texts equal to today's strings. Show once, by hand, that the guard can fail
  (break a lead, see red, restore).
- Re-pin any desk test the live plan breaks with the task off, naming the lines, including
  `tests/autopilot.test.js` :84–127 (the donor seed's heat at 10:30); a behaviour another owner
  retires later (`heatWorstCase`, wave 3) is marked `{todo: 'wave 3 line: Q-80'}`.

**32.6.2 grid.** The consequences in the sim (Q-64, Q-69, Q-74, the Act I constraints), tested on
records put on a neutral desk day with `tests/lib/inject.js`:
- **Task districts:** `restorePermissive`'s **first** check is `clearS > s` → `'feeder under
  repair until HH:MM'` (the bay, `observe().restoreBlock`, the line and par's rule 9 then read one
  reason); `heldFrac` excluded from physics' unserved (exact when 0); `heldMWh` accrues instead;
  `splitShed` books task MWh only after `clearS`, and `taskLateMWh` from each district's allowed
  second + `RESTORE_PACE_MAX_S`; when nothing is dark at the end of a second it books that
  second's energy by the category of the districts relit in it (their last `shedBy`), never to
  UFLS; SAIDI/SAIFI skip held districts and count a task district from `clearS`;
  `security()`'s SHEDDING counts only `ufls`/`directed` darkness; physics' preview backup
  (save/restore) copies `city.heldFrac`. Cold load applies as for any district dark > 10 min.
- **The tie limit:** the dispatch clamps imports at `tie.limitMW`; R5's tie headroom and L's tie
  import use it; `tieDerateEnd` restores 800.
- **Outages:** the plan executor keeps a booking made through `planLoad` before `outUntilS` in
  `plan.starts`, passing over it without blocking later bookings, and starts the unit at
  `outUntilS` if it is still booked (`unitReturn` applies before `planSecond`).
- **The night flip** (`sim/step.js`, gated on `scn.night`): in `gridSecond` right after
  `events.applyDue`, when `s >= NIGHT_S && !control.nightShift`: `nightShift = true`; HAND → AGC;
  every station's MAN flag cleared (as `planRejoin` does); a `NIGHT_SHIFT` log record;
  `handFlown` stays.
- **Tests:** `tests/task.test.js` (held, the gate, the hand-back drops `heldFrac` by the
  district's share and the next settled second books `taskMWh`, task MWh from `clearS` within 1%,
  `taskLateMWh` 0 inside the pace and > 0 after it, two feeders on one clearance closed in time
  give 0, `isClean` still true after both are restored, a day with no restore `isClean` but not
  `isPerfect`, SAIDI from `clearS`, never SHEDDING on task darkness, DIRECT SHED refused on a
  healthy task morning, preview neutrality: `JSON.stringify` and `hashState` unchanged across
  `previewTrip` (unit, link, district) and `restorePermissive(…, {preview: true})` on a state
  with one held district, one past its `clearS` and a preview that operates UFLS within 10 s;
  show once by hand that the last can fail), `tests/act1.test.js` (the derate clamps imports, R5
  and L follow, the end restores; `planStart` before `outUntilS` refused with the reason; a
  `planLoad` start at 06:00 with the outage until 07:30 waits; `onAtS` puts the unit at MIN at
  `outUntilS` + startToMin), additions to `tests/grid.test.js` ("AGC never acts in HAND before
  21:00": every second of sampled windows 06:00–06:30, 12:00–12:30, 20:30–21:00 after a jump;
  AGC acts after 21:00; `securedTick` stays −1 while a UFLS district is dark with R5 ≥ L, stays
  −1 after `fos.directed` ends with directed districts still dark, is set at the second the last
  is relit, and a held task district does not block it). Each new file ≤ 3 s.

**32.6.3 sky.** `weather.climate(scn)` returns `{storm: {arriveMu, cutoutAfterMin, cutoutMu,
passAfterMin, passMu}, cloud: {frontMu, clearAfterMin, clearMu, frontRampMin, clearRampMin},
drought: {mu}, heat: {clearMu}}`: from the dayplan block when `scn.dayplan`, otherwise derived
from `scn.events` (cut-out = `cutoutWindowH − arriveH`, pass = `passH − arriveH`, in minutes), so
classic stays bit-identical. `windPlan`, `clearPlan` and `roofPlan` read only `climate`; a
storm's news `toS` (the plan's clipped pass) overrides the climatological pass when present.
Fronts over the suburbs (Q-79): `prerollRooftop` folds a `cloudOnset` with `suburbs: true` into
each place's sky by Q-79's shape (lags from `city.suburbs[j].frontLagMin` and
`rooftop.precinctLagMin`), and the forecast carries a warned front from its `cloudWarn` with the
same per-place shape and the clearing's variance in the band; the heat's clear sky as today.
`tools/l2.mjs`: the L-2 coverage method of `git show fb73b7d^:tests/events.test.js`, rebuilt as
a tool (not run by the agent). `tests/front.test.js` (≤ 2 s; fronts put on a `legacyDesk()` or
calm seed with `stateWith`, checking first that `ext.rooftop` changed): each suburb reaches
`frontMu` in city order within one sky step of its lag + ramp; rooftop MW at 13:00 after the
last ramp is within 10% of Σ capacity × share × clearFactor × shape × cloudBite × (sky before −
frontMu); the rooftop forecast knew it from the warning (S-4 scramble still deep-equal for
unwarned state); the band widens only while a front is forecast; the forecast's mean during the
front equals the `cloudOnset`'s `frontMu` and its storm cut-out window equals `stormWarn`'s args
(so a second copy fails a test); classic unchanged.

**At the wave-1 merge (the integrator):** merge grid, then sky, then plan; one commit sets
desk's `act1.task.p` to 0.85; the whole suite; the masked golden diff (classic unchanged); one
real desk day by `tools/play.mjs` as a smoke check (not a statistic); the dayplan test's numbers
recorded.

### 32.7 Wave 2 (par, the clock and the view, on the real sim)

**32.7.1 par.**
- **The night spike first** (Q-73), on played evenings: for DESK 20261007, DESK 20261008 and
  DESK_WEEKEND 20261003 (or the next dates whose par evening is clean at 20:30: no UFLS or
  directed district dark), run `runPar` to 20:30; apply a player's leftovers (`armRERT` at 20:30,
  a `planStop` booked for 22:00 on a gas unit par is running, a battery order); step to 21:00;
  run the night memo. Accept when: no new UFLS or directed district after 21:00; at least one
  unit stops; the armed RERT is stood down within `PAR_RERT_STANDDOWN_MIN` of 21:00 plus one
  decision; the booked stop is still booked and executes at 22:00. A fresh memo as it stands
  fails two of these: `rertSinceS: -1` blocks the stand-down (`sim/autopilot.js` :1470), and
  `makePlan` drops the stops (:837). The night memo seeds `rertSinceS` from the armed state and
  carries `obs.plan.stops`. Report, without asserting: the night's actions by rule, any peaker
  started while another was still starting (if so, rule 2 skips while a peaker is starting at
  night), the night cost with two extra GTs and a 300-MW GUARD left on (paced and unpaced), the
  sim p95 at 2,100× with the night pace (F-11 ≤ 3 ms), and the no-input player-commit evening on
  one date (it must reach 04:00 and never go black; its dark districts may stay dark). If the
  night memo cannot work, the fallback is fixed standing orders (stand down RERT, end DR, the
  battery to idle, stop every gas unit rule 4 frees, keep booked stops) in the same function,
  for both harnesses; the agent says which.
- `sim/autopilot.js`: `export function nightMemo(obs)` (from obs alone: a `PROXIES.night` row,
  all rules, `NIGHT_ACTION_S` pace in grid time, stops kept; `plan` = `preDispatch(obs)` with its
  load dropped and the booked stops carried; `rertSinceS = obs.rert.armed ? obs.s −
  RERT_STANDDOWN_S : −1`; `night: true`; other fields `createAutopilot`'s defaults). `runPar` on
  a `night` scenario swaps its memo for `nightMemo` at the first decision second ≥ NIGHT_S, once
  (`!memo.night`, so `app/par.js`'s chunked resume swaps exactly once), for the proxies that
  stand for a player (par, competent, lean, commitAll, planOnly); doNothing and fuzz keep their
  F-3 meaning; classic untouched. Par reads `obs.tie.importLimitMW`/`limitUntilS` per column and
  `outUntilS` for its starts; rule 9 waits at the gate by itself (the reason); `refRealSeconds`
  counts the RESTORE segments (Q-70) from `obs.districts[].clearS`.
- `sim/dark.js`: a district with `clearS >= 0` counts as lit at every `s >= clearS`.
- `app/system.js`: from NIGHT_S on `night` scenarios the system swaps to the same `nightMemo`
  (held in `sys.night`, plain JSON) and stops its player-mode dispatch (no `playerInputs`, no
  dispatch interval, no `commitSig`); from then on it runs only runPar's step on the night memo
  (`decide`, then `planUpdates`), origin `night`. Classic's "no-input day = planOnly, hash for
  hash" stays. `app/assist.js` mirrors the swap, or is stated classic-only.
- `tools/par.js`: `isClean`, columns for task, held and late MWh, `regime.cls` with drought.
- `tools/daily-gen.js` (Q-75): candidates by `seedOf`, class preservation, the gate along
  `runPar` (an `onStep` bound with air-con in its window), `-j`, `--check`, the build stamp, the
  report (attempts histogram, heat and overlay shares, the Hard-day pool, D-10 gaps by class,
  wall and single-core time). Not run by the agent beyond one or two dates as a check.
- `tools/day-measure.mjs`: the D-10 gap function (Q-76; pure, tested) and the Q-77 proxy (it
  imports `G.offerWhy` and `app/planview.js project`).
- **Tests:** `tests/night.test.js` (≤ 6 s alone, each test ≤ 2.5 s; one shared played evening
  built once in `before()` as in the spike, JSON-cloned per test): units stand down, nothing
  new sheds, the RERT is stood down, the booked stop is kept, every system input from NIGHT_S
  has origin `night`, every gas unit rule 4 frees is stopped by the later of 21:10 and the time
  it reaches 90 min on + 10 min, a GUARD left on is stepped to 0 by 21:30; and the equivalence:
  from par's state just before its first night decision, (a) `runPar` continuing with its memo
  and (b) a fresh `createSystem({commit: 'player'})` with `systemInputs` and no input end at
  04:00 with the same `hashState`. Plus one no-input evening: the roll ends, not black.
  `tests/gaps.test.js` (pure); rows added to `tests/dailies.test.js` (the gate predicate on stub
  scores, the stamp); par rule lines in `tests/autopilot.test.js`.

**32.7.2 clock.**
- `app/director.js` on the profile (Q-63, Q-64, Q-70, Q-73): CRUISE = `rateAt(s, hand)`; NIGHT
  from NIGHT_S on `night` scenarios (eased into; no FAST; a contingency in the night is logged
  and its watch never opens); RESTORE at each district's allowed second until restored or 300
  grid-s, at 10× until `seen.restore` (set by the first accepted restore of a district with
  `clearS ≥ 0`); RESPOND as today, then the profile; FAST = 3 × CRUISE with its refusals; the
  bench keeps `FLAT_RATE` and DEBUG.
- `app/game.js`: `leadS = gridAfter(s, LINE_REACT_S, hand) − s`; `objectiveDue(game, s, mode)`
  (Q-63's cadence; buildVm and `play.js`'s mirror both call it); in `handleRecords`, `for (const
  c of T.trayRecords(game.tray, recs)) { if (c === 'ring2') D.endFast(game.director);
  pushCue(game, c); }`; in `takeDesk` after `runTo(V.PLAYER_START_TICK)` and before `phase =
  'play'`, `for (const c of T.trayBriefing(game.tray, game.state.news)) pushCue(game, c);`; the
  briefing mode rule (Q-64; with the named `app/shell.js` lines); the night lock (sim inputs
  refused from NIGHT_S with the blue note; views, pause, ACK, volume open); the offer rule (Q-78)
  inside `offerWhy` and `updateOffers`.
- `render/format.js`: the badge (segment + target rate, HAND halved; the act in its title).
- `tests/lib/play.js`, `tools/play.mjs`: the cadence mirror through `objectiveDue`; `openGame`
  records `spaceMs`; play.mjs gains a `clock` step (real seconds since Space and the parts spent
  in WATCH, the card, RESPOND and RESTORE: D-2's terms) and `--returning` (storage with
  `seen.watch` and `seen.restore`); one assertion in `tests/play.test.js`.
- `tests/clock-director.test.js`: the profile through `runFrame` on a fake state at 60 and 144 Hz
  (245 ± 3 real s; HAND 478 ± 3; with two unrestored clearances on the ramp 245 + 17.78 ± 3);
  FAST refused and released per Q-63 (MSL1 does not release it, MSL2 does); NIGHT holds nothing;
  RESTORE at both rates and the flag; the briefing mode (HAND by the desk key; a stack or desk
  press refused in blue; TAKE THE DESK gives a HAND day; HAND then AGC gives an AGC day with
  `handFlown` false; after `resetDay` the card reads AGC); D-6's accept on a 2-h slice that holds
  a trip, a feeder clearance and a warning (1×, F held, 50 seeded random pauses: one
  `hashState`); D-4's viewed-or-skipped with the profile.

**32.7.3 desk.** Q-74's COVER row on `desk/gauge.js` (and the HELP sentence); the bay's FAULT
word, the repair reason and the tab glow at each hand-back; the tie knob and `desk/calc.js` show
and clamp the limit; the night lock's note in `desk/desk.js`; `app/tray.js` (`trayBriefing`;
`trayFrame`'s life: over when `clock.stepReal(max(card.atS, V.PLAYER_START_S), s) ≥
TRAY_LIFE_REAL_S`, a warning issued in play with `fromS > atS` also until `s ≥ fromS`, the
card's expiry stored when it is made, every expired card retired, not only the front;
`CARD_TTL_S` goes; senders; UNIT_AVAILABLE and TIE_LIMIT_END information cards; FEEDER_CLEAR a
ringing card that says what to press; the night's rings quiet); `app/alarms.js` (`isWeather`;
the inputs carry every news kind of a batch; quiet in the night roll; `PEAK_H` =
`clock.PEAK.map(s => V.DAY_START_H + s / V.S_PER_H)`; K-8 re-measured on `stepReal`);
`content/alarmhelp.js` (PEAK's trigger through `clock.hhmm`, never `h + ':00'`; WEATHER's
reading counts `isWeather` items only); `app/watch.js` (the card's words: "N-1 SHORT: n MW
short: cover it within m:ss", "N-1 TIGHT: spare covers the next trip, without SECURE's
margin", "SHEDDING: n districts dark: relight them within m:ss"); `app/endcard.js` (HAND-FLOWN
from `game.end.handFlown`, the reliability line for task feeders, "Not gate-checked" when
`game.end.gated === false`). Tests: `tests/countdown.test.js` (vm fixtures: m:ss at rate 1; no
':' in the visible text at 30× and 300×, BAND whole minutes and its bar; one COVER figure across
two updates 0.2 real s apart at 300×; "BAND ✓" held 1 s after the return and gone at 3.1 s
outside a window; "BAND HIGH"; aria m:ss at 300×; COVER n MIN, ✓ T+n, LOST, overdue amber; never
✓ beside a SHORT or SHEDDING head; the overdue row visible after `secureByTick` in band),
`tests/tray-day.test.js` (the briefing cards and their one ring, all in the LOG at
`gridAfter(04:30, 20 real s)`; a warning issued in play held to its onset while a newer
information card expires behind it; classic's `trayBriefing` returns []; no `ALARM_HELP` text
matches `/\d\.\d+:00/` and the peak trigger names 16:30; WEATHER's reading says 0 on a morning
whose only news is a derate and feeders; HAND-FLOWN on the end card after the 21:00 flip).
RESPOND's 30× part is usually empty (all 8 probed trips were back in band inside the watch): the
row's main readers are COVER at profile speed and BAND at cruise or in HAND.

**32.7.4 map.** `render/map.js`: the occupancy curve (≈ 0.9 at 21:00 to ≈ 0.15 by 01:00, waking
05:30–07:30) times today's demand factor, in about 30 steps; the task feeders' label in blue
until each hand-back ("SAL: 2 DARK · BACK 06:45, 07:05", then "SAL: 1 DARK · BACK 07:05"),
then today's alarm label. `render/livestack.js`: act ticks from `clock.ACT_S`; onset markers for
warned onsets ahead; the idle redraw capped at `STACK_MAX_HZ` and frozen while
`obs.nightShift`. `app/planview.js`: each column's load from `darkShareAt(obs, t)` and `litMW`;
the tie limit; `earliestOnAt` for an off unit `max(s + wait, outUntilS) + startToMin` (the
earliest line, `glowCandidates`, `snapStart` and `earliestArrival` follow), `simInit` copies
`outUntilS`, the mirror executor leaves a booked start pending while `t < outUntilS`. The
allowlists: `tests/map.test.js` :569 adds `'../sim/clock.js'`; `tests/planview.test.js` :640
becomes `['../sim/params.js', '../sim/dark.js']`. `tests/day-view.test.js`: each column's load
equals `litMW(p50, roof, darkShareAt(obs, t))`; an injected outage puts CCGT 2's ghost no
earlier than `outUntilS` + startToMin and a 06:00 booking online then; the windows at 21:00 >
00:30; the feeder label's two times.

**At the wave-2 merge (the integrator):** the whole suite; the golden diff; the step at `clearS`
in the stack checked once by hand; `node tools/play.mjs <date> --returning
timeline=04:30-04:00/30m clock` on one desk date, and once without `--returning`: the first D-2
timing check, reporting Space-to-verdict against E and each of E's terms.

### 32.8 Wave 3 (on the merged real thing)

**32.8.1 line.** `app/objective.js`: Q-80 (retire `heatWorstCase` and the 10:30 rule); the
restore-task asks from the ETR ("SAL4's feeder is back at 06:45: hold 230 MW of spare for its
pickup"); the derate's and the outage's reasons in capacity asks; the line quiet at night (the
strip replaces it); on night scenarios `stopSaving`'s horizon ends when the night shift would stop
the unit (NIGHT_S, or when it reaches `PAR_DECOMMIT_MIN_ON_MIN` on, whichever is later), not at
DAY_S, so RELEASE's "Stop it: saves about $X" stays true and quiets near 21:00; the grid-time
constants tuned at 120× (`ACT_WITHIN_S`, `NOW_S`, `STEADY_*`) expressed through the clock so
they mean the same real time in every segment; the S1 "aims that flickered" fix re-checked at
540×. `tools/follow.mjs` reads the new kinds.

**32.8.2 shell.** `app/shell.js` (not the briefing-mode lines), `next.html`: the briefing's
"Watch for" (Q-81's briefs, ≤ 30 words); the HAND chip in the header (amber, with the word;
`obs.mode` before 21:00, then "HAND-FLOWN · NIGHT SHIFT ON AGC" from `obs.handFlown`); the night
strip in the plan bar (SUPPLY, OUTAGES, CARBON, ALL-IN at $0.1M, SCORE vs par); the end card
fetched at 21:00; `GOALS_TEXT` ("each MWh the city goes without" becomes the MWh that are yours,
≤ 60 words) and the ALL-IN chip's tooltip; `content/text.js` (§32.2's rows, rewritten, added and
also rewritten; the cap at 20 KB); `content/anchors.js`. Tests:
- `tests/briefing.test.js`: on a heat + derate + feeder date, "Watch for" names all three in ≤ 30
  words.
- `tests/night-strip.test.js` (D-11's accept, sampled; no drawn roll): one game per file, booted
  and jumped once in `before()` by `p.to('21:00', {stop: [], line: 'near'})` in
  `feedback.test.js` :364's loop (Enter at each `held:RESPOND-CARD`), then `t21 = p.now`. Test 1,
  at 21:00, one look: the plan bar is the night strip, the badge reads NIGHT ROLL, the lock's note
  shows. Test 2: `p.to('01:00', {stop: ['card']})` and one look (every strip figure has counted
  up, the windows are dark); then `p.until('card')` returns `'over'`, never `'card'` or
  `'held:*'`; `p.now − t21 ≤ 15000`; one look at the END line. Three drawn frames in all. Each
  test ≤ 2.5 s, the file ≤ 6 s; its time recorded in §32.11.
- `tests/acts-audit.test.js` (D-1): every control that sends a sim input lives under the desk,
  the stack, the map or the suburb card; the briefing sends only `mode` inputs (the card's
  AGC/HAND, the desk's AGC key).
- `tests/feedback-day.test.js` (new presses only): one game, `openGame({seed, take: false})` on a
  desk seed whose pre-roll has both the task feeders and the late return (picked with
  `dayplan.preroll` in milliseconds); in order: the briefing presses, TAKE THE DESK, at 04:30
  RESTORE on a held feeder and START on the outaged unit, then (own test or `before()`) one jump
  to 21:00 by the same card loop, FAST and one locked press; every press sampled with
  `press`/`pressKey`; each test ≤ 2.5 s, the file ≤ 6 s.

### 32.9 Done means (every agent)

- Your tests pass alone within budget (file ≤ 6 s, test ≤ 2.5 s), and the whole suite passes
  once at the end (name the count and the time).
- Your eager bytes: run `node tools/perf.mjs --sizes` at your base, before your first commit, and
  at your head; report the gzip delta against your cap. Never run perf's frame costs (only the
  integrator does, at stage A and stage C).
- Every new face answers every press (Q-42), says what it does, uses blue for help and red only
  for refusals (Q-41), never colour alone (K-22), and reads at the eye's speed.
- Classic is unchanged: `tests/baseline-v4.test.js` green (stage A's A2: red on the hash only,
  per §32.5.2 step 7, until the integrator re-records).
- Your report lists: commits, tests added (and their time), anything you could not do, every
  line you touched outside your files, every moved-header text you corrected, and every number
  you measured.

### 32.10 Stage C (the integrator)

**The measures, once each,** on `v4-core-2c.0` plus the waves: `tools/perf.mjs --rates
150,540,1620,2100` (F-11; frame p95 ≤ 8 ms; if it misses, the integrator may move
`OBJ_EVERY_REAL_S` and `STACK_MAX_HZ` once, no other lever); `tools/par.js` S-12 on `desk` and
`desk-weekend` (200 raw, 100 forced heat, `--proxy competent,lean,commitAll --allin`, P-3's
medians, P-4's MSL frequencies) plus a 'slow' proxy once (competent, each task restore 15 real s
after `clearS`; if it trails competent by more than 150 points, report it to the owner and name
`RESTORE_PACE_MAX_S` 600 as the lever, which moves par's mirror and so is a named exception to
"never par"); the follower; the Q-77 proxy on 100 dates (D-8, K-12); `tools/daily-gen.js` on 365
dates from 2026-10-12 with `-j` (D-9's attempts, D-10 by class, the heat share); `tools/l2.mjs`
(L-2 coverage); the D-2 scripted day (verdict half) on 5 dates with `clock`; D-6's whole-day
replay once (1×, FAST, 50 pauses: one hash).

**The tuning round runs only if one of these misses** on `desk` or `desk-weekend`:
- S-12 (par): zero unserved on ≥ 85% of raw seeds and ≥ 75% of forced-heat seeds; RERT armed on
  ≤ 25%; no black day.
- S-5's gates on today's ALL-IN letters: competent ≥ 70% A; commitAll loses A on ≥ 30%.
- D-9: no date reaches the 40-attempt cap; attempt 0 passes the gate on ≥ 85% of generated dates
  and ≥ 75% of heat dates.
- P-4: on mild weekends MSL1 on 10–30% of days and MSL2 on ≤ 10%; MSL3 only after a noon tie or
  smelter trip.
- L-2: 80 ± 5% inside P10–P90 at 1 h and 4 h.

Reported, never tuned for: the lean proxy's A share (S-5's ≤ 40% has been missed since Q-48 by
decision), the generated heat share (D-9 lets the tool report a shortfall), D-10's gaps (Q-76;
if heat days fail D-10, the round may add the calm day's evening trip to heat days, ≥ 30 real s
after the heat onset, subject to forced-heat S-12). `LETTERS` are not re-calibrated in 2c (S-5 is
2d's). **The round:** one agent; dayplan sizes, windows and act mixes only (§32.4.3 values, never
shapes, never `weather.heatShare`, par or the fleet; a depth or a duration is a size, and the
forecast follows through `climate`); for an L-2 miss the front's band is also in scope; one tool
run per iteration.

**Then, in order:** the final whole-branch review (seams, docs truth, the player; each finding
checked by a skeptic) and its fix pass; `SIM_VERSION` `v4-core-2c.1` and the golden (classic: hash
and Build lines only); **`tools/daily-gen.js` once more** (365 dates, `-j`), the last
sim-dependent step: it writes the shipped `content/dailies.js` with the build stamp, and §32.11
and SPEC record its D-9, D-10 and heat-share numbers (a named exception to "once each"); the one
browser pass (one pane; 1280×600, 1280×720, 1920×1080): the badge through the segments, the COVER
row after a trip, the RESTORE pace at a hand-back, the night strip and the dark windows, the
briefing's "Watch for", HAND-FLOWN. Any sim/ or desk-scenario change after the last daily-gen run
means bumping `SIM_VERSION` and running it again.

### 32.11 Records (stage A, the waves, stage C)

**Stage A (2026-10-12).** Workflow `wf_3268fa13-fe2` (three builders; a usage limit cut A2 and A3
mid-work and A1's fix pass), resumed as `wf_ebee9a3d-f71` (A1's fix pass; A2 and A3 finished in
their own worktrees, each with two reviewers and a fix pass). Merged A2, A1, A3 with no conflict.
- **A1 (prose):** first visit 397,123 → **385,154 B** gzip (−11,969 B, 32 files), `tools/perf.mjs
  --sizes [--base ref] [--head ref]`, the 2c ceiling in `tests/budget.test.js` reading §32.3's
  caps. rng.js's header went to sim/README §4 (it has no §11 subsection). Kept lines: the whole
  lines of each header's first sentence, cut at its end in ten files where that line ran on (the
  README blocks hold the full text).
- **A2 (base-sim):** 16 commits. `stepAfter` and `gridBefore` are exact (the least or greatest
  float that passes); the ease's measured bounds are in Q-62. The FEEDER_CLEAR record is `{tick,
  kind, sev, code, msg, district}`. `windDrought` is log-only once a `droughtWarn` has made the
  news (§32.4.6), so a legacy record on a neutral desk day keeps its news. One params line,
  `CLOCK_SEARCH_S`. The physics preview backup of `heldFrac` is wave 1 grid's (confirmed real: a
  district preview on a held pair moves it).
- **A3 (base-app):** 13 commits. `dailyFor` gates only a calendar date; `offerWhy(obs, tally,
  mode)` (`mode` until wave 2); `game.end.gated` true | false | null; `G.dailyStamp()`;
  `legacyDesk()` pins today's shares; the tray matches full machine names.
- **At the merge (integrator, ≤ 10 lines each):** the tools use `market.isClean` (`tools/par.js`,
  `tools/baseline-v4.js` set it in `sim()`; `tools/follow.mjs` imports it); `dailyStamp` uses
  `step.scenarioHash`; the drought case of `tests/inject.test.js` filters news by kind (a live plan
  adds its own 04:00 news); moved headers made true (sim/README step.js API and the record line,
  §32.12 tray and boot, §19 `scenarioForSeed`).
- **Neutrality:** `runPar` on CLASSIC 4, DESK 20261007, DESK 20261008 and DESK_WEEKEND 20261003:
  log and final state equal to 035a3d2's on all four (new keys, `scn` and `ext` aside).
- **`v4-core-2c.0`**, golden re-recorded: the masked diff is the Build line and the machine lines
  only (classic's numbers equal).
- **Suite:** 780 tests, 779 pass, 1 skipped (the shipped-list stamp, until stage C), 37.4 s.
- **Bytes:** first visit **390,617 B** = 385,154 + 5,463 for stage A (A2 ≈ 4.4 KB, A3 ≈ 1.0 KB
  against 3.6 and 0.5). Reallocated (§32.3): 2c total **12.4 KB** (A2 4.3, A3 1.1, plan 1.6,
  desk 0.8; the rest unchanged); 2d and 2e keep about 11.5 KB of F-11.
- **Frame baseline** (`tools/perf.mjs --rates 120,540,1620,2100`, this PC; the page's day with the
  objective at most once a grid minute): sim p95 0.10 / 0.39 / 1.59 / 1.41 ms (budget 1 / 3 / 3 /
  3 ms); view model p95 1.27 / 1.66 / 2.81 / 2.00 ms.
- **Handed on:** desk (W2): `A.isWeather` replaces the tray's `WX`, and one `tests/tray-day.test.js`
  row builds an outage card from a real `unitOutage` record (lever-ccgt on desk, lever-coal on the
  weekend). Clock (W2): drops `offerWhy`'s `mode`. Grid (W1): the `heldFrac` backup. Line (W3):
  `heatWorstCase` is null on the unregistered `desk-legacy` id (no line differs today; Q-80 retires
  it). Stale "see the file header" comments from Q-49 in autopilot, grid, physics and desk.js:
  their owners, when they touch those lines. SPEC :1008 (NETWORK sender) and :1679 (the seed's
  date) at stage C.

**Wave 1 (2026-10-12).** Workflow `wf_a4f97e32-2eb` (plan, grid, sky; two reviewers each, plus a
"day designer" reading 60 pre-rolled days for plan; one fix pass each). Merged grid, sky, plan with
no conflict (`18c025b`, `85c68d2`, `cc9f625`); the suite was green with the task off (813 tests).
Then `ddcc3b6` switched desk's task on (`dayplan.act1.task.p` 0.85) and added
`tests/lib/sim-helpers.js withoutTask(scn)`; 22 tests failed, and the merge fix
(`wf_87ec6ddc-4a1`: sim, view and line fixers, each checked by a skeptic) made them green
(`5973669`, `33a719d`, `6bc500a`).

*Measured* (`tests/dayplan.test.js`, 2,000 dates from 2026-01-01 and desk seeds 1–2,000, the task
live):
- Classes heat 14.9 / storm 24.8 / drought 20.5 / calm 39.7% (seeds 15.4 / 25.7 / 18.8 / 40.2).
- Leads in grid-min: cloud 130–175, storm 65–115, drought 65–123.
- Q-72: zero violations on all 4,000 days; the guard shown to fail by hand.
- Act I: the task on 84.7%, the derate on 49.5%, the late return otherwise.
- Act II on non-heat days: front 41.4, unit 24.6, smelter 19.0, tie 14.9%, no fallback. Its
  trips have a median of 11:01 (15.2 real s into the act), 10.2% of them before 09:24.
- Heat days' Act II trips: median 09:35, 66.1% before 10:00, none after 12:00, because the
  30 real s before a 12:30–14:30 onset reach back that far.
- Evening trips 17:00–19:30, median 18:31.
- Storm link trip on 25.1% of storms; 31.3% of storm days have no unwarned contingency.
- Longest stretch with no ringing card (p10 / p50 / p90 real s): storm 57 / 77 / 100, drought
  66 / 79 / 97, calm 94 / 113 / 143, heat 128 / 138 / 148. Nothing rings after 14:30 on 95.2% of
  heat days. This is D-10's risk, measured at stage C (§32.10's heat-day evening-trip lever).

*Amendments* (these override §32.1–§32.7 where they differ; wave 2 reads them):
- **The moments rule (extends Q-72, plan):**
  - No two moments (a card or a decision after 04:00) fall within `PAR_ACTION_GAP_REAL_S` on the
    step profile.
  - The 30-real-s and 90-real-s rules carry a +1 s margin and are also checked on `realBetween`.
  - The late return is drawn last, ≥ 3 real s from every moment; trips keep 3 real s from the
    derate's end.
  - Act II's windows end at 14:29.
  - The derate limit is on 50-MW steps (`DAYPLAN_MW_STEP`); briefing times are on 5-min marks.
  - `crisis` is true for Act I's constraint and every Act II/III record, false for the task;
    `warned` is true for every plan record except trips and notices.
  - EXT_EVENTS slots: 64 constraint, 65 task, 66 Act III, 67 Act II.
  - `roofDropMW` is interpolated, on 50-MW steps, and the text says "up to about".
- **Series keys (sky):** a `cloudOnset` with `suburbs: true` is the exception. Its `clearMu` is
  the front's sky at each place from atS + that place's lag, never a mean; its args are
  `{clearMu: frontMu, suburbs: true, clearS}`, both finite (`frontsOf` throws otherwise), and
  `cloudClear` carries `{clearMu}`.
  - On a dayplan day the precinct follows the same per-place shape.
  - The forecast reads the present skies once a place has risen above `frontMu` +
    `FRONT_READ_SD` 3 sd, fixing the clear time from public `env` only.
  - A front can start up to one 5-min sky step early (C-5's interpolation, labelled).
  - The front's band covers 89.5% of demand: stage C's L-2 measure.
  - The builder's l2 smoke numbers were taken while staged and are not valid.
- **Grid:**
  - `market.restoreAllowedS(districts, d)` (on state or obs; §32.4.7) is the one "allowed
    second" rule. The director (wave 2 clock) calls it; par copies it from obs (S-4 forbids
    importing market).
  - `taskLateMWh`'s zero is exact for PERFECT; its size is a lower bound (sub-second tolerance,
    in the player's favour).
  - With nothing dark at the end of a second, a relit task feeder's share goes to `taskMWh`,
    never UFLS; any other relit district's last second stays UFLS.
  - The night flip also clears the synchroscope (`scope.unit = ''`), and READY units wait
    `AUTO_SYNC_S` before their auto close.
  - A booked start is due at `max(atS, outUntilS)` (`startDueS`). `planLoad` and `planStop` use
    it; wave 2's par (`context()` carries `obs.plan.starts` at that time) and map
    (`app/planview.js`'s mirror executor) must do the same.
  - The tie limit clamps imports on both ends of a key's lead.
  - `observe().demand.unservedMW` excludes held feeders.
- **Params appended:** `CLOCK_SEARCH_S` (A2), `DAYPLAN_MW_STEP` 50 (plan), `FRONT_READ_SD` 3 (sky).
- **The merge fix:**
  - **Sim:** all 7 failures were fixtures (re-pinned to `withoutTask`). The opening test now
    pins both cases. HOT task mornings: coal untouched, hydro takes the held load. MILD:
    hydro at its floor, coal cut evenly ≥ MIN, the identity exact to 1e-6.
  - **View:** two real defects fixed. The respond card counted held feeders as dark (one line in
    `app/watch.js`: a held feeder is not in its dark list, count, MW or bay glow), and so did
    `content/alarmhelp.js`'s UFLS explainer. Both are pinned in `tests/next.test.js`.
  - **Line:** a held feeder never brings up the UFLS-style restore line; the count includes
    every dark district (as the bay and map show); pinned in the new
    `tests/objective-task.test.js`.
- **Handed to wave 2 and 3 (named, not fixed):**
  - *par:* the announced return. A dawn plan under-counts by 166–355 MW at 09:00, 9–374 MW at
    noon and 292–518 MW at 18:00 on task dates (HOT seed 2: 356 at noon, 484 at 18:00). The
    places are `sim/dark.js darkShareAt` and `sim/autopilot.js` `litColumns` (:124, called at
    :303 and :1326), `litDayAhead` (:326) and the adequacy walk (:1083). Then drop the two
    `{todo}` copies in `tests/par-levers.test.js` and point `flexLine`/`soakReflow` back at
    DESK.
  - *map:*
    - `render/map.js mapLabels` (:221) and `mapSummary` (:241) give held feeders the red UFLS
      label; Q-79's blue "SAL: 2 DARK · BACK …" replaces it.
    - `app/planview.js project()` draws a phantom red gap the size of the held load until
      `clearS` (+251 MW at 04:35, DESK seed 2): per-column `litMW(p50, roof, darkShareAt(obs,
      t))`. city-view's Q-57 test stays on `withoutTask` until then.
    - **New:** `app/suburbcard.js` (:151–154, :200, :206), a held suburb's card. It reads
      "n DARK:", focuses RESTORE and shows no ETR. It should say "n DARK · BACK HH:MM" and
      not steal focus before the hand-back. It is 46 B under its on-demand cap, which may rise
      to 6.5 KB.
  - *desk:* `desk/bay.js` (:246, :331) lets held feeders choose the bay's view (it opens on
    RESTORE with TASK rows). Held feeders should not choose the view; the row word is FAULT;
    the refusal stays a red refusal with its reason, as the permissive's other refusals.
  - *line:* the restore asks from the ETR, `spare()`'s pickup over held feeders, naming the
    feeders under repair, `heatWorstCase`.
- **Bytes:** first visit **395,665 B**: stage A 5,463 + wave 1 5,048 (plan 3,542, grid 994,
  sky 511) = 10,511 B of 2c. **The 2c total rises to 14.6 KB** (§32.3: the actuals plus wave
  2 and 3's 4.2 KB); 2d and 2e keep about 9.3 KB, so their debrief and briefing load on demand.
  Raising F-11 stays the owner's call.
- **Suite:** 817 tests, 814 pass, 1 skipped, 2 todo (par's), 40.3 s; `tests/baseline-v4.test.js`
  green.

### 32.12 Module headers (moved from the files, Q-61)

Stage A (prose) moved here, verbatim, the leading header comments of the first-visit files that
§31.8 did not take, one subsection each, in path order (the six sim files' headers went to
`sim/README.md`: `sim/rng.js`'s to the end of §4 "Random streams", the others into §11 under
their modules' existing headings, `sim/step.js`'s straight under its heading). Each file keeps the
whole lines its first sentence spans and a pointer to its subsection; where the last of those
lines runs on into a sentence that ends on a later line (ten files), it is cut at the first
sentence's end. `app/par.js` and `app/score.js` are one sentence each and keep it whole.
**This prose lives in the READMEs now:** a change that makes a moved header false edits its block
(here or in `sim/README.md`), never the file. An edit that a branch cut before the move (A2, A3)
makes to a moved header's lines goes into its block at the merge, and the file keeps its kept
lines and pointer. Measured (`node tools/perf.mjs --sizes`, 46 files): first visit 397,123 B gzip
before the move and **385,154 B** after (−11,969 B; raw 1,145,177 → 1,115,238 B), the base of
`tests/budget.test.js`'s 2c ceiling (+ 11.4 KB = 396,827 B).

#### app/boot.js

```text
app/boot.js: starts the greybox game (next.html, Phase 1a). The page's one module script.
It imports the stage B modules by their contract paths (desk/README.md §1) and hands them to
app/shell.js, which mounts them, draws the overlays and runs the frame loop. The Phase 0.2
bench's boot is app/bench-boot.js (bench.html).

URL query: ?seed=N or ?date=YYYY-MM-DD (default: today's daily, content/dailies.js, Q-75) &perf (the F-11 overlay) &debug.
```

#### app/director.js

```text
app/director.js: chooses the playback rate (spec F-5, K-15, K-16, D-6). The sim never does.

Modes (desk/README.md §2), precedence OVER > HIDDEN > ALARMS > PAUSE > WATCH > RESPOND-CARD >
FOCUS > RESTORE > RESPOND > NIGHT > FAST > CRUISE (§32.4.8):
  CRUISE        the D-2 profile (slice 2c, Q-62/Q-63): sim/clock.js rateAt(s, hand), eased over 2 real
                s at each interior boundary, halved from 04:30 to 21:00 when state.control.handFlown
                (HAND, Q-64). Between two eases rateAt is flat, so the director keeps that stretch
                (d.flat: its ends are each boundary +- the ease's half-width, EASE r1 r2 / (r1 + r2),
                the formula sim/clock.js uses) and asks rateAt only inside an ease: rateOf runs
                between every two ticks, 1,750 times a frame at 2,100x.
  FAST          3 x CRUISE while F is held. Refused (setFast) and ended (directorFrame) in WATCH,
                the card, RESPOND, FOCUS, ALARMS, RESTORE and NIGHT (NO_FAST); it also ends on F up,
                a new contingency, a new P1/P2 alarm, a new ask (app/game.js newAsk) and every new
                tray card that rings (app/game.js handleRecords: a 'ring2' from T.trayRecords; MSL1
                and the other information cards do not ring), so FAST never runs past a warning
  WATCH         K-15 over the first WATCH_S grid-seconds after a contingency: full 0.15x / 1x /
                10x over 0-3 / 3-10 / 10-30 s, compact 0.5x / 2x / 20x. The desk is locked (the
                sim refuses inputs). SKIP plays the rest of that watch at CRUISE.
  RESPOND-CARD  rate 0 from the watch's end until the card is dismissed (Enter or any desk
                input): the only hold on the clock besides PAUSE (K-16)
  RESPOND       30x from the card's dismissal until frequency is back in 49.85-50.15 Hz
                (contingency.backInBandTick >= 0) or 5 grid-min after the card, then the profile
  FOCUS         1x while a synchroscope is open (sim scope.unit !== '') or for 2 grid-s after
                a restore input (the breaker being closed, K-13)
  RESTORE       Q-70: in each task feeder's window, from its allowed second (sim/market.js
                restoreAllowedS, the one rule: the later of its clearS and the last restore +
                RESTORE_INTERVAL_S) until it is closed (no longer dark) or RESTORE_PACE_MAX_S
                (300 grid-s), while it is dark with shedBy 'task' and before 21:00: 30x
                (RESTORE_PACE_RATE), or 10x (RESTORE_FIRST_RATE) until this browser has closed a
                task feeder (d.seen.restore, set by focusRestore(d, state, id) on the first
                accepted restore of a district with clearS >= 0, saved with seen.watch). A pace,
                not a hold (K-16): with no input a hand-back costs 10 real s against 1.1 s at 270x.
  NIGHT         Q-73, on a night scenario (scn.night) from NIGHT_S (21:00): the profile (2,100x,
                eased into from PEAK EASING's 300x), no FAST. A contingency that starts in it is
                logged only: no watch, card or RESPOND (latest() leaves it out), so the roll is
                never held. (The view's night is obs.nightShift, never modeOf().night.)
  PAUSE         Space; a hidden tab (HIDDEN); the day's end (OVER)
  ALARMS        rate 0 while the alarm panel holds the clock (d.held, Q-46); d.paused is untouched
  DEBUG         the bench's speed selector (bench.html only): any speed other than CRUISE

modeOf also returns segment (the D-2 segment's name, Q-78), act (sim/clock.js actAt: 0 before
04:30, 1-3, 4 the night roll) and night; its `rate` is rateOf's except in CRUISE, NIGHT and FAST,
where it is the segment's target (x3 in FAST): the badge never shows a number counting through an
ease (Q-63), and the loop reads rateOf.

A director made with {game: true} runs every mode above; without it (the bench) it is the
Phase 0.2 director: a flat CRUISE (FLAT_RATE 120x) or DEBUG, the full watch, PAUSE, and nothing that
holds the clock; its segment is '' and its act 0.

Watch version (K-15): full the first time ever and on anything new (the first UFLS operation
seen, the first HIGH RoCoF); otherwise compact. The version is chosen on the watch's first
tick (a first HIGH RoCoF is known then: the record's rocofHzS) and upgraded to full for the
rest of the watch when a first-ever UFLS operation happens during it: the relays deserve the
slow motion (decision: most fun within realism, OD-17). `d.seen` ({watch, ufls, rocof}) is
the memory the game loads from and saves to localStorage (gridwatch:v4:seen, C-8: optional).
Esc skips only once a full watch has been seen (game mode; the bench always may).

Viewing never changes the outcome (C-7): the director only picks the rate. Pure and DOM-free
(Node tests use it). rate() is asked between every two ticks, so it reads a few fields
straight from state without allocating.
```

#### app/game.js

```text
app/game.js: one game session (next.html), DOM-free. It mirrors app/session.js (which the
bench keeps) for the game: the sim state, the director (game modes), the loop's pacer, the
system operator (app/system.js: the 04:30 pre-dispatch, the dark-city reflow, RE-DISPATCH),
the annunciator, the tray, the recorder (watch traces), history rings for the Live Stack's
past, the TRIP / RESTORE PREVIEW caches, the view model (desk/README.md §5), the input log
and its replay file (F-6). boot.js / shell.js wire it to the page; tests drive it headless.

Everything that changes the grid is a sim input: sendInput (the desk, the stack, the map,
keys) and the system's inputs, applied between ticks or through step(), so replay() of the
log reproduces the day (F-6). Presentation (focus, ACK, pause, FAST, skip...) goes through
ui() and never touches the sim. Nothing here draws.

Modules the game uses but other stage B agents own are passed in, so this file imports only
what exists on its own branch: `system` (app/system.js: createSystem, systemInputs,
redispatch) and `planview` (app/planview.js: glowSet). Without them the game still plays: no
automatic plan (a no-input day then needs the player), and a simple fallback glow set.
```

Slice 2c (wave 2, clock; Q-63, Q-64, Q-73, Q-78):
- **The briefing's AGC/HAND is the sim's mode** (`state.control.mode`). While `phase ===
  'briefing'` sendInput applies `{type: 'mode'}` inputs (the card's AGC/HAND buttons, the desk's AGC
  key) and answers every other sim input with `BRIEF_LOCK`, "Take the desk first: Enter."; the
  card's buttons draw from `obs.mode` (app/shell.js). `takeDesk(game)` takes no mode: it runs
  04:00-04:30 headless, makes the briefing's tray cards (`T.trayBriefing`, one ring) and opens the
  desk. The sim tags `control.handFlown` at 04:30, so HAND then AGC is an AGC day.
- **The night lock:** once the sim has set `control.nightShift` (21:00 on a night scenario),
  sendInput and redispatch answer `NIGHT_LOCK` ("The night shift has the desk: it stands down what
  the night does not need. Your day is scored at 04:00."); presentation (`ui`: views, pause, ACK,
  volume) stays open. Both locks are help, so the shell's toast shows them blue (`isLock`).
- **The line's cadence** is `objectiveDue(game, s, mode)`: 'news' when the watch, the card, RESPOND,
  RESTORE, NIGHT or OVER came or went (not Space), else due once grid time has moved max(30 s, the
  profile's `rateAt` x `OBJ_EVERY_REAL_S` 0.4 real s): 216 grid-s at 540x, 60 at 150x, the 30-s
  floor at HAND's 75x. tests/lib/play.js asks the same function. Its reading lead is
  `clock.gridAfter(s, LINE_REACT_S, hand) - s`: 13 real s of the profile (about two grid-hours at
  540x, so a START due before about 06:30 is asked on the held desk at 04:30: Q-18's held start is
  its reading time).
- **FAST** is released by every tray card that rings: `handleRecords` (exported for tests) ends it
  on a 'ring2' from `T.trayRecords`.
- **The scope offer (K-12, Q-78):** `offerWhy(obs, tally)` returns 'respond' inside D-5's window
  (`obs.inRespond`) once per contingency, else 'tight' (TIGHT or worse) or 'peak' (D-2's Peak,
  `clock.PEAK`, 16:30-20:00) once a day between them, never past `MAX_OFFERS` in all or from 21:00.
  `tally = {n, extra, contN}`: offers made today, 'tight' or 'peak' offers made today, and the n of
  the contingency the last 'respond' offer was for (-1 none); `game.tally` keeps the page's.

#### app/loop.js

```text
app/loop.js: the frame loop (spec F-5, X-26).

Each animation frame adds min(frameDt, MAX_FRAME_DT_S) x rate grid-seconds to an
accumulator (kept in ticks) and runs whole 20-ms ticks, up to a per-frame cap and a time
budget. The rules this file guarantees (tests/loop.test.js):
  * every tick is run exactly once, in order: nothing here skips or repeats a tick, and
    the sim never sees the frame rate (the same input log at any rate or display refresh
    gives the same state at the same tick; F-4, D-6);
  * a lagging frame (cap or budget hit) slows play: the time it could not run is dropped,
    never the ticks, so play resumes at its rate from the next frame instead of spiralling;
  * when the rate changes between two ticks (a contingency opens the watch, a watch
    segment ends; from 2c every tick of a D-2 ease, so a frame's real time is the
    profile's integral over its ticks), the time still owed is converted to the new rate at once, so the
    watch's 0.15x segment starts at once, not a frame later. A contingency is known only
    after the tick that opened it (a pre-rolled trip happens inside step()), so that tick
    was charged at the old rate; rateLast() lets the loop re-charge it at the watch rate
    (the accumulator may then owe time, i.e. go below 0, and the next tick waits for it),
    so the watch lasts its full real time from its first tick;
  * draw never runs inside step(): runFrame only steps; the caller draws after it returns.

Pure: runFrame takes callbacks and a pacer object, so Node tests drive it with fake
frame times. Only startRaf() touches the browser, and only when called.
```

#### app/planview.js

```text
app/planview.js: the Live Stack's plan view (desk/README.md §7; SPEC L-1..L-9). Pure: it
reads an observe() snapshot (and, for the past columns, the shell's history) and imports
only sim/params.js. Nothing here changes the grid; the stack sends what snapDrop returns.

project(obs, opts)            the next 4.5 h per 5-min column: each layer's MW as the sim's
                              plan executor will move it (desk/README §3.1), supply and gaps,
                              the rooftop bite and the projected spill (Phase 2a, C-11)
blueRuns(proj)                the runs of projected spill ahead (C-11), in the shape of redRuns
earliestArrival(obs, st, mw)  the earliest second a station can be at mw (L-4 ghost, L-6, L-9)
glowSet(obs, gap)             control ids that can arrive by the gap's start (L-9, K-16)
snapDrop(obs, st, atS, mw)    the inputs a drop sends, on the 15-min / 50-MW grid, or the
                              earliest-arrival ghost when the drop is infeasible (L-4)
snapStart(obs, unit, onAtS)   the same for dragging an off unit's ghost (a booked START)
firstGap(proj)                the first red run ahead (the gap a trip opened, K-16)

The projection is a 5-s step simulation of the executor rule, so ramps, T1/auto-sync/T2
starts, the unload + T4 stop profile, min up/down, clamps and the arrive-by lead all match
the sim to within one step; AGC trims, governors and heat derate changes are left out (the
stack draws the plan, not the seconds). Where the executor's contract is loose the choice is
named in a comment; stage C checks the projection against a stepped sim.
```

#### app/record.js

```text
app/record.js: what the bench's strip charts plot. DOM-free.

The sim keeps no history, so the bench records it as it plays:
  * every tick: frequency (for the live chart at slow speeds and the per-second envelope);
  * every grid second: min / max / mean frequency (the last 10 minutes);
  * every grid minute: an observe() snapshot's numbers (the 24-h charts);
  * during each contingency's watch: per-tick frequency and who caught the loss.
Per tick it reads only values observe() also exposes (f.hz = phys.fHz; the balance
readouts; sec's preview), straight from state because observe() allocates (README §10).
It never writes state. Typed arrays: this is presentation, not sim state.
```

#### app/shell.js

```text
app/shell.js: the game page (next.html) around app/game.js. It mounts the map, the desk and
the Live Stack (whichever modules boot.js passes in), draws the header and the overlays
(briefing, watch, respond card, end card, drawer, "?" labels, toast, ?perf), runs the frame
loop (ticks, then the view model, then every module draws: never inside step(), X-26),
binds the K-23 keys and starts the audio on the first gesture.

app/boot.js is the page's one module script: it imports the real modules and calls
bootGame(document, {...}). Tests call bootGame with the stand-in DOM (tests/lib/dom.js) and
stand-in modules, so the shell is tested before the other stage B files exist.

Element ids other modules rely on:
  #map, #desk      the roots createMap / createDesk receive
  #stack-slot      created BY THE DESK in its third column: createLiveStack's root. If the
                   desk has none, the shell makes one at the end of #desk.
  #stack-overlay   L-4: while vm.stackExpanded the shell moves the Live Stack's `el` here
                   (over the map, ~1248 x 420) and back into #stack-slot after; the stack
                   sizes its canvas from its parent on update.

Phase 1b (desk/README.md §13): the SETTINGS popover (#btn-settings, `,`; B-7) and the body
classes rm / fxlow / crt that follow vm.settings; the one key listener and its order (§13.3:
the desk's key(ev), then the stack's and the map's, then app/keys.js); the #aria-live region
(createLive / liveFrame below); the ?perf budget marks; ?debug -> globalThis.gridwatch.
desk/README.md §30: texts and the alarm panel on demand (Q-44, Q-46), "?" and Esc (Q-47), par (Q-48).
```

#### app/system.js

```text
app/system.js: the game's system operator (desk/README.md §3.4; SPEC L-0, A-1). DOM-free.

The player is the control-room operator; this is the market and dispatch system around them,
which in the NEM runs whether anyone touches the desk or not:
  * 04:30 PRE-DISPATCH (L-0): the merit-order plan for the P50 forecast (autopilot.preDispatch,
    made once from the day-ahead forecast), loaded into the sim's plan as a planLoad input, stops
    included. The stack never starts empty; the levers follow it (K-2, L-6).
  * RE-FLOW FOR THE LIT LOAD (L-0): while districts are dark, dispatch targets metered demand:
    the plan is re-dispatched for the lit load whenever the dark share moves, and every
    PLAN_REFLOW_S while any district stays dark (AEMO's pre-dispatch cadence), so a day with no
    input is never black. The periodic re-flow waits while the player owns the plan: once they
    have edited it (a lever or tie move, a plan edit) since the system's last planLoad, their
    edits win until they press RE-DISPATCH (which hands it back) or the dark share moves again.
  * RE-DISPATCH (A-1): redispatch() re-runs the pre-dispatch from now to 04:00 over the
    commitment the player has now (par's amend: units on and coming, the booked starts and
    stops kept), and every lever glides to the new plan.

Two modes (createSystem({commit})):
  'system'  the Phase 1a behaviour above: the 04:30 plan commits units too (its booked STARTs
            and STOPs). The bench and the planOnly proxy use it.
  'player'  the game (SPEC §9.1 Q-18): COMMITMENT IS THE PLAYER'S. The system never books a
            start or a stop. At 04:30 it dispatches only what is running; from then it
            re-dispatches the committed units (the same planLoad RE-DISPATCH sends) whenever the
            commitment changes (a start, a stop, a booking, a unit synchronised or tripped; from
            Phase 2a also the battery's order or GUARD, from 2b a city lever booked or
            cancelled (obs.levers.rev): commitSig) and
            every DISPATCH_S (5 grid-minutes, as NEMDE does) for the newer forecast. Which units run, and when, is the
            player's plan; a day with no input runs short. A lever, tie or plan-key edit by hand
            still takes the levers over until RE-DISPATCH.
            The belly (Phase 2a, desk/README.md §21.3): the dispatch is for the lit operational
            demand against the wind and solar AVAILABLE; in a surplus it takes every unit to its
            floor and the tie to the export limit, and the sim's own cut spills the rest (C-6). A
            battery order counts for the energy behind it (autopilot batteryOrder).
Everything it does is a sim input (planLoad), logged, so replay() reproduces a game day (F-6).
It runs on the autopilot's 'planOnly' memory and runPar's cadence: a game day with no player
input is the planOnly proxy's day, hash for hash (tests/system.test.js).
```

#### app/tray.js

```text
app/tray.js: the K-9 message tray model. Pure and DOM-free; desk/tray.js draws trayView()
(vm.tray).

Cards come from the sim's records: news (`announce`, by kind, Q-82: weather from the WEATHER BUREAU, the tie from MARKET NOTICE, an outage from STATION, feeders from NETWORK), station notices
(trips, each START / STOP / CANCEL / ABORT, a unit at full speed, lockout releases, water), market notices (the security level
going SHORT or SHEDDING, reserve diesel, DR, and from Phase 2a the minimum-system-load levels,
P-4 / desk/README.md C-9) and the city desk (UFLS, directed shedding, restores, a suburb's air-con locking; its bookings and patience: LOG only). Each card: a sender, a grid time, <= 25 words and ONE button that only focuses a
control (and lights it, L-9); it never dispatches (K-9). At most 3 cards are visible; older
ones (information first) and cards older than CARD_TTL_S go to the LOG drawer. Warning cards ring twice (the
audio cue 'ring2') and never repeat: a warning's key (what it is about) is shown once a day.
Cards never pause play (§7).
```

#### app/watch.js

```text
app/watch.js: the K-15 watch's beat model and the K-16 respond card model. Pure, DOM-free.

The watch plays five beats in the physical order (J-25): inertia -> battery -> governors ->
UFLS -> settle. Which beat is live is read from the contingency's TRACE (app/record.js: the
frequency and what each source had caught at every tick), never from a script, so the
caption always says what the physics is doing:
  inertia    stored spin carries the hole (its catch exceeds the battery's and the governors')
  battery    the battery (its droop plus the GUARD's fast frequency response) catches more
             than inertia; "YOUR GUARD: N MW" when the ring holds some back
  governors  governor response overtakes the battery, until the fall stops and 10 s pass
  ufls       from the first relay operation (only below 49.0 Hz) for 2 grid-s
  settle     from 10 grid-s: droop parks frequency below 50 Hz
The beat index never goes back (a subsequence of the order above, K-15).

Phase 2a (desk/README.md §19.2, §21.4; C-7): a contingency can be a loss of LOAD (the smelter's
potline), and wind, utility solar and rooftop solar answer over-frequency. So the beats read
the trace by the event's sign (a rise is caught by the same sources working the other way),
the inverters' catch (caught.inverterMW) counts with the governors' beat, and the captions
and the card say it in words for both signs: negative = "solar and wind backed off N MW" (a
rise caught), positive = "gave back N MW" (they were backed off before a loss of supply).
A trace or record from before Phase 2a has no inverterMW: it reads as 0.

The respond card (K-16) is <= 4 lines, with no buttons: the nadir against the standard, the
MW each source caught (the record's caught at the extreme, which is the trace value at the
nadir), the problem in plain words (the H-4 level, R5 - L if short, the 30:00 countdown from
secureByTick, dark districts except a held task feeder, the network's outage: Q-69), and "Enter
(or a click) to take the desk".
```

#### audio/audio.js

```text
audio/audio.js: WebAudio for the game (K-19 hum, K-20 foley, K-21 tones, K-22 buses).

Created on the first user gesture (browsers refuse to start audio before one) and silent
when WebAudio is missing or refuses (C-8: the game plays fully without sound). Everything is
synthesised; no samples: a foley voice is mixed from its recipe (audio/model.js VOICES) into
a buffer the first time it is asked for. Math.random is allowed here (fx only, F-3): the
noise layers.

  master <- hum bus (the hum's two gains) | fx bus | alarms bus      gains: vm.settings

At most MAX_NODES nodes live at once, the hum, the buses and the master included; a cue that
would pass the budget is dropped and counted (au.dropped). A delayed cue (delayS) holds no
nodes until it is due: it waits in au.pending and update() starts it, on time, a frame ahead.

  const au = createAudio(globalThis);   // nothing happens yet
  au.start();                           // on the first pointerdown / keydown
  au.update(vm);                        // every frame: hum follows vm.needleHz; vm.settings; vm.cues play
  au.cue('breaker'); au.cue({name: 'clack', pan: -0.2, delayS: 0.09});
```

#### audio/model.js

```text
audio/model.js: the pure parts of the game's sound (K-19 hum, K-20 foley, K-21 alarm tones,
K-22 buses), so Node tests can check them without WebAudio.

K-19 mains hum: transformers hum at twice grid frequency, so the hum has partials at k x 2f
(k = 1..4). A quiet reference tone sits at k x 100 Hz (twice the 50-Hz nominal); each partial
beats against its reference at 2k x |f - 50| (at 49.75 Hz the 400 Hz partial wobbles twice a
second). Default level -30 dBFS. There is no such tone in a real control room: it is
sonification, labelled in the abstractions drawer (H-14).
K-20 breaker close: a bandpassed noise transient plus inharmonic partials near 0.9, 1.4 and
2.2 kHz, decaying over 120 ms, plus a thud.

Phase 1b (desk/README §13.2): every cue is data. A cue is either a TONE (oscillators, the
K-21 alarm sounds) or a VOICE: a list of layers (bandpassed noise, sines, saws, squares, each
with its own envelope) that renderVoice() mixes into one buffer. A rendered voice plays
through a source and a gain (and a panner when panned): 2-3 live nodes, whatever its recipe,
which is what lets 16 UFLS clacks, a horn and a breaker share the 32-node budget.
```

#### content/anchors.js

```text
content/anchors.js: the "?" badges' index, eager (Q-44): {game: the element id, rows: its
entries' row titles}, in content/text.js order, which loads on demand. tests/anchors.test.js
keeps the two equal: an anchored entry added to content/text.js is appended here too.
```

#### content/scenarios.js

```text
content/scenarios.js: scenarios as data (spec F-13, D-8, P-6).

A scenario is plain JSON-able data. createState() copies it into state.scn with the
source keys (src, note, simplified, unverified) stripped, so the sim never reads this
module at run time: state is self-contained.

Source rule: every object whose own values include numbers carries a `src` (legacy
line refs are to index.html v2.0 + Phase 0.1) or `simplified: true` with a `note`
(tests/params.test.js). Times of day are hours; hours >= 24 are the next morning.
Model constants shared by every scenario live in sim/params.js.
```

#### desk/annunciator.js

```text
desk/annunciator.js: the K-8 annunciator view (desk/README.md §6, §30.4). 6×2 tiles from
vm.alarms.tiles (app/alarms.js owns the model: states, flash, priorities); ACK, HORN OFF, EXPLAIN;
in the plan bar (Q-45). A tile press (Q-46): closed, it focuses its control, says what it means and
is W's pick; again while that note shows, the alarm panel opens there; open, it selects. Never a
sim input; it all works during the watch (K-15).

ISA-18.1 sequence R, visual only (§11 B-2): alarm = fast flash (2.5 Hz), ACK = steady, cleared
before ACK = slow flash (0.8 Hz) until ACK, cleared after ACK = dark. Reduced motion: 1 Hz and
steady (desk.css). Each state has its own glyph (◆ ■ ◇), so the flash and the colour are never
the only sign (K-22); an escalated tile (B-1: a P2 tile showing as P1) adds ‼ and a double border.
```

#### desk/bay.js

```text
desk/bay.js: the procedure bay (desk/README.md §6): SYNC (K-12 synchroscope) and RESTORE
(K-13 feeder breakers).

SYNC: the READY units (lit when offered, A-4); open one's scope (`scope`), watch the needle at
phaseDeg turning at slipHz, trim with [ ] (`syncTrim` ±0.05 Hz), close with C or the breaker
handle (`syncClose`; HAND may use the bypass key), U for AUTO (`syncAuto`). With the scope open
and no close for 8 real seconds the desk sends `syncAuto` itself (K-12).
RESTORE: each dark district is a feeder breaker with its cold-load MW; the RESTORE PERMISSIVE
lamp (restoreBlock === ''); a breaker closes (`restore`) only when the lamp and the district's
RESTORE PREVIEW (actions.restorePreview) both allow it. R, ←/→, Enter.
Keys (K-23): O opens the first READY unit's scope (an offered one first; again: closes it),
B is the bypass key (HAND). The scope canvas is role="img" with a text alternative that changes
at most once per real second. Foley (K-20): buttons and tabs cue `button`, the bypass key `key`;
the breaker's own sounds come from the sim's records.
```

#### desk/calc.js

```text
desk/calc.js: the numbers the desk derives from the view model (desk/README.md §6). Pure
functions of observe() values and sim/params.js constants: no DOM, no state, no engine. Each is
unit-tested in tests/desk.test.js or tests/balance.test.js.
```

#### desk/dial.js

```text
desk/dial.js: K-11 frequency dial (canvas) and BALANCE bar (DOM) (desk/README.md §6, §29).

Dial: 49-51 Hz; normal band green, out to 49.5/50.5 amber, beyond red; UFLS marked at 49.0; the
needle (above 10× the last real second's mean, F-4), the TRIP PREVIEW ghost needle, the nadir
pin during a watch, a 3-decimal readout, CHANGE (RoCoF over 500 ms) and SPIN (stored energy,
GW·s); "HAND" on the face in HAND mode. BALANCE bar: the trend, or in an event the scheduled gap
and the borrowed stack that covers it (inertia, battery, governors, load relief and, Phase 2a, the
inverters backing off: wind, utility solar and rooftop solar above 50 Hz, C-7); the segments sum to the
swing-equation imbalance and balance about zero (calc.imbalanceSegments). SHED is the dark
customers' load (obs.demand.unservedMW): the relay MW is net load and is zero or less when a
district that was feeding back at noon is dark (P-12). The canvas is role="img"; its text
alternative (K-23) changes at most once per real second.
```

#### desk/emergency.js

```text
desk/emergency.js: K-7 emergency controls, the A-1 RE-DISPATCH key and the K-2 AGC/HAND key
(desk/README.md §6, §0 A-1, A-3).

Reserve diesel (RERT): a key under a red cover. The first press lifts the cover and shows the
cost and lead; then hold 0.6 s (or hold E) to arm. Armed, the same hold stands it down.
Industrial DR: a big button, hold 0.6 s (or hold D); lamps for the calls left.
DIRECT SHED: a guarded key (lift, then hold 0.6 s), shown only while the gauge reads SHORT or
SHEDDING (A-3). Its face names the district the sim will shed and that district's load
(calc.nextShed, obs.districts[].coldLoadMW: "about 0 MW" for one that is feeding back at noon,
Phase 2a). Nothing here commits on a single tap: clicks are ignored, only holds commit
(DIRECT SHED also takes the keyboard's guarded double: Enter lifts, Enter again within 2 s, §13.3).
Keys (K-23): E / D held; K focuses DIRECT SHED, V the AGC/HAND key, N presses RE-DISPATCH.
Foley (K-20): covers cue `cover` (lift and drop), key switches `key`, push buttons `button`.
```

#### desk/gauge.js

```text
desk/gauge.js: the K-10 N-1 gauge and TRIP PREVIEW (desk/README.md §6, A-2).
"SPARE IN 5 MIN" (R5) against "BIGGEST RISK: <name>" (L), the H-4 word, and the TRIP PREVIEW
for both credible contingencies (the largest unit and the tie import). Plain words on the face;
R5, L and the LOR names sit behind "?". Colours by nadir: >= 49.55 green, 49.0-49.55 amber,
< 49.0 red, always with a glyph. The bars are told apart without colour too (K-22): SPARE is a
solid fill and carries the level's glyph on its number (✓ covers 1.25 × the risk, ! covers the
risk, ✕ short: cross-hatched), RISK is a hatched fill.
```

#### desk/levers.js

```text
desk/levers.js: K-1 motorised unit levers and the K-3 machine guards (desk/README.md §6).

One lever per station (COAL, CCGT, GT·A, GT·B, GT·C). The handle is the station's base point
(the plan's now-edge, obs.stations[].basePointMW); behind it the output needle (outMW), the AGC
band bracket (base ± band, K-2), the 10-grid-minute ramp cone, detent ticks at MIN/25/50/75%,
the 96% spring gate with its red zone (H-2 trip risk) and a tick for the next plan keyframe.
A drag sends `basePoint` on release (and at most every 250 ms while dragging); ↑/↓ ±10 MW,
Shift ±1, PgUp/PgDn next detent; crossing the gate needs 12 px of extra drag or Shift+↑.
An idle station's lever books its start through the plan (`planKey`, AGC mode, L-6).
One lamp per machine with its own START and STOP guards (lift, then press; S S / X X).
Phase 2a (C-10, desk/README.md §19.5): a guard lights when its id is in vm.glow (the
objective's STOP or START), and tells the desk when it is hovered, pressed by a pointer,
focused, lifted or committed (ctx.consider), so the shell can say what the press will do
before it is made.
Foley (K-20): a hand move cues `detent` / `gate` / `ratchet`, a plan move cues `servo`; guards
cue `cover` (lift, drop) and `button` (the press that commits). A rough close shakes the lever.
```

#### desk/rotary.js

```text
desk/rotary.js: K-4 hydro gate wheel, K-5 battery dial + GUARD ring, K-6 tie knob
(desk/README.md §6). DOM controls with role="slider" (K-23): drag in a circle, keys, scroll.
Each sends its sim input on release / key-up and shows the vm's applied value otherwise.
Foley (K-20): a turn cues `detent` across a detent (every GUARD step, the tie's detents, the
battery's IDLE) or else `ratchet`; the hydro gate cues `gate` when a new setting is taken.
```

#### desk/tray.js

```text
desk/tray.js: the K-9 message tray view (desk/README.md §6). At most 3 cards from
vm.tray.cards (app/tray.js owns the model), each with one button that only focuses a control
(actions.ui({do:'focus'})): a tray button never dispatches (K-9). LOG shows the rest.
Keys (K-23): M (the shell) focuses the tray, which lands on the first card's button; ←→ / ↑↓
move between the cards' buttons and LOG; Enter presses.
```

#### desk/util.js

```text
desk/util.js: small DOM and text helpers shared by the desk modules (desk/README.md §6).
No sim imports except sim/params.js; no state; DOM work only on elements passed in.
```

#### render/format.js

```text
render/format.js: plain-text formatting for the bench (numbers, clock, event records).
Pure and DOM-free (tests import it). Wording for the desk moves to content/text.js in
Phase 1a (README §7); the bench shows the sim's own record text.
```

Slice 2c (Q-78): the rate badge names the D-2 segment in CRUISE and NIGHT ("PEAK 150×", in HAND
"PEAK 75×", "NIGHT ROLL 2,100×"), from `modeOf().segment` and its target `rate`; a mode object
without a segment (the bench, fixtures) still reads "CRUISE 120×". `badgeTitle(m)` names the act
(`ACT_TITLES[m.act]`, D-1's four acts in words; '' before 04:30) for the badge's title: the shell
sets it (`#rate-badge` title, app/shell.js drawHeader, wave 3).

#### render/mapdata.js

```text
render/mapdata.js: the map's fixed geometry and the colours the stack, the map (and the
levers, desk/README §7 L-3) share. Pure data plus pure helpers; no DOM. Tested by
tests/map.test.js (G-1: integer scale, terrain to the frame edges, no building off the
terrain; G-2: the silhouette parts of each technology; X-37, X-38; G-3: the rooftop panels
of each suburb in proportion to its rooftop MW, ROOF_PV and roofPanels).

The map is drawn on a fixed offscreen BASE_W x BASE_H canvas and blitted at an INTEGER
scale (G-1). scaleFor() picks the scale from the map area: the largest integer with the
whole width shown and the floor-safe rows (SAFE) fitting the height. Rows the frame cannot
show are cropped from the top (sky first); room left over is letterboxed with the ground
colour below the horizon and the sky colour above it, never sky under the ground.
  1280x268 (the 1280x600 floor) -> x2, 640x134 base px, the SAFE rows exactly
  1280x344 (1280x720)            -> x2, 640x172
  1920x520 (1920x1080)           -> x3, 640x173.3
The horizon sits 14 rows inside SAFE, so even the floor shows a strip of sky (G-3: the sun,
the sunset, the storm cloud) with the stacks, the towers and the CBD breaking it.

Everything a shape needs is data here (base px), so the art can be nudged without touching
the drawing code in render/map.js.
```

### 32.13 The contract review (workflow `wf_dee4b30b-f91`, 2026-10-12)

Four lenses (code truth, SPEC coverage, the player, seams and budgets), each blocker and major
checked by a skeptic: 60 findings, 1 refuted, 59 kept (2 blockers, 35 majors, 22 minors). They
are folded into §32.1–§32.10 above (this section replaces the first draft, `0421a81`; review
reports in the session scratchpad, `2c/review-*.md`). The ones that changed the plan most:
- **RC-1 (blocker):** a warning carrying `windMu` would have started the drought at its warning:
  the series-keys rule (§32.4.6).
- **B1 (blocker):** `securedTick` written in wave 1 would have moved classic's hash mid-wave: it
  is a stage-A block now, and agents stop on a red golden test.
- **The night (RC-8, RC-9, F3, F-3, M3):** one `nightMemo` for par and the player, at a 5-grid-min
  pace, carrying the player's stops and an armed RERT's clock; the spike on played evenings; an
  equivalence test.
- **The restore task (RC-2, F-4, F-8):** `refreshHeld`, `taskLateMWh` and PERFECT, the first
  RESTORE at 10×.
- **COVER (F-1, F-2):** the row's own word, the dial's readability rules.
- **Seams (M1–M11, RC-3–RC-7):** the task staged at p 0 until grid merges; `sim/dark.js`; the
  dailies and the offer rule moved to stage A; the briefing mode held in `state.control.mode`;
  the tray's functions fixed; `deriveExt`/`openDay` and the inject helper; the caps re-measured
  (11.4 KB); sampled night tests; one climatology.
- **SPEC (F1, F4–F10):** the D-2 accept's RESTORE term, the dailies' build stamp and last
  regeneration, the tuning trigger, the §8.2 rows that would have shipped false.
- Refuted: F2 (the contract was already clear that a task feeder past its hand-back is never
  SHEDDING).
