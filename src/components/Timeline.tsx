"use client";
import { useRef } from "react";
import { useApp } from "@/store/app";
import { SERVICE_START, SERVICE_END, fmtClock, fmtClockShort } from "@/sim/types";
import type { BinMetrics } from "@/sim/types";

const SPEEDS = [1, 30, 60, 240, 720];

export default function Timeline({ bins, t }: { bins: BinMetrics[] | null; t: number }) {
  const { playing, togglePlay, speed, setSpeed, seekTime, reset, night } = useApp();
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
        <button className="btn" onClick={reset} title="Reset (R)">⟲</button>
        <button className="btn btn-primary w-24 justify-center" onClick={togglePlay} disabled={!night} title="Play/Pause (P)">{playing ? "Pause" : "▶ Play"}</button>
        <div className="flex items-center rounded-lg border border-line overflow-hidden">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1.5 text-xs num ${speed === s ? "bg-accent text-black font-bold" : "text-fg-2 hover:bg-bg-3"}`}>{s}×</button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div ref={ref} onMouseDown={onScrub} onMouseMove={e => { if (e.buttons === 1) onScrub(e); }} className="relative h-10 cursor-pointer select-none">
          {/* bins: fryer load (bars) + dasher wait (line) */}
          <div className="absolute inset-0 flex items-end gap-px">
            {bins?.map(b => {
              const load = Math.min(1, b.fryerLoad);
              const color = load >= 1 ? "#ff4d5e" : load >= 0.7 ? "#ffc84a" : "#3ddc84";
              const active = b.start <= t;
              return <div key={b.start} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(6, load * 100)}%`, background: color, opacity: active ? 0.9 : 0.3 }} />;
            })}
          </div>
          {bins && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline fill="none" stroke="#eef0f5" strokeWidth="0.8" vectorEffect="non-scaling-stroke"
                points={bins.map((b, i) => `${(i + 0.5) / bins.length * 100},${40 - Math.min(1, b.avgDasherWait / maxWait) * 36}`).join(" ")} />
            </svg>
          )}
          <div className="absolute top-0 bottom-0 w-0.5 bg-fg" style={{ left: `${frac * 100}%` }}>
            <div className="absolute -top-1 -translate-x-1/2 bg-fg text-black text-[11px] font-bold num px-1.5 rounded whitespace-nowrap">{fmtClock(t)}</div>
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-fg-3 num px-0.5">
          {[16, 17, 18, 19, 20, 21, 22].map(h => <span key={h}>{fmtClockShort(h * 60)}</span>)}
        </div>
      </div>
      <div className="text-[10px] text-fg-3 leading-tight w-28">
        <div><span className="inline-block w-2 h-2 rounded-sm bg-ok mr-1" />fryer load</div>
        <div><span className="inline-block w-3 h-0.5 bg-fg mr-1 align-middle" />Dasher wait</div>
      </div>
    </div>
  );
}
