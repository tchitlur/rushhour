// Tolerant CSV parser for past-order exports (Square "Items"/"Transactions", Toast "Orders",
// DoorDash Merchant Portal). Pure TypeScript, runs in the browser; nothing is uploaded.
//
// Column detection is by header name (case/punctuation-insensitive), so column order does not matter.
// A row is a line item when the file has an order-id column (orders = distinct ids); otherwise a row is an order.

export interface HistorySummary {
  /** orders found (distinct order ids, or rows when the export has no id column) */
  orders: number;
  /** first / last order date, YYYY-MM-DD (local) */
  from: string;
  to: string;
  /** average orders per day with at least one order */
  avgPerDay: number;
  /** average orders on Fridays (0 when the file has no Friday) */
  avgFriday: number;
  topItems: { name: string; count: number }[];
  /** rows skipped because no date could be read */
  skipped?: number;
}

export interface ParsedOrders {
  summary: HistorySummary | null;
  /** detected columns, for the UI ("date ← Created At") */
  columns: Partial<Record<Role, string>>;
  rows: number;
  error?: string;
}

type Role = "date" | "time" | "item" | "qty" | "total" | "channel" | "orderId";

/** Split CSV text into records of fields. Handles quoted fields with commas, newlines and doubled quotes. */
export function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim() !== "")) out.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some(f => f.trim() !== "")) out.push(row);
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header patterns per role, most specific first. Each is tested against the normalized header. */
const PATTERNS: Record<Role, RegExp[]> = {
  orderId: [/^orderid$/, /^order(number|no|num)$/, /^(order|transaction|receipt|ticket|check)(id|number|no)?$/, /orderid|transactionid|receiptid/],
  time: [/^time$/, /^(order|transaction)time$/, /^timeoforder$/],
  date: [/^date$/, /^(order|transaction|business|sale|sales)date$/, /created|placed|opened|datetime|timestamp/, /^date/, /date$/, /time/],
  item: [/^item(name)?$/, /^(product|dish|menuitem|itemname|productname|items|lineitem|description)$/, /item|product|dish|menu/, /^name$/, /name/],
  qty: [/^qty$/, /^quantity$/, /qty|quantity|^count$|^units?$/],
  total: [/^total$/, /^(order|gross|net|grosssales|netsales|sub)?total$/, /^amount$/, /^(price|subtotal|totalamount|ordertotal|grosssales|netsales)$/, /total|amount|price|sales/],
  channel: [/^channel$/, /^source$/, /^(platform|fulfillment|fulfilment|ordertype|dining|diningoption|provider)$/, /channel|source|platform|fulfil/],
};

