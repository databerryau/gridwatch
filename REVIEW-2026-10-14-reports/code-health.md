# GRIDWATCH review, lens: code health, correctness and maintainability

Reviewer key: `code-health`. Read-only; nothing in the repo was edited or committed. Date: 2026-10-14, at `main` = 52da14a (v4-core-2c.1). This is the finished version of an earlier draft that a usage limit cut off; every claim of the draft was re-checked against the repo (two corrections are noted in §0), the par cost was measured, and three experiments were added (§5).

## 0. What was run

- `node --test` once (the lens allows it): **916 of 916 pass, 0 fail, 0 skipped, 74.0 s wall** (the task text says "about 45 s"; this machine took 74 s). Output in `scratchpad/review/suite.txt`; its last lines read `ℹ tests 916 / ℹ pass 916 / ℹ fail 0 / ℹ duration_ms 74002.3157`.
- `node tools/perf.mjs` (6.9 s) and `node tools/perf.mjs --sizes`.
- `node tools/play.mjs 20261014 timeline=04:30-04:00/30m` (saved as `scratchpad/review/tl-20261014.txt`), plus the short play experiments quoted in §5.
- `git worktree list`, `git branch --merged main`, `du`, `git log` churn counts.
- Scratch scripts in `scratchpad/review/`: `slowmap.mjs` (maps `suite.txt`'s per-test times to files), `deadexports.mjs` (exports no other file references), `parcost.mjs` (times a par day and `app/par.js`'s per-frame slice).
- Read in full: app/game.js, app/director.js, sim/clock.js, app/system.js, app/loop.js, app/par.js, sim/step.js, app/objective.js, sim/autopilot.js, sim/grid.js, app/shell.js, content/dailies.js, tests/budget.test.js, tests/baseline-v4.test.js, tests/sim-lint.test.js; the draw paths of render/map.js and render/livestack.js; tools/perf.mjs and tools/README.md.
- Corrections to the draft: the comment share is **18.8% of lines** (4,466 of 23,729 shipped JS lines; the draft said 24.7% of bytes, which was not measured); `app/session.js` is depended on by `tests/bench.test.js`, `tests/loop.test.js`, `app/bench-boot.js` and `app/input.js` only, **not** by `tools/baseline-v4.js`.

## 1. Headline

The sim is clean, deterministic and well guarded: no `Date`, `Math.random`, timers or transcendental calls under `sim/` (`tests/sim-lint.test.js` enforces it by tokenising the files), `observe()` copies keys explicitly so the desk cannot reach live state, replay is a first-class API and throws on a refused record. The suite is green. The code reads well line by line (the big functions carry their reasoning inline). What will slow the next slices, and what a stranger could feel, is at the seams and in the process:

