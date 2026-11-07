// Plain-English bottleneck report written from simulation numbers only.
import type { MonteCarloSummary, Scenario } from "@/sim/types";
import { fmtClock } from "@/sim/types";
import { STATION_LABEL } from "./apply";
import type { BottleneckReport } from "./types";

export function peakDasherWaitBin(summary: MonteCarloSummary): { start: number; avgDasherWait: number } {
  let best = summary.mean.bins[0] ?? { start: 960, avgDasherWait: 0 };
  for (const b of summary.mean.bins) if (b.avgDasherWait > best.avgDasherWait) best = b;
  return { start: best.start, avgDasherWait: best.avgDasherWait };
}

export function bottleneckReport(summary: MonteCarloSummary, sc: Scenario): BottleneckReport {
  const bn = summary.mean.bottleneck;
  const peak = peakDasherWaitBin(summary);
  const m = summary.mean;
  const cold = Math.round(m.coldOrders), late = Math.round(m.lateOrders), risk = Math.round(m.dollarsAtRisk);
  const station = STATION_LABEL[bn.station];
  const parts: string[] = [];
  if (bn.peakLoad >= 1) parts.push(`${station} saturates ${fmtClock(bn.start)}–${fmtClock(bn.end)} (load ${bn.peakLoad.toFixed(1)}×).`);
  else parts.push(`${station} is the busiest station ${fmtClock(bn.start)}–${fmtClock(bn.end)} (load ${bn.peakLoad.toFixed(1)}×, not saturated).`);
  if (peak.avgDasherWait >= 1) parts.push(`Dasher wait peaks at ${Math.round(peak.avgDasherWait)} min around ${fmtClock(peak.start)}.`);
  else parts.push(`Dashers barely wait (peak ${peak.avgDasherWait.toFixed(1)} min).`);
  parts.push(`${cold} cold, ${late} late, $${risk} at risk on an average night.`);
  return {
    station: bn.station,
    window: { start: bn.start, end: bn.end },
    peakLoad: bn.peakLoad,
    peakDasherWaitBin: peak,
    summary: parts.join(" "),
    drivers: [...(sc.notes ?? [])],
  };
}
