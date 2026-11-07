import type { Station, Channel } from "./types";

/** Floor grid in meters. Origin top-left; x to the right, y downward (toward the front door). */
export const FLOOR_W = 12;
export const FLOOR_H = 8;
/** Front door (customers/Dashers enter here) and where the Dasher queue forms. */
export const DOOR = { x: 10.5, y: 7.5 };
/** Dasher queue slots: a line along the front wall, starting at the door. */
export function dasherSlot(i: number): { x: number; y: number } {
  return { x: DOOR.x - 0.9 * i, y: DOOR.y - 0.2 };
}
/** Where a worker stands when idle (break spot). */
export const IDLE_SPOT = { x: 6, y: 4.2 };

export const DEFAULT_STATIONS: Station[] = [
  { id: "grill", name: "Grill", x: 2, y: 1.5, capacity: 6 },
  { id: "fryer", name: "Fryer", x: 6, y: 1.5, capacity: 4 },
  { id: "cold", name: "Cold", x: 10, y: 1.5, capacity: 4 },
  { id: "pack", name: "Pack / Expo", x: 6, y: 4.5, capacity: 99 },
  { id: "counter", name: "Counter", x: 3, y: 6.5, capacity: 99 },
];

export const CHANNEL_COLOR: Record<Channel, string> = {
  doordash: "#ff3008",
  ubereats: "#06c167",
  phone: "#4da3ff",
  counter: "#ffb020",
};
export const CHANNEL_LABEL: Record<Channel, string> = {
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  phone: "Phone",
  counter: "Counter",
};
