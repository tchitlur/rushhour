// Server-only: Open-Meteo -> WeatherFacts for one local day. Forecast for today/future, archive for past.
import type { HourlyWeather, WeatherFacts } from "./intake-types";
import { fetchJsonWithTimeout, todayLocalDate } from "./intake-utils";

const TIMEOUT_MS = 10_000;
const HOURLY = "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,weather_code";

// The generic /v1/forecast host is rate-limited per IP; the per-model endpoints and the
// historical-forecast host serve the same hourly variables, so we fall through them in order.
const FORECAST_HOSTS = [
  "https://api.open-meteo.com/v1/forecast",
  "https://api.open-meteo.com/v1/ecmwf",
  "https://api.open-meteo.com/v1/gfs",
  "https://historical-forecast-api.open-meteo.com/v1/forecast",
];
const ARCHIVE_HOSTS = ["https://archive-api.open-meteo.com/v1/archive", "https://historical-forecast-api.open-meteo.com/v1/forecast"];

interface OpenMeteoResponse {
  hourly?: {
    time: string[];
    temperature_2m: Array<number | null>;
    precipitation: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    wind_speed_10m: Array<number | null>;
    weather_code: Array<number | null>;
  };
}

function buildUrl(base: string, date: string, lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY,
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "America/New_York",
    start_date: date,
    end_date: date,
  });
  return `${base}?${p}`;
}

function toHourly(r: OpenMeteoResponse): HourlyWeather[] {
  const h = r.hourly;
  if (!h?.time?.length) return [];
  const out: HourlyWeather[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const temp = h.temperature_2m[i];
    if (temp == null) continue;
    const prob = h.precipitation_probability?.[i];
    out.push({
      time: h.time[i],
      tempF: Math.round(temp * 10) / 10,
      precipIn: h.precipitation[i] ?? 0,
      ...(prob == null ? {} : { precipProb: prob }),
      windMph: h.wind_speed_10m[i] ?? 0,
      code: h.weather_code[i] ?? 0,
    });
  }
  return out;
}

const isSnowCode = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const isThunderCode = (c: number) => c >= 95;
const isRainCode = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
const isPrecipCode = (c: number) => isSnowCode(c) || isThunderCode(c) || isRainCode(c);

