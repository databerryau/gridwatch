# GRIDWATCH review, lens: the signature moment and the clock holds

Reader key `trip-moment`. Read-only pass on `main` at 52da14a (v4-core-2c.1), 2026-10-14. Headless play only
(`tools/play.mjs`, `tests/lib/play.js`); no browser, no suite run, no slow tools. Every transcript below can be
re-run with the command shown.

What I read: `app/watch.js`, `app/director.js`, `sim/physics.js`, `sim/clock.js`, `sim/dayplan.js`, `desk/bay.js`,
`desk/gauge.js`, `desk/dial.js` (grep), `app/shell.js` (the watch/card drawing and the key capture), `app/tray.js`,
`app/record.js`, `render/charts.js` (grep), `content/text.js` (the realism rows), `content/dailies.js`,
`content/scenarios.js` (the Act mix), SPEC §1 OD-8, §4.1, §5 K-15/K-16, §7, §9.1 Q-4/Q-46/J-25,
desk/README §2, §32.11 Q-66/Q-85/Q-88/Q-89/Q-91 and the Q-91 stage-C record (§32.11 at 4555–4603), §32.12's
director block, `tests/feeder-card.test.js`, `tests/hold.test.js`, `tests/next.test.js` (the beat test).

What I played: today's daily 20261014 end to end; the 12:19 tie trip and the 19:19 CCGT trip on it, the watch
sampled every real second; six more seeds (20261012, 13, 15, 16, 17, 18) end to end; 20261015's 13:45 coal trip
and 20261017's 17:49 evening trip sampled every real second; the two feeder cards on 20261014 (R at each) and the
restore's FOCUS sampled at half-seconds; a refused restore (20261007 with a trip injected 10 grid-s before RED7's
hand-back, as `tests/feeder-card.test.js` A) through a scratch script that uses the driver only
(`scratchpad/review/refused.mjs`); the 18:30 directed shedding on 20261014 that happens outside any watch.

The owner said nothing in the spec is gospel. Where I challenge an owner decision I name it: Q-91 (the hand-back
holds the clock), K-16/D-5 (RESPOND at 30× until back in band), K-15's fixed watch schedule, Q-89 (SYNC a
flourish), Q-66/Q-85 (which days get a trip), OD-8 (the beat order as the thing to teach).

---

## 0. The short version

The promise is "watch real physics catch the fall when a power station trips", then respond. The physics is honest
and the sim does catch the fall. But what the player is *shown* about it is wrong on the day's most important
trip, the hold after the card is backwards, and the thing people would share does not exist yet.

1. **The beat strip lies on the evening trip.** `app/watch.js rawBeat` lights GOVERNORS at T+0.02 s whenever any
   positive governor or inverter MW exists before the battery acts, because the governors test comes before the
   battery test and never compares the governors with spin. On 20261017's 17:49 trip the caption read "Governors
   open the steam and gas valves" at T+0.02 s while the BALANCE bar read "held up by spin 630", and BATTERY was
   never lit although the battery caught 386 MW, the largest catch on the card. The order inertia → battery →
   governors → relays, the one thing OD-8/K-15 want a player to recall, is shown as governors → relays. A
   one-line fix.
2. **RESPOND's 30× never runs.** On all six seeds the clock report says `RESPOND 0x`. The sim marks the trip
   "back in band" inside the 30-s watch (relays over-correct; contained trips settle inside 49.85), so after Enter
   the clock goes straight to CRUISE 150×. With 2,146 MW dark (20261014, 19:19:30 card) each real second the
   player spends finding the RESTORE bay costs 2.5 grid-min × 2,146 MW ≈ 90 MWh ≈ $2.7M at VCR. Q-91 holds the
   clock for a 240 MW hand-back because 15 s late cost a C; the day's biggest outage gets no such care.
3. **The first watch can be a rise.** Today's daily's first trip is the tie tripping while exporting: "Load is
   lost… Frequency rises", peak 50.196 Hz, "N-1 SECURE: the fleet can take the next trip." Twenty-nine locked
   seconds for a non-event, the beat strip skipping BATTERY, and the tray saying "-300 MW of import lost". 35% of
   belly trips are rises (tie 15%, smelter 20%).
4. **A refused hand-back is a dead stop.** When the feeder card holds while frequency is 0.023 Hz below the
   permissive, R is refused and Esc means "never held again" for that feeder, exactly when the player is
   overloaded (URGENT line up). Four grid-seconds later R would have worked.
5. **Half of every full watch is a static caption after the nadir.** The nadir lands at T+1.8–2.4 s; the 0.15×
   segment runs to T+3 (20 real s) and the 1× segment to T+10 with the caption unchanged from T+3 to T+9.
