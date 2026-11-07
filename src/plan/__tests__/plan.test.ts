import { describe, it, expect } from "vitest";
import type { Scenario } from "@/sim/types";
import { SERVICE_END, SERVICE_START } from "@/sim/types";
import { baseScenario, cloneScenario, demoScenario, applyDemandWindow, removeWorker } from "@/sim/scenario";
import { runMonteCarlo } from "@/sim/montecarlo";
import { applyIntervention, applyInterventions, applyPatch, interventionTitle, patchChips } from "../apply";
import { bottleneckReport } from "../bottleneck";
import { ruleBasedProposals } from "../rules";
import { buildPlan, reevaluatePlan, type Evaluator } from "../evaluate";
import { attribute, attributeOneAtATime, type FactorDef } from "../shapley";
import type { Intervention } from "../types";

const evaluator: Evaluator = (sc, nights) => Promise.resolve(runMonteCarlo(sc, nights));

function assertContiguous(q: Scenario["quotedPrep"]) {
  const sorted = [...q].sort((a, b) => a.start - b.start);
  expect(sorted[0].start).toBe(SERVICE_START);
  expect(sorted[sorted.length - 1].end).toBe(SERVICE_END);
  for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBe(sorted[i - 1].end);
}

describe("applyIntervention", () => {
  it("never mutates the input scenario", () => {
    const base = demoScenario("2026-11-13");
    const snapshot = JSON.stringify(base);
    const ivs: Intervention[] = [
      { type: "add_shift", worker: "ana", start: 1080, end: 1260 },
      { type: "prep_batch", item: "wings", qty: 30, time: 1140 },
      { type: "quote_prep_time", start: 1140, end: 1260, minutes: 22 },
      { type: "throttle_channel", channel: "ubereats", start: 1170, end: 1215 },
      { type: "reassign_worker", worker: "sam", station: "fryer", start: 1170, end: 1230 },
      { type: "move_station", station: "fryer", x: 3.6, y: 4.5 },
    ];
    for (const iv of ivs) applyIntervention(base, iv);
    applyInterventions(base, ivs);
    expect(JSON.stringify(base)).toBe(snapshot);
    const out = applyInterventions(base, ivs);
    expect(out.workers.find(w => w.id === "ana")!.shifts).toEqual([{ start: 1080, end: 1260 }]);
    expect(out.prepBatches).toEqual([{ item: "wings", qty: 30, time: 1140 }]);
    expect(out.channelPauses).toEqual([{ channel: "ubereats", start: 1170, end: 1215 }]);
    expect(out.stations.find(s => s.id === "fryer")).toMatchObject({ x: 3.6, y: 4.5 });
    expect(out.workers.find(w => w.id === "sam")!.skills.fryer).toBeCloseTo(0.9 * 1.25);
    expect(out.workers.find(w => w.id === "sam")!.skills.grill).toBeCloseTo(0.7 * 0.85);
  });

  it("merges overlapping shifts", () => {
    const sc = applyIntervention(baseScenario(), { type: "add_shift", worker: "jake", start: 1020, end: 1110 });
    expect(sc.workers.find(w => w.id === "jake")!.shifts).toEqual([{ start: 1020, end: 1320 }]);
  });

  it("keeps quotedPrep contiguous over 960..1320", () => {
    let sc = applyIntervention(baseScenario(), { type: "quote_prep_time", start: 1140, end: 1260, minutes: 22 });
    assertContiguous(sc.quotedPrep);
    expect(sc.quotedPrep).toEqual([
      { start: 960, end: 1140, minutes: 15 }, { start: 1140, end: 1260, minutes: 22 }, { start: 1260, end: 1320, minutes: 15 },
    ]);
    sc = applyIntervention(sc, { type: "quote_prep_time", start: 1200, end: 1320, minutes: 30 });
    assertContiguous(sc.quotedPrep);
    expect(sc.quotedPrep).toEqual([
      { start: 960, end: 1140, minutes: 15 }, { start: 1140, end: 1200, minutes: 22 }, { start: 1200, end: 1320, minutes: 30 },
    ]);
    sc = applyIntervention(sc, { type: "quote_prep_time", start: 960, end: 1320, minutes: 15 });
    expect(sc.quotedPrep).toEqual([{ start: 960, end: 1320, minutes: 15 }]);
  });

  it("builds human titles", () => {
    const sc = baseScenario();
    expect(interventionTitle({ type: "add_shift", worker: "ana", start: 1080, end: 1260 }, sc)).toBe("Call in Ana 6pm–9pm");
    expect(interventionTitle({ type: "prep_batch", item: "wings", qty: 30, time: 1080 }, sc)).toBe("Par-cook 30 wings at 6pm");
    expect(interventionTitle({ type: "quote_prep_time", start: 1110, end: 1230, minutes: 22 }, sc)).toBe("Quote 22 min prep 6:30–8:30");
    expect(interventionTitle({ type: "throttle_channel", channel: "ubereats", start: 1140, end: 1185 }, sc)).toBe("Pause Uber Eats 7pm–7:45");
    expect(interventionTitle({ type: "reassign_worker", worker: "sam", station: "fryer", start: 1110, end: 1200 }, sc)).toBe("Put Sam on the fryer 6:30–8pm");
    expect(interventionTitle({ type: "move_station", station: "fryer", x: 3.6, y: 4.5 }, sc)).toBe("Move Fryer next to Pack");
  });
});

