"use client";
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import type { WorkerSnapshot } from "@/sim/types";
import Label from "./Label";
import { PALETTE, damp, toWorldX, toWorldZ } from "./util";

const SKIN = "#E8C9A8";
const SHIRT = "#F4F1EA";
const MIN_SEP = 0.5;

interface Anim {
  x: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
}

function WorkerFigure({ w, anim, index, all }: { w: WorkerSnapshot; anim: Map<string, Anim>; index: number; all: WorkerSnapshot[] }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const tx = toWorldX(w.x);
    const tz = toWorldZ(w.y);
    let a = anim.get(w.id);
    if (!a) {
      a = { x: tx, z: tz, heading: 0, speed: 0, phase: 0 };
      anim.set(w.id, a);
    }
    const px = a.x;
    const pz = a.z;
    a.x = damp(a.x, tx, 9, dt);
    a.z = damp(a.z, tz, 9, dt);
    // Visual separation: push away from earlier-indexed workers that are too close.
    for (let i = 0; i < index; i++) {
      const o = anim.get(all[i].id);
      if (!o) continue;
      const dx = a.x - o.x;
      const dz = a.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < MIN_SEP) {
        const push = (MIN_SEP - d) * 0.5;
        if (d > 1e-4) {
          a.x += (dx / d) * push;
          a.z += (dz / d) * push;
        } else {
          a.x += push;
        }
      }
    }
    const vx = a.x - px;
    const vz = a.z - pz;
    const spd = dt > 0 ? Math.hypot(vx, vz) / dt : 0;
    a.speed = damp(a.speed, spd, 8, dt);
    if (spd > 0.15) {
      const h = Math.atan2(vx, vz);
      let diff = h - a.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      a.heading += diff * Math.min(1, dt * 10);
    }
    a.phase += dt * Math.min(a.speed, 2.5) * 6;
    g.position.set(a.x, 0, a.z);
    g.rotation.y = a.heading;
    const b = body.current;
    if (b) {
      const walk = Math.min(1, a.speed / 1.2);
      b.position.y = Math.abs(Math.sin(a.phase)) * 0.04 * walk;
      b.rotation.z = Math.sin(a.phase) * 0.05 * walk;
    }
  });

  return (
    <group ref={group}>
      <group ref={body}>
        {/* legs */}
        <mesh position-y={0.22} castShadow>
          <boxGeometry args={[0.3, 0.44, 0.22]} />
          <meshStandardMaterial color="#2B2F36" roughness={0.85} />
        </mesh>
        {/* torso */}
        <mesh position-y={0.68} castShadow>
          <capsuleGeometry args={[0.2, 0.42, 4, 10]} />
          <meshStandardMaterial color={SHIRT} roughness={0.85} />
        </mesh>
        {/* apron in the worker colour */}
        <mesh position={[0, 0.58, 0.14]} castShadow>
          <boxGeometry args={[0.3, 0.52, 0.1]} />
          <meshStandardMaterial color={w.color} roughness={0.8} />
        </mesh>
        {/* head */}
        <mesh position-y={1.17} castShadow>
          <sphereGeometry args={[0.16, 14, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} />
        </mesh>
        {/* cap */}
        <mesh position-y={1.28} castShadow>
          <cylinderGeometry args={[0.14, 0.17, 0.1, 14]} />
          <meshStandardMaterial color={w.color} roughness={0.85} />
        </mesh>
      </group>
      <Label position={[0, 1.6, 0]} size={0.2} color={PALETTE.fg2}>
        {w.name}
      </Label>
      {w.extra && (
        <>
          {/* "+" badge: extra what-if staff */}
          <Billboard position={[0, 1.9, 0]} follow>
            <mesh>
              <circleGeometry args={[0.15, 24]} />
              <meshBasicMaterial color={PALETTE.accent} />
            </mesh>
          </Billboard>
          <Label position={[0, 1.9, 0.01]} size={0.24} color="#FFFFFF" outline={PALETTE.accent}>
            +
          </Label>
        </>
      )}
    </group>
  );
}

export default function Workers({ workers }: { workers: WorkerSnapshot[] }) {
  const [anim] = useState(() => new Map<string, Anim>());
  const onShift = workers.filter((w) => w.onShift);
  return (
    <group>
      {onShift.map((w, i) => (
        <WorkerFigure key={w.id} w={w} anim={anim} index={i} all={onShift} />
      ))}
    </group>
  );
}
