"use client";
import { memo } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { fmtClockShort } from "@/sim/types";
import { fmtMoney } from "./Counters";

const COLORS = ["#ff7a1a", "#4da3ff", "#c77dff", "#3ddc84", "#ffc84a", "#ff4d5e"];
const STATION_NAME: Record<string, string> = { grill: "Grill", fryer: "Fryer", cold: "Cold station", pack: "Pack / Expo", counter: "Counter" };

function WhyPanel() {
  const { attribution, whyLoading, whyMetric, runWhy, setHighlight, highlightStation, tonightMC, normalMC } = useApp(useShallow(s => ({
    attribution: s.attribution, whyLoading: s.whyLoading, whyMetric: s.whyMetric, runWhy: s.runWhy, setHighlight: s.setHighlight, highlightStation: s.highlightStation, tonightMC: s.tonightMC, normalMC: s.normalMC,
  })));
  const a = attribution;
  const shares = a ? a.shares.map(s => ({ ...s, pos: Math.max(0, s.value) })) : [];
  const posTotal = shares.reduce((x, s) => x + s.pos, 0) || 1;
  const fmt = (v: number) => a?.metric === "dasherWait" ? `${v.toFixed(1)} min` : fmtMoney(v);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title">Why did it break?</div>
        <div className="text-xs text-fg-3 mt-1">Proven by re-running tonight without each cause, in every combination (exact Shapley values).</div>
      </div>
      {tonightMC && normalMC && (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Normal weeknight" wait={normalMC.mean.avgDasherWait} risk={normalMC.mean.dollarsAtRisk} />
          <Stat label="Tonight as planned" wait={tonightMC.mean.avgDasherWait} risk={tonightMC.mean.dollarsAtRisk} bad />
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-line overflow-hidden text-xs">
          <button className={`px-2.5 py-1 ${whyMetric === "dasherWait" ? "bg-bg-3 text-fg" : "text-fg-3"}`} onClick={() => runWhy("dasherWait")}>Dasher wait</button>
          <button className={`px-2.5 py-1 ${whyMetric === "dollarsAtRisk" ? "bg-bg-3 text-fg" : "text-fg-3"}`} onClick={() => runWhy("dollarsAtRisk")}>Dollars at risk</button>
        </div>
        {!a && !whyLoading && <button className="btn btn-primary text-xs" onClick={() => runWhy(whyMetric)} disabled={!tonightMC}>Explain tonight</button>}
        {whyLoading && <span className="text-xs text-fg-2 animate-pulse">Re-simulating {a ? "" : "32 combinations × 60 nights"}…</span>}
      </div>
      {a && (
        <div className="fade-up flex flex-col gap-3">
          <div>
            <div className="text-xs text-fg-2 mb-1">Extra {a.metric === "dasherWait" ? "Dasher wait" : "dollars at risk"} tonight vs. a normal night: <b className="text-fg num">{fmt(a.total)}</b></div>
            <div className="h-7 w-full rounded-md overflow-hidden flex border border-line">
              {shares.map((s, i) => s.pos > 0 && (
                <div key={s.factorId} onClick={() => setHighlight(highlightStation === s.station ? null : (s.station ?? null))} title={`${s.label}: ${Math.round(s.pos / posTotal * 100)}%`}
                  className="h-full flex items-center justify-center text-[11px] font-bold text-black/80 cursor-pointer transition-opacity hover:opacity-90"
                  style={{ width: `${(s.pos / posTotal) * 100}%`, background: COLORS[i % COLORS.length] }}>
                  {s.pos / posTotal > 0.12 ? `${Math.round(s.pos / posTotal * 100)}%` : ""}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {shares.map((s, i) => (
              <button key={s.factorId} onClick={() => setHighlight(highlightStation === s.station ? null : (s.station ?? null))}
                className={`flex items-center gap-2 text-left rounded-md px-2 py-1.5 border transition-colors ${highlightStation && highlightStation === s.station ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-bg-3"}`}>
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-sm flex-1">{s.label}</span>
                <span className="text-sm font-bold num">{Math.round(s.pos / posTotal * 100)}%</span>
                <span className="text-[11px] text-fg-3 num w-16 text-right">{s.value >= 0 ? "+" : "−"}{fmt(Math.abs(s.value))}</span>
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-bad/40 bg-bad/10 p-2.5 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-bad font-semibold">Bottleneck</div>
            <div className="mt-0.5"><b>{STATION_NAME[a.bottleneck.station]}</b> saturates <b className="num">{fmtClockShort(a.bottleneck.start)}–{fmtClockShort(a.bottleneck.end)}</b>; the queue behind it is what makes Dashers wait and food go cold.</div>
            <button className="text-[11px] text-fg-2 underline mt-1" onClick={() => setHighlight(highlightStation === a.bottleneck.station ? null : a.bottleneck.station)}>highlight in kitchen</button>
          </div>
          <div className="text-[10px] text-fg-3">{a.method === "shapley" ? `Exact Shapley attribution over ${a.shares.length} causes (${2 ** a.shares.length} re-simulated combinations × ${a.nights} nights). Shares add up to the total.` : "One-cause-at-a-time removal."} Click a cause to highlight its station.</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, wait, risk, bad }: { label: string; wait: number; risk: number; bad?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${bad ? "border-bad/40 bg-bad/10" : "border-line bg-bg-3"}`}>
      <div className="text-[10px] uppercase tracking-wider text-fg-3 font-semibold">{label}</div>
      <div className={`num text-xl font-bold ${bad ? "text-bad" : "text-ok"}`}>{wait.toFixed(1)}m <span className="text-xs font-medium text-fg-3">Dasher wait</span></div>
      <div className="num text-sm text-fg-2">{fmtMoney(risk)} at risk</div>
    </div>
  );
}

export default memo(WhyPanel);
