"use client";
import type { Snapshot, Station, StationId } from "@/sim/types";
import { FLOOR_W, FLOOR_H, DOOR, CHANNEL_COLOR } from "@/sim/layout";

const S = 64; // px per meter (viewBox units)
const STATION_FILL: Record<StationId, string> = { grill: "#3a2320", fryer: "#3b2a12", cold: "#182a3a", pack: "#242836", counter: "#2e2416" };
const STATION_STROKE: Record<StationId, string> = { grill: "#b0463a", fryer: "#d08a2a", cold: "#4a8fd6", pack: "#6b7388", counter: "#c99a3c" };
const STATION_SIZE: Record<StationId, [number, number]> = { grill: [2.6, 1.1], fryer: [2.6, 1.1], cold: [2.6, 1.1], pack: [3.2, 1.0], counter: [3.6, 0.9] };

export interface Kitchen2DProps {
  snapshot: Snapshot | null;
  stations: Station[];
  highlightStation?: StationId | null;
  className?: string;
}

function loadColor(load: number) {
  if (load >= 1) return "#ff4d5e";
  if (load >= 0.7) return "#ffc84a";
  return "#3ddc84";
}
function warmthColor(base: string, warmth: number) {
  // blend toward icy blue-white as food cools past its hold limit
  const w = Math.max(0, Math.min(1, (warmth - 0.6) / 0.8));
  if (w <= 0) return base;
  const to = [168, 214, 255];
  const b = [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)];
  const c = b.map((v, i) => Math.round(v + (to[i] - v) * w));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function Kitchen2D({ snapshot, stations, highlightStation, className }: Kitchen2DProps) {
  const W = FLOOR_W * S, H = FLOOR_H * S;
  const stSnap = new Map(snapshot?.stations.map(s => [s.id, s]) ?? []);
  return (
    <svg viewBox={`-20 -20 ${W + 40} ${H + 70}`} preserveAspectRatio="xMidYMin meet" className={className ?? "w-full h-full"} style={{ display: "block" }}>
      <defs>
        <pattern id="grid" width={S} height={S} patternUnits="userSpaceOnUse">
          <path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#1b2030" strokeWidth="1" />
        </pattern>
        <filter id="glow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {/* floor */}
      <rect x={0} y={0} width={W} height={H} rx={10} fill="#121620" />
      <rect x={0} y={0} width={W} height={H} rx={10} fill="url(#grid)" />
      <rect x={0} y={0} width={W} height={H} rx={10} fill="none" stroke="#2a3042" strokeWidth={2} />
      {/* front wall + door */}
      <rect x={0} y={H - 6} width={DOOR.x * S - 50} height={6} fill="#2a3042" />
      <rect x={DOOR.x * S + 50} y={H - 6} width={W - DOOR.x * S - 50} height={6} fill="#2a3042" />
      <text x={DOOR.x * S} y={H + 34} textAnchor="middle" fill="#6b7388" fontSize={13} fontWeight={600} letterSpacing={1.5}>FRONT DOOR · DASHER PICKUP</text>
      <path d={`M ${DOOR.x * S - 40} ${H + 8} l 40 -10 l 40 10`} fill="none" stroke="#3a4256" strokeWidth={2} />

      {/* stations */}
      {stations.map(st => {
        const ss = stSnap.get(st.id);
        const [w, h] = STATION_SIZE[st.id];
        const x = (st.x - w / 2) * S, y = (st.y - h / 2) * S;
        const load = ss?.load ?? 0;
        const sat = ss?.saturated ?? false;
        const hl = highlightStation === st.id;
        return (
          <g key={st.id}>
            {(sat || hl) && <rect x={x - 6} y={y - 6} width={w * S + 12} height={h * S + 12} rx={12} fill="none" stroke={hl ? "#ffb86b" : "#ff4d5e"} strokeWidth={hl ? 3 : 2} opacity={0.9} filter="url(#glow)" />}
            <rect x={x} y={y} width={w * S} height={h * S} rx={8} fill={STATION_FILL[st.id]} stroke={STATION_STROKE[st.id]} strokeWidth={2} />
            <text x={x + 12} y={y + 24} fill="#eef0f5" fontSize={16} fontWeight={700}>{st.name}</text>
            {ss && st.id !== "pack" && st.id !== "counter" && (
              <text x={x + 12} y={y + 46} fill="#a9b0c2" fontSize={12} className="num">{ss.busy % 1 ? ss.busy.toFixed(1) : ss.busy}/{ss.capacity} busy{ss.queue > 0 ? ` · ${ss.queue} queued` : ""}</text>
            )}
            {ss && (st.id === "pack" || st.id === "counter") && (
              <text x={x + 12} y={y + 46} fill="#a9b0c2" fontSize={12} className="num">{st.id === "pack" ? `${ss.busy} packing${ss.queue > 0 ? ` · ${ss.queue} waiting` : ""}` : "walk-in & phone pickup"}</text>
            )}
            {/* load bar */}
            {st.id !== "counter" && (
              <g>
                <rect x={x + w * S - 22} y={y + 10} width={10} height={h * S - 20} rx={3} fill="#0b0d12" />
                <rect x={x + w * S - 22} y={y + 10 + (h * S - 20) * (1 - Math.min(1, load))} width={10} height={(h * S - 20) * Math.min(1, load)} rx={3} fill={loadColor(load)} className={sat ? "pulse-bad" : ""} />
              </g>
            )}
          </g>
        );
      })}

      {/* tokens */}
      {snapshot?.tokens.map((tk, i) => (
        <rect key={`${tk.orderId}-${i}`} x={tk.x * S - 7} y={tk.y * S - 7} width={14} height={14} rx={3}
          fill={warmthColor(CHANNEL_COLOR[tk.channel], tk.warmth)} opacity={tk.stage === "queue" ? 0.75 : 1}
          stroke={tk.warmth > 1 ? "#a8d6ff" : "none"} strokeWidth={1.5} />
      ))}

      {/* workers */}
      {snapshot?.workers.filter(w => w.onShift).map(w => (
        <g key={w.id} transform={`translate(${w.x * S}, ${(w.y + 0.95) * S})`}>
          <circle r={15} fill={w.color} stroke="#0b0d12" strokeWidth={3} />
          {w.busy && <circle r={19} fill="none" stroke={w.color} strokeWidth={2} opacity={0.5} />}
          <text y={32} textAnchor="middle" fill="#eef0f5" fontSize={12} fontWeight={600} style={{ paintOrder: "stroke", stroke: "#0b0d12", strokeWidth: 3 }}>{w.name}</text>
        </g>
      ))}

      {/* dashers */}
      {snapshot?.dashers.map(d => (
        <g key={d.orderId} transform={`translate(${d.x * S}, ${d.y * S})`}>
          <circle r={11} fill="#1f2433" stroke={CHANNEL_COLOR[d.channel]} strokeWidth={3} />
          <circle r={4} fill={CHANNEL_COLOR[d.channel]} />
          <text y={-16} textAnchor="middle" fill={d.waitMin > 3 ? "#ff4d5e" : "#a9b0c2"} fontSize={11} fontWeight={700} className="num">{d.waitMin.toFixed(0)}m</text>
        </g>
      ))}
      {snapshot && snapshot.dashers.length >= 3 && (
        <text x={DOOR.x * S + 20} y={H - 100} textAnchor="end" fill="#ff4d5e" fontSize={13} fontWeight={700}>{snapshot.dashers.length} Dashers waiting</text>
      )}
    </svg>
  );
}
