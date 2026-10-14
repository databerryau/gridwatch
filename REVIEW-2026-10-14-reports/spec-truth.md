# GRIDWATCH review, lens "spec-truth": is the SPEC true, and what is the scope

Reader: spec-truth. Date: 2026-10-14. Build: `main` at 52da14a (`SIM_VERSION` `v4-core-2c.1`, `sim/params.js:25`), read-only; nothing edited, nothing committed.

Method: SPEC.md read end to end (2,690 lines; §8.1 skimmed), desk/README.md §32 (the 2c contract, §32.1 decisions, §32.2 amendments owed to the SPEC, §32.10 stage C, §32.11 records, §32.13), the served code (`next.html`, `app/director.js`, `app/shell.js`, `app/endcard.js`, `sim/clock.js`, `sim/params.js`, `desk/desk.css`, `content/text.js`, `content/dailies.js`), `git log`, and four headless plays of today's daily with `tools/play.mjs 20261014` (the briefing, a whole scripted day first-time and returning, with `clock`), plus `tools/perf.mjs --sizes` (a size report, no frames). No browser, no server, no slow tools (`par.js`, `follow.mjs`, `daily-gen.js`, `baseline-v4.js` not run). Where a number below is mine it names the command; where it is the repo's it names the file and line.

The owner's framing applies: nothing in the SPEC is gospel. Where I challenge a decision I name it (OD-, Q-, K- …) and say why.

---

## 0. The short version

1. **The SPEC lags the game by two slices.** Its status line (SPEC:8) says slice 2a is built; 2b (2026-10-10) and 2c (2026-10-13) are merged and live. D-2 still says "today's build runs at 120×" (:1374) while `sim/clock.js` plays the 245-s profile; F-5 lists six director modes (:606-612) while `app/director.js:216` has fourteen; the slice table says 2c is "To come" (:1353). desk/README §32.2 is 75 lines of amendments "the integrator writes at stage C", and the integrator did not. Q-61–Q-91 are not in §9.1. The full stale-claims table is §2 (about 45 rows with line numbers).
2. **Nine Accepts are waived or missed and still read as targets** (§3): lean ≤40% A (48%), forced heat ≥75% (74%; floor moved to 70% by Q-87), competent ≥70% A (64% before Q-88, no figure after), SYNC-that-matters ≥80% (0%, dropped by Q-89), D-10 ≤40 s on ≥90% (61%, "decided at playtest" by Q-90), P-9 2–6 h (1.68 h), the STOP quote (38 of 140), F-11 ≤400 KB (406.3 KB today, a report since Q-84), D-2's link-to-SHARE (no SHARE exists). Two more are now false by construction: "there is no automatic restore" (H-6:687, K-13:1064) and D-11's "units stand down automatically, no director events" (:1496): the night shift restores feeders, starts units and calls DR from 21:00 (play transcript, §1.3).
3. **The owner's Q-91 broke the owner's own differentiation rule.** K-16:1102 ("A card that offered the fix would be a *Grid Operator* decision card"), K-16:1104 and §7:2148 ("the respond card is the only thing that holds the clock, and it offers no choices"), K-9:1011 ("Cards never pause play"), OD-16:63 ("no pause-cards"). The feeder card holds the clock twice on 85% of dates with two buttons, RESTORE and GO ON (transcript 06:55 and 07:15 on 20261014). That is fine for a stranger; the rule is what should move. This is a question for the owner, with my recommendation (§5, finding 1).
4. **The objective line states the plan**, which O-3:1611 ("Marg never states the optimal plan") and L-9:1286 ("Hints, never autopilot") forbid. It is the best thing on the desk for a stranger and it makes most of 2e's cover plates and Marg redundant. Own it, and cut 2e down (§5, finding 3).
5. **The share loop's cheapest parts are furthest away.** The end card's controls today are DOWNLOAD REPLAY LOG and PLAY THIS DAY AGAIN (transcript at 04:00); there is no share card, no copy, no streak, no phone landing page. Each is a day's work (Y-3, Y-4, Y-5, Y-8) and all sit in Phase 4 behind 2d, 2e and Phase 3. Reorder (§6, cut list).
6. **"In five minutes" is 5:07 to the verdict with zero reading time** on a first-time day (my clock run: 306.8 real s from Space), before the briefing, 2e's 48 s of introductions and 2d's 45-s debrief: about 7:00 to SHARE against the SPEC's ≤6:50 (:2105). The returning player is on target (288.3 s). §4.
7. **The spec's size costs more than it returns**: 1.04 MB and about 170,000 words across three documents, eleven explicit "override/supersede" layers in desk/README, eleven help texts in `content/text.js` waiting on SPEC rows (`specPending`), 105 KB of module headers moved out of the code for a byte cap the owner then abolished (Q-84). The lag in point 1 is its direct product. §7.
8. **Scope, honestly sized** (§6): 2d is one slice (M); 2e as written is two slices (L) and its largest item, cover plates run by par's rules (O-3), is the one the objective line has made optional; Phase 3 is two slices of levers a stranger will not miss; Phase 4's core (share, streak, landing, resume) is one slice and is the north star's "share"; Phase 5 is a phase. At the observed cadence (each of 2a, 2b, 2c took two calendar days of intense sessions) a stranger-testable shareable daily is about a week away if Phase 3, seasons, the counterfactual and the replay scrub wait.

---

## 1. Evidence from play (what the built day is, 2026-10-14)

### 1.1 The briefing, clock held

```
node tools/play.mjs 20261014 --no-run look
CLOCK 04:30:00 | PAUSE 0× | LIGHTS ON 100% | COST 3.4 c/kWh | CO₂ 0.70 t/MWh | ALL-IN 9.0c
LINE ▶ ACT NOW You will be 150 MW short from 06:25 (the tie limited to 500 MW until 11:15). Start CCGT 2 now: it takes 49 min to reach the grid. · Clock held: press Space to run (you can act while paused).
N-1 ! TIGHT SPARE IN 5 MIN ✓1339 RISK: COAL 1 530 ! 49.30 Hz · U 49.30 L 49.30
TRAY ! NETWORK 04:00 Overnight faults: feeders HAR4 and HAR3 under repair, handed back at 06:55 and 07:15. TO THE RESTORE BAY || ! MARKET NOTICE 04:00 Network outage: tie imports limited to 500 MW until 11:15. TO THE TIE
CTRL … btn-mute "SOUND ON" · … tile-* ×12 · btn-ack "ACK" · btn-silence "HORN OFF" · btn-explain "EXPLAIN W" · … guard-start-ccgt2 "○2" · … bay-sync "SYNC" [selected] · bay-restore "✕2 RESTORE" · sync-lower "[ −" · sync-raise "+ ]" · sync-close "C CLOSE" · sync-auto "U AUTO" · key-rert "▣ BREAK GLASS $16,000/MWh · 300 MW · 20-min lead" · btn-dr "DR 350 MW · 60 min · $1,400/MWh ●●●"
```

