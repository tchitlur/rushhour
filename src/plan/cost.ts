// Modeled dollar cost of an intervention.
import type { MonteCarloSummary, Scenario } from "@/sim/types";
import type { Intervention } from "./types";

export const AVG_ORDER = 22;
export const MARGIN = 0.65;
export const DELIVERY_SHARE = 0.55;
/** lost delivery conversion per extra quoted minute */
export const CONVERSION_LOSS_PER_MIN = 0.006;

function quotedAt(sc: Scenario, t: number): number {
  for (const q of sc.quotedPrep) if (t >= q.start && t < q.end) return q.minutes;
  return 15;
}

export function interventionCost(iv: Intervention, sc: Scenario, before: MonteCarloSummary, after: MonteCarloSummary): number {
  switch (iv.type) {
    case "add_shift": {
      const w = sc.workers.find(w => w.id === iv.worker);
      const wage = w?.wage ?? 18;
      return Math.max(0, wage * (iv.end - iv.start) / 60);
    }
    case "prep_batch": {
      const waste = after.mean.laborCost - before.mean.laborCost; // engine folds unsold prepped units into laborCost
      if (waste > 0) return waste;
      const foodCost = sc.menu.find(m => m.id === iv.item || m.name.toLowerCase() === iv.item.toLowerCase())?.foodCost ?? 3;
      return iv.qty * foodCost * 0.25;
    }
    case "quote_prep_time": {
      const extra = iv.minutes - quotedAt(sc, iv.start);
      if (extra <= 0) return 0;
      const ordersInWindow = before.mean.bins.filter(b => b.start >= iv.start && b.start < iv.end).reduce((a, b) => a + b.orders, 0);
      const deliveryOrders = ordersInWindow * DELIVERY_SHARE;
      return CONVERSION_LOSS_PER_MIN * extra * deliveryOrders * AVG_ORDER * MARGIN;
    }
    case "throttle_channel": {
      return Math.max(0, (before.mean.orders - after.mean.orders) * AVG_ORDER * MARGIN);
    }
    case "reassign_worker":
    case "move_station":
      return 0;
  }
}

export function costLabel(iv: Intervention, cost: number): string {
  const d = Math.round(cost);
  if (d <= 0) return "free";
  switch (iv.type) {
    case "add_shift": return `$${d} labor`;
    case "prep_batch": return `$${d} waste`;
    case "quote_prep_time":
    case "throttle_channel": return `$${d} lost orders`;
    default: return `$${d}`;
  }
}
