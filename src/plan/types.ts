// Frozen interfaces for the planner, attribution ("Why") and Ask-anything patches.
import { z } from "zod";
import type { Channel, StationId, MonteCarloSummary, Scenario } from "@/sim/types";

// ---------- Interventions ----------
export const InterventionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_shift"), worker: z.enum(["maria", "jake", "ana", "sam"]), start: z.number().int().min(960).max(1320), end: z.number().int().min(960).max(1320), rationale: z.string().max(200).optional() }),
  z.object({ type: z.literal("prep_batch"), item: z.string().min(1), qty: z.number().int().min(1).max(200), time: z.number().int().min(960).max(1320), rationale: z.string().max(200).optional() }),
  z.object({ type: z.literal("quote_prep_time"), start: z.number().int().min(960).max(1320), end: z.number().int().min(960).max(1320), minutes: z.number().int().min(8).max(45), rationale: z.string().max(200).optional() }),
  z.object({ type: z.literal("throttle_channel"), channel: z.enum(["doordash", "ubereats", "phone", "counter"]), start: z.number().int().min(960).max(1320), end: z.number().int().min(960).max(1320), rationale: z.string().max(200).optional() }),
  z.object({ type: z.literal("reassign_worker"), worker: z.enum(["maria", "jake", "ana", "sam"]), station: z.enum(["grill", "fryer", "cold", "pack", "counter"]), start: z.number().int().min(960).max(1320), end: z.number().int().min(960).max(1320), rationale: z.string().max(200).optional() }),
  z.object({ type: z.literal("move_station"), station: z.enum(["grill", "fryer", "cold", "pack", "counter"]), x: z.number().min(0.5).max(11.5), y: z.number().min(0.5).max(7.5), rationale: z.string().max(200).optional() }),
]);
export type Intervention = z.infer<typeof InterventionSchema>;
export const InterventionListSchema = z.object({ interventions: z.array(InterventionSchema).max(8) });

export interface Evidence {
  nights: number;
  before: { avgDasherWait: number; coldOrders: number; lateOrders: number; dollarsAtRisk: number; revenue: number };
  after: { avgDasherWait: number; coldOrders: number; lateOrders: number; dollarsAtRisk: number; revenue: number };
  cost: number;             // modeled $ cost of the intervention
  protectedDollars: number; // before.risk - after.risk (+ revenue gained)
  netDollars: number;       // protected - cost
  nightsHelped: number;     // nights where dollarsAtRisk improved
  worst10Before: number;    // mean dollarsAtRisk over worst 10% nights
  worst10After: number;
}

export interface PlanCard {
  id: string;
  intervention: Intervention;
  title: string;            // short human title, e.g. "Call in Ana 6–9 PM"
  costLabel: string;        // e.g. "$54 labor"
  evidence: Evidence;
  accepted: boolean;        // survived screening
  rejectReason?: string;    // if !accepted
  enabled: boolean;         // user toggle
  rationale: string;        // one-liner (LLM from numbers, or rule-based)
  source: "llm" | "rules";
}

export interface Plan {
  cards: PlanCard[];
  baseline: MonteCarloSummary;
  combined: MonteCarloSummary;  // all enabled accepted cards applied together
  combinedEvidence: Evidence;
  scenario: Scenario;           // baseline scenario with enabled cards applied
  bottleneck: BottleneckReport;
  generatedAt: number;
}

export interface BottleneckReport {
  station: StationId;
  window: { start: number; end: number };
  peakLoad: number;
  peakDasherWaitBin: { start: number; avgDasherWait: number };
  summary: string;              // plain-English, numbers from the simulation
  drivers: string[];            // scenario notes
}

// ---------- Attribution ("Why") ----------
export interface Factor {
  id: string;                   // "event", "rain", "jake_absent", ...
  label: string;                // "Game crowd"
  /** apply the factor to a scenario (mutates copy). Baseline = all factors off. */
  station?: StationId;          // station to highlight when clicked
}
export interface Attribution {
  metric: "dasherWait" | "dollarsAtRisk";
  total: number;                // metric(with all factors) - metric(none)
  shares: { factorId: string; label: string; value: number; pct: number; station?: StationId }[];
  method: "shapley" | "one_at_a_time";
  nights: number;
  bottleneck: { station: StationId; start: number; end: number };
}

// ---------- Ask anything: ScenarioPatch ----------
const win = { start: z.number().int().min(960).max(1320), end: z.number().int().min(960).max(1320) };
export const ScenarioPatchSchema = z.object({
  summary: z.string().max(140).describe("plain-English restatement of the experiment"),
  demand: z.array(z.object({ ...win, channel: z.enum(["doordash", "ubereats", "phone", "counter", "all"]), factor: z.number().min(0).max(3) })).max(6).optional(),
  staff: z.array(z.object({ worker: z.enum(["maria", "jake", "ana", "sam"]), action: z.enum(["absent", "add", "late"]), start: z.number().int().min(960).max(1320).optional(), end: z.number().int().min(960).max(1320).optional() })).max(4).optional(),
  equipment: z.array(z.object({ station: z.enum(["grill", "fryer", "cold", "pack", "counter"]), ...win, capacity: z.number().int().min(0).max(12) })).max(4).optional(),
  menu: z.array(z.object({ item: z.string(), action: z.enum(["remove", "boost", "reduce"]), factor: z.number().min(0).max(5).optional() })).max(6).optional(),
  channelPauses: z.array(z.object({ channel: z.enum(["doordash", "ubereats", "phone", "counter"]), ...win })).max(4).optional(),
  quotedPrep: z.array(z.object({ ...win, minutes: z.number().int().min(8).max(60) })).max(4).optional(),
  layout: z.array(z.object({ station: z.enum(["grill", "fryer", "cold", "pack", "counter"]), x: z.number().min(0.5).max(11.5), y: z.number().min(0.5).max(7.5) })).max(5).optional(),
  bigOrders: z.array(z.object({ time: z.number().int().min(960).max(1320), channel: z.enum(["doordash", "ubereats", "phone", "counter"]), items: z.array(z.object({ item: z.string(), qty: z.number().int().min(1).max(100) })).max(8) })).max(3).optional(),
  unsupported: z.string().max(200).optional().describe("set when the question cannot be modeled; explain what can be"),
});
export type ScenarioPatch = z.infer<typeof ScenarioPatchSchema>;

export interface AskResult {
  question: string;
  patch: ScenarioPatch;
  chips: string[];             // human chips, e.g. "Fryer down 7:00–7:40"
  baseline: MonteCarloSummary;
  patched: MonteCarloSummary;
  answer: string;              // numbers-first answer
  recovery?: PlanCard[];       // quick plan on the patched scenario
  source: "llm" | "cache" | "rules";
  ms: number;
}

export type ChannelOrAll = Channel | "all";
