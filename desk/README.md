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
| suburb card (2b, Q-56) | H (opens the line's or the hovered suburb, else the last, else the first; again: closes), or a click on a suburb | its own arrows, PgUp/PgDn, Home, End, Enter, Tab (S, X and P do nothing there, so the lever behind it never moves); Esc or H closes |

Free letters the desk agent may claim for new routes: G, O, B, K, V, N. Document every key in
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
| C-11 | L-5's blue over-reports (it counts price-taking imports: 10 blue columns at $26 with nothing spilled). | Blue = **projected spill**, the same arithmetic as C-6 on the projection: committed minimums + forecast wind and utility solar (after the manual LIMIT) − (P50 + export room + the charge `project()` steps from the present battery order), where > `SURPLUS_MIN_MW` (50). Export room is `fc.exportLimitMW[q]`, 0 while the tie is tripped. Its own array and run list (`proj.surplusMW`, `blueRuns`), never a kind in `proj.gap`. From P50, not P10, in 2a. | Blue should mean "this will be wasted": the thing the player can act on. It then agrees with what the sim spills. |
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
             // so nowMW = underlyingMW - rooftopMW - (SMELTER_MW - smelter.loadMW) holds in obs);
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
* scenarioForSeed(seed) in app/game.js          // 'desk-weekend' when the seed reads as a valid YYYYMMDD Saturday or Sunday, else 'desk';
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
  del: '' when a flexDel of that block would be accepted now, else the exact refusal
  LV = {mw, cost, fromS, toS, block}
```
- `mw`: what a booking now would deliver (U-1 MW × response); `cost`: the patience it would
  cost; `fromS`/`toS`: the earliest and latest `atS` a booking now may take (on the lattice; −1
  when none); `block`: `''` when a booking in `[fromS, toS]` would be accepted, else the exact
  reason one would be refused. **The card, par and the objective check eligibility only through
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
day-ahead (or the 4.5-h forecast; -1 is "not now": no line), startBy the booking's deadline
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
          roofs (mapPinText still says them, for the card). Wind, solar and the ground still
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
  text    stackSummary adds "Booked: <block>." for each block whose core is not over and
          starts inside the 4.5 h drawn (K-23: what the picture shows; later ones are on the
          map's tags).
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
                    the player's aim, patience or the last block's del change; names the dialog
                    (aria-label) by its suburb
  card.focus()      the first row's press (RESTORE, else the first CANCEL or BOOK), else ✕
  verdict(fc, lv, id, atS, effMW) -> '✓ …' | '✕ …' | ''   §31.9.4, pure (tests)
  WIT, LEVERS, PEAK_BAND_MW   the U-1 lines, each lever's name and "?" row, the band (100 MW)

What it shows, top down (1280×600 gives it 194 px; a HOT day with both levers fits; two booked
cycles and a soak scroll, the last resort):
  NAME · 420k homes · ✕ (btn-suburb-close)
  n DARK: [RESTORE] (city-<ID>-restore: focus bay-restore; the card stays)   only with dark districts
  “U-1's dry wit”
  patience 40: 90% respond (all respond from 50; air-con locked under 25) · draws <lit MW> · roofs <MW>
  per offered lever (obs.levers.offered; on a MILD day "AIR-CON CYCLE: hot days only (…)"):
    each booked block: SOAK 10:30–14:30 booked|under way|done: tonight's heating −525 MWh   [CANCEL]
                       AIR-CON 18:45–20:15 booked: pre-cool from 17:45 · snapback to 21:45 · $22.5k · patience −10 [CANCEL]
      (CANCEL city-<ID>-<lever>-cancel-HHMM; dimmed, aria-disabled, once its del is not '': under
      way from the soak's first MW or the cycle's pre-cool, so the row names the pre-cool; done
      after the soak's end or the cycle's snapback)
    the aim: HOT WATER SOAK +140 MW [◀] 10:30–14:30 [▶] [BOOK] [?]   (BOOK = city-<ID>-<lever>,
      ◀ ▶ = -earlier / -later, ? = q-<lever>: deps.toggleHelp(q, [LEVERS[lever].row]))
    what it does: takes 525 MWh at noon; tonight's heating −525 MWh · no payment
                  pre-cool from 17:45 · snapback to 21:45 · $22.5k · patience 60 → 50
      or, when LV.block is not '', that reason in blue (◀ ▶ hidden, BOOK dimmed)
    air-con: the verdict of the aim, or of the suburb's last booked cycle when it cannot book and
      that cycle can still be cancelled (none once it starts: the day-ahead then has only the
      columns after now, and its "peak" would creep past the real one)

The aim: the player's (◀ ▶, - =: 15-min steps) kept inside [fromS, toS], else aimFlex over
vm.dayAhead || obs.forecast (fromS while it says -1). BOOK forgets it; CANCEL leaves the
cancelled block's time as the aim to re-aim from. A booked block is never moved in place.
Energies and times come from sim/weather.js flexParts (the sim's own shapes); the payment is
the core's MWh × AIRCON_PRICE (lit districts; dark ones are not paid).

A press (BOOK, CANCEL, ◀ ▶): the row's rest first (COMMIT_LOCK_MS after an accepted BOOK or
CANCEL: "booked: OLD HAZELTON soak 10:30–14:30"); then ◀ ▶ step (blue "earliest 10:00" /
"latest 11:00" at the ends; on a booked soak or a focused block "booked for HH:MM: CANCEL, then
BOOK the new time", or that block's del once it is under way); BOOK and CANCEL answer in blue
and send nothing in the briefing ("Take the desk first: Enter."), after the day ("Day over:
…"), in the watch ("desk locked while the grid catches itself"), on LV.block ("<Suburb>:
air-con locked: patience below 25", "… too late: it would start in the past", "… one soak a
day: already booked") and on a block under way (its del). A refusal from the sim stays the
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
misses the HH:MM peak", "pre-cool lands on the HH:MM peak", "snapback lands on the HH:MM peak".
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
`atS` lies in the soak window and its tick is no later than the last soak start
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
- `cost.flex` loops a suburb's districts only while its relief is non-zero (no scratch array).
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
