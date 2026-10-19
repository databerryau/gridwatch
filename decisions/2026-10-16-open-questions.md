# GRIDWATCH: decisions waiting on you (16 Oct 2026)

**Answered 2026-10-20.** The owner took the recommendation on 1-15 ("Your recommendations") and chose the switch-over (17) but not telemetry yet (16). The answers are SPEC.md §9.1 Q-111–Q-126, and they build in W7 (SPEC.md §5). Telemetry stays open in SPEC.md §9.2.

This brief covers the 15 open questions in SPEC.md §9.2 (lines 724-738), plus telemetry (Y-10) and the switch-over to the root page (F-14). Four read-only researchers checked each one in the code and on the shipped dailies. Nothing has been built. Read the table, open any section you doubt, and answer by number ("1 yes, 3 C, 7 relabel"). Most measurements come from one run per date, so treat them as samples. Weak recommendations and conflicts are marked. Some questions are linked: 2 feeds 3, 4 depends on 11, 15 makes later sim changes cheap, and 16 and 17 both need F-9's build id.

**Words used.** *Par*: the reference operator you're graded against. *GUARD*: battery power held back to catch a trip. *N-1*: whether the grid can lose its biggest machine without shedding load. *UFLS*: relays that drop suburbs automatically at 49.0 Hz. *AGC / HAND*: AGC is the default mode, where the system syncs and dispatches units for you; HAND is the harder mode, where you do it yourself. *SIM_VERSION*: the sim's version stamp. Changing it means regenerating the dailies and the stored par.

| # | Question | Recommendation | Cost | Your call |
|---|---|---|---|---|
| 1 | City soak booking (Q1) | One press books the city; trim on the card | S-M | yes / no |
| 2 | TRIP SHEDS word (Q4) | Fifth N-1 word, desk only | S | yes / no |
| 3 | Alarm tiles (Q9) | Plain words, and the board lights only when you can act | M | C / A / B |
| 4 | Prices on asks (Q5) | Both sides, only in "? IF PRESSED" (weak) | S-M | B / A / C |
| 5 | Restore and SYNC (Q8) | Show the dip; SYNC on HAND days only | S | yes / no |
| 6 | "When is it on" (Q15) | One shared function | S-M | yes / no |
| 7 | SCORE chip (Q2) | Hide until 21:00 | S | hide / relabel / leave |
| 8 | Rank names (Q3) | Beside the letter everywhere | S | yes / verdict only / rename / no |
| 9 | What par did (Q7) | Three factual lines, plus par's GUARD on your trip | M | yes / plus a what-if / no |
| 10 | Carbon choice (Q14) | Coal-off call, after a count (weak) | M | yes / words only / leave |
| 11 | Evening trip (Q6) | Briefing says "Expect a trip at the peak." | S | yes / vary it in the sim |
| 12 | Seasons (Q13) | Light seasons before April 2027 | M later | yes / no |
| 13 | Phase 3 and 5 (Q11) | Cut week mode; VPP only on evidence | S now | yes / no |
| 14 | Concept cards (Q12) | Cut; three first-time Marg lines | S | yes / notebook |
| 15 | Golden and stamp (Q10) | Verify all 365 pars, then restamp | S-M | yes / keep / BALANCE_VERSION |
| 16 | Telemetry (Y-10) | Cloudflare Worker + D1, anonymous, opt-out | M | yes / Supabase / Apps Script |
| 17 | Switch-over (F-14) | Move the game to the root after this batch | S-M | yes / launch day / never |

## The desk and the line

### 1. One "soak the city" booking (Q1)

**Today.** The hot-water soak is free (sim/params.js:501, sim/grid.js:574-575), and the line asks for it one suburb at a time (app/objective.js:1413). On 2026-10-14, 6 of the line-follower's 24 asks were soaks. All six came within 14 minutes, all were for 11:00-15:00, and they came to 480 MW in total.

**Options.** A: one press books every free suburb, and the card keeps per-suburb CANCEL and BOOK. B: the line asks for a size. C: hot water moves to noon automatically. D: keep it.

**Recommendation: A.** Six identical free clicks are a chore. One booking keeps the real choices: when to aim it, and whether to cancel on a cloud-front warning. It also matches how a distributor works: one ripple-control signal moves all its controlled load. C leaves mild days with no city lever. B's sizing never mattered, because the line always wanted all 480 MW.

