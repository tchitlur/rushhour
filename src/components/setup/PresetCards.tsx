"use client";
// "Start from an example" cards (4 preset restaurants) and "Your restaurants" (saved in localStorage).
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PRESETS, SAVED_KEY, listSavedRestaurants, deleteSavedRestaurant, getCuisine, type SavedRestaurant } from "@/data/templates";

export function PresetCards() {
  return (
    <div className="grid grid-cols-5 gap-3">
      {PRESETS.map(p => (
        <Link key={p.id} href={`/app?r=${p.id}`} className="panel p-4 flex flex-col gap-2 hover:border-[#C3C8CF] transition-colors min-h-[128px]">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-[14px] leading-tight">{p.name}</div>
            {p.demo && <span className="tag text-plan">Demo</span>}
          </div>
          <div className="sub">{getCuisine(p.cuisine).name} · {p.neighborhood}</div>
          <div className="text-[12px] text-fg-2 leading-snug mt-auto">{p.tagline}</div>
          {p.disclaimer && <div className="text-[11px] text-fg-3 leading-snug">{p.disclaimer}</div>}
        </Link>
      ))}
    </div>
  );
}

// localStorage as an external store: re-read when the "storage" event fires or after our own writes.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; };
let cacheRaw: string | null = null; let cacheVal: SavedRestaurant[] = [];
const getSnapshot = (): SavedRestaurant[] => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVED_KEY); } catch { raw = null; }
  if (raw !== cacheRaw) { cacheRaw = raw; cacheVal = listSavedRestaurants(); }
  return cacheVal;
};
const EMPTY: SavedRestaurant[] = [];
const getServerSnapshot = () => EMPTY;

export function SavedList() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!saved.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-fg-2 uppercase tracking-wide">Your restaurants</h2>
      <div className="panel divide-y divide-line">
        {saved.map(r => {
          const c = getCuisine(r.scenario.restaurant?.cuisine);
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <Link href={`/app?r=${encodeURIComponent(r.id)}`} className="flex-1 min-w-0 hover:underline">
                <span className="font-medium text-[13px]">{r.name}</span>
                <span className="sub ml-2">{c.name} · {r.scenario.restaurant?.neighborhood} · {r.scenario.workers.length} staff · {Math.round((r.scenario.channelMix.doordash + r.scenario.channelMix.ubereats) * 100)}% delivery</span>
              </Link>
              <span className="num text-[11px] text-fg-3">{new Date(r.createdAt).toLocaleDateString()}</span>
              <Link href={`/app?r=${encodeURIComponent(r.id)}`} className="btn !py-1 !px-2 text-xs">Open</Link>
              <button className="btn btn-ghost !py-1 !px-2 text-xs text-fg-3" onClick={() => { deleteSavedRestaurant(r.id); listeners.forEach(l => l()); }} title="Remove">Remove</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
