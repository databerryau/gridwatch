// The plan bar (SPEC §9.1 Q-45, desk/README.md §30.4): the objective line and the annunciator share
// one strip along the bottom of the map. The desk builds its annunciator into #annun-slot (6 × 2
// tiles, ACK over HORN OFF, EXPLAIN); the desk's focus, Enter, scale and reduced motion follow it
// there. A tile press (Q-46): closed, the focus jump, its note and W's pick; a second press while
// the note shows opens the alarm panel at the tile; open, it only selects. A press on the slot takes
// the RESPOND card as one on the desk does (K-16), except EXPLAIN (the card waits for the panel).
// The CSS is pinned and its sums done here (no layout in the stand-in DOM); the page is played
// headless (tests/lib/play.js), sampled: a jump, then a frame around each press.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {V} from '../sim/params.js';
import {createState, observe} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import {TILES} from '../app/alarms.js';
import {layoutSizes} from '../app/shell.js';
import {createDesk} from '../desk/desk.js';
import {AGAIN, TILE_HELP} from '../desk/annunciator.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../desk/desk.css', import.meta.url), 'utf8');
const TPS = V.TICKS_PER_S;
/** The body of the first rule whose selector list is exactly `sel` (a regexp source). */
const ruleOf = (css, sel) => { const m = new RegExp('(?:^|[\\s}])' + sel + '\\s*\\{([^}]*)\\}').exec(css); assert.ok(m, 'no rule ' + sel); return m[1]; };
const pxOf = (body, prop) => { const m = new RegExp('(?:^|[;\\s])' + prop + ':\\s*([\\d.]+)px').exec(body); assert.ok(m, prop); return Number(m[1]); };

// ---------------------------------------------------------------- the CSS (pinned; the sums the browser would do)

