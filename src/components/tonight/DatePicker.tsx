"use client";
import { useState } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { DEMO_DATE } from "@/data/cache";
import { fmtClockShort } from "@/sim/types";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Today (local). */
export function todayIso(): string { return iso(new Date()); }
/** The coming Friday (today if today is Friday). */
export function thisFridayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return iso(d);
}

export default function DatePicker() {
  const { date, setDate, tonightLoading, hours } = useApp(useShallow(s => ({ date: s.date, setDate: s.setDate, tonightLoading: s.tonightLoading, hours: s.tonight.restaurant?.hours })));
  const [custom, setCustom] = useState(false);
  const today = todayIso();
  const friday = thisFridayIso();
  const picks: [string, string][] = [["Tonight", today], ["This Friday", friday], ["Next game day", DEMO_DATE]];
  const isPreset = picks.some(([, d]) => d === date);
  const hoursLabel = hours ? `${fmtClockShort(hours.open)}–${fmtClockShort(hours.close)}` : "4–10 PM";
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {picks.map(([label, d]) => (
          <button key={label} className={`btn !py-0.5 !px-2 text-xs ${date === d ? "!bg-fg !text-white !border-fg" : ""}`} onClick={() => { setCustom(false); void setDate(d); }} disabled={tonightLoading && date === d} title={d}>{label}</button>
        ))}
        <button className={`btn !py-0.5 !px-2 text-xs ${custom || !isPreset ? "!bg-fg !text-white !border-fg" : ""}`} onClick={() => setCustom(c => !c)}>Pick a date…</button>
      </div>
      {(custom || !isPreset) && (
        <input type="date" value={date} aria-label="Night to simulate" className="mt-1.5 num text-xs border border-line rounded px-2 py-1 bg-bg-2 text-fg" onChange={e => { if (e.target.value) void setDate(e.target.value); }} />
      )}
      <div className="text-[11px] text-fg-3 mt-1">Service window <span className="num">{hoursLabel}</span>{tonightLoading ? " · fetching real events and weather…" : ""}</div>
    </div>
  );
}
