"use client";
import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { Station, StationId, StationSnapshot } from "@/sim/types";
import Label from "./Label";
import { PALETTE, STATION_STYLE, damp, loadColor, toWorldX, toWorldZ } from "./util";

const _c = new THREE.Color();
const WHITE = new THREE.Color("#ffffff");
const ACCENT = new THREE.Color(PALETTE.accent);
const BAD = new THREE.Color(PALETTE.bad);

interface StationProps {
  station: Station;
  snap: StationSnapshot | undefined;
  highlighted: boolean;
  dragging: boolean;
  /** While dragging: the snapped target cell and whether it is a valid drop. */
  dragTarget?: { x: number; y: number; valid: boolean } | null;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, id: StationId) => void;
}

/** Slim horizontal load bar floating above the station. */
function LoadBar({ load, w, y }: { load: number; w: number; y: number }) {
  const fill = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const width = Math.min(w, 1.8);
  const target = Math.max(0.02, Math.min(1, load));
  useFrame((_, dt) => {
    const f = fill.current;
    const m = mat.current;
    if (!f || !m) return;
    const next = damp(f.scale.x, target, 10, dt);
    f.scale.x = next;
    f.position.x = (-width / 2) * (1 - next);
    loadColor(load, _c);
    m.color.copy(_c);
    m.emissive.copy(_c);
    m.emissiveIntensity = load >= 1 ? 0.45 : 0;
  });
  return (
    <group position-y={y}>
      <mesh>
        <boxGeometry args={[width, 0.07, 0.12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </mesh>
      <mesh ref={fill} scale={[0.02, 1, 1]} position-x={-width / 2}>
        <boxGeometry args={[width, 0.08, 0.14]} />
        <meshStandardMaterial ref={mat} color={PALETTE.loadNeutral} roughness={0.7} />
      </mesh>
    </group>
  );
}

function FryerBaskets({ busy, h }: { busy: number; h: number }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const l = left.current;
    const r = right.current;
    if (!l || !r) return;
    l.position.y = damp(l.position.y, busy >= 1 ? h - 0.08 : h + 0.22, 6, dt);
    r.position.y = damp(r.position.y, busy >= 2 ? h - 0.08 : h + 0.22, 6, dt);
  });
  const basket = (
    <>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.18, 0.6]} />
        <meshStandardMaterial color={PALETTE.steelDark} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* handle */}
      <mesh position={[0, 0.06, 0.45]} rotation-x={0.3}>
        <boxGeometry args={[0.08, 0.04, 0.4]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.8} />
      </mesh>
    </>
  );
  return (
    <>
      {/* oil vats */}
      <mesh position={[-0.37, h + 0.01, 0]}>
        <boxGeometry args={[0.62, 0.04, 0.72]} />
        <meshStandardMaterial color="#C9A24A" roughness={0.25} metalness={0.3} />
      </mesh>
      <mesh position={[0.37, h + 0.01, 0]}>
        <boxGeometry args={[0.62, 0.04, 0.72]} />
        <meshStandardMaterial color="#C9A24A" roughness={0.25} metalness={0.3} />
      </mesh>
      <group ref={left} position={[-0.37, h + 0.22, 0]}>{basket}</group>
      <group ref={right} position={[0.37, h + 0.22, 0]}>{basket}</group>
    </>
  );
}

