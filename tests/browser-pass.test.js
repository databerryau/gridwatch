// The browser pass of 2026-11-16 (SPEC W13): what the stand-in DOM can hold of it. The layout itself (the cards' places, the map
// filling a 125% laptop) was seen in the browser; here, the class the CSS keys on and the map's scale arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {scaleFor} from '../render/mapdata.js';

test('S7: an open suburb card marks the page, so a card that holds the clock steps right of it (index.html)', () => {
  const p = openGame({seed: 20261116, run: false});
  assert.equal(p.doc.body.classList.contains('suburb-open'), false);
  p.suburb('HAZ');
  assert.equal(p.doc.body.classList.contains('suburb-open'), true, 'the card is open');
  p.suburb(null);
  assert.equal(p.doc.body.classList.contains('suburb-open'), false, 'and closed again');
});

test('V7: the map takes a whole number of device pixels per art pixel when that fills more of the width', () => {
  const L = scaleFor(1536, 416, 1.25);   // a 1080p laptop at Windows' 125%
  assert.deepEqual([L.scale * 1.25, L.drawW, L.dx], [3, 1536, 0], 'three device pixels per art pixel fill 1,536 CSS px');
  assert.equal(scaleFor(1536, 416).scale, 2, 'at a pixel ratio of 1 the CSS scale stays whole');
  assert.deepEqual([scaleFor(1280, 268, 1.5).scale, scaleFor(1366, 300, 1.25).scale], [2, 2], 'never smaller than the CSS scale');
});