6. **RESTORE is a formality and its FOCUS ends before the dip bottoms.** Two grid-seconds at 1× show the needle
   start to fall; the bottom and the catch play at 270×. SYNC was demoted because it never mattered; RESTORE's
   pickup is the breaker close that does matter, and it is where the "instrument" feel should go.
7. **The shareable artefact is missing.** The frequency trace exists (`render/charts.js drawWatch`) but only the
   bench draws it; the end card has no trip line; the cheap counterfactual ("with no guard: 49.34 Hz") is one
   `previewTrip` call away.

Holds per day now: TAKE THE DESK, two feeder cards (85% of dates, 4–13 real s apart), one respond card per trip
(one or two), the end. Plus 29 real s per full watch (58 s on a first day with a relay trip, 19% of the
245-s profile). That is six stops in five minutes; the two morning stops are the ones that hurt flow, the two
evening ones are the ones that should hold longer.

---

## 1. What the watch shows, trip by trip

### 1.1 Today's daily, 20261014: the 12:19 tie trip (a rise)

```
node tools/play.mjs 20261014 until=card key=r until=card key=r until=trip look real=1 diff real=1 diff ...
```
(`until=trip` stops at the feeder cards first: they hold the clock, so the two `until=card key=r` are needed.)

```
trip at 12:19:00
LINE ◉ WATCH The tie line has tripped. The desk is locked while the grid catches itself: watch.
WATCH T+0.02 s ×0.15 | Load is lost. Stored spin in every turbine soaks it up. Frequency rises. | INERTIA → …
BALANCE SURPLUS 290 MW soaked up by spin 290
TRAY … ! STATION 12:19 Interconnector tripped: -300 MW of import lost. TO THE TIE
> real=1
WATCH T+0.14 s ×0.15 | Solar and wind back off 45 MW; governors close. | (GOVERNORS lit)
BALANCE SURPLUS 290 MW soaked up by spin 250 · solar and wind 50
> real=1 … T+0.74 s: BALANCE SURPLUS 290 MW soaked up by solar and wind 160 · battery 80   (caption unchanged)
> … T+1.94 s: DIAL ! 50.196 Hz CHANGE +0.007 Hz/s                                          (the peak)
> … T+2.54 s: "… The rise stops at 50.196 Hz."
> … T+3.00 s ×1 … T+9.00 s ×1: caption unchanged, dial 50.190 → 50.118
> … T+10.06 s ×10: Droop parks frequency above 50. Restoring fifty is AGC's job, and yours.
12:19:30 RESPOND-CARD
CARD PEAK 50.196 Hz: contained within 49.5–50.5 Hz ✓. Back to 49.85–50.15 Hz within 5:00. Caught by: spin →
battery took 109 MW → load picked up 4 MW → solar and wind backed off 188 MW. N-1 SECURE: the fleet can take the
next trip. Enter (or a click) to take the desk · W explains each alarm (the clock holds).
```

What a stranger learns from this, their first watch: load was lost, frequency went up, "governors close" at
0.14 s (no governor has moved: `GOV_DEAD` is 0.2–0.5 s; the 45 MW is rooftop and farm inverters), the battery
never had a beat though it "took 109 MW", and at the end there was nothing to do. The lesson of the north star
("catch the fall") is inverted, and the cost is 29 locked seconds in a 307-s day.

The tray's "-300 MW of import lost" is `app/tray.js:86` printing `r.lostMW` with its sign (the tie was exporting
300 MW). The watch says "Load is lost", the tray says import was lost: a contradiction for the one player who
reads both.

The BATTERY beat is skipped because `rawBeat` (`app/watch.js:65–76`) folds the inverters' back-off into `gov`
(`line 71`) and tests `gov > batt` (`line 73`) before `batt > inertia` (`line 74`); on a rise the inverters answer
within a tick, so GOVERNORS wins at k = 1 and the monotonic rule keeps it.

### 1.2 20261015: the 13:45 coal trip (a clean, contained fall)

```
node tools/play.mjs 20261015 until=card key=r until=card key=r until=trip look real=1 diff …
trip at 13:45:00   COAL 1, 230 MW, SPIN 14.9 GW·s
T+0.02–0.60 s  INERTIA  "Stored spin in every turbine takes the hit. Frequency falls."  spin 230 → 140, battery 0 → 80
T+0.74 s       BATTERY  "The battery answers from its own droop. No guard held back."   spin 110 · battery 110
T+1.80 s       DIAL ! 49.700 Hz CHANGE −0.003 Hz/s                                    (the nadir, 49.695)
T+2.10–2.70 s  caption unchanged; BALANCE battery 170 → 140 · governors 90 → 120
T+3.00 s ×1    GOVERNORS "Governors open the valves. The fall stops at 49.695 Hz."
T+4 … T+9 s ×1 caption unchanged; dial 49.867 → 49.955; N-1 goes ✓ SECURE at T+5
T+10.12 s ×10  SETTLE "Droop parks frequency below 50. Restoring fifty is AGC's job, and yours."
13:45:30 CARD NADIR 49.695 Hz: contained ✓ … Caught by: spin → battery 172 MW → governors 52 MW → load relief 7 MW.
N-1 SECURE: the fleet can take the next trip.
```

