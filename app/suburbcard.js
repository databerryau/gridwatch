// app/suburbcard.js: a suburb's card (SPEC §9.1 Q-56; desk/README.md §31.3.8, §31.9.1). On demand (Q-44).
// Stage A's stub: the suburb's name and ✕; wave 2's card fills it. Presentation only; the shell owns the focus rules.

import {SCENARIOS, CLASSIC} from '../content/scenarios.js';

const CSS = '#suburb-card .sc{display:flex;align-items:center;gap:8px;padding:8px 12px}#suburb-card h2{flex:1;margin:0;font-size:14px;color:var(--bright)}';

/**
 * @param {Element} root #suburb-card
 * @param {{ui:function(object):string}} actions the shell's actions
 * @param {{toast:function, loadText:function, toggleHelp:function}} deps
 * @returns {{update(vm:object):void, focus():void, el:Element}}
 */
export function createSuburbCard(doc, root, actions, deps) {
  if (!doc.getElementById('sc-css')) {
    const st = doc.createElement('style');
    st.id = 'sc-css';
    st.textContent = CSS;
    (doc.head || doc.body).appendChild(st);
  }
  const el = doc.createElement('div'), name = doc.createElement('h2'), x = doc.createElement('button');
  el.className = 'sc';
  x.id = 'btn-suburb-close';
  x.type = 'button';
  x.textContent = '✕';
  x.title = 'Close (Esc or H)';
  x.setAttribute('aria-label', 'Close the suburb card');
  x.addEventListener('click', () => actions.ui({do: 'suburb', id: null}));
  el.appendChild(name);
  el.appendChild(x);
  root.appendChild(el);
  return {
    el,
    update(vm) {
      const s = (SCENARIOS[vm.obs.scenarioId] || CLASSIC).city.suburbs.find(q => q.id === vm.suburb), t = s ? s.name.toUpperCase() : '';
      if (name.textContent !== t) name.textContent = t;
    },
    focus() { x.focus(); },
  };
}
