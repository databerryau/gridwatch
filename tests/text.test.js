// H-14, the honest-abstractions panel. content/text.js holds one entry per SPEC.md §8.2 row:
// {id, row, anchorId, game, real, ours, why, params}. `row` is the row's bold title exactly as
// in §8.2 (an entry for a row stage C still has to add carries specPending: true); `ours` is
// BUILT from sim/params.js values (never a copied number), and `params` lists the P keys it
// reads (dotted for nested ones, e.g. 'FLEET.coal.rampMWMin'). `anchorId` is the id of the
// element the bench's "?" sits beside in bench.html (ui: 'drawer' = only in the bench's
// drawer); `game` is the element the game's "?" sits beside: a desk/README.md §5 control id or
// a next.html element ('drawer' = only in the game's drawer).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {P} from '../sim/params.js';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Bold titles of the SPEC.md §8.2 table rows ("| **Compressed playback.** ..." -> "Compressed playback."). */
function abstractionRows() {
  const spec = read('../SPEC.md');
  const from = spec.indexOf('### 8.2'), to = spec.indexOf('### 8.3');
  return spec.slice(from, to).split('\n').filter(l => l.startsWith('| **')).map(l => /^\| \*\*(.+?)\*\*/.exec(l)[1]);
}

/** The stable control ids of desk/README.md §5 ("Control and target ids"), without the <unit> patterns. */
function contractIds() {
  const md = read('../desk/README.md');
  const at = md.indexOf('Control and target ids');
  const block = md.slice(at, md.indexOf('\n\n', at));
  const inTicks = block.slice(block.indexOf('`')).replace(/`/g, ' ');
  return new Set(inTicks.split(/\s+/).filter(x => /^[a-z][a-z0-9-]*$/.test(x)));
}

// A P key path: 'LOAD_RELIEF', 'CLASSES.coal.govLagS', or 'FLEET.coal.rampMWMin' (FLEET by station id).
function paramAt(path) {
  const [head, ...rest] = path.split('.');
  let x = P[head];
  for (const k of rest) x = Array.isArray(x) ? x.find(s => s.id === k) : x && x[k];
  return x;
}

test('the §8.2 parser finds the abstraction rows; the §5 parser finds the control ids', () => {
  const rows = abstractionRows();
  assert.ok(rows.length >= 25, rows.length + ' rows');
  assert.ok(rows.includes('Compressed playback.'));
  const ids = contractIds();
  for (const id of ['lever-coal', 'wheel-hydro', 'btn-redispatch', 'bay-sync', 'annunciator', 'stack', 'map']) assert.ok(ids.has(id), id);
});

test('H-14: every §8.2 abstraction has a text entry with a UI anchor id, the real value, ours (from params) and why', async () => {
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
    assert.match(e.game, /^[a-z][a-z0-9-]*$/, e.id + ': game anchor');
    anchors.add(e.anchorId);
    for (const k of ['real', 'ours', 'why']) assert.ok(typeof e[k] === 'string' && e[k].length > 0, e.id + '.' + k);
    assert.ok(Array.isArray(e.params), e.id + '.params');
    for (const p of e.params) assert.ok(paramAt(p) !== undefined, e.id + ': unknown param ' + p);
  }
});

test('H-14: no stale entries: every text entry names a §8.2 row that exists, once (or is marked for stage C)', async () => {
  const {TEXT} = await import('../content/text.js');
  const rows = new Set(abstractionRows());
  const seen = new Set();
  for (const e of TEXT.abstractions) {
    if (e.specPending) assert.ok(!rows.has(e.row), e.id + ': §8.2 now has "' + e.row + '": drop specPending');
    else assert.ok(rows.has(e.row), e.id + ': §8.2 has no row "' + e.row + '"');
    assert.ok(!seen.has(e.row), 'two entries for "' + e.row + '"');
    seen.add(e.row);
  }
  // Phase 1a: A-1 RE-DISPATCH is labelled (desk/README.md §0), as a row stage C adds to §8.2.
  assert.ok(TEXT.abstractions.some(e => e.id === 're-dispatch' && e.game === 'btn-redispatch'));
});

test('H-14: every anchor the bench shows exists in bench.html; drawer-only entries are elements the bench lacks', async () => {
  const {TEXT} = await import('../content/text.js');
  const html = read('../bench.html');
  for (const e of TEXT.abstractions) {
    const present = html.includes('id="' + e.anchorId + '"');
    if (e.ui === 'drawer') assert.ok(!present, e.id + ' is drawer-only but bench.html has #' + e.anchorId);
    else assert.ok(present, e.id + ': bench.html has no element #' + e.anchorId + ' for its "?"');
  }
});

test('H-14: every game anchor is a §5 control id or a next.html element (or the drawer)', async () => {
  const {TEXT} = await import('../content/text.js');
  const html = read('../next.html'), ids = contractIds();
  for (const e of TEXT.abstractions) {
    if (e.game === 'drawer') continue;
    assert.ok(ids.has(e.game) || html.includes('id="' + e.game + '"'), e.id + ': no #' + e.game + ' in §5 or next.html');
  }
  // The new desk elements are labelled: the scope, the restore bay, the levers, RE-DISPATCH, the gauge, the dial, the hum.
  for (const g of ['bay-sync', 'bay-restore', 'lever-coal', 'btn-redispatch', 'gauge-n1', 'dial-freq', 'btn-mute', 'wheel-hydro']) {
    assert.ok(TEXT.abstractions.some(e => e.game === g), 'no "?" beside #' + g);
  }
});

test('H-14: "ours" is built from the live values, and says nothing the params contradict', async () => {
  const {TEXT} = await import('../content/text.js');
  const {V} = await import('../sim/params.js');
  const AM = await import('../audio/model.js');
  const byId = new Map(TEXT.abstractions.map(e => [e.id, e]));
  // Spot checks: each number below is read from V here, never copied into the test.
  assert.ok(byId.get('player-commits').ours.includes('each of the ' + V.MACHINES.length + ' machines'));
  assert.ok(byId.get('ufls-blocks').ours.startsWith(V.UFLS_STAGES + ' stages'));
  assert.ok(byId.get('dc-tie').ours.includes(V.TIE_RAMP_MW_MIN + ' MW/min'));
  assert.ok(byId.get('hydro-allocation').ours.includes(V.HYDRO_ALLOCATION_MWH.toLocaleString('en-US') + ' MWh'));
  assert.ok(byId.get('hum-tone').ours.includes(AM.HUM_DBFS + ' dBFS'), byId.get('hum-tone').ours);
  assert.ok(byId.get('re-dispatch').ours.includes('04:30'));
  // Phase 1b, B-1: the alarm escalation is labelled beside the annunciator, from the live band limits.
  const esc = byId.get('alarm-escalation'), AL = await import('../app/alarms.js');
  assert.equal(esc.game, 'annunciator');
  assert.ok(esc.ours.includes(V.NORMAL_LO_HZ + '–' + V.NORMAL_HI_HZ + ' Hz') && esc.ours.includes(V.CONTAIN_LO_HZ + '–' + V.CONTAIN_HI_HZ + ' Hz'), esc.ours);
  assert.ok(esc.ours.includes('every ' + AL.HORN_REPEAT_S + ' s'));
  assert.deepEqual([AL.ESC_LO_HZ, AL.ESC_HI_HZ], [V.CONTAIN_LO_HZ, V.CONTAIN_HI_HZ], 'the tiles escalate at the limits the text names');
  if (V.SYNC_SLIP_MIN_HZ !== undefined) assert.ok(byId.get('compressed-synchroscope').ours.includes(String(V.SYNC_SLIP_MIN_HZ)));
  for (const e of TEXT.abstractions) assert.ok(!/undefined|NaN|Infinity/.test(e.ours + e.real + e.why), e.id + ': ' + e.ours);
});
