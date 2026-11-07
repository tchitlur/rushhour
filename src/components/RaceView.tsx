"use client";
import { memo, useMemo } from "react";
import { useApp, snapshotAt } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import Kitchen2D from "./Kitchen2D";
import type { LiveCounters } from "@/sim/types";
import { fmtMoney } from "./Counters";

const KEYS: { key: keyof LiveCounters; label: string; fmt: (v: number) => string; bad: (v: number) => boolean }[] = [
  { key: "avgDasherWait", label: "Dasher wait", fmt: v => `${v.toFixed(1)}m`, bad: v => v > 3.4 },
  { key: "dashersGaveUp", label: "Gave up", fmt: v => `${Math.round(v)}`, bad: v => v >= 1 },
  { key: "coldOrders", label: "Cold", fmt: v => `${Math.round(v)}`, bad: v => v >= 5 },
  { key: "dollarsAtRisk", label: "At risk", fmt: fmtMoney, bad: v => v >= 150 },
];

function RaceView() {
  const { night, planNight, tIdx, tonight, planScenario, plan, playing } = useApp(useShallow(s => ({ night: s.night, planNight: s.planNight, tIdx: s.tIdx, tonight: s.tonight, planScenario: s.planScenario, plan: s.plan, playing: s.playing })));
  const a = useMemo(() => snapshotAt(night, tIdx), [night, tIdx]);
  const b = useMemo(() => snapshotAt(planNight, tIdx), [planNight, tIdx]);
  const ended = !!night && tIdx >= (night.snapshots?.length ?? 1) - 1.01 && !playing;
  if (!plan || !planScenario) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-6">
        <div className="text-lg font-semibold">Run Rehearse first</div>
        <div className="text-sm text-fg-3 max-w-sm">The race plays tonight twice with the same customers and the same luck: once as planned, once with the plan.</div>
      </div>
    );
  }
  return (
    <div className="h-full grid grid-cols-2 gap-3 p-3 relative">
      <Side title="Tonight as planned" snap={a} stations={tonight.stations} tone="bad" />
      <Side title="With the plan" snap={b} stations={planScenario.stations} tone="ok" loading={!planNight} />
      {ended && a && b && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none">
          <div className="panel p-4 shadow-2xl fade-up pointer-events-auto border-accent/40 min-w-[520px]">
            <div className="panel-title text-accent">End of night · same customers, same luck</div>
            <div className="grid grid-cols-4 gap-4 mt-2">
              {KEYS.map(k => (
                <div key={k.key}>
                  <div className="text-[10px] uppercase tracking-wider text-fg-3">{k.label}</div>
                  <div className="num text-lg"><span className="text-bad font-bold">{k.fmt(a.live[k.key])}</span> <span className="text-fg-3">→</span> <span className="text-ok font-bold">{k.fmt(b.live[k.key])}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Side({ title, snap, stations, tone, loading }: { title: string; snap: ReturnType<typeof snapshotAt>; stations: Parameters<typeof Kitchen2D>[0]["stations"]; tone: "bad" | "ok"; loading?: boolean }) {
  return (
    <div className={`rounded-xl border flex flex-col min-h-0 ${tone === "bad" ? "border-bad/30" : "border-ok/30"}`}>
      <div className="flex items-center justify-between px-3 pt-2">
        <div className={`text-sm font-semibold ${tone === "bad" ? "text-bad" : "text-ok"}`}>{title}</div>
        {loading && <span className="chip animate-pulse">simulating…</span>}
      </div>
      <div className="grid grid-cols-4 gap-2 px-3 pt-2">
        {KEYS.map(k => { const v = snap?.live[k.key] ?? 0; const bad = k.bad(v); return (
          <div key={k.key} className={`rounded-md border px-2 py-1 ${bad ? "border-bad/40 bg-bad/10" : "border-line bg-bg-3"}`}>
            <div className="text-[9px] uppercase tracking-wider text-fg-3 truncate">{k.label}</div>
            <div className={`num font-bold text-lg leading-tight ${bad ? "text-bad" : "text-fg"}`}>{k.fmt(v)}</div>
          </div>); })}
      </div>
      <div className="flex-1 min-h-0 p-2"><Kitchen2D snapshot={snap} stations={stations} className="w-full h-full" /></div>
    </div>
  );
}

export default memo(RaceView);
