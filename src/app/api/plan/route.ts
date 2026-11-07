// Planner LLM endpoints. "propose": the AI proposes interventions (strict JSON, schema-validated, bounds-checked).
// "explain": one-line rationales written ONLY from the simulator's computed numbers.
import { NextResponse } from "next/server";
import { z } from "zod";
import { chatJSON, MODEL_FAST, MODEL_SMART } from "@/lib/llm";
import { InterventionListSchema } from "@/plan/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ExplainOut = z.object({ lines: z.array(z.object({ id: z.string(), line: z.string().max(200) })) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const t0 = Date.now();
  if (body.mode === "propose") {
    try {
      const out = await chatJSON(InterventionListSchema,
        `You are the planning brain of "Rush Rehearsal", a restaurant rush simulator. Propose up to 6 interventions for tonight at a small burger & wings restaurant. A simulator will TEST every proposal over 300 simulated nights; you only propose. Times are minutes since midnight (960 = 4:00 PM, 1140 = 7:00 PM, 1320 = 10:00 PM). Allowed types and fields (all required):
- {"type":"add_shift","worker":"ana"|"sam"|"jake"|"maria","start":int,"end":int}  (only workers who are OFF or have gaps; wages given)
- {"type":"prep_batch","item":<menu item id>,"qty":int 5..80,"time":int}  (par-cook before the rush; waste if unsold)
- {"type":"quote_prep_time","start":int,"end":int,"minutes":int 10..35}  (longer quote => Dashers arrive later but conversion drops)
- {"type":"throttle_channel","channel":"doordash"|"ubereats"|"phone"|"counter","start":int,"end":int}  (pause a channel; lost orders)
- {"type":"reassign_worker","worker":...,"station":"grill"|"fryer"|"cold"|"pack"|"counter","start":int,"end":int}
- {"type":"move_station","station":...,"x":0.5..11.5,"y":0.5..7.5}
Each with a "rationale" (max 15 words). Be concrete and diverse: staffing, prep, quoted time, channel. Return {"interventions":[...]}.`,
        JSON.stringify(body.context).slice(0, 6000), { model: MODEL_SMART, timeoutMs: 12000, maxTokens: 900 });
      return NextResponse.json({ ...out, ms: Date.now() - t0, source: "llm", model: MODEL_SMART });
    } catch (e) {
      return NextResponse.json({ interventions: [], ms: Date.now() - t0, source: "fallback", error: String(e).slice(0, 160) });
    }
  }
  if (body.mode === "explain") {
    try {
      const out = await chatJSON(ExplainOut,
        `You explain simulation results to a restaurant owner. For each plan card you get computed numbers (before/after avg Dasher wait in minutes, cold orders, dollars at risk, cost, nights helped out of N, accepted or rejected with reason). Write ONE plain-English sentence per card (max 22 words) using ONLY those numbers. Never invent a number or a fact. Round sensibly. Output {"lines":[{"id":...,"line":...}]}.`,
        JSON.stringify(body.cards).slice(0, 6000), { model: MODEL_FAST, timeoutMs: 8000, maxTokens: 700 });
      return NextResponse.json({ ...out, ms: Date.now() - t0, source: "llm" });
    } catch (e) {
      return NextResponse.json({ lines: [], ms: Date.now() - t0, source: "fallback", error: String(e).slice(0, 160) });
    }
  }
  return NextResponse.json({ error: "unknown mode" }, { status: 400 });
}
