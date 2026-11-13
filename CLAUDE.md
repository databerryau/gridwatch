# GRIDWATCH: how to test here

The owner wants the loop between a change and its check to be quick (2026-10-07, SPEC Q-40).
These rules are for every agent working in this repo.

## The spec and the current focus

- **`SPEC.md` is the live spec**: what the game is, what it should become and the plan in build
  order (§5). `SPEC-history.md` is frozen history. Read SPEC before changing behaviour.
- **Its rule for decisions (Q-104):** a decision is written into the rule it changes, in the same
  commit, and gets one row in §9.1 (the next Q- number; IDs are never reused). Built behaviour is
  described as built in its step's record in §5; a decided change not built yet says *decided,
  builds in Wn*.
- **Current focus (2026-11-13, SPEC Q-131):** the gate 1 playtest (W5, `playtest/gate1-README.md`)
  comes first. No new content (dailies, seasons, scenarios, map looks) until its results are in
  `playtest/gate1-results.md`. Fixes to what is built still ship.

## The loop

- **While fixing, run only the tests your change can affect.** `npm run test:changed` finds them
  from the import graph (`--list` prints them; name files to check other changes). Or name the
  files: `node --test tests/desk.test.js`.
- **Run the whole suite (`node --test`) once, before a merge.** CI runs it on every push.
- **There is no slow tier.** Statistics over many seeds or whole days are tools, not tests:
  `tools/par.js`, `tools/follow.mjs`, `tools/baseline-v4.js`. Run one only when the change is
  about balance or par, once, and say in the report what it measured. Never run one inside a
  fix loop, and never in every parallel agent.
- **No mutation sweeps.** To show that a test can fail, break the code once, by hand, and put it back.
- **Test budget:** a test file takes 6 s or less when run alone, and a test 2.5 s or less. A
  test that checks moments (an input, a trip, the card) jumps the sim between them. It does not
  step frames.

## Playing the game headless

One frame through the real page costs about 3 ms. A day stepped frame by frame is minutes; the
sim alone runs a whole day in about 2 s. The game asks for few actions: about 16–25 decisions a
day (SPEC D-10), at most one per 3 real seconds. So **sample, don't stream**: jump the sim
between moments and render one frame before a press, one during it and one after.

- `tests/lib/play.js` is the driver: `openGame({seed})`, `to('HH:MM')` and `until('trip')` jump
  headless and stop at the tick an event begins, `press(id)` / `pressKey(k)` return the looks
  before, on the press frame and 0.5 real s after, `real(s)` plays real seconds (the watch),
  `look()` / `lookDiff()` / `buttons()` say what the player sees, `timeline()` covers a span.
- `node tools/play.mjs --help` is the same from the command line, e.g.
  `node tools/play.mjs 20261007 to=06:00 press=guard-start-gta1 until=trip real=5 diff`.
- Don't write ad-hoc frame loops. If the driver can't express something, extend the driver.

## The browser

- The browser is for a final visual check of a slice, by one agent (the integrator), in one
  pane. The owner's PC runs out of memory with more.
- Parallel agents never open a browser or start a server. They check headless (`tests/lib/dom.js`,
  `tests/lib/play.js`).
- Stop preview servers and any `setInterval` frame drivers when done.

## Releasing

- **Pushing `main` deploys live** (GitHub Pages). `main` is protected (SPEC Q-135): work on a branch and open a PR;
  it merges only when the `test` and `verify` checks have passed on it, up to date with `main`. Let the owner merge
  unless they said otherwise. A PR that changes what the page ships (`app/ sim/ desk/ render/ content/ audio/`, the
  HTML, `version.json`) must bump BUILD, or the test job fails it.
- **At a release, bump BUILD** (the date; `.2` for a second that day) in `app/build.js`,
  `version.json` and the eight carriers listed in `app/boot.js` CARRIED (`sim/params.js`,
  `sim/step.js`, `app/score.js`, `app/history.js`, `app/director.js`, `desk/desk.js`,
  `render/livestack.js`, `content/closing.js`). `tests/version.test.js` names any missed.
- **After a `SIM_VERSION` change, run `npm run verify`** (about 10-12 min, in the background). It
  restamps the dailies, the ladder, the anniversaries and the selftest when nothing graded moved,
  and otherwise prints the full regeneration to run (SPEC §11). A stale stamp cannot merge.
- After the deploy, check the live site: `playtest/release-checks.md`.

## Worktrees and workflows

- **The integrator cleans up after a workflow run:** `git worktree remove` each finished
  `.claude/worktrees/wf_*` worktree, `git worktree prune`, and `git branch -d` the branches
  that were merged. The repo lives on OneDrive; every stray worktree is thousands of synced files.
- **Never SendMessage a workflow agent.** A send starts a second copy in the same worktree. Put
  guidance in the prompt, or stop the run and relaunch it.
