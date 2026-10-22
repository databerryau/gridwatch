# GRIDWATCH playtest gate 1 (W5): the owner's protocol

Gate 1 checks the core loop on people who have never played: can a stranger take the desk, get through a day, and say
what their job was and why they got their grade? The protocol and the pass lines are SPEC.md §5 W5. Nobody but the
owner has played yet (SPEC §9.3 risk 1), so this is the first real test of everything built since.

## The kit

| File | What it is |
|---|---|
| `gate1-README.md` | This page: who, how, what never to say, and how each pass line is scored. |
| `gate1-tester-log.md` | One sheet per tester. Print it and fill it in by hand while you watch. |
| `gate1-results.md` | The totals against the pass lines, and what a pass or a fail decides. |
| `W2-tester-log.md` | The older greybox log. Not needed for gate 1. |

## Who

- **3–5 friends or family who have never played,** in any form, and who have not watched anyone play. Five if you can:
  the pass lines are written as "of 5".
- **At most one energy professional.** They read the desk differently.
- People who know each other test on different days, so one can't tell the other about the day.

## Before each session

1. **Book about 20 minutes** at their own computer (not a phone or tablet), sound on. Tell them nothing about the game.
2. **Use a fresh browser profile for them, or a browser they have never opened GRIDWATCH in.** The game remembers a
   finished day in the browser; a tester must get FIRST SHIFT and the coach (the briefing's title says FIRST SHIFT).
3. **Print a tester log** and have a stopwatch ready (a phone timer is fine).
4. **Rate yourself first** if you have not: your own stress and confusion, 1–5, on today's build, for pass line 7.
   Compare with your rating of v2 (`classic.html`, the old game).
5. **Record only with consent.** A screen recording helps when you fill in the log afterwards.

## The session

1. **Send only the link:** https://databerryau.github.io/gridwatch/
2. **Say once:** *"This is a game I'm making. Play today's day and say out loud what you're thinking."* Then stay
   silent. The only prompt allowed is *"keep talking"*.
3. **The help rule.** Help only after **60 s stuck**. Stuck means no useful action and no progress in what they say
   aloud. Time it. Give the smallest hint that gets them moving (*"what does the line above the desk say?"*), and log
   the clock, how long they were stuck and what you said. Pass line 4 counts anyone stuck over **30 s** without knowing
   what to do, so note every stretch over 30 s, helped or not.
4. **Let them finish to the end card** (the day ends at 04:00 on the game clock, about six minutes of play). If they
   stop early, note when and why.
5. **Don't explain the end card.** Let them read it. Note whether they find SHARE (pass lines don't need it; gate 2
   does).

## Never say

- What the game is "about", what any control does, or what a good score is.
- "Nearly", "good", "careful", or anything that rates what they are doing.
- That they can pause. The briefing tells them.

## After: the five questions

Ask in this order, straight after the end card. Write down their words, not your summary.

1. **What was your job?**
2. **When the power station tripped, what caught the fall?**
3. **Why did you get your grade?**
4. **Stress 1–5 and confusion 1–5.**
5. **Would you play tomorrow?**

## Scoring each pass line (SPEC §5 W5)

| # | Pass line | Scored from | Counts as a pass for that tester |
|---|---|---|---|
| 1 | ≥4/5 finish to the verdict | The session | The end card opened (the day reached 04:00, or the city went black) |
| 2 | ≥4/5 describe the job | Question 1 | In their own words: lining up enough power ahead of demand (starting stations before the city needs them), with the automatics handling the seconds. "Keep the lights on" alone is not enough; "start things before demand rises" is |
| 3 | ≥3/5 name two of inertia, battery and governors | Question 2 | Any two of: spinning machines / inertia; the battery (or its GUARD); the governors (stations raising output on their own). Everyday words count ("the spinning stuff", "the big battery", "the plants pushed harder") |
| 4 | Nobody stuck over 30 s without knowing what to do | The help log | No stretch over 30 s with no idea what to do next (a stretch spent reading counts as knowing) |
| 5 | ≥3/5 explain their grade in their own words | Question 3 | They say what drove it: cost against par, dark streets, or both. The end card's line under the score says it in money ("par ran the day for $312,000 less"); repeating it counts if they understood it |
| 6 | Median stress ≤3 and confusion ≤2 | Question 4 | Across all testers |
| 7 | The owner's stress and confusion lower than for v2 | Your own rating | Today's build against `classic.html` |

**Pass: all seven.** **Fail:** fix the top three issues across the logs, then re-run with at least two new testers
(SPEC W5).

## What else to note (it decides the next work, not the gate)

- **Dead time:** stretches with nothing to do. The coach-following script gets no ask between about 10:50 and 15:45 on
  the game clock on many days (SPEC §6 "Longest gap with no decision", left to this gate to judge). Note what they do
  through the middle of the day, and whether they say they are bored.
- **The letter:** does the letter feel fair? A cautious player can score a B on a PERFECT day (every light on, but
  dearer than par). Note what they say about it.
- **The share card:** do they notice YOUR CARD and SHARE? Would they send it?
- **Question 5's answer:** the most important number for the daily.
