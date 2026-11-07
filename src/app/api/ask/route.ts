// "Ask anything": the LLM translates a free-text what-if into a typed ScenarioPatch (schema-validated). The simulator runs it.
import { NextResponse } from "next/server";
import { chatJSON, MODEL_FAST } from "@/lib/llm";
import { ScenarioPatchSchema } from "@/plan/types";
import { splitOrder } from "@/plan/apply";
import { baseScenario } from "@/sim/scenario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { restaurant?: string; cuisine?: string; menu?: { id: string; name: string; popularity: number; stations: string[] }[]; workers?: { id: string; name: string; shifts: string; owner?: boolean }[]; stations?: { id: string; name: string; capacity: number }[]; channelMix?: Record<string, number>; catering30?: { item: string; qty: number }[]; dishes100?: { item: string; qty: number }[] };

/** Fallback context when the client sends none (Maria's defaults, derived from the base scenario). */
function defaultCtx(): Ctx {
  const sc = baseScenario();
  return { restaurant: "Maria's Burgers & Wings", cuisine: "burgers", menu: sc.menu.map(m => ({ id: m.id, name: m.name, popularity: m.popularity, stations: m.stations })), workers: sc.workers.map(w => ({ id: w.id, name: w.name, shifts: w.shifts.length ? "4–10 PM" : "off tonight", owner: w.wage === 0 })), stations: sc.stations.map(s => ({ id: s.id, name: s.name, capacity: s.capacity })), channelMix: sc.channelMix, catering30: [{ item: "wings", qty: 15 }, { item: "fries", qty: 15 }, { item: "burger", qty: 10 }], dishes100: splitOrder(sc.menu, 100) };
}

