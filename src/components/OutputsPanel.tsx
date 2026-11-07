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
  const staffText = shifts.length ? shifts.map(s => s.type === "add_shift" ? `Hey ${WNAME[s.worker]}, can you cover ${fmtClockShort(s.start)}–${fmtClockShort(s.end)} tonight? ${drivers || "Big night"}; we're projected to slam at ${peak}. Simulator says you'd be the difference. 🙏 —Maria` : "").join("\n\n") : null;
  const quoteSchedule = plan.scenario.quotedPrep.map(q => ({ ...q }));
  const layout = ivs.filter(i => i.type === "move_station").map(i => i.type === "move_station" ? { station: i.station, x: i.x, y: i.y } : null!).filter(Boolean);
  const channelPauses = ivs.filter(i => i.type === "throttle_channel").map(i => i.type === "throttle_channel" ? { channel: CNAME[i.channel], start: i.start, end: i.end } : null!).filter(Boolean);
  return { prepList, staffText, quoteSchedule, layout, channelPauses };
}

function OutputsPanel() {
  const { plan, tonight } = useApp(useShallow(s => ({ plan: s.plan, tonight: s.tonight })));
  const [copied, setCopied] = useState(false);
  if (!plan) return <div className="text-xs text-fg-3">Run Rehearse to generate tonight&apos;s game plan.</div>;
  const gp = buildGamePlan(plan, tonight);
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (
    <div className="flex flex-col gap-3 fade-up">
      <div className="flex items-center justify-between">
        <div className="panel-title">Tonight&apos;s game plan</div>
        <button className="btn !py-1 !px-2 text-xs no-print" onClick={() => window.print()}>Print</button>
      </div>
      <Section title="Prep list">
        {gp.prepList.length ? gp.prepList.map((p, i) => <div key={i} className="text-sm">• <b>{p.qty}× {p.item}</b> ready by {fmtClockShort(p.time)}</div>) : <div className="text-xs text-fg-3">No extra prep needed.</div>}
      </Section>
      <Section title="Staff message" action={gp.staffText ? <button className="btn !py-0.5 !px-2 text-[11px] no-print" onClick={() => copy(gp.staffText!)}>{copied ? "Copied ✓" : "Copy"}</button> : null}>
        {gp.staffText ? <div className="text-sm whitespace-pre-wrap rounded-md bg-bg p-2 border border-line">{gp.staffText}</div> : <div className="text-xs text-fg-3">No extra shift in the plan.</div>}
      </Section>
      <Section title="DoorDash quoted prep time">
        <div className="text-[10px] text-fg-3 mb-1">maps to Merchant Portal → Adjust prep time</div>
        {mergeWindows(gp.quoteSchedule).map((q, i) => <div key={i} className="text-sm num">{fmtClockShort(q.start)}–{fmtClockShort(q.end)}: <b>{q.minutes} min</b></div>)}
      </Section>
      {gp.channelPauses.length > 0 && <Section title="Channel pauses">{gp.channelPauses.map((c, i) => <div key={i} className="text-sm">• Pause <b>{c.channel}</b> {fmtClockShort(c.start)}–{fmtClockShort(c.end)}</div>)}</Section>}
      {gp.layout.length > 0 && <Section title="Layout">{gp.layout.map((l, i) => <div key={i} className="text-sm">• Move <b>{l.station}</b> to ({l.x} m, {l.y} m)</div>)}</Section>}
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
    <div className="rounded-lg border border-line bg-bg-3 p-2.5">
      <div className="flex items-center justify-between mb-1"><div className="text-[10px] uppercase tracking-wider text-fg-3 font-semibold">{title}</div>{action}</div>
      {children}
    </div>
  );
}

export default memo(OutputsPanel);
