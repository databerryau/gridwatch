# GRIDWATCH gate 2: results

Fill this in from the tester logs once every tester's day-2 check is in. T1–T5 only, never names: the repo is public.

**Build** (the end card's Seed line, e.g. `v4-core-2d.0`): ____________  **Sessions:** from ________ to ________
**Testers:** ___ (new: ___, returning: ___)  **Release checks done** (`release-checks.md`)**:** Y / N, on ________

## The six checks

Mark each tester ✓ or ✗. For check 4, write the app too (✓ WhatsApp), and "preview n/a" for an app that previews no
links, or none inside a message (the preview rule, `gate2-README.md`). For check 6, count the complaints.

| # | Check | Needed (5 / 4 / 3 testers) | T1 | T2 | T3 | T4 | T5 | Count | Pass? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Finished | 4 / 4 / 3 | | | | | | | |
| 2 | Shared unprompted | 3 / 3 / 2 | | | | | | | |
| 3 | Played the next day | 2 / 2 / 2 | | | | | | | |
| 4 | Card and link in their app | every tester | | | | | | | |
| 5 | Retold the moment | 3 / 3 / 2 | | | | | | | |
| 6 | Spoiler complaints | 0 | | | | | | | |

**Gate 2:** PASSED / FAILED on check(s) ________

## Also worth writing down

Not pass lines, but they measure open rows in SPEC §6 (D-2's session length) and show where the loop leaks.

| What | T1 | T2 | T3 | T4 | T5 | Median or count |
|---|---|---|---|---|---|---|
| New or returning; the briefing's title (FIRST SHIFT or OFFICIAL) | | | | | | |
| Opened the link on a phone first | | | | | | |
| Landing page on the computer (a small screen); FULL SCREEN or PLAY ANYWAY unprompted? | | | | | | |
| Message opened → game open on the computer (m:ss) | | | | | | |
| Game open → verdict (m:ss) | | | | | | |
| Game open → SHARE (m:ss; D-2: ≤6:50 under FIRST SHIFT, ≤6:00 under OFFICIAL, whatever the tester's history) | | | | | | |
| Help given (times) | | | | | | |
| Stuck over 30 s (times) | | | | | | |
| Stress 1–5 / confusion 1–5 | | | | | | |
| Shared another way (screenshot, told someone) | | | | | | |
| Pressed COUNT THIS ONE | | | | | | |
| Read THE WEEK AHEAD, or spoke about it | | | | | | |
| Started another day (MORE DAYS, PLAY THIS DAY AGAIN) | | | | | | |

## What a result decides

**All six pass:** tick "gate 2 passed" in SPEC §11 (W6) and go to the launch plan: one itch.io page that links to the
live site and one launch post (§11, "Launch").

**Any of 1, 2, 3, 5 or 6 fails:** fix the top three issues across the logs, then re-run with at least two new testers
(gate 1's rule; the spec gives gate 2 none). **Only 4 fails:** fix it and re-check that app with `release-checks.md`;
no new testers.

| Check that failed | What it points at | Where the fix probably is |
|---|---|---|
| 1 Finished | Strangers who come from a card, not from you, drop out. Where did each one stop: the phone, the briefing, a stuck stretch, the length? | The step where most stopped. A detour through the landing page, on a phone or a small laptop screen, is `app/landing.js` (Y-8). |
| 2 Shared | The card isn't pulling. Did they reach YOUR CARD (it comes after the verdict)? Screenshot instead? Say why not? | Screenshots: the picture card (Y-6, on the cut list) moves up. Not reached: SHARE earlier on the end card. Not wanted: what the card says. |
| 3 Next day | The reason to come back is weak. Did they read THE WEEK AHEAD, press COUNT THIS ONE (a streak starts), say anything about tomorrow? | The return hooks: where the week ahead sits, the streak line, anniversary dailies (D-29). A reminder would need a server, and C-1 allows none today. |
| 4 Card or link | A fault in that app. R-2's steps, one change at a time, say which: the preview tags or the picture, or the card's link with no https://. Or the phone page. | `index.html` and `next.html`'s preview tags, `og.png`; the card's last line (Y-4) only when the card with `https://` previewed and the card without it didn't; `app/landing.js` (Y-8). |
| 5 Retell | The day's story doesn't stick. Did they watch the trip? Read THE MOMENT? | THE MOMENT's place and words (D-21); the watch's captions (K-15). |
| 6 Spoiler | Something gave the day away. Which: your card, the preview, the landing page, the briefing, THE WEEK AHEAD? | That one thing. A card that spoiled: the card's lint (Y-4). |

**What else the logs answer** (SPEC §9.2): whether week mode or the rest of the city is worth building (item 11: did
anyone ask for more?), whether the days feel the same (item 13, seasons: did a next-day player say so?), and whether
returning players expect the evening trip (item 6).

## The SPEC record

When it's done, this line goes into SPEC.md's W6 list (Claude can write it in), and §6's Playtests row gets the numbers:

> - **Gate 2 (run [dates], build [stamp]).** [N] testers ([k] new): finished [a]/[N], shared unprompted [b]/[N],
>   played the next day [c]/[N], card and link fine in [apps], retold the moment [d]/[N], spoiler complaints [e].
>   [Passed / Failed on …]. Game open to SHARE: median [m:ss] on a first shift. Top three issues: [1], [2], [3].
