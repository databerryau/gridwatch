// content/closing.js: Y-7, the share card's closing lines (W6), in Marg's voice: dry, never blaming, short. Keyed by
// app/share.js bucketOf: 'black', or lights (on: no more dark than par's; dark) . cost (under: supply no dearer than par's;
// over) . band (the day's lowest Hz: calm in the normal band, wobble inside containment, deep above the first relay stage,
// relays below it). The pick is seeded by (date, bucket) (app/share.js closingLine), so friends with the same result get
// the same line. Every line passes the share card's lint (tests/share.test.js): no event words, no times of day.

export const CLOSING = Object.freeze({
  'on.under.calm': ['Nobody noticed. That\'s the job.', 'Quiet desk. Cheap power. Go home.', 'The best shifts make no news.'],
  'on.under.wobble': ['A wobble, caught. The city never knew.', 'Bent the needle, kept the lights.', 'Felt it in the chair. Nobody else did.'],
  'on.under.deep': ['That one went deep. The lights held.', 'Frequency took a fright. You didn\'t.', 'Deep dip, every light on. Good hands.'],
  'on.under.relays': ['A hard day, played harder than par.', 'Rough for everyone. Rougher for par.', 'Nobody kept it all on. You came closest.'],
  'on.over.calm': ['All lit. The accountants will call.', 'Safe and steady. And a bit dear.', 'Belt, braces and a big fuel bill.'],
  'on.over.wobble': ['Lights on, needle bent, wallet lighter.', 'Paid for comfort. Got most of it.', 'Dear, and still not quite calm.'],
  'on.over.deep': ['Spent big and still went deep.', 'Money doesn\'t buy inertia. Clearly.', 'Expensive lights. A scary dip.'],
  'on.over.relays': ['A hard day, bought at full price.', 'No darker than par. Dearer, though.', 'Par had it worse. You paid for it.'],
  'dark.under.calm': ['Saved a dollar. Lost a suburb.', 'Great bill. Ask the dark streets.', 'Cheap. Calm. Somebody\'s fridge is warm.'],
  'dark.under.wobble': ['Lean is good until it isn\'t.', 'Cheap power, dark houses. Pick one.', 'Some streets sat dark for that saving.'],
  'dark.under.deep': ['Ran it lean. The city felt it.', 'Thin margins, deep dip, dark streets.', 'Cheap power. Expensive candles.'],
  'dark.under.relays': ['The automatics did your job for you.', 'Saved on fuel. Spent it on candles.', 'Below 49. The protection had opinions.'],
  'dark.over.calm': ['Paid more, and still left streets dark.', 'Dear and dark. There\'s always tomorrow.', 'Calm needle, dark streets, big bill.'],
  'dark.over.wobble': ['Spent the money in the wrong place.', 'Dear, dark and a little wobbly.', 'The plan was late. The bill wasn\'t.'],
  'dark.over.deep': ['Dear, dark, deep. A full set.', 'Late everywhere except the invoice.', 'Bought the right megawatts, too late.'],
  'dark.over.relays': ['Everything that could go wrong, did.', 'The protection earned its pay today.', 'Read the moment. Then read it again.'],
  'black': ['The whole board, dark. Read the moment.', 'Lights out. Every one of them.', 'Black. Put the kettle on. Oh, wait.'],
});
