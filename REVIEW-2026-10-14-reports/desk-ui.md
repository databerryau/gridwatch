# GRIDWATCH review, lens: the desk, the map, the stack and legibility

Reader key `desk-ui`. Read-only, headless (tests/lib/dom.js stand-in, tools/play.mjs); no pixels were seen, so every claim about size or density is reasoned from desk.css / next.html and said so. Seed 20261014 (today's daily) unless stated.

## 0. Method

Files read in full: desk/desk.js, desk/levers.js, desk/rotary.js, desk/dial.js, desk/gauge.js, desk/bay.js, desk/emergency.js, desk/annunciator.js, desk/tray.js, desk/util.js, desk/desk.css, app/keys.js, app/tray.js, app/suburbcard.js, content/anchors.js; app/shell.js (bootGame, the header, drawObjective, drawFeeder, settings), render/map.js (labels, summary, createMap, pointer and keys), render/livestack.js (create, draw, hitTest, pointer, hover), app/system.js (the held-by-hand rule), app/objective.js (every `targets:`), next.html (layout CSS and the static controls), SPEC §4.1–§4.5, K-1..K-23, L-0..L-10, G-1..G-5, §9.1 Q-42..Q-60.

Play transcripts (all quoted below where used):

```
node tools/play.mjs 20261014 --no-run look
node tools/play.mjs 20261014 to=04:35 buttons look          (81 visible, enabled controls)
node tools/play.mjs 20261014 to=06:00 hover=guard-start-ccgt2 look press=guard-start-ccgt2 diff press=guard-start-ccgt2 diff
node tools/play.mjs 20261014 to=06:00 press=btn-mute diff press=btn-mute diff press=btn-silence diff press=key-agc diff press=btn-redispatch diff press=btn-ack diff
node tools/play.mjs 20261014 to=06:00 press=wheel-hydro diff press=dial-battery diff press=ring-guard diff press=knob-tie diff press=lever-gta diff press=lever-coal diff press=sync-close diff press=sync-auto diff press=btn-preview diff
node tools/play.mjs 20261014 --hand to=06:00 buttons look
node tools/play.mjs 20261014 --no-run press=guard-start-ccgt2 press=guard-start-ccgt2 diff real=2 diff
node tools/play.mjs 20261014 jump=12:00 key=Enter jump=12:00 key=Enter jump=12:00 until=trip look real=30 look until=card look key=Enter diff real=3 buttons
node tools/play.mjs 20261014 timeline=04:30-04:00/30m
```

One driver artefact, so it is not a finding: `press=lever-gta` / `press=lever-coal` print `TOAST RED Refused: mw must be a finite MW >= 0`. The driver's click dispatches `pointerdown` with no `clientY` (tests/lib/play.js:294–303, `opts.at || {}`), so `mwAt(undefined)` is NaN in desk/levers.js. A browser always supplies clientY. (It does show the sim's refusal text can reach a toast raw; a NaN guard in `dragTo` would cost one line.)

## 1. What is on the desk, and what the game ever asks for

At 04:35 `buttons` lists **81 visible, enabled controls** (count of the `buttons` lines). By panel:

| Panel | Controls at 04:35 | Count |
|---|---|---|
| Header | 5 × "?" badges, PAUSE, SOUND ON, SETTINGS, ? | 9 |
| Plan bar annunciator | 12 tiles, ◆ ACK, HORN OFF, EXPLAIN W | 15 |
| Column 1 (dial, BALANCE, N-1) | q-dial, q-imb, q-gauge, T PREVIEW | 4 |
| Lever bank | 5 lever tracks + 11 machines × (START, STOP) guards | 27 |
| Rotaries | HYDRO wheel + 3 machines × 2 guards, GUARD ring, battery dial, TIE knob | 10 |
| CONTROL keys | A AGC, ⟳ RE-DISPATCH | 2 |
| Live Stack | L | 1 (+ a drag canvas) |
| Procedure bay | SYNC, ✕2 RESTORE, `[ −`, `+ ]`, C CLOSE, U AUTO, ✕ | 7 |
| Tray | LOG, TO THE RESTORE BAY, TO THE TIE | 3 |
| Emergency | ▣ BREAK GLASS …, DR … ●●● | 2 |

Plus the map canvas (plants, suburbs) and the stack canvas (edges, ghosts, keys).

