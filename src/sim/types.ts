// Core simulation types. Pure TypeScript, no UI dependencies.
// Time: minutes since midnight (service window 16:00 = 960 .. 22:00 = 1320).

export type Channel = "doordash" | "ubereats" | "phone" | "counter";
export const CHANNELS: Channel[] = ["doordash", "ubereats", "phone", "counter"];

export type StationId = "grill" | "fryer" | "cold" | "pack" | "counter";
export const STATIONS: StationId[] = ["grill", "fryer", "cold", "pack", "counter"];

export interface MenuItem {
  id: string;
  name: string;
  price: number;        // $
  foodCost: number;     // $
  stations: StationId[]; // routing; items may need 2 stations (sequential)
  prepMin: number;      // mean prep minutes at the primary station
  prepSd: number;       // sd of prep minutes
  holdMin: number;      // hold limit before "cold"
  popularity: number;   // relative weight
  fryerBaskets?: number; // baskets consumed if station includes fryer (default 1)
}

/** Rendering kind for equipment (templates reuse the 5 engine slots with different labels/shapes). */
export type StationKind = "grill" | "fryer" | "flattop" | "pizza_oven" | "oven" | "wok" | "rice" | "espresso" | "cold" | "pack" | "counter";

export interface Station {
  id: StationId;
  name: string;
  kind?: StationKind;
  x: number; // meters on floor grid
  y: number;
  capacity: number; // concurrent items (fryer: baskets)
}

export interface Shift { start: number; end: number } // minutes since midnight

export interface Worker {
  id: string;
  name: string;
  wage: number; // $/hr
  skills: Partial<Record<StationId, number>>; // speed multiplier (1 = normal, 1.2 = 20% faster)
  shifts: Shift[];
  color: string;
}

export interface Bin {
  /** start minute of the 15-min bin */
  start: number;
  /** demand multiplier per channel (1 = baseline) */
  mult: Record<Channel, number>;
}

export interface Scenario {
  id: string;
  label: string;
  date: string; // YYYY-MM-DD
  menu: MenuItem[];
  stations: Station[];
  workers: Worker[];
  /** baseline orders per hour over the evening, by 15-min bin start */
  baselineOrdersPerHour: number[]; // length 24 (4pm..10pm)
  /** baseline channel share */
  channelMix: Record<Channel, number>;
  /** per-bin multipliers from events/weather (applied on top of baseline) */
  demand: Bin[];
  /** quoted prep time (min) for delivery, by bin start -> minutes */
  quotedPrep: { start: number; end: number; minutes: number }[];
  /** equipment outages / capacity overrides */
  outages: { station: StationId; start: number; end: number; capacity: number }[];
  /** channels paused in windows */
  channelPauses: { channel: Channel; start: number; end: number }[];
  /** items removed (86'd) */
  removedItems: string[];
  /** menu-mix shift: item id -> popularity multiplier */
  mixShift: Record<string, number>;
  /** pre-batched items available at time t: consumed first, zero prep */
  prepBatches: { item: string; qty: number; time: number }[];
  /** one-off large orders */
  bigOrders: { time: number; items: { item: string; qty: number }[]; channel: Channel }[];
  /** restaurant identity (templates / customizer) */
  restaurant?: { name: string; cuisine: string; neighborhood: string; lat: number; lon: number; hours?: { open: number; close: number } };
  /** weather effect multiplier (already folded into demand, kept for attribution) */
  notes?: string[];
}

export interface OrderItemState {
  itemId: string;
  stationIdx: number;   // which station in routing we're on
  startedAt?: number;
  doneAt?: number;      // finished all stations
  workerId?: string;
}

export type OrderStatus = "queued" | "cooking" | "ready" | "handed" | "lost";

