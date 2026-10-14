# GRIDWATCH review — lens: the genre and the hooks that are missing

Reader key: `comparables`. Read-only. Date: 2026-10-14. Build: `v4-core-2c.1` on `main` (52da14a).

What I read: SPEC §0, §1, §2, §3.3, §4, §5 (Phase 2 D-/O-/S-, Phase 3, Phase 4, Phase 5), §6, §7, §8, §9.1 (Q-1..Q-60), §9.2, §9.3; desk/README §32 (intro, §32.1 Q-61..Q-91, §32.2); sim/README §5 (conts), §6 (inputs); app/endcard.js, app/score.js, app/par.js, app/watch.js, app/director.js, app/shell.js (briefing, chips), app/game.js (seed/date query), app/suburbcard.js (WIT), content/dailies.js, content/scenarios.js (DESK dayplan), content/anchors.js, content/text.js (abstractions), sim/dayplan.js, sim/events.js, next.html (briefing card), shots/*.png.

What I played (headless, `tools/play.mjs`): the full do-nothing day on today's daily (20261014), the same day hand-played with eight sampled inputs, the Saturday daily (20261017), the first watch in real seconds, a returning player's compact watch, and the end card.

---

## 1. What the five minutes are today (so the comparisons are grounded)

### 1.1 The do-nothing day, seed 20261014 (Wednesday, `desk`)

`node tools/play.mjs 20261014 timeline=04:30-04:00/30m` (presses Enter at each card, nothing else). The lines a player sees, cut down:

```
04:30 LINE ▶ ACT NOW You will be 150 MW short from 06:25 (the tie limited to 500 MW until 11:15). Start CCGT 2 now: it takes 49 min to reach the grid.
      TRAY ! NETWORK 04:00 Overnight faults: feeders HAR4 and HAR3 under repair, handed back at 06:55 and 07:15.
06:55 CLOCK HELD 0× · R restore · Esc on   FEEDER HAR4's feeder in Harbourside is repaired: about 240 MW with its cold load. R or Enter: restore it now · Esc: go on
07:15 (the same for HAR3)
08:00 LINE ▶ ACT NOW If your biggest unit tripped now, frequency would fall to 49.15 Hz: too low to be secure. Raise the battery GUARD to 400 MW
11:00 LINE ◇ SAVING CCGT 1 is not needed until 16:50. Stop it: saves about $45,000 if nothing trips before then.
12:00 LINE ◇ BATTERY Power is being spilled and the price is −$20. Charge the battery at 200 MW
12:19 CLOCK WATCH T+0.02 s ×0.15   LINE ◉ WATCH The tie line has tripped. The desk is locked while the grid catches itself: watch.
      WATCH Load is lost. Stored spin in every turbine soaks it up. Frequency rises.
12:19:30 CARD PEAK 50.196 Hz: contained within 49.5–50.5 Hz ✓ ... Caught by: spin → battery took 109 MW → load picked up 4 MW → solar and wind backed off 188 MW. N-1 SECURE
15:30 LINE ▶ ACT NOW From about 17:30 one trip would leave you short. Start CCGT 2 now
17:54 TRAY ! MARKET NOTICE Lack of reserve: spare in 5 min is below the biggest risk.
18:30 LINE ‼ URGENT The plan is 800 MW below demand now: discharge the battery at 500 MW, or start GT·C 1 (9 min).
      TRAY ! CITY DESK 18:30 DIRECTED SHEDDING ... District SOL3 shed (directed, 168 MW)
19:19 WATCH CCGT 1 has tripped (compact ×0.5)   CARD NADIR 48.652 Hz: OUTSIDE 49.5–50.5 Hz ✗ ... UFLS 814 MW. SHEDDING: 9 districts dark (2146 MW)
21:00 NIGHT ☾ NIGHT SHIFT The night shift has the desk to 04:00 ... SUPPLY $2.0M · OUTAGES $100.4M · CARBON $3.1M · ALL-IN $105.5M (154.5c/kWh)
04:00 END Day over: 04:00. ALL-IN 158.4 c/kWh · PAR: off ... OUTAGES $147.99M 4,932.9 MWh dark × $30,000 (VCR) ... SAIDI 48.3 min · SAIFI 0.28
      buttons: DOWNLOAD REPLAY LOG · PLAY THIS DAY AGAIN
```

(`jump=04:00 key=Enter` four times, then `jump=04:00 brief`, prints the end card.) Q-18 says a no-input day is meant to fail; it does, by a factor of 17 on ALL-IN.

### 1.2 The same day, hand-played with eight inputs

`node tools/play.mjs 20261014 --no-run send={"type":"start","unit":"ccgt2"} key=Space to=06:00 send={"type":"start","unit":"gta1"} jump=04:00 key=Enter jump=04:00 key=Enter to=08:00 send={"type":"guard","mw":400} to=12:00 send={"type":"battery","mode":"charge","mw":200} ... to=15:30 start gtb1, gtb2; to=16:30 start gtc1, battery idle ... jump=04:00 brief clock` (quote the JSON for the shell).

```
12:19 WATCH T+0.02 s ×0.15 (full)  The tie line has tripped ... Load is lost ... Frequency rises.
19:19 WATCH T+0.02 s ×0.5 | GOVERNORS   (compact: the beat word only, no caption)
19:19:30 CARD NADIR 49.582 Hz: contained within 49.5–50.5 Hz ✓. Caught by: spin → battery 507 MW → governors 93 MW → solar and wind gave back 2 MW → load relief 28 MW. N-1 TIGHT
04:00 END ALL-IN 9.5 c/kWh ... OUTAGES $53 0.0 MWh dark ... SAIDI 0.0 min ... No household was off for more than 3 minutes.
clock: 295.6 real s from Space to 04:00 · E 295.6 = profile 245.0 + WATCH 2x +39.2 + FOCUS 2x +4.0 + OFFER 1x +7.3
```

So the game, as built, works: eight decisions turn 158 c/kWh into 9.5, the GUARD the player set is what the card names ("battery 507 MW"), and the day is 245 s of clock plus about 50 s of watches and offers. That is the raw material. The question of this lens is what hooks a stranger into finishing it, sharing it and coming back, and what the genre knows that the build does not yet use.

### 1.3 The Saturday daily, 20261017 (`desk-weekend`)

`node tools/play.mjs 20261017 timeline=04:30-04:00/60m`: a different Act I (RED5/RED7 feeders; "Late return from maintenance: Mt Hazel coal 4 unavailable until 12:15"), a warned cloud front at 11:25 for 13:35 ("rooftop solar down by up to about 1,450 MW"), the evening trip at 17:49 (full watch; nadir 48.934 Hz, UFLS stage 1). The director does produce different days. The shape (sunrise 06:12, a late-summer belly, a 17:00–19:30 trip) is the same.

---

## 2. The hooks, one by one

For each: what the genre does; what the SPEC says and where; what the build has; what it would take (S: a day, M: a slice, L: a phase); whether the real NEM supports it.

### 2.1 A visible opponent or ghost

**Genre.** Racing ghosts (your best lap drawn beside you), Mario Kart staff ghosts, Trackmania medals; Zachtronics does not draw a ghost but puts your number on a histogram; Mini Metro's daily shows a leaderboard after. A ghost makes "how am I doing" legible every second without a tutorial.

**SPEC.** Par is the reference policy (OD-10, S-4), with an information barrier so it uses only what a player can see. The live SCORE chip compares you with par at the same grid time (§9.1 Q-48). D-23 (Phase 4) wants a replay scrub "with par's line as a ghost"; F-8 says the browser re-runs the autopilot "only to draw the debrief ghost". O-3 says Marg never states the optimal plan; S-4 forbids par leaking its plan.

**Build.** `app/shell.js drawAllIn` (about line 626–640): the header chip reads `SCORE 991` once par has reached the same grid second, else `ALL-IN 9.0c`. `app/par.js` runs par a slice a frame from TAKE THE DESK and keeps a series every 5 grid-min of seven score keys (`PAR_MARK_S = 300`; `KEYS = costDollars, lightsMWh, ...`). The end card (`app/endcard.js fill`) shows YOU / PAR / Δ for SUPPLY, OUTAGES, CARBON, ALL-IN and "Biggest gap to par: OUTAGES +$148M (4,932.9 MWh dark at $30,000 each)". No ghost on the stack, the map or the desk; no par timeline anywhere. `sim/autopilot.js runPar` (line 1772) returns `state`, whose `state.log` is par's own input log (starts, stops, battery orders, with ticks), so par's decisions ARE available at the end of the day for free.

**Gap.** A live ghost of par's plan would collapse the puzzle (it would state the plan: O-3, S-4). A debrief ghost does not, and it is the single cheapest way to turn "D" into "oh, THAT is what I should have done": two rows of ticks, yours and par's, on one 04:30–21:00 strip, with the starts and stops named ("par started CCGT 2 at 04:31 and GT·A at 06:02; you started nothing before 18:30"). Cost: S for the text version (diff of two input logs), M for the drawn strip (D-23-lite, no scrub).

**NEM.** AEMO publishes pre-dispatch and the actual dispatch; post-incident reports compare what was done with what could have been. A debrief ghost is the normal form of an operator's review.

### 2.2 A histogram against other players

**Genre.** Zachtronics (Opus Magnum, SpaceChem): three histograms per puzzle, your bar lit; it is the reason people optimise a solved puzzle. Mini Metro/Motorways daily: a leaderboard. Wordle: no histogram server-side, but the share grid makes the comparison social.

**SPEC.** None. C-1: "No request to another origin"; C-4: GitHub Pages, static. Y-3 is local history only. §7 lists "Daily, spoiler-free share card" as the sharing mechanism. So a global histogram is ruled out by constraint, not by design.

**Build.** Nothing, consistently with C-1.

**Gap and cost.** Any histogram needs one tiny endpoint (a counter keyed by date and score bucket). That is a constraint change (C-1, OD-15 "host it simply"), not a feature cost; the feature itself is S once a store exists. Without it, the social comparison has to ride on the share card (2.3, 2.7). This is a question for the owner (§4, Q-A).

**NEM.** Not applicable.

### 2.3 "One more go" (retry the same day; seeds)

**Genre.** Zachtronics: unlimited attempts, the best counts, the histogram moves. Mini Metro daily and Wordle: one attempt (the day is the stake). Mini Motorways keeps a best score per map. Papers Please: the day restarts from its start. In every case the retry is one click from the end screen and the end screen tells you what to change.

**SPEC.** OD-11 and Y-2: one official attempt (the first run past 09:00); "Replay today" unlimited, marked PRACTICE; practice seeds from the gate-passed pool; "Hard days" in the practice menu. C-3: restart is an in-page reset. D-22 (the counterfactual "what if") was moved OUT of Phase 2 to Phase 4: "not needed for gate 1". Y-1: `?seed` and a date → seed hash.

**Build.** The end card's PLAY THIS DAY AGAIN (`app/endcard.js build`, `deps.again → G.resetDay(game)`) replays the same seed. There is no restart during the day. `app/game.js:129–134` reads `?seed=N` and `?date=YYYY-MM-DD` from the URL and `index.html:8` keeps the query on the redirect, so any day is linkable today (`next.html?seed=20261014`), but nothing in the UI offers it. No history, no attempt count, no practice menu (Phase 4).

**Gap.** Two things make "again" worth pressing: knowing what to change, and the day keeping the better result. Today the end card names an axis ("Biggest gap to par: OUTAGES") and a formula ("Score = 1000 × par's ALL-IN ÷ yours"), not a decision. And Q-18 ("a no-input day is meant to fail") plus Y-2 (first attempt official) together mean a stranger's one official, shareable result is very likely a D. Wordle can afford one attempt because its first game is winnable; this game's first contact is designed to be lost. Costs: a RESTART DAY control in the header, S; the log-diff lesson (2.1), S; best-of-day with the attempt count on the card, S once Y-3 exists (it is a rule, not code).

**NEM.** Operators train on the same scenario repeatedly in simulators; "one official attempt" is a puzzle convention, not a grid one.

### 2.4 Meta-progression or unlocks

**Genre.** Spelling Bee ranks (Good Start → Genius → Queen Bee); Wordle's streak and distribution; Mini Metro unlocks cities; Zachtronics unlocks puzzles by solving. Nobody here uses money. The hook is "there is a next thing".

**SPEC.** OD-16 and W-5 forbid money, perks and progression seasons. But O-3 IS a progression ladder: five introductions on the first shift, the rest "on dailies 2–5, at most two per day, when the situation first calls for them" (coal and CCGT levers, the battery dial, the tie knob, diesel and DR, ACK and SILENCE). Y-3: STREAK and BEST. S-6: PERFECT badge; Y-4 tags "first shift", "hand-flown", "glass broken", "DNF". Q-89: 2d's debrief counts clean SYNC closes.

**Build.** None of it. `app/game.js SEEN_KEY = 'gridwatch:v4:seen'` remembers only `seen.watch / ufls / rocof` (which watch version to play). Every control is on the desk from the first second (no cover plates: 2e).

**Gap.** The ladder exists on paper (O-3) and would read as progression if it were visible: "Day 1: SYNC, RESTORE, the stack, the suburb card, the hydro wheel. Day 2: Marg hands you the battery dial." A one-line "desk log" on the end card and a row of earned tags (PERFECT, clean closes, glass broken, hand-flown) is S once 2e's handover exists; the tags alone are S now. One more yardstick costs nothing and is already in §8.1: the AER 2024 all-outages SAIDI is 394 min per customer per YEAR; the do-nothing day's SAIDI was 48.3 min in one evening. "Your city's SAIDI today: 48 min. An Australian network's whole year: 394." is a line a stranger understands and a data person (the owner) would enjoy. S.

**NEM.** Control-room trainees are signed off control by control; the handover ladder is realistic.

### 2.5 Variety and surprise: events, weather, incidents from NEM history

**Genre.** FTL's event deck; Frostpunk's storm; Papers Please's daily rule changes; Mini Metro's new line/asset each week. Blackstart (§7) ships 13 regions and named historical days: Iberia 2025, Italy 2003, Texas 2021. Variety is what makes day 5 not play like day 1.

**SPEC.** §3.3 measured the weakness: two calm days' action timelines correlate at 0.79. D-8 is the answer (temperature class, overlays, one crisis per act, warned leads). Q-5/Y-9: weather seasons follow the calendar (summer heat evenings, the winter double peak, spring's deepest belly, autumn's early dusk), "on the cut list if Phase 4 runs long". §8.2: "Every daily is a late-summer day, until Y-9 ships". D-24: five "this really happened" cards (Loy Yang A3 2017, Callide C 2021, SA backstop 2021, SA negative prices, SA black system 2016), each with a source and a "what we simplify" line. Phase 3 U-7/U-8: the backstop, complaint bubbles, a news ticker.

**Build.** `sim/dayplan.js` + `content/scenarios.js DESK.dayplan`: Act I a tie derate (50%, 400–550 MW until 10:00–12:00) or a late return (50%), plus two feeders to restore (85%); Act II a cloud front 40% / unit trip 25% / smelter trip 20% / tie trip 15% (heat days: unit 40 / smelter 30 / tie 30); Act III heat 15% / storm 25% (link trip on 60% of storms) / drought 20% / calm 40%, plus the evening trip of the largest machine 17:00–19:30 (Q-85: heat days too). Q-72 caps unwarned contingencies at 2 a day, ≥ 90 real s and ≥ 60 grid-min apart. 365 dailies are stored (`content/dailies.js`: 17 exceptions). The sim has `unitTrip` (rules 'largest' and 'station'), `linkTrip`, `smelterTrip`, `unitOutage`, storms with `windCutout`, fronts per suburb (Q-79). No seasons; no incident cards; no ticker.

**Gap.** Two hooks are missing and both are cheap relative to what exists:

(a) **Seasons.** The engine keys everything on the scenario's sun table (`scenarios.js sun.riseH/setH`, `ROOF_SHAPE_PM`) and the demand curve. A winter scenario (sunrise 07:20, sunset 17:30, no belly, a 07:00 heating peak and an 18:00 peak with no rooftop help) is a different puzzle from the same code. Y-9 as specced (a `content/seasons.js` per-month table, daily-gen gating per season) is M. The fun argument is already in Q-5; the realism argument too ("a July heatwave would break the realism rule"). I would take it off the cut list.

(b) **Incident days.** D-24's cards are the best "why the grid is interesting" content the spec has, and they are unbuilt. The step beyond a card is a playable day: "Callide, 25 May 2021: 13:40, a unit's explosion takes about 2,300 MW; 48.53 Hz; UFLS sheds 1,308 MW; the operator restores hundreds of thousands of customers over the afternoon." Or "Moorabool, 13 Feb 2024: transmission towers fall at midday in a storm; Loy Yang A's units trip; about 90,000 customers shed; the region is short for the evening." Or "Black system, 28 Sep 2016: towers down, the interconnector overloads, RoCoF about 6 Hz/s, nothing catches it" (a watch that ends in the dark). Or "June 2022: coal fuel is short, generators withdraw, the market is suspended and the operator directs units on". The sim can express all but the cascade: Q-72 (≤ 2 trips, 60 min apart) is a fairness rule for the daily and would be waived in a labelled INCIDENT mode that never takes the daily slot (as S-7's Hard days do). Each day is scenario data (`dayplan` is data, Q-65: "2e can pin the first shift as a scenario variant by data alone") plus its D-24 card as the briefing. M for three days; the region stays fictional, so label "inspired by".

**NEM.** These are the NEM's own history; §8.1 already cites the Callide and SA reports. Blackstart (§7) proves the audience wants named days.

### 2.6 A human voice

**Genre.** Papers Please (the inspector's family, the stamps' click, "Glory to Arstotzka"), FTL's event prose, Frostpunk's "but was it worth it?", Universal Paperclips' deadpan log lines. The voice is what turns a loss into a story people retell. Wordle has none and does not need one: its share grid is the story. GRIDWATCH has no grid, so it needs the voice.

**SPEC.** OD-3 "a serious control room with dry wit"; O-6 Marg (31 years on the desk, ≤ 25 lines first shift, ≤ 6 later; "Twelve o'clock. Not eleven."); U-1 one-line suburb personalities; Y-7 ≥ 40 closing lines keyed by outcome bucket, seeded so friends with the same result get the same line ("Nobody noticed. That's the job."); U-8 complaint bubbles and a news ticker (Phase 3); K-15's captions ("Restoring fifty is AGC's job, and yours.").

**Build.** `grep -rni marg app/ content/ desk/ render/ next.html` finds nothing but CSS margins. The only wit in the game is `app/suburbcard.js:14–17 WIT` ("Remembers 2009. Will ring talkback."; "On off-peak hot water since 1962; has never asked why."), shown on the suburb card only. The watch's captions carry one line of voice ("Restoring fifty is AGC's job, and yours."). Every other string is an instrument or an institution: NETWORK, MARKET NOTICE, WEATHER BUREAU, STATION, CITY DESK; "the tie limited to 500 MW until 11:15". The end card's last words are "A distributor's STPIS would not count this shedding" and a hash.

**Gap.** The cheapest voice is Y-7: one closing line on the end card, picked by (lights vs par, cost vs par, lowest Hz), seeded by date. That is S and it is the line people will quote. Five Marg lines (the briefing, the first ask, the settle beat, the end of a clean day, the end of a dark day) are S and do not need 2e's introductions to land. The full O-6 system is 2e.

**NEM.** Control rooms are dry. A supervisor's one-liners are the most realistic thing in the spec.

### 2.7 A moment worth a screenshot

**Genre.** Wordle's grid; Zachtronics' solution GIF and histogram; Kerbal's "my rocket on the Mun" screenshot; Mini Metro's end-of-game map with the passenger count; Frostpunk's frozen city. The screenshot is the share; the share is the funnel (OD-1).

**SPEC.** K-15 the watch (five beats, captions, the spotlight, rotors slowing, the hum sagging); G-5 (smoke, strobe, districts going dark with a clack); D-21 "the moment" (time, map zoom, ±3-min trace, what caught it, your headroom vs par's); Y-4 the text share card with the 12-block sparkline; Y-6 a 1200×630 PNG with the 24-h frequency trace and the hourly strip, "deferred until after Phase 4; first on the cut list"; Y-8 og:image.

**Build.** The watch exists and is good: `shots/1b-map-watch.png` is a dark map, a green spotlight on Mt Hazel, a red "⚠ MT HAZEL COAL 1 TRIPPED" label, and the desk stopwatch; the map by day shows dark districts hatched with "OLD HAZELTON: 1 DARK" (`shots/1b-map-1848.png`). The end card is a text table. There is no share card, no sparkline, no PNG, no "moment" (`grep -n share app/endcard.js app/shell.js next.html` → only "share of the energy").

**Two defects of the moment, as built.**

(i) **The one full-length watch is spent on whichever trip comes first.** `app/director.js:100–103`: `d.version = !d.seen.watch || newRocof ? 'full' : 'compact'`, upgraded to full only for a first UFLS. On today's daily the first trip is the tie at 12:19 in the belly, where the tie is exporting, so the day's only captioned, 29-s watch reads "Load is lost. Stored spin in every turbine soaks it up. Frequency rises." / "Solar and wind back off 188 MW; governors close." and the respond card celebrates "PEAK 50.196 Hz ... N-1 SECURE". The evening coal trip, the north star's moment ("watch real physics catch the fall when a power station trips"), then plays compact: `19:19 WATCH T+0.02 s ×0.5 | GOVERNORS` with the beat word only, 10.5 s, no "YOUR GUARD: 400 MW" caption (`app/watch.js caption`, the 'battery' beat), even though the card then says "battery 507 MW" was what caught it. By the director's menu (`DESK.dayplan.act2.mix`) an Act II contingency precedes the Act III trip on 60% of non-heat days and 100% of heat days (about 66% of dailies), and on the smelter and tie-export cases the first full watch is a loss-of-load. Fix: treat the first loss of SUPPLY as "something new" like the first UFLS (`seen.fall`), one condition in director.js. S. (A smaller wording defect on the way: the tray card says "Interconnector tripped: -300 MW of import lost" while the watch says load is lost and frequency rises; the sign convention leaked into the player's text.)

(ii) **Nothing is capturable.** The end card is accounting; the sparkline card is Phase 4; the PNG is after that and first to be cut. I would invert that: the PNG (the 24-h frequency trace with the nadir pin, the map's dark districts at the moment, the marks) is the Wordle grid of this game; the text card is its fallback for messaging apps. M, and it reuses the trace the watch already records (`sim/README §5 conts[]`: `extremeHz, extremeTick, pre, caught, uflsStages, contained`) and `app/par.js`' 5-minute series for par's line.

**NEM.** AEMO's incident reports lead with exactly this picture: the frequency trace with the nadir and the UFLS stages marked.

### 2.8 A 15-second explainer of why the grid is interesting

**Genre.** Universal Paperclips opens on one button and a number. Papers Please: one stamp, one rule, "Glory to Arstotzka". Mini Metro: no words for a minute. Blackstart's pitch is "hold 50 Hz yourself". The explainer is the first thing a stranger reads; it decides whether they take the desk.

**SPEC.** D-3: briefing ≤ 20 s and ≤ 60 words, one plain goal line ("Line up enough power before the city needs it; the machines handle the seconds"), a 24-h forecast skyline, one "watch for" line, one supervisor line, one button. O-2: first real action within 60 s. O-4: concept cards wait for the debrief on a first shift.

**Build.** `next.html:202–216` and `app/shell.js:116`: the briefing card is "Tonight's desk" + `#briefing-text` (48 words: "You decide which power stations run, and when. The dispatch system sets how hard each running unit works...") + `GOALS_TEXT` (57 words: "...plus $30,000 for each MWh dark that is yours (a feeder under repair becomes yours at its hand-back), plus $80 a tonne of CO₂: regulators' values of reliability and emissions. Par, GRIDWATCH's autopilot on this day, scores 1000...") + `#briefing-how` (103 words: "...click its ○ button on the lever bank (hydro units: beside the HYDRO wheel); it turns into START?, so click it again to confirm. Keys: 1–5 pick a lever (6 the HYDRO wheel), then S S...") + the day line (about 25) + Watch for (about 20) + AGC/HAND + TAKE THE DESK. About 250 words: four times D-3's budget, and no skyline. None of it says why a grid is interesting; the closest the whole game comes is the watch caption "Stored spin in every turbine takes the hit."

**Gap.** The explainer the spec wants is three sentences, and the physics is the hook: "1.9 million homes. Every second, what is made must equal what is used; if it does not, the needle falls, and at 49.0 Hz relays start cutting suburbs off to save the rest. You decide which power stations run and when; the machines handle the seconds." Then "Watch for:" and TAKE THE DESK. The how-to belongs on the first ask: the LINE already says "Start CCGT 2 now"; its first instance can add "(click ○2 under CCGT, then START?)". The score formula belongs under "?". S, and it is a 2e item the spec already owns (D-3); it should not wait for 2e.

**NEM.** The sentence is true of every AC grid.

### 2.9 A story arc across a week

**Genre.** Frostpunk's storm (announced on day 1, firming up, the whole game is preparing for it); Papers Please's 31 days with a family ledger; Power Grid's build-out and the step-2 shock; FTL's chasing fleet. A week gives a reason to return that a streak does not.

**SPEC.** Phase 5 W-1..W-5: five linked days seeded by ISO week; carry-over of water, battery charge, wear, patience, warm state; W-3 a 5-day outlook with a big day on Thursday or Friday whose forecast firms up; W-4 one transition choice (a coal machine retires Wednesday night; pick a grid-forming battery, a fast peaker or a VPP, labelled "approved years ago; you choose which lands"), with the week debrief re-running par for each option; W-5 no money. H-17 grid-forming physics for the battery option.

**Build.** None. The day has acts (Q-78 names them on the badge) and no arc beyond the day.

**Gap.** This is the strongest retention hook in the spec and it is correctly last: it needs the daily (Y-3) to exist. W-3 and W-4 are the two ideas worth protecting when Phase 4 runs long; W-2's five carry-overs are not (a 5-day water budget and wear are accounting; the storm and the choice are drama). Nothing to pull forward now except keeping the generated year's stamp and dates stable so a week can be seeded from it later (Q-75 already does).

**NEM.** The ISP's build choices and the retirement of coal units are real; a week with one choice is an honest miniature of it.

---

## 3. The two named competitors, once more

§7's table is fair as far as it goes. What it understates: Blackstart's named historical days are a hook GRIDWATCH has specced (D-24) and not built; Grid Operator's decision cards with action buttons are rightly avoided, but its "RUN DAY" gives the player a clean plan→result loop that is easy to retry and compare, which is the "one more go" hook GRIDWATCH lacks today (the end card's PLAY THIS DAY AGAIN with no lesson attached). The one thing neither does, and GRIDWATCH already does, is the watch: a real swing-equation trace the player can read in slow motion. That is the differentiator, and 2.7(i) shows it is being spent on the wrong trip on two days in three.

---

## 4. Questions for the owner

**Q-A. The histogram and C-1.** A global "how did others do today" needs one endpoint; C-1 forbids any request to another origin.
Options: (a) keep C-1: the share card carries the comparison (vs par), nothing global; (b) allow one read-only counter (a Cloudflare Worker + KV, or similar) for a per-date score histogram, opt-in, no identity; (c) defer until gate 2 and ask testers whether they wanted it.
Recommendation: (c) now, (b) if two of five testers ask. The share card (vs par) does most of the social work in Wordle's model, and par is a better yardstick than strangers.

**Q-B. One official attempt (OD-11, Y-2) versus best-of-day.** The first day is designed to be lost (Q-18) and the end card does not yet say why.
Options: (a) Y-2 as written: first run past 09:00 is official, replays are PRACTICE and never shared; (b) the day's best attempt is official, the card shows the attempt count ("A ★ · 2nd go"), practice is the same seed; (c) (a) plus a mid-day RESTART that cancels the attempt before 09:00 only.
Recommendation: (b). Wordle's one attempt works because its first game is winnable; this game's first contact is meant to fail. Zachtronics and Spelling Bee keep the best and nobody calls them unfair; the attempt count on the card keeps it honest.

**Q-C. Which 2d/2e items move before gate 1?** The spec puts the share card (Y-4), closing lines (Y-7), the counterfactual (D-22) and the PNG (Y-6) in Phase 4 or after. Gate 1's pass criteria (≥ 4/5 finish, retell the job, name two defences) do not test sharing, but OD-1's success is "strangers finish a session and share it".
Options: (a) as specced; (b) move Y-4 + Y-7 + a log-diff lesson into 2d (S–M), leave Y-6 and D-22 proper in Phase 4; (c) (b) plus Y-6.
Recommendation: (c). Gate 1 should watch someone press SHARE; otherwise gate 2 is the first time the funnel is seen.

---

## 5. The five ideas I would pitch first, and the one thing to stop

1. **Spend the full watch on the fall.** `seen.fall`: the first loss-of-supply trip gets the captioned 29-s watch even if a belly trip came first (director.js:100–103). S. Then make it capturable: a PNG card with the frequency trace, the nadir pin, the dark districts and the marks (Y-6 off the cut list). M.
2. **Make the loss teach.** On the end card, three lines from the two input logs: what par did and when that you did not (`runPar` → `state.log`), the first of them lit on the desk; plus a Y-7 closing line. S–M. This is what makes PLAY THIS DAY AGAIN worth pressing.
3. **Best-of-day with an attempt count, and RESTART DAY in the header** (challenge Y-2; see Q-B). S.
4. **Seasons** (Y-9 off the cut list): a winter daily with no belly and a heating double peak is the cheapest second puzzle the engine can make. M.
5. **Incident days** as a labelled mode that never takes the daily slot: Callide 2021, SA 2016, Moorabool 2024, June 2022, each with its D-24 card as the briefing, Q-72 waived in that mode. M.

(And the three-sentence briefing, 2.8, which is S and overdue by the spec's own D-3.)

**Stop:** adding accounting and regulatory prose to the surfaces a stranger meets first. The briefing is 250 words about VCR, VER and key chords; the end card closes on SAIDI/SAIFI/MAIFI, STPIS and a hash. Every one of those lines is defensible and belongs under "?". The owner asked for the ALL-IN score (Q-48) and the explainers (Q-46); they did not ask for the formula on the first card. Until the share card and the moment exist, each added paragraph on those two cards lowers the chance a stranger finishes.

---

## 6. Findings

The structured list (twelve, ordered) is in the StructuredOutput. Each is checkable by the file:line, SPEC/README section or exact `play.mjs` command named above.
