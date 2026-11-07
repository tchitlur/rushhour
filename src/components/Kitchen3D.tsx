"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Snapshot, Station, StationId } from "@/sim/types";
import { FLOOR_W, FLOOR_H } from "@/sim/layout";
import { PALETTE as UI } from "@/lib/palette";
import Floor from "./three/Floor";
import { StationBox } from "./three/Stations";
import Workers from "./three/Workers";
import Tokens from "./three/Tokens";
import Dashers from "./three/Dashers";
import { STATION_STYLE, footprintsOverlap, toWorldX, toWorldZ } from "./three/util";

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

// Isometric-ish orbit: from the front-right, looking down at ~50 degrees.
const CAM_DIST = 40;
const CAM_AZIMUTH = 0.62;
const CAM_POLAR = 0.88;
const CAM_POS = new THREE.Vector3(
  CAM_DIST * Math.sin(CAM_POLAR) * Math.sin(CAM_AZIMUTH),
  CAM_DIST * Math.cos(CAM_POLAR),
  CAM_DIST * Math.sin(CAM_POLAR) * Math.cos(CAM_AZIMUTH),
);
const HOME_TARGET = new THREE.Vector3(0.2, 0.3, 0.6);
const _target = new THREE.Vector3();
const _delta = new THREE.Vector3();

interface RigProps {
  dragging: boolean;
  focus: { x: number; z: number } | null;
  resetKey: number;
}

/** Fits the orthographic zoom so the whole floor fits the viewport; re-fits on resize; eases the target. */
function CameraRig({ dragging, focus, resetKey }: RigProps) {
  const size = useThree((s) => s.size);
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  // Diagonal footprint of a 12x8 floor seen from the corner plus label headroom.
  const fitZoom = useMemo(() => Math.max(16, Math.min(size.width / 14.5, size.height / 10)), [size.width, size.height]);

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    cam.zoom = fitZoom;
    cam.updateProjectionMatrix();
  }, [fitZoom]);

  useEffect(() => {
    const cam = camRef.current;
    const c = controls.current;
    if (!cam || !c) return;
    cam.position.copy(CAM_POS);
    cam.zoom = fitZoom;
    cam.updateProjectionMatrix();
    c.target.copy(HOME_TARGET);
    c.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (focus) _target.set(HOME_TARGET.x + (focus.x - HOME_TARGET.x) * 0.45, 0.4, HOME_TARGET.z + (focus.z - HOME_TARGET.z) * 0.45);
    else _target.copy(HOME_TARGET);
    _delta.subVectors(_target, c.target);
    if (_delta.lengthSq() > 1e-6) {
      const k = 1 - Math.exp(-dt * 4);
      // Move camera and target together so the view pans instead of re-orbiting.
      _delta.multiplyScalar(k);
      c.target.add(_delta);
      c.object.position.add(_delta);
    }
    c.update();
  });

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault position={CAM_POS} near={-60} far={200} zoom={fitZoom} />
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!dragging}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        minPolarAngle={0.7}
        maxPolarAngle={1.15}
        minAzimuthAngle={-0.3}
        maxAzimuthAngle={1.3}
        minZoom={fitZoom * 0.75}
        maxZoom={fitZoom * 3}
        target={HOME_TARGET}
        zoomSpeed={0.6}
        rotateSpeed={0.5}
      />
    </>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#F2F4F8", "#B8B2A8", 0.9]} />
      <directionalLight
        position={[6, 12, 7]}
        intensity={2.2}
        color="#FFF6EA"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={2}
        shadow-camera-far={34}
        shadow-bias={-0.00015}
        shadow-normalBias={0.03}
        shadow-radius={3}
      />
      {/* soft cool fill from the open side, no shadows */}
      <directionalLight position={[-6, 5, -3]} intensity={0.35} color="#DDE6F5" />
    </>
  );
}

interface SceneProps extends Kitchen3DProps {
  dragging: StationId | null;
  setDragging: (id: StationId | null) => void;
}

