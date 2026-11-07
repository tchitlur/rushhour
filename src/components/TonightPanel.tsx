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
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <div className="panel-title">Tonight</div>
          {tonightSource && <span className={`chip ${tonightSource === "live" ? "!text-ok !border-ok/40" : ""}`} title={tonightSource === "live" ? "Fetched live just now" : "Served from committed cache of real data"}>{tonightSource === "live" ? "live data" : tonightSource === "mixed" ? "live + cached" : "cached"}</span>}
        </div>
        <div className="mt-1 text-lg font-semibold">{tonightData ? fmtDate(tonightData.date) : "Loading…"}</div>
        <div className="text-xs text-fg-3">Maria&apos;s Burgers &amp; Wings · North Shore, Pittsburgh</div>
        <div className="text-[10px] text-fg-3 mt-1">Demo restaurant · synthetic history · real events &amp; weather</div>
      </div>

      {tonightLoading && !tonightData && <div className="text-sm text-fg-2 animate-pulse">Pulling real events (Ticketmaster), weather (Open-Meteo) and local happenings (web search)…</div>}

      {w && (
        <div className="rounded-lg border border-line bg-bg-3 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{w.summary}</div>
            <a href={w.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-fg-3 hover:text-fg-2">Open-Meteo ↗</a>
          </div>
          <div className="mt-2 flex gap-1">
            {evening.map(h => {
              const wet = h.precipIn >= 0.02 || (h.precipProb ?? 0) >= 60;
              const snowish = h.code >= 71 && h.code <= 77;
              return (
                <div key={h.time} className="flex-1 text-center">
                  <div className={`h-6 rounded-sm flex items-end justify-center text-[9px] ${wet ? "bg-phone/40" : snowish ? "bg-phone/20" : (h.code >= 45 && h.code <= 48) ? "bg-fg-3/20" : "bg-counter/20"}`}>{snowish ? "❄" : wet ? "☂" : (h.code >= 45 && h.code <= 48) ? "≈" : ""}</div>
                  <div className="text-[10px] text-fg-3 num mt-0.5">{Math.round(h.tempF)}°</div>
                  <div className="text-[9px] text-fg-3">{fmtClockShort(parseInt(h.time.slice(11, 13)) * 60)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="panel-title mb-2">Events nearby ({events.length})</div>
        <div className="flex flex-col gap-2">
          {events.slice(0, 6).map(e => {
            const m = eventMagnitude(e);
            return (
              <div key={e.id} className={`rounded-lg border p-2.5 ${m > 0.5 ? "border-accent/50 bg-accent/5" : "border-line bg-bg-3"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold leading-snug">{e.name}</div>
                  <span className={`chip shrink-0 ${m > 0.5 ? "!text-accent !border-accent/40" : ""}`}>{m > 0.5 ? "major" : m > 0.05 ? "minor" : "tiny"}</span>
                </div>
                <div className="text-[11px] text-fg-3 mt-0.5">{e.type} · {fmtT(isoToMin(e.start))} · {e.venue.split(",")[0]} · {e.distanceMiles.toFixed(1)} mi · ~{e.attendance.toLocaleString()} people</div>
                <div className="text-xs text-fg-2 mt-1">{explanations[e.id] ?? templateLine(e)}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-fg-3">{e.impact === "both" ? "delivery ↑ walk-in ↓" : e.impact === "delivery_up" ? "delivery ↑" : e.impact === "dine_in_down" ? "walk-in ↓" : "neutral"} · conf {Math.round(e.confidence * 100)}%</span>
                  <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-fg-3 hover:text-fg-2">{e.source === "web_search" ? "web" : e.source === "cache" ? "cached" : "Ticketmaster"} ↗</a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="panel-title mb-1">Staffing tonight</div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={jakeOut} onChange={e => setToggles({ jakeOut: e.target.checked })} className="accent-accent" />
          <span>Jake called out <span className="text-fg-3 text-xs">(6–10 PM shift)</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
          <input type="checkbox" checked={rainWhatIf} onChange={e => setToggles({ rainWhatIf: e.target.checked })} className="accent-accent" />
          <span>What-if: rain 6–9 PM <span className="text-fg-3 text-xs">(not in the real forecast)</span></span>
        </label>
      </div>

      {demand && (
        <div>
          <div className="panel-title mb-1">Demand tonight</div>
          <div className="text-sm font-semibold text-accent-2">{demand.peakLabel}</div>
          <div className="text-[11px] text-fg-3">{Math.round(demand.deliveryShare * 100)}% of orders by delivery (normally {Math.round((tonight.channelMix.doordash + tonight.channelMix.ubereats) * 100)}%)</div>
          <DemandCurve />
          <div className="text-[10px] text-fg-3 mt-1">Deterministic formula: event size × proximity × timing, plus weather. Capped 0.7×–1.8×.</div>
        </div>
      )}
      <div className="text-[10px] text-fg-3">Baseline from {normal.label.toLowerCase()} history (synthetic).</div>
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
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full mt-1">
      <path d={`M0,${H} ` + base.map((v, i) => "L" + pt(v, i)).join(" ") + ` L${W},${H} Z`} fill="#6b7388" opacity={0.25} />
      <polyline points={base.map(pt).join(" ")} fill="none" stroke="#a9b0c2" strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={`M0,${H} ` + tonightOph.map((v, i) => "L" + pt(v, i)).join(" ") + ` L${W},${H} Z`} fill="#ff7a1a" opacity={0.18} />
      <polyline points={tonightOph.map(pt).join(" ")} fill="none" stroke="#ff7a1a" strokeWidth={2} />
      {[16, 18, 20, 22].map(h => <text key={h} x={((h * 60 - SERVICE_START) / (SERVICE_END - SERVICE_START)) * W} y={H + 11} fontSize={9} fill="#6b7388" textAnchor={h === 22 ? "end" : h === 16 ? "start" : "middle"}>{fmtClockShort(h * 60)}</text>)}
      <text x={W} y={10} fontSize={9} fill="#ff7a1a" textAnchor="end">tonight</text>
      <text x={W} y={20} fontSize={9} fill="#a9b0c2" textAnchor="end">baseline</text>
    </svg>
  );
}

function fmtDate(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default memo(TonightPanel);
