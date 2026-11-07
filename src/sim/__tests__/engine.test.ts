import { describe, it, expect } from "vitest";
import { simulateNight } from "../engine";
import { runMonteCarlo } from "../montecarlo";
import { baseScenario, demoScenario } from "../scenario";

describe("simulation engine", () => {
  it("is deterministic for a given seed", () => {
    const a = simulateNight(demoScenario("2026-11-13"), { seed: 7, snapshots: true });
    const b = simulateNight(demoScenario("2026-11-13"), { seed: 7, snapshots: true });
    expect(a.metrics).toEqual(b.metrics);
    expect(a.snapshots!.length).toBe(b.snapshots!.length);
    expect(a.snapshots![400]).toEqual(b.snapshots![400]);
  });
  it("different seeds give different nights", () => {
    const a = simulateNight(baseScenario(), { seed: 1 });
    const b = simulateNight(baseScenario(), { seed: 2 });
    expect(a.metrics.revenue).not.toBe(b.metrics.revenue);
  });
  it("metrics are sane on a normal night", () => {
    const mc = runMonteCarlo(baseScenario(), 30);
    expect(mc.mean.orders).toBeGreaterThan(70);
    expect(mc.mean.orders).toBeLessThan(140);
    expect(mc.mean.avgDasherWait).toBeLessThan(3);
    expect(mc.mean.coldOrders).toBeLessThan(12);
    expect(mc.mean.revenue).toBeGreaterThan(1200);
    expect(mc.mean.bins.length).toBe(24);
  });
  it("the demo night melts down and the fryer is the bottleneck", () => {
    const mc = runMonteCarlo(demoScenario("2026-11-13"), 30);
    expect(mc.mean.avgDasherWait).toBeGreaterThan(6);
    expect(mc.mean.dollarsAtRisk).toBeGreaterThan(250);
    expect(mc.mean.bottleneck.station).toBe("fryer");
    const win = mc.mean.bins.filter(b => b.start >= 19 * 60 && b.start < 20 * 60);
    expect(win.reduce((a, b) => a + b.avgDasherWait, 0) / win.length).toBeGreaterThan(8);
  });
  it("emits one snapshot per tick with consistent counters", () => {
    const r = simulateNight(baseScenario(), { seed: 3, snapshots: true });
    expect(r.snapshots!.length).toBe(720);
    const lastSnap = r.snapshots![719];
    expect(lastSnap.live.ordersHanded).toBeLessThanOrEqual(lastSnap.live.ordersPlaced);
    expect(lastSnap.live.revenue).toBeCloseTo(r.metrics.revenue, 0);
  });
});
