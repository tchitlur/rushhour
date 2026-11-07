// Deterministic, headless kitchen simulator. Emits per-tick snapshots when asked.
import type {
  Scenario, Order, OrderItemState, Snapshot, StationId, Channel, NightMetrics, NightResult,
  BinMetrics, LiveCounters, StationSnapshot, WorkerSnapshot, TokenSnapshot, DasherSnapshot, MenuItem, Station,
} from "./types";
import { CHANNELS, SERVICE_START, SERVICE_END, BIN_MIN, N_BINS } from "./types";
import { RNG, hashSeed } from "./rng";
import { HANDS_ON, PACK_MIN, WALK_SPEED, TARGET_TICKET_MIN } from "./scenario";
import { dasherSlot, IDLE_SPOT } from "./layout";

export const DT = 0.5; // minutes per tick

interface Task {
  order: Order;
  item: OrderItemState | null; // null => pack task
  station: StationId;
  stationIdx: number;
  priority: number; // lower = sooner (placedAt)
}

interface InProgress {
  order: Order;
  item: OrderItemState | null;
  station: StationId;
  stationIdx: number;
  doneAt: number;
  baskets: number;
}

interface WorkerState {
  id: string; x: number; y: number; station: StationId | null; busyUntil: number; onShift: boolean;
}

const DELIVERY = new Set<Channel>(["doordash", "ubereats"]);

export interface SimOptions {
  seed: number;
  snapshots?: boolean;
  keepOrders?: boolean;
}