What the objective line, the one instruction the player is told to follow, ever points at (every `targets:` in app/objective.js, lines 363–1197): the START/STOP guards (`c.id`, `guard-stop-<unit>`), `ring-guard`, `dial-battery`, `bay-restore`, `btn-dr`, `key-rert`, `gauge-n1`, `suburb-<ID>`, and `btn-redispatch` (line 407, only to undo a hold). It **never** names `lever-*`, `wheel-hydro`, `knob-tie`, `bay-sync` or any scope button, `key-agc`, `key-shed` or `stack` (`grep -n "'stack'\|bay-sync\|key-shed\|knob-tie\|wheel-hydro\|lever-" app/objective.js` returns nothing). Par (sim/autopilot.js) does send `tie` (lines 1029, 1067) and `battery`/`guard`, but par's tie moves are part of its own re-plan, which the player gets for free through `RE-DISPATCH`/the system's planLoad (app/system.js:57–63).

So of the 81 controls, the ones a decision needs on an AGC day are: 22 + 6 START/STOP guards (really "the next unit to start"), the GUARD ring, the battery dial, DR, BREAK GLASS, the RESTORE bay, the suburb card, EXPLAIN/ACK, PAUSE. The five lever tracks, the hydro wheel, the tie knob, the SYNC scope and its five buttons, A AGC and RE-DISPATCH are never asked for.

## 2. Findings

### F1. A single click on the TIE knob (or the battery dial) jumps its setting and holds every lever by hand (defect, high)

**What happens.** `makeRotary` (desk/rotary.js:43–52) sets the value on `pointerdown` from the pointer's angle: `drag.v = apply(o.angleValue(a), true)` (line 50), and on release commits it if it differs from where it was (line 72, `if (Math.round(v) !== Math.round(v0)) commit(v)`). The TIE knob and the battery dial have `angleValue` (absolute: a click at 12 o'clock is the middle of the sweep, calc.js `knobValue`); the hydro wheel does not (relative), so a click on the wheel does nothing. A tie input is in `HAND_EDITS` (app/system.js:14: `basePoint, tie, planKey, planDel, planRejoin`), so the one click puts the whole dispatch in HELD BY HAND and the objective line goes red.

**Transcript** (`node tools/play.mjs 20261014 to=06:00 … press=knob-tie diff`), the tie was at IMP 278:

```
> press=knob-tie
DURING (changed on the press frame)
LINE ‼ URGENT With levers held by hand the plan is 530 MW below demand now. RE-DISPATCH (N) hands every lever back to the plan.
N-1 ! TIGHT SPARE IN 5 MIN ✓1084 RISK: COAL 1 621 ! 49.28 Hz @ GUARD 250 …
NOTE blue dk-keys: held by hand: RE-DISPATCH (N) hands the levers back
AFTER 0.5 real s
N-1 ! TIGHT SPARE IN 5 MIN ✓1178 RISK: COAL 1 625 ✕ 48.93 Hz @ GUARD 250 UFLS 272 …
```

In the stand-in the click lands at the knob's centre (angle 0 → 0 MW); in a browser it lands wherever the hand clicks, so the jump is to an arbitrary MW. The same press on `ring-guard` committed `GUARD 250` (the transcript's `@ GUARD 250`): a click on the ring arms 250 MW of guard. For the ring that is nearly a feature; for the tie it is a trap, because a stranger clicks things to find out what they are, and this click turns the line red and the preview to 48.93 Hz, with the only way out a key (N) that was not on the desk a second ago as anything but "⟳ RE-DISPATCH".

**Fix (S, a day):** absolute rotaries move only by drag: on `pointerdown` remember the angle but keep `drag.v = cur()`; apply `angleValue` only on `pointermove` after the pointer has moved (the lever bank already needs 12 px to cross its gate, K-1). A click then focuses the knob and answers in blue ("TIE IMP 278: drag around the knob, or 8 then ↑↓"), as Q-42 wants. Real NEM: no operator sets an interconnector by hand; NEMDE schedules it. A knob that cannot be knocked is the more honest instrument.

### F2. HELD BY HAND is global and contradicts L-6: one touch takes the whole desk off the plan (design-weakness, high)

**Decision challenged:** Q-18 / desk/README §21.4 "player mode" (built 2a): any `basePoint`, `tie`, `planKey`, `planDel` or `planRejoin` sets `sys.edited` (app/system.js:14, 66–75), after which the system sends no more plan loads (line 57) and every lever, the wheel and the tie stop following the plan until RE-DISPATCH (desk/emergency.js:176 says exactly this). SPEC L-6 (line 1269) still says the opposite: "AGC mode: moving a lever writes that unit's next arrive-by keyframe … Later keyframes stay. There is no MANUAL state and nothing to resume."

