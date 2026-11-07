// Rule-based candidate interventions (no LLM). Deterministic from the bottleneck report.
import type { Scenario } from "@/sim/types";
import { SERVICE_END, SERVICE_START, fmtClockShort } from "@/sim/types";
import type { BottleneckReport, Intervention } from "./types";

const clamp = (t: number) => Math.max(SERVICE_START, Math.min(SERVICE_END, t));
const onShift = (sc: Scenario, id: string, start: number, end: number) =>
  sc.workers.find(w => w.id === id)?.shifts.some(s => s.start <= start && s.end >= end) ?? false;

type WorkerId = string;
const isWorkerId = (id: string): id is WorkerId => id.length > 0;

export function ruleBasedProposals(sc: Scenario, report: BottleneckReport): Intervention[] {
  const out: Intervention[] = [];
  const { start: ws, end: we } = report.window;
  const mid = (ws + we) / 2;

  // 1. Call in an off-shift worker for 3 hours around the bottleneck (prefer Ana).
  const shiftStart = clamp(Math.floor((mid - 90) / 60) * 60);
  const shiftEnd = clamp(shiftStart + 180);
  // never propose calling in the person who called out tonight
  const calledOut = (id: string) => (sc.notes ?? []).some(n => { const w = sc.workers.find(x => x.id === id); return !!w && n.startsWith(`${w.name} called out`); });
  const off = [...sc.workers].sort((a, b) => (a.id === "ana" ? -1 : b.id === "ana" ? 1 : 0)).find(w => isWorkerId(w.id) && !calledOut(w.id) && !onShift(sc, w.id, shiftStart, shiftEnd));
  if (off && isWorkerId(off.id)) {
    out.push({ type: "add_shift", worker: off.id, start: shiftStart, end: shiftEnd, rationale: `Extra hands through the ${fmtClockShort(ws)}–${fmtClockShort(we)} crunch at ${report.station}.` });
  }

  // 2. Par-cook wings 30 min before the fryer window.
  if (report.station === "fryer") {
    out.push({ type: "prep_batch", item: "wings", qty: 30, time: clamp(ws - 30), rationale: "Wings are the longest fryer item; par-cooking frees baskets during the peak." });
  }

  // 3. Quote a longer prep time when Dashers are waiting.
  if (report.peakDasherWaitBin.avgDasherWait > 5) {
    out.push({ type: "quote_prep_time", start: clamp(ws - 30), end: clamp(we + 30), minutes: 22, rationale: `Dashers wait ${Math.round(report.peakDasherWaitBin.avgDasherWait)} min at peak; a longer quote staggers arrivals.` });
  }

  // 4. Pause Uber Eats for the peak 45 minutes.
  const peak = report.peakDasherWaitBin.start;
  out.push({ type: "throttle_channel", channel: "ubereats", start: clamp(peak - 15), end: clamp(peak + 30), rationale: "Shed the smallest delivery channel exactly when the fryer is jammed." });

  // 5. Put the fastest fryer hand on the fryer during the window.
  const fryerHands = sc.workers.filter(w => isWorkerId(w.id) && w.shifts.length > 0 && (w.skills.fryer ?? 0) > 0).sort((a, b) => (b.skills.fryer ?? 0) - (a.skills.fryer ?? 0));
  const best = fryerHands[0];
  if (best && isWorkerId(best.id) && report.station === "fryer") {
    out.push({ type: "reassign_worker", worker: best.id, station: "fryer", start: ws, end: we, rationale: `${best.name} is the fastest on the fryer; approximated for the whole night.` });
  }

  // 6. Move the fryer next to pack.
  const pack = sc.stations.find(s => s.id === "pack");
  const fryer = sc.stations.find(s => s.id === "fryer");
  if (pack && fryer && report.station === "fryer") {
    const x = Math.max(0.5, Math.min(11.5, pack.x - 2.4)), y = Math.max(0.5, Math.min(7.5, pack.y));
    if (Math.hypot(fryer.x - x, fryer.y - y) > 0.5) {
      out.push({ type: "move_station", station: "fryer", x, y, rationale: "Shorter walk between fryer and pack." });
    }
  }

  // 7. Deliberately weak candidate so the UI shows a rejected card.
  out.push({ type: "prep_batch", item: "salad", qty: 20, time: 17 * 60, rationale: "Pre-chop salads early (cold station is not the bottleneck)." });

  return out.slice(0, 7);
}
