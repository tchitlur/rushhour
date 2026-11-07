"use client";
import { memo } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import type { PlanCard } from "@/plan/types";
import { fmtClockShort } from "@/sim/types";
import { fmtMoney } from "./Counters";

const STATION_NAME: Record<string, string> = { grill: "Grill", fryer: "Fryer", cold: "Cold station", pack: "Pack / Expo", counter: "Counter" };

function RehearsePanel() {
  const { plan, planLoading, planStatus, planSource, planExplanations, runRehearse, togglePlanCard, tonightMC, setTab } = useApp(useShallow(s => ({
    plan: s.plan, planLoading: s.planLoading, planStatus: s.planStatus, planSource: s.planSource, planExplanations: s.planExplanations, runRehearse: s.runRehearse, togglePlanCard: s.togglePlanCard, tonightMC: s.tonightMC, setTab: s.setTab,
  })));
  const accepted = plan?.cards.filter(c => c.accepted) ?? [];
  const rejected = plan?.cards.filter(c => !c.accepted) ?? [];
  const ev = plan?.combinedEvidence;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="panel-title">Rehearse</div>
        <div className="sub mt-0.5">AI proposes. The simulator proves. Only fixes that pay for themselves survive.</div>
      </div>
      {!plan && (
        <button className="btn btn-primary w-full justify-center py-3 flex-col !items-start !gap-0.5" onClick={runRehearse} disabled={planLoading || !tonightMC}>
          <span className="text-base">{planLoading ? "Rehearsing…" : "Rehearse tonight"}</span>
          <span className="text-xs font-normal opacity-80">Tests every fix on <span className="num">300</span> versions of tonight</span>
        </button>
      )}
      {planLoading && <div className="text-sm text-fg-2">{planStatus}</div>}
      {plan && ev && (
        <div className="rounded border border-line border-l-[3px] border-l-plan p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-plan">With the plan <span className="num text-fg-2 font-normal">· {plan.combined.nights} nights</span></div>
            {planSource && <span className="chip">{planSource === "rules" ? "rule-based proposals" : "AI proposals"}</span>}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Delta label="Dasher wait" before={ev.before.avgDasherWait} after={ev.after.avgDasherWait} fmt={v => `${v.toFixed(1)}m`} />
            <Delta label="Cold orders" before={ev.before.coldOrders} after={ev.after.coldOrders} fmt={v => v.toFixed(0)} />
            <Delta label="At risk" before={ev.before.dollarsAtRisk} after={ev.after.dollarsAtRisk} fmt={fmtMoney} />
          </div>
          <div className="text-xs text-fg-2 mt-3 num">Costs <b className="text-fg font-semibold">{fmtMoney(ev.cost)}</b>, protects <b className="text-fg font-semibold">{fmtMoney(ev.protectedDollars)}</b> · helped on <b className="text-fg font-semibold">{ev.nightsHelped}/{ev.nights}</b> nights · risk cut <b className="text-fg font-semibold">{ev.before.dollarsAtRisk > 0 ? Math.max(0, Math.round((1 - ev.after.dollarsAtRisk / ev.before.dollarsAtRisk) * 100)) : 0}%</b></div>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary text-xs" onClick={() => setTab("Race")}>Watch the race →</button>
            <button className="btn text-xs" onClick={runRehearse} disabled={planLoading}>Re-run</button>
          </div>
          {planStatus && !planLoading && <div className="text-xs text-fg-2 mt-2">{planStatus}</div>}
        </div>
      )}
      {plan && (
        <div className="text-sm border-t border-line pt-3">
          <span className="text-xs font-semibold text-bad">Bottleneck</span>
          <div className="mt-0.5">{plan.bottleneck.summary}</div>
        </div>
      )}
      {accepted.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="panel-title">Tested fixes <span className="num text-fg-2 font-normal">· {accepted.length}</span></div>
          <div className="divide-y divide-line border-y border-line">
            {accepted.map(c => <Row key={c.id} c={c} line={planExplanations[c.id]} busy={!!planStatus} onToggle={() => togglePlanCard(c.id)} />)}
          </div>
        </div>
      )}
      {rejected.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="panel-title">Rejected by the simulator <span className="num text-fg-2 font-normal">· {rejected.length}</span></div>
          <div className="divide-y divide-line">
            {rejected.map(c => (
              <div key={c.id} className="py-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm line-through text-fg-2">{c.title}</span>
                  <span className="text-xs text-fg-2 num">{c.costLabel}</span>
                </div>
                <div className="text-xs text-fg-3 mt-0.5">{c.rejectReason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {plan && <div className="text-xs text-fg-3">Each fix was simulated against the same <span className="num">{plan.cards[0]?.evidence.nights ?? 120}</span> nights as the baseline (common random numbers), then combined greedily and re-tested on <span className="num">{plan.combined.nights}</span>.</div>}
    </div>
  );
}

function Delta({ label, before, after, fmt }: { label: string; before: number; after: number; fmt: (v: number) => string }) {
  const better = after <= before;
  return (
    <div>
      <div className="text-xs text-fg-2">{label}</div>
      <div className="num leading-none mt-1"><span className={`font-medium text-[28px] ${better ? "text-plan" : "text-bad"}`}>{fmt(after)}</span></div>
      <div className="num text-xs text-fg-3 mt-1">was {fmt(before)}</div>
    </div>
  );
}

function Row({ c, line, onToggle, busy }: { c: PlanCard; line?: string; onToggle?: () => void; busy?: boolean }) {
  const e = c.evidence;
  const cells: [string, string, string][] = [
    ["Wait", `${e.after.avgDasherWait.toFixed(1)}m`, `${e.before.avgDasherWait.toFixed(1)}m`],
    ["Cold", e.after.coldOrders.toFixed(0), e.before.coldOrders.toFixed(0)],
    ["At risk", fmtMoney(e.after.dollarsAtRisk), fmtMoney(e.before.dollarsAtRisk)],
    ["Cost", c.costLabel, ""],
    ["Protects", fmtMoney(e.protectedDollars), ""],
    ["Helped", `${e.nightsHelped}/${e.nights}`, "nights"],
  ];
  return (
    <div className={`py-2 ${c.enabled ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-semibold text-fg leading-snug">{c.title}</div>
        <button onClick={onToggle} disabled={busy} role="switch" aria-checked={c.enabled} className={`shrink-0 mt-0.5 w-8 h-[18px] rounded-sm border relative transition-colors ${c.enabled ? "bg-fg border-fg" : "bg-bg-2 border-line"} ${busy ? "opacity-60" : ""}`} title="Toggle this fix and re-test the plan">
          <span className={`absolute top-[2px] w-3 h-3 rounded-sm transition-all ${c.enabled ? "left-[16px] bg-white" : "left-[2px] bg-fg-3"}`} />
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1 mt-1.5">
        {cells.map(([k, v, was]) => (
          <div key={k} className="min-w-0">
            <div className="text-[11px] text-fg-2 truncate">{k}</div>
            <div className={`num text-xs font-semibold truncate ${k === "Protects" ? "text-ok" : "text-fg"}`}>{v}</div>
            {was && <div className="num text-[11px] text-fg-3 truncate">{was === "nights" ? "nights" : `was ${was}`}</div>}
          </div>
        ))}
      </div>
      <div className="text-xs text-fg-2 mt-1.5">{line ?? c.rationale}</div>
    </div>
  );
}

export function stationName(id: string) { return STATION_NAME[id] ?? id; }
export { fmtClockShort };
export default memo(RehearsePanel);
