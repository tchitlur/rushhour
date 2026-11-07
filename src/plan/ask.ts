// Ask-anything pipeline (client): question -> ScenarioPatch (cache -> LLM -> keyword rules) -> experiment -> answer + recovery plan.
import type { Scenario } from "@/sim/types";
import { fmtClockShort } from "@/sim/types";
import { ScenarioPatchSchema, type AskResult, type ScenarioPatch, type PlanCard } from "./types";
import { applyPatch, patchChips } from "./apply";
import { bottleneckReport } from "./bottleneck";
import { ruleBasedProposals } from "./rules";
import { buildPlan } from "./evaluate";
import { evaluator } from "./run";
import { cachedPatch } from "@/data/ask-cache";

export interface AskOptions { onStatus?: (m: string) => void; nights?: number; llmTimeoutMs?: number; recovery?: boolean }

export async function runAsk(question: string, base: Scenario, opts: AskOptions = {}): Promise<AskResult> {
  const t0 = Date.now();
  const status = opts.onStatus ?? (() => {});
  const nights = opts.nights ?? 300;
  let patch: ScenarioPatch | null = cachedPatch(question);
  let source: AskResult["source"] = patch ? "cache" : "llm";
  if (!patch) {
    status("Translating your question into an experiment…");
    patch = await translateViaLLM(question, opts.llmTimeoutMs ?? 9000);
    if (!patch) { patch = keywordPatch(question); source = "rules"; }
  }
  if (!patch) {
    return { question, patch: { summary: "Not modeled", unsupported: "I couldn't turn that into an experiment. I can model: demand changes, staff absent/added/late, equipment outages, 86'd items, channel pauses, quoted prep time, layout moves, and one-off big orders." }, chips: [], baseline: await evaluator(base, nights), patched: await evaluator(base, nights), answer: "", source: "rules", ms: Date.now() - t0 };
  }
  if (patch.unsupported && !hasChanges(patch)) {
    const baseline = await evaluator(base, nights);
    return { question, patch, chips: [], baseline, patched: baseline, answer: patch.unsupported, source, ms: Date.now() - t0 };
  }
  const patched = applyPatch(base, patch);
  status(`Running the experiment on ${nights} versions of tonight…`);
  const [baseline, after] = await Promise.all([evaluator(base, nights), evaluator(patched, nights)]);
  const chips = patchChips(patch, base);
  let recovery: PlanCard[] | undefined;
  if (opts.recovery !== false) {
    status("Testing a recovery plan…");
    try {
      const report = bottleneckReport(after, patched);
      const plan = await buildPlan(patched, ruleBasedProposals(patched, report).slice(0, 5), evaluator, 120, { screenNights: 60 });
      recovery = plan.cards.filter(c => c.accepted).sort((a, b) => b.evidence.netDollars - a.evidence.netDollars).slice(0, 3);
    } catch { recovery = undefined; }
  }
  const answer = writeAnswer(patch, baseline, after, recovery);
  return { question, patch, chips, baseline, patched: after, answer, recovery, source, ms: Date.now() - t0 };
}

function hasChanges(p: ScenarioPatch) {
  return !!(p.demand?.length || p.staff?.length || p.equipment?.length || p.menu?.length || p.channelPauses?.length || p.quotedPrep?.length || p.layout?.length || p.bigOrders?.length);
}

async function translateViaLLM(question: string, timeoutMs: number): Promise<ScenarioPatch | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }), signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    const parsed = ScenarioPatchSchema.safeParse(j.patch);
    if (!parsed.success) return null;
    return sanitize(parsed.data);
  } catch { return null; }
}

function sanitize(p: ScenarioPatch): ScenarioPatch {
  const win = <T extends { start: number; end: number }>(xs?: T[]) => xs?.filter(x => x.end > x.start).map(x => ({ ...x, start: Math.max(960, Math.min(1320, x.start)), end: Math.max(960, Math.min(1320, x.end)) }));
  return { ...p, demand: win(p.demand), equipment: win(p.equipment), channelPauses: win(p.channelPauses), quotedPrep: win(p.quotedPrep) };
}

