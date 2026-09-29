// F-12: the measured baseline of the current build matches the committed golden report.
// A pure refactor must leave it unchanged. An intentional behaviour change re-records it
// (`npm run golden`) in the same commit, with a one-line reason in the commit message.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Lines that legitimately differ between runs or commits: the build fingerprint (hash and
// size of index.html) and section 5, which times the sim on this machine.
function comparable(report) {
  const out = [];
  let inTimings = false;
  for (const line of report.replace(/\r/g, '').split('\n')) {
    if (line.startsWith('## ')) inTimings = line.startsWith('## 5.');
    if (inTimings || line.startsWith('Build: ')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

test('baseline report matches tools/baseline.golden.md', {timeout: 120_000}, () => {
  const golden = readFileSync(new URL('../tools/baseline.golden.md', import.meta.url), 'utf8');
  const now = execFileSync(process.execPath, ['tools/baseline.js'], {cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24});
  assert.equal(comparable(now), comparable(golden),
    'baseline changed: if intended, run `npm run golden` and give the reason in the commit message');
});
