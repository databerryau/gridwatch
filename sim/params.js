// sim/params.js: every model constant of the v4 core (spec F-13).
//
// Each constant is a record {value, unit, src} or {value, unit, simplified: true, note}.
// Constants still unconfirmed (spec §8.3) also carry `unverified: true`. A record whose value
// is uncertain within a stated band carries `range: [lo, hi]` (H-8: "every parameter inside
// its §8 range"; tests/params.test.js checks that the value lies inside it).
// No other file under sim/ may contain a numeric literal apart from 0, 1, 2, 50, 60 and
// array indices (tests/params.test.js). Code reads plain values through `V`, which mirrors
// `P` with each record replaced by its value, plus derived tables (V.MACHINES, V.STATIONS).
//
// Stage A (architect) owns this file. Stage B agents may ADD records (with src or
// simplified), each ONLY between its own two marker lines at the end of P, so four parallel
// branches merge without conflicts. Changing a value is tuning. Only the integration owner
// bumps SIM_VERSION (once per merged change set, not per agent).

// 0.2.0: stages A and B (3876c98). 0.2.1: the tuning pass (owner decisions D1-D3: GT·C 2 x 300 MW,
// minimum down time after planned stops only, par's RERT walk, the preview margins, the restore
// preview, the planOnly reflow); the end of Phase 0.2 (golden: tools/baseline-v4.golden.md).
// 0.2.2: the review fixes (hashState's word mixing, the price on the lit demand with the cap only
// for directed shedding, available wind and solar in the stack, CARBON on regional generation).
// 1a.0: Phase 1a (desk/README.md §3): the plan in state and its executor, the new plan, scope and
// sync inputs, the K-12 synchroscope outcomes, DIRECT SHED gated on SHORT/SHEDDING, and N-1 over
// both credible contingencies (A-2); par and the L-0 plan act through planLoad inputs.
// 2a.0: Phase 2a stage A (desk/README.md §19): the state shape for rooftop PV, day types, MSL
// notices, automatic curtailment, the inverters' over-frequency response and unserved / spilled
// energy, all with neutral values: on the classic scenario every number is unchanged (only state
// hashes move, because state gains fields).
export const SIM_VERSION = 'v4-core-2a.0';

const src = (value, unit, source, extra) => Object.assign({value, unit, src: source}, extra);
const simp = (value, unit, note, extra) => Object.assign({value, unit, simplified: true, note}, extra);
const UNVERIFIED = {unverified: true};

// Sources quoted more than once (URLs are in SPEC.md §8.1).
const F13 = 'SPEC F-13 fleet table (starting values, tuned against par, S-12)';
const FOS = 'AEMC Frequency Operating Standard (2023), Tables A.2-A.3';
const PFRR = 'AEMO interim Primary Frequency Response Requirements (2020) s3.3-3.4';
const AEMO25 = 'AEMO technical review of the NEM frequency control landscape (2025) pp.31, 70';
const UFLS_PAPER = 'AEMO dynamic arming options for UFLS (2023) App. A1.2';
const FSIP = 'Split of the hot start into T1 (START to full speed) and T2 (breaker close to MIN), and T4 (MIN to <=5% before the breaker opens), per the NEM fast-start inflexibility profile; the split by class is unverified (§8.3)';
const LEGACY = 'legacy index.html (v2.0 + Phase 0.1)';
const GOV_RANGE = 'Range: §8.1 says governor response takes seconds, many slower than 2 s (FFR working paper 2017 s2.3.1); the range brackets that.';
const RNG_SRC = 'MurmurHash3 fmix32 finaliser (Austin Appleby, public domain) and FNV-1a (Fowler/Noll/Vo, public domain)';

// One dispatchable station (F-13 row); machines are committed individually.
function station(id, name, cls, fields) {
  return Object.assign({id, name, cls}, fields);
}