/** Deterministic fallback translator for common phrasings when the LLM is unavailable. */
export function keywordPatch(q: string): ScenarioPatch | null {
  const s = q.toLowerCase();
  const time = parseTime(s);
  if (/fryer/.test(s) && /(break|down|die|fail|out)/.test(s)) { const st = time ?? 1140; return { summary: `Fryer down ${fmtClockShort(st)}–${fmtClockShort(st + 40)}.`, equipment: [{ station: "fryer", start: st, end: Math.min(1320, st + 40), capacity: 0 }] }; }
  if (/grill/.test(s) && /(break|down|die|fail|out)/.test(s)) { const st = time ?? 1140; return { summary: `Grill down ${fmtClockShort(st)}–${fmtClockShort(st + 40)}.`, equipment: [{ station: "grill", start: st, end: Math.min(1320, st + 40), capacity: 0 }] }; }
  if (/rain|storm|pour/.test(s)) { const st = time ?? 1080; return { summary: `Rain from ${fmtClockShort(st)}: more delivery, fewer walk-ins.`, demand: [{ start: st, end: 1260, channel: "doordash", factor: 1.15 }, { start: st, end: 1260, channel: "ubereats", factor: 1.15 }, { start: st, end: 1260, channel: "counter", factor: 0.8 }] }; }
  if (/overtime/.test(s)) return { summary: "Overtime: late post-game surge 9–10 PM.", demand: [{ start: 1260, end: 1320, channel: "all", factor: 1.25 }] };
  const m = /(\d+)[- ]?(person|people|ppl)/.exec(s);
  if (m || /cater/.test(s)) { const n = m ? parseInt(m[1]) : 30; const st = time ?? 1110; return { summary: `${n}-person order at ${fmtClockShort(st)}.`, bigOrders: [{ time: st, channel: "phone", items: [{ item: "wings", qty: Math.ceil(n / 2) }, { item: "fries", qty: Math.ceil(n / 2) }, { item: "burger", qty: Math.ceil(n / 3) }] }] }; }
  const who = /maria|sam|jake|ana/.exec(s)?.[0] as "maria" | "sam" | "jake" | "ana" | undefined;
  if (/(call(s|ed)? out|sick|absent|no.?show|quit)/.test(s)) return { summary: `${cap(who ?? "sam")} is out tonight.`, staff: [{ worker: who ?? "sam", action: "absent" }] };
  if (who && /(show|come|add|call in|cover|extra)/.test(s)) { const st = time ?? 1080; return { summary: `${cap(who)} works ${fmtClockShort(st)}–10 PM.`, staff: [{ worker: who, action: "add", start: st, end: 1320 }] }; }
  const ch = /doordash|uber|phone|counter|walk/.exec(s)?.[0];
  if (ch && /(stop|pause|turn off|close|no )/.test(s)) { const c = ch.startsWith("uber") ? "ubereats" : ch.startsWith("walk") ? "counter" : ch as "doordash" | "phone" | "counter"; const st = time ?? 1110; return { summary: `${c} paused from ${fmtClockShort(st)}.`, channelPauses: [{ channel: c, start: st, end: 1320 }] }; }
  const q2 = /quote\D*(\d{1,2})/.exec(s);
  if (q2) return { summary: `Quote ${q2[1]} min all night.`, quotedPrep: [{ start: 960, end: 1320, minutes: Math.max(8, Math.min(60, parseInt(q2[1]))) }] };
  if (/86|remove|no wings|drop/.test(s) && /wing/.test(s)) return { summary: "Wings removed tonight.", menu: [{ item: "wings", action: "remove" }] };
  const pct = /(\+|plus|up|more)\s*(\d{1,3})\s*%|(\d{1,3})\s*%\s*(more|busier|up)/.exec(s);
  if (pct) { const p = parseInt(pct[2] ?? pct[3]); return { summary: `Demand +${p}% all channels.`, demand: [{ start: time ?? 1080, end: 1320, channel: "all", factor: 1 + p / 100 }] }; }
  return null;
}

function parseTime(s: string): number | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(pm|am)?/.exec(s.replace(/\d+[- ]?(person|people|ppl|%|min)/g, ""));
  if (!m) return null;
  let h = parseInt(m[1]); const mm = m[2] ? parseInt(m[2]) : 0;
  if (h <= 12 && (m[3] === "pm" || (!m[3] && h < 12))) h += 12;
  const t = h * 60 + mm;
  return t >= 960 && t <= 1320 ? t : null;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function writeAnswer(patch: ScenarioPatch, before: AskResult["baseline"], after: AskResult["patched"], recovery?: PlanCard[]): string {
  const b = before.mean, a = after.mean;
  const dWait = a.avgDasherWait - b.avgDasherWait, dRisk = a.dollarsAtRisk - b.dollarsAtRisk, dCold = a.coldOrders - b.coldOrders;
  const dir = (x: number, good: boolean) => (x > 0.05 ? (good ? "up" : "worse") : x < -0.05 ? (good ? "down" : "better") : "about the same");
  const parts = [`Dasher wait ${b.avgDasherWait.toFixed(1)} → ${a.avgDasherWait.toFixed(1)} min (${dir(dWait, true)}), cold orders ${b.coldOrders.toFixed(0)} → ${a.coldOrders.toFixed(0)}, dollars at risk $${Math.round(b.dollarsAtRisk)} → $${Math.round(a.dollarsAtRisk)} (${dRisk >= 0 ? "+" : "−"}$${Math.abs(Math.round(dRisk))}).`];
  if (Math.abs(dCold) < 0.5 && Math.abs(dWait) < 0.3 && Math.abs(dRisk) < 15) parts.push("Net effect: negligible.");
  if (recovery?.length) parts.push(`Recovery: ${recovery.map(c => `${c.title} (wait → ${c.evidence.after.avgDasherWait.toFixed(1)} min, protects $${Math.round(c.evidence.protectedDollars)} for ${c.costLabel})`).join("; ")}.`);
  else if (dRisk > 15) parts.push("No tested fix pays for itself under this scenario.");
  return parts.join(" ");
}
