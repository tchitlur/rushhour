"use client";
import { memo, useState } from "react";
import DatePicker from "@/components/tonight/DatePicker";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { eventMagnitude, isoToMin } from "@/lib/demand";
import type { EventFact } from "@/lib/intake-types";
import { SERVICE_START, SERVICE_END, fmtClock, fmtClockShort } from "@/sim/types";

/** Pre-game crowds build for ~2.5 h before an event, so anything still running at 2 PM touches a 4–10 PM service. */
const PREGAME_MIN = 120;
const DEFAULT_EVENT_LEN = 180;

function eventEndMin(e: EventFact): number {
  return e.end ? isoToMin(e.end) : isoToMin(e.start) + DEFAULT_EVENT_LEN;
}
/** Does the event (incl. its pre-game build-up) overlap the simulated service window? */
export function affectsService(e: EventFact): boolean {
  const start = isoToMin(e.start);
  return start <= SERVICE_END && eventEndMin(e) >= SERVICE_START - PREGAME_MIN;
}
/** Human impact label + estimated extra orders, from the same magnitude the demand model uses. */
export function impactLabel(m: number): { tag: string; pct: number; hot: boolean } {
  return { tag: m > 0.5 ? "High impact" : m > 0.05 ? "Some impact" : "Low impact", pct: Math.round(m * 35), hot: m > 0.5 };
}

function templateLine(e: EventFact): string {
  const m = eventMagnitude(e);
  const when = fmtClock(isoToMin(e.start));
  if (m > 0.5) return `${e.attendance.toLocaleString()} people ${e.distanceMiles <= 0.5 ? "next door" : `${e.distanceMiles.toFixed(1)} mi away`}; expect a pre-game delivery surge before ${when}.`;
  if (m > 0.05) return `${e.attendance.toLocaleString()} at ${e.venue.split(",")[0]} at ${when}; a modest bump in delivery orders.`;
  return `Small crowd (${e.attendance.toLocaleString()}) ${e.distanceMiles.toFixed(1)} mi away; little effect on tonight.`;
}

