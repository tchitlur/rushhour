import type { Scenario, MonteCarloSummary, NightMetrics } from "./types";
import { simulateNight } from "./engine";

/** Synchronous Monte Carlo (used in tests, tuning scripts and as the main-thread fallback). */
export function runMonteCarlo(sc: Scenario, nights = 300, baseSeed = 1000): MonteCarloSummary {
  const seeds = Array.from({ length: nights }, (_, i) => baseSeed + i);
  const results = seeds.map(seed => simulateNight(sc, { seed }).metrics);
  return summarize(results, seeds);
}

export function summarize(results: NightMetrics[], seeds: number[]): MonteCarloSummary {
  const nights = results.length;
  const perNight = results.map((m, i) => ({ seed: seeds[i], dollarsAtRisk: m.dollarsAtRisk, avgDasherWait: m.avgDasherWait, coldOrders: m.coldOrders }));
  const mean = meanMetrics(results);
  const sorted = [...results].sort((a, b) => b.dollarsAtRisk - a.dollarsAtRisk);
  const worstN = Math.max(1, Math.floor(nights * 0.1));
  const worst = sorted.slice(0, worstN);
  const worst10 = {
    avgDasherWait: avg(worst.map(m => m.avgDasherWait)),
    coldOrders: avg(worst.map(m => m.coldOrders)),
    dollarsAtRisk: avg(worst.map(m => m.dollarsAtRisk)),
  };
  return { nights, mean, worst10, perNight };
}

const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function meanMetrics(ms: NightMetrics[]): NightMetrics {
  const keys: (keyof NightMetrics)[] = ["avgTicket", "p90Ticket", "avgDasherWait", "totalDasherWait", "coldOrders", "lateOrders", "lostOrders", "orders", "revenue", "laborCost", "dollarsAtRisk"];
  const out = {} as Record<string, unknown>;
  for (const k of keys) out[k] = avg(ms.map(m => m[k] as number));
  const nb = ms[0].bins.length;
  out.bins = Array.from({ length: nb }, (_, i) => ({
    start: ms[0].bins[i].start,
    orders: avg(ms.map(m => m.bins[i].orders)),
    avgTicket: avg(ms.map(m => m.bins[i].avgTicket)),
    avgDasherWait: avg(ms.map(m => m.bins[i].avgDasherWait)),
    cold: avg(ms.map(m => m.bins[i].cold)),
    late: avg(ms.map(m => m.bins[i].late)),
    fryerLoad: avg(ms.map(m => m.bins[i].fryerLoad)),
    grillLoad: avg(ms.map(m => m.bins[i].grillLoad)),
    dollarsAtRisk: avg(ms.map(m => m.bins[i].dollarsAtRisk)),
  }));
  const counts = new Map<string, number>();
  for (const m of ms) counts.set(m.bottleneck.station, (counts.get(m.bottleneck.station) ?? 0) + 1);
  const station = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] as NightMetrics["bottleneck"]["station"];
  const same = ms.filter(m => m.bottleneck.station === station);
  out.bottleneck = {
    station,
    start: Math.round(avg(same.map(m => m.bottleneck.start)) / 15) * 15,
    end: Math.round(avg(same.map(m => m.bottleneck.end)) / 15) * 15,
    peakLoad: avg(same.map(m => m.bottleneck.peakLoad)),
  };
  return out as unknown as NightMetrics;
}
