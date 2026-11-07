# PITCH_NOTES.md — numbers and lines for the slides

All numbers below are what the deployed app computes for the demo night (Fri Nov 13, 2026; 300 simulated nights unless noted). They are deterministic; re-running gives the same values (the LLM's proposal list can vary slightly, the simulator's verdicts on the staple fixes don't).

## Headline (Rehearse card, 300 nights)
| Metric | Tonight as planned | With the plan |
|---|---|---|
| Avg Dasher wait | **16.3 min** | **2.4 min** |
| Cold orders | 7 | 2 |
| Dollars at risk | **$484** | **$146** (−70%) |
| Nights helped | — | **300 / 300** |
| Plan cost vs protected | — | costs **$114**, protects **$462** |

Normal weeknight for comparison: 1.5 min Dasher wait, $75 at risk.

Accepted fixes: **Call in Ana 6–9 PM** ($54 labor, protects $360, helped 120/120) and **Par-cook 30 wings at 6:45** ($60 waste, protects $160, helped 119/120).
Rejected (crossed out): Par-cook 45 wings at 7 (*costs more than it saves*: $148 waste vs $131 protected), Par-cook 30 tenders (*costs more than it saves*), Quote 25 min prep 7–8 PM (*no measurable effect*), Put Maria on the fryer (*makes the worst nights worse*: wait 15.7 → 20.3), Pause Uber Eats, Move Fryer, Par-cook salad.

Representative-night race (same customers, same luck): end of night Dasher wait 15.6 → 1.1 min, Dashers at door 0 vs 0, cold 10 → 0, at risk $451 → $25.

## Why (exact Shapley, 5 causes, 32 combinations × 60 nights)
Extra Dasher wait tonight vs a normal night: **14.7 min**, attributed:
- **Jake called out — 55%** (+8.0 min)
- **Pitt–FSU game crowd — 35%** (+5.1 min)
- Fog & snow chance — 5% (+0.7 min)
- Gym Class Heroes concert — 4% (+0.6 min)
- 4 smaller events — 2% (+0.3 min)

Bottleneck: **the fryer saturates 7:15–8:15 PM** (load 4.6× capacity); Dasher wait peaks at 28 min around 7:45 PM; 74 late orders on an average night.

## Ask / curveballs (each ~1–3 s, 300 nights, with tested recovery)
1. **"A 30-person catering order comes in at 6:30"** → Dasher wait 16.3 → 28.7 min, cold 7 → 19, at risk $484 → $1,039. Recovery: Par-cook 30 wings at 6:15 (wait → 18 min).
2. **"Sam calls out sick tonight"** (Cook calls out) → Dasher wait 16.3 → 56.9 min, at risk $484 → $966. Recovery: Call in Ana 6–9 PM (wait → 19.3 min, protects $1,075 for $54).
3. **"The fryer breaks at 7"** → Dasher wait 16.3 → 20.3 min, cold 7 → 23, at risk $484 → $723. Recovery: Call in Ana (wait → 10.0 min), Par-cook 30 wings at 6:30 (wait → 13.5 min, protects $262 for $53).
4. "It starts pouring at 6 PM" → 16.3 → 19.2 min, at risk $484 → $550.

## Real-world inputs (say they're real)
- Events from Ticketmaster Discovery (live, 3-mile radius): Pitt Panthers vs Florida State, Acrisure Stadium, 7:00 PM, 68,400 seats, 0.3 mi; Gym Class Heroes w/ Lupe Fiasco, Stage AE, 8:00 PM, 5,500, 0.1 mi; The Notebook, Benedum, 7:30 PM; 2 club shows.
- Weather from Open-Meteo: fog ~37°F, chance of light snow 8–11 PM. (Not rain. Rain is a what-if toggle.)
- Local happenings from OpenRouter web search (low confidence, ≤0.6): Pittsburgh Equality Gala, Northside Farmers Market.
- Demand effect: **+29% from 5:30–7:00 PM, shifted toward delivery (63% of orders vs 55% normally).**

## Architecture (5 bullets)
1. **Real-world intake → structured facts**: Ticketmaster + Open-Meteo + web search; the LLM only extracts fields and writes one-liners. A deterministic, documented formula (size × proximity × timing, capped 0.7–1.8×) turns facts into per-15-min, per-channel demand multipliers.
2. **Kitchen simulator** (pure TypeScript): menu routing across grill/fryer/cold/pack, walking workers on a 1 m grid, fire-to-quote, Dasher arrivals at the quoted time, hold limits → cold, dollars at risk. Deterministic seeds with **common random numbers**, so every comparison is apples-to-apples. 300 nights in ~1.5 s in a Web Worker pool.
3. **AI proposes, simulator proves**: Claude (via OpenRouter) returns interventions as strict JSON; each is screened on 120 nights (must pay for itself *and* help the worst 10% of nights), combined greedily, re-tested on 300. Rejections are shown with reasons. Rules-based proposer as fallback.
4. **Explainability by re-simulation**: exact Shapley values over up to 5 causes (2⁵ combinations), so the percentages add to 100%; "Ask anything" translates free text into a typed ScenarioPatch (zod-validated, shown as chips) and runs the experiment.
5. **Merchant outputs**: prep list, staff text, DoorDash quoted-prep-time schedule by window (maps to Merchant Portal → Adjust prep time), layout change, printable. Next.js 16 + react-three-fiber on Vercel; everything cached and demo-safe.

## One-liners
- "Forecasts predict numbers. We simulate consequences."
- "The AI proposes. The simulator proves. Every recommendation ships with evidence."
- "We didn't guess why it broke; we re-ran tonight 32 ways without each cause."
- "Ask it anything. It turns your question into an experiment and answers with numbers in two seconds."
