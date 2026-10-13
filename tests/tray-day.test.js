// 2c's desk on the designed day (desk/README.md §32.7.3): the tray's briefing cards and card life (Q-63,
// Q-81), its senders and cards by kind (Q-82, Q-70), the quiet night (Q-73); the explainers' PEAK and
// WEATHER; the end card's HAND-FLOWN, gate label and task-feeder line; the bay's held feeders (FAULT,
// the hand-back's glow, the repair reason as a red refusal), the tie knob's import limit and the night
// lock's blue note. One real desk morning (seed 8, run once to 06:30:01 in before(), ~0.2 s) with three
// short records put on it by tests/lib/inject.js; everything else is a 04:00 state or a pure call.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import {gridAfter, stepAfter} from '../sim/clock.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {stateWith} from './lib/inject.js';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import * as T from '../app/tray.js';
import * as A from '../app/alarms.js';
import * as G from '../app/game.js';
import {ALARM_HELP} from '../content/alarmhelp.js';
import {createEndCard} from '../app/endcard.js';
import {createDesk, NIGHT_NOTE} from '../desk/desk.js';
import {tieSnap} from '../desk/calc.js';

const TPS = V.TICKS_PER_S, H = h => (h - V.DAY_START_H) * V.S_PER_H;

// DESK seed 8: TAL3 and TAL4 held until 06:30 and 07:00, CCGT 2 out until 07:35. Put on it: a tie derate
// 04:00-04:05 and CCGT 2's return at 04:10, so the information cards' records come from the real appliers.
const DAY = {};
before(() => {
  const s = stateWith(8, DESK, [{atS: 0, type: 'tieDerate', args: {limitMW: 450, untilS: 300}}, {atS: 300, type: 'tieDerateEnd', args: {}},
    {atS: 600, type: 'unitReturn', args: {unit: 'ccgt2'}}]);
  DAY.recs = [];
  while (s.tick < (H(6.5) + 1) * TPS) {
    DAY.recs.push(...step(s));
    if (s.tick === V.PLAYER_START_TICK) DAY.dawn = observe(s);
  }
  DAY.back = observe(s);
});
const rec = code => DAY.recs.find(r => r.code === code);

test('Q-81: TAKE THE DESK makes one card per 04:00 news item with one ring, as play makes them; all in the LOG at gridAfter(04:30, 20 real s); classic\'s is []', () => {
  const st = createState(20261007, DESK), tr = T.createTray();   // heat, the feeders, the late return
  assert.deepEqual(st.news.map(n => n.kind), ['heat', 'network', 'outage']);
  assert.deepEqual(T.trayBriefing(tr, st.news), ['ring2'], 'one ring for the briefing');
  assert.deepEqual(tr.cards.map(c => [c.from, c.button.target, c.atS, c.sev]),
    [['WEATHER BUREAU', 'stack', 0, 'warn'], ['NETWORK', 'bay-restore', 0, 'warn'], ['STATION', 'lever-ccgt', 0, 'warn']]);
  assert.deepEqual(T.trayView(tr).cards.map(c => c.time), ['04:00', '04:00', '04:00']);
  assert.deepEqual(T.trayBriefing(tr, st.news), [], 'a card is never made twice');
  assert.deepEqual(T.trayRecords(tr, [{tick: TPS, kind: 'announce', news: st.news[1]}]), [], '...nor by its record');
  // the briefing's plain 20 real s from 04:30 (the heat's onset is later: no hold for a briefing card)
  const end = Math.ceil(gridAfter(V.PLAYER_START_S, V.TRAY_LIFE_REAL_S));
  T.trayFrame(tr, end - 1);
  assert.equal(tr.cards.length, 3);
  T.trayFrame(tr, end);
  assert.deepEqual([tr.cards.length, tr.log.length], [0, 3]);
  // classic announces nothing at 04:00: no card, no ring
  const c = T.createTray();
  assert.deepEqual(T.trayBriefing(c, createState(4, CLASSIC).news), []);
  assert.equal(c.cards.length, 0);
  // over three, the oldest cards go first
  const full = T.createTray();
  T.trayRecords(full, [{tick: 60 * TPS, kind: 'log', sev: 'info', code: 'UNIT_RELEASED', msg: 'GT·A released.'}]);
  T.trayBriefing(full, st.news);
  assert.deepEqual(full.cards.map(x => x.from), ['WEATHER BUREAU', 'NETWORK', 'STATION']);
});