export function simulateNight(sc: Scenario, opts: SimOptions): NightResult {
  const seed = opts.seed >>> 0;
  const arrivalRng = new RNG(hashSeed(seed, 11));
  const menu = sc.menu.filter(m => !sc.removedItems.includes(m.id));
  const menuById = new Map<string, MenuItem>(sc.menu.map(m => [m.id, m]));
  const stationById = new Map<StationId, Station>(sc.stations.map(s => [s.id, s]));
  const workers: WorkerState[] = sc.workers.map((w, i) => ({ id: w.id, x: IDLE_SPOT.x + (i - 1.5) * 0.9, y: IDLE_SPOT.y, station: null, busyUntil: 0, onShift: false }));
  const workerDef = new Map(sc.workers.map(w => [w.id, w]));

  const orders: Order[] = [];
  let nextOrderId = 1;
  const inProgress: InProgress[] = [];
  const prepStock = new Map<string, { qty: number; time: number }[]>();
  for (const pb of sc.prepBatches) {
    const arr = prepStock.get(pb.item) ?? [];
    arr.push({ qty: pb.qty, time: pb.time });
    prepStock.set(pb.item, arr);
  }
  const wasteUnits = new Map<string, number>(); // unsold prepped units (cost)
  for (const pb of sc.prepBatches) wasteUnits.set(pb.item, (wasteUnits.get(pb.item) ?? 0) + pb.qty);

  // Candidate arrivals via thinning at a fixed max rate (common random numbers across variants).
  const MAX_MULT = 1.8;
  const bigOrdersLeft = [...sc.bigOrders].sort((a, b) => a.time - b.time);

  const snaps: Snapshot[] = [];
  const binMetrics: BinMetrics[] = Array.from({ length: N_BINS }, (_, i) => ({
    start: SERVICE_START + i * BIN_MIN, orders: 0, avgTicket: 0, avgDasherWait: 0, cold: 0, late: 0, fryerLoad: 0, grillLoad: 0, dollarsAtRisk: 0,
  }));
  const binAcc = binMetrics.map(() => ({ ticketSum: 0, ticketN: 0, dwSum: 0, dwN: 0, fryerLoadSum: 0, grillLoadSum: 0, ticks: 0 }));

  const binOf = (t: number) => Math.min(N_BINS - 1, Math.max(0, Math.floor((t - SERVICE_START) / BIN_MIN)));
  const quotedAt = (t: number) => {
    for (const q of sc.quotedPrep) if (t >= q.start && t < q.end) return q.minutes;
    return 15;
  };
  const stationCapacityAt = (id: StationId, t: number) => {
    let cap = stationById.get(id)!.capacity;
    for (const o of sc.outages) if (o.station === id && t >= o.start && t < o.end) cap = Math.min(cap, o.capacity);
    return cap;
  };
  const channelPaused = (ch: Channel, t: number) => sc.channelPauses.some(p => p.channel === ch && t >= p.start && t < p.end);

  function makeOrder(t: number, channel: Channel, rng: RNG, forcedItems?: { item: string; qty: number }[], isBig = false): Order | null {
    const items: OrderItemState[] = [];
    let revenue = 0, foodCost = 0;
    if (forcedItems) {
      for (const fi of forcedItems) {
        const m = menuById.get(fi.item); if (!m) continue;
        for (let k = 0; k < fi.qty; k++) { items.push({ itemId: m.id, stationIdx: 0 }); revenue += m.price; foodCost += m.foodCost; }
      }
    } else {
      if (menu.length === 0) return null;
      const u0 = rng.next();
      const n = u0 < 0.25 ? 1 : u0 < 0.70 ? 2 : u0 < 0.95 ? 3 : 4;
      const weight = (m: MenuItem) => m.popularity * (sc.mixShift[m.id] ?? 1);
      for (let k = 0; k < n; k++) {
        const m = rng.weighted(menu, weight);
        items.push({ itemId: m.id, stationIdx: 0 }); revenue += m.price; foodCost += m.foodCost;
      }
      // most orders include a side/drink on top of a main
      if (rng.next() < 0.35) { const m = menuById.get("fries"); if (m && menu.includes(m)) { items.push({ itemId: m.id, stationIdx: 0 }); revenue += m.price; foodCost += m.foodCost; } }
      if (rng.next() < 0.4) { const m = menuById.get("soda"); if (m && menu.includes(m)) { items.push({ itemId: m.id, stationIdx: 0 }); revenue += m.price; foodCost += m.foodCost; } }
    }
    if (items.length === 0) return null;
    const isDelivery = DELIVERY.has(channel);
    const q = quotedAt(t);
    const promisedAt = t + (isDelivery ? q : channel === "phone" ? 20 : 15);
    const o: Order = {
      id: nextOrderId++, channel, placedAt: t, promisedAt, items, status: "queued", cold: false, late: false, revenue, foodCost, isBig,
    };
    if (isDelivery) o.dasherArrivesAt = t + q + rng.normal(0, 2.0);
    // Pre-batched stock: consume prepped units => skip cooking for those items
    for (const it of items) {
      const stock = prepStock.get(it.itemId);
      if (stock) {
        const avail = stock.find(s => s.time <= t && s.qty > 0);
        if (avail) { avail.qty--; it.stationIdx = 98; wasteUnits.set(it.itemId, (wasteUnits.get(it.itemId) ?? 0) - 1); }
      }
    }
    return o;
  }

  function inKitchenCount() { let n = 0; for (const o of orders) if (o.status === "queued" || o.status === "cooking") n++; return n; }

  const walkTime = (w: WorkerState, st: Station) => Math.hypot(w.x - st.x, w.y - st.y) / WALK_SPEED / 60;

  // Metrics accumulators
  let lostOrders = 0;
  const lastQueue = new Map<StationId, number>();

  for (let t = SERVICE_START; t < SERVICE_END; t += DT) {
    const bi = binOf(t);
    // --- shifts
    for (const w of workers) {
      const def = workerDef.get(w.id)!;
      w.onShift = def.shifts.some(s => t >= s.start && t < s.end);
      if (!w.onShift) { w.station = null; w.x = -1; w.y = -1; }
      else if (w.x < 0) { w.x = IDLE_SPOT.x + (workers.indexOf(w) - 1.5) * 0.9; w.y = IDLE_SPOT.y; }
    }
    // --- arrivals (thinned Poisson, common random numbers)
    const oph = sc.baselineOrdersPerHour[bi];
    for (const ch of CHANNELS) {
      const lamMax = oph * sc.channelMix[ch] * MAX_MULT / 60 * DT;
      const n = arrivalRng.poisson(lamMax);
      for (let k = 0; k < n; k++) {
        const u = arrivalRng.next();
        const orderSeed = hashSeed(seed, 7, Math.round(t * 2), CHANNELS.indexOf(ch), k);
        const mult = sc.demand[bi]?.mult[ch] ?? 1;
        if (u >= mult / MAX_MULT) continue;              // thinned out
        if (channelPaused(ch, t)) continue;              // channel paused => order never placed (counted as throttled)
        const rng = new RNG(orderSeed);
        // Balking under heavy backlog (walk-in/phone see the wait; apps show long quoted times)
        const backlog = inKitchenCount();
        if (backlog > 18) {
          const pBalk = Math.min(0.85, (backlog - 18) * 0.06) * (DELIVERY.has(ch) ? 0.5 : 1);
          if (rng.next() < pBalk) { lostOrders++; binMetrics[bi].dollarsAtRisk += 0.6 * 22; continue; }
        }
        const o = makeOrder(t, ch, rng);
        if (o) orders.push(o);
      }
    }
    while (bigOrdersLeft.length && bigOrdersLeft[0].time <= t) {
      const b = bigOrdersLeft.shift()!;
      const o = makeOrder(t, b.channel, new RNG(hashSeed(seed, 99, Math.round(b.time))), b.items, true);
      if (o) { o.promisedAt = t + 45; if (o.dasherArrivesAt != null) o.dasherArrivesAt = t + 45; orders.push(o); }
    }

    // --- complete in-progress work
    for (let i = inProgress.length - 1; i >= 0; i--) {
      const p = inProgress[i];
      if (p.doneAt <= t) {
        inProgress.splice(i, 1);
        if (p.item) {
          p.item.stationIdx++;
          const m = menuById.get(p.item.itemId)!;
          if (p.item.stationIdx >= m.stations.length) { p.item.doneAt = t; p.item.stationIdx = 99; }
        } else {
          p.order.readyAt = t; p.order.status = "ready";
        }
      }
    }

    // --- build task list (items needing a station; orders needing pack)
    const tasks: Task[] = [];
    const busyAtStation = new Map<StationId, number>();
    for (const p of inProgress) busyAtStation.set(p.station, (busyAtStation.get(p.station) ?? 0) + (p.item ? p.baskets : 0));
    for (const o of orders) {
      if (o.status === "handed" || o.status === "lost" || o.status === "ready") continue;
      // Fire-to-quote: delivery orders wait in the ticket rail until the quoted time is near.
      if (o.status === "queued" && o.dasherArrivesAt != null && !o.isBig) {
        const fireAt = o.placedAt + Math.max(0, (o.promisedAt - o.placedAt) - TARGET_TICKET_MIN);
        if (t < fireAt) continue;
      }
      let allDone = true;
      for (const it of o.items) {
        if (it.stationIdx >= 98) continue;
        allDone = false;
        if (inProgress.some(p => p.item === it)) continue;
        const m = menuById.get(it.itemId)!;
        // Fire long items first: hold a short item until the order's longer items are cooking and close to done.
        // Under stress (a station jammed), cooks lose that discipline and fire what is in front of them => food goes cold.
        let hold = false;
        for (const other of o.items) {
          if (other === it || other.stationIdx >= 98) continue;
          const om = menuById.get(other.itemId)!;
          const prog = inProgress.find(p => p.item === other);
          if (prog) { if (prog.doneAt - t > m.prepMin + 1.5 && om.prepMin > m.prepMin + 1.5) { hold = true; break; } }
          else if (om.prepMin > m.prepMin + 1.5) {
            const otherStation = om.stations[other.stationIdx];
            const jammed = (lastQueue.get(otherStation) ?? 0) >= 1.5 * stationCapacityAt(otherStation, t);
            if (!jammed) { hold = true; break; }
          }
        }
        if (hold) continue;
        tasks.push({ order: o, item: it, station: m.stations[it.stationIdx], stationIdx: it.stationIdx, priority: o.placedAt });
      }
      if (allDone && !inProgress.some(p => p.order === o && p.item === null)) {
        tasks.push({ order: o, item: null, station: "pack", stationIdx: 0, priority: o.placedAt - 5 }); // packing finishes orders; slight priority
      }
    }
    tasks.sort((a, b) => a.priority - b.priority);

    // --- assign idle workers
    for (const w of workers) {
      if (!w.onShift || w.busyUntil > t) continue;
      if (w.busyUntil < t - 2 && w.station) { w.station = null; w.x = IDLE_SPOT.x + (workers.indexOf(w) - 1.5) * 0.9; w.y = IDLE_SPOT.y; }
      const def = workerDef.get(w.id)!;
      for (let ti = 0; ti < tasks.length; ti++) {
        const task = tasks[ti];
        const skill = def.skills[task.station] ?? 0;
        if (skill <= 0) continue;
        const st = stationById.get(task.station)!;
        const cap = stationCapacityAt(task.station, t);
        const baskets = task.item ? (menuById.get(task.item.itemId)!.fryerBaskets ?? 1) : 0;
        if (task.item && (busyAtStation.get(task.station) ?? 0) + baskets > cap) continue;
        // assign
        const walk = walkTime(w, st);
        w.x = st.x; w.y = st.y; w.station = task.station;
        let dur: number;
        if (task.item) {
          const m = menuById.get(task.item.itemId)!;
          const rng = new RNG(hashSeed(seed, 5, task.order.id, task.order.items.indexOf(task.item), task.stationIdx));
          const base = rng.posNoise(m.prepMin, m.prepSd) / skill;
          dur = base;
          const handsOn = base * (HANDS_ON[task.station] ?? 1);
          w.busyUntil = t + walk + handsOn;
          task.item.startedAt = t;
          task.item.workerId = w.id;
          task.order.status = "cooking";
          inProgress.push({ order: task.order, item: task.item, station: task.station, stationIdx: task.stationIdx, doneAt: t + walk + dur, baskets });
          busyAtStation.set(task.station, (busyAtStation.get(task.station) ?? 0) + baskets);
        } else {
          for (const it of task.order.items) if (it.stationIdx === 98) { it.stationIdx = 99; it.doneAt = t; }
          const packDur = (PACK_MIN + 0.08 * task.order.items.length) / skill;
          w.busyUntil = t + walk + packDur;
          inProgress.push({ order: task.order, item: null, station: "pack", stationIdx: 0, doneAt: t + walk + packDur, baskets: 0 });
        }
        tasks.splice(ti, 1);
        break;
      }
    }

    // --- handoffs
    for (const o of orders) {
      if (o.status !== "ready") continue;
      const isDelivery = DELIVERY.has(o.channel);
      if (isDelivery && o.dasherArrivesAt! > t) continue; // waiting for dasher
      o.handedAt = t; o.status = "handed";
      if (isDelivery) o.dasherWait = Math.max(0, (o.readyAt ?? t) - o.dasherArrivesAt!);
      // cold?
      for (const it of o.items) {
        const m = menuById.get(it.itemId)!;
        if (it.doneAt != null && t - it.doneAt > m.holdMin) { o.cold = true; break; }
      }
      o.late = (o.readyAt ?? t) > o.promisedAt + 5;
      const b = binOf(o.placedAt);
      binMetrics[b].orders++;
      binAcc[b].ticketSum += (o.readyAt ?? t) - o.placedAt; binAcc[b].ticketN++;
      if (isDelivery) { binAcc[b].dwSum += o.dasherWait ?? 0; binAcc[b].dwN++; }
      if (o.cold) binMetrics[b].cold++;
      if (o.late) binMetrics[b].late++;
      // dollars at risk
      let risk = 0;
      if (o.cold) risk += 0.5 * o.revenue;
      if (o.late) risk += 0.15 * o.revenue;
      const wrongP = Math.min(0.25, 0.015 + 0.06 * Math.max(0, inKitchenCount() - 10) / 10);
      risk += wrongP * 0.5 * o.revenue;
      binMetrics[b].dollarsAtRisk += risk;
    }

    // --- station loads for this tick
    const fryerCap = stationCapacityAt("fryer", t), grillCap = stationCapacityAt("grill", t);
    const fryerQueue = tasks.filter(x => x.station === "fryer").length;
    const grillQueue = tasks.filter(x => x.station === "grill").length;
    const fryerLoad = ((busyAtStation.get("fryer") ?? 0) + fryerQueue) / Math.max(1, fryerCap);
    const grillLoad = ((busyAtStation.get("grill") ?? 0) + grillQueue) / Math.max(1, grillCap);
    binAcc[bi].fryerLoadSum += fryerLoad; binAcc[bi].grillLoadSum += grillLoad; binAcc[bi].ticks++;
    lastQueue.clear();
    for (const x of tasks) lastQueue.set(x.station, (lastQueue.get(x.station) ?? 0) + 1);

    // --- snapshot
    if (opts.snapshots) {
      snaps.push(buildSnapshot(t, sc, workers, workerDef, orders, inProgress, tasks, stationCapacityAt, menuById, lostOrders, binMetrics, binAcc));
    }
  }

  // finalize bins
  for (let i = 0; i < N_BINS; i++) {
    const a = binAcc[i], b = binMetrics[i];
    b.avgTicket = a.ticketN ? a.ticketSum / a.ticketN : 0;
    b.avgDasherWait = a.dwN ? a.dwSum / a.dwN : 0;
    b.fryerLoad = a.ticks ? a.fryerLoadSum / a.ticks : 0;
    b.grillLoad = a.ticks ? a.grillLoadSum / a.ticks : 0;
  }
  // unfinished orders at close count as late/handed-at-close
  const metrics = computeMetrics(sc, orders, binMetrics, lostOrders, wasteUnits, menuById);
  return { seed, metrics, snapshots: opts.snapshots ? snaps : undefined, orders: opts.keepOrders ? orders : undefined };
}