1. **Four independent models of "when is a unit on / what is short ahead"** (par, the objective line, the plan view, the plan executor), plus two definitions of `startToMinS`. They must agree for the hint line to lead a stranger to par's score, and the line's margin is tuned to par *by measurement* (`COMMIT_MARGIN_MW`'s own comment), so each balance change needs a re-tune.
2. **Every sim change trips two slow regeneration gates** (the 365 stored dailies, ~15 min; the classic-day golden, ~5 min) and the "changed tests" tool degenerates to 76 of 77 files for any `sim/` edit.
3. **CLAUDE.md's test budgets are not met**: 68 tests over 2.5 s, about 33 of 77 files over 6 s, the whole suite 74 s.
4. **The spec's size budget is stale** (F-11 says ≤ 400 KB; the first visit is 406.3 KB and Q-84 made it report-only) and **SPEC §9.1 stops at Q-60** while desk/README.md records Q-61..Q-91.
5. **The module contracts live in 1.04 MB of append-only slice records**, moved out of the code to stay under a cap that has since been waived; and **the whole UI is three closures of 723, 914 and 986 lines** (`bootGame`, `createMap`, `createLiveStack`), testable only through the DOM stand-in, which is why the UI tests are the slow ones.
6. Player-felt: the held "ARMED / IF PRESSED" line freezes its clock times while the clock runs (on the default AGC day, not only HAND); a HAND day's line counts an auto-synchroniser HAND does not have; par's in-page slice costs p95 3.9 ms (max 9.4 ms) a frame during the first 24 real s of play; the night roll computes a forecast and a projection every 0.4 real s for a line that is null; a lit feeder-card permissive leads straight to an UNDER FREQ alarm.
7. Hygiene: 106 stale worktrees (389 MB on a OneDrive path), 142 merged branches, a second shell (the bench) kept alive, 65 exports referenced nowhere.

## 2. Correctness: what was looked for and what was found

### 2.1 Determinism and the replay log (F-2, F-3, F-6): clean

- `grep -rn "Date\.now\|Math\.random\|performance\.now\|new Date" sim/ content/` finds only `sim/rng.js:1` (a comment: "Pure: no state, no Math.random") and `content/dailies.js:13` (`new Date(Date.UTC(y, m-1, d))`: date arithmetic that tells a weekend from a weekday; the local calendar date from `app/game.js:134` becomes a ymd first, so local-vs-UTC cannot disagree).
- Outside the sim, real time and randomness are: `app/shell.js:232` (the frame clock), `app/keys.js:148` (double-press timing), `render/map.js:790-870` (smoke particles, lightning), `audio/model.js:335` (noise, "fx only, F-3"), `render/*:` draw timers. None feeds an input: the log holds ticks only.
- The only transcendental in per-tick sim code is `Math.sqrt` (`sim/physics.js:203-204` battery taper, `sim/grid.js:107` ramp taper, `sim/clock.js:70` the eased clock); sqrt is correctly rounded under IEEE-754 and is rightly not in the lint's `TRANSCENDENTAL` set (`tests/sim-lint.test.js:30`). `sim/weather.js:524,544,597` use sqrt once per forecast, not per tick.
- `applyInput` (`sim/step.js:363-399`) validates shape, folds -0, and logs *after* `grid.applyCommand` may rewrite numeric args, so the log holds what was applied; `replay` (`sim/step.js:669`) throws on a refused record. `app/game.js redispatchAfter` (lines 448-457) applies the system's `planLoad` through `applyInput` in the same call, so the re-dispatch that follows a player START is in the log and replays.
- Order of operations in `app/game.js tickOnce` (lines 340-360): `beforeTick` → `systemInputs` → `step(state, ins)` → records → `onTick` → `A.sampleTick` → history/hashes. `systemInputs` runs at `t % TPS === 1`, after the grid second's update (`app/system.js:114`), and `runPar` does the same (`sim/autopilot.js:1801`): the system operator and par see the same second.
- The director/game/clock seam (`app/director.js` 351 lines, `sim/clock.js` 115, `app/loop.js` 140) is the cleanest part of the shell: the director owns the rate and nothing else (`rateOf` line 185), the loop re-charges the tick that opened a watch at the watch's rate (`app/loop.js:83-87` against `director.rateOfLastTick`), and the eased D-2 profile is closed-form (`sim/clock.js:33-71`). `windows()` (director 127-136) caches the feeder windows on the log length and re-validates each entry: correct and cheap.

### 2.2 State mutated outside `step`: none found

`grep -n "\bvm\.[A-Za-z_.]* *=[^=]\|\bobs\.[A-Za-z_.]* *=[^=]\|\bstate\.[A-Za-z_.]* *=[^=]" desk/*.js render/*.js app/*.js tests/lib/play.js` finds nothing (app/game.js included). `observe()` copies every key explicitly (`sim/step.js:405-429`), so the desk cannot reach the live state through the vm. `app/game.js handleRecords` sets `r.by` on a refused-input record (line 332), a fresh object, not state. The desk and render modules read `vm.` 9-28 times each (`desk/bay.js` 24, `render/livestack.js` 28) and write it never.

### 2.3 "Pure" functions with module-level scratch (low; a trap, not a bug today)

- `sim/grid.js:1063` `CR` is written by `credible(state)`, which `security(state, opts)` calls at line 1186 although `security` is documented "Pure" (line 1144).
- `sim/grid.js:1242` `NOW`, `sim/grid.js:66` `UP/DN`, `sim/autopilot.js:503-505` `LO/HI/OF/X/ORD/CLR`, `sim/step.js:567` `hacc`, `sim/market.js:33` `let count`, `sim/step.js:20` `buf`.
- Single-threaded, non-re-entrant use today, so correct. It becomes a bug the day par moves to a Worker that shares a module instance, or the day something calls `observe()` from inside `securitySecond`. Worth a one-line note at each, nothing more.

### 2.4 API polymorphism from test stand-ins (low)

- `app/game.js:452` and `:473` accept from `system.redispatch` a `{input, reason}` object, a bare string, one input or an array of inputs. `app/system.js:144-155` returns exactly one shape. The other three exist for "a test stand-in" (`app/game.js:143`).
- `sim/grid.js security()` has three calling conventions (lines 1189-1197): `{previewUnitHz, previewLinkHz}`, the "legacy" `{previewNadirHz}` and none.
- `app/game.js recordCues` (lines 318-322) still carries the Phase 1a `cueOfRecord` fallback although `audio/model.js` has had `cuesOfRecord` since 1b.
These are the places a new engineer reads twice.

### 2.5 The five `// eslint-disable-line no-unused-vars` are not dead code

`amendNow` (autopilot.js:1582, called at 1669), `agcSecond` (grid.js:760, called from step.js), `planKey` (grid.js:1458, called at grid.js:400), `priceSecond`, `settleSecond` (market.js:251/283) are all live; the directive covers an unused `out`/`want` parameter kept for signature uniformity. There is no ESLint config in the repo, so the directives document intent only. `grep -rn -i "TODO\|FIXME\|XXX\|HACK\|specPending\|stub"` over the shipped code finds no TODO/FIXME; "K-12/K-13 stubs" survives only in grid.js's header, and "stand-in" means a test double. One stale pointer: `app/objective.js:21-27` says `COMMIT_MARGIN_MW` is "measured in tests/objective.test.js (slow)"; no test in that file references it (`grep -n COMMIT_MARGIN tests/*.test.js` → `tests/objective-day.test.js:142` and four `PAR_COMMIT_MARGIN_MW` sites in autopilot.test.js).

### 2.6 Four copies of "when is this unit on" (medium: the hint line and par can disagree)

| where | ready → on in | starting → on in | who it serves |
|---|---|---|---|
| `app/objective.js:128-134` `onInS` | `u.timerS + m.t2S` | `u.timerS + AUTO + m.t2S` | the objective line |
| `app/planview.js:59-63` | `s + u.timerS + m.t2S` | `s + u.timerS + AUTO + m.t2S` | the Live Stack |
| `sim/autopilot.js:113-120` `onFromNow` | `now + (auto ? u.timerS : 0) + t2S` | `now + u.timerS + AUTO_SYNC_S + t2S` | par |
| `sim/grid.js:1400-1410` `onAtS` | `s + (auto && scope.unit !== u.id ? u.timerS : 0) + t2S` | `s + u.timerS + (auto ? AUTO_SYNC_S : 0) + t2S` | the plan executor |

And `startToMinS` has two definitions: `sim/step.js:496` (observe) is `t1S + AUTO_SYNC_S + t2S` whatever the mode; `sim/grid.js:1397` is `t1S + (AGC ? AUTO_SYNC_S : 0) + t2S` ("auto-sync counted in AGC mode only; HAND closes by hand"). The line and the plan view read observe's (`app/planview.js:34` `startToMin = m => m.t1S + AUTO + m.t2S`), so on a HAND day the 04:30 line says **"Start CCGT 2 now: it takes 49 min to reach the grid"** (`node tools/play.mjs 20261014 --hand brief`), counting `AUTO_SYNC_S` = 240 s (`sim/params.js:151`) that HAND does not have: the executor's own answer is 45 min.

Beyond timing, the "short ahead" arithmetic exists in four places with four conventions:
- `app/objective.js capacityGap` (168-220): `PLAN_MAX_LOADING`, `MARGIN_MW = 150`, tie capped at `TIE_FIRM_MW`, water released from `PAR_WATER_HOLD_UNTIL_H`, `COMMIT_MARGIN_MW = 650` with the comment (lines 21-27): "Par's rule 3 keeps 700 MW over full ratings and half the battery, which is about 600 MW in this check's terms; measured in tests/objective.test.js (slow)". The line is tuned to approximate par, by measurement.
- `sim/autopilot.js situation/rule3` (922-1084): `PAR_MAX_LOADING × availMW + battMW/2`, `PAR_COMMIT_MARGIN_MW`, tie at the plan's import capped at `secureTieMW`.
- `sim/autopilot.js adequacySetup/walk` (1412-1476): `HOT_GATE × avail`, `PAR_RERT_MARGIN_MW`, the tie climbing from its return at `TIE_COL`.
- `sim/autopilot.js eveningHolds` (1173-1195): `PAR_LOADING`, tie `min(limit, big)`, water at `WATER_RELEASE_H`.
- `app/planview.js project` (141 lines; the Live Stack's red runs), a fifth.
`allowedS` (autopilot.js:225) is `market.restoreAllowedS` copied to keep the S-4 information barrier (`tests/sim-lint.test.js:93` pins autopilot's imports to params/step/clock/dark). The two bodies are identical today (checked); nothing tests that they stay so.

`app/objective.js` exports 21 tuning constants, `sim/params.js` holds 33 `PAR_*`; ten of objective's are referenced by no other file (`CRIT_MW`, `HYDRO_SUSTAIN_H`, `BATT_MIN_MW`, `BATT_MIN_H`, `BATT_EASE_MW`, `RERT_STANDDOWN_FRAC`, `RAMP_HEAD_S`, `HYDRO_SUSTAIN_MIN_H`, `BATT_AHEAD_STEP_MW`, and `MARGIN_MW` only by a test).

Why it matters for the north star: par is the score's denominator and the line is the only coach. Each balance change (which the owner now invites: "everything is up for grabs") needs the line re-tuned against par by a slow measurement, or the stranger is told "Enough plant is committed" where par would have started a unit. **Proposal (refactor 1, cost M, no NEM question):** one `sim/horizon.js` (next to `sim/dark.js`, inside autopilot's allowed import set) exporting `onAtS(obsUnit, mode, scoped)`, `startToMinS(mode)` and `capacityPerColumn(obs, fc, policy)`; objective.js, planview.js and the four autopilot walkers call it with their policy constants. Keep the `objective-day.test.js` par-agreement check as the guard.

## 3. The dev loop: why the next slice is slower than it needs to be

### 3.1 Every sim change trips two slow gates

- `tests/dailies.test.js:84`: `assert.equal(DAILIES.v, G.dailyStamp(), 'a sim or desk-scenario change re-checks the dates: run tools/daily-gen.js')`. `dailyStamp()` = `SIM_VERSION|scenarioHash(desk)|scenarioHash(desk-weekend)` (`app/game.js:125`). So a SIM_VERSION bump or any scenario number makes the suite red until `node tools/daily-gen.js --from 2026-10-12 --days 365 -j 8` rewrites `content/dailies.js` (tools/README.md: a par day is 2-2.5 s, 365 dates about 15 min on one core; measured here 2.7 s a day). The stamp is right as a product property (`dailyFor` at `content/dailies.js:27` silently returns `gated: false` when the stamp differs, so a stale list never claims "gate-checked"); it is wrong as a unit-test gate.
- `tests/baseline-v4.test.js:131-140` pins seed 4 of the **classic** scenario (line 25 `import {CLASSIC}`, line 29 `SEED = 4`; no rooftop PV, not a day any stranger plays) cell-for-cell including `hashState` against `tools/baseline-v4.golden.md` (72.9 KB); an intentional change needs `npm run golden:v4` ("about 5 min on 11 worker processes", line 11). Its sibling (line 83) is the 13.5-s S-4 pace + D-9 runtime check.
- `node tools/changed-tests.mjs --list sim/clock.js` → "76 of 77 test files"; `sim/params.js` → 76/77; `app/objective.js` → 46/77; `app/director.js` → 39/77; `desk/bay.js` → 32/77. The import graph is file-granular and 48 of the 60 shipped modules import `sim/params.js`, so the "inner loop" is the whole suite (74 s) for any sim edit.

**Proposal (refactor 2, cost S-M):** (a) stamp the dailies on the two scenario hashes plus a separate `BALANCE_VERSION` bumped only when par's behaviour changes, so a replay-format bump (SIM_VERSION) does not un-gate 365 days; (b) `daily-gen --check` re-gates only the 17 exceptions plus a 20-date sample as a tool, and the unit test checks only the shape; (c) replace the classic golden with one hash pin on a desk daily (e.g. 20261014) kept by `tests/day.test.js`, and leave the H-8 containment statistics to `tools/baseline-v4.js`; (d) make changed-tests hash `valuesOf(V)` rather than the file for `sim/params.js`, so a prose edit to a param note retests nothing.

### 3.2 CLAUDE.md's budgets are not met

CLAUDE.md: "a test file takes 6 s or less when run alone, and a test 2.5 s or less ... A test that checks moments ... jumps the sim between them. It does not step frames."

From `suite.txt` via `node scratchpad/review/slowmap.mjs`: **68 tests over 2.5 s**; summing each file's own tests, **34 rows over 6 s of 78 (one row unmapped), i.e. about 33 of 77 files** (the sum is a lower bound of the file's wall time). The worst:

| s | file | test |
|---|---|---|
| 13.5 | baseline-v4.test.js | S-4 pace ... D-9: a par day ≤ 2 × 1.6 s |
| 11.4 | alarms.test.js | K-8 accept: the competent proxy triggers ≤ 8 audible alarms in a day |
| 10.7 | alarms.test.js | the night roll |
| 10.1 | objective.test.js | a MILD morning to 13:00 (seed 8): the follower starts the CCGT ... |
| 9.8 | feeder-card.test.js | A: a watch queues the feeder card behind its RESPOND card ... |
| 9.7 | acts-audit.test.js | D-1 on the page: the briefing sends only mode inputs; from 04:30 every control ... |
| 9.5 | feedback.test.js | every press answers: the quiet desk, levers, guards, rotaries ... |
| 8.4 | play.test.js | play driver: a jump shows what frame-by-frame play shows |
| 7.2 | autopilot.test.js | S-4: information barrier: scrambling hidden state ... |

Files by summed test time: feedback 34.7 s, alarms 31.1 s, integration 22.0 s, next 21.4 s, feeder-card 20.8 s, objective 20.7 s, autopilot 18.4 s, clock-director 17.7 s, alarmpanel 17.6 s, day 16.3 s, hold 16.2 s, grid 15.1 s. Whole-day proxies (K-8, the night roll, S-4 pace) are statistics in CLAUDE.md's sense ("Statistics over many seeds or whole days are tools, not tests") sitting inside the suite; the rest of the slow ones drive the real page through the DOM stand-in because the UI cannot be reached any other way (§3.5). The rule exists; it is not kept. **Proposal (refactor 3, cost S each):** move the day-long ones to `tools/` (or tag them `--test-only`), and add a 2.5-s per-test timeout in a tiny `tests/lib/budget.js` wrapper so the rule enforces itself.

### 3.3 The documentation is a changelog standing in for a contract

- SPEC.md 317 KB, desk/README.md 477 KB (128 headers), sim/README.md 250 KB: **1.04 MB** of prose against 1.0 MB of code. 45 shipped files open with `// Contract: desk/README.md §32.12 ...` or `sim/README.md §11 ...`; there are 164 `README.md §` pointers in the code.
- The moved headers themselves are desk/README.md §32.12 (**761 lines, 52.5 KB**, "Module headers (moved from the files, Q-61)") and sim/README.md §11 (**1,602 lines, 135 KB**). desk/README.md contains "amend" ×19, "in place of" ×7, "supersed" ×4, "no longer" ×5; e.g. commit 0454e4e: "a §32.11 Q-91 block amends §32.4.1's params, §32.4.8's precedence and §32.7.2". To know what `app/director.js` promises *today* a reader walks its §32.12 block plus every later Q block that names it (13 mentions).
- Churn: desk/README.md has been touched by 92 of the repo's 440 commits, sim/README.md by 66, against app/game.js 35 and sim/grid.js 21. The documentation is edited two to four times as often as the code it describes.
- The prose left the code to stay under F-11's 400 KB (Q-49 at SPEC.md:2395, Q-61 at desk/README.md:3550). Q-84 (`tests/budget.test.js:2-3`, 2026-10-13) made the size report-only. The reason for the move is gone; the cost (contracts separated from code) remains.
- The code itself still reads well: 18.8% of shipped lines are comments and the big functions carry their reasoning inline. What a new engineer lacks is a current-state statement per module.

**Proposal (refactor 4, cost M):** either put each module's contract back as its header (F-11 is report-only; about +28 KB gzip), or generate `docs/CONTRACTS.md` (one current section per module, no Q history) and let the READMEs be the record they already are. And carry Q-61..Q-91 into SPEC §9.1 (§3.4).

### 3.4 Spec-stale items

- SPEC.md:1337 F-11 accept "the first visit transfers ≤400 KB compressed"; :2115 §6 row "387.8 KB after slice 2b ... 12.2 KB left for 2c–2e"; :2433 risk 11 "the first-visit budget is tight". Measured now: `node tools/perf.mjs --sizes` → "| total (50 files) | 1200374 | 416007 |" = **406.3 KB gzip**; `node tools/perf.mjs` prints "Budget 400.0 KB: OVER". Q-84 waived the cap in the test but not in the spec. The ten largest (gzip): objective.js 31.2 KB, grid.js 29.5, map.js 24.0, params.js 21.2, shell.js 19.0, livestack.js 18.0, game.js 15.7, step.js 13.4, physics.js 12.6, planview.js 11.7.
- SPEC §9.1's last row is Q-60 (`grep -o "^| Q-[0-9]*" SPEC.md | tail -1`; 60 rows); desk/README.md names 31 distinct Q-61..Q-91. The single largest stale area.
- tools/README.md and desk/README.md (§31.2 line 2170, §32.3 line 3324) still hand out "eager shares" per agent against 400 KB.

### 3.5 Three closures hold the whole UI (medium; the draft missed this)

A function census (top-level functions per file, by line span): `app/shell.js` has 11 functions in 962 lines, of which **`bootGame` (line 229) is 723 lines**; `render/map.js` has 19 in 1,205, of which **`createMap` (line 291) is 914**; `render/livestack.js` has 5 in 1,112, of which **`createLiveStack` (line 126) is 986**. Each is one closure over its DOM nodes and its draw state. Nothing inside can be unit-tested except by booting the page in the DOM stand-in, which is exactly what the slow tests do (`feedback` 34.7 s, `next` 21.4 s, `integration` 22.0 s, `map` 13.5 s, `livestack` 13.9 s). By contrast `sim/grid.js` (61 functions, longest `applyCommand` 199 lines) and `app/objective.js` (48 functions, longest 119) are testable piecewise, and are. **Proposal (refactor 5, cost M, UI only):** split each closure into a pure layout/data step (`vm → draw list`) and a thin DOM step; test the first with plain objects.

## 4. Performance

- `node tools/perf.mjs` (seed 7, desk, commitment: player, this run): sim per frame p50/p95 **0.044/0.136 ms at 120×**, **0.856/2.006 ms at 2100×** (budgets 1 and 3 ms: OK); view model p50/p95 **0.126/0.266 ms at 120×**, **0.148/2.505 ms at 2100×**. The draft's run had 1.266/2.943 and 0.262/3.662 (machine load); the shape is the same: a 15-20× p95/p50 spread in the view model at the night rate.
- A whole day through the real page headless: `node tools/play.mjs 20261014 timeline=04:30-04:00/30m` ≈ 10 s wall; a par day: **2,694 ms for 4,320,000 ticks = 0.62 µs/tick** (`parcost.mjs`, seed 20261014, desk, 124 inputs, not black). Fine.

### 4.1 Par's in-page slice during the first decision (defect, low-medium; measured)

`app/shell.js:823` runs `game.par.step(PAR_STEP_TICKS)` every frame from TAKE THE DESK, with `PAR_STEP_TICKS = 3000` (`app/shell.js:31`; `app/par.js:24` plays at least `PAR_CHUNK_TICKS = 500`). Measured with `node scratchpad/review/parcost.mjs`:

```
par.step(3000) x 60 frames: p50 1.51 ms p95 3.88 ms max 9.35 ms (first 1.05 )
par done after 1440 frames (24.0 s at 60 fps)
game sim ticks a frame at 540x = 450 ; at 120x = 100
```

So for the stranger's first 24 real seconds of play (PRE-DAWN at 540×, where the first decision is made: 450 game ticks ≈ 0.28 ms a frame) par costs 5-7× the game's own sim, with a 9-ms worst frame that alone exceeds the 8-ms budget, before the map and the stack draw. `tools/perf.mjs` does not include par ("a player following the objective line", no par). A replay of the same day reads par from localStorage (`app/par.js:41-44`). Proposal: a time-budgeted slice (step until 1.5 ms elapsed, at least `PAR_CHUNK_TICKS`) or a Worker (cost S / M).

### 4.2 The night roll's view model does wasted work (defect, low; fix is one line)

`app/game.js:750-763`: when `objectiveDue` fires (`app/game.js:685-688`: every `max(30, rateAt × OBJ_EVERY_REAL_S)` grid-s = every 0.4 real s, `sim/params.js:505`), it computes `game.dayAhead = weather.forecast(state, V.DAY_S - obs.s, ...)` and `proj = game.planview.project(obs)` **before** calling `objective()`, which returns `null` at once in the night (`app/objective.js:383` `if (obs.nightShift) return null`). The 2100× segment is exactly the night roll (`REF_PROFILE` last segment, `sim/params.js:352`), so the view model's 2.5-3.7-ms p95 lands where the sim is already at its 2-3-ms p95; `app/loop.js:15` lags the clock past 12 ms of ticking, so the night may run slightly long on a slow laptop. `node tools/play.mjs 20261014 jump=22:00 ...` confirms no LINE is shown in the NIGHT ROLL. Fix: test `obs.nightShift` before the forecast/projection (cost S).

## 5. Player-felt defects (the five the lens asks for) and three experiments

1. **The held "ARMED / ? IF PRESSED" line freezes its times while the clock runs: on the default AGC day too.** `node tools/play.mjs 20261014 to=06:00 brief 'send={"type":"tie","mw":450}' press=guard-start-gta1 press=guard-start-gta1 to=+3m brief state`:
   ```
   > press=guard-start-gta1
   DURING: CLOCK 06:00:11 | MORNING RAMP 270×
   LINE ● ARMED Press again to confirm. START GT·A: at minimum load (250 MW) by 06:12, 12 min from now, and it must then run 1 h. ...
   AFTER 0.5 real s: CLOCK 06:02:57 | ...
   LINE ● ARMED Press again to confirm. START GT·A: at minimum load (250 MW) by 06:12, 12 min from now, ...
   > press=guard-start-gta1
   DURING: CLOCK 06:03:02 ... LINE ✓ UNDER WAY GT·A is starting: full speed at 06:08, at minimum load by 06:14.
   ```
   Half a real second after the first press the line still promises "by 06:12, 12 min from now"; the confirm lands at 06:03 and the unit is on at 06:14. On HAND (`node tools/play.mjs 20261014 --hand to=06:00 press=guard-start-gtc1 to=+10m look`) the line at **06:11:26** still reads "by 06:09, 9 min from now". Cause: `app/game.js:789` keeps the previous consider line while `masked(was.text) === masked(c.text)` (numbers and clock times masked, `app/objective.js:1310`); `desk/desk.js:40 CONSIDER_HOLD_MS = 6000` real ms keeps the guard "considered" after its cover drops. At 270-540× a real second is 4.5-9 grid-min. Fix: hold the words, re-render the figures (cost S).
2. **A HAND day's line counts an auto-synchroniser HAND does not have** (§2.6): "Start CCGT 2 now: it takes 49 min to reach the grid" at 04:30 (`--hand brief`), from `observe().startToMinS = t1S + AUTO_SYNC_S + t2S` (`sim/step.js:496`) against the executor's `t1S + (AGC ? AUTO_SYNC_S : 0) + t2S` (`sim/grid.js:1397`). HAND is a minority path (AGC is the default), so medium-low.
3. **Par's slice during the first decision** (§4.1): p95 3.9 ms, max 9.4 ms a frame for 24 s at the moment that matters most.
4. **The night roll's wasted forecast + projection** (§4.2): a possible stutter in the one segment where the stranger is only watching.
5. **The card the game told you to answer gives you an alarm.** `timeline` at 06:55 (saved `tl-20261014.txt` lines 33-50): the FEEDER card says "HAR4's feeder in Harbourside is repaired: about 240 MW with its cold load. R or Enter: restore it now"; the bay reads "▸ HAR4 · REPAIRED 241 MW ×1.5 ✓ CLOSE" with "SPARE IN 5 MIN ✓1059". The driver presses Enter; two grid seconds later: "DIAL ! 49.767 Hz CHANGE falling", "BAND LOW 5 MIN", "tile-underFreq "! UNDER FREQ""; the same again at 07:15 (49.808 Hz). The K-13 permissive (`sim/grid.js:1771-1793`) checks `r5MW ≥ cold` and the preview nadir ≥ `RESTORE_NADIR` = `SECURE_NADIR_HZ + PREVIEW_MARGIN_HZ` (grid.js:50) and `fMeanHz ≥ RESTORE_MIN_HZ` = 49.9 (params.js:134), which this pickup passes, yet the normal band (`NORMAL_LO_HZ` 49.85, params.js:115) is left for minutes. Whether that is the physics the owner wants belongs to the physics lens; from this lens it is a seam: the permissive's line and the alarm's line are different numbers, so a lit lamp can lead straight to a P1 alarm.

Experiments that found **no** defect (recorded so the next reviewer need not repeat them):
- **Card answered before the sim's refusal.** `app/game.js:419` answers the feeder card (and dismisses the respond card) before `applyInput` at line 421, so a sim-refused press at a card could consume the card. `node tools/play.mjs 20261014 to=06:54 to=06:56 brief press=restore-HAR3 brief state` (HAR3 under repair until 07:15 while HAR4's card holds): "NOTE RED dk-panel dk-bay: ✕ feeder under repair until 07:15", the FEEDER line unchanged, `state` → `06:55:00 · FEEDER-CARD`. The desk's own pre-check refuses before the game layer, so the ordering is narrow.
- **A hand edit, then a START.** The tie edit (a HAND_EDIT, `app/system.js:14`) makes `heldByHand` true, so `redispatchAfter` (`app/game.js:449`) is skipped; the line still follows the unit from `obs.units` ("✓ UNDER WAY GT·A is starting: full speed at 06:08") and a blue note says "held by hand: RE-DISPATCH (N) hands the levers back". Correct.
- **Night roll** (`jump=22:00` through five held cards): no LINE, "NIGHT ☾ NIGHT SHIFT The night shift has the desk to 04:00 ...", `clock` → "296.5 real s from Space (04:30:00) to 22:00:39 · E 296.5 = profile 234.7 + WATCH 2x +57.7 + ... · off by +0.0 s". D-2's arithmetic closes.

