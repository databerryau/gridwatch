// desk/gauge.js: the K-10 N-1 gauge and TRIP PREVIEW (desk/README.md §6, A-2).
// "SPARE IN 5 MIN" (R5) against "BIGGEST RISK: <name>" (L), the H-4 word, and the TRIP PREVIEW
// for both credible contingencies (the largest unit and the tie import). Plain words on the face;
// R5, L and the LOR names sit behind "?". Colours by nadir: >= 49.55 green, 49.0-49.55 amber,
// < 49.0 red, always with a glyph. The bars are told apart without colour too (K-22): SPARE is a
// solid fill and carries the level's glyph on its number (✓ covers 1.25 × the risk, ! covers the
// risk, ✕ short: cross-hatched), RISK is a hatched fill.
//
// W7 Q2, TRIP SHEDS: the desk's fifth word (desk/calc.js n1Word; the sim keeps its four). While the sim
// says TIGHT and its preview is below the first UFLS stage (49.0 Hz) the head reads ▼ TRIP SHEDS in red,
// with a minimum time on and off (SHEDS_MIN_MS real ms, whatever the preview says: it lands either side of
// the edge from one refresh to the next for grid minutes), and the caught line's place says what it would cost ("48.99 Hz: the
// relays would shed 2 districts", calc.js shedsLine; the title and the aria label say it whole, with "would
// fall to"). Below 49.0 Hz the preview's figures are rounded down, as under the SECURE line. The live
// preview's caught line and the COVER row win the caught line's place.
//
// 2c, the COVER row (Q-74), in the caught line's place (while it shows, the live preview's caught
// words move into the preview's title). It shows while frequency is outside 49.85-50.15 Hz
// (fos.outsideS > 0), for BAND_OK_MS (3 real s) after it returns, while obs.inRespond, and while
// the latest contingency is past its watch and still uncovered (securedTick < 0); never in the night
// roll (obs.nightShift, Q-73: a contingency there is logged only). In that order:
//   BAND LOW / BAND HIGH n   fos.countdownS, the bar draining over FOS_RECOVER_S (amber)
//   BAND LOW ✕ n OVER        fos.countdownS at 0: n = outsideS - FOS_RECOVER_S (amber; directed shedding runs)
//   BAND ✓                   the 3 real s after a return seen fresh (green; the gauge's previous update
//                            under 1 real s before and the same day, so never across a jump or after
//                            PLAY THIS DAY AGAIN), never beside a SHORT or SHEDDING head
//   COVER n                  to secureByTick, the bar draining over SECURE_AGAIN_S (plain)
//   COVER ✓ T+n              covered (securedTick) inside the window (green)
//   COVER LOST               covered, and the level is SHORT or SHEDDING inside the window (amber)
//   COVER ✕ n OVER           past secureByTick uncovered (amber), titled COVER_OVER_TITLE
// The figure n is m:ss at 10× or slower (the watch's slow part, the card, FOCUS, PAUSE) and whole
// minutes rounded up above it ("n MIN"), as the dial's readouts; a new figure for the same word is
// drawn at most every FIGURE_MS (500 real ms), a new word at once; the gauge's aria label (the
// group that takes the focus) ends with the row in m:ss, and the overdue title. The "?" adds COVER's
// and BAND's sentence. Real ms are the frame's (vm.frame.nowMs).

import {V} from '../sim/params.js';
import {el, setText, setAttr, setCls, setStyle, setHidden, mw, hz2, fin, clamp, mmss, unitLabel, nadirClass, CLASS_GLYPH, PAN} from './util.js';
import {n1Word, shedsLine} from './calc.js';

