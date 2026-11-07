// Ask-anything pipeline (client): question -> ScenarioPatch (cache -> LLM -> keyword rules) -> experiment -> answer + recovery plan.
import type { Scenario } from "@/sim/types";
import { fmtClockShort } from "@/sim/types";
import { ScenarioPatchSchema, type AskResult, type ScenarioPatch, type PlanCard } from "./types";
import { applyPatch, fmtRange, patchChips, STATION_LABEL, resolveItemId, resolveWorkerId, splitOrder, stationName, validatePatch } from "./apply";
import { CHANNEL_LABEL } from "@/sim/layout";
import { bottleneckReport } from "./bottleneck";
import { ruleBasedProposals } from "./rules";
import { buildPlan } from "./evaluate";
import { evaluator } from "./run";
import { cachedPatch, likelyQuestions, cateringItems, absentWorker, isOwner } from "@/data/ask-cache";

export interface AskOptions { onStatus?: (m: string) => void; nights?: number; llmTimeoutMs?: number; recovery?: boolean }
/** AskResult plus UI extras: clickable suggestions (unsupported / unknown-name replies) and a no-change explanation. */
export type AskReply = AskResult & { suggestions?: string[]; note?: string };

/** Compact description of the ACTIVE scenario for the LLM translator (ids + names only; no Maria assumptions). */
export function scenarioContext(sc: Scenario) {
  const shift = (w: Scenario["workers"][number]) => (w.shifts.length ? w.shifts.map(s => fmtRange(s.start, s.end)).join(", ") : "off tonight");
  return {
    restaurant: sc.restaurant?.name ?? sc.label, cuisine: sc.restaurant?.cuisine ?? "burgers", hours: sc.restaurant?.hours ?? { open: 960, close: 1320 },
    menu: sc.menu.map(m => ({ id: m.id, name: m.name, popularity: m.popularity, stations: m.stations })),
    workers: sc.workers.map(w => ({ id: w.id, name: w.name, shifts: shift(w), owner: isOwner(sc, w) })),
    stations: sc.stations.map(s => ({ id: s.id, name: s.name, capacity: s.capacity })),
    channelMix: sc.channelMix,
    catering30: cateringItems(sc, 30), dishes100: splitOrder(sc.menu, 100),
  };
}
export type AskContext = ReturnType<typeof scenarioContext>;

export async function runAsk(question: string, base: Scenario, opts: AskOptions = {}): Promise<AskReply> {
  const t0 = Date.now();
  const status = opts.onStatus ?? (() => {});
  const nights = opts.nights ?? 300;
  const examples = likelyQuestions(base).slice(0, 6).map(p => p.question);
  const noop = async (unsupported: string, suggestions: string[], source: AskResult["source"], summary = "Not modeled"): Promise<AskReply> => {
    const baseline = await evaluator(base, nights);
    return { question, patch: { summary, unsupported }, chips: [], baseline, patched: baseline, answer: unsupported, source, ms: Date.now() - t0, suggestions };
  };
  // A named person who is not on staff: answer with real names instead of running a no-op experiment.
  const stranger = unknownPerson(question, base);
  if (stranger) return noop(stranger.text, stranger.suggestions, "rules");
  let patch: ScenarioPatch | null = cachedPatch(question, base);
  let source: AskResult["source"] = patch ? "cache" : "llm";
  if (!patch) {
    status("Translating your question into an experiment…");
    patch = await translateViaLLM(question, base, opts.llmTimeoutMs ?? 9000);
    if (!patch) { patch = keywordPatch(question, base); source = "rules"; }
  }
  if (!patch) return noop(`I couldn't turn that into an experiment. ${CAN_MODEL}`, examples, "rules");
  const v = validatePatch(patch, base);
  patch = v.patch;
  if (v.unknownWorkers.length && !hasChanges(patch)) return noop(unknownStaffText(v.unknownWorkers[0], base), staffSuggestions(base), source);
  if (v.unknownItems.length && !hasChanges(patch)) return noop(`None of these items are on the menu tonight (${v.unknownItems.slice(0, 4).join(", ")}). Tonight's menu: ${base.menu.slice(0, 6).map(m => m.name).join(", ")}.`, examples, source);
  if (patch.unsupported && !hasChanges(patch)) return noop(patch.unsupported, examples, source, patch.summary);
  if (!hasChanges(patch)) return noop(`That didn't describe a change I can test. ${CAN_MODEL}`, examples, source, patch.summary);
  const patched = applyPatch(base, patch);
  if (JSON.stringify(patched) === JSON.stringify(base)) {
    return noop(`This didn't change the simulation: ${whyNoEffect(patch, base, v.dropped)}`, examples, source, patch.summary);
  }
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
  const b = baseline.mean, a = after.mean;
  const negligible = Math.abs(a.coldOrders - b.coldOrders) < 0.5 && Math.abs(a.avgDasherWait - b.avgDasherWait) < 0.05 && Math.abs(a.dollarsAtRisk - b.dollarsAtRisk) < 1;
  const note = negligible ? `This didn't change the numbers: ${whyNoEffect(patch, base, v.dropped)}` : v.dropped.length ? `Ignored: ${v.dropped.join("; ")}.` : undefined;
  const answer = writeAnswer(patch, baseline, after, recovery);
  return { question, patch, chips, baseline, patched: after, answer: note ? `${answer} ${note}` : answer, recovery, source, ms: Date.now() - t0, note };
}