**Cost and risks.** S-M, app only, and the dailies stay valid. One press logs six inputs, so the decision count must count presses, not inputs. Nobody has measured a full booking on a cloud-front day.

**Decide:** One SOAK THE CITY booking, with trimming kept on the card? yes / no

### 2. TRIP SHEDS, a fifth N-1 word (Q4)

**Today.** TIGHT (sim/grid.js:1246-1248) covers everything from a comfortable margin to "the next trip sets off the relays". So the gauge shows an amber TIGHT beside a red preview (desk/gauge.js:32, 156-163). The respond card says the spare "covers the next trip" (app/watch.js:252). Line-followed days spend 505-669 minutes TIGHT, but only 8-19 minutes with a preview below 49.0 Hz. In those minutes the spare is often 2-3 times what's needed. It just can't arrive fast enough.

**Options.** A: a fifth word on the desk only ("would fall to 48.99 Hz: the relays would shed 2 districts"). B: a fifth level in the sim. C: keep TIGHT and fix two sentences.

**Recommendation: A.** It's rare, so it means something. It also teaches the low-inertia lesson: with fewer spinning machines, frequency falls faster, so plenty of spare can still be too slow. B changes the replay hash and gains nothing in play. C leaves an amber word next to a red preview.

**Cost and risks.** S, no sim change. The preview hovers at the 49.0 Hz edge for minutes at a time, so the word needs a minimum display time or it will flicker. The preview can be 0.1 Hz optimistic (sim/params.js:399), so the wording should say "would", not "will".

**Decide:** Add TRIP SHEDS on the desk, no sim change? yes / no

### 3. The alarm tiles (Q9)

**Today.** There are twelve tiles in 8.5-px type, labelled in jargon like HIGH RoCoF and AGC LIMIT (app/alarms.js:102-115). N-1 INSECURE clears only after 30 grid-minutes of SECURE (app/alarms.js:64). So on A-grade days it is lit for 661-753 of 990 minutes, and PEAK stays lit for the whole peak. The north star promises that at the peak "the alarms stay dark" (SPEC.md:32), but they never do.

**Options.** A: plain words only (LOW FREQ, NOT SECURE, RELAYS SHED...). B: one ALARMS lamp with a count. C: plain words, plus a board that lights only when you can act. N-1 lights only at SHORT, SHEDDING or TRIP SHEDS, and PEAK is retired. On followed days that means 14-80 lit minutes, against 233 for a player who does nothing.

**Recommendation: C.** New words alone don't stop the board crying wolf. C makes a dark board the reward the north star describes. It also follows the alarm guides the spec already cites (EEMUA 191, SPEC.md:591): every alarm should need an operator action. B hides the desk's most control-room-looking instrument, and it would still cry wolf.

**Cost and risks.** M (A alone is S). About a dozen tests pin the current labels. Near-misses, where a trip would breach 49.5 Hz but shed nothing, would show only on the gauge. The new words must fit tiles 53 px wide. C needs question 2's word.

**Decide:** C, A or B?

### 4. Prices on both sides of the line's asks (Q5)

**Today.** A STOP ask gives its saving ("saves about $303,000", app/objective.js:1252). The GUARD ask gives only Hz. At 17:30 on 2026-10-14, cutting the GUARD from 400 to 200 MW frees energy worth at most about $37k. But a trip would then shed 332 MW, which costs about $1.7M for every 10 minutes dark.

**Options.** A: both sides in every ask. B: both sides only in the "? IF PRESSED" line (app/objective.js:1453), when you turn the GUARD or consider a STOP. C: put the GUARD's value on the end card.

**Recommendation: B, but weak.** The trade is 40-100 to 1, so pricing every ask would just say "obey" in more words. Shown when you reach for the control, the price itself is the lesson. But B only pays off if the evening is a gamble, and it isn't. Question 11 keeps the evening trip certain, so the price will always say "keep the GUARD".

**Cost and risks.** S-M, app only. Both numbers are estimates. The STOP quote's own accuracy target was waived, because only 38 of 140 quotes came within 30%.

**Decide:** Prices only in "? IF PRESSED"? yes / no / A / C

### 5. RESTORE and the SYNC scope (Q8)

