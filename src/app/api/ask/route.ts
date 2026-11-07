// "Ask anything": the LLM translates a free-text what-if into a typed ScenarioPatch (schema-validated). The simulator runs it.
import { NextResponse } from "next/server";
import { chatJSON, MODEL_FAST } from "@/lib/llm";
import { ScenarioPatchSchema } from "@/plan/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You translate a restaurant owner's what-if question into a JSON "ScenarioPatch" for a kitchen simulator. Times are minutes since midnight (960 = 4:00 PM, 1050 = 5:30 PM, 1140 = 7:00 PM, 1200 = 8:00 PM, 1320 = 10:00 PM close). Service runs 960..1320.
Schema (all keys optional except summary):
{"summary": string (<=140 chars, plain English restatement),
 "demand":[{"start":int,"end":int,"channel":"doordash"|"ubereats"|"phone"|"counter"|"all","factor":number}],   // factor 1.3 = +30%
 "staff":[{"worker":"maria"|"jake"|"ana"|"sam","action":"absent"|"add"|"late","start":int,"end":int}],
 "equipment":[{"station":"grill"|"fryer"|"cold"|"pack"|"counter","start":int,"end":int,"capacity":int}],  // capacity 0 = broken, 2 = half the fryer
 "menu":[{"item":<id>,"action":"remove"|"boost"|"reduce","factor":number}],
 "channelPauses":[{"channel":...,"start":int,"end":int}],
 "quotedPrep":[{"start":int,"end":int,"minutes":int}],
 "layout":[{"station":...,"x":number,"y":number}],
 "bigOrders":[{"time":int,"channel":...,"items":[{"item":<id>,"qty":int}]}],
 "unsupported": string  // ONLY if the question cannot be modeled; say what can be modeled instead}
Menu item ids: burger, double, wings, fries, chicken, tenders, salad, shake, slaw, soda. Workers tonight: maria (4–10 PM, owner), sam (4–10 PM), jake (scheduled 6–10 PM but called out), ana (off, can be called in). Stations: grill (6 slots), fryer (4 baskets), cold, pack, counter.
Rules: "game goes to overtime" => demand factor ~1.25 for all channels 1260..1320 plus doordash 1.3. "sudden rain" => doordash & ubereats factor 1.15 and counter 0.8 for the stated window (default 1080..1260). "catering/big order of N people" => bigOrders with roughly N wings portions/2 + N fries/2 + N burgers/3 on the phone channel. "cook calls out" with no name => staff sam absent. A fryer "breaks" => equipment fryer capacity 0 for ~40 min unless told otherwise. Keep windows inside 960..1320. Output JSON only.`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { question?: string } | null;
  const q = (body?.question ?? "").trim().slice(0, 300);
  if (!q) return NextResponse.json({ error: "empty question" }, { status: 400 });
  const t0 = Date.now();
  try {
    const patch = await chatJSON(ScenarioPatchSchema, SYSTEM, `Question: ${q}`, { model: MODEL_FAST, timeoutMs: 9000, maxTokens: 500 });
    return NextResponse.json({ patch, ms: Date.now() - t0, source: "llm" });
  } catch (e) {
    return NextResponse.json({ patch: null, ms: Date.now() - t0, source: "fallback", error: String(e).slice(0, 160) });
  }
}
