# GRIDWATCH review — lens: SCORING, THE DAILY AND SHARING

Reviewer key `scoring-daily`. Read-only. Build `v4-core-2c.1` on `main` (52da14a), 2026-10-14. Second pass: an earlier draft of this report was cut off; every claim in it was re-checked against the repo and re-run, two findings were added from new evidence (the hidden dark-MWh split, the night shift's late relights), one figure was corrected (the MILD share), and the rest stands.

The owner's instruction: nothing in the spec is gospel; fun for a stranger arriving by a shared link comes first. Where I challenge an earlier decision I name it (Q-48, Q-75, OD-9, S-5, S-9, Y-2, D-22).

## 0. What I did

Files read: `app/score.js` (all 29 lines), `app/endcard.js` (all 174), `app/par.js` (all 54), `app/session.js` (all 188), `app/record.js` (head), `app/game.js` 125–135 (`dailyFrom`), 189–197 (`parFor`), 790–835 (the end block), `app/shell.js` 25–35, 110–122 (GOALS_TEXT), 612–660 (the chip, the night strip), 722–740 (`again`), `app/boot.js` 10–25, `sim/market.js` 340–375 (the spark), 428–441 (`isClean`, `isPerfect`, `scoreSummary`), `sim/params.js` 327–338 (VCR, VER, SPARK), `content/dailies.js` (all), `tools/daily-gen.js` 1–70 (the gate), `content/text.js` 605–630 (the SCORE "?"), `tests/lib/play.js` 228–250, `tools/play.mjs --help`; SPEC §0, §1 (OD-1, OD-9..11), §4.1 288–296, §4.7, S-1..S-14, D-20..D-25, O-1, Phase 4 (Y-1..Y-9, F-7, F-8), Playtest Gate 2, Phase 5 (W-1..W-5), §6 rows 2105–2136, §8.2 2270–2273, Q-48 (2387), §9.2 risks 5, 7, 9; desk/README §30.7, the 2b ALL-IN letters record (3440–3450), Q-66 (3555), Q-75 (3564), the D-9 interim note (3622–3626), Q-91 (3580); `tests/scoreface.test.js` (head).

Headless play, every command reproducible from the repo root (the path has spaces: quote it):

```
node tools/play.mjs 20261014 timeline=04:30-04:00/2h brief                      # Enter at every card (restores both feeders), nothing else
node tools/play.mjs 20261014 jump=04:00 key=Escape jump=04:00 key=Escape jump=04:00 key=Enter jump=04:00 key=Enter jump=04:00 brief state clock
                                                                                 # the do-nothing day: GO ON at both feeder cards, Enter at the two respond cards
node tools/par.js --scenario desk --seed 20261014 --proxy par,doNothing,competent --allin   # the lens's one slow-tool run, 6 s wall
```

`tools/play.mjs` has no way to switch par on (`openGame`'s `par` option, `tests/lib/play.js:231`, is not exposed), so every CLI transcript says `PAR: off` and shows the ALL-IN chip in c/kWh, never the SCORE chip or a graded card. To see what the live page shows I used four scratch scripts in this folder (nothing in the repo): `playpar.mjs <seed> follow|nothing|restore` runs `app/par.js`'s runner to the end (2.7–2.8 s) and opens the real page with it finished, so the SCORE chip and the graded end card appear as on the live page; `bands.mjs` runs par on one daily of each weather class in the next fortnight and grades the same mistake on each; `logtypes.mjs` counts the input log's types and prints `score.spark`; `darkmap.mjs` splits the dark MWh by cause and lists the restore inputs (its printed clock lacks the 04:00 offset: add four hours).

## 1. What a stranger gets today, end to end

### 1.1 The briefing (what the score is said to be)

`app/shell.js:116` GOALS_TEXT, shown at `#briefing-goals`:

> Keep the lights on, cheaply and cleanly. Your score is one total: supply's cost, plus $30,000 for each MWh dark that is yours (a feeder under repair becomes yours at its hand-back), plus $80 a tonne of CO₂: regulators' values of reliability and emissions. Par, GRIDWATCH's autopilot on this day, scores 1000; a smaller total scores more.

Then the seed line: "Seed 20261014 · AGC is on by default; HAND turns it off from 04:30 to 21:00." No date, no puzzle number, no word "daily". Nothing on any screen says the day is the same for everyone (pillar 5's premise), and the tray's first card is "NETWORK 04:00 Overnight faults: feeders HAR4 and HAR3 under repair, handed back at 06:55 and 07:15."

### 1.2 Three days on today's daily (seed 20261014, MILD|calm weekday)

Par's ALL-IN on it: **$8.473M = supply $4.006M + outages $0 + carbon $4.466M** (`tools/par.js` above; `playpar.mjs`: "PAR done in 2823 ms: cost $4.006M, dark 0.0 MWh, 0.564 t/MWh").

**(a) A stranger who does what the plan line says** (`playpar.mjs 20261014 follow`: presses the START guard twice whenever the line reads ACT NOW … Start X, Enter at every card; never touches the GUARD ring the line also asks for, 18 times, nor a lever, the battery, the tie or a suburb):

```
04:30:27 LINE: ▶ ACT NOW You will be 150 MW short from 06:25 (the tie limited to 500 MW until 11:15). Start CCGT 2 now …  -> pressed guard-start-ccgt2 twice
05:10:27 LINE (no press): ▶ ACT NOW If your biggest unit tripped now, frequency would fall to 49.31 Hz: too low to be secure. Raise the battery GUARD to 400 MW …   (and 17 more like it)
09:11 SCORE 981 · 10:04 979 · 11:14 974 · 12:12 960 · 13:19 940 · 14:19 927 · 15:11 919 · 16:16 927 · 17:00 948 · 18:02 943 · 19:13 941 · 20:14 939 · 21:00 946 · 23:00 962 · 02:00 967
17:00:50 … Start GT·A now · 17:22 Start GT·B 1 · 17:42 Start GT·B 2 · 18:13 Start GT·C 1 · 19:19 Start GT·C 2 · 19:34 Start HYDRO 3   (all pressed)
19:19:30 CARD: NADIR 49.407 Hz: OUTSIDE 49.5–50.5 Hz ✗ …
END CARD: Day over: 04:00. SCORE 975 · A  YOU PAR Δ  SUPPLY $4.20M $4.01M +$198.2k 4.2 c/kWh served: the COST chip (par 4.0)  OUTAGES $53 $53 $0 0.0 MWh dark × $30,000 (VCR)  CARBON $4.48M $4.47M +$16.7k 0.57 t/MWh × 99,072 MWh = 56,038 t × $80 (VER) …  ALL-IN $8.69M $8.47M +$214.8k 8.8 c/kWh · $4.57 per household  Biggest gap to par: SUPPLY +$198.2k (more or dearer plant than par's)  Score = 1000 × par's ALL-IN ÷ yours. Par is GRIDWATCH's own autopilot on this same day.  SAIDI 0.0 min · SAIFI 0.00 · MAIFI 0.00 per household today (par: SAIDI 0.0 min)  Feeders under repair count from their hand-back: the 834.8 MWh dark before it were the network's outage, not priced.  No household was off for more than 3 minutes.  Seed 20261014 · v4-core-2c.1 · 254 inputs · hash 0xd4e4bce5
```

Following the line earns an A (975) with every light on. Good: the hint-follower wins, as 2b's follower record said (desk/README 3447–3449: MILD median 1,015, 991–1,068).

**(b) Enter at every card, nothing else** (`timeline=…` above; `playpar.mjs … restore`): both feeders restored at their cards, no start all day.

```
09:15 SCORE 1001 · 12:15 989 · 15:19 966 · 18:19 1001
18:30:06 notice: N-1 ✕✕ SHEDDING … CITY DESK 18:30 DIRECTED SHEDDING: frequency below 49.5 Hz for over 1 min   (the plan 800 MW below demand)
19:19:30 CARD: NADIR 48.652 Hz: OUTSIDE 49.5–50.5 Hz ✗ … UFLS 814 MW. SHEDDING: 9 districts dark (2146 MW): relight them and cover 700 MW within 29:30.
19:19:32 SCORE 270 · 20:19 71 (LIGHTS ON 96.5%) · 21:19 47 (94.4%) · 04:00 54
19:30 LINE ‼ URGENT The plan is 1,900 MW below demand now: start GT·C 1 (9 min).   (20:00: 1,800 MW; 20:30: 1,700 MW; nothing asks for a RESTORE)
END CARD: … SCORE 54 · D … OUTAGES $147.99M $53 +$147.99M 4,932.9 MWh dark × $30,000 (VCR) … ALL-IN $156.51M $8.47M … 158.4 c/kWh · $82.37 per household  Biggest gap to par: OUTAGES +$147.99M (4,932.9 MWh dark at $30,000 each) … SAIDI 48.3 min · SAIFI 0.28 … Each SAIDI-minute today cost customers about $3.07M at VCR. A distributor's STPIS would not count this shedding … 260 inputs
```

`darkmap.mjs`: the 4,933 MWh are **2,063 MWh directed** (the city desk shedding from 18:30, because no unit was started) **+ 2,870 MWh UFLS** (the 19:19 trip), and the nine shed districts were relit by the night shift at **21:35–22:25**, two to three hours dark, because nobody pressed RESTORE and the line never asked for it.

**(c) The do-nothing day** (GO ON at both feeder cards, Enter at the respond cards): `SCORE 30 · D`, 9,229.5 MWh dark, OUTAGES $276.88M, ALL-IN $285.33M (287.0 c/kWh · $150.17 per household), SAIDI 93.0 min, "257 inputs". The chip read 75 at 09:15 and 27 by 16:19. `darkmap.mjs`: **5,907 of the 9,229 MWh (64%) are the two feeders HAR4 and HAR3 left dark after Esc at 06:55 and 07:15** (`taskMWh` 5907, `taskLateMWh` 5629), relit by the night shift at 22:20 and 22:25; UFLS 2,725, directed 597. `tools/par.js`'s `doNothing` proxy on the same seed: 11 points. The 2b accept (§6 row 2108 "No-input day … must fail") holds: never F, a clear D.

### 1.3 What is missing at the end, as built

The end card (`app/endcard.js:72–150`) has: h2, `SCORE n · L`, the YOU/PAR/Δ table with the arithmetic under each row, "Biggest gap to par", the rule, the reliability block, the seed/hash line, DOWNLOAD REPLAY LOG, PLAY THIS DAY AGAIN. There is no share card, no copy button, no history, no streak, no date, no daily number, no "moment", no counterfactual, no this-really-happened card, no closing line, and no distinction between an official run and a replay (`grep -rn "share\|streak\|history\|PERFECT" app/ desk/ render/ content/` finds no UI; the only storage keys are `gridwatch:v4:seen`, `:settings` and `:par`, `app/game.js:54`, `app/par.js:10`). `PLAY THIS DAY AGAIN` (`app/shell.js:729`) resets the same seed with par cached (`app/par.js:41–44`), so a replay is graded at once. In the owner's own words these are 2d and Phase 4, not yet built; this review judges what they should be.

## 2. Findings, strongest first

### F1 — The end is a regulator's worksheet, not a verdict, and it never names what went wrong (design-weakness, high)

Evidence: the three END CARD lines in §1.2; `app/endcard.js:102–149`. The first thing after `SCORE 975 · A` is a 4-row $ table with "0.57 t/MWh × 99,072 MWh = 56,038 t × $80 (VER)" and "$4.57 per household", then "Score = 1000 × par's ALL-IN ÷ yours", then SAIDI/SAIFI/MAIFI and STPIS. The only diagnostic line is "Biggest gap to par", built from the three $ buckets (`PARTS`, `:21–25`): on the A day it says "SUPPLY +$198.2k (more or dearer plant than par's)", naming no plant and no hour; on the D days it says "OUTAGES +$147.99M (4,932.9 MWh dark at $30,000 each)", true and useless. The player is not told the one thing that would have changed the day: on (c) that they went on past two feeder cards and left 5,907 MWh dark for fifteen hours; on (b) that they never started a unit the line asked for at 04:30 and 17:00–19:34, and never restored nine districts the relays shed. Nothing is in the stranger's words; nothing is shareable; nothing invites a second go except a button.

The north star's third verb is "share how your day went". Today the day ends on a $ table and a JSON download. For a stranger the last 45 s are the memory they leave with, and the only part that can be shared. This is the highest-leverage unbuilt thing in the game, more than any desk polish.

Proposal (M, one slice; see §3): replace the worksheet with a verdict in this order: the score and rank line; the sparkline; one sentence per axis in words ("Lights: every light on all day ★" / "4,933 MWh dark: 2,063 shed by the city desk from 18:30 for want of a unit, 2,870 by the relays at 19:19, and nine districts dark until the night shift relit them"); one "what par did that you didn't" line from the decision diff (F10); the closing line (Y-7); SHARE (copies the card); then "the numbers" behind a disclosure, where the present table and reliability block go unchanged. Real NEM: AEMO's incident reports open with what happened and what caught it, not with the VCR arithmetic; that belongs in the appendix.

### F2 — The sim already splits dark MWh by cause; the card collapses it into one number and hides the lesson (design-weakness, high; cost S)

`sim/market.js` `splitShed` (from line 368) keeps `uflsMWh`, `directedMWh`, `taskMWh`, `taskLateMWh` and `heldMWh` on `state.score`; `app/score.js:11` reads only `lightsMWh` (= `unservedMWh`, `market.js:441`), and `app/endcard.js:126` prints "N MWh dark × $30,000 (VCR)". On the do-nothing day that one number is 9,229.5, of which 5,907 are the two feeders left after Esc, 2,725 the relays' and 597 the city desk's; on the Enter-only day 2,063 directed and 2,870 UFLS. The cause is the lesson: "you went on past the hand-back" teaches the feeder card; "the city desk shed because the plan was 800 MW short" teaches the line; "the relays shed 9 districts and nobody restored them" teaches the bay. The card already prints a Q-69 line about the 834.8 MWh that were the network's; it says nothing about the 5,907 that became the player's at 06:55.

Also: after the 19:19 shed on day (b), the objective line reads "URGENT The plan is 1,900 MW below demand now: start GT·C 1 (9 min)" at 19:30, 20:00 and 20:30, and the tray's UFLS cards say "Restore when the permissive allows. TO THE RESTORE BAY"; the relit districts came only from the night shift at 21:35–22:25 (`darkmap.mjs`; par's rule 9, `sim/autopilot.js:1535`). The line is right that generation comes first, but a stranger who presses Enter and nothing else never learns that nine districts sat dark for two hours. (A check: `node tools/play.mjs 20261014 timeline=04:30-04:00/2h brief`, LIGHTS ON 96.5% at 20:00 and 95.0% at 21:00.)

Proposal (S, a day, no sim change): under OUTAGES, one line per non-zero cause from the fields that exist: "Feeders you went on past: 5,907 MWh (HAR4 from 06:55, HAR3 from 07:15; the night shift closed them at 22:20)", "Shed by the city desk: 597 MWh", "Shed by the relays: 2,725 MWh (relit 21:35–22:25)". `state.city.districts[].darkSinceS` and the restore inputs in `state.log` give the times. This is the cheapest "the end teaches one thing" and it needs none of 2d. Real NEM: AEMO's reports itemise load shed by UFLS stage and by direction; the split is the honest one.

### F3 — The letter bands drift with the day: the same mistake is a B on a heat day and a C on a calm one (design-weakness, high; challenges Q-48's letters)

`app/score.js:27` `points = round(1000 × par.total / you.total)`, letters `A ≥ 962, B ≥ 684, C ≥ 351` (`:7`). Points are a hyperbola in the $ gap, `1000 / (1 + Δ/par)`, so every dollar of mistake costs fewer points on a day where par's own total is bigger. `bands.mjs` on four shipped dailies (par run to the end on each, the same extra MWh dark added to par's own scorecard):

| daily | class | par ALL-IN | +10 MWh dark | +150 MWh | +600 MWh | supply +10 % |
|---|---|---|---|---|---|---|
| 20261016 | HEATWAVE·heat | $14.75M (supply 9.41, carbon 5.34) | 980 A | **766 B** | **450 C** | 940 B |
| 20261019 | MILD·drought | $9.99M | 971 A | 689 B | 357 C | 954 B |
| 20261014 | MILD·calm | $8.47M (supply 4.01, carbon 4.47) | 966 A | **653 C** | **320 D** | 955 B |
| 20261017 | MILD·calm weekend | $8.18M | 965 A | **645 C** | **312 D** | 952 B |

`tools/par.js` on today's seed prints the same thing in its own words: "par + 150 MWh dark on the median day: 653 (b <= this); + 600 MWh: 320 (c <= this)". The bands were set on the 200-day median ($9.746M, desk/README 3443, Q-48) so that "150 MWh = B"; on calm days (40% of dates by Q-66's split, README 3555; MILD days about half by temperature, README 1279) 150 MWh is a C and 600 a D, on a heatwave they are a B and a C. The hard day is the forgiving one. Within one date everyone is on the same curve, so the ranking is fair; but the letter a stranger carries away, and any streak built on letters, means different things on different days, and Q-48's own promise ("150 MWh = B") is false on most mild days.

