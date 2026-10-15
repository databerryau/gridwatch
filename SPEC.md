# GRIDWATCH — Spec

**The live spec**, rewritten 2026-10-15 (§9.1 Q-104). It says what the game is today, what it should become and what to build next, in order.
**History:** `SPEC-history.md` is the v4 spec of 2026-09-30 as last amended (2026-10-10), frozen with its line numbers unchanged, plus the slice-2c decisions Q-61–Q-91 in its Appendix C.
**IDs are permanent.** A requirement (C-, OD-, F-, H-, P-, S-, K-, L-, G-, D-, O-, U-, Y-, W-, X-) or decision (Q-) not defined here keeps its last text in `SPEC-history.md`. Nothing is renumbered or reused.
**Build:** `v4-core-2c.1` on `main` (52da14a, PR #14, 2026-10-13), live at <https://databerryau.github.io/gridwatch/> (the root redirects to `next.html`).
**Evidence:** the full review of 2026-10-14 (`REVIEW-2026-10-14.md`: ten lenses, 118 verified findings, the readers' reports in `REVIEW-2026-10-14-reports/`) and the owner's answers to it (Q-92–Q-107).

**How to read this.**
- §0–§2: what we are making and the rules it follows.
- §3: the game as built today. §4: the game we are building toward.
- §5: the plan, in build order (W0–W6), each item with an *Accept:* test.
- §6–§11: targets, positioning, the realism ledger, decisions and risks, verification, the release checklist. Appendix B is the glossary.

**How this document is kept (Q-104).**
- One place per rule. A decision is written into the rule it changes, in the same commit, and gets one row in §9.1. Nothing waits for a later "stage C".
- Built behaviour is described as built (§3, §8.2). A decided change that is not built yet says *decided, builds in Wn* where it is described.
- The slice records (`desk/README.md`, `sim/README.md`) hold a slice's contract while it is built and its records after. They do not restate this spec.
- Tests read §8.1 and §8.2 (`tests/text.test.js`, `tests/alarmpanel.test.js`): they find each section by its heading, the first time that heading's text appears in this file. Keep the three §8 headings as they are, mention them nowhere earlier, and keep the row formats.

---

## 0. North star

> **GRIDWATCH: run one Australian city's power for one day, in about six minutes, from a control desk you can feel. Plan the day, watch real physics catch the fall when a power station trips, then share how your day went.**

The clock profile is 245 real seconds; with the briefing, the holds, the watch and the verdict a first daily is about six minutes (Q-100).

| # | Pillar | What it means in play |
|---|---|---|
| 1 | **The desk as instrument** | Every machine is on the desk at once. The levers are motorised: they glide by themselves as the dispatch moves each unit. Your hands are on the commitments: START and STOP, the battery and its GUARD, the tie, the restores, the city levers and the emergency keys (the commitment desk, Q-93, builds in W4). HAND mode hands you the levers as well. |
| 2 | **The plan comes together** | Reliability is bought hours ahead. On a first shift the plan line coaches: it names the unit and the minute. From the second shift it states the problem and you choose (Q-92). At the peak your commitments arrive, the levers rise together and the alarms stay dark. |
| 3 | **Honest physics you can watch** | When a power station trips, the first 30 seconds play in slow motion from a real swing-equation model: stored spin, then the battery, then the governors, then the relays. Numbers come from the NEM rulebook, every simplification is labelled, and nothing is an invented rule (Q-102). |
| 4 | **The Australian duck** | Rooftop solar hollows out midday demand (the "belly") and sharpens the evening climb. Noon is a second crisis, with its own tools in the suburbs. |
| 5 | **A fair daily you share** | One seeded day, the same for everyone, always solvable by a good plan (D-9) and graded against par. It ends in a spoiler-free share card (Phase 4, W6). |

**What GRIDWATCH is not:** a planning spreadsheet with a RUN button (*Grid Operator*'s loop, §7); a reflex test; a tycoon (no money to spend, no perks, no progression seasons).

---

## 1. Owner decisions

The owner's standing calls. Since 2026-10-14 none of them is gospel: "do not take anything in the spec as gospel, everything is up for grabs to make the best game." When a rule or a budget here forces a worse design, it is raised with the owner, with a recommendation, rather than worked around.

| # | Decision | Now |
|---|---|---|
| OD-1 | Audience | The curious public, reached by a shared link. Success = strangers finish a session and share it. |
| OD-2 | Platform | Desktop only, mouse and keyboard. A phone gets a landing page (Y-8, W6). |
| OD-3 | Purpose and tone | Mostly fun; learning is a side effect. A serious control room with dry wit. |
| OD-4 | Who has played | Only the owner (since 2026-10-01). Two strangers play after the W1 fixes (the greybox check, W2, Q-106), then playtest gates 1 and 2. |
| OD-5 | Fantasy and length | "The plan comes together", in about six minutes (Q-100). |
| OD-6 | Realism | Physics and market behaviour defensible against the real NEM (Australia's National Electricity Market). Ease the interface, not the laws. Label every deliberate abstraction in-game (§8.2). No invented rules (Q-102). |
| OD-7 | Regulation | AGC (automatic generation control) is on by default. HAND, flying without it, is the harder mode, offered from the second shift (W1). |
| OD-8 | The trip moment | Watch, then respond: the first 30 s after a trip play in slow motion with the desk locked, then the player restores. The full slow motion goes to the first real fall (Q-97). No reflex tests. |
| OD-9 | Scoring | One ALL-IN score against par (Q-48): the cost of supply, plus every MWh dark that is yours at VCR, plus carbon at the VER. Letters measure the gap to par in MWh-equivalents (Q-98, W1). |
| OD-10 | Fairness | Every daily is solvable by a good plan (D-9) and graded against par: a fixed reference policy, run on the same seed, using only what a player can see (S-4). |
| OD-11 | Shape | A daily first. Week mode (Phase 5) is parked: not scheduled, its text kept in `SPEC-history.md`. |
| OD-12 | Rooftop PV | Core: the midday belly and the steep evening. |
| OD-13 | Layout | Half and half: the map on top, the desk below. |
| OD-14 | Core interaction | The desk as instrument, as the commitment desk (Q-93): word buttons for START and STOP, a GUARD slider, motorised readout levers, a Live Stack to read; SYNC and RESTORE as procedures; the suburbs on the map. |
| OD-15 | Technology | A plain static site on GitHub Pages, no build step, restart as an in-page reset (C-1–C-4). |
| OD-16 | Positioning | Away from *Grid Operator*: no planning phase, no RUN button, no money, perks or progression seasons. The clock may hold for the player's own moment: a held card says HELD and carries only the one action it is about. Tray and message cards never dispatch (K-9). |
| OD-17 | Delegated calls | Design calls inside the rules: "make the most fun choice", within realism. Changing a rule or a budget is the owner's call. |

---

## 2. Constraints

| # | Constraint |
|---|---|
| C-1 | A plain static site served as-is from `main`: HTML, CSS and ES modules. No build, bundle or copy step. No runtime npm dependency. No request to another origin (telemetry, Q-105, will need its own decision when it is built). |
| C-2 | `<meta charset="utf-8">` is the first element of every HTML file. |
| C-3 | Restart, retry and next-day are in-page resets (`createState`). Never `location.reload()`. |
| C-4 | <https://databerryau.github.io/gridwatch/> is the one canonical host. Pushing `main` deploys. |
| C-5 | Physics and market behaviour are defensible against the real NEM. Each deliberate abstraction is labelled in-game next to the real value (§8). |
| C-6 | Determinism. Sim output depends only on `SIM_VERSION`, the seed, the scenario and the input log. External events never depend on play. |
| C-7 | Honest time. One grid clock; physics is always integrated in grid seconds; only the playback rate varies, and it is always shown. |
| C-8 | Storage and audio are optional. The game plays fully without either. |
| C-9 | Desktop only: a viewport of at least 1280×600. A 1366×768 laptop leaves about 1366×625 after browser chrome. |
| C-10 | Performance: p95 frame cost ≤8 ms with the map (F-11). The first-visit transfer is measured and reported, not capped (Q-84). |

---

## 3. The game today (`v4-core-2c.1`)

### 3.1 A day as built

Measured on the daily of 2026-10-14 (`node tools/play.mjs 20261014 timeline=04:30-04:00/30m`; the review's transcripts are in `REVIEW-2026-10-14-reports/`).

**The briefing** is about 250 words over the night map: what the desk is for, the score's formula, the keys, the day ("a mild weekday"), *Watch for* (the day's warned constraints), the seed, an AGC/HAND choice and TAKE THE DESK. D-3 wants 60 words (W1).

**04:30, clock held.** The desk opens with the clock held until Space. The plan line already says the first move: "▶ ACT NOW You will be 150 MW short from 06:25 (the tie limited to 500 MW until 11:15). Start CCGT 2 now: it takes 49 min to reach the grid." Two tray cards carry the 04:00 notices.

**The clock** follows the D-2 profile, easing over 2 real s at each change:

| Badge | Grid time | Rate | Real s |
|---|---|---|---|
| PRE-DAWN | 04:30–06:00 | 540× | 10 |
| MORNING RAMP | 06:00–09:00 | 270× | 40 |
| SOLAR RISING | 09:00–11:00 | 480× | 15 |
| MIDDAY SOLAR | 11:00–14:30 | 300× | 42 |
| EVENING RAMP | 14:30–16:30 | 240× | 30 |
| PEAK | 16:30–20:00 | 150× | 84 |
| PEAK EASING | 20:00–21:00 | 300× | 12 |
| NIGHT ROLL | 21:00–04:00 | 2,100× | 12 |
| **The day** | | | **245** (HAND 478: speeds halved 04:30–21:00) |

**The designed day** (`sim/dayplan.js`; scenario data, so a first shift can be pinned; Q-65–Q-68, Q-85):
- *Act I, 04:30–09:00.* One warned constraint, announced at 04:00: a tie import derate, or a unit back late from maintenance. On 85% of days two feeders under repair, handed back at announced times between 06:30 and 08:00, at least 15 grid-minutes apart.
- *Act II, 09:00–14:30.* One belly crisis. Without a heatwave: a cloud front over the suburbs, warned hours ahead (40%), a trip of the largest unit (25%), the smelter (20%) or the tie (15%). Under a heatwave: unit 40%, smelter 30%, tie 30%.
- *Act III, 14:30–21:00.* A heatwave (15%), a storm (25%), a wind drought (20%) or a calm evening (40%). Calm, drought and heatwave days add an unwarned trip of the largest machine at 17:00–19:30; a storm trips the tie on about 27% of storm days. About a third of days have no evening trip.
- At most two unwarned trips a day, none before 09:00 or from 21:00, at least 90 real s and 60 grid-minutes apart. Warnings come at least 26 real s ahead on the clock played (130–175 grid-minutes for a front).
- *Night, 21:00–04:00.* The night shift has the desk, on par's own rules from the 21:00 state. Presses that would move the grid are refused; views stay open. The plan bar becomes a night strip that counts SUPPLY, OUTAGES, CARBON, ALL-IN and SCORE up (Q-73).

**Holds and paces.** The clock holds at TAKE THE DESK (until Space), at each feeder's hand-back (the feeder card: R or Enter restores, Esc goes on; Q-91), at each watch's respond card (Enter), in the alarm panel (W, on request) and on pause. It slows for the watch (0.15× → 1× → 10× over 30 grid-seconds: 29 real s the first time, 10.5 s compact), FOCUS (1× for 2 grid-seconds after a restore), RESPOND (30× until frequency is back in band, which in practice is already true when the card closes) and an offered SYNC (30× for up to 8 real s, at most three a day). FAST is 3× while F is held.

**The desk** shows 81 enabled controls at 04:30: five motorised station levers with 22 START/STOP guards, the hydro gate wheel with 6 more, the battery dial and its GUARD ring, the tie knob, the AGC key, RE-DISPATCH, the Live Stack, the procedure bay (SYNC scope, RESTORE list), the message tray, the emergency keys, and in the plan bar twelve alarm tiles with ACK, HORN OFF and EXPLAIN. Under AGC the system dispatches the units you commit every 5 grid-minutes. Moving a lever, the wheel or the tie knob holds every lever until RE-DISPATCH (Q-18), so on an AGC day the right number of lever moves is zero (the commitment desk removes the trap, W4).

**The plan line** (`app/objective.js`) says what is needed next, with a reason and a lead time: ACT NOW, URGENT, SAVING (a STOP and what it saves "if nothing trips before then"), BATTERY, SPARE (the GUARD), SUBURB, PLAN, STEADY. Hovering or lifting a guard first shows what the press will do ("? IF PRESSED"). A scripted player that does exactly what the line says scores 1004 A★ on 2026-10-14 and 1044 on 2026-10-17; nine measured deviations gain at most 1%.

**The city** (slice 2b): six suburbs on the map; a HOT WATER SOAK every day (a 4-hour noon block, free) and an AIR-CON CYCLE on HOT days (pre-cool, 1.5 hours of relief, 40% snapback, $400/MWh relieved, paid for in patience), booked on the suburb card (click a suburb, or H).

**The end, at 04:00:** an end card with SCORE and its letter (par runs in the page), the ALL-IN ledger (SUPPLY, OUTAGES at VCR, CARBON at the VER), SAIDI, SAIFI and MAIFI as readouts, the seed and hash, DOWNLOAD REPLAY LOG and PLAY THIS DAY AGAIN. There is no share card, debrief, history or streak yet.

**The daily.** `next.html` with no query plays today's date. `content/dailies.js` holds 365 gate-checked dates from 2026-10-12 (17 exceptions; 95.3% pass at attempt 0; heat 17.0%; 23 days par cannot solve are never shipped). Weekends play `desk-weekend` (coal 4 off since Friday night).

### 3.2 Where things live

| Area | Code | Contract and records |
|---|---|---|
| Sim core, par (the reference policy), the clock, the day plan | `sim/` | `sim/README.md` (§11: module contracts) |
| Shell, plan line, rate director, score, tray, watch | `app/` | `desk/README.md` §31.8 and §32.12 (module headers, back into the code in W1: X-49) |
| Desk controls | `desk/` | `desk/README.md` |
| Map and Live Stack | `render/` | `desk/README.md` §31.8 |
| Words, the "?" ledger, scenarios, dailies | `content/` | §8.2 here; `desk/README.md` §19, §31, §32 |
| Tests and tools | `tests/`, `tools/` | `CLAUDE.md` (how to test), `tools/README.md` |

Slice records in `desk/README.md`: Phase 1a and 1b §0–§17, slice 2a §18–§28, alarms and the ALL-IN score §30, slice 2b §31, slice 2c §32.

### 3.3 What the review found

The review of 2026-10-14, in short:
- **Strong:** the engine (deterministic, replayable, sourced), the realism ledger, the plan line's prose, the BALANCE bar in words, the feeder card's faces, the watch's physics.
- **Holding the game back:** following the line is the whole game; the levers are a trap under AGC; the first minute is the worst minute; the watch lights its beats in the wrong order on the evening trip and spends its one full showing on a midday rise about a third of the time; after a shedding trip the clock runs at 150× with the city dark; the day ends on a ledger with nothing to share; the letters mean different things on different days; nobody but the owner has played.

The plan in §5 is the owner's answer (Q-92–Q-107).

---

## 4. The game on one page (the target)

The game after W1–W6 (§5). Real times are a first shift's, from the D-2 arithmetic, not yet measured.

### 4.1 A stranger's first daily

| Real time | Grid time | What happens |
|---|---|---|
| 0:00 | 04:00 | The link opens on the briefing over the night map: "Daily #N · Wed 14 Oct · the same day for everyone", one goal line, the day, *Watch for*, one line on what is real, TAKE THE DESK (≤60 words, D-3). |
| 0:15 | 04:30, held | The desk opens with the clock held. The coaching line: "Start CCGT 2 now: it takes 49 min to reach the grid." Controls the line has not asked for yet sit under cover plates (O-3). Two presses on CCGT 2's START: "✓ UNDER WAY". The GUARD slider shows SET 400. |
| 0:20 | 04:30→06:00 | Space. PRE-DAWN at 540×. |
| 0:42 | ~06:55 | The first hand-back: one card for both feeders, "RESTORE HAR4 now; HAR3 at 07:15". Enter closes HAR4 and queues HAR3 (D-27). The needle dips with the cold load and recovers. |
| 1:10–2:10 | 09:00–14:30 | The belly. "Stop CCGT 1: saves about $45,000 if nothing trips before then." The battery charges on spill at −$20. A suburb books a soak. The belly's crisis: a front warned hours ahead, a unit trip, the smelter or the tie (a rise plays a compact watch). |
| 2:10–3:30 | 14:30–18:40 | The evening: the line asks for the starts that cover the peak and its biggest risk; the levers glide up together. |
| ~3:45 | ~18:40 | The largest machine trips: the full watch, the player's first fall (29 s): spin, then "YOUR GUARD: 400 MW", the governors, the settle. The respond card says what caught it. If relays shed, a card holds the clock at each stage's restore (D-26). |
| ~5:05 | 21:00→04:00 | The night shift, 12 s; the night strip counts the day up. |
| ~5:20 | — | The verdict (W3, ≤45 s): score and letter with its one-line rule; lights, cost and carbon in words, with what went dark and why; the moment; a "this really happened" card. |
| ~6:00 | — | SHARE (W6): the card and COPY. |

### 4.2 Layout at the 1280×600 floor

Half and half (K-17): a 32-px header; the desk takes max(300 px, half the viewport height below the header); the map takes the rest. The plan bar (the plan line and the 6×2 alarm tiles with ACK, HORN OFF and EXPLAIN) sits on the map's lower edge (Q-45).

```
+------------------------------------------------------------------------------------------+
| GRIDWATCH  18:42 PEAK 150x | LIGHTS ON | COST c/kWh | CO2 t/MWh | SCORE | PAUSE | ?      |  32
+------------------------------------------------------------------------------------------+
|  MAP 1280x268: plants, six suburbs, rooftop glint, cloud, dark districts                 | 268
|  [plan line ............................................] [6x2 tiles  ACK  HORN  W]      |
+-------------+--------------------------------+---------------------+---------------------+
| FREQ DIAL   | 5 motorised levers (readouts)  | LIVE STACK      [L] | MESSAGE TRAY        |
| BALANCE bar | START / STOP per station       | now .. +4.5 h       | (3 cards, LOG)      |
| N-1 GAUGE   | HYDRO wheel, BATTERY dial,     +---------------------+---------------------+
| T PREVIEW   | GUARD slider, TIE knob         | BAY: SYNC / RESTORE | DR  BREAK GLASS     |
+-------------+--------------------------------+---------------------+---------------------+ 300
      232                   424                          336                  256
```

At the floor the plan bar may hide the gas turbines', the CCGT's and the battery's click boxes on the map (X-47 checks it in the browser, W1). At 1920×1080 the header is 40 px and the map and the desk are 520 px each.

### 4.3 The desk (the commitment desk, Q-93, W4)

| Control | What the player does | Keys | Req |
|---|---|---|---|
| START / STOP, per station | Commit a unit: two presses (START? then START), with "? IF PRESSED" first. Lamps show each machine's state. | pick 1–6, then S S / X X | K-3, K-24 |
| Unit levers, hydro wheel | Read: they glide as the dispatch moves each unit. In HAND you move them. | 1–6, ↑↓ (HAND) | K-1, K-4, K-24 |
| GUARD slider | Hold battery MW back to catch a trip (contingency FCAS, set by hand). | 7 then G | K-5, K-24 |
| Battery dial | Charge, idle or discharge, and how much. | 7 | K-5 |
| Tie knob | Interconnector import or export. It no longer holds the levers. | 8 | K-6, K-24 |
| RESTORE bay | Close repaired feeders and shed districts when the permissive lamp lights. | R, Enter | K-13 |
| SYNC scope | Close a unit's breaker by hand when it is offered; always by hand in HAND. | O, [ ] C U | K-12 |
| DR, BREAK GLASS, DIRECT SHED | Industrial demand response (hold D), the reserve diesel (hold E), shed a district (SHORT or SHEDDING only). | D, E | K-7 |
| Alarm tiles, ACK, HORN OFF, EXPLAIN | Alarms beside the plan line; EXPLAIN holds the clock and explains each. | W | K-8, Q-45, Q-46 |
| Message tray | At most 3 cards; each button only focuses a control. | M | K-9 |
| N-1 gauge, TRIP PREVIEW | Read: spare in 5 minutes against the biggest risk; where frequency would bottom out. | T | K-10 |
| Frequency dial, BALANCE bar | Read: Hz, its change, stored spin; what is holding the balance, in words. | — | K-11 |
| Live Stack | Read the next 4.5 hours; L expands it. In HAND you drag. | L | L-1–L-6 |
| Suburb card | Book a soak or an air-con cycle. | H, or click a suburb | U-2 |
| Header | Clock and rate badge, LIGHTS ON, COST, CO₂, ALL-IN or SCORE, PAUSE, SOUND, SETTINGS, "?" (HOW TO PLAY first). | Space, `,`, ? | D-6, K-22 |

### 4.4 The Live Stack

A desk screen showing the next 4.5 hours as a skyline of forecast demand (P50 with its band), each generator a coloured layer, units that are off as ghosts that cannot begin before now plus their start time, red and amber where the plan is short, blue where power would be spilled, the city's booked flex as bands, act ticks and the warned onsets ahead. A trip tears its layer out live. On an AGC day it is read, not dragged (Q-93); L expands it over the map. In HAND, L-4's drag stays.

### 4.5 The city

| Suburb | Personality |
|---|---|
| Solstice Rise | Solar-obsessed outer estate |
| Old Hazelton | On off-peak hot water since 1962 |
| Redgum Flats | Air-con as a human right |
| Harbourside | CBD towers |
| Tallowood Heights | Pools and Powerwalls |
| Saltbush Bay | Retirees who ring talkback |

Built: the HOT WATER SOAK and the AIR-CON CYCLE, with patience (U-1–U-4, U-6; Q-50–Q-60). The rest of the city (EV delay, the VPP, HOT WATER HOLD, the rooftop backstop, the heat-health guard, map life) is Phase 3, not scheduled (§5).

### 4.6 The trip moment

- **The watch** (K-15). The first 30 grid-seconds after a trip play with the desk locked, in the physical order: inertia, battery, governors, relays (UFLS), settle. The full version, with captions, plays for the first falling trip of at least 300 MW a player sees, and for anything new (a first UFLS, a new RoCoF record); a rise plays compact, with its own strip (Q-97, W1). The slow part ends half a second after the extreme.
- **The respond card** (K-16) holds the clock. It says how deep the fall went, what caught it (naming YOUR GUARD when the player set it), the 5-minute band and the 30-minute COVER countdowns, and lights the controls that could answer. It offers no dispatch button.
- **After shedding**, each UFLS stage's districts hold the clock at their allowed restore, as the morning feeders do (D-26, W3). The first directed shed outside a contingency plays a compact watch (Q-97).

### 4.7 Verdict and share card

**The verdict (W3).** In order, readable in ≤45 s (D-25): the score and the letter, with the letter's one-line rule; three rows in words against par (lights: what went dark, why and for how long; cost; carbon); the moment (D-21); one "this really happened" card (D-24).

**The share card (W6, Y-4).** Text only, no event names, no clock times, ≤7 lines and ≤280 characters. Illustrative:

```
GRIDWATCH #3 · Wed 14 Oct · 975 A
█▅██▅▇█▁▅▆██  low 49.41 Hz
Lights  ★ every light on
Cost    +5% vs par
Carbon  ★
"Nobody noticed. That's the job."
databerryau.github.io/gridwatch
```

The sparkline has 12 two-hour blocks from 04:00; each is the worst deviation from 50 Hz in its window (the sim already records it: `score.spark`).

---

## 5. The plan

Every step ships something playable, and the live game works after every step.

| Step | What | State |
|---|---|---|
| Phase 0, 1a, 1b | Honesty fixes; the v4 sim core; the greybox desk; desk polish | Built (text in `SPEC-history.md`) |
| 2a, 2b, 2c | The belly; the city levers; the day | Built, live as `v4-core-2c.1` |
| **W0** | This rewrite: the live spec, its history, Q-61–Q-107 recorded | Done (2026-10-15) |
| **W1** | Slice 2c.2: quick fixes and the cheap decisions | Built (2026-10-16), `v4-core-2c.2`; see W1 below |
| **W2** | The greybox check: two strangers play | Next |
| **W3** | Slice 2d: grade, debrief and the respond window | After W2 |
| **W4** | Slice 2e: the commitment desk and onboarding | After W3 |
| **W5** | Playtest gate 1 | After W4 |
| **W6** | Phase 4: the daily (share card, history, streak, the phone page), then telemetry | After W5; ends at gate 2 |
| Later | Phase 3 (the rest of the city); Phase 5 (week mode) | Not scheduled; decided on the gates' evidence (§9.2) |

The order is the owner's (Q-107), with two placements of mine: the dark-district holds (D-26) go into W3 with the respond-card work, and the commitment desk goes into W4 with the cover plates, because the plates sit on it.

### W0 — The spec rewrite (done)

`SPEC.md` rewritten to the build and the decisions; `SPEC-history.md` keeps the v4 text with Q-61–Q-91 appended; §8.2 carries the ten "?" rows slice 2c added to the game (and the game's text drops their pending flags). Still to do from Q-104: the module headers back into the code (X-49, W1).

### W1 — Slice 2c.2: quick fixes and the cheap decisions

One slice, one `SIM_VERSION` bump (H-18 changes the sim), the golden re-recorded once, `tools/daily-gen.js` re-run at the end. One browser pass by the integrator.

*Built 2026-10-16 (branch `slice-2c2`, `v4-core-2c.2`).* Every item below is in, each with its accept as a test, but X-47 (the browser pass) and X-48's worktree and branch removal (the owner's go-ahead). Where the build differs from the text:
- **D-3:** the goal line is as written; the line on what is real is "Real NEM physics; you make the operator's calls." (the example, 18 words, would take the card past 60 with the day, Watch for and the date). The day lines are shorter to fit: 61 dates from 2026-10-16 read 60 words or fewer.
- **D-7:** the briefing's HAND button is hidden until a finished shift; the desk's own AGC key still sets HAND in the briefing (refusing it there broke seven tests that pick HAND; left as a power-user path).
- **D-27:** the card holds only where R would be accepted, so D-2's RESTORE term (`tests/lib/play.js` clockReport, read from the sim alone) still counts a hold only on its allowed second's next tick; a hold that waits for the lamp is not counted there.
- **X-45:** LIGHTS ON is the state now ("100%" or "N DARK · MW", red), not the day's share; the day's dark energy is on the ALL-IN chip and the end card.
- **X-49:** the moved headers are back in 44 files (verbatim from the READMEs, where they had kept growing), `forecast()`'s doc above it, and `sim/clock.js`, `dark.js`, `dayplan.js` carry their §11 sections as headers. `sim/README.md` §11 keeps the other modules' export tables; the restored headers name them ("sim/README.md, section 'grid.js'"). First visit 472.7 KB gzip (+50 KB).
- **Test budget:** four tests that play a whole day on the real page (X-39 ×2, X-40, X-44, K-15 ×2) take 2.4–5.2 s, over CLAUDE.md's 2.5 s a test; their files stay within or near 6 s by being split.

**X-39 — The watch's beats in physical order.** `app/watch.js rawBeat` names a beat when it is the largest catcher so far in physical order; inverters releasing a little of their own curtailment do not light GOVERNORS. Today GOVERNORS lights at T+0.02 s and BATTERY never on the evening trip whenever any governor or inverter MW precedes the battery (2026-10-17 17:49: the battery caught 386 MW).
*Accept:* on 2026-10-16 18:49 and 2026-10-17 17:49 BATTERY lights before GOVERNORS; a test asserts BATTERY is lit whenever the battery's catch, GUARD included, exceeds the governors' at the nadir.

**X-40 — The respond card's words.** No catch of zero or less is printed as a number (say "battery empty", "governors spent"); "FOS asks: back in 49.85–50.15 Hz within 5:00" replaces the line that reads as a forecast; "load relief" is explained ("motors slow"); a GUARD the player set is named ("battery 494 MW (your GUARD 400)").
*Accept:* the 2026-10-14 19:19 card has no negative part; a run with the GUARD at 400 names it.

**X-41 — A tie trip while exporting** says "300 MW of export lost", not "-300 MW of import lost" (`app/tray.js`).
*Accept:* a test on both signs.

**X-42 — The "? IF PRESSED" and ARMED line stays true.** Its figures are re-rendered while its words hold (today it promises "by 06:12, 12 min from now" while the clock runs on), and a resting pointer gives the line back to the plan after 4 real s.
*Accept:* pressing GT·A's START at 06:00 shows the current minutes on every refresh; a pointer resting on a guard never hides the plan line for more than 4 real s.

**X-43 — HAND tells the truth.** The start-to-minimum time the line and the Live Stack read (`observe().startToMinS`) leaves out the auto-synchroniser in HAND, as the plan executor already does (HAND has none, so "49 min" is 45). In HAND the line asks for the manual SYNC at full speed, and the "after the trip" GUARD line needs a trip. (Five copies of "when is this unit on" exist across the line, the Live Stack, par and the executor; merging them is §9.2's question 15.)
*Accept:* `--hand` at 04:30 says 45 min; an obedient HAND run gets a SYNC ask; no "after the trip" line without a contingency.

**X-44 — URGENT after a trip counts what the battery already carries.** The line is not URGENT while BALANCE reads BALANCED, and it never asks for less than the battery is already giving.
*Accept:* on the 2026-10-14 competent run the line leaves URGENT once BALANCE is BALANCED.

**X-45 — The header and the end card say what is true.** While any district that is yours is dark, LIGHTS ON shows it ("2 DARK · 480 MW"), and it reads 100% while none is (the network's own outage before a hand-back does not count). The end card counts the player's inputs only, prints OUTAGES under 0.05 MWh as $0, and the BALANCE bar says DARK, not SHED, at a hand-back.
*Accept:* on the 2026-10-14 Enter-only run the header shows the nine dark districts at 19:20; the follower's card reads $0 and about 24 inputs.

**X-46 — Frame cost.** The night roll computes no forecast or projection for a line that is off; par's in-page slice is time-budgeted (at most about 1.5 ms a frame).
*Accept:* `?perf`: no frame over 8 ms from par in the first 30 real s of play; the night roll's view-model p95 drops.

**X-47 — The plan bar and the map.** Check at 1280×600 in the browser whether the plan bar hides the gas turbines', the CCGT's, the battery's or the solar farm's click boxes (CSS arithmetic says it does). If it does, move the plan bar to the map's top edge.
*Accept:* at 1280×600 every plant's click box is visible and clickable.

**X-48 — Hygiene.** Remove the stale worktrees (105, 389 MB on the OneDrive path) and merged branches (141); delete exports nothing uses; fix stale pointers (`COMMIT_MARGIN_MW`'s test, the `cueOfRecord` fallback).

**X-49 — The module contracts go back into the code** (Q-104). Each module's header, moved out to `desk/README.md` §31.8/§32.12 and `sim/README.md` §11 for the first-visit cap that Q-84 lifted, returns to its file as its header comment; the READMEs keep records only.
*Accept:* no "Contract: desk/README.md §" or "sim/README.md §11" pointer line is left; `tests/budget.test.js` passes; the first visit is reported.

**K-15 (amended, Q-97) — Slow motion for the first real fall.**
- The full watch plays for the first falling contingency of at least 300 MW lost that this browser has seen, and for anything new (a first UFLS, a new RoCoF record). A rise plays compact, with its own strip: SPIN → INVERTERS → SETTLE.
- The 0.15× part ends half a second after the extreme (between T+2 and T+3 s), then 1× to T+10 s, then 10× to T+30 s. The grid clock still advances exactly 30 s, and viewing never changes the outcome.
- The first directed shed outside a contingency plays a compact watch ("You are 800 MW short: the city desk sheds SOL3, 168 MW, to hold frequency").
*Accept:* on 2026-10-14 the 12:19 tie trip plays compact and the 19:19 trip full; the end-state hash is the same whether a watch is viewed or skipped; D-2's arithmetic follows the new schedule.

**D-27 — One card for the morning hand-backs** (Q-96; amends Q-91).
- At the day's first hand-back one card names both feeders: "RESTORE HAR4 now; HAR3 at 07:15". RESTORE (Enter or R) closes the first and queues the second, which closes itself at its allowed second unless the permissive refuses; only a refused queued close brings a second card.
- A card holds the clock only at a second when the restore would be accepted. While the permissive refuses, the bay glows and the line asks; the hold comes when the lamp lights.
- Esc restores, like Enter. Leaving a feeder dark is a labelled choice with its price: "LEAVE HAR4 DARK (about $7M an hour at VCR)".
*Accept:* a run that presses Esc at every card ends the morning with both feeders restored; a day with two feeders has one morning hold, plus one only if a queued close is refused; no card holds while R would be refused; par's reference playback counts the holds as before.

**S-5 (amended, Q-98) — Letters from the gap in MWh-equivalents.** The score stays 1000 × par's ALL-IN ÷ yours (the chip, the night strip, the card). The letter comes from g = (your ALL-IN − par's) ÷ VCR: A for g ≤ 10 MWh, B ≤ 150, C ≤ 600, D above; F for a black grid. The card says the rule in one line.
*Accept:* the same added mistake earns the same letter on a heatwave, a drought, a calm weekday and a weekend daily; `tools/par.js --allin` re-measures the competent proxy (target ≥70% A) and the lean proxy (target ≤40% A), and the result is recorded in §6.

**H-18 — No invented rules** (Q-102).
- The random hot-unit trip (H-2) is removed. Its 96% gate stays as what it is in the physics: a unit at its limit has no raise headroom above it, which the TRIP PREVIEW shows. The lever's "✕ 3.5%/h" face goes.
- The directed-shedding timers (1 minute below 49.5 Hz, 5 minutes outside the normal band, one district a minute) are tagged "GRIDWATCH's own rule" in the UNDER FREQ explainer and its §8.2 row: a stand-in for AEMO directing the networks.
- The GUARD ring gets its own "?" row and §8.2 row: the battery's contingency FCAS, set by hand.
*Accept:* no unit trips for running hot; the explainer test finds the own-rule tag; `tests/text.test.js` finds the GUARD row beside `#ring-guard`.

**D-3 (amended, pulled forward from 2e) — A 60-word briefing.** One goal line ("Keep the lights on: start power stations before the city needs them. The line above the desk says what's next."), the day and *Watch for* (≤30 words), one line on what is real (for example "The seconds are real NEM physics; the desk hands you the decisions the market and the operator make."), TAKE THE DESK. The score's formula and the keys move behind the header "?", which opens HOW TO PLAY first and WHAT IS SIMPLIFIED second. The seed line gives way to the date.
*Accept:* ≤60 words (a test counts them); one required click; the header "?" opens HOW TO PLAY.

**D-7 (amended) — HAND from the second shift.** A browser that has not finished a shift sees no HAND choice; from the second shift the choice shows, titled "no AGC and no auto-sync (harder)". The game keeps a shift count with its other `seen` flags.
*Accept:* with empty storage no HAND button shows; after one finished shift it does.

### W2 — The greybox check

Two people who have never played each play the live daily on their own computer, sound on, thinking aloud, with the owner silent (the gate-1 help rule: help only after 60 s stuck, and log it). Afterwards, gate 1's five questions (W5).
*Pass:* both reach the verdict, and both can say what a START button, the GUARD and the plan line do. Otherwise fix the top issue and re-check with one new person. The owner keeps a one-page log per tester; the top three issues may reorder W3 and W4.

### W3 — Slice 2d: grade, debrief and the respond window

**D-26 — Dark districts hold the clock** (Q-95). After a contingency that sheds (UFLS or directed), each relay stage's districts (and the city desk's directed sheds) hold the clock at the first second their restore would be accepted, as the morning's feeders do (D-27): one card per stage, "RESTORE stage 1: RED1 and SAL1, about 620 MW with their cold load". RESTORE closes the first and queues the rest at their allowed seconds; a refused queued close brings the card back. While the permissive refuses (frequency, the 5-minute interval, spare for the cold load), the bay glows and the line asks for the plant that would let it pass. No hold from 21:00.
*Accept:* on 2026-10-14, a player who starts the units the line asks for after the 19:19 trip and presses Enter at each card relights every shed district within 5 grid-minutes of the second each may be closed (the night shift relit them at 21:35–22:25 in the review's Enter-only run); no card holds while R would be refused; par's reference playback counts each hold as it counts the feeder cards; D-2's arithmetic gains the term.

**S-6 — Marks.** A ★ at par or better; PERFECT for no UFLS or directed shedding and every handed-back feeder closed within 5 grid-minutes of when it may be (Q-69).

**S-7 — Hard days** (practice only, never the daily slot): graded against par's outage-free parts, so a par that sheds does not make a win trivial. The card says "no plan kept every light on today".

**D-20 — The verdict.** The score and the letter with its one-line rule (S-5), then three rows in words against par:
- *Lights:* what went dark, by cause and for how long: feeders gone on past ("HAR4 from 06:55, relit by the night shift at 22:20: 5,907 MWh"), shed by the city desk, shed by the relays, and when each was relit. The sim already splits it (`uflsMWh`, `directedMWh`, `taskMWh`, `taskLateMWh`, `heldMWh`).
- *Cost:* c/kWh against par's.
- *Carbon:* t/MWh against par's ("±0: nothing you did moved it today" when it did not move).
The dollar ledger and the reliability readouts move behind THE NUMBERS.
*Accept:* on the three 2026-10-14 runs of the review (follower, Enter-only, do-nothing) the lights row names the causes and the measured MWh.

**D-21 — The moment.** The first shed if there was one; otherwise the largest frequency deviation; otherwise the lowest N-1 margin. It shows the time, a ±3-minute trace (`render/charts.js drawWatch`), what caught it with YOUR GUARD named, the nadir with no GUARD (from a guard-0 twin of the pre-trip preview, not from the trip tick), and par's nadir and spare at the same minute.
*Accept:* every run yields one moment with at least three live numbers; the no-GUARD nadir comes from the pre-trip state.

**D-24 — "This really happened."** At most one card per verdict, chosen by trigger, each with its source and one line on what GRIDWATCH simplifies: Loy Yang A3 (14 Dec 2017), Callide C (25 May 2021), SA's first rooftop backstop (14 Mar 2021), SA's negative prices (Q4 2025), the SA black system (28 Sep 2016). Sources in `SPEC-history.md` D-24.
*Accept:* every card has a source URL and a simplification line, and each is fact-checked before it ships.

**D-25 — Pacing.** Verdict, moment, card, readable in ≤45 s (the owner times a read-through). SHARE follows in W6.

**L-10 — The plan comes together.** An hourly strip on the verdict: green no gap, red short, blue spill, from gap state only. A "clean ramp" chime when the peak passes with no red column for 60 grid-minutes.

**P-1, H-11 — Two debrief lines.** The day's underlying and operational demand as two curves; whether frequency came back into the normal band within 5 minutes after each trip.

Also in W3: keep par's input log when it finishes (today `app/par.js` drops it), for D-21 and a later D-22.

### W4 — Slice 2e: the commitment desk and onboarding

**K-24 — The commitment desk** (Q-93; on AGC days it replaces the lever-writing parts of K-1, K-4, L-4 and L-6).
- The five levers, the hydro wheel and the Live Stack are motorised readouts on an AGC day: the handle glides with the dispatch; the band, the ramp cone and the gate stay. A press on one answers in blue: "The dispatch sets the MW; START and STOP are yours."
- Each station gets two word buttons, START and STOP (armed: START? and STOP?; starting: "◔ 4:59"; locked out: "✕ 12:00"), beside a row of machine lamps. The guard sequence, the "? IF PRESSED" line, the glow of an asked unit and the two-press rule are unchanged.
- The GUARD becomes a labelled slider, "GUARD n MW held for trips", in 50-MW steps, with a SET chip showing the MW when the line asks for it. The ring stays as a readout of what is held.
- The tie knob moves the tie and never holds the levers. RE-DISPATCH leaves the AGC desk.
- HAND keeps today's live levers, the wheel, the stack's drag and RE-DISPATCH as its harder game.
*Accept:* on an AGC day no lever, wheel or stack input exists and every press answers (`tests/feedback.test.js`); the desk shows at most about 55 enabled controls at 04:30 (81 today); a HAND day keeps every lever input.

**O-8 — Coach, then the problem** (Q-92). On a first shift the line coaches as today: it names the unit, the MW and the minute. From the second shift, or with COACH OFF (a header toggle, remembered), it states the problem (the shortfall, its time and its reason) and lights the candidate controls (L-9's glow), naming one unit only when exactly one can still arrive in time. A day played from 04:30 with COACH OFF is tagged "no coach" on the end card (and on the share card, W6).
*Accept:* in problem mode no line says "Start <unit>" while two or more units could still arrive in time; a scripted player that follows problem-mode lines alone scores measurably below the coaching follower (the skill gap is real).

**O-1 — The first shift is today's daily**, with coaching. An always-visible "I've done this before" switches coaching and the cover plates off.

**O-2 — ≤60 s to the first real action.** Met today (the held clock, 0 s); keep it.

**O-3 (amended, Q-101) — Cover plates, without an autopilot.** On a first shift every control the line has not yet asked for sits under a plate; the line's first ask for a control lifts its plate (with its glow). Covered controls are run by the system layer exactly as today: no per-control autopilot. No introduction holds the clock.
*Accept:* a first shift lifts each plate at the line's first ask and never during a watch; covering changes no sim input (the same day's hash with and without plates).

**O-6 — Marg, the supervisor's voice.** 31 years on the desk; dry; never blames; at most 20 words a line; at most 25 lines on a first shift and 6 on later days, at fixed beats: the briefing, the act changes, the first watch's settle, the 21:00 handover ("I've got the night. Your day is scored at four."), the verdict's closing line. Each line carries a live number or a decision.
*Accept:* a line-count test holds both limits.

**D-7 (copy).** The briefing's HAND text (from the second shift).

### W5 — Playtest gate 1

**Build:** the live daily, first-shift coaching on.
**Protocol:** 3–5 friends or family who have never played (at most one energy professional), on their own computer with sound on. The owner sends only the link and says "This is a game I'm making. Play today's day and say out loud what you're thinking." The owner watches silently (over the shoulder or by screen share; record with consent) and helps only after 60 s stuck, logging it. Five questions afterwards: 1. What was your job? 2. When the power station tripped, what caught the fall? 3. Why did you get your grade? 4. Stress 1–5 and confusion 1–5. 5. Would you play tomorrow? The owner also plays and rates stress and confusion.
**Pass (all of):** ≥4/5 finish to the verdict; ≥4/5 describe the job (lining up enough power ahead of demand, with the automatics handling the seconds); ≥3/5 name two of inertia, battery and governors; nobody is stuck over 30 s without knowing what to do; ≥3/5 explain their grade in their own words; median stress ≤3 and confusion ≤2; the owner's stress and confusion lower than for v2.
**Fail:** fix the top three issues and re-run with at least two new testers.

### W6 — Phase 4: the daily

Requirement text for each Y- and F- item is in `SPEC-history.md` Phase 4, amended as below.
- **Y-1 — Date and number.** The local calendar date; puzzle #1 is 2026-10-12 (`content/dailies.js` `from`). Seeds follow Q-75 (`YYYYMMDD + k·10⁸`), a recorded deviation from Y-1's hash.
- **Y-2 (amended, Q-99) — Official runs.** The first daily a browser ever plays is practice unless the player claims it at the end ("Count this one?"). From then on, the first run of a date that passes 09:00 is official; later runs are PRACTICE. The verdict and the share card carry the tag (FIRST SHIFT, OFFICIAL, PRACTICE). The practice shelf holds past dates and the labelled Hard days.
- **Y-3 — History and streak.** One entry per date; STREAK counts consecutive dates played; BEST counts consecutive dates at par or better. With storage blocked the game plays and says "history off".
- **Y-4 (amended for Q-48 and Q-98) — The share card** (§4.7): the number, the date, the score and letter (★ at par or better), the sparkline and the lowest Hz, three rows against par, the closing line, the link. Tags: FIRST SHIFT, PRACTICE, HAND-FLOWN, NO COACH, GLASS BROKEN. A lint rejects event words and HH:MM times.
- **Y-5 — Copy** with a visible "Copied", and a fallback.
- **Y-7 — Closing lines:** at least 40 dry lines keyed by outcome, the pick seeded by date and outcome.
- **Y-8 — The link on a phone:** a landing page below the C-9 viewport or on a touch-only pointer (the pitch, a preview image, COPY LINK); `og:` tags, a 1200×630 image of the watch's trace, a favicon.
- **Y-11 — A ladder of other shifts.** For every date, `tools/daily-gen.js` stores the points of GRIDWATCH's own players (did nothing, the lean and competent proxies, par = 1000), and the verdict shows where you sit among them, labelled as synthetic. It answers "is 975 good?" and gives telemetry (Y-10) something to stand beside.
- **D-28 — The week ahead** (Q-103). The briefing shows the coming week's day types ("This week: Tue mild · Wed storm · Thu HEATWAVE"), computed from each date's seed (`sim/dayplan.js` `prerollRegime` reads only the seed).
- **D-29 — Anniversary dailies** (Q-103). On the dates of real NEM incidents the daily is a labelled scenario variant shaped by the incident (Callide C, 25 May 2021: a double unit trip; the Victorian transmission towers, 13 Feb 2024: a tie derate and a unit loss; Loy Yang A3, 14 Dec 2017), gated by D-9 like any daily, with a one-card account before the briefing. The SA black system (28 Sep 2016), which no plan survives, is the practice shelf's first Hard day.
- **F-7 — Persistence and resume; F-8 (amended) — par's end total stored per date** in `content/dailies.js`, so the grade is the same for everyone by construction (risk 5); **F-9 — version coherence; F-14 — the root page becomes the daily itself.**
- **Y-10 — Telemetry** (Q-105), after Y-4 and Y-11: an anonymous record per day played (seed, version, inputs, score, a random browser id; an opt-out in SETTINGS; a one-line notice), so the owner can replay any stranger's day and the verdict can show a real histogram. It needs C-1's exception and an endpoint, decided when it is built.
- **Gate 2** (`SPEC-history.md`, Playtest gate 2): ≥4/5 finish; ≥3/5 share unprompted; ≥2/5 play the next day; the card and the link unfurl correctly in each tester's app; ≥3/5 retell their moment; no spoiler complaints.

**Cut list** (in this order if W6 runs long): Y-6 PNG card, D-23 replay scrub, D-22 counterfactual, G-4 weather art beyond a tint, U-8 map life, K-20 foley beyond the hum and the breaker clack, P-10 battery P&L, Y-9 seasons (the labelled late-summer day stays).
**Never cut:** H-8 (one physics engine), K-15/K-16 (watch, then respond), S-4 and D-9 (par and solvable days), K-13 (RESTORE), the P-1–P-4 belly.

### Later, not scheduled

- **Phase 3, the rest of the city:** P-10, U-2's HOT WATER HOLD, EV DELAY, VPP and rooftop backstop, U-5, U-7, U-8, S-14 extended. Decided on gate 1's evidence (do strangers open the suburb card?).
- **Phase 5, week mode** (W-1–W-5, H-17): parked.

---

## 6. Targets

Live targets only. Figures are on the game's day (`desk`, `desk-weekend`) unless marked; older measurements are in `SPEC-history.md` §6.

| Metric | Now (measured) | Target | How measured |
|---|---|---|---|
| Par sheds nothing, raw seeds | `desk` 93.5%, `desk-weekend` 99% (2c stage C) | ≥85% | `tools/par.js` (S-12) |
| Par sheds nothing, forced heatwave | 74 of 100 | ≥70% (Q-87) | `tools/par.js` |
| Par arms the reserve diesel | `desk` 6.5–7.5% (2a) | ≤25% | `tools/par.js` (Q-2) |
| Competent proxy earns A | 75% of 100 `desk` days (after Q-88) | ≥70%; re-measured under Q-98's letters (W1) | `tools/par.js --allin` (S-5) |
| Lean proxy earns A | 48% of 200 (2b, before Q-98) | ≤40% (S-5) | `tools/par.js --allin` |
| A no-input day | fails on 22 of 22 seeds (2a); 11–54 points, a D, on 2026-10-14 (review) | fails, never black | `tools/par.js` (Q-18) |
| SECURE states that hold ≥49.5 Hz when a credible contingency trips | `desk` 6,495 of 6,495; `desk-weekend` 6,684 of 6,685 (2a) | 1,000 of 1,000 | H-8 |
| Heatwave share | 15.4% of 2,000 raw seeds; 17.0% of the shipped year | 15 ± 2% | `tests/dayplan.test.js`, `tools/daily-gen.js` |
| Unwarned contingencies closer than 90 real s | 0 of 4,000 dates | 0 | `tests/dayplan.test.js` (D-8) |
| Front warning lead | 130–175 grid-min (≥26 real s) | ≥25 real s | D-8 |
| Decisions per act (opportunities) | 4 / 5 / 11 | 3–5 / 5–8 / 8–12 | Q-76 (D-10) |
| Longest gap with no decision, 05:30–21:00 | ≤40 s on 61% of dates | ≤40 s on ≥90%, or judged at gate 1 (Q-90) | D-10 |
| Audible alarms, competent proxy | to re-measure on the profile clock (W1) | ≤8 a day | K-8 |
| Forecast band (P10–P90) covers the outcome | 79.6–81% (2c stage C) | about 80% | L-2 |
| Negative-price hours, mild days | weekday 1.68 h, weekend 2.62 h | 2–6 h (open since 2a) | P-9 |
| Session, link to the verdict | 306.8 real s from Space with no reading (two full watches); 288.3 s returning | first shift ≤6:50 and returning ≤6:00 to SHARE | D-2 (measured when W3 and W6 land) |
| First click → first real action | 0 s (the clock is held) | ≤60 s | O-2 |
| Frame cost | sim p95 0.14 ms at 120×, 2.0 ms at 2,100×; par's slice, a frame at a time on 2026-10-14: p95 1.9 ms, max 7.1 ms, none over 8 ms (X-46, budget 1.5 ms); night roll's view model p95 0.33 ms, max 0.6 ms | p95 ≤8 ms | `?perf`, `tools/perf.mjs` (F-11) |
| First-visit transfer | 472.7 KB gzip (W1: 422.7 KB before X-49 put the module headers back, +50.0 KB) | reported (Q-84) | `tools/perf.mjs --sizes` |
| Playtests | none yet | the W2 and W5 pass lines; gate 2's | W2, W5, W6 |

---

## 7. Differentiation

Checked on itch.io, 2026-09-29.

| | *Grid Operator* (itch.io, Aug 2026) | *Blackstart* (itch.io, ~Sep 2026) | GRIDWATCH |
|---|---|---|---|
| Loop | Plan an 8-block day, press RUN DAY, AGC runs it in ~70 s, decision cards pause play | Utility tycoon, holding 50 Hz second by second | A live commitment desk on a running clock: no RUN button; the clock holds only for the player's own moments (a hand-back, a trip's card, the alarm panel on request) |
| Trip moment | Automation handles it | You hold 50 Hz yourself | The true first 30 s in slow motion (inertia → battery → governors → relays), then respond |
| Progression | Money buys stations; seasons; perks | Fuel, build, contracts | None in the daily |
| Scoring | Money | Money and survival | One ALL-IN score against par, on a solvable seeded day |
| Setting | Generic | 13 regions; Iberia 2025, Italy 2003, Texas 2021 | The NEM: the rooftop-solar belly, negative prices, MSL notices, Australian incidents (D-24, D-29) |
| Sharing | Save codes | — | A spoiler-free daily share card (W6) |

**Ours alone:** the explained first 30 seconds; a physical desk showing every machine at once; par-graded fairness; the Australian duck; a daily.
**What we avoid:** the plan → run → cards → economy loop; a modal planning screen (L-7); cards that dispatch (K-9); money as a resource; reflex frequency-holding as the default.

---

## 8. Realism ledger

Two tables carry the realism: §8.1, the real-world facts the game uses, with sources and confidence; §8.2, every deliberate abstraction, each labelled in-game behind a "?". The in-game text of each abstraction (the real value, ours, and why) is in `content/text.js`, built from `sim/params.js` so its numbers cannot drift; §8.2 is its index. The alarm explainers (`content/alarmhelp.js`) cite §8.1 rows by name.

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
| VCR by region and customer type | Q-48 OUTAGES | 2024 dollars, $/MWh: NEM 30,000; NSW+ACT 30,930; VIC 35,780; QLD 25,750; SA 33,320; TAS 18,990; residential NEM 41,480. For outages up to 12 h; no $/kWh for planned, momentary, widespread or longer outages | AER VCR 2024 Tables 1 and 20 | H |
| Value of emissions reduction | Q-48 CARBON | Interim VER, AUD2023 real, per t CO₂-e: 2024 $70, 2025 $75, 2026 $80, 2027 $84, 2030 $105; ±25% sensitivity; the ministers' statement ran to 30 Jun 2026 and no replacement value was found by 2026-10-08 | [AER VER guidance (May 2024)](https://www.aer.gov.au/system/files/2024-05/AER%20-%20Valuing%20emissions%20reduction%20-%20Final%20guidance%20and%20explanatory%20statement%20-%20May%202024.pdf) Table 1; [MCE statement (amended)](https://aer.gov.au/system/files/2024-08/Amended%20VER%20MCE%20Statement.pdf) | H (value) / UNVERIFIED (no replacement) |
| Reliability standard | Q-48 OUTAGES | 0.002% expected unserved energy per region per financial year (1 Jul 2025 to 30 Jun 2028), set where the total cost of new generation and unserved energy is least; 0.003% recommended from 1 Jul 2028 | [Reliability Panel RSSR 2026 final report](https://www.aemc.gov.au/sites/default/files/2026-04/RSSR%202026%20-%20Final%20Report.pdf) | H |
| STPIS for distribution networks | Q-48 RELIABILITY | STPIS v2.0 still applies to distributors. Cl. 3.3(a)(2)–(4) exclude load shed for a generation shortfall, by under-frequency relays and at the direction of AEMO. Incentive rates are built from VCR with w = 1.5 (60% to SAIDI, 40% to SAIFI); the reliability s-factors are capped at ±5% of annual revenue | [AER STPIS v2.0 (Nov 2018, updated Dec 2018)](https://www.aer.gov.au/system/files/AER%20-%20Service%20Target%20Performance%20Incentive%20Scheme%20v%202.0%20-%2014%20November%202018%20%28updated%2013%20December%202018%29.pdf) cl. 2.5, 3.2.2, 3.3, App. B | H |
| Sustained and momentary interruptions | Q-48 RELIABILITY | Longer than 3 minutes is sustained (SAIDI, SAIFI); 3 minutes or less is momentary (MAIFI). SAIDI = minutes of sustained interruption ÷ the customer base; SAIFI = their number ÷ the customer base | [AER Distribution Reliability Measures Guideline (Aug 2022, updated Dec 2024)](https://aer.gov.au/system/files/2024-12/AER%20-%20Distribution%20reliability%20measures%20guideline%20-%20August%202022%20%28updated%20December%202024%29.pdf) §3.1–3.3 | H |
| Network reliability delivered | Q-48 RELIABILITY | 2024, the average network customer: all outages SAIDI 394 min, SAIFI 1.6; normalised SAIDI 115 min, SAIFI 1.0 | [AER networks performance report 2025](https://www.aer.gov.au/system/files/2025-12/AER%20-%202025%20Electricity%20and%20gas%20networks%20performance%20report%20-%20December%202025.pdf) | H |
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
| Air-con programs | U-2 | PeakSmart: 155,738 air-cons, 107 MW at a 50% cap; events about 16:00–19:00; a one-off rebate of up to $400 an air-con | [ABC 2025](https://www.abc.net.au/news/science/2025-02-26/peaksmart-flexible-loading-energy-demand-reduction/104949388) | M |
| Solar-soak hot-water windows | U-2 soak (Q-52) | SA Power Networks' solar sponge heated controlled-load tanks 10:00–15:00 (09:30–16:30 from 1 Jul 2025); Ausgrid moved Controlled Load 1 into the day from Jul 2024; Powercor began moving >140,000 hot-water customers to daytime in 2025 | [RenewEconomy](https://reneweconomy.com.au/networks-offer-super-cheap-pricing-to-soak-up-australias-solar-sponge-10879/), [SAPN tariffs](https://www.sapowernetworks.com.au/your-power/billing/pricing-tariffs/electricity-tariffs/), [Ausgrid](https://www.ausgrid.com.au/your-energy-use/smarter-energy-use/understanding-network-tariffs/controlled-load-pricing), [Powercor](https://powercor.com.au/network-planning-and-projects/network-innovation/flexible-hot-water/) | M |
| Size of shiftable hot water | U-1 soak MW, U-2 cap | SA trial (18,843 homes): 45.4% of hot-water load shifted to daytime, about 2.5 kWh a day a home, 0.3% opted out; about 10.5 GWh a day shiftable across the NEM from about 4 M storage tanks; 20,000 systems ≈ 48 MW controllable | [UNSW/Yildiz 2025](https://www2.pv.unsw.edu.au/videos/Baran-Yildiz-4June2025/slides/Turning-household-water-heating-systems-into-MW-batteries-to-support-the-integration-of-consumer-energy-resources-(CER).pdf); [ARENA](https://arena.gov.au/news/dynamically-managing-hot-water-systems-in-south-australia) | H / M |
| Controlled load in the MSL framework | S-14 rule 1, MSL cards (Q-60) | MSL1 is a notice; at MSL2 AEMO recalls outages, decommits and uses storage; at MSL3 networks keep demand up "via controlled loads, network-managed storage" and, last, the emergency backstop; networks turn hot water on in MSL events | [AEMC MSL consultation paper, Jul 2026, Table 2.1](https://www.aemc.gov.au/sites/default/files/2026-07/msl_rule_changes_consultation_paper_erc0417_erc0439.pdf); [United Energy](https://www.unitedenergy.com.au/outages-emergencies/minimum-system-load-events) | H |
| Air-con snapback | U-2 snapback (Q-53) | Residential snapback as a share of the event's energy: 16.6% at 50% cycling and 35.1% at 100% (SDG&E 2008, over up to 4 h); about 0.5 kW in the hour after a 1.0/0.5 kW two-hour thermostat event (SCE 2019); front-loaded | [SDG&E 2008](https://www.calmac.org/publications/08_Summer_Saver_Impact_final_w_Appendix_A_4-1-09V2.pdf) Table 3-3; [SCE PY2019](https://www.calmac.org/publications/SCE0442.01_PY2019_SCE_DR_Program_Report_SEP_Public.pdf) | H |
| Opt-outs and overrides | U-4 patience (Q-54) | 12.9% of 6,389 thermostats overrode 2019 events, more with longer events, hotter days and past DR; the SA hot-water trial lost 0.3% (53 of 18,843) | [Sarran et al. 2021, Energy Policy 153](https://ideas.repec.org/a/eee/enepol/v153y2021ics0301421521001592.html); UNSW/Yildiz 2025 | H |
| Thermal plant reference | F-13 | Coal minimum 30%, ramp 3%/min; OCGT minimum 50%; starts in 5–30 min | [Aurecon 2021 cost & technical review](https://www.aemo.com.au/-/media/files/major-publications/isp/2022/iasr/aurecon-2021-cost-and-technical-parameters-review-report.pdf) | H (new-build reference) |
| Largest real load trip | F-13 smelter | Boyne Island potline 2, 256 MW (2021) | Callide report s6.1 | H |
| Alarm rates | K-8 | ≤1 alarm per 10 min steady; >10 per 10 min is a flood | EEMUA 191 / ISA-18.2 via [summary](https://seqent.com/blog/alarm-rationalization-explained/) | M |

### 8.2 Deliberate abstractions

Every row is labelled in-game behind a "?" (H-14). Its text (the real value, ours and why) is the row's entry in `content/text.js`, built from `sim/params.js`. The titles are tested: `tests/text.test.js` fails when a title here has no entry or an entry has no title, so a row is added here in the same commit as its entry.


| Abstraction (the row title the game shows) | Where the player meets it | Entry in `content/text.js` |
|---|---|---|
| **Compressed playback.** | `#rate-badge` | `compressed-playback` |
| **Event-dense day.** | `#tray` | `event-dense-day` |
| **Compressed synchroscope.** | `#bay-sync` | `compressed-synchroscope` |
| **Auto-sync takes 4 grid-minutes** | `#bay-sync` | `auto-sync` |
| **Par re-plans after every action.** | `#btn-redispatch` | `par-replans` |
| **RE-DISPATCH re-runs the pre-dispatch on demand.** | `#btn-redispatch` | `re-dispatch` |
| **Frequency alarms escalate by severity.** | `#annunciator` | `alarm-escalation` |
| **Pre-dispatch is computed once, at 04:30** | `#stack` | `pre-dispatch` |
| **Act I restore task** | `#bay-restore` | `act-i-restore-task` |
| **The player commits units and sets output.** | `#lever-coal` | `player-commits` |
| **AGC band around each lever.** | `#key-agc` | `agc-band` |
| **DC tie.** | `#knob-tie` | `dc-tie` |
| **Mainland interconnected standard.** | `#dial-freq` | `mainland-standard` |
| **MSL3 = 1,000 MW, with MSL2 and MSL1 300 and 600 MW above it** | `#tray` | `msl-tiers` |
| **One-node network.** | `#map` | `one-node` |
| **Cost-based offers; scarcity adder.** | `#stack` | `cost-based-offers` |
| **CUSTOMER COST is the resource cost of serving** | `#chip-cost` | `customer-cost` |
| **CARBON counts the region's own generation.** | `#chip-co2` | `carbon-generation` |
| **LOR states via 1.25 × L.** | `#gauge-n1` | `lor-states` |
| **UFLS: 8 × 6% blocks from 49.0 Hz in 0.125 Hz steps.** | `#annunciator` | `ufls-blocks` |
| **Collapse after 20 s at 47.5–48.0 Hz.** | `#dial-freq` | `collapse` |
| **Wind, utility solar and rooftop solar respond to over-frequency only.** | `#dial-freq` | `wind-solar-pfr` |
| **Rooftop solar: one curve, six skies.** | `#map` | `rooftop-model` |
| **A mild day is the hot day with its cooling load removed.** | `#stack` | `mild-days` |
| **The dispatch spills wind and solar automatically, pro rata.** | `#stack` | `auto-curtailment` |
| **Minimum down time runs from breaker open to the next START.** | `#lever-coal` | `min-down-time` |
| **Automatic directed shedding when the FOS timers run out.** (GRIDWATCH's own rule, H-18) | `#key-shed` | `directed-shedding` |
| **The GUARD is contingency FCAS, set by hand.** | `#ring-guard` | `guard-ring` |
| **Restore permissive** | `#bay-restore` | `restore-permissive` |
| **Cold-load pickup ×1.5.** | `#bay-restore` | `cold-load` |
| **City levers' MW, costs and patience.** | `#btn-dr` | `city-levers` |
| **A hot-water soak moves that night's heating to noon.** | the "?" drawer | `hot-water-soak` |
| **An air-con cycle pre-cools, relieves, then snaps back.** | the "?" drawer | `aircon-cycle` |
| **HOT WATER HOLD is 80 MW** | the "?" drawer | `hot-water-hold` |
| **Coal ramps at 3 MW/min per machine** | `#lever-coal` | `coal-ramp` |
| **Region scale.** | `#map` | `region-scale` |
| **Hum reference tone** | `#btn-mute` | `hum-tone` |
| **Daily hydro allocation** | `#wheel-hydro` | `hydro-allocation` |
| **Hydro spins free.** | `#wheel-hydro` | `hydro-spins-free` |
| **Every daily is a late-summer day, until Y-9 ships** | `#clock` | `late-summer` |
| **The score divides par's ALL-IN by yours** | `#chip-allin` | `allin-score` |
| **Every MWh dark that is yours is valued at the NEM VCR, $30,000/MWh (2024 dollars)** | the "?" drawer | `allin-vcr` |
| **ALL-IN carbon charges every MWh the city asked for at the region's own intensity** | the "?" drawer | `allin-carbon` |
| **SAIDI, SAIFI and MAIFI count the outages you cause, per household, in grid-minutes** | the "?" drawer | `reliability-indices` |
| **The night shift runs 21:00–04:00.** | `#night-strip` | `night-shift` |
| **HAND turns AGC off until 21:00.** | `#chip-hand` | `hand-mode` |
| **Act I's constraints are announced at 04:00.** | `#briefing-watch` | `act-i-constraints` |
| **Every gate-checked daily is solvable.** | `#briefing-watch` | `gated-dailies` |
| **Warning leads are game-sized.** | `#tray` | `warning-leads` |
| **COVER after a trip is R5 ≥ L, not the NEM's secure state.** | `#gauge-n1` | `cover` |
| **The clock holds at each hand-back.** | `#rate-badge` | `feeder-hold` |
| **An offered SYNC runs at 30×.** | `#bay-sync` | `offer-pace` |

### 8.3 Still unverified

Do not state these as fact in-game until they are checked:
- swing-equation constants (textbook only);
- rooftop penetration by state and the 0.70 clear-sky factor;
- total NEM VPP MW (say "hundreds of MW, not GW");
- EV smart-charging share;
- the size of pre-cooling;
- the air-con snapback's 40% and its shape (U-2, Q-53);
- the air-con customer cost of $400/MWh relieved (U-6, Q-55);
- this region's electric-storage hot-water share, and so the 480-MW soak, the 1.9-GWh cap and the split by suburb (U-1);
- patience magnitudes and the response scaling (U-4, Q-54);
- ramp and start times of *existing* NEM coal units (today's 12 MW/min per station is labelled "brown-coal-like, unverified");
- the T1/T2/T4 split of start and stop times by plant class (F-13);
- how long a real auto-synchroniser takes from full speed to breaker close (K-12 uses 4 grid-minutes);
- a security floor (MSL3) for a region like ours (P-4 uses 1,000 MW);
- grid-forming battery parameters (H-17);
- the ISA-18.2 acknowledge semantics;
- the CPT rolling window;
- intervention pricing under RERT (P-8);
- the rooftop inverter ramp after it reconnects (P-12 and H-8 use 6 minutes whatever the output, a sixth of present output a minute; the standard's 16.67% of rating a minute, AS/NZS 4777.2:2020, is not yet read in a primary source). The 60-s reconnection delay before the ramp is no longer on this list: it is from AS/NZS 4777.2:2020 and was confirmed in the Phase 2a review against a network operator's settings sheet for region Australia A, with the 50.25–52 Hz over-frequency response and its 0.1 Hz hysteresis;
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

## 9. Decisions and risks

### 9.1 Decision log

| Decisions | Where the full text is |
|---|---|
| OD-1–OD-17 | §1 here (the 2026-09-29/30 originals: `SPEC-history.md` §1) |
| Q-1–Q-60, D1–D3 | `SPEC-history.md` §9.1 |
| Q-61–Q-91 | `SPEC-history.md` Appendix C; what each measured: `desk/README.md` §32.11 |
| Q-92 onward | below; each is also written into the rule it changes |

The owner's answers to the review, 2026-10-15:

| # | Decision | Why | Builds in |
|---|---|---|---|
| Q-92 | **Coach, then the problem.** The plan line names the unit, the MW and the minute on a first shift; from the second (or with COACH OFF) it states the problem and lights the candidates; "no coach" is tagged. (O-8) | Following the line beat par on every measured day: strangers stay safe on day one, and later days get a decision. | W4 |
| Q-93 | **The commitment desk.** On AGC days the levers, the wheel and the stack are motorised readouts; START/STOP are word buttons per station; the GUARD is a labelled slider; the tie knob no longer holds the levers; HAND keeps live levers. (K-24) | The levers were never asked for and a touch froze the dispatch; NEMDE sets base points in the real NEM, and operators commit, reserve, set the tie and restore. | W4 |
| Q-94 | **The share loop stays in Phase 4**, after 2d and 2e (the review's recommendation to build it first was declined). | The owner's order. | W6 |
| Q-95 | **Dark districts hold the clock** after a shedding trip, a card per relay stage at its allowed restore. (D-26) | At 150× each real second of reading cost about $2.7M at VCR, while a 240-MW hand-back already holds. | W3 |
| Q-96 | **One card for the morning hand-backs**; Esc restores; leaving a feeder dark is a priced choice; a card holds only when the restore would be accepted. (D-27; amends Q-91) | Two holds in the first 30 s, each with one sensible answer, and an Esc that quietly cost $7M an hour. | W1 |
| Q-97 | **Slow motion for the first real fall** (≥300 MW lost); rises compact; the slow part ends half a second after the extreme; the first directed shed plays a compact watch. (K-15) | The one full showing went to a midday rise about a third of the time; the evening fall the GUARD catches played compact. | W1 |
| Q-98 | **Letters in MWh-equivalents** of the gap to par (A ≤10, B ≤150, C ≤600); carbon stays in the score. (S-5) | The same mistake was a B on a heatwave and a C on a calm day, because the inert carbon term is half of par's total. | W1 |
| Q-99 | **The first shift is practice unless claimed**; from day 2 one official run per date; replays are PRACTICE; the card shows the tag. (Y-2) | A stranger's first day is learning the desk; the single go still gives later days their weight. | W6 |
| Q-100 | **"About six minutes"**; the watch's dead tail trimmed; the night roll folded into the verdict later. | Measured: 306.8 real s of clock before any reading; the spec's own arithmetic said 6:41–6:49. | W1, W3 |
| Q-101 | **A minimal 2e:** cover plates lifted when the line first needs a control, no per-control autopilot, a 60-word briefing, Marg as a voice only, no new holds. (O-3, D-3, O-6) | The specified 2e added about 40 s of holds and an autopilot per control for little a stranger would see. | W1 (D-3), W4 |
| Q-102 | **No invented rules:** the random hot-unit trip removed, the shedding timers tagged as GRIDWATCH's rule, the GUARD labelled as contingency FCAS; no physics number changes. (H-18) | The hot-unit trip fired on governors doing their mandatory duty; the timers were taught as the frequency standard; the game's signature decision had no label. | W1 |
| Q-103 | **Variety:** a week-ahead line on the briefing and anniversary dailies on real NEM incident dates, with SA 2016 as the first Hard day. (D-28, D-29) | Every daily has the same skeleton; real incidents are a reason to open a link. | W6 |
| Q-104 | **A slim spec and its history;** the module headers back into the code; a decision is written where it lands. | 1.04 MB of prose had drifted three slices behind the build. | W0, W1 (X-49) |
| Q-105 | **Telemetry after the share card** and a static ladder exist. (Y-10, Y-11) | A histogram should never be empty, and the card is what it measures. | W6 |
| Q-106 | **The greybox check after the W1 fixes**, before anything larger is built. | Nobody but the owner has played; the cheap fixes first. | W2 |
| Q-107 | **The order:** the spec rewrite, the quick fixes, the greybox check, then 2d, 2e, gate 1 and Phase 4. | The owner's call. | — |

### 9.2 Open questions for the owner

Raised by the review and not yet decided. Ask before building any of them.
1. One "soak the city" booking in place of six per-suburb asks a day.
2. The live SCORE chip: hide it until 21:00, or relabel it "vs PAR so far" (it read 1001 ten minutes before the lights went out).
3. Rank names beside the letter (TRAINEE … SHIFT SUPERVISOR … MARG'S CHAIR).
4. A fifth N-1 word, TRIP SHEDS, when the trip preview is below the first UFLS stage (TIGHT can mean the next trip darkens two suburbs).
5. Prices on both sides of the line's asks (a STOP, the spare, the GUARD against battery energy): Q-92's option not chosen.
6. The certain evening trip: say "the peak gets a trip" in the briefing, or vary its time and add a rare second trip.
7. "What par did that you didn't" (a decision diff) in place of D-22's 30 re-simulations.
8. RESTORE as a small skill (a longer FOCUS that shows the pickup's dip and counts clean pickups); the SYNC scope on AGC days.
9. Plain words on the alarm tiles, or one ALARMS lamp (Q-93's option D, not chosen now).
10. The classic-day golden and the dailies stamp as unit tests (a 5-minute and a 15-minute regeneration on every sim change).
11. Phase 3's levers and Phase 5's week mode: schedule after the gates, or cut.
12. O-4's concept cards and O-5's "why?" on every message: in a later 2e, or out.
13. Seasons (Y-9), or a lighter version before gate 2.
14. A carbon choice that matters (carbon stays inside the score under Q-98).
15. One module for "when is this unit on, and what is short ahead", shared by the plan line, the Live Stack, par and the plan executor (five copies today, tuned against each other by measurement).

### 9.3 Risks

1. **Nobody but the owner has played.** Every stranger-facing accept is unmeasured. *Mitigation:* W2 after W1, gate 1 at W5.
2. **The changing playback speed may confuse** (one grid clock, 0.15× to 2,100×). *Mitigation:* the badge names the segment and is always visible; a "?" explains it; gate 1 checks it.
3. **The watch eats the session.** *Mitigation:* one full watch per browser, for the first fall only, and a shorter slow part (Q-97); "about six minutes" (Q-100).
4. **Cognitive load:** 81 controls on screen one. *Mitigation:* the commitment desk (W4), cover plates (O-3), the 60-word briefing (W1).
5. **Heat days are the hardest:** par is clean on 74% of forced heatwaves. *Mitigation:* the gate swaps an unsolvable date for a solvable one of the same kind (Q-87, D-9).
6. **Cross-engine floating point:** browsers may differ in `Math.exp` and the like. *Mitigation:* no transcendental per tick in `sim/` (tested); par's total stored per date (F-8, W6); a `?selftest` page before release.
7. **The share sparkline leaks timing:** accepted; it shows the result, not the event.
8. **`file://` does not work** (ES modules need http): accepted with OD-15.
9. **Safari may clear script-written storage** after 7 days away: say "history off" (Y-3).
10. **Low-inertia over-shedding at a sunny noon:** static UFLS blocks darken more than twice the customers per MW shed. Labelled in §8.2; the real remedy (disarming blocks that feed back) is not modelled.
11. **The documents drift.** *Mitigation:* Q-104's rules for this file; tests hold §8's titles and facts to the game.
12. **Usage limits cut multi-agent slices** (twice in 2c, twice in the review). *Mitigation:* small slices; resume from a workflow's journal; prompts that stand alone.

---

## 10. Verification

**Local run.** `.claude/launch.json` serves the repo (`py -m http.server 8642`) at <http://localhost:8642/next.html>. ES modules need http; never `file://`.

**Headless first** (`CLAUDE.md` holds the rules):
- `node --test` runs the suite (916 tests, about 45–75 s); `npm run test:changed` runs only the tests a change can affect.
- `node tools/play.mjs <seed> ...` plays the real page headless by jumping the sim between moments (`--help`). A day takes seconds.
- `tools/par.js` (par and the proxies on any seeds), `tools/follow.mjs` (the hint-following player), `tools/daily-gen.js` (writes `content/dailies.js`), `tools/baseline-v4.js` (the classic day's golden), `tools/perf.mjs` (frame cost, sizes). These are statistics: run one only when the change is about balance or par, once.

**The browser** is for one final visual check of a slice, by the integrator, in one pane (the owner's PC runs out of memory with more): resize to 1280×720 (and 1280×600 for K-17), serve each pass on a fresh port (the pane caches modules), draw a few frames before every click. `?perf` shows frame costs; `?debug` exposes `gridwatch`.

**Playtests:** W2, W5 and gate 2, with a one-page log per tester.

---

## 11. Release checklist

**Every slice:**
- [ ] `<meta charset="utf-8">` first in every HTML file (C-2; test); in-page resets only (C-3)
- [ ] No request to another origin; no build step (C-1)
- [ ] `node --test` green; the classic golden re-recorded only when intended
- [ ] `content/dailies.js` re-generated at the slice's final `SIM_VERSION` (a stale stamp cannot merge)
- [ ] §6 rows the slice moves re-measured and pasted into the PR
- [ ] Decisions written into the rules they change and into §9.1, in the same PR (Q-104)
- [ ] Pushed to `main`; Pages green; the live site checked (`curl -sI https://databerryau.github.io/gridwatch/` and a played day)

**W1:** X-39–X-49, K-15, D-27, S-5, H-18, D-3 and D-7 accepts met; one browser pass at 1280×600 and 1280×720 (X-47).
**W2:** two logs; pass or the top issue fixed and re-checked.
**W3:** D-20, D-21, D-24 (cards fact-checked), D-25 (≤45 s), D-26 and L-10 accepts met; D-2 measured to the verdict.
**W4:** K-24, O-3, O-6 and O-8 accepts met; the first shift played through in the browser.
**W5:** gate 1 passed.
**W6:** `dailies.js` covers ≥365 days with par's totals (F-8); the share card pasted into two messaging apps; the link unfurls and a phone gets the landing page; `?selftest` in Chrome, Edge and Firefox; gate 2 passed.

**Launch, after gate 2.** One itch.io page linking to the Pages URL (no copy, C-4) and one launch post that leads with the model ("what the model does and doesn't capture", §8). Venues: Show HN, LinkedIn, NEM commentators such as WattClarity.

---

## Appendix B. Glossary

| Term | Meaning |
|---|---|
| **AEMO** | Australian Energy Market Operator. Runs the NEM and its control rooms. |
| **AGC** | Automatic generation control: software that nudges generators every few seconds to hold 50 Hz. |
| **ALL-IN** | GRIDWATCH's one score currency: the cost of supply, plus every MWh dark that is yours at VCR, plus carbon at the VER. |
| **Base point** | The MW a unit is scheduled to produce; the lever handle. |
| **Belly** | The midday dip in operational demand caused by rooftop solar. |
| **Cold-load pickup** | The extra load when a district that has been off comes back (fridges and air-cons all start at once). |
| **Contingency** | A sudden failure: a generator, line or big load tripping. **Credible:** one the rules expect you to survive. |
| **COVER** | The N-1 gauge's row after a trip: spare in 5 minutes back to at least the biggest risk, with no shed district dark, within 30 minutes (GRIDWATCH's floor for the NEM's secure state). |
| **Cover plate** | On a first shift, a plate over a control the plan line has not yet asked for; it lifts at the first ask (O-3). |
| **CCGT / OCGT (GT)** | Combined-cycle gas turbine (efficient, slower) / open-cycle gas turbine or "peaker" (fast, costly). |
| **Curtailment / spill** | Turning wind or solar down even though the energy is available. The dispatch spills automatically when must-run plant plus wind and sun exceed demand. |
| **Deadband** | The small frequency range where automatic response does nothing (±0.015 Hz). |
| **DR** | Demand response: customers paid to use less. |
| **Droop** | How strongly a governor responds. 5% droop means a full output change for a 5% (2.5 Hz) frequency change. |
| **Duck curve** | The shape of demand after solar: a hollow middle (the belly) and a steep evening neck. |
| **FCAS / FFR** | Frequency Control Ancillary Services, the markets that pay for frequency response / fast frequency response, usually from batteries, in under a second. |
| **Feeder card / hand-back** | The network hands back a feeder it has repaired; the clock holds on a card naming it until you restore it (Q-91, D-27). |
| **FOS** | Frequency Operating Standard: how far and how long frequency may stray. |
| **Governor** | A generator's automatic speed controller. It opens the throttle when frequency falls. |
| **GUARD** | Battery MW held back to catch a trip, delivered within a second: contingency FCAS, set by hand. |
| **GW·s** | Gigawatt-seconds: the unit of stored spinning energy (inertia). |
| **HELD** | The badge when the clock holds for the player: a feeder card, a respond card, the alarm panel, pause. |
| **Inertia** | Energy stored in the spinning mass of big synchronous machines. It slows how fast frequency falls. |
| **Interconnector / tie** | The link to the neighbouring region. |
| **L** | The largest credible contingency: the biggest single thing that could trip right now. |
| **LOR1/2/3** | Lack of Reserve levels: 1 and 2 are warnings; 3 means load is being shed. |
| **Merit order** | Using plant cheapest-first; the last unit needed sets the price. |
| **MPC / floor** | Market price cap ($23,200/MWh) / market floor price (−$1,000/MWh). |
| **MSL1/2/3** | Minimum System Load notices: demand forecast too low to keep the grid secure. |
| **MIN** | Minimum stable generation: the lowest output a thermal unit can hold. |
| **MWh-equivalent** | A dollar gap divided by VCR: how many MWh dark it is worth. The letters use it (Q-98). |
| **N-1** | Being able to lose the single largest item and still cope. |
| **Nadir** | The lowest point frequency reaches after a trip. |
| **NEM** | National Electricity Market (eastern and southern Australia). |
| **Net load** | A district's demand minus its own rooftop solar: what its feeder carries. |
| **Night shift** | From 21:00 the desk is handed over and run on par's rules to 04:00, in 12 real s (Q-73). |
| **Normal band** | 49.85–50.15 Hz. |
| **OFGS** | Over-frequency generation shedding: tripping generators when frequency is too high. |
| **Operational / underlying demand** | What the grid must supply / what homes and businesses use, before rooftop solar. |
| **P10 / P50 / P90** | A forecast range: 10% chance below, the median, 10% chance above. |
| **Par** | GRIDWATCH's fixed reference dispatcher, played on the same day using only what a player can see; it scores 1000. |
| **PFR** | Primary frequency response: governors and inverters reacting to local frequency. |
| **Plan line** | The one line above the desk that says what is needed next (`app/objective.js`). |
| **Pre-dispatch** | The schedule at 04:30: merit order for the median forecast (L-0). |
| **Profile** | The D-2 playback speeds through the day: slowest at the peak, fastest at night. |
| **R5** | Reserve deliverable within 5 minutes ("SPARE IN 5 MIN"). |
| **Rebound / snapback** | Load that returns after a demand-response action ends. |
| **RERT** | Reliability and Emergency Reserve Trader: AEMO's emergency reserves (our diesel, BREAK GLASS). |
| **RoCoF** | Rate of change of frequency, in Hz per second. |
| **Rooftop PV / backstop** | Behind-the-meter solar / the emergency power to switch newer rooftop systems off. |
| **Seed** | The number that fixes all of a day's randomness. |
| **`SIM_VERSION`** | The rules version. Results are only comparable within one version. |
| **Slip** | The speed difference between a machine and the grid; how fast the synchroscope needle turns. |
| **Swing equation** | df/dt = f₀·ΔP / (2·Ek): how fast frequency changes for a given imbalance and inertia. |
| **Synchroscope / SYNC** | The dial used to close a generator's breaker when it is in step with the grid. |
| **T1–T4** | The NEM's fast-start profile: time to synchronise, to reach minimum load, at minimum, to shut down (F-13). |
| **UFLS** | Under-frequency load shedding: relays that cut blocks of customers below 49.0 Hz. |
| **VCR** | Value of Customer Reliability: what an outage costs customers ($30,000/MWh NEM-wide, AER 2024). |
| **VER** | Value of emissions reduction: the price regulators put on a tonne of CO₂ ($80 for 2026). |
| **VPP** | Virtual power plant: many home batteries dispatched together. |
| **Watch / respond** | The trip sequence: the first 30 s live in slow motion, then the player's turn. |
