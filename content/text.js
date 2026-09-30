// content/text.js: the honest-abstractions panel (spec H-14, C-5, SPEC.md §8.2).
//
// One entry per §8.2 row: {id, row, anchorId, game, real, ours, why, params}.
//   row       the row's bold title exactly as in SPEC.md §8.2 (tests/text.test.js matches it).
//             An entry for a row stage C has still to add to §8.2 carries specPending: true
//             (Phase 1a: A-1 RE-DISPATCH, desk/README.md §0); stage C adds the row and drops it.
//   anchorId  the id of the bench element the "?" sits next to (bench.html); entries whose
//             element the bench does not have carry ui: 'drawer' and show only in the bench's
//             abstractions drawer (H-14: "the same text is in the manual drawer")
//   game      the id of the game element the "?" sits next to (next.html): a desk/stack/map
//             control id from desk/README.md §5, or a next.html element; 'drawer' = drawer only
//   real      what the real world does
//   ours      what GRIDWATCH does, BUILT from sim/params.js (and the scenario / director)
//             values, never a copied number, so tuning a value retunes the text
//   why       why we do it
//   params    the P keys `ours` reads ('LOAD_RELIEF', 'CLASSES.coal.agcBandFrac',
//             'FLEET.coal.rampMWMin' with FLEET by station id)
// Numbers in `real` are real-world facts from SPEC.md §8.1 / §8.2, not model values.

import {P, V} from '../sim/params.js';
import {CLASSIC} from './scenarios.js';
import {FLAT_RATE, WATCH_SCHEDULE} from '../app/director.js';
import {HUM_K, F0, REF_REL_DB, HUM_DBFS} from '../audio/model.js';

// ------------------------------------------------------------------ formatting

/** 1234.5 -> '1,235'; 0.125 -> '0.125' (at most 3 decimals, trailing zeros dropped). */
function num(x) {
  const r = Math.round(x * 1000) / 1000;
  const [i, f] = String(r).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}
const pct = frac => num(frac * V.PCT);
const minutes = s => num(s / V.S_PER_MIN);
const hhmm = h => {
  const m = Math.round(h * V.S_PER_MIN) % (V.DAY_H * V.S_PER_MIN);
  return String(Math.floor(m / V.S_PER_MIN)).padStart(2, '0') + ':' + String(m % V.S_PER_MIN).padStart(2, '0');
};
/** A frequency with the decimals it needs, at least one: 49 -> '49.0', 49.85 -> '49.85', 48.125 -> '48.125'. */
const hz = x => x.toFixed(3).replace(/0{1,2}$/, '');
/** Dollars with the sign first: -1000 -> '−$1,000'. */
const usd = x => (x < 0 ? '−' : '') + '$' + num(Math.abs(x));

const station = id => V.STATIONS[id];
const rates = WATCH_SCHEDULE.map(s => num(s.rate) + '×');
const profileRates = V.REF_PROFILE.map(p => p.rate);
const ocgtOffers = V.FLEET.filter(s => s.cls === 'ocgt').map(s => s.offer);
const gtIds = V.FLEET.filter(s => s.cls === 'ocgt').map(s => s.id);
const uflsLastHz = V.UFLS_FIRST_HZ - (V.UFLS_STAGES - 1) * V.UFLS_STEP_HZ;
const ev = CLASSIC.events;
const peakMW = Math.max(...CLASSIC.demand.baseMW.map(p => p[1]));
const households = CLASSIC.city.suburbs.reduce((a, s) => a + s.households, 0);
const coal = station('coal');
// The auto-sync delay's tunable band (the params record's `range`; V keeps values only).
const autoSyncRange = P.AUTO_SYNC_S.range || [V.AUTO_SYNC_S, V.AUTO_SYNC_S];