**Why it hurts a stranger.** The lever bank is the biggest thing on the desk (424 px wide, column 2). Its natural gesture, pulling a lever, is the one that silently removes the autopilot from the other four levers and the tie. The line then reads "‼ URGENT With levers held by hand the plan is 530 MW below demand now. RE-DISPATCH (N) hands every lever back" (app/objective.js:407). The only fix the line offers is to undo what you did. That is a trap, not a decision, and it is why RE-DISPATCH exists at all.

**Options:**
1. Per-station hold (M): touching COAL takes COAL off the plan (an amber M lamp, as HAND mode already does per station, desk/levers.js:429); the other stations keep following. RE-DISPATCH shrinks to "put this station back" (P, already a key). Real NEM: each generator rebids on its own; dispatch continues for the rest.
2. L-6 as written (M): a lever move in AGC writes one keyframe and the plan carries on from it. No hold, no RE-DISPATCH key.
3. Keep the global hold but make the levers read-only in AGC (see F3), so nothing but HAND mode can trigger it.

Recommendation: 3 now (it falls out of F3), 1 if HAND-flying players want the levers live per station.

### F3. The simplest desk that keeps the fantasy: 81 controls, 9 kinds ever asked for (design-weakness, high)

**Evidence:** §1 above. desk/desk.js LAYOUT (lines 30–34) gives column 2 (the levers and the rotaries) 424 of 1,280 px and 292 of 300 px of height; the five lever tracks (desk.css `.dk-track` 28 px wide, `cursor: ns-resize`) and the hydro wheel are never named by the line, and under AGC their only effect is F2's hold. The SYNC scope (bay.js:34–48, five buttons and a canvas) shows at 04:30 with no unit ready; each of its buttons answers "no unit at full speed: START one on the lever bank" (`press=sync-close` transcript, bay.js:144). `A AGC` is a display locked for the day (press answers "AGC/HAND is set at the briefing: locked for the day", emergency.js). 

