// app/boot.js: starts the bench (next.html). Wires the session (the sim, director, loop,
// recorder, assist) to the DOM view and the frame loop. Nothing here steps the sim except
// through app/session.js, and drawing happens after each frame's ticks, never inside step()
// (F-5, X-26).
//
// URL query: ?seed=N (default: today's date as YYYYMMDD) &assist=off|plan|par &speed=R
// (one of the debug speeds) &play=1 (start playing at once).

import {V} from '../sim/params.js';
import {observe, hashState, SIM_VERSION} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import {startRaf, effectiveRate} from './loop.js';
import {modeOf, togglePause, setSpeed, skipWatch, DEBUG_RATES, FLAT_RATE} from './director.js';
import {createSession, frame, sendInput, requestDebugTrip, setAssist, runTo, sessionLog, note, replan, restoreChecks} from './session.js';
import {ASSIST_KINDS} from './assist.js';
import {bindKeys} from './input.js';
import {createBench} from '../render/bench.js';

const doc = globalThis.document;
const query = new URLSearchParams(globalThis.location ? globalThis.location.search : '');

function todaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function initialOptions() {
  const seed = query.has('seed') ? Number(query.get('seed')) >>> 0 : todaySeed();
  const assist = ASSIST_KINDS.includes(query.get('assist')) ? query.get('assist') : 'off';
  const r = Number(query.get('speed'));
  const speed = DEBUG_RATES.includes(r) ? r : FLAT_RATE;
  return {seed, assist, speed, paused: query.get('play') !== '1'};
}

let sess = null, endShown = false;
const now = () => globalThis.performance.now();

const actions = {
  input(x) { if (sess) sendInput(sess, x); },
  togglePause() { if (sess && !sess.state.over) togglePause(sess.director); },
  setSpeed(r) { if (sess) setSpeed(sess.director, r); },
  skipWatch() { if (sess) skipWatch(sess.director, sess.state); },
  setAgc(agc) { if (sess) sendInput(sess, {type: 'mode', agc}); },
  setAssist(k) { if (sess && sess.assist.kind !== k) setAssist(sess, k); },
  replan() { if (sess) replan(sess); },
  skipToDesk() { if (sess && sess.state.tick < V.PLAYER_START_TICK) runTo(sess, V.PLAYER_START_TICK); },
  newDay(seed) { start(Object.assign(initialOptions(), {seed: Number.isFinite(seed) ? seed >>> 0 : todaySeed(), paused: true,
    assist: sess ? sess.assist.kind : 'off', speed: sess ? sess.director.speed : FLAT_RATE})); },
  saveLog() { if (sess) download('gridwatch-' + SIM_VERSION + '-seed-' + sess.seed + '.json', JSON.stringify(sessionLog(sess), null, 1)); },
  debugTrip() { if (sess) requestDebugTrip(sess); },
};

function download(name, text) {
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  a.download = name;
  doc.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

const bench = createBench(doc, actions);

function start(o) {
  sess = createSession({seed: o.seed, scenario: CLASSIC, assist: o.assist, speed: o.speed, paused: o.paused});
  endShown = false;
  bench.reset(sess.seed);
  note(sess, 'info', 'BENCH', 'Seed ' + sess.seed + ', ' + CLASSIC.name + ' (' + SIM_VERSION + '). Briefing: choose AGC ' +
    'or HAND now (locked at 04:30 or at your first input), then PLAY (Space) or SKIP TO 04:30. ASSIST lets the plan or par drive.');
}

function onFrame(dtS) {
  if (!sess) return;
  frame(sess, dtS, now);
  const state = sess.state;
  const obs = observe(state);
  const mode = modeOf(sess.director, state);
  bench.appendRecords(sess.records, sess.recordSeq);
  bench.update({obs, mode, rec: sess.rec, pacer: sess.pacer, eff: effectiveRate(sess.pacer), sess, nowMs: now(),
    restore: restoreChecks(sess, obs)});
  if (state.over && !endShown) {
    endShown = true;
    bench.showEnd(obs, ['hashState 0x' + hashState(state).toString(16).padStart(8, '0') + ' · seed ' + sess.seed + ' · ' +
      SIM_VERSION + ' · ' + state.log.length + ' inputs logged' + (sess.poked ? ' · DEBUG trip used: the log does not replay' : '')]);
  }
}

bindKeys(doc, a => {
  if (a.do === 'pause') actions.togglePause();
  else if (a.do === 'skipWatch') actions.skipWatch();
  else if (a.do === 'speed') actions.setSpeed(a.rate);
  else if (a.do === 'help') bench.toggleDrawer();
});

start(initialOptions());
startRaf(onFrame, hidden => { if (sess) sess.director.hidden = hidden; });
