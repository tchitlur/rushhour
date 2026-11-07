"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Snapshot, Station, StationId } from "@/sim/types";
import { FLOOR_W, FLOOR_H } from "@/sim/layout";
import Floor from "./three/Floor";
import { StationBox } from "./three/Stations";
import Workers from "./three/Workers";
import Tokens from "./three/Tokens";
import Dashers from "./three/Dashers";
import { STATION_STYLE } from "./three/util";

export interface Kitchen3DProps {
  /** Already interpolated by the caller; just display it. Positions in meters. */
  snapshot: Snapshot | null;
  /** Current layout (positions in meters). */
  stations: Station[];
  /** Pulse/outline this station (used by the "Why" panel). */
  highlightStation?: StationId | null;
  /** Optional drag-and-drop: called on pointer up with the snapped, clamped floor position (meters). */
  onMoveStation?: (id: StationId, x: number, y: number) => void;
  className?: string;
}

export function Kitchen3DFallback({ className }: { className?: string }) {
  return (
    <div className={`w-full h-full flex items-center justify-center text-fg-3 text-sm ${className ?? ""}`}>
      3D unavailable
    </div>
  );
}

// Camera orbit: slightly from the front-right, looking down at ~55 degrees.
const CAM_DIST = 40;
const CAM_AZIMUTH = 0.34;
const CAM_POLAR = 0.92;
const CAM_POS: [number, number, number] = [
  CAM_DIST * Math.sin(CAM_POLAR) * Math.sin(CAM_AZIMUTH),
  CAM_DIST * Math.cos(CAM_POLAR),
  CAM_DIST * Math.sin(CAM_POLAR) * Math.cos(CAM_AZIMUTH),
];

/** Fits the orthographic zoom so the whole floor fits the viewport; re-fits on resize. */
function CameraRig({ dragging }: { dragging: boolean }) {
  const size = useThree((s) => s.size);
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const fitZoom = useMemo(() => Math.max(20, Math.min(size.width / 14.2, size.height / 9.6)), [size.width, size.height]);

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    cam.zoom = fitZoom;
    cam.updateProjectionMatrix();
  }, [fitZoom]);

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault position={CAM_POS} near={-50} far={200} zoom={fitZoom} />
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!dragging}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        minPolarAngle={0.6}
        maxPolarAngle={1.2}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
        minZoom={fitZoom * 0.7}
        maxZoom={fitZoom * 3}
        target={[0, 0.4, -0.5]}
        zoomSpeed={0.6}
        rotateSpeed={0.6}
      />
    </>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#7d8fc4", "#3a2816", 1.1]} />
      <ambientLight intensity={0.35} color="#b9c4ff" />
      {/* warm key light with shadows */}
      <directionalLight
        position={[5, 11, 6]}
        intensity={3.2}
        color="#ffcf9e"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      {/* cool fill */}
      <directionalLight position={[-8, 6, -5]} intensity={0.9} color="#6f8cff" />
      {/* door spill */}
      <pointLight position={[4.5, 1.6, 3.4]} intensity={10} distance={7} decay={2} color="#ff9a3a" />
    </>
  );
}

interface SceneProps extends Kitchen3DProps {
  dragging: StationId | null;
  setDragging: (id: StationId | null) => void;
}

function Scene({ snapshot, stations, highlightStation, onMoveStation, dragging, setDragging }: SceneProps) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: StationId; x: number; y: number; ox: number; oy: number } | null>(null);

  const snapById = useMemo(() => {
    const m = new Map<StationId, Snapshot["stations"][number]>();
    snapshot?.stations.forEach((s) => m.set(s.id, s));
    return m;
  }, [snapshot]);

  // Stations rendered with the drag position substituted while dragging.
  const displayStations = useMemo(() => {
    if (!dragging || !dragPos) return stations;
    return stations.map((s) => (s.id === dragging ? { ...s, x: dragPos.x, y: dragPos.y } : s));
  }, [stations, dragging, dragPos]);

  const snapToFloor = useCallback((id: StationId, px: number, pz: number) => {
    const st = STATION_STYLE[id];
    let x = Math.round((px + FLOOR_W / 2) * 2) / 2;
    let y = Math.round((pz + FLOOR_H / 2) * 2) / 2;
    x = Math.max(st.w / 2, Math.min(FLOOR_W - st.w / 2, x));
    y = Math.max(st.d / 2, Math.min(FLOOR_H - st.d / 2 - 0.3, y));
    return { x, y };
  }, []);

  const onStationDown = useCallback(
    (e: ThreeEvent<PointerEvent>, id: StationId) => {
      if (!onMoveStation) return;
      e.stopPropagation();
      const s = stations.find((st) => st.id === id);
      if (!s) return;
      // Keep the grab offset so the station doesn't jump under the pointer.
      dragRef.current = { id, x: s.x, y: s.y, ox: s.x - (e.point.x + FLOOR_W / 2), oy: s.y - (e.point.z + FLOOR_H / 2) };
      setDragging(id);
      setDragPos({ x: s.x, y: s.y });
      document.body.style.cursor = "grabbing";
    },
    [onMoveStation, stations, setDragging],
  );

  const onPlaneMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const d = dragRef.current;
      if (!d) return;
      const p = snapToFloor(d.id, e.point.x + d.ox, e.point.z + d.oy);
      if (p.x !== d.x || p.y !== d.y) {
        d.x = p.x;
        d.y = p.y;
        setDragPos(p);
      }
    },
    [snapToFloor],
  );

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    onMoveStation?.(d.id, d.x, d.y);
    setDragging(null);
    setDragPos(null);
    document.body.style.cursor = "auto";
  }, [onMoveStation, setDragging]);

  // End the drag even if the pointer is released outside the canvas.
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointerup", endDrag);
    return () => window.removeEventListener("pointerup", endDrag);
  }, [dragging, endDrag]);

  return (
    <>
      <color attach="background" args={["#0b0d12"]} />
      <Lights />
      <Floor />
      {/* invisible drag plane */}
      {onMoveStation && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.001} onPointerMove={onPlaneMove} onPointerUp={endDrag} visible={false}>
          <planeGeometry args={[60, 60]} />
          <meshBasicMaterial />
        </mesh>
      )}
      {displayStations.map((s) => (
        <StationBox
          key={s.id}
          station={s}
          snap={snapById.get(s.id)}
          highlighted={highlightStation === s.id}
          dragging={dragging === s.id}
          onPointerDown={onMoveStation ? onStationDown : undefined}
        />
      ))}
      {snapshot && (
        <>
          <Tokens tokens={snapshot.tokens} stations={displayStations} />
          <Workers workers={snapshot.workers} />
          <Dashers dashers={snapshot.dashers} />
        </>
      )}
    </>
  );
}

export default function Kitchen3D(props: Kitchen3DProps) {
  const [dragging, setDragging] = useState<StationId | null>(null);
  return (
    <div className={`relative w-full h-full ${props.className ?? ""}`} style={{ touchAction: "none" }}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ background: "#0b0d12" }}
      >
        <Suspense fallback={null}>
          <CameraRig dragging={dragging !== null} />
          <Scene {...props} dragging={dragging} setDragging={setDragging} />
        </Suspense>
      </Canvas>
    </div>
  );
}