**Today.** The restore check refuses every unsafe close, and PERFECT already scores how quickly you restore (app/endcard.js:34). After a restore, FOCUS plays in real time for 2 grid-seconds (app/director.js:111-114). The cold-load dip takes 3.2-4.6 s to recover, so you see the fall but never the recovery. On AGC days the synchroscope is offered up to three times, and each offer slows the clock for up to 8 real seconds. Yet a hand close mattered on 0% of 100 dates (Q-89).

**Options.** A: FOCUS holds until frequency recovers, with one caption ("Cold load picked up: 240 MW, back in band in 4 s"), and SYNC is offered on HAND days only. B: add a "clean pickups" count and keep the AGC offers. C: A, plus one SYNC offer after a trip.

**Recommendation: A.** There's no skill to count. By one threshold no pickup was clean, and by the other all of them were. What's missing is the picture of the recovery. Dropping the offers also gives back 15-24 real seconds of a six-minute game.

**Cost and risks.** S, no sim change. AGC players may never meet the synchroscope, so keep START on a spun-up unit as a way to open it.

**Decide:** FOCUS until recovery; SYNC on HAND days only? yes / no

### 6. One answer to "when is this unit on" (Q15)

**Today.** The researchers found seven pieces of code that answer it, where SPEC.md:738 says five. They include sim/grid.js:1434, app/objective.js:307 and app/planview.js:104. In HAND mode they disagree. At 04:30 on 2026-10-14 the line says CCGT 2 is 45 minutes away, but the Live Stack says 49.

**Options.** A: one module for both "when is it on" and "what is short ahead". B: one function for "when is it on" only, keeping the three "short" checks and naming each one. C: no merge; a test checks the copies against each other.

**Recommendation: B.** It fixes the one disagreement a player can see, without moving par. A changes par's day for no visible gain.

**Cost and risks.** S-M (A is L). It touches sim/, so it must give identical results in AGC mode, or it needs a version bump.

**Decide:** One shared "when is it on" function now? yes / no

## The score and the ending

### 7. The live SCORE chip (Q2)

**Today.** All day the chip shows 1000 × par's cost so far ÷ yours (app/shell.js:734-747), and it wanders for reasons you can't see. On 2026-10-14 one script sank to 966 by 15:00 with nothing wrong, then finished on 998 A. The dip came only from par running a different timetable. In the review, the chip read 1001 ten minutes before the lights went out.

**Options.** A: hide it until 21:00, then count up with the night strip. Marg already says "Your day is scored at four" (app/marg.js:19). B: relabel it "vs PAR so far". C: show the letter so far, which would still say A right up to a dark evening.

**Recommendation: A.** The score becomes a reveal, and your eyes go to what actually predicts it: the N-1 gauge, LIGHTS ON and the plan line. No real control room runs a live scoreboard against a reference operator.

**Cost and risks.** S. Players who enjoy a live race against par lose it, which gate 1 can ask about.

**Decide:** Hide the chip until 21:00? yes / relabel / leave

### 8. Rank names beside the letter (Q3)

**Today.** The verdict, share card, Marg and the shelf show points and a letter (app/endcard.js:151, app/share.js:135). An A is within 10 MWh-equivalents of par, and ★ means par or better (app/score.js:10-12).

**Options.** A: D TRAINEE, C SHIFT OPERATOR, B SENIOR OPERATOR, A SHIFT SUPERVISOR, A★ MARG'S CHAIR, and BLACK START CREW for a black grid, shown everywhere. B: on the verdict only. C: ranks instead of letters. D: none.

**Recommendation: A.** People repeat titles ("I made Marg's chair"). Marg signs as SUPERVISOR (app/marg.js:17). Following the coaching line gives a median of 992, which misses the ★, so the chair means outplaying the coach. Share cards with ranks stay under 280 characters in the samples measured.

**Cost and risks.** S, text only. The risk is inflation: following the line usually earns an A, so a first-time player becomes SHIFT SUPERVISOR on day one. Rename A lower if that feels too generous.

**Decide:** Ranks beside the letter? yes / verdict only / rename / no

### 9. "What par did that you didn't" (Q7)

**Today.** D-22 (30 background re-runs to find your best single change) is unbuilt and on the cut list. At about 2.7 s per day, 30 re-runs won't fit in the 12-s night roll on your PC. A raw list of differences is noise: it gave 25 entries for a script that finished only 0.5 behind par. Tied to the loss, though, it is sharp. On 2026-10-24 a script shed 193 MWh at 20:49 with a GUARD of 0, while par had 300.

