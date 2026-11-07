import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = { ok: true, time: new Date().toISOString() };
  const tm = process.env.TICKETMASTER_API_KEY;
  const or = process.env.OPENROUTER_API_KEY;
  out.ticketmasterKey = tm ? "present" : "missing";
  out.openrouterKey = or ? "present" : "missing";
  return NextResponse.json(out);
}
