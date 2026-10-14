# GRIDWATCH review — lens: the stranger's first five minutes

Build reviewed: `main` at 52da14a (v4-core-2c.1), read-only, headless only (`tools/play.mjs`, `tests/lib/play.js`). No browser, no server, no slow tools. The map, the Live Stack, the sound and the lever animation are invisible headless; everything below is what the DOM says the player reads.

## 0. Method

Four days were played three ways each:

| Player | What they do | Seeds |
|---|---|---|
| **Enter-only** ("the hesitant stranger") | `timeline=04:30-04:00/30m`: presses Enter at every card, nothing else | 20261014 (first shift), 20261014 `--returning`, 20261017 (weekend), 20261014 `--hand` |
| **Obedient** ("the stranger who does what the line says") | scratch script `obey.mjs` on the real driver: whenever the objective line is an ask (`▶ ACT NOW`, `‼ URGENT`, `◇ SAVING`, `◇ BATTERY`, `◷ PLAN`, `◇ SUBURB`), it does exactly that one thing (START = two clicks on the unit's guard button, as the briefing instructs; GUARD, battery, STOP, soak, DR through the page's own `actions.input`), presses Enter at every card, touches nothing else; par runs in-page (`par: true`) so the end card shows the real SCORE | 20261014, 20261017, 20261014 `--hand` |
| Probes | `--no-run look`, `hover=`, `press=`, `until=card key=Escape`, `key=h`, `key=g`, `clock` | 20261014 |

Script path: `obey.mjs` in the review session's scratch folder (not in the repo); full transcripts in `scratchpad/tl-first.txt`, `tl-returning.txt`, `tl-weekend.txt`, `tl-hand.txt`.

## 1. The five minutes, moment by moment (seed 20261014, first shift, AGC)

Real seconds are from the Space that runs the clock (`clock` step; the D-2 profile puts 04:30→06:00 at 540× = 10 s, 06:00→09:00 at 270× = 40 s, 09:00→11:00 at 480× = 15 s, 11:00→14:30 at 300× = 42 s, 14:30→16:30 at 240× = 30 s, 16:30→20:00 at 150× = 84 s, 20:00→21:00 at 300× = 12 s, the night at 2,100× = 12 s; `sim/params.js:349`).

### 1.1 Before Space: the briefing (0 s, clock held at 04:00 → 04:30)

What the card says, verbatim (`next.html:203-216`, `app/shell.js:116-118` GOALS_TEXT, `shell.js:371-376`):

> **Tonight's desk.** You decide which power stations run, and when. The dispatch system sets how hard each running unit works; you start more before the city needs them, and stop them when it does not. A coal unit takes two hours to reach the grid, a gas turbine ten minutes.
> Keep the lights on, cheaply and cleanly. Your score is one total: supply's cost, plus $30,000 for each MWh dark that is yours (a feeder under repair becomes yours at its hand-back), plus $80 a tonne of CO₂: regulators' values of reliability and emissions. Par, GRIDWATCH's autopilot on this day, scores 1000; a smaller total scores more.
> The line above the desk says what is needed next. To start a unit, click its ○ button on the lever bank (hydro units: beside the HYDRO wheel); it turns into START?, so click it again to confirm. Keys: 1–5 pick a lever (6 the HYDRO wheel), then S S. The battery's outer ring is its GUARD: MW held back to catch a trip. Space pauses at any time, and you can act while paused; the clock is held until you first press it. EXPLAIN (W), beside the alarms, holds the clock and explains each one. ? (top right) shows what GRIDWATCH simplifies.
> Today: a mild weekday. Rooftop solar will cut the demand your plant must meet around midday; the evening still climbs. Watch for: HAR4, HAR3 feeders back 06:55, 07:15; tie import ≤ 500 MW until 11:15.
> Seed 20261014 · AGC is on by default; HAND turns it off from 04:30 to 21:00.
> [AGC] [HAND]                                   [TAKE THE DESK]

Word count (measured): intro 48 + goals 57 + how 103 + day/watch 35 + seed 16 = **259 words**. SPEC §4.1 row 0:05 says "Briefing card (≤60 words)" with a goal line and one line from Marg. The desk under the card is blank (`CLOCK 04:00 | PAUSE 0× | COST - c/kWh`, empty guard faces).

Is the goal clear in 20 s? The goal sentence ("Keep the lights on, cheaply and cleanly") is the first sentence of the second paragraph, after 48 words about dispatch and start times, and is followed by VCR/VER prices and "a smaller total scores more" (a stranger reads "smaller … scores more" twice). A stranger skimming for "what do I do" lands on paragraph three, a 103-word key-binding manual. The weekend card adds "Demand is lower at the weekend, and one coal unit has been off since Friday night. Watch for: RED5, RED7 feeders back 07:00, 07:50; COAL 4 out until 12:15."