// W7 Q2: TRIP SHEDS (desk/calc.js n1Word) is the desk's fifth word, red, with its own glyph
export const LEVEL_GLYPH = Object.freeze({SECURE: '✓', TIGHT: '!', 'TRIP SHEDS': '▼', SHORT: '✕', SHEDDING: '✕✕'});
export const SECURE_LINE_HZ = V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ;   // H-4: what SECURE needs of a fresh preview
const HELP = 'SPARE IN 5 MIN is R5: headroom that can be delivered within 5 minutes. BIGGEST RISK is L: the largest ' +
  'credible contingency (the biggest unit online, or the tie import). SECURE needs R5 ≥ ' + V.SECURE_RATIO + ' × L and a TRIP ' +
  'PREVIEW nadir ≥ ' + hz2(SECURE_LINE_HZ) + ' Hz for both; TIGHT is LOR1-like, SHORT is LOR2-like (R5 < L), SHEDDING is LOR3. ' +
  'TRIP SHEDS is TIGHT with the TRIP PREVIEW below ' + V.UFLS_FIRST_HZ.toFixed(1) + ' Hz: the spare is there, but frequency ' +
  'would fall faster than it arrives, and the relays would shed districts (GRIDWATCH\'s word, not AEMO\'s). ' +
  'After a trip, COVER counts ' + V.SECURE_AGAIN_S / 60 + ' min to R5 ≥ L with no district shed by relays or direction (GRIDWATCH\'s ' +
  'floor for secure again), and BAND the ' + V.FOS_RECOVER_S / 60 + ' min frequency may stay outside ' + V.NORMAL_LO_HZ + '–' + V.NORMAL_HI_HZ + ' Hz.';
