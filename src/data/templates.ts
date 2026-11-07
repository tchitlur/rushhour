// Restaurant templates, preset restaurants and saved (localStorage) restaurants.
// Contract used by the app shell: `TEMPLATES: RestaurantTemplate[]` and `getRestaurantScenario(id)`.
//
// ENGINE CONSTRAINT: the simulator has exactly 5 station slots ("grill" | "fryer" | "cold" | "pack" | "counter").
// Templates REUSE these slots with a different display name / kind (e.g. pizza: grill -> "Pizza oven").
// Menu routing, worker skills and bottleneck logic all key on the slot ids, never on the display names.
import type { Channel, MenuItem, Scenario, Station, StationId, StationKind, Worker } from "@/sim/types";
import { SERVICE_START, SERVICE_END, STATIONS } from "@/sim/types";
import { DEFAULT_STATIONS } from "@/sim/layout";
import { baseScenario, flatDemand, MENU, WORKERS, BASELINE_OPH, CHANNEL_MIX } from "@/sim/scenario";

export type Size = "small" | "medium" | "large";
export const SIZE_FACTOR: Record<Size, number> = { small: 0.7, medium: 1, large: 1.5 };

export interface RestaurantTemplate { id: string; name: string; cuisine: string; neighborhood: string; tagline: string; demo?: boolean; build: (size?: Size) => Scenario }

