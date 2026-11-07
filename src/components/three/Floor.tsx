"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { FLOOR_W, FLOOR_H, DOOR } from "@/sim/layout";
import { PALETTE, toWorldX, toWorldZ } from "./util";

const WALL_H = 1.1;
const WALL_T = 0.16;
const DOOR_W = 1.4;

/** Floor slab, 1 m grid, back/front walls, door opening + marker. */
export default function Floor() {
  const grid = useMemo(() => {
    const pts: number[] = [];
    for (let x = 0; x <= FLOOR_W; x++) {
      pts.push(toWorldX(x), 0.005, toWorldZ(0), toWorldX(x), 0.005, toWorldZ(FLOOR_H));
    }
    for (let y = 0; y <= FLOOR_H; y++) {
      pts.push(toWorldX(0), 0.005, toWorldZ(y), toWorldX(FLOOR_W), 0.005, toWorldZ(y));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  const frontZ = toWorldZ(FLOOR_H) - WALL_T / 2;
  const backZ = toWorldZ(0) + WALL_T / 2;
  const doorX = toWorldX(DOOR.x);
  // Front wall is split around the door.
  const leftLen = DOOR.x - DOOR_W / 2;
  const rightLen = FLOOR_W - (DOOR.x + DOOR_W / 2);

  return (
    <group>
      {/* floor slab */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position-y={0}>
        <planeGeometry args={[FLOOR_W, FLOOR_H]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.95} metalness={0.05} />
      </mesh>
      {/* 1 m grid */}
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={PALETTE.grid} transparent opacity={0.9} />
      </lineSegments>
      {/* back wall */}
      <mesh position={[0, 1.0, backZ]} castShadow receiveShadow>
        <boxGeometry args={[FLOOR_W, 2.0, WALL_T]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
      </mesh>
      {/* front wall: left of door */}
      <mesh position={[toWorldX(leftLen / 2), WALL_H / 2, frontZ]} castShadow receiveShadow>
        <boxGeometry args={[leftLen, WALL_H, WALL_T]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
      </mesh>
      {/* front wall: right of door */}
      <mesh position={[toWorldX(FLOOR_W - rightLen / 2), WALL_H / 2, frontZ]} castShadow receiveShadow>
        <boxGeometry args={[rightLen, WALL_H, WALL_T]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
      </mesh>
      {/* door lintel */}
      <mesh position={[doorX, WALL_H + 0.08, frontZ]} castShadow>
        <boxGeometry args={[DOOR_W + 0.2, 0.16, WALL_T]} />
        <meshStandardMaterial color={PALETTE.accent} emissive={PALETTE.accent} emissiveIntensity={0.35} />
      </mesh>
      {/* door threshold glow on the floor */}
      <mesh rotation-x={-Math.PI / 2} position={[doorX, 0.012, frontZ - 0.35]}>
        <planeGeometry args={[DOOR_W, 0.6]} />
        <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.22} />
      </mesh>
      {/* side curbs for depth */}
      <mesh position={[toWorldX(0) + 0.05, 0.12, 0]} receiveShadow>
        <boxGeometry args={[0.1, 0.24, FLOOR_H]} />
        <meshStandardMaterial color={PALETTE.wallTop} roughness={0.9} />
      </mesh>
      <mesh position={[toWorldX(FLOOR_W) - 0.05, 0.12, 0]} receiveShadow>
        <boxGeometry args={[0.1, 0.24, FLOOR_H]} />
        <meshStandardMaterial color={PALETTE.wallTop} roughness={0.9} />
      </mesh>
    </group>
  );
}
