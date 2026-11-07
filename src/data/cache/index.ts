// Committed snapshots of real-world intake (Ticketmaster + Open-Meteo + web search) so the demo
// works offline / when an upstream API is rate-limited. Regenerate by running the fetchers once per date.
import type { TonightData } from "../../lib/intake-types";
import demoNight from "./tonight-2026-11-13.json";
import altNight from "./tonight-2026-11-14.json";
import calmNight from "./tonight-2026-11-10.json";

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
};
