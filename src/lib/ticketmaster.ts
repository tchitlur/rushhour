// Server-only: Ticketmaster Discovery API -> EventFact[] for one local day.
import type { EventFact, ImpactDirection } from "./intake-types";
import { addHoursLocal, fetchJsonWithTimeout, haversineMiles, localToUtcIso } from "./intake-utils";

const TM_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";
const TIMEOUT_MS = 10_000;

interface VenueInfo {
  capacity: number;
  /** Known coordinates; Ticketmaster's venue pins for a few North Shore venues are off by ~1 mile. */
  lat?: number;
  lon?: number;
}

const VENUES: Array<[RegExp, VenueInfo]> = [
  [/acrisure stadium|heinz field/i, { capacity: 68400, lat: 40.4468, lon: -80.0158 }],
  [/ppg paints arena/i, { capacity: 18387, lat: 40.4395, lon: -79.9896 }],
  [/pnc park/i, { capacity: 38747, lat: 40.4469, lon: -80.0057 }],
  [/stage ae/i, { capacity: 5500, lat: 40.4466, lon: -80.0112 }],
  [/petersen events center/i, { capacity: 12508 }],
  [/benedum/i, { capacity: 2800 }],
  [/heinz hall/i, { capacity: 2676 }],
  [/roxian/i, { capacity: 1400 }],
];
const DEFAULT_CAPACITY = 2000;

interface TmClassification {
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
}
interface TmVenue {
  name?: string;
  location?: { latitude?: string; longitude?: string };
}
interface TmEvent {
  id: string;
  name: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string; timeTBA?: boolean; noSpecificTime?: boolean };
    status?: { code?: string };
  };
  classifications?: TmClassification[];
  _embedded?: { venues?: TmVenue[] };
}
interface TmResponse {
  _embedded?: { events?: TmEvent[] };
  page?: { totalElements?: number };
}

function venueInfo(name: string): VenueInfo {
  for (const [re, info] of VENUES) if (re.test(name)) return info;
  return { capacity: DEFAULT_CAPACITY };
}

function classify(c: TmClassification | undefined, name: string): { type: string; isSports: boolean; isMusic: boolean } {
  const segment = c?.segment?.name ?? "";
  const genre = c?.genre?.name ?? "";
  const sub = c?.subGenre?.name ?? "";
  if (segment === "Sports") {
    if (/\bNFL\b/i.test(sub) || /steelers/i.test(name)) return { type: "NFL game", isSports: true, isMusic: false };
    if (/\bNHL\b/i.test(sub) || /penguins/i.test(name)) return { type: "NHL game", isSports: true, isMusic: false };
    if (/\bMLB\b/i.test(sub) || /pirates/i.test(name)) return { type: "MLB game", isSports: true, isMusic: false };
    if (/college|ncaa/i.test(sub) || /panthers|dukes/i.test(name)) {
      return { type: `College ${genre ? genre.toLowerCase() : "sports"} game`, isSports: true, isMusic: false };
    }
    return { type: genre && genre !== "Miscellaneous" ? `${genre} game` : "Sporting event", isSports: true, isMusic: false };
  }
  if (segment === "Music") return { type: "Concert", isSports: false, isMusic: true };
  if (segment === "Arts & Theatre") {
    return { type: /comedy/i.test(genre) ? "Comedy show" : "Theater show", isSports: false, isMusic: false };
  }
  if (segment === "Film") return { type: "Film screening", isSports: false, isMusic: false };
  return { type: segment || "Event", isSports: false, isMusic: false };
}

function impactFor(isSports: boolean, isMusic: boolean, attendance: number): ImpactDirection {
  if (isSports) return "both"; // pre-game walk-in dip near kickoff + delivery surge from tailgaters / at-home watchers
  if (isMusic) return "delivery_up";
  return attendance >= 10000 ? "both" : "neutral";
}

export async function fetchTicketmasterEvents(date: string, lat: number, lon: number, radiusMiles = 3): Promise<EventFact[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("TICKETMASTER_API_KEY is not set");

  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${lat},${lon}`,
    radius: String(Math.round(radiusMiles)),
    unit: "miles",
    size: "100",
    sort: "date,asc",
    startDateTime: localToUtcIso(date, "00:00:00"),
    endDateTime: localToUtcIso(date, "23:59:59"),
  });
  const data = (await fetchJsonWithTimeout(`${TM_BASE}?${params}`, TIMEOUT_MS)) as TmResponse;
  const events = data._embedded?.events ?? [];

  const seen = new Set<string>();
  const out: EventFact[] = [];
  for (const e of events) {
    const start = e.dates?.start;
    if (!start?.localDate || start.localDate !== date) continue;
    if (!start.localTime || start.timeTBA || start.noSpecificTime) continue; // don't invent a start time
    if (e.dates?.status?.code === "cancelled") continue;
    const cls = e.classifications?.[0];
    if (cls?.segment?.name === "Miscellaneous" && (cls.genre?.name ?? "Undefined") === "Undefined") continue; // arena tours etc.

    const venue = e._embedded?.venues?.[0];
    const venueName = venue?.name ?? "Unknown venue";
    const info = venueInfo(venueName);
    const vLat = info.lat ?? Number(venue?.location?.latitude);
    const vLon = info.lon ?? Number(venue?.location?.longitude);
    const distanceMiles = Number.isFinite(vLat) && Number.isFinite(vLon) ? Number(haversineMiles(lat, lon, vLat, vLon).toFixed(2)) : radiusMiles;

    const { type, isSports, isMusic } = classify(cls, e.name);
    const startIso = `${start.localDate}T${start.localTime.length === 5 ? `${start.localTime}:00` : start.localTime}`;
    const key = `${e.name.trim().toLowerCase()}|${startIso}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: `tm-${e.id}`,
      name: e.name.trim(),
      type,
      start: startIso,
      end: addHoursLocal(startIso, isSports ? 3.25 : 2.5),
      venue: venueName,
      distanceMiles,
      attendance: info.capacity,
      impact: impactFor(isSports, isMusic, info.capacity),
      confidence: 0.9,
      sourceUrl: e.url ?? "https://www.ticketmaster.com/",
      source: "ticketmaster",
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
