// Exact Shapley attribution of a metric over up to 5 scenario factors (2^n evaluations, memoised).
import type { MonteCarloSummary, Scenario } from "@/sim/types";
import type { Evaluator } from "./evaluate";
import type { Attribution, Factor } from "./types";

export interface FactorDef extends Factor {
  apply: (sc: Scenario) => Scenario;
}
export type AttributionMetric = Attribution["metric"];
export const MAX_FACTORS = 5;

const metricOf = (s: MonteCarloSummary, metric: AttributionMetric) => metric === "dasherWait" ? s.mean.avgDasherWait : s.mean.dollarsAtRisk;

function factorial(n: number): number { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }

/** Evaluate every subset (bitmask) of factors. Returns summaries indexed by mask. */
async function evaluateSubsets(base: Scenario, factors: FactorDef[], evaluate: Evaluator, nights: number, masks: number[]): Promise<Map<number, MonteCarloSummary>> {
  const unique = [...new Set(masks)];
  const results = await Promise.all(unique.map(mask => {
    let sc = base;
    factors.forEach((f, i) => { if (mask & (1 << i)) sc = f.apply(sc); });
    return evaluate(sc, nights);
  }));
  const out = new Map<number, MonteCarloSummary>();
  unique.forEach((m, i) => out.set(m, results[i]));
  return out;
}

function toShares(factors: FactorDef[], values: number[], total: number): Attribution["shares"] {
  return factors.map((f, i) => {
    const value = values[i];
    let pct = total !== 0 ? (value / total) * 100 : 0;
    if (pct < 0 && pct > -2) pct = 0; // clamp tiny negatives for display; raw value kept
    return { factorId: f.id, label: f.label, value, pct, station: f.station };
  });
}

function bottleneckOf(s: MonteCarloSummary): Attribution["bottleneck"] {
  return { station: s.mean.bottleneck.station, start: s.mean.bottleneck.start, end: s.mean.bottleneck.end };
}

export async function attribute(base: Scenario, factors: FactorDef[], metric: AttributionMetric, evaluate: Evaluator, nights = 60): Promise<Attribution> {
  if (factors.length > MAX_FACTORS) throw new Error(`attribute: at most ${MAX_FACTORS} factors (got ${factors.length})`);
  const n = factors.length;
  const full = (1 << n) - 1;
  const masks = Array.from({ length: 1 << n }, (_, m) => m);
  const summaries = await evaluateSubsets(base, factors, evaluate, nights, masks);
  const none = metricOf(summaries.get(0)!, metric);
  const v = (mask: number) => metricOf(summaries.get(mask)!, metric) - none;
  const nFact = factorial(n);
  const values = factors.map((_, i) => {
    let phi = 0;
    for (let mask = 0; mask <= full; mask++) {
      if (mask & (1 << i)) continue;
      const s = popcount(mask);
      const weight = (factorial(s) * factorial(n - s - 1)) / nFact;
      phi += weight * (v(mask | (1 << i)) - v(mask));
    }
    return phi;
  });
  const total = v(full);
  return { metric, total, shares: toShares(factors, values, total), method: "shapley", nights, bottleneck: bottleneckOf(summaries.get(full)!) };
}

export async function attributeOneAtATime(base: Scenario, factors: FactorDef[], metric: AttributionMetric, evaluate: Evaluator, nights = 60): Promise<Attribution> {
  const n = factors.length;
  const full = (1 << n) - 1;
  const masks = [0, full, ...factors.map((_, i) => 1 << i)];
  const summaries = await evaluateSubsets(base, factors, evaluate, nights, masks);
  const none = metricOf(summaries.get(0)!, metric);
  const values = factors.map((_, i) => metricOf(summaries.get(1 << i)!, metric) - none);
  const total = metricOf(summaries.get(full)!, metric) - none;
  return { metric, total, shares: toShares(factors, values, total), method: "one_at_a_time", nights, bottleneck: bottleneckOf(summaries.get(full)!) };
}

function popcount(x: number): number { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; }
