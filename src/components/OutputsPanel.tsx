"use client";
import { memo, useState } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import type { Intervention, Plan } from "@/plan/types";
import { fmtClockShort, SERVICE_START, SERVICE_END } from "@/sim/types";
import type { Scenario } from "@/sim/types";

export interface GamePlan {
  prepList: { item: string; qty: number; time: number }[];
  staffText: string | null;
  quoteSchedule: { start: number; end: number; minutes: number }[];
  layout: { station: string; x: number; y: number }[];
  channelPauses: { channel: string; start: number; end: number }[];
}

const WNAME: Record<string, string> = { maria: "Maria", jake: "Jake", ana: "Ana", sam: "Sam" };
const CNAME: Record<string, string> = { doordash: "DoorDash", ubereats: "Uber Eats", phone: "phone", counter: "counter" };

export function buildGamePlan(plan: Plan, tonight: Scenario): GamePlan {
  const ivs: Intervention[] = plan.cards.filter(c => c.accepted && c.enabled).map(c => c.intervention);
  const menuName = (id: string) => tonight.menu.find(m => m.id === id || m.name === id)?.name ?? id;
  const prepList = ivs.filter(i => i.type === "prep_batch").map(i => i.type === "prep_batch" ? { item: menuName(i.item), qty: i.qty, time: i.time } : null!).filter(Boolean);
  const shifts = ivs.filter(i => i.type === "add_shift");
  const drivers = (tonight.notes ?? []).filter(n => !/called out/i.test(n)).slice(0, 2).map(n => n.split(" · ")[0]).join(" + ");
  const peak = fmtClockShort(plan.bottleneck.window.start);
  const staffText = shifts.length ? shifts.map(s => s.type === "add_shift" ? `Hey ${WNAME[s.worker]}, can you cover ${fmtClockShort(s.start)}–${fmtClockShort(s.end)} tonight? ${drivers || "Big night"}; we're projected to slam at ${peak}. The simulator says you'd be the difference. —Maria` : "").join("\n\n") : null;
  const quoteSchedule = plan.scenario.quotedPrep.map(q => ({ ...q }));
  const layout = ivs.filter(i => i.type === "move_station").map(i => i.type === "move_station" ? { station: i.station, x: i.x, y: i.y } : null!).filter(Boolean);
  const channelPauses = ivs.filter(i => i.type === "throttle_channel").map(i => i.type === "throttle_channel" ? { channel: CNAME[i.channel], start: i.start, end: i.end } : null!).filter(Boolean);
  return { prepList, staffText, quoteSchedule, layout, channelPauses };
}

function OutputsPanel() {
  const { plan, tonight } = useApp(useShallow(s => ({ plan: s.plan, tonight: s.tonight })));
  const [copied, setCopied] = useState(false);
  if (!plan) return <div className="text-xs text-fg-3 no-print">Run Rehearse to generate tonight&apos;s game plan.</div>;
  const gp = buildGamePlan(plan, tonight);
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center justify-between no-print">
        <div className="panel-title">Tonight&apos;s game plan</div>
        <button className="btn !py-1 !px-2 text-xs" onClick={() => window.print()}>Print</button>
      </div>
      <div className="prep-sheet border border-line rounded p-3 bg-bg-2">
        <div className="sheet-head">
          <div>
            <div className="font-semibold text-[13px]">Maria&apos;s Burgers &amp; Wings</div>
            <div className="text-xs text-fg-2">Prep sheet · tonight&apos;s game plan</div>
          </div>
          <div className="num text-xs text-fg-2">{tonight.date}</div>
        </div>
        <Section title="Prep list">
          {gp.prepList.length ? gp.prepList.map((p, i) => <div key={i} className="flex justify-between gap-3"><span><b className="num font-semibold">{p.qty}×</b> {p.item}</span><span className="num text-fg-2">ready by {fmtClockShort(p.time)}</span></div>) : <div className="text-xs text-fg-3">No extra prep needed.</div>}
        </Section>
        <Section title="Staff message" action={gp.staffText ? <button className="btn !py-0.5 !px-2 text-[11px] no-print" onClick={() => copy(gp.staffText!)}>{copied ? "Copied" : "Copy"}</button> : null}>
          {gp.staffText ? <div className="whitespace-pre-wrap border-l-2 border-line pl-2.5 text-fg">{gp.staffText}</div> : <div className="text-xs text-fg-3">No extra shift in the plan.</div>}
        </Section>
        <Section title="DoorDash quoted prep time">
          <div className="text-xs text-fg-3 mb-1">Merchant Portal → Adjust prep time</div>
          {mergeWindows(gp.quoteSchedule).map((q, i) => <div key={i} className="num flex justify-between"><span>{fmtClockShort(q.start)}–{fmtClockShort(q.end)}</span><b className="font-semibold">{q.minutes} min</b></div>)}
        </Section>
        {gp.channelPauses.length > 0 && <Section title="Channel pauses">{gp.channelPauses.map((c, i) => <div key={i} className="flex justify-between"><span>Pause <b className="font-semibold">{c.channel}</b></span><span className="num">{fmtClockShort(c.start)}–{fmtClockShort(c.end)}</span></div>)}</Section>}
        {gp.layout.length > 0 && <Section title="Layout">{gp.layout.map((l, i) => <div key={i}>Move <b className="font-semibold">{l.station}</b> to <span className="num">({l.x} m, {l.y} m)</span></div>)}</Section>}
      </div>
    </div>
  );
}

function mergeWindows(ws: { start: number; end: number; minutes: number }[]) {
  const sorted = [...ws].sort((a, b) => a.start - b.start).filter(w => w.end > SERVICE_START && w.start < SERVICE_END);
  const out: typeof sorted = [];
  for (const w of sorted) { const l = out[out.length - 1]; if (l && l.minutes === w.minutes && l.end >= w.start) l.end = Math.max(l.end, w.end); else out.push({ ...w }); }
  return out;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="sheet-section">
      <div className="flex items-center justify-between"><div className="sheet-title">{title}</div>{action}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export default memo(OutputsPanel);
