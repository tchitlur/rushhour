# Rush Rehearsal

**Rehearse tonight's rush before it happens.**

Forecasts predict numbers. Rush Rehearsal **simulates consequences**: it plays tonight forward inside a model of the restaurant, shows *what breaks, when and why*, and recommends fixes that **the simulator has already tested**. The AI proposes; the simulator proves. Every recommendation carries evidence.

Built solo at the NOVA hackathon (CMU) for DoorDash's "Best Merchant Experience" track.

## What it does

| Step | What you see |
|---|---|
| **Tonight** | A real date and a North Shore (Pittsburgh) location → **real** Ticketmaster events, **real** Open-Meteo weather and web-searched local happenings, each with a source link → a deterministic demand curve ("+29% 5:30–7:00, shifted toward delivery"). |
| **Watch** | Press play. The kitchen runs tonight at up to 720×. Around 7 PM the fryer saturates, queues go red, food goes cold, Dashers pile up at the door. Live counters climb. |
| **Why** | A causal breakdown computed with **exact Shapley values** (every combination of causes re-simulated): "Jake called out 55%, Pitt–FSU game crowd 35%, weather 5%…" plus the bottleneck station and window. |
| **Rehearse** | The AI proposes up to 6 interventions as strict JSON. Each is simulated on 120 versions of tonight with common random numbers, kept only if it pays for itself *and* improves the worst 10% of nights, then combined greedily and re-tested on 300 nights. Winners show cost vs. dollars protected and "helped on X/300 nights"; losers are crossed out with the reason. |
| **Race** | Split screen: "Tonight as planned" vs "With the plan", same customers, same luck, counters diverging. |
| **Ask** | Type any what-if ("the fryer breaks at 7"). The LLM translates it into a typed, validated **ScenarioPatch** (shown as chips), the simulator runs the experiment on 300 nights and proposes a tested recovery plan. Curveball presets go through the same pipeline. |
| **Game plan** | Prep list, a staff text ready to copy, a DoorDash quoted-prep-time schedule by window, layout changes, printable. |

## How it works

```
real world ──► facts ──► demand formula ──► Scenario ──► simulator (Web Workers, 300 nights) ──► metrics
 Ticketmaster    LLM extracts   deterministic,   menu / stations /   deterministic, seeded,           Dasher wait, cold,
 Open-Meteo      structured     documented,      workers / shifts /  common random numbers            late, $ at risk,
 web search      fields only    capped 0.7–1.8×  quoted prep / …     across compared variants         per-15-min bins
                                                       ▲                       │
                                                       │                       ▼
                                           ScenarioPatch / Intervention   Shapley attribution,
                                           (LLM proposes, zod-validated)  planner screening,
                                                                          greedy combination
```

### Simulation engine (`src/sim`)
- Pure TypeScript, no UI dependencies. 30-second ticks over the 4:00–10:00 PM service window.
- **Menu** of 10 items with price, food cost, station routing (chicken sandwich = fryer → grill), prep-time distribution, hold limit, fryer-basket usage.
- **Stations** on a 1 m floor grid (grill 6 slots, fryer 4 baskets, cold, pack/expo, counter). **Workers** walk between stations at 1.2 m/s; walking time counts toward ticket time, so layout matters.
- **Orders** arrive as a thinned Poisson process (baseline × per-15-min, per-channel multipliers). Channels: DoorDash, Uber Eats, phone, counter. Delivery orders are fired to be ready near the quoted prep time; **Dashers** arrive at the quote ± noise and wait if the food isn't ready (DoorDash's "avoidable wait").
- Cooks fire long items first; under station jams they lose that discipline, which is how food goes cold in a meltdown. Walk-in and phone customers balk under a visible backlog.
- **Metrics**: avg/p90 ticket, avg and total Dasher wait, cold, late, lost, revenue, labor, **dollars at risk** (expected refunds/error charges at 50% of order value for cold, 15% for late, a load-dependent wrong-order rate, plus lost orders), per-bin series, bottleneck station and window.
- **Determinism and common random numbers**: arrivals come from a fixed max-rate candidate stream that each variant thins, and every order gets its own RNG seeded by its index, so two variants of the same night share customers and luck. 300 nights run in ~1.5 s across a Web Worker pool.

### Demand formula (`src/lib/demand.ts`)
Event magnitude *m* = size (attendance / 68,400, floor 0.03) × proximity (1 − miles/3) × confidence. Per 15-minute bin: pre-event window (start − 150 min → start) delivery +0.35*m*, counter +0.25*m*, phone +0.20*m*; during the event delivery +0.45*m* (and counter −0.15*m* for stadium events); the hour after: counter +0.30*m*, delivery +0.10*m*. Weather per hour: rain/snow → delivery +0.12, counter −0.15; fog or < 40 °F → delivery +0.05, counter −0.05. Contributions add, then the multiplier is capped to 0.7×–1.8×. The LLM never sets a number here; it only writes the one-line explanation per card.

### Planner (`src/plan`)
`rules.ts` is the rule-based proposer (always available); `/api/plan` asks the LLM for proposals as strict JSON validated by `InterventionListSchema`. Costs: add_shift = wage × hours; prep_batch = simulated waste; quote_prep_time = modeled lost conversion; throttle_channel = lost orders × margin. `evaluate.ts` screens, combines and re-evaluates; `shapley.ts` computes exact Shapley values over up to 5 factors (2⁵ = 32 re-simulated combinations × 60 nights). Explanations are written by the LLM **from the computed numbers only**.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind v4 · react-three-fiber + drei (3D kitchen, drag-and-drop layout) · zustand · zod · vitest · Web Workers. Deployed on Vercel.

## Env vars (server only, never `NEXT_PUBLIC_`)
```
OPENROUTER_API_KEY=       # LLM calls through OpenRouter (OpenAI-compatible, JSON output)
TICKETMASTER_API_KEY=     # Discovery API events within ~3 miles
OPENROUTER_MODEL_FAST=    # optional, default anthropic/claude-haiku-5.5 (extraction, patches, explanations)
OPENROUTER_MODEL_SMART=   # optional, default anthropic/claude-sonnet-4.5 (planning proposals)
```
All external responses are cached in memory; the demo night's real fetched data is committed under `src/data/cache` so the deployed app works even if an API is down (a small "cached" badge appears).

## Run
```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: determinism, metric sanity, Shapley sums, patch validation
npm run build
```

## Hotkeys
R reset · P play/pause · W why · Space rehearse · S split race · C curveballs · A focus Ask · 2/3 toggle 2D/3D · D demo mode · ? legend

## Honesty notes
- The restaurant, its menu and its order history are **synthetic** (seeded). Events and weather are real. See `FAKES.md` for every shortcut.
- Attribution percentages, plan evidence and Ask answers are computed by the simulator, not written by the model.
