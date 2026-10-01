// tests/lib/dom.js: a small stand-in DOM for headless UI tests (Phase 1a, desk/README.md §9).
// Enough for the desk, the Live Stack, the map and the shell to build, update and receive
// events in Node; it is not a browser (no layout, no CSS). Extracted from tests/bench.test.js
// and extended: attributes, focus, pointer/keyboard events with coordinates, a canvas 2D
// context that counts calls and rejects NaN/Infinity (a drawing bug).
//
//   const doc = makeDocument(html?)   // html: a page whose <body> is parsed; omit for an empty body
//   const el = doc.createElement('div'); root.appendChild(el);
//   el.dispatch('pointerdown', {clientX: 10, clientY: 20});
//   doc.canvasStats  // {calls, bad: [...]} over every canvas context made from this document

const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);

class ClassList {
  constructor(e) { this.e = e; }
  list() { return this.e.className.split(/\s+/).filter(Boolean); }
  add(...c) { const a = this.list(); for (const x of c) if (!a.includes(x)) a.push(x); this.e.className = a.join(' '); }
  remove(...c) { this.e.className = this.list().filter(x => !c.includes(x)).join(' '); }
  contains(c) { return this.list().includes(c); }
  toggle(c, force) {
    const want = force === undefined ? !this.contains(c) : !!force;
    if (want) this.add(c); else this.remove(c);
    return want;
  }
}

/** A 2D context that accepts every call and records NaN/Infinity arguments in stats.bad. */
export function context2d(stats) {
  const target = {
    measureText: s => ({width: String(s).length * 6}),
    createLinearGradient: () => ({addColorStop() {}}),
    createRadialGradient: () => ({addColorStop() {}}),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h}),
    createImageData: (w, h) => ({data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h}),
    getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) {
        const v = t[k];
        if (typeof v !== 'function') return v;
        return (...args) => { stats.calls++; check(stats, k, args); return v(...args); };
      }
      return (...args) => { stats.calls++; check(stats, k, args); };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) stats.bad.push(String(k) + '=' + v);
      t[k] = v;
      return true;
    },
  });
}

function check(stats, k, args) {
  for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) stats.bad.push(String(k) + '(' + args.join(',') + ')');
}

export class TextNode {
  constructor(s) { this.textContent = String(s); this.parent = null; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
}

export class Elem {
  constructor(doc, tag) {
    Object.assign(this, {ownerDocument: doc, tagName: tag.toUpperCase(), children: [], parent: null, className: '', dataset: {},
      style: {setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; }},
      own: '', listeners: {}, hidden: false, disabled: false, value: '', type: '', title: '', id: '', scrollTop: 0,
      width: 300, height: 150, href: '', download: '', attrs: {}, tabIndex: -1, checked: false,
      min: '', max: '', step: ''});
    this.classList = new ClassList(this);
    // Layout stand-ins: tests may overwrite rect/clientWidth/clientHeight per element.
    this.rect = {left: 10, top: 10, width: 20, height: 20};
    this._cw = 400; this._ch = 120;
  }
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this.own; }
  set textContent(s) { for (const c of this.children) c.parent = null; this.children = []; this.own = String(s); }
  get innerHTML() { return this.textContent; }
  set innerHTML(s) { this.textContent = String(s).replace(/<[^>]*>/g, ''); }
  get childElementCount() { return this.children.filter(c => c instanceof Elem).length; }
  get firstElementChild() { return this.children.find(c => c instanceof Elem) || null; }
  get firstChild() { return this.children[0] || null; }
  get parentNode() { return this.parent; }
  get parentElement() { return this.parent instanceof Elem ? this.parent : null; }
  get clientWidth() { return this._cw; }
  set clientWidth(v) { this._cw = v; }
  get clientHeight() { return this._ch; }
  set clientHeight(v) { this._ch = v; }
  get offsetWidth() { return this._cw; }
  get offsetHeight() { return this._ch; }
  get scrollHeight() { return 200; }
  appendChild(c) {
    if (c.parent) c.remove();
    if (this.own && !this.children.length) { this.children.push(new TextNode(this.own)); this.own = ''; }
    c.parent = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, ref) {
    if (!ref) return this.appendChild(c);
    if (c.parent) c.remove();
    c.parent = this;
    this.children.splice(this.children.indexOf(ref), 0, c);
    return c;
  }
  removeChild(c) { c.remove(); return c; }
  replaceChildren(...cs) { for (const c of this.children) c.parent = null; this.children = []; this.own = ''; this.append(...cs); }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? new TextNode(c) : c); }
  prepend(...cs) { for (const c of cs.reverse()) this.insertBefore(typeof c === 'string' ? new TextNode(c) : c, this.children[0] || null); }
  before(c) { const p = this.parent; if (c.parent) c.remove(); c.parent = p; p.children.splice(p.children.indexOf(this), 0, c); }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; }
  setAttribute(k, v) {
    v = String(v);
    this.attrs[k] = v;
    if (k === 'id') this.id = v; else if (k === 'class') this.className = v; else if (k.startsWith('data-')) this.dataset[k.slice(5)] = v;
    else if (k === 'hidden') this.hidden = true; else if (k === 'tabindex') this.tabIndex = Number(v);
  }
  getAttribute(k) {
    if (k === 'id') return this.id || null;
    if (k === 'class') return this.className || null;
    return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null;
  }
  hasAttribute(k) { return this.getAttribute(k) !== null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'hidden') this.hidden = false; }
  toggleAttribute(k, force) { const want = force === undefined ? !this.hasAttribute(k) : !!force; if (want) this.setAttribute(k, ''); else this.removeAttribute(k); return want; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(g => g !== f); }
  /** Fire an event that bubbles to the document. `extra` is merged into the event (clientX, key, shiftKey...). */
  dispatch(type, extra) {
    const ev = Object.assign({type, target: this, currentTarget: this, stopped: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, pointerId: 1, button: 0}, extra);
    for (let n = this; n && !ev.stopped; n = n.parent) { ev.currentTarget = n; for (const f of (n.listeners[type] || []).slice()) f(ev); }
    if (!ev.stopped) for (const f of (this.ownerDocument.listeners[type] || []).slice()) f(ev);
    return ev;
  }
  dispatchEvent(ev) { return this.dispatch(ev.type, ev); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; this.dispatch('focus'); }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; this.dispatch('blur'); }
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
  scrollIntoView() {}
  getContext() { return this.ctx || (this.ctx = context2d(this.ownerDocument.canvasStats)); }
  toDataURL() { return 'data:image/png;base64,'; }
  getBoundingClientRect() {
    const r = this.rect;
    return {left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height, width: r.width, height: r.height, x: r.left, y: r.top};
  }
  *walk() { for (const c of this.children) if (c instanceof Elem) { yield c; yield* c.walk(); } }
  /** Selectors: #id, .class, tag, [attr], [attr="v"], [data-x="v"], and tag.class / tag#id compounds. */
  matches(sel) {
    const m = /^([a-zA-Z0-9]*)(?:#([\w-]+))?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(sel.trim());
    if (!m) throw new Error('stand-in DOM: unsupported selector ' + sel);
    const [, tag, id, cls, attr, val] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (id && this.id !== id) return false;
    if (cls) for (const c of cls.split('.').filter(Boolean)) if (!this.classList.contains(c)) return false;
    if (attr) {
      const v = attr.startsWith('data-') ? (Object.hasOwn(this.dataset, attr.slice(5)) ? this.dataset[attr.slice(5)] : null) : this.getAttribute(attr);
      if (v === null || v === undefined) return false;
      if (val !== undefined && String(v) !== val) return false;
    }
    return true;
  }
  querySelector(sel) { for (const e of this.walk()) if (sel.split(',').some(s => e.matches(s))) return e; return null; }
  querySelectorAll(sel) { return [...this.walk()].filter(e => sel.split(',').some(s => e.matches(s))); }
  closest(sel) { for (let n = this; n instanceof Elem; n = n.parent) if (n.matches(sel)) return n; return null; }
}