The cause is the denominator: the carbon term, 53% of par's total on a calm day (F7), sets the exchange rate and varies with the day's energy and mix.

Proposal (S, a day, plus one `tools/par.js --allin` run to re-check the S-5 accepts): keep `points` (the chip, the tests and "1000 is par" all work) but define the letters on the gap in **MWh-equivalents** = `(you.total − par.total) / V.VCR`, the unit the owner already reasons in: A ≤ 10, B ≤ 150, C ≤ 600, D above, F black. That is S-5's ladder restored, it reads the same on every day, and supply +10% is 13 MWh-eq on a calm day and 31 on a heatwave (a B on both, as now). The letter then needs one line on the card: "A: within 10 MWh of par. B: within 150." Alternatively (also S) drop letters and show points plus a rank name (F5). Real NEM: VCR is exactly a $/MWh exchange rate, so "MWh-equivalent" is the honest unit.

### F4 — The live SCORE chip is a lagging indicator that says "beating par" an hour before the lights go out (design-weakness, medium)

`app/shell.js:619–637`: the chip grades your ALL-IN so far against par's series at the same grid second (`app/par.js` `seriesAt`, 300-s marks). On day (b) it read **1001 at 18:19** (the cheapest possible fleet, no spare, directed shedding eleven minutes away) and **270 at 19:19:32**, 2 s after the trip; on the follower's A day it fell from 981 (09:11) to 919 (15:11) with LIGHTS ON 99.9% and nothing wrong, because par stops units and charges the battery in the belly on a different timetable, and rose back to 975 by 04:00. A stranger reading SCORE as "how am I doing" gets the opposite of the truth twice a day: it rewards exposure until the trip lands and punishes a sound plan while the belly's timing differs.