export const P = {
  // ---------------------------------------------------------------- time (F-2, F-4, C-7)
  PHYS_DT: simp(0.02, 's', 'Physics tick: 20 ms of grid time (F-2, F-4). An integration step, not a real-world value.'),
  TICKS_PER_S: src(50, 'ticks/s', 'Definition: 1 s / PHYS_DT; every 50th tick runs the 1-s grid update (F-2)'),
  DAY_START_H: src(4, 'h', LEGACY + ' L423: t = 0 is 04:00; the sim day runs 04:00 to 04:00'),
  DAY_H: src(24, 'h', 'Definition'),
  S_PER_MIN: src(60, 's/min', 'Definition'),
  S_PER_H: src(3600, 's/h', 'Definition'),
  MW_PER_GW: src(1000, 'MW/GW', 'Definition'),
  KWH_PER_MWH: src(1000, 'kWh/MWh', 'Definition'),
  CENTS_PER_DOLLAR: src(100, 'c/$', 'Definition'),
  PCT: src(100, '%', 'Definition'),
  PER_MILLE: src(1000, 'per-mille', 'Definition: ext series store fractions as integer per-mille (F-3 quantisation)'),
  SERIES_STEP_S: simp(60, 's', 'Spacing of the pre-rolled ext series (F-3); values between samples are interpolated linearly.'),
  MW_EPS: simp(1e-6, 'MW', 'Float tolerance for MW comparisons; numerical, not physical.'),

  // ---------------------------------------------------------------- random streams (F-3)
  RNG_GOLDEN: src(0x9e3779b9, 'u32', RNG_SRC + ' (golden-ratio increment)'),
  RNG_FMIX_M1: src(0x85ebca6b, 'u32', RNG_SRC),
  RNG_FMIX_M2: src(0xc2b2ae35, 'u32', RNG_SRC),
  RNG_FMIX_S1: src(16, 'bits', RNG_SRC),
  RNG_FMIX_S2: src(13, 'bits', RNG_SRC),
  RNG_FNV_OFFSET: src(0x811c9dc5, 'u32', RNG_SRC),
  RNG_FNV_PRIME: src(0x01000193, 'u32', RNG_SRC),
  RNG_U32: src(4294967296, 'count', 'Definition: 2^32, maps a u32 hash to [0, 1)'),
  RNG_NORMAL_TERMS: simp(12, 'count', 'normal() is Irwin-Hall: the sum of 12 uniforms minus 6 has mean 0 and variance 1 and uses only exact arithmetic, so it is bit-identical in every JS engine (risk 5). Tails are cut at +-6.'),
  RNG_NORMAL_SALT: simp(0x6e6f726d, 'u32', 'Stream salt for normal() draws, so they never collide with uniform() draws on the same counters.'),
  Z_P90: src(1.2816, 'sigma', 'Standard normal 90th percentile (P10/P90 band, L-2)'),

  // ---------------------------------------------------------------- frequency physics (H-8)
  F0_HZ: src(50, 'Hz', 'NEM nominal frequency (' + FOS + ')'),
  LOAD_RELIEF: src(0.5, '% load per % frequency', 'AEMO load relief fact sheet (2023): mainland assumption 0.5% per 1% since 2020, kept by the 2023 review; the review estimated 0.6-0.8% by region (the range)', {range: [0.5, 0.8]}),
  GOV_DROOP: src(0.05, 'pu', PFRR + ' (droop <=5%)'),
  GOV_DEADBAND_HZ: src(0.015, 'Hz', PFRR + ' (deadband +-0.015 Hz)'),
  GOV_CAP_FRAC: simp(0.12, 'pu of rating', 'H-8: governor response capped at +-12% of rating; the desk prototypes used 8-20%.'),
  BATT_PFR_DEADBAND_HZ: src(0.015, 'Hz', AEMO25 + ' (battery deadband)'),
  BATT_PFR_FULL_HZ: src(0.85, 'Hz beyond deadband', AEMO25 + ': most batteries reach full output 0.85 Hz beyond the deadband (~1.7% droop)'),
  BATT_PFR_DEAD_S: simp(0.1, 's', 'H-8 battery dead time; the source says only "hundreds of ms" (' + AEMO25 + '). Range: dead time plus lag stays within 1 s.', {range: [0.1, 0.5]}),
  BATT_PFR_LAG_S: simp(0.1, 's', 'H-8 battery first-order lag; see BATT_PFR_DEAD_S (same range).', {range: [0.1, 0.5]}),
  GUARD_TRIGGER_HZ: simp(49.75, 'Hz', 'K-5 GUARD (contingency FFR) trigger. Real switched-controller settings are in the MASS and not yet checked (§8.3). Chosen between the normal band edge (49.85) and containment (49.5), so normal-band wander never fires it; the range is that interval.', {unverified: true, range: [49.5, 49.85]}),
  GUARD_DELIVERY_S: src(1, 's', 'Very Fast raise FCAS timeframe, 1 s (Hornsdale report 2018; WattClarity 2023). Guard MW ramp linearly to full over this time after the trigger.'),
  GUARD_SUSTAIN_S: simp(600, 's', 'H-8: guard sustained for 10 minutes once fired; sustain time unverified (§8.3).', UNVERIFIED),
  GUARD_RAMP_OFF_S: simp(60, 's', 'After the sustain time the guard withdraws linearly over this time, so the withdrawal is not itself a contingency.'),
  GUARD_REARM_HZ: simp(49.85, 'Hz', 'The spent guard re-arms once frequency is back above the normal band edge.'),
  GUARD_STEP_MW: simp(50, 'MW', 'K-5: GUARD ring detents of 50 MW.'),
  UF_SUSPEND_HZ: simp(49.85, 'Hz', 'H-10: under-frequency outside the normal band suspends scheduled battery charging (legacy L501 used -0.15 Hz).'),
  UF_RESUME_HZ: simp(49.9, 'Hz', 'H-10: charging resumes above this (hysteresis; legacy L501 used -0.10 Hz).'),
  F_CLAMP_LO_HZ: simp(46.5, 'Hz', 'H-7: the frequency clamp extends to 46.5 Hz (below the 47 Hz extreme limit).'),
  F_CLAMP_HI_HZ: simp(53.5, 'Hz', 'Upper clamp, mirror of F_CLAMP_LO_HZ; the grid is black at 52 Hz anyway.'),
  FHIST_LEN: simp(32, 'ticks', 'Frequency ring buffer (0.64 s): covers the longest governor dead time (0.5 s) and the 500-ms RoCoF window.'),
  ROCOF_WINDOW_S: src(0.5, 's', FOS + ' Table A.2: RoCoF measured over any 500 ms'),
  ROCOF_LIMIT_HZ_S: src(1, 'Hz/s', FOS + ' Table A.2: 1 Hz/s after a credible event (mainland)'),

  // ---------------------------------------------------------------- UFLS, OFGS, collapse (H-6, H-7)
  UFLS_FIRST_HZ: src(49, 'Hz', UFLS_PAPER + ': first stage 49.0 Hz'),
  UFLS_STEP_HZ: simp(0.125, 'Hz', '§8.2: 8 stages 0.125 Hz apart (real schemes differ; QLD 2021: 8 blocks 49.00-48.60 Hz).'),
  UFLS_STAGES: simp(8, 'count', '§8.2: eight stages, each two city districts (H-6).'),
  UFLS_BLOCK_FRAC: simp(0.06, 'pu of load', '§8.2: about 6% of load per stage; the MW shed is the net load of the stage\'s two districts (P-12).'),
  UFLS_DELAY_S: src(0.3, 's', UFLS_PAPER + ': ~0.1 s measure, ~0.1 s wait, then the breaker opens'),
  BLACK_LO_HZ: src(47, 'Hz', FOS + ' Table A.3 extreme limit'),
  BLACK_HI_HZ: src(52, 'Hz', FOS + ' Table A.3 extreme limit'),
  COLLAPSE_BANDS: simp([{loHz: 47, hiHz: 47.5, holdS: 2}, {loHz: 47.5, hiHz: 48, holdS: 20}], 'Hz, s', '§8.2 / H-7: black after 2 s in 47.0-47.5 Hz or 20 s in 47.5-48.0 Hz; the 20-s window is compressed and labelled. Real collapse depends on protection settings.'),
  OFGS_STAGES_HZ: src([51, 51.25, 51.5, 51.75], 'Hz', 'AEMO 2025 frequency review Table 1: wind trips in stages between 51 and 52 Hz (stage spacing simplified)'),
  OFGS_STAGE_FRAC: simp(0.25, 'pu of wind output', 'Each OFGS stage trips a quarter of the wind output (H-7). Apart from these trips wind and utility solar hold their output whatever the frequency: no droop response (§8.2 "Wind and utility solar give no primary frequency response."; real semi-scheduled plant has mandatory PFR).'),
  OFGS_DELAY_S: simp(0.3, 's', 'OFGS relay delay, taken equal to UFLS_DELAY_S.'),
  OFGS_RECONNECT_S: simp(600, 's', 'Tripped wind reconnects after 10 grid-minutes back in the normal band.'),

  // ---------------------------------------------------------------- operating standard (H-11, K-15, D-5)
  NORMAL_LO_HZ: src(49.85, 'Hz', FOS + ': normal operating band'),
  NORMAL_HI_HZ: src(50.15, 'Hz', FOS + ': normal operating band'),
  CONTAIN_LO_HZ: src(49.5, 'Hz', FOS + ' Table A.3: credible contingency containment'),
  CONTAIN_HI_HZ: src(50.5, 'Hz', FOS + ' Table A.3: credible contingency containment'),
  FOS_RECOVER_S: src(300, 's', FOS + ': back in the normal band within 5 minutes'),
  DIRECTED_BELOW_CONTAIN_S: simp(60, 's', 'H-11: directed shedding if frequency stays below 49.5 Hz for more than 1 grid-minute.'),
  DIRECTED_INTERVAL_S: simp(60, 's', 'H-11: one district per grid-minute until frequency recovers.'),
  EVENT_THRESHOLD_MW: src(50, 'MW', FOS + ' Table A.8: event threshold >50 MW (K-15 watch trigger)'),
  SECURE_AGAIN_S: src(1800, 's', 'NER chapter 4 cl. 4.2.6: secure again within 30 minutes (D-5)'),
  WATCH_S: simp(30, 's', 'K-15: the watch covers the first 30 grid-seconds after a contingency; no input is accepted during it.'),

  // ---------------------------------------------------------------- security (H-4, K-10, K-13)
  R5_WINDOW_MIN: simp(5, 'min', 'H-4: R5 is headroom deliverable within 5 minutes.'),
  BATT_R5_SUSTAIN_H: simp(0.5, 'h', 'H-4: the battery counts what it can sustain for 30 minutes (SoC x 2).'),
  SECURE_RATIO: simp(1.25, 'x L', '§8.2: LOR states via R5 >= 1.25 L (real LOR1 = below the two largest risks).'),
  SECURE_NADIR_HZ: src(49.5, 'Hz', FOS + ' Table A.3 containment (H-4 TRIP PREVIEW condition)'),
  PREVIEW_HORIZON_S: simp(10, 's', 'H-8/K-10: the TRIP PREVIEW runs the engine for 10 grid-seconds (stops early once the nadir has passed).'),
  PREVIEW_REFRESH_S: simp(60, 's', 'Security refreshes the cached preview at most every 60 grid-s, or at once when marked dirty (any accepted input, a breaker change, a trip, or L moving; see PREVIEW_L_TOL_MW). Performance budget, not physics.'),
  PREVIEW_L_TOL_MW: simp(20, 'MW', 'The cached TRIP PREVIEW is re-run as soon as L changes unit or moves by more than this since the preview ran (20 MW moves a 650-MW nadir by ~0.01 Hz). Performance budget, not physics.'),
  RESTORE_MIN_HZ: simp(49.9, 'Hz', 'K-13 / J-19: restore permissive needs f >= 49.9 Hz.'),
  RESTORE_INTERVAL_S: simp(300, 's', 'K-13: at least 5 grid-minutes between restores (Callide report s6.1: small groups every few minutes).'),
  COLD_LOAD_FACTOR: simp(1.5, 'x', 'K-13 / §8.2: cold-load pickup 1.5x for districts dark more than 10 grid-minutes.'),
  COLD_LOAD_AFTER_S: simp(600, 's', 'K-13: cold-load pickup applies after 10 grid-minutes dark.'),
  COLD_LOAD_DECAY_S: simp(600, 's', 'K-13: the surge decays linearly over 10 grid-minutes.'),
  DISTRICT_SHARE: simp(0.03, 'pu of demand', 'K-13 / U-1: a district is ~3% of demand; one UFLS stage is two districts.'),

  // ---------------------------------------------------------------- AGC (K-2, L-8)
  AGC_CYCLE_S: src(4, 's', 'Hornsdale initial-operation report (2018) s2.1: AGC setpoints up to every 4 s'),
  AGC_BIAS_MW_PER_HZ: simp(800, 'MW/Hz', 'AGC frequency bias (about 1% of the 7.7 GW peak per 0.1 Hz). One-area ACE: the tie is DC and does not share frequency (§8.2).'),
  AGC_KI_PER_S: simp(0.1, '1/s', 'AGC integral gain on ACE; a starting value for tuning (K-2 accept: >=97% of ticks in band on event-free days).'),
  AGC_DEADBAND_HZ: simp(0.005, 'Hz', 'AGC ignores errors this small (keeps AGC from chasing needle noise).'),
  AGC_LIMIT_ALARM_REAL_S: simp(5, 'real s', 'K-2: AGC LIMIT lights after >5 REAL seconds at the band limit. Real time is the app\'s business (C-7): the sim exposes agc.atLimitS in grid seconds.'),

  // ---------------------------------------------------------------- unit behaviour (F-13, H-1, H-2, K-12, S-11)
  SYNC_BLOCK_FRAC: simp(0.05, 'pu of rating', 'K-12 / H-1: breaker close picks up a block of <=5% of rating.'),
  BREAKER_OPEN_FRAC: simp(0.05, 'pu of rating', 'H-1: the T4 shutdown ramp ends at <=5% of rating before the breaker opens.'),
  AUTO_SYNC_S: simp(240, 's', 'K-12 / §8.2: the auto-synchroniser closes 4 grid-minutes after full speed (tunable 3-5, the range); real auto-sync time unverified (§8.3).', {unverified: true, range: [180, 300]}),
  HOT_LOADING_FRAC: src(0.96, 'pu of available', 'H-2 / ' + LEGACY + ' L480: above 96% loading a unit runs hot'),
  HOT_ARM_S: simp(300, 's', LEGACY + ' L481: trip risk applies after 5 grid-minutes hot.'),
  HOT_TRIP_PER_H: simp(0.035, 'probability per grid-hour', 'H-2: trip risk ~3.5% per grid-hour while hot (legacy 0.00012 per 0.2-min tick). Drawn from the play stream.'),
  HOT_TRIP_LOCKOUT_S: simp(7200, 's', 'Protection lockout after an overheat trip, inside the legacy 90-150 min (L463; the pre-rolled event trips draw theirs from the same range, content/scenarios.js). After it the unit may hot-start (T1 + T2): S-11 minimum down time applies to planned stops only (owner decision D1, 2026-09-30). Real returns after a protection trip range from hours to weeks (§8.2).'),
  HEAT_THERMAL_DERATE: src(0.07, 'pu', 'S-10 / ' + LEGACY + ' L462: heatwave derates coal and gas by 7%'),
  HEAT_DEMAND_UPLIFT: src(0.065, 'pu', 'S-10 / ' + LEGACY + ' L433: heatwave demand +6.5%'),
  HEAT_RAMP_S: src(3600, 's', LEGACY + ' L431-433: heat demand ramps in over the hour before onset and out over the hour after'),
  HEAT_TEMP_UPLIFT_C: simp(7, 'degC', LEGACY + ' L1364: displayed temperature +7 degC during a heatwave.'),
  HEAT_SHARE: src(0.15, 'share of days', 'S-10: heatwaves on 15% of days (' + LEGACY + ' L334-335)'),
  STORM_SHARE: src(0.3, 'share of days', LEGACY + ' L334-335 after Phase 0.1: storm on 30% of days (D-8 changes this to 25% in Phase 2)'),

  // ---------------------------------------------------------------- dispatchable fleet (F-13, S-11, P-6)
  FLEET: [
    station('coal', 'Mt Hazel coal', 'coal', {
      machines: src(4, 'count', F13),
      ratingMW: src(650, 'MW', F13),
      minMW: src(240, 'MW', F13 + ' (37%)'),
      rampMWMin: simp(3, 'MW/min per machine', '§8.2: 12 MW/min per station as today; the Aurecon 2021 new-build reference is 3%/min, 6.5x faster. Existing-unit ramps unverified (§8.3).', UNVERIFIED),
      t1Min: simp(50, 'min', FSIP + '. 120-min hot start = T1 50 + T2 70.', UNVERIFIED),
      t2Min: simp(70, 'min', FSIP + '. T2 70 min keeps the 5% to MIN climb within the 3 MW/min ramp.', UNVERIFIED),
      t4Min: simp(70, 'min', FSIP + '. MIN (240) to 5% (32.5 MW) at <=3 MW/min.', UNVERIFIED),
      offer: src(26, '$/MWh', F13 + '; P-6 coal above minimum'),
      noLoadPerH: src(3000, '$/h per machine', F13),
      startCost: simp(80000, '$ per start', LEGACY + ' L290 station start cost, applied per machine.'),
      minUpH: src(8, 'h', F13 + '; S-11'),
      minDownH: src(8, 'h', F13 + '; S-11. After a planned stop only: a protection trip is followed by its lockout, then a hot start (owner decision D1, fleet.startBlock)'),
      co2: src(0.95, 't/MWh', F13),
      H: simp(5, 's', F13 + '; textbook inertia constant (§8.3: swing-equation constants unverified).'),
    }),
    station('ccgt', 'Riverton CCGT', 'ccgt', {
      machines: src(2, 'count', F13),
      ratingMW: src(650, 'MW', F13),
      minMW: src(175, 'MW', F13),
      rampMWMin: src(17.5, 'MW/min per unit', F13 + ' (legacy L291: 35 MW/min per station)'),
      t1Min: simp(35, 'min', FSIP + '. 45-min hot start = T1 35 + T2 10.', UNVERIFIED),
      t2Min: simp(10, 'min', FSIP, UNVERIFIED),
      t4Min: simp(10, 'min', FSIP + '. MIN (175) to 5% at <=17.5 MW/min.', UNVERIFIED),
      offer: src(74, '$/MWh', F13 + '; P-6'),
      noLoadPerH: src(3000, '$/h per unit', F13),
      startCost: simp(30000, '$ per start', LEGACY + ' L291 station start cost, applied per unit.'),
      minUpH: src(4, 'h', F13 + '; S-11'),
      minDownH: src(3, 'h', F13 + '; S-11'),
      co2: src(0.42, 't/MWh', F13),
      H: simp(4.5, 's', F13 + '; textbook (§8.3).'),
    }),
    station('gta', 'GT·A', 'ocgt', {
      machines: src(1, 'count', F13),
      ratingMW: src(500, 'MW', F13),
      minMW: src(250, 'MW', F13 + ' (50%, Aurecon 2021 OCGT reference)'),
      rampMWMin: src(160, 'MW/min', F13),
      t1Min: simp(6, 'min', FSIP + '. 8-min hot start = T1 6 + T2 2.', UNVERIFIED),
      t2Min: simp(2, 'min', FSIP, UNVERIFIED),
      t4Min: simp(2, 'min', FSIP, UNVERIFIED),
      offer: src(148, '$/MWh', F13 + '; P-6'),
      noLoadPerH: src(4000, '$/h', F13),
      startCost: simp(8000, '$ per start', LEGACY + ' L292.'),
      minUpH: src(1, 'h', F13 + '; S-11'),
      minDownH: src(0.5, 'h', F13 + '; S-11'),
      co2: src(0.63, 't/MWh', F13),
      H: simp(3.5, 's', F13 + '; textbook (§8.3).'),
    }),
    station('gtb', 'GT·B', 'ocgt', {
      machines: src(2, 'count', F13 + ' (2 x 400: no simple-cycle GT above ~600 MW exists)'),
      ratingMW: src(400, 'MW', F13),
      minMW: src(200, 'MW', F13 + ' (50%)'),
      rampMWMin: src(160, 'MW/min per machine', F13),
      t1Min: simp(6, 'min', FSIP + '. 8-min hot start = T1 6 + T2 2.', UNVERIFIED),
      t2Min: simp(2, 'min', FSIP, UNVERIFIED),
      t4Min: simp(2, 'min', FSIP, UNVERIFIED),
      offer: src(152, '$/MWh', F13 + '; P-6'),
      noLoadPerH: src(4000, '$/h per machine', F13),
      startCost: simp(8000, '$ per start', LEGACY + ' L293, applied per machine.'),
      minUpH: src(1, 'h', F13 + '; S-11'),
      minDownH: src(0.5, 'h', F13 + '; S-11'),
      co2: src(0.63, 't/MWh', F13),
      H: simp(3.5, 's', F13 + '; textbook (§8.3).'),
    }),
    station('gtc', 'GT·C', 'ocgt', {
      machines: src(2, 'count', F13 + ' (new; S-12 difficulty knob, §9 Q-3). Owner decision D2 (2026-09-30): 2 x 300 MW, so the largest single risk is unchanged; tunable within 1-2 machines x 150-300 MW, never by inflating demand'),
      ratingMW: src(300, 'MW per machine', F13),
      minMW: src(150, 'MW per machine', F13 + ' (50%)'),
      rampMWMin: src(160, 'MW/min per machine', F13),
      t1Min: simp(4, 'min', FSIP + '. 5-min hot start = T1 4 + T2 1.', UNVERIFIED),
      t2Min: simp(1, 'min', FSIP, UNVERIFIED),
      t4Min: simp(1, 'min', FSIP, UNVERIFIED),
      offer: src(156, '$/MWh', F13 + '; P-6'),
      noLoadPerH: src(2400, '$/h per machine', F13),
      startCost: simp(8000, '$ per start', 'Taken equal to the other GTs (legacy L292), per machine.'),
      minUpH: src(1, 'h', F13 + '; S-11'),
      minDownH: src(0.5, 'h', F13 + '; S-11'),
      co2: src(0.63, 't/MWh', F13),
      H: simp(3.5, 's', F13 + '; textbook (§8.3).'),
    }),
    station('hydro', 'Greyfell Gorge hydro', 'hydro', {
      machines: src(3, 'count', F13),
      ratingMW: src(317, 'MW', F13),
      minMW: src(0, 'MW', F13),
      rampMWMin: src(130 / 3, 'MW/min per machine', F13 + ': 130 MW/min per station, split over 3 machines'),
      t1Min: simp(3, 'min', FSIP + '. 3-min hot start, all T1 (MIN is 0, so no T2).', UNVERIFIED),
      t2Min: simp(0, 'min', FSIP, UNVERIFIED),
      t4Min: simp(0, 'min', FSIP + '. MIN is 0: the machine unloads at its ramp, then the breaker opens.', UNVERIFIED),
      offer: simp(130, '$/MWh', 'P-6: water value $130 at full storage, rising as storage falls (HYDRO_WATER_VALUE).'),
      noLoadPerH: simp(0, '$/h', 'F-13: none. Simplified (§8.2 "Hydro spins free."): a machine on line at any output down to 0 MW draws water only for what it generates (no speed-no-load flow, which is a few % of rated flow in reality) and costs nothing, yet counts its full inertia, governor headroom and R5.'),
      startCost: simp(2000, '$ per start', LEGACY + ' L294.'),
      minUpH: simp(0, 'h', 'F-13: none.'),
      minDownH: simp(0, 'h', 'F-13: none.'),
      co2: src(0, 't/MWh', F13),
      H: simp(3.5, 's', F13 + '; textbook (§8.3).'),
    }),
  ],

  // Per technology class: governor dynamics (H-8) and AGC band (K-2).
  CLASSES: {
    coal: {thermal: true,
      govDeadS: simp(0.5, 's', 'H-8 coal dead time; the FFR working paper (2017) s2.3.1 says only "seconds; many slower than 2 s". ' + GOV_RANGE, {range: [0.1, 1]}),
      govLagS: simp(5, 's', 'H-8 coal first-order lag. ' + GOV_RANGE, {range: [1, 10]}),
      agcBandFrac: simp(0.05, 'pu of rating', 'K-2: coal AGC band +-5% of capacity.')},
    ccgt: {thermal: true,
      govDeadS: simp(0.3, 's', 'H-8 CCGT dead time (FFR working paper 2017 s2.3.1, qualitative). ' + GOV_RANGE, {range: [0.1, 1]}),
      govLagS: simp(3, 's', 'H-8 CCGT lag. ' + GOV_RANGE, {range: [1, 10]}),
      agcBandFrac: simp(0.1, 'pu of rating', 'K-2: CCGT AGC band +-10%.')},
    ocgt: {thermal: true,
      govDeadS: simp(0.2, 's', 'H-8 OCGT dead time (FFR working paper 2017 s2.3.1, qualitative). ' + GOV_RANGE, {range: [0.1, 1]}),
      govLagS: simp(1.5, 's', 'H-8 OCGT lag. ' + GOV_RANGE, {range: [1, 10]}),
      agcBandFrac: simp(0.2, 'pu of rating', 'K-2: GT AGC band +-20%.')},
    hydro: {thermal: false,
      govDeadS: simp(0.5, 's', 'H-8 hydro dead time (FFR working paper 2017 s2.3.1, qualitative; the non-minimum-phase water column is not modelled). ' + GOV_RANGE, {range: [0.1, 1]}),
      govLagS: simp(4, 's', 'H-8 hydro lag. ' + GOV_RANGE, {range: [1, 10]}),
      agcBandFrac: simp(0.25, 'pu of rating', 'K-2: hydro AGC band +-25%.')},
  },

  // ---------------------------------------------------------------- hydro water (P-6, K-4)
  HYDRO_ALLOCATION_MWH: simp(7500, 'MWh/day', '§8.2 daily hydro allocation (' + LEGACY + ' L308); real storages are seasonal.'),
  HYDRO_WATER_VALUE: simp([[0, 5000], [0.1, 1000], [0.25, 300], [0.5, 160], [1, 130]], '[storage fraction, $/MWh]', 'P-6: water value $130 at full allocation, rising as storage falls; interpolated linearly. Shape is game tuning.'),
  HYDRO_VAR_COST: simp(9, '$/MWh', LEGACY + ' L294 hydro running cost, used in CUSTOMER COST (S-2); the water value is an offer, not a cost.'),
  HYDRO_WARN_FRACS: src([0.3, 0.1], 'pu of allocation', LEGACY + ' L477-478 storage warnings'),
  HYDRO_STOP_MWH: simp(75, 'MWh', 'Below this storage the station is unloaded at its ramp, so it reaches zero before the water does (legacy L479 tripped it instead).'),

  // ---------------------------------------------------------------- battery (F-13, H-8, H-10, K-5)
  BATT_MW: src(500, 'MW', F13 + ' (grid-following)'),
  BATT_MWH: src(1000, 'MWh', F13),
  BATT_CHARGE_EFF: simp(0.85, 'pu', 'Round-trip efficiency, applied on charge. Not in the spec; typical utility Li-ion is 80-90% (unverified).', UNVERIFIED),
  BATT_WEAR_PER_MWH: simp(6, '$/MWh throughput', LEGACY + ' L307 battery wear.'),
  BATT_DISPATCH_RAMP_MW_S: simp(10, 'MW/s', 'DEVIATES FROM F-13 ("full swing in <1 s"): scheduled battery output (orders + AGC) moves at 600 MW/min, so a dial turn is not a self-made contingency; the <1-s full swing is used only by PFR and the guard (H-8). How fast real grid batteries follow dispatch targets is unverified.', UNVERIFIED),
  BATT_FULL_EPS_MWH: simp(1, 'MWh', LEGACY + ' L500: FULL-HOLD engages within 1 MWh of full (H-10).'),

  // ---------------------------------------------------------------- DC tie (F-13, K-6, P-6)
  TIE_MAX_MW: src(800, 'MW', F13 + ': import and export <=800 MW'),
  TIE_EXPORT_CAP_MW: src(300, 'MW', F13 + ' / J-14: export <=300 MW while the neighbour has the same sun'),
  TIE_EXPORT_CAP_H: src([9, 16], 'h', F13 + ': export cap applies 09:00-16:00'),
  TIE_RAMP_MW_MIN: src(100, 'MW/min', F13 + ' (' + LEGACY + ' L309)'),

  // ---------------------------------------------------------------- wind and utility solar (F-13, P-6)
  WIND_MW: src(1200, 'MW', F13),
  SOLAR_MW: src(1400, 'MW', F13),
  RENEWABLE_OFFER: src(-20, '$/MWh', 'P-6 / AEMO QED Q4 2025 s2.2: average negative price -$19.4'),
  CURTAIL_STEP_PCT: simp(5, '%', LEGACY + ' L1326: curtailment slider steps (UI only; the sim accepts any 0-100).'),
  FINE_NOISE_MW: simp(6, 'MW (sigma)', 'Second-to-second demand wobble (ext stream, white per grid second) so the needle is never perfectly still.'),

  // ---------------------------------------------------------------- emergency resources (F-13, K-7)
  RERT_MW: src(300, 'MW', F13),
  RERT_LEAD_S: src(1200, 's', F13 + ' / K-7: 20-min lead'),
  RERT_COST: src(16000, '$/MWh', 'AEMO RERT quarterly report Q4 2024: NSW activation $16,000/MWh (§9 Q-2)'),
  RERT_CO2: simp(0.8, 't/MWh', F13 + ' (diesel).'),
  RERT_RAMP_MW_MIN: simp(100, 'MW/min', 'The diesel fleet loads and stands down over 3 minutes rather than as one 300-MW step; RERT minimum activation unverified (§8.3).', UNVERIFIED),
  DR_MW: src(350, 'MW', F13 + ' industrial DR'),
  DR_CALLS: src(3, 'calls/day', F13),
  DR_PRICE: src(1400, '$/MWh', F13 + ' / P-6'),
  DR_DURATION_S: simp(3600, 's', LEGACY + ' L1341: a DR call lasts 60 minutes.'),
  SMELTER_MW: src(256, 'MW', 'Boyne Island potline 2 trip, 256 MW (2021), Callide report s6.1 (F-13)'),
  SMELTER_RETURN_MW_MIN: simp(25, 'MW/min', 'The potline reconnects over ~10 minutes after its outage (legacy returned 600 MW in one step, L455).'),

  // ---------------------------------------------------------------- market (P-5 to P-8, H-12)
  PRICE_CAP: src(23200, '$/MWh', 'AEMC schedule of reliability settings FY2026-27 (H-12, P-8)'),
  PRICE_FLOOR: src(-1000, '$/MWh', 'AEMC MSL consultation paper (2026): market floor price (P-8)'),
  VCR: src(30000, '$/MWh', 'AER VCR review 2024, NEM-wide (H-12): debrief footnote only, never in CUSTOMER COST'),
  MIN_LOAD_OFFER: src(-1000, '$/MWh', 'P-6: thermal minimum-load blocks offered at the floor'),
  STACK_START_WITHIN_S: simp(600, 's', 'P-5: the price stack holds offline units able to reach MIN within 10 minutes.'),
  SCARCITY_FREE_X: simp(1.25, 'R5/L', 'P-7: no adder at R5/L >= 1.25.'),
  SCARCITY_AT_ONE: simp(300, '$/MWh', 'P-7: adder rises linearly to $300 at R5/L = 1.'),
  SCARCITY_QUAD: simp(4700, '$/MWh', 'P-7: below R5/L = 1 the adder is $300 + $4,700 (1 - x)^2. Labelled "generators re-bidding when supply is tight (abstraction)".'),

  // ---------------------------------------------------------------- scorecard (S-1 to S-3, Y-4)
  SPARK_BLOCK_S: src(7200, 's', 'Y-4: sparkline blocks of 2 hours'),
  SPARK_BLOCKS: src(12, 'count', 'Y-4: 12 blocks from 04:00'),

  // ---------------------------------------------------------------- forecasts (S-4, L-1, L-2)
  FC_HORIZON_S: src(16200, 's', 'L-1: the Live Stack looks 4.5 h ahead (coal start plus climb, 4 h 17 min)'),
  FC_STEP_S: src(300, 's', 'L-1: 5-minute columns'),
  FC_SIGMA_NEAR: simp(0.006, 'pu of demand', 'L-2: demand forecast sigma 0.6% at 5-min lead (unverified, §8.3). NOT USED since stage B: weather.forecast derives its band from the demand-noise process of the scenario (this relative band failed L-2 at 4 h); kept for the §8.3 register.', UNVERIFIED),
  FC_SIGMA_FAR: simp(0.025, 'pu of demand', 'L-2: demand forecast sigma 2.5% at 4-h lead (unverified, §8.3). NOT USED since stage B (see FC_SIGMA_NEAR).', UNVERIFIED),
  FC_SIGMA_FAR_S: simp(14400, 's', 'L-2: lead at which FC_SIGMA_FAR applies; sigma is linear in lead between 5 min and 4 h. NOT USED since stage B (see FC_SIGMA_NEAR).'),
  FC_DRIFT_TAU_S: simp(3600, 's', 'S-4: wind and solar forecasts drift from the present value toward the climatological or announced value with this time constant.'),

  // ---------------------------------------------------------------- par and the reference playback (S-4, D-2, D-5)
  REF_PROFILE: simp([
    {fromH: 4.5, toH: 6, rate: 540}, {fromH: 6, toH: 9, rate: 270}, {fromH: 9, toH: 11, rate: 480},
    {fromH: 11, toH: 14.5, rate: 300}, {fromH: 14.5, toH: 16.5, rate: 240}, {fromH: 16.5, toH: 20, rate: 150},
    {fromH: 20, toH: 21, rate: 300}, {fromH: 21, toH: 28, rate: 2100},
  ], 'h, grid-s per real-s', 'D-2 clock profile (245 real s from 04:30). Hours are UNWRAPPED (DAY_START_H + s / 3600, so 21:00-04:00 is 21-28), never hourOfDay. Par paces its actions on it (S-4) even while the Phase 0.2-1 director runs a flat 120x.'),
  REF_WATCH_REAL_S: simp(10.5, 'real s', 'D-2: compact watch; par never acts during it.'),
  REF_RESPOND_CARD_S: simp(3, 'real s', 'D-2: respond card read time in the reference schedule.'),
  RESPOND_RATE: simp(30, 'grid-s per real-s', 'D-5: RESPOND runs at 30x until frequency is back in band, for at most 5 grid-minutes.'),
  RESPOND_MAX_S: simp(300, 's', 'D-5: at most 5 grid-minutes at 30x.'),
  PLAYER_START_H: simp(4.5, 'h', '§4.1 / D-2: the desk opens at 04:30; 04:00-04:30 settles headless during the briefing. Par acts from here.'),
  PAR_ACTION_GAP_REAL_S: src(3, 'real s', 'S-4: at most one discrete action per 3 real seconds of the reference playback'),
  PAR_DECIDE_EVERY_S: simp(60, 's', 'runPar asks decide() at most once per grid-minute (and at the first second after a watch), so a headless day stays fast. Par cannot act more often than every ~360 grid-s anyway (3 real s at >=120x).'),
  PROXY_COMPETENT_GAP_REAL_S: simp(6, 'real s', 'The "competent" player proxy (H-1, F-3, K-8, S-5): the L-0 plan plus par\'s rules at half par\'s pace, reading only observe(): a good human at the desk.'),
  PAR_TIGHT_RATIO: src(1.05, 'x L', 'S-4 rule 2: if R5 < 1.05 L, import and start the next peaker'),
  PAR_COMMIT_MARGIN_MW: src(700, 'MW', 'S-4 rule 3: commit when forecast net demand + 700 MW exceeds committed capacity + half the battery'),
  PAR_COMMIT_LEAD_MIN: src(20, 'min', 'S-4 rule 3: look ahead the unit\'s start time + 20 min'),
  PAR_DECOMMIT_MIN_ON_MIN: src(90, 'min', 'S-4 rule 4: decommit only after 90 min on'),
  PAR_DECOMMIT_CLEAR_MIN: src(150, 'min', 'S-4 rule 4: ...when not needed for the next 150 min'),
  PAR_WATER_HOLD_UNTIL_H: src(15.5, 'h', 'S-4 rule 5: hold water until 15:30'),
  PAR_WATER_EMPTY_BY_H: src(21, 'h', 'S-4 rule 5: then release it linearly to 21:00'),
  PAR_BATT_CHARGE_TO: src(0.97, 'pu SoC', 'S-4 rule 6: charge to 97%'),
  PAR_BATT_CHARGE_H: src([9.5, 15.5], 'h', 'S-4 rule 6: charge 09:30-15:30'),
  PAR_BATT_DISCHARGE_H: src([16.5, 22], 'h', 'S-4 rule 6: discharge 16:30-22:00 by merit order'),
  PAR_MAX_LOADING: src(0.955, 'pu of available', 'S-4 rule 7: keep units at or below 95.5% loading unless that would shed load'),
  PAR_RERT_LOOKAHEAD_MIN: src(25, 'min', 'S-4 rule 8: projected 25-min shortfall (par arms on a short step between RERT_LEAD_S and this lead: the 20-min lead plus one decision; autopilot rule8)'),
  PAR_RERT_MARGIN_MW: src(100, 'MW', 'S-4 rule 8: pre-arm when the shortfall is within 100 MW of firm capacity (a power margin in the par adequacy walk; the energy pool is charged without it)'),

  // ================================================================ stage B additions
  // Each stage B agent adds records ONLY between its own two marker lines (merge-safe).
  // ---- stage B "physics" block: begin
  GUARD_WITHDRAW_S: simp(60, 's per BATT_MW', 'K-5: when the GUARD ring is turned down while the guard is delivering, the FFR layer withdraws at BATT_MW per this time (8.3 MW/s, the same slope as GUARD_RAMP_OFF_S) instead of stepping, so a ring detent is never a self-made contingency. Game abstraction: real FCAS enablement changes only at dispatch intervals.'),
  UF_RESUME_LINEAR: simp(true, 'flag', 'H-10: once suspended below UF_SUSPEND_HZ, scheduled charging re-engages in proportion as frequency rises from UF_SUSPEND_HZ to UF_RESUME_HZ (all of it above UF_RESUME_HZ, where the suspension clears), instead of as one step at UF_RESUME_HZ that would knock frequency back below 49.85 Hz and chatter. Game abstraction of an inverter ramping back to its charge setpoint; false gives the plain step.'),
  // ---- stage B "physics" block: end
  // ---- stage B "grid" block: begin
  OFGS_RECONNECT_GAP_S: simp(60, 's', 'After OFGS_RECONNECT_S back in the normal band, tripped wind reconnects one OFGS stage at a time, this far apart (the last stage to trip returns first), so returning wind is never more than one stage (a quarter of the wind output) in one step; reconnecting all four at once could be a 1-GW self-made over-frequency event. Real wind farms return at limited ramp rates set in their performance standards.'),
  SEC_RATIO_MAX: simp(99, 'x L', 'sec.ratio (R5 / L) is capped here so it stays a finite number (state is plain JSON) when L is tiny or zero; every value above SECURE_RATIO reads the same.'),
  PREVIEW_MARGIN_HZ: simp(0.05, 'Hz', 'H-4 / H-8: SECURE needs the TRIP PREVIEW nadir at or above SECURE_NADIR_HZ + this. The preview freezes demand, renewables and schedules for its 10 s (K-10) and is cached up to PREVIEW_REFRESH_S; in live play the second-to-second demand wobble (FINE_NOISE_MW), AGC and ramps inside the nadir window move the real nadir. Measured (tuning pass, par days, seeds 1-88): real minus fresh preview p1% -0.05 Hz, p0.1% -0.09 Hz, worst -0.105 Hz over 4,448 states; with this margin 0 of ~1,200 SECURE states (fresh or cached preview) missed 49.5 Hz (0.04 Hz already gave 0; 0.02 Hz missed 14). A modelling allowance, not a grid value.'),
  PREVIEW_AGE_MARGIN_HZ_S: simp(0.001, 'Hz per grid-s', 'H-4 / H-8: a cached TRIP PREVIEW is trusted less as it ages: SECURE needs the cached nadir at or above SECURE_NADIR_HZ + PREVIEW_MARGIN_HZ + this x its age (up to PREVIEW_REFRESH_S, so +0.06 Hz at 60 s). Measured (tuning pass): with the fixed margin alone two states the desk showed SECURE on a 39-46 s old preview lost 0.064-0.073 Hz of nadir while the plan and AGC moved the battery charge and unit schedules (the charge suspended on a trip is contingency response, H-10), and missed 49.5 Hz by up to 0.02 Hz. Cheaper than refreshing the preview more often (each preview costs ~0.1-0.3 ms). A modelling allowance, not a grid value.'),
  PREVIEW_F_TOL_HZ: simp(0.03, 'Hz', 'H-4 / H-8 / K-10: the cached TRIP PREVIEW is re-run as soon as the frequency has moved more than this since it ran. The preview starts from the present frequency and governor and battery state, so one cached during an excursion overstates the nadir once frequency has come back (and one cached at 50 Hz overstates it once governors have spent their response). Found by tools/baseline-v4.js (end of Phase 0.2): without it, 4 of 1,595 states the desk showed as SECURE missed 49.5 Hz when L tripped (worst 49.417 Hz), their cached preview 0.07-0.17 Hz above a fresh one 3-20 s after an excursion to 50.06-50.25 Hz or 49.95 Hz; with it 0 of 4,299 probes missed, for ~6,800 previews a day instead of ~4,000. A performance budget (smaller re-runs more often), not physics.'),
  // ---- stage B "grid" block: end
  // ---- stage B "market + events" block: begin
  // ---- stage B "market + events" block: end
  // ---- stage B "autopilot" block: begin
  PLAN_MAX_LOADING: simp(0.955, 'pu of available', 'L-0: the pre-dispatch loads units to this, just under the H-2 hot gate (HOT_LOADING_FRAC 0.96), so a plan at full output does not itself run units hot; the same value as par rule 7 (PAR_MAX_LOADING). Real pre-dispatch schedules units to their offered MaxAvail; the overload zone is a game mechanic.'),
  PLAN_REFLOW_S: src(1800, 's', 'AEMO re-runs pre-dispatch every 30 minutes (§8.2 "Pre-dispatch is computed once"). L-0 execution (planOnly, autopilot reflowLit): while districts are dark the plan re-dispatches for the lit load at this cadence (and at once when the dark share moves), as NEM dispatch targets metered demand; the 04:30 plan the player sees is unchanged.'),
  PLAN_KEYFRAME_MIN_MW: simp(5, 'MW', 'L-0 plan and par: a station base point or tie setpoint keyframe is written only when it moves at least this far from the last one written (fewer inputs; the ramp check still holds between keyframes). Presentation of the plan, not physics.'),
  PAR_REBASE_MW: simp(150, 'MW', 'Par rule 7 (extension, README autopilot): par re-dispatches its plan when AGC carries more than this (|agc.requestMW|) or the plan misses the forecast for the coming column by more than this: about one GT AGC band. Tuning (S-12).'),
  PAR_NADIR_MIN_HZ: simp(49.2, 'Hz', 'Par rule 2 (v4 form): the N-1 check in seconds (H-4). When the TRIP PREVIEW for losing L is below this, par raises the GUARD (contingency FFR), then starts a peaker (inertia and headroom); its plan keeps the tie import at or below the largest unit. 0.2 Hz above the first UFLS stage as margin for the preview error and for L moving between previews. Real: AEMO enables contingency raise FCAS for the largest credible contingency and constrains interconnector flows. Tuning (S-12).'),
  PAR_NADIR_RELAX_HZ: simp(49.55, 'Hz', 'Par rule 2: the GUARD steps down again only when the TRIP PREVIEW is above this (hysteresis), returning battery MW to AGC and orders.'),
  PAR_GUARD_STEP_MW: simp(100, 'MW', 'Par rule 2: one GUARD change is this many MW (two K-5 detents).'),
  PAR_GUARD_MAX_MW: simp(400, 'MW', 'Par rule 2: the most GUARD par holds back, leaving at least 100 MW of the battery for AGC and orders.'),
  PAR_BATT_CHARGE_MAX_MW: simp(350, 'MW', 'Par rule 6: the charge order never exceeds this (rules lab controller ctl(), battery plan "peak": 350 MW).'),
  PAR_BATT_ORDER_TOL_MW: simp(50, 'MW', 'Par rule 6: par changes a battery order only when the order it wants differs from the present one by more than this.'),
  PAR_BATT_RESERVE_FRAC: simp(0.2, 'pu SoC', 'Par rule 6: discharge by merit order stops at this state of charge, keeping energy for primary frequency response (H-8) after the peak. The rule 8 adequacy walk counts only the battery energy above it.'),
  PAR_WATER_KEEP_MWH: simp(5200, 'MWh', 'Par rule 5, how "hold water" is read (rules lab controller ctl(): waterKeep 5200): until PAR_WATER_HOLD_UNTIL_H par keeps at least this much water in storage (hydro runs at its water value above it, and below it only to avoid a shortfall); the kept water is then released on a line falling linearly to the reserve at PAR_WATER_EMPTY_BY_H.'),
  PAR_WATER_RESERVE_MWH: simp(300, 'MWh', 'Par rule 5: the linear release leaves this much water above HYDRO_STOP_MWH at PAR_WATER_EMPTY_BY_H, for the night.'),
  PAR_DECOMMIT_EXTRA_MW: simp(250, 'MW', 'Par rule 4: extra margin on top of PAR_COMMIT_MARGIN_MW before a unit is decommitted (rules lab controller ctl(): +250 MW).'),
  PAR_DR_MARGIN_MW: simp(60, 'MW', 'Par rules 8 and 1: DR is called when present net demand plus this exceeds units, tie and diesel (rules lab controller ctl(): +60 MW), and (rule 8) hydro and the battery cannot carry it or a call can be spared from the peak.'),
  PAR_RERT_STANDDOWN_MIN: simp(45, 'min', 'Par rules 4 and 8: reserve diesel stays armed at least this long before par stands it down, once the adequacy walk without it is clean (rules lab controller ctl(): 45 min; RERT minimum activation unverified, §8.3).'),
  PAR_FUZZ_SALT: simp(0x7a667a31, 'u32', 'The fuzz proxy hashes the seed with this private salt (hash(seed ^ salt, minute, draw)), so its inputs never come from the sim streams (F-3).'),
  PAR_FUZZ_P: simp(0.05, 'probability per decision', 'Fuzz proxy: chance of one random input at each decision (every PAR_DECIDE_EVERY_S), about 70 a day.'),
  // ---- stage B "autopilot" block: end
  // ---- stage B "integration" block: begin
  CURTAIL_RAMP_FRAC_MIN: simp(0.2, 'pu of nameplate per min', 'A curtailment LIMIT change moves wind or solar output at this rate (20% of nameplate a minute: a full-range change over about one 5-min dispatch interval, as semi-scheduled plant ramps to its dispatch target over the interval) instead of in one grid second, so curtailing solar at noon is never a >1-GW self-made step. Weather changes pass straight through; only the curtailed part is ramp-limited. Plant ramp limits vary (unverified).', UNVERIFIED),
  DR_RAMP_MW_MIN: simp(100, 'MW/min', 'Industrial DR sheds and returns at this rate (3.5 min for 350 MW, the same slope as RERT_RAMP_MW_MIN) instead of as one 350-MW load step on and off, which would be a self-made event larger than the 256-MW smelter trip and not recorded as a contingency. Real DR response times vary (unverified).', UNVERIFIED),
  // ---- stage B "integration" block: end
  // ---- phase 1a "sim" block: begin
  DEG_PER_TURN: src(360, 'deg', 'Definition: one turn of the synchroscope needle'),
  PLAN_HISTORY_S: src(1800, 's', 'L-1: the Live Stack shows 30 minutes of past; plan keyframes older than this are dropped from state.plan (the past is drawn from history).'),
  PLAN_MAX_KEYS: simp(400, 'count', 'planLoad: at most this many entries per list (a whole day of 5-min columns is 282). Keeps one input and the log bounded; not a grid value.'),
  N1_PREVIEW_ALL: simp(true, 'flag', 'H-4 / H-8 / K-10, Phase 1a decision A-2: SECURE needs the TRIP PREVIEW of BOTH credible contingencies (the largest unit and the tie import) to clear 49.5 Hz + margins, and BIGGEST RISK names the one with the lower nadir. N-1 means any credible contingency (NER cl. 4.2.6); a unit of nearly the tie\'s MW also takes its inertia and governor with it, so previewing only the larger MW missed 28 of 4,904 states (end of Phase 0.2). false previews only L, the larger MW.'),
  SYNC_SLIP_MIN_HZ: simp(0.15, 'Hz', 'K-12: the slip a machine reaches full speed with is drawn (play stream) between this and SYNC_SLIP_MAX_HZ, either sign: one needle turn every 2.5-6.7 s. Real operators aim for 15-30 s per turn; ours turns faster (§8.2 "Our synchroscope turns faster").'),
  SYNC_SLIP_MAX_HZ: simp(0.4, 'Hz', 'K-12: upper end of the seeded slip (see SYNC_SLIP_MIN_HZ).'),
  SYNC_TRIM_HZ: simp(0.05, 'Hz', 'K-12: one [ or ] press moves the machine speed target by this (governor raise/lower pulse).'),
  SYNC_TRIM_S: simp(0.5, 's', 'K-12: the slip moves linearly to a new speed target over this time (the governor response to a trim pulse).'),
  SYNC_SLIP_LIMIT_HZ: simp(1, 'Hz', 'K-12: the speed trim never takes the slip beyond this (the machine is at full speed; the governor holds it near synchronous).'),
  SYNC_BREAKER_TICKS: simp(4, 'ticks', 'K-12: the breaker takes 80 ms (4 ticks) to close, so the outcome is judged at the angle 80 ms after the close command, and real practice closes just before 12 o\'clock. HV circuit-breaker closing times are typically a few tens of ms to ~100 ms (unverified for this fleet).', UNVERIFIED),
  SYNC_CLEAN_DEG: simp(10, 'deg', 'K-12: a close within +-10 degrees with the needle clockwise is clean (the spec\'s table; operators aim within about 10 degrees of 12 o\'clock). Exact utility settings unverified.', UNVERIFIED),
  SYNC_ROUGH_DEG: simp(20, 'deg', 'K-12: beyond 20 degrees the sync-check relay (ANSI device 25) blocks the close; between SYNC_CLEAN_DEG and this the close is rough (the spec\'s table). Real device 25 angle windows are set per plant; unverified.', UNVERIFIED),
  SYNC_BLOCK_SLIP_HZ: simp(0.5, 'Hz', 'K-12: the sync-check relay blocks a close at more than this slip (real device 25 slip limits are ~0.1-0.3 Hz; ours is looser because our needle turns faster, §8.2).'),
  SYNC_REVERSE_TRIP_S: simp(2, 's', 'K-12: a close with the machine slow (needle anticlockwise) motors it; reverse-power protection trips it after this, back to full speed and the queue with no lockout (real reverse-power relays wait seconds).'),
  SYNC_BYPASS_LOCKOUT_S: simp(1200, 's', 'K-12: a close forced past the sync-check relay (HAND bypass key) trips the unit at once and locks it out for 20 grid-minutes for inspection (shaft and winding stress; real out-of-phase closes can mean weeks of repair).'),
  SYNC_AUTO_SLIP_HZ: simp(0.1, 'Hz', 'K-12 AUTO: the auto-synchroniser trims the slip to +0.10 Hz (machine slightly fast, so it picks up load, not motor) and closes on the next pass through 0 degrees.'),
  SYNC_ROUGH_MW: simp(40, 'MW', 'K-12: a rough close (10-20 degrees) adds a one-second MW swing of this size to the unit\'s schedule on top of the clean block: the power surge that pulls the rotor into step. Game abstraction of an electromechanical transient that really lasts ~1 s and oscillates; kept below the 50-MW FOS event threshold so it is felt, not a contingency.'),
  // ---- phase 1a "sim" block: end
  // ================================================================ Phase 2a additions (desk/README.md §19.4)
  // The "shared" block is stage A's and is frozen in stage B (more than one job reads it). Each sim
  // job adds its own records ONLY between its own two marker lines below (merge-safe).
  // ---- phase 2a "shared" block: begin
  MSL1_MW: simp(1600, 'MW', 'P-4 / desk/README.md C-9: an MSL1 notice when the minimum forecast operational demand (P50, now and over the 4.5-h window) is at or below this: two credible load contingencies (about 300 MW each: the 256-MW potline, or the 300-MW midday export) above the security floor MSL3. AEMO\'s structure (AEMC MSL paper, Table 2.1) with our steps; real floors vary with the network and the synchronous units online.'),
  MSL2_MW: simp(1300, 'MW', 'P-4 / desk/README.md C-9: MSL2, one credible load contingency above MSL3; also about this fleet\'s coal + CCGT minimums (1,310 MW). See MSL1_MW.'),
  MSL3_MW: simp(1000, 'MW', 'P-4 / desk/README.md C-9: MSL3, the security floor. Above Victoria\'s ~790 MW because this region is an electrical island and must keep its own synchronous plant on; a floor for a region like ours is unverified (§8.3).', UNVERIFIED),
  MSL_TIE_OUT_MW: simp(300, 'MW', 'desk/README.md C-9: every MSL threshold is raised by this while the tie is out of service (no export sink: the 300-MW midday export is gone). AEMO\'s floors vary with the network; this is one step of ours.'),
  MSL_CHECK_S: simp(300, 's', 'desk/README.md C-9 / §21.1: the MSL level is re-checked every 5 grid-minutes (one forecast per check, the forecast\'s own column step). A notice cadence and performance budget, not a grid value.'),
  MSL_CLEAR_MW: simp(100, 'MW', 'desk/README.md C-9 / §21.1: hysteresis. A level is left only once the forecast minimum is this far above its threshold, so a notice does not chatter (K-8). Not a grid value.'),
  ROOF_RECONNECT_S: src(60, 's', 'AS/NZS 4777.2:2020: an inverter reconnects no sooner than 60 s after the grid is back within its voltage and frequency limits (P-12, desk/README.md C-8: a restored district picks up its full underlying load first)'),
  ROOF_RAMP_S: simp(360, 's', 'P-12 / desk/README.md C-8: after the reconnection delay a district\'s rooftop output returns linearly over this time; also the release of the held over-frequency back-off (C-7). AS/NZS 4777.2:2020 limits the power ramp after reconnection to 16.67% of rating per minute (6 minutes to full output); the 6-minute ramp is unverified (§8.3).', UNVERIFIED),
  ROOF_FW_START_HZ: src(50.25, 'Hz', 'AS/NZS 4777.2:2020, region Australia A: the over-frequency response starts at fULCO = 50.25 Hz (desk/README.md C-7)'),
  ROOF_FW_ZERO_HZ: src(52, 'Hz', 'AS/NZS 4777.2:2020, region Australia A: output falls linearly from fULCO to zero at fPmin = 52 Hz (desk/README.md C-7)'),
  ROOF_FW_HYST_HZ: src(0.1, 'Hz', 'AS/NZS 4777.2:2020, region Australia A: hysteresis 0.1 Hz. The lowest output reached is held until frequency is back under fULCO - 0.1 Hz = 50.15 Hz (desk/README.md C-7)'),
  REN_PFR_ON: simp(false, 'flag', 'desk/README.md C-7: wind and utility solar lower their output on over-frequency (GOV_DROOP on rating beyond GOV_DEADBAND_HZ, capped by present output). Lowering only: real semi-scheduled plant under mandatory PFR also raises from curtailed headroom. A simplified flag: false at stage A (no behaviour change on any scenario); the Phase 2a grid job turns it on.'),
  ROOF_FW_ON: simp(false, 'flag', 'desk/README.md C-7: rooftop inverters back off between ROOF_FW_START_HZ and ROOF_FW_ZERO_HZ and hold the lowest value reached (the AS/NZS 4777.2 response, modelled as one aggregate inverter). A simplified flag: false at stage A (no behaviour change on any scenario); the Phase 2a grid job turns it on.'),
  SURPLUS_MIN_MW: simp(50, 'MW', 'desk/README.md C-11 / §21.3: projected or present spill at or below this is not shown as SURPLUS on the Live Stack and does not fire par rule 2 or the objective\'s CHARGE. A display and rule threshold, not a grid value.'),
  // ---- phase 2a "shared" block: end
  //
  // ---- phase 2a "world" block: begin
  COOLING_MAX_MW: simp(1400, 'MW', 'P-3 / desk/README.md C-3: the cooling load a MILD day does not have. cooling = COOLING_MAX_MW x clamp((T - COOLING_BASE_C) / COOLING_SPAN_C, 0, 1) with T from the scenario\'s hot-day temperature table: about 100 MW per degC above 22 degC, all 1,400 MW at 36 degC. The ~100 MW/degC is unverified (SPEC §8.3).', UNVERIFIED),
  COOLING_BASE_C: simp(22, 'degC', 'P-3: no cooling load at or below this temperature (see COOLING_MAX_MW; unverified, SPEC §8.3).', UNVERIFIED),
  COOLING_SPAN_C: simp(14, 'degC', 'P-3: the cooling load reaches COOLING_MAX_MW this far above COOLING_BASE_C (36 degC, the hot-day table\'s peak; see COOLING_MAX_MW; unverified, SPEC §8.3).', UNVERIFIED),
  WEEKEND_DEMAND_FACTOR: simp(0.92, 'x underlying demand', 'P-3 / J-13 / desk/README.md C-3: a Saturday or Sunday multiplies the underlying demand shape of any day type by this (before the heat uplift and the noise). A game value: one factor for the whole day, where real weekend load shapes differ hour by hour; not checked against a region\'s data.', UNVERIFIED),
  // ---- phase 2a "world" block: end
  //
  // ---- phase 2a "grid" block: begin
  // ---- phase 2a "grid" block: end
  //
  // ---- phase 2a "par" block: begin
  // ---- phase 2a "par" block: end
};