test('Q-45: the plan bar\'s CSS: #planbar on the desk\'s top edge, #annun-slot 432×58 (30vw from 1600 px), the card above it at the floor', () => {
  const bar = ruleOf(NEXT, '#planbar');
  for (const d of ['position: fixed', 'bottom: var(--desk-h)', 'display: flex', 'align-items: flex-end', 'pointer-events: none']) assert.ok(bar.includes(d), '#planbar ' + d);
  const slot = ruleOf(NEXT, '#annun-slot');
  for (const d of ['flex: none', 'margin-left: auto', 'pointer-events: auto', 'width: 432px', 'height: var(--planbar-h)']) assert.ok(slot.includes(d), '#annun-slot ' + d);
  assert.match(NEXT, /--planbar-h: 58px;/);
  assert.match(NEXT, /@media \(min-width: 1600px\) \{ #annun-slot \{ width: clamp\(432px, 30vw, 600px\); \} \}/);
  // #objective keeps its look and lets the pointer through to the map; the bar places it (no position of its own)
  const obj = ruleOf(NEXT, '#objective');
  for (const d of ['flex: 1 1 auto', 'min-width: 0', 'pointer-events: none']) assert.ok(obj.includes(d), '#objective ' + d);
  assert.doesNotMatch(obj, /position:|bottom:/);
  assert.match(NEXT, /<div id="planbar"><div id="objective" role="status" aria-live="polite" hidden>.*?<\/div><div id="annun-slot" class="dk-vars"><\/div><\/div>/);
  // At the 1280×600 floor the RESPOND card starts under the header, so it has the room it has just above the
  // breakpoint (1280×660, from hdr + 60): it ends above the plan bar as it did over the map before.
  assert.match(NEXT, /@media \(max-height: 659px\) \{ #respond-card \{ top: calc\(var\(--hdr\) \+ 8px\); \} \}/);
  assert.match(ruleOf(NEXT, '#respond-card'), /top: calc\(var\(--hdr\) \+ 60px\);/);
  const room = (h, top) => { const L = layoutSizes(1280, h); return h - L.desk - 58 - (L.header + top); };
  assert.equal(room(600, 8), 202);
  assert.ok(room(600, 8) >= room(660, 60), 'the floor leaves the card as much room as 1280×660 does: ' + room(660, 60));
  assert.ok(room(659, 60) < room(600, 8), 'and without the rule it would have less');
});

test('Q-45: desk.css carries the desk\'s variables, type, focus ring and glow to .dk-vars; the 6×2 annunciator fits the 432×58 slot', () => {
  const vars = ruleOf(CSS, '\\.dk, \\.dk-vars');
  for (const v of ['--dk-k: 1', '--u: calc(1px * var(--dk-k))', '--dk-panel:', '--dk-text:', '--dk-cyan:', '--dk-mono:', 'font: calc(10 * var(--u))/1.2', 'color: var(--dk-text)']) {
    assert.ok(vars.includes(v), '.dk-vars ' + v);
  }
  assert.match(CSS, /\.dk-vars \.glow, \.dk-vars \.dk-focus, \.dk \.glow, \.dk \.dk-focus \{ box-shadow:/);
  assert.match(CSS, /\.dk-vars \.dk-focus, \.dk \.dk-focus \{ outline:/);
  assert.match(NEXT, /button:focus-visible \{ outline: 2px solid var\(--blue\); outline-offset: 1px; \}/, 'the page\'s, as .dk :focus-visible');
  // the sums: the slot less the panel's border and padding; tiles, ACK over HORN OFF, EXPLAIN
  const panel = ruleOf(CSS, '\\.dk-panel');
  assert.match(panel, /border: 1px solid/);
  const pad = 1 + pxOf(panel, 'padding'), W = 432 - 2 * pad, H = 58 - 2 * pad;
  const annun = ruleOf(CSS, '\\.dk-annun');
  const [, side, key, gap] = /grid-template-columns: 1fr (\d+)px (\d+)px; gap: (\d+)px; height: 100%;/.exec(annun).map(Number);
  const tiles = ruleOf(CSS, '\\.dk-tiles');
  assert.match(tiles, /grid-template-columns: repeat\(6, 1fr\); grid-template-rows: repeat\(2, 1fr\);/);
  const tg = pxOf(tiles, 'gap');
  const tileW = (W - side - key - 2 * gap - 5 * tg) / 6, tileH = (H - tg) / 2;
  assert.ok(tileW >= 48 && tileW <= 56, 'a tile is about 52 px wide: ' + tileW);
  assert.ok(tileH >= 24, 'a tile is at least 24 px tall: ' + tileH);
  // a label: the glyph inline (no glyph row), 8.5 px, line-height 1, at most two lines, inside an escalated tile's double border
  const tile = ruleOf(CSS, '\\.dk-tile');
  assert.equal(pxOf(tile, 'font-size'), 8.5);
  assert.match(tile, /line-height: 1;/);
  assert.match(tile, /overflow: hidden;/);
  assert.doesNotMatch(tile, /flex-direction: column/);
  assert.doesNotMatch(ruleOf(CSS, '\\.dk-tile-glyph'), /height:/);
  const esc = pxOf(ruleOf(CSS, '\\.dk-tile\\.esc'), 'border-width');
  assert.ok(2 * 8.5 + 2 * esc <= tileH, 'two label lines and the double border: ' + (2 * 8.5 + 2 * esc));
  assert.match(CSS, /@media \(min-width: 1600px\) \{ \.dk-tile \{ font-size: 10px; white-space: nowrap; text-overflow: ellipsis; \} \}/);
  // ACK over HORN OFF (24 px each, the face 9 px on at most two lines); EXPLAIN the slot's height
  const sideGap = pxOf(ruleOf(CSS, '\\.dk-annun-side'), 'gap');
  assert.ok(2 * 24 + sideGap <= H, 'ACK over HORN OFF: ' + (2 * 24 + sideGap) + ' of ' + H);
  assert.ok((H - sideGap) / 2 >= 2 * 9 + 2, 'HORN OFF on two 9-px lines');
  assert.match(ruleOf(CSS, '\\.dk-ack, \\.dk-silence, \\.dk-explain'), /min-height: 24px; min-width: 24px;[^}]*font: 700 9px\/1 /);
  assert.ok(key >= 50 && H >= 50, 'EXPLAIN about 52 × 50: ' + key + ' × ' + H);
  // its notes float above the bar (over the map), not over the tiles
  assert.match(ruleOf(CSS, '\\.dk-annun > \\.dk-note'), /bottom: calc\(100% \+ 4px\);/);
});

// ---------------------------------------------------------------- the desk alone (mock actions)

function mount(o = {}) {
  const doc = makeDocument(), root = doc.createElement('div'), slot = doc.createElement('div');
  root.id = 'desk'; slot.id = 'annun-slot'; slot.className = 'dk-vars';
  doc.body.append(slot, root);
  const uis = [];
  const desk = createDesk(doc, root, {input: () => '', ui: c => { if (c.do !== 'cue') uis.push(c); }}, o.noSlot ? {} : {annunSlot: slot});
  return {doc, root, slot, desk, uis, $: id => doc.getElementById(id)};
}
const QUIET = observe(createState(1, CLASSIC));
const tilesWith = states => TILES.map(t => ({id: t.id, label: t.label, prio: t.prio, state: states[t.id] || 'normal', glyph: '·', target: t.target,
  flash: states[t.id] === 'alarm' ? 'fast' : null}));
const vmOf = (over = {}, ms = 1000, tick) => {
  const obs = tick === undefined ? QUIET : Object.assign({}, QUIET, {tick});
  return baseVm(obs, Object.assign({alarms: {tiles: tilesWith({n1: 'alarm'}), sounding: false}, frame: {nowMs: ms, dtS: 1 / 60, alpha: 0}}, over));
};
const noteOf = $ => { const n = $('annunciator').querySelector('.dk-note'); return n && !n.hidden ? n.textContent : ''; };

test('§30.4: the desk builds its annunciator into the slot (else into its column 4); focus, the ring, Enter, scale and reduced motion follow it', () => {
  const m = mount(), {$, desk, slot, root} = m;
  desk.update(vmOf());
  assert.ok(slot.contains($('annunciator')) && !desk.el.contains($('annunciator')), 'in the plan bar');
  assert.deepEqual($('annunciator').querySelectorAll('.dk-tile').map(b => b.id), TILES.map(t => 'tile-' + t.id), '12 tiles in TILES order: 6 × 2');
  assert.deepEqual($('annunciator').children.map(c => c.id || c.className), ['dk-tiles', 'dk-annun-side', 'btn-explain'], 'tiles, ACK over HORN OFF, EXPLAIN');
  assert.deepEqual($('annunciator').querySelector('.dk-annun-side').children.map(c => c.id), ['btn-ack', 'btn-silence']);
  assert.equal($('btn-silence').textContent, 'HORN OFF', 'Q-45: the face says what it does');
  // a desk-only mount keeps it in column 4
  const solo = mount({noSlot: true});
  solo.desk.update(vmOf());
  assert.ok(solo.desk.el.contains(solo.$('annunciator')) && !solo.slot.contains(solo.$('annunciator')));
  // desk.focus and vm.focus reach it, with the .dk-focus ring (and take the ring off again)
  assert.equal(desk.focus('btn-ack'), true);
  assert.equal(m.doc.activeElement.id, 'btn-ack');
  desk.update(vmOf({focus: 'tile-n1'}, 1016));
  assert.equal(m.doc.activeElement.id, 'tile-n1');
  assert.ok($('tile-n1').classList.contains('dk-focus'));
  desk.update(vmOf({focus: 'lever-coal'}, 1032));
  assert.ok(!$('tile-n1').classList.contains('dk-focus') && $('lever-coal').classList.contains('dk-focus'));
  // Enter on a focused tile in the slot presses it, once
  $('tile-peak').focus();
  m.uis.length = 0;
  assert.equal(desk.key({type: 'keydown', key: 'Enter', target: $('tile-peak')}), true);
  assert.deepEqual(m.uis, [{do: 'alarmsPick', id: 'peak'}, {do: 'focus', target: 'gauge-n1'}]);
  // the desk's scale and reduced motion
  root.clientWidth = 1920; root.clientHeight = 520;
  desk.update(vmOf({settings: {reducedMotion: true}}, 1048));
  assert.equal(slot.style['--dk-k'], '1.500');
  assert.equal(slot.style['--dk-k'], desk.el.style['--dk-k']);
  assert.ok(slot.classList.contains('dk-rm') && desk.el.classList.contains('dk-rm'));
  desk.update(vmOf({}, 1064));
  assert.ok(!slot.classList.contains('dk-rm'));
});

test('Q-46: a tile press: closed, the pick, the focus jump and a note ending "Press again"; again while it shows, the panel at that tile; open, select only', () => {
  const m = mount(), {$, desk, uis} = m;
  desk.update(vmOf());
  $('tile-n1').click();
  assert.deepEqual(uis, [{do: 'alarmsPick', id: 'n1'}, {do: 'focus', target: 'gauge-n1'}]);
  assert.equal(noteOf($), TILE_HELP.n1 + AGAIN);
  assert.ok(noteOf($).endsWith('Press again to explain (W).'));
  assert.ok($('annunciator').querySelector('.dk-note').classList.contains('info'), 'help, so blue (Q-41)');
  // the second press while the note shows: the note goes, the panel opens at this tile
  uis.length = 0;
  $('tile-n1').click();
  assert.deepEqual(uis, [{do: 'alarms', on: true, id: 'n1'}]);
  assert.equal(noteOf($), '');
  // a different tile, or the same one once its note has gone (6 s), is a first press again
  uis.length = 0;
  $('tile-peak').click();
  assert.deepEqual(uis.map(u => u.do), ['alarmsPick', 'focus']);
  assert.match(noteOf($), /^PEAK: .* Not in alarm now\. Press again to explain \(W\)\.$/);
  desk.update(vmOf({}, 7100));
  assert.equal(noteOf($), '', 'the note aged out');
  uis.length = 0;
  $('tile-peak').click();
  assert.deepEqual(uis.map(u => u.do), ['alarmsPick', 'focus']);
  // an ACK note in between: the next tile press is a first press
  $('btn-silence').click();
  uis.length = 0;
  $('tile-peak').click();
  assert.deepEqual(uis.map(u => u.do), ['alarmsPick', 'focus']);
  // the panel open: select only (no focus jump, no note); the tiles say Enter explains
  desk.update(vmOf({alarmsOpen: true, alarmsSel: 'peak'}, 15000));
  uis.length = 0;
  $('tile-ufls').click();
  $('tile-ufls').click();
  assert.deepEqual(uis, [{do: 'alarmsSel', id: 'ufls'}, {do: 'alarmsSel', id: 'ufls'}]);
  assert.equal(noteOf($), '');
  assert.match($('tile-ufls').getAttribute('aria-label'), /^UFLS OPERATED: normal, P1\. Enter: explain it\.$/);
  desk.update(vmOf({}, 15016));
  assert.match($('tile-n1').getAttribute('aria-label'), /^N-1 INSECURE: ALARM, not acknowledged, P2\. Enter: go to its control\.$/);
});

test('Q-46: EXPLAIN (W): its attributes, the press, pressed while open, lit while a tile is in alarm until the panel has been opened that day', () => {
  const m = mount(), {$, desk, uis} = m;
  desk.update(vmOf({alarms: {tiles: tilesWith({}), sounding: false}}, 1000, 100));
  const x = $('btn-explain');
  assert.equal(x.tagName, 'BUTTON');
  assert.deepEqual(['aria-keyshortcuts', 'aria-controls', 'aria-expanded'].map(k => x.getAttribute(k)), ['W', 'alarm-panel', 'false']);
  assert.equal(x.title, 'Explain the alarms (W): holds the clock');
  assert.equal(x.textContent, 'EXPLAINW');
  assert.equal(x.querySelector('small').className, 'dk-kcap', 'a small W');
  assert.ok(!x.classList.contains('lit'), 'nothing in alarm');
  x.click();
  assert.deepEqual(uis, [{do: 'alarms'}]);
  // a tile in alarm lights it; open, it is pressed and stays unlit after the close
  desk.update(vmOf({}, 1016, 200));
  assert.ok(x.classList.contains('lit') && !x.classList.contains('on'));
  desk.update(vmOf({alarmsOpen: true, alarmsSel: 'n1'}, 1032, 200));
  assert.ok(x.classList.contains('on') && !x.classList.contains('lit'));
  assert.equal(x.getAttribute('aria-expanded'), 'true');
  desk.update(vmOf({}, 1048, 300));
  assert.ok(!x.classList.contains('on') && !x.classList.contains('lit'), 'opened once today');
  assert.equal(x.getAttribute('aria-expanded'), 'false');
  // a new day (the tick goes back) lights it again
  desk.update(vmOf({}, 1064, 0));
  assert.ok(x.classList.contains('lit'));
});

// ---------------------------------------------------------------- the real page, headless

test('Q-45 / Q-46 on the page: the slot holds the annunciator; EXPLAIN holds the clock; a tile pressed twice opens the panel there; open, tiles and Enter select', () => {
  const p = openGame({seed: 20261007});
  const {$} = p;
  assert.ok($('annun-slot').contains($('annunciator')) && !$('desk').contains($('annunciator')));
  assert.deepEqual($('planbar').children.map(c => c.id), ['objective', 'annun-slot']);
  assert.ok(['ok', 'plan', 'act', 'crit'].includes($('objective').className), 'the objective\'s class is its level: ' + $('objective').className);
  assert.equal($('annun-slot').style['--dk-k'], $('desk').firstElementChild.style['--dk-k'], 'the desk\'s scale on the slot');
  // EXPLAIN: open (the clock held), pressed; again: closed, CRUISE, the focus back on EXPLAIN
  let r = p.press('btn-explain');
  assert.match(r.during, /^ALARMS open: /m);
  assert.equal(p.mode(), 'ALARMS');
  assert.equal($('btn-explain').getAttribute('aria-expanded'), 'true');
  r = p.press('btn-explain');
  assert.doesNotMatch(r.after, /^ALARMS open/m);
  assert.equal(p.mode(), 'CRUISE');
  assert.equal(p.doc.activeElement.id, 'btn-explain');
  // a tile, closed: its control, its note (blue, on the annunciator), W's pick
  r = p.press('tile-n1');
  assert.match(r.during, /^NOTE blue annunciator: N-1 INSECURE: .* Press again to explain \(W\)\.$/m);
  assert.equal(p.vm().focus, 'gauge-n1');
  assert.equal(p.game.ui.alarmsPick.id, 'n1');
  assert.equal(p.mode(), 'CRUISE');
  // again while its note shows: the panel at that tile, the note gone
  r = p.press('tile-n1');
  assert.match(r.during, /^ALARMS open: N-1 INSECURE$/m);
  assert.doesNotMatch(r.during, /^NOTE /m);
  assert.equal(p.mode(), 'ALARMS');
  // open: a tile selects, nothing else (no focus jump, no note, the clock still held)
  const tick = p.game.state.tick;
  r = p.press('tile-ufls');
  assert.match(r.after, /^ALARMS open: UFLS OPERATED$/m);
  assert.doesNotMatch(r.after, /^NOTE /m);
  assert.equal(p.doc.activeElement.id, 'tile-ufls');
  assert.equal(p.game.state.tick, tick);
  assert.match($('tile-ufls').getAttribute('aria-label'), /Enter: explain it\.$/);
  // and Enter on a focused tile selects it too (the panel stays open; vm.focus does not follow into the bar)
  const focus = p.vm().focus;
  $('tile-peak').focus();
  p.key('Enter');
  assert.equal(p.vm().alarmsSel, 'peak');
  assert.equal(p.mode(), 'ALARMS');
  assert.equal(p.vm().focus, focus);
  // Esc closes it (the clock runs again); closed, Enter on a focused tile is its press, and vm.focus follows a key into the bar
  p.key('Escape');
  assert.equal(p.mode(), 'CRUISE');
  $('tile-weather').focus();
  p.key('Enter');
  assert.equal(p.vm().focus, 'tray');
  assert.match(p.look(), /^NOTE blue annunciator: WEATHER: /m);
  $('btn-ack').focus();
  p.key('Enter');
  assert.equal(p.vm().focus, 'btn-ack');
  assert.deepEqual(p.h.mods.errors, []);
});

test('K-16 on the plan bar: a press on the alarms takes the RESPOND card, but EXPLAIN only hides it until the panel closes', () => {
  const p = openGame({seed: 20261007});
  injectTrip(p.game.state, Math.floor(p.game.state.tick / TPS) + 60);
  assert.equal(p.until('trip', {max: '+10m'}).why, 'trip');
  assert.equal(p.until('card').why, 'card');
  assert.equal(p.mode(), 'RESPOND-CARD');
  // EXPLAIN: the pointer does not take the card; the press hides it while the panel is open
  p.pointer('btn-explain', 'pointerdown');
  p.frame();
  assert.equal(p.mode(), 'RESPOND-CARD');
  let r = p.press('btn-explain');
  assert.equal(p.mode(), 'ALARMS');
  assert.doesNotMatch(r.during, /^CARD /m);
  p.key('Escape');
  assert.equal(p.mode(), 'RESPOND-CARD');
  assert.match(p.look({controls: false}), /^CARD /m, 'the card is back');
  // a tile: the card goes (K-16), and the press answers as ever
  r = p.press('tile-unitTrip');
  assert.notEqual(p.mode(), 'RESPOND-CARD');
  assert.doesNotMatch(r.after, /^CARD /m);
  assert.match(r.during, /^NOTE blue annunciator: UNIT TRIP: /m);
  assert.deepEqual(p.h.mods.errors, []);
});