function TonightPanel() {
  const { tonightData, tonightLoading, tonightSource, demand, explanations, absentWorker, setAbsentWorker, rainWhatIf, setToggles, tonight, normal, tonightMC, normalMC } = useApp(useShallow(s => ({ tonightData: s.tonightData, tonightLoading: s.tonightLoading, tonightSource: s.tonightSource, demand: s.demand, explanations: s.explanations, absentWorker: s.absentWorker, setAbsentWorker: s.setAbsentWorker, rainWhatIf: s.rainWhatIf, setToggles: s.setToggles, tonight: s.tonight, normal: s.normal, tonightMC: s.tonightMC, normalMC: s.normalMC })));
  const [open, setOpen] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const all = [...(tonightData?.events ?? [])].sort((a, b) => eventMagnitude(b) - eventMagnitude(a));
  const events = all.filter(affectsService);
  const earlier = all.filter(e => !affectsService(e));
  const w = tonightData?.weather;
  const name = tonight.restaurant?.name ?? "Maria's Burgers & Wings";
  const hood = tonight.restaurant?.neighborhood ?? "North Shore, Pittsburgh";
  const place = name.toLowerCase().includes(hood.split(",")[0].toLowerCase()) ? name : `${name} · ${hood}`;
  const disclaimer = tonight.restaurant?.disclaimer ?? "Demo restaurant. Synthetic history, real events and weather.";
  // staff who could call out: the base roster (before tonight's absence is applied), only people with a shift
  const roster = (normal.workers.length ? normal.workers : tonight.workers).filter(wk => wk.shifts.length);
  const absent = roster.find(wk => wk.id === absentWorker) ?? tonight.workers.find(wk => wk.id === absentWorker) ?? null;
  const shiftLabel = (wk: { shifts: { start: number; end: number }[] }) => wk.shifts.length ? `${fmtClockShort(wk.shifts[0].start)}–${fmtClockShort(wk.shifts[0].end)}` : "";
  // expected orders: Monte Carlo means when ready, else the deterministic demand multiplier on the baseline
  const baseOrders = normal.baselineOrdersPerHour.reduce((a, b) => a + b, 0) / 4; // 15-min bins of an hourly rate
  const mult = demand ? demand.bins.reduce((a, b) => a + b.total, 0) / demand.bins.length : 1;
  const expOrders = tonightMC && normalMC ? tonightMC.mean.orders : Math.round(baseOrders * mult);
  const normOrders = tonightMC && normalMC ? normalMC.mean.orders : Math.round(baseOrders);
  const pct = normOrders > 0 ? Math.round((expOrders / normOrders - 1) * 100) : 0;

  const renderEvent = (e: EventFact, muted: boolean) => {
    const m = eventMagnitude(e);
    const { tag, pct: est, hot } = impactLabel(m);
    const isOpen = open === e.id;
    return (
      <div key={e.id} className={`pl-2 border-l-[3px] ${hot && !muted ? "border-l-bad" : "border-l-transparent"} ${muted ? "opacity-70" : ""}`}>
        <button className="w-full text-left py-1.5 flex items-start gap-2 text-xs hover:bg-bg-3" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
          <span className="num text-fg-2 shrink-0 w-[58px] whitespace-nowrap pt-px">{fmtClock(isoToMin(e.start))}</span>
          <span className="font-medium text-fg flex-1 min-w-0 leading-snug" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={e.name}>{e.name}</span>
          <span className="shrink-0 text-right leading-tight">
            <span className={`block font-medium ${hot && !muted ? "text-bad" : "text-fg-2"}`}>{muted ? "No effect" : tag}</span>
            <span className="block num text-fg-3 text-[11px]">{muted ? `${e.distanceMiles.toFixed(1)} mi` : `+${est}% orders est.`}</span>
          </span>
        </button>
        {isOpen && (
          <div className="pb-2 pr-1 text-xs">
            <div className="text-fg-2">{e.type} · {e.venue.split(",")[0]} · <span className="num">{e.distanceMiles.toFixed(1)} mi</span> · ~<span className="num">{e.attendance.toLocaleString()}</span> people · {e.impact === "both" ? "delivery up, walk-in down" : e.impact === "delivery_up" ? "delivery up" : e.impact === "dine_in_down" ? "walk-in down" : "neutral"} · confidence <span className="num">{Math.round(e.confidence * 100)}%</span></div>
            <div className="text-fg mt-1">{muted ? `Ends around ${fmtClock(eventEndMin(e))}, before the dinner rush; no effect on tonight's orders.` : (explanations[e.id] ?? templateLine(e))}</div>
            <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-fg-2 underline underline-offset-2 hover:text-fg">{e.source === "web_search" ? "web source" : e.source === "cache" ? "cached source" : "Ticketmaster"}</a>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <div className="panel-title">Tonight</div>
          {tonightSource && <span className={`chip ${tonightSource === "live" ? "!text-ok !border-ok" : ""}`} title={tonightSource === "live" ? "Fetched live just now" : "Served from committed cache of real data"}>{tonightSource === "live" ? "live data" : tonightSource === "mixed" ? "live + cached" : "cached"}</span>}
        </div>
        <div className="mt-1 text-xl font-semibold leading-tight">{tonightData ? fmtDate(tonightData.date) : "Loading…"}</div>
        <div className="sub mt-0.5">{place}</div>
        <div className="mt-2"><DatePicker /></div>
      </div>

      {tonightLoading && !tonightData && <div className="text-sm text-fg-2">Pulling real events (Ticketmaster), weather (Open-Meteo) and local happenings (web search)…</div>}

      {tonightData && (
        <div className="border-t border-line pt-3">
          <div className="flex items-baseline gap-2">
            <span className="num text-[28px] font-medium leading-none text-fg">{Math.round(expOrders)}</span>
            <span className="text-xs text-fg-2">orders expected · a normal night is <span className="num">{Math.round(normOrders)}</span> <span className={`num font-semibold ${pct > 0 ? "text-bad" : "text-fg"}`}>({pct >= 0 ? "+" : "−"}{Math.abs(pct)}%)</span></span>
          </div>
          {demand && <div className="text-sm font-medium mt-1.5">{demand.peakLabel}</div>}
          {demand && <div className="text-xs text-fg-2"><span className="num">{Math.round(demand.deliveryShare * 100)}%</span> delivery (normally <span className="num">{Math.round((tonight.channelMix.doordash + tonight.channelMix.ubereats) * 100)}%</span>)</div>}
          {w && <div className="text-xs text-fg-2 mt-1 flex items-baseline justify-between gap-2"><span>{w.summary}</span><a href={w.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 underline underline-offset-2 hover:text-fg">{w.source === "cache" ? "cached" : "Open-Meteo"}</a></div>}
          <DemandCurve />
        </div>
      )}

      {tonightData && (
        <div className="border-t border-line pt-3">
          <div className="panel-title mb-1.5">Events nearby <span className="num text-fg-2 font-normal">({events.length})</span></div>
          {events.length === 0 && <div className="text-xs text-fg-3">Nothing during the dinner window. Baseline night.</div>}
          {events.length > 0 && (
            <div className="flex flex-col divide-y divide-line border-y border-line">
              {events.slice(0, 8).map(e => renderEvent(e, false))}
            </div>
          )}
          {earlier.length > 0 && (
            <div className="mt-2">
              <button className="text-left text-xs text-fg-2 underline underline-offset-2 hover:text-fg" onClick={() => setShowEarlier(v => !v)} aria-expanded={showEarlier}>Earlier today · no effect on the rush <span className="num">({earlier.length})</span></button>
              {showEarlier && (
                <div className="flex flex-col divide-y divide-line border-y border-line mt-1.5">
                  {earlier.slice(0, 8).map(e => renderEvent(e, true))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-line pt-3 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm">
          <span className="shrink-0">One cook calls out</span>
          <select aria-label="Who calls out tonight" className="num text-xs border border-line rounded px-1.5 py-1 bg-bg-2 text-fg flex-1 min-w-0" value={absentWorker ?? ""} onChange={e => setAbsentWorker(e.target.value || null)}>
            <option value="">Nobody</option>
            {roster.map(wk => <option key={wk.id} value={wk.id}>{wk.name} ({shiftLabel(wk)})</option>)}
            {absent && !roster.some(wk => wk.id === absent.id) && <option value={absent.id}>{absent.name}</option>}
          </select>
        </label>
        {absent && <div className="text-[11px] text-fg-2 -mt-0.5">{absent.name} is off tonight{shiftLabel(absent) ? ` (${shiftLabel(absent)} shift)` : ""}; the kitchen runs short-handed.</div>}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={rainWhatIf} onChange={e => setToggles({ rainWhatIf: e.target.checked })} className="accent-[#16191D]" />
          <span>What-if: rain <span className="num">6–9 PM</span> <span className="text-fg-2 text-xs">(not in the forecast)</span></span>
        </label>
        <div className="text-[11px] text-fg-3">{disclaimer}</div>
        <div className="text-[11px] text-fg-3">Demand = event size × proximity × timing + weather, capped 0.7×–1.8×.</div>
      </div>
    </div>
  );
}

function DemandCurve() {
  const { tonight, normal } = useApp(useShallow(s => ({ tonight: s.tonight, normal: s.normal })));
  const W = 260, H = 70;
  const n = tonight.baselineOrdersPerHour.length;
  const base = normal.baselineOrdersPerHour;
  const tonightOph = tonight.baselineOrdersPerHour.map((o, i) => { const b = tonight.demand[i]; let m = 0; for (const ch of ["doordash", "ubereats", "phone", "counter"] as const) m += b.mult[ch] * tonight.channelMix[ch]; return o * m; });
  const max = Math.max(...tonightOph, ...base) * 1.1;
  const pt = (v: number, i: number) => `${(i / (n - 1)) * W},${H - (v / max) * H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full mt-2" style={{ fontFamily: "var(--font-mono)" }}>
      {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={0} x2={W} y1={H - f * H} y2={H - f * H} stroke="#E5E7EB" strokeWidth={1} />)}
      <line x1={0} x2={W} y1={H} y2={H} stroke="#DADDE2" strokeWidth={1} />
      <path d={`M0,${H} ` + tonightOph.map((v, i) => "L" + pt(v, i)).join(" ") + ` L${W},${H} Z`} fill="#C2410C" opacity={0.08} />
      <polyline points={base.map(pt).join(" ")} fill="none" stroke="#8A93A0" strokeWidth={1.25} strokeDasharray="3 3" />
      <polyline points={tonightOph.map(pt).join(" ")} fill="none" stroke="#C2410C" strokeWidth={1.5} />
      {[16, 18, 20, 22].map(h => <text key={h} x={((h * 60 - SERVICE_START) / (SERVICE_END - SERVICE_START)) * W} y={H + 11} fontSize={9} fill="#5A6370" textAnchor={h === 22 ? "end" : h === 16 ? "start" : "middle"}>{fmtClockShort(h * 60)}</text>)}
      <text x={W} y={10} fontSize={9} fill="#C2410C" textAnchor="end" fontFamily="var(--font-sans)">tonight</text>
      <text x={W} y={20} fontSize={9} fill="#5A6370" textAnchor="end" fontFamily="var(--font-sans)">baseline</text>
    </svg>
  );
}

/** "Fri, Nov 13" */
export function fmtDate(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default memo(TonightPanel);
