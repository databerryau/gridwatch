# GRIDWATCH baseline

Build: `classic.html` (git blob e99feb0a7d, 92011 bytes). Seeds 1-100. Command: `node tools/baseline.js`.

## 1. Policy outcomes (current build)

Weather class is fixed by the seed (heat 13, storm 38, calm 49). "In band" = 49.85-50.15 Hz. Black time = clock when the grid went black (real minutes at 1x in brackets).

| Policy | Grades, all | Heat | Storm | Calm | Median in-band % | Mean unserved MWh | Blackouts | Black time p10 / p50 / p90 | Final grade = grade at 21:00 |
|---|---|---|---|---|---|---|---|---|---|
| doNothing | F100 | F13 | F38 | F49 | 32.7 | 6,834 | 100 | 10:36 (3.3) / 13:30 (4.8) / 15:55 (6.0) | 100/100 (none alive at 21:00) |
| reactiveOnly | F100 | F13 | F38 | F49 | 80.1 | 3,019 | 100 | 13:31 (4.8) / 16:17 (6.1) / 17:05 (6.5) | 100/100 (none alive at 21:00) |
| competent | S48 A13 C4 D31 F4 | D12 F1 | S18 A5 C1 D12 F2 | S30 A8 C3 D7 F1 | 98.2 | 568 | 4 | 18:33 (7.3) / 18:36 (7.3) / 19:41 (7.8) | 86/100 (82/96 of runs alive at 21:00) |
| competentClassic | S54 A3 C10 D32 F1 | C1 D11 F1 | S18 A1 C5 D14 | S36 A2 C4 D7 | 97.8 | 592 | 1 | 18:36 (7.3) / 18:36 (7.3) / 18:36 (7.3) | 90/100 (89/99 of runs alive at 21:00) |

## 2. Optimistic supply bound (along the competentClassic run)

Bound = every unit not in protection lockout at heat-derated capacity (no start, ramp, min-gen or water limits) + IC 800 (0 while faulted) + battery 500 + diesel 300 + DR 350, all simultaneously and all day, + wind and solar available that minute. "Short" = bound < demand at one or more whole sim-minutes; on such a day no player could have avoided load shedding. Measured along the competentClassic run because unit trips, IC trips and weather noise in the current build depend on play (shared random stream); that policy keeps units below the 96% overheat threshold, so its outages are the scheduled ones. "15-min" uses the 15-minute rolling mean of the margin (the method used in the balance review). "No outages" counts every unit and the IC at full derated capacity all day.

| Weather | Days | Short at some minute | Share | Short on 15-min mean | Short even with no outages | Short minutes, median of short days | Worst 1-min margin MW p10 / p50 / p90 |
|---|---|---|---|---|---|---|---|
| heat | 13 | 11 | 85% | 10 | 10 | 79 | -797 / -364 / -16 |
| storm | 38 | 23 | 61% | 23 | 0 | 73 | -783 / -178 / 648 |
| calm | 49 | 13 | 27% | 11 | 0 | 71 | -462 / 168 / 767 |
| all | 100 | 47 | 47% | 44 | 10 | 75 | -782 / 25 / 721 |

## 3. Reference contingency: one Mt Hazel machine trips at 04:00 from balance, no player action

| Measure | p10 / median / p90 over seeds |
|---|---|
| Output lost at the trip (MW) | 500 / 500 / 500 |
| Inertia readout S.M before -> after trip | 3946 / 3946 / 3946 -> 3404 / 3404 / 3404 |
| Time from trip to leaving the 49.85-50.15 Hz band, real s | 1.6 / 1.8 / 2.3 (100/100 seeds exit) |
| First-swing nadir (min over first 15 real s), Hz | 49.810 / 49.828 / 49.848 |
| Time to that nadir, real s | 2.6 / 3.5 / 5.1 |
| Tripped station output regained in the first 5 real s by its own ramp (MW) | 120 / 120 / 120 |
| Back inside the band, real s after trip | 4.1 / 6.9 / 10.9 (95/100 seeds) |
| UFLS reached within 60 s | 7/100 seeds |

## 4. Determinism

- Re-running seeds 1-3 under every policy gives byte-identical results: **yes**.

## 5. Sim cost on this machine (machine-dependent)

- `tick()` alone (render stubbed), median of 20 seeds: 1.4 us per tick (p90 1.7).
- Whole 24 h shift (7,200 ticks) with the competent policy: median 48 ms.
- Node v24.18.0.
