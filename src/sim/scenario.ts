import type { Channel, MenuItem, Scenario, Worker, Bin } from "./types";
import { CHANNELS, SERVICE_START, N_BINS, BIN_MIN } from "./types";
import { DEFAULT_STATIONS } from "./layout";

export const MENU: MenuItem[] = [
  { id: "burger", name: "Classic Burger", price: 11.5, foodCost: 3.4, stations: ["grill"], prepMin: 7, prepSd: 1.2, holdMin: 10, popularity: 30 },
  { id: "double", name: "Double Smash", price: 14.5, foodCost: 4.6, stations: ["grill"], prepMin: 8, prepSd: 1.3, holdMin: 10, popularity: 14 },
  { id: "wings", name: "Wings (10)", price: 15.0, foodCost: 5.1, stations: ["fryer"], prepMin: 11, prepSd: 1.0, holdMin: 12, popularity: 26, fryerBaskets: 1 },
  { id: "fries", name: "Fries", price: 4.5, foodCost: 0.9, stations: ["fryer"], prepMin: 3.5, prepSd: 0.5, holdMin: 9, popularity: 40, fryerBaskets: 0.5 },
  { id: "chicken", name: "Crispy Chicken Sandwich", price: 12.5, foodCost: 3.8, stations: ["fryer", "grill"], prepMin: 5.5, prepSd: 0.8, holdMin: 10, popularity: 16, fryerBaskets: 0.5 },
  { id: "tenders", name: "Tenders (4)", price: 10.5, foodCost: 3.2, stations: ["fryer"], prepMin: 6.5, prepSd: 0.8, holdMin: 10, popularity: 10, fryerBaskets: 0.5 },
  { id: "salad", name: "Chopped Salad", price: 9.5, foodCost: 2.6, stations: ["cold"], prepMin: 3, prepSd: 0.5, holdMin: 25, popularity: 8 },
  { id: "shake", name: "Hand-Spun Shake", price: 6.5, foodCost: 1.4, stations: ["cold"], prepMin: 2.5, prepSd: 0.4, holdMin: 12, popularity: 14 },
  { id: "slaw", name: "Slaw", price: 3.5, foodCost: 0.6, stations: ["cold"], prepMin: 1, prepSd: 0.2, holdMin: 30, popularity: 10 },
  { id: "soda", name: "Fountain Drink", price: 2.5, foodCost: 0.3, stations: ["cold"], prepMin: 0.5, prepSd: 0.1, holdMin: 60, popularity: 35 },
];

/** Worker hands-on fraction of an item's prep time at each station type. */
export const HANDS_ON: Record<string, number> = { grill: 0.3, fryer: 0.13, cold: 0.7, pack: 1.0, counter: 1.0 };
export const PACK_MIN = 0.7;
/** Kitchens fire delivery orders so they are ready close to the quoted time (tablet "ready by"). */
export const TARGET_TICKET_MIN = 12;      // minutes of hands-on to pack an order
export const WALK_SPEED = 1.2;    // m/s

export const WORKERS: Worker[] = [
  { id: "maria", name: "Maria", wage: 0, skills: { grill: 1.25, fryer: 1.1, cold: 1.0, pack: 1.1, counter: 1.0 }, shifts: [{ start: 16 * 60, end: 22 * 60 }], color: "#C2410C" },
  { id: "jake", name: "Jake", wage: 19, skills: { grill: 1.0, fryer: 1.15, cold: 0.9, pack: 1.0, counter: 0.8 }, shifts: [{ start: 18 * 60, end: 22 * 60 }], color: "#2F6DB5" },
  { id: "ana", name: "Ana", wage: 18, skills: { grill: 0.9, fryer: 1.0, cold: 1.15, pack: 1.2, counter: 1.1 }, shifts: [], color: "#7A4FA3" },
  { id: "sam", name: "Sam", wage: 16, skills: { grill: 0.7, fryer: 0.9, cold: 1.0, pack: 1.1, counter: 1.2 }, shifts: [{ start: 16 * 60, end: 22 * 60 }], color: "#2F855A" },
];

/** Baseline orders per hour per 15-min bin, 4:00pm..9:45pm (synthetic history, seeded). */
export const BASELINE_OPH: number[] = [
  9, 10, 11, 12,      // 4pm
  14, 16, 18, 20,     // 5pm
  22, 24, 25, 25,     // 6pm
  25, 24, 23, 21,     // 7pm
  19, 17, 15, 14,     // 8pm
  12, 11, 10, 9,      // 9pm
];

export const CHANNEL_MIX: Record<Channel, number> = { doordash: 0.38, ubereats: 0.17, phone: 0.15, counter: 0.30 };

export function flatDemand(): Bin[] {
  return Array.from({ length: N_BINS }, (_, i) => ({
    start: SERVICE_START + i * BIN_MIN,
    mult: { doordash: 1, ubereats: 1, phone: 1, counter: 1 },
  }));
}

export function baseScenario(date = "2026-11-10", label = "Normal weeknight"): Scenario {
  return {
    id: "base",
    label,
    date,
    menu: MENU.map(m => ({ ...m })),
    stations: DEFAULT_STATIONS.map(s => ({ ...s })),
    workers: WORKERS.map(w => ({ ...w, shifts: w.shifts.map(s => ({ ...s })), skills: { ...w.skills } })),
    baselineOrdersPerHour: [...BASELINE_OPH],
    channelMix: { ...CHANNEL_MIX },
    demand: flatDemand(),
    quotedPrep: [{ start: SERVICE_START, end: 22 * 60, minutes: 15 }],
    outages: [],
    channelPauses: [],
    removedItems: [],
    mixShift: {},
    prepBatches: [],
    bigOrders: [],
    notes: [],
  };
}

export function cloneScenario(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s)) as Scenario;
}

/** Multiply demand multipliers in [start,end) for the given channels. */
export function applyDemandWindow(s: Scenario, start: number, end: number, factor: Partial<Record<Channel, number>>) {
  for (const b of s.demand) {
    if (b.start >= start && b.start < end) {
      for (const ch of CHANNELS) {
        const f = factor[ch];
        if (f != null) b.mult[ch] = Math.min(1.8, Math.max(0.7, b.mult[ch] * f));
      }
    }
  }
}

export function removeWorker(s: Scenario, id: string) {
  const w = s.workers.find(w => w.id === id);
  if (w) w.shifts = [];
}

/** The default demo night: event + rain + Jake absent. Event/rain demand shape is overwritten by real intake when available. */
export function demoScenario(date: string): Scenario {
  const s = baseScenario(date, "Tonight (as planned)");
  s.id = "tonight";
  // Game crowd: ramps in 6:00, peaks 6:30–8:00, tails to 9:00; delivery-heavy.
  applyDemandWindow(s, 18 * 60, 18 * 60 + 30, { doordash: 1.15, ubereats: 1.12, phone: 1.1, counter: 1.1 });
  applyDemandWindow(s, 18 * 60 + 30, 20 * 60, { doordash: 1.38, ubereats: 1.35, phone: 1.2, counter: 1.2 });
  applyDemandWindow(s, 20 * 60, 21 * 60, { doordash: 1.15, ubereats: 1.12, phone: 1.05, counter: 1.1 });
  // Rain: delivery up, walk-in down, 6–9pm.
  applyDemandWindow(s, 18 * 60, 21 * 60, { doordash: 1.1, ubereats: 1.08, counter: 0.85 });
  removeWorker(s, "jake");
  s.notes = ["Steelers home game", "Rain 6–9 PM", "Jake called out"];
  return s;
}
