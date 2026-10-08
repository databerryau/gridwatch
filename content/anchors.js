// content/anchors.js: the "?" badges' index, eager (Q-44): {game: the element id, rows: its
// entries' row titles}, in content/text.js order, which loads on demand. tests/anchors.test.js
// keeps the two equal: an anchored entry added to content/text.js is appended here too.

export const ANCHORS = Object.freeze([
  {game: 'rate-badge', rows: ['Compressed playback.']},
  {game: 'tray', rows: ['Event-dense day.', 'MSL3 = 1,000 MW, with MSL2 and MSL1 300 and 600 MW above it']},
  {game: 'bay-sync', rows: ['Compressed synchroscope.', 'Auto-sync takes 4 grid-minutes']},
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
  {game: 'gauge-n1', rows: ['LOR states via 1.25 × L.']},
  {game: 'key-shed', rows: ['Automatic directed shedding when the FOS timers run out.']},
  {game: 'btn-dr', rows: ['City levers\' MW, costs and patience.']},
  {game: 'btn-mute', rows: ['Hum reference tone']},
  {game: 'wheel-hydro', rows: ['Daily hydro allocation', 'Hydro spins free.']},
  {game: 'clock', rows: ['Every daily is a late-summer day, until Y-9 ships']},
  {game: 'chip-allin', rows: ['The score divides par\'s ALL-IN by yours']}, // Q-48
].map(a => Object.freeze({game: a.game, rows: Object.freeze(a.rows)})));
