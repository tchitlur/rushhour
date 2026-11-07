"use client";
import type { DasherSnapshot } from "@/sim/types";
import { CHANNEL_COLOR } from "@/sim/layout";
import Label from "./Label";
import { PALETTE, toWorldX, toWorldZ } from "./util";

function DasherFigure({ d }: { d: DasherSnapshot }) {
  const x = toWorldX(d.x);
  const z = toWorldZ(d.y);
  const late = d.waitMin > 3;
  const ch = CHANNEL_COLOR[d.channel];
  return (
    <group position={[x, 0, z]}>
      {/* channel disc at feet */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color={ch} transparent opacity={0.85} />
      </mesh>
      {/* body */}
      <mesh position-y={0.5} castShadow>
        <capsuleGeometry args={[0.17, 0.42, 5, 10]} />
        <meshStandardMaterial color="#39404f" roughness={0.7} />
      </mesh>
      {/* helmet / head in channel colour */}
      <mesh position-y={0.98} castShadow>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial color={ch} roughness={0.5} />
      </mesh>
      {/* bag */}
      <mesh position={[0, 0.55, -0.22]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.16]} />
        <meshStandardMaterial color={ch} roughness={0.6} />
      </mesh>
      <Label position={[0, 1.4, 0]} size={0.22} color={late ? PALETTE.bad : PALETTE.fg2}>
        {`${Math.round(d.waitMin)}m`}
      </Label>
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
