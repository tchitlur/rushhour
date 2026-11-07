"use client";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { FLOOR_W, FLOOR_H, DOOR } from "@/sim/layout";
import { PALETTE, hash01, toWorldX, toWorldZ } from "./util";

const WALL_H = 0.9;
const WALL_T = 0.14;
const DOOR_W = 1.4;
const TILE = 1;
const GROUT = 0.03;
const N_TILES = FLOOR_W * FLOOR_H;

const _obj = new THREE.Object3D();
const _col = new THREE.Color();
const BASE = new THREE.Color(PALETTE.floor);

/** Tiled floor (instanced), two low cutaway walls on the far sides, a door frame with a Dasher pickup shelf. */
export default function Floor() {
  const tiles = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = tiles.current;
    if (!m) return;
    let i = 0;
    for (let y = 0; y < FLOOR_H; y++) {
      for (let x = 0; x < FLOOR_W; x++) {
        _obj.position.set(toWorldX(x + 0.5), 0, toWorldZ(y + 0.5));
        _obj.rotation.set(-Math.PI / 2, 0, 0);
        _obj.scale.set(TILE - GROUT, TILE - GROUT, 1);
        _obj.updateMatrix();
        m.setMatrixAt(i, _obj.matrix);
        // subtle warm/cool variation per tile
        const v = (hash01(x * 31 + y * 7, 5) - 0.5) * 0.05;
        _col.copy(BASE).offsetHSL(0, 0, v);
        m.setColorAt(i, _col);
        i++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);

  const frontZ = toWorldZ(FLOOR_H);
  const backZ = toWorldZ(0) - WALL_T / 2;
  const leftX = toWorldX(0) - WALL_T / 2;
  const doorX = toWorldX(DOOR.x);

  return (
    <group>
      {/* grout slab */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.004} receiveShadow>
        <planeGeometry args={[FLOOR_W + 0.3, FLOOR_H + 0.3]} />
        <meshStandardMaterial color={PALETTE.grout} roughness={0.95} />
      </mesh>
      {/* tiles */}
      <instancedMesh ref={tiles} args={[undefined, undefined, N_TILES]} receiveShadow>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} metalness={0.02} />
      </instancedMesh>
      {/* plinth under the diorama */}
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[FLOOR_W + 0.3, 0.3, FLOOR_H + 0.3]} />
        <meshStandardMaterial color={PALETTE.wallTop} roughness={0.9} />
      </mesh>
      {/* back wall (far side) */}
      <mesh position={[-WALL_T / 2 - 0.0, WALL_H / 2, backZ]} castShadow receiveShadow>
        <boxGeometry args={[FLOOR_W + WALL_T, WALL_H, WALL_T]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
      </mesh>
      {/* left wall (far side) */}
      <mesh position={[leftX, WALL_H / 2, -WALL_T / 2]} castShadow receiveShadow>
        <boxGeometry args={[WALL_T, WALL_H, FLOOR_H + WALL_T]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
      </mesh>
      {/* wall caps for a crisp model-like edge */}
      <mesh position={[-WALL_T / 2, WALL_H + 0.02, backZ]}>
        <boxGeometry args={[FLOOR_W + WALL_T + 0.04, 0.04, WALL_T + 0.04]} />
        <meshStandardMaterial color={PALETTE.wallTop} roughness={0.9} />
      </mesh>
      <mesh position={[leftX, WALL_H + 0.02, -WALL_T / 2]}>
        <boxGeometry args={[WALL_T + 0.04, 0.04, FLOOR_H + WALL_T + 0.04]} />
        <meshStandardMaterial color={PALETTE.wallTop} roughness={0.9} />
      </mesh>
      {/* front edge curb */}
      <mesh position={[0, 0.06, frontZ + 0.04]} receiveShadow>
        <boxGeometry args={[FLOOR_W, 0.12, 0.08]} />
        <meshStandardMaterial color={PALETTE.wallTop} roughness={0.9} />
      </mesh>
      {/* door frame: two posts + lintel */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[doorX + (s * DOOR_W) / 2, 1.1, frontZ]} castShadow>
          <boxGeometry args={[0.12, 2.2, 0.14]} />
          <meshStandardMaterial color={PALETTE.ink} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[doorX, 2.22, frontZ]} castShadow>
        <boxGeometry args={[DOOR_W + 0.12, 0.12, 0.14]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.7} />
      </mesh>
      {/* door mat */}
      <mesh rotation-x={-Math.PI / 2} position={[doorX, 0.004, frontZ - 0.45]} receiveShadow>
        <planeGeometry args={[DOOR_W - 0.2, 0.7]} />
        <meshStandardMaterial color="#C9C2B6" roughness={1} />
      </mesh>
      {/* Dasher pickup shelf beside the door */}
      <group position={[doorX + DOOR_W / 2 + 0.5, 0, frontZ - 0.25]}>
        <mesh position-y={0.45} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.9, 0.35]} />
          <meshStandardMaterial color={PALETTE.wood} roughness={0.8} />
        </mesh>
        <mesh position-y={0.93} castShadow>
          <boxGeometry args={[0.9, 0.06, 0.42]} />
          <meshStandardMaterial color="#D9C2A0" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}
