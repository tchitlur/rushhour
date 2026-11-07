"use client";
import type { LiveCounters } from "@/sim/types";

export function fmtMoney(x: number) { return `$${Math.round(x).toLocaleString()}`; }
export function fmtMin(x: number) { return `${x.toFixed(1)}m`; }

export interface CounterSpec { key: keyof LiveCounters; label: string; fmt: (x: number) => string; bad?: (x: number) => boolean }
export const COUNTERS: CounterSpec[] = [
  { key: "avgDasherWait", label: "Avg Dasher wait", fmt: fmtMin, bad: x => x > 3.4 },
  { key: "dashersWaiting", label: "Dashers at door", fmt: x => `${Math.round(x)}`, bad: x => x >= 3 },
  { key: "dashersGaveUp", label: "Dashers gave up", fmt: x => `${Math.round(x)}`, bad: x => x >= 1 },
  { key: "coldOrders", label: "Cold orders", fmt: x => `${Math.round(x)}`, bad: x => x >= 5 },
  { key: "lateOrders", label: "Late orders", fmt: x => `${Math.round(x)}`, bad: x => x >= 10 },
  { key: "dollarsAtRisk", label: "Dollars at risk", fmt: fmtMoney, bad: x => x >= 150 },
  { key: "inKitchen", label: "Orders in kitchen", fmt: x => `${Math.round(x)}`, bad: x => x >= 12 },
  { key: "revenue", label: "Revenue", fmt: fmtMoney },
];

export default function Counters({ live, compact = false, keys }: { live: LiveCounters | null; compact?: boolean; keys?: (keyof LiveCounters)[] }) {
  const specs = keys ? COUNTERS.filter(c => keys.includes(c.key)) : COUNTERS;
  return (
    <div className={`grid ${compact ? "grid-cols-2 gap-2" : "grid-flow-col auto-cols-fr gap-3"}`}>
      {specs.map(c => {
        const v = live ? live[c.key] : 0;
        const bad = c.bad?.(v) ?? false;
        return (
          <div key={c.key} className={`rounded-lg px-3 py-2 border ${bad ? "border-bad/50 bg-bad/10" : "border-line bg-bg-3"}`}>
            <div className="text-[10px] uppercase tracking-wider text-fg-3 font-semibold truncate">{c.label}</div>
            <div className={`num font-bold leading-tight ${compact ? "text-xl" : "text-2xl"} ${bad ? "text-bad" : "text-fg"}`}>{c.fmt(v)}</div>
          </div>
        );
      })}
    </div>
  );
}