export interface Neighborhood { id: string; name: string; lat: number; lon: number }
export const NEIGHBORHOODS: Neighborhood[] = [
  { id: "oakland", name: "Oakland", lat: 40.442, lon: -79.953 },
  { id: "lawrenceville", name: "Lawrenceville", lat: 40.465, lon: -79.96 },
  { id: "strip", name: "Strip District", lat: 40.451, lon: -79.976 },
  { id: "northshore", name: "North Shore", lat: 40.4468, lon: -80.01 },
  { id: "squirrelhill", name: "Squirrel Hill", lat: 40.438, lon: -79.922 },
  { id: "shadyside", name: "Shadyside", lat: 40.452, lon: -79.934 },
  { id: "downtown", name: "Downtown", lat: 40.4406, lon: -79.9959 },
  { id: "southside", name: "South Side", lat: 40.429, lon: -79.975 },
];
export function findNeighborhood(q: string | undefined | null): Neighborhood {
  const s = (q ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return NEIGHBORHOODS.find(n => n.id === s || n.name.toLowerCase().replace(/[^a-z]/g, "") === s) ?? NEIGHBORHOODS[3];
}

type Slot = { name: string; kind: StationKind; capacity: number };
interface StaffSeed { name: string; wage: number; skills: Partial<Record<StationId, number>>; shift: [number, number] | null }

export interface CuisineTemplate {
  id: string;
  name: string;         // cuisine label ("Pizza")
  tagline: string;
  stations: Record<StationId, Slot>;
  menu: MenuItem[];
  staff: StaffSeed[];
  channelMix: Record<Channel, number>;
  /** orders per hour, 24 entries (4:00pm..9:45pm bins) */
  demand: number[];
  quotedPrepMin: number;
  /** default opening hours, minutes since midnight (identity only; engine window is fixed 4-10 PM) */
  hours: { open: number; close: number };
}

const H = (h: number, m = 0) => h * 60 + m;
const COLORS = ["#C2410C", "#2F6DB5", "#2A7F8F", "#2F855A", "#9A6B12", "#7C3AED", "#B83227", "#1D5FA8"];

/** Bell-ish evening curve: peak at `peakBin` (0..23), base->peak orders/hour. */
function curve(base: number, peak: number, peakBin: number, width = 6): number[] {
  return Array.from({ length: 24 }, (_, i) => Math.round(base + (peak - base) * Math.exp(-((i - peakBin) ** 2) / (2 * width * width))));
}
/** Early-high curve (bakery/café: busiest at the start of the window and tails off). */
function falling(start: number, end: number): number[] {
  return Array.from({ length: 24 }, (_, i) => Math.round(start + (end - start) * (i / 23)));
}

const PACK: Slot = { name: "Pack / Expo", kind: "pack", capacity: 99 };
const COUNTER: Slot = { name: "Counter", kind: "counter", capacity: 99 };

export const CUISINES: CuisineTemplate[] = [
  {
    id: "burgers", name: "Burgers & wings", tagline: "Grill + fryer line; delivery-heavy on game nights.",
    stations: { grill: { name: "Grill", kind: "grill", capacity: 6 }, fryer: { name: "Fryer", kind: "fryer", capacity: 4 }, cold: { name: "Cold", kind: "cold", capacity: 4 }, pack: PACK, counter: COUNTER },
    menu: MENU.map(m => ({ ...m })),
    staff: WORKERS.map(w => ({ name: w.name, wage: w.wage, skills: { ...w.skills }, shift: w.shifts[0] ? [w.shifts[0].start, w.shifts[0].end] as [number, number] : null })),
    channelMix: { ...CHANNEL_MIX }, demand: [...BASELINE_OPH], quotedPrepMin: 15, hours: { open: H(11), close: H(22) },
  },
  {
    id: "pizza", name: "Pizza", tagline: "Deck ovens are the bottleneck; long bakes, big delivery share.",
    stations: { grill: { name: "Pizza oven", kind: "pizza_oven", capacity: 8 }, fryer: { name: "Deck oven 2", kind: "oven", capacity: 6 }, cold: { name: "Salad / prep", kind: "cold", capacity: 4 }, pack: PACK, counter: COUNTER },
    menu: [
      { id: "cheese", name: "Cheese pie 16\"", price: 16, foodCost: 4.2, stations: ["grill"], prepMin: 12, prepSd: 1.5, holdMin: 15, popularity: 30 },
      { id: "pepperoni", name: "Pepperoni pie", price: 18.5, foodCost: 5.1, stations: ["grill"], prepMin: 12.5, prepSd: 1.5, holdMin: 15, popularity: 28 },
      { id: "supreme", name: "Supreme pie", price: 22, foodCost: 6.8, stations: ["grill"], prepMin: 14, prepSd: 1.8, holdMin: 15, popularity: 12 },
      { id: "white", name: "White pie", price: 20, foodCost: 5.6, stations: ["grill"], prepMin: 13, prepSd: 1.6, holdMin: 15, popularity: 8 },
      { id: "slice", name: "Slice", price: 4, foodCost: 1, stations: ["fryer"], prepMin: 3, prepSd: 0.5, holdMin: 20, popularity: 35 },
      { id: "calzone", name: "Calzone", price: 13, foodCost: 3.6, stations: ["fryer"], prepMin: 11, prepSd: 1.4, holdMin: 14, popularity: 10 },
      { id: "garlicknots", name: "Garlic knots", price: 6.5, foodCost: 1.3, stations: ["fryer"], prepMin: 6, prepSd: 0.8, holdMin: 18, popularity: 22 },
      { id: "wingsp", name: "Oven wings (10)", price: 14, foodCost: 4.8, stations: ["fryer"], prepMin: 14, prepSd: 1.5, holdMin: 12, popularity: 12 },
      { id: "caesar", name: "Caesar salad", price: 9, foodCost: 2.4, stations: ["cold"], prepMin: 3, prepSd: 0.5, holdMin: 25, popularity: 10 },
      { id: "sodap", name: "2-liter soda", price: 3.5, foodCost: 1.1, stations: ["cold"], prepMin: 0.5, prepSd: 0.1, holdMin: 90, popularity: 30 },
    ],
    staff: [
      { name: "Tony", wage: 0, skills: { grill: 1.3, fryer: 1.1, cold: 0.9, pack: 1.0, counter: 1.0 }, shift: [H(16), H(22)] },
      { name: "Priya", wage: 18, skills: { grill: 1.0, fryer: 1.1, cold: 1.0, pack: 1.1, counter: 0.9 }, shift: [H(17), H(22)] },
      { name: "Marcus", wage: 17, skills: { grill: 0.8, fryer: 1.0, cold: 1.1, pack: 1.2, counter: 1.1 }, shift: [H(16), H(22)] },
      { name: "Lena", wage: 16, skills: { grill: 0.7, fryer: 0.8, cold: 1.0, pack: 1.1, counter: 1.2 }, shift: [H(18), H(22)] },
    ],
    channelMix: { doordash: 0.4, ubereats: 0.18, phone: 0.22, counter: 0.2 }, demand: curve(10, 28, 11), quotedPrepMin: 25, hours: { open: H(11), close: H(23) },
  },
  {
    id: "noodles", name: "Noodles & ramen", tagline: "Fast wok line, slow broth; short hold times punish waiting Dashers.",
    stations: { grill: { name: "Wok line", kind: "wok", capacity: 4 }, fryer: { name: "Noodle boil", kind: "rice", capacity: 6 }, cold: { name: "Garnish / cold", kind: "cold", capacity: 4 }, pack: PACK, counter: COUNTER },
    menu: [
      { id: "tonkotsu", name: "Tonkotsu ramen", price: 15.5, foodCost: 4.4, stations: ["fryer", "cold"], prepMin: 6, prepSd: 0.8, holdMin: 6, popularity: 30 },
      { id: "shoyu", name: "Shoyu ramen", price: 14.5, foodCost: 3.9, stations: ["fryer", "cold"], prepMin: 5.5, prepSd: 0.8, holdMin: 6, popularity: 22 },
      { id: "spicymiso", name: "Spicy miso ramen", price: 16, foodCost: 4.6, stations: ["fryer", "cold"], prepMin: 6, prepSd: 0.8, holdMin: 6, popularity: 14 },
      { id: "padthai", name: "Pad thai", price: 14, foodCost: 3.6, stations: ["grill"], prepMin: 5, prepSd: 0.7, holdMin: 12, popularity: 20 },
      { id: "lomein", name: "Beef lo mein", price: 14.5, foodCost: 4.2, stations: ["grill"], prepMin: 5.5, prepSd: 0.7, holdMin: 12, popularity: 16 },
      { id: "friedrice", name: "Fried rice", price: 12, foodCost: 2.8, stations: ["grill"], prepMin: 4.5, prepSd: 0.6, holdMin: 14, popularity: 18 },
      { id: "gyoza", name: "Gyoza (6)", price: 8, foodCost: 2.1, stations: ["grill"], prepMin: 6, prepSd: 0.8, holdMin: 10, popularity: 20 },
      { id: "baobun", name: "Pork bao (2)", price: 8.5, foodCost: 2.3, stations: ["fryer"], prepMin: 4, prepSd: 0.5, holdMin: 10, popularity: 12 },
      { id: "edamame", name: "Edamame", price: 5, foodCost: 1, stations: ["cold"], prepMin: 1.5, prepSd: 0.3, holdMin: 30, popularity: 12 },
      { id: "cucumber", name: "Smashed cucumber", price: 6, foodCost: 1.3, stations: ["cold"], prepMin: 2, prepSd: 0.3, holdMin: 25, popularity: 8 },
      { id: "tea", name: "Iced tea", price: 3, foodCost: 0.4, stations: ["cold"], prepMin: 0.5, prepSd: 0.1, holdMin: 60, popularity: 24 },
    ],
    staff: [
      { name: "Kenji", wage: 0, skills: { grill: 1.3, fryer: 1.2, cold: 1.0, pack: 1.0, counter: 0.9 }, shift: [H(16), H(22)] },
      { name: "Mei", wage: 19, skills: { grill: 1.1, fryer: 1.1, cold: 1.1, pack: 1.0, counter: 1.0 }, shift: [H(17), H(22)] },
      { name: "Dev", wage: 17, skills: { grill: 0.8, fryer: 0.9, cold: 1.2, pack: 1.2, counter: 1.1 }, shift: [H(16), H(22)] },
      { name: "Rosa", wage: 16, skills: { grill: 0.6, fryer: 0.8, cold: 1.0, pack: 1.1, counter: 1.2 }, shift: [H(17, 30), H(21, 30)] },
    ],
    channelMix: { doordash: 0.35, ubereats: 0.2, phone: 0.05, counter: 0.4 }, demand: curve(9, 26, 10, 5), quotedPrepMin: 15, hours: { open: H(11, 30), close: H(22) },
  },
  {
    id: "tacos", name: "Tacos", tagline: "Plancha + fryer; lots of small walk-in tickets.",
    stations: { grill: { name: "Plancha", kind: "flattop", capacity: 8 }, fryer: { name: "Fryer", kind: "fryer", capacity: 3 }, cold: { name: "Salsa / cold", kind: "cold", capacity: 5 }, pack: PACK, counter: COUNTER },
    menu: [
      { id: "alpastor", name: "Al pastor tacos (3)", price: 11, foodCost: 3.1, stations: ["grill"], prepMin: 4, prepSd: 0.6, holdMin: 10, popularity: 30 },
      { id: "carne", name: "Carne asada tacos (3)", price: 12.5, foodCost: 3.9, stations: ["grill"], prepMin: 4.5, prepSd: 0.6, holdMin: 10, popularity: 24 },
      { id: "pollo", name: "Pollo tacos (3)", price: 10.5, foodCost: 2.8, stations: ["grill"], prepMin: 4, prepSd: 0.6, holdMin: 10, popularity: 18 },
      { id: "burrito", name: "Burrito", price: 12, foodCost: 3.3, stations: ["grill", "cold"], prepMin: 4.5, prepSd: 0.6, holdMin: 14, popularity: 22 },
      { id: "quesadilla", name: "Quesadilla", price: 10, foodCost: 2.6, stations: ["grill"], prepMin: 5, prepSd: 0.7, holdMin: 12, popularity: 14 },
      { id: "churros", name: "Churros", price: 6, foodCost: 1.1, stations: ["fryer"], prepMin: 4, prepSd: 0.5, holdMin: 15, popularity: 12, fryerBaskets: 0.5 },
      { id: "chips", name: "Chips & guac", price: 7.5, foodCost: 1.9, stations: ["fryer", "cold"], prepMin: 3, prepSd: 0.4, holdMin: 20, popularity: 24, fryerBaskets: 0.5 },
      { id: "fishtaco", name: "Baja fish tacos (2)", price: 12, foodCost: 3.8, stations: ["fryer"], prepMin: 5.5, prepSd: 0.7, holdMin: 8, popularity: 10, fryerBaskets: 1 },
      { id: "elote", name: "Elote", price: 5, foodCost: 1.1, stations: ["grill"], prepMin: 3, prepSd: 0.4, holdMin: 12, popularity: 12 },
      { id: "horchata", name: "Horchata", price: 3.5, foodCost: 0.5, stations: ["cold"], prepMin: 0.5, prepSd: 0.1, holdMin: 60, popularity: 26 },
    ],
    staff: [
      { name: "Luis", wage: 0, skills: { grill: 1.3, fryer: 1.0, cold: 1.0, pack: 1.0, counter: 1.0 }, shift: [H(16), H(22)] },
      { name: "Camila", wage: 18, skills: { grill: 1.1, fryer: 1.0, cold: 1.1, pack: 1.1, counter: 1.0 }, shift: [H(17), H(22)] },
      { name: "Javi", wage: 16, skills: { grill: 0.8, fryer: 1.1, cold: 1.0, pack: 1.2, counter: 1.2 }, shift: [H(16), H(22)] },
    ],
    channelMix: { doordash: 0.28, ubereats: 0.14, phone: 0.08, counter: 0.5 }, demand: curve(10, 24, 9, 5), quotedPrepMin: 12, hours: { open: H(11), close: H(22) },
  },
  {
    id: "cafe", name: "Café & bakery", tagline: "Espresso and ovens; the rush is early and fades through the evening.",
    stations: { grill: { name: "Ovens", kind: "oven", capacity: 10 }, fryer: { name: "Espresso", kind: "espresso", capacity: 2 }, cold: { name: "Pastry case / cold", kind: "cold", capacity: 6 }, pack: PACK, counter: COUNTER },
    menu: [
      { id: "latte", name: "Latte", price: 5.5, foodCost: 0.9, stations: ["fryer"], prepMin: 2.5, prepSd: 0.4, holdMin: 8, popularity: 40 },
      { id: "drip", name: "Drip coffee", price: 3, foodCost: 0.3, stations: ["cold"], prepMin: 0.5, prepSd: 0.1, holdMin: 20, popularity: 30 },
      { id: "cappuccino", name: "Cappuccino", price: 5, foodCost: 0.8, stations: ["fryer"], prepMin: 2.5, prepSd: 0.4, holdMin: 6, popularity: 18 },
      { id: "croissant", name: "Croissant", price: 4.5, foodCost: 1.1, stations: ["cold"], prepMin: 0.8, prepSd: 0.2, holdMin: 60, popularity: 24 },
      { id: "bfast", name: "Breakfast sandwich", price: 9.5, foodCost: 2.6, stations: ["grill"], prepMin: 6, prepSd: 0.8, holdMin: 10, popularity: 22 },
      { id: "quiche", name: "Quiche slice", price: 8, foodCost: 2.1, stations: ["grill"], prepMin: 5, prepSd: 0.6, holdMin: 20, popularity: 10 },
      { id: "avotoast", name: "Avocado toast", price: 10, foodCost: 2.8, stations: ["grill", "cold"], prepMin: 4, prepSd: 0.5, holdMin: 12, popularity: 14 },
      { id: "cookie", name: "Cookie", price: 3.5, foodCost: 0.6, stations: ["cold"], prepMin: 0.5, prepSd: 0.1, holdMin: 120, popularity: 20 },
      { id: "soup", name: "Soup & bread", price: 9, foodCost: 2.3, stations: ["grill"], prepMin: 3.5, prepSd: 0.5, holdMin: 15, popularity: 10 },
      { id: "cake", name: "Cake slice", price: 6.5, foodCost: 1.4, stations: ["cold"], prepMin: 1, prepSd: 0.2, holdMin: 60, popularity: 12 },
    ],
    staff: [
      { name: "Hannah", wage: 0, skills: { grill: 1.1, fryer: 1.3, cold: 1.1, pack: 1.0, counter: 1.1 }, shift: [H(16), H(22)] },
      { name: "Omar", wage: 17, skills: { grill: 1.0, fryer: 1.2, cold: 1.0, pack: 1.0, counter: 1.0 }, shift: [H(16), H(20)] },
      { name: "Bea", wage: 16, skills: { grill: 0.9, fryer: 0.8, cold: 1.1, pack: 1.1, counter: 1.2 }, shift: [H(16), H(22)] },
    ],
    channelMix: { doordash: 0.15, ubereats: 0.1, phone: 0.05, counter: 0.7 }, demand: falling(26, 6), quotedPrepMin: 10, hours: { open: H(6, 30), close: H(18) },
  },
  {
    id: "sushi", name: "Sushi", tagline: "Knife work on the cold line; the sushi bar is the bottleneck, not the heat.",
    stations: { grill: { name: "Hot line / tempura", kind: "fryer", capacity: 3 }, fryer: { name: "Rice & robata", kind: "rice", capacity: 4 }, cold: { name: "Sushi bar", kind: "cold", capacity: 4 }, pack: PACK, counter: COUNTER },
    menu: [
      { id: "calif", name: "California roll", price: 9, foodCost: 2.3, stations: ["cold"], prepMin: 4, prepSd: 0.6, holdMin: 25, popularity: 28 },
      { id: "spicytuna", name: "Spicy tuna roll", price: 11, foodCost: 3.4, stations: ["cold"], prepMin: 4.5, prepSd: 0.6, holdMin: 20, popularity: 24 },
      { id: "dragon", name: "Dragon roll", price: 16, foodCost: 5, stations: ["grill", "cold"], prepMin: 6.5, prepSd: 0.9, holdMin: 15, popularity: 12 },
      { id: "nigiri", name: "Nigiri set (8)", price: 22, foodCost: 7.5, stations: ["cold"], prepMin: 7, prepSd: 1, holdMin: 20, popularity: 10 },
      { id: "sashimi", name: "Sashimi platter", price: 26, foodCost: 9.5, stations: ["cold"], prepMin: 8, prepSd: 1.2, holdMin: 15, popularity: 6 },
      { id: "pokebowl", name: "Poke bowl", price: 14.5, foodCost: 4.6, stations: ["fryer", "cold"], prepMin: 4, prepSd: 0.6, holdMin: 20, popularity: 18 },
      { id: "tempura", name: "Shrimp tempura", price: 12, foodCost: 3.6, stations: ["grill"], prepMin: 6, prepSd: 0.8, holdMin: 8, popularity: 12, fryerBaskets: 1 },
      { id: "teriyaki", name: "Chicken teriyaki", price: 15, foodCost: 4.2, stations: ["fryer"], prepMin: 8, prepSd: 1, holdMin: 14, popularity: 12 },
      { id: "misosoup", name: "Miso soup", price: 3.5, foodCost: 0.5, stations: ["fryer"], prepMin: 1, prepSd: 0.2, holdMin: 20, popularity: 20 },
      { id: "edamame2", name: "Edamame", price: 5, foodCost: 1, stations: ["cold"], prepMin: 1.5, prepSd: 0.3, holdMin: 30, popularity: 16 },
    ],
    staff: [
      { name: "Hiro", wage: 0, skills: { grill: 0.9, fryer: 1.0, cold: 1.35, pack: 1.0, counter: 0.9 }, shift: [H(16), H(22)] },
      { name: "Yuki", wage: 21, skills: { grill: 0.9, fryer: 1.0, cold: 1.2, pack: 1.0, counter: 1.0 }, shift: [H(17), H(22)] },
      { name: "Nate", wage: 18, skills: { grill: 1.2, fryer: 1.2, cold: 0.7, pack: 1.0, counter: 0.9 }, shift: [H(16), H(22)] },
      { name: "Grace", wage: 16, skills: { grill: 0.6, fryer: 0.7, cold: 0.8, pack: 1.2, counter: 1.3 }, shift: [H(17), H(22)] },
    ],
    channelMix: { doordash: 0.35, ubereats: 0.2, phone: 0.1, counter: 0.35 }, demand: curve(7, 22, 11, 5), quotedPrepMin: 20, hours: { open: H(12), close: H(22) },
  },
  {
    id: "indian", name: "Indian", tagline: "Tandoor and curry line; big family orders, long holds.",
    stations: { grill: { name: "Tandoor", kind: "pizza_oven", capacity: 6 }, fryer: { name: "Curry line", kind: "wok", capacity: 8 }, cold: { name: "Rice & cold", kind: "rice", capacity: 6 }, pack: PACK, counter: COUNTER },
    menu: [
      { id: "butterchicken", name: "Butter chicken", price: 16.5, foodCost: 4.8, stations: ["fryer", "cold"], prepMin: 7, prepSd: 1, holdMin: 25, popularity: 30 },
      { id: "tikka", name: "Chicken tikka masala", price: 16, foodCost: 4.6, stations: ["grill", "fryer"], prepMin: 8, prepSd: 1.1, holdMin: 25, popularity: 24 },
      { id: "saag", name: "Saag paneer", price: 14.5, foodCost: 3.8, stations: ["fryer", "cold"], prepMin: 6, prepSd: 0.8, holdMin: 25, popularity: 14 },
      { id: "chana", name: "Chana masala", price: 13, foodCost: 2.9, stations: ["fryer", "cold"], prepMin: 5, prepSd: 0.7, holdMin: 30, popularity: 12 },
      { id: "biryani", name: "Lamb biryani", price: 18, foodCost: 5.9, stations: ["cold"], prepMin: 6, prepSd: 0.8, holdMin: 25, popularity: 14 },
      { id: "naan", name: "Garlic naan", price: 4, foodCost: 0.7, stations: ["grill"], prepMin: 3, prepSd: 0.4, holdMin: 10, popularity: 45 },
      { id: "samosa", name: "Samosas (2)", price: 6, foodCost: 1.3, stations: ["grill"], prepMin: 4, prepSd: 0.5, holdMin: 20, popularity: 20 },
      { id: "tandoorichk", name: "Tandoori chicken", price: 17, foodCost: 5.2, stations: ["grill"], prepMin: 12, prepSd: 1.5, holdMin: 20, popularity: 10 },
      { id: "raita", name: "Raita", price: 3.5, foodCost: 0.6, stations: ["cold"], prepMin: 1, prepSd: 0.2, holdMin: 40, popularity: 12 },
      { id: "lassi", name: "Mango lassi", price: 5, foodCost: 1, stations: ["cold"], prepMin: 1.5, prepSd: 0.3, holdMin: 30, popularity: 18 },
    ],
    staff: [
      { name: "Anil", wage: 0, skills: { grill: 1.3, fryer: 1.1, cold: 1.0, pack: 1.0, counter: 0.9 }, shift: [H(16), H(22)] },
      { name: "Sunita", wage: 19, skills: { grill: 0.9, fryer: 1.3, cold: 1.1, pack: 1.0, counter: 1.0 }, shift: [H(16), H(22)] },
      { name: "Raj", wage: 17, skills: { grill: 1.0, fryer: 0.9, cold: 1.1, pack: 1.2, counter: 1.1 }, shift: [H(17), H(22)] },
      { name: "Fatima", wage: 16, skills: { grill: 0.6, fryer: 0.7, cold: 1.0, pack: 1.1, counter: 1.3 }, shift: [H(17), H(22)] },
    ],
    channelMix: { doordash: 0.42, ubereats: 0.2, phone: 0.18, counter: 0.2 }, demand: curve(8, 24, 12, 5), quotedPrepMin: 25, hours: { open: H(11, 30), close: H(22) },
  },
  {
    id: "bowls", name: "Bowls & salads", tagline: "Assembly line; fast, cold-heavy, lunch-style tickets at dinner.",
    stations: { grill: { name: "Proteins grill", kind: "flattop", capacity: 8 }, fryer: { name: "Grains & roast", kind: "oven", capacity: 10 }, cold: { name: "Assembly line", kind: "cold", capacity: 6 }, pack: PACK, counter: COUNTER },
    menu: [
      { id: "chkbowl", name: "Grilled chicken bowl", price: 13.5, foodCost: 3.9, stations: ["grill", "cold"], prepMin: 3.5, prepSd: 0.5, holdMin: 20, popularity: 30 },
      { id: "steakbowl", name: "Steak bowl", price: 15.5, foodCost: 5.2, stations: ["grill", "cold"], prepMin: 4, prepSd: 0.6, holdMin: 20, popularity: 16 },
      { id: "tofubowl", name: "Tofu grain bowl", price: 12.5, foodCost: 3.1, stations: ["fryer", "cold"], prepMin: 3, prepSd: 0.4, holdMin: 25, popularity: 14 },
      { id: "salmonbowl", name: "Salmon bowl", price: 16.5, foodCost: 5.8, stations: ["grill", "cold"], prepMin: 4.5, prepSd: 0.6, holdMin: 15, popularity: 12 },
      { id: "caesar2", name: "Kale Caesar", price: 11.5, foodCost: 2.9, stations: ["cold"], prepMin: 2.5, prepSd: 0.4, holdMin: 25, popularity: 20 },
      { id: "greek", name: "Greek salad", price: 11, foodCost: 2.7, stations: ["cold"], prepMin: 2.5, prepSd: 0.4, holdMin: 30, popularity: 14 },
      { id: "falafel", name: "Falafel wrap", price: 11.5, foodCost: 2.8, stations: ["fryer", "cold"], prepMin: 4, prepSd: 0.5, holdMin: 15, popularity: 12 },
      { id: "sweetpot", name: "Roast sweet potato side", price: 5, foodCost: 1, stations: ["fryer"], prepMin: 2, prepSd: 0.3, holdMin: 30, popularity: 18 },
      { id: "smoothie", name: "Smoothie", price: 7.5, foodCost: 1.8, stations: ["cold"], prepMin: 2, prepSd: 0.3, holdMin: 15, popularity: 16 },
      { id: "kombucha", name: "Kombucha", price: 4.5, foodCost: 1.6, stations: ["cold"], prepMin: 0.3, prepSd: 0.1, holdMin: 120, popularity: 18 },
    ],
    staff: [
      { name: "Jordan", wage: 0, skills: { grill: 1.2, fryer: 1.1, cold: 1.2, pack: 1.0, counter: 1.0 }, shift: [H(16), H(22)] },
      { name: "Aisha", wage: 17, skills: { grill: 0.9, fryer: 1.0, cold: 1.3, pack: 1.1, counter: 1.0 }, shift: [H(16), H(21)] },
      { name: "Theo", wage: 16, skills: { grill: 1.0, fryer: 1.0, cold: 1.0, pack: 1.2, counter: 1.2 }, shift: [H(17), H(22)] },
    ],
    channelMix: { doordash: 0.36, ubereats: 0.24, phone: 0.05, counter: 0.35 }, demand: curve(9, 22, 9, 5), quotedPrepMin: 12, hours: { open: H(11), close: H(21) },
  },
];

export function getCuisine(id: string | undefined | null): CuisineTemplate {
  return CUISINES.find(c => c.id === id) ?? CUISINES[0];
}

export interface BuildOptions {
  size?: Size;
  name?: string;
  neighborhood?: string;
  /** 0..100: share of orders from DoorDash + Uber Eats */
  deliveryPct?: number;
  staffCount?: number;
  /** average order value in $; menu prices are scaled so the weighted average ticket matches */
  aov?: number;
  hoursOpen?: number;   // minutes since midnight
  hoursClose?: number;
}

function roundCap(c: number, f: number) { return c >= 99 ? 99 : Math.max(1, Math.round(c * f)); }

function makeWorkers(seeds: StaffSeed[], count: number): Worker[] {
  const out: Worker[] = [];
  for (let i = 0; i < count; i++) {
    const s = seeds[i % seeds.length];
    const dup = Math.floor(i / seeds.length);
    const base = s.name.toLowerCase().replace(/[^a-z]/g, "");
    out.push({
      id: dup ? `${base}${dup + 1}` : base,
      name: dup ? `${s.name} ${dup + 1}` : s.name,
      wage: s.wage === 0 && dup ? 17 : s.wage,
      skills: { ...s.skills },
      shifts: s.shift ? [{ start: s.shift[0], end: s.shift[1] }] : (dup ? [{ start: H(17), end: H(22) }] : []),
      color: COLORS[i % COLORS.length],
    });
  }
  return out;
}

/** Weighted average ticket for a menu (approx: popularity-weighted price x ~1.8 items/order). */
export function approxAov(menu: MenuItem[]): number {
  const w = menu.reduce((a, m) => a + m.popularity, 0) || 1;
  return (menu.reduce((a, m) => a + m.price * m.popularity, 0) / w) * 1.8;
}

/** Build a full Scenario from a cuisine template + size + overrides. */
export function buildScenario(cuisineId: string, opts: BuildOptions = {}): Scenario {
  const c = getCuisine(cuisineId);
  const size = opts.size ?? "medium";
  const f = SIZE_FACTOR[size];
  const nb = findNeighborhood(opts.neighborhood);
  const s = baseScenario();
  s.stations = DEFAULT_STATIONS.map((d): Station => {
    const slot = c.stations[d.id];
    return { id: d.id, name: slot.name, kind: slot.kind, x: d.x, y: d.y, capacity: roundCap(slot.capacity, f) };
  });
  s.menu = c.menu.map(m => ({ ...m, stations: [...m.stations] }));
  if (opts.aov && opts.aov > 0) {
    const k = opts.aov / approxAov(s.menu);
    for (const m of s.menu) { m.price = Math.round(m.price * k * 2) / 2; m.foodCost = Math.round(m.foodCost * k * 10) / 10; }
  }
  const staffCount = Math.max(1, Math.min(12, opts.staffCount ?? Math.round(c.staff.length * (size === "small" ? 0.75 : size === "large" ? 1.5 : 1))));
  s.workers = makeWorkers(c.staff, staffCount);
  s.baselineOrdersPerHour = c.demand.map(v => Math.max(1, Math.round(v * f)));
  const mix = { ...c.channelMix };
  if (opts.deliveryPct != null) {
    const d = Math.max(0, Math.min(100, opts.deliveryPct)) / 100;
    const dd = mix.doordash + mix.ubereats || 1;
    const ndd = mix.phone + mix.counter || 1;
    mix.doordash = d * (mix.doordash / dd); mix.ubereats = d * (mix.ubereats / dd);
    mix.phone = (1 - d) * (mix.phone / ndd); mix.counter = (1 - d) * (mix.counter / ndd);
  }
  s.channelMix = mix;
  s.demand = flatDemand();
  s.quotedPrep = [{ start: SERVICE_START, end: SERVICE_END, minutes: c.quotedPrepMin }];
  s.restaurant = { name: opts.name?.trim() || `${c.name} (${nb.name})`, cuisine: c.id, neighborhood: nb.name, lat: nb.lat, lon: nb.lon, hours: { open: opts.hoursOpen ?? c.hours.open, close: opts.hoursClose ?? c.hours.close } };
  s.label = "Normal night";
  return s;
}

/** The 8 cuisine templates, as RestaurantTemplate (id = cuisine id). */
export const TEMPLATES: RestaurantTemplate[] = CUISINES.map(c => ({
  id: c.id, name: c.name, cuisine: c.id, neighborhood: "North Shore", tagline: c.tagline,
  build: (size: Size = "medium") => buildScenario(c.id, { size }),
}));

export interface PresetDef { id: string; name: string; cuisine: string; neighborhood: string; size: Size; tagline: string; demo?: boolean }
export const PRESET_DEFS: PresetDef[] = [
  { id: "maria", name: "Maria's Burgers & Wings", cuisine: "burgers", neighborhood: "North Shore", size: "medium", tagline: "Grill + fryer, 4 staff, delivery-heavy on Steelers nights. The built-in demo.", demo: true },
  { id: "slice-theory", name: "Slice Theory Pizza", cuisine: "pizza", neighborhood: "Oakland", size: "medium", tagline: "Two deck ovens, student slices by the counter, pies by DoorDash." },
  { id: "noodle-bar", name: "Noodle Bar", cuisine: "noodles", neighborhood: "Lawrenceville", size: "small", tagline: "Ramen and wok dishes with six-minute hold limits." },
  { id: "morning-rise", name: "Morning Rise Bakery & Café", cuisine: "cafe", neighborhood: "Strip District", size: "medium", tagline: "Espresso bar and ovens; the rush is early and fades." },
];
export const PRESETS: RestaurantTemplate[] = PRESET_DEFS.map(p => ({
  id: p.id, name: p.name, cuisine: p.cuisine, neighborhood: p.neighborhood, tagline: p.tagline, demo: p.demo,
  build: (size: Size = p.size) => buildScenario(p.cuisine, { size, name: p.name, neighborhood: p.neighborhood }),
}));

// ---- saved restaurants (localStorage) ----
export const SAVED_KEY = "rr:restaurants";
export interface SavedRestaurant { id: string; name: string; scenario: Scenario; createdAt: string }

export function listSavedRestaurants(): SavedRestaurant[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(arr) ? (arr as SavedRestaurant[]).filter(r => r && r.id && r.scenario) : [];
  } catch { return []; }
}

