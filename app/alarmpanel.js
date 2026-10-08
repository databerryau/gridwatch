// app/alarmpanel.js: the alarm panel (SPEC §9.1 Q-46, desk/README.md §30.6). EXPLAIN (or W, or a
// second press on a tile) pops the alarms out into a large panel over the desk while the clock is
// held; for each alarm it shows its state and a live number, what to do (GO TO), what it means,
// why it happens and what the real grid does. Loaded on demand (Q-44): the shell imports it on
// the first open and mounts it into #alarm-panel; it may import content/alarmhelp.js and the
// desk's and render/format.js helpers, and injects its own <style> once.
//
// STAGE A STUB (base): the shape the shell mounts and the one control every panel keeps, CLOSE.
// W3 (panel) fills it. Focus is moved by the shell (desk/README.md §30.3.4): focus() is called
// once, on the frame the panel first shows; update(vm) never moves it.

// (W3 draws the selected alarm's entry from it; the stub only loads it with the panel.)
// eslint-disable-next-line no-unused-vars
import {ALARM_HELP} from '../content/alarmhelp.js';

/**
 * @param {Document} doc
 * @param {Element} root #alarm-panel
 * @param {{ui:function(object):string}} actions the shell's actions (presentation only: no button
 *   in the panel sends a sim input)
 * @returns {{update(vm:object):void, focus():void, el:Element}}
 */
export function createAlarmPanel(doc, root, actions) {
  const el = doc.createElement('div');
  el.className = 'ap';
  const close = doc.createElement('button');
  close.id = 'btn-alarms-close';
  close.type = 'button';
  close.textContent = '✕ CLOSE';
  close.title = 'Close (Esc or W): the clock runs as it was';
  close.addEventListener('click', () => actions.ui({do: 'alarms', on: false}));
  el.appendChild(close);
  root.appendChild(el);
  return {
    el,
    update(vm) {},
    focus() { close.focus(); },
  };
}
