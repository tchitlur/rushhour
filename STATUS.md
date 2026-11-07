# STATUS — Rush Rehearsal

Live schedule (America/New_York). Start was 12:52 PM EST, ~80 min later than the plan assumed, so milestones were compressed. Feature freeze 3:30 PM, final report 4:00 PM.

| Milestone | Target | Status |
|---|---|---|
| M0 scaffold + deploy + keys verified | 1:10 PM | done 1:00 PM |
| M1 sim engine, 2D view, playback, meltdown visible | 1:50 PM | done 1:12 PM (3D landed in parallel) |
| M2 Tonight intake (events, weather, web search), demo night, merge main | 2:20 PM | done 1:25 PM |
| M3 planner with evidence, outputs | 2:50 PM | done 1:36 PM |
| M4 Why (Shapley), Ask, curveballs, merge main | 3:15 PM | done 1:36 PM |
| M5 race, drag-and-drop, demo mode, docs | 3:30 PM | done 1:45 PM |
| Final tuning, polish, PITCH_NOTES, QA, merge main | 4:00 PM | done 2:12 PM |

## What's live
- Simulation engine (deterministic, common random numbers), Web Worker pool, 2D + 3D kitchen, playback to 720×, timeline, counters.
- Tonight: live Ticketmaster + Open-Meteo + OpenRouter web search with committed cache fallback; deterministic demand formula; event cards with sources; LLM one-liners.
- Rehearse: live LLM proposals (pre-warmed in demo mode, cached fallback, rule-based fallback) → simulator screening → greedy combination → evidence cards, rejected cards, toggles → game plan outputs (prep list, staff text, quoted-prep schedule, print).
- Why: exact Shapley values over 5 causes (32 combos × 60 nights), station highlighting.
- Ask: free text → LLM → typed patch (chips) → 300-night experiment → tested recovery plan; 4 curveball presets + 6 likely questions cached; keyword fallback.
- Race: synced split screen with end-of-night card.
- Hotkeys, demo mode, print view. 16 tests pass; build and lint clean on every push.

## Decisions / deviations from the brief
- Next.js 16.4; `cacheComponents` disabled for predictable dynamic API routes. Charts are hand-rolled SVG.
- Ticketmaster MCP connector failed in the build session; the app calls the Ticketmaster REST API directly (works).
- **No Steelers home game in the window** → demo night is Fri Nov 13: Pitt vs Florida State at Acrisure Stadium (7 PM) + Stage AE concert. **Real weather is fog/snow chance, not rain** → rain is a labeled what-if toggle, not a baseline cause.
- Playback uses the representative (closest-to-mean) seeded night, not the worst night.
- Tuning: all targets hit except baseline cold orders (~7 vs the 15–30 asked for). Chosen deliberately: more cold food on the baseline would have required making cooks irrational on calm nights too. Documented in FAKES.md.
- Ask presets are hand-written patches (same schema); free text is live LLM with keyword fallback.
- Models: fast = anthropic/claude-haiku-5.5, smart = anthropic/claude-sonnet-4.5 (configurable). Total OpenRouter spend for build + testing well under $1.

## Known issues
- 3D labels load a font from a CDN; offline → blank labels (2D is the default and has no such dependency).
- Drag-and-drop a station resets the plan (toast says so).
- First load on a cold Vercel lambda: the Tonight panel shows cached data instantly; the live refresh can take ~9 s and may flip the badge to "live + cached".
