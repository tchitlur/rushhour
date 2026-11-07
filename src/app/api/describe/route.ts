// Turn a one-sentence restaurant description into setup-form fields (LLM, structured JSON). On any failure: { fields: null }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { chatJSON, MODEL_FAST } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CUISINES = ["burgers", "pizza", "noodles", "tacos", "cafe", "sushi", "indian", "bowls"] as const;
const NEIGHBORHOODS = ["Oakland", "Lawrenceville", "Strip District", "North Shore", "Squirrel Hill", "Shadyside", "Downtown", "South Side"] as const;

const Fields = z.object({
  name: z.string().max(60).nullish(),
  cuisine: z.enum(CUISINES).nullish(),
  neighborhood: z.enum(NEIGHBORHOODS).nullish(),
  size: z.enum(["small", "medium", "large"]).nullish(),
  deliveryPct: z.number().min(0).max(100).nullish(),
  staffCount: z.number().int().min(1).max(12).nullish(),
  aov: z.number().min(3).max(200).nullish(),
  hoursOpen: z.string().regex(/^\d{1,2}:\d{2}$/).nullish(),
  hoursClose: z.string().regex(/^\d{1,2}:\d{2}$/).nullish(),
});
export type DescribeFields = z.infer<typeof Fields>;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { description?: string } | null;
  const description = (body?.description ?? "").trim().slice(0, 600);
  if (!description) return NextResponse.json({ fields: null });
  const t0 = Date.now();
  try {
    const fields = await chatJSON(Fields,
      `You extract restaurant setup fields from a short description written by a small-restaurant owner in Pittsburgh. Output a JSON object with ONLY these optional keys (omit or null anything not stated or clearly implied): name (string), cuisine (one of ${CUISINES.join(", ")}; map e.g. ramen/pho/wok -> noodles, bakery/coffee -> cafe, salad/poke/grain bowls -> bowls, wings/burgers/American -> burgers), neighborhood (one of ${NEIGHBORHOODS.join(", ")}), size (small/medium/large; small = counter-service under ~40 seats or 2-3 staff, large = 6+ staff or 100+ seats), deliveryPct (0-100 share of orders from DoorDash/Uber Eats; "mostly delivery" = 70, "mostly dine-in/walk-in" = 20), staffCount (integer on a typical night), aov (average order value in dollars), hoursOpen and hoursClose ("HH:MM" 24h). Never invent numbers that were not given or implied.`,
      description, { model: MODEL_FAST, timeoutMs: 8000, maxTokens: 300, retry: false });
    return NextResponse.json({ fields, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ fields: null, ms: Date.now() - t0, error: String(e).slice(0, 120) });
  }
}