### 1.2 TAKE THE DESK (still held): the first real action is available at 0 s

`node tools/play.mjs 20261014 --no-run look`:

> `CLOCK 04:30:00 | PAUSE 0× | LIGHTS ON 100% | COST 3.4 c/kWh | CO₂ 0.70 t/MWh | ALL-IN 9.0c`
> `LINE ▶ ACT NOW You will be 150 MW short from 06:25 (the tie limited to 500 MW until 11:15). Start CCGT 2 now: it takes 49 min to reach the grid. · Clock held: press Space to run (you can act while paused).`
> `N-1 ! TIGHT SPARE IN 5 MIN ✓1339 RISK: COAL 1 530 ! 49.30 Hz · U 49.30 L 49.30`
> `TRAY ! NETWORK 04:00 Overnight faults: feeders HAR4 and HAR3 under repair, handed back at 06:55 and 07:15. TO THE RESTORE BAY || ! MARKET NOTICE 04:00 Network outage: tie imports limited to 500 MW until 11:15. TO THE TIE`

The ask is clear, names the unit, the lead time and the reason, and the clock is held, so O-2's "≤60 s to the first real action" is met trivially. The control is `guard-start-ccgt2 "○2"` (the owner's known open face). Hovering it: `LINE ? IF PRESSED START CCGT 2: at minimum load (175 MW) by 05:19, 49 min from now, and it must then run 4 h. It covers the shortfall from 06:25.` First click: `● ARMED Press again to confirm.` Second: `✓ UNDER WAY CCGT 2 is starting: full speed at 05:05, at minimum load by 05:19.` plus a tray card. This is good: the first action teaches the guard, the lead time and the plan in three lines. (`press=guard-start-ccgt2` ×2 transcript.)

Note `LIGHTS ON 100%` here becomes `99.9%` from 06:55 for the rest of the day even on a perfect run, because the network's overnight outage counts in the chip once handed back; a stranger who did everything right sees "99.9%" and wonders what they missed.

### 1.3 The opening 40 real seconds: the densest part of the day

Obedient run (`obey.mjs 20261014 --par`), inputs with real seconds from Space:

```
@04:37:39 (0.9 s)  START CCGT 2 (two clicks on guard-start-ccgt2)
@06:14:23 (20.6 s) GUARD 400            <- "Raise the battery GUARD to 400 MW" (the unlabelled ring; G then 8 arrow presses, or a drag)
@06:46:51 (27.8 s) SOAK Solstice Rise   <- "◇ SUBURB (H) ... Book a HOT WATER SOAK in Solstice Rise, 11:00–15:00"
@06:55:00 (30.4 s) Enter at the feeder card   <- clock HELD
@07:00:35 (33.3 s) START HYDRO 3        <- "Start HYDRO 3 (7 min): it spins for free and adds spare"
@07:15:00 (37.4 s) Enter at the feeder card   <- clock HELD again, 7 s after the first
```

Six inputs on four different controls (guard, ring, suburb card, card) and two clock holds in 37 s, in the stranger's first minute on an unfamiliar desk. SPEC D-10 asks Act I for 3–5 decisions; O-3 asks "at most one introduction per 20 real s". The two hand-backs are 20 grid-min apart (Q-68 allows ≥15), which at 270× is 4.4 real s; the second card lands while the stranger is still reading what the first one did to the dial (see 1.4).

Then: 37 s → 64 s nothing asked; 64–72 s three optional cost asks (`◇ SAVING CCGT 2 is not needed until 17:35. Stop it: saves about $57,000 if nothing trips before then. Start it again by 16:45.`, `◇ BATTERY … Charge it at 70 MW now`, `◇ SAVING CCGT 1 …`); 72 s → 95 s nothing; 95–124 s the first watch and card (desk locked, see 1.5); 124 s → 161 s nothing (`◷ PLAN Next: start CCGT 2 by 16:15 for the evening`); 161–219 s six STARTs about 10 s apart (the evening beat: CCGT 1, CCGT 2, GT·A, GT·B 1, GT·B 2, plus `DISCHARGE 100`); 219–250 s `✓ STEADY Enough plant is committed for the rest of the day. Highest demand ahead: about 6,600 MW at 19:30.`; 250–261 s the second watch (compact) and card; 265 s START GT·C 1; 266–295 s STEADY; 295–307 s the night roll. **Shape: overload at 0–40 s, 90 s of near-nothing in the belly with a locked 29-s watch in the middle, then a pleasant 60-s beat of starts, then 40 s of STEADY.**