**Options.** A: up to three factual lines under the end card's key moment, plus par's GUARD tried on your trip using the existing replay (app/verdict.js:234-263). D-22 is retired. B: A, plus one measured re-run. C: D-22 as written. D: nothing.

**Recommendation: A now, and B after gate 1** shows people read the verdict. Every number in A comes from code that already runs.

**Cost and risks.** M, no sim change. Readers may take correlation as cause, so the lines must stick to facts like "par had...". Par's trip may hit a different machine from yours.

**Decide:** Retire D-22 for the words-only diff? yes / plus one what-if / no

### 10. A carbon choice that matters (Q14)

**Today.** Carbon is 36-53% of par's cost, but players move it by 1.3% at most. At $80/t, coal (about $102/MWh all-in) and the combined-cycle gas plant (about $108) cost nearly the same. The only close carbon call is taking coal off through the midday dip. On 2026-10-14 that saved $52k of carbon but cost $937k of supply. The line never offers it (app/objective.js:1207). Its STOP savings also leave out the carbon the score charges (app/objective.js:506-538).

**Options.** A: STOP quotes include carbon, and the line offers "coal off until tomorrow" on days when it pays. B: honest words only. C: take carbon out of the score. D: a higher carbon price on some days, which would be an invented number.

**Recommendation: A, after one count. This is the weakest recommendation here.** It's the fleet's one realistic carbon decision, and it makes the line and the score count costs the same way. But nobody has counted how often it would fire. It is probably rare until seasons (question 12) bring deeper midday dips. If the count is tiny, adding carbon to the quotes plus B's words may be enough.

**Cost and risks.** M (L if par changes too). Gas STOP quotes would rise, which can shift the coached score.

**Decide:** Coal call after the count? yes / words only / leave

## The day and variety

### 11. The certain evening trip (Q6)

**Today.** Every non-storm day trips its biggest machine between 17:00 and 19:30 (sim/dayplan.js:197), with no warning. That happens on 271 of 365 dailies, and 71 (19.5%) have no evening trip. SPEC.md:111 says "about a third" have none, which is out of date.

**Options.** A: the briefing says "Expect a trip at the peak." B: vary the trip in the sim and add a rare second one. C: A now, B later. D: leave it.

**Recommendation: A.** Returning players already know. Telling first-timers follows the same reasoning that added the storm line (Q-110). The fun is in anticipation: you know the test is coming, but not the minute. Real operators always plan for the biggest single failure. A random second trip mostly tests luck. D-29's Callide C day, a real double trip, gives that twist with a true story behind it.

**Cost and risks.** S, and the sim doesn't change (B is M-L). Players will hold the GUARD high for the whole peak. It also keeps question 4's price one-sided.

**Decide:** Announce the trip on non-storm days? yes / vary it in the sim

### 12. Seasons (Q13)

**Today.** Every daily is the same late-summer day, with a heatwave on 15% of days all year round (content/scenarios.js:20-26, 236-242). On the shipped calendar, 36 heatwave dailies fall in April-September 2027.

**Options.** A: keep late summer through gate 2, and before April ship a month table of sun times, solar output and heatwave share. B: the light version now. C: full seasons before gate 2. D: never.

**Recommendation: A.** Seasons are the biggest variety win, but they pay off for players who come back for weeks, and gate 2 shows whether they do. From April an out-of-season heatwave breaks the realism in a way any Australian will notice, so the light version has a deadline.

**Cost and risks.** M, plus a regeneration (cheap after question 15). Some rules assume a long summer day, and winter dates may fail par's check that the day can be won.

**Decide:** Light seasons before the April 2027 dailies? yes / no

### 13. Phase 3's levers and Phase 5's week mode (Q11)

**Today.** Both are listed as "Later" (SPEC.md:468-472). The evening already has 11 decisions against a target of 8-12, while midday has about 90 s of near-nothing. In 400 days, par never reaches the point that triggers the rooftop backstop.

**Options.** 1: cut Phase 5. From Phase 3, keep only a region-wide VPP (home batteries charged at noon and spent at the peak), built only if testers or telemetry show midday is dead time. The backstop becomes a 14 March anniversary daily. 2: schedule both after gate 2. 3: cut both.

**Recommendation: 1.** A VPP is a noon-to-peak trade like the GUARD, while the evening levers would crowd an evening that's already full. Week mode's best idea, the outlook, already ships as D-28.