The N-1 gauge is the leading indicator; the SCORE chip is a scoreboard for a race settled at 04:00. Spelling Bee, Wordle and Mini Motorways show no live comparison; Zachtronics shows the histogram after.

Proposal (S): either (i) show the chip only from 21:00 (the night strip already counts it up, `drawNight`), and show ALL-IN c/kWh or nothing during play; or (ii) keep it, relabel it "vs PAR so far" and colour it only at 04:00. I recommend (i): a number that moves for reasons the player cannot see is noise on a header that already has LIGHTS ON, COST and CO₂. The chip's "?" row (`content/text.js:610`, "Through the day the chip compares you with par at the same grid time") and §30.7's "same grid time all day" change with it. Real NEM: no control room runs a live scoreboard against a reference operator.

### F5 — A share card can ship in a day: the sim already records the sparkline (opportunity, high)

`sim/market.js:357–363` keeps `score.spark[12]`, the worst |f − 50| per 2-h block from 04:00 (`V.SPARK_BLOCK_S` 7200, `SPARK_BLOCKS` 12, `params.js:337–338`), and `minHz`. On the Enter-only day (`logtypes.mjs`): `0.04 0.25 0.04 0.04 0.20 0.09 0.04 1.35 0.28 0.15 0.04 0.05`, minHz 48.652. Through Y-4's ladder (█ ≤0.05 … ▁ >1.0) that is `█▅██▅▇█▁▅▆██` with "low 48.65 Hz": the dip at block 8 (18:00–20:00) tells the story without naming the trip or the hour (risk 7 accepted this). Everything else on the card is already on the end card. The card I would ship (≤7 lines, ≤280 chars, no emoji, Y-4):

