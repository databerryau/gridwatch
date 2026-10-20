// content/alarmhelp.js: the alarm panel's explainers, one per tile, on demand (Q-44, Q-46). The
// shape and the rules they keep: app/alarmpanel.js. W7 Q3: every tile asks for an action, and
// WHAT TO DO names it (EEMUA 191); the four retired tiles (PEAK, HIGH RoCoF, MIN GEN, WEATHER) have none.

import {V} from '../sim/params.js';
import * as A from '../app/alarms.js';
import {unitLabel, clockOf, mmss} from '../desk/util.js';
import {tripSheds, shedsLine} from '../desk/calc.js';
import {mw, hz as hz3} from '../render/format.js';

const hz = x => x.toFixed(2), min = s => s / V.S_PER_MIN, pct = f => Math.round(f * V.PCT);
const watch = 'lit through the ' + V.WATCH_S + '-s watch, then it flashes slowly until ACK.';
const FOS = 'The AEMC frequency standard ', WE = ' (well established).';
const LOR = 'AEMO\'s reserve levels: LOR1 is reserve below the two largest risks, LOR2 below the largest, LOR3 is load shedding' + WE;
const BAND = hz(V.NORMAL_LO_HZ) + '–' + hz(V.NORMAL_HI_HZ) + ' Hz';
const esc = (w, x) => '; ' + w + ' ' + hz(x) + ' Hz it escalates to P1, the horn.';
const fNow = o => hz3(o.f.hz) + ' Hz' + (o.fos.outsideS > 0 ? ' · ' + mmss(o.fos.outsideS) + ' outside ' + BAND : '');
// the gauge's word (W7 Q2: TRIP SHEDS with what it would cost, by the sim's own relays: vm.sheds), then the spare against the risk
const atRisk = (o, t, v) => (tripSheds(o.sec) ? 'TRIP SHEDS: ' + shedsLine(o, v && v.sheds) : 'N-1 ' + o.sec.level) + ' · spare ' + mw(o.sec.r5MW) + ' vs ' +
  mw(o.sec.lMW) + ' MW · biggest risk ' + unitLabel(o.sec.lId);

