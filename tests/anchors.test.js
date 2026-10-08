// Q-44 (desk/README.md §30.3.1): the help texts (content/text.js) and the alarm panel
// (app/alarmpanel.js) load on demand. The "?" badges' eager index, content/anchors.js, says exactly
// what content/text.js gives, so the shell places and titles the badges before the texts have
// loaded; the drawer says "Loading…" and a popover shows its row titles until they arrive, then
// whatever is open is redrawn; a failed load says so. (tests/budget.test.js keeps them out of the
// first visit.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ANCHORS} from '../content/anchors.js';
import {TEXT} from '../content/text.js';
import * as alarmPanel from '../app/alarmpanel.js';
import {bootGame} from '../app/shell.js';
import {makeDocument} from './lib/dom.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 0));

test('Q-44: content/anchors.js equals the game anchors and row titles of TEXT.abstractions, in order', () => {
  const want = [];
  for (const e of TEXT.abstractions) {
    if (!e.game || e.game === 'drawer') continue;
    let a = want.find(x => x.game === e.game);
    if (!a) want.push(a = {game: e.game, rows: []});
    a.rows.push(e.row);
  }
  assert.deepEqual(ANCHORS.map(a => ({game: a.game, rows: [...a.rows]})), want,
    'content/anchors.js and content/text.js disagree: append the new anchored entry to content/anchors.js');
  // A row title names one entry (the popover finds a row's text by its title).
  const rows = TEXT.abstractions.map(e => e.row);
  assert.equal(new Set(rows).size, rows.length, 'row titles are unique');
  assert.ok(Object.isFrozen(ANCHORS) && ANCHORS.every(a => Object.isFrozen(a) && Object.isFrozen(a.rows)), 'frozen');
});

// The shell alone on next.html (no desk, map or stack: the header's own badges), with loaders.
function boot(o) {
  const doc = makeDocument(NEXT);
  const h = bootGame(doc, Object.assign({search: '?seed=7', storage: null, audioWin: {}, raf: false, now: () => 0}, o));
  h.frame(1 / 60);
  return {doc, h, $: id => doc.getElementById(id), q: id => doc.querySelectorAll('button.q').find(x => x.dataset.anchor === id)};
}

test('Q-44: the texts load on the first help: badges titled from ANCHORS at once, then Loading… and titles, then the texts; once', async () => {
  let loads = 0, release = null;
  const {h, $, q} = boot({text: () => { loads++; return new Promise(r => { release = () => r({TEXT}); }); }});
  const rows = ANCHORS.find(a => a.game === 'chip-cost').rows;
  assert.equal(q('chip-cost').title, rows.join(' · '), 'the badge is titled before any text loads');
  assert.equal(q('chip-cost').getAttribute('aria-label'), 'About: ' + rows.join('; '));
  assert.equal(loads, 0, 'nothing loads until a help opens');
  q('chip-cost').click();
  assert.equal($('popover').hidden, false);
  assert.equal($('popover').textContent, rows.join(''), 'the popover shows its row titles while the texts load');
  h.actions.ui({do: 'drawer'});
  assert.equal($('drawer').textContent, 'What GRIDWATCH simplifies, and whyLoading…');
  await tick();
  release();
  await tick();
  assert.equal(loads, 1, 'one load');
  assert.equal($('drawer').querySelectorAll('article').length, TEXT.abstractions.length, 'the open drawer is redrawn when they arrive');
  assert.match($('popover').textContent, /Real world: .*GRIDWATCH: .*Why: /s, 'and the open popover');
  assert.equal(h.loadText(), TEXT);
  h.actions.ui({do: 'drawer', on: false});
  h.actions.ui({do: 'drawer', on: true});
  assert.equal($('drawer').querySelectorAll('article').length, TEXT.abstractions.length);
});

test('Q-44: a failed load: the popover keeps its titles and the drawer says the texts could not be loaded', async () => {
  const {h, $, q} = boot({text: () => Promise.reject(new Error('offline'))});
  q('clock').click();
  h.actions.ui({do: 'drawer'});
  await tick();
  assert.equal($('popover').textContent, ANCHORS.find(a => a.game === 'clock').rows.join(''));
  assert.match($('drawer').textContent, /could not be loaded/);
  assert.equal(h.loadText(), null);
  assert.deepEqual(h.mods.errors, ['text: offline']);
});

test('Q-44 / Q-46: the alarm panel loads on its first open (Loading… meanwhile), then mounts, shows and takes the focus', async () => {
  let loads = 0;
  const {h, $, doc} = boot({alarmPanel: () => { loads++; return Promise.resolve(alarmPanel); }});
  assert.equal(loads, 0);
  h.actions.ui({do: 'alarms'});
  h.frame(1 / 60);
  assert.equal($('alarm-panel').hidden, false);
  assert.equal($('alarm-panel').textContent, 'Loading…');
  await tick();
  h.frame(1 / 60);
  assert.ok($('btn-alarms-close'), 'mounted');
  assert.equal(doc.activeElement.id, 'btn-alarms-close');
  $('btn-alarms-close').click();
  h.frame(1 / 60);
  assert.equal($('alarm-panel').hidden, true);
  h.actions.ui({do: 'alarms'});
  h.frame(1 / 60);
  assert.equal(loads, 1, 'mounted once');
});
