import type { Snapshot, TokenSnapshot, DasherSnapshot } from "./types";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolate between two consecutive snapshots for smooth playback. */
export function lerpSnapshot(a: Snapshot, b: Snapshot | undefined, alpha: number): Snapshot {
  if (!b || alpha <= 0) return a;
  if (alpha >= 1) return b;
  const bTok = new Map<number, TokenSnapshot[]>();
  for (const tk of b.tokens) { const arr = bTok.get(tk.orderId) ?? []; arr.push(tk); bTok.set(tk.orderId, arr); }
  const used = new Map<number, number>();
  const tokens: TokenSnapshot[] = a.tokens.map(tk => {
    const arr = bTok.get(tk.orderId);
    const idx = used.get(tk.orderId) ?? 0;
    const target = arr?.[idx];
    if (!target) return tk;
    used.set(tk.orderId, idx + 1);
    return { ...tk, x: lerp(tk.x, target.x, alpha), y: lerp(tk.y, target.y, alpha), warmth: lerp(tk.warmth, target.warmth, alpha), stage: alpha > 0.5 ? target.stage : tk.stage };
  });
  const bD = new Map(b.dashers.map(d => [d.orderId, d]));
  const dashers: DasherSnapshot[] = a.dashers.map(d => {
    const tgt = bD.get(d.orderId);
    return tgt ? { ...d, x: lerp(d.x, tgt.x, alpha), y: lerp(d.y, tgt.y, alpha), waitMin: lerp(d.waitMin, tgt.waitMin, alpha) } : d;
  });
  // dashers that appear in b but not a: fade in at their position after half-way
  if (alpha > 0.5) for (const d of b.dashers) if (!a.dashers.some(x => x.orderId === d.orderId)) dashers.push(d);
  const workers = a.workers.map((w, i) => {
    const t = b.workers[i];
    if (!t || !w.onShift || !t.onShift) return alpha > 0.5 ? (t ?? w) : w;
    return { ...w, x: lerp(w.x, t.x, alpha), y: lerp(w.y, t.y, alpha), station: alpha > 0.5 ? t.station : w.station, busy: alpha > 0.5 ? t.busy : w.busy };
  });
  const stations = a.stations.map((s, i) => {
    const t = b.stations[i];
    return t ? { ...s, load: lerp(s.load, t.load, alpha), busy: alpha > 0.5 ? t.busy : s.busy, queue: alpha > 0.5 ? t.queue : s.queue, saturated: alpha > 0.5 ? t.saturated : s.saturated } : s;
  });
  const live = { ...a.live };
  for (const k of Object.keys(live) as (keyof typeof live)[]) live[k] = lerp(a.live[k], b.live[k], alpha);
  return { t: lerp(a.t, b.t, alpha), stations, workers, tokens, dashers, live, bins: alpha > 0.5 ? b.bins : a.bins };
}