describe("applyPatch / patchChips", () => {
  it("applies a patch without mutating and produces chips", () => {
    const base = demoScenario("2026-11-13");
    const snapshot = JSON.stringify(base);
    const patch = {
      summary: "Fryer down and Jake out",
      demand: [{ start: 1110, end: 1200, channel: "doordash" as const, factor: 1.5 }],
      staff: [{ worker: "jake" as const, action: "absent" as const }],
      equipment: [{ station: "fryer" as const, start: 1140, end: 1180, capacity: 0 }],
      channelPauses: [{ channel: "phone" as const, start: 1110, end: 1320 }],
      bigOrders: [{ time: 1110, channel: "phone" as const, items: [{ item: "wings", qty: 30 }, { item: "fries", qty: 30 }] }],
      quotedPrep: [{ start: 1110, end: 1230, minutes: 25 }],
    };
    const out = applyPatch(base, patch);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(out.outages).toEqual([{ station: "fryer", start: 1140, end: 1180, capacity: 0 }]);
    expect(out.workers.find(w => w.id === "jake")!.shifts).toEqual([]);
    expect(out.demand.find(b => b.start === 1125)!.mult.doordash).toBeGreaterThan(base.demand.find(b => b.start === 1125)!.mult.doordash);
    assertContiguous(out.quotedPrep);
    const chips = patchChips(patch, base);
    expect(chips).toContain("DoorDash ×1.5 6:30–8pm");
    expect(chips).toContain("Jake out");
    expect(chips).toContain("Fryer down 7pm–7:40");
    expect(chips).toContain("No phone orders after 6:30");
    expect(chips).toContain("Catering: 30 wings + 30 fries at 6:30 (phone)");
    expect(chips).toContain("Quote 25 min 6:30–8:30");
  });
});

