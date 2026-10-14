# GRIDWATCH review, lens "agency": what the player actually decides

Read-only review of `v4-core-2c.1` (commit 52da14a). Everything below is from the code, the SPEC/README, and headless play on two of the shipped dailies: **20261014** (a Wednesday, `desk`) and **20261017** (a Saturday, `desk-weekend`). Par was run once per seed in-page (`app/par.js`, as the live SCORE chip does) and once headless (`sim/autopilot.js runPar`) to read its action log; the earlier run's 20-seed `tools/par.js` table (`agency-par-1-20.txt`) is reused, not re-run.

Working files (all in this scratchpad `review/` folder): `agency-census.mjs` + `agency-census-2026101{4,7}.txt` (the line-follower's asks), `agency-parlog.mjs` + `agency-parlog-2026101{4,7}.txt` (par's actions, ALL-IN of par / follow / no-input), `agency-variants.mjs` + `agency-variants*-2026101{4,7}.txt` (can a player beat the line?), the earlier run's `agency-desk-20261014.txt`, `agency-weekend-20261017.txt`, `competent-20261014.txt`, `tl-follow.txt`, `playpar.mjs`.

---

## 1. What a day asks of the player (the decision census)

`tests/lib/follow.js followDay` is the game's own "player who does only what the line says" (once a grid-minute it reads `app/objective.js` and applies the action the line carries). Its log of accepted asks IS the decision inventory of a daily. ALL-IN by `app/score.js allIn`, grade by `grade()` (score = 1000 × par ÷ you; A ≥ 962; ★ at ≥ 1000).

### 1.1 Desk day 20261014 (par ALL-IN $8.473M; follow $8.437M → **1004 A★**; no-input $285.3M → 30 D)

| grid time | act (real s left in act) | kind / level | control | the line says | lead / cost if missed |
|---|---|---|---|---|---|
| 04:31 | I (50 s for the act) | spare / act | GUARD ring → 400 | "If your biggest unit tripped now, frequency would fall to 49.33 Hz… Raise the battery GUARD to 400 MW" | set once, stays all day; without it the 19:19 trip nadir is 49.41 Hz (outside the band) instead of 49.51 |
| 05:00 | I | commit / act | START CCGT 2 | "You will be 200 MW short from 06:25 (the tie limited to 500 MW until 11:15). Start CCGT 2 now: it takes 49 min" | 49-min lead; missed → battery/governors carry 170-200 MW at 06:55-07:30 (do-nothing transcript) |
| 05:11 | I | spare / act | START HYDRO 3 | "Demand is covered, but if your biggest unit tripped… Start HYDRO 3 (7 min): it spins for free" | insurance; no trip can come before 09:00 (§4 below) |
| 06:46-07:00 | I (14 grid-min = **3.1 real s** at 270×) | city / plan ×6 | suburb card BOOK ×6 (HAR, SAL, HAZ, RED, SOL, TAL) | "The battery cannot take all of noon's spill. Book a HOT WATER SOAK in …, 11:00–15:00 (20…140 MW)" | free (SOAK_PRICE 0, no patience cost); all six together are worth +10 points |
| 06:55, 07:15 | I | restore / act ×2 | feeder card R/Enter | "2 districts are dark … and the permissive lamp is lit. Close a feeder: R, then Enter." | the clock holds; Esc (GO ON) is never right: dark load is priced at VCR $30,000/MWh from the hand-back |
| 06:56 | I | spare / act | START GT·A | "…if your biggest unit tripped the rest could not make it up in time. Start GT·A (12 min) for the spare." | insurance in a window with no trips; stopped again 82 min later |
| 08:18 | I | stop / plan | STOP GT·A | "Spare holds without it now: GT·A is not needed until 18:05. Stop it: saves about $303,000 if nothing trips before then." | the first real trade |
| 09:30 | II (57 s for the act) | battery / plan | dial CHARGE 70 | "The battery is at 63%. Charge it at 70 MW now, to be full by 15:30" | small |
| 09:39, 10:20 | II | stop / plan ×2 | STOP CCGT 2, STOP CCGT 1 | "CCGT 2 is not needed until 17:35. Stop it: saves about $50,000 if nothing trips before then. Start it again by 16:45." | **the day's heaviest decisions: all three stops together are +46 points** (958 B without them) |
| 12:19 | II | (card) | Enter | tie trip, RESPOND card | not a decision |
| 16:07, 16:39 | III (126 s) | commit / act ×2 | START CCGT 1, CCGT 2 | "From about 17:15 one trip would leave you short. Start CCGT 1 now: it takes 49 min" | 49-min lead |
| 17:00 | III | battery / plan | dial DISCHARGE 100 | "Gas is setting the price ($74). Discharge the battery at 100 MW, **all the GUARD leaves free**, down to 20%" | sized by what the ring leaves (500 − 400) |
| 17:01, 18:12, 18:32 | III | spare+commit / act ×3 | START GT·A, GT·B 1, GT·B 2 | "Start GT·A now (12 min): spare is short already, and from about 18:15 one trip would leave you short." | 12-min lead; the peak's insurance (the trip IS coming, §4) |
| 19:19 | III | (watch + card) | Enter | COAL 1 trips (the largest unit) | the moment |
| 19:20, 19:21 | III | commit / act ×2 | START GT·C 1, GT·C 2 | "Another trip now would leave you short. Start GT·C 1 now: it takes 9 min" | 9-min lead |

