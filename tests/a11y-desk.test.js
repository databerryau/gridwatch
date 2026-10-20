// W6 (the a11y audit, desk side). The desk scales WHOLE with the window above the 1280×600 floor (desk/desk.css
// transforms .dk by --dk-k, desk.js deskScale), so every word, knob and hit box grows together; the floor's own
// words are raised where its boxes hold them (CSS arithmetic below: the stand-in DOM has no layout, so the sums are
// done here, with a width model wider than the fonts'). The canvases draw at devicePixelRatio × the scale and the
// pointers read the screen, so a scaled desk stays sharp and true. The end card's hour strip is never colour alone;
// the Live Stack's L button has a name; quiet and flashing alarm tiles keep WCAG's 4.5:1, and a flash still shows.
// TEXT SIZE (no setting): every window measured is width-bound once the desk scales (1366, 1536 and 1920 wide fill
// their width; 1280×600 is the floor), so a larger type has no room that a bigger desk does not already use.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {createState, observe} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import {V} from '../sim/params.js';
import {layoutSizes} from '../app/shell.js';
import {createDesk, deskScale, DESK_SCALE_MAX, LAYOUT} from '../desk/desk.js';
import {SYNC_LABEL} from '../desk/bay.js';
import {SYNC_BLOCKED} from '../sim/grid.js';
import {createLiveStack, screenScale, EXPAND_NAME} from '../render/livestack.js';
import {createEndCard, stripText, STRIP_WORDS} from '../app/endcard.js';
import {createAlarmPanel} from '../app/alarmpanel.js';
import {TILES} from '../app/alarms.js';
import {allIn} from '../app/score.js';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const CSS = read('../desk/desk.css').replace(/\/\*[\s\S]*?\*\//g, '');
const NEXT = read('../next.html');
/** The body of the first rule whose selector list is exactly `sel` (a regexp source; a rule starts a line or follows another). */
const ruleOf = (css, sel) => { const m = new RegExp('(?:^|[\\n}])\\s*' + sel + '\\s*\\{([^}]*)\\}').exec(css); assert.ok(m, 'no rule ' + sel); return m[1]; };
const pxOf = (body, prop) => { const m = new RegExp('(?:^|[;\\s])' + prop + ':\\s*(?:\\d{3} )?(?:calc\\(([\\d.]+) \\* var\\(--u\\)\\)|([\\d.]+)px)').exec(body); assert.ok(m, prop + ' in ' + body); return Number(m[1] ?? m[2]); };

// ---------------------------------------------------------------- the window: the page's sums, the desk's scale

/** The four windows the audit asked about: the #desk box the page gives (layoutSizes; its 1-px top border) and the desk's scale. */
const WINDOWS = [[1280, 600], [1366, 768], [1536, 864], [1920, 1080]].map(([w, h]) => {
  const L = layoutSizes(w, h), ch = L.desk - 1;
  return {name: w + '×' + h, w, h: ch, k: deskScale(w, ch)};
});

/** Every rule of desk.css with a type size: {sel, px} at the floor (calc(N * var(--u)) is N px inside .dk); @media blocks apart. */
function typeSizes(css) {
  const flat = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const out = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const f = /(?:^|[;\s])font(?:-size)?:\s*(?:\d{3}\s+)?(?:calc\(([\d.]+) \* var\(--u\)\)|([\d.]+)px)/.exec(m[2]);
    if (f) out.push({sel: m[1].trim().replace(/\s+/g, ' '), px: Number(f[1] ?? f[2])});
  }
  return out;
}
// the annunciator's rules: it sits in the plan bar's slot, which the page sizes (not scaled with the desk)
const IN_SLOT = /dk-tile|dk-ack|dk-silence|dk-explain|dk-annun/;

