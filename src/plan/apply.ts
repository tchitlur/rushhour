// Apply interventions and Ask-anything patches to a Scenario. Pure; never mutates the input.
import type { Channel, Scenario, Shift, StationId } from "@/sim/types";
import { CHANNELS, SERVICE_END, SERVICE_START, fmtClockShort } from "@/sim/types";
import { CHANNEL_LABEL } from "@/sim/layout";
import { applyDemandWindow, cloneScenario } from "@/sim/scenario";
import type { Intervention, ScenarioPatch } from "./types";

const clampT = (t: number) => Math.max(SERVICE_START, Math.min(SERVICE_END, t));

/** Merge overlapping / touching shifts into a sorted, non-overlapping list. */
export function mergeShifts(shifts: Shift[]): Shift[] {
  const sorted = shifts
    .map(s => ({ start: clampT(s.start), end: clampT(s.end) }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const out: Shift[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** Remove [start,end) from a list of shifts (splitting shifts that span the window). */
export function cutShifts(shifts: Shift[], start: number, end: number): Shift[] {
  const out: Shift[] = [];
  for (const s of shifts) {
    if (s.end <= start || s.start >= end) { out.push({ ...s }); continue; }
    if (s.start < start) out.push({ start: s.start, end: start });
    if (s.end > end) out.push({ start: end, end: s.end });
  }
  return mergeShifts(out);
}

/** Override quoted prep in [start,end) keeping other windows intact; result stays contiguous over 960..1320. */
export function setQuotedPrep(windows: Scenario["quotedPrep"], start: number, end: number, minutes: number): Scenario["quotedPrep"] {
  start = clampT(start); end = clampT(end);
  if (end <= start) return windows.map(w => ({ ...w }));
  // Normalise the existing windows to a contiguous cover first (engine default is 15 min where nothing is set).
  const base = [...windows].sort((a, b) => a.start - b.start);
  const cover: Scenario["quotedPrep"] = [];
  let cursor = SERVICE_START;
  for (const w of base) {
    const ws = Math.max(cursor, clampT(w.start)), we = clampT(w.end);
    if (ws > cursor) cover.push({ start: cursor, end: ws, minutes: 15 });
    if (we > ws) { cover.push({ start: ws, end: we, minutes: w.minutes }); cursor = we; }
  }
  if (cursor < SERVICE_END) cover.push({ start: cursor, end: SERVICE_END, minutes: 15 });
  const out: Scenario["quotedPrep"] = [];
  for (const w of cover) {
    if (w.end <= start || w.start >= end) { out.push({ ...w }); continue; }
    if (w.start < start) out.push({ start: w.start, end: start, minutes: w.minutes });
    if (w.end > end) out.push({ start: end, end: w.end, minutes: w.minutes });
  }
  out.push({ start, end, minutes });
  out.sort((a, b) => a.start - b.start);
  // merge adjacent windows with identical minutes
  const merged: Scenario["quotedPrep"] = [];
  for (const w of out) {
    const last = merged[merged.length - 1];
    if (last && last.minutes === w.minutes && last.end === w.start) last.end = w.end;
    else merged.push({ ...w });
  }
  return merged;
}

function resolveItemId(sc: Scenario, item: string): string {
  const key = item.trim().toLowerCase();
  const byId = sc.menu.find(m => m.id.toLowerCase() === key);
  if (byId) return byId.id;
  const byName = sc.menu.find(m => m.name.toLowerCase() === key || m.name.toLowerCase().startsWith(key));
  return byName ? byName.id : item;
}

function applyInPlace(sc: Scenario, iv: Intervention): void {
  switch (iv.type) {
    case "add_shift": {
      const w = sc.workers.find(w => w.id === iv.worker);
      if (w && iv.end > iv.start) w.shifts = mergeShifts([...w.shifts, { start: iv.start, end: iv.end }]);
      break;
    }
    case "prep_batch": {
      sc.prepBatches.push({ item: resolveItemId(sc, iv.item), qty: iv.qty, time: iv.time });
      break;
    }
    case "quote_prep_time": {
      sc.quotedPrep = setQuotedPrep(sc.quotedPrep, iv.start, iv.end, iv.minutes);
      break;
    }
    case "throttle_channel": {
      if (iv.end > iv.start) sc.channelPauses.push({ channel: iv.channel, start: iv.start, end: iv.end });
      break;
    }
    case "reassign_worker": {
      // The engine has no time-windowed skills: approximate the reassignment for the whole night.
      const w = sc.workers.find(w => w.id === iv.worker);
      if (!w) break;
      const skills: Partial<Record<StationId, number>> = {};
      for (const [st, v] of Object.entries(w.skills) as [StationId, number][]) skills[st] = v * (st === iv.station ? 1.25 : 0.85);
      if (skills[iv.station] == null) skills[iv.station] = 1.25;
      w.skills = skills;
      break;
    }
    case "move_station": {
      const st = sc.stations.find(s => s.id === iv.station);
      if (st) { st.x = iv.x; st.y = iv.y; }
      break;
    }
  }
}

export function applyIntervention(sc: Scenario, iv: Intervention): Scenario {
  const out = cloneScenario(sc);
  applyInPlace(out, iv);
  return out;
}

export function applyInterventions(sc: Scenario, ivs: Intervention[]): Scenario {
  const out = cloneScenario(sc);
  for (const iv of ivs) applyInPlace(out, iv);
  return out;
}

export function applyPatch(sc: Scenario, patch: ScenarioPatch): Scenario {
  const out = cloneScenario(sc);
  for (const d of patch.demand ?? []) {
    const factor: Partial<Record<Channel, number>> = {};
    if (d.channel === "all") for (const ch of CHANNELS) factor[ch] = d.factor;
    else factor[d.channel] = d.factor;
    applyDemandWindow(out, d.start, d.end, factor);
  }
  for (const s of patch.staff ?? []) {
    const w = out.workers.find(w => w.id === s.worker);
    if (!w) continue;
    if (s.action === "absent") {
      w.shifts = s.start != null || s.end != null ? cutShifts(w.shifts, s.start ?? SERVICE_START, s.end ?? SERVICE_END) : [];
    } else if (s.action === "add") {
      w.shifts = mergeShifts([...w.shifts, { start: s.start ?? SERVICE_START, end: s.end ?? SERVICE_END }]);
    } else if (s.action === "late") {
      const start = s.start ?? SERVICE_START + 60;
      w.shifts = mergeShifts(w.shifts.map(sh => ({ start: Math.max(sh.start, start), end: sh.end })));
    }
  }
  for (const e of patch.equipment ?? []) {
    if (e.end > e.start) out.outages.push({ station: e.station, start: e.start, end: e.end, capacity: e.capacity });
  }
  for (const m of patch.menu ?? []) {
    const id = resolveItemId(out, m.item);
    if (m.action === "remove") { if (!out.removedItems.includes(id)) out.removedItems.push(id); }
    else {
      const f = m.factor ?? (m.action === "boost" ? 1.5 : 0.5);
      out.mixShift[id] = (out.mixShift[id] ?? 1) * f;
    }
  }
  for (const p of patch.channelPauses ?? []) {
    if (p.end > p.start) out.channelPauses.push({ channel: p.channel, start: p.start, end: p.end });
  }
  for (const q of patch.quotedPrep ?? []) out.quotedPrep = setQuotedPrep(out.quotedPrep, q.start, q.end, q.minutes);
  for (const l of patch.layout ?? []) {
    const st = out.stations.find(s => s.id === l.station);
    if (st) { st.x = l.x; st.y = l.y; }
  }
  for (const b of patch.bigOrders ?? []) {
    out.bigOrders.push({ time: b.time, channel: b.channel, items: b.items.map(i => ({ item: resolveItemId(out, i.item), qty: i.qty })) });
  }
  return out;
}

// ---------- labels ----------
export const STATION_LABEL: Record<StationId, string> = { grill: "Grill", fryer: "Fryer", cold: "Cold station", pack: "Pack", counter: "Counter" };

export function fmtRange(start: number, end: number): string {
  return `${fmtClockShort(start)}–${fmtClockShort(end)}`;
}
const workerName = (sc: Scenario | undefined, id: string) => sc?.workers.find(w => w.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
const channelLabel = (ch: Channel) => CHANNEL_LABEL[ch];

export function patchChips(patch: ScenarioPatch, sc?: Scenario): string[] {
  const chips: string[] = [];
  for (const d of patch.demand ?? []) {
    const who = d.channel === "all" ? "All orders" : channelLabel(d.channel);
    chips.push(`${who} ×${trim(d.factor)} ${fmtRange(d.start, d.end)}`);
  }
  for (const s of patch.staff ?? []) {
    const name = workerName(sc, s.worker);
    if (s.action === "absent") chips.push(s.start != null || s.end != null ? `${name} out ${fmtRange(s.start ?? SERVICE_START, s.end ?? SERVICE_END)}` : `${name} out`);
    else if (s.action === "add") chips.push(`${name} in ${fmtRange(s.start ?? SERVICE_START, s.end ?? SERVICE_END)}`);
    else chips.push(`${name} late until ${fmtClockShort(s.start ?? SERVICE_START + 60)}`);
  }
  for (const e of patch.equipment ?? []) {
    const st = STATION_LABEL[e.station];
    chips.push(e.capacity === 0 ? `${st} down ${fmtRange(e.start, e.end)}` : `${st} at capacity ${e.capacity} ${fmtRange(e.start, e.end)}`);
  }
  for (const m of patch.menu ?? []) {
    const name = sc ? (sc.menu.find(x => x.id === resolveItemId(sc, m.item))?.name ?? m.item) : m.item;
    if (m.action === "remove") chips.push(`86 ${name}`);
    else chips.push(`${name} ×${trim(m.factor ?? (m.action === "boost" ? 1.5 : 0.5))}`);
  }
  for (const p of patch.channelPauses ?? []) {
    const ch = channelLabel(p.channel).toLowerCase();
    chips.push(p.end >= SERVICE_END ? `No ${ch} orders after ${fmtClockShort(p.start)}` : `No ${ch} orders ${fmtRange(p.start, p.end)}`);
  }
  for (const q of patch.quotedPrep ?? []) chips.push(`Quote ${q.minutes} min ${fmtRange(q.start, q.end)}`);
  for (const l of patch.layout ?? []) chips.push(`${STATION_LABEL[l.station]} moved to (${trim(l.x)}, ${trim(l.y)})`);
  for (const b of patch.bigOrders ?? []) {
    const items = b.items.map(i => `${i.qty} ${i.item}`).join(" + ");
    chips.push(`Catering: ${items} at ${fmtClockShort(b.time)} (${channelLabel(b.channel).toLowerCase()})`);
  }
  return chips;
}

export function interventionTitle(iv: Intervention, sc?: Scenario): string {
  switch (iv.type) {
    case "add_shift": return `Call in ${workerName(sc, iv.worker)} ${fmtRange(iv.start, iv.end)}`;
    case "prep_batch": return `Par-cook ${iv.qty} ${iv.item} at ${fmtClockShort(iv.time)}`;
    case "quote_prep_time": return `Quote ${iv.minutes} min prep ${fmtRange(iv.start, iv.end)}`;
    case "throttle_channel": return `Pause ${channelLabel(iv.channel)} ${fmtRange(iv.start, iv.end)}`;
    case "reassign_worker": return `Put ${workerName(sc, iv.worker)} on the ${STATION_LABEL[iv.station].toLowerCase()} ${fmtRange(iv.start, iv.end)}`;
    case "move_station": {
      const pack = sc?.stations.find(s => s.id === "pack");
      const nearPack = pack && Math.hypot(pack.x - iv.x, pack.y - iv.y) <= 3;
      return nearPack ? `Move ${STATION_LABEL[iv.station]} next to Pack` : `Move ${STATION_LABEL[iv.station]} to (${trim(iv.x)}, ${trim(iv.y)})`;
    }
  }
}

const trim = (n: number) => (Math.round(n * 100) / 100).toString();
