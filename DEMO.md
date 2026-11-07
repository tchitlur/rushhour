# DEMO.md — 5-minute runbook

**Setup (before you're called):** open the production URL in Chrome, full screen (F11), press **?** once to see the hotkey legend, then **?** again to hide it. Stay on the **Tonight** tab with the clock at 4:00 PM. Keep 2D on (projector-safe); 3D is the flourish. If the "live data" chip says "cached", that's fine and honest.

Total: ~2.5 min of clicking inside a 5-minute pitch. Everything below is deterministic.

| # | Say | Do | You should see |
|---|---|---|---|
| 0 | "Forecasts give merchants a number. Rush Rehearsal gives them the *consequences*: it plays tonight forward in a model of their kitchen and tests every fix before they try it. The AI proposes; the simulator proves." | (title overlay fades by itself) | Dark app, Tonight panel on the left. |
| 1 | "Tonight is Friday Nov 13. Maria's place is on the North Shore, 0.3 miles from Acrisure Stadium. We pull **real** events and weather." | Point at the **Pitt vs Florida State** card (Ticketmaster link), the weather strip, the demand curve: *"+29% from 5:30, shifted toward delivery."* | Event cards with sources, weather strip, orange tonight curve above the grey baseline. |
| 2 | "Let's watch tonight happen. 720× speed." | Click **Watch**, select **720×**, press **P**. | By ~7 PM the Fryer bar goes red, tokens pile up, Dashers queue at the front door with wait labels, counters go red. Let it run to ~7:45 PM, press **P** to pause. (Optional: press **3** for 3D, **2** back.) |
| 3 | "Why? Not a guess: we re-ran tonight without each cause, in every combination. Exact Shapley values." | Press **W**. | Stacked cause bar: Jake called out ~55%, game crowd ~35%, weather/concert small. Click **Jake called out** → the Grill highlights; click the bottleneck link → Fryer highlights. |
| 4 | "Now we rehearse. The AI proposes six fixes; the simulator tests each one on 120 versions of tonight and only keeps what pays for itself and helps the worst nights." | Press **Space** (Rehearse tab), click **Rehearse tonight**. Talk through the status line (~10 s). | Green card: Dasher wait ~13 → ~2.6 min, cold 9 → 3, risk ~$505 → ~$186 (−63%), helped 300/300, costs $68 protects $445. Two accepted cards (Call in Ana, Par-cook fries). Crossed-out cards: "Par-cook 45 wings — costs more than it saves", "Quote 25 min — no measurable effect", "Put Maria on the fryer — makes the worst nights worse". |
| 5 | "Same customers, same luck, two kitchens." | Click **Watch the race →** (or **S**), press **R** then **P** at 720×. | Left kitchen melts down, right stays green. At 10 PM the end-of-night card appears: wait, Dashers at door, cold, $ at risk side by side. |
| 6 | "Judges, give me a curveball." | Press **A** (Ask). Click **30-person catering at 6:30** or type what they say ("the fryer breaks at 7", "stop phone orders after 6:30"). | Chips show the parsed experiment, numbers before → after in ~2–4 s, a tested recovery plan. Optional: **Watch this scenario** plays it in the kitchen. |
| 7 | "And here's what Maria actually does tonight." | Back to **Rehearse**, scroll to **Tonight's game plan**. Click **Copy** on the staff text. | Prep list, staff text, DoorDash quoted-prep schedule ("maps to Merchant Portal → Adjust prep time"), Print. |

**Closing line:** "Every number you saw was computed, not written. The model proposes, the simulator proves, and the merchant gets a plan with evidence."

## Hotkeys
R reset · P play/pause · W why · Space rehearse · S race · C curveballs · A focus Ask · 2/3 2D/3D · D demo mode · ? legend

## If something fails
- **Page won't load / white:** reload. The app simulates from committed real data instantly; live fetches are optional.
- **Rehearse takes > 15 s or says "Planner failed":** click **Re-run**. If the LLM is down it silently uses cached AI proposals (chip says "AI proposals") or rules ("rule-based proposals"); the simulator still tests everything.
- **Ask free text comes back "unsupported":** use a preset button, or rephrase with a time ("at 7").
- **3D looks wrong (blank labels, slow):** press **2**. Everything works in 2D.
- **Race shows "Run Rehearse first":** press Space and run Rehearse.
- **Playback stuck at 10:00 PM:** press **R** then **P**.
- **Judge toggles Jake back on (Tonight panel):** that re-simulates everything (plan resets). Re-run Rehearse if you need the plan again.

## Demo night

**Chosen date: Friday, November 13, 2026** (restaurant: "Maria's Burgers & Wings", North Shore, 40.4468 / -80.0100).

**Why.** Ticketmaster Discovery (3-mile radius, 2026-11-07 through 2026-11-18) shows **no Steelers home game** in the window, so the Acrisure-Stadium-adjacent scenario comes from college football instead:

- **Pitt Panthers vs. Florida State** — Acrisure Stadium, kickoff **7:00 PM**. 68,400-seat stadium about 0.3 mi from the restaurant. The 4–7 PM pre-game arrival / tailgate window overlaps the dinner rush exactly, and the post-game exodus hits around 10:15 PM.
- **Gym Class Heroes w/ Lupe Fiasco** — Stage AE (5,500, next door on the North Shore), 8:00 PM.
- **The Notebook (touring)** — Benedum Center (2,800, downtown across the bridge), 7:30 PM; plus two small club shows (Club Cafe).
- Web search (OpenRouter web plugin) also surfaced smaller North Side happenings that evening at low confidence (≤0.6): the Pittsburgh Equality Gala at the Kamin Science Center (6–11 PM, ~1 mi) and the Northside Farmers Market (3–6 PM). See `src/data/cache/tonight-2026-11-13.json`.

**Real weather (Open-Meteo forecast fetched 2026-11-07):** cold and foggy through kickoff (~37–39°F), with a chance of light snow 8–11 PM (0.01 in/hr, 23% probability). **No measurable rain** — rain is only a labeled what-if toggle.

**Runner-up: Saturday, November 14, 2026** — Penguins vs. Senators, 7:00 PM at PPG Paints Arena (18,387, ~1.5 mi), plus Pittsburgh Symphony at Heinz Hall, The Notebook at the Benedum, and Pouya at the Roxian. Cached as `ALT_DATE`.

**Calm comparison night: Tuesday, November 10, 2026** — only small events. Cached as `CALM_DATE`.

Full candidate list: `src/data/demo-night.json`.

## Recording the demo
1. Open `/demo` (there is also a quiet "Demo" link in the homepage footer).
2. Press F11 for full screen; wait for "Everything is pre-loaded."
3. Start your screen recorder at 1920×1080.
4. Press **Start** (or the space bar). A 3-second countdown, then the 80-second walkthrough plays itself: Space pauses, R restarts, Esc exits.
5. Stop the recorder on the end card ("Rush Rehearsal · rushhour-psi.vercel.app").
Every run is identical: fixed demo seed, cached intake, pre-warmed plan and answers. Caption numbers are read from live app state.
