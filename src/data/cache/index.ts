// Committed snapshots of real-world intake (Ticketmaster + Open-Meteo + web search) so the demo
// works offline / when an upstream API is rate-limited. Regenerate by running the fetchers once per date.
import type { TonightData } from "../../lib/intake-types";
import demoNight from "./tonight-2026-11-13.json";
import altNight from "./tonight-2026-11-14.json";
import calmNight from "./tonight-2026-11-10.json";
// Nov 7–21, 2026 pre-fetched (Ticketmaster + Open-Meteo, no web search) so date switching is instant.
import n20261107 from "./tonight-2026-11-07.json";
import n20261108 from "./tonight-2026-11-08.json";
import n20261109 from "./tonight-2026-11-09.json";
import n20261111 from "./tonight-2026-11-11.json";
import n20261112 from "./tonight-2026-11-12.json";
import n20261115 from "./tonight-2026-11-15.json";
import n20261116 from "./tonight-2026-11-16.json";
import n20261117 from "./tonight-2026-11-17.json";
import n20261118 from "./tonight-2026-11-18.json";
import n20261119 from "./tonight-2026-11-19.json";
import n20261120 from "./tonight-2026-11-20.json";
import n20261121 from "./tonight-2026-11-21.json";

/** Fri Nov 13, 2026: Pitt vs Florida State, 7 PM kickoff at Acrisure Stadium (+ Gym Class Heroes at Stage AE). */
export const DEMO_DATE = "2026-11-13";
/** Sat Nov 14, 2026: Penguins vs Senators at PPG Paints Arena (+ Heinz Hall, Benedum). Runner-up demo night. */
export const ALT_DATE = "2026-11-14";
/** Tue Nov 10, 2026: calm weeknight — only a touring musical at the Benedum. Baseline for comparison. */
export const CALM_DATE = "2026-11-10";

export const CACHED_TONIGHT: Record<string, TonightData> = {
  [DEMO_DATE]: demoNight as TonightData,
  [ALT_DATE]: altNight as TonightData,
  [CALM_DATE]: calmNight as TonightData,
  "2026-11-07": n20261107 as TonightData,
  "2026-11-08": n20261108 as TonightData,
  "2026-11-09": n20261109 as TonightData,
  "2026-11-11": n20261111 as TonightData,
  "2026-11-12": n20261112 as TonightData,
  "2026-11-15": n20261115 as TonightData,
  "2026-11-16": n20261116 as TonightData,
  "2026-11-17": n20261117 as TonightData,
  "2026-11-18": n20261118 as TonightData,
  "2026-11-19": n20261119 as TonightData,
  "2026-11-20": n20261120 as TonightData,
  "2026-11-21": n20261121 as TonightData,
};
