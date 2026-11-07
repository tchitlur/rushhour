// Server-only: merges Ticketmaster + Open-Meteo + web search into TonightData, with per-source
// fallback to the committed cache and an in-memory memo (Vercel's filesystem is read-only at runtime).
import { RESTAURANT, type EventFact, type TonightData, type WeatherFacts } from "./intake-types";
import { fetchTicketmasterEvents } from "./ticketmaster";
import { fetchWeather } from "./weather";
import { searchLocalHappenings } from "./websearch";
import { CACHED_TONIGHT } from "../data/cache";

export interface TonightOptions {
  lat?: number;
  lon?: number;
  useWebSearch?: boolean;
}

const memo = new Map<string, TonightData>();

function eventKey(e: EventFact): string {
  return `${e.name.trim().toLowerCase()}|${e.start}`;
}

function fromCache(events: EventFact[]): EventFact[] {
  return events.map((e) => ({ ...e, source: "cache" as const }));
}

export async function getTonight(date: string, opts: TonightOptions = {}): Promise<TonightData> {
  const lat = opts.lat ?? RESTAURANT.lat;
  const lon = opts.lon ?? RESTAURANT.lon;
  const useWeb = opts.useWebSearch ?? false;
  const key = `${date}|${lat}|${lon}|${useWeb ? 1 : 0}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const cache: TonightData | undefined = CACHED_TONIGHT[date];
  const cachedTm = cache?.events.filter((e) => e.source === "ticketmaster") ?? [];
  const cachedWeb = cache?.events.filter((e) => e.source === "web_search") ?? [];

  const [tm, wx, web] = await Promise.allSettled([
    fetchTicketmasterEvents(date, lat, lon),
    fetchWeather(date, lat, lon),
    useWeb ? searchLocalHappenings(date) : Promise.resolve<EventFact[]>([]),
  ]);

  let cached = false;
  const errors: string[] = [];

  let tmEvents: EventFact[] = tm.status === "fulfilled" ? tm.value : [];
  if (tm.status === "rejected") errors.push(`ticketmaster: ${String((tm.reason as Error)?.message ?? tm.reason)}`);
  if (tmEvents.length === 0 && cachedTm.length > 0) {
    tmEvents = fromCache(cachedTm);
    cached = true;
  }

  let webEvents: EventFact[] = web.status === "fulfilled" ? web.value : [];
  if (webEvents.length === 0 && cachedWeb.length > 0) {
    webEvents = fromCache(cachedWeb);
    cached = true;
  }

  let weather: WeatherFacts | null = wx.status === "fulfilled" ? wx.value : null;
  if (wx.status === "rejected") errors.push(`weather: ${String((wx.reason as Error)?.message ?? wx.reason)}`);
  if (!weather && cache?.weather) {
    weather = { ...cache.weather, source: "cache" };
    cached = true;
  }

  const seen = new Set<string>();
  const events: EventFact[] = [];
  for (const e of [...tmEvents, ...webEvents]) {
    const k = eventKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    events.push(e);
  }
  events.sort((a, b) => a.start.localeCompare(b.start));

  const label = lat === RESTAURANT.lat && lon === RESTAURANT.lon ? RESTAURANT.label : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  const result: TonightData = {
    date,
    location: { lat, lon, label },
    events,
    weather,
    fetchedAt: new Date().toISOString(),
    cached,
  };
  if (errors.length) console.warn(`[tonight] ${date} partial data:`, errors.join("; "));
  // Only memoize when we actually have something, so a transient outage can be retried.
  if (events.length > 0 || weather) memo.set(key, result);
  return result;
}
