// Deterministic, documented demand model: real-world facts (events, weather) -> per-15-min, per-channel multipliers.
// Pure; shared by client and server. See README "Demand formula".
import type { EventFact, TonightData, WeatherFacts } from "./intake-types";
import type { Scenario, Channel, StationId } from "@/sim/types";
import { CHANNELS, SERVICE_START, SERVICE_END, BIN_MIN } from "@/sim/types";
import { baseScenario, cloneScenario, removeWorker } from "@/sim/scenario";

export const MULT_MIN = 0.7, MULT_MAX = 1.8;

/** Minutes since midnight (local) from an ISO local string like 2026-11-13T19:00:00. */
export function isoToMin(iso: string): number {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}

/** Event "magnitude" in [0,1]: size × proximity × confidence. 68,400 people next door = 1. */
export function eventMagnitude(e: EventFact): number {
  const size = Math.min(1, Math.max(0.03, e.attendance / 68400));
  const prox = Math.max(0, 1 - e.distanceMiles / 3);
  return size * prox * e.confidence;
}

export type Contribution = Record<Channel, number>; // additive deltas, e.g. +0.35 => ×1.35

const zero = (): Contribution => ({ doordash: 0, ubereats: 0, phone: 0, counter: 0 });

/**
 * Per-event contribution for a bin starting at `t`:
 *  pre-window (start−150 min .. start): crowd arriving nearby → delivery +0.35m, counter +0.25m, phone +0.20m
 *  during (start .. end): at-home viewers / neighbors order in → delivery +0.45m; walk-ins drop (counter −0.15m) for "both"
 *  post (end .. end+60): exodus → counter +0.30m, delivery +0.10m
 *  impact "dine_in_down": counter −0.10m during; "neutral": halves everything.
 */
export function eventContribution(e: EventFact, t: number): Contribution {
  const c = zero();
  const m = eventMagnitude(e);
  if (m <= 0) return c;
  const start = isoToMin(e.start);
  const end = e.end ? isoToMin(e.end) : start + 180;
  const k = e.impact === "neutral" ? 0.5 : 1;
  if (t >= start - 150 && t < start) {
    c.doordash += 0.35 * m * k; c.ubereats += 0.35 * m * k; c.phone += 0.2 * m * k; c.counter += 0.25 * m * k;
  } else if (t >= start && t < end) {
    c.doordash += 0.45 * m * k; c.ubereats += 0.45 * m * k; c.phone += 0.1 * m * k;
    if (e.impact === "both") c.counter -= 0.15 * m;
    if (e.impact === "dine_in_down") c.counter -= 0.1 * m;
  } else if (t >= end && t < end + 60) {
    c.counter += 0.3 * m * k; c.doordash += 0.1 * m * k; c.ubereats += 0.1 * m * k;
  }
  return c;
}

/** Weather contribution per hour: rain/snow push orders to delivery and keep walk-ins home; cold/fog mildly. */
export function weatherContribution(w: WeatherFacts | null, t: number): Contribution {
  const c = zero();
  if (!w) return c;
  const hour = Math.floor(t / 60);
  const h = w.hourly.find(x => parseInt(x.time.slice(11, 13)) === hour);
  if (!h) return c;
  const wet = h.precipIn >= 0.02 || (h.precipProb ?? 0) >= 60 || (h.code >= 61 && h.code <= 82) || (h.code >= 71 && h.code <= 77);
  if (wet) { c.doordash += 0.12; c.ubereats += 0.12; c.counter -= 0.15; c.phone += 0.03; }
  else if (h.tempF < 40 || (h.code >= 45 && h.code <= 48)) { c.doordash += 0.05; c.ubereats += 0.05; c.counter -= 0.05; }
  return c;
}

export interface DemandBreakdown {
  bins: { start: number; mult: Record<Channel, number>; total: number }[];
  /** peak window summary for copy: e.g. "+38% 6:30–8:00, shifted toward delivery" */
  peakLabel: string;
  deliveryShare: number; // share of tonight's orders that are delivery
}

