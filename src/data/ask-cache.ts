// Pre-cached translations of the curveball presets and likely judge questions (question -> ScenarioPatch).
// Live LLM translation is still attempted first for free text; these guarantee speed and reliability for presets.
import type { ScenarioPatch } from "@/plan/types";

export interface Preset { label: string; question: string; patch: ScenarioPatch }

export const CURVEBALLS: Preset[] = [
  {
    label: "Cook calls out",
    question: "Sam calls out sick tonight",
    patch: { summary: "Sam is out all night; Maria runs the kitchen alone.", staff: [{ worker: "sam", action: "absent" }] },
  },
  {
    label: "Game goes to overtime",
    question: "The game goes to overtime",
    patch: { summary: "Overtime: the post-game surge comes late and bigger, 9–10 PM.", demand: [{ start: 1260, end: 1320, channel: "all", factor: 1.25 }, { start: 1260, end: 1320, channel: "doordash", factor: 1.3 }] },
  },
  {
    label: "Sudden rain",
    question: "It starts pouring at 6 PM",
    patch: { summary: "Rain 6–9 PM: more delivery, fewer walk-ins.", demand: [{ start: 1080, end: 1260, channel: "doordash", factor: 1.15 }, { start: 1080, end: 1260, channel: "ubereats", factor: 1.15 }, { start: 1080, end: 1260, channel: "counter", factor: 0.8 }] },
  },
  {
    label: "30-person catering at 6:30",
    question: "A 30-person catering order comes in at 6:30",
    patch: { summary: "One 30-person phone order at 6:30 PM lands on top of the rush.", bigOrders: [{ time: 1110, channel: "phone", items: [{ item: "wings", qty: 15 }, { item: "fries", qty: 15 }, { item: "burger", qty: 10 }] }] },
  },
];

export const LIKELY_QUESTIONS: Preset[] = [
  {
    label: "Fryer breaks at 7",
    question: "The fryer breaks at 7",
    patch: { summary: "Fryer down 7:00–7:40 PM.", equipment: [{ station: "fryer", start: 1140, end: 1180, capacity: 0 }] },
  },
  {
    label: "Stop phone orders after 6:30",
    question: "Stop phone orders after 6:30",
    patch: { summary: "No phone orders from 6:30 PM to close.", channelPauses: [{ channel: "phone", start: 1110, end: 1320 }] },
  },
  {
    label: "What if Jake shows up?",
    question: "What if Jake shows up after all?",
    patch: { summary: "Jake works his 6–10 PM shift.", staff: [{ worker: "jake", action: "add", start: 1080, end: 1320 }] },
  },
  {
    label: "Pause DoorDash 7–7:45",
    question: "Pause DoorDash from 7 to 7:45",
    patch: { summary: "DoorDash paused 7:00–7:45 PM.", channelPauses: [{ channel: "doordash", start: 1140, end: 1185 }] },
  },
  {
    label: "86 the wings",
    question: "What if we 86 wings tonight?",
    patch: { summary: "Wings removed from the menu tonight.", menu: [{ item: "wings", action: "remove" }] },
  },
  {
    label: "Quote 25 minutes all night",
    question: "Quote 25 minutes prep time all night",
    patch: { summary: "Quoted prep time 25 min from 4 PM to close.", quotedPrep: [{ start: 960, end: 1320, minutes: 25 }] },
  },
];

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function cachedPatch(q: string): ScenarioPatch | null {
  const n = normalizeQuestion(q);
  for (const p of [...CURVEBALLS, ...LIKELY_QUESTIONS]) if (normalizeQuestion(p.question) === n) return p.patch;
  return null;
}