export function saveRestaurant(name: string, scenario: Scenario): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "restaurant";
  const id = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const list = listSavedRestaurants();
  list.unshift({ id, name, scenario, createdAt: new Date().toISOString() });
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 20))); } catch { /* storage full or blocked; the id still resolves nothing */ }
  return id;
}

export function deleteSavedRestaurant(id: string) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(listSavedRestaurants().filter(r => r.id !== id))); } catch { /* ignore */ }
}

/** Human label for a `?r=` id (preset / template / saved), or null. */
export function getRestaurantName(id: string | null): string | null {
  if (!id) return null;
  const p = PRESETS.find(p => p.id === id); if (p) return p.name;
  const t = TEMPLATES.find(t => t.id === id); if (t) return t.name;
  return listSavedRestaurants().find(s => s.id === id)?.name ?? null;
}

/** Resolve `?r=<id>`: "maria" (demo) => null (Maria's built-in defaults, numbers unchanged); a preset id => its scenario;
 *  a cuisine template id => that template at medium size; a saved id (localStorage "rr:restaurants") => the saved scenario. */
export function getRestaurantScenario(id: string | null): Scenario | null {
  if (!id || id === "maria") return null;
  const p = PRESETS.find(p => p.id === id);
  if (p) return p.demo ? null : p.build();
  const t = TEMPLATES.find(t => t.id === id);
  if (t) return t.build();
  return listSavedRestaurants().find(s => s.id === id)?.scenario ?? null;
}

export const STATION_IDS: StationId[] = STATIONS;
export const STATION_KINDS: StationKind[] = ["grill", "fryer", "flattop", "pizza_oven", "oven", "wok", "rice", "espresso", "cold", "pack", "counter"];
