"use client";
import { create } from "zustand";
import type { Scenario, Snapshot, NightResult, MonteCarloSummary, StationId } from "@/sim/types";
import { SERVICE_START } from "@/sim/types";
import { demoScenario, baseScenario } from "@/sim/scenario";
import { DT } from "@/sim/engine";
import { sim } from "@/sim/client";
import { lerpSnapshot } from "@/sim/interpolate";

export type Tab = "Tonight" | "Watch" | "Why" | "Rehearse" | "Race" | "Ask";
export const TABS: Tab[] = ["Tonight", "Watch", "Why", "Rehearse", "Race", "Ask"];
export const DEMO_SEED = 1042;
export const DEFAULT_DATE = "2026-11-13";

interface AppState {
  tab: Tab;
  view: "2d" | "3d";
  showHotkeys: boolean;
  demoMode: boolean;
  // scenarios
  tonight: Scenario;
  normal: Scenario;
  planScenario: Scenario | null;
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
  tonight: demoScenario(DEFAULT_DATE),
  normal: baseScenario(DEFAULT_DATE),
  planScenario: null,
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
      const planNight = await sim.runNight(planScenario, DEMO_SEED);
      if (get().planScenario === planScenario) set({ planNight });
    }
  },
  loadNight: async () => {
    const { tonight } = get();
    set({ loadingNight: true });
    const [night, tonightMC] = await Promise.all([sim.runNight(tonight, DEMO_SEED), sim.runMC(tonight, 300)]);
    if (get().tonight !== tonight) return;
    set({ night, tonightMC, loadingNight: false, tIdx: 0 });
    const normalMC = await sim.runMC(get().normal, 300);
    set({ normalMC });
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
