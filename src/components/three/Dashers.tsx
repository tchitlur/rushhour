"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DasherSnapshot } from "@/sim/types";
import { CHANNEL_COLORS } from "@/lib/palette";
import Label from "./Label";
import { PALETTE, damp, toWorldX, toWorldZ } from "./util";

function DasherFigure({ d }: { d: DasherSnapshot }) {
  const group = useRef<THREE.Group>(null);
  const init = useRef(false);
  const late = d.waitMin > 3;
  const ch = CHANNEL_COLORS[d.channel];
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const tx = toWorldX(d.x);
    const tz = toWorldZ(d.y);
    if (!init.current) {
      g.position.set(tx, 0, tz);
      init.current = true;
      return;
    }
    g.position.x = damp(g.position.x, tx, 8, dt);
    g.position.z = damp(g.position.z, tz, 8, dt);
  });
  return (
    <group ref={group} rotation-y={Math.PI}>
      {/* legs */}
      <mesh position-y={0.2} castShadow>
        <boxGeometry args={[0.26, 0.4, 0.2]} />
        <meshStandardMaterial color="#3B4048" roughness={0.85} />
      </mesh>
      {/* jacket */}
      <mesh position-y={0.62} castShadow>
        <capsuleGeometry args={[0.17, 0.38, 4, 10]} />
        <meshStandardMaterial color="#5B6470" roughness={0.8} />
      </mesh>
      {/* head + helmet */}
      <mesh position-y={1.08} castShadow>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial color="#E8C9A8" roughness={0.8} />
      </mesh>
      <mesh position-y={1.14} castShadow>
        <sphereGeometry args={[0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2B2F36" roughness={0.6} />
      </mesh>
      {/* platform-coloured delivery bag on the back */}
      <mesh position={[0, 0.66, -0.26]} castShadow>
        <boxGeometry args={[0.36, 0.42, 0.24]} />
        <meshStandardMaterial color={ch} roughness={0.75} />
      </mesh>
      {late && (
        <Label position={[0, 1.5, 0]} size={0.2} color={PALETTE.bad}>
          {`${Math.round(d.waitMin)} min`}
        </Label>
      )}
    </group>
  );
}

export default function Dashers({ dashers }: { dashers: DasherSnapshot[] }) {
  return (
    <group>
      {dashers.map((d) => (
        <DasherFigure key={d.orderId} d={d} />
      ))}
    </group>
  );
}