// The K-12 synchroscope's speed, from the sim's Phase 1a params (desk/README.md §3.3) once
// they exist; until the sim branch merges, the Phase 0.2 stub's text.
const SCOPE_KEYS = ['SYNC_SLIP_MIN_HZ', 'SYNC_SLIP_MAX_HZ', 'SYNC_TRIM_HZ', 'SYNC_CLEAN_DEG', 'SYNC_ROUGH_DEG', 'SYNC_BREAKER_TICKS'];
const SCOPE_PARAMS = SCOPE_KEYS.every(k => V[k] !== undefined) ? SCOPE_KEYS : [];
function scopeOurs() {
  if (!SCOPE_PARAMS.length) {
    return 'SYNC closes cleanly and picks up a block of ' + pct(V.SYNC_BLOCK_FRAC) + '% of rating, then loads to minimum over ' +
      'T2. The desk\'s scope turns faster than a real one.';
  }
  const turn = hzv => num(Math.round(10 / hzv) / 10);
  return 'The needle turns at the slip, seeded at ' + num(V.SYNC_SLIP_MIN_HZ) + '–' + num(V.SYNC_SLIP_MAX_HZ) + ' Hz either way: one ' +
    'turn every ' + turn(V.SYNC_SLIP_MAX_HZ) + '–' + turn(V.SYNC_SLIP_MIN_HZ) + ' s, several times a real scope\'s speed. [ and ] ' +
    'trim it by ' + num(V.SYNC_TRIM_HZ) + ' Hz; the breaker closes ' + num(V.SYNC_BREAKER_TICKS * V.PHYS_DT * 1000) + ' ms after C. ' +
    'Within ±' + num(V.SYNC_CLEAN_DEG) + '° with the machine fast is clean (a block of ' + pct(V.SYNC_BLOCK_FRAC) + '% of rating), ' +
    'to ±' + num(V.SYNC_ROUGH_DEG) + '° rough, slow gives a reverse-power trip, beyond that the sync-check relay blocks it.';
}

// ------------------------------------------------------------------ entries