export interface Order {
  id: number;
  channel: Channel;
  placedAt: number;
  promisedAt: number;    // placedAt + quoted prep (delivery) or target
  items: OrderItemState[];
  readyAt?: number;
  handedAt?: number;
  status: OrderStatus;
  cold: boolean;
  late: boolean;
  revenue: number;
  foodCost: number;
  dasherArrivesAt?: number; // delivery only (current / next Dasher)
  dasherWait?: number;      // minutes waited past arrival (all Dashers)
  dasherWaitAccrued?: number; // wait by Dashers who gave up and unassigned
  reassignments?: number;   // how many Dashers unassigned after waiting too long
  isBig?: boolean;
}

export interface StationSnapshot {
  id: StationId;
  x: number; y: number;
  busy: number;       // items in progress
  capacity: number;
  queue: number;      // items waiting for this station
  load: number;       // 0..1+ (busy+queue)/capacity, clamped for display
  saturated: boolean;
}

export interface WorkerSnapshot {
  id: string;
  /** true for staff added by a what-if ("+" badge) */
  extra?: boolean;
  name: string;
  color: string;
  x: number; y: number;
  station: StationId | null;
  onShift: boolean;
  busy: boolean;
}

export interface TokenSnapshot {
  orderId: number;
  /** part of a one-off large (catering) order */
  big?: boolean;
  /** index of the item within the order; -1 for a packed/ready order token */
  itemIdx: number;
  channel: Channel;
  /** 0 = fresh, 1 = at hold limit, >1 cold */
  warmth: number;
  x: number; y: number;
  stage: "queue" | "cooking" | "ready";
}

export interface DasherSnapshot {
  orderId: number;
  channel: Channel;
  waitMin: number;
  x: number; y: number;
}

export interface Snapshot {
  t: number; // minutes since midnight
  stations: StationSnapshot[];
  workers: WorkerSnapshot[];
  tokens: TokenSnapshot[];
  dashers: DasherSnapshot[];
  live: LiveCounters;
  /** rolling 15-min metric values (for sparklines) */
  bins: BinMetrics[];
}

export interface LiveCounters {
  ordersPlaced: number;
  dashersGaveUp: number;   // Dashers who unassigned after waiting too long
  ordersHanded: number;
  inKitchen: number;
  dashersWaiting: number;
  avgDasherWait: number;   // over delivery orders handed so far
  coldOrders: number;
  lateOrders: number;
  revenue: number;
  dollarsAtRisk: number;
  avgTicket: number;
}

export interface BinMetrics {
  start: number;
  orders: number;
  avgTicket: number;
  avgDasherWait: number;
  cold: number;
  late: number;
  fryerLoad: number;  // 0..1+
  grillLoad: number;
  dollarsAtRisk: number;
}

export interface NightMetrics {
  dashersGaveUp: number;
  avgTicket: number;
  p90Ticket: number;
  avgDasherWait: number;
  totalDasherWait: number;
  coldOrders: number;
  lateOrders: number;
  lostOrders: number;
  orders: number;
  revenue: number;
  laborCost: number;
  dollarsAtRisk: number;
  bins: BinMetrics[];
  bottleneck: { station: StationId; start: number; end: number; peakLoad: number };
}

export interface NightResult {
  seed: number;
  metrics: NightMetrics;
  snapshots?: Snapshot[];
  orders?: Order[];
}

export interface MonteCarloSummary {
  nights: number;
  mean: NightMetrics;
  /** mean over worst 10% nights by dollarsAtRisk */
  worst10: Pick<NightMetrics, "avgDasherWait" | "coldOrders" | "dollarsAtRisk">;
  perNight: { seed: number; dollarsAtRisk: number; avgDasherWait: number; coldOrders: number }[];
}

export const SERVICE_START = 16 * 60; // 960
export const SERVICE_END = 22 * 60;   // 1320
export const BIN_MIN = 15;
export const N_BINS = (SERVICE_END - SERVICE_START) / BIN_MIN; // 24

export function fmtClock(t: number): string {
  const h = Math.floor(t / 60) % 24;
  const m = Math.floor(t % 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
export function fmtClockShort(t: number): string {
  const h = Math.floor(t / 60) % 24;
  const m = Math.floor(t % 60);
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${h >= 12 ? "pm" : "am"}` : `${h12}:${m.toString().padStart(2, "0")}`;
}
