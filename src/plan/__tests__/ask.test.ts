import { describe, it, expect } from "vitest";
import { keywordPatch, unknownPerson, whyNoEffect } from "../ask";
import { ScenarioPatchSchema } from "../types";
import { cachedPatch, curveballs, likelyQuestions } from "@/data/ask-cache";
import { applyPatch, patchChips, splitOrder, validatePatch } from "../apply";
import type { Scenario } from "@/sim/types";
import { baseScenario } from "@/sim/scenario";
import { simulateNight } from "@/sim/engine";

/** A non-Maria restaurant (noodle shop, staff Tony/Priya/Marcus) built by hand so the tests don't depend on templates. */
function noodleShop(): Scenario {
  const sc = baseScenario();
  sc.menu = [
    { id: "tonkotsu", name: "Tonkotsu ramen", price: 15.5, foodCost: 4.4, stations: ["fryer", "cold"], prepMin: 6, prepSd: 0.8, holdMin: 6, popularity: 30 },
    { id: "shoyu", name: "Shoyu ramen", price: 14.5, foodCost: 3.9, stations: ["fryer", "cold"], prepMin: 5.5, prepSd: 0.8, holdMin: 6, popularity: 22 },
    { id: "padthai", name: "Pad thai", price: 14, foodCost: 3.6, stations: ["grill"], prepMin: 5, prepSd: 0.7, holdMin: 12, popularity: 20 },
    { id: "gyoza", name: "Gyoza (6)", price: 8, foodCost: 2.1, stations: ["grill"], prepMin: 6, prepSd: 0.8, holdMin: 10, popularity: 20 },
    { id: "tea", name: "Iced tea", price: 3, foodCost: 0.4, stations: ["cold"], prepMin: 0.5, prepSd: 0.1, holdMin: 60, popularity: 24 },
  ];
  sc.stations = sc.stations.map(s => s.id === "grill" ? { ...s, name: "Wok line", capacity: 4 } : s.id === "fryer" ? { ...s, name: "Noodle boil", capacity: 6 } : s);
  sc.workers = [
    { id: "tony", name: "Tony", wage: 0, skills: { grill: 1.3, fryer: 1.1, cold: 0.9, pack: 1, counter: 1 }, shifts: [{ start: 960, end: 1320 }], color: "#000" },
    { id: "priya", name: "Priya", wage: 18, skills: { grill: 1.0, fryer: 1.1, cold: 1.0, pack: 1.1, counter: 0.9 }, shifts: [{ start: 1020, end: 1320 }], color: "#000" },
    { id: "marcus", name: "Marcus", wage: 17, skills: { grill: 0.8, fryer: 1.0, cold: 1.1, pack: 1.2, counter: 1.1 }, shifts: [{ start: 960, end: 1320 }], color: "#000" },
  ];
  sc.restaurant = { name: "Noodle Bar", cuisine: "noodles", neighborhood: "Lawrenceville", lat: 0, lon: 0 };
  return sc;
}

