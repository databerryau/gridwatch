# GRIDWATCH review — lens: REALISM AND WHAT THE PLAYER LEARNS

Reviewer key: `realism-edu`. Read-only. Build reviewed: `v4-core-2c.1` (main at 52da14a), 2026-10-14. This is the finished report; an earlier draft was cut off, and every claim in it was re-checked against the working tree and re-played on this run before being kept.

## 0. Method

Read in full: SPEC §0, §1, §4, §8 (2157–2304), §9.1 (2310–2415) and the H-2/H-8/H-11/K-5/K-7/P-6..P-9/D-21 paragraphs of §5; `sim/params.js` (every record and its label); `sim/physics.js`; `sim/market.js`; `sim/fleet.js` (start block, trip lockout); `sim/grid.js` (hot test 226–233, AGC band 694–750, directed shedding 1011–1036, security level 1200–1212); `content/text.js` (all "?" rows); `content/alarmhelp.js` (all 12 explainers); `content/anchors.js`; `app/watch.js`; `app/endcard.js`; `app/shell.js` 78–120 (briefing); `app/tray.js`; `desk/dial.js`, `desk/rotary.js`, `desk/levers.js`, `desk/emergency.js` (the desk's own words); `desk/README.md` §32.1 (Q-72, Q-85).

Played headless with `tools/play.mjs` on today's daily, 20261014: a HOT weekday, tie imports limited to 500 MW until 11:15, feeders HAR4/HAR3 handed back 06:55/07:15, a tie trip at 12:19 while exporting 300 MW, an unwarned CCGT 1 trip at 19:19. Outputs saved beside this report in `review/t/`:

- **T1** = `node tools/play.mjs 20261014 timeline=04:30-04:00/30m` (the no-input day; Enter at every card; 513 lines). "T1 line N" is the Nth line of that output.
- **T2** = `node tools/play.mjs 20261014 --returning to=06:00 'send={"type":"start","unit":"ccgt2"}' jump=07:00 key=Enter jump=07:30 key=Enter 'send={"type":"start","unit":"gtc1"}' jump=12:00 'send={"type":"guard","mw":400}' jump=12:30 key=Enter 'send={"type":"start","unit":"gtb1"}' 'send={"type":"start","unit":"gta1"}' jump=16:30 brief until=trip brief real=30 brief until=card brief` (a competent-ish day with the GUARD at 400 MW).
- **T3** = the same prefix with `until=trip real=0.6 brief real=0.8 brief real=1.5 brief real=3 brief` (the watch beats).

The day is deterministic, so a verifier gets the same lines. No browser, no server, no whole-suite run, no slow tools.

---

## 1. Fact check against the real NEM

Verdict first: the physics layer is the most carefully sourced thing I have seen in a game. SPEC §8.1 (2168–2223) carries URLs and confidence tags, `sim/params.js` wraps every number in `src()`/`simp()` with a label and an `unverified` flag, and `content/text.js` builds every "?" sentence from the params so the words cannot drift from the numbers (its header, lines 1–19, says so and `tests/text.test.js` enforces the row titles). What follows is where it is wrong, where it is honest, and where a game rule is wearing realism's clothes.

### 1.1 Right, and labelled honestly (no action)

| Topic | Game | Real NEM | Verdict |
|---|---|---|---|
| Frequency bands | 49.85–50.15 normal; 49.5–50.5 containment; 47–52 extreme; 5-min recovery (`params.js` 115–119) | FOS 2023 Tables A.2/A.3 | Right. Applying the mainland Table A.3 to an electrical island is labelled (`text.js` 255–263: Table A.4 would allow 49.0–51.0). |
| RoCoF | 1 Hz/s over any 500 ms (`params.js` 96–97) | FOS Table A.2 mainland | Right. |
| Mandatory PFR | deadband ±0.015 Hz, droop 5% (`params.js` 79–80) | PFRR 2020 | Right. The ±12% of rating cap (`GOV_CAP_FRAC`, 81) is a modelling choice flagged `simp`. |
| Load relief | 0.5 %/% (78) | AEMO mainland assumption since 2020 | Right. |
| Battery PFR | full output 0.85 Hz beyond the deadband, ~1.7% droop (82–85) | AEMO 2025 frequency review | Right; §9.1 Q-1 (SPEC 2316) was a good catch that the prototype's full-swing battery was unreal. |
| Contingency FCAS timeframes | Very Fast 1 s, Fast 6 s, Slow 60 s, Delayed 5 min (§8.1 "FCAS timeframes"; `GUARD_DELIVERY_S` 1 s, 87) | VF raise since 9 Oct 2023 | Right in the ledger; the desk never says the words (finding 1). |
| Inertia | H = 5 s coal, 4.5 s CCGT, 3.5 s OCGT and hydro (`params.js` 252, 195, 211/227, 258); SPIN 18.1 GW·s at dawn, 25.3 at the peak (T1 line 7, T2) | textbook ranges; mainland average ~84,000 MW·s (§8.1) for a ~25-GW system | Proportionate (about 4 GW·s per GW of load) and honestly listed in §8.3 as "swing-equation constants (textbook only)". |
| UFLS | first stage 49.0 Hz, ~0.3 s, 8 stages, blocks shed net load whatever their flow (101–105; `physics.js` 227–246) | AEMO UFLS arming paper; QLD 2021 | Right in substance; the 0.125-Hz spacing and 6%/stage are labelled (`text.js` 344–355) and the "static blocks shed net load at noon" weakness is the one AEMO warns of, said on the "?". |
| Rooftop inverters | AS/NZS 4777.2:2020 Australia A: 50.25 → 52 Hz linear, 0.1-Hz hysteresis, 60-s reconnect, 6-min ramp, lowering only (444–450; `physics.js` 288–300) | The standard | Right. A nice consistency: 52 Hz is also where the game goes black, and it is the inverters' own over-frequency limit. |
| Wind/solar PFR | lowering only, 5% droop (451) | Mandatory PFR: down always, up only from curtailed headroom | Right, and the "?" says exactly that (`text.js` 368–371). |
| OFGS | wind trips in stages 51–51.75 Hz (109) | SA OFGS | Reasonable; labelled M. |
| Price cap/floor | $23,200 / −$1,000 (325–326) | AEMC FY2026-27 | Right. |
| Negative prices | wind/solar offered at −$20; thermal min-load blocks at −$1,000 (307, 330) | Q4 2025 average negative price −$19.4 | Right, and close to how real floor-price intervals arise (must-run plant offered at the floor). |
| Five-minute dispatch, AGC 4 s | `system.js` every 5 grid-min; AGC cycle 4 s (142) | 5MS since 1 Oct 2021; AGC setpoints up to every 4 s | Right. |
| Pre-dispatch | computed once at 04:30; RE-DISPATCH re-runs it on demand (`text.js` 160–171; §8.2 rows) | AEMO re-runs pre-dispatch every 30 min; generators self-commit against it | Labelled honestly in the row's `real`. |
| VCR, VER, STPIS exclusions, SAIDI/SAIFI/MAIFI | $30,000/MWh; $80/t (2026); cl. 3.3(a)(2)–(4); 3-min sustained (327–329; `market.js` 413–425) | AER 2024 VCR; AER VER guidance; STPIS v2.0; Reliability Measures Guideline | Right as the ledger states them (I did not re-derive the VCR tables), and the end card says plainly that STPIS "would not count this shedding" (`endcard.js` 148). This is the part a DNSP data person will trust. |
| RERT cost | $16,000/MWh activation (314) | NSW 27 Nov 2024 | Right; the all-in $56,359 is in §8.1. |
| MSL framework | MSL1/2/3 as tray notices; backstop not built (438–443) | AEMC MSL paper 2026 | Right in structure; our floors labelled unverified. |
| Hot-water soak, air-con cycle, snapback | SAPN window; 17–50% snapback (470–488) | SAPN tariffs; SDG&E/SCE | Right in shape; magnitudes labelled game tuning. |
| Two-shifting | CCGT min down 3 h, hot start 45 min (`params.js` 186–193); plan line "Stop it: saves about $45,000 if nothing trips before then" (`objective.js` 1021–1022; T1 line 119) | CCGTs two-shift daily in the NEM | Right, and the stated-bet wording (Q-38) is the honest version. |
| Coal ramp 3 MW/min per machine | 241, flagged UNVERIFIED | NER cl. 3.8.3A: an offered ramp rate may not be below 3 MW/min (or 3%/min for small units); many coal units bid that floor | **More defensible than the ledger thinks**: it is the regulatory floor. Promote to M (finding 10). |
| GUARD trigger 49.75 Hz | 86, flagged unverified, "chosen between 49.85 and 49.5" | MASS switching-controller settings sit in that interval | Inside the real range; keep the flag until the MASS is cited. |
| COVER after a trip | R5 ≥ L within 30 min, not the NEM's secure state (`text.js` 747–757) | NER 4.2.6 | Honest to the point of confession: "The NEM's test would call most mornings insecure, par's included." See finding 3. |

### 1.2 Wrong or stretched, but labelled (keep, maybe reword)

| Topic | What is off | Where labelled |
|---|---|---|
| Coal hot start 120 min (T1 50 + T2 70) | Real black/brown coal hot starts are hours to sync and more to load; the split by class is invented | `params.js` 242–244 UNVERIFIED; §8.3. Fun-positive: it is what lets a tripped coal unit come back for the peak (D1). Keep. |
| Minimum down time counted to START, not breaker close | 54 min stricter than real | `text.js` 440–450. Keep. |
| Hydro spins free (no no-load water, full inertia at 0 MW) | Real speed-no-load draws a few % of flow; condenser mode is a separate, costed operation | `text.js` 585–598 (the row itself names condenser mode). Keep; it is secretly the game's synchronous condenser (finding 5). |
| DC tie, player-set flow | Most NEM links are AC; NEMDE sets flows | `text.js` 245–253. Keep. |
| AGC on every unit | Real AGC moves only units enabled for regulation FCAS, a market service | `text.js` 233–243 says what AGC does, not that it is a market service. One clause (finding 12). |
| "The player commits units and sets output" | Generators self-commit; AEMO dispatches and directs | `text.js` 224–231. Keep: it is the chosen fantasy (OD-14). Needs saying once on the face (finding 8). |
| CUSTOMER COST = resource cost, shown as c/kWh | Customers pay market price plus network charges | `text.js` 305–313. Happy accident: 3–4 c/kWh is about the real wholesale energy cost, so the number teaches "energy is a fraction of your bill", which is true. |
| Collapse after 20 s at 47.5–48.0 Hz | Protection, not a timer | `text.js` 357–363. Keep. |
| Restore 5 min apart, cold load ×1.5 | Callide-like | `text.js` 462–486. Keep. |
| Night shift 21:00–04:00 | Real control rooms hand over; generators stand down through the market | `text.js` 684–698. Keep; honest. |
| Warning leads sized to real seconds | The Bureau warns days ahead | `text.js` 735–745. Keep. |
| Event-dense day | A real operator sees a few trips a year | `text.js` 122–141. Keep; the row's `real` says it plainly. |

### 1.3 Unlabelled: game rules presented as the grid (the findings)

1. **The GUARD ring is contingency FCAS set by hand, and nothing on the desk says so.** `content/anchors.js` has no entry for `ring-guard` or `dial-battery` (grep: 0 hits for "guard"); `content/text.js` has no row whose `game` is the ring (the word appears only inside the AGC row, 238, and the min-down row, 447); SPEC §8.2 (2227–2304) has no row for it either (the battery facts sit in §8.1 only). The desk's only words are `desk/rotary.js` 242 ("GUARD ring: battery MW held back to catch trips") and 333 ("FFR ARMED: 400 MW held back on the GUARD ring, delivered within 1 s of a trip"). In the real NEM AEMO buys raise contingency services (very fast 1 s, fast 6 s, slow 60 s, delayed 5 min) every 5 minutes, sized to the largest credible contingency; batteries earn much of their revenue holding that headroom. SPEC Q-1 (2316) says exactly this, but the player never reads §9.1. The 49.75-Hz trigger and 10-min sustain are unverified (`params.js` 86–88). Finding 1.
2. **The hot-unit trip (H-2).** "Spring gate at 96% of available: above it a machine runs hot; after 5 min hot it may trip (≈3.5%/h)" (`desk/levers.js` 423–424; `params.js` 152–155; SPEC 518–523). No §8.2 row, no "?" row, no "GRIDWATCH's own rule" tag; the only other mention is the lockout length in passing in the event-dense-day row (`text.js` 136: "120 min after an overheat trip"). The real NEM has no such mechanism: MaxAvail is a hard ceiling that units sit at all day, and trips correlate with heat (already modelled: `HEAT_THERMAL_DERATE` 157, Q-85) and age, not with running at nameplate. Worse, `sim/grid.js` 228 tests `u.outMW`, which is schedule plus governor MW (`physics.js` 165–166), while AGC parks base points at exactly 96% of available (`grid.js` 700–703, 746: "so AGC never makes a unit run hot"), so a unit doing its mandatory governor duty in a sustained under-frequency is "hot" and draws the random trip. Evidence from the no-input day: T1 line 232 (18:00) `lever-coal "96%"=2496` (= 0.96 × 4 × 650); T1 lines 236 and 239 (18:30) `BALANCE SHORT 220 MW held up by governors 160 · load relief 50 ! AGC limit` and `lever-coal "✕ 3.5%/h"=2496 · lever-ccgt "✕ 3.5%/h"=621`. The player touched no lever. Finding 2.
3. **The directed-shedding timers.** `content/alarmhelp.js` 25–27 (UNDER FREQ, WHY): "Out of the band 5 min (under 49.5 Hz: 1 min), districts are shed; at 49.0 Hz relays shed at once." The ON THE REAL GRID row beneath (30–33) quotes the FOS and the UFLS paper and ends "All well established", so a reader takes the 5-min/1-min shedding as part of the same standard. It is not: the FOS 5 minutes is a recovery *standard*; AEMO sheds by direction at LOR3 or when the system cannot be returned to a secure state, never on a frequency stopwatch at one district a minute. The §8.2 row that owns it (`text.js` 452–460, "No reflex test: the rule is visible and automatic") is anchored to `key-shed`, which the desk shows only while SHORT or SHEDDING (`desk/emergency.js` 202–203, 230; Q-8), i.e. only during the crisis it explains. Finding 4.
4. **The N-1 word TIGHT.** `sim/grid.js` 1209–1211: SHORT only when R5 < L; a failing TRIP PREVIEW only makes TIGHT. T1 line 19 (05:30): `N-1 ! TIGHT SPARE IN 5 MIN ✓1121 RISK: COAL 1 621 ✕ 48.99 Hz` (the preview is below the first UFLS stage). T2 at the trip tick 19:19:00: `N-1 ! TIGHT ... ✕ 48.73 Hz`. The COVER row (`text.js` 756) concedes the NEM "would call most mornings insecure". The "?" (`text.js` 327–342) defines the words correctly, but a stranger reads TIGHT as "a bit tight", not "the next trip darkens two suburbs". Finding 3.
5. **RERT by key, any time.** `BREAK GLASS $16,000/MWh · 300 MW · 20-min lead` (T1 line 10). Real RERT is contracted and activated by AEMO after a forecast LOR2/LOR3 and a failed market response. The cost is honest; the availability is a game rule with no row. Low priority: the price keeps strangers from spamming it (par arms it on ≤25% of days, Q-2).

### 1.4 Things the ledger could add (low cost, raises confidence)

- NER cl. 3.8.3A minimum ramp rate: makes the coal 3 MW/min a documented floor, not an UNVERIFIED guess.
- MASS: the switching-controller trigger window for contingency raise, to settle `GUARD_TRIGGER_HZ`.
- The "(likely)" tags in `alarmhelp.js` 115 (5-minute settlement since 1 Oct 2021) and 54 (NER 4.2.6, 30 minutes) understate facts the ledger itself rates H/M; "well established" for both.
- A grid-forming / synchronous-condenser row (§8.3 lists grid-forming params as unverified; SA's four syncons have run since 2021 and Hornsdale grid-forming since 2022). Needed for finding 5.

---

## 2. What a day actually teaches, in the words the player sees

Collected from T1/T2/T3 and the code that writes them. These are sentences a stranger meets without opening a "?".

**Plan ahead, because plant is slow** — `LINE ▶ ACT NOW You will be 150 MW short from 06:25 (the tie limited to 500 MW until 11:15). Start CCGT 2 now: it takes 49 min to reach the grid.` (T1 line 5; `objective.js` 288). True and well put. The whole morning is this lesson.

**A battery catches a trip, and you decide how much** — `If your biggest unit tripped now, frequency would fall to 49.15 Hz: too low to be secure. Raise the battery GUARD to 400 MW: it catches the fall in the first second.` (T1 line 83; `objective.js` 927–928). True to the NEM (contingency FCAS from BESS). But the word GUARD is never tied to the real thing (finding 1).

**Two-shifting is a bet** — `CCGT 1 is not needed until 16:50. Stop it: saves about $45,000 if nothing trips before then. Start it again by 16:00.` (T1 line 119). True; "if nothing trips" is the honest bit.

**Negative prices and arbitrage** — `Power is being spilled and the price is −$20. Charge the battery at 200 MW: it takes what would be wasted, and tonight that is worth gas prices.` (T1 line 137; `objective.js` 1085–1086). True. The MIN GEN explainer adds the structural reason: `Rooftop solar empties midday; coal and gas cannot go below their minimum.` (`alarmhelp.js` 133).

**The catch order, in physical time** — the full watch (first trip only, `director.js` 101): `Stored spin in every turbine takes the hit. Frequency falls.` → `YOUR GUARD: 400 MW. The battery answers within a second.` → `Governors open the valves. The fall stops at 49.531 Hz.` → `Droop parks frequency below 50. Restoring fifty is AGC's job, and yours.` (`watch.js` 41–48). T3 shows the engine behind the words: T+0.70 s `spin 420 · battery 180`, T+1.44 s `battery 490 · governors 70` at 49.534 Hz (the nadir), T+2.94 s `battery 490 · governors 160`. The order inertia → battery → governors is the real one (SPEC J-25 corrected the owner's wording on physics grounds, rightly).

**The respond card** — `NADIR 49.531 Hz: contained within 49.5–50.5 Hz ✓. Back to 49.85–50.15 Hz within 5:00. Caught by: spin → battery 494 MW → governors 103 MW → load relief 30 MW. N-1 SHORT: 41 MW short: cover it within 29:30.` (T2). One card carries the FOS containment band, the recovery standard, the catch breakdown and NER 4.2.6's 30 minutes. It is the densest lesson in the game and it reads well, with two flaws (finding 6): "load relief" is unexplained jargon, and the player's own 400 MW guard is folded into "battery 494 MW".

**Loss of load is the mirror** — the 12:19 tie trip while exporting: `PEAK 50.196 Hz: contained ✓ … Caught by: spin → battery took 109 MW → load picked up 4 MW → solar and wind backed off 188 MW.` (T1 line 151). A stranger sees inverters backing off on over-frequency: the AS/NZS 4777.2 response made visible. Excellent, and rare in any public explainer.

**Cold load and restoration** — `HAR4's feeder in Harbourside is repaired: about 240 MW with its cold load.` (T1 line 35); the bay row `HAR4 · REPAIRED 241 MW ×1.5`. The "×1.5" is unexplained on the face but the restore "?" covers it.

**The value of an outage** — `GOALS_TEXT` on the briefing (`shell.js` 116–119): "…plus $30,000 for each MWh dark that is yours…, plus $80 a tonne of CO₂: regulators' values of reliability and emissions." and the end card's arithmetic rows (`endcard.js` 125–131). A DNSP data person recognises VCR/VER at once; a stranger learns that an hour dark is worth a thousand times the energy.

**Directed shedding** — `DIRECTED SHEDDING: frequency below 49.5 Hz for over 1 min. One district per minute until it recovers.` (T1 line 243; `grid.js` 1032–1034). Dramatically right, factually a game rule (finding 4).

**The no-input day, as a story** — T1 is the day with nobody at the desk: TIGHT from 04:30, SHORT by 18:00 (`key-shed "▣ DIRECT SHED SOL3"` on line 232), UNDER FREQ and directed shedding of three districts 18:30–18:54 (lines 239–259), then the 19:19 CCGT trip takes frequency to 48.652 Hz and UFLS sheds 814 MW: nine districts dark (line 279). That is the right consequence for a game whose commitment is the player's (Q-18), but see myth 1 below.

### 2.1 Myths a day could leave behind

1. **"If the control room does nothing, the lights go out at 18:30."** In the real NEM generators self-commit for the evening peak because the price pays them; a passive operator does not darken a city. This is the direct consequence of OD-14/Q-18 ("the player stands for the whole system") and it is the chosen fantasy. It is labelled in the player-commits "?" (`text.js` 225) and nowhere on the face. One sentence fixes it (finding 8).
2. "After 5 minutes outside 49.85–50.15 Hz, or 1 minute below 49.5 Hz, the grid starts cutting suburbs one a minute." (finding 4.)
3. "Running a power station flat out makes it trip (3.5%/h)." (finding 2.) A DNSP colleague would call this out.
4. "TIGHT means you are a bit tight" when it can mean "the next trip sheds load". (finding 3.)
5. "The control room sets how much battery is held back for trips." Partly true in spirit (AEMO procures it), but the desk never says the market does it. (finding 1.)
6. "Coal can be hot-started in two hours." Fun-positive, labelled unverified; leave it.
7. "Keeping big machines spinning is how you get inertia at noon" (`alarmhelp.js` 63). True for SA in 2017–2021; today's answer is syncons and grid-forming batteries. (finding 5.)

### 2.2 One-line facts a stranger would repeat to a friend (all true, all on the face)

- "Frequency is the speed of every generator in the country, and it has to stay between 49.85 and 50.15." (`alarmhelp.js` 24–25.)
- "When a power station trips, the spinning mass of the others holds it for the first second, the battery answers in under a second, the governors in a few seconds." (the watch.)
- "At 49.0 Hz relays cut whole suburbs automatically to save the rest." (`watch.js` 46.)
- "At midday rooftop solar pushes the price negative and the grid has to spill wind and solar because coal can't turn down." (T1 line 137; `alarmhelp.js` 133.)
- "A coal unit takes hours to start, a gas turbine ten minutes, so the evening is planned at lunch." (the plan line all morning.)
- "An hour of blackout is valued at $30,000 a megawatt-hour, a thousand times what the energy costs to make." (`GOALS_TEXT`.)
- "Big batteries make much of their money by holding power back to catch trips." (Only if finding 1 lands.)

---

## 3. Where realism costs fun, mechanism by mechanism

| Mechanism (spec rule) | Fun cost | Keep, label, or abstract? |
|---|---|---|
| Coal: 3 MW/min, 120-min start, 8-h min down (F-13, S-11, §8.2 min-down row) | The coal lever is nearly inert inside a 5-minute day; a stranger never gets to "use" coal | **Keep.** The inertness *is* the lesson ("coal is the plan-ahead lever"); the night shift (Q-73) absorbs the consequence of a noon stop. |
| Real battery droop 1.7% + GUARD (H-8, Q-1) | Without the guard a trip breaks containment; with it set once to 400 it never fails | **Keep, label** (finding 1), and consider the owner question in finding 11 (should the guard cost anything?). |
| Hot-unit trip (H-2) | Random punishment of a state AGC and the governors create; unfair, unreal | **Replace** with the real mechanism (finding 2). |
| Directed-shedding timers (H-11) | None; it is good drama for a failing day | **Keep, label** (finding 4). |
| TIGHT/SHORT definitions (H-4, Q-8) and insecure mornings | A trusting stranger sits on TIGHT while the next trip would shed | **Add a word** (finding 3). |
| Restore permissive: 49.9 Hz, 5 min apart, R5 ≥ cold load, preview (K-13, Q-10) | At 150× the 5 min is 2 real seconds; nil | Keep. |
| FOS Table A.3 on an island (§8.2) | Stricter than real; nil cost | Keep. |
| Static UFLS blocks on net load (P-12) | Over-shed at noon is harsh but it is the real weakness | Keep; labelled. |
| MSL as tray notices, no backstop (P-4) | The belly's over-frequency danger is invisible until it is on the dial | Fine until Phase 3's backstop; the MIN GEN tile and the −$20 line carry it. |
| One-node network (§8.2) | For a DNSP owner, no network at all | Keep for the daily; a feeder/constraint lens is Phase 3+ material. |
| RERT $16,000 (Q-2) | None; rare and dramatic | Keep. |
| Spill counted, never charged (P-9) | None | Keep; it makes the battery decision clean. |
| "SPIN 18.1 GW·s" on the dial all morning | A number nobody can act on until noon | Keep; it pays off in the RoCoF explainer and in finding 5. |
| The player stands for the whole market (OD-14, Q-18) | None in play; a myth outside it (myth 1) | Keep, say it once (finding 8). |

Nothing here needs realism to be sacrificed. Every fun gain on this lens comes from *labelling* (1, 3, 4, 8), *naming what the engine already does* (5), or *removing an invented rule* (2).

---

## 4. Findings (strongest first)

### F1 — The GUARD ring, the game's one signature decision, is the one unlabelled abstraction (design-weakness, impact high, confidence high)

**Evidence.** `content/anchors.js` lists every element that carries a "?": no `ring-guard`, no `dial-battery` (grep "guard": 0). `content/text.js` has no row whose `game` is the ring (the full `game:` list, lines 107–778). SPEC §8.2 (2227–2304) has no guard row; the battery facts are in §8.1 only. The desk's own words: `desk/rotary.js` 242 and 333. The watch names it once, on the first (full) watch only: `watch.js` 42 `'YOUR GUARD: ' + mw(ctx.guardMW) + ' MW. The battery answers within a second.'`; `director.js` 101 makes every later watch compact, and T3 shows a returning player sees only the beat word (`WATCH T+0.70 s ×0.5 | BATTERY |`). The respond card folds the guard into the battery: `watch.js` 161 `const battery = caught.batteryMW + caught.guardMW;`, so T2's card reads `battery 494 MW` with no sign that 400 of it was the player's setting. The plan line asks for it at 08:00 and again after every trip (T1 lines 83, 100, 113, 158) without ever saying what it stands for. The owner's own open-faces list calls it "the unlabelled GUARD ring".

**Why it matters for a stranger.** "My battery caught it" is the most shareable sentence the game can produce, and the NEM fact behind it (SPEC 2316: "Real NEM batteries earn much of their revenue exactly this way, by holding headroom for contingency FCAS") is exactly what people repeat. Today the word is a mystery control.

**Proposal (S, one day).** (a) A §8.2 row + `text.js` entry anchored to `ring-guard`: *Real:* AEMO buys raise contingency FCAS (very fast 1 s, fast 6 s, slow 60 s, delayed 5 min) every 5 minutes, sized to the largest credible contingency; batteries hold headroom to sell it. *Ours:* you set the battery's share by hand on the ring; it fires at 49.75 Hz, delivers within 1 s, holds 10 min (trigger and sustain unverified). (b) On the card: `battery 494 MW (your GUARD 400)`. (c) Keep the compact watch compact but let the BATTERY beat carry the number: `BATTERY · GUARD 400`. Real NEM: yes, this is how it works; the hand-setting is the labelled abstraction.

### F2 — H-2's hot-unit trip is an invented rule, unlabelled, and it fires on the governors' mandatory duty (design-weakness, impact high, confidence high)

**Evidence.** SPEC H-2 (518–523): "Above 96% loading the unit shows 'trip risk ≈3.5% per grid-hour'". `sim/params.js` 152–155 (`HOT_LOADING_FRAC` 0.96 is the only `src()` and its source is the legacy code, L480; `HOT_ARM_S` 300 and `HOT_TRIP_PER_H` 0.035 are `simp`). `sim/grid.js` 228–229: `u.hotS = u.outMW > HOT_FRAC * u.availMW ? u.hotS + 1 : 0; if (u.hotS > HOT_ARM_S && uniform(...) < HOT_P_PER_S) fleet.tripUnit(...)`. `physics.js` 165–166: `u.outMW = u.schedMW + g` where g is the governor MW. `grid.js` 700–703 and 746 keep AGC base points within `[minMW, HOT_LOADING_FRAC × availMW]`, i.e. exactly at 96% when a unit is at its limit, so any governor response in an under-frequency crosses the line. T1 line 232 (18:00): `lever-coal "96%"=2496`. T1 lines 236–239 (18:30): `BALANCE SHORT 220 MW held up by governors 160 · load relief 50 ! AGC limit` and `lever-coal "✕ 3.5%/h"=2496 · lever-ccgt "✕ 3.5%/h"=621`: every coal machine and the CCGT are armed for a random trip because they are doing what the PFRR requires, on a day where the player touched nothing. The tooltip (`desk/levers.js` 423–424) states the rule as fact; no §8.2 row, no "GRIDWATCH's own rule" tag; the event-dense-day row names only its lockout (`text.js` 136). `desk/README.md` 3561 (Q-72) excludes these trips from the spacing rule as "the player's own overload behind a visible gate", which the transcript shows is not always so.

**Real NEM.** There is no overload-trip mechanism: MaxAvail is the offered ceiling and units run at it all day; trip rates rise with heat (already modelled: `HEAT_THERMAL_DERATE`, Q-85's heat-day trips) and with age. A grid at 49.2 Hz would see AEMO direct more generation and, if needed, shed load; it would not see its governors punished.

**Fun cost.** A stranger whose evening is already short gets a random second trip for a state the automatic controller and the physics created, on top of the pre-rolled unwarned trip.

**Proposal.** S: label it (a §8.2 row, a "GRIDWATCH's own rule" tag on the tooltip) and exclude `govMW` from the hot test (`u.outMW - u.govMW`), so governor duty is never punished. M (a slice: `SIM_VERSION`, the golden and the 365 dailies regenerate): drop the random trip and keep the 96% gate as what it already is in the physics, *no headroom above it*: a unit at MaxAvail gives no raise response, which the TRIP PREVIEW already shows. The plan-ahead lesson survives; the myth goes. Decision challenged: SPEC H-2 (a Phase 0 honesty fix that fixed the *target* of a legacy mechanic and kept the mechanic).

### F3 — TIGHT can mean "the next trip sheds two suburbs" (design-weakness, impact medium, confidence high)

**Evidence.** `sim/grid.js` 1209–1211: `level = shedOwn ? 'SHEDDING' : r5 < L.mw ? 'SHORT' : r5 < SECURE_RATIO * L.mw || nadir < needHz ? 'TIGHT' : 'SECURE'`. T1 line 19 (05:30, no input): `N-1 ! TIGHT SPARE IN 5 MIN ✓1121 RISK: COAL 1 621 ✕ 48.99 Hz`: the 5-minute reserve is fine, the preview is below UFLS stage 1 (49.0 Hz), and the word is TIGHT. The same shape at 06:55 and 07:15 (lines 48, 72: `✕ 48.92`, `✕ 48.94`) and in T2 at the trip tick 19:19:00 (`✕ 48.73 Hz`). The N-1 INSECURE tile lights, and the "?" (`text.js` 329–335) defines TIGHT precisely, but the head word is what a stranger reads. The COVER row (`text.js` 756) admits the NEM "would call most mornings insecure, par's included".

**Real NEM.** LOR levels are MW-based, and the seconds-scale question is FCAS adequacy; a state in which the credible contingency would breach the FOS is "not secure", with no softer word.

**Proposal (S).** Do not redefine SHORT (Q-8's DIRECT SHED key and P-7's adder hang on it). Add a fifth head word when `previewNadirHz < UFLS_FIRST_HZ`: **TRIP SHEDS** (amber-red), with the gauge's second line reading "next trip: 2 districts dark". The plan line's spare ask (`objective.js` 927) should then outrank the shortfall ask when the preview is below 49.0 Hz, as it does not today at 04:30–07:30 (the line talks only about 06:25). Decision touched: H-4's "one gauge, one reserve number" (J-8) stays; this is a word, not a second reserve.

### F4 — The directed-shedding timers are taught as the frequency standard (design-weakness, impact medium, confidence high)

**Evidence.** `content/alarmhelp.js` 25–27 (UNDER FREQ → WHY): "Out of the band 5 min (under 49.5 Hz: 1 min), districts are shed; at 49.0 Hz relays shed at once." followed at 30–32 by ON THE REAL GRID quoting the FOS and the UFLS paper and ending "All well established." `sim/grid.js` 1027–1036 implements the timers; `params.js` 120–121 flags them `simp`. The §8.2 row (`text.js` 452–460) is anchored to `key-shed`, which the desk shows only while SHORT or SHEDDING (`desk/emergency.js` 202–203, 230). T1 line 243: `DIRECTED SHEDDING: frequency below 49.5 Hz for over 1 min. One district per minute until it recovers.` from sender CITY DESK.

**Real NEM.** The FOS 5 minutes is a recovery standard. Manual load shedding is directed by AEMO at LOR3 or when the system cannot be returned to a secure state, implemented by the networks in blocks over minutes; there is no one-district-per-minute stopwatch.

**Proposal (S).** In the UNDER FREQ explainer, split WHY into what is physics ("a shortfall drains spin…") and what is GRIDWATCH's rule, tagged the way the WEATHER tile already is (`alarmhelp.js` 144 uses `real: {own: "GRIDWATCH's own rule…"}`): "GRIDWATCH sheds one district a minute after 1 min below 49.5 Hz or 5 min outside the band: a stand-in for AEMO directing the networks." Keep the mechanism: it is the right drama for a day that is failing.

### F5 — Name the synchronous condenser the game already has (opportunity, impact medium, confidence high on the code, medium on the NEM numbers)

**Evidence.** `params.js` 248 (`minMW` 0), 254 (`noLoadPerH` 0, "a machine on line at any output down to 0 MW … counts its full inertia, governor headroom and R5"); `text.js` 585–598 ("Hydro spins free"; its `real` already says "running it as a condenser is a separate, costed operation", so the concept is in the game's own words). `alarmhelp.js` 63 (HIGH RoCoF → WHAT TO DO): "at a sunny noon keep big machines spinning, the GUARD up and the biggest risk small." The desk shows SPIN in GW·s all day (`dial.js` 79, 170).

**Why.** A gorge machine on line at 0 MW is, in every term the engine computes, a synchronous condenser: inertia and governor response for no water. That is the modern NEM's answer to low-inertia noons (SA's four syncons since 2021; hydro machines in condenser mode in Tasmania and the Snowy; grid-forming batteries since Hornsdale's 2022 upgrade), and "keep coal on for spin" is the 2017 answer. The lesson is in the game and unnamed.

**Proposal (S).** A `CONDENSE` word in the machine slot when a hydro machine is on line at 0 MW; one sentence in the SPIN "?": "A machine spinning at 0 MW still gives spin: South Australia built four synchronous condensers for exactly this." Par already keeps machines near 0 MW for hours (§8.2 hydro row), so a stranger will see it happen. A grid-forming toggle on the battery (synthetic inertia moving SPIN) is the M-sized Phase 3 version; add the §8.3 row now.

### F6 — The respond card can print negative catches and uses unexplained jargon (defect, impact medium, confidence high)

**Evidence.** T1 line 279 (19:19:30, the no-input day): `Caught by: spin → battery -11 MW → governors -23 MW → load relief 55 MW → UFLS 814 MW.` Cause: `physics.js` 101–108 defines `caught` as the readout at the extreme minus the pre-trip readout, and the tripped unit's own governor MW vanishes with it (`physics.js` 554–558 JSDoc says so); the battery was empty (STORAGE LOW lit, T1 line 276). `watch.js` 166–169 filters only `|value| < 1`, so negatives print. "load relief" (`watch.js` 167) is defined nowhere the player reads: it is used in `alarmhelp.js` 25 and in the balance bar's aria-label (`dial.js` 368), and the balance "?" (`dial.js` 307–310) names spin, battery and governors but not it.

**Proposal (S).** Floor each part at 0 and say why in two words when it is zero or negative: `battery empty`, `governors spent`; write `load relief (motors slow) 30 MW`. These are the real reasons (an exhausted battery and units at MaxAvail are what make a second trip worse), and the card is the lesson the stranger most needs on the day it goes wrong.

### F7 — Export loss worded as "import lost" (defect, impact low, confidence high)

**Evidence.** `app/tray.js` 86: `'Interconnector tripped: ' + Math.round(r.lostMW) + ' MW of import lost.'`; T1 line 147 at 12:19 while exporting 300 MW: `Interconnector tripped: -300 MW of import lost.` The card beneath it then says "load picked up … solar and wind backed off", which a reader cannot reconcile with "import lost".

**Proposal (S).** Sign-aware: `300 MW of export lost: that load is gone, frequency rises.` Real NEM: a link trip while exporting is a loss of load for the exporting region; the words should teach that.

### F8 — "What's real here" is never said once (opportunity, impact medium, confidence high)

**Evidence.** The briefing's `GOALS_TEXT` (`shell.js` 116–119) explains the score; `dayText` (80–86) the day; `watchFor` (99–111) the constraints. Nothing says what the player is standing for. The NEM is named only inside "?" rows (grep across `app/*.js`, `next.html`, `content/text.js`: hits at `text.js` 261, 368, 631–642, 747–756 only). The 36 "?" rows each say ours/real/why for one control, so the frame is recoverable only by reading them all. Myth 1 (§2.1) is the consequence: the no-input day (T1) ends with nine districts dark, which a stranger reads as "the grid needs a hero at the desk".

**Proposal (S).** One line on the briefing card, under "Watch for": "The seconds are real physics from the NEM rulebook. The desk hands you every decision the market and the operator make between them: what to run, what to hold back, what to cut." Thirty words; it makes every later "?" land and is the sentence the owner can use when sharing the link. It is also the natural home for O-4's first concept card (2e). Decision challenged: OD-3's "learning is a side effect" as a reason not to frame it; a side effect with no frame becomes a myth.

### F9 — Spec text that no longer matches the engine or the decisions (spec-stale, impact low, confidence high)

- SPEC §4.1 (288–290) and §4.6 (398–404) still tell the trip story with "nadir 49.60 Hz", "battery 498 MW → governors 346 MW" and a 650-MW coal trip at 18:40. Measured today with a 400-MW guard: a 621-MW CCGT trip at 19:19, nadir 49.531 Hz, battery 494 (400 guard + 94 droop), governors 103 (T2). §4.6 already says these numbers "will change under H-8"; they did, and the story should be re-cut from the play driver.
- SPEC K-7 (986): "DIRECT SHED … appears only when LOR2 is forecast" is superseded by Q-8 (2328) and the code (`desk/emergency.js` 202–203); the paragraph was not amended.
- SPEC §8.2's preamble (2229) "Each row is labelled in-game (H-14)" is true of its rows, but the two mechanics in F1 and F2 have no row, so H-14's accept passes while two abstractions are unlabelled. Add the rows.
- `content/alarmhelp.js` 115 and 54 tag two H/M-rated facts "(likely)".

### F10 — Ledger additions that cost nothing and firm up two game numbers (opportunity, impact low, confidence medium)

- NER cl. 3.8.3A: the minimum ramp rate a scheduled generator may offer is 3 MW/min (or 3%/min for small units). `params.js` 241's coal 3 MW/min per machine is therefore the regulatory floor many coal units bid, not an unverified guess; move it from UNVERIFIED to M in §8.1 and §8.3.
- The MASS's frequency-setting window for switching controllers settles whether 49.75 Hz (`params.js` 86) is inside the real range (it is, on my reading; cite the primary source).
- Coal hot start 120 min (`params.js` 242–244) is optimistic by a factor of two or more against ISP assumptions; keep it for fun, but say "about half the real time" rather than "unverified".

### F11 — Should the GUARD cost anything? (question, impact medium, confidence high)

**Evidence.** `market.js` 302–345: SUPPLY has fuel, no-load, starts, tie, wear, DR, RERT, flex; no FCAS term. The ring's only cost is the battery travel it removes (`rotary.js` 237, 320). Par holds up to 400 MW (`params.js` 399 `PAR_GUARD_MAX_MW`) and the plan line asks for 400 MW on every day I played (T1 lines 83, 100, 113, 158), so the "decision" K-5 describes ("MW on guard earn nothing at noon, but they catch the fall at 18:30") is in practice "set 400 at 08:00 and forget".

**Options.** (a) Leave it free: real contingency FCAS is cheap most of the time and the trade-off is already in the dial's travel. (b) Charge an availability cost per MW·h on guard, labelled "contingency FCAS", in SUPPLY: makes over-guarding cost something, needs a tuned price and a par re-tune (M). (c) Show the forgone noon charging in the ring's own readout ("400 MW on guard: 350 MW of −$20 power not stored this hour"): visible trade, no sim change (S). **Recommendation:** (c) now; (b) only if gate 1 shows players guarding 500 all day. Real NEM: raise FCAS prices are usually a few $/MW/h and spike in events; the right lesson is "headroom is worth money", which (c) teaches.

### F12 — Minor wording that teaches the wrong thing (design-weakness, impact low, confidence high)

- `text.js` 233–243 (AGC band row): say that real AGC moves only units enabled for regulation FCAS, a market service, not "every unit".
- `desk/levers.js` 422: the lever's permanent label "96%" (T1 line 10: `lever-coal "96%"=2120`) reads as the unit's loading; it is the gate's position. Rename the gate label (e.g. `MAX`) or hide it until the lever is near it. (On the owner's open-faces list under a different name.)
- `alarmhelp.js` 63 (HIGH RoCoF → WHAT TO DO): "keep big machines spinning" should add "or a machine at 0 MW" once F5 lands.

---

## 5. Premises challenged, by decision

- **OD-6 "realism sacred; ease the interface not the laws".** Upheld for the physics; the finding is that two *invented laws* (H-2, H-11's timers) slipped under the ledger because they were legacy mechanics made honest in Phase 0 rather than abstractions chosen in §8.2. The fix is to treat them as §8.2 rows or remove them, not to loosen OD-6.
- **OD-3 "learning is a side effect".** True, and the game's "?" layer is already better than most explainers. But a side effect with no frame becomes a myth; one sentence on the briefing (F8) is the cheapest fix in this review.
- **OD-14 / Q-18 "the player stands for the whole system".** Right for fun; it is the source of myth 1 and needs its one sentence (F8).
- **Q-1 the GUARD.** The right call physically and for fun; it just needs its name on the desk (F1) and, possibly, a visible price (F11).
- **Q-8 DIRECT SHED at SHORT/SHEDDING.** Fine; it is why F3 proposes a new word instead of redefining SHORT.
- **H-2 (Phase 0).** Challenged outright (F2): it fixed a legacy bug's target and kept the bug.
- **J-8 one reserve number.** Kept; F3 adds a word, not a number.
- **Q-48 ALL-IN at VCR for every MWh dark.** Not challenged: the end card says what STPIS would and would not count, which is the honest version and the one a DNSP reader will respect.

## 6. For the verifier

Every play claim above reproduces with the three commands in §0 (the day is deterministic: seed 20261014, `v4-core-2c.1`); the outputs are saved in `review/t/T1.txt`, `T2.txt`, `T3.txt` beside this file. Code claims cite file:line in the working tree at 52da14a. Nothing in the repo was edited.
