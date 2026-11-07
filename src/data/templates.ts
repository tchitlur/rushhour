// Restaurant templates + saved restaurants (subagent A fills this in). Contract used by the app shell:
import type { Scenario } from "@/sim/types";

export interface RestaurantTemplate { id: string; name: string; cuisine: string; neighborhood: string; tagline: string; demo?: boolean; build: (size?: "small" | "medium" | "large") => Scenario }
export const TEMPLATES: RestaurantTemplate[] = [];

/** Resolve `?r=<id>`: "maria" => null (Maria's built-in defaults, numbers unchanged); a template id => its scenario; a saved id (localStorage "rr:restaurants") => the saved scenario. */
export function getRestaurantScenario(id: string | null): Scenario | null {
  if (!id || id === "maria") return null;
  const t = TEMPLATES.find(t => t.id === id);
  if (t) return t.build();
  try {
    const saved = JSON.parse(localStorage.getItem("rr:restaurants") ?? "[]") as { id: string; scenario: Scenario }[];
    return saved.find(s => s.id === id)?.scenario ?? null;
  } catch { return null; }
}