export function computeDemand(events: EventFact[], weather: WeatherFacts | null, mix: Record<Channel, number>): DemandBreakdown {
  const bins = [];
  for (let t = SERVICE_START; t < SERVICE_END; t += BIN_MIN) {
    const sum = zero();
    for (const e of events) { const c = eventContribution(e, t); for (const ch of CHANNELS) sum[ch] += c[ch]; }
    const wc = weatherContribution(weather, t); for (const ch of CHANNELS) sum[ch] += wc[ch];
    const mult = {} as Record<Channel, number>;
    let total = 0;
    for (const ch of CHANNELS) { mult[ch] = Math.min(MULT_MAX, Math.max(MULT_MIN, 1 + sum[ch])); total += mult[ch] * mix[ch]; }
    bins.push({ start: t, mult, total });
  }
  // peak: best contiguous 90-min window by total
  let best = { i: 0, v: 0 };
  for (let i = 0; i + 6 <= bins.length; i++) { const v = bins.slice(i, i + 6).reduce((a, b) => a + b.total, 0) / 6; if (v > best.v) best = { i, v }; }
  const pct = Math.round((best.v - 1) * 100);
  const s = bins[best.i].start, e = s + 90;
  const fmt = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${(m % 60).toString().padStart(2, "0")}`;
  const delivNow = bins.reduce((a, b) => a + (b.mult.doordash * mix.doordash + b.mult.ubereats * mix.ubereats), 0);
  const allNow = bins.reduce((a, b) => a + b.total, 0);
  const deliveryShare = delivNow / allNow;
  const baseShare = mix.doordash + mix.ubereats;
  const peakLabel = pct >= 3 ? `${pct > 0 ? "+" : ""}${pct}% ${fmt(s)}–${fmt(e)}${deliveryShare > baseShare + 0.02 ? ", shifted toward delivery" : ""}` : "about a normal night";
  return { bins, peakLabel, deliveryShare };
}

export interface TonightOptions { /** worker id who calls out tonight (null = nobody). Legacy `jakeOut` maps to "jake". */ absentWorker?: string | null; rainWhatIf?: boolean; jakeOut?: boolean }
export function resolveAbsent(opts: TonightOptions): string | null {
  if (opts.absentWorker !== undefined) return opts.absentWorker;
  return opts.jakeOut === false ? null : "jake";
}
function fmtShift(w: { shifts: { start: number; end: number }[] }): string {
  const s = w.shifts[0]; if (!s) return "";
  const h = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""}`;
  return `${h(s.start)}–${h(s.end)} PM shift`;
}

/** Build tonight's scenario from real facts (+ the synthetic staffing story). */
export function buildTonightScenario(data: TonightData, opts: TonightOptions = {}, base?: Scenario): Scenario {
  const sc = base ? { ...cloneScenario(base), date: data.date, label: "Tonight (as planned)" } : baseScenario(data.date, "Tonight (as planned)");
  sc.id = "tonight";
  const d = computeDemand(data.events, data.weather, sc.channelMix);
  sc.demand = d.bins.map(b => ({ start: b.start, mult: { ...b.mult } }));
  if (opts.rainWhatIf) for (const b of sc.demand) if (b.start >= 18 * 60 && b.start < 21 * 60) { b.mult.doordash = Math.min(MULT_MAX, b.mult.doordash * 1.12); b.mult.ubereats = Math.min(MULT_MAX, b.mult.ubereats * 1.12); b.mult.counter = Math.max(MULT_MIN, b.mult.counter * 0.85); }
  const notes: string[] = [];
  const top = [...data.events].sort((a, b) => eventMagnitude(b) - eventMagnitude(a)).filter(e => eventMagnitude(e) > 0.01);
  for (const e of top.slice(0, 3)) notes.push(`${e.name.length > 48 ? e.name.slice(0, 46) + "…" : e.name} · ${fmtT(isoToMin(e.start))}`);
  if (data.weather) notes.push(data.weather.summary);
  if (opts.rainWhatIf) notes.push("What-if: rain 6–9 PM");
  const absentId = resolveAbsent(opts);
  const absentW = absentId ? sc.workers.find(w => w.id === absentId && w.shifts.length) : undefined;
  if (absentW) { notes.push(`${absentW.name} called out (${fmtShift(absentW)})`); removeWorker(sc, absentW.id); }
  sc.notes = notes;
  return sc;
}