test('Q-63: a warning issued in play is held to its onset while a newer information card expires behind it; every expired card is retired', () => {
  const tr = T.createTray(), warnS = H(12), onS = H(14);
  assert.deepEqual(T.trayRecords(tr, [{tick: warnS * TPS, kind: 'announce', news: {atS: warnS, kind: 'cloud', fromS: onS, toS: null,
    text: 'Cloud front over the suburbs from about 14:00, west to east.'}}]), ['ring2']);
  assert.deepEqual(T.trayRecords(tr, [Object.assign({}, rec('UNIT_AVAILABLE'), {tick: (warnS + 60) * TPS})]), ['tick']);
  const infoEnd = stepAfter(warnS + 60, V.TRAY_LIFE_REAL_S);
  assert.ok(infoEnd < onS, 'the information card\'s 20 real s end before the warning\'s onset');
  T.trayFrame(tr, Math.ceil(infoEnd) - 1);
  assert.equal(tr.cards.length, 2);
  T.trayFrame(tr, Math.ceil(infoEnd));
  assert.deepEqual(tr.cards.map(c => c.from), ['WEATHER BUREAU'], 'the newer card went; the older warning stays');
  assert.equal(tr.log.at(-1).from, 'STATION');
  T.trayFrame(tr, onS - 1);
  assert.equal(tr.cards.length, 1);
  T.trayFrame(tr, onS);
  assert.equal(tr.cards.length, 0, 'gone at its onset');
});

test('Q-91, Q-82: a feeder handed back rings and says what to press, and its restore takes that card to the LOG; a unit\'s return and the tie limit\'s end are information; onsets of a front or a drought tick', () => {
  const one = r => { const tr = T.createTray(), cues = T.trayRecords(tr, [r]); return [cues, tr.cards[0], tr]; };
  const [fc, clear, tr] = one(rec('FEEDER_CLEAR'));
  assert.deepEqual([fc, clear.from, clear.sev, clear.button], [['ring2'], 'NETWORK', 'warn', {label: 'TO THE RESTORE BAY', target: 'bay-restore'}]);
  assert.equal(clear.text, 'TAL3 feeder repaired and handed back: close its breaker (R or Enter at its card, or from the RESTORE bay).');
  T.trayRecords(tr, [{tick: 1, kind: 'restore', district: 'TAL4', mw: 200}]);
  assert.equal(tr.cards.length, 1, 'another district\'s restore leaves it');
  assert.deepEqual([T.trayRecords(tr, [{tick: 2, kind: 'restore', district: 'TAL3', mw: 200}]), tr.cards.length, tr.log.map(c => c.text)], [[], 0, [clear.text]],
    'closed: to the LOG, silently');
  const [uc, unit] = one(rec('UNIT_AVAILABLE'));
  assert.deepEqual([uc, unit.from, unit.sev, unit.button.target], [['tick'], 'STATION', 'info', 'lever-ccgt']);
  const [tc, tie] = one(rec('TIE_LIMIT_END'));
  assert.deepEqual([tc, tie.from, tie.sev, tie.button.target], [['tick'], 'MARKET NOTICE', 'info', 'knob-tie']);
  const [hc, heat] = one({tick: 0, kind: 'log', sev: 'crit', code: 'HEAT_ONSET', msg: 'HEATWAVE CONDITIONS'});
  assert.deepEqual([hc, heat.from, heat.button.target], [['ring2'], 'WEATHER BUREAU', 'stack']);
  for (const c of [clear, unit, tie]) assert.ok(c.text.split(/\s+/).length <= T.MAX_WORDS, c.text);
});

