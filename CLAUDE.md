# GRIDWATCH: how to test here

The owner wants the loop between a change and its check to be quick (2026-10-07, SPEC Q-40).
These rules are for every agent working in this repo.

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
