// desk/annunciator.js: the K-8 annunciator view (desk/README.md §6). 4×3 tiles from
// vm.alarms.tiles (app/alarms.js owns the model: states, flash, priorities); ACK and SILENCE;
// click or Enter on a tile focuses its target control. Presentation only: never a sim input.
// ACK and SILENCE work during the watch (K-15), like the tiles' focus jump.

import {el, setText, setAttr, setCls} from './util.js';

export const TILE_SLOTS = 12;
const STATE_GLYPH = {normal: '', alarm: '◆', ackd: '■', cleared: '◇'};
const STATE_WORD = {normal: 'normal', alarm: 'ALARM, not acknowledged', ackd: 'acknowledged', cleared: 'cleared, not acknowledged'};

export function createAnnunciator(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-panel dk-annun');
  box.id = 'annunciator';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Annunciator');
  box.setAttribute('tabindex', '-1');
  const grid = el(doc, 'div', 'dk-tiles');
  const side = el(doc, 'div', 'dk-annun-side');
  const ack = el(doc, 'button', 'dk-btn dk-ack', 'ACK');
  ack.id = 'btn-ack'; ack.type = 'button';
  ack.setAttribute('aria-label', 'Acknowledge alarms (A)');
  const sil = el(doc, 'button', 'dk-btn dk-silence', 'SIL');
  sil.id = 'btn-silence'; sil.type = 'button';
  sil.setAttribute('aria-label', 'Silence the horn (Shift+A)');
  ack.addEventListener('click', () => ctx.ui({do: 'ack'}));
  sil.addEventListener('click', () => ctx.ui({do: 'silence'}));
  side.append(ack, sil);
  box.append(grid, side);
  parent.appendChild(box);

  let key = '', tiles = [];
  function build(list) {
    grid.replaceChildren();
    tiles = [];
    for (let i = 0; i < TILE_SLOTS; i++) {
      const t = list[i];
      const b = el(doc, 'button', 'dk-tile');
      b.type = 'button';
      const g = el(doc, 'span', 'dk-tile-glyph'), l = el(doc, 'span', 'dk-tile-label');
      b.append(g, l);
      if (t) {
        b.id = 'tile-' + t.id;
        b.dataset.target = t.target || '';
        b.addEventListener('click', () => { if (b.dataset.target) ctx.ui({do: 'focus', target: b.dataset.target}); });
      } else {
        b.classList.add('empty');
        b.setAttribute('aria-hidden', 'true');
        b.tabIndex = -1;
      }
      grid.appendChild(b);
      tiles.push({b, g, l});
    }
  }
  return {
    el: box,
    update(vm) {
      const list = (vm.alarms && vm.alarms.tiles) || [];
      const k = list.map(t => t.id).join('|');
      if (k !== key) { key = k; build(list); }
      for (let i = 0; i < tiles.length; i++) {
        const t = list[i], T = tiles[i];
        if (!t) continue;
        T.b.dataset.target = t.target || '';
        setAttr(T.b, 'class', 'dk-tile s-' + t.state + (t.flash ? ' flash-' + t.flash : '') + (t.prio ? ' ' + String(t.prio).toLowerCase() : ''));
        setText(T.g, t.glyph || STATE_GLYPH[t.state] || '');
        setText(T.l, t.label);
        setAttr(T.b, 'aria-label', t.label + ': ' + (STATE_WORD[t.state] || t.state) + (t.prio ? ', ' + t.prio : '') + '. Enter: go to its control.');
      }
      const unacked = list.some(t => t.state === 'alarm' || t.state === 'cleared');
      setCls(ack, 'lit', unacked);
      setCls(sil, 'lit', !!(vm.alarms && vm.alarms.sounding));
      setText(sil, vm.alarms && vm.alarms.sounding ? '♪ SIL' : 'SIL');
    },
  };
}
