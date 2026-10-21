# GRIDWATCH — Spec

**The live spec**, rewritten 2026-10-15 (§9.1 Q-104). It says what the game is today, what it should become and what to build next, in order.
**History:** `SPEC-history.md` is the v4 spec of 2026-09-30 as last amended (2026-10-10), frozen with its line numbers unchanged, plus the slice-2c decisions Q-61–Q-91 in its Appendix C.
**IDs are permanent.** A requirement (C-, OD-, F-, H-, P-, S-, K-, L-, G-, D-, O-, U-, Y-, W-, X-) or decision (Q-) not defined here keeps its last text in `SPEC-history.md`. Nothing is renumbered or reused.
**Build:** `v4-core-2d.0` (`SIM_VERSION`) on `main` (c68399a, PR #25, 2026-10-17), live at <https://databerryau.github.io/gridwatch/>; W7 keeps that sim, with BUILD `2026-10-20`. Since W7 (Q-126) the root is the game itself (`index.html`); `next.html`, its address until then, sends old links there.
**Evidence:** the full review of 2026-10-14 (`REVIEW-2026-10-14.md`: ten lenses, 118 verified findings, the readers' reports in `REVIEW-2026-10-14-reports/`) and the owner's answers to it (Q-92–Q-107).

**How to read this.**
- §0–§2: what we are making and the rules it follows.
- §3: the game as the review of 2026-10-14 found it (`v4-core-2c.1`), kept as that snapshot; what each step built since is in its record in §5. §4: the game we are building toward.
- §5: the plan, in build order (W0–W7), each item with an *Accept:* test.
- §6–§11: targets, positioning, the realism ledger, decisions and risks, verification, the release checklist. Appendix B is the glossary.

**How this document is kept (Q-104).**
- One place per rule. A decision is written into the rule it changes, in the same commit, and gets one row in §9.1. Nothing waits for a later "stage C".
- Built behaviour is described as built (each step's record in §5, and §8.2; §3 stays the review's snapshot of 2c.1). A decided change that is not built yet says *decided, builds in Wn* where it is described.
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
| OD-11 | Shape | A daily first. Week mode (Phase 5) is cut (Q-123), its text kept in `SPEC-history.md`; its outlook ships as D-28. |
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

Measured on the daily of 2026-10-14 (`node tools/play.mjs 20261014 timeline=04:30-04:00/30m`; the review's transcripts are in `REVIEW-2026-10-14-reports/`). This is `v4-core-2c.1` as the review played it, kept as that snapshot and not brought up to date: what W1–W7 changed (among them the commitment desk, the share card, the restore's FOCUS, the SYNC offers and the eight alarm tiles) is in their records in §5.

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
- *Act III, 14:30–21:00.* A heatwave (15%), a storm (25%), a wind drought (20%) or a calm evening (40%). Calm, drought and heatwave days add an unwarned trip of the largest machine at 17:00–19:30 (since Q-121 the briefing announces it, with no time); a storm trips the tie on about a quarter of storm days. About a quarter of days (the storm days) have no evening trip of a machine.
- At most two unwarned trips a day, none before 09:00 or from 21:00, at least 90 real s and 60 grid-minutes apart. Warnings come at least 26 real s ahead on the clock played (130–175 grid-minutes for a front).
- *Night, 21:00–04:00.* The night shift has the desk, on par's own rules from the 21:00 state. Presses that would move the grid are refused; views stay open. The plan bar becomes a night strip that counts SUPPLY, OUTAGES, CARBON, ALL-IN and SCORE up (Q-73).

**Holds and paces.** The clock holds at TAKE THE DESK (until Space), at each feeder's hand-back (the feeder card: R or Enter restores, Esc goes on; Q-91), at each watch's respond card (Enter), in the alarm panel (W, on request) and on pause. It slows for the watch (0.15× → 1× → 10× over 30 grid-seconds: 29 real s the first time, 10.5 s compact), FOCUS (1× for 2 grid-seconds after a restore), RESPOND (30× until frequency is back in band, which in practice is already true when the card closes) and an offered SYNC (30× for up to 8 real s, at most three a day). FAST is 3× while F is held.

**The desk** shows 81 enabled controls at 04:30: five motorised station levers with 22 START/STOP guards, the hydro gate wheel with 6 more, the battery dial and its GUARD ring, the tie knob, the AGC key, RE-DISPATCH, the Live Stack, the procedure bay (SYNC scope, RESTORE list), the message tray, the emergency keys, and in the plan bar twelve alarm tiles with ACK, HORN OFF and EXPLAIN. Under AGC the system dispatches the units you commit every 5 grid-minutes. Moving a lever, the wheel or the tie knob holds every lever until RE-DISPATCH (Q-18), so on an AGC day the right number of lever moves is zero (the commitment desk removes the trap, W4).

**The plan line** (`app/objective.js`) says what is needed next, with a reason and a lead time: ACT NOW, URGENT, SAVING (a STOP and what it saves "if nothing trips before then"), BATTERY, SPARE (the GUARD), SUBURB, PLAN, STEADY. Hovering or lifting a guard first shows what the press will do ("? IF PRESSED"). A scripted player that does exactly what the line says scores 1004 A★ on 2026-10-14 and 1044 on 2026-10-17; nine measured deviations gain at most 1%.

**The city** (slice 2b): six suburbs on the map; a HOT WATER SOAK every day (a 4-hour noon block, free) and an AIR-CON CYCLE on HOT days (pre-cool, 1.5 hours of relief, 40% snapback, $400/MWh relieved, paid for in patience), booked on the suburb card (click a suburb, or H).

**The end, at 04:00:** an end card with SCORE and its letter (par runs in the page), the ALL-IN ledger (SUPPLY, OUTAGES at VCR, CARBON at the VER), SAIDI, SAIFI and MAIFI as readouts, the seed and hash, DOWNLOAD REPLAY LOG and PLAY THIS DAY AGAIN. There is no share card, debrief, history or streak yet.

**The daily.** `next.html` (the site's root, `index.html`, since Q-126) with no query plays today's date. `content/dailies.js` held 365 gate-checked dates from 2026-10-12 (17 exceptions; 95.3% pass at attempt 0; heat 17.0%; 23 days par cannot solve are never shipped). Weekends play `desk-weekend` (coal 4 off since Friday night).

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

The game after W1–W7 (§5). Real times are a first shift's, from the D-2 arithmetic, not yet measured.

### 4.1 A stranger's first daily

| Real time | Grid time | What happens |
|---|---|---|
| 0:00 | 04:00 | The link opens on the briefing over the night map: "Daily #N · Wed 14 Oct · the same day for everyone", one goal line, the day, *Watch for*, one line on what is real, TAKE THE DESK (≤60 words, D-3). |
| 0:15 | 04:30, held | The desk opens with the clock held. The coaching line: "Start CCGT 2 now: it takes 49 min to reach the grid." Controls the line has not asked for yet sit under cover plates (O-3). Two presses on CCGT 2's START: "✓ UNDER WAY". The GUARD slider shows SET 400. |
| 0:20 | 04:30→06:00 | Space. PRE-DAWN at 540×. |
| 0:42 | ~06:55 | The first hand-back: one card for both feeders, "RESTORE HAR4 now; HAR3 at 07:15". Enter closes HAR4 and queues HAR3 (D-27). The needle dips with the cold load and recovers. |
| 1:10–2:10 | 09:00–14:30 | The belly. The line on CCGT 1: "…Stop it: saves about $45,000, carbon included, if nothing trips before then." The battery charges on spill at −$20. The city books its hot-water soak in one press (Q-111). The belly's crisis: a front warned hours ahead, a unit trip, the smelter or the tie (a rise plays a compact watch). |
| 2:10–3:30 | 14:30–18:40 | The evening: the line asks for the starts that cover the peak and its biggest risk; the levers glide up together. |
| ~3:45 | ~18:40 | The largest machine trips: the full watch, the player's first fall (29 s): spin, then "YOUR GUARD: 400 MW", the governors, the settle. The respond card says what caught it. If relays shed, a card holds the clock at each stage's restore (D-26). |
| ~5:05 | 21:00→04:00 | The night shift, 12 s; the night strip counts the day up. |
| ~5:20 | — | The verdict (W3, ≤45 s): score, letter and rank (Q-118) with the letter's one-line rule; lights, cost and carbon in words, with what went dark and why; the moment; a "this really happened" card. |
| ~6:00 | — | SHARE (W6): the card and COPY. |

### 4.2 Layout at the 1280×600 floor

Half and half (K-17): a 32-px header; the desk takes max(300 px, half the viewport height below the header); the map takes the rest. The plan bar (the plan line and the 4×2 alarm tiles with ACK, HORN OFF and EXPLAIN; Q-113) sits on the map's lower edge (Q-45).

```
+------------------------------------------------------------------------------------------+
| GRIDWATCH  18:42 PEAK 150x | LIGHTS ON | COST c/kWh | CO2 t/MWh | SCORE | PAUSE | ?      |  32
+------------------------------------------------------------------------------------------+
|  MAP 1280x268: plants, six suburbs, rooftop glint, cloud, dark districts                 | 268
|  [plan line ............................................] [4x2 tiles  ACK  HORN  W]      |
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
| SYNC scope | Close a unit's breaker by hand: offered on HAND days only (Q-115); O or the bay's SYNC opens it on an AGC day. | O, [ ] C U | K-12 |
| DR, BREAK GLASS, DIRECT SHED | Industrial demand response (hold D), the reserve diesel (hold E), shed a district (SHORT or SHEDDING only). | D, E | K-7 |
| Alarm tiles, ACK, HORN OFF, EXPLAIN | Eight plain-word alarms beside the plan line, each lit only when there is something to do (Q-113); EXPLAIN holds the clock and explains each. | W | K-8, Q-45, Q-46 |
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

Built: the HOT WATER SOAK and the AIR-CON CYCLE, with patience (U-1–U-4, U-6; Q-50–Q-60), SOAK THE CITY in one press (Q-111), and map life (U-8, W6). Of the rest of the city (Q-123): a region-wide VPP only on evidence that midday is dead time, and the rooftop backstop as a 14 March anniversary daily; EV delay, HOT WATER HOLD and the heat-health guard are cut (§5, Later).

### 4.6 The trip moment

- **The watch** (K-15). The first 30 grid-seconds after a trip play with the desk locked, in the physical order: inertia, battery, governors, relays (UFLS), settle. The full version, with captions, plays for the first falling trip of at least 300 MW a player sees, and for anything new (a first UFLS, a new RoCoF record); a rise plays compact, with its own strip (Q-97, W1). The slow part ends half a second after the extreme.
- **The respond card** (K-16) holds the clock. It says how deep the fall went, what caught it (naming YOUR GUARD when the player set it), the 5-minute band and the 30-minute COVER countdowns, and lights the controls that could answer. It offers no dispatch button.
- **After shedding**, each UFLS stage's districts hold the clock at their allowed restore, as the morning feeders do (D-26, W3). The first directed shed outside a contingency plays a compact watch (Q-97).

### 4.7 Verdict and share card

**The verdict (W3).** In order, readable in ≤45 s (D-25): the score and the letter, with the letter's one-line rule; three rows in words against par (lights: what went dark, why and for how long; cost; carbon); the moment (D-21); one "this really happened" card (D-24).

**The share card (W6, Y-4).** Text only, no event names, no clock times, ≤7 lines and ≤280 characters. Illustrative:

```
GRIDWATCH #3 · Wed 14 Oct · 975 A SHIFT SUPERVISOR
█▅██▅▇█▁▅▆██  low 49.41 Hz
Lights  ★ every light on
Cost    +5% vs par
Carbon  ★ level with par
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
| **W2** | The greybox check: two strangers play | Kit ready (`playtest/W2-tester-log.md`); runs when the owner can |
| **W3** | Slice 2d: grade, debrief and the respond window | Built (2026-10-16) ahead of W2 (the owner's call), `v4-core-2d.0`; see W3 below |
| **W4** | Slice 2e: the commitment desk and onboarding | Built (2026-10-16) ahead of W2 (the owner's call), still `v4-core-2d.0`; see W4 below |
| **W5** | Playtest gate 1 | After W4 |
| **W6** | Phase 4: the daily (share card, history, streak, the phone page), then telemetry | Started (2026-10-16) ahead of W5: the share card and official runs with streaks are built; see W6 below |
| **W7** | The owner's answers to the open questions (Q-111–Q-126): the desk, the line, the score's reveal, the ending, the tools, and the switch-over | Started 2026-10-20 ahead of W5's playtests, at the owner's request; see W7 below |
| **W8** | Light seasons (Q-122, Q-127) and MARG'S CHAIR's margin over par (Q-128) | Built 2026-10-21 at the owner's request ("next feature please"); see W8 below |
| **W9** | Five more anniversary dailies, two of them in winter (Q-129) | Built 2026-10-21 at the owner's request; see W9 below |
| Later | A region-wide VPP on evidence only (Q-123) | Not scheduled; Phase 5 (week mode) is cut |

The order is the owner's (Q-107), with two placements of mine: the dark-district holds (D-26) go into W3 with the respond-card work, and the commitment desk goes into W4 with the cover plates, because the plates sit on it.

### W0 — The spec rewrite (done)

`SPEC.md` rewritten to the build and the decisions; `SPEC-history.md` keeps the v4 text with Q-61–Q-91 appended; §8.2 carries the ten "?" rows slice 2c added to the game (and the game's text drops their pending flags). Still to do from Q-104: the module headers back into the code (X-49, W1).

### W1 — Slice 2c.2: quick fixes and the cheap decisions

One slice, one `SIM_VERSION` bump (H-18 changes the sim), the golden re-recorded once, `tools/daily-gen.js` re-run at the end. One browser pass by the integrator.

*Built 2026-10-16 (branch `slice-2c2`, `v4-core-2c.2`).* Every item below is in, each with its accept as a test, but X-48's worktree and branch removal (the owner's go-ahead). X-47: at 1280×600 only the solar farm's box was covered (56%, by the alarm tiles at the plan bar's right end; moving the plan bar to the map's top would have covered hydro and wind instead), so by the owner's call the plan bar stays and the farm moved to the plain south of Redgum Flats and Saltbush Bay (`render/mapdata.js`): every plant's box is now clickable. Where the build differs from the text:
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

**S-5 (amended, Q-98) — Letters from the gap in MWh-equivalents.** The score stays 1000 × par's ALL-IN ÷ yours (the chip from 21:00, Q-117; the night strip; the card). Each letter has its rank (Q-118). The letter comes from g = (your ALL-IN − par's) ÷ VCR: A for g ≤ 10 MWh, B ≤ 150, C ≤ 600, D above; F for a black grid. The card says the rule in one line, with the ranks (Q-118).
*Accept:* the same added mistake earns the same letter on a heatwave, a drought, a calm weekday and a weekend daily; `tools/par.js --allin` re-measures the competent proxy (target ≥70% A) and the lean proxy (target ≤40% A), and the result is recorded in §6.

**H-18 — No invented rules** (Q-102).
- The random hot-unit trip (H-2) is removed. Its 96% gate stays as what it is in the physics: a unit at its limit has no raise headroom above it, which the TRIP PREVIEW shows. The lever's "✕ 3.5%/h" face goes.
- The directed-shedding timers (1 minute below 49.5 Hz, 5 minutes outside the normal band, one district a minute) are tagged "GRIDWATCH's own rule" in the UNDER FREQ explainer and its §8.2 row: a stand-in for AEMO directing the networks.
- The GUARD ring gets its own "?" row and §8.2 row: the battery's contingency FCAS, set by hand.
*Accept:* no unit trips for running hot; the explainer test finds the own-rule tag; `tests/text.test.js` finds the GUARD row beside `#ring-guard`.

**D-3 (amended, pulled forward from 2e) — A 60-word briefing.** One goal line ("Keep the lights on: start power stations before the city needs them. The line above the desk says what's next."), the day and *Watch for* (≤30 words), one line on what is real (for example "The seconds are real NEM physics; the desk hands you the decisions the market and the operator make."), TAKE THE DESK. The score's formula and the keys move behind the header "?", which opens HOW TO PLAY first and WHAT IS SIMPLIFIED second. The seed line gives way to the date. (Q-110, 2026-10-16: the owner says the 60 words "don't matter really". A storm or low-wind day's line says so, which takes 10 of the 365 dailies to 61-62 words; `tests/briefing60.test.js` guarded at 65, the day and *Watch for* at 30 or fewer. Since Q-121's evening-trip line it guards at 69, the day and *Watch for* at 37 or fewer: 263 of the 446 dates are over 60.)
*Accept:* ≤60 words (a test counts them); one required click; the header "?" opens HOW TO PLAY.

**D-7 (amended) — HAND from the second shift.** A browser that has not finished a shift sees no HAND choice; from the second shift the choice shows, titled "no AGC and no auto-sync (harder)". The game keeps a shift count with its other `seen` flags.
*Accept:* with empty storage no HAND button shows; after one finished shift it does.

### W2 — The greybox check

Two people who have never played each play the live daily on their own computer, sound on, thinking aloud, with the owner silent (the gate-1 help rule: help only after 60 s stuck, and log it). Afterwards, gate 1's five questions (W5).
*Pass:* both reach the verdict, and both can say what a START button, the GUARD and the plan line do. Otherwise fix the top issue and re-check with one new person. The owner keeps a one-page log per tester; the top three issues may reorder W3 and W4.

### W3 — Slice 2d: grade, debrief and the respond window

*Built 2026-10-16 (branch `slice-2d`, `v4-core-2d.0`), before W2's playtests: the owner could not run them yet and asked for the next feature. The top three issues from W2 may still change it.* Each item below is in, with its accept as a test or a measure, except D-25's timed read-through (the owner's) and D-2 measured to the verdict (not yet run). Where the build differs from the text:
- **D-26.** One card a relay stage and one for the city desk's sheds, stage 1 first, then the city desk's. A stage whose restore would be refused never holds up the cards behind it. RESTORE closes the first district and queues the rest of its group; LEAVE goes on from the whole group. Par counts a hold at each shed restore, not one a stage: a slightly kinder pace, desk days only, so classic's par is unchanged. *Measured* (`tools/d26.mjs`, 2026-10-14: Enter at every card to the 19:19 trip, then every START the line asks for): every shed district was relit by 20:18, each card held within 2 grid-s of its allowed second. The night shift had relit them at 21:35–22:25 in the review's run.
- **S-6.** PERFECT shows after the letter, with its rule under the score.
- **S-7.** A Hard day is any day on which par sheds (UFLS or directed). The points compare par's total less its shed MWh at VCR with yours less the same, capped at 2,000. The letter is the gap, as on any day. The card says "no plan kept every light on today", and the header chip grades the same way.
- **D-20.** *Measured* (`tools/verdict.mjs`, 2026-10-14). The lights row names each cause with the sim's MWh: follower: every light on, 1002 A. Enter-only: city desk 2,334 MWh and relays 2,650 MWh, 54 D. Do-nothing: feeders gone on past 5,907, city desk 597 and relays 2,725 MWh, 30 D.
- **D-21.** The no-GUARD nadir is a guard-0 twin: `app/verdict.js` replays the day to the tick before the trip, then runs `physics.previewTrip(…, {guardMW: 0})`, 10 ms a frame after the day. It is made only when a GUARD was set at the trip; with none set, the card says the fall *was* the no-GUARD case. Par's lowest Hz and spare come from its own minutes (`app/par.js` now keeps them, and its input log). The night shift's sheds and trips are never the moment.
- **D-24.** Fact-checked against the sources on 2026-10-16 (`content/cards.js`). Loy Yang A3 lost "nearly 550 MW", and the battery gave "less than one sixtieth" of it; the source does not give the ~7 MW. Callide C's 2,300 MW came from nine units. The 14 Mar 2021 source is AEMO's report on the minimum-demand direction (71 MW curtailed), because SA Power Networks' page never names the date. The SA black system card gained its URL. Triggers, most dramatic first: black, UFLS, the battery catching 50 MW or more, 200 MWh spilled, 30 minutes below $0.
- **L-10.** Red marks an hour in which a district of the player's was dark. N-1 SHORT is left out: it turned every morning red. The chime is a rising triad ('ramp'), played once when evening demand falls below 95% of its peak with no red minute in the hour before.
- **D-20's THE NUMBERS** is a `<details>` holding the dollar table, the biggest gap, the formula and the reliability readouts.
- **Size.** The first visit is 466.2 KB gzip, up 11.3 KB (`app/verdict.js`, `content/cards.js`). `render/charts.js` loads with the end card.

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

*Built 2026-10-16 (branch `slice-2e`), before W2's playtests, at the owner's request ("next feature please"). No sim change, so `v4-core-2d.0` stands.* Each item below is in, each with its accept as a test or a measure. Where the build differs from the text:
- **K-24.** A station's START and STOP each press one machine's guard. The choice is the machine whose cover is up, else the one the line asks for, else a READY one whose scope is not open (START opens it; Q-115), else the first that can start or the last that can stop. With nothing to start, the button says why the first OFF machine can't (an outage, for example). The SET chip shows only while the line's action is a GUARD. The tie knob no longer holds the levers on an AGC day: the player's system holds the tie through the planner's tie hold (`memo.tieHoldS`) and re-dispatches around it. AGC LIMIT's GO TO is now the battery (its advice was RE-DISPATCH). The idle-lever booking of a start (`planKey` from an AGC lever) went with the live levers. *Measured:* 48 enabled controls at 04:30 on 2026-10-14 (81 before); a HAND day keeps every lever input.
- **O-8.** COACH ON / OFF sits on the plan bar beside the line it governs, not in the header: at 1280 px the header had no room (a HAND-flown night already overflowed it by 13 px). It is remembered in the settings and hidden from 21:00. Until it is pressed, coaching is on for a first shift only (D-7's count of finished shifts). In problem mode a START is named only when exactly one unit can still arrive in time; otherwise the line says "n units can still make it in time: the lit STARTs." and lights them all. Such a line carries no action but still counts as something to do now. *Measured* (`tools/follow.mjs --problem`, seeds 1–11): the coaching follower scores a median 992; the problem-mode follower a median 38, short on every day.
- **O-1, O-3.** The plates cover nine groups: START, STOP, the GUARD, the battery, the tie, RESTORE, DR, the reserve diesel and DIRECT SHED. The map and the suburb cards are not covered. A covered control's press, keys and hold answer in blue. I'VE DONE THIS BEFORE is on the plan bar on a first shift; it turns the coach and the plates off, remembered. The GUARD lamp reads "GUARD n held" (the title row fits no more); its tooltip and accessible name say "GUARD n MW held for trips".
- **O-6.** Marg's lines are tray cards from MARG, SUPERVISOR, plus the end card's closing line. Later days have 5 beats (taking the desk, midday, the evening, 21:00, the verdict). A first shift adds the first watch's settle and one line per plate lifted, at most 25. *Measured* on 2026-10-14 (Enter at every card): 6 lines on a first shift, 5 on a later one.
- **D-7 (copy).** The HAND button: "you set the MW yourself (the levers, the wheel, the stack, RE-DISPATCH), with no AGC and no auto-sync from 04:30 to 21:00 (harder)".
- **O-2** holds: a first shift's first line asks for a control and lifts its plate at once (2026-10-14: START at 04:30).

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

**O-6 — Marg, the supervisor's voice.** 31 years on the desk; dry; never blames; at most 20 words a line; at most 25 lines on a first shift and 6 on later days, at fixed beats: the briefing, the act changes, the first watch's settle, the 21:00 handover ("I've got the night. Your day is scored at four."), the verdict's closing line; plus, once per browser, three first-time lines (Q-124: the price below zero, coal at its minimum, the relays' first shed), within the same limits. Each line carries a live number or a decision.
*Accept:* a line-count test holds both limits.

**D-7 (copy).** The briefing's HAND text (from the second shift).

### W5 — Playtest gate 1

**Build:** the live daily, first-shift coaching on.
**Protocol:** 3–5 friends or family who have never played (at most one energy professional), on their own computer with sound on. The owner sends only the link and says "This is a game I'm making. Play today's day and say out loud what you're thinking." The owner watches silently (over the shoulder or by screen share; record with consent) and helps only after 60 s stuck, logging it. Five questions afterwards: 1. What was your job? 2. When the power station tripped, what caught the fall? 3. Why did you get your grade? 4. Stress 1–5 and confusion 1–5. 5. Would you play tomorrow? The owner also plays and rates stress and confusion.
**Pass (all of):** ≥4/5 finish to the verdict; ≥4/5 describe the job (lining up enough power ahead of demand, with the automatics handling the seconds); ≥3/5 name two of inertia, battery and governors; nobody is stuck over 30 s without knowing what to do; ≥3/5 explain their grade in their own words; median stress ≤3 and confusion ≤2; the owner's stress and confusion lower than for v2.
**Fail:** fix the top three issues and re-run with at least two new testers.

### W6 — Phase 4: the daily

*Started 2026-10-16 (branch `w6-daily`), ahead of W5's playtests, at the owner's request ("implement the next couple of features ... in manageable chunks"). No sim change, so `v4-core-2d.0` stands. Six chunks are in: the share card (Y-1, Y-4, Y-5, Y-7), official runs with history and streaks (Y-2, Y-3), resume (F-7), and the link on a phone (Y-8), merged as PR #19 on 2026-10-16; the practice shelf (Y-2), PR #20; then the ladder (Y-11). Each was reviewed by a small workflow (two or three reviewers and a sceptic) and its confirmed findings fixed. The rest of W6 is still to build: D-28, D-29, F-8, F-9, F-14 and Y-10. Where the build differs from the text:*
- **Y-1.** The number is in the briefing's title ("Daily #5"), not on the date line, so D-3's 60 words are unchanged. A seed that is not its date's listed attempt has no number; its card names the seed.
- **Y-4.** `app/share.js` builds the card; `lintCard` rejects clock times, event and time-of-day words, district ids and characters outside ASCII, the blocks, ★ and ·. The rows: *Lights* is the MWh of yours dark against par's ("★ every light on"); *Cost* is supply c/kWh against par's, in per cent, with ★ at par or better (within 0.5% is level); *Carbon* is t/MWh, the same way. The head's score is the points, the letter and its rank (Q-118: "975 A SHIFT SUPERVISOR"). PERFECT follows the letter. A block the day never reached (a black day) is a middle dot. A card over 280 characters drops its closing line first, then its last tags.
- **Tags.** The coach tag marks the exception. A first shift coaches unless switched off, and since W4 a later shift is off unless switched on, so the card says NO COACH only on a first shift with the coach off, and COACHED on a later shift with it on (O-8's text had NO COACH on every later card, where it says nothing). HARD DAY is added (S-7). OFFICIAL is on the verdict, not the card: a card without PRACTICE is the official run.
- **Y-5.** SHARE copies through the clipboard, else a hidden textarea and `execCommand('copy')`; the button then reads COPIED. If both are blocked, the card's text is selected and a toast says to press Ctrl+C. The card shows on the end card as YOUR CARD, exactly as it will paste, after the verdict (D-25).
- **Y-7.** 51 lines in `content/closing.js`, three per bucket: lights (on: no darker than par; dark) × cost (under; over) × the lowest Hz's band (calm: normal band; wobble: containment; deep: above 49.0 Hz; relays: below it), plus black. Marg's closing line on the verdict ends with the same line (O-6), so the card quotes her. Each line is at most 40 characters and passes the lint.
- **Y-7 (review).** 58 lines: the 16 buckets, plus `held` (streets of yours dark but no more than par's: a Hard day), `solo.on`/`solo.dark` (par could not finish: no cost claim, no ★) and black. A line states the outcome, never its cause, and never blames.
- **Y-2 (Q-99).** `app/history.js`. A run is FIRST SHIFT (practice unless COUNT THIS ONE at the end), OFFICIAL (today's daily with no entry: an entry marked DNF is written at 09:00 and filled in at the day's end) or PRACTICE (a past date, a seed off the calendar, or today once its run is in). The briefing title carries the tag ("Daily #5 · OFFICIAL", the reason as its title); the end card says why; the share card carries PRACTICE. The stored history is read again before every status and every write, and each entry carries its run's id, so of two tabs on the same daily only the first past 09:00 counts; the other turns PRACTICE and writes nothing. The local date is read again at each new day (a tab left open past midnight plays yesterday's daily as practice). With storage blocked every run is PRACTICE and says so, with no COUNT THIS ONE. START OVER (F-7) abandons a run: an official one that passed 09:00 stays a DNF.
- **Y-3.** One entry per date under `gridwatch:v4:history` (`{v: 1, days, pruned}`, at most 400 dates, but never cutting the current streak; `pruned` counts finished runs that went, for "dailies played"). STREAK: finished official runs on consecutive dates, to today or yesterday; ★ STREAK (the spec's BEST): the same, at par or better. With storage blocked the game plays and the end card says "History off". A run whose day ends before par finishes keeps no grade: par finishes long before a normal day ends, and a black day is graded F at once, so this is left. (F-8: a listed daily is now graded at the day's end from its stored par, so its run always keeps its grade.)
- **F-7.** A save is the player's actions, not the state: each desk input with the feeder card it answered, each RE-DISPATCH, the cards' answers (dismiss, LEAVE, skip) and TAKE THE DESK, each at its tick, plus what frames alone keep (the plates still covered, Marg's day, the K-12 offers, the coach) and the state's hash. It is written at TAKE THE DESK, at each action, every 15 grid minutes and when the tab is hidden or closed, in one of two slots under `gridwatch:v4:resume:` (`daily` for today's official run or first shift, `practice` for the rest, so practice never overwrites today's run); a write that fails drops the slot rather than leave an older save. Reopened on the same seed, the briefing offers RESUME AT hh:mm or START OVER. RESUME replays the actions through the game's own functions with the system and the queued restores running as in play, 250 ms a frame with its progress on the button, so the system's plans and the director's memory of cards and feeders come back by themselves; at the saved tick the hash must match (else a fresh day, said so), and the desk opens there, held, with a new lease on the run (an older copy still open in another tab then finds the date's entry not its own and turns practice). A run saved on another date resumes as practice; a save from another `SIM_VERSION` is dropped with a message (history and streak kept); the day's end clears the save. *Measured* (2026-10-16, Node): a save is about 0.5 KB (the first build saved the whole input log: 429 KB by a quiet day's end, nearly all the system's plans); a resume at 12:00 takes 0.8 s, at 20:30 1.9 s, at 23:54 2.3 s. Not kept: the annunciator's acknowledgements (alarms already acknowledged sound again). A second review fixed: a resumed run's save keeps the whole day's actions (it resumes again); while a save is offered every desk input is refused, and RESUME replays from a clean day; no frame ticks while a replay runs (Space cannot run the clock between its slices); an older tab cannot overwrite the resumed run's save, and a run's old slot goes when it is saved anew.
- **Y-2, the practice shelf.** `app/shelf.js`. MORE DAYS on the end card, and on a practice day's briefing (not a first visit's, nor with history off: D-3's one click), opens the shelf: today's daily when another day is on the desk, the 14 past dailies before today back to #1 with this browser's official results, and the Hard days. A pick plays in the page (C-3, `game.switchDay`), the address kept in step (`?date=` or `?seed=`, so a reload or a resume finds the day). **The Hard days** are attempt 0 of each date the daily gate rejected (`content/dailies.js` lists a date's accepted attempt k; attempts 0..k-1 were rejected), one a date, numbered by date: 17 today. *Measured* once (2026-10-16, `v4-core-2d.0`): par sheds 116-1,741 MWh on every one. A Hard day is named ("Hard day 1 · PRACTICE"; "GRIDWATCH · Hard day 1" on the card), never "not gate-checked", and graded on par's outage-free part (S-7). D-29's SA 2016 Hard day needs its own scenario and is not built.
- **Y-11, the ladder (Q-108).** `tools/ladder.mjs` writes `content/ladder.js`: for every daily (the dailies' from..to), par's ALL-IN total and shed MWh, and the ALL-IN totals of GRIDWATCH's own players: *did nothing* is the page's day with no input at all (`app/game.js` headless: the system dispatches, nobody starts a unit or answers a card; the sim-only doNothing proxy blacks out, which no page player can), and the *lean* and *competent* scripts (`sim/autopilot.js`). The page grades the totals as it grades the player (`app/game.js` ladderFor), so a change to the grading needs no new list. By the owner's Q-108 the end card shows did nothing, the better of the two scripts as "a scripted shift", par and YOU, lowest first, under the score ("On today's ladder: did nothing 26 · a scripted shift 975 · YOU 990 · par 1000 (GRIDWATCH's own scripted players)"), on a daily only: the review found the competent script below lean on 134 of 365 dailies, and below 300 on 40 (it collapses into the relays), so a row named "competent" would say something false. The list carries the dailies' build stamp; `tests/ladder.test.js` fails when it is stale or a date is missing, and replays the first daily's no-input day to 14:00 against the list's stored state hash (changes to the page's dispatch that leave the stamp alone; to 14:00, not the whole day, for CLAUDE.md's 2.5 s a test). Generating it takes about 15 minutes on 6 workers, once per `SIM_VERSION`, after `tools/daily-gen.js`.
- **D-28, the week ahead (Q-109).** `app/week.js`. Every end card, after YOUR CARD, shows THE WEEK AHEAD: the next seven dailies from the date the day ends on, a word a day ("THE WEEK AHEAD Sat mild · Sun storm · Mon HEATWAVE · …"; the words are HEATWAVE, storm, low wind (the stack's LOW WIND: wind toward 12% of capacity, not none), hot, mild; each day held to its word, so a line breaks only between days). Each word is the regime that day's own seed draws first (`prerollRegime`; `app/week.js` outlookWord), so the day plays it and its briefing says the same word: "heatwave this afternoon", hot, mild, and by the owner's Q-110 "Storms likely later." or "Low wind likely later." (`app/shell.js` dayPlan and LATER: no time, which the warning gives hours before it comes, on the day). So a first-timer's briefing knows what a returning player read on yesterday's card. The row's title says it is an outlook, as a 7-day forecast is. The desk's day-ahead forecast still shows typical wind until the warning, as before. Only this build's gate-checked dailies are shown: none past the calendar's end, and none with a stale list (the seeds may change). It shows on practice and Hard days too, because it is about the dailies to come, not the day played. It is not on the share card.
- **F-8, the stored par (risk 5).** The stored par is the ladder's (Y-11): `content/ladder.js` keeps par's ALL-IN total and shed MWh for every daily, made by `tools/ladder.mjs` with the same `AP.runPar` the page re-runs, under this build's stamp. It is not a second list in `content/dailies.js`, so there are not two lists to keep in step. `app/game.js` storedPar: a listed daily is graded the moment its day ends, from the stored par, so the grade, the share card, the history entry and the ladder's YOU are the same in every browser, and a run always keeps its grade. The page's own par only fills THE NUMBERS, the debrief and the share card (whose buckets compare your parts with par's). While it still computes at the day's end (a late resume whose cached par was another day's), the card shows the score and "PAR: computing… N%. Your card and par's numbers follow." in YOUR CARD's place, and Marg's closing line waits for the card, so the card still quotes her (Y-7; the review found her latching a line before it). If its total is a dollar or more off the stored one (another engine's arithmetic), THE NUMBERS says so ("This browser worked par out +$N from the stored par. Your score uses the stored one…"); it never changes the grade. Off the calendar, on a Hard day or with a stale list, the page's par grades, as before. *Measured* (2026-10-16): the page's par, sliced as in play, matched the stored total to the dollar on 2026-10-16, 2026-11-12 and 2027-03-01; `tests/score.test.js` checks the slices play the one run's day, and `tests/ladder.test.js` that the list is this build's. Past the calendar's end, today's date has no daily (`app/game.js` noDaily, from the calendar's `to`, not the stamp): the briefing title is "No daily today · PRACTICE" (with history off too), nothing counts (`app/history.js` why 'nodaily'), and no card or title carries a daily number past the end (`dailyNumber`). The Action runs `tools/calendar-left.mjs` on every push: it prints the days of dailies left, and a GitHub warning below 60. Not done: the shelf on a no-daily day (it is about a year away: the calendar ends 2027-10-11).
- **D-29, anniversary dailies (Q-103).** `content/anniversaries.js`: 14 Dec (Loy Yang A3, 2017), 13 Feb (the Moorabool towers, 2024) and 25 May (Callide C, 2021) play a labelled variant of their desk scenario (`desk-loyyang`, `desk-weekend-towers`, `desk-callide`, named by `content/dailies.js` dailyScenarioIdOf), shaped through a `dayplan.incident` block no other day has, so `SIM_VERSION`, the stamp and every other date stand. Loy Yang: the largest unit trips before dawn with the night shift's GUARD armed (credited to the night shift, not the player). The towers: a storm with a tie derate and a unit loss. Callide: a second trip five minutes after the evening one (at one minute par fell into the relays on all six attempts). The briefing opens with ON THIS DAY (a sourced account, the day's echo, a source link; TAKE THE DESK stays the one click); the title names the day; the share card is tagged ANNIVERSARY. Each passed D-9 at attempt 0 (`tools/daily-gen.js --dates`); its ladder row, F-8's par, is held to the variant hash it was made from. 14 Dec's heatwave Hard day is gone, so there are 16 Hard days and those after it renumber. Full record: `SPEC-history.md` Appendix D.
- **F-9, version coherence.** `app/build.js` BUILD (the release's date) is bumped by hand at release, into `version.json` and eight carrier modules (copies, not re-exports: a re-export of the loaded file would always agree). A mixed page at boot, or a load that cannot link, shows "GRIDWATCH was updated — refresh to continue" and never starts the game. The on-demand modules come through `late()` (UPDATED in a note, refetched); the end card and its charts load at boot (`early()`). While playing, `version.json` (no-store) is checked when the tab comes back; a newer build shows "GRIDWATCH was updated: refresh before your next shift." Never a reload; the files are refetched past the cache first, so the player's refresh gets one release. `tests/version.test.js`. Full record: Appendix D.
- **Risk 5, `?selftest`.** next.html?selftest (routed before the landing check, so a phone can run it) replays five golden runs and compares with Node: par's whole day on two dailies (the hash each hour, and its ALL-IN against F-8's stored par), the page's no-input day to 14:00, and two scripted input logs to checkpoints. Each row says PASS or FAIL (a FAIL names the hour the hashes split), with the browser, `SIM_VERSION`, the stamp and a line to COPY. Goldens come from `tools/selftest-gen.mjs` (stamped; run it after `tools/ladder.mjs`). *Measured* (2026-10-17): PASS 5/5 in Chrome 152 in 10.1 s. Edge and Firefox are the owner's release checks (`playtest/release-checks.md` R-4).
- **Y-6, save the moment.** SAVE IMAGE on THE MOMENT downloads a 1200×630 PNG (`app/momentimage.js`, on demand): the trace with its low, the NO GUARD and PAR lines, what caught it (spin, YOUR GUARD, droop response), the number, date, tags and score, the closing line and the link, with no clock time (the share card's lint). It waits for the no-GUARD twin ("SAVE IMAGE (computing…)"). The integrator drew it in Chrome on 14 Dec: clean.
- **G-4 and U-8, weather and life on the map.** `render/map.js` draws the day's weather from the public obs only: a storm's wall in the west before it arrives, its shelf and dark band crossing west to east from the warned arrival, with rain and lightning; heat's bleached cast; a front's cloud shadows suburb by suburb; turbines turning with the wind and stopped in a cut-out; windows and streetlights that go dark with their district; condensers running on hot days. Reduced motion keeps the look and stops the motion. The integrator's browser pass (13 Feb, 18:33) replaced two ruled seams in the stormy sky with one frayed, leaning front. `tests/map-life.test.js`.
- **Y-8 review, a small window on a computer.** Found writing the gate-2 kit: a 1920×1080 laptop at 150% is 587 px high maximised, and got the phone's page. A device with a fine pointer whose screen is at least 600 px on its short side now gets its own page below the floor: "This window is 1280 by 587: 13 px too short for the desk (1280 by 600).", the way to fit (FULL SCREEN only where Esc stays the game's, Chrome and Edge; F11; zoom out), PLAY ANYWAY, and the game starts by itself once the window fits (checked in the browser). A phone, or a tablet with a pen or a trackpad, keeps the phone's page.
- **Gate 2 kit.** `playtest/gate2-README.md` (the protocol: 3-5 testers, at least 2 new, booked without a link for 30 minutes, invited with the owner's own card, watched in silence, a neutral day-2 message, how each of the six checks is scored), `gate2-tester-log.md`, `gate2-invite.md`, `gate2-results.md`, and `playtest/release-checks.md` (R-1 to R-5: the card in two apps, the link preview, the phone page, `?selftest` in three browsers, a year of dailies). One preview rule serves gate 2's check 4 and R-2: the description counts only where an app shows descriptions (put to the owner). `tests/gate2-kit.test.js` holds the kit to the game's words. *Measured:* 360 days of dailies left on 2026-10-16; the release list asks for 365.
- **SA 2016, the practice shelf's first Hard day (D-29).** A storm day of its own scenario: at 17:30 the storm's cut-out takes most of the wind and, 10 grid seconds later, the tie trips with no warning. Par sheds 359 MWh and falls to 48.91 Hz but never goes black, so the day is graded on par's outage-free part (S-7). Its briefing opens with THIS REALLY HAPPENED (not ON THIS DAY: it is played on any date): AEMO's account of 28 Sep 2016 and a line on where the desk differs ("Here a storm's cut-out replaces the protection, and your relays have time to shed."). The review found the day beatable with one tie move, so a Hard day's words now say "par sheds" rather than "no plan keeps every light on". Full record: `SPEC-history.md` Appendix D.
- **D-24, five more THIS REALLY HAPPENED cards.** Before, par's day showed the battery card on 27 of 30 dailies whatever kind of day it was. `content/cards.js` now has ten cards, each fact-checked against its source: a shed ordered by the city desk (SA, 8 Feb 2017), the tie tripping (SA islanded, 12-19 Nov 2022), the reserve diesel called (NSW RERT, 27 Nov 2024), a heatwave (SA and Victoria, 24 Jan 2019) and a wind drought (13 Jun 2024). `app/verdict.js` historyCard shows the first that fired, from the player's day only, in this order: black, relays, city-desk shed, tie, diesel, heat, drought, battery, backstop, negative price.
- **K-22, K-23: accessibility.** The page: AGC and HAND are a radio pair you can pick by keyboard (Enter on the one picked still takes the desk); the end card and the shelf take the focus and give it back; one rate-limited live region says the line's ask, the RESPOND card and the score (5 messages in 84 s on a quiet morning, where #objective said about 290 words a minute); blue toasts are polite and red ones assertive; the "?" popover has a name and takes the focus from the keyboard; --faint text and URGENT meet 4.5:1. The desk: above the 1280×600 floor the whole desk scales with the window (1.07× at 1366×768, 1.5× at 1920×1080), and at the floor nothing is under 8 px; the hour strip has glyphs as well as colours; the Live Stack's "L" has a name; the alarm panel's quiet tiles meet contrast. The integrator checked in the browser at 1920×1080 and 1280×600: no clipped text, no page scroll, every desk button hit-tests to itself.
- **X-48, hygiene.** What the audit proved dead is gone (an unused shake-time copy, an unused sky colour, two resume re-exports, an unused variable and four unused imports, three README references to code that no longer exists). Kept as the owner's call: the bench page, exports only tests use, merged branches. `tests/lib/dom.js`: a failed assert on a stand-in element now prints the element, not the whole page (assert walked the parent links and ran out of memory after 152 s).
- **Realism ledger (2026-10-17).** §8 after the source audit: §8.1 has 24 new sourced rows and 4 amended; §8.2 has two new rows (the cooling slope; the reserve diesel's terms) with their help texts; §8.3 is down from 27 items to 9, each saying what was searched; the help texts and the params' notes follow. No number changed (Q11); the numbers the owner may want changed are listed in Appendix D.
- **The calendar to 31 Dec 2027.** `tools/daily-gen.js` re-gated 2026-10-12 for 446 days (no existing date changed; 7 new exceptions, so 7 more Hard days at the shelf's end) and `tools/ladder.mjs` made the 81 new dates' rows: 441 days of dailies from 16 Oct 2026, past §11's 365.
- **Q-40, the test budget (REVIEW-2026-10-14 opportunity 16).** `tools/slow-tests.mjs` (`npm run test:slow`; in CI after `node --test`, warnings only) times each test file alone against CLAUDE.md's 6 s a file and 2.5 s a test. The budgets are scaled by the CPU yardstick's fastest reading (before the run, after it and before each re-time), and anything over the budget as written is still named. The play driver gained `skipTo`: the sim without 60-fps virtual frames at about 0.6x a jump's cost, with the annunciator, the tray, the offers, Marg and the page clock as the page keeps them. Over five whole days it matched page jumps: the same holds, hashes and tiles, and the clock within 0.1 s. It also gained `realJump` (real seconds sampled), and `tripFrom` skips. The slowest tests sample instead of stream, and a whole day's play sits in a before() hook. Four files were split with every test kept, and K-16 is again checked where a stray close would land.
- **Y-8.** next.html's one script is now `app/start.js`. Below 1280×600, or with a touch-only pointer, it shows `app/landing.js` (the pitch, the preview image, "GRIDWATCH is played on a computer...", COPY LINK) and never loads the game; a small window with a mouse also gets PLAY ANYWAY, and `?play` skips the page. `og.png` (1200×630) is drawn by `tools/og-image.mjs` with no browser (a pixel font, the watch's fall and catch, the sparkline). next.html and index.html carry `og:` and `twitter:` tags with the image's absolute URL on the canonical host, and an inline SVG favicon. The unfurl in messaging apps and COPY LINK on a real phone are the owner's manual checks.

Requirement text for each Y- and F- item is in `SPEC-history.md` Phase 4, amended as below.
- **Y-1 — Date and number.** The local calendar date; puzzle #1 is 2026-10-12 (`content/dailies.js` `from`). Seeds follow Q-75 (`YYYYMMDD + k·10⁸`), a recorded deviation from Y-1's hash.
- **Y-2 (amended, Q-99) — Official runs.** The first daily a browser ever plays is practice unless the player claims it at the end ("Count this one?"). From then on, the first run of a date that passes 09:00 is official; later runs are PRACTICE. The verdict and the share card carry the tag (FIRST SHIFT, OFFICIAL, PRACTICE). The practice shelf holds past dates and the labelled Hard days.
- **Y-3 — History and streak.** One entry per date; STREAK counts consecutive dates played; BEST counts consecutive dates at par or better. With storage blocked the game plays and says "history off".
- **Y-4 (amended for Q-48 and Q-98) — The share card** (§4.7): the number, the date, the score, letter and rank (★ at par or better; the rank since Q-118), the sparkline and the lowest Hz, three rows against par, the closing line, the link. Tags: FIRST SHIFT, PRACTICE, HAND-FLOWN, NO COACH, GLASS BROKEN. A lint rejects event words and HH:MM times.
- **Y-5 — Copy** with a visible "Copied", and a fallback.
- **Y-7 — Closing lines:** at least 40 dry lines keyed by outcome, the pick seeded by date and outcome.
- **Y-8 — The link on a phone:** a landing page below the C-9 viewport or on a touch-only pointer (the pitch, a preview image, COPY LINK); `og:` tags, a 1200×630 image of the watch's trace, a favicon.
- **Y-11 — A ladder of other shifts.** For every date, `tools/daily-gen.js` stores the points of GRIDWATCH's own players (did nothing, the lean and competent proxies, par = 1000), and the verdict shows where you sit among them, labelled as synthetic. It answers "is 975 good?" and gives telemetry (Y-10) something to stand beside.
- **D-28 — The week ahead** (Q-103; Q-109 put it on the end card, not the briefing: see the W6 record above). The briefing shows the coming week's day types ("This week: Tue mild · Wed storm · Thu HEATWAVE"), computed from each date's seed (`sim/dayplan.js` `prerollRegime` reads only the seed).
- **D-29 — Anniversary dailies** (Q-103). On the dates of real NEM incidents the daily is a labelled scenario variant shaped by the incident (Callide C, 25 May 2021: a double unit trip; the Victorian transmission towers, 13 Feb 2024: a tie derate and a unit loss; Loy Yang A3, 14 Dec 2017), gated by D-9 like any daily, with a one-card account before the briefing. The SA black system (28 Sep 2016), which no plan survives, is the practice shelf's first Hard day.
- **F-7 — Persistence and resume; F-8 (amended) — par's end total stored per date** in `content/dailies.js`, so the grade is the same for everyone by construction (risk 5); **F-9 — version coherence; F-14 — the root page becomes the daily itself.**
- **Y-10 — Telemetry** (Q-105), after Y-4 and Y-11: an anonymous record per day played (seed, version, inputs, score, a random browser id; an opt-out in SETTINGS; a one-line notice), so the owner can replay any stranger's day and the verdict can show a real histogram. It needs C-1's exception and an endpoint, decided when it is built.
- **Gate 2** (`SPEC-history.md`, Playtest gate 2): ≥4/5 finish; ≥3/5 share unprompted; ≥2/5 play the next day; the card and the link unfurl correctly in each tester's app; ≥3/5 retell their moment; no spoiler complaints.

**Cut list** (in this order if W6 runs long): Y-6 PNG card, D-23 replay scrub, D-22 counterfactual, G-4 weather art beyond a tint, U-8 map life, K-20 foley beyond the hum and the breaker clack, P-10 battery P&L, Y-9 seasons (the labelled late-summer day stays).
**Never cut:** H-8 (one physics engine), K-15/K-16 (watch, then respond), S-4 and D-9 (par and solvable days), K-13 (RESTORE), the P-1–P-4 belly.

### W7 — The owner's answers (Q-111–Q-126)

*Started 2026-10-20 (integration branch `w7-decisions`), ahead of W5's playtests. The owner said "I know it's still waiting for a review but can we move on to the next features please" about the open-questions brief, and then took its recommendations. Built in two waves of parallel builders, each branch reviewed through two lenses (the code, and the player) with a fixer checking every finding. The integrator does the switch-over last. Records follow as each item lands.*
- **Q-111, one SOAK THE CITY booking.** The line asks once for the city's hot-water soak ("The battery cannot take all of noon's spill. Book the city's HOT WATER SOAK, 11:00–15:00 (480 MW): tanks take the rest; tonight's heating falls by as much."). With some suburbs booked it asks for "the HOT WATER SOAK in the other n suburbs", and for the last free suburb by name (`app/objective.js` soak; action `{type: 'soakCity', lever, atS, suburbs}`). The spill excess no longer sizes the ask: asked one suburb at a time, the line booked all six within 14 grid minutes anyway. The press is on the suburb card, where the line's "◇ SUBURB (H)" already leads: THE CITY +480 MW 11:00–15:00 [SOAK THE CITY] (`city-soak-all`) is the first soak row, so H opens the line's first suburb with it focused and Enter books. It shows while two or more suburbs are free and books at the open suburb's aim (◀ ▶ move both). BOOK and CANCEL per suburb stay, for trimming. `app/game.js` soakCity gives each free suburb the sim's own flex input and re-dispatches once. The press is one action: one F-7 save entry (`'c'`, replayed through soakCity) and one count in the end card's inputs (X-45), so D-10's decision count counts presses. Realism: a distributor's ripple-control signal switches every receiver on its channel at once (the soak's help text). *Measured* (`tools/follow.mjs`, once): the followed day's presses fell from 24 to 19 on 2026-10-14 (ALL-IN and points unchanged) and from 20 to 15 on the cloud-front daily 2026-10-30. There a CANCEL of two suburbs at 08:00 was accepted, the line asked again at 08:31 for "the other 2 suburbs" (noon's spill still beyond the battery), and rebooking or not moved ALL-IN by under $3,000: on that front a trim is a free choice, not a saving. Par (sim-only) still books one suburb per decision. The MSL notice's soak advice says "book the city's" as the line asks (`app/tray.js`), and D-1's audit (`tests/acts-audit.test.js`) finds `actions.soakCity` only on the suburb card.
- **Q-112, TRIP SHEDS.** The sim keeps its four levels. `desk/calc.js` (tripSheds, n1Word, shedDistricts, shedsLine) calls TIGHT TRIP SHEDS when the sim's TRIP PREVIEW is below the first UFLS stage (49.0 Hz): the spare is there, but frequency would fall faster than it arrives. The gauge's head reads ▼ TRIP SHEDS in red, and the caught line says what the next trip would cost ("48.98 Hz: the relays would shed 2 districts"); its title and label say it whole ("would fall to 48.98 Hz: …"). The districts are counted by the sim's own relays: `app/game.js` shedsOf runs a TRIP PREVIEW of the risk the cached preview names, once a grid second with the state restored, and reads which stages operate (a stage stays spent while any of its districts is dark). Counting every threshold the nadir crossed said one stage too many after every evening trip, because the relays wait 0.3 s while the fall overshoots (2026-10-19 19:16: "would shed 6", the run shed 4). Below 49.0 Hz the preview's figures round down, so the word and the figure never disagree. The word holds by time, not by Hz: it shows at once and stays until the preview has not said it for 1.5 real s, and a TIGHT after it stays 1.5 real s too; SECURE, SHORT, SHEDDING and a new day show at once; held over a preview back at or above 49.0 Hz the line says "above the relays now". (At the edge the cached preview lands either side from one refresh to the next, so a hold inside a Hz band let go within frames.) The RESPOND card says "N-1 TRIP SHEDS: enough spare, but too slow to catch the next trip. Frequency would fall to 48.97 Hz: the relays would shed 2 districts." `app/record.js` keeps the sim's four levels. The line's GUARD ask says it in the gauge's words ("…would fall to 48.97 Hz: the relays would shed districts."), reading the word as the gauge holds it (`app/game.js` n1Frame), and TRIP SHEDS coming or going makes the line again at once (integration review: kept for its figure by `steady()`, the ask said "49.22 Hz: too low to be secure" beside TRIP SHEDS from 07:15 to past 07:19 on 2026-10-19's no-input day, its figure read at 06:54). *Measured* (`tools/board.mjs`, dailies 2026-10-14, -16, -19, 04:30-21:00): the raw word holds 20, 7 and 10 minutes on a followed day and 62, 16 and 67 with no input; with the hold, spells or gaps under 1 real s fell from 19, 2 and 6 (followed) and 69, 30 and 62 (no input) to none, and the count matched the preview's own run in all 4 multi-stage minutes. Where the build differs from the brief: the face drops "would fall to" (the gauge holds 45 characters), and the minimum display time is a time on and off.
- **Q-113, a quiet alarm board.** `app/alarms.js` has eight tiles in plain words, each asking for an action (EEMUA 191), so a dark board is the north star's quiet peak. N-1 INSECURE is now LIGHTS AT RISK: it lights only while the gauge's word is red (SHORT, SHEDDING or TRIP SHEDS), 10 grid-s on, and clears 5 grid-min after (before: any level short of SECURE, cleared after 30 min SECURE). TIGHT and a near miss (a trip that would breach 49.5 Hz but shed nothing) stay on the gauge. Reworded: LOW FREQ, HIGH FREQ, TIE TRIP, RELAYS SHED, UNITS AT LIMIT, LOW STORAGE; UNIT TRIP kept. Retired, each because it lit with no action to ask for: PEAK; HIGH RoCoF (lit only inside a trip's watch; the dial's CHANGE marks it); MIN GEN (the dispatch spills by itself; the Live Stack's SURPLUS, the line and the MSL cards carry it); WEATHER (its warning card carries it). Each tile's note (`desk/annunciator.js`) and explainer (`content/alarmhelp.js`) names its action. The board is 4 × 2 with 78-px tiles at the floor, every label within two 8.5-px lines (`tests/a11y-desk.test.js`). *Measured* (`tools/board.mjs`, three dailies, 990 grid-min each, an operator who acknowledges 3 real s after each sound): some tile was lit on followed days for 820, 990 and 976 min before and 55, 115 and 55 after; with no input, 990 before and 306-368 after. Audible alarms on followed days fell from 7, 5 and 7 to 4, 2 and 3. The followed peak was lit all 210 min; now 27, 73 and 16: dark until the evening trip, lit after it until the spare covers again. The BALANCE bar, where UNITS AT LIMIT's GO TO lands, flags it as "! AT LIMIT"; the auto-curtailment help says why the spill has no alarm (the dispatch keeps the grid safe by itself, so shrinking the spill is a saving, not an emergency).
- **Q-114, prices in "? IF PRESSED".** Only the consider line (C-10) prices. A STOP of a unit at its floor that opens no shortfall adds the line's quote ("Saves about $43,000, carbon included, if nothing trips first."; `stopQuote`, shared with the STOP line). Above its floor a STOP shows no figure (the quote prices the minimum MW: in review CCGT 1 at 612 MW was quoted $72,000 for a stop that cost $16,104), and a STOP that opens a shortfall keeps its MW words. Turning the GUARD ring down, by mouse or keys, says both sides (`guardConsequence`; `app/game.js` guardReach): "GUARD 400 → 200 MW: the battery could replace up to about $27,000 more gas and carbon by 21:00. A COAL 1 trip would then shed about 330 MW: $1.7M per 10 minutes dark." The gain is what the freed inverter MW could discharge from 16:30 until the night shift takes the GUARD at 21:00, limited by the charge above reserve and valued at the marginal gas offer plus its carbon; the risk is the TRIP PREVIEW of the largest loss at the new GUARD, the relays' MW at the VCR for 10 minutes. With nothing more shed the line says where the trip would bottom, and below 49.11 Hz (`RELAY_NEAR_HZ`: the first stage plus the preview's worst measured error) "close to the relays", never "no relays". It shows under "? IF PRESSED" while the ring turns and under "✓ GUARD SET" once sent, made every frame. Once the GUARD stands at the move, the risk side says what the N-1 gauge says, at the gauge's figure: the relays shed under TRIP SHEDS, never under TIGHT or SECURE (integration review: made on the line's cadence from its own run of a preview that swings ±0.1 Hz about 49.0, it said "no relays" beside TRIP SHEDS); the long forms shorten to fit the line's 170 characters (`LINE_MAX_CHARS`), and the short forms take at most 160. No price shows while the line itself asks for that GUARD. The live region speaks a price only as made, once a move, in a rate-limited slot of its own. *Measured:* on the followed 2026-10-14 at 17:30 and 19:00, a GUARD of 0 sheds nothing (the trip bottoms at 49.23-49.50 Hz) and the price says it frees $38,000-$79,000, so on a followed day the price says turning down pays; the shed side, the owner's gamble, shows only on an evening thinner than the follower's.
- **Q-115, RESTORE and the SYNC scope.** `app/director.js`. After the player's own restore close, FOCUS (1x) holds until frequency is back in the normal band, read as the sim reads it for a contingency (`backInBandTick`: a whole grid second within 49.85-50.15 Hz), at least 2 grid s and at most 6 (`RESTORE_FOCUS_S`, `RESTORE_FOCUS_MAX_S`), found tick by tick so a resume finds the same end. Then a CITY DESK card in the tray, its button TO THE DIAL: "Cold load picked up: 232 MW, back in band in 3 s." (the MW from the sim's restore record), or "…still out of band after 6 s." / "…frequency stayed in band." The card joins the tray by K-9's rule (past three cards an older one goes to the LOG, information cards first, never the new one; before, a full tray of warnings sent the new card itself to the LOG). A trip during it ends the FOCUS with no card; queued closes, the night shift's and par's restores never focus. The K-12 offer is a HAND day's only (`G.offerWhy`): on an AGC day the auto-synchroniser closes the breaker, and O, the bay's SYNC and the station's START still open the scope of a unit waiting at full speed. On an AGC desk START now ranks a READY machine whose scope is not open above starting another (`desk/levers.js` forStart); once that scope is open, the next START goes on to the other machine, so a second start is never blocked. An F-7 resume puts back each saved offer's 30× window, and only those (a page frame during the replay could offer a unit play never offered; that bug predates W7). *Measured* (the play driver): morning hand-backs were back in band 0.9-5.0 grid s after the close (11 of 11); evening closes after a shed took 0.2-17 s (36% within 6), so on a shed evening the recovery is mostly told, not shown (on 2026-10-23, 7 of 9 ended at the cap; a 10-s cap tried once showed 4 more cross back, for 24 more real seconds at 1x). The cap stays 6 s. On 22-24 Oct, AGC, played to 21:00 following the line, the offers had cost 16.0, 7.9 and 24.0 real s and now cost none; the restore FOCUSes lasted 3.0-6.0 real s (2.0 before). Where the build differs from the brief: the caption is a tray card, not a toast (the toast answers presses).
- **Q-116, one answer to "when is this unit on".** `sim/onat.js` (pure, params only, linted): `onInS` (when a unit on its way is at minimum load: the auto-synchroniser's wait in AGC only, none for a unit on the player's synchroscope), `startFromS` (when an off or tripped unit could START: lockout, a minimum down time, its return from an outage), `startToMinS` and `syncWaitS`. Its readers: the plan's executor (`sim/grid.js`), `observe()`, par and the system's commitment search (`sim/autopilot.js`), the line (`app/objective.js`) and the Live Stack (`app/planview.js`, `render/livestack.js`). Four copies keep their own rules, named in place: `grid.js` startFreeAt (it knows why a unit is down); rule 8's adequacy walk (no minimum down time: unifying it would move par); the system's dispatch for a starting unit (`sim/autopilot.js` onFromNow and stopRuns count the auto-sync wait in HAND too: unifying it moved every HAND day with a START under the same `SIM_VERSION`, and a HAND shift saved by the live build then failed its F-7 replay, so the review put the old rule back); and `sim/market.js`'s P-5 offer stack (unifying it would move HAND prices). The three checks of what is short ahead stay separate and are named: the line's, the Live Stack's and par's. In HAND at 04:30 on the 2026-10-14 daily, the line, the Live Stack's ghost and its CCGT tip now all say 45 minutes for CCGT 2 (before, the stack said 49: it counted an auto-synchroniser HAND does not have; `tests/onat.test.js`). `tests/hand-guard.test.js` plays that daily in HAND on the page's path (START CCGT 2 at 04:30, a clean close by hand) to 09:00 against main's hourly hashes: no guard played a HAND day before. *Measured:* no sim change. The verify run (Q-125) matched every daily's par, the scripted players on 62 dailies and the selftest hashes; the classic golden's quick check matched; a HAND save made by main resumes on this build. `v4-core-2d.0` stands.
- **Q-117, the score's reveal.** `app/shell.js` drawAllIn and scoreShown. Before 21:00 nothing ranks the day against par. The header's SCORE chip keeps its place from TAKE THE DESK, its key over FROM 21:00 in grey (`#chip-allin.later`), its title and accessible name saying the score shows from 21:00 and moves with the night's totals until 04:00. With no par it reads ALL-IN FROM 21:00: one rule on every day. The number appears on the night shift's first frame (on a day with no night shift, at 21:00) or as soon as the day is over (a black day at once), and from then on it is Q-48's chip, redrawn with the night strip, so the two always agree. A resume past 21:00 shows it on its first frame. The chip is "SCORE 1000" wide all day, so nothing in the header moves at 21:00. The live region, the coach line, the plan bar and Marg never carried a running score. Where the build differs from the brief: the chip does not count up from zero, because a number shown must be true; it shows the night strip's running score. With no par the chip has its own width from its first frame (`#chip-allin.allin`, "ALL-IN 999.9c"), so nothing moves at 21:00 on those days either; `tests/score-reveal.test.js` reads the chip's sizes from the page's CSS against the widest text each key shows.
- **Q-118, ranks beside the letter.** `app/score.js` RANKS beside LETTERS (rankOf, letterText): D TRAINEE, C SHIFT OPERATOR, B SENIOR OPERATOR, A SHIFT SUPERVISOR, A ★ MARG'S CHAIR, F BLACK START CREW. The rank follows the letter on the end card ("SCORE 1004 · A ★ MARG'S CHAIR · PERFECT"), the share card's head, the practice shelf, THE MOMENT's picture and Marg's closing line ("1004 points, A ★: MARG'S CHAIR. Don't get comfortable."). History keeps the letter and the ★, so old entries show their ranks; the ladder line and the chip show points only. *Measured* (2026-10-20): over 83,520 synthetic share cards every card is lint-clean and within 280 characters; the closing line now drops on 6.8% (0.5% before), almost all with four or more tags. The coach-following player (`tools/follow.mjs`, 41 dailies, graded on F-8's stored par) sat in MARG'S CHAIR on 46%, SHIFT SUPERVISOR 24%, SENIOR OPERATOR 17%, SHIFT OPERATOR 12% (median 998). So the brief's premise, that following the line misses the ★, does not hold on this build: the chair is not yet "outplaying the coach" (put to the owner, §9.2). The end card's letter rule names the ranks too (`LETTER_RULE`, built from LETTERS and RANKS: "A ★ MARG'S CHAIR at par or better, A SHIFT SUPERVISOR within 10, …"), about one line longer.
- **Q-119, what par did that you didn't.** Under THE MOMENT, after par's line, at most three facts (`app/verdict.js` parLines), each in par's favour for that kind of moment and read at the end of the minute before it began. A fall: par's own trip when it took another machine, none, or the same one 50 MW apart ("Par had no trip over 50 MW at 20:49."), because par's figures above are its own trip's, in the game's words and never with a minus sign ("Par's tie line was exporting 300 MW when it tripped; yours was importing 600 MW."); par's GUARD when 50 MW or more above yours, tried on your trip ("Par had a GUARD of 300 MW. With it on your trip: 49.31 Hz, no relays.", said as the desk says a preview: "close to the relays" under 49.11 Hz, and under 49.0 Hz "the relays would shed 2 districts", counted as the N-1 gauge counts them; integration review); par's machines running that yours were not ("Par had GT·B 1 and GT·C 2 running; you didn't."), when par ran 100 rated MW more and your fall went deeper. A shed with no trip before it: the machines, the tie ("Par was importing 600 MW over the tie; you were importing 200 MW."), air-con cycles under way, a GUARD par had let go, only while yours was still holding its MW back (frequency at or above 49.75 Hz for the 660 s before), because a fired GUARD delivers its MW, so it is never said for the relays. The thinnest margin: machines and air-con, only when par's spare was 50 MW more. Nothing on a rise, without a finished par, or when nothing clears those floors; never "because". `app/par.js` keeps the GUARD, the machines and the tie at each minute's end, and par's trips and bookings, read-only, so par's day and every stamp stand. Par's GUARD on your trip is one more previewTrip on D-21's replayed twin (0.12 ms); a twin is now made also when your GUARD was below par's. SAVE IMAGE still waits only for the no-GUARD fall. Par usually finishes after the day's end: the twin is then made when par finishes, or the twin already made answers par's GUARD from its kept state (`tests/pardiff.test.js` plays both orders). *Measured* on 2026-10-24 (`tools/verdict.mjs`): the do-nothing runs get one line ("Par had COAL 1, COAL 4, GT·A and 3 more running; you didn't."), the line follower none. The soak is not compared (before 21:00 it only adds load). A par cached in a browser before this build has no record, so that day's moment has no lines. D-22 (30 re-runs) is retired.
- **Q-120, carbon in the quotes.** `tools/coal-off.mjs` counted once (60 dailies over the calendar; the line-follower against itself with a coal unit stopped at 09:00, 10:30 or 12:00 and kept off until tomorrow, on the score's ALL-IN): a stop paid on 1 date of 60 (1.7%: 2027-02-07, −$63k), the 180 variants cost a median +$415k (supply +$835k, carbon −$343k), and on 21 dates every stop cost a million or more. That is below the brief's bar of about 10%, so the line offers no coal call. Built: a STOP's saving counts the carbon the score charges (`stopSaving`: the unit's tonnes at the VER less its replacement's, each machine at its own t/MWh, an import at the region's present intensity) and says so ("Stop it: saves about $39,000, carbon included, if nothing trips before then."); the carbon help says why carbon seldom flips a choice at $80 a tonne. Where the build differs from the brief: the CCGTs' quotes fell (coal replaces them in the morning), GT·A's rose. The quote feeds only the STOP line's $10,000 threshold: on 12 dailies the followed day changed on one (a GT·C 1 stop, 995 → 999 points). Rerun the count when seasons come (Q-122).
- **Q-121, the evening trip announced.** `app/week.js` eveningTrip reads the day's plan from its seed alone (`sim/dayplan.js` preroll, about 0.2 ms a date): Act III's trip of the largest machine, never a storm's tie trip or an anniversary's incident. The briefing's day line then ends "Expect a trip during the evening peak." (`app/shell.js` TRIP_LINE), with no minute. The words differ from the owner's "Expect a trip at the peak." (review): Marg's TAKE THE DESK line names the peak as a minute, and the trips come a median 70 grid minutes before it (188 of 331 an hour or more early), while all of them fall inside the badge's PEAK (16:30-20:00). *Measured* over the 446 dailies 2026-10-12 to 2027-12-31: 331 (74.2%) have the evening trip, every heatwave, drought and calm day; the 115 without are the storm days, 29 of which trip the tie at 17:37-20:43, covered by the storm line. Loy Yang A3 and Callide C say the line; the towers and SA 2016 (storm days) do not. The "?" drawer no longer says trips are never warned ("No trip's minute is ever warned: the briefing says only whether the evening peak brings one."). The longest briefing is now 69 words (263 of 446 dates are over D-3's 60), so `tests/briefing60.test.js` guards at 69, the day and *Watch for* at 37 (30 before; five wind-drought weekends with a tie derate and two feeders), as D-3 records (the owner: the cap "doesn't matter really"). `tests/trip-line.test.js` holds the line to the plan the sim makes and every announced trip inside the evening peak.
- **Q-124, Marg's first-time lines; O-4 and O-5 cut** (neither had code). `app/marg.js` MARG_FIRSTS: three lines said the first time this browser's player meets each, kept as `seen.marg` in `gridwatch:v4:seen` (with storage blocked, at most once a day), each a tray card with SHOW ME, never a hold, true when said. *Price:* "Price below zero: −$20/MWh. More power than the city can use, so generators pay to run. Store what you can." *Coal:* a coal unit at its minimum while utility solar spills: "Coal's at its minimum: lower, it won't burn steady. Solar spills 160 MW. Stopped, coal's out past the evening." ("past the evening" when a stop now would be back only after the peak, else "out N hours"). *Relays:* "The relays shed 6 districts on their own: frequency fell below 49 Hz. Last net before a blackout." She waits through a watch and after 21:00, says one first-time line a frame, and never sends a card of her own to the LOG unseen (`app/game.js` lessonRoom): with three warnings up she waits, except the relays line, which takes the place of the city desk's oldest warning (always a shed). On a first shift her watch line comes in the same frame as the RESPOND card and, by Q-115's tray rule, keeps its place, so both of her lines show beside the SHEDDING notice (before Q-115 the watch line went straight to the LOG). Her once-only lines, a first-time line and a first shift's watch line, are passed over by K-9 for their life (`app/tray.js` evict): a restore's caption or the next shed's warning sends the oldest other card to the LOG (integration review: on 2026-10-16 the caption of the first RESTORE sent the relays line to the LOG 8 real s after it came, already kept as said). Nothing of hers is said during an F-7 resume's replay. a first-time line keeps room for the fixed beats still to come, so a later day (6 lines) has one lesson a day, and a line that cannot speak waits for another day. *Measured:* on the no-input day the first such moment comes no earlier than 10:00 (87 dailies scanned); 20261017 goes below zero at 10:45 and has coal at minimum with solar spilling at 10:58; on 20261016 the first relay shed is at 17:10:02 and her line comes the same second (before the review it waited until 19:39 behind the sheds' warnings). `tests/marg-firsts*.test.js`.
- **Q-125, verify, then restamp.** `tools/verify.mjs` (`npm run verify`) replays par on worker processes for every listed daily (an anniversary under its variant) through `runPar`, the run the ladder and F-8 use, and compares par's ALL-IN and shed MWh with `content/ladder.js`. Along that run it checks D-9's gate (the bound and gate each grid minute, an anniversary's incident, attempt k's class); it plays the ladder's scripted players on every 8th date, the anniversaries and the selftest's dates, the five selftest cases as the page's runner does, and the ladder's 14:00 check. A state's hash covers its `SIM_VERSION`, so each hash is taken twice and compared under the stored version. When everything holds it rewrites only the stamps (`content/dailies.js`, `content/ladder.js`, `content/anniversaries.js` GATED, `content/selftest.js`, and after a bump the selftest's hashes and the ladder's check), each through the writer that made it, refusing any other change; when anything differs it writes nothing, names each date and field, and prints the full regeneration. Not checked: the attempts before a listed one, the scripted players off the sample, daily-gen's D-10 and Hard-day report, any HAND day or player's press beyond `tests/hand-guard.test.js` (Q-116), and the classic golden, which is now a tool (`npm run golden:v4 -- --check`, its hashes taken under the golden's own `SIM_VERSION` as verify's are, so a bump that moves nothing still matches; integration review: before, every hashed line differed after any bump). `tests/baseline-v4.test.js` is `tests/par-classic.test.js` (S-4, D-9, H-8 and H-4 on seed 4, no golden); `tests/par-guard.test.js` plays par's whole day on the selftest's first par daily against its hourly hashes and the stored par, so the suite still catches a change to par's day made without a version bump. The stale-stamp tests name `npm run verify` first, and the hash guards say whether the day moved under the file's stamp or the file is another build's (`movedAdvice`). CI: `.github/workflows/verify.yml` runs `--check -j 4` on pushes that touch sim/, the scenarios, the four files, `app/system.js` or `app/score.js`, apart from the test job; it catches what it plays, not every sim change. *Measured* (2026-10-20, the owner's laptop with other work running, 11 workers, 446 dailies): 577 s at `v4-core-2d.0` (MATCH, nothing written); 701 s with `SIM_VERSION` bumped by hand (MATCH, restamped; put back); 722 s with one stored par changed by $1 (refused, named; put back). The brief's "about 2 minutes" is 10-12; the 25-40-minute regeneration is now needed only when a graded value moves. The CI job's time is measured on its first run.
- **Q-126, the switch-over (F-14).** The game is the site's root: `next.html` became `index.html` (the old root's redirect is gone), and every tool, test and comment that named the game page names `index.html`. `next.html` is now a redirect with the og: tags, the favicon and a canonical link to the root. It sends an old link to `./` with the rest of its address (`?seed=`, `?date=`, `#…`). Pages caches a file for 10 minutes, so a browser that still holds the old root, which sent everyone to `next.html`, would bounce between the two: after two hops in a tab (a count in session storage, `gridwatch:hop`), or at once with no session storage, it goes to `index.html` by name instead, an address the old root was almost never cached under, and `app/start.js` clears the count when the game starts. If `index.html` too is held as the old root, after four hops it stops on its own "moved" words, its link to the root keeping the address. With no script, a refresh goes to `index.html`. COPY LINK on the phone's page copies the address the page is at, so it is now the root; the share card already linked the root. `?selftest`'s back link goes to `./`. `classic.html` has a one-line banner ("This is the original GRIDWATCH (v2), kept as it was. Today's GRIDWATCH, a new daily every day, is at databerryau.github.io/gridwatch.") outside its script, which `tools/harness.js` loads unchanged; `tools/baseline.golden.md`'s Build line still names the old file's blob. BUILD is `2026-10-20` (F-9: `app/build.js`, `version.json`, the eight carriers), so a page open from before the release says "GRIDWATCH was updated: refresh before your next shift." `tests/switchover.test.js`. The release checks (`playtest/release-checks.md`) and the W2 kit name the root.

### W8 — Light seasons and the chair (Q-127, Q-128)

*Built 2026-10-21 on branch `w8-seasons`. The owner said "next feature please" and chose, from the options put to them, light seasons and a margin above par for MARG'S CHAIR. No SIM_VERSION bump: the one sim change reads a table only a season month has, so every earlier scenario plays bit for bit as before.*
- **Q-127, light seasons.** `content/seasons.js` is a month table written by `tools/seasons-gen.mjs`. The sim has no transcendental function, so the curves are tabulated offline, as the late-summer day's were. For each month it holds: sunrise and sunset (about 38° S on the 15th; solar noon 13:00 under daylight saving, October to March, 12:00 otherwise); utility solar's clear-sky curve and the rooftop shape and factor (June: 64% and 63% of February's peak, the sun up 07:14-16:46); two day types' temperatures, on the late-summer shape an hour earlier on standard time; and their demand. Demand is the late-summer mild day, plus cooling on hot and warm days (the sim's own rule), plus heating (85 MW per °C below 15 °C, weighted to mornings and evenings), plus 200 MW of lighting after an early sunset. The table also sets the heatwave and MILD shares: heatwaves come only from November to March. The non-mild type is *hot* (November to March), *warm* (April, October) or *cold* (May to September); a cold day offers no air-con lever. `content/scenarios.js` lays each month over DESK and DESK_WEEKEND as `desk-<key>` and `desk-weekend-<key>`. From `SEASONS_FROM` (2027-04-01) `content/dailies.js` scenarioIdOf plays a date's month. Every earlier date, and February, keeps the day it was gated on. Callide C's anniversary (25 May) is now a May day. The one sim change is in `sim/weather.js` underlyingBaseMW: a season's MILD day reads its own table (`demand.mildBaseMW`, with its heating in it). The briefing says "Today: a cold weekday: heating lifts the morning and the evening." or "a warm weekday", and the week ahead says *cold* or *warm*. The air-con note reads "hot days only (today has no cooling load to relieve)". The map's light follows the month: observe() gives `sky.sun` {riseH, setH}, and `render/map.js` skyHour lays the clock onto the late-summer sky through sunrise, solar noon and sunset, so a June city is dark by 17:30 (browser-checked; lit windows and traffic keep the clock). The build stamp (app/game.js dailyStamp) gains a fourth part, one hash over the season scenarios. The 275 dates from April were re-gated (all pass; 10 on a later attempt) and their ladder rows remade; earlier rows were restamped unchanged, since their scenarios' hashes did not move. *Measured once* (tools/par.js, 60 seeds a month, the lean script graded against par): winter weekdays are about as hard as late summer (lean's median 982-984 in June and July, 983 on the desk; July's p10 is 300, a harder tail). April, October and the winter weekends are easier (lean's median 1017-1021).
- **Q-128, MARG'S CHAIR's margin.** `app/score.js` STAR_POINTS = 1040: grade's ★ is points ≥ 1040, not ≥ 1000. Everything that shows the ★ or the chair reads it: the letter rule ("A ★ MARG'S CHAIR at 1040 points or more"), ★ STREAK's rule ("days in a row in MARG'S CHAIR (1040 points or more)"), the rank help, the share card, Marg's closing line, THE MOMENT's picture and the shelf. The share card's row stars (lights, cost and carbon at par or better) are unchanged. *Measured once* (2026-10-21; the coach-following player of `tools/follow.mjs` without STOP re-runs, on 96 dailies over the whole calendar, 64 weekdays and 32 Saturdays, graded on the stored par of `content/ladder.js`; Hard days left out): the median was 1003 (Saturdays 1015). The share at or above each bar: 1000 56%, 1020 31%, 1030 18%, 1040 13% (weekdays 13%, Saturdays 16%), 1050 7%. History keeps each entry's own ★, so a chair won at 1000 before W8 stays in the ★ STREAK.

### W9 — More anniversaries (Q-129)

*Built 2026-10-21 on branch `w9-anniversaries`. Asked for the next feature with the roadmap built, the owner chose "Winter anniversaries" from four options. No SIM_VERSION bump: the new incident kinds are on the anniversary variants only. BUILD 2026-10-21 (it was not bumped for W8's release; it is now).*
- **Q-129, five more anniversary dailies** (`content/anniversaries.js`, D-29). Each account was read in its source on 2026-10-21 and says no number the source does not give. Each box is at most 65 words.
  - 25 Jan, the Victorian heatwave (2019; AEMO's media release on its event report): a heatwave weekday with coal 4 out all day.
  - 30 Jan, the Melbourne heatwave (2009; NEMMCO's market event report, in AEMO's archive): a heatwave Saturday whose tie import limit falls to 450 MW at 14:12 and to 150 MW at 17:01, the report's minutes for its two 500 kV line failures.
  - 31 Jan, the Heywood separation (2020; AEMO's final report): a storm Sunday whose tie trips in the storm and stays out for the rest of the day.
  - 15 Jun, the market suspension (2022; AEMO's report on the June 2022 events): a cold June weekday (W8's month) with low wind and coal 4 out all day. The echo says the desk has no market to suspend.
  - 25 Aug, QNI lightning (2018; AEMO's preliminary report): an August weekday whose tie trips with no warning between 13:00 and 13:30 and returns after 90-150 minutes.
- **The new incident kinds** (`sim/dayplan.js`, variants only): `outages` (units on forced outage from 04:00 to the day's end; the variant's commitment has them off), `lines` (tie import limits at fixed minutes), and `separation` (a link trip in a window, or while the storm blows, for a drawn lockout or the rest of the day).
- **Smaller changes.** A forced outage's notice reads "Forced outage: Mt Hazel coal 4 is out of service all day." (`sim/events.js`). A `null` in an overlay removes the key (`content/scenarios.js`), so a variant's commitment can leave a unit off. The help's incident list and its unannounced-limit days cover all eight (`content/text.js`).
- **Softened by D-9**, as Callide C was. The 2019 source loses "up to 1,600 MW" of thermal plant, and June 2022 had several units out. With two coal units out, par was short of supply on all 41 attempts of both dates, so each takes one unit, and the 2019 echo says it is softened. Gated: 2019 on attempt 3, June 2022 on attempt 13 (hard days), QNI on attempt 1, the other two on attempt 0; their ladder rows were remade.
- **Not built:** separate end cards. The existing THIS REALLY HAPPENED cards already fire on these days' events (the tie tripped, the relays or the city desk shed, the diesel called, the heat).

### Later, not scheduled

- **Phase 3, the rest of the city (Q-123):** only a region-wide VPP (home batteries charged at noon and spent at the peak), built only if testers or telemetry show midday is dead time. The rooftop backstop becomes a 14 March anniversary daily. P-10, U-2's HOT WATER HOLD, EV DELAY, U-5, U-7 and S-14 extended are cut; their text stays in `SPEC-history.md`.
- **Phase 5, week mode** (W-1–W-5, H-17): cut (Q-123). Its best idea, the outlook, ships as D-28.

---

## 6. Targets

Live targets only. Figures are on the game's day (`desk`, `desk-weekend`) unless marked; older measurements are in `SPEC-history.md` §6.

| Metric | Now (measured) | Target | How measured |
|---|---|---|---|
| Par sheds nothing, raw seeds | `desk` 93.5%, `desk-weekend` 99% (2c stage C) | ≥85% | `tools/par.js` (S-12) |
| Par sheds nothing, forced heatwave | 74 of 100 | ≥70% (Q-87) | `tools/par.js` |
| Par arms the reserve diesel | `desk` 6.5–7.5% (2a) | ≤25% | `tools/par.js` (Q-2) |
| Competent proxy earns A | 83.5% (167 of 200 `desk`+`desk-weekend` days, Q-98's letters, `v4-core-2c.2`) | ≥70% ✓ | `tools/par.js --allin` (S-5) |
| Lean proxy earns A | 70% (140 of 200, Q-98's letters, W1; commit-all 2.5%, B on 94%) | ≤40% (S-5) ✗: a lean day is within 10 MWh-equivalents of par; open for the owner | `tools/par.js --allin` |
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
| RoCoF limits | K-11 (K-8's HIGH RoCoF tile retired, Q-113) | Mainland: 1 Hz/s after a credible event, measured over any 500 ms; 3 Hz/s non-credible, over any 300 ms | FOS Table A.2 | H |
| Island frequency standard | §8.2 | An island within the mainland: generation, load or network event contained within 49.0–51.0 Hz, back to 49.5–50.5 Hz within 5 min | FOS Table A.4 | H |
| Event threshold | K-15 trigger | >50 MW | FOS Table A.8 | H |
| UFLS first stage and timing | H-6 | 49.0 Hz; ~0.3 s crossing to load off | [AEMO UFLS arming paper (2023)](https://www.aemo.com.au/-/media/files/initiatives/der/2023/dynamic-arming-options-for-ufls.pdf) App. A1.2 | H |
| Real staging example | §8.2 | QLD 2021: 8 blocks, 49.00–48.60 Hz, 0.15 s delay; 1,308 MW shed | [AEMO QLD 2021 report](https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2021/trip-of-multiple-generators-and-lines-in-qld-and-associated-under-frequency-load-shedding.pdf) Table 9 | H |
| UFLS depth | §8.2 | Settings from 49 to 47.5 Hz; sized for events affecting up to 60% of load | AEMO UFLS paper s3.1 | H |
| Rooftop PV weakens UFLS | P-12 | VIC net load available to UFLS 26% of underlying (28 Nov 2021) | AEMO UFLS paper s1 | H |
| Over-frequency generation shedding | H-7 | Wind trips in stages 51–52 Hz; SA peaked at 51.11 Hz (31 Jan 2020) | [AEMO 2025 frequency review](https://www.aemo.com.au/-/media/files/initiatives/engineering-framework/2025/technical-review-of-the-nem-frequency-control-landscape.pdf) Table 1 | M (stages), H (51.11) |
| What sets the nadir | H-8, K-15 | Inertia slows the fall, primary response arrests it, AGC restores | AEMO 2025 review pp.18–22; [FFR working paper 2017](https://www.aemo.com.au/-/media/files/electricity/nem/security_and_reliability/reports/2017/ffr-working-paper.pdf) | H |
| NEM inertia | K-11 scale | Mainland average ~84,000 MW·s | AEMO 2025 review p.18 | H |
| Inertia constants | F-13 `H` by class, H-8 | Synchronous machines typically 2–8 s, on the MVA rating; measured GB thermal plant inside the literature's 3–10 s; hydro 2–4 s in the literature (small GB hydro units measured higher); no NEM table by class. Ours (3.5–5 s) sit inside, on the MW rating, so stored energy is slightly low | [AEMO, Inertia in the NEM explained (2023)](https://aemo.com.au/-/media/files/initiatives/engineering-framework/2023/inertia-in-the-nem-explained.pdf); [Kraljic et al. 2022](https://arxiv.org/abs/2210.03661) | H / M |
| Largest credible contingency | F-13 | ~700–800 MW | AEMO 2025 review | H |
| Mandatory primary frequency response | H-8 | Deadband ±0.015 Hz; droop ≤5%; 5% output change within 10 s | [AEMO interim PFRR (2020)](https://www.aemo.com.au/-/media/files/initiatives/primary-frequency-response/2020/interim-pfrr.pdf) s3.3–3.4 | H |
| Governor lag | H-8 | Seconds; many slower than 2 s | FFR working paper s2.3.1 | H |
| Load relief | H-8 | Mainland NEM assumes 0.5% load change per 1% frequency change (since 2020); the 2023 bottom-up review estimated 0.6–0.8% by region and kept 0.5% | [AEMO load relief fact sheet (2023)](https://aemo.com.au/-/media/files/initiatives/der/2023/2023-05-31-load-relief-fact-sheet-update.pdf) | H |
| Battery response | H-8, Q-1 | Hundreds of ms; most batteries reach full output 0.85 Hz beyond deadband (~1.7% droop) | AEMO 2025 review pp.31, 70 | H |
| Grid-forming battery | H-17 (cut, Q-123) | Hornsdale, 150 MW in Virtual Machine Mode: about 2,070 MW·s of synthetic inertia, only while it has headroom; AEMO's voluntary grid-forming specification: voltage response under 5 ms | [ARENA/Neoen Hornsdale upgrade report (Feb 2024)](https://arena.gov.au/assets/2024/02/Neoen-Hornsdale-Power-Reserve-Upgrade-Project-Summary-Report.pdf) s3, s8; AEMO Voluntary Specification for Grid-forming Inverters (May 2023) s2.4.1 | H |
| FCAS timeframes | K-15 labels | Very Fast 1 s (from 9 Oct 2023), Fast 6 s, Slow 60 s, Delayed 5 min | [Hornsdale report 2018](https://www.aemo.com.au/-/media/Files/Media_Centre/2018/Initial-operation-of-the-Hornsdale-Power-Reserve.pdf); [WattClarity](https://wattclarity.com.au/articles/2023/10/very-fast-raise-service-to-be-expanded/) | H / M |
| Switched-controller contingency FCAS | K-5 GUARD trigger and hold | Mainland raise trigger set per facility within 49.80–49.60 Hz (default 49.80), held within 0.05 Hz; the raise services relay from the disturbance: to 6 s, 60 s, 5 min and 10 min | [AEMO MASS v8.0/8.1](https://www.aemo.com.au/-/media/files/stakeholder_consultation/consultations/nem-consultations/2023/primary-freq-resp-norm-op-conditions/market-ancillary-services-specification-v81.pdf) Tables 6, 8 | H |
| Recovery after large credible trips | K-15 settle | Back in the normal band in 10–20 s | AEMO 2025 review p.23 | H |
| AGC and dispatch | K-2 label | AGC setpoints up to every 4 s; 5-minute dispatch and settlement (since 1 Oct 2021) | Hornsdale report s2.1; [AEMO 5MS](https://aemo.com.au/en/initiatives/major-programs/nem-five-minute-settlement--program-and-global-settlement) | H / M |
| Secure again within 30 min | D-5 | 30 minutes | [NER chapter 4](https://www.aemc.gov.au/sites/default/files/2021-03/NER%20-%20v161%20-%20Chapter%204_0.pdf) cl. 4.2.6 | M |
| Start and stop profile | F-13, H-1, K-3, K-12 | Fast-start inflexibility profile: T1 time to synchronise, T2 time to reach minimum load, T3 time at minimum, T4 time to shut down from minimum; defined for fast-start units only (T1 + T2 ≤ 30 min and T1 + T2 + T3 + T4 < 60 min), so our coal and CCGT borrow its terms | [AEMO fast-start inflexibility profile](https://aemo.com.au/-/media/files/electricity/nem/security_and_reliability/dispatch/policy_and_process/fast-start-unit-inflexibility-profile.pdf); [WattClarity FSIP glossary](https://wattclarity.com.au/other-resources/glossary/fsip/); [AEMO FSIP process description (Oct 2014)](https://nempy.readthedocs.io/en/latest/_downloads/28b1900b8dc1b8f88cddd8edbf0245c6/Fast_Start_Unit_Inflexibility_Profile_Model_October_2014.pdf) | M; H (fast-start scope) |
| Synchronising limits | K-12 | ±10°, 0 to +5% voltage, ±0.067 Hz slip; close slightly early; sync-check relay "device 25" | [IEEE PSRC WG J20 (2024)](https://www.pes-psrc.org/kb/report/119.pdf) | H |
| Auto-synchroniser closing time | K-12; §8.2 auto-sync | Field tests on 6.25–7.5-MVA hydro sets: 82–148 s from full speed to breaker close with the original settings, 48–60 s retuned; a new synchroniser on an existing hydro unit, on default settings, about 1 min; no timing for large thermal units | IEEE PSRC WG J20 (2024) App. B, Table 9 | H |
| Restoring load | K-13 | AEMO permission 4–26 min after the Callide trips; small groups restored every few minutes | Callide report s6.1 | H |
| Market price cap and floor | P-8, H-12 | $23,200/MWh (FY2026-27); −$1,000/MWh | [AEMC reliability settings 2026-27](https://www.aemc.gov.au/sites/default/files/2026-02/Schedule%20of%20reliability%20settings%20-%202026-27%20financial%20year.pdf); [AEMC MSL paper](https://www.aemc.gov.au/sites/default/files/2026-07/msl_rule_changes_consultation_paper_erc0417_erc0439.pdf) | H |
| Price during AEMO-ordered load shedding | P-8 | Set to the cap | AEMC MSL paper s4.2.1 | H |
| Administered pricing (CPT) | P-8 (not modelled) | An administered price period starts when the last 2,016 intervals' (7 days') prices sum past the cumulative price threshold, $2,225,900 for 2026-27; the administered cap is then $600/MWh. About 96 intervals (8 h) at the cap: one game day stays under it | [AEMO guide to administered pricing](https://www.aemo.com.au/-/media/files/electricity/nem/security_and_reliability/dispatch/policy_and_process/guide-to-administered-pricing.pdf); AEMC reliability settings 2026-27 | H |
| Intervention pricing | P-8 | After a direction or a RERT activation, prices are set as if AEMO had not intervened (NER 3.9.3(b)); applied for NSW on 27 Nov 2024 | [AEMO Intervention Pricing Methodology v2.3](https://www.aemo.com.au/-/media/files/electricity/nem/security_and_reliability/dispatch/policy_and_process/intervention-pricing-methodology.pdf); RERT Q4 2024 s3.4 | H |
| Carbon intensity index | S-3 | AEMO's CDEII: emissions divided by the energy generated, per region and for the NEM | AEMO CDEII procedure (via the review of 2026-09-30) | M |
| Value of Customer Reliability | H-12, D-20 | NEM $30,000/MWh (2024 dollars) | [AER VCR 2024](https://www.aer.gov.au/system/files/2024-12/2024-12-18%20AER%20-%20Final%20report%20-%202024%20VCR%20review_0.pdf) | H |
| VCR by region and customer type | Q-48 OUTAGES | 2024 dollars, $/MWh: NEM 30,000; NSW+ACT 30,930; VIC 35,780; QLD 25,750; SA 33,320; TAS 18,990; residential NEM 41,480. For outages up to 12 h; no $/kWh for planned, momentary, widespread or longer outages | AER VCR 2024 Tables 1 and 20 | H |
| Value of emissions reduction | Q-48 CARBON | Interim VER, AUD2023 real, per t CO₂-e: 2024 $70, 2025 $75, 2026 $80, 2027 $84, 2030 $105; ±25% sensitivity; the ministers' statement ran to 30 Jun 2026 and no replacement value was found by 2026-10-08 | [AER VER guidance (May 2024)](https://www.aer.gov.au/system/files/2024-05/AER%20-%20Valuing%20emissions%20reduction%20-%20Final%20guidance%20and%20explanatory%20statement%20-%20May%202024.pdf) Table 1; [MCE statement (amended)](https://aer.gov.au/system/files/2024-08/Amended%20VER%20MCE%20Statement.pdf) | H (value) / UNVERIFIED (no replacement) |
| Reliability standard | Q-48 OUTAGES | 0.002% expected unserved energy per region per financial year (1 Jul 2025 to 30 Jun 2028), set where the total cost of new generation and unserved energy is least; 0.003% recommended from 1 Jul 2028 | [Reliability Panel RSSR 2026 final report](https://www.aemc.gov.au/sites/default/files/2026-04/RSSR%202026%20-%20Final%20Report.pdf) | H |
| STPIS for distribution networks | Q-48 RELIABILITY | STPIS v2.0 still applies to distributors. Cl. 3.3(a)(2)–(4) exclude load shed for a generation shortfall, by under-frequency relays and at the direction of AEMO. Incentive rates are built from VCR with w = 1.5 (60% to SAIDI, 40% to SAIFI); the reliability s-factors are capped at ±5% of annual revenue | [AER STPIS v2.0 (Nov 2018, updated Dec 2018)](https://www.aer.gov.au/system/files/AER%20-%20Service%20Target%20Performance%20Incentive%20Scheme%20v%202.0%20-%2014%20November%202018%20%28updated%2013%20December%202018%29.pdf) cl. 2.5, 3.2.2, 3.3, App. B | H |
| Sustained and momentary interruptions | Q-48 RELIABILITY | Longer than 3 minutes is sustained (SAIDI, SAIFI); 3 minutes or less is momentary (MAIFI). SAIDI = minutes of sustained interruption ÷ the customer base; SAIFI = their number ÷ the customer base | [AER Distribution Reliability Measures Guideline (Aug 2022, updated Dec 2024)](https://aer.gov.au/system/files/2024-12/AER%20-%20Distribution%20reliability%20measures%20guideline%20-%20August%202022%20%28updated%20December%202024%29.pdf) §3.1–3.3 | H |
| Network reliability delivered | Q-48 RELIABILITY | 2024, the average network customer: all outages SAIDI 394 min, SAIFI 1.6; normalised SAIDI 115 min, SAIFI 1.0 | [AER networks performance report 2025](https://www.aer.gov.au/system/files/2025-12/AER%20-%202025%20Electricity%20and%20gas%20networks%20performance%20report%20-%20December%202025.pdf) | H |
| Emergency reserve cost | Q-2, K-7 | NSW, 27 Nov 2024: 605 MW contracted, 184 MW pre-activated, 65 MWh activated; readiness $2,545,000, activation $1,008,945 (about $16,000/MWh); all-in $56,359/MWh | [AEMO RERT Q4 2024](https://www.aemo.com.au/-/media/files/electricity/nem/emergency_management/rert/2025/rert-quarterly-report-q4-2024-ver-1.pdf) | H |
| RERT contract terms | K-7; §8.2 reserve diesel | Contracts differ in pre-activation and activation lead times, response times and minimum run times; offers are assessed for an hour or more of running; NSW, 27 Nov 2024: decided by 13:30 for a shortfall from 15:30 | AEMO RERT Q4 2024 | H |
| LOR levels | H-4 | LOR1 below two largest risks; LOR2 below the largest; LOR3 = shedding | RERT Q4 2024 glossary | H |
| Rooftop PV fleet | P-2 scaling | NEM 26.4 GW on 3.9M systems (Jun 2026) | [AEMO QED Q2 2026](https://www.aemo.com.au/-/media/files/major-publications/qed/2026/qed-q2-2026.pdf) | H |
| Rooftop PV against peak demand | P-2 scaling (0.65 × peak) | End 2025: VIC 5.73 GW against a 9,887-MW peak, about 0.58; SA 2.85 GW against 3,274 MW, about 0.87; SA has rooftop PV on 49% of dwellings | CEC/SunWiz H2 2025 Fig. 4; WattClarity; [AEMO 2025 SA electricity report](https://www.aemo.com.au/-/media/files/electricity/nem/planning_and_forecasting/sa_advisory/2025/2025-south-australian-electricity-report.pdf) | M (derived) |
| Rooftop output on its best days | P-2 `clearFactor` 0.70 | Records of 7 Oct 2026: SA 2,070 MW, VIC 4,191 MW, about 0.71 and 0.73 of their 2.92 and 5.73 GW; no source states a clear-sky factor | [pv magazine, 12 Oct 2026](https://www.pv-magazine-australia.com/2026/10/12/rooftop-solar-reaches-new-highs-across-nem/) | M (derived) |
| Inverter ramp after reconnection | P-12, H-8 `ROOF_RAMP_S` | At most 16.67% of rated power a minute (6 min from zero to full), so a roof at part output is back sooner | [Horizon Power LV EG requirements (Mar 2025)](https://www.horizonpower.com.au/globalassets/media/documents/.resa-documents-final/draft-low-voltage-eg-connection-technical-requirements.docx.pdf) cl. 4.10.2.7, citing AS/NZS 4777.2:2020 (region Australia C) | M |
| Households | U-1, region scale (1.9M) | 2021 Census occupied private dwellings: Greater Melbourne 1,781,346; VIC 2,390,232; SA 691,313. Peak per household about 4.1 kW in VIC, 4.7 kW in SA; ours 4.1 kW | [ABS QuickStats 2021, Greater Melbourne](https://www.abs.gov.au/census/find-census-data/quickstats/2021/2GMEL) | H |
| Depth of the belly | P-3 | VIC minimum 1,287 MW, ~12% of its 10,736 MW peak | QED Q4 2025; [QED Q1 2026](https://www.aemo.com.au/-/media/files/major-publications/qed/2026/qed-q1-2026.pdf) | H |
| Temperature and peak demand | P-3 cooling; §8.2 cooling | A weekday forecast at 30 °C that reaches 35 °C: daily maximum demand up 1,300 MW (VIC), 1,700 (NSW), 1,800 (QLD), 500 (SA), about 260–360 MW per °C on the mainland; flatter towards 40 °C | [AEMO temperature forecast analysis, summer 2019-20](https://aemo.com.au/-/media/files/electricity/nem/planning_and_forecasting/load-forecasting/temperature-forecast-analysis-for-summer-2019-20.pdf) s2 | H |
| Cooling threshold | P-3 `COOLING_BASE_C` | Cooling counts above a daily average of VIC 18.0, SA 19.0, NSW 19.5, QLD and TAS 20.0 °C | [AEMO demand forecasting methodology (ESOO 2023)](https://www.aemo.com.au/-/media/files/electricity/nem/planning_and_forecasting/nem_esoo/2023/forecasting-approach_electricity-demand-forecasting-methodology_final.pdf) App. A2 Table 7 | H |
| Weekend demand | P-3 `WEEKEND_DEMAND_FACTOR` | Lower on weekends all year, most around 6 a.m. (Adelaide 1997–2007); no published factor | [Cao et al. 2024](https://arxiv.org/abs/2409.03296) | M (direction) |
| Forecast error by lead time | L-2 band shape | AEMO pre-dispatch errors in the south and south-east regions grow with lead time and lean to over-forecasting; midday deviations reach 15–25% of average demand in SA; no σ by lead time found | [Loh et al., MODSIM 2025](https://mssanz.org.au/modsim2025/files/E04.loh.pdf) (UniSA Mathematics Clinic, supported by AEMO) | M |
| MSL framework | P-4 | MSL1/2/3 tiers; MSL2 is one credible load contingency above MSL3, MSL1 two; thresholds vary with the synchronous units online; backstop as last resort; VIC thresholds ~1,790/1,290/790 MW | AEMC MSL paper Table 2.1 and s2; AEMO MSL fact sheet (via search snippet) | H / M |
| Islanded security floor | P-4 MSL3; §8.2 `msl-tiers` | Islanded SA needed about 550 MW of operational demand in 2020 and about 450 MW from 2021 (four synchronous condensers); its largest contingency about 280 MW | [AEMO SA minimum demand review (May 2020)](https://aemo.com.au/-/media/files/electricity/nem/planning_and_forecasting/sa_advisory/2020/minimum-operational-demand-thresholds-in-south-australia-review.pdf) s6.2 | H |
| Negative prices | P-6, P-9 | Q4 2025: 31.0% of NEM intervals (SA 48.4%); 86% between −$30 and $0; average −$19.4 | [AEMO QED Q4 2025](https://www.aemo.com.au/-/media/files/major-publications/qed/2025/qed-q4-2025.pdf) s2.2 | H |
| Economic offloading and curtailment | P-9 | Q4 2025: economic offloading (price-driven) was 18% of available grid solar and 15% of wind; network curtailment was 6.3% of solar and 0.8% of wind | QED Q4 2025 s2.3 | H |
| Backstop dates | U-7 | SA from 28 Sep 2020 (first used 14 Mar 2021); QLD 6 Feb 2023; VIC 1 Oct 2024; NSW mid-2026 | [Vic](https://www.energy.vic.gov.au/households/victorias-emergency-backstop-mechanism-for-solar), [Qld](https://www.treasury.qld.gov.au/policies-and-programs/energy/emergency-backstop-mechanism/), [NSW](https://www.energy.nsw.gov.au/emergency-backstop-mechanism) | M |
| Home batteries fill the belly | U-2 VPP | Q2 2026: midday demand rose as home batteries charged | QED Q2 2026 s2.1 | H |
| VPP size | Phase 3 VPP | No current NEM total: AEMO (Dec 2025) calls VPPs very early stage; VPPs' share of the NEM-wide FCAS market rose to 9% in 2024-25; 454,473 batteries installed across Australia by end 2025 (CEC) | [AEMO 2025 PV, batteries and VPP forecast](https://www.aemo.com.au/-/media/files/stakeholder_consultation/consultations/nem-consultations/2025/draft-2026-fau/aemo-2025-distributed-pv-and-batteries-vpp-forecast-report.pdf); AEMO 2025 SA electricity report; CEC/SunWiz H2 2025 | M |
| VPP event pay | U-6 VPP (Phase 3) | About $1/kWh ($1,000/MWh): AGL Bring Your Own Battery $1/kWh capped at 250 kWh a year; Origin Loop $1/kWh capped at 200 | [CHOICE, AGL BYOB](https://www.choice.com.au/products/home-improvement/energy-saving/solar/agl-bring-your-own-battery); whysolar.com.au comparison (Oct 2026) | M |
| EV charging today | Phase 3 EV DELAY | Passenger EVs: 50% home charging on no schedule; 18% on time-of-use; 2% with daytime incentives; 30% public; 0% under dynamic grid control | [CSIRO EV projections for AEMO (Dec 2025)](https://www.aemo.com.au/-/media/files/stakeholder_consultation/consultations/nem-consultations/2025/draft-2026-fau/csiro-electric-vehicle-projections.pdf) Table 4-5 | H |
| Controlled hot water | U-2 | Energex held 777 MW of hot-water and pool load, 17:30–20:00 | Callide report s6.1.5 | H |
| Electric-storage hot water | U-1 soak MW | Share of homes, 2015: VIC 21%, SA 34%, NSW 58%, QLD 67% (gas 70% in VIC); Ausgrid has more than 450,000 controlled-load customers (Nov 2024) | [E3 hot-water policy framework (2018)](https://www.energyrating.gov.au/sites/default/files/2022-12/A%20Policy%20Framework%20for%20Hot%20Water%20Systems%20in%20Australia%20and%20New%20Zealand%20-%2012%20November%202018.pdf) Graph 1; AER submission (Nov 2024) | H (2015 data) |
| Air-con programs | U-2 | PeakSmart: 155,738 air-cons, 107 MW at a 50% cap; events about 16:00–19:00; a one-off rebate of up to $400 an air-con | [ABC 2025](https://www.abc.net.au/news/science/2025-02-26/peaksmart-flexible-loading-energy-demand-reduction/104949388) | M |
| Household event pay | U-6 air-con price (Q-55) | EnergyAustralia PowerResponse: $2 per kWh saved ($2,000/MWh) plus $1 an event, in events of 1–4 h; air-con programs pay a one-off sign-up reward; no per-MWh air-con price found | [EnergyAustralia PowerResponse](https://energyaustralia.com.au/home/electricity-and-gas/power-response) | M |
| Solar-soak hot-water windows | U-2 soak (Q-52) | SA Power Networks' solar sponge heated controlled-load tanks 10:00–15:00 (09:30–16:30 from 1 Jul 2025); Ausgrid moved Controlled Load 1 into the day from Jul 2024; Powercor began moving >140,000 hot-water customers to daytime in 2025 | [RenewEconomy](https://reneweconomy.com.au/networks-offer-super-cheap-pricing-to-soak-up-australias-solar-sponge-10879/), [SAPN tariffs](https://www.sapowernetworks.com.au/your-power/billing/pricing-tariffs/electricity-tariffs/), [Ausgrid](https://www.ausgrid.com.au/your-energy-use/smarter-energy-use/understanding-network-tariffs/controlled-load-pricing), [Powercor](https://powercor.com.au/network-planning-and-projects/network-innovation/flexible-hot-water/) | M |
| Size of shiftable hot water | U-1 soak MW, U-2 cap | SA trial (18,843 homes): 45.4% of hot-water load shifted to daytime, about 2.5 kWh a day a home, 0.3% opted out; about 10.5 GWh a day shiftable across the NEM from about 4 M storage tanks; 20,000 systems ≈ 48 MW controllable | [UNSW/Yildiz 2025](https://www2.pv.unsw.edu.au/videos/Baran-Yildiz-4June2025/slides/Turning-household-water-heating-systems-into-MW-batteries-to-support-the-integration-of-consumer-energy-resources-(CER).pdf); [ARENA](https://arena.gov.au/news/dynamically-managing-hot-water-systems-in-south-australia) | H / M |
| Controlled load in the MSL framework | S-14 rule 1, MSL cards (Q-60) | MSL1 is a notice; at MSL2 AEMO recalls outages, decommits and uses storage; at MSL3 networks keep demand up "via controlled loads, network-managed storage" and, last, the emergency backstop; networks turn hot water on in MSL events | [AEMC MSL consultation paper, Jul 2026, Table 2.1](https://www.aemc.gov.au/sites/default/files/2026-07/msl_rule_changes_consultation_paper_erc0417_erc0439.pdf); [United Energy](https://www.unitedenergy.com.au/outages-emergencies/minimum-system-load-events) | H |
| Air-con snapback | U-2 snapback (Q-53) | Residential snapback as a share of the event's energy: 16.6% at 50% cycling and 35.1% at 100% (SDG&E 2008, over up to 4 h); about 0.5 kW in the hour after a 1.0/0.5 kW two-hour thermostat event (SCE 2019); front-loaded. SCE's 1-in-10 hot-day forecast: about 45% of a 4-h event's relief returns over 3 h, two thirds of it in the first hour | [SDG&E 2008](https://www.calmac.org/publications/08_Summer_Saver_Impact_final_w_Appendix_A_4-1-09V2.pdf) Table 3-3; [SCE PY2019](https://www.calmac.org/publications/SCE0442.01_PY2019_SCE_DR_Program_Report_SEP_Public.pdf) | H |
| Opt-outs and overrides | U-4 patience (Q-54) | 12.9% of 6,389 thermostats overrode 2019 events, more with longer events, hotter days and past DR; the SA hot-water trial lost 0.3% (53 of 18,843) | [Sarran et al. 2021, Energy Policy 153](https://ideas.repec.org/a/eee/enepol/v153y2021ics0301421521001592.html); UNSW/Yildiz 2025 | H |
| Thermal plant reference | F-13 | Coal minimum 30%, ramp 3%/min; OCGT minimum 50%. Starts (hot / warm / cold): coal 60 / 264 / 444 min, CCGT 30 / 115 / 145 min; OCGT 5 min for a 49-MW aero-derivative, 30 min for a 265-MW F-class frame | [Aurecon 2021 cost & technical review](https://www.aemo.com.au/-/media/files/major-publications/isp/2022/iasr/aurecon-2021-cost-and-technical-parameters-review-report.pdf) Tables 4-17, 4-20, 4-23 | H (new-build reference) |
| Existing coal units | F-13 coal ramp, T1 + T2; §8.2 coal ramp | Unit ramps typically about 5 MW/min; hot starts typically 2 h (could fall to about 90 min); about 2 h notice to deload and desynchronise, and to resynchronise | [AEMO 2025 Thermal Audit](https://aemo.com.au/-/media/files/electricity/nem/security_and_reliability/power_system_ops/2025-thermal-audit.pdf) s4.5–4.6, p.47 | H |
| Return after a coal-unit trip | S-11 / D1 lockout | Loy Yang A4, 8 Jan 2024: tripped twice, coming back about 3.1 and 3.6 h after each trip; Vales Point 6 out four days in May 2024; Loy Yang A2 tripped on 18 May 2019 and was back on 24 Dec 2019. Real returns run from hours to months; ours (90–150 min) is the quick case | [WattClarity, Hiccups at Loy Yang A4](https://wattclarity.com.au/?p=28122); [WattClarity, Where's Loy Yang A unit 2?](https://wattclarity.com.au/?p=10718) | M |
| Largest real load trip | F-13 smelter | Boyne Island potline 2, 256 MW (2021) | Callide report s6.1 | H |
| Alarm rates | K-8 | ≤1 alarm per 10 min steady; >10 per 10 min is a flood | EEMUA 191 / ISA-18.2 via [summary](https://seqent.com/blog/alarm-rationalization-explained/) | M |
| Alarm acknowledge | K-8 ACK, SILENCE | States Normal, Unacknowledged, Acknowledged, Return-to-normal; acknowledge is the operator's confirmation of recognition; silence stops only the sound | IEC 62682:2014 (ISA-18.2); [OPC UA Part 9 v1.05](https://reference.opcfoundation.org/Core/Part9/v105/docs/3) | H / M |

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
| **Seasons: one typical day a month, from April 2027.** | the drawer | `light-seasons` |
| **Cooling load: 100 MW per °C above 22 °C, in a straight line.** | the "?" drawer | `cooling-slope` |
| **The dispatch spills wind and solar automatically, pro rata.** | `#stack` | `auto-curtailment` |
| **Minimum down time runs from breaker open to the next START.** | `#lever-coal` | `min-down-time` |
| **Automatic directed shedding when the FOS timers run out.** (GRIDWATCH's own rule, H-18) | `#key-shed` | `directed-shedding` |
| **Reserve diesel: a 20-minute lead, paid only for the MWh it runs** | `#key-rert` | `rert-terms` |
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

Do not state these as fact in-game until they are checked. Each line says what the realism audit of 2026-10-16 searched; what it confirmed moved to §8.1, and what it found to differ moved to §8.2. Two values with no real counterpart are labelled as game values instead of listed here: the air-con price of $400/MWh relieved (`city-levers`: "The ladder is ours"; real air-con programs pay a sign-up reward, and one retailer pays households $2,000/MWh: §8.1 "Household event pay") and the MSL3 floor of 1,000 MW (`msl-tiers`, scaled up from §8.1 "Islanded security floor").
- the size of pre-cooling (U-2, Q-53: +50% of the relief in the hour before). Searched demand-response program evaluations: SCE's 2019 thermostat program found no pre-cooling effect; other studies give annual energy or peak cuts, not the energy added before an event;
- forecast σ by horizon (L-2): the band's widths. Searched AEMO pre-dispatch, its 2024 Forecast Uncertainty Measure (MW shown only in charts) and UniSA-AEMO 2025: these give the shape (§8.1 "Forecast error by lead time"), not a σ;
- the size of the weekend demand factor (P-3: ×0.92 all day). Searched an Adelaide 1997–2007 study, WattClarity and AEMO's methodology: weekends run lower, most of all at dawn; no source gives a size;
- the 1.9-GWh soak cap and its split by suburb (U-1, U-2). ARENA's SA trial puts a tank at about 2.4 kW, so 480 MW is about 200,000 tanks; the daily energy is unsourced;
- the T1/T2/T4 split of start and stop times by plant class, and any hydro start time (F-13). The FSIP covers fast-start units only; AEMO's 2025 Thermal Audit and Aurecon 2021 give totals only;
- today's NEM VPP total (Phase 3). AEMO's 2025 VPP forecast report gives none; "hundreds of MW" holds to 2025: check again before the VPP lever ships;
- the rooftop reconnection ramp for region Australia A (P-12, H-8). Read only in Horizon Power's 2025 requirements for region Australia C, citing AS/NZS 4777.2:2020: 16.67% of rating a minute; the standard itself was not read;
- patience magnitudes and the response scaling (U-4, Q-54): game tuning; not searched;
- the light seasons' heating load (Q-127: 85 MW per °C below 15 °C on the hour, weighted to mornings and evenings) and the winter peak it gives (about 7.1-7.4 GW against late summer's 7.7): game values, not searched; the month table's sun times and solar peaks are computed for about 38° S, not taken from a source.

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
| Q-108 | **The ladder shows one scripted shift** (2026-10-16): did nothing, the better of the lean and competent scripts as "a scripted shift", par and YOU. (Y-11) | Either script collapses on some days (competent below lean on 134 of 365 dailies), and a row named "competent" below "lean" would mislead a stranger. | W6 |
| Q-109 | **The week ahead goes on the end card** (2026-10-16), not the briefing: "THE WEEK AHEAD: Sat mild · Sun storm · Mon HEATWAVE …". (D-28; amends Q-103's placement) | The briefing is 52-60 words against D-3's 60-word cap; on the end card it is a reason to come back tomorrow. | W6 |
| Q-110 | **A storm or low-wind day's briefing says so** (2026-10-16): "Storms likely later." / "Low wind likely later." on the day's line, the week ahead's word, no time. The 60-word cap "doesn't matter really". (D-28, D-3) | Without it, a player who read yesterday's week ahead knew more than a first-timer, and the day's own briefing said nothing of what the card promised. | W6 |

The owner's answers to the open-questions brief (`decisions/2026-10-16-open-questions.md`), 2026-10-20. The owner took the brief's recommendation on every in-game question ("Your recommendations") and chose the switch-over but not telemetry yet. The brief's number is in brackets.

| # | Decision | Why | Builds in |
|---|---|---|---|
| Q-111 | **One SOAK THE CITY booking** [1]: one press books every free suburb's hot-water soak at the line's time; the suburb card keeps per-suburb CANCEL and BOOK for trimming; the decision count counts presses, not inputs. | Six identical free clicks are a chore; a distributor's ripple control moves all its hot water with one signal. | W7 |
| Q-112 | **TRIP SHEDS, a fifth N-1 word on the desk** [2] when the trip preview falls below the first UFLS stage ("would fall to 48.99 Hz: the relays would shed 2 districts"), with a minimum display time; no sim change. | TIGHT covered everything from a comfortable margin to "the next trip sets off the relays", so an amber word sat beside a red preview. | W7 |
| Q-113 | **A quiet alarm board** [3]: plain words on the tiles, and a tile lights only when the player can act (N-1 at SHORT, SHEDDING or TRIP SHEDS; PEAK retired). | On A-grade days N-1 INSECURE was lit 661-753 of 990 minutes; the north star promises a dark board at the peak (EEMUA 191: every alarm needs an action). | W7 |
| Q-114 | **Prices on both sides, only in "? IF PRESSED"** [4], when the player reaches for the GUARD or a STOP. A weak call. | The trade is 40-100 to 1 for the GUARD, so pricing every ask only says "obey"; shown at the control, the price is the lesson. | W7 |
| Q-115 | **FOCUS until the dip recovers** after a restore, with one caption, and **SYNC offered on HAND days only** [5]; START on a spun-up unit still opens the scope on AGC days. | The player saw the cold-load fall but never the recovery; a hand close mattered on 0 of 100 dates (Q-89) and the offers cost 15-24 real s. | W7 |
| Q-116 | **One "when is this unit on" function** [6]; the three "what is short ahead" checks stay separate and named. Par and the system must not move. | Seven copies disagreed in HAND mode (the line said 45 minutes, the Live Stack 49). | W7 |
| Q-117 | **The SCORE chip is hidden until 21:00** [7], then counts up with the night strip. (Built: the chip keeps its place with FROM 21:00 and from then shows the night strip's running score, not a count from zero: a number shown must be true.) | It wandered for reasons the player could not see, and read 1001 ten minutes before the lights went out. | W7 |
| Q-118 | **Rank names beside the letter, everywhere** [8]: D TRAINEE, C SHIFT OPERATOR, B SENIOR OPERATOR, A SHIFT SUPERVISOR, A★ MARG'S CHAIR, BLACK START CREW for a black grid. | People repeat titles; following the coach misses the ★, so the chair means outplaying her. (Measured on the build: the line follower reaches the chair on 46% of sampled dailies, so the premise does not hold yet; §9.2 item 2.) | W7 |
| Q-119 | **What par did that you didn't** [9]: up to three factual lines under the end card's key moment, and par's GUARD tried on your trip with the existing replay. D-22 (30 re-runs) is retired; one measured re-run may follow gate 1. | 30 re-runs do not fit the night roll; tied to the loss, three facts are sharp, and every number comes from code that already runs. | W7 |
| Q-120 | **A carbon choice, after a count** [10]: STOP quotes include the carbon the score charges; the line offers "coal off until tomorrow" only if a count shows it pays on enough days. The weakest call. | Carbon is 36-53% of par's cost but players moved it by 1.3% at most, and the line and the score counted costs differently. | W7 |
| Q-121 | **The briefing says "Expect a trip at the peak."** [11] on a day whose plan has the evening trip; the sim does not change. (Built as "Expect a trip during the evening peak.": Marg names the peak's minute, and the trips come a median 70 minutes before it.) | Returning players knew; the fun is anticipation (the test is coming, not the minute), and real operators always plan for the biggest single failure. | W7 |
| Q-122 | **Late summer through gate 2; light seasons before the April 2027 dailies** [12] (a month table of sun times, solar output and heatwave share). | Seasons pay off for players who return for weeks, which gate 2 measures; an April heatwave would break realism. | Later (before 2027-04) |
| Q-123 | **Phase 5 (week mode) is cut; from Phase 3 only a region-wide VPP, built only on evidence** [13] that midday is dead time; the rooftop backstop becomes a 14 March anniversary daily. | The evening already has 11 decisions against 8-12; week mode's best idea, the outlook, ships as D-28. | — |
| Q-124 | **O-4's concept cards and O-5's "why?" are cut; Marg gets three first-time lines** [14]: negative prices, coal stuck at minimum while solar spills, the first relay shed. | Lessons land best in a character's voice in the moment, and Q-101 ruled out new pauses. | W7 |
| Q-125 | **Verify, then restamp** [15]: a verify run replays par on every listed daily and, when everything matches, rewrites only the stamps; the classic golden moves out of the test suite into a tool check. | SIM_VERSION changed 13 times in 16 days at 25-40 minutes each, and the last runs changed only hashes and the stamp; a hand-bumped BALANCE_VERSION could grade everyone against the wrong par. | W7 |
| Q-126 | **The switch-over** [17] (F-14): the game moves to `index.html`, `next.html` redirects, COPY LINK copies the root, `classic.html` gets a banner. Telemetry [16] waits: it needs the owner's Cloudflare account and a privacy notice. | Gate 2 then tests the exact address that launches. | W7 |
| Q-127 | **Light seasons, built now** (2026-10-21, the owner: "next feature please", then chose "Light seasons" from the options put to them): from 1 April 2027 each month plays one typical day of its own (sun times, solar and rooftop output, temperatures, demand with winter heating, the heatwave and mild shares, no air-con on a cold day). The dailies before April keep the late-summer day they were gated on. | Ahead of Q-122's deadline, the last unblocked feature; an out-of-season heatwave would break the realism rule from April. Variety for players who come back for weeks. |
| Q-128 | **MARG'S CHAIR needs a clear win over par** (2026-10-21, the owner chose "Margin above par"): the ★ is 1,040 points or more (`app/score.js` STAR_POINTS), tuned so the coach-follower sits in the chair on 13% of dailies (56% at 1,000). Par itself is an A, SHIFT SUPERVISOR. History entries keep the ★ they were given. | The chair should mean outplaying the coach; following the line now earns A SHIFT SUPERVISOR. |
| Q-129 | **Five more anniversary dailies, two of them in winter** (2026-10-21; the owner chose "Winter anniversaries" when asked for the next feature): 25 Jan (Victoria 2019), 30 Jan (Melbourne 2009), 31 Jan (Heywood 2020), 15 Jun (the market suspension, 2022) and 25 Aug (QNI lightning, 2018), each a sourced account and a variant of its date's day. | Seasons made winter incidents playable; a real story on the day it happened is the daily's best hook. Softened where par could not win (one coal unit out, not two). |

### 9.2 Open questions for the owner

The fifteen questions the review raised were answered on 2026-10-20 (Q-111–Q-125 in §9.1), and MARG'S CHAIR on 2026-10-21 (Q-128). Still open:
1. **Telemetry (Y-10).** The brief (`decisions/2026-10-16-open-questions.md` §16) recommends a Cloudflare Worker writing to D1. It would be anonymous: no IP, no browser details and no stored id, with this browser's streak and dailies played sent instead. Each day played is 1-2 KB. There is an opt-out in SETTINGS, it is off when the browser asks not to be tracked, a one-line notice says so, and only records that replay to their stated hash count. It needs the owner's Cloudflare account and C-1's exception. The alternatives are Supabase (it pauses after a quiet week), Apps Script into a Sheet (it drops records in a spike), or keeping a random id for retention curves.

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

**Local run.** `.claude/launch.json` serves the repo (`py -m http.server 8642`) at <http://localhost:8642/> (the game is `index.html` since Q-126). ES modules need http; never `file://`.

**Headless first** (`CLAUDE.md` holds the rules):
- `node --test` runs the suite (916 tests, about 45–75 s); `npm run test:changed` runs only the tests a change can affect.
- `node tools/play.mjs <seed> ...` plays the real page headless by jumping the sim between moments (`--help`). A day takes seconds.
- `tools/par.js` (par and the proxies on any seeds), `tools/follow.mjs` (the hint-following player), `tools/daily-gen.js` (writes `content/dailies.js`), `tools/baseline-v4.js` (the classic day's golden, now a tool check: `npm run golden:v4 -- --check`), `tools/verify.mjs` (par on every daily, then the restamp, Q-125), `tools/perf.mjs` (frame cost, sizes). These are statistics: run one only when the change is about balance or par, once.

**The browser** is for one final visual check of a slice, by the integrator, in one pane (the owner's PC runs out of memory with more): resize to 1280×720 (and 1280×600 for K-17), serve each pass on a fresh port (the pane caches modules), draw a few frames before every click. `?perf` shows frame costs; `?debug` exposes `gridwatch`.

**Playtests:** W2, W5 and gate 2, with a one-page log per tester.

---

## 11. Release checklist

**Every slice:**
- [ ] `<meta charset="utf-8">` first in every HTML file (C-2; test); in-page resets only (C-3)
- [ ] No request to another origin; no build step (C-1)
- [ ] `node --test` green; the classic golden re-recorded only when intended
- [ ] After a `SIM_VERSION` change: `npm run verify` (Q-125, about 10-12 min) restamps `content/dailies.js`, `content/ladder.js`, the anniversaries and the selftest when no graded value moved; otherwise the full regeneration it prints (`tools/daily-gen.js`, then `node tools/ladder.mjs -j 6`, then `node tools/selftest-gen.mjs`). A stale stamp cannot merge.
- [ ] §6 rows the slice moves re-measured and pasted into the PR
- [ ] Decisions written into the rules they change and into §9.1, in the same PR (Q-104)
- [ ] At a release: BUILD bumped in `app/build.js`, `version.json` and the eight carriers (F-9; `tests/version.test.js` names any missed); after a `SIM_VERSION` change, the selftest restamped by `npm run verify` when nothing graded moved, or by `node tools/selftest-gen.mjs` after the ladder when the full regeneration runs (risk 5)
- [ ] Pushed to `main`; Pages green; the live site checked (`curl -sI https://databerryau.github.io/gridwatch/` and a played day)

**W1:** X-39–X-49, K-15, D-27, S-5, H-18, D-3 and D-7 accepts met; one browser pass at 1280×600 and 1280×720 (X-47).
**W2:** two logs; pass or the top issue fixed and re-checked.
**W3:** D-20, D-21, D-24 (cards fact-checked), D-25 (≤45 s), D-26 and L-10 accepts met; D-2 measured to the verdict.
**W4:** K-24, O-3, O-6 and O-8 accepts met; the first shift played through in the browser.
**W5:** gate 1 passed.
**W6:** `dailies.js` covers ≥365 days with par's totals (F-8); the share card pasted into two messaging apps; the link unfurls and a phone gets the landing page; `?selftest` in Chrome, Edge and Firefox; gate 2 passed (the owner's checks and their record: `playtest/release-checks.md`; the gate: `playtest/gate2-README.md`).

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