test('W6 a11y: the desk scales whole with the window: 1× at 1280×600, 1.067× at 1366×768, 1.2× at 1536×864, 1.5× at 1920×1080', t => {
  assert.deepEqual(WINDOWS.map(x => x.k), [1, 1.067, 1.2, 1.5]);
  assert.equal(DESK_SCALE_MAX, 1.5, 'the page around the desk does not scale (its header, plan bar, cards): the desk stops at 1.5×');
  for (const x of WINDOWS) {
    // the floor's layout always fits the slot at its scale (floored, so never a pixel over), and the desk fills the width
    assert.ok(x.w / x.k >= LAYOUT.width && x.h / x.k >= LAYOUT.height - 1, x.name + ': the floor fits');
    assert.ok(x.w / x.k - LAYOUT.width < 1, x.name + ': width-bound, so no room for a larger type than the scale gives');
    t.diagnostic(x.name + ': ×' + x.k + ', the desk lays out ' + (x.w / x.k).toFixed(0) + ' × ' + (x.h / x.k).toFixed(0) + ' px (spare height ' +
      Math.max(0, x.h / x.k - LAYOUT.height).toFixed(0) + ' px)');
  }
  assert.equal(deskScale(2560, 699), 1.5, 'capped');
  assert.equal(deskScale(1100, 250), 1, 'never below the floor');
  // the CSS: the floor's layout in floor pixels, scaled to the slot; --u is 1 px inside (no double scaling)
  const dk = ruleOf(CSS, '\\.dk');
  for (const s of ['--u: 1px;', 'width: calc(100% / var(--dk-k)); height: calc(100% / var(--dk-k));', 'min-width: 1280px; min-height: 300px;',
    'transform: scale(var(--dk-k)); transform-origin: 0 0;']) assert.ok(dk.includes(s), '.dk ' + s);
  assert.ok(ruleOf(CSS, '\\.dk, \\.dk-vars').includes('--u: calc(1px * var(--dk-k))'), 'the slot keeps --u scaled');
  // the desk sets the scale on itself and on the slot, every frame
  const doc = makeDocument(), root = doc.createElement('div'), slot = doc.createElement('div');
  slot.className = 'dk-vars';
  doc.body.append(slot, root);
  const desk = createDesk(doc, root, {input: () => '', ui() {}}, {annunSlot: slot});
  const vm = baseVm(observe(createState(1, CLASSIC)));
  for (const x of WINDOWS) {
    root.clientWidth = x.w; root.clientHeight = x.h;
    desk.update(vm);
    assert.equal(desk.el.style['--dk-k'], x.k.toFixed(3), x.name);
    assert.equal(slot.style['--dk-k'], x.k.toFixed(3), x.name);
  }
});

