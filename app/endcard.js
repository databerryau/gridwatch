// app/endcard.js: the end card (Q-48; desk/README.md §30.7 "Face", §30.9), loaded on demand when the
// day ends and mounted into #end-card by the shell (deps.endCard, the alarm panel's pattern). The h2
// first and unchanged; the SCORE, its letter (★ at 1000 or more) and its rank (W7, Q-118); YOU / PAR / Δ for SUPPLY,
// OUTAGES, CARBON and ALL-IN with the arithmetic under each; the biggest gap to par; the rule; the
// reliability readouts (SAIDI, SAIFI, MAIFI: beside OUTAGES, never added in) and their "?"; the seed
// and hash; DOWNLOAD REPLAY LOG and PLAY THIS DAY AGAIN. Prices come from V.VCR and V.VER, never typed
// in. While par runs the card says how far it has got; it is redrawn when par's ALL-IN arrives
// (game.end is filled in place, app/game.js buildVm). 2c (desk/README.md §32.7.3): under the h2,
// HAND-FLOWN (game.end.handFlown, Q-64; "until the night shift took the desk at 21:00" only after
// that flip, obs.nightShift: a black day ends before it) and "Not gate-checked" only when game.end.gated === false
// (Q-75; null is not a daily); in the reliability block, on a day with feeders under repair
// (score.heldMWh > 0), that they count from their hand-back (Q-69). W6: above the score, whether the run counts (Y-2:
// OFFICIAL, FIRST SHIFT with COUNT THIS ONE, or PRACTICE and why; deps.run, app/game.js runView) and the streaks (Y-3, or
// "history off"); after the verdict, YOUR CARD, the share card as it will be pasted (game.end.share, app/share.js), and
// SHARE to copy it (Y-5); then THE WEEK AHEAD, the next dailies' day types from today (D-28, Q-109: game.end.week, app/week.js).
// In THE MOMENT, with YOUR CARD, SAVE IMAGE: the moment as a PNG to share (Y-6, app/momentimage.js, loaded when pressed;
// off while the fall with no GUARD computes).

import {SIM_VERSION, V} from '../sim/params.js';
import {mw, dollars, clockText, allInCents, VCR_TEXT, VER_TEXT} from '../render/format.js';
import {LETTER_RULE, letterText} from './score.js';
import {copyText} from './share.js';
import {weekText, WEEK_NOTE} from './week.js';
import {drawMoment, drawDemandPair, COL} from '../render/charts.js';

/** The reliability readouts' §8.2 row (content/text.js, a drawer entry, renamed in 2c: Q-69): the card's "?" opens it. */
export const RELIABILITY_ROW = 'SAIDI, SAIFI and MAIFI count the outages you cause, per household, in grid-minutes';

// An ALL-IN's parts as the card names them, and why a gap to par opens on each (d: the gap in $; city: either day paid cost.flex, §31.9.11).
const PARTS = [
  ['SUPPLY', 'supply', (d, city) => 'more or dearer plant' + (city ? ', or city payments,' : '') + ' than par\'s'],
  ['OUTAGES', 'outage', d => mw(d / V.VCR, 1) + ' MWh dark at ' + VCR_TEXT + ' each'],
  ['CARBON', 'carbon', () => 'a dirtier mix than par\'s'],
];
/** S-6: PERFECT's rule, under the score. */
export const PERFECT_RULE = 'PERFECT: no load shed all day, and every handed-back feeder closed within ' + mw(V.RESTORE_PACE_MAX_S / V.S_PER_MIN) + ' grid-minutes of when it could be.';
/** L-10: the strip's legend, and each column's title. W6 (a11y): never colour alone: short is hatched, a spill dotted (CSS below). */
export const STRIP_WORDS = 'green: no gap · red, hatched: short (homes of yours dark) · blue, dotted: wind or solar spilled';
const STRIP_TITLE = {g: 'no gap', r: 'short', b: 'spill'};
/** W6 (a11y): the strip in words, its image's name: the hours short, spilled or not played, run by run (a run of every
 *  column is "all day"); the rest, if any, had no gap. */