function hour12(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n} ${suffix}`;
}
function hourRange(hours: number[]): string {
  const first = Math.min(...hours);
  const last = Math.max(...hours) + 1;
  const a = hour12(first);
  const b = hour12(last);
  const [an, as] = a.split(" ");
  const [bn, bs] = b.split(" ");
  return as === bs ? `${an}–${bn} ${bs}` : `${a}–${b}`;
}
function precipWord(codes: number[]): string {
  if (codes.some(isThunderCode)) return "Thunderstorms";
  if (codes.some(isSnowCode)) return codes.some(isRainCode) ? "Rain/snow" : "Snow";
  return "Rain";
}
function skyWord(codes: number[]): string {
  const modal = [...codes].sort((a, b) => codes.filter((c) => c === b).length - codes.filter((c) => c === a).length)[0] ?? 0;
  if (modal === 45 || modal === 48) return "Fog";
  if (modal === 0) return "Clear";
  if (modal <= 2) return "Mostly clear";
  return "Cloudy";
}

export function summarizeWeather(hourly: HourlyWeather[]): { summary: string; rainEvening: boolean } {
  const evening = hourly.filter((h) => {
    const hr = Number(h.time.slice(11, 13));
    return hr >= 16 && hr <= 22;
  });
  if (evening.length === 0) return { summary: "No hourly data", rainEvening: false };
  const at7 = evening.find((h) => h.time.slice(11, 13) === "19") ?? evening[Math.floor(evening.length / 2)];
  const temp = `${Math.round(at7.tempF)}°F`;

  const wet = evening.filter((h) => h.precipIn >= 0.02 || (h.precipProb ?? 0) >= 60);
  if (wet.length > 0) {
    const hours = wet.map((h) => Number(h.time.slice(11, 13)));
    return { summary: `${precipWord(wet.map((h) => h.code))} ${hourRange(hours)}, ${temp}`, rainEvening: true };
  }
  const trace = evening.filter((h) => h.precipIn > 0 || isPrecipCode(h.code));
  if (trace.length > 0) {
    const hours = trace.map((h) => Number(h.time.slice(11, 13)));
    const word = precipWord(trace.map((h) => h.code)).toLowerCase();
    const sky = skyWord(evening.filter((h) => !trace.includes(h)).map((h) => h.code));
    return { summary: `${sky}, chance of light ${word} ${hourRange(hours)}, ${temp}`, rainEvening: false };
  }
  return { summary: `${skyWord(evening.map((h) => h.code))}, ${temp}`, rainEvening: false };
}

export async function fetchWeather(date: string, lat: number, lon: number, onFail: "throw" | "seasonal" = "throw"): Promise<WeatherFacts> {
  if (beyondForecastHorizon(date)) return seasonalWeather(date);
  const isPast = date < todayLocalDate();
  const hosts = isPast ? ARCHIVE_HOSTS : FORECAST_HOSTS;
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: unknown = null;
  for (const base of hosts) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) break;
    const url = buildUrl(base, date, lat, lon);
    try {
      const data = (await fetchJsonWithTimeout(url, remaining)) as OpenMeteoResponse;
      const hourly = toHourly(data);
      // Need at least the evening hours to be present.
      if (hourly.filter((h) => Number(h.time.slice(11, 13)) >= 16 && Number(h.time.slice(11, 13)) <= 22).length < 7) {
        throw new Error(`incomplete hourly data from ${new URL(base).host}`);
      }
      const { summary, rainEvening } = summarizeWeather(hourly);
      return { date, hourly, summary, rainEvening, source: "open-meteo", sourceUrl: url };
    } catch (err) {
      lastError = err;
    }
  }
  // every host failed: the caller (getTonight) prefers the committed cache; otherwise fall back to climatology
  if (onFail === "seasonal") return seasonalWeather(date);
  throw lastError instanceof Error ? lastError : new Error("Open-Meteo request failed");
}

// ---------- Seasonal fallback (beyond the ~15-day forecast horizon, or when every host fails and nothing is cached) ----------
/** Pittsburgh monthly climate normals (NOAA 1991–2020, approx.): evening temp °F, daily precip inches, chance of a wet hour. */
const PITTSBURGH_SEASONAL: Array<{ tempF: number; precipIn: number; wetChance: number; sky: string; code: number }> = [
  { tempF: 30, precipIn: 0.09, wetChance: 0.45, sky: "Cloudy", code: 3 },    // Jan
  { tempF: 32, precipIn: 0.09, wetChance: 0.42, sky: "Cloudy", code: 3 },    // Feb
  { tempF: 41, precipIn: 0.10, wetChance: 0.42, sky: "Cloudy", code: 3 },    // Mar
  { tempF: 52, precipIn: 0.11, wetChance: 0.40, sky: "Partly cloudy", code: 2 }, // Apr
  { tempF: 62, precipIn: 0.13, wetChance: 0.40, sky: "Partly cloudy", code: 2 }, // May
  { tempF: 70, precipIn: 0.14, wetChance: 0.38, sky: "Partly cloudy", code: 2 }, // Jun
  { tempF: 74, precipIn: 0.14, wetChance: 0.35, sky: "Mostly clear", code: 1 }, // Jul
  { tempF: 73, precipIn: 0.11, wetChance: 0.32, sky: "Mostly clear", code: 1 }, // Aug
  { tempF: 66, precipIn: 0.11, wetChance: 0.30, sky: "Mostly clear", code: 1 }, // Sep
  { tempF: 54, precipIn: 0.09, wetChance: 0.32, sky: "Partly cloudy", code: 2 }, // Oct
  { tempF: 43, precipIn: 0.10, wetChance: 0.40, sky: "Cloudy", code: 3 },    // Nov
  { tempF: 34, precipIn: 0.10, wetChance: 0.45, sky: "Cloudy", code: 3 },    // Dec
];

export const FORECAST_HORIZON_DAYS = 15;

export function daysFromToday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = todayLocalDate().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

export function beyondForecastHorizon(date: string): boolean {
  return daysFromToday(date) > FORECAST_HORIZON_DAYS;
}

/** Climatological "typical evening" for the date: a dry seasonal average (no rain modeled), flagged as cache-sourced. */
export function seasonalWeather(date: string): WeatherFacts {
  const month = Number(date.slice(5, 7)) - 1;
  const s = PITTSBURGH_SEASONAL[month] ?? PITTSBURGH_SEASONAL[10];
  const hourly: HourlyWeather[] = [];
  for (let h = 0; h < 24; h++) {
    // simple diurnal curve: coolest ~6 AM, warmest ~3 PM, evening sits near the monthly mean
    const diurnal = 6 * Math.cos(((h - 15) / 24) * 2 * Math.PI);
    hourly.push({ time: `${date}T${String(h).padStart(2, "0")}:00`, tempF: Math.round((s.tempF + diurnal) * 10) / 10, precipIn: 0, precipProb: Math.round(s.wetChance * 100), windMph: 8, code: s.code });
  }
  const summary = `Seasonal average: ${s.sky.toLowerCase()}, ${s.tempF}°F, ${Math.round(s.wetChance * 100)}% chance of a wet hour (${s.precipIn.toFixed(2)} in/day typical)`;
  return { date, hourly, summary, rainEvening: false, source: "cache", sourceUrl: "https://open-meteo.com/" };
}
