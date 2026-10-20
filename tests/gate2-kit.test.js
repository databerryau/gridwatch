// W6, gate 2: the playtest kit (playtest/gate2-*.md) and the release checks (playtest/release-checks.md) are prose the
// owner follows by hand, so nothing else would catch them drifting from the game or from each other. They quote the
// game's own words; the booking covers the session they plan; one preview rule serves gate 2's check 4 and R-2; R-2's
// no-preview steps change one thing at a time; a window that grows from the landing page starts the game by itself, and one
// that shrinks reloads (app/landing.js listens only while it is up); and they plan for what the game does to a returning
// tester and to a small laptop screen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {makeDocument} from './lib/dom.js';
import {needsLanding, NEEDS, shortOf} from '../app/landing.js';
import {start} from '../app/start.js';
import {SHARE_URL} from '../app/share.js';
import {firstShift, coachOn} from '../app/game.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const README = read('playtest/gate2-README.md'), LOG = read('playtest/gate2-tester-log.md');
const INVITE = read('playtest/gate2-invite.md'), RESULTS = read('playtest/gate2-results.md');
const RC = read('playtest/release-checks.md');
const KIT = {README, LOG, INVITE, RESULTS, RC};
const flat = s => s.replace(/\s+/g, ' ').trim();

// A markdown file's items: a paragraph, a list item or a table row, each with its continuation lines.
function items(md) {
  const out = [];
  let open = false;
  for (const line of md.split('\n')) {
    if (!line.trim()) { open = false; continue; }
    if (open && !/^\s*(?:[-*] |\d+\. |\|)/.test(line)) out[out.length - 1] += ' ' + line.trim();
    else out.push(line.trim());
    open = true;
  }
  return out;
}
// The table that follows `marker`, as rows of cells (the header and its rule left out).
function tableAfter(md, marker) {
  const at = md.indexOf(marker);
  assert.ok(at >= 0, 'no "' + marker + '"');
  const lines = md.slice(at).split('\n'), first = lines.findIndex(l => l.startsWith('|'));
  const rows = [];
  for (let i = first; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim()));
  return rows.slice(2);
}

test('Gate 2 kit: the words it quotes are the game\'s (the preview, the landing page, COPIED, the card\'s link)', () => {
  const tag = (page, p) => read(page).match(new RegExp('<meta property="' + p + '" content="([^"]*)"'))[1];
  const title = tag('index.html', 'og:title'), desc = tag('index.html', 'og:description');
  assert.equal(tag('index.html', 'og:title'), title);
  assert.equal(tag('index.html', 'og:description'), desc);
  assert.ok(RC.includes('"' + title + '"') && LOG.includes('"' + title + '"'), 'R-2 and the log quote og:title');
  const quoted = flat(RC).match(/the description "([^"]*?) …"/);
  assert.ok(quoted && desc.startsWith(quoted[1]), 'R-2 quotes the start of og:description');
  assert.ok(flat(RC).includes(NEEDS), 'R-3 quotes the landing page');
  for (const said of ['Copied: paste it into a message to yourself.', 'Copy was blocked: the link is ']) {
    assert.ok(read('app/landing.js').includes(said) && RC.includes(said.trim()), said);
  }
  assert.ok(read('app/endcard.js').includes('Copied: paste it anywhere.') && RC.includes('Copied: paste it anywhere.'));
  const example = INVITE.match(/```\n([\s\S]*?)```/)[1].trim().split('\n');
  assert.equal(example[example.length - 1], SHARE_URL, 'the invitation\'s example card ends with the card\'s link');
});

test('Gate 2 kit: the booking asks for at least the session the protocol plans', () => {
  const planned = +README.match(/Each session takes about (\d+) minutes/)[1];
  const booking = INVITE.slice(INVITE.indexOf('## 1. Booking'), INVITE.indexOf('## 2.'));
  const asked = [...booking.matchAll(/(\d+) minutes/g)].map(m => +m[1]);
  assert.ok(asked.length >= 4, 'SMS, Slack or Teams, the email\'s subject and its body');
  for (const n of asked) assert.ok(n >= planned, 'a booking for ' + n + ' minutes, a session of about ' + planned);
});

test('Gate 2 kit: one preview rule, word for word in check 4, the tester log and R-2', () => {
  const rule = md => { const m = md.match(/\*\*The preview rule:\*\*([\s\S]*?)\n\s*\n/); return m && flat(m[1]); };
  const r = rule(README);
  assert.ok(r && /the picture and the title/.test(r), 'the README states the rule');
  assert.equal(rule(LOG), r, 'the tester log');
  assert.equal(rule(RC), r, 'R-2');
  assert.match(items(README).find(s => /^\| 4 \|/.test(s)), /the preview rule/, 'check 4 scores by it');
  assert.match(items(LOG).find(s => /^\| The preview/.test(s)), /keeps the rule/);
  // Y-8's accept stays whole in R-2: all three in two apps
  assert.match(flat(RC), /at least two apps show all three, the picture, the title and the description/);
});