describe("shapley", () => {
  const base = baseScenario("2026-11-13");
  const event: FactorDef = {
    id: "event", label: "Game crowd", station: "fryer",
    apply: sc => { const c = cloneScenario(sc); applyDemandWindow(c, 1110, 1200, { doordash: 1.4, ubereats: 1.35, phone: 1.2, counter: 1.2 }); return c; },
  };
  const jake: FactorDef = { id: "jake", label: "Jake out", apply: sc => { const c = cloneScenario(sc); removeWorker(c, "jake"); return c; } };

  it("shares sum to the total and identical factors get equal shares", async () => {
    const twin: FactorDef = { ...event, id: "event2", label: "Game crowd (twin)" };
    for (const metric of ["dasherWait", "dollarsAtRisk"] as const) {
      const a = await attribute(base, [event, twin, jake], metric, evaluator, 20);
      expect(a.method).toBe("shapley");
      expect(a.shares).toHaveLength(3);
      const sum = a.shares.reduce((s, x) => s + x.value, 0);
      expect(sum).toBeCloseTo(a.total, 6);
      expect(a.shares[0].value).toBeCloseTo(a.shares[1].value, 9);
      expect(a.shares[0].station).toBe("fryer");
      expect(a.total).toBeGreaterThan(0);
    }
  });

  it("one-at-a-time fallback reports the same total", async () => {
    const s = await attribute(base, [event, jake], "dollarsAtRisk", evaluator, 20);
    const o = await attributeOneAtATime(base, [event, jake], "dollarsAtRisk", evaluator, 20);
    expect(o.method).toBe("one_at_a_time");
    expect(o.total).toBeCloseTo(s.total, 6);
    expect(o.bottleneck.station).toBe(s.bottleneck.station);
  });
});

describe("buildPlan on the demo night", () => {
  it("accepts some fixes, rejects the decoy, and lowers dollars at risk", async () => {
    const base = demoScenario("2026-11-13");
    const baseline = runMonteCarlo(base, 30);
    const report = bottleneckReport(baseline, base);
    expect(report.station).toBe("fryer");
    expect(report.summary).toMatch(/Fryer saturates/);
    expect(report.drivers).toEqual(base.notes);
    const candidates = ruleBasedProposals(base, report);
    expect(candidates.length).toBeGreaterThan(3);
    expect(candidates.length).toBeLessThanOrEqual(8);

    const plan = await buildPlan(base, candidates, evaluator, 30);
    const accepted = plan.cards.filter(c => c.accepted);
    const rejected = plan.cards.filter(c => !c.accepted);
    console.log("baseline", { wait: plan.baseline.mean.avgDasherWait.toFixed(1), cold: plan.baseline.mean.coldOrders.toFixed(1), risk: plan.baseline.mean.dollarsAtRisk.toFixed(0) });
    console.log("combined", { wait: plan.combined.mean.avgDasherWait.toFixed(1), cold: plan.combined.mean.coldOrders.toFixed(1), risk: plan.combined.mean.dollarsAtRisk.toFixed(0), net: plan.combinedEvidence.netDollars.toFixed(0), cost: plan.combinedEvidence.cost.toFixed(0) });
    for (const c of plan.cards) console.log(c.accepted ? "ACCEPT" : "REJECT", c.title, c.costLabel, `net $${c.evidence.netDollars.toFixed(0)}`, c.rejectReason ?? "", "|", c.rationale);
    expect(accepted.length).toBeGreaterThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    expect(rejected.some(c => c.intervention.type === "prep_batch" && c.intervention.item === "salad")).toBe(true);
    expect(plan.combined.mean.dollarsAtRisk).toBeLessThan(plan.baseline.mean.dollarsAtRisk);
    expect(plan.combinedEvidence.netDollars).toBeGreaterThan(0);
    for (const c of plan.cards) expect(c.enabled).toBe(c.accepted);
    expect(plan.bottleneck.station).toBe("fryer");

    // toggling everything off returns to baseline
    const off = await reevaluatePlan(plan, [], evaluator, 30);
    expect(off.combined.mean.dollarsAtRisk).toBeCloseTo(plan.baseline.mean.dollarsAtRisk, 6);
    expect(off.cards.every(c => !c.enabled)).toBe(true);
    const one = await reevaluatePlan(plan, [accepted[0].id], evaluator, 30);
    expect(one.cards.filter(c => c.enabled)).toHaveLength(1);
    expect(one.combinedEvidence.cost).toBeCloseTo(accepted[0].evidence.cost, 6);
  }, 60_000);
});
