// render/bench.js: the bench's DOM view (next.html). It reads an observe() snapshot, the
// recorder and the director's mode, and turns clicks into `actions` (app/boot.js). It never
// steps the sim and never touches state: every change is an input through the actions.
// DOM work happens only inside createBench() and the functions it returns.

import {V} from '../sim/params.js';
import {TEXT} from '../content/text.js';
import {FLAT_RATE, DEBUG_RATES} from '../app/director.js';
import {recentTicks, secondsWindow, traceOf, interpolatedF, needleF, NEEDLE_AVG_ABOVE_X, TICK_WINDOW_S, SEC_WINDOW_S} from '../app/record.js';
import {drawFreqWindow, drawWatch, drawFreqDay, drawDemandDay, drawPriceDay} from './charts.js';
import {clockText, tickClock, mw, smw, hz, rateText, mmss, dollars, describeRecord} from './format.js';

const TPS = V.TICKS_PER_S, S_PER_MIN = V.S_PER_MIN;
const GUARD_MS = 2500;            // a guarded button stays armed this long (K-3: two clicks)
const DRAW_DAY_EVERY_MS = 250;    // the 24-h charts change once a grid minute; redraw at most 4 per s
const LOG_MAX = 300;

// ------------------------------------------------------------------ small DOM helpers

function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const setText = (e, s) => { if (e.textContent !== s) e.textContent = s; };
const setClass = (e, c) => { if (e.className !== c) e.className = c; };
const setDisabled = (e, d) => { if (e.disabled !== d) e.disabled = d; };
const setTitle = (e, t) => { if (e.title !== t) e.title = t; };

/** A button that needs two clicks within GUARD_MS (K-3 guarded START/STOP, K-7 emergency keys). */
function guarded(btn, run, armedText) {
  let timer = 0, label = '';
  btn.addEventListener('click', () => {
    if (btn.classList.contains('armed')) {
      clearTimeout(timer);
      btn.classList.remove('armed');
      btn.textContent = label;
      run();
      return;
    }
    label = btn.textContent;
    btn.classList.add('armed');
    btn.textContent = armedText || 'CONFIRM ' + label + '?';
    timer = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = label; }, GUARD_MS);
  });
  return {isArmed: () => btn.classList.contains('armed')};
}

// A slider that sends its value on release and is not overwritten while held.
function slider(input, send) {
  let held = false;
  input.addEventListener('input', () => { held = true; });
  input.addEventListener('change', () => { held = false; send(Number(input.value)); });
  input.addEventListener('blur', () => { held = false; });
  return {
    set(v) { if (!held && Number(input.value) !== v) input.value = String(v); },
    held: () => held,
  };
}

const modeWord = {off: 'OFF', starting: 'T1', ready: 'READY', loading: 'T2', on: 'ON', unloading: 'UNLOAD',
  shutdown: 'T4', tripped: 'TRIP'};

// ------------------------------------------------------------------ the bench

/**
 * @param {Document} doc
 * @param {object} actions {input(x), togglePause(), setSpeed(r), skipWatch(), setAgc(bool), setAssist(k), skipToDesk(),
 *   newDay(seed), saveLog(), debugTrip()}
 */