describe("ask pipeline", () => {
  it("generic quantities split by the ACTIVE menu's popularity (non-Maria scenario)", () => {
    const sc = noodleShop();
    const p = keywordPatch("100-dish phone order at 8", sc);
    expect(p?.bigOrders?.[0].time).toBe(1200);
    const items = p!.bigOrders![0].items;
    expect(items.map(i => i.item).sort()).toEqual(["gyoza", "padthai", "shoyu", "tonkotsu"]); // top 4 cooked items; iced tea excluded
    expect(items.reduce((a, i) => a + i.qty, 0)).toBe(100);
    for (const i of items) expect(sc.menu.some(m => m.id === i.item)).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/burger|wings|fries/);
    const big = keywordPatch("a big catering order for 40 at 7", sc);
    expect(big?.bigOrders?.[0].items.every(i => sc.menu.some(m => m.id === i.item))).toBe(true);
    expect(splitOrder(sc.menu, 100).map(i => i.item)).toEqual(["tonkotsu", "shoyu", "padthai", "gyoza"]);
    // applying a patch with the real menu actually changes the scenario (no silent "same")
    const after = applyPatch(sc, p!);
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(sc));
  });
  it("validatePatch drops items/workers that don't exist and maps names to ids", () => {
    const sc = noodleShop();
    const v = validatePatch({ summary: "x", bigOrders: [{ time: 1200, channel: "phone", items: [{ item: "burger", qty: 35 }, { item: "Pad Thai", qty: 10 }] }], staff: [{ worker: "Sam", action: "absent" }, { worker: "PRIYA", action: "leave", start: 1200 }], menu: [{ item: "wings", action: "remove" }] }, sc);
    expect(v.patch.bigOrders?.[0].items).toEqual([{ item: "padthai", qty: 10 }]);
    expect(v.patch.staff).toEqual([{ worker: "priya", action: "leave", start: 1200 }]);
    expect(v.patch.menu).toBeUndefined();
    expect(v.unknownWorkers).toEqual(["Sam"]);
    expect(v.unknownItems.sort()).toEqual(["burger", "wings"]);
    const nothing = validatePatch({ summary: "x", bigOrders: [{ time: 1200, channel: "phone", items: [{ item: "burger", qty: 35 }] }] }, sc);
    expect(nothing.patch.bigOrders).toBeUndefined();
    expect(JSON.stringify(applyPatch(sc, nothing.patch))).toBe(JSON.stringify(sc));
    expect(whyNoEffect({ summary: "x", staff: [{ worker: "priya", action: "late", start: 1000 }] }, sc, [])).toMatch(/Priya doesn't start until 5pm/);
  });
  it("an unknown worker yields a suggestion with real names instead of a patch", () => {
    const sc = noodleShop();
    const r = unknownPerson("Sam calls out sick tonight", sc);
    expect(r).not.toBeNull();
    expect(r!.text).toMatch(/no Sam on staff tonight/);
    expect(r!.text).toMatch(/Tony, Priya, Marcus/);
    expect(r!.suggestions).toContain("one cook calls out");
    expect(r!.suggestions.some(s => /Tony|Priya|Marcus/.test(s))).toBe(true);
    expect(unknownPerson("Priya calls out", sc)).toBeNull();
    expect(unknownPerson("a cook calls out", sc)).toBeNull();
    expect(unknownPerson("the fryer breaks at 7", sc)).toBeNull();
    // keyword translator uses the real staff, never Maria's
    expect(keywordPatch("Priya leaves at 8", sc)?.staff?.[0]).toMatchObject({ worker: "priya", action: "leave", start: 1200 });
    expect(keywordPatch("a cook calls out", sc)?.staff?.[0]).toMatchObject({ worker: "priya", action: "absent" }); // lowest-skill on-shift non-owner
    expect(keywordPatch("the wok line breaks at 7", sc)?.equipment?.[0]).toMatchObject({ station: "grill", start: 1140, capacity: 0 });
    expect(keywordPatch("add a second wok line", sc)?.addEquipment?.[0]).toMatchObject({ station: "grill", capacity: 4 });
    expect(keywordPatch("86 the gyoza", sc)?.menu?.[0]).toMatchObject({ item: "gyoza", action: "remove" });
    const close = keywordPatch("close at 9", sc);
    expect(close?.channelPauses?.map(c => c.channel).sort()).toEqual(["counter", "doordash", "phone", "ubereats"]);
    expect(close?.channelPauses?.[0]).toMatchObject({ start: 1260, end: 1320 });
    expect(close?.staff?.length).toBe(3);
  });
  it("curveballs(sc) uses real names and real equipment; Maria's presets are unchanged", () => {
    const sc = noodleShop();
    const cb = curveballs(sc);
    expect(cb.map(c => c.label)).toEqual(["Cook calls out", "Game goes to overtime", "Sudden rain", "30-person catering at 6:30"]);
    expect(cb[0].question).toMatch(/^Priya calls out/);
    expect(cb[0].patch.staff?.[0]).toMatchObject({ worker: "priya", action: "absent" });
    expect(cb[3].patch.bigOrders?.[0].items.every(i => sc.menu.some(m => m.id === i.item))).toBe(true);
    const lq = likelyQuestions(sc);
    expect(lq[0].label).toBe("Wok line breaks at 7");
    expect(lq[0].patch.equipment?.[0]).toMatchObject({ station: "grill", capacity: 0 });
    expect(lq.some(p => p.label === "Add a second wok line")).toBe(true);
    expect(lq.some(p => p.label === "Priya leaves at 8")).toBe(true);
    expect(lq.some(p => p.label === "100 dishes at 8")).toBe(true);
    expect(JSON.stringify([...cb, ...lq])).not.toMatch(/maria|jake|ana|sam|burger|wings|fries/i);
    expect(cachedPatch("the wok line breaks at 7", sc)).not.toBeNull();
    // Maria: exactly the same catering split and the same absent cook as before
    const maria = baseScenario();
    const mc = curveballs(maria);
    expect(mc[3].patch.bigOrders).toEqual([{ time: 1110, channel: "phone", items: [{ item: "wings", qty: 15 }, { item: "fries", qty: 15 }, { item: "burger", qty: 10 }] }]);
    expect(mc[0].patch.staff).toEqual([{ worker: "sam", action: "absent" }]);
    expect(mc[1].patch.demand).toEqual([{ start: 1260, end: 1320, channel: "all", factor: 1.5 }, { start: 1260, end: 1320, channel: "doordash", factor: 1.2 }]);
  });
  it("every preset patch validates against the schema and applies cleanly", () => {
    for (const base of [baseScenario(), noodleShop()]) {
      for (const p of [...curveballs(base), ...likelyQuestions(base)]) {
        expect(ScenarioPatchSchema.safeParse(p.patch).success, p.label).toBe(true);
        const sc = applyPatch(base, p.patch);
        expect(patchChips(p.patch, sc).length).toBeGreaterThan(0);
        expect(JSON.stringify(sc), p.label).not.toBe(JSON.stringify(base)); // never a silent no-op
        const r = simulateNight(sc, { seed: 5 });
        expect(Number.isFinite(r.metrics.dollarsAtRisk)).toBe(true);
      }
    }
    expect(cachedPatch("A 30-PERSON catering order comes in at 6:30!", baseScenario())).not.toBeNull();
  });
  it("keeps the four curveballs and caches the likely questions (plus aliases)", () => {
    const sc = baseScenario();
    expect(curveballs(sc).map(c => c.label)).toEqual(["Cook calls out", "Game goes to overtime", "Sudden rain", "30-person catering at 6:30"]);
    for (const q of ["2 extra employees come at 6", "2 extra cooks come at 6", "the fryer breaks at 7", likelyQuestions(sc).find(p => /leaves at 8/.test(p.label))!.question, "add a second fryer", "we're short one person all night", "snow keeps people home", "Fries take longer to cook tonight", "pause Uber Eats 7 to 7:30", "quote 20 minutes after 6:45", "100 dishes at 8", "close at 9"]) {
      expect(cachedPatch(q, sc), q).not.toBeNull();
    }
    expect(cachedPatch("2 extra employees come at 6", sc)?.extraStaff?.[0]).toMatchObject({ count: 2, start: 1080 });
    expect(cachedPatch("tell me a joke", sc)).toBeNull();
  });
  it("keyword translator handles common phrasings", () => {
    const f = keywordPatch("the fryer breaks at 7");
    expect(f?.equipment?.[0]).toMatchObject({ station: "fryer", start: 1140, capacity: 0 });
    const r = keywordPatch("it starts raining at 6:30pm");
    expect(r?.demand?.[0].start).toBe(1110);
    const c = keywordPatch("a 40 person order at 7:15");
    expect(c?.bigOrders?.[0]).toMatchObject({ time: 1155 });
    expect(keywordPatch("stop phone orders after 6:30")?.channelPauses?.[0]).toMatchObject({ channel: "phone", start: 1110 });
    expect(keywordPatch("what if Ana shows up at 6")?.staff?.[0]).toMatchObject({ worker: "ana", action: "add" });
    expect(keywordPatch("tell me a joke")).toBeNull();
    for (const q of ["the fryer breaks at 7", "it starts raining at 6:30pm", "a 40 person order at 7:15"]) {
      expect(ScenarioPatchSchema.safeParse(keywordPatch(q)).success).toBe(true);
    }
  });
  it("keyword translator handles the new what-if shapes", () => {
    expect(keywordPatch("2 extra cooks come at 6")?.extraStaff?.[0]).toMatchObject({ count: 2, start: 1080, end: 1320 });
    expect(keywordPatch("three more people from 7")?.extraStaff?.[0]).toMatchObject({ count: 3, start: 1140 });
    expect(keywordPatch("we're short one person all night")?.extraStaff?.[0]).toMatchObject({ count: -1, start: 960, end: 1320 });
    expect(keywordPatch("we are short-staffed tonight")?.extraStaff?.[0]).toMatchObject({ count: -1 });
    expect(keywordPatch("Ana leaves at 8")?.staff?.[0]).toMatchObject({ worker: "ana", action: "leave", start: 1200 });
    expect(keywordPatch("Jake is late until 7")?.staff?.[0]).toMatchObject({ worker: "jake", action: "late", start: 1140 });
    expect(keywordPatch("add a second fryer")?.addEquipment?.[0]).toMatchObject({ station: "fryer", capacity: 4 });
    expect(keywordPatch("a second fryer from 6:30")?.addEquipment?.[0]).toMatchObject({ station: "fryer", time: 1110 });
    expect(keywordPatch("the oven runs at half capacity")?.equipment?.[0]).toMatchObject({ station: "grill", capacity: 3 });
    expect(keywordPatch("the fryer goes down at 7 for 40 minutes")?.equipment?.[0]).toMatchObject({ station: "fryer", start: 1140, end: 1180, capacity: 0 });
    const d = keywordPatch("+30% delivery")?.demand;
    expect(d?.map(x => x.channel).sort()).toEqual(["doordash", "ubereats"]);
    expect(d?.[0].factor).toBeCloseTo(1.3);
    const snow = keywordPatch("snow keeps people home")?.demand;
    expect(snow?.find(x => x.channel === "counter")?.factor).toBeCloseTo(0.6);
    expect(keywordPatch("take wings off the menu")?.menu?.[0]).toMatchObject({ item: "wings", action: "remove" });
    expect(keywordPatch("86 the tenders")?.menu?.[0]).toMatchObject({ item: "tenders", action: "remove" });
    expect(keywordPatch("wings take longer to cook tonight")?.menu?.[0]).toMatchObject({ item: "wings", action: "slower", factor: 1.5 });
    expect(keywordPatch("pause Uber Eats 7 to 7:30")?.channelPauses?.[0]).toMatchObject({ channel: "ubereats", start: 1140, end: 1170 });
    expect(keywordPatch("quote 20 minutes after 6:45")?.quotedPrep?.[0]).toMatchObject({ start: 1125, end: 1320, minutes: 20 });
    const mv = keywordPatch("move the pack station next to the fryer", baseScenario())?.layout?.[0];
    expect(mv?.station).toBe("pack");
    expect(Math.hypot((mv?.x ?? 0) - 6, (mv?.y ?? 0) - 1.5)).toBeLessThan(3);
    const combo = keywordPatch("the fryer breaks at 7 for 40 min and 2 extra cooks arrive at 6");
    expect(combo?.equipment?.[0]).toMatchObject({ station: "fryer", start: 1140, end: 1180 });
    expect(combo?.extraStaff?.[0]).toMatchObject({ count: 2, start: 1080 });
    for (const q of ["2 extra cooks come at 6", "we're short one person all night", "Ana leaves at 8", "add a second fryer", "the oven runs at half capacity", "+30% delivery", "snow keeps people home", "wings take longer to cook tonight", "pause Uber Eats 7 to 7:30", "quote 20 minutes after 6:45", "move the pack station next to the fryer", "the fryer breaks at 7 for 40 min and 2 extra cooks arrive at 6"]) {
      expect(ScenarioPatchSchema.safeParse(keywordPatch(q)).success, q).toBe(true);
    }
  });
  it("applyPatch adds extra workers, cuts shifts and overrides capacity", () => {
    const base = baseScenario();
    const extra = applyPatch(base, { summary: "x", extraStaff: [{ count: 2, start: 1080, end: 1320 }] });
    const added = extra.workers.filter(w => w.id.startsWith("extra"));
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ id: "extra1", name: "Extra cook 1", wage: 18, shifts: [{ start: 1080, end: 1320 }] });
    expect(Object.keys(added[0].skills).sort()).toEqual(["cold", "counter", "fryer", "grill", "pack"]);
    expect(base.workers.some(w => w.id.startsWith("extra"))).toBe(false); // pure
    const night = simulateNight(extra, { seed: 3, snapshots: true });
    const snap = night.snapshots?.find(s => s.t >= 1140);
    if (snap) expect(snap.workers.filter(w => w.extra && w.onShift).length).toBe(2);

    const short = applyPatch(base, { summary: "x", extraStaff: [{ count: -1, start: 960, end: 1320 }] });
    const onShiftBefore = base.workers.filter(w => w.shifts.length).length;
    const onShiftAfter = short.workers.filter(w => w.shifts.length).length;
    expect(onShiftAfter).toBe(onShiftBefore - 1);
    expect(short.workers.find(w => w.id === "maria")?.shifts.length).toBeGreaterThan(0);

    const leave = applyPatch(base, { summary: "x", staff: [{ worker: "sam", action: "leave", start: 1200 }] });
    expect(leave.workers.find(w => w.id === "sam")?.shifts).toEqual([{ start: 960, end: 1200 }]);

    const fryer2 = applyPatch(base, { summary: "x", addEquipment: [{ station: "fryer", capacity: 4, time: 1110 }] });
    expect(fryer2.outages).toContainEqual({ station: "fryer", start: 1110, end: 1320, capacity: 8 });
    const n2 = simulateNight(fryer2, { seed: 3, snapshots: true });
    const s2 = n2.snapshots?.find(s => s.t >= 1140)?.stations.find(s => s.id === "fryer");
    if (s2) expect(s2.capacity).toBe(8);

    const slow = applyPatch(base, { summary: "x", menu: [{ item: "wings", action: "slower" }] });
    expect(slow.menu.find(m => m.id === "wings")?.prepMin).toBeCloseTo(11 * 1.5);
    expect(base.menu.find(m => m.id === "wings")?.prepMin).toBe(11);
  });
  it("patchChips describes the new fields", () => {
    const sc = baseScenario();
    const chips = patchChips({ summary: "x", extraStaff: [{ count: 2, start: 1080, end: 1320 }, { count: -1, start: 960, end: 1320 }], addEquipment: [{ station: "fryer", capacity: 4, time: 1110 }], staff: [{ worker: "ana", action: "leave", start: 1200 }], menu: [{ item: "wings", action: "slower", factor: 1.5 }] }, sc);
    expect(chips).toEqual(["Ana leaves at 8pm", "+2 cooks 6pm–10pm", "Short 1 person all night", "Second fryer from 6:30", "Wings (10) cook 1.5× slower"]);
  });
  it("rejects out-of-range patches", () => {
    expect(ScenarioPatchSchema.safeParse({ summary: "x", equipment: [{ station: "fryer", start: 100, end: 200, capacity: 0 }] }).success).toBe(false);
    expect(ScenarioPatchSchema.safeParse({ summary: "x", staff: [{ worker: "bob", action: "fired" }] }).success).toBe(false);
    expect(ScenarioPatchSchema.safeParse({ summary: "x", extraStaff: [{ count: 9, start: 960, end: 1320 }] }).success).toBe(false);
  });
});
