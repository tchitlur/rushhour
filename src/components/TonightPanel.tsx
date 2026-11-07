"use client";
import { memo } from "react";
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
  const { tonightData, tonightLoading, tonightSource, demand, explanations, jakeOut, rainWhatIf, setToggles, tonight, normal } = useApp(useShallow(s => ({ tonightData: s.tonightData, tonightLoading: s.tonightLoading, tonightSource: s.tonightSource, demand: s.demand, explanations: s.explanations, jakeOut: s.jakeOut, rainWhatIf: s.rainWhatIf, setToggles: s.setToggles, tonight: s.tonight, normal: s.normal })));
  const events = [...(tonightData?.events ?? [])].sort((a, b) => eventMagnitude(b) - eventMagnitude(a));
  const w = tonightData?.weather;
  const evening = w?.hourly.filter(h => { const hh = parseInt(h.time.slice(11, 13)); return hh >= 16 && hh <= 22; }) ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between">
          <div className="panel-title">Tonight</div>
          {tonightSource && <span className={`chip ${tonightSource === "live" ? "!text-ok !border-ok" : ""}`} title={tonightSource === "live" ? "Fetched live just now" : "Served from committed cache of real data"}>{tonightSource === "live" ? "live data" : tonightSource === "mixed" ? "live + cached" : "cached"}</span>}
        </div>
        <div className="mt-1 text-xl font-semibold leading-tight">{tonightData ? fmtDate(tonightData.date) : "Loading…"}</div>
        <div className="sub mt-0.5">Maria&apos;s Burgers &amp; Wings · North Shore, Pittsburgh</div>
        <div className="text-xs text-fg-3 mt-1">Demo restaurant. Synthetic history, real events and weather.</div>
      </div>

      {tonightLoading && !tonightData && <div className="text-sm text-fg-2">Pulling real events (Ticketmaster), weather (Open-Meteo) and local happenings (web search)…</div>}

      {w && (
        <div className="border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <div className="panel-title">Weather</div>
            <a href={w.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-fg-2 underline underline-offset-2 hover:text-fg">Open-Meteo</a>
          </div>
          <div className="text-sm mt-1">{w.summary}</div>
          <div className="mt-2 grid gap-px" style={{ gridTemplateColumns: `repeat(${evening.length || 1}, minmax(0, 1fr))` }}>
            {evening.map(h => {
              const wet = h.precipIn >= 0.02 || (h.precipProb ?? 0) >= 60;
              const snowish = h.code >= 71 && h.code <= 77;
              const fog = h.code >= 45 && h.code <= 48;
              const cond = snowish ? "snow" : wet ? "rain" : fog ? "fog" : "";
              return (
                <div key={h.time} className="text-center border border-line rounded-sm py-1 bg-bg-2">
                  <div className="text-[11px] text-fg-3 num">{fmtClockShort(parseInt(h.time.slice(11, 13)) * 60)}</div>
                  <div className="text-[13px] text-fg num font-medium">{Math.round(h.tempF)}°</div>
                  <div className={`text-[10px] h-3 leading-3 ${wet || snowish ? "text-phone font-medium" : "text-fg-3"}`}>{cond}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-line pt-3">
        <div className="panel-title mb-2">Events nearby <span className="num text-fg-2 font-normal">({events.length})</span></div>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {events.slice(0, 6).map(e => {
            const m = eventMagnitude(e);
            const size = m > 0.5 ? "major" : m > 0.05 ? "minor" : "tiny";
            return (
              <div key={e.id} className={`py-2 pl-2.5 border-l-[3px] ${m > 0.5 ? "border-l-bad" : "border-l-transparent"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold leading-snug">{e.name}</div>
                  <span className={`tag shrink-0 ${m > 0.5 ? "text-bad" : "text-fg-3"}`}>{size}</span>
                </div>
                <div className="text-xs text-fg-2 mt-0.5">{e.type} · <span className="num">{fmtT(isoToMin(e.start))}</span> · {e.venue.split(",")[0]} · <span className="num">{e.distanceMiles.toFixed(1)}</span> mi · ~<span className="num">{e.attendance.toLocaleString()}</span> people</div>
                <div className="text-xs text-fg mt-1">{explanations[e.id] ?? templateLine(e)}</div>
                <div className="flex items-center justify-between mt-1 text-xs text-fg-2">
                  <span>{e.impact === "both" ? "delivery up, walk-in down" : e.impact === "delivery_up" ? "delivery up" : e.impact === "dine_in_down" ? "walk-in down" : "neutral"} · confidence <span className="num">{Math.round(e.confidence * 100)}%</span></span>
                  <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-fg">{e.source === "web_search" ? "web" : e.source === "cache" ? "cached" : "Ticketmaster"}</a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <div className="panel-title mb-2">Staffing tonight</div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={jakeOut} onChange={e => setToggles({ jakeOut: e.target.checked })} className="accent-[#16191D]" />
          <span>Jake called out <span className="text-fg-2 text-xs">(6–10 PM shift)</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer mt-1.5">
          <input type="checkbox" checked={rainWhatIf} onChange={e => setToggles({ rainWhatIf: e.target.checked })} className="accent-[#16191D]" />
          <span>What-if: rain 6–9 PM <span className="text-fg-2 text-xs">(not in the real forecast)</span></span>
        </label>
      </div>

      {demand && (
        <div className="border-t border-line pt-3">
          <div className="panel-title">Demand tonight</div>
          <div className="text-sm font-medium mt-1">{demand.peakLabel}</div>
          <div className="text-xs text-fg-2"><span className="num">{Math.round(demand.deliveryShare * 100)}%</span> of orders by delivery (normally <span className="num">{Math.round((tonight.channelMix.doordash + tonight.channelMix.ubereats) * 100)}%</span>)</div>
          <DemandCurve />
          <div className="text-xs text-fg-3 mt-1">Deterministic formula: event size × proximity × timing, plus weather. Capped 0.7×–1.8×.</div>
        </div>
      )}
      <div className="text-xs text-fg-3">Baseline from {normal.label.toLowerCase()} history (synthetic).</div>
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
