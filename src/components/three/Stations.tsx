"use client";
import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Station, StationId, StationSnapshot } from "@/sim/types";
import Label from "./Label";
import { PALETTE, STATION_STYLE, loadColor, toWorldX, toWorldZ } from "./util";

const _c = new THREE.Color();
const BAR_MAX_H = 1.6;

interface StationProps {
  station: Station;
  snap: StationSnapshot | undefined;
  highlighted: boolean;
  dragging: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, id: StationId) => void;
}

function LoadBar({ load, saturated, queue, x, z }: { load: number; saturated: boolean; queue: number; x: number; z: number }) {
  const barRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const target = Math.max(0.03, Math.min(1.25, load)) * BAR_MAX_H;

  useFrame((state) => {
    const bar = barRef.current;
    const mat = matRef.current;
    if (!bar || !mat) return;
    // Smooth the bar height toward target to avoid flicker.
    const cur = bar.scale.y;
    const next = cur + (target - cur) * 0.2;
    bar.scale.y = next;
    bar.position.y = next / 2;
    loadColor(load, _c);
    mat.color.copy(_c);
    if (saturated) {
      const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 7);
      mat.emissive.copy(_c);
      mat.emissiveIntensity = 0.35 + pulse * 0.9;
    } else {
      mat.emissive.copy(_c);
      mat.emissiveIntensity = 0.18;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* track */}
      <mesh position-y={BAR_MAX_H * 1.25 / 2}>
        <boxGeometry args={[0.1, BAR_MAX_H * 1.25, 0.1]} />
        <meshStandardMaterial color="#2a3142" roughness={1} />
      </mesh>
      {/* base plate */}
      <mesh position-y={0.02}>
        <cylinderGeometry args={[0.3, 0.3, 0.04, 20]} />
        <meshStandardMaterial color="#2a3142" roughness={1} />
      </mesh>
      {/* fill: unit-height box scaled in y */}
      <mesh ref={barRef} position-y={0.02} scale={[1, 0.04, 1]} castShadow>
        <boxGeometry args={[0.22, 1, 0.22]} />
        <meshStandardMaterial ref={matRef} color={PALETTE.ok} roughness={0.5} />
      </mesh>
      {/* 100% tick */}
      <mesh position-y={BAR_MAX_H}>
        <boxGeometry args={[0.34, 0.025, 0.34]} />
        <meshBasicMaterial color={PALETTE.fg2} />
      </mesh>
      {queue > 0 && (
        <Label position={[0, BAR_MAX_H * 1.25 + 0.35, 0]} size={0.24} color={saturated ? PALETTE.bad : PALETTE.warn}>
          {`${queue} waiting`}
        </Label>
      )}
    </group>
  );
}

function HighlightRing({ w, d }: { w: number; d: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = 1 + 0.04 * Math.sin(t * 4);
    if (ref.current) ref.current.scale.set(s, s, 1);
    if (mat.current) mat.current.opacity = 0.55 + 0.35 * Math.sin(t * 4);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.02}>
      <ringGeometry args={[Math.max(w, d) / 2 + 0.25, Math.max(w, d) / 2 + 0.38, 48]} />
      <meshBasicMaterial ref={mat} color={PALETTE.accent} transparent opacity={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function StationBox({ station, snap, highlighted, dragging, onPointerDown }: StationProps) {
  const st = STATION_STYLE[station.id];
  const x = toWorldX(station.x);
  const z = toWorldZ(station.y);
  const load = snap?.load ?? 0;
  const saturated = snap?.saturated ?? false;
  const queue = snap?.queue ?? 0;
  const busy = snap?.busy ?? 0;

  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    const m = bodyMat.current;
    if (!m) return;
    if (highlighted) {
      m.emissive.set(PALETTE.accent);
      m.emissiveIntensity = 0.12 + 0.12 * Math.sin(state.clock.elapsedTime * 4);
    } else if (dragging) {
      m.emissive.set(PALETTE.accent2);
      m.emissiveIntensity = 0.2;
    } else if (m.emissiveIntensity !== 0) {
      m.emissiveIntensity = 0;
    }
  });

  const subtitle = useMemo(() => {
    if (!snap) return "";
    if (station.capacity >= 99) return busy > 0 ? `${busy} in hand` : "";
    return `${busy}/${station.capacity} busy`;
  }, [snap, busy, station.capacity]);

  return (
    <group position={[x, 0, z]}>
      {highlighted && <HighlightRing w={st.w} d={st.d} />}
      {/* body */}
      <mesh
        position-y={st.h / 2}
        castShadow
        receiveShadow
        onPointerDown={onPointerDown ? (e) => onPointerDown(e, station.id) : undefined}
        onPointerOver={onPointerDown ? () => (document.body.style.cursor = "grab") : undefined}
        onPointerOut={onPointerDown ? () => (document.body.style.cursor = "auto") : undefined}
      >
        <boxGeometry args={[st.w, st.h, st.d]} />
        <meshStandardMaterial ref={bodyMat} color={st.color} roughness={0.75} metalness={0.15} />
      </mesh>
      {/* top slab */}
      <mesh position-y={st.h + 0.03} castShadow receiveShadow>
        <boxGeometry args={[st.w + 0.08, 0.06, st.d + 0.08]} />
        <meshStandardMaterial color={st.top} roughness={0.35} metalness={0.5} />
      </mesh>
      {/* grill grate / fryer baskets flavour */}
      {station.id === "grill" && (
        <mesh position-y={st.h + 0.07}>
          <boxGeometry args={[st.w - 0.5, 0.02, st.d - 0.4]} />
          <meshStandardMaterial color="#ff5a1a" emissive="#ff3b00" emissiveIntensity={0.9} />
        </mesh>
      )}
      {station.id === "fryer" && (
        <>
          <mesh position={[-0.35, st.h + 0.1, 0]}>
            <boxGeometry args={[0.55, 0.1, 0.6]} />
            <meshStandardMaterial color="#ffc86b" emissive="#ff9a2a" emissiveIntensity={0.45} />
          </mesh>
          <mesh position={[0.35, st.h + 0.1, 0]}>
            <boxGeometry args={[0.55, 0.1, 0.6]} />
            <meshStandardMaterial color="#ffc86b" emissive="#ff9a2a" emissiveIntensity={0.45} />
          </mesh>
        </>
      )}
      {station.id === "cold" && (
        <mesh position-y={st.h + 0.07}>
          <boxGeometry args={[st.w - 0.4, 0.02, st.d - 0.4]} />
          <meshStandardMaterial color="#9fd3ff" emissive="#5ab0ff" emissiveIntensity={0.5} />
        </mesh>
      )}
      {/* label */}
      <Label position={[0, st.h + 1.25, 0]} size={0.36}>
        {station.name}
      </Label>
      {subtitle && (
        <Label position={[0, st.h + 0.92, 0]} size={0.21} color={PALETTE.fg2}>
          {subtitle}
        </Label>
      )}
      {/* load bar beside the station */}
      <LoadBar load={load} saturated={saturated} queue={queue} x={st.w / 2 + 0.45} z={0} />
    </group>
  );
}
