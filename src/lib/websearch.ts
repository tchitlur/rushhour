// Server-only: OpenRouter chat completion with the web plugin -> EventFact[] of local happenings.
// Method (per https://openrouter.ai/docs/guides/features/plugins/web-search, Oct 2026): either append
// ":online" to the model slug or pass plugins: [{ id: "web" }] — they are equivalent. We use the explicit
// plugin form so max_results is tunable. One request per call; hard 20 s timeout; any failure -> [].
import { z } from "zod";
import type { EventFact } from "./intake-types";
import { weekdayName } from "./intake-utils";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4o-mini";
const TIMEOUT_MS = 20_000;
const MAX_CONFIDENCE = 0.6;

const WebEvent = z.object({
  name: z.string().min(2),
  type: z.string().min(2),
  start: z.string(),
  end: z.string().optional().nullable(),
  venue: z.string().min(1),
  distanceMiles: z.coerce.number().min(0).max(50).catch(2),
  attendance: z.coerce.number().min(0).catch(500),
  impact: z.enum(["delivery_up", "dine_in_down", "both", "neutral"]).catch("neutral"),
  confidence: z.coerce.number().min(0).max(1).catch(0.4),
  sourceUrl: z.url(),
  explanation: z.string().optional().nullable(),
});
const WebPayload = z.object({ events: z.array(z.unknown()) });

function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const firstBrace = stripped.indexOf("{");
  const firstBracket = stripped.indexOf("[");
  const start = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  if (start === -1) throw new Error("no JSON in response");
  const candidate = stripped.slice(start, stripped.lastIndexOf(stripped[start] === "{" ? "}" : "]") + 1);
  const parsed: unknown = JSON.parse(candidate);
  return Array.isArray(parsed) ? { events: parsed } : parsed;
}

function normalizeLocalIso(value: string | null | undefined, date: string): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m || m[1] !== date) return null;
  return `${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:00`;
}

export async function searchLocalHappenings(date: string): Promise<EventFact[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const weekday = weekdayName(date);
  const system =
    "You are a meticulous local-events researcher for Pittsburgh, PA. Use ONLY the web search results provided to you. " +
    'Reply with ONLY a JSON object of the form {"events":[...]} and no prose, no markdown fences.';
  const user =
    `Find notable public happenings in Pittsburgh, PA on ${weekday} ${date}, between 3 PM and 11 PM local time, within about 3 miles of the ` +
    `North Shore (near Acrisure Stadium / PNC Park): North Side, Downtown, Strip District, Oakland (Pitt / CMU campuses), South Side. ` +
    `Include: university events, holidays and observances, festivals, parades, races or marathons, conventions at the David L. Lawrence ` +
    `Convention Center, Light Up Night, fireworks, markets, large protests or rallies. ` +
    `EXCLUDE ordinary ticketed concerts and pro/college games at Acrisure Stadium, PPG Paints Arena, PNC Park, Stage AE, Benedum Center and Heinz Hall ` +
    `(those are already covered by Ticketmaster). ` +
    `For each item return: name, type (short, e.g. "university event", "holiday", "festival", "parade", "race", "convention"), ` +
    `start and end as local ISO "YYYY-MM-DDTHH:MM:00" on that date, venue, distanceMiles (estimated from the North Shore), attendance (estimated people), ` +
    `impact (one of delivery_up, dine_in_down, both, neutral — effect on a North Shore burger & wings restaurant), confidence (0 to 0.6), ` +
    `and sourceUrl which MUST be an exact URL from the search results that mentions the event. ` +
    `Only include items you actually found a source for on that date. If none, return {"events":[]}.`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://rush-rehearsal.local",
        "X-Title": "Rush Rehearsal",
      },
      body: JSON.stringify({
        model: MODEL,
        plugins: [{ id: "web", max_results: 5 }],
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0,
        max_tokens: 1500,
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const payload = WebPayload.safeParse(extractJson(content));
    if (!payload.success) return [];

    const seen = new Set<string>();
    const out: EventFact[] = [];
    payload.data.events.forEach((raw, i) => {
      const parsed = WebEvent.safeParse(raw);
      if (!parsed.success) return;
      const ev = parsed.data;
      const start = normalizeLocalIso(ev.start, date);
      if (!start) return;
      const key = `${ev.name.trim().toLowerCase()}|${start}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: `web-${date}-${i}`,
        name: ev.name.trim(),
        type: ev.type.trim().toLowerCase(),
        start,
        end: normalizeLocalIso(ev.end, date) ?? undefined,
        venue: ev.venue.trim(),
        distanceMiles: Math.round(ev.distanceMiles * 10) / 10,
        attendance: Math.round(ev.attendance),
        impact: ev.impact,
        confidence: Math.min(MAX_CONFIDENCE, ev.confidence),
        sourceUrl: ev.sourceUrl,
        source: "web_search",
        ...(ev.explanation ? { explanation: ev.explanation.trim() } : {}),
      });
    });
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