### 1.4 The feeder cards (06:55 = 22.2 s, 07:15 ≈ 27 s after Space)

> `CLOCK 06:55:00 | HELD 0× · R restore · Esc on`
> `FEEDER HAR4's feeder in Harbourside is repaired: about 240 MW with its cold load. R or Enter: restore it now · Esc: go on` / `Gone on, it stays dark and is yours: the RESTORE bay still has it.`
> `TRAY ! NETWORK 06:55 HAR4 feeder repaired and handed back: close its breaker (R or Enter at its card, or from the RESTORE bay).`

With the card up, pressing W (EXPLAIN) shows the plan line underneath, which says something different: `LINE ▶ ACT NOW 2 districts are dark (HAR3 under repair until 07:15) and the permissive lamp is lit. Close a feeder: R, then Enter.` (`app/objective.js:865` "R, then Enter" vs `app/watch.js:205` FEEDER_KEYS "R or Enter").

After Enter (1 real s later): `DIAL ! 49.849 Hz CHANGE falling`, `BALANCE SHORT 100 MW held up by spin 110 · battery 20`, `tile-underFreq "! UNDER FREQ"`, gauge `BAND LOW 5 MIN`, `btn-ack "◆ ACK"`. The stranger's first obedient act lights an alarm (P2, no horn: `app/alarms.js:61`). Nothing says "that is the cold load; it will recover" — the line has already moved on to `Start GT·C 1 now`.

**The Esc trap, measured** (`until=card real=0.5 key=Escape … to=+1h … key=Escape to=+2h`): a stranger who reads "Esc: go on" as "dismiss" sees `ALL-IN 9.0c` become `21.7c` by 07:15 and `115.2c` by 09:15 (two feeders, about $7M an hour at VCR), `LIGHTS ON 96.4%`, and the line thereafter says only `2 districts are dark and the permissive lamp is lit. Close a feeder: R, then Enter.` Nothing on the card says what "go on" costs.

### 1.5 The first watch (12:19, ≈95 s after Space): 29 s of locked desk on a non-event

This daily's Act II crisis is the tie trip (15% of calm days, `content/scenarios.js:245`), while the city is exporting 300 MW. Full first-time watch transcript (`until=trip brief real=4 …`):

> `CLOCK 12:19:00 | WATCH T+0.02 s ×0.15` `LINE ◉ WATCH The tie line has tripped. The desk is locked while the grid catches itself: watch.`
> `WATCH T+0.02 s ×0.15 | Load is lost. Stored spin in every turbine soaks it up. Frequency rises. | INERTIA → BATTERY → GOVERNORS → UFLS → SETTLE`
> `WATCH T+0.60 s ×0.15 | Solar and wind back off 147 MW; governors close.` … `T+3.00 s ×1 | … The rise stops at 50.196 Hz.` … `T+20.06 s ×10 | Droop parks frequency above 50. Restoring fifty is AGC's job, and yours.`
> `CARD PEAK 50.196 Hz: contained within 49.5–50.5 Hz ✓. Back to 49.85–50.15 Hz within 5:00. Caught by: spin → battery took 109 MW → load picked up 4 MW → solar and wind backed off 188 MW. N-1 SECURE: the fleet can take the next trip. Enter (or a click) to take the desk · W explains each alarm (the clock holds).`

Enter during it does nothing (`The first watch plays through: Esc skips from the next trip`, `app/shell.js:286`). `clock`: `WATCH 1x +28.9 (29.0 real s)`. The chain the ribbon narrates (INERTIA → BATTERY → GOVERNORS → UFLS) is the under-frequency chain; here nothing falls, the GUARD never fires, "Load is lost" is said of an export, and the pin reads "PEAK". The director gives the full watch to whichever trip comes first (`app/director.js:101`: `d.version = !d.seen.watch || newRocof ? 'full' : 'compact'`), so the real moment of this day, the 19:19 CCGT 1 trip (nadir 49.515 Hz, battery 419 MW, governors 174 MW on the obedient run; 48.65 Hz and UFLS 814 MW on the Enter-only run), gets the 10.5-s compact watch with the ribbon words only (`WATCH T+0.02 s ×0.5 | INERTIA`, `T+1.50 s ×0.5 | GOVERNORS`).

### 1.6 The evening (161–266 s): the part that works