This is the watch working as designed, and it is good: the dial falls, the bar names who is holding it up, the
beats arrive in the physical order. Two weaknesses even here: the nadir is reached at T+1.8 s (12 real s in) and
the words do not say so until the governors beat at T+3.0 (20 real s in); then from T+3 to T+9 (7 real s) the
caption is static while the dial creeps up. About 15 of the 29 real seconds are after the drama.

### 1.3 20261017: the 17:49 evening CCGT trip (relays operate)

```
node tools/play.mjs 20261017 until=card key=r until=card key=r until=trip look real=1 diff … look key=Enter diff clock
trip at 17:49:00   CCGT 1, 620 MW, DIAL 50.001 before
T+0.02 s  WATCH "Governors open the steam and gas valves. The fall slows." (GOVERNORS lit)   BALANCE held up by spin 630
T+0.14 s  "Governors open the valves; solar and wind give back 7 MW."                        spin 620
T+0.44 s  (same)                                                                             spin 510 · battery 90
T+0.90 s  (same)                                                                             battery 310 · spin 270
T+1.50 s  (same)                                                                             battery 390 · spin 170
T+2.40 s  UFLS "Below 49.0 Hz: relays shed districts to save the rest."                      DIAL ✕ 48.954
T+2.70 s  BALANCE SHORT 290 MW ✕ SHED 378 MW held up by battery 390
T+10 s    SETTLE
17:49:30 CARD NADIR 48.934 Hz: OUTSIDE 49.5–50.5 Hz ✗ … Caught by: spin → battery 386 MW → governors 50 MW →
solar and wind gave back 7 MW → load relief 51 MW → UFLS 323 MW. SHEDDING: 2 districts dark (379 MW): relight them
within 29:30.
> key=Enter
CLOCK 17:49:32 | PEAK 150× …
> clock
… WATCH 1x +28.8 (29.0 real s) + card 1x +1.0 + FOCUS 2x +4.0 + RESTORE 2x +0.0 + RESPOND 0x +0.0 (0.0 real s) …
```

