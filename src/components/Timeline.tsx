"use client";
import { useRef } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { SERVICE_START, SERVICE_END, fmtClock, fmtClockShort } from "@/sim/types";
import type { BinMetrics } from "@/sim/types";

const SPEEDS = [1, 30, 60, 240, 720];

export default function Timeline({ bins, t }: { bins: BinMetrics[] | null; t: number }) {
  const { playing, togglePlay, speed, setSpeed, seekTime, reset, hasNight, bottleneckId, stations } = useApp(useShallow(s => ({ playing: s.playing, togglePlay: s.togglePlay, speed: s.speed, setSpeed: s.setSpeed, seekTime: s.seekTime, reset: s.reset, hasNight: !!s.night, bottleneckId: s.tonightMC?.mean.bottleneck.station ?? null, stations: s.tonight.stations })));
  // the bars plot the load of tonight's bottleneck station (fryer by default); bins carry fryer and grill load
  const stationId = bottleneckId ?? "fryer";
  const stationName = stations.find(st => st.id === stationId)?.name ?? (stationId === "grill" ? "Grill" : "Fryer");
  const loadOf = (b: BinMetrics) => (stationId === "grill" ? b.grillLoad : b.fryerLoad);
  const ref = useRef<HTMLDivElement>(null);
  const frac = (t - SERVICE_START) / (SERVICE_END - SERVICE_START);
  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    seekTime(SERVICE_START + f * (SERVICE_END - SERVICE_START));
  };
  const maxWait = Math.max(5, ...(bins?.map(b => b.avgDasherWait) ?? [0]));
  return (
    <div className="flex items-center gap-4 h-full">
      <div className="flex items-center gap-2">
        <button className="btn" onClick={reset} title="Reset (R)">Reset</button>
        <button className="btn btn-primary w-20 justify-center" onClick={togglePlay} disabled={!hasNight} title="Play/Pause (P)">{playing ? "Pause" : "Play"}</button>
        <div className="flex items-center rounded border border-line overflow-hidden">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1.5 text-xs num border-l border-line first:border-l-0 ${speed === s ? "bg-fg text-white font-semibold" : "text-fg-2 hover:bg-bg-3"}`}>{s}×</button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div ref={ref} onMouseDown={onScrub} onMouseMove={e => { if (e.buttons === 1) onScrub(e); }} className="relative h-10 cursor-pointer select-none border-b border-line">
          {/* light gridlines */}
          <div className="absolute inset-0 pointer-events-none">
            {[0.25, 0.5, 0.75].map(f => <div key={f} className="absolute top-0 bottom-0 border-l border-dashed border-line" style={{ left: `${f * 100}%` }} />)}
          </div>
          {/* bins: fryer load (bars) + dasher wait (line) */}
          <div className="absolute inset-0 flex items-end gap-px">
            {bins?.map(b => {
              const load = Math.min(1, loadOf(b));
              const color = load >= 1 ? "#C2410C" : load >= 0.7 ? "#B7791F" : "#C3C8CF";
              const active = b.start <= t;
              return <div key={b.start} className="flex-1" style={{ height: `${Math.max(4, load * 100)}%`, background: color, opacity: active ? 0.85 : 0.35 }} />;
            })}
          </div>
          {bins && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline fill="none" stroke="#16191D" strokeWidth="1.25" vectorEffect="non-scaling-stroke"
                points={bins.map((b, i) => `${(i + 0.5) / bins.length * 100},${40 - Math.min(1, b.avgDasherWait / maxWait) * 36}`).join(" ")} />
            </svg>
          )}
          <div className="absolute top-0 bottom-0 w-px bg-fg" style={{ left: `${frac * 100}%` }}>
            <div className="absolute top-0 -translate-x-1/2 bg-fg text-white text-[11px] font-medium num px-1.5 rounded-sm whitespace-nowrap">{fmtClock(t)}</div>
          </div>
        </div>
        <div className="flex justify-between text-[11px] text-fg-2 num px-0.5">
          {[16, 17, 18, 19, 20, 21, 22].map(h => <span key={h}>{fmtClockShort(h * 60)}</span>)}
        </div>
        <div className="text-[10px] text-fg-3 text-center -mt-0.5">Clock · 4 PM–10 PM</div>
      </div>
      <div className="text-[11px] text-fg-2 leading-tight w-32">
        <div className="flex items-center gap-1.5" title={`Bars: how busy the ${stationName} is each 15 min (tonight's bottleneck)`}><span className="inline-block w-2.5 h-2.5 bg-warn shrink-0" /><span className="truncate">{stationName} load</span></div>
        <div className="flex items-center gap-1.5 mt-1"><span className="inline-block w-3 h-px bg-fg" />Dasher wait</div>
      </div>
    </div>
  );
}