/** System prompt built from the ACTIVE restaurant: only its menu ids, worker ids and station ids may appear in the patch. */
function systemPrompt(ctx: Ctx): string {
  const menu = (ctx.menu ?? []).map(m => `${m.id} ("${m.name}", popularity ${m.popularity}, ${m.stations.join("+")})`).join(", ");
  const workers = (ctx.workers ?? []).map(w => `${w.id} ("${w.name}", ${w.shifts}${w.owner ? ", owner" : ""})`).join(", ");
  const stations = (ctx.stations ?? []).map(s => `${s.id} = "${s.name}" (capacity ${s.capacity})`).join(", ");
  const onShift = (ctx.workers ?? []).filter(w => !/off/.test(w.shifts));
  const absent = onShift.filter(w => !w.owner)[0] ?? onShift[0];
  const off = (ctx.workers ?? []).find(w => /off/.test(w.shifts));
  const items = (xs?: { item: string; qty: number }[]) => JSON.stringify(xs ?? []);
  const cook = (ctx.stations ?? []).filter(s => s.id === "grill" || s.id === "fryer").sort((a, b) => a.capacity - b.capacity)[0];
  const eqName = cook?.name ?? "fryer"; const eqId = cook?.id ?? "fryer"; const eqCap = cook?.capacity ?? 4;
  const anyItem = ctx.menu?.[0];
  return `You translate a restaurant owner's what-if question into a JSON "ScenarioPatch" for a kitchen simulator. Restaurant: ${ctx.restaurant ?? "this restaurant"} (${ctx.cuisine ?? "restaurant"}). Times are minutes since midnight (960 = 4:00 PM, 1080 = 6:00 PM, 1110 = 6:30 PM, 1140 = 7:00 PM, 1200 = 8:00 PM, 1260 = 9:00 PM, 1320 = 10:00 PM close). Service runs 960..1320; keep every window inside it and end > start.
Schema (all keys optional except summary):
{"summary": string (<=140 chars, plain English restatement),
 "demand":[{"start":int,"end":int,"channel":"doordash"|"ubereats"|"phone"|"counter"|"all","factor":number}],   // factor 1.3 = +30%, 0.6 = -40%
 "staff":[{"worker":<worker id>,"action":"absent"|"add"|"late"|"leave","start":int,"end":int}],  // "leave": start = when they go home; "late": start = when they arrive
 "extraStaff":[{"count":int,"start":int,"end":int,"station":<station id>}],  // unnamed extra cooks (count>0) or being short-staffed (count<0); station optional
 "equipment":[{"station":<station id>,"start":int,"end":int,"capacity":int}],  // capacity OVERRIDE for the window: 0 = broken, half the listed capacity = "half speed"
 "addEquipment":[{"station":<station id>,"capacity":int,"time":int}],  // ADDED capacity from "time" (omit = all night): a second unit = + its listed capacity
 "menu":[{"item":<menu id>,"action":"remove"|"boost"|"reduce"|"slower","factor":number}],  // slower: prep-time multiplier; boost/reduce: popularity multiplier
 "channelPauses":[{"channel":"doordash"|"ubereats"|"phone"|"counter","start":int,"end":int}],
 "quotedPrep":[{"start":int,"end":int,"minutes":int}],
 "layout":[{"station":<station id>,"x":number,"y":number}],  // floor is 12 x 8 m
 "bigOrders":[{"time":int,"channel":...,"items":[{"item":<menu id>,"qty":int}]}],
 "unsupported": string  // ONLY if nothing in the question can be modeled: one friendly sentence (<= 40 words) saying what CAN be modeled}
STRICT: use ONLY these ids. Menu item ids: ${menu || "(none)"}. Workers tonight: ${workers || "(none)"}. Station ids (the owner uses the quoted names): ${stations}. Never invent a person or an item; if the question names someone who is not listed, return {"summary":"Unknown person","unsupported":"There's no <name> on staff tonight; the crew is <real names>."}.
Generic quantities ("100 dishes", "a catering order", "big order for 40") become ONE bigOrder split across this menu's most popular items. A 30-person order => "items": ${items(ctx.catering30)}. 100 dishes => "items": ${items(ctx.dishes100)}. Scale proportionally for other sizes. Default channel phone; default time 6:30 PM (1110).
Examples (question => patch):
- "2 extra cooks arrive at 6" => {"summary":"2 extra cooks 6–10 PM.","extraStaff":[{"count":2,"start":1080,"end":1320}]}
${absent ? `- "${absent.name} leaves at 8" => {"summary":"${absent.name} goes home at 8 PM.","staff":[{"worker":"${absent.id}","action":"leave","start":1200}]}\n- "a cook calls out" with no name => {"summary":"${absent.name} is out tonight.","staff":[{"worker":"${absent.id}","action":"absent"}]}` : ""}
${off ? `- "${off.name} comes in at 6" => {"summary":"${off.name} works 6–10 PM.","staff":[{"worker":"${off.id}","action":"add","start":1080,"end":1320}]}` : ""}
- "we're short one person all night" => {"summary":"Short one person all night.","extraStaff":[{"count":-1,"start":960,"end":1320}]}
- "${eqName} goes down at 7 for 40 min" => {"summary":"${eqName} down 7:00–7:40 PM.","equipment":[{"station":"${eqId}","start":1140,"end":1180,"capacity":0}]}
- "add a second ${eqName.toLowerCase()}" => {"summary":"Second ${eqName.toLowerCase()} all night.","addEquipment":[{"station":"${eqId}","capacity":${eqCap}}]}
- "${eqName} runs at half capacity" => {"summary":"${eqName} at half capacity all night.","equipment":[{"station":"${eqId}","start":960,"end":1320,"capacity":${Math.max(1, Math.round(eqCap / 2))}}]}
- "+30% delivery" => {"summary":"Delivery orders +30% all night.","demand":[{"start":960,"end":1320,"channel":"doordash","factor":1.3},{"start":960,"end":1320,"channel":"ubereats","factor":1.3}]}
- "snow keeps people home" => {"summary":"Snow: delivery +15%, walk-ins −40% from 6 PM.","demand":[{"start":1080,"end":1320,"channel":"doordash","factor":1.15},{"start":1080,"end":1320,"channel":"ubereats","factor":1.15},{"start":1080,"end":1320,"channel":"counter","factor":0.6}]}
${anyItem ? `- "take ${anyItem.name.toLowerCase()} off the menu" => {"summary":"${anyItem.name} 86'd tonight.","menu":[{"item":"${anyItem.id}","action":"remove"}]}\n- "${anyItem.name.toLowerCase()} take longer to cook" => {"summary":"${anyItem.name} cook 1.5× slower.","menu":[{"item":"${anyItem.id}","action":"slower","factor":1.5}]}` : ""}
- "pause Uber Eats 7–7:30" => {"summary":"Uber Eats paused 7:00–7:30 PM.","channelPauses":[{"channel":"ubereats","start":1140,"end":1170}]}
- "quote 20 min after 6:45" => {"summary":"Quote 20 min prep from 6:45 PM.","quotedPrep":[{"start":1125,"end":1320,"minutes":20}]}
- "the game goes to overtime" => {"summary":"Overtime: late post-game surge 9–10 PM.","demand":[{"start":1260,"end":1320,"channel":"all","factor":1.25},{"start":1260,"end":1320,"channel":"doordash","factor":1.3}]}
- "sudden rain at 6" => doordash & ubereats 1.15 and counter 0.8 for 1080..1260.
- "close at 9" => channelPauses for all four channels 1260..1320 plus "leave" at 1260 for every worker on shift.
- COMBINATIONS: translate every clause into one patch.
Defaults: equipment "breaks" with no duration => 40 min. Unspecified start => 6 PM (1080) for arrivals and weather, 4 PM (960) for all-night changes. Output JSON only.`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { question?: string; context?: Ctx } | null;
  const q = (body?.question ?? "").trim().slice(0, 300);
  const ctx: Ctx = body?.context && Array.isArray(body.context.menu) && Array.isArray(body.context.workers) ? body.context : defaultCtx();
  const SYSTEM = systemPrompt(ctx);
  if (!q) return NextResponse.json({ error: "empty question" }, { status: 400 });
  const t0 = Date.now();
  try {
    const patch = await chatJSON(ScenarioPatchSchema, SYSTEM, `Question: ${q}`, { model: MODEL_FAST, timeoutMs: 9000, maxTokens: 900 });
    return NextResponse.json({ patch, ms: Date.now() - t0, source: "llm" });
  } catch (e) {
    return NextResponse.json({ patch: null, ms: Date.now() - t0, source: "fallback", error: String(e).slice(0, 160) });
  }
}
