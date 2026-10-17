// content/selftest.js: W6 (risk 5): the golden values next.html?selftest (app/selftest.js) checks a browser against,
// measured in Node with the page's own runner. par: par's day to its end (the hash each grid hour from 05:00 and at its end,
// and its ALL-IN, which is content/ladder.js's stored par); nothing: the page's no-input day to 14:00 (the ladder's check);
// replay: a scripted player's input log (sim/autopilot.js fuzz) and the hash at its checkpoint. Hashes: hashState, unsigned.
// Written by tools/selftest-gen.mjs; do not edit. The stamp is app/game.js dailyStamp's.
export const SELFTEST = {v: "v4-core-2d.0|2010181300|1748646610", cases: [
  {"kind":"par","ymd":20261016,"seed":20261016,"scenarioId":"desk","tick":4320000,"hash":380032788,"hashes":[2008432228,3019353399,3518870743,1817669409,2657119972,3131742596,320981331,970402686,686635374,3431451655,3021418085,2809047211,3025615928,3998629370,418891290,3985765566,3451111934,1571437283,2573872805,996525422,666302132,2789292716,355351361,380032788],"total":14749198},
  {"kind":"par","ymd":20261031,"seed":20261031,"scenarioId":"desk-weekend","tick":4320000,"hash":3231380098,"hashes":[4240715930,1563267908,3718680551,2843599652,3285011819,153003496,3657291538,2296688305,812397959,3719296840,255191056,409303261,632758505,1180975156,3527542927,408276705,2283366548,3763423936,3929171199,2287980978,2835012406,240165016,1511784532,3231380098],"total":7780161},
  {"kind":"nothing","ymd":20261012,"seed":20261012,"scenarioId":"desk","tick":1800000,"hash":928618830,"hashes":[2608965019,1227276718,3465057760,1633129491,3585246831,4063430903,700155054,328750502,1453132185,928618830]},
  {"kind":"replay","ymd":20261016,"seed":20261016,"scenarioId":"desk","tick":720000,"hash":2384811583,"hashes":[],"log":[
    {"tick":90001,"type":"guard","args":{"mw":150}},
    {"tick":114001,"type":"planStop","args":{"unit":"coal1","atS":3757}},
    {"tick":387001,"type":"basePoint","args":{"station":"coal","mw":1950}},
    {"tick":438001,"type":"abortStop","args":{"unit":"coal1"}},
    {"tick":564001,"type":"battery","args":{"mode":"discharge","mw":327}},
    {"tick":582001,"type":"tie","args":{"mw":-167}},
    {"tick":630001,"type":"directShed","args":{}}]},
  {"kind":"replay","ymd":20261025,"seed":20261025,"scenarioId":"desk-weekend","tick":1125000,"hash":1041480504,"hashes":[],"log":[
    {"tick":126001,"type":"guard","args":{"mw":200}},
    {"tick":240001,"type":"armRERT","args":{}},
    {"tick":255001,"type":"battery","args":{"mode":"discharge","mw":444}},
    {"tick":291001,"type":"guard","args":{"mw":500}},
    {"tick":318001,"type":"curtail","args":{"kind":"wind","limitPct":92}},
    {"tick":360001,"type":"planStop","args":{"unit":"hydro1","atS":8113}},
    {"tick":414001,"type":"planStop","args":{"unit":"coal1","atS":11611}},
    {"tick":483001,"type":"tie","args":{"mw":-740}},
    {"tick":504001,"type":"guard","args":{"mw":450}},
    {"tick":786001,"type":"guard","args":{"mw":450}},
    {"tick":864001,"type":"stop","args":{"unit":"ccgt1"}},
    {"tick":873001,"type":"curtail","args":{"kind":"wind","limitPct":67}},
    {"tick":879001,"type":"planStart","args":{"unit":"gtc2","atS":19340}},
    {"tick":1011001,"type":"battery","args":{"mode":"charge","mw":182}},
    {"tick":1038001,"type":"tie","args":{"mw":-423}}]},
]};