export function stripText(strip) {
  const runs = {r: [], b: [], n: []};
  strip.forEach((c, h) => {
    const k = c === 'g' ? '' : c === 'r' || c === 'b' ? c : 'n';
    if (!k) return;
    const last = runs[k].at(-1);
    if (last && last[1] === h) last[1] = h + 1; else runs[k].push([h, h + 1]);
  });
  const hh = h => clockText(h * V.S_PER_H, false);
  const parts = [['short', runs.r], ['spill', runs.b], ['not played', runs.n]].filter(([, r]) => r.length)
    .map(([w, r]) => w + ' ' + r.map(([a, b]) => (b - a === strip.length ? 'all day' : hh(a) + '–' + hh(b))).join(', '));
  if (!parts.length) return 'Your day by the hour: no gap in any hour.';
  return 'Your day by the hour: ' + parts.join('; ') + (strip.includes('g') ? '; no gap in the other hours.' : '.');
}
const CSS = '#end-card{max-height:calc(100vh - var(--hdr) - 48px);overflow-y:auto}' +
  '#end-card .big{font:700 16px var(--mono);color:var(--bright)}' +
  '#end-card table{border-collapse:collapse;width:100%;margin:6px 0;font:12px var(--mono)}' +
  '#end-card th,#end-card td{padding:1px 6px;text-align:right;font-weight:400}#end-card th:first-child{text-align:left;color:var(--bright)}' +
  '#end-card tr.why td{text-align:left;color:var(--dim);font-size:11px;padding:0 6px 3px 16px}' +
  '#end-card tr.total>*{border-top:1px solid var(--line);font-weight:700;color:var(--bright)}' +
  '#end-reliability{border-top:1px solid var(--line);margin-top:6px;padding-top:2px}' +
  '#end-card .vrow{margin:3px 0}#end-card .vrow b{color:var(--bright);margin-right:4px}' +
  '#end-strip{display:flex;gap:2px;margin:6px 0 0}#end-strip span{flex:1;height:12px;border-radius:2px;background:var(--line)}' +
  '#end-strip .s-g{background:#3fb950}#end-strip .s-r{background:repeating-linear-gradient(135deg,#f85149 0 3px,#7d1f1b 3px 5px)}' +
  '#end-strip .s-b{background:radial-gradient(circle,#58a6ff 1.5px,#0d2238 1.8px) 0 0/4px 4px}' +
  '#end-card .why{color:var(--dim);font-size:11px;margin:2px 0}#end-card canvas{display:block;width:100%;height:120px;margin:4px 0}' +
  '#end-moment,#end-history,#end-debrief,#end-share,#end-week{border-top:1px solid var(--line);margin-top:8px;padding-top:4px}' +
  '#end-share pre{font:12px/1.35 var(--mono);color:var(--bright);white-space:pre-wrap;margin:4px 0 6px;user-select:all}#btn-share{font-weight:700;border-color:var(--blue)}' +
  '#end-numbers summary{cursor:pointer;color:var(--bright);margin-top:8px}#end-history a{color:#58a6ff}' +
  '#end-card .q{width:22px;height:22px;min-width:0;min-height:0;padding:0;border-radius:50%;font:700 11px/20px system-ui,sans-serif;color:var(--dim)}';

