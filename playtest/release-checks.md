# GRIDWATCH release checks: the ones only you can do

The release checklist (SPEC §11, W6) has checks no test can do: they need real phones, real messaging apps and three
browsers. Together they take about 40 minutes. Do them **before gate 2** (a broken preview spoils every invitation),
again **before launch**, and after any change to the share card, the landing page, the preview picture (`og.png`) or the
pages' preview tags.

**You need:** your phone, and a phone of the other kind if you can borrow one (iPhone and Android); the computer with
Chrome, Edge and Firefox; two messaging apps you use (WhatsApp and Messages, say; Slack or Teams counts too).

**Record** each check in the table at the bottom, one copy of it per release, newest first. Screenshots show your chats:
keep them off the repo (it is public) and write only the file name.

## 0. Before you start

- **After a push, wait 10 minutes.** GitHub Pages serves cached files for 10 minutes (F-9), so a quick look can get a
  mix of old and new files. Ctrl+F5 reloads the page itself.
- **The site is up.** Open <https://databerryau.github.io/gridwatch/> on the computer. It should move to `next.html`
  and show the briefing, titled "Daily #N · …". From a terminal, if you like:
  - `curl -sI https://databerryau.github.io/gridwatch/` → `HTTP/2 200`
  - `curl -sI https://databerryau.github.io/gridwatch/og.png` → `HTTP/2 200` and `content-type: image/png`
- **The build** is on the end card's Seed line after a day: "Seed 20261016 · v4-core-2d.0 · …". Write it in the record.

## R-1. The share card in two messaging apps

*SPEC §11 W6: "the share card pasted into two messaging apps" (Y-4, Y-5).*

1. Finish a day on the computer. The day you play for a gate 2 invitation will do. A practice day's card says
   PRACTICE: that's fine here.
2. Press SHARE under YOUR CARD. It should read COPIED, with a note: "Copied: paste it anywhere."
3. Paste it into app 1 and send it to yourself (or someone who knows it's a test). The same in app 2.
4. Look at it on the phone.

**Pass:** the same lines as YOUR CARD (7 at most), each break where it was; the sparkline as bars of different heights;
★ as a star; the · dots; the closing line in quotes; the link on the last line, tappable. The rows' words may not
line up in the app's font: fine. SMS may send a long card in parts that the phone joins back: fine.

**Fail:** empty boxes, ? or emoji in place of the bars or the star; lines run together or cut off; the link not
tappable.

## R-2. The link previews

*SPEC §11 W6: "the link unfurls" (Y-8: `og:` tags, the image, a favicon).*

1. In the R-1 messages, look at the link's preview: the picture (GRIDWATCH over a frequency line that falls and is
   caught), the title "GRIDWATCH: the daily power-grid puzzle", and the description "Keep a city's lights on for one
   day: start power stations before the city needs them, and catch the trips. …". Some apps show only the picture and
   title: fine.
2. Check the second address too: the one the landing page copies, `https://databerryau.github.io/gridwatch/next.html`
   (send it alone). Both pages carry the preview.
3. On the computer, the browser tab shows a small icon: a yellow lightning bolt on a dark square.

**If there is no preview:** send `https://databerryau.github.io/gridwatch/` alone in the same app.
- That one previews and the card's doesn't: the app doesn't preview a link with no `https://` inside a message. Write it
  down. The fix would be on the card's last line (Y-4): 8 more characters.
- Neither previews: the app may not do previews at all (some SMS), or the tags or picture are wrong. Try another app;
  if no app previews, it's ours.
- An old preview: apps remember previews for a while, up to a day. Add `?v=2` to the address to see the new one.

## R-3. A phone gets the landing page

*SPEC §11 W6: "a phone gets the landing page"; Y-8: "COPY LINK works in mobile Safari and Chrome".*

1. On the phone, tap the link in the R-1 message. Many apps open links in their own browser first: check the page
   there, then in Safari (iPhone) or Chrome (Android), from the app's "open in browser".
2. Look for: the GRIDWATCH heading; "Keep a city's lights on for one day…"; the picture; "GRIDWATCH is played on a
   computer: a keyboard, a mouse and a screen at least 1280 by 600. Send yourself the link:"; a COPY LINK button.
   There is no PLAY ANYWAY on a phone (it is only for a small window with a mouse), and the desk never appears.