**Cost and risks.** S to record now (the VPP is M later). It's reversible, because the text stays in SPEC-history.md.

**Decide:** Cut Phase 5; VPP only on evidence? yes / no

### 14. Concept cards and "why?" (Q12)

**Today.** Neither O-4's seven concept cards nor O-5's "why?" button is built. The watch, Marg and EXPLAIN already teach most of what they would. You also ruled out new pauses (Q-101).

**Options.** A: cut both, and give Marg three first-time lines: negative prices, coal stuck at minimum while solar spills, and the first relay shed. B: a "?" notebook. C: build them as specified. D: cut, add nothing.

**Recommendation: A**, and revisit B if gate 1 testers can't explain their grade. Lessons land best in a character's voice, in the moment.

**Cost and risks.** S. Questions 8, 11 and 14 all add Marg lines, so keep an eye on her word count.

**Decide:** Cut, and give Marg three lines? yes / notebook

## Process, telemetry and going live

### 15. The golden and the dailies stamp (Q10)

**Today.** Each version change costs 25-40 minutes of your PC. It re-records the classic golden (a reference run of par), re-checks the 365 dailies, and regenerates the ladder that grades them. SIM_VERSION changed 13 times in 16 days. The last seven golden re-records changed only hashes, and the last two dailies runs changed only the stamp.

**Options.** 1: keep as is. 2: a `--verify` run replays par on all 365 dailies and, if everything matches, rewrites only the stamp. The classic golden moves out of the test suite. 3: a BALANCE_VERSION bumped by hand.

**Recommendation: 2.** It keeps every guarantee and drops the paperwork. Now that the ladder grades real players, a forgotten hand bump would grade everyone against the wrong par. The verify run takes about 2 minutes, or it can run in CI.

**Cost and risks.** S-M. The scripted players are checked only on a sample of dates. Build it outside the current merge window.

**Decide:** Verify, then restamp? yes / keep / BALANCE_VERSION

### 16. Telemetry (Y-10)

**Today.** Spec rule C-1 bans requests to other sites (SPEC.md:71). The resume save, which is your actions plus an end hash, is already only 537 bytes a day (app/game.js:1203-1214).

**Options.** 1: a Cloudflare Worker (a small server function) writing to a D1 database. It's free up to 100,000 records a day, can limit requests per IP without storing IPs, and can be queried in SQL. 2: Supabase, which pauses after a quiet week. 3: Apps Script into a Google Sheet, which drops records in a spike.

**Recommendation: 1.** Each record is 1-2 KB. It holds versions, seed, mode, your actions, where you finished or quit, the score and the time spent on each screen. It holds no IP, no browser details and no stored id. Instead it sends this browser's streak and number of dailies played. It is off when switched off in SETTINGS or when the browser asks not to be tracked, and a one-line notice says so. Only records that replay to their stated hash count, so faked scores drop out.

**Cost and risks.** M, and F-9 must come first. You create a Cloudflare account and deploy once. With no stored id, there are no per-person retention curves. A hobby project is probably exempt from the Privacy Act, but that isn't legal advice.

**Decide:** Cloudflare + D1, anonymous, with an opt-out? yes / Supabase / Apps Script / keep an id

### 17. Switch-over to the root page (F-14)

**Today.** The root already plays v4 through a redirect to next.html. COPY LINK still copies .../next.html (app/landing.js:67), classic.html has no banner, and SPEC.md line 6 is out of date. What blocks the launch is evidence, not code: W2 and gates 1 and 2 haven't run, and F-9 isn't built. F-9 matters on switch-over day because GitHub Pages caches files for 10 minutes, so a visitor could load a mix of old and new code.

**Options.** 1: move the game to index.html after this batch merges, keep next.html as a redirect, and add F-9 and the banner. 2: wait for launch day. 3: let the redirect count as done.

**Recommendation: 1.** Gate 2 then tests the exact URL that launches. **Your to-do, in order:** run W2 and gate 1; paste a share card into two apps; check the link on a real phone; time one read of the verdict; decide on `?selftest` (it could double as telemetry's replay check); merge w6-batch; run gate 2; post the launch.

**Cost and risks.** S-M. Moving the file causes merge conflicts in any open branch, so do it in a quiet window.

**Decide:** Move the game to the root after this batch? yes / launch day / never
