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
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title">Rehearse</div>
        <div className="text-xs text-fg-3 mt-1">The AI proposes. The simulator proves. Only fixes that pay for themselves survive.</div>
      </div>
      {!plan && (
        <button className="btn btn-primary w-full justify-center py-3 flex-col !items-start" onClick={runRehearse} disabled={planLoading || !tonightMC}>
          <span className="text-base">{planLoading ? "Rehearsing…" : "Rehearse tonight"}</span>
          <span className="text-[11px] font-normal opacity-80">Tests every fix on 300 versions of tonight</span>
        </button>
      )}
      {planLoading && <div className="text-sm text-fg-2 animate-pulse">{planStatus}</div>}
      {plan && ev && (
        <div className="rounded-lg border border-ok/40 bg-ok/10 p-3 fade-up">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-ok font-semibold">With the plan · {plan.combined.nights} nights</div>
            {planSource && <span className="chip">{planSource === "rules" ? "rule-based proposals" : "AI proposals"}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Delta label="Dasher wait" before={ev.before.avgDasherWait} after={ev.after.avgDasherWait} fmt={v => `${v.toFixed(1)}m`} />
            <Delta label="Cold orders" before={ev.before.coldOrders} after={ev.after.coldOrders} fmt={v => v.toFixed(0)} />
            <Delta label="At risk" before={ev.before.dollarsAtRisk} after={ev.after.dollarsAtRisk} fmt={fmtMoney} />
          </div>
          <div className="text-xs text-fg-2 mt-2">Costs <b className="text-fg">{fmtMoney(ev.cost)}</b>, protects <b className="text-fg">{fmtMoney(ev.protectedDollars)}</b> · helped on <b className="text-fg">{ev.nightsHelped}/{ev.nights}</b> nights · risk cut <b className="text-fg">{ev.before.dollarsAtRisk > 0 ? Math.max(0, Math.round((1 - ev.after.dollarsAtRisk / ev.before.dollarsAtRisk) * 100)) : 0}%</b></div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-primary text-xs" onClick={() => setTab("Race")}>Watch the race →</button>
            <button className="btn text-xs" onClick={runRehearse} disabled={planLoading}>Re-run</button>
          </div>
          {planStatus && !planLoading && <div className="text-xs text-fg-3 mt-1 animate-pulse">{planStatus}</div>}
        </div>
      )}
      {plan && (
        <div className="text-xs text-fg-2 rounded-lg border border-line bg-bg-3 p-2.5">
          <span className="text-fg-3 uppercase tracking-wider text-[10px] font-semibold">Bottleneck</span>
          <div className="mt-0.5">{plan.bottleneck.summary}</div>
        </div>
      )}
      {accepted.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="panel-title">Tested fixes · {accepted.length}</div>
          {accepted.map(c => <Card key={c.id} c={c} line={planExplanations[c.id]} busy={!!planStatus} onToggle={() => togglePlanCard(c.id)} />)}
        </div>
      )}
      {rejected.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="panel-title">Rejected by the simulator · {rejected.length}</div>
          {rejected.map(c => <Card key={c.id} c={c} line={planExplanations[c.id]} />)}
        </div>
      )}
      {plan && <div className="text-[10px] text-fg-3">Each fix was simulated against the same {plan.cards[0]?.evidence.nights ?? 120} nights as the baseline (common random numbers), then combined greedily and re-tested on {plan.combined.nights}.</div>}
    </div>
  );
}

function Delta({ label, before, after, fmt }: { label: string; before: number; after: number; fmt: (v: number) => string }) {
  const better = after <= before;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg-3">{label}</div>
      <div className="num text-sm"><span className="text-fg-3 line-through">{fmt(before)}</span> <span className={`font-bold text-lg ${better ? "text-ok" : "text-bad"}`}>{fmt(after)}</span></div>
    </div>
  );
}

function Card({ c, line, onToggle, busy }: { c: PlanCard; line?: string; onToggle?: () => void; busy?: boolean }) {
  const e = c.evidence;
  const rej = !c.accepted;
  return (
    <div className={`rounded-lg border p-2.5 fade-up ${rej ? "border-line bg-bg-3 opacity-70" : c.enabled ? "border-accent/50 bg-accent/5" : "border-line bg-bg-3"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`text-sm font-semibold leading-snug ${rej ? "line-through text-fg-2" : ""}`}>{c.title}</div>
        {rej ? <span className="chip shrink-0 !text-bad !border-bad/40">rejected</span> : (
          <button onClick={onToggle} disabled={busy} className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${c.enabled ? "bg-ok" : "bg-fg-3/40"} ${busy ? "opacity-60" : ""}`} title="Toggle this fix and re-test the plan">
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${c.enabled ? "left-4.5" : "left-0.5"}`} />
          </button>
        )}
      </div>
      {rej ? (
        <div className="text-xs text-bad mt-1">{c.rejectReason}</div>
      ) : (
        <div className="text-[11px] num text-fg-2 mt-1">
          wait {e.before.avgDasherWait.toFixed(1)}→<b className="text-fg">{e.after.avgDasherWait.toFixed(1)}m</b> · cold {e.before.coldOrders.toFixed(0)}→<b className="text-fg">{e.after.coldOrders.toFixed(0)}</b> · risk {fmtMoney(e.before.dollarsAtRisk)}→<b className="text-fg">{fmtMoney(e.after.dollarsAtRisk)}</b>
        </div>
      )}
      <div className="text-[11px] text-fg-3 mt-1 num">costs <b className={rej ? "" : "text-fg"}>{c.costLabel}</b> · protects <b className={rej ? "" : "text-ok"}>{fmtMoney(e.protectedDollars)}</b> · helped on {e.nightsHelped}/{e.nights} nights</div>
      <div className="text-xs text-fg-2 mt-1">{line ?? c.rationale}</div>
    </div>
  );
}

export function stationName(id: string) { return STATION_NAME[id] ?? id; }
export { fmtClockShort };
export default memo(RehearsePanel);
