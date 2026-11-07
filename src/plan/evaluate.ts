// Evaluate candidate interventions and build/re-evaluate a Plan. Evaluator is injected (worker-backed in the browser).
import type { MonteCarloSummary, Scenario } from "@/sim/types";
import { applyInterventions, interventionTitle } from "./apply";
import { bottleneckReport } from "./bottleneck";
import { costLabel, interventionCost } from "./cost";
import type { Evidence, Intervention, Plan, PlanCard } from "./types";

export type Evaluator = (sc: Scenario, nights: number) => Promise<MonteCarloSummary>;

const pick = (s: MonteCarloSummary): Evidence["before"] => ({
  avgDasherWait: s.mean.avgDasherWait,
  coldOrders: s.mean.coldOrders,
  lateOrders: s.mean.lateOrders,
  dollarsAtRisk: s.mean.dollarsAtRisk,
  revenue: s.mean.revenue,
});

export function buildEvidence(before: MonteCarloSummary, after: MonteCarloSummary, cost: number): Evidence {
  const b = pick(before), a = pick(after);
  const protectedDollars = (b.dollarsAtRisk - a.dollarsAtRisk) + (a.revenue - b.revenue);
  const n = Math.min(before.perNight.length, after.perNight.length);
  let nightsHelped = 0;
  for (let i = 0; i < n; i++) if (after.perNight[i].dollarsAtRisk < before.perNight[i].dollarsAtRisk) nightsHelped++;
  return {
    nights: after.nights,
    before: b,
    after: a,
    cost,
    protectedDollars,
    netDollars: protectedDollars - cost,
    nightsHelped,
    worst10Before: before.worst10.dollarsAtRisk,
    worst10After: after.worst10.dollarsAtRisk,
  };
}

export function screen(ev: Evidence): { accepted: boolean; rejectReason?: string } {
  if (ev.netDollars > 0 && ev.worst10After < ev.worst10Before) return { accepted: true };
  if (Math.abs(ev.protectedDollars) < 10) return { accepted: false, rejectReason: "No measurable effect" };
  if (ev.netDollars <= 0 && ev.protectedDollars > 0) return { accepted: false, rejectReason: "Costs more than it saves" };
  return { accepted: false, rejectReason: "Makes the worst nights worse" };
}

const money = (n: number) => `$${Math.round(Math.abs(n))}`;

export function numbersRationale(ev: Evidence): string {
  const b = ev.before, a = ev.after;
  const parts: string[] = [];
  if (Math.abs(b.avgDasherWait - a.avgDasherWait) >= 0.3) parts.push(`${a.avgDasherWait < b.avgDasherWait ? "Cuts" : "Raises"} avg Dasher wait ${b.avgDasherWait.toFixed(1)} → ${a.avgDasherWait.toFixed(1)} min`);
  if (Math.abs(b.coldOrders - a.coldOrders) >= 1) parts.push(`${a.coldOrders < b.coldOrders ? "cuts" : "adds"} cold orders ${Math.round(b.coldOrders)} → ${Math.round(a.coldOrders)}`);
  const effect = parts.length ? parts.join(", ") : "Little change in wait or cold orders";
  const verb = ev.protectedDollars > -0.5 ? "protects" : "loses";
  return `${effect}; ${verb} ${money(ev.protectedDollars)} for ${ev.cost > 0 ? money(ev.cost) : "free"}.`;
}

export async function evaluateCandidate(base: Scenario, baseline: MonteCarloSummary, iv: Intervention, evaluate: Evaluator, nights: number, id = `${iv.type}-${Date.now()}`): Promise<PlanCard> {
  const sc = applyInterventions(base, [iv]);
  const after = await evaluate(sc, nights);
  const cost = interventionCost(iv, base, baseline, after);
  const evidence = buildEvidence(baseline, after, cost);
  const { accepted, rejectReason } = screen(evidence);
  let rationale = numbersRationale(evidence);
  if (iv.type === "reassign_worker") rationale += " Skill shift approximated for the whole night.";
  return {
    id,
    intervention: iv,
    title: interventionTitle(iv, base),
    costLabel: costLabel(iv, cost),
    evidence,
    accepted,
    rejectReason,
    enabled: accepted,
    rationale,
    source: "rules",
  };
}

/** Base scenarios for plans built in this session, so reevaluatePlan can re-apply toggles. */
const BASE_OF = new WeakMap<Plan, Scenario>();
export const baseScenarioOf = (plan: Plan): Scenario | undefined => BASE_OF.get(plan);

async function finishPlan(base: Scenario, baseline: MonteCarloSummary, cards: PlanCard[], evaluate: Evaluator, nights: number): Promise<Plan> {
  const enabled = cards.filter(c => c.enabled && c.accepted);
  const scenario = applyInterventions(base, enabled.map(c => c.intervention));
  const combined = enabled.length ? await evaluate(scenario, nights) : baseline;
  const cost = enabled.reduce((a, c) => a + c.evidence.cost, 0);
  const plan: Plan = {
    cards,
    baseline,
    combined,
    combinedEvidence: buildEvidence(baseline, combined, cost),
    scenario,
    baseScenario: base,
    bottleneck: bottleneckReport(baseline, base),
    generatedAt: Date.now(),
  };
  BASE_OF.set(plan, base);
  return plan;
}

export async function buildPlan(base: Scenario, candidates: Intervention[], evaluate: Evaluator, nights = 300, opts?: { screenNights?: number }): Promise<Plan> {
  const screenNights = opts?.screenNights ?? nights;
  const baseline = await evaluate(base, nights);
  const screenBaseline = screenNights === nights ? baseline : await evaluate(base, screenNights);
  const cards = await Promise.all(candidates.map((iv, i) => evaluateCandidate(base, screenBaseline, iv, evaluate, screenNights, `c${i + 1}-${iv.type}`)));

  // Greedy combination in order of net dollars.
  const accepted = cards.filter(c => c.accepted).sort((a, b) => b.evidence.netDollars - a.evidence.netDollars);
  const combo: PlanCard[] = [];
  let comboNet = 0;
  for (const card of accepted) {
    const trial = [...combo, card];
    const after = await evaluate(applyInterventions(base, trial.map(c => c.intervention)), screenNights);
    const ev = buildEvidence(screenBaseline, after, trial.reduce((a, c) => a + c.evidence.cost, 0));
    if (ev.netDollars > comboNet) { combo.push(card); comboNet = ev.netDollars; }
    else { card.accepted = false; card.enabled = false; card.rejectReason = "Redundant once the other fixes are in"; }
  }
  for (const c of cards) c.enabled = c.accepted;
  return finishPlan(base, baseline, cards, evaluate, nights);
}

export async function reevaluatePlan(plan: Plan, enabledIds: string[], evaluate: Evaluator, nights: number, base: Scenario = plan.baseScenario ?? BASE_OF.get(plan)!): Promise<Plan> {
  const want = new Set(enabledIds);
  const cards = plan.cards.map(c => ({ ...c, enabled: c.accepted && want.has(c.id) }));
  const baseline = plan.baseline.nights === nights ? plan.baseline : await evaluate(base, nights);
  const next = await finishPlan(base, baseline, cards, evaluate, nights);
  return { ...next, generatedAt: plan.generatedAt };
}