function hasChanges(p: ScenarioPatch) {
  return !!(p.demand?.length || p.staff?.length || p.extraStaff?.length || p.addEquipment?.length || p.equipment?.length || p.menu?.length || p.channelPauses?.length || p.quotedPrep?.length || p.layout?.length || p.bigOrders?.length);
}

const firstName = (w: { name: string }) => w.name.split(/\s+/)[0];
function staffSuggestions(sc: Scenario): string[] {
  const on = sc.workers.filter(w => w.shifts.length).slice(0, 2).map(w => `${firstName(w)} calls out`);
  const off = sc.workers.find(w => !w.shifts.length);
  return [...on, "one cook calls out", ...(off ? [`What if ${firstName(off)} shows up?`] : []), "2 extra cooks come at 6"];
}
function unknownStaffText(who: string, sc: Scenario): string {
  const names = sc.workers.map(firstName);
  const on = sc.workers.filter(w => w.shifts.length).map(firstName);
  const guess = on[on.length - 1] ?? names[0];
  return `There's no ${cap(who)} on staff tonight. Tonight's crew: ${names.join(", ")}. Did you mean ${guess}, or try "one cook calls out"?`;
}
const NOT_NAMES = new Set(["the", "a", "an", "one", "someone", "somebody", "cook", "cooks", "person", "people", "staff", "employee", "employees", "worker", "workers", "server", "servers", "everyone", "nobody", "he", "she", "they", "who", "if", "what", "when", "it", "line", "kitchen", "team", "crew", "guy", "guys", "owner", "chef", "dishwasher", "driver", "dasher", "my", "our", "another", "second", "extra", "more", "i", "we", "you", "customer", "customers"]);
/** "Sam calls out" when there is no Sam: return a friendly reply with real names, or null. */
export function unknownPerson(question: string, sc: Scenario): { text: string; suggestions: string[] } | null {
  const q = question.toLowerCase();
  const m = /\b([a-z]+)\s+(?:is\s+|'s\s+|has\s+)?(calls? out|called out|calls? in sick|sick|absent|no.?shows?|not coming|can'?t (?:make|come)|doesn'?t (?:show|come)|leaves?|leaving|is late|late|shows? up|comes? in|covers?|works?|quits?|stays?)\b/.exec(q);
  if (!m) return null;
  const who = m[1];
  if (NOT_NAMES.has(who) || resolveWorkerId(sc, who)) return null;
  const original = new RegExp(`\\b${who.charAt(0).toUpperCase()}${who.slice(1)}\\b`).test(question);
  if (!original && !/calls? out|called out|sick|no.?show|shows? up/.test(m[2])) return null;
  return { text: unknownStaffText(who, sc), suggestions: staffSuggestions(sc) };
}

/** Plain-English reason a patch produced no change (best effort from the patch + scenario). */
export function whyNoEffect(patch: ScenarioPatch, sc: Scenario, dropped: string[]): string {
  const reasons: string[] = [];
  for (const s of patch.staff ?? []) {
    const w = sc.workers.find(w => w.id === s.worker); if (!w) continue;
    const n = firstName(w);
    if (!w.shifts.length && (s.action === "absent" || s.action === "leave" || s.action === "late")) reasons.push(`${n} isn't scheduled tonight anyway`);
    else if (s.action === "leave" && s.start != null && w.shifts.every(sh => sh.end <= s.start!)) reasons.push(`${n} already goes home by ${fmtClockShort(Math.max(...w.shifts.map(sh => sh.end)))}`);
    else if (s.action === "late" && s.start != null && w.shifts.every(sh => sh.start >= s.start!)) reasons.push(`${n} doesn't start until ${fmtClockShort(Math.min(...w.shifts.map(sh => sh.start)))} anyway`);
    else if (s.action === "add" && w.shifts.some(sh => sh.start <= (s.start ?? 960) && sh.end >= (s.end ?? 1320))) reasons.push(`${n} is already working then`);
  }
  for (const p of patch.channelPauses ?? []) if ((sc.channelMix[p.channel] ?? 0) < 0.01) reasons.push(`there are no ${CHANNEL_LABEL[p.channel]} orders tonight`);
  for (const e of [...(patch.equipment ?? [])]) { const st = sc.stations.find(x => x.id === e.station); if (st && e.capacity >= st.capacity) reasons.push(`the ${st.name.toLowerCase()} already has ${st.capacity} capacity`); if (st && e.capacity === 0) reasons.push(`the ${st.name.toLowerCase()} is barely used ${fmtRange(e.start, e.end)}`); }
  for (const a of patch.addEquipment ?? []) { const st = sc.stations.find(x => x.id === a.station); if (st) reasons.push(`the ${st.name.toLowerCase()} isn't the bottleneck tonight`); }
  for (const d of patch.demand ?? []) if (Math.abs(d.factor - 1) < 0.01) reasons.push("a ×1 demand change is no change");
  for (const m of patch.menu ?? []) if (m.action === "remove" && sc.removedItems.includes(m.item)) reasons.push(`${sc.menu.find(x => x.id === m.item)?.name ?? m.item} is already 86'd`);
  if (dropped.length) reasons.push(dropped.join("; "));
  if (!reasons.length) reasons.push("the kitchen absorbed it within normal night-to-night noise");
  return reasons.join("; ") + ".";
}

async function translateViaLLM(question: string, sc: Scenario, timeoutMs: number): Promise<ScenarioPatch | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, context: scenarioContext(sc) }), signal: ctrl.signal });
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
  return { ...p, demand: win(p.demand), equipment: win(p.equipment), extraStaff: win(p.extraStaff), channelPauses: win(p.channelPauses), quotedPrep: win(p.quotedPrep) };
}