What this says against the SPEC: the first real action is a two-press guarded START of CCGT 2 at a held clock (Q-18), not §4.1's SYNC at 0:38 (:279) nor O-2's "the SYNC prompt is live within 60 s" (:1588). Every control is on the desk at once (no cover plates, 2e). The procedure bay opens on SYNC, selected, with five scope buttons for a skill the owner has since called "a flourish" that matters on 0% of dates (Q-89). The briefing card the player reads before this (next.html:204-208) is 154 words of text plus GOALS_TEXT (57 words, app/shell.js:116) plus the day line and "Watch for": about 250–270 words against D-3's "≤20 s and ≤60 words" (:1409).

### 1.2 A whole first-time day, Enter at every card (the "answer the cards, touch nothing else" day)

`node tools/play.mjs 20261014 timeline=04:30-04:00/30m clock` (6.6 s). The lines that matter:

```
## 06:55:00 notice:FEEDER-CARD
CLOCK 06:55:00 | HELD 0× · R restore · Esc on | …
FEEDER HAR4's feeder in Harbourside is repaired: about 240 MW with its cold load. R or Enter: restore it now · Esc: go on Gone on, it stays dark and is yours: the RESTORE bay still has it.
CTRL … feeder-restore "RESTORE HAR4" · feeder-go-on "GO ON"
## 06:55:02 mode:CRUISE
BALANCE SHORT 170 MW held up by battery 140 · governors 30
DIAL ! 49.767 Hz CHANGE falling … BAND LOW 5 MIN
## 07:15:00 notice:FEEDER-CARD   (the second hold, HAR3)
## 12:19:00 trip   The tie line has tripped (-300 MW of import; the Act II crisis)
## 12:19:30 card   PEAK 50.196 Hz: contained ✓ … Enter (or a click) to take the desk
## 17:54:16 notice  N-1 ✕ SHORT … key-shed "▣ DIRECT SHED SOL3, about 145 MW"   (K-7's key appears at SHORT, Q-8, not "when LOR2 is forecast", :987)
## 18:30:06 notice  DIRECTED SHEDDING … District SOL3 shed (directed, 168 MW)
## 19:19:00 trip   CCGT 1 has tripped (649 MW; the Act III crisis)
## 19:19:30 card   NADIR 48.652 Hz: OUTSIDE 49.5–50.5 Hz ✗ … UFLS 814 MW. SHEDDING: 9 districts dark (2146 MW)
## 21:00:00 mode:NIGHT
NIGHT ☾ NIGHT SHIFT The night shift has the desk to 04:00: it starts and stands down units and calls demand response as par would. SUPPLY $2.0M · OUTAGES $100.4M · CARBON $3.1M · ALL-IN $105.5M (154.5c/kWh)
## 21:00:30 … START Greyfell Gorge hydro 3 · 21:05 START Riverton CCGT 2 · 21:10 START GT·A · 21:15 START GT·B 1 · 21:20 START GT·B 2 · 21:25 INDUSTRIAL DR called · 21:30 START GT·C 1
## 21:40:30 … bay-restore "✕8 RESTORE"      ## 21:42:59 … bay-restore "✕7 RESTORE"   (the night shift is closing feeders)
## 22:54 STOP GT·A · 22:59 STOP GT·B 1 · 23:04 STOP GT·B 2 · 23:09 STOP GT·C 1 · 23:38 STOP GT·C 2
## 04:00:00 mode:OVER
END Day over: 04:00. ALL-IN 158.4 c/kWh · PAR: off … OUTAGES $147.99M 4,932.9 MWh dark × $30,000 (VCR) … SAIDI 48.3 min · SAIFI 0.28 … Seed 20261014 · v4-core-2c.1 · 260 inputs · hash 0x13f5082f
CTRL btn-pause "PAUSE" [disabled] · … q-reliability "?" · btn-save-log "DOWNLOAD REPLAY LOG" · btn-again "PLAY THIS DAY AGAIN"
> clock
306.8 real s from Space (04:30:00) to 04:00:00 · E 306.8 = profile 245.0 + WATCH 2x +57.7 (58.0 real s) + card 2x +0.0 + FOCUS 11x +4.0 + RESTORE 2x +0.1 + RESPOND 0x +0.0 + OFFER 0x +0.0 · off by +0.0 s
```

The returning player (`--returning`, compact watches): `288.3 real s … WATCH 2x +39.2 … off by +0.0 s`.

What this says: the no-input day fails as Q-18 intends (4,933 MWh dark; 95.0% lights on). The day has the designed shape (Act I constraint + two hand-backs, an Act II tie trip, an Act III unit trip, a night shift). Two things in it are not in the SPEC at all: the feeder card (a hold with buttons) and a night shift that starts six units, calls DR and restores districts. The end card has no share.

### 1.3 Three measured facts the SPEC still contradicts

| Fact (from the transcripts above) | SPEC says | Where |
|---|---|---|
| The night shift restores dark districts (✕9 → ✕8 at 21:40 → ✕7 at 21:42) and §32.11 wave 2: "13 districts dark at 21:00, all closed by the night shift's rule 9" | "there is no automatic restore" | H-6 accept :687; K-13 accept :1064 |
| The night shift starts hydro 3, CCGT 2, GT·A, GT·B 1–2, GT·C 1 and calls DR between 21:00 and 21:30 | "AGC runs, units stand down automatically, and there are no director events"; "no input is required" | D-11 :1496, :1499 |
| DIRECT SHED appears at 17:54 when the gauge reads SHORT (R5 673 < L 674) | "It appears only when LOR2 is forecast" | K-7 :987 (Q-8 at :2328 records the change; the requirement text was never rewritten) |

---

## 2. Stale-claims table (SPEC.md line numbers; "built" = `main` 52da14a)

Severity: **H** misleads a reader about what the game is; M wrong detail; L cosmetic.

