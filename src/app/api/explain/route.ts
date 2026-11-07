// One-line human explanations for event/weather cards, written by the LLM from the structured facts only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { chatJSON, MODEL_FAST } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Out = z.object({ lines: z.array(z.object({ id: z.string(), line: z.string().max(160) })) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { cards?: { id: string; name: string; type: string; start: string; venue: string; distanceMiles: number; attendance: number; impact: string }[] } | null;
  if (!body?.cards?.length) return NextResponse.json({ lines: [] });
  const t0 = Date.now();
  try {
    const out = await chatJSON(Out,
      "You write one-line, plain-English notes for a small restaurant owner near Pittsburgh's North Shore about how each nearby event affects tonight's orders. Use ONLY the facts given (name, type, start, venue, distance, attendance, impact). Do not invent facts. Max 18 words per line. Output {\"lines\":[{\"id\":...,\"line\":...}]}.",
      JSON.stringify(body.cards.slice(0, 8)), { model: MODEL_FAST, timeoutMs: 6000, maxTokens: 600 });
    return NextResponse.json({ ...out, ms: Date.now() - t0, source: "llm" });
  } catch (e) {
    return NextResponse.json({ lines: [], ms: Date.now() - t0, source: "fallback", error: String(e).slice(0, 120) });
  }
}