## 6. Hygiene

- **Worktrees:** `git worktree list | wc -l` → **106** entries under `.claude/worktrees` (agent-* from 2026-10-01 08:53, wf_* through 2026-10-13 19:15), **389 MB** (`du -sm .claude/worktrees`), on a OneDrive-synced path; `git worktree list --porcelain | grep -c prunable` → 0 (they are all intact, so `git worktree prune` does nothing). `git branch --merged main | wc -l` → **142**; `--no-merged` → 0; no stashes. `.gitignore` covers `.claude/worktrees/`, so nothing is committed, but every `git worktree`/`git status` and OneDrive pays for them. `git worktree remove` each, then `git branch -d` the 142 (cost S).
- **A second shell kept alive:** `bench.html` (17 KB) + `render/bench.js` (31 KB) + `app/session.js` + `app/input.js` + `app/bench-boot.js` ≈ 68 KB, with `tests/bench.test.js` and `tests/loop.test.js` depending on `app/session.js`. Not in the first visit (`tests/budget.test.js` proves the shape) but maintained through every seam change. `classic.html` (92 KB) is frozen by design.
- **Exports referenced by no other file (65)** and **used only by tests/tools (215)** (`node scratchpad/review/deadexports.mjs`). The 65 include `sim/grid.js SYNC_BLOCKED`, `sim/params.js machineById`, `sim/weather.js secondOfHour/tableSmooth/clearSkySolarMW`, `app/director.js FOCUS_RATE/WATCH_SCHEDULES/HIGH_ROCOF_HZ_S/scheduleFor`, `app/game.js histView/HIST_COLS/HIST_COL_S/OBJECTIVE_EVERY_S`, ten `app/objective.js` tuning constants, `desk/levers.js planSays`, `render/charts.js niceStep`. Not harmful; the cost of "export for tests" without the test.
- `shots/` (10 PNGs) is ignored; `tools/baseline.golden.md` (3.5 KB) and `tools/baseline-v4.golden.md` (72.9 KB) are committed goldens.

