## Demo night

**Chosen date: Friday, November 13, 2026** (restaurant: "Maria's Burgers & Wings", North Shore, 40.4468 / -80.0100).

**Why.** Ticketmaster Discovery (3-mile radius, 2026-11-07 through 2026-11-18) shows **no Steelers home game** in the window, so the Acrisure-Stadium-adjacent scenario comes from college football instead:

- **Pitt Panthers vs. Florida State** — Acrisure Stadium, kickoff **7:00 PM**. 68,400-seat stadium about 0.3 mi from the restaurant. The 4–7 PM pre-game arrival / tailgate window overlaps the dinner rush exactly, and the post-game exodus hits around 10:15 PM.
- **Gym Class Heroes w/ Lupe Fiasco** — Stage AE (5,500, next door on the North Shore), 8:00 PM.
- **The Notebook (touring)** — Benedum Center (2,800, downtown across the bridge), 7:30 PM; plus two small club shows (Club Cafe).
- Web search (OpenRouter web plugin) also surfaced smaller North Side happenings that evening at low confidence (≤0.6): the Pittsburgh Equality Gala at the Kamin Science Center (6–11 PM, ~1 mi) and the Northside Farmers Market (3–6 PM). See `src/data/cache/tonight-2026-11-13.json`.

**Real weather (Open-Meteo forecast fetched 2026-11-07):** cold and foggy through kickoff (~37–39°F, fog codes 45), with a chance of light snow 8–11 PM (0.01 in/hr, 23% probability). **No measurable rain** — `rainEvening = false`. If the demo story needs rain, label it as a "what-if" overlay; the real forecast is dry-to-flurries.

**Runner-up: Saturday, November 14, 2026** — Penguins vs. Senators, 7:00 PM at PPG Paints Arena (18,387, ~1.5 mi), plus Pittsburgh Symphony at Heinz Hall, The Notebook at the Benedum, and Pouya at the Roxian. Forecast: cloudy, ~40°F, dry. Cached as `ALT_DATE` so the demo can flip with a one-line change.

**Calm comparison night: Tuesday, November 10, 2026** — only The Notebook at the Benedum (2,800). Forecast: clear, ~57°F. Cached as `CALM_DATE`.

Other candidates considered: Thu 11/12 (Sombr at PPG Paints Arena + Jack White at the Wylie), Sat 11/7 (Jim Gaffigan at PPG Paints + Sting at the Wylie + Bingo Loco at Stage AE), Sun 11/15 (RUSH at PPG Paints Arena + Rock Orchestra at the Pete). Full candidate list: `src/data/demo-night.json`.
