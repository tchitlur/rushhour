"use client";
import { Billboard, Text } from "@react-three/drei";
import { PALETTE } from "./util";

interface LabelProps {
  children: string;
  position: [number, number, number];
  size?: number;
  color?: string;
  outline?: string;
  weight?: "normal" | "bold";
}

/** Camera-facing SDF text label with a dark outline for legibility. */
export default function Label({ children, position, size = 0.28, color = PALETTE.fg, outline = "#0b0d12" }: LabelProps) {
  return (
    <Billboard position={position} follow>
      <Text
        fontSize={size}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={size * 0.12}
        outlineColor={outline}
        outlineOpacity={0.9}
        letterSpacing={0.02}
      >
        {children}
      </Text>
    </Billboard>
  );
}