```
GRIDWATCH #3 · Wed 14 Oct · 975 ★A
█▅██▅▇█▁▅▆██  low 48.65 Hz
Lights  ★ every light on
Cost    +5 % vs par
Carbon  ★
"Nobody noticed. That's the job."
databerryau.github.io/gridwatch
```

and on the D day: `54 · D`, `Lights  4,933 MWh dark`, a closing line from the "dark × under par" bucket. Tags: FIRST SHIFT, HAND-FLOWN (the end card already says it, `endcard.js:77`), GLASS BROKEN, PRACTICE (F9). Cost S for Y-4 + Y-5 (copy + "Copied") + a puzzle number and date on the briefing and the card (the briefing says "Seed 20261014" today, §1.1; "Daily #3 · Wed 14 Oct · the same day for everyone" is the pillar-5 sentence nobody sees). The closing lines (Y-7, ≥40) are a day's writing and are what makes a D worth posting: Wordle's X/6 is shareable because the grid is the joke; here the ▁ block and a dry line are. In-world rank names beside the letter do what Spelling Bee's "Genius" does: TRAINEE / SHIFT OPERATOR / SENIOR OPERATOR / SHIFT SUPERVISOR / ★ MARG'S CHAIR (par or better); the stranger repeats a rank, not a school grade (S, text only). Real NEM: none of this is physics; the sparkline is the frequency record every control room keeps.