24 asks (D-10's 16–25 band). Of them: 6 soak bookings (identical, free), 2 feeder cards (one right answer), 1 GUARD (set-and-forget), 9 starts (the line names the cheapest unit that still arrives: no choice of unit), 3 stops, 3 battery orders. Two reasonable players would differ on perhaps 4–5 of these (the three stops, the GUARD/energy split, how early to commit CCGT 1 for the evening).

### 1.2 Weekend 20261017 (par $8.179M; follow $7.837M → **1044 A★**; no-input $227.6M → 36 D)

23 asks: GUARD 400 at 04:31; six soaks 06:31–06:36 (5 grid-min = **1.1 real s** at 270×); START HYDRO 3 06:38 (spare); two restores 07:00/07:50; STOP CCGT 2 08:54, STOP CCGT 1 09:35 (+6 points together); CHARGE 50 09:30, CHARGE 100 11:05, CHARGE 50 15:21; **START COAL 4 12:15** ("You will be 700 MW short from 14:25. Start COAL 4 now: it takes 2.1 h to reach the grid and 2.1 h more to full load"); START CCGT 1 13:20; DISCHARGE 100 17:02; START CCGT 2 17:03; GT·A 17:05, GT·B 1 17:33, GT·B 2 17:52 (spare); GT·C 1 19:14. The 17:49 trip is CCGT 1 (the largest unit online).

Q-32 (SPEC.md:2371) calls coal 4 "the weekend's decision: bring the fourth coal machine back by mid-afternoon, or run gas tonight". Measured: withholding the line's COAL 4 ask (`noCoal4`) gives 997 A (gas tonight: supply +$617k, carbon −$245k at VER $80/t). The fork exists in the sim and the line decides it for you, correctly. Carbon never flips it (it would need VER ≈ $200/t).

### 1.3 The asks against the clock (D-2 profile, `sim/params.js:349-352`)

| act | grid span | real s | line asks (desk day) | asks per real s |
|---|---|---|---|---|
| I | 04:30–09:00 | 50 | 13 (incl. 6 soaks in 3.1 s, 2 cards that hold) | 0.26 |
| II | 09:00–14:30 | 57 | 3 (+1 card) | 0.05 |
| III | 14:30–21:00 | 126 | 8 (+1 card) | 0.06 |
| night | 21:00–04:00 | 12 | 0 (the night shift is par's rules) | — |

The asks are shaped the opposite way to the clock: the fastest act carries half of them. The follow bot can do six suburb bookings in 14 grid-minutes because it acts once a grid-minute; a human at 270× has 3 real seconds for them. D-10's measure (Q-76, desk/README.md:3565) counts director moments too and reports 4/5/11 per act (Q-90, desk/README.md:3579); the line's *actionable* asks are 13/3/8.

---

## 2. Is "follow the line" the dominant strategy, and is that a game?

**Yes, it is dominant, and it beats par.** The line is par's rule set applied by hand (`app/objective.js` imports `aimFlex` from `sim/autopilot.js`; its constants mirror `PAR_*`: COMMIT_MARGIN_MW 650 vs PAR_COMMIT_MARGIN_MW 700, the same charge/discharge windows, the same water hold, the same GUARD maximum 400). On both dailies the follow bot scores above par (1004, 1044) with no judgement at all, and the earlier run's 20-seed table has the `competent` proxy (par's rules at half pace) at p50 1004 and `lean` at 985 (`agency-par-1-20.txt`).

**Can a player beat the line?** I tried every deviation the sim supports that the line never offers (`agency-variants.mjs`; one seed each, same bot otherwise):

| variant (desk day 20261014, follow = 1004) | ALL-IN | score | what happened |
|---|---|---|---|
| withhold the Act I spare asks (hydro 3 05:11, GT·A 06:56) | $8.375M | **1012** | nothing trips before 09:00 on the game's day, so the insurance was pure cost (GT·A: $8k start + ~$42k of no-load for 82 min) |
| GUARD 100 at 17:00 and DISCHARGE 300 for the peak | $8.393M | **1010** | the trip at 19:19 still contained (coal 1, 618 MW); $44k saved |
| morning discharge 300 MW 06:00–08:30 | $8.453M | 1002 | the line then asks for more spare starts |
| stop COAL 4 at 09:00 / 09:30 for the belly | $8.76M | 967 / 968 | more gas at the peak; worse |
| one soak instead of six / no soak | $8.515M / $8.520M | 995 / 994 | the six bookings are worth +10 in all |
| no stops | $8.840M | **958 B** | the stops are the day's only heavy decision |
| GUARD 200 all day | $8.440M | 1004 | supply −$220k, carbon +$223k: a wash |

| variant (weekend 20261017, follow = 1044) | ALL-IN | score |
|---|---|---|
| withhold COAL 4 (gas tonight) | $8.208M | 997 |
| GUARD 100 at 17:00 + DISCHARGE 300 | $8.488M | **964, with $652k of outage (UFLS on the 17:49 trip)** |
| morning discharge | $8.002M | 1022 |
| one soak / no soak / no stops | — | 1042 / 1039 / 1038 |

So the upside of thinking for yourself is at most +0.5–1% (8–10 points), and every bigger deviation costs 1–8%. The sim's reward surface is flat around par's policy, and the line sits on the flat top. For a stranger that is good (the lit button is right) and for the north star it is the problem: **the game as built is an execution test of a near-optimal hint** (find the lit guard, lift it, press it within the act's real seconds), not a judgement game. The one decision with weight (the three stops, +46 points) is also the one whose text already reads as a risk statement ("saves about $43,000 if nothing trips before then") — that is the seed of a real game.

---

## 3. Controls: worth touching vs never

| control | sim input | the line ever asks for it? | verdict |
|---|---|---|---|
| START / STOP guards | start / stop | yes (9 + 3 a day) | the game |
| GUARD ring | guard | once at 04:31 (then only after a trip) | set-and-forget; the trade-off with the dial is hidden (§5) |
| battery dial | battery | 2–4 a day, sized by the line | follow the number |
| suburb card SOAK | flex | 6 a day | chore (free, no downside) |
| suburb card AIR-CON | flex | only on HOT days (`levers.menu`) | not seen on these two mild dailies |
| RESTORE bay / feeder card | restore | 2 a day | one right answer |
| **unit levers (×5)** | basePoint | **never** | **trap**: a touch sets `sys.edited` (`app/system.js:14-16` HAND_EDITS) and the 5-min dispatch stops refreshing (`app/system.js:52-56` returns EMPTY while edited) until RE-DISPATCH, which rebuilds every lever from the forecast (`sim/autopilot.js replan` → `amend`) and discards the edit |
| **hydro gate wheel** | basePoint (`desk/rotary.js:149`) | never | trap (same) |
| **tie knob** | tie (`desk/rotary.js:398`) | never | trap (same). Played: knob to 700 at 06:00 → at 06:55 "‼ URGENT With levers held by hand the plan is 140 MW below demand now. RE-DISPATCH (N) hands every lever back to the plan." (`node tools/play.mjs 20261014 to=06:00 brief send='{"type":"tie","mw":700}' to=06:10 brief to=08:00 brief`) |
| Live Stack drag | planKey | never | trap (planKey is a HAND_EDIT too) |
| RE-DISPATCH | planLoad | only to undo a hand edit | an undo key |
| SYNC scope | syncClose / syncTrim | never | worth AUTO_SYNC_S = 240 s of a unit at minimum (~$2-3k on an $8.5M day); the OFFER plays at 30× for up to 8 real s, at most 3 a day (`app/game.js:52`) |
| DR (hold D) | callDR | only inside `shortNow` / `shortAhead` when already short (`app/objective.js:676, 763`) | recovery only: par made 0 calls on both dailies |
| BREAK GLASS (hold E) | armRERT | only when every unit is committed and the gap is beyond battery + DR (`reserveDiesel`, :714) | recovery only: 0 on both dailies |
| DIRECT SHED | directShed | **never** (no `key-shed` target anywhere in objective.js) | never |
| curtail wind/solar | curtail | never (the dispatch spills by itself) | never |
| AGC/HAND key | mode | never | HAND is a different day (Q-64) |

Eleven of the desk's controls are never the right thing to touch on a daily; the three most tactile ones (levers, wheel, knob) are actively harmful. SPEC §4.1 (SPEC.md:267-294) scripts the stranger's first daily with "GT·A lever twice, hydro wheel", "push GT·A's lever to 300 MW", "turn the gate wheel so the water lasts until 20:40", "drag GT·B to arrive by 17:00", and §6 keeps a target "Dispatch inputs made on the desk ≥ 50% (K-1)". L-6 (SPEC.md:1266-1271) says a lever move "writes that unit's next arrive-by keyframe… Later keyframes stay". The build does none of that: the correct number of lever inputs on a daily is zero.

---

## 4. The trip clock (a premise to challenge)

On the game's day the events come from `sim/dayplan.js preroll` (`sim/step.js:93`), not the legacy generator. `content/scenarios.js:235-255`: Act I is a constraint (tie derate or a late return) plus the feeder task — **no contingency**; Act II draws one belly crisis in **09:00–14:30** (front 40%, unit trip 25%, smelter 20%, tie 15%); Act III draws a **unit trip of the largest machine in 17:00–19:30** on every calm, drought and heat day (`sim/dayplan.js:85-86, 105-106`; `events.js:239-249` rule 'largest'), and a link trip after the cut-out on 60% of storm days. Both transcripts had their evening trip at 19:19 (desk) and 17:49 (weekend).

Consequences for the decisions:
- Every "spare" ask before 09:00 (GUARD at 04:31, hydro 3 at 05:11, GT·A at 06:56) insures against an event that cannot happen. Withholding them is +8 points. Par makes the same asks (rule 2), so following them costs nothing *against par*, but they are not decisions.
- At the peak, N-1 is not a risk to weigh but a certainty to prepare for: the right play is always full spare plus GUARD by 17:00. The line says so. A returning player learns in two or three days that "the biggest machine trips at the peak", and from then on the GUARD/energy split (§5) is the only thing left to judge, and it collapses too (never risk it).
- The trip takes the **largest** synchronised machine. That is the only lever a player has over the moment: keep CCGT 1 at 620 MW and it is CCGT 1; run coal 1 harder and it is coal 1 (the two runs differ exactly that way). Nobody tells the player this. It is a real, cheap, realistic decision (AEMO sizes the contingency reserve on the largest credible loss) that the game hides.

This is the owner's design (Q-66/Q-67, the "moment" in SPEC §4.1 at 18:40). I am challenging it as the thing that most flattens the decision space: a certain, scheduled trip turns insurance into a rule.

---

## 5. The one deep decision the sim has, and how the line hides it

The battery is 500 MW. The GUARD ring takes from the dial: `app/objective.js:1036` `lim = b.ratedMW - b.guardMW`, and every discharge the line sizes is "all the GUARD leaves free" (the 17:00 lines on both days: 100 MW). The line sets the ring to 400 at dawn and never lowers it before the peak. Par does (rule 2 steps it 400 → 200 → 100 between 18:01 and 18:50 on the desk day and discharges 264 MW at 19:16; `agency-parlog-20261014.txt`). The branch order (`app/objective.js:419-424`: `commitNow, shortAhead, aircon, restore, spare, pickupAhead, stop, battery, soak, commitLater`, first with an action returns) means that while `spare` wants the ring higher the `battery` branch is never read. A player who lowers the ring to free the battery sees "▶ ACT NOW … Raise the battery GUARD to 400 MW" in red until they put it back.

Measured: ring 100 + discharge 300 at 17:00 is +6 points on the desk day and −80 with $652k of UFLS on the weekend. That is exactly the risk/return decision a grid operator has (FCAS enablement vs energy; NEMDE co-optimises it every 5 minutes) and the game already prices both sides (VCR for the shed, the gas price for the energy). It just never puts them in one sentence.

---

## 6. Par and the player (S-4 fairness)

What par sees: `observe()` only (S-4; `sim/README.md §8`), the same forecast and plan the line reads (`app/game.js:758-763` gives the line the day-ahead forecast too). No information edge either way.

What par does that the player cannot or would not:
- **The tie.** Rule 1 and rule 2 set the tie to the secure import after a trip or when R5 is tight (`sim/autopilot.js:1024-1030, 1061-1066`) and the plan is amended around it (`decide`, :1686-1689) so the hold survives the re-flow. The same `tie` input from the desk knob is a HAND_EDIT: the dispatch stops and RE-DISPATCH discards it. One 'tie' action a day on both seeds; the player's plan re-imports by price anyway, so the score cost is small, but it is a thing par may do and the player may not.
- **Pace and precision.** 56 and 50 discrete actions a day (desk, weekend): 23 and 18 GUARD steps, 14 and 12 battery re-sizes to the MW ("charge 147", "charge 38"), one action per 3 real s (`PAR_ACTION_GAP_REAL_S`). The follow bot beats par with 24 and 23 actions, so the precision buys par nothing — but the player who opens the end card sees "PAR" as a machine's log, not a colleague's day. Q-76 already says GUARD steps and re-sizes "are the system's work, not decisions".
- Par never takes the synchroscope (S-4 says "a clean manual close can beat it"): worth ~$2-3k.
- The restore pace is equalised by Q-91 (`holdOf`). The watch lock applies to both.

Fair in information; the asymmetries are in what counts as an action, and they do not decide the grade.

---

## 7. Where the line hides the decision behind a number the player cannot check

- "Stop it: **saves about $303,000** if nothing trips before then." — `stopSaving` (`app/objective.js:322-355`) is a forty-line stack simulation over the forecast with the water value, the tie as a price-taking block, no-load and the start cost. Nothing on the desk shows it; the comment admits "a stop quoted at $36,000 realised −$52,000 and −$90,000" on hot days. The player's only check is faith. (The debrief that could show it is 2d, unbuilt.)
- "You will be **150 MW short** from 06:25" at 04:30 — `capacityShort` with MARGIN_MW 150 and COMMIT_MARGIN_MW 650 over the forecast, while the Live Stack's red is "plan short of P50 by GAP_MIN_MW" (`app/planview.js:352-353`). Two different definitions of "short"; the player cannot reconcile the line with the stack.
- "If your biggest unit tripped now, frequency would fall to **49.33 Hz**" — this one is checkable (T PREVIEW, the gauge's ghost needle). Good.
- "**‼ URGENT** The plan is 200 MW below demand now: discharge the battery at 100 MW, or start GT·C 2 (9 min). It answers in seconds." — played after the 19:19 trip with GT·C 1 running (`node tools/play.mjs 20261014 click=guard-start-ccgt2 click=guard-start-ccgt2 send='{"type":"guard","mw":400}' until=card key=Enter jump=07:00 click=guard-start-hydro3 click=guard-start-hydro3 until=card key=Enter jump=17:00 key=Enter jump=17:00 click=guard-start-gta1 click=guard-start-gta1 jump=18:00 click=guard-start-gtc1 click=guard-start-gtc1 until=card key=Enter to=19:25 brief to=19:32 brief to=20:00 brief to=21:00 brief`): at 19:25 the line is URGENT while `LIGHTS ON 99.9%` and `BALANCE SHORT 400 MW held up by battery 400`; at **20:00 `BALANCE BALANCED` and the line still reads "‼ URGENT The plan is 100 MW below demand now: discharge the battery at 100 MW"**; it only relents at 21:00. `shortNow` (`app/objective.js:648-651`) tests the plan's red column against the real check, and the plan does not carry what the battery is giving through AGC. The loudest level the line has is spent on bookkeeping while the grid is fine, and the order it asks for (100 MW) is smaller than what the battery is already giving (400 MW).

---

## 8. Decisions the sim supports that the line never surfaces

- Which machine will trip (keep L small): see §4.
- GUARD vs energy: §5.
- DIRECT SHED ahead of UFLS (K-7: "Operators shed ahead of a forecast shortfall; relays handle the seconds"): never targeted. On the do-nothing day the sim shed by itself ("DIRECTED SHEDDING: frequency below 49.5 Hz for over 1 min. One district per minute"), then UFLS took nine districts at 19:19. A deliberate 200-MW shed of the lowest-patience district before the peak, versus 800 MW by relay, is a real operator decision with a real trade (VCR either way, but 200 vs 800 MWh); the game never offers it.
- Coal cycling: `stopCandidate` is gas only (`app/objective.js:976-986`); par stops at most one coal machine a day and only at MSL2 ≥ 3 h. Measured, a coal stop in the belly is −36 points on the desk day, so the line is right not to offer it — but the player cannot learn why except by losing.
- The tie as a trade (export at the neighbour's evening price, import in the belly): the plan does it; the knob is a trap.
- Water: K-4's "water lasts until HH:MM" is a decision the SPEC wants and the wheel cannot make.

---

## 9. Findings

Impact is on the north star (a stranger finishes and shares).

**F1 — design-weakness, high.** Following the lit button is the whole game and it beats par. Evidence: `agency-census-20261014.txt` (24 asks → 1004 A★), `agency-census-20261017.txt` (23 → 1044 A★), `agency-variants*.txt` (every deviation −1…−8% except two of +0.5…1%). Proposal: accept that the line is the plan and make the game the *trades* it already names: the stops (F9), the GUARD/energy split (F3), the spare-as-insurance (F4). Cost M; realism: these are the real operator's trades (commitment, reserve, FCAS vs energy).

**F2 — defect (against the SPEC), high.** Levers, hydro wheel, tie knob and the stack drag are traps: one touch halts the 5-min dispatch until RE-DISPATCH, which discards the touch. Evidence: `app/system.js:14-16, 52-56`; `desk/rotary.js:149, 398`; `desk/levers.js:269`; the 06:00 tie play above ("With levers held by hand the plan is 140 MW below demand now"). SPEC L-6, K-4, K-6, §4.1 and §6 (K-1 ≥ 50% desk inputs) say the opposite. Proposal, two options: (a) honour L-6: a lever/knob/wheel move becomes a plan keyframe the periodic re-flow keeps (`app/system.js`: treat basePoint/tie/planKey as plan content, not `edited`) — cost M, realism good (rebids and targets are honoured by NEMDE); (b) cover them on the daily (O-3's "AUTO — Marg" plates, planned for 2e) and uncover in a practice mode — cost S. Recommend (b) now, (a) if 2e keeps the levers in the stranger's hands.

**F3 — design-weakness, high.** The GUARD/energy trade-off is hidden by branch order and sizing. Evidence: `app/objective.js:419-424, 1036`; census 17:00 lines "all the GUARD leaves free"; variants `guardDown1700` (+6 desk, −80 weekend with $652k UFLS); par's own 400→100 steps in `agency-parlog-20261014.txt`. Proposal: one evening line that states both sides with the trip preview: "GUARD 400 holds a 620-MW trip at 49.5 Hz; every 100 MW you free for the dial earns about $N tonight" and lets the ring be lowered without a red ACT NOW. Cost S–M. Realism: FCAS vs energy co-optimisation.

**F4 — question, high.** The trip clock makes spare a tax in Act I and a rule at the peak. Evidence: `content/scenarios.js:235-255`, `sim/dayplan.js:85-106`, `sim/step.js:93`, variants `noSpareActI` (+8). Options: (a) keep the certain evening set piece and say it in the briefing ("the peak gets a trip; be ready") so the spare asks read as preparation, not odds; (b) draw the moment's time anywhere in 09:00–19:30 and add a 10–15% second trip, so Act I/II spare means something (cost M: dayplan, daily-gen, the gate; realism: trips do not keep office hours); (c) price the spare in the line ("GT·A for the next hour: about $50k; a 620-MW trip uncaught: about $2M at VCR") so even a scheduled world has a priced choice (cost S). Recommend (c) now and (b) with 2d, when the debrief can show "you were insured / you gambled".

**F5 — design-weakness, medium-high.** The asks are shaped against the clock: 13 of 24 in Act I's 50 real s (six soak bookings in 3.1 s), 3 in Act II's 57 s, 8 in Act III's 126 s. Evidence: census times; `sim/params.js:349-352`. Proposal: one soak ask for the city (F7), the Act I spare asks dropped (F4c), and the belly's stops and charge moved into Act II's quiet (they already are: deepen them, F9). Cost S.

**F6 — defect, medium.** ‼ URGENT for 35+ grid-minutes while the lights are on and BALANCE reads BALANCED (20:00). Evidence: the play command in §7 and its lines; `app/objective.js:648-651`. Proposal: `shortNow` counts the battery's AGC carry (obs.battery outMW) before calling the plan red an emergency, or words it as what it is ("the battery is carrying 400 MW by itself; order it so the GUARD re-arms"). Cost S.

**F7 — design-weakness, medium.** Six identical free soak bookings and two one-answer feeder cards: 8 of 24 asks are chores. Evidence: `sim/params.js:487` SOAK_PRICE 0; `sim/grid.js:538` (soak costs no patience); variants `oneSoak`/`noSoak` (all six = +10); the end card's "Feeders under repair count from their hand-back" (Esc is never right). Proposal: one "soak the city" booking (or the first booking books the rest), and the feeder card stays a moment (it already holds the clock, Q-91) but is not counted as a decision. Cost S. Realism: SAPN's solar sponge is a tariff for everyone.

**F8 — design-weakness, medium.** The emergency desk is never the right first move on a gated daily. Evidence: par 0 callDR / 0 armRERT / 0 shed on both dailies (`agency-parlog-*.txt` by-type); D-9 makes par shed zero on every daily; the line offers DR only when already short (`app/objective.js:676, 763`) and DIRECT SHED never. Proposal: let `tools/daily-gen.js` report the share of dailies on which par calls DR or arms the diesel (K-7's accept already names ≤ 25%) and make sure heat days keep one DR call as the right move; give DIRECT SHED one line ("shed SOL3 now, 190 MW, or the relays take 800 at the nadir"). Cost M. Realism: DR/RERT are heat-day tools; pre-emptive shedding is real.

**F9 — opportunity, medium.** The stops are the only decision with weight and already read as a risk statement. Evidence: variants `noStops` (958 B vs 1004); `app/objective.js:1019-1022` ("saves about $43,000 if nothing trips before then"). Proposal: say the other side in the same line ("a trip while it is off costs about $X of dearer starts"), and let 2d's counterfactual replay the day with the stop not made. Cost S (line) / part of 2d.

**F10 — spec-stale, medium.** SPEC D-10 "Today: 0.2 / 3.2 / 3.2" (SPEC.md:1490) vs Q-90's 4/5/11 (desk/README.md:3579); §4.1's scripted lever/wheel inputs and §6's "Dispatch inputs made on the desk ≥ 50%" vs a build where the right number is zero; L-6's keyframe semantics vs `HAND_EDITS`; S-4's "a clean manual close can beat it" is worth AUTO_SYNC_S = 240 s of minimum load (~$2-3k) while the OFFER slows the clock to 30× for ≤ 8 real s up to three times a day (`app/director.js OFFER_RATE`, `desk/bay.js SCOPE_AUTO_REAL_MS`, `app/game.js:52`). Proposal: rewrite D-10's "today", K-1's accept and §4.1's inputs to the built game, or fix F2 and keep them. Cost S.

**F11 — design-weakness, low-medium (S-4).** Par holds the tie after a trip while its plan re-flows (`sim/autopilot.js:1024-1030, 1686-1689`); the same input from the knob is a hand edit. Par's 50–56 actions a day with 18–23 GUARD steps and 12–14 battery re-sizes to the MW are a machine's precision. Neither decides the grade (the 24-action bot wins), but the "PAR" column on the end card is not a colleague's day. Proposal: either give the player the rule-1 answer as one button on the card ("IMPORT MAX") or drop par's tie action; show par's action count on the end card so "par" has a size. Cost S.

**F12 — question, medium.** Values forks: the weekend's coal-or-gas fork (Q-32) has one right answer at VER $80/t (1044 vs 997) and the line names it; carbon never flips a decision on these days. Options: (a) leave it (one right answer, the line finds it); (b) tune VER (≈ $150–200/t) or add a per-day carbon-price notice so some dailies' cheapest and cleanest answers differ and the line shows both ("COAL 4: −$600k, +3,000 t; gas: the reverse"); (c) make the share card carry both numbers so players choose their own objective. Recommend (b) with (c): a decision only exists where reasonable players differ, and cost-vs-carbon is the one every Australian reader already argues about.

---

## 10. What I did not do

No browser, no server, no whole-suite run, no `tools/par.js` re-run (the earlier run's 20-seed table is reused). Variants are one seed each: they show that a deviation *can* cost or earn what it did, not a distribution. The HOT-day air-con lever was not exercised (both shipped dailies I played are MILD; `levers.menu`).
