// tools/shot-receiver.mjs: saves PNGs the page POSTs, for visual QA (SPEC §10).
//
// The dev preview pane does not composite frames here, so screenshots come back blank. A
// canvas can still render: page JS POSTs canvas.toDataURL() to this server and the PNG lands
// in shots/ (git-ignored), where it can be opened or read.
//
//   node tools/shot-receiver.mjs [port=8643] [dir=shots]
//
// From the page (the request is "simple": text/plain, no preflight; the reply is opaque):
//   fetch('http://localhost:8643/map-noon', {method: 'POST', mode: 'no-cors',
//     headers: {'Content-Type': 'text/plain'}, body: canvas.toDataURL('image/png')});
// The path names the file (letters, digits, - and _ only). Listens on localhost only.

import {createServer} from 'node:http';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const port = Number(process.argv[2]) || 8643;
const dir = resolve(process.argv[3] || 'shots');
const MAX_BYTES = 32 * 1024 * 1024;
mkdirSync(dir, {recursive: true});

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.statusCode = 405; res.end('POST a PNG data URL\n'); return; }
  const name = (req.url || '').replace(/^\/+/, '').replace(/[^A-Za-z0-9_-]/g, '') || 'shot-' + Date.now();
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BYTES) { res.statusCode = 413; res.end('too large\n'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('latin1');
    const b64 = body.replace(/^data:image\/png;base64,/, '');
    const png = Buffer.from(b64, 'base64');
    // A PNG starts with these eight bytes; anything else is not written.
    if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(4) !== 0x0d0a1a0a) {
      res.statusCode = 400; res.end('not a PNG data URL\n');
      console.log('rejected ' + name + ' (' + size + ' bytes, not a PNG)');
      return;
    }
    const file = join(dir, name + '.png');
    writeFileSync(file, png);
    console.log('saved ' + file + ' (' + png.length + ' bytes)');
    res.end('ok\n');
  });
}).listen(port, '127.0.0.1', () => console.log('shot receiver on http://localhost:' + port + ' -> ' + dir));
