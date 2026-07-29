# GRIDWATCH — Improvement Spec & Requirements

**Target release:** v3.0
**Written:** 2026-07-30
**Applies to:** `index.html` (v2.0, 1,522 lines, 88 KB, single file)
**Repo:** [databerryau/gridwatch](https://github.com/databerryau/gridwatch) — `main` is the live GitHub Pages branch
**Status:** planning — not yet implemented

---

## 0. Purpose

v2.0 is a complete, working grid-dispatch simulator with a strong physics model and an
atmospheric isometric map. It is also hard to approach: a new player is blacked out
roughly four and a half real minutes into a twelve-minute shift, and the events that
kill them resolve faster than they can read the interface.

This document reviews the current build against measured evidence, states a design
thesis, and specifies the work to make GRIDWATCH both better looking and genuinely
playable by someone who has never dispatched a power system.

Requirements are numbered and have acceptance criteria so they can be picked up
one at a time.

---

## 1. Constraints that must not break

| # | Constraint | Why |
|---|---|---|
| C-1 | **Single self-contained HTML file, `index.html`.** No build step, no external requests. | Published two ways: GitHub Pages (`main` at `databerryau/gridwatch`) and a private Claude artifact. Both depend on one file. The game file *is* the Pages entry point — there is no copy or build step, and there must not be one, because that is what let the two drift apart before. |
| C-2 | `<meta charset="utf-8">` stays first. | Plain static servers garble the UTF-8 glyphs without it. |
| C-3 | Restart is an in-page state reset (`freshState()` / `restart()`). Never `location.reload()`. | Unreliable inside the preview pane and the artifact sandbox. |
| C-4 | The two published copies stay in sync when the game changes. | Otherwise the public link silently rots. |
| C-5 | Physics stays defensible. | The appeal is that it behaves like a real control room. Ease the *interface*, not the laws. |

Soft budget: the file may grow to ~200 KB. Past that, revisit C-1.

---

## 2. Current state — measured review

Everything in this section was measured against the running build, not inferred.

### 2.1 What works and should be preserved

- The simulation core: swing-equation frequency, inertia from committed synchronous
  plant, governor droop, battery FCAS with a ±0.10 Hz deadband, ramp rates, start
  times, minimum generation, water budgeting, scarcity pricing under a $300 cap
  contract. It is legible and it behaves correctly.
- The night scene is the best-looking thing in the game — lit city windows, moon,
  stars, warm glow pool over the city.
- The 10-chapter tutorial with gated tasks, element highlighting and time-skips.
- The event log as a narrative device. Warnings arrive before events.
- Painter-ordered isometric rendering with a crisp screen-space overlay for bars and
  labels — the right architecture.
- **Performance is not a problem.** Measured per frame: map 0.90 ms, freq trace
  0.36 ms, `ui()` 0.19 ms, demand chart 0.16 ms, gauge 0.09 ms — **1.7 ms against a
  100 ms budget**. There is roughly 50× headroom for richer visuals.

### 2.2 Graphics findings

| # | Finding |
|---|---|
| G-a | **The whole game renders at 10 fps.** `setInterval(…, 100)` drives `tick()`, which calls `draw()`. Blade spin, smoke, power packets, cloud drift and the needle all visibly step. This is the single largest cheap visual win, and per 2.1 it costs nothing. |
| G-b | **Non-integer map scale.** A 560×330 offscreen buffer is blitted `image-rendering: pixelated` at 1.37–1.62× depending on window size. Pixel doubling is uneven, which fights the pixel-art look it is going for. |
| G-c | **Sky appears below the ground plane.** The sky gradient fills all 560×330; the terrain diamond does not reach the bottom corners, so blue sky shows *beneath* the land. Breaks the illusion and wastes ~20% of the canvas. |
| G-d | **The coal station hangs off the map.** Its cooling tower and stacks overhang the NW edge of the terrain slab. |
| G-e | **Assets do not read apart.** Peaker halls, battery containers, the solar inverter hut and the transformers are all small grey/white cuboids. Without the text labels you cannot tell what you are looking at. |
| G-f | **Ten permanent text labels.** `drawOverlay()` draws a nameplate for every entry in `BLD` at all times. The map is captioned rather than legible. |
| G-g | **Dusk is out of phase with the duck curve.** At 18:45 — the crisis moment the whole design points at — `sunAmt()` is still 0.94, so the scene looks like midday while solar has already fallen to ~215 MW. |
| G-h | **Storms look wrong.** Clouds are flat dark ellipses that read as floating discs; rain is nearly invisible at its current alpha; the ground does not darken; trees do not move. |
| G-i | **Load shedding is easy to miss.** UFLS stage 2 darkens 3 of 12 city blocks plus a brief red tint. The most consequential event in the game is nearly invisible. |
| G-j | **Unit trips have no lasting visual.** A 6-frame white flash and a small blinking square on the building. |
| G-k | **The demand chart hides its own story.** Supply (green) is drawn over demand (amber) and they overlap almost exactly, so the *gap* — the thing that matters — is not visible. Noise makes both hard to read. |
| G-l | **Frequency gauge is clipped.** `#cvG` is 138 px tall; the "Hz" caption baseline computes to 139.2 px. It is cut off at every window size. |
| G-m | **Map occupies 61% of a 1280×720 viewport** while the dispatch controls get a 174 px strip. The visual weight is inverted relative to where the player must act. |

### 2.3 Gameplay findings

| # | Finding |
|---|---|
| P-a | **The clock is fixed at 120×** (24 h in 12 min; `DTS = 0.2` sim-min per 100 ms tick). Pause is the only speed control, and it freezes everything including learning. |
| P-b | **Events resolve faster than a beginner can read.** Measured reference contingency — from balance at 04:00, trip one coal machine (−650 MW): frequency leaves the 49.85–50.15 Hz band in **2.3 real seconds**, bottoms at 49.71 Hz, and governor + battery FCAS recover it to ~49.95 Hz within ~22 s **with no player action at all**. A new player misses the entire event while moving the mouse. |
| P-c | **You can only touch one asset at a time.** `renderDock()` renders `#selP` for the single selected asset. Coordinating hydro and the battery during a 20-second contingency means clicking between them. |
| P-d | **The game asks you to hand-fly two jobs at once** — second-by-second regulation *and* hour-ahead commitment — at 120× speed. Real control rooms automate the first (AGC) precisely so humans can do the second. |
| P-e | **Death is instant and untelegraphed.** `blackT += 99` below 48.5 Hz, black at `blackT > 100` — **two ticks, 0.2 real seconds**, and the run is over with grade F. |
| P-f | **Measured difficulty.** Do-nothing player: system black at 12:56 sim-time (~4.5 real minutes in), −$92 M, 5,916 MWh unserved. A purely reactive policy that chases frequency with hydro, coal, CCGT and the battery but never commits new plant reaches 88.8% band compliance and still blacks out at 13:44. The failure mode is always the same: a big trip lands on thin reserve. |
| P-g | **No in-the-moment guidance.** Twelve annunciator tiles of equal weight, plus a log. Nothing says *what to do next*. Advice arrives only in the post-mortem. |
| P-h | **One scenario, one length.** Fail at real-minute 9 and the only option is to restart from minute 0. No drills, no difficulty tiers, no seeded repeats. |
| P-i | **No persistence.** No best score, no resume, no record that you ever played. A 12-minute session with no save is a big ask. |
| P-j | **The tutorial ends by dropping you into the full unforgiving shift.** It is the only bridge, and it stops halfway across. |
| P-k | **Coarse input.** `step=10` sliders over 0–2,600 MW, no numeric entry, no keyboard nudge, no "match the forecast" helper. |
| P-l | **`Math.random()` throughout.** Runs are not reproducible, so scenarios cannot be authored, results cannot be compared, and there is no regression harness. |

### 2.4 Reach findings

| # | Finding |
|---|---|
| R-a | **No `<meta name="viewport">`.** On a phone the page lays out at the 980 px fallback width and is scaled to fit — about 38%. Body text renders at ~5 physical px; fleet tiles measure 34×8 physical px. The existing 1080 px / 660 px media queries never fire on a real handset. Effectively unplayable on mobile. |
| R-b | **Zero accessibility affordances.** No `role`, no `aria-label`, no `aria-live` anywhere in the DOM. The event log is not announced. Frequency, reserve and inertia exist only as canvas pixels. |
| R-c | **Status is colour-only.** Lamps, annunciator tiles and chart series carry meaning in red/amber/green alone. |
| R-d | **`prefers-reduced-motion` covers only `.ann.crit` and `.tut-hi`.** The always-on CRT scanline overlay, map flashes, lightning and packet animation ignore it. There is no settings panel and no CRT toggle. |
| R-e | **One keyboard shortcut** (Space). No keyboard path to select an asset or change a setpoint. |

### 2.5 Confirmed defects

| ID | Defect | Evidence |
|---|---|---|
| D-1 | "Hz" caption clipped on the frequency gauge | canvas height 138 px, caption baseline 139.2 px |
| D-2 | Frequency trace panel labelled "3 H" but shows 6 h | 1,800 samples × 0.2 sim-min = 360 sim-min |
| D-3 | No viewport meta | see R-a |
| D-4 | Coal station geometry overhangs the terrain slab | see G-d |
| D-5 | Non-integer map blit scale | 1.373 measured at 769×523 |

---

## 3. Design thesis

> **The simulation is strong and the presentation is atmospheric. What GRIDWATCH lacks
> is *time to think* and *legibility at a glance*.**

Every change below must do one of three things:

1. **Give the player more time** — slow the clock, telegraph failure, automate the
   parts a real dispatcher automates.
2. **Make the state readable faster** — so a glance at the map answers "what is wrong
   and where", without reading a label or a log line.
3. **Lower the cost of failing** — shorter scenarios, difficulty tiers, saves,
   replays.

Explicit non-goals: no framework rewrite, no build step, no dumbing down of the
physics, no removal of the full 24-hour shift.

---

## 4. Requirements

Ordered in five phases. Each phase is shippable on its own.

### Phase 0 — Foundations & defects (`F-*`)

Small, high-leverage, mostly prerequisites for later phases.

**F-1 — Decouple rendering from the simulation.**
Replace the single `setInterval(…, 100)` with a `requestAnimationFrame` render loop
plus a fixed-step accumulator driving `tick()`.
*Accept:* render runs at display refresh (60 fps typical); the sim still advances in
exact fixed steps; a 24 h shift still takes 12 real minutes at 1× speed; measured
frame cost ≤ 8 ms; the map still animates while paused.

**F-2 — Seeded RNG.**
Replace `Math.random()` with a small seeded PRNG (e.g. mulberry32) threaded through
`schedule()`, `gauss()`, `tripUnit()` and weather. Surface the seed in the debrief.
*Accept:* the same seed produces an identical event schedule, weather trace and trip
selection. Prerequisite for S-1, S-5 and the regression harness (§7).

**F-3 — Fix the clipped gauge caption (D-1).**
*Accept:* dial, numeric readout and "Hz" unit all fully visible for rail widths
300–420 px and panel heights ≥ 150 px.

**F-4 — Fix the frequency trace window (D-2).**
Make it a true 3 h window (900 samples) and relabel; the 24 h view already exists in
the demand chart.
*Accept:* label matches the plotted window.

**F-5 — Integer map scale (D-5).**
Choose the offscreen resolution from the container so the blit factor is a whole
number, and letterbox the remainder.
*Accept:* `mapScale` is an integer ≥ 1 at all supported window sizes; no uneven
pixel doubling.

**F-6 — Coal station back on the slab (D-4).**
*Accept:* no part of any building in `BLD` renders outside the terrain diamond.

---

### Phase 1 — Time to think (`T-*`)

This phase is the core of "more approachable". If only one phase ships, ship this one.

**T-1 — Clock speed control.**
0.25× / 0.5× / 1× / 2× / 4×, as header buttons and `[` / `]` keys, with the current
rate always displayed. Choice persists.
*Accept:* speed can be changed mid-shift without disturbing the sim; scoring and
economics are unaffected by the chosen rate (rate scales wall-clock only).

**T-2 — Auto-slow on contingency.**
On any unit trip, interconnector fault, or UFLS arm, ramp the clock to 0.25× for 20
real seconds and show a `CONTINGENCY — TIME SLOWED` badge. Toggleable; on by default
below Control Engineer difficulty.
*Accept:* after the reference contingency (§2.3 P-b), the player has ≥ 8 real seconds
before frequency leaves the normal band at Trainee.

**T-3 — AGC / automatic regulation per unit.**
A per-unit toggle plus participation percentage. Units on AGC move their own setpoint
to close the measured imbalance, respecting ramp rate, minimum generation and
available capacity. Cost of using it: a small heat-rate penalty and consumed headroom
(AGC-reserved MW are deducted from displayed reserve).
*Accept:* with every unit on AGC and no player input, band compliance ≥ 90% on a
normal day — and the player still loses on commitment mistakes, water budgeting and
the evening ramp. Availability is gated by difficulty (S-3).

> This is the most consequential design change in the document. See §6, decision 1.

**T-4 — Dispatch board.**
A compact all-units control surface: one row per unit with lamp, name, MW/capacity
bar, setpoint slider, AGC toggle and start/stop. Becomes the primary control surface;
the detailed single-asset panel (`#selP`) stays for commitment decisions and
asset-specific tools.
*Accept:* at least 5 units can be adjusted without any navigation; a two-unit
correction during a contingency needs no clicking between panels.

**T-5 — Graded collapse instead of instant death.**
Retire the `blackT += 99` rule. Below 48.8 Hz start a visible `SYSTEM COLLAPSE IN n s`
countdown; when it expires, trip one generator (deepening the deficit) rather than
ending the run. Declare system black only when no synchronous generation remains, or
frequency is below 47.0 Hz for 3 s.
*Accept:* a player who reacts within 5 real seconds of the first warning can save the
grid at Trainee difficulty; blackout remains reachable and still grades F.

**T-6 — Imbalance instrument.**
A prominent MW-imbalance readout and bar (supply − served demand), with the
governor/FCAS contribution shown separately so the player can see how much of the
correction is borrowed. Alongside it: `MW REQUIRED +30 MIN` and `+60 MIN`.
*Accept:* visible at all times without selecting an asset; sign and magnitude
readable at a glance.

**T-7 — Setpoint input quality.**
Numeric entry beside every slider; ↑/↓ nudges ±10 MW and Shift+↑/↓ ±100 MW when a
control has focus; a per-unit "take my share of net load" button.
*Accept:* a specific MW target can be set exactly, by keyboard, in under 3 seconds.

---

### Phase 2 — Legibility (`L-*`)

The graphics phase. Budget is generous (§2.1) — spend it.

**L-1 — Fill the frame (G-c).**
Extend the terrain to the canvas edges and add a horizon treatment: distant ranges, a
haze band, sea or plain behind the plateau.
*Accept:* at every supported aspect ratio, no sky is visible below the ground plane.

**L-2 — Distinct asset silhouettes (G-e).**
Enlarge each plant roughly 25–40%; give each technology its own colour identity and a
recognisable yard motif (switchyard, gravel pad, cooling water, fuel store) so a
peaker, a battery, an inverter hut and a transformer are distinguishable unlabelled.
*Accept:* in a labels-off screenshot, a first-time viewer can name every asset type.

**L-3 — Label discipline (G-f).**
Nameplates only for hovered, selected or alarming assets. A small persistent
technology glyph otherwise.
*Accept:* at rest, no more than 3 text labels on the map.

**L-4 — Retime dusk to the duck curve (G-g).**
Align the visible sunset with the solar collapse and the evening ramp (17:00–20:00).
*Accept:* at 18:45 the sky is unmistakably in sunset and the solar field is visibly
dark, matching the ~215 MW the model reports.

**L-5 — Weather that reads (G-h).**
- *Storm:* darken the ground, layered clouds with volume, visible rain sheets, trees
  bending, lightning that momentarily lights the whole scene.
- *Heatwave:* bleached palette, haze, heat shimmer over the thermal plants.
- *Cloud front:* a moving shadow band that visibly crosses the solar precinct.
*Accept:* each weather state is identifiable from a single frame with no text.

**L-6 — Load shedding you cannot miss (G-i).**
Shed contiguous *districts* rather than scattered buildings, with a sweep animation, a
persistent red hatch over dark districts, and an on-map `UFLS STAGE n — x% SHED`
banner.
*Accept:* a stage-1 shed is unmistakable within 1 second of occurring.

**L-7 — Trip drama (G-j).**
At the tripping plant: white flash, smoke burst, visible spin-down, and a persistent
red strobe until repaired, with a callout line drawn to the annunciator tile.
*Accept:* the tripped asset is identifiable from the map alone, at any time during
its lockout.

**L-8 — Power-flow legibility.**
Line thickness proportional to MW; colour by loading (green → amber → red near
limit); packet speed proportional to flow; unloaded lines dimmed; the selected
asset's route highlighted.
*Accept:* the two most heavily loaded corridors are identifiable at a glance.

**L-9 — Demand chart shows the gap (G-k).**
Fill the area between supply and served demand as a signed band (deficit red, surplus
blue), overlay a reserve-margin strip, and mark events as ticks on the time axis with
hover text.
*Accept:* the moment the player falls behind demand is visible in the demand chart
without consulting the frequency trace.

**L-10 — 60 fps polish pass.**
With F-1 landed: eased needle motion, smooth blade spin, continuous smoke and packet
travel, drifting clouds.
*Accept:* no visible stepping in any animated element at 1× speed.

**L-11 — Selection emphasis.**
Slightly dim unselected map content; brighten the selected asset and its corridor.
*Accept:* the selected asset is obvious without reading the ring.

---

### Phase 3 — Structure & progression (`S-*`)

**S-1 — Scenario system.**
Data-defined scenarios: `{ id, name, seed, lengthMin, startHour, weather, events[],
difficulty, brief }`. The 24 h shift becomes scenario `full-shift`.
*Accept:* a scenario is fully described by data; replaying a seed reproduces it
exactly (depends on F-2).

**S-2 — Short drills.**
Five 3–5 real-minute scenarios, each teaching one thing: *Morning Ramp*, *Unit Trip*,
*Duck Curve*, *Storm Front*, *Low-Inertia Midday*. Each has a one-line objective and
its own grade.
*Accept:* a player can complete a meaningful, graded session in under 5 minutes.

**S-3 — Difficulty tiers.**
*Trainee / Operator / Control Engineer*, scaling: default clock speed, auto-slow
(T-2), AGC availability (T-3), event density, demand-noise σ (currently `gauss()*5.5`),
collapse tolerance (T-5) and coaching (S-4).
*Accept:* the measured targets in §5 are met at each tier.

**S-4 — Supervisor hints.**
One prioritised line naming the next action, derived from alarm state — e.g.
*"Reserve 120 MW. Start GT·B now — 8 min to sync."* On at Trainee, optional at
Operator, off at Control Engineer.
*Accept:* during any failure path, the hint names an action that would actually help.

**S-5 — Persistence (localStorage).**
Best grade and P&L per scenario and difficulty; last-used settings; tutorial-completed
flag; and a mid-shift save/resume.
*Accept:* closing and reopening the page restores settings and offers to resume an
interrupted shift.

**S-6 — Debrief replay.**
Scrub the completed shift using data already captured (`aDem`, `aSup`, `aRen`,
`aShed`, `histF`) with event markers, a P&L-over-time line, and an auto-annotated
"where you lost it" moment.
*Accept:* the debrief identifies the single largest P&L and frequency excursion and
lets the player scrub to it.

**S-7 — Live score transparency.**
Show the grade band currently being tracked, not just raw P&L.
*Accept:* the player can see at any moment whether they are on an A or a C.

**S-8 — Tutorial hand-off.**
After the final chapter, offer the *Morning Ramp* drill (S-2) as the recommended next
step, with the full shift as an explicit second choice.
*Accept:* the tutorial no longer terminates into the hardest available content.

---

### Phase 4 — Reach (`R-*`)

**R-1 — Mobile layout.**
Add `<meta name="viewport" content="width=device-width,initial-scale=1">` **together
with** a real small-screen layout: map at ~45vh on top; a bottom tab bar
(FLEET / DISPATCH / ALARMS / LOG); a bottom sheet for the selected asset; ≥ 44 px
touch targets; tap-to-select on the map, tap-and-hold for the tooltip.
*Accept:* playable at 390×844 with no horizontal scroll and no text below 12 px.

> Sequencing: the viewport meta must not ship before the layout. Alone it replaces a
> zoomed-out-but-complete view with a cramped broken one.

**R-2 — Accessibility.**
`aria-live="polite"` on the event log (`assertive` for critical entries); visually
hidden text mirrors for the canvas readouts (frequency, imbalance, reserve, inertia);
roles and labels on every control; visible focus rings; a complete keyboard path to
select an asset and change its setpoint.
*Accept:* the game is navigable and its critical state is announced using keyboard
and screen reader alone.

**R-3 — Colour independence.**
Alarm tiles and lamps carry a glyph or letter in addition to colour; add a
colourblind-safe palette option.
*Accept:* every status distinction survives a greyscale screenshot.

**R-4 — Motion and effects settings.**
Honour `prefers-reduced-motion` for the CRT scanline overlay, map flashes, lightning
and blink animations (currently only `.ann.crit` and `.tut-hi`). Add a settings panel:
CRT on/off, motion, colourblind palette, sound volume.
*Accept:* with reduced motion requested, nothing flashes, strobes or scans.

---

## 5. Target metrics

| Metric | Today (measured) | Target |
|---|---|---|
| Render frame rate | 10 fps | 60 fps |
| Frame cost | 1.7 ms | ≤ 8 ms |
| Reference contingency → band exit *(−650 MW at 04:00)* | 2.3 s | ≥ 8 s Trainee · ≥ 4 s Operator · 2.3 s Control Engineer |
| Do-nothing player | black at 12:56 sim (~4.5 real min) | survives to ≥ 18:00 sim at Trainee, grade D not F |
| Reactive-only policy *(chases frequency, never commits plant)* | black at 13:44, 88.8% compliance | completes the shift at Trainee, grade C |
| Units adjustable without navigating | 1 | ≥ 5 |
| Always-on map text labels | 10 | ≤ 3 |
| Shortest graded session | 12 min | ≤ 5 min |
| Mobile at 390×844 | unplayable (≈38% scale) | fully playable |
| Run reproducibility | none | exact, by seed |

The two policy rows are the headline approachability tests: today, *engaging with the
game correctly but incompletely still ends in a blackout*. That is what has to change.

---

## 6. Open decisions for the owner

1. **AGC (T-3) — does automating regulation remove the fun?**
   *Recommendation: implement it, gated by difficulty.* The interesting decisions in
   GRIDWATCH are commitment, reserve margin, water budgeting and the evening ramp —
   not hand-trimming a setpoint against noise. AGC is also what real control rooms do,
   so it strengthens the authenticity claim rather than weakening it. Control Engineer
   difficulty keeps hand-flying available for players who want it.

2. **Is mobile in scope at all?**
   If the game is mostly shared as a link, R-1 is the largest single reach lever in
   this document. It is also the most work. *Recommendation: keep it in Phase 4,
   after the desktop game is right.*

3. **Should 1× stay at 120× real time?**
   T-1 makes this less pressing. *Recommendation: keep 120× as 1× so the flagship
   shift stays 12 minutes, and default Trainee to 0.5×.*

4. **How far to push the art?**
   Phase 2 as written is a polish pass on the existing style. A larger offscreen
   buffer with more detail per asset is affordable given the measured headroom.
   *Recommendation: decide after F-5, when the scale question is settled.*

---

## 7. Verification method

**Local run.** `.claude/launch.json` already defines a `gridwatch` config
(`py -m http.server 8642`), which serves `index.html` at `http://localhost:8642/`.
Use the preview tooling, not `file://`.

**Autopilot regression harness.** The measurements in §2 came from scripted dispatcher
policies run headless by stubbing `draw()` and `ui()` and driving `tick()` in a loop.
Once F-2 lands, formalise this as an in-page mode (`?autopilot=<policy>&seed=<n>`) that
runs the policy set and prints the §5 metric table. Policies to keep:

- `doNothing` — no input at all
- `reactiveOnly` — chase frequency with hydro/coal/CCGT/battery, never commit plant
- `competent` — feedforward on forecast net load, commitment schedule, water budget

**Visual QA.** Browser-pane screenshots do not composite in this environment. Working
method: run a local receiver, then `POST off.toDataURL()` to it from page JS and read
the resulting PNG. The receiver script used for this review is worth keeping in
`tools/`.

---

## 8. Release checklist

- [ ] `index.html` updated and self-contained (C-1)
- [ ] `<meta charset="utf-8">` still first (C-2)
- [ ] Restart still an in-page state reset, no `location.reload()` (C-3)
- [ ] Autopilot harness passes the §5 metric table
- [ ] Manual pass: tutorial start → finish → drill → full shift
- [ ] Manual pass at 1280×720, 1920×1080 and 390×844
- [ ] Reduced-motion and colourblind settings verified
- [ ] Pushed to `main` (GitHub Pages deploys from it) and the Claude artifact republished (C-4)
