// C-2: <meta charset="utf-8"> is the first element of every HTML file we serve.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['.git', 'node_modules', '.claude', 'shots']);

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

test('every served HTML file starts with the charset meta', () => {
  const files = htmlFiles(ROOT);
  assert.ok(files.length > 0, 'no HTML files found');
  for (const f of files) {
    // Allow an optional BOM-free doctype and comments before the first element.
    const head = readFileSync(f, 'utf8')
      .replace(/^\s*<!doctype[^>]*>/i, '')
      .replace(/^(\s*<!--[\s\S]*?-->)*/, '')
      .trimStart();
    assert.match(head, /^<meta charset="utf-8">/i, relative(ROOT, f) + ' must begin with <meta charset="utf-8">');
  }
});