## 7. Tests that assert nothing or pin numbers

- No test file without `assert` (`grep -L assert tests/*.test.js` → none). Three conditional skips, all live today: `tests/belly.test.js:29` (C-7 flags; both `true` at `sim/params.js:449-450`), `tests/clock-director.test.js:336` (`T.trayBriefing` exists at `app/tray.js:182`), `tests/dailies.test.js:82` (the list is not empty).
- 106 `assert.equal(x, <3+ digit literal>)` sites; sampled 40: nearly all are constants of the design (`NIGHT_S 61200`, `TOAST 3000`, detent tables) or arithmetic identities, not measured outputs. The measured pins are `tests/dayplan.test.js:290-291` (`canonicalHash(...) === 1036444559`, the event plan's hash on classic) and `tests/baseline-v4.test.js:128,131-140` (seed 4's 22 cells and hash). Both are legitimate regression anchors; the cost is the 5-min re-record on every intended change (§3.1).
- `tests/budget.test.js` is diagnostic-only for size (Q-84) but still asserts the shape of the first visit and the on-demand set: good.

## 8. The five refactors that would most speed up future slices

1. **One horizon module** for "when is a unit on / what is short per column", shared by par, the objective line, the plan view and the executor (§2.6). Cost M. Removes the measured retune of `COMMIT_MARGIN_MW` after every balance change and makes a HAND day's line right.
2. **Decouple the two regeneration gates from SIM_VERSION** (§3.1): a `BALANCE_VERSION` in the dailies stamp, `daily-gen --check` on the exceptions only, and a desk-day hash pin in place of the classic golden. Cost S-M. Turns a 15-min + 5-min tax per sim change into seconds.
3. **Enforce the test budget and move whole-day proxies to tools** (§3.2); make `changed-tests.mjs` key on `valuesOf(V)` for `sim/params.js`. Cost S. The 74-s suite becomes the exception rather than the inner loop.
4. **Bring the contracts back beside the code, or generate one current CONTRACTS.md** (§3.3), and move Q-61..Q-91 into SPEC §9.1. Cost M. The next agent reads one page, not 727 KB with 19 amendments.
5. **Split the three UI closures** (`bootGame` 723 lines, `createMap` 914, `createLiveStack` 986; §3.5) into a pure `vm → draw list` step and a DOM step. Cost M. The UI becomes testable with plain objects, which is where most of the slow test seconds go.

