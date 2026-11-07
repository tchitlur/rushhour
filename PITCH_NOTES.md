# PITCH_NOTES.md — numbers and lines for the slides

## Primanti Bros. demo (Nov 13)
Preset `primanti` ("Primanti Bros. — Strip District", `/app?r=primanti`, also `D` / `/?demo=1`). **Demo uses estimated menu, staffing and volumes, not Primanti Bros. data** (shown on the card and in `restaurant.disclaimer`).
Real intake for Fri Nov 13 (Pitt–FSU at Acrisure 7 PM, Gym Class Heroes at Stage AE 8 PM, fog/snow chance) applied to the Primanti kitchen; **Chris, the fry cook (6–10 PM, fryer skill 1.25), calls out** (`restaurant.demoAbsent = "chris"`). Fries go on every sandwich, so every sandwich crosses the fryer (5 baskets) before the flat-top.
Line at the 7 PM peak: Mike, Sarah, Chris (normal) → Mike, Sarah (tonight). Dave is on call. Plan = call in Dave 6–9 PM + par-cook 60 fries at 7.

| Metric (300 nights, seeds 1000+) | Normal night | Tonight as planned | With the plan |
|---|---|---|---|
| Avg Dasher wait | 2.2 min | **12.5 min** | **3.4 min** |
| Cold orders | 0.4 | 5.2 | 1.0 |
| Late orders | 7 | 63 | 23 |
| Dollars at risk | $74 | **$401** | **$162** (−60%) |
| Dashers who gave up | 0 | ~30 | ~4 |
| Worst 10% nights, $ at risk | $185 | $681 | $365 |

Bottleneck: **the fryer saturates 7:15–8:15 PM** (load 4.5× capacity) on the as-planned night; with the plan it stays near 1.4× around 6:30–7:30. Calling in Dave alone: 3.8 min / $188. Par-cooking fries alone: 10.9 min / $343 (fries help cold orders, not the wait).
Calibration script: `scratchpad/calib.ts` (vitest; `PRESETS.find(p => p.id === "primanti").build()` → `buildTonightScenario(nov13, { absentWorker: "chris" })` → `runMonteCarlo`). Tuned: baseline orders = Maria's curve × 0.9 (~92 orders/night), fryer 5 baskets, sandwiches 6 min per stage, Jess leaves at 6, Dave on call.

## Maria's Burgers & Wings (regular example, `/app?r=maria`)
All numbers below are what the deployed app computes for Maria's demo night (Fri Nov 13, 2026; 300 simulated nights unless noted). They are deterministic. The LLM's proposal list can vary a little between runs; the simulator's verdicts on the staple fixes don't.

### Headline (Rehearse card, 300 nights)
| Metric | Tonight as planned | With the plan |
|---|---|---|
| Avg Dasher wait | **12.8 min** | **2.6 min** |
| Cold orders | 9 | 3 |
| Late orders | 74 | ~18 |
| Dollars at risk | **$505** | **$186** (−63%) |
| Nights helped | — | **300 / 300** |
| Plan cost vs protected | — | costs **$68**, protects **$445** |
| Dashers who gave up (unassigned after 12 min) | ~38 | ~0 |

Normal weeknight for comparison: 1.5 min Dasher wait, 1 cold order, $77 at risk.

**Accepted fixes:** Call in Ana 6–9 PM ($54 labor, protects $368, helped 119/120 nights) and Par-cook 60 fries at 7 ($14 waste, protects $135, helped 119/120).
**Rejected (crossed out):** Par-cook 45 wings at 7 (*costs more than it saves*: $148 waste vs $146 protected), Quote 25 min prep 7–8:30 (*no measurable effect*), Put Maria on the fryer (*makes the worst nights worse*, wait 12.3 → 13.2), Pause Uber Eats, Move Pack, Par-cook salad/tenders.

Representative-night race (same customers, same luck): end of night Dasher wait ~15 → ~1 min, cold ~10 → 0, at risk ~$450 → ~$25.

## Why (exact Shapley, 5 causes, 32 combinations × 60 nights)
Extra Dasher wait tonight vs a normal night: **11.2 min**, attributed:
- **Jake called out — 55%** (+6.1 min)
- **Pitt–FSU game crowd — 35%** (+3.9 min)
- Fog & snow chance — 5% (+0.5 min)
- Gym Class Heroes concert — 4% (+0.4 min)
- 4 smaller events — 2% (+0.2 min)

