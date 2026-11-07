# STATUS — Rush Rehearsal

Live schedule (America/New_York). Start was 12:52 PM EST, ~80 min later than the plan's assumed 11:30 start, so milestones are compressed.

| Milestone | Target | Status |
|---|---|---|
| M0 scaffold + deploy + keys verified | 1:10 PM | done 1:00 PM |
| M1 sim engine, 2D view, playback, meltdown visible | 1:50 PM | done 1:15 PM (3D also landed early) |
| M2 Tonight intake (events, weather, web search), demo night, merge main | 2:20 PM | |
| M3 planner with evidence, outputs | 2:50 PM | |
| M4 Why (Shapley), Ask, curveballs, merge main | 3:15 PM | |
| M5 race, demo mode, 3D if ready — FEATURE FREEZE | 3:30 PM | |
| Final tuning, docs, merge main | 4:00 PM | |

## Decisions / deviations
- Next.js 16.4 scaffolded; `cacheComponents` disabled for predictable dynamic API routes.
- Charts are hand-rolled SVG (no chart library) to keep bundle small and control the look.
- Ticketmaster MCP server failed to connect in the agent session; the app calls the Ticketmaster REST API directly with `TICKETMASTER_API_KEY` (verified working).
- Keys verified at 12:53 PM: OpenRouter 200, Ticketmaster 200.

## Demo night (from real data)
- Friday 2026-11-13: Pitt vs Florida State, 7:00 PM kickoff at Acrisure Stadium (0.3 mi), plus Gym Class Heroes at Stage AE 8 PM. No Steelers home game in the 11/07–11/18 window.
- Real weather: fog, chance of light snow 8–11 PM, 37°F. NOT rain. Rain is only offered as a labeled what-if; the baseline factors are the game crowd, the concert and Jake calling out.