/** What the Ask box can model, for unsupported-question replies. */
export const CAN_MODEL = "I can model: demand changes (+30% delivery, snow, rain, overtime), staff out / added / late / leaving early, extra or missing cooks, equipment breaking or running at half capacity, added equipment (a second fryer), 86'd or slower-cooking items, paused order channels, quoted prep times, moving a station, and one-off catering orders.";

type ItemId = "burger" | "double" | "wings" | "fries" | "chicken" | "tenders" | "salad" | "shake" | "slaw" | "soda";
const ITEM_WORDS: [RegExp, ItemId][] = [[/double/, "double"], [/burger|smash/, "burger"], [/wing/, "wings"], [/fries|fry\b/, "fries"], [/tender/, "tenders"], [/chicken (sandwich|sando)|sandwich|sando|chicken/, "chicken"], [/salad/, "salad"], [/shake/, "shake"], [/slaw/, "slaw"], [/soda|drink/, "soda"]];
const ITEM_NAME: Record<ItemId, string> = { burger: "Burgers", double: "Double Smash", wings: "Wings", fries: "Fries", chicken: "Chicken sandwich", tenders: "Tenders", salad: "Salad", shake: "Shakes", slaw: "Slaw", soda: "Drinks" };
type EquipId = "grill" | "fryer" | "cold" | "pack" | "counter";
const BASE_CAP: Record<EquipId, number> = { grill: 6, fryer: 4, cold: 4, pack: 99, counter: 99 };
const SMALL_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const num = (s: string | undefined) => (s == null ? NaN : /^\d+$/.test(s) ? parseInt(s) : SMALL_NUM[s] ?? NaN);
const parseEquip = (s: string): EquipId | null => (/fryer|frier/.test(s) ? "fryer" : /grill|oven|flat.?top|stove/.test(s) ? "grill" : /cold|fridge|salad station/.test(s) ? "cold" : /pack|expo|pass/.test(s) ? "pack" : /counter|register/.test(s) ? "counter" : null);
const parseItemMaria = (s: string): ItemId | null => ITEM_WORDS.find(([re]) => re.test(s))?.[1] ?? null;
/** Item mentioned in the clause: the active menu's names/ids first (longest match), Maria's words as fallback. */
const parseItem = (s: string, sc?: Scenario): string | null => {
  if (sc) {
    const hits = sc.menu.map(m => { const n = m.name.toLowerCase().replace(/\s*\(.*\)$/, ""); const words = n.split(/[^a-z0-9]+/).filter(w => w.length > 3); const hit = s.includes(n) ? n.length : s.includes(m.id.toLowerCase()) ? m.id.length : words.some(w => new RegExp(`\\b${w}`).test(s)) ? 1 : 0; return { id: m.id, hit }; }).filter(h => h.hit > 0).sort((a, b) => b.hit - a.hit);
    if (hits.length) return hits[0].id;
  }
  return parseItemMaria(s);
};
const itemName = (sc: Scenario | undefined, id: string) => sc?.menu.find(m => m.id === id)?.name ?? ITEM_NAME[id as ItemId] ?? id;
const parseEquipSc = (s: string, sc?: Scenario): EquipId | null => { if (sc) { const hit = sc.stations.map(st => ({ id: st.id, n: st.name.toLowerCase().replace(/\s*\/.*$/, "") })).filter(st => st.n.length > 2 && s.includes(st.n)).sort((a, b) => b.n.length - a.n.length)[0]; if (hit) return hit.id; } return parseEquip(s); };
const baseCap = (sc: Scenario | undefined, id: EquipId) => sc?.stations.find(st => st.id === id)?.capacity ?? BASE_CAP[id];
const DEFAULT_POS: Record<EquipId, { x: number; y: number }> = { grill: { x: 2, y: 1.5 }, fryer: { x: 6, y: 1.5 }, cold: { x: 10, y: 1.5 }, pack: { x: 6, y: 4.5 }, counter: { x: 3, y: 6.5 } };