| SPEC line | Claim | What is true | Sev |
|---|---|---|---|
| :8 | Status: "slice 2a … is built on next.html" | 2a, 2b (`v4-core-2b.1`, 2026-10-10, PR #13) and 2c (`v4-core-2c.1`, 2026-10-13, PR #14) are built and live; `git log` | H |
| :29 §0 pillar 1 | "On a first shift, controls not yet handed over sit under cover plates and Marg runs them" | Not built (2e). Reads as description | M |
| :63 OD-16 | "No planning phase, no pause-cards" | The 04:30 clock is held until Space (Q-18, transcript "Clock held: press Space"): a planning moment. FEEDER-CARD holds the clock (Q-91) | H |
| :256 §3.6 | "The core after Phase 2a" is the last measured state of the core | No 2b or 2c paragraph; 2c changed the clock, the day, the score's accounting (Q-69) and the night | M |
| :268-293 §4.1 | The minute-by-minute first daily: SYNC at 0:38 as the first action; RESTORE "when the permissive lamp lights … at 1×"; the suburb card at 10:00; trip at 18:40; "Release (12 s), then the night roll (12 s)"; verdict, debrief, SHARE at ≈6:45 | First action is START CCGT 2 at 04:30 with the clock held (Q-18; transcript 1.1); the hand-back holds the clock with a card (Q-91); heat is announced at 04:00 (Q-80); 21:00–04:00 is a night shift with a night strip (Q-73); no verdict/debrief/SHARE exist (2d, Phase 4). The script's Marg lines and introductions are 2e's | H |
| :295-325 §4.2 | Layout: header 32 px, MAP 1280×268, desk 300: four columns, column 4 "ANNUNCIATOR 4x3 / [ACK] [SILENCE]" over "MESSAGE TRAY 256x108" over "DR DIESEL" | A 58-px plan bar (`next.html:26` `--planbar-h: 58px`; `:64-66` `position: fixed; bottom: var(--desk-h)`) lies over the map's bottom edge holding the objective line and a 6×2 annunciator (`desk/desk.css:273-275`); column 4 is the tray over the emergency cell (Q-45). The visible map at the 1280×600 floor is 268 − 58 = 210 px | M |
| :338 §4.3 | "Annunciator: Alarm tiles with ACK and SILENCE … A, Shift+A" | ACK, HORN OFF, EXPLAIN (W) (transcript CTRL; Q-45, Q-46) | L |
| :468, :604, :608, :922 | "a flat 120×" before Phase 2; CRUISE "150×–2,100×" | The D-2 profile plays: 540/270/480/300/240/150/300/2,100× (`sim/params.js:349-352`, `sim/clock.js`); HAND halves it to 75× (`HAND_RATE_FACTOR`, :492). F-5's six modes (:606-612) are fourteen in `app/director.js:216`: OVER, HIDDEN, ALARMS, PAUSE, WATCH, RESPOND-CARD, FEEDER-CARD, FOCUS, RESPOND, OFFER, NIGHT, FAST, CRUISE, DEBUG | H |
| :470 | Phase 2 row: "2a is built on next.html (2026-10-03)" | 2a–2c built | M |
| :687 H-6, :1064 K-13 | "there is no automatic restore" | The night shift's rule 9 restores from 21:00 (§1.3) | H |
| :834, :1678, :2254, :2359 | The heatwave "arrives as news at 10:30" | Announced at 04:00 on the briefing (Q-80; `app/shell.js` BRIEF.heat "heatwave 13:00–19:30") | M |
| :849 S-12, :859 | Accept: lean proxy A on ≤40% | 96/200 = 48% on `desk`+`desk-weekend` (:859 "not met"); kept by decision at Q-48 (:2387 "the 10-MWh promise won"). Still an Accept | M |
| :849 S-12, :2087 §6 | Accept: ≥75% of forced-heat seeds | 74/100 at 2c; the owner lowered the floor to 70% (desk/README Q-87, :3576). SPEC unamended | M |
| :860, :2089 | Competent proxy A ≥70%: "154/200 (77%)" at 2b; §6 :2089 says "not yet run on the game's day" | §6 contradicts :860 in the same document; after Q-85's heat trip and the restore task it was 64% before Q-88 (desk/README :3577) and no post-Q-88/Q-91 figure is recorded anywhere | M |
| :987 K-7 | DIRECT SHED "appears only when LOR2 is forecast" | Appears while SHORT or SHEDDING (Q-8; transcript 17:54) | M |
| :1001 K-8, :2366 Q-27 | "twelve in a 4 × 3 panel" | 6 × 2 in the plan bar (`desk/desk.css:275`) | L |
| :1007-1013 K-9 | "Cards never pause play (§7)"; "no tray button changes … a unit state" | FEEDER-CARD pauses play with a RESTORE button that closes a breaker (transcript 06:55); ALARMS pauses on request (Q-46) | H |
| :1053 K-12, :1478 D-8, :2107 §6 | Accept: the returning-player proxy meets ≥1 SYNC that matters on ≥80% of dates | 0% of 100 dates; dropped by Q-89 (desk/README :3578). The three SPEC lines stand | M |
| :1097-1107 K-16, :2131, :2148 §7 | "The card has no action buttons"; "Apart from first-shift coaching, this is the only hold on the clock"; "the one hold after a trip offers no choices" | FEEDER-CARD: a second game-imposed hold, with RESTORE and GO ON buttons; the briefing's held start; ALARMS | H |
| :1117 K-17 | "at a 1280×600 viewport … the map is ≥260 px tall" | The map element is 268 px; the plan bar covers its bottom 58 px (visible 210 px) | M |
| :1337 F-11, :2115 §6, :2433 risk 11, :2583 | First visit ≤400 KB compressed; "387.8 KB after slice 2b, 12.2 KB left" | `node tools/perf.mjs --sizes`: "First visit (next.html): 50 files, 1200374 B raw, 416007 B gzip (406.26 KB)". Q-84 (owner, 2026-10-13) made the figure a report, not a cap; the SPEC's three places still state the cap | M |
| :1353-1355 | Slice table: 2c "To come" | 2c built 2026-10-13 | H |
| :1374 D-2 | "today's build runs at 2 (120×)" | The profile plays | H |
| :1389-1406 D-2 | Session table and accept: verdict ≈4:47–4:55 returning, ≈5:56–6:04 first shift; "a scripted run that presses only TAKE THE DESK and Enter on each respond card" | Measured today: 288.3 s returning (on target), 306.8 s first-time before any briefing, introduction or debrief (§4); the scripted run must also press Space (Q-18) and Enter at each feeder card (Q-91). §32.2 rewrites the accept; not written | M |
| :1407-1417 D-3 | Briefing ≤60 words, one plain goal line, "Watch for", one supervisor line, one button | Built (interim, 2e): about 250–270 words in five paragraphs (`next.html:204-208`, `GOALS_TEXT`), AGC/HAND radio buttons, no Marg | M |
| :1455 D-8(b) | Act I: "a tie derate, a delayed start or late fog"; restore on ≥80%; "or the smelter asking to reconnect" | Fog dropped; the task on 85% (`dayplan.act1.task.p` 0.85); the smelter variant waits for Phase 3 (Q-68) | L |
| :1478 D-8 accept | Class shares within ±2 points | The generated year is heat 17.0% (commit 749f672); D-9's ±3 holds, D-8's ±2 does not for the shipped list | L |
| :1492 D-10, :2110 §6 | Accept: no gap >40 real s on ≥90% of dates | 61% of 100 dates, 64% of 365; "decided at playtest" (Q-90). Still an Accept | M |
| :1495-1499 D-11 | "21:00–04:00 in 12 s … units stand down automatically, and there are no director events … no input is required" | The night shift (Q-73) starts, stops, calls DR and restores as par would (§1.3); 12.4 s with the ease | H |
| :1508-1518 S-5, :1520 S-6, :1533 S-9, :1539 D-20, :414-437 §4.7, :1925-1937 Y-4 | The letter from ΔU ≤ 10 MWh …; a ★ per axis; "Carbon is a star, not part of the letter"; the scorecard's three rows; the §4.7 share card with Lights/Cost/CO2 marks | Q-48 (:2387) superseded all of it: one ALL-IN SCORE (1000 × par's ÷ yours), letters A ≥ 962 …, carbon inside the score. The end card shows SCORE, SUPPLY, OUTAGES, CARBON, ALL-IN, SAIDI/SAIFI/MAIFI (`app/endcard.js:3-6`). Y-4's share card as written would print marks that no longer exist | H |
| :1578-1588 O-2 | "~38 s: Manual SYNC of the second CCGT unit"; accept "the SYNC prompt is live within 60 s" | The first action is START at 0 s (Q-18); SYNC is a flourish (Q-89) | M |
| :1590-1612 O-3, :1286 L-9 | "Marg never states the optimal plan"; "Hints, never autopilot … no control fills gaps automatically" | The objective line states the plan on every screen ("Start CCGT 2 now: it takes 49 min"; "Raise the battery GUARD to 400 MW"; "Stop it: saves about $45,000"); the night shift fills every gap from 21:00 | H |
| :1710 P-9 accept | Negative prices 2–6 h on mild days | 1.68 h median on mild weekdays, "missed" (:1721); unchanged by 2b/2c | L (recorded) |
| :1902-1907 Y-1 | Seed = hash of `GRIDWATCH\|daily\|SIM_VERSION\|date\|attempt` | Seed = YYYYMMDD + k·10⁸ (`content/dailies.js` `seedOf`; Q-75 "a deliberate Y-1 deviation") | M |
| :1992-1994 F-8 | `content/dailies.js` maps date → {seed, scenario, SIM_VERSION, par scorecard}; "the stored par is authoritative" | Ships exceptions only `{v, from, to, attempts}` (`content/dailies.js:2-6`, 17 entries); the page re-runs par (`app/par.js`). Risk 5's cross-engine float point (:2422) is therefore still open | M |
| :2085 §6 | Heat share "308 of 2,000 seeds (15.4%)" | Dates: 14.9% of 2,000 (`tests/dayplan.test.js`); the shipped year 17.0% | L |
| :2103 §6 | Unwarned pairs <60 s: "68/100 on the classic scenario" | 0 violations on 4,000 days (Q-72) | L |
| :2104 §6 | Cloud-front lead "3–10 real s" | 130–175 grid-min ≥ 26 real s (Q-71) | L |
| :2105 §6 | Session ≤6:00 / ≤6:50 "D-2 scripted runs" | No SHARE exists to time to; verdict half measured (§4) | M |
| :2108 §6 | No-input day: "11,100–37,400 MWh unserved on 22 of 22 seeds" | Still fails (today 4,933 MWh) but the night shift now restores, so the night's dark hours are gone from the total; unmeasured since 2c | L |
| :2109 §6 | "≤12 s night roll" | 12.4 s night shift | L |
| :2419 risk 2 | "link to SHARE is ≈5:35 … ≈6:45" | Add two feeder-card holds and the reading time of each; §4 | L |
| :2502-2570 §11 | Phase 2 boxes: "D-2 timing runs", "D-8 director test on 2,000 dates", "dailies.js re-checked" | D-8 on 2,000 dates is done (`tests/dayplan.test.js`); the 2c verdict-half timing is done; neither ticked. The Phase 1a box "Greybox check passed (two new people)" (:2526) has been open since 2026-10-01 | M |