### F6 — A reference ladder of "the other shifts" gives every date a histogram with no server (opportunity, high)

`tools/daily-gen.js` already plays par on every date, and `tools/par.js` has the proxies (`doNothing`, `lean`, `competent`, `slow`, `commitAll`). Storing three numbers per date (doNothing, lean, competent points; par is 1000 by definition) costs about 365 × 12 bytes beside `content/dailies.js`'s 1.4 KB and gives the end card and the share card a line a stranger understands at once:

```
Did nothing 11 · Pressed Enter 54 · Followed the line 975 · YOU 975 · PAR 1000 · Competent 1012
```

(today's measured numbers, §1.2 and `tools/par.js`). It answers "is 975 good?" better than a letter, it tells the D player that doing nothing is 11 and reading the line is 975, and it is honest: fixed policies, labelled. When telemetry exists (F12) real players join the same ladder ("top 28% today"). Cost S (generator + data + one line). Pairs with F3: on the ladder the letter is optional.

### F7 — CARBON is half of par's total and inert: a silent ballast that sets the score's exchange rate (design-weakness, medium; challenges Q-48's carbon term and OD-9's third axis as scored)

On the calm daily par's carbon term is $4.466M of $8.473M (52.7%). The follower's full day moved it by +$16.7k (0.4%); S-9 already recorded that the player's carbon levers move intensity "by about 6% at 13% extra cost". The term is intensity × every MWh asked for (`score.js:13–14`), so it is nearly a constant of the day: it cannot be won, barely lost, and the card's reason for a carbon gap, "a dirtier mix than par's" (`endcard.js:24`), prints for a +$16.7k gap. Its real job is to make the hyperbola's denominator large enough that 10 MWh dark stays an A (without it par = $4.0M and 10 MWh dark = 930, a B). That job is invisible, and it is what makes F3's bands drift.

Options: (a) keep the three terms but grade on MWh-equivalent gaps (F3), which removes the ballast's side effect and lets the card say honestly "CARBON ±0: nothing you did moves it today"; (b) show carbon as a readout (t/MWh, tonnes) with a ★ at or under par and score on supply + outages only, S-9's original call, which Q-48 overrode on the owner's "ratio against carbon emissions" ask; (c) give carbon a lever that matters (Phase 3's VPP/backstop, or a coal-off-at-noon choice priced at its real cycling cost) so the term earns its place. I recommend (a) now and (c) when Phase 3 lands; (b) only if the owner is happy to drop carbon from the one number. Real NEM: the ISP and the AEMC do price tonnes at VER beside VCR (§8.2 row 2270), so the formula is defensible; what is not defensible is a term the operator cannot move being half the score.