test('W6 a11y: the desk\'s words at each window: none under 8 px at the floor, the messages 10 px; ×1.2 and ×1.5 above it', t => {
  const all = typeSizes(CSS), desk = all.filter(r => !IN_SLOT.test(r.sel)), slot = all.filter(r => IN_SLOT.test(r.sel));
  assert.ok(desk.length >= 30 && slot.length >= 2, 'the parse found the type: ' + desk.length + ' + ' + slot.length);
  const min = rs => Math.min(...rs.map(r => r.px));
  const small = all.filter(r => r.px < 8).map(r => r.sel + ' ' + r.px + 'px');
  assert.deepEqual(small, [], 'no desk text under 8 px at the floor (it was 7 and 7.5)');
  for (const s of ['.dk-card', '.dk-note', '.dk-log']) assert.ok(desk.find(r => r.sel === s).px >= 10, s + ': the messages at 10 px');
  for (const [s, px] of [['.dk-hold-sub', 9], ['.dk-sync-label', 9], ['.dk-gate-label', 8]]) assert.equal(desk.find(r => r.sel === s).px, px, s);
  for (const x of WINDOWS) {
    t.diagnostic(x.name + ': desk words ' + (min(desk) * x.k).toFixed(1) + '–' + (16 * x.k).toFixed(1) + ' px, tray messages ' + (10 * x.k).toFixed(1) +
      ' px; alarm tiles ' + (x.w >= 1600 ? 10 : 8.5) + ' px (the plan bar is the page\'s)');
  }
  assert.ok(min(desk) * WINDOWS[2].k >= 9.6 && min(desk) * WINDOWS[3].k >= 12, 'every word grows with the desk');
  assert.match(CSS, /@media \(min-width: 1600px\) \{ \.dk-tile \{ font-size: 10px;/);
});

// ---------------------------------------------------------------- the floor's sums (1280 × 300; panel = border 1 + padding 3)

// A width model wider than system-ui's and the desk's monospace's own advances (Segoe UI, SF, Cascadia Mono), in em
function textW(s, px, mono) {
  if (mono) return [...s].length * 0.62 * px;
  let w = 0;
  for (const ch of s) w += (/[ .,:;'!|()/\-·]/.test(ch) ? (ch === ' ' ? 0.3 : 0.32) : /[ilj]/.test(ch) ? 0.3 : /[a-z]/.test(ch) ? 0.54 : /[A-Z]/.test(ch) ? 0.68 : /[0-9]/.test(ch) ? 0.58 : 0.66) * px;
  return w;
}
/** Lines of `s` wrapped at spaces into `width` px (a word wider than the line takes a line of its own). */
function linesOf(s, px, width, mono) {
  let n = 1, line = '';
  for (const word of s.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && textW(next, px, mono) > width) { n++; line = word; } else line = next;
  }
  return n;
}
const inner = h => h - 8;

test('W6 a11y: the floor holds the raised words: three two-row tray cards, the sync label, the slip line, the hold buttons\' prices', t => {
  // the tray (212 px): its head, then three cards of a 24-px row (sender, time, the button) over three 10-px lines of the message
  const card = ruleOf(CSS, '\\.dk-card'), text = ruleOf(CSS, '\\.dk-card-text');
  assert.match(card, /grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(ruleOf(CSS, '\\.dk-card-btn'), /grid-row: 1; grid-column: 2;/);
  assert.match(text, /grid-column: 1 \/ -1;/);
  const px = pxOf(card, 'font-size'), lh = Number(/line-height: ([\d.]+);/.exec(text)[1]), maxEm = Number(/max-height: ([\d.]+)em;/.exec(text)[1]);
  assert.equal(px, 10);
  assert.equal(Math.round(maxEm / lh), 3, 'three lines');
  const cardH = 24 + maxEm * px, head = 20 + 2;
  assert.ok(3 * cardH + 2 * 2 <= inner(LAYOUT.panels[3][0]) - head, 'three cards: ' + (3 * cardH + 4) + ' of ' + (inner(LAYOUT.panels[3][0]) - head));
  // its width: the card less its 3-px edge and padding; a message of 90 characters shows whole (it had a third of the width)
  const msgW = LAYOUT.columns[3] - 8 - 3 - 4;
  assert.ok(linesOf('Heatwave 14:05-20:00: demand up to +6.5% (building from 13:05, easing by 21:00), coal and gas', px, msgW) <= 3);
  t.diagnostic('tray at the floor: 3 cards × ' + cardH.toFixed(1) + ' px of ' + (inner(LAYOUT.panels[3][0]) - head) + ', each 3 lines × ' + msgW + ' px at ' + px + ' px');
  // the bay (128 px): tabs, the 72-px scope row, then the label's row: two 9-px lines of SYNC_LABEL across the bay
  const label = ruleOf(CSS, '\\.dk-sync-label'), lpx = pxOf(label, 'font-size'), llh = Number(/line-height: ([\d.]+);/.exec(label)[1]);
  const row = inner(LAYOUT.panels[2][1]) - 24 - 2 - 72 - 2, bayW = LAYOUT.columns[2] - 8;
  assert.equal(linesOf(SYNC_LABEL, lpx, bayW), 2, SYNC_LABEL);
  assert.ok(2 * lpx * llh <= row, 'two lines in ' + row + ' px');
  // the slip line: under the 62-px scope with nothing on it; across the bay in the label's row while a unit is on it
  const slip = ruleOf(CSS, '\\.dk-slip'), spx = pxOf(slip, 'font');
  assert.ok(62 + spx * 1.1 <= 72 && textW('No unit ready', spx, true) <= 72, 'under the scope');
  const on = ruleOf(CSS, '\\.dk-sync\\.scoped \\.dk-slip');
  assert.match(on, /position: absolute; left: 2px; right: 2px; bottom: 2px;/);
  assert.ok(textW('GT·C 1 SLIP −0.40 Hz · 2.5 s/turn · SLOW ↺', pxOf(on, 'font'), true) <= bayW - 4 && pxOf(on, 'font') * 1.1 <= row, 'the slip line across the bay');
  assert.match(CSS, /\.dk-sync\.scoped \.dk-scope \{ position: static; \}/, 'positioned by the view, not the 72-px scope column');
  assert.match(CSS, /\.dk-sync\.scoped \.dk-sync-label \{ visibility: hidden; \}/);
  // the bay's notes (on the panel, from its padding edge) sit over the slip line meanwhile, not on it, and under the canvas
  // (in the 72-px row's top 62 px): a blocked CLOSE's note would hide the Hz the next close is timed by
  const nr = ruleOf(CSS, '\\.dk-note'), npx = pxOf(nr, 'font-size'), noteH = npx * Number(/line-height: ([\d.]+);/.exec(nr)[1]) + 2 * 1 + 2 * 1;
  assert.match(nr, /padding: 1px 4px;[\s\S]*border: 1px solid/);
  const noteBottom = pxOf(ruleOf(CSS, '\\.dk-sync\\.scoped:not\\(\\[hidden\\]\\) ~ \\.dk-note'), 'bottom');
  const slipTop = 3 + pxOf(on, 'bottom') + pxOf(on, 'font') * 1.1, canvasBottom = 3 + row + 2 + 72 - 62;
  assert.ok(slipTop <= noteBottom && noteBottom + noteH <= canvasBottom,
    'the slip line ' + (3 + pxOf(on, 'bottom')) + '–' + slipTop.toFixed(1) + ' px, a note ' + noteBottom + '–' + (noteBottom + noteH) + ' px, the canvas from ' + canvasBottom + ' px');
  {
    // GT·A on the scope, a close the relay blocks: the note is the bay panel's, a later sibling of the scoped view (the ~ rule's)
    const bd = makeDocument(), br = bd.createElement('div');
    bd.body.appendChild(br);
    const bay = createDesk(bd, br, {input: x => (x.type === 'syncClose' ? SYNC_BLOCKED : ''), ui() {}});
    const obs = observe(createState(1, CLASSIC)), u = obs.units.find(x => x.station === 'gta');
    Object.assign(obs, {mode: 'HAND', scope: {unit: u.id, open: true}});
    Object.assign(u, {mode: 'ready', slipHz: 0.62, phaseDeg: 120});
    bay.update(baseVm(obs));
    bd.getElementById('sync-close').click();
    const view = bd.querySelector('.dk-sync'), kids = view.parentElement.children, note = kids.find(c => c.classList.contains('dk-note'));
    assert.ok(view.classList.contains('scoped') && !view.hidden, view.className);
    assert.ok(note && !note.hidden && note.textContent === '✕ ' + SYNC_BLOCKED, 'the blocked close\'s note on the bay');
    assert.ok(kids.indexOf(note) > kids.indexOf(view), 'after the view');
  }
  // the emergency row (80 px): with DIRECT SHED shown, each hold button holds its face and its 9-px price lines
  const doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  const desk = createDesk(doc, root, {input: () => '', ui() {}}), $ = id => doc.getElementById(id);
  desk.update(baseVm(observe(createState(1, CLASSIC))));
  const sub = id => $(id).querySelector('.dk-hold-sub').textContent;
  const hpx = pxOf(ruleOf(CSS, '\\.dk-hold-sub'), 'font-size'), face = pxOf(ruleOf(CSS, '\\.dk-hold-face'), 'font-size');
  const W = inner(LAYOUT.columns[3]) - 2 * 4, unit = W / 3.3, H = inner(LAYOUT.panels[3][1]);
  for (const [id, flex, text, faceText, more] of [['key-rert', 1.3, sub('key-rert'), '▣ BREAK GLASS', 0], ['btn-dr', 1, sub('btn-dr'), 'DR', 1],
    ['key-shed', 1, 'no lit district left in the rotation', '▣ DIRECT SHED', 0]]) {
    const w = unit * flex - 2 - 8;   // its border and its 0 4px padding
    const h = linesOf(faceText, face * 1.12, w) * face * 1.2 + 2 + linesOf(text, hpx, w) * hpx * 1.1 + more * (9 * 1.2 + 2);
    assert.ok(text.length > 15 && h <= H, id + ': "' + text + '" ' + h.toFixed(1) + ' of ' + H + ' px');
    t.diagnostic(id + ' (DIRECT SHED shown): "' + text + '" ' + linesOf(text, hpx, w) + ' lines at ' + hpx + ' px in ' + w.toFixed(0) + ' px, ' + h.toFixed(0) + ' of ' + H + ' px tall');
  }
});

test('W7 Q3: every alarm tile\'s plain words fit its tile: two lines, the glyph first, at the floor (8.5 px) and from 1600 px (10 px); an escalated one inside its double border', t => {
  // the plan bar's slot (next.html: 432 px; clamp(432px, 30vw, 600px) from 1600 px) less the panel's edge, ACK over HORN OFF, EXPLAIN
  const pad = 1 + pxOf(ruleOf(CSS, '\\.dk-panel'), 'padding');
  const [, side, key, gap] = /grid-template-columns: 1fr (\d+)px (\d+)px; gap: (\d+)px;/.exec(ruleOf(CSS, '\\.dk-annun')).map(Number);
  const grid = ruleOf(CSS, '\\.dk-tiles'), cols = Number(/grid-template-columns: repeat\((\d+), 1fr\)/.exec(grid)[1]), tg = pxOf(grid, 'gap');
  assert.equal(cols * 2, TILES.length, 'two rows');
  const tileW = slot => (slot - 2 * pad - side - key - 2 * gap - (cols - 1) * tg) / cols;
  // a face: 1 px of padding a side inside a 1-px border (3 px escalated); the state's glyph (■ and ◇ the widest, ‼ before it
  // when escalated) and its 2-px margin, then the words, breaking only at their spaces (overflow: hidden cuts a longer word)
  assert.match(ruleOf(CSS, '\\.dk-tile'), /padding: 0 1px;/);
  assert.match(ruleOf(CSS, '\\.dk-btn, \\.dk-q, \\.dk-tab, \\.dk-key, \\.dk-guard, \\.dk-man, \\.dk-tile, \\.dk-hold, \\.dk-feeder-brk, \\.dk-ready-btn, \\.dk-card-btn'), /border: 1px solid/);
  const esc = pxOf(ruleOf(CSS, '\\.dk-tile\\.esc'), 'border-width'), margin = pxOf(ruleOf(CSS, '\\.dk-tile-glyph'), 'margin-right');
  const tileLines = (label, px, width, escalated) => {
    let n = 1, w = textW(escalated ? '‼■' : '■', px) + margin, first = true;
    for (const word of label.split(' ')) {
      const ww = textW(word, px), sp = textW(' ', px);
      if (!first && w + sp + ww > width) { n++; w = ww; } else w += (first ? 0 : sp) + ww;
      first = false;
      if (w > width) return Infinity;
    }
    return n;
  };
  for (const [name, slot, px] of [['the floor', 432, 8.5], ['1600 px', 480, 10], ['1920 px', Math.min(600, 0.3 * 1920), 10]]) {
    const w = tileW(slot), seen = [];
    for (const x of TILES) {
      const n = tileLines(x.label, px, w - 2 * 1 - 2 * 1, false);
      assert.ok(n <= 2, name + ': "' + x.label + '" takes ' + n + ' lines of ' + px + ' px in ' + (w - 4).toFixed(1) + ' px');
      seen.push(x.label + ' ' + n);
      // escalated: two lines at the floor (the planbar sums: 2 × 8.5 px and the double border fit the tile); one from 1600 px (nowrap)
      if (x.escalates) assert.ok(tileLines(x.label, px, w - 2 * 1 - 2 * esc, true) <= (px === 8.5 ? 2 : 1), name + ': "' + x.label + '" escalated');
    }
    t.diagnostic(name + ': tiles ' + w.toFixed(1) + ' px at ' + px + ' px: ' + seen.join(', '));
  }
});

// ---------------------------------------------------------------- canvases and hit boxes in a scaled desk

test('W6 a11y: in a scaled desk the dial, the scope and the Live Stack draw at devicePixelRatio × the scale, and a lever drag reads the screen', () => {
  const doc = makeDocument(), root = doc.createElement('div'), sent = [];
  doc.body.appendChild(root);
  const desk = createDesk(doc, root, {input: x => { sent.push(x); return ''; }, ui() {}}), $ = id => doc.getElementById(id);
  const obs = observe(createState(1, CLASSIC));
  obs.mode = 'HAND';
  const vm = baseVm(obs);
  desk.update(vm);
  assert.equal($('dial-canvas').width, 400, 'at the floor: its box (the stand-in\'s 400 px)');
  root.clientWidth = 1920; root.clientHeight = 519;
  desk.update(Object.assign({}, vm, {frame: {nowMs: 1100, dtS: 1 / 60, alpha: 0}}));
  assert.equal($('dial-canvas').width, 600, 'the dial at 1.5×');
  assert.equal($('scope-canvas').width, 600, 'the scope at 1.5×');
  // a lever drag: the same place on the track's screen box means the same MW, whatever the scale (desk/levers.js mwAt)
  const coal = obs.stations.find(s => s.id === 'coal'), track = $('lever-coal');
  assert.ok(obs.units.some(u => u.station === 'coal' && u.sync), 'coal runs at 04:00');
  const total = Number(track.getAttribute('aria-valuemax'));
  for (const k of [1, 1.5]) {
    track.rect = {left: 0, top: 100, width: 28 * k, height: 200 * k};
    const y = 100 + 200 * k * (1 - 1000 / total);
    sent.length = 0;
    track.dispatch('pointerdown', {clientX: 14 * k, clientY: y});
    track.dispatch('pointerup', {clientX: 14 * k, clientY: y});
    assert.deepEqual(sent, [{type: 'basePoint', station: 'coal', mw: 1000}], '×' + k + ' (coal ' + coal.basePointMW + ' MW)');
  }
  // the Live Stack: the screen box over its own (the desk's slot at 1.5×) sizes the backing store; out of the desk, 1
  const sd = makeDocument(), sr = sd.createElement('div');
  sd.body.appendChild(sr);
  const stack = createLiveStack(sd, sr, {input: () => '', ui() {}}), cv = stack.el.querySelector('canvas');
  stack.el.clientWidth = 336; stack.el.clientHeight = 164;
  stack.el.rect = {left: 0, top: 0, width: 504, height: 246};
  cv.rect = stack.el.rect;
  assert.equal(screenScale(stack.el), 1.5);
  stack.update(vm);
  assert.deepEqual([cv.width, cv.height], [504, 246], 'sharp at 1.5×');
  stack.el.rect = {left: 0, top: 0, width: 336, height: 164};
  stack.update(Object.assign({}, vm, {frame: {nowMs: 1200, dtS: 1 / 60, alpha: 0}}));
  assert.deepEqual([cv.width, cv.height], [336, 164], 'a new scale redraws at once');
  stack.el.rect = {left: 0, top: 0, width: 20, height: 20};
  assert.equal(screenScale(stack.el), 1, 'a box drawn smaller than its own is no scale of the desk\'s');
});

// ---------------------------------------------------------------- names and colour

test('W6 a11y: the Live Stack\'s L button is named for what it does, its key first; the name stays as it expands', () => {
  const doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  const stack = createLiveStack(doc, root, {input: () => '', ui() {}}), btn = stack.el.querySelector('button.livestack-expand');
  assert.equal(btn.textContent, 'L');
  assert.equal(btn.getAttribute('aria-label'), EXPAND_NAME);
  assert.ok(EXPAND_NAME.startsWith('L: ') && /Live Stack/.test(EXPAND_NAME), 'WCAG 2.5.3: the face\'s word first');
  assert.equal(btn.getAttribute('aria-keyshortcuts'), 'L');
  const vm = baseVm(observe(createState(1, CLASSIC)), {stackExpanded: true});
  stack.update(vm);
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  assert.equal(btn.getAttribute('aria-label'), EXPAND_NAME, 'the state is aria-pressed\'s, the name stays');
});

/** WCAG 2.x contrast of two #rrggbb colours (an #rrggbbaa is laid over `under` first). */
function rgb(hex, under = '#0d1117') {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const c = p(hex), a = hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1, u = p(under);
  return c.map((v, i) => v * a + u[i] * (1 - a));
}
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tokens = src => Object.fromEntries([...src.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6,8})/gi)].map(m => [m[1], m[2]]));

test('W6 a11y: the end card\'s hour strip is never colour alone: green solid, red hatched, blue dotted, in its legend and its image\'s name', () => {
  const doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  const a = allIn({costDollars: 4e6, servedMWh: 1.1e5, lightsMWh: 0, co2tPerMWh: 0.55, co2t: 6e4, centsPerKWh: 3.6, saidiMin: 0, saifi: 0}, 1.9e6);
  const strip = ['g', 'g', 'b', 'b', 'b', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'r', 'r', 'g', 'b', 'g', 'g', 'g', 'g', '', '', ''];
  createEndCard(doc, root, {}, {par: () => null, households: () => 1.9e6, log: () => ({}), again() {}, toggleHelp() {}, toast() {}})
    .update({obs: {s: V.DAY_S}, end: {seed: 1, black: false, perfect: false, allIn: a, parAllIn: a, v: 'x', inputs: 0, hash: 0, share: null,
      verdict: {lights: '', cost: '', carbon: '', moment: null, card: null, strip, demand: {text: ''}, trips: ''}}});
  const st = doc.getElementById('end-strip');
  assert.equal(st.getAttribute('role'), 'img');
  assert.equal(st.getAttribute('aria-label'), 'Your day by the hour: short 17:00–19:00; spill 06:00–09:00, 20:00–21:00; not played 01:00–04:00; ' +
    'no gap in the other hours.');
  assert.equal(stripText(strip.map(() => 'g')), 'Your day by the hour: no gap in any hour.');
  // no hour without a gap (a day gone black at 04:38: the rest not played) claims none; a run of every column is all day
  assert.equal(stripText(['b', ...strip.slice(1).map(() => '')]), 'Your day by the hour: spill 04:00–05:00; not played 05:00–04:00.');
  assert.equal(stripText(strip.map(() => 'b')), 'Your day by the hour: spill all day.');
  assert.equal(stripText(strip.map((c, h) => (h < 12 ? 'r' : 'g'))), 'Your day by the hour: short 04:00–16:00; no gap in the other hours.');
  // the columns' titles keep their words
  assert.deepEqual([0, 2, 13, 23].map(h => st.children[h].title), ['04:00: no gap', '06:00: spill', '17:00: short', '03:00: not played']);
  assert.deepEqual([0, 2, 13, 23].map(h => st.children[h].className), ['s-g', 's-b', 's-r', 's-n']);
  // a pattern for each, seen in greyscale: solid, stripes of two lightnesses, dots on a dark ground; the legend names them
  const css = doc.querySelectorAll('style').map(s => s.textContent).join('');
  const fill = c => new RegExp('#end-strip \\.s-' + c + '\\{background:([^}]+)\\}').exec(css)[1];
  assert.match(fill('g'), /^#[0-9a-f]{6}$/);
  const [r1, r2] = /repeating-linear-gradient\(135deg,(#\w{6}) 0 3px,(#\w{6}) 3px 5px\)/.exec(fill('r')).slice(1);
  const [b1, b2] = /radial-gradient\(circle,(#\w{6}) [\d.]+px,(#\w{6}) [\d.]+px\) 0 0\/4px 4px/.exec(fill('b')).slice(1);
  assert.ok(contrast(rgb(r1), rgb(r2)) >= 3 && contrast(rgb(b1), rgb(b2)) >= 3, 'the stripes and the dots show in greyscale');
  assert.equal(STRIP_WORDS, 'green: no gap · red, hatched: short (homes of yours dark) · blue, dotted: wind or solar spilled');
  assert.ok(root.querySelectorAll('p').some(p => p.textContent === STRIP_WORDS));
});

test('W6 a11y: quiet and flashing alarm tiles keep 4.5:1: the desk\'s faint words, the flash\'s two phases, the alarm panel\'s quiet tiles', () => {
  const dk = tokens(ruleOf(CSS, '\\.dk, \\.dk-vars')), page = tokens(NEXT);
  // --dk-faint carries words (a quiet tile, an empty list, an off lamp): on the tile's ground and on every panel
  for (const bg of ['#0d1117', dk['--dk-panel'], dk['--dk-panel2']]) assert.ok(contrast(rgb(dk['--dk-faint']), rgb(bg)) >= 4.5, '--dk-faint on ' + bg);
  assert.match(ruleOf(CSS, '\\.dk-tile'), /background: #0d1117; color: var\(--dk-faint\);/);
  // the flash moves the fill between --dk-hi and --dk-lo (and the edge, where a state gives one), never the words; each phase
  // and the steady face keep 4.5:1
  assert.match(CSS, /@keyframes dk-flash \{\s*0% \{ background-color: var\(--dk-hi\); border-color: var\(--dk-hi-edge, var\(--dk-line\)\); \}\s*100% \{ background-color: var\(--dk-lo\); border-color: var\(--dk-lo-edge, var\(--dk-line\)\); \} \}/);
  assert.doesNotMatch(CSS, /filter: brightness/);
  for (const [sel, ink] of [['\\.dk-tile\\.s-alarm', '--dk-bright'], ['\\.dk-tile\\.s-alarm\\.p3', '--dk-bright'], ['\\.dk-tile\\.s-cleared', '--dk-text']]) {
    const body = ruleOf(CSS, sel), steady = /background: (#\w+);/.exec(body), hi = /--dk-hi: (#\w+)/.exec(body)[1], lo = /--dk-lo: (#\w+)/.exec(body)[1];
    for (const c of [hi, lo, ...(steady ? [steady[1]] : [])]) {
      assert.ok(contrast(rgb(dk[ink]), rgb(c)) >= 4.5, sel + ' on ' + c + ': ' + contrast(rgb(dk[ink]), rgb(c)).toFixed(2));
    }
    // ...and it shows: the two phases differ by 2.5:1 or more (the red's; a near-black pulse is missed at the plan bar's end)
    assert.ok(contrast(rgb(hi), rgb(lo)) >= 2.5, sel + ' flashes ' + hi + ' / ' + lo + ': ' + contrast(rgb(hi), rgb(lo)).toFixed(2));
  }
  // the ring-back (cleared, not ACKed: often the panel's only motion) flashes its amber edge too; steady, the edge stays amber
  const cl = ruleOf(CSS, '\\.dk-tile\\.s-cleared'), edge = p => dk[new RegExp(p + ': var\\((--[\\w-]+)\\)').exec(cl)[1]];
  assert.ok(contrast(rgb(edge('--dk-hi-edge')), rgb(edge('--dk-lo-edge'))) >= 4.5 && edge('--dk-hi-edge') === dk['--dk-amber'], 'the edge: amber, then the panel\'s line');
  assert.match(cl, /border-color: var\(--dk-amber\);/);
  // the balance bar's letters on its red and blue
  assert.match(ruleOf(CSS, '\\.dk-seg'), /color: #000;/);
  for (const c of ['#da3633', dk['--dk-blue']]) assert.ok(contrast([0, 0, 0], rgb(c)) >= 4.5, 'GAP on ' + c);
  // the alarm panel: a quiet tile is darker and plain, never faded (opacity dimmed its words to 2.5:1)
  const doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  createAlarmPanel(doc, root, {ui: () => ''});
  const ap = doc.getElementById('ap-css').textContent;
  assert.doesNotMatch(ap, /opacity/);
  assert.match(ap, /\.ap-t\.s-normal\{background:var\(--panel\);border-color:var\(--line\)\}/);
  assert.match(ap, /\.ap-t\.s-normal \.ap-l\{color:var\(--text\)\}/);
  for (const ink of ['--text', '--dim']) assert.ok(contrast(rgb(page[ink]), rgb(page['--panel'])) >= 4.5, ink + ' on a quiet tile');
});
