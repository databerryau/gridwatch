# GRIDWATCH baseline

Build: `index.html` (git blob c45dda6ef5, 88590 bytes). Seeds 1-100. Command: `node tools/baseline.js`.

## 1. Policy outcomes (current build)

Weather class is fixed by the seed (heat 53, storm 24, calm 23). "In band" = 49.85-50.15 Hz. Black time = clock when the grid went black (real minutes at 1x in brackets).

| Policy | Grades, all | Heat | Storm | Calm | Median in-band % | Mean unserved MWh | Blackouts | Black time p10 / p50 / p90 | Final grade = grade at 21:00 |
|---|---|---|---|---|---|---|---|---|---|
| doNothing | F100 | F53 | F24 | F23 | 32.0 | 6,563 | 100 | 10:33 (3.3) / 13:21 (4.7) / 15:50 (5.9) | 100/100 (none alive at 21:00) |
| reactiveOnly | F100 | F53 | F24 | F23 | 79.5 | 2,736 | 100 | 13:10 (4.6) / 15:08 (5.6) / 17:00 (6.5) | 100/100 (none alive at 21:00) |
| competent | S30 A7 B1 C7 D48 F7 | S2 A1 C5 D39 F6 | S12 A4 B1 C2 D5 | S16 A2 D4 F1 | 95.1 | 1,061 | 7 | 18:39 (7.3) / 19:25 (7.7) / 19:51 (7.9) | 95/100 (88/93 of runs alive at 21:00) |
| competentClassic | S29 A3 B1 C6 D55 F6 | C1 D47 F5 | S11 A3 B1 C5 D4 | S18 D4 F1 | 94.4 | 1,179 | 6 | 18:39 (7.3) / 19:32 (7.8) / 20:02 (8.0) | 97/100 (92/95 of runs alive at 21:00) |

## 2. Optimistic supply bound (along the competentClassic run)

Bound = every unit not in protection lockout at heat-derated capacity (no start, ramp, min-gen or water limits) + IC 800 (0 while faulted) + battery 500 + diesel 300 + DR 350, all simultaneously and all day, + wind and solar available that minute. "Short" = bound < demand at one or more whole sim-minutes; on such a day no player could have avoided load shedding. Measured along the competentClassic run because unit trips, IC trips and weather noise in the current build depend on play (shared random stream); that policy keeps units below the 96% overheat threshold, so its outages are the scheduled ones. "15-min" uses the 15-minute rolling mean of the margin (the method used in the balance review). "No outages" counts every unit and the IC at full derated capacity all day.

| Weather | Days | Short at some minute | Share | Short on 15-min mean | Short even with no outages | Short minutes, median of short days | Worst 1-min margin MW p10 / p50 / p90 |
|---|---|---|---|---|---|---|---|
| heat | 53 | 49 | 92% | 46 | 42 | 81 | -1143 / -377 / -53 |
| storm | 24 | 17 | 71% | 16 | 0 | 68 | -363 / -169 / 506 |
| calm | 23 | 6 | 26% | 5 | 0 | 77 | -713 / 168 / 721 |
| all | 100 | 72 | 72% | 67 | 42 | 76 | -934 / -185 / 447 |

## 3. Reference contingency: one Mt Hazel machine trips at 04:00 from balance, no player action

| Measure | p10 / median / p90 over seeds |
|---|---|
| Output lost at the trip (MW) | 500 / 500 / 500 |
| Inertia readout S.M before -> after trip | 3946 / 3946 / 3946 -> 3946 / 3946 / 3946 |
| Time from trip to leaving the 49.85-50.15 Hz band, real s | 1.8 / 2.1 / 3.2 (100/100 seeds exit) |
| First-swing nadir (min over first 15 real s), Hz | 49.810 / 49.829 / 49.847 |
| Time to that nadir, real s | 3.0 / 3.9 / 6.2 |
| Tripped station output regained in the first 5 real s by its own ramp (MW) | 120 / 120 / 120 |
| Back inside the band, real s after trip | 4.1 / 7.9 / 11.5 (94/100 seeds) |
| UFLS reached within 60 s | 0/100 seeds |

## 4. Determinism

- Re-running seeds 1-3 under every policy gives byte-identical results: **yes**.

## 5. Sim cost on this machine (machine-dependent)

- `tick()` alone (render stubbed), median of 20 seeds: 1.1 us per tick (p90 1.2).
- Whole 24 h shift (7,200 ticks) with the competent policy: median 49 ms.
- Node v24.18.0.
