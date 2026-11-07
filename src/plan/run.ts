// Client-side planner orchestration: AI proposes (LLM with fallback to rules) -> simulator proves (Monte Carlo in workers).
import type { Scenario } from "@/sim/types";
import type { Intervention, Plan, PlanCard } from "./types";
import { InterventionListSchema } from "./types";
import { sim } from "@/sim/client";
import { bottleneckReport } from "./bottleneck";
import { ruleBasedProposals } from "./rules";
import { buildPlan, reevaluatePlan, type Evaluator } from "./evaluate";
import { interventionTitle } from "./apply";

export const evaluator: Evaluator = (sc, nights) => sim.runMC(sc, nights);

export interface RunOptions {
  nights?: number;        // final evaluation nights
  screenNights?: number;  // per-candidate screening nights
  useLLM?: boolean;
  onStatus?: (msg: string) => void;
  llmTimeoutMs?: number;
}

export interface RunResult { plan: Plan; proposalSource: "llm" | "rules" | "llm+rules" }

export async function runPlanner(base: Scenario, opts: RunOptions = {}): Promise<RunResult> {
  const nights = opts.nights ?? 300, screenNights = opts.screenNights ?? 120;
  const status = opts.onStatus ?? (() => {});
  status("Simulating tonight as planned (300 nights)…");
  const baseline = await evaluator(base, nights);
  const report = bottleneckReport(baseline, base);
  const rules = ruleBasedProposals(base, report);
  let candidates: Intervention[] = [];
  let proposalSource: RunResult["proposalSource"] = "rules";
  if (opts.useLLM !== false) {
    status("AI is proposing fixes…");
    const llm = await proposeViaLLM(base, report, opts.llmTimeoutMs ?? 14000);
    if (llm.length) { candidates = llm; proposalSource = "llm"; }
  }
  // Make sure the candidate set has the staple ideas the rules know about (dedupe by title).
  const seen = new Set(candidates.map(c => interventionTitle(c, base)));
  for (const r of rules) { const t = interventionTitle(r, base); if (!seen.has(t)) { candidates.push(r); seen.add(t); } }
  if (proposalSource === "llm" && candidates.length > (rules.length)) proposalSource = "llm+rules";
  candidates = candidates.slice(0, 9);
  status(`Testing ${candidates.length} fixes on ${screenNights} versions of tonight…`);
  const plan = await buildPlan(base, candidates, evaluator, nights, { screenNights });
  return { plan, proposalSource };
}

async function proposeViaLLM(base: Scenario, report: ReturnType<typeof bottleneckReport>, timeoutMs: number): Promise<Intervention[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const context = {
      date: base.date,
      drivers: base.notes,
      bottleneck: report,
      workers: base.workers.map(w => ({ id: w.id, wage: w.wage, shifts: w.shifts, bestStations: Object.entries(w.skills).filter(([, v]) => (v ?? 0) >= 1.1).map(([k]) => k) })),
      menu: base.menu.map(m => ({ id: m.id, name: m.name, stations: m.stations, prepMin: m.prepMin, foodCost: m.foodCost })),
      quotedPrep: base.quotedPrep,
      stations: base.stations.map(s => ({ id: s.id, x: s.x, y: s.y })),
      channelMix: base.channelMix,
      peakWindow: report.window,
    };
    const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "propose", context }), signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const j = await res.json();
    const parsed = InterventionListSchema.safeParse({ interventions: j.interventions ?? [] });
    if (!parsed.success) return [];
    // bounds sanity: windows must be ordered; drop add_shift for workers already fully on
    return parsed.data.interventions.filter(iv => {
      if ("start" in iv && "end" in iv && iv.end <= iv.start) return false;
      if (iv.type === "add_shift") { const w = base.workers.find(w => w.id === iv.worker); if (!w) return false; if (w.shifts.some(s => s.start <= iv.start && s.end >= iv.end)) return false; }
      if (iv.type === "prep_batch" && !base.menu.some(m => m.id === iv.item || m.name === iv.item)) return false;
      return true;
    });
  } catch { return []; }
}

export async function explainCards(cards: PlanCard[]): Promise<Record<string, string>> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const payload = cards.map(c => ({ id: c.id, title: c.title, accepted: c.accepted, rejectReason: c.rejectReason, cost: Math.round(c.evidence.cost), protectedDollars: Math.round(c.evidence.protectedDollars), nightsHelped: c.evidence.nightsHelped, nights: c.evidence.nights, before: round(c.evidence.before), after: round(c.evidence.after) }));
    const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "explain", cards: payload }), signal: ctrl.signal });
    clearTimeout(timer);
    const j = await res.json();
    return Object.fromEntries(((j.lines ?? []) as { id: string; line: string }[]).map(l => [l.id, l.line]));
  } catch { return {}; }
}
const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10) / 10]));

export async function togglePlan(plan: Plan, enabledIds: string[], nights = 300): Promise<Plan> {
  return reevaluatePlan(plan, enabledIds, evaluator, nights);
}