/**
 * A document. With `html`, its <body> is parsed by a strict little tag reader (attributes:
 * id, class, data-(any), hidden, type/min/max/step/title/value; anything else such as role,
 * aria-(any), tabindex or for lands in attrs).
 */
export function makeDocument(html) {
  const doc = {listeners: {}, visibilityState: 'visible', canvasStats: {calls: 0, bad: []}, activeElement: null};
  doc.createElement = t => new Elem(doc, t);
  doc.createElementNS = (ns, t) => new Elem(doc, t);
  doc.createTextNode = s => new TextNode(s);
  doc.createDocumentFragment = () => new Elem(doc, 'fragment');
  doc.addEventListener = (t, f) => { (doc.listeners[t] ||= []).push(f); };
  doc.removeEventListener = (t, f) => { doc.listeners[t] = (doc.listeners[t] || []).filter(g => g !== f); };
  doc.documentElement = new Elem(doc, 'html');
  doc.head = doc.documentElement.appendChild(new Elem(doc, 'head'));
  doc.body = doc.documentElement.appendChild(new Elem(doc, 'body'));
  doc.activeElement = doc.body;
  doc.getElementById = id => { for (const e of doc.documentElement.walk()) if (e.id === id) return e; return null; };
  doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel);
  /** Fire a document-level event (keydown/keyup reach every listener on the document). */
  doc.dispatch = (type, extra) => {
    const target = doc.activeElement || doc.body;
    return target.dispatch(type, extra);
  };
  if (html) parseBody(doc, html);
  return doc;
}

function parseBody(doc, html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const at = src.indexOf('<body>');
  const body = at < 0 ? src : src.slice(at + '<body>'.length, src.lastIndexOf('</body>'));
  const stack = [doc.body];
  for (const m of body.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g)) {
    const top = stack[stack.length - 1];
    if (m[3] !== undefined) { if (m[3].trim()) top.appendChild(new TextNode(m[3])); continue; }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      const open = stack.pop();
      if (open.tagName.toLowerCase() !== tag) throw new Error('html: </' + tag + '> closes <' + open.tagName.toLowerCase() + '>');
      continue;
    }
    const e = new Elem(doc, tag);
    for (const [, k, v = ''] of m[2].matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) {
      if (k === 'id') e.id = v;
      else if (k === 'class') e.className = v;
      else if (k.startsWith('data-')) e.dataset[k.slice(5)] = v;
      else if (k === 'hidden') e.hidden = true;
      else if (['type', 'min', 'max', 'step', 'title', 'value'].includes(k)) e[k] = v;
      else e.attrs[k] = v;
    }
    top.appendChild(e);
    if (!VOID.has(tag)) stack.push(e);
  }
  if (stack.length !== 1) throw new Error('html: unclosed ' + stack.slice(1).map(e => e.tagName).join(', '));
}

/**
 * Install browser globals for code that reads them at import or call time; returns restore().
 * @param {object} g e.g. {document: doc, location: {search: '?seed=7'}, requestAnimationFrame}
 */
export function installGlobals(g) {
  const saved = {};
  for (const k of Object.keys(g)) { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, {value: g[k], configurable: true, writable: true}); }
  return () => {
    for (const k of Object.keys(g)) {
      if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k];
    }
  };
}