Six asks, each `▶ ACT NOW From about 18:15 one trip would leave you short. Start GT·A now: it takes 12 min to reach the grid.`, about 10 s apart at 150×; each START answered with `✓ UNDER WAY`, a tray card, and (when it matters) the `SYNC 30×` badge for 2–3 s with `CCGT 2 at full speed: auto-sync at 05:14 (or SYNC now). TO THE SCOPE` (OFFER term 15.8 s over the day). Then `✓ STEADY Enough plant is committed for the rest of the day. Highest demand ahead: about 6,600 MW at 19:30.` This is the one place a think-aloud tester would say "oh, I see" — the COST chip is falling, the plan is theirs. Then the compact watch, `NADIR 49.515 Hz: contained ✓ … battery 419 MW` — the GUARD they set at 20.6 s caught it, but nobody says "your GUARD".

### 1.7 The night and the end (295–307 s)

`NIGHT ☾ NIGHT SHIFT The night shift has the desk to 04:00: it starts and stands down units and calls demand response as par would.` 12 s. Then the end card (`app/endcard.js:75-95`):

> `Day over: 04:00. SCORE 998 · A | YOU PAR Δ | SUPPLY $4.06M $4.01M +$57.3k 4.1 c/kWh served: the COST chip (par 4.0) | OUTAGES $53 $53 $0 0.0 MWh dark × $30,000 (VCR) | CARBON $4.42M $4.47M −$44.0k 0.56 t/MWh × 99,074 MWh = 55,279 t × $80 (VER) your plants emitted 51,266 t; imports and dark load are counted at your mix | ALL-IN $8.49M $8.47M +$13.2k 8.6 c/kWh · $4.47 per household | Biggest gap to par: SUPPLY +$57.3k (more or dearer plant than par's) | Score = 1000 × par's ALL-IN ÷ yours. Par is GRIDWATCH's own autopilot on this same day. | SAIDI 0.0 min · SAIFI 0.00 · MAIFI 0.00 per household today (par: SAIDI 0.0 min) | Feeders under repair count from their hand-back: the 834.8 MWh dark before it were the network's outage, not priced. No household was off for more than 3 minutes. | Seed 20261014 · v4-core-2c.1 · 271 inputs · hash 0xf665b8cd`
> `[DOWNLOAD REPLAY LOG] [PLAY THIS DAY AGAIN]`

No SHARE, no "moment", no counterfactual (2d/Phase 4 not built). The shareable thing in this build is a hash.

## 2. Three strangers compared

| Run | Inputs | Space → 04:00 | Result |
|---|---|---|---|
| Enter-only, first shift, 20261014 | 4 Enters | 306.8 s (profile 245 + WATCH 57.7 + FOCUS 4 + RESTORE 0.1) | `ALL-IN 158.4 c/kWh`, `OUTAGES $147.99M 4,932.9 MWh dark`, `SAIDI 48.3 min`, 9 districts dark at 19:19 (UFLS 814 MW on top of directed shedding from 18:30) |
| Enter-only, returning | 4 | 288.3 s (WATCH 39.2) | same day, same catastrophe |
| Enter-only, weekend 20261017 | 3 | 277.9 s (one trip) | `ALL-IN 146.4c`, `$125.58M` outages, `SAIDI 43.6 min` |
| Enter-only, HAND | 7 | 558.5 s (profile 478, 3 trips) | `ALL-IN 290.4c`, `SAIDI 93.7 min` |
| **Obedient, 20261014** | **18** (8 STARTs, GUARD, 2 STOPs, CHARGE, DISCHARGE, SOAK, 4 Enters) | **307.3 s** (WATCH 39.5, card 4, FOCUS 4, RESTORE 1, OFFER 15.8) | **SCORE 998 · A**, 0 MWh dark, biggest gap SUPPLY +$57.3k |
| Obedient, weekend 20261017 | 19 | 288.3 s | **SCORE 1046 · A ★** (beats par: SUPPLY −$369k) |
| Obedient, HAND (pointer moved off after each click) | 18 | 574.4 s | **SCORE 15 · D**, 18,553 MWh dark: the line never asks for the manual SYNC that HAND requires (tray at 05:08: `Riverton CCGT 2 at full speed: ready to synchronise (HAND: manual SYNC). TO THE SCOPE`; the line meanwhile: `◷ SPARE Demand is covered, but losing your biggest unit would not be caught until CCGT 2 arrives at 06:36` → `06:45` → …, then at 07:02 `▶ ACT NOW Frequency is high: the battery GUARD is still giving its 400 MW after the trip. Turn it down to 0 MW` with no trip having happened) |

The no-input day is meant to fail (SPEC §9.1 Q-18, Q-32), and it does. The obedient day is meant to be "the plan comes together"; it is, and the player never touched a lever, the wheel, the dial, the knob, the Live Stack or the map: every one of the 18 inputs was named, sized and timed by the line.

