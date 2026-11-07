/// <reference lib="webworker" />
import { simulateNight } from "./engine";
import type { Scenario } from "./types";

export type WorkerRequest =
  | { id: number; type: "nights"; scenario: Scenario; seeds: number[] }
  | { id: number; type: "night"; scenario: Scenario; seed: number };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "nights") {
      const metrics = msg.seeds.map(seed => simulateNight(msg.scenario, { seed }).metrics);
      (self as unknown as Worker).postMessage({ id: msg.id, type: "nights", metrics });
    } else if (msg.type === "night") {
      const result = simulateNight(msg.scenario, { seed: msg.seed, snapshots: true });
      (self as unknown as Worker).postMessage({ id: msg.id, type: "night", result });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, type: "error", error: String(err) });
  }
};