function computeMetrics(sc: Scenario, orders: Order[], bins: BinMetrics[], lostOrders: number, wasteUnits: Map<string, number>, menuById: Map<string, MenuItem>): NightMetrics {
  const handed = orders.filter(o => o.status === "handed");
  const tickets = handed.map(o => (o.readyAt ?? SERVICE_END) - o.placedAt).sort((a, b) => a - b);
  const avgTicket = tickets.length ? tickets.reduce((a, b) => a + b, 0) / tickets.length : 0;
  const p90Ticket = tickets.length ? tickets[Math.min(tickets.length - 1, Math.floor(tickets.length * 0.9))] : 0;
  const deliv = handed.filter(o => o.dasherWait != null);
  const totalDasherWait = deliv.reduce((a, o) => a + (o.dasherWait ?? 0), 0);
  const avgDasherWait = deliv.length ? totalDasherWait / deliv.length : 0;
  const coldOrders = handed.filter(o => o.cold).length;
  const lateOrders = handed.filter(o => o.late).length;
  const revenue = handed.reduce((a, o) => a + o.revenue, 0);
  const unfinished = orders.filter(o => o.status !== "handed" && o.status !== "lost").length;
  let laborCost = 0;
  for (const w of sc.workers) for (const s of w.shifts) laborCost += w.wage * Math.max(0, s.end - s.start) / 60;
  let dollarsAtRisk = bins.reduce((a, b) => a + b.dollarsAtRisk, 0);
  dollarsAtRisk += unfinished * 0.5 * 22;
  // waste from prep batches
  let waste = 0;
  for (const [item, units] of wasteUnits) if (units > 0) waste += units * (menuById.get(item)?.foodCost ?? 0);
  // bottleneck: station with the highest sustained load over any 4-bin (1h) window
  let best = { station: "fryer" as StationId, start: SERVICE_START, end: SERVICE_START + 60, peakLoad: 0 };
  for (const st of ["fryer", "grill"] as const) {
    for (let i = 0; i + 4 <= bins.length; i++) {
      const avg = bins.slice(i, i + 4).reduce((a, b) => a + (st === "fryer" ? b.fryerLoad : b.grillLoad), 0) / 4;
      if (avg > best.peakLoad) best = { station: st, start: bins[i].start, end: bins[i].start + 60, peakLoad: avg };
    }
  }
  return {
    avgTicket, p90Ticket, avgDasherWait, totalDasherWait, coldOrders, lateOrders, lostOrders,
    orders: handed.length, revenue, laborCost: laborCost + waste, dollarsAtRisk, bins, bottleneck: best,
  };
}

