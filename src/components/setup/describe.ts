// Client-side keyword fallback for "Fill from description" (used when /api/describe returns { fields: null }).
import { NEIGHBORHOODS } from "@/data/templates";

export interface SetupFields {
  name?: string | null;
  cuisine?: string | null;
  neighborhood?: string | null;
  size?: "small" | "medium" | "large" | null;
  deliveryPct?: number | null;
  staffCount?: number | null;
  aov?: number | null;
  hoursOpen?: string | null;  // "HH:MM"
  hoursClose?: string | null;
}

const CUISINE_WORDS: [string, RegExp][] = [
  ["pizza", /pizza|pizzeria|slice|calzone/],
  ["noodles", /noodle|ramen|pho|wok|lo mein|pad thai|udon/],
  ["tacos", /taco|taqueria|burrito|mexican|tex-?mex/],
  ["cafe", /caf[eé]|coffee|bakery|espresso|pastry|bagel|donut|doughnut/],
  ["sushi", /sushi|poke|japanese|izakaya|sashimi/],
  ["indian", /indian|curry|tandoor|biryani|naan|desi/],
  ["bowls", /bowl|salad|grain|healthy|vegan|smoothie/],
  ["burgers", /burger|wing|fries|american|smash|chicken sandwich|diner/],
];

function toClock(h: number, ampm?: string): string {
  let hh = h;
  if (ampm?.startsWith("p") && hh < 12) hh += 12;
  if (ampm?.startsWith("a") && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:00`;
}

export function keywordFields(text: string): SetupFields {
  const t = text.toLowerCase();
  const out: SetupFields = {};
  for (const [id, re] of CUISINE_WORDS) { if (re.test(t)) { out.cuisine = id; break; } }
  for (const n of NEIGHBORHOODS) { if (t.includes(n.name.toLowerCase())) { out.neighborhood = n.name; break; } }
  const staff = /(\d+)\s*(?:people|staff|cooks|employees|workers|on the line|person crew)/.exec(t) ?? /(?:crew|team|staff) of (\d+)/.exec(t);
  if (staff) out.staffCount = Math.max(1, Math.min(12, parseInt(staff[1], 10)));
  const pct = /(\d{1,3})\s*%\s*(?:delivery|doordash|uber)/.exec(t);
  if (pct) out.deliveryPct = Math.min(100, parseInt(pct[1], 10));
  else if (/mostly delivery|delivery[- ]heavy|ghost kitchen|delivery only/.test(t)) out.deliveryPct = 70;
  else if (/mostly (?:dine|walk|counter|sit)|no delivery|dine-in only/.test(t)) out.deliveryPct = 15;
  else if (/half delivery|50\/50/.test(t)) out.deliveryPct = 50;
  const aov = /\$\s?(\d{1,3})(?:\s*(?:average|avg|per order|a ticket|tickets|checks?))/.exec(t) ?? /(?:average|avg)\s*(?:order|ticket|check)\D{0,12}\$?\s?(\d{1,3})/.exec(t);
  if (aov) out.aov = parseInt(aov[1], 10);
  if (/\b(tiny|small|little|hole[- ]in[- ]the[- ]wall|food truck|counter[- ]service)\b/.test(t)) out.size = "small";
  else if (/\b(big|large|huge|busy|two floors|100 seats|150 seats)\b/.test(t)) out.size = "large";
  const hours = /(\d{1,2})\s*(am|pm)?\s*(?:-|to|–|until)\s*(\d{1,2})\s*(am|pm)?/.exec(t);
  if (hours) {
    const o = parseInt(hours[1], 10), c = parseInt(hours[3], 10);
    out.hoursOpen = toClock(o, hours[2] ?? (o >= 6 && o <= 11 ? "am" : "pm"));
    out.hoursClose = toClock(c, hours[4] ?? (c <= 11 ? "pm" : "pm"));
  }
  const name = /(?:called|named)\s+["“']?([A-Za-z0-9'&. -]{3,40}?)["”']?(?:[,.]| in | on | that | and |$)/.exec(text);
  if (name) out.name = name[1].trim();
  return out;
}
