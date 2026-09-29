// Phase 0.1 acceptance tests (spec §5, "The live game, made honest"), run against the
// legacy index.html through the headless harness in tools/.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
const H = require('../tools/harness.js');
const P = require('../tools/policies.js');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Put the grid in balance at 04:00 with no demand noise, as tools/baseline.js does.
function balanced(seed) {
  const G = H.load({seed});
  G.start(); G.S.noise = 0; G.tick();
  const gap = G.S.served - G.S.supply;
  G.FU.hyd.out += gap; G.FU.hyd.set = G.FU.hyd.out; G.S.freq = 50; G.S.dev = 0;
  return G;
}

test('H-1: STOP unloads a unit at its ramp rate instead of deleting its output', () => {
  const G = H.load({seed: 3});
  const pol = P.competent();
  const coal = G.FU.coal;
  G.start();
  let stopped = false, lastMin = -1, lastOut = null, maxDrop = 0;
  while (!G.S.over && G.S.t < 240) { // through 08:00
    pol(G);
    if (!stopped && G.S.t >= 10) { assert.ok(G.stopUnit('coal')); stopped = true; }
    G.tick();
    const m = Math.floor(G.S.t + 1e-9);
    if (m > lastMin) {
      if (lastOut !== null && coal.on) maxDrop = Math.max(maxDrop, lastOut - coal.out);
      lastOut = coal.on ? coal.out : null; lastMin = m;
    }
    assert.equal(G.S.ufls, 0, 'UFLS operated at ' + G.clock(G.S.t));
  }
  assert.equal(G.S.over, false, 'grid went black');
  assert.ok(maxDrop <= 12 + 1e-6, 'coal fell ' + maxDrop + ' MW in one sim-minute');
  assert.equal(coal.on, false, 'coal should have reached its breaker by 08:00');
  assert.ok(G.logs.some(l => /MT HAZEL COAL: breaker open/.test(l.msg)));
});

test('H-2: an overheat trip hits the unit that ran hot, and the log names it', () => {
  let trips = 0, seed = 0;
  while (trips < 100 && seed < 400) {
    seed++;
    const G = H.load({seed});
    G.S.ev = []; // no scheduled contingencies: every trip below is an overheat trip
    const pol = P.competent();
    G.start();
    for (let k = 0; k < 7200 && !G.S.over; k++) {
      pol(G); G.FU.coal.set = 2600; // hold coal above 96%
      const hot = new Set(G.F.filter(u => u.hot > 5).map(u => u.nm));
      const n = G.logs.length;
      G.tick();
      for (const l of G.logs.slice(n)) {
        if (!/UNIT TRIP/.test(l.msg)) continue;
        trips++;
        const u = G.F.find(q => l.msg.includes(q.nm));
        assert.ok(u && hot.has(u.nm), 'seed ' + seed + ': trip hit a unit that was not hot: ' + l.msg);
        assert.match(l.msg, /ran above 96%/);
      }
    }
  }
  assert.ok(trips >= 100, 'only ' + trips + ' overheat trips observed');
  assert.match(HTML, /TRIP RISK ≈3\.5% PER GRID-HOUR/);
});

test('H-3: a tripped coal machine stops counting toward inertia within one tick', () => {
  const G = H.load({seed: 1});
  G.start(); G.tick();
  const before = G.S.M;
  G.tripUnit(false, G.FU.coal);
  G.tick();
  const expected = 2600 * 5 * 0.25 / 6; // coal cap × H × one machine, on the S.M scale
  assert.ok(Math.abs((before - G.S.M) - expected) < 0.01, 'inertia fell by ' + (before - G.S.M));
});

test('H-5: importing more never raises the price', () => {
  const prices = [];
  for (const flow of [0, 400, 800]) {
    const G = H.load({seed: 12});
    const pol = P.competent();
    G.start();
    while (G.S.t < 540) { pol(G); G.tick(); } // 13:00
    assert.equal(G.S.ic.fault, 0);
    G.S.ic.set = G.S.ic.flow = flow;
    G.tick();
    prices.push(G.S.price);
  }
  assert.ok(prices[1] <= prices[0] && prices[2] <= prices[1], 'prices ' + prices);
});

test('H-9: the trip log reports the MW actually removed', () => {
  const G = H.load({seed: 1});
  G.start(); G.tick();
  const removed = [];
  for (const u of [G.FU.coal, G.FU.coal, G.FU.hyd]) {
    const before = u.out; G.tripUnit(false, u); removed.push(before - u.out);
  }
  const logged = G.logs.filter(l => /UNIT TRIP/.test(l.msg))
    .map(l => +l.msg.match(/\(([\d,]+) MW lost/)[1].replace(/,/g, ''));
  assert.equal(logged.length, 3);
  logged.forEach((mw, i) => assert.ok(Math.abs(mw - removed[i]) <= 1, 'logged ' + mw + ', removed ' + removed[i]));
});

test('H-10: a standing charge order on a full battery does not deepen a trip', () => {
  const nadir = set => {
    const G = balanced(1);
    const B = G.S.batt; B.soc = B.e; B.set = set;
    for (let k = 0; k < 5; k++) { G.S.noise = 0; G.tick(); }
    const gap = G.S.served - G.S.supply;
    G.FU.hyd.out += gap; G.FU.hyd.set = G.FU.hyd.out; G.S.freq = 50; G.S.dev = 0;
    G.tripUnit(false, G.FU.coal);
    let lo = 50;
    for (let k = 0; k < 150 && !G.S.over; k++) { G.tick(); lo = Math.min(lo, G.S.freq); }
    return lo;
  };
  const withOrder = nadir(-300), idle = nadir(0);
  assert.ok(Math.abs(withOrder - idle) < 0.001, 'nadir ' + withOrder + ' vs idle ' + idle);
  assert.doesNotMatch(HTML, /bank solar into the battery/);
});

test('H-13: the false CO2 tip is gone', () => {
  assert.doesNotMatch(HTML, /without losing money|Leaning harder on renewables/);
});

test('H-15: no real company or agency names in the game', () => {
  assert.doesNotMatch(HTML, /meridian|alcoa|snowy|\bbom\b/i);
});

test('H-16: the restore rule is stated and alarms are rate-limited', () => {
  assert.match(HTML, /more than 400 MW spare, for 15 sim-minutes/);
  const beeps = [];
  for (let seed = 1; seed <= 30; seed++) {
    const G = H.load({seed});
    let n = 0; G.setBeep(() => { n++; });
    G.runToEnd(P.ctl({every: 50})); // a bot acting every 5 real seconds
    beeps.push(n);
  }
  beeps.sort((a, b) => a - b);
  assert.ok(beeps[15] <= 20, 'median audible alarms per shift ' + beeps[15]);
});

test('S-10: heatwaves on 15 ± 2% of days', () => {
  let heat = 0;
  for (let seed = 1; seed <= 2000; seed++) if (H.load({seed}).weather() === 'heat') heat++;
  const share = heat / 20;
  assert.ok(share >= 13 && share <= 17, 'heat share ' + share + '%');
});
