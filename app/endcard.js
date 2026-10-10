// app/endcard.js: the end card (Q-48; desk/README.md §30.7 "Face", §30.9), loaded on demand when the
// day ends and mounted into #end-card by the shell (deps.endCard, the alarm panel's pattern). The h2
// first and unchanged; the SCORE and its letter (★ at 1000 or more); YOU / PAR / Δ for SUPPLY,
// OUTAGES, CARBON and ALL-IN with the arithmetic under each; the biggest gap to par; the rule; the
// reliability readouts (SAIDI, SAIFI, MAIFI: beside OUTAGES, never added in) and their "?"; the seed
// and hash; DOWNLOAD REPLAY LOG and PLAY THIS DAY AGAIN. Prices come from V.VCR and V.VER, never typed
// in. While par runs the card says how far it has got; it is redrawn when par's ALL-IN arrives
// (game.end is filled in place, app/game.js buildVm).

import {SIM_VERSION, V} from '../sim/params.js';
import {mw, dollars, clockText, allInCents, VCR_TEXT, VER_TEXT} from '../render/format.js';

/** The reliability readouts' §8.2 row (content/text.js, a drawer entry): the card's "?" opens it. */
export const RELIABILITY_ROW = 'SAIDI, SAIFI and MAIFI count the shedding you cause, per household, in grid-minutes';

// An ALL-IN's parts as the card names them, and why a gap to par opens on each (d: the gap in $; city: either day paid cost.flex, §31.9.11).
const PARTS = [
  ['SUPPLY', 'supply', (d, city) => 'more or dearer plant' + (city ? ', or city payments,' : '') + ' than par\'s'],
  ['OUTAGES', 'outage', d => mw(d / V.VCR, 1) + ' MWh dark at ' + VCR_TEXT + ' each'],
  ['CARBON', 'carbon', () => 'a dirtier mix than par\'s'],
];
const CSS = '#end-card{max-height:calc(100vh - var(--hdr) - 48px);overflow-y:auto}' +
  '#end-card .big{font:700 16px var(--mono);color:var(--bright)}' +
  '#end-card table{border-collapse:collapse;width:100%;margin:6px 0;font:12px var(--mono)}' +
  '#end-card th,#end-card td{padding:1px 6px;text-align:right;font-weight:400}#end-card th:first-child{text-align:left;color:var(--bright)}' +
  '#end-card tr.why td{text-align:left;color:var(--dim);font-size:11px;padding:0 6px 3px 16px}' +
  '#end-card tr.total>*{border-top:1px solid var(--line);font-weight:700;color:var(--bright)}' +
  '#end-reliability{border-top:1px solid var(--line);margin-top:6px;padding-top:2px}' +
  '#end-card .q{width:22px;height:22px;min-width:0;min-height:0;padding:0;border-radius:50%;font:700 11px/20px system-ui,sans-serif;color:var(--dim)}';

/** A difference to par: '+$1.25M', '−$840' (U+2212), '$0'. */
const signed = x => (Math.abs(x) < 0.5 ? '$0' : (x > 0 ? '+' : '−') + dollars(Math.abs(x)));
const cents = x => (Number.isFinite(x) ? x.toFixed(1) : '-');

/**
 * Mount the end card into `root` (#end-card).
 * @param {{par: function():object|null, households: function():number, log: function():object, again: function(),
 *   toggleHelp: function(Element, string[]), toast: function(string, string=)}} deps
 *   par: the game's par runner (app/par.js) or null; log: the replay file (F-6); again: a fresh day (C-3).
 * @returns {{update(vm), el}}
 */
