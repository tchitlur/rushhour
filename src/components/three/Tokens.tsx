"use client";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { Station, TokenSnapshot } from "@/sim/types";
import { CHANNEL_THREE_COLOR, PALETTE, STATION_STYLE, hash01, toWorldX, toWorldZ } from "./util";

export const MAX_TOKENS = 400;

const _obj = new THREE.Object3D();
const _col = new THREE.Color();
const ICE = new THREE.Color(PALETTE.ice);
const TOKEN_W = 0.28;
const TOKEN_H = 0.08;

/** Height of the surface a token sits on at floor (x,y). */
function surfaceHeight(x: number, y: number, stations: Station[]): number {
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const st = STATION_STYLE[s.id];
    if (Math.abs(x - s.x) <= st.w / 2 + 0.1 && Math.abs(y - s.y) <= st.d / 2 + 0.1) return st.h + 0.06;
  }
  return 0;
}

export default function Tokens({ tokens, stations }: { tokens: TokenSnapshot[]; stations: Station[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const n = Math.min(tokens.length, MAX_TOKENS);
    for (let i = 0; i < n; i++) {
      const t = tokens[i];
      // Deterministic jitter per order so piles look like piles and don't shimmer.
      const h1 = hash01(t.orderId, 1);
      const h2 = hash01(t.orderId, 2);
      const h3 = hash01(t.orderId, 3);
      const jx = (h1 - 0.5) * 0.5;
      const jz = (h2 - 0.5) * 0.4;
      const level = Math.floor(h3 * 4); // 0..3 stack height
      const base = surfaceHeight(t.x, t.y, stations);
      _obj.position.set(toWorldX(t.x) + jx, base + TOKEN_H / 2 + level * (TOKEN_H + 0.005), toWorldZ(t.y) + jz);
      _obj.rotation.set(0, (h1 - 0.5) * 0.8, 0);
      const s = t.stage === "cooking" ? 1.1 : 1;
      _obj.scale.set(s, 1, s);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
      // Channel colour, chilled toward icy white as warmth passes the hold limit.
      _col.copy(CHANNEL_THREE_COLOR[t.channel]);
      const chill = Math.max(0, Math.min(1, (t.warmth - 0.35) / 0.9));
      if (chill > 0) _col.lerp(ICE, chill);
      mesh.setColorAt(i, _col);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tokens, stations]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_TOKENS]} castShadow receiveShadow frustumCulled={false}>
      <boxGeometry args={[TOKEN_W, TOKEN_H, TOKEN_W * 0.8]} />
      <meshStandardMaterial color="#ffffff" roughness={0.55} metalness={0.05} />
    </instancedMesh>
  );
}