## 3. SPEC §4.1 against the build

| §4.1 row | Spec | Build (20261014) |
|---|---|---|
| 0:05 briefing | ≤60 words, skyline, goal line, one line from Marg | 259 words, five paragraphs, no skyline, no Marg (2e) |
| 0:20 Marg, cover plates, 8-s pauses | O-3 | none; every control is live and uncovered from 04:30 |
| 0:38 first real action: manual SYNC at 1× | O-2 | first action is a guard click at 0 s while held; SYNC auto-closes 4 grid-min after full speed (`SYNC 30×` offer) and the stranger is never asked to open the scope |
| 0:59 RESTORE at 1×, needle dips, close the second 5 min later | | two FEEDER cards hold the clock at 22 s and 27 s (Q-91); Enter; `! UNDER FREQ` |
| 1:20 Live Stack introduction, GT·A lever to 300 MW | | no introduction; the line asks for STARTs, never for a lever |
| 1:48 belly: pull GT·A lever to zero at 09:15; weather card 09:30; suburb card 10:00 | | `◇ SAVING … Stop it` via the guard; no weather card on this seed (the weekend seed has one at 11:25); the soak is asked at 06:46 for an 11:00 block, and H opens Solstice Rise whatever suburb the line named |
| 2:53 hydro wheel, GT·B/GT·C dragged on the stack, pre-cool | | hydro 3 START asked at 06:56 ("spins for free"); the wheel is never asked for; GT·B/GT·C are STARTs at 17:40/18:03; no pre-cool on a mild day |
| 4:23 the trip: a 650-MW coal unit at 18:40, full watch, nadir 49.60, "YOUR GUARD" | | a tie trip at 12:19 takes the full watch (over-frequency); CCGT 1 at 19:19 gets the compact one; "your GUARD" is never said |
| 4:52 respond card, GT·A's START lights, RESPOND at 30× | | card as specified (no buttons); RESPOND term 0 s on AGC runs (frequency is in band before the card goes) |
| 5:32 release 12 s + night roll 12 s | | night shift strip, 12 s |
| 5:56 verdict, moment, what-if, this-really-happened, SHARE at ≈6:45 | | end ledger (VCR/VER/SAIDI/SAIFI/MAIFI/STPIS), DOWNLOAD REPLAY LOG, PLAY THIS DAY AGAIN; no SHARE |

SPEC §6 "Session, link opened to SHARE: ≤6:00 returning, ≤6:50 first shift" is unmeasurable (no SHARE); the arithmetic here is 307 s from Space for an obedient first shift + a 259-word briefing (60–80 s for a stranger) + four card reads at human pace (+15 s over my 5 s) ≈ 6:25–6:45 to the end card, before any debrief. Adding D-25's ≤45-s debrief puts the first shift over 6:50 unless the briefing shrinks.

## 4. Clock holds and slow-downs a first-shifter meets on 20261014

| When (real s) | What | Held for |
|---|---|---|
| 0 | TAKE THE DESK, clock held until Space | as long as they like (good) |
| 22.2 | FEEDER card HAR4 | until Enter/R/Esc |
| ≈27 | FEEDER card HAR3 | until Enter/R/Esc |
| ≈95 | WATCH (full, unskippable) + RESPOND card | 29 s + until Enter |
| 7 × 2–3 s | `SYNC 30×` offers after each START (OFFER 15.8 s in all) | slow-down, not a hold; the badge changes and a tray card appears |
| ≈250 | WATCH (compact) + card | 10.5 s + until Enter |
| any | W (EXPLAIN), PAUSE, the drawer | optional |

Four hard holds, two in the first half-minute. Each is answered by Enter. A tester will ask "why did it stop again?" at 27 s.

## 5. Jargon census (visible text of the first-shift transcript, CTRL lines excluded)

Hz 159 · MW 91 · N-1 84 · GW·s 61 · CCGT 20 · governors 14 · breaker 14 · tie 8 · feeder 7 · spin 6 · UFLS 6 · DR 6 · directed 5 · AGC limit 5 · lockout 4 · GUARD 4 · permissive 3 · handed back 3 · relays 3 · load relief 2 · cold load 2 · VCR 2 · SAIDI 2 · nadir, VER, STPIS, SAIFI, MAIFI 1 each. Plus the tile faces `HIGH RoCoF`, `UFLS OPERATED`, `AGC LIMIT`, `MIN GEN`, the dial's `SPIN 18.1 GW·s`, the gauge's unexplained `U 49.30 L 49.30` (`desk/gauge.js:134`), `HAR4`, `○2`, `BREAK GLASS $16,000/MWh · 300 MW · 20-min lead`. O-3 says the jargon "(R5, L, LOR, RoCoF, GW·s, P10/P90) sits behind ?"; on this build RoCoF and GW·s are on the faces all day.

