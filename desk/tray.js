// desk/tray.js: the K-9 message tray view (desk/README.md §6). At most 3 cards from
// vm.tray.cards (app/tray.js owns the model), each with one button that only focuses a control
// (actions.ui({do:'focus'})): a tray button never dispatches (K-9). LOG shows the rest.

import {el, setText, setAttr, setCls, setHidden, clockOf} from './util.js';

export const TRAY_CARDS = 3;
const SEV_GLYPH = {info: 'i', good: '✓', warn: '!', crit: '✕'};

export function createTray(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-panel dk-tray');
  box.id = 'tray';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Message tray');
  box.setAttribute('tabindex', '-1');
  const head = el(doc, 'div', 'dk-tray-head');
  const title = el(doc, 'span', 'dk-title', 'MESSAGES');
  const logBtn = el(doc, 'button', 'dk-btn dk-logbtn', 'LOG');
  logBtn.id = 'btn-log'; logBtn.type = 'button';
  logBtn.setAttribute('aria-pressed', 'false');
  head.append(title, logBtn);
  const cards = el(doc, 'div', 'dk-cards');
  const log = el(doc, 'div', 'dk-log');
  log.hidden = true;
  box.append(head, cards, log);
  parent.appendChild(box);
  let showLog = false, key = '', logKey = '', vm = null;
  logBtn.addEventListener('click', () => { showLog = !showLog; render(); });

  function build(list) {
    cards.replaceChildren();
    for (const c of list.slice(0, TRAY_CARDS)) {
      const card = el(doc, 'div', 'dk-card sev-' + (c.sev || 'info'));
      card.dataset.card = c.id;
      const meta = el(doc, 'div', 'dk-card-meta');
      meta.append(el(doc, 'span', 'dk-card-glyph', SEV_GLYPH[c.sev] || 'i'), el(doc, 'span', 'dk-card-from', c.from || ''),
        el(doc, 'span', 'dk-card-time', c.atS >= 0 ? clockOf(c.atS) : ''));
      const text = el(doc, 'div', 'dk-card-text', c.text || '');
      card.append(meta, text);
      if (c.button && c.button.target) {
        const b = el(doc, 'button', 'dk-btn dk-card-btn', c.button.label || 'SHOW');
        b.type = 'button';
        b.dataset.target = c.button.target;
        // Presentation only: the button focuses (and lights) a control; it never sends an input.
        b.addEventListener('click', () => { if (!ctx.locked()) ctx.ui({do: 'focus', target: b.dataset.target}); });
        card.appendChild(b);
      }
      cards.appendChild(card);
    }
    if (!list.length) cards.appendChild(el(doc, 'div', 'dk-empty', 'No messages.'));
  }
  function render() {
    if (!vm) return;
    const list = (vm.tray && vm.tray.cards) || [];
    const k = list.map(c => c.id + ':' + (c.text || '').length).join('|');
    if (k !== key) { key = k; build(list); }
    for (const b of cards.querySelectorAll('button')) setAttr(b, 'aria-disabled', ctx.locked() ? 'true' : 'false');
    setHidden(log, !showLog);
    setHidden(cards, showLog);
    setAttr(logBtn, 'aria-pressed', showLog ? 'true' : 'false');
    setCls(logBtn, 'on', showLog);
    if (showLog) {
      const entries = (vm.tray && vm.tray.log) || [];
      const lk = String(entries.length);
      if (lk !== logKey) {
        logKey = lk;
        log.replaceChildren();
        for (const e of entries.slice(-50).reverse()) {
          const row = el(doc, 'div', 'dk-log-row');
          const t = typeof e === 'string' ? e : (e.atS >= 0 ? clockOf(e.atS) + ' ' : '') + (e.from ? e.from + ': ' : '') + (e.text || '');
          setText(row, t);
          log.appendChild(row);
        }
        if (!entries.length) log.appendChild(el(doc, 'div', 'dk-empty', 'Log empty.'));
      }
    }
  }
  return {el: box, update(v) { vm = v; render(); }};
}