function GrillGrate({ w, d, h }: { w: number; d: number; h: number }) {
  const bars = Math.floor((w - 0.5) / 0.12);
  return (
    <group position-y={h + 0.04}>
      <mesh>
        <boxGeometry args={[w - 0.4, 0.06, d - 0.3]} />
        <meshStandardMaterial color="#5A5E64" roughness={0.6} metalness={0.3} />
      </mesh>
      {Array.from({ length: bars }, (_, i) => (
        <mesh key={i} position={[-(w - 0.5) / 2 + 0.06 + i * 0.12, 0.045, 0]}>
          <boxGeometry args={[0.035, 0.03, d - 0.4]} />
          <meshStandardMaterial color={PALETTE.grate} roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function PassShelf({ w, h }: { w: number; h: number }) {
  return (
    <group>
      {/* uprights */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (w - 0.3)) / 2, h + 0.45, -0.35]} castShadow>
          <boxGeometry args={[0.06, 0.9, 0.06]} />
          <meshStandardMaterial color={PALETTE.steelDark} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* upper shelf */}
      <mesh position={[0, h + 0.5, -0.35]} castShadow>
        <boxGeometry args={[w - 0.2, 0.04, 0.4]} />
        <meshStandardMaterial color={PALETTE.steel} roughness={0.35} metalness={0.6} />
      </mesh>
      {/* heat lamp bar */}
      <mesh position={[0, h + 0.85, -0.3]} castShadow>
        <boxGeometry args={[w - 0.4, 0.08, 0.14]} />
        <meshStandardMaterial color={PALETTE.steelDark} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, h + 0.8, -0.3]}>
        <boxGeometry args={[w - 0.5, 0.02, 0.1]} />
        <meshStandardMaterial color={PALETTE.heatLamp} emissive={PALETTE.heatLamp} emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

export function StationBox({ station, snap, highlighted, dragging, dragTarget, onPointerDown }: StationProps) {
  const st = STATION_STYLE[station.id];
  const load = snap?.load ?? 0;
  const queue = snap?.queue ?? 0;
  const busy = snap?.busy ?? 0;
  const [hover, setHover] = useState(false);

  const group = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const initialised = useRef(false);

  // Target world position: follows the drag, then settles on drop.
  const tx = toWorldX(station.x);
  const tz = toWorldZ(station.y);
  const ty = dragging ? 0.18 : 0;

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (!initialised.current) {
      g.position.set(tx, ty, tz);
      initialised.current = true;
    } else {
      g.position.x = damp(g.position.x, tx, dragging ? 30 : 12, dt);
      g.position.z = damp(g.position.z, tz, dragging ? 30 : 12, dt);
      g.position.y = damp(g.position.y, ty, 12, dt);
    }
    const m = bodyMat.current;
    if (!m) return;
    const invalid = dragging && dragTarget && !dragTarget.valid;
    const tint = invalid ? BAD : highlighted || dragging || hover ? ACCENT : WHITE;
    const amount = invalid ? 0.7 : highlighted || dragging ? 0.25 : hover ? 0.12 : 0;
    _c.copy(WHITE).lerp(tint, amount);
    m.emissive.copy(tint);
    m.emissiveIntensity = damp(m.emissiveIntensity, amount, 14, dt);
  });

  const showDetail = hover || highlighted || queue > 0 || busy > 0;
  const detail =
    snap && showDetail
      ? station.capacity >= 99
        ? `${busy} in hand${queue ? ` · ${queue} waiting` : ""}`
        : `${busy}/${station.capacity} busy${queue ? ` · ${queue} waiting` : ""}`
      : "";

  return (
    <>
      {dragging && dragTarget && (
        <group position={[toWorldX(dragTarget.x), 0.012, toWorldZ(dragTarget.y)]}>
          {/* ghost footprint on the target cell */}
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[st.w, st.d]} />
            <meshBasicMaterial color={dragTarget.valid ? PALETTE.accent : PALETTE.bad} transparent opacity={0.22} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.002}>
            <ringGeometry args={[Math.min(st.w, st.d) / 2 - 0.06, Math.min(st.w, st.d) / 2, 4]} />
            <meshBasicMaterial color={dragTarget.valid ? PALETTE.accent : PALETTE.bad} transparent opacity={0.5} />
          </mesh>
        </group>
      )}
      <group ref={group}>
        {highlighted && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
            <ringGeometry args={[Math.max(st.w, st.d) / 2 + 0.18, Math.max(st.w, st.d) / 2 + 0.26, 48]} />
            <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
        )}
        {/* body */}
        <RoundedBox
          args={[st.w, st.h, st.d]}
          radius={0.04}
          smoothness={3}
          position-y={st.h / 2}
          castShadow
          receiveShadow
          onPointerDown={onPointerDown ? (e) => onPointerDown(e, station.id) : undefined}
          onPointerOver={
            onPointerDown
              ? (e) => {
                  e.stopPropagation();
                  setHover(true);
                  document.body.style.cursor = "grab";
                }
              : () => setHover(true)
          }
          onPointerOut={
            onPointerDown
              ? () => {
                  setHover(false);
                  if (!dragging) document.body.style.cursor = "auto";
                }
              : () => setHover(false)
          }
        >
          <meshStandardMaterial
            ref={bodyMat}
            color={st.color}
            roughness={station.id === "cold" || station.id === "counter" ? 0.75 : 0.35}
            metalness={station.id === "cold" || station.id === "counter" ? 0.05 : 0.6}
          />
        </RoundedBox>
        {/* top slab */}
        <mesh position-y={st.h + 0.02} castShadow receiveShadow>
          <boxGeometry args={[st.w + 0.06, 0.05, st.d + 0.06]} />
          <meshStandardMaterial
            color={st.top}
            roughness={station.id === "counter" ? 0.7 : 0.35}
            metalness={station.id === "counter" || station.id === "cold" ? 0.05 : 0.55}
          />
        </mesh>
        {/* kick plate */}
        <mesh position-y={0.06}>
          <boxGeometry args={[st.w - 0.1, 0.12, st.d - 0.1]} />
          <meshStandardMaterial color={PALETTE.ink} roughness={0.9} />
        </mesh>
        {station.id === "grill" && <GrillGrate w={st.w} d={st.d} h={st.h} />}
        {station.id === "fryer" && <FryerBaskets busy={busy} h={st.h} />}
        {station.id === "cold" && (
          <>
            {/* fridge doors */}
            {[-0.5, 0.5].map((dx) => (
              <mesh key={dx} position={[dx, st.h * 0.45, st.d / 2 + 0.005]}>
                <boxGeometry args={[0.86, st.h * 0.7, 0.02]} />
                <meshStandardMaterial color="#DEE6EE" roughness={0.5} metalness={0.2} />
              </mesh>
            ))}
            {[-0.5, 0.5].map((dx) => (
              <mesh key={`h${dx}`} position={[dx, st.h * 0.6, st.d / 2 + 0.03]}>
                <boxGeometry args={[0.5, 0.04, 0.04]} />
                <meshStandardMaterial color={PALETTE.steelDark} roughness={0.4} metalness={0.6} />
              </mesh>
            ))}
          </>
        )}
        {station.id === "pack" && <PassShelf w={st.w} h={st.h} />}
        <LoadBar load={load} w={st.w} y={st.h + (station.id === "pack" ? 1.2 : 0.75)} />
        <Label position={[0, st.h + (station.id === "pack" ? 1.55 : 1.1), 0]} size={0.4}>
          {station.name}
        </Label>
        {detail && (
          <Label position={[0, st.h + (station.id === "pack" ? 2.0 : 1.55), 0]} size={0.26} color={PALETTE.fg2}>
            {detail}
          </Label>
        )}
      </group>
    </>
  );
}