interface DragState {
  id: StationId;
  x: number;
  y: number;
  valid: boolean;
  ox: number;
  oy: number;
  origX: number;
  origY: number;
}

function Scene({ snapshot, stations, highlightStation, onMoveStation, dragging, setDragging }: SceneProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const snapById = useMemo(() => {
    const m = new Map<StationId, Snapshot["stations"][number]>();
    snapshot?.stations.forEach((s) => m.set(s.id, s));
    return m;
  }, [snapshot]);

  // While dragging, the station follows the target cell (it snaps back if the drop is invalid).
  const displayStations = useMemo(() => {
    if (!dragging || !drag) return stations;
    return stations.map((s) => (s.id === dragging ? { ...s, x: drag.x, y: drag.y } : s));
  }, [stations, dragging, drag]);

  const snapToFloor = useCallback((id: StationId, px: number, pz: number) => {
    const st = STATION_STYLE[id];
    let x = Math.round((px + FLOOR_W / 2) * 2) / 2;
    let y = Math.round((pz + FLOOR_H / 2) * 2) / 2;
    x = Math.max(st.w / 2, Math.min(FLOOR_W - st.w / 2, x));
    y = Math.max(st.d / 2, Math.min(FLOOR_H - st.d / 2 - 0.3, y));
    return { x, y };
  }, []);

  const isValid = useCallback(
    (id: StationId, x: number, y: number) => !stations.some((o) => o.id !== id && footprintsOverlap(id, x, y, o.id, o.x, o.y)),
    [stations],
  );

  const onStationDown = useCallback(
    (e: ThreeEvent<PointerEvent>, id: StationId) => {
      if (!onMoveStation) return;
      e.stopPropagation();
      const s = stations.find((st) => st.id === id);
      if (!s) return;
      // Keep the grab offset so the station doesn't jump under the pointer.
      const d: DragState = {
        id,
        x: s.x,
        y: s.y,
        valid: true,
        ox: s.x - (e.point.x + FLOOR_W / 2),
        oy: s.y - (e.point.z + FLOOR_H / 2),
        origX: s.x,
        origY: s.y,
      };
      dragRef.current = d;
      setDragging(id);
      setDrag(d);
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
        const next = { ...d, x: p.x, y: p.y, valid: isValid(d.id, p.x, p.y) };
        dragRef.current = next;
        setDrag(next);
      }
    },
    [snapToFloor, isValid],
  );

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    const moved = d.x !== d.origX || d.y !== d.origY;
    if (d.valid && moved) onMoveStation?.(d.id, d.x, d.y);
    setDragging(null);
    setDrag(null);
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
      <Lights />
      <Floor />
      {/* invisible drag plane */}
      {onMoveStation && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.001} onPointerMove={onPlaneMove} onPointerUp={endDrag} visible={false}>
          <planeGeometry args={[80, 80]} />
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
          dragTarget={dragging === s.id ? drag : null}
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
  const [resetKey, setResetKey] = useState(0);
  const focus = useMemo(() => {
    if (!props.highlightStation) return null;
    const s = props.stations.find((st) => st.id === props.highlightStation);
    return s ? { x: toWorldX(s.x), z: toWorldZ(s.y) } : null;
  }, [props.highlightStation, props.stations]);

  return (
    <div className={`relative w-full h-full ${props.className ?? ""}`} style={{ touchAction: "none", background: UI.panel }}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        style={{ background: UI.panel }}
      >
        <Suspense fallback={null}>
          <CameraRig dragging={dragging !== null} focus={focus} resetKey={resetKey} />
          <Scene {...props} dragging={dragging} setDragging={setDragging} />
        </Suspense>
      </Canvas>
      <button
        type="button"
        onClick={() => setResetKey((k) => k + 1)}
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          background: UI.panel,
          border: `1px solid ${UI.border}`,
          borderRadius: 4,
          fontSize: 12,
          lineHeight: "16px",
          padding: "4px 8px",
          color: UI.ink,
          cursor: "pointer",
        }}
      >
        Reset view
      </button>
    </div>
  );
}