3. Nothing scrolls sideways, and the text reads without zooming. Turn the phone sideways: still the landing page.
4. Press COPY LINK. It reads COPIED, and the line under it says "Copied: paste it into a message to yourself." Paste
   it into a note: the whole address, ending `next.html`. Send it to yourself and open it on the computer: the game.

**Pass:** steps 2–4 in Safari on an iPhone and Chrome on an Android phone.

**An app's own browser** may block copying: the line then says "Copy was blocked: the link is …" and shows the
address. Not a fail (Y-8 names Safari and Chrome), but it is how strangers meet the page: write down which app.

**Also, on the computer** (optional): make the browser window small (under 1280 wide or 600 high). The landing page
shows, with PLAY ANYWAY, which opens the game. `?play` on the end of the address skips the landing page.

## R-4. `?selftest` passes in Chrome, Edge and Firefox

*SPEC §11 W6; SPEC §9.3 risk 6: browsers may do arithmetic slightly differently, and then a daily would not be the same
day for everyone.*

The `?selftest` page was being built while this list was written, so what you see may differ in its words. What it
does: it plays a few recorded days through the game's sim in this browser and checks each ends in exactly the same
state as when it was recorded. The state is compared by its **hash**, a fingerprint of every number in the grid,
written like `0x1a2b3c4d`.

1. On the computer, in each browser, open <https://databerryau.github.io/gridwatch/next.html?selftest>. Keep the tab
   in front while it runs (a background tab runs slowly). If the landing page shows instead, make the window bigger.
2. Wait until it says it is finished.

**Pass:** every recorded day reads PASS (or a tick), with the hash it expected and the hash it got the same, and a
total like "all passed".

**Fail:** a day reads FAIL, with two different hashes. This browser works the sim out differently, so its players
would not get the same day as everyone else. Don't launch: send Claude the browser, its version and the FAIL lines.

**Not a browser fault:** if it says the recordings belong to another build, they are stale. Ask Claude to record them
again.

**Write down** for each: the browser and its version (Chrome: ⋮ → Help → About Google Chrome; Edge: … → Help and
feedback → About Microsoft Edge; Firefox: ☰ → Help → About Firefox), the summary line as it reads, and how long it took.

**Also** (optional, when you play a whole day in Edge or Firefox): open THE NUMBERS on the end card. A line "This
browser worked par out … from the stored par" means this browser's arithmetic differs from the one par was stored
with (F-8). The score is safe, because it uses the stored par, but write the line down: it is the same fault
`?selftest` looks for.

## R-5. A year of dailies

*SPEC §11 W6: `dailies.js` covers ≥365 days (F-8). Not a manual check, but it belongs on the same list.*

Every GitHub Action run prints "N days of dailies left after …"; so does `node tools/calendar-left.mjs` in the repo.
At release it should be 365 or more. On 2026-10-16 it was **360** (the calendar ends 2027-10-11), so before launch the
calendar needs extending: ask Claude (it runs `tools/daily-gen.js` with more days from 2026-10-12, then
`tools/ladder.mjs`, about 25 minutes of machine time).

## The record

Copy this table for each release, newest first. Result: PASS, FAIL or SKIP (and why).

**Build** (end card's Seed line): ____________  **Date:** __________  **By:** __________

| Check | Device, and app or browser (version) | Result | Evidence (file name) | Notes |
|---|---|---|---|---|
| 0 Site up; `og.png` served | | | | |
| R-1 Card, app 1: ________ | | | | |
| R-1 Card, app 2: ________ | | | | |
| R-2 Preview of the card's link, app 1 | | | | |
| R-2 Preview of the card's link, app 2 | | | | |
| R-2 Preview of the `next.html` link | | | | |
| R-2 Icon in the browser tab | | | | |
| R-3 Landing page, iPhone Safari | | | | |
| R-3 Landing page, Android Chrome | | | | |
| R-3 Landing page in an app's own browser: ________ | | | | |
| R-3 COPY LINK, iPhone Safari | | | | |
| R-3 COPY LINK, Android Chrome | | | | |
| R-4 `?selftest`, Chrome | | | | |
| R-4 `?selftest`, Edge | | | | |
| R-4 `?selftest`, Firefox | | | | |
| R-5 Days of dailies left | | | | |

**All PASS?** Tell Claude, who ticks the W6 line of SPEC §11 and adds the record to the W6 list. Any FAIL: the row's
notes and the screenshot's file name are what Claude needs to fix it.