// Q-74 (real ms)
export const COVER_OVER_TITLE = 'AEMO would direct a unit on or shed load here; GRIDWATCH only counts it';
export const BAND_OK_MS = 3000, FIGURE_MS = 500;
const figure = (s, rate) => (rate <= 10 ? mmss(s) : Math.ceil(s / 60) + ' MIN');
// inverterMW (Phase 2a, C-7): wind and solar inverters. Positive when a loss of supply began above
// 50.015 Hz and they gave back what the droop was holding; negative (not listed) for a loss of load.
const CAUGHT_WORD = {inertiaMW: 'SPIN', batteryMW: 'BATT', guardMW: 'GUARD', governorsMW: 'GOV', loadReliefMW: 'RELIEF', uflsMW: 'UFLS',
  inverterMW: 'INVERTERS'};

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
  q.setAttribute('aria-expanded', 'false');
  q.addEventListener('click', () => { ctx.cue('button', PAN.gauge); ctx.note(box, HELP, 8000, 'info', q); });
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
  pbtn.setAttribute('aria-keyshortcuts', 'T');
  pbtn.setAttribute('aria-label', 'TRIP PREVIEW: show where frequency would bottom out if the biggest risk tripped now (T)');
  const ptext = el(doc, 'span', 'dk-ptext');
  prev.append(pbtn, ptext);
  const caught = el(doc, 'div', 'dk-caught');
  const sheds = el(doc, 'div', 'dk-sheds');   // W7 Q2: what TRIP SHEDS would cost, in the caught line's place
  sheds.hidden = true;
  const cov = bar('');   // Q-74
  cov.row.className = 'dk-gbar dk-cover';
  cov.row.hidden = true;
  box.append(head, r5.row, lb.row, prev, caught, sheds, cov.row);
  parent.appendChild(box);
  let vm = null, latched = false, nowMs = 0, wasOut = false, okAt = -Infinity, lastMs = -Infinity, lastTick = -1, fig = {k: '', text: '', at: 0};
  const held = {};   // n1Word's TRIP SHEDS hold
  /** [word, class, s | null, before, after, bar, title] or null */
  function coverOf(o) {
    const c = o.contingency, f = o.fos, bad = o.sec.level === 'SHORT' || o.sec.level === 'SHEDDING', ts = t => t / V.TICKS_PER_S;
    const out = f.outsideS > 0, band = 'BAND ' + (o.f.hz < V.F0_HZ ? 'LOW' : 'HIGH');
    // a return seen fresh (§32.12)
    if (o.tick < lastTick) okAt = -Infinity;
    else if (wasOut && !out && nowMs - lastMs <= 1e3) okAt = nowMs;
    wasOut = out; lastTick = o.tick; lastMs = nowMs;
    if (o.nightShift) return null;   // (Q-73)
    if (out) return f.countdownS > 0 ? [band, 'warn', f.countdownS, '', '', f.countdownS / V.FOS_RECOVER_S] : [band + ' ✕', 'warn', f.outsideS - V.FOS_RECOVER_S, '', ' OVER', 0];
    if (!bad && nowMs - okAt < BAND_OK_MS) return ['BAND ✓', 'good', null, '', '', 1];
    if (!c || !(o.inRespond || o.tick >= c.watchEndTick && c.securedTick < 0)) return null;
    const left = ts(c.secureByTick - o.tick);
    if (c.securedTick >= 0) return bad ? ['COVER LOST', 'warn', null, '', '', 0] : ['COVER ✓', 'good', ts(c.securedTick - c.startTick), 'T+', '', 1];
    return left > 0 ? ['COVER', '', left, '', '', left / V.SECURE_AGAIN_S] : ['COVER ✕', 'warn', -left, '', ' OVER', 0, COVER_OVER_TITLE];
  }
  // TRIP PREVIEW (K-10): T (shell), the button (latches) or hovering the gauge. Presentation only.
  pbtn.addEventListener('click', () => { latched = !(vm && vm.previewOn && latched); ctx.cue('button', PAN.gauge); ctx.ui({do: 'preview', on: latched}); });
  box.addEventListener('pointerenter', () => { if (!latched) ctx.ui({do: 'preview', on: true}); });
  box.addEventListener('pointerleave', () => { if (!latched) ctx.ui({do: 'preview', on: false}); });

  return {
    el: box,
    /** @param {object} v vm; @param {object|null} pv the desk's live preview {nadirHz, caught, guardMW} or null */
    update(v, pv) {
      vm = v;
      nowMs = fin(v.frame && v.frame.nowMs, nowMs);
      const s = v.obs.sec, r = coverOf(v.obs);
      let say = '';
      setHidden(cov.row, !r);
      if (!r) fig.k = '';
      else {
        const [k, cls, secs, pre, post, full, title = ''] = r, at = f => (secs === null ? k : k + ' ' + pre + f(secs) + post);
        const text = at(x => figure(x, fin(v.mode && v.mode.rate, 1)));
        if (text !== fig.text && (k !== fig.k || nowMs - fig.at >= FIGURE_MS)) fig = {k, text, at: nowMs};
        say = at(mmss) + (title ? '. ' + title : '');
        setText(cov.l, fig.text);
        setAttr(cov.row, 'class', 'dk-gbar dk-cover ' + cls);
        setAttr(cov.row, 'title', title);
        setStyle(cov.fill, 'width', (clamp(full, 0, 1) * 100).toFixed(1) + '%');
      }
      const lv = n1Word(held, v.obs, nowMs), shedLine = lv === 'TRIP SHEDS' ? shedsLine(v.obs) : '';
      setText(word, (LEVEL_GLYPH[lv] || '') + ' ' + lv);
      setAttr(word, 'class', 'dk-level lv-' + lv.replace(' ', '-'));
      const scale = Math.max(1, fin(s.r5MW), fin(s.lMW) * V.SECURE_RATIO) * 1.1;
      setStyle(r5.fill, 'width', (clamp(fin(s.r5MW) / scale, 0, 1) * 100).toFixed(1) + '%');
      setStyle(lb.fill, 'width', (clamp(fin(s.lMW) / scale, 0, 1) * 100).toFixed(1) + '%');
      setStyle(secLine, 'left', (clamp(fin(s.lMW) * V.SECURE_RATIO / scale, 0, 1) * 100).toFixed(1) + '%');
      const cover = fin(s.r5MW) < fin(s.lMW) ? 'crit' : fin(s.r5MW) < fin(s.lMW) * V.SECURE_RATIO ? 'warn' : 'good';
      setText(r5.val, CLASS_GLYPH[cover] + mw(s.r5MW));
      setAttr(r5.row, 'data-cover', cover);
      setText(lb.l, 'RISK: ' + (s.lKind === 'none' ? 'none' : unitLabel(s.lId)));
      setText(lb.val, mw(s.lMW));
      setCls(r5.row, 'short', fin(s.r5MW) < fin(s.lMW));
      // The preview: the live one while T / the ring is turning, else the sim's cached one.
      const live = pv && Number.isFinite(pv.nadirHz);
      const nadir = live ? pv.nadirHz : fin(s.previewNadirHz, 50);
      // under the sim's SECURE line (H-4; higher for a cached preview, by its age at the second the sim last judged) but contained: amber
      const need = SECURE_LINE_HZ + (live ? 0 : V.PREVIEW_AGE_MARGIN_HZ_S * fin(Math.floor((v.obs.tick - 1) / V.TICKS_PER_S) - s.previewAtS));
      const needs = s.lKind !== 'none' && nadir >= V.SECURE_NADIR_HZ && nadir < need;
      // rounded down under a line (the SECURE line; the relays' 49.0 Hz, W7 Q2): it never reads as the line itself
      const relays = x => hz2(x < V.UFLS_FIRST_HZ ? Math.floor(x * 100) / 100 : x);
      const shown = needs ? hz2(Math.floor(nadir * 100) / 100) : relays(nadir);
      const cls = s.lKind === 'none' ? 'good' : needs ? 'warn' : nadirClass(nadir);
      const uHz = fin(s.previewUnitHz, nadir), kHz = fin(s.previewLinkHz, 50), line = hz2(Math.ceil(need * 100 - 1e-6) / 100);
      setText(ptext, s.lKind === 'none' ? 'no credible risk' : CLASS_GLYPH[cls] + ' ' + shown + (needs ? '<' + line : '') + ' Hz' +
        (live ? (pv.guardMW !== undefined && pv.guardMW !== null ? ' @ GUARD ' + mw(pv.guardMW) : ' now') : needs ? '' : ' · U ' + relays(uHz) + ' L ' + relays(kHz)));
      setAttr(ptext, 'class', 'dk-ptext ' + cls);
      setAttr(ptext, 'title', 'TRIP PREVIEW: where frequency would bottom out if ' + (s.lKind === 'none' ? 'nothing' : unitLabel(s.lId)) +
        ' tripped now. Unit ' + relays(uHz) + ' Hz, tie ' + relays(kHz) + ' Hz. Green ≥ ' + line + ', amber to ' +
        V.UFLS_FIRST_HZ + ', red: UFLS would operate.' + (live && r ? ' Caught by ' + (caughtText(pv.caught) || '—') + '.' : ''));
      setHidden(caught, !live || !!r);
      if (live) setText(caught, caughtText(pv.caught) || '—');
      // W7 Q2: the cost of TRIP SHEDS, where the caught line would be (the face drops 'would fall to': the preview says it)
      setHidden(sheds, !shedLine || live || !!r);
      setText(sheds, shedLine.replace(/^would fall to /, ''));
      setAttr(sheds, 'title', shedLine ? 'If ' + unitLabel(s.lId) + ' tripped now, frequency ' + shedLine + '.' : '');
      setAttr(pbtn, 'aria-pressed', v.previewOn ? 'true' : 'false');
      setCls(pbtn, 'on', !!v.previewOn);
      setText(pbtn, v.previewOn ? 'T PREVIEW ●' : 'T PREVIEW');
      setAttr(box, 'aria-label', 'N-1 gauge: ' + lv + (shedLine ? ': ' + shedLine : '') + '. Spare in 5 minutes ' + mw(s.r5MW) + ' MW, biggest risk ' +
        (s.lKind === 'none' ? 'none' : unitLabel(s.lId) + ' ' + mw(s.lMW) + ' MW') + '. Trip preview ' + shown + ' Hz' +
        (s.lKind === 'none' ? '' : cls === 'good' ? ', contained' : needs ? ', under the SECURE line, ' + line :
          cls === 'warn' ? ', below 49.5' : ', UFLS would operate') +
        (live && caughtText(pv.caught) ? '; caught by ' + caughtText(pv.caught) : '') + '.' + (say ? ' ' + say + '.' : ''));
      setCls(box, 'glow', !!(v.glow && v.glow.has('gauge-n1')));
    },
  };
}
