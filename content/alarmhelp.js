// content/alarmhelp.js: the alarm panel's explainers (SPEC §9.1 Q-46, desk/README.md §30.6), one
// per annunciator tile (app/alarms.js TILES), loaded on demand with app/alarmpanel.js (Q-44):
//   ALARM_HELP[tileId] = {means, why, todo: {text, target}, real: {text, facts: ['<§8.1 Fact title>', …]}
//     | {text, abstraction: '<§8.2 bold title>'} | {own: text}, reading(obs, tile) -> string}
// Numbers come from sim/params.js and app/alarms.js constants, never typed in.
//
// STAGE A STUB (base): empty. W3 (panel) fills it.

export const ALARM_HELP = {};