Not in the SPEC at all (the §32.2 list, unwritten): Q-61–Q-91; `sim/clock.js`, `sim/dayplan.js`, `sim/dark.js`; the feeder card; the night shift; COVER; the announced return; `isClean`/PERFECT; the dailies' build stamp; OFFER at 30×; HAND's 478-s clock; the §8.2 rows for all of these (eleven `specPending: true` entries in `content/text.js`, e.g. :684 'night-shift', :700 'hand-mode', :724 'gated-dailies', :747 'cover', :761 'feeder-hold').

---

## 3. Accepts quietly waived, missed or made false

| Accept | SPEC | Target | Measured | Status |
|---|---|---|---|---|
| S-12 lean proxy | :849 | ≤40% A | 48% (:859) | Waived by Q-48 ("the 10-MWh promise won"); §32.10: "reported, never tuned for" |
| S-12 forced heat | :849 | ≥75% | 74/100 (Q-87) | Floor lowered to 70% by the owner; SPEC unamended |
| S-5 competent | :1518, :2089 | ≥70% A | 77% at 2b; 64% at 2c before Q-88; no figure after Q-88/Q-91 | Unmeasured on the shipped build; `LETTERS` "recalibrated in 2d" (Q-88) |
| K-12 / D-8 SYNC that matters | :1053, :1478 | ≥80% of dates | 0% of 100 (Q-77 proxy) | Dropped by Q-89 |
| D-10 gaps | :1492 | ≤40 s on ≥90% | 61% (100 dates), 64% (365) | "Decided at playtest" (Q-90) |
| P-9 negative prices, mild weekday | :1710 | 2–6 h | 1.68 h | Open since 2a; recorded; never tuned |
| Q-28 STOP quote | :2352 | each quote within ±30% or $10,000 of the realised saving | 38 of 140 (116 of 140 stop by stop) | "not met as written"; left |
| F-11 first visit | :1337 | ≤400 KB | 406.26 KB | Cap abolished by the owner (Q-84) after two rounds of moving comments out of the code |
| D-2 link to SHARE | :1405, :2105 | ≤6:00 / ≤6:50 | 288.3 s / 306.8 s to the verdict with zero reading time; no SHARE | Unmeasurable until 2d/Phase 4; §4 projects ≈7:00 first shift |
| H-6, K-13 "no automatic restore" | :687, :1064 | none | the night shift restores from 21:00 | False from 2c |
| D-11 "no director events, no input" | :1496-1499 | — | the night shift acts; a locked desk | Superseded by Q-73 |
| L-0 "no input never ends in F; median C/D" | :1207 | — | the no-input day must fail (Q-18) | Recorded as replaced (:2350); the accept text stands |
| K-9 accept "no tray button changes … a unit state" | :1013 | — | the feeder card's RESTORE closes a breaker (not a tray card, but a card with a dispatch button) | Letter kept, spirit broken (Q-91) |

What a sceptical reader concludes: the Accepts were written as gates and have become reports. That is a legitimate choice (the owner made it four times on 2026-10-13: Q-84, Q-87, Q-89, Q-90), but the SPEC does not say so anywhere, so each Accept still reads as a promise. A one-line "status" field per Accept (met / missed-and-kept / dropped, with the Q number) would end this.

---

## 4. D-2 timing, measured today