export function fmtT(m: number) { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${mm.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }

/** Factor definitions for "Why": each one toggles a real cause on/off. Baseline = all off. */
export interface FactorDef { id: string; label: string; station?: StationId; apply: (sc: Scenario) => Scenario }

export function tonightFactors(data: TonightData, opts: TonightOptions = {}, restaurantBase?: Scenario): { base: Scenario; factors: FactorDef[] } {
  const base = restaurantBase ? { ...cloneScenario(restaurantBase), date: data.date, label: "Without tonight's causes" } : baseScenario(data.date, "Without tonight's causes");
  const sorted = [...data.events].filter(e => eventMagnitude(e) > 0.01).sort((a, b) => eventMagnitude(b) - eventMagnitude(a));
  const major = sorted.slice(0, 2);
  const rest = sorted.slice(2);
  const factors: FactorDef[] = [];
  const mkEventFactor = (id: string, label: string, evs: EventFact[]): FactorDef => ({
    id, label, station: "fryer",
    apply: (sc) => { const c = cloneScenario(sc); const d = computeDemand(evs, null, c.channelMix); for (let i = 0; i < c.demand.length; i++) for (const ch of CHANNELS) c.demand[i].mult[ch] = Math.min(MULT_MAX, Math.max(MULT_MIN, c.demand[i].mult[ch] * d.bins[i].mult[ch])); return c; },
  });
  for (const e of major) factors.push(mkEventFactor(`event_${e.id}`, shortName(e), [e]));
  if (rest.length) factors.push(mkEventFactor("events_other", `${rest.length} smaller events`, rest));
  if (data.weather) factors.push({ id: "weather", label: weatherLabel(data.weather), station: "pack", apply: (sc) => { const c = cloneScenario(sc); const d = computeDemand([], data.weather, c.channelMix); for (let i = 0; i < c.demand.length; i++) for (const ch of CHANNELS) c.demand[i].mult[ch] = Math.min(MULT_MAX, Math.max(MULT_MIN, c.demand[i].mult[ch] * d.bins[i].mult[ch])); return c; } });
  if (opts.rainWhatIf) factors.push({ id: "rain", label: "Rain (what-if)", station: "pack", apply: (sc) => { const c = cloneScenario(sc); for (const b of c.demand) if (b.start >= 18 * 60 && b.start < 21 * 60) { b.mult.doordash = Math.min(MULT_MAX, b.mult.doordash * 1.12); b.mult.ubereats = Math.min(MULT_MAX, b.mult.ubereats * 1.12); b.mult.counter = Math.max(MULT_MIN, b.mult.counter * 0.85); } return c; } });
  const absentId2 = resolveAbsent(opts);
  const absentW2 = absentId2 ? base.workers.find(w => w.id === absentId2 && w.shifts.length) : undefined;
  if (absentW2) factors.push({ id: "jake_absent", label: `${absentW2.name} called out`, station: "grill", apply: (sc) => { const c = cloneScenario(sc); removeWorker(c, absentW2.id); return c; } });
  return { base, factors: factors.slice(0, 5) };
}

function shortName(e: EventFact): string {
  const n = e.name;
  if (/panthers.*florida/i.test(n)) return "Pitt–FSU game crowd";
  if (/steelers/i.test(n)) return "Steelers game crowd";
  if (/penguins/i.test(n)) return "Penguins game crowd";
  if (/pirates/i.test(n)) return "Pirates game crowd";
  const short = n.split(/ w\/ | with | - |: /)[0];
  return (short.length > 26 ? short.slice(0, 24) + "…" : short) + (e.type.toLowerCase().includes("concert") ? " concert" : "");
}
function weatherLabel(w: WeatherFacts): string {
  if (w.rainEvening) return "Rain";
  const s = w.summary.toLowerCase();
  if (s.includes("snow")) return "Fog & snow chance";
  if (s.includes("fog")) return "Fog & cold";
  return "Weather";
}