/** Deterministic fallback translator (scenario-aware: real menu, staff and equipment names when `sc` is given).
 * Deterministic fallback translator for common phrasings when the LLM is unavailable. Clauses joined by "and"/","/";" are translated separately and merged. */
export function keywordPatch(q: string, sc?: Scenario): ScenarioPatch | null {
  const clauses = q.toLowerCase().split(/(?:,|;|\band\b|\bplus\b|\bwhile\b|\balso\b)\s+/).map(c => c.trim()).filter(c => c.length > 2);
  const parts = (clauses.length > 1 ? clauses : [q.toLowerCase()]).map(c => clausePatch(c, sc)).filter((p): p is ScenarioPatch => !!p);
  if (!parts.length) return clauses.length > 1 ? clausePatch(q.toLowerCase(), sc) : null;
  if (parts.length === 1) return parts[0];
  const out: ScenarioPatch = { summary: parts.map(p => p.summary.replace(/\.$/, "")).join("; ").slice(0, 140) };
  const keys = ["demand", "staff", "extraStaff", "addEquipment", "equipment", "menu", "channelPauses", "quotedPrep", "layout", "bigOrders"] as const;
  for (const k of keys) {
    const merged = parts.flatMap(p => (p[k] ?? []) as unknown[]);
    if (merged.length) (out as Record<string, unknown>)[k] = merged;
  }
  return out;
}

