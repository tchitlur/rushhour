// Shared server-side helpers for the real-world intake modules (time zone math + fetch with timeout).

export const LOCAL_TZ = "America/New_York";

/** Minutes to add to UTC to get local wall time in `tz` at the given instant. */
function tzOffsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Convert a local wall-clock time ("YYYY-MM-DD", "HH:MM:SS") in `tz` to a UTC ISO string with a Z suffix. */
export function localToUtcIso(date: string, time = "00:00:00", tz = LOCAL_TZ): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let utc = guess - tzOffsetMinutes(guess, tz) * 60000;
  utc = guess - tzOffsetMinutes(utc, tz) * 60000; // second pass handles DST edges
  return new Date(utc).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Today's date ("YYYY-MM-DD") in the local time zone. */
export function todayLocalDate(tz = LOCAL_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Add hours to a local ISO string ("YYYY-MM-DDTHH:MM:SS", no zone) and return the same format. */
export function addHoursLocal(localIso: string, hours: number): string {
  const [date, time = "00:00:00"] = localIso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(":").map(Number);
  const ms = Date.UTC(y, m - 1, d, hh, mm, ss) + hours * 3600_000;
  return new Date(ms).toISOString().slice(0, 19);
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
}

export function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/** Great-circle distance in miles. */
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** fetch() that rejects after `timeoutMs` and on non-2xx, returning parsed JSON. */
export async function fetchJsonWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
