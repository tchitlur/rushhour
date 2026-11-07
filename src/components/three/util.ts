import * as THREE from "three";
import { FLOOR_W, FLOOR_H, CHANNEL_COLOR } from "@/sim/layout";
import type { Channel, StationId } from "@/sim/types";
import { PALETTE as UI, KITCHEN_3D } from "@/lib/palette";

/** Floor meters (x right, y toward the front wall) -> world (x, z). */
export function toWorldX(x: number): number {
  return x - FLOOR_W / 2;
}
export function toWorldZ(y: number): number {
  return y - FLOOR_H / 2;
}

/** Light, warm-neutral scene palette (derived from the shared tokens). */
export const PALETTE = {
  floor: KITCHEN_3D.floorTile,
  grout: KITCHEN_3D.floorGrout,
  wall: KITCHEN_3D.wall,
  wallTop: "#D5D8DD",
  accent: UI.plan,
  ok: UI.good,
  warn: UI.warn,
  bad: UI.bad,
  ink: UI.ink,
  fg: UI.ink,
  fg2: UI.text2,
  fg3: UI.muted,
  ice: "#AEB8C6",
  outline: "#FFFFFF",
  steel: KITCHEN_3D.steel,
  steelDark: KITCHEN_3D.steelDark,
  grate: KITCHEN_3D.grillGrate,
  fridge: KITCHEN_3D.fridge,
  wood: KITCHEN_3D.wood,
  passShelf: KITCHEN_3D.passShelf,
  heatLamp: KITCHEN_3D.heatLamp,
  loadNeutral: KITCHEN_3D.loadNeutral,
  loadWarn: KITCHEN_3D.loadWarn,
  loadBad: KITCHEN_3D.loadBad,
};

export interface StationStyle {
  color: string;
  top: string;
  w: number; // meters along x
  d: number; // meters along z (floor y)
  h: number;
}

export const STATION_STYLE: Record<StationId, StationStyle> = {
  grill: { color: KITCHEN_3D.steel, top: KITCHEN_3D.grillGrate, w: 2.2, d: 1.0, h: 0.9 },
  fryer: { color: KITCHEN_3D.steel, top: KITCHEN_3D.steelDark, w: 1.6, d: 1.0, h: 0.9 },
  cold: { color: KITCHEN_3D.fridge, top: "#E4EAF0", w: 2.0, d: 1.0, h: 0.8 },
  pack: { color: KITCHEN_3D.steel, top: KITCHEN_3D.passShelf, w: 3.0, d: 1.2, h: 0.9 },
  counter: { color: "#E9E4DB", top: KITCHEN_3D.wood, w: 3.2, d: 0.8, h: 1.0 },
};

/** True when two station footprints (centers in floor meters) overlap. */
export function footprintsOverlap(a: StationId, ax: number, ay: number, b: StationId, bx: number, by: number): boolean {
  const sa = STATION_STYLE[a];
  const sb = STATION_STYLE[b];
  return Math.abs(ax - bx) < (sa.w + sb.w) / 2 - 0.01 && Math.abs(ay - by) < (sa.d + sb.d) / 2 - 0.01;
}

export const CHANNEL_THREE_COLOR: Record<Channel, THREE.Color> = {
  doordash: new THREE.Color(CHANNEL_COLOR.doordash),
  ubereats: new THREE.Color(CHANNEL_COLOR.ubereats),
  phone: new THREE.Color(CHANNEL_COLOR.phone),
  counter: new THREE.Color(CHANNEL_COLOR.counter),
};

const NEUTRAL = new THREE.Color(PALETTE.loadNeutral);
const WARN = new THREE.Color(PALETTE.loadWarn);
const BAD = new THREE.Color(PALETTE.loadBad);

/** Neutral below 0.7, amber to 1.0, bad above. Writes into `out`. */
export function loadColor(load: number, out: THREE.Color): THREE.Color {
  if (load >= 1.0) return out.copy(BAD);
  if (load >= 0.7) return out.copy(WARN);
  return out.copy(NEUTRAL);
}

/** Small deterministic hash -> [0,1). */
export function hash01(n: number, salt = 0): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Frame-rate independent exponential approach. */
export function damp(cur: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(cur, target, lambda, dt);
}
