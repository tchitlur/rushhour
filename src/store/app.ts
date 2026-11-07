"use client";
import { create } from "zustand";
import type { Scenario, Snapshot, NightResult, MonteCarloSummary, StationId } from "@/sim/types";
import { SERVICE_START } from "@/sim/types";
import { demoScenario, baseScenario } from "@/sim/scenario";
import { DT } from "@/sim/engine";
import { sim } from "@/sim/client";
import { lerpSnapshot } from "@/sim/interpolate";
import type { TonightData } from "@/lib/intake-types";
import { buildTonightScenario, computeDemand, type DemandBreakdown } from "@/lib/demand";
import { CACHED_TONIGHT } from "@/data/cache";

export type Tab = "Tonight" | "Watch" | "Why" | "Rehearse" | "Race" | "Ask";
export const TABS: Tab[] = ["Tonight", "Watch", "Why", "Rehearse", "Race", "Ask"];
export const DEMO_SEED = 1042;
/** Pick the night whose dollars-at-risk is closest to the Monte Carlo mean: a representative night, not a cherry-picked one. */
export function representativeSeed(mc: MonteCarloSummary): number {
  let best = mc.perNight[0].seed, bestD = Infinity;
  for (const n of mc.perNight) { const d = Math.abs(n.dollarsAtRisk - mc.mean.dollarsAtRisk); if (d < bestD) { bestD = d; best = n.seed; } }
  return best;
}
export const DEFAULT_DATE = "2026-11-13";

interface AppState {
  tab: Tab;
  view: "2d" | "3d";
  showHotkeys: boolean;
  demoMode: boolean;
  // tonight intake (REAL events & weather)
  tonightData: TonightData | null;
  tonightLoading: boolean;
  tonightSource: "live" | "cache" | "mixed" | null;
  demand: DemandBreakdown | null;
  jakeOut: boolean;
  rainWhatIf: boolean;
  explanations: Record<string, string>;
  loadTonight: (date?: string) => Promise<void>;
  setToggles: (t: { jakeOut?: boolean; rainWhatIf?: boolean }) => void;
  // scenarios
  tonight: Scenario;
  normal: Scenario;
  planScenario: Scenario | null;
  seed: number;                      // representative seed used for Watch/Race playback
  // playback
  night: NightResult | null;        // tonight as planned (with snapshots)
  planNight: NightResult | null;    // with the plan (same seed)
  tIdx: number;                      // fractional snapshot index
  playing: boolean;
  speed: number;                     // sim minutes per real second (1x = 1 min/min => 1/60 per sec); we store multiplier
  loadingNight: boolean;
  // monte carlo
  tonightMC: MonteCarloSummary | null;
  normalMC: MonteCarloSummary | null;
  highlightStation: StationId | null;
  toast: { text: string; kind: "ok" | "bad" | "info"; id: number } | null;

  setTab: (t: Tab) => void;
  setView: (v: "2d" | "3d") => void;
  toggleHotkeys: () => void;
  setDemoMode: (b: boolean) => void;
  setTonight: (s: Scenario) => void;
  setPlanScenario: (s: Scenario | null) => Promise<void>;
  loadNight: () => Promise<void>;
  play: () => void; pause: () => void; togglePlay: () => void;
  setSpeed: (s: number) => void;
  seek: (idx: number) => void;
  seekTime: (t: number) => void;
  reset: () => void;
  advance: (realDtSec: number) => void;
  setHighlight: (s: StationId | null) => void;
  showToast: (text: string, kind?: "ok" | "bad" | "info") => void;
}