function clausePatch(s: string, sc?: Scenario): ScenarioPatch | null {
  const time = parseTime(s);
  const range = parseRange(s);
  const equip = parseEquipSc(s, sc);
  const item = parseItem(s, sc);
  const lbl = (id: EquipId) => stationName(sc, id);
  // --- equipment ---
  if (equip && /(break|broke|down|die|dead|fail|out of (order|service)|stops? working|quit)/.test(s) && !/take|86|menu/.test(s)) {
    const st = range?.start ?? time ?? 1140; const dur = parseDuration(s) ?? 40; const en = range?.end ?? Math.min(1320, st + dur);
    return { summary: `${lbl(equip)} down ${fmtClockShort(st)}–${fmtClockShort(en)}.`, equipment: [{ station: equip, start: st, end: en, capacity: 0 }] };
  }
  if (equip && /(half|50 ?%|reduced|limp)/.test(s) && /(capacity|speed|power|strength)|half/.test(s)) {
    const st = range?.start ?? time ?? 960; const en = range?.end ?? 1320; const cap = Math.max(1, Math.round(baseCap(sc, equip) / 2));
    return { summary: `${lbl(equip)} at half capacity ${st <= 960 && en >= 1320 ? "all night" : fmtRange(st, en)}.`, equipment: [{ station: equip, start: st, end: en, capacity: cap }] };
  }
  if (equip && /(second|another|extra|additional|add(ed)?|rent|borrow|bring in|2nd)/.test(s) && !/(cook|people|person|staff|hand|worker|employee)/.test(s)) {
    const cap = equip === "pack" || equip === "counter" ? 1 : Math.min(12, baseCap(sc, equip));
    return { summary: `Second ${lbl(equip).toLowerCase()} ${time ? `from ${fmtClockShort(time)}` : "all night"}.`, addEquipment: [{ station: equip, capacity: cap, ...(time ? { time } : {}) }] };
  }
  // --- layout ---
  const mv = /(move|put|place|relocate)\s+(the\s+)?(pack|expo|pass|grill|fryer|cold|counter)\b.*?(next to|beside|by|closer to|near)\s+(the\s+)?(pack|expo|pass|grill|fryer|cold|counter)/.exec(s);
  if (mv) {
    const a = parseEquip(mv[3])!, b = parseEquip(mv[6])!;
    if (a !== b) {
      const tgt = sc?.stations.find(x => x.id === b) ?? DEFAULT_POS[b];
      // park it on the free side of the target (below the back line, above the front counter)
      const x = Math.max(2, Math.min(10, tgt.x));
      const y = Math.max(0.5, Math.min(7.5, tgt.y < 4 ? tgt.y + 1.4 : tgt.y - 1.4));
      return { summary: `${STATION_LABEL[a]} moved next to the ${STATION_LABEL[b].toLowerCase()}.`, layout: [{ station: a, x, y }] };
    }
  }
  // --- weather / demand ---
  if (/snow|blizzard|ice storm|sleet/.test(s)) { const st = time ?? 1080; return { summary: `Snow from ${fmtClockShort(st)}: more delivery, far fewer walk-ins.`, demand: [{ start: st, end: 1320, channel: "doordash", factor: 1.15 }, { start: st, end: 1320, channel: "ubereats", factor: 1.15 }, { start: st, end: 1320, channel: "counter", factor: 0.6 }] }; }
  if (/rain|storm|pour/.test(s)) { const st = time ?? 1080; const en = Math.max(1260, Math.min(1320, st + 60)); return { summary: `Rain from ${fmtClockShort(st)}: more delivery, fewer walk-ins.`, demand: [{ start: st, end: en, channel: "doordash", factor: 1.15 }, { start: st, end: en, channel: "ubereats", factor: 1.15 }, { start: st, end: en, channel: "counter", factor: 0.8 }] }; }
  if (/overtime/.test(s)) return { summary: "Overtime: late post-game surge 9–10 PM.", demand: [{ start: 1260, end: 1320, channel: "all", factor: 1.25 }] };
  // --- extra / missing unnamed staff ---
  const ex = /(\d+|one|two|three|four|a|an)\s+(extra|more|additional|new)\s+(cooks?|people|person|employees?|staff|hands?|workers?|bod(y|ies)|guys?)/.exec(s) ?? /(extra|additional)\s+(\d+|one|two|three|four)\s+(cooks?|people|person|employees?|staff|hands?|workers?)/.exec(s);
  if (ex) {
    const n = Math.min(6, Math.max(1, num(ex[1]) || num(ex[2]) || 1));
    const st = range?.start ?? time ?? 1080; const en = range?.end ?? 1320;
    const station = /on the (grill|fryer|cold|pack|counter)|for the (grill|fryer)/.exec(s);
    const stId = station ? parseEquip(station[0]) : null;
    return { summary: `${n} extra ${n === 1 ? "cook" : "cooks"} ${fmtClockShort(st)}–${fmtClockShort(en)}.`, extraStaff: [{ count: n, start: st, end: en, ...(stId ? { station: stId } : {}) }] };
  }
  const sh = /short[- ]?(staffed|handed)|short\s+(a|an|one|two|three|\d)\s+(person|people|cook|cooks|hand|hands|body|bodies|guy|guys)|(a|one|two|\d)\s+(person|people|cook|cooks|hand|hands|man|men)\s+(short|down)|down\s+(a|an|one|two|\d)\s+(person|people|cook|cooks|hand)/.exec(s);
  if (sh) {
    const n = Math.min(4, Math.max(1, num(sh[2]) || num(sh[4]) || num(sh[7]) || 1));
    const st = range?.start ?? time ?? 960; const en = range?.end ?? 1320;
    return { summary: `Short ${n} ${n === 1 ? "person" : "people"} ${st <= 960 && en >= 1320 ? "all night" : fmtRange(st, en)}.`, extraStaff: [{ count: -n, start: st, end: en }] };
  }
  // --- catering / big orders (split by THIS menu's popularity) ---
  const m = /(\d+)[- ]?(person|people|ppl|top|guests?|heads?)/.exec(s);
  const dishes = /(\d+)[- ]?(dish(es)?|items?|plates?|meals?|bowls?|pies?|tacos?|orders? of)/.exec(s);
  if (m || dishes || /cater|big order|large order|party order|phone order/.test(s)) {
    const people = m ? parseInt(m[1]) : null; const total = dishes ? parseInt(dishes[1]) : null;
    const st = time ?? (/\bat 8\b/.test(s) ? 1200 : 1110);
    const ch = /doordash|door dash/.test(s) ? "doordash" : /uber/.test(s) ? "ubereats" : /counter|walk/.test(s) ? "counter" : "phone";
    const items = people != null ? (sc ? cateringItems(sc, people) : [{ item: "wings", qty: Math.ceil(people / 2) }, { item: "fries", qty: Math.ceil(people / 2) }, { item: "burger", qty: Math.ceil(people / 3) }]) : total != null ? (sc ? splitOrder(sc.menu, Math.min(400, total)) : [{ item: "wings", qty: Math.ceil(total * 0.35) }, { item: "fries", qty: Math.ceil(total * 0.35) }, { item: "burger", qty: Math.ceil(total * 0.3) }]) : (sc ? cateringItems(sc, 30) : [{ item: "wings", qty: 15 }, { item: "fries", qty: 15 }, { item: "burger", qty: 10 }]);
    const label = people != null ? `${people}-person order` : total != null ? `${total}-dish order` : "Catering order";
    return { summary: `${label} at ${fmtClockShort(st)} (${CHANNEL_LABEL[ch]}).`, bigOrders: [{ time: st, channel: ch, items: items.map(i => ({ item: i.item, qty: Math.max(1, Math.min(100, i.qty)) })) }] };
  }
  // --- closing early ---
  const cl = /\bclos(?:e|es|ing)\s+(?:early\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(pm)?/.exec(s);
  if (cl && !equip && !/doordash|uber|phone|counter|walk/.test(s)) {
    const at = toMinutes(parseInt(cl[1]), cl[2] ? parseInt(cl[2]) : 0, cl[3]) ?? 1260;
    const staff = (sc?.workers ?? []).filter(w => w.shifts.some(sh => sh.end > at)).slice(0, 6).map(w => ({ worker: w.id, action: "leave" as const, start: at }));
    return { summary: `Close at ${fmtClockShort(at)}: no orders after, everyone goes home.`, channelPauses: (["doordash", "ubereats", "phone", "counter"] as const).map(c => ({ channel: c, start: at, end: 1320 })), ...(staff.length ? { staff } : {}) };
  }
  // --- named staff ---
  const names = sc ? sc.workers.map(w => w.name.split(/\s+/)[0].toLowerCase()).filter(n => n.length > 1) : ["maria", "sam", "jake", "ana"];
  const whoName = names.find(n => new RegExp(`\\b${n}\\b`).test(s));
  const who = whoName ? (sc ? resolveWorkerId(sc, whoName) ?? whoName : whoName) : undefined;
  const whoCap = whoName ? cap(whoName) : "";
  const fallbackAbsent = sc ? absentWorker(sc) : null;
  if (who && /(late|running behind|delayed)/.test(s)) { const st = time ?? 1080; return { summary: `${whoCap} is late until ${fmtClockShort(st)}.`, staff: [{ worker: who, action: "late", start: st }] }; }
  if (who && /(leave|leaves|leaving|left|go(es)? home|has to go|clock(s)? out|out at|off at)/.test(s) && !/(call(s|ed)? out)/.test(s)) { const at = time ?? 1200; return { summary: `${whoCap} leaves at ${fmtClockShort(at)}.`, staff: [{ worker: who, action: "leave", start: at }] }; }
  if (/(call(s|ed)? out|sick|absent|no.?show|quit|doesn'?t (show|come)|can'?t (make|come)|not coming)/.test(s)) { const id = who ?? fallbackAbsent?.id ?? "sam"; const nm = who ? whoCap : (fallbackAbsent?.name.split(/\s+/)[0] ?? "Sam"); return { summary: `${nm} is out tonight.`, staff: [{ worker: id, action: "absent" }] }; }
  if (who && /(show|come|add|call in|cover|extra|work|help|join|arrive|stay)/.test(s)) { const st = range?.start ?? time ?? 1080; const en = range?.end ?? 1320; return { summary: `${whoCap} works ${fmtClockShort(st)}–${fmtClockShort(en)}.`, staff: [{ worker: who, action: "add", start: st, end: en }] }; }
  // --- channels ---
  const ch = /doordash|door dash|uber|phone|counter|walk/.exec(s)?.[0];
  if (ch && /(stop|pause|turn off|close|shut|no |off |hold)/.test(s)) {
    const c = ch.startsWith("uber") ? "ubereats" : ch.startsWith("walk") ? "counter" : ch.startsWith("door") ? "doordash" : ch as "phone" | "counter";
    const st = range?.start ?? time ?? 1110; const en = range?.end ?? (parseDuration(s) ? Math.min(1320, st + parseDuration(s)!) : 1320);
    return { summary: en >= 1320 ? `${CHANNEL_LABEL[c]} paused from ${fmtClockShort(st)}.` : `${CHANNEL_LABEL[c]} paused ${fmtRange(st, en)}.`, channelPauses: [{ channel: c, start: st, end: en }] };
  }
  // --- quoted prep ---
  const q2 = /quot\w*\D*(\d{1,2})/.exec(s);
  if (q2) {
    const mins = Math.max(8, Math.min(60, parseInt(q2[1])));
    const st = range?.start ?? (/(after|from|starting|past)/.test(s) ? time : null) ?? 960; const en = range?.end ?? 1320;
    return { summary: st <= 960 && en >= 1320 ? `Quote ${mins} min all night.` : `Quote ${mins} min ${st > 960 && en >= 1320 ? `after ${fmtClockShort(st)}` : fmtRange(st, en)}.`, quotedPrep: [{ start: st, end: en, minutes: mins }] };
  }
  // --- menu ---
  if (item && /(take .* off|86|eighty.?six|remove|drop|pull|no \w+ tonight|out of|stop (selling|serving)|off the menu)/.test(s)) return { summary: `${itemName(sc, item)} removed tonight.`, menu: [{ item, action: "remove" }] };
  if (item && /(take[s]? longer|taking longer|slower|slow(ly)?|longer to cook|extra time)/.test(s)) {
    const f = /(\d(?:\.\d)?)\s*(x|×|times)/.exec(s); const pm = /(\d{1,3})\s*%\s*(longer|slower)/.exec(s);
    const factor = f ? Math.min(5, Math.max(1, parseFloat(f[1]))) : pm ? Math.min(5, 1 + parseInt(pm[1]) / 100) : /twice|double/.test(s) ? 2 : 1.5;
    return { summary: `${itemName(sc, item)} cook ${trimNum(factor)}× slower tonight.`, menu: [{ item, action: "slower", factor }] };
  }
  if (item && /(popular|sell(s|ing)? (more|like)|boost|push|special|promo|everyone (orders|wants))/.test(s)) return { summary: `${itemName(sc, item)} 1.5× more popular.`, menu: [{ item, action: "boost", factor: 1.5 }] };
  // --- demand % ---
  const pct = /(\+|plus|up|more|extra)\s*(\d{1,3})\s*%|(\d{1,3})\s*%\s*(more|busier|up|higher|increase)/.exec(s);
  const down = /(-|−|minus|down|fewer|less)\s*(\d{1,3})\s*%|(\d{1,3})\s*%\s*(fewer|less|slower|quieter|down|drop)/.exec(s);
  if (pct || down) {
    const p = parseInt((pct ?? down)![2] ?? (pct ?? down)![3]) * (pct ? 1 : -1);
    const factor = Math.max(0, Math.min(3, 1 + p / 100));
    const st = range?.start ?? time ?? (p > 0 ? 1080 : 960); const en = range?.end ?? 1320;
    const label = `${p > 0 ? "+" : "−"}${Math.abs(p)}%`;
    if (/deliver|doordash|door dash|uber|app/.test(s)) return { summary: `Delivery ${label} ${fmtRange(st, en)}.`, demand: [{ start: st, end: en, channel: "doordash", factor }, { start: st, end: en, channel: "ubereats", factor }] };
    if (/walk|counter|dine|in.?store/.test(s)) return { summary: `Walk-ins ${label} ${fmtRange(st, en)}.`, demand: [{ start: st, end: en, channel: "counter", factor }] };
    if (/phone/.test(s)) return { summary: `Phone orders ${label} ${fmtRange(st, en)}.`, demand: [{ start: st, end: en, channel: "phone", factor }] };
    return { summary: `Demand ${label} all channels ${fmtRange(st, en)}.`, demand: [{ start: st, end: en, channel: "all", factor }] };
  }
  if (/(slammed|packed|way busier|much busier|twice as busy|double the (orders|demand|business))/.test(s)) { const st = time ?? 1080; return { summary: `Demand +50% all channels from ${fmtClockShort(st)}.`, demand: [{ start: st, end: 1320, channel: "all", factor: 1.5 }] }; }
  if (/(dead|slow night|quiet|nobody comes)/.test(s) && !item && !equip) { const st = time ?? 960; return { summary: `Demand −30% all channels from ${fmtClockShort(st)}.`, demand: [{ start: st, end: 1320, channel: "all", factor: 0.7 }] }; }
  return null;
}

const TIME_RE = /(?:\b|@)(\d{1,2})(?::(\d{2}))?\s*(pm|am|p\.m\.|a\.m\.|o'?clock)?\b/g;
const STRIP_RE = /\d+[- ]?(person|people|ppl|%|min(ute)?s?|x\b|×|times|extra|more|cooks?|guests?|heads?|top)/g;
function toMinutes(h: number, mm: number, suffix?: string): number | null {
  const pm = suffix?.startsWith("p"), am = suffix?.startsWith("a");
  if (h <= 12 && !am && (pm || h < 12)) h += 12;
  const t = h * 60 + mm;
  return t >= 960 && t <= 1320 ? t : null;
}
function parseTime(s: string): number | null {
  const clean = s.replace(STRIP_RE, " ").replace(/(\d)\s*(?:-|–|to|until|till|through)\s*(\d)/g, "$1 $2");
  const all = [...clean.matchAll(TIME_RE)].map(m => ({ idx: m.index ?? 0, t: toMinutes(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, m[3]) })).filter(x => x.t != null) as { idx: number; t: number }[];
  if (!all.length) return null;
  const anchored = all.find(x => /(at|from|after|by|until|till|around|starting|@)\s*$/.test(clean.slice(Math.max(0, x.idx - 10), x.idx)));
  return (anchored ?? all[0]).t;
}
/** "7–7:30", "7 to 7:45", "from 6 until 8" -> {start, end} when both parse and end > start. */
function parseRange(s: string): { start: number; end: number } | null {
  const clean = s.replace(STRIP_RE, " ");
  const m = /(\d{1,2})(?::(\d{2}))?\s*(pm|am)?\s*(?:-|–|to|until|till|through)\s*(\d{1,2})(?::(\d{2}))?\s*(pm|am)?/.exec(clean);
  if (!m) return null;
  const a = toMinutes(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, m[3] ?? m[6]); const b = toMinutes(parseInt(m[4]), m[5] ? parseInt(m[5]) : 0, m[6]);
  return a != null && b != null && b > a ? { start: a, end: b } : null;
}
/** "for 40 min", "for an hour", "for 2 hours" -> minutes */
function parseDuration(s: string): number | null {
  const m = /for\s+(?:about\s+)?(\d+|an?|half an?|one|two|three)\s*(min(ute)?s?|hours?|hrs?|h\b)/.exec(s);
  if (!m) return null;
  const n = /half/.test(m[1]) ? 0.5 : (num(m[1].replace(/^an?$/, "a")) || 1);
  return Math.round(/^h/.test(m[2]) ? n * 60 : n);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const trimNum = (n: number) => (Math.round(n * 100) / 100).toString();

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
