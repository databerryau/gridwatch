// desk/gauge.js: the K-10 N-1 gauge and TRIP PREVIEW (desk/README.md §6, A-2).
// "SPARE IN 5 MIN" (R5) against "BIGGEST RISK: <name>" (L), the H-4 word, and the TRIP PREVIEW
// for both credible contingencies (the largest unit and the tie import). Plain words on the face;
// R5, L and the LOR names sit behind "?". Colours by nadir: >= 49.5 green, 49.0-49.5 amber,
// < 49.0 red, always with a glyph.

import {V} from '../sim/params.js';
import {el, setText, setAttr, setCls, setStyle, setHidden, mw, hz2, fin, clamp, unitLabel, nadirClass, CLASS_GLYPH} from './util.js';

const LEVEL_GLYPH = {SECURE: '✓', TIGHT: '!', SHORT: '✕', SHEDDING: '✕✕'};
const HELP = 'SPARE IN 5 MIN is R5: headroom that can be delivered within 5 minutes. BIGGEST RISK is L: the largest ' +
  'credible contingency (the biggest unit online, or the tie import). SECURE needs R5 ≥ ' + V.SECURE_RATIO + ' × L and a TRIP ' +
  'PREVIEW nadir ≥ ' + V.SECURE_NADIR_HZ + ' Hz for both; TIGHT is LOR1-like, SHORT is LOR2-like (R5 < L), SHEDDING is LOR3.';
const CAUGHT_WORD = {inertiaMW: 'SPIN', batteryMW: 'BATT', guardMW: 'GUARD', governorsMW: 'GOV', loadReliefMW: 'RELIEF', uflsMW: 'UFLS'};

/** The caught MW of a preview result as short words, largest first. */
export function caughtText(caught) {
  if (!caught || typeof caught !== 'object') return '';
  return Object.entries(caught).filter(([, v]) => fin(v) >= 0.5)
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => (CAUGHT_WORD[k] || k.replace(/MW$/, '').toUpperCase()) + ' ' + mw(v)).join(' · ');
}

export function createGauge(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-panel dk-gauge');
  box.id = 'gauge-n1';
  box.setAttribute('role', 'group');
  box.setAttribute('tabindex', '0');
  const head = el(doc, 'div', 'dk-gauge-head');
  const word = el(doc, 'span', 'dk-level');
  const q = el(doc, 'button', 'dk-q', '?');
  q.type = 'button'; q.id = 'q-gauge';
  q.title = HELP;
  q.setAttribute('aria-label', 'What these words mean');
  q.addEventListener('click', () => ctx.note(box, HELP, 8000));
  head.append(word, q);
  const bar = (label) => {
    const row = el(doc, 'div', 'dk-gbar');
    const l = el(doc, 'span', 'dk-gbar-label', label), track = el(doc, 'span', 'dk-gbar-track'), fill = el(doc, 'i', 'dk-gbar-fill');
    const val = el(doc, 'span', 'dk-gbar-val');
    track.appendChild(fill);
    row.append(l, track, val);
    return {row, l, track, fill, val};
  };
  const r5 = bar('SPARE IN 5 MIN'), lb = bar('BIGGEST RISK');
  const secLine = el(doc, 'i', 'dk-gbar-mark');
  r5.track.appendChild(secLine);
  const prev = el(doc, 'div', 'dk-preview');
  const pbtn = el(doc, 'button', 'dk-btn dk-pbtn', 'T PREVIEW');
  pbtn.id = 'btn-preview'; pbtn.type = 'button';
  pbtn.setAttribute('aria-pressed', 'false');
  const ptext = el(doc, 'span', 'dk-ptext');
  prev.append(pbtn, ptext);
  const caught = el(doc, 'div', 'dk-caught');
  box.append(head, r5.row, lb.row, prev, caught);
  parent.appendChild(box);
  let vm = null, latched = false;
  // TRIP PREVIEW (K-10): T (shell), the button (latches) or hovering the gauge. Presentation only.
  pbtn.addEventListener('click', () => { latched = !(vm && vm.previewOn && latched); ctx.ui({do: 'preview', on: latched}); });
  box.addEventListener('pointerenter', () => { if (!latched) ctx.ui({do: 'preview', on: true}); });
  box.addEventListener('pointerleave', () => { if (!latched) ctx.ui({do: 'preview', on: false}); });

  return {
    el: box,
    /** @param {object} v vm; @param {object|null} pv the desk's live preview {nadirHz, caught, guardMW} or null */
    update(v, pv) {
      vm = v;
      const s = v.obs.sec;
      setText(word, (LEVEL_GLYPH[s.level] || '') + ' ' + s.level);
      setAttr(word, 'class', 'dk-level lv-' + s.level);
      const scale = Math.max(1, fin(s.r5MW), fin(s.lMW) * V.SECURE_RATIO) * 1.1;
      setStyle(r5.fill, 'width', (clamp(fin(s.r5MW) / scale, 0, 1) * 100).toFixed(1) + '%');
      setStyle(lb.fill, 'width', (clamp(fin(s.lMW) / scale, 0, 1) * 100).toFixed(1) + '%');
      setStyle(secLine, 'left', (clamp(fin(s.lMW) * V.SECURE_RATIO / scale, 0, 1) * 100).toFixed(1) + '%');
      setText(r5.val, mw(s.r5MW));
      setText(lb.l, 'RISK: ' + (s.lKind === 'none' ? 'none' : unitLabel(s.lId)));
      setText(lb.val, mw(s.lMW));
      setCls(r5.row, 'short', fin(s.r5MW) < fin(s.lMW));
      // The preview: the live one while T / the ring is turning, else the sim's cached one.
      const live = pv && Number.isFinite(pv.nadirHz);
      const nadir = live ? pv.nadirHz : fin(s.previewNadirHz, 50);
      const cls = s.lKind === 'none' ? 'good' : nadirClass(nadir);
      const uHz = fin(s.previewUnitHz, nadir), kHz = fin(s.previewLinkHz, 50);
      setText(ptext, s.lKind === 'none' ? 'no credible risk' :
        CLASS_GLYPH[cls] + ' ' + hz2(nadir) + ' Hz' + (live ? (pv.guardMW !== undefined && pv.guardMW !== null ? ' @ GUARD ' + mw(pv.guardMW) : ' now') :
          ' · U ' + hz2(uHz) + ' L ' + hz2(kHz)));
      setAttr(ptext, 'class', 'dk-ptext ' + cls);
      setAttr(ptext, 'title', 'TRIP PREVIEW: where frequency would bottom out if ' + (s.lKind === 'none' ? 'nothing' : unitLabel(s.lId)) +
        ' tripped now. Unit ' + hz2(uHz) + ' Hz, tie ' + hz2(kHz) + ' Hz. Green ≥ ' + V.SECURE_NADIR_HZ + ', amber to ' +
        V.UFLS_FIRST_HZ + ', red: UFLS would operate.');
      setHidden(caught, !live);
      if (live) setText(caught, caughtText(pv.caught) || '—');
      setAttr(pbtn, 'aria-pressed', v.previewOn ? 'true' : 'false');
      setCls(pbtn, 'on', !!v.previewOn);
      setAttr(box, 'aria-label', 'N-1 gauge: ' + s.level + '. Spare in 5 minutes ' + mw(s.r5MW) + ' MW, biggest risk ' +
        (s.lKind === 'none' ? 'none' : unitLabel(s.lId) + ' ' + mw(s.lMW) + ' MW') + '. Trip preview ' + hz2(nadir) + ' Hz.');
      setCls(box, 'glow', !!(v.glow && v.glow.has('gauge-n1')));
    },
  };
}
