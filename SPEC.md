# GRIDWATCH — v4 Design Spec

**Target release:** v4.0
**Written:** 2026-09-30
**Supersedes:** v3.0 (2026-07-30), which stays in git history
**Applies to:** today's `index.html` (v2.0: 1,522 lines, 88,590 bytes, one file), which becomes a static multi-file site
**Repo:** [databerryau/gridwatch](https://github.com/databerryau/gridwatch), branch `spec-v4`. `main` is the live GitHub Pages branch: <https://databerryau.github.io/gridwatch/>
**Status:** Phase 0 shipped; Phase 1a (the greybox desk on `next.html`) built, awaiting the greybox check; Phase 1b (desk polish) built; the commitment is the player's on `next.html` (§9.1 Q-18); Phase 2 is being delivered in five slices, 2a–2e (§5, Phase 2): slice 2a, the belly (rooftop PV, day types, MSL notices, automatic curtailment, UFLS on net load), is built on `next.html`: the sim, par, the view and the objective line, with its STOP, BATTERY and pre-press lines (§9.1 Q-19–Q-38)

**How to read this.**
- §0–§2 say what we are making and the rules it must follow.
- §3 measures the game as it is today.
- §4 describes the finished game on one page.
- §5 is the build list, in phases. Every item has an *Accept:* test.
- §6–§11 cover targets, positioning, realism, risks, verification and release.

Each jargon word is explained the first time it appears, and again in Appendix B.

---

## 0. North star

> **GRIDWATCH: run one Australian city's power for one day, in five minutes, from a control desk you can feel. Plan the day, watch real physics catch the fall when a power station trips, then share how your day went.**

Every requirement serves at least one of these pillars.

| # | Pillar | What it means in play |
|---|---|---|
| 1 | **The desk as instrument** | Every machine is on the desk at once: throttle levers, a hydro gate wheel, key switches, breakers, a frequency dial, and a mains hum you can hear. No forms, no menus, no one-asset-at-a-time panel. On a first shift, controls not yet handed over sit under cover plates and Marg runs them (O-3). |
| 2 | **The plan comes together** | Reliability is bought hours ahead. You shape the afternoon with the levers and the Live Stack. At 17:00 six levers glide up together, the hum holds steady and the alarm panel stays dark. |
| 3 | **Honest physics you can watch** | When a power station trips, the first 30 seconds play in slow motion from a real swing-equation model: stored spin, then the battery, then the governors, then the relays. Numbers come from the NEM rulebook, and every simplification is labelled. |
| 4 | **The Australian duck** | Rooftop solar hollows out midday demand (the "belly") and sharpens the evening climb. Noon becomes a second crisis, with its own tools in the suburbs. |
| 5 | **A fair daily you share** | One seeded day, the same for everyone. It is always solvable by a good plan and graded against par, and it ends in a spoiler-free share card. |

**What GRIDWATCH is not:**
- A planning spreadsheet with a RUN button. That is *Grid Operator*'s loop (see §7).
- A reflex test.
- A tycoon game.

---

## 1. Owner decisions

These come from the owner interview (2026-09-29/30) and the owner's follow-up message (2026-09-30). They are requirements, and this spec does not re-open them.

| # | Decision | Choice | Consequence for the design |
|---|---|---|---|
| OD-1 | Audience | Curious public, reached by a shared link. Success = strangers finish a session and share it. | Zero install. First real action within 60 s (O-2). No tutorial wall (O-1). A share card (Y-4). |
| OD-2 | Platform | Desktop only. | v3 mobile work (v3 R-1) dropped. Layout budgeted for a 1280×600 viewport (K-17). A phone gets a landing page, not the game (Y-8). |
| OD-3 | Purpose and tone | Mostly fun; learning is a side effect. A serious control room with dry wit. | Short, optional concept cards (O-4). Supervisor "Marg" (O-6). Suburbs with one-line personalities (U-1). |
| OD-4 | Who has played | Only the owner. They found v2 too stressful and confusing. They will run 3–5 think-aloud playtests with friends and family. | A 2-person greybox check (after Phase 1a) and two playtest gates (after Phase 2 and Phase 4). AGC on by default, free pause, one new control at a time, at most 5 on a first shift (O-3). |
| OD-5 | Fantasy and length | "The plan comes together." A session of about 5 minutes. | Live Stack (L-), motorised levers (K-1), variable clock with a 245-s grid day (D-2). |
| OD-6 | Realism | Sacred. Physics and market behaviour must be defensible against the real NEM (Australia's National Electricity Market). Ease the interface, not the laws, and label deliberate abstractions honestly. | Constraint C-5, the §8 realism ledger, the H- requirements and the in-game "?" labels (H-14). |
| OD-7 | Regulation | AGC (automatic generation control) is on by default. Flying by hand is a harder mode. | K-2, D-7. |
| OD-8 | The trip moment | "Watch, then respond." The first ~30 s after a contingency (a sudden failure) play automatically in slow motion, showing inertia, then governors, then battery response, then the load-shedding relays catching it. Then the player restores. No reflex tests. | K-15 (watch) and K-16 (respond). No dispatch input during the watch. The watch plays the physical order, battery before governors (J-25). |
| OD-9 | Scoring | An operator scorecard: LIGHTS ON (unserved MWh), CUSTOMER COST and CO₂. No generator profit. | S-1–S-3. Defect X-7 is retired. |
| OD-10 | Fairness | Every daily is solvable by a good plan. It is graded against PAR: a fixed reference policy, run on the same seed, using only information a player has. | S-4, D-9, F-8. |
| OD-11 | Shape | A DAILY first: one seeded ~5-minute day, the same for everyone, with a Wordle-style spoiler-free share card and local history and streak. Later, an optional WEEK mode: 5–7 linked days, carry-over of water and maintenance, one build/retire choice. | Phase 4 (daily) and Phase 5 (week). |
| OD-12 | Rooftop PV | Core. Behind-the-meter rooftop solar creates the midday minimum-demand belly: minimum generation binds, prices go negative, there is a curtail-or-cycle-coal dilemma and battery arbitrage pays. It also creates the steep evening ramp. | Phase 2, before playtest gate 1 (P-1–P-4, P-9, P-12, U-1–U-4, U-6, S-14). Phase 3 adds the rest of the city (P-10, U-5, U-7, U-8, the VPP). |
| OD-13 | Layout | Half and half: a living SimCity-style map on top, a control-room desk on the bottom. | K-17, G-1–G-5. |
| OD-14 | Core interaction | "Desk as instrument": throttle levers per unit, hydro gate wheel, key switches (e.g. arm diesel), big buttons (call demand response), alarm acknowledge. SYNC and RESTORE are procedures played as mini-skills. Blended in: (a) a LIVE STACK forecast you drag; (b) CITY FLEXIBILITY on the map; (c) tactile moments with sound. **Not chosen:** a "poke the grid" sandbox opening. | K-, L-, U-. The first session opens on today's daily, not a sandbox (O-1). |
| OD-15 | Technology | The single-file rule is dropped: "use whatever design you want, I just want to be able to host it simply." Keep one canonical host (GitHub Pages; pushing `main` deploys). Restart stays an in-page reset. `<meta charset="utf-8">` comes first in every HTML file. | C-1–C-4. |
| OD-16 | Positioning | "Move further away from the *Grid Operator* competition; be more fun and interactive." | §7, the W-5 guard rail. No planning phase, no pause-cards, no money, perks or seasons. |
| OD-17 | Delegated design calls | On the open §9.1 questions: "make the most fun choice". | §9.1 Q-1–Q-5 decided: battery GUARD ring (K-5, H-8), break-glass RERT (K-7), steepness-driven evenings (S-12), SYNC offered when it matters (K-12), calendar weather seasons (Y-9). |

---

## 2. Constraints

These replace v3's C-1..C-5.

| # | Constraint | Why |
|---|---|---|
| C-1 | **A plain static site served as-is from `main`.** HTML, CSS, ES modules (JavaScript files that `import` each other natively in the browser) and data kept as JS modules. No build, bundle or copy step. No runtime npm dependency. No request to another origin. *(Replaces "single file".)* | OD-15, "host it simply". v2 drifted because of a manual copy step, and serving the repo as-is removes it. |
| C-2 | `<meta charset="utf-8">` is the first element of every HTML file. | Plain static servers garble Hz, ·, ★ and the block characters without it. |
| C-3 | Restart, retry and next-day are in-page resets (`createState`). Never `location.reload()`. | A reload is unreliable in the dev preview and throws away resume state. |
| C-4 | **<https://databerryau.github.io/gridwatch/> is the one canonical host.** Pushing `main` deploys. Playtest builds are pages on that host (e.g. `next.html`). | One URL to share, nothing to keep in sync. |
| C-5 | Physics and market behaviour must be defensible against the real NEM. Each deliberate abstraction is labelled in-game next to the real value (§8). | OD-6. |
| C-6 | **Determinism.** Sim output depends only on `SIM_VERSION`, the seed, the scenario and the input log. External events never depend on play. | A daily is only fair if everyone gets the same day. Par, replay and resume all depend on it. |
| C-7 | **Honest time.** There is one grid clock, and physics is always integrated in grid seconds. Only the playback rate varies, and it is always shown. | The game can slow down and speed up without bending physics or opening an exploit (critique #13). |
| C-8 | Storage and audio are optional. The game plays fully without either. | Private windows, blocked storage, muted laptops. |
| C-9 | Desktop only: a viewport of at least 1280×600, mouse and keyboard. A 1366×768 laptop leaves about 1366×625 after browser chrome. Narrower viewports and touch-only devices get the Y-8 landing page. | OD-2. |
| C-10 | Performance budget as in F-11. | 60 fps with room for the map. |

**Accepted consequence of C-1.** ES modules do not run from `file://`, so an emailed or offline copy of the game stops working. v3 valued that. See §9, risk 8.

---

## 3. Current state — measured

### 3.1 How this was measured

**Durable evidence** (lives in the repo):
- `tools/harness.js` loads today's `index.html` headless.
- `tools/policies.js` holds the scripted players: `doNothing`: never touches anything; `reactiveOnly`: chases frequency, never commits plant; `competent`: the balance lens's best preset, reading only what the screen shows; `competentClassic`: the review's reference policy.
- `tools/baseline.js` prints the tables below. The command is `node tools/baseline.js`.

**Supporting evidence** (outside the repo):
- The six-lens review of 2026-09-29: fun, edu, balance, pacing, spec and comparables, plus a synthesis and a critique.
- The v4 design labs of 2026-09-30.
- These live in the review session's local scratchpad folder (not in the repo), under `reports/`, `v4-foundations/`, `v4-desk/`, `v4-rules/`, `v4-day/`, `v4-livestack/` and `v4-facts/`.
- They are working files, not durable. Numbers quoted from them name the lens.
- Where the critique corrected the synthesis, this spec follows the critique.

**Build measured:** `index.html`, git blob c45dda6ef5, 88,590 bytes. Seeds 1–100, Node v24.18.0.

### 3.2 Baseline (`node tools/baseline.js`, verbatim numbers)

The weather class is fixed by the seed: heat 53, storm 24, calm 23. "In band" means 49.85–50.15 Hz.

| Policy | Grades, all | Heat | Storm | Calm | Median in-band % | Mean unserved MWh | Blackouts | Black time p10 / p50 / p90 | Final grade = grade at 21:00 |
|---|---|---|---|---|---|---|---|---|---|
| doNothing | F100 | F53 | F24 | F23 | 32.0 | 6,563 | 100 | 10:33 / 13:21 / 15:50 | 100/100 |
| reactiveOnly | F100 | F53 | F24 | F23 | 79.5 | 2,736 | 100 | 13:10 / 15:08 / 17:00 | 100/100 |
| competent | S30 A7 B1 C7 D48 F7 | S2 A1 C5 D39 F6 | S12 A4 B1 C2 D5 | S16 A2 D4 F1 | 95.1 | 1,061 | 7 | 18:39 / 19:25 / 19:51 | 95/100 |
| competentClassic | S29 A3 B1 C6 D55 F6 | C1 D47 F5 | S11 A3 B1 C5 D4 | S18 D4 F1 | 94.4 | 1,179 | 6 | 18:39 / 19:32 / 20:02 | 97/100 |

**What the optimistic supply bound means.** At every whole sim-minute, all day, the bound adds up:
- every unit not in protection lockout, at heat-derated capacity, with no start, ramp, minimum-generation or water limits;
- interconnector 800 MW (0 while faulted);
- battery 500 MW;
- diesel 300 MW;
- demand response 350 MW;
- wind and solar available that minute.

It is measured along the competentClassic run, with scheduled outages. "Short" means the bound is below demand at one or more minutes. On a short day no player could have avoided shedding load.

| Weather | Days | Short at some minute | Short on 15-min mean | Short even with no outages | Worst 1-min margin, MW, p10 / p50 / p90 |
|---|---|---|---|---|---|
| heat | 53 | 49 (92%) | 46 | 42 | −1,143 / −377 / −53 |
| storm | 24 | 17 (71%) | 16 | 0 | −363 / −169 / 506 |
| calm | 23 | 6 (26%) | 5 | 0 | −713 / 168 / 721 |
| all | 100 | 72 (72%) | 67 | 42 | −934 / −185 / 447 |

The balance lens used a different bound: 15-minute mean, 16:30–21:30 only. On that bound, 75% of heat days are short. Numbers from different bounds are not comparable. Neither are seed-numbered results from builds that use random numbers differently.

**Reference contingency.** One Mt Hazel machine trips at 04:00 from a balanced grid. No player action follows.

| Measure | p10 / median / p90 |
|---|---|
| Output lost (MW) | 500 / 500 / 500 |
| Inertia readout before → after | 3,946 → 3,946 (unchanged on every seed) |
| Trip → leaves 49.85–50.15 Hz, real s | 1.8 / 2.1 / 3.2 |
| First-swing nadir (lowest frequency), Hz | 49.810 / 49.829 / 49.847 |
| Tripped station's own ramp "regains" in 5 real s (MW) | 120 / 120 / 120 (real value ≈ 1 MW) |
| Back inside the band, real s | 4.1 / 7.9 / 11.5 (94/100 seeds) |
| UFLS reached within 60 s | 0/100 seeds |

Other baseline facts:
- Re-runs are byte-identical per seed and policy.
- Machine-dependent timings (the only lines that vary between runs): `tick()` costs 1.2–2.7 µs per tick, and a whole shift runs in 51–83 ms, across the runs made so far.

### 3.3 Key findings

1. **It is a reflex test.**
   - Grade S needs a whole-fleet redispatch every 3 s or faster (balance §3). At 5 s intervals, S drops to 0.
   - A human needs about 5.5 s per action with today's one-asset dock. That is a keystroke estimate (pacing §0), not yet checked with a person.
   - After a trip during play, frequency leaves the normal band in about 1.2 s (median across times of day, pacing §2), and UFLS starts a median 14 s after the trip if nobody acts (pacing §2; 65% of those trips caught the battery charge trap, X-13). The 04:00 reference trip in §3.2 is milder: it never reaches UFLS.
   - A shift asks for 150–170 decisions, 38% of them meaningful; about 60 remain once the trims are automated (pacing §1, critique #7). The fun lens's "2,400 chores against 11 decisions" came from a bot acting every 0.1 s.
2. **The dice decide the grade.**
   - Heatwaves fall on 51–53% of days (`w<.5`, L338).
   - On 75% of heat days the evening peak is short even with every resource at full (balance §3). On the 1-minute all-day bound, 92% are short (§3.2).
   - Among good players, the seed explains **84%** of grade variance (balance §3).
3. **The score contradicts the role.**
   - Revenue is `min(price,300) × served` (L527), and price comes from the reserve margin. So holding reserve lowers P&L: committing everything loses $4.9M of revenue at equal fuel, and a lean reserve earns 18% more (balance §4; spec E3).
   - Interconnector flow is left out of the margin (L523), so importing *raises* the price: $117 → $308 on seed 12 (edu M2).
   - The evening price sits at $7,796, the curve's **ceiling** (L434; critique #4).
   - Penalties explain R² = 0.976 of P&L, so P&L is really a shedding score.
   - The CO₂ tip (L596) fires on every run and gives false advice.
4. **Realism bugs undercut the one thing no competitor does.**
   - Governors have no lag, so inertia never changes the nadir: 49.775–49.783 Hz across a 48× range of inertia (desk E1).
   - UFLS starts at 49.2 Hz; the real first stage is 49.0 Hz.
   - The grid goes black at 48.5 Hz within 0.2 s.
   - STOP deletes a unit's output instantly.
   - An overheating unit's trip lands on a random unit.
   - A tripped machine keeps its inertia.
   - There are two reserve definitions.
   - There is a battery standing-charge trap.
   - The price cap is stale.
   - There is no rooftop PV.
   - The restore rule is hidden.

   See §3.5.
5. **The pacing is inverted.**
   - The first ~3 real minutes are busywork with no events.
   - The climax (18:00–20:00) is when the player has least to do: 6.5 decisions/min and 49% busy, while frequency is out of band 66% of the time.
   - The last 4 minutes (33% of the session) are dead air. The grade is settled by 21:00 in 95/100 runs.
   - On 74/100 seeds two contingencies land less than 30 s apart (pacing §1–2).
6. **Seeded replay is impossible.** One `Math.random` stream feeds weather, player-dependent draws and rendering. Two policies on the same seed diverge on 49 of 50 seeds, median 11:26 (foundations lab). As written, v3 F-2 fails its own test.
7. **What works and must be kept.**
   - The winning plan is what a real dispatcher does: commit ahead, and save hydro and battery for the net-load peak.
   - There are no cheap exploits.
   - Frequency is learned by playing.
   - The night scene and the isometric map look good.
   - The headless harness already exists and becomes the par engine.

### 3.4 What the owner experienced

v2 was "too stressful and confusing". Findings 1, 2 and 5 are the measured causes:
- actions faster than a human can make them;
- losses the player could not have prevented;
- a climax with nothing to do.

### 3.5 Defects in today's build

Line numbers refer to today's `index.html`. IDs are stable and never reused.

| ID | Defect | Where | Evidence | Fixed by |
|---|---|---|---|---|
| X-1 | STOP deletes a unit's output instantly | L1257, L460 | Seed 3, STOP coal at 04:10 → 48.48 Hz, black at 04:15 (balance §5) | H-1, K-3 |
| X-2 | An overheating unit's trip hits a random unit | L469, L372–375 | 69% hit the wrong unit, n=177 (edu M8) | H-2 |
| X-3 | A tripped machine keeps its inertia | L470 | Readout 3,946 before and after (§3.2) | H-3 |
| X-4 | Two reserve definitions | L1311–1312 vs L521–523, L545 | Disagree on 29.6% of ticks (edu M6) | H-4 |
| X-5 | Import flow left out of the margin, so imports raise the price | L523 | Seed 12, 13:00: import 0→800 MW moves the price $117→$308 | H-5, P-5 |
| X-6 | Evening price pinned at the curve ceiling of $7,796; the ">$1,000 siren" is always on | L434, L1310 | Non-heat evenings, 17–21 h median $7,796 (balance §4) | P-5–P-8, P-11 |
| X-7 | The score pays like a generator | L527 | Lean reserve +18%; commit-all −$4.9M revenue; R²=0.976 (balance §4, spec E3) | S-1–S-3 |
| X-8 | CO₂ tip fires on every run and is false | L596 | 30/30 and 100/100 runs (edu M4, balance §4) | H-13 |
| X-9 | UFLS at 49.2 Hz in three shallow stages | L501–503, L511; text L255, L1383, L1466 | Real first stage is 49.0 Hz | H-6 |
| X-10 | Black at ≤48.5 Hz within 0.2 s | L562–563 | Real extreme limit is 47 Hz; Queensland survived 48.53 Hz in 2021 | H-7 |
| X-11 | No governor or battery lag, so inertia never changes the nadir | L491–496, L516–518 | 49.775–49.783 Hz across 48× inertia (desk E1) | H-8 |
| X-12 | Inertia number has no real unit | L516, L175, L546 | `syncM/6+250`, labelled "MW·s/Hz"; LOW INERTIA never fired in 216k ticks | H-8, K-11 |
| X-13 | Battery standing-charge trap | L483; advice at L342 | Traps 65% of trips; clearing it moves median time to shedding 14 s → 30 s (pacing §2) | H-10, K-5 |
| X-14 | Battery deadband ±0.10 Hz and 0.56% droop | L495–496 | Real ±0.015 Hz and about 1.7% (AEMO 2025) | H-8 |
| X-15 | Governor droop 5.7% with zero delay | L491 | Real ≤5%, with seconds of lag | H-8 |
| X-16 | Price cap stale; one number serves as both price cap and outage cost | L287, L433, L535; text L224, L256 | $16,600 was FY2023-24; the cap is $23,200 from 1 Jul 2026 | H-12 |
| X-17 | Price floor +$35, so no negative prices | L434 | Real floor −$1,000; negative prices in 31% of NEM intervals in Q4 2025 | P-8, P-9 |
| X-18 | No rooftop PV and no belly; minimum generation never binds | L283–285, L429–431, L369 | Trough 3,800 MW vs 1,300 MW of minimums; curtailment 2 MWh/shift | P-1–P-4 |
| X-19 | Hidden UFLS restore rule | L505–508; manual L255 omits it | 23% of unserved energy lands while f ≥ 49.95 Hz (fun §2) | H-6, K-13, H-16 |
| X-20 | Penalised every tick outside the band, yet sitting at 49.3 Hz is cheap | L537, L219 | 7.0 sim-min per shift below 49.5 Hz; longest spell 50 min (balance §5) | H-11 |
| X-21 | Trip log reports capacity, not output lost | L378–379 | Logs "650 MW" when 500 MW is removed | H-9 |
| X-22 | Heatwaves on half of all days | L338 | 53/100 seeds; seed explains 84% of variance | S-10, D-8 |
| X-23 | Weather follows a fixed script | L339–346, L368 | Heat always 13:30, storm 16:40, duck reminder 17:15, which is after the last moment it can be acted on | D-8 |
| X-24 | Contingencies pile up and warnings are uneven | L331–369 | 74/100 seeds have two <30 s apart; cloud-front warning 10 s | D-8 |
| X-25 | One shared `Math.random` stream | Sim: `gauss()` L274–275 (drawn every tick at L444–446 and L518), `R=Math.random` L332, L375, L378, L382, L389, L469; rendering L707, L971, L985, L999, L1117, L1187–1189 | Diverges on 49/50 seeds | F-3 |
| X-26 | Sim and render share a 10 fps timer | L568, L1520 | Whole game renders at 10 fps (v3 G-a) | F-5 |
| X-27 | The largest trip can take out the whole 950 MW hydro station | L294, L372 | Real largest credible contingency is 700–800 MW | F-13 |
| X-28 | Smelter trip of 600 MW, with a real company name | L360 | Real Boyne Island potline 2 tripped at 256 MW (2021) | F-13, H-15 |
| X-29 | Real brand names | MERIDIAN ISO L170, L213, L599; MERIDIAN CITY L730, L1289; SNOWY L294, L465–467, L725; BOM L340 | Collide with Meridian Energy, Snowy Hydro and the Bureau of Meteorology | H-15 |
| X-30 | Alarm noise | L397, L557 | 60 beeps and 51 tile edges per shift; flapping supplies 42.5 of the edges (desk E8) | H-16, K-8 |
| X-31 | Peaker minimum output 12% | L292–293 | Reference open-cycle gas turbine minimum is 50% (Aurecon 2021) | F-13 |
| X-32 | Emergency tools are cheap | L476 (diesel $2,600), L534 (DR $1,400) | Real emergency reserve activation cost $16,000/MWh (NSW, Nov 2024) | F-13, §9 Q-2 |
| X-33 | Near-binary grade ladder | L576–584 | A needs <20 MWh unserved and B <100 MWh; most single sheds cost ≥130 MWh (synthesis), though a B with 92 MWh exists (critique #7); S15 A3 B0 C2 D36 F4 (fun §2) | S-5 |
| X-34 | Dead air after the grade is settled | whole shift | Grade at 21:00 = final grade in 95/100; the last 4 real min are 33% of the session | D-2, D-11 |
| X-35 | "Hz" caption clipped (v3 D-1) | `#cvG` | Canvas 138 px, caption baseline 139.2 px | K-11 (gauge replaced) |
| X-36 | Frequency trace labelled "3 H" shows 6 h (v3 D-2) | trace panel | 1,800 samples × 0.2 sim-min | K-11, D-23 |
| X-37 | Map blitted at a non-integer scale (v3 D-5) | map canvas | Scale 1.373 at 769×523 | G-1 |
| X-38 | Coal station overhangs the terrain (v3 D-4) | `BLD` geometry | Visible off the slab | G-1 |

### 3.6 The v4 core at the end of Phase 0.2

§3.1–3.5 measure the legacy build. The v4 core (`sim/`, `v4-core-0.2.2`, after the review-fix pass) is measured by `node tools/baseline-v4.js`; its committed output is `tools/baseline-v4.golden.md`, and §6 quotes it row by row. In short, on the classic scenario with v4 physics and no rooftop PV yet:
- The physics defects X-1, X-2, X-3, X-4, X-5, X-9, X-10, X-11 and X-25 are gone in the core: the one-tick STOP step is the 5% breaker level, 104 of 104 overheat trips hit the hot unit, inertia falls by the tripped machine's H·S, the gauge and the alarm never disagree, importing never raises the energy price (at the evening peak the P-7 adder can rise when the tie becomes L; labelled, H-5), UFLS starts at 49.0 Hz, collapse is graded, inertia sets the nadir, and the weather is the same whatever the play.
- Par (S-4) sheds nothing on 181 of 200 raw seeds and 75 of 100 forced-heat seeds, and arms the diesel on 47 of 200 (S-12). 6,856 of 6,856 SECURE states hold 49.5 Hz when L trips (H-8).
- Still open: H-4's SECURE previews only the largest contingency by MW, and from SECURE states losing the other credible one (a unit of nearly the tie's MW) misses 49.5 Hz in 28 of 4,904 (H-8, owner decision); par's free re-plan after each action and the Live Stack's lack of one (S-4, owner decision for Phase 1a); S-2's correlation, which misses ±0.15 for some proxy sets (S-2, owner decision on the set); a par day takes 1.56 s (median, max 1.78 s) against D-9's 1.6 s; the battery's average charge price is $203/MWh against P-10's $100 (Phase 3); 68 of 100 classic days have two unwarned contingencies < 60 real s apart (the D-8 director, Phase 2); hydro spins free (labelled, §8.2). Two items that stood here are closed by Phase 2a, below: the H-7 midday case going black with no battery, and wind and solar giving no primary response.

**The core after Phase 2a** (`v4-core-2a.1`, 2026-10-03; the sim, par, the view and the objective line merged). The core now has a belly:
- **What is new.** Rooftop PV (5,000 MW on the game's day), MILD, HOT and HEATWAVE days and weekends (P-1–P-3); MSL notices (P-4); a dispatch that spills surplus wind and solar automatically, so the midday price goes negative (P-9); wind, utility solar and rooftop inverters that back off on over-frequency (H-8); UFLS blocks and restores on net load, with unserved energy counted as the dark customers' own load (P-12, S-1); par's belly rules (S-14 rules 2–4).
- **Two scenarios for the game's day,** `desk` and `desk-weekend`, measured with `node tools/par.js --scenario …`. Par sheds nothing on 192 of 200 `desk` seeds and 197 of 200 `desk-weekend` seeds, 86 and 98 of 100 forced-heat seeds, and arms the diesel on 13 and 1 of 200; nothing goes black (S-12).
- **Classic is the regression anchor.** It keeps no rooftop PV, so every new term is exactly zero there, and `tools/baseline-v4.js` still measures it: par sheds nothing on 183 of 200 raw seeds and 77 of 100 forced-heat seeds and arms the diesel on 44 of 200. X-18 (no rooftop PV, no belly) is gone on the game's day.
- **Closed from the list above.** The H-7 midday case no longer goes black with no battery (peak 51.08 Hz; §9.2 risk 10). Wind and solar respond to over-frequency. Phase 1a had already closed two more: SECURE previews both credible contingencies (§9.1 Q-7), and the desk has par's re-plan (Q-6).
- **Still open after 2a.** Negative prices on mild weekdays last a median 1.68 h against P-9's 2–6 h. One SECURE state in 6,471 on `desk` and two in 6,438 on `desk-weekend` miss 49.5 Hz, each SECURE only on a cached preview (S-12). The battery's average charge price on classic is $198/MWh against P-10's $100 (Phase 3). A par day takes 1.79 s on `desk` against D-9's 1.6 s. UFLS still over-sheds at a sunny noon, though it no longer collapses (H-7). The lean and competent proxies have not been run on the game's day. S-2's correlation, the D-8 director and free-spinning hydro stand as above.

---

## 4. The game on one page

### 4.1 A stranger's first daily, minute by minute

Times are real time on a first shift with coaching on. The arithmetic is from the D-2 clock, with each introduction pausing for the O-3 maximum of 8 s; it is not yet measured. Frequency and MW figures are prototype values from the desk lab's evening (nadir 49.60 Hz) and morning traces, made with the legacy battery settings (§4.6); they will change under H-8. A returning player reaches SHARE about a minute sooner (D-2), because the introductions don't play and the watch is compact.

Dispatch inputs in this script: 6 on the desk (SYNC, RESTORE, GT·A lever twice, hydro wheel, GT·A START), 2 on the Live Stack and 2 on the map, so 60% are on the desk (K-1 asks for ≥50%).

| Real time | Grid time | What happens |
|---|---|---|
| 0:00 | 04:30 | The shared link opens on the live map at night. City windows are lit and a quiet 100 Hz hum sits steady. The first click anywhere starts the audio. |
| 0:05 | — | **Briefing card** (≤60 words). A 24-h forecast skyline shows demand, the bite rooftop solar takes out of midday, and the evening climb. The goal line: *"Line up enough power before the city needs it; the machines handle the seconds."* "Watch for: tie-line limited to 500 MW until 11:00." One line from Marg. The one button is **TAKE THE DESK**. |
| 0:20 | 04:30 (paused) | Marg points out the frequency dial, the hum and the AGC lamp. The clock is paused for 8 s. Most of the desk sits under cover plates whose lamps read "AUTO — Marg" (O-3). |
| 0:28 | 04:30→06:00 | Pre-dawn cruises at 540×. The stack already holds the pre-dispatch plan (L-0). Coal and one gas unit hum along; AGC trims them. |
| 0:38 | 06:00 | **First real action: SYNC** (introduction 1 of 5). The second Riverton gas unit reaches full speed and its synchroscope appears. Time drops to 1×. The needle sweeps; you trim the speed with `]` and pull the breaker just before 12 o'clock. *Clack.* The unit takes a small block of load and starts loading toward its minimum. |
| 0:46 | 06:00→07:00 | Morning ramp at 270×. Levers glide by themselves along the plan. |
| 0:59 | 07:00 | **RESTORE** (introduction 2). An overnight storm left two Saltbush Bay districts dark, and the network reports the feeders repaired (D-8). When the permissive lamp lights, you close the first feeder at 1× and watch the needle dip and recover, then close the second 5 grid-minutes later. The districts relight on the map. |
| 1:14 | 07:00→07:30 | The ramp resumes at 270×. |
| 1:20 | 07:30 | **The Live Stack** (introduction 3). Red columns show a gap at 08:00–08:30, where demand has drifted above the pre-dispatch plan. Marg hands over the GT levers. GT·A's layer glows because it can arrive in time; you push GT·A's lever to 300 MW, and the stack draws its start and ramp landing by 07:45, ahead of the red. |
| 1:28 | 07:30→09:00 | The red columns turn solid. |
| 1:48 | 09:00→14:30 | **The belly** (480×, then 300× from 11:00). Rooftop solar floods in, operational demand sinks toward 2,400 MW and the price goes negative. At 09:15 you pull GT·A's lever to zero, and the stack shows it unloading and stopping once its one-hour minimum run is up. Marg, on the covered controls, eases coal to minimum and sets the battery charging. At 09:30 a weather-bureau card warns of a cloud front at 12:10. At 10:00 Marg opens the suburb card (introduction 4): you click Solstice Rise and schedule a **hot-water soak**. At 12:10 the front crosses, the suburbs' panels dim, and demand "appears from nowhere". |
| 2:53 | 14:30→16:30 | **The neck** (240×). Marg hands over the hydro gate wheel (introduction 5). The Live Stack now reaches 19:00 and shows the evening climb. You drag GT·B to arrive by 17:00 and GT·C by 17:30, keep GT·A as the spare for N-1, pre-cool Redgum Flats from the suburb card, and turn the gate wheel so the water lasts until 20:40. |
| 3:31 | 16:30→18:40 | **The peak** (150×). At 17:00 your plan comes together: the levers rise together, the stack columns turn solid, and the annunciator stays dark. |
| 4:23 | 18:40:00 | **Trip.** The largest machine online by output, a Mt Hazel coal unit, drops 650 MW. The desk locks, a vignette falls, and the clock becomes a stopwatch: `T+0.00 s ×0.15`. |
| 4:23–4:52 | 18:40:00–18:40:30 | **The watch** (full version, first time only). (1) Inertia takes the hit, the needle drops and the hum sags. (2) The battery's GUARD fires within a fraction of a second (on a first shift Marg set it before the peak; the label reads "YOUR GUARD" once the player owns the ring). (3) The governors creep up, and the nadir pin lands at **49.60 Hz, 0.60 Hz above UFLS**. (4) No relays operate. (5) Frequency settles below 50 Hz. Marg: *"Governors stop the fall. Restoring fifty is AGC's job, and yours."* |
| 4:52 | 18:40:30 (held) | **Respond card** (no buttons, K-16). "Contained within 49.5–50.5 ✓. Caught by: inertia → battery 498 MW → governors 346 MW. N-1 INSECURE: 610 MW short, 30:00." GT·A's START guard lights. You press Enter, lift the guard and press START; the desk unlocks with a chime. |
| 5:00 | 18:40:30→20:00 | RESPOND runs at 30× until frequency is back in the normal band (at most 5 grid-minutes, ≤10 real s), then at 150×. GT·A syncs, and the N-1 gauge returns to SECURE before the 30-minute countdown ends. The peak passes. A "clean ramp" chime plays. |
| 5:32–5:40 | 20:00→04:00 | Release (12 s), then the night roll (12 s). City windows go dark one by one while the scorecard counts up. |
| 5:56–6:04 | — | **Verdict and debrief** (≤45 s). Marks against par, "the moment" (the 18:40 trip), one "what if", a "this really happened" card, then SHARE at about 6:45. The day's concept cards (O-4) wait after SHARE. |

### 4.2 Layout at the 1280×600 floor

Half and half: the map on top, the desk on the bottom (K-17). The desk takes max(300 px, half the viewport height below the header), and the map takes the rest. This is the smallest supported viewport (C-9); a 1366×768 laptop leaves about 1366×625.

```
+------------------------------------------------------------------------------------------+
| GRIDWATCH  18:42 >150x | LIGHTS ON 100% | COST 8.4 c/kWh | CO2 0.61 t/MWh | PAUSE  ?     |  32
+------------------------------------------------------------------------------------------+
|                                                                                          |
|   MAP 1280x268: plants, six suburbs, rooftop glint, cloud shadows and weather.           | 268
|   Dark districts after a shed. Labels only on hover, focus or alarm.                     |
+-------------+--------------------------------+---------------------+---------------------+
| FREQ DIAL   | COAL CCGT GT-A GT-B GT-C       | LIVE STACK      [L] | ANNUNCIATOR 4x3     |
| 232x140     |  ||   ||   ||   ||   ||        | now-30 min..+4.5 h  | 256x96              |
| 49.962 Hz   |  ||   ||   ||   ||   ||        | 336x164             | [ACK] [SILENCE]     |
+-------------+  ||   ||   ||   ||   ||        +---------------------+---------------------+
| IMBALANCE   | HYD (o)  BAT (o)  TIE (o)      | PROCEDURE BAY       | MESSAGE TRAY        |
| SPARE IN 5  | lamps + MW readouts, guarded   | 336x128: SYNC scope | 256x108             |
| MIN / RISK  | START/STOP, AGC/HAND key       | or RESTORE breakers +---------------------+
| [T] PREVIEW |                                |                     | DR (o)(o)(.) DIESEL |
+-------------+--------------------------------+---------------------+---------------------+ 300
      232                   424                          336                  256   (+4x8 gutters)
```

At 336×164 the Live Stack has 5.6-px columns and about 55 MW per pixel, too coarse to drag precisely. **L** (or the [L] corner button) expands it over the map to about 1248×420 (21 px per column, about 21 MW per pixel) while the clock keeps running (L-4).

At a 1280×720 viewport, the desk and the map are 344 px each. At a 1920×1080 viewport:
- The header is 40 px, and the map and the desk are 520 px each.
- The desk adds a 3-minute frequency trace under the dial.
- Levers are 72 px wide with 300 px of travel.
- The Live Stack is 560×300 and the procedure bay 560×190.

### 4.3 The desk controls

| Control | What it does | Keys | Req |
|---|---|---|---|
| Unit levers (COAL, CCGT, GT·A, GT·B, GT·C) | Motorised faders. The handle is the planned MW; moving it writes the plan (L-6). Behind it: the output needle, the AGC band and a 10-minute ramp cone. A spring gate at 96% shows that unit's trip risk. Multi-machine stations show one lamp per machine. | 1–5, ↑↓, PgUp/PgDn | K-1 |
| START / STOP guards | Lift the guard, then press. STOP unloads the unit to its minimum, then down a shutdown ramp to ≤5% of rating, before the breaker opens. | S S / X X | K-3, H-1 |
| AGC/HAND key | AGC trims every unit inside its band. HAND (chosen at the briefing) turns AGC off. | — | K-2, D-7 |
| Hydro gate wheel | Sets hydro MW. The rim shows the reservoir and "water lasts until HH:MM". | 6, ←/→ | K-4 |
| Battery dial | CHARGE / IDLE / DISCHARGE plus magnitude, and an outer **GUARD ring** (0–500 MW) holding MW back to catch trips. Turning it moves the trip-preview needle live. | 7 | K-5 |
| Tie knob | DC interconnector flow, −800 to +800 MW. | 8 | K-6 |
| Diesel key, DR button | Emergency reserve ("break glass": a key under a red cover, $16,000/MWh, 20-min lead) and industrial demand response. Both need a hold, never a tap. | E (hold), D (hold) | K-7 |
| Annunciator | Alarm tiles with ACK and SILENCE. Click a tile to jump to its control. | A, Shift+A | K-8 |
| Message tray | At most 3 cards, each with one button that focuses a control and never dispatches. | M | K-9 |
| N-1 gauge + TRIP PREVIEW | "SPARE IN 5 MIN" against "BIGGEST RISK" (R5 against L). A ghost needle shows where frequency would bottom out. | T | K-10 |
| Frequency dial + imbalance bar | Hz, rate of change (RoCoF) and stored spin (inertia, in GW·s). The bar shows what is "borrowed" from automatic response. | — | K-11 |
| Procedure bay | Synchroscope (SYNC) or feeder breakers (RESTORE). | [ ] C U, R | K-12, K-13 |

### 4.4 The Live Stack

A desk screen. It shows the next 4.5 hours as a skyline of forecast demand, with each generator a coloured layer you can drag.

```
  MW   LIVE STACK   now 15:30 ......................................... +4.5 h (20:00)
 8000 |                                      .....P90.....
      |                               ______/ RR  RR    \____    <- skyline: forecast demand (P50)
 6000 |                       _______/                      \     R = red: plan short of P50
      |              ________/ GT-C ghost (earliest sync 15:38)   amber = short of P90
 4000 |   GT-B ramp: drag edge -> 800 MW by 17:30 ===========     blue (midday) = must-run
      |   HYDRO ============================ water lasts 20:40         exceeds demand
 2000 |   CCGT ===================================================
      |   COAL (4 machines) =======================================
    0 +---------|-----------|-----------|-----------|-----------
        15:30 (now)   16:30       17:30       18:30       19:30  20:00
```

- The levers on the desk are the layers' "now" edges. Moving a lever writes that unit's next "arrive-by" keyframe, at the earliest time its ramp allows (L-6).
- A drag makes an "arrive-by" keyframe at a chosen time, drawn as a ramp no steeper than the unit can move.
- The stack starts each day pre-filled with the pre-dispatch plan (L-0).
- A unit that is off appears as a ghost that cannot begin before now + its start time.
- A trip tears its layer out live, and a red gap opens.

There is no planning phase and no RUN button (§7).

### 4.5 The city

Six suburbs on the map, each with a personality and a patience meter (U-1):

| Suburb | Personality |
|---|---|
| Solstice Rise | Solar-obsessed outer estate |
| Old Hazelton | On off-peak hot water since 1962 |
| Redgum Flats | Air-con as a human right |
| Harbourside | CBD towers |
| Tallowood Heights | Pools and Powerwalls |
| Saltbush Bay | Retirees who ring talkback |

Clicking a suburb opens a card. Its levers:
- **Hot-water soak** (noon) and **hold** (evening).
- **EV delay.**
- **Air-con cycling**, with pre-cooling.
- **VPP** (virtual power plant): home batteries dispatched together.
- The **rooftop-solar emergency backstop**, locked until a minimum-demand emergency.

Each lever shows its MW, its energy, its cost to customers and its *rebound*: the load that comes back later. Flex aimed at the wrong hour is worthless, because its rebound lands on the real peak (livestack Table B). At most 3 lever types are offered on any day.

### 4.6 The trip moment

Prototype traces (desk E6: morning fleet, battery on, −650 MW trip), from `v4-desk/phys.js` with the **legacy battery** (±0.10 Hz deadband, ~0.56% droop, i.e. X-14), load relief 1.1% per 1%, a 0.2-s UFLS delay and governor caps of 8–20%. Every number here, and those quoted from it in §4.1 (498/346 MW, 49.60 Hz), in H-8 (49.33→49.58 Hz) and in K-13 (49.73 Hz), is to be re-measured under H-8.

A quick re-run of the same cases with H-8 values (battery ±0.015 Hz and full output 0.85 Hz beyond it, load relief 0.5%, UFLS delay 0.3 s, governor cap 12%; `v4-desk/exp_h8.js`, 2026-09-30) gives a morning nadir of 49.23 Hz (not 49.53) and an evening nadir of 49.34 Hz (not 49.60). The battery gives about 256 MW at 49.55 Hz, not 498. Both nadirs are outside the 49.5 Hz containment band, which is why H-4's SECURE now also needs the TRIP PREVIEW. The fix decided in §9 Q-1 is the player's GUARD ring (K-5): battery MW held back as contingency FFR, delivered in full within 1 s.

| Physical time | Frequency | What is catching it | Playback speed | Beat |
|---|---|---|---|---|
| T+0.3 s | 49.75 Hz | inertia 577 MW, battery 38 MW | 0.15× | 1 — Inertia: needle drops, RoCoF lights, rotors on the map slow |
| T+1.0 s | 49.55 Hz | battery 498 MW | 0.15× | 2 — Battery: dial swings to DISCHARGE |
| T+1.5 s | **49.53 Hz (nadir)** | battery + first governor response | 0.15× | 3 — Governors: needles creep up; nadir pin shows "0.53 Hz above UFLS" |
| T+10 s | 49.75 Hz | governors 346 MW, battery 270 MW | 1× | (4 — UFLS: only below 49.0 Hz; districts go dark with a clack) |
| T+30 s | 49.76 Hz | droop holds frequency below 50 | 10× | 5 — Settle: "Restoring fifty is AGC's job, and yours." |

The same engine drives:
- the live grid;
- the TRIP PREVIEW ghost needle (K-10);
- restore previews (K-13);
- par (S-4).

In the same state, the preview therefore matches the watch within ±0.02 Hz.

### 4.7 Debrief and share card

The verdict screen shows, in order (D-25):
1. The letter grade and three marks against par (D-20).
2. "The moment" (D-21).
3. One counterfactual, such as "Sync GT·B at 16:40 → no shedding (−380 MWh)" (D-22).
4. A "this really happened" card (D-24).
5. SHARE.

The text share card (Y-4) contains no event names and no clock times. A mark shows how far each result is from par; ★ means at par or better.

```
GRIDWATCH #214 · Wed 30 Sep · A
████▇██▄████  low 49.60 Hz
Lights ★ PAR     0 MWh dark
Cost   ★  -4%  8.1 c/kWh
CO2       +2%  0.62 t/MWh
"Nobody noticed. That's the job."
databerryau.github.io/gridwatch
```

The sparkline has 12 blocks of 2 hours each, starting at 04:00. Each block is the worst deviation from 50 Hz in its window (full block = within ±0.05 Hz; ▁ = below the UFLS line). In the example, the ▄ block is the 18:00–20:00 window.

---

## 5. Requirements by phase

Every phase ships something playable, and the live game works after every step.

**IDs are stable.** When a draft ID was merged, it stays as a pointer and is never reused.

Prefixes:

| Prefix | Area |
|---|---|
| F | Foundations |
| H | Honesty |
| P | Prices (P-5–P-11) and rooftop PV (P-1–P-4, P-12) |
| S | Scoring and par |
| K | Desk |
| L | Live Stack |
| G | Map |
| D | Day and debrief |
| O | Onboarding |
| U | City flexibility |
| Y | Daily |
| W | Week |

C- (constraints) and X- (defects) are used only in §2 and §3.

| Phase | Ships as | Items | Size | Migration step | Gate |
|---|---|---|---|---|---|
| 0.1 | The live `index.html` with the critique's one-line honesty fixes, made in place | 12 | S | M1 | Baseline re-recorded |
| 0.2 | The static site layout (F-1) and the v4 sim core under `sim/`, headless, with AGC, plus a bare `next.html` bench page | 25 | XL | M4 begins | Par works headless |
| 1a | `next.html` greybox: a full day with the core desk, the Live Stack, the watch and the map at a flat 120× | 32 (3 partial) | L | M4 | **Greybox check** (2 new people) |
| 1b | Desk polish: annunciator details, full foley, alarm hierarchy, accessibility, map art | 9 (3 finish 1a items) | M | M4 | None; may land after gate 1 |
| 2 | `next.html`: the 5-minute day on gate-passed seeds, with rooftop PV, the belly, the first two city levers, onboarding and debrief. Delivered in five slices: 2a the belly, 2b the city levers, 2c the day, 2d grade and debrief, 2e briefing and onboarding (see Phase 2). 2a is built on `next.html` (2026-10-03) | 38 | XL | M4 | **Playtest gate 1** (after 2e) |
| 3 | `next.html`: the rest of the city (VPP, hold, EV delay, backstop, heat-health guard, map life) | 4 + 4 levers | M | M4 | Re-tune par |
| 4 | `index.html` switches to the v4 daily, with the counterfactual and replay; `classic.html` keeps v2 for one release | 14 (Y-6 deferred) | M | M5 | **Playtest gate 2** |
| 5 | Week mode | 6 | L | M6 | — |

**Size** is a rough effort estimate for part-time owner-plus-AI work, to be re-estimated at each phase exit: S = days, M = 1–2 weeks, L = 2–4 weeks, XL = more than a month. "Items" counts requirement IDs.

The M steps are the tech lab's migration steps (F.5): M1 hygiene inside `index.html`, M4 v4 core on `next.html`, M5 switch, M6 week. M2 (extract the legacy file without changing behaviour) and M3 (a new loop for it) are dropped: refactoring code that will be retired is waste, so the legacy file is frozen after 0.1 and becomes `classic.html` at M5.

**Cut list.** If a phase runs long, cut in this order. None of these is needed by a gate:
1. Y-6 PNG card.
2. D-23 replay scrub.
3. D-22 counterfactual (the debrief keeps "the moment", D-21).
4. G-4 weather art beyond a tint.
5. U-8 map life.
6. K-20 foley beyond the hum and the breaker clack.
7. P-10 battery P&L display.
8. Y-9 seasons (fall back to the labelled late-summer day).
9. Week mode (Phase 5).

Never cut: H-8 (one physics engine), K-15/K-16 (watch, then respond), S-4 and D-9 (par and solvable days), K-12/K-13 (SYNC and RESTORE), L-0–L-6 (pre-dispatch, levers and stack), and the P-1–P-4 belly.

Recommended but not a gate: before Phase 0.1, hold one think-aloud session on today's build (critique #3). It costs an afternoon and gives a "before" for the stress and confusion ratings in the gates.

---

### Phase 0 — Foundations & honesty

#### 0.1 — The live game, made honest

These are the critique's one-line honesty fixes (critique #2), made in place inside today's `index.html`. The legacy file is not split, re-streamed or re-looped: it is frozen after 0.1 and becomes `classic.html` at F-14. Each item is measured by `tools/baseline.js` against the legacy sim.

**F-10 — Tests.** `node --test` (Node ≥20) runs `tests/*.test.js`.

*Accept:* at each phase exit, the suites cover every requirement shipped so far (at 0.1: the baseline golden diff and the charset check; from 0.2: F-2, F-3, F-4, F-6 and the H-8 physics sanity checks, i.e. UFLS stage 1 at 49.0 Hz and the reference contingency's nadir and RoCoF inside the H-8 bands; F-7 and F-8 from Phase 4); the whole run takes <60 s; a GitHub Action runs it on push and only reports (deployment is unchanged).

**F-12 — Honest measurement.** `tools/baseline.js` has a committed golden output, `tools/baseline.golden.md`.

*Accept:* after every pure-refactor commit, the diff against the golden output is empty, excluding the machine-dependent timing lines; an intentional behaviour change re-records the golden file in the same commit, with a one-line reason.

**H-1 — STOP ramps a unit down.**
- STOP sets `stopping`: output falls at the unit's ramp rate to its minimum, then follows a time-limited shutdown ramp to ≤5% of rating before the breaker opens and the unit spins down. (In the NEM's fast-start inflexibility profile this last stage is T4, minimum to zero.) Opening the breaker at minimum would drop 950 MW at once from the legacy coal station.
- The stop can be aborted while unloading.
- Minimum up/down times apply from S-11 onwards.
- A stopping unit counts only its present output toward capacity and offers no headroom (reserve, price, restore permissive), so the stop shows in the numbers as it happens rather than all at once at the breaker.

*Accept:* on seed 3 with STOP on coal at 04:10: (a) no single tick removes more than 5% of the unit's rating plus one tick of ramp, which also rules out opening the breaker at minimum (about 950 MW at once); (b) with the `competent` proxy responding, no UFLS and no blackout through 08:00; (c) with nobody responding, the first UFLS stage comes ≥60 sim-min after the STOP. Today, with nobody responding: UFLS at 04:12 and black at 04:15; after 0.1: first UFLS at 05:40.

**H-2 — A hot unit trips itself, and the risk is visible.**
- L469 passes the hot unit instead of calling `tripUnit(false)`.
- A multi-machine station loses one machine, not the whole station.
- Above 96% loading the unit shows "trip risk ≈3.5% per grid-hour" (0.00012 per 0.2-sim-min tick today; that is ≈7% per real minute only at 120×).

*Accept:* 100% of overheat trips hit the hot unit (n ≥ 100), and the log names it.

**H-3 — A tripped machine stops counting toward inertia.** Inertia uses `cap × availF × H` (L470).

*Accept:* after a coal machine trips, inertia falls by 25% of coal's contribution within one tick.

**H-5 — Imports count as supply.**
- Legacy: count the tie flow in `availCap` (L523).
- v4: P-5 subtracts scheduled tie flow from market demand, so importing never raises the energy price.
- The P-7 adder reads R5 / L, and an import uses the tie's 5-minute headroom and can make the tie the largest risk (L). At the evening peak a large import can therefore raise the adder, as an interconnector that is the largest risk raises the contingency FCAS it needs in the NEM. This is labelled in §8.2 ("Cost-based offers; scarcity adder"), not removed: the security cost is real.

*Accept:* on seed 12 at 13:00, stepping import 0 → 400 → 800 MW never raises the price (critique #4 measured the legacy effect: the median evening price falls from $7,796 to $792, with grades unchanged); at the evening peak (seed 12, 18:30) the energy price (without the adder) never rises. *Measured (review-fix pass, `tools/baseline-v4.js`):* 13:00: $146 → $146 → $74; 18:30: energy $174 → $174 → $156, with the adder $174 → $174 → $220 (R5/L 2.35 → 1.20 as the tie becomes L). The review's sweep of seeds 1–20 at 18:00–20:00 found higher import raising the adder in 34 of 67 probes; the energy component never rose.

**H-9 — The trip log reports the true MW lost** (`out × frac`, not `cap × frac`, L379).

*Accept:* the logged MW equals the output removed, ±1 MW.

**H-10 — No battery standing-charge trap.**
- Under-frequency outside the normal band suspends scheduled charging.
- A charge order on a full battery shows "CHARGE ORDER — paused (full)" and never silently re-engages.
- Remove the heatwave advice to "bank solar into the battery" (L342).

*Accept:* the nadir with a standing charge order equals the nadir with an idle battery (rules lab: 49.03 Hz with the trap, 49.66 Hz fixed).

**H-13 — Retire the false CO₂ tip** (L596). From Phase 2, debrief tips come only from the day's own events (D-21; D-22 from Phase 4).

*Accept:* the string is gone; no debrief text asserts a saving that the sim did not compute.

**H-15 — Fictional names.** Rename:
- MERIDIAN ISO and MERIDIAN CITY (X-29) → the region is "REGION S1".
- SNOWY GORGE HYDRO → a fictional gorge name.
- ALCOA → "the smelter".
- BOM → "the weather bureau".

Plant and suburb names must not collide with each other either (the CCGT keeps "Riverton", so the suburb becomes "Redgum Flats").

*Accept:* `grep -i` over served files finds none of MERIDIAN, ALCOA, SNOWY, BOM; each new name has been checked against ABN Lookup and a place-name gazetteer (manual check, logged in the PR).

**H-16 — Say what the legacy build does.**
- The manual states the hidden restore rule (≥49.95 Hz and >400 MW spare for 15 sim-min, L505–508).
- Each annunciator tile beeps at most once per 30 s. As built: tiles sound by priority, with only red (critical) tiles audible and amber tiles lighting silently, as K-8 intends for v4. A red tile sounds once per episode, after a 2-s on-delay (the standard cure for chattering alarms: UNDER FREQ used to light 25 times a shift for a median of 0.1 s). If it is inside its tile's 30-s window, it sounds when the window ends. Warnings still sound through the event log.

*Accept:* the manual contains the rule; the desk-lab bot acting every 5 s triggers ≤20 audible alarms per 12-minute shift (today 60; desk E8).

**S-10 — Heatwaves on 15% of days** (today `w<.5`, L338). Severity stays at +6.5% demand and −7% thermal capacity. Critique #8: halving the severity would teach that heatwaves are mild.

*Accept:* over seeds 1–2,000, the heat share is 15 ± 2%.

#### 0.2 — The v4 core (headless `sim/`, bench page `next.html`)

`next.html` is a bench, not the game: a strip chart plus one plain slider per unit. It lets the owner feel the new physics. AGC (K-2's bands and trim logic) lives in `sim/` from 0.2: governor lag without AGC makes the grid oscillate for anyone who acts slowly (critique #5), and par needs AGC.

**F-1 — Static multi-file site** (moved from 0.1).
The repo root holds:
- `index.html` and `next.html`;
- `app/` (boot, loop, director, input, persist, share);
- `sim/` (pure: rng, params, fleet, weather, events, grid, physics, step, autopilot);
- `render/`, `desk/`, `audio/`;
- `content/` (scenarios, dailies, text, as JS modules);
- `tests/`, `tools/`;
- `package.json` (`{"type":"module","private":true}`, no dependencies);
- `.nojekyll`, so Pages serves files untouched.

All paths are relative. Today's `index.html` stays untouched beside them until F-14.

*Accept:* a fresh clone served by `py -m http.server 8642` plays a full day on `next.html`; the browser makes zero requests to other origins; no `npm install` is needed to play or test; `tests/charset.test.js` checks that every `*.html` begins with the charset meta.

**F-3 — Three random streams, external world pre-rolled** (moved from 0.1).
- `ext` (weather regime, demand noise, wind, cloud, PV, contingency schedule) is pre-rolled at state creation. It uses a counter-based integer hash `hash(seed, stream, index)`, and values are quantised.
- `play` (player-dependent outcomes, such as an overheat or an out-of-phase close) uses `hash(seed,'play',tick,unitId)`.
- `fx` (cosmetic) is `Math.random`, allowed only in `render/` and `audio/`.
- Trip targets are rules, not dice: "the largest online machine by output", or "the unit that ran hot".
- The legacy build keeps its shared stream (X-25). The foundations lab found the split there needs about 8 one-line edits, but it is not worth making in a file that is frozen.

*Accept:* on seeds 1–100, the v4 `doNothing` and `competent` proxies and a random-input fuzzer see identical demand, wind, PV and event timelines all day (today they diverge on 49/50 seeds); a lint test finds `Math.random` only under `render/` and `audio/`.

**F-5 — Loop and director** (moved from 0.1).
- Each `requestAnimationFrame` (the browser's per-frame callback) adds `min(frameDt, 0.1 s) × rate` to an accumulator, then runs whole ticks up to a per-frame cap.
- Render interpolates between ticks.
- A hidden tab pauses.
- `draw()` and `ui()` never run inside `step()` (X-26).
- `app/director.js` chooses the rate; the sim never does. Before Phase 2 the rate is a flat 120×. The v4 modes are:

| Mode | Rate (grid seconds per real second) | When |
|---|---|---|
| CRUISE | the D-2 profile, 150×–2,100× (a flat 120× before Phase 2) | normal play |
| FAST | 3 × profile, while F is held | released by any warning or alarm; off during WATCH and RESPOND |
| WATCH | 0.15× → 1× → 10× schedule (K-15) | the first 30 grid-seconds after a contingency; desk locked |
| RESPOND | held on the respond card, then 30× for up to 5 grid-minutes, then profile | after the watch (K-16, D-5) |
| FOCUS | 1× | hand on a synchroscope, or closing a restore breaker |
| PAUSE | 0 | Space; coaching introductions; hidden tab |

*Accept:* 60 fps at 1920×1080 on the owner's laptop; a 60 Hz display and a 144 Hz display reach the same state at the same grid time; a lagging frame slows play and never drops or doubles a tick; the rate is always visible.

**F-2 — Pure, deterministic sim.**
- `createState(seed, scenario)` returns a plain, JSON-serialisable object. It already holds the pre-rolled external timeline.
- `step(state, inputs)` advances one physics tick (20 ms of grid time). Every 50th tick it also runs the 1 s grid update: AGC, ramps, starts, water, prices, city flexibility and scorecard.
- `step` returns event records (log lines, sounds, "contingency started"). The sim never calls render or audio.
- `observe(state)` is the player's view. Render, desk and autopilot read only this.
- `hashState(state)` returns a 32-bit fingerprint.

*Accept:* a lint test finds none of `document`, `window`, `Math.random`, `Date`, `performance`, `localStorage` or `setTimeout` under `sim/`; `node --test` imports `sim/step.js` without a DOM shim; the same seed and input log give an identical `hashState` every sim-hour, on 100 seeds.

**F-4 — One clock, two integrators.** Physics integrates every 20 ms of grid time; the grid update runs every 1 s of grid time.
- There is no quasi-steady shortcut. At the measured 156 ns per tick, even 2,100× costs about 0.3 ms per frame.
- CRUISE hides the seconds-scale wobble on screen (the needle shows a 1-s average above 10×), but the sim still computes it.

*Accept:* **Rate invariance:** one input log played at 0.25×, 1×, 60× and 240× gives an identical `hashState`; after a trip, no unit's output rises faster than its ramp rate per grid second (today: 120 MW in the first 5 real s); halving inertia doubles the initial RoCoF within 1%.

**F-6 — Input log and headless replay.**
- Every action is recorded as `{tick, type, args}`.
- Seed + `SIM_VERSION` + input log reproduce a session exactly.
- This one mechanism powers resume (F-7), counterfactuals (D-22, Phase 4) and bug reports.

*Accept:* a browser session's log replayed headless in Node reproduces its scorecard exactly.

**F-13 — Fleet and scenario as data.**
- `sim/params.js` and `content/scenarios.js` hold every constant. Each carries a source (§8) or the label "simplified".
- Machines are committed individually.
- The AGC bands of K-2 are params too, because AGC runs in the sim from 0.2.
- **Start and stop profile** (the NEM's fast-start inflexibility profile, §8.1). "Hot start" below is T1 + T2: T1 runs from START to full speed, when SYNC becomes possible; T2 loads the unit from a ≤5% block at the breaker close up to MIN. STOP reverses it: ramp to MIN, then a time-limited T4 shutdown ramp to ≤5% before the breaker opens (H-1, K-3). The T1/T2/T4 split per class is in `params.js`, labelled "simplified".
- These are starting values, tuned against par (S-12):

| Plant (fictional) | Machines × MW | Min stable per machine | Ramp | Hot start | Offer $/MWh | No-load $/h | Min up / down | CO₂ t/MWh | Inertia H (s) |
|---|---|---|---|---|---|---|---|---|---|
| Mt Hazel coal | 4 × 650 | 240 (37%) | 3 MW/min per machine (12 per station, today's; 6.5× slower than the Aurecon reference, §8.2) | 120 min | 26 | 3,000 per machine | 8 h / 8 h | 0.95 | 5 |
| Riverton CCGT (combined-cycle gas) | 2 × 650 | 175 | 17.5 MW/min per unit | 45 min | 74 | 3,000 per unit | 4 h / 3 h | 0.42 | 4.5 |
| GT·A (open-cycle gas) | 1 × 500 | 250 (50%) | 160 MW/min | 8 min | 148 | 4,000 | 1 h / 30 min | 0.63 | 3.5 |
| GT·B | 2 × 400 (the largest simple-cycle gas turbines built are about 570–600 MW, so one 800-MW machine would not be real) | 200 per machine (50%) | 160 MW/min per machine | 8 min | 152 | 4,000 per machine | 1 h / 30 min | 0.63 | 3.5 |
| GT·C (new) | 2 × 300 (owner decision D2: two machines, so the largest single risk is unchanged; the S-12 knob, tunable within 1–2 × 150–300 MW) | 150 per machine (50%) | 160 MW/min per machine | 5 min | 156 | 2,400 per machine | 1 h / 30 min | 0.63 | 3.5 |
| Gorge hydro | 3 × 317 | 0 | 130 MW/min station | 3 min | water value, 130 | — | — | 0 | 3.5 |
| Battery (grid-following) | 500 MW / 1,000 MWh | — | full swing in <1 s | — | arbitrage | wear | — | 0 | 0 |
| DC tie | import ≤800; export ≤800 (≤300 during 09:00–16:00, when the neighbour has the same sun) | — | 100 MW/min | — | neighbour price shape (P-6) | — | — | — | 0 |
| Wind / utility solar | 1,200 / 1,400 | — | weather | — | −20 | — | — | 0 | 0 |
| Rooftop PV (Phase 2) | 5,000 behind the meter (P-2) | — | sun, cloud | — | not in market | — | — | 0 | 0 |
| Reserve diesel (RERT) | 300 | — | — | 20 min lead | out of market; $16,000/MWh activation (§9 Q-2, §8.1) | — | — | 0.8 | 0 |
| Industrial DR | 350 MW, 3 calls | — | — | — | 1,400 | — | — | — | — |
| Smelter (load) | 256 MW potline (trip risk) | — | — | — | — | — | — | — | — |

The heatwave derate stays at −7% of thermal capacity. Minimum down times apply after a planned stop only; a unit that trips is held for its protection lockout (90–150 min, §8.2) and may then hot-start (S-11, owner decision D1).

*Accept:* `tests/params.test.js` finds no numeric literal in `sim/` outside `params.js` or `scenarios.js` (allow-list for 0, 1, 2, 50, 60); every param has a `src` or `simplified` field; the largest credible contingency is ≤800 MW on every seed.

**H-4 — One reserve definition, including N-1.**
- **R5** is headroom deliverable within 5 minutes: Σ over online units of min(capacity − output, ramp × 5); plus the battery's min(p − output, SoC × 2), i.e. what it can sustain for 30 minutes; plus the tie's min(limit − flow, ramp × 5).
- **L** is the largest credible contingency: the output of the largest online machine (a coal machine, a CCGT unit, a GT machine or a hydro machine), or the tie import.
- Security states follow AEMO's lack-of-reserve (LOR) levels, simplified (§8). R5 checks minutes; the seconds are checked by the TRIP PREVIEW (K-10), so SECURE needs both. The desk shows the plain words; the LOR names sit behind "?".

| State | Desk word | Condition |
|---|---|---|
| SECURE | SECURE | R5 ≥ 1.25 L **and** the TRIP PREVIEW nadir for losing L is ≥49.5 Hz |
| LOR1-like | TIGHT | L ≤ R5 < 1.25 L, or R5 ≥ 1.25 L with a preview nadir below 49.5 Hz |
| LOR2-like | SHORT | R5 < L |
| LOR3 | SHEDDING | load being shed |

*Accept:* one function feeds the gauge, the alarm, the price (P-7), par and the debrief; the restore permissive (K-13) uses the same TRIP PREVIEW engine and 49.5 Hz line (a RESTORE PREVIEW of the district's pickup, run on the restore itself) rather than R5, since R5 is 5-minute headroom and passed restores that set off UFLS again (tuning pass); gauge and alarm disagree on 0% of ticks (today 29.6%).

**H-6 — UFLS starts at 49.0 Hz, in stages.** UFLS is under-frequency load shedding: automatic relays that disconnect blocks of customers when frequency falls.
- Eight stages at 49.000, 48.875, 48.750 … 48.125 Hz, each shedding about 6% of load. Each block is two city districts (U-1, K-13), and blocks carry net load from Phase 2 (P-12).
- About 0.3 s from crossing to load off: the relay measures for ~0.1 s, waits ~0.1 s, then the breaker opens.
- Relays are never player-operated.
- Restoring load becomes the K-13 procedure, with a visible rule that replaces the hidden one (X-19).
- Fix the text at L255, L1383 and L1466.

*Accept:* no shedding above 49.0 Hz; in a trace, the crossing-to-shed delay is 0.30 ± 0.02 s; there is no automatic restore.

**H-7 — Graded collapse, both directions.**

| Condition | Result |
|---|---|
| ≤47.0 Hz or ≥52.0 Hz | Black immediately (the standard's extreme limits) |
| 47.0–47.5 Hz for 2 s | Black |
| 47.5–48.0 Hz for 20 s | Black. The 20-s window is compressed and labelled. |

- Over-frequency: governors respond symmetrically (down to minimum), and an over-frequency generation shedding scheme (OFGS) trips wind in stages between 51.0 and 52.0 Hz. From Phase 2a wind, utility solar and rooftop inverters also lower their output on over-frequency, before OFGS is reached (H-8).
- The frequency clamp extends to 46.5 Hz.

*Accept:* nothing goes black above 47.5 Hz within 20 s; the desk-lab midday case (6.6 GW·s, no battery, which today over-sheds past 52 Hz) is re-run and its outcome recorded in §8; no single credible contingency from a SECURE state blacks out the grid (see H-8). *Measured (review-fix pass, `tools/baseline-v4.js` section 1):* the midday case on the v4 engine (two coal machines at 650 MW, 6.5 GW·s, 1,300 MW solar, 900 MW wind, 600 MW import, demand 4,100 MW; coal1 trips; physics only) still goes black with no battery: the fall reaches 47.63 Hz, 7 UFLS stages shed 1,792 MW for 650 MW lost, and the rebound passes 52 Hz (black at 1.10 s) before OFGS can act. With the battery in service (idle, half full, no GUARD) it sheds 3 stages and peaks at 50.49 Hz. Such a state is far from SECURE, so the third Accept item holds; the over-shed itself stays open as §9.2 risk 10 (recorded in §8.2's "UFLS" row).

*Re-run (Phase 2a).* Two things changed: wind, utility solar and rooftop inverters now back off on over-frequency (H-8), and UFLS blocks carry net load (P-12).
- **The same desk-lab case** (`tools/baseline-v4.js` section 1, classic, no rooftop): with no battery it **no longer goes black**. The fall and the shed are as before (nadir 47.626 Hz, 7 stages, 1,792 MW for 650 MW lost), but the rebound peaks at 51.082 Hz with one OFGS stage and sits at 50.904 Hz after 60 s; before, it passed 52 Hz and was black at 1.10 s. With the battery in service: 3 stages, peak 50.246 Hz (50.493 Hz before).
- **Rebuilt on net-load blocks** (`tests/belly.test.js`; a mild 12:30 set by hand: operational demand 2,400 MW and 3,465 MW of rooftop, so 5,865 MW of underlying load; coal1 of two coal machines at 650 MW trips, 6.5 GW·s; 700 MW of solar, 400 MW of wind, no tie flow; physics only, 60 s). With no battery: nadir 47.435 Hz; all 8 stages operate and take 1,295 MW of net load for 650 MW lost, leaving 2,942 MW of customers dark; peak 50.440 Hz, no OFGS, not black, 50.366 Hz after 60 s. With the battery: nadir 48.451 Hz, 3 stages, 396 MW net, 1,093 MW of customers dark, peak 49.900 Hz. With the inverter response switched off, the no-battery case shows the same fall and then goes black at 52 Hz after 1.56 s.
- **What it means.** At a sunny noon the relays darken more than twice the customers for each MW they shed (2,942 MW dark for 1,295 MW of relief), which is the weakness of static blocks that P-12 describes. The over-frequency collapse is closed; the over-shed is not. A result, not a target: the state is far from SECURE.

**H-8 — Honest contingency physics: one engine, in physical seconds.** `sim/physics.js` is used by live play, TRIP PREVIEW (K-10), the watch (K-15), restore previews (K-13), par and tests. It merges the desk draft's K-14.
- **Swing equation:** df/dt = f₀ · ΔP / (2 · Ek). Ek is Σ H·S (inertia constant × machine rating) over online synchronous machines, shown in GW·s. It replaces `syncM/6+250` (X-12).
- **Load relief:** 0.5% of load per 1% change in frequency (AEMO's mainland assumption since 2020, kept by its 2023 review; §8.1). The desk prototype used 1.1%.
- **Governors:** droop 5% and deadband ±0.015 Hz (the NEM's mandatory primary frequency response); limited by headroom up (rating − output) and down (output − minimum); capped at ±12% of rating; dead time + first-order lag: coal 0.5 s + 5 s; CCGT 0.3 s + 3 s; OCGT 0.2 s + 1.5 s; hydro 0.5 s + 4 s.
- **Battery, two layers (decided in §9 Q-1):**
  - *Mandatory primary response:* the whole battery follows AEMO's curve: deadband ±0.015 Hz, full output 0.85 Hz beyond the deadband (~1.7% droop), 0.1 s dead time + 0.1 s lag.
  - *Contingency FFR reserve (the GUARD, K-5):* the MW the player holds back are delivered in full within 1 s once frequency falls below the trigger (switched-controller style, as batteries enabled for Very Fast raise FCAS do; trigger value to verify, §8.3), and sustained for 10 minutes.
  - Guard MW are unavailable for charge/discharge orders. Output is the sum of both layers, capped at the inverter rating, and full swing from charging to discharging is allowed.
- **UFLS and collapse** per H-6 and H-7.
- **Wind, utility solar and rooftop solar respond to over-frequency only** (labelled in §8.2). **Decided in Phase 2a (§9.1 Q-25):** until then they gave no primary response at all, only OFGS acted on them (H-7), and this bullet left the question to Phase 2. Without a downward response the belly had none: a 256-MW potline trip at noon reached 51.26 Hz from a SECURE state, even with curtailment.
  - *Wind and utility solar:* the governors' 5% droop, on rating, beyond the ±0.015 Hz deadband, never more than their present output. This is the NEM's mandatory PFR, which binds semi-scheduled plant whenever its target is above 0 MW.
  - *Rooftop inverters* (AS/NZS 4777.2:2020, region Australia A): output falls in a straight line from 50.25 Hz to zero at 52.0 Hz. It is **held at the lowest value reached** until frequency is back under 50.15 Hz, then returns at 16.67% of rating a minute (the P-12 ramp).
  - *Lowering only.* Real plant also raises its output on under-frequency where it has curtailed headroom; ours does not, and the label says so.
  - Both are in the one engine, so the TRIP PREVIEW, the watch and the imbalance bar (K-11) show them, and each contingency's "caught by" record has an inverter term.

*Accept:* initial RoCoF, defined as df/dt over the first 20-ms tick, is within 1% of ΔP · f₀ / (2 · Ek) (the dial and the HIGH RoCoF tile instead use the FOS 500-ms window, K-11); for a −650 MW trip, raising Ek from 8 to 25 GW·s raises the nadir by ≥0.2 Hz (desk lab with the legacy battery: 49.33 → 49.58 Hz; quick re-run with H-8 values: 49.03 → 49.29 Hz; to be re-measured in `sim/physics.js`); **containment** (the frequency operating standard, FOS, for a credible trip): from any state meeting both SECURE conditions of H-4, losing the largest credible contingency keeps the nadir ≥49.5 Hz in 1,000 of 1,000 sampled states, with every parameter inside its §8 range; a 10-s engine run costs ≤5 ms (desk E9: 1.4 ms). *Measured (end of Phase 0.2, `tools/baseline-v4.js`):* initial RoCoF matches ΔP · f₀ / (2 · Ek) to 0.000%; 8.4 → 26.7 GW·s raises the −650 MW nadir from 48.760 to 49.350 Hz; containment 6,856 of 6,856 SECURE states (worst 49.511 Hz) on 271 par days (`v4-core-0.2.2`; 4,299 of 4,299 in the finishing pass), after the TRIP PREVIEW was made to re-run whenever frequency moves 0.03 Hz (before that, 5 of 1,595 states the desk showed as SECURE missed 49.5 Hz, worst 49.417 Hz). **Decided (Phase 1a, §9.1 Q-7): both credible contingencies are previewed.** Before that, H-4 previewed only L, the largest contingency by MW. From the same SECURE states, losing the *other* credible contingency (the largest unit when L is the tie import, or the tie when L is a unit) misses 49.5 Hz in 28 of 4,904 (worst 49.470 Hz): a unit trip of nearly the tie's MW also takes its inertia and governor with it. Phase 1a previews both, as N-1 security does; BIGGEST RISK names the deeper one, and the S-12 table has the measured effect.

*Measured (Phase 2a, the inverter response; `tests/belly.test.js`):* from a noon state that is spilling 510 MW (six units at minimum, battery full), a 256-MW loss of load peaks at 50.232 Hz, and a trip of the tie at 300 MW of export peaks at 50.273 Hz (50.260 Hz with rooftop connected). Neither reaches an OFGS stage. With the response switched off the same two events reach 51.660 Hz (3 OFGS stages) and 51.829 Hz (4). The preview agrees: of the 256 MW lost, the inverters catch 252.6 MW and load relief 3.4 MW. SECURE previews the loss of *supply*; a credible loss of *load* is not previewed, and these two cases are why it need not be: both stay inside 50.5 Hz (labelled in §8.2). In the deepest belly (units at minimum above demand, every MW of wind and solar already held back, no room in the battery) frequency parks at about 50.35 Hz on the roofs' back-off, and the only remedy is to stop a unit. Containment from SECURE states on the game's day is in the S-12 table (6,470 of 6,471 on `desk`, 6,436 of 6,438 on `desk-weekend`).

R5 alone does not guarantee containment: in the desk sweep a 650 MW trip reached 49.33 and 49.45 Hz at 8 and 12 GW·s, and the foundations prototype reached 49.26 Hz for 500 MW with no battery at full inertia. That is why SECURE also needs the preview.

**H-11 — The frequency operating standard is a visible rule.**
- Normal band 49.85–50.15 Hz.
- After a credible contingency, frequency must stay within 49.5–50.5 Hz and return to the normal band within 5 minutes.
- The desk shows a 5-minute countdown whenever frequency is outside the normal band.
- **Directed shedding** begins if either timer runs out: frequency still below 49.85 Hz when the 5-minute countdown ends, or frequency below 49.5 Hz for more than 1 grid-minute.
- Directed shedding takes one district at a time, in the rotation order on the city panel, each grid-minute until frequency recovers. It counts on LIGHTS ON. From Phase 2a it passes over a district whose rooftop solar is feeding power back, because shedding that one would make the shortfall worse (P-12).
- Time outside the band is no longer penalised tick by tick (X-20).

*Accept:* grid-minutes below 49.5 Hz beyond 1 minute per excursion without shedding = 0 (today: 7.0 per shift); the countdown is visible; the debrief prints "containment met" and the time to restore.

**H-12 — Separate the price cap from the cost of unserved energy.**
- Market price cap $23,200/MWh (FY2026-27) and floor −$1,000/MWh, both in `params.js` with sources.
- Unserved energy is scored in MWh (S-1).
- The debrief may show a "community cost" at the AER Value of Customer Reliability (VCR), $30,000/MWh NEM-wide. It never enters CUSTOMER COST.

*Accept:* no code path multiplies unserved MWh by a price in the scorecard.

**H-14 — Honest-abstractions panel.**
- `content/text.js` holds one entry per §8 abstraction row: the real value, our value, and why.
- The desk shows it behind "?" next to the element concerned (speed badge, synchroscope, AGC band, tie, collapse timer…).
- The same text is in the manual drawer.

*Accept:* a test checks that every §8 abstraction has a text entry and a UI anchor ID.

**P-5 — Merit-order price.** Merit order is the order in which plant is used, cheapest first.
- Market demand = operational demand of the lit districts (plus the cold-load surge of restored ones) − scheduled tie flow − battery output. Load that is shed and still dark is not dispatched for: NEM dispatch targets metered demand.
- The price is the offer of the block where the running total of the stack first covers market demand.
- The stack holds committed units, offline units able to start within 10 min, available wind and solar (what the weather gives, whatever the player's curtailment LIMIT: curtailing never raises the price), and in-market industrial DR.

*Accept:* the Live Stack and the price use the same function.

**P-6 — Offers are cost-based, and labelled so.**

| Offer | Value |
|---|---|
| Thermal minimum-load blocks | −$1,000 (would rather pay than shut down) |
| Coal above minimum | $26 |
| CCGT above minimum | $74 |
| GTs above minimum | $148–156 |
| Hydro | water value, $130, rising as storage falls |
| Utility wind and solar | −$20. Real Q4 2025: average negative price −$19.4, 86% of negative prices between −$30 and $0. |
| Industrial DR | $1,400 |
| Tie | Price-taking at the neighbour's price. The neighbour follows a daily shape: cheap at midday (same sun), dear in the evening. Stored in `content/scenarios.js`. |

*Accept:* par's tie flow is not pinned at one limit all day on ≥50% of seeds, so importing is a decision.

**P-7 — Scarcity adder.** Let x = R5 / L.

| x | Adder |
|---|---|
| ≥ 1.25 | $0 |
| 1 to 1.25 | Rises linearly to $300 |
| < 1 | $300 + $4,700 · (1 − x)² |

It is labelled "generators re-bidding when supply is tight (abstraction)".

*Accept:* the adder is a pure function of R5/L (unit test at x = 0.5, 1, 1.1, 1.25, 2).

**P-8 — Limits and intervention pricing.**
- The price is clamped to −$1,000…$23,200.
- It equals the cap when the stack cannot cover market demand, or while AEMO-ordered load shedding is in force (a district dark by FOS directed shedding or DIRECT SHED): when AEMO orders load shedding, the spot price is set to the cap (§8.1). Districts shed by UFLS, which is automatic protection, and waiting to be restored do not set the cap: the stack clears on the lit demand (review fix: the cap used to hold for hours after UFLS on a healthy grid, and drove the battery's measured charge price and par's discharge rule).
- Reserve diesel (RERT) sits outside the market: the price is computed as if RERT were absent (to verify, §8).

*Accept:* unit tests cover each limit.

**P-11 — Price colours follow security state, not dollars.** Green = SECURE, amber = LOR1, red = LOR2, flashing at the cap. This replaces "red above $1,000" (L1310).

*Accept:* the colour is a function of the H-4 state only.

**S-1 — LIGHTS ON (the primary axis).** Unserved MWh from UFLS plus directed shedding, plus load in the Act I restore task (D-8) from the moment the network clears it for restore until it is picked up. Paid DR and city flexibility are not unserved.
- **Unserved energy is the dark customers' own load** (Phase 2a, P-12): their underlying demand, before rooftop solar. A dark district's panels are off with its feeder, so its customers are without all of it. The MW the relays took off is net of rooftop and can be near zero at a sunny noon; it is not the measure.

*Accept:* `observe().score.unservedMWh` equals the integral of the dark customers' underlying load (P-12). With no rooftop PV that is the integral of shed MW, as first written, and the classic scenario gives the same number as before.

**S-2 — CUSTOMER COST (the cost to serve).**
- Included: fuel, no-load, starts, imports minus exports, battery wear, DR and city-flexibility payments (U-6), and RERT.
- Excluded: any value placed on unserved energy, and scarcity rents.
- Shown in ¢/kWh served.
- The market bill (price × energy) is shown as information only. It moves with shedding, and would reward over-commitment by −12 to −20% against par (rules lab).

*Accept:* corr(Δunserved, Δcost) against par is within ±0.15 across the S-4 player proxies (rules lab: −0.03), so the axes are independent. *Measured (review-fix pass, `tools/baseline-v4.js` section 2; seeds 1–100, Δ = proxy − par per seed, cost in ¢/kWh served, Pearson r):* lean +0.50, competent +0.15, planOnly −0.43, commitAll +0.29; lean + competent +0.69; all four −0.08. **Open (owner decision):** the Accept names no proxy set, and the answer depends on it: pooled over all four proxies it holds, for the player proxies of S-5 (lean, competent) it does not. The likely driver is that a proxy that falls short also buys DR and the diesel, so shortage and cost move together; deciding the set (or re-reading the Accept per proxy) comes before any change to the cost axis.

**S-3 — CARBON.** Graded as intensity: t CO₂ per MWh generated in the region (AEMO's carbon intensity index convention, §8.1: imports carry the neighbour's emissions and count in neither term; the battery stores energy already counted), with the total shown. Total emissions fall when load is shed (r = −0.40); intensity does not (r = −0.06). Review fix: per MWh *served*, importing lowered the graded intensity by enlarging the denominator alone (seed 12, 11:00–13:00: −8.6% for the same served energy), so the carbon axis could be gamed by importing (labelled in §8.2).

*Accept:* shedding 100 MWh with no other change moves intensity by <0.5%; an import that replaces regional generation MWh for MWh changes intensity only through the regional mix.

**S-4 — PAR: one fixed reference dispatcher.**
- `sim/autopilot.js` is run headless on the same seed and build.
- **Information:** it reads only `observe()`. That means the forecast (including announced heat), the wind and solar forecast drifting from current values toward the announced regime, unit states, water, battery state of charge, R5 and L. It never reads the event list.
- **Pace:** AGC on, plus at most one discrete action per 3 real seconds of the reference playback schedule (the D-2 profile plus the watch/respond timings). It never acts during WATCH.
- **Start:** the same L-0 pre-dispatch plan the player gets, without its planned stops (par decommits by rule 4 only). Par never takes a synchroscope: its starts auto-sync (K-12), so a clean manual close can beat it.
- **Re-plan:** after each discrete action par re-dispatches every lever and the tie from then to 04:00 over the commitment it now has (a RE-PLAN, logged with origin `replan`). The re-plan is part of the action it follows, not a second one, and the bench player has the same RE-PLAN (ASSIST PLAN), so par is not a stronger dispatcher than the player can be (§8.2 "Par re-plans after every action."). The review measured what it is worth: without any re-plan par's zero-unserved days fall from 89 to 42 of 100 raw seeds (0 of 15 heat days). **Decided (Phase 1a, §9.1 Q-6):** the desk gets a RE-DISPATCH key, the same re-dispatch as an L-9 exception, so par keeps its free re-plan. Since Phase 1a the plan lives in state and par, the pre-dispatch, RE-DISPATCH and the dark-city reflow all act through planLoad inputs (sim/README.md §12, Phase 1a).
- **Rules, in order:**
  1. After any trip: start the next peaker and set the tie to maximum import.
  2. If R5 < 1.05 L: move the tie toward import and start the next peaker. (v4 form: also the TRIP PREVIEW; the GUARD is raised first, but only as far as the battery's energy sustains it for the 10-minute sustain time.)
  3. Commit a unit when forecast net demand over (its start time + 20 min), plus 700 MW, exceeds committed capacity plus half the battery.
  4. Decommit only after 90 min on, when the unit isn't needed for 150 min and N-1 still holds.
  5. Hold water until 15:30, then release it linearly to 21:00.
  6. Charge the battery to 97% during 09:30–15:30; discharge by merit order during 16:30–22:00. A discharge order still running after 22:00, or at its 20% reserve, is ended right after rule 1 (review fix: orders never expire, and at the night roll's pace the 16:30 order otherwise ran all night on 71 of 80 seeds and emptied the battery on 46). Measured after the fix on the review's seeds 1–80: the order ends at the first action slot after 22:00 (median about 23:00; the night roll allows one action per ~105 grid-min), runs all night on 3 seeds (71 before), and the battery is empty after 20:00 on 10 seeds, 0.09 h a day on average (46 seeds and 1.16 h before).
  7. Keep units at or below 95.5% loading unless that would shed load.
  8. Pre-arm diesel when the projected 25-min shortfall is within 100 MW of firm capacity. Call DR on a present shortfall.
- **The belly, as built (Phase 2a; S-14).** Rule 6 also charges when the price is ≤$0 or power is being spilled (S-14 rule 2), and rule 4 has a coal branch (S-14 rule 4). Par and the dispatch plan on *lit operational* demand: what the lit districts draw from the grid after their own rooftop solar (`observe().demand.litMW` now, the forecast ahead), not a share of the total. Every battery order, par's or the player's, counts in the plan only for the energy behind it: a discharge until the 20% reserve, a charge until the battery is full (97% for par's own orders) (§9.1 Q-36). Rule 7 does not count what the dispatch is lowering in a surplus as a forecast miss. S-14 rules 1 and 5 need the city levers and wait for slice 2b.
- The same code runs in Node (par, tests, calendar) and in the browser (the debrief ghost).

*Accept:* **Information barrier:** scrambling hidden state (future events, the weather regime) leaves par's input log unchanged; par never makes more than one discrete action per 3 real seconds; par is deterministic per seed.

*Measured (Phase 2a, `tests/autopilot.test.js`, `tests/events.test.js`):* the barrier holds on the game's day too. Swapping the future rooftop skies and the hidden day type leaves the forecast unchanged (`desk` seeds 1 MILD, 2 HOT and 4, a heatwave not yet announced) and par's input log unchanged (`desk` seed 5). On heat seeds the hidden label HEATWAVE appears nowhere in `observe()` at any time of day and the day type reads HOT; the heat itself arrives as news at 10:30.

**S-11 — Commitment costs.** No-load costs and minimum up/down times as in the F-13 table.
- **Minimum down time applies to planned decommitment only** (owner decision D1, 2026-09-30). After a protection trip the unit is locked out for its protection lockout (the legacy 90–150 min: pre-rolled for event trips, 120 min for an overheat trip; labelled simplified in §8.2, since real returns after a trip range from hours to weeks) and may then hot-start (T1 + T2). `fleet.startBlock` applies the rule; units carry `downWhy` ('stop' or 'trip').

*Accept:* "commit everything at 04:00" costs more than par on ≥70% of seeds. *Measured (review-fix pass):* 86 of 100 seeds (`tools/baseline-v4.js` section 2, which now runs the commitAll proxy; 87 in the finishing pass, 86 in the tuning pass). *Measured (Phase 2a):* 198 of 200 seeds on `desk`, 200 of 200 on `desk-weekend`, 94 of 100 on classic.

**S-12 — Capacity sized so a good plan holds the day.**
- +900 MW of peak capacity: GT·B 1 × 500 → 2 × 400 MW, plus the new GT·C at 2 × 300 MW (owner decision D2).
- Re-measured at the end of Phase 0.2, Phase 1a (governor lag) and Phase 2 (rooftop PV; see §9 Q-3).
- Par's RERT rule (S-4 rule 8) makes the diesel an emergency (owner decision D3): firm capacity is counted honestly (units and the tie at their real limits; water, DR call-hours and battery energy above its reserve as an energy-limited pool), the diesel is armed only on a shortfall its 20-minute lead can still reach (or earlier when the shortfall is energy-driven and arming now saves stored energy), and it stands down when the adequacy walk without it is clean (sim/README.md §11 autopilot).
- Rules lab result (legacy physics with the lab's patches, and GT·B as one 800-MW machine, so a larger L than 2 × 400): par with zero unserved on 182/200 seeds (91%: 90/100 on seeds 1–100 and 92/100 on seeds 101–200, in `v4-rules/res/log_v4p600_par_1.txt` and `log_v4p600_par_101.txt`; only the first has a per-seed JSON), 83/100 forced-heat and 92/100 calm.

**How the evening stays hard (decided in §9 Q-3).** Difficulty is tuned with the fleet, never by inflating real demand. The knob is GT·C's size (drop it, or shrink it from 300 MW). The evening should be hard because of its *steepness*: whether the levers can climb fast enough, and whether slow starts were scheduled early enough on the Live Stack. It should not be hard because of a raw MW shortfall that no plan can cover.

*Accept:* par sheds zero on ≥85% of 200 raw seeds and ≥75% of 100 forced-heatwave seeds; par arms RERT on ≤25% of seeds (§9 Q-2); the lean proxy (pre-dispatch plus reaction, no forward planning; S-5) earns A on ≤40% of dailies. Re-checked after rooftop PV lands (Phase 2).

**Measured at the end of Phase 2a** (2026-10-02, after the sim, par and view were merged; the objective line, merged later, changes no par number, and no fleet value was tuned). From 2a the game's day is measured beside the classic one. `desk` and `desk-weekend` carry rooftop PV and day types: `node tools/par.js --scenario desk | desk-weekend --seeds 1-200 --probe --vs commitAll`, and `--heat 100` for the forced-heat seeds. Seeds 1–200 are 101 MILD, 70 HOT and 29 HEATWAVE days. `classic` has no rooftop PV and is the regression anchor: `node tools/baseline-v4.js`, golden re-recorded at each 2a merge; Phase 1a's figure in brackets.

| Measure | Target | `desk` | `desk-weekend` | `classic` |
|---|---|---|---|---|
| Par zero unserved, 200 raw seeds | ≥85% | **192 (96.0%)**: MILD 99/101, HOT 67/70, HEATWAVE 26/29 | **197 (98.5%)** | **183 (91.5%)**: calm 99/105, storm 61/66, heat 23/29 (186) |
| Par zero unserved, 100 forced-heat seeds | ≥75% | **86** | **98** | **77** (75) |
| Par arms RERT, 200 raw seeds | ≤25% | **13 (6.5%)**: HEATWAVE 9, HOT 4, MILD 0; forced heat 30/100 | **1 (0.5%)**; forced heat 3/100 | **44 (22.0%)**; forced heat 66/100 (45; 65) |
| "Commit everything at 04:00" dearer than par (S-11) | ≥70% | **198/200** | **200/200** | **94/100** (86) |
| Lean proxy earns A | ≤40% | not measured yet (slices 2b / 2d) | not measured yet | **3/100** (A3 C1 D96) (2) |
| Competent proxy earns A (S-5) | ≥70% | not measured yet | not measured yet | **72/100** (A72 B12 C2 D14), over its target for the first time (69) |
| Black days, par | 0 | **0** | **0** | **0** |
| No-input day | must fail on every seed (§9.1 Q-18, Q-32) | 16.1–37.4 GWh unserved on 11 of 11 seeds; never black | 11.1–31.1 GWh unserved on 11 of 11 seeds; never black | planOnly: black 0/100, D on 100/100 |
| Credible trip from a SECURE state (H-8), both kinds previewed | every state ≥49.5 Hz | **6,470 of 6,471** (worst 49.491 Hz, seed 69 at 18:20); losing the tie import 3,816 of 3,816 (worst 49.509 Hz) | **6,436 of 6,438** (49.455 Hz, seed 102 at 19:55; 49.497 Hz, seed 106 at 11:17); losing the tie import 3,234 of 3,234 (worst 49.526 Hz) | **6,400 of 6,401** (worst 49.465 Hz); losing the tie import 5,269 of 5,269 (worst 49.520 Hz) (6,686 of 6,687) |
| Rule 4 coal stops (S-14) | expected 0 | 0 | 0 | — |
| Battery average charge price (P-10, Phase 3) | ≤$100 | — | — | **$198/MWh** over all charging, median day $85 ($89) |
| Par day runtime (D-9), median, seeds 1–12 | ≤1.6 s | 1.79 s | 1.71 s | 1.89 s |

What the table says:
- **Par holds the game's day** with room to spare on every S-12 target, and nothing goes black. No fleet value was changed in 2a: the par job measured and proposed, it did not tune. Whether the evening on `desk` is still hard enough (§9.1 Q-3) is a question for the lean and competent proxies, which have not been run on the game's day yet.
- **SECURE states.** Every state that missed 49.5 Hz was SECURE only on a cached preview. Of the 6,349 (`desk`) and 6,290 (`desk-weekend`) states that were SECURE on a fresh preview, none missed.
- **Classic, step by step** (raw clean / forced-heat clean / raw RERT): Phase 1a 186 / 75 / 45; with the inverter over-frequency response on (H-8; it acts on about 15% of classic ticks, so par's days diverge) 183 / 76 / 45; with every battery order counted for its energy (§9.1 Q-36; 198 of 200 par rows move) 183 / 77 / 44. The S-12 targets hold at each step.
- **The battery's charge price on classic** went from $89 (Phase 1a) to $388 with the inverter response on, and back to $198 once par's battery orders counted for their energy. The median day barely moved ($87, $86, $85), so a few dear days carry the mean. Not yet explained; P-10 is a Phase 3 target.
- **The `desk-weekend` commitment** was tuned once (§9.1 Q-32): it opens with both CCGTs on and coal 4 off. The figures above are on that commitment.

**Measured at the end of Phase 1a** (2026-10-01, `v4-core-1a.1`; `node tools/baseline-v4.js`, golden re-recorded). Phase 1a moved the plan into state (par, the pre-dispatch and RE-DISPATCH act through `planLoad`), previews both credible contingencies (§9.1 Q-7) and adds R5 to the restore permissive (Q-10). The sim agent's `v4-core-1a.0` run (A-2 on) in brackets, then Phase 0.2:

| Measure | Target | Result |
|---|---|---|
| Par zero unserved, 200 raw seeds | ≥85% | **186 (93.0%)**: calm 100/105, storm 63/66, heat 23/29 (186; 0.2: 181) |
| Par zero unserved, 100 forced-heat seeds | ≥75% | **75 (75.0%)** (75; 75) |
| Par arms RERT, 200 raw seeds | ≤25% | **45 (22.5%)**; forced heat 65/100 (45; 47) |
| "Commit everything at 04:00" dearer than par (S-11) | ≥70% | **86/100** (86; 86) |
| Lean proxy earns A | ≤40% | **2/100** (A2 D98) (2; 0) |
| No-input day (planOnly, L-0) | never black | **0/100 black**, D on 100/100 |
| Credible trip from a SECURE state (H-8), both kinds previewed | 1,000 of 1,000 ≥49.5 Hz | **6,686 of 6,687**: losing the largest unit 6,687/6,687 (worst 49.502 Hz); losing the tie import 4,866/4,867 (**worst 49.488 Hz**, seed 224, tie importing 800 MW: the fresh preview was 0.071 Hz too high, more than the 0.05 Hz margin; the same miss occurs with A-2 off). Open: a larger margin could cost the heat target, which sits exactly at 75 |
| Battery average charge price (P-10, Phase 3) | ≤$100 | **$89/MWh** (0.2: $203) |
| Par day runtime (D-9) | ≤1.6 s | 2.02 s median, 4.81 s max (sim agent, one process; 0.2: 1.70 / 2.52 s on the same machine and day). The plan executor and the larger `planLoad` log add ~0.18 s, the second preview ~0.14 s. Still over budget on this laptop; the yardstick-based D-9 test passes |

Par's restores (rule 9) use the same permissive, so Q-10 reached par too; none of the targets moved. With no input the game day is exactly the planOnly proxy's day (`app/system.js`; seed 7: 21,007 MWh unserved, against 18,050 MWh in Phase 0.2). The no-input floor is a dark city, not a black one, because shed districts wait for the player to restore them (H-6, K-13).

**Measured at the end of Phase 0.2** (review-fix pass, 2026-09-30, `v4-core-0.2.2`; `node tools/baseline-v4.js`, golden `tools/baseline-v4.golden.md`; v4 physics, no rooftop PV; the finishing pass's `v4-core-0.2.1` figures in brackets):

| Measure | Target | Result |
|---|---|---|
| Par zero unserved, 200 raw seeds | ≥85% | **181 (90.5%)**: calm 99/105, storm 60/66, heat 22/29 (179) |
| Par zero unserved, 100 forced-heat seeds | ≥75% | **75 (75.0%)** (75; 76 in the tuning pass) |
| Par arms RERT, 200 raw seeds | ≤25% | **47 (23.5%)**; 70/100 on forced-heat seeds (47; 70) |
| "Commit everything at 04:00" dearer than par (S-11) | ≥70% | **86/100** (87) |
| Lean proxy earns A | ≤40% | **0/100** (C 2, D 98) |
| No-input day (planOnly, L-0) | never black | **0/100 black**, D on 100/100 (0/200 in the finishing pass) |
| Par cost, raw seeds (median / mean) | — | 6.13 / 7.68 ¢/kWh (forced heat: 10.92 / 15.96) |
| Par carbon, raw seeds (median) | — | 0.582 t CO₂ per MWh generated (heat 0.579); the finishing pass measured per MWh served: 0.531 (heat 0.526) |
| Par DR calls per day (mean) | — | 1.50 (forced heat 2.39) |
| Par day runtime (one core, seeds 1–10, median / max) | ≤1.6 s (D-9) | **1.56 / 1.78 s** on the owner's laptop (`runPar`, one process). The finishing pass measured 2.40 / 2.55 s: most of the overrun was the hourly `hashState` walking the live state, which made every later physics tick allocate (README §9, review fix) |
| Credible trip from a SECURE state (H-8) | 1,000 of 1,000 ≥49.5 Hz | **6,856 of 6,856** losing L (worst 49.511 Hz) on 271 par days; losing the other credible contingency: 4,876 of 4,904, worst 49.470 Hz (open, H-8). More states are SECURE than in the finishing pass (4,299) because the battery no longer runs empty overnight |

The review-fix pass changed par in two places (rule 6's window end ranked after rule 1, and rule 2's GUARD only as far as the battery sustains it) and the price in three (the lit demand, the cap only for directed shedding, available wind and solar in the stack; par's rule 6 reads the price): 13 of the 271 par days shed less (seed 30: 2,226 → 0 MWh; seed 127: 948 → 0), none shed more, and the S-12 targets hold with the same margins.

Before the tuning pass (GT·C 1 × 300, minimum down time after trips too, the battery left out of RERT's firm capacity): 100/200 raw clean, RERT on 198/200, 9/100 heat. Step by step (raw clean / raw RERT / heat clean): D1 + D2 alone 89.0% / 68.0% / 78%; RERT walk 87.5% / 25.5% / 75% (the heat days lost the early, always-armed diesel); restore preview (K-13) and preview margin (H-4) 87.5% / 24.0% / 75%; rule 1 calls DR when no peaker is left 89.5% / 23.5% / 76%. **GT·C sensitivity** with the tuning pass's final par: 1 × 300 MW 76.0% / 54.0% / 44%; 2 × 250 MW 86.0% / 35.5% / 68%; 2 × 300 MW 89.5% / 23.5% / 76%. So GT·C sits at the top of its range and the heat and RERT targets hold with little margin. The finishing pass then made the TRIP PREVIEW re-run when frequency moves 0.03 Hz (H-4/H-8: `tools/baseline-v4.js` had found 5 of 1,595 desk-SECURE states whose trip missed 49.5 Hz); par reads the preview, so forced heat moved 76 → 75 (exactly the target) and raw RERT, raw clean and S-11 stayed within one seed.

What still misses (heat and raw, first cause of the first shed): a supply trip at the evening peak while the tie imports 700–800 MW and every unit is at the hot gate (the preview for losing L is below 49.0 Hz, so UFLS stage 1 follows: 8 tie trips and 3 unit trips at 17:30–20:00 among the tuning pass's 24 forced-heat failures; 25 fail after the finishing pass), heat evenings whose energy runs out (water, DR hours and battery all spent: 7 of 24), FOS directed shedding while the pace holds par back after a trip (3), and a second trip within minutes of the first (N-2). Every forced-heat seed is short at the evening peak even with the whole fleet, the tie at 800 MW and no trip (median 950 MWh over ~2.7 h; energy oracle, tuning pass), so a heat evening needs DR, the battery and usually the diesel together.

**Exit Phase 0:**
- `tools/par.js` prints par for any seed.
- `tools/baseline.js --v4` prints the §6 rows for the v4 core. Built as `tools/baseline-v4.js`, with its golden `tools/baseline-v4.golden.md` (`tests/baseline-v4.test.js`); `tools/baseline.js` keeps measuring the frozen `index.html` against its own F-12 golden.
- `next.html` plays a whole day through the bench.

---

### Phase 1 — The desk

**Ships:** `next.html` plays a full day at a flat 120× with the desk, the Live Stack, the watch and the map. `index.html` stays on the legacy build.

Phase 1 is split so that strangers touch the core desk before the polish is built:

| Step | Items | Gate |
|---|---|---|
| **1a — Greybox** | K-1–K-7; K-8 basics (tiles, set/clear thresholds, ACK, SILENCE); K-9–K-13; K-15–K-18; K-19 hum; the K-20 breaker clack; L-0–L-9; G-1; G-5 dark districts; the F-11 `?perf` overlay. Plain shapes and colours. | **Greybox check:** two people who have never played (not the owner) each play one greybox day, with the owner silent. Pass: both reach the end of the day and can say what a lever and the stack do. Otherwise fix the top issue and re-check with one new person. |
| **1b — Polish** | K-8 details (the ISA-18.1 flash sequence, the 30-s re-sound rule); K-20 full foley; K-21; K-22; K-23; G-2–G-4; the F-11 budget. | None. 1b may land after playtest gate 1. |

L-7–L-9 and K-13 join the reviewers' greybox list because the §4.1 day, the respond card (K-16) and the Act I restore task (D-8) depend on them.

#### Controls

**K-1 — Motorised unit levers.** One lever per station: COAL, CCGT, GT·A, GT·B and GT·C. Hydro, battery and tie are rotary controls, for 8 slots in all (9 fit at 1280 px).
- The handle is the *base point*: the MW scheduled for that unit.
- Behind the handle: the actual-output needle, the AGC band bracket, and a ramp cone showing how far output can move in 10 grid-minutes.
- Detents at MIN (minimum stable generation), 25%, 50% and 75%.
- A spring-loaded overload gate at 96%. Past it the slot turns red and shows *that unit's* trip risk (H-2).
- Multi-machine stations show one lamp per machine. Each lamp has its own START/STOP guard.
- In AGC mode, moving a lever writes that unit's plan (L-6): the desk is the main way to dispatch, and the Live Stack shows and times what the levers do.

*Accept:* the output needle never moves faster than the unit's ramp (±2%); crossing the gate needs an extra 12 px of drag or Shift+↑; an overheat trip hits only the unit in the red zone; in the §4.1 script and in the gate-1 logs, ≥50% of dispatch inputs are made on desk controls (levers, wheel, dials, keys, buttons, procedures) rather than on the Live Stack or the map.

**K-2 — AGC and hand-flying.** AGC is on by default. AGC (automatic generation control) is software that nudges each unit every few seconds to hold 50 Hz.
- Output = base point + AGC trim, within a band: coal ±5% of capacity, CCGT ±10%, GT ±20%, hydro ±25%, battery its full range minus its FFR reserve.
- If the trim needed exceeds all bands for >5 real s, the AGC LIMIT tile lights and the imbalance bar shows the unmet MW.
- AGC never starts or stops units.
- Levers follow the Live Stack plan. In AGC mode, moving a lever writes that unit's next arrive-by keyframe, at the earliest time its ramp allows, and the stack shows it (L-6). There is no MAN state in AGC mode.
- The AGC/HAND key reflects the mode chosen at the briefing (D-7) and is locked for the day. In HAND, levers set output directly and ghost pointers show where the plan wants them; a grabbed lever leaves the plan (amber MAN lamp), and P or a double-click on the lamp rejoins it.

*Accept:* with AGC on, adequate bands and no inputs, a bot holds 49.85–50.15 Hz on ≥97% of ticks on event-free days; "HAND" is shown on the dial face when active.

**K-3 — Guarded start and stop.**
- START: lift the guard and press. That is two clicks, or S then S within 2 s.
- STOP: the same guard, with H-1 behaviour: ramp to MIN, then the T4 shutdown ramp (F-13). The breaker opens only at ≤5% of rating, so a stop never removes more than a 5% step, and the stop can be aborted while unloading.

*Accept:* no start or stop commits on a single click; the seed-3 test of H-1 passes through the desk.

**K-4 — Hydro gate wheel.**
- Adjust it by dragging in a circle, with the scroll wheel, or with ←/→ (1% steps; Shift for 10%).
- The rim shows the reservoir level and "at this gate, water lasts until HH:MM".
- A red arc marks gate settings that would empty the dam before the forecast peak ends.

*Accept:* the "lasts until" time is within ±1 grid-minute of a harness run at constant gate.

**K-5 — Battery dial and GUARD ring.**
- A CHARGE / IDLE / DISCHARGE dial plus a 0–500 MW magnitude lever.
- **GUARD ring** (§9 Q-1): an outer ring on the dial, 0–500 MW in 50 MW detents, sets the contingency FFR reserve held back for trips (H-8). The magnitude lever's travel shrinks as the guard grows, so the trade-off is visible in the hand: MW on guard earn nothing at noon, but they catch the fall at 18:30.
- Turning the ring re-runs TRIP PREVIEW (K-10) live: the ghost needle moves as you add guard, so the player can find the guard that keeps the preview green.
- An FFR ARMED lamp shows the guard MW. FFR always overrides the charge/discharge order.
- A full battery shows FULL–HOLD (H-10).
- In the watch (K-15), the battery beat is labelled with the player's own setting: "YOUR GUARD: 300 MW".

*Accept:* in a −650 MW trip, a full battery set to CHARGE responds within ±5% of an idle battery; with the guard at 0 the H-8 containment test fails for a 650 MW evening trip at today's inertia (lab: 49.34 Hz), and some guard ≤500 MW passes it (re-measured in `sim/physics.js`); the preview moves within one frame of a ring detent.

**K-6 — Interconnector knob.**
- Flow from −800 to +800 MW, with detents at 0, ±250, ±500 and ±800, and a link breaker lamp.
- The midday export cap (F-13) shows as a red arc.
- A link trip is a contingency the size of the import.

*Accept:* L (H-4) is the largest of the biggest unit's output and the import.

**K-7 — Emergency controls.**
- **Reserve diesel** (RERT, AEMO's Reliability and Emergency Reserve Trader): **break glass** (§9 Q-2). The key sits under a hinged red cover. Lift the cover, then turn and hold for 0.6 s, or hold E. Arming plays its own alarm tone, puts a news-ticker line on the map, and the unit arrives 20 grid-minutes later at $16,000/MWh. Arming early is a bet: it costs from the moment it arrives, whether or not the shortfall comes. The debrief names the moment the glass was broken, and the share card carries a "glass broken" tag (Y-4).
- **Industrial DR:** a big button with lamps for the calls remaining. Hold D for 0.6 s.
- **DIRECT SHED:** a guarded key that sheds one district in rotation order. It appears only when LOR2 is forecast. Operators shed ahead of a forecast shortfall; relays handle the seconds (critique #1).
- Each control shows its cost and lead time before it commits.

*Accept:* no emergency action commits on a single tap; DIRECT SHED sheds exactly one district; par arms RERT on ≤25% of published dailies (S-12).

**K-8 — Annunciator with ACK and SILENCE.** Tiles follow the ISA-18.1 annunciator sequence:
- A new alarm flashes fast and sounds according to its priority.
- SILENCE stops the sound only.
- ACK (acknowledge) turns the flash steady.
- A cleared alarm goes dark, or flashes slowly if it cleared before being acknowledged.

Details:
- Analogue alarms have separate set and clear thresholds. For example, UNDER FREQ sets below 49.85 Hz and clears above 49.90 Hz.
- No tile sounds again within 30 s.
- Tiles, twelve in a 4 × 3 panel: UNDER FREQ, OVER FREQ, N-1 INSECURE, HIGH RoCoF, UNIT TRIP, LINK TRIP, UFLS OPERATED, AGC LIMIT, STORAGE LOW, MIN GEN, WEATHER, PEAK.
- **Twelve tiles stay (decided in Phase 2a, §9.1 Q-27).** An earlier draft of this list had a thirteenth tile, "MSL (Phase 2)". An MSL level is a forecast, and a tile for a forecast would chatter, so MSL notices are MARKET NOTICE cards in the message tray (K-9, P-4). **MIN GEN becomes real** instead: it lights while the dispatch is spilling power now (P-9). Before rooftop PV it could never light. Built: the tile sets after 60 grid-s of more than 50 MW spilled and clears after 30 grid-minutes under 10 MW; the cards are built from the sim's records.
- Clicking a tile, or pressing Enter on it, focuses the relevant control.

*Accept:* the competent proxy triggers ≤8 audible alarms per daily, and no tile sounds twice within 30 s.

**K-9 — Message tray.** It replaces the scrolling log as the main channel.
- Each card has a sender (weather bureau, market notice, station, city desk), a time, ≤25 words and one button. The button only focuses the relevant control (and lights it, as in L-9); it never dispatches anything.
- At most 3 cards are visible; the rest go to a LOG drawer.
- Warning cards ring twice and never repeat.
- Cards never pause play (§7).

*Accept:* every warning card offers a one-click jump to the relevant control; no tray button changes a setpoint, a schedule or a unit state (UI test).

**K-10 — N-1 gauge and trip preview.**
- Two bars: **R5** (5-minute reserve) against **L** (largest risk, with the unit named), with the H-4 state. The faces use plain words, "SPARE IN 5 MIN" and "BIGGEST RISK: COAL 3", with the state as SECURE / TIGHT / SHORT / SHEDDING; "R5", "L" and the LOR names sit behind "?" (H-14).
- **TRIP PREVIEW** (T, or hover) runs the H-8 engine for the largest contingency and shows a ghost needle at the predicted nadir, with the MW each source would catch.
- Colours: green ≥49.5 Hz; amber 49.0–49.5 Hz; red <49.0 Hz (UFLS would operate).
- Changed from the draft: there is no separate "can catch" number. Seconds-scale adequacy is the preview, and minutes-scale adequacy is R5 (§9 J-8).

*Accept:* the preview matches the actual nadir within ±0.02 Hz when a trip occurs in the same state; the preview runs in ≤5 ms.

**K-11 — Frequency dial and imbalance bar.**
- **Dial:** 49–51 Hz, with the normal band green, the band out to 49.5 and 50.5 Hz amber, and UFLS marked at 49.0 Hz. A 3-decimal readout, the rate of change in Hz/s and inertia in GW·s, labelled in plain words ("CHANGE", "SPIN"), with "RoCoF" and "inertia" behind "?". The rate shown, and the HIGH RoCoF tile, use the FOS window: the change over the last 500 ms (1 Hz/s is the credible-trip limit). It replaces the clipped gauge (X-35) and the "MW·s/Hz" chip.
- **Imbalance bar:** scheduled supply minus demand, with a hatched BORROWED stack showing what automatic response is covering (inertia, battery FFR, governors, load relief) and a red SHED segment. *Built (Phase 2a):* the stack gains an INVERTERS segment, for wind, utility solar and rooftop solar backing off on over-frequency (H-8), so the identity still closes. The SHED mark shows the customers' unserved MW, not the relay MW, which can be zero or negative with a sunny suburb dark (P-12).

*Accept:* each step, the bar's segments sum to the swing-equation imbalance within 1 MW.

#### Procedures

**K-12 — Synchronise (SYNC).** When a starting unit reaches full speed, its synchroscope lamp lights in the procedure bay.
- **Opening the scope** switches to FOCUS (1×). Only one unit is on the scope at a time.
- **Needle speed** is the *slip*: the speed difference between the machine and the grid. It is seeded at 0.15–0.40 Hz in either direction, so one turn takes 2.5–6.7 s.
- **Speed trim:** `[` and `]` change machine speed by 0.05 Hz per press, with a 0.5 s response.
- **Close:** press C or pull the breaker handle. The breaker takes 80 ms to close, so, as in real practice, you close just before 12.

Outcomes are deterministic:

| Closing condition | Result |
|---|---|
| Within ±10°, needle clockwise | **Clean.** The unit picks up a block of ≤5% of rating, then loads to MIN over its T2 (F-13); chime. |
| 10–20° | **Rough.** The lever shakes, a MW spike, a growl; shaft stress is logged. No trip. |
| Needle anticlockwise (machine slow) | **Reverse-power trip** after 2 s. The unit returns to the queue with no lockout. |
| Beyond 20°, or slip >0.5 Hz | **Blocked** by the sync-check relay ("device 25"): buzz. In HAND mode, a bypass key allows the close, but the unit then trips and is locked out for 20 grid-minutes. |
| AUTO (U), or no close within 8 real s | Trims slip to +0.10 Hz and closes cleanly on the next pass. |

Session budget (§9 J-5): unless the player opens the scope, an auto-synchroniser closes the unit in the background **4 grid-minutes** after it reaches full speed (a params value, tunable within 3–5; labelled in §8.2). Only the first shift's first start asks for a manual SYNC (O-2). The delay is what makes the skill worth using later: at 150× a grid-minute is only 0.4 real s, so a 1-minute auto-sync would never be worth a manual close, but 4 grid-minutes of a unit's output matter in RESPOND and at the peak.

**The scope is offered when it matters (decided in §9 Q-4).** Routine starts sync themselves quietly. When a unit reaches full speed while RESPOND is open (K-16), while the gauge reads TIGHT or worse (H-4), or inside the evening peak window (D-1), the procedure bay lights, the SYNC key glows, and Marg says one line ("Scope's yours if you want it."). Ignoring it is fine; auto-sync still runs. The debrief counts clean manual closes ("CLEAN CLOSES 2/2"). HAND mode (K-2) has no auto-synchroniser: every close is manual.

On-screen label: "Real operators aim for 15–30 s per turn and close within ±10°. Ours turns faster. Most plants synchronise automatically, at the station, not in the control room."

*Accept:* the outcome depends only on angle, direction and slip; AUTO is always clean; the scope is offered only under the three high-stakes conditions above, and never more than 3 times per day; in playtests, ≥70% of manual closes are clean once slip is ≤0.15 Hz; the returning-player proxy meets ≥1 SYNC that matters (a clean manual close removes a red or amber column that auto-sync would leave) on ≥80% of dates (with D-8's RESTORE target).

**K-13 — Restore district by district.** UFLS stays automatic; restoring customers becomes a player action. This replaces the hidden rule (X-19).
- Each shed district appears as a feeder breaker in the procedure bay and as a dark area on the map.
- **Cold-load pickup.** The MW shown includes the surge when a district comes back: 1.5× for districts dark more than 10 grid-minutes, decaying over 10 grid-minutes.
- **RESTORE PERMISSIVE lamp.** It lights when frequency ≥49.9 Hz, with at least 5 grid-minutes since the last restore. This mirrors AEMO's permission and the networks restoring small groups every few minutes.
- **Preview.** Selecting a district shows its predicted nadir (K-10 colours): a RESTORE PREVIEW of picking up its cold-load MW on the TRIP PREVIEW engine. The close is refused unless that nadir is ≥49.5 Hz plus the 0.05 Hz preview margin (tuning pass: it replaced "R5 ≥ 1.2 × the district's cold-load MW", because R5 is 5-minute headroom, not primary response, and passed restores whose surge set off UFLS again). The bench (Phase 0.2) enables a district's RESTORE button only when the lamp and its preview both allow it.
- **Closing.** Closing is in FOCUS 1×, and the load returns through real-time physics. If frequency then sits below 49.0 Hz for 0.3 s, UFLS trips again.
- **Size.** A district is ~3% of demand (150–250 MW), so one UFLS stage is two districts. From Phase 2, the rooftop reconnect delay applies (P-12).
- **When it happens.** After UFLS or directed shedding, and in the Act I restore task that D-8 puts on most dates, so good players practise it too.

*Accept:* there is no automatic restore; in lab trials, a green prediction gives an actual nadir ≥49.5 Hz 100% of the time; a 250 MW district (cold-load factor 1.0) at 19 GW·s with 500 MW of FFR shows green. The desk lab measured 49.73 Hz with ≥200 MW of FFR, but that used the legacy battery (§4.6); a quick re-run with H-8 values gives 49.39–49.54 Hz with 200 MW and 49.63–49.66 Hz with 500 MW, depending on governor headroom. Re-measure in `sim/physics.js`.

#### The trip moment

**K-14 — (merged into H-8).** The one physics engine is specified as H-8, because Phase 0 needs it.

**K-15 — The watch.** On any contingency, the watch plays. A contingency is a unit, link or load trip >50 MW, which is the FOS event threshold.
- The desk locks. Only ACK, SILENCE, volume, pause and skip work.
- A vignette appears, and a stopwatch reading "T+0.00 s ×0.15" replaces the clock.
- The first 30 physical seconds play live, at variable speed (it is the running sim slowed down, not a recording):

| Version | Schedule | Real time |
|---|---|---|
| Full | 0–3 s at 0.15× (20 real s); 3–10 s at 1× (7 real s); 10–30 s at 10× (2 real s) | ~29 s |
| Compact | 0.5× / 2× / 20× | ~11 s |

- The grid clock advances exactly the true 30 seconds, e.g. 18:40:00 → 18:40:30.

Five beats, with captions of ≤15 words in the full version. The beat times come from the legacy-battery prototype (§4.6) and are re-measured under H-8; the H-8 re-run moves the nadir to about 2 s, still inside the 0.15× segment. The order is the physical one, battery before governors (J-25):
1. **Inertia** (0–0.3 s). Orange "INERTIA" fills the hole. Rotor icons slow; the hum sags.
2. **Battery** (0.3–1.5 s). The dial swings to DISCHARGE; a violet segment grows.
3. **Governors** (1–10 s). Needles creep up; a green segment grows. The nadir pin shows its margin above UFLS.
4. **UFLS** (only below 49.0 Hz). Districts go dark one by one, each with a clack panned to its map position. From Phase 2, rooftop panels in those suburbs switch off too.
5. **Settle** (10–30 s). Frequency parks below 50 Hz because governor droop holds it there.

When each version plays:
- The full version plays the first time ever, and on anything new (first UFLS, first HIGH RoCoF).
- Otherwise the compact version plays.
- Esc skips once the full version has been seen.
- Viewing or skipping never changes the outcome (C-7).

*Accept:* the same seed and state give an identical trace; no input changes physics during the watch; the watch can be re-watched from the debrief; in playtests, ≥3/5 players recall the order of the beats.

**K-16 — Respond.** An end card of ≤4 lines shows:
- the nadir against the standard (contained within 49.5–50.5 Hz; back to 49.85–50.15 Hz within 5 minutes);
- the MW each source caught;
- the problem, stated plainly, e.g. "N-1 INSECURE: 610 MW short, 30:00".

The card has **no action buttons**: it states the problem, and the desk controls that could answer it light up, as in L-9 (e.g. GT·A's START guard, the battery dial, the restore bay). A card that offered the fix would be a *Grid Operator* decision card, and it would state the plan, which Marg never does (O-3).

The card **holds the clock** until the player presses Enter or touches a desk control. There is no timer on reading it. The desk then unlocks with a chime, and RESPOND runs per D-5. Apart from first-shift coaching, this is the only hold on the clock (§7).

*Accept:* every number on the card equals the corresponding trace value; the clock does not advance while the card is open; the card offers no dispatch action (UI test); the lit set equals L-9's glow set for the gap the trip opened, plus the restore bay if districts are dark.

#### Layout

**K-17 — Half and half.** The budget is by viewport, not screen; §4.2 draws the 1280×600 floor:
- The header is 32 px (40 px in the wide layout).
- Desk height = max(300 px, 50% of the viewport height below the header). Every desk panel is designed to work at 300 px.
- The map takes the rest: 268 px at 1280×600, 344 px at 1280×720.
- Breakpoints: compact below 1600 px, wide at 1600 px and above.
- The header always shows the clock, the speed badge (F-5), the three live scorecard chips and pause.

*Accept:* no horizontal scroll at 1280 px; every control is at least 24×24 px (WCAG 2.5.8); at a 1280×600 viewport the whole desk is visible and the map is ≥260 px tall.

**K-18 — Removed or moved.**

| Today | Becomes |
|---|---|
| One-asset dock `#selP`, fleet strip `#strip` | Lever bank |
| 10 permanent map labels | Hover, focus or alarm only (G-2) |
| P&L and spot-price chips | Scorecard chips; price moves to the Live Stack |
| RESERVE chip | N-1 gauge |
| INERTIA chip | Frequency dial |
| Demand chart | Live Stack |
| Market panel | Live Stack tooltip |
| Event log | Tray + LOG drawer |
| Square-wave `beep()` | K-21 alarm hierarchy |
| CRT scanline overlay | Optional (K-22) |

*Accept:* none of the removed elements' IDs remain in `next.html`.

#### Sound

All sound is synthesised with WebAudio; there are no samples.

**K-19 — Mains hum.**
- Transformers hum at twice grid frequency, so the hum has partials at k × 2f, for k = 1…4.
- A quiet reference tone sits at k × 100 Hz. Each partial beats against it at the true rate, 2k·|Δf|. At 49.75 Hz, the 400 Hz partial wobbles twice a second.
- Default level −30 dBFS.

*Accept:* beat rates are within 2% of 2k·|Δf|.

**K-20 — Foley.**
- Levers: an 80 Hz detent thump, a drag ratchet of ≤20 ticks/s.
- Controls: gate thunk, key turn, button.
- Breaker close: a bandpassed noise transient plus inharmonic partials near 0.9, 1.4 and 2.2 kHz, decaying over 120 ms, plus a thud.
- Out-of-phase growl: 60–90 Hz, lasting 1.5 s.
- Turbine spool up/down: ≤3 s.
- UFLS clacks, panned by district.

*Accept:* ≤32 simultaneous audio nodes.

**K-21 — Alarm hierarchy.**

| Priority | Alarms | Sound |
|---|---|---|
| P1 | UFLS, unit trip, frequency outside 49.5–50.5 Hz (the UNDER/OVER FREQ tiles escalated, §9.1 Q-11), N-1 insecure at the peak | Two-tone horn every 4 s until SILENCE |
| P2 | Warnings | One chime; repeated only if still unacknowledged after 60 s |
| P3 | Information cards | A soft tick |

During the watch, horns are held; any still unacknowledged sound once afterwards.

*Accept:* a unit test maps every tile to one priority.

**K-22 — Settings and accessibility.**
- Volume sliders: master, hum, effects, alarms. Shift+M mutes.
- Reduced motion (defaults from `prefers-reduced-motion`): no shake, no flashing faster than 3 Hz (WCAG 2.3.1), no camera zoom in the watch.
- Reduced effects: no CRT overlay, no hum.
- Status is never colour-only: every lamp and tile carries a glyph or letter.
- Audio starts on the first gesture.
- Settings persist under `gridwatch:v4:settings` (try/catch).

*Accept:* with reduced motion on, nothing flashes faster than 3 Hz; a greyscale screenshot preserves every status distinction.

**K-23 — Keyboard and mouse parity.**
- Controls are DOM elements with ARIA roles (slider, switch, button). Canvas is used only for the dial, the synchroscope and the map.
- Key readouts are mirrored in an aria-live region.
- Nothing is drag-only or hover-only.

| Key | Action |
|---|---|
| 1–8 | Focus COAL / CCGT / GT·A / GT·B / GT·C / hydro / battery / tie |
| ↑ ↓ (Shift = fine; PgUp/PgDn = next detent) | Move the focused control |
| S S / X X | Start / stop (guarded) |
| P | Rejoin plan (HAND mode only) |
| [ ] · C · U | Slip lower/raise · close breaker · auto-sync |
| R, ←/→, Enter | Restore bay, choose district, close |
| A · Shift+A | Acknowledge · silence |
| D · E (hold) | Industrial DR · diesel key |
| T · M · L · Tab | Trip preview · tray · Live Stack (focus; again to expand over the map, L-4) · map |
| Space · Esc · F (hold) | Pause · skip the watch (after the first full one) · fast |

*Accept:* a keyboard-only playtester completes a daily.

#### Live Stack

**L-0 — Pre-dispatch.** The stack never starts empty. At 04:30 it is pre-filled with a merit-order schedule for the P50 forecast, which obeys start times, ramps and minimum up/down times. This is realistic: NEM generators self-commit against AEMO's pre-dispatch schedule.
- The pre-dispatch deliberately ignores N-1, warned hazards, forecast drift after 04:30 and the minimum-generation problem at noon. The player's job is to fix where it is wrong. It is computed once, not every 30 minutes as AEMO's is (§8.2).
- It defines the difficulty floor: what happens with no input at all.
- Par starts from the same plan (S-4).

*Accept:* on every generated daily, AGC plus pre-dispatch with no input never ends in F (system black), and the median grade over the calendar is C or D; the plan is identical for the same seed and `SIM_VERSION`.

**L-1 — Window.**
- Covers now −30 min to now +4.5 h, in 5-minute columns (54 in the future).
- Fixed 0–9,000 MW axis.
- Refreshes every 5 grid-minutes.
- 4.5 hours is the slowest lever's lead time: a coal machine's 2-h start plus its 137-min climb from MIN (240 MW) to 650 MW at 3 MW/min, which is 4 h 17 min.

*Accept:* 54 future columns; the y-scale never rescales; render ≤4 ms at 1280 px.

*Measured (Phase 2a):* with the rooftop hatch and the blue columns drawn (L-2, L-5), a full recompute and redraw costs 1.2–1.5 ms (p95, script time on a stand-in canvas, at the floor and expanded).

**L-2 — Skyline and uncertainty.**
- The P50 (median) forecast of operational demand is drawn as the skyline, with a P10–P90 band. The face calls the band "LIKELY RANGE"; "P10/P90" sits behind "?".
- The band comes from the seeded weather "truth" plus an error that shrinks as lead time falls to 0.
- Starting σ values: demand 0.6% at 5 min rising to 2.5% at 4 h.
- **Rooftop PV forecast error: measured, not chosen (Phase 2a).** The rooftop part of the band is derived from the same cloud process that makes the weather (P-2), as the demand part is from its noise. Measured on `desk`, the error of the rooftop forecast has σ 2.9% at 1 h and 3.1% at 4 h. That replaces the starting values written here before, "5% at 1 h rising to 15% at 4 h". Why they could not stand: a sky that keeps returning to its average cannot drift 15% in four hours. Six independent suburb skies would have averaged out to 1.7%, which is why the suburbs share one regional sky (§9.1 Q-23). The "×2.5 while a front is forecast" waits for fronts over the suburbs (D-8, slice 2c).
- From Phase 2, a faint underlying-demand silhouette sits above the skyline, and the gap is hatched sun-yellow as "rooftop solar". **Built (Phase 2a):** the silhouette is operational demand plus rooftop output, so the hatch is exactly the bite rooftop solar takes; it equals underlying demand except while the potline is off (P-1). Past columns show it too, and the expanded stack carries the word ROOFTOP.
- On a first shift the stack shows only the skyline, the layers and red gaps. The band, amber, blue, the silhouette and the H-4 line appear from the second daily (O-3). **In Phase 2a they are shown always**: the first-shift face arrives with onboarding (slice 2e).

*Accept:* over 100 seeds, realised demand falls inside P10–P90 in 80 ± 5% of 15-min intervals at both 1 h and 4 h leads; the band width is 0 at lead 0.

*Measured (Phase 2a, `desk`, seeds 1–200):* realised operational demand falls inside P10–P90 in 80.7% of 15-minute intervals at a 1-h lead (16,800 intervals) and 79.9% at 4 h (14,400). By day type at 4 h: MILD 80.6%, HOT 81.5%, HEATWAVE 73.9%, because a heatwave is not in the forecast before its announcement. With rooftop PV the band is no longer widest at the longest lead: it is widest where the sun is high. The rooftop forecast reads slightly high (0.6% at 1 h, 1.1% at 4 h), because the sky cannot be clearer than clear.

**L-3 — Layers.**
- Order comes from the P-6 cost table.
- Hydro sits at its water value.
- Wind and utility solar are at the bottom, with curtailment hatched.
- Exports and battery charging are drawn *above* the skyline, as extra load.
- Colours match the map and the levers.

*Accept:* a layer moves position only when its cost rank changes; every layer's tooltip shows MW, ramp, start time and cost.

**L-4 — Drag to schedule ("arrive-by" keyframes).**
- Dragging a future edge creates a keyframe (time, MW). The ramp ends at that time and runs at the unit's maximum ramp rate. Dragging the start handle makes it gentler.
- For an offline unit, the ghost starts at a vertical "earliest start" line (now + start time). Scheduling it books START at (sync time − start time).
- Dragging a layer to 0 schedules a ramp down to minimum, then a stop.
- Water and battery energy limits turn the layer striped.
- **Precision at small sizes.** At the 1280×600 floor a column is 5.6 px and a pixel is about 55 MW (§4.2). Drag handles have 24-px hit areas whatever the column width, and drops snap to 15 minutes and 50 MW. **L** expands the stack over the map (about 1248×420 at the floor) and back; the clock keeps running.

*Accept:* every planned segment satisfies |ΔMW|/Δt ≤ ramp; no layer begins before its earliest-start line; an infeasible drop shows an earliest-arrival ghost instead of being accepted silently; every handle's hit area is ≥24×24 px at 1280×600; drops land on the 15-min / 50-MW grid; there is a keyboard route (a number selects a layer, arrows move one snap step: 15 min or 50 MW).

**L-5 — Gaps.**
- Red where scheduled supply < P50.
- Amber where scheduled supply < P90.
- **Blue where power will be spilled** (decided in Phase 2a, §9.1 Q-29). This is the belly. Blue is the dispatch's own sum for the automatic cut (P-9), run on the forecast:
  - projected spill = committed units at their minimums (and the reserve diesel if it is running) + forecast wind and utility solar after the manual LIMIT + demand response in force + a battery DISCHARGE order − (P50 demand + export room + a battery CHARGE order);
  - a column is blue where that is more than 50 MW;
  - export room is the tie's export limit in that column, and 0 while the tie is tripped;
  - a battery order counts as the player set it, for the energy behind it, not AGC's trim.
- Blue is its own mark with its own pattern, glyph and the word SURPLUS (K-22), never a kind of gap. Hovering a blue column says how many MW will be spilled and what can be done: stop a unit, or charge the battery. A negative price is shown in its own colour with the word SPILL.
- An earlier draft said "blue where the inflexible floor exceeds P10", with scheduled imports in the floor. That over-reported: it counted price-taking imports and turned 10 columns blue at a price of $26 with nothing spilled. Blue now means "this will be wasted", which is the thing the player can act on. It is computed from P50, not P10, in Phase 2a.
- An optional dashed line shows the H-4 requirement.
- On a first shift, only red is shown (L-2). In Phase 2a blue is shown always, until onboarding (slice 2e).

*Accept:* recomputed every column; after a trip, red appears in the first rendered frame; from Phase 2: on the reference mild-weekend seed with no player action, blue covers 11:00–14:00. The reference seed is to be named at stage C of Phase 2a.

*Measured (Phase 2a, `tests/planview.test.js`):* with the weather that then happened put in place of the forecast, the projected spill matches what the sim cut within a median 0.1 MW; once a spill has settled the worst column is 1.0 MW out (191 columns), and in the first ten minutes of a spill up to 59 MW (37 columns). With its own forecast it is within about 50 MW at 5 to 15 minutes ahead (median), and the rest is forecast error in wind, sun and demand. Before demand response and a DISCHARGE order were counted (§9.1 Q-35) the projection read 350 and 200 MW low in exactly those cases.

**L-6 — Levers and stack agree.** The desk is the instrument; the stack is its plan view.
- A lever's position equals its layer's now-edge.
- A scheduled move drives the lever with a servo sound.
- **AGC mode:** moving a lever writes that unit's next arrive-by keyframe, at the earliest time its ramp (and, if it is off, its start time) allows. The stack draws the new ramp at once. Later keyframes stay. There is no MANUAL state and nothing to resume.
- **HAND mode only:** grabbing a lever sets output directly and suspends that unit's plan up to its next keyframe (hatched "MANUAL"). Releasing it offers RESUME PLAN or KEEP (re-anchor).

*Accept:* lever and edge agree within 1 px; in AGC mode a lever move creates exactly one keyframe, at the earliest ramp-feasible time; a manual input never silently deletes a keyframe.

**L-7 — Live, never modal.**
- Everything works at speed and while paused. There is no planning screen and no "run" button.
- During the watch, the tripped layer tears away and the stack is read-only.

*Accept:* a UI audit finds no phase switch; the watch shows the tear.

**L-8 — AGC relation.**
- The plan provides base points. AGC moves units only inside a halo drawn on their layers.
- When forecast error exceeds the AGC band, frequency drifts, which the red and amber columns predicted.

*Accept:* with AGC on and the plan covering P50, frequency stays within 49.85–50.15 Hz whenever |realised − P50| < total AGC band.

**L-9 — Hints, never autopilot.** Hovering a red gap makes the units that could arrive in time glow and greys the rest.

*Accept:* the glow set is exactly the units whose earliest arrival is at or before the gap's start; apart from the 04:30 pre-dispatch (L-0) and Marg's covered controls on a first shift (O-3), no control fills gaps automatically. (The Phase 0.2 bench has a RE-PLAN control, par's re-dispatch on request; whether the Live Stack keeps it is the owner decision in S-4.)

#### Map

These absorb the useful parts of v3's L- series.

**G-1 — Map frame.**
- The map fills the top half at an integer pixel scale.
- Terrain reaches the frame edges, with no sky below the ground.
- No building sits outside the terrain (X-37, X-38).
- 60 fps with eased animation.
- The map reads `observe()` only and uses the `fx` stream.

*Accept:* the scale is an integer at 1280×600, 1280×720 and 1920×1080 viewports; a bounding-box test finds no building outside the terrain; a lint test finds that `render/` never imports sim internals.

**G-2 — Readable silhouettes, quiet labels.**
- Each technology is recognisable without a label.
- There are at most 3 labels at rest; labels appear on hover, focus or alarm.
- Hovering a plant lights its lever, and the reverse.

*Accept:* count ≤3 labels at rest; in a labels-off screenshot, a first-time viewer names every asset type (playtest).

**G-3 — Sun, sky and the duck.**
- Sky brightness and rooftop glint follow the P-2 rooftop curve (the utility-solar curve before Phase 2).
- Dusk aligns with the evening neck.
- **Built (Phase 2a): panels and glint.** Every suburb's roofs carry panels in proportion to its rooftop MW: 200 panels, one per 25 MW (Solstice Rise 50, Old Hazelton 18, Redgum Flats 40, Harbourside 10, Tallowood Heights 46, Saltbush Bay 36). The classic scenario, with no rooftop PV, shows none. Each suburb's panels glint in proportion to its present output over its capacity, so a cloudy suburb is dimmer, and the glint is graded by the daylight. A dark district shows no panels; a relit one's panels stay still until its inverters start to ramp back (P-12). Under reduced motion the glint is a still pattern (K-22). The map's text alternative says the rooftop MW. Night windows follow underlying demand.
- **Two sunsets, stated (§9.1 Q-37).** The map's sun disc sets at 18:48. The scenario's sunset, where the P-2 rooftop curve ends, is 19:48. The map's daylight, and with it the glint, reaches zero at 19:48, so what follows the sun on the map follows the light, not the disc. The disc was tried at 19:48 and put back: it sat on the horizon under a starry sky, because the stars are out from about 19:00, and moving the whole light an hour later would take dusk off the evening neck.

*Accept:* at 18:48 the sky is in sunset and rooftop output is ≤500 MW.

*Measured (Phase 2a):* at 18:48 the sky reads "sunset" and clear-sky rooftop output is 385.7 MW (P-2). The map's frame costs 0.06 ms (p95, script time on a stand-in canvas) at a mild noon with the glint on. Seen as pixels on `next.html?seed=1&debug` at 12:30, 18:48, 19:42 and 21:00 (`tools/shot-receiver.mjs`).

**G-4 — Weather that reads.**
- Heat shows as haze and a bleached palette.
- A storm shows as layered cloud, rain sheets and a darker ground.
- A cloud front shows as shadows crossing suburbs at the forecast front speed.

*Accept:* in a playtest, each weather state is identifiable from one frame with no text.

**G-5 — Consequences on the map.**
- Shed districts go dark block by block, with the relay clack.
- A tripped plant shows smoke, spin-down and a red strobe until it is repaired.
- Restored districts relight.
- Rotors slow during the watch.

*Accept:* a stage-1 shed is identifiable within 1 s; a tripped plant is identifiable for its whole lockout.

**F-11 — Performance.** A `?perf` overlay reports frame costs.

*Accept:* p95 frame time ≤8 ms, of which the sim is ≤1 ms at 150× and ≤3 ms at 2,100×; the first visit transfers ≤400 KB compressed and is interactive within 1.5 s; for comparison, v2 costs 1.7 ms per frame at 10 fps.

**Measured at the end of Phase 1b** (2026-10-01, the owner's laptop). `node tools/perf.mjs`: the first visit to `next.html` is 44 files, 304 KB gzip (870 KB raw); sim p95 0.12 ms per frame at 150× and 1.5 ms at 2,100×; the view model 0.14 ms. `next.html?perf` in Chromium at 1280×600, CRUISE, 60-fps frames: frame p95 3.7 ms (p50 2.2), map 0.4 ms, desk 2.6 ms, Live Stack 1.0 ms. The Live Stack was 4.6 ms p95 (over L-1's 4 ms) until it stopped redrawing an unchanged canvas; a full redraw still costs about 3–5 ms, about once in eight frames at CRUISE. Not measured: these are script times with the preview pane hidden, so the browser's own paint is not in them, and "interactive within 1.5 s" was not timed. The overlay marks each line OK or OVER.

---

### Phase 2 — The 5-minute day

**Ships:** `next.html` plays the 5-minute day on a fixed list of gate-passed seeds, with rooftop PV, the belly and the first city levers, coaching and debrief. This is the playtest link. Rooftop PV comes before gate 1 because Act II, the belly crisis (D-8), the belly introductions (O-3) and the par tuning (S-12, Q-3) all depend on it: without PV, minimum generation never binds (X-18), and gate 1 would test a dead Act II.

Phase 2 is delivered in five slices. Each is merged into `next.html` when it works, and playtest gate 1 follows the last:

| Slice | Holds | State |
|---|---|---|
| **2a — The belly** | Rooftop PV in the sim (P-1, P-2); day types (P-3); MSL notices (P-4); a midday price that goes negative (P-9); UFLS and restore on net load (P-12); par's belly rules that need no city lever (S-14 rules 2–4); S-12 measured on the game's day. All of it on `next.html`: the rooftop bite and the spill on the Live Stack (L-2, L-5), glinting suburbs (G-3), MSL notices, and an objective line that gives the player an afternoon and cost decision (§9.1 Q-18's open gap; Q-28) | **Built** on `next.html` (2026-10-03, `v4-core-2a.1`): the sim, par, the view and the objective line |
| **2b — The city levers** | U-1–U-4, U-6, S-14 rules 1 and 5 | To come |
| **2c — The day** | D-1, D-2, D-4–D-11 | To come |
| **2d — Grade and debrief** | S-5–S-9, D-20–D-25, L-10 | To come |
| **2e — Briefing and onboarding** | D-3, D-7, O-1–O-6 | To come |

The requirement entries keep their IDs and their order. Where a slice has delivered one, a "*Built (Phase 2a)*" or "*Measured (Phase 2a)*" note says what was built and what was measured. Slice 2a's decisions are §9.1 Q-19–Q-37; its contract and its records are `desk/README.md` §18–§26.

Two scenarios carry the game's day from 2a on: `desk` (a weekday) and `desk-weekend`. Both have rooftop PV and day types. The `classic` scenario keeps no rooftop PV and is the regression anchor (Q-19), so a "Phase 2a" figure says which scenario it was measured on.

**D-1 — Four acts, no planning form.**

| Act | Grid time |
|---|---|
| I, Morning ramp | 04:30–09:00 |
| II, The belly | 09:00–14:30 |
| III, Neck and peak | 14:30–21:00 |
| Night roll and verdict | 21:00–04:00 |

All input happens on the desk or the map, while the clock runs or is paused.

*Accept:* no screen between the briefing and the verdict accepts dispatch input except the desk and the map.

**D-2 — Variable clock profile.** Speeds are in grid-minutes per real second; today's build runs at 2 (120×).

| Segment | Grid time | Speed (×) | Real s | CCGT start (45 min), real s | Coal hot start (120 min), real s |
|---|---|---|---|---|---|
| Pre-dawn | 04:30–06:00 | 9 (540×) | 10 | 5 | 13 |
| Morning ramp | 06:00–09:00 | 4.5 (270×) | 40 | 10 | 27 |
| Belly onset | 09:00–11:00 | 8 (480×) | 15 | 6 | 15 |
| Belly | 11:00–14:30 | 5 (300×) | 42 | 9 | 24 |
| Neck | 14:30–16:30 | 4 (240×) | 30 | 11 | 30 |
| Peak | 16:30–20:00 | 2.5 (150×) | 84 | 18 | 48 |
| Release | 20:00–21:00 | 5 (300×) | 12 | 9 | 24 |
| Night roll | 21:00–04:00 | 35 (2,100×) | 12 | – | – |

- The grid clock totals 245 s. Speed changes ease in over 2 s.
- The Live Stack's 4.5-h window is ~108 real s of warning at the peak.
- Estimated session, from the link opening to SHARE (arithmetic, not yet measured):

| | Returning player, one trip | First shift (§4.1) |
|---|---|---|
| Title and briefing | 5 + ~10 s | 5 + 15 s |
| Orientation and 5 introductions (8 s each, O-3) | — | 48 s |
| Grid clock (D-2 profile) | 245 s | 245 s |
| SYNC and RESTORE at FOCUS 1× | ~13 s | ~6 s beyond their introductions |
| Watch | 10.5 s (compact) | 29 s (full) |
| Respond card and RESPOND at 30× | ~3 + 0–8 s | ~8 + 0–8 s |
| **Verdict at** | **≈4:47–4:55** | **≈5:56–6:04** |
| Debrief (≤45 s, D-25) | 45 s | 45 s |
| **SHARE at** | **≈5:32–5:40** | **≈6:41–6:49** |

A second unwarned trip adds about 14–22 s. Earlier drafts quoted ≈5:00 and ≈6:00; those were to the verdict and left out the debrief.

*Accept:* the profile integrates to 245 ± 3 s; a scripted run that presses only TAKE THE DESK and Enter on each respond card goes from TAKE THE DESK to the verdict within ±5 s of 245 s + the watch time + the RESPOND time at 30×; link opened to SHARE takes ≤6:50 on the scripted §4.1 first shift and ≤6:00 on a scripted one-trip returning-player day; gate 1 records the testers' actual times.

**D-3 — Briefing card.**
- ≤20 s and ≤60 words.
- One plain goal line: "Line up enough power before the city needs it; the machines handle the seconds." With AGC on, "Fifty hertz is the whole job" would mislead, so that line is kept for HAND-mode briefings.
- A 24-h forecast skyline: operational demand, the rooftop-PV bite, and forecast wind.
- One "watch for" line naming only warned hazards.
- One supervisor line.
- The HAND-mode option (D-7).
- One button, TAKE THE DESK.

*Accept:* exactly one required click; an unwarned contingency is never named or hinted at; the goal line is present in AGC mode.

**D-4 — Two time domains, one clock.** This restates C-7 for play.
- The watch, SYNC and restores run in physical seconds while grid time advances at the same rate, so a 30-s watch is 0.5 grid-minutes.
- Ramps and starts continue at their true rates. Nothing freezes, so nothing can be exploited.
- Pause is free, so slowing down confers no advantage.

*Accept:* a trip watch advances the grid clock by 0.50 ± 0.01 min; the outcome is identical whether the watch is viewed or skipped.

**D-5 — Contingency pacing: watch, then respond.**
1. The watch plays (K-15).
2. The respond card holds the clock (K-16).
3. The RESPOND window opens: 30 grid-minutes from the trip. At its start the clock runs at 30× until frequency is back in the normal band, or for at most 5 grid-minutes (≤10 real s).
4. Play then returns to the profile speed for the rest of the window.

The N-1 gauge shows two countdowns: "normal band 5:00" (FOS) and "secure 30:00" (the NEM rule to return to a secure state within 30 minutes). No other unwarned contingency may land inside the 30-minute window (D-8).

*Accept:* the RESPOND window is exactly 30 grid-minutes; both countdowns are visible; no second unwarned event lands inside it on 2,000 dates.

**D-6 — Speed control.**
- Space pauses; pausing is unlimited and free.
- Holding F runs at 3× the profile speed. It releases on any new warning or alarm, and is disabled during WATCH and RESPOND.

*Accept:* one input log replayed at 1×, at 3× and with 50 random pauses gives an identical end-state hash.

**D-7 — Hand-flying mode.**
- Chosen on the briefing card and locked for the day.
- AGC is off, and every profile speed is halved (a 490-s grid clock).
- The share card is tagged "hand-flown". It is never the default.

*Accept:* the HAND tag appears on the card and in history, and AGC never acts in HAND mode (test).

**D-8 — Event director.** It merges the rules draft's S-13. Events are data (`{t, type, params}`) pre-rolled per date from the `ext` stream.

(a) **Temperature class.** HEATWAVE 15%, HOT 30%, MILD 55%.
- Weekend demand comes from the calendar (×0.92 on Sat and Sun; P-3).
- Weather overlays: storm 25%, wind drought 20%.

(b) **One designed crisis per act.**
- Act I: a warned constraint (a tie derate, a delayed start or late fog). On ≥80% of dates Act I also opens with **load to restore**, so that RESTORE (K-13) is played even by players who never shed: two districts left dark by an overnight storm, whose feeders the network reports repaired at 06:30–08:00, or the smelter asking to reconnect its 256 MW potline after an overnight trip. Labelled in §8.2.
- Act II: a belly crisis (deeper-than-forecast minimum, a warned cloud front, or an unwarned smelter or unit trip).
- Act III: the heatwave or storm if the regime has one; otherwise an unwarned trip of the largest online machine by output between 17:00 and 19:30.

(c) **Unwarned contingencies.**
- ≤2 per day, none before 09:00.
- ≥90 real s and ≥60 grid-minutes apart.
- None within 30 real s of a warned onset, and none inside a RESPOND window.

(d) **Warning leads.** The lead is at least 25 real s, integrated over the D-2 profile (pauses and FOCUS only add to it), **and** at least the start time of the resource that answers it + 2 grid-minutes. In grid time that works out at:
- cloud (10:00–14:30): 125–170 grid-minutes, depending on onset;
- storm and drought (15:00–19:00): about 63 grid-minutes in the peak, 100 at 16:30 and up to 118 at 15:00.

For example, a front crossing at 12:10 is warned at 09:30. An earlier draft said "cloud 30 grid-minutes; storm 60; drought 60", which is only 6–15 real s at those speeds.

Heatwaves and tie derates are announced at the briefing.

(e) **Timing varies by date.**
- Heat onset 12:30–14:30.
- Storm 15:30–19:00.
- Cloud 10:00–14:30.
- Drought 15:00–18:00.

*Accept:* over 2,000 dates, class and overlay shares are within ±2 points, with zero violations of (c) or (d); the returning-player proxy meets ≥1 RESTORE and ≥1 SYNC that matters (K-12) on ≥80% of dates.

The day lab measured, on the v4 clock, pairs <60 s apart going from 69.8% of days to 0%, and a minimum gap p10 of 92 s.

**D-9 — Solvability gate.** This merges the rules draft's S-8 and replaces the day draft's in-browser gate (§9 J-12). `tools/daily-gen.js` accepts a seed only if:
- (1) the optimistic bound (§3.2 definition, plus city flexibility at rated MW) covers operational demand at every minute; and
- (2) par sheds zero: no UFLS and no directed shedding. (Load in the Act I restore task counts on LIGHTS ON as S-1 says, for par and player alike.)

A rejected seed is replaced by the next candidate of the **same temperature class**. Heat severity is never stepped down. A seed that par cannot solve **never takes the daily slot**. It may appear only in the practice menu as a labelled "Hard day", scored against par (S-7). Practice seeds (Y-2) come from the pool that passed this gate.

*Accept:* 100% of generated dates pass; the heat share of a generated year is 15 ± 3%, or the tool reports the shortfall; 365 dates generate in ≤10 min in Node.

**D-10 — Decisions per act.** Targets for decision opportunities: Act I 3–5, Act II 5–8, Act III 8–12. Today: 0.2 / 3.2 / 3.2.

*Accept:* on ≥90% of dates, the par log plus director events and warnings has no gap longer than 40 real s between 05:30 and 21:00 (today's median gap on the v4 clock: 66 s).

**D-11 — Night roll.**
- 21:00–04:00 in 12 s.
- AGC runs, units stand down automatically, and there are no director events.
- The scorecard counts up while city windows go dark.

*Accept:* the night roll never exceeds 15 real s, and no input is required.

**L-10 — The plan comes together.**
- Past columns solidify.
- When the operational peak passes with no red column for 60 grid-minutes, a "clean ramp" chime plays.
- The debrief (and later the optional PNG card, Y-6; not the text card, §9 J-11) shows an hourly result strip: green = no gap, red = short, blue = spill.

*Accept:* the strip derives only from gap state.

**S-5 — Letter grade.** ΔU = player unserved − par unserved.

| Grade | Condition |
|---|---|
| A | ΔU ≤ 10 MWh and cost ≤ par +5% (otherwise B) |
| B | ΔU ≤ 150 MWh |
| C | ΔU ≤ 600 MWh |
| D | ΔU > 600 MWh |
| F | System black |

*Accept:* the rules-lab proxies reproduce a spread: competent ≥70% A (measured 73/100); "lean" (ignores N-1) ≤40% A; commit-everything loses A to the cost gate on ≥30% of seeds.

**S-6 — Stars and marks.**
- Each axis gets a mark against par: **PAR** (lights within 1 MWh; cost and CO₂ within ±1%), or the signed % difference.
- A ★ for each axis at par or better.
- A PERFECT badge for zero unserved.

*Accept:* the debrief, the history and the share card show identical marks.

**S-7 — Grim days.** A "Hard day" is a seed par cannot solve. It never takes the daily slot (D-9, OD-10); it appears only in the practice menu (Y-2, from Phase 4), labelled as such, and never touches the streak or the share card. On a Hard day the card says "PAR: X MWh — no plan kept every light on today". Matching par within 10 MWh earns an A, and beating par earns the ★.

*Accept:* the text appears only when par unserved > 0; no Hard day appears in `content/dailies.js`.

**S-8 — (merged into D-9).** Only solvable seeds become dailies.

**S-9 — Carbon is a star, not part of the letter.** In the daily, CO₂ carries a star only, because the player's carbon levers move it by about 6% at 13% extra cost. It joins the letter in WEEK mode (W-4).

*Accept:* changing only CO₂ never changes the letter.

**S-13 — (merged into D-8).** Event spacing and warning leads.

**D-20 — Scorecard against par.** Three rows:
- LIGHTS ON (MWh dark);
- CUSTOMER COST (¢/kWh);
- CO₂ (t/MWh; the total in kt beside it).

Each row shows the value, par and the S-6 mark. The letter heads the card. The community cost at VCR is shown as a footnote only (H-12).

*Accept:* the marks are identical to the share card.

**D-21 — The moment.** Chosen automatically: the first shed if there was one; otherwise the largest frequency deviation; otherwise the lowest N-1 margin. It shows:
- the time, a map zoom and a ±3-minute trace;
- a "what caught it" MW breakdown at the nadir;
- the player's headroom, inertia and battery charge against par's at the same minute.

*Accept:* every run yields one moment with ≥3 live numbers.

**D-24 — "This really happened" card.** At most one per debrief, chosen by trigger. Each card carries its source and one line on what GRIDWATCH simplifies.

| Trigger | Card | Source |
|---|---|---|
| Battery helps in a trip | Loy Yang A3, 14 Dec 2017: ~560 MW lost; Hornsdale responded fast, but with only ~7 MW; coal governors did most of the work. (The popular "responded within milliseconds" story is disputed by the cited article.) | [WattClarity](https://wattclarity.com/articles/2018/03/fcas-in-action-what-happens-when-a-generator-trips/) |
| UFLS operates | Callide C, 25 May 2021: ~2,300 MW tripped, 48.53 Hz, UFLS shed 1,308 MW | [AEMO report](https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2021/trip-of-multiple-generators-and-lines-in-qld-and-associated-under-frequency-load-shedding.pdf) |
| Backstop or minimum-demand crisis | SA's first use of the rooftop-solar backstop, 14 Mar 2021 | [SAPN](https://www.sapowernetworks.com.au/your-power/quality-reliability/solar-curtailment-for-minimum-system-demand-events/) |
| Negative prices | SA negative in 48.4% of intervals, Q4 2025 | [AEMO QED Q4 2025](https://www.aemo.com.au/-/media/files/major-publications/qed/2025/qed-q4-2025.pdf) |
| System black (storm) | SA black system, 28 Sep 2016: RoCoF ~6 Hz/s outran UFLS | [AEMO](https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2017/integrated-final-report-sa-black-system-28-september-2016.pdf) |

*Accept:* every card has a source URL and a "what we simplify" line, and each is fact-checked before shipping (checklist).

**D-25 — Debrief pacing.** Readable in ≤45 s, in this order: verdict, marks, moment, counterfactual (from Phase 4), card, SHARE. On a first shift, the day's concept cards (O-4) come after SHARE.

*Accept:* a timed read-through by the owner takes ≤45 s.

**O-1 — The first shift is today's daily.**
- A visitor with no history plays today's daily with coaching.
- The result is official and shareable, tagged "first shift".
- An always-visible "I've done this before" switches coaching off and lifts every cover plate (O-3).

*Accept:* no separate tutorial stands between a shared link and the daily.

**O-2 — ≤60 s to the first real action.**

| Real time | What happens |
|---|---|
| 0–5 s | Title over the live map; the first click starts the audio |
| 5–20 s | Briefing |
| 20–28 s | Marg points out the needle, the hum and the AGC lamp (paused) |
| 28–38 s | Pre-dawn |
| ~38 s | Manual SYNC of the second CCGT unit |

*Accept:* the SYNC prompt is live within 60 s of the first click, in a scripted test and for ≥4/5 playtesters.

**O-3 — One control at a time, in context.** Strangers are nearly all first-shifters, so the first shift must not be a tutorial wall in disguise.
- **Cover plates.** A control not yet handed over sits behind a blank cover plate, and Marg runs it on the S-4 autopilot rules (lamp "AUTO — Marg"). Its Live Stack layer is drawn hatched "AUTO". The plate lifts when the control is introduced.
- **At most 5 introductions on a first shift.** The rest come on dailies 2–5, at most two per day, when the situation first calls for them.
- **Plain faces.** Controls and readouts use plain words ("SPARE IN 5 MIN", "BIGGEST RISK: COAL 3", "LIKELY RANGE"); the jargon (R5, L, LOR, RoCoF, GW·s, P10/P90) sits behind "?" (H-14).
- On a first shift, the Live Stack shows only the skyline, the layers and red gaps (L-2), and concept cards wait for the debrief (O-4).

| Control | Introduced | When |
|---|---|---|
| SYNC | Morning ramp | First shift |
| RESTORE | The Act I restore task (D-8), or the first UFLS | First shift |
| Live Stack, with the GT levers it drives | First forecast gap | First shift |
| Suburb card (soak at noon, pre-cool in the evening) | Belly | First shift |
| Hydro wheel | Neck | First shift |
| Coal and CCGT levers (coal to minimum) | Minimum generation binds | Dailies 2–5 |
| Battery dial | Belly | Dailies 2–5 |
| Tie knob | A tie notice on the briefing | Dailies 2–5 |
| Diesel key and DR button | First projected shortfall | Dailies 2–5 |
| ACK and SILENCE | First alarm | Dailies 2–5 (Marg acknowledges until then) |

- At most one introduction per 20 real s.
- Each pauses the clock for ≤8 s, with one line of ≤20 words.
- Marg never states the optimal plan.

*Accept:* no introduction repeats, and none plays during a watch; a first shift has ≤5 introductions; every covered control is run by the S-4 rules until its plate lifts; no face on the first-shift desk carries an R5, L, LOR, RoCoF or P10/P90 label (UI audit).

**O-4 — Concept cards.** Each appears the first time its event happens: ≤60 words, with one number from the player's own run. On a first shift they are held for the debrief and shown after SHARE; on later days they are shown at the start of RESPOND or on pause. All can be re-read in the manual drawer.

| Card | Trigger |
|---|---|
| "What just caught the fall?" | First trip |
| "Why the needle?" | First SYNC |
| "Where did 2 GW of demand go?" | Belly |
| "Why pay to generate?" | First negative price |
| "Why can't coal just switch off?" | Coal at minimum |
| "Who switched off the suburbs?" | First UFLS |
| "A power station made of houses" | First VPP call |

*Accept:* each card has a live-number slot filled from the run.

**O-5 — "Why?" on every message.** Each tray card and alarm has a "why?" naming up to 3 contributors, with MW taken from the sim at that tick. For example: "49.91 Hz: supply 120 MW short. Demand +340 MW in 10 min (sun down, people home); CCGT still ramping (+35 MW/min); headroom 610 MW."

*Accept:* 100% of message types have a template with ≥1 live number.

**O-6 — Supervisor voice.** Marg, 31 years on the desk. Dry, never blames, ≤20 words per line.
- ≤25 lines on a first shift; ≤6 on later days.
- Sample lines: "Twelve o'clock. Not eleven." "Fifty hertz is the whole job. The rest is paperwork." (HAND mode only: with AGC on it misdescribes the job, D-3.)

*Accept:* a line-count test enforces both limits.

**O-7 — (moved to Playtest gate 1).**

#### Rooftop PV, the belly and the first city levers (moved from Phase 3)

These ship before playtest gate 1 (see the Phase 2 note above). Par and capacity are re-tuned here (S-12, S-14, §9 Q-3), so S-12 is tuned once against the real belly, not twice.

**P-1 — Operational = underlying − rooftop.**
- op = U(h) × heat + flex(h) − R(h, k) + noise, where k is the sky clearness (P-2).
- Every forecast, reserve calculation, price, alarm and the Live Stack uses operational demand.
- **As built (Phase 2a):** operational = underlying − rooftop − the smelter's missing load. Underlying demand counts the 256-MW potline as running, so while the potline is off, or ramping back, its missing MW come off: `demandMW = underlyingMW − rooftopMW − (256 − the potline's present load)`. Demand is sampled once each grid second, so the identity holds per grid second. Rooftop here means "as if every inverter were connected"; the panels of a dark district are handled in P-12. flex is 0 until the city levers arrive (slice 2b).
- The debrief plots both curves (deferred to slice 2d, with the debrief).

*Accept:* the identity holds every grid second, smelter term included, and the harness exposes U, R and op.

*Measured (Phase 2a, `tests/rooftop.test.js`):* on `desk` seed 8 the identity holds on 86,400 of 86,400 grid seconds, through a potline trip (2,700 s off, then its return ramp), with a worst error under a billionth of a MW; that run drives the weather and the events alone. Through the whole sim, `desk` seed 87 holds it every grid second from 04:00 to 11:15, across its potline trip. `observe().demand` exposes `underlyingMW`, `rooftopMW` and `nowMW` (operational), and the identity holds there too. On the classic scenario rooftop is zero and the demand the sim samples is bit-identical to the build before 2a.

**P-2 — Rooftop model.**
- Capacity 5,000 MW, 0.65 × the 7.7 GW underlying peak. That is between Victoria (~0.55) and SA (~0.9).
- Clear-sky output factor 0.70.
- Shape sin^1.5 between sunrise 06:12 and sunset 19:48 (today's `SUNRISE`/`SUNSET`, L287). These are late-summer times. Until Y-9 ships, every daily is a late-summer day (§8.2); Y-9 then takes sun times from `content/seasons.js`. The curve peaks at **solar noon, 13:00**, half way between the two sun times, not at 12:00 on the clock. It is built as a table of 15-minute points with straight lines between them, so the sim calls no sine function (§9.2 risk 5).
- ×0.92 in a heatwave (hot panels lose output), **inside the heat window only**: the hours from the heatwave's onset. The derate ramps in with the heat itself, and the forecast applies it only once the heatwave is announced. A derate from sunrise would give the heatwave away hours before its announcement (S-4, P-3).
- Per-suburb cloud, with clearness k (1 = clear sky; the legacy `cloudMu` is a clearness, so `cloudMu = 0.32` means 32% of clear-sky utility output): rooftop factor = 1 − 0.7 · (1 − k). Rooftop output is spread out, so a front bites it less than it bites a solar farm.
- **One shared sky plus a local term.** Each suburb's clearness is one slow regional sky, shared by all six suburbs, plus a small term of its own (§9.1 Q-23). Suburbs of one city share their weather; six independent skies would average each other out (L-2).
- **No cloud front over the suburbs yet.** Until the event director (D-8, slice 2c) gives fronts their 125–170-minute warning, a cloud front crosses the solar precinct only, as its notice says. A heatwave's clear sky does apply to the suburbs. Labelled in §8.2.

*Accept:* output at solar noon (13:00) under a clear sky (k = 1) is 3,500 ± 50 MW; ≤500 MW at 18:48 (the curve gives about 380 MW); a front with k = 0.32 over every suburb leaves 52% of clear-sky rooftop output. (An earlier draft said "clear-noon output", which the curve itself contradicts at 12:00; §9.1 Q-22.)

*Measured (Phase 2a, `tests/rooftop.test.js`):* 3,500.0 MW at 13:00 with k = 1 (3,360 MW at 12:00); 385.7 MW at 18:48; k = 0.32 over every suburb leaves 52.4% (1,834 of 3,500 MW). The heat derate on seed 4: factor 1 at 12:30, 0.96 at 13:00, 0.92 from 13:30.

**P-3 — Day types.** Underlying demand:

| Day type | Underlying demand |
|---|---|
| HOT | today's `DEM` curve |
| HEATWAVE | `DEM` × heat uplift (6.5%), inside the heat window |
| MILD | `DEM` − cooling, where cooling = 1,400 · clamp((T − 22)/14): about 100 MW/°C above 22 °C (unverified). T is the **hot day's** temperature at that hour, from the scenario's temperature table: a mild day is the hot day with its cooling load removed. The temperature a mild day shows on screen comes from a table of its own and is display only |

- Weekend dates multiply any type by 0.92. The factor is applied after the cooling load is removed: underlying = (`DEM` − cooling) × 0.92 × heat uplift + noise.
- Class shares are set in D-8.
- **What the player is told (Phase 2a, §9.1 Q-20).** MILD or HOT is public from 04:00, because the two differ by up to 1,400 MW and the forecast must know which. A heatwave day reads HOT until its heatwave is announced, at 10:30 as before; the director (D-8, slice 2c) moves that announcement to the briefing. Nothing the player or par can see gives the heatwave away earlier (S-4).
- **Weekends are scenario data.** The sim never reads a date (F-2). The app picks `desk-weekend` when the seed reads as a date that falls on a Saturday or Sunday, and `desk` otherwise (`scenarioForSeed`; the page boots with it). `desk-weekend` also opens with a leaner 04:00 commitment (§9.1 Q-32).

*Accept* (100 seeds, par): median minimum operational demand within ±10% of: HOT 3,400 MW; HEATWAVE 3,450 MW; MILD weekday 2,350 MW; MILD weekend 1,800 MW.

*Measured (Phase 2a; seeds 1–200, the lowest second of each day, weather and events alone; p10 / median / p90):* HOT 3,055 / 3,242 / 3,396 MW; HEATWAVE 3,078 / 3,271 / 3,420 MW; MILD weekday 2,074 / 2,202 / 2,333 MW; MILD weekend 1,620 / 1,746 / 1,880 MW. All four medians are inside their bands (3.0% to 6.3% under the targets). On par's days the medians are 3,237, 3,271, 2,202 and 1,746 MW. On `desk` the median time of the minimum is 12:10–12:45, depending on the day type. Shares over seeds 1–200: MILD 50.5%, HOT 35.0%, HEATWAVE 14.5%; over seeds 1–2,000: 54 / 31 / 15, with the same 308 heat seeds as before 2a. The cooling constants and the weekend factor stay unverified (§8.3).

**P-4 — Minimum System Load (MSL) notices.** AEMO issues these when demand is forecast too low to keep the grid secure.
- The thresholds follow AEMO's structure (AEMC MSL paper, Table 2.1): MSL3 is the security floor, and MSL2 and MSL1 sit one and two credible load contingencies above it. Our largest load risk is about 300 MW (the 256-MW potline, or losing the 300-MW midday export), so the steps are 300 MW, not Victoria's 500.
- **MSL3 = 1,000 MW** (security floor; a params value labelled "simplified"; AEMO varies real floors with the synchronous units online). It sits above Victoria's ~790 MW because our region is an electrical island (§8.2) and must keep its own synchronous plant on.
- **MSL2 = 1,300 MW**, which is also this fleet's coal + CCGT minimums (1,310 MW). **MSL1 = 1,600 MW.**
- **What the thresholds test (Phase 2a, §9.1 Q-27).** Every 5 grid-minutes the sim takes the lowest operational demand it expects: demand now, and the median (P50) forecast over the next 4.5 hours, which is the Live Stack's window (L-1). A level is reached when that minimum is at or below its threshold. It is left only when the minimum is 100 MW above the threshold, so a notice does not flicker on and off.
- **+300 MW for the hours the tie is out.** With the tie out of service the 300-MW midday export is gone, so surplus power has one place fewer to go. Each threshold is raised by 300 MW, column by column (§9.1 Q-33): the present counts while the tie is tripped, and a forecast column counts only if it falls before the tie's announced return. The column tested is the one closest to its own threshold. AEMO's real floors move with the state of the network in the same way.
- **Where the player sees it.** Every change of level is a log record that states the minimum and its time. In the game it becomes a MARKET NOTICE card in the message tray (K-9). It is never a weather news item, and there is no MSL alarm tile (K-8). The MIN GEN tile is its real-time partner: power is being spilled now (P-9). Built: the sim's records, the MARKET NOTICE cards (each says the minimum, its time and the one thing this desk can do) and the MIN GEN tile.
- **Lead time, said honestly.** A notice is issued at the first 5-minute check that finds the level. How much warning that gives depends on the cause. A tie outage raises the threshold for the hours it lasts, so its notice can come hours before the minimum. A potline trip drops demand at once, so its notice comes with the trip. An MSL1 with no contingency behind it has no lead at all: on a clear mild weekend the forecast minimum is about 1,740 MW, so reaching 1,600 MW takes demand about 150 MW under the forecast, and the forecast cannot see that coming. (An earlier draft said "each notice fires ≥2 grid-hours ahead where the forecast allows"; the measurements below show that it cannot be kept.)
- The backstop (U-7, Phase 3) unlocks only at MSL3.

*Accept:* on mild weekends, MSL1 fires on 10–30% of days and MSL2 on ≤10% (the livestack lab's mild-weekend minima, p10 / p50 / p90 = 1,351 / 1,809 / 1,959 MW, give 15% and 6%); MSL3 fires only with a noon contingency (tie or smelter trip).

*Measured (Phase 2a, mild weekends on `desk-weekend`; weather and events alone unless said):*
- **How often, with the rise applied to the whole window (as first built).** Seeds 1–200: MSL1 on 15 of 101 days (14.9%), MSL2 and MSL3 on none. Seeds 1–1,000: MSL1 on 113 of 539 days (21.0%), MSL2 on 7 (1.3%), MSL3 never.
- **How often, with the rise applied per column (as built now).** Seeds 1–1,000, measured before the change was made: MSL1 on 16.7% of days, MSL2 on 1.3%, MSL3 never. The cause of each day's first notice: a tie outage 34, a potline trip 51, neither 5. The slow test keeps seeds 1–200 in band.
- **On par's days** (seeds 1–200): MSL1 on 11 of 101 mild weekends; MSL2 and MSL3 never. On `desk` weekdays no par day reaches any level.
- **Lead** (seeds 1–1,000, whole-window rule). Tie-outage notices came a median 175 minutes before their minimum, and ≥2 hours before it on 37 of 59. But 35 of those 37 were cancelled before the minimum arrived, because the tie came back first: morning outages that ended hours before the belly. That is why the rise is now per column; measured that way, 5 of 8 early notices still stood at their minimum. Potline notices: median lead 0, at most 40 minutes. Notices with no contingency: no lead on 5 of 5.

**P-9 — The midday belly can go negative.**
- When must-run minimum load exceeds market demand, the price reaches the floor.
- When curtailed wind or solar is marginal, the price is their offer (−$20).
- CUSTOMER COST makes curtailment an opportunity cost: free energy wasted now is fuel burned later. That makes curtail vs export vs soak vs charge vs decommit a real trade-off.
- **Curtailment is automatic (Phase 2a, §9.1 Q-24).** Each grid second the dispatch adds up the surplus: the output that must run (every committed unit's minimum, and the reserve diesel while it runs), plus the wind and utility solar on offer after the player's manual LIMIT, minus market demand (P-5), with the tie flow and the battery order as they are. It holds back that much wind and solar, shared between them in proportion to their output, and releases it as the surplus goes. Power held back this way is "spilled". While there is a surplus, any lowering that AGC asks for and cannot get is spilled too, so a stale plan cannot push the grid to 52 Hz. The dispatch never moves the tie or the battery to make room: exporting is the plan's job and charging is the player's decision (OD-12), so an idle battery does not fill by itself. Spilled energy is counted (`score.spillMWh`) and shown; it is never charged for, because its cost is the fuel burned later (S-2). The stack still offers the *available* wind and solar at −$20, so curtailing never raises the price (P-5).
- With coal's 8-h minimum down time, "cycling coal" at noon really means giving up that machine for the evening peak. Minimum down time is counted from the breaker opening to the next START order (labelled in §8.2; that is 54 minutes longer for coal than counting breaker to breaker). A machine at minimum load stopped at 10:00 opens its breaker at 11:10, may be started again at 19:10 and is back at minimum load at 21:14, after the peak. A machine stopped at 05:00 from 540 MW is back at minimum load at 17:54, in time for it. So the dilemma at noon is curtail, or give up that machine for the evening. (An earlier draft said "cannot restart before 18:00 and would not reach MIN before 20:00".)

*Accept:* on mild days, negative prices last 2–6 h (the livestack proxy measured curtailment of 3.1–4.3 h/day); on hot days, ≤1 h.

*Measured (Phase 2a; par, seeds 1–200, `node tools/par.js --scenario desk | desk-weekend`; hours at a negative price, median / mean / max):*

| Day type | `desk` (weekday) | `desk-weekend` |
|---|---|---|
| MILD (target 2–6 h) | 1.68 / 1.71 / 3.44 h; inside the band on 39 of 101 days | 2.62 / 2.54 / 3.71 h; inside the band on 80 of 101 days |
| HOT (target ≤1 h) | 0.01 / 0.16 / 0.92 h; ≤1 h on 70 of 70 days | 0.24 / 0.30 / 1.12 h; ≤1 h on 69 of 70 days |
| HEATWAVE | 0.00 / 0.03 / 0.42 h | 0.01 / 0.15 / 0.70 h; ≤1 h on 29 of 29 days |
| Spilled by the automatic cut, MILD days | 299 MWh a day (mean), 870 max | 778 MWh a day (mean), 1,673 max |

**The mild-weekday target is missed:** the median is 1.68 h against 2–6 h, and only 39 of 101 mild weekdays are inside the band. Mild weekends and hot days meet theirs. It is left open for the stage C tuning of 2a, not hidden.

The cut itself, driven by hand (`tests/belly.test.js`): from a balanced 2,110-MW noon (four coal machines and two CCGT units at minimum, 1,310 MW; 400 MW of wind, 700 MW of solar; the tie exporting at its 300-MW cap; battery full), demand falling to 1,600 MW is held at 50.000 Hz with 510 MW cut and the price at −$20. The same run on the sim before the cut existed goes black at 52 Hz; before the cut, par on a rooftop stand-in went black on 16 of 24 mild weekends. An idle battery gains under 1 MWh in 30 minutes of a 500-MW surplus, and a CHARGE order of 300 MW takes exactly 300 MW off the cut.

**P-12 — UFLS and restore see net load.**
- Each UFLS block and district carries its suburb's net load (underlying − rooftop).
- At sunny noon, a block can shed little or even remove generation. In Victoria on 28 Nov 2021, net load available to UFLS fell to 26% of underlying.
- During the watch, the panels in shed suburbs switch off with the relay clack.
- A restored district's rooftop inverters reconnect only after a delay, so its full underlying load arrives first. **As built (Phase 2a):** they wait 60 s (AS/NZS 4777.2:2020, confirmed) and then ramp back over 6 minutes, 16.67% of rating a minute (the ramp value is still unverified, §8.3).
- **Two quantities, kept apart (Phase 2a, §9.1 Q-26).** The MW the relays take off is the dark districts' *net* load. At a sunny noon it can be near zero, or negative. **Unserved energy is the dark customers' own underlying load**: their rooftop goes off with the feeder, so they are without all of it. LIGHTS ON (S-1) counts that, so the score does not look better because the sun is out.
- **Blocks are static.** A UFLS block trips at its frequency whatever its flow, even when it is feeding power back. That is the weakness AEMO describes, and it is labelled in §8.2: South Australia has disarmed circuits in reverse flow since 2021.
- **Directed shedding passes over a district that is feeding back (§9.1 Q-34).** Directed shedding (H-11) and DIRECT SHED (K-7) take the next lit district in the rotation whose net load is above zero. Only when no lit district has load do they take the next in the rotation, as before. The desk names the same district before the press.

*Accept:* at 12:30 on a clear mild day, MW shed by stage 1 = Σ net load of its two districts ±1 MW; the restore preview includes the undelayed load; a test shows stage-1 net MW at noon < at 19:00 on the same seed.

*Measured (Phase 2a, `tests/belly.test.js`; a clear mild 12:30 set by hand: operational demand 2,400 MW, rooftop 3,465 MW):*
- **Stage 1** sheds 167.5 MW, the net load of its two districts (86.2 + 81.3 MW), out of 370.4 MW of underlying load. At 19:00 (operational 6,000 MW, rooftop 277 MW) the same stage sheds 380.2 MW net of 396.4 MW. Stage 6 at noon is 19.3 MW net of 351.9 MW.
- **Unserved** accrues at the underlying rate: 370.4 MW for stage 1 against 167.5 MW of relay load. A DIRECT SHED of a Solstice Rise district at a 2,110-MW noon reads −8.9 MW on the relay and 164 MW unserved.
- **Restore preview.** A Solstice Rise district dark for more than 10 minutes previews its full underlying pickup with the cold-load factor (above 240 MW) although its lit net load is negative; the restore adds that MW, and its rooftop is back after 60 s + 360 s. The state hash is equal before and after every kind of preview with that district dark.
- **Why directed shedding skips a feeder that is feeding back.** With the grid 4 MW short and stuck at 49.69 Hz, the old rule shed a Solstice Rise district at −33 MW net: frequency fell to 48.974 Hz, UFLS stage 1 operated, 442 MW of customers went dark and 71.3 MWh went unserved in 15 minutes. With no rooftop the same shed recovers the grid (38 MW dark, 6.3 MWh).
- **The H-7 midday case on net-load blocks** is recorded under H-7: all 8 stages take 1,295 MW net for 650 MW lost and leave 2,942 MW of customers dark; peak 50.44 Hz, not black.

**U-1 — Six suburbs.** Region totals are sized for 2026 (livestack §3).

| Suburb (dry wit) | Households | Rooftop MW (backstop-capable) | Hot-water soak MW | EV delay MW | Air-con relief MW | VPP MW/MWh | Start patience |
|---|---|---|---|---|---|---|---|
| **Solstice Rise**: outer estate. "Checks its solar app more often than its children." | 280k | 1,250 (45%) | 60 | 35 | 25 | 35/85 | 70 |
| **Old Hazelton**: terraces under Mt Hazel's stack. "On off-peak hot water since 1962; has never asked why." | 300k | 450 (5%) | 140 | 10 | 15 | 5/12 | 90 |
| **Redgum Flats**: brick veneer. "Runs the air-con like it's a human right. Because it is." | 420k | 1,000 (20%) | 110 | 10 | 45 | 10/25 | 60 |
| **Harbourside**: CBD towers. "Nobody knows where the thermostat is, including Facilities." | 250k | 250 (10%) | 20 | 25 | 40 | 5/13 | 50 |
| **Tallowood Heights**: pools and Powerwalls. "Would like to speak to the manager of the electricity." | 290k | 1,150 (25%) | 90 | 20 | 15 | 30/75 | 40 |
| **Saltbush Bay**: retirees by the beach. "Remembers 2009. Will ring talkback." | 360k | 900 (15%) | 60 | 0 | 10 | 5/15 | 80 |
| **Region** | 1.9M | 5,000 (~25%) | 480 | 100 | 150 | 90/225 | |

Each suburb holds districts of ~3% of demand. They are the UFLS blocks (H-6), restore feeders (K-13) and rotation order (H-11).

*Accept:* columns sum to the region row; names are checked against real Australian suburbs and against plant names (H-15).

**U-2 — Levers.** Clicking a suburb opens its card. Each lever shows MW, MWh left, window, a rebound preview and cost. A daily offers at most 3 lever types, chosen by day type.

Phase 2 ships two levers: **HOT WATER SOAK** (noon) and **AIR-CON CYCLE (+ pre-cool)** (evening). Phase 3 adds HOT WATER HOLD, EV DELAY, VPP and BACKSTOP.

| Lever | Effect | Limits and rebound |
|---|---|---|
| HOT WATER SOAK | Adds load 10:00–15:00 | Region cap 1.9 GWh/day. That night's heating falls by the same energy. |
| HOT WATER HOLD | Cuts evening load | 80 MW region, ≤2 h. Reheat ≈100% of the held energy over 1.5 h. |
| EV DELAY | Cuts evening charging | ≤3.5 h. The energy returns at 100%; release is staggered by suburb. |
| AIR-CON CYCLE (+ pre-cool) | Relieves load | ≤1.5 h. Pre-cool adds +50% of the relieved energy beforehand. Snapback returns 60% over 1.5 h. |
| VPP | Charge (soaks rooftop at noon) or discharge | Energy-limited. Homes re-import 25% of the discharged energy over 2 h. |
| BACKSTOP | U-7 | U-7 |

*Accept:* ≤3 lever types exposed per daily.

**U-3 — Flex on the Live Stack.** (Moved with U-2, so that scheduled soaks and pre-cooling show on the stack.)
- Scheduled flex dents the skyline in the suburb's colour; pre-cool and rebounds show as ghost bumps.
- Blocks drag in time.

*Accept:* dents and bumps integrate to the U-2 energy within 1%.

**U-4 — Patience (0–100).**

| Action | Patience cost |
|---|---|
| Soak | 0 (−15 if the cap is exceeded: "lukewarm showers") |
| EV delay | 5 per hour past 21:30 |
| Air-con cycle | 10, plus 5 per extra 30 min |
| VPP discharge | 5, plus 10 below 20% charge |
| Backstop | 30 |

- Recovery is +5 per idle grid-hour.
- Below 50, response scales by (0.5 + patience/100): opt-outs.
- Below 25, the lever locks for the day.
- At 0, a "petition" headline.

The mechanism is real (programs allow opt-outs, and fatigue grows them); the magnitudes are game tuning.

*Accept:* every patience change logs a cause; each suburb has ≥3 ticker lines.

**U-6 — Customer-cost inputs** (these feed S-2; moved with U-2, because CUSTOMER COST needs the soak and air-con rows from Phase 2).

| Lever | Cost to customers |
|---|---|
| Soak | A credit |
| EV delay | $30/MWh shifted |
| Air-con | $400/MWh relieved |
| VPP | $1,000/MWh discharged (unverified) |
| Backstop | $300/MWh curtailed |
| Industrial DR (for comparison) | $1,400/MWh |

*Accept:* each value lives in `params.js` with a `src` or `simplified` field.

**S-14 — Par learns the belly.** Belly rules added to S-4, using only `observe()`:
1. On an MSL1 forecast, schedule a hot-water soak on the suburb with the most soak MW. *(Deferred to slice 2b, with the soak lever.)*
2. Charge the battery whenever the price is ≤$0. *As built (Phase 2a):* par also charges while the dispatch is spilling more than 50 MW (P-9). The rule joins S-4 rule 6 as a union with its 09:30–15:30 window: outside or inside the window, the order is sized to what is being spilled (at most 350 MW), up to the same 97% charge, and it is held while the surplus feeds it. With nothing spilled there is no free power to take, so the price alone starts no order outside the window (it keeps one going); that case is rare (104 s in 16 days).
3. Export to the midday cap, charge, and let the dispatch curtail the rest (P-9). There is nothing for par to send: curtailment is automatic. (As first written, "curtail utility solar before exporting at a negative price", the rule could never fire: the neighbour's price is never negative.)
4. Decommit a coal machine only if MSL2 is forecast for ≥3 h **and** evening N-1 holds without it. (An earlier draft also required its "restart plus climb" to finish before 16:30, which the 8-h minimum down time makes impossible, P-9.) *As built (Phase 2a):* a coal branch in S-4 rule 4. It acts only when no gas unit is committed, when the forecast is at or below MSL2 in at least 36 of its 54 five-minute columns, and when the evening holds N-1 without the machine at every point of the plan until it could be back at minimum load (a 10:30 stop is back at 21:44). At most one coal stop a day. **It is expected never to fire on real days, and it was not tuned to fire.**
5. Aim evening flex at the forecast operational peak, never at the pre-PV peak. *(Deferred to slice 2b.)*

Phase 3 extends these rules to the VPP, the hold, EV delay and the backstop.

*Accept:* par sheds zero on ≥85% of raw seeds with P-1–P-4 in place; par never triggers MSL3 except after a noon contingency; the §6 difficulty rows are re-measured.

*Measured (Phase 2a; `node tools/par.js --scenario desk | desk-weekend --seeds 1-200`, and 100 forced-heat seeds each):* par sheds zero on 192 of 200 `desk` seeds (96.0%) and 197 of 200 `desk-weekend` seeds (98.5%); S-12 has the table. **Par never reaches MSL3**, with or without a contingency: on the 400 raw par days MSL3 and MSL2 never occur, and MSL1 occurs on 11 of 101 mild weekends and on no weekday. Rule 4's coal branch fired on 0 of 600 par days. The belly rule mostly moves par's charge earlier: par already reached 97% by 15:30. Left open (stage C of 2a): after a trip in a surplus, S-4 rule 1 still starts a peaker and imports while the dispatch is spilling (37–81 MWh imported on the seeds looked at).

#### PLAYTEST GATE 1 — after Phase 2

**Build:** `next.html` on a gate-passed seed, first-shift coaching on.

**Protocol:**
- **Testers:** 3–5 friends or family who have never played, with at most one energy professional.
- **Setup:** their own desktop or laptop, sound on. The owner sends only the link and says: "This is a game I'm making. Play today's day and say out loud what you're thinking."
- **Observing:** the owner watches silently, over the shoulder or by screen share. The only prompt is "keep talking". Record with consent.
- **Help rule:** the owner helps only after 60 s stuck, and logs it.
- **Five-minute interview afterwards:**
  1. What was your job?
  2. When the power station tripped, what caught the fall?
  3. Why did you get your grade?
  4. Stress 1–5, and confusion 1–5.
  5. Would you play tomorrow?
- **Owner check:** the owner also plays and rates stress and confusion, against their own v2 rating.

**Pass (all of):**
- ≥4/5 finish to the verdict (all testers, if only 3).
- ≥4/5 describe the job correctly in answer to question 1: lining up enough power ahead of demand, with the automatics handling the seconds.
- ≥3/5 name two of inertia, battery and governors.
- No tester is stuck for more than 30 s without knowing what to do, from the think-aloud log.
- ≥3/5 explain their grade in their own words.
- Median stress ≤3 and median confusion ≤2.
- The owner's stress and confusion are lower than for v2.

**Fail:** fix the top three issues, then re-run with at least two new testers.

---

### Phase 3 — The full city

**Ships:** `next.html` with the rest of the city: the HOT WATER HOLD, EV DELAY and VPP levers (U-2), the rooftop backstop, the heat-health guard, the map's city life and battery arbitrage on display. Par learns the new levers (S-14), and capacity is re-checked (S-12). Rooftop PV, the belly and the first two levers moved to Phase 2, before gate 1.

**P-1–P-4, P-9, P-12, U-1–U-4, U-6, S-14 — (moved to Phase 2).**

**P-10 — Battery arbitrage is visible.** Battery market P&L = Σ price × output. It is a side statistic on the desk and in the debrief, not a score axis.

*Accept:* the median P&L under par is positive (rules lab: $4.4M/day at a charge price of ~$90); the average charge price is ≤$100/MWh (today $394–519).

**U-5 — Heat-health guard.** Cycling Saltbush Bay's air-con in a heatwave costs ×3 patience and makes a health headline. The card warns before the player confirms.

*Accept:* the warning precedes confirmation (UI test).

**U-7 — Rooftop backstop (a real mechanism).**
- Locked behind a key until MSL3.
- It curtails only the suburb's backstop-capable systems to zero for ≤2 h. In SA, these are inverters installed after 28 Sep 2020.
- Operational demand rises by the curtailed output.

*Accept:* unavailable before MSL3; MW removed = capable share × current rooftop output; it makes a headline.

**U-8 — Map feel.**
- Panels glint, and cloud shadows cross suburbs.
- Tanks vent steam during a soak; EV chargers pulse; rooftop air-con fans slow when cycled.
- Complaint bubbles appear and a news ticker runs.
- The backstop has a relay clack.

*Accept:* every active lever is visible on its suburb.

---

### Phase 4 — The daily

**Ships:** `index.html` switches to v4. `classic.html` keeps v2 for one release.

**Y-1 — Date and seed.**
- The daily follows the player's **local** calendar date (the Wordle convention). UTC would roll over at 10:00 AEST and split an Australian day across two puzzles.
- Puzzle #N counts days since launch, computed with `Date.UTC(y,m,d)` differences so daylight saving can't skip or repeat a day.
- Candidate seed = hash of `GRIDWATCH|daily|<SIM_VERSION>|YYYY-MM-DD|<attempt>`. `tools/daily-gen.js` stores the first attempt that passes D-9.

*Accept:* daylight-saving transition dates each produce exactly one puzzle number.

**Y-2 — One official attempt.**
- The first run that passes 09:00 grid time is official.
- Closing the tab resumes the run (F-7).
- "Abandon" records a DNF (did not finish).
- After the official run, "Replay today" is unlimited and marked PRACTICE.
- Practice before the official run uses past dates, or seeds drawn from the pool that passed D-9 (never raw random seeds, which par may not be able to solve).
- The practice menu also lists labelled "Hard days" (S-7). They never take the daily slot.

*Accept:* practice never changes the share card or the streak; every practice seed outside the Hard-day list passed D-9.

**Y-3 — History and streak.** `gridwatch:v4:history` holds one entry per date: {n, date, SIM_VERSION, marks, values, par, lowHz, mode, firstShift, dnf}, capped at 400 entries.
- STREAK counts consecutive dates played.
- BEST counts consecutive dates at par or better on LIGHTS.

*Accept:* with storage blocked, the game plays normally and shows "history off".

**Y-4 — Share card (text).**
- No emoji: only Unicode block characters, ★, the middle dot · and plain ASCII.
- ≤7 lines and ≤280 characters (the §4.7 example is about 200).
- The sparkline has 12 two-hour blocks from 04:00. Each block is the worst deviation from 50 Hz in its window:

| Worst deviation (Hz) | ≤0.05 | ≤0.10 | ≤0.15 (normal band) | ≤0.3 | ≤0.5 (containment) | ≤0.8 | ≤1.0 | >1.0 (UFLS) |
|---|---|---|---|---|---|---|---|---|
| Block | █ | ▇ | ▆ | ▅ | ▄ | ▃ | ▂ | ▁ |

- Tags: "first shift", "hand-flown", "glass broken" (RERT was armed, K-7), "DNF".
- Never included: event names or clock times.

*Accept:* a lint rejects cards containing event words or `HH:MM` times.

**Y-5 — Copy.** `navigator.clipboard.writeText`, with a textarea and `execCommand` fallback, and a visible "Copied".

*Accept:* works in desktop Chrome, Edge and Firefox (manual check).

**Y-6 — Optional PNG** (deferred until after Phase 4; not needed for launch, and first on the cut list). A 1200×630 canvas with the 24-h frequency trace, the L-10 hourly strip and the marks, with no event labels. Saved via `toBlob`; no server.

*Accept:* the PNG contains no text matching the Y-4 lint.

**Y-7 — Closing lines.** ≥40 dry lines, keyed by outcome bucket (lights vs par × cost vs par × band of lowest Hz). The pick is seeded by (date, bucket), so friends with the same result get the same line.

*Accept:* each bucket has ≥2 lines, and the pick is deterministic.

**Y-8 — The shared link works on a phone, too.** A Wordle-style link is mostly opened on a phone, and the game is desktop only (OD-2, C-9).
- **Landing page.** Below the C-9 viewport, or with a touch-only pointer (`(pointer: coarse)` and no fine pointer), the page shows a landing page instead of the desk: the one-line pitch, a preview image, "Open on a computer", and a COPY LINK button (Y-5's copy code), so the link can be sent to oneself.
- **Link preview.** Every HTML page carries `og:title`, `og:description` and `og:image`. The image is a 1200×630 PNG served from the same origin, with an absolute URL on the canonical host (C-4). There is also a favicon.
- These add no request to another origin (C-1).

*Accept:* at 390×844 the landing page shows and the desk does not load; COPY LINK works in mobile Safari and Chrome (manual check); the link unfurls with title, description and image in at least two messaging apps (manual check, as in gate 2).

**Y-9 — Weather seasons follow the calendar** (decided in §9 Q-5). The daily already uses the real date (Y-1), so the weather follows it. Each season sets a different puzzle, which fixes "day 5 plays like day 1" (§3.3):

| Season (southern hemisphere) | Sun and rooftop PV | Demand shape | Signature crisis |
|---|---|---|---|
| Summer (Dec–Feb) | Long days, high PV | Afternoon cooling peak | Heatwave evenings (heatwaves only Nov–Mar) |
| Autumn (Mar–May) | Shortening days | Mild | Early dusk sharpens the ramp |
| Winter (Jun–Aug) | Short days, low PV, dark by ~17:30 | Morning and evening heating peaks | The double peak, with little solar help |
| Spring (Sep–Nov) | Long days, mild temperatures | Low | The deepest midday belly: minimum demand, negative prices, backstop |

- A `content/seasons.js` table holds sunrise and sunset, clear-sky PV yield, the underlying demand shape and the event mix per month. The values come from public sources and are cited in §8.1 when added.
- `tools/daily-gen.js` gates every season's dailies with D-9 (par-solvable), so a winter daily is as fair as a summer one.
- These are *weather* seasons. They are not the progression "seasons" W-5 rules out.
- Until Y-9 ships, every daily is labelled as a late-summer day (§8.2).

*Accept:* a July daily has no heatwave and sunset before 18:00; a mild October weekend reaches the MSL1 belly on ≥10% of dates; each season's published dailies meet the S-12 par targets separately.

**D-22 — One counterfactual** (moved from Phase 2; not needed for gate 1).
- The player's own input log is re-simulated from hourly snapshots, injecting one change 20–180 grid-minutes before the moment. Possible changes: start or keep a unit, arm diesel, call DR or the VPP, pre-cool a suburb, hold the battery.
- It reports the best single change on the axis where the player lost most to par, with its measured effect.
- If no single change recovers ≥50% of the gap, it says so and lists up to 3 of par's decisions the player didn't make. The day lab found single fixes recover all shedding in only 50% of near-par cases.
- It runs in a Worker during the night roll.

*Accept:* ≤30 re-simulations; ready by the verdict on ≥95% of runs; every number comes from a re-simulation.

**D-23 — Replay scrub** (moved from Phase 2). A timeline of frequency, the stack by fuel, price and events, with par's line as a ghost. Watches replay from stored physics traces.

*Accept:* scrubbing never re-simulates.

**F-7 — Persistence and resume.**
- localStorage keys: `gridwatch:v4:settings`, `:history`, `:streak` and `:resume` (seed, `SIM_VERSION`, input log, one snapshot).
- Every access is wrapped in try/catch.

*Accept:* with a stub that throws on every call, a daily plays to the end; storage stays <200 KB after 400 dailies; keys carry a schema version; reopening the tab mid-day resumes at the same tick within 2 s; a `SIM_VERSION` change cancels resume with a message but keeps history and streak.

**F-8 — Calendar and stored par.** `content/dailies.js` maps date → {seed, scenario, `SIM_VERSION`, par scorecard}, written by `tools/daily-gen.js`. The stored par is authoritative for grading (§9 risk 5). The browser re-runs the autopilot only to draw the debrief ghost.

*Accept:* every entry reproduces its stored par, with no UFLS or directed shedding; this is re-tested whenever `SIM_VERSION` changes; the information-barrier test (S-4) passes; at release the calendar covers ≥365 days ahead (D-9 generates 365 dates in ≤10 min); the GitHub Action (F-10) warns when fewer than 60 days remain, so the daily never silently runs out; a date with no entry still shows "No daily today — practice" instead of failing.

**F-9 — Version coherence.**
- Pages caches each file for 10 minutes (`Cache-Control: max-age=600`, measured 2026-09-30), so a player can briefly load mixed module versions after a deploy.
- Every module exports `BUILD`, and boot compares them.

*Accept:* a forced mismatch shows "GRIDWATCH was updated — refresh to continue", and never crashes or auto-reloads.

**F-14 — Switch-over.**
- `index.html` points at the v4 app (a one-line change).
- `classic.html` serves v2 with a "classic" banner for one release, then is removed.

*Accept:* both pages load on the live host; `curl -sI` returns 200 for both.

#### PLAYTEST GATE 2 — after Phase 4

**Build:** the live URL.

**Protocol:**
- **Testers:** 3–5, at least 2 new. Returning gate-1 testers are allowed.
- **Invitation:** each gets the link the way strangers will, as a message carrying the owner's own share card.
- **Observing:** as in gate 1, but no prompt to share.
- **Next day:** ask, without leading, whether they played again.

**Pass (all of):**
- ≥4/5 finish.
- ≥3/5 press SHARE or copy the card unprompted, as observed.
- ≥2/5 play the next day's daily unprompted, self-reported.
- The card renders correctly in each tester's messaging app (manual check).
- The link unfurls correctly (title, description, image) in each tester's app, and a tester who opens it on a phone reaches the Y-8 landing page (manual check).
- ≥3/5 can retell "the moment" of their day.
- Zero spoiler complaints.

---

### Phase 5 — Week mode

**W-1 — The Week.**
- Five linked days, Monday to Friday, seeded by ISO week and the same for everyone.
- Each day is played in its own sitting, with progress saved.
- One official run per week, separate from the daily streak.

*Accept:* the same ISO week produces the same five seeds on any machine.

**W-2 — Carry-over.**
- **Water:** a weekly hydro budget of ~33,000 MWh (88% of 5 × 7,500).
- **Battery:** its charge at 04:00, via a night-roll toggle "recharge overnight".
- **Wear:** hours above 96% raise the next day's forced-outage risk, and the risk is shown.
- **Patience:** each suburb recovers 50% per day.
- **Temperature:** units carry their warm or cold state.

*Accept:* each carried quantity round-trips through a save and resume unchanged.

**W-3 — Weather arc.**
- Monday's briefing shows a 5-day outlook with confidence bands.
- One big day, a heatwave or a storm, lands on Thursday or Friday. Its forecast firms up during the week.

*Accept:* the band narrows monotonically toward the big day.

**W-4 — One transition choice.**
- Monday announces that a Mt Hazel coal machine retires on Wednesday night.
- The player picks one replacement: a grid-forming battery (H-17), a fast peaker, or a VPP program.
- The choice is labelled honestly: "approved years ago; you choose which lands".
- CO₂ joins the week's letter grade (S-9).
- The week debrief re-runs par for Thursday and Friday with each option.

*Accept:* all three counterfactual pars are shown, with their inertia and CO₂.

**H-17 — Grid-forming battery physics.** H-8 models the battery as grid-following, with zero inertia (F-13), so W-4's "grid-forming battery" option needs its own physics before it can be offered.
- A grid-forming battery answers from the first instant, before any measurement delay: model it as a virtual-inertia term (an Ek contribution from a params "virtual H" × rating) plus fast droop without the 0.1-s dead time.
- Its virtual H, its current limit and its energy reserve are params with a source, or labelled "simplified" and listed in §8.3 until sourced.
- The frequency dial's inertia readout shows real and virtual inertia separately.

*Accept:* with the grid-forming option, initial RoCoF for the same trip falls in proportion to the added Ek (F-4 test); the TRIP PREVIEW includes it; the §8.2 ledger has a row for it before W-4 ships.

**W-5 — Guard rail.** The week result is 5 rows plus the choice. There is no money, no shop, no perks and no seasons (§7).

*Accept:* a UI audit finds no currency or upgrade screen.

---

## 6. Target metrics

"Proxy" means a scripted policy in `tools/policies.js`, or the v4 equivalents. All targets are re-measured after Phase 0.2, 1a, 2 and 3, because every today-number comes from v2 physics.

**End of Phase 0.2.** Where the v4 core can already measure a row, "v4 core" follows the legacy value. Those numbers come from `node tools/baseline-v4.js` (`v4-core-0.2.2`; golden `tools/baseline-v4.golden.md`): par and the proxies on the classic scenario, v4 physics, no rooftop PV, raw seeds rather than gate-passed dailies. Rows without one need the desk, the director, rooftop PV or a browser.

**Phase 2a** (2026-10-02, `v4-core-2a`; sim, par and view merged). Where slice 2a moves a row or measures it for the first time, "Phase 2a" follows the earlier values. Unless a figure says "classic", it is measured on the game's day, which has rooftop PV and day types: `node tools/par.js --scenario desk | desk-weekend --seeds 1-200` (par, raw seeds, not gate-passed dailies). "Classic" figures are from the golden `tools/baseline-v4.golden.md`, on the scenario with no rooftop PV.

| Metric | Today (measured) | Target | How measured |
|---|---|---|---|
| Heatwave share of days | 53/100 seeds; v4 core: 308 of 2,000 seeds (15.4%) | 15 ± 2% of 2,000 dates | `tests/director.test.js` (D-8, S-10) |
| Published days short on the optimistic bound (1-min, all day) | 72/100 (heat 49/53); v4 core: raw par days calm 0/105, storm 0/66, forced heat 6/100 | 0 | `tools/daily-gen.js` (D-9) |
| Par with zero unserved, raw seeds | 24% (day lab, today's rules); v4 core: 181/200 (90.5%); forced heat 75/100; Phase 2a: `desk` 192/200 (96.0%), `desk-weekend` 197/200 (98.5%), classic 183/200 (91.5%); forced heat 86/100, 98/100 and 77/100 | ≥85% of 200; ≥75% forced heat | `tools/par.js` (S-12, S-14) |
| Par arms RERT, raw seeds | v4 core: 47/200 (23.5%); Phase 2a: `desk` 13/200 (6.5%), `desk-weekend` 1/200, classic 44/200 (22.0%) | ≤25% | `tools/par.js` (S-12, §9.1 Q-2) |
| Seed share of grade variance among good players | 84%; v4 core: competent proxy A on 68/100 raw seeds, lean A on 0/100; Phase 2a (classic): competent A on 72/100, lean A on 3/100; not yet run on the game's day | competent proxy ≥70% A on dailies; lean proxy ≤40% A | `tools/par.js` proxies (S-5) |
| Player inputs needed in the first 30 s after a trip | ~1, within 9.5 s, or shedding follows; v4 core: desk locked, 0 of 450 inputs accepted | 0 (desk locked) | K-15 test |
| Nadir response to inertia | 49.775–49.783 Hz over 48× inertia; v4 core: RoCoF × Ek constant to 0.000%; 8.4 → 26.7 GW·s raises the nadir 48.760 → 49.350 Hz | halving Ek doubles RoCoF ±1%; 8→25 GW·s raises the nadir ≥0.2 Hz | `tests/physics.test.js` (H-8, F-4) |
| Inertia after a coal machine trips | unchanged (3,946 → 3,946); v4 core: 21.07 → 17.82 GW·s (−3.25 = 5 s × 650 MW) | falls by that machine's H·S | H-3 test |
| Credible trip from a SECURE state (both H-4 conditions) | No SECURE state exists today (two reserve definitions, X-4). Two separate measurements: the 04:00 reference trip (§3.2) bottoms at 49.83 Hz and reaches UFLS within 60 s on 0/100 seeds; trips during play reach UFLS a median 14 s later with no action (pacing §2; 65% had the charge trap). v4 core: 6,856 of 6,856 SECURE states on 271 par days hold ≥49.5 Hz when L trips (worst 49.511 Hz); the other credible contingency (a unit of nearly the tie's MW, or the tie) misses on 28 of 4,904; Phase 2a, both contingencies previewed (§9.1 Q-7): `desk` 6,470 of 6,471 (worst 49.491 Hz), `desk-weekend` 6,436 of 6,438 (worst 49.455 Hz), classic 6,400 of 6,401 (worst 49.465 Hz); every miss was SECURE only on a cached preview, and none of the 6,349 and 6,290 states SECURE on a fresh preview missed | nadir ≥49.5 Hz in 1,000/1,000 states | H-8 |
| UFLS first stage / black rule | 49.2 Hz / ≤48.5 Hz for 0.2 s; v4 core: 49.0 Hz, 0.30 s crossing to shed / black after 20.0 s at 47.7 Hz, 2.0 s at 47.2 Hz; Phase 2a, the low-inertia midday case (H-7): no longer black with no battery (classic: 7 stages, peak 51.082 Hz, one OFGS stage; before, past 52 Hz and black at 1.10 s); on net-load blocks at a mild 12:30: 8 stages take 1,295 MW net for 650 MW lost, 2,942 MW of customers dark, peak 50.440 Hz, not black | 49.0 Hz / never above 47.5 Hz within 20 s | H-6, H-7 |
| Overheat trips hitting the hot unit | 31%; v4 core: 104 of 104 | 100% | H-2 |
| STOP coal, seed 3, 04:10 | nobody responds: UFLS 04:12, black 04:15; v4 core: largest one-tick step 32.5 MW (the 5% breaker level); nobody: first UFLS 06:40; competent: no UFLS through 08:00 | no tick removes >5% + one ramp step; competent: no UFLS through 08:00; nobody: first UFLS ≥60 min later (0.1: 05:40) | H-1 |
| Reserve gauge vs alarm disagreement | 29.6% of ticks; v4 core: 0 of 1.17 billion ticks on par days | 0% | H-4 |
| Import 0→800 MW, seed 12, 13:00 | price $117 → $308; v4 core: $146 → $146 → $74 (0 / 400 / 800 MW); at 18:30 the energy price $174 → $174 → $156, with the P-7 adder $174 → $174 → $220 (the tie becomes L; labelled); Phase 2a (classic): 13:00 unchanged; at 18:30 the energy price $159 → $159 → $159, with the adder $159 → $159 → $680 (par's day now runs differently before 18:30) | never rises (evening: the energy price never rises) | H-5 |
| CUSTOMER COST independent of LIGHTS ON | rules lab −0.03; v4 core: corr(Δunserved, Δcost) lean +0.50, competent +0.15, planOnly −0.43, commitAll +0.29; all four −0.08 (open: which proxies, S-2); Phase 2a (classic): lean +0.46, competent +0.52, planOnly −0.40, commitAll −0.06; all four −0.14 | within ±0.15 | S-2 |
| Median 19:00 price, non-heat days | $7,796 (ceiling) all evening; v4 core: $786 under par (at the cap on 10 of 171 days); Phase 2a (classic): $579 (at the cap on 8 of 171 days) | ≤$2,000, not at the cap (rules lab: calm $787, mixed $1,605) | `tools/par.js --prices` |
| Battery average charge price | $394–519 (loses money); v4 core: $203/MWh over all charging (median day $86), $219 while par orders CHARGE; median P&L $543,729 a day. Before the review fix $433 / $276: about two-thirds of that overshoot was the cap held after UFLS (P-8); the rest is AGC regulation, primary response and par's night recharge charging at the price of the moment; Phase 2a (classic): $198/MWh over all charging (median day $85), $205 while par orders CHARGE; median P&L $460,587 a day. It was $89 at the end of Phase 1a and $388 after the inverter response was switched on; the rise is not yet explained (S-12) | ≤$100; median P&L >0 | P-10 |
| Audible alarms, competent proxy | 60 per 12-min shift | ≤8 per daily | K-8 |
| Days with unwarned contingencies <60 real s apart | 69.8% (v4 clock); v4 core: 68/100 on the classic scenario | 0% | D-8 |
| Cloud-front warning lead | 3–10 real s | ≥25 real s at profile speed (125–170 grid-min) | D-8 |
| Session, link opened to SHARE | 12 min shift + debrief | ≤6:00 returning (arithmetic ≈5:32–5:40, one trip); ≤6:50 first shift (≈6:41–6:49) | D-2 scripted runs; gate 1 times |
| Dispatch inputs made on the desk | n/a | ≥50% (§4.1 script: 60%) | K-1; gate-1 logs |
| Returning-player dates with ≥1 SYNC that matters and ≥1 RESTORE | 0 (today's build has no SYNC, and restores only after shedding, by a hidden rule) | ≥80% | K-12, D-8 |
| No-input day (AGC + pre-dispatch) | F100 today (doNothing); v4 core: planOnly black 0/200, D on 100/100; Phase 2a: on the game's day a no-input day is meant to fail (§9.1 Q-18, Q-32), and it leaves 11,100–37,400 MWh unserved on 22 of 22 seeds (eleven each on `desk` and `desk-weekend`), never black | never F; median C/D (on `next.html`: must fail) | L-0 |
| Session after the grade is settled | ~33% (last 4 min) | ≤12 s night roll + ≤45 s debrief | D-11, D-25 |
| Longest gap without a decision opportunity, 05:30–21:00 | 66 real s median (v4 clock); 176 s opening today | ≤40 s on ≥90% of dates | D-10 |
| First click → first real action | ~8-min tutorial | ≤60 s | O-2 |
| Same seed, different play: same weather | diverges on 49/50 seeds; v4 core: 0/10 (par, doNothing, fuzzer); 0/100 in the slow integration test | 0/100 | F-3 |
| Rate invariance | n/a; v4 core: identical hash at 0.25×/1×/60×/240× through `app/loop.js` | identical hash at 0.25×/1×/60×/240× | F-4 |
| Frame rate / frame cost | 10 fps / 1.7 ms | 60 fps / p95 ≤8 ms | F-11 `?perf` |
| First-visit transfer | 88.6 KB (32 KB compressed); v4 core: the `next.html` bench, 421 KB raw, 151 KB gzip; Phase 1b: 304 KB gzip; Phase 2a: 345.6 KB gzip after the view (`node tools/perf.mjs`, 45 files), 376.5 KB with the objective line (`app/objective.js` alone is 27 KB gzip): 23.5 KB of headroom left for slices 2b–2e | ≤400 KB compressed | F-11 |
| False CO₂ tip | 100% of runs | 0 | H-13 |
| Minimum operational demand, mild weekend | ~4,290 MW (no rooftop); Phase 2a: median 1,746 MW on `desk-weekend` (p10 / p90: 1,620 / 1,880 MW; seeds 1–200). The other day types, on `desk`: MILD weekday 2,202 MW, HOT 3,242 MW, HEATWAVE 3,271 MW, all inside P-3's bands | 1,800 ± 10% | P-3 |
| MSL notices on mild weekends | n/a; Phase 2a, weather and events alone, seeds 1–1,000: MSL1 on 16.7% of days, MSL2 on 1.3%, MSL3 never (the tie rise per column, as built; 21.0% / 1.3% / never with the rise over the whole window). On par's days, seeds 1–200: MSL1 on 11 of 101, MSL2 and MSL3 never | MSL1 10–30%, MSL2 ≤10% (lab minima: 15% / 6%) | P-4 |
| Negative-price hours, mild / hot days | 0 (floor +$35); v4 core: 0 h (no rooftop PV yet); Phase 2a, par, median: `desk` 1.68 h mild (inside 2–6 h on 39 of 101 days: **the mild-weekday target is missed**) / 0.01 h hot (≤1 h on 70 of 70); `desk-weekend` 2.62 h mild (80 of 101) / 0.24 h hot (69 of 70) | 2–6 h / ≤1 h | P-9 |
| Playtest: finish / describe the job / name 2 defences / stuck >30 s | owner only: "too stressful and confusing" | ≥4/5 / ≥4/5 / ≥3/5 / 0 | Gate 1 |
| Playtest: share unprompted / return next day | n/a | ≥3/5 / ≥2/5 | Gate 2 |

---

## 7. Differentiation

Checked on itch.io, 2026-09-29.

| | *Grid Operator* (itch.io, 29 Aug 2026) | *Blackstart* (itch.io, ~Sep 2026) | GRIDWATCH v4 |
|---|---|---|---|
| Loop | Plan an 8-block day → press RUN DAY → AGC runs it in ~70 s → decision cards pause play | Utility tycoon + holding 50 Hz second by second | Live desk: dispatch with levers, planned on a rolling 4.5-h stack while the day runs; no RUN button; cards never pause, and the one hold after a trip offers no choices |
| Trip moment | Automation handles it | You hold 50 Hz yourself | Watch the true first 30 s in slow motion (inertia → battery → governors → relays), then respond |
| Progression | Money buys stations, 30-day seasons, perks | Fuel, build, contracts | None in the daily. Week mode (5 days) has one transition choice, no currency |
| Scoring | Money | Money and survival | LIGHTS / COST / CO₂ against par, on a solvable seeded day |
| Setting | Generic | 13 regions; Iberia 2025, Italy 2003, Texas 2021 | The NEM: rooftop-solar belly, negative prices, MSL, backstop, Australian incident cards |
| Sharing | Save codes | — | Daily, spoiler-free share card |

**What we do that they don't:**
- The explained first 30 seconds.
- A physical desk that shows every machine at once, with procedures you can hear.
- Par-graded fairness with a counterfactual debrief.
- The Australian duck.
- A daily.

**What we deliberately avoid:**
- The plan → run → cards → economy/perks/seasons loop (W-5).
- A modal planning timeline (L-7).
- Pause-cards (K-9). Apart from first-shift coaching, the respond card (K-16) is the only thing that holds the clock, and it offers no choices: it states the problem and lights the controls that could answer it.
- Decision cards with action buttons: tray buttons only focus a control (K-9).
- Money as a resource.
- Reflex-based frequency holding as the default (K-2).

**Honest caveat (critique #10).** Swing-equation physics is no longer unique: *Follow the Load* has it, and *Blackstart* uses UFLS at 49.0 Hz. What is ours alone is the combination of the explained watch, par, the belly and the desk. GRIDWATCH's physics isn't honest yet, so this is something to build, not something to protect.

---

## 8. Realism ledger

### 8.1 Real-world facts used

Confidence levels:
- **H**: read in the primary document.
- **M**: from a reputable secondary source.
- **UNVERIFIED**: could not be confirmed; not to be quoted as fact.

Text copies of downloaded sources were kept in the review session's local working files (`v4-facts/`, not in the repo); the URLs below are the durable references.

| Fact | Used in | Value | Source | Conf. |
|---|---|---|---|---|
| Normal operating band | H-11, K-11 | 49.85–50.15 Hz; ≤5 min outside | [AEMC FOS (2023)](https://www.aemc.gov.au/sites/default/files/2023-04/FOS%20-%20CLEAN.pdf) Tables A.2–A.3 | H |
| Credible trip containment | H-8, H-11, K-16 | 49.5–50.5 Hz; back to normal band within 5 min | FOS Table A.3 | H |
| Extreme limits | H-7 | 47–52 Hz | FOS Table A.3 | H |
| RoCoF limits | K-8 HIGH RoCoF, K-11 | Mainland: 1 Hz/s after a credible event, measured over any 500 ms; 3 Hz/s non-credible, over any 300 ms | FOS Table A.2 | H |
| Island frequency standard | §8.2 | An island within the mainland: generation, load or network event contained within 49.0–51.0 Hz, back to 49.5–50.5 Hz within 5 min | FOS Table A.4 | H |
| Event threshold | K-15 trigger | >50 MW | FOS Table A.8 | H |
| UFLS first stage and timing | H-6 | 49.0 Hz; ~0.3 s crossing to load off | [AEMO UFLS arming paper (2023)](https://www.aemo.com.au/-/media/files/initiatives/der/2023/dynamic-arming-options-for-ufls.pdf) App. A1.2 | H |
| Real staging example | §8.2 | QLD 2021: 8 blocks, 49.00–48.60 Hz, 0.15 s delay; 1,308 MW shed | [AEMO QLD 2021 report](https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2021/trip-of-multiple-generators-and-lines-in-qld-and-associated-under-frequency-load-shedding.pdf) Table 9 | H |
| UFLS depth | §8.2 | Settings from 49 to 47.5 Hz; sized for events affecting up to 60% of load | AEMO UFLS paper s3.1 | H |
| Rooftop PV weakens UFLS | P-12 | VIC net load available to UFLS 26% of underlying (28 Nov 2021) | AEMO UFLS paper s1 | H |
| Over-frequency generation shedding | H-7 | Wind trips in stages 51–52 Hz; SA peaked at 51.11 Hz (31 Jan 2020) | [AEMO 2025 frequency review](https://www.aemo.com.au/-/media/files/initiatives/engineering-framework/2025/technical-review-of-the-nem-frequency-control-landscape.pdf) Table 1 | M (stages), H (51.11) |
| What sets the nadir | H-8, K-15 | Inertia slows the fall, primary response arrests it, AGC restores | AEMO 2025 review pp.18–22; [FFR working paper 2017](https://www.aemo.com.au/-/media/files/electricity/nem/security_and_reliability/reports/2017/ffr-working-paper.pdf) | H |
| NEM inertia | K-11 scale | Mainland average ~84,000 MW·s | AEMO 2025 review p.18 | H |
| Largest credible contingency | F-13 | ~700–800 MW | AEMO 2025 review | H |
| Mandatory primary frequency response | H-8 | Deadband ±0.015 Hz; droop ≤5%; 5% output change within 10 s | [AEMO interim PFRR (2020)](https://www.aemo.com.au/-/media/files/initiatives/primary-frequency-response/2020/interim-pfrr.pdf) s3.3–3.4 | H |
| Governor lag | H-8 | Seconds; many slower than 2 s | FFR working paper s2.3.1 | H |
| Load relief | H-8 | Mainland NEM assumes 0.5% load change per 1% frequency change (since 2020); the 2023 bottom-up review estimated 0.6–0.8% by region and kept 0.5% | [AEMO load relief fact sheet (2023)](https://aemo.com.au/-/media/files/initiatives/der/2023/2023-05-31-load-relief-fact-sheet-update.pdf) | H |
| Battery response | H-8, Q-1 | Hundreds of ms; most batteries reach full output 0.85 Hz beyond deadband (~1.7% droop) | AEMO 2025 review pp.31, 70 | H |
| FCAS timeframes | K-15 labels | Very Fast 1 s (from 9 Oct 2023), Fast 6 s, Slow 60 s, Delayed 5 min | [Hornsdale report 2018](https://www.aemo.com.au/-/media/Files/Media_Centre/2018/Initial-operation-of-the-Hornsdale-Power-Reserve.pdf); [WattClarity](https://wattclarity.com.au/articles/2023/10/very-fast-raise-service-to-be-expanded/) | H / M |
| Recovery after large credible trips | K-15 settle | Back in the normal band in 10–20 s | AEMO 2025 review p.23 | H |
| AGC and dispatch | K-2 label | AGC setpoints up to every 4 s; 5-minute dispatch and settlement (since 1 Oct 2021) | Hornsdale report s2.1; [AEMO 5MS](https://aemo.com.au/en/initiatives/major-programs/nem-five-minute-settlement--program-and-global-settlement) | H / M |
| Secure again within 30 min | D-5 | 30 minutes | [NER chapter 4](https://www.aemc.gov.au/sites/default/files/2021-03/NER%20-%20v161%20-%20Chapter%204_0.pdf) cl. 4.2.6 | M |
| Start and stop profile | F-13, H-1, K-3, K-12 | Fast-start inflexibility profile: T1 time to synchronise, T2 time to reach minimum load, T3 time at minimum, T4 time to shut down from minimum | [AEMO fast-start inflexibility profile](https://aemo.com.au/-/media/files/electricity/nem/security_and_reliability/dispatch/policy_and_process/fast-start-unit-inflexibility-profile.pdf); [WattClarity FSIP glossary](https://wattclarity.com.au/other-resources/glossary/fsip/) | M |
| Synchronising limits | K-12 | ±10°, 0 to +5% voltage, ±0.067 Hz slip; close slightly early; sync-check relay "device 25" | [IEEE PSRC WG J20 (2024)](https://www.pes-psrc.org/kb/report/119.pdf) | H |
| Restoring load | K-13 | AEMO permission 4–26 min after the Callide trips; small groups restored every few minutes | Callide report s6.1 | H |
| Market price cap and floor | P-8, H-12 | $23,200/MWh (FY2026-27); −$1,000/MWh | [AEMC reliability settings 2026-27](https://www.aemc.gov.au/sites/default/files/2026-02/Schedule%20of%20reliability%20settings%20-%202026-27%20financial%20year.pdf); [AEMC MSL paper](https://www.aemc.gov.au/sites/default/files/2026-07/msl_rule_changes_consultation_paper_erc0417_erc0439.pdf) | H |
| Price during AEMO-ordered load shedding | P-8 | Set to the cap | AEMC MSL paper s4.2.1 | H |
| Carbon intensity index | S-3 | AEMO's CDEII: emissions divided by the energy generated, per region and for the NEM | AEMO CDEII procedure (via the review of 2026-09-30) | M |
| Value of Customer Reliability | H-12, D-20 | NEM $30,000/MWh (2024 dollars) | [AER VCR 2024](https://www.aer.gov.au/system/files/2024-12/2024-12-18%20AER%20-%20Final%20report%20-%202024%20VCR%20review_0.pdf) | H |
| Emergency reserve cost | Q-2 | NSW, 27 Nov 2024: activation $16,000/MWh; all-in $56,359/MWh | [AEMO RERT Q4 2024](https://www.aemo.com.au/-/media/files/electricity/nem/emergency_management/rert/2025/rert-quarterly-report-q4-2024-ver-1.pdf) | H |
| LOR levels | H-4 | LOR1 below two largest risks; LOR2 below the largest; LOR3 = shedding | RERT Q4 2024 glossary | H |
| Rooftop PV fleet | P-2 scaling | NEM 26.4 GW on 3.9M systems (Jun 2026) | [AEMO QED Q2 2026](https://www.aemo.com.au/-/media/files/major-publications/qed/2026/qed-q2-2026.pdf) | H |
| Depth of the belly | P-3 | VIC minimum 1,287 MW, ~12% of its 10,736 MW peak | QED Q4 2025; [QED Q1 2026](https://www.aemo.com.au/-/media/files/major-publications/qed/2026/qed-q1-2026.pdf) | H |
| MSL framework | P-4 | MSL1/2/3 tiers; MSL2 is one credible load contingency above MSL3, MSL1 two; thresholds vary with the synchronous units online; backstop as last resort; VIC thresholds ~1,790/1,290/790 MW | AEMC MSL paper Table 2.1 and s2; AEMO MSL fact sheet (via search snippet) | H / M |
| Negative prices | P-6, P-9 | Q4 2025: 31.0% of NEM intervals (SA 48.4%); 86% between −$30 and $0; average −$19.4 | [AEMO QED Q4 2025](https://www.aemo.com.au/-/media/files/major-publications/qed/2025/qed-q4-2025.pdf) s2.2 | H |
| Economic offloading and curtailment | P-9 | Q4 2025: economic offloading (price-driven) was 18% of available grid solar and 15% of wind; network curtailment was 6.3% of solar and 0.8% of wind | QED Q4 2025 s2.3 | H |
| Backstop dates | U-7 | SA from 28 Sep 2020 (first used 14 Mar 2021); QLD 6 Feb 2023; VIC 1 Oct 2024; NSW mid-2026 | [Vic](https://www.energy.vic.gov.au/households/victorias-emergency-backstop-mechanism-for-solar), [Qld](https://www.treasury.qld.gov.au/policies-and-programs/energy/emergency-backstop-mechanism/), [NSW](https://www.energy.nsw.gov.au/emergency-backstop-mechanism) | M |
| Home batteries fill the belly | U-2 VPP | Q2 2026: midday demand rose as home batteries charged | QED Q2 2026 s2.1 | H |
| Controlled hot water | U-2 | Energex held 777 MW of hot-water and pool load, 17:30–20:00 | Callide report s6.1.5 | H |
| Air-con programs | U-2 | PeakSmart: 155,738 air-cons, 107 MW at a 50% cap | [ABC 2025](https://www.abc.net.au/news/science/2025-02-26/peaksmart-flexible-loading-energy-demand-reduction/104949388) | M |
| Thermal plant reference | F-13 | Coal minimum 30%, ramp 3%/min; OCGT minimum 50%; starts in 5–30 min | [Aurecon 2021 cost & technical review](https://www.aemo.com.au/-/media/files/major-publications/isp/2022/iasr/aurecon-2021-cost-and-technical-parameters-review-report.pdf) | H (new-build reference) |
| Largest real load trip | F-13 smelter | Boyne Island potline 2, 256 MW (2021) | Callide report s6.1 | H |
| Alarm rates | K-8 | ≤1 alarm per 10 min steady; >10 per 10 min is a flood | EEMUA 191 / ISA-18.2 via [summary](https://seqent.com/blog/alarm-rationalization-explained/) | M |

### 8.2 Deliberate abstractions

Each row is labelled in-game (H-14).

| Abstraction | Real world | Why we do it |
|---|---|---|
| **Compressed playback.** One grid clock; physics is always integrated in grid seconds (C-7, F-4). CRUISE (150×–2,100×) hides the seconds-scale physics behind an averaged needle; WATCH plays it live at 0.15–10×. The abstraction is the operator's time: real operators have minutes, ours have seconds, or a free pause. | One clock at 1× | A 5-minute day with honest physics |
| **Event-dense day.** 1–2 unwarned trips and a crisis per act. A tripped unit is locked out for 90–150 min, then may hot-start; minimum down time applies to planned stops only (S-11, D1). | Credible trips are rare; after a protection trip a unit returns in hours to weeks | Drama, in 5 minutes; a trip is a problem to solve within the day, not a lost unit |
| **Compressed synchroscope.** Slip 0.15–0.40 Hz, one turn every 2.5–6.7 s. | ≤0.067 Hz, 15–30 s per turn; mostly automatic, at the power station, not in the control room | A playable skill moment |
| **Auto-sync takes 4 grid-minutes** (tunable 3–5) after a unit reaches full speed; a clean manual close is faster. | Auto-synchronisers work at the station; their real time to close is not yet checked (§8.3) | Makes SYNC worth doing after the first shift |
| **Par re-plans after every action.** After each discrete action par re-dispatches every lever and the tie from then to 04:00 over its commitment, without spending another action; it starts from the L-0 plan without its stops (S-4). The desk's RE-DISPATCH key gives the player the same (§9.1 Q-6; RE-PLAN under ASSIST PLAN on the bench). | AEMO re-runs pre-dispatch every 30 min and NEMDE re-dispatches every unit every 5 min | Par stands for a good operator who keeps the plan current; dragging every layer is not the skill graded |
| **RE-DISPATCH re-runs the pre-dispatch on demand.** A desk key re-runs the 04:30 pre-dispatch from now to 04:00 over the units the player has committed, and every lever glides to the new plan (§9.1 Q-6). Refused during the watch and before 04:30. | AEMO re-runs pre-dispatch every 30 min; NEMDE moves every committed unit every 5 min; operators decide commitment, reserves, the interconnector and emergencies | The plan coming together is something the player causes; typing base points is not the skill |
| **Frequency alarms escalate by severity.** UNDER FREQ and OVER FREQ are warnings (one chime) outside the normal band, 49.85–50.15 Hz; while frequency is outside the containment band, 49.5–50.5 Hz, the same tile shows as top priority and sounds the horn (K-21, §9.1 Q-11). | One priority per alarm; a worsening value raises a second, more urgent alarm at a further limit | Twelve tiles; the horn is kept for real trouble |
| **Pre-dispatch is computed once, at 04:30** (L-0). With no input the levers follow it; while districts are dark they are re-dispatched for the lit load every 30 grid-minutes (the plan the player saw is unchanged). | AEMO re-runs pre-dispatch every 30 min, generators self-commit against it, and 5-minute dispatch targets metered demand | Leaves the fixing to the player; a plan written for a whole city must not over-supply a half-dark one |
| **Act I restore task** on most days: storm-damaged feeders, or a smelter potline waiting to reconnect (D-8). | Storm outages and smelter restarts happen, but not daily | So that RESTORE is played by players who never shed |
| **The player commits units and sets output.** | Generators self-commit and bid; AEMO dispatches every 5 min and issues directions | The player stands for the whole system |
| **AGC band around each lever.** | AGC every 4 s; NEMDE (the dispatch engine) every 5 min | Readable |
| **DC tie.** The region is its own frequency island (like Tasmania via Basslink), and the player sets the flow. | Most NEM links are AC and share frequency; flows are set by NEMDE | Isolates the region's physics |
| **Mainland interconnected standard.** We apply FOS Table A.3 (a credible trip contained within 49.5–50.5 Hz), although our region is electrically an island. | An island within the mainland falls under Table A.4: contained within 49.0–51.0 Hz, back to 49.5–50.5 Hz within 5 min | 49.5 Hz is the line most of the NEM runs to, and the stricter line to teach |
| **MSL3 = 1,000 MW, with MSL2 and MSL1 300 and 600 MW above it** (P-4). Each is raised by 300 MW for the hours the tie is out, and they are tested against our own forecast: the lowest P50 over the next 4.5 hours, and now. Notices are tray cards; the rooftop backstop that real MSL3 calls on is not on this desk yet (Phase 3). | Floors vary with the synchronous units online and with network outages (VIC MSL1 was 1,535–1,795 MW across four days in Nov 2024); AEMO's notices seek a market response | Our region is an island with a ~300-MW largest load risk |
| **One-node network.** | Lines have limits | Scope |
| **Cost-based offers; scarcity adder.** The adder reads R5 / L, so at the evening peak a large import (which uses the tie's 5-min headroom and can make the tie L) raises it; the energy price never rises with import (H-5). Wind and solar offer their availability, so curtailing never raises the price. | Generators bid and re-bid; an interconnector that is the largest risk raises the contingency FCAS AEMO buys | A readable merit order |
| **CUSTOMER COST is the resource cost of serving** (S-2): fuel, starts, imports and payments, seen by a central planner. | NEM customers pay the market price (plus network charges), not the resource cost | Keeps the cost axis independent of shedding and of scarcity rents |
| **CARBON counts the region's own generation.** t CO₂ per MWh generated in the region; imports count in neither term, the battery only stores (S-3). | AEMO's CDEII is generation-based too; a consumer-based count would charge imports the neighbour's intensity | Importing cannot dilute the number; only a cleaner mix lowers it |
| **LOR states via 1.25 × L.** SECURE also needs the TRIP PREVIEW nadir ≥49.5 Hz plus a 0.05 Hz margin, plus 0.001 Hz per second of the cached preview's age; the preview is re-run at least once a grid-minute, whenever frequency moves 0.03 Hz and whenever primary-response headroom moves 20 MW. It previews both credible contingencies, the largest unit and the tie import (N-1, §9.1 Q-7). | LOR1 = below the two largest risks; N-1 covers every credible contingency | One gauge; the margin covers what a frozen-schedule preview cannot see (demand wobble, AGC and ramps), measured so that no SECURE state misses 49.5 Hz when a credible contingency trips (H-8; one tie-import probe of 4,867 reached 49.488 Hz, S-12). SECURE previews the loss of supply, not the loss of load: a potline trip at noon is caught by the inverters' response, which the gauge does not preview (Phase 2a) |
| **UFLS: 8 × 6% blocks from 49.0 Hz in 0.125 Hz steps.** At very low inertia a fast fall arms several stages before the first opens: the desk-lab midday case (6.5 GW·s, no battery, −650 MW) sheds 7 stages; with the inverters' over-frequency response (Phase 2a) the rebound peaks at 51.08 Hz instead of passing 52 Hz (H-7, §9.2 risk 10). Blocks are static and carry their districts' net load: at a sunny noon a block can shed little, or take generation off, and they trip whatever their flow; unserved energy counts the dark customers' own load (P-12). | Schemes differ by region (QLD: 8 blocks, 49.00–48.60 Hz); overall down to 47.5 Hz, ≤60% of load; South Australia has disarmed circuits in reverse flow since May 2021 (dynamic arming) | Districts = blocks; the static scheme is the weakness AEMO warns of |
| **Collapse after 20 s at 47.5–48.0 Hz.** | Collapse depends on protection settings | Graded failure instead of a cliff |
| **Wind, utility solar and rooftop solar respond to over-frequency only.** Wind and utility solar back off with a 5% droop on rating beyond ±0.015 Hz, never more than they are producing; rooftop inverters fall in a straight line from 50.25 Hz to nothing at 52 Hz and hold the lowest value until frequency is back under 50.15 Hz (H-8, Phase 2a). None of them raise output on under-frequency. OFGS still trips wind from 51 Hz (H-7). | Under the NEM's mandatory PFR rule, semi-scheduled wind and solar respond outside ±0.015 Hz with droop ≤5%: always down on over-frequency, up only from curtailed headroom. AS/NZS 4777.2:2020 (Australia A) sets the rooftop response | The belly needs a downward response (a potline trip at noon reached 51.26 Hz without one); leaving out the raise errs on the hard side and keeps a curtailed farm from being a hidden reserve |
| **Rooftop solar: one curve, six skies.** 5,000 MW of panels at 0.70 of nameplate in clear sky, on one sin^1.5 curve from 06:12 to 19:48 (3,500 MW at 13:00), trimmed 8% inside a heatwave's hours; each suburb's sky is one shared regional sky plus a small local term. Cloud fronts cross the utility solar precinct only, not the suburbs, until the event director warns of them hours ahead (Phase 2c). | Output varies roof by roof with orientation, temperature and passing cloud; a front darkens a whole city in minutes | One curve the player can learn and the forecast can be fair about; a front over the suburbs on 20 minutes' warning would be a 1,500-MW surprise nobody could plan for |
| **A mild day is the hot day with its cooling load removed.** About 100 MW per °C above 22 °C comes off the late-summer demand curve; weekends are 8% lower than weekdays. Day types: mild 55%, hot 30%, heatwave 15%, a heatwave reading "hot" until it is announced at 10:30 (until the director, Phase 2c). | Demand depends on temperature, humidity, the day of the week and season in many ways | Two clean dials that land on the real shape of a mild weekend's midday minimum |
| **The dispatch spills wind and solar automatically, pro rata.** Whenever the units running are at their minimum and the grid still has more than it uses (with the tie and the battery as they are), wind and utility solar are held back in proportion to their output and released as demand returns; the spilled energy is counted and shown but never charged for. | NEMDE dispatches semi-scheduled plant down by its offer through the semi-dispatch cap; rooftop solar is curtailed last, by the network's emergency backstop, which is not on this desk yet (Phase 3) | The player's belly decisions are the real ones: what to keep running, what to stop, when to charge the battery |
| **Minimum down time runs from breaker open to the next START.** A coal machine stopped at 10:00 opens its breaker at 11:10 and may not be started before 19:10, so it is back at minimum load at 21:14; a CCGT's 3 h work the same way. | Plant usually counts minimum down time from breaker open to breaker close: 54 minutes (coal) and 39 minutes (CCGT) shorter | One rule the desk can state before the press; it errs on the side of caution |
| **Automatic directed shedding when the FOS timers run out.** | AEMO directs the networks | No reflex test |
| **Restore permissive** (f ≥49.9 Hz, one per 5 min, R5 at least the district's cold-load MW, and a RESTORE PREVIEW of picking the district up ≥49.5 Hz plus the 0.05 Hz margin, run on the restore itself). A restored district's rooftop inverters wait 60 s and then ramp back over 6 minutes, so the pickup is the full underlying load (P-12). | AEMO judgement plus network switching; restoration waits for sufficient reserve | A visible, learnable rule that cannot set off UFLS again: the preview checks the pickup's first seconds, R5 checks the load can be carried after them (stage C of Phase 1a: without R5 a restorer who obeyed the lamp went black, §9.1 Q-10) |
| **Cold-load pickup ×1.5.** Of the district's underlying load: its rooftop solar comes back 60 s later, over 6 minutes (P-12). | Varies by feeder and weather | Teaches "restore no more than you can catch" |
| **City levers' MW, costs and patience.** | Programs differ; opt-outs are real | Playable |
| **HOT WATER HOLD is 80 MW** for the whole region (U-2). | Energex alone held 777 MW of hot-water and pool load on 25 May 2021 | Keeps the hold one lever among several; real controlled load is about 10× bigger |
| **Coal ramps at 3 MW/min per machine** (F-13, today's value). | The Aurecon new-build reference is 3%/min, 19.5 MW/min for a 650-MW machine, 6.5× faster | Existing units are slower than new-build (unverified, §8.3), and it makes coal the plan-ahead lever |
| **Region scale.** 7.7 GW peak, 1.9M households, 5 GW rooftop; fictional names. | Scaled between VIC and SA | A single-region story |
| **Hum reference tone** at exactly k × 100 Hz. | None | Sonification, like a tuning fork |
| **Daily hydro allocation** of 7,500 MWh. | Storages are seasonal | A day-sized budget |
| **Hydro spins free.** A gorge machine on line at any output down to 0 MW uses water only for what it generates and has no no-load cost, yet counts full inertia, governor headroom and R5 (~217 MW per machine). | Speed-no-load draws a few % of rated flow; near-zero output is inefficient; condenser mode is separate and costed | A clean daily energy budget; the spinning services themselves are real. Par keeps machines near 0 MW for ~30 machine-hours on many days, so the missing no-load water is a few % of the allocation |
| **Every daily is a late-summer day, until Y-9 ships** (§9 Q-5). Until then, sun times, rooftop yield and the heatwave share do not follow the calendar: the date is only the puzzle number (weekends still come from the calendar). Y-9 removes this abstraction. | Heatwaves come from about November to March; winter has a later sunrise, an earlier sunset and an evening peak of its own | One tuned season; a July heatwave would break the realism rule |

### 8.3 Still unverified

Do not state these as fact in-game until they are checked:
- swing-equation constants (textbook only);
- rooftop penetration by state and the 0.70 clear-sky factor;
- total NEM VPP MW (say "hundreds of MW, not GW");
- EV smart-charging share;
- the size of pre-cooling;
- ramp and start times of *existing* NEM coal units (today's 12 MW/min per station is labelled "brown-coal-like, unverified");
- the T1/T2/T4 split of start and stop times by plant class (F-13);
- how long a real auto-synchroniser takes from full speed to breaker close (K-12 uses 4 grid-minutes);
- a security floor (MSL3) for a region like ours (P-4 uses 1,000 MW);
- grid-forming battery parameters (H-17);
- the ISA-18.2 acknowledge semantics;
- the CPT rolling window;
- intervention pricing under RERT (P-8);
- the rooftop inverter ramp after it reconnects (P-12 and H-8 use 6 minutes, 16.67% of rating a minute; AS/NZS 4777.2:2020, not yet read in a primary source). The 60-s reconnection delay before the ramp is no longer on this list: it is from AS/NZS 4777.2:2020 and was confirmed in the Phase 2a review against a network operator's settings sheet for region Australia A, with the 50.25–52 Hz over-frequency response and its 0.1 Hz hysteresis;
- forecast σ by horizon (L-2);
- 1.9M households;
- ~100 MW/°C of cooling load, and the constants built on it in P-3 (no cooling load at or below 22 °C, 1,400 MW at 36 °C);
- the weekend demand factor (P-3 uses ×0.92 for the whole day; real weekend load shapes differ hour by hour);
- VPP event pay;
- the frequency trigger and sustain time for switched-controller contingency FFR (K-5 GUARD; MASS);
- RERT minimum activation period and pre-activation costs (K-7);
- how long a unit stays out after a protection trip (the legacy 90–150 min lockout, then a hot start, S-11 / D1; real returns range from hours to weeks);
- per-month sun times, PV yield and demand shapes for the season table (Y-9).

---

## 9. Open decisions & risks

### 9.1 Owner calls (decided 2026-09-30)

The owner delegated these on 2026-09-30: *"make the most fun choice RE: those questions"* (OD-17). The rule applied: fun comes from **a plan that pays off at a dramatic moment**, never from making things easier. Realism stays sacred (OD-6), so each choice is also how the real grid works.

| # | Question | Decision | Why it is the most fun (and still real) |
|---|---|---|---|
| Q-1 | **Battery response curve.** AEMO caps most batteries at full output 0.85 Hz beyond the deadband (~1.7% droop), much weaker at the nadir than the desk prototype's full-swing battery. With it, a 650 MW trip breaks containment (lab re-run: morning 49.23 Hz, evening 49.34 Hz). | **Real curve plus a player-set GUARD.** The whole battery follows AEMO's curve (H-8). On top, the player sets a contingency FFR reserve on the battery's GUARD ring (K-5), delivered in full within 1 s of a trip, as batteries enabled for Very Fast raise FCAS do. Guard MW can't be used for arbitrage. | A battery that always saves you makes trips boring; a weak one with nothing to decide makes them unlucky. With the guard, **the watch shows your own decision catching the fall**, and noon arbitrage vs evening security is a real trade-off felt in the hand. Real NEM batteries earn much of their revenue exactly this way, by holding headroom for contingency FCAS. |
| Q-2 | **Emergency reserve (RERT diesel).** Par arms it on 73% of days; the real activation cost is $16,000/MWh against today's $2,600. | **Real cost, rare, and dramatic.** Out of market at $16,000/MWh; a "break glass" key under a red cover with its own alarm, a news-ticker line and a "glass broken" share tag (K-7, Y-4). The fleet is sized so par arms it on ≤25% of dailies (S-12). | A nightly lever is a chore; a rare one is a story. The 20-minute lead makes arming a bet: early is safe but costly, late may be too late. Real RERT is an emergency tool too. |
| Q-3 | **Evening difficulty after rooftop PV.** PV moves the peak ~1 h later and narrows it; heat days with zero unserved went 0 → 26/53 (livestack Table A). | **Re-tune the fleet (GT·C's size), never inflate demand.** The evening is hard because of its steepness (can the levers climb fast enough; were slow starts scheduled early on the Live Stack), not because of an unplannable shortfall. Targets in S-12: par ≥85% zero unserved, lean proxy A on ≤40%. | "The plan comes together" needs a climax that planning wins and improvising loses. A ramp you can see coming on the stack is that climax; a raw MW gap is just bad luck. Real demand stays recognisable. |
| Q-4 | **Manual SYNC after the first shift.** Routine manual syncing would be a chore; never offering it would kill the owner's chosen mini-skill. | **Optional, offered only when it matters.** Auto-sync closes 4 grid-minutes after full speed (tunable 3–5, labelled). When a unit reaches speed during RESPOND, while TIGHT or worse, or in the evening peak, the scope lights and Marg offers it. A clean close brings the unit on at once; a bad one jolts the grid. Clean closes are counted in the debrief; HAND mode is always manual (K-12). | A calm, precise skill-shot in the middle of the alarms is the most "desk as instrument" moment in the game, but only if it is rare and matters. Most real plants auto-sync, and the label says so. |
| Q-5 | **Seasons.** The daily uses the real date, but sun times and the heatwave share are fixed, so a July daily could hold a heatwave. | **Weather seasons follow the calendar (Y-9, Phase 4).** Summer heat evenings, the winter double peak, the spring minimum-demand belly, autumn's early dusk. Every season's dailies are par-gated. Until Y-9 ships, dailies are labelled late-summer. On the cut list if Phase 4 runs long. | Variety is the measured weakness: two calm days' action timelines correlate at 0.79 (§3.3). Four seasons give four different signature puzzles, and a July heatwave would break the realism rule anyway. These are weather seasons, not the progression "seasons" W-5 rules out. |

**Phase 1a decisions (2026-10-01, delegated under OD-17; `desk/README.md` §0 A-1–A-5).**

| # | Question | Decision | Why it is the most fun (and still real) |
|---|---|---|---|
| Q-6 | S-4: par re-plans free after every action, but L-6/L-9 gave the Live Stack no re-plan. | **A RE-DISPATCH key on the desk** (an L-9 exception, like the 04:30 pre-dispatch): it re-runs the pre-dispatch from now to 04:00 over the player's present commitment, and every lever glides to the new plan. Par keeps its free re-plan, so S-12 needs no re-tune for it. | Pillar 2's "six levers glide up together" becomes something the player causes: commit a unit on the stack, press RE-DISPATCH, watch the desk rearrange itself. AEMO re-runs pre-dispatch every 30 min and NEMDE moves committed plant every 5 min; the operator's real decisions are commitment, reserves, the tie and emergencies. |
| Q-7 | H-8: SECURE previewed only L; losing the other credible contingency missed 49.5 Hz in 28 of 4,904 SECURE states. | **N-1 over both credible contingencies**: the preview runs for the largest unit and the tie import; BIGGEST RISK names the deeper one; SECURE needs both (`N1_PREVIEW_ALL`, on). Every S-12 target still holds (S-12). | N-1 means *any* credible contingency. A gauge that says SECURE and then breaks the containment standard would betray the watch, the game's signature moment. |
| Q-8 | K-7: "DIRECT SHED appears only when LOR2 is forecast." | Available while the gauge reads SHORT or SHEDDING (R5 < L now). | The present LOR2-like state is what the desk shows; a separate forecast LOR2 would be a second reserve definition (H-4 forbids two). |
| Q-9 | K-12: who decides when the scope is "offered"? | The app (presentation: lighting and Marg's line); the sim knows only whether a unit's scope is open, which suspends its auto-sync. Any `ready` unit's scope can be opened from the bay. | Offers are wording; suspending auto-sync changes the grid, so only that is an input (F-6). |
| Q-10 | K-13 (found in stage C): a whole-day test player who restored whenever the lamp allowed went **black** at 20:50 on seed 20260930. Each restore passed the RESTORE PREVIEW (the pickup's first seconds), but the evening grid had no headroom to carry the load, so frequency sank over the next minute into a deeper UFLS stage, until all eight stages had operated. | **The permissive also needs R5 ≥ the district's cold-load MW** (the lamp and the input), beside the preview. `SIM_VERSION` v4-core-1a.1. | A green lamp a stranger can trust: restoring is the reward for having reserve, which is how restoration really works (AEMO restores load when there is sufficient reserve). The tuning pass had replaced R5 with the preview because R5 alone passed restores whose surge set off UFLS; both are needed, for the seconds and for the minutes. |

**Phase 1b decisions (2026-10-01, delegated under OD-17, confirmed by the owner the same day; `desk/README.md` §11 B-1–B-7).**

| # | Question | Decision | Why it is the most fun (and still real) |
|---|---|---|---|
| Q-11 | K-21 makes "frequency outside 49.5–50.5 Hz" P1, but the UNDER/OVER FREQ tiles set at the normal band and K-21 wants one priority per tile. | The two tiles are P2 (a chime) and **escalate** to P1 (the horn) while frequency is outside the containment band. | v2 was "too stressful": the horn should mean real trouble. Real control rooms escalate the same quantity by severity (§8.2). |
| Q-12 | K-8's flash rates. | ISA-18.1 sequence R, visual: fast 2.5 Hz, slow 0.8 Hz for everyone; reduced motion 1 Hz and steady. | Never above 3 Hz for a stranger arriving by link (WCAG 2.3.1); the glyphs carry the state. |
| Q-13 | K-21's P2 repeat against K-8's 30 s. | P2 repeats once, 60 real s later, if still unacknowledged. Horn repeats and that repeat are re-sounds of one alarm: not counted as audible alarms, and the only sounds inside a tile's 30-s hold-off. An escalation inside the hold-off sounds the horn at once. | K-8 counts alarms, not horn blasts; a containment breach must not wait 30 s. |
| Q-14 | K-18's optional CRT overlay. | On by default and subtle (2-px scanlines over the map only, opacity 0.06, no animation); REDUCED EFFECTS turns it and the hum off. | Control-room feel that never costs legibility. |
| Q-15 | K-22's "no camera zoom in the watch" against G-1's integer pixel scale. | The watch's camera is a spotlight on the tripped plant, easing in over 0.6 s (instant under reduced motion). | Crisp pixels, and the eye still goes to the cause. |
| Q-16 | Foley for desk gestures. | A presentation cue (`actions.ui({do: 'cue'})`), never a sim input. | The replay log stays clean (F-6). |
| Q-17 | Where settings live. | A popover from the header (`,`): four volume sliders, REDUCED MOTION, REDUCED EFFECTS, CRT. It never pauses the game. | No menu wall. |

**Owner decision after the first play of the Phase 1b build (2026-10-01).** The owner played `next.html` and found it "SUPER unclear": the game wrote the plan and then played it, the best move was to touch nothing, a coal lever could be pulled to the floor with no warning, and the desk then repaired itself. Offered three ways forward, the owner chose "you write the plan, on the live desk".

| # | Question | Decision | Why |
|---|---|---|---|
| Q-18 | L-0 pre-fills the whole day's plan, commitment included, so a day with no input passes and the player has nothing to do. | **The commitment is the player's.** On `next.html` the system operator never starts or stops a unit. It dispatches the units the player has committed, in merit order, at 04:30, whenever the commitment changes, and every 5 grid-minutes (`app/system.js`, `commit: 'player'`). The day is the `desk` scenario: the classic day with CCGT 2 off at 04:00, so the morning ramp is the first decision (about 50 minutes of lead). The desk opens at 04:30 with the clock held. A one-line **objective** above the desk (`app/objective.js`) says what is needed next from a capacity look-ahead: the cheapest unit that still arrives in time, the latest moment to start it and how long it takes; it lights that unit's START guard and never acts. A lever moved by hand holds the levers until RE-DISPATCH, and the objective says so when that leaves the plan short. Alarm tiles say what they mean when pressed; ACK says when there is nothing to acknowledge; a map click selects the plant's control. | "The plan comes together" has to be the player's plan (OD-5). Real too: generators and the operator decide commitment hours ahead; NEMDE dispatches what is committed every 5 minutes. No planning screen and no RUN button (OD-16 stands): the plan is made on the running desk, with a free pause. |

Measured (`tests/objective.test.js`; `node tools/par.js --scenario desk`): with no input the `desk` day first sheds between 08:00 and 14:00 and leaves 35,000–50,000 MWh unserved on eleven seeds (black on some); a scripted player who does only what the objective line says ends with nothing unserved on 10 of the 11 and is never black; par on `desk` has zero unserved on 22 of 24 seeds and arms RERT on 4. **This replaces L-0's accept ("with no input, never F; median C or D") on `next.html`**: a no-input day is meant to fail. L-0's pre-dispatch still serves par, the bench and the forecast beyond 4.5 hours. Still to do (at Q-18): the hint-following player commits every unit by midday and never stops one, so the afternoon and the cost side of the plan are not yet a decision; a warning *before* a lever move commits.

**Both closed in Phase 2a (Q-28; `desk/README.md` §27).** The objective line now asks, below the shortfalls, for a **STOP** (a gas unit not needed for hours: what stopping saves, when to start it again), the **battery** (charge on spill, on a price ≤$0, or before an evening that needs it; discharge while gas sets the price; idle at the 20% reserve), **spare** with an action (raise the GUARD, or start hydro or a gas turbine), a reserve-diesel stand-down and a commit-later line; and hovering, focusing or lifting a START or STOP guard shows what the press will do before it is made. *Measured* (the hint-following player, `tests/lib/follow.js`; 11 seeds on each of `desk` and `desk-weekend`, against par on the same seed): nothing unserved and never black on 22 of 22 days; the reserve diesel armed on 1 of 22 (stood down the same day; before Phase 2a it was armed on 19 of 22 and never stood down); demand response 0.73 calls a day on `desk`, 0.18 on `desk-weekend`; customer cost within 1.3 × par's on 21 of 22 (mostly 0.9–1.1 ×; the miss is the diesel day, where par leaves 1,063 MWh unserved and the follower none); a gas unit stopped before noon and restarted on 20 of the 20 non-heatwave days; the plan's cost lower with the STOP and battery lines followed than without on 22 of 22, with unserved energy no higher on any; no line over 170 characters. With no input at all the day still fails on 22 of 22 (11,000–37,000 MWh unserved). Two accepts are not met as written: each STOP's quoted saving against the realised difference (38 of 140 within ±30% or $10,000 when the measure skips a whole queue of STOPs, 116 of 140 stop by stop; most morning misses come from trips, and the line says "if nothing trips before then"); and the battery at or above par's at 16:30 (5 of 6 on hot and heatwave days on each scenario; every miss is 0.2–2.1% under a full par battery, drawn down by AGC regulation).

**Phase 2a decisions (2026-10-02, delegated under OD-17; `desk/README.md` §18 C-1–C-14, §25 M-1–M-4, §26 N-1–N-4).** Q-19–Q-32 were taken before any code was written (C-1–C-14, in order); Q-33–Q-37 at the merges, from what was measured (M-1, M-2, N-1–N-3); Q-38 at stage C.

| # | Question | Decision | Why it is the most fun (and still real) |
|---|---|---|---|
| Q-19 | Which day gets rooftop PV? Nearly every test, the bench and the golden run the classic scenario; the game runs `desk`. | **The game's day does**: `desk` and `desk-weekend` have 5,000 MW of rooftop and MILD days. **Classic stays PV-free.** With no rooftop every new term is exactly zero (checked on 2,000,000 random states, 0 mismatches). S-12, S-14 and the P- accepts are measured on the game's day. | The day that is tuned is the day that is played. The golden becomes a guard on the physics instead of a casualty of every belly change. |
| Q-20 | P-3's day types before the director exists (D-8); the sim may not read a date. | MILD or HOT is fixed by the seed and public from 04:00. A heatwave day reads HOT until its heatwave is announced at 10:30, as before. The weekend is scenario data: the app picks `desk-weekend` when the seed reads as a Saturday or Sunday date. | A mild morning and a hot one differ by up to 1,400 MW, so the forecast must know which. A hidden heatwave must not leak (S-4). Heat seeds do not move: 308 of 2,000, as before. |
| Q-21 | What is a MILD day, and where does the weekend factor go? | Underlying = (hot-day curve − cooling) × 0.92 on a weekend × the heat uplift + noise, with cooling taken from the hot day's temperatures. The +6.5% uplift and the rooftop derate both follow the heat window. | The minima land inside P-3's bands on all four day types. A derate from sunrise would give the heatwave away. |
| Q-22 | P-2's "clear-noon output 3,500 MW" against its own curve, which gives 3,360 MW at 12:00. | The accept samples **solar noon, 13:00**, under a clear sky. The curve is a table of 15-minute points, so the sim calls no sine. | Only the wording was wrong. The curve, the sun times and every other number stand. |
| Q-23 | Per-suburb cloud, cloud fronts, and the forecast's rooftop error. | Each suburb's sky is **one shared regional sky plus a small local term**. The cloud front stays over the solar precinct, as its notice says, until the director gives fronts a 125–170-minute warning (slice 2c). The forecast's rooftop band is derived from this cloud process (L-2). | Suburbs of one city share a sky; six independent skies average out to a 1.7% forecast error. A front over every suburb would add about 1,570 MW of demand on 20 minutes' notice on 65% of days: unplannable. |
| Q-24 | Who curtails in the belly? Nothing did: with par on a rooftop stand-in, 16 of 24 mild weekends went black at 52 Hz. | **The dispatch does, automatically** (P-9): it spills surplus wind and utility solar pro rata, with the tie and the battery order as they are. It never charges the battery or moves the tie to make room. Spilled energy is counted and shown, never charged for. | NEMDE dispatches semi-scheduled plant down when its offer is marginal ("economic offloading", 18% of grid solar, §8.1). An idle battery must not fill by itself: free power stored against power spilled is the player's decision (OD-12). |
| Q-25 | H-8, risk 10: do inverters respond to over-frequency? A 256-MW potline trip at noon reached 51.26 Hz from a SECURE state, even with curtailment. | **Yes, lowering only** (H-8). Wind and utility solar: the governors' droop on rating, capped at present output. Rooftop: AS/NZS 4777.2:2020, falling from 50.25 Hz to zero at 52 Hz, held at the lowest value reached until 50.15 Hz. Real plant also raises from curtailed headroom; labelled. | Mandatory PFR binds semi-scheduled plant; the inverter settings are the standard's. Without them the belly has no downward response. In the watch the solar farm and the roofs are seen backing off. |
| Q-26 | P-12: what does a UFLS block shed, what counts as unserved, do blocks that are feeding back trip? | The relay MW is the dark districts' **net** load. **Unserved energy is the dark customers' underlying load.** Blocks are static and trip whatever their flow (labelled). Restored inverters wait 60 s, then ramp back over 6 minutes. | The unserved energy on LIGHTS ON must not shrink because the sun is out. Static blocks are the real concern (Victoria, 28 Nov 2021: 26% of underlying load left to shed). A restore meets the full load first, as it really does. |
| Q-27 | What do the MSL thresholds test, and where do notices live? The spec listed a 13th alarm tile; the panel is 4 × 3. | The lowest forecast operational demand (P50, the next 4.5 h, and now) against 1,600 / 1,300 / 1,000 MW, raised by 300 MW while the tie is out. **Twelve tiles stay**: MIN GEN becomes real, and MSL levels are MARKET NOTICE cards that say the one thing this desk can do. | AEMO's floors vary with the network. A tile for a forecast would chatter (K-8: ≤8 alarms a day); a card can say what to do. |
| Q-28 | The player's belly decision (Q-18's gap: every unit is committed by midday and nothing is ever stopped; no warning before a press). | The objective line gains **STOP** (a gas unit not needed for hours: what stopping saves, when to start it again), **BATTERY** (charge on spill or a price ≤$0, or before an evening that needs it; discharge when gas sets the price), a stand-down for the reserve diesel, and a commit-later line. Gas only: never coal, never hydro. **Before any guarded press**, hovering, focusing or lifting a START or STOP guard shows what the press will do (`? IF PRESSED`). *Built; measured under the Q-18 paragraph.* | A decision with a lead time on every day type: fuel saved now against a restart later. The coal lever's trap is real, and is now said before the press. |
| Q-29 | L-5's blue over-reported: it counted price-taking imports (10 blue columns at $26 with nothing spilled). | Blue = **projected spill**: the dispatch's own sum (Q-24) run on the P50 forecast, where it is more than 50 MW. Its own mark, never a kind of gap. | Blue should mean "this will be wasted", which the player can act on. It then agrees with what the sim spills. |
| Q-30 | S-14 as written; how minimum down time is counted. | Rule 2 joins S-4 rule 6. Rule 3 is reworded: export, charge, and the dispatch curtails the rest. Rule 4 gains a coal branch that is expected never to fire. Rules 1 and 5 wait for slice 2b. Minimum down time keeps the code's count, from breaker open to the next START order (54 min longer for coal, 39 min for a CCGT, than breaker to breaker); labelled. | Buildable and measurable. Every text works out a unit's return from its own times, so the desk can say "not back at minimum load before 21:14" and be right. |
| Q-31 | `SIM_VERSION` and the golden. | `v4-core-2a.0` when the new state shape landed; the golden re-recorded by the integrator at each merge; `v4-core-2a.1` after the stage C tuning. | One generated file, one writer. |
| Q-32 | May a do-nothing weekend pass? On a mild weekend the weekday's 04:00 fleet nearly covers the evening. | **No.** `desk-weekend` opens leaner: coal 4 off since Friday night, both CCGTs on. Tuned once at the merge (it first opened with one CCGT and leant on hydro from 04:00). The no-input day fails on 11 of 11 seeds of each scenario. | Q-18: the best move must never be to touch nothing. Coal units really are taken off over low-demand weekends. The weekend's decision: bring the fourth coal machine back by mid-afternoon, or run gas tonight. |
| Q-33 | The +300 MW tie rise, applied to the whole 4.5-h window, raised MSL1 for morning tie outages that ended hours before the belly: 35 of 37 long-lead notices were cancelled before their minimum. | **Per column** (P-4): the present counts while the tie is tripped; a forecast column only if it falls before the tie's announced return. P-4 stays in band. | A notice should still be true when its hour arrives. |
| Q-34 | Directed shedding took the next district in the rotation whatever its net load: a district at −33 MW tipped a 4-MW shortfall into UFLS. | It **passes over a lit district whose net load is ≤ 0** (P-12). UFLS blocks stay static. The desk names the district the sim will shed. | An operator chooses what to shed and would not shed a suburb that is feeding the grid; relays cannot choose. |
| Q-35 | Blue left out demand response and a battery DISCHARGE order, which the dispatch's cut counts (350 and 200 MW low in those cases). | Both are counted (L-5). | Blue and the sim must agree, or the hint misleads. |
| Q-36 | Par counted its own battery orders to the end of their window, so its night recharge was never in its plan. | **Every battery order counts for the energy behind it**, par's and the player's (S-4). Classic par moves (198 of 200 rows); S-12 holds on all three scenarios. | Par is the yardstick: its plan should know what its own battery is doing. |
| Q-37 | The map's sun disc sets at 18:48; the scenario's sunset is 19:48. | **Not moved.** The light, and so the rooftop glint, reaches zero at 19:48 (G-3). | Tried and seen: a sun on the horizon under a starry sky. Dusk stays on the evening neck. |
| Q-38 | A STOP on a hot morning can lose money: if a unit trips in the afternoon, the stopped CCGT is missed (3 of 10 hot-day morning STOPs realised −$49,000 to −$90,000 against a quoted +$31,000 to +$36,000). | **Keep it, as a stated bet.** On a HOT morning the line waits until 10:30, when a heatwave can no longer be announced, checks the afternoon with the heat added, and says the saving "if nothing trips before then". | Two-shifting a CCGT is a real bet against the afternoon, and saying so is the honest version. Pricing in each day's trip risk would hide the decision behind a number the player cannot check. |

Left open by these records for the stage C tuning of 2a (M-4, N-4): a plan held far above minimum with no surplus parks frequency high (600 MW above: 50.13 Hz; 1,000 MW above: 50.28 Hz; never OFGS, never black), which only hand-held levers reach, because the dispatch re-plans every 5 minutes; in a deep belly an idle battery is charged by AGC with the excess, and with no room left frequency parks at about 50.35 Hz until a unit is stopped; after a trip in a surplus, par still starts a peaker and imports while the dispatch is spilling; negative prices on mild weekdays fall short of P-9's band.

**Delegated tuning decisions (2026-09-30, "most fun within realism").** Recorded here with their measured effect (S-12 has the table):

| # | Decision | Why |
|---|---|---|
| D1 | S-11 minimum down time applies to planned decommitment only. After a protection trip a unit is locked out (90–150 min, simplified) and may then hot-start. | A coal machine that tripped at noon used to be held off for 8 h and missed the evening peak it was needed for; real minimum down times are a planned-stop constraint (thermal cycling), and the return after a trip is set by the fault, not by the commitment rule. |
| D2 | GT·C becomes 2 × 300 MW (Q-3's knob). | The largest single risk is unchanged. Measured with the tuning pass's par (raw clean / RERT / heat clean; the finishing pass moved heat to 75%, S-12): 1 × 300 MW 76.0% / 54.0% / 44%, 2 × 250 MW 86.0% / 35.5% / 68%, 2 × 300 MW 89.5% / 23.5% / 76%; only the top of the allowed range (1–2 × 150–300 MW) meets S-12. |
| D3 | Par's RERT rule and the fleet aim at S-12 (zero unserved ≥85% raw / ≥75% heat, RERT ≤25%, S-11 ≥70%, lean A ≤40%). | RERT is an emergency (Q-2), so par counts firm capacity honestly and arms only on a shortfall it can still reach. |

### 9.2 Risks

1. **The changing playback speed may confuse.** There is one grid clock, but playback speed varies 14,000-fold between WATCH (0.15×) and the night roll (2,100×). *Mitigation:* the speed badge is always visible, and a "?" explains it. Gate 1 checks this.
2. **The watch eats the session.** A 29-s full / 10.5-s compact watch sits inside a ~5-min day. *Mitigation:* the full version plays once, the compact one is skippable; D-2 budgets it. Even so, link to SHARE is ≈5:35 for a returning player and ≈6:45 on a first shift (D-2), because the grid clock alone is 245 s and the debrief up to 45 s. If gate 1 finds that too long, the cheapest cuts are offering SHARE on the verdict card before the debrief, and folding the night roll into the verdict.
3. **Cognitive load.** Map + stack + levers + suburbs. *Mitigation:* at most 5 introductions on a first shift, with the rest spread over dailies 2–5 and everything else under cover plates run by Marg (O-3); plain-language faces; a simplified first-shift Live Stack; the U-2 three-lever limit; L-9 hints. The greybox check and gate 1 decide.
4. **Heat days may be rarely solvable.** The day lab found 11% at full severity on today's physics. Rejection sampling (D-9) keeps severity, but may not keep 15% heat days. *Mitigation:* the city tools and S-12; daily-gen reports the achieved share.
5. **Cross-engine floating point.** `Math.exp`/`sin`/`pow` can differ between browsers. *Mitigation:*
   - no transcendental functions in per-tick code;
   - quantised pre-rolled series;
   - a `?selftest` golden-hash page, checked in each browser before release;
   - the stored par is authoritative (F-8).
6. **Every balance number is from v2 physics.** Governor lag, UFLS at 49.0 Hz and rooftop PV all move them. *Mitigation:* re-measure at each phase exit (§6).
7. **The share sparkline leaks timing.** Everyone's trip dips the same block. Accepted; the sparkline shows the result, not the event.
8. **`file://` no longer works.** ES modules need http, so offline and emailed copies break. Accepted with OD-15.
9. **Safari may clear script-written storage** after 7 days without a visit ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). Streaks can reset. Say so in the history panel.
10. **Low-inertia over-shedding.** At noon with little spinning plant, UFLS can over-shed into over-frequency (desk E4). This needs H-7 over-frequency handling and P-12 net-load blocks before Phase 2 ships. Re-run on the v4 engine (H-7, review-fix pass): 6.5 GW·s with no battery and a −650 MW trip still sheds 7 stages and goes black past 52 Hz before OFGS acts; with the battery in service, 3 stages and a 50.49 Hz peak. Wind and solar droop (§8.2) would also cut the rebound. **Outcome (Phase 2a):** both remedies are built: UFLS blocks carry net load (P-12), and wind, utility solar and rooftop inverters back off on over-frequency (H-8, §9.1 Q-25). Re-run (H-7): the same case still sheds 7 stages (1,792 MW for 650 MW lost) but no longer goes black; the rebound peaks at 51.08 Hz with one OFGS stage. Rebuilt at a mild 12:30 with 3,465 MW of rooftop on net-load blocks: all 8 stages take 1,295 MW net for 650 MW lost and leave 2,942 MW of customers dark; peak 50.44 Hz, not black (black at 52 Hz with the inverter response switched off). So the collapse is closed and the over-shed is not: at a sunny noon static blocks darken more than twice the customers for each MW they shed. That remainder is labelled (§8.2), and the real remedy, disarming blocks that are feeding back, is not modelled.

### 9.3 Judgement calls made while composing this spec

| # | Conflict | Resolution |
|---|---|---|
| J-1 | Physics between events: quasi-steady (day, rules drafts) vs always integrated (tech) | Always integrated at 20 ms (F-4). It costs ≤0.3 ms per frame even at 2,100×. |
| J-2 | Inputs during the watch: queued to its end (tech) vs locked (desk, day) | Locked. Queued orders could not change the nadir anyway (critique #13). |
| J-3 | Watch timing: 0.25×/1×/5× over 20 s (day) vs 0.15×/1×/10× over 29 s (desk) | Desk schedule. The nadir arrives at 0.5–3.6 s, so the slowest speed must cover 0–3 s. A compact 11-s version plays after the first. |
| J-4 | After the watch: 30× "procedure pace" for 20 s (desk) vs a 30-min window at 90× (day) | The respond card holds the clock (no reflex). Then 30× for the 5-minute FOS window, then profile speed with the 30-min "secure" countdown. |
| J-5 | SYNC speed: 30× (desk), 2× display (day), 1× FOCUS (tech) | 1× with a labelled 3×-fast slip. Only the first shift's first start needs a manual SYNC; later starts auto-sync after 4 grid-minutes unless the player takes the scope, so a clean manual close still matters in RESPOND and at the peak (changed from 1 grid-minute after review). This keeps the 5-min budget. |
| J-6 | UFLS stages: 6 × 0.2 Hz (rules) vs 8 × 0.125 Hz (desk); relay 0.2 s (desk) vs ~0.3 s (facts) | 8 stages × 6% (two districts per stage); 0.3 s (primary source). |
| J-7 | Governor droop 5.7% and battery trigger ±0.15 Hz (rules) vs 5% and ±0.015 Hz (desk, facts) | 5% and ±0.015 Hz (NEM mandatory PFR). |
| J-8 | Two gauges: "can catch" (desk) vs one reserve R5 (rules) | One reserve number, R5 vs L. Seconds-scale adequacy is the TRIP PREVIEW. |
| J-9 | ID changes | The desk's K-14 engine becomes H-8 (Phase 0). The rules draft's S-8 merges into D-9 and S-13 into D-8. O-7 becomes Playtest gate 1. Pointers are left in place, and IDs are never reused. |
| J-10 | Scoring display: golf marks (day) vs letter + stars (rules); CO₂ tonnes (day) vs intensity (rules); $/MWh vs ¢/kWh | Letter + per-axis marks + ★ at par or better. CO₂ graded as t/MWh with the total shown. Cost in ¢/kWh, because bills are in ¢/kWh. |
| J-11 | Share card: frequency sparkline (day) vs green/red/blue hourly squares (livestack) | The text card uses the sparkline (no emoji, Y-4). The hourly strip goes on the debrief and the PNG card. |
| J-12 | Solvability: in-browser Worker gate that steps heat down (day) vs offline generator (tech) | Offline `tools/daily-gen.js`; heat severity is never reduced (critique #8). Rejected seeds are replaced within the same temperature class. The stored par is authoritative. |
| J-13 | Weather mix: storm 30% (rules) vs 25% + drought 20% (day); day types unassigned (livestack) | Heat 15 / hot 30 / mild 55; weekends from the real calendar (×0.92); storm 25%, drought 20%. HOT/MILD is a starting value. |
| J-14 | Tie: flat $58/$40 (rules) vs a 300 MW midday export cap (livestack) | Both. Export capped at 300 MW 09:00–16:00, and the neighbour's price follows a daily shape. |
| J-15 | Storage keys `gw.v1.*` (day) vs `gridwatch:v4:*` (tech) | `gridwatch:v4:*`. |
| J-16 | Desk DR button vs city demand response | The desk button is *industrial* DR (350 MW, 3 calls); households live on the map (U-). |
| J-17 | Live Stack horizon: 3 h (desk wireframe) vs 4 h (livestack) | 4.5 h: the coal start plus climb is 4 h 17 min (changed from 4 h after review). |
| J-18 | Rooftop size: 2,000 MW (rules test) vs 4 GW (day placeholder) vs 5,000 MW (livestack) | 5,000 MW. Negative prices need ≥3,000 MW at noon. |
| J-19 | Restore permissive: f ≥49.85 Hz (desk) vs ≥49.9 Hz and R5 ≥1.2 × block (rules) | Rules version, applied per district, one per 5 grid-minutes. The tuning pass replaced R5 ≥ 1.2 × block with a RESTORE PREVIEW of the pickup (K-13). |
| J-20 | HAND mode: a mid-day key switch (desk) vs a mode (day) | Chosen at the briefing and locked for the day; the key shows it. |
| J-21 | Wind/solar offer −$40 (rules) vs real shallow negatives (facts) | −$20. The real Q4 2025 average negative price was −$19.4. |
| J-22 | Peaker minimum 12% (today) | 50% (Aurecon reference). Re-tuned with S-12. |
| J-23 | "Rotational shedding replaces UFLS" (synthesis) | Rejected (critique #1). UFLS stays automatic. Directed shedding is the FOS fallback (H-11), plus a DIRECT SHED key when LOR2 is forecast (K-7). |
| J-24 | Suburb "Riverton Flats" collides with the Riverton CCGT | Renamed Redgum Flats, subject to the H-15 check. |
| J-25 | Beat order of the watch: the owner's wording (OD-8) is "inertia → governors → battery FCAS → UFLS"; the physics prototype has the battery first | Physical order: inertia → battery → governors → UFLS (K-15). Battery fast response starts after ~0.2 s (0.1 s dead time + 0.1 s lag, H-8); governors after 0.2–0.5 s of dead time plus 1.5–5 s of lag. OD-8 is quoted as the owner said it; the order is corrected on physics grounds, as realism is sacred (OD-6). |
| J-26 | Review of 2026-09-30 (alignment and accuracy) | Applied here: PV before gate 1; the desk as the dispatch spine; no action buttons on cards; SYNC and RESTORE made to matter; the first shift trimmed to 5 introductions; pre-dispatch; a viewport-based layout; the sharing funnel; seasons; a smaller Phase 0.1 and a split Phase 1; H-8 numbers relabelled; load relief 0.5%; SECURE needs the preview; warning leads; the stop/start profile; 2 × 400 MW GT·B; MSL steps. Not applied as proposed: the ≤6:00 / ≤5:00 link-to-SHARE targets (below the D-2 arithmetic), and MSL3 was set at 1,000 MW rather than left at 800 (P-4). |

---

## 10. Verification method

**Local run.**
- `.claude/launch.json` defines `gridwatch` (`py -m http.server 8642`) at `http://localhost:8642/`.
- ES modules need http. Never use `file://`.
- Use `next.html` for v4 work until F-14.

**Headless tools** (Node ≥20, no dependencies):

| Tool | What it does |
|---|---|
| `tools/harness.js`, `tools/policies.js`, `tools/baseline.js` | Today's build (CommonJS, pinned by `tools/package.json`). `node tools/baseline.js [N]`; `GRIDWATCH_HTML=copy.html` measures a patched copy. Golden output: F-12. |
| `tools/par.js` (Phase 0.2) | Runs `sim/autopilot.js` and the player proxies on any seed; prints the scorecard, par, prices and the §6 rows. |
| `tools/daily-gen.js` (Phase 2) | Writes `content/dailies.js` (D-9, F-8). |

**Tests.**
- `node --test` runs `tests/*.test.js` (F-10): determinism, streams, rate invariance, physics sanity, the information barrier, persistence stubs, the share-card lint, the charset check and the sim lint.
- A GitHub Action runs it on push.

**Browser checks.**
- `?perf` shows frame costs (F-11).
- `?selftest` replays golden input logs and compares `hashState` (risk 5).
- Before release, check Chrome, Edge and Firefox on desktop.

**Visual QA.**
- Browser-pane screenshots do not composite in this environment, so they come back blank.
- Instead, run a local receiver (`node tools/shot-receiver.mjs`, a small Node http server that saves POSTed PNGs into the git-ignored `shots/`).
- From page JS, `POST canvas.toDataURL()` for the map, dial and synchroscope canvases, then read the saved PNGs.
- DOM parts of the desk are checked by reading the accessibility tree.

**Playtests.** Gates 1 and 2 (§5), with the protocol and pass criteria as written. The owner keeps a one-page log per tester.

---

## 11. Release checklist

**Every phase:**
- [ ] `<meta charset="utf-8">` is first in every HTML file (C-2; test)
- [ ] Restart, retry and next-day are in-page resets; no `location.reload()` (C-3; grep)
- [ ] No request to another origin; no build step (C-1)
- [ ] `node --test` is green; `tools/baseline.js` golden diff is empty or intentionally re-recorded (F-12)
- [ ] §6 rows for this phase re-measured and pasted into the PR
- [ ] Pushed to `main`, the Pages build is green, and the live site is verified with `curl -sI https://databerryau.github.io/gridwatch/` and a manual play (C-4)

**Phase 0.1:**
- [ ] H-1, H-2, H-3, H-5, H-9, H-10, H-13, H-15, H-16 and S-10 are visible in the live legacy game
- [ ] The baseline is re-recorded after the honesty fixes

**Phase 0.2:**
- [ ] `.nojekyll` and `package.json` are present (F-1)
- [ ] `tools/par.js` works
- [ ] The H-8 containment test passes
- [ ] S-12 par ≥85% raw seeds
- [ ] `next.html` bench plays a day

**Phase 1a:**
- [ ] Manual pass at 1280×600, 1280×720 and 1920×1080 viewports (K-17)
- [ ] The §4.1 script's dispatch inputs are ≥50% on the desk (K-1)
- [ ] **Greybox check passed** (two new people)

**Phase 1b** (may land after gate 1):
- [x] A keyboard-only day (K-23): scripted, `tests/day.test.js`. A person playing a whole daily by keyboard is still to do
- [x] Reduced motion (the `rm` class, tile rates, map statics: tests) and status without colour (each state's glyph, word or pattern: tests). A greyscale screenshot was not taken
- [x] Visual QA PNGs of the map (day, afternoon, night, the watch spotlight), the dial, the Live Stack and the synchroscope (`tools/shot-receiver.mjs`)
- [x] `?perf` within budget (F-11, script time; paint not measured)
- [ ] Listen to it: every sound was checked against a stand-in audio context only

**Phase 2** (delivered in slices 2a–2e; a box is ticked only when every slice it depends on has landed):
- [ ] P-1–P-4 targets met
  - 2a, met (2026-10-02): P-1 (the identity every grid second, smelter term included); P-2 (3,500 MW at 13:00, 386 MW at 18:48, 52% under k = 0.32); P-3 (all four medians in band); P-4's frequencies (MSL1 on 16.7% of mild weekends, MSL2 on 1.3%, MSL3 never)
  - 2a, not met as first written: P-4's 2-hour lead (reworded, P-4)
  - still to come: P-1's debrief plot (2d); cloud fronts over the suburbs and the heatwave announced at the briefing (2c)
- [ ] S-14 par re-tuned; S-12 targets met, including §9 Q-3 (lean proxy A ≤40%) and Q-2 (par arms RERT ≤25%)
  - 2a, met: S-14 rules 2–4 built; on the game's day par sheds zero on 96.0% (`desk`) and 98.5% (`desk-weekend`) of raw seeds and on 86 and 98 of 100 forced-heat seeds; par arms RERT on 6.5% and 0.5%; no black day
  - 2a, missed and open: negative prices on mild weekdays (P-9: median 1.68 h against 2–6 h); three SECURE states of 12,909 miss 49.5 Hz, each on a cached preview (S-12)
  - still to come: S-14 rules 1 and 5 (2b); the lean and competent proxies on the game's day (2b / 2d); the fleet re-tune of Q-3, if those proxies call for one
- [ ] 2a closed: the objective line (§9.1 Q-28) built and its accepts measured; the stage C tuning; the audible alarms of the competent proxy on mild seeds (K-8, ≤8); visual QA PNGs of the map at a mild noon and the Live Stack with a surplus; `SIM_VERSION` `v4-core-2a.1` and the golden re-recorded
- [ ] U-1 names checked
- [ ] D-2 timing runs (verdict and link-to-SHARE)
- [ ] D-8 director test on 2,000 dates
- [ ] D-24 cards fact-checked
- [ ] **Playtest gate 1 passed**

**Phase 3:**
- [ ] VPP, hold, EV delay and backstop in place; S-14 extended to them
- [ ] P-10 battery P&L positive under par
- [ ] §6 rows re-measured

**Phase 4:**
- [ ] `dailies.js` covers ≥365 days, and the Action warns below 60 (F-8)
- [ ] `?selftest` passes in Chrome, Edge and Firefox
- [ ] Share card pasted into at least two messaging apps
- [ ] The link unfurls (`og:` tags, image, favicon), and a phone gets the Y-8 landing page
- [ ] `classic.html` live
- [ ] **Playtest gate 2 passed**

**Launch plan (after gate 2).** One itch.io page, which links to the Pages URL and does not host a copy (C-4), and one launch post. Lead with the model rather than the game: grid games have scored 3–12 points on Hacker News, while a "realistic model" simulator scored 815 (comparables §5). The post links the §8 realism ledger ("what the model does and doesn't capture"). Candidate venues: Show HN, LinkedIn (how NESO launched *Balancing the Grid*), and NEM commentators such as WattClarity.

**Phase 5:**
- [ ] Week seeds identical across machines
- [ ] W-5 audit

---

## Appendix A. v3.0 → v4 mapping

Each v3.0 ID is **absorbed** (the finding is kept as a defect, X-), **changed** (the intent survives in a new form) or **dropped**.

| v3 ID | v3 item | v4 fate | Why |
|---|---|---|---|
| C-1 | Single self-contained file | **Changed** → C-1 static multi-file site | Owner dropped the single-file rule (OD-15) |
| C-2 | Charset meta first | **Kept** as C-2, for every HTML file | — |
| C-3 | In-page restart | **Kept** as C-3 | — |
| C-4 | One canonical host | **Kept** as C-4; playtest pages on the same host | — |
| C-5 | Physics defensible | **Strengthened** → C-5 + §8 ledger | OD-6 |
| Soft budget | ~200 KB file | **Changed** → F-11 (≤400 KB first visit) | Multi-file |
| F-1 | rAF loop | **Changed** → F-5 loop + director; absorbed as X-26 | Needs a director and rate invariance |
| F-2 | Seeded RNG | **Changed** → F-3 three streams; absorbed as X-25 | One stream fails its own test |
| F-3 | Gauge caption | **Absorbed** as X-35 → K-11 | Gauge replaced by the dial |
| F-4 | Trace window | **Absorbed** as X-36 → K-11, D-23 | Replaced by the 3-min trace and scrub |
| F-5 | Integer map scale | **Absorbed** as X-37 → G-1 | — |
| F-6 | Coal on the slab | **Absorbed** as X-38 → G-1 | — |
| T-1 | Speed tiers 0.25×–4× | **Changed** → D-2 profile + D-6 pause/fast | Speed follows the tension |
| T-2 | Auto-slow on contingency | **Changed** → K-15 watch | True physics played live in slow motion, no input |
| T-3 | AGC per unit | **Changed** → K-2, on by default, plus S-11 costs | OD-7; the "≥90% in band" criterion was wrong |
| T-4 | Dispatch board | **Changed** → K-1 lever bank | Desk as instrument |
| T-5 | Graded collapse | **Changed** → H-7 at real FOS limits | Realism |
| T-6 | Imbalance instrument | **Changed** → K-11 bar + K-10 gauge; the "+30/+60 min" readouts → L-5 | — |
| T-7 | Setpoint input | **Changed** → K-23 keys + L-4 keyframes | — |
| L-1 | Fill the frame | **Changed** → G-1 | — |
| L-2 | Asset silhouettes | **Changed** → G-2 | — |
| L-3 | Label discipline | **Changed** → G-2, K-18 | — |
| L-4 | Retime dusk | **Changed** → G-3, keyed to rooftop PV | The peak moves to ~19:35 |
| L-5 | Weather reads | **Changed** → G-4, U-8 | — |
| L-6 | Visible load shedding | **Changed** → G-5, K-15 beat 4 | Districts = suburbs |
| L-7 | Trip drama | **Changed** → G-5, K-15 | — |
| L-8 | Power-flow colours | **Dropped** | One-node network; "colour near limit" would teach a false model |
| L-9 | Demand-chart gap | **Changed** → L-5 red/amber/blue columns | The Live Stack replaces the chart |
| L-10 | 60 fps polish | **Changed** → F-5, F-11, G-1 | — |
| L-11 | Selection emphasis | **Dropped** | No single selection; hover links map and lever (G-2) |
| S-1 | Scenario system | **Changed** → F-13 + D-8 events as data | — |
| S-2 | Short drills | **Dropped** | The daily is the 5-min unit; labelled "Hard days" in the practice menu (S-7) cover hard scenarios |
| S-3 | Difficulty tiers | **Changed** → one daily + HAND mode (D-7) + coaching switch (O-1) | Fairness comes from par, not tiers |
| S-4 | Supervisor hints | **Changed** → O-5, O-6, L-9 | Hints explain why and never state the plan |
| S-5 | Persistence | **Changed** → F-7, Y-3 | — |
| S-6 | Debrief replay | **Changed** → D-21–D-23 | Adds the counterfactual |
| S-7 | Live score | **Changed** → K-17 header chips | — |
| S-8 | Tutorial hand-off | **Changed** → O-1 first shift is the daily | No separate tutorial |
| R-1 | Mobile layout | **Dropped** | Desktop only (OD-2) |
| R-2 | Accessibility | **Changed** → K-23 | — |
| R-3 | Colour independence | **Changed** → K-22 | — |
| R-4 | Motion settings | **Changed** → K-22 | — |
| D-1 | Clipped caption | **Absorbed** as X-35 | — |
| D-2 | Trace label | **Absorbed** as X-36 | — |
| D-3 | No viewport meta | **Dropped** | Desktop only |
| D-4 | Coal overhang | **Absorbed** as X-38 | — |
| D-5 | Non-integer scale | **Absorbed** as X-37 | — |
| G-a..G-m, P-a..P-l, R-a..R-e | v3 §2 findings | **Superseded** by §3 | Those still true are X-1..X-38; P-b's 2.3 s became §3.2's 2.1 s (re-measured) |
| §6 decision 1 | AGC? | **Decided** — on by default | OD-7 |
| §6 decision 2 | Mobile? | **Decided** — no | OD-2 |
| §6 decision 3 | 120× as 1×? | **Replaced** by the D-2 profile | — |
| §6 decision 4 | Art scope | **Changed** → G-1–G-5, modest; revisit for week mode | — |

---

## Appendix B. Glossary

| Term | Meaning |
|---|---|
| **AEMO** | Australian Energy Market Operator. Runs the NEM and its control rooms. |
| **AGC** | Automatic generation control. Software that nudges generators every few seconds to hold 50 Hz. |
| **Base point** | The MW a unit is scheduled to produce; the lever handle. |
| **Belly** | The midday dip in operational demand caused by rooftop solar. |
| **Cold-load pickup** | The extra load when a district that has been off comes back (fridges and air-cons all start at once). |
| **Contingency** | A sudden failure: a generator, line or big load tripping. **Credible**: one the rules expect you to survive. |
| **Cover plate** | On a first shift, a blank plate over a control not yet introduced; Marg runs that control until the plate lifts (O-3). |
| **CCGT / OCGT (GT)** | Combined-cycle gas turbine (efficient, slower) / open-cycle gas turbine or "peaker" (fast, costly). |
| **Curtailment** | Turning wind or solar down even though the energy is available. |
| **Deadband** | The small frequency range where automatic response does nothing (±0.015 Hz). |
| **DR** | Demand response: customers paid to use less. |
| **Droop** | How strongly a governor responds. 5% droop means full output change for a 5% (2.5 Hz) frequency change. |
| **Duck curve** | The shape of demand after solar: a hollow middle (belly) and a steep evening neck. |
| **FCAS / FFR** | Frequency Control Ancillary Services, the markets that pay for frequency response / Fast frequency response, usually from batteries, in under a second. |
| **FOS** | Frequency Operating Standard. The rulebook for how far and how long frequency may stray. |
| **Governor** | A generator's automatic speed controller. It opens the throttle when frequency falls. |
| **Grid-forming / grid-following** | A grid-forming inverter sets its own voltage and frequency and can give an inertia-like response; a grid-following one tracks the grid and responds after measuring it (H-17). |
| **GW·s** | Gigawatt-seconds: the unit of stored spinning energy (inertia). |
| **Inertia** | Energy stored in the spinning mass of big synchronous machines. It slows how fast frequency falls. |
| **Interconnector / tie** | The link to the neighbouring region. |
| **L** | The largest credible contingency: the biggest single thing that could trip right now. |
| **LOR1/2/3** | Lack of Reserve levels: 1 and 2 are warnings; 3 means load is being shed. |
| **Merit order** | Using plant cheapest-first; the last unit needed sets the price. |
| **MPC / floor** | Market price cap ($23,200/MWh) / market floor price (−$1,000/MWh). |
| **MSL1/2/3** | Minimum System Load notices: demand forecast too low to keep the grid secure. |
| **Minimum stable generation (MIN)** | The lowest output a thermal unit can hold without shutting down. |
| **N-1** | Being able to lose the single largest item and still cope. |
| **Nadir** | The lowest point frequency reaches after a trip. |
| **NEM** | National Electricity Market (eastern and southern Australia). |
| **Net load** | A district's demand minus its own rooftop solar output: what its feeder actually carries. At a sunny noon it can be near zero, or negative (P-12). |
| **Normal band** | 49.85–50.15 Hz. |
| **OFGS** | Over-frequency generation shedding: automatically tripping generators when frequency is too high. |
| **Operational / underlying demand** | What the grid must supply / what homes and businesses actually use, before rooftop solar. |
| **P10 / P50 / P90** | Forecast range: 10% chance below, median, 10% chance above. |
| **Par** | The result of GRIDWATCH's fixed reference dispatcher on the same day, using only what a player can see. |
| **PFR** | Primary frequency response: governors and inverters reacting to local frequency. |
| **Pre-dispatch** | The schedule the stack holds at 04:30: merit order for the median forecast (L-0). In the NEM, AEMO publishes pre-dispatch and generators self-commit against it. |
| **R5** | Reserve deliverable within 5 minutes. |
| **Rebound / snapback** | Load that returns after a demand-response action ends. |
| **RERT** | Reliability and Emergency Reserve Trader: AEMO's emergency reserves (our diesel). |
| **RoCoF** | Rate of change of frequency, in Hz per second. |
| **Rooftop PV / backstop** | Behind-the-meter solar / the emergency power to switch newer rooftop systems off. |
| **Seed** | The number that fixes all the randomness of a day. |
| **`SIM_VERSION`** | The rules version. Results are only comparable within one version. |
| **Slip** | The speed difference between a machine and the grid; how fast the synchroscope needle turns. |
| **Solar noon** | The moment the sun is highest: 13:00 on our late-summer day, half way between sunrise and sunset (P-2). |
| **Spill** | Wind or solar power held back because nothing can take it. The dispatch does this automatically when the units that must run, plus the wind and sun on offer, exceed demand (P-9). |
| **Swing equation** | df/dt = f₀·ΔP / (2·Ek): how fast frequency changes for a given imbalance and inertia. |
| **Synchroscope / SYNC** | The dial used to close a generator's breaker when it is in step with the grid. |
| **T1–T4** | The NEM's fast-start inflexibility profile: time to synchronise, time to reach minimum load, time at minimum, time to shut down from minimum (F-13). |
| **UFLS** | Under-frequency load shedding: relays that automatically cut blocks of customers below 49.0 Hz. |
| **VCR** | Value of Customer Reliability: what an outage costs customers ($30,000/MWh NEM-wide). |
| **VPP** | Virtual power plant: many home batteries dispatched together. |
| **Watch / respond** | GRIDWATCH's trip sequence: the first 30 s played live in slow motion, then the player's turn. |
