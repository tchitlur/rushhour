// Scenario-derived presets: curveballs, likely questions and cached translations (question -> ScenarioPatch).
// Everything is GENERATED from the active scenario (real staff names, real equipment names, real menu).
// Maria's four curveballs keep their exact labels and patches so her numbers never change.
import type { Scenario, StationId, Worker } from "@/sim/types";
import type { ScenarioPatch } from "@/plan/types";
import { splitOrder } from "@/plan/apply";

export interface Preset { label: string; question: string; patch: ScenarioPatch }

const first = (w: Worker) => w.name.split(/\s+/)[0];
const avgSkill = (w: Worker) => { const v = Object.values(w.skills); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
const onShiftAt = (w: Worker, t: number) => w.shifts.some(s => s.start <= t && s.end > t);
export const isOwner = (sc: Scenario, w: Worker) => w.wage === 0 || sc.workers[0]?.id === w.id;
/** Maria's menu (wings / fries / burger) -> keep her hard-coded catering split. */
export const isMariaMenu = (sc: Scenario) => ["wings", "fries", "burger"].every(id => sc.menu.some(m => m.id === id));

/** The cook who "calls out": restaurant.demoAbsent if on shift, else the lowest-skill on-shift non-owner (Sam for Maria), else anyone on shift. */
export function absentWorker(sc: Scenario): Worker | null {
  const demo = sc.restaurant?.demoAbsent ? sc.workers.find(w => w.id === sc.restaurant!.demoAbsent && w.shifts.length) : undefined;
  if (demo) return demo;
  const sam = sc.workers.find(w => w.id === "sam" && w.shifts.length);
  if (isMariaMenu(sc) && sam) return sam; // Maria's demo: keep Sam so her numbers don't change
  const on = sc.workers.filter(w => w.shifts.length);
  const nonOwner = on.filter(w => !isOwner(sc, w)).sort((a, b) => avgSkill(a) - avgSkill(b));
  return nonOwner[0] ?? on[0] ?? sc.workers[0] ?? null;
}
/** The on-shift non-owner who is still working at 8 PM (for "X leaves at 8"). */
export function leaveWorker(sc: Scenario): Worker | null {
  const c = sc.workers.filter(w => onShiftAt(w, 1200) && !isOwner(sc, w));
  return c[0] ?? sc.workers.find(w => onShiftAt(w, 1200)) ?? null;
}
/** Worker with no shift tonight (can be called in). */
export const offWorker = (sc: Scenario): Worker | null => sc.workers.find(w => !w.shifts.length) ?? null;
/** Bottleneck-ish equipment: the lowest-capacity cooking slot (grill vs fryer). */
export function bottleneckStation(sc: Scenario): { id: StationId; name: string; capacity: number } {
  const cook = sc.stations.filter(s => s.id === "grill" || s.id === "fryer");
  const st = [...cook].sort((a, b) => a.capacity - b.capacity)[0] ?? sc.stations[0];
  return { id: st.id, name: st.name, capacity: st.capacity };
}
/** Most popular cooked items (for "X takes longer", "86 the X"). */
export function hotItems(sc: Scenario) {
  const hot = sc.menu.filter(m => m.stations.some(s => s === "grill" || s === "fryer"));
  return [...(hot.length ? hot : sc.menu)].sort((a, b) => b.popularity - a.popularity);
}
/** A catering order for `people` guests, split by this menu's popularity (Maria: wings N/2, fries N/2, burgers N/3). */
export function cateringItems(sc: Scenario, people: number): { item: string; qty: number }[] {
  if (isMariaMenu(sc)) return [{ item: "wings", qty: Math.ceil(people / 2) }, { item: "fries", qty: Math.ceil(people / 2) }, { item: "burger", qty: Math.ceil(people / 3) }];
  return splitOrder(sc.menu, Math.round((people * 4) / 3));
}
const lc = (s: string) => s.toLowerCase();

export function curveballs(sc: Scenario): Preset[] {
  const cook = absentWorker(sc);
  const owner = sc.workers.find(w => isOwner(sc, w) && w.id !== cook?.id);
  const cookName = cook ? first(cook) : "A cook";
  return [
    {
      label: "Cook calls out",
      question: `${cookName} calls out sick tonight`,
      patch: { summary: `${cookName} is out all night${owner ? `; ${first(owner)} runs the kitchen ${sc.workers.filter(w => w.shifts.length).length <= 2 ? "alone" : "short-handed"}` : ""}.`, staff: [{ worker: cook?.id ?? "sam", action: "absent" }] },
    },
    {
      label: "Game goes to overtime",
      question: "The game goes to overtime",
      patch: { summary: "Overtime: the post-game surge comes late and bigger, 9–10 PM.", demand: [{ start: 1260, end: 1320, channel: "all", factor: 1.5 }, { start: 1260, end: 1320, channel: "doordash", factor: 1.2 }] },
    },
    {
      label: "Sudden rain",
      question: "It starts pouring at 6 PM",
      patch: { summary: "Rain 6–9 PM: more delivery, fewer walk-ins.", demand: [{ start: 1080, end: 1260, channel: "doordash", factor: 1.15 }, { start: 1080, end: 1260, channel: "ubereats", factor: 1.15 }, { start: 1080, end: 1260, channel: "counter", factor: 0.8 }] },
    },
    {
      label: "30-person catering at 6:30",
      question: "A 30-person catering order comes in at 6:30",
      patch: { summary: "One 30-person phone order at 6:30 PM lands on top of the rush.", bigOrders: [{ time: 1110, channel: "phone", items: cateringItems(sc, 30) }] },
    },
  ];
}

export function likelyQuestions(sc: Scenario): Preset[] {
  const eq = bottleneckStation(sc);
  const eqLc = lc(eq.name);
  const leaver = leaveWorker(sc);
  const off = offWorker(sc);
  const [hot1, hot2] = hotItems(sc);
  const onShift = sc.workers.filter(w => w.shifts.length);
  const out: Preset[] = [
    { label: `${eq.name} breaks at 7`, question: `The ${eqLc} breaks at 7`, patch: { summary: `${eq.name} down 7:00–7:40 PM.`, equipment: [{ station: eq.id, start: 1140, end: 1180, capacity: 0 }] } },
    { label: "2 extra cooks at 6", question: "2 extra cooks come at 6", patch: { summary: "Two extra cooks work 6–10 PM.", extraStaff: [{ count: 2, start: 1080, end: 1320 }] } },
  ];
  if (leaver) out.push({ label: `${first(leaver)} leaves at 8`, question: `${first(leaver)} leaves at 8`, patch: { summary: `${first(leaver)} goes home at 8 PM.`, staff: [{ worker: leaver.id, action: "leave", start: 1200 }] } });
  out.push({ label: "Stop phone orders after 6:30", question: "Stop phone orders after 6:30", patch: { summary: "No phone orders from 6:30 PM to close.", channelPauses: [{ channel: "phone", start: 1110, end: 1320 }] } });
  if (off) out.push({ label: `What if ${first(off)} shows up?`, question: `What if ${first(off)} shows up after all?`, patch: { summary: `${first(off)} works 6–10 PM.`, staff: [{ worker: off.id, action: "add", start: 1080, end: 1320 }] } });
  out.push(
    { label: `Add a second ${eqLc}`, question: `Add a second ${eqLc}`, patch: { summary: `A second ${eqLc} (+${eq.capacity} capacity) all night.`, addEquipment: [{ station: eq.id, capacity: Math.max(1, Math.min(12, eq.capacity)) }] } },
    { label: "100 dishes at 8", question: "100 dishes at 8", patch: { summary: "A 100-dish phone order lands at 8 PM.", bigOrders: [{ time: 1200, channel: "phone", items: splitOrder(sc.menu, 100) }] } },
    { label: "Short one person all night", question: "We're short one person all night", patch: { summary: "Short one person all night.", extraStaff: [{ count: -1, start: 960, end: 1320 }] } },
    { label: "Snow keeps people home", question: "Snow keeps people home", patch: { summary: "Snow from 6 PM: delivery +15%, walk-ins −40%.", demand: [{ start: 1080, end: 1320, channel: "doordash", factor: 1.15 }, { start: 1080, end: 1320, channel: "ubereats", factor: 1.15 }, { start: 1080, end: 1320, channel: "counter", factor: 0.6 }] } },
  );
  if (hot1) out.push({ label: `${hot1.name} take longer to cook`, question: `${hot1.name} take longer to cook tonight`, patch: { summary: `${hot1.name} cook 1.5× slower tonight.`, menu: [{ item: hot1.id, action: "slower", factor: 1.5 }] } });
  out.push(
    { label: "Pause Uber Eats 7–7:30", question: "Pause Uber Eats 7 to 7:30", patch: { summary: "Uber Eats paused 7:00–7:30 PM.", channelPauses: [{ channel: "ubereats", start: 1140, end: 1170 }] } },
    { label: "Quote 20 min after 6:45", question: "Quote 20 minutes after 6:45", patch: { summary: "Quoted prep time 20 min from 6:45 PM to close.", quotedPrep: [{ start: 1125, end: 1320, minutes: 20 }] } },
    { label: "Pause DoorDash 7–7:45", question: "Pause DoorDash from 7 to 7:45", patch: { summary: "DoorDash paused 7:00–7:45 PM.", channelPauses: [{ channel: "doordash", start: 1140, end: 1185 }] } },
    { label: "Close at 9", question: "Close at 9", patch: { summary: "Close at 9 PM: no orders after 9, everyone goes home.", channelPauses: [{ channel: "doordash", start: 1260, end: 1320 }, { channel: "ubereats", start: 1260, end: 1320 }, { channel: "phone", start: 1260, end: 1320 }, { channel: "counter", start: 1260, end: 1320 }], staff: onShift.slice(0, 6).map(w => ({ worker: w.id, action: "leave" as const, start: 1260 })) } },
  );
  if (hot2) out.push({ label: `86 the ${lc(hot2.name)}`, question: `What if we 86 ${lc(hot2.name)} tonight?`, patch: { summary: `${hot2.name} removed from the menu tonight.`, menu: [{ item: hot2.id, action: "remove" }] } });
  out.push({ label: "Quote 25 minutes all night", question: "Quote 25 minutes prep time all night", patch: { summary: "Quoted prep time 25 min from 4 PM to close.", quotedPrep: [{ start: 960, end: 1320, minutes: 25 }] } });
  return out;
}

/** Alternate phrasings that map onto a preset's question (normalized). Generated from the scenario's names. */
export function aliases(sc: Scenario): [string, string][] {
  const eq = lc(bottleneckStation(sc).name);
  const leaver = leaveWorker(sc);
  const hot1 = hotItems(sc)[0];
  const out: [string, string][] = [
    ["2 extra employees come at 6", "2 extra cooks come at 6"],
    ["two extra cooks come at 6", "2 extra cooks come at 6"],
    ["2 extra cooks arrive at 6", "2 extra cooks come at 6"],
    [`the ${eq} breaks at 7`, `The ${eq} breaks at 7`],
    [`${eq} breaks at 7`, `The ${eq} breaks at 7`],
    [`the ${eq} goes down at 7`, `The ${eq} breaks at 7`],
    [`add a second ${eq}`, `Add a second ${eq}`],
    [`what if we add a second ${eq}`, `Add a second ${eq}`],
    ["we are short one person all night", "We're short one person all night"],
    ["short one person all night", "We're short one person all night"],
    ["snow keeps people home", "Snow keeps people home"],
    ["it snows tonight", "Snow keeps people home"],
    ["pause uber eats 7 7 30", "Pause Uber Eats 7 to 7:30"],
    ["pause uber eats from 7 to 7 30", "Pause Uber Eats 7 to 7:30"],
    ["quote 20 min after 6 45", "Quote 20 minutes after 6:45"],
    ["quote 20 minutes after 6 45 pm", "Quote 20 minutes after 6:45"],
    ["100 dish phone order at 8", "100 dishes at 8"],
    ["a 100 dish order at 8", "100 dishes at 8"],
    ["we close at 9", "Close at 9"],
    ["close early at 9", "Close at 9"],
  ];
  if (leaver) { const n = lc(first(leaver)); out.push([`${n} leaves at 8pm`, `${n} leaves at 8`], [`${n} has to leave at 8`, `${n} leaves at 8`]); }
  if (hot1) out.push([`${lc(hot1.name)} take longer to cook`, `${hot1.name} take longer to cook tonight`]);
  return out;
}

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function cachedPatch(q: string, sc: Scenario): ScenarioPatch | null {
  const n = normalizeQuestion(q);
  const all = [...curveballs(sc), ...likelyQuestions(sc)];
  for (const p of all) if (normalizeQuestion(p.question) === n) return p.patch;
  for (const [alias, canonical] of aliases(sc)) if (normalizeQuestion(alias) === n) return all.find(p => normalizeQuestion(p.question) === normalizeQuestion(canonical))?.patch ?? null;
  return null;
}