export const useApp = create<AppState>((set, get) => ({
  tab: "Tonight",
  view: "2d",
  showHotkeys: false,
  demoMode: true,
  tonightData: null,
  tonightLoading: false,
  tonightSource: null,
  demand: null,
  jakeOut: true,
  rainWhatIf: false,
  explanations: {},
  loadTonight: async (date = DEFAULT_DATE) => {
    set({ tonightLoading: true });
    // 1) cached real data first, so the kitchen simulates instantly
    const cached = CACHED_TONIGHT[date] ?? null;
    if (cached) {
      const { jakeOut, rainWhatIf } = get();
      const tonight = buildTonightScenario(cached, { jakeOut, rainWhatIf });
      set({ tonightData: cached, tonightSource: "cache", demand: computeDemand(cached.events, cached.weather, tonight.channelMix), normal: baseScenario(date) });
      get().setTonight(tonight);
    }
    // 2) then live fetch; only re-simulate if the live facts change the scenario
    let data: TonightData | null = null;
    let source: "live" | "cache" | "mixed" = "live";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(`/api/tonight?date=${date}&web=1`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) { data = await res.json() as TonightData; source = data.cached ? "mixed" : "live"; }
    } catch { /* fall back below */ }
    if (!data || (!data.events.length && !data.weather)) { data = CACHED_TONIGHT[date] ?? null; source = "cache"; }
    if (!data) { set({ tonightLoading: false }); return; }
    const { jakeOut, rainWhatIf } = get();
    const tonight = buildTonightScenario(data, { jakeOut, rainWhatIf });
    const demand = computeDemand(data.events, data.weather, tonight.channelMix);
    const same = JSON.stringify({ d: tonight.demand, n: tonight.notes }) === JSON.stringify({ d: get().tonight.demand, n: get().tonight.notes });
    set({ tonightData: data, tonightSource: source, demand, tonightLoading: false, normal: baseScenario(date) });
    if (!same || !get().night) get().setTonight(tonight);
    // one-line explanations (LLM, from facts only); silent fallback
    try {
      const cards = data.events.slice(0, 8).map(e => ({ id: e.id, name: e.name, type: e.type, start: e.start, venue: e.venue, distanceMiles: e.distanceMiles, attendance: e.attendance, impact: e.impact }));
      const r = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards }) });
      const j = await r.json() as { lines?: { id: string; line: string }[] };
      if (j.lines?.length) set({ explanations: Object.fromEntries(j.lines.map(l => [l.id, l.line])) });
    } catch { /* keep template lines */ }
  },
  setToggles: (t) => {
    set(t);
    const { tonightData, jakeOut, rainWhatIf } = get();
    if (!tonightData) return;
    const tonight = buildTonightScenario(tonightData, { jakeOut, rainWhatIf });
    get().setTonight(tonight);
  },
  tonight: demoScenario(DEFAULT_DATE),
  normal: baseScenario(DEFAULT_DATE),
  planScenario: null,
  seed: DEMO_SEED,
  night: null,
  planNight: null,
  tIdx: 0,
  playing: false,
  speed: 240,
  loadingNight: false,
  tonightMC: null,
  normalMC: null,
  highlightStation: null,
  toast: null,

  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view }),
  toggleHotkeys: () => set(s => ({ showHotkeys: !s.showHotkeys })),
  setDemoMode: (demoMode) => set({ demoMode }),
  setTonight: (tonight) => { set({ tonight, night: null, planNight: null, tonightMC: null, tIdx: 0, playing: false }); void get().loadNight(); },
  setPlanScenario: async (planScenario) => {
    set({ planScenario, planNight: null });
    if (planScenario) {
      const planNight = await sim.runNight(planScenario, get().seed);
      if (get().planScenario === planScenario) set({ planNight });
    }
  },
  loadNight: async () => {
    const { tonight } = get();
    set({ loadingNight: true });
    try {
      const tonightMC = await sim.runMC(tonight, 300);
      const seed = representativeSeed(tonightMC);
      const night = await sim.runNight(tonight, seed);
      if (get().tonight !== tonight) return;
      set({ night, tonightMC, seed, loadingNight: false, tIdx: 0 });
      const normalMC = await sim.runMC(get().normal, 300);
      set({ normalMC });
    } catch (e) {
      console.error("simulation failed", e);
      set({ loadingNight: false });
    }
  },
  play: () => { const s = get(); if (s.night && s.tIdx >= s.night.snapshots!.length - 1) set({ tIdx: 0 }); set({ playing: true }); },
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  setSpeed: (speed) => set({ speed }),
  seek: (idx) => { const n = get().night; if (!n) return; set({ tIdx: Math.max(0, Math.min(n.snapshots!.length - 1, idx)) }); },
  seekTime: (t) => get().seek((t - SERVICE_START) / DT),
  reset: () => set({ tIdx: 0, playing: false }),
  advance: (realDtSec) => {
    const s = get();
    if (!s.playing || !s.night) return;
    const simMin = realDtSec * s.speed / 60;   // speed = sim minutes per real minute
    const next = s.tIdx + simMin / DT;
    const max = s.night.snapshots!.length - 1;
    if (next >= max) set({ tIdx: max, playing: false }); else set({ tIdx: next });
  },
  setHighlight: (highlightStation) => set({ highlightStation }),
  showToast: (text, kind = "info") => { const id = Date.now(); set({ toast: { text, kind, id } }); setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, 3500); },
}));

/** Current interpolated snapshot for a given night result at the store's tIdx. */
export function snapshotAt(night: NightResult | null, tIdx: number): Snapshot | null {
  if (!night?.snapshots?.length) return null;
  const snaps = night.snapshots;
  const i = Math.floor(tIdx);
  const alpha = tIdx - i;
  return lerpSnapshot(snaps[Math.min(i, snaps.length - 1)], snaps[i + 1], alpha);
}