Switch the metric to dollars at risk and the split is Jake 47% / game crowd 42% / weather 5% / concert 4% / other 2% (total +$440).

Bottleneck: **the fryer saturates 7:15–8:15 PM** (load 4.6× capacity); Dasher wait peaks at ~22 min around 7:45 PM; 74 late orders on an average night.

## Ask / curveballs (each ~1.5–3 s, 300 nights, with a tested recovery plan)
1. **"A 30-person catering order comes in at 6:30"** → Dasher wait 12.8 → ~29 min, cold 9 → ~19, at risk $505 → ~$1,040. Recovery: Par-cook 30 wings at 6:15.
2. **"Sam calls out sick tonight"** (Cook calls out) → Dasher wait 12.8 → 51 min, at risk $505 → $974. Recovery: Call in Ana 6–9 PM (wait → 15 min, protects $1,063 for $54).
3. **"The fryer breaks at 7"** → Dasher wait 12.8 → 16.7 min, cold 9 → 25, at risk $505 → $742. Recovery: Call in Ana (wait → 8.2 min), Par-cook 30 wings at 6:30 (protects $272 for $53).
4. "It starts pouring at 6 PM" → 12.8 → 15.1 min, at risk $505 → $569. "Game goes to overtime" → +$34 (late surge lands after the rush; honest answer: small).

## Real-world inputs (say they're real)
- Events from Ticketmaster Discovery (live, 3-mile radius): Pitt Panthers vs Florida State, Acrisure Stadium, 7:00 PM, 68,400 seats, 0.3 mi; Gym Class Heroes w/ Lupe Fiasco, Stage AE, 8:00 PM, 5,500, 0.1 mi; The Notebook, Benedum, 7:30 PM; 2 club shows.
- Weather from Open-Meteo: fog ~37°F, chance of light snow 8–11 PM. (Not rain. Rain is a what-if toggle.)
- Local happenings from OpenRouter web search (low confidence, ≤0.6): Pittsburgh Equality Gala, Northside Farmers Market.
- Demand effect: **+29% from 5:30–7:00 PM, shifted toward delivery (63% of orders vs 55% normally).**

## Architecture (5 bullets)
1. **Real-world intake → structured facts**: Ticketmaster + Open-Meteo + web search; the LLM only extracts fields and writes one-liners. A deterministic, documented formula (size × proximity × timing, capped 0.7–1.8×) turns facts into per-15-min, per-channel demand multipliers.
2. **Kitchen simulator** (pure TypeScript): menu routing across grill/fryer/cold/pack, walking workers on a 1 m grid, fire-to-quote, Dasher arrivals at the quoted time, Dasher unassignment after a 12-min wait, hold limits → cold, dollars at risk. Deterministic seeds with **common random numbers**, so every comparison is apples-to-apples. 300 nights in ~1.5 s in a Web Worker pool.
3. **AI proposes, simulator proves**: Claude (via OpenRouter) returns interventions as strict JSON; each is screened on 120 nights (must pay for itself *and* help the worst 10% of nights), combined greedily, re-tested on 300. Rejections are shown with reasons. Rule-based proposer as fallback.
4. **Explainability by re-simulation**: exact Shapley values over up to 5 causes (2⁵ combinations), so the percentages add to 100%; "Ask anything" translates free text into a typed ScenarioPatch (zod-validated, shown as chips) and runs the experiment.
5. **Merchant outputs**: prep list, staff text, DoorDash quoted-prep-time schedule by window (maps to Merchant Portal → Adjust prep time), layout change, printable. Next.js 16 + react-three-fiber on Vercel; everything cached and demo-safe.

## One-liners
- "Forecasts predict numbers. We simulate consequences."
- "The AI proposes. The simulator proves. Every recommendation ships with evidence."
- "We didn't guess why it broke; we re-ran tonight 32 ways without each cause."
- "Ask it anything. It turns your question into an experiment and answers with numbers in two seconds."
- "Thirty-eight Dashers would have given up on Maria tonight. With the plan, none."
