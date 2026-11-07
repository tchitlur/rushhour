import { describe, it, expect } from "vitest";
import { keywordPatch } from "../ask";
import { ScenarioPatchSchema } from "../types";
import { cachedPatch, CURVEBALLS, LIKELY_QUESTIONS } from "@/data/ask-cache";
import { applyPatch, patchChips } from "../apply";
import { baseScenario } from "@/sim/scenario";
import { simulateNight } from "@/sim/engine";

describe("ask pipeline", () => {
  it("every preset patch validates against the schema and applies cleanly", () => {
    for (const p of [...CURVEBALLS, ...LIKELY_QUESTIONS]) {
      expect(ScenarioPatchSchema.safeParse(p.patch).success).toBe(true);
      const sc = applyPatch(baseScenario(), p.patch);
      expect(patchChips(p.patch, sc).length).toBeGreaterThan(0);
      const r = simulateNight(sc, { seed: 5 });
      expect(Number.isFinite(r.metrics.dollarsAtRisk)).toBe(true);
    }
    expect(cachedPatch("A 30-PERSON catering order comes in at 6:30!")).not.toBeNull();
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
  it("rejects out-of-range patches", () => {
    expect(ScenarioPatchSchema.safeParse({ summary: "x", equipment: [{ station: "fryer", start: 100, end: 200, capacity: 0 }] }).success).toBe(false);
    expect(ScenarioPatchSchema.safeParse({ summary: "x", staff: [{ worker: "bob", action: "fired" }] }).success).toBe(false);
  });
});