export const ALARM_HELP = {
  underFreq: {
    trigger: 'Sets below ' + hz(A.UNDER_SET_HZ) + ' Hz, clears above ' + hz(A.UNDER_CLEAR_HZ) + ' Hz' + esc('below', A.ESC_LO_HZ),
    means: 'The city uses more power than the machines make, so they all slow a little.',
    why: 'Frequency is the machines\' speed. A shortfall drains their spin until the battery, governors and load relief catch it, ' +
      'and AGC restores ' + V.F0_HZ + ' Hz. Out of the band ' + min(V.FOS_RECOVER_S) + ' min (under ' + hz(V.CONTAIN_LO_HZ) + ' Hz: ' +
      min(V.DIRECTED_BELOW_CONTAIN_S) + ' min), districts are shed (GRIDWATCH\'s own rule: a stand-in for AEMO directing the networks); at ' +
      hz(V.UFLS_FIRST_HZ) + ' Hz relays shed at once.',
    todo: {text: 'More supply: discharge the battery, start a unit (S S), import on the TIE, or hold D for demand response (on a HAND day, RE-DISPATCH: N).',
      target: 'dial-battery'},
    real: {text: FOS + '(2023): ' + BAND + ', at most ' + min(V.FOS_RECOVER_S) + ' min outside; a credible trip within ' + V.CONTAIN_LO_HZ +
      '–' + V.CONTAIN_HI_HZ + ' Hz. AEMO (2023): load shedding from ' + V.UFLS_FIRST_HZ.toFixed(1) +
      ' Hz, about ' + V.UFLS_DELAY_S + ' s to load off. All well established.',
    facts: ['Normal operating band', 'Credible trip containment', 'UFLS first stage and timing']},
    reading: o => fNow(o) + (o.fos.directed ? ' · directed shedding' : ''),
  },
  overFreq: {
    trigger: 'Sets above ' + hz(A.OVER_SET_HZ) + ' Hz, clears below ' + hz(A.OVER_CLEAR_HZ) + ' Hz' + esc('above', A.ESC_HI_HZ),
    means: 'The machines make more power than the city is using, so they speed up.',
    why: 'The surplus goes into spin; governors, the battery, wind and solar back off. From ' + V.OFGS_STAGES_HZ[0] + ' Hz wind farms ' +
      'trip in stages; at ' + V.BLACK_HI_HZ + ' Hz the grid goes black. Usually a load lost at noon: the export (TIE TRIP) or the smelter (no trip tile).',
    todo: {text: 'Less supply: charge the battery, stop a unit (X X) or export on the TIE (on a HAND day, lower a lever).', target: 'dial-battery'},
    real: {text: FOS + 'sets extreme limits of ' + V.BLACK_LO_HZ + '–' + V.BLACK_HI_HZ + ' Hz' + WE + ' AEMO\'s 2025 review: wind trips in ' +
      'stages from ' + V.OFGS_STAGES_HZ[0] + ' to ' + V.BLACK_HI_HZ + ' Hz (likely); South Australia peaked at 51.11 Hz on 31 Jan 2020' + WE,
    facts: ['Extreme limits', 'Over-frequency generation shedding']},
    reading: o => fNow(o) + (o.wind.ofgsTrippedFrac > 0 ? ' · ' + pct(o.wind.ofgsTrippedFrac) + '% of wind tripped' : ''),
  },
  n1: {
    trigger: 'Sets after ' + A.N1_SET_S + ' grid-s with the N-1 gauge red (SHORT, SHEDDING or TRIP SHEDS); clears after ' +
      min(A.N1_CLEAR_S) + ' grid-min without. TIGHT alone lights nothing.',
    means: 'If your biggest risk tripped now, the city would lose load: the spare is short of it, or too slow to stop the relays at ' +
      V.UFLS_FIRST_HZ.toFixed(1) + ' Hz, or districts are dark already.',
    why: 'SECURE needs spare that arrives within ' + V.R5_WINDOW_MIN + ' min of ' + V.SECURE_RATIO + ' × the biggest risk (the biggest unit ' +
      'or the tie import), and a TRIP PREVIEW above ' + V.SECURE_NADIR_HZ + ' Hz with a margin. TIGHT misses that margin but still ' +
      'catches the trip above the relays. With fewer machines spinning, frequency falls faster, so plenty of spare can arrive too late.',
    todo: {text: 'Faster or more spare: raise the GUARD (G), start a gas turbine or hydro machine, or import less than your ' +
      'biggest unit (T previews a trip).', target: 'ring-guard'},
    real: {text: 'NER cl. 4.2.6: secure again within ' + min(V.SECURE_AGAIN_S) + ' minutes (likely). ' + LOR,
      facts: ['Secure again within 30 min', 'LOR levels']},
    reading: atRisk,
  },
  unitTrip: {
    trigger: 'Sets when protection trips a machine carrying over ' + V.EVENT_THRESHOLD_MW + ' MW; ' + watch,
    means: 'A machine dropped off at once, with all its output.',
    why: 'Spin takes the first hit, the battery and governors answer in seconds; AGC and you restore ' + V.F0_HZ + ' Hz. The unit is ' +
      'locked out for a while (GRIDWATCH\'s rule: real ones are out for hours to months).',
    todo: {text: 'Replace its MW (the plan line names the quickest unit) and be secure within ' + min(V.SECURE_AGAIN_S) + ' min.', target: 'stack'},
    real: {text: FOS + 'counts a loss over ' + V.EVENT_THRESHOLD_MW + ' MW as an event. AEMO\'s 2025 review: the largest credible contingency is ' +
      'about 700–800 MW, frequency back in the band 10–20 s after large credible trips. All well established.',
    facts: ['Event threshold', 'Largest credible contingency', 'Recovery after large credible trips']},
    reading: o => {
      const c = o.contingencies.filter(x => x.cause === 'unit').pop(), u = c && o.units.find(x => x.id === c.id);
      return c ? unitLabel(c.id) + ' lost ' + mw(c.lostMW) + ' MW · at ' + clockOf(c.startS) + (u && u.mode === 'tripped' ? ' · out ' + mmss(u.timerS) + ' more' : '')
        : 'no trip yet · biggest risk ' + mw(o.sec.lMW) + ' MW';
    },
  },
  linkTrip: {
    trigger: 'Sets when the tie to the neighbour trips; ' + watch,
    means: 'The interconnector opened: its import is gone (or, if exporting, that load is gone).',
    why: 'A link trip is a contingency the size of its flow. Our tie is DC: the neighbour shares none of our frequency.',
    todo: {text: 'Replace the import with your own plant; the TIE knob shows when it is back. While it is out the MSL floors are ' +
      V.MSL_TIE_OUT_MW + ' MW higher.', target: 'knob-tie'},
    real: {text: 'Most NEM links are AC and share frequency, with flows set by NEMDE. GRIDWATCH\'s DC tie makes the region a frequency island.',
      abstraction: 'DC tie.'},
    reading: o => (o.tie.tripped ? 'TIE out · back in ' + mmss(o.tie.lockoutS) : 'TIE ' + (o.tie.flowMW < 0 ? 'exporting ' : 'importing ') +
      mw(Math.abs(o.tie.flowMW)) + ' MW'),
  },
  ufls: {
    trigger: 'Sets when a relay stage operates in a trip\'s watch; ' + watch,
    means: 'Frequency fell to ' + hz(V.UFLS_FIRST_HZ) + ' Hz and relays cut whole districts to save the grid.',
    why: V.UFLS_STAGES + ' stages ' + V.UFLS_STEP_HZ + ' Hz apart, two districts and about ' + pct(V.UFLS_BLOCK_FRAC) + '% of load each, ' +
      V.UFLS_DELAY_S + ' s from crossing to load off. Nothing restores them by itself.',
    todo: {text: 'Close feeders in the RESTORE bay (R) when its lamp lights (' + V.RESTORE_MIN_HZ + ' Hz, ' + min(V.RESTORE_INTERVAL_S) +
      ' min apart, spare to carry them). Dark over ' + min(V.COLD_LOAD_AFTER_S) + ' min, a district returns at ' + V.COLD_LOAD_FACTOR +
      ' × its load.', target: 'bay-restore'},
    real: {text: 'AEMO (2023): NEM schemes start at ' + V.UFLS_FIRST_HZ.toFixed(1) + ' Hz, about ' + V.UFLS_DELAY_S + ' s to load off. ' +
      'Queensland 2021: 8 blocks from 49.00 to 48.60 Hz shed 1,308 MW. After Callide, AEMO allowed load back 4–26 min later. All well ' +
      'established.', facts: ['UFLS first stage and timing', 'Real staging example', 'Restoring load']},
    reading: o => 'districts dark: ' + o.districts.filter(x => x.dark && !(x.shedBy === 'task' && x.clearS > o.s)).length + ' · ' + mw(o.demand.unservedMW) + ' MW off',
  },
  agcLimit: {
    trigger: 'Sets after AGC is at the edge of its bands for over ' + A.AGC_LIMIT_REAL_S + ' real s of running clock.',
    means: 'The running units have no room left in their AGC bands to follow demand.',
    why: 'AGC trims each unit within a band around its base point every ' + V.AGC_CYCLE_S + ' s; with every band at its edge, frequency drifts.',
    todo: {text: 'If short, START a unit or discharge the battery; if long, STOP one, charge or export. The dispatch moves the base points ' +
      'itself (on a HAND day, RE-DISPATCH, N).', target: 'dial-battery'},   // (K-24: the AGC desk has no RE-DISPATCH)
    real: {text: 'AEMO: AGC setpoints up to every ' + V.AGC_CYCLE_S + ' s (well established); 5-minute dispatch since 1 Oct 2021 (likely). ' +
      'The alarm itself is GRIDWATCH\'s own rule.', facts: ['AGC and dispatch']},
    reading: o => 'AGC unmet ' + mw(o.agc.unmetMW) + ' MW · at its limit ' + Math.round(o.agc.atLimitS) + ' grid-s',
  },
  storageLow: {
    trigger: 'Sets with hydro under ' + pct(A.HYDRO_LOW) + '% of today\'s water or the battery under ' + pct(A.BATT_LOW) + '%; clears at ' +
      pct(A.HYDRO_OK) + '% and ' + pct(A.BATT_OK) + '%.',
    means: 'An energy store is nearly spent: do not count on it for the evening.',
    why: 'Hydro and the battery are fast, but only while their energy lasts; an empty battery catches no trip, whatever its GUARD.',
    todo: {text: 'Start a unit, so the dispatch need not spend the water before the peak (on a HAND day, turn the HYDRO wheel down); ' +
      'charge the battery on spill or at a price at or below zero.', target: null},
    real: {text: 'Real storages are seasonal; GRIDWATCH gives the hydro ' + mw(V.HYDRO_ALLOCATION_MWH) + ' MWh a day.',
      abstraction: 'Daily hydro allocation'},
    reading: o => 'HYDRO ' + pct(o.hydro.frac) + '% · BATTERY ' + pct(o.battery.socMWh / o.battery.capMWh) + '%',
  },
};