This is the day's signature trip (Q-66: "the evening trip is the game's signature moment"), on a day where the
player did nothing but press R and Enter. The strip told them GOVERNORS from the first tick, through two seconds
in which the battery rose from 0 to 390 MW and spin fell from 630 to 170, then UFLS. The battery, the largest
catcher and the one control the player owns (the GUARD ring), was never named by a beat. The cause: at k = 1 the
rooftop hysteresis release gives `inverterMW[1]` = +7 MW (the fleet was slightly backed off before the trip, which
is the normal state of a peak with rooftop still feeding in), so `gov` = 7 > `batt` = 0 and `rawBeat` returns 2.
On 20261016's 18:49 trip the same happens with `governorsMW[1]` alone ("Governors open the steam and gas valves.
The fall slows." at T+0.02 s). Any evening where governors or inverters are not exactly at rest before the trip
(every under-planned evening, which is the stranger's evening) breaks the order.

Then Enter: CRUISE 150× at once (see §2).

### 1.4 The refused hand-back (20261007, trip at 06:44:50, hand-back 06:45:00)

`node scratchpad/review/refused.mjs` (the driver with `injectTrip`, as `tests/feeder-card.test.js` A):

```
until trip 06:44:50 WATCH
until card 06:45:20 RESPOND-CARD
CARD NADIR 49.312 Hz: OUTSIDE 49.5–50.5 Hz ✗ … Caught by: spin → battery 490 MW → governors 70 MW → … 1 district dark (228 MW).
--- after Enter
CLOCK 06:45:20 | HELD 0× · R restore · Esc on
LINE ‼ URGENT The plan is 600 MW below demand now: discharge the battery at 500 MW, or start GT·C 1 (9 min).
FEEDER RED7's feeder in Redgum Flats is repaired: about 230 MW with its cold load. R or Enter: restore it now · Esc: go on
  Gone on, it stays dark and is yours: the RESTORE bay still has it. Not yet: frequency below 49.9 Hz. Esc goes on;
  the RESTORE bay closes it once its lamp lights.
DIAL 49.877 Hz
--- after Esc
CLOCK 06:45:24 | MORNING RAMP 270× … RED7 dark? true
```

The clock is held at a tick where frequency is 49.877 Hz against a 49.9 Hz permissive (`sim/grid.js:1776`), the
card tells the player the only way on is Esc, and Esc sets `d.fc[id] = Infinity` (`app/director.js:349`): never
held again. The player is at ‼ URGENT with a 600 MW hole; the one feeder the hold was built to protect is now the
one feeder with no hold. desk/README §32.11 at 4599–4603 records this as the owner's open question ("Waiting
also for RESPOND … is the alternative, the owner's call"). My answer is in §4, finding 4.

### 1.5 The lights going out with no watch (20261014, 18:30)

```
node tools/play.mjs 20261014 until=card key=r until=card key=r until=card key=Enter jump=18:29:50 look real=1 diff …
CLOCK 18:29:50 | PEAK 150× … DIAL ✕ 49.280 Hz … N-1 ✕ SHORT SPARE IN 5 MIN ✕0 RISK: TIE 800 … BAND LOW 4 MIN
> real=1   → 18:32:20
TRAY ! CITY DESK 18:30 DIRECTED SHEDDING: frequency below 49.5 Hz for over 1 min. One district per minute until it
recovers. … District SOL3 shed (directed, 168 MW) … MARKET NOTICE 18:30 Load is off supply: the system is SHEDDING.
```

An under-planned evening (the stranger's evening) goes dark one district per grid-minute, 0.4 real s each, at
150×, with a tray card. The K-15 trigger is a contingency (a trip > 50 MW); a slow sag into shedding is not one,
so the most consequential physics of the day plays at full speed with no vignette, no stopwatch, no beat. The
benign 300 MW tie trip six hours earlier got 29 seconds of slow motion.

### 1.6 The restore's FOCUS (20261014, 06:55)

```
node tools/play.mjs 20261014 until=card presskey=r real=0.5 diff …
DURING   CLOCK 06:55:00 | FOCUS 1×
AFTER 0.5 real s   BALANCE SHORT 30 MW held up by spin 60   DIAL 49.870 Hz CHANGE falling
06:55:01 FOCUS     SHORT 100 MW held up by spin 110 · battery 20   DIAL ! 49.849 falling
06:55:01 FOCUS     SHORT 140 MW held up by spin 90 · battery 60    DIAL ! 49.777 falling
06:55:06 CRUISE    MORNING RAMP 270× … SHORT 170 MW held up by battery 100 · spin 60   DIAL ! 49.756 falling
06:57:21 CRUISE    DIAL 49.853 rising
```

`RESTORE_FOCUS_S = 2` (`app/director.js:23`): the clock returns to 270× while the needle is still falling; the
bottom of the pickup's dip and the catch are never seen. SPEC §4.1's "close the first feeder at 1× and watch the
needle dip and recover" is not what plays.

---

## 2. The holds and the clock after the card

### 2.1 How many stops a day has

`node tools/play.mjs 20261014 timeline=04:30-04:00/30m clock` (presses R at feeder cards and Enter at respond
cards at once):

```
306.8 real s from Space (04:30:00) to 04:00:00 · E 306.8 = profile 245.0 + WATCH 2x +57.7 (58.0 real s)
+ card 2x +0.0 + FOCUS 11x +4.0 + RESTORE 2x +0.1 + RESPOND 0x +0.0 + OFFER 0x +0.0 · off by +0.0 s
```

On a first day with a relay trip both watches are full (the UFLS upgrade in `versionFor`,
`app/director.js:95`), so 58 of 307 s are the desk locked. A real player adds reading time at four cards. The
stops, in order: TAKE THE DESK; FEEDER 06:55 (hides the ACT NOW line: in the 06:55 look no LINE is printed, the
card is "the one instruction while it holds"); FEEDER 07:15, 4.4 real s later (20 grid-min at 270×); RESPOND-CARD
12:19:30; RESPOND-CARD 19:19:30; DAY OVER. On 20261013 the feeder cards come at 07:35 and 07:55 (4.4 s apart);
on 20261012 at 06:30 and 07:30 (13 s). Q-68's floor is 15 grid-min = 3.3 real s. Two stops within four real
seconds, in the ramp, for the same kind of non-decision, is the stop-start that hurts.

### 2.2 RESPOND never runs

Six seeds, `timeline … clock`: `RESPOND 0x +0.0 (0.0 real s)` on 20261012, 14, 15, 16, 17, 18.
`responding()` (`app/director.js:117`) needs `c.backInBandTick < 0`; `sim/grid.js:1046` sets it the first whole
second frequency sits in 49.85–50.15, which on every observed trip is inside the 30-s watch: relays over-correct
(19:19:30 card: DIAL 50.055), contained trips settle just inside the band (12:19:30: 49.954; 13:45:30: 50.035;
17:49:30: 50.030). So SPEC §2 (`SPEC.md:611` "then 30× for up to 5 grid-minutes") and §4.1's "RESPOND runs at 30×
until frequency is back in the normal band (≤10 real s)" describe a mode that does not occur.

What occurs instead, 20261014 19:19:30 → Enter → `PEAK 150×` with "SHEDDING: 9 districts dark (2146 MW): relight
them and cover 700 MW within 29:30". Arithmetic a sceptic can check: 150× means one real second is 2.5 grid-min;
2,146 MW × 2.5/60 h = 89 MWh; × VCR $30,000/MWh (`sim/params.js:327`) = $2.7M per real second spent reading.
The ALL-IN chip on that run went 27.8c → 43.8c (19:30) → 85.8c (20:00) → 154.5c (21:00). And the ask is
impossible as stated: `RESTORE_INTERVAL_S` 300 (`sim/params.js:135`) makes nine restores take 45 grid-min, not
29:30.

This is the asymmetry I most want the owner to see. Q-91 (the owner's call, 2026-10-13) holds the clock for a
240 MW hand-back because the slow proxy's 15 real s late cost a median 656 points. After the day's signature
trip, with 2,000 MW dark, the clock runs at 150× from the moment Enter is pressed.

### 2.3 Is the respond card (no buttons, K-16) landing?

For a contained trip, yes: it says there is nothing to do ("N-1 SECURE: the fleet can take the next trip") and
Enter is the whole answer. For a relay trip it says the right thing ("relight them and cover 700 MW") and the
RESTORE tab and START guards glow, but the follow-through (§2.2) undoes it. Two small faults on the card itself:

- "Back to 49.85–50.15 Hz within 5:00." is FOS's requirement printed as if it were a forecast; a stranger reads a
  promise. One word fixes it ("must be back …" or "FOS asks: back …").
- Negative catches are printed: 20261014 19:19:30 "Caught by: spin → battery -11 MW → governors -23 MW → load relief
  55 MW → UFLS 814 MW" (`app/watch.js:169` filters `|MW| ≥ 1` and keeps the sign). "battery -11 MW" is noise to the
  one reader the card is for.

The first-trip line "W explains each alarm (the clock holds)" is good and should stay.

---

## 3. Judgements the lens asked for

**Does the watch read as drama and teach the order?** The physics does; the words do not on the trips that
matter. On a calm belly fall (1.2) it teaches inertia → battery → governors cleanly. On the evening trip (1.3), on
any evening with the fleet slightly off rest, and on every rise (1.1), the beat strip lights GOVERNORS first and
BATTERY never, and the caption says "governors" at 0.02 s. K-15's accept ("≥3/5 players recall the order") would
fail on those trips for a reason that is one comparison in `rawBeat`. The drama is real for about 12 real seconds
and then the full watch coasts for 15.

**Is the compact watch worth keeping?** Yes, and it is closer to right than the full one. 10.5 s (6 s at 0.5×
covers the nadir at ~2 s) with single-word beats is the correct shape for a daily people replay; what it loses is
the nadir figure, which the dial's pin carries. The full version's problem is not that it exists but that its
tail is dead (1.2). Fix the tail (finding 5) and the two versions converge; the first-time captions are the only
real difference, which is as it should be.

**RESTORE: mini-skill or formality?** Formality. At a lit lamp there is no reason to press anything but R; at a
dark lamp R is refused and Esc is forced. The only thing a player could do with skill, time the close so the dip
is shallow, is not scored, and the 2-s FOCUS does not even show the dip bottom. It can become the small,
repeatable trip moment (finding 6).

**SYNC:** Q-89 measured that a manual close never changes an outcome; the scope's remaining value is feel. That
feel belongs on the breaker close that does change outcomes (the feeder pickup), and the scope can stay for HAND
(finding 8).

**A day with no trip:** 20261013 is one (storm warned at 15:51, link trip not drawn, front belly): no watch, no
card, the evening's event is turbines cutting out at 150×. By Q-66's shares (storm 25%, link trip on 27% of
storms) about 18% of days have no evening trip; with a front belly (40% of Act II) about 7% of days have no
trip at all. A stranger arriving by link on such a day never sees the signature moment. And on every
under-planned day the lights-out moment (1.5) is not a trip and gets no watch.

**What would make the trip moment the thing people share:** the trace, the nadir, the catch stack, and the
player's own choice visible in the outcome (finding 10).

---

## 4. Findings, strongest first

Costs: S a day, M a slice, L a phase. "NEM" says whether the real grid does it that way.

### 1. Defect, high: the beat strip lights GOVERNORS at T+0.02 s and never BATTERY whenever any positive governor or inverter MW precedes the battery

Evidence: `app/watch.js:65–76` (`rawBeat`): line 71 `gov = governorsMW + max(0, inverterMW)`; line 73
`if (gov > batt && gov > 0 && k > 0) return 2;` runs before line 74's battery test and never compares `gov` with
`inertia`. Transcript 1.3 (20261017 17:49): "Governors open the steam and gas valves" at T+0.02 s with BALANCE
"held up by spin 630", BATTERY never lit, card "battery 386 MW". Same on 20261016 18:49 and on every rise (1.1).
`tests/next.test.js:704–714` asserts only that the beats are monotonic, start at inertia and reach governors;
nothing asserts that battery is lit when it is the largest catcher.

Proposal (S): a beat is the largest catcher so far, in physical order: `return 2` only when `gov > batt && gov >
inertia && gov ≥ INVERTER_NAME_MW`; the inverters' give-back on a fall should not count toward GOVERNORS below
INVERTER_NAME_MW (it is hysteresis release, not a response). Add a test on a calm-start fall and on 20261017's
state that BATTERY is lit before GOVERNORS whenever `caught.batteryMW + guardMW` at the nadir exceeds
`governorsMW`. NEM: the physical order is the one J-25 fixed; this only makes the words match it.

### 2. Design-weakness, high: RESPOND's 30× never runs, so after a relay trip the clock runs at 150× with the city dark (challenges K-16/D-5 and, by its own logic, Q-91)

Evidence: six clock reports `RESPOND 0x` (§2.2); `app/director.js:117` `responding()` needs `backInBandTick < 0`;
`sim/grid.js:1046` sets it inside the watch; 20261017 Enter → `CLOCK 17:49:32 | PEAK 150×`; 20261014 19:19:30
card asks for nine restores in 29:30 against `RESTORE_INTERVAL_S` 300 (`sim/params.js:135`); VCR
`sim/params.js:327`.

Proposal, three steps the owner can take separately:
(a) S: RESPOND runs at 30× from the card until the first restore or START input, or COVER ✓, capped at
`RESPOND_MAX_S`, regardless of the band. Gives 10 real s to act after a relay trip, as §4.1 always claimed.
(b) M, my recommendation: districts shed by relays or direction hold the clock at each allowed second exactly as
Act I's feeder cards do (`feederDue` at `app/director.js:140` counts `shedBy === 'task'` only; par's `holdOf`
already prices a hold). The player learned the card at 06:55; the evening uses it. Q-91's own measurement (15 s
late = a C on a 240 MW feeder) argues for this far more strongly for 2,000 MW.
(c) M: restore by stage (the two districts of a UFLS stage in one close when the preview allows), halving the
holds and matching how UFLS blocks are actually restored.
NEM: the 30-min secure-again window is real (NER 4.2.6); restoring UFLS load in blocks as reserve allows is what a
control room does; holding time is the game's abstraction, already accepted in Q-91.

### 3. Design-weakness, high: a stranger's first watch can be a rise, and the rise watch teaches the wrong thing

Evidence: transcript 1.1 (20261014 12:19, tie exporting, peak 50.196, "N-1 SECURE"); `content/scenarios.js:245`
Act II mix `{front: 0.40, unit: 0.25, smelter: 0.20, tie: 0.15}`: tie and smelter trips are rises, 35% of belly
trips (`heatMix` 60%); the caption "Solar and wind back off 45 MW; governors close" at T+0.14 s (`GOV_DEAD`
0.2–0.5 s) with no BATTERY beat; `app/tray.js:86` "Interconnector tripped: -300 MW of import lost."

Proposal (S each): (i) `versionFor` keeps the full watch for the first *fall* even after a rise has been seen
(`seen.watch` becomes `seen.fall`/`seen.rise`), so the one 29-s lesson is spent on the north star's event;
(ii) on a rise the strip's third word is INVERTERS (they are the droop that acts) and "governors close" is said
only once `governorsMW` ≤ −5; (iii) the tray prints `|lostMW|` with "export"/"import" by sign. Longer term (2e,
M): the forced first shift is a fall at the peak, as §4.1 scripts; until it lands, a first visit should pick a
daily whose belly trip is a unit. NEM: load-loss events (a smelter potline, an export tie) are real and worth
showing, but not first.

### 4. Design-weakness, high: a hand-back whose restore is refused holds the clock only to force Esc, which removes the hold for good (the owner's open question, README §32.11 4599–4603)

Evidence: transcript 1.4: DIAL 49.877 vs `RESTORE_MIN_HZ` 49.9 (`sim/grid.js:1776`), the card's amber "Not yet:
frequency below 49.9 Hz. Esc goes on", `answerFeeder(leave)` → `d.fc[id] = Infinity` (`app/director.js:349`),
URGENT line up, RED7 dark after. The feeder card test A (`tests/feeder-card.test.js`) pins this behaviour.

Proposal (S): a card holds only when R will be accepted: the allowed second becomes the first second at which
`restorePermissive` would pass (frequency, interval, reserve), computed by `restoreAllowedS` or checked by
`feederDue` before holding; while refused, the bay glows and the line asks, as now, and the hold arrives when the
lamp lights. Esc then means "I choose to leave it", never "I had no choice". NEM: a control room closes a repaired
feeder when the system can take it; nobody is asked to close one it cannot.

### 5. Design-weakness, medium: about half of every full watch is a static caption after the nadir (challenges K-15's fixed schedule)

Evidence: transcript 1.2: nadir at T+1.80 s, `WATCH_SCHEDULE` (`app/director.js:33`) holds 0.15× to T+3.00
(20 real s) and 1× to T+10; caption "Governors open the valves. The fall stops at 49.695 Hz." unchanged T+3 → T+9;
on 1.1 the peak at T+1.94 s, caption unchanged T+2.54 → T+9. 29 real s × 2 trips = 58 s on a first day (§2.1).

Proposal (S–M): an adaptive schedule read off the record the director already has: 0.15× until
`c.extremeTick + 0.5 s` (min T+2, max T+3), then 1× to T+10, then 10×. The grid clock still advances exactly 30 s
(K-15), viewing still never changes the outcome. `tests/lib/play.js clockReport`'s WATCH term reads the same
rule. Saves 8–10 real s per full watch; the first-time player sees the turn at 0.15× and the recovery at 1×,
which is the order the words want. NEM: n/a (presentation).

### 6. Design-weakness, medium: RESTORE is a formality and its 2-s FOCUS ends before the pickup's dip bottoms

Evidence: transcript 1.6; `RESTORE_FOCUS_S = 2` (`app/director.js:23`); `desk/bay.js pick()`/`closeFeeder`: one
key, the permissive decides; SPEC §4.1 0:59 "watch the needle dip and recover". The card's two answers at a lit
lamp are R (right) and Esc (always worse: the feeder is priced at VCR from its hand-back).

Proposal (M): make the pickup the small, repeatable trip moment. A restore starts a short record of kind
'district' (the preview already runs `previewTrip` with that kind: `sim/physics.js previewTrip`), FOCUS lasts
until its dip has turned (5–8 grid-s), the dial pins the pickup's nadir, one caption: "240 MW of cold load picked
up: battery 100 MW, governors 60 MW, bottom 49.74 Hz." The debrief counts "clean pickups" (nadir ≥ 49.8) the way
Q-4 counted clean closes. This is where the instrument feel SYNC was meant to give belongs, because this close
changes the outcome. NEM: cold-load pickup and its dip are real; DNSP control rooms close feeders in blocks for
exactly this reason.

### 7. Question, medium: two morning holds 4–13 real s apart, each hiding the ramp's ACT NOW line

Evidence: §2.1 (06:55/07:15 on 20261014, 07:35/07:55 on 20261013; 20 grid-min = 4.4 real s at 270×); Q-68's
"≥ 15 grid-min apart"; the 06:55 look prints no LINE (the card is the one instruction).

Options: (a) keep two holds (today); (b) one card for both feeders: "RESTORE HAR4 now; HAR3 when it is handed
back at 07:15" with RESTORE BOTH queuing the second close for its allowed second, the way the stack holds a
commitment (Q-18: the plan is the player's) — one hold, the second feeder closes itself unless the permissive
refuses, in which case it holds then; (c) hold the second feeder only if the player has not closed it from the
bay within ~5 real s of its hand-back. Recommendation: (b), cost S–M. NEM: a control room schedules both closes
when the network hands them back; it does not get interrupted twice.

### 8. Question, low: SYNC was demoted to a flourish (Q-89); what should the scope be?

Evidence: Q-89 (README 3578): 0% of 100 dates where a manual close matters; `desk/bay.js` keeps a full scope,
BYPASS, trim keys and an 8-s AUTO timer; OFFER mode exists only to make the scope readable.

Options: (a) retire the scope from AGC days (HAND keeps it; the SYNC tab becomes a READY list with the auto-sync
countdown) and give its bay space and its "feel" to RESTORE's pickup (finding 6); (b) keep as is and count clean
closes in 2d; (c) re-aim at the tripped unit's return (lockout 90–150 min lands in the evening): offer its scope
as the trip's second act and put "CLEAN CLOSE at T+1:42" on the share card. Recommendation: (a), with (c)'s share
line if the owner wants a scope moment kept; (b) keeps 20 KB of instrument for a decision that never is one.
Cost S for (a). NEM: plants synchronise themselves; (a) is the more honest desk.

### 9. Design-weakness, medium: some days have no climax, and the lights-out moment of an under-planned day never gets a watch

Evidence: 20261013 timeline (storm warned 15:51, no link trip, front belly 12:27: no WATCH/CARD lines all day);
Q-66 shares (README 3555) → ~18% of days without an evening trip, ~7% with no trip at all; transcript 1.5
(20261014 18:30 directed shedding at 150× with a tray card; K-15's trigger is a contingency > 50 MW only).

Proposal: (i) S–M: the first district shed outside a contingency (relay or direction) starts a compact watch of
its own ("You are 800 MW short. The city desk sheds SOL3, 168 MW, to hold frequency."): the player sees their
plan's failure at 0.5×, not 150×, and the respond card then asks for the fix; (ii) S: until 2e's forced first
shift lands, a first visit (no `seen.watch`) plays a daily with a unit trip in the belly or the evening (the
dailies table can carry an attempt index for first visits as it does for gate exceptions). NEM: directed
shedding is real and is the moment an operator remembers.

### 10. Opportunity, high: the trip card is the thing to share, and most of it already exists

Evidence: `render/charts.js:193 drawWatch` draws the 30-s trace with the nadir pinned and the catch stack, used
only by `render/bench.js:473`; `app/endcard.js` has no contingency line (grep); `sim/physics.js previewTrip(state,
target, {guardMW})` gives the counterfactual at any guard; `app/par.js` runs par in-page so par's nadir on the
same trip is available; SPEC K-15 accept "the watch can be re-watched from the debrief" (`SPEC.md:1095`) is
unbuilt.

Proposal (M, 2d): at the respond card and on the end/share card, one panel: the trace, "NADIR 49.60 Hz", the
catch stack with YOUR GUARD named, and two counterfactuals computed at the trip tick: "with no guard: 49.34 Hz,
2 districts dark" (`previewTrip` with `guardMW: 0`) and "par's desk: 49.55 Hz". Share text: "Mt Hazel 1 tripped at
18:40, 614 MW. My grid bottomed at 49.60 Hz; my 400 MW guard kept 2 districts lit. Par: 49.55." That sentence is
the game. NEM: AEMO's incident reports lead with the trace and the nadir; operators do share them.

### 11. Defect, low: the respond card prints negative catches and states FOS's requirement as a forecast

Evidence: 20261014 19:19:30 card "battery -11 MW → governors -23 MW"; `app/watch.js:169`; the line "Back to
49.85–50.15 Hz within 5:00." on every card.

Proposal (S): drop parts ≤ 0 (or word them: "the battery had nothing left"); "FOS asks: back in 49.85–50.15 Hz
within 5:00." NEM: n/a.

### 12. Spec-stale, low: the SPEC still says the respond card is the only hold, that RESPOND runs 30×, and scripts SYNC and a 1× restore that do not play

Evidence: `SPEC.md:1104` (K-16 "this is the only hold on the clock"), `:2148` (§7), `:2385` (Q-46 "the RESPOND card
is the only hold the game imposes") vs Q-91's two feeder cards on 85% of dates; `SPEC.md:611` and §4.1 5:00
"RESPOND runs at 30×" vs §2.2; §4.1 0:38 "First real action: SYNC (introduction 1 of 5)" vs Q-89; §4.1 0:59
"close the first feeder at 1× and watch the needle dip and recover" vs transcript 1.6; `SPEC.md:1095` re-watch
from the debrief (2d). Q-61–Q-91 are not in §9.1.

Proposal (S): when Q-61–Q-91 are written into §9.1, amend K-16, §7, Q-46, §2's mode table and §4.1's script in
the same pass.

---

## 5. If the owner takes only three things from this lens

1. Fix `rawBeat` (finding 1): the watch currently mis-teaches the order on the evening trip, which is the one the
   whole day is built around.
2. Decide what happens after Enter on a relay trip (finding 2): today it is 150× with the city dark, which Q-91's
   own reasoning says is wrong. My recommendation is 2(b): the dark districts hold the clock like the morning's
   feeders, by stage.
3. Put the trip on the share card (finding 10): the trace, the nadir, the guard's counterfactual. It is mostly
   built and it is the sentence a stranger would repeat.
