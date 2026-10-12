// sim/dark.js: the dark part of the city as obs shows it, and lit demand (desk/README.md §32.4.2).
// Contract: sim/README.md §11 dark.js.

/** {shed, roof}: the dark districts' share of the customers and of the rooftop PV, from obs; s unused at stage A (now). */
export function darkShareAt(obs, s) { // eslint-disable-line no-unused-vars
  const D = {shed: 0, roof: 0};
  const roofs = obs.rooftop;
  for (const d of obs.districts) {
    if (!d.dark) continue;
    D.shed += d.share;
    if (!roofs || !(roofs.capMW > 0)) continue;
    let inSuburb = 0, capMW = 0;
    for (const x of obs.districts) if (x.suburb === d.suburb) inSuburb++;
    for (const sub of roofs.suburbs) if (sub.id === d.suburb) capMW = sub.capMW;
    D.roof += capMW / inSuburb / roofs.capMW;
  }
  return D;
}

/** Lit operational demand of a forecast column (fleet.litDemandMW on the forecast; P-12). */
export const litMW = (p50, roofMW, D) => (p50 + roofMW) * (1 - D.shed) - roofMW * (1 - D.roof);