/** Y-11: the ladder's note (its title): who the other players are. */
export const LADDER_NOTE = 'GRIDWATCH\'s own players on this same day, graded as you are: one who did nothing (the system still dispatches), and the better of two scripted dispatchers. Par is 1000. They are scripts, not people.';
/** F-8: the line in YOUR CARD's place while the page's par still computes (the score is already the stored par's). */
export const PAR_WAIT = pct => 'PAR: computing… ' + pct + '%. Your card and par\'s numbers follow.';
/** F-8 (risk 5): THE NUMBERS' note when this browser's par came out other than the stored par the score is made from. */
export const parDriftText = d => 'This browser worked par out ' + signed(d) + ' from the stored par. Your score uses the stored one, so it is the same in every browser.';
/** Y-6: SAVE IMAGE's title; and its words and title while the fall with no GUARD computes (it waits: the picture shows it). */
export const MOMENT_IMAGE_NOTE = 'Save THE MOMENT as a picture to share: no times and no events, so it spoils nobody\'s day';
export const MOMENT_IMAGE_WAIT = 'SAVE IMAGE (computing…)', MOMENT_IMAGE_WAIT_NOTE = 'The picture waits for the fall with no GUARD, computing above';
/** Y-3: the streaks' rule (the end card's STREAK line, as its title); and what a browser without storage is told. */
export const STREAK_RULE = 'STREAK: days in a row with an official run finished. ★ STREAK: days in a row at par or better.';
export const HISTORY_OFF = 'History off: this browser keeps no storage, so there is no streak.';
/** Y-2 (Q-99): the end card's line on the run (app/game.js runView's). */
export function runText(r) {
  const daily = r.n ? 'daily #' + r.n : 'this day';
  if (r.status === 'first') return r.claimed ? 'OFFICIAL: your first shift counts as ' + daily + '.' : 'FIRST SHIFT: practice, unless you count it.';
  if (r.status === 'official') return r.started === false && !r.claimed ? 'PRACTICE: it ended before 09:00, so it did not count. The next run past 09:00 does.' : 'OFFICIAL: ' + daily + ', today\'s run that counts.';
  const e = r.entry;
  if (r.why === 'done') return 'PRACTICE: today\'s official run is in' + (e ? e.dnf ? ' (it did not finish).' : e.letter ? ' (' + e.points + ' ' + letterText(e) + ').' : '.' : '.');
  if (r.hard) return 'PRACTICE: Hard day ' + r.hard + '. Par sheds load on this day: you are graded on the rest.';
  return {past: 'PRACTICE: a past daily. Only today\'s counts.', future: 'PRACTICE: not today\'s daily. Only today\'s counts.',
    off: 'PRACTICE: history is off in this browser, so nothing counts.', nodaily: 'PRACTICE: no daily today, so nothing counts.'}[r.why] || 'PRACTICE: not a daily.';
}

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
    // 2c: the HAND tag (Q-64) and a daily the gate did not check (Q-75; null is not a daily: no label)
    if (e.handFlown) line(root, 'HAND-FLOWN: AGC off from 04:30' + (v.obs && v.obs.nightShift ? ' until the night shift took the desk at 21:00' : '') + '.', 'score').id = 'end-hand';
    if (e.gated === false) line(root, 'Not gate-checked: this day may not be solvable.', 'score').id = 'end-gate';
    if (e.noCoach) line(root, 'NO COACH: played from 04:30 with the coach off.', 'score').id = 'end-nocoach';   // (O-8)
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
    if (deps.shelf) {   // (W6, Y-2: the practice shelf)
      row.appendChild(doc.createTextNode(' '));
      const more = el('button', 'MORE DAYS', '', row);
      more.id = 'btn-shelf';
      more.title = 'Past dailies and Hard days, as practice';
      more.addEventListener('click', () => deps.shelf());
    }
  }

  // Everything between the h2 and the seed line: it changes when par arrives (and with each new verdict: the no-GUARD twin's).
  // K-23: a control the keyboard is on is that control again after (else the h2, which the shell makes focusable: a pressed COUNT
  // THIS ONE goes), and THE NUMBERS stay open.
  function fill(v, par) {
    const e = v.end, you = e.black ? null : e.allIn, p = par.a || null, g = e.grade;
    const status = {computing: 'PAR: computing… ' + par.pct + '%', black: 'par could not finish this day: no score', off: 'PAR: off'}[par.kind];
    const ae = doc.activeElement, keep = ae && body.contains(ae) ? (ae.tagName === 'SUMMARY' ? 'end-numbers' : ae.id || '?') : '';
    const open = !!(doc.getElementById('end-numbers') || {}).open;
    body.replaceChildren();
    runRows(body, deps.run ? deps.run() : null);
    const score = line(body, g ? 'SCORE ' + g.points + ' · ' + letterText(g) + (e.perfect ? ' · PERFECT' : '')   // (Q-118: the rank beside the letter)
      : par.kind === 'off' ? 'ALL-IN ' + allInCents(e.allIn) + ' c/kWh · PAR: off' : status || 'no score', 'big');
    score.id = 'end-score';
    // S-6, S-7: the marks' rules, and a Hard day's (par shed; a player may shed less, or none)
    if (g && g.hardMWh) line(body, 'HARD DAY: par shed ' + mw(g.hardMWh, 1) + ' MWh today. The points leave those MWh out of both totals; the letter is the gap.').id = 'end-hard';
    if (e.perfect) line(body, PERFECT_RULE).id = 'end-perfect';
    if (g) line(body, LETTER_RULE).id = 'end-letter';   // (S-5: the letter with its one-line rule)
    if (e.ladder) ladderRow(body, e.ladder);   // (W6, Y-11: where you sit among GRIDWATCH's own players)
    verdict(body, v);
    shareBox(body, v.end.share);
    // (F-8: graded on the stored par while the page's own par still computes: the card and par's numbers follow)
    if (g && !v.end.share && par.kind === 'computing') line(body, PAR_WAIT(par.pct), 'why').id = 'end-par-wait';
    if (e.week && e.week.length) {   // (W6, D-28: a reason to come back tomorrow)
      const w = el('p', '', '', body);
      w.id = 'end-week';
      w.title = WEEK_NOTE;
      el('b', 'THE WEEK AHEAD', '', w);
      w.append(' ' + weekText(e.week));
    }
    // THE NUMBERS (D-20): the dollar ledger and the reliability readouts, behind a summary
    const nums = el('details', '', '', body), bodyOuter = body;
    nums.id = 'end-numbers';
    el('summary', 'THE NUMBERS', '', nums);
    body = nums;
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
      hh.title = 'per household of a Melbourne-size city (' + (deps.households() / 1e6).toFixed(1) + 'M); real networks also count businesses';
      part('ALL-IN', 'total', 'total', [allInCents(a) + ' c/kWh · ', hh]);
    }
    if (both) {
      let gap = null;
      for (const [name, k, why] of PARTS) { const d = you[k] - p[k]; if (d >= 0.5 && (!gap || d > gap.d)) gap = {name, d, why}; }
      const paid = sc => !!(sc && sc.cost && sc.cost.flex > 0), pr = deps.par();
      line(body, gap ? 'Biggest gap to par: ' + gap.name + ' ' + signed(gap.d) + ' (' + gap.why(gap.d, paid(e.score) || paid(pr && pr.score)) + ')' : 'You beat par on all three.');
    }
    line(body, 'Score = 1000 × par\'s ALL-IN ÷ yours. Par is GRIDWATCH\'s own autopilot on this same day.');
    if (p && Math.abs(e.parDrift) >= 1) line(body, parDriftText(e.parDrift)).id = 'end-drift';   // (F-8: another engine's arithmetic)
    // (yours to the moment the grid went black, on a black day)
    const r = el('div', '', '', body), m = e.allIn;
    r.id = 'end-reliability';
    line(r, 'SAIDI ' + m.saidiMin.toFixed(1) + ' min · SAIFI ' + m.saifi.toFixed(2) + ' · MAIFI ' + m.maifi.toFixed(2) + ' per household today' +
      (p ? ' (par: SAIDI ' + p.saidiMin.toFixed(1) + ' min)' : ''));
    // Q-69: a feeder under repair is the network's until its hand-back, then every minute dark is yours (and counts here)
    const held = e.score && e.score.heldMWh;
    if (held > 0) line(r, 'Feeders under repair count from their hand-back: the ' + mw(held, 1) + ' MWh dark before it were the network\'s outage, not priced.');
    line(r, m.saidiMin > 0 ? 'Each SAIDI-minute today cost customers about ' + dollars(m.outage / m.saidiMin) + ' at VCR. A distributor\'s STPIS ' +
      'would not count this shedding ' : 'No household was off for more than ' + mw(V.SUSTAINED_INTERRUPTION_S / V.S_PER_MIN) + ' minutes. ').appendChild(q);
    body = bodyOuter;
    if (open) nums.open = true;
    if (keep) {
      const n = keep === 'end-numbers' ? nums.querySelector('summary') : doc.getElementById(keep), h = root.querySelector('h2');
      if (n && body.contains(n) && !n.disabled) n.focus(); else if (h) h.focus();
    }
  }

  // W3 (D-20, L-10, D-21, D-24, P-1, H-11): the day in words, in D-25's order (app/verdict.js builds it: v.end.verdict)
  function verdict(parent, v) {
    const x = v.end.verdict;
    charts = [];
    if (!x) return;
    const box = el('div', '', '', parent), row = (k, text, id) => { const p = el('p', '', 'vrow', box); el('b', k, '', p); p.append(' ' + text); p.id = id; };
    box.id = 'end-verdict';
    if (x.marg) row('MARG', x.marg, 'end-marg');   // (O-6: the closing line)
    row('LIGHTS', x.lights, 'end-lights');
    row('COST', x.cost, 'end-cost');
    row('CARBON', x.carbon, 'end-carbon');
    // L-10: the plan, an hour a column
    const st = el('div', '', 'strip', box);
    st.id = 'end-strip';
    st.setAttribute('role', 'img');
    st.setAttribute('aria-label', stripText(x.strip));
    x.strip.forEach((c, h) => { const cell = el('span', '', 's-' + (c || 'n'), st); cell.title = clockText(h * V.S_PER_H, false) + ': ' + (STRIP_TITLE[c] || 'not played'); });
    el('p', STRIP_WORDS, 'why', box);
    const m = x.moment;
    if (m) {
      const mb = el('div', '', 'moment', box);
      mb.id = 'end-moment';
      el('b', 'THE MOMENT', '', mb);
      const cv = el('canvas', '', '', mb);
      cv.id = 'end-moment-chart';
      charts.push([cv, () => drawMoment(cv, m.trace, [{hz: m.numbers.noGuardHz, label: 'NO GUARD', col: COL.pink}, {hz: m.numbers.parHz, label: 'PAR', col: COL.grey}])]);
      for (const t of m.text) el('p', t, '', mb);
      // W6 (Y-6): SAVE IMAGE, with YOUR CARD (the picture carries its number, score and closing line): app/momentimage.js on demand.
      // While the no-GUARD twin computes it is shown off (m.pending): the new verdict when the twin is done re-fills the card.
      if (v.end.share) {
        const b = el('button', m.pending ? MOMENT_IMAGE_WAIT : 'SAVE IMAGE', '', el('p', '', '', mb));
        b.id = 'btn-save-moment';
        b.title = m.pending ? MOMENT_IMAGE_WAIT_NOTE : MOMENT_IMAGE_NOTE;
        b.disabled = !!m.pending;
        if (!m.pending) b.addEventListener('click', () => {
          b.disabled = true;
          import('./momentimage.js').then(mod => mod.saveMoment(doc, v.end, deps.toast))
            .catch(err => deps.toast('The image failed: ' + (err && err.message ? err.message : err))).finally(() => { b.disabled = false; });
        });
      }
    }
    const c = x.card;
    if (c) {
      const cb = el('div', '', 'history', box);
      cb.id = 'end-history';
      el('b', 'THIS REALLY HAPPENED', '', cb);
      el('p', c.text, '', cb);
      el('p', 'What GRIDWATCH simplifies: ' + c.simplifies, 'why', cb);
      const a = el('a', 'Source: ' + c.sourceName, '', el('p', '', 'why', cb));
      a.id = 'end-source';
      a.href = c.source; a.target = '_blank'; a.rel = 'noopener';
    }
    const db = el('div', '', 'debrief', box);
    db.id = 'end-debrief';
    if (x.demand.text) {
      el('p', x.demand.text, '', db);
      const dc = el('canvas', '', '', db);
      dc.id = 'end-demand-chart';
      charts.push([dc, () => drawDemandPair(dc, x.demand.under, x.demand.oper)]);
    }
    el('p', x.trips, '', db);
  }

  // W6 (Y-11): the ladder, lowest first, YOU in bold in your place
  function ladderRow(parent, rows) {
    const p = el('p', '', 'why', parent);
    p.id = 'end-ladder';
    p.title = LADDER_NOTE;
    p.append('On today\'s ladder: ');
    rows.forEach(([name, pts, you], i) => {
      if (i) p.append(' · ');
      if (you) el('b', 'YOU ' + pts, '', p); else p.append(name + ' ' + pts);
    });
    p.append(' (GRIDWATCH\'s own scripted players)');
  }

  // W6 (Y-2, Y-3): whether this run counts, COUNT THIS ONE on a first shift, and the streaks (or "history off")
  function runRows(parent, r) {
    if (!r) return;
    const p = line(parent, runText(r), 'score');
    p.id = 'end-run';
    if (r.claimable) {
      const b = el('button', 'COUNT THIS ONE', '', null);
      b.id = 'btn-claim';
      b.title = 'Make this first shift today\'s official run: it starts your streak';
      b.addEventListener('click', () => { const why = actions.ui({do: 'claim'}); if (why) deps.toast(why); else deps.toast('Counted: today\'s official run.', 'info'); });
      p.append(' ', b);
    }
    const s = line(parent, !r.historyOn ? HISTORY_OFF : r.played ? 'STREAK ' + r.streak + ' · ★ STREAK ' + r.best + ' · ' + r.played + (r.played === 1 ? ' daily' : ' dailies') + ' played' : '', 'score');
    s.id = 'end-streak';
    s.title = STREAK_RULE;
    s.hidden = !s.textContent;
  }

  // W6 (Y-4, Y-5, D-25: SHARE after the verdict): the card exactly as it will be pasted, and SHARE to copy it. A blocked
  // clipboard leaves the text selected, to copy by hand.
  function shareBox(parent, s) {
    if (!s) return;
    const box = el('div', '', '', parent), pre = el('pre', s.text, '', null), btn = el('button', 'SHARE', '', null);
    box.id = 'end-share';
    el('b', 'YOUR CARD', '', box);
    box.append(pre, btn);
    pre.id = 'end-share-text';
    btn.id = 'btn-share';
    btn.title = 'Copy the card: no times and no events, so it spoils nobody\'s day';
    btn.addEventListener('click', () => (deps.copy || copyText)(s.text).then(how => {
      if (how) {
        btn.textContent = 'COPIED';
        deps.toast('Copied: paste it anywhere.', 'info');
      } else {
        try { const r = doc.createRange(); r.selectNodeContents(pre); const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch { /* (no selection API) */ }
        deps.toast('Copy was blocked here: the card is selected, so press Ctrl+C.');
      }
    }));
  }

  // The verdict's charts, drawn once the card is laid out and again when their width changes (a chart is
  // optional: the words carry it)
  let charts = [];
  function drawCharts() {
    for (const [cv, draw] of charts) {
      const w = cv.clientWidth;
      if (!(w > 1) || cv.dataset.w === String(w)) continue;
      cv.dataset.w = String(w);
      try { draw(); } catch (err) { /* (optional) */ }
    }
  }
  // (each verdict object the game builds gets a number: a new one redraws the card)
  const seenV = new WeakMap();
  let vN = 0;
  function verdictN(x) { if (!seenV.has(x)) seenV.set(x, ++vN); return seenV.get(x); }

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
      const key = par.key + (v.end.verdict ? '|' + verdictN(v.end.verdict) : '');
      if (key !== parKey) { parKey = key; fill(v, par); }
      drawCharts();
    },
  };
}
