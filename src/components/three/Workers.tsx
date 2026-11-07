"use client";
import type { WorkerSnapshot } from "@/sim/types";
import Label from "./Label";
import { PALETTE, toWorldX, toWorldZ } from "./util";

function WorkerFigure({ w }: { w: WorkerSnapshot }) {
  const x = toWorldX(w.x);
  const z = toWorldZ(w.y);
  const opacity = w.onShift ? 1 : 0.22;
  return (
    <group position={[x, 0, z]}>
      {/* body capsule */}
      <mesh position-y={0.62} castShadow={w.onShift}>
        <capsuleGeometry args={[0.24, 0.55, 6, 12]} />
        <meshStandardMaterial color={w.color} roughness={0.6} transparent={!w.onShift} opacity={opacity} />
      </mesh>
      {/* head */}
      <mesh position-y={1.2} castShadow={w.onShift}>
        <sphereGeometry args={[0.17, 14, 12]} />
        <meshStandardMaterial color="#f1d3b3" roughness={0.8} transparent={!w.onShift} opacity={opacity} />
      </mesh>
      {/* busy indicator: small ring at feet */}
      {w.onShift && w.busy && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
          <ringGeometry args={[0.3, 0.36, 24]} />
          <meshBasicMaterial color={w.color} transparent opacity={0.6} />
        </mesh>
      )}
      <Label position={[0, 1.55, 0]} size={0.23} color={w.onShift ? PALETTE.fg : PALETTE.fg3}>
        {w.onShift ? w.name : `${w.name} (off)`}
      </Label>
    </group>
  );
}

export default function Workers({ workers }: { workers: WorkerSnapshot[] }) {
  return (
    <group>
      {workers.filter(w => w.onShift).map((w) => (
        <WorkerFigure key={w.id} w={w} />
      ))}
    </group>
  );
}