`tools/play.mjs 20261014 timeline=04:30-04:00/6h clock`: 306.8 real s from Space to 04:00 on a first-time day = profile 245.0 + two full watches 57.7 + FOCUS 4.0 (eleven restores at 1×) + two feeder-card holds 0.1 (Enter pressed at once). `--returning`: 288.3 s (compact watches 39.2). Both "off by +0.0 s" against the sim's own E, so the clock's arithmetic is exact (Q-62).

Against SPEC D-2 (:1389-1406):

| | SPEC returning | Measured returning | SPEC first shift | Projected first shift |
|---|---|---|---|---|
| Title + briefing | 15 s | 15 s (assumed) | 20 s | 20 s (the built card is ~270 words: longer) |
| Introductions (2e) | — | — | 48 s | 48 s |
| Grid clock + watches + FOCUS | 245 + 10.5 + 13 | 288.3 (two trips) | 245 + 29 + 6 | 306.8 (two trips) |
| Respond cards, feeder cards (reading) | 3 + 0–8 | 2 × ~3 + 2 × ~5 | 8 + 0–8 | 2 × ~8 + 2 × ~8 |
| Verdict at | ≈4:47–4:55 | ≈5:20 | ≈5:56–6:04 | ≈6:40 |
| Debrief (2d) | 45 s | 45 s | 45 s | 45 s |
| SHARE at | ≈5:32–5:40 (target ≤6:00) | ≈6:05 | ≈6:41–6:49 (target ≤6:50) | ≈7:25 |

Two-trip days are the common case (Act II + Act III on every non-storm, non-heat day, Q-66/Q-67; heat days got the evening trip back by Q-85). So the returning target is just missed and the first-shift target missed by ~35 s before any stranger reads slowly. Risk 2 (:2419) already names the cheap cuts: SHARE on the verdict card before the debrief; fold the night roll into the verdict. I would add: the full watch plays once (29 s) and cannot be skipped the first time (Q-43); make it skippable after beat 3 (the nadir pin, ~20 s in), since beats 4–5 are "no relays" and "settle"; and cut the five introductions to the three the objective line does not already give (RESTORE, the stack, the suburb card).

Not a realism question. The NEM's operators have minutes; the game's compression is the labelled abstraction (§8.2 "Compressed playback").

---

## 5. Contradictions between the SPEC, desk/README and the code, and what to do about each

**5.1 The feeder card against OD-16, K-9, K-16, §7 (finding 1, a question for the owner).** The SPEC's positioning (§7:2145-2152) is built on "cards never pause; the respond card is the only hold; no decision cards with action buttons". The owner chose Q-91 on 2026-10-13 after measuring that a pace (Q-70's RESTORE 30×/10×) made a player 15 s slow at the hand-back score 656 against 991. The result is a hold with two buttons, twice a day on 85% of dates. I think Q-91 is right for a stranger (a 270× morning turns one real second into 4.5 grid-min of a dark suburb: a reflex test, which OD-8 forbids), and the rule is what should move. Options:
- (a) Rewrite the rule: "a card may hold the clock when real seconds would otherwise be grid-minutes of consequence, and may carry the one action it names". Then give the respond card the same courtesy: its one lit action as a button (the owner's 2026-10-06 "START doesn't work" was a two-press guard at exactly this moment). Cost S. Recommended.
- (b) Keep the rule, return to a pace (Q-70). Measured worse (656 vs 991 for a 15-s-late player). Not recommended.
- (c) Keep the card, drop its buttons (R/Enter only). Keeps the letter of K-16, costs the mouse player a route, buys nothing.
NEM: not applicable; the hand-back is a DNSP-to-operator step that takes minutes in reality (§32 realism note).

**5.2 The objective line against O-3 and L-9 (finding 3, a question).** `app/objective.js` (95 KB, the largest app module) says what to start, stop, charge and guard, with the minute and the saving. O-3:1611 says Marg never states the optimal plan; L-9:1286 says hints never autopilot; K-16:1102 says a card that states the plan would be *Grid Operator*. The owner asked for the line after the 2026-10-01 play ("SUPER unclear") and looks at it most (Q-45). The hint-following player beats par (ALL-IN median 1,015 weekday, 1,021 weekend; desk/README §31.12). So the built game is "follow the line well", and "the plan comes together" (pillar 2) is partly the line's plan. Options:
- (a) Own it: the line is Marg (give it her voice, O-6), and it replaces O-3's cover plates and most introductions; 2e shrinks to a 60-word briefing, three introductions and "I've done this before". Cost: saves L. Recommended for the north star (a stranger finishes).
- (b) Degrade it by day: full on the first shift, reasons-only ("you will be 150 MW short from 06:25") from daily 2, so the plan becomes the player's. Cost M (the line's kinds already separate the reason from the action).
- (c) Keep the SPEC's rule and demote the line to reasons only now. Measured risk: the owner's own playtests say the desk is cryptic without it.
Recommendation: (a) now, (b) as Phase 4's "returning player" variant if gate 2 shows the line makes the day feel scripted.

**5.3 The score (Q-48) against S-5, S-6, S-9, D-20, §4.7, Y-4.** One ALL-IN SCORE superseded the three-axis marks, but Phase 4's share card (Y-4) and the §4.7 example still describe marks. Before Phase 4 the owner must decide what the card shows. Proposal (S): `GRIDWATCH #214 · Wed 14 Oct · SCORE 991 · A ★ / ████▇██▄████ low 49.60 Hz / "Nobody noticed. That's the job." / link`. The sparkline stays (Y-4's lint stays); the marks go. NEM: n/a.

**5.4 F-8 and Y-1 against Q-75.** The SPEC's stored-par-is-authoritative design was replaced by "exceptions only, the page re-runs par" (Q-75). Fine for 2c, but risk 5 (cross-engine floating point, :2422) is live again: a Firefox player's par may differ from a Chrome player's and the SCORE with it. Phase 4 must either store par's ALL-IN per date (F-8 as written; 365 × ~20 B) or run the `?selftest` golden-hash page in three browsers before launch (§10:2489). Cost S. Recommendation: store par's ALL-IN; the page's par stays for the live chip.

**5.5 The SPEC against itself.** §6:2089 says the proxies are "not yet run on the game's day" while :859-860 give the 2b figures. K-7:987 says "when LOR2 is forecast" while Q-8:2328 records the opposite. D-20:1544's "footnote only" against Q-48. K-15/K-16's "only hold" against Q-46. L-0's accept against Q-18 (acknowledged at :2350 but not struck). Each is one sentence to fix; together they mean a reader cannot trust any single sentence without checking §9.1.

**5.6 desk/README §32.11 against §32.10.** §32.10 (:4261-4304) promises stage C measures "once each": S-12 on `desk` and `desk-weekend` at the shipped build, the ALL-IN letters after Q-88, P-3, P-4, L-2, K-8 on the profile clock, the D-6 whole-day hash, the 5-date D-2 runs, the browser pass. §32.11's record ends with the Q-91 block and "For the owner"; grep finds no stage C measures paragraph (only the daily-gen numbers survive, in commit 749f672's message: 365 dates, 95.3% at attempt 0, 17 exceptions, heat 17.0%, 23 hard days). So the §6 table cannot be brought up to date for 2c without re-running the tools (about 15 min on 8 workers). Finding 9.