What is well said: the objective line's prose ("it takes 49 min to reach the grid", "it spins for free and adds spare", "saves about $57,000 if nothing trips before then"), the BALANCE bar ("SHORT 170 MW held up by battery 140 · governors 30"), the suburb personas ("On off-peak hot water since 1962; has never asked why."), the night strip, the `? IF PRESSED` texts, the refusal notes ("no unit at full speed: START one on the lever bank", "feeder under repair until 06:55", "hold 0.6 s to commit, or hold D").

## 6. What a think-aloud tester would say, by act

- **Briefing.** "Tonight? It says 04:00." "What's AGC/HAND?" (a 50/50 radio with a one-line title; HAND is a D for anyone who picks it, see 2). "Seed 20261014?" Reads paragraph three twice, presses TAKE THE DESK. Does not notice "the clock is held until you first press it".
- **Act I.** "It says start CCGT 2 — which one is that? Oh, the ○2." Click, "START?", click, "UNDER WAY". Smile. Presses Space. The badge says PRE-DAWN 540×. "Raise the battery GUARD to 400 MW" — "which is the battery? which ring?" (no hover text on the ring: `hover=ring-guard` changes nothing). A card: "HAR4's feeder … cold load … R or Enter … Esc: go on" — "go on, sure" (Esc) — or Enter, then "! UNDER FREQ" lights and the needle drops: "did I break it?" Seven seconds later another card. "SUBURB (H)" — H opens Solstice Rise; the line said Old Hazelton; ←/→ are not mentioned.
- **Act II.** "Stop CCGT 2: saves $57,000 if nothing trips" — the first real decision with a risk; most will not dare. Then the desk locks for 29 s: "The tie line has tripped. Load is lost. Frequency rises." — "lost load but it rises?" — then a card of numbers and a "✓". Shrug.
- **Act III.** The beat of STARTs. "✓ STEADY … Highest demand ahead: about 6,600 MW at 19:30." Smile. Then the compact wobble, "NADIR 49.515 Hz: contained ✓ … battery 419 MW". "Was that me?" (It was: the GUARD.)
- **End.** "998, A. … What's SAIDI? Can I send this to someone?" No.

What would have made them smile: being told "your GUARD caught 419 MW of that"; the suburb card's persona line surfacing when the line asks for the soak; one sentence of goal before TAKE THE DESK; the first slow-motion being the fall, not the rise; a share card with a quip.

## 7. Findings

