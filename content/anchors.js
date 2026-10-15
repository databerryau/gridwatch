// content/anchors.js: the "?" badges' index, eager (Q-44): {game: the element id, rows: its
// entries' row titles}, in content/text.js order, which loads on demand.
// Contract: desk/README.md §32.12 content/anchors.js.

export const ANCHORS = Object.freeze([
  {game: 'rate-badge', rows: ['Compressed playback.', 'The clock holds at each hand-back.']},
  {game: 'tray', rows: ['Event-dense day.', 'MSL3 = 1,000 MW, with MSL2 and MSL1 300 and 600 MW above it', 'Warning leads are game-sized.']},
  {game: 'bay-sync', rows: ['Compressed synchroscope.', 'Auto-sync takes 4 grid-minutes', 'An offered SYNC runs at 30×.']},
  {game: 'stack', rows: ['Pre-dispatch is computed once, at 04:30', 'Cost-based offers; scarcity adder.',
    'A mild day is the hot day with its cooling load removed.', 'The dispatch spills wind and solar automatically, pro rata.']},
  {game: 'btn-redispatch', rows: ['Par re-plans after every action.', 'RE-DISPATCH re-runs the pre-dispatch on demand.']},
  {game: 'annunciator', rows: ['Frequency alarms escalate by severity.', 'UFLS: 8 × 6% blocks from 49.0 Hz in 0.125 Hz steps.']},
  {game: 'bay-restore', rows: ['Act I restore task', 'Restore permissive', 'Cold-load pickup ×1.5.']},
  {game: 'lever-coal', rows: ['The player commits units and sets output.', 'Minimum down time runs from breaker open to the next START.',
    'Coal ramps at 3 MW/min per machine']},
  {game: 'key-agc', rows: ['AGC band around each lever.']},
  {game: 'knob-tie', rows: ['DC tie.']},
  {game: 'dial-freq', rows: ['Mainland interconnected standard.', 'Collapse after 20 s at 47.5–48.0 Hz.',
    'Wind, utility solar and rooftop solar respond to over-frequency only.']},
  {game: 'map', rows: ['One-node network.', 'Rooftop solar: one curve, six skies.', 'Region scale.']},
  {game: 'chip-cost', rows: ['CUSTOMER COST is the resource cost of serving']},
  {game: 'chip-co2', rows: ['CARBON counts the region\'s own generation.']},
  {game: 'gauge-n1', rows: ['LOR states via 1.25 × L.', 'COVER after a trip is R5 ≥ L, not the NEM\'s secure state.']},
  {game: 'key-shed', rows: ['Automatic directed shedding when the FOS timers run out.']},
  {game: 'ring-guard', rows: ['The GUARD is contingency FCAS, set by hand.']},
  {game: 'btn-dr', rows: ['City levers\' MW, costs and patience.']},
  {game: 'btn-mute', rows: ['Hum reference tone']},
  {game: 'wheel-hydro', rows: ['Daily hydro allocation', 'Hydro spins free.']},
  {game: 'clock', rows: ['Every daily is a late-summer day, until Y-9 ships']},
  {game: 'chip-allin', rows: ['The score divides par\'s ALL-IN by yours']}, // Q-48
  {game: 'night-strip', rows: ['The night shift runs 21:00–04:00.']}, // 2c (desk/README.md §32.2)
  {game: 'chip-hand', rows: ['HAND turns AGC off until 21:00.']},
  {game: 'briefing-watch', rows: ['Act I\'s constraints are announced at 04:00.', 'Every gate-checked daily is solvable.']},
].map(a => Object.freeze({game: a.game, rows: Object.freeze(a.rows)})));