**5.7 Small ones.** `CLAUDE.md` names `pressKey(k)` where `tools/play.mjs` has `presskey=K` (a reader's trip). SPEC §10:2471 names `.claude/launch.json` and a `py -m http.server`; CLAUDE.md says agents never start a server (fine: the browser pass is the integrator's). `tests/dailies.test.js` (9 tests, 0.36 s) does guard the stamp, as Q-75 says.

---

## 6. Scope: what remains, honestly sized

Size scale: the SPEC's (S = days, M = 1–2 weeks, L = 2–4 weeks, part-time owner + AI). Observed cadence: 2a 2026-10-02/03, 2b 10-09/10, 2c 10-12/13: a slice is about two calendar days of intense multi-agent sessions, plus a day of fixes after the owner plays. "Already built" names code in the repo today.

| Scope | Items (SPEC) | Already built | Honest size | Value to a stranger finishing and sharing |
|---|---|---|---|---|
| **2c's SPEC debt** | §32.2's amendments; Q-61–Q-91 into §9.1; §8.2 rows for the eleven `specPending` texts; §6 rows; the §3 table | — | S (a day), but only if someone is told to | Indirect: every later agent and reviewer reads a false SPEC until then |
| **2d grade and debrief** | S-5 letters recalibrated to ALL-IN (:1508), S-6 marks (:1520), S-7 Hard days (:1527: the practice menu is Phase 4), S-9 (:1533: delete, superseded), D-20 scorecard (:1539), D-21 the moment (:1548), D-24 "this really happened" (:1555), D-25 pacing (:1567), L-10 clean-ramp chime and hourly strip (:1501), P-1's debrief plot (:1649) | The end card with SCORE, YOU/PAR/Δ, reliability, hash (`app/endcard.js`); the watch's trace (`app/watch.js`); strip charts (`render/charts.js`) | **M, one slice**: D-21 is the only real build (map zoom, ±3-min trace, "caught by" at the nadir, headroom/inertia/charge vs par at that minute); D-24 is content + five triggers + fact-check; the rest is text | High: "the moment" is what gets retold (gate 2 asks for it); D-24 is the realism pay-off |
| **2e briefing and onboarding** | D-3 (:1407), D-7 copy (:1441), O-1 (:1571), O-2 (:1578), O-3 cover plates and five introductions (:1590), O-4 concept cards (:1615), O-5 "why?" on every message (:1629), O-6 Marg ≤25 lines (:1633) | The briefing card (interim); the objective line; EXPLAIN's NOW/WHAT TO DO/WHY/ON THE REAL GRID per alarm (`app/alarmpanel.js`, `content/alarmhelp.js`); the "?" drawer; `?seed`/`?date` | **L as written, two slices**: O-3's cover plates run by par's rules on the player's desk touch `app/system.js`, the stack's hatched AUTO layers, par's seams and the forced first-shift scenario (Q-65/Q-68); the introductions must pause ≤8 s each, never in a watch; O-5 is ~20 templates with live numbers. **M, one slice, if the objective line is Marg** (§5.2): a 60-word briefing, "I've done this before", three introductions, concept cards folded into EXPLAIN | Highest: this is the stranger's first 60 s |
| **Phase 3 the full city** | P-10 (:1873), U-5 (:1877), U-7 backstop (:1881), U-8 map life (:1888), levers HOT WATER HOLD, EV DELAY, VPP (U-2 :1761), S-14 extended (:1822), S-12 re-check | The 2b card, booking and flex pattern; MSL notices; the backstop's MSL3 trigger (which par never reaches: :1833 "Par never reaches MSL3") | **M–L, two slices**: each lever is a 2b-sized card row plus par rules plus the objective line's kind; VPP needs an energy state; U-7 unlocks at an MSL3 that occurs on 0 of 400 par days | Low: a MILD day already has one lever and a HOT day two; strangers will not miss EV delay. U-7 is a lever for a state the game never reaches |
| **Phase 4 the daily** | Y-1 (:1902; built as Q-75's seeds and `?date`), Y-2 one official attempt (:1909), Y-3 history and streak (:1919), Y-4 share card (:1925), Y-5 copy (:1939), Y-6 PNG (:1943, cut-listed), Y-7 closing lines (:1947), Y-8 phone landing + og tags (:1951), Y-9 seasons (:1958), D-22 counterfactual (:1974), D-23 replay scrub (:1982), F-7 resume (:1986), F-8 stored par (:1992), F-9 BUILD coherence (:1996), F-14 switch-over (:2002; the root already redirects, Q-39) | `gridwatch:v4:seen`, `:settings`, `:par` keys with try/catch (`app/game.js:54`, `app/par.js:10`); the input log and DOWNLOAD REPLAY LOG (F-6); `dailies.js` | **Core M, one slice**: Y-3, Y-4, Y-5, Y-7, Y-8, F-9, F-14 are each S; Y-2 and F-7 together M (a snapshot + log replay; a day replays headless in ~2 s). **Cut-listed tail L**: Y-9 seasons (new demand shapes and sun tables, par re-gated per season, 365 dailies regenerated); D-22 (≤30 re-sims at 2–2.5 s each is 60–75 s on one core against a 12-s night roll: either 3 re-sims or a Worker pool); D-23; Y-6 | **The north star's "share"**: Y-4/Y-5/Y-8/Y-3 are the loop. Y-8 is where most shared links will land (phones) and today a phone gets a 1280-px desk |
| **Phase 5 week mode** | W-1–W-5 (:2031-2073), H-17 (:2062) | Nothing | L, a phase | None for a first stranger |
| **§11 release checklist** | Phase 2: P-1–P-4 met (2a), S-14/S-12 (2b; forced heat at 70%), U-1 names (2b), D-2 timing (half), D-8 on 2,000 dates (done, unticked), D-24 fact-check (2d), gate 1; Phase 1a's greybox check (two new people) open since 2026-10-01 (:2526); Phase 4: ≥365 dailies (done early: `dailies.js` 2026-10-12 to 2027-10-11), `?selftest` in three browsers (unbuilt), share card in two apps, og tags, gate 2 | — | S to tick what is done; the two human gates are the long poles | The gates are the only measurements of the north star |

Calendar at the observed cadence: 2d ≈ 3 days; 2e-as-written ≈ 5–7 days, 2e-with-the-line ≈ 3; Phase 4 core ≈ 3–4 days. A stranger-testable, shareable daily is therefore **about a week away** if Phase 3, Y-9, D-22, D-23 and Y-6 wait, and about three weeks away in the SPEC's order (2d → 2e → Phase 3 → Phase 4).

---

## 7. What a ruthless editor would cut, merge or reorder

**Reorder (the biggest win).** The SPEC's order is 2d → 2e → gate 1 → Phase 3 → Phase 4 → gate 2. The north star is "a stranger finishes and shares"; today no stranger has played (the greybox check, :2526, is open since 2026-10-01) and nothing can be shared. New order:
1. **The SPEC debt** (a day): write §32.2, Q-61–Q-91, the §8.2 rows, mark every Accept met / kept-missed / dropped.
2. **"2d-lite + share"** (one slice): the verdict card with SCORE (exists) + D-21 the moment + D-24 one card + Y-4 share card (SCORE + sparkline) + Y-5 copy + Y-3 streak + Y-8 landing page with og tags + F-9. Skip D-22, D-23, L-10's strip, P-1's plot.
3. **Greybox check with two strangers on that build** (the §5 Phase 1a gate, :2526): the owner silent, the think-aloud protocol of gate 1. This is the first measurement of the north star and it costs an afternoon.
4. **2e from what they say**: a 60-word briefing (D-3), "I've done this before" (O-1), at most three introductions, Marg's voice on the objective line (O-6), concept cards folded into EXPLAIN (O-4 becomes "the alarm panel's ON THE REAL GRID row, plus three cards"). O-3's cover plates and O-5's templates only if the strangers were lost without them.
5. **Gate 1**, then Phase 4's rest (Y-2, F-7, F-14, Y-7), then gate 2 and the launch post (:2564).
6. Phase 3 after gate 2, lever by lever, only if returning players ask for more to do at noon.

**Cut (from the path to a shared daily; not from the game forever):**
- Phase 5 week mode and H-17 (a phase).
- Y-9 seasons (L; OD-6's "a July heatwave would break the realism rule" is true, but a labelled late-summer day is the current abstraction and strangers will not notice for months).
- D-22 the counterfactual and D-23 the replay scrub (M each; the SPEC's own cut list already has them at 2 and 3).
- Y-6 PNG (cut list 1).
- U-7 the backstop (a lever for MSL3, which par never reaches on 400 days, :1833) and U-8 map life.
- O-3's cover plates run by par (L): the objective line already is the covered-control coach; replace with "controls the line has not mentioned yet are dimmed".
- O-5 "why?" on every message: EXPLAIN already gives NOW/WHY for the twelve alarms; tray cards carry their reason in their text.
- The SYNC bay as the procedure bay's default face (bay-sync [selected] at 04:30 with five buttons): hide the scope until an offer (Q-78, Q-86) and give the bay to RESTORE and the suburbs on a first shift. (This reopens OD-14's "SYNC and RESTORE are procedures played as mini-skills"; the owner has already made SYNC a flourish, Q-89.)

**Merge:**
- S-6, S-7, S-9, D-20 into one "the score" section written from Q-48 (the end card is the spec now).
- D-10 and D-8's "decisions per act" into gate 1's protocol (Q-90 said so).
- K-9's "cards never pause", K-16's "no buttons", §7's bullets and OD-16 into one rule that says what Q-46 and Q-91 built (§5.1).
- The three documents' "what is true now" into one page (§8).

---

## 8. What the spec's size is costing

Numbers: SPEC.md 317 KB, 55,678 words; desk/README.md 477 KB, 75,732 words; sim/README.md 250 KB, 39,229 words: 1.04 MB, 170,639 words, roughly 250,000 tokens, written for agents. desk/README §32 alone is 176 KB; §32.12 (module headers moved out of the code, Q-61) is 52.6 KB and §31.8 (the same, Q-49) 52.2 KB: 105 KB of prose that exists only because of a 400-KB byte cap the owner abolished on 2026-10-13 (Q-84). desk/README has eleven "override/overrides/supersedes" clauses (a reader must apply §32.1 → §32.11 wave-1 amendments → wave-2 amendments → the Q-91 block, in order, to learn the current RESTORE rule). desk/README received 92 commits in 13 days. SPEC has 60 Q- decision rows and 142 requirement headings; `content/text.js` has eleven help texts the player already reads that wait on SPEC rows (`specPending: true`).

What it costs:
1. **Staleness is structural.** The SPEC is updated "at stage C by the integrator" (§32.2), after the waves, when the integrator has the least budget; it did not happen for 2c, and §32.11's own stage C record is missing (§5.6). Every reader since 2026-10-10 has been reading a SPEC that describes a flat 120× bench.
2. **Reading is the first stage of every slice.** 2c opened with seven readers and two critics, then a four-lens contract review of 60 findings (§32.13), before any code. That is the cost of a contract nobody can hold in their head, paid again each slice.
3. **The owner cannot read it**, so the owner's decisions arrive through agents' summaries, and the owner's own earlier rules (K-16, §7) get broken without anyone noticing that they were rules.
4. **Measurements for superseded builds pile up**: §6's rows carry four generations of values in one cell (:2115 lists eight sizes); S-12 has three measured tables (:851-907).
5. **Two usage-limit cut-offs mid-work** are recorded in §32.11 (stage A, wave 2): the prose budget is spent on the prose.

Proposal (M, saves L over the remaining phases):
- SPEC.md → "intent and decisions": §0–§2, §4 rewritten to the built day, §5 as requirements with a one-word status each, §9.1 the decisions. Target 60–80 KB.
- `METRICS.md`, generated by the tools (`par.js --allin`, `daily-gen.js --check`, `perf.mjs --sizes`, `play.mjs … clock`), replacing §3, §6 and every "Measured" paragraph; re-run once per slice by a script, not by a person.
- One `CHANGELOG.md` replacing the per-slice records (§10, §16, §24–§28, §30.9, §31.11–12, §32.11), each entry a page.
- The module headers (§31.8, §32.12, sim/README §11) back into their files (the cap is gone) or deleted where the code's JSDoc already says it.
- A one-page `STATE.md` ("what the game is today, what is next, what was decided this week") for the owner and for playtesters.

---

## 9. Every place the SPEC forbids something for differentiation or realism that may be costing fun

For the owner to reopen. "NEM" says whether the real market does it the SPEC's way.

| Rule | SPEC | Forbids | What it may be costing | NEM | My view |
|---|---|---|---|---|---|
| OD-16 | :63 | A planning phase, pause-cards, money, perks, seasons | The held 04:30 start is a planning phase already (Q-18) and pause is free (D-6): say so and let the stranger use it. Pause-cards: see Q-91. Money/perks: nothing yet; streak (Y-3) is the hook | n/a (positioning) | Rewrite to what was built: "no RUN button, no modal plan; cards may hold the clock when seconds are minutes" |
| W-5 | :2069 | Money, shop, perks, seasons in week mode | Nothing until Phase 5 | n/a | Leave; Phase 5 is cut |
| L-7 | :1274 | A modal planning screen, a RUN button | The Live Stack's drag UI at 55 MW/px (L-4 :1245) is the price of "never modal"; a paused expanded stack (L) is a planning screen in all but name | n/a | Allow the expanded stack to be a modal while paused; keep "no RUN" |
| K-9 | :1007-1013 | Tray buttons that dispatch; cards that pause | "TO THE RESTORE BAY" at the hand-back cannot close the breaker while the card beside it can; the MSL card's SUBURBS button cannot book | True: notices do not dispatch | Keep for tray cards; the rule is already waived for the feeder card |
| K-16 | :1097-1107 | Action buttons on the respond card; a timer | The lit START guard still needs two presses after the card ("START doesn't work", owner 2026-10-06) | n/a | One button for the one lit action (§5.1 (a)) |
| K-12, Q-4, Q-89 | :1031-1053, :2319 | Routine manual SYNC; the scope on every start | The SYNC bay is the procedure bay's default face with five buttons for a flourish that matters 0% | True: plants auto-sync | Hide until offered; the bay opens on RESTORE/suburbs |
| D-7 | :1441-1447 | HAND as the default | Nothing; HAND is the harder mode | True: no NEM region flies without AGC | Keep |
| S-4 pace, "par never takes a synchroscope" | :814-818 | Par faster than 3 real s/action; par syncing | Par beats a 6-s human (competent 64–77% A); letters are calibrated to it (Q-48) | n/a | Keep; recalibrate `LETTERS` in 2d (Q-88) |
| H-11, K-7, J-23 | :728-736, :987, :2461 | Player-driven shedding as a reflex; "rotational shedding replaces UFLS" | None; the DIRECT SHED key appears at SHORT (Q-8) | True: AEMO directs; relays are automatic | Keep |
| OD-6, C-5 | :53, :78 | Inflating demand; cycling coal within a day; a July heatwave; a weak battery made strong | Heat days are the hardest and 15% of dates: most strangers never meet the duck's worst day; Y-9 costs L for realism's sake | NEM facts | Reopen Y-9 (cut); keep the physics |
| C-6 determinism, F-3 | :79, :590 | Events that depend on play | The day cannot react to a bored or a lost player (no adaptive difficulty); fairness instead | n/a | Keep; it is the daily's fairness |
| OD-2, C-9, Y-8 | :49, :82, :1951 | Phone play | Most Wordle links open on phones (Y-8 admits it); the share loop breaks on its first hop until Y-8 ships, and even then a phone recipient sees a landing page, not a game | n/a | Y-8 first; later a read-only phone replay of "the moment" (D-23-lite) so a phone recipient sees something |
| O-3, O-6 | :1590-1612, :1633 | Marg stating the plan; more than five introductions | The objective line states the plan; cover plates cost L | n/a | Own the line (§5.2) |
| D-8(c), Q-72 | :1459-1462 | Unwarned trips before 09:00, within 90 real s, inside RESPOND | The morning is quiet by design (D-10's 45-s storm-afternoon gaps, Q-90) | Credible trips are rare in reality; an event-dense day is already the labelled abstraction | Keep; gate 1 decides |
| F-11 | :1337 | A first visit over 400 KB | Two rounds of moving comments out of code (Q-49, Q-61), a byte ration per agent, 105 KB of README | n/a | Already abolished (Q-84); strike it from the SPEC |

---

## 10. Findings (ranked for the structured summary)

1. **Q-91's feeder card contradicts K-16, K-9, §7 and OD-16** (question, high). Evidence: SPEC:1102, :1104, :1011, :2148, :63; transcript 06:55 `feeder-restore "RESTORE HAR4" · feeder-go-on "GO ON"` and `HELD 0×`. Options (a)/(b)/(c) in §5.1; recommend (a), S.
2. **The share loop's cheapest parts are last** (opportunity, high). Evidence: end card controls at 04:00 `btn-save-log "DOWNLOAD REPLAY LOG" · btn-again "PLAY THIS DAY AGAIN"`; no `share`/`clipboard` in `app/`; Y-3/Y-4/Y-5/Y-8 at SPEC:1919-1957; `next.html:34` `min-width: 1280px`. Reorder per §7; "2d-lite + share" one slice (M).
3. **The objective line states the plan against O-3/L-9/K-16** (question, high). Evidence: SPEC:1611, :1286, :1102; transcript LINE at 04:30, 08:00, 11:00; desk/README §31.12 follower 1,015/1,021. Options in §5.2; recommend owning it and shrinking 2e (saves L).
4. **The SPEC describes a build two slices old** (spec-stale, high). Evidence: SPEC:8, :470, :1353-1355, :1374, :604-612 vs `sim/clock.js`, `app/director.js:216`; desk/README :3582-3660 (§32.2) unwritten; no Q-61+ in SPEC (grep). Fix S, then the structural fix in §8 (M).
5. **Nine Accepts waived or missed, two made false** (spec-stale, high). Evidence table §3: SPEC:849, :859-860, :1053, :1478, :1492, :1710, :2352, :1337, :2105, :687, :1064, :1496; desk/README Q-87 :3576, Q-89 :3578, Q-90 :3579; `perf.mjs --sizes` 416,007 B; transcript 21:40–21:42. Fix: a status per Accept (S).
6. **The spec's size** (opportunity/question, medium). Evidence: `wc`, §32 176 KB, §31.8+§32.12 105 KB, 11 override clauses, 11 `specPending`, 92 README commits in 13 days, §32.13's 60-finding review. Proposal §8 (M, saves L).
7. **Score, marks and share card described three ways** (spec-stale, medium). Evidence: SPEC:1508-1539, :414-437, :1925-1937 vs Q-48 :2387 and `app/endcard.js:3-6`. Decide the share card's face before Phase 4 (S).
8. **D-2's first-shift timing misses by ~35 s before reading time** (design-weakness, medium). Evidence: `play.mjs 20261014 timeline=04:30-04:00/6h clock` 306.8 s; `--returning` 288.3 s; SPEC:1389-1406, :2105, :2419. Cuts in §4 (S).
9. **§32.11 has no stage C measures record** (defect in the records, medium). Evidence: desk/README :4261-4304 promises; grep of :4306-4605 finds none; the only numbers are in commit 749f672's message. The §6 table is unmeasurable for 2c without a ~15-min tools pass.
10. **§4.1 and §4.2 are not the built day or the built desk** (spec-stale, medium). Evidence: SPEC:268-325 vs transcript 1.1/1.2, `next.html:26,64-66`, `desk/desk.css:273-275`; K-17:1117 "map ≥260 px" vs 210 px visible at the floor.
11. **The realism/differentiation rules to reopen** (question, medium). The §9 table; the ones with teeth today are OD-16/K-9/K-16 (finding 1), K-12's SYNC bay as the default face, O-3's cover plates, Y-9 and OD-2/Y-8.
12. **The briefing card is ~270 words against D-3's 60** (design-weakness, low-medium, interim until 2e). Evidence: `next.html:204-208` (154 words), `app/shell.js:116-118` (57), dayText, Watch for; SPEC:1407-1417. A stranger's first screen explains VCR and VER before the first press.
