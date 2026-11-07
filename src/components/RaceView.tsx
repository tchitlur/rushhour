"use client";
import { memo, useMemo } from "react";
import { useApp, snapshotAt } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import Kitchen2D from "./Kitchen2D";
import type { LiveCounters } from "@/sim/types";
import { fmtMoney } from "./Counters";

const KEYS: { key: keyof LiveCounters; label: string; fmt: (v: number) => string; bad: (v: number) => boolean }[] = [
  { key: "avgDasherWait", label: "Wait", fmt: v => `${v.toFixed(1)}m`, bad: v => v > 3.4 },
  { key: "dashersGaveUp", label: "Gave up", fmt: v => `${Math.round(v)}`, bad: v => v >= 1 },
  { key: "coldOrders", label: "Cold", fmt: v => `${Math.round(v)}`, bad: v => v >= 5 },
  { key: "dollarsAtRisk", label: "At risk", fmt: fmtMoney, bad: v => v >= 150 },
];

export interface RaceViewProps {
  /** "plan" (default): tonight vs. the Rehearse plan. "ask": tonight vs. the Ask what-if night. */
  mode?: "plan" | "ask";
}

function RaceView({ mode = "plan" }: RaceViewProps) {
  const { night, planNight, askNight, tIdx, tonight, planScenario, askScenario, askResult, plan, playing } = useApp(useShallow(s => ({ night: s.night, planNight: s.planNight, askNight: s.askNight, tIdx: s.tIdx, tonight: s.tonight, planScenario: s.planScenario, askScenario: s.askScenario, askResult: s.askResult, plan: s.plan, playing: s.playing })));
  const ask = mode === "ask";
  const otherNight = ask ? askNight : planNight;
  const otherScenario = ask ? askScenario : planScenario;
  const a = useMemo(() => snapshotAt(night, tIdx), [night, tIdx]);
  const b = useMemo(() => snapshotAt(otherNight, tIdx), [otherNight, tIdx]);
  const ended = !!night && tIdx >= (night.snapshots?.length ?? 1) - 1.01 && !playing;
  if (ask ? !askResult : (!plan || !planScenario)) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-6">
        <div className="text-lg font-semibold">{ask ? "Ask a what-if first" : "Run Rehearse first"}</div>
        <div className="text-sm text-fg-2 max-w-sm">{ask ? "Side-by-side plays tonight twice with the same customers and the same luck: once as planned, once with your what-if." : "The race plays tonight twice with the same customers and the same luck: once as planned, once with the plan."}</div>
      </div>
    );
  }
  const otherTitle = ask ? `What-if: ${askResult?.patch.summary ?? ""}` : "With the plan";
  const otherShort = ask ? "What-if" : "With the plan";
  return (
    <div className="h-full grid grid-cols-2 gap-2 p-2 relative">
      <Side title="Tonight as planned" snap={a} stations={tonight.stations} tone="bad" />
      <Side title={otherTitle} snap={b} stations={otherScenario?.stations ?? tonight.stations} tone="ok" loading={!otherNight} />
      {ended && a && b && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none">
          <div className="panel p-4 shadow-lg pointer-events-auto min-w-[560px]">
            <div className="panel-title">End of night</div>
            <div className="sub">Same customers, same luck. As planned → {otherShort.toLowerCase()}.</div>
            <table className="data mt-2">
              <thead><tr><th>Metric</th><th className="r">As planned</th><th className="r">{otherShort}</th></tr></thead>
              <tbody>
                {KEYS.map(k => (
                  <tr key={k.key}>
                    <td className="text-[13px]">{k.label}</td>
                    <td className="r num text-[15px] text-bad font-semibold">{k.fmt(a.live[k.key])}</td>
                    <td className="r num text-[15px] text-plan font-semibold">{k.fmt(b.live[k.key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Side({ title, snap, stations, tone, loading }: { title: string; snap: ReturnType<typeof snapshotAt>; stations: Parameters<typeof Kitchen2D>[0]["stations"]; tone: "bad" | "ok"; loading?: boolean }) {
  return (
    <div className={`rounded border border-line flex flex-col min-h-0 border-t-[3px] ${tone === "bad" ? "border-t-bad" : "border-t-plan"}`}>
      <div className="flex items-center justify-between px-3 pt-2">
        <div className={`text-sm font-semibold truncate ${tone === "bad" ? "text-bad" : "text-plan"}`} title={title}>{title}</div>
        {loading && <span className="chip">simulating…</span>}
      </div>
      <div className="grid grid-cols-4 gap-2 px-3 pt-2">
        {KEYS.map(k => { const v = snap?.live[k.key] ?? 0; const bad = k.bad(v); return (
          <div key={k.key} className={`rounded border border-line bg-bg-2 px-2 py-1 border-l-[3px] ${bad ? "border-l-bad" : "border-l-line"}`}>
            <div className="flex items-center justify-between gap-1"><div className="text-[11px] text-fg-2 truncate">{k.label}</div>{bad && <span className="tag text-bad">high</span>}</div>
            <div className={`num font-medium text-xl leading-tight ${bad ? "text-bad" : "text-fg"}`}>{k.fmt(v)}</div>
          </div>); })}
      </div>
      <div className="flex-1 min-h-0 p-2"><Kitchen2D snapshot={snap} stations={stations} className="w-full h-full" /></div>
    </div>
  );
}

export default memo(RaceView);
