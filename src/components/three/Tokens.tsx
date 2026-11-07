"use client";
import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Station, TokenSnapshot } from "@/sim/types";
import { CHANNEL_THREE_COLOR, PALETTE, STATION_STYLE, hash01, toWorldX, toWorldZ } from "./util";

export const MAX_TOKENS = 400;
const MAX_STEAM = 24;

const _obj = new THREE.Object3D();
const _col = new THREE.Color();
const COOL = new THREE.Color(PALETTE.ice);
const TOKEN_W = 0.26;
const TOKEN_H = 0.09;

/** Height of the surface a token sits on at floor (x,y). */
function surfaceHeight(x: number, y: number, stations: Station[]): number {
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const st = STATION_STYLE[s.id];
    if (Math.abs(x - s.x) <= st.w / 2 + 0.1 && Math.abs(y - s.y) <= st.d / 2 + 0.1) return st.h + 0.05;
  }
  return 0;
}

export default function Tokens({ tokens, stations }: { tokens: TokenSnapshot[]; stations: Station[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const steam = useRef<THREE.InstancedMesh>(null);
  // Anchors for steam wisps (world coords), filled from hot ready tokens.
  const steamAnchors = useRef<Float32Array>(new Float32Array(MAX_STEAM * 3));
  const steamCount = useRef(0);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const n = Math.min(tokens.length, MAX_TOKENS);
    let sc = 0;
    const anchors = steamAnchors.current;
    for (let i = 0; i < n; i++) {
      const t = tokens[i];
      const h1 = hash01(t.orderId, 1);
      const h2 = hash01(t.orderId, 2);
      const h3 = hash01(t.orderId, 3);
      const jx = (h1 - 0.5) * 0.4;
      const jz = (h2 - 0.5) * 0.3;
      const level = Math.floor(h3 * 3);
      const base = surfaceHeight(t.x, t.y, stations);
      const wx = toWorldX(t.x) + jx;
      const wz = toWorldZ(t.y) + jz;
      const wy = base + TOKEN_H / 2 + level * (TOKEN_H + 0.004);
      _obj.position.set(wx, wy, wz);
      _obj.rotation.set(0, (h1 - 0.5) * 0.6, 0);
      // ready = packed bag (taller), cooking = tray, queue = ticket (flat)
      const sy = t.stage === "ready" ? 1.8 : t.stage === "cooking" ? 1 : 0.5;
      _obj.scale.set(1, sy, 1);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
      _col.copy(CHANNEL_THREE_COLOR[t.channel]);
      const chill = Math.max(0, Math.min(1, (t.warmth - 0.6) / 0.6));
      if (chill > 0) _col.lerp(COOL, chill * 0.85);
      mesh.setColorAt(i, _col);
      if (t.stage === "ready" && t.warmth < 0.6 && sc < MAX_STEAM) {
        anchors[sc * 3] = wx;
        anchors[sc * 3 + 1] = wy + TOKEN_H * sy;
        anchors[sc * 3 + 2] = wz;
        sc++;
      }
    }
    steamCount.current = sc;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tokens, stations]);

  useFrame((state) => {
    const m = steam.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const n = steamCount.current;
    const anchors = steamAnchors.current;
    for (let i = 0; i < n; i++) {
      const p = (t * 0.35 + i * 0.37) % 1;
      _obj.position.set(anchors[i * 3] + Math.sin(t * 1.3 + i) * 0.05, anchors[i * 3 + 1] + 0.05 + p * 0.45, anchors[i * 3 + 2]);
      _obj.rotation.set(0, 0, 0);
      const s = 0.035 + p * 0.06;
      _obj.scale.set(s, s, s);
      _obj.updateMatrix();
      m.setMatrixAt(i, _obj.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, MAX_TOKENS]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[TOKEN_W, TOKEN_H, TOKEN_W * 0.8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.8} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={steam} args={[undefined, undefined, MAX_STEAM]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
    </>
  );
}