test('Gate 2 kit: R-2\'s no-preview steps change one thing at a time, and blame https:// only when it alone did it', () => {
  const rows = tableAfter(RC, '**If there is no preview').map(([send, link, inCard, then]) =>
    ({send, link, then, https: link.includes('https://'), card: inCard === 'yes', ours: link.includes(SHARE_URL)}));
  assert.ok(rows.length >= 4, 'the card, the card with https://, the link alone, another site\'s link');
  assert.equal(rows[0].link, '`' + SHARE_URL + '`', 'step 1 is the card as SHARE copies it');
  assert.ok(rows[0].card);
  for (let i = 1; i < rows.length; i++) {
    const changed = ['https', 'card', 'ours'].filter(k => rows[i][k] !== rows[i - 1][k]);
    assert.equal(changed.length, 1, 'step ' + (i + 1) + ' changes ' + (changed.join(' and ') || 'nothing'));
  }
  const fixes = rows.filter(r => /\d+ more characters/.test(r.then));
  assert.equal(fixes.length, 1, 'one step offers the card more characters');
  const k = rows.indexOf(fixes[0]);
  assert.ok(k > 0 && rows[k].https && !rows[k - 1].https, 'the step that added only https://');
  assert.equal(+fixes[0].then.match(/(\d+) more characters/)[1], 'https://'.length);
});

test('Gate 2 kit: a window that grows from the landing page starts the game by itself; one that shrinks reloads', () => {
  // app/landing.js listens for resize while it is up, and not once the game is: a game shrunk after it opened keeps the desk
  const heard = {resize: []};
  const win = (w, h) => ({innerWidth: w, innerHeight: h, matchMedia: q => ({matches: q === '(any-pointer: fine)'}),
    location: {href: 'https://databerryau.github.io/gridwatch/index.html', search: ''}, navigator: {},
    document: makeDocument(read('index.html')), addEventListener: (t, f) => (heard[t] ||= []).push(f),
    removeEventListener: (t, f) => { heard[t] = heard[t].filter(g => g !== f); }});
  let loads = 0;
  assert.equal(start(win(1600, 900), () => { loads++; }), 'game');
  assert.deepEqual(heard.resize, [], 'the game never looks at the window again');
  const small = win(1000, 500);
  assert.equal(start(small, () => { loads++; }), 'landing');
  Object.assign(small, {innerWidth: 1600, innerHeight: 900});
  for (const f of heard.resize.slice()) f({type: 'resize'});
  assert.deepEqual([loads, heard.resize], [2, []], 'a bigger window starts the game, with no reload, and stops listening');
  // (case matters: "full screen" grows the window, FULL SCREEN is the page's button, named in a tally)
  const grow = /\b[Mm]ake the (?:browser )?window bigger\b|\b(?:bigger|larger) window\b|\bF11\b|[Mm]aximi[sz]e|\b[Ff]ull screen\b|\b[Zz]oom(?:ing)? out\b/;
  const shrink = /\bwindow small\b/;   // (not "a small window", a state)
  let n = 0;
  for (const [file, md] of Object.entries(KIT)) {
    for (const item of items(md).filter(s => grow.test(s) || shrink.test(s))) {
      n++;
      const said = file + ': "' + item.slice(0, 90) + '…"';
      if (shrink.test(item)) assert.match(item, /\breload|\bF5\b/i, said + ' shrinks the window and never reloads');
      else assert.match(item, /\bby itself\b/i, said + ' grows the window and never says the game starts by itself');
    }
  }
  assert.ok(n >= 4, 'R-3, the session\'s small laptop, its watch list and the log\'s row resize the window');
});

test('Gate 2 kit: a returning tester who never finished a day gets FIRST SHIFT and the coach, and the kit says so', () => {
  const game = shifts => ({director: {seen: {watch: true, ufls: true, shifts}}, settings: {coach: null}});
  assert.equal(firstShift(game(0)), true, 'saw the trip, left before the verdict: still a first shift');
  assert.equal(coachOn(game(0)), true);
  assert.equal(firstShift(game(1)), false);
  assert.equal(coachOn(game(1)), false);
  assert.match(items(README).find(s => /Returning testers/.test(s)), /only if they finished a day there[^]*gets FIRST SHIFT/);
  assert.match(LOG, /finished a day there\? Y \/ N/);
  assert.match(items(RESULTS).find(s => /Game open → SHARE/.test(s)), /under FIRST SHIFT[^|]*under OFFICIAL/, 'D-2\'s limit goes by the briefing');
});

test('Gate 2 kit: a 1920x1080 laptop at 150% gets the landing page, and the session and the log plan for it', () => {
  // 1920x1080 at 150% is a 1280x720 screen; less the taskbar (48) and the browser's tabs and address bar (about 85)
  const laptop = {innerWidth: 1280, innerHeight: 587, screen: {width: 1280, height: 720}, matchMedia: q => ({matches: q === '(any-pointer: fine)'})};
  assert.equal(needsLanding(laptop), true);
  const step = items(README).find(s => /landing page shows on their computer/.test(s));
  assert.ok(step, 'the session says what to do');
  // FULL SCREEN only where the keyboard locks, so Esc stays the game's (Chrome, Edge): elsewhere the page says F11, and so
  // must the hint
  assert.match(flat(step), /offers PLAY ANYWAY, and in Chrome and Edge FULL SCREEN/);
  assert.match(flat(step), /in Chrome or Edge \*"Press FULL SCREEN\."\*, in Firefox \*"Press F11\."\*/, 'the hint goes by the browser');
  assert.ok(flat(step).includes(shortOf(1280, 587)), 'it quotes what the page says to that laptop');
  assert.doesNotMatch(step.slice(step.indexOf('landing page shows on their computer')), /It's for a computer/, 'the phone\'s hint is wrong at a computer');
  assert.ok(items(LOG).some(s => /^\| Landing page on the computer/.test(s)), 'the log has a row for it');
});
