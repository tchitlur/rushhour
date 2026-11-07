// Normalized real-world inputs for the "Tonight" panel. Events and weather are REAL; the restaurant is synthetic.

export type ImpactDirection = "delivery_up" | "dine_in_down" | "both" | "neutral";

export interface EventFact {
  id: string;
  name: string;
  type: string;             // e.g. "NFL game", "concert", "NHL game", "university event", "holiday"
  start: string;            // ISO local time, e.g. "2026-11-09T20:15:00"
  end?: string;             // ISO local time (estimated if unknown)
  venue: string;
  distanceMiles: number;    // from the restaurant
  attendance: number;       // estimated
  impact: ImpactDirection;
  confidence: number;       // 0..1
  sourceUrl: string;
  source: "ticketmaster" | "web_search" | "cache";
  explanation?: string;     // one-line, LLM-written, human
}

export interface HourlyWeather {
  time: string;             // ISO local "2026-11-09T18:00"
  tempF: number;
  precipIn: number;         // inches that hour
  precipProb?: number;      // 0..100 (forecast only)
  windMph: number;
  code: number;             // WMO weather code
}

export interface WeatherFacts {
  date: string;
  hourly: HourlyWeather[];  // 24 hours of the day (local)
  summary: string;          // e.g. "Rain 6–9 PM, 44°F"
  rainEvening: boolean;     // measurable rain between 4 and 10 PM
  source: "open-meteo" | "cache";
  sourceUrl: string;
}

export interface TonightData {
  date: string;
  location: { lat: number; lon: number; label: string };
  events: EventFact[];
  weather: WeatherFacts | null;
  fetchedAt: string;
  cached: boolean;          // true if served from committed cache
}

/** Restaurant location: North Shore, Pittsburgh (neighborhood centroid, not a real business). */
export const RESTAURANT = { lat: 40.4468, lon: -80.0100, label: "North Shore, Pittsburgh, PA" };
