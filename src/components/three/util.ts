import * as THREE from "three";
import { FLOOR_W, FLOOR_H, CHANNEL_COLOR } from "@/sim/layout";
import type { Channel, StationId } from "@/sim/types";

/** Floor meters (x right, y toward the front wall) -> world (x, z). */
export function toWorldX(x: number): number {
  return x - FLOOR_W / 2;
}
export function toWorldZ(y: number): number {
  return y - FLOOR_H / 2;
}

export const PALETTE = {
  floor: "#141821",
  grid: "#2b3246",
  wall: "#252b3b",
  wallTop: "#2f3648",
  accent: "#ff7a1a",
  accent2: "#ffb86b",
  ok: "#3ddc84",
  warn: "#ffc84a",
  bad: "#ff4d5e",
  fg: "#eef0f5",
  fg2: "#a9b0c2",
  fg3: "#6b7388",
  ice: "#d6ecff",
};

export interface StationStyle {
  color: string;
  top: string;
  w: number; // meters along x
  d: number; // meters along z (floor y)
  h: number;
}

export const STATION_STYLE: Record<StationId, StationStyle> = {
  grill: { color: "#4a1f22", top: "#2b2b2f", w: 2.2, d: 1.0, h: 0.9 },
  fryer: { color: "#8a5a1e", top: "#c99a4a", w: 1.6, d: 1.0, h: 0.9 },
  cold: { color: "#2d4a66", top: "#6f93b3", w: 2.0, d: 1.0, h: 0.9 },
  pack: { color: "#3a3f4d", top: "#9aa3b5", w: 3.0, d: 1.2, h: 0.9 },
  counter: { color: "#6b4a2b", top: "#a9794a", w: 3.2, d: 0.8, h: 1.0 },
};

export const CHANNEL_THREE_COLOR: Record<Channel, THREE.Color> = {
  doordash: new THREE.Color(CHANNEL_COLOR.doordash),
  ubereats: new THREE.Color(CHANNEL_COLOR.ubereats),
  phone: new THREE.Color(CHANNEL_COLOR.phone),
  counter: new THREE.Color(CHANNEL_COLOR.counter),
};

const OK = new THREE.Color(PALETTE.ok);
const WARN = new THREE.Color(PALETTE.warn);
const BAD = new THREE.Color(PALETTE.bad);

/** Green -> amber -> red as load goes 0 -> 0.6 -> 1. Writes into `out`. */
export function loadColor(load: number, out: THREE.Color): THREE.Color {
  const l = Math.max(0, Math.min(1.2, load));
  if (l < 0.6) return out.copy(OK).lerp(WARN, l / 0.6);
  return out.copy(WARN).lerp(BAD, Math.min(1, (l - 0.6) / 0.4));
}

/** Small deterministic hash -> [0,1). */
export function hash01(n: number, salt = 0): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
