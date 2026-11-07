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
    <div className={`grid ${compact ? "grid-cols-2 gap-2" : "grid-flow-col auto-cols-fr gap-2"}`}>
      {specs.map(c => {
        const v = live ? live[c.key] : 0;
        const bad = c.bad?.(v) ?? false;
        return (
          <div key={c.key} className={`rounded px-3 py-2 border border-line bg-bg-2 border-l-[3px] ${bad ? "border-l-bad" : "border-l-line"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-fg-2 truncate">{c.label}</div>
              {bad && <span className="tag text-bad">high</span>}
            </div>
            <div className={`num font-medium leading-none mt-1 ${compact ? "text-[28px]" : "text-[36px]"} ${bad ? "text-bad" : "text-fg"}`}>{c.fmt(v)}</div>
          </div>
        );
      })}
    </div>
  );
}
