// "Ask anything": the LLM translates a free-text what-if into a typed ScenarioPatch (schema-validated). The simulator runs it.
import { NextResponse } from "next/server";
import { chatJSON, MODEL_FAST } from "@/lib/llm";
import { ScenarioPatchSchema } from "@/plan/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You translate a restaurant owner's what-if question into a JSON "ScenarioPatch" for a kitchen simulator. Times are minutes since midnight (960 = 4:00 PM, 1080 = 6:00 PM, 1110 = 6:30 PM, 1140 = 7:00 PM, 1200 = 8:00 PM, 1320 = 10:00 PM close). Service runs 960..1320; keep every window inside it and end > start.
Schema (all keys optional except summary):
{"summary": string (<=140 chars, plain English restatement, e.g. "Fryer down 7:00–7:40 PM."),
 "demand":[{"start":int,"end":int,"channel":"doordash"|"ubereats"|"phone"|"counter"|"all","factor":number}],   // factor 1.3 = +30%, 0.6 = -40%
 "staff":[{"worker":"maria"|"jake"|"ana"|"sam","action":"absent"|"add"|"late"|"leave","start":int,"end":int}],  // "leave": start = when they go home; "late": start = when they arrive
 "extraStaff":[{"count":int,"start":int,"end":int,"station":"grill"|"fryer"|"cold"|"pack"|"counter"}],  // unnamed extra cooks (count>0) or being short-staffed (count<0, e.g. -1); station optional
 "equipment":[{"station":"grill"|"fryer"|"cold"|"pack"|"counter","start":int,"end":int,"capacity":int}],  // capacity OVERRIDE for the window: 0 = broken, 2 = half the fryer, 3 = half the grill
 "addEquipment":[{"station":...,"capacity":int,"time":int}],  // ADDED capacity from "time" (omit time = all night): a second fryer = fryer +4, a second grill = grill +6
 "menu":[{"item":<id>,"action":"remove"|"boost"|"reduce"|"slower","factor":number}],  // slower: factor = prep-time multiplier (1.5 = takes 50% longer); boost/reduce: popularity multiplier
 "channelPauses":[{"channel":"doordash"|"ubereats"|"phone"|"counter","start":int,"end":int}],
 "quotedPrep":[{"start":int,"end":int,"minutes":int}],
 "layout":[{"station":...,"x":number,"y":number}],  // floor is 12 x 8 m; current: grill (2,1.5), fryer (6,1.5), cold (10,1.5), pack (6,4.5), counter (3,6.5)
 "bigOrders":[{"time":int,"channel":...,"items":[{"item":<id>,"qty":int}]}],
 "unsupported": string  // ONLY if nothing in the question can be modeled: one friendly sentence (<= 40 words) saying what CAN be modeled; never mention minutes-since-midnight or field names}
Menu item ids: burger, double, wings, fries, chicken, tenders, salad, shake, slaw, soda. Workers tonight: maria (4–10 PM, owner), sam (4–10 PM), jake (scheduled 6–10 PM but called out), ana (off, can be called in). Stations: grill (6 slots; the owner may call it the "oven" or "flat top"), fryer (4 baskets), cold (4), pack, counter.
Examples (question => patch):
- "2 extra cooks arrive at 6" => {"summary":"2 extra cooks 6–10 PM.","extraStaff":[{"count":2,"start":1080,"end":1320}]}
- "Ana leaves at 8" => {"summary":"Ana goes home at 8 PM.","staff":[{"worker":"ana","action":"leave","start":1200}]}
- "we're short one person all night" => {"summary":"Short one person all night.","extraStaff":[{"count":-1,"start":960,"end":1320}]}
- "fryer goes down at 7 for 40 min" => {"summary":"Fryer down 7:00–7:40 PM.","equipment":[{"station":"fryer","start":1140,"end":1180,"capacity":0}]}
- "add a second fryer" => {"summary":"Second fryer all night.","addEquipment":[{"station":"fryer","capacity":4}]}
- "oven runs at half capacity" => {"summary":"Grill at half capacity all night.","equipment":[{"station":"grill","start":960,"end":1320,"capacity":3}]}
- "+30% delivery" => {"summary":"Delivery orders +30% all night.","demand":[{"start":960,"end":1320,"channel":"doordash","factor":1.3},{"start":960,"end":1320,"channel":"ubereats","factor":1.3}]}
- "snow keeps people home" => {"summary":"Snow: delivery +15%, walk-ins −40% from 6 PM.","demand":[{"start":1080,"end":1320,"channel":"doordash","factor":1.15},{"start":1080,"end":1320,"channel":"ubereats","factor":1.15},{"start":1080,"end":1320,"channel":"counter","factor":0.6}]}
- "take wings off the menu" => {"summary":"Wings 86'd tonight.","menu":[{"item":"wings","action":"remove"}]}
- "wings take longer to cook" => {"summary":"Wings cook 1.5× slower.","menu":[{"item":"wings","action":"slower","factor":1.5}]}
- "pause Uber Eats 7–7:30" => {"summary":"Uber Eats paused 7:00–7:30 PM.","channelPauses":[{"channel":"ubereats","start":1140,"end":1170}]}
- "quote 20 min after 6:45" => {"summary":"Quote 20 min prep from 6:45 PM.","quotedPrep":[{"start":1125,"end":1320,"minutes":20}]}
- "move the pack station next to the fryer" => {"summary":"Pack station moved next to the fryer.","layout":[{"station":"pack","x":6,"y":2.9}]}
- "the game goes to overtime" => {"summary":"Overtime: late post-game surge 9–10 PM.","demand":[{"start":1260,"end":1320,"channel":"all","factor":1.25},{"start":1260,"end":1320,"channel":"doordash","factor":1.3}]}
- "sudden rain at 6" => doordash & ubereats 1.15 and counter 0.8 for 1080..1260.
- "a 30-person catering order at 6:30" => {"summary":"30-person phone order at 6:30 PM.","bigOrders":[{"time":1110,"channel":"phone","items":[{"item":"wings","qty":15},{"item":"fries","qty":15},{"item":"burger","qty":10}]}]}  (N people => ~N/2 wings, N/2 fries, N/3 burgers)
- "a cook calls out" with no name => staff sam absent.
- COMBINATIONS: translate every clause. "the fryer breaks at 7 and 2 extra cooks arrive at 6, snow all night" => {"summary":"Fryer down 7:00–7:40, 2 extra cooks from 6, snow.","equipment":[{"station":"fryer","start":1140,"end":1180,"capacity":0}],"extraStaff":[{"count":2,"start":1080,"end":1320}],"demand":[{"start":960,"end":1320,"channel":"doordash","factor":1.15},{"start":960,"end":1320,"channel":"ubereats","factor":1.15},{"start":960,"end":1320,"channel":"counter","factor":0.6}]}
Defaults: equipment "breaks" with no duration => 40 min. Unspecified start => 6 PM (1080) for arrivals and weather, 4 PM (960) for all-night changes. Output JSON only.`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { question?: string } | null;
  const q = (body?.question ?? "").trim().slice(0, 300);
  if (!q) return NextResponse.json({ error: "empty question" }, { status: 400 });
  const t0 = Date.now();
  try {
    const patch = await chatJSON(ScenarioPatchSchema, SYSTEM, `Question: ${q}`, { model: MODEL_FAST, timeoutMs: 9000, maxTokens: 900 });
    return NextResponse.json({ patch, ms: Date.now() - t0, source: "llm" });
  } catch (e) {
    return NextResponse.json({ patch: null, ms: Date.now() - t0, source: "fallback", error: String(e).slice(0, 160) });
  }
}