test('Q-82, Q-83: on the designed day a warned drought\'s onset and the front over the suburbs tick; classic\'s precinct front makes no card, and a legacy drought (its announce and the log twin in one batch) makes one', () => {
  const play = (seed, scn, recs, toS) => {
    const s = stateWith(seed, scn, recs), tr = T.createTray(), cues = [];
    while (s.tick < toS * TPS) cues.push(...T.trayRecords(tr, step(s)));
    return [cues, tr.cards.map(c => [c.from, c.sev, c.button.target, c.text.split(':')[0]])];
  };
  assert.deepEqual(play(4, CLASSIC, [{atS: 60, type: 'windDrought', args: {windMu: 0.12}}, {atS: 120, type: 'cloudOnset', args: {clearMu: 0.3}}], 121),
    [['ring2'], [['WEATHER BUREAU', 'warn', 'stack', 'WIND DROUGHT']]]);
  assert.deepEqual(play(1, DESK, [{atS: 60, type: 'droughtWarn', args: {onsetS: 120, muPm: 120}}, {atS: 120, type: 'windDrought', args: {windMu: 0.12}},
    {atS: 180, type: 'cloudOnset', args: {clearMu: 0.32, suburbs: true, clearS: 3600}}], 181), [['ring2', 'tick', 'tick'],
    [['WEATHER BUREAU', 'warn', 'stack', 'Wind drought from about 04'], ['WEATHER BUREAU', 'info', 'stack', 'Wind drought'], ['WEATHER BUREAU', 'info', 'stack', 'Cloud front reaching the western suburbs']]]);
});

test('Q-82: an outage card from a real unitOutage record (inject) goes to the unit\'s lever: CCGT on desk, coal on the weekend', () => {
  for (const [seed, scn, unit, target] of [[1, DESK, 'ccgt2', 'lever-ccgt'], [20261003, DESK_WEEKEND, 'coal4', 'lever-coal']]) {
    const st = stateWith(seed, scn, [{atS: 0, type: 'unitOutage', args: {unit, untilS: H(9)}}]), tr = T.createTray();
    T.trayBriefing(tr, st.news);
    const c = tr.cards.find(x => x.from === 'STATION');
    assert.deepEqual(c.button, {label: 'TO THE LEVER', target}, scn.id);
    assert.match(c.text, /unavailable until 09:00/);
  }
});

test('Q-73: from the night shift\'s record on, the tray\'s cards are quiet; the alarms are quiet in the night roll', () => {
  const tr = T.createTray();
  assert.deepEqual(T.trayRecords(tr, [{tick: H(21) * TPS, kind: 'log', sev: 'info', code: 'NIGHT_SHIFT', msg: 'The night shift has the desk.'},
    {tick: H(22) * TPS, kind: 'contingency', cause: 'unit', id: 'coal2', lostMW: 500}]), []);
  assert.equal(tr.cards.length, 1, 'the card is made (the LOG keeps the night), without a ring');
  const a = A.createAlarms(), x = {s: H(22), h: 22, fHz: 49.4, rocof: 0, level: 'SHORT', agcAtLimitS: 0, hydroFrac: 0.8, battFrac: 0.5, inWatch: false,
    contCount: 0, cont: null, newsCount: 0, news: [], night: true};
  const r = A.updateAlarms(a, x, {nowMs: 0, realDtS: 0.1});
  assert.deepEqual([r.cues, A.alarmsView(a).tiles.find(t => t.id === 'underFreq').state], [[], 'alarm'], 'the tile shows; the horn is quiet');
  assert.equal(A.alarmInputFromState(createState(8, DESK)).night, false);
});

test('Q-78, Q-82: no explainer prints an hour as "16.5:00"; PEAK names 16:30; WEATHER counts weather only (0 on a derate-and-feeders morning)', () => {
  const texts = [];
  const walk = x => { if (typeof x === 'string') texts.push(x); else if (x && typeof x === 'object') Object.values(x).forEach(walk); };
  walk(ALARM_HELP);
  for (const t of texts) assert.doesNotMatch(t, /\d\.\d+:00/, t);
  assert.match(ALARM_HELP.peak.trigger, /^Sets from 16:30 to 20:00 /);
  const morning = observe(createState(20261003, DESK_WEEKEND));
  assert.deepEqual(morning.news.map(n => n.kind), ['network', 'tie']);
  assert.equal(ALARM_HELP.weather.reading(morning), 'warnings today: 0');
  assert.ok(ALARM_HELP.weather.reading(observe(createState(20261007, DESK))).startsWith('warnings today: 1 · 04:00 Heatwave'));
  // the alarms read every item of a batch: the 04:00 heat lights WEATHER though the feeders' news came after it
  const a = A.createAlarms();
  A.updateAlarms(a, A.alarmInputFromState(createState(20261007, DESK)), {nowMs: 0, realDtS: 0});
  assert.equal(A.alarmsView(a).tiles.find(t => t.id === 'weather').state, 'alarm');
  const b = A.createAlarms();
  A.updateAlarms(b, A.alarmInputFromState(createState(20261003, DESK_WEEKEND)), {nowMs: 0, realDtS: 0});
  assert.equal(A.alarmsView(b).tiles.find(t => t.id === 'weather').state, 'normal', 'a derate and feeders are not weather');
});

