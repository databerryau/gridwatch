// content/cards.js: D-24's "This really happened" cards, at most one per verdict, chosen by trigger
// (app/verdict.js historyCard), the first that fired in this order: the rarest and most dramatic first, the day's own
// (a shed, the tie, the diesel, the heat, the drought) before the battery's, which fires on nearly every trip. Each
// was fact-checked against its source on 2026-10-16 (SPEC §5 W3):
// Loy Yang A3's loss is "nearly 550 MW" (the spec's ~7 MW battery figure is not in the source: "less
// than one sixtieth"); Callide C's 2,300 MW came from nine units; the 14 Mar 2021 source is AEMO's
// report, not SA Power Networks' page (which never names the date); the SA black system's URL added.
// W6 (D-24, 2026-10-17): five more, each read in its source the same day. 8 Feb 2017 is AEMO's preliminary report (the
// shed was directed to bring Murraylink back within its limit; times there are market time, so the card gives none);
// 12 Nov 2022 is AEMO's final report (a tower's footing failed under storm warnings; the split shed no load, but the
// report's p. 41 has the week's storm outages reaching 163,000 customers, so the card claims the split's, not the
// week's); 27 Nov 2024 is AEMO's RERT Q4 2024 report (as the help's rert-terms); 24 Jan 2019's 47.7 °C is Adelaide
// (Kent Town), its record by 2 °C, and Victoria's 41 °C the report's Table 1; 13 Jun 2024's 88 MW at 13:20 is
// WattClarity's, "no curtailment of wind".

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
  Object.freeze({id: 'directed', trigger: 'the city desk shed load',
    text: 'On 8 Feb 2017, in a heatwave, South Australia\'s demand came in above forecast and its wind below. AEMO directed 100 MW of load shed and cleared its return 27 minutes later; the local network cut about 300 MW.',
    simplifies: 'Here the city desk sheds a district at a time when frequency stays low, on GRIDWATCH\'s own timers. In 2017 the shed eased an overloaded interconnector.',
    source: 'https://www.aemo.com.au/-/media/Files/Electricity/NEM/Market_Notices_and_Events/Power_System_Incident_Reports/2017/System-Event-Report-South-Australia-8-February-2017.pdf',
    sourceName: 'AEMO'}),
  Object.freeze({id: 'islanded', trigger: 'the tie line tripped',
    text: 'On 12 Nov 2022, under severe thunderstorm warnings, a tower carrying both 275 kV lines from South East to Tailem Bend failed. Most of South Australia ran as an island until 19 Nov; the split itself shed no load.',
    simplifies: 'Your city is always its own frequency island, and its tie returns within hours. SA ran alone for a week, on FCAS bought inside the island.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/market_notices_and_events/power_system_incident_reports/2022/trip-of-south-east-tailem-bend-275-kv-lines-november-2022.pdf',
    sourceName: 'AEMO'}),
  Object.freeze({id: 'rert', trigger: 'the reserve diesel was called',
    text: 'On 27 Nov 2024, heat pushed NSW demand up until its spare fell below its largest risk. AEMO readied 184 MW of emergency reserve and ran 65 MWh of it: $56,359 a MWh, all in.',
    simplifies: 'Your diesel is paid only for what it runs. Real RERT is many contracts, with their own lead times, minimum runs and fees to get ready.',
    source: 'https://www.aemo.com.au/-/media/files/electricity/nem/emergency_management/rert/2025/rert-quarterly-report-q4-2024-ver-1.pdf',
    sourceName: 'AEMO'}),
  Object.freeze({id: 'heat', trigger: 'a heatwave set in',
    text: 'On 24 Jan 2019, Adelaide (Kent Town) reached 47.7 °C, beating its record by 2 °C. Demand ran high in South Australia and Victoria, and up to 1,100 MW of their thermal plant was unavailable.',
    simplifies: 'Your heatwave takes the same share off every coal and gas machine. In 2019 units dropped out one at a time: breakdowns, overdue maintenance, heat.',
    source: 'https://www.aemo.com.au/-/media/Files/Electricity/NEM/Market_Notices_and_Events/Power_System_Incident_Reports/2019/Load-Shedding-in-VIC-on-24-and-25-January-2019.pdf',
    sourceName: 'AEMO'}),
  Object.freeze({id: 'drought', trigger: 'the wind dropped away',
    text: 'At 13:20 on 13 Jun 2024, all the NEM\'s wind farms together made 88 MW, 0.77% of their capacity. None were held back: the wind had dropped away across the NEM.',
    simplifies: 'Your drought eases one region\'s wind to a low for the evening. That June day the lull covered the whole NEM at once.',
    source: 'https://wattclarity.com.au/articles/2024/06/13june-lowwind/',
    sourceName: 'WattClarity'}),
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
