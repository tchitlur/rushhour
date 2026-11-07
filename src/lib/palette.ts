// Shared design tokens (light theme, "real operations software"). Both the UI and the 3D/2D renderers use these.
export const PALETTE = {
  canvas: "#F3F4F6",
  panel: "#FFFFFF",
  border: "#DADDE2",
  ink: "#16191D",
  text2: "#5A6370",
  muted: "#8A93A0",
  bad: "#C2410C",
  warn: "#B7791F",
  good: "#2F855A",
  plan: "#1D5FA8",
} as const;

export const CHANNEL_COLORS = {
  doordash: "#B83227",
  ubereats: "#1E7A4C",
  phone: "#2F6DB5",
  counter: "#9A6B12",
} as const;

/** Worker accent colors (aprons, 2D markers): distinct, desaturated, readable on light and on the 3D floor. */
export const WORKER_COLORS: Record<string, string> = {
  maria: "#C2410C",
  jake: "#2F6DB5",
  ana: "#7A4FA3",
  sam: "#2F855A",
};

/** 3D material palette */
export const KITCHEN_3D = {
  floorTile: "#D9DCE1",
  floorGrout: "#C3C7CE",
  wall: "#E6E8EC",
  steel: "#B8BDC4",
  steelDark: "#8E949C",
  grillGrate: "#3A3D42",
  fridge: "#CFD9E3",
  wood: "#B88A5A",
  passShelf: "#D6CFC2",
  heatLamp: "#E0A040",
  loadNeutral: "#A9B0BA",
  loadWarn: "#B7791F",
  loadBad: "#C2410C",
  label: "#16191D",
  labelMuted: "#5A6370",
} as const;
