"use client";
import type { Snapshot, Station, StationId } from "@/sim/types";
import { FLOOR_W, FLOOR_H, DOOR, CHANNEL_COLOR } from "@/sim/layout";
import { PALETTE } from "@/lib/palette";

const S = 64; // px per meter (viewBox units)
// thin colored top stripe per station type (desaturated, meaningful: heat = warm, cold = cool, pass = neutral)
const STATION_STRIPE: Record<StationId, string> = { grill: "#B83227", fryer: "#B7791F", cold: "#2F6DB5", pack: "#5A6370", counter: "#9A6B12" };
const STATION_SIZE: Record<StationId, [number, number]> = { grill: [2.6, 1.1], fryer: [2.6, 1.1], cold: [2.6, 1.1], pack: [3.2, 1.0], counter: [3.6, 0.9] };

export interface Kitchen2DProps {
  snapshot: Snapshot | null;
  stations: Station[];
  highlightStation?: StationId | null;
  className?: string;
}

function loadColor(load: number) {
  if (load >= 1) return PALETTE.bad;
  if (load >= 0.7) return PALETTE.warn;
  return "#A9B0BA";
}
function warmthColor(base: string, warmth: number) {
  // blend toward a cool gray-blue as food cools past its hold limit
  const w = Math.max(0, Math.min(1, (warmth - 0.6) / 0.8));
  if (w <= 0) return base;
  const to = [0x9f, 0xb3, 0xc8];
  const b = [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)];
  const c = b.map((v, i) => Math.round(v + (to[i] - v) * w));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function Kitchen2D({ snapshot, stations, highlightStation, className }: Kitchen2DProps) {
  const W = FLOOR_W * S, H = FLOOR_H * S;
  const stSnap = new Map(snapshot?.stations.map(s => [s.id, s]) ?? []);
  return (
    <svg viewBox={`-20 -20 ${W + 40} ${H + 70}`} preserveAspectRatio="xMidYMin meet" className={className ?? "w-full h-full"} style={{ display: "block", fontFamily: "var(--font-sans)" }}>
      <defs>
        <pattern id="grid" width={S} height={S} patternUnits="userSpaceOnUse">
          <path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#DADDE2" strokeWidth="1" />
        </pattern>
      </defs>
      {/* floor */}
      <rect x={0} y={0} width={W} height={H} rx={4} fill="#E9EBEF" />
      <rect x={0} y={0} width={W} height={H} rx={4} fill="url(#grid)" />
      <rect x={0} y={0} width={W} height={H} rx={4} fill="none" stroke="#C3C8CF" strokeWidth={1.5} />
      {/* front wall + door */}
      <rect x={0} y={H - 5} width={DOOR.x * S - 50} height={5} fill="#8A93A0" />
      <rect x={DOOR.x * S + 50} y={H - 5} width={W - DOOR.x * S - 50} height={5} fill="#8A93A0" />
      <text x={DOOR.x * S} y={H + 32} textAnchor="middle" fill={PALETTE.text2} fontSize={13} fontWeight={500}>Front door · Dasher pickup</text>
      <path d={`M ${DOOR.x * S - 40} ${H + 8} l 40 -10 l 40 10`} fill="none" stroke="#8A93A0" strokeWidth={1.5} />

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
            {(sat || hl) && <rect x={x - 4} y={y - 4} width={w * S + 8} height={h * S + 8} rx={6} fill="none" stroke={hl ? PALETTE.plan : PALETTE.bad} strokeWidth={2} />}
            <rect x={x} y={y} width={w * S} height={h * S} rx={4} fill="#FFFFFF" stroke={PALETTE.border} strokeWidth={1} />
            <rect x={x} y={y} width={w * S} height={4} rx={1} fill={STATION_STRIPE[st.id]} />
            <text x={x + 12} y={y + 26} fill={PALETTE.ink} fontSize={15} fontWeight={600}>{st.name}</text>
            {sat && <text x={x + 12 + st.name.length * 9 + 8} y={y + 26} fill={PALETTE.bad} fontSize={11} fontWeight={600}>saturated</text>}
            {ss && st.id !== "pack" && st.id !== "counter" && (
              <text x={x + 12} y={y + 46} fill={PALETTE.text2} fontSize={12} className="num">{ss.busy % 1 ? ss.busy.toFixed(1) : ss.busy}/{ss.capacity} busy{ss.queue > 0 ? ` · ${ss.queue} queued` : ""}</text>
            )}
            {ss && (st.id === "pack" || st.id === "counter") && (
              <text x={x + 12} y={y + 46} fill={PALETTE.text2} fontSize={12} className="num">{st.id === "pack" ? `${ss.busy} packing${ss.queue > 0 ? ` · ${ss.queue} waiting` : ""}` : "walk-in & phone pickup"}</text>
            )}
            {/* load bar */}
            {st.id !== "counter" && (
              <g>
                <rect x={x + w * S - 20} y={y + 12} width={8} height={h * S - 22} rx={2} fill="#EEF0F3" stroke={PALETTE.border} strokeWidth={1} />
                <rect x={x + w * S - 20} y={y + 12 + (h * S - 22) * (1 - Math.min(1, load))} width={8} height={(h * S - 22) * Math.min(1, load)} rx={2} fill={loadColor(load)} />
              </g>
            )}
          </g>
        );
      })}

      {/* tokens: small ticket slips in channel colors */}
      {snapshot?.tokens.map((tk, i) => (
        <rect key={`${tk.orderId}-${i}`} x={tk.x * S - 7} y={tk.y * S - 7} width={14} height={14} rx={3}
          fill={warmthColor(CHANNEL_COLOR[tk.channel], tk.warmth)} opacity={tk.stage === "queue" ? 0.7 : 1}
          stroke={tk.warmth > 1 ? "#5A6370" : "#FFFFFF"} strokeWidth={1.5} />
      ))}

      {/* workers */}
      {snapshot?.workers.filter(w => w.onShift).map(w => (
        <g key={w.id} transform={`translate(${w.x * S}, ${(w.y + 0.95) * S})`}>
          <circle r={14} fill={w.color} stroke="#FFFFFF" strokeWidth={2.5} />
          {w.busy && <circle r={18} fill="none" stroke={w.color} strokeWidth={1.5} opacity={0.6} />}
          <text y={31} textAnchor="middle" fill={PALETTE.ink} fontSize={12} fontWeight={600} style={{ paintOrder: "stroke", stroke: "#E9EBEF", strokeWidth: 3 }}>{w.name}</text>
        </g>
      ))}

      {/* dashers: outlined circle, channel dot, mono wait label */}
      {snapshot?.dashers.map(d => (
        <g key={d.orderId} transform={`translate(${d.x * S}, ${d.y * S})`}>
          <circle r={11} fill="#FFFFFF" stroke={d.waitMin > 3 ? PALETTE.bad : PALETTE.text2} strokeWidth={2} />
          <circle r={4} fill={CHANNEL_COLOR[d.channel]} />
          <text y={-16} textAnchor="middle" fill={d.waitMin > 3 ? PALETTE.bad : PALETTE.text2} fontSize={11} fontWeight={600} className="num">{d.waitMin.toFixed(0)}m</text>
        </g>
      ))}
      {snapshot && snapshot.dashers.length >= 3 && (
        <text x={DOOR.x * S + 20} y={H - 100} textAnchor="end" fill={PALETTE.bad} fontSize={13} fontWeight={600}><tspan className="num">{snapshot.dashers.length}</tspan> Dashers waiting</text>
      )}
    </svg>
  );
}