### F8 — The spec's scoring and sharing sections describe a scheme Q-48 and Q-75 replaced (spec-stale, medium)

- §4.7's share card and Y-4: per-axis marks ("Lights ★ PAR 0 MWh dark / Cost ★ −4% / CO2 +2%"), S-6's "PAR within 1 MWh; ±1 %", a PERFECT badge, S-9's "carbon is a star, not part of the letter". Built: one ALL-IN number and letter; carbon is inside the letter; `market.isPerfect` exists (`market.js:429`) but no UI shows PERFECT (the word appears once in `content/text.js:771`, in a help row).
- S-5's table (ΔU ladder + cost gate) is still listed as live in §5 (1508–1518) though Q-48 (2387) overrides it; S-7's "Matching par within 10 MWh earns an A" is in MWh while the built letter is a $ ratio.
- F-8 (1992): "`content/dailies.js` maps date → {seed, scenario, SIM_VERSION, par scorecard}; the stored par is authoritative for grading (§9 risk 5)". Built (Q-75, README 3564): `content/dailies.js` ships `{v, from, to, attempts}` only; par runs in the page (`app/boot.js:17 par: true`, `app/shell.js:31` 3,000 ticks a frame) and is cached per seed in `localStorage`. README 3622 records this as "interim until Phase 4's F-8", so it is a known deferral, but SPEC does not say so and risk 5's fourth mitigation is therefore not in force: `sim/physics.js`, `sim/grid.js`, `sim/weather.js` and `sim/clock.js` call `Math.exp/pow/sqrt/sin/cos/log` (2, 1, 3 and 1 hits), so two friends on different browsers can in principle be graded against different pars. Y-1's seed hash is also not what Q-75 built (a deliberate deviation; SPEC does not yet say).
- Y-3's history entry `{marks, values, par, lowHz, …}` is in the old marks vocabulary.
- §6 row 2108 "No-input day … never F; median C/D": measured today D (11, 30 and 54 points); the row should say so.

Proposal (S, the stage-C SPEC pass the slice record already owes): rewrite §4.7, Y-3, Y-4 and S-5..S-9 to the ALL-IN scheme as amended by F3/F5, and either build F-8's stored par (par's end total per date in `dailies.js`: 365 × ~8 bytes; the live chip can keep the in-page series) or strike "authoritative" and accept the risk in §9.2 with a `?selftest` check. I recommend storing the total: it is tiny, it makes the official grade identical for everyone by construction (pillar 5), and it lets the end card grade at once on a slow machine.

### F9 — One official go, or replay-until-A? (question, high)

