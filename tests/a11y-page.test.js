// The page's accessibility (K-22, K-23; the 2026-10-17 audit's page items), headless (CLAUDE.md): the colours that carry
// words read at 4.5:1 (WCAG 1.4.3), computed from next.html's tokens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');

// ------------------------------------------------------------------ contrast (K-22, WCAG 1.4.3)

/** next.html's :root tokens: {name: '#rrggbb'}. */
const TOKENS = Object.fromEntries([.../:root \{([^}]*)\}/.exec(NEXT)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2]]));
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** WCAG's contrast ratio of two #rrggbb colours. */
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('K-22: every colour next.html sets on words reads at 4.5:1 or more on each panel (--faint too); the URGENT badge\'s white on red as well', () => {
  const used = new Set([...NEXT.matchAll(/[^-]color:\s*var\(--([\w-]+)\)/g)].map(m => m[1]));
  assert.ok(used.has('faint') && used.has('dim') && used.has('red'), [...used].join(' '));
  for (const name of used) {
    for (const bg of ['bg', 'panel', 'panel2']) {
      const r = ratio(TOKENS[name], TOKENS[bg]);
      assert.ok(r >= 4.5, '--' + name + ' ' + TOKENS[name] + ' on --' + bg + ': ' + r.toFixed(2) + ':1');
    }
  }
  assert.equal(TOKENS['faint-line'], '#6e7781', 'a border keeps the old grey');
  assert.match(NEXT, /#rate-badge\.ALARMS \{[^}]*border-color: var\(--faint-line\)/);
  assert.doesNotMatch(NEXT, /(border|background)[\w-]*:[^;]*var\(--faint\)/, 'no border or fill on --faint: it is the words\' grey');
  const [, badge] = /#objective\.crit b \{[^}]*background: (#[0-9a-f]{6});/.exec(NEXT);
  assert.ok(ratio(TOKENS.bright, badge) >= 4.5, '‼ URGENT: ' + ratio(TOKENS.bright, badge).toFixed(2) + ':1');
});
