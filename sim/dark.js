// sim/dark.js: the dark part of the city as obs shows it, and lit demand (desk/README.md §32.4.2).
//
// `darkShareAt(obs, s) -> {shed, roof}` and `litMW(p50, roofMW, D)`, moved from `autopilot.js`
// (`darkShare`, `litMW`) bit for bit so `app/planview.js` can share them (wave 2). Pure; reads obs
// only (no imports). `shed` is the dark districts' share of the customers and `roof` their share of
// the rooftop PV (a district holds an equal part of its suburb's nameplate; 0 with no rooftop): the
// roofs go off with their feeder (P-12). `litMW` is a forecast column's lit operational demand,
// `(p50 + roofMW) x (1 - shed) - roofMW x (1 - roof)`, the sim's `fleet.litDemandMW` on the
// forecast; with rooftop zero it is `p50 x (1 - shed)` exactly. `s` is the column's grid second: a
// dark district counts at every `s`, except that one still held at `obs.s` (`shedBy` `'task'` and
// `obs.s < clearS`: Q-68's task feeder, `fleet.refreshHeld`'s test) counts as lit at every
// `s >= clearS` (wave 2, `par`: the announced return, Q-69). Handed back and still dark, it is the
// operator's and counts dark at every `s` until restored. With no held feeder (classic, every
// district not in the task, and every task feeder from its `clearS`) the result does not depend on `s`. Autopilot calls it per plan and forecast column
// (sim/autopilot.js, "The day's constraints and the night"); `app/planview.js` per stack
// column.

export function darkShareAt(obs, s) {
  const D = {shed: 0, roof: 0};
  const roofs = obs.rooftop;
  for (const d of obs.districts) {
    if (!d.dark || (d.shedBy === 'task' && d.clearS > obs.s && s >= d.clearS)) continue; // Q-69: the announced return, while ahead
    D.shed += d.share;
    if (!roofs || !(roofs.capMW > 0)) continue;
    let inSuburb = 0, capMW = 0;
    for (const x of obs.districts) if (x.suburb === d.suburb) inSuburb++;
    for (const sub of roofs.suburbs) if (sub.id === d.suburb) capMW = sub.capMW;
    D.roof += capMW / inSuburb / roofs.capMW;
  }
  return D;
}

export const litMW = (p50, roofMW, D) => (p50 + roofMW) * (1 - D.shed) - roofMW * (1 - D.roof);
