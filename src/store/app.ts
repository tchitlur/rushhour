"use client";
import { create } from "zustand";
import type { Scenario, Snapshot, NightResult, MonteCarloSummary, StationId } from "@/sim/types";
import { SERVICE_START } from "@/sim/types";
import { demoScenario, baseScenario, cloneScenario } from "@/sim/scenario";
import { DT } from "@/sim/engine";
import { sim } from "@/sim/client";
import { lerpSnapshot } from "@/sim/interpolate";
import type { TonightData } from "@/lib/intake-types";
import { buildTonightScenario, computeDemand, type DemandBreakdown } from "@/lib/demand";
import { CACHED_TONIGHT } from "@/data/cache";
import type { Plan } from "@/plan/types";
import { runPlanner, explainCards, togglePlan, evaluator, prewarmProposals } from "@/plan/run";
import type { Attribution, AskResult } from "@/plan/types";
import { attribute } from "@/plan/shapley";
import { tonightFactors } from "@/lib/demand";
import { runAsk } from "@/plan/ask";
import { applyPatch } from "@/plan/apply";

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
  // planner
  plan: Plan | null;
  planLoading: boolean;
  planStatus: string;
  planSource: "llm" | "rules" | "llm+rules" | "cached-llm" | null;
  moveStation: (id: StationId, x: number, y: number) => Promise<void>;
  planExplanations: Record<string, string>;
  runRehearse: () => Promise<void>;
  togglePlanCard: (id: string) => Promise<void>;
  // why (attribution)
  attribution: Attribution | null;
  whyLoading: boolean;
  whyMetric: "dasherWait" | "dollarsAtRisk";
  runWhy: (metric: "dasherWait" | "dollarsAtRisk") => Promise<void>;
  // ask
  askResult: AskResult | null;
  askLoading: boolean;
  askStatus: string;
  askNight: NightResult | null;
  askScenario: Scenario | null;
  viewportSource: "tonight" | "ask";
  runAsk: (q: string) => Promise<void>;
  playAskNight: () => Promise<void>;
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
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), 7000);
      const r = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards }), signal: ctrl2.signal });
      clearTimeout(timer2);
      const j = await r.json() as { lines?: { id: string; line: string }[] };
      if (j.lines?.length) set({ explanations: Object.fromEntries(j.lines.map(l => [l.id, l.line])) });
    } catch { /* keep template lines */ }
  },
  setToggles: (t) => {
    set(t);
    const { tonightData, jakeOut, rainWhatIf } = get();
    if (!tonightData) return;
    get().showToast(`Re-simulating tonight${get().plan ? " · plan reset, run Rehearse again" : ""}`, "info");
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
  plan: null,
  planLoading: false,
  planStatus: "",
  planSource: null,
  planExplanations: {},
  runRehearse: async () => {
    const base = get().tonight;
    if (get().planLoading) return;
    set({ planLoading: true, planStatus: "Starting…", plan: null, planExplanations: {} });
    try {
      const { plan, proposalSource } = await runPlanner(base, { onStatus: (m) => { if (get().tonight === base) set({ planStatus: m }); }, useLLM: true, llmTimeoutMs: 13000 });
      if (get().tonight !== base) { set({ planLoading: false, planStatus: "" }); return; }
      set({ plan, planSource: proposalSource, planLoading: false, planStatus: "" });
      void get().setPlanScenario(plan.scenario);
      const lines = await explainCards(plan.cards);
      if (get().plan === plan && Object.keys(lines).length) set({ planExplanations: lines });
    } catch (e) {
      console.error(e);
      set({ planLoading: false, planStatus: "Planner failed; try again." });
    }
  },
  moveStation: async (id, x, y) => {
    const before = get().tonight;
    const after = cloneScenario(before);
    const st = after.stations.find(s => s.id === id);
    if (!st || (Math.abs(st.x - x) < 0.01 && Math.abs(st.y - y) < 0.01)) return;
    st.x = x; st.y = y;
    const [a, b] = await Promise.all([sim.runMC(before, 50), sim.runMC(after, 50)]);
    const dTicket = (b.mean.avgTicket - a.mean.avgTicket) * 60;
    const dRisk = b.mean.dollarsAtRisk - a.mean.dollarsAtRisk;
    const sign = (v: number) => (v > 0 ? "+" : "\u2212");
    get().showToast(`Layout: ${sign(dTicket)}${Math.abs(dTicket).toFixed(0)} s/order \u00b7 ${sign(dRisk)}$${Math.abs(dRisk).toFixed(0)} at risk (50-night estimate)${get().plan ? " \u00b7 plan reset" : ""}`, dTicket <= 0 ? "ok" : "bad");
    if (get().tonight === before) get().setTonight(after);
  },
  togglePlanCard: async (id) => {
    const plan = get().plan;
    if (!plan || get().planStatus) return;
    const card = plan.cards.find(c => c.id === id);
    if (!card || !card.accepted) return;
    const enabled = plan.cards.filter(c => c.enabled && c.id !== id).map(c => c.id);
    if (!card.enabled) enabled.push(id);
    const optimistic = { ...plan, cards: plan.cards.map(c => (c.id === id ? { ...c, enabled: !c.enabled } : c)) };
    set({ plan: optimistic, planStatus: "Re-testing the plan…" });
    try {
      const next = await togglePlan(plan, enabled, 300);
      if (get().plan !== optimistic) return;
      set({ plan: next, planStatus: "" });
      void get().setPlanScenario(next.scenario);
    } catch (e) {
      console.error(e);
      if (get().plan === optimistic) set({ plan, planStatus: "" });
    }
  },
  attribution: null,
  whyLoading: false,
  whyMetric: "dasherWait",
  runWhy: async (metric) => {
    const { tonightData, jakeOut, rainWhatIf, tonight } = get();
    if (!tonightData) return;
    set({ whyLoading: true, whyMetric: metric });
    try {
      const { base, factors } = tonightFactors(tonightData, { jakeOut, rainWhatIf });
      const attribution = await attribute(base, factors, metric, evaluator, 60);
      if (get().tonight !== tonight) { set({ whyLoading: false }); return; }
      if (get().whyMetric !== metric) return;
      set({ attribution, whyLoading: false });
    } catch (e) { console.error(e); set({ whyLoading: false }); }
  },
  askResult: null,
  askLoading: false,
  askStatus: "",
  askNight: null,
  askScenario: null,
  viewportSource: "tonight",
  runAsk: async (q) => {
    const base = get().tonight;
    set({ askLoading: true, askStatus: "Starting…", askResult: null, askNight: null, viewportSource: "tonight" });
    try {
      const r = await runAsk(q, base, { onStatus: (m) => { if (get().tonight === base) set({ askStatus: m }); } });
      if (get().tonight !== base) { set({ askLoading: false, askStatus: "" }); return; }
      set({ askResult: r, askLoading: false, askStatus: "" });
    } catch (e) { console.error(e); set({ askLoading: false, askStatus: "Couldn't run that experiment." }); }
  },
  playAskNight: async () => {
    const { askResult, tonight, seed } = get();
    if (!askResult) return;
    if (get().viewportSource === "ask") { set({ viewportSource: "tonight", tIdx: 0, playing: false }); return; }
    const sc = applyPatch(tonight, askResult.patch);
    const askNight = await sim.runNight(sc, seed);
    set({ askNight, askScenario: sc, viewportSource: "ask", tIdx: 0, playing: true });
  },
  highlightStation: null,
  toast: null,

  setTab: (tab) => set({ tab, highlightStation: null }),
  setView: (view) => set({ view }),
  toggleHotkeys: () => set(s => ({ showHotkeys: !s.showHotkeys })),
  setDemoMode: (demoMode) => set({ demoMode }),
  setTonight: (tonight) => { set({ tonight, night: null, planNight: null, tonightMC: null, tIdx: 0, playing: false, plan: null, planScenario: null, attribution: null, askResult: null, askNight: null, viewportSource: "tonight", planLoading: false, planStatus: "", askLoading: false, askStatus: "", whyLoading: false }); void get().loadNight(); },
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
      if (get().demoMode && !get().attribution && get().tonightData) void get().runWhy(get().whyMetric);
      if (get().demoMode) void prewarmProposals(tonight);
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
