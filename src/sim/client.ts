// Browser-side simulation client: a small pool of Web Workers with a main-thread fallback.
import type { Scenario, MonteCarloSummary, NightResult, NightMetrics } from "./types";
import { summarize } from "./montecarlo";
import { simulateNight } from "./engine";

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

class SimClient {
  private workers: Worker[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private rr = 0;
  private ready = false;
  /** in-memory cache of Monte Carlo results keyed by scenario JSON + nights + seed */
  private mcCache = new Map<string, MonteCarloSummary>();

  private init() {
    if (this.ready) return;
    this.ready = true;
    if (typeof window === "undefined" || typeof Worker === "undefined") return;
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      try {
        const w = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent) => {
          const p = this.pending.get(e.data.id);
          if (!p) return;
          this.pending.delete(e.data.id);
          if (e.data.type === "error") p.reject(new Error(e.data.error)); else p.resolve(e.data);
        };
        w.onerror = () => {
          // drop the broken worker; reject everything pending so callers fall back to the main thread
          this.workers = this.workers.filter(x => x !== w);
          for (const [id, p] of this.pending) { p.reject(new Error("worker failed")); this.pending.delete(id); }
        };
        this.workers.push(w);
      } catch { /* no worker support */ }
    }
  }

  get poolSize() { this.init(); return this.workers.length; }

  private post<T>(msg: Record<string, unknown>): Promise<T> {
    this.init();
    const id = this.nextId++;
    const w = this.workers[this.rr++ % this.workers.length];
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ ...msg, id });
    });
  }

  async runNight(scenario: Scenario, seed: number): Promise<NightResult> {
    this.init();
    if (this.workers.length === 0) return simulateNight(scenario, { seed, snapshots: true });
    try {
      const r = await this.post<{ result: NightResult }>({ type: "night", scenario, seed });
      return r.result;
    } catch {
      return simulateNight(scenario, { seed, snapshots: true });
    }
  }

  async runMC(scenario: Scenario, nights = 300, baseSeed = 1000): Promise<MonteCarloSummary> {
    this.init();
    const key = JSON.stringify([scenario, nights, baseSeed]);
    const hit = this.mcCache.get(key);
    if (hit) return hit;
    const seeds = Array.from({ length: nights }, (_, i) => baseSeed + i);
    let results: NightMetrics[];
    if (this.workers.length === 0) {
      results = seeds.map(s => simulateNight(scenario, { seed: s }).metrics);
    } else {
      const k = this.workers.length;
      const chunks: number[][] = Array.from({ length: k }, () => []);
      seeds.forEach((s, i) => chunks[i % k].push(s));
      try {
        const parts = await Promise.all(chunks.filter(c => c.length).map(c => this.post<{ metrics: NightMetrics[] }>({ type: "nights", scenario, seeds: c })));
        const bySeed = new Map<number, NightMetrics>();
        chunks.filter(c => c.length).forEach((c, ci) => c.forEach((s, j) => bySeed.set(s, parts[ci].metrics[j])));
        results = seeds.map(s => bySeed.get(s)!);
      } catch {
        results = seeds.map(s => simulateNight(scenario, { seed: s }).metrics);
      }
    }
    const summary = summarize(results, seeds);
    if (this.mcCache.size > 600) this.mcCache.clear();
    this.mcCache.set(key, summary);
    return summary;
  }
}

export const sim = new SimClient();
