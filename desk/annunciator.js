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
/** What each tile means and what answers it, shown when the tile is pressed (one sentence each). */
export const TILE_HELP = Object.freeze({
  underFreq: 'UNDER FREQ: demand is beating supply and the grid is slowing. More power: start a unit, or call DR.',
  overFreq: 'OVER FREQ: supply is beating demand. Less power: stop a unit, or charge the battery.',
  n1: 'N-1 INSECURE: losing your biggest unit would not be caught. More spare: start a gas turbine or raise the battery GUARD.',
  rocof: 'HIGH RoCoF: frequency is moving fast because little heavy plant is spinning. Keep more big machines on.',
  unitTrip: 'UNIT TRIP: a machine has dropped off. Replace its output: the objective line names the quickest unit.',
  linkTrip: 'LINK TRIP: the tie line to the neighbour is out. Replace its import with your own plant.',
  ufls: 'UFLS OPERATED: relays cut districts to save the grid. Restore them from the bay (R) once there is spare.',
  agcLimit: 'AGC LIMIT: the running units have no room left to follow demand. Commit another unit.',
  storageLow: 'STORAGE LOW: the hydro water or the battery is nearly spent. Do not count on it for the peak.',
  minGen: 'MIN GEN: running units cannot go low enough. Stop one, or charge the battery.',
  weather: 'WEATHER: the bureau has issued a warning. Read the message tray (M).',
  peak: 'PEAK: it is the evening peak and you are not secure. Every spare unit should be on.',
});
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
  let unackedNow = false;
  const doAck = () => {
    ctx.cue('button', PAN.panel);
    // ACK is not a switch: it marks flashing tiles as seen. With none flashing, say so.
    if (!unackedNow) ctx.note(box, 'Nothing to acknowledge: ACK marks flashing alarms as seen.');
    ctx.ui({do: 'ack'});
  };
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
        b.addEventListener('click', () => { if (b.dataset.target) { ctx.cue('button', PAN.panel); ctx.ui({do: 'focus', target: b.dataset.target}); }
          const st = b.dataset.state || 'normal';
          ctx.note(box, (TILE_HELP[t.id] || t.label) + (st === 'normal' ? ' Not in alarm now.' : ''), 6000); });
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
        T.b.dataset.target = t.target || ''; T.b.dataset.state = t.state;
        const esc = t.escalated === true && t.state !== 'normal';
        setAttr(T.b, 'class', 'dk-tile s-' + t.state + (t.flash ? ' flash-' + t.flash : '') + (t.prio ? ' ' + String(t.prio).toLowerCase() : '') +
          (esc ? ' esc' : ''));
        setText(T.g, (esc ? ESCALATED_GLYPH : '') + (t.glyph || STATE_GLYPH[t.state] || ''));
        setText(T.l, t.label);
        setAttr(T.b, 'aria-label', t.label + ': ' + (STATE_WORD[t.state] || t.state) + (t.prio ? ', ' + t.prio : '') +
          (esc ? ', escalated' : '') + '. Enter: go to its control.');
      }
      const unacked = list.some(t => t.state === 'alarm' || t.state === 'cleared');
      unackedNow = unacked;
      setCls(ack, 'lit', unacked);
      setText(ack, unacked ? '◆ ACK' : 'ACK');
      setCls(sil, 'lit', !!(vm.alarms && vm.alarms.sounding));
      setText(sil, vm.alarms && vm.alarms.sounding ? '♪ SIL' : 'SIL');
    },
    /** A / Shift+A from the desk's key map: the same press as the buttons. */
    ack: doAck, silence: doSilence,
  };
}
