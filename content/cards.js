// content/cards.js: D-24's "This really happened" cards, at most one per verdict, chosen by trigger
// (app/verdict.js historyCard). Each was fact-checked against its source on 2026-10-16 (SPEC §5 W3):
// Loy Yang A3's loss is "nearly 550 MW" (the spec's ~7 MW battery figure is not in the source: "less
// than one sixtieth"); Callide C's 2,300 MW came from nine units; the 14 Mar 2021 source is AEMO's
// report, not SA Power Networks' page (which never names the date); the SA black system's URL added.

export const CARDS = Object.freeze([
  Object.freeze({id: 'black', trigger: 'the grid went black',
    text: 'On 28 Sep 2016, storms cut lines and wind farms dropped out, overloading the link to Victoria until it tripped. SA\'s frequency fell about 6 Hz a second, too fast for load shedding. The state went black.',
    simplifies: 'No tornadoes, wind-farm protection settings or interconnector: your city\'s collapse comes from one simple frequency model.',
    source: 'https://www.aemo.com.au/-/media/Files/Electricity/NEM/Market_Notices_and_Events/Power_System_Incident_Reports/2017/Integrated-Final-Report-SA-Black-System-28-September-2016.pdf',
    sourceName: 'AEMO'}),
  Object.freeze({id: 'ufls', trigger: 'the relays shed load',
    text: 'On 25 May 2021 a Callide C fault set off trips that took out about 2,300 MW in Queensland. Frequency fell to 48.53 Hz, and automatic relays shed 1,308 MW of load.',
    simplifies: 'One city and a few relay stages. Queensland also split from NSW that day, and low voltage tripped more load.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2021/trip-of-multiple-generators-and-lines-in-qld-and-associated-under-frequency-load-shedding.pdf',
    sourceName: 'AEMO'}),
  Object.freeze({id: 'battery', trigger: 'the battery caught a trip',
    text: 'Early on 14 Dec 2017, Victoria\'s Loy Yang A3 tripped, losing about 550 MW. SA\'s big battery jumped in fast, but with under a sixtieth of that. Old coal units did most of the work.',
    simplifies: 'Your battery is a toy. Real reserves come through FCAS markets from many plants across several states.',
    source: 'https://wattclarity.com/articles/2018/03/fcas-in-action-what-happens-when-a-generator-trips/',
    sourceName: 'WattClarity'}),
  Object.freeze({id: 'backstop', trigger: 'wind and solar were held back',
    text: 'On 14 March 2021, with SA demand below 370 MW, AEMO for the first time ordered a minimum-demand hold. SA Power Networks switched off about 71 MW of rooftop solar.',
    simplifies: 'Spill is one number here. In reality it took three tools (installer switch-off, network remote control, raised voltage) over about an hour.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2021/maintaining-operational-demand-in-south-australia.pdf',
    sourceName: 'AEMO'}),
  Object.freeze({id: 'negative', trigger: 'the price went below zero',
    text: 'In late 2025 (October to December), South Australia\'s wholesale price was below zero in 48.4% of five-minute intervals, the highest of any region.',
    simplifies: 'One price for one city. The real NEM sets a price for each region every five minutes from generators\' bids.',
    source: 'https://www.aemo.com.au/-/media/files/major-publications/qed/2025/qed-q4-2025.pdf',
    sourceName: 'AEMO'}),
]);
