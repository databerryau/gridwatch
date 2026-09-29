// Stage B owner "integration": H-14, the honest-abstractions panel. content/text.js holds one
// entry per SPEC.md §8.2 row: {id, row, anchorId, real, ours, why, params}. `row` is the
// row's bold title exactly as in §8.2; `ours` is BUILT from sim/params.js values (never a
// copied number), and `params` lists the P keys it reads (dotted for nested ones, e.g.
// 'FLEET.coal.rampMWMin'). Todo until content/text.js exists.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {P} from '../sim/params.js';

const TODO = {todo: 'stage B: integration (content/text.js, H-14)'};

/** Bold titles of the SPEC.md §8.2 table rows ("| **Compressed playback.** ..." -> "Compressed playback."). */
function abstractionRows() {
  const spec = readFileSync(fileURLToPath(new URL('../SPEC.md', import.meta.url)), 'utf8');
  const from = spec.indexOf('### 8.2'), to = spec.indexOf('### 8.3');
  return spec.slice(from, to).split('\n').filter(l => l.startsWith('| **')).map(l => /^\| \*\*(.+?)\*\*/.exec(l)[1]);
}

// A P key path: 'LOAD_RELIEF', 'CLASSES.coal.govLagS', or 'FLEET.coal.rampMWMin' (FLEET by station id).
function paramAt(path) {
  const [head, ...rest] = path.split('.');
  let x = P[head];
  for (const k of rest) x = Array.isArray(x) ? x.find(s => s.id === k) : x && x[k];
  return x;
}

test('the §8.2 parser finds the abstraction rows', () => {
  const rows = abstractionRows();
  assert.ok(rows.length >= 25, rows.length + ' rows');
  assert.ok(rows.includes('Compressed playback.'));
});

test('H-14: every §8.2 abstraction has a text entry with a UI anchor id, the real value, ours (from params) and why', TODO, async () => {
  const {TEXT} = await import('../content/text.js');
  const rows = abstractionRows();
  const byRow = new Map(TEXT.abstractions.map(e => [e.row, e]));
  for (const row of rows) assert.ok(byRow.has(row), 'no text entry for §8.2 "' + row + '"');
  const ids = new Set(), anchors = new Set();
  for (const e of TEXT.abstractions) {
    assert.match(e.id, /^[a-z][a-z0-9-]*$/, 'id ' + e.id);
    assert.ok(!ids.has(e.id), 'duplicate id ' + e.id);
    ids.add(e.id);
    assert.match(e.anchorId, /^[a-z][a-z0-9-]*$/, e.id + ': anchorId');
    anchors.add(e.anchorId);
    for (const k of ['real', 'ours', 'why']) assert.ok(typeof e[k] === 'string' && e[k].length > 0, e.id + '.' + k);
    assert.ok(Array.isArray(e.params), e.id + '.params');
    for (const p of e.params) assert.ok(paramAt(p) !== undefined, e.id + ': unknown param ' + p);
  }
});