// ------------------------------------------------------------------ plain values

const META = new Set(['src', 'note', 'simplified', 'unverified', 'unit', 'range']);
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x) && 'value' in x && 'unit' in x;

/** Deep copy of `x` with every param record replaced by its value (meta keys dropped). */
export function valuesOf(x) {
  if (isRecord(x)) return valuesOf(x.value);
  if (Array.isArray(x)) return x.map(valuesOf);
  if (x !== null && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) if (!META.has(k)) o[k] = valuesOf(x[k]);
    return o;
  }
  return x;
}

function deepFreeze(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}

const v = valuesOf(P);
const S_PER_MIN = v.S_PER_MIN, S_PER_H = v.S_PER_H;

v.TICKS_PER_S = Math.round(1 / v.PHYS_DT);
v.DAY_S = v.DAY_H * S_PER_H;
v.DAY_TICKS = v.DAY_S * v.TICKS_PER_S;
v.SERIES_LEN = v.DAY_S / v.SERIES_STEP_S + 1;
v.PLAYER_START_S = (v.PLAYER_START_H - v.DAY_START_H) * S_PER_H;
v.PLAYER_START_TICK = v.PLAYER_START_S * v.TICKS_PER_S;

// Stations keyed by id, and one row per machine with everything the hot loops need
// precomputed (per-second ramp, H x S, dead time in ticks, lag coefficient, bands).
v.STATIONS = {};
v.MACHINES = [];
for (const st of v.FLEET) {
  const cl = v.CLASSES[st.cls];
  const first = v.MACHINES.length;
  for (let j = 1; j <= st.machines; j++) {
    v.MACHINES.push({
      id: st.id + j, station: st.id, cls: st.cls, k: v.MACHINES.length, j,
      name: st.name + (st.machines > 1 ? ' ' + j : ''),
      thermal: cl.thermal,
      ratingMW: st.ratingMW, minMW: st.minMW,
      rampMWs: st.rampMWMin / S_PER_MIN,
      t1S: st.t1Min * S_PER_MIN, t2S: st.t2Min * S_PER_MIN, t4S: st.t4Min * S_PER_MIN,
      minUpS: st.minUpH * S_PER_H, minDownS: st.minDownH * S_PER_H,
      offer: st.offer, noLoadPerS: st.noLoadPerH / S_PER_H, startCost: st.startCost, co2: st.co2,
      H: st.H, ekMWs: st.H * st.ratingMW,
      govDeadTicks: Math.round(cl.govDeadS / v.PHYS_DT), govAlpha: v.PHYS_DT / cl.govLagS,
      govCapMW: v.GOV_CAP_FRAC * st.ratingMW,
      govGainMWperHz: st.ratingMW / (v.GOV_DROOP * v.F0_HZ),
      agcBandMW: cl.agcBandFrac * st.ratingMW,
      syncBlockMW: v.SYNC_BLOCK_FRAC * st.ratingMW,
      breakerOpenMW: v.BREAKER_OPEN_FRAC * st.ratingMW,
    });
  }
  v.STATIONS[st.id] = Object.assign({}, st, {first, count: st.machines, totalMW: st.machines * st.ratingMW});
}
v.STATION_IDS = v.FLEET.map(s => s.id);
v.MACHINE_IDS = v.MACHINES.map(m => m.id);

/** Plain, frozen values of every param plus derived tables. Hot code hoists what it needs. */
export const V = deepFreeze(v);

/** Machine row by id ('coal1', 'gtb2', ...), or undefined. */
export function machineById(id) {
  return V.MACHINES.find(m => m.id === id);
}
