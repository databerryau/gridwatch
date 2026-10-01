// desk/annunciator.js: the K-8 annunciator view (desk/README.md §6). 4×3 tiles from
// vm.alarms.tiles (app/alarms.js owns the model: states, flash, priorities); ACK and SILENCE;
// click or Enter on a tile focuses its target control. Presentation only: never a sim input.
// ACK and SILENCE work during the watch (K-15), like the tiles' focus jump.
//
// ISA-18.1 sequence R, visual only (§11 B-2): alarm = fast flash (2.5 Hz), ACK = steady, cleared
// before ACK = slow flash (0.8 Hz) until ACK, cleared after ACK = dark. Reduced motion: 1 Hz and
// steady (desk.css). Each state has its own glyph (◆ ■ ◇), so the flash and the colour are never
// the only sign (K-22); an escalated tile (B-1: a P2 tile showing as P1) adds ‼ and a double border.

import {el, setText, setAttr, setCls, PAN} from './util.js';

export const TILE_SLOTS = 12;
const STATE_GLYPH = {normal: '', alarm: '◆', ackd: '■', cleared: '◇'};
const STATE_WORD = {normal: 'normal', alarm: 'ALARM, not acknowledged', ackd: 'acknowledged', cleared: 'cleared, not acknowledged'};
export const ESCALATED_GLYPH = '‼';

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
  ack.setAttribute('aria-keyshortcuts', 'A');
  const sil = el(doc, 'button', 'dk-btn dk-silence', 'SIL');
  sil.id = 'btn-silence'; sil.type = 'button';
  sil.setAttribute('aria-label', 'Silence the horn (Shift+A)');
  sil.setAttribute('aria-keyshortcuts', 'Shift+A');
  const doAck = () => { ctx.cue('button', PAN.panel); ctx.ui({do: 'ack'}); };
  const doSilence = () => { ctx.cue('button', PAN.panel); ctx.ui({do: 'silence'}); };
  ack.addEventListener('click', doAck);
  sil.addEventListener('click', doSilence);
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
        b.addEventListener('click', () => { if (b.dataset.target) { ctx.cue('button', PAN.panel); ctx.ui({do: 'focus', target: b.dataset.target}); } });
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
        const esc = t.escalated === true && t.state !== 'normal';
        setAttr(T.b, 'class', 'dk-tile s-' + t.state + (t.flash ? ' flash-' + t.flash : '') + (t.prio ? ' ' + String(t.prio).toLowerCase() : '') +
          (esc ? ' esc' : ''));
        setText(T.g, (esc ? ESCALATED_GLYPH : '') + (t.glyph || STATE_GLYPH[t.state] || ''));
        setText(T.l, t.label);
        setAttr(T.b, 'aria-label', t.label + ': ' + (STATE_WORD[t.state] || t.state) + (t.prio ? ', ' + t.prio : '') +
          (esc ? ', escalated' : '') + '. Enter: go to its control.');
      }
      const unacked = list.some(t => t.state === 'alarm' || t.state === 'cleared');
      setCls(ack, 'lit', unacked);
      setText(ack, unacked ? '◆ ACK' : 'ACK');
      setCls(sil, 'lit', !!(vm.alarms && vm.alarms.sounding));
      setText(sil, vm.alarms && vm.alarms.sounding ? '♪ SIL' : 'SIL');
    },
    /** A / Shift+A from the desk's key map: the same press as the buttons. */
    ack: doAck, silence: doSilence,
  };
}
