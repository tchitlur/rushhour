"use client";
import { Billboard, Text } from "@react-three/drei";
import { PALETTE } from "./util";

export const LABEL_FONT = "/fonts/IBMPlexSans-Medium.ttf";

interface LabelProps {
  children: string;
  position: [number, number, number];
  size?: number;
  color?: string;
  outline?: string;
}

/** Camera-facing SDF text label (bundled IBM Plex Sans) with a thin white outline for legibility. */
export default function Label({ children, position, size = 0.28, color = PALETTE.ink, outline = PALETTE.outline }: LabelProps) {
  return (
    <Billboard position={position} follow>
      <Text
        font={LABEL_FONT}
        fontSize={size}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={size * 0.1}
        outlineColor={outline}
        outlineOpacity={0.95}
        letterSpacing={0.01}
        renderOrder={10}
      >
        {children}
      </Text>
    </Billboard>
  );
}