### F1. "Do what the line says" is the whole first shift (design-weakness, high)
Evidence: `obey.mjs 20261014 --par`: 18 inputs, every one named, sized and timed by the line → SCORE 998 · A; weekend 19 inputs → 1046 · A★. No lever, wheel, dial, knob, stack or map was touched. `app/objective.js` names the unit, the MW and the minute in every ask; SPEC §9.1 Q-18 ("says what is needed next … lights that unit's START guard") and Q-28 made it so, as the answer to "SUPER unclear".
Why it matters: it gets a stranger to an A, which is what we want on day one, but what they would say they did is "I clicked what it told me to". Pillars 1 and 2 (desk as instrument, the plan comes together) are not experienced; the second daily is identical. There is no O-1 "I've done this before" switch.
Proposal (M, challenges Q-18's phrasing not its substance): keep the prescriptive line on the first shift; from the second daily (or after an A) show the problem without the answer (`▶ 150 MW short from 06:25 (tie limited to 500 MW)`) and light the candidate guards; `? IF PRESSED` keeps teaching. A header toggle COACH / PROBLEM / OFF (persisted) is S. Real NEM: the operator sees LOR forecasts, not a named unit to start — the "problem" form is the realistic one.

### F2. The feeder card's "Esc: go on" is a $7M-an-hour trap with no price on it (design-weakness, high)
Evidence: `until=card real=0.5 key=Escape … to=+1h brief … key=Escape to=+2h brief`: ALL-IN 9.0c → 21.7c (07:15) → 115.2c (09:15); card text `app/watch.js:205`; Q-91 (`desk/README.md:3580`). Also the contradiction under the card: `app/objective.js:865` "Close a feeder: R, then Enter" vs the card's "R or Enter".
Proposal (S): the Esc option says its price ("Esc: leave it dark — about 240 MW of homes, $7M an hour, yours from now"); the card's primary is RESTORE (Enter), the secondary a labelled LEAVE DARK button; fix objective.js:865 to "R or Enter". Real NEM: a DNSP restores a repaired feeder as soon as the network hands it back; leaving it dark on purpose is not a thing — so "go on" should be the odd choice, not the easy key.

### F3. The full first-time watch is spent on the midday over-frequency tie trip; the evening fall gets the compact one (design-weakness, high)
Evidence: `until=trip brief real=4 …` transcript (§1.5); `clock`: WATCH 29.0 s then 10.5 s; `app/director.js:101-103` picks `full` for the first contingency of any kind; on this daily Act II is `tie` (`content/scenarios.js:245`, 15% of calm days, 30% under heat). The ribbon INERTIA → BATTERY → GOVERNORS → UFLS → SETTLE and SPEC §4.6's five beats describe a fall.
Proposal (S): `full` only for the first contingency with `lostMW > 0` (or the first whose extreme is below 49.85 Hz); an over-frequency first trip plays compact with its own two-line ribbon (SPIN → INVERTERS BACK OFF → SETTLE). Keep Esc-skips-from-the-next-trip. Real NEM: an export tie trip does raise frequency; the slow-motion just belongs to the fall.

### F4. Act I is overloaded: six inputs and two clock holds in the first 37 real seconds (design-weakness, high)
Evidence: §1.3 timestamps; feeder cards at 22.2 s and ≈27 s (`to=06:55 clock`); Q-68's `gapMin: 15` (`content/scenarios.js:241`, README:3557) is 3.3 real s at 270×; the soak is asked at 06:46 for an 11:00–15:00 block (`obey` LINES SEEN 27.8 s) while the belly from 72 s to 161 s has nothing to do. SPEC D-10 (Act I 3–5, Act II 5–8), O-3 (one introduction per 20 real s).
Proposal (S): (a) one held card per day — the second hand-back arrives as a tray card plus the bay's glow, or both feeders share one clearance on a first shift (Q-68 already allows it for 2e); (b) the SUBURB ask waits until the belly (≥09:30), where it fills dead time and the map is glinting; (c) Q-68's gapMin in real seconds (≥10 real s ≈ 45 grid-min at 270×). Real NEM: hand-backs come when crews finish; nothing forces two in 20 minutes.

### F5. No SHARE: the loop ends on a ledger and a hash (opportunity, high)
Evidence: `app/endcard.js:75-95` (DOWNLOAD REPLAY LOG, PLAY THIS DAY AGAIN); END transcript §1.7; north star "then share how your day went"; SPEC §4.7 Y-4 text card; §6 session row "link opened to SHARE" unmeasurable.
Proposal (S–M, ahead of 2d): ship the Y-4 text card now (grade, 12-block sparkline from par's existing series, three marks, one quip from a short table keyed on the day's events) with a COPY button; the debrief's moment/counterfactual can land later. This is the single biggest lift for "a stranger finishes and shares".

### F6. The briefing is 259 words and buries the goal (design-weakness, medium)
Evidence: §1.1 word count; SPEC §4.1 "≤60 words"; GOALS_TEXT `app/shell.js:116`; the 103-word "how" paragraph `next.html:208`.
Proposal (S): a ≤60-word card: one goal line ("Keep the lights on. Start power stations before the city needs them; the line above the desk says what's next."), Watch for, TAKE THE DESK. Keys and the GUARD sentence move to the "?" drawer's first row; VCR/VER/par=1000 move to the end card where they are already explained. Hide the AGC/HAND radio on a first shift (O-3 lists HAND for dailies 2–5) or name its cost ("HAND: you also sync every unit by hand").

### F7. HAND is offered on the briefing but the line never asks for the manual SYNC it requires (defect, medium)
Evidence: `obey.mjs 20261014 --hand --par --unhover`: SCORE 15 · D, 18,553 MWh dark; tray 05:08 `ready to synchronise (HAND: manual SYNC)`; the line at 06:26 `◷ SPARE … until CCGT 2 arrives at 06:36` then `06:45` (it assumes an arrival that never comes), and at 07:02 `▶ ACT NOW Frequency is high: the battery GUARD is still giving its 400 MW after the trip` with no trip; the briefing radio title `title="Fly by hand: no automatic trim from 04:30 to 21:00 (harder)"` (`next.html:212`).
Proposal (S): on HAND the line's next ask after full speed is `SYNC CCGT 2 now (C)`; the "after the trip" GUARD line checks for a contingency; the HAND title says "no AGC and no auto-sync". Or hide HAND until the second daily.

### F8. Jargon on the always-visible faces (design-weakness, medium)
Evidence: §5 census; gauge line `N-1 ! TIGHT SPARE IN 5 MIN ✓1339 RISK: COAL 1 530 ! 49.30 Hz · U 49.30 L 49.30` (`desk/gauge.js:134`), dial `SPIN 18.1 GW·s`, tiles `HIGH RoCoF`, `UFLS OPERATED`, `AGC LIMIT`, `MIN GEN`; SPEC O-3 "plain faces".
Proposal (S): on a first shift the gauge reads `SPARE IN 5 MIN 1,339 MW · IF COAL 1 TRIPPED: 49.30 Hz — too low`; drop `U/L`; `SPIN` loses the unit; tiles read `RELAYS SHED LOAD`, `FAST FALL`, `AGC AT ITS LIMIT`, `TOO MUCH SOLAR`; the jargon stays in the "?" rows (H-14).

### F9. H opens Solstice Rise, not the suburb the line names (defect, medium)
Evidence: `to=06:47 brief key=h brief`: line asks for Old Hazelton, card shows `SUBURB SOLSTICE RISE`; `app/keys.js:69` `{ui: {do: 'suburb'}}` with no id, `app/game.js:511-515`. The line's only hint is "(H)"; ←/→ are not mentioned anywhere the stranger reads.
Proposal (S): H (and a click on the line) opens the suburb of the current SUBURB ask (`game.objective.action.suburb`), falling back to the last one.

### F10. A resting pointer replaces the plan line with "? IF PRESSED" indefinitely (defect, low)
Evidence: `to=05:00 hover=guard-start-gta1 brief to=06:30 brief`: the plan line is gone for 90 grid-min (≈30 real s) until the pointer moves; `app/game.js:841` comment. A stranger who clicks START and leaves the mouse there loses the morning's asks; it is also what sank the first obedient HAND run (`LINES SEEN (3)`).
Proposal (S): the consider text times out after ~4 s, or draws under the plan line instead of in its place.

### F11. "Your GUARD caught it" is never said (opportunity, medium)
Evidence: the 19:19 card on the obedient run: `NADIR 49.515 Hz: contained ✓ … Caught by: spin → battery 419 MW → governors 174 MW`; the GUARD was set by the player at 20.6 s on the line's instruction; SPEC §4.1 row 4:23 "the label reads YOUR GUARD once the player owns the ring". The one moment the stranger's own earlier decision pays off is anonymous.
Proposal (S): when `caught.guardMW > 0` and the player set the ring, the card says `your GUARD 400 MW → battery 19 MW → …` and the line after the card says `Your GUARD caught the fall; it re-arms in N min`. That is the sentence they repeat to a friend.

### F12. Question for the owner: how many times should the clock stop in the first minute? (question, medium)
Context: Q-91 (the owner's call, 2026-10-13) holds the clock at every hand-back; on 85% of dailies that is two holds within ~5 real s of profile time, both answered by Enter, in the stranger's first 30 s; plus the first watch is unskippable. Options: (a) keep Q-91 as is; (b) hold only the day's first hand-back, the second is a tray card and the bay's glow (the line already asks); (c) a first shift gets one clearance for both feeders (Q-68 already permits it for 2e) and the hold; (d) no hold, feeders restore themselves at the hand-back unless the permissive refuses, and the card is informative. Recommendation: (c) for the first shift and (b) thereafter; the hand-back stays a decision without being the first minute's third interruption.

## 8. Smaller things noticed (not ranked)
- `LIGHTS ON 99.9%` from 06:55 on a perfect day (the network's outage after hand-back): say `LIGHTS ON 100%` while nothing dark is yours, or label the chip.
- The line changes its mind while the stranger reads: 04:30 "Start CCGT 2 now (49 min)" becomes at 05:45 "Start GT·A now (12 min)" when CCGT 2 can no longer make 06:25. Good adaptivity, but a stranger who was about to press ○2 now sees a different unit lit.
- The "?" top-right opens "What GRIDWATCH simplifies, and why" — a ledger, not help. A stranger pressing "?" wants "what do I do".
- `btn-mute "SOUND ON"` names the state (known).
- The SAVING ask is the best-written decision in the game ("saves about $57,000 if nothing trips before then. Start it again by 16:45") and the only one with a real risk; it deserves a visible payoff on the end card ("you saved $108k stopping two units at noon").
- The weekend's first ask at 04:30 is "Raise the battery GUARD to 400 MW": the stranger's first act on a Saturday is an unlabelled ring with no hover text; G then eight ArrowUp presses works (`key=g key=ArrowUp`) but nothing says so.
