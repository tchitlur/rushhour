import { NextResponse, type NextRequest } from "next/server";
import { getTonight } from "@/lib/tonight";
import { isValidDate, todayLocalDate } from "@/lib/intake-utils";
import { RESTAURANT } from "@/lib/intake-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") ?? todayLocalDate();
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const lat = sp.has("lat") ? Number(sp.get("lat")) : RESTAURANT.lat;
  const lon = sp.has("lon") ? Number(sp.get("lon")) : RESTAURANT.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat/lon must be valid coordinates" }, { status: 400 });
  }
  const useWebSearch = sp.get("web") === "1" || sp.get("web") === "true";

  try {
    const data = await getTonight(date, { lat, lon, useWebSearch });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
