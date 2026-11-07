"use client";
import { memo } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { fmtClockShort } from "@/sim/types";
import { fmtMoney } from "./Counters";

// desaturated cause sequence: ink, plan blue, warn, good, muted, bad
const COLORS = ["#16191D", "#1D5FA8", "#B7791F", "#2F855A", "#8A93A0", "#C2410C"];
const STATION_NAME: Record<string, string> = { grill: "Grill", fryer: "Fryer", cold: "Cold station", pack: "Pack / Expo", counter: "Counter" };

function WhyPanel() {
  const { attribution, whyLoading, whyMetric, runWhy, setHighlight, highlightStation, tonightMC, normalMC } = useApp(useShallow(s => ({
    attribution: s.attribution, whyLoading: s.whyLoading, whyMetric: s.whyMetric, runWhy: s.runWhy, setHighlight: s.setHighlight, highlightStation: s.highlightStation, tonightMC: s.tonightMC, normalMC: s.normalMC,
  })));
  const a = attribution;
  const shares = a ? a.shares.map(s => ({ ...s, pos: Math.max(0, s.value) })) : [];
  const posTotal = shares.reduce((x, s) => x + s.pos, 0) || 1;
  const fmt = (v: number) => a?.metric === "dasherWait" ? `${v.toFixed(1)} min` : fmtMoney(v);
  const top = shares.length ? shares.reduce((b, s) => (s.pos > b.pos ? s : b), shares[0]) : null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title">Why did it break?</div>
        {a ? (
          <div className="text-sm mt-1 leading-snug">Biggest cause: <b className="font-semibold">{top?.label ?? "—"}</b>{top ? <> (<span className="num font-semibold">{Math.round(top.pos / posTotal * 100)}%</span>)</> : null}. Bottleneck: <b className="font-semibold">{STATION_NAME[a.bottleneck.station]?.toLowerCase() ?? a.bottleneck.station}</b> <span className="num">{fmtClockShort(a.bottleneck.start)}–{fmtClockShort(a.bottleneck.end)}</span>.</div>
        ) : (
          <div className="sub mt-0.5">Re-runs tonight without each cause, in every combination (exact Shapley values).</div>
        )}
      </div>
      {tonightMC && normalMC && (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Normal weeknight" wait={normalMC.mean.avgDasherWait} risk={normalMC.mean.dollarsAtRisk} />
          <Stat label="Tonight as planned" wait={tonightMC.mean.avgDasherWait} risk={tonightMC.mean.dollarsAtRisk} bad />
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded border border-line overflow-hidden text-xs">
          <button className={`px-2.5 py-1 ${whyMetric === "dasherWait" ? "bg-fg text-white" : "text-fg-2 hover:bg-bg-3"}`} onClick={() => runWhy("dasherWait")}>Dasher wait</button>
          <button className={`px-2.5 py-1 border-l border-line ${whyMetric === "dollarsAtRisk" ? "bg-fg text-white" : "text-fg-2 hover:bg-bg-3"}`} onClick={() => runWhy("dollarsAtRisk")}>Dollars at risk</button>
        </div>
        {!a && !whyLoading && <button className="btn btn-primary text-xs" onClick={() => runWhy(whyMetric)} disabled={!tonightMC}>Explain tonight</button>}
        {whyLoading && <span className="text-xs text-fg-2">Re-simulating {a ? "" : "32 combinations × 60 nights"}…</span>}
      </div>
      {a && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-xs text-fg-2 mb-1.5">Extra {a.metric === "dasherWait" ? "Dasher wait" : "dollars at risk"} tonight vs. a normal night: <b className="text-fg num font-semibold">{fmt(a.total)}</b></div>
            <div className="h-5 w-full rounded-sm overflow-hidden flex border border-line bg-bg-2 gap-px">
              {shares.map((s, i) => s.pos > 0 && (
                <div key={s.factorId} onClick={() => setHighlight(highlightStation === s.station ? null : (s.station ?? null))} title={`${s.label}: ${Math.round(s.pos / posTotal * 100)}%`}
                  className="h-full flex items-center justify-center text-[11px] font-medium cursor-pointer num"
                  style={{ width: `${(s.pos / posTotal) * 100}%`, background: COLORS[i % COLORS.length], color: i % COLORS.length === 2 || i % COLORS.length === 4 ? "#16191D" : "#FFFFFF" }}>
                  {s.pos / posTotal > 0.12 ? `${Math.round(s.pos / posTotal * 100)}%` : ""}
                </div>
              ))}
            </div>
          </div>
          <table className="data">
            <thead><tr><th>Cause</th><th className="r">Share</th><th className="r">Effect</th></tr></thead>
            <tbody>
              {shares.map((s, i) => (
                <tr key={s.factorId} onClick={() => setHighlight(highlightStation === s.station ? null : (s.station ?? null))}
                  className={`cursor-pointer transition-colors ${highlightStation && highlightStation === s.station ? "bg-bg-3" : "hover:bg-bg-3"}`}>
                  <td><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} /><span className="text-[13px] text-fg">{s.label}</span></div></td>
                  <td className="r num text-[13px] font-semibold text-fg">{Math.round(s.pos / posTotal * 100)}%</td>
                  <td className="r num text-fg-2 whitespace-nowrap">{s.value >= 0 ? "+" : "−"}{fmt(Math.abs(s.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rounded border border-line border-l-[3px] border-l-bad p-2.5 text-sm">
            <div className="text-xs font-semibold text-bad">Bottleneck</div>
            <div className="mt-0.5"><b className="font-semibold">{STATION_NAME[a.bottleneck.station]}</b> saturates <b className="num font-semibold">{fmtClockShort(a.bottleneck.start)}–{fmtClockShort(a.bottleneck.end)}</b>; its queue is what makes Dashers wait and food go cold.</div>
            <button className="text-xs text-fg-2 underline underline-offset-2 mt-1 hover:text-fg" onClick={() => setHighlight(highlightStation === a.bottleneck.station ? null : a.bottleneck.station)}>Highlight in kitchen</button>
          </div>
          <div className="text-xs text-fg-3">{a.method === "shapley" ? `Exact Shapley: ${2 ** a.shares.length} combinations × ${a.nights} nights; shares add to the total.` : "One-cause-at-a-time removal."} Click a cause to highlight its station.</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, wait, risk, bad }: { label: string; wait: number; risk: number; bad?: boolean }) {
  return (
    <div className={`rounded border border-line p-2.5 border-l-[3px] ${bad ? "border-l-bad" : "border-l-line"}`}>
      <div className="text-xs text-fg-2">{label}</div>
      <div className={`num text-[28px] font-medium leading-none mt-1 ${bad ? "text-bad" : "text-fg"}`}>{wait.toFixed(1)}m</div>
      <div className="text-xs text-fg-2 mt-1">Dasher wait · <span className="num">{fmtMoney(risk)}</span> at risk</div>
    </div>
  );
}

export default memo(WhyPanel);