const ABSTRACTIONS = [
  {
    id: 'compressed-playback', row: 'Compressed playback.', anchorId: 'rate-badge', game: 'rate-badge',
    real: 'One clock at 1×: a grid-second takes a real second, and real operators have minutes to act.',
    ours: 'One grid clock. Physics integrates every ' + num(V.PHYS_DT * 1000) + ' ms of grid time and the grid update ' +
      'runs every grid second, at every speed, so speed changes what you see, never what happens. The bench cruises at a ' +
      'flat ' + num(FLAT_RATE) + '× (the Phase 2 profile runs ' + num(Math.min(...profileRates)) + '–' +
      num(Math.max(...profileRates)) + '×) and plays the first ' + num(V.WATCH_S) + ' grid-seconds after a trip live at ' +
      rates.join(' → ') + '. Pause is free.',
    why: 'A day in minutes with honest physics.',
    params: ['PHYS_DT', 'REF_PROFILE', 'WATCH_S'],
  },
  {
    id: 'event-dense-day', row: 'Event-dense day.', anchorId: 'event-log', game: 'tray',
    real: 'Credible unit and link trips are rare: an operator sees a few a year, not one or two a shift. After a ' +
      'protection trip a unit returns in hours to weeks, depending on the fault and the inspection.',
    ours: 'The classic day always has one large unit trip (the largest online machine), plus an extra unit trip on ' +
      pct(ev.extraTrip.p) + '% of days, a link trip on ' + pct(ev.linkTrip.p) + '%, a smelter trip on ' + pct(ev.smelter.p) +
      '%, a cloud front on ' + pct(ev.cloud.p) + '% and a wind drought on ' + pct(ev.drought.p) + '%; a heatwave on ' +
      pct(V.HEAT_SHARE) + '% of days and a storm on ' + pct(V.STORM_SHARE) + '%. A tripped machine is locked out for ' +
      num(ev.bigTrip.lockoutMin[0]) + '–' + num(ev.bigTrip.lockoutMin[1]) + ' min (' + minutes(V.HOT_TRIP_LOCKOUT_S) +
      ' min after an overheat trip), then may hot-start at once: minimum down time (' + num(coal.minDownH) + ' h for coal) ' +
      'applies only after a planned stop.',
    why: 'Drama in a short day: every day asks at least one real question of the fleet, and a trip is a problem to solve ' +
      'within the day, not a lost unit.',
    params: ['HEAT_SHARE', 'STORM_SHARE', 'HOT_TRIP_LOCKOUT_S', 'FLEET.coal.minDownH'],
  },
  {
    id: 'compressed-synchroscope', row: 'Compressed synchroscope.', anchorId: 'sync-scope', game: 'bay-sync',
    real: 'Real slip is at most 0.067 Hz, 15–30 s per turn, and synchronising is mostly automatic, at the power station, ' +
      'not in the control room.',
    ours: scopeOurs(),
    why: 'A playable skill moment.',
    params: ['SYNC_BLOCK_FRAC', ...SCOPE_PARAMS],
  },
  {
    id: 'auto-sync', row: 'Auto-sync takes 4 grid-minutes', anchorId: 'auto-sync', game: 'bay-sync',
    real: 'Auto-synchronisers work at the station; how long they take from full speed to breaker close is not yet ' +
      'checked (§8.3).',
    ours: 'In AGC mode a machine at full speed closes its own breaker ' + minutes(V.AUTO_SYNC_S) + ' grid-minutes later ' +
      '(tunable ' + minutes(autoSyncRange[0]) + '–' + minutes(autoSyncRange[1]) + '); SYNC closes it sooner. In HAND every ' +
      'close is manual.',
    why: 'It makes SYNC worth doing: a clean manual close brings the unit on sooner.',
    params: ['AUTO_SYNC_S'],
  },
  {
    id: 'pre-dispatch', row: 'Pre-dispatch is computed once, at 04:30', anchorId: 'assist-select', game: 'stack',
    real: 'AEMO re-runs pre-dispatch every 30 minutes, and generators self-commit against it.',
    ours: 'The L-0 plan is made once, at ' + hhmm(V.PLAYER_START_H) + ', from the day-ahead forecast: a merit-order ' +
      'schedule that respects start times, ramps and minimum up and down times, and ignores N-1 and hazards. On the bench, ' +
      'ASSIST PLAN issues its inputs when they fall due (the no-input day of L-0), and ASSIST PAR adds par\'s rules. Under ' +
      'ASSIST PLAN, while districts are dark the levers are re-dispatched for the lit load (at once when the dark share ' +
      'changes, then every ' + minutes(V.PLAN_REFLOW_S) + ' grid-minutes); the plan you saw is unchanged. RE-PLAN re-dispatches ' +
      'it from now over the units you have, as par does after each of its actions.',
    why: 'It leaves the fixing to the player, and a plan written for a whole city must not over-supply a half-dark one.',
    params: ['PLAYER_START_H', 'PLAN_REFLOW_S'],
  },
  {
    id: 'par-replans', row: 'Par re-plans after every action.', anchorId: 'assist-select', game: 'btn-redispatch',
    real: 'AEMO re-runs pre-dispatch every 30 minutes and its dispatch engine re-dispatches every unit every 5 minutes; ' +
      'an operator does not move each generator by hand.',
    ours: 'Par takes at most one discrete action per ' + num(V.PAR_ACTION_GAP_REAL_S) + ' real seconds of the reference ' +
      'playback, and after each one it re-dispatches every lever and the tie from then to 04:00 over the units it has, ' +
      'without spending another action. It starts from the ' + hhmm(V.PLAYER_START_H) + ' plan without its planned stops ' +
      '(it stops units by its own rule). On the desk, RE-DISPATCH gives you the same re-dispatch (on the bench, RE-PLAN ' +
      'under ASSIST PLAN).',
    why: 'Par stands for a good operator who keeps the plan current; dragging every layer by hand is not the skill being ' +
      'graded.',
    params: ['PAR_ACTION_GAP_REAL_S', 'PLAYER_START_H'],
  },
  {
    id: 're-dispatch', row: 'RE-DISPATCH re-runs the pre-dispatch on demand.', anchorId: 'btn-redispatch', ui: 'drawer',
    game: 'btn-redispatch', specPending: true,
    real: 'AEMO re-runs pre-dispatch every 30 minutes, and its dispatch engine (NEMDE) moves every committed unit every 5 ' +
      'minutes; operators decide commitment, reserves, the interconnector and emergencies, not each base point.',
    ours: 'RE-DISPATCH, a key on the desk, re-runs the ' + hhmm(V.PLAYER_START_H) + ' pre-dispatch from now to 04:00 over the ' +
      'units you have committed now, and every lever glides to the new plan. It is refused during the watch and before ' +
      hhmm(V.PLAYER_START_H) + '. Par makes the same re-dispatch after each of its actions, without spending one.',
    why: 'The plan coming together is something you cause: commit a unit on the stack, press RE-DISPATCH, and the desk ' +
      're-arranges itself.',
    params: ['PLAYER_START_H'],
  },
  {
    id: 'act-i-restore-task', row: 'Act I restore task', anchorId: 'restore-panel', game: 'bay-restore',
    real: 'Storm outages and smelter restarts happen, but not every day.',
    ours: 'Not in Phase 0.2: the classic day has no restore task, so districts go dark only through UFLS or directed ' +
      'shedding. The Phase 2 event director adds the task.',
    why: 'So that RESTORE is played by players who never shed.',
    params: [],
  },
  {
    id: 'player-commits', row: 'The player commits units and sets output.', anchorId: 'stations-panel', game: 'lever-coal',
    real: 'Generators self-commit and bid; AEMO dispatches every 5 minutes and issues directions.',
    ours: 'You START and STOP each of the ' + V.MACHINES.length + ' machines and set one base point per station (' +
      V.STATION_IDS.length + ' levers, shared equally by the machines that are on); AGC trims them every ' +
      num(V.AGC_CYCLE_S) + ' s.',
    why: 'The player stands for the whole system.',
    params: ['AGC_CYCLE_S'],
  },
  {
    id: 'agc-band', row: 'AGC band around each lever.', anchorId: 'agc-mode', game: 'key-agc',
    real: 'AGC sends setpoints up to every 4 s; NEMDE, the dispatch engine, re-dispatches every 5 minutes.',
    ours: 'AGC trims each machine every ' + num(V.AGC_CYCLE_S) + ' s within a band around its base point: coal ±' +
      pct(V.CLASSES.coal.agcBandFrac) + '%, CCGT ±' + pct(V.CLASSES.ccgt.agcBandFrac) + '%, GT ±' +
      pct(V.CLASSES.ocgt.agcBandFrac) + '%, hydro ±' + pct(V.CLASSES.hydro.agcBandFrac) + '% of rating; the battery ' +
      'within its range minus the GUARD. It never starts or stops a unit. HAND turns it off for the day.',
    why: 'Readable: each lever shows where AGC may move it.',
    params: ['AGC_CYCLE_S', 'CLASSES.coal.agcBandFrac', 'CLASSES.ccgt.agcBandFrac', 'CLASSES.ocgt.agcBandFrac',
      'CLASSES.hydro.agcBandFrac'],
  },
  {
    id: 'dc-tie', row: 'DC tie.', anchorId: 'tie-panel', game: 'knob-tie',
    real: 'Most NEM interconnectors are AC and share one frequency; their flows are set by NEMDE.',
    ours: 'The region is its own frequency island, joined to the neighbour by a DC tie you set: up to ' + num(V.TIE_MAX_MW) +
      ' MW either way, export up to ' + num(V.TIE_EXPORT_CAP_MW) + ' MW during ' + hhmm(V.TIE_EXPORT_CAP_H[0]) + '–' +
      hhmm(V.TIE_EXPORT_CAP_H[1]) + ', moving at ' + num(V.TIE_RAMP_MW_MIN) + ' MW/min. It gives no frequency response, ' +
      'and a link trip loses its whole import.',
    why: 'It isolates the region\'s physics.',
    params: ['TIE_MAX_MW', 'TIE_EXPORT_CAP_MW', 'TIE_EXPORT_CAP_H', 'TIE_RAMP_MW_MIN'],
  },
  {
    id: 'mainland-standard', row: 'Mainland interconnected standard.', anchorId: 'fos-panel', game: 'dial-freq',
    real: 'An island within the mainland falls under FOS Table A.4: a trip contained within 49.0–51.0 Hz, back to ' +
      '49.5–50.5 Hz within 5 minutes.',
    ours: 'We apply Table A.3: a credible trip must stay within ' + hz(V.CONTAIN_LO_HZ) + '–' + hz(V.CONTAIN_HI_HZ) +
      ' Hz and be back in the normal band, ' + hz(V.NORMAL_LO_HZ) + '–' + hz(V.NORMAL_HI_HZ) + ' Hz, within ' +
      minutes(V.FOS_RECOVER_S) + ' minutes.',
    why: '49.5 Hz is the line most of the NEM runs to, and the stricter line to teach.',
    params: ['CONTAIN_LO_HZ', 'CONTAIN_HI_HZ', 'NORMAL_LO_HZ', 'NORMAL_HI_HZ', 'FOS_RECOVER_S'],
  },
  {
    id: 'msl-tiers', row: 'MSL3 = 1,000 MW, with MSL2 and MSL1 300 and 600 MW above it', anchorId: 'msl-gauge', game: 'drawer', ui: 'drawer',
    real: 'Minimum-system-load floors vary with the synchronous units online; Victoria\'s are about 790 MW with ~500-MW steps.',
    ours: 'Not modelled until Phase 2 (P-4): the bench has no minimum-system-load floor yet.',
    why: 'Our region is an island whose largest load risk is the ' + num(V.SMELTER_MW) + '-MW smelter potline, so the ' +
      'steps are about one such risk apart.',
    params: ['SMELTER_MW'],
  },
  {
    id: 'one-node', row: 'One-node network.', anchorId: 'demand-chart', game: 'map',
    real: 'Transmission lines have limits, so where power is made and used matters.',
    ours: 'One bus: every MW generated reaches every district, with no line limits and no losses.',
    why: 'Scope: the game is about balance, reserve and frequency, not power flow.',
    params: [],
  },
  {
    id: 'cost-based-offers', row: 'Cost-based offers; scarcity adder.', anchorId: 'price-chart', game: 'stack',
    real: 'Generators bid and re-bid their capacity in price bands. When an interconnector is the largest risk, AEMO ' +
      'buys more contingency reserve (FCAS) and may limit the flow.',
    ours: 'Each unit offers at its cost: minimum-load blocks at ' + usd(V.MIN_LOAD_OFFER) + ', coal ' +
      usd(station('coal').offer) + ', CCGT ' + usd(station('ccgt').offer) + ', GTs ' + usd(Math.min(...ocgtOffers)) + '–' +
      num(Math.max(...ocgtOffers)) + ', hydro from ' + usd(station('hydro').offer) + ' rising as its water runs down, ' +
      'wind and solar ' + usd(V.RENEWABLE_OFFER) + ' (per MWh). Below ' + num(V.SCARCITY_FREE_X) + ' × L of spare, a ' +
      'scarcity adder, ' + usd(V.SCARCITY_AT_ONE) + ' at spare = L and steeper below, stands in for re-bidding. Imports are ' +
      'supply, so importing never raises the energy price; but at the evening peak a large import uses the tie\'s spare and ' +
      'can make the tie the biggest risk (L), and then the adder rises. Wind and solar offer what the weather gives, so ' +
      'curtailing them never raises the price.',
    why: 'A readable merit order.',
    params: ['MIN_LOAD_OFFER', 'FLEET.coal.offer', 'FLEET.ccgt.offer', ...gtIds.map(id => 'FLEET.' + id + '.offer'),
      'FLEET.hydro.offer', 'RENEWABLE_OFFER', 'SCARCITY_FREE_X', 'SCARCITY_AT_ONE', 'SCARCITY_QUAD'],
  },
  {
    id: 'customer-cost', row: 'CUSTOMER COST is the resource cost of serving', anchorId: 'scorecard', game: 'chip-cost',
    real: 'NEM customers pay the market price, plus network charges, not the resource cost.',
    ours: 'CUSTOMER COST adds fuel, no-load, starts, imports minus exports, battery wear (' + usd(V.BATT_WEAR_PER_MWH) +
      '/MWh), DR (' + usd(V.DR_PRICE) + '/MWh) and reserve diesel (' + usd(V.RERT_COST) + '/MWh), in cents per kWh ' +
      'served. The market bill is information only, and unserved energy is never priced.',
    why: 'It keeps the cost axis independent of shedding and of scarcity rents.',
    params: ['BATT_WEAR_PER_MWH', 'DR_PRICE', 'RERT_COST'],
  },
  {
    id: 'carbon-generation', row: 'CARBON counts the region\'s own generation.', anchorId: 'scorecard', game: 'chip-co2',
    real: 'AEMO\'s carbon intensity index divides a region\'s emissions by the energy its generators produce; a ' +
      'consumer-based count would instead charge imported energy the neighbour\'s emissions.',
    ours: 'CARBON is tonnes of CO₂ per MWh generated in the region: coal ' + num(coal.co2) + ', CCGT ' + num(station('ccgt').co2) +
      ', GTs ' + num(station('gta').co2) + ', reserve diesel ' + num(V.RERT_CO2) + ' t/MWh; wind, solar and hydro 0. Imports ' +
      'count in neither term (the neighbour\'s emissions are its own), and the battery only stores energy already counted.',
    why: 'Importing cannot make the region look cleaner just by adding MWh to the bottom of the fraction; only a cleaner ' +
      'mix does. Shedding load barely moves it.',
    params: ['FLEET.coal.co2', 'FLEET.ccgt.co2', 'FLEET.gta.co2', 'RERT_CO2'],
  },
  {
    id: 'lor-states', row: 'LOR states via 1.25 × L.', anchorId: 'security-panel', game: 'gauge-n1',
    real: 'LOR1 is reserve below the two largest risks, LOR2 below the largest, LOR3 is load shedding.',
    ours: 'SECURE needs spare in ' + num(V.R5_WINDOW_MIN) + ' min (R5) of at least ' + num(V.SECURE_RATIO) + ' × the ' +
      'biggest risk (L) and a TRIP PREVIEW nadir of at least ' + hz(V.SECURE_NADIR_HZ) + ' Hz plus a ' +
      num(V.PREVIEW_MARGIN_HZ) + ' Hz margin for losing L (plus ' + num(V.PREVIEW_AGE_MARGIN_HZ_S) + ' Hz for each grid-second ' +
      'of the preview\'s age; it is re-run at least every ' + num(V.PREVIEW_REFRESH_S) + ' grid-seconds and whenever frequency ' +
      'moves ' + num(V.PREVIEW_F_TOL_HZ) + ' Hz); TIGHT is R5 ≥ L; SHORT is R5 < L; SHEDDING while load is off.',
    why: 'One gauge. The margin covers what a preview with frozen schedules cannot see (demand wobble, AGC and ramps), ' +
      'measured so that no SECURE state misses ' + hz(V.SECURE_NADIR_HZ) + ' Hz when the biggest risk, L, trips. SECURE ' +
      'guards L only: a unit of nearly L\'s size can still dip below ' + hz(V.SECURE_NADIR_HZ) + ' Hz, because its trip ' +
      'also takes away its inertia and governor (previewing every credible contingency is an open decision).',
    params: ['R5_WINDOW_MIN', 'SECURE_RATIO', 'SECURE_NADIR_HZ', 'PREVIEW_MARGIN_HZ', 'PREVIEW_AGE_MARGIN_HZ_S', 'PREVIEW_REFRESH_S',
      'PREVIEW_F_TOL_HZ'],
  },
  {
    id: 'ufls-blocks', row: 'UFLS: 8 × 6% blocks from 49.0 Hz in 0.125 Hz steps.', anchorId: 'ufls-strip', game: 'annunciator',
    real: 'Schemes differ by region (QLD 2021: 8 blocks, 49.00–48.60 Hz, 0.15 s delay); overall they reach down to ' +
      '47.5 Hz and at most 60% of load.',
    ours: num(V.UFLS_STAGES) + ' stages of about ' + pct(V.UFLS_BLOCK_FRAC) + '% of load, two districts each, from ' +
      V.UFLS_FIRST_HZ.toFixed(3) + ' Hz down to ' + uflsLastHz.toFixed(3) + ' Hz in ' + num(V.UFLS_STEP_HZ) + '-Hz steps, ' +
      num(V.UFLS_DELAY_S) + ' s from crossing to load off. Nothing restores them automatically.',
    why: 'Districts are the blocks, so you see who went dark.',
    params: ['UFLS_STAGES', 'UFLS_BLOCK_FRAC', 'UFLS_FIRST_HZ', 'UFLS_STEP_HZ', 'UFLS_DELAY_S'],
  },
  {
    id: 'collapse', row: 'Collapse after 20 s at 47.5–48.0 Hz.', anchorId: 'freq-readout', game: 'dial-freq',
    real: 'Whether a grid collapses depends on protection settings, not on a timer.',
    ours: 'Black at once at ' + hz(V.BLACK_LO_HZ) + ' Hz or below and at ' + hz(V.BLACK_HI_HZ) + ' Hz or above; after ' +
      V.COLLAPSE_BANDS.map(b => num(b.holdS) + ' s below ' + hz(b.hiHz) + ' Hz').join(' or after ') + ' (compressed).',
    why: 'Graded failure instead of a cliff.',
    params: ['BLACK_LO_HZ', 'BLACK_HI_HZ', 'COLLAPSE_BANDS'],
  },
  {
    id: 'wind-solar-pfr', row: 'Wind and utility solar give no primary frequency response.', anchorId: 'ofgs-lamps', game: 'map',
    real: 'Under the NEM\'s mandatory primary frequency response rule (2020), wind and solar farms respond outside ±0.015 Hz ' +
      'with a droop of 5% or less: they always lower output when frequency is high, and raise it only from output they ' +
      'hold back (curtailment).',
    ours: 'Wind and utility solar hold their output whatever the frequency. Only over-frequency generation shedding acts on ' +
      'them: it trips wind in ' + V.OFGS_STAGES_HZ.length + ' stages of ' + pct(V.OFGS_STAGE_FRAC) + '% from ' +
      hz(V.OFGS_STAGES_HZ[0]) + ' Hz. Governors (droop ' + pct(V.GOV_DROOP) + '%), the battery and load relief do all ' +
      'the primary response.',
    why: 'Simpler physics until the Phase 2 low-demand work (P-12). It makes high-frequency events worse than real, not ' +
      'better, and a curtailed farm offers no raise.',
    params: ['OFGS_STAGES_HZ', 'OFGS_STAGE_FRAC', 'GOV_DROOP'],
  },
  {
    id: 'directed-shedding', row: 'Automatic directed shedding when the FOS timers run out.', anchorId: 'fos-countdown', game: 'key-shed',
    real: 'AEMO directs the network companies to shed load.',
    ours: 'If frequency is still below ' + hz(V.NORMAL_LO_HZ) + ' Hz when the ' + minutes(V.FOS_RECOVER_S) + '-minute ' +
      'countdown ends, or below ' + hz(V.CONTAIN_LO_HZ) + ' Hz for more than ' + num(V.DIRECTED_BELOW_CONTAIN_S) + ' s, ' +
      'one rotation district goes dark every ' + num(V.DIRECTED_INTERVAL_S) + ' s until frequency recovers. It counts ' +
      'against LIGHTS ON.',
    why: 'No reflex test: the rule is visible and automatic.',
    params: ['NORMAL_LO_HZ', 'FOS_RECOVER_S', 'CONTAIN_LO_HZ', 'DIRECTED_BELOW_CONTAIN_S', 'DIRECTED_INTERVAL_S'],
  },
  {
    id: 'restore-permissive', row: 'Restore permissive', anchorId: 'restore-permissive', game: 'bay-restore',
    real: 'AEMO gives permission, and the networks switch small groups back every few minutes.',
    ours: 'RESTORE is allowed when frequency is at least ' + hz(V.RESTORE_MIN_HZ) + ' Hz, ' + minutes(V.RESTORE_INTERVAL_S) +
      ' grid-minutes have passed since the last restore, and a RESTORE PREVIEW of picking up the district\'s cold load ' +
      '(run on the restore itself) keeps the nadir at or above ' + hz(V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ) + ' Hz.',
    why: 'A visible, learnable rule that cannot set off UFLS again (spare in 5 minutes is not primary response).',
    params: ['RESTORE_MIN_HZ', 'RESTORE_INTERVAL_S', 'SECURE_NADIR_HZ', 'PREVIEW_MARGIN_HZ'],
  },
  {
    id: 'cold-load', row: 'Cold-load pickup ×1.5.', anchorId: 'cold-load', game: 'bay-restore',
    real: 'Cold-load pickup varies by feeder and weather.',
    ours: 'A district dark for more than ' + minutes(V.COLD_LOAD_AFTER_S) + ' grid-minutes comes back at ' +
      num(V.COLD_LOAD_FACTOR) + '× its share of demand; the surge decays over ' + minutes(V.COLD_LOAD_DECAY_S) +
      ' grid-minutes.',
    why: 'It teaches "restore no more than you can catch".',
    params: ['COLD_LOAD_AFTER_S', 'COLD_LOAD_FACTOR', 'COLD_LOAD_DECAY_S'],
  },
  {
    id: 'city-levers', row: 'City levers\' MW, costs and patience.', anchorId: 'dr-panel', game: 'btn-dr',
    real: 'Demand-response programs differ, and customers opt out.',
    ours: 'Phase 0.2 has one city lever, industrial DR: ' + num(V.DR_MW) + ' MW for ' + minutes(V.DR_DURATION_S) +
      ' min at ' + usd(V.DR_PRICE) + '/MWh, ' + num(V.DR_CALLS) + ' calls a day, shedding and returning at ' +
      num(V.DR_RAMP_MW_MIN) + ' MW/min. Household levers come in Phase 2.',
    why: 'Playable.',
    params: ['DR_MW', 'DR_DURATION_S', 'DR_PRICE', 'DR_CALLS', 'DR_RAMP_MW_MIN'],
  },
  {
    id: 'hot-water-hold', row: 'HOT WATER HOLD is 80 MW', anchorId: 'hot-water-hold', game: 'drawer', ui: 'drawer',
    real: 'Energex alone held 777 MW of hot-water and pool load on 25 May 2021.',
    ours: 'Not in Phase 0.2: the hold is a Phase 2 city lever (U-2).',
    why: 'It keeps the hold one lever among several; real controlled load is about ten times bigger.',
    params: [],
  },
  {
    id: 'coal-ramp', row: 'Coal ramps at 3 MW/min per machine', anchorId: 'station-coal', game: 'lever-coal',
    real: 'The Aurecon 2021 new-build reference is 3%/min, 19.5 MW/min for a 650-MW machine; ramps of existing units ' +
      'are unverified (§8.3).',
    ours: 'Each ' + num(coal.ratingMW) + '-MW coal machine ramps at ' + num(coal.rampMWMin) + ' MW/min (' +
      num(coal.rampMWMin * coal.machines) + ' MW/min for the station), so one takes ' +
      num(Math.round((coal.ratingMW - coal.minMW) / coal.rampMWMin)) + ' minutes from minimum to full.',
    why: 'Existing units are slower than new-build (unverified), and it makes coal the plan-ahead lever.',
    params: ['FLEET.coal.ratingMW', 'FLEET.coal.minMW', 'FLEET.coal.rampMWMin', 'FLEET.coal.machines'],
  },
  {
    id: 'region-scale', row: 'Region scale.', anchorId: 'region-scale', game: 'map',
    real: 'Real NEM regions range from Tasmania to New South Wales; ours sits between Victoria and South Australia.',
    ours: 'A classic-day peak of about ' + num(peakMW) + ' MW, ' + num(households / 1e6) + ' million households in ' +
      CLASSIC.city.suburbs.length + ' suburbs, ' + num(V.WIND_MW) + ' MW of wind and ' + num(V.SOLAR_MW) + ' MW of ' +
      'utility solar. Rooftop PV arrives in Phase 2. The names are fictional.',
    why: 'A single-region story.',
    params: ['WIND_MW', 'SOLAR_MW'],
  },
  {
    id: 'hum-tone', row: 'Hum reference tone', anchorId: 'hum', game: 'btn-mute', ui: 'drawer',
    real: 'There is no such tone: operators read frequency from instruments.',
    ours: 'The game hums at twice grid frequency (partials at ' + HUM_K.map(k => k + ' × 2f').join(', ') + ') over a quiet fixed ' +
      'reference at ' + HUM_K.map(k => num(k * 2 * F0)).join(' / ') + ' Hz, ' + num(-REF_REL_DB) + ' dB below the hum; each ' +
      'partial beats against its reference at 2k × |f − ' + num(F0) + '|, so at 49.75 Hz the ' + num(4 * 2 * F0) + ' Hz partial ' +
      'wobbles twice a second. Default level ' + num(HUM_DBFS) + ' dBFS. The bench has no sound.',
    why: 'Sonification, like a tuning fork.',
    params: [],
  },
  {
    id: 'hydro-allocation', row: 'Daily hydro allocation', anchorId: 'hydro-storage', game: 'wheel-hydro',
    real: 'Hydro storages are managed across seasons, not days.',
    ours: 'The gorge gets ' + num(V.HYDRO_ALLOCATION_MWH) + ' MWh of water a day; at ' + num(V.HYDRO_STOP_MWH) + ' MWh ' +
      'left the station unloads. Its offer rises from ' + usd(station('hydro').offer) + '/MWh as the water runs down.',
    why: 'A day-sized budget.',
    params: ['HYDRO_ALLOCATION_MWH', 'HYDRO_STOP_MWH', 'FLEET.hydro.offer'],
  },
  {
    id: 'hydro-spins-free', row: 'Hydro spins free.', anchorId: 'station-hydro', game: 'wheel-hydro',
    real: 'A hydro machine spinning at no load still passes water, a few % of its rated flow, and runs inefficiently near ' +
      'zero output; running it as a condenser is a separate, costed operation.',
    ours: 'A gorge machine on line at any output down to ' + num(station('hydro').minMW) + ' MW uses water only for what ' +
      'it generates and has no no-load cost, yet it counts its full inertia (' + num(station('hydro').H) + ' s × ' +
      num(station('hydro').ratingMW) + ' MW), its governor headroom and up to ' +
      num(Math.round(Math.min(station('hydro').ratingMW, station('hydro').rampMWMin * V.R5_WINDOW_MIN))) + ' MW of spare in ' +
      num(V.R5_WINDOW_MIN) + ' minutes.',
    why: 'It keeps the gorge a clean daily energy budget. The spinning services are real (a synchronised machine does give ' +
      'inertia and governor response); what is missing is the no-load water, a few % of the day\'s allocation on days ' +
      'machines spin near 0 MW for hours.',
    params: ['FLEET.hydro.minMW', 'FLEET.hydro.noLoadPerH', 'FLEET.hydro.H', 'FLEET.hydro.ratingMW', 'FLEET.hydro.rampMWMin',
      'R5_WINDOW_MIN'],
  },
  {
    id: 'late-summer', row: 'Every daily is a late-summer day, until Y-9 ships', anchorId: 'clock', game: 'clock',
    real: 'Heatwaves come from about November to March; winter has a later sunrise, an earlier sunset and an evening ' +
      'peak of its own.',
    ours: 'Every bench day is the classic late-summer day: sunrise ' + hhmm(CLASSIC.sun.riseH) + ', sunset ' +
      hhmm(CLASSIC.sun.setH) + ', a heatwave on ' + pct(V.HEAT_SHARE) + '% of days.',
    why: 'One tuned season; a July heatwave would break the realism rule.',
    params: ['HEAT_SHARE'],
  },
];

function deepFreeze(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}

/** Help text for the bench and, later, the desk and the manual drawer (H-14). */
export const TEXT = deepFreeze({abstractions: ABSTRACTIONS});