Cheap cleanups beside them (cost S together): retire the bench shell, delete the 65 unreferenced exports, prune the 106 worktrees and 142 branches, fix the stale `COMMIT_MARGIN_MW` pointer and the `cueOfRecord` fallback.

## 9. Questions for the owner (from this lens)

- **The classic golden.** Options: (a) keep as is; (b) pin a desk daily instead (what strangers play) and keep the classic day in `tools/baseline-v4.js` only; (c) drop the hash pin and rely on D-6's replay tests. Recommendation: (b).
- **The dailies gate as a unit test.** Options: (a) keep `DAILIES.v === dailyStamp()` as a hard test; (b) make it a CI-only check with a `daily-gen --check` on the exceptions; (c) split the stamp (scenario hashes + BALANCE_VERSION). Recommendation: (c), then (b).
- **Where the contracts live.** Options: (a) READMEs as now; (b) headers back in the files (F-11 is report-only since Q-84); (c) a generated CONTRACTS.md. Recommendation: (b) for sim/ and app/ (the files everybody reads), (c) for the rest.
- **The feeder permissive vs the alarm band** (§5.5): (a) keep (cold-load pickup is real; the alarm is the lesson); (b) raise the permissive to the normal band (49.85 + a margin over the pickup's dip) so a lit lamp never alarms; (c) keep the permissive but make the card say "expect a dip to 49.8 Hz". Recommendation: (c) if the physics lens confirms the dip is wanted, else (b). The real NEM restores cold load in small blocks precisely to stay inside the band.

## 10. Verification crib

- Suite: `suite.txt` last lines → "ℹ tests 916 / pass 916 / fail 0 / duration_ms 74002".
- Timings: `node scratchpad/review/slowmap.mjs` on `suite.txt` (68 tests > 2500 ms; 34 rows over 6 s of 78).
- Size: `node tools/perf.mjs --sizes` → "| total (50 files) | 1200374 | 416007 |"; `node tools/perf.mjs` → "Budget 400.0 KB: OVER", "| 2100× | 1750 | 0.856 ms | 2.006 ms | 3 ms | OK | 0.148 ms | 2.505 ms | 16 |".
- Par cost: `node scratchpad/review/parcost.mjs` → "par day ... 2694 ms for 4320000 ticks", "par.step(3000) x 60 frames: p50 1.51 ms p95 3.88 ms max 9.35 ms".
- Changed-tests: `node tools/changed-tests.mjs --list sim/clock.js` → "76 of 77 test files".
- Worktrees: `git worktree list | wc -l` → 106; `du -sm .claude/worktrees` → 389; `git branch --merged main | wc -l` → 142.
- Frozen ARMED line (AGC): the command in §5.1 → "06:02:57 ... by 06:12, 12 min from now" then "at minimum load by 06:14". HAND: `node tools/play.mjs 20261014 --hand to=06:00 press=guard-start-gtc1 to=+10m look` → LINE at 06:11:26 "by 06:09, 9 min from now".
- HAND 04:30 line: `node tools/play.mjs 20261014 --hand brief` → "Start CCGT 2 now: it takes 49 min to reach the grid."
- Restore → under-frequency: `tl-20261014.txt` lines 33-50 (or re-run `node tools/play.mjs 20261014 timeline=04:30-04:00/30m`) → "## 06:55:02 mode:CRUISE ... DIAL ! 49.767 Hz ... BAND LOW 5 MIN ... tile-underFreq "! UNDER FREQ"".
- Night waste: `app/game.js:761-763` run before `app/objective.js:383`; `objectiveDue` at `app/game.js:685-688`.
- Four copies: `app/objective.js:128-134`, `app/planview.js:59-63`, `sim/autopilot.js:113-120`, `sim/grid.js:1400-1410`; `startToMinS` at `sim/step.js:496` vs `sim/grid.js:1397`.
- Giant closures: `grep -n "^export function bootGame\|^export function createMap\|^export function createLiveStack" app/shell.js render/map.js render/livestack.js` → lines 229, 291, 126 in files of 962, 1205, 1112 lines.
- Dailies gate: `tests/dailies.test.js:84`; `app/game.js:125`.
- Spec: `sed -n 1337p SPEC.md`; `grep -o "^| Q-[0-9]*" SPEC.md | tail -1` → "| Q-60"; `grep -c "amend" desk/README.md` → 19.