export function createEndCard(doc, root, actions, deps) {
  if (doc.head && !doc.getElementById('end-card-css')) {
    const st = el('style', CSS, '', doc.head);
    st.id = 'end-card-css';
  }
  let end = null, parKey = '', body = null, q = null;

  function el(tag, text, cls, parent) {
    const n = doc.createElement(tag);
    if (text) n.textContent = text;
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  const line = (parent, text, cls) => el('p', text, cls, parent);

  // par's state for this end: its ALL-IN once known; else off (none, or no score), black, or computing <pct>
  function parOf(e) {
    const p = deps.par();
    if (e.parAllIn) return {kind: 'done', key: 'done', a: e.parAllIn};
    if (!p || (p.done && !p.black && !p.score)) return {kind: 'off', key: 'off'};
    if (p.done) return {kind: 'black', key: 'black'};
    const pct = Math.floor(100 * Math.min(1, p.progress || 0));
    return {kind: 'computing', key: 'c' + pct, pct};
  }

  function build(v) {
    const e = v.end;
    root.replaceChildren();
    el('h2', e.black ? 'The grid went black.' : 'Day over: 04:00.', '', root);
    body = el('div', '', '', root);
    line(root, 'Seed ' + e.seed + ' · ' + e.v + ' · ' + e.inputs + ' inputs · hash 0x' + (e.hash >>> 0).toString(16).padStart(8, '0'), 'score');
    q = el('button', '?', 'q inline');
    q.id = 'q-reliability';
    q.title = RELIABILITY_ROW;
    q.setAttribute('aria-label', 'About: ' + RELIABILITY_ROW);
    q.setAttribute('aria-controls', 'popover');
    q.setAttribute('aria-expanded', 'false');
    q.addEventListener('click', () => deps.toggleHelp(q, [RELIABILITY_ROW]));
    const row = el('p', '', '', root), save = el('button', 'DOWNLOAD REPLAY LOG', '', row);
    save.id = 'btn-save-log';
    save.addEventListener('click', () => download('gridwatch-' + SIM_VERSION + '-seed-' + e.seed + '.json', JSON.stringify(deps.log(), null, 1)));
    row.appendChild(doc.createTextNode(' '));
    const again = el('button', 'PLAY THIS DAY AGAIN', '', row);
    again.id = 'btn-again';
    again.addEventListener('click', () => deps.again());
  }

  // Everything between the h2 and the seed line: it changes when par arrives.
  function fill(v, par) {
    const e = v.end, you = e.black ? null : e.allIn, p = par.a || null, g = e.grade;
    const status = {computing: 'PAR: computing… ' + par.pct + '%', black: 'par could not finish this day: no score', off: 'PAR: off'}[par.kind];
    body.replaceChildren();
    const score = line(body, g ? 'SCORE ' + g.points + ' · ' + g.letter + (g.star ? ' ★' : '')
      : par.kind === 'off' ? 'ALL-IN ' + allInCents(e.allIn) + ' c/kWh · PAR: off' : status || 'no score', 'big');
    score.id = 'end-score';
    if (e.black) {
      line(body, 'The grid went black at ' + clockText(v.obs.s, false) + ': the day was cut short, so it has no YOU column.');
      if (!p) line(body, par.kind === 'black' ? 'Par could not finish this day either.' : status);
    }
    const cols = [you && ['YOU', you], p && ['PAR', p]].filter(Boolean), both = cols.length === 2;
    if (cols.length) {
      const a = cols[0][1], who = you ? 'your' : 'par\'s', t = el('table', '', '', body), head = el('tr', '', '', t);
      t.id = 'end-table';
      for (const h of ['', ...cols.map(c => c[0]), ...(both ? ['Δ'] : [])]) el('th', h, '', head);
      const part = (name, k, cls, ...why) => {
        const tr = el('tr', '', cls, t);
        el('th', name, '', tr);
        for (const [, x] of cols) el('td', dollars(x[k]), '', tr);
        if (both) el('td', signed(you[k] - p[k]), '', tr);
        for (const w of why) {
          const td = el('td', '', '', el('tr', '', 'why', t));
          td.setAttribute('colspan', String(cols.length + (both ? 2 : 1)));
          td.append(...[].concat(w));
        }
      };
      part('SUPPLY', 'supply', '', cents(a.supplyCents) + ' c/kWh served: the COST chip' + (both ? ' (par ' + cents(p.supplyCents) + ')' : ''));
      part('OUTAGES', 'outage', '', mw(a.outage / V.VCR, 1) + ' MWh dark × ' + VCR_TEXT + ' (VCR)');
      part('CARBON', 'carbon', '', a.co2tPerMWh.toFixed(2) + ' t/MWh × ' + mw(a.askedMWh) + ' MWh = ' + mw(a.co2tPriced) + ' t × ' + VER_TEXT + ' (VER)',
        who + ' plants emitted ' + mw(a.co2t) + ' t; imports and dark load are counted at ' + who + ' mix');
      const hh = el('span', '$' + a.perHousehold.toFixed(2) + ' per household');
      hh.title = 'per household of the city\'s ' + (deps.households() / 1e6).toFixed(1) + 'M (unverified); real networks also count businesses';
      part('ALL-IN', 'total', 'total', [allInCents(a) + ' c/kWh · ', hh]);
    }
    if (both) {
      let gap = null;
      for (const [name, k, why] of PARTS) { const d = you[k] - p[k]; if (d >= 0.5 && (!gap || d > gap.d)) gap = {name, d, why}; }
      const paid = sc => !!(sc && sc.cost && sc.cost.flex > 0), pr = deps.par();
      line(body, gap ? 'Biggest gap to par: ' + gap.name + ' ' + signed(gap.d) + ' (' + gap.why(gap.d, paid(e.score) || paid(pr && pr.score)) + ')' : 'You beat par on all three.');
    }
    line(body, 'Score = 1000 × par\'s ALL-IN ÷ yours. Par is GRIDWATCH\'s own autopilot on this same day.');
    // (yours to the moment the grid went black, on a black day)
    const r = el('div', '', '', body), m = e.allIn;
    r.id = 'end-reliability';
    line(r, 'SAIDI ' + m.saidiMin.toFixed(1) + ' min · SAIFI ' + m.saifi.toFixed(2) + ' · MAIFI ' + m.maifi.toFixed(2) + ' per household today' +
      (p ? ' (par: SAIDI ' + p.saidiMin.toFixed(1) + ' min)' : ''));
    line(r, m.saidiMin > 0 ? 'Each SAIDI-minute today cost customers about ' + dollars(m.outage / m.saidiMin) + ' at VCR. A distributor\'s STPIS ' +
      'would not count this shedding ' : 'No household was off for more than ' + mw(V.SUSTAINED_INTERRUPTION_S / V.S_PER_MIN) + ' minutes. ').appendChild(q);
  }

  function download(name, text) {
    try {
      const a = el('a', '', '', doc.body);
      a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
      a.download = name;
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      deps.toast('Saved to your downloads: ' + name, 'info');
    } catch (err) {
      deps.toast('Download failed: ' + (err && err.message ? err.message : err));
    }
  }

  return {
    el: root,
    update(v) {
      if (!v.end) { end = null; return; }
      const par = parOf(v.end);
      if (v.end !== end) { end = v.end; parKey = ''; build(v); }
      if (par.key !== parKey) { parKey = par.key; fill(v, par); }
    },
  };
}
