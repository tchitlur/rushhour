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
    label: "2 extra cooks at 6",
    question: "2 extra cooks come at 6",
    patch: { summary: "Two extra cooks work 6–10 PM.", extraStaff: [{ count: 2, start: 1080, end: 1320 }] },
  },
  {
    label: "Ana leaves at 8",
    question: "Ana leaves at 8",
    patch: { summary: "Ana goes home at 8 PM.", staff: [{ worker: "ana", action: "leave", start: 1200 }] },
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
    label: "Add a second fryer",
    question: "Add a second fryer",
    patch: { summary: "A second fryer (4 more baskets) all night.", addEquipment: [{ station: "fryer", capacity: 4 }] },
  },
  {
    label: "Short one person all night",
    question: "We're short one person all night",
    patch: { summary: "Short one person all night.", extraStaff: [{ count: -1, start: 960, end: 1320 }] },
  },
  {
    label: "Snow keeps people home",
    question: "Snow keeps people home",
    patch: { summary: "Snow from 6 PM: delivery +15%, walk-ins −40%.", demand: [{ start: 1080, end: 1320, channel: "doordash", factor: 1.15 }, { start: 1080, end: 1320, channel: "ubereats", factor: 1.15 }, { start: 1080, end: 1320, channel: "counter", factor: 0.6 }] },
  },
  {
    label: "Wings take longer to cook",
    question: "Wings take longer to cook tonight",
    patch: { summary: "Wings cook 1.5× slower tonight.", menu: [{ item: "wings", action: "slower", factor: 1.5 }] },
  },
  {
    label: "Pause Uber Eats 7–7:30",
    question: "Pause Uber Eats 7 to 7:30",
    patch: { summary: "Uber Eats paused 7:00–7:30 PM.", channelPauses: [{ channel: "ubereats", start: 1140, end: 1170 }] },
  },
  {
    label: "Quote 20 min after 6:45",
    question: "Quote 20 minutes after 6:45",
    patch: { summary: "Quoted prep time 20 min from 6:45 PM to close.", quotedPrep: [{ start: 1125, end: 1320, minutes: 20 }] },
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

/** Alternate phrasings that map onto a preset's patch (normalized). */
const ALIASES: [string, string][] = [
  ["2 extra employees come at 6", "2 extra cooks come at 6"],
  ["two extra cooks come at 6", "2 extra cooks come at 6"],
  ["2 extra cooks arrive at 6", "2 extra cooks come at 6"],
  ["the fryer breaks at 7", "The fryer breaks at 7"],
  ["fryer breaks at 7", "The fryer breaks at 7"],
  ["the fryer goes down at 7", "The fryer breaks at 7"],
  ["ana leaves at 8pm", "Ana leaves at 8"],
  ["ana has to leave at 8", "Ana leaves at 8"],
  ["add a second fryer", "Add a second fryer"],
  ["what if we add a second fryer", "Add a second fryer"],
  ["we are short one person all night", "We're short one person all night"],
  ["short one person all night", "We're short one person all night"],
  ["snow keeps people home", "Snow keeps people home"],
  ["it snows tonight", "Snow keeps people home"],
  ["wings take longer to cook", "Wings take longer to cook tonight"],
  ["pause uber eats 7 7 30", "Pause Uber Eats 7 to 7:30"],
  ["pause uber eats from 7 to 7 30", "Pause Uber Eats 7 to 7:30"],
  ["quote 20 min after 6 45", "Quote 20 minutes after 6:45"],
  ["quote 20 minutes after 6 45 pm", "Quote 20 minutes after 6:45"],
];

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function cachedPatch(q: string): ScenarioPatch | null {
  const n = normalizeQuestion(q);
  const all = [...CURVEBALLS, ...LIKELY_QUESTIONS];
  for (const p of all) if (normalizeQuestion(p.question) === n) return p.patch;
  for (const [alias, canonical] of ALIASES) if (normalizeQuestion(alias) === n) return all.find(p => normalizeQuestion(p.question) === normalizeQuestion(canonical))?.patch ?? null;
  return null;
}