Today: unlimited replays of the same seed, instantly graded, nothing marks which run was first. Y-2 says the first run past 09:00 is official, "Abandon" is a DNF, later runs are PRACTICE; O-1 says the first shift is official and tagged. Wordle's tension is the single go; Mini Motorways' daily allows one; Spelling Bee lets you keep going on the same puzzle. For a stranger on a first shift a single official go is harsh: the first minutes are learning the desk (the owner's own first play was "SUPER unclear"), and the do-nothing and Enter-only days above are both D.

Options: (1) Y-2 as written: first run official, replays PRACTICE, the share card carries the official result only. (2) Best-of-day: every run counts, the card shows your best and the number of runs ("975 A on run 2"), Wordle-style honesty by disclosure. (3) First-shift exception: the first daily ever played is practice unless the player opts to make it official at the end ("Count this one?"); from day 2 Y-2 applies. (4) No official notion; share whatever you like.

Recommendation: (3) then (1): the first shift is a tutorial in disguise, so let the stranger choose at the card; from the second day the single go is the hook and the streak's meaning. Whatever is chosen, the end card must say OFFICIAL / PRACTICE / FIRST SHIFT on its first line and the share card must carry the tag. Cost S for the tag and the rule, M with history and streak (Y-3).

### F10 — The cheapest "moment" and "what if" is a decision diff against par, not a re-simulation (opportunity, medium; challenges D-22's design)

D-22 (1974–1980) wants ≤30 re-simulations in a Worker during the 12-s night roll, choosing the best single change on the axis where the player lost most; the spec itself notes single fixes recover all shedding on only 50% of near-par cases. That is an L item with a fragile budget (one sim day is 2.7 s on this machine; 30 in 12 s needs several workers, and the owner's PC runs out of memory). What the game already knows for free:

- par's input log on the same day (`app/par.js` runs it; `runPar` tags each input's rule) and the player's log (`state.log`);
- the objective line's ACT NOW asks and whether each was met (`app/objective.js` computes them live; keeping a ring of `{s, text, met}` is S);
- the dark-MWh split and the restore times (F2).

A diff gives lines a stranger can act on tomorrow: "Par started CCGT 2 at 04:35; you never did, and the city desk shed 597 MWh from 18:30." / "You were asked 18 times to raise the GUARD and didn't; the 19:19 trip reached 49.41 Hz." / "The relays shed nine districts at 19:19; par had them back by 19:50, the night shift by 22:25." That is D-21's moment (the first shed, else the deepest nadir; `state.conts[]` has the time, lost MW, nadir and what caught it already) plus a teachable counterfactual in words, with no re-simulation, cost M (a slice, with the debrief). Keep D-22's re-sim as a later upgrade. Real NEM: AEMO's post-incident reports are exactly "what was dispatched, what the operator did, what would have held it".

### F11 — "257 inputs" on the end card are mostly the system's, and "$53 of outages on 0.0 MWh dark" (defect, low)

`app/game.js:806` `inputs: state.log.length`; `app/endcard.js:80` prints it. `logtypes.mjs` on the Enter-only day: `{"planLoad":230,"restore":11,"start":7,"callDR":1,"battery":3,"stop":5,"guard":3}` = 260, of which the player pressed Enter four times; the rest are `app/system.js`'s 5-minute dispatches and the night shift's starts, stops, restores and DR calls. The do-nothing day reads "257 inputs". Fix (S): count only inputs whose origin is the player (the session tags assist inputs `by: 'assist'`, `app/session.js:100`; tag the system's the same way), or drop the number from the card and keep it in the replay file. Also: on the lights-on day both YOU and PAR print `OUTAGES $53 … 0.0 MWh dark × $30,000`: 1.8 kWh of momentary unserved energy priced and shown beside "0.0 MWh"; round the row to $0 under 0.05 MWh.

### F12 — Telemetry: an anonymous replay-log endpoint (question, medium)

The owner's open idea (2026-10-06). What it buys, in order of value: (a) the owner can replay any stranger's day exactly (`sessionLog`, `app/session.js:185`: seed, version, scenario, inputs, about 10 KB) and see where they stalled, which is the one thing playtests at a distance cannot give; (b) a real histogram per date on the end card and share card ("top 28% of 212 operators today"), the Zachtronics hook; (c) a leaderboard, which I would not build (it invites replay farming and needs identity). Costs: C-1 ("no request to another origin", also restated in Y-8) must be waived for one POST; a Cloudflare Worker + D1/KV is M; privacy is clean if the record is seed, version, inputs, score and a random per-browser id, nothing else, with an opt-out in SETTINGS and a one-line notice on the end card.

Options: (1) do it now, before Phase 4; (2) do it after Y-4/Y-5 and F6's ladder, when there is a card worth measuring; (3) never, keep DOWNLOAD REPLAY LOG and ask testers to send files. Recommendation: (2), and ship F6's static ladder first so the card never shows an empty histogram on a quiet day.

### Smaller: `tools/play.mjs` cannot show the SCORE chip or a graded end card (opportunity, low)

`tests/lib/play.js:231` accepts `par`; the CLI does not expose it (`grep -n par tools/play.mjs` finds only unrelated words), so every transcript in this repo's reviews and playtests says `PAR: off`. A `--par` flag that runs `createParRunner` to the end before opening the page (2.8 s) would make the end card testable from the command line as the live page shows it. Cost S.

## 3. The scoring and sharing design I would ship

In build order, with cost:

1. **The dark-MWh split on the card** (S; F2), **letters on MWh-equivalents, rank names, the OFFICIAL/PRACTICE/FIRST SHIFT tag, a player-only input count** (S each; F3, F5, F9, F11). No sim change.
2. **The share card and copy** (Y-4, Y-5, Y-7; S–M; F5): sparkline from `score.spark`, score, three word-rows, closing line, link; puzzle number and date (Y-1's local-date rule) on the briefing and the card. Lint for `HH:MM` and event words as Y-4 says.
3. **The reference ladder** per date beside `content/dailies.js` from `tools/daily-gen.js` (S; F6), and par's stored end total per date (S; F8), so everyone is graded against the same number.
4. **The verdict reorder** (M; F1) with the decision diff as the moment and the what-if (F10); the present table and reliability block move under "the numbers". The SCORE chip retires until 21:00 (F4).
5. **History and streak** (Y-3; M): STREAK = consecutive dates with an official run; BEST = consecutive dates at par or better in MWh-equivalent terms (≤10). With Safari's 7-day clearing (risk 9) say "history off" rather than lose a streak silently.
6. **Telemetry** (M; F12) after 2–4, then the live histogram line.
7. **Y-9 seasons** (L: `content/seasons.js`, re-gating 365 dates) after 1–5: it is the right answer to "every daily has the same skeleton", but a stranger has to want a second day before a different puzzle matters, and 1–5 are what make them want it.
8. **D-22 re-simulation, D-24 cards, Y-6 PNG** last (L, M, M). D-24's five "this really happened" cards are good content and cheap once the debrief exists; they are not what makes a stranger share.

What I would not build as specced: the Phase 5 week (W-1..W-5) before 1–6 exist; it multiplies the day's scoring questions by five and adds carry-over state the daily does not need. OD-11 made it "later, optional"; keep it there.

## 4. Why these, against what makes dailies sticky

- **Everyone on the same puzzle**: built (Q-75's gate, 365 dates). Not said anywhere on screen: the briefing shows a seed. Say "Daily #3 · Wed 14 Oct · the same day for everyone".
- **One go**: F9.
- **A spoiler-free grid that shows how, not what**: the sparkline (F5); the sim already has it.
- **A comparison you grasp at a glance**: the ladder (F6) now, the histogram (F12) later. "975" alone is not it; "975, par 1000, did-nothing 11" is.
- **A streak**: Y-3 (step 5).
- **A line worth pasting**: Y-7; the closing line does for GRIDWATCH what the emoji grid does for Wordle.
- **A verdict that teaches one thing**: F2 and F10. Mini Motorways tells you the road that jammed; Zachtronics shows your histogram position; neither prints VER arithmetic. Gate 2's own pass line is "≥3/5 can retell the moment of their day" (SPEC 2025): today's card gives them nothing to retell.

## 5. Smaller notes

- `grade()` returns `null` when par is black or missing and the card says "par could not finish this day: no score" (`app/endcard.js:100`): correct, and the gate makes it unreachable on a daily. On a `?seed=` raw day it is the right message.
- S-7 Hard days: with the ratio formula a par that shed 500 MWh makes beating par trivial ($15M in its total); if Hard days ever appear in a practice menu, grade them on MWh-equivalents against par's outage-free parts or label them unscored.
- The night strip (`drawNight`) counts SCORE up during the 12-s roll: on the D day it moved 23 → 30 while the night shift relit districts. Fine, and the one place where a live count is a reward.
- `app/par.js` caches only the latest seed's par; a player who opens yesterday's date re-runs par. Harmless.
- The gate (`tools/daily-gen.js:52`) proves par can keep every light on; it says nothing about how a stranger fares. 20261217 needed 32 attempts (`content/dailies.js`), so its attempt-0 siblings were all hard; the shipped attempt is still a day whose difficulty for a human is unmeasured. F6's ladder per date would show it (a date where `lean` scores 400 is a hard date) and could feed a "today is a hard one" line on the briefing.