function detectColumns(header: string[]): Partial<Record<Role, number>> {
  const n = header.map(norm);
  const used = new Set<number>();
  const found: Partial<Record<Role, number>> = {};
  const roles: Role[] = ["orderId", "time", "date", "item", "qty", "total", "channel"];
  for (const role of roles) {
    for (const re of PATTERNS[role]) {
      const idx = n.findIndex((h, i) => !used.has(i) && re.test(h));
      if (idx >= 0) { found[role] = idx; used.add(idx); break; }
    }
  }
  // "Modifiers"/"Notes" should never be picked as the item column; "Tax"/"Tip"/"Discount" never as total.
  if (found.item != null && /modifier|note|category/.test(n[found.item])) delete found.item;
  if (found.total != null && /tax|tip|discount|fee|refund/.test(n[found.total])) delete found.total;
  return found;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/** Parse a date (+ optional time) string as a LOCAL date. Returns null when nothing sensible can be read. */
export function parseLocalDate(dateStr: string, timeStr = ""): Date | null {
  const s = `${dateStr} ${timeStr}`.trim().replace(/\s+/g, " ");
  if (!s) return null;
  let y = NaN, mo = NaN, d = NaN;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) {
    // US style M/D/Y (DoorDash, Toast, Square US exports)
    mo = +m[1] - 1; d = +m[2]; y = +m[3]; if (y < 100) y += 2000;
    if (mo > 11 && d <= 12) { const t = mo; mo = d - 1; d = t + 1; } // tolerate D/M/Y when month is impossible
  } else if ((m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})/.exec(s))) {
    mo = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3];
  } else if ((m = /^(\d{1,2}) ([A-Za-z]{3,9})\.? (\d{4})/.exec(s))) {
    d = +m[1]; mo = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()]; y = +m[3];
  } else {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    return new Date(t);
  }
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0;
  const tm = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(s);
  if (tm) {
    hh = +tm[1] % 12; mm = +tm[2];
    const ap = tm[3]?.toLowerCase();
    if (ap === "pm") hh += 12; else if (!ap) hh = +tm[1];
  }
  const out = new Date(y, mo, d, hh, mm, 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

const dayKey = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

/** Split an item cell like "2x Double burger; Fries" into [{name, qty}]. A lone item takes the row's qty. */
function splitItems(cell: string, qty: number): { name: string; qty: number }[] {
  const parts = cell.split(/\s*[;|\n]\s*/).map(p => p.trim()).filter(Boolean);
  return parts.map(p => {
    let m = /^(\d+)\s*[x×]\s+(.+)$/i.exec(p);
    if (m) return { name: m[2], qty: Number(m[1]) };
    m = /^(.+?)\s+[x×]\s*(\d+)$/i.exec(p);
    if (m) return { name: m[1], qty: Number(m[2]) };
    return { name: p, qty: parts.length === 1 ? qty : 1 };
  }).map(x => ({ name: x.name.replace(/\s+/g, " ").trim(), qty: Math.max(1, Math.round(x.qty || 1)) }));
}

export function parseOrdersCsv(text: string): ParsedOrders {
  const recs = splitCsv(text);
  if (recs.length < 2) return { summary: null, columns: {}, rows: 0, error: "That file has no data rows." };
  const header = recs[0];
  const cols = detectColumns(header);
  const columns: Partial<Record<Role, string>> = {};
  for (const [k, v] of Object.entries(cols) as [Role, number][]) columns[k] = header[v].trim();
  if (cols.date == null) return { summary: null, columns, rows: recs.length - 1, error: "Couldn't find a date column (looked for headers like Date, Time, Created At, Order Date)." };

  const perDay = new Map<string, Set<string>>();   // day -> order keys
  const items = new Map<string, number>();
  let skipped = 0;
  let orderCount = 0;
  const seenOrders = new Set<string>();
  for (let r = 1; r < recs.length; r++) {
    const row = recs[r];
    const dt = parseLocalDate(row[cols.date] ?? "", cols.time != null ? row[cols.time] ?? "" : "");
    if (!dt) { skipped++; continue; }
    const day = dayKey(dt);
    const key = cols.orderId != null && (row[cols.orderId] ?? "").trim() ? (row[cols.orderId] ?? "").trim() : `row${r}`;
    if (!seenOrders.has(key)) { seenOrders.add(key); orderCount++; }
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day)!.add(key);
    if (cols.item != null) {
      const q = cols.qty != null ? Number(String(row[cols.qty] ?? "").replace(/[^0-9.-]/g, "")) || 1 : 1;
      for (const it of splitItems(row[cols.item] ?? "", q)) items.set(it.name, (items.get(it.name) ?? 0) + it.qty);
    }
  }
  if (!orderCount) return { summary: null, columns, rows: recs.length - 1, error: "No rows had a readable date." };

  const days = [...perDay.keys()].sort();
  let fridays = 0, fridayOrders = 0;
  for (const [day, set] of perDay) {
    const [y, m, d] = day.split("-").map(Number);
    if (new Date(y, m - 1, d).getDay() === 5) { fridays++; fridayOrders += set.size; }
  }
  const topItems = [...items.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count }));
  const summary: HistorySummary = {
    orders: orderCount,
    from: days[0], to: days[days.length - 1],
    avgPerDay: round1(orderCount / days.length),
    avgFriday: fridays ? round1(fridayOrders / fridays) : 0,
    topItems,
  };
  if (skipped) summary.skipped = skipped;
  return { summary, columns, rows: recs.length - 1 };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Demand multiplier from history: Friday average vs the template's baseline orders per night, clamped to 0.5..2.
 * Falls back to the overall daily average when the file has no Friday.
 */
export function calibrationScale(summary: HistorySummary, baselineOrdersPerNight: number): number {
  const ref = summary.avgFriday > 0 ? summary.avgFriday : summary.avgPerDay;
  if (!(baselineOrdersPerNight > 0) || !(ref > 0)) return 1;
  return Math.round(Math.max(0.5, Math.min(2, ref / baselineOrdersPerNight)) * 100) / 100;
}

/** Orders per night implied by a scenario's baseline (24 bins of 15 min, each in orders/hour). */
export function baselineOrdersPerNight(baselineOrdersPerHour: number[]): number {
  return baselineOrdersPerHour.reduce((a, v) => a + v / 4, 0);
}