**Proposal (M, a slice; nothing in the sim changes):**
- **Lever bank → unit lamps.** Keep the five station slots and every START/STOP guard (they are the game). Make the track a readout under AGC: the plan's handle glides (K-20 servo is kept), the orange needle follows, nothing drags. In HAND mode (chosen at the briefing) the tracks are live as today. Real NEM: operators commit units; NEMDE sets MW.
- **HYDRO wheel and TIE knob → readouts.** "WATER LASTS 20:40" and "TIE IMP 500 ≤500 until 11:15" stay (the water and the limit are decisions' inputs); the knob and the wheel do not turn under AGC.
- **RE-DISPATCH goes** (nothing holds any more); **A AGC goes** (the header already has `#chip-hand` for HAND days; AGC is the default and needs no key).
- **Procedure bay: RESTORE by default; the scope only when a unit is READY or offered** (bay.js:347 already picks RESTORE when districts are dark and nothing is ready; extend it to hide the scope's six controls until `obs.units.some(u => u.mode === 'ready')`). Q-4 says the scope is "offered when it matters"; showing it always says the opposite.
- **What stays:** 28 guards, GUARD ring + battery dial, DR, BREAK GLASS (DIRECT SHED already appears only when SHORT), RESTORE, the suburb card, the dial / BALANCE / N-1 readouts, the annunciator, the tray, the stack (see F7). About 45 controls instead of 81, and every one of them is something the line can say "press this" about.
- **Realism note:** this is more NEM-like, not less (self-commitment plus central dispatch). The owner's K-1 accept ("≥50% of dispatch inputs on desk controls") still holds: guards, ring, dial and keys are desk controls.

### F4. Faces that name the state, a glyph or the wrong key; the three to fix first (design-weakness, high)

Every item is on the owner's list or found the same way (`buttons` at 04:35, 07:00, 12:30, and `--hand`):

| Face as shown | Where | Problem |
|---|---|---|
| `○2` / `●1` / `◔` / `◑` on START; `■` / `·` / `↺` on STOP | desk/levers.js:143–144, util.js MODE_GLYPH | The verb START appears only after the first press (`START?`). A stranger's first required press (the line says "Start CCGT 2 now") is a button reading `○2`. The 2026-10-06 playtest ("START doesn't work") was this button. |
| `A AGC` / `H HAND` | desk/emergency.js:164 | On this desk a leading letter is a key cap (`T PREVIEW`, `C CLOSE`, `U AUTO`, `EXPLAIN W`). **A is ACK** (annunciator.js:39, keys.js:72). The AGC key's "A" is a glyph, and it points at the wrong key. |
| `SOUND ON` → press → `SOUND OFF` | shell.js:785 | Names the state; a toggle whose label is its state reads as the action half the time. |
| `HORN OFF`, `ACK` | annunciator.js | Always lit and pressable; with nothing sounding they answer "Nothing sounding: HORN OFF stops the horn…" (transcript `press=btn-silence`). The owner's "SIL" became HORN OFF (Q-45) but the state problem stayed. |
| `[ −` `+ ]` `C CLOSE` `U AUTO` `✕` | bay.js:46–52 | Five controls for a procedure that does not exist yet (no READY unit) on every first-shift desk at 04:30. |
| `P` / `M` (HAND days) | levers.js:429 | A one-letter lamp; its aria-label is a sentence, its face is a letter. |
| GUARD ring | rotary.js | The ring has no word on it; the `○ GUARD 0` lamp is in the title row, 68 px away from a ring that looks like the dial's bezel. The line points at `ring-guard` six times a day (objective.js:771, 880, 912, 928, 961). |
| `! 49.19 Hz · U 49.19 L 49.19` | gauge.js:134 | "U" and "L" (unit nadir, link nadir) leak onto the face; K-10 says the letters sit behind "?". |
| `241 MW ×1.5` | bay.js:316 | The cold-load factor as a bare multiplier on the row a stranger must press at 06:55. |
| `96%` | levers.js gate label | The only text on a lever track is the gate's percentage, so `buttons` reports a lever as `lever-coal "96%"`. |

**The three to fix first (each S):**
1. **START/STOP guards:** face `START 2` / `ON 2` / `STOP` (word + machine number; the glyph can stay as a prefix). It is the first thing every stranger must press, and the owner has already misread it once.
2. **The state-naming toggles:** `SOUND ON` → `MUTE` with an `aria-pressed` lamp (`♪` lit/unlit); `HORN OFF` and `ACK` greyed (opacity 0.45, as `aria-disabled` already styles) until a horn sounds or a tile flashes; `A AGC` → a lamp `AGC ON` with no letter (or remove it, F3).
3. **The GUARD ring:** print `GUARD` on the ring itself at its pointer and `0 · 250 · 500` at its detents (CSS text on the `.dk-ring`, 68 px is enough at --dk-k 1), so the control the line names most is the one a hand can find.

### F5. The clock held after TAKE THE DESK, and the Space hint vanishes at the moment it is needed (question, medium)

**Evidence.** `--no-run look`: `CLOCK 04:30:00 | PAUSE 0×`, line suffix "Clock held: press Space to run (you can act while paused)". Then `press=guard-start-ccgt2` twice: the line becomes `✓ UNDER WAY CCGT 2 is starting: full speed at 05:05…` with **no** Space hint, and `real=2` prints `04:30:00 PAUSE`: the clock stays held after the first commit. The hint is dropped because drawObjective's consider branch (app/shell.js:584–585) never appends the paused suffix; it returns only when the pointer leaves the guard or the 6-s CONSIDER_HOLD_MS passes (desk.js:34). The rate badge reads `PAUSE 0×` and the button `PLAY`, which is the state, not an instruction.

**Decision challenged:** Q-18's "the first decision is made before anything moves" (app/game.js:162). At 540× a real second is 9 grid minutes, so the hold protects a reader; but a stranger who did what the line said and sees nothing move reads the game as broken (the 2026-10-01 verdict in reverse).

**Options:**
1. **The first accepted desk input releases the clock** (S): `takeDesk` holds; the first `start`/`guard`/`battery`/`restore` input runs it, with a 3-s blue toast "Clock running: Space pauses". Recommended.
2. Keep the hold, but the consider branch keeps the suffix (S, one line) and the PAUSE button reads `▶ RUN` while held before the first Space.
3. No hold: TAKE THE DESK runs the clock at a slow first segment (PRE-DAWN 60× for 20 real s, then 540×) so reading costs 20 grid-minutes, not two hours. Costs a D-2 profile change (M) and shifts E.

### F6. The map: what a player learns and clicks (design-weakness, medium)

**What it does today (render/map.js):** ≤3 labels at rest (`MAX_REST_LABELS`, mapLabels: pin, hover, alarms, then held dark districts "HARBOURSIDE: 2 DARK · BACK 06:55, 07:15"); hover rings a plant and lights its lever (G-2); a click on a plant focuses its lever/wheel/dial/knob (`press()` → `actions.ui({do:'focus', target: p.target})`, mapdata.js:52–76), a suburb opens its card, wind/solar pin "the sun sets it, not the desk". Weather, sun, glint, smoke, dark blocks are the consequence layer (G-3–G-5).

**At the floor** the map is 268 px (K-17) minus the 58-px plan bar fixed over its bottom edge (next.html `--planbar-h: 58px`, `#planbar { position: fixed; bottom: var(--desk-h) }`), so about 210 px of city is visible at 1280×600; not seen here, reasoned from the CSS.

**What is missing for a stranger:** at rest the map carries no number. A plant's hover label is its name (`p.label`); its MW and its machines' states are only on the lever bank. The two dark districts at 04:30 are drawn dark (G-5) but their label appears only as the 3rd-priority info label. Clicking a plant lands you on a lever you are not supposed to move (F2/F3).

**Proposal (S–M):** make the map the fleet overview the lever bank tries to be: each plant's rest label shows its machine lamps and MW (`MT HAZEL COAL ●●●○ 2,120 MW`), each suburb its draw; a click on a plant focuses its first START/STOP guard (the control the line names), not the lever track. Then the top half tells a stranger "four coal machines on, one off; the harbour is half dark" without a legend, and G-2's accept ("a first-time viewer names every asset type") has a chance. Real NEM: control-room wall boards show exactly this (unit status and MW on a one-line diagram).

### F7. The Live Stack is a chart with a hidden drag surface (design-weakness, medium)

**Evidence.** render/livestack.js hitTest (753–808) and pointerdown (868–888) still drag edges, keys, ghosts and starts (Q-57 removed only the flex blocks' drag). At the floor (336×164, desk.js LAYOUT) L-4 itself says a column is 5.6 px and a pixel ~55 MW, "too coarse to drag precisely"; the stack's own click answers are instructions to drag ("Plan ahead of now: drag a top edge or a ghost", line 874). Under F2 a `planKey` drag holds every lever. The objective line never sends anyone to the stack; the tray does ("SEE THE STACK", "TO THE STACK", app/tray.js). So for the stranger the stack is a chart they are told to look at and a drag surface nobody asks them to use, which at 55 MW/px punishes a try.

**Decision challenged:** L-4 (drag to schedule) at the floor size.

**Options:** (a) drag only when expanded (L): the floor stack is hover-and-read, its click says "L expands it to plan" (S); (b) no drag at all, the stack is the plan view of the guards and the battery (S, and L-4's keyboard route goes too); (c) keep as is. Recommend (a) now, (b) if F3's read-only levers land (then the stack's only drag would be START booking, which the guards already do).

### F8. The feeder card hold (Q-91) is the one moment the desk is legible; make the bay match it (opportunity, medium)

**Evidence.** At 06:55 (`to=07:00 look`): `CLOCK 06:55:00 | HELD 0× · R restore · Esc on`, `FEEDER HAR4's feeder in Harbourside is repaired: about 240 MW with its cold load. R or Enter: restore it now · Esc: go on …`, and the bay shows `▸ HAR4 · REPAIRED 241 MW ×1.5 ✓ CLOSE`. After Enter the timeline shows the physics the player was promised: `BALANCE SHORT 170 MW held up by battery 140 · governors 30`, `DIAL ! 49.767 Hz CHANGE falling`, `BAND LOW 5 MIN` at 06:55:02, then back to `49.992 Hz` by 07:00. This is the best thirty seconds of the first shift: a card that says what, a key, and a dial that moves because of you.

**Proposal (S):** the RESTORE row reads what the card reads: `HAR4 · REPAIRED · 240 MW (cold load ×1.5) · ✓ CLOSE`; the permissive head says `P ✓ RESTORE PERMISSIVE` only when a row is closable (it does), and `CLOSE` becomes `CLOSE HAR4`. And give the START guards the same treatment the feeder card gives a feeder: when the line says "Start CCGT 2 now", the guard's face could read `START 2 ▶` with the line's glow (L-9 glow exists; the face does not change).

### F9. "? IF PRESSED" is the desk's best idea; it covers only the guards (opportunity, medium)

**Evidence.** `hover=guard-start-ccgt2 look` printed `LINE ? IF PRESSED START CCGT 2: at minimum load (175 MW) by 06:49, 49 min from now, and it must then run 4 h. It is too late for 06:25, but it helps from 06:49.` (C-10, desk.js makeConsider, shell.js drawObjective). Nothing else on the desk says what it would do before you do it: hovering the GUARD ring, DR, BREAK GLASS, a RESTORE row or the battery dial changes nothing in the line (the ring re-runs the preview only while turning, rotary.js `turning`).

**Proposal (S–M):** extend `vm.consider` to `ring-guard` ("GUARD 250 MW: the next trip would bottom at 49.34 Hz, the dial loses 250 MW of range"), `btn-dr` ("cuts 350 MW for 60 min, 3 calls left, $1,400/MWh"), `key-rert`, `restore-<ID>` (the preview the bay already computes, bay.js previewOf) and `dial-battery`. The text exists in each control's `title`/`aria-label`; the line is where the owner's eyes are (Q-45).

### F10. SPEC text the desk no longer matches (spec-stale, low)

| SPEC | Says | Built |
|---|---|---|
| §4.2 lines 307–309 | `ANNUNCIATOR 4x3` in desk column 4, `[ACK] [SILENCE]`, `MESSAGE TRAY 256x108` | Annunciator is 6×2 in the plan bar's 432×58 slot (Q-45, desk.css `.dk-annun`); column 4 is the tray (212 px) over the emergency row (80 px), desk.js LAYOUT |
| §4.3 line 338, K-8 lines 992–1001, K-15 line 1071 | "ACK and SILENCE", "twelve in a 4 × 3 panel" | HORN OFF (Q-45), 6 × 2 |
| K-9 line 1011, K-16 line 1104, §7 line 2148 | "Cards never pause play", "the respond card is the only hold on the clock" | The feeder card holds (Q-91) and EXPLAIN holds (Q-46) |
| K-23 table lines 1186–1198 | Keys 1–8, S S/X X, P, [ ] C U, R, A, D/E, T M L Tab, H, Space/Esc/F | The desk also claims G (ring), V (AGC key), K (DIRECT SHED), N (RE-DISPATCH), O (scope), B (bypass), W (EXPLAIN), `,` (settings), `?` (drawer): desk.js:19 `DESK_KEYS`, keys.js |
| L-6 line 1269 | "AGC mode: … There is no MANUAL state and nothing to resume" | HELD BY HAND + RE-DISPATCH (F2) |
| §4.1 line 283 | "Marg hands over the GT levers … you push GT·A's lever to 300 MW" | A lever push in player mode holds the desk (F2); the §4.1 script was never re-run against 2a–2c |

Q-61..Q-91 are not in §9.1 (known).

### F11. Readouts at CRUISE: mostly readable, two quibbles (design-weakness, low)

The dial's figure and CHANGE/SPIN refresh at most every 0.5 s outside an event (dial.js TEXT_MS), the BALANCE word changes at once and its figures every 0.5 s, the trend is one column per grid minute (30 columns = 15 real s at CRUISE): all reasonable at 150–540×. Two things do not read: (a) `CHANGE steady / falling / rising` next to `SPIN 18.1 GW·s` are the two least actionable numbers on the desk and take the dial's whole sub-line, while the one number a stranger needs, "how far from 50", is the big figure's colour; (b) the N-1 face `SPARE IN 5 MIN ✓1339 RISK: COAL 1 530 ! 49.30 Hz · U 49.30 L 49.30` carries five numbers and three glyphs in 232 px (desk.css `.dk-gbar` 88-px label column). Proposal (S): the sub-line reads `0.02 Hz low · steady` and SPIN moves behind "?"; the gauge's preview line reads `IF COAL 1 TRIPS: 49.30 Hz !` and drops `U`/`L`.

## 3. The desk I would ship for a stranger (summary of F1–F9)

Top half: the map with numbers on it (F6). Plan bar: the line with "? IF PRESSED" for every control it can name (F9), the alarms. Desk: column 1 unchanged but with plainer sub-lines (F11); column 2 the five station slots as lamps with word-faced START/STOP guards, the water and the tie as readouts, the battery dial with a labelled GUARD ring (F4); column 3 the stack as a chart that expands to plan (F7) over a bay that shows RESTORE, and the scope only when a unit is ready (F3); column 4 the tray and the two emergency keys. No RE-DISPATCH, no A AGC, no lever drags under AGC, and a knob that cannot be knocked (F1). HAND mode keeps today's live levers for the player who asked for them at the briefing. Cost: F1, F4, F5(2), F8, F11 are days; F3, F6, F7, F9 together are a slice; F2 depends on F3.