export function createBench(doc, actions) {
  const $ = id => doc.getElementById(id);
  const els = {
    clock: $('clock-text'), badge: $('rate-badge'), badgeText: $('rate-text'), play: $('btn-play'), seed: $('seed'),
    live: $('c-live'), fday: $('c-fday'), demand: $('c-demand'), price: $('c-price'),
    fBig: $('f-big'), fSub: $('f-sub'), fBal: $('f-balance'), ufls: $('ufls-lamps'), ofgs: $('ofgs-lamps'),
    secLevel: $('sec-level'), secR5: $('sec-r5'), secL: $('sec-l'), secPrev: $('sec-preview'),
    fos: $('fos-text'), agc: $('agc-text'), price2: $('price-text'),
    sLights: $('score-lights'), sCost: $('score-cost'), sCarbon: $('score-carbon'), sFreq: $('score-freq'),
    cont: $('cont-card'), news: $('news-list'), log: $('log-list'), hydro: $('hydro-text'),
    battOrderText: $('batt-order-text'), battGuardText: $('batt-guard-text'), battSocBar: $('batt-soc-bar'),
    battSocText: $('batt-soc-text'), battState: $('batt-state'), battRating: $('batt-rating'),
    tieText: $('tie-set-text'), tieState: $('tie-state'), windText: $('wind-text'), solarText: $('solar-text'),
    dr: $('btn-dr'), drText: $('dr-text'), rert: $('btn-rert'), rertText: $('rert-text'), shed: $('btn-shed'),
    shedText: $('shed-text'), restoreList: $('restore-list'), popover: $('popover'), drawer: $('drawer'), end: $('end-card'),
  };

  // ---- header controls
  els.play.addEventListener('click', () => actions.togglePause());
  $('btn-skip').addEventListener('click', () => actions.skipWatch());
  const speedBox = $('speed'), speedBtns = [];
  DEBUG_RATES.forEach((r, i) => {
    const b = el(doc, 'button', '', rateText(r));
    b.title = (r === FLAT_RATE ? 'Cruise rate (Phase 0.2: a flat 120×)' : 'Debug speed') + ' · key ' + (i + 1);
    b.addEventListener('click', () => actions.setSpeed(r));
    speedBox.appendChild(b);
    speedBtns.push([r, b]);
  });
  const agcBtns = [...$('agc-mode').querySelectorAll('button')];
  for (const b of agcBtns) b.addEventListener('click', () => actions.setAgc(b.dataset.agc === '1'));
  const assistBtns = [...$('assist-select').querySelectorAll('button[data-assist]')];
  for (const b of assistBtns) b.addEventListener('click', () => actions.setAssist(b.dataset.assist));
  const replanBtn = $('btn-replan');
  replanBtn.addEventListener('click', () => actions.replan());
  $('btn-desk').addEventListener('click', () => actions.skipToDesk());
  $('btn-new').addEventListener('click', () => actions.newDay(Number(els.seed.value)));
  $('btn-save').addEventListener('click', () => actions.saveLog());
  guarded($('btn-trip'), () => actions.debugTrip(), 'CONFIRM DEBUG TRIP?');
  $('btn-help').addEventListener('click', () => toggleDrawer());

  // ---- stations: a lever per station, a lamp + action per machine
  const stations = {};
  for (const sid of V.STATION_IDS) {
    let row = $('station-' + sid);
    if (!row) { row = el(doc, 'div', 'st'); row.id = 'station-' + sid; $('hydro-storage').before(row); }
    const st = V.STATIONS[sid];
    const name = el(doc, 'div', 'name q-slot', st.name.replace('Greyfell Gorge ', '').replace('Mt Hazel ', '').replace('Riverton ', ''));
    name.title = st.name + ': ' + st.machines + ' × ' + st.ratingMW + ' MW, min ' + st.minMW + ' MW each, ramp ' +
      mw(st.rampMWMin, 1) + ' MW/min each, offer $' + st.offer + '/MWh';
    const lever = el(doc, 'div', 'lever');
    const input = el(doc, 'input');
    input.type = 'range'; input.min = '0'; input.max = String(st.totalMW); input.step = '5';
    const readout = el(doc, 'div', 'readout');
    const rBp = el(doc, 'span'), rOut = el(doc, 'span');
    readout.append(rBp, rOut);
    lever.append(input, readout);
    const machines = el(doc, 'div', 'machines');
    const mach = [];
    for (let j = 0; j < st.machines; j++) {
      const k = st.first + j, m = V.MACHINES[k];
      const box = el(doc, 'span', 'mach off');
      const lamp = el(doc, 'span', 'lamp'), label = el(doc, 'span', '', m.id.replace(sid, '#')), btn = el(doc, 'button', '', 'START');
      box.append(lamp, label, btn);
      machines.appendChild(box);
      const entry = {k, id: m.id, box, label, btn, action: ''};
      // Two clicks for START and STOP (K-3); CANCEL, SYNC and ABORT act at once.
      let timer = 0;
      btn.addEventListener('click', () => {
        const a = entry.action;
        if (!a) return;
        if ((a === 'start' || a === 'stop') && !btn.classList.contains('armed')) {
          btn.classList.add('armed');
          btn.textContent = 'SURE?';
          timer = setTimeout(() => btn.classList.remove('armed'), GUARD_MS);
          return;
        }
        clearTimeout(timer);
        btn.classList.remove('armed');
        actions.input({type: a === 'cancel' ? 'stop' : a, unit: m.id});
      });
      mach.push(entry);
    }
    row.textContent = '';
    row.append(name, lever, machines);
    stations[sid] = {input, lever: slider(input, v => actions.input({type: 'basePoint', station: sid, mw: v})), rBp, rOut, mach};
  }

  // ---- battery, tie, curtailment, emergency
  els.battRating.textContent = mw(V.BATT_MW) + ' MW / ' + mw(V.BATT_MWH) + ' MWh';
  const battOrder = $('batt-order'), battGuard = $('batt-guard');
  battOrder.max = String(V.BATT_MW); battGuard.max = String(V.BATT_MW); battGuard.step = String(V.GUARD_STEP_MW);
  let lastObs = null;
  const battModeBtns = [...$('batt-mode').querySelectorAll('button')];
  for (const b of battModeBtns) {
    b.addEventListener('click', () => actions.input({type: 'battery', mode: b.dataset.mode, mw: lastObs ? lastObs.battery.orderMW : 0}));
  }
  const battOrderS = slider(battOrder, v => actions.input({type: 'battery', mode: lastObs ? lastObs.battery.mode : 'idle', mw: v}));
  const battGuardS = slider(battGuard, v => actions.input({type: 'guard', mw: v}));
  const tieSet = $('tie-set');
  tieSet.min = String(-V.TIE_MAX_MW); tieSet.max = String(V.TIE_MAX_MW);
  const tieS = slider(tieSet, v => actions.input({type: 'tie', mw: v}));
  const windS = slider($('lim-wind'), v => actions.input({type: 'curtail', kind: 'wind', limitPct: v}));
  const solarS = slider($('lim-solar'), v => actions.input({type: 'curtail', kind: 'solar', limitPct: v}));
  guarded(els.dr, () => actions.input({type: 'callDR'}));
  let rertArmed = false;
  guarded(els.rert, () => actions.input({type: rertArmed ? 'standDownRERT' : 'armRERT'}));
  guarded(els.shed, () => actions.input({type: 'directShed'}));

  // ---- UFLS / OFGS lamps
  const uflsLamps = [], ofgsLamps = [];
  for (let k = 0; k < V.UFLS_STAGES; k++) {
    const hzK = V.UFLS_FIRST_HZ - k * V.UFLS_STEP_HZ;
    const i = el(doc, 'i', '', hzK.toFixed(3));
    i.title = 'UFLS stage ' + (k + 1) + ': ' + hzK.toFixed(3) + ' Hz';
    els.ufls.appendChild(i); uflsLamps.push(i);
  }
  V.OFGS_STAGES_HZ.forEach((h, k) => {
    const i = el(doc, 'i', '', h.toFixed(2));
    i.title = 'OFGS stage ' + (k + 1) + ': trips ' + Math.round(V.OFGS_STAGE_FRAC * 100) + '% of wind at ' + h + ' Hz';
    els.ofgs.appendChild(i); ofgsLamps.push(i);
  });

  // ---- "?" help (H-14) and the abstractions drawer
  for (const e of TEXT.abstractions) {
    if (e.ui === 'drawer') continue;
    const host = $(e.anchorId);
    if (!host) continue;
    const q = el(doc, 'button', 'q', '?');
    q.title = e.row.replace(/\.$/, '') + ' (what we simplify, and why)';
    q.addEventListener('click', ev => { ev.stopPropagation(); showHelp(e, q); });
    // Inside the element's heading or marked slot, so live updates never overwrite it.
    (host.querySelector('.q-slot') || host.querySelector('h3') || host).appendChild(q);
  }
  function helpBody(parent, e) {
    const h = el(doc, 'h4', '', e.row.replace(/\.$/, ''));
    const p1 = el(doc, 'p'), p2 = el(doc, 'p'), p3 = el(doc, 'p');
    p1.append(el(doc, 'b', '', 'Real world: '), doc.createTextNode(e.real));
    p2.append(el(doc, 'b', '', 'GRIDWATCH: '), doc.createTextNode(e.ours));
    p3.append(el(doc, 'b', '', 'Why: '), doc.createTextNode(e.why));
    parent.append(h, p1, p2, p3);
  }
  function showHelp(e, anchor) {
    const p = els.popover;
    p.textContent = '';
    helpBody(p, e);
    p.hidden = false;
    const r = anchor.getBoundingClientRect(), vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
    const pw = Math.min(420, vw - 16);
    p.style.left = Math.max(8, Math.min(vw - pw - 8, r.left - pw / 2)) + 'px';
    p.style.top = (r.bottom + 6 + 200 > vh ? Math.max(8, r.top - 6 - p.offsetHeight) : r.bottom + 6) + 'px';
  }
  doc.addEventListener('click', ev => {
    if (!els.popover.hidden && !els.popover.contains(ev.target)) els.popover.hidden = true;
  });
  function toggleDrawer() {
    const d = els.drawer;
    if (!d.hidden) { d.hidden = true; return; }
    d.textContent = '';
    const close = el(doc, 'button', '', 'CLOSE');
    close.style.float = 'right';
    close.addEventListener('click', () => { d.hidden = true; });
    d.append(close, el(doc, 'h2', '', 'What GRIDWATCH simplifies, and why'));
    d.appendChild(el(doc, 'p', 'dim', 'Every deliberate abstraction (SPEC §8.2), with the real-world value beside ours. ' +
      'Realism is the rule; these are the labelled exceptions. Ours is built from the live parameters.'));
    for (const e of TEXT.abstractions) {
      const a = el(doc, 'article');
      helpBody(a, e);
      if (e.ui === 'drawer') a.appendChild(el(doc, 'p', 'faint', 'Not on the bench yet (Phase 1 or later).'));
      d.appendChild(a);
    }
    d.hidden = false;
  }

  // ---- event log
  let logSeen = 0;
  const unitName = id => {
    const m = V.MACHINES.find(x => x.id === id);
    return m ? m.name : id;
  };
  function appendRecords(records, seq) {
    // records: the session's ring (newest last); seq: total ever pushed. Append the unseen tail.
    const fresh = Math.min(records.length, seq - logSeen);
    logSeen = seq;
    if (fresh <= 0) return;
    const atBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 30;
    for (let i = records.length - fresh; i < records.length; i++) {
      const r = records[i], d = describeRecord(r, unitName);
      if (!d) continue;
      const row = el(doc, 'div', d.sev === 'dim' ? 'dim' : '');
      row.append(el(doc, 'span', 't', tickClock(r.tick)), el(doc, 'span', d.sev === 'dim' ? '' : d.sev, d.text));
      els.log.appendChild(row);
    }
    while (els.log.childElementCount > LOG_MAX) els.log.firstElementChild.remove();
    if (atBottom) els.log.scrollTop = els.log.scrollHeight;
  }
  function resetLog() { els.log.textContent = ''; logSeen = 0; }

  // ---- per-frame update
  let lastDayDraw = -1e9, lastDayMinute = -2, newsCount = -1, restoreKey = '', pinTrace = false;
  // Click the live chart to keep the last contingency's trace on screen (and again to release it).
  els.live.addEventListener('click', () => { pinTrace = !pinTrace; });

  /**
   * @param {{obs:object, mode:object, rec:object, pacer:object, eff:number, sess:object, nowMs:number}} v
   */
  function update(v) {
    const {obs, mode, rec} = v;
    lastObs = obs;
    const watch = mode.mode === 'WATCH';
    doc.body.classList.toggle('watch', mode.locked);
    // Clock and rate (F-5: the rate is always visible).
    setText(els.clock, obs.clock.text + ':' + String(obs.clock.ss).padStart(2, '0'));
    let badge;
    if (mode.mode === 'WATCH') badge = 'WATCH T+' + (mode.watchS + v.pacer.alpha / TPS).toFixed(2) + ' s · ' + rateText(mode.rate);
    else if (mode.mode === 'OVER') badge = 'DAY OVER';
    else if (mode.mode === 'HIDDEN') badge = 'PAUSE (tab hidden)';
    else if (mode.mode === 'PAUSE') badge = 'PAUSE';
    else badge = mode.mode + ' ' + rateText(mode.rate);
    if (v.pacer.lagging && mode.rate > 0) badge += ' · running ' + rateText(v.eff);
    setText(els.badgeText, badge);
    setClass(els.badge, mode.mode);
    setText(els.play, v.sess.director.paused ? '▶ PLAY' : '❚❚ PAUSE');
    for (const [r, b] of speedBtns) b.classList.toggle('on', v.sess.director.speed === r);
    const beforeDesk = obs.tick < V.PLAYER_START_TICK;
    for (const b of agcBtns) {
      b.classList.toggle('on', (b.dataset.agc === '1') === (obs.mode === 'AGC'));
      setDisabled(b, obs.modeLocked || obs.over);
    }
    for (const b of assistBtns) b.classList.toggle('on', v.sess.assist.kind === b.dataset.assist);
    setDisabled(replanBtn, v.sess.assist.kind !== 'plan' || obs.over || obs.inWatch || obs.tick < V.PLAYER_START_TICK);
    setDisabled(doc.getElementById('btn-desk'), !beforeDesk || obs.over);

    // Frequency readout (F-4): interpolated between ticks up to 10x, the 1-s average of the last
    // completed grid second above it (CRUISE hides the seconds-scale wobble), the tick when paused.
    const averaged = mode.rate > NEEDLE_AVG_ABOVE_X;
    const fShow = mode.rate > 0 ? needleF(rec, mode.rate, v.pacer.alpha) : obs.f.hz;
    setText(els.fBig, fShow.toFixed(3));
    const fc = fShow < V.CONTAIN_LO_HZ || fShow > V.CONTAIN_HI_HZ ? 'big crit'
      : fShow < V.NORMAL_LO_HZ || fShow > V.NORMAL_HI_HZ ? 'big warn' : 'big';
    setClass(els.fBig, fc);
    setText(els.fSub, (averaged ? '1-s AVERAGE · ' : '') + 'CHANGE ' + (obs.f.rocofHzS >= 0 ? '+' : '') + obs.f.rocofHzS.toFixed(3) +
      ' Hz/s (500 ms) · SPIN ' + obs.f.ekGWs.toFixed(1) + ' GW·s');
    const b = obs.balance;
    setText(els.fBal, 'supply ' + mw(b.supplyMW) + ' · load ' + mw(b.loadMW) + ' · imbalance ' + smw(b.imbalanceMW) +
      ' MW · governors ' + smw(b.governorsMW) + ' · battery PFR ' + smw(b.batteryPfrMW) + ' · GUARD ' + smw(b.guardMW) +
      ' · load relief ' + smw(b.loadReliefMW));

    // UFLS stages operated (districts shed by UFLS), OFGS stages tripped.
    for (let k = 0; k < uflsLamps.length; k++) {
      const lit = obs.districts.some(d => d.uflsStage === k + 1 && d.dark && d.shedBy === 'ufls');
      uflsLamps[k].classList.toggle('lit', lit);
    }
    const ofgsN = Math.round(obs.wind.ofgsTrippedFrac / V.OFGS_STAGE_FRAC);
    for (let k = 0; k < ofgsLamps.length; k++) ofgsLamps[k].classList.toggle('lit', k < ofgsN);

    // Security (H-4, K-10).
    const sec = obs.sec;
    setText(els.secLevel, sec.level);
    setClass(els.secLevel, 'level ' + sec.level);
    setText(els.secR5, 'SPARE IN 5 MIN (R5) ' + mw(sec.r5MW) + ' MW · ratio ' + (sec.lMW > 0 ? (sec.r5MW / sec.lMW).toFixed(2) : '-') +
      ' × L (SECURE ≥ ' + V.SECURE_RATIO + ')');
    setText(els.secL, 'BIGGEST RISK (L) ' + (sec.lKind === 'none' ? 'none' : unitName(sec.lId) + ' ' + mw(sec.lMW) + ' MW'));
    const pv = sec.previewNadirHz;
    setText(els.secPrev, 'TRIP PREVIEW for losing L: ' + hz(pv) + ' Hz' + (pv < V.UFLS_FIRST_HZ ? ' · UFLS would operate'
      : pv < V.SECURE_NADIR_HZ ? ' · below containment' : ' · contained'));
    setClass(els.secPrev, 'kv ' + (pv < V.UFLS_FIRST_HZ ? 'crit' : pv < V.SECURE_NADIR_HZ ? 'warn' : 'good'));

    // FOS (H-11), AGC (K-2), price (P-5..P-8).
    const fos = obs.fos;
    let fosText;
    if (fos.directed) fosText = 'DIRECTED SHEDDING: one district per minute until f ≥ ' + V.NORMAL_LO_HZ + ' Hz';
    else if (fos.outsideS > 0) fosText = 'OUT OF BAND ' + mmss(fos.outsideS) + ' · back within ' + mmss(fos.countdownS) +
      (fos.belowContainS > 0 ? ' · below ' + V.CONTAIN_LO_HZ + ' Hz for ' + fos.belowContainS + ' s (shed after ' + V.DIRECTED_BELOW_CONTAIN_S + ')' : '');
    else fosText = 'IN BAND ' + V.NORMAL_LO_HZ + '–' + V.NORMAL_HI_HZ + ' Hz';
    setText(els.fos, 'FOS: ' + fosText);
    setClass(els.fos, fos.directed ? 'crit' : fos.outsideS > 0 ? 'warn' : '');
    const agc = obs.agc;
    setText(els.agc, obs.mode === 'HAND' ? 'HAND: no AGC (ACE ' + smw(agc.aceMW) + ' MW)'
      : 'AGC request ' + smw(agc.requestMW) + ' MW · ACE ' + smw(agc.aceMW) + (agc.unmetMW ? ' · UNMET ' + smw(agc.unmetMW) : '') +
        (agc.atLimitS > 0 ? ' · AT LIMIT ' + agc.atLimitS + ' s' : ''));
    const pr = obs.price;
    setText(els.price2, 'PRICE $' + mw(pr.mwh) + '/MWh' + (pr.marginalId ? ' · marginal ' + pr.marginalId : ' · administered') +
      (pr.adder > 0 ? ' · scarcity +$' + mw(pr.adder) : '') + ' · neighbour $' + mw(obs.tie.neighbourPrice));

    // Scorecard (S-1..S-3).
    const sc = obs.score;
    setText(els.sLights, 'LIGHTS ON: ' + mw(sc.unservedMWh, 1) + ' MWh unserved (UFLS ' + mw(sc.uflsMWh, 1) + ', directed ' +
      mw(sc.directedMWh, 1) + ') of ' + mw(sc.servedMWh) + ' MWh');
    setText(els.sCost, 'CUSTOMER COST: ' + (Number.isFinite(sc.centsPerKWh) ? sc.centsPerKWh.toFixed(2) : '-') + ' c/kWh · ' +
      dollars(sc.costDollars) + ' · starts ' + sc.starts + (obs.rert.armedEver ? ' · GLASS BROKEN' : ''));
    setText(els.sCarbon, 'CARBON: ' + (Number.isFinite(sc.co2tPerMWh) ? sc.co2tPerMWh.toFixed(3) : '-') + ' t/MWh generated · ' +
      mw(sc.co2t) + ' t');
    setText(els.sFreq, 'f range ' + hz(sc.minHz) + '–' + hz(sc.maxHz) + ' Hz · outside normal band ' + mmss(sc.outsideNormalS));

    // Stations and machines.
    for (let i = 0; i < obs.stations.length; i++) {
      const so = obs.stations[i], ui = stations[so.id];
      if (!ui) continue;
      ui.lever.set(Math.round(so.basePointMW));
      setText(ui.rBp, 'base ' + mw(so.basePointMW) + (so.onCount ? ' (' + mw(so.minMW) + '–' + mw(so.maxMW) + ')' : ''));
      setText(ui.rOut, 'out ' + mw(so.outMW) + ' MW');
      for (const m of ui.mach) updateMachine(m, obs.units[m.k], obs.mode);
    }
    const hy = obs.hydro;
    setText(els.hydro, mw(hy.storageMWh) + ' of ' + mw(hy.allocationMWh) + ' MWh (' + Math.round(hy.frac * 100) + '%)');

    // Battery.
    const bt = obs.battery;
    for (const bb of battModeBtns) bb.classList.toggle('on', bb.dataset.mode === bt.mode);
    battOrderS.set(bt.orderMW);
    battGuardS.set(bt.guardMW);
    setText(els.battOrderText, bt.mode + ' ' + mw(bt.orderMW) + ' MW (max ' + mw(bt.ratedMW - bt.guardMW) + ' beside the GUARD)');
    setText(els.battGuardText, mw(bt.guardMW) + ' MW');
    els.battSocBar.style.width = Math.round(bt.socMWh / bt.capMWh * 100) + '%';
    setText(els.battSocText, mw(bt.socMWh) + ' MWh');
    setText(els.battState, 'sched ' + smw(bt.schedMW) + ' · out ' + smw(bt.outMW) + ' · PFR ' + smw(bt.pfrMW) + ' · GUARD ' +
      smw(bt.ffrMW) + (bt.guardFired ? ' (FIRED)' : bt.guardMW > 0 ? ' (armed)' : '') + (bt.fullHold ? ' · FULL-HOLD' : '') +
      (bt.ufSuspend ? ' · charging suspended (UF)' : ''));

    // Tie.
    const t = obs.tie;
    tieS.set(Math.round(t.setMW));
    setText(els.tieText, smw(t.setMW) + ' MW');
    setText(els.tieState, t.tripped ? 'TRIPPED: back in ' + mmss(t.lockoutS) + ' (then flows to the setpoint)'
      : 'flow ' + smw(t.flowMW) + ' MW · export cap ' + mw(t.exportLimitMW) + ' · import ≤ ' + mw(t.importLimitMW) +
        ' · neighbour $' + mw(t.neighbourPrice) + '/MWh');

    // Wind and solar.
    windS.set(obs.wind.limitPct);
    solarS.set(obs.solar.limitPct);
    setText(els.windText, obs.wind.limitPct + '% · ' + mw(obs.wind.outMW) + '/' + mw(obs.wind.availMW));
    setText(els.solarText, obs.solar.limitPct + '% · ' + mw(obs.solar.outMW) + '/' + mw(obs.solar.availMW));

    // Emergency.
    const dr = obs.dr;
    if (!els.dr.classList.contains('armed')) setText(els.dr, 'CALL DR (' + dr.callsLeft + ' left)');
    setDisabled(els.dr, dr.callsLeft <= 0 || dr.activeS > 0);
    setText(els.drText, dr.activeS > 0 || dr.mw > 0.5 ? 'active ' + mmss(dr.activeS) + ' · ' + mw(dr.mw) + ' MW off' : mw(V.DR_MW) +
      ' MW for ' + V.DR_DURATION_S / S_PER_MIN + ' min at $' + mw(V.DR_PRICE) + '/MWh');
    const rt = obs.rert;
    rertArmed = rt.armed && !rt.standingDown;
    if (!els.rert.classList.contains('armed')) setText(els.rert, rertArmed ? 'STAND DOWN RERT' : 'BREAK GLASS: ARM RERT');
    setDisabled(els.rert, rt.standingDown);
    setText(els.rertText, rt.armed ? (rt.leadS > 0 ? 'arriving in ' + mmss(rt.leadS) : mw(rt.outMW) + ' MW on') +
      (rt.standingDown ? ' · standing down' : '') : mw(V.RERT_MW) + ' MW, ' + V.RERT_LEAD_S / S_PER_MIN + ' min lead, $' +
      mw(V.RERT_COST) + '/MWh');
    const litRot = obs.districts.filter(d => d.rot >= 0 && !d.dark).length;
    setText(els.shedText, litRot + ' rotation districts lit');
    setDisabled(els.shed, litRot === 0);

    // Restore list (rebuilt only when it changes). A lit lamp (restoreBlock '') still needs the
    // RESTORE PREVIEW the restore input runs (K-13): v.restore holds its answer per district, so
    // the button is enabled only when the input would be accepted.
    const dark = obs.districts.filter(d => d.dark);
    const blockOf = d => d.restoreBlock || (v.restore && v.restore[d.id]) || '';
    const key = dark.map(d => d.id + ':' + blockOf(d) + ':' + Math.round(d.coldLoadMW / 10)).join('|');
    if (key !== restoreKey) {
      restoreKey = key;
      els.restoreList.textContent = '';
      if (!dark.length) els.restoreList.appendChild(el(doc, 'div', 'kv', 'All districts lit.'));
      for (const d of dark) {
        const row = el(doc, 'div', 'row');
        const btn = el(doc, 'button', '', 'RESTORE');
        const block = blockOf(d);
        btn.disabled = block !== '';
        btn.title = block || 'Permissive and restore preview met: relight ' + d.id;
        btn.addEventListener('click', () => actions.input({type: 'restore', district: d.id}));
        row.append(btn, el(doc, 'span', 'kv grow', d.id + ' (' + d.suburb + ', ' + (d.uflsStage ? 'UFLS ' + d.uflsStage : 'rotation') +
          ', by ' + d.shedBy + ') · ' + mw(d.coldLoadMW) + ' MW cold' + (block ? ' · ' + block : '')));
        els.restoreList.appendChild(row);
      }
    }

    // News.
    if (obs.news.length !== newsCount) {
      newsCount = obs.news.length;
      els.news.textContent = '';
      if (!newsCount) els.news.textContent = 'none';
      for (const n of obs.news.slice(-3)) els.news.appendChild(el(doc, 'div', '', clockText(n.atS, false) + ' ' + n.text));
    }

    // Last contingency (K-15 / K-16 numbers from the trace record).
    const c = obs.contingency;
    if (c) {
      const tr = traceOf(rec, c.n);
      const pvT = tr && tr.preview && tr.preview.lId === c.id ? ' · preview said ' + hz(tr.preview.nadirHz) : '';
      const caught = Object.entries(c.caught).map(([k2, x]) => k2.replace('MW', '') + ' ' + mw(x)).join(', ');
      setText(els.cont, '#' + c.n + ' ' + c.cause + ' ' + unitName(c.id) + ': ' + mw(Math.abs(c.lostMW)) + ' MW at ' +
        tickClock(c.startTick) + ' · RoCoF ' + c.rocofHzS.toFixed(3) + ' Hz/s · ' + (c.lostMW >= 0 ? 'nadir ' : 'peak ') +
        hz(c.extremeHz) + ' Hz at T+' + ((c.extremeTick - c.startTick) / TPS).toFixed(2) + ' s' + pvT + ' · ' +
        (c.contained ? 'contained' : 'NOT contained') + (c.uflsStages ? ' · UFLS stages ' + c.uflsStages : '') + ' · back in band ' +
        (c.backInBandTick >= 0 ? 'T+' + ((c.backInBandTick - c.startTick) / TPS).toFixed(0) + ' s' : 'not yet') +
        ' · caught at the extreme: ' + caught);
    }

    // Charts.
    const tr = traceOf(rec);
    const recent = tr && obs.tick - tr.startTick < 2 * V.WATCH_S * TPS && mode.rate <= 10;
    const showWatch = tr && (watch || mode.locked || recent || pinTrace);
    const hint = tr ? (showWatch ? '' : ' · click: last trip') : '';
    if (showWatch) {
      drawWatch(els.live, tr, {alphaF: interpolatedF(rec, v.pacer.alpha), alpha: v.pacer.alpha});
    } else if (mode.rate > 0 && mode.rate <= 10 || (mode.rate === 0 && v.sess.director.speed <= 10)) {
      drawFreqWindow(els.live, {kind: 'ticks', values: recentTicks(rec, TICK_WINDOW_S * TPS), spanS: TICK_WINDOW_S},
        'FREQUENCY · last ' + TICK_WINDOW_S + ' s, every 20-ms tick' + hint);
    } else {
      const nowS = Math.floor(obs.tick / TPS);
      drawFreqWindow(els.live, Object.assign({kind: 'seconds'}, secondsWindow(rec, nowS - SEC_WINDOW_S, nowS)),
        'FREQUENCY · last ' + SEC_WINDOW_S / S_PER_MIN + ' min, min–max per second and mean' + hint);
    }
    const nowMin = Math.floor(obs.tick / (TPS * S_PER_MIN));
    if (v.nowMs - lastDayDraw > DRAW_DAY_EVERY_MS || rec.lastMinute !== lastDayMinute) {
      if (rec.lastMinute !== lastDayMinute || v.nowMs - lastDayDraw > DRAW_DAY_EVERY_MS * 4) {
        lastDayDraw = v.nowMs;
        lastDayMinute = rec.lastMinute;
        drawFreqDay(els.fday, rec.minute, nowMin, 'FREQUENCY · 24 h (min–max per minute; red = outside 49.5–50.5)');
        drawDemandDay(els.demand, rec.minute, nowMin, obs.forecast, 'DEMAND AND SUPPLY · 24 h (MW)');
        drawPriceDay(els.price, rec.minute, nowMin, 'PRICE · 24 h ($/MWh, log scale)');
      }
    }
  }

  function updateMachine(m, u, controlMode) {
    setClass(m.box, 'mach ' + u.mode + (u.hotS > 0 ? ' hot' : ''));
    let word = modeWord[u.mode] || u.mode, action = '', label = '', why = '';
    switch (u.mode) {
      case 'off': action = u.startBlock ? '' : 'start'; label = 'START'; why = u.startBlock || 'START: T1 then sync'; break;
      case 'starting': word += ' ' + mmss(u.timerS); action = 'cancel'; label = 'CANCEL'; break;
      case 'ready': word += controlMode === 'AGC' ? ' auto ' + mmss(u.timerS) : ''; action = 'syncClose'; label = 'SYNC';
        why = 'Close the breaker now (K-12 stub: always clean)'; break;
      case 'loading': word += ' ' + mw(u.outMW); action = u.stopBlock ? '' : 'stop'; label = 'STOP'; why = u.stopBlock; break;
      case 'on': word = mw(u.outMW); action = u.stopBlock ? '' : 'stop'; label = 'STOP';
        why = u.stopBlock || 'STOP: unload to minimum, then T4 (H-1)'; break;
      case 'unloading': case 'shutdown': word += ' ' + mw(u.outMW); action = 'abortStop'; label = 'ABORT'; break;
      case 'tripped': word += ' ' + mmss(u.timerS); label = 'LOCKED'; why = 'Protection lockout; then a hot start is allowed'; break;
      default: break;
    }
    setText(m.label, m.id.replace(/^[a-z]+/, '#') + ' ' + word);
    if (!m.btn.classList.contains('armed')) setText(m.btn, label || '-');
    setDisabled(m.btn, !action);
    setTitle(m.box, m.id + ': ' + u.mode + (u.hotS > 0 ? ' · RUNNING HOT ' + u.hotS + ' s (trip risk)' : '') +
      ' · starts ' + u.starts + (why ? ' · ' + why : ''));
    m.action = action;
  }

  function showEnd(obs, extra) {
    const e = els.end;
    e.textContent = '';
    const sc = obs.score;
    e.append(el(doc, 'h2', '', obs.black ? 'The grid went black at ' + obs.clock.text : 'Day over'));
    for (const line of [
      'LIGHTS ON: ' + mw(sc.unservedMWh, 1) + ' MWh unserved of ' + mw(sc.servedMWh) + ' MWh served',
      'CUSTOMER COST: ' + (Number.isFinite(sc.centsPerKWh) ? sc.centsPerKWh.toFixed(2) : '-') + ' c/kWh (' + dollars(sc.costDollars) + ')',
      'CARBON: ' + (Number.isFinite(sc.co2tPerMWh) ? sc.co2tPerMWh.toFixed(3) : '-') + ' t/MWh (' + mw(sc.co2t) + ' t)',
      'Frequency ' + hz(sc.minHz) + '–' + hz(sc.maxHz) + ' Hz; outside the normal band ' + mmss(sc.outsideNormalS),
      'Contingencies ' + obs.contingencies.length + ' · starts ' + sc.starts + (obs.rert.armedEver ? ' · glass broken' : ''),
    ]) e.appendChild(el(doc, 'div', 'kv', line));
    for (const line of extra) e.appendChild(el(doc, 'div', 'faint', line));
    const close = el(doc, 'button', '', 'CLOSE');
    close.addEventListener('click', () => { e.hidden = true; });
    const save = el(doc, 'button', '', 'SAVE LOG');
    save.addEventListener('click', () => actions.saveLog());
    const row = el(doc, 'div', 'row');
    row.style.marginTop = '8px';
    row.append(save, close);
    e.appendChild(row);
    e.hidden = false;
  }

  function reset(seed) {
    els.seed.value = String(seed);
    resetLog();
    els.end.hidden = true;
    restoreKey = ''; newsCount = -1; lastDayMinute = -2; lastDayDraw = -1e9; pinTrace = false;
    els.cont.textContent = 'none yet';
  }

  return {update, appendRecords, showEnd, reset, toggleDrawer};
}
