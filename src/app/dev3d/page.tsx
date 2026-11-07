"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Channel, DasherSnapshot, Snapshot, Station, StationId, TokenSnapshot, WorkerSnapshot } from "@/sim/types";
import { CHANNELS, STATIONS } from "@/sim/types";
import { DEFAULT_STATIONS, IDLE_SPOT, dasherSlot } from "@/sim/layout";
import { Kitchen3DFallback } from "@/components/Kitchen3D";

const Kitchen3D = dynamic(() => import("@/components/Kitchen3D"), { ssr: false, loading: () => <Kitchen3DFallback /> });

const WORKERS = [
  { id: "w1", name: "Maria", color: "#ff7a1a", route: ["grill", "pack", "grill", "fryer"] as StationId[] },
  { id: "w2", name: "Deshawn", color: "#4da3ff", route: ["fryer", "pack", "fryer", "cold"] as StationId[] },
  { id: "w3", name: "Priya", color: "#3ddc84", route: ["cold", "pack", "counter", "pack"] as StationId[] },
  { id: "w4", name: "Tom", color: "#c47aff", route: ["counter", "pack", "counter", "counter"] as StationId[] },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function makeSnapshot(time: number, stations: Station[]): Snapshot {
  const byId = Object.fromEntries(stations.map((s) => [s.id, s])) as Record<StationId, Station>;
  const t = time / 1000;

  const stationSnaps = STATIONS.map((id, i) => {
    const s = byId[id];
    const load = Math.max(0, 0.55 + 0.5 * Math.sin(t * 0.5 + i * 1.3) + (id === "fryer" ? 0.25 : 0));
    const cap = s.capacity >= 99 ? 8 : s.capacity;
    const busy = Math.min(cap, Math.round(load * cap));
    const queue = Math.max(0, Math.round((load - 1) * cap * 2));
    return { id, x: s.x, y: s.y, busy, capacity: s.capacity, queue, load, saturated: load > 1 };
  });

  const workers: WorkerSnapshot[] = WORKERS.map((w, i) => {
    const onShift = i !== 3 || Math.sin(t * 0.2) > -0.3;
    const period = 6 + i;
    const phase = (t / period + i * 0.37) % 1;
    const legs = w.route.length;
    const legF = phase * legs;
    const leg = Math.floor(legF);
    const f = ease(Math.min(1, (legF - leg) * 1.6));
    const a = byId[w.route[leg % legs]];
    const b = byId[w.route[(leg + 1) % legs]];
    const standOff = 0.9;
    const x = onShift ? lerp(a.x, b.x, f) : IDLE_SPOT.x + i * 0.6;
    const y = onShift ? lerp(a.y + standOff, b.y + standOff, f) : IDLE_SPOT.y + 1.2;
    return { id: w.id, name: w.name, color: w.color, x, y, station: f < 0.1 ? a.id : null, onShift, busy: f < 0.1 || f > 0.9 };
  });

  const tokens: TokenSnapshot[] = [];
  const nTokens = 120;
  for (let k = 0; k < nTokens; k++) {
    const channel: Channel = CHANNELS[k % CHANNELS.length];
    const age = ((t * 0.08 + k / nTokens) % 1) * 1.6; // 0..1.6
    const stage: TokenSnapshot["stage"] = age < 0.5 ? "queue" : age < 0.9 ? "cooking" : "ready";
    const home = stage === "ready" ? byId.pack : byId[STATIONS[k % 3]];
    const spread = stage === "ready" ? 1.2 : 0.7;
    const x = home.x + ((k * 7919) % 100) / 100 * spread - spread / 2;
    const y = home.y + ((k * 104729) % 100) / 100 * 0.5 - 0.25 + (stage === "queue" ? -0.9 : 0);
    tokens.push({ orderId: 1000 + k, itemIdx: 0, channel, warmth: stage === "ready" ? (age - 0.9) * 2.2 : 0, x, y, stage });
  }

  const dashers: DasherSnapshot[] = Array.from({ length: 5 }, (_, i) => {
    const slot = dasherSlot(i);
    const chs: Channel[] = ["doordash", "ubereats", "doordash", "ubereats", "doordash"];
    return { orderId: 2000 + i, itemIdx: 0, channel: chs[i], waitMin: Math.max(0, 1 + i * 1.3 + Math.sin(t + i) * 1.2), x: slot.x, y: slot.y };
  });

  return {
    t: 1080 + (t % 300),
    stations: stationSnaps,
    workers,
    tokens,
    dashers,
    live: {
      ordersPlaced: 120,
      ordersHanded: 80,
      inKitchen: 40,
      dashersWaiting: 5,
      avgDasherWait: 3.2,
      coldOrders: 4,
      lateOrders: 7,
      revenue: 3200,
      dollarsAtRisk: 410,
      avgTicket: 14.5,
    },
    bins: [],
  };
}

export default function Dev3DPage() {
  const [stations, setStations] = useState<Station[]>(DEFAULT_STATIONS);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [highlight, setHighlight] = useState<StationId | null>("fryer");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      if (!paused) setSnap(makeSnapshot(performance.now() - start + 4000, stations));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stations, paused]);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="h-12 flex items-center gap-3 px-4 border-b border-line bg-bg-2 text-xs">
        <span className="font-semibold text-accent">dev3d</span>
        <button className="btn" onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</button>
        <button className="btn" onClick={() => setSnap(null)}>Null snapshot</button>
        <span className="text-fg-3">highlight:</span>
        {([...STATIONS, null] as (StationId | null)[]).map((id) => (
          <button key={id ?? "none"} className={`btn ${highlight === id ? "!bg-bg-3" : "btn-ghost"}`} onClick={() => setHighlight(id)}>
            {id ?? "none"}
          </button>
        ))}
        <span className="ml-auto text-fg-3 font-mono">
          {stations.map((s) => `${s.id}@${s.x},${s.y}`).join("  ")}
        </span>
      </div>
      <div className="flex-1 min-h-0 p-3">
        <div className="panel w-full h-full overflow-hidden">
          <Kitchen3D
            snapshot={snap}
            stations={stations}
            highlightStation={highlight}
            onMoveStation={(id, x, y) => setStations((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)))}
          />
        </div>
      </div>
    </div>
  );
}
