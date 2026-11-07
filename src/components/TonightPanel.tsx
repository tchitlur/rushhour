"use client";
import { memo, useState } from "react";
import DatePicker from "@/components/tonight/DatePicker";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { eventMagnitude, isoToMin, fmtT } from "@/lib/demand";
import type { EventFact } from "@/lib/intake-types";
import { SERVICE_START, SERVICE_END, fmtClockShort } from "@/sim/types";

function templateLine(e: EventFact): string {
  const m = eventMagnitude(e);
  const when = fmtT(isoToMin(e.start));
  if (m > 0.5) return `${e.attendance.toLocaleString()} people ${e.distanceMiles <= 0.5 ? "next door" : `${e.distanceMiles.toFixed(1)} mi away`}; expect a pre-game delivery surge before ${when}.`;
  if (m > 0.05) return `${e.attendance.toLocaleString()} at ${e.venue.split(",")[0]} at ${when}; a modest bump in delivery orders.`;
  return `Small crowd (${e.attendance.toLocaleString()}) ${e.distanceMiles.toFixed(1)} mi away; little effect on tonight.`;
}

function TonightPanel() {
  const { tonightData, tonightLoading, tonightSource, demand, explanations, jakeOut, rainWhatIf, setToggles, tonight, normal, tonightMC, normalMC } = useApp(useShallow(s => ({ tonightData: s.tonightData, tonightLoading: s.tonightLoading, tonightSource: s.tonightSource, demand: s.demand, explanations: s.explanations, jakeOut: s.jakeOut, rainWhatIf: s.rainWhatIf, setToggles: s.setToggles, tonight: s.tonight, normal: s.normal, tonightMC: s.tonightMC, normalMC: s.normalMC })));
  const [open, setOpen] = useState<string | null>(null);
  const events = [...(tonightData?.events ?? [])].sort((a, b) => eventMagnitude(b) - eventMagnitude(a));
  const w = tonightData?.weather;
  const name = tonight.restaurant?.name ?? "Maria's Burgers & Wings";
  const hood = tonight.restaurant?.neighborhood ?? "North Shore, Pittsburgh";
  // expected orders: Monte Carlo means when ready, else the deterministic demand multiplier on the baseline
  const baseOrders = normal.baselineOrdersPerHour.reduce((a, b) => a + b, 0) / 4; // 15-min bins of an hourly rate
  const mult = demand ? demand.bins.reduce((a, b) => a + b.total, 0) / demand.bins.length : 1;
  const expOrders = tonightMC && normalMC ? tonightMC.mean.orders : Math.round(baseOrders * mult);
  const normOrders = tonightMC && normalMC ? normalMC.mean.orders : Math.round(baseOrders);
  const pct = normOrders > 0 ? Math.round((expOrders / normOrders - 1) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <div className="panel-title">Tonight</div>
          {tonightSource && <span className={`chip ${tonightSource === "live" ? "!text-ok !border-ok" : ""}`} title={tonightSource === "live" ? "Fetched live just now" : "Served from committed cache of real data"}>{tonightSource === "live" ? "live data" : tonightSource === "mixed" ? "live + cached" : "cached"}</span>}
        </div>
        <div className="mt-1 text-xl font-semibold leading-tight">{tonightData ? fmtDate(tonightData.date) : "Loading…"}</div>
        <div className="sub mt-0.5">{name} · {hood}</div>
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
          {events.length === 0 && <div className="text-xs text-fg-3">Nothing within range. Baseline night.</div>}
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {events.slice(0, 8).map(e => {
              const m = eventMagnitude(e);
              const tag = m > 0.5 ? "major" : m > 0.05 ? "minor" : "tiny";
              const isOpen = open === e.id;
              return (
                <div key={e.id} className={`pl-2 border-l-[3px] ${m > 0.5 ? "border-l-bad" : "border-l-transparent"}`}>
                  <button className="w-full text-left py-1.5 flex items-center gap-2 text-xs hover:bg-bg-3" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                    <span className="num text-fg-2 shrink-0 w-[60px] whitespace-nowrap">{fmtT(isoToMin(e.start))}</span>
                    <span className="font-medium text-fg truncate flex-1 min-w-0">{e.name}</span>
                    <span className="num text-fg-2 shrink-0">{e.distanceMiles.toFixed(1)} mi</span>
                    <span className={`tag shrink-0 ${m > 0.5 ? "text-bad" : "text-fg-3"}`}>{tag}</span>
                  </button>
                  {isOpen && (
                    <div className="pb-2 pr-1 text-xs">
                      <div className="text-fg-2">{e.type} · {e.venue.split(",")[0]} · ~<span className="num">{e.attendance.toLocaleString()}</span> people · {e.impact === "both" ? "delivery up, walk-in down" : e.impact === "delivery_up" ? "delivery up" : e.impact === "dine_in_down" ? "walk-in down" : "neutral"} · confidence <span className="num">{Math.round(e.confidence * 100)}%</span></div>
                      <div className="text-fg mt-1">{explanations[e.id] ?? templateLine(e)}</div>
                      <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-fg-2 underline underline-offset-2 hover:text-fg">{e.source === "web_search" ? "web source" : e.source === "cache" ? "cached source" : "Ticketmaster"}</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-line pt-3 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={jakeOut} onChange={e => setToggles({ jakeOut: e.target.checked })} className="accent-[#16191D]" />
          <span>Jake called out <span className="text-fg-2 text-xs">(6–10 PM shift)</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={rainWhatIf} onChange={e => setToggles({ rainWhatIf: e.target.checked })} className="accent-[#16191D]" />
          <span>What-if: rain 6–9 PM <span className="text-fg-2 text-xs">(not in the forecast)</span></span>
        </label>
        <div className="text-[11px] text-fg-3">Demo restaurant: synthetic history ({normal.label.toLowerCase()}), real events and weather. Demand = event size × proximity × timing + weather, capped 0.7×–1.8×.</div>
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

function fmtDate(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default memo(TonightPanel);