/** The end card mounted on a game's end (app/game.js buildVm). */
function endText(g) {
  g.state.over = true;
  const vm = G.buildVm(g, {nowMs: 0, dtS: 0}), doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  createEndCard(doc, root, {}, {par: () => null, households: () => 1.9e6, log: () => ({}), again() {}, toggleHelp() {}, toast() {}}).update(vm);
  return root.textContent;
}

test('Q-64, Q-75, Q-69: the end card says HAND-FLOWN after the 21:00 flip, "Not gate-checked" only for an unchecked daily, and counts task feeders from the hand-back', () => {
  const g = G.createGame({seed: 20261008, scenario: DESK, storage: null});
  G.sendInput(g, {type: 'mode', agc: false});   // the briefing's choice
  G.takeDesk(g);
  G.runTo(g, g.state.tick + 120 * TPS);
  assert.equal(g.state.control.handFlown, true, 'the sim tags the day on the tick it reaches 04:30');
  const pre = endText(g);   // ended before 21:00 (a black day ends at once): no night shift took the desk
  assert.match(pre, /HAND-FLOWN: AGC off from 04:30\./);
  assert.doesNotMatch(pre, /21:00/);
  Object.assign(g.state.control, {mode: 'AGC', nightShift: true});   // what sim/step.js's 21:00 flip leaves
  const t = endText(g);
  assert.match(t, /HAND-FLOWN: AGC off from 04:30 until the night shift took the desk at 21:00\./);
  assert.doesNotMatch(t, /gate-checked/, 'a bare seed is not a daily: no label');
  assert.match(t, /Feeders under repair count from their hand-back: the [\d.]+ MWh dark before it were the network's outage, not priced\./);
  const d = G.createGame({daily: G.dailyFrom('?seed=20261008'), storage: null});
  G.takeDesk(d);
  const u = endText(d);
  assert.equal(d.end.gated, false);
  assert.match(u, /Not gate-checked: this day may not be solvable\./);
  assert.doesNotMatch(u, /HAND-FLOWN/);
  const c = G.createGame({seed: 4, storage: null});
  G.takeDesk(c);
  assert.doesNotMatch(endText(c), /Feeders under repair|HAND-FLOWN|gate-checked/, 'classic\'s card as before');
});

// ---------------------------------------------------------------- the desk: the bay, the tie, the night

function mount(obs, over) {
  const doc = makeDocument(), root = doc.createElement('div'), a = {inputs: [], uis: [], input(x) { a.inputs.push(x); return ''; }, ui(x) { a.uis.push(x); },
    previewTrip: () => null, restorePreview: () => ''};
  root.id = 'desk';
  doc.body.appendChild(root);
  const desk = createDesk(doc, root, a), vm = baseVm(structuredClone(obs), over);
  desk.update(vm);
  const $ = id => doc.getElementById(id), up = (ms, o = {}) => desk.update(Object.assign({}, vm, o, {frame: {nowMs: ms, dtS: 1 / 60, alpha: 0}}));
  const note = host => { const n = host.children.find(c => c.classList && c.classList.contains('dk-note')); return n && !n.hidden ? (n.classList.contains('info') ? 'blue ' : 'RED ') + n.textContent : ''; };
  return {doc, desk, vm, a, $, up, note};
}
const bayOf = $ => $('bay-restore').parentElement.parentElement;

test('§32.11 (desk): held feeders never choose the bay\'s view; their rows read FAULT and when they are back; a press is a red refusal with the repair reason', () => {
  const m = mount(DAY.dawn), {$} = m;
  assert.deepEqual(DAY.dawn.districts.filter(d => d.dark).map(d => d.id + '@' + d.clearS), ['TAL3@' + H(6.5), 'TAL4@' + H(7)]);
  assert.equal($('restore-list').parentElement.hidden, true, 'the bay stays on SYNC: nothing dark is the player\'s');
  assert.equal($('bay-restore').textContent, '✕2 RESTORE', 'the tab still counts them (as the map and the line do)');
  assert.deepEqual(['glow', 'lit'].map(c => $('bay-restore').classList.contains(c)), [false, false], 'nothing there to press yet');
  $('bay-restore').click();
  const rows = $('restore-list').querySelectorAll('.dk-feeder');
  assert.deepEqual(rows.map(r => r.querySelector('.dk-feeder-name').textContent), ['▸ TAL3 · FAULT · BACK 06:30', 'TAL4 · FAULT · BACK 07:00']);
  // listed by when they come back, whatever the district order
  const late = structuredClone(DAY.dawn);
  late.districts.find(d => d.id === 'TAL3').clearS = H(7.5);
  const l = mount(late);
  l.$('bay-restore').click();
  assert.deepEqual(l.$('restore-list').querySelectorAll('.dk-feeder-name').map(n => n.textContent.replace('▸ ', '')), ['TAL4 · FAULT · BACK 07:00', 'TAL3 · FAULT · BACK 07:30']);
  $('restore-TAL4').click();
  assert.equal(m.note(bayOf($)), 'RED ✕ feeder under repair until 07:00');
  assert.deepEqual(m.a.inputs, [], 'nothing sent');
});

test('Q-70, Q-91: at a hand-back the bay opens on RESTORE with that feeder chosen (REPAIRED), the tab glows while its feeder card holds the clock, and R chooses the feeder that can close', () => {
  const m = mount(DAY.back), {$} = m;
  const tal3 = DAY.back.districts.find(d => d.id === 'TAL3'), tal4 = DAY.back.districts.find(d => d.id === 'TAL4');
  assert.deepEqual([tal3.dark, tal3.clearS <= DAY.back.s, tal4.clearS > DAY.back.s], [true, true, true]);
  assert.equal($('restore-list').parentElement.hidden, false, 'RESTORE: a feeder is the player\'s now');
  assert.deepEqual(['glow', 'lit'].map(c => $('bay-restore').classList.contains(c)), [false, true], 'lit: one is the player\'s; no glow without its card');
  m.up(1500, {mode: {mode: 'FEEDER-CARD', rate: 0, watchS: -1, locked: false, watchVersion: null}, feeder: {id: 'TAL3'}});
  assert.equal($('bay-restore').classList.contains('glow'), true, 'the hand-back\'s moment');
  const names = () => $('restore-list').querySelectorAll('.dk-feeder-name').map(n => n.textContent);
  assert.deepEqual(names(), ['▸ TAL3 · REPAIRED', 'TAL4 · FAULT · BACK 07:00']);
  // the player had chosen the held one; R chooses again: the one that can close
  $('restore-list').querySelectorAll('.dk-feeder')[1].click();
  assert.equal(names()[1], '▸ TAL4 · FAULT · BACK 07:00');
  assert.equal(m.desk.key({type: 'keydown', key: 'r', target: m.doc.body}), true);
  m.up(2000);
  assert.equal(names()[0], '▸ TAL3 · REPAIRED');
  // a UFLS district dark ahead of it in district order: R still takes the feeder just handed back
  const u = structuredClone(DAY.back), x = u.districts.slice(0, u.districts.findIndex(d => d.id === 'TAL3')).find(d => !d.dark);
  Object.assign(x, {dark: true, shedBy: 'ufls', restoreBlock: ''});
  const n = mount(u);
  n.$('restore-list').querySelectorAll('.dk-feeder')[0].click();
  assert.match(n.$('restore-list').querySelector('.sel').textContent, new RegExp('^▸ ' + x.id + ' · UFLS'));
  assert.equal(n.desk.key({type: 'keydown', key: 'r', target: n.doc.body}), true);
  assert.match(n.$('restore-list').querySelector('.sel').textContent, /^▸ TAL3 · REPAIRED/);
});

test('Q-70, Q-42: the FEEDER_CLEAR card\'s button, then Enter, then Enter closes the feeder it names (Enter on RESTORE goes into the list, as R)', () => {
  const m = mount(DAY.back), {$} = m;
  m.desk.focus('bay-restore');   // the card's TO THE RESTORE BAY (actions.ui focus)
  assert.equal(m.doc.activeElement.id, 'bay-restore');
  assert.equal(m.desk.key({type: 'keydown', key: 'Enter', target: m.doc.activeElement}), true, 'the press answers');
  assert.equal(m.doc.activeElement.id, 'restore-list');
  m.doc.dispatch('keydown', {key: 'Enter'});
  assert.deepEqual(m.a.inputs, [{type: 'restore', district: 'TAL3'}]);
});

test('Q-68: the tie knob shows and clamps the import limit (End stops at it, a turn past it says why in blue); calc.tieSnap never snaps past it', () => {
  const obs = structuredClone(DAY.back);
  Object.assign(obs.tie, {importLimitMW: 450, limitUntilS: H(11), setMW: 300});
  const m = mount(obs), {$} = m, knob = $('knob-tie'), box = knob.parentElement.parentElement;
  assert.equal(knob.getAttribute('aria-valuemax'), '450');
  assert.match(knob.getAttribute('aria-valuetext'), /imports limited to 450 MW until 11:00/);
  assert.match(box.textContent, /● IMP ≤450/);
  knob.focus();
  m.doc.dispatch('keydown', {key: 'End'});
  m.up(2000);
  assert.deepEqual(m.a.inputs, [{type: 'tie', mw: 450}]);
  const at = structuredClone(obs);
  at.tie.setMW = 450;
  m.up(3000, {obs: at});
  m.doc.dispatch('keydown', {key: 'ArrowUp'});
  assert.equal(m.note(box), 'blue imports limited to 450 MW until 11:00');
  // the lamp reports a constraint: amber, never LINK OK's green; a wheel turn past the limit says why too
  const lamp = box.querySelector('.dk-link');
  assert.deepEqual(['lit', 'warn'].map(c => lamp.classList.contains(c)), [false, true]);
  const w = mount(at), wb = w.$('knob-tie').parentElement.parentElement;
  w.$('knob-tie').dispatch('wheel', {deltaY: -100});
  assert.equal(w.note(wb), 'blue imports limited to 450 MW until 11:00');
  assert.deepEqual([tieSnap(480, 450), tieSnap(262, 450), tieSnap(490), tieSnap(-790, 450)], [450, 250, 500, -800]);
});

test('Q-73: in the night the desk is the night shift\'s: a press says so in blue and sends nothing; the views and ACK stay open', () => {
  const obs = structuredClone(DAY.back);
  obs.nightShift = true;
  const m = mount(obs), {$} = m;
  assert.equal(m.desk.el.classList.contains('dk-locked'), true);
  $('restore-TAL3').click();
  assert.equal(m.note(bayOf($)), 'blue ' + NIGHT_NOTE);
  $('knob-tie').focus();
  m.doc.dispatch('keydown', {key: 'ArrowUp'});
  assert.equal(m.note($('knob-tie').parentElement.parentElement), 'blue ' + NIGHT_NOTE);
  assert.equal(m.note(bayOf($)), '', 'one night note at a time: the newest');
  assert.deepEqual(m.a.inputs, []);
  $('bay-sync').click();
  assert.equal($('restore-list').parentElement.hidden, true, 'the tabs still switch the view');
  assert.equal(m.desk.key({type: 'keydown', key: 'a', target: m.doc.body}), true, 'ACK');
});

test('Q-73: in the night a key on a lever that has lost the focus answers on it in blue (never the shell\'s fallback); a tray card\'s button still goes to its view', () => {
  const card = {id: 'card1', from: 'MARKET NOTICE', atS: H(21.5), time: '21:30', sev: 'warn', text: 'Lowest demand 1,540 MW at 03:30.', button: {label: 'SEE THE STACK', target: 'stack'}};
  const obs = structuredClone(DAY.back);
  obs.nightShift = true;
  const m = mount(obs, {focus: 'lever-ccgt', tray: {cards: [card], log: []}}), slot = m.$('lever-ccgt').closest('.dk-lever-slot');
  m.doc.body.focus();
  for (const key of ['ArrowUp', 's', 's']) assert.equal(m.desk.key({type: 'keydown', key, target: m.doc.body}), true, key);
  assert.equal(m.note(slot), 'blue ' + NIGHT_NOTE);
  assert.deepEqual(m.a.inputs, []);
  const b = m.doc.querySelector('.dk-card-btn');
  assert.equal(b.getAttribute('aria-disabled'), 'false');
  b.click();
  assert.deepEqual(m.a.uis.filter(u => u.do === 'focus'), [{do: 'focus', target: 'stack'}]);
});
