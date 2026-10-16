// content/closing.js: Y-7, the share card's closing lines (W6), in Marg's voice: dry, never blaming, short. Keyed by
// app/share.js bucketOf: 'black'; 'solo.on' / 'solo.dark' when par could not finish (nothing to compare); 'held' when
// streets of yours went dark but no more than par's (a Hard day); else lights (on: every light on; dark: darker than
// par) . cost (under: supply no dearer than par's; over) . band (the day's lowest Hz: calm in the normal band, wobble
// inside containment, deep above the first relay stage, relays below it). A line states the outcome, never its cause:
// the same bucket holds a late restore, a directed shed and the relays, a saving and a draw. The pick is seeded by
// (date, bucket) (app/share.js closingLine), so friends with the same result get the same line. Every line passes the
// share card's lint (tests/share.test.js): no event words, no times of day.

export const CLOSING = Object.freeze({
  'on.under.calm': ['Nobody noticed. That\'s the job.', 'Quiet desk. Cheap power. Go home.', 'The best shifts make no news.'],
  'on.under.wobble': ['A wobble, caught. The city never knew.', 'Bent the needle, kept the lights.', 'Felt it in the chair. Nobody else did.'],
  'on.under.deep': ['That one went deep. The lights held.', 'Frequency took a fright. You didn\'t.', 'Deep dip, every light on. Good hands.'],
  'on.under.relays': ['Under 49 for a blink. Every light held.', 'Brushed 49 and kept every light.', 'Too close. Every light on, somehow.'],
  'on.over.calm': ['All lit. The accountants will call.', 'Safe and steady. And a bit dear.', 'Belt, braces and a big fuel bill.'],
  'on.over.wobble': ['Lights on, needle bent, wallet lighter.', 'Paid for comfort. Got most of it.', 'Dear, and still not quite calm.'],
  'on.over.deep': ['Spent big and still went deep.', 'Money doesn\'t buy inertia. Clearly.', 'Expensive lights. A scary dip.'],
  'on.over.relays': ['Brushed 49. Paid to keep it lit.', 'Dear, deep, and every light still on.', 'Every light on. A close shave, dearly.'],
  'dark.under.calm': ['Calm needle. A few dark kitchens.', 'Good bill. Some streets went without.', 'Steady all day. Not everywhere lit.'],
  'dark.under.wobble': ['A wobble and a few dark windows.', 'Some streets went dark. The bill held.', 'Good bill. A few porch lights out.'],
  'dark.under.deep': ['Deep dip. Some streets felt it.', 'The needle dived. A few suburbs noticed.', 'Down deep. Some lights went with it.'],
  'dark.under.relays': ['Below 49. The protection had opinions.', 'Under 49 Hz. Some suburbs paid.', 'The city felt that one.'],
  'dark.over.calm': ['Dearer than par, and some streets dark.', 'Dear and dark. There\'s always tomorrow.', 'Calm needle, dark streets, big bill.'],
  'dark.over.wobble': ['Dear, dark and a little wobbly.', 'A dear day with dark corners.', 'Big bill. Some streets still waited.'],
  'dark.over.deep': ['Dear, dark, deep. A full set.', 'Deep dip, dark streets, dear day.', 'The bill and the dip both went deep.'],
  'dark.over.relays': ['Everything that could go wrong, did.', 'The protection earned its pay today.', 'Read the moment. Then read it again.'],
  'held': ['Some streets went dark. Fewer than par.', 'A hard day. You lost less than par.', 'Dark in places. Par had it worse.'],
  'solo.on': ['Par couldn\'t finish. You kept it lit.', 'Every light on, and nothing to compare.'],
  'solo.dark': ['Par couldn\'t finish either. Some dark.', 'A day nobody gets clean. Some dark.'],
  'black': ['The whole board, dark. Read the moment.', 'Lights out. Every one of them.', 'Black. Put the kettle on. Oh, wait.'],
});
export const BUILD = '2026-10-16';   // W6 (F-9): app/build.js's, copied; app/boot.js compares