function buildSnapshot(
  t: number, sc: Scenario, workers: WorkerState[], workerDef: Map<string, Scenario["workers"][number]>, orders: Order[],
  inProgress: InProgress[], tasks: Task[], capAt: (id: StationId, t: number) => number, menuById: Map<string, MenuItem>,
  lostOrders: number, bins: BinMetrics[], binAcc: { ticketSum: number; ticketN: number; dwSum: number; dwN: number; fryerLoadSum: number; grillLoadSum: number; ticks: number }[],
): Snapshot {
  const stations: StationSnapshot[] = sc.stations.map(s => {
    const busy = inProgress.filter(p => p.station === s.id && (p.item ? true : s.id === "pack")).reduce((a, p) => a + (p.item ? p.baskets : 1), 0);
    const queue = tasks.filter(x => x.station === s.id).length;
    const cap = capAt(s.id, t);
    const load = s.id === "pack" || s.id === "counter" ? Math.min(1.5, (busy + queue) / 6) : (busy + queue) / Math.max(1, cap);
    return { id: s.id, x: s.x, y: s.y, busy, capacity: cap, queue, load, saturated: load >= 1 };
  });
  const ws: WorkerSnapshot[] = workers.map((w, wi) => {
    const d = workerDef.get(w.id)!;
    // spread workers sharing a station so they don't overlap visually
    const off = w.station ? (wi - 1.5) * 0.45 : 0;
    return { id: w.id, name: d.name, color: d.color, x: w.onShift ? w.x + off : -2, y: w.onShift ? w.y : -2, station: w.station, onShift: w.onShift, busy: w.busyUntil > t };
  });
  const tokens: TokenSnapshot[] = [];
  const dashers: DasherSnapshot[] = [];
  const stationPos = new Map(sc.stations.map(s => [s.id, s]));
  const perStationQ = new Map<StationId, number>();
  const perStationC = new Map<StationId, number>();
  let readyCount = 0;
  for (const o of orders) {
    if (o.status === "handed" || o.status === "lost") continue;
    if (o.status === "ready") {
      const pack = stationPos.get("pack")!;
      let warmth = 0;
      for (const it of o.items) { const m = menuById.get(it.itemId)!; if (it.doneAt != null) warmth = Math.max(warmth, (t - it.doneAt) / m.holdMin); }
      const k = readyCount++;
      tokens.push({ orderId: o.id, itemIdx: -1, channel: o.channel, warmth, x: pack.x + 1.2 + (k % 6) * 0.35, y: pack.y - 0.6 + Math.floor(k / 6) * 0.35, stage: "ready" });
    } else {
      for (let ii = 0; ii < o.items.length; ii++) {
        const it = o.items[ii];
        if (it.stationIdx >= 98) continue;
        const m = menuById.get(it.itemId)!;
        const stId = m.stations[it.stationIdx];
        const sp = stationPos.get(stId)!;
        const cooking = inProgress.some(p => p.item === it);
        if (cooking) {
          const k = perStationC.get(stId) ?? 0; perStationC.set(stId, k + 1);
          tokens.push({ orderId: o.id, itemIdx: ii, channel: o.channel, warmth: 0, x: sp.x - 0.6 + (k % 4) * 0.4, y: sp.y + 0.55, stage: "cooking" });
        } else {
          const k = perStationQ.get(stId) ?? 0; perStationQ.set(stId, k + 1);
          tokens.push({ orderId: o.id, itemIdx: ii, channel: o.channel, warmth: 0, x: sp.x - 1.1 + (k % 5) * 0.3, y: sp.y + 1.0 + Math.floor(k / 5) * 0.3, stage: "queue" });
        }
      }
    }
    if (o.dasherArrivesAt != null && o.dasherArrivesAt <= t) {
      const slot = dasherSlot(dashers.length);
      dashers.push({ orderId: o.id, channel: o.channel, waitMin: t - o.dasherArrivesAt, x: slot.x, y: slot.y });
    }
  }
  // live counters
  const handed = orders.filter(o => o.status === "handed");
  const deliv = handed.filter(o => o.dasherWait != null);
  const live: LiveCounters = {
    ordersPlaced: orders.length,
    ordersHanded: handed.length,
    inKitchen: orders.length - handed.length,
    dashersWaiting: dashers.length,
    avgDasherWait: deliv.length ? deliv.reduce((a, o) => a + (o.dasherWait ?? 0), 0) / deliv.length : 0,
    coldOrders: handed.filter(o => o.cold).length,
    lateOrders: handed.filter(o => o.late).length,
    revenue: handed.reduce((a, o) => a + o.revenue, 0),
    dollarsAtRisk: bins.reduce((a, b) => a + b.dollarsAtRisk, 0),
    avgTicket: handed.length ? handed.reduce((a, o) => a + ((o.readyAt ?? t) - o.placedAt), 0) / handed.length : 0,
  };
  void lostOrders;
  const liveBins: BinMetrics[] = bins.map((b, i) => ({
    ...b,
    avgTicket: binAcc[i].ticketN ? binAcc[i].ticketSum / binAcc[i].ticketN : 0,
    avgDasherWait: binAcc[i].dwN ? binAcc[i].dwSum / binAcc[i].dwN : 0,
    fryerLoad: binAcc[i].ticks ? binAcc[i].fryerLoadSum / binAcc[i].ticks : 0,
    grillLoad: binAcc[i].ticks ? binAcc[i].grillLoadSum / binAcc[i].ticks : 0,
  }));
  return { t, stations, workers: ws, tokens, dashers, live, bins: liveBins };
}
