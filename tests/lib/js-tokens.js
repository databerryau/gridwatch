// A small JavaScript tokenizer for source lints (tests/params.test.js, tests/sim-lint.test.js).
// Not a parser: it separates code from comments, strings, template text and regex
// literals, which is all the lints need. Comments are dropped; string and template text
// become single tokens, so words and numbers inside them are never mistaken for code.
//
// Token: {type: 'num'|'ident'|'punct'|'str'|'tpl'|'regex', text, value?, line, pos}

import {readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const NUM = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)n?/;
const IDENT = /^[A-Za-z_$\u0080-￿][\w$\u0080-￿]*/;
// After these words an expression starts, so '/' begins a regex literal.
const EXPR_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await']);

export function tokenize(src) {
  const toks = [];
  const tplStack = []; // brace depth at each open `${`
  let depth = 0, i = 0, line = 1;
  const n = src.length;
  const push = (type, text, pos, extra) => toks.push(Object.assign({type, text, line, pos}, extra));
  const countLines = (a, b) => { for (let k = a; k < b; k++) if (src[k] === '\n') line++; };
  const regexAllowed = () => {
    const p = toks[toks.length - 1];
    if (!p) return true;
    if (p.type === 'num' || p.type === 'str' || p.type === 'tpl' || p.type === 'regex') return false;
    if (p.type === 'ident') return EXPR_KEYWORDS.has(p.text);
    return !(p.text === ')' || p.text === ']' || p.text === '}');
  };
  // Scan template text from i (just after ` or after the } closing a substitution).
  const scanTemplate = () => {
    const start = i;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && src[i + 1] === '{') { i += 2; tplStack.push(depth); break; }
      i++;
    }
    countLines(start, i);
    push('tpl', src.slice(start, i), start);
  };

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2;
      countLines(i, end); i = end; continue;
    }
    if (c === '"' || c === '\'') {
      const start = i;
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++;
      push('str', src.slice(start, i), start);
      continue;
    }
    if (c === '`') { i++; scanTemplate(); continue; }
    if (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === depth) {
      tplStack.pop(); i++; scanTemplate(); continue;
    }
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const m = NUM.exec(src.slice(i, i + 64));
      const text = m[0];
      const value = Number(text.replace(/_/g, '').replace(/n$/, ''));
      push('num', text, i, {value});
      i += text.length;
      continue;
    }
    const id = IDENT.exec(src.slice(i, i + 256));
    if (id) { push('ident', id[0], i); i += id[0].length; continue; }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, inClass = false, ok = false;
      while (j < n && src[j] !== '\n') {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        push('regex', src.slice(i, j), i);
        i = j;
        continue;
      }
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    push('punct', c, i);
    i++;
  }
  return toks;
}

/** Every .js file under dir (recursive), as absolute paths. */
export function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Module specifiers imported or re-exported by a token stream (static and dynamic). A dynamic
 * import of a string literal, import('./x.js') (Q-44's on-demand modules), gives that literal;
 * any other gives '(dynamic import)'.
 */
export function importSpecifiers(toks) {
  const specs = [];
  for (let k = 0; k < toks.length - 1; k++) {
    const t = toks[k], nx = toks[k + 1];
    if (t.type === 'ident' && (t.text === 'from' || t.text === 'import') && nx.type === 'str') specs.push(nx.text.slice(1, -1));
    if (t.type === 'ident' && t.text === 'import' && nx.text === '(') {
      const a = toks[k + 2], b = toks[k + 3];
      specs.push(a && a.type === 'str' && b && b.text === ')' ? a.text.slice(1, -1) : '(dynamic import)');
    }
  }
  return specs;
}
